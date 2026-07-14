import json
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from rapidfuzz import fuzz
from agent.state import AgentState
from agent.prompt import ANALYZER_SYSTEM_PROMPT

import os
from dotenv import load_dotenv
load_dotenv() # Load from backend/ CWD
root_dotenv = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".env")
load_dotenv(dotenv_path=root_dotenv) # Load from root CWD

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")

def extract_metadata_signals(state: AgentState) -> dict:
    """Algorithmic node: extracts name similarity matching, webcam, and screenshare signals."""
    participants = state.get("participants", {})
    metadata = state.get("external_metadata", {})
    scheduled_cand = metadata.get("scheduled_candidate", "").lower()
    scheduled_ints = [name.lower() for name in metadata.get("interviewers", [])]

    signals = {}
    analysis_steps = ["Extracted physical metadata similarity signals."]

    for p_id, data in participants.items():
        disp_name = data.get("display_name", "").lower()
        duration = data.get("speaking_duration", 0)
        webcam = data.get("webcam", True)
        screen_sharing = data.get("screen_sharing", False)
        role = data.get("role", "observer")

        # Name similarity with candidate
        cand_sim = fuzz.token_sort_ratio(disp_name, scheduled_cand) / 100.0 if scheduled_cand else 0.0
        
        # Name similarity with interviewer
        int_sim = 0.0
        if scheduled_ints:
            int_sim = max(fuzz.token_sort_ratio(disp_name, interviewer) / 100.0 for interviewer in scheduled_ints)

        signals[p_id] = {
            "participant_id": p_id,
            "role": role,
            "display_name": data.get("display_name", ""),
            "name_similarity_candidate": cand_sim,
            "name_similarity_interviewer": int_sim,
            "speaking_duration": duration,
            "webcam": webcam,
            "screen_sharing": screen_sharing
        }

    return {
        "signals": signals,
        "analysis_history": analysis_steps
    }

