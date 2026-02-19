# KredMint AI Voice Agent Platform

A comprehensive voice AI platform integrating Twilio for telephony and ElevenLabs for realistic AI-driven conversations. Features include call campaigns, real-time dashboards, and detailed call logs.

## 🚀 Deployment Guide (Production)

### 1. Prerequisites
- Docker & Docker Compose
- Twilio Account (SID, Auth Token, Phone Number)
- ElevenLabs Account (API Key, Agent ID)
- A Public URL (SSL recommended) or Ngrok for local testing

### 2. Environment Setup
Copy `.env.example` to `.env` and fill in your credentials:
```bash
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=your_number
ELEVENLABS_API_KEY=your_key
ELEVENLABS_AGENT_ID=your_id
NGROK_URL=https://your-domain.ngrok-free.dev
```

### 3. Automated Deployment
Run the included deployment script:
```bash
chmod +x deploy.sh
./deploy.sh
```

### 4. Manual Docker Deployment
```bash
# Build and start in detached mode
docker-compose up -d --build

# View logs
docker-compose logs -f
```

## 🛠️ Development Setup

If you want to run the project locally without Docker:

### installation
```bash
# Install root dependencies
npm install

# Install server/client specific deps (automatically handled by workspaces)
npm run install:all
```

### Execution
```bash
# Start both server and client
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3000

## 📂 Project Structure
- `/client`: React + Vite frontend
- `/server`: Node.js + Express + WebSocket backend (TypeScript)
- `/shared`: Shared TypeScript types
- `/data`: SQLite database storage (Volumes in Docker)

## 🛡️ Security Features
- **Helmet**: Secure HTTP headers
- **Rate Limiting**: Protects /api endpoints
- **Compression**: Gzip compression for faster response times
- **CORS**: Configured for secure cross-origin requests
