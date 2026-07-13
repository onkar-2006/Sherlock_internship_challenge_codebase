import { useState, useRef } from 'react';
import { Header } from './components/Header';
import { Panel } from './components/Panel';
import { Insights } from './components/Insights';
import { useSpeechWS } from './hooks/useSpeechWS';
import { TranscriptMessage, Participant, AnalysisResult, InviteMetadata } from './types';
import { Users, Play } from 'lucide-react';

export default function App() {
  const [isJoined, setIsJoined] = useState(false);
  const [userRole, setUserRole] = useState<'interviewer' | 'candidate' | 'observer'>('interviewer');
  const [userName, setUserName] = useState('Alice Smith');

  // Central transcripts, connected participants registry, and analysis states
  const [viewMode, setViewMode] = useState<'split' | 'interviewer' | 'candidate'>('split');
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [analysis, setAnalysis] = useState<AnalysisResult>({
    identified_candidate_role: 'candidate',
    identified_candidate_id: '',
    confidence_score: 50,
    explanation: 'No audio analyzed yet.'
  });
  const [metadata, setMetadata] = useState<InviteMetadata>({
    scheduled_candidate: 'John Doe',
    candidate_email: 'john.doe@example.com',
    calendar_invite: 'Sherlock AI Technical Interview - John Doe',
    interview_schedule: '12:00 PM - 1:00 PM',
    interviewers: ['Alice Smith'],
    observers: ['Shadow Recruiter', 'Dev Observer']
  });

  const [confirmedCandidateId, setConfirmedCandidateId] = useState<string>('');
  
  // Maps participant_id -> live interim text string
  const [interimTexts, setInterimTexts] = useState<Record<string, string>>({});

  // Ref to hold the latest interim text values to avoid closure state issues
  const latestInterimRef = useRef<Record<string, string>>({});
  const throttleTimeoutRef = useRef<any>(null);

  const throttleInterimUpdate = (participantId: string, text: string) => {
    latestInterimRef.current[participantId] = text;
    
    if (!throttleTimeoutRef.current) {
      throttleTimeoutRef.current = setTimeout(() => {
        setInterimTexts({ ...latestInterimRef.current });
        throttleTimeoutRef.current = null;
      }, 150); // Flush updates every 150ms max
    }
  };

  // Central WebSocket event distributor
  const handleWebSocketMessage = (data: any) => {
    if (data.type === 'session_init') {
      setTranscripts(data.history);
      setParticipants(data.participants);
      setAnalysis(data.analysis);
      setMetadata(data.metadata);
    } else if (data.type === 'interim_update') {
      throttleInterimUpdate(data.participant_id, data.text);
    } else if (data.type === 'update') {
      setTranscripts(data.history);
      setParticipants(data.participants);
      setAnalysis(data.analysis);
      latestInterimRef.current = {};
      setInterimTexts({});
    } else if (data.type === 'metrics_update') {
      setParticipants(data.participants);
      setAnalysis(data.analysis);
    } else if (data.type === 'reset') {
      setTranscripts([]);
      setParticipants(data.participants);
      setAnalysis(data.analysis);
      latestInterimRef.current = {};
      setInterimTexts({});
      setConfirmedCandidateId('');
    } else if (data.type === 'feedback_logged') {
      setConfirmedCandidateId(data.confirmed_candidate_id);
    }
  };

  // Instantiate WebSocket client connection - Hook only executes once role & join are confirmed
  const socket = useSpeechWS({
    role: userRole,
    displayName: userName,
    onMessage: handleWebSocketMessage,
    isJoined: isJoined
  });

  const resetConversation = async () => {
    try {
      await fetch(`http://${window.location.hostname}:8000/api/reset`, { method: 'POST' });
    } catch (err) {
      console.error("Error resetting conversation:", err);
    }
  };

  const handleConfirmCandidate = (pId: string) => {
    socket.sendMessage({
      type: 'confirm_candidate',
      participant_id: pId
    });
  };

  // Onboarding Page
  if (!isJoined) {
    return (
      <div 
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: 'var(--bg-gradient)',
          padding: '24px',
          boxSizing: 'border-box'
        }}
      >
        <div 
          style={{
            maxWidth: '480px',
            width: '100%',
            background: 'var(--panel-bg)',
            border: '1px solid var(--panel-border)',
            backdropFilter: 'var(--glass-blur)',
            borderRadius: 'var(--border-radius)',
            padding: '40px',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <h1 
              style={{
                fontSize: '26px',
                fontWeight: '800',
                margin: '0 0 8px 0',
                background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              Join Sherlock Session
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
              Connect to verify participant identities in real time
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Your Meeting Display Name:
            </label>
            <input 
              type="text" 
              value={userName} 
              onChange={(e) => setUserName(e.target.value)}
              placeholder="e.g. Alice Smith, John Doe"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--panel-border)',
                padding: '12px 16px',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '15px',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Select Your Meeting Role:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <button 
                type="button"
                className={`btn ${userRole === 'interviewer' ? 'btn-primary' : ''}`}
                style={{ justifyContent: 'center' }}
                onClick={() => {
                  setUserRole('interviewer');
                  setUserName('Alice Smith');
                }}
              >
                Interviewer
              </button>
              <button 
                type="button"
                className={`btn ${userRole === 'candidate' ? 'btn-primary' : ''}`}
                style={{ justifyContent: 'center' }}
                onClick={() => {
                  setUserRole('candidate');
                  setUserName('MacBook Pro');
                }}
              >
                Candidate
              </button>
              <button 
                type="button"
                className={`btn ${userRole === 'observer' ? 'btn-primary' : ''}`}
                style={{ justifyContent: 'center' }}
                onClick={() => {
                  setUserRole('observer');
                  setUserName('Shadow Observer');
                }}
              >
                Observer
              </button>
            </div>
          </div>

          <button 
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: '15px', marginTop: '10px' }}
            onClick={() => setIsJoined(true)}
          >
            <Play size={18} /> Join Meeting Session
          </button>
        </div>
      </div>
    );
  }

  // Filter out silent observers from the panel view grid (observers are listed in the sidebar observers list)
  const activeParticipants = Object.values(participants).filter(p => p.role !== 'observer');

  return (
    <div className="app-container">
      <Header 
        onReset={resetConversation} 
        viewMode={viewMode} 
        setViewMode={setViewMode} 
      />

      <div className="view-grid-1-2">
        <div className={`panels-container ${viewMode === 'split' ? 'split' : 'single'}`}>
          {activeParticipants.length === 0 ? (
            <div className="interface-card" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
              <Users size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
              <h3>Waiting for participants to join...</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', maxWidth: '300px' }}>
                Open this URL in another tab or private window as a Candidate or Interviewer to see them connect.
              </p>
            </div>
          ) : (
            activeParticipants
              .filter(p => {
                if (viewMode === 'interviewer') return p.role === 'interviewer';
                if (viewMode === 'candidate') return p.role === 'candidate';
                return true;
              })
              .map(p => {
                const isSelf = p.participant_id === socket.participantId;
                return (
                  <Panel 
                    key={p.participant_id}
                    participant={p}
                    isSelf={isSelf}
                    status={socket.status}
                    interimText={interimTexts[p.participant_id] || ''}
                    startRecording={socket.startRecording}
                    stopRecording={socket.stopRecording}
                    onStatusChange={(webcam, screenSharing) => socket.sendMessage({ type: 'status_change', webcam, screen_sharing: screenSharing })}
                    onNameSave={(newName) => socket.sendMessage({ type: 'name_change', display_name: newName })}
                    transcripts={transcripts}
                    onFrameSend={(base64Image) => socket.sendMessage({ type: 'video_frame', image: base64Image })}
                  />
                );
              })
          )}
        </div>

        <Insights 
          analysis={analysis} 
          participants={participants} 
          metadata={metadata} 
          confirmedCandidateId={confirmedCandidateId}
          onConfirmCandidate={handleConfirmCandidate}
        />
      </div>
    </div>
  );
}
