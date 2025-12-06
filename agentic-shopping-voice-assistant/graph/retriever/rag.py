"""
Private RAG retrieval logic (ChromaDB + SentenceTransformer + Groq Llama3)
Uses local ChromaDB with pre-computed embeddings.
"""

import os
import json
import logging
import pandas as pd
import requests
from typing import List, Dict, Optional
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from dotenv import load_dotenv

# ===============================
# 🔹 Environment Setup
# ===============================
load_dotenv(dotenv_path=".env", override=True)
logger = logging.getLogger(__name__)

_vector_store = None
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"
FAISS_DB_DIR = "./faiss_db"

# ===============================
# 1️⃣ Setup Function
# ===============================
def setup_env(api_key: str = None):
    """
    Initialize environment.
    """
    global GROQ_API_KEY
    if api_key:
        GROQ_API_KEY = api_key
        os.environ["GROQ_API_KEY"] = api_key
    
    if not os.path.exists(FAISS_DB_DIR):
        logger.warning(f"⚠️ FAISS directory not found at {FAISS_DB_DIR}. Please run scripts/index_data.py first.")

# ===============================
# 2️⃣ Load Vector Store
# ===============================
def get_vector_store():
    """Load FAISS index and SentenceTransformer encoder."""
    global _vector_store

    if _vector_store is None:
        logger.info("[Init] Loading FAISS and embeddings...")
        
        # Must match the embedding model used in scripts/index_data.py
        # Using infgrad/stella-base-en-v2 as per design
        embedder = HuggingFaceEmbeddings(
            model_name="infgrad/stella-base-en-v2",
            model_kwargs={"trust_remote_code": True}
        )
        
        try:
            _vector_store = FAISS.load_local(
                folder_path=FAISS_DB_DIR,
                embeddings=embedder,
                allow_dangerous_deserialization=True
            )
            logger.info(f"[Init] FAISS loaded from {FAISS_DB_DIR}")
        except Exception as e:
            logger.error(f"[Init] Failed to load FAISS: {e}")
            return None
        
    return _vector_store

# ===============================
# 3️⃣ Filter Extraction
# ===============================
def extract_filters_from_text(query: str) -> Dict:
    """Extract structured filters using user-provided Groq API key."""
    current_api_key = os.getenv("GROQ_API_KEY", GROQ_API_KEY)
    
    if not current_api_key:
        logger.warning("❌ GROQ_API_KEY not set. Skipping filter extraction.")
        return {}

    system_prompt = """Extract filters from query in JSON format.
Keys: category, min_price, max_price, material, brand.
Examples:
"cleaner under $15" -> {"category":"cleaner","max_price":15}
"pencil over 15" -> {"category":"pencil","min_price":15}
Return only JSON."""
    
    headers = {"Authorization": f"Bearer {current_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query},
        ],
        "max_tokens": 200,
        "temperature": 0.2,
    }
    try:
        res = requests.post(GROQ_ENDPOINT, headers=headers, json=payload).json()
        if "error" in res:
            logger.error(f"[Groq] API Error: {res['error']}")
            return {}
            
        text = res["choices"][0]["message"]["content"].strip()
        return _safe_json_parse(text)

    except Exception as e:
        logger.warning(f"[Groq] Filter extraction failed: {e}")
        return {}


def _safe_json_parse(text):
    import re, json
    try:
        # Try to find JSON block
        for m in re.findall(r"\{[\s\S]*?\}", text):
            try:
                return json.loads(m)
            except json.JSONDecodeError:
                continue
    except Exception:
        pass
    return {}

def _validate_results_with_groq(user_query: str, products: List[Dict]) -> List[Dict]:
    """
    Use GROQ to validate if products match user's query requirements.
    """
    current_api_key = os.getenv("GROQ_API_KEY", GROQ_API_KEY)
    if not current_api_key:
        return products
    
    # Format products for validation
    products_list = []
    for i, p in enumerate(products):
        title = p.get('title', 'Unknown')
        price = p.get('price', 'N/A')
        snippet = p.get('content', '')[:100]
        products_list.append(f"{i+1}. {title} - ${price}\n   Description: {snippet}")
    
    products_text = "\n".join(products_list)
    
    validation_prompt = f"""User asked: "{user_query}"
Here are the products found:
{products_text}
Task: Return a JSON array of numbers indicating which products match the user's intent.
Example: {{"valid_products": [1, 3, 5]}}
Return ONLY valid JSON."""

    headers = {"Authorization": f"Bearer {current_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": "You are a product validation assistant. Return only valid JSON."},
            {"role": "user", "content": validation_prompt},
        ],
        "max_tokens": 300,
        "temperature": 0.0,
    }
    
    try:
        res = requests.post(GROQ_ENDPOINT, headers=headers, json=payload).json()
        if "choices" in res:
            text = res["choices"][0]["message"]["content"].strip()
            result = _safe_json_parse(text)
            
            valid_indices = result.get("valid_products", [])
            if not valid_indices:
                return products
            
            # Filter and keep order
            valid_index_set = set(i-1 for i in valid_indices if 1 <= i <= len(products))
            validated = [products[i] for i in range(len(products)) if i in valid_index_set]
            
            if validated:
                return validated
                
    except Exception as e:
        logger.warning(f"[GROQ] Validation failed: {e}")
        
    return products

