// Turns staged report items into export payloads (rendering graphs to PNG in the browser).
import { api } from "./api";
import { durUnit, extrasActive, resolveLimits, ruleLabel, rulesPayload, steadyActive } from "./analysis";
import { figureToPng } from "./components/Plot";
import { build3DFigure, buildBoxFigure, buildMatrixFigure, buildSeriesFigure, type Region } from "./figures";
import { plotTraceNames } from "./shell/StyleEditor";
import type {
  Cursors, DatasetTrace, Limit, PlotExtras, SeriesTab, StagingItem, StagingPart, Tab, WorkspaceState, LibrarySnapshot,
} from "./types";
import { buildWaveFigure } from "./waveform";

export const PART_LABEL: Record<StagingPart, string> = {
  graph: "Graphs", stats: "Statistics", limits: "Pass/fail (limits)", events: "Events", steady: "Steady states",
  data: "Processed data", notes: "Notes", ledger: "Investigation ledger", evidence: "Evidence images", raw: "Raw log",
};

const seriesKeys = (tab: Tab): string[] => (tab.type === "generic" ? tab.plots.map((p) => p.id) : ["default"]);
const extrasOf = (tab: Tab, key: string): PlotExtras =>
  tab.type === "generic" ? tab.plots.find((p) => p.id === key) ?? {} : (tab as SeriesTab);

/** What a tab can contribute to the report; pass/fail, events and steady states only when they are set up. */
export function partsFor(tab: Tab, wsLimits?: Record<string, Limit>): StagingPart[] {
  switch (tab.type) {
    case "waveform": return ["graph", "notes"];
    case "three_d": case "global_stats": return ["graph", "stats", "notes"];
    default: {
      const act = { limits: false, events: false, steady: false };
      for (const k of seriesKeys(tab)) {
        const a = extrasActive(extrasOf(tab, k), plotTraceNames(tab, k), wsLimits);
        act.limits ||= a.limits;
        act.events ||= a.events;
        act.steady ||= a.steady;
      }
      const extra: StagingPart[] = [];
      if (act.limits) extra.push("limits");
      if (act.events) extra.push("events");
      if (act.steady) extra.push("steady");
      return ["graph", "stats", ...extra, "data", "notes"];
    }
  }
}
export const csvCapable = (p: StagingPart) => p === "data" || p === "stats" || p === "raw" || p === "limits" || p === "events" || p === "steady";

/** Dataset request + plots for a time-series tab. */
export function seriesSpec(tab: Tab): { kind: string; cfg: Record<string, unknown>; plots: { key: string; title: string; traces: DatasetTrace[] | null; range: [number, number] | null; markers: Record<string, any>; comment: string; cursors: Cursors; extras: PlotExtras }[] } | null {
  switch (tab.type) {
    case "generic":
      if (!tab.logId || !tab.x) return null;
      return {
        kind: "generic", cfg: { logId: tab.logId, x: tab.x, skip: tab.skip, excluded: tab.excluded, legacyValid: tab.legacyValid ?? null },
        plots: tab.plots.map((p, i) => ({ key: p.id, title: `Plot ${i + 1}`, range: p.range, markers: p.markers, comment: p.comment, cursors: p.cursors ?? null,
          extras: { limits: p.limits, events: p.events, steady: p.steady },
          traces: [...p.yl.map((c) => ({ col: c, axis: "y" as const })), ...p.yr.map((c) => ({ col: c, axis: "y2" as const }))] })),
      };
    case "calibration":
      return { kind: "calibration", cfg: { sources: tab.sources, errMode: tab.errMode, skip: tab.skip, excluded: tab.excluded, legacyValid: tab.legacyValid ?? null },
        plots: [{ key: "default", title: tab.name, traces: null, range: tab.range, markers: tab.markers, comment: tab.comment, cursors: tab.cursors ?? null,
          extras: { limits: tab.limits, events: tab.events, steady: tab.steady } }] };
    case "compare":
      return { kind: "compare", cfg: { sources: tab.sources, skip: tab.skip, excluded: tab.excluded },
        plots: [{ key: "default", title: tab.name, traces: null, range: tab.range, markers: tab.markers, comment: tab.comment, cursors: tab.cursors ?? null,
          extras: { limits: tab.limits, events: tab.events, steady: tab.steady } }] };
    case "append":
      return { kind: "append", cfg: { sources: tab.sources, yl: tab.yl, yr: tab.yr, skip: tab.skip, excluded: tab.excluded },
        plots: [{ key: "default", title: tab.name, traces: null, range: tab.range, markers: tab.markers, comment: tab.comment, cursors: tab.cursors ?? null,
          extras: { limits: tab.limits, events: tab.events, steady: tab.steady } }] };
    default:
      return null;
  }
}

