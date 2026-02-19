import Database from 'better-sqlite3';

const db = new Database('./server/data.db');
const agents = db.prepare('SELECT id, name FROM agents').all();
const campaigns = db.prepare('SELECT id, name, provider, fromNumber FROM campaigns').all();

console.log('AGENTS:', JSON.stringify(agents, null, 2));
console.log('CAMPAIGNS:', JSON.stringify(campaigns, null, 2));
db.close();
