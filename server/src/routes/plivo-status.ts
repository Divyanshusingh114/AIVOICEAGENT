import { Router, type Request, type Response } from 'express';
import { getDb } from '../services/db.js';
import { broadcastCallEvent } from '../websocket/call-events.js';
import { syncCallFromElevenLabs } from '../services/elevenlabs-sync.js';
import fs from 'fs';

const router = Router();

// POST /api/webhooks/plivo-status
router.post('/', async (req: Request, res: Response) => {
    try {
        fs.appendFileSync('plivo_webhooks.log', `[${new Date().toISOString()}] BODY: ${JSON.stringify(req.body)}\nID: ${req.query.logId}\n---\n`);
    } catch (e) { }

    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log('[Plivo Webhook] RECEIVED REQUEST');
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log(`[Plivo Webhook] RAW BODY:`, req.body);

    // Plivo sends data in PascalCase or snake_case depending on configuration
    const b = req.body;
    const callUuid = b.CallUUID || b.call_uuid;
    const requestUuid = b.RequestUUID || b.request_uuid;
    const callStatus = (b.CallStatus || b.call_status || '').toLowerCase();

    // Prioritize second-based fields
    const durationRaw = b.BillDuration || b.bill_duration || b.DurationInSeconds || b.duration_in_seconds || b.Duration || b.duration || b.call_duration || b.recording_duration || '0';
    let recordUrl = b.RecordUrl || b.record_url || b.recording_url;

    // Plivo often wraps recording data in a JSON string called 'response'
    if (!recordUrl && b.response) {
        try {
            const resp = typeof b.response === 'string' ? JSON.parse(b.response) : b.response;
            recordUrl = resp.RecordUrl || resp.record_url || resp.recording_url;
        } catch (e) { }
    }

    // Check both query and body for logId
    const logId = (req.query.logId as string) || (b.logId as string);

    const sid = requestUuid || callUuid;
    const duration = parseInt(String(durationRaw), 10);

    const db = getDb();

    // Map Plivo status to our internal CallStatus
    let internalStatus = 'initiated';
    if (['in-progress', 'routing', 'ringing'].includes(callStatus)) internalStatus = 'ringing';
    if (callStatus === 'answered') internalStatus = 'connected';
    if (callStatus === 'completed') internalStatus = 'completed';
    if (['failed', 'rejected'].includes(callStatus)) internalStatus = 'failed';
    if (callStatus === 'busy') internalStatus = 'busy';
    if (callStatus === 'no-answer') internalStatus = 'failed';

    console.log(`[Plivo Webhook] Processing update for SID: ${sid}, LogId: ${logId}, Status: ${callStatus}, RecordUrl: ${recordUrl ? 'Present' : 'None'}`);

    // Update call_logs - use logId if available, fallback to SIDs
    if (logId) {
        if (recordUrl) {
            const res = db.prepare('UPDATE call_logs SET recordingUrl = ? WHERE id = ?').run(recordUrl, logId);
            console.log(`[Plivo Webhook] Update RecordUrl for logId ${logId}: ${res.changes} rows`);
        }
        if (callUuid || sid) {
            const res = db.prepare('UPDATE call_logs SET sid = ? WHERE id = ?').run(callUuid || sid, logId);
            // console.log(`[Plivo Webhook] Update SID for ${logId}: ${res.changes} rows`);
        }
        if (callStatus && callStatus !== '') {
            const res = db.prepare('UPDATE call_logs SET status = ?, duration = CASE WHEN ? > 0 AND elevenLabsConversationId IS NULL THEN ? ELSE duration END WHERE id = ?')
                .run(internalStatus, duration, duration, logId);
            // console.log(`[Plivo Webhook] Update Status/Duration for ${logId}: ${res.changes} rows`);
        }
    }

    // ALWAYS try to update by SID as well if we have one, just in case
    if (sid) {
        if (recordUrl) {
            const res = db.prepare('UPDATE call_logs SET recordingUrl = ? WHERE sid = ? OR sid = ?').run(recordUrl, callUuid, requestUuid);
            if (res.changes > 0) console.log(`[Plivo Webhook] Update RecordUrl for SID ${sid}: ${res.changes} rows`);
        }
        if (callStatus && callStatus !== '') {
            const res = db.prepare('UPDATE call_logs SET status = ?, duration = CASE WHEN ? > 0 AND elevenLabsConversationId IS NULL THEN ? ELSE duration END WHERE sid = ? OR sid = ?')
                .run(internalStatus, duration, duration, callUuid, requestUuid);
            // if (res.changes > 0) console.log(`[Plivo Webhook] Update Status/Duration for SID ${sid}: ${res.changes} rows`);
        }
    }

    // Update active_calls and broadcast events
    const isEnded = ['completed', 'failed', 'busy', 'no-answer', 'canceled', 'rejected'].includes(callStatus);

    if (isEnded) {
        // Get the active call info before deleting it to find campaignId
        const activeCall = db.prepare('SELECT * FROM active_calls WHERE sid = ? OR sid = ?').get(callUuid, requestUuid) as any;
        const callLog = db.prepare('SELECT elevenLabsConversationId, agentId FROM call_logs WHERE sid = ? OR sid = ?').get(callUuid, requestUuid) as any;

        db.prepare('DELETE FROM active_calls WHERE sid = ? OR sid = ?').run(callUuid, requestUuid);

        // Sync accurate data from ElevenLabs (duration, status)
        let finalDuration = duration;
        if (callLog?.elevenLabsConversationId) {
            const result = await syncCallFromElevenLabs(callLog.elevenLabsConversationId, callLog.agentId);
            if (result.success && result.duration && result.duration > 0) {
                finalDuration = result.duration;
            }
        }

        if (activeCall && activeCall.campaignId) {
            const campaignId = activeCall.campaignId;
            // Update campaign stats
            db.prepare('UPDATE campaigns SET callCount = callCount + 1 WHERE id = ?').run(campaignId);
            if (internalStatus === 'completed') {
                db.prepare('UPDATE campaigns SET successfulCalls = successfulCalls + 1 WHERE id = ?').run(campaignId);
            }

            // Import and notify runner
            import('../services/campaign-runner.js').then(m => m.onCampaignCallCompleted(campaignId));
        }

        broadcastCallEvent({
            type: 'call_ended',
            callSid: callUuid || sid,
            status: internalStatus as any,
            duration: finalDuration,
            timestamp: new Date().toISOString()
        });
    } else {
        broadcastCallEvent({
            type: 'call_status',
            callSid: callUuid || sid,
            status: internalStatus as any,
            duration: duration,
            timestamp: new Date().toISOString()
        });
    }

    res.status(200).send('OK');
});

export default router;
