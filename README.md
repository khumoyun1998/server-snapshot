# Server Snapshot

A lightweight, self-hostable server monitoring system: a small Python **agent**
collects system metrics on each machine, a React **dashboard** shows them live,
and — when you run the separate **central monitor** — you get Telegram alerts
including *whole-machine down* detection that a box can never report about itself.

No SaaS, no account, no database. Prebuilt multi-arch images (amd64 + arm64),
configured entirely with environment variables.

---

## Features

- **Live metrics** — CPU (per-core, temp, load), memory + swap, disks, network,
  top processes by CPU/memory.
- **History charts** — CPU / memory / network over 15m · 1h · 6h · 24h.
- **Docker panel** — every container with per-container CPU and memory.
- **Watched processes** — named host processes (e.g. `dockerd`, `sshd`) with a
  status badge; alert when one disappears.
- **Login sessions** — who is logged in, from which IP, since when; alert on each
  new login.
- **Telegram alerts** — thresholds (CPU/mem/disk), process down, new login, and
  **server DOWN/UP** with downtime. `/status` summarises every server on demand.
  Alerts can broadcast to a **channel** for a whole team.
- **Multi-server** — one dashboard and one bot watch many agents.
- **Graceful fallback** — if an agent is unreachable the dashboard shows mock data
  with a "mock" badge instead of breaking.

---

## Architecture

```
        ┌─────────────────────────────┐        ┌──────────────────────────────┐
        │  MONITORED MACHINE (agent)  │        │   ALWAYS-ON HOST (monitor)   │
        │                             │  poll  │                              │
        │  monitor_agent.py  :5050    │◀───────│  monitor_service.py          │
        │   /api/metrics              │  (HTTP │   → Telegram alerts + /status│
        │   /api/history              │   over │  dashboard (nginx, proxies   │
        │   /api/watch                │   VPN) │   /api to the agent)         │
        └─────────────────────────────┘        └──────────────────────────────┘
```

**Components**

| Path | What it is |
|---|---|
| `server/monitor_agent.py` | Flask + psutil agent; serves the metrics API (and the built dashboard when run all-in-one) |
| `server/docker_stats.py` | reads the Docker socket for container stats |
| `server/telegram_bot.py` | Telegram transport: alert sending, `/status` command loop |
| `server/monitor_service.py` | central monitor — polls remote agents, down-detection, alerts, `/status` |
| `src/` | React + TypeScript + Tailwind (shadcn/ui) dashboard |
| `nginx.conf` | all-in-one nginx: serves the dashboard, proxies `/api` to the local agent |
| `nginx.monitor.conf` | monitor-host nginx: proxies `/api` to a *remote* agent (works over https) |

**Agent API**

| Endpoint | Returns |
|---|---|
| `GET /api/metrics` | server info, CPU, memory, disks, processes, network |
| `GET /api/history?minutes=N` | downsampled CPU/mem/disk % and network KB/s for the last N minutes (24h in-memory ring buffer) |
| `GET /api/watch` | watched processes, Docker containers, login sessions |

**Images** (built for `linux/amd64` + `linux/arm64` on every push to `main`):
`hxolmetov/server-snapshot` (dashboard) and `hxolmetov/server-snapshot-agent`
(agent + monitor — same image, different command).

---

## Which deployment do you want?

