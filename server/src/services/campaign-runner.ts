import { getDb } from './db.js';
import { createOutboundCall as createTwilioCall } from './twilio.js';
import { createPlivoOutboundCall as createPlivoCall } from './plivo.js';
import { broadcastCallEvent } from '../websocket/call-events.js';

const MAX_CONCURRENT = 3;
const CALL_INTERVAL_MS = 2000;

interface RunningCampaign {
  id: string;
  phoneList: string[];
  currentIndex: number;
  activeCalls: number;
  paused: boolean;
  stopped: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

const runningCampaigns = new Map<string, RunningCampaign>();

export function startCampaign(campaign: { id: string; phoneList: string[]; agentId: string }) {
  // If already running, resume
  const existing = runningCampaigns.get(campaign.id);
  if (existing) {
    existing.paused = false;
    existing.stopped = false;
    scheduleNext(campaign.id);
    return;
  }

  const runner: RunningCampaign = {
    id: campaign.id,
    phoneList: campaign.phoneList,
    currentIndex: 0,
    activeCalls: 0,
    paused: false,
    stopped: false,
    timer: null,
  };

  runningCampaigns.set(campaign.id, runner);
  scheduleNext(campaign.id);
}

export function pauseCampaign(campaignId: string) {
  const runner = runningCampaigns.get(campaignId);
  if (runner) {
    runner.paused = true;
    if (runner.timer) {
      clearTimeout(runner.timer);
      runner.timer = null;
    }
  }
}

export function stopCampaign(campaignId: string) {
  const runner = runningCampaigns.get(campaignId);
  if (runner) {
    runner.stopped = true;
    if (runner.timer) {
      clearTimeout(runner.timer);
      runner.timer = null;
    }
    runningCampaigns.delete(campaignId);
  }
}

function scheduleNext(campaignId: string) {
  const runner = runningCampaigns.get(campaignId);
  if (!runner || runner.paused || runner.stopped) return;

  if (runner.currentIndex >= runner.phoneList.length) {
    // Campaign complete
    const db = getDb();
    db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('stopped', campaignId);
    runningCampaigns.delete(campaignId);

    broadcastCallEvent({
      type: 'call_ended',
      callSid: '',
      campaignId,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (runner.activeCalls >= MAX_CONCURRENT) {
    // Wait and retry
    runner.timer = setTimeout(() => scheduleNext(campaignId), CALL_INTERVAL_MS);
    return;
  }

  // Make the next call
  const phone = runner.phoneList[runner.currentIndex]!;
  runner.currentIndex++;
  runner.activeCalls++;

  const db = getDb();
  const campaignData = db.prepare('SELECT agentId, provider FROM campaigns WHERE id = ?').get(campaignId) as any;
  if (!campaignData) {
    runningCampaigns.delete(campaignId);
    return;
  }

  const provider = (campaignData.provider || 'twilio').toLowerCase().trim();
  const callPromise = provider === 'plivo'
    ? createPlivoCall(phone, campaignData.agentId, campaignId)
    : createTwilioCall(phone, campaignData.agentId, campaignId);

  console.log(`[Campaign Runner] Routing call to ${phone} via ${provider}`);

  callPromise
    .then((sid) => {
      console.log(`[Campaign Runner] ${provider} call success: ${sid}`);
    })
    .catch((err) => {
      console.error(`Campaign ${campaignId} call to ${phone} failed:`, err.message);
      runner.activeCalls--;

      // Update campaign stats for failed call
      db.prepare('UPDATE campaigns SET callCount = callCount + 1 WHERE id = ?').run(campaignId);
    })
    .finally(() => {
      // Schedule the next call
      runner.timer = setTimeout(() => scheduleNext(campaignId), CALL_INTERVAL_MS);
    });
}

// Called when a campaign call completes (from status webhook)
export function onCampaignCallCompleted(campaignId: string) {
  const runner = runningCampaigns.get(campaignId);
  if (runner) {
    runner.activeCalls = Math.max(0, runner.activeCalls - 1);
  }
}
