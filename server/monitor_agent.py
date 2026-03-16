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
import time
import datetime
import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

try:
    import psutil
except ImportError:
    print("ERROR: psutil is required. Install it with: pip install psutil")
    exit(1)

app = Flask(__name__, static_folder="dist", static_url_path="")
CORS(app)

BOOT_TIME = psutil.boot_time()


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
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
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


if __name__ == "__main__":
    print("=" * 50)
    print("  Server Monitoring Agent")
    print("  Open http://localhost:5050")
    print("  API: http://localhost:5050/api/metrics")
    print("=" * 50)
    app.run(host="127.0.0.1", port=5050, debug=False)
