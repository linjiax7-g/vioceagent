"""
FastAPI REST API for Voice Shopping Assistant

Provides endpoints for:
- TTS (Text-to-Speech) generation
- Complete query pipeline (Query → LangGraph → TTS)
- Audio file serving

Usage:
    uvicorn voice.api:app --reload --port 8000
"""

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()  # This loads the .env file in the current directory

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Set
from pathlib import Path
import asyncio
import base64
import logging
import math
import os
import re
import threading
import uuid
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Voice Shopping Assistant API",
    description="REST API for TTS and agentic product discovery",
    version="1.0.0"
)

# CORS configuration for React frontend
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://localhost:4173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Output directory for TTS files
OUTPUT_DIR = Path("./tts_output")
OUTPUT_DIR.mkdir(exist_ok=True)

# Default voice fallback
DEFAULT_TTS_VOICE = os.getenv("ELEVENLABS_DEFAULT_VOICE", "sarah")

# Global LangGraph app cache
_graph_app = None
_graph_lock = threading.Lock()

# Global Session Storage (In-Memory)
# Structure: {session_id: {"history": [...], "seen_ids": set()}}
SESSIONS: Dict[str, Dict[str, Any]] = {}

# ============================================================================
# Utility Helpers
# ============================================================================

def sanitize_data(obj):
    """
    Recursively sanitize data to replace NaN, inf, and -inf with None.
    Reused by both standard and streaming endpoints to avoid per-request redecls.
    """
    if isinstance(obj, dict):
        return {k: sanitize_data(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_data(item) for item in obj]
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    return obj


def get_graph_app():
    """Return the compiled LangGraph app, compiling once per process."""
    global _graph_app
    if _graph_app is None:
        with _graph_lock:
            if _graph_app is None:
                from graph.graph import create_graph
                _graph_app = create_graph()
    return _graph_app


def _warm_llm_chains():
    """Eagerly build router/planner/answerer chains so the LLM loads before first request."""
    from graph.router import get_router_chain
    from graph.planner import get_planner_chain
    from graph.answerer import get_answerer_chain

    for factory, label in (
        (get_router_chain, "router"),
        (get_planner_chain, "planner"),
        (get_answerer_chain, "answerer"),
    ):
        try:
            factory()
            logger.info(f"Warm-up: {label} chain ready")
        except Exception as exc:
            logger.warning(f"Warm-up: {label} chain failed: {exc}")


def _warm_vector_store():
    """Load ChromaDB index + sentence transformer into memory."""
    from graph.retriever.rag import get_vector_store

    try:
        get_vector_store()
        logger.info("Warm-up: vector store ready")
    except Exception as exc:
        logger.warning(f"Warm-up: vector store skipped: {exc}")


async def warmup_components():
    """
    Run blocking warm-up tasks sequentially to avoid circular-import races:
    - Compile LangGraph once
    - Load shared LLM chains
    - Prime the vector store
    """
    loop = asyncio.get_running_loop()

    async def _run(label, func):
        try:
            await loop.run_in_executor(None, func)
            logger.info(f"Warm-up: {label} completed")
        except Exception as exc:
            logger.warning(f"Warm-up: {label} failed ({exc})")

    # Order matters: graph construction first so router/planner imports are settled
    await _run("LangGraph", get_graph_app)
    await _run("LLM chains", _warm_llm_chains)
    await _run("vector store", _warm_vector_store)

# ============================================================================
# Request/Response Models
# ============================================================================

class TTSRequest(BaseModel):
    """Request model for TTS generation"""
    text: str = Field(..., description="Text to convert to speech", max_length=4096)
    voice: str = Field(
        default="sarah",
        description="Voice selection: sarah, laura, jessica, matilda, alice, lily (female) | adam, roger, charlie, george, callum, harry, liam, will, brian, chris, eric, daniel, bill (male) | river (neutral)"
    )
    model: str = Field(
        default="tts-1",
        description="TTS model: tts-1 (fast) or tts-1-hd (high quality)"
    )
    output_language: Optional[str] = Field(
        default="en",
        description="Target language for audio output (e.g., 'en', 'Chinese'). If different from 'en', text will be translated."
    )

    class Config:
        schema_extra = {
            "example": {
                "text": "I found 3 organic shampoos under $20. The best option is Brand X.",
                "voice": "alloy",
                "model": "tts-1",
                "output_language": "en"
            }
        }


class TTSResponse(BaseModel):
    """Response model for TTS generation"""
    success: bool
    audio_id: str
    audio_url: str
    duration_estimate: float
    message: Optional[str] = None


class QueryRequest(BaseModel):
    """Request model for product query"""
    query: str = Field(..., description="Natural language product search query")
    voice: Optional[str] = Field(
        default=None,
        description="Preferred ElevenLabs voice (e.g., 'sarah', 'adam')"
    )
    return_audio_data: bool = Field(
        default=False,
        description="If True, return base64-encoded audio data directly instead of saving to file"
    )
    session_id: Optional[str] = Field(
        default=None,
        description="Session ID for maintaining conversation history"
    )
    output_language: Optional[str] = Field(
        default="en",
        description="Target language for audio output (e.g., 'en', 'Chinese')."
    )

    class Config:
        schema_extra = {
            "example": {
                "query": "organic shampoo under $20",
                "voice": "sarah",
                "return_audio_data": True,
                "session_id": "123e4567-e89b-12d3-a456-426614174000",
                "output_language": "en"
            }
        }


class QueryResponse(BaseModel):
    """Response model for product query with TTS"""
    success: bool
    query: str
    answer: str
    citations: List[str]
    products: List[Dict[str, Any]]
    task: Optional[str] = None
    constraints: Optional[Dict[str, Any]] = None
    audio_id: Optional[str] = None
    audio_url: Optional[str] = None
    audio_data: Optional[str] = Field(
        default=None,
        description="Base64-encoded MP3 audio data (only if return_audio_data=True)"
    )
    step_log: Optional[List[Dict[str, Any]]] = None
    session_id: Optional[str] = None


# ============================================================================
# Health Check
# ============================================================================

@app.get("/health", tags=["Health"])
async def health_check():
    """
    Health check endpoint

    Returns API status and configuration
    """
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
        "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
        "output_dir": str(OUTPUT_DIR),
        "cors_origins": CORS_ORIGINS
    }