| Goal | Use |
|---|---|
| Watch **one machine**, dashboard on that machine | **A. All-in-one** |
| Be alerted when a **machine goes down** (the real use case) | **B. Split: agent + central monitor** |
| One dashboard/bot for **several machines** | B + [Multiple servers](#multiple-servers) |

> **Why split?** An alerter running on the monitored box dies with it, so it can
> never tell you the box is down. The central monitor runs elsewhere (a cheap
> always-on VPS) and reports a machine as DOWN when its agent stops answering.

---

## A. All-in-one (single machine)

Dashboard + agent on one host. Copy `docker-compose.prod.yml` and:

```sh
DASHBOARD_PORT=8001 docker compose -f docker-compose.prod.yml up -d
# open http://<host>:8001
```

Update any time:

```sh
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
```

`deploy.sh` automates this over SSH. To build from source instead of pulling:
`docker compose up -d --build`.

---

## B. Split: agents + central monitor

**On each monitored machine** — agent only (`docker-compose.agent.yml`). No
Telegram here: a bot token may be long-polled from only one place, and that
place is the monitor.

```sh
AGENT_PORT=8001 docker compose -f docker-compose.agent.yml up -d
```

The agent must be reachable by the monitor over a private network — [ZeroTier](https://zerotier.com)
or a WireGuard/Tailscale mesh works well and needs no public port.

**On the always-on host** (`docker-compose.monitor.yml`) — dashboard + monitor
(+ optional ngrok). Create `.env` next to the compose file:

```env
MONITOR_AGENTS=home=http://10.0.0.10:8001
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=<your user id>
DASHBOARD_URL=https://your-domain
```

```sh
cp servers.example.json servers.json    # see "Multiple servers"
docker compose -f docker-compose.monitor.yml up -d
```

The monitor sends 🔴 **Server DOWN** after `MONITOR_FAILS` failed polls and 🟢
**Server UP** with the downtime when it returns, plus threshold / watched-process
/ new-login alerts gathered remotely. `nginx.monitor.conf` proxies the dashboard's
`/api` to the agent so the dashboard works over https with no mixed-content — set
`servers.json` url to `""` to use that proxy.

---

## Multiple servers

List every agent in `MONITOR_AGENTS` (the monitor) and in `servers.json` (the
dashboard's server selector):

```env
MONITOR_AGENTS=home=http://10.0.0.10:8001,vps2=http://10.0.0.11:8001
```

```json
[
  { "name": "home", "url": "" },
  { "name": "vps2", "url": "https://vps2.example.com" }
]
```

`url: ""` uses the monitor host's own `/api` proxy; a full URL points the browser
directly at another dashboard/agent (CORS is enabled on the agent). More than one
entry shows a dropdown in the header.

---

## Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather) → get the **token**.
2. Get your numeric **chat id** from [@userinfobot](https://t.me/userinfobot).
3. Put `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the monitor's `.env`.

**Commands** (from any allowed user, in a private chat with the bot):
`/status` — every server's CPU/mem/disk at a glance; `/help`.

**Team alerts → a channel.** To broadcast alerts to a group instead of one
person, create a Telegram channel, add the bot as an **admin**, get the channel
id (e.g. `-1001234567890`), and set:

```env
TELEGRAM_ALERT_CHAT=-1001234567890      # alerts go here (channel/group)
TELEGRAM_ALLOWED_IDS=111111,222222      # who may run /status (optional; default = owner)
```

Alerts then post to the channel (everyone subscribed sees them); commands still
come from allowed users privately.

**In-Telegram dashboard (Web App).** Expose the dashboard over https with the
bundled ngrok service so the "Open dashboard" button opens inside Telegram:

```env
COMPOSE_PROFILES=ngrok
NGROK_AUTHTOKEN=<token>
NGROK_DOMAIN=<name>.ngrok-free.app     # a free static domain
DASHBOARD_URL=https://<name>.ngrok-free.app
```

---

## Configuration reference

**Agent** (`docker-compose.agent.yml` / `docker-compose.prod.yml`)

| Variable | Meaning | Default |
|---|---|---|
| `AGENT_PORT` / `DASHBOARD_PORT` | host port | 8001 / 8080 |
| `WATCH_PROCESSES` | comma list of process names to watch | `dockerd,sshd` |

Mount `/var/run/docker.sock:ro` for the container panel and `/var/run/utmp:ro`
for login sessions (both already in the compose files).

**Monitor** (`docker-compose.monitor.yml`)

| Variable | Meaning | Default |
|---|---|---|
| `MONITOR_AGENTS` | `name=url` comma list of agents to poll | — |
| `MONITOR_INTERVAL` | seconds between polls | 30 |
| `MONITOR_FAILS` | failed polls before DOWN | 2 |
| `TELEGRAM_BOT_TOKEN` | bot token (empty = Telegram off) | — |
| `TELEGRAM_CHAT_ID` | owner chat (alerts + commands) | — |
| `TELEGRAM_ALERT_CHAT` | override alert target (channel id) | = chat id |
| `TELEGRAM_ALLOWED_IDS` | user ids allowed to run commands | = chat id |
| `DASHBOARD_URL` | link for the "Open dashboard" button | — |
| `ALERT_CPU` / `ALERT_MEM` | percent thresholds | 90 |
| `ALERT_DISK` | percent threshold | 85 |
| `ALERT_COOLDOWN` | seconds between repeat alerts | 1800 |
| `NGROK_AUTHTOKEN` / `NGROK_DOMAIN` | with `COMPOSE_PROFILES=ngrok` | — |

With no bot token the monitor runs in **dry-run**: alerts print to stdout.

---

## Security

- The dashboard and API have **no authentication** — anyone who can reach the URL
  can read metrics. Keep it on a private network, or treat the ngrok URL as a
  secret, until you add auth (nginx basic-auth or ngrok's built-in OAuth).
- The agent reads the Docker socket **read-only** (list + stats, no control).
- Secrets live only in `.env` files next to the compose files (git-ignored);
  never bake them into images.

---

## Development

```sh
npm i && npm run dev          # dashboard at http://localhost:8080
npm test                      # vitest
npm run build                 # production build

python3 -m venv venvserver && source venvserver/bin/activate
pip install -r server/requirements.txt
python server/monitor_agent.py    # agent at http://localhost:5050
```

**CI/CD** — pushing to `main` builds and pushes both multi-arch images to Docker
Hub (needs `DOCKER_USERNAME` / `DOCKER_PASSWORD` repo secrets). Add `[skip ci]`
to a commit message for docs-only changes.

## Tech stack

Vite · React 18 · TypeScript · Tailwind / shadcn-ui · Recharts — Python 3 · Flask
· psutil · gunicorn — Docker · nginx · GitHub Actions.
