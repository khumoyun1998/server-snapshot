# Server Snapshot

A real-time server monitoring dashboard. A lightweight Python agent (Flask + psutil)
collects system metrics — CPU, memory, disks, top processes, network — and a React
dashboard polls it every 2 seconds. If the agent is unreachable, the dashboard falls
back to mock data and shows a "mock" indicator in the header.

## Architecture

- **`server/monitor_agent.py`** — Python agent exposing `GET /api/metrics` on port 5050
- **`src/`** — React + TypeScript + Tailwind (shadcn/ui) dashboard
- **nginx** — serves the built frontend and proxies `/api` to the agent (Docker setup)

## Run with prebuilt images (no source needed)

Images for `linux/amd64` and `linux/arm64` are published to Docker Hub on every
push to `main`. On any server, copy [docker-compose.prod.yml](docker-compose.prod.yml)
and run:

```sh
DASHBOARD_PORT=8001 docker compose -f docker-compose.prod.yml up -d
# open http://<server>:8001
```

Update to the latest version at any time:

```sh
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
```

`deploy.sh` automates this over SSH (ships the compose file, pulls and restarts).

## Build and run from source

```sh
docker compose up -d --build
# open http://localhost
```

This starts two containers: nginx serving the built dashboard on port 80, and the
monitoring agent. Note: inside a container the agent sees mostly the container's
view of the system; for accurate host metrics run the agent directly on the host.

## Run locally (development)

Frontend:

```sh
npm i
npm run dev          # http://localhost:8080
```

Agent:

```sh
python3 -m venv venvserver
source venvserver/bin/activate
pip install -r server/requirements.txt
python server/monitor_agent.py       # http://localhost:5050
```

## Telegram alerts & remote status (optional)

The agent can send Telegram alerts when CPU / memory / disk cross thresholds
(with recovery messages) and answer `/status` in chat — so you can check the
server from your phone without opening the dashboard. Every message carries an
"Open dashboard" button when `DASHBOARD_URL` is set.

Create a bot with [@BotFather](https://t.me/BotFather), find your chat id with
[@userinfobot](https://t.me/userinfobot), then put these into `.env` next to
the compose file:

| Variable | Meaning | Default |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | bot token (empty = feature disabled) | — |
| `TELEGRAM_CHAT_ID` | chat that receives alerts and may use commands | — |
| `DASHBOARD_URL` | link for the inline dashboard button | — |
| `ALERT_CPU` / `ALERT_MEM` | percent thresholds | 90 |
| `ALERT_DISK` | percent threshold | 85 |
| `ALERT_COOLDOWN` | seconds between repeat alerts | 1800 |
| `WATCH_PROCESSES` | comma-separated process names to watch (e.g. `dockerd,ngrok,sshd`); Telegram alerts fire when one disappears | — |

The dashboard also shows all Docker containers with per-container CPU/memory
when the Docker socket is mounted (see `docker-compose.prod.yml`; remove the
volume to disable).

Login sessions: with `/var/run/utmp` mounted (see compose), the dashboard
lists active sessions (user, source IP, terminal, time) and Telegram gets a
🔵 alert on every new login and ⚪️ when a session closes.

## Multiple servers

The header shows a server selector when `servers.json` lists more than one
entry. Mount your own file into the frontend container:

```json
[
  { "name": "home", "url": "" },
  { "name": "vps-1", "url": "https://vps1.example.com:8001" }
]
```

```yaml
    volumes:
      - ./servers.json:/usr/share/nginx/html/servers.json:ro
```

Each URL must point at a reachable dashboard/agent (CORS is enabled on the
agent), `""` means the server this dashboard is served from.

### Telegram Web App via ngrok

To open the dashboard inside Telegram from anywhere (no VPN), expose it over
HTTPS with the bundled ngrok service. Claim your free static domain at
[dashboard.ngrok.com](https://dashboard.ngrok.com/domains), then add to `.env`:

```env
COMPOSE_PROFILES=ngrok
NGROK_AUTHTOKEN=<your token>
NGROK_DOMAIN=<your-name>.ngrok-free.app
DASHBOARD_URL=https://<your-name>.ngrok-free.app
```

`docker compose up -d` then also starts the tunnel; the bot's "Open dashboard"
button becomes a Telegram Web App (opens in-app). ⚠️ The tunnel makes the
dashboard publicly reachable to anyone who knows the URL — treat the URL as a
secret until authentication is added.

## Tests

```sh
npm test
```

## CI/CD

Pushing to `main` triggers a GitHub Actions workflow that builds and pushes both
Docker images to Docker Hub (`hxolmetov/server-snapshot` and
`hxolmetov/server-snapshot-agent`). Requires `DOCKER_USERNAME` and
`DOCKER_PASSWORD` repository secrets.

## Technologies

- Vite 8, TypeScript, React 18
- shadcn/ui, Tailwind CSS
- Python 3, Flask, psutil, gunicorn
- Docker, nginx, GitHub Actions
