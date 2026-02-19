import { getDb } from './server/dist/services/db.js';

const db = getDb();
console.log('--- DB Content ---');
const agents = db.prepare('SELECT id, name FROM agents').all();
console.log('Agents:', agents);

const logs = db.prepare('SELECT agentName, agentId, sid, status FROM call_logs ORDER BY timestamp DESC LIMIT 3').all();
console.log('Recent Call Logs:', logs);
