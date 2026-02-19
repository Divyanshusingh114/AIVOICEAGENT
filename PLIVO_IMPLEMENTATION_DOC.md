# Plivo + ElevenLabs AI Voice Agent — Implementation Document

## System Architecture

```
                                    OUTBOUND CALL FLOW
                                    ==================

  Dashboard UI          Express Server              Plivo API            User Phone
  (React/Vite)          (Port 3000)                 (Cloud)
  ─────────────         ──────────────              ─────────            ──────────
       │                      │                         │                     │
       │  POST /api/calls/    │                         │                     │
       │  outbound            │                         │                     │
       │  {to, agentId,       │                         │                     │
       │   provider:"plivo"}  │                         │                     │
       ├─────────────────────>│                         │                     │
       │                      │  client.calls.create()  │                     │
       │                      │  from: PLIVO_PHONE_NUM  │                     │
       │                      │  to: user number        │                     │
       │                      │  answer_url: /api/      │                     │
       │                      │    voice/plivo           │                     │
       │                      ├────────────────────────>│                     │
       │                      │                         │  Ring ring...       │
       │                      │                         ├────────────────────>│
       │                      │                         │                     │
       │                      │                         │  User picks up      │
       │                      │                         │<────────────────────│
       │                      │                         │                     │
       │                      │  POST /api/voice/plivo  │                     │
       │                      │  (Plivo hits answer_url)│                     │
       │                      │<────────────────────────│                     │
       │                      │                         │                     │
       │                      │  Returns Plivo XML:     │                     │
       │                      │  <Response>             │                     │
       │                      │    <Stream              │                     │
       │                      │      bidirectional      │                     │
       │                      │      keepCallAlive      │                     │
       │                      │      contentType>       │                     │
       │                      │      wss://ngrok/       │                     │
       │                      │      media-stream       │                     │
       │                      │    </Stream>            │                     │
       │                      │  </Response>            │                     │
       │                      ├────────────────────────>│                     │
       │                      │                         │                     │


                          REAL-TIME AUDIO STREAMING
                          =========================

  Plivo Cloud         WebSocket Server         ElevenLabs           SQLite DB
  (Audio Stream)      (/media-stream)          Conversational AI    (data.db)
  ──────────────      ────────────────         ─────────────────    ──────────
       │                      │                      │                   │
       │  WSS Connect         │                      │                   │
       │  wss://ngrok/        │                      │                   │
       │  media-stream?       │                      │                   │
       │  agentId=xxx         │                      │                   │
       ├─────────────────────>│                      │                   │
       │                      │                      │                   │
       │  {event:"start",     │                      │                   │
       │   streamId, callSid, │                      │                   │
       │   extraData}         │                      │                   │
       ├─────────────────────>│                      │                   │
       │                      │  Parse extraData     │                   │
       │                      │  (JSON string)       │                   │
       │                      │  Detect provider     │                   │
       │                      │                      │                   │
       │                      │  WSS Connect         │                   │
       │                      │  ElevenLabs agent    │                   │
       │                      ├─────────────────────>│                   │
       │                      │                      │                   │
       │                      │  INSERT active_calls │                   │
       │                      │  INSERT call_logs    │                   │
       │                      ├──────────────────────────────────────────>│
       │                      │                      │                   │
       │  {event:"media",     │                      │                   │
       │   media.payload:     │                      │                   │
       │   base64 mulaw}      │                      │                   │
       ├─────────────────────>│                      │                   │
       │                      │  {user_audio_chunk:  │                   │
       │                      │   base64}            │                   │
       │                      ├─────────────────────>│                   │
       │                      │                      │                   │
       │                      │  {type:"audio",      │                   │
       │                      │   audio_event:       │                   │
       │                      │   {audio_base_64}}   │                   │
       │                      │<─────────────────────│                   │
       │                      │                      │                   │
       │  {event:"playAudio", │                      │                   │
       │   media:{            │                      │                   │
       │     contentType:     │                      │                   │
       │     "audio/x-mulaw", │                      │                   │
       │     sampleRate:8000, │                      │                   │
       │     payload:base64}} │                      │                   │
       │<─────────────────────│                      │                   │
       │                      │                      │                   │
       │  Audio plays to      │                      │                   │
       │  user's phone        │                      │                   │
       │                      │                      │                   │
```

---

## Files Modified

