import json
import uuid
import time
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.session import session

router = APIRouter()

@router.websocket("/ws/transcribe")
async def websocket_endpoint(websocket: WebSocket):
    # Retrieve query parameters sent from client hook
    role = websocket.query_params.get("role", "interviewer")
    name = websocket.query_params.get("name", "")
    participant_id = websocket.query_params.get("participant_id", "")
    
    if not participant_id:
        participant_id = str(uuid.uuid4())
        
    print(f"Client connected: {role} (Name: {name}, ID: {participant_id})")
    await session.connect(participant_id, role, name, websocket)
    
    # Broadcast updated participant registry to everyone
    await session.broadcast({
        "type": "metrics_update",
        "participants": session.participants,
        "analysis": session.latest_analysis
    })
    
    try:
        while True:
            message_text = await websocket.receive_text()
            if not message_text:
                continue
            
            data = json.loads(message_text)
            msg_type = data.get("type")
            
            if msg_type == "status_change":
                webcam = data.get("webcam", True)
                screen_sharing = data.get("screen_sharing", False)
                session.update_status(participant_id, webcam, screen_sharing)
                
                # Re-run analysis dynamically on hardware toggle
                analysis = await session.run_agent_analysis()
                await session.broadcast({
                    "type": "metrics_update",
                    "participants": session.participants,
                    "analysis": analysis
                })
                continue

            elif msg_type == "name_change":
                new_name = data.get("display_name", "").strip()
                if new_name:
                    session.update_name(participant_id, new_name)
                    print(f"Participant {participant_id[:4]} changed display name to '{new_name}'")
                    
                    # Re-run similarity string metrics
                    analysis = await session.run_agent_analysis()
                    await session.broadcast({
                        "type": "update",
                        "history": session.conversation_history,
                        "participants": session.participants,
                        "analysis": analysis
                    })
                continue

            elif msg_type == "confirm_candidate":
                candidate_id = data.get("participant_id", "")
                if candidate_id:
                    session.save_feedback(candidate_id)
                    print(f"Recruiter verified Candidate Participant ID: {candidate_id}")
                    # Broadcast log verification success status
                    await session.broadcast({
                        "type": "feedback_logged",
                        "status": "success",
                        "confirmed_candidate_id": candidate_id
                    })
            if msg_type == "video_frame":
                image_data = data.get("image", "")
                if image_data:
                    session.update_frame(participant_id, image_data)
                    # Broadcast frame update immediately to frontend so video element updates instantly
                    await session.broadcast({
                        "type": "metrics_update",
                        "participants": session.participants,
                        "analysis": session.latest_analysis
                    })
                    
                    # Offload expensive agent vision analysis to non-blocking background thread task
                    async def run_bg_frame_analysis():
                        analysis = await session.run_agent_analysis()
                        await session.broadcast({
                            "type": "metrics_update",
                            "participants": session.participants,
                            "analysis": analysis
                        })
                    
                    asyncio.create_task(run_bg_frame_analysis())
                continue

            text = data.get("text", "").strip()
            if not text:
                continue
            
            if msg_type == "interim":
                if not session.speech_start_times.get(participant_id):
                    session.speech_start_times[participant_id] = time.time()
                
                # Broadcast streaming interim update
                await session.broadcast({
                    "type": "interim_update",
                    "participant_id": participant_id,
                    "role": role,
                    "text": text
                })
                
            elif msg_type == "final":
                start_time = session.speech_start_times.get(participant_id)
                if start_time:
                    elapsed = time.time() - start_time
                    elapsed = max(1.0, min(15.0, elapsed))
                    session.increment_duration(participant_id, elapsed)
                    session.speech_start_times[participant_id] = 0.0
                else:
                    session.increment_duration(participant_id, max(1.0, len(text.split()) * 0.4))
                
                print(f"[{role.upper()} FINAL - {name}]: {text}")
                session.add_transcript(participant_id, role, text)
                
                await session.broadcast({
                    "type": "update",
                    "history": session.conversation_history,
                    "participants": session.participants,
                    "analysis": session.latest_analysis
                })
                
                async def run_bg_analysis():
                    analysis = await session.run_agent_analysis()
                    await session.broadcast({
                        "type": "metrics_update",
                        "participants": session.participants,
                        "analysis": analysis
                    })
                
                asyncio.create_task(run_bg_analysis())
                
    except WebSocketDisconnect:
        print(f"Client disconnected: {role} (ID: {participant_id})")
        session.disconnect(participant_id)
        analysis = await session.run_agent_analysis()
        await session.broadcast({
            "type": "metrics_update",
            "participants": session.participants,
            "analysis": analysis
        })
    except Exception as e:
        print(f"WebSocket error for {participant_id}: {e}")
        session.disconnect(participant_id)
        analysis = await session.run_agent_analysis()
        await session.broadcast({
            "type": "metrics_update",
            "participants": session.participants,
            "analysis": analysis
        })

@router.post("/api/reset")
async def reset_conversation():
    session.conversation_history.clear()
    session.session_id = f"interview_session_{uuid.uuid4().hex}"
    session.speech_start_times.clear()
    for p_id in session.participants:
        session.participants[p_id]["speaking_duration"] = 0.0
        session.participants[p_id]["webcam"] = True
        session.participants[p_id]["screen_sharing"] = False
    session.latest_analysis = {
        "identified_candidate_role": "candidate",
        "identified_candidate_id": "",
        "confidence_score": 50,
        "explanation": "Conversation reset."
    }
    await session.broadcast({
        "type": "reset",
        "participants": session.participants,
        "analysis": session.latest_analysis
    })
    return {"status": "success"}
