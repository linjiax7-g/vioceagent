# Voice Shopping Assistant — Frontend

A modern React + TypeScript voice shopping assistant frontend application providing an intuitive voice interaction interface and product display functionality.

## Core Features

- **Voice Interaction**: Real-time speech recognition and synthesis, supports continuous conversation
- **Intelligent Dialogue**: Integrated AI assistant that understands natural language shopping needs
- **Product Display**: Beautiful product cards with images, prices, ratings, and more
- **Agent Logs**: Visualize AI agent thinking process and execution steps
- **Modern UI**: Beautiful interface design based on Lucide Icons
- **Responsive Design**: Support for desktop and mobile devices
- **Audio Waveform**: Real-time audio waveform display and playback controls

## Interface Overview

The application includes three main panels:
- **Left**: AI chat interface (voice/text input)
- **Center**: Product search results display
- **Right**: Agent execution logs (expandable/collapsible)

## Project Structure

```
frontend_TTS/
├── public/                                 # Static assets
│   ├── vite.svg
│   └── marketing_sample_for_amazon_com... # Product metadata CSV
│
├── src/
│   ├── components/                         # React components
│   │   ├── AIChat.tsx                      # AI chat component
│   │   ├── AILog.tsx                       # Single log entry component
│   │   ├── AgentLogPanel.tsx               # Agent log panel
│   │   └── ResultPanel.tsx                 # Product result panel
│   │
│   ├── assets/                             # Asset files
│   │   └── react.svg
│   │
│   ├── ShopifyVoiceAssistant.tsx           # Main application component
│   ├── App.tsx                             # Application entry
│   ├── main.tsx                            # React render entry
│   ├── App.css                             # Application styles
│   └── index.css                           # Global styles
│
├── dist/                                   # Build output directory
├── node_modules/                           # Dependencies
├── package.json                            # Project configuration
├── tsconfig.json                           # TypeScript configuration
├── vite.config.ts                          # Vite configuration
├── vercel.json                             # Vercel deployment configuration
├── FRONTEND_ENV_EXAMPLE                    # Environment variables example
└── README.md                               # This file
```

## Quick Start

### 1. Requirements

- **Node.js**: 18.0+ or 20.0+
- **npm**: 8.0+

### 2. Install Dependencies

```bash
# Navigate to frontend directory
cd frontend_TTS

# Install dependencies
npm install
```

### 3. Environment Configuration

Create `.env` file (refer to `FRONTEND_ENV_EXAMPLE`):

```bash
# Backend API URL
VITE_API_URL=http://localhost:8000
```

### 4. Start Development Server

```bash
# Development mode (hot reload)
npm run dev

# Access at: http://localhost:5173
```

### 5. Build Production Version

```bash
# Build
npm run build

# Preview build result
npm run preview
```

## Backend Connection

### Prerequisites

Ensure backend service is running:

```bash
# In agentic-shopping-voice-assistant directory
uvicorn backend.api_gateway:app --reload --port 8000
```

### API Endpoints

