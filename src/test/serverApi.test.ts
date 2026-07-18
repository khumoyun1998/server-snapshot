import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchMetrics, fetchHistory, fetchWatch, fetchServers } from "@/lib/serverApi";

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchMetrics", () => {
  it("returns live data when the API responds with JSON", async () => {
    const payload = {
      server: { hostname: "srv1" },
      cpu: { usage: 12 },
      memory: {},
      disks: [],
      processesByCpu: [],
      processesByMem: [],
      network: [],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(payload)));

    const r = await fetchMetrics();
    expect(r.source).toBe("live");
    expect(r.data.server.hostname).toBe("srv1");
  });

  it("falls back to mock data when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const r = await fetchMetrics();
    expect(r.source).toBe("mock");
    expect(r.data.server).toBeDefined();
    expect(r.data.processesByCpu.length).toBeGreaterThan(0);
  });

  it("falls back to mock data on a non-JSON response (e.g. SPA fallback page)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })
      )
    );

    const r = await fetchMetrics();
    expect(r.source).toBe("mock");
  });

  it("uses the given base URL for multi-server mode", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchMetrics("https://vps1:8001");
    expect(fetchMock).toHaveBeenCalledWith("https://vps1:8001/api/metrics");
  });
});

describe("fetchHistory", () => {
  it("returns mock series with points when the API is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));

    const r = await fetchHistory(60);
    expect(r.source).toBe("mock");
    expect(r.points.length).toBeGreaterThan(10);
    const p = r.points[0];
    expect(p.cpu).toBeGreaterThanOrEqual(0);
    expect(p.cpu).toBeLessThanOrEqual(100);
  });

  it("passes the minutes parameter to the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchHistory(360);
    expect(fetchMock).toHaveBeenCalledWith("/api/history?minutes=360");
  });
});

describe("fetchWatch", () => {
  it("returns live watch data", async () => {
    const payload = { processes: [], dockerAvailable: false, containers: [], sessions: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(payload)));

    const r = await fetchWatch();
    expect(r.source).toBe("live");
    expect(r.data.dockerAvailable).toBe(false);
  });

  it("falls back to mock watch data when unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));

    const r = await fetchWatch();
    expect(r.source).toBe("mock");
    expect(r.data.processes.length).toBeGreaterThan(0);
  });
});

describe("fetchServers", () => {
  it("returns the configured list from servers.json", async () => {
    const list = [
      { name: "home", url: "" },
      { name: "vps-1", url: "https://vps1:8001" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(list)));

    expect(await fetchServers()).toEqual(list);
  });

  it("falls back to a single same-origin entry when servers.json is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 404 })));

    const r = await fetchServers();
    expect(r).toEqual([{ name: "This server", url: "" }]);
  });

  it("falls back when servers.json is an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));

    const r = await fetchServers();
    expect(r).toHaveLength(1);
    expect(r[0].url).toBe("");
  });
});
