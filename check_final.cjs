const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('server/data.db');
console.log('Opening DB at:', dbPath);

const db = new Database(dbPath);

try {
    // Try to read agents
    const agents = db.prepare('SELECT id, name, elevenLabsId FROM agents').all();
    console.log('--- AGENTS IN DB ---');
    console.table(agents);
} catch (e) {
    console.error('Failed to read agents:', e.message);
}
