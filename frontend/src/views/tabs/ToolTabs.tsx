import { useEffect, useMemo, useState } from "react";
import { LuChartColumnBig, LuLink, LuPalette } from "react-icons/lu";
import { api } from "../../api";
import { AnalyzeDrawer } from "../../components/Analyze";
import { Plot } from "../../components/Plot";
import { Button, Callout, Combo, Empty, Field, IconButton, NumberInput, Segmented, Spinner, TextArea, Toggle, toastError, CommitInput } from "../../components/ui";
import { build3DFigure, buildBoxFigure, buildMatrixFigure } from "../../figures";
import { columnOptions, useAbortableEffect, useDataset, useLog, useLogOptions } from "../../hooks";
import { openModal, updateTab, useApp } from "../../store";
import type { GenericTab, GlobalStatsTab as TStats, StatsResponse, ThreeDTab as T3D, WaveShape, WaveformTab as TWave } from "../../types";
import { fmtNum } from "../../util";
import { buildWaveFigure, waveReadouts } from "../../waveform";
import { SetupSection, ToolLayout } from "./common";

export function StatsTable({ table, caption }: { table: StatsResponse; caption?: string }) {
  const cols = Object.keys(table.stats);
  return (
    <div className="stats-table-wrap">
      {caption && <div className="stats-caption">{caption}</div>}
      <table className="stats-table">
        <thead><tr><th>Metric</th>{cols.map((c) => <th key={c} title={c}>{c}</th>)}</tr></thead>
        <tbody>
          {table.metrics.map((m) => (
            <tr key={m}><th>{m}</th>{cols.map((c) => <td key={c}>{fmtNum((table.stats[c] as any)?.[m] ?? null, 5)}</td>)}</tr>
          ))}
          <tr className="muted"><th>Samples</th>{cols.map((c) => <td key={c}>{table.stats[c]?.count?.toLocaleString() ?? "—"}</td>)}</tr>
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ 3D mapping
export function ThreeDTab({ tab }: { tab: T3D }) {
  const theme = useApp((s) => s.theme);
  const style = useApp((s) => s.ws.styles[tab.id]?.default);
  const libVersion = useApp((s) => s.library.version);
  const logOpts = useLogOptions();
  const log = useLog(tab.logId);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [analyze, setAnalyze] = useState(false);
  const ready = !!(tab.logId && tab.x && tab.y && tab.z);
  const set = (p: Partial<T3D>) => updateTab<T3D>(tab.id, () => p);

  useAbortableEffect(async (signal) => {
    if (!ready) { setRes(null); return; }
    setBusy(true);
    try {
      setRes(await api.threeD({ logId: tab.logId, x: tab.x, y: tab.y, z: tab.z }, signal));
      setErr(null);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr((e as Error).message);
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }, [tab.logId, tab.x, tab.y, tab.z, libVersion], 150);

  const fig = useMemo(() => (res ? build3DFigure(res, { x: tab.x!, y: tab.y!, z: tab.z!, mode: tab.mode }, theme, `3D map · ${log?.name ?? ""}`, style) : null),
    [res, tab.mode, theme, style, log?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const anaCfg = useMemo(() => (analyze && tab.logId && tab.x ? { logId: tab.logId, x: tab.x } : null), [analyze, tab.logId, tab.x]);
  const ana = useDataset("generic", anaCfg, 0);
  const cols = log?.columns.map((c) => c.name) ? columnOptions(log) : [];

  const setup = (
    <>
      <Field label="Log file"><Combo options={logOpts} value={tab.logId} placeholder="Choose a log…" onChange={(v) => set({ logId: v })} /></Field>
      <Field label="X axis"><Combo options={cols} value={tab.x} disabled={!log} onChange={(v) => set({ x: v })} /></Field>
      <Field label="Y axis"><Combo options={cols} value={tab.y} disabled={!log} onChange={(v) => set({ y: v })} /></Field>
      <Field label="Z axis (colour)"><Combo options={cols} value={tab.z} disabled={!log} onChange={(v) => set({ z: v })} /></Field>
      <Field label="Draw as">
        <Segmented value={tab.mode} onChange={(v) => set({ mode: v })}
          options={[{ value: "lines", label: "Line" }, { value: "markers", label: "Points" }, { value: "mesh", label: "Surface" }]} />
      </Field>
      <label className="field"><span className="field-label">Notes</span>
        <TextArea value={tab.comment} onChange={(c) => updateTab<T3D>(tab.id, () => ({ comment: c }), `comment:${tab.id}`)} placeholder="Observations for this map…" />
      </label>
    </>
  );
  return (
    <ToolLayout setup={setup} title="3D mapping">
      {!ready ? <Empty title="Map three variables">Pick a log and the X, Y and Z variables. Z also sets the colour scale.</Empty> : (
        <div className="plot-stack">
          {err && <Callout kind="warn">{err}</Callout>}
          <div className="plot-card">
            <div className="splot-toolbar">
              <span className="splot-status">{busy && <Spinner size={12} />}{res && <span className="muted small">{res.shown.toLocaleString()} of {res.n.toLocaleString()} points shown</span>}</span>
              <div className="splot-actions">
                <IconButton label="Analyse X, Y and Z" onClick={() => setAnalyze(true)}><LuChartColumnBig size={16} /></IconButton>
                <IconButton label="Style this plot" onClick={() => openModal({ kind: "style", tabId: tab.id, plotKey: "default" })}><LuPalette size={16} /></IconButton>
              </div>
            </div>
            {fig ? <Plot data={fig.data} layout={fig.layout} height={640} exportName={tab.name} /> : <div className="center pad"><Spinner size={20} /></div>}
          </div>
          {res && <StatsTable table={res.stats} caption="Statistics · whole log" />}
        </div>
      )}
      {analyze && ana.info && <AnalyzeDrawer dsId={ana.info.id} cols={[tab.x!, tab.y!, tab.z!]} range={null} title={tab.name} onClose={() => setAnalyze(false)} />}
    </ToolLayout>
  );
}

// ------------------------------------------------------------------ global statistics
export function GlobalStatsTab({ tab }: { tab: TStats }) {
  const theme = useApp((s) => s.theme);
  const styles = useApp((s) => s.ws.styles[tab.id]);
  const libVersion = useApp((s) => s.library.version);
  const logOpts = useLogOptions();
  const log = useLog(tab.logId);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = !!(tab.logId && tab.vars.length);

  useAbortableEffect(async (signal) => {
    if (!ready) { setRes(null); return; }
    setBusy(true);
    try {
      setRes(await api.globalStats({ logId: tab.logId, vars: tab.vars }, signal));
      setErr(null);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr((e as Error).message);
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }, [tab.logId, tab.vars.join("\u0001"), libVersion], 200);

  const box = useMemo(() => (res ? buildBoxFigure(res.columns, res.boxes, theme, styles?.boxplot) : null), [res, theme, styles?.boxplot]);
  const matrix = useMemo(() => (res && res.columns.length > 1 ? buildMatrixFigure(res.columns, res.sample, theme, styles?.matrix) : null), [res, theme, styles?.matrix]);

  const setup = (
    <>
      <Field label="Log file"><Combo options={logOpts} value={tab.logId} placeholder="Choose a log…" onChange={(v) => updateTab<TStats>(tab.id, () => ({ logId: v, vars: [] }))} /></Field>
      <Field label="Variables"><Combo multi options={columnOptions(log, { numeric: true })} value={tab.vars} disabled={!log} placeholder="Numeric columns…"
        onChange={(v) => updateTab<TStats>(tab.id, () => ({ vars: v }))} /></Field>
      <label className="field"><span className="field-label">Notes</span>
        <TextArea value={tab.comment} onChange={(c) => updateTab<TStats>(tab.id, () => ({ comment: c }), `comment:${tab.id}`)} placeholder="Observations…" />
      </label>
    </>
  );
  return (
    <ToolLayout setup={setup} title="Global statistics">
      {!ready ? <Empty title="Summarise a whole log">Pick a log and the variables to compare. You'll get summary statistics, box plots with outliers and a scatter matrix.</Empty> : (
        <div className="plot-stack">
          {err && <Callout kind="warn">{err}</Callout>}
          {busy && !res && <div className="center pad"><Spinner size={20} /></div>}
          {res && <StatsTable table={res.table} caption="Summary statistics · whole log" />}
          {box && (
            <div className="plot-card">
              <div className="plot-card-head"><span className="plot-card-title">Box plots</span><span className="muted small">Independent Y axes · whiskers at 1.5 × IQR · dashed line is the mean</span>
                <div className="plot-card-actions"><IconButton label="Style" onClick={() => openModal({ kind: "style", tabId: tab.id, plotKey: "boxplot" })}><LuPalette size={15} /></IconButton></div></div>
              <Plot data={box.data} layout={box.layout} height={460} exportName={`${tab.name}-boxplots`} />
            </div>
          )}
          {matrix && (
            <div className="plot-card">
              <div className="plot-card-head"><span className="plot-card-title">Scatter matrix</span><span className="muted small">{res.sampleSize.toLocaleString()} sampled rows · histograms on the diagonal</span>
                <div className="plot-card-actions"><IconButton label="Style" onClick={() => openModal({ kind: "style", tabId: tab.id, plotKey: "matrix" })}><LuPalette size={15} /></IconButton></div></div>
              <Plot data={matrix.data} layout={matrix.layout} height={(matrix.layout.height as number) ?? 500} exportName={`${tab.name}-matrix`} />
            </div>
          )}
        </div>
      )}
    </ToolLayout>
  );
}

// ------------------------------------------------------------------ waveform generator
export function WaveformTab({ tab }: { tab: TWave }) {
  const theme = useApp((s) => s.theme);
  const style = useApp((s) => s.ws.styles[tab.id]?.default);
  const tabs = useApp((s) => s.ws.tabs);
  const logOpts = useLogOptions();
  const linked = tabs.find((t) => t.id === tab.linkTabId && t.type === "generic") as GenericTab | undefined;
  const logId = linked ? linked.logId : tab.logId;
  const log = useLog(logId);
  const set = (p: Partial<TWave>, key?: string) => updateTab<TWave>(tab.id, () => p, key);
  const [marks, setMarks] = useState<{ rows: number; marks: { index: number; label: string }[] } | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const live = tab.live ?? true;

  // keep the log in sync with the linked 2D plot tab
  useEffect(() => {
    if (linked && linked.logId !== tab.logId) set({ logId: linked.logId });
  }, [linked?.logId]); // eslint-disable-line react-hooks/exhaustive-deps

  useAbortableEffect(async () => {
    if (!logId || !tab.timeCol) { setMarks(null); return; }
    try { setMarks(await api.logMarks(logId, tab.timeCol)); } catch { setMarks(null); }
  }, [logId, tab.timeCol, log?.version]);

  const apply = async (row = tab.row, quiet = false) => {
    if (!logId) return;
    try {
      const c = tab.cols;
      const r = await api.logRow(logId, row, [c.v, c.i, c.f, c.p, c.thdV, c.thdI], tab.timeCol);
      setLabel(r.label);
      const v = r.values;
      const patch: Partial<TWave> = { row: r.index };
      if (c.v && v[c.v] != null) patch.v = v[c.v]!;
      if (c.i && v[c.i] != null) patch.i = v[c.i]!;
      if (c.f && v[c.f] != null) patch.f = v[c.f]!;
      if (c.p && v[c.p] != null) patch.p = v[c.p]!;
      if (c.thdV && v[c.thdV] != null) patch.thdV = v[c.thdV]!;
      if (c.thdI && v[c.thdI] != null) patch.thdI = v[c.thdI]!;
      set(patch, `wave:${tab.id}`);
    } catch (e) {
      if (!quiet) toastError(e);
    }
  };

  useAbortableEffect(() => {
    if (live && logId) void apply(tab.row, true);
  }, [tab.row, live, logId, JSON.stringify(tab.cols), tab.timeCol], 60);

  const fig = useMemo(() => buildWaveFigure(tab, theme, style), [tab, theme, style]);
  const ro = waveReadouts(tab);
  const colOpts = columnOptions(log);
  const genericTabs = tabs.filter((t) => t.type === "generic").map((t) => ({ value: t.id, label: t.name }));

  const setup = (
    <>
      <SetupSection title="Signal">
        <Segmented<WaveShape> value={tab.shape} onChange={(v) => set({ shape: v })}
          options={[{ value: "sine", label: "Sine" }, { value: "square", label: "Square" }, { value: "triangle", label: "Triangle" }, { value: "sawtooth", label: "Saw" }]} />
        <div className="two-col">
          <Field label="V RMS (V)"><NumberInput value={tab.v} step={1} onCommit={(v) => set({ v })} /></Field>
          <Field label="I RMS (A)"><NumberInput value={tab.i} step={0.1} onCommit={(i) => set({ i })} /></Field>
          <Field label="Frequency (Hz)"><NumberInput value={tab.f} step={1} min={0} onCommit={(f) => set({ f })} /></Field>
          <Field label="Phase (°)"><NumberInput value={tab.p} step={1} onCommit={(p) => set({ p })} /></Field>
          <Field label="V THD (%)"><NumberInput value={tab.thdV} step={0.5} min={0} onCommit={(thdV) => set({ thdV })} /></Field>
          <Field label="I THD (%)"><NumberInput value={tab.thdI} step={0.5} min={0} onCommit={(thdI) => set({ thdI })} /></Field>
        </div>
      </SetupSection>
      <SetupSection title="Take values from a log">
        <Field label={<><LuLink size={12} /> Follow a 2D plot tab</>} hint="Uses the same log as that tab, and keeps following it.">
          <Combo options={genericTabs} value={linked ? tab.linkTabId : null} placeholder="Not linked" onChange={(v) => set({ linkTabId: v })} />
        </Field>
        {!linked && <Field label="Log file"><Combo options={logOpts} value={tab.logId} placeholder="Choose a log…" onChange={(v) => set({ logId: v })} /></Field>}
        <Field label="Time column"><Combo options={colOpts} value={tab.timeCol} disabled={!log} onChange={(v) => set({ timeCol: v })} /></Field>
        <div className="two-col">
          {(["v", "i", "f", "p", "thdV", "thdI"] as const).map((k) => (
            <Combo key={k} dense options={colOpts} value={tab.cols[k]} disabled={!log}
              placeholder={{ v: "V RMS column", i: "I RMS column", f: "Frequency column", p: "Phase column", thdV: "V THD column", thdI: "I THD column" }[k]}
              onChange={(v) => set({ cols: { ...tab.cols, [k]: v } })} />
          ))}
        </div>
      </SetupSection>
    </>
  );

  return (
    <ToolLayout setup={setup} title="Waveform generator">
      <div className="plot-stack">
        {log && (
          <div className="scrubber" data-tour="wave-scrub">
            <div className="scrubber-row">
              <CommitInput className="input-sm scrub-time" placeholder="Jump to time…" value={label ?? ""}
                onCommit={async (q) => {
                  if (!tab.timeCol || !logId) return;
                  const r = await api.logFind(logId, tab.timeCol, q).catch(() => null);
                  if (r?.index != null) set({ row: r.index });
                  else toastError(new Error(`No row matches "${q}".`));
                }} />
              <div className="scrub-track">
                <input type="range" className="scrub-range" min={0} max={Math.max(0, (marks?.rows ?? log.rows) - 1)} value={tab.row}
                  onChange={(e) => set({ row: Number(e.target.value) }, `wave:${tab.id}`)} aria-label="Row in the log" />
                {marks && <div className="scrub-marks">{marks.marks.map((m) => <span key={m.index} style={{ left: `${(m.index / Math.max(1, marks.rows - 1)) * 100}%` }}>{m.label}</span>)}</div>}
              </div>
              <span className="muted small num">row {tab.row.toLocaleString()} / {(log.rows - 1).toLocaleString()}</span>
              <Toggle checked={live} onChange={(v) => set({ live: v })} label="Live" title="Update the waveform while scrubbing" />
              {!live && <Button size="sm" variant="primary" onClick={() => apply()}>Apply values</Button>}
            </div>
          </div>
        )}
        <div className="plot-card">
          <div className="splot-toolbar">
            <span className="splot-status muted small">Two cycles reconstructed from RMS, frequency and phase{tab.thdV || tab.thdI ? ", with 3rd/5th harmonics for THD" : ""}.</span>
            <div className="splot-actions"><IconButton label="Style this plot" onClick={() => openModal({ kind: "style", tabId: tab.id, plotKey: "default" })}><LuPalette size={16} /></IconButton></div>
          </div>
          <Plot data={fig.data} layout={fig.layout} height={460} exportName={tab.name} />
          <div className="readout wave-readout">
            {ro.map((r) => <div key={r.label} className="wave-ro"><span>{r.label}</span><b className="num">{r.value}</b></div>)}
          </div>
        </div>
      </div>
    </ToolLayout>
  );
}
