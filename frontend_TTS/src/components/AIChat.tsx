import { useState, useRef, useEffect } from 'react';

interface Message {
  type: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

interface AIChatProps {
  chatMessages: Message[];
  recordingState: string;
  isProcessing: boolean;
  isPlayingAnswerTTS: boolean;
  waveformData: number[];
  recordingTime: number;
  apiBaseUrl: string;
  autoPlayAudioUrl?: string;
  agentVoice?: string;
}

const AIChat = ({
  chatMessages,
  recordingState,
  isProcessing,
  isPlayingAnswerTTS,
  waveformData,
  recordingTime,
  apiBaseUrl,
  autoPlayAudioUrl,
  agentVoice = 'alloy'
}: AIChatProps) => {
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [playingMessageIndex, setPlayingMessageIndex] = useState<number | null>(null);
  const [ttsProgress, setTtsProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (chatContainerRef.current) {
      const container = chatContainerRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (isNearBottom || chatMessages.length === 1) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  }, [chatMessages]);

  // Auto-play TTS when autoPlayAudioUrl is provided
  useEffect(() => {
    if (autoPlayAudioUrl && chatMessages.length > 0) {
      // Find the last assistant message
      const lastAssistantIndex = chatMessages.length - 1;
      const lastMessage = chatMessages[lastAssistantIndex];
      
      if (lastMessage && lastMessage.type === 'assistant') {
        playMessageTTSFromUrl(autoPlayAudioUrl, lastAssistantIndex);
      }
    }
  }, [autoPlayAudioUrl]);

  const playMessageTTSFromUrl = async (audioUrl: string, messageIndex: number) => {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    try {
      console.log('🔊 Auto-playing TTS from URL:', audioUrl);
      setPlayingMessageIndex(messageIndex);
      setTtsProgress(0);

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.ontimeupdate = () => {
        if (audio.duration) {
          const progress = (audio.currentTime / audio.duration) * 100;
          setTtsProgress(progress);
        }
      };

      audio.onended = () => {
        console.log('✅ Audio playback ended');
        setPlayingMessageIndex(null);
        setTtsProgress(100);
        setTimeout(() => setTtsProgress(0), 500);
      };

      audio.onerror = (e) => {
        console.error('❌ Audio playback error:', e);
        setPlayingMessageIndex(null);
        setTtsProgress(0);
      };

      console.log('▶️ Starting audio playback...');
      await audio.play();
      console.log('✅ Audio playing');
    } catch (error: any) {
      console.error('❌ TTS error:', error);
      setPlayingMessageIndex(null);
      setTtsProgress(0);
    }
  };

  const playMessageTTS = async (text: string, messageIndex: number) => {
    // If already playing this message, stop it
    if (playingMessageIndex === messageIndex) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingMessageIndex(null);
      setTtsProgress(0);
      return;
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    try {
      console.log('🔊 Playing TTS for message:', text.substring(0, 50));
      setPlayingMessageIndex(messageIndex);
      setTtsProgress(0);

      console.log('📡 Calling TTS API:', `${apiBaseUrl}/api/tts`);
      const response = await fetch(`${apiBaseUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: agentVoice })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ TTS API error:', response.status, errorText);
        throw new Error(`TTS generation failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ TTS response:', data);
      
      const audioUrl = `${apiBaseUrl}${data.audio_url}`;
      console.log('🎵 Loading audio from:', audioUrl);
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.ontimeupdate = () => {
        if (audio.duration) {
          const progress = (audio.currentTime / audio.duration) * 100;
          setTtsProgress(progress);
        }
      };

      audio.onended = () => {
        console.log('✅ Audio playback ended');
        setPlayingMessageIndex(null);
        setTtsProgress(100);
        setTimeout(() => setTtsProgress(0), 500);
      };

      audio.onerror = (e) => {
        console.error('❌ Audio playback error:', e);
        setPlayingMessageIndex(null);
        setTtsProgress(0);
        alert('Failed to play audio. Check console for details.');
      };

      console.log('▶️ Starting audio playback...');
      await audio.play();
      console.log('✅ Audio playing');
    } catch (error: any) {
      console.error('❌ TTS error:', error);
      setPlayingMessageIndex(null);
      setTtsProgress(0);
      alert(`Failed to generate speech: ${error.message}\n\nCheck console for details.`);
    }
  };

  return (
    <div 
      className="chat-area" 
      ref={chatContainerRef}
      onScroll={(e) => {
        const target = e.target as HTMLDivElement;
        const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
        setShowScrollToBottom(!isAtBottom);
      }}
      style={{ 
        flex: 1, 
        padding: '20px 16px', 
        overflowY: 'auto', 
        overflowX: 'hidden', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '14px', 
        minHeight: 0, 
        position: 'relative',
        maxHeight: '100%'
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          paddingBottom: chatMessages.length === 0 ? 0 : '20px'
        }}
      >
        {chatMessages.length === 0 ? null : (
          chatMessages.map((msg, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.type === 'user' ? 'flex-end' : 'flex-start', gap: '4px', width: '100%' }}>
              {/* Message bubble with play button */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                flexDirection: msg.type === 'user' ? 'row-reverse' : 'row',
                maxWidth: '85%'
              }}>
                {/* Message content */}
                <div className={`chat-message ${msg.type === 'user' ? 'chat-message-user' : 'chat-message-assistant'}`} style={{ 
                  position: 'relative',
                  minWidth: '60px'
                }}>
                  <p style={{ fontSize: '16px', margin: 0, lineHeight: '1.5', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontWeight: 500, color: 'inherit' }}>
                    {msg.text}
                  </p>

                  {/* Progress indicator */}
                  {playingMessageIndex === idx && (
                    <div style={{
                      position: 'absolute',
                      bottom: '4px',
                      left: '8px',
                      right: '8px',
                      height: '2px',
                      background: msg.type === 'user' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.1)',
                      borderRadius: '1px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${ttsProgress}%`,
                        background: msg.type === 'user' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 122, 255, 0.8)',
                        transition: 'width 0.2s'
                      }} />
                    </div>
                  )}
                </div>

                {/* Play TTS Button - Only for assistant messages */}
                {msg.type === 'assistant' && (
                  <button
                    onClick={() => playMessageTTS(msg.text, idx)}
                    style={{
                      background: playingMessageIndex === idx ? 'rgba(255, 59, 48, 0.9)' : 'rgba(0, 122, 255, 0.15)',
                      border: '1px solid rgba(0, 122, 255, 0.3)',
                      borderRadius: '50%',
                      width: '28px',
                      height: '28px',
                      minWidth: '28px',
                      color: playingMessageIndex === idx ? '#fff' : '#007AFF',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                      opacity: 0.8,
                      padding: 0,
                      flexShrink: 0
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '1';
                      if (playingMessageIndex !== idx) {
                        e.currentTarget.style.background = 'rgba(0, 122, 255, 0.25)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '0.8';
                      if (playingMessageIndex !== idx) {
                        e.currentTarget.style.background = 'rgba(0, 122, 255, 0.15)';
                      }
                    }}
                    title={playingMessageIndex === idx ? 'Stop TTS' : 'Play TTS'}
                  >
                    {playingMessageIndex === idx ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 1 }}>
                        <path d="M5 3l14 9-14 9V3z" />
                      </svg>
                    )}
                  </button>
                )}
              </div>

              {/* Timestamp outside the bubble */}
              <span style={{ 
                fontSize: '11px', 
                color: '#9CA3AF', 
                paddingLeft: msg.type === 'assistant' ? '36px' : '0',
                paddingRight: '0',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
              }}>
                {msg.timestamp}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollToBottom && (
        <button
          onClick={() => {
            if (chatContainerRef.current) {
              chatContainerRef.current.scrollTo({
                top: chatContainerRef.current.scrollHeight,
                behavior: 'smooth'
              });
            }
          }}
          style={{
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            color: '#6b7280',
            fontSize: '20px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f9fafb';
            e.currentTarget.style.color = '#374151';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.color = '#6b7280';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
          }}
          title="Scroll to bottom"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
          </svg>
        </button>
      )}
    </div>
  );
};

export default AIChat;
