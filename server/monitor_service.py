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

import json
import os
import threading
import time
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
        "sessions": None,    # set of session tuples
    }
    for a in AGENTS
}


def notify(text):
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


def _poll_loop():
    while True:
        for name, st in _state.items():
            _poll_agent(name, st)
        time.sleep(INTERVAL)


def _status_text():
    lines = ["🖥 <b>Servers</b>"]
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
    return "\n".join(lines)


def _command_loop():
    offset = 0
    chat_id = telegram_bot.CHAT_ID
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
            if str((msg.get("chat") or {}).get("id", "")) != chat_id:
                continue
            if text.startswith("/status"):
                telegram_bot._send(_status_text())
            elif text.startswith("/start") or text.startswith("/help"):
                telegram_bot._send(
                    "Central server monitor.\n"
                    "/status — all servers at a glance\n"
                    "Alerts fire automatically on server down/up and threshold breaches."
                )


def main():
    if not AGENTS:
        print("[monitor] MONITOR_AGENTS not set — nothing to watch, exiting")
        return
    print(f"[monitor] watching {len(AGENTS)} agent(s): {', '.join(a['name'] for a in AGENTS)}")
    if not telegram_bot.TOKEN:
        print("[monitor] no TELEGRAM_BOT_TOKEN — dry-run, alerts print to stdout")
    threading.Thread(target=_poll_loop, daemon=True).start()
    if telegram_bot.TOKEN:
        _command_loop()  # blocks
    else:
        while True:
            time.sleep(3600)


if __name__ == "__main__":
    main()
