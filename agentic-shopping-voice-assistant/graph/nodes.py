
from typing import Any, Dict
from graph.state import GraphState
from graph.router import get_router_chain
from graph.planner import get_planner_chain
from graph.retriever import retrieve_products, retrieve_from_rag, retrieve_from_web
from graph.answerer import get_answerer_chain
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

PRICE_CHECK_KEYWORDS = [
    "current price",
    "latest price",
    "most recent price",
    "price right now",
    "price now",
    "price today",
    "price currently",
    "recent price",
    "price update"
]


def _is_price_check_query(query: str) -> bool:
    q = query.lower()
    return any(keyword in q for keyword in PRICE_CHECK_KEYWORDS)


def _enforce_availability_plan(state: GraphState, plan: Dict[str, Any]) -> Dict[str, Any]:
    """Force availability_check tasks to use live web search."""
    if state.get("task") != "availability_check":
        return plan

    normalized_plan = dict(plan)
    normalized_plan["sources"] = ["web_search"]

    filters = dict(normalized_plan.get("filters") or {})
    constraints = state.get("constraints") or {}

    for key in ("min_price", "max_price", "material", "brand", "category"):
        if key in constraints and constraints[key] is not None and key not in filters:
            filters[key] = constraints[key]

    normalized_plan["filters"] = filters
    return normalized_plan


def _generate_search_query(state: GraphState) -> str:
    """
    Generate a better search query based on constraints if available.
    This fixes issues where user says "find two more" and semantic search fails.
    """
    constraints = state.get("constraints", {})
    original_query = state.get("query", "")
    
    # If we have a specific product identified, construct a query from it
    if constraints.get("product"):
        parts = []
        
        # Brand
        brands = constraints.get("brand", [])
        if brands and isinstance(brands, list):
            parts.extend(brands)
        elif brands and isinstance(brands, str):
            parts.append(brands)
            
        # Material/Attribute
        if constraints.get("material"):
            parts.append(constraints["material"])
            
        # Product Name/Category
        parts.append(constraints["product"])
        
        search_query = " ".join(parts)
        logger.info(f"🔄 Rewrote query: '{original_query}' -> '{search_query}'")
        return search_query
        
    return original_query


# ============================================================
#  Router Node
# ============================================================

def router_node(state: GraphState) -> GraphState:
    """
    Use router LLM to classify task + constraints.
    Ensure price-check queries trigger availability_check so we hit live data.
    """
    query = state["query"]
    price_check = _is_price_check_query(query)

    try:
        router_chain = get_router_chain()
        result = router_chain.invoke({
            "query": query,
            "chat_history": state.get("chat_history", [])
        })
        constraints = result.constraints.model_dump(exclude_none=True)
        if price_check and "product" not in constraints and result.constraints.product is None:
            constraints["product"] = query

        state["task"] = "availability_check" if price_check else result.task
        state["constraints"] = constraints
        state["safety_flags"] = result.safety_flags

        state["step_log"].append({
            "node": "router",
            "input": query,
            "output": {
                "task": state["task"],
                "constraints": state["constraints"],
                "safety_flags": state["safety_flags"],
                "reasoning": getattr(result, "reasoning", None)
            },
            "success": True
        })
        return state

    except Exception as e:
        logger.error(f"Router error: {e}", exc_info=True)

        q = query.lower()
        if price_check or any(x in q for x in ["now", "today", "current"]):
            state["task"] = "availability_check"
        else:
            state["task"] = "product_search"

        state["constraints"] = state.get("constraints") or {}
        if price_check and "product" not in state["constraints"]:
            state["constraints"]["product"] = query
        state["safety_flags"] = []

        state["step_log"].append({
            "node": "router",
            "error": str(e),
            "fallback_reason": "router_chain_failed",
            "task_after_fallback": state["task"],
            "success": False
        })

        return state


# ============================================================
#  Planner Node
# ============================================================

