import { type ReactNode, useMemo } from "react";
import { LuPlus, LuX } from "react-icons/lu";
import { SeriesPlot } from "../../components/SeriesPlot";
import { HowLink } from "../../components/PlotAnalysis";
import { Button, Combo, Field, IconButton, NumberInput, CommitInput, Segmented, Empty } from "../../components/ui";
import { columnOptions, guessTimeColumn, useDataset, useLog, useLogOptions } from "../../hooks";
import { libLog, updateTab, updateWsQuiet } from "../../store";
import type {
  AppendSource, AppendTab as TAppend, CalibSource, CalibrationTab as TCalib, CompareSource, CompareTab as TCompare,
  Cursors, ErrMode, Range, SeriesTab,
} from "../../types";
import { DatasetStatus, ExcludedNote, SetupSection, SkipField, ToolLayout } from "./common";

const MAX_SOURCES = 10;

function SeriesTabView<T extends SeriesTab>({ tab, kind, cfg, setup, title, empty }: {
  tab: T; kind: string; cfg: Record<string, unknown> | null; setup: ReactNode; title: string; empty: ReactNode;
}) {
  const { info, error, loading, refresh } = useDataset(kind, cfg);
  const setRange = (r: Range) => updateWsQuiet((ws) => ({ ...ws, tabs: ws.tabs.map((t) => (t.id === tab.id ? { ...t, range: r } : t)) }));
  // cursor moves are quiet (no undo step per drag), like zooming
  const setCursors = (c: Cursors) => updateWsQuiet((ws) => ({ ...ws, tabs: ws.tabs.map((t) => (t.id === tab.id ? { ...t, cursors: c } : t)) }));
  return (
    <ToolLayout setup={setup} title={title}>
      {!cfg ? empty : (
        <DatasetStatus loading={loading} error={error}>
          {info && (
            <div className="plot-stack">
              <div className="plot-card">
                <SeriesPlot tabId={tab.id} plotKey="default" ds={info} traces={info.traces} height={480}
                  range={tab.range} onRange={setRange}
                  cursors={tab.cursors ?? null} onCursors={setCursors}
                  extras={{ limits: tab.limits, events: tab.events, steady: tab.steady }}
                  onExtras={(patch) => updateTab<T>(tab.id, () => patch as Partial<T>, `extras:${tab.id}`)}
                  markers={tab.markers} onMarkers={(m) => updateTab<T>(tab.id, () => ({ markers: m }) as Partial<T>)}
                  comment={tab.comment} onComment={(c) => updateTab<T>(tab.id, () => ({ comment: c }) as Partial<T>, `comment:${tab.id}`)}
                  onExclude={(rids) => updateTab<T>(tab.id, (t) => ({ excluded: [...t.excluded, ...rids] }) as Partial<T>)}
                  onExpired={refresh} tableCols={info.tableColumns} />
              </div>
            </div>
          )}
        </DatasetStatus>
      )}
    </ToolLayout>
  );
}

function SourceCard({ label, tone, onRemove, children }: { label: string; tone?: "ref"; onRemove?: () => void; children: ReactNode }) {
  return (
    <div className={`source-card${tone === "ref" ? " is-ref" : ""}`}>
      <div className="source-card-head">
        <span>{label}</span>
        {onRemove && <IconButton label={`Remove ${label}`} onClick={onRemove}><LuX size={14} /></IconButton>}
      </div>
      {children}
    </div>
  );
}

function LogAndTime({ logId, x, onChange }: { logId: string | null; x: string | null; onChange: (p: { logId: string | null; x: string | null }) => void }) {
  const logOpts = useLogOptions();
  const log = useLog(logId);
  return (
    <>
      <Combo options={logOpts} value={logId} placeholder="Log file…"
        onChange={(v) => {
          const l = libLog(v);
          onChange({ logId: v, x: x && l?.columns.some((c) => c.name === x) ? x : guessTimeColumn(l) });
        }} />
      <Combo options={columnOptions(log)} value={x} placeholder="Time column…" disabled={!log} title="Time column"
        onChange={(v) => onChange({ logId, x: v })} />
    </>
  );
}

