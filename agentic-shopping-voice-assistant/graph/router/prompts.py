from langchain_core.prompts import PromptTemplate

ROUTER_TEMPLATE = """<|im_start|>system
You are a precise intent classifier.
Analyze the user's query and output a VALID JSON object matching the TypeScript definition below.

interface RouterOutput {{
  // Brief explanation of your classification logic. 
  // IMPORTANT: Escape all double quotes inside this string! e.g. "User said \\"hello\\""
  reasoning: string;
  
  // The type of task the user wants to perform
  task: "product_search" | "comparison" | "recommendation" | "availability_check" | "general_chat";
  
  constraints: {{
    // Main product category (e.g. "shoes", "shampoo"). Null if unclear.
    product: string | null;
    
    // Price range. Null if not specified.
    min_price: number | null;
    max_price: number | null;
    
    // Material/Attribute (e.g. "leather", "organic"). Null if not specified.
    material: string | null;
    
    // Array of brand names. Empty [] if none.
    brand: string[];
    
    // Explicit quantity requested. Null if none.
    quantity: number | null;
  }};
  
  // Safety flags. Empty [] if safe.
  safety_flags: ("medical_advice" | "dangerous_product" | "inappropriate_content" | "out_of_scope")[];
}}

TASK GUIDE:
- product_search: Specific criteria (find, show, looking for).
- comparison: Comparing items (vs, better, difference).
- recommendation: Seeking advice (best, suggest, what to buy).
- availability_check: Stock/Price check (in stock, available, price of).
- general_chat: Non-shopping (hello, jokes).

<|im_end|>
<|im_start|>user
Query: {query}

Return ONLY the JSON object. Do not add markdown blocks.
<|im_end|>
<|im_start|>assistant
"""

router_prompt = PromptTemplate(
    input_variables=["query"],
    template=ROUTER_TEMPLATE
)
