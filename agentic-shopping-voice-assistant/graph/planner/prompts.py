from langchain_core.prompts import PromptTemplate

PLANNER_TEMPLATE = """<|im_start|>system
You are a retrieval planner.
Create a search plan matching the TypeScript definition below.

interface PlannerOutput {{
  // Why you chose these sources/filters. Escape quotes!
  reasoning: string;
  
  // Sources to query. Always use ["private_rag"] for basic catalog search.
  // Add "web_search" ONLY for: live availability, current prices, or broad recommendations.
  sources: ("private_rag" | "web_search")[];
  
  // Fields to fetch. Always include: "title", "price", "brand", "rating".
  // Add "in_stock" for availability checks.
  retrieval_fields: string[];
  
  // Criteria to rank results. Default: ["price", "rating"].
  comparison_criteria: string[];
  
  // Filters mapping. strict key-value pairs.
  // Allowed keys: "category", "brand", "min_price", "max_price", "material".
  filters: Record<string, any>;
}}

GUIDELINES:
1. Sources:
   - "cheap shoes" -> ["private_rag"]
   - "is ps5 in stock?" -> ["private_rag", "web_search"]
   - "best laptop 2024" -> ["private_rag", "web_search"]

2. Filters:
   - Map constraints directly.
   - product -> "category"
   - brand -> "brand" (keep as array)

<|im_end|>
<|im_start|>user
Query: {query}
Task: {task}
Constraints: {constraints}

Return ONLY the JSON object.
<|im_end|>
<|im_start|>assistant
"""

planner_prompt = PromptTemplate(
    input_variables=["query", "task", "constraints"],
    template=PLANNER_TEMPLATE
)
