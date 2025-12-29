## AWS EC2 + PM2 Deployment Guide

Step-by-step instructions to launch an Ubuntu EC2 instance, deploy this backend, and keep it running with PM2. Written for Windows clients using OpenSSH (Git Bash/PowerShell).

### Prerequisites
- AWS account with permissions to create EC2, Elastic IP, and security groups.
- GitHub access token (classic) with `repo` scope for pushes.
- Local tools: OpenSSH (`ssh`, `ssh-keygen`), Git, curl, and a terminal (PowerShell or Git Bash).

### 1) Create the EC2 instance
- Launch an Ubuntu 22.04/24.04 t2.micro (or larger) in your preferred VPC/subnet.
- Keep defaults unless you need a different key pair or storage size (10–20 GB is typical).
- Download the `.pem` key pair and keep it safe; it is required for SSH.

### 2) Assign a static (Elastic) IP
- In the AWS console: VPC/EC2 → Elastic IPs → Allocate Elastic IP.
- Associate the Elastic IP to your new instance (Actions → Associate Elastic IP).
- Note the public IP (e.g., `3.108.247.203`); you will use it in SSH and DNS.

### 3) SSH profile on Windows
Create a host entry in `C:\Users\<you>\.ssh\config`:
```
Host storageapp-backend
    HostName 3.108.247.203
    User ubuntu
    IdentityFile C:/Users/admin/.ssh/Storage-App-Backend-key-pair
```
File permissions (PowerShell): `icacls $env:USERPROFILE\.ssh\Storage-App-Backend-key-pair /inheritance:r /grant:r "$($env:USERNAME):(R)"`

### 4) Connect to the server
In PowerShell/Git Bash:
```
ssh storageapp-backend
```
On first connect, accept the host key prompt.

### 5) Base server setup
```
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential
```

### 6) Install Node.js, npm, npx (Nodesource, no nvm)
Install the Node 22.x stream to match the current project expectation:
```
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # expect v22.x
npm -v
npx -v
```

### 7) Clone the repository
```
git clone <your-repo-url>
cd <project-root>/server
```

### 8) Configure Git pushes (PAT)
When `git push` prompts:
- Username: your GitHub username
- Password: personal access token (classic) with `repo` scope (Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token).

### 9) Environment variables
Create `.env` in `server/` with your secrets (DB, Redis, AWS, etc.). Example flow:
```
cd ~/Personal-Cloud-Drive-Backend-PM2/server
touch .env
nano .env   # paste env content, save and exit
```

### 10) Install dependencies and test locally
```
npm install
npm run dev   # confirm the app starts; exit with Ctrl+C when satisfied
```

### 11) Open firewall ports (security group)
- In EC2 → your instance → Security → Security groups → Inbound rules → Edit:
  - Allow HTTP (port 80) from `0.0.0.0/0`.
  - Allow custom port 4000 (or your API port) from `0.0.0.0/0`.
  - SSH (22) should be restricted to your IP if possible.

### 12) (Optional) DNS records
Point your domain to the Elastic IP:
- Type `A`, Name `@`, Content `<Elastic IP>`, TTL 14400 (or provider default).

### 13) Install PM2 globally
```
sudo npm install -g pm2
pm2 -v
```

### 14) Run the app with PM2
From the `server/` directory:
```
pm2 start node --name "StorageApp" -- --env-file=.env app.js
pm2 status
```

### 15) Persist PM2 across reboots
```
pm2 save
pm2 startup
# run the command PM2 prints, e.g.:
# sudo env PATH=$PATH:/usr/local/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

### 16) Useful PM2 commands
- `pm2 list` — show processes.
- `pm2 logs StorageApp --lines 100` — tail logs.
- `pm2 restart StorageApp` — restart the app.
- `pm2 delete StorageApp` — stop and remove.
- `pm2 save` — persist current process list.

### 17) Quick verification
- `curl http://<Elastic-IP>:4000/health` (or your health route).
- Browse to `http://<Elastic-IP>:4000` or via your domain if DNS is set.

### 18) Troubleshooting
- Port blocked: re-check security group inbound rules and instance status checks.
- Process not starting: inspect `.env` values and `pm2 logs StorageApp`.
- Permission denied (SSH): ensure key path matches `IdentityFile` and has read-only permissions.
- Node version mismatch: re-run Nodesource setup for the desired major version, then `pm2 restart StorageApp`.

### 19) Maintenance tips
- Keep system updated: `sudo apt update && sudo apt upgrade -y`.
- Backup `.env` and any uploaded assets stored on the instance.
- Consider HTTPS via a reverse proxy (Nginx) and Let’s Encrypt if exposing to users.

