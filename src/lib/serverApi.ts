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

// In production (served by the Python agent), the API is on the same origin.
// In development (Vite dev server), you can set VITE_API_URL to point to the agent.
const API_URL = import.meta.env.VITE_API_URL || "";

export async function fetchMetrics(): Promise<MetricsResponse> {
  try {
    const res = await fetch(`${API_URL}/api/metrics`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    // Fallback to mock data when API is unavailable (e.g., during development)
    console.warn("API unavailable, using mock data");
    return {
      server: getMockServer(),
      cpu: getMockCpu(),
      memory: getMockMem(),
      disks: getMockDisks(),
      processesByCpu: getMockProcCpu(),
      processesByMem: getMockProcMem(),
      network: getMockNetwork(),
    };
  }
}
