const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve('server/data.db');
const db = new Database(dbPath);

console.log('Scanning for agents with invalid keys (OpenAI keys)...');
const agents = db.prepare("SELECT id, name, apiKey FROM agents WHERE apiKey LIKE 'sk_%'").all();

if (agents.length > 0) {
    console.log(`Found ${agents.length} agents with invalid keys:`);
    console.table(agents);

    const info = db.prepare("DELETE FROM agents WHERE apiKey LIKE 'sk_%'").run();
    console.log(`Deleted ${info.changes} agents with invalid keys.`);
} else {
    console.log('No agents found with invalid keys.');
}

const remaining = db.prepare('SELECT id, name, elevenLabsId FROM agents').all();
console.log('--- REMAINING AGENTS ---');
console.table(remaining);
