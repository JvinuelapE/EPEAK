// The analysis panels under a plot: limits (pass/fail), event rules, steady states, and the
// oscillation finder drawer. Results come from the server at full resolution for the points in view.
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { LuEqual, LuPlus, LuShieldCheck, LuTrash2, LuWaves, LuX, LuZap, LuChevronRight, LuTriangleAlert } from "react-icons/lu";
import { api } from "../api";
import {
  EVENT_KINDS, defaultSteady, durUnit, eventKind, hasLimit, limitScope, limitText, newRule, workspaceKey,
} from "../analysis";
import { buildSpectrumFigure, traceColor } from "../figures";
import { isExpired } from "../hooks";
import { openModal, useApp } from "../store";
import type {
  HowTopic, DatasetInfo, DatasetTrace, EventRule, EventsResponse, Limit, LimitOverrides, LimitsResponse, PlotStyle, Range,
  SpectrumResponse, SteadyConfig, SteadyResponse,
} from "../types";
import { fmtAxis, fmtNum, plural } from "../util";
import { Plot } from "./Plot";
import { Button, Callout, Checkbox, Combo, CommitInput, Drawer, IconButton, NumberInput, Segmented, Spinner, Toggle, cx } from "./ui";

const traceName = (t: DatasetTrace, style?: PlotStyle) => style?.traces?.[t.col]?.name?.trim() || t.col;

function TraceLabel({ t, i, style }: { t: DatasetTrace; i: number; style?: PlotStyle }) {
  return (
    <span className="xtrace" title={t.col}>
      <i className="swatch" style={{ background: traceColor(i, t, style) }} />
      <span className="truncate">{traceName(t, style)}</span>
      {t.axis === "y2" && <span className="axis-tag" title="Right axis">R</span>}
    </span>
  );
}

/** "How this works" link that opens the explanation of a piece of analysis. */
export function HowLink({ topic, children = "How this works" }: { topic: HowTopic; children?: ReactNode }) {
  return <button type="button" className="link small how-link" onClick={() => openModal({ kind: "how", topic })}>{children}</button>;
}

function PanelHead({ icon, title, hint, how, onClose, children }: {
  icon: ReactNode; title: string; hint?: ReactNode; how?: HowTopic; onClose: () => void; children?: ReactNode;
}) {
  return (
    <div className="xpanel-head">
      <span className="xpanel-icon">{icon}</span>
      <b>{title}</b>
      {hint && <span className="muted small">{hint}</span>}
      {how && <HowLink topic={how} />}
      <span className="grow" />
      {children}
      <IconButton label={`Close ${title.toLowerCase()}`} onClick={onClose}><LuX size={14} /></IconButton>
    </div>
  );
}

/** Number box that can be left empty (null), committed on Enter or blur. */
export function NullableNumber({ value, onCommit, placeholder, disabled, className }: {
  value: number | null | undefined; onCommit: (v: number | null) => void; placeholder?: string; disabled?: boolean; className?: string;
}) {
  return (
    <CommitInput type="number" className={cx("input-sm input-num", className)} value={value ?? ""} placeholder={placeholder} disabled={disabled}
      onCommit={(s) => {
        if (!s.trim()) return onCommit(null);
        const n = Number(s);
        onCommit(Number.isFinite(n) ? n : null);
      }} />
  );
}

// ------------------------------------------------------------------ limits