| File | Purpose |
|------|---------|
| `server/src/routes/voice.ts` | Answer URL — returns Plivo XML with `<Stream>` element |
| `server/src/websocket/media-stream.ts` | WebSocket handler — bridges Plivo audio to ElevenLabs AI |
| `server/src/services/plivo.ts` | Outbound call initiation via Plivo SDK (unchanged) |
| `server/src/routes/plivo-status.ts` | Status callback webhook (unchanged) |

---

## Bug Fix #1: Missing `keepCallAlive="true"`

### File: `server/src/routes/voice.ts:44`

### Root Cause

When Plivo receives the answer URL response, it executes each XML element sequentially. The `<Stream>` element opens a WebSocket connection, but once Plivo finishes processing all XML elements, it checks if the call should continue. Without `keepCallAlive="true"`, Plivo sees no further instructions after `<Stream>` and terminates the call immediately — typically within 1-2 seconds of the user picking up.

### Plivo's XML Execution Model

```
Plivo receives XML Response
    │
    ├── Execute <Stream> → Opens WebSocket connection
    │
    ├── Any more XML elements? → NO
    │
    ├── keepCallAlive="true"?
    │       │
    │       ├── YES → Keep call active, stream audio indefinitely
    │       │
    │       └── NO → Call complete, send BYE/hangup  ← THIS WAS HAPPENING
    │
    └── Call ends
```

### Before (Broken)

```xml
<Response>
    <Stream bidirectional="true" audioEncoding="mulaw"
           extraData='{"agentId":"xxx","from":"Unknown","provider":"plivo"}'>
        wss://ngrok-url/media-stream?agentId=xxx
    </Stream>
</Response>
```

Plivo opens the WebSocket, then immediately hangs up because the `<Stream>` is the last element and there's no instruction to keep the call alive.

### After (Fixed)

```xml
<Response>
    <Stream bidirectional="true" keepCallAlive="true"
           contentType="audio/x-mulaw;rate=8000"
           extraData='{"agentId":"xxx","from":"Unknown","provider":"plivo"}'>
        wss://ngrok-url/media-stream?agentId=xxx
    </Stream>
</Response>
```

`keepCallAlive="true"` tells Plivo: "Even though there are no more XML elements after this `<Stream>`, keep the call active as long as the WebSocket connection is open."

### Impact

**This was the #1 cause of calls disconnecting on pickup.** Every single Plivo call would connect, ring, the user would answer, and within 1-2 seconds the call would drop.

---

## Bug Fix #2: Wrong Audio Encoding Attribute

### File: `server/src/routes/voice.ts:44`

### Root Cause

The `<Stream>` element used `audioEncoding="mulaw"` which is not a valid Plivo attribute. Plivo's Stream element uses `contentType` to specify audio format. Since Plivo didn't recognize the attribute, it was silently ignored, and Plivo would use its default audio encoding — which may not match what ElevenLabs expects.

### Plivo `<Stream>` Supported Attributes

| Attribute | Valid Values | Purpose |
|-----------|-------------|---------|
| `bidirectional` | `true` / `false` | Enable two-way audio |
| `keepCallAlive` | `true` / `false` | Keep call alive after stream ends |
| `contentType` | `audio/x-mulaw;rate=8000`, `audio/x-l16;rate=8000`, `audio/x-l16;rate=16000` | Audio codec and sample rate |
| `extraData` | JSON string | Custom metadata passed to WebSocket |
| `streamTimeout` | seconds | Max stream duration |
| `statusCallbackUrl` | URL | Stream lifecycle events |
| ~~`audioEncoding`~~ | ~~N/A~~ | **NOT A VALID PLIVO ATTRIBUTE** |

### Before (Broken)

```xml
<Stream bidirectional="true" audioEncoding="mulaw" ...>
```

Plivo ignores `audioEncoding` — it's not part of the Plivo XML spec. Audio format is undefined/default.

### After (Fixed)

```xml
<Stream bidirectional="true" contentType="audio/x-mulaw;rate=8000" ...>
```

Explicitly sets mu-law 8kHz encoding. This is the native telephony codec — no transcoding overhead, lowest latency, and matches what ElevenLabs expects.

### Why mu-law 8kHz?

- Native PSTN codec — zero transcoding latency
- 50% smaller payload than Linear PCM 16-bit
- ElevenLabs Conversational AI supports mu-law natively
- Plivo doesn't need to convert, reducing processing time

---

