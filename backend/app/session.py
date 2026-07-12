import time
from typing import Dict, List, Any
from fastapi import WebSocket
from app.config import EXTERNAL_METADATA
from agent.workflow import run_transcript_analysis_async

def merge_texts(old_text: str, new_text: str) -> str:
    """Finds word overlap between the end of old_text and start of new_text, merging them cleanly."""
    if not old_text:
        return new_text
    if not new_text:
        return old_text
    
    old_words = old_text.split()
    new_words = new_text.split()
    
    max_overlap = min(len(old_words), len(new_words))
    for overlap in range(max_overlap, 0, -1):
        if old_words[-overlap:] == new_words[:overlap]:
            return old_text + " " + " ".join(new_words[overlap:])
            
    return old_text + " " + new_text

class InterviewSession:
    def __init__(self):
        # Maps participant_id -> WebSocket
        self.active_connections: Dict[str, WebSocket] = {}
        self.conversation_history: List[Dict[str, Any]] = []
        self.session_id: str = "interview_session_1"
        self.speech_start_times: Dict[str, float] = {}
        # Maps participant_id -> Participant metadata dict
        self.participants: Dict[str, Dict[str, Any]] = {}
        self.latest_analysis: Dict[str, Any] = {
            "identified_candidate_role": "candidate",
            "identified_candidate_id": "",
            "confidence_score": 50,
            "explanation": "No speech recorded yet.",
            "face_match_score": 0,
            "face_match_explanation": "Webcam stream off."
        }

    async def connect(self, participant_id: str, role: str, name: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[participant_id] = websocket
        
        # If the participant connects for the first time, register them
        if participant_id not in self.participants:
            self.participants[participant_id] = {
                "participant_id": participant_id,
                "role": role,
                "display_name": name or f"User {participant_id[:4]}",
                "speaking_duration": 0.0,
                "webcam": True,
                "screen_sharing": False,
                "latest_frame": ""
            }
        else:
            # Reconnection: update active socket & display name if passed
            if name:
                self.participants[participant_id]["display_name"] = name
            self.participants[participant_id]["role"] = role

        # Send current session state to the newly connected user
        await websocket.send_json({
            "type": "session_init",
            "history": self.conversation_history,
            "participants": self.participants,
            "analysis": self.latest_analysis,
            "metadata": EXTERNAL_METADATA
        })

    def disconnect(self, participant_id: str):
        if participant_id in self.active_connections:
            del self.active_connections[participant_id]
        if participant_id in self.participants:
            del self.participants[participant_id]
        if participant_id in self.speech_start_times:
            del self.speech_start_times[participant_id]

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections.values()):
            try:
                await connection.send_json(message)
            except Exception:
                pass

    def add_transcript(self, participant_id: str, role: str, text: str):
        display_name = self.participants.get(participant_id, {}).get("display_name", "Unknown")
        
        if self.conversation_history and self.conversation_history[-1].get("participant_id") == participant_id:
            old_text = self.conversation_history[-1]["text"]
            self.conversation_history[-1]["text"] = merge_texts(old_text, text)
        else:
            item = {
                "participant_id": participant_id,
                "role": role,
                "display_name": display_name,
                "text": text
            }
            self.conversation_history.append(item)

    def increment_duration(self, participant_id: str, seconds: float):
        if participant_id in self.participants:
            self.participants[participant_id]["speaking_duration"] += seconds

    def update_status(self, participant_id: str, webcam: bool, screen_sharing: bool):
        if participant_id in self.participants:
            self.participants[participant_id]["webcam"] = webcam
            self.participants[participant_id]["screen_sharing"] = screen_sharing

    def update_name(self, participant_id: str, display_name: str):
        if participant_id in self.participants:
            self.participants[participant_id]["display_name"] = display_name
            # Retroactively update names in history to keep logs accurate
            for msg in self.conversation_history:
                if msg.get("participant_id") == participant_id:
                    msg["display_name"] = display_name

    def update_frame(self, participant_id: str, image_data: str):
        if participant_id in self.participants:
            self.participants[participant_id]["latest_frame"] = image_data

    def save_feedback(self, candidate_id: str):
        """Saves verified identity data to a feedback log for offline model learning."""
        feedback_item = {
            "timestamp": time.time(),
            "session_id": self.session_id,
            "history": self.conversation_history,
            "participants": self.participants,
            "confirmed_candidate_id": candidate_id,
            "metadata": EXTERNAL_METADATA
        }
        import json
        try:
            try:
                with open("feedback_log.json", "r") as f:
                    data = json.load(f)
            except Exception:
                data = []
            data.append(feedback_item)
            with open("feedback_log.json", "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving feedback log: {e}")

    async def run_agent_analysis(self):
        """Runs the LangGraph agent asynchronously to analyze the transcript across all participants."""
        try:
            result = await run_transcript_analysis_async(
                transcript=self.conversation_history,
                participants=self.participants,
                external_metadata=EXTERNAL_METADATA,
                session_id=self.session_id
            )
            self.latest_analysis = result
        except Exception as e:
            print(f"Error executing LangGraph workflow: {e}")
            self.latest_analysis = {
                "identified_candidate_role": "candidate",
                "identified_candidate_id": "",
                "confidence_score": 30,
                "explanation": f"Workflow execution failed: {e}",
                "face_match_score": 0,
                "face_match_explanation": f"Workflow exception: {e}"
            }
        return self.latest_analysis

session = InterviewSession()