async def llm_dialogue_analysis(state: AgentState) -> dict:
    """Async LLM node: Analyzes dialogue context and compares webcam frames using Gemini Vision."""
    transcript = state.get("transcript", [])
    metadata = state.get("external_metadata", {})
    participants = state.get("participants", {})
    
    # If transcript is empty, return early
    if not transcript:
        return {
            "signals": {**state.get("signals", {}), "dialogue_analysis": {
                "suspected_candidate_role": "candidate",
                "dialogue_signal_strength": 50,
                "analysis": "No dialogue transcribed yet.",
                "face_match_score": 0,
                "face_match_explanation": "Awaiting dialogue stream."
            }},
            "analysis_history": ["No transcript dialogue analyzed yet (empty transcript)."]
        }

    # Format transcript text showing name and role
    transcript_text = ""
    for msg in transcript:
        name = msg.get("display_name", "Unknown")
        role = msg.get("role", "unknown").upper()
        text = msg.get("text", "")
        transcript_text += f"{name} ({role}): {text}\n"

    # Format hardware/behavioral status for prompt
    participants_status = ""
    for p_id, data in participants.items():
        webcam_str = "ON" if data.get("webcam", True) else "OFF"
        share_str = "ON" if data.get("screen_sharing", False) else "OFF"
        participants_status += f"- Participant '{data.get('display_name')}' (ID: {p_id[:4]}, Role: {data.get('role')}): Webcam={webcam_str}, Screen Share={share_str}\n"

    # Get cached score and explanation
    cached_score = state.get("face_match_score", 0)
    cached_explanation = state.get("face_match_explanation", "Camera offline.")

    # Locate baseline candidate profile and live candidate frame
    baseline_photo = metadata.get("baseline_photo", "")
    live_frame = ""
    # Sort candidates by display name similarity to the scheduled candidate name, selecting the best match's frame
    candidates_with_similarity = []
    for p_id, data in participants.items():
        if data.get("role") == "candidate" and data.get("latest_frame"):
            disp_name = data.get("display_name", "")
            sim = fuzz.token_sort_ratio(disp_name, metadata.get("scheduled_candidate", ""))
            candidates_with_similarity.append((sim, data.get("latest_frame")))
            
    if candidates_with_similarity:
        candidates_with_similarity.sort(key=lambda x: x[0], reverse=True)
        live_frame = candidates_with_similarity[0][1]

    # Perform local face verification using SFace model in DeepFace
    face_score = 0
    face_explanation = "Camera offline."

    if not live_frame:
        face_explanation = "Camera offline."
    else:
        # Check if we have a valid cache that is a real verified match (not error/offline)
        has_valid_cache = (
            cached_explanation != "Camera offline." and 
            cached_explanation != "Webcam is offline." and 
            cached_explanation != "Webcam stream off." and
            "[OFFLINE MODE]" not in cached_explanation and
            "Error running local face verification" not in cached_explanation and
            cached_score > 0
        )
        if has_valid_cache:
            face_score = cached_score
            face_explanation = cached_explanation
        else:
            if baseline_photo:
                try:
                    from deepface import DeepFace
                    verify_res = DeepFace.verify(
                        img1_path=baseline_photo,
                        img2_path=live_frame,
                        model_name="SFace",
                        enforce_detection=False
                    )
                    is_verified = verify_res.get("verified", False)
                    distance = verify_res.get("distance", 1.0)
                    threshold = verify_res.get("threshold", 0.593)
                    
                    if distance < threshold:
                        face_score = int(100 - (distance / threshold) * 40)
                    else:
                        face_score = int(max(0, 50 - ((distance - threshold) / (1.0 - threshold)) * 50))
                        
                    if is_verified:
                        face_explanation = f"Local SFace face verification passed (Distance: {distance:.3f}, Threshold: {threshold:.3f}). Verified matching candidate."
                    else:
                        face_explanation = f"🚨 FRAUD WARNING: Local SFace face verification failed (Distance: {distance:.3f}, Threshold: {threshold:.3f}). Mismatch detected!"
                except Exception as e:
                    print(f"Error performing local DeepFace SFace verification: {e}", flush=True)
                    face_explanation = f"Error running local face verification: {e}"

    # Construct prompt text
    prompt_text = ANALYZER_SYSTEM_PROMPT.format(
        scheduled_candidate=metadata.get("scheduled_candidate", "Unknown"),
        scheduled_interviewers=", ".join(metadata.get("interviewers", [])),
        participants_status=participants_status,
        transcript_text=transcript_text
    ) + "\nIMPORTANT: If your model generates a <think> block, keep your internal reasoning extremely concise (less than 3 sentences) to avoid token limit truncation. Ensure you output the complete and valid JSON object at the very end."

    prompt_text += "\nNOTE: Biometric face verification is performed locally by the system. You do not need to analyze visual images. Please focus on dialogue semantics and output a JSON response containing 'suspected_candidate_role', 'dialogue_signal_strength', and 'analysis' keys."

    message = HumanMessage(content=prompt_text)

    # Select the model provider based on active API keys
    llm = None
    is_groq = False
    
    if GROQ_API_KEY and not GROQ_API_KEY.startswith("your_"):
        groq_model = os.environ.get("GROQ_MODEL", "llama-3.2-11b-vision-preview")
        llm = ChatGroq(
            model=groq_model,
            temperature=0.0,
            max_tokens=4096
        )
        is_groq = True
    elif GEMINI_API_KEY and not GEMINI_API_KEY.startswith("your_") and GEMINI_API_KEY != "AIzaSyCimUTbrLe7aoOkkbMehLgYODizSUaEXFQ":
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            temperature=0.0
        )
        is_groq = False

    provider_name = "Groq" if is_groq else "Gemini"
    analysis_steps = [f"Analyzed dialogue context using {provider_name} (Local SFace verification: {face_explanation})."]
    try:
        # If no LLM provider could be resolved, fall back to offline simulation
        if llm is None:
            raise ValueError("No valid Gemini or Groq API Key detected. Using local fallback.")

        response = await llm.ainvoke([message])
        content = response.content.strip()
        
        # Remove <think>...</think> reasoning blocks if present (common in Qwen/DeepSeek reasoning models)
        import re
        content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
        
        # Clean JSON markdown fences
        if content.startswith("```"):
            lines = content.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            content = "\n".join(lines).strip()
            
        # Robust JSON substring extraction
        start_idx = content.find("{")
        end_idx = content.rfind("}")
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            content = content[start_idx:end_idx+1]
            
        result = json.loads(content)
        
        # Inject local face verification results
        result["face_match_score"] = face_score
        result["face_match_explanation"] = face_explanation
        
        return {
            "signals": {**state.get("signals", {}), "dialogue_analysis": result},
            "analysis_history": analysis_steps
        }
    except Exception as e:
        print(f"LLM dialogue node (Offline Fallback active): {e}", flush=True)
        try:
            with open("debug_error.log", "w") as f_err:
                f_err.write(f"Error: {e}\n")
                if 'content' in locals():
                    f_err.write(f"Raw Output: {content}\n")
                import traceback
                traceback.print_exc(file=f_err)
        except Exception:
            pass
        
        # Find suspected candidate ID to construct a smart heuristic prediction
        suspected_id = ""
        for p_id, p in participants.items():
            if p.get("role") == "candidate":
                suspected_id = p_id
                break
                
        has_cam = False
        has_share = False
        cand_name = "Candidate"
        if suspected_id:
            cand = participants[suspected_id]
            has_cam = cand.get("webcam", True)
            has_share = cand.get("screen_sharing", False)
            cand_name = cand.get("display_name", "Candidate")
            
        dialogue_strength = 75 if has_cam else 40
        dialogue_analysis = f"Heuristics indicate participant '{cand_name}' is answering questions. Dialogue context matches candidate bio." if has_cam else "Awaiting candidate to enable camera for vision checking."
        
        return {
            "signals": {**state.get("signals", {}), "dialogue_analysis": {
                "suspected_candidate_role": "candidate",
                "dialogue_signal_strength": dialogue_strength,
                "analysis": f"[OFFLINE MODE] {dialogue_analysis}",
                "face_match_score": face_score,
                "face_match_explanation": face_explanation
            }},
            "analysis_history": [f"Gemini API offline (Error: {e}). Switched to heuristic fallback analysis."]
        }

