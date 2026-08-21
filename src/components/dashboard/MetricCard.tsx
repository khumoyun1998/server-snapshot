interface MetricCardProps {
  title: string;
  icon: React.ReactNode;
  value: string;
  percentage: number;
  subtitle?: string;
  details?: { label: string; value: string }[];
}

const barFill = (pct: number) => {
  if (pct >= 90) return "hsl(var(--destructive))";
  if (pct >= 70) return "hsl(var(--warning))";
  return "linear-gradient(90deg, hsl(252 100% 68%), hsl(258 92% 76%))";
};

const MetricCard = ({ title, icon, value, percentage, subtitle, details }: MetricCardProps) => {
  const rounded = Math.round(percentage * 10) / 10;

  return (
    <div className="bg-card border rounded-2xl p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <h3 className="text-sm font-medium">{title}</h3>
      </div>

      <div className="mt-3 text-[2.5rem] leading-none font-semibold tabular-nums text-foreground">
        {rounded}
        <span className="text-xl font-medium text-muted-foreground">%</span>
      </div>

      <div className="mt-4 h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.min(rounded, 100)}%`, background: barFill(rounded) }}
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground font-mono">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}

      {details && (
        <div className="mt-4 pt-4 border-t space-y-1.5">
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
