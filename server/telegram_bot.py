"""
Optional Telegram integration for the monitoring agent.

Sends threshold alerts (with hysteresis + cooldown) and answers /status
so metrics can be checked from anywhere without opening the dashboard.
Uses only the standard library — no extra dependencies.

Enabled only when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set.

Env vars:
    TELEGRAM_BOT_TOKEN  bot token from @BotFather
    TELEGRAM_CHAT_ID    chat that receives alerts and may issue commands
    DASHBOARD_URL       optional; adds an inline "Open dashboard" button
    ALERT_CPU           CPU %% threshold (default 90)
    ALERT_MEM           memory %% threshold (default 90)
    ALERT_DISK          disk %% threshold (default 85)
    ALERT_COOLDOWN      seconds between repeat alerts for the same metric (default 1800)
"""

import json
import os
import threading
import time
import urllib.request

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "").strip()

# Where ALERTS are posted. Set TELEGRAM_ALERT_CHAT to a channel id (e.g.
# -1001234567890, bot must be an admin) to broadcast alerts to a team.
# Falls back to the owner's private chat.
ALERT_CHAT = os.environ.get("TELEGRAM_ALERT_CHAT", "").strip() or CHAT_ID

# Optional forum topic (thread) inside the alert group — alerts post there
# instead of the group's General topic. Empty = no specific topic.
ALERT_THREAD = os.environ.get("TELEGRAM_ALERT_THREAD", "").strip()

# Who may issue commands (/status). Comma list of user ids; defaults to the
# owner. A channel that receives alerts does not need to be listed here —
# commands come from users in private chat.
ALLOWED_IDS = {
    i.strip() for i in os.environ.get("TELEGRAM_ALLOWED_IDS", "").split(",") if i.strip()
} or {CHAT_ID}

THRESHOLDS = {
    "cpu": float(os.environ.get("ALERT_CPU", 90)),
    "mem": float(os.environ.get("ALERT_MEM", 90)),
    "disk": float(os.environ.get("ALERT_DISK", 85)),
}
COOLDOWN = int(os.environ.get("ALERT_COOLDOWN", 1800))
HYSTERESIS = 5.0  # metric must drop this far below threshold to count as recovered
CHECK_INTERVAL = 30

METRIC_NAMES = {"cpu": "CPU", "mem": "Memory", "disk": "Disk"}

_api_base = f"https://api.telegram.org/bot{TOKEN}"