def _parse_price_value(value):
    if value is None: return None
    if isinstance(value, (int, float)): return float(value)
    if isinstance(value, str):
        cleaned = value.replace("$", "").replace(",", "").strip()
        try:
            return float(cleaned)
        except:
            return None
    return None

# ===============================
# 4️⃣ Retrieval
# ===============================
def retrieve_from_rag(query: str, filters: Dict, k: int = 20) -> List[Dict]:
    """Retrieve top-k documents from FAISS with filter constraints."""
    db = get_vector_store()
    if not db:
        return []
    
    # Prepare FAISS filter
    # FAISS in LangChain supports basic dict filtering for exact matches in metadata
    where_clause = {}
    
    # Process categorical filters
    if filters:
        if "category" in filters and filters["category"]:
            # FAISS exact match filter
            # Note: This assumes the category in metadata matches exactly. 
            # If partial match is needed, we might rely on post-filtering instead.
            pass 
        
        if "brand" in filters and filters["brand"]:
            # where_clause["brand"] = filters["brand"]
            # FIXME: Data doesn't have brand metadata, so we rely on semantic search
            pass
            
        if "material" in filters and filters["material"]:
            # where_clause["material"] = filters["material"]
             # FIXME: Data doesn't have material metadata
            pass

    # If where_clause is empty, pass None
    where_filter = where_clause if where_clause else None
    
    # Search
    try:
        # similarity_search_with_score returns list of (Document, score)
        # FAISS L2 distance: lower is better
        docs_and_scores = db.similarity_search_with_score(
            query, 
            k=k * 2, # Retrieve more to allow for post-filtering (price etc)
            filter=where_filter
        )
    except Exception as e:
        logger.error(f"FAISS search failed: {e}")
        return []

    # Parse price filters
    min_price = _parse_price_value(filters.get("min_price")) if filters else None
    max_price = _parse_price_value(filters.get("max_price")) if filters else None
    
    category_filter = str(filters.get("category", "")).lower() if filters and "category" in filters else None

    results = []
    for doc, score in docs_and_scores:
        metadata = doc.metadata
        
        # Post-filtering for Price
        try:
            price_str = str(metadata.get("Selling Price", "0")).replace("$", "").replace(",", "")
            price = float(price_str) if price_str else 0.0
        except:
            price = 0.0
            
        if min_price is not None and price < min_price:
            continue
        if max_price is not None and price > max_price:
            continue
            
        # Post-filtering for Category (partial match)
        if category_filter:
            doc_cat = str(metadata.get("category", "")).lower()
            if category_filter not in doc_cat:
                continue

        results.append(_format_result(doc, score, price))
        
        if len(results) >= k:
            break
            
    # Optional: Validation with LLM
    if results:
        results = _validate_results_with_groq(query, results)
        
    return results


def _format_result(doc, score, price):
    """
    Normalize FAISS document into standard dict schema.
    """
    metadata = doc.metadata
    
    # Extract content from page_content or reconstruct it
    content = doc.page_content
    
    return {
        "doc_id": metadata.get("Uniq Id"),
        "title": metadata.get("Product Name"),
        "price": price,
        "category": metadata.get("category", ""),
        "brand": metadata.get("brand", ""),
        "material": metadata.get("material", ""),
        "ingredients": metadata.get("ingredients", ""),
        "rating": None, # Chroma metadata might not have rating unless indexed
        "content": content,
        "score": float(score),
        "source": "rag",
    }

# ===============================
# 5️⃣ Unified Pipeline
# ===============================
def rag_with_auto_filter(user_query: str, k: int = 20) -> List[Dict]:
    """Convenience pipeline with auto-filtering."""
    filters = extract_filters_from_text(user_query)
    logger.info(f"Auto-extracted filters: {filters}")
    results = retrieve_from_rag(user_query, filters, k)
    return results

def rag_search(query: str, filters: Dict = None, k: int = 20) -> List[Dict]:
    """Unified interface for LangGraph and MCP."""
    if filters:
        return retrieve_from_rag(query, filters, k)
    return rag_with_auto_filter(query, k)
