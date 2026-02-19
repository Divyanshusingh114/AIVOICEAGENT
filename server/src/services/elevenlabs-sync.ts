import { getDb } from './db.js';
import { getAgentApiKey } from './agent-keys.js';
import { broadcastCallEvent } from '../websocket/call-events.js';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

export interface ElevenLabsSyncResult {
  success: boolean;
  duration?: number;
  status?: string;
}

/**
 * Fetches conversation data from ElevenLabs and updates the local call_logs row.
 * Single source of truth — call this instead of scattered fetch logic.
 *
 * Updates: duration, status (to 'completed' if done)
 */
export async function syncCallFromElevenLabs(
  conversationId: string,
  agentId?: string | null
): Promise<ElevenLabsSyncResult> {
  const apiKey = getAgentApiKey(agentId);
  if (!apiKey) return { success: false };

  try {
    const response = await fetch(
      `${ELEVENLABS_BASE}/convai/conversations/${encodeURIComponent(conversationId)}`,
      { headers: { 'xi-api-key': apiKey } }
    );

    if (!response.ok) {
      console.warn(`[EL-Sync] API returned ${response.status} for ${conversationId}`);
      return { success: false };
    }

    const data = await response.json() as any;
    const duration = Math.ceil(data.metadata?.call_duration_secs || data.duration_seconds || 0);
    const elStatus = data.status; // 'processing' | 'done' | 'failed'

    const db = getDb();

    // Update duration if available
    if (duration > 0) {
      db.prepare(
        'UPDATE call_logs SET duration = ? WHERE elevenLabsConversationId = ?'
      ).run(duration, conversationId);
    }

    // Update status to completed if ElevenLabs says done
    if (elStatus === 'done') {
      db.prepare(
        "UPDATE call_logs SET status = 'completed' WHERE elevenLabsConversationId = ? AND status != 'completed'"
      ).run(conversationId);
    }

    if (duration > 0) {
      // Broadcast so frontend refreshes
      const log = db.prepare(
        'SELECT sid FROM call_logs WHERE elevenLabsConversationId = ?'
      ).get(conversationId) as any;

      if (log?.sid) {
        broadcastCallEvent({
          type: 'call_status',
          callSid: log.sid,
          status: 'completed',
          duration,
          timestamp: new Date().toISOString(),
        });
      }
    }

    console.log(`[EL-Sync] ${conversationId}: status=${elStatus}, duration=${duration}s`);
    return { success: true, duration, status: elStatus };
  } catch (err: any) {
    console.warn(`[EL-Sync] Failed for ${conversationId}:`, err.message);
    return { success: false };
  }
}

/**
 * Syncs with retries. Schedules background retries if ElevenLabs is still processing.
 * Fire-and-forget — call once after the call ends.
 */
export function syncCallWithRetries(
  conversationId: string,
  agentId?: string | null,
  maxAttempts = 3,
  initialDelayMs = 10000
) {
  const attempt = async (n: number) => {
    console.log(`[EL-Sync] Attempt ${n}/${maxAttempts} for ${conversationId}`);
    const result = await syncCallFromElevenLabs(conversationId, agentId);

    if (!result.success && n < maxAttempts) {
      setTimeout(() => attempt(n + 1), initialDelayMs * n);
      return;
    }

    // Retry if still processing or duration not yet available
    if (result.status === 'processing' || (result.duration === 0 && n < maxAttempts)) {
      const delay = initialDelayMs * n;
      console.log(`[EL-Sync] Still processing, retrying in ${delay / 1000}s...`);
      setTimeout(() => attempt(n + 1), delay);
    }
  };

  // First attempt after initial delay (give ElevenLabs time to process)
  setTimeout(() => attempt(1), initialDelayMs);
}