def _api(method, payload, timeout=35):
    req = urllib.request.Request(
        f"{_api_base}/{method}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _dashboard_button(target):
    # Web App buttons (open inside Telegram) require HTTPS *and* a private
    # chat — channels/groups (negative ids) only accept plain url buttons.
    private = not str(target).startswith("-")
    if DASHBOARD_URL.startswith("https://") and private:
        return {"text": "📊 Open dashboard", "web_app": {"url": DASHBOARD_URL}}
    return {"text": "📊 Open dashboard", "url": DASHBOARD_URL}


def _send(text, chat=None, thread=None):
    target = chat or ALERT_CHAT
    payload = {"chat_id": target, "text": text, "parse_mode": "HTML"}
    # Post into a forum topic: an explicit thread (e.g. replying in the same
    # topic) wins; otherwise use the configured alert topic for alert sends.
    th = thread if thread is not None else (ALERT_THREAD if chat is None else None)
    if th:
        try:
            payload["message_thread_id"] = int(th)
        except ValueError:
            pass
    if DASHBOARD_URL:
        payload["reply_markup"] = {"inline_keyboard": [[_dashboard_button(target)]]}
    # Retry a couple of times so a transient network blip doesn't drop an alert.
    for attempt in range(3):
        try:
            _api("sendMessage", payload)
            return
        except Exception as e:
            if attempt == 2:
                print(f"[telegram] send failed after retries: {e}")
            else:
                time.sleep(2)


def _status_text(status):
    lines = [
        f"🖥 <b>{status['hostname']}</b>",
        f"Uptime: {status['uptime']}",
        "",
        f"CPU: <b>{status['cpu']:.0f}%</b>",
        f"Memory: <b>{status['mem']:.0f}%</b> ({status['memUsed']} / {status['memTotal']})",
        f"Disk: <b>{status['disk']:.0f}%</b>",
        f"Load avg: {status['loadAvg']}",
    ]
    return "\n".join(lines)


def _alert_loop(get_status):
    # state per metric: active alert + when we last notified
    state = {m: {"active": False, "last_sent": 0.0} for m in THRESHOLDS}
    while True:
        time.sleep(CHECK_INTERVAL)
        try:
            status = get_status()
        except Exception:
            continue
        now = time.time()
        for metric, limit in THRESHOLDS.items():
            value = status[metric]
            st = state[metric]
            name = METRIC_NAMES[metric]
            if value >= limit:
                due = now - st["last_sent"] >= COOLDOWN
                if not st["active"] or due:
                    st["active"] = True
                    st["last_sent"] = now
                    _send(
                        f"🔴 <b>{name} alert</b> on <b>{status['hostname']}</b>\n"
                        f"{name}: <b>{value:.0f}%</b> (limit {limit:.0f}%)"
                    )
            elif st["active"] and value <= limit - HYSTERESIS:
                st["active"] = False
                _send(
                    f"🟢 <b>{name} recovered</b> on <b>{status['hostname']}</b>\n"
                    f"{name}: <b>{value:.0f}%</b>"
                )


def _process_watch_loop(get_watched, get_status):
    known = {}  # name -> was running
    first = True
    while True:
        time.sleep(60)
        try:
            watched = get_watched()
            host = get_status()["hostname"]
        except Exception:
            continue
        for proc in watched:
            name, running = proc["name"], proc["running"]
            was = known.get(name)
            known[name] = running
            if first or was is None:
                continue  # no alert on startup / newly added names
            if was and not running:
                _send(f"🔴 <b>Process down</b> on <b>{host}</b>\n<code>{name}</code> is not running")
            elif not was and running:
                _send(f"🟢 <b>Process back</b> on <b>{host}</b>\n<code>{name}</code> is running again")
        first = False


def _session_watch_loop(get_sessions, get_status):
    known = None
    while True:
        time.sleep(30)
        try:
            sessions = get_sessions()
            host = get_status()["hostname"]
        except Exception:
            continue
        current = {(s["user"], s["terminal"], s["host"], s["since"]) for s in sessions}
        if known is not None:
            for user, term, src, since in sorted(current - known):
                _send(
                    f"🔵 <b>New login</b> on <b>{host}</b>\n"
                    f"User: <code>{user}</code>\n"
                    f"From: <code>{src}</code>\n"
                    f"Terminal: {term or '—'}\n"
                    f"At: {since}"
                )
            for user, term, src, since in sorted(known - current):
                _send(
                    f"⚪️ <b>Session closed</b> on <b>{host}</b>\n"
                    f"<code>{user}</code> from <code>{src}</code> (logged in {since})"
                )
        known = current


def _command_loop(get_status):
    offset = 0
    while True:
        try:
            updates = _api("getUpdates", {"offset": offset, "timeout": 30})
        except Exception:
            time.sleep(5)
            continue
        for upd in updates.get("result", []):
            offset = upd["update_id"] + 1
            msg = upd.get("message") or {}
            text = (msg.get("text") or "").strip()
            chat = str((msg.get("chat") or {}).get("id", ""))
            thread = msg.get("message_thread_id")
            if chat not in ALLOWED_IDS:
                continue  # ignore anyone not allowed
            if text.startswith("/status"):
                try:
                    _send(_status_text(get_status()), chat=chat, thread=thread)
                except Exception as e:
                    _send(f"⚠️ Failed to read metrics: {e}", chat=chat, thread=thread)
            elif text.startswith("/start") or text.startswith("/help"):
                _send(
                    "Server monitoring bot.\n"
                    "/status — current CPU / memory / disk\n"
                    "Alerts are sent automatically when thresholds are exceeded.",
                    chat=chat,
                    thread=thread,
                )


def start(get_status, get_watched=None, get_sessions=None):
    """Start alert + command threads. No-op when token/chat id are missing."""
    if not TOKEN or not CHAT_ID:
        print("[telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — disabled")
        return
    threading.Thread(target=_alert_loop, args=(get_status,), daemon=True).start()
    threading.Thread(target=_command_loop, args=(get_status,), daemon=True).start()
    if get_watched is not None:
        threading.Thread(
            target=_process_watch_loop, args=(get_watched, get_status), daemon=True
        ).start()
    if get_sessions is not None:
        threading.Thread(
            target=_session_watch_loop, args=(get_sessions, get_status), daemon=True
        ).start()
    print("[telegram] alerts + command bot started")
