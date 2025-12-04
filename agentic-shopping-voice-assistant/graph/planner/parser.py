from pydantic import BaseModel, Field, field_validator
from typing import List, Dict, Optional, Literal, Any
import json
import re

class PlannerOutput(BaseModel):
    reasoning: Optional[str] = Field(None, description="Explanation for the plan")
    sources: List[Literal["private_rag", "web_search"]] = Field(description="Data sources")
    retrieval_fields: List[str] = Field(description="Fields to retrieve")
    comparison_criteria: List[str] = Field(default_factory=list, description="Ranking criteria")
    filters: Dict[str, Any] = Field(default_factory=dict, description="Search filters")
    
    @field_validator('sources')
    @classmethod
    def validate_sources(cls, v):
        if not v: return ["private_rag"]
        return v

def extract_json_from_planner_output(text: str) -> Optional[dict]:
    text = text.strip()
    text = re.sub(r'^(Output:|JSON:|Plan:|Assistant:)\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'```json\s*', '', text)
    text = re.sub(r'```\s*', '', text)
    
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except:
            # Simple cleanup
            try:
                return json.loads(match.group(0).replace("'", '"'))
            except:
                pass
    return None

def parse_planner_output(text: str) -> dict:
    data = extract_json_from_planner_output(text)
    
    if data is None:
        return {
            "reasoning": "Fallback",
            "sources": ["private_rag"],
            "retrieval_fields": ["title", "price", "rating"],
            "comparison_criteria": ["price"],
            "filters": {}
        }
        
    # Normalize sources
    sources = data.get("sources", ["private_rag"])
    valid_sources = {"private_rag", "web_search"}
    sources = [s for s in sources if s in valid_sources]
    if not sources: sources = ["private_rag"]
    
    return {
        "reasoning": data.get("reasoning", ""),
        "sources": sources,
        "retrieval_fields": data.get("retrieval_fields", ["title", "price", "rating"]),
        "comparison_criteria": data.get("comparison_criteria", []),
        "filters": data.get("filters", {})
    }
