import { useMemo, useState } from "react";
import { LuArrowDown, LuArrowUp, LuGripVertical, LuPlus, LuTrash2 } from "react-icons/lu";
import { SeriesPlot } from "../../components/SeriesPlot";
import { Button, Combo, Empty, Field, IconButton, Toggle, cx } from "../../components/ui";
import { columnOptions, guessTimeColumn, useDataset, useLog, useLogOptions } from "../../hooks";
import { libLog, updateTab, updateWsQuiet } from "../../store";
import type { Cursors, DatasetInfo, DatasetTrace, GenericPlot, GenericTab as TGeneric, Range } from "../../types";
import { moveItem, uid } from "../../util";
import { DatasetStatus, ExcludedNote, SetupSection, SkipField, ToolLayout } from "./common";

export const newPlot = (): GenericPlot => ({ id: `plot_${uid(8)}`, yl: [], yr: [], comment: "", range: null, markers: {} });

const setPlot = (tab: TGeneric, id: string, patch: Partial<GenericPlot>, coalesce?: string) =>
  updateTab<TGeneric>(tab.id, (t) => ({ plots: t.plots.map((p) => (p.id === id ? { ...p, ...patch } : p)) }), coalesce);

export function GenericTab({ tab }: { tab: TGeneric }) {
  const logOpts = useLogOptions();
  const log = useLog(tab.logId);
  const cfg = useMemo(() => (tab.logId && tab.x ? { logId: tab.logId, x: tab.x, skip: tab.skip, excluded: tab.excluded, legacyValid: tab.legacyValid ?? null } : null),
    [tab.logId, tab.x, tab.skip, tab.excluded, tab.legacyValid]);
  const { info, error, loading, refresh } = useDataset("generic", cfg);
  const yOpts = useMemo(() => columnOptions(log, { exclude: [tab.x] }), [log, tab.x]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const setRange = (plotId: string, r: Range) => {
    // zooming should feel instant and not flood the undo history
    updateWsQuiet((ws) => ({
      ...ws,
      tabs: ws.tabs.map((t) => (t.id !== tab.id ? t : {
        ...(t as TGeneric),
        plots: (t as TGeneric).plots.map((p) => (tab.linkX || p.id === plotId ? { ...p, range: r } : p)),
      })),
    }));
  };

  // cursor moves are quiet (no undo step per drag), like zooming
  const setCursors = (plotId: string, c: Cursors) => updateWsQuiet((ws) => ({
    ...ws,
    tabs: ws.tabs.map((t) => (t.id !== tab.id ? t : {
      ...(t as TGeneric),
      plots: (t as TGeneric).plots.map((p) => (p.id === plotId ? { ...p, cursors: c } : p)),
    })),
  }));

  const setup = (
    <>
      <SetupSection>
        <Field label="Log file">
          <Combo data-tour="log-select" options={logOpts} value={tab.logId} placeholder="Choose a log…"
            onChange={(v) => {
              const next = v ? guessTimeColumn(libLog(v)) : null;
              updateTab<TGeneric>(tab.id, (t) => ({ logId: v, x: t.x && libLog(v)?.columns.some((c) => c.name === t.x) ? t.x : next, excluded: [], legacyValid: null }));
            }} />
        </Field>
        <Field label="X axis">
          <Combo options={columnOptions(log)} value={tab.x} placeholder="Time column…" disabled={!log}
            onChange={(v) => updateTab<TGeneric>(tab.id, () => ({ x: v }))} />
        </Field>
        <SkipField tab={tab} />
        <Toggle checked={tab.linkX} onChange={(v) => updateTab<TGeneric>(tab.id, (t) => {
          // align every plot to the first zoomed plot when linking
          const ref = t.plots.find((p) => p.range)?.range ?? null;
          return v ? { linkX: v, plots: t.plots.map((p) => ({ ...p, range: ref })) } : { linkX: v };
        })}
          label="Link X axes" title="Zooming one plot zooms all plots in this tab" />
        <ExcludedNote tab={tab} />
      </SetupSection>
      <SetupSection title={`Plots (${tab.plots.length})`}>
        <Button icon={<LuPlus size={14} />} onClick={() => updateTab<TGeneric>(tab.id, (t) => ({ plots: [...t.plots, { ...newPlot(), range: t.linkX ? t.plots[0]?.range ?? null : null }] }))}>Add plot</Button>
      </SetupSection>
    </>
  );

  return (
    <ToolLayout setup={setup} title="2D plot">
      {!tab.logId ? (
        <Empty title="Pick a log to plot" action={null}>Choose a log file and its time column in the setup panel. Upload logs from the Data menu.</Empty>
      ) : (
        <DatasetStatus loading={loading} error={error}>
          {info && (
            <div className="plot-stack">
              {tab.plots.map((p, i) => (
                <div key={p.id}
                  className={cx("plot-card", dragId === p.id && "is-dragging", overId === p.id && dragId !== p.id && "is-over")}
                  onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(p.id); } }}
                  onDragLeave={() => setOverId((o) => (o === p.id ? null : o))}
                  onDrop={() => {
                    if (dragId && dragId !== p.id) {
                      const from = tab.plots.findIndex((q) => q.id === dragId);
                      updateTab<TGeneric>(tab.id, (t) => ({ plots: moveItem(t.plots, from, i) }));
                    }
                    setDragId(null);
                    setOverId(null);
                  }}>
                  <PlotCard tab={tab} plot={p} index={i} info={info} yOpts={yOpts} onRange={(r) => setRange(p.id, r)} onCursors={(c) => setCursors(p.id, c)} onExpired={refresh}
                    onDragStart={() => setDragId(p.id)} onDragEnd={() => { setDragId(null); setOverId(null); }} />
                </div>
              ))}
              <button type="button" className="add-plot" onClick={() => updateTab<TGeneric>(tab.id, (t) => ({ plots: [...t.plots, { ...newPlot(), range: t.linkX ? t.plots[0]?.range ?? null : null }] }))}>
                <LuPlus size={16} /> Add plot
              </button>
            </div>
          )}
        </DatasetStatus>
      )}
    </ToolLayout>
  );
}

