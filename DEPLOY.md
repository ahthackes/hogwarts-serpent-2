# Free public hosting

The two realistic free options for this game are:

| Option | Cost | Persistent SQLite | Stays online when your PC is off | Difficulty |
| --- | --- | --- | --- | --- |
| **Oracle Cloud Always Free** | $0 | Yes | Yes | Medium |
| **Tailscale Funnel** | $0 | Yes, on the host PC | No | Easy |
| Render free web service | $0 | **No** | No; sleeps | Easy, but unsuitable |
| Railway / Koyeb / Fly free tiers | Usually no reliable free tier | Sometimes | Varies | Not recommended here |

**Recommendation:** use **Oracle Cloud Always Free** if you do not have a
computer that can stay on 24/7. It gives you a real Linux VM and a persistent
disk, so `data/game.db` survives reboots and redeploys.

If you do have an old PC, laptop, or Raspberry Pi that can stay powered on,
**Tailscale Funnel** is the fastest option and needs no domain or cloud account.

## Option A: Oracle Cloud Always Free (recommended)

Oracle's Always Free tier includes an always-on VM, 200 GB of block storage,
and 10 TB/month of outbound traffic. This is enough for this game.

### 1. Create the VM

1. Create an Oracle Cloud account and stay in your home region.
2. Open **Compute → Instances → Create instance**.
3. Choose **Ubuntu 24.04**.
4. Prefer the **VM.Standard.A1.Flex** shape (Arm) with 2 OCPUs and 12 GB RAM.
   The `VM.Standard.E2.1.Micro` shape also works for a small private game.
5. Assign a **public IPv4 address**.
6. Use a 50 GB boot volume (the default is fine).
7. Download the SSH private key and note the public IP.

Oracle may show "out of host capacity" for the free Arm shape. Try another
availability domain, or use the AMD micro shape while waiting.

### 2. Open the firewall

In the OCI console, open the subnet's **Security List** (or NSG) and add ingress
rules:

- TCP `80` from `0.0.0.0/0` (needed for the HTTPS certificate)
- TCP `443` from `0.0.0.0/0`
- TCP `22` only from your own IP, if possible

Then connect over SSH and enable the Ubuntu firewall:

```bash
sudo apt update
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

If HTTPS still cannot connect, OCI's Ubuntu images sometimes have their own
iptables rules. Add the same two rules there as well:

```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### 3. Get a free hostname

