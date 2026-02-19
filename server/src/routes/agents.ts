import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../services/db.js';
import { maskApiKey } from '../services/agent-keys.js';

const router = Router();

const paramId = (req: Request): string => String(req.params.id);

/** Mask the apiKey field on an agent row before sending to client */
function sanitizeAgent(agent: any) {
  if (!agent) return agent;
  return { ...agent, apiKey: maskApiKey(agent.apiKey) };
}

// Validate that an ElevenLabs agent ID actually exists
async function validateElevenLabsAgent(agentId: string, apiKey?: string | null): Promise<{ valid: boolean; error?: string }> {
  const key = apiKey || process.env.ELEVENLABS_API_KEY;
  if (!key) return { valid: true }; // Skip validation if no API key configured

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { 'xi-api-key': key } }
    );
    if (response.status === 404) {
      return { valid: false, error: `ElevenLabs agent "${agentId}" not found. Please check the Agent ID on your ElevenLabs dashboard.` };
    }
    if (!response.ok) {
      const text = await response.text();
      return { valid: false, error: `ElevenLabs validation failed (${response.status}): ${text.substring(0, 100)}` };
    }
    return { valid: true };
  } catch (err: any) {
    // Network error — don't block agent creation
    console.warn('[Agents] ElevenLabs validation failed (network):', err.message);
    return { valid: true };
  }
}

// GET /api/agents
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const agents = db.prepare('SELECT * FROM agents ORDER BY createdAt DESC').all() as any[];
  res.json(agents.map(sanitizeAgent));
});

// GET /api/agents/:id
router.get('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(paramId(req));
  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }
  res.json(sanitizeAgent(agent));
});

// POST /api/agents
router.post('/', async (req: Request, res: Response) => {
  const db = getDb();
  const { name, elevenLabsId, voiceId, language, vadSensitivity, silenceTimeout, apiKey } = req.body;

  if (!name || !elevenLabsId) {
    res.status(400).json({ error: 'name and elevenLabsId are required' });
    return;
  }

  // Validate ElevenLabs agent exists before saving (use agent-specific key if provided)
  const validation = await validateElevenLabsAgent(elevenLabsId, apiKey);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const id = uuidv4();
  db.prepare(
    `INSERT INTO agents (id, name, elevenLabsId, voiceId, language, vadSensitivity, silenceTimeout, apiKey)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, elevenLabsId, voiceId || '', language || 'English', vadSensitivity ?? 0.5, silenceTimeout ?? 1000, apiKey || null);

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  res.status(201).json(sanitizeAgent(agent));
});

// PUT /api/agents/:id
router.put('/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM agents WHERE id = ?').get(paramId(req)) as any;
  if (!existing) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  const { name, elevenLabsId, voiceId, language, vadSensitivity, silenceTimeout, apiKey } = req.body;

  // Determine the effective API key for validation: new value > existing stored > env
  const effectiveApiKey = apiKey !== undefined ? (apiKey || null) : existing.apiKey;

  // Validate ElevenLabs agent if the ID is being changed
  if (elevenLabsId && elevenLabsId !== existing.elevenLabsId) {
    const validation = await validateElevenLabsAgent(elevenLabsId, effectiveApiKey);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }
  }

  // Build update — only update apiKey if it was explicitly provided in the request body
  if (apiKey !== undefined) {
    db.prepare(
      `UPDATE agents SET
        name = COALESCE(?, name),
        elevenLabsId = COALESCE(?, elevenLabsId),
        voiceId = COALESCE(?, voiceId),
        language = COALESCE(?, language),
        vadSensitivity = COALESCE(?, vadSensitivity),
        silenceTimeout = COALESCE(?, silenceTimeout),
        apiKey = ?
       WHERE id = ?`
    ).run(name, elevenLabsId, voiceId, language, vadSensitivity, silenceTimeout, apiKey || null, paramId(req));
  } else {
    db.prepare(
      `UPDATE agents SET
        name = COALESCE(?, name),
        elevenLabsId = COALESCE(?, elevenLabsId),
        voiceId = COALESCE(?, voiceId),
        language = COALESCE(?, language),
        vadSensitivity = COALESCE(?, vadSensitivity),
        silenceTimeout = COALESCE(?, silenceTimeout)
       WHERE id = ?`
    ).run(name, elevenLabsId, voiceId, language, vadSensitivity, silenceTimeout, paramId(req));
  }

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(paramId(req));
  res.json(sanitizeAgent(agent));
});

// DELETE /api/agents/:id
router.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM agents WHERE id = ?').get(paramId(req));
  if (!existing) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  db.prepare('DELETE FROM agents WHERE id = ?').run(paramId(req));
  res.json({ success: true });
});

export default router;
