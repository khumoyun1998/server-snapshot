import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, TriangleAlert, BellOff, ServerCrash, Activity, Boxes, HardDrive, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchAlerts, type AlertItem, type AlertsResponse } from "@/lib/serverApi";

const typeIcon: Record<string, React.ReactNode> = {
  down: <ServerCrash className="h-4 w-4" />,
  service: <ServerCrash className="h-4 w-4" />,
  process: <Activity className="h-4 w-4" />,
  container: <Boxes className="h-4 w-4" />,
  disk: <HardDrive className="h-4 w-4" />,
  threshold: <Cpu className="h-4 w-4" />,
};

const AlertRow = ({ a }: { a: AlertItem }) => {
  const critical = a.severity === "critical";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3",
        critical
          ? "border-destructive/40 bg-destructive/10"
          : "border-warning/40 bg-warning/10"
      )}
    >
      <span className={cn("shrink-0", critical ? "text-destructive" : "text-warning")}>
        {typeIcon[a.type] ?? <TriangleAlert className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground truncate">{a.message}</p>
        <p className="text-xs text-muted-foreground font-mono">{a.server}</p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
          critical ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"
        )}
      >
        {a.severity}
      </span>
    </div>
  );
};

const AlertsPanel = ({ base = "" }: { base?: string }) => {
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    const r = await fetchAlerts(base);
    if (r === null) {
      setAvailable(false);
      return;
    }
    setAvailable(true);
    setData(r);
  }, [base]);

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 8000);
    return () => clearInterval(i);
  }, [refresh]);

  if (!available || !data) return null; // no central monitor → panel hidden

  const { alerts, muted } = data;
  const critical = alerts.filter((a) => a.severity === "critical").length;

  return (
    <div className="bg-card border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {alerts.length === 0 ? (
            <ShieldCheck className="h-5 w-5 text-success" />
          ) : (
            <TriangleAlert className="h-5 w-5 text-destructive" />
          )}
          <h2 className="text-base font-semibold text-foreground">Active Alerts</h2>
          {alerts.length > 0 && (
            <span className="rounded-full bg-destructive/15 text-destructive text-xs font-medium px-2.5 py-0.5">
              {alerts.length}
              {critical > 0 ? ` · ${critical} critical` : ""}
            </span>
          )}
        </div>
        {muted && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BellOff className="h-3.5 w-3.5" /> muted
          </span>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-4">
          <ShieldCheck className="h-5 w-5 text-success" />
          <p className="text-sm text-foreground">All systems normal — no active alerts.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <AlertRow key={`${a.server}-${a.type}-${i}`} a={a} />
          ))}
        </div>
      )}
    </div>
  );
};

export default AlertsPanel;
