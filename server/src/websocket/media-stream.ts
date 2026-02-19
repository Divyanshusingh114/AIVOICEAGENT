import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../services/db.js';
import { connectToElevenLabs } from '../services/elevenlabs.js';
import { broadcastCallEvent } from './call-events.js';
import { getAgentApiKey } from '../services/agent-keys.js';
import { syncCallWithRetries } from '../services/elevenlabs-sync.js';

interface TranscriptEntry {
  role: 'user' | 'agent';
  text: string;
  timestamp: string;
}

export function handleTwilioConnection(twilioWs: WebSocket, agentId?: string, initialProvider: 'twilio' | 'plivo' = 'twilio', initialCallUuid?: string) {
  let streamSid: string | null = initialCallUuid || null;
  let callSid: string | null = initialCallUuid || null;
  let elevenLabsWs: WebSocket | null = null;
  let provider: 'twilio' | 'plivo' = initialProvider;

  // Accumulate transcript entries during the call
  const transcriptEntries: TranscriptEntry[] = [];
  let elevenLabsConversationId: string | null = null;

  async function initiateElevenLabs(elAgentId: string, apiKey: string, currentCallSid: string | null, currentStreamSid: string, currentInboundFrom: string) {
    if (currentCallSid) {
      const db = getDb();
      let activeCall = db.prepare('SELECT * FROM active_calls WHERE sid = ?').get(currentCallSid) as any;

      if (!activeCall) {
        console.log(`[Stream] New ${provider} call detected: ${currentCallSid}`);
        let resolvedAgentName = 'Unknown Agent';
        let resolvedElId = elAgentId;

        if (agentId) {
          const a = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
          if (a) {
            resolvedAgentName = a.name;
            if (a.elevenLabsId) resolvedElId = a.elevenLabsId;
          }
        }

        db.prepare(
          `INSERT INTO active_calls (sid, phoneNumber, campaignId, agentId, status, startTime, elevenLabsAgentId)
            VALUES (?, ?, ?, ?, 'connected', ?, ?)`
        ).run(currentCallSid, currentInboundFrom, null, agentId || null, Date.now(), resolvedElId);

        const logId = uuidv4();
        db.prepare(
          `INSERT INTO call_logs (id, sid, phoneNumber, campaignId, campaignName, agentId, agentName, provider, status, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'connected', ?)`
        ).run(logId, currentCallSid, currentInboundFrom, null, '', agentId || null, resolvedAgentName, provider, new Date().toISOString());

        elAgentId = resolvedElId;

        broadcastCallEvent({
          type: 'call_started',
          callSid: currentCallSid,
          phoneNumber: currentInboundFrom,
          agentId: agentId || undefined,
          status: 'connected',
          timestamp: new Date().toISOString(),
        });
      } else {
        if (activeCall.elevenLabsAgentId) {
          elAgentId = activeCall.elevenLabsAgentId;
        }
      }
    }

    console.log(`[Stream] Connecting ElevenLabs (Agent: ${elAgentId})`);
    elevenLabsWs = connectToElevenLabs(elAgentId, apiKey);
    setupElevenLabsHandlers(elevenLabsWs, twilioWs, currentStreamSid, currentCallSid, transcriptEntries, (convId) => {
      elevenLabsConversationId = convId;
    }, provider);
  }

  // If Plivo, we might already have the callUid/agentId from the URL params
  if (provider === 'plivo' && callSid) {
    console.log(`[Stream] Plivo auto-init for ${callSid} using agentId: ${agentId}`);
    const apiKey = getAgentApiKey(agentId) || process.env.ELEVENLABS_API_KEY!;
    console.log(`[Stream] API key resolved: ${apiKey ? '...' + apiKey.slice(-4) : 'NONE'}`);

    // Resolve ElevenLabs Agent ID from database if possible
    let elId = process.env.ELEVENLABS_AGENT_ID!;
    if (agentId) {
      const db = getDb();
      const agent = db.prepare('SELECT elevenLabsId FROM agents WHERE id = ?').get(agentId) as any;
      if (agent?.elevenLabsId) {
        elId = agent.elevenLabsId;
        console.log(`[Stream] Resolved ElevenLabs Agent ID from DB: ${elId}`);
      }
    }

    initiateElevenLabs(elId, apiKey, callSid, callSid, 'Unknown');
  }

  twilioWs.on('message', (data: any, isBinary: boolean) => {
    if (isBinary) {
      if (elevenLabsWs?.readyState === WebSocket.OPEN) {
        elevenLabsWs.send(JSON.stringify({
          user_audio_chunk: data.toString('base64')
        }));
      }
      return;
    }

    try {
      const msgStr = data.toString();
      if (!msgStr.trim()) return; // Ignore empty frames

      let message;
      try {
        message = JSON.parse(msgStr);
      } catch (e) {
        console.warn(`[Stream] Received non-JSON text message: ${msgStr.substring(0, 100)}...`);
        return;
      }

      switch (message.event) {
        case 'connected':
          console.log('[Stream] Handshake received');
          break;

        case 'start':
          const newStreamSid = message.start?.streamSid || message.start?.callUuid || message.callUuid || message.call_uuid || message.streamId || message.stream_id || null;
          const newCallSid = message.start?.callSid || message.start?.callUuid || message.callUuid || message.call_uuid || null;

          if (newStreamSid) streamSid = newStreamSid;
          if (newCallSid) callSid = newCallSid;

          if (elevenLabsWs) {
            console.log('[Stream] Already initiated, skipping start processing');
            break;
          }

          let rawParams = message.start?.customParameters || message.start?.extraData || message.extraData || message.extra_data || {};
          if (typeof rawParams === 'string') {
            try { rawParams = JSON.parse(rawParams); } catch { rawParams = {}; }
          }
          const customParams = rawParams;
          const inboundAgentId = customParams.agentId || agentId;
          const inboundFrom = customParams.from || 'Unknown';
          const inboundProvider = customParams.provider || provider;
          provider = inboundProvider as 'twilio' | 'plivo';

          console.log(`[Stream] Start processing - Provider: ${provider}, StreamSid: ${streamSid}, CallSid: ${callSid}`);

          const apiKey = getAgentApiKey(inboundAgentId) || process.env.ELEVENLABS_API_KEY!;
          let elId = process.env.ELEVENLABS_AGENT_ID!;

          // Try to resolve elId from agentId
          if (inboundAgentId) {
            const db = getDb();
            const agent = db.prepare('SELECT elevenLabsId FROM agents WHERE id = ?').get(inboundAgentId) as any;
            if (agent?.elevenLabsId) elId = agent.elevenLabsId;
          }

          initiateElevenLabs(elId, apiKey, callSid, streamSid!, inboundFrom);
          break;

        case 'media':
          if (elevenLabsWs?.readyState === WebSocket.OPEN) {
            elevenLabsWs.send(JSON.stringify({
              user_audio_chunk: message.media.payload
            }));
          }
          break;

        case 'stop':
          console.log(`[Stream] Stop event: ${callSid}`);
          elevenLabsWs?.close();
          saveCallData(callSid, transcriptEntries, elevenLabsConversationId, agentId);
          break;
      }
    } catch (err) {
      console.error('[Stream] Fatal error:', err);
    }
  });

  twilioWs.on('close', (code, reason) => {
    console.log(`[Stream] WebSocket closed: ${callSid}, Code: ${code}, Reason: ${reason}`);
    elevenLabsWs?.close();
    saveCallData(callSid, transcriptEntries, elevenLabsConversationId, agentId);

    // For Plivo calls, explicitly hang up to ensure proper completion and status callbacks
    if (provider === 'plivo' && callSid) {
      hangupPlivoCall(callSid);
    }
  });
}