const statsRows = (table: { metrics: string[]; stats: Record<string, any> }) => ({
  kind: "stats", table,
});

export async function buildExportItems(ws: WorkspaceState, lib: LibrarySnapshot, onProgress?: (msg: string) => void) {
  const out: Record<string, unknown>[] = [];
  for (const it of ws.staging) {
    const base = { sheet: it.sheet, format: it.format, title: PART_LABEL[it.part] };
    if (it.part === "ledger") { out.push({ ...base, kind: "ledger", source: "Research hub", rows: ws.ledger }); continue; }
    if (it.part === "evidence") { out.push({ ...base, kind: "evidence", source: "Research hub", evidence: ws.evidence }); continue; }
    if (it.part === "raw") {
      const l = lib.logs.find((x) => x.id === it.logId);
      if (l) out.push({ ...base, kind: "raw_log", source: l.name, logId: l.id });
      continue;
    }
    const tab = ws.tabs.find((t) => t.id === it.tabId);
    if (!tab) continue;
    const source = tab.name;
    onProgress?.(`Preparing ${source} · ${PART_LABEL[it.part].toLowerCase()}…`);
    if (it.part === "notes") {
      const lines = tab.type === "generic"
        ? [tab.comment, ...tab.plots.map((p, i) => (p.comment ? `Plot ${i + 1}: ${p.comment}` : ""))]
        : [tab.comment];
      out.push({ ...base, kind: "text", source, lines: lines.filter(Boolean) });
      continue;
    }
    const spec = seriesSpec(tab);
    if (spec) {
      const ds = await api.dataset(spec.kind, spec.cfg);
      const traceCols = (p: (typeof spec.plots)[number]) => (p.traces ?? ds.traces).map((t) => t.col);
      const allCols = [...new Set(spec.plots.flatMap(traceCols))];
      if (it.part === "stats") out.push({ ...base, kind: "dataset_stats", source, datasetKind: spec.kind, cfg: spec.cfg, cols: allCols });
      if (it.part === "data") out.push({ ...base, kind: "dataset", source, datasetKind: spec.kind, cfg: spec.cfg, cols: tab.type === "generic" ? [ds.xLabel, ...allCols] : ds.tableColumns });
      const nameOf = (key: string, col: string) => ws.styles[tab.id]?.[key]?.traces?.[col]?.name?.trim() || col;
      // pass/fail uses each plot's visible range (like its graph and measurements); events and steady states the whole plot
      if (it.part === "limits") {
        out.push({ ...base, kind: "dataset_limits", source, datasetKind: spec.kind, cfg: spec.cfg,
          plots: spec.plots.map((p) => ({ title: p.title, range: p.range,
            checks: Object.entries(resolveLimits(traceCols(p), ws.limits, p.extras.limits))
              .map(([col, l]) => ({ col, name: nameOf(p.key, col), lo: l.lo, hi: l.hi })) })) });
      }
      if (it.part === "events") {
        out.push({ ...base, kind: "dataset_events", source, datasetKind: spec.kind, cfg: spec.cfg,
          plots: spec.plots.map((p) => {
            const cols = traceCols(p);
            const rules = rulesPayload(p.extras.events, cols, resolveLimits(cols, ws.limits, p.extras.limits));
            return { title: p.title, range: null,
              rules: rules.map((r) => ({ ...r, name: nameOf(p.key, r.col!), label: ruleLabel(r, durUnit(ds.xKind)) })) };
          }) });
      }
      if (it.part === "steady") {
        out.push({ ...base, kind: "dataset_steady", source, datasetKind: spec.kind, cfg: spec.cfg,
          plots: spec.plots.filter((p) => steadyActive(p.extras.steady, traceCols(p))).map((p) => {
            const cols = traceCols(p);
            return { title: p.title, range: null, steady: p.extras.steady, cols, names: Object.fromEntries(cols.map((c) => [c, nameOf(p.key, c)])) };
          }) });
      }
      if (it.part === "graph") {
        const images = [];
        for (const p of spec.plots) {
          const traces = p.traces ?? ds.traces;
          if (!traces.length) continue;
          const cols = traces.map((t) => t.col);
          const limits = resolveLimits(cols, ws.limits, p.extras.limits);
          const rules = rulesPayload(p.extras.events, cols, limits);
          const steady = steadyActive(p.extras.steady, cols) ? p.extras.steady : null;
          const [series, stats, evr, str] = await Promise.all([
            api.series(ds.id, { cols, x0: p.range?.[0], x1: p.range?.[1], width: 1100 }),
            api.stats(ds.id, { cols, x0: p.range?.[0], x1: p.range?.[1] }),
            rules.length ? api.events(ds.id, { rules }) : Promise.resolve(null),
            steady ? api.steady(ds.id, { cfg: steady, cols }) : Promise.resolve(null),
          ]);
          const regions: Region[] = [];
          str?.plateaus.forEach((pl, i) => regions.push({ x0: pl.start, x1: pl.end, kind: "steady", label: `#${i + 1}` }));
          if (evr) Object.values(evr.rules).forEach((r) => r.events.slice(0, 800).forEach((e) => regions.push({ x0: e.start, x1: e.end, kind: "event" })));
          const lo = p.range?.[0] ?? ds.xMin;
          const hi = p.range?.[1] ?? ds.xMax;
          const fig = buildSeriesFigure({ traces, series, stats, markers: p.markers, style: ws.styles[tab.id]?.[p.key], xKind: ds.xKind,
            meta: { ...ds.meta, title: tab.type === "generic" ? `${tab.name} · ${p.title}` : ds.meta.title }, range: p.range, cursors: p.cursors,
            limits, regions, xExtent: lo !== null && hi !== null ? [lo, hi] : null, theme: "light", height: 520 });
          images.push({ name: p.title, png: await figureToPng(fig.data, fig.layout) });
        }
        out.push({ ...base, kind: "images", source, images });
      }
      continue;
    }
    if (tab.type === "three_d") {
      if (!tab.logId || !tab.x || !tab.y || !tab.z) continue;
      const r = await api.threeD({ logId: tab.logId, x: tab.x, y: tab.y, z: tab.z });
      if (it.part === "stats") out.push({ ...base, ...statsRows(r.stats), source });
      if (it.part === "graph") {
        const f = build3DFigure(r, { x: tab.x, y: tab.y, z: tab.z, mode: tab.mode }, "light", tab.name, ws.styles[tab.id]?.default);
        out.push({ ...base, kind: "images", source, images: [{ name: "3D map", png: await figureToPng(f.data, f.layout, 1000, 760), rows: 32 }] });
      }
    }
    if (tab.type === "global_stats") {
      if (!tab.logId || !tab.vars.length) continue;
      const r = await api.globalStats({ logId: tab.logId, vars: tab.vars });
      if (it.part === "stats") out.push({ ...base, ...statsRows(r.table), source });
      if (it.part === "graph") {
        const box = buildBoxFigure(r.columns, r.boxes, "light", ws.styles[tab.id]?.boxplot);
        const images = [{ name: "Box plots", png: await figureToPng(box.data, box.layout, 1100, 480) }];
        if (r.columns.length > 1) {
          const m = buildMatrixFigure(r.columns, r.sample, "light", ws.styles[tab.id]?.matrix);
          const h = Math.max(520, r.columns.length * 190);
          images.push({ name: "Scatter matrix", png: await figureToPng(m.data, m.layout, Math.max(760, r.columns.length * 190), h), rows: Math.round(h / 20) + 2 } as any);
        }
        out.push({ ...base, kind: "images", source, images });
      }
    }
    if (tab.type === "waveform" && it.part === "graph") {
      const f = buildWaveFigure(tab, "light", ws.styles[tab.id]?.default);
      out.push({ ...base, kind: "images", source, images: [{ name: "Waveform", png: await figureToPng(f.data, f.layout) }] });
    }
  }
  return out;
}

export function defaultSheet(part: StagingPart, name: string) {
  const n = name.replace(/[[\]:*?/\\]/g, "-").slice(0, 31);
  return part === "ledger" || part === "evidence" ? "Research hub" : n;
}

export const stagingId = (it: Pick<StagingItem, "part" | "tabId" | "logId">) => `${it.part}:${it.tabId ?? it.logId ?? "hub"}`;
