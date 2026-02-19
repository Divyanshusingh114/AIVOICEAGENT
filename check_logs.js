import Database from 'better-sqlite3';

const db = new Database('./server/data.db');
const logs = db.prepare('SELECT sid, phoneNumber, status, duration, recordingUrl, provider FROM call_logs ORDER BY timestamp DESC LIMIT 5').all();

console.log('RECENT CALL LOGS:', JSON.stringify(logs, null, 2));
db.close();
