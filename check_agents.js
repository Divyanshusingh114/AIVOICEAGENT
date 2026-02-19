import { getDb } from './server/dist/services/db.js';

const db = getDb();
const agents = db.prepare('SELECT id, name, elevenLabsId, apiKey FROM agents').all();

console.log('--- Registered Agents ---');
agents.forEach(a => {
    const hasKey = !!a.apiKey;
    const keyPreview = hasKey ? a.apiKey.substring(0, 4) + '...' : 'Global Default';
    console.log(`Name: ${a.name}, ID: ${a.id}, EL_ID: ${a.elevenLabsId}, API_KEY: ${keyPreview}`);
});

console.log('\n--- Active Calls (Recent) ---');
const calls = db.prepare('SELECT sid, status, elevenLabsConversationId, agentId FROM call_logs ORDER BY timestamp DESC LIMIT 5').all();
console.table(calls);