The frontend calls the following backend endpoints:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/query` | Send user query, get AI response and product recommendations |
| `POST /api/tts` | Text-to-speech |
| `POST /api/asr` | Speech-to-text |
| `GET /api/tts/audio/{id}` | Get generated audio file |

### Connection Test

1. Start backend (port 8000)
2. Start frontend (port 5173)
3. Open http://localhost:5173 in browser
4. Click microphone button or enter text to test

## Main Features

### 1. Voice Interaction

**Recording Feature**:
- Click microphone icon to start recording
- Real-time display of recording duration and waveform
- Support real-time speech-to-text (using browser Web Speech API)
- Click again to stop recording and send to backend for processing

**Audio Playback**:
- AI replies automatically converted to voice playback
- Display playback progress and waveform animation
- Support pause/resume playback

### 2. Text Input

- Bottom text input box, supports Enter key to send
- Suitable for scenarios where voice input is inconvenient

### 3. Product Display

**Product Card Contains**:
- Product image (loaded from CSV metadata)
- Product title and ID
- Price information
- Rating and review count
- Similarity score
- Product detail link

**Interactive Features**:
- Click product card to view details
- Hover effects and highlighting
- Quick navigation to product details

### 4. Agent Logs

**Visual Display**:
- Router routing decisions
- Planner search planning
- Retriever retrieval process (RAG + Web)
- Answerer answer generation

**Log Format**:
- Node name and timestamp
- Execution results (JSON formatted)
- Color coding (different colors for different nodes)

### 5. Conversation History

- Display user and assistant conversation records
- Timestamp annotation
- Auto-scroll to latest message

## Component Details

### ShopifyVoiceAssistant.tsx

Main application component responsible for:
- State management (recording, processing, results, etc.)
- API calls and data processing
- Coordinating sub-component interactions
- Loading product metadata (CSV)

```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
```

### AIChat.tsx

AI chat interface component:
- Display conversation history
- Voice recording controls
- Text input box
- Recording waveform animation
- Processing status display

### ResultPanel.tsx

Product result display component:
- Product list rendering
- Product detail modal
- Image lazy loading
- Responsive layout

### AgentLogPanel.tsx

Agent log panel component:
- Expandable/collapsible
- Real-time log stream
- JSON formatted display
- Color coding

## Technology Stack

### Core Framework
- **React** 19.2.0 - UI framework
- **TypeScript** 5.9.3 - Type safety
- **Vite** (Rolldown) 7.2.5 - Build tool

### UI Library
- **Lucide React** 0.554.0 - Icon library
- **CSS3** - Styling (custom CSS, no UI framework)

### Data Processing
- **PapaParse** 5.5.3 - CSV parsing (load product metadata)

### Browser APIs
- **Web Speech API** - Browser speech recognition
- **MediaRecorder API** - Audio recording
- **Web Audio API** - Audio analysis and waveform

### Development Tools
- **ESLint** - Code linting
- **TypeScript ESLint** - TS code standards

## Dependency Management

### Production Dependencies

```json
{
  "lucide-react": "^0.554.0",    // Icon library
  "papaparse": "^5.5.3",         // CSV parsing
  "react": "^19.2.0",            // React core
  "react-dom": "^19.2.0"         // React DOM
}
```

### Development Dependencies

```json
{
  "@vitejs/plugin-react": "^5.1.1",
  "eslint": "^9.39.1",
  "typescript": "~5.9.3",
  "vite": "npm:rolldown-vite@7.2.5"
}
```

## Use Cases

### Scenario 1: Voice Shopping

1. Click microphone button
2. Say your needs: "I want to buy a laptop for gaming"
3. AI analyzes needs and searches products
4. View recommended product list
5. Click product to view details

### Scenario 2: Product Comparison

1. Enter text: "Compare MacBook Pro and Dell XPS"
2. AI performs comparison analysis
3. View comparison results and recommendations
4. Check agent logs to understand analysis process

### Scenario 3: Multi-turn Conversation

1. User: "Recommend a Bluetooth headset"
2. AI: "Here are some highly-rated Bluetooth headsets..."
3. User: "Under $100?"
4. AI: "I've filtered options under $100..."

## Custom Styling

### Theme Colors

Modify in `src/App.css` or `src/index.css`:

```css
:root {
  --primary-color: #4a90e2;
  --secondary-color: #f5f7fa;
  --text-color: #333;
  --border-color: #e0e0e0;
}
```

### Layout Adjustment

The main application uses Flexbox layout, adjust proportions in `ShopifyVoiceAssistant.tsx`:

```typescript
<div style={{ 
  display: 'flex', 
  gap: '1rem',
  flex: '1 1 0', // Left chat
  minWidth: '400px' 
}}>
```

## Troubleshooting

### Common Issues

**1. Cannot connect to backend**

- Check if `VITE_API_URL` in `.env` is correct
- Confirm backend service is running (http://localhost:8000/health)
- Check browser console for network request errors

**2. Voice recognition not working**

- Ensure using HTTPS or localhost (browser security restrictions)
- Check if microphone permissions are granted
- Some browsers don't support Web Speech API (Chrome recommended)

**3. Product images not displaying**

- Confirm `public/marketing_sample_for_amazon_com...csv` file exists
- Check browser console for image loading errors
- Some image URLs may be expired (from Amazon)

**4. Audio playback failure**

- Check if backend TTS functionality is working
- Confirm `OPENAI_API_KEY` is configured correctly
- Check if audio files are successfully generated in network requests

### Debugging Tips

**Open Browser Developer Tools**:
- F12 or Right-click → Inspect
- View Console tab for logs
- View Network tab for API requests

**Test API Response**:

```javascript
// Test API in browser console
fetch('http://localhost:8000/health')
  .then(r => r.json())
  .then(console.log);
```

## Deployment

### Vercel Deployment (Recommended)

Project includes `vercel.json` configuration:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Environment variable settings:
- Add `VITE_API_URL` in Vercel project settings
- Point to production backend URL

### Other Platform Deployment

**Netlify**:

```bash
npm run build
# Upload dist/ directory to Netlify
```

**Nginx**:

```bash
npm run build

# Copy dist/ directory to Nginx static directory
cp -r dist/* /var/www/html/
```

Nginx configuration example:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Proxy backend API
    location /api/ {
        proxy_pass http://localhost:8000;
    }
}
```

## Development Guide

### Add New Component

```typescript
// src/components/NewComponent.tsx
import React from 'react';

interface NewComponentProps {
  data: string;
}

const NewComponent: React.FC<NewComponentProps> = ({ data }) => {
  return <div>{data}</div>;
};

export default NewComponent;
```

### Call New API Endpoint

```typescript
const callNewAPI = async (params: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/new-endpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API Error:', error);
  }
};
```

### Add New Product Field

1. Update CSV data file
2. Modify `ProductMetadata` type
3. Update CSV parsing logic
4. Display new field in `ResultPanel.tsx`

## Security Considerations

- Do not hardcode API keys in frontend code
- Use environment variables to manage configuration
- Enable HTTPS in production environment
- Validate user input to prevent XSS attacks
- Set appropriate CORS policies

## License

This project is for learning and research purposes only.

## Contributing

Issues and Pull Requests are welcome!

### Development Workflow

1. Fork this project
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## Contact

For questions or suggestions, please submit an Issue.

---

**Related Projects**:
- Backend project: `../agentic-shopping-voice-assistant/`
- Backend API documentation: http://localhost:8000/docs

**Quick Links**:
- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/)
- [Lucide Icons](https://lucide.dev/)
