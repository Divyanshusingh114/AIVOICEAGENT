import plivo from 'plivo';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import { broadcastCallEvent } from '../websocket/call-events.js';

let plivoClient: plivo.Client | null = null;

function getClient() {
    if (!plivoClient) {
        const authId = process.env.PLIVO_AUTH_ID;
        const authToken = process.env.PLIVO_AUTH_TOKEN;
        if (!authId || !authToken) throw new Error('Plivo credentials not configured');
        plivoClient = new plivo.Client(authId, authToken);
    }
    return plivoClient;
}

export async function createPlivoOutboundCall(
    to: string,
    agentId: string,
    campaignId?: string
): Promise<string> {
    const client = getClient();
    const ngrokUrl = process.env.NGROK_URL || process.env.PUBLIC_URL;
    if (!ngrokUrl) throw new Error('NGROK_URL or PUBLIC_URL not configured');

    const db = getDb();
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    let selectedFromNumber = process.env.PLIVO_PHONE_NUMBER;

    if (campaignId) {
        const campaign = db.prepare('SELECT fromNumber FROM campaigns WHERE id = ?').get(campaignId) as any;
        if (campaign?.fromNumber) {
            selectedFromNumber = campaign.fromNumber;
        }
    }

    if (!selectedFromNumber) throw new Error('Plivo Caller ID (fromNumber) not configured');

    console.log(`[Plivo Service] createPlivoOutboundCall: to=${to}, from=${selectedFromNumber}, campaignId=${campaignId || 'none'}`);

    const logId = uuidv4();
    const statusUrl = `${ngrokUrl}/api/webhooks/plivo-status?logId=${logId}`;
    console.log(`[Plivo Service] Setting statusCallbackUrl: ${statusUrl}`);

    const response = await client.calls.create(
        selectedFromNumber,
        to,
        `${ngrokUrl}/api/voice/plivo?agentId=${encodeURIComponent(agentId)}&logId=${logId}`,
        {
            method: 'POST',
            statusCallbackUrl: statusUrl,
            status_callback_url: statusUrl,
            statusCallbackMethod: 'POST',
            status_callback_method: 'POST',
            statusCallbackEvents: 'initiated,ringing,answered,completed,failed',
            status_callback_events: 'initiated,ringing,answered,completed,failed',
            hangupUrl: statusUrl,
            hangup_url: statusUrl,
            recordingCallbackUrl: statusUrl,
            recording_callback_url: statusUrl,
            recordingCallbackMethod: 'POST',
            recording_callback_method: 'POST',
            record: true,
            recordFileFormat: 'mp3',
            record_file_format: 'mp3',
        }
    );

    const callRequestUuid = String(response.requestUuid);

    // Record in active_calls
    db.prepare(
        `INSERT INTO active_calls (sid, phoneNumber, campaignId, agentId, status, startTime, elevenLabsAgentId)
     VALUES (?, ?, ?, ?, 'initiated', ?, ?)`
    ).run(callRequestUuid, to, campaignId || null, agentId, Date.now(), agent.elevenLabsId);

    // Create initial call log
    let campaignName = '';
    if (campaignId) {
        const campaign = db.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId) as any;
        campaignName = campaign?.name || '';
    }

    db.prepare(
        `INSERT INTO call_logs (id, sid, phoneNumber, campaignId, campaignName, agentId, agentName, provider, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'plivo', 'initiated')`
    ).run(logId, callRequestUuid, to, campaignId || null, campaignName, agentId, agent.name);

    console.log(`Plivo outbound call initiated: ${callRequestUuid} to ${to}`);

    broadcastCallEvent({
        type: 'call_started',
        callSid: callRequestUuid,
        campaignId: campaignId || undefined,
        agentId,
        phoneNumber: to,
        timestamp: new Date().toISOString(),
    });

    return callRequestUuid;
}
