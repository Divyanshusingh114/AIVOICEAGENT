import Database from 'better-sqlite3';

const db = new Database('./server/data.db');

// Update the existing campaign "Demo" to "demo 2" with Plivo settings
// or create it if it doesn't exist
const campaign = db.prepare("SELECT id FROM campaigns WHERE name = 'Demo' OR name = 'demo 2'").get();

if (campaign) {
    console.log('Updating campaign:', campaign.id);
    db.prepare(`
        UPDATE campaigns 
        SET name = 'demo 2', 
            provider = 'plivo', 
            fromNumber = '+918035454148', 
            agentId = 'e09f53dc-9a45-470d-b8ea-2245502bf908' 
        WHERE id = ?
    `).run(campaign.id);
} else {
    console.log('Campaign not found, creating new one...');
    const newId = '7a9c3a1e-65b5-4731-80a9-38855ce755ee';
    db.prepare(`
        INSERT OR REPLACE INTO campaigns (id, name, agentId, provider, fromNumber, status)
        VALUES (?, 'demo 2', 'e09f53dc-9a45-470d-b8ea-2245502bf908', 'plivo', '+918035454148', 'stopped')
    `).run(newId);
}

console.log('Database updated successfully.');
db.close();
