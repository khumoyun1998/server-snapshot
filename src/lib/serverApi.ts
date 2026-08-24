import type {
  ServerInfo,
  CpuInfo,
  MemInfo,
  DiskInfo,
  ProcessInfo,
  NetworkInfo,
} from "./mockServerData";

import {
  getServerInfo as getMockServer,
  getCpuInfo as getMockCpu,
  getMemInfo as getMockMem,
  getDiskInfo as getMockDisks,
  getTopProcessesByCpu as getMockProcCpu,
  getTopProcessesByMem as getMockProcMem,
  getNetworkInfo as getMockNetwork,
} from "./mockServerData";

export interface MetricsResponse {
  server: ServerInfo;
  cpu: CpuInfo;
  memory: MemInfo;
  disks: DiskInfo[];
  processesByCpu: ProcessInfo[];
  processesByMem: ProcessInfo[];
  network: NetworkInfo[];
}

export type DataSource = "live" | "mock";

export interface MetricsResult {
  data: MetricsResponse;
  source: DataSource;
}

export interface HistoryPoint {
  t: number; // unix seconds
  cpu: number; // %
  mem: number; // %
  disk: number; // %
  rxRate: number; // KB/s
  txRate: number; // KB/s
}

export interface WatchedProcess {
  name: string;
  count: number;
  cpu: number; // %
  mem: number; // %
  running: boolean;
}

export interface ContainerInfo {
  name: string;
  image: string;
  state: string; // running | exited | ...
  status: string; // "Up 2 hours"
  cpu: number; // %
  memUsed: number; // MB
  memLimit: number; // MB
}

export interface SessionInfo {
  user: string;
  terminal: string;
  host: string;
  since: string;
}

export interface WatchResponse {
  processes: WatchedProcess[];
  dockerAvailable: boolean;
  containers: ContainerInfo[];
  sessions?: SessionInfo[];
}

export interface ServerEntry {
  name: string;
  url: string; // "" = same origin
}

export async function fetchServers(): Promise<ServerEntry[]> {
  try {
    const res = await fetch("/servers.json");
    if (!res.ok) throw new Error();
    const list: ServerEntry[] = await res.json();
    if (Array.isArray(list) && list.length > 0) return list;
  } catch {
    /* fall through */
  }
  return [{ name: "This server", url: "" }];
}

const API_URL = import.meta.env.VITE_API_URL || "";

export interface AlertItem {
  server: string;
  type: string; // down | threshold | process | container | disk | service
  severity: "critical" | "warning";
  message: string;
  since?: number;
}

export interface AlertsResponse {
  muted: boolean;
  muteUntil: number;
  generated: number;
  alerts: AlertItem[];
}

// Returns null when the monitor's /alerts endpoint isn't present (e.g. the
// all-in-one deployment with no central monitor) — the panel then hides.
export async function fetchAlerts(base = ""): Promise<AlertsResponse | null> {
  try {
    const res = await fetch(`${base || API_URL}/alerts`);
    if (!res.ok) throw new Error();
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) throw new Error();
    return (await res.json()) as AlertsResponse;
  } catch {
    return null;
  }
}

const MOCK_WATCH: WatchResponse = {
  processes: [
    { name: "dockerd", count: 1, cpu: 1.2, mem: 3.4, running: true },
    { name: "ngrok", count: 1, cpu: 0.3, mem: 1.1, running: true },
    { name: "sshd", count: 2, cpu: 0.0, mem: 0.4, running: true },
    { name: "nginx", count: 0, cpu: 0, mem: 0, running: false },
  ],
  sessions: [
    { user: "admin", terminal: "pts/0", host: "192.0.2.10", since: "2026-07-18 09:15" },
  ],
  dockerAvailable: true,
  containers: [
    { name: "app-web-1", image: "myapp:latest", state: "running", status: "Up 2 hours", cpu: 2.4, memUsed: 128, memLimit: 1900 },
    { name: "app-db-1", image: "postgres:16-alpine", state: "running", status: "Up 2 hours", cpu: 0.8, memUsed: 96, memLimit: 1900 },
    { name: "app-migrate-1", image: "myapp:latest", state: "exited", status: "Exited (0) 2 hours ago", cpu: 0, memUsed: 0, memLimit: 0 },
  ],
};

export async function fetchWatch(base = ""): Promise<{ data: WatchResponse; source: DataSource }> {
  try {
    const res = await fetch(`${base || API_URL}/api/watch`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) throw new Error("Not JSON");
    const data: WatchResponse = await res.json();
    return { data, source: "live" };
  } catch {
    return { data: MOCK_WATCH, source: "mock" };
  }
}

function generateMockHistory(minutes: number): HistoryPoint[] {
  const now = Math.floor(Date.now() / 1000);
  const points = 120;
  const step = (minutes * 60) / points;
  return Array.from({ length: points }, (_, i) => {
    const t = now - Math.round((points - 1 - i) * step);
    const wave = Math.sin(i / 9) * 12 + Math.sin(i / 23) * 8;
    return {
      t,
      cpu: Math.max(2, Math.min(98, 35 + wave + (Math.random() - 0.5) * 6)),
      mem: Math.max(5, Math.min(95, 62 + Math.sin(i / 31) * 5 + (Math.random() - 0.5) * 2)),
      disk: 41,
      rxRate: Math.max(0, 120 + wave * 14 + (Math.random() - 0.5) * 40),
      txRate: Math.max(0, 45 + Math.sin(i / 13) * 20 + (Math.random() - 0.5) * 15),
    };
  });
}

export async function fetchHistory(minutes: number, base = ""): Promise<{ points: HistoryPoint[]; source: DataSource }> {
  try {
    const res = await fetch(`${base || API_URL}/api/history?minutes=${minutes}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) throw new Error("Not JSON");
    const points: HistoryPoint[] = await res.json();
    return { points, source: "live" };
  } catch {
    return { points: generateMockHistory(minutes), source: "mock" };
  }
}

export async function fetchMetrics(base = ""): Promise<MetricsResult> {
  try {
    const res = await fetch(`${base || API_URL}/api/metrics`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) throw new Error("Not JSON");
    const data: MetricsResponse = await res.json();
    return { data, source: "live" };
  } catch {
    console.warn("API unavailable, using mock data");
    return {
      data: {
        server: getMockServer(),
        cpu: getMockCpu(),
        memory: getMockMem(),
        disks: getMockDisks(),
        processesByCpu: getMockProcCpu(),
        processesByMem: getMockProcMem(),
        network: getMockNetwork(),
      },
      source: "mock",
    };
  }
}