# ============================================================================
# TTS Endpoints
# ============================================================================

@app.post("/api/tts", response_model=TTSResponse, tags=["TTS"])
async def generate_tts(request: TTSRequest):
    """
    Generate TTS audio from text using ElevenLabs

    **Integration Point:** voice_shopping_assistant_ui.tsx:193 (playTTS function)

    **Process:**
    1. Receives text and voice preference
    2. Generates speech using ElevenLabs TTS
    3. Saves audio file with unique ID
    4. Returns audio URL and metadata

    **Voice Options (Female):**
    - "sarah": American young (default)
    - "laura": American young
    - "jessica": American young
    - "matilda": American middle-aged
    - "alice": British middle-aged
    - "lily": British middle-aged
    
    **Voice Options (Male):**
    - "adam": American middle-aged
    - "roger": American middle-aged
    - "charlie": Australian young
    - "george": British middle-aged
    - "harry": American young
    - "liam": American young
    
    **Voice Options (Neutral):**
    - "river": American middle-aged
    
    **Legacy OpenAI Voices (auto-mapped):**
    - "alloy", "echo", "fable", "onyx", "nova", "shimmer"
    
    Or use any ElevenLabs voice ID directly

    **Example:**
    ```bash
    curl -X POST http://localhost:8000/api/tts \\
      -H "Content-Type: application/json" \\
      -d '{"text": "Hello world", "voice": "sarah"}'
    ```
    """
    try:
        logger.info(f"TTS request: {len(request.text)} characters, voice={request.voice}")

        # Import TTS module
        from voice.tts import synthesize_speech_async, estimate_audio_duration, map_voice
        from voice.translator import translate_text

        # Translate if needed
        text_to_speak = request.text
        if request.output_language and request.output_language.lower() not in ["en", "english", "us", "uk"]:
            text_to_speak = translate_text(request.text, request.output_language)
            logger.info(f"Translated text for TTS: {text_to_speak[:50]}...")

        # Generate unique filename
        audio_id = str(uuid.uuid4())
        output_path = OUTPUT_DIR / f"{audio_id}.mp3"

        # Map OpenAI voice names to ElevenLabs (for backward compatibility)
        elevenlabs_voice = map_voice(request.voice)

        # Synthesize speech (async)
        await synthesize_speech_async(
            text=text_to_speak,
            output_path=str(output_path),
            voice=elevenlabs_voice,
            model=request.model if hasattr(request, 'model') else "eleven_turbo_v2_5"
        )

        # Estimate duration
        duration = estimate_audio_duration(request.text)

        logger.info(f"TTS generated: {audio_id}.mp3 ({duration:.1f}s)")

        return TTSResponse(
            success=True,
            audio_id=audio_id,
            audio_url=f"/api/tts/audio/{audio_id}",
            duration_estimate=duration,
            message="TTS generated successfully with ElevenLabs"
        )

    except ValueError as e:
        logger.error(f"TTS validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"TTS generation error: {e}")
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")


@app.post("/api/tts/stream", tags=["TTS"])
async def generate_tts_stream(request: TTSRequest):
    """
    Generate TTS audio and return directly as stream (no file saving)
    
    **Benefits:**
    - No disk I/O (faster response)
    - No file cleanup needed
    - Saves disk space
    
    **Returns:** MP3 audio stream directly
    
    **Example:**
    ```bash
    curl -X POST http://localhost:8000/api/tts/stream \\
      -H "Content-Type: application/json" \\
      -d '{"text": "Hello world", "voice": "sarah"}' \\
      --output audio.mp3
    ```
    """
    try:
        logger.info(f"TTS stream request: {len(request.text)} characters, voice={request.voice}")
        
        # Import TTS module
        from voice.tts import get_tts_instance, map_voice
        from voice.translator import translate_text
        
        # Map voice name
        elevenlabs_voice = map_voice(request.voice)

        # Translate if needed
        text_to_speak = request.text
        if request.output_language and request.output_language.lower() not in ["en", "english", "us", "uk"]:
            text_to_speak = translate_text(request.text, request.output_language)
            logger.info(f"Translated text for TTS stream: {text_to_speak[:50]}...")
        
        # Get TTS instance and synthesize directly
        tts = get_tts_instance()
        voice_id = tts.DEFAULT_VOICES.get(elevenlabs_voice, elevenlabs_voice)
        
        result = await tts.synthesize(
            text=text_to_speak,
            voice_id=voice_id
        )
        
        logger.info(f"TTS stream generated: {len(result['audio_data'])} bytes")
        
        # Return audio data directly as streaming response
        from io import BytesIO
        audio_stream = BytesIO(result["audio_data"])
        
        return StreamingResponse(
            audio_stream,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline; filename=speech.mp3",
                "Cache-Control": "no-cache",
                "Content-Length": str(len(result["audio_data"]))
            }
        )
        
    except ValueError as e:
        logger.error(f"TTS validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"TTS generation error: {e}")
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")


@app.get("/api/tts/audio/{audio_id}", tags=["TTS"])
async def get_tts_audio(audio_id: str):
    """
    Serve generated TTS audio file

    **Integration Point:** Frontend audio player

    Returns MP3 audio file for playback in browser
    """
    # Validate audio_id format (prevent path traversal)
    try:
        uuid.UUID(audio_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid audio ID format")

    audio_path = OUTPUT_DIR / f"{audio_id}.mp3"

    if not audio_path.exists():
        logger.warning(f"Audio file not found: {audio_id}")
        raise HTTPException(status_code=404, detail="Audio file not found")

    return FileResponse(
        audio_path,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f"inline; filename={audio_id}.mp3",
            "Cache-Control": "public, max-age=3600"
        }
    )


@app.delete("/api/tts/audio/{audio_id}", tags=["TTS"])
async def delete_tts_audio(audio_id: str):
    """
    Delete TTS audio file (cleanup)
    """
    try:
        uuid.UUID(audio_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid audio ID format")

    audio_path = OUTPUT_DIR / f"{audio_id}.mp3"

    if audio_path.exists():
        audio_path.unlink()
        logger.info(f"Deleted audio: {audio_id}")
        return {"success": True, "message": "Audio deleted"}
    else:
        raise HTTPException(status_code=404, detail="Audio file not found")


# ============================================================================
# Query Pipeline Endpoint
# ============================================================================

@app.post("/api/query", response_model=QueryResponse, tags=["Query"])
async def process_query(request: QueryRequest):
    """
    Process text query through complete pipeline

    **Pipeline:**
    1. Query → LangGraph (Router → Planner → Retriever → Answerer)
    2. Answer → TTS generation
    3. Return structured response with audio

    **Integration Point:** voice_shopping_assistant_ui.tsx (complete flow)

    **Example:**
    ```bash
    curl -X POST http://localhost:8000/api/query \\
      -H "Content-Type: application/json" \\
      -d '{"query": "organic shampoo under $20"}'
    ```
    """
    try:
        # Session Management
        session_id = request.session_id or str(uuid.uuid4())
        if session_id not in SESSIONS:
            SESSIONS[session_id] = {"history": [], "seen_ids": set()}
        
        session_data = SESSIONS[session_id]
        chat_history = session_data["history"]
        seen_product_ids = list(session_data["seen_ids"])
        
        logger.info(f"Query request: {request.query} (Session: {session_id})")

        # Run LangGraph pipeline
        logger.info("Running LangGraph pipeline...")
        graph = get_graph_app()
        result = graph.invoke({
            "query": request.query,
            "chat_history": chat_history,
            "seen_product_ids": seen_product_ids,
            "step_log": []
        })

        logger.info(f"Graph completed: task={result.get('task')}, "
                   f"docs={len(result.get('retrieved_docs', []))}")

        # Update Session History
        answer_text = result.get("answer") or ""
        
        # Only update history if successful answer
        if answer_text:
            chat_history.append({"role": "user", "content": request.query})
            chat_history.append({"role": "assistant", "content": answer_text})
            # Limit history to prevent context overflow (last 10 turns = 20 messages)
            if len(chat_history) > 20:
                SESSIONS[session_id]["history"] = chat_history[-20:]
        
        # Update seen_product_ids
        retrieved_docs = result.get("retrieved_docs", [])
        for doc in retrieved_docs:
            doc_id = str(doc.get("doc_id", ""))
            if doc_id:
                SESSIONS[session_id]["seen_ids"].add(doc_id)

        # Generate TTS for answer
        logger.info("Generating TTS for answer...")
        from voice.tts import get_tts_instance, map_voice
        from voice.translator import translate_text
        
        if not answer_text.strip():
            logger.warning("Graph returned empty answer. Using fallback response for TTS.")
            answer_text = "I could not generate a detailed answer right now, please try again."

        default_voice = DEFAULT_TTS_VOICE or "sarah"
        selected_voice = map_voice(request.voice) if request.voice else default_voice
        logger.info(f"TTS voice selected for query: {selected_voice}")
        
        # Translate if needed (only affects TTS, answer_text remains English for UI unless we update it)
        text_to_speak = answer_text
        if request.output_language and request.output_language.lower() not in ["en", "english", "us", "uk"]:
            translated_text = translate_text(answer_text, request.output_language)
            logger.info(f"Translated text: {translated_text[:50]}...")
            text_to_speak = translated_text
            # Update answer text for frontend display as well (per user requirement)
            answer_text = translated_text
        
        # Choose between saving to file or returning data directly
        audio_id = None
        audio_url = None
        audio_data_base64 = None
        
        if request.return_audio_data:
            # Return audio data directly (no file saving)
            logger.info("Generating TTS audio data (no file save)...")
            tts = get_tts_instance()
            voice_id = tts.DEFAULT_VOICES.get(selected_voice, selected_voice)
            tts_result = await tts.synthesize(text=text_to_speak, voice_id=voice_id)
            audio_data_base64 = base64.b64encode(tts_result["audio_data"]).decode('utf-8')
            logger.info(f"TTS audio data generated: {len(tts_result['audio_data'])} bytes")
        else:
            # Save to file (legacy behavior)
            from voice.tts import synthesize_speech_async
            audio_id = str(uuid.uuid4())
            output_path = OUTPUT_DIR / f"{audio_id}.mp3"
            
            await synthesize_speech_async(
                text=text_to_speak,
                output_path=str(output_path),
                voice=selected_voice
            )
            audio_url = f"/api/tts/audio/{audio_id}"
            logger.info(f"TTS saved to file: {audio_id}.mp3")

        logger.info(f"Query completed successfully")

        # Add 'cited' flag to products based on citations
        products = [dict(product) for product in result.get("retrieved_docs", [])]
        citations = result.get("citations", [])
        
        # Extract DOC numbers from citations (e.g., "DOC 1" -> 1)
        cited_doc_numbers = set()
        for citation in citations:
            match = re.search(r'DOC\s+(\d+)', citation)
            if match:
                cited_doc_numbers.add(int(match.group(1)))
        
        # Add 'cited' flag to each product
        for idx, product in enumerate(products, start=1):
            product['cited'] = idx in cited_doc_numbers
        
        # Sanitize data before returning (replace NaN with None/null)
        sanitized_result = sanitize_data({
            "success": True,
            "session_id": session_id,
            "query": request.query,
            "answer": answer_text,
            "citations": result.get("citations", []),
            "products": products,
            "task": result.get("task"),
            "constraints": result.get("constraints"),
            "audio_id": audio_id,
            "audio_url": audio_url,
            "audio_data": audio_data_base64,
            "step_log": result.get("step_log", [])
        })

        return QueryResponse(**sanitized_result)

    except Exception as e:
        logger.error(f"Query processing error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Query processing failed: {str(e)}"
        )


# ============================================================================
# Query Pipeline Streaming Endpoint (Real-time step logs)
# ============================================================================

@app.post("/api/query/stream", tags=["Query"])
async def process_query_stream(request: QueryRequest):
    """
    Process query with real-time streaming of step logs
    
    **Streaming Format:**
    Each line is a JSON object representing an event:
    - {"type": "step", "data": {...}}  - A completed step
    - {"type": "result", "data": {...}} - Final result
    - {"type": "error", "data": {...}}  - Error occurred
    
    **Example:**
    ```bash
    curl -X POST http://localhost:8000/api/query/stream \\
      -H "Content-Type: application/json" \\
      -d '{"query": "show me shoes"}'
    ```
    """
    import json
    import asyncio
    
    async def event_generator():
        try:
            # Session Management
            session_id = request.session_id or str(uuid.uuid4())
            if session_id not in SESSIONS:
                SESSIONS[session_id] = {"history": [], "seen_ids": set()}
            
            session_data = SESSIONS[session_id]
            chat_history = session_data["history"]
            seen_product_ids = list(session_data["seen_ids"])
            
            logger.info(f"Streaming query request: {request.query} (Session: {session_id})")
            
            # Create graph with streaming support
            graph = get_graph_app()
            
            # Initial state
            initial_state = {
                "query": request.query,
                "chat_history": chat_history,
                "seen_product_ids": seen_product_ids,
                "step_log": []
            }
            
            # Track previous step_log length to detect new steps
            previous_step_count = 0
            final_result = None
            
            # Stream through the graph
            for event in graph.stream(initial_state):
                # event is a dict with node name as key
                logger.info(f"Stream event: {list(event.keys())}")
                
                # Get the state after this node
                for node_name, node_state in event.items():
                    current_step_log = node_state.get("step_log", [])
                    
                    # Check if new steps were added
                    if len(current_step_log) > previous_step_count:
                        # Send new steps
                        for step in current_step_log[previous_step_count:]:
                            step_data = {
                                "type": "step",
                                "data": step
                            }
                            yield f"data: {json.dumps(step_data)}\n\n"
                            await asyncio.sleep(0.01)  # Small delay for client processing
                        
                        previous_step_count = len(current_step_log)
                    
                    # Store final state
                    final_result = node_state
            
            # Store final answer in history
            if final_result and final_result.get("answer"):
                answer_text = final_result.get("answer")
                chat_history.append({"role": "user", "content": request.query})
                chat_history.append({"role": "assistant", "content": answer_text})
                if len(chat_history) > 20:
                    SESSIONS[session_id]["history"] = chat_history[-20:]
                
                # Update seen_product_ids
                retrieved_docs = final_result.get("retrieved_docs", [])
                for doc in retrieved_docs:
                    doc_id = str(doc.get("doc_id", ""))
                    if doc_id:
                        SESSIONS[session_id]["seen_ids"].add(doc_id)
            
            # Generate TTS for answer
            audio_id = None
            audio_url = None
            audio_data_base64 = None
            
            if final_result and final_result.get("answer"):
                logger.info("Generating TTS for answer...")
                from voice.tts import get_tts_instance, map_voice
                from voice.translator import translate_text
                
                try:
                    default_voice = DEFAULT_TTS_VOICE or "sarah"
                    selected_voice = map_voice(request.voice) if request.voice else default_voice
                    logger.info(f"TTS voice selected for streaming query: {selected_voice}")
                    answer_text = final_result.get("answer") or ""
                    if not answer_text.strip():
                        answer_text = "I could not generate a detailed answer right now, please try again."
                    
                    # Translate if needed
                    text_to_speak = answer_text
                    if request.output_language and request.output_language.lower() not in ["en", "english", "us", "uk"]:
                        translated_text = translate_text(answer_text, request.output_language)
                        logger.info(f"Translated text: {translated_text[:50]}...")
                        text_to_speak = translated_text
                        # Update answer text for frontend display as well
                        answer_text = translated_text
                    
                    if request.return_audio_data:
                        # Return audio data directly (no file saving)
                        tts = get_tts_instance()
                        voice_id = tts.DEFAULT_VOICES.get(selected_voice, selected_voice)
                        tts_result = await tts.synthesize(text=text_to_speak, voice_id=voice_id)
                        audio_data_base64 = base64.b64encode(tts_result["audio_data"]).decode('utf-8')
                        logger.info(f"TTS audio data generated: {len(tts_result['audio_data'])} bytes")
                    else:
                        # Save to file (legacy behavior)
                        from voice.tts import synthesize_speech_async
                        audio_id = str(uuid.uuid4())
                        output_path = OUTPUT_DIR / f"{audio_id}.mp3"
                        await synthesize_speech_async(
                            text=text_to_speak,
                            output_path=str(output_path),
                            voice=selected_voice
                        )
                        audio_url = f"/api/tts/audio/{audio_id}"
                        logger.info(f"TTS saved to file: {audio_id}.mp3")
                        
                except Exception as tts_error:
                    logger.error(f"TTS error: {tts_error}")
            
            # Add 'cited' flag to products based on citations
            products = final_result.get("retrieved_docs", [])
            citations = final_result.get("citations", [])
            
            # Extract DOC numbers from citations (e.g., "DOC 1" -> 1)
            cited_doc_numbers = set()
            for citation in citations:
                match = re.search(r'DOC\s+(\d+)', citation)
                if match:
                    cited_doc_numbers.add(int(match.group(1)))
            
            # Add 'cited' flag to each product
            for idx, product in enumerate(products, start=1):
                product['cited'] = idx in cited_doc_numbers
            
            # Send final result (sanitize to remove NaN values)
            # answer_text might be updated by translation above
            logger.info(f"Sending final result - answer length: {len(answer_text)}, answer preview: {answer_text[:200]}")
            
            result_data = {
                "type": "result",
                "data": sanitize_data({
                    "success": True,
                    "session_id": session_id,
                    "query": request.query,
                    "answer": answer_text,  # This will be the translated text if translation occurred
                    "citations": final_result.get("citations", []),
                    "products": products,
                    "task": final_result.get("task"),
                    "constraints": final_result.get("constraints"),
                    "audio_id": audio_id,
                    "audio_url": audio_url,
                    "audio_data": audio_data_base64,
                    "step_log": final_result.get("step_log", [])
                })
            }
            yield f"data: {json.dumps(result_data)}\n\n"
            
            logger.info("Streaming query completed")
            
        except Exception as e:
            logger.error(f"Streaming query error: {e}", exc_info=True)
            error_data = {
                "type": "error",
                "data": {
                    "error": str(e),
                    "detail": f"Query processing failed: {str(e)}"
                }
            }
            yield f"data: {json.dumps(error_data)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable buffering in nginx
        }
    )


