#!/usr/bin/env python3
"""
Server Monitoring Agent
=======================
A lightweight Python agent that collects system metrics and serves them
via a REST API. Also serves the built frontend (place built files in ./dist).

Requirements:
    pip install psutil flask flask-cors

Usage:
    python monitor_agent.py

    Then open http://localhost:5050 in your browser.
    API endpoint: http://localhost:5050/api/metrics
"""

import socket
import platform
import threading
import time
import datetime
import os
from collections import deque
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

import docker_stats
import telegram_bot

try:
    import psutil
except ImportError:
    print("ERROR: psutil is required. Install it with: pip install psutil")
    exit(1)

app = Flask(__name__, static_folder="dist", static_url_path="")
CORS(app)

BOOT_TIME = psutil.boot_time()

# ---------- Metrics history (in-memory ring buffer) ----------

HISTORY_INTERVAL = 5                      # seconds between samples
HISTORY_MAX = 24 * 3600 // HISTORY_INTERVAL   # keep 24 hours
HISTORY = deque(maxlen=HISTORY_MAX)


def _sample_loop():
    while True:
        try:
            mem = psutil.virtual_memory()
            net = psutil.net_io_counters()
            disk = psutil.disk_usage("/")
            HISTORY.append({
                "t": int(time.time()),
                "cpu": round(psutil.cpu_percent(interval=None), 1),
                "mem": round(mem.percent, 1),
                "disk": round(disk.percent, 1),
                "rx": net.bytes_recv,
                "tx": net.bytes_sent,
            })
        except Exception:
            pass
        time.sleep(HISTORY_INTERVAL)


threading.Thread(target=_sample_loop, daemon=True).start()


def _format_mb(mb):
    return f"{mb / 1024:.1f} GB" if mb >= 1024 else f"{mb} MB"


def get_status_snapshot():
    """Compact snapshot used by the Telegram bot."""
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    load = os.getloadavg() if hasattr(os, "getloadavg") else (0, 0, 0)
    return {
        "hostname": socket.gethostname(),
        "uptime": get_uptime(),
        "cpu": psutil.cpu_percent(interval=None),
        "mem": mem.percent,
        "memUsed": _format_mb(round(mem.used / (1024 * 1024))),
        "memTotal": _format_mb(round(mem.total / (1024 * 1024))),
        "disk": disk.percent,
        "loadAvg": " / ".join(f"{x:.2f}" for x in load),
    }


def get_uptime():
    delta = datetime.timedelta(seconds=time.time() - BOOT_TIME)
    days = delta.days
    hours, remainder = divmod(delta.seconds, 3600)
    minutes, _ = divmod(remainder, 60)
    return f"{days}d {hours}h {minutes}m"


def get_server_info():
    uname = platform.uname()
    try:
        hostname = socket.gethostname()
        ip = socket.gethostbyname(hostname)
    except Exception:
        hostname = uname.node
        ip = "127.0.0.1"

    load_avg = os.getloadavg() if hasattr(os, "getloadavg") else (0, 0, 0)
    boot_dt = datetime.datetime.fromtimestamp(BOOT_TIME, tz=datetime.timezone.utc)

    return {
        "hostname": hostname,
        "os": f"{uname.system} {uname.release}",
        "kernel": uname.release,
        "arch": uname.machine,
        "uptime": get_uptime(),
        "ip": ip,
        "lastBoot": boot_dt.strftime("%Y-%m-%d %H:%M:%S UTC"),
        "loadAvg": [round(x, 2) for x in load_avg],
    }


