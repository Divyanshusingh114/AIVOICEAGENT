import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../services/db.js';
import { startCampaign, pauseCampaign, stopCampaign } from '../services/campaign-runner.js';

const router = Router();

const paramId = (req: Request): string => String(req.params.id);

// GET /api/campaigns
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY createdAt DESC').all() as any[];
  const result = campaigns.map(c => ({
    ...c,
    recordingEnabled: !!c.recordingEnabled,
    phoneList: JSON.parse(c.phoneList || '[]'),
  }));
  res.json(result);
});

// GET /api/campaigns/:id
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(paramId(req)) as any;
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  campaign.recordingEnabled = !!campaign.recordingEnabled;
  campaign.phoneList = JSON.parse(campaign.phoneList || '[]');
  res.json(campaign);
});

// POST /api/campaigns
router.post('/', (req: Request, res: Response) => {
  const db = getDb();
  const { name, agentId, provider, fromNumber, recordingEnabled, phoneList, scheduledAt } = req.body;

  if (!name || !agentId || !fromNumber) {
    res.status(400).json({ error: 'name, agentId, and fromNumber are required' });
    return;
  }

  const id = uuidv4();
  const status = scheduledAt ? 'scheduled' : 'stopped';
  db.prepare(
    `INSERT INTO campaigns (id, name, agentId, provider, fromNumber, recordingEnabled, phoneList, status, scheduledAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, agentId, provider || 'twilio', fromNumber, recordingEnabled ? 1 : 0, JSON.stringify(phoneList || []), status, scheduledAt || null);

  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as any;
  campaign.recordingEnabled = !!campaign.recordingEnabled;
  campaign.phoneList = JSON.parse(campaign.phoneList || '[]');
  res.status(201).json(campaign);
});

// PUT /api/campaigns/:id
router.put('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(paramId(req));
  if (!existing) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  const { name, agentId, provider, fromNumber, recordingEnabled, phoneList, scheduledAt } = req.body;

  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (agentId !== undefined) { updates.push('agentId = ?'); values.push(agentId); }
  if (provider !== undefined) { updates.push('provider = ?'); values.push(provider); }
  if (fromNumber !== undefined) { updates.push('fromNumber = ?'); values.push(fromNumber); }
  if (recordingEnabled !== undefined) { updates.push('recordingEnabled = ?'); values.push(recordingEnabled ? 1 : 0); }
  if (phoneList !== undefined) { updates.push('phoneList = ?'); values.push(JSON.stringify(phoneList)); }
  if (scheduledAt !== undefined) {
    updates.push('scheduledAt = ?'); values.push(scheduledAt || null);
    updates.push('status = ?'); values.push(scheduledAt ? 'scheduled' : 'stopped');
  }

  if (updates.length > 0) {
    values.push(paramId(req));
    db.prepare(`UPDATE campaigns SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(paramId(req)) as any;
  campaign.recordingEnabled = !!campaign.recordingEnabled;
  campaign.phoneList = JSON.parse(campaign.phoneList || '[]');
  res.json(campaign);
});

// DELETE /api/campaigns/:id
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(paramId(req));
  if (!existing) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  stopCampaign(paramId(req));
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(paramId(req));
  res.json({ success: true });
});

// POST /api/campaigns/:id/start
router.post('/:id/start', (req: Request, res: Response) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(paramId(req)) as any;
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  db.prepare("UPDATE campaigns SET status = ?, scheduledAt = NULL, lastRun = datetime('now') WHERE id = ?").run('active', paramId(req));
  campaign.phoneList = JSON.parse(campaign.phoneList || '[]');

  startCampaign({
    ...campaign,
    recordingEnabled: !!campaign.recordingEnabled,
    phoneList: campaign.phoneList,
  });

  res.json({ success: true, status: 'active' });
});

// POST /api/campaigns/:id/pause
router.post('/:id/pause', (req: Request, res: Response) => {
  const db = getDb();
  db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('paused', paramId(req));
  pauseCampaign(paramId(req));
  res.json({ success: true, status: 'paused' });
});

// POST /api/campaigns/:id/stop
router.post('/:id/stop', (req: Request, res: Response) => {
  const db = getDb();
  db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run('stopped', paramId(req));
  stopCampaign(paramId(req));
  res.json({ success: true, status: 'stopped' });
});

// POST /api/campaigns/:id/schedule
router.post('/:id/schedule', (req: Request, res: Response) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(paramId(req));
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  const { scheduledAt } = req.body;
  if (!scheduledAt) {
    res.status(400).json({ error: 'scheduledAt is required' });
    return;
  }

  db.prepare('UPDATE campaigns SET status = ?, scheduledAt = ? WHERE id = ?').run('scheduled', scheduledAt, paramId(req));
  res.json({ success: true, status: 'scheduled', scheduledAt });
});

// POST /api/campaigns/:id/cancel-schedule
router.post('/:id/cancel-schedule', (req: Request, res: Response) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(paramId(req));
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  db.prepare('UPDATE campaigns SET status = ?, scheduledAt = NULL WHERE id = ?').run('stopped', paramId(req));
  res.json({ success: true, status: 'stopped' });
});

export default router;
