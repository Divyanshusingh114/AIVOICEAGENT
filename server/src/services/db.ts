import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  // 1. Create tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      elevenLabsId TEXT NOT NULL,
      voiceId TEXT NOT NULL,
      language TEXT DEFAULT 'English',
      vadSensitivity REAL DEFAULT 0.5,
      silenceTimeout INTEGER DEFAULT 1000,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      agentId TEXT NOT NULL,
      provider TEXT DEFAULT 'twilio',
      fromNumber TEXT NOT NULL,
      status TEXT DEFAULT 'stopped',
      callCount INTEGER DEFAULT 0,
      successfulCalls INTEGER DEFAULT 0,
      lastRun TEXT,
      recordingEnabled INTEGER DEFAULT 0,
      phoneList TEXT DEFAULT '[]',
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS call_logs (
      id TEXT PRIMARY KEY,
      sid TEXT UNIQUE,
      phoneNumber TEXT NOT NULL,
      campaignId TEXT,
      campaignName TEXT,
      agentId TEXT,
      agentName TEXT,
      provider TEXT DEFAULT 'twilio',
      status TEXT DEFAULT 'initiated',
      duration INTEGER DEFAULT 0,
      recordingUrl TEXT,
      transcript TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS active_calls (
      sid TEXT PRIMARY KEY,
      phoneNumber TEXT NOT NULL,
      campaignId TEXT,
      agentId TEXT NOT NULL,
      status TEXT DEFAULT 'initiated',
      startTime INTEGER NOT NULL,
      elevenLabsAgentId TEXT
    );
  `);

  // 2. Add missing columns to existing tables
  const addColumn = (table: string, column: string, type: string) => {
    try {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
      if (!columns.some(c => c.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        console.log(`[DB] Added column ${column} to ${table}`);
      }
    } catch (err: any) {
      console.error(`[DB] Error adding column ${column} to ${table}:`, err.message);
    }
  };

  addColumn('call_logs', 'elevenLabsConversationId', 'TEXT');
  addColumn('call_logs', 'provider', 'TEXT DEFAULT \'twilio\'');
  addColumn('campaigns', 'scheduledAt', 'TEXT');
  addColumn('campaigns', 'provider', 'TEXT DEFAULT \'twilio\'');
  addColumn('agents', 'apiKey', 'TEXT');

  // 3. Sanitize existing data
  try {
    db.prepare("UPDATE campaigns SET provider = 'twilio' WHERE provider IS NULL").run();
    db.prepare("UPDATE call_logs SET provider = 'twilio' WHERE provider IS NULL").run();
  } catch { }

  // 4. Clean up stale active_calls on startup (calls that were in progress when server stopped)
  try {
    const staleThreshold = Date.now() - (60 * 60 * 1000); // 1 hour ago
    const staleCalls = db.prepare('SELECT sid FROM active_calls WHERE startTime < ?').all(staleThreshold) as any[];
    if (staleCalls.length > 0) {
      // Mark corresponding call_logs as failed if still in a non-terminal state
      db.prepare(
        `UPDATE call_logs SET status = 'failed'
         WHERE sid IN (SELECT sid FROM active_calls WHERE startTime < ?)
         AND status IN ('initiated', 'connected', 'ringing')`
      ).run(staleThreshold);

      const deleted = db.prepare('DELETE FROM active_calls WHERE startTime < ?').run(staleThreshold);
      console.log(`[DB] Cleaned up ${deleted.changes} stale active_calls on startup`);
    }
  } catch (err: any) {
    console.error('[DB] Error cleaning stale calls:', err.message);
  }
}

export default getDb;
