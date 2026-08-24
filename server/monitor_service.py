#!/usr/bin/env python3
"""
Central monitor — runs OFF the monitored machines (e.g. on a VPS).

Polls each agent's HTTP API and raises Telegram alerts that the agents
themselves cannot: server DOWN when an agent stops responding, plus
threshold / watched-process / new-login alerts gathered remotely. Also
answers /status with a summary of every agent.

Why separate from the agent: if the box dies, an alerter running on it
dies too — so "server down" must be detected from somewhere else. Only
one process may long-poll a given bot token, so all alerting lives here
and the agents run with Telegram disabled.

Standard library only. Configure via env vars:

    MONITOR_AGENTS   comma list of name=url, e.g.
                     "home=http://10.0.0.10:8001,vps2=http://10.0.0.11:8001"
    MONITOR_INTERVAL seconds between polls (default 30)
    MONITOR_FAILS    consecutive failures before "down" (default 2)
    TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / DASHBOARD_URL
    ALERT_CPU / ALERT_MEM / ALERT_DISK / ALERT_COOLDOWN

With no bot token the service runs in dry-run mode and prints alerts.
"""

import http.server
import json
import os
import threading
import time
import urllib.error
import urllib.request

import telegram_bot  # reused transport (_api, _send, TOKEN)

INTERVAL = int(os.environ.get("MONITOR_INTERVAL", 30))
FAILS_TO_DOWN = int(os.environ.get("MONITOR_FAILS", 2))
THRESHOLDS = {
    "cpu": float(os.environ.get("ALERT_CPU", 90)),
    "mem": float(os.environ.get("ALERT_MEM", 90)),
    "disk": float(os.environ.get("ALERT_DISK", 85)),
}
COOLDOWN = int(os.environ.get("ALERT_COOLDOWN", 1800))
HYSTERESIS = 5.0
METRIC_NAMES = {"cpu": "CPU", "mem": "Memory", "disk": "Disk"}

# Dead-man's switch: ping this URL every cycle so an external watchdog
# (e.g. healthchecks.io) alerts if THIS monitor / its host dies.
HEALTHCHECK_URL = os.environ.get("HEALTHCHECK_URL", "").strip()


def _parse_http_checks():
    checks = []
    for chunk in os.environ.get("HTTP_CHECKS", "").split(","):
        chunk = chunk.strip()
        if not chunk or "=" not in chunk:
            continue
        name, url = chunk.split("=", 1)
        checks.append({"name": name.strip(), "url": url.strip()})
    return checks


HTTP_CHECKS = _parse_http_checks()
_check_state = {c["name"]: {"url": c["url"], "up": None, "fails": 0} for c in HTTP_CHECKS}

# Proactive disk-fill prediction: from an agent's history, project when the disk
# reaches 100%. Alert if sooner than this many days (0 = off). Uses the on-disk
# history, so it needs the agent's HISTORY_DB (or at least hours of uptime).
DISK_PREDICT_DAYS = float(os.environ.get("DISK_PREDICT_DAYS", 7))
_predict_tick = 0


def _parse_agents():
    agents = []
    for chunk in os.environ.get("MONITOR_AGENTS", "").split(","):
        chunk = chunk.strip()
        if not chunk or "=" not in chunk:
            continue
        name, url = chunk.split("=", 1)
        agents.append({"name": name.strip(), "url": url.strip().rstrip("/")})
    return agents


AGENTS = _parse_agents()

# per-agent runtime state
_state = {
    a["name"]: {
        "url": a["url"],
        "up": None,          # None = unknown, True/False afterwards
        "fails": 0,
        "down_since": 0.0,
        "metrics": None,     # last good percentages for /status
        "thresh": {m: {"active": False, "last": 0.0} for m in THRESHOLDS},
        "procs": {},         # name -> was_running
        "containers": {},    # name -> was_running
        "down_containers": set(),  # containers that were running and stopped
        "sessions": None,    # set of session tuples
        "disk_alert": 0.0,   # last disk-prediction alert time (daily cooldown)
        "disk_full_in": None,  # last projected days-to-full (for the alerts page)
    }
    for a in AGENTS
}


# Maintenance mute: while active, alerts are suppressed (state still tracked, so
# no backlog fires afterwards). Set via the /mute command — handy around a
# planned reboot so it doesn't page you.
_mute_until = 0.0


def _parse_duration(s):
    """'30m' / '2h' / bare number (minutes) → seconds; 0 if unparseable."""
    s = s.strip().lower()
    try:
        if s.endswith("h"):
            return int(float(s[:-1]) * 3600)
        if s.endswith("m"):
            return int(float(s[:-1]) * 60)
        return int(s) * 60
    except ValueError:
        return 0


