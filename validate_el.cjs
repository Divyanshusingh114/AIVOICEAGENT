const https = require('https');
const fs = require('fs');
const path = require('path');

// Read .env manually
const envPath = path.resolve('.env');
let apiKey = '';
if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/ELEVENLABS_API_KEY=(.+)/);
    if (match) apiKey = match[1].trim();
}

console.log('Checking API Key:', apiKey ? apiKey.substring(0, 5) + '...' : 'NONE');

if (!apiKey) {
    console.error('No API Key found in .env');
    process.exit(1);
}

const options = {
    hostname: 'api.elevenlabs.io',
    path: '/v1/convai/agents',
    method: 'GET',
    headers: {
        'xi-api-key': apiKey
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        if (res.statusCode !== 200) {
            console.error(`API Error: ${res.statusCode} ${res.statusMessage}`);
            try {
                const err = JSON.parse(data);
                console.error('Details:', JSON.stringify(err, null, 2));
            } catch (e) {
                console.error('Response:', data);
            }
            return;
        }

        try {
            const response = JSON.parse(data);
            const agents = response.agents || [];
            console.log(`\nFound ${agents.length} Agents for this API Key:`);
            agents.forEach(a => {
                console.log(`- [${a.agent_id}] ${a.name}`);
            });

            if (agents.length > 0) {
                console.log(`\nRECOMMENDED ACTION: Update .env ELEVENLABS_AGENT_ID with: ${agents[0].agent_id}`);
            } else {
                console.log('\nWARNING: No agents found for this API Key. You must create one on ElevenLabs website first!');
            }
        } catch (e) {
            console.error('Failed to parse response:', e);
        }
    });
});

req.on('error', (e) => {
    console.error('Request failed:', e);
});

req.end();
