export interface ServerInfo {
  hostname: string;
  os: string;
  kernel: string;
  arch: string;
  uptime: string;
  ip: string;
  lastBoot: string;
  loadAvg: [number, number, number];
}

export interface CpuInfo {
  model: string;
  cores: number;
  threads: number;
  speed: string;
  usage: number;
  temperature: number;
  coreUsages: number[];
}

export interface MemInfo {
  total: number;
  used: number;
  free: number;
  cached: number;
  swapTotal: number;
  swapUsed: number;
}

export interface DiskInfo {
  device: string;
  mountPoint: string;
  total: number;
  used: number;
  filesystem: string;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  user: string;
  cpu: number;
  mem: number;
  status: string;
}

export interface NetworkInfo {
  interface: string;
  ip: string;
  rx: number;
  tx: number;
  speed: string;
}

export const getServerInfo = (): ServerInfo => ({
  hostname: "Unknown",
  os: "Unknown",
  kernel: "Unknown",
  arch: "Unknown",
  uptime: "0d 0h 0m",
  ip: "0.0.0.0",
  lastBoot: "1970-01-01 00:00:00 UTC",
  loadAvg: [0.00, 0.00, 0.00],
});

export const getCpuInfo = (): CpuInfo => ({
  model: "Unknown",
  cores: 0,
  threads: 0,
  speed: "0.0 GHz",
  usage: 0,
  temperature: 0,
  coreUsages: Array.from({ length: 8 }, () => 0),
});

export const getMemInfo = (): MemInfo => ({
  total: 0,
  used: 0,
  free: 0,
  cached: 0,
  swapTotal: 0,
  swapUsed: 0,
});

export const getDiskInfo = (): DiskInfo[] => [
  { device: "/dev/sda1", mountPoint: "/", total: 0, used: 0, filesystem: "Unknown" },
  { device: "/dev/sdb1", mountPoint: "/data", total: 0, used: 0, filesystem: "Unknown" },
  { device: "/dev/sdc1", mountPoint: "/backup", total: 0, used: 0, filesystem: "Unknown" },
];

export const getTopProcessesByCpu = (): ProcessInfo[] => [
  { pid: 0, name: "Unknown", user: "Unknown", cpu: 0, mem: 0, status: "Unknown" },
  { pid: 0, name: "Unknown", user: "Unknown", cpu: 0, mem: 0, status: "Unknown" },
  { pid: 0, name: "Unknown", user: "Unknown", cpu: 0, mem: 0, status: "Unknown" },
  { pid: 0, name: "Unknown", user: "Unknown", cpu: 0, mem: 0, status: "Unknown" },
  { pid: 0, name: "Unknown", user: "Unknown", cpu: 0, mem: 0, status: "Unknown" },
];

export const getTopProcessesByMem = (): ProcessInfo[] => [
  { pid: 0, name: "Unknown", user: "Unknown", cpu: 0, mem: 0, status: "Unknown" },
  { pid: 0, name: "Unknown", user: "Unknown", cpu: 0, mem: 0, status: "Unknown" },
  { pid: 0, name: "Unknown", user: "Unknown", cpu: 0, mem: 0, status: "Unknown" },
  { pid: 0, name: "Unknown", user: "Unknown", cpu: 0, mem: 0, status: "Unknown" },
  { pid: 0, name: "Unknown", user: "Unknown", cpu: 0, mem: 0, status: "Unknown" },
];

export const getNetworkInfo = (): NetworkInfo[] => [
  { interface: "Unknown", ip: "0.0.0.0", rx: 0, tx: 0, speed: "0 Gbps" },
  { interface: "lo", ip: "127.0.0.1", rx: 0, tx: 0, speed: "—" },
];

export const formatBytes = (mb: number): string => {
  if (mb >= 1024000) return `${(mb / 1024000).toFixed(1)} TB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
};