# ============================================================================
# ASR Endpoint (Local Whisper)
# ============================================================================

@app.post("/api/asr", tags=["ASR"])
async def transcribe_audio(
    audio_file: UploadFile = File(...),
    language: Optional[str] = Form(None)
):
    """
    Transcribe audio using local Whisper model
    
    **Uses Local Whisper:** No API key required!
    Runs faster-whisper on your machine for speech recognition.
    
    **Supported formats:** WAV, MP3, WebM, OGG
    
    **Example:**
    ```bash
    curl -X POST http://localhost:8000/api/asr \\
      -F "audio_file=@recording.wav" \\
      -F "language=zh"
    ```
    """
    try:
        logger.info(f"ASR request received: {audio_file.filename}, language={language}")
        
        # Read audio file contents
        contents = await audio_file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Empty audio file")
        
        logger.info(f"Audio file size: {len(contents)} bytes")
        
        # Import ASR module
        from voice.asr import get_asr_instance
        
        # Convert audio to proper format if needed
        import tempfile
        import subprocess
        from pathlib import Path
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(suffix=Path(audio_file.filename).suffix, delete=False) as tmp_input:
            tmp_input.write(contents)
            tmp_input_path = tmp_input.name
        
        # Convert to WAV 16kHz mono if not already
        # (faster-whisper works best with WAV format)
        tmp_output_path = tmp_input_path.replace(Path(audio_file.filename).suffix, "_converted.wav")
        
        try:
            # Try to convert using ffmpeg if available
            try:
                subprocess.run(
                    [
                        "ffmpeg", "-i", tmp_input_path,
                        "-ar", "16000",  # 16kHz sample rate
                        "-ac", "1",       # Mono
                        "-y",             # Overwrite output
                        tmp_output_path
                    ],
                    check=True,
                    capture_output=True
                )
                logger.info("Audio converted using ffmpeg")
                audio_path = tmp_output_path
            except (subprocess.CalledProcessError, FileNotFoundError):
                # ffmpeg not available, try to use original file
                logger.warning("ffmpeg not available, using original audio format")
                audio_path = tmp_input_path
            
            # Read audio data
            with open(audio_path, "rb") as f:
                audio_data = f.read()
            
            # Get ASR instance and transcribe (use CUDA and larger model for better accuracy)
            # 4090 GPU detected, using large-v3 model
            # Note: get_asr_instance uses singleton pattern, so language param here only affects first init.
            # However, we pass language explicitly to transcribe method below.
            asr = get_asr_instance(model="large-v3", device="cuda", language="en")
            
            # Pass specific language to transcribe method if provided
            result = await asr.transcribe(
                audio_data, 
                initial_prompt="Conversation about shopping for products on Amazon.",
                language=language
            )
            
            logger.info(f"Transcription completed: {len(result['text'])} characters")
            
            return {
                "success": True,
                "text": result["text"],
                "language": result.get("language", "en"),
                "confidence": result.get("language_probability", 1.0),
                "segments": len(result.get("segments", []))
            }
            
        finally:
            # Cleanup temporary files
            try:
                Path(tmp_input_path).unlink(missing_ok=True)
                Path(tmp_output_path).unlink(missing_ok=True)
            except Exception:
                pass
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ASR error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"ASR failed: {str(e)}")


