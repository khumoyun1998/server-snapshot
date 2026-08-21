import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { fetchHistory, type HistoryPoint } from "@/lib/serverApi";

const RANGES = [
  { label: "15m", minutes: 15 },
  { label: "1h", minutes: 60 },
  { label: "6h", minutes: 360 },
  { label: "24h", minutes: 1440 },
] as const;

// Signal palette — violet-forward, distinct hues per chart pair
const SERIES = {
  cpu: { color: "#a78bfa", label: "CPU" },
  mem: { color: "#22d3ee", label: "Memory" },
  rx: { color: "#34d399", label: "Download" },
  tx: { color: "#fb7185", label: "Upload" },
} as const;

const formatTime = (t: number) =>
  new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const Legend = ({ items }: { items: { color: string; label: string }[] }) => (
  <div className="flex items-center gap-3">
    {items.map((it) => (
      <span key={it.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: it.color }} />
        {it.label}
      </span>
    ))}
  </div>
);

const ChartTooltip = ({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { name: string; value: number; stroke: string }[];
  label?: number;
  unit: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground mb-1">{label ? formatTime(label) : ""}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 font-mono text-xs text-foreground">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.stroke }} />
          {p.name}: {p.value.toFixed(1)} {unit}
        </p>
      ))}
    </div>
  );
};

const axisStyle = { fontSize: 11, fill: "hsl(246 13% 66%)" };
const gridStroke = "hsl(240 16% 20%)";

const HistoryChartCard = ({
  title,
  unit,
  data,
  series,
  yDomain,
}: {
  title: string;
  unit: string;
  data: HistoryPoint[];
  series: { key: keyof HistoryPoint; color: string; label: string }[];
  yDomain?: [number, number];
}) => (
  <div className="bg-card border rounded-md p-4">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <Legend items={series} />
    </div>
    {data.length < 2 ? (
      <div className="h-48 flex items-center justify-center text-xs text-muted-foreground font-mono">
        Collecting data…
      </div>
    ) : (
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={formatTime}
              tick={axisStyle}
              tickLine={false}
              axisLine={{ stroke: gridStroke }}
              minTickGap={40}
            />
            <YAxis
              domain={yDomain ?? ["auto", "auto"]}
              tick={axisStyle}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              content={<ChartTooltip unit={unit} />}
              cursor={{ stroke: gridStroke, strokeWidth: 1 }}
            />
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2.2}
                fill={s.color}
                fillOpacity={0.16}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(240 20% 9%)" }}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    )}
  </div>
);

const HistoryCharts = ({ base = "" }: { base?: string }) => {
  const [minutes, setMinutes] = useState<number>(60);
  const [points, setPoints] = useState<HistoryPoint[]>([]);

  const refresh = useCallback(async () => {
    const r = await fetchHistory(minutes, base);
    setPoints(r.points);
  }, [minutes, base]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">History</h2>
        <div className="flex rounded-md border overflow-hidden">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setMinutes(r.minutes)}
              className={cn(
                "px-3 py-1 text-xs font-mono transition-colors",
                minutes === r.minutes
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <HistoryChartCard
          title="CPU & Memory"
          unit="%"
          data={points}
          yDomain={[0, 100]}
          series={[
            { key: "cpu", color: SERIES.cpu.color, label: SERIES.cpu.label },
            { key: "mem", color: SERIES.mem.color, label: SERIES.mem.label },
          ]}
        />
        <HistoryChartCard
          title="Network"
          unit="KB/s"
          data={points}
          series={[
            { key: "rxRate", color: SERIES.rx.color, label: SERIES.rx.label },
            { key: "txRate", color: SERIES.tx.color, label: SERIES.tx.label },
          ]}
        />
      </div>
    </section>
  );
};

export default HistoryCharts;