def planner_node(state: GraphState) -> GraphState:
    """
    Create retrieval plan.
    If planner LLM fails → also falls back using lightweight rules.
    """
    try:
        planner_chain = get_planner_chain()

        chain_input = {
            "query": state["query"],
            "task": state["task"],
            "constraints": state["constraints"]
        }
        plan = planner_chain.invoke(chain_input)
        plan = _enforce_availability_plan(state, plan)

        state["plan"] = plan

        state["step_log"].append({
            "node": "planner",
            "input": chain_input,
            "output": plan,
            "success": True
        })
        return state

    except Exception as e:
        logger.error(f"Planner error: {e}", exc_info=True)

        q = state["query"].lower()

        if any(x in q for x in ["now", "today", "current"]):
            sources = ["web_search"]
        else:
            sources = ["private_rag"]

        # Attempt to recover filters from constraints to avoid losing context
        constraints = state.get("constraints") or {}
        filters = {}
        for key in ["min_price", "max_price", "brand", "material", "category"]:
            if constraints.get(key):
                filters[key] = constraints[key]

        plan = {
            "sources": sources,
            "retrieval_fields": ["title", "brand", "price", "rating"],
            "comparison_criteria": ["price", "rating"],
            "filters": filters
        }
        plan = _enforce_availability_plan(state, plan)
        state["plan"] = plan

        state["step_log"].append({
            "node": "planner",
            "error": str(e),
            "fallback_reason": "planner_chain_failed",
            "plan_after_fallback": plan,
            "success": False
        })

        return state


# ============================================================
#  Private RAG Retriever Node
# ============================================================

def rag_retriever_node(state: GraphState) -> GraphState:
    try:
        plan = state["plan"]
        # Use rewritten query based on constraints if available
        query = _generate_search_query(state)
        filters = plan.get("filters", {}) or {}
        
        # Get quantity from constraints, default to 3, max 20
        constraints = state.get("constraints", {})
        target_k = constraints.get("quantity") if constraints.get("quantity") else 3
        target_k = min(target_k, 20)  # Cap at 20

        # Calculate fetch amount: target + seen + buffer to allow filtering
        seen_ids = set(state.get("seen_product_ids", []))
        fetch_k = target_k + len(seen_ids) + 5
        fetch_k = min(fetch_k, 50) # Hard cap for retrieval

        logger.info(f"[RAG Node] Fetching {fetch_k} docs with query '{query}' (Target: {target_k}, Seen: {len(seen_ids)})")
        
        raw_docs = retrieve_from_rag(query=query, filters=filters, k=fetch_k)
        
        # Filter out seen products
        docs = []
        for doc in raw_docs:
            doc_id = str(doc.get('doc_id', ''))
            if doc_id and doc_id not in seen_ids:
                docs.append(doc)
            if len(docs) >= target_k:
                break
        
        # Fallback to web search if RAG doesn't have enough results
        if len(docs) < target_k:
            logger.info(f"[RAG Node] Only found {len(docs)}/{target_k} new results in RAG, triggering web search fallback...")
            web_docs = retrieve_from_web(query=query, filters=filters, k=target_k - len(docs))
            # Note: Web search filtering is harder as IDs might not match, but we assume web search is fresh
            docs.extend(web_docs)
            logger.info(f"[RAG Node] After web fallback: {len(docs)} total results")
        
        state["retrieved_docs"] = docs

        state["step_log"].append({
            "node": "rag_retriever",
            "input": {"query": query, "filters": filters},
            "output": {
                "num_docs": len(docs),
                "source": "private_rag_with_web_fallback",
            },
            "success": True
        })

    except Exception as e:
        logger.error(f"[RAG Node] RAG Retriever error: {e}", exc_info=True)
        state["retrieved_docs"] = []
        state["step_log"].append({
            "node": "rag_retriever",
            "error": str(e),
            "success": False
        })

    return state


# ============================================================
#  Web Retriever Node
# ============================================================