# ============================================================================
# Cleanup Endpoint
# ============================================================================

@app.post("/api/cleanup", tags=["Admin"])
async def cleanup_old_audio_files(max_age_hours: int = 24):
    """
    Clean up audio files older than specified hours

    Useful for preventing disk space issues
    """
    import time

    deleted_count = 0
    current_time = time.time()
    max_age_seconds = max_age_hours * 3600

    for audio_file in OUTPUT_DIR.glob("*.mp3"):
        file_age = current_time - audio_file.stat().st_mtime
        if file_age > max_age_seconds:
            audio_file.unlink()
            deleted_count += 1

    logger.info(f"Cleanup: deleted {deleted_count} files older than {max_age_hours}h")

    return {
        "success": True,
        "deleted_count": deleted_count,
        "message": f"Cleaned up {deleted_count} files"
    }


# ============================================================================
# Error Handlers
# ============================================================================

@app.exception_handler(ValueError)
async def value_error_handler(request, exc):
    """Handle validation errors"""
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc)}
    )


# ============================================================================
# Startup Event
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize on startup"""
    logger.info("=" * 70)
    logger.info("Voice Shopping Assistant API Starting...")
    logger.info("=" * 70)
    logger.info(f"Output directory: {OUTPUT_DIR}")
    logger.info(f"CORS origins: {CORS_ORIGINS}")
    logger.info(f"ElevenLabs API configured: {bool(os.getenv('ELEVENLABS_API_KEY'))}")
    logger.info("=" * 70)

    # Warm-up heavy components before first request
    try:
        await warmup_components()
    except Exception as warmup_error:
        logger.warning(f"Startup warm-up failed: {warmup_error}")

    if not os.getenv("ELEVENLABS_API_KEY"):
        logger.warning("⚠️  ELEVENLABS_API_KEY not set! TTS will fail.")
        logger.warning("   Set it with: export ELEVENLABS_API_KEY='your-key-here'")
        logger.warning("   Get your key at: https://elevenlabs.io/app/settings/api-keys")
    else:
        logger.info("✅ ElevenLabs TTS is ready!")
        logger.info(f"   Using voice: {os.getenv('ELEVENLABS_DEFAULT_VOICE', 'sarah')}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "voice.api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
