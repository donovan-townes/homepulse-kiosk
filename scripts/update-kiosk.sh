#!/usr/bin/env bash

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${HOMEPULSE_DATA_DIR:-/var/lib/homepulse-kiosk}"
DB_PATH="${HOMEPULSE_DB_PATH:-$DATA_DIR/homepulse.db}"
BACKUP_DIR="$DATA_DIR/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [[ -f "$DB_PATH" ]]; then
  cp "$DB_PATH" "$BACKUP_DIR/homepulse-$TIMESTAMP.db" \
    || echo "Warning: backup skipped (permission error) — fix ownership with: sudo chown -R homepulse:homepulse $DATA_DIR"
fi

cd "$APP_DIR"

git pull

npm ci
npm run build
npm prune --omit=dev

sudo /usr/bin/systemctl restart homepulse-kiosk

curl --fail --silent http://127.0.0.1:3000/health >/dev/null
echo "HomePulse kiosk updated successfully"