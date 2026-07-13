import { useState, useEffect, useRef } from 'react';
import { User, Mic, MicOff, Radio, Video, VideoOff, Monitor } from 'lucide-react';
import { Participant, TranscriptMessage } from '../types';

interface PanelProps {
  participant: Participant;
  isSelf: boolean;
  status: 'disconnected' | 'connected' | 'recording';
  interimText: string;
  startRecording: () => void;
  stopRecording: () => void;
  onStatusChange: (webcam: boolean, screenSharing: boolean) => void;
  onNameSave: (newName: string) => void;
  transcripts: TranscriptMessage[];
  onFrameSend?: (base64Image: string) => void;
}

export function Panel({
  participant,
  isSelf,
  status,
  interimText,
  startRecording,
  stopRecording,
  onStatusChange,
  onNameSave,
  transcripts,
  onFrameSend
}: PanelProps) {
  const [nameInput, setNameInput] = useState(participant.display_name);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Sync name input when display_name is updated by the server
  useEffect(() => {
    setNameInput(participant.display_name);
  }, [participant.display_name]);

  const role = participant.role;
  const isInterviewer = role === 'interviewer';
  const webcam = participant.webcam;

  // Setup webcam stream for local preview
  useEffect(() => {
    if (isSelf && webcam !== false && role !== 'interviewer') {
      navigator.mediaDevices.getUserMedia({ video: { width: 240, height: 180 } })
        .then(stream => {
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
          }
          localStreamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => {
          console.error("Error accessing webcam:", err);
        });
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
    }
    
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
    };
  }, [webcam, isSelf, role]);

  // Periodic capture interval of webcam frames to stream over WS
  useEffect(() => {
    if (!isSelf || webcam === false || !onFrameSend || role === 'interviewer') return;

    const interval = setInterval(() => {
      if (!videoRef.current || !localStreamRef.current) return;
      try {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 120;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const base64Image = canvas.toDataURL('image/jpeg', 0.5); // High compression for zero latency
          onFrameSend(base64Image);
        }
      } catch (e) {
        console.error("Biometric snapshot error:", e);
      }
    }, 8000); // Once every 8 seconds

    return () => clearInterval(interval);
  }, [isSelf, webcam, onFrameSend]);

  const renderConnectionBadge = () => {
    if (isSelf && status === 'recording') {
      return (
        <span className="badge recording">
          <span className="dot pulse-red"></span> YOUR STREAM
        </span>
      );
    }
    
    if (participant.screen_sharing) {
      return (
        <span className="badge connected" style={{ background: 'rgba(6, 182, 212, 0.1)', color: '#06b6d4' }}>
          <span className="dot glow-green" style={{ background: '#06b6d4' }}></span> SHARING SCREEN
        </span>
      );
    }

    if (webcam !== false) {
      return (
        <span className="badge connected">
          <span className="dot glow-green"></span> ACTIVE
        </span>
      );
    }

    return (
      <span className="badge disconnected">
        <span className="dot grey"></span> OFFLINE
      </span>
    );
  };

  return (
    <div className={`interface-card ${role}`}>
      <div className="card-header">
        <div className="role-title">
          <div className={`role-icon ${role}`}>
            <User size={20} />
          </div>
          <div>
            <h3>
              {participant.display_name} {isSelf && '(You)'}
            </h3>
            <p>{isInterviewer ? 'Interviewer Panel' : 'Candidate Panel'}</p>
          </div>
        </div>
        {renderConnectionBadge()}
      </div>

      {/* Webcam Preview / Stream image */}
      {webcam !== false && role !== 'interviewer' && (
        <div className="webcam-preview-container" style={{ padding: '0 16px', marginBottom: '8px' }}>
          {isSelf ? (
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', background: '#11131c', border: '1px solid rgba(255,255,255,0.05)' }} 
            />
          ) : (
            participant.latest_frame ? (
              <img 
                src={participant.latest_frame} 
                alt="Webcam Stream" 
                style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', background: '#11131c', border: '1px solid rgba(255,255,255,0.05)' }} 
              />
            ) : (
              <div style={{ width: '100%', height: '140px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRadius: '8px', background: '#11131c', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                <VideoOff size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <span style={{ fontSize: '12px' }}>Connecting webcam stream...</span>
              </div>
            )
          )}
        </div>
      )}

      {/* Display Name Editor */}
      <div className="display-name-editor">
        <label>Display Name:</label>
        {isSelf ? (
          <input 
            type="text" 
            value={nameInput} 
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={() => onNameSave(nameInput)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onNameSave(nameInput);
              }
            }}
            placeholder="Edit display name..."
            disabled={status === 'recording'}
          />
        ) : (
          <span style={{ fontSize: '14px', color: '#fff', padding: '6px 0' }}>
            {participant.display_name}
          </span>
        )}
      </div>

      {/* Control Buttons (Only rendered if it is the local user) */}
      {isSelf && (
        <div className="controls">
          {status === 'recording' ? (
            <button className="btn btn-danger" onClick={stopRecording}>
              <MicOff size={18} /> Stop Microphone
            </button>
          ) : (
            <button className="btn btn-primary" onClick={startRecording}>
              <Mic size={18} /> Start Microphone
            </button>
          )}

          {role !== 'interviewer' && (
            <button 
              className={`btn ${webcam === false ? 'btn-danger' : ''}`}
              onClick={() => onStatusChange(!webcam, participant.screen_sharing)}
            >
              {webcam !== false ? <Video size={16} /> : <VideoOff size={16} />}
              {webcam !== false ? 'Camera ON' : 'Camera OFF'}
            </button>
          )}

          <button 
            className={`btn ${participant.screen_sharing ? 'btn-primary' : ''}`}
            onClick={() => onStatusChange(webcam !== false, !participant.screen_sharing)}
          >
            <Monitor size={16} />
            {participant.screen_sharing ? 'Sharing' : 'Share Screen'}
          </button>

          {status === 'recording' && (
            <div className="volume-meter-wrapper">
              <span className="volume-label">Mic Activity:</span>
              <div className="volume-bar-bg">
                <div 
                  id={`volume-bar-fill-${participant.participant_id}`}
                  className={`volume-bar-fill ${role}`} 
                  style={{ width: '0%' }}
                ></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Metrics Section */}
      <div className="metrics-summary">
        <div className="metric-item">
          <span className="metric-label">Speaking Duration:</span>
          <span className="metric-val">{participant.speaking_duration.toFixed(1)}s</span>
        </div>
        {role !== 'interviewer' && (
          <div className="metric-item">
            <span className="metric-label">Webcam:</span>
            <span className={`metric-val ${webcam !== false ? 'text-green' : 'text-danger'}`}>
              {webcam !== false ? 'Active' : 'Disabled'}
            </span>
          </div>
        )}
      </div>

      {/* Live Transcript Logs */}
      <div className="transcript-box">
        <div className="box-header">
          <h4>Live Conversation Log</h4>
          <span className="live-indicator">
            <Radio size={14} className="icon-pulse" /> Live Feed
          </span>
        </div>

        <div className="message-container">
          {transcripts.length === 0 && !interimText ? (
            <div className="empty-state">
              <p>Waiting for speech...</p>
              {isSelf && <p className="sub">Start your microphone and speak to transcribe.</p>}
            </div>
          ) : (
            <>
              {transcripts.map((msg, index) => {
                const alignClass = msg.participant_id === participant.participant_id ? 'self' : 'other';
                return (
                  <div 
                    key={index} 
                    className={`message-bubble slide-in-msg ${msg.role} ${alignClass}`}
                  >
                    <div className="message-meta">
                      {msg.display_name}
                    </div>
                    <div className="message-text">
                      {msg.text}
                    </div>
                  </div>
                );
              })}
              
              {interimText && (
                <div className={`message-bubble slide-in-msg ${role} self interim`}>
                  <div className="message-meta">
                    {participant.display_name}
                  </div>
                  <div className="message-text streaming-pulse">
                    {interimText}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
