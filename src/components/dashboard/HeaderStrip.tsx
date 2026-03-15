import { Server, Clock, Wifi } from "lucide-react";
import type { ServerInfo } from "@/lib/mockServerData";

interface HeaderStripProps {
  server: ServerInfo;
}

const HeaderStrip = ({ server }: HeaderStripProps) => {
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
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-pulse-live absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
          </span>
          <span className="text-sm font-medium text-success">Live</span>
        </div>
      </div>
    </header>
  );
};

export default HeaderStrip;
