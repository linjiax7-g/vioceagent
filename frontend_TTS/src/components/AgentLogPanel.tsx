import { useRef, useEffect } from 'react';
import { Activity, GitBranch, List, Search, MessageSquare, Terminal } from 'lucide-react';

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
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  
  // Auto-scroll to bottom when new steps are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentSteps.length, currentAgentStep]);

  
  // Define step icons and colors
  const getStepConfig = (node: string) => {
    const configs: Record<string, { icon: React.ReactNode; color: string; bgColor: string }> = {
      'system': { icon: <Activity size={16} color="#8E8E93" />, color: '#8E8E93', bgColor: '#F2F2F7' },
      'router': { icon: <GitBranch size={16} color="#5856D6" />, color: '#5856D6', bgColor: '#EAEAFA' },
      'planner': { icon: <List size={16} color="#FF9500" />, color: '#FF9500', bgColor: '#FFF5E5' },
      'retriever': { icon: <Search size={16} color="#007AFF" />, color: '#007AFF', bgColor: '#E5F0FF' },
      'answerer': { icon: <MessageSquare size={16} color="#34C759" />, color: '#34C759', bgColor: '#E8F8ED' }
    };
    return configs[node] || { icon: <Terminal size={16} color="#8E8E93" />, color: '#8E8E93', bgColor: '#F2F2F7' };
  };

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
        style={{
          flex: 1, 
          minHeight: 0, 
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          padding: '12px 16px'
        }}
      >
        {!hasSteps && !isProcessing ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              color: 'var(--apple-text-secondary)',
              paddingTop: '50px'
            }}
          >
            <p style={{ fontSize: '13px', margin: 0, opacity: 0.7 }}>No activity yet</p>
          </div>
        ) : (
          <div 
            ref={scrollContainerRef}
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '8px', 
              flex: 1, 
              minHeight: 0,
              overflowY: 'auto', 
              paddingRight: 4,
              scrollBehavior: 'smooth'
            }}
          >
            {agentSteps.map((step, idx) => {
              const timestamp = new Date(step.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
              const isCurrentStep = isProcessing && currentAgentStep === step.node;
              const stepConfig = getStepConfig(step.node);
              
              return (
                <div
                  key={idx}
                  style={{
                    padding: '12px 14px',
                    background: 'rgba(255, 255, 255, 0.6)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '12px',
                    boxShadow: isCurrentStep ? '0 4px 12px rgba(0, 122, 255, 0.1)' : '0 2px 8px rgba(0, 0, 0, 0.04)',
                    border: isCurrentStep ? '1px solid rgba(0, 122, 255, 0.2)' : '1px solid rgba(0, 0, 0, 0.05)',
                    marginBottom: '2px',
                    transition: 'all 0.3s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ 
                      width: '28px', 
                      height: '28px', 
                      borderRadius: '8px', 
                      backgroundColor: stepConfig.bgColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      flexShrink: 0,
                      border: `0.5px solid ${stepConfig.color}30`
                    }}>
                      {stepConfig.icon}
                    </div>
                    
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <p style={{ 
                            fontSize: '13px', 
                            color: '#1D1D1F', 
                            margin: 0, 
                            fontWeight: 600,
                            letterSpacing: '-0.01em'
                          }}>
                            {step.message}
                          </p>
                          {isCurrentStep && (
                            <div 
                              style={{ 
                                width: '12px', 
                                height: '12px', 
                                border: '1.5px solid rgba(0, 122, 255, 0.3)',
                                borderTopColor: '#007AFF',
                                borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                                flexShrink: 0
                              }}
                            />
                          )}
                        </div>
                        <span style={{ fontSize: '11px', color: '#86868B', marginLeft: '8px', fontVariantNumeric: 'tabular-nums' }}>
                          {timestamp}
                        </span>
                      </div>
                      <p style={{ fontSize: '13px', color: '#6E6E73', margin: 0, lineHeight: '1.4' }}>
                        {step.detail}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} style={{ height: '20px', flexShrink: 0 }} />
          </div>
        )}
      </div>
    </>
  );
};

export default AgentLogPanel;

