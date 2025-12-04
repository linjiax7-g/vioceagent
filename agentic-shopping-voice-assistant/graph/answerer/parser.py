# graph/answerer/parser.py
import re
from typing import Dict, List

def parse_answer_with_citations(text: str) -> Dict:
    """
    Parse LLM answer and extract citations.
    
    Returns:
        {
            "answer": str,  # Clean answer text without any [DOC X] markers
            "citations": List[str]  # List of doc IDs cited
        }
    """
    import logging
    logger = logging.getLogger(__name__)
    
    logger.info(f"[Parser] Raw LLM output length: {len(text)}")
    logger.info(f"[Parser] Raw LLM output preview: {text[:300]}")
    
    text = text.strip()
    
    # Extract citations from the end
    citations = []
    citation_match = re.search(r'Citations?:\s*(.+?)$', text, re.IGNORECASE)
    
    if citation_match:
        citation_text = citation_match.group(1)
        # Extract all [DOC X] patterns
        doc_refs = re.findall(r'\[DOC\s+(\d+)\]', citation_text)
        citations = [f"DOC {ref}" for ref in doc_refs]
        
        # Remove citation line from answer
        text = text[:citation_match.start()].strip()
    
    # Also find any inline citations in answer (for tracking)
    inline_citations = re.findall(r'\[DOC\s+(\d+)\]', text)
    for ref in inline_citations:
        doc_id = f"DOC {ref}"
        if doc_id not in citations:
            citations.append(doc_id)
    
    # REMOVE all inline [DOC X] citations from the answer text
    # This ensures the conversational answer is clean and readable
    text = re.sub(r'\s*\[DOC\s+\d+\]\s*', ' ', text)
    
    # Clean up any double spaces created by removal
    text = re.sub(r'\s+', ' ', text).strip()
    
    logger.info(f"[Parser] Final parsed answer length: {len(text)}, citations: {len(citations)}")
    
    if not text:
        logger.warning("[Parser] WARNING: Parsed answer is empty! This may indicate an LLM output formatting issue.")
    
    return {
        "answer": text,
        "citations": citations
    }