async function hangupPlivoCall(callUuid: string) {
  try {
    const authId = process.env.PLIVO_AUTH_ID;
    const authToken = process.env.PLIVO_AUTH_TOKEN;
    if (!authId || !authToken) return;

    console.log(`[Stream] Hanging up Plivo call: ${callUuid}`);
    const response = await fetch(
      `https://api.plivo.com/v1/Account/${authId}/Call/${callUuid}/`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${authId}:${authToken}`).toString('base64'),
        },
      }
    );
    if (response.ok || response.status === 404) {
      console.log(`[Stream] Plivo call ${callUuid} hangup: ${response.status}`);
    } else {
      console.warn(`[Stream] Plivo hangup failed: ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    console.warn('[Stream] Error hanging up Plivo call:', err);
  }
}

function saveCallData(
  callSid: string | null,
  transcriptEntries: TranscriptEntry[],
  elevenLabsConversationId: string | null,
  agentId?: string
) {
  if (!callSid) return;

  const db = getDb();

  // Save transcript as JSON array if we have one and it's not already there
  if (transcriptEntries.length > 0) {
    const existing = db.prepare('SELECT transcript FROM call_logs WHERE sid = ?').get(callSid) as any;
    if (!existing?.transcript) {
      const transcriptJson = JSON.stringify(transcriptEntries);
      db.prepare('UPDATE call_logs SET transcript = ? WHERE sid = ?').run(transcriptJson, callSid);
      console.log(`Transcript saved for ${callSid}: ${transcriptEntries.length} entries`);
    }
  }

  // Save ElevenLabs conversation ID if we have one
  if (elevenLabsConversationId) {
    db.prepare('UPDATE call_logs SET elevenLabsConversationId = ? WHERE sid = ?').run(elevenLabsConversationId, callSid);
    console.log(`ElevenLabs conversation ID saved for ${callSid}: ${elevenLabsConversationId}`);

    // Sync accurate data from ElevenLabs (duration, status) with retries
    syncCallWithRetries(elevenLabsConversationId, agentId);
  }
}

function setupElevenLabsHandlers(
  elevenLabsWs: WebSocket,
  twilioWs: WebSocket,
  streamSid: string,
  callSid: string | null,
  transcriptEntries: TranscriptEntry[],
  onConversationId: (id: string) => void,
  provider: 'twilio' | 'plivo' = 'twilio'
) {
  elevenLabsWs.on('message', (data: string) => {
    const message = JSON.parse(data);

    switch (message.type) {
      case 'audio':
        if (message.audio_event?.audio_base_64) {
          if (provider === 'plivo') {
            // Plivo bidirectional stream expects JSON playAudio events
            twilioWs.send(JSON.stringify({
              event: 'playAudio',
              media: {
                contentType: 'audio/x-mulaw',
                sampleRate: 8000,
                payload: message.audio_event.audio_base_64
              }
            }));
          } else {
            // Twilio expects JSON
            twilioWs.send(JSON.stringify({
              event: 'media',
              streamSid,
              media: {
                payload: message.audio_event.audio_base_64
              }
            }));
          }
        }
        break;

      case 'user_transcript': {
        const userText = message.user_transcription_event?.user_transcript || '';
        console.log('User:', userText);

        // Accumulate transcript
        transcriptEntries.push({
          role: 'user',
          text: userText,
          timestamp: new Date().toISOString(),
        });

        if (callSid) {
          broadcastCallEvent({
            type: 'transcript',
            callSid,
            transcript: { role: 'user', text: userText },
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      case 'agent_response': {
        const agentText = message.agent_response_event?.agent_response || '';
        console.log('AI:', agentText);

        // Accumulate transcript
        transcriptEntries.push({
          role: 'agent',
          text: agentText,
          timestamp: new Date().toISOString(),
        });

        if (callSid) {
          broadcastCallEvent({
            type: 'transcript',
            callSid,
            transcript: { role: 'ai', text: agentText },
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      case 'conversation_initiation_metadata': {
        const meta = message.conversation_initiation_metadata_event;
        console.log(`ElevenLabs ready (in: ${meta.user_input_audio_format}, out: ${meta.agent_output_audio_format})`);

        // Capture and SAVE the conversation_id IMMEDIATELY
        if (meta.conversation_id && callSid) {
          const db = getDb();
          db.prepare('UPDATE call_logs SET elevenLabsConversationId = ? WHERE sid = ?').run(meta.conversation_id, callSid);
          console.log(`[Stream] Saved ElevenLabs conversation_id immediately: ${meta.conversation_id}`);
          onConversationId(meta.conversation_id);
        }
        break;
      }

      case 'interruption':
        console.log('Interruption detected, clearing audio');
        if (provider === 'plivo') {
          // Plivo uses 'clearAudio' event with streamId
          twilioWs.send(JSON.stringify({
            event: 'clearAudio',
            streamId: streamSid,
          }));
        } else {
          // Twilio uses 'clear' event with streamSid
          twilioWs.send(JSON.stringify({
            event: 'clear',
            streamSid,
          }));
        }
        break;

      case 'ping':
        if (message.ping_event?.event_id) {
          elevenLabsWs.send(JSON.stringify({
            type: 'pong',
            event_id: message.ping_event.event_id
          }));
        }
        break;
    }
  });

  elevenLabsWs.on('error', (error) => {
    console.error('ElevenLabs error:', error);
  });

  elevenLabsWs.on('close', () => {
    console.log('ElevenLabs disconnected');
  });
}
