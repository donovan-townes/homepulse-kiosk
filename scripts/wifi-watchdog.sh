#!/usr/bin/env bash

set -euo pipefail

LOG_TAG="homepulse-wifi-watchdog"
PING_TARGET="${HOMEPULSE_WIFI_PING_TARGET:-1.1.1.1}"
WIFI_CONNECTION="${HOMEPULSE_WIFI_CONNECTION:-}"

log_message() {
  local message="$1"
  if command -v logger >/dev/null 2>&1; then
    logger -t "$LOG_TAG" "$message"
  fi
  echo "$message"
}

if ! command -v nmcli >/dev/null 2>&1; then
  log_message "nmcli not available; skipping Wi-Fi watchdog run"
  exit 0
fi

if [[ -z "$WIFI_CONNECTION" ]]; then
  WIFI_CONNECTION="$(nmcli -t -f NAME,TYPE connection show | awk -F: '$2 == "802-11-wireless" { print $1; exit }')"
fi

if [[ -z "$WIFI_CONNECTION" ]]; then
  log_message "No Wi-Fi connection profile found"
  exit 1
fi

if ping -c 1 -W 2 "$PING_TARGET" >/dev/null 2>&1; then
  exit 0
fi

CURRENT_STATE="$(nmcli -t -f STATE general | head -n 1 || true)"
if [[ "$CURRENT_STATE" == "connected" ]]; then
  log_message "Wi-Fi is connected but upstream ping failed; recycling connection $WIFI_CONNECTION"
else
  log_message "Wi-Fi appears offline; attempting reconnect for $WIFI_CONNECTION"
fi

nmcli connection down "$WIFI_CONNECTION" >/dev/null 2>&1 || true
sleep 2
nmcli connection up "$WIFI_CONNECTION"

if ping -c 1 -W 2 "$PING_TARGET" >/dev/null 2>&1; then
  log_message "Wi-Fi reconnect succeeded for $WIFI_CONNECTION"
  exit 0
fi

log_message "Wi-Fi reconnect attempted but upstream ping still failed"
exit 1
