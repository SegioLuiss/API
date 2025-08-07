const express = require('express');
const app = express();
const port = 3000;
const fs = require('fs');

app.use(express.json());

function saveJobId(jobId, canJoin) {
    fs.writeFileSync('jobid.json', JSON.stringify({ jobId, canJoin, updatedAt: new Date().toISOString() }));
}

function loadJobId() {
    if (fs.existsSync('jobid.json')) {
        const data = fs.readFileSync('jobid.json', 'utf8');
        return JSON.parse(data);
    }
    return { jobId: null, canJoin: true, updatedAt: null };
}

let { jobId: latestJobId, canJoin = true, updatedAt } = loadJobId();

const receiverStatusMap = new Map();

app.post('/set-jobid', (req, res) => {
    const { name, jobId, canJoin: newCanJoin } = req.body;
    if (!name || !jobId) {
        return res.status(400).json({ error: 'name and jobId are required' });
    }

    latestJobId = jobId;
    canJoin = newCanJoin === false ? false : true;
    updatedAt = new Date().toISOString();

    saveJobId(latestJobId, canJoin);

    receiverStatusMap.set(name, {
        jobId,
        canJoin,
        updatedAt
    });

    const status = receiverStatusMap.get(name);
    console.log(`[${updatedAt}] Receiver "${name}" updated jobId: ${jobId}, canJoin: ${status.canJoin}`);

    res.json({ message: 'JobId saved successfully', jobId: latestJobId, canJoin });
});

app.get('/receivers', (req, res) => {
    const result = {};
    for (const [name, status] of receiverStatusMap.entries()) {
        result[name] = status;
    }
    res.json(result);
});

const onlinePlayers = new Map();
const ONLINE_TIMEOUT_MS = 15000;

app.post("/ping", (req, res) => {
    const { name } = req.body;
    if (name) {
        onlinePlayers.set(name, Date.now());
        return res.json({ success: true });
    }
    return res.status(400).json({ error: "Missing name" });
});

app.get("/is-online/:name", (req, res) => {
    const name = req.params.name;
    const lastSeen = onlinePlayers.get(name);
    const now = Date.now();

    if (lastSeen && now - lastSeen < ONLINE_TIMEOUT_MS) {
        return res.json({ online: true });
    } else {
        return res.json({ online: false });
    }
});

const tradeQueue = [];

app.post('/enqueue', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });

    if (!tradeQueue.includes(name)) {
        tradeQueue.push(name);
        console.log(`[${new Date().toISOString()}] ${name} added to queue`);
    }

    res.json({ success: true, position: tradeQueue.indexOf(name) + 1 });
});

app.post('/dequeue', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });

    const index = tradeQueue.indexOf(name);
    if (index !== -1) {
        tradeQueue.splice(index, 1);
        console.log(`[${new Date().toISOString()}] ${name} removed from queue`);
        return res.json({ success: true, message: 'Removed from queue' });
    }

    res.status(404).json({ error: 'Name not found in queue' });
});

app.get('/queue-position/:name', (req, res) => {
    const name = req.params.name;
    if (!name) return res.status(400).json({ error: 'Missing name' });

    const position = tradeQueue.indexOf(name);
    if (position === -1) {
        return res.status(404).json({ error: 'Name not found in queue' });
    }

    res.json({ success: true, position: position + 1 });
});

app.get('/can-teleport/:name', (req, res) => {
    const name = req.params.name;
    const position = tradeQueue.indexOf(name);
    const { jobId, canJoin } = loadJobId();

    if (position === -1) {
        return res.status(404).json({ error: 'Not in queue' });
    }

    if (position === 0 && jobId && canJoin) {
        return res.json({ canTeleport: true, jobId });
    }

    return res.json({ canTeleport: false, position: position + 1 });
});

app.get('/queue-status', (req, res) => {
    res.json({ queue: tradeQueue, length: tradeQueue.length });
});

app.listen(port, () => {
    console.log(`✅ JobId Listener API running at http://localhost:${port}`);
});
