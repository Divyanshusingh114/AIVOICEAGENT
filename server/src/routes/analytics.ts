import { Router, type Request, type Response } from 'express';
import { getDb } from '../services/db.js';

const router = Router();

// GET /api/analytics/dashboard
router.get('/dashboard', (_req: Request, res: Response) => {
  const db = getDb();

  const totalCalls = (db.prepare('SELECT COUNT(*) as v FROM call_logs').get() as any)?.v || 0;
  const totalConnected = (db.prepare("SELECT COUNT(*) as v FROM call_logs WHERE status = 'completed'").get() as any)?.v || 0;
  const totalFailed = totalCalls - totalConnected;
  const activeCalls = (db.prepare('SELECT COUNT(*) as v FROM active_calls').get() as any)?.v || 0;

  const avgRow = db.prepare('SELECT AVG(duration) as v FROM call_logs WHERE status = ?').get('completed') as any;
  const avgDuration = Math.floor(avgRow?.v || 0);

  // Chart data: last 7 calendar days
  const chartData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();

    const calls = (db.prepare('SELECT COUNT(*) as v FROM call_logs WHERE timestamp >= ? AND timestamp < ?').get(dayStart, dayEnd) as any)?.v || 0;
    const connected = (db.prepare("SELECT COUNT(*) as v FROM call_logs WHERE status = 'completed' AND timestamp >= ? AND timestamp < ?").get(dayStart, dayEnd) as any)?.v || 0;

    chartData.push({ name: dateStr, calls, connected });
  }

  // Recent calls: last 10
  const recentCalls = db.prepare(
    `SELECT sid, phoneNumber, agentName, provider, status, duration, timestamp
     FROM call_logs ORDER BY timestamp DESC LIMIT 10`
  ).all();

  res.json({
    totalCalls,
    totalConnected,
    totalFailed,
    activeCalls,
    avgDuration,
    chartData,
    recentCalls,
  });
});

export default router;
