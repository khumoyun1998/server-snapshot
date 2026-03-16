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
  hostname: "demo-server",
  os: "Ubuntu 22.04.3 LTS",
  kernel: "5.15.0-91-generic",
  arch: "x86_64",
  uptime: "42d 7h 31m",
  ip: "192.168.1.105",
  lastBoot: "2026-01-31 14:22:08 UTC",
  loadAvg: [1.23 + Math.random() * 0.5, 0.98 + Math.random() * 0.3, 0.87 + Math.random() * 0.2],
});

export const getCpuInfo = (): CpuInfo => ({
  model: "AMD EPYC 7763 64-Core",
  cores: 8,
  threads: 16,
  speed: "3.5 GHz",
  usage: 34 + Math.random() * 8,
  temperature: 52 + Math.random() * 6,
  coreUsages: Array.from({ length: 8 }, () => Math.random() * 60 + 10),
});

export const getMemInfo = (): MemInfo => ({
  total: 32768,
  used: 18432 + Math.random() * 2048,
  free: 8192 + Math.random() * 1024,
  cached: 6144,
  swapTotal: 8192,
  swapUsed: 512 + Math.random() * 256,
});

export const getDiskInfo = (): DiskInfo[] => [
  { device: "/dev/sda1", mountPoint: "/", total: 512000, used: 234500, filesystem: "ext4" },
  { device: "/dev/sdb1", mountPoint: "/data", total: 1024000, used: 678900, filesystem: "xfs" },
  { device: "/dev/sdc1", mountPoint: "/backup", total: 2048000, used: 890000, filesystem: "ext4" },
];

export const getTopProcessesByCpu = (): ProcessInfo[] => [
  { pid: 1842, name: "node", user: "www-data", cpu: 24.3, mem: 8.7, status: "running" },
  { pid: 2901, name: "postgres", user: "postgres", cpu: 18.1, mem: 12.4, status: "running" },
  { pid: 3422, name: "nginx", user: "root", cpu: 11.6, mem: 3.2, status: "running" },
  { pid: 4105, name: "redis-server", user: "redis", cpu: 7.8, mem: 5.1, status: "running" },
  { pid: 5230, name: "python3", user: "deploy", cpu: 5.2, mem: 6.8, status: "sleeping" },
];

export const getTopProcessesByMem = (): ProcessInfo[] => [
  { pid: 2901, name: "postgres", user: "postgres", cpu: 18.1, mem: 12.4, status: "running" },
  { pid: 1842, name: "node", user: "www-data", cpu: 24.3, mem: 8.7, status: "running" },
  { pid: 6012, name: "java", user: "tomcat", cpu: 4.1, mem: 9.3, status: "running" },
  { pid: 5230, name: "python3", user: "deploy", cpu: 5.2, mem: 6.8, status: "sleeping" },
  { pid: 4105, name: "redis-server", user: "redis", cpu: 7.8, mem: 5.1, status: "running" },
];

export const getNetworkInfo = (): NetworkInfo[] => [
  { interface: "eth0", ip: "192.168.1.105", rx: 1247.8, tx: 432.1, speed: "1 Gbps" },
  { interface: "lo", ip: "127.0.0.1", rx: 56.2, tx: 56.2, speed: "—" },
];

export const formatBytes = (mb: number): string => {
  if (mb >= 1024000) return `${(mb / 1024000).toFixed(1)} TB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
};
