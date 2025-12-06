import { useState, useEffect, useMemo } from 'react';

interface VoiceSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: VoiceConfig) => void;
  currentSettings: VoiceConfig;
}

export interface VoiceConfig {
  agentVoice: string;
  userVoice: string;
  language?: string;
}

type VoiceOption = {
  id: string;
  name: string;
  gender: 'female' | 'male' | 'neutral';
  accent: string;
  vibe: string;
  description: string;
  badge?: string;
};

const LANGUAGE_OPTIONS = [
  { id: 'en', name: 'English', flag: '🇺🇸' },
  { id: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { id: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { id: 'ko', name: 'Korean', flag: '🇰🇷' },
  { id: 'es', name: 'Spanish', flag: '🇪🇸' },
  { id: 'fr', name: 'French', flag: '🇫🇷' },
  { id: 'de', name: 'German', flag: '🇩🇪' },
  { id: 'it', name: 'Italian', flag: '🇮🇹' },
  { id: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { id: 'hi', name: 'Hindi', flag: '🇮🇳' }
];

const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'sarah', name: 'Sarah', gender: 'female', accent: 'US', vibe: 'Balanced', description: 'Clear, young American tone', badge: 'Default' },
  { id: 'laura', name: 'Laura', gender: 'female', accent: 'US', vibe: 'Energetic', description: 'Casual, upbeat guidance' },
  { id: 'jessica', name: 'Jessica', gender: 'female', accent: 'US', vibe: 'Warm', description: 'Friendly and expressive' },
  { id: 'matilda', name: 'Matilda', gender: 'female', accent: 'US', vibe: 'Mature', description: 'Calm, confident delivery' },
  { id: 'alice', name: 'Alice', gender: 'female', accent: 'UK', vibe: 'Elegant', description: 'Polished British tone' },
  { id: 'lily', name: 'Lily', gender: 'female', accent: 'UK', vibe: 'Warm', description: 'Trustworthy and composed' },
  { id: 'adam', name: 'Adam', gender: 'male', accent: 'US', vibe: 'Professional', description: 'Clear corporate delivery' },
  { id: 'roger', name: 'Roger', gender: 'male', accent: 'US', vibe: 'Confident', description: 'Authoritative, reliable' },
  { id: 'charlie', name: 'Charlie', gender: 'male', accent: 'AU', vibe: 'Casual', description: 'Approachable Aussie tone' },
  { id: 'george', name: 'George', gender: 'male', accent: 'UK', vibe: 'Premium', description: 'Luxury concierge feel' },
  { id: 'harry', name: 'Harry', gender: 'male', accent: 'US', vibe: 'Youthful', description: 'Fun and modern' },
  { id: 'liam', name: 'Liam', gender: 'male', accent: 'US', vibe: 'Friendly', description: 'Conversational helper' },
  { id: 'will', name: 'Will', gender: 'male', accent: 'US', vibe: 'Chill', description: 'Relaxed, helpful tone' },
  { id: 'brian', name: 'Brian', gender: 'male', accent: 'US', vibe: 'Experienced', description: 'Seasoned advisor' },
  { id: 'chris', name: 'Chris', gender: 'male', accent: 'US', vibe: 'Guided', description: 'Structured explanations' },
  { id: 'eric', name: 'Eric', gender: 'male', accent: 'US', vibe: 'Direct', description: 'Clear instructions' },
  { id: 'daniel', name: 'Daniel', gender: 'male', accent: 'UK', vibe: 'Refined', description: 'Modern British voice' },
  { id: 'bill', name: 'Bill', gender: 'male', accent: 'US', vibe: 'Classic', description: 'Deep, radio-style' }
];

const VoiceSettings: React.FC<VoiceSettingsProps> = ({ isOpen, onClose, onSave, currentSettings }) => {
  const [agentVoice, setAgentVoice] = useState(currentSettings.agentVoice);
  const [language, setLanguage] = useState(currentSettings.language || 'en');
  const [filter, setFilter] = useState<'all' | 'female' | 'male'>('all');

  useEffect(() => {
    setAgentVoice(currentSettings.agentVoice);
    setLanguage(currentSettings.language || 'en');
  }, [currentSettings]);

  const handleSave = () => {
    onSave({ agentVoice, userVoice: currentSettings.userVoice, language });
    onClose();
  };

  const handleReset = () => {
    setAgentVoice('sarah');
    setLanguage('en');
  };

  const handleVoiceSelect = (voiceId: string) => {
    setAgentVoice(voiceId);
  };

  const currentVoice = (voiceId: string | undefined) =>
    VOICE_OPTIONS.find((voice) => voice.id === voiceId);

  const filteredVoices = useMemo(() => {
    if (filter === 'all') return VOICE_OPTIONS;
    return VOICE_OPTIONS.filter((voice) => voice.gender === filter);
  }, [filter]);

  if (!isOpen) return null;

  return (
    <div 
      className="voice-settings-overlay" 
      style={{ 
        position: 'fixed', 
        inset: 0, 
        background: 'rgba(0, 0, 0, 0.5)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        zIndex: 100,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div 
        className="voice-settings-panel" 
        style={{
          background: '#fff',
          borderRadius: '20px',
          width: 'min(640px, 100%)',
          height: 'min(800px, 90vh)',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          padding: '24px', 
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#fff',
          zIndex: 1
        }}>
          <div>
            <h2 style={{ 
              margin: 0, 
              fontSize: '24px', 
              fontWeight: 700,
              color: '#1f2937',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
            }}>
              Voice Settings
            </h2>
            <p style={{ 
              margin: '4px 0 0 0', 
              fontSize: '14px', 
              color: '#6b7280'
            }}>
              Customize assistant and user voices
            </p>
          </div>
          <button 
            onClick={onClose}
            style={{ 
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '8px',
              borderRadius: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {/* Summary card */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div
                style={{
                  flex: 1,
                  textAlign: 'left',
                  borderRadius: '16px',
                  border: '2px solid #2563eb',
                  padding: '16px',
                  background: 'rgba(37, 99, 235, 0.06)',
                  boxShadow: '0 6px 18px rgba(37, 99, 235, 0.12)'
                }}
              >
                <div style={{ marginBottom: '8px', color: '#4b5563', fontSize: '13px' }}>
                  Assistant voice
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                  {currentVoice(agentVoice)?.name ?? 'Not set'}
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280' }}>
                  {currentVoice(agentVoice) ? `${currentVoice(agentVoice)?.accent} • ${currentVoice(agentVoice)?.vibe}` : 'Select a voice below'}
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  textAlign: 'left',
                  borderRadius: '16px',
                  border: '1px solid #e5e7eb',
                  padding: '16px',
                  background: '#fff',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)'
                }}
              >
                <div style={{ marginBottom: '8px', color: '#4b5563', fontSize: '13px' }}>
                  Language
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <button
                      key={lang.id}
                      onClick={() => setLanguage(lang.id)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '8px',
                        border: language === lang.id ? '1px solid #2563eb' : '1px solid #e5e7eb',
                        background: language === lang.id ? 'rgba(37, 99, 235, 0.08)' : '#fff',
                        color: language === lang.id ? '#1d4ed8' : '#374151',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Filter pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'female', label: 'Female' },
              { id: 'male', label: 'Male' }
            ].map((pill) => (
              <button
                key={pill.id}
                onClick={() => setFilter(pill.id as typeof filter)}
                style={{
                  border: '1px solid',
                  borderColor: filter === pill.id ? '#2563eb' : '#e5e7eb',
                  background: filter === pill.id ? 'rgba(37, 99, 235, 0.08)' : '#fff',
                  color: filter === pill.id ? '#1d4ed8' : '#4b5563',
                  borderRadius: '999px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Voice grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            {filteredVoices.map((voice) => {
              const isSelected = voice.id === agentVoice;
              return (
                <button
                  key={voice.id}
                  onClick={() => handleVoiceSelect(voice.id)}
                  style={{
                    textAlign: 'left',
                    padding: '14px',
                    borderRadius: '14px',
                    border: isSelected ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    background: isSelected ? 'rgba(219, 234, 254, 0.6)' : '#fff',
                    boxShadow: isSelected ? '0 8px 24px rgba(37, 99, 235, 0.15)' : '0 2px 8px rgba(15, 23, 42, 0.06)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{voice.name}</div>
                    {voice.badge && (
                      <span style={{ fontSize: '11px', background: '#2563eb', color: '#fff', borderRadius: '999px', padding: '2px 8px' }}>
                        {voice.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>
                    {voice.accent} • {voice.vibe}
                  </div>
                  <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.4 }}>{voice.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ 
          padding: '24px', 
          borderTop: '1px solid #e5e7eb',
          display: 'flex', 
          gap: '12px',
          background: '#fff'
        }}>
          <button
            onClick={handleReset}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              outline: 'none',
              background: '#fff',
              color: '#374151',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
            }}
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            style={{
              flex: 2,
              padding: '12px 16px',
              borderRadius: '12px',
              border: 'none',
              outline: 'none',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
              boxShadow: '0 10px 25px rgba(37, 99, 235, 0.25)'
            }}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoiceSettings;