// ------------------------------------------------------------------ calibration
export function CalibrationTab({ tab }: { tab: TCalib }) {
  const setSrc = (i: number, patch: Partial<CalibSource>) =>
    updateTab<TCalib>(tab.id, (t) => ({ sources: t.sources.map((s, k) => (k === i ? { ...s, ...patch } : s)), excluded: [], legacyValid: null }));
  const ready = tab.sources[0]?.logId && tab.sources[0]?.x && tab.sources[0]?.y && tab.sources.slice(1).some((s) => s.logId && s.x && s.y);
  const cfg = useMemo(() => (ready ? { sources: tab.sources, errMode: tab.errMode, skip: tab.skip, excluded: tab.excluded, legacyValid: tab.legacyValid ?? null } : null),
    [ready, tab.sources, tab.errMode, tab.skip, tab.excluded, tab.legacyValid]);

  const setup = (
    <>
      {tab.sources.map((s, i) => (
        <SourceCard key={i} label={i === 0 ? "Reference" : `Target ${i + 1}`} tone={i === 0 ? "ref" : undefined}
          onRemove={i > 1 ? () => updateTab<TCalib>(tab.id, (t) => ({ sources: t.sources.filter((_, k) => k !== i), excluded: [] })) : undefined}>
          <LogAndTime logId={s.logId} x={s.x} onChange={(p) => setSrc(i, p)} />
          <VariableSelect logId={s.logId} value={s.y} onChange={(y) => setSrc(i, { y })} />
          <OffsetField value={s.offset} onChange={(offset) => setSrc(i, { offset })} />
        </SourceCard>
      ))}
      {tab.sources.length < MAX_SOURCES && (
        <Button icon={<LuPlus size={14} />} onClick={() => updateTab<TCalib>(tab.id, (t) => ({ sources: [...t.sources, { logId: null, x: null, y: null, offset: 0 }] }))}>
          Add target
        </Button>
      )}
      <SetupSection title="Error" aside={<HowLink topic="calibration">How it's worked out</HowLink>}>
        <Segmented<ErrMode> value={tab.errMode} onChange={(v) => updateTab<TCalib>(tab.id, () => ({ errMode: v }))}
          options={[{ value: "percentage", label: "%", title: "Percentage error |tgt − ref| / ref" },
            { value: "absolute", label: "Absolute", title: "Target − reference" },
            { value: "phase", label: "Phase", title: "Angular difference, wrapped to 0–180°" }]} />
        <SkipField tab={tab} />
        <ExcludedNote tab={tab} />
      </SetupSection>
    </>
  );
  return <SeriesTabView tab={tab} kind="calibration" cfg={cfg} setup={setup} title="Calibration"
    empty={<Empty title="Set a reference and a target">Pick the reference log (ground truth) and at least one target log, each with its time column and the variable to compare. Targets are aligned to the reference within ±1 s.</Empty>} />;
}

function VariableSelect({ logId, value, onChange }: { logId: string | null; value: string | null; onChange: (v: string | null) => void }) {
  const log = useLog(logId);
  return <Combo options={columnOptions(log, { numeric: true })} value={value} placeholder="Variable…" disabled={!log} onChange={onChange} />;
}

function OffsetField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="field field-inline">
      <span className="field-label">Time offset (s)</span>
      <NumberInput value={value} step={0.1} onCommit={onChange} />
    </label>
  );
}

// ------------------------------------------------------------------ time sync (compare)
export function CompareTab({ tab }: { tab: TCompare }) {
  const setSrc = (i: number, patch: Partial<CompareSource>) =>
    updateTab<TCompare>(tab.id, (t) => ({ sources: t.sources.map((s, k) => (k === i ? { ...s, ...patch } : s)), excluded: [] }));
  const valid = tab.sources.filter((s) => s.logId && s.x);
  const ready = valid.length >= 2 && valid.some((s) => s.yl.length || s.yr.length);
  const cfg = useMemo(() => (ready ? { sources: tab.sources, skip: tab.skip, excluded: tab.excluded } : null), [ready, tab.sources, tab.skip, tab.excluded]);
  const setup = (
    <>
      {tab.sources.map((s, i) => (
        <SourceCard key={s.slot} label={`Log ${s.slot}`}
          onRemove={tab.sources.length > 2 ? () => updateTab<TCompare>(tab.id, (t) => ({ sources: t.sources.filter((_, k) => k !== i), excluded: [] })) : undefined}>
          <LogAndTime logId={s.logId} x={s.x} onChange={(p) => setSrc(i, p)} />
          <VarsMulti logId={s.logId} exclude={s.x} value={s.yl} placeholder="Left Y axis…" onChange={(yl) => setSrc(i, { yl })} />
          <VarsMulti logId={s.logId} exclude={s.x} value={s.yr} placeholder="Right Y axis…" onChange={(yr) => setSrc(i, { yr })} />
          <OffsetField value={s.offset} onChange={(offset) => setSrc(i, { offset })} />
        </SourceCard>
      ))}
      {tab.sources.length < MAX_SOURCES && (
        <Button icon={<LuPlus size={14} />} onClick={() => updateTab<TCompare>(tab.id, (t) => ({
          sources: [...t.sources, { slot: Math.max(0, ...t.sources.map((x) => x.slot)) + 1, logId: null, x: null, yl: [], yr: [], offset: 0 }],
        }))}>Add log</Button>
      )}
      <SetupSection title="Options">
        <SkipField tab={tab} />
        <ExcludedNote tab={tab} />
      </SetupSection>
    </>
  );
  return <SeriesTabView tab={tab} kind="compare" cfg={cfg} setup={setup} title="Time sync"
    empty={<Empty title="Overlay logs on one timeline">Choose two or more logs and the variables to plot. Each log starts at 0 s, so tests from different days line up; use the offset to shift a log left or right.</Empty>} />;
}

