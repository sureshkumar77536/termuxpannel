#!/bin/bash
clear
echo -e "\e[1;36m=========================================\e[0m"
echo -e "\e[1;32m       TERMUX PRO PANEL SETUP 2026       \e[0m"
echo -e "\e[1;36m=========================================\e[0m"

echo "[+] Updating Termux and installing dependencies..."
pkg update -y && pkg upgrade -y
pkg install nodejs proot-distro wget curl git python -y

# Cloudflared install karne ka proper tarika
echo "[+] Installing Cloudflared Tunnel..."
pkg install cloudflared -y || npm install -g cloudflared

echo -e "\n\e[1;33m[?] Which OS do you want for the VPS environment?\e[0m"
echo "1) Ubuntu (Recommended)"
echo "2) Debian"
echo "3) Alpine"
read -p "Choose (1/2/3): " os_choice

if [ "$os_choice" == "1" ]; then OS="ubuntu"; fi
if [ "$os_choice" == "2" ]; then OS="debian"; fi
if [ "$os_choice" == "3" ]; then OS="alpine"; fi

echo "[+] Installing $OS (This may take a while)..."
proot-distro install $OS

echo -e "\n\e[1;36m[+] Setup Admin Credentials for the Web Panel\e[0m"
read -p "Enter Admin Username: " ADMIN_USER
read -p "Enter Admin Password: " ADMIN_PASS

# Config file (.env) save karna backend ke liye
echo "ADMIN_USER=$ADMIN_USER" > .env
echo "ADMIN_PASS=$ADMIN_PASS" >> .env
echo "OS_INSTALLED=$OS" >> .env

echo "[+] Installing Node.js Packages..."
npm install express dotenv

echo -e "\n\e[1;32m[+] Setup Complete! Starting Server and Cloudflare Tunnel...\e[0m"
echo -e "Waiting for Cloudflare Tunnel URL to appear on screen..."

# Background mein Node.js server run karna
node server.js &
sleep 3

# Cloudflare tunnel start karna port 3000 par (website live karne ke liye)
cloudflared tunnel --url http://localhost:3000
