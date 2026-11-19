#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "=== SeaCraft Installer ==="
echo "Install directory: $APP_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js (>=20) is required." >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: Python 3 is required." >&2
  exit 1
fi

if command -v apt-get >/dev/null 2>&1 && [ "$(id -u)" -eq 0 ]; then
  echo "[1/5] Checking OS packages (tesseract-ocr, sane-airscan, python3-pil)..."
  apt-get update -qq || true
  apt-get install -y -qq tesseract-ocr tesseract-ocr-ell tesseract-ocr-eng sane-airscan python3-pil || true
fi

echo "[2/5] Preparing config & storage directories..."
if [ ! -f "$APP_DIR/config.json" ]; then
  cp "$APP_DIR/config.example.json" "$APP_DIR/config.json"
fi
mkdir -p "$APP_DIR/storage/libraries/My Workspace/.history"
chmod -R 0777 "$APP_DIR/storage" || true

echo "[3/5] Installing ArtCraft (storytold) WASM web apps..."
python3 "$APP_DIR/scripts/install_craft_apps.py"

if [ "$(id -u)" -eq 0 ] && command -v systemctl >/dev/null 2>&1; then
  echo "[4/5] Installing systemd services (seacraft-portal & seacraft-sync)..."
  NODE_BIN="$(command -v node)"

  cat > /etc/systemd/system/seacraft-portal.service <<EOF
[Unit]
Description=SeaCraft Web Portal
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN $APP_DIR/portal_server.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

  cat > /etc/systemd/system/seacraft-sync.service <<EOF
[Unit]
Description=SeaCraft Sync Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN $APP_DIR/sync_client.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable seacraft-portal seacraft-sync
  systemctl restart seacraft-sync seacraft-portal
  echo "[5/5] Done! SeaCraft is running on http://0.0.0.0:3001"
else
  echo "[4/5] Non-root or no systemd detected; start manually with: npm start"
fi
