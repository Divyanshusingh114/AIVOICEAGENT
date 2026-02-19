export type CallStatus = 'initiated' | 'ringing' | 'connected' | 'completed' | 'failed' | 'busy';

export interface VoiceAgent {
  id: string;
  name: string;
  elevenLabsId: string;
  voiceId: string;
  language: string;
  vadSensitivity: number;
  silenceTimeout: number;
  apiKey?: string;
}

export interface Campaign {
  id: string;
  name: string;
  agentId: string;
  provider: 'twilio' | 'plivo' | 'asterisk';
  fromNumber: string;
  status: 'active' | 'paused' | 'stopped' | 'scheduled';
  scheduledAt?: string;
  callCount: number;
  successfulCalls: number;
  lastRun?: string;
  recordingEnabled: boolean;
  phoneList: string[];
}

export interface CallLog {
  id: string;
  sid: string;
  phoneNumber: string;
  campaignName: string;
  agentName: string;
  provider: 'twilio' | 'plivo' | 'asterisk';
  status: CallStatus;
  duration: number;
  recordingUrl?: string;
  transcript?: string;
  timestamp: string;
  campaignId?: string;
  agentId?: string;
}

export interface Credentials {
  elevenLabsApiKey: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  asteriskSipHost: string;
  asteriskSipUser: string;
  asteriskSipPass: string;
}

export interface DashboardData {
  totalCalls: number;
  totalConnected: number;
  totalFailed: number;
  activeCalls: number;
  avgDuration: number;
  chartData: { name: string; calls: number; connected: number }[];
  campaignStats: {
    id: string;
    name: string;
    provider: string;
    status: string;
    callCount: number;
    successfulCalls: number;
  }[];
}

export interface CallEvent {
  type: 'call_started' | 'call_status' | 'call_ended' | 'transcript';
  callSid: string;
  status?: CallStatus;
  campaignId?: string;
  agentId?: string;
  phoneNumber?: string;
  transcript?: { role: 'user' | 'ai'; text: string };
  duration?: number;
  timestamp: string;
}

export interface ActiveCall {
  id: string;
  sid: string;
  phoneNumber: string;
  campaignId?: string;
  agentId: string;
  status: CallStatus;
  startTime: number;
}
