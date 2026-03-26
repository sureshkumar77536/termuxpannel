#!/bin/bash
clear
echo -e "\e[1;36m=======================================================\e[0m"
echo -e "\e[1;36m███████╗██╗███╗   ██╗██╗  ██╗███████╗████████╗\e[0m"
echo -e "\e[1;36m██╔════╝██║████╗  ██║██║ ██╔╝██╔════╝╚══██╔══╝\e[0m"
echo -e "\e[1;36m███████╗██║██╔██╗ ██║█████╔╝ █████╗     ██║   \e[0m"
echo -e "\e[1;36m╚════██║██║██║╚██╗██║██╔═██╗ ██╔══╝     ██║   \e[0m"
echo -e "\e[1;36m███████║██║██║ ╚████║██║  ██╗███████╗   ██║   \e[0m"
echo -e "\e[1;36m╚══════╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝   ╚═╝   \e[0m"
echo -e "\e[1;34m██╗   ██╗██████╗ ███████╗ ██████╗ ██████╗  ██████╗ \e[0m"
echo -e "\e[1;34m██║   ██║██╔══██╗██╔════╝ ██╔══██╗██╔══██╗██╔═══██╗\e[0m"
echo -e "\e[1;34m██║   ██║██████╔╝███████╗ ██████╔╝██████╔╝██║   ██║\e[0m"
echo -e "\e[1;34m╚██╗ ██╔╝██╔═══╝ ╚════██║ ██╔═══╝ ██╔══██╗██║   ██║\e[0m"
echo -e "\e[1;34m ╚████╔╝ ██║     ███████║ ██║     ██║  ██║╚██████╔╝\e[0m"
echo -e "\e[1;34m  ╚═══╝  ╚═╝     ╚══════╝ ╚═╝     ╚═╝  ╚═╝ ╚═════╝ \e[0m"
echo -e "\e[1;36m=======================================================\e[0m"

echo "[+] Updating Termux and installing dependencies..."
pkg update -y && pkg upgrade -y
pkg install nodejs proot-distro wget curl git python tar -y

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

echo "ADMIN_USER=$ADMIN_USER" > .env
echo "ADMIN_PASS=$ADMIN_PASS" >> .env
echo "OS_INSTALLED=$OS" >> .env

echo "[+] Installing Node.js Packages..."
npm install express dotenv ngrok cors

echo -e "\n\e[1;33m[?] How do you want to make Sinket VPS Live?\e[0m"
echo "1) Cloudflare (Free, No Account Required)"
echo "2) Ngrok (Requires Ngrok Authtoken)"
read -p "Select Tunnel (1/2): " TUNNEL_CHOICE

if [ "$TUNNEL_CHOICE" == "2" ]; then
    echo -e "\e[1;36m[+] Setting up Ngrok...\e[0m"
    read -p "Enter your Ngrok Authtoken: " NGROK_TOKEN
    wget -q https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-arm64.tgz
    tar -xzf ngrok-v3-stable-linux-arm64.tgz -C /data/data/com.termux/files/usr/bin
    rm ngrok-v3-stable-linux-arm64.tgz
    ngrok config add-authtoken $NGROK_TOKEN
else
    echo -e "\e[1;36m[+] Setting up Cloudflare...\e[0m"
    pkg install cloudflared -y || npm install -g cloudflared
fi

echo -e "\n\e[1;32m[+] Setup Complete! Starting Server...\e[0m"
node server.js &
sleep 3

if [ "$TUNNEL_CHOICE" == "2" ]; then
    echo -e "\e[1;32m[+] Starting Ngrok Tunnel on Port 3000...\e[0m"
    ngrok http 3000
else
    echo -e "\e[1;32m[+] Starting Cloudflare Tunnel on Port 3000...\e[0m"
    cloudflared tunnel --url http://localhost:3000
fi
