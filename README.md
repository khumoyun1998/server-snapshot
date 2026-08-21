# Server Snapshot

A lightweight, self-hostable server monitoring system: a small Python **agent**
collects system metrics on each machine, a React **dashboard** shows them live,
and a separate **central monitor** sends Telegram alerts — including
*whole-machine down* detection that a box can never report about itself.

Prebuilt multi-arch images (amd64 + arm64), configured entirely with environment
variables. No account, no database.

---

## Features

- **Live metrics** — CPU (per-core, temp, load), memory + swap, disks, network,
  top processes by CPU/memory.
- **History charts** — CPU / memory / network over 15m · 1h · 6h · 24h.
- **Docker panel** — every container with per-container CPU and memory.
- **Watched processes** — named host processes with a status badge; alert when
  one disappears.
- **Login sessions** — who is logged in, from which IP, since when; alert on each
  new login.
- **Telegram alerts** — CPU/mem/disk thresholds, process down, new login, service
  health, and **server DOWN/UP** with downtime. `/status` shows every server on
  demand; alerts can broadcast to a channel or group for a whole team.
- **Multi-server** — one dashboard and one bot watch many agents.

---

## Architecture

```
  MONITORED MACHINE (agent)              ALWAYS-ON HOST (monitor)
  ┌──────────────────────┐   poll over  ┌────────────────────────────┐
  │ agent  :5050          │◀─ private ───│ monitor → Telegram alerts  │
  │  /api/metrics         │    network   │ dashboard (nginx)          │
  │  /api/history /watch  │              └────────────────────────────┘
  └──────────────────────┘
```

Run everything on one machine (**all-in-one**), or split the agent onto each
monitored machine and the monitor onto an always-on host so it can report a
machine as **DOWN** — an alerter running on the dead box can't do that itself.

Prebuilt images: `hxolmetov/server-snapshot` (dashboard) and
`hxolmetov/server-snapshot-agent` (agent + monitor, same image, different command).

---

## A. All-in-one (one machine)

Copy `docker-compose.prod.yml` and run:

```sh
DASHBOARD_PORT=8001 docker compose -f docker-compose.prod.yml up -d
# open http://<host>:8001
```

Update any time:

```sh
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
```

To build from source instead of pulling: `docker compose up -d --build`.

---

## B. Split: agent + central monitor

**On each monitored machine** — agent only (`docker-compose.agent.yml`):

```sh
AGENT_PORT=8001 docker compose -f docker-compose.agent.yml up -d
```

