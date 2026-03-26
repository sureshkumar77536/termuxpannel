# 🚀 Termux Pro Panel 2026
A highly advanced, automated UI Dashboard for Termux. Turn your Android device into a powerful server to create VPS environments, distribute SSHX links, and host websites seamlessly!

---

## 🌟 Awesome Features
- 🖥️ **Real-Time System Stats:** Live monitoring of RAM & Storage.
- ⚙️ **Automated OS Setup:** Choose and install Ubuntu, Debian, or Alpine with one click.
- 🌐 **Auto-Cloudflare Tunnel:** Your panel goes live on the internet automatically! No port-forwarding needed.
- 👤 **VPS Manager:** Distribute VPS access to users instantly using `sshx` links.
- 💻 **Web Terminal:** Execute root commands directly from the UI panel.
- 🌍 **Web Hosting:** Host HTML/CSS websites live using Ngrok directly from the dashboard.

---

## ⚠️ Zaroori Baat (Important)
Play Store wala Termux use **mat** karna, usme errors aayenge. Hamesha **F-Droid** ya official **GitHub** se Termux download karein.

---

## 🛠️ Step-by-Step Installation (100% Error-Free Guide)

Agar aap pehli baar setup kar rahe hain, toh in commands ko line-by-line apne Termux mein copy-paste karein. Is method se aapko koi `libcrypto` ya `git` ka error nahi aayega.

### Step 1: Storage Permission aur Repo Fix karein
Sabse pehle storage ki permission dein aur Termux ke links ko fix karein taaki update fail na ho:

```bash
termux-setup-storage
termux-change-repo
```
*(Screen par Allow par click karein aur repo mein sab select karke OK karein)*

### Step 2: System Update karein (Very Important)
Termux ko latest version par update karein taaki purane errors na aayein:

```bash
pkg update -y && pkg upgrade -y
```

### Step 3: Zaroori Packages Install karein
Yeh command un errors ko fix karegi jo Git ya libcrypto ki wajah se aate hain:

```bash
pkg install git openssl -y
```

### Step 4: Pannel ka Code Download (Clone) karein
Ab hamare GitHub repo se code Termux mein laayein:

```bash
git clone https://github.com/sureshkumar77536/termuxpannel.git
```

### Step 5: Folder mein Jayein aur Setup Run karein
Folder ke andar jaakar main installer script chalayein:

```bash
cd termuxpannel
bash install.sh
```

---

## 💻 Panel Ko Kaise Use Karein?

1. Jab aap `bash install.sh` chalayenge, toh script aapse OS (Ubuntu/Debian) puchegi. Number select karein.
2. Apne Panel ke liye ek **Admin Username** aur **Password** set karein.
3. Setup complete hone ke baad, script apne aap ek Cloudflare Tunnel start karegi.
4. Screen par aapko ek link dikhega jo `.trycloudflare.com` par khatam hoga.
5. Us link ko copy karke apne Chrome ya kisi bhi browser mein open karein.
6. Apna Username aur Password daalein aur **Boom! Aapka Panel Live hai!** 🔥

---
*Created and Maintained by Prabhat*
