import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  icon: React.ReactNode;
  value: string;
  percentage: number;
  subtitle?: string;
  details?: { label: string; value: string }[];
}

const getBarColor = (pct: number) => {
  if (pct >= 90) return "bg-destructive";
  if (pct >= 70) return "bg-warning";
  return "bg-primary";
};

const MetricCard = ({ title, icon, value, percentage, subtitle, details }: MetricCardProps) => {
  const rounded = Math.round(percentage * 10) / 10;

  return (
    <div className="bg-card border rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        </div>
        <span className="font-mono text-2xl font-bold text-foreground">{rounded}%</span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-2">
        <div
          className={cn("h-full rounded-full transition-all duration-300", getBarColor(rounded))}
          style={{ width: `${Math.min(rounded, 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground font-mono">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      {details && (
        <div className="mt-3 pt-3 border-t space-y-1">
          {details.map((d) => (
            <div key={d.label} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{d.label}</span>
              <span className="font-mono text-foreground">{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MetricCard;