def get_cpu_info():
    freq = psutil.cpu_freq()
    per_cpu = psutil.cpu_percent(interval=0, percpu=True)
    overall = psutil.cpu_percent(interval=0)

    # Temperature (Linux only, may not be available)
    temp = 0
    try:
        temps = psutil.sensors_temperatures()
        if temps:
            for name in temps:
                for entry in temps[name]:
                    if entry.current > 0:
                        temp = entry.current
                        break
                if temp > 0:
                    break
    except Exception:
        pass

    return {
        "model": platform.processor() or "Unknown CPU",
        "cores": psutil.cpu_count(logical=False) or psutil.cpu_count(),
        "threads": psutil.cpu_count(logical=True),
        "speed": f"{freq.max / 1000:.1f} GHz" if freq and freq.max else "N/A",
        "usage": round(overall, 1),
        "temperature": round(temp, 1),
        "coreUsages": [round(u, 1) for u in per_cpu],
    }


def get_mem_info():
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    return {
        "total": round(mem.total / (1024 * 1024)),       # MB
        "used": round(mem.used / (1024 * 1024)),
        "free": round(mem.available / (1024 * 1024)),
        "cached": round(getattr(mem, "cached", 0) / (1024 * 1024)),
        "swapTotal": round(swap.total / (1024 * 1024)),
        "swapUsed": round(swap.used / (1024 * 1024)),
    }


def get_disk_info():
    disks = []
    seen_devices = set()
    for part in psutil.disk_partitions(all=False):
        # Skip duplicate devices (e.g. Docker bind mounts of /etc/hosts etc.
        # all point at the same underlying disk)
        if part.device in seen_devices:
            continue
        try:
            usage = psutil.disk_usage(part.mountpoint)
            seen_devices.add(part.device)
            disks.append({
                "device": part.device,
                "mountPoint": part.mountpoint,
                "total": round(usage.total / (1024 * 1024)),   # MB
                "used": round(usage.used / (1024 * 1024)),
                "filesystem": part.fstype,
            })
        except PermissionError:
            continue
    return disks


