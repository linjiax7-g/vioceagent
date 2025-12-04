# graph/graph.py
from langgraph.graph import StateGraph, END
from graph.state import GraphState
from graph.nodes import router_node, planner_node, rag_retriever_node, web_retriever_node, hybrid_retriever_node, answerer_node
from graph.strategies import retrieval_router_hybrid, retrieval_router_reflection, retrieval_router_autonomous

import logging
import os

logger = logging.getLogger(__name__)

# ============================================================================
# Conditional Routing Strategy
# ============================================================================

def router_edge_logic(state: GraphState) -> str:
    """
    Decide next step after router.
    - general_chat -> answerer (skip retrieval)
    - unsafe -> answerer (skip retrieval)
    - others -> planner
    """
    task = state.get("task", "product_search")
    safety_flags = state.get("safety_flags", [])
    
    if "out_of_scope" in safety_flags or task == "general_chat":
        logger.info("🗣️ Routing: General chat / Out of scope -> Skipping retrieval")
        return "answerer"
        
    if safety_flags:
        logger.info(f"⚠️ Routing: Safety flags {safety_flags} -> Skipping retrieval")
        return "answerer"
        
    return "planner"

# ============================================================================
# Hybrid Conditional Retrieval Graph
# ============================================================================

def _build_graph_hybrid():
    """Create the LangGraph workflow."""
    
    # Initialize graph
    workflow = StateGraph(GraphState)
    
    # Add nodes
    workflow.add_node("router", router_node)
    workflow.add_node("planner", planner_node)
    workflow.add_node("rag_retriever", rag_retriever_node)
    workflow.add_node("web_retriever", web_retriever_node)
    workflow.add_node("hybrid_retriever", hybrid_retriever_node)
    workflow.add_node("answerer", answerer_node)
    
    # Define edges
    workflow.set_entry_point("router")
    
    # NEW: Conditional edge from router
    workflow.add_conditional_edges(
        "router",
        router_edge_logic,
        {
            "planner": "planner",
            "answerer": "answerer"
        }
    )
    
    # Conditional routing after planner
    workflow.add_conditional_edges(
        "planner",
        retrieval_router_hybrid,
        {
            "rag_only": "rag_retriever",
            "web_only": "web_retriever",
            "hybrid": "hybrid_retriever"
        }
    )
    
    workflow.add_edge("rag_retriever", "answerer")
    workflow.add_edge("web_retriever", "answerer")
    workflow.add_edge("hybrid_retriever", "answerer")

    workflow.add_edge("answerer", END)
    
    return workflow



def create_graph(version: str = 'hybrid'):
    """
    Create graph with specified version
    """
    version = version.lower().strip()
    
    # Version registry
    builders = {
        "hybrid": _build_graph_hybrid,
    }
    
    # Get builder
    if version not in builders:
        logger.warning(f"Unknown version '{version}', defaulting to hybrid")
        version = "hybrid"
    
    builder = builders[version]
    
    # Build and compile
    workflow = builder()
    app = workflow.compile()
    
    logger.info(f"Graph {version.upper()} compiled successfully")
    
    return app
