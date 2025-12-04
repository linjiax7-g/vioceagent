interface AgentStep {
  node: string;
  status: string;
  message: string;
  detail: string;
  timestamp: number;
  additionalInfo?: Array<{
    label: string;
    value: string;
  }>;
  rawData?: any;
}

interface AILogProps {
  agentSteps: AgentStep[];
  isProcessing: boolean;
  currentAgentStep: string | null;
  expandedLog: boolean;
  onToggleExpandedLog: () => void;
}

const AILog = ({
  agentSteps,
  isProcessing,
  currentAgentStep,
  expandedLog,
  onToggleExpandedLog
}: AILogProps) => {
  // Get friendly name for current step
  const getCurrentStepInfo = () => {
    const stepNames: Record<string, { name: string; icon: string; description: string }> = {
      'system': { name: 'Connecting to Agent', icon: '🔌', description: 'Establishing connection' },
      'router': { name: 'Intent Analysis', icon: '🎯', description: 'Understanding your request' },
      'planner': { name: 'Search Planning', icon: '📋', description: 'Planning retrieval strategy' },
      'retriever': { name: 'Product Search', icon: '🔍', description: 'Finding relevant products' },
      'answerer': { name: 'Response Generation', icon: '💬', description: 'Crafting your answer' }
    };
    
    return currentAgentStep ? stepNames[currentAgentStep] || { name: currentAgentStep, icon: '⚙️', description: 'Processing' } : null;
  };
  
  const currentStepInfo = getCurrentStepInfo();
  
  return (
    <>
      <style>{`
        @keyframes ailog-spin {
          to { transform: rotate(360deg); }
        }
        
        @keyframes ailog-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.7; }
        }
        
        @keyframes ailog-ellipsis {
          0%, 20% { opacity: 0; }
          50% { opacity: 1; }
          100% { opacity: 0; }
        }
        
        @keyframes ailog-shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>
      
      <div className="apple-card" style={{ padding: '0', flex: '1', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <h2 className="apple-section-title" style={{ padding: '20px 20px 12px', margin: 0, flexShrink: 0, fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontSize: '20px', fontWeight: 600, lineHeight: 1.4 }}>
          Agent Log
        </h2>
        
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 20px' }}>
          {agentSteps.length === 0 && !isProcessing ? (
            <p style={{ color: 'var(--apple-text-secondary)', fontSize: '15px', textAlign: 'center', marginTop: '20px', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif', lineHeight: 1.5 }}>
              No activity yet.
            </p>
          ) : (
            <>
              {agentSteps.map((step, idx) => {
                const now = new Date();
                const timestamp = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                return (
                  <div key={idx} className="log-entry">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <p style={{ fontSize: '15px', color: 'var(--apple-text)', margin: 0, fontWeight: 600, letterSpacing: '-0.2px', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif', lineHeight: 1.4 }}>
                        {step.message}
                      </p>
                      <span style={{ fontSize: '11px', color: '#9CA3AF', whiteSpace: 'nowrap', marginLeft: '12px', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif', fontWeight: 400 }}>
                        {timestamp}
                      </span>
                    </div>
                    <p style={{ fontSize: '14px', color: 'var(--apple-text-secondary)', margin: 0, lineHeight: '1.5', letterSpacing: '-0.1px', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif', marginBottom: step.additionalInfo && step.additionalInfo.length > 0 ? '8px' : 0 }}>
                    {step.detail}
                  </p>
                  
                  {/* Display additional information */}
                  {step.additionalInfo && step.additionalInfo.length > 0 && (
                      <div style={{ marginTop: '8px', paddingLeft: '12px', borderLeft: '2px solid rgba(0, 122, 255, 0.2)' }}>
                        {step.additionalInfo.map((info, infoIdx) => (
                          <div key={infoIdx} style={{ marginBottom: '4px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--apple-primary)', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
                              {info.label}:{' '}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--apple-text)', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif', wordBreak: 'break-word' }}>
                              {info.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              
              {/* Show enhanced processing state */}
              {isProcessing && currentStepInfo && (
                <div style={{ 
                  padding: '14px 16px', 
                  background: 'linear-gradient(135deg, rgba(0, 122, 255, 0.08) 0%, rgba(0, 122, 255, 0.12) 100%)',
                  borderRadius: '12px', 
                  marginTop: '12px', 
                  marginBottom: '12px',
                  border: '1px solid rgba(0, 122, 255, 0.25)',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.1) 50%, transparent 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'ailog-shimmer 2s infinite'
                  }} />
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
                    <span style={{ 
                      fontSize: '20px', 
                      animation: 'ailog-pulse 1.5s ease-in-out infinite',
                      display: 'inline-block'
                    }}>
                      {currentStepInfo.icon}
                    </span>
                    
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px'
                      }}>
                        <p style={{ 
                          fontSize: '15px', 
                          color: 'var(--apple-primary)', 
                          margin: 0, 
                          fontWeight: 600,
                          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
                        }}>
                          {currentStepInfo.name}
                        </p>
                        <span style={{ fontSize: '13px', color: '#007AFF', fontWeight: 500 }}>
                          <span style={{ animation: 'ailog-ellipsis 1.5s infinite', animationDelay: '0s' }}>.</span>
                          <span style={{ animation: 'ailog-ellipsis 1.5s infinite', animationDelay: '0.2s' }}>.</span>
                          <span style={{ animation: 'ailog-ellipsis 1.5s infinite', animationDelay: '0.4s' }}>.</span>
                        </span>
                      </div>
                      <p style={{ 
                        fontSize: '13px', 
                        color: 'var(--apple-text-secondary)', 
                        margin: 0,
                        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
                      }}>
                        {currentStepInfo.description}
                      </p>
                    </div>
                    
                    <div 
                      style={{ 
                        width: '20px', 
                        height: '20px', 
                        border: '3px solid rgba(0, 122, 255, 0.2)',
                        borderTopColor: '#007AFF',
                        borderRadius: '50%',
                        animation: 'ailog-spin 0.8s linear infinite'
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      {/* Technical Details Toggle */}
      {agentSteps.length > 0 && (
        <div style={{ flexShrink: 0, padding: '12px 20px 20px', borderTop: '1px solid var(--apple-border)' }}>
          <button
            onClick={onToggleExpandedLog}
            className="apple-button apple-button--secondary"
            style={{ width: '100%', fontSize: '13px', padding: '10px', fontWeight: 500 }}
          >
            {expandedLog ? '▲' : '▼'} {expandedLog ? 'Hide' : 'Show'} Technical Details
          </button>
          {expandedLog && (
            <div style={{ marginTop: '12px', background: '#1d1d1f', padding: '14px', color: '#f5f5f7', fontFamily: 'SF Mono, Monaco, Consolas, monospace', fontSize: '12px', overflowY: 'auto', maxHeight: '150px', borderRadius: '8px' }}>
              {agentSteps.map((step, idx) => (
                <div key={idx} style={{ color: '#34C759', marginBottom: '6px', lineHeight: '1.4' }}>
                  [{step.timestamp}s] <span style={{ color: '#64D2FF' }}>[{step.node.toUpperCase()}]</span> {step.detail}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AILog;

