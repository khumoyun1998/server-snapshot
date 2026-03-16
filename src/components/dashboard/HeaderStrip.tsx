import { Server, Clock, Wifi, WifiOff } from "lucide-react";
import type { ServerInfo } from "@/lib/mockServerData";
import type { DataSource } from "@/lib/serverApi";
import { Badge } from "@/components/ui/badge";

interface HeaderStripProps {
  server: ServerInfo;
  dataSource: DataSource;
}

const HeaderStrip = ({ server, dataSource }: HeaderStripProps) => {
  const isLive = dataSource === "live";

  return (
    <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">{server.hostname}</h1>
        </div>
        <span className="text-sm text-muted-foreground font-mono">{server.ip}</span>
        <span className="text-sm text-muted-foreground">{server.os}</span>
      </div>
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Uptime: <span className="font-mono text-foreground">{server.uptime}</span></span>
        </div>
        {isLive ? (
          <Badge variant="default" className="gap-1.5 bg-success text-success-foreground border-success">
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse-live absolute inline-flex h-full w-full rounded-full bg-success-foreground opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success-foreground" />
            </span>
            <Wifi className="h-3 w-3" />
            Live
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1.5">
            <WifiOff className="h-3 w-3" />
            Mock Data
          </Badge>
        )}
      </div>
    </header>
  );
};

export default HeaderStrip;
