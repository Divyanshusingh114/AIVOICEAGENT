import { Router, type Request, type Response } from 'express';
import { getDb } from '../services/db.js';
import { createOutboundCall } from '../services/twilio.js';
import { getAgentApiKey } from '../services/agent-keys.js';

const router = Router();

// GET /api/calls/recording/:sid — serve recording (ElevenLabs preferred, Twilio fallback)
router.get('/recording/:sid', async (req: Request, res: Response) => {
  const callSid = req.params.sid as string;
  const db = getDb();
  const log = db.prepare('SELECT recordingUrl, elevenLabsConversationId, provider, agentId FROM call_logs WHERE sid = ?').get(callSid) as any;

  if (!log) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }

  // 1. Try ElevenLabs recording first (Highest Quality - Stereo)
  if (log.elevenLabsConversationId) {
    try {
      const apiKey = getAgentApiKey(log.agentId);
      if (apiKey) {
        console.log(`[Calls] Attempting ElevenLabs fetch for: ${log.elevenLabsConversationId}`);
        const response = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(log.elevenLabsConversationId)}/audio`,
          { headers: { 'xi-api-key': apiKey } }
        );

        if (response.ok) {
          const contentType = response.headers.get('content-type') || 'audio/mpeg';
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `attachment; filename="recording-${callSid}.mp3"`);

          const arrayBuffer = await response.arrayBuffer();
          res.send(Buffer.from(arrayBuffer));
          return;
        } else {
          const errText = await response.text();
          console.warn(`[Calls] ElevenLabs audio failed for ${log.elevenLabsConversationId}: ${response.status} ${response.statusText}. Error: ${errText.substring(0, 100)}`);
        }
      }
    } catch (err) {
      console.warn('[Calls] Error fetching ElevenLabs audio, falling back to provider recording:', err);
    }
  }

  // 2. Fallback to Provider recording (Plivo/Twilio)
  if (!log.recordingUrl) {
    res.status(404).json({ error: 'No recording available' });
    return;
  }

  const isPlivoUrl = log.recordingUrl && (log.recordingUrl.includes('plivo.com') || log.recordingUrl.includes('plivo-recordings'));

  // Proxy recording
  try {
    const isTwilio = log.recordingUrl.includes('twilio.com');
    const headers: any = {};

    if (isTwilio) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      if (accountSid && authToken) {
        headers['Authorization'] = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      }
    } else if (isPlivoUrl || log.provider === 'plivo') {
      const authId = process.env.PLIVO_AUTH_ID;
      const authToken = process.env.PLIVO_AUTH_TOKEN;
      if (authId && authToken) {
        headers['Authorization'] = 'Basic ' + Buffer.from(`${authId}:${authToken}`).toString('base64');
      }
    }

    const response = await fetch(log.recordingUrl, { headers });

    if (!response.ok) {
      res.redirect(log.recordingUrl);
      return;
    }

    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="recording-${callSid}.mp3"`);

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    console.error('Recording proxy error:', error);
    res.redirect(log.recordingUrl);
  }
});

// GET /api/calls/logs
router.get('/logs', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { page = '1', limit = '50', search, status } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const offset = (pageNum - 1) * limitNum;

    let where = '1=1';
    const params: any[] = [];

    if (search) {
      where += ' AND (sid LIKE ? OR phoneNumber LIKE ? OR agentName LIKE ? OR campaignName LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM call_logs WHERE ${where}`).get(...params) as any;
    const total = countRow.total;

    const logs = db.prepare(
      `SELECT * FROM call_logs WHERE ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    ).all(...params, limitNum, offset) as any[];

    // Route all recordings through our proxy to handle Twilio auth
    const enrichedLogs = logs.map(log => {
      const hasRecording = log.recordingUrl || log.elevenLabsConversationId;
      return {
        ...log,
        recordingUrl: hasRecording ? `/api/calls/recording/${log.sid}` : null,
      };
    });

    console.log(`[calls/logs] Returning ${enrichedLogs.length} of ${total} total logs (page ${pageNum})`);

    res.json({
      logs: enrichedLogs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      }
    });
  } catch (error: any) {
    console.error('[calls/logs] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch call logs' });
  }
});

// POST /api/calls/outbound — single test call
router.post('/outbound', async (req: Request, res: Response) => {
  const { to, agentId, provider } = req.body;

  if (!to || !agentId) {
    res.status(400).json({ error: 'to and agentId are required' });
    return;
  }

  const selectedProvider = provider || 'twilio';

  try {
    let callSid: string;
    if (selectedProvider === 'plivo') {
      const { createPlivoOutboundCall } = await import('../services/plivo.js');
      callSid = await createPlivoOutboundCall(to, agentId);
    } else {
      callSid = await createOutboundCall(to, agentId);
    }
    res.json({ success: true, callSid, provider: selectedProvider });
  } catch (error: any) {
    console.error('Outbound call error:', error);
    res.status(500).json({ error: error.message || 'Failed to create outbound call' });
  }
});

// DELETE /api/calls/logs/:sid — delete a call log by SID
router.delete('/logs/:sid', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM call_logs WHERE sid = ?').run(req.params.sid);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Call log not found' });
      return;
    }
    res.json({ success: true, deleted: req.params.sid });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