def notify(text):
    if time.time() < _mute_until:
        return  # muted for maintenance
    if telegram_bot.TOKEN:
        telegram_bot._send(text)
    else:
        print(f"[ALERT] {text}")


def _get_json(url, timeout=10):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _percentages(metrics):
    cpu = metrics.get("cpu", {}).get("usage", 0)
    mem = metrics.get("memory", {})
    mem_pct = (mem.get("used", 0) / mem["total"] * 100) if mem.get("total") else 0
    disks = metrics.get("disks", [])
    disk_pct = (disks[0]["used"] / disks[0]["total"] * 100) if disks and disks[0].get("total") else 0
    return {"cpu": round(cpu, 1), "mem": round(mem_pct, 1), "disk": round(disk_pct, 1)}


def _fmt_downtime(seconds):
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}h {m}m"
    if m:
        return f"{m}m {s}s"
    return f"{s}s"


def _check_thresholds(name, st, pct):
    host = name
    now = time.time()
    for metric, limit in THRESHOLDS.items():
        value = pct[metric]
        ts = st["thresh"][metric]
        label = METRIC_NAMES[metric]
        if value >= limit:
            if not ts["active"] or now - ts["last"] >= COOLDOWN:
                ts["active"] = True
                ts["last"] = now
                notify(f"🔴 <b>{label} alert</b> on <b>{host}</b>\n{label}: <b>{value:.0f}%</b> (limit {limit:.0f}%)")
        elif ts["active"] and value <= limit - HYSTERESIS:
            ts["active"] = False
            notify(f"🟢 <b>{label} recovered</b> on <b>{host}</b>\n{label}: <b>{value:.0f}%</b>")


def _check_watch(name, st):
    try:
        watch = _get_json(st["url"] + "/api/watch")
    except Exception:
        return
    # watched processes
    for proc in watch.get("processes", []):
        pname, running = proc["name"], proc["running"]
        was = st["procs"].get(pname)
        st["procs"][pname] = running
        if was is None:
            continue
        if was and not running:
            notify(f"🔴 <b>Process down</b> on <b>{name}</b>\n<code>{pname}</code> is not running")
        elif not was and running:
            notify(f"🟢 <b>Process back</b> on <b>{name}</b>\n<code>{pname}</code> is running again")
    # docker containers (alert only on a running container changing state, so
    # a one-shot container that stays "exited" never pages)
    for c in watch.get("containers", []):
        cname, running = c["name"], c.get("state") == "running"
        was = st["containers"].get(cname)
        st["containers"][cname] = running
        if was is None:
            continue
        if was and not running:
            st["down_containers"].add(cname)
            notify(f"🔴 <b>Container stopped</b> on <b>{name}</b>\n<code>{cname}</code> ({c.get('status', '')})")
        elif not was and running:
            st["down_containers"].discard(cname)
            notify(f"🟢 <b>Container started</b> on <b>{name}</b>\n<code>{cname}</code>")
    # login sessions
    current = {
        (s["user"], s.get("terminal", ""), s.get("host", ""), s.get("since", ""))
        for s in watch.get("sessions", [])
    }
    if st["sessions"] is not None:
        for user, term, src, since in sorted(current - st["sessions"]):
            notify(
                f"🔵 <b>New login</b> on <b>{name}</b>\n"
                f"User: <code>{user}</code>\nFrom: <code>{src}</code>\n"
                f"Terminal: {term or '—'}\nAt: {since}"
            )
        for user, term, src, since in sorted(st["sessions"] - current):
            notify(
                f"⚪️ <b>Session closed</b> on <b>{name}</b>\n"
                f"<code>{user}</code> from <code>{src}</code> (was since {since})"
            )
    st["sessions"] = current


def _poll_agent(name, st):
    try:
        metrics = _get_json(st["url"] + "/api/metrics")
        pct = _percentages(metrics)
        st["metrics"] = pct
        st["fails"] = 0
        if st["up"] is False:
            down_for = _fmt_downtime(time.time() - st["down_since"])
            notify(f"🟢 <b>Server UP</b> — <b>{name}</b> is reachable again\nWas down for {down_for}")
        st["up"] = True
        _check_thresholds(name, st, pct)
        _check_watch(name, st)
    except Exception as e:
        st["fails"] += 1
        if st["up"] is not False and st["fails"] >= FAILS_TO_DOWN:
            st["up"] = False
            st["down_since"] = time.time()
            notify(f"🔴 <b>Server DOWN</b> — <b>{name}</b> is not responding\n{st['url']}\n({type(e).__name__})")


