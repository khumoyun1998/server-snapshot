import { useState, useEffect } from "react";
import { Cpu, MemoryStick, HardDrive } from "lucide-react";
import HeaderStrip from "@/components/dashboard/HeaderStrip";
import MetricCard from "@/components/dashboard/MetricCard";
import ProcessTable from "@/components/dashboard/ProcessTable";
import SystemInfoPanel from "@/components/dashboard/SystemInfoPanel";
import DiskTable from "@/components/dashboard/DiskTable";
import CpuCoreGrid from "@/components/dashboard/CpuCoreGrid";
import {
  getServerInfo,
  getCpuInfo,
  getMemInfo,
  getDiskInfo,
  getTopProcessesByCpu,
  getTopProcessesByMem,
  getNetworkInfo,
  formatBytes,
  type CpuInfo,
  type MemInfo,
} from "@/lib/mockServerData";

const Index = () => {
  const server = getServerInfo();
  const disks = getDiskInfo();
  const processes = getTopProcesses();
  const network = getNetworkInfo();

  const [cpu, setCpu] = useState<CpuInfo>(getCpuInfo());
  const [mem, setMem] = useState<MemInfo>(getMemInfo());

  // Simulate live data refresh
  useEffect(() => {
    const interval = setInterval(() => {
      setCpu(getCpuInfo());
      setMem(getMemInfo());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const memPct = (mem.used / mem.total) * 100;
  const mainDiskPct = (disks[0].used / disks[0].total) * 100;

  return (
    <div className="min-h-screen bg-background">
      <HeaderStrip server={server} />

      <main className="container py-6 space-y-4">
        {/* Quick Look Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="CPU Usage"
            icon={<Cpu className="h-4 w-4 text-primary" />}
            value={`${cpu.model} · ${cpu.cores}C/${cpu.threads}T @ ${cpu.speed}`}
            percentage={cpu.usage}
            details={[
              { label: "Temperature", value: `${cpu.temperature.toFixed(1)}°C` },
              { label: "Load Avg", value: server.loadAvg.join(" / ") },
            ]}
          />
          <MetricCard
            title="Memory"
            icon={<MemoryStick className="h-4 w-4 text-primary" />}
            value={`${formatBytes(mem.used)} / ${formatBytes(mem.total)}`}
            percentage={memPct}
            details={[
              { label: "Cached", value: formatBytes(mem.cached) },
              { label: "Swap", value: `${formatBytes(mem.swapUsed)} / ${formatBytes(mem.swapTotal)}` },
            ]}
          />
          <MetricCard
            title="Disk (/)"
            icon={<HardDrive className="h-4 w-4 text-primary" />}
            value={`${formatBytes(disks[0].used)} / ${formatBytes(disks[0].total)}`}
            percentage={mainDiskPct}
            subtitle={`${disks[0].device} · ${disks[0].filesystem}`}
          />
        </div>

        {/* CPU Cores + Disks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CpuCoreGrid coreUsages={cpu.coreUsages} />
          <DiskTable disks={disks} />
        </div>

        {/* Process Table */}
        <ProcessTable processes={processes} />

        {/* System Info + Network */}
        <SystemInfoPanel server={server} network={network} />
      </main>
    </div>
  );
};

export default Index;
