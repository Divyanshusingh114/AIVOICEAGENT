import { getDb } from './db.js';
import { startCampaign } from './campaign-runner.js';

const POLL_INTERVAL = 30_000; // 30 seconds

function checkScheduledCampaigns() {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const due = db.prepare(
      `SELECT * FROM campaigns WHERE status = 'scheduled' AND scheduledAt <= ?`
    ).all(now) as any[];

    for (const campaign of due) {
      console.log(`[Scheduler] Auto-starting campaign "${campaign.name}" (id=${campaign.id})`);
      db.prepare(
        `UPDATE campaigns SET status = 'active', scheduledAt = NULL, lastRun = datetime('now') WHERE id = ?`
      ).run(campaign.id);

      startCampaign({
        id: campaign.id,
        phoneList: JSON.parse(campaign.phoneList || '[]'),
        agentId: campaign.agentId,
      });
    }
  } catch (err) {
    console.error('[Scheduler] Error checking scheduled campaigns:', err);
  }
}

export function initScheduler() {
  console.log('[Scheduler] Started, polling every 30s');
  checkScheduledCampaigns(); // run once immediately on startup
  setInterval(checkScheduledCampaigns, POLL_INTERVAL);
}
