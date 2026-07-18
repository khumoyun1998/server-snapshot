import { useState, useEffect, useCallback } from "react";
import { Boxes, Activity, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/mockServerData";
import { fetchWatch, type WatchResponse } from "@/lib/serverApi";

const StatusBadge = ({ ok, label }: { ok: boolean; label: string }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs font-mono",
      ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
    )}
  >
    <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-success" : "bg-destructive")} />
    {label}
  </span>
);

const WatchedPanel = ({ base = "" }: { base?: string }) => {
  const [data, setData] = useState<WatchResponse | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetchWatch(base);
    setData(r.data);
  }, [base]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!data) return null;
  const { processes, dockerAvailable, containers, sessions = [] } = data;
  if (processes.length === 0 && !dockerAvailable && sessions.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {processes.length > 0 && (
        <div className="bg-card border rounded-md p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Watched Processes</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">CPU %</th>
                <th className="pb-2 font-medium text-right">Mem %</th>
              </tr>
            </thead>
            <tbody>
              {processes.map((p) => (
                <tr key={p.name} className="border-t">
                  <td className="py-2 font-mono text-foreground">{p.name}</td>
                  <td className="py-2">
                    <StatusBadge
                      ok={p.running}
                      label={p.running ? (p.count > 1 ? `running ×${p.count}` : "running") : "not found"}
                    />
                  </td>
                  <td className="py-2 font-mono text-right">{p.running ? p.cpu.toFixed(1) : "—"}</td>
                  <td className="py-2 font-mono text-right">{p.running ? p.mem.toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dockerAvailable && (
        <div className={cn("bg-card border rounded-md p-4", processes.length === 0 && "lg:col-span-2")}>
          <div className="flex items-center gap-2 mb-3">
            <Boxes className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Docker Containers</h3>
            <span className="text-xs text-muted-foreground ml-auto font-mono">
              {containers.filter((c) => c.state === "running").length}/{containers.length} running
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase">
                <th className="pb-2 font-medium">Container</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">CPU %</th>
                <th className="pb-2 font-medium text-right">Memory</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c) => (
                <tr key={c.name} className="border-t">
                  <td className="py-2">
                    <span className="font-mono text-foreground">{c.name}</span>
                    <span className="block text-xs text-muted-foreground truncate max-w-[180px]">{c.image}</span>
                  </td>
                  <td className="py-2">
                    <StatusBadge ok={c.state === "running"} label={c.state} />
                  </td>
                  <td className="py-2 font-mono text-right">
                    {c.state === "running" ? c.cpu.toFixed(1) : "—"}
                  </td>
                  <td className="py-2 font-mono text-right">
                    {c.state === "running" ? formatBytes(c.memUsed) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sessions.length > 0 && (
        <div className="bg-card border rounded-md p-4 lg:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Active Sessions</h3>
            <span className="text-xs text-muted-foreground ml-auto font-mono">{sessions.length}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase">
                <th className="pb-2 font-medium">User</th>
                <th className="pb-2 font-medium">From</th>
                <th className="pb-2 font-medium">Terminal</th>
                <th className="pb-2 font-medium text-right">Since</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={i} className="border-t">
                  <td className="py-2 font-mono text-foreground">{s.user}</td>
                  <td className="py-2 font-mono">{s.host}</td>
                  <td className="py-2 font-mono text-muted-foreground">{s.terminal || "—"}</td>
                  <td className="py-2 font-mono text-right text-muted-foreground">{s.since}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default WatchedPanel;
