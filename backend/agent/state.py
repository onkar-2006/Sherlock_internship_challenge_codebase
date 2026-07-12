from typing import TypedDict, List, Dict, Any, Annotated
import operator

class AgentState(TypedDict):
    # Inputs
    transcript: List[Dict[str, str]]       # list of {"role": "interviewer" | "candidate", "text": "..."}
    participants: Dict[str, Dict[str, Any]]  # e.g., {"interviewer": {"speaking_duration": 4.5, "webcam": True}, "candidate": ...}
    external_metadata: Dict[str, Any]      # e.g., {"scheduled_candidate": "John Doe", "interviewers": ["Alice Smith"]}
    
    # Intermediate computed signals
    signals: Dict[str, Any]
    analysis_history: Annotated[List[str], operator.add]
    
    # Outputs
    identified_candidate_role: str        # "interviewer" or "candidate"
    identified_candidate_id: str          # Connection UUID of the candidate
    confidence_score: int                 # 0 to 100
    explanation: str                      # Detail of why the decision was made
    
    # Biometric Face Outputs
    face_match_score: int                 # 0 to 100 face comparison match score
    face_match_explanation: str           # Verbal logs explaining face trait verification details
    
    # Biometric Voice Outputs
    voice_match_score: int                # 0 to 100 voice fingerprint match score
    voice_match_explanation: str          # Verbal logs explaining voice trait verification details