def web_retriever_node(state: GraphState) -> GraphState:
    try:
        plan = state["plan"]
        # Use rewritten query
        query = _generate_search_query(state)
        filters = plan.get("filters", {}) or {}
        
        # Get quantity from constraints, default to 3, max 20
        constraints = state.get("constraints", {})
        target_k = constraints.get("quantity") if constraints.get("quantity") else 3
        target_k = min(target_k, 20)  # Cap at 20

        # Web search typically returns fresh results, but we can still request a bit more
        # Since web search is expensive/slow, we don't want to over-fetch too much
        docs = retrieve_from_web(query=query, filters=filters, k=target_k)
        state["retrieved_docs"] = docs
        
        # Log products retrieved from web
        logger.info(f"[Web Node] Retrieved products ({len(docs)}):")
        for i, p in enumerate(docs[:5], 1):  # Log first 5
            logger.info(f"  [{i}] {p.get('title', 'N/A')} - ${p.get('price', 'N/A')}")

        state["step_log"].append({
            "node": "web_retriever",
            "input": {"query": query, "filters": filters},
            "output": {
                "num_docs": len(docs),
                "source": "web",
            },
            "success": True
        })

    except Exception as e:
        logger.error(f"[Web Node] Web Retriever error: {e}", exc_info=True)
        state["retrieved_docs"] = []
        state["step_log"].append({
            "node": "web_retriever",
            "error": str(e),
            "success": False
        })

    return state


# ============================================================
#  Hybrid Node
# ============================================================

def hybrid_retriever_node(state: GraphState) -> GraphState:
    try:
        plan = state["plan"]
        # Use rewritten query
        query = _generate_search_query(state)
        filters = plan.get("filters", {}) or {}
        
        # Get quantity from constraints, default to 3, max 20
        constraints = state.get("constraints", {})
        target_k = constraints.get("quantity") if constraints.get("quantity") else 3
        target_k = min(target_k, 20)  # Cap at 20
        
        # Calculate fetch amount for RAG
        seen_ids = set(state.get("seen_product_ids", []))
        fetch_k = target_k + len(seen_ids) + 5
        fetch_k = min(fetch_k, 50)

        # Request from each source
        rag_docs_raw = retrieve_from_rag(query=query, filters=filters, k=fetch_k)
        web_docs = retrieve_from_web(query=query, filters=filters, k=target_k) # Web is usually fresh
        
        # Filter RAG docs
        rag_docs = []
        for doc in rag_docs_raw:
            doc_id = str(doc.get('doc_id', ''))
            if doc_id and doc_id not in seen_ids:
                rag_docs.append(doc)
        
        # Intelligent merging strategy
        if len(rag_docs) == 0:
            # No RAG results, use only web
            all_docs = web_docs[:target_k]
        elif len(web_docs) == 0:
            # No web results, use only RAG
            all_docs = rag_docs[:target_k]
        else:
            # Both have results - merge with diversity
            all_docs = []
            rag_idx = 0
            web_idx = 0
            
            # Interleave results to ensure diversity
            while len(all_docs) < target_k and (rag_idx < len(rag_docs) or web_idx < len(web_docs)):
                # Add RAG result if available
                if rag_idx < len(rag_docs):
                    all_docs.append(rag_docs[rag_idx])
                    rag_idx += 1
                
                if len(all_docs) >= target_k:
                    break
                
                # Add web result if available
                if web_idx < len(web_docs):
                    all_docs.append(web_docs[web_idx])
                    web_idx += 1
            
            # Trim to exact count
            all_docs = all_docs[:target_k]
        
        state["retrieved_docs"] = all_docs

        state["step_log"].append({
            "node": "hybrid_retriever",
            "input": {"query": query, "filters": filters},
            "output": {
                "num_docs": len(all_docs),
                "rag_docs": len(rag_docs),
                "web_docs": len(web_docs),
            },
            "success": True
        })

    except Exception as e:
        logger.error(f"[Hybrid Node] Hybrid Retriever error: {e}", exc_info=True)
        state["retrieved_docs"] = []
        state["step_log"].append({
            "node": "hybrid_retriever",
            "error": str(e),
            "success": False
        })

    return state


