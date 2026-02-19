import { Router, type Request, type Response } from 'express';
import twilio from 'twilio';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../services/db.js';

const router = Router();

// POST /api/voice — Twilio webhook, returns TwiML
router.post('/', (req: Request, res: Response) => {
  const agentId = req.query.agentId as string || '';
  const response = new twilio.twiml.VoiceResponse();

  const connect = response.connect();
  const stream = connect.stream({
    url: `wss://${req.headers.host}/media-stream`
  });

  // Pass metadata to the stream
  stream.parameter({ name: 'agentId', value: agentId });
  stream.parameter({ name: 'from', value: req.body.From || 'Unknown' });

  // Create log entry for incoming call
  try {
    const db = getDb();
    const from = req.body.From || 'Unknown';
    const callSid = req.body.CallSid;
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;

    if (agent && callSid) {
      const logId = uuidv4();
      db.prepare(
        `INSERT INTO call_logs (id, sid, phoneNumber, agentId, agentName, provider, status)
         VALUES (?, ?, ?, ?, ?, 'twilio', 'connected')`
      ).run(logId, callSid, from, agentId, agent.name);

      db.prepare(
        `INSERT INTO active_calls (sid, phoneNumber, agentId, status, startTime, elevenLabsAgentId)
         VALUES (?, ?, ?, 'connected', ?, ?)`
      ).run(callSid, from, agentId, Date.now(), agent.elevenLabsId);

      console.log(`[Voice] Created log for incoming Twilio call: ${callSid}`);
    }
  } catch (err: any) {
    console.error('[Voice] Error creating log for incoming Twilio call:', err.message);
  }

  res.type('text/xml');
  res.send(response.toString());
});

// POST /api/voice/plivo — Plivo webhook, returns Plivo XML
router.post('/plivo', async (req: Request, res: Response) => {
  const agentId = req.query.agentId as string || '';
  const logId = req.query.logId as string || '';
  const callUuid = req.body.CallUUID;
  const from = req.body.From || 'Unknown';

  console.log(`[Voice] Plivo Answer - Agent: ${agentId}, LogID: ${logId}, CallUUID: ${callUuid}`);

  let effectiveLogId = logId;

  if (logId && callUuid) {
    console.log(`[Voice] Attempting Plivo mapping: logId=${logId}, callUuid=${callUuid}`);
    try {
      const db = getDb();
      // 1. Get current sid (requestUuid)
      const logEntry = db.prepare('SELECT id, sid FROM call_logs WHERE id = ?').get(logId) as any;

      if (logEntry) {
        const oldSid = logEntry.sid;
        // 2. Update active_calls using old sid (swap requestUuid for callUuid)
        db.prepare('UPDATE active_calls SET sid = ?, status = \'connected\' WHERE sid = ?').run(callUuid, oldSid);

        // 3. Update call_logs with the actual CallUUID
        db.prepare('UPDATE call_logs SET sid = ?, status = \'connected\' WHERE id = ?').run(callUuid, logId);

        console.log(`[Voice] Plivo Mapping Success: ${oldSid} -> ${callUuid} for logId ${logId}`);
        effectiveLogId = logId;
      } else {
        console.warn(`[Voice] Plivo Answer: Log entry ${logId} NOT found in DB`);
      }
    } catch (err: any) {
      console.error('[Voice] SQLite Error during Plivo mapping:', err.message);
    }
  } else if (callUuid) {
    // Incoming call or mission logId - Create a new log entry
    try {
      const db = getDb();
      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
      if (agent) {
        effectiveLogId = uuidv4();
        // Create log
        db.prepare(
          `INSERT INTO call_logs (id, sid, phoneNumber, agentId, agentName, provider, status)
           VALUES (?, ?, ?, ?, ?, 'plivo', 'connected')`
        ).run(effectiveLogId, callUuid, from, agentId, agent.name);

        // Create active call
        db.prepare(
          `INSERT INTO active_calls (sid, phoneNumber, agentId, status, startTime, elevenLabsAgentId)
           VALUES (?, ?, ?, 'connected', ?, ?)`
        ).run(callUuid, from, agentId, Date.now(), agent.elevenLabsId);

        console.log(`[Voice] Created new log for incoming Plivo call: ${callUuid}`);
      }
    } catch (err: any) {
      console.error('[Voice] Error creating log for incoming call:', err.message);
    }
  }

  // Start background recording via API
  if (callUuid) {
    try {
      const authId = process.env.PLIVO_AUTH_ID;
      const authToken = process.env.PLIVO_AUTH_TOKEN;
      if (authId && authToken) {
        const plivoModule = await import('plivo');
        const client = new plivoModule.Client(authId, authToken);
        const ngrokUrl = process.env.NGROK_URL || process.env.PUBLIC_URL;

        client.calls.record(callUuid, {
          fileFormat: 'mp3',
          callbackUrl: `${ngrokUrl}/api/webhooks/plivo-status?logId=${effectiveLogId}`,
          callback_url: `${ngrokUrl}/api/webhooks/plivo-status?logId=${effectiveLogId}`,
          callbackMethod: 'POST',
          callback_method: 'POST'
        }).then(() => console.log(`[Voice] Recording started for Plivo call ${callUuid} with logId ${effectiveLogId}`))
          .catch(err => console.error(`[Voice] Failed to start Plivo recording:`, err));
      }
    } catch (err) {
      console.warn('[Voice] Error initiating Plivo recording:', err);
    }
  }

  const host = req.headers.host;
  // Crucial: Pass callUuid AS the stream identity if needed, but Plivo usually sends it in 'start'
  const streamUrl = `wss://${host}/media-stream?agentId=${encodeURIComponent(agentId)}&provider=plivo&callUuid=${callUuid}`;

  const extraData = JSON.stringify({
    agentId,
    from,
    provider: 'plivo',
    callUuid
  });

  const ngrokUrl = process.env.NGROK_URL || process.env.PUBLIC_URL;
  const statusCallbackUrl = `${ngrokUrl}/api/webhooks/plivo-status?logId=${effectiveLogId}`;

  const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000" statusCallbackUrl="${statusCallbackUrl.replace(/&/g, '&amp;')}" statusCallbackMethod="POST" extraData='${extraData.replace(/'/g, '&apos;')}'>${streamUrl.replace(/&/g, '&amp;')}</Stream>
</Response>`;

  console.log(`[Voice] Plivo Answer XML: ${xmlResponse}`);
  res.type('text/xml');
  res.send(xmlResponse);
});

export default router;