## Bug Fix #3: Wrong Audio Send Format for Plivo

### File: `server/src/websocket/media-stream.ts:193-202`

### Root Cause

When ElevenLabs returns AI-generated audio, the server needs to send it back to the caller through the Plivo WebSocket. The original code sent raw binary buffers, but Plivo's bidirectional stream protocol requires JSON messages with a specific `playAudio` event structure.

### Plivo vs Twilio WebSocket Protocol Comparison

```
                    TWILIO                              PLIVO
                    ──────                              ─────
Sending audio       JSON event                          JSON event
back to caller:     {                                   {
                      event: "media",                     event: "playAudio",
                      streamSid: "...",                   media: {
                      media: {                              contentType: "audio/x-mulaw",
                        payload: "<base64>"                 sampleRate: 8000,
                      }                                     payload: "<base64>"
                    }                                     }
                                                        }

Clearing audio      {event: "clear",                    {event: "clearAudio",
(barge-in):          streamSid: "..."}                   streamId: "..."}

Audio format        base64 string in JSON               base64 string in JSON
in payload:         (NOT raw binary)                     (NOT raw binary)
```

### Before (Broken)

```typescript
if (provider === 'plivo') {
    // Plivo expects raw binary  ← WRONG ASSUMPTION
    twilioWs.send(Buffer.from(message.audio_event.audio_base_64, 'base64'));
}
```

This sends raw binary bytes over the WebSocket. Plivo's bidirectional stream does NOT accept raw binary — it expects structured JSON messages. The audio would be silently dropped, resulting in:
- Call stays connected (if keepCallAlive was set)
- User hears nothing — complete silence from the AI agent
- AI agent can still hear the user (inbound audio works differently)

### After (Fixed)

```typescript
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
}
```

Sends a properly structured JSON `playAudio` event. Plivo receives the event, decodes the base64 audio, and plays it to the caller's phone.

### Data Flow

```
ElevenLabs AI generates speech
    │
    ▼
{type: "audio", audio_event: {audio_base_64: "UklGRi..."}}
    │
    ▼
Server receives ElevenLabs message
    │
    ├── Provider === "plivo"?
    │       │
    │       ▼
    │   JSON.stringify({
    │       event: "playAudio",
    │       media: {
    │           contentType: "audio/x-mulaw",
    │           sampleRate: 8000,
    │           payload: "UklGRi..."       ← base64 stays as string
    │       }
    │   })
    │       │
    │       ▼
    │   twilioWs.send(jsonString)          ← send as text frame
    │
    └── Provider === "twilio"?
            │
            ▼
        JSON.stringify({
            event: "media",
            streamSid: "MZ...",
            media: { payload: "UklGRi..." }
        })
```

---

## Bug Fix #4: Wrong Clear/Interrupt Event for Plivo

### File: `server/src/websocket/media-stream.ts:272-286`

### Root Cause

When the user starts speaking while the AI is still talking (barge-in/interruption), ElevenLabs sends an `interruption` event. The server must tell the telephony provider to immediately stop playing the current audio. The original code used Twilio's `clear` event for both providers, but Plivo uses a different event name and structure.

### Before (Broken)

```typescript
case 'interruption':
    console.log('Interruption detected, clearing audio');
    twilioWs.send(JSON.stringify({
        event: 'clear',        // ← Twilio event name, Plivo doesn't recognize this
        streamSid,             // ← Twilio field name, Plivo uses streamId
    }));
    break;
```

When a Plivo call received an interruption, the server sent `{event: "clear", streamSid: "..."}`. Plivo ignores this unrecognized event. Result: the AI agent's audio continues playing even when the user tries to interrupt, creating an overlapping conversation experience.

### After (Fixed)

```typescript
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
```

### Barge-in Flow

```
User starts speaking while AI is talking
    │
    ▼
Plivo sends user audio chunks → Server → ElevenLabs
    │
    ▼
ElevenLabs detects interruption
    │
    ▼
ElevenLabs sends: {type: "interruption"}
    │
    ▼
Server receives interruption event
    │
    ├── Provider === "plivo"
    │       │
    │       ▼
    │   Send: {event: "clearAudio", streamId: "MZ..."}
    │       │
    │       ▼
    │   Plivo immediately stops playing buffered audio
    │   User can now speak without overlap
    │
    └── Provider === "twilio"
            │
            ▼
        Send: {event: "clear", streamSid: "MZ..."}
```