# ============================================================
#  Answerer Node
# ============================================================

def answerer_node(state: GraphState) -> GraphState:
    """
    Generate final answer using LLM.
    Handles standard search results AND direct general chat.
    """
    try:
        # Check if this is a general chat or safe-fail case with no docs
        # But allow "general_chat" and "clarification" tasks to proceed without docs
        is_chat = state.get("task") in ["general_chat", "clarification"]
        is_safe = not state.get("safety_flags") # Check if there are safety flags
        has_docs = state.get("retrieved_docs") and len(state["retrieved_docs"]) > 0
        
        # Log products that the answerer will see
        if has_docs:
            products = state.get("retrieved_docs", [])
            logger.info(f"[Answerer Node] Products to be processed ({len(products)}):")
            for i, p in enumerate(products[:5], 1):  # Log first 5
                logger.info(f"  [{i}] {p.get('title', 'N/A')} - ${p.get('price', 'N/A')}")
        
        # If safety flags are present, we still want to invoke the LLM to generate the refusal message
        # So we treat !is_safe similarly to is_chat
        
        if not has_docs and not is_chat and is_safe:
             # Standard product search failure (only if safe and not chat)
            state["answer"] = (
                "I couldn't find any products matching your criteria. "
                "Try adjusting your search."
            )
            state["citations"] = []
            state["step_log"].append({
                "node": "answerer",
                "output": {"answer": state["answer"]},
                "success": True,
                "note": "No docs found for product search"
            })
            return state

            # Proceed to LLM generation (works for both RAG and Chat)
        answerer_chain = get_answerer_chain()
        result = answerer_chain.invoke(state)

        logger.info(f"[Answerer Node] LLM result: answer_length={len(result.get('answer', ''))}, citations={result.get('citations', [])}")
        logger.info(f"[Answerer Node] Answer preview: {result.get('answer', '')[:200]}")

        state["answer"] = result["answer"]
        state["citations"] = result.get("citations", [])

        state["step_log"].append({
            "node": "answerer",
            "input": {
                "query": state["query"],
                "num_docs": len(state.get("retrieved_docs", []))
            },
            "output": {
                "answer": result["answer"][:100] + "...",
                "citations": result.get("citations", [])
            },
            "success": True
        })

    except Exception as e:
        logger.error(f"Answerer error: {e}", exc_info=True)
        docs = state.get("retrieved_docs", [])
        
        # Simple fallback
        if docs:
            state["answer"] = f"Found {len(docs)} products. Top result: {docs[0].get('title', 'Unknown')}"
        else:
             state["answer"] = "I'm sorry, I encountered an error processing your request."
             
        state["citations"] = []

        state["step_log"].append({
            "node": "answerer",
            "error": str(e),
            "success": False
        })

    return state


# ============================================================
#  Translator Node
# ============================================================

def translator_node(state: GraphState) -> GraphState:
    """
    Translate query to English if needed.
    """
    query = state["query"]
    # Skip if query is empty
    if not query or not query.strip():
        return state
        
    try:
        from voice.translator import translate_to_english
        
        translated_query = translate_to_english(query)
        
        # Check if translation happened (ignoring case/whitespace)
        if translated_query.strip().lower() != query.strip().lower():
             state["original_query"] = query
             # We assume if it translated, the original was not English.
             # Ideally we'd detect language, but for now we just store the query.
             state["query"] = translated_query
             
             logger.info(f"🌍 Translated query: '{query}' -> '{translated_query}'")
             
    except Exception as e:
        logger.error(f"Translator node error: {e}", exc_info=True)
        # Fallback to original
        
    return state