function VarsMulti({ logId, exclude, value, placeholder, onChange }: {
  logId: string | null; exclude: string | null; value: string[]; placeholder: string; onChange: (v: string[]) => void;
}) {
  const log = useLog(logId);
  return <Combo multi options={columnOptions(log, { exclude: [exclude] })} value={value} placeholder={placeholder} disabled={!log} onChange={onChange} />;
}

// ------------------------------------------------------------------ append
export function AppendTab({ tab }: { tab: TAppend }) {
  const setSrc = (i: number, patch: Partial<AppendSource>) =>
    updateTab<TAppend>(tab.id, (t) => ({ sources: t.sources.map((s, k) => (k === i ? { ...s, ...patch } : s)), excluded: [] }));
  const logs = tab.sources.map((s) => libLog(s.logId)).filter(Boolean);
  const varOpts = useMemo(() => {
    const seen = new Map<string, boolean>();
    logs.forEach((l) => l!.columns.forEach((c) => seen.set(c.name, seen.get(c.name) || c.numeric)));
    const xs = new Set(tab.sources.map((s) => s.x));
    return [...seen.keys()].filter((c) => !xs.has(c)).map((c) => ({ value: c }));
  }, [logs.map((l) => l!.id + l!.version).join(), tab.sources]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = tab.sources.some((s) => s.logId && s.x) && (tab.yl.length || tab.yr.length);
  const cfg = useMemo(() => (ready ? { sources: tab.sources, yl: tab.yl, yr: tab.yr, skip: tab.skip, excluded: tab.excluded } : null),
    [ready, tab.sources, tab.yl, tab.yr, tab.skip, tab.excluded]);
  const setup = (
    <>
      {tab.sources.map((s, i) => (
        <SourceCard key={s.slot} label={`Segment ${i + 1}`}
          onRemove={tab.sources.length > 1 ? () => updateTab<TAppend>(tab.id, (t) => ({ sources: t.sources.filter((_, k) => k !== i), excluded: [] })) : undefined}>
          <LogAndTime logId={s.logId} x={s.x} onChange={(p) => setSrc(i, p)} />
          <div className="two-col">
            <CommitInput placeholder="Trim start, e.g. 10:00:00" value={s.start} onCommit={(v) => setSrc(i, { start: v })} />
            <CommitInput placeholder="Trim end, e.g. 15:30:00" value={s.end} onCommit={(v) => setSrc(i, { end: v })} />
          </div>
        </SourceCard>
      ))}
      {tab.sources.length < MAX_SOURCES && (
        <Button icon={<LuPlus size={14} />} onClick={() => updateTab<TAppend>(tab.id, (t) => ({
          sources: [...t.sources, { slot: Math.max(0, ...t.sources.map((x) => x.slot)) + 1, logId: null, x: null, start: "", end: "" }],
        }))}>Add segment</Button>
      )}
      <SetupSection title="Plot">
        <Field label="Left Y axis"><Combo multi options={varOpts} value={tab.yl} placeholder="Variables…" onChange={(v) => updateTab<TAppend>(tab.id, () => ({ yl: v }))} /></Field>
        <Field label="Right Y axis"><Combo multi options={varOpts} value={tab.yr} placeholder="Variables…" onChange={(v) => updateTab<TAppend>(tab.id, () => ({ yr: v }))} /></Field>
        <SkipField tab={tab} />
        <ExcludedNote tab={tab} />
      </SetupSection>
    </>
  );
  return <SeriesTabView tab={tab} kind="append" cfg={cfg} setup={setup} title="Append logs"
    empty={<Empty title="Stitch segments into one timeline">Add the log segments in order and choose what to plot. Segments are joined end to end with a 1 s gap; use the trim boxes to drop dead time (any part of a timestamp works, e.g. 10:00:00).</Empty>} />;
}
