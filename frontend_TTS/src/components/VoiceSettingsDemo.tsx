/**
 * Demo component to test VoiceSettings
 * Run: npm run dev and click the settings button
 */
import { useState } from 'react';
import VoiceSettings, { type VoiceConfig } from './VoiceSettings';

const VoiceSettingsDemo = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<VoiceConfig>({
    agentVoice: 'sarah',
    userVoice: 'sarah'
  });

  const handleSave = (settings: VoiceConfig) => {
    setConfig(settings);
    console.log('Saved settings:', settings);
    alert(`Settings saved!\nAgent: ${settings.agentVoice}\nUser: ${settings.userVoice}`);
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'Inter, sans-serif' }}>
      <h1>🎙️ Voice Settings Demo</h1>
      <p>Current Agent Voice: <strong>{config.agentVoice}</strong></p>
      <p>Current User Voice: <strong>{config.userVoice}</strong></p>
      
      <button
        onClick={() => setIsOpen(true)}
        style={{
          padding: '12px 24px',
          background: '#007aff',
          color: '#fff',
          border: 'none',
          outline: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          cursor: 'pointer',
          marginTop: '20px'
        }}
      >
        ⚙️ Open Settings
      </button>

      <VoiceSettings
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSave={handleSave}
        currentSettings={config}
      />
    </div>
  );
};

export default VoiceSettingsDemo;

