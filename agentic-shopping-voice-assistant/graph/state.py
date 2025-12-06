# graph/state.py
from typing import TypedDict, List, Annotated, Optional
from langgraph.graph import add_messages
import operator

class GraphState(TypedDict):
    # Input
    query: str
    original_query: Optional[str] # Original query in user's language
    original_language: Optional[str] # Detected language of the query
    chat_history: List[dict]  # List of {"role": "user"|"assistant", "content": "..."}
    seen_product_ids: List[str] # List of product IDs already shown to user
    
    # Router outputs
    task: str  # One of: "product_search", "comparison", "recommendation", "availability_check", "general_chat"
    constraints: dict  # Contains: product, min_price, max_price, material, brand
    safety_flags: List[str]  # Filtered to valid flags only
    
    # Planner outputs
    plan: dict # Contains: sources, retrieval_fields, comparison_criteria, filters
    
    # Retriever outputs
    retrieved_docs: List[dict]
    
    # Answerer outputs
    answer: str
    citations: List[str]
    
    # Logging
    # step_log: Annotated[List[dict], operator.add]  # Accumulate logs
    step_log: List[dict] 
