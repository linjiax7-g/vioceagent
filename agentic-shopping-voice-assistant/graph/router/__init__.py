# graph/router/__init__.py
from graph.models.llm import get_llm
from graph.router.prompts import router_prompt
from graph.router.parser import parse_router_output
from langchain_core.runnables import RunnablePassthrough, RunnableLambda

def format_router_input(input_dict: dict) -> dict:
    """Format input for router prompt including chat history."""
    query = input_dict.get("query", "")
    history = input_dict.get("chat_history", [])
    
    history_str = ""
    # Only include last 5 messages to avoid blowing up context
    for msg in history[-5:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        history_str += f"{role}: {content}\n"
    
    return {
        "query": query,
        "chat_history": history_str or "None"
    }

def create_router_chain():
    """Create the router LCEL chain."""
    llm = get_llm()
    
    chain = (
        RunnableLambda(format_router_input)
        | router_prompt
        | llm
        | parse_router_output
    )
    
    return chain

# Singleton pattern
_router_chain = None

def get_router_chain():
    """Get or create router chain (lazy loading)."""
    global _router_chain
    if _router_chain is None:
        _router_chain = create_router_chain()
    return _router_chain