---

## Bug Fix #5: extraData JSON String Not Parsed

### File: `server/src/websocket/media-stream.ts:49-54`

### Root Cause

When the `<Stream>` XML includes an `extraData` attribute, Plivo passes it to the WebSocket `start` event as a **JSON string**, not a parsed object. The original code assumed it would arrive as an object and tried to read properties directly from it, resulting in `undefined` values for `agentId`, `from`, and `provider`.

### Plivo's extraData Lifecycle

```
Step 1: Server sets extraData in XML
─────────────────────────────────────
<Stream extraData='{"agentId":"abc","from":"+1234","provider":"plivo"}'>

Step 2: Plivo stores it and sends via WebSocket start event
───────────────────────────────────────────────────────────
{
    "event": "start",
    "start": {
        "streamId": "MZ18ad3ab5a668...",
        "callSid": "call-uuid-here",
        "extraData": "{\"agentId\":\"abc\",\"from\":\"+1234\",\"provider\":\"plivo\"}"
                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                      This is a STRING, not an object!
    }
}

Step 3: Server must JSON.parse() the string
───────────────────────────────────────────
typeof extraData === "string"  →  JSON.parse(extraData)  →  {agentId, from, provider}
```

### Before (Broken)

```typescript
const customParams = message.start?.customParameters
    || message.start?.extraData
    || message.extraData
    || message.extra_data
    || {};
const inboundAgentId = customParams.agentId;    // undefined — string has no .agentId
const inboundFrom = customParams.from || 'Unknown';
provider = customParams.provider || 'twilio';    // Falls back to 'twilio' — WRONG
```

When `customParams` is the string `'{"agentId":"abc",...}'`, accessing `.agentId` returns `undefined`. The provider defaults to `'twilio'`, causing all subsequent Plivo-specific logic to be skipped.

### After (Fixed)

```typescript
let rawParams = message.start?.customParameters
    || message.start?.extraData
    || message.extraData
    || message.extra_data
    || {};
// Plivo sends extraData as a JSON string — parse it if needed
if (typeof rawParams === 'string') {
    try { rawParams = JSON.parse(rawParams); } catch { rawParams = {}; }
}
const customParams = rawParams;
const inboundAgentId = customParams.agentId;     // "abc" — correctly parsed
const inboundFrom = customParams.from || 'Unknown';
provider = customParams.provider || 'twilio';     // "plivo" — correctly detected
```

### Cascade Effect of This Bug

Without proper provider detection, every downstream Plivo-specific behavior fails:

```
extraData not parsed
    │
    ├── provider = "twilio" (wrong default)
    │       │
    │       ├── Bug #3 path taken: Audio sent as Twilio JSON format
    │       │   → Plivo doesn't understand {event:"media", streamSid:...}
    │       │   → User hears silence
    │       │
    │       ├── Bug #4 path taken: Interruption sent as Twilio format
    │       │   → Plivo doesn't understand {event:"clear"}
    │       │   → Barge-in doesn't work
    │       │
    │       └── agentId = undefined
    │           → Falls back to default ELEVENLABS_AGENT_ID
    │           → Wrong AI agent may respond
    │
    └── With fix: provider = "plivo" (correct)
            │
            ├── Plivo playAudio format used → User hears AI
            ├── Plivo clearAudio format used → Barge-in works
            └── agentId correctly resolved → Right AI agent responds
```

---

## XML Attribute: extraData Escaping

### File: `server/src/routes/voice.ts:39-40`

### Additional Safety Fix

The `extraData` JSON is embedded inside an XML attribute using single quotes. If the JSON itself contains characters that are special in XML (`&`, `'`, `"`), the XML would be malformed and Plivo would reject it.

```typescript
// Escape extraData for safe XML embedding
const escapedExtraData = extraData
    .replace(/&/g, '&amp;')    // & → &amp;
    .replace(/'/g, '&apos;')   // ' → &apos;
    .replace(/"/g, '&quot;');   // " → &quot;
```

### Example

```
Raw JSON:    {"agentId":"abc","from":"+1234567890","provider":"plivo"}
                      ^     ^      ^              ^          ^     ^
                      These double quotes would break XML if not escaped

Escaped:     {&quot;agentId&quot;:&quot;abc&quot;, ...}

In XML:      extraData='{&quot;agentId&quot;:&quot;abc&quot;, ...}'
                        Plivo decodes XML entities before passing to WebSocket
```

