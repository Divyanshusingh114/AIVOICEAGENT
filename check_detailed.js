import { getDb } from './server/dist/services/db.js';

const db = getDb();
// Check Agents
const agents = db.prepare('SELECT id, name, elevenLabsId, CASE WHEN apiKey IS NOT NULL AND apiKey != "" THEN "SET" ELSE "MISSING" END as hasKey FROM agents').all();
console.log('--- ALL AGENTS ---');
console.table(agents);

// Check Calls for missing agentId
const calls = db.prepare(`
  SELECT 
    phoneNumber, 
    status, 
    elevenLabsConversationId as el_conv_id, 
    agentId 
  FROM call_logs 
  ORDER BY timestamp DESC 
  LIMIT 5
`).all();
console.log('\n--- RECENT CALLS ---');
console.table(calls);