function PlotCard({ tab, plot, index, info, yOpts, onRange, onCursors, onExpired, onDragStart, onDragEnd }: {
  tab: TGeneric; plot: GenericPlot; index: number; info: DatasetInfo; yOpts: ReturnType<typeof columnOptions>;
  onRange: (r: Range) => void; onCursors: (c: Cursors) => void; onExpired: () => void; onDragStart: () => void; onDragEnd: () => void;
}) {
  const traces = useMemo<DatasetTrace[]>(() => [
    ...plot.yl.map((c) => ({ col: c, axis: "y" as const })),
    ...plot.yr.map((c) => ({ col: c, axis: "y2" as const })),
  ], [plot.yl, plot.yr]);
  const n = tab.plots.length;
  return (
    <>
      <div className="plot-card-head">
        <span className="drag-handle" draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", plot.id); onDragStart(); }}
          onDragEnd={onDragEnd} title="Drag to reorder"><LuGripVertical size={16} /></span>
        <span className="plot-card-title">Plot {index + 1}</span>
        <div className="plot-card-axes">
          <Combo multi dense options={yOpts} value={plot.yl} placeholder="Left Y axis…" data-tour={index === 0 ? "y-left" : undefined}
            onChange={(v) => setPlot(tab, plot.id, { yl: v })} />
          <Combo multi dense options={yOpts} value={plot.yr} placeholder="Right Y axis…"
            onChange={(v) => setPlot(tab, plot.id, { yr: v })} />
        </div>
        <div className="plot-card-actions">
          <IconButton label="Move up" disabled={index === 0} onClick={() => updateTab<TGeneric>(tab.id, (t) => ({ plots: moveItem(t.plots, index, index - 1) }))}><LuArrowUp size={15} /></IconButton>
          <IconButton label="Move down" disabled={index === n - 1} onClick={() => updateTab<TGeneric>(tab.id, (t) => ({ plots: moveItem(t.plots, index, index + 1) }))}><LuArrowDown size={15} /></IconButton>
          <IconButton label="Remove plot" variant="danger" disabled={n === 1}
            onClick={() => updateTab<TGeneric>(tab.id, (t) => ({ plots: t.plots.filter((q) => q.id !== plot.id) }))}><LuTrash2 size={15} /></IconButton>
        </div>
      </div>
      <SeriesPlot tabId={tab.id} plotKey={plot.id} ds={info} traces={traces} title={`Plot ${index + 1}`}
        range={plot.range} onRange={onRange}
        cursors={plot.cursors ?? null} onCursors={onCursors}
        extras={{ limits: plot.limits, events: plot.events, steady: plot.steady }}
        onExtras={(patch) => setPlot(tab, plot.id, patch, `extras:${plot.id}`)}
        markers={plot.markers} onMarkers={(m) => setPlot(tab, plot.id, { markers: m })}
        comment={plot.comment} onComment={(c) => setPlot(tab, plot.id, { comment: c }, `pc:${plot.id}`)}
        onExclude={(rids) => updateTab<TGeneric>(tab.id, (t) => ({ excluded: [...t.excluded, ...rids] }))}
        onExpired={onExpired}
        tableCols={[info.xLabel, ...plot.yl, ...plot.yr]}
        emptyHint="Choose variables for the left or right Y axis above." />
    </>
  );
}
