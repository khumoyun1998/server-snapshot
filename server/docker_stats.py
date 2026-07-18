"""
Container stats via the Docker socket — standard library only.

Mount /var/run/docker.sock into the agent container (read-only) to enable.
A background thread refreshes a cache every REFRESH seconds so API responses
stay instant; when the socket is missing the module reports itself disabled.
"""

import http.client
import json
import socket
import threading

DOCKER_SOCK = "/var/run/docker.sock"
REFRESH = 15

_cache = {"available": False, "containers": []}
_lock = threading.Lock()


class _UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__("localhost")
        self._path = path

    def connect(self):
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(10)
        sock.connect(self._path)
        self.sock = sock


def _docker_get(endpoint):
    conn = _UnixHTTPConnection(DOCKER_SOCK)
    try:
        conn.request("GET", endpoint)
        resp = conn.getresponse()
        if resp.status != 200:
            raise RuntimeError(f"docker api {resp.status}")
        return json.loads(resp.read().decode())
    finally:
        conn.close()


def _cpu_percent(stats):
    try:
        cpu = stats["cpu_stats"]
        pre = stats["precpu_stats"]
        cpu_delta = cpu["cpu_usage"]["total_usage"] - pre["cpu_usage"]["total_usage"]
        sys_delta = cpu["system_cpu_usage"] - pre.get("system_cpu_usage", 0)
        if sys_delta <= 0 or cpu_delta < 0:
            return 0.0
        ncpu = cpu.get("online_cpus") or len(cpu["cpu_usage"].get("percpu_usage", [1]))
        return round(cpu_delta / sys_delta * ncpu * 100, 1)
    except (KeyError, TypeError, ZeroDivisionError):
        return 0.0


def _mem_mb(stats):
    try:
        m = stats["memory_stats"]
        usage = m["usage"] - m.get("stats", {}).get("inactive_file", 0)
        return round(usage / (1024 * 1024)), round(m.get("limit", 0) / (1024 * 1024))
    except (KeyError, TypeError):
        return 0, 0


def _collect_one(c, results, idx):
    entry = {
        "name": (c.get("Names") or ["?"])[0].lstrip("/"),
        "image": c.get("Image", "?"),
        "state": c.get("State", "unknown"),
        "status": c.get("Status", ""),
        "cpu": 0.0,
        "memUsed": 0,
        "memLimit": 0,
    }
    if entry["state"] == "running":
        try:
            # stream=false takes ~1s per container (two CPU samples) — that's
            # why collection runs in parallel threads off the request path
            stats = _docker_get(f"/containers/{c['Id']}/stats?stream=false")
            entry["cpu"] = _cpu_percent(stats)
            entry["memUsed"], entry["memLimit"] = _mem_mb(stats)
        except Exception:
            pass
    results[idx] = entry


def _refresh_loop():
    global _cache
    while True:
        try:
            containers = _docker_get("/containers/json?all=true")
            results = [None] * len(containers)
            threads = [
                threading.Thread(target=_collect_one, args=(c, results, i), daemon=True)
                for i, c in enumerate(containers)
            ]
            for t in threads:
                t.start()
            for t in threads:
                t.join(timeout=20)
            entries = sorted(
                (r for r in results if r),
                key=lambda e: (e["state"] != "running", e["name"]),
            )
            with _lock:
                _cache = {"available": True, "containers": entries}
        except Exception:
            with _lock:
                _cache = {"available": False, "containers": []}
        threading.Event().wait(REFRESH)


def get_containers():
    with _lock:
        return dict(_cache)


threading.Thread(target=_refresh_loop, daemon=True).start()
