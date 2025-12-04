import { useRef, useEffect } from 'react';

interface AgentStep {
  node: string;
  status: string;
  message: string;
  detail: string;
  timestamp: number;
  additionalInfo?: Array<{ label: string; value: string }>;
}

interface AgentLogPanelProps {
  agentSteps: AgentStep[];
  currentAgentStep: string | null;
  isProcessing: boolean;
}

const AgentLogPanel = ({ agentSteps, currentAgentStep, isProcessing }: AgentLogPanelProps) => {
  const hasSteps = agentSteps.length > 0;
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  
  // Auto-scroll to bottom when new steps are added
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [agentSteps.length, currentAgentStep]);
  
  // Get friendly name for current step
  const getCurrentStepInfo = () => {
    const stepNames: Record<string, { name: string; icon: string }> = {
      'system': { name: 'Connecting to agent', icon: '🔌' },
      'router': { name: 'Analyzing intent', icon: '🎯' },
      'planner': { name: 'Planning search strategy', icon: '📋' },
      'retriever': { name: 'Retrieving products', icon: '🔍' },
      'answerer': { name: 'Generating response', icon: '💬' }
    };
    
    return currentAgentStep ? stepNames[currentAgentStep] || { name: `Processing ${currentAgentStep}`, icon: '⚙️' } : null;
  };
  
  const currentStepInfo = getCurrentStepInfo();

  return (
    <>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        
        @keyframes ellipsis {
          0%, 20% { opacity: 0; }
          50% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
      
      <div
        className="apple-card"
        style={{
          padding: '0',
          borderRadius: '18px',
          flexShrink: 0,
          margin: '0 16px',
          display: 'flex',
          flexDirection: 'column',
          height: '200px',
          minHeight: '200px',
          maxHeight: '200px',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ 
          padding: '12px 16px 8px', 
          borderBottom: '1px solid var(--apple-border)',
          flexShrink: 0
        }}>
          <h3 style={{ 
            fontSize: '14px', 
            fontWeight: 600, 
            margin: 0, 
            color: 'var(--apple-text)',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
          }}>
            Agent Log
          </h3>
        </div>

        {/* Content */}
        <div style={{ 
          flex: 1, 
          minHeight: 0, 
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          padding: '12px 16px'
        }}>
          {!hasSteps && !isProcessing ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                color: 'var(--apple-text-secondary)'
              }}
            >
              <p style={{ fontSize: '13px', margin: 0 }}>No activity yet.</p>
            </div>
          ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: 0 }}>
            <div 
              ref={scrollContainerRef}
              style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto', paddingRight: 4 }}
            >
              {agentSteps.map((step, idx) => {
                const now = new Date();
                const timestamp = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                const isCurrentStep = isProcessing && currentAgentStep === step.node;
                
                return (
                  <div
                    key={idx}
                    style={{
                      padding: '8px 10px',
                      background: isCurrentStep ? 'rgba(0, 122, 255, 0.08)' : 'rgba(0, 0, 0, 0.02)',
                      borderRadius: '8px',
                      borderLeft: `3px solid ${step.status === 'completed' ? '#34C759' : '#007AFF'}`
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <p style={{ fontSize: '13px', color: 'var(--apple-text)', margin: 0, fontWeight: 600 }}>
                          {step.message}
                        </p>
                        {isCurrentStep && (
                          <div 
                            style={{ 
                              width: '14px', 
                              height: '14px', 
                              border: '2px solid rgba(0, 122, 255, 0.3)',
                              borderTopColor: '#007AFF',
                              borderRadius: '50%',
                              animation: 'spin 0.8s linear infinite',
                              flexShrink: 0
                            }}
                          />
                        )}
                      </div>
                      <span style={{ fontSize: '10px', color: '#9CA3AF', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                        {timestamp}
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--apple-text-secondary)', margin: 0 }}>
                      {step.detail}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AgentLogPanel;