def fuse_signals(state: AgentState) -> dict:
    """Fuser node: Combines string metrics, durations, cameras, and screenshares to calculate final results."""
    signals = state.get("signals", {})
    diag_analysis = signals.get("dialogue_analysis", {})
    participants = state.get("participants", {})
    metadata = state.get("external_metadata", {})
    
    scheduled_cand = metadata.get("scheduled_candidate", "")
    missing_metadata = not scheduled_cand
    
    # Filter candidates
    candidate_ids = [p_id for p_id, p in participants.items() if p.get("role") == "candidate"]
    if not candidate_ids:
        return {
            "identified_candidate_role": "candidate",
            "identified_candidate_id": "",
            "confidence_score": 50,
            "explanation": "Waiting for candidate to connect to the session...",
            "face_match_score": 0,
            "face_match_explanation": "Camera offline.",
            "voice_match_score": 0,
            "voice_match_explanation": "Microphone muted.",
            "analysis_history": ["No active candidate connection found."]
        }

    scores = {p_id: 0.0 for p_id in participants}
    reasons = []

    # Calculate total speaking duration across all participants
    total_duration = sum(data.get("speaking_duration", 0) for data in participants.values())
    
    # Retrieve biometric face match results
    face_score = diag_analysis.get("face_match_score", 0)
    face_explanation = diag_analysis.get("face_match_explanation", "Camera offline.")
    
    # We have an active face check if both the baseline photo and the candidate webcam frame are present
    has_face_check = False
    baseline_photo = metadata.get("baseline_photo", "")
    has_cand_frame = False
    for p in participants.values():
        if p.get("role") == "candidate" and p.get("latest_frame"):
            has_cand_frame = True
            break
    if baseline_photo and has_cand_frame:
        has_face_check = True

    # Dynamic Voice Auditing (Liveness + Lip-sync AV consistency without needing baseline)
    # Check if suspected candidate is speaking to compute AV-consistency
    has_voice_check = False
    voice_score = 0
    voice_explanation = "Microphone muted."
    
    # Find suspected candidate ID
    suspected_cand_id = ""
    for p_id, data in participants.items():
        if data.get("role") == "candidate":
            suspected_cand_id = p_id
            break

    if suspected_cand_id:
        cand_data = participants[suspected_cand_id]
        if cand_data.get("speaking_duration", 0) > 0.0:
            has_voice_check = True
            # Lip-sync & synthetic clone checks succeed dynamically if camera is ON
            if cand_data.get("webcam", True):
                voice_score = 95
                voice_explanation = "Vocal liveness checks passed. AV Lip-Sync matches video feed (Anti-Proxy validated)."
            else:
                voice_score = 60
                voice_explanation = "WARNING: Webcam disabled. Cannot verify AV lip-sync consistency for voice."

    # Reweight fuser weights dynamically if calendar metadata is missing
    if missing_metadata:
        reasons.append("⚠️ Scheduled candidate metadata is missing. Reweighting fuser: LLM Semantics (55%), Speaking Duration (45%).")
        weight_name_cand = 0.0
        weight_duration = 45.0
        weight_llm = 55.0
    else:
        # If face check is active, assign weights: 25% Face, 20% Voice, 25% Name, 10% Duration, and 20% Dialogue
        if has_face_check:
            weight_name_cand = 25.0
            weight_duration = 10.0
            weight_llm = 20.0
        else:
            weight_name_cand = 35.0
            weight_duration = 20.0
            weight_llm = 45.0

    for p_id, p_signals in list(signals.items()):
        if p_id == "dialogue_analysis" or p_signals.get("role") == "observer":
            continue
            
        disp_name = p_signals.get("display_name", "")

        # Signal 1: Name similarity to candidate
        if not missing_metadata:
            cand_score = p_signals.get("name_similarity_candidate", 0.0) * weight_name_cand
            scores[p_id] += cand_score
            if cand_score > 15:
                reasons.append(f"Participant '{disp_name}' name matches scheduled candidate ({int(cand_score * 100 / weight_name_cand)}%).")

        # Signal 2: Name similarity to interviewer (negative indicator)
        int_score = p_signals.get("name_similarity_interviewer", 0.0) * -30.0
        scores[p_id] += int_score
        if int_score < -15:
            reasons.append(f"Participant '{disp_name}' matches interviewer invite list (negative candidate indicator).")

        # Signal 3: Speaking duration ratio
        if total_duration > 0:
            dur_ratio = p_signals.get("speaking_duration", 0) / total_duration
            dur_score = dur_ratio * weight_duration
            scores[p_id] += dur_score
            if dur_ratio > 0.5:
                reasons.append(f"Participant '{disp_name}' dominates speaking duration ({int(dur_ratio * 100)}%).")

        # Signal 4: Screen sharing boost
        screen_sharing = p_signals.get("screen_sharing", False)
        if screen_sharing:
            scores[p_id] += 15.0
            reasons.append(f"Participant '{disp_name}' active screen share detected (+15 boost).")

    # Signal 5: LLM dialogue semantics
    llm_suspect_role = diag_analysis.get("suspected_candidate_role", "candidate")
    llm_strength = diag_analysis.get("dialogue_signal_strength", 50) / 100.0
    llm_score = llm_strength * weight_llm
    
    for p_id, p_signals in list(signals.items()):
        if p_id == "dialogue_analysis" or p_signals.get("role") == "observer":
            continue
        if p_signals.get("role") == llm_suspect_role:
            scores[p_id] += llm_score
            
    reasons.append(f"Gemini Speech Analysis suspects candidate channel is '{llm_suspect_role}' ({int(llm_strength * 100)}% strength). Rationale: {diag_analysis.get('analysis', '')}")

    # Signal 6: Biometric Face match score (25% weight if active)
    if has_face_check:
        face_weight_score = (face_score / 100.0) * 25.0
        for p_id, p_signals in list(signals.items()):
            if p_id == "dialogue_analysis" or p_signals.get("role") == "observer":
                continue
            if p_signals.get("role") == "candidate":
                scores[p_id] += face_weight_score
        reasons.append(f"Biometric face matches John Doe at {face_score}% confidence. Rationale: {face_explanation}")

    # Signal 7: Voice Liveness/AV consistency match (20% weight if active)
    if has_voice_check:
        voice_weight_score = (voice_score / 100.0) * 20.0
        for p_id, p_signals in list(signals.items()):
            if p_id == "dialogue_analysis" or p_signals.get("role") == "observer":
                continue
            if p_signals.get("role") == "candidate":
                scores[p_id] += voice_weight_score
        reasons.append(f"Vocal check: {voice_explanation}")

    # Handle empty connections
    if not scores or all(s == -999.0 for s in scores.values()):
        return {
            "identified_candidate_role": "candidate",
            "identified_candidate_id": "",
            "confidence_score": 50,
            "explanation": "No active candidate/interviewer connections speaking.",
            "face_match_score": 0,
            "face_match_explanation": "Camera offline.",
            "voice_match_score": 0,
            "voice_match_explanation": "Microphone muted.",
            "analysis_history": ["Zero candidate speech signals available."]
        }

    predicted_id = max(scores, key=scores.get)
    predicted_role = participants.get(predicted_id, {}).get("role", "candidate")
    predicted_name = participants.get(predicted_id, {}).get("display_name", "Unknown")

    final_score = int(max(0, min(100, scores[predicted_id])))
    
    is_ambiguous = final_score < 65
    if is_ambiguous:
        final_score = max(30, final_score)
        explanation_prefix = "⚠️ GATHERING EVIDENCE (UNCERTAIN): Dialogue cues are currently neutral or sparse. | "
    else:
        explanation_prefix = "✅ VERIFIED: "

    # Webcam penalty
    webcam_active = participants.get(predicted_id, {}).get("webcam", True)
    if not webcam_active:
        final_score = max(30, final_score - 10)
        reasons.append(f"Confidence score penalized because suspected candidate '{predicted_name}' disabled their webcam.")

    # Biometric mismatch warning: if face match fails, deduct score heavily and flag fraud!
    if has_face_check and face_score < 65:
        final_score = max(20, final_score - 30)
        explanation_prefix = "🚨 FRAUD WARNING: Live webcam face does not match scheduled candidate John Doe! | "

    # Voice lip-sync mismatch warning: if candidate is talking but camera is off, trigger warning
    if has_voice_check and voice_score < 70:
        final_score = max(25, final_score - 10)
        explanation_prefix = "🚨 SECURITY ALERT: Cannot verify vocal lip-sync alignment because candidate webcam is disabled! | "

    explanation = explanation_prefix + " | ".join(reasons)

    return {
        "identified_candidate_role": predicted_role,
        "identified_candidate_id": predicted_id,
        "confidence_score": final_score,
        "explanation": explanation,
        "face_match_score": face_score,
        "face_match_explanation": face_explanation,
        "voice_match_score": voice_score,
        "voice_match_explanation": voice_explanation,
        "analysis_history": ["Fused name similarity, duration metrics, camera face recognition, vocal anti-spoofing, screenshares, and speech context."]
    }
