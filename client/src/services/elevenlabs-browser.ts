import { Conversation } from '@elevenlabs/client';
import { api } from './api';

export interface ElevenLabsSession {
  conversation: any;
  endSession: () => Promise<void>;
}

export interface SessionCallbacks {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onMessage?: (message: { role: 'user' | 'ai'; text: string }) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: string) => void;
}

export async function startBrowserSession(
  elevenLabsAgentId: string,
  callbacks: SessionCallbacks
): Promise<ElevenLabsSession> {
  // Get signed URL from our backend (keeps API key server-side)
  const { signedUrl } = await api.getSignedUrl(elevenLabsAgentId);

  const conversation = await Conversation.startSession({
    signedUrl,
    onConnect: () => {
      callbacks.onConnect?.();
      callbacks.onStatusChange?.('connected');
    },
    onDisconnect: () => {
      callbacks.onDisconnect?.();
      callbacks.onStatusChange?.('disconnected');
    },
    onMessage: (payload: { message: string; source: string; role: string }) => {
      const role = payload.role === 'agent' ? 'ai' : 'user';
      callbacks.onMessage?.({ role, text: payload.message });
    },
    onError: (message: string) => {
      console.error('ElevenLabs browser session error:', message);
      callbacks.onError?.(message);
    },
  });

  return {
    conversation,
    endSession: async () => {
      await conversation.endSession();
    },
  };
}
