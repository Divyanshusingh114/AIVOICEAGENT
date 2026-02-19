import { Router, type Request, type Response } from 'express';
import { getDb } from '../services/db.js';

const router = Router();

// GET /api/settings
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  res.json(settings);
});

// PUT /api/settings
router.put('/', (req: Request, res: Response) => {
  const db = getDb();
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );

  const transaction = db.transaction((entries: [string, string][]) => {
    for (const [key, value] of entries) {
      upsert.run(key, value);
    }
  });

  transaction(Object.entries(req.body));
  res.json({ success: true });
});

// POST /api/settings/test-twilio
router.post('/test-twilio', async (_req: Request, res: Response) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      res.json({ success: false, message: 'Twilio credentials not configured in server .env' });
      return;
    }
    const { default: twilio } = await import('twilio');
    const client = twilio(accountSid, authToken);
    const account = await client.api.accounts(accountSid).fetch();
    res.json({ success: true, message: `Connected to Twilio account: ${account.friendlyName}` });
  } catch (error: any) {
    res.json({ success: false, message: error.message || 'Failed to connect to Twilio' });
  }
});

// POST /api/settings/test-elevenlabs
router.post('/test-elevenlabs', async (_req: Request, res: Response) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      res.json({ success: false, message: 'ElevenLabs API key not configured in server .env' });
      return;
    }
    const response = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': apiKey }
    });
    if (response.ok) {
      const user = await response.json();
      res.json({ success: true, message: `Connected as: ${user.first_name || 'User'}` });
    } else {
      res.json({ success: false, message: `ElevenLabs API returned ${response.status}` });
    }
  } catch (error: any) {
    res.json({ success: false, message: error.message || 'Failed to connect to ElevenLabs' });
  }
});

// POST /api/settings/test-plivo
router.post('/test-plivo', async (req: Request, res: Response) => {
  try {
    const { plivoAuthId, plivoAuthToken } = req.body;

    // Use body values if provided (for testing unsaved changes) or fallback to env
    const authId = plivoAuthId || process.env.PLIVO_AUTH_ID;
    const authToken = plivoAuthToken || process.env.PLIVO_AUTH_TOKEN;

    if (!authId || !authToken) {
      res.json({ success: false, message: 'Plivo credentials not provided or configured in .env' });
      return;
    }

    const auth = Buffer.from(`${authId}:${authToken}`).toString('base64');
    const response = await fetch(`https://api.plivo.com/v1/Account/${authId}/`, {
      headers: { 'Authorization': `Basic ${auth}` }
    });

    if (response.ok) {
      const account = await response.json();
      res.json({ success: true, message: `Connected to Plivo account: ${account.name}` });
    } else {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      res.json({ success: false, message: `Plivo API returned ${response.status}: ${error.message || error.error || 'Check your credentials'}` });
    }
  } catch (error: any) {
    res.json({ success: false, message: error.message || 'Failed to connect to Plivo' });
  }
});

export default router;
