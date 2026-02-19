import WebSocket from 'ws';

export function connectToElevenLabs(agentId: string, apiKey: string): WebSocket {
  const url = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`;

  const ws = new WebSocket(url, {
    headers: {
      'xi-api-key': apiKey
    }
  });

  ws.on('open', () => {
    console.log('Connected to ElevenLabs');
    ws.send(JSON.stringify({
      type: 'conversation_initiation_client_data'
    }));
  });

  ws.on('error', (error) => {
    console.error('ElevenLabs WebSocket error:', error);
  });

  return ws;
}