def _http_check_one(name, st):
    """GET a service URL. UP if the server answers at all — even 4xx means it is
    alive but protected (e.g. a login-gated panel). DOWN only on 5xx, a refused
    connection, or a timeout."""
    reason = None
    try:
        req = urllib.request.Request(
            st["url"], headers={"User-Agent": "server-snapshot-monitor"}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            code = resp.status
    except urllib.error.HTTPError as he:
        code = he.code  # the server did answer, just with an error status
    except Exception as e:
        code = None
        reason = type(e).__name__
    if code is not None and code < 500:
        st["fails"] = 0
        if st["up"] is False:
            notify(f"🟢 <b>Service UP</b> — <b>{name}</b> is responding again")
        st["up"] = True
    else:
        st["fails"] += 1
        if st["up"] is not False and st["fails"] >= FAILS_TO_DOWN:
            st["up"] = False
            notify(
                f"🔴 <b>Service DOWN</b> — <b>{name}</b>\n{st['url']}\n"
                f"({reason or f'HTTP {code}'})"
            )


def _ping_healthcheck():
    if not HEALTHCHECK_URL:
        return
    try:
        urllib.request.urlopen(HEALTHCHECK_URL, timeout=10).read()
    except Exception:
        pass  # a missed ping is exactly what the external watchdog reacts to


def _linfit_slope(points):
    """Least-squares slope of y over t (per second). points: [(t, y), ...]."""
    n = len(points)
    if n < 2:
        return 0.0
    mt = sum(p[0] for p in points) / n
    my = sum(p[1] for p in points) / n
    num = sum((p[0] - mt) * (p[1] - my) for p in points)
    den = sum((p[0] - mt) ** 2 for p in points)
    return num / den if den else 0.0


def _check_disk_prediction(name, st):
    if DISK_PREDICT_DAYS <= 0:
        return
    try:
        hist = _get_json(st["url"] + "/api/history?minutes=1440")
    except Exception:
        return
    pts = [(h["t"], h["disk"]) for h in hist if "disk" in h]
    if len(pts) < 20 or pts[-1][0] - pts[0][0] < 6 * 3600:
        return  # need at least ~6h of data to trust a trend
    slope = _linfit_slope(pts)          # % per second
    if slope <= 0:
        st["disk_full_in"] = None
        return                          # not filling
    current = pts[-1][1]
    days_to_full = (100 - current) / (slope * 86400)
    st["disk_full_in"] = round(days_to_full, 1) if days_to_full < DISK_PREDICT_DAYS else None
    now = time.time()
    if days_to_full < DISK_PREDICT_DAYS and now - st["disk_alert"] >= 86400:
        st["disk_alert"] = now
        notify(
            f"🟠 <b>Disk filling</b> on <b>{name}</b>\n"
            f"Disk at {current:.0f}%, projected full in ~{days_to_full:.1f} days"
        )


def _poll_loop():
    global _predict_tick
    while True:
        for name, st in _state.items():
            _poll_agent(name, st)
        for name, st in _check_state.items():
            _http_check_one(name, st)
        _ping_healthcheck()
        _predict_tick += 1
        if _predict_tick % max(1, 3600 // INTERVAL) == 0:   # ~hourly
            for name, st in _state.items():
                if st["up"]:
                    _check_disk_prediction(name, st)
        time.sleep(INTERVAL)


def _status_text():
    lines = []
    if time.time() < _mute_until:
        lines.append(f"🔇 <i>alerts muted — {_fmt_downtime(_mute_until - time.time())} left</i>")
    lines.append("🖥 <b>Servers</b>")
    for name, st in _state.items():
        if st["up"] is None:
            lines.append(f"⏳ <b>{name}</b> — checking…")
        elif st["up"]:
            m = st["metrics"] or {}
            lines.append(
                f"🟢 <b>{name}</b> — CPU {m.get('cpu', 0):.0f}% · "
                f"Mem {m.get('mem', 0):.0f}% · Disk {m.get('disk', 0):.0f}%"
            )
        else:
            down_for = _fmt_downtime(time.time() - st["down_since"])
            lines.append(f"🔴 <b>{name}</b> — DOWN ({down_for})")
    if _check_state:
        lines.append("")
        lines.append("🌐 <b>Services</b>")
        for name, st in _check_state.items():
            icon = "⏳" if st["up"] is None else ("🟢" if st["up"] else "🔴")
            lines.append(f"{icon} <b>{name}</b>")
    return "\n".join(lines)


def _active_alerts():
    """Current unresolved problems, for the dashboard's alerts page."""
    out = []
    now = time.time()
    for name, st in _state.items():
        if st["up"] is False:
            out.append({"server": name, "type": "down", "severity": "critical",
                        "message": "Server not responding", "since": int(st["down_since"])})
            continue
        if st["up"] is None:
            continue
        m = st["metrics"] or {}
        for metric, ts in st["thresh"].items():
            if ts["active"]:
                out.append({"server": name, "type": "threshold", "severity": "warning",
                            "message": f"{METRIC_NAMES[metric]} {m.get(metric, 0):.0f}% "
                                       f"(limit {THRESHOLDS[metric]:.0f}%)"})
        for pname, running in st["procs"].items():
            if not running:
                out.append({"server": name, "type": "process", "severity": "critical",
                            "message": f"Process {pname} not running"})
        for cname in sorted(st["down_containers"]):
            out.append({"server": name, "type": "container", "severity": "critical",
                        "message": f"Container {cname} stopped"})
        if st["disk_full_in"] is not None:
            out.append({"server": name, "type": "disk", "severity": "warning",
                        "message": f"Disk projected full in ~{st['disk_full_in']} days"})
    for cname, cst in _check_state.items():
        if cst["up"] is False:
            out.append({"server": cname, "type": "service", "severity": "critical",
                        "message": "Service not responding"})
    return {
        "muted": now < _mute_until,
        "muteUntil": int(_mute_until) if now < _mute_until else 0,
        "generated": int(now),
        "alerts": out,
    }


class _AlertHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.rstrip("/") in ("/alerts", "/api/alerts"):
            body = json.dumps(_active_alerts()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):
        pass  # keep the poll loop's logs clean


def _serve_http():
    http.server.ThreadingHTTPServer(("0.0.0.0", 5051), _AlertHandler).serve_forever()


def _command_loop():
    global _mute_until
    offset = 0
    while True:
        try:
            updates = telegram_bot._api("getUpdates", {"offset": offset, "timeout": 30})
        except Exception:
            time.sleep(5)
            continue
        for upd in updates.get("result", []):
            offset = upd["update_id"] + 1
            msg = upd.get("message") or {}
            text = (msg.get("text") or "").strip()
            chat = str((msg.get("chat") or {}).get("id", ""))
            thread = msg.get("message_thread_id")
            if chat not in telegram_bot.ALLOWED_IDS:
                continue
            if text.startswith("/status"):
                telegram_bot._send(_status_text(), chat=chat, thread=thread)
            elif text.startswith("/mute"):
                secs = _parse_duration(text[len("/mute"):]) or 1800  # default 30m
                _mute_until = time.time() + secs
                telegram_bot._send(
                    f"🔇 Alerts muted for {_fmt_downtime(secs)} (until then, no pages).",
                    chat=chat, thread=thread,
                )
            elif text.startswith("/unmute"):
                _mute_until = 0.0
                telegram_bot._send("🔔 Alerts unmuted.", chat=chat, thread=thread)
            elif text.startswith("/start") or text.startswith("/help"):
                telegram_bot._send(
                    "Central server monitor.\n"
                    "/status — all servers at a glance\n"
                    "/mute 30m — silence alerts for a planned reboot (/mute 2h, /unmute)\n"
                    "Alerts fire automatically on server down/up and threshold breaches.",
                    chat=chat,
                    thread=thread,
                )


def main():
    if not AGENTS and not HTTP_CHECKS:
        print("[monitor] nothing to watch (MONITOR_AGENTS / HTTP_CHECKS empty), exiting")
        return
    print(f"[monitor] watching {len(AGENTS)} agent(s): {', '.join(a['name'] for a in AGENTS)}")
    if HTTP_CHECKS:
        print(f"[monitor] http checks: {', '.join(c['name'] for c in HTTP_CHECKS)}")
    if HEALTHCHECK_URL:
        print("[monitor] dead-man's switch enabled (pinging healthcheck url)")
    if not telegram_bot.TOKEN:
        print("[monitor] no TELEGRAM_BOT_TOKEN — dry-run, alerts print to stdout")
    threading.Thread(target=_poll_loop, daemon=True).start()
    threading.Thread(target=_serve_http, daemon=True).start()  # /alerts endpoint
    print("[monitor] alerts endpoint on :5051")
    if telegram_bot.TOKEN:
        _command_loop()  # blocks
    else:
        while True:
            time.sleep(3600)


if __name__ == "__main__":
    main()
