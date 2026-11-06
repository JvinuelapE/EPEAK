import { type ReactNode, useEffect, useMemo, useState } from "react";
import type Plotly from "plotly.js-dist-min";
import {
  LuChartColumnBig, LuMessageSquareText, LuMoveVertical, LuPalette, LuScan, LuSheet, LuChevronDown, LuChevronRight, LuTriangleAlert,
  LuRuler, LuCrosshair, LuShieldCheck, LuZap, LuEqual, LuWaves,
} from "react-icons/lu";
import { api } from "../api";
import { hasLimit, resolveLimits, rulesPayload, steadyActive } from "../analysis";
import { buildSeriesFigure, paddedRange, traceColor, MARKER_COLORS, type Region } from "../figures";
import { isExpired } from "../hooks";
import { onPanelRequest } from "../plotBus";
import { openModal, updateWs, useApp } from "../store";
import type {
  AtResponse, Cursors, DatasetInfo, DatasetTrace, EventsResponse, Limit, LimitsResponse, MarkerKind, Markers, PlotExtras, PlotStyle,
  Range, SeriesResponse, StatsResponse, SteadyResponse,
} from "../types";
import { axisValueToNumber, fmtAxis, fmtNum, isDateKind, parseAxisInput, plural } from "../util";
import { AnalyzeDrawer } from "./Analyze";
import { DataTable } from "./DataTable";
import { Plot } from "./Plot";
import { EventsPanel, LimitsPanel, OscillationDrawer, SteadyPanel } from "./PlotAnalysis";
import { CommitInput, IconButton, Spinner, TextArea, cx, useElementWidth } from "./ui";

export interface SeriesPlotProps {
  tabId: string;
  plotKey: string;
  ds: DatasetInfo;
  traces: DatasetTrace[];
  range: Range;
  onRange: (r: Range) => void;
  markers: Markers;
  onMarkers: (m: Markers) => void;
  comment: string;
  onComment: (s: string) => void;
  onExclude?: (rids: number[]) => void;
  onExpired?: () => void;
  /** A/B measurement cursors (x positions in axis units: ms for date/time axes). */
  cursors?: Cursors;
  onCursors?: (c: Cursors) => void;
  /** Limits, event rules and steady-state settings of this plot (omit onExtras to hide those tools). */
  extras?: PlotExtras;
  onExtras?: (patch: Partial<PlotExtras>) => void;
  tableCols?: string[];
  height?: number;
  title?: string;
  emptyHint?: ReactNode;
  dataTour?: string;
}

const READOUTS: { key: "Mean" | "Min" | "Max" | "Peak-to-Peak" | "RMS" | "Std Dev" | "Median"; label: string; title: string }[] = [
  { key: "Mean", label: "Mean", title: "Mean" },
  { key: "Min", label: "Min", title: "Minimum" },
  { key: "Max", label: "Max", title: "Maximum" },
  { key: "Peak-to-Peak", label: "Pk-pk", title: "Peak-to-peak" },
  { key: "RMS", label: "RMS", title: "Root mean square" },
  { key: "Std Dev", label: "σ", title: "Standard deviation" },
  { key: "Median", label: "Median", title: "Median" },
];
const MARKERS: { kind: MarkerKind; label: string; title: string }[] = [
  { kind: "max", label: "▼ max", title: "Mark the maximum in view" },
  { kind: "min", label: "▲ min", title: "Mark the minimum in view" },
  { kind: "mean", label: "– mean", title: "Draw the mean in view" },
  { kind: "median", label: "··· median", title: "Draw the median in view" },
];