The easiest free option is [DuckDNS](https://www.duckdns.org/):

1. Sign in and create a subdomain, for example `hogwarts-serpent`.
2. Set its current IP to your Oracle VM's public IPv4 address.
3. On the VM, install a tiny updater so the DNS record follows the VM:

```bash
sudo mkdir -p /opt/duckdns
sudo tee /opt/duckdns/update.sh >/dev/null <<'EOF'
#!/bin/sh
curl -fsS "https://www.duckdns.org/update?domains=YOUR_SUBDOMAIN&token=YOUR_TOKEN&ip=" >/dev/null
EOF
sudo chmod +x /opt/duckdns/update.sh
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/duckdns/update.sh") | crontab -
```

Replace `YOUR_SUBDOMAIN` and `YOUR_TOKEN` with the values from DuckDNS. Your
URL will be `https://YOUR_SUBDOMAIN.duckdns.org`.

If you already own a domain, create an `A` record pointing at the VM instead.

### 4. Copy the game to the VM

On your Windows machine, make a consistent copy of the existing database:

```powershell
python -c "import sqlite3; s=sqlite3.connect(r'data/game.db'); d=sqlite3.connect('game-backup.db'); s.backup(d); d.close(); s.close()"
```

Copy the application and that backup to the VM:

```powershell
scp index.html styles.css skins.json server.py ubuntu@YOUR_VM_IP:/tmp/
scp -r src deploy ubuntu@YOUR_VM_IP:/tmp/
scp game-backup.db ubuntu@YOUR_VM_IP:/tmp/
```

On the VM:

```bash
sudo apt update
sudo apt install -y python3 rsync curl

sudo useradd --system --user-group \
  --home /opt/hogwarts-serpent \
  --shell /usr/sbin/nologin hogwarts || true

sudo mkdir -p /opt/hogwarts-serpent /var/lib/hogwarts-serpent
sudo mv /tmp/index.html /tmp/styles.css /tmp/skins.json /tmp/server.py /opt/hogwarts-serpent/
sudo mv /tmp/src /tmp/deploy /opt/hogwarts-serpent/
sudo install -o hogwarts -g hogwarts -m 600 /tmp/game-backup.db /var/lib/hogwarts-serpent/game.db
sudo chown -R hogwarts:hogwarts /opt/hogwarts-serpent
sudo chown hogwarts:hogwarts /var/lib/hogwarts-serpent
sudo chmod 700 /var/lib/hogwarts-serpent
```

If you intentionally want a fresh database instead, skip the `game-backup.db`
line; the server creates and seeds a new one on first start.

### 5. Run the game as a service

Create the environment file:

```bash
sudo tee /etc/hogwarts-serpent.env >/dev/null <<'EOF'
HPS_HOST=127.0.0.1
HPS_PORT=8123
HPS_DATA=/var/lib/hogwarts-serpent
HPS_SECURE_COOKIE=1
HPS_TRUST_PROXY=1
EOF
sudo chown root:root /etc/hogwarts-serpent.env
sudo chmod 600 /etc/hogwarts-serpent.env
```

Install the service unit:

```bash
sudo cp /opt/hogwarts-serpent/deploy/hogwarts-serpent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hogwarts-serpent
sudo systemctl status hogwarts-serpent --no-pager
```

The server must listen on `127.0.0.1`, not `0.0.0.0`, because Caddy is the only
process that should be exposed to the internet.

### 6. Add HTTPS with Caddy

Install Caddy from its official repository:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Edit `/etc/caddy/Caddyfile`:

```caddyfile
hogwarts-serpent.duckdns.org {
    encode gzip
    reverse_proxy 127.0.0.1:8123
}
```

Then:

```bash
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

Caddy obtains and renews a free Let's Encrypt certificate automatically. DNS
must already point at the VM and ports 80/443 must be open.

### 7. Verify it

Open:

```text
https://hogwarts-serpent.duckdns.org
```

Check:

- The page loads over HTTPS.
- Registration and login work.
- Play a level, then refresh and confirm progress/coins are still there.
- Restart the game service and confirm the account still works:

```bash
sudo systemctl restart hogwarts-serpent
```

- Test from a phone on cellular data, not just your home Wi-Fi.

Admin account: on a brand-new database the admin user (`aht` by default, change
it with `HPS_ADMIN_USER`) is created with the maintainer's built-in credential,
which exists in the code only as a salted one-way hash. To choose your own, set
`HPS_ADMIN_PASSWORD` before the first start. Whatever you use, change it from
**Account → Change Password** after the first sign-in on any public deployment.

Players who forget their password use **Forgot your password?** on the sign-in
screen. The admin gets an alert (bell + Admin button), opens **Admin → Password
requests**, sets or generates a temporary password and passes it on privately.
The player must choose a new password at next sign-in.

Only `index.html`, `styles.css` and `src/*.js` are served to browsers. The
server code, `skins.json`, `deploy/` and `data/` are never reachable by URL.

### 8. Backups

The repository includes `deploy/hogwarts-backup.sh`. Install it and schedule a
daily backup:

```bash
sudo install -m 755 /opt/hogwarts-serpent/deploy/hogwarts-backup.sh /usr/local/bin/hogwarts-backup
sudo /usr/local/bin/hogwarts-backup
(crontab -l 2>/dev/null; echo "15 3 * * * /usr/local/bin/hogwarts-backup") | crontab -
```

Backups go to `/var/backups/hogwarts-serpent` and older files are removed after
14 days. Keep backups private: they contain password hashes and account data.

### 9. The Oracle idle-reclamation caveat

Oracle may reclaim an Always Free VM if, over 7 days, CPU is below 20%,
network is below 20%, and (on Arm) memory is below 20%. A small game that is
idle most of the day can meet those conditions.

Options:

- Accept the small risk and keep backups, so you can recreate the VM.
- Upgrade the account to **Pay As You Go** and stay inside the Always Free
  limits, with budget alerts enabled. Oracle says Always Free resources remain
  free after upgrading.
- Use Tailscale Funnel from an always-on PC instead.

Do not rely on a tiny cron job or health check to prevent reclamation; it is
not a guaranteed workaround.

## Option B: Tailscale Funnel (easiest if you have an always-on PC)

Use this if you have an old laptop, desktop, or Raspberry Pi that can stay
powered on and connected. Tailscale Funnel is free on all plans and gives you a
stable HTTPS URL ending in `*.ts.net`; no router port forwarding or domain is
needed.

1. Install Tailscale on the host and sign in.
2. In the Tailscale admin console, enable **HTTPS** and **Funnel**.
3. Start the game on the host, bound to localhost:

   Linux/macOS:

   ```bash
   HPS_HOST=127.0.0.1 HPS_PORT=8123 HPS_SECURE_COOKIE=1 python3 server.py
   ```

   Windows PowerShell:

   ```powershell
   $env:HPS_HOST = "127.0.0.1"
   $env:HPS_PORT = "8123"
   $env:HPS_SECURE_COOKIE = "1"
   python server.py
   ```

4. Expose port 8123:

   ```bash
   tailscale funnel --bg 8123
   ```

   The command prints a URL such as
   `https://your-machine.your-tailnet.ts.net`.

5. Open that URL from a phone or another network and verify login and saves.

Notes:

- The host must stay on, awake, and connected. Disable sleep and set the
  Tailscale service and game server to start at boot.
- Funnel is currently beta and has non-configurable bandwidth limits.
- Keep the game bound to `127.0.0.1`; only Funnel should be public.
- Set `HPS_TRUST_PROXY=1` only if you have confirmed the proxy forwards
  `X-Forwarded-For`; otherwise leave it at `0`.

## Why not Render/Railway/Koyeb/Fly free?

- **Render free** web services sleep after inactivity and use an ephemeral
  filesystem. A local SQLite database would be lost on restart or redeploy.
- Free plans generally do not provide a persistent disk. This app stores
  accounts and progress in SQLite, so it needs one.
- Free tiers change frequently. Do not build on a free tier that cannot attach
  persistent storage.

## Option C: PythonAnywhere (simple, no server admin)

1. Upload the project folder, for example to `/home/<you>/mysite/` (keep `src/`).
2. **Web** tab → *Add a new web app* → *Manual configuration* → Python 3.10 or newer.
3. Edit the WSGI file so it contains:

   ```python
   import os, sys
   sys.path.insert(0, "/home/<you>/mysite")
   os.environ["HPS_DATA"] = "/home/<you>/mysite/data"
   os.environ["HPS_SECURE_COOKIE"] = "1"
   os.environ["HPS_TRUST_PROXY"] = "1"
   # optional: os.environ["HPS_ADMIN_PASSWORD"] = "choose-your-own"
   from server import app as application
   ```

4. Do **not** add a *Static files* mapping that points at the project folder; the
   app serves only the files it needs.
5. Press **Reload**. Visit `/api/health` to confirm the app is running.

PythonAnywhere has no WebSockets, so challenge matches use short polling; they
work, but a slow connection adds a little delay. Free accounts also have a daily
CPU allowance.

## Public-deployment security checklist

- Use HTTPS and set `HPS_SECURE_COOKIE=1`.
- Set `HPS_TRUST_PROXY=1` only behind a trusted reverse proxy.
- Keep `HPS_DATA` outside the web root and never expose `server.py` or `data/`.
- Change the admin password (Account → Change Password) before announcing the URL.
- Keep ports 80/443 open, but do not expose port 8123 publicly.
- Back up `game.db` regularly.
- Remember that gameplay is client-authoritative; the server protects accounts,
  coins, shop ownership, transfers, and admin actions, but it is not a full
  anti-cheat system.
