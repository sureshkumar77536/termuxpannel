require('dotenv').config();
const express = require('express');
const os = require('os');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public')); 

// Authentication
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        res.json({ success: true, message: "Welcome Admin!" });
    } else {
        res.status(401).json({ success: false, message: "Invalid Credentials!" });
    }
});

// System Stats
app.get('/api/stats', (req, res) => {
    const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
    const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
    exec("df -h /data | awk 'NR==2 {print $2, $4}'", (err, stdout) => {
        let storageParts = stdout.trim().split(' ');
        res.json({ 
            totalMem, freeMem, 
            totalStorage: storageParts[0] || 'N/A', 
            freeStorage: storageParts[1] || 'N/A', 
            os: process.env.OS_INSTALLED 
        });
    });
});

// Web Terminal
app.post('/api/terminal', (req, res) => {
    const { command } = req.body;
    exec(`proot-distro login ${process.env.OS_INSTALLED} -- bash -c "${command}"`, (err, stdout, stderr) => {
        res.json({ output: stdout || stderr || err.message });
    });
});

// VPS / SSHX Generation
let usersList = [];
app.post('/api/create-vps', (req, res) => {
    const { username, ram, storage } = req.body;
    const cmd = `proot-distro login ${process.env.OS_INSTALLED} -- bash -c "curl -sSf https://sshx.io/get | sh && sshx -q"`;
    const child = spawn('sh', ['-c', cmd]);
    
    let linkGenerated = false;
    child.stdout.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/https:\/\/sshx\.io\/s\/[a-zA-Z0-9]+/);
        if(match && !linkGenerated) {
            linkGenerated = true;
            const link = match[0];
            usersList.push({ username, ram, storage, link });
            res.json({ success: true, link, usersList });
        }
    });

    setTimeout(() => {
        if(!linkGenerated) res.json({ success: false, message: "Timeout generating SSHX link." });
    }, 8000);
});

// Ngrok Hosting
app.post('/api/host', (req, res) => {
    const { htmlCode, ngrokToken } = req.body;
    const hostDir = path.join(__dirname, 'hosting');
    if (!fs.existsSync(hostDir)) fs.mkdirSync(hostDir);
    fs.writeFileSync(path.join(hostDir, 'index.html'), htmlCode);

    exec(`wget -q https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-arm64.tgz && tar -xzf ngrok-v3-stable-linux-arm64.tgz`, () => {
        exec(`./ngrok config add-authtoken ${ngrokToken}`, () => {
            exec(`cd hosting && python -m http.server 8080 &`);
            exec(`./ngrok http 8080 > /dev/null &`);
            setTimeout(() => {
                exec(`curl -s http://127.0.0.1:4040/api/tunnels | grep -o 'https://[a-zA-Z0-9.-]*\.ngrok-free\.app'`, (err, stdout) => {
                    res.json({ url: stdout.trim() || "Error getting URL" });
                });
            }, 6000);
        });
    });
});

app.listen(3000, () => console.log('Panel running on Port 3000'));
