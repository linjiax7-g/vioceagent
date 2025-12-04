# Agentic Shopping Voice Assistant — Backend

An intelligent voice shopping assistant backend system based on LangGraph and FastAPI, integrated with RAG (Retrieval-Augmented Generation), real-time web search, and voice processing capabilities.

## Core Features

- **Intelligent Agent Pipeline**: LangGraph-based Router → Planner → Retriever → Answerer workflow
- **Hybrid Retrieval System**: Private FAISS/ChromaDB vector database + real-time web search
- **Voice Processing**: Integrated OpenAI TTS (Text-to-Speech) and Whisper ASR (Automatic Speech Recognition)
- **MCP Tool Integration**: Support for `web.search` and `rag.search` tool calls
- **Unified API Gateway**: FastAPI-driven RESTful API
- **Product Data Management**: Support for Amazon product dataset indexing and retrieval

## Project Structure

```
agentic-shopping-voice-assistant/
├── backend/                    # Unified API Gateway (FastAPI)
│   ├── __init__.py
│   └── api_gateway.py          # Main FastAPI app - handles all requests
│
├── graph/                      # LangGraph intelligent agent pipeline
│   ├── graph.py                # Main workflow graph definition
│   ├── nodes.py                # Node implementations
│   ├── state.py                # State management
│   ├── strategies.py           # Search strategies
│   ├── router/                 # Router node: analyzes query type
│   │   ├── parser.py
│   │   └── prompts.py
│   ├── planner/                # Planner node: creates search plan
│   │   ├── parser.py
│   │   └── prompts.py
│   ├── retriever/              # Retriever node: RAG + Web search
│   │   ├── rag.py              # Vector database retrieval
│   │   └── web.py              # Web search integration
│   ├── answerer/               # Answerer node: generates final answer
│   │   ├── parser.py
│   │   └── prompts.py
│   ├── models/                 # LLM model configuration
│   │   └── llm.py
│   └── tools/                  # MCP client tools
│       └── mcp_client.py
│
├── mcp_server/                 # MCP server implementation
│   ├── server_stdio.py         # MCP standard I/O server
│   ├── tools/
│   │   ├── rag_tool.py         # RAG retrieval tool
│   │   └── web_tool.py         # Serper web search tool
│   └── util/
│       ├── cache.py            # Cache management
│       └── logger.py           # Logging utilities
│
├── voice/                      # Voice processing modules
│   ├── asr.py                  # Speech recognition (Whisper)
│   └── tts.py                  # Text-to-speech (OpenAI TTS)
│
├── scripts/                    # Data processing scripts
│   ├── extract_metadata.py    # Extract product metadata
│   └── index_data.py           # Vector database indexing
│
├── data/                       # Product datasets
│   ├── amazon_enriched.parquet # Enhanced product data
│   └── data_cleaned.csv        # Cleaned data
│
├── chroma_db/                  # ChromaDB vector storage
├── tts_output/                 # Generated audio files (MP3)
├── tests/                      # Test suites
│   ├── test_router.py
│   ├── test_planner.py
│   ├── test_retriever.py
│   └── test_answerer.py
│
├── requirements.txt            # Python dependencies
├── start_api.sh                # API startup script (Linux/Mac)
├── start_backend_venv.ps1      # API startup script (Windows)
└── README.md                   # This file
```

## Quick Start

### 1. Environment Setup

**Python Version**: Python 3.9+

```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Environment Configuration

Create a `.env` file (or `.env.local`) in the project root directory with the following configuration:

```bash
# Required API keys
OPENAI_API_KEY=sk-...                    # OpenAI API (for TTS and LLM)
GROQ_API_KEY=gsk_...                     # Groq API (for fast inference)
SERPER_API_KEY=...                       # Serper API (for web search)

# Optional: Data files (Google Drive)
DATA_DRIVE_ID=...                        # Product data file ID
EMB_DRIVE_ID=...                         # Embedding vector file ID

# Optional: CORS configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Optional: Log level
LOG_LEVEL=INFO
```

### 3. Data Preparation (First Run)

If you need to re-index data:

```bash
# Extract product metadata
python scripts/extract_metadata.py

# Create vector index
python scripts/index_data.py
```

### 4. Start Backend Service

**Method 1: Use startup script (recommended)**

```bash
# Linux/Mac
./start_api.sh

# Windows PowerShell
.\start_backend_venv.ps1
```

**Method 2: Start directly with uvicorn**

```bash
cd agentic-shopping-voice-assistant
uvicorn backend.api_gateway:app --reload --port 8000 --host 0.0.0.0
```

After the service starts, access:
- **API Documentation**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

## API Endpoints

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/query` | POST | Complete voice query pipeline (Query → LangGraph → TTS) |
| `/api/tts` | POST | Text-to-speech |
| `/api/asr` | POST | Speech-to-text |
| `/api/tts/audio/{audio_id}` | GET | Get generated audio file |

### Request Examples

**Complete Query Flow**

```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "I need a laptop for office work",
    "generate_audio": true
  }'
```

**Text-to-Speech**

