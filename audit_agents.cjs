const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve('server/data.db');
const db = new Database(dbPath);

const agents = db.prepare('SELECT name, elevenLabsId, substr(apiKey, 1, 5) as keyPrefix FROM agents').all();
console.table(agents);
