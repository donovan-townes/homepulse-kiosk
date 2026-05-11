# HomePulse Kiosk

HomePulse Kiosk is a local-first household dashboard designed to run as an appliance on a small Ubuntu kiosk machine. This repo starts with the smallest useful vertical slice:

- a read-only dashboard at `/`
- an admin page at `/admin`
- a local SQLite database owned by the app
- JSON APIs for items and health checks
- integration tests for the core behavior

## Development

```bash
npm install
npm run dev
```

The app listens on `http://127.0.0.1:3000` by default.

## Tests

```bash
npm test
```

## Build

```bash
npm run build
```

## Production model

- SQLite remains the runtime source of truth.
- Tailscale protects remote admin access.
- The kiosk browser loads `http://127.0.0.1:3000/`.
- The machine should run the app under `systemd`.

## Setup Guides

- `docs/WYSE_3040_SETUP.md` walks through kiosk-machine preparation from Ubuntu Server to Chromium kiosk mode.
- `docs/TEST_PLAN.md` defines the expected behavior and the next test layers to add.

## Update Flow

```bash
./scripts/update-kiosk.sh
```

The update script creates a SQLite backup before rebuilding and restarting the service.

## Environment variables

- `PORT`: HTTP port, defaults to `3000`
- `HOST`: HTTP bind address, defaults to `127.0.0.1`
- `HOMEPULSE_DATA_DIR`: override the data directory
- `HOMEPULSE_DB_PATH`: override the SQLite file path
- `HOMEPULSE_APP_VERSION`: override the reported app version
- `HOMEPULSE_ADMIN_PIN`: PIN required to unlock `/admin` and write APIs, defaults to `1234`
- `HOMEPULSE_ADMIN_SESSION_SECRET`: cookie signing secret for admin sessions
- `HOMEPULSE_ADMIN_SESSION_TTL_MINUTES`: admin session duration in minutes, defaults to `480`
- `HOMEPULSE_WEATHER_LATITUDE`: optional weather latitude for Open-Meteo
- `HOMEPULSE_WEATHER_LONGITUDE`: optional weather longitude for Open-Meteo
- `HOMEPULSE_WEATHER_TEMPERATURE_UNIT`: `fahrenheit` or `celsius`, defaults to `fahrenheit`
