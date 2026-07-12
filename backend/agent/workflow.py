from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from agent.state import AgentState
from agent.node import extract_metadata_signals, llm_dialogue_analysis, fuse_signals

def build_workflow():
    # Initialize the state graph
    workflow = StateGraph(AgentState)

    # Add the nodes (llm_dialogue_analysis is async)
    workflow.add_node("extract_metadata_signals", extract_metadata_signals)
    workflow.add_node("llm_dialogue_analysis", llm_dialogue_analysis)
    workflow.add_node("fuse_signals", fuse_signals)

    # Set the entry point
    workflow.set_entry_point("extract_metadata_signals")

    # Connect the nodes sequentially
    workflow.add_edge("extract_metadata_signals", "llm_dialogue_analysis")
    workflow.add_edge("llm_dialogue_analysis", "fuse_signals")
    workflow.add_edge("fuse_signals", END)

    # Compile the graph with MemorySaver checkpointer for state memory
    checkpointer = MemorySaver()
    return workflow.compile(checkpointer=checkpointer)

# Compile the graph once with in-memory persistence
compiled_graph = build_workflow()

async def run_transcript_analysis_async(transcript: list, participants: dict, external_metadata: dict, session_id: str = "interview_session_1") -> dict:
    """Invokes the compiled LangGraph workflow asynchronously and returns output predictions."""
    initial_state = {
        "transcript": transcript,
        "participants": participants,
        "external_metadata": external_metadata,
        "signals": {},
        "analysis_history": []
    }
    
    # Configure the thread ID for memory persistence
    config = {"configurable": {"thread_id": session_id}}
    
    # Run the workflow asynchronously
    final_state = await compiled_graph.ainvoke(initial_state, config=config)
    
    return {
        "identified_candidate_role": final_state.get("identified_candidate_role", "candidate"),
        "identified_candidate_id": final_state.get("identified_candidate_id", ""),
        "confidence_score": final_state.get("confidence_score", 50),
        "explanation": final_state.get("explanation", ""),
        "face_match_score": final_state.get("face_match_score", 0),
        "face_match_explanation": final_state.get("face_match_explanation", "Camera offline."),
        "history": final_state.get("analysis_history", [])
    }