/** Fetch a server-side analysis whenever `key` changes (null = off). Debounced and abortable. */
function useQuery<T>(key: string | null, run: (signal: AbortSignal) => Promise<T>, onExpired?: () => void) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: false });
  useEffect(() => {
    if (key === null) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    const ctl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(() => {
      run(ctl.signal)
        .then((data) => setState({ data, error: null, loading: false }))
        .catch((e: Error) => {
          if (e.name === "AbortError") return;
          if (isExpired(e.message)) onExpired?.();
          setState({ data: null, error: e.message, loading: false });
        });
    }, 160);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

const setWorkspaceLimit = (key: string, l: Limit | null) => updateWs((ws) => {
  const limits = { ...(ws.limits ?? {}) };
  if (hasLimit(l)) limits[key] = { lo: l.lo, hi: l.hi };
  else delete limits[key];
  return { ...ws, limits };
}, `limit:${key}`);

/** One plot with its scope-style readout strip, viewport stats, markers, cursors, analysis panels, data table and notes. */
export function SeriesPlot(p: SeriesPlotProps) {
  const theme = useApp((s) => s.theme);
  const style = useApp((s) => s.ws.styles[p.tabId]?.[p.plotKey]);
  const [wrap, width] = useElementWidth<HTMLDivElement>();
  const [series, setSeries] = useState<SeriesResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [cursorVals, setCursorVals] = useState<AtResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yRange, setYRange] = useState<{ y?: [number, number] | null; y2?: [number, number] | null }>({});
  const [showTable, setShowTable] = useState(false);
  const [showNotes, setShowNotes] = useState(!!p.comment);
  const [showReadout, setShowReadout] = useState(true);
  const [analyze, setAnalyze] = useState(false);
  const [height, setHeight] = useState(p.height ?? 400);
  const [openLimits, setOpenLimits] = useState(false);
  const [openEvents, setOpenEvents] = useState(false);
  const [openSteady, setOpenSteady] = useState(false);
  const [oscillation, setOscillation] = useState(false);
  const [shadeEvents, setShadeEvents] = useState(true);
  const [shadeSteady, setShadeSteady] = useState(true);
  const wsLimits = useApp((s) => s.ws.limits);

  const cols = useMemo(() => p.traces.map((t) => t.col), [p.traces]);
  const colsKey = cols.join("\u0001");
  const wBucket = Math.max(400, Math.round(width / 200) * 200);
  const x0 = p.range?.[0] ?? null;
  const x1 = p.range?.[1] ?? null;
  const cursors = p.cursors ?? null;
  const cursorKey = cursors ? cursors.join(",") : "";

  useEffect(() => setYRange({}), [p.ds.id, colsKey]);

  // the guided tours can open this plot's panels
  useEffect(() => onPanelRequest(p.tabId, p.plotKey, (panel) => {
    if (panel === "limits") setOpenLimits(true);
    else if (panel === "events") setOpenEvents(true);
    else if (panel === "steady") setOpenSteady(true);
    else if (panel === "oscillation") setOscillation(true);
    else if (panel === "table") setShowTable(true);
    else if (panel === "notes") setShowNotes(true);
    else if (panel === "readout") setShowReadout(true);
  }), [p.tabId, p.plotKey]);

  useEffect(() => {
    if (!cols.length) {
      setSeries(null);
      setStats(null);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      Promise.all([
        api.series(p.ds.id, { cols, x0, x1, width: wBucket }, ctl.signal),
        api.stats(p.ds.id, { cols, x0, x1 }, ctl.signal),
      ])
        .then(([s, st]) => {
          setSeries(s);
          setStats(st);
          setError(null);
          setLoading(false);
        })
        .catch((e: Error) => {
          if (e.name === "AbortError") return;
          setLoading(false);
          if (isExpired(e.message)) p.onExpired?.();
          else setError(e.message);
        });
    }, 90);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [p.ds.id, colsKey, x0, x1, wBucket]); // eslint-disable-line react-hooks/exhaustive-deps

  // values under the cursors come from the full-resolution data on the server, never from decimated points
  useEffect(() => {
    if (!cursors || !cols.length) {
      setCursorVals(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api.at(p.ds.id, { cols, xs: cursors }, ctl.signal)
        .then(setCursorVals)
        .catch((e: Error) => {
          if (e.name !== "AbortError" && isExpired(e.message)) p.onExpired?.();
        });
    }, 80);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [p.ds.id, colsKey, cursorKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- limits (in view), events and steady states (whole plot), all computed on the server
  const extras = p.extras ?? {};
  const limits = useMemo(() => resolveLimits(cols, wsLimits, extras.limits), [colsKey, wsLimits, extras.limits]); // eslint-disable-line react-hooks/exhaustive-deps
  const checks = useMemo(() => Object.entries(limits).map(([col, l]) => ({ col, lo: l.lo, hi: l.hi })), [limits]);
  const rules = useMemo(() => rulesPayload(extras.events, cols, limits), [extras.events, colsKey, limits]); // eslint-disable-line react-hooks/exhaustive-deps
  const steadyCfg = steadyActive(extras.steady, cols) ? extras.steady : null;
  const limitQ = useQuery<LimitsResponse>(checks.length ? `${p.ds.id}|${x0}|${x1}|${JSON.stringify(checks)}` : null,
    (signal) => api.limits(p.ds.id, { checks, x0, x1 }, signal), p.onExpired);
  const eventQ = useQuery<EventsResponse>(rules.length ? `${p.ds.id}|${JSON.stringify(rules)}` : null,
    (signal) => api.events(p.ds.id, { rules }, signal), p.onExpired);
  const steadyQ = useQuery<SteadyResponse>(steadyCfg ? `${p.ds.id}|${colsKey}|${JSON.stringify(steadyCfg)}` : null,
    (signal) => api.steady(p.ds.id, { cfg: steadyCfg!, cols }, signal), p.onExpired);
  const limitResults = limitQ.data?.results;
  const failing = limitResults ? Object.values(limitResults).filter((r) => r.pass === false).length : 0;

  const viewLo = x0 ?? p.ds.xMin;
  const viewHi = x1 ?? p.ds.xMax;
  const regions = useMemo<Region[]>(() => {
    const out: Region[] = [];
    const inView = (a: number, b: number) => (viewLo === null || b >= viewLo) && (viewHi === null || a <= viewHi);
    if (shadeSteady && steadyQ.data) {
      steadyQ.data.plateaus.forEach((pl, i) => inView(pl.start, pl.end) && out.push({ x0: pl.start, x1: pl.end, kind: "steady", label: `#${i + 1}` }));
    }
    if (shadeEvents && eventQ.data) {
      for (const r of Object.values(eventQ.data.rules)) {
        for (const e of r.events) {
          if (out.length >= 800) break;
          if (inView(e.start, e.end)) out.push({ x0: e.start, x1: e.end, kind: "event" });
        }
      }
    }
    return out;
  }, [shadeSteady, shadeEvents, steadyQ.data, eventQ.data, viewLo, viewHi]);

  const fig = useMemo(
    () => buildSeriesFigure({
      traces: p.traces, series, stats, markers: p.markers, style, xKind: p.ds.xKind,
      meta: { ...p.ds.meta, title: p.title ?? p.ds.meta.title }, range: p.range, yRange, theme, height,
      revision: `${p.ds.xKind}`, cursors, limits, regions,
      xExtent: viewLo !== null && viewHi !== null ? [viewLo, viewHi] : null,
    }),
    [p.traces, series, stats, p.markers, style, p.ds, p.title, p.range, yRange, theme, height, cursors, limits, regions, viewLo, viewHi],
  );
  const zoomTo = (a: number, b: number) => {
    const full = (p.ds.xMax ?? b) - (p.ds.xMin ?? a);
    const pad = Math.max((b - a) * 0.25, full * 0.002, isDateKind(p.ds.xKind) ? 1000 : 0);
    p.onRange([a - pad, b + pad]);
  };
  // only the cursor lines can be dragged; titles, legend and traces stay fixed
  const cursorsOn = cursors !== null;
  const plotConfig = useMemo(() => (cursorsOn ? ({ edits: { shapePosition: true } } as Partial<Plotly.Config>) : undefined), [cursorsOn]);

  const centreCursors = () => {
    if (viewLo === null || viewHi === null || !p.onCursors) return;
    const span = viewHi - viewLo;
    p.onCursors([viewLo + span / 3, viewLo + (2 * span) / 3]);
  };

  const onRelayout = (ev: unknown) => {
    const e = ev as Record<string, unknown>;
    if (cursors && p.onCursors && Object.keys(e).some((k) => /^shapes\[[01]\]/.test(k))) {
      // a cursor was dragged: keep its x (mean of both ends) and redraw it full height
      const next: [number, number] = [cursors[0], cursors[1]];
      for (const k of [0, 1] as const) {
        const whole = e[`shapes[${k}]`] as { x0?: unknown; x1?: unknown } | undefined;
        const ends = [e[`shapes[${k}].x0`] ?? whole?.x0, e[`shapes[${k}].x1`] ?? whole?.x1]
          .map((v) => (v === undefined ? null : axisValueToNumber(v, p.ds.xKind)))
          .filter((v): v is number => v !== null);
        if (ends.length) next[k] = ends.reduce((a, b) => a + b, 0) / ends.length;
      }
      p.onCursors(next);
      return;
    }
    if (e["xaxis.autorange"] || e["autosize"]) {
      if (e["xaxis.autorange"]) {
        setYRange({});
        p.onRange(null);
      }
      return;
    }
    const a = e["xaxis.range[0]"] ?? (e["xaxis.range"] as unknown[] | undefined)?.[0];
    const b = e["xaxis.range[1]"] ?? (e["xaxis.range"] as unknown[] | undefined)?.[1];
    if (a === undefined || b === undefined) return;
    const na = axisValueToNumber(a, p.ds.xKind);
    const nb = axisValueToNumber(b, p.ds.xKind);
    if (na !== null && nb !== null) p.onRange([Math.min(na, nb), Math.max(na, nb)]);
  };

  const rescaleY = () => {
    if (!stats) return;
    const left = p.traces.filter((t) => t.axis !== "y2").flatMap((t) => [stats.stats[t.col]?.Min, stats.stats[t.col]?.Max]);
    const right = p.traces.filter((t) => t.axis === "y2").flatMap((t) => [stats.stats[t.col]?.Min, stats.stats[t.col]?.Max]);
    setYRange({ y: paddedRange(left), y2: paddedRange(right) });
  };

  const toggleMarker = (col: string, k: MarkerKind) => {
    const cur = p.markers[col] ?? [];
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    const m = { ...p.markers, [col]: next };
    if (!next.length) delete m[col];
    p.onMarkers(m);
  };

  const startResize = (e: React.PointerEvent) => {
    const y0 = e.clientY;
    const h0 = height;
    const move = (ev: PointerEvent) => setHeight(Math.max(220, Math.min(1200, h0 + ev.clientY - y0)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const hasData = cols.length > 0;
  return (
    <div className="splot" data-tour={p.dataTour}>
      <div className="splot-toolbar">
        <div className="range-inputs" title="Visible X range. Type a value and press Enter, or zoom in the plot.">
          <CommitInput className="input-sm" placeholder={p.ds.xKind === "date" ? "Start (YYYY-MM-DD hh:mm:ss)" : p.ds.xKind === "time" ? "Start (hh:mm:ss)" : "Start"}
            value={fmtAxis(x0, p.ds.xKind)} onCommit={(s) => {
              const v = parseAxisInput(s, p.ds.xKind);
              p.onRange(v === null && !s.trim() && x1 === null ? null : [v ?? p.ds.xMin ?? 0, x1 ?? p.ds.xMax ?? 0]);
            }} />
          <span className="muted">→</span>
          <CommitInput className="input-sm" placeholder="End"
            value={fmtAxis(x1, p.ds.xKind)} onCommit={(s) => {
              const v = parseAxisInput(s, p.ds.xKind);
              p.onRange(v === null && !s.trim() && x0 === null ? null : [x0 ?? p.ds.xMin ?? 0, v ?? p.ds.xMax ?? 0]);
            }} />
        </div>
        <span className="splot-status">
          {loading && <Spinner size={12} />}
          {limitResults && checks.length > 0 && (
            <button type="button" className={cx("lim-chip", failing ? "is-fail" : "is-pass")} onClick={() => setOpenLimits(true)}
              title="Limits, for the points in view. Click for details.">
              {failing ? `✗ ${failing} of ${checks.length} out of limits` : `✓ within limits`}
            </button>
          )}
          {series && <span className="muted small" title={series.decimated ? "Peaks preserved; zoom in to see every sample" : undefined}>
            {plural(series.points, "point")}
            {series.decimated && <> · <button type="button" className="link" onClick={() => openModal({ kind: "how", topic: "decimation" })}
              title="The plot shows a peak-preserving summary of the points in view; the measurements use every point. Click to read how.">summarised for display</button></>}
          </span>}
        </span>
        <div className="splot-actions" data-tour="plot-tools">
          <IconButton label="Reset zoom" onClick={() => { setYRange({}); p.onRange(null); }} disabled={!hasData}><LuScan size={16} /></IconButton>
          <IconButton label="Rescale Y to the points in view" onClick={rescaleY} disabled={!stats}><LuMoveVertical size={16} /></IconButton>
          {p.onCursors && (
            <IconButton data-tour="btn-cursors" label={cursors ? "Hide cursors" : "Cursors: measure Δt, ΔY and slope between two points"} active={!!cursors}
              onClick={() => (cursors ? p.onCursors?.(null) : centreCursors())} disabled={!hasData}><LuRuler size={16} /></IconButton>
          )}
          {p.onExtras && (
            <>
              <IconButton data-tour="btn-limits" label="Limits: pass/fail against lower and upper limits" active={openLimits} className={cx(checks.length > 0 && "has-config")}
                onClick={() => setOpenLimits((v) => !v)} disabled={!hasData}><LuShieldCheck size={16} /></IconButton>
              <IconButton data-tour="btn-events" label="Events: thresholds, limits, steps, spikes and dropouts" active={openEvents} className={cx(rules.length > 0 && "has-config")}
                onClick={() => setOpenEvents((v) => !v)} disabled={!hasData}><LuZap size={16} /></IconButton>
              <IconButton data-tour="btn-steady" label="Steady states: find the stable plateaus" active={openSteady} className={cx(!!steadyCfg && "has-config")}
                onClick={() => setOpenSteady((v) => !v)} disabled={!hasData}><LuEqual size={16} /></IconButton>
            </>
          )}
          <IconButton data-tour="btn-osc" label="Oscillation finder: repeating patterns in the points in view" onClick={() => setOscillation(true)} disabled={!hasData}><LuWaves size={16} /></IconButton>
          <IconButton label="Analyse the points in view" onClick={() => setAnalyze(true)} disabled={!hasData}><LuChartColumnBig size={16} /></IconButton>
          <IconButton label="Style this plot" onClick={() => openModal({ kind: "style", tabId: p.tabId, plotKey: p.plotKey })} disabled={!hasData}><LuPalette size={16} /></IconButton>
          <IconButton label={showTable ? "Hide data" : "Show data"} active={showTable} onClick={() => setShowTable((v) => !v)} disabled={!hasData}><LuSheet size={16} /></IconButton>
          <IconButton label={showNotes ? "Hide notes" : "Notes"} active={showNotes || !!p.comment} onClick={() => setShowNotes((v) => !v)}><LuMessageSquareText size={16} /></IconButton>
        </div>
      </div>

      {p.ds.warnings.length > 0 && <div className="splot-warn"><LuTriangleAlert size={14} />{p.ds.warnings.join(" ")}</div>}
      {error && <div className="splot-warn is-error"><LuTriangleAlert size={14} />{error}</div>}

      <div ref={wrap} className="splot-canvas">
        {hasData && !series ? <div className="splot-loading" style={{ height }}><Spinner size={18} /></div>
          : hasData ? <Plot data={fig.data} layout={fig.layout} config={plotConfig} height={height} onRelayout={onRelayout} exportName={p.title || "epeak-plot"} />
          : <div className="splot-empty" style={{ height: Math.min(height, 260) }}>{p.emptyHint ?? "Choose variables to plot."}</div>}
        {hasData && <div className="splot-resize" onPointerDown={startResize} title="Drag to resize" />}
      </div>

      {hasData && (
        <div className={cx("readout", !showReadout && "is-collapsed")} data-tour="readout">
          <button type="button" className="readout-toggle" onClick={() => setShowReadout((v) => !v)} aria-expanded={showReadout}>
            {showReadout ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
            <span>Measurements {p.range ? "in view" : "· full range"}{cursors ? " · cursors A/B" : ""}</span>
          </button>
          {showReadout && (
            <div className="readout-grid" style={{ gridTemplateColumns: `minmax(160px, 1.6fr) repeat(${READOUTS.length}, minmax(64px, 1fr)) auto` }}>
              <span className="readout-h" />
              {READOUTS.map((r) => <span key={r.key} className="readout-h" title={r.title}>{r.label}</span>)}
              <span className="readout-h">Markers</span>
              {p.traces.map((t, i) => {
                const st = stats?.stats[t.col];
                const name = style?.traces?.[t.col]?.name?.trim() || t.col;
                return (
                  <div className="readout-row" key={t.col} style={{ display: "contents" }}>
                    <span className="readout-name" title={t.col}>
                      <i className="swatch" style={{ background: traceColor(i, t, style) }} />
                      <span className="truncate">{name}</span>
                      {t.axis === "y2" && <span className="axis-tag" title="Right axis">R</span>}
                      {limitResults?.[t.col] && (
                        <button type="button" onClick={() => setOpenLimits(true)}
                          className={cx("lim-badge", limitResults[t.col].pass === false && "is-fail", limitResults[t.col].pass === true && "is-pass")}
                          title={limitResults[t.col].pass === false ? `${limitResults[t.col].out} samples out of limits in view` : "Within limits in view"}>
                          {limitResults[t.col].pass === false ? "✗" : limitResults[t.col].pass ? "✓" : "–"}
                        </button>
                      )}
                    </span>
                    {READOUTS.map((r) => <span key={r.key} className="readout-v">{fmtNum(st?.[r.key] ?? null)}</span>)}
                    <span className="marker-toggles">
                      {MARKERS.map((m) => {
                        const on = p.markers[t.col]?.includes(m.kind);
                        return <button key={m.kind} type="button" className={cx("mk", on && "is-on")} title={m.title}
                          style={on ? { color: MARKER_COLORS[m.kind], borderColor: MARKER_COLORS[m.kind] } : undefined}
                          onClick={() => toggleMarker(t.col, m.kind)}>{m.label}</button>;
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {showReadout && cursors && p.onCursors && (
            <CursorBar ds={p.ds} traces={p.traces} cursors={cursors} vals={cursorVals} style={style}
              onCursors={p.onCursors} onCentre={centreCursors} />
          )}
        </div>
      )}

      {hasData && p.onExtras && openLimits && (
        <LimitsPanel traces={p.traces} style={style} wsLimits={wsLimits} overrides={extras.limits} results={limitQ.data} loading={limitQ.loading}
          onOverrides={(o) => p.onExtras?.({ limits: o })} onWsLimit={setWorkspaceLimit} onClose={() => setOpenLimits(false)} />
      )}
      {hasData && p.onExtras && openEvents && (
        <EventsPanel ds={p.ds} traces={p.traces} style={style} rules={extras.events ?? []} results={eventQ.data} limits={limits}
          loading={eventQ.loading} show={shadeEvents} onShow={setShadeEvents}
          onRules={(r) => p.onExtras?.({ events: r })} onZoom={zoomTo} onClose={() => setOpenEvents(false)} />
      )}
      {hasData && p.onExtras && openSteady && (
        <SteadyPanel ds={p.ds} traces={p.traces} style={style} cfg={extras.steady} result={steadyQ.data} error={steadyQ.error}
          loading={steadyQ.loading} show={shadeSteady} onShow={setShadeSteady}
          onCfg={(c) => p.onExtras?.({ steady: c })} onZoom={zoomTo} onClose={() => setOpenSteady(false)} />
      )}

      {showNotes && (
        <div className="splot-notes">
          <TextArea value={p.comment} onChange={p.onComment} placeholder="Observations, anomalies, test conditions…" />
        </div>
      )}
      {showTable && hasData && (
        <DataTable dsId={p.ds.id} cols={p.tableCols ?? cols} range={p.range} onExclude={p.onExclude} />
      )}
      {oscillation && <OscillationDrawer ds={p.ds} traces={p.traces} style={style} range={p.range} onExpired={p.onExpired} onClose={() => setOscillation(false)} />}
      {analyze && <AnalyzeDrawer dsId={p.ds.id} cols={cols} range={p.range} title={p.title || p.ds.meta.title || "Plot"} onClose={() => setAnalyze(false)} />}
    </div>
  );
}

/** Oscilloscope-style cursor readout: values at A and B, ΔY, slope, Δt and 1/Δt. */
function CursorBar({ ds, traces, cursors, vals, style, onCursors, onCentre }: {
  ds: DatasetInfo; traces: DatasetTrace[]; cursors: [number, number]; vals: AtResponse | null; style?: PlotStyle;
  onCursors: (c: Cursors) => void; onCentre: () => void;
}) {
  const [a, b] = cursors;
  const timeLike = isDateKind(ds.xKind) || ds.xKind === "elapsed";
  // date/time axes are in ms; elapsed axes are already in seconds
  const dt = isDateKind(ds.xKind) ? (b - a) / 1000 : b - a;
  const dtText = timeLike
    ? `${fmtNum(dt)} s${Math.abs(dt) >= 60 ? ` (${fmtAxis(Math.abs(dt) * 1000, "time")})` : ""}`
    : fmtNum(dt);
  const freq = timeLike && dt !== 0 ? `${fmtNum(1 / Math.abs(dt))} Hz` : null;
  const sampleAt = (x: number | null | undefined) => (x == null ? undefined : `Nearest sample at ${fmtAxis(x, ds.xKind)}`);
  const setOne = (k: 0 | 1, s: string) => {
    const v = parseAxisInput(s, ds.xKind);
    if (v === null) return;
    onCursors(k === 0 ? [v, b] : [a, v]);
  };
  const placeholder = ds.xKind === "date" ? "YYYY-MM-DD hh:mm:ss" : ds.xKind === "time" ? "hh:mm:ss" : "Position";

  return (
    <div className="cursor-bar" data-tour="cursor-bar">
      <div className="cursor-head">
        <span className="cursor-tag" title="Cursor A (solid line)">A</span>
        <CommitInput className="input-sm" value={fmtAxis(a, ds.xKind)} placeholder={placeholder} onCommit={(s) => setOne(0, s)} aria-label="Cursor A position" />
        <span className="cursor-tag is-b" title="Cursor B (dashed line)">B</span>
        <CommitInput className="input-sm" value={fmtAxis(b, ds.xKind)} placeholder={placeholder} onCommit={(s) => setOne(1, s)} aria-label="Cursor B position" />
        <span className="cursor-delta"><span>{timeLike ? "Δt" : "ΔX"}</span><b className="num">{dtText}</b></span>
        {freq && <span className="cursor-delta" title="1 / Δt"><span>1/Δt</span><b className="num">{freq}</b></span>}
        <span className="grow" />
        <button type="button" className="mk" onClick={onCentre} title="Move both cursors into the visible range"><LuCrosshair size={11} />Centre in view</button>
        <button type="button" className="mk" onClick={() => onCursors(null)} title="Remove the cursors">Hide</button>
      </div>
      <div className="readout-grid" style={{ gridTemplateColumns: "minmax(160px, 1.6fr) repeat(4, minmax(90px, 1fr))" }}>
        <span className="readout-h" />
        <span className="readout-h">At A</span>
        <span className="readout-h">At B</span>
        <span className="readout-h">ΔY (B − A)</span>
        <span className="readout-h" title={timeLike ? "ΔY / Δt" : "ΔY / ΔX"}>{timeLike ? "Slope (per s)" : "ΔY / ΔX"}</span>
        {traces.map((t, i) => {
          const va = vals?.values[t.col]?.[0] ?? null;
          const vb = vals?.values[t.col]?.[1] ?? null;
          const dy = va?.y != null && vb?.y != null ? vb.y - va.y : null;
          const slope = dy !== null && dt !== 0 ? dy / dt : null;
          const name = style?.traces?.[t.col]?.name?.trim() || t.col;
          return (
            <div className="readout-row" key={t.col} style={{ display: "contents" }}>
              <span className="readout-name" title={t.col}>
                <i className="swatch" style={{ background: traceColor(i, t, style) }} />
                <span className="truncate">{name}</span>
                {t.axis === "y2" && <span className="axis-tag" title="Right axis">R</span>}
              </span>
              <span className="readout-v" title={sampleAt(va?.x)}>{fmtNum(va?.y ?? null)}</span>
              <span className="readout-v" title={sampleAt(vb?.x)}>{fmtNum(vb?.y ?? null)}</span>
              <span className="readout-v">{fmtNum(dy)}</span>
              <span className="readout-v">{fmtNum(slope)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
