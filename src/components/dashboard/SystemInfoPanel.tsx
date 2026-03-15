import type { ServerInfo, NetworkInfo } from "@/lib/mockServerData";
import { Monitor, Globe } from "lucide-react";

interface SystemInfoPanelProps {
  server: ServerInfo;
  network: NetworkInfo[];
}

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between py-1.5 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-mono text-foreground">{value}</span>
  </div>
);

const SystemInfoPanel = ({ server, network }: SystemInfoPanelProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* System Details */}
      <div className="bg-card border rounded-md p-4">
        <div className="flex items-center gap-2 mb-3">
          <Monitor className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">System Details</h3>
        </div>
        <div className="divide-y">
          <InfoRow label="OS" value={server.os} />
          <InfoRow label="Kernel" value={server.kernel} />
          <InfoRow label="Architecture" value={server.arch} />
          <InfoRow label="Last Boot" value={server.lastBoot} />
          <InfoRow label="Load Average" value={server.loadAvg.join(" / ")} />
        </div>
      </div>

      {/* Network */}
      <div className="bg-card border rounded-md p-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Network Interfaces</h3>
        </div>
        <div className="space-y-3">
          {network.map((n) => (
            <div key={n.interface} className="text-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono font-medium text-foreground">{n.interface}</span>
                <span className="text-xs text-muted-foreground">{n.speed}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>IP: <span className="font-mono text-foreground">{n.ip}</span></span>
                <span>
                  ↓ <span className="font-mono text-foreground">{n.rx.toFixed(1)}</span> MB/s
                  {" "}↑ <span className="font-mono text-foreground">{n.tx.toFixed(1)}</span> MB/s
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SystemInfoPanel;
