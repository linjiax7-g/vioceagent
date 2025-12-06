from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal, List
import json
import re
import logging
logger = logging.getLogger(__name__)

# Valid safety flags for filtering
VALID_SAFETY_FLAGS = {
    "inappropriate_content",
    "medical_advice",
    "dangerous_product",
    "out_of_scope",
}

class Constraints(BaseModel):
    product: Optional[str] = Field(None, description="Product type or category")
    min_price: Optional[float] = Field(None, description="Minimum price in USD")
    max_price: Optional[float] = Field(None, description="Maximum price in USD")
    material: Optional[str] = Field(None, description="Material preference")
    brand: Optional[List[str]] = Field(default_factory=list, description="Brand name(s)")
    quantity: Optional[int] = Field(None, description="Number of products requested")
    
    model_config = {"extra": "ignore"}

class RouterOutput(BaseModel):
    reasoning: Optional[str] = Field(None, description="Explanation for the classification")
    task: Literal["product_search", "comparison", "recommendation", "availability_check", "general_chat", "clarification"]
    constraints: Constraints
    safety_flags: List[str] = Field(default_factory=list)
    
    @field_validator('safety_flags')
    @classmethod
    def validate_safety_flags(cls, v):
        return [flag for flag in v if flag in VALID_SAFETY_FLAGS]

def extract_json_from_router_output(text: str) -> Optional[dict]:
    """Extract JSON from potentially messy output."""
    text = text.strip()
    text = re.sub(r'^(Output:|JSON:|Assistant:)\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'```json\s*', '', text)
    text = re.sub(r'```\s*', '', text)
    
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        json_str = match.group(0)
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            # Simple cleanup
            json_str = json_str.replace("'", '"')
            try:
                return json.loads(json_str)
            except:
                pass
    return None

def parse_router_output(text: str) -> RouterOutput:
    """Parse LLM output with fallback."""
    data = extract_json_from_router_output(text)
    logger.debug(f"🔍 Extracted JSON: {data}")
    
    if data is None:
        logger.warning("No JSON found in LLM output, using defaults")
        return RouterOutput(
            reasoning="Fallback due to parsing failure",
            task="product_search",
            constraints=Constraints(),
            safety_flags=[]
        )
        
    # Default handling
    task = data.get("task", "product_search")
    if task not in ["product_search", "comparison", "recommendation", "availability_check", "general_chat", "clarification"]:
        task = "product_search"
        
    constraints_data = data.get("constraints", {})
    
    # Safe float conversion
    def safe_float(val):
        if val in [None, "null", ""]: return None
        try: return float(val)
        except: return None
        
    # Safe int conversion
    def safe_int(val):
        if val in [None, "null", ""]: return None
        try: return int(val)
        except: return None
        
    constraints = Constraints(
        product=constraints_data.get("product"),
        min_price=safe_float(constraints_data.get("min_price")),
        max_price=safe_float(constraints_data.get("max_price")),
        material=constraints_data.get("material"),
        # Ensure brand is a list, handle None or non-list values
        brand=(constraints_data.get("brand") if isinstance(constraints_data.get("brand"), list) else []) or [],
        quantity=safe_int(constraints_data.get("quantity"))
    )
    
    return RouterOutput(
        reasoning=data.get("reasoning", ""),
        task=task,
        constraints=constraints,
        safety_flags=data.get("safety_flags", [])
    )
