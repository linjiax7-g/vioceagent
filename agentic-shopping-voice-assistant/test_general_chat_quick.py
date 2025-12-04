#!/usr/bin/env python3
"""Quick test for general chat - verify responses are different"""

from graph.graph import create_graph

def test_different_responses():
    """Test that system properly declines non-shopping requests"""
    
    test_cases = [
        ("Hello", True, "greeting"),  # Should accept greeting
        ("Tell me a joke", False, "non-shopping"),  # Should decline
        ("How are you?", True, "polite inquiry"),  # Should redirect
        ("What's the weather?", False, "non-shopping")  # Should decline
    ]
    
    print("\n" + "="*70)
    print("Testing General Chat - Checking for Response Variety")
    print("="*70)
    
    results = []
    
    for query, should_be_brief, category in test_cases:
        print(f"\n📝 Query: {query} ({category})")
        
        graph = create_graph()
        result = graph.invoke({
            "query": query,
            "step_log": []
        })
        
        task = result.get("task", "unknown")
        answer = result.get("answer", "")
        word_count = len(answer.split())
        
        print(f"   Task: {task}")
        print(f"   Answer ({word_count} words): {answer}")
        
        # Verify it's classified as general_chat
        if task != "general_chat":
            print(f"   ⚠️  WARNING: Expected general_chat, got {task}")
        
        # Check if answer is appropriately brief
        if word_count > 30:
            print(f"   ⚠️  WARNING: Answer is too long ({word_count} words, should be under 30)")
        
        # For non-shopping requests, check if it declines
        if not should_be_brief and category == "non-shopping":
            decline_keywords = ["can only", "shopping assistant", "only help", "only assist"]
            has_decline = any(keyword in answer.lower() for keyword in decline_keywords)
            if has_decline:
                print(f"   ✅ Correctly declines non-shopping request")
            else:
                print(f"   ⚠️  WARNING: Should decline non-shopping request more clearly")
        
        # Store response
        results.append({
            "query": query,
            "category": category,
            "answer": answer,
            "word_count": word_count
        })
    
    print("\n" + "="*70)
    print("Analysis:")
    print("="*70)
    
    # Check for duplicates
    answers = [r["answer"] for r in results]
    unique_responses = set(answers)
    print(f"Total responses: {len(answers)}")
    print(f"Unique responses: {len(unique_responses)}")
    
    if len(unique_responses) == len(answers):
        print("✅ All responses are different!")
    else:
        print("⚠️  Some responses are duplicated")
    
    # Check word counts
    avg_words = sum(r["word_count"] for r in results) / len(results)
    print(f"\nAverage word count: {avg_words:.1f}")
    
    long_responses = [r for r in results if r["word_count"] > 30]
    if long_responses:
        print(f"⚠️  {len(long_responses)} response(s) exceed 30 words")
    else:
        print("✅ All responses are concise (under 30 words)")
    
    # Check for proper declines
    non_shopping = [r for r in results if r["category"] == "non-shopping"]
    print(f"\nNon-shopping requests: {len(non_shopping)}")
    for r in non_shopping:
        decline_keywords = ["can only", "shopping assistant", "only help", "only assist"]
        has_decline = any(keyword in r["answer"].lower() for keyword in decline_keywords)
        status = "✅" if has_decline else "⚠️"
        print(f"  {status} '{r['query']}': {r['answer']}")
    
    # Check if any response matches the default greeting
    default_greeting = "Hello! I'm your shopping assistant. I can help you find products, compare options, or check prices. What are you looking for today?"
    
    matching_default = [r for r in answers if r == default_greeting]
    if matching_default:
        print(f"\n⚠️  WARNING: {len(matching_default)} response(s) match the default greeting")
    else:
        print("\n✅ No responses match the default greeting!")

if __name__ == "__main__":
    test_different_responses()

