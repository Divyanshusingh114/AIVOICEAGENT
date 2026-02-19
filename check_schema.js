import Database from 'better-sqlite3';

const db = new Database('./server/data.db');

console.log('--- CAMPAIGNS SCHEMA ---');
const info = db.pragma('table_info(campaigns)');
console.log(JSON.stringify(info, null, 2));

console.log('--- CAMPAIGN DATA (demo 2) ---');
const campaign = db.prepare("SELECT * FROM campaigns WHERE name = 'demo 2'").get();
console.log(JSON.stringify(campaign, null, 2));

db.close();
