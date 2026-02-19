import { Router, type Request, type Response } from 'express';
import { getDb } from '../services/db.js';
import { getApiKeyByElevenLabsId, getAgentApiKey } from '../services/agent-keys.js';
import { syncCallFromElevenLabs } from '../services/elevenlabs-sync.js';

const router = Router();

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

// GET /api/elevenlabs/signed-url
router.get('/signed-url', async (req: Request, res: Response) => {
  const agentId = req.query.agent_id as string;
  if (!agentId) {
    res.status(400).json({ error: 'agent_id query parameter is required' });
    return;
  }

  // agent_id here is the ElevenLabs agent ID — look up key by that
  const apiKey = getApiKeyByElevenLabsId(agentId);
  if (!apiKey) {
    res.status(500).json({ error: 'ElevenLabs API key not configured on server' });
    return;
  }

  try {
    const response = await fetch(
      `${ELEVENLABS_BASE}/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`,
      {
        method: 'GET',
        headers: { 'xi-api-key': apiKey },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({ error: `ElevenLabs API error: ${errText}` });
      return;
    }

    const data = await response.json();
    res.json({ signedUrl: data.signed_url });
  } catch (error: any) {
    console.error('ElevenLabs signed URL error:', error);
    res.status(500).json({ error: error.message || 'Failed to get signed URL' });
  }
});

// GET /api/elevenlabs/conversations — list conversations for an agent
router.get('/conversations', async (req: Request, res: Response) => {
  const agentId = (req.query.agent_id as string) || process.env.ELEVENLABS_AGENT_ID;
  const pageSize = req.query.page_size || '50';
  const cursor = req.query.cursor as string;

  if (!agentId) {
    // No agent ID configured — return empty list instead of erroring
    res.json({ conversations: [], next_cursor: null, has_more: false });
    return;
  }

  const apiKey = getApiKeyByElevenLabsId(agentId);
  if (!apiKey) {
    res.status(500).json({ error: 'ElevenLabs API key not configured on server' });
    return;
  }

  const params = new URLSearchParams();
  params.set('agent_id', agentId);
  params.set('page_size', String(pageSize));
  if (cursor) params.set('cursor', cursor);

  try {
    const response = await fetch(
      `${ELEVENLABS_BASE}/convai/conversations?${params.toString()}`,
      { headers: { 'xi-api-key': apiKey } }
    );

    if (!response.ok) {
      // If agent not found or API error, return empty list instead of breaking the client
      console.warn(`[ElevenLabs] Conversations API returned ${response.status} for agent ${agentId}`);
      res.json({ conversations: [], next_cursor: null, has_more: false });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('ElevenLabs list conversations error:', error);
    res.json({ conversations: [], next_cursor: null, has_more: false });
  }
});

/** Helper: resolve the correct API key from an ElevenLabs conversation ID via call_logs */
function getApiKeyByConversationId(conversationId: string): string | null {
  const db = getDb();
  const log = db.prepare('SELECT agentId FROM call_logs WHERE elevenLabsConversationId = ?').get(conversationId) as any;
  if (log?.agentId) {
    return getAgentApiKey(log.agentId);
  }
  return process.env.ELEVENLABS_API_KEY || null;
}

// GET /api/elevenlabs/conversations/:id — get conversation details (status, transcript, analysis)
router.get('/conversations/:id', async (req: Request, res: Response) => {
  const conversationId = req.params.id as string;
  const apiKey = getApiKeyByConversationId(conversationId);
  if (!apiKey) {
    res.status(500).json({ error: 'ElevenLabs API key not configured on server' });
    return;
  }

  try {
    const response = await fetch(
      `${ELEVENLABS_BASE}/convai/conversations/${encodeURIComponent(conversationId)}`,
      { headers: { 'xi-api-key': apiKey } }
    );

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({ error: `ElevenLabs API error: ${errText}` });
      return;
    }

    const data = await response.json() as any;

    // Sync accurate ElevenLabs data back to local DB (fire-and-forget)
    const log = getDb().prepare('SELECT agentId FROM call_logs WHERE elevenLabsConversationId = ?').get(conversationId) as any;
    syncCallFromElevenLabs(conversationId, log?.agentId).catch(() => {});

    res.json(data);
  } catch (error: any) {
    console.error('ElevenLabs get conversation error:', error);
    res.status(500).json({ error: error.message || 'Failed to get conversation details' });
  }
});

// GET /api/elevenlabs/conversations/:id/audio — get conversation audio recording
router.get('/conversations/:id/audio', async (req: Request, res: Response) => {
  const conversationId = req.params.id as string;
  const apiKey = getApiKeyByConversationId(conversationId);
  if (!apiKey) {
    res.status(500).json({ error: 'ElevenLabs API key not configured on server' });
    return;
  }

  try {
    const response = await fetch(
      `${ELEVENLABS_BASE}/convai/conversations/${encodeURIComponent(conversationId)}/audio`,
      { headers: { 'xi-api-key': apiKey } }
    );

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({ error: `ElevenLabs API error: ${errText}` });
      return;
    }

    // Stream the audio response directly to the client
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition) {
      res.setHeader('Content-Disposition', contentDisposition);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="conversation-${conversationId}.mp3"`);
    }

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    console.error('ElevenLabs get audio error:', error);
    res.status(500).json({ error: error.message || 'Failed to get conversation audio' });
  }
});

export default router;
