import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
import express, { type Request, type Response } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';
import { getDb } from './services/db.js';
import { initScheduler } from './services/campaign-scheduler.js';

// Routes
import agentsRouter from './routes/agents.js';
import campaignsRouter from './routes/campaigns.js';
import callsRouter from './routes/calls.js';
import settingsRouter from './routes/settings.js';
import analyticsRouter from './routes/analytics.js';
import voiceRouter from './routes/voice.js';
import statusRouter from './routes/status.js';
import plivoStatusRouter from './routes/plivo-status.js';
import elevenlabsProxyRouter from './routes/elevenlabs-proxy.js';

// WebSocket & SSE
import { handleTwilioConnection } from './websocket/media-stream.js';
import { sseHandler } from './websocket/call-events.js';

// Validate Environment Variables
const requiredEnvVars = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'ELEVENLABS_AGENT_ID'
];

const missingVars = requiredEnvVars.filter(key => !process.env[key]);
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars.join(', '));
} else {
  console.log('✅ Environment configuration validated.');
}

const app = express();
const server = createServer(app);

// Initialize database
getDb();

// Start campaign scheduler
initScheduler();

// Production Middleware
app.use((helmet as any)({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use((compression as any)());

const limiter = (rateLimit as any)({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logger
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/agents', agentsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/calls', callsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/voice', voiceRouter);
app.use('/api/webhooks/twilio-status', statusRouter);
app.use('/api/webhooks/plivo-status', plivoStatusRouter);
app.use('/api/plivo/hangup', plivoStatusRouter);
app.use('/api/elevenlabs', elevenlabsProxyRouter);
app.get('/api/events/calls', sseHandler);

// Plivo Answer Alias
app.post('/api/plivo/answer', (req: Request, res: Response) => {
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
  const target = `/api/voice/plivo${queryString ? '?' + queryString : ''}`;
  console.log(`[Plivo Alias] Redirecting Answer: ${req.url} -> ${target}`);
  res.redirect(307, target);
});

// Production Frontend
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));

  // SPA catch-all
  app.get('*', (req: Request, res: Response, next) => {
    // Skip for API/WS paths
    if (req.path.startsWith('/api') || req.path.startsWith('/media-stream')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

const wss = new WebSocketServer({ server, path: '/media-stream' });
wss.on('connection', (ws: WebSocket, req) => {
  console.log(`[WS] New connection from ${req.socket.remoteAddress} to ${req.url}`);
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const agentId = url.searchParams.get('agentId') || undefined;
    const provider = (url.searchParams.get('provider') as 'twilio' | 'plivo') || 'twilio';
    const callUuid = url.searchParams.get('callUuid') || undefined;

    handleTwilioConnection(ws, agentId, provider, callUuid);
  } catch (err) {
    console.error('[WS] Connection error:', err);
    handleTwilioConnection(ws);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
