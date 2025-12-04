import { useState, useRef, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import AIChat from './components/AIChat';
import ResultPanel from './components/ResultPanel';
import AgentLogPanel from './components/AgentLogPanel';
import VoiceSettings, { type VoiceConfig } from './components/VoiceSettings';

type ProductMetadata = {
  imageUrl?: string;
  productUrl?: string;
};

type MarketingCsvRow = {
  'Uniq Id'?: string;
  Image?: string;
  'Product Url'?: string;
};

const MARKETING_DATA_FILE = '/marketing_sample_for_amazon_com-ecommerce__20200101_20200131__10k_data.csv';

const ShopifyVoiceAssistant = () => {
  // State
  const [recordingState, setRecordingState] = useState('idle');
  const [audioBlob, setAudioBlob] = useState<any>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentAgentStep, setCurrentAgentStep] = useState<any>(null);
  const [agentSteps, setAgentSteps] = useState<any[]>([]);
  const agentStepsRef = useRef<any[]>([]);
  const [result, setResult] = useState<any>(null);
  const [answerTtsProgress, setAnswerTtsProgress] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isPlayingAnswerTTS, setIsPlayingAnswerTTS] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{type: 'user' | 'assistant', text: string, timestamp: string}>>([
    {
      type: 'assistant',
      text: "Hello! I'm your shopping assistant. I can help you find products, compare options, or check prices. What are you looking for today?",
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [productMetadata, setProductMetadata] = useState<Record<string, ProductMetadata>>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [autoPlayAudioUrl, setAutoPlayAudioUrl] = useState<string>('');
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>(() => {
    // Load from localStorage or use default
    const saved = localStorage.getItem('voiceConfig');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { agentVoice: 'sarah', userVoice: 'sarah' };
      }
    }
    return { agentVoice: 'sarah', userVoice: 'sarah' };
  });

  // Refs
  const recordingIntervalRef = useRef<any>(null);
  const waveformIntervalRef = useRef<any>(null);
  const mediaRecorderRef = useRef<any>(null);
  const audioContextRef = useRef<any>(null);
  const analyserRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const answerAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const API_BASE_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000';

  // Save voice config to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('voiceConfig', JSON.stringify(voiceConfig));
  }, [voiceConfig]);

  const handleSaveVoiceSettings = (settings: VoiceConfig) => {
    setVoiceConfig(settings);
    console.log('Voice settings saved:', settings);
  };

  useEffect(() => {
    let isCancelled = false;

    const splitValues = (value?: string) =>
      value
        ?.split('|')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0) ?? [];

    const pickImage = (urls: string[]) =>
      urls.find((url) => url && !url.toLowerCase().includes('transparent-pixel'));

    fetch(MARKETING_DATA_FILE)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load marketing dataset (${response.status})`);
        }
        return response.text();
      })
      .then((csvText) => {
        Papa.parse<MarketingCsvRow>(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            if (isCancelled) {
              return;
            }

            const metadata: Record<string, ProductMetadata> = {};
            results.data.forEach((row) => {
              if (!row) return;
              const docId = row['Uniq Id']?.trim();
              if (!docId) return;

              const imageUrl = pickImage(splitValues(row.Image));
              const productUrl = splitValues(row['Product Url']).at(0);

              if (imageUrl || productUrl) {
                metadata[docId] = {
                  imageUrl,
                  productUrl
                };
              }
            });

            setProductMetadata(metadata);

            if (results.errors.length > 0) {
              console.warn('Marketing CSV parsed with warnings:', results.errors);
            }
          },
          error: (error) => {
            if (!isCancelled) {
              console.error('Failed to parse marketing dataset', error);
            }
          }
        });
      })
      .catch((error) => {
        if (!isCancelled) {
          console.error('Failed to load marketing dataset', error);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  // Helper function: format backend steps for frontend display
  const formatStep = (step: any, index: number) => {
    let message = '';
    let detail = '';
    const additionalInfo: any[] = [];
    
    if (step.node === 'router') {
      message = 'Intent Classification';
      
      if (step.success) {
        const task = step.output?.task || 'unknown';
        const constraints = step.output?.constraints || {};
        const safety_flags = step.output?.safety_flags || [];
        
        detail = `Task identified: ${task}`;
        
        // Display constraint details
        if (Object.keys(constraints).length > 0) {
          const constraintDetails: string[] = [];
          if (constraints.product) constraintDetails.push(`Product: ${constraints.product}`);
          if (constraints.category) constraintDetails.push(`Category: ${constraints.category}`);
          if (constraints.brand) constraintDetails.push(`Brand: ${constraints.brand}`);
          if (constraints.material) constraintDetails.push(`Material: ${constraints.material}`);
          if (constraints.min_price !== undefined || constraints.max_price !== undefined) {
            const priceRange = [];
            if (constraints.min_price) priceRange.push(`min: $${constraints.min_price}`);
            if (constraints.max_price) priceRange.push(`max: $${constraints.max_price}`);
            constraintDetails.push(`Price: ${priceRange.join(', ')}`);
          }
          if (constraints.min_rating) constraintDetails.push(`Min rating: ${constraints.min_rating}★`);
          
          additionalInfo.push({
            label: 'Constraints',
            value: constraintDetails.join(' | ')
          });
        }
        
        // Display safety flags
        if (safety_flags.length > 0) {
          additionalInfo.push({
            label: 'Safety Flags',
            value: safety_flags.join(', ')
          });
        }
        
        // Display original input
        if (step.input) {
          additionalInfo.push({
            label: 'User Query',
            value: step.input
          });
        }
      } else {
        detail = `Error: ${step.error || 'Unknown error'}`;
        if (step.fallback_reason) {
          additionalInfo.push({
            label: 'Fallback',
            value: `${step.fallback_reason} → Task: ${step.task_after_fallback}`
          });
        }
      }
      
    } else if (step.node === 'planner') {
      message = 'Retrieval Planning';
      
      if (step.success) {
        const plan = step.output || {};
        const sources = plan.sources || [];
        
        detail = `Strategy: ${sources.join(' + ') || 'N/A'}`;
        
        // Display data sources
        if (sources.length > 0) {
          const sourceDisplay = sources.map((s: string) => {
            if (s === 'private_rag') return 'Private Catalog';
            if (s === 'web_search') return 'Web Search';
            return s;
          }).join(' + ');
          
          additionalInfo.push({
            label: 'Data Sources',
            value: sourceDisplay
          });
        }
        
        // Display retrieval fields
        if (plan.retrieval_fields && plan.retrieval_fields.length > 0) {
          additionalInfo.push({
            label: 'Retrieval Fields',
            value: plan.retrieval_fields.join(', ')
          });
        }
        
        // Display comparison criteria
        if (plan.comparison_criteria && plan.comparison_criteria.length > 0) {
          additionalInfo.push({
            label: 'Comparison Criteria',
            value: plan.comparison_criteria.join(', ')
          });
        }
        
        // Display filters
        if (plan.filters && Object.keys(plan.filters).length > 0) {
          additionalInfo.push({
            label: 'Filters',
            value: JSON.stringify(plan.filters)
          });
        }
      } else {
        detail = `Error: ${step.error || 'Unknown error'}`;
        if (step.fallback_reason) {
          additionalInfo.push({
            label: 'Fallback',
            value: step.fallback_reason
          });
        }
        if (step.plan_after_fallback) {
          additionalInfo.push({
            label: 'Fallback Plan',
            value: `Sources: ${step.plan_after_fallback.sources?.join(', ')}`
          });
        }
      }
      
    } else if (step.node === 'rag_retriever') {
      message = 'Product Retrieval (Private Catalog)';
      
      if (step.success) {
        const numDocs = step.output?.num_docs || 0;
        detail = `Found ${numDocs} product${numDocs !== 1 ? 's' : ''} in catalog`;
        
        additionalInfo.push({
            label: 'Results',
          value: `${numDocs} documents`
        });
        
        if (step.input?.query) {
          additionalInfo.push({
            label: 'Search Query',
            value: step.input.query
          });
        }
        
        if (step.input?.filters && Object.keys(step.input.filters).length > 0) {
          additionalInfo.push({
            label: 'Applied Filters',
            value: JSON.stringify(step.input.filters)
          });
        }
      } else {
        detail = `Error: ${step.error || 'Unknown error'}`;
      }
      
    } else if (step.node === 'web_retriever') {
      message = 'Product Retrieval (Web Search)';
      
      if (step.success) {
        const numDocs = step.output?.num_docs || 0;
        detail = `Found ${numDocs} product${numDocs !== 1 ? 's' : ''} online`;
        
        additionalInfo.push({
            label: 'Web Results',
          value: `${numDocs} documents`
        });
        
        if (step.input?.query) {
          additionalInfo.push({
            label: 'Search Query',
            value: step.input.query
          });
        }
      } else {
        detail = `Error: ${step.error || 'Unknown error'}`;
      }
      
    } else if (step.node === 'hybrid_retriever') {
      message = 'Product Retrieval (Hybrid Search)';
      
      if (step.success) {
        const numDocs = step.output?.num_docs || 0;
        const ragDocs = step.output?.rag_docs || 0;
        const webDocs = step.output?.web_docs || 0;
        
        detail = `Combined ${numDocs} results (${ragDocs} catalog + ${webDocs} web)`;
        
        additionalInfo.push({
            label: 'Catalog Results',
          value: `${ragDocs} documents`
        });
        
        additionalInfo.push({
            label: 'Web Results',
          value: `${webDocs} documents`
        });
        
        additionalInfo.push({
            label: 'Total',
          value: `${numDocs} documents`
        });
        
        if (step.input?.query) {
          additionalInfo.push({
            label: 'Search Query',
            value: step.input.query
          });
        }
      } else {
        detail = `Error: ${step.error || 'Unknown error'}`;
      }
      
    } else if (step.node === 'answerer') {
      message = 'Answer Generation';
      
      if (step.success) {
        const citations = step.output?.citations || [];
        const numDocs = step.input?.num_docs || 0;
        
        detail = `Synthesized response from ${numDocs} source${numDocs !== 1 ? 's' : ''}`;
        
        additionalInfo.push({
            label: 'Sources Used',
          value: `${numDocs} documents`
        });
        
        if (citations.length > 0) {
          additionalInfo.push({
            label: 'Citations',
            value: citations.join(', ')
          });
        }
        
        if (step.output?.answer) {
          const preview = step.output.answer.length > 100 
            ? step.output.answer.substring(0, 100) + '...'
            : step.output.answer;
          additionalInfo.push({
            label: 'Preview',
            value: preview
          });
        }
        
        if (step.input?.query) {
          additionalInfo.push({
            label: 'Original Query',
            value: step.input.query
          });
        }
      } else {
        detail = `Error: ${step.error || 'Unknown error'}`;
      }
      
    } else {
      // Unknown node type - display raw data
      message = step.node;
      detail = step.success ? 'Completed' : `Error: ${step.error || 'Unknown'}`;
      
      if (step.output) {
        additionalInfo.push({
            label: 'Output',
          value: JSON.stringify(step.output)
        });
      }
      if (step.input) {
        additionalInfo.push({
            label: 'Input',
          value: JSON.stringify(step.input)
        });
      }
    }
    
    return {
      node: step.node,
      status: step.success ? 'completed' : 'error',
      message,
      detail,
      additionalInfo,
      timestamp: index * 0.8,
      rawData: step  // Keep raw data for detailed viewing
    };
  };

  const mockResult = {
    query: "Recommend an eco-friendly stainless-steel cleaner under fifteen dollars.",
    answer: "I found 3 products matching your criteria. My top recommendation is Brand X Steel-Safe Eco Cleaner—it has a 4.6★ rating with over 2,800 reviews and is typically priced at $12.49. This product uses plant-based surfactants and is fully biodegradable. I've also identified 2 alternative options that may suit your needs.",
    task: 'recommendation',
    constraints: {
      price: { min: 0, max: 15 },
      material: 'Eco-Friendly',
      category: 'Cleaner'
    },
    products: [
      {
        id: 1,
        title: 'Brand X Steel-Safe Eco Cleaner',
        price: 12.49,
        rating: 4.6,
        ratingCount: 2843,
        brand: 'Brand X',
        material: 'Stainless Steel + Eco',
        description: 'Plant-based surfactants, biodegradable formula',
        source: [{ type: 'private', docId: 'B07XYZ123', label: 'Catalog' }, { type: 'web', url: 'https://amazon.com', label: 'Amazon' }],
        ingredients: 'Water, plant-based surfactants, essential oils',
        reviewSample: "Best eco-friendly cleaner I've used. Doesn't streak!"
      },
      {
        id: 2,
        title: 'Brand Y Eco Clear Cleaner',
        price: 14.99,
        rating: 4.2,
        ratingCount: 1203,
        brand: 'Brand Y',
        material: 'Stainless Steel',
        description: 'Natural ingredients, no harsh chemicals',
        source: [{ type: 'web', url: 'https://walmart.com', label: 'Walmart' }],
        ingredients: 'Water, plant extracts, vinegar',
        reviewSample: 'Great value, mild smell'
      },
      {
        id: 3,
        title: 'Budget Shine Cleaner',
        price: 9.99,
        rating: 3.8,
        ratingCount: 456,
        brand: 'Budget Shine',
        material: 'Plastic Safe',
        description: 'Affordable all-purpose cleaner',
        source: [{ type: 'private', docId: 'B09ABC789', label: 'Catalog' }],
        ingredients: 'Water, cleaning agents, alcohol',
        reviewSample: 'Good for the price, slight chemical smell'
      }
    ],
    stepLog: [
      { node: 'router', status: 'completed', message: 'Intent Classification', detail: 'Identified: Recommendation task. Constraints: price ≤ $15, material: eco-friendly', timestamp: 0 },
      { node: 'planner', status: 'completed', message: 'Retrieval Planning', detail: 'Planned hybrid search: Private RAG + Live web search', timestamp: 0.8 },
      { node: 'retriever', status: 'completed', message: 'Product Retrieval', detail: 'Retrieved 5 products. Filtered to 3 eco-friendly items under $15', timestamp: 1.6 },
      { node: 'answerer', status: 'completed', message: 'Answer Generation', detail: 'Generated natural language response with citations', timestamp: 2.4 }
    ]
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      const mimeType = (window as any).MediaRecorder && (window as any).MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/wav';
      const mediaRecorder = new MediaRecorder(stream as MediaStream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e: any) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        setAudioBlob(blob);
      };
      setRecordingState('recording');
      setRecordingTime(0);
      setLiveTranscript('');
      setFinalTranscript('');  // Clear old transcription content
      setWaveformData([]);
      mediaRecorder.start();
      recordingIntervalRef.current = setInterval(() => { setRecordingTime((t) => t + 100); }, 100);
      const audioContext = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream as MediaStream);
      source.connect(analyser);
      analyserRef.current = analyser;
      waveformIntervalRef.current = setInterval(() => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setWaveformData((prev) => [...prev.slice(-19), avg]);
      }, 50);
      try {
        const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SR) {
          const recognition = new SR();
          recognitionRef.current = recognition;
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';
          recognition.onresult = (event: any) => {
            let interim = '';
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const tr = event.results[i][0].transcript.trim();
              if (event.results[i].isFinal) {
                final += tr + ' ';
              } else {
                interim += tr + ' ';
              }
            }
            
            if (final) {
              setFinalTranscript((prev) => {
                const newFinal = prev ? `${prev} ${final}`.trim() : final.trim();
                setTextInput(newFinal);
                return newFinal;
              });
              setLiveTranscript('');
            } else if (interim) {
              setLiveTranscript(interim.trim());
              const baseText = finalTranscript;
              if (baseText) {
                setTextInput(`${baseText} ${interim}`.trim());
              } else {
                setTextInput(interim.trim());
              }
            }
          };
          recognition.onerror = () => {};
          recognition.onend = () => {};
          recognition.start();
        }
      } catch (e) {
        // ignore recognition errors
      }
    } catch (err) {
      alert('Microphone access denied. Please allow microphone access in your browser settings.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    }
    clearInterval(recordingIntervalRef.current);
    clearInterval(waveformIntervalRef.current);
    setRecordingState('idle');
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    
    const transcript = finalTranscript || liveTranscript;
    if (transcript) {
      setTextInput(transcript);
      setFinalTranscript(transcript);
      setLiveTranscript('');
    } else {
      setTimeout(() => {
        if (audioBlob || mediaRecorderRef.current) {
          const fd = new FormData();
          const blob = audioBlob || new Blob([], { type: 'audio/wav' });
          const file = new File([blob], 'recording.wav', { type: blob.type || 'audio/wav' });
          fd.append('audio_file', file);
          fetch(`${API_BASE_URL}/api/asr`, { method: 'POST', body: fd })
            .then(async (r) => {
              if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                throw new Error(err.detail || 'ASR failed');
              }
              return r.json();
            })
            .then((data) => {
              if (data && data.text) {
                setFinalTranscript(data.text);
                setTextInput(data.text);
              }
            })
            .catch((err) => {
              console.error('ASR error:', err);
            });
        }
      }, 500);
    }
  };

  const openAudioFilePicker = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/mp3,audio/wav';
    input.onchange = async (e: any) => {
      const target = e.target as HTMLInputElement;
      const file = target.files && target.files[0];
      if (file) {
        setAudioBlob(file);
        try {
          const fd = new FormData();
          fd.append('audio_file', file);
          const r = await fetch(`${API_BASE_URL}/api/asr`, { method: 'POST', body: fd });
          if (r.ok) {
            const data = await r.json();
            if (data && data.text) {
              setFinalTranscript(data.text);
              setTextInput(data.text);
            }
          }
        } catch {}
      }
    };
    input.click();
  };

  const processAudio = async () => {
    setRecordingState('processing');
    setIsProcessing(true);
    
    // Add initial connection step
    const initialStep = {
      node: 'system',
      status: 'in_progress',
      message: 'Connecting to Agent',
      detail: 'Establishing connection and preparing to process your request...',
      timestamp: 0,
      additionalInfo: []
    };
    setAgentSteps([initialStep]);
    agentStepsRef.current = [initialStep];
    setCurrentAgentStep('system');
    
    const query = textInput.trim() || finalTranscript || liveTranscript || "Show me eco-friendly products";
    
    if (!query.trim()) {
      alert("Please enter a message or record your voice first.");
      setIsProcessing(false);
      setRecordingState('idle');
      setAgentSteps([]);
      agentStepsRef.current = [];
      setCurrentAgentStep(null);
      return;
    }
    
    setTextInput('');
    setFinalTranscript('');
    
    setChatMessages(prev => {
      if (prev.some(msg => msg.text === query)) {
        return prev;
      }
      const now = new Date();
      const timestamp = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      return [...prev, { type: 'user' as const, text: query, timestamp }];
    });

    try {
      await fetchQueryResults(query);
    } catch (error: any) {
      console.error('Process audio error:', error);
      setIsProcessing(false);
      setRecordingState('idle');
    }
  };

  const autoPlayTTS = async (audioUrl: string, audioData?: string) => {
    try {
      console.log('Auto-playing TTS:', audioUrl || 'base64 data');
      setIsPlayingAnswerTTS(true);
      setAnswerTtsProgress(0);
      
      // Support both URL and base64 audio data
      const audioSrc = audioData 
        ? `data:audio/mpeg;base64,${audioData}`  // Direct base64 data
        : `${API_BASE_URL}${audioUrl}`;          // URL (legacy)
      
      const audio = new Audio(audioSrc);
      answerAudioRef.current = audio;
      
      audio.ontimeupdate = () => {
        if (audio.duration) {
          const progress = (audio.currentTime / audio.duration) * 100;
          setAnswerTtsProgress(progress);
        }
      };
      
      audio.onended = () => {
        setIsPlayingAnswerTTS(false);
        setAnswerTtsProgress(100);
        setTimeout(() => setAnswerTtsProgress(0), 500);
      };
      
      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        setIsPlayingAnswerTTS(false);
        setAnswerTtsProgress(0);
      };
      
      await audio.play();
    } catch (error: any) {
      console.error('Auto-play TTS error:', error);
      setIsPlayingAnswerTTS(false);
      setAnswerTtsProgress(0);
    }
  };

  const playAnswerTTS = async () => {
    if (isPlayingAnswerTTS) {
      if (answerAudioRef.current) {
        answerAudioRef.current.pause();
        answerAudioRef.current.currentTime = 0;
      }
      setIsPlayingAnswerTTS(false);
      setAnswerTtsProgress(0);
    } else {
      try {
        setIsPlayingAnswerTTS(true);
        setAnswerTtsProgress(0);
        
        let audioSrc: string;
        let shouldRevokeUrl = false;
        
        // Check if current voice matches cached audio voice
        const voiceMatches = result?.audio_voice === voiceConfig.agentVoice;
        
        // Check if we can reuse cached audio data
        if (voiceMatches && result?.audio_data) {
          // Use cached base64 audio data (voice matches, no API call needed)
          console.log('Using cached audio data (base64) with matching voice:', voiceConfig.agentVoice);
          audioSrc = `data:audio/mpeg;base64,${result.audio_data}`;
        } else if (voiceMatches && result?.audio_url) {
          // Use cached audio URL (voice matches, no API call needed)
          console.log('Using cached audio URL with matching voice:', result.audio_url);
          audioSrc = `${API_BASE_URL}${result.audio_url}`;
        } else {
          // Voice changed or no cached audio - generate new TTS via API
          if (!voiceMatches) {
            console.log(`Voice changed from ${result?.audio_voice} to ${voiceConfig.agentVoice}, regenerating TTS...`);
          } else {
            console.log('No cached audio, generating new TTS...');
          }
          
          const text = result?.answer || 'Answer not available';
          
          const response = await fetch(`${API_BASE_URL}/api/tts/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice: voiceConfig.agentVoice })
          });
          
          if (!response.ok) {
            throw new Error(`TTS generation failed: ${response.statusText}`);
          }
          
          // Get audio blob from stream
          const audioBlob = await response.blob();
          audioSrc = URL.createObjectURL(audioBlob);
          shouldRevokeUrl = true;
        }
        
        // Create and play audio
        const audio = new Audio(audioSrc);
        answerAudioRef.current = audio;
        
        audio.ontimeupdate = () => {
          if (audio.duration) {
            const progress = (audio.currentTime / audio.duration) * 100;
            setAnswerTtsProgress(progress);
          }
        };
        audio.onended = () => {
          setIsPlayingAnswerTTS(false);
          setAnswerTtsProgress(100);
          setTimeout(() => setAnswerTtsProgress(0), 500);
          if (shouldRevokeUrl) URL.revokeObjectURL(audioSrc);
        };
        audio.onerror = () => {
          setIsPlayingAnswerTTS(false);
          setAnswerTtsProgress(0);
          if (shouldRevokeUrl) URL.revokeObjectURL(audioSrc);
          alert('Failed to play audio. Please try again.');
        };
        
        await audio.play();
      } catch (error: any) {
        setIsPlayingAnswerTTS(false);
        setAnswerTtsProgress(0);
        alert(`Failed to generate speech: ${error.message}`);
      }
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      console.log('Aborting request...');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    setRecordingState('idle');
    setCurrentAgentStep(null);
    
    // Add a message indicating stopped
    setChatMessages(prev => {
      const now = new Date();
      const timestamp = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      return [...prev, { type: 'assistant' as const, text: 'Generation stopped by user.', timestamp }];
    });
  };

  const fetchQueryResults = async (query: string) => {
    let isFirstStep = true; // Flag to indicate if this is the first real step
    
    try {
      console.log('Fetching query results (streaming) for:', query);
      
      // Create AbortController
      abortControllerRef.current = new AbortController();
      
      // Use streaming endpoint with direct audio data (no file saving)
        const response = await fetch(`${API_BASE_URL}/api/query/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            query, 
            voice: voiceConfig.agentVoice,
            return_audio_data: true  // Return base64 audio directly, no file saving
          }),
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      if (!response.body) {
        throw new Error('Response body is null');
      }
      
      // Read streaming data
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: any = null;
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('Stream completed');
          break;
        }
        
        // Decode data chunk
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line
        
        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;
          
          try {
            const jsonStr = line.slice(6); // Remove "data: " prefix
            const event = JSON.parse(jsonStr);
            
            console.log('Received event:', event.type, event.data);
            
            if (event.type === 'step') {
              // Display step in real-time
              const step = event.data;
              const stepIndex = agentStepsRef.current.length;
              const formattedStep = formatStep(step, stepIndex);
              
              console.log('Displaying step in real-time:', formattedStep);
              
              // If this is the first real step, complete "Connecting to agent" first
              if (isFirstStep) {
                isFirstStep = false;
                setAgentSteps((prev) => {
                  // Mark initial system step as completed
                  const updated = prev.map(s => 
                    s.node === 'system' 
                      ? { ...s, status: 'completed', detail: 'Connection established successfully' }
                      : s
                  );
                  const nextSteps = [...updated, formattedStep];
                  agentStepsRef.current = nextSteps;
                  return nextSteps;
                });
              } else {
                setAgentSteps((prev) => {
                  const nextSteps = [...prev, formattedStep];
                  agentStepsRef.current = nextSteps;
                  return nextSteps;
                });
              }
              
              setCurrentAgentStep(formattedStep.node);
              
            } else if (event.type === 'result') {
              // Final result
              finalResult = event.data;
              console.log('Received final result:', finalResult);
              console.log('Result answer field:', {
                exists: 'answer' in finalResult,
                type: typeof finalResult.answer,
                value: finalResult.answer,
                length: finalResult.answer ? finalResult.answer.length : 0
              });
              
            } else if (event.type === 'error') {
              // Error
              throw new Error(event.data.detail || event.data.error);
            }
          } catch (parseError) {
            console.error('Failed to parse event:', line, parseError);
          }
        }
      }
      
      // Process final result
      if (!finalResult) {
        throw new Error('No final result received from stream');
      }
      
      const answerText = finalResult.answer || '';
      console.log('📝 Final result received:', {
        hasAnswer: !!answerText,
        answerLength: answerText.length,
        answerPreview: answerText.substring(0, 100),
        task: finalResult.task
      });
      
      // Set final result (include audio data for manual playback)
      setResult({
        query: finalResult.query,
        answer: answerText,
        task: finalResult.task,
        constraints: finalResult.constraints,
        products: finalResult.products || [],
        citations: finalResult.citations || [],
        stepLog: agentStepsRef.current,
        audio_data: finalResult.audio_data,  // Save audio data for reuse
        audio_url: finalResult.audio_url,    // Save audio URL for reuse (if any)
        audio_voice: voiceConfig.agentVoice  // Save voice used for audio generation
      });
      
      // Add assistant message
      if (answerText) {
        setChatMessages(prev => {
          if (prev.some(msg => msg.text === answerText)) {
            return prev;
          }
          const now = new Date();
          const timestamp = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          return [...prev, { type: 'assistant' as const, text: answerText, timestamp }];
        });
        
        // Auto-play TTS - support both base64 audio data and URL
        if (finalResult.audio_data) {
          // Direct base64 audio data (no file saved on server)
          // Convert to data URL for AIChat component
          const audioDataUrl = `data:audio/mpeg;base64,${finalResult.audio_data}`;
          setAutoPlayAudioUrl(audioDataUrl);
          // Reset after a short delay to allow for future auto-plays
          setTimeout(() => setAutoPlayAudioUrl(''), 100);
        } else if (finalResult.audio_url) {
          // Legacy URL-based audio (file saved on server)
          const fullAudioUrl = `${API_BASE_URL}${finalResult.audio_url}`;
          setAutoPlayAudioUrl(fullAudioUrl);
          // Reset after a short delay to allow for future auto-plays
          setTimeout(() => setAutoPlayAudioUrl(''), 100);
        }
      }
      
    } catch (error: any) {
      // If user actively cancelled, don't show error
      if (error.name === 'AbortError') {
        console.log('Request was aborted by user');
        // Reset state even on abort
        setCurrentAgentStep(null);
        setIsProcessing(false);
        setRecordingState('idle');
        return;
      }
      
      console.error('Streaming API Error:', error);
      console.error('Error stack:', error.stack);
      
      // Always reset state on error to prevent UI from getting stuck
      setCurrentAgentStep(null);
      setIsProcessing(false);
      setRecordingState('idle');
      
      alert(`Failed to process query: ${error.message}\n\nPlease check:\n1. Backend is running (http://localhost:8000)\n2. Browser console for details`);
      
      setChatMessages(prev => {
        const now = new Date();
        const timestamp = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        return [...prev, { type: 'assistant' as const, text: 'Sorry, I encountered an error. Please try again.', timestamp }];
      });
    } finally {
      // Clean up AbortController
      abortControllerRef.current = null;
      
      // Final safety net: ensure state is always reset
      console.log('Finally block: resetting state');
      setCurrentAgentStep(null);
      setIsProcessing(false);
      setRecordingState('idle');
    }
  };

  const enrichedResult = useMemo(() => {
    if (!result) {
      return null;
    }

    if (!Array.isArray(result.products) || result.products.length === 0) {
      return result;
    }

    const augmentedProducts = result.products.map((product: any) => {
      const identifier = (product?.doc_id || product?.docId || product?.id)?.toString();
      const metadata = identifier ? productMetadata[identifier] : undefined;

      if (!metadata) {
        return product;
      }

      return {
        ...product,
        imageUrl: product.imageUrl ?? metadata.imageUrl,
        productUrl: product.productUrl ?? metadata.productUrl
      };
    });

    return {
      ...result,
      products: augmentedProducts
    };
  }, [result, productMetadata]);

  return (
    <div className="app" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden', position: 'relative' }}>
      {/* Voice Settings Modal */}
      <VoiceSettings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveVoiceSettings}
        currentSettings={voiceConfig}
      />

      {/* Main content area: upper half */}
      <div className="main" style={{ flex: 1, display: 'flex', gap: '12px', padding: '12px', boxSizing: 'border-box', minHeight: 0, alignItems: 'stretch', overflow: 'hidden' }}>
        
        {/* LEFT: AI Chat + Input */}
        <div className="left-panel" style={{ flex: 2, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)', border: '2px solid #e5e7eb', position: 'relative', maxHeight: '100%' }}>
          {/* Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease',
              opacity: 0.6
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.2) rotate(90deg)';
              e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
              e.currentTarget.style.opacity = '0.6';
            }}
            title="Voice Settings"
          >
            ⚙️
          </button>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <AIChat
              chatMessages={chatMessages}
              recordingState={recordingState}
              isProcessing={isProcessing}
              isPlayingAnswerTTS={isPlayingAnswerTTS}
              waveformData={waveformData}
              recordingTime={recordingTime}
              apiBaseUrl={API_BASE_URL}
              autoPlayAudioUrl={autoPlayAudioUrl}
            />
          </div>
          {recordingState === 'recording' && (
            <div style={{ padding: '12px 16px 0 16px', background: '#fff' }}>
              <div
                style={{
                  borderRadius: '16px',
                  background: '#fff',
                  padding: '16px',
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
                  border: '1px solid rgba(15, 23, 42, 0.08)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  {waveformData.slice(-20).map((val, i) => (
                    <div key={i} style={{ flex: 1, height: `${Math.max(6, val / 1.5)}px`, background: 'var(--apple-primary)', borderRadius: '4px', transition: 'height 0.1s' }} />
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#555', fontWeight: 600 }}>
                  <span>Agent is listening... {(recordingTime / 1000).toFixed(1)}s</span>
                </div>
              </div>
            </div>
          )}
          <div className="input-bar" style={{ flexShrink: 0, padding: '12px', boxSizing: 'border-box', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#ffffff', padding: '10px 14px', borderRadius: '24px', border: '1px solid var(--apple-border)', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}>
              <button
                onClick={openAudioFilePicker}
                disabled={isProcessing || recordingState === 'recording'}
                style={{ 
                  background: 'transparent', 
                  border: 'none',
                  outline: 'none',
                  fontSize: '22px', 
                  cursor: 'pointer',
                  opacity: (isProcessing || recordingState === 'recording') ? 0.4 : 0.7,
                  padding: '6px',
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = (isProcessing || recordingState === 'recording') ? '0.4' : '0.7'}
                title="Upload audio file"
              >
                📁
              </button>
              
              <input
                type="text"
                value={textInput}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setTextInput(newValue);
                  if (newValue.trim() === '') {
                    setFinalTranscript('');
                    setLiveTranscript('');
                  }
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && textInput.trim() && !isProcessing && recordingState !== 'recording') {
                    processAudio();
                  }
                }}
                placeholder={recordingState === 'recording' ? 'Listening...' : 'Tap mic to speak...'}
                disabled={isProcessing || recordingState === 'recording'}
                style={{ 
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  fontSize: '15px',
                  outline: 'none',
                  padding: '6px 8px',
                  color: 'var(--apple-text)',
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
                  letterSpacing: '-0.2px'
                }}
              />
              
              <button
                onClick={recordingState === 'recording' ? stopRecording : startRecording}
                disabled={isProcessing}
                style={{ 
                  background: recordingState === 'recording' ? 'var(--apple-danger)' : 'var(--apple-primary)',
                  border: 'none',
                  outline: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  color: '#fff',
                  fontSize: '18px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: isProcessing ? 0.4 : 1,
                  flexShrink: 0,
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
                }}
                title={recordingState === 'recording' ? 'Stop recording' : 'Start recording'}
              >
                {recordingState === 'recording' ? '⏹' : '🎙'}
              </button>

              <button
                onClick={isProcessing ? stopGeneration : processAudio}
                disabled={recordingState === 'recording' || (!isProcessing && !textInput.trim())}
                style={{ 
                  background: isProcessing ? 'var(--apple-danger)' : 'var(--apple-primary)',
                  border: 'none',
                  outline: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  color: '#fff',
                  fontSize: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: (recordingState === 'recording' || (!isProcessing && !textInput.trim())) ? 0.4 : 1,
                  flexShrink: 0,
                  transition: 'all 0.2s',
                  boxShadow: (isProcessing || textInput.trim()) ? '0 2px 8px rgba(0, 122, 255, 0.3)' : 'none'
                }}
                title={isProcessing ? "Stop generation" : "Send message"}
              >
                {isProcessing ? '⏹' : '⬆'}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Products + Agent Log */}
        <div className="right-panel" style={{ flex: 3, display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0, paddingRight: '4px' }}>
          <div style={{ flex: 1, minHeight: 0, paddingRight: '4px', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            <ResultPanel
              result={enrichedResult}
              isProcessing={isProcessing}
              onProductClick={setSelectedProduct}
            />
          </div>
          <div style={{ paddingRight: '4px', marginTop: '12px', height: '220px', minHeight: '220px' }}>
            <AgentLogPanel
              agentSteps={agentSteps}
              currentAgentStep={currentAgentStep}
              isProcessing={isProcessing}
            />
          </div>
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="apple-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div className="apple-card" style={{ maxWidth: 720, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ position: 'sticky', top: 0, borderBottom: '1px solid var(--apple-border)', padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--apple-card)' }}>
              <div>
                <h2 className="apple-section-title">{selectedProduct.title}</h2>
                <p style={{ color: 'var(--apple-text-secondary)', fontSize: 14, marginTop: 4, fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>{selectedProduct.brand}</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="apple-button apple-button--secondary" style={{ padding: '8px 12px', fontSize: 14 }}>
                ✖
              </button>
            </div>

            <div style={{ padding: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--apple-text-secondary)', marginBottom: 8 }}>Price</p>
                  <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--apple-success)' }}>
                    ${selectedProduct.price != null ? selectedProduct.price.toFixed(2) : 'N/A'}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--apple-text-secondary)', marginBottom: 8 }}>Customer Rating</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 24 }}>⭐</span>
                    <div>
                      <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--apple-text)' }}>
                        {selectedProduct.rating != null ? selectedProduct.rating.toFixed(1) : 'N/A'}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--apple-text-secondary)' }}>
                        {selectedProduct.ratingCount != null ? selectedProduct.ratingCount.toLocaleString() : '0'} reviews
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontWeight: 600, color: 'var(--apple-text)', marginBottom: 12, fontSize: 16 }}>Description</h3>
                <p style={{ color: 'var(--apple-text)', lineHeight: 1.6, fontSize: 15 }}>{selectedProduct.description}</p>
              </div>

              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontWeight: 600, color: 'var(--apple-text)', marginBottom: 12, fontSize: 16 }}>Ingredients</h3>
                <p className="apple-card" style={{ padding: 16, fontSize: 14, color: 'var(--apple-text)', background: 'var(--apple-hover)' }}>{selectedProduct.ingredients}</p>
              </div>

              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontWeight: 600, color: 'var(--apple-text)', marginBottom: 12, fontSize: 16 }}>Data Lineage</h3>
                <div style={{ display: 'grid', gap: 12 }}>
                  {selectedProduct.source.map((src: any, i: number) => (
                    <div key={i} className="apple-card" style={{ padding: 16, background: 'var(--apple-hover)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div>
                          <p style={{ fontWeight: 600, color: 'var(--apple-text)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                            {src.type === 'private' ? (
                              <>Private Catalog</>
                            ) : (
                              <>Web Source</>
                            )}
                          </p>
                          <p style={{ fontSize: 13, color: 'var(--apple-text-secondary)', marginTop: 4 }}>
                            {src.type === 'private' ? `Document ID: ${src.docId}` : `Source: ${new URL(src.url).hostname}`}
                          </p>
                        </div>
                        {src.type === 'web' && (
                          <button onClick={() => window.open(src.url, '_blank')} className="apple-button apple-button--primary" style={{ padding: '6px 10px', fontSize: 12 }}>
                            Open ↗
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontWeight: 600, color: 'var(--apple-text)', marginBottom: 12, fontSize: 16 }}>Customer Review</h3>
                <div className="apple-card" style={{ padding: 16, background: 'var(--apple-hover)' }}>
                  <p style={{ color: '#FF9500', marginBottom: 8 }}>⭐⭐⭐⭐⭐</p>
                  <p style={{ color: 'var(--apple-text)', fontStyle: 'italic', fontSize: 14 }}>
                    "{selectedProduct.reviewSample}"
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedProduct(null)}
                className="apple-button apple-button--primary"
                style={{ width: '100%', padding: '14px 20px', fontWeight: 600, marginTop: 24, fontSize: 15 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShopifyVoiceAssistant;
