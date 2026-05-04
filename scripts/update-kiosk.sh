#!/usr/bin/env bash

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${HOMEPULSE_DATA_DIR:-/var/lib/homepulse-kiosk}"
DB_PATH="${HOMEPULSE_DB_PATH:-$DATA_DIR/homepulse.db}"
BACKUP_DIR="$DATA_DIR/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [[ -f "$DB_PATH" ]]; then
  cp "$DB_PATH" "$BACKUP_DIR/homepulse-$TIMESTAMP.db"
fi

cd "$APP_DIR"

npm ci
npm run build

if command -v sudo >/dev/null 2>&1; then
  sudo systemctl restart homepulse-kiosk
else
  systemctl restart homepulse-kiosk
fi

curl --fail --silent http://127.0.0.1:3000/health >/dev/null
echo "HomePulse kiosk updated successfully"