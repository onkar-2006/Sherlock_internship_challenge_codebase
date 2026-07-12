export interface Participant {
  participant_id: string;
  role: 'interviewer' | 'candidate' | 'observer';
  display_name: string;
  speaking_duration: number;
  webcam: boolean;
  screen_sharing: boolean;
  latest_frame?: string;
}

export interface AnalysisResult {
  identified_candidate_role: string;
  identified_candidate_id: string;
  confidence_score: number;
  explanation: string;
  history?: string[];
  face_match_score?: number;
  face_match_explanation?: string;
  voice_match_score?: number;
  voice_match_explanation?: string;
}

export interface TranscriptMessage {
  participant_id: string;
  role: string;
  display_name: string;
  text: string;
}

export interface InviteMetadata {
  scheduled_candidate: string;
  candidate_email: string;
  calendar_invite: string;
  interview_schedule: string;
  interviewers: string[];
  observers: string[];
  baseline_photo?: string;
}
