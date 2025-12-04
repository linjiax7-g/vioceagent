# tests/test_general_chat.py
"""Test general chat handling"""
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from graph.graph import create_graph

def test_general_chat_hello():
    """Test general chat with hello message"""
    
    graph = create_graph()
    
    result = graph.invoke({
        "query": "Hello",
        "step_log": []
    })
    
    print("\n" + "="*70)
    print("Testing: Hello")
    print("="*70)
    
    # Print step log
    for log in result["step_log"]:
        node = log["node"]
        success = log.get("success", False)
        print(f"[{node}] {'✓' if success else '✗'}")
        if "output" in log:
            print(f"  Output: {log['output']}")
        if "error" in log:
            print(f"  Error: {log['error']}")
    
    # Check task classification
    assert result.get("task") == "general_chat", f"Expected general_chat, got {result.get('task')}"
    
    # Should have answer
    answer = result.get("answer", "")
    print(f"\nAnswer: {answer}")
    print(f"Answer length: {len(answer)}")
    
    assert answer, "Answer should not be empty for general_chat"
    assert len(answer) > 0, "Answer should have content"
    
    # Should mention shopping or assistant capabilities
    answer_lower = answer.lower()
    assert any(word in answer_lower for word in ["shopping", "assistant", "help", "product"]), \
        "Answer should mention shopping capabilities"
    
    # Should NOT have citations for general chat
    citations = result.get("citations", [])
    assert len(citations) == 0, f"General chat should not have citations, got {citations}"
    
    print("\n✓ General chat test passed")


def test_general_chat_joke():
    """Test general chat with joke request"""
    
    graph = create_graph()
    
    result = graph.invoke({
        "query": "Tell me a joke",
        "step_log": []
    })
    
    print("\n" + "="*70)
    print("Testing: Tell me a joke")
    print("="*70)
    
    # Print step log
    for log in result["step_log"]:
        node = log["node"]
        success = log.get("success", False)
        print(f"[{node}] {'✓' if success else '✗'}")
    
    # Check task classification
    assert result.get("task") == "general_chat", f"Expected general_chat, got {result.get('task')}"
    
    # Should have answer
    answer = result.get("answer", "")
    print(f"\nAnswer: {answer}")
    print(f"Answer length: {len(answer)}")
    
    assert answer, "Answer should not be empty"
    assert len(answer) > 0, "Answer should have content"
    
    # Should politely redirect to shopping
    assert any(word in answer.lower() for word in ["shopping", "assistant", "help", "product"]), \
        "Should redirect to shopping capabilities"
    
    # Should NOT have citations
    citations = result.get("citations", [])
    assert len(citations) == 0, "General chat should not have citations"
    
    print("\n✓ Joke request handled correctly")


def test_general_chat_small_talk():
    """Test various small talk queries"""
    
    test_queries = [
        "How are you?",
        "What's your name?",
        "Tell me about yourself",
        "Hi there!"
    ]
    
    for query in test_queries:
        print(f"\n{'='*70}")
        print(f"Testing: {query}")
        print(f"{'='*70}")
        
        graph = create_graph()
        result = graph.invoke({
            "query": query,
            "step_log": []
        })
        
        # Should be classified as general_chat
        task = result.get("task")
        print(f"Task: {task}")
        assert task == "general_chat", f"Query '{query}' should be general_chat, got {task}"
        
        # Should have answer
        answer = result.get("answer", "")
        print(f"Answer: {answer[:100]}...")
        assert answer, f"Query '{query}' should have answer"
        assert len(answer) > 0, f"Query '{query}' answer should have content"
        
        # No citations
        assert len(result.get("citations", [])) == 0, "General chat should not have citations"
    
    print("\n✓ All small talk queries handled correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])

