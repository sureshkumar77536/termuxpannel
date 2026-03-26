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

// ---------------------------------------------------------
// 1. Database & Session Tracking Setup
// ---------------------------------------------------------
const DB_FILE = path.join(__dirname, 'sinket_db.json');
let db = { vps: [], hosting: [] };

// Load existing database if it exists
if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

// Function to save data to sinket_db.json
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// Track running sshx processes so we can kill them later
let runningSessions = {};


// ---------------------------------------------------------
// 2. Authentication Route
// ---------------------------------------------------------
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        // Send the database back to load saved VPS/Hosting tables on login
        res.json({ success: true, db });
    } else {
        res.status(401).json({ success: false, message: "Invalid Credentials!" });
    }
});


// ---------------------------------------------------------
// 3. System Stats Route (Real Data)
// ---------------------------------------------------------
app.get('/api/stats', (req, res) => {
    const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
    const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
    exec("df -h /data | awk 'NR==2 {print $2, $4}'", (err, stdout) => {
        let storageParts = stdout.trim().split(' ');
        res.json({ 
            totalMem, 
            freeMem, 
            totalStorage: storageParts[0] || 'N/A', 
            freeStorage: storageParts[1] || 'N/A', 
            os: process.env.OS_INSTALLED 
        });
    });
});


// ---------------------------------------------------------
// 4. Live Terminal Route
// ---------------------------------------------------------
app.post('/api/terminal', (req, res) => {
    const { command } = req.body;
    exec(`proot-distro login ${process.env.OS_INSTALLED} -- bash -c "${command}"`, { timeout: 10000 }, (err, stdout, stderr) => {
        let output = stdout || stderr;
        res.json({ output: output.trim() || "Success (No output)" });
    });
});


// ---------------------------------------------------------
// 5. VPS Setup (Non-Root User) & SSHX Generation Route
// ---------------------------------------------------------
app.post('/api/create-vps', (req, res) => {
    const { vpsName, username, ram, storage } = req.body;
    const sessionId = Date.now(); 
    
    // Ensure safe linux username format (lowercase, no spaces)
    const safeUser = username.replace(/[^a-z0-9]/g, '').toLowerCase() || 'vpsuser';

    // The Bulletproof Script: Installs dependencies, creates user, runs sshx
    const setupScript = `
        apt-get update -y > /dev/null 2>&1
        apt-get install curl sudo -y > /dev/null 2>&1
        
        # Install sshx globally if missing
        if ! command -v sshx &> /dev/null; then
            curl -sSf https://sshx.io/get | sh
        fi
        
        # Create a safe non-root user
        if ! id -u ${safeUser} &>/dev/null; then
            useradd -m -s /bin/bash ${safeUser}
        fi
        
        # Run sshx in quiet mode to bypass terminal UI freeze
        su - ${safeUser} -c "sshx -q"
    `;
    
    const prootCommand = `proot-distro login ${process.env.OS_INSTALLED} -- bash -c '${setupScript}'`;
    const child = spawn('sh', ['-c', prootCommand]);
    
    runningSessions[sessionId] = child;
    let linkGenerated = false;

    // Listen to output to catch the exact URL
    const handleData = (data) => {
        const output = data.toString();
        // Regex to catch the sshx shareable URL
        const match = output.match(/https:\/\/sshx\.io\/s\/[a-zA-Z0-9]+/);
        if(match && !linkGenerated) {
            linkGenerated = true;
            const link = match[0].replace(/\x1B\[[0-9;]*m/g, ''); // Remove color codes
            
            const newVps = { id: sessionId, vpsName, username: safeUser, ram, storage, link, status: 'Running', date: new Date().toLocaleString() };
            
            // Save to database
            db.vps.push(newVps);
            saveDB();
            
            res.json({ success: true, vps: newVps });
        }
    };

    child.stdout.on('data', handleData);
    child.stderr.on('data', handleData);

    // Timeout logic (15 seconds wait)
    setTimeout(() => {
        if(!linkGenerated) {
            child.kill('SIGKILL'); 
            delete runningSessions[sessionId];
            res.json({ success: false, message: "Timeout: SSHX link not generated. Please try again." });
        }
    }, 15000); 
});


// ---------------------------------------------------------
// 6. Kill VPS Session Route
// ---------------------------------------------------------
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


// ---------------------------------------------------------
// 7. Web Hosting Route (Ngrok)
// ---------------------------------------------------------
app.post('/api/host', async (req, res) => {
    const { projectName, htmlCode, ngrokToken } = req.body;
    const hostDir = path.join(__dirname, 'hosting', projectName.replace(/\s+/g, '-'));
    
    try {
        if (!fs.existsSync(hostDir)) fs.mkdirSync(hostDir, { recursive: true });
        fs.writeFileSync(path.join(hostDir, 'index.html'), htmlCode);

        // Start local python server
        const port = 8000 + Math.floor(Math.random() * 1000);
        exec(`cd ${hostDir} && python -m http.server ${port} &`);

        // Start Ngrok
        if(ngrokToken) await ngrok.authtoken(ngrokToken);
        const url = await ngrok.connect(port);
        
        const newSite = { projectName, url, port, date: new Date().toLocaleString() };
        
        // Save to Database
        db.hosting.push(newSite); 
        saveDB();
        
        res.json({ success: true, site: newSite });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});


// ---------------------------------------------------------
// 8. Fetch Database Route
// ---------------------------------------------------------
app.get('/api/database', (req, res) => res.json(db));

// Start Server
app.listen(3000, () => console.log('Sinket VPS Backend Running on Port 3000'));
