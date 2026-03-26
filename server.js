require('dotenv').config();
const express = require('express');
const os = require('os');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ngrok = require('ngrok'); // Ngrok fixed module

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Database Setup (Persistence)
const DB_FILE = path.join(__dirname, 'sinket_db.json');
let db = { vps: [], hosting: [] };
if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        res.json({ success: true, db });
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
        res.json({ totalMem, freeMem, totalStorage: storageParts[0] || 'N/A', freeStorage: storageParts[1] || 'N/A', os: process.env.OS_INSTALLED });
    });
});

// Live Terminal Execution
app.post('/api/terminal', (req, res) => {
    const { command } = req.body;
    // Proper execution inside proot
    exec(`proot-distro login ${process.env.OS_INSTALLED} -- bash -c "${command}"`, { timeout: 10000 }, (err, stdout, stderr) => {
        let output = stdout || stderr;
        if (err && !output) output = err.message;
        res.json({ output: output.trim() || "Success (No output)" });
    });
});

// Create VPS & Catch Real SSHX URL
app.post('/api/create-vps', (req, res) => {
    const { username, ram, storage } = req.body;
    const cmd = `proot-distro login ${process.env.OS_INSTALLED} -- bash -c "curl -sSf https://sshx.io/get | sh && sshx"`;
    const child = spawn('sh', ['-c', cmd]);
    
    let linkGenerated = false;
    
    // Listening to both stdout and stderr (sshx sometimes uses stderr for urls)
    const handleData = (data) => {
        const output = data.toString();
        // Regex to catch exact URL properly
        const match = output.match(/https:\/\/sshx\.io\/[^\s\x1B]+/); 
        if(match && !linkGenerated) {
            linkGenerated = true;
            const link = match[0].replace(/\x1B\[[0-9;]*m/g, ''); // clean colors
            
            const newVps = { id: Date.now(), username, ram, storage, link, status: 'Running', date: new Date().toLocaleString() };
            db.vps.push(newVps);
            saveDB();
            res.json({ success: true, link, vps: newVps });
        }
    };

    child.stdout.on('data', handleData);
    child.stderr.on('data', handleData);

    setTimeout(() => {
        if(!linkGenerated) {
            child.kill();
            res.json({ success: false, message: "SSHX URL Generation Timeout. Server might be down." });
        }
    }, 12000); // 12 sec wait for perfect catch
});

// Fixed Web Hosting via direct NPM Ngrok
app.post('/api/host', async (req, res) => {
    const { projectName, htmlCode, ngrokToken } = req.body;
    const hostDir = path.join(__dirname, 'hosting', projectName.replace(/\s+/g, '-'));
    
    try {
        if (!fs.existsSync(hostDir)) fs.mkdirSync(hostDir, { recursive: true });
        fs.writeFileSync(path.join(hostDir, 'index.html'), htmlCode);

        // Start local server
        const port = 8000 + Math.floor(Math.random() * 1000);
        exec(`cd ${hostDir} && python -m http.server ${port} &`);

        // Start Ngrok properly
        if(ngrokToken) await ngrok.authtoken(ngrokToken);
        const url = await ngrok.connect(port);
        
        const newSite = { id: Date.now(), projectName, url, port, date: new Date().toLocaleString() };
        db.hosting.push(newSite);
        saveDB();
        
        res.json({ success: true, url, site: newSite });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// Fetch saved data
app.get('/api/database', (req, res) => res.json(db));

app.listen(3000, () => console.log('Sinket VPS Backend Running on Port 3000'));
