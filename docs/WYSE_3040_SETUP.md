# Wyse 3040 Setup Guide

This runbook assumes you are using a Dell Wyse 3040 with Ubuntu Server already installed. The goal is to turn it into a stable kiosk appliance, not a general-purpose workstation.

## Constraints To Respect

- CPU: Intel Atom x5-Z8350
- RAM: 2 GB
- Storage: 8 GB or 16 GB eMMC

These constraints mean:

- do development and testing on your main machine
- keep the kiosk runtime small and predictable
- avoid full desktop environments
- avoid large background services unless they are essential

## Recommended Operating Model

- Main machine: code, tests, design iteration, GitHub pushes
- Kiosk machine: pull updates, run the built app, display Chromium in kiosk mode
- Network boundary: Tailscale

For the first version, do not use the kiosk as the main development box.

## Step 1: Baseline Server Prep

Run these on the kiosk machine.

```bash
sudo apt update
sudo apt upgrade -y
sudo timedatectl set-timezone America/New_York
sudo hostnamectl set-hostname homepulse-kiosk
```

If you have not added your SSH key yet, do that before continuing.

## Step 2: Install Essential Runtime Packages

The app uses Node.js and a native SQLite driver, so install the base toolchain once.

```bash
sudo apt install -y curl git build-essential python3 pkg-config sqlite3
```

Install Node.js 22 LTS from NodeSource.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## Step 3: Install And Join Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4
```

Make sure you can SSH to the machine over Tailscale before moving on.

## Step 3A: Bring Up The USB Wi-Fi Adapter (Tenda U11 Pro)

This is the safest order for first bring-up:

1. keep Ethernet connected while validating the USB adapter
2. identify whether Ubuntu already has a working driver
3. connect Wi-Fi and test reboot persistence
4. only then remove Ethernet

The Tenda page indicates Linux support, but exact chip revisions can vary by batch. Detect the actual USB device on your unit before choosing a driver path.

### 3A.1 Detect The Adapter And Driver State

```bash
lsusb
ip -br link
rfkill list
sudo dmesg | tail -n 120
```

What you want to see:

- a new USB device in `lsusb`
- a wireless interface in `ip -br link` (often `wlan0` or `wlx...`)
- no hard block in `rfkill list`

If you do not see a wireless interface, install firmware and kernel build prerequisites first:

```bash
sudo apt install -y linux-firmware linux-headers-$(uname -r) dkms build-essential
sudo reboot
```

After reboot, repeat detection commands.

### 3A.2 Connect To Wi-Fi (Preferred Minimal Path: Netplan)

If a wireless interface exists, configure it with netplan. Replace interface name, SSID, and password.

```bash
sudo tee /etc/netplan/60-wifi.yaml >/dev/null <<'EOF'
network:
  version: 2
  renderer: networkd
  wifis:
    wlan0:
      dhcp4: true
      access-points:
        "YOUR_WIFI_SSID":
          password: "YOUR_WIFI_PASSWORD"
