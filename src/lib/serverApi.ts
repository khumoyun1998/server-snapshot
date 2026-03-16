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

const API_URL = import.meta.env.VITE_API_URL || "";

export async function fetchMetrics(): Promise<MetricsResult> {
  try {
    const res = await fetch(`${API_URL}/api/metrics`);
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
