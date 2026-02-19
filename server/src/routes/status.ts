import { Router, type Request, type Response } from 'express';
import { getDb } from '../services/db.js';
import { broadcastCallEvent } from '../websocket/call-events.js';
import { onCampaignCallCompleted } from '../services/campaign-runner.js';

const router = Router();

// POST /api/webhooks/twilio-status — Twilio status callback
router.post('/', (req: Request, res: Response) => {
  const { CallSid, CallStatus, CallDuration } = req.body;

  if (!CallSid) {
    res.status(400).send('Missing CallSid');
    return;
  }

  const db = getDb();

  // Map Twilio statuses to our statuses
  let status = CallStatus;
  if (CallStatus === 'in-progress') status = 'connected';
  if (CallStatus === 'no-answer' || CallStatus === 'canceled') status = 'failed';

  const duration = parseInt(CallDuration || '0', 10);
  const recordingUrl = req.body.RecordingUrl || null;

  // Update call_logs (include recording URL if provided)
  // Skip duration update from Twilio if call has an ElevenLabs conversation (ElevenLabs duration is more accurate)
  if (recordingUrl) {
    db.prepare(
      `UPDATE call_logs SET status = ?,
        duration = CASE WHEN ? > 0 AND elevenLabsConversationId IS NULL THEN ? ELSE duration END,
        recordingUrl = ? WHERE sid = ?`
    ).run(status, duration, duration, recordingUrl, CallSid);
  } else {
    db.prepare(
      `UPDATE call_logs SET status = ?,
        duration = CASE WHEN ? > 0 AND elevenLabsConversationId IS NULL THEN ? ELSE duration END
        WHERE sid = ?`
    ).run(status, duration, duration, CallSid);
  }

  // Get the active call info
  const activeCall = db.prepare('SELECT * FROM active_calls WHERE sid = ?').get(CallSid) as any;

  if (activeCall) {
    // Update campaign stats on completion
    if (status === 'completed' || status === 'failed' || status === 'busy' || status === 'no-answer' || status === 'canceled') {
      db.prepare('DELETE FROM active_calls WHERE sid = ?').run(CallSid);

      if (activeCall.campaignId) {
        db.prepare('UPDATE campaigns SET callCount = callCount + 1 WHERE id = ?').run(activeCall.campaignId);

        if (status === 'completed') {
          db.prepare('UPDATE campaigns SET successfulCalls = successfulCalls + 1 WHERE id = ?').run(activeCall.campaignId);
        }

        onCampaignCallCompleted(activeCall.campaignId);
      }
    } else {
      // Update active call status
      db.prepare('UPDATE active_calls SET status = ? WHERE sid = ?').run(status, CallSid);
    }

    broadcastCallEvent({
      type: status === 'completed' || status === 'failed' ? 'call_ended' : 'call_status',
      callSid: CallSid,
      status,
      campaignId: activeCall.campaignId,
      agentId: activeCall.agentId,
      phoneNumber: activeCall.phoneNumber,
      duration,
      timestamp: new Date().toISOString(),
    });
  }

  res.sendStatus(200);
});

// POST /api/webhooks/twilio-recording — Twilio recording status callback
router.post('/recording', (req: Request, res: Response) => {
  const { CallSid, RecordingUrl, RecordingSid, RecordingStatus } = req.body;

  if (!CallSid || !RecordingUrl) {
    res.sendStatus(200);
    return;
  }

  if (RecordingStatus === 'completed') {
    const db = getDb();
    // Twilio recording URLs need .mp3 appended for direct download
    const fullUrl = `${RecordingUrl}.mp3`;
    db.prepare('UPDATE call_logs SET recordingUrl = ? WHERE sid = ?').run(fullUrl, CallSid);
    console.log(`Recording saved for ${CallSid}: ${fullUrl} (RecordingSid: ${RecordingSid})`);
  }

  res.sendStatus(200);
});

export default router;