EOF
sudo netplan generate
sudo netplan apply
ip -br addr
ping -c 3 1.1.1.1
```

If your interface is not `wlan0`, use the actual interface name shown by `ip -br link`.

### 3A.3 Alternative Connection Path (NetworkManager + nmcli)

Use this if you prefer easier interactive Wi-Fi management.

```bash
sudo apt install -y network-manager
sudo systemctl enable --now NetworkManager
nmcli device status
nmcli device wifi rescan
nmcli device wifi list
sudo nmcli device wifi connect "YOUR_WIFI_SSID" password "YOUR_WIFI_PASSWORD"
```

Do not switch network stack while remote-only over SSH unless you have a fallback console path.

### 3A.4 If Driver Is Still Missing

Capture hardware IDs and use them as the source of truth:

```bash
lsusb
sudo dmesg | grep -i -E "wlan|wifi|80211|firmware|rtl|mt76|mt79|ath"
```

Then map the USB vendor:product ID to the required Linux driver. For this model, vendor marketing pages do not reliably expose chipset details, so IDs from your machine are more trustworthy than model name alone.

Use the vendor download page only after capturing IDs:

- https://www.tendacn.com/download

If an out-of-tree driver is required, prefer a DKMS-based package so kernel upgrades do not permanently break Wi-Fi.

### 3A.5 Wi-Fi Readiness Check Before Continuing

Before continuing kiosk setup, confirm all of the following:

1. `ping -c 3 1.1.1.1` succeeds
2. `ping -c 3 github.com` succeeds
3. `tailscale status` works over Wi-Fi
4. after reboot, Wi-Fi reconnects automatically

Only after these pass should you continue with the remaining setup steps.

## Step 4: Create The Runtime User And Folders

Use a dedicated non-root user to run the app.

```bash
sudo adduser --disabled-password --gecos "" homepulse
sudo usermod -aG sudo homepulse
sudo mkdir -p /opt/homepulse-kiosk
sudo mkdir -p /var/lib/homepulse-kiosk
sudo mkdir -p /var/lib/homepulse-kiosk/backups
sudo chown -R homepulse:homepulse /opt/homepulse-kiosk /var/lib/homepulse-kiosk
```

Runtime layout:

- app code: `/opt/homepulse-kiosk`
- SQLite DB: `/var/lib/homepulse-kiosk/homepulse.db`
- backups: `/var/lib/homepulse-kiosk/backups`

Do not keep the live database inside the git working tree on the kiosk.

## Step 5: Pull The Repo Onto The Kiosk

As the `homepulse` user:

```bash
sudo -iu homepulse
cd /opt
git clone <your-github-repo-url> homepulse-kiosk
cd /opt/homepulse-kiosk
npm ci
npm run build
```

For now this is acceptable on the kiosk. If build time becomes annoying later, switch to shipping prebuilt artifacts.

## Step 6: Create The Environment File

Create `/etc/homepulse-kiosk.env`:

```bash
sudo tee /etc/homepulse-kiosk.env >/dev/null <<'EOF'
HOST=127.0.0.1
PORT=3000
HOMEPULSE_DATA_DIR=/var/lib/homepulse-kiosk
HOMEPULSE_DB_PATH=/var/lib/homepulse-kiosk/homepulse.db
HOMEPULSE_APP_VERSION=0.1.0
EOF
sudo chmod 600 /etc/homepulse-kiosk.env
```

Later you can extend this file with admin secrets and integration settings.

## Step 7: Install The systemd Service

Copy the included service template into place.

```bash
sudo cp /opt/homepulse-kiosk/deploy/homepulse-kiosk.service /etc/systemd/system/homepulse-kiosk.service
sudo systemctl daemon-reload
sudo systemctl enable --now homepulse-kiosk
sudo systemctl status homepulse-kiosk
curl http://127.0.0.1:3000/health
```

If `/health` returns JSON with `status: ok`, the service layer is ready.

## Step 8: Install The Lightweight Kiosk Display Stack

Because the Wyse 3040 is resource-constrained, use a minimal Xorg stack instead of a full desktop environment.

```bash
sudo apt install -y --no-install-recommends xorg openbox xinit x11-xserver-utils unclutter
sudo snap install chromium
```

Notes:

- Chromium on Ubuntu is commonly delivered through Snap. That is heavier than ideal, but it is the most practical first pass.
- If you discover you only have the 8 GB storage model and disk becomes tight, the next fallback is replacing Chromium with a lighter kiosk-capable browser.

## Step 9: Configure Auto-Login On tty1

Create the override directory and enable autologin for the `homepulse` user.

```bash
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d
sudo tee /etc/systemd/system/getty@tty1.service.d/override.conf >/dev/null <<'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin homepulse --noclear %I $TERM
EOF
sudo systemctl daemon-reload
```

## Step 10: Add The Kiosk Launch Script

As the `homepulse` user, create `~/.xinitrc`:

```bash
cat > ~/.xinitrc <<'EOF'
xset -dpms
xset s off
xset s noblank
unclutter -idle 1 &
openbox-session &
while ! curl -sf http://127.0.0.1:3000/health >/dev/null; do
  sleep 2
done
chromium --kiosk --incognito --disable-session-crashed-bubble --disable-infobars http://127.0.0.1:3000/
EOF
chmod +x ~/.xinitrc
```

Then add this to `~/.bash_profile`:

```bash
if [[ -z "$DISPLAY" ]] && [[ "$(tty)" = "/dev/tty1" ]]; then
  startx
fi
```

This keeps the browser from launching until the local app is healthy.

## Step 11: Reboot And Verify End-To-End

```bash
sudo reboot
```

After reboot, verify:

1. The machine auto-logs into the `homepulse` user.
2. The Node app starts under `systemd`.
3. Chromium opens in kiosk mode.
4. The display loads `http://127.0.0.1:3000/`.
5. You can reach `http://<tailscale-ip>:3000/admin` from your main machine.

## Step 12: Routine Update Flow

Use the included update script on the kiosk:

```bash
cd /opt/homepulse-kiosk
./scripts/update-kiosk.sh
```

That script backs up the database, installs dependencies, rebuilds the app, restarts the service, and verifies `/health`.

## Disk Hygiene Checklist

Run these checks on the kiosk occasionally:

```bash
df -h
du -sh /opt/homepulse-kiosk
du -sh /var/lib/homepulse-kiosk
sudo journalctl --disk-usage
snap list
```

If disk gets tight, your first levers are:

1. prune old backups
2. rotate logs more aggressively
3. avoid storing development artifacts on the kiosk
4. consider a lighter browser if Chromium becomes the largest footprint

## First Follow-Up Tasks After Basic Bring-Up

1. Add admin authentication and session timeout.
2. Add a nightly backup cron job.
3. Add a deployment version endpoint or footer in the UI.
4. Add a restore drill using a copied SQLite file.