export function LimitsPanel({ traces, style, wsLimits, overrides, results, loading, onOverrides, onWsLimit, onClose }: {
  traces: DatasetTrace[]; style?: PlotStyle; wsLimits?: Record<string, Limit>; overrides?: LimitOverrides;
  results: LimitsResponse | null; loading: boolean;
  onOverrides: (o: LimitOverrides) => void; onWsLimit: (key: string, l: Limit | null) => void; onClose: () => void;
}) {
  return (
    <section className="xpanel" data-tour="panel-limits">
      <PanelHead icon={<LuShieldCheck size={14} />} title="Limits" hint="pass/fail for the points in view" how="limits" onClose={onClose}>
        {loading && <Spinner size={12} />}
        <button type="button" className="link small" onClick={() => openModal({ kind: "limits" })}>All workspace limits…</button>
      </PanelHead>
      <div className="xgrid" style={{ gridTemplateColumns: "minmax(150px, 1.3fr) auto 112px 112px minmax(170px, 1.2fr)" }}>
        <span className="xh">Trace</span><span className="xh">Applies to</span><span className="xh">Lower</span><span className="xh">Upper</span><span className="xh">Result in view</span>
        {traces.map((t, i) => {
          const scope = limitScope(t.col, wsLimits, overrides);
          const key = workspaceKey(t.col, wsLimits);
          const cur: Limit = scope === "plot" ? (overrides?.[t.col] as Limit) : scope === "workspace" ? wsLimits![key] : { lo: null, hi: null };
          const setVals = (l: Limit) => (scope === "plot" ? onOverrides({ ...overrides, [t.col]: l }) : onWsLimit(key, hasLimit(l) ? l : null));
          const setScope = (v: "workspace" | "plot" | "off") => {
            const next: LimitOverrides = { ...(overrides ?? {}) };
            if (v === "workspace") {
              const mine = overrides?.[t.col];
              delete next[t.col];
              onOverrides(next);
              if (hasLimit(mine) && !hasLimit(wsLimits?.[key])) onWsLimit(key, mine); // keep the values just typed
            } else if (v === "plot") {
              next[t.col] = hasLimit(cur) ? { lo: cur.lo, hi: cur.hi } : { lo: null, hi: null };
              onOverrides(next);
            } else {
              next[t.col] = null;
              onOverrides(next);
            }
          };
          const r = results?.results[t.col];
          const off = scope === "off";
          return (
            <div key={t.col} style={{ display: "contents" }}>
              <TraceLabel t={t} i={i} style={style} />
              <Segmented size="sm" value={scope === "none" ? "workspace" : scope} onChange={setScope}
                options={[
                  { value: "workspace", label: "All plots", title: `Workspace limit for “${key}”: used wherever it is plotted and in reports` },
                  { value: "plot", label: "This plot", title: "A limit for this plot only" },
                  { value: "off", label: "Off", title: "No limit on this plot" },
                ]} />
              <NullableNumber value={off ? null : cur.lo} disabled={off} placeholder="none" onCommit={(lo) => setVals({ lo, hi: cur.hi })} />
              <NullableNumber value={off ? null : cur.hi} disabled={off} placeholder="none" onCommit={(hi) => setVals({ lo: cur.lo, hi })} />
              <span className="xresult">
                {!r ? <span className="muted">{off ? "Off on this plot" : hasLimit(cur) ? "…" : "No limit"}</span>
                  : r.pass === null ? <span className="muted">No data in view</span>
                  : r.pass ? <span className="verdict is-pass">PASS</span>
                  : <span className="verdict is-fail" title={`${r.above} above, ${r.below} below`}>
                    FAIL · {plural(r.out, "sample")} ({fmtNum(r.pct)} %) · worst +{fmtNum(r.worst)}
                  </span>}
              </span>
            </div>
          );
        })}
      </div>
      <p className="muted small xfoot">
        <b>All plots</b> sets the limit once for the variable: it applies everywhere it is plotted and in the report's pass/fail table.
        <b> This plot</b> overrides it here only. Leave a box empty for a one-sided limit.
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ events

export function EventsPanel({ ds, traces, style, rules, results, limits, loading, show, onShow, onRules, onZoom, onClose }: {
  ds: DatasetInfo; traces: DatasetTrace[]; style?: PlotStyle; rules: EventRule[]; results: EventsResponse | null;
  limits: Record<string, Limit>; loading: boolean; show: boolean; onShow: (v: boolean) => void;
  onRules: (r: EventRule[]) => void; onZoom: (a: number, b: number) => void; onClose: () => void;
}) {
  const [sel, setSel] = useState<string | null>(rules[0]?.id ?? null);
  const unit = durUnit(ds.xKind);
  const opts = traces.map((t) => ({ value: t.col, label: traceName(t, style) }));
  const setRule = (id: string, patch: Partial<EventRule>) => onRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const selRule = rules.find((r) => r.id === sel);
  const selRes = selRule ? results?.rules[selRule.id] : undefined;
  return (
    <section className="xpanel" data-tour="panel-events">
      <PanelHead icon={<LuZap size={14} />} title="Events" hint="whole plot · click an event to zoom to it" how="events" onClose={onClose}>
        {loading && <Spinner size={12} />}
        <Toggle checked={show} onChange={onShow} label="Shade on plot" />
      </PanelHead>
      {rules.length > 0 && (
        <div className="xgrid" style={{ gridTemplateColumns: "24px minmax(140px, 1.2fr) 150px 112px 112px minmax(140px, 1fr) 30px" }}>
          <span className="xh" /><span className="xh">Trace</span><span className="xh">Type</span><span className="xh">Value</span>
          <span className="xh">Min duration ({unit})</span><span className="xh">Found</span><span className="xh" />
          {rules.map((r) => {
            const k = eventKind(r.kind);
            const res = results?.rules[r.id];
            const lim = r.col ? limits[r.col] : undefined;
            return (
              <div key={r.id} style={{ display: "contents" }}>
                <Checkbox checked={r.enabled} onChange={(enabled) => setRule(r.id, { enabled })} />
                <Combo dense options={opts} value={r.col} clearable={false} onChange={(col) => setRule(r.id, { col })} placeholder="Trace…" />
                <Combo dense options={EVENT_KINDS.map((e) => ({ value: e.value, label: e.label, hint: undefined }))} value={r.kind} clearable={false}
                  onChange={(v) => setRule(r.id, { kind: (v ?? "above") as EventRule["kind"] })} title={k.title} />
                {r.kind === "outside"
                  ? <span className="muted small" title="Set in the Limits panel">{lim ? limitText(lim) : "no limits set"}</span>
                  : <NullableNumber value={r.value} placeholder={k.valueLabel} onCommit={(value) => setRule(r.id, { value })} />}
                {k.durable
                  ? <NumberInput className="input-sm" value={r.minDur} step={0.1} min={0} onCommit={(minDur) => setRule(r.id, { minDur })} />
                  : <span className="muted small">{r.kind === "dropout" ? `gap in ${unit}` : "—"}</span>}
                <span className="xresult">
                  {!r.enabled ? <span className="muted">Off</span>
                    : res?.error ? <span className="danger-text small" title={res.error}><LuTriangleAlert size={12} /> {res.error}</span>
                    : res ? (
                      <button type="button" className={cx("xlink", sel === r.id && "is-on")} onClick={() => setSel(r.id)} disabled={!res.count}>
                        {plural(res.count, "event")}{res.count ? ` · ${fmtNum(res.totalDur)} ${unit}` : ""}{res.count > 0 && <LuChevronRight size={12} />}
                      </button>
                    ) : <span className="muted">…</span>}
                </span>
                <IconButton label="Delete rule" variant="danger" onClick={() => onRules(rules.filter((x) => x.id !== r.id))}><LuTrash2 size={14} /></IconButton>
              </div>
            );
          })}
        </div>
      )}
      <div className="xactions">
        <Button size="sm" icon={<LuPlus size={13} />} onClick={() => { const r = newRule(traces[0]?.col ?? null); onRules([...rules, r]); setSel(r.id); }}>Add rule</Button>
        {!rules.length && <span className="muted small">Find every place a trace crosses a threshold, leaves its limits, steps, spikes or drops out.</span>}
      </div>
      {selRule && selRes && selRes.count > 0 && (
        <div className="xlist">
          <div className="xlist-row xlist-head"><span>#</span><span>Start</span><span>End</span><span>Duration ({unit})</span>
            <span>{selRule.kind === "step" ? "Change" : selRule.kind === "dropout" ? "" : "Peak"}</span></div>
          <div className="xlist-body">
            {selRes.events.map((e, i) => (
              <button type="button" key={i} className="xlist-row" onClick={() => onZoom(e.start, e.end)} title="Zoom to this event">
                <span className="muted">{i + 1}</span><span>{fmtAxis(e.start, ds.xKind)}</span><span>{fmtAxis(e.end, ds.xKind)}</span>
                <span className="num">{fmtNum(e.dur)}</span><span className="num">{selRule.kind === "dropout" ? "" : fmtNum(e.peak)}</span>
              </button>
            ))}
          </div>
          {selRes.truncated && <p className="muted small xfoot">Only the first {selRes.events.length.toLocaleString()} of {selRes.count.toLocaleString()} are listed. A stricter threshold or a longer minimum duration narrows them down.</p>}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ steady states

export function SteadyPanel({ ds, traces, style, cfg, result, error, loading, show, onShow, onCfg, onZoom, onClose }: {
  ds: DatasetInfo; traces: DatasetTrace[]; style?: PlotStyle; cfg: SteadyConfig | null | undefined; result: SteadyResponse | null;
  error: string | null; loading: boolean; show: boolean; onShow: (v: boolean) => void;
  onCfg: (c: SteadyConfig | null) => void; onZoom: (a: number, b: number) => void; onClose: () => void;
}) {
  const unit = durUnit(ds.xKind);
  const opts = traces.map((t) => ({ value: t.col, label: traceName(t, style) }));
  const set = (p: Partial<SteadyConfig>) => cfg && onCfg({ ...cfg, ...p });
  return (
    <section className="xpanel" data-tour="panel-steady">
      <PanelHead icon={<LuEqual size={14} />} title="Steady states" hint="whole plot · click a row to zoom to it" how="steady" onClose={onClose}>
        {loading && <Spinner size={12} />}
        {cfg && <Toggle checked={show} onChange={onShow} label="Shade on plot" />}
      </PanelHead>
      {!cfg ? (
        <div className="xactions">
          <Button size="sm" variant="primary" onClick={() => onCfg(defaultSteady(traces[0]?.col ?? null))}>Find steady states</Button>
          <span className="muted small">Finds the stable plateaus of one trace (for example each load level of a calibration run) and gives the mean and σ of every trace over each one.</span>
        </div>
      ) : (
        <>
          <div className="xcfg">
            <label className="field"><span className="field-label">Detect on</span>
              <Combo dense options={opts} value={cfg.col} clearable={false} onChange={(col) => set({ col })} /></label>
            <label className="field" title="Length of the moving window the stability is measured over"><span className="field-label">Window ({unit})</span>
              <NumberInput className="input-sm" value={cfg.window} step={1} min={0} onCommit={(window) => set({ window })} /></label>
            <label className="field" title="Largest standard deviation inside the window that still counts as steady"><span className="field-label">Stable when σ ≤</span>
              <span className="xinline">
                <NumberInput className="input-sm" value={cfg.tol} step={0.1} min={0} onCommit={(tol) => set({ tol })} />
                <Segmented size="sm" value={cfg.tolMode} onChange={(tolMode) => set({ tolMode })}
                  options={[{ value: "pct", label: "% of value" }, { value: "abs", label: "absolute" }]} />
              </span></label>
            <label className="field"><span className="field-label">Min duration ({unit})</span>
              <NumberInput className="input-sm" value={cfg.minDur} step={1} min={0} onCommit={(minDur) => set({ minDur })} /></label>
            <Button size="sm" variant="ghost" onClick={() => onCfg(null)}>Turn off</Button>
          </div>
          {error && <div className="splot-warn"><LuTriangleAlert size={14} />{error}</div>}
          {result && !error && (
            result.plateaus.length === 0
              ? <p className="muted small xfoot">No steady states with these settings. Try a larger σ, a shorter window or a shorter minimum duration.</p>
              : (
                <div className="xlist">
                  <div className="xlist-row xlist-head" style={{ gridTemplateColumns: `36px 170px 110px repeat(${traces.length}, minmax(130px, 1fr))` }}>
                    <span>#</span><span>Start</span><span>Duration ({unit})</span>
                    {traces.map((t) => <span key={t.col} className="truncate" title={t.col}>{traceName(t, style)} · mean ± σ</span>)}
                  </div>
                  <div className="xlist-body">
                    {result.plateaus.map((p, i) => (
                      <button type="button" key={i} className="xlist-row" onClick={() => onZoom(p.start, p.end)} title="Zoom to this steady state"
                        style={{ gridTemplateColumns: `36px 170px 110px repeat(${traces.length}, minmax(130px, 1fr))` }}>
                        <span className="muted">{i + 1}</span><span>{fmtAxis(p.start, ds.xKind)}</span><span className="num">{fmtNum(p.dur)}</span>
                        {traces.map((t) => {
                          const s = p.stats[t.col];
                          return <span key={t.col} className="num">{s ? `${fmtNum(s.mean)} ± ${fmtNum(s.std)}` : "—"}</span>;
                        })}
                      </button>
                    ))}
                  </div>
                  {result.truncated && <p className="muted small xfoot">Only the first {result.plateaus.length} of {result.count} are listed. A longer minimum duration narrows them down.</p>}
                </div>
              )
          )}
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ oscillation finder

export function OscillationDrawer({ ds, traces, style, range, onExpired, onClose }: {
  ds: DatasetInfo; traces: DatasetTrace[]; style?: PlotStyle; range: Range; onExpired?: () => void; onClose: () => void;
}) {
  const theme = useApp((s) => s.theme);
  const [col, setCol] = useState<string | null>(traces[0]?.col ?? null);
  const [res, setRes] = useState<SpectrumResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logY, setLogY] = useState(false);
  const x0 = range?.[0] ?? null;
  const x1 = range?.[1] ?? null;

  useEffect(() => {
    if (!col) return;
    const ctl = new AbortController();
    setLoading(true);
    api.spectrum(ds.id, { col, x0, x1 }, ctl.signal)
      .then((r) => { setRes(r); setErr(null); })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        if (isExpired(e.message)) onExpired?.();
        else { setErr(e.message); setRes(null); }
      })
      .finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    return () => ctl.abort();
  }, [ds.id, col, x0, x1]); // eslint-disable-line react-hooks/exhaustive-deps

  const ti = traces.findIndex((x) => x.col === col);
  const color = ti >= 0 ? traceColor(ti, traces[ti], style) : undefined;
  const fig = useMemo(() => (res ? buildSpectrumFigure(res, theme, { logY, color }) : null), [res, theme, logY, color]);
  const per = res?.timeAxis ? " s" : "";
  const freqUnit = res?.timeAxis ? "Hz" : "1/x";
  return (
    <Drawer title="Oscillation finder" onClose={onClose} width={640}>
      <Callout>
        Finds repeating patterns in the points in view{range ? "" : " (the whole plot)"}. Logs hold about one RMS, frequency or phase value per second,
        so this shows slow oscillations and drift, such as control-loop hunting or thermal cycling. It can't show waveform harmonics.
        {" "}<HowLink topic="oscillation" />
      </Callout>
      <div className="xinline">
        <Combo options={traces.map((x) => ({ value: x.col, label: traceName(x, style) }))} value={col} clearable={false} onChange={setCol} />
        <Toggle checked={logY} onChange={setLogY} label="Log scale" />
        {loading && <Spinner size={14} />}
      </div>
      {err && <Callout kind="warn">{err}</Callout>}
      {res && fig && !err && (
        <>
          <div className="hist" data-tour="spectrum">
            <Plot data={fig.data} layout={fig.layout} height={300} config={SPECTRUM_CONFIG} />
          </div>
          <p className="muted small">
            {res.samples.toLocaleString()} samples, one every {fmtNum(res.dt)}{per} · resolution {fmtNum(res.resolution)} {freqUnit} · periods from {fmtNum(2 * res.dt)}{per} to {fmtNum(1 / res.resolution)}{per}
            {res.bridgedPct > 1 && <> · <span className="danger-text">{fmtNum(res.bridgedPct)} % of the time is a gap, bridged by straight lines</span></>}
          </p>
          {res.peaks.length ? (
            <table className="stats-table">
              <thead><tr><th>#</th><th>Period</th><th>Frequency</th><th>Amplitude</th><th title="How far the peak stands above the typical spectrum level">Above noise</th></tr></thead>
              <tbody>
                {res.peaks.map((p, i) => (
                  <tr key={i}><th>{i + 1}</th><td>{fmtNum(p.period)}{per}</td><td>{fmtNum(p.freq)} {freqUnit}</td><td>{fmtNum(p.amp)}</td><td>× {fmtNum(p.snr, 3)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">No clear oscillation in view.</p>}
          <p className="muted small">Amplitude is the size of the swing either side of the trend (a ±1 sine shows about 1). A peak well above the noise (× 5 or more) is a real oscillation; the longest periods often just reflect slow drift across the view.</p>
        </>
      )}
    </Drawer>
  );
}

const SPECTRUM_CONFIG = { displayModeBar: false };

export const AnalysisIcons = { limits: LuShieldCheck, events: LuZap, steady: LuEqual, oscillation: LuWaves };
