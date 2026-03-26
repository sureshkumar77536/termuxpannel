require('dotenv').config();
const express = require('express');
const os = require('os');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ngrok = require('ngrok');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Database & Session Tracking
const DB_FILE = path.join(__dirname, 'sinket_db.json');
let db = { vps: [], hosting: [] };
if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// Track running sshx processes { id: child_process_object }
let runningSessions = {};

// Authentication
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        res.json({ success: true, db });
    } else {
        res.status(401).json({ success: false, message: "Invalid Credentials!" });
    }
});

// System Stats (REAL data)
app.get('/api/stats', (req, res) => {
    const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
    const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
    exec("df -h /data | awk 'NR==2 {print $2, $4}'", (err, stdout) => {
        let storageParts = stdout.trim().split(' ');
        res.json({ totalMem, freeMem, totalStorage: storageParts[0] || 'N/A', freeStorage: storageParts[1] || 'N/A', os: process.env.OS_INSTALLED });
    });
});

// Terminal (REAL proot-distro access)
app.post('/api/terminal', (req, res) => {
    const { command } = req.body;
    exec(`proot-distro login ${process.env.OS_INSTALLED} -- bash -c "${command}"`, { timeout: 10000 }, (err, stdout, stderr) => {
        let output = stdout || stderr;
        res.json({ output: output.trim() || "Success (No output)" });
    });
});

// FIXED: Create User (NO ROOT ACCESS) & Generate Link
app.post('/api/create-vps', (req, res) => {
    const { vpsName, username, ram, storage } = req.body;
    const sessionId = Date.now(); // Unique ID for tracking
    
    // Commands to run as root to setup the non-root user
    const setupScript = `
        # Create non-root user if it doesn't exist
        id -u sinketuser &>/dev/null || adduser --disabled-password --gecos "" sinketuser
        # Switch to that user and run sshx
        su - sinketuser -c "sshx"
    `;
    
    // Command that spawns the non-root user session
    const prootCommand = `proot-distro login ${process.env.OS_INSTALLED} -- bash -c '${setupScript}'`;
    const child = spawn('sh', ['-c', prootCommand]);
    
    // Store process for killing later
    runningSessions[sessionId] = child;
    
    let linkGenerated = false;

    // Output parsing (listening for sshx url)
    const handleData = (data) => {
        const output = data.toString();
        // Cleaner Regex for SSHX URL
        const match = output.match(/https:\/\/sshx\.io\/[^\s\x1B]+/);
        if(match && !linkGenerated) {
            linkGenerated = true;
            const link = match[0].replace(/\x1B\[[0-9;]*m/g, ''); // clean colors
            
            const newVps = { id: sessionId, vpsName, username, ram, storage, link, status: 'Running', date: new Date().toLocaleString() };
            db.vps.push(newVps);
            saveDB();
            res.json({ success: true, vps: newVps });
        }
    };

    child.stdout.on('data', handleData);
    child.stderr.on('data', handleData);

    // Timeout if link generation fails
    setTimeout(() => {
        if(!linkGenerated) {
            child.kill('SIGKILL'); // kill the spawned session
            delete runningSessions[sessionId];
            res.json({ success: false, message: "SSHX URL Generation Timeout. Check OS internet." });
        }
    }, 15000); // 15 sec wait for clean URL catch
});

// Kill SSHX Session
app.post('/api/kill-vps', (req, res) => {
    const { id } = req.body;
    
    if(runningSessions[id]) {
        runningSessions[id].kill('SIGKILL'); // properly terminate process
        delete runningSessions[id];
        
        // Update database to show as Terminated
        const vpsIndex = db.vps.findIndex(v => v.id === parseInt(id));
        if(vpsIndex !== -1) {
            db.vps[vpsIndex].status = 'Terminated';
            saveDB();
        }
        res.json({ success: true, message: "Session terminated successfully!" });
    } else {
        res.status(404).json({ success: false, message: "Session not found or already killed." });
    }
});

// Web Hosting
app.post('/api/host', async (req, res) => {
    const { projectName, htmlCode, ngrokToken } = req.body;
    const hostDir = path.join(__dirname, 'hosting', projectName.replace(/\s+/g, '-'));
    
    try {
        if (!fs.existsSync(hostDir)) fs.mkdirSync(hostDir, { recursive: true });
        fs.writeFileSync(path.join(hostDir, 'index.html'), htmlCode);

        // Start local server
        const port = 8000 + Math.floor(Math.random() * 1000);
        exec(`cd ${hostDir} && python -m http.server ${port} &`);

        // Start Ngrok
        if(ngrokToken) await ngrok.authtoken(ngrokToken);
        const url = await ngrok.connect(port);
        
        const newSite = { projectName, url, port, date: new Date().toLocaleString() };
        db.hosting.push(newSite); saveDB();
        res.json({ success: true, site: newSite });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// Fetch database on login
app.get('/api/database', (req, res) => res.json(db));

app.listen(3000, () => console.log('Sinket VPS Backend Running on Port 3000'));
