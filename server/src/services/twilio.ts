import twilio from 'twilio';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import { broadcastCallEvent } from '../websocket/call-events.js';

let twilioClient: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!twilioClient) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error('Twilio credentials not configured');
    twilioClient = twilio(sid, token);
  }
  return twilioClient;
}

export async function createOutboundCall(
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

  let selectedFromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (campaignId) {
    const campaign = db.prepare('SELECT fromNumber FROM campaigns WHERE id = ?').get(campaignId) as any;
    if (campaign?.fromNumber) {
      selectedFromNumber = campaign.fromNumber;
    }
  }

  if (!selectedFromNumber) throw new Error('Twilio Caller ID (TWILIO_PHONE_NUMBER) not configured');

  console.log(`[Twilio Service] createOutboundCall: to=${to}, from=${selectedFromNumber}, campaignId=${campaignId || 'none'}`);

  const call = await client.calls.create({
    to,
    from: selectedFromNumber,
    url: `${ngrokUrl}/api/voice?agentId=${encodeURIComponent(agentId)}`,
    record: true,
    recordingStatusCallback: `${ngrokUrl}/api/webhooks/twilio-status/recording`,
    recordingStatusCallbackMethod: 'POST',
    statusCallback: `${ngrokUrl}/api/webhooks/twilio-status`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
  });

  // Record in active_calls
  db.prepare(
    `INSERT INTO active_calls (sid, phoneNumber, campaignId, agentId, status, startTime, elevenLabsAgentId)
     VALUES (?, ?, ?, ?, 'initiated', ?, ?)`
  ).run(call.sid, to, campaignId || null, agentId, Date.now(), agent.elevenLabsId);

  // Create initial call log
  const logId = uuidv4();
  let campaignName = '';
  if (campaignId) {
    const campaign = db.prepare('SELECT name FROM campaigns WHERE id = ?').get(campaignId) as any;
    campaignName = campaign?.name || '';
  }

  db.prepare(
    `INSERT INTO call_logs (id, sid, phoneNumber, campaignId, campaignName, agentId, agentName, provider, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'twilio', 'initiated')`
  ).run(logId, call.sid, to, campaignId || null, campaignName, agentId, agent.name);

  console.log(`Outbound call initiated: ${call.sid} to ${to}`);

  broadcastCallEvent({
    type: 'call_started',
    callSid: call.sid,
    campaignId: campaignId || undefined,
    agentId,
    phoneNumber: to,
    timestamp: new Date().toISOString(),
  });

  return call.sid;
}
