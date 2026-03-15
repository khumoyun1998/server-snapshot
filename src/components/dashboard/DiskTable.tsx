import type { DiskInfo } from "@/lib/mockServerData";
import { formatBytes } from "@/lib/mockServerData";
import { HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiskTableProps {
  disks: DiskInfo[];
}

const DiskTable = ({ disks }: DiskTableProps) => {
  return (
    <div className="bg-card border rounded-md p-4">
      <div className="flex items-center gap-2 mb-3">
        <HardDrive className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Disk Usage</h3>
      </div>
      <div className="space-y-3">
        {disks.map((d) => {
          const pct = (d.used / d.total) * 100;
          return (
            <div key={d.device}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-mono text-foreground">{d.mountPoint}</span>
                <span className="text-xs text-muted-foreground">
                  {formatBytes(d.used)} / {formatBytes(d.total)}
                </span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-warning" : "bg-primary"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="text-xs text-muted-foreground font-mono">{d.device} ({d.filesystem})</span>
                <span className="text-xs font-mono text-foreground font-medium">{pct.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DiskTable;
