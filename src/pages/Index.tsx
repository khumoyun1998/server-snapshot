import { useState, useEffect, useCallback } from "react";
import { Cpu, MemoryStick, HardDrive } from "lucide-react";
import HeaderStrip from "@/components/dashboard/HeaderStrip";
import MetricCard from "@/components/dashboard/MetricCard";
import ProcessTable from "@/components/dashboard/ProcessTable";
import SystemInfoPanel from "@/components/dashboard/SystemInfoPanel";
import DiskTable from "@/components/dashboard/DiskTable";
import CpuCoreGrid from "@/components/dashboard/CpuCoreGrid";
import { formatBytes } from "@/lib/mockServerData";
import { fetchMetrics, type MetricsResult } from "@/lib/serverApi";

const Index = () => {
  const [result, setResult] = useState<MetricsResult | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetchMetrics();
    setResult(r);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!result) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-mono text-sm animate-pulse">Loading metrics…</p>
      </div>
    );
  }

  const { data, source } = result;
  const { server, cpu, memory: mem, disks, processesByCpu, processesByMem, network } = data;
  const memPct = (mem.used / mem.total) * 100;
  const mainDiskPct = disks.length > 0 ? (disks[0].used / disks[0].total) * 100 : 0;

  return (
    <div className="min-h-screen bg-background">
      <HeaderStrip server={server} dataSource={source} />

      <main className="container py-6 space-y-4">
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
          {disks.length > 0 && (
            <MetricCard
              title={`Disk (${disks[0].mountPoint})`}
              icon={<HardDrive className="h-4 w-4 text-primary" />}
              value={`${formatBytes(disks[0].used)} / ${formatBytes(disks[0].total)}`}
              percentage={mainDiskPct}
              subtitle={`${disks[0].device} · ${disks[0].filesystem}`}
            />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CpuCoreGrid coreUsages={cpu.coreUsages} />
          <DiskTable disks={disks} />
        </div>

        <ProcessTable processes={processesByCpu} title="Top 5 Processes" subtitle="By CPU usage" />
        <ProcessTable processes={processesByMem} title="Top 5 Processes" subtitle="By Memory usage" />

        <SystemInfoPanel server={server} network={network} />
      </main>
    </div>
  );
};

export default Index;
