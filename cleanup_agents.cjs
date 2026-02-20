const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve('server/data.db');
const db = new Database(dbPath);

console.log('Cleaning up misconfigured agents...');
const info = db.prepare("DELETE FROM agents WHERE name IN ('test', 'test1')").run();
console.log(`Deleted ${info.changes} agents.`);
