export type CallState = 'idle' | 'ringing' | 'joining' | 'active' | 'reconnecting' | 'ended';
export type CallType = 'audio' | 'video';
export type SourceType = 'direct' | 'conversation' | 'group';
export type ParticipantRole = 'host' | 'participant' | 'listener';
export type JoinState = 'invited' | 'joining' | 'joined' | 'left';

export interface CallSession {
  id: string;
  call_type: CallType;
  source_type: SourceType;
  source_id?: string;
  initiator_user_id: string;
  room_id?: string;
  state: CallState;
  audio_only: boolean;
  max_participants: number;
  started_at?: string;
  answered_at?: string;
  ended_at?: string;
  ended_reason?: string;
  created_at: string;
  participants: CallParticipant[];
}

export interface CallParticipant {
  id: string;
  user_id: string;
  role: ParticipantRole;
  join_state: JoinState;
  audio_muted: boolean;
  video_muted: boolean;
  hand_raised: boolean;
  is_screen_sharing: boolean;
  joined_at?: string;
  left_at?: string;
}

export interface CallInvite {
  id: string;
  call_session_id: string;
  inviter_user_id: string;
  invitee_user_id: string;
  response_status: 'pending' | 'accepted' | 'declined' | 'expired';
  created_at: string;
}

export interface ICEServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface JoinResponse {
  call: CallSession;
  token: string;
  ice_servers: ICEServer[];
  signaling_endpoint: string;
}

export interface CallHistoryItem {
  id: string;
  call_type: CallType;
  source_type: SourceType;
  initiator_user_id: string;
  state: string;
  audio_only: boolean;
  duration_seconds: number;
  ended_reason?: string;
  created_at: string;
  ended_at?: string;
  participants: CallParticipant[];
}

export interface CreateCallRequest {
  call_type: CallType;
  source_type: SourceType;
  source_id?: string;
  audio_only?: boolean;
  invitee_user_ids: string[];
}

export interface InviteParticipantsRequest {
  user_ids: string[];
}
