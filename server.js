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

const DB_FILE = path.join(__dirname, 'sinket_db.json');
let db = { vps: [], hosting: [] };
if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

let runningSessions = {};

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        res.json({ success: true, db });
    } else {
        res.status(401).json({ success: false, message: "Invalid Credentials!" });
    }
});

app.get('/api/stats', (req, res) => {
    const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
    const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
    exec("df -h /data | awk 'NR==2 {print $2, $4}'", (err, stdout) => {
        let storageParts = stdout.trim().split(' ');
        res.json({ totalMem, freeMem, totalStorage: storageParts[0] || 'N/A', freeStorage: storageParts[1] || 'N/A', os: process.env.OS_INSTALLED });
    });
});

app.post('/api/terminal', (req, res) => {
    const { command } = req.body;
    exec(`proot-distro login ${process.env.OS_INSTALLED} -- bash -c "${command}"`, { timeout: 15000 }, (err, stdout, stderr) => {
        let output = stdout || stderr;
        res.json({ output: output.trim() || "Success (No output)" });
    });
});

app.post('/api/create-vps', (req, res) => {
    const { vpsName, username, ram, storage } = req.body;
    const sessionId = Date.now(); 
    const safeUser = username.replace(/[^a-z0-9]/g, '').toLowerCase() || 'vpsuser';

    const setupScript = `
        apt-get update -y > /dev/null 2>&1
        apt-get install curl sudo -y > /dev/null 2>&1
        if ! command -v sshx &> /dev/null; then
            curl -sSf https://sshx.io/get | sh
        fi
        if ! id -u ${safeUser} &>/dev/null; then
            useradd -m -s /bin/bash ${safeUser}
        fi
        su - ${safeUser} -c "sshx -q"
    `;
    
    const prootCommand = `proot-distro login ${process.env.OS_INSTALLED} -- bash -c '${setupScript}'`;
    const child = spawn('sh', ['-c', prootCommand]);
    runningSessions[sessionId] = child;
    let linkGenerated = false;

    const handleData = (data) => {
        const output = data.toString();
        const match = output.match(/https:\/\/sshx\.io\/s\/[a-zA-Z0-9]+/);
        if(match && !linkGenerated) {
            linkGenerated = true;
            const link = match[0].replace(/\x1B\[[0-9;]*m/g, ''); 
            const newVps = { id: sessionId, vpsName, username: safeUser, ram, storage, link, status: 'Running', date: new Date().toLocaleString() };
            db.vps.push(newVps); saveDB();
            res.json({ success: true, vps: newVps });
        }
    };
    child.stdout.on('data', handleData);
    child.stderr.on('data', handleData);

    setTimeout(() => {
        if(!linkGenerated) {
            child.kill('SIGKILL'); delete runningSessions[sessionId];
            res.json({ success: false, message: "Timeout: SSHX link not generated. Try again." });
        }
    }, 15000); 
});

app.post('/api/kill-vps', (req, res) => {
    const { id } = req.body;
    if(runningSessions[id]) {
        runningSessions[id].kill('SIGKILL'); delete runningSessions[id];
        const vpsIndex = db.vps.findIndex(v => v.id === parseInt(id));
        if(vpsIndex !== -1) { db.vps[vpsIndex].status = 'Terminated'; saveDB(); }
        res.json({ success: true, message: "Session terminated!" });
    } else {
        res.status(404).json({ success: false, message: "Session not found." });
    }
});

// Fixed Web Hosting (Ngrok or Cloudflare)
app.post('/api/host', async (req, res) => {
    const { projectName, htmlCode, provider, ngrokToken } = req.body;
    const hostDir = path.join(__dirname, 'hosting', projectName.replace(/\s+/g, '-'));
    
    try {
        if (!fs.existsSync(hostDir)) fs.mkdirSync(hostDir, { recursive: true });
        fs.writeFileSync(path.join(hostDir, 'index.html'), htmlCode);

        const port = 8000 + Math.floor(Math.random() * 1000);
        exec(`cd ${hostDir} && python -m http.server ${port} &`);

        if (provider === 'ngrok') {
            if(ngrokToken) await ngrok.authtoken(ngrokToken);
            const url = await ngrok.connect(port);
            const newSite = { projectName, url, port, provider: 'Ngrok', date: new Date().toLocaleString() };
            db.hosting.push(newSite); saveDB();
            res.json({ success: true, site: newSite });
        } 
        else if (provider === 'cloudflare') {
            const tunnelChild = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`]);
            let tunnelUrl = '';
            let linkGenerated = false;

            tunnelChild.stderr.on('data', (data) => {
                const output = data.toString();
                const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
                if(match && !linkGenerated) {
                    linkGenerated = true;
                    tunnelUrl = match[0];
                    const newSite = { projectName, url: tunnelUrl, port, provider: 'Cloudflare', date: new Date().toLocaleString() };
                    db.hosting.push(newSite); saveDB();
                    res.json({ success: true, site: newSite });
                }
            });

            setTimeout(() => {
                if(!linkGenerated) {
                    tunnelChild.kill('SIGKILL');
                    res.json({ success: false, message: "Cloudflare tunnel timeout." });
                }
            }, 10000);
        }
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.get('/api/database', (req, res) => res.json(db));
app.listen(3000, () => console.log('Sinket VPS Backend Running on Port 3000'));
