import type { ProcessInfo } from "@/lib/mockServerData";
import { cn } from "@/lib/utils";

interface ProcessTableProps {
  processes: ProcessInfo[];
  title?: string;
  subtitle?: string;
}

const ProcessTable = ({ processes }: ProcessTableProps) => {
  return (
    <div className="bg-card border rounded-md">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-foreground">Top 5 Processes</h3>
        <p className="text-xs text-muted-foreground mt-0.5">By CPU usage</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">PID</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">NAME</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">USER</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">CPU %</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">MEM %</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">STATUS</th>
            </tr>
          </thead>
          <tbody className="font-mono text-sm">
            {processes.map((p) => (
              <tr key={p.pid} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 text-muted-foreground">{p.pid}</td>
                <td className="px-4 py-2.5 font-medium text-foreground">{p.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.user}</td>
                <td className={cn(
                  "px-4 py-2.5 text-right font-semibold",
                  p.cpu > 20 ? "text-destructive" : p.cpu > 10 ? "text-warning" : "text-foreground"
                )}>
                  {p.cpu.toFixed(1)}
                </td>
                <td className={cn(
                  "px-4 py-2.5 text-right font-semibold",
                  p.mem > 10 ? "text-warning" : "text-foreground"
                )}>
                  {p.mem.toFixed(1)}
                </td>
                <td className="px-4 py-2.5">
                  <span className={cn(
                    "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-sm",
                    p.status === "running" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                  )}>
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      p.status === "running" ? "bg-success" : "bg-muted-foreground"
                    )} />
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProcessTable;
