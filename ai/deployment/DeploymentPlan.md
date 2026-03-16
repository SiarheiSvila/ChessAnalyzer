# Deployment Plan — AWS EC2 (Always-on, private access)

Date: 2026-03-16

## Objective
Deploy ChessNpm to AWS EC2 as an always-on single-instance service, reachable from any of your devices, while keeping the app private (not publicly accessible).

## Requirements (from request)
- Always-on hosting in cloud
- Accessible from any device you own
- Restricted so only you can access it
- Keep architecture simple for MVP operations

## Recommended architecture (MVP)
1. **EC2 instance (Ubuntu 24.04 LTS, t3.small or t3.medium)** in a public subnet
2. **ChessNpm app as a systemd service** (auto-start + auto-restart)
3. **Stockfish binary on the EC2 host** and configured via `.env`
4. **Local persistent storage** on attached EBS volume (`ANALYSIS_STORAGE_DIR`)
5. **Tailscale on EC2** for private device-to-server connectivity
6. **No public inbound app port** in EC2 Security Group

Why this architecture:
- "Only me" is enforced by device/user identity in your private tailnet
- Works on laptop + phone without chasing changing IP addresses
- Keeps deployment much simpler than full AWS VPN stack for single-user use

## Network and security baseline
- EC2 Security Group inbound:
  - `22/tcp` from your current admin IP only (or use SSM instead of SSH)
  - **No inbound 3000 from Internet**
- App binds to localhost or all interfaces; access is controlled by not exposing public ports and using Tailscale network path
- Enable host firewall (`ufw`) and allow only SSH + Tailscale

## Server provisioning steps
1. Launch EC2
   - AMI: Ubuntu Server 24.04 LTS
   - Instance: `t3.small` (start here)
   - Storage: 30+ GB gp3
   - IAM role: CloudWatchAgentServerPolicy (optional for logs)
2. Connect and install runtime
   - Node.js 20 LTS
   - npm
   - Stockfish (`apt install stockfish` or custom binary)
3. Deploy application code
   - Clone repo
   - `npm install`
   - `npm run build`
4. Configure environment
   - Create `.env` with:
     - `PORT=3000`
     - `STOCKFISH_PATH=/usr/games/stockfish` (or actual path)
     - `ANALYSIS_STORAGE_DIR=/var/lib/chessnpm/analyses`
5. Prepare directories
   - `sudo mkdir -p /var/lib/chessnpm/analyses`
   - `sudo chown -R ubuntu:ubuntu /var/lib/chessnpm`

## Process management (systemd)
Create `/etc/systemd/system/chessnpm.service`:

```ini
[Unit]
Description=ChessNpm Analyzer
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/ChessNpm
Environment=NODE_ENV=production
EnvironmentFile=/home/ubuntu/ChessNpm/.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable chessnpm
sudo systemctl start chessnpm
sudo systemctl status chessnpm
```

## Private access setup (recommended)
Install and authenticate Tailscale on EC2:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Then:
- Install Tailscale app on your laptop/phone
- Sign in with your single identity provider account
- Access server via Tailnet IP or MagicDNS name on port `3000`
- Optionally run `tailscale serve` for HTTPS inside your tailnet

## Operations checklist
- Health check: `curl http://127.0.0.1:3000/health`
- App logs: `journalctl -u chessnpm -f`
- Restart app: `sudo systemctl restart chessnpm`
- Upgrade flow:
  1. `git pull`
  2. `npm install`
  3. `npm run build`
  4. `sudo systemctl restart chessnpm`

## Backup and resilience (minimal)
- Enable EBS snapshots for instance volume daily
- Keep `ANALYSIS_STORAGE_DIR` under a path covered by snapshots
- Optional: copy analysis JSON files periodically to S3

## Cost and scaling notes
- Single EC2 instance is enough for personal use
- Start with `t3.small`; move to `t3.medium` if deep analysis latency is high
- This is single-instance architecture; no load balancer needed for now

## Exit criteria
- Service survives reboot and process crashes (`systemd` restart verified)
- App health endpoint returns OK
- App is reachable from your own devices via Tailscale
- App is not reachable from public Internet on app port
