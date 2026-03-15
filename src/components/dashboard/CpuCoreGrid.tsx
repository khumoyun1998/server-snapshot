import { cn } from "@/lib/utils";

interface CpuCoreGridProps {
  coreUsages: number[];
}

const CpuCoreGrid = ({ coreUsages }: CpuCoreGridProps) => {
  return (
    <div className="bg-card border rounded-md p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3">CPU Cores</h3>
      <div className="grid grid-cols-4 gap-2">
        {coreUsages.map((usage, i) => {
          const rounded = Math.round(usage);
          return (
            <div key={i} className="text-center">
              <div className="relative w-full h-16 bg-muted rounded-sm overflow-hidden">
                <div
                  className={cn(
                    "absolute bottom-0 w-full transition-all duration-300 rounded-sm",
                    rounded >= 80 ? "bg-destructive/80" : rounded >= 50 ? "bg-warning/80" : "bg-primary/80"
                  )}
                  style={{ height: `${rounded}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center font-mono text-xs font-bold text-foreground">
                  {rounded}%
                </span>
              </div>
              <span className="text-xs text-muted-foreground mt-1 block">Core {i}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CpuCoreGrid;