The agent must be reachable by the monitor over a private network — [ZeroTier](https://zerotier.com),
WireGuard or Tailscale works well and needs no public port. (No Telegram on the
agent: a bot token can be polled from only one place — the monitor.)

**On the always-on host** — dashboard + monitor (`docker-compose.monitor.yml`).
Create a `.env` next to the compose file:

```env
MONITOR_AGENTS=srv1=http://10.0.0.10:8001
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=<your user id>
DASHBOARD_URL=https://your-domain
```

```sh
cp servers.example.json servers.json
docker compose -f docker-compose.monitor.yml up -d
```

The monitor sends 🔴 **Server DOWN** after `MONITOR_FAILS` failed polls and 🟢
**Server UP** (with downtime) when it returns, plus threshold, watched-process and
new-login alerts gathered remotely. `nginx.monitor.conf` proxies the dashboard's
`/api` to the agent so it works over https with no mixed-content — set the
`servers.json` url to `""` to use that proxy.

**Service health checks** — `HTTP_CHECKS=web=http://10.0.0.10:8000,api=https://…`
makes the monitor GET each URL every cycle and alert on 5xx / unreachable /
timeout (a service that answers is stronger proof than a process merely existing).

**Dead-man's switch** — the monitor can't report its own death. Create a free
check at [healthchecks.io](https://healthchecks.io), put its ping URL in
`HEALTHCHECK_URL`, and the monitor pings it every cycle; if the monitor or its
host dies the pings stop and healthchecks.io alerts you.

---

## Multiple servers

List every agent in `MONITOR_AGENTS` and in `servers.json`:

```env
MONITOR_AGENTS=srv1=http://10.0.0.10:8001,srv2=http://10.0.0.11:8001
```

```json
[
  { "name": "srv1", "url": "" },
  { "name": "srv2", "url": "https://srv2.example.com" }
]
```

`url: ""` goes through the monitor host's own `/api` proxy; a full URL points the
browser directly at another agent (CORS is enabled). More than one entry shows a
dropdown in the header.

---

## Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather) → get the **token**.
2. Get your numeric **chat id** from [@userinfobot](https://t.me/userinfobot).
3. Put `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the monitor's `.env`.

`/status` shows every server's CPU/mem/disk. `/mute 30m` (also `2h`, `/unmute`)
silences alerts during a planned reboot so it doesn't page you.

**Team alerts → a channel or group.** Add the bot to a channel/group, get its id
(e.g. `-1001234567890`), and set `TELEGRAM_ALERT_CHAT` to it; alerts then reach
everyone there. For a Topics-enabled group, `TELEGRAM_ALERT_THREAD=<topic id>`
posts into one topic. Add the group id to `TELEGRAM_ALLOWED_IDS` so `/status`
works inside the group.

**In-Telegram dashboard.** Expose the dashboard over https with the bundled ngrok
service so the "Open dashboard" button opens inside Telegram:

```env
COMPOSE_PROFILES=ngrok
NGROK_AUTHTOKEN=<token>
NGROK_DOMAIN=<name>.ngrok-free.app
DASHBOARD_URL=https://<name>.ngrok-free.app
```

---

## Configuration reference

**Agent**

| Variable | Meaning | Default |
|---|---|---|
| `AGENT_PORT` / `DASHBOARD_PORT` | host port | 8001 / 8080 |
| `WATCH_PROCESSES` | comma list of process names to watch | `dockerd,sshd` |
| `HISTORY_DB` | path for on-disk history (a mounted volume) so charts survive restarts; empty = memory only | `/data/history.db` |

Mount `/var/run/docker.sock:ro` for the container panel and `/var/run/utmp:ro`
for login sessions (both already in the compose files).

**Monitor**

| Variable | Meaning | Default |
|---|---|---|
| `MONITOR_AGENTS` | `name=url` comma list of agents to poll | — |
| `MONITOR_INTERVAL` | seconds between polls | 30 |
| `MONITOR_FAILS` | failed polls before DOWN | 2 |
| `TELEGRAM_BOT_TOKEN` | bot token (empty = Telegram off) | — |
| `TELEGRAM_CHAT_ID` | owner chat (alerts + commands) | — |
| `TELEGRAM_ALERT_CHAT` | alert target — a channel/group id | = chat id |
| `TELEGRAM_ALERT_THREAD` | forum topic id in the alert group | — |
| `TELEGRAM_ALLOWED_IDS` | ids allowed to run commands | = chat id |
| `DASHBOARD_URL` | link for the "Open dashboard" button | — |
| `ALERT_CPU` / `ALERT_MEM` | percent thresholds | 90 |
| `ALERT_DISK` | percent threshold | 85 |
| `ALERT_COOLDOWN` | seconds between repeat alerts | 1800 |
| `HTTP_CHECKS` | `name=url` endpoints to health-check | — |
| `HEALTHCHECK_URL` | dead-man's switch ping URL | — |
| `DISK_PREDICT_DAYS` | warn when a disk is projected to fill within this many days (0 = off) | 7 |
| `NGROK_AUTHTOKEN` / `NGROK_DOMAIN` | with `COMPOSE_PROFILES=ngrok` | — |

With no bot token the monitor runs in **dry-run** and prints alerts to stdout.

For a stable deployment, pin the images to a released version (e.g. `:1.9.0`)
instead of `:latest`.

---

## Security

- The dashboard and API have **no authentication** — anyone who can reach the URL
  can read metrics. Keep it on a private network or treat the public URL as a
  secret.
- The agent reads the Docker socket **read-only** (list + stats, no control).
- Secrets live only in `.env` files (git-ignored); never bake them into images.

---

## Tech stack

Vite · React 18 · TypeScript · Tailwind / shadcn-ui · Recharts — Python 3 · Flask
· psutil · gunicorn — Docker · nginx.
