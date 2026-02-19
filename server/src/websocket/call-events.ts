import type { Request, Response } from 'express';

interface CallEvent {
  type: 'call_started' | 'call_status' | 'call_ended' | 'transcript';
  callSid: string;
  status?: string;
  campaignId?: string;
  agentId?: string;
  phoneNumber?: string;
  transcript?: { role: 'user' | 'ai'; text: string };
  duration?: number;
  timestamp: string;
}

const clients = new Set<Response>();

export function sseHandler(req: Request, res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  res.write('data: {"type":"connected"}\n\n');

  clients.add(res);

  req.on('close', () => {
    clients.delete(res);
  });
}

export function broadcastCallEvent(event: Partial<CallEvent>) {
  const data = JSON.stringify(event);
  for (const client of clients) {
    client.write(`data: ${data}\n\n`);
  }
}
