const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('server/data.db');
console.log('Opening DB at:', dbPath);

const db = new Database(dbPath);

// Force Checkpoint to ensure we see latest data
try {
    db.pragma('wal_checkpoint(RESTART)');
    console.log('WAL Checkpointed.');
} catch (e) {
    console.log('Checkpoint failed (maybe locked):', e.message);
}

const agents = db.prepare('SELECT id, name, elevenLabsId FROM agents').all();
console.log('--- AGENTS IN DB ---');
console.table(agents);