---

## Complete Call Lifecycle

```
1. INITIATION (services/plivo.ts)
   ├── Dashboard sends POST /api/calls/outbound {to, agentId, provider:"plivo"}
   ├── Server calls Plivo API: client.calls.create(from, to, answer_url)
   ├── INSERT INTO active_calls (status: 'initiated')
   ├── INSERT INTO call_logs (provider: 'plivo', status: 'initiated')
   └── Broadcast SSE: call_started

2. ANSWER (routes/voice.ts)
   ├── User picks up phone
   ├── Plivo hits POST /api/voice/plivo?agentId=xxx
   ├── Server returns XML with <Stream bidirectional keepCallAlive contentType>
   └── Plivo opens WebSocket to wss://ngrok/media-stream

3. STREAMING (websocket/media-stream.ts)
   ├── WebSocket 'start' event received
   │   ├── Parse extraData JSON string → {agentId, from, provider:"plivo"}
   │   ├── Look up agent's ElevenLabs ID from SQLite
   │   ├── Connect to ElevenLabs Conversational AI WebSocket
   │   └── INSERT/UPDATE active_calls, call_logs
   │
   ├── WebSocket 'media' events (continuous)
   │   ├── Plivo sends: {event:"media", media:{payload: base64_mulaw}}
   │   ├── Server forwards: {user_audio_chunk: base64} → ElevenLabs
   │   ├── ElevenLabs processes speech and generates AI response
   │   ├── ElevenLabs sends: {type:"audio", audio_event:{audio_base_64: base64}}
   │   └── Server sends to Plivo: {event:"playAudio", media:{contentType, sampleRate, payload}}
   │
   ├── Interruption handling
   │   ├── ElevenLabs sends: {type:"interruption"}
   │   └── Server sends to Plivo: {event:"clearAudio", streamId: "..."}
   │
   └── Transcript accumulation
       ├── ElevenLabs: {type:"user_transcript"} → push to transcriptEntries[]
       ├── ElevenLabs: {type:"agent_response"} → push to transcriptEntries[]
       └── Broadcast SSE: transcript event (real-time UI updates)

4. HANGUP (routes/plivo-status.ts + websocket/media-stream.ts)
   ├── WebSocket 'stop' event → close ElevenLabs connection
   ├── Save transcript JSON to call_logs
   ├── Save ElevenLabs conversation ID to call_logs
   ├── Plivo hits POST /api/webhooks/plivo-status {CallUUID, CallStatus:"completed"}
   ├── UPDATE call_logs SET status='completed', duration=X
   ├── DELETE FROM active_calls WHERE sid=CallUUID
   └── Broadcast SSE: call_ended
```

---

## Environment Variables Required

| Variable | Example | Purpose |
|----------|---------|---------|
| `PLIVO_AUTH_ID` | `MANWY1ZD...` | Plivo account authentication ID |
| `PLIVO_AUTH_TOKEN` | `YjU0NDg3...` | Plivo account auth token |
| `PLIVO_PHONE_NUMBER` | `+918035454148` | Caller ID (must be Plivo-purchased number) |
| `NGROK_URL` | `https://xxx.ngrok-free.dev` | Public URL for Plivo webhooks |
| `ELEVENLABS_API_KEY` | `sk_ea6e97...` | ElevenLabs API key |
| `ELEVENLABS_AGENT_ID` | `agent_6701k...` | Default ElevenLabs agent (fallback) |

---

## Webhook URLs Configured in Plivo

| Webhook | URL | Method | Purpose |
|---------|-----|--------|---------|
| Answer URL | `{NGROK_URL}/api/voice/plivo?agentId={id}` | POST | Returns Stream XML when call is answered |
| Status Callback | `{NGROK_URL}/api/webhooks/plivo-status` | POST | Receives call status changes |

---

## Testing Checklist

- [ ] Call connects and stays connected after user picks up (Fix #1)
- [ ] Audio from AI agent is audible to the user (Fix #2, #3)
- [ ] User's speech is transcribed and AI responds (Fix #5 — correct agent)
- [ ] User can interrupt the AI mid-sentence — barge-in works (Fix #4)
- [ ] Call transcript is saved to database after hangup
- [ ] Call logs show provider as "plivo" and correct duration
- [ ] Dashboard receives real-time SSE events (call_started, transcript, call_ended)