def get_top_processes_by_cpu():
    procs = []
    for p in psutil.process_iter(["pid", "name", "username", "cpu_percent", "memory_percent", "status"]):
        try:
            info = p.info
            procs.append({
                "pid": info["pid"],
                "name": info["name"] or "unknown",
                "user": info["username"] or "unknown",
                "cpu": round(info["cpu_percent"] or 0, 1),
                "mem": round(info["memory_percent"] or 0, 1),
                "status": info["status"],
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    procs.sort(key=lambda x: x["cpu"], reverse=True)
    return procs[:5]


def get_top_processes_by_mem():
    procs = []
    for p in psutil.process_iter(["pid", "name", "username", "cpu_percent", "memory_percent", "status"]):
        try:
            info = p.info
            procs.append({
                "pid": info["pid"],
                "name": info["name"] or "unknown",
                "user": info["username"] or "unknown",
                "cpu": round(info["cpu_percent"] or 0, 1),
                "mem": round(info["memory_percent"] or 0, 1),
                "status": info["status"],
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    procs.sort(key=lambda x: x["mem"], reverse=True)
    return procs[:5]


def get_network_info():
    stats = psutil.net_if_stats()
    addrs = psutil.net_if_addrs()
    counters = psutil.net_io_counters(pernic=True)
    result = []

    for iface in stats:
        if not stats[iface].isup:
            continue
        ip = "N/A"
        if iface in addrs:
            for addr in addrs[iface]:
                if addr.family == socket.AF_INET:
                    ip = addr.address
                    break
        rx = round(counters[iface].bytes_recv / (1024 * 1024), 1) if iface in counters else 0
        tx = round(counters[iface].bytes_sent / (1024 * 1024), 1) if iface in counters else 0
        speed = f"{stats[iface].speed} Mbps" if stats[iface].speed else "—"
        result.append({
            "interface": iface,
            "ip": ip,
            "rx": rx,
            "tx": tx,
            "speed": speed,
        })

    return result


# ---------- API Route ----------

@app.route("/api/metrics")
def metrics():
    return jsonify({
        "server": get_server_info(),
        "cpu": get_cpu_info(),
        "memory": get_mem_info(),
        "disks": get_disk_info(),
        "processesByCpu": get_top_processes_by_cpu(),
        "processesByMem": get_top_processes_by_mem(),
        "network": get_network_info(),
    })


# Comma-separated process names to watch, e.g. "dockerd,ngrok,sshd,nginx"
WATCH_PROCESSES = [
    p.strip().lower()
    for p in os.environ.get("WATCH_PROCESSES", "").split(",")
    if p.strip()
]


def get_watched_processes():
    """For each watched name: match count and summed CPU/MEM."""
    found = {name: {"name": name, "count": 0, "cpu": 0.0, "mem": 0.0} for name in WATCH_PROCESSES}
    if not WATCH_PROCESSES:
        return []
    for p in psutil.process_iter(["name", "cmdline", "cpu_percent", "memory_percent"]):
        try:
            pname = (p.info["name"] or "").lower()
            cmd = " ".join(p.info["cmdline"] or []).lower()
            for watch in WATCH_PROCESSES:
                if watch in pname or watch in cmd:
                    f = found[watch]
                    f["count"] += 1
                    f["cpu"] += p.info["cpu_percent"] or 0
                    f["mem"] += p.info["memory_percent"] or 0
                    break
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return [
        {**f, "cpu": round(f["cpu"], 1), "mem": round(f["mem"], 1), "running": f["count"] > 0}
        for f in found.values()
    ]


def get_sessions():
    """Active login sessions (host /var/run/utmp must be mounted in Docker)."""
    out = []
    try:
        for u in psutil.users():
            out.append({
                "user": u.name,
                "terminal": u.terminal or "",
                "host": u.host or "local",
                "since": datetime.datetime.fromtimestamp(u.started).strftime("%Y-%m-%d %H:%M"),
            })
    except Exception:
        pass
    return out


@app.route("/api/watch")
def watch():
    containers = docker_stats.get_containers()
    return jsonify({
        "processes": get_watched_processes(),
        "dockerAvailable": containers["available"],
        "containers": containers["containers"],
        "sessions": get_sessions(),
    })


@app.route("/api/history")
def history():
    try:
        minutes = min(max(int(request.args.get("minutes", 60)), 1), 24 * 60)
    except ValueError:
        minutes = 60
    cutoff = time.time() - minutes * 60
    samples = [s for s in HISTORY if s["t"] >= cutoff]

    # Downsample to at most ~180 points so responses stay small
    step = max(1, len(samples) // 180)
    samples = samples[::step]

    # Convert cumulative rx/tx counters to KB/s rates between kept samples
    points = []
    prev = None
    for s in samples:
        rx_rate = tx_rate = 0.0
        if prev is not None:
            dt = s["t"] - prev["t"]
            if dt > 0:
                rx_rate = max(0.0, (s["rx"] - prev["rx"]) / dt / 1024)
                tx_rate = max(0.0, (s["tx"] - prev["tx"]) / dt / 1024)
        points.append({
            "t": s["t"],
            "cpu": s["cpu"],
            "mem": s["mem"],
            "disk": s["disk"],
            "rxRate": round(rx_rate, 1),
            "txRate": round(tx_rate, 1),
        })
        prev = s
    return jsonify(points)


# ---------- Serve Frontend ----------

@app.route("/")
def serve_index():
    return send_from_directory(app.static_folder, "index.html")


@app.errorhandler(404)
def fallback(e):
    # SPA fallback
    index_path = os.path.join(app.static_folder, "index.html")
    if os.path.exists(index_path):
        return send_from_directory(app.static_folder, "index.html")
    return "Not found", 404


telegram_bot.start(get_status_snapshot, get_watched_processes, get_sessions)


if __name__ == "__main__":
    print("=" * 50)
    print("  Server Monitoring Agent")
    print("  Open http://localhost:5050")
    print("  API: http://localhost:5050/api/metrics")
    print("=" * 50)
    app.run(host="127.0.0.1", port=5050, debug=False)
