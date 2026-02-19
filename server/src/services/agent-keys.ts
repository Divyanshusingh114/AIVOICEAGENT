import { getDb } from './db.js';

/**
 * Returns the ElevenLabs API key for an agent (by internal DB id).
 * Falls back to the global ELEVENLABS_API_KEY env var if the agent has no key stored.
 */
export function getAgentApiKey(agentId: string | null | undefined): string | null {
  if (agentId) {
    const db = getDb();
    const agent = db.prepare('SELECT apiKey FROM agents WHERE id = ?').get(agentId) as any;
    if (agent?.apiKey) return agent.apiKey;
  }
  return process.env.ELEVENLABS_API_KEY || null;
}

/**
 * Returns the ElevenLabs API key for an agent looked up by its ElevenLabs agent ID.
 * Falls back to the global ELEVENLABS_API_KEY env var if no match or no key stored.
 */
export function getApiKeyByElevenLabsId(elevenLabsAgentId: string | null | undefined): string | null {
  if (elevenLabsAgentId) {
    const db = getDb();
    const agent = db.prepare('SELECT apiKey FROM agents WHERE elevenLabsId = ?').get(elevenLabsAgentId) as any;
    if (agent?.apiKey) return agent.apiKey;
  }
  return process.env.ELEVENLABS_API_KEY || null;
}

/**
 * Masks an API key for display: shows "••••" + last 4 characters.
 * Returns null if the key is falsy.
 */
export function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 4) return '••••';
  return '••••' + key.slice(-4);
}