```bash
curl -X POST http://localhost:8000/api/tts \
  -H "Content-Type: application/json" \
  -d '{
    "text": "This is a high-performance laptop",
    "voice": "nova"
  }'
```

**Speech-to-Text**

```bash
curl -X POST http://localhost:8000/api/asr \
  -F "audio_file=@recording.wav"
```

## Testing

Run test suites:

```bash
# Run all tests
pytest tests/

# Run specific test
pytest tests/test_router.py
pytest tests/test_planner.py
pytest tests/test_retriever.py
pytest tests/test_answerer.py

# With verbose output
pytest -v tests/

# With coverage report
pytest --cov=graph --cov=mcp_server tests/
```

## Frontend Integration

This backend is designed to work with a React frontend (located in `../frontend_TTS`).

### Integration Steps:

1. **Start backend service** (this project)
   ```bash
   uvicorn backend.api_gateway:app --reload --port 8000
   ```

2. **Configure frontend environment variables**
   
   Set in `frontend_TTS/.env`:
   ```bash
   VITE_API_URL=http://localhost:8000
   ```

3. **Start frontend service**
   ```bash
   cd ../frontend_TTS
   npm install
   npm run dev
   ```

4. **Access application**: http://localhost:5173

The frontend will call the following backend endpoints:
- `POST /api/query` - Complete voice conversation flow
- `POST /api/tts` - Text-to-speech
- `POST /api/asr` - Speech recognition
- `GET /api/tts/audio/{id}` - Audio playback

## Technology Stack

### Core Framework
- **LangGraph** 0.2.0+ - Intelligent agent orchestration
- **LangChain** 0.3.0+ - LLM application framework
- **FastAPI** - High-performance web framework
- **MCP** 0.9.0+ - Model Context Protocol

### Voice Processing
- **Faster-Whisper** 1.0.0+ - Local speech recognition
- **OpenAI TTS** - Text-to-speech
- **PyDub** - Audio processing

### Data & Retrieval
- **FAISS** - Vector similarity search
- **ChromaDB** - Vector database
- **Sentence-Transformers** - Text embeddings
- **Pandas** + **PyArrow** - Data processing

### LLM Providers
- **OpenAI** - GPT-4, GPT-3.5-turbo
- **Groq** - Fast inference
- **Serper** - Web search API

## How It Works

### LangGraph Workflow

```
User Query
    ↓
┌─────────────┐
│   Router    │ Identify query type (product search/general chat/comparison etc.)
└─────────────┘
    ↓
┌─────────────┐
│   Planner   │ Create search strategy and keywords
└─────────────┘
    ↓
┌─────────────┐
│  Retriever  │ Execute RAG retrieval + web search
└─────────────┘
    ↓
┌─────────────┐
│  Answerer   │ Generate structured answer (product recommendations + conversation reply)
└─────────────┘
    ↓
TTS (optional) → Audio output
```

### MCP Tools

The system integrates two core tools through MCP protocol:

1. **rag.search** - Search products in private vector database
   - Input: Query text, filter conditions
   - Output: Relevant product list (with metadata and similarity scores)

2. **web.search** - Real-time web search
   - Input: Search keywords
   - Output: Web search results

## Development Guide

### Add New LLM Provider

```python
# In graph/models/llm.py
from langchain_anthropic import ChatAnthropic

def get_llm(model_name: str = "claude-3-sonnet"):
    return ChatAnthropic(
        model=model_name,
        temperature=0.7
    )
```

### Custom Retrieval Strategy

```python
# In graph/strategies.py
class CustomStrategy:
    def should_use_rag(self, query: str) -> bool:
        # Custom logic
        return True
    
    def should_use_web(self, query: str) -> bool:
        # Custom logic
        return False
```

### Extend MCP Tools

Create new tools in `mcp_server/tools/` directory:

```python
# mcp_server/tools/custom_tool.py
from mcp import Tool

class CustomSearchTool(Tool):
    name = "custom.search"
    description = "Custom search tool"
    
    async def run(self, query: str) -> dict:
        # Implement search logic
        return {"results": [...]}
```

## Troubleshooting

### Common Issues

1. **Vector database not found**
   ```bash
   # Re-index data
   python scripts/index_data.py
   ```

2. **CUDA/GPU errors**
   ```bash
   # Use CPU version of FAISS
   pip install faiss-cpu
   ```

3. **Audio files not generated**
   - Check if `OPENAI_API_KEY` is configured correctly
   - Ensure `tts_output/` directory exists and is writable

4. **CORS errors**
   - Add frontend URL to `CORS_ORIGINS` in `.env`
   - Example: `CORS_ORIGINS=http://localhost:5173,http://localhost:3000`

### View Logs

```bash
# View MCP tool logs
tail -f mcp_logs.jsonl

# View API logs (if using startup script)
tail -f api.log
```

## License

This project is for learning and research purposes only.

## Contributing

Issues and Pull Requests are welcome!

## Contact

For questions or suggestions, please submit an Issue.

---

**Related Projects**:
- Frontend project: `../frontend_TTS/`
- Complete setup guide: `SETUP_GUIDE.md` (if exists)
