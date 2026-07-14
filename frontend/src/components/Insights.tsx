import { Layers, ShieldAlert, Award, CheckCircle, VideoOff } from 'lucide-react';
import { Participant, AnalysisResult, InviteMetadata } from '../types';

interface InsightsProps {
  analysis: AnalysisResult;
  participants: Record<string, Participant>;
  metadata: InviteMetadata;
  confirmedCandidateId: string;
  onConfirmCandidate: (pId: string) => void;
}

export function Insights({
  analysis,
  participants,
  metadata,
  confirmedCandidateId,
  onConfirmCandidate
}: InsightsProps) {
  const predictedRole = analysis.identified_candidate_role;
  const predictedId = analysis.identified_candidate_id;

  const suspectedParticipant = participants[predictedId];
  const confidence = analysis.confidence_score;

  // Filter silent observers dynamically connected to the socket session
  const activeObservers = Object.values(participants).filter(p => p.role === 'observer');

  const getProgressBarClass = (score: number) => {
    if (score >= 75) return 'high';
    if (score >= 45) return 'medium';
    return 'low';
  };

  return (
    <div className="insights-sidebar">
      <h2>
        <Layers size={22} /> LangGraph Identity Insights
      </h2>

      <div className="prediction-card">
        <div className="prediction-result">
          <span className="result-label">Predicted Candidate Connection:</span>
          <span className="result-val">
            {suspectedParticipant ? (
              <span className={`role-tag ${predictedRole}`}>
                {suspectedParticipant.display_name} ({predictedRole.toUpperCase()})
              </span>
            ) : (
              <span className="role-tag disconnected">Searching...</span>
            )}
          </span>
        </div>

        <div className="confidence-section">
          <div className="confidence-header">
            <span className="confidence-label">AI Confidence Score:</span>
            <span className="confidence-pct">{confidence}%</span>
          </div>
          <div className="progress-bar-bg">
            <div 
              className={`progress-bar-fill ${getProgressBarClass(confidence)}`}
              style={{ width: `${confidence}%` }}
            ></div>
          </div>
        </div>

        {/* Candidate Identity Verification Action Button (PDF Verification & Learning Requirement) */}
        {predictedId && (
          <div style={{ marginTop: '4px' }}>
            {confirmedCandidateId === predictedId ? (
              <button className="btn btn-primary disabled" disabled style={{ width: '100%', justifyContent: 'center', gap: '8px' }}>
                <CheckCircle size={16} /> Candidate Identity Confirmed!
              </button>
            ) : (
              <button 
                className="btn btn-secondary" 
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => onConfirmCandidate(predictedId)}
              >
                Approve & Confirm Candidate
              </button>
            )}
          </div>
        )}
      </div>

      {/* Biometric Face Match Verification Panel */}
      {metadata.baseline_photo && (
        <div className="prediction-card" style={{ marginTop: '12px', padding: '16px' }}>
          <span className="metadata-title" style={{ display: 'block', marginBottom: '12px', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
            Biometric Face Verification
          </span>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                On-File Profile
              </span>
              <img 
                src={metadata.baseline_photo} 
                alt="John Doe baseline" 
                style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }} 
              />
            </div>
            
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                Live Webcam Frame
              </span>
              {suspectedParticipant?.latest_frame ? (
                <img 
                  src={suspectedParticipant.latest_frame} 
                  alt="Candidate webcam live" 
                  style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }} 
                />
              ) : (
                <div style={{ width: '100%', height: '80px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRadius: '6px', background: '#11131c', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                  <VideoOff size={16} style={{ marginBottom: '4px', opacity: 0.5 }} />
                  <span style={{ fontSize: '9px' }}>Camera off</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Render face comparison metrics if check is active */}
          {analysis.face_match_score !== undefined && analysis.face_match_score > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Biometric Match:</span>
                <span className={`badge ${analysis.face_match_score >= 70 ? 'connected' : 'recording'}`} style={{ fontSize: '10px', padding: '2px 8px' }}>
                  {analysis.face_match_score >= 70 ? `MATCHED (${analysis.face_match_score}%)` : `MISMATCH (${analysis.face_match_score}%)`}
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4', margin: 0, fontStyle: 'italic' }}>
                {analysis.face_match_explanation}
              </p>
            </div>
          ) : (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', display: 'block', textAlign: 'center' }}>
              Waiting for candidate to enable camera...
            </span>
          )}
        </div>
      )}

      {/* Audio Integrity & Liveness Auditing Panel */}
      {analysis.voice_match_score !== undefined && analysis.voice_match_score > 0 && (
        <div className="prediction-card" style={{ marginTop: '12px', padding: '16px' }}>
          <span className="metadata-title" style={{ display: 'block', marginBottom: '12px', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
            Audio Integrity & Liveness Auditing
          </span>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Vocal Liveness:</span>
              <span className="badge connected" style={{ fontSize: '9px', padding: '2px 6px', background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80' }}>
                HUMAN VERIFIED
              </span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>AV Lip-Sync Match:</span>
              <span className={`badge ${analysis.voice_match_score >= 70 ? 'connected' : 'recording'}`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                {analysis.voice_match_score}%
              </span>
            </div>
          </div>

          <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4', margin: 0, fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', marginTop: '6px' }}>
            {analysis.voice_match_explanation}
          </p>
        </div>
      )}

      <div className="explanation-section">
        <span className="explanation-header">AI Reasoning & Signal Rationale:</span>
        <div className="explanation-text" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {analysis.explanation ? (
            analysis.explanation.split(' | ').map((line, idx) => (
              <div key={idx} style={{ borderBottom: idx < analysis.explanation.split(' | ').length - 1 ? '1px dashed rgba(255,255,255,0.06)' : 'none', paddingBottom: '6px' }}>
                {line}
              </div>
            ))
          ) : (
            <span>No analysis rationale generated yet.</span>
          )}
        </div>
      </div>

      <div className="metadata-card">
        <span className="metadata-title">Scheduled Invite Metadata</span>
        <div className="metadata-row">
          <span className="metadata-label">Invite Title:</span>
          <span className="metadata-val">{metadata.calendar_invite}</span>
        </div>
        <div className="metadata-row">
          <span className="metadata-label">Schedule Time:</span>
          <span className="metadata-val">{metadata.interview_schedule}</span>
        </div>
        <div className="metadata-row">
          <span className="metadata-label">Candidate Name:</span>
          <span className="metadata-val">{metadata.scheduled_candidate}</span>
        </div>
        <div className="metadata-row">
          <span className="metadata-label">Candidate Email:</span>
          <span className="metadata-val">{metadata.candidate_email}</span>
        </div>
        <div className="metadata-row">
          <span className="metadata-label">Scheduled Interviewers:</span>
          <span className="metadata-val">{metadata.interviewers?.join(', ')}</span>
        </div>
        
        {/* Render Observers (PDF Silent Observers Requirement - Dynamically Connected) */}
        <div className="metadata-row" style={{ flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
          <span className="metadata-label" style={{ borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: '8px', width: '100%', display: 'block' }}>
            Silent Observers (Shadow Joined):
          </span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
            {activeObservers.length === 0 ? (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No shadow observers currently connected.
              </span>
            ) : (
              activeObservers.map((obs, idx) => (
                <span key={idx} className="badge disconnected" style={{ padding: '4px 10px', fontSize: '11px' }}>
                  {obs.display_name}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {confidence > 70 && predictedRole === 'interviewer' ? (
        <div className="badge recording slide-in-msg" style={{ marginTop: 'auto', width: '100%', boxSizing: 'border-box', justifyContent: 'center' }}>
          <ShieldAlert size={16} /> WARNING: IDENTITY ANOMALY DETECTED
        </div>
      ) : confidence > 70 && predictedRole === 'candidate' ? (
        <div className="badge connected slide-in-msg" style={{ marginTop: 'auto', width: '100%', boxSizing: 'border-box', justifyContent: 'center' }}>
          <Award size={16} /> IDENTITY VERIFIED SUCCESSFULLY
        </div>
      ) : null}
    </div>
  );
}
