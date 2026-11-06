import { LuRotateCcw } from "react-icons/lu";
import { Button, Combo, Field, Modal, Toggle } from "../components/ui";
import { CHANNELS } from "../figures";
import { closeModal, updateWs, useApp } from "../store";
import type { DashStyle, PlotStyle, Tab, TraceStyle } from "../types";

/** Trace names a plot draws, derived from the tab configuration. */
export function plotTraceNames(tab: Tab, plotKey: string): string[] {
  switch (tab.type) {
    case "generic": {
      const p = tab.plots.find((q) => q.id === plotKey);
      return p ? [...p.yl, ...p.yr] : [];
    }
    case "calibration": {
      const [ref, ...tg] = tab.sources;
      const out = ref?.y ? [`REF: ${ref.y}`] : [];
      tg.forEach((s, i) => s.y && out.push(`TGT ${i + 2}: ${s.y}`));
      tg.forEach((s, i) => s.y && out.push(`Error ${i + 2}`));
      return out;
    }
    case "compare":
      return tab.sources.flatMap((s) => [...s.yl, ...s.yr].map((c) => `Log${s.slot}: ${c}`));
    case "append":
      return [...tab.yl, ...tab.yr];
    case "waveform":
      return ["Voltage", "Current"];
    case "global_stats":
      return plotKey === "boxplot" ? tab.vars : ["points"];
    default:
      return [];
  }
}

const DASHES: { value: DashStyle; label: string }[] = [
  { value: "solid", label: "Solid" }, { value: "dash", label: "Dashed" }, { value: "dot", label: "Dotted" },
  { value: "dashdot", label: "Dash-dot" }, { value: "longdash", label: "Long dash" },
];

export function StyleEditor({ tabId, plotKey }: { tabId: string; plotKey: string }) {
  const tab = useApp((s) => s.ws.tabs.find((t) => t.id === tabId));
  const style = useApp((s) => s.ws.styles[tabId]?.[plotKey]) ?? {};
  if (!tab) return null;
  const traces = plotTraceNames(tab, plotKey);
  const is3d = tab.type === "three_d";
  const plotLabel = tab.type === "generic" ? `Plot ${tab.plots.findIndex((p) => p.id === plotKey) + 1}` : plotKey === "boxplot" ? "Box plots" : plotKey === "matrix" ? "Scatter matrix" : "";

  const patch = (p: Partial<PlotStyle>) => updateWs((ws) => ({
    ...ws, styles: { ...ws.styles, [tabId]: { ...ws.styles[tabId], [plotKey]: { ...ws.styles[tabId]?.[plotKey], ...p } } },
  }), `style:${tabId}:${plotKey}:${Object.keys(p).join()}`);
  const patchTrace = (name: string, p: Partial<TraceStyle>) =>
    patch({ traces: { ...style.traces, [name]: { ...style.traces?.[name], ...p } } });
  const reset = () => updateWs((ws) => {
    const t = { ...ws.styles[tabId] };
    delete t[plotKey];
    return { ...ws, styles: { ...ws.styles, [tabId]: t } };
  });

  return (
    <Modal title="Plot style" subtitle={`${tab.name}${plotLabel ? ` · ${plotLabel}` : ""} — changes apply as you edit`} onClose={closeModal} width={680}
      footer={<><Button icon={<LuRotateCcw size={14} />} onClick={reset}>Reset to defaults</Button><span className="grow" /><Button variant="primary" onClick={closeModal}>Done</Button></>}>
      <div className="style-grid">
        <Field label="Title"><input className="input" value={style.title ?? ""} placeholder="Automatic" onChange={(e) => patch({ title: e.target.value })} /></Field>
        <Field label={is3d ? "X axis title" : "X axis title"}><input className="input" value={style.xTitle ?? ""} placeholder="Automatic" onChange={(e) => patch({ xTitle: e.target.value })} /></Field>
        <Field label={is3d ? "Y axis title" : "Left Y axis title"}><input className="input" value={style.yTitle ?? ""} placeholder="Automatic" onChange={(e) => patch({ yTitle: e.target.value })} /></Field>
        <Field label={is3d ? "Z axis title" : "Right Y axis title"}><input className="input" value={style.y2Title ?? ""} placeholder="Automatic" onChange={(e) => patch({ y2Title: e.target.value })} /></Field>
      </div>
      {!is3d && <Toggle checked={style.showLegend ?? true} onChange={(v) => patch({ showLegend: v })} label="Show legend" />}
      {traces.length > 0 && (
        <div className="trace-styles">
          <div className="trace-row trace-head"><span>Trace</span><span>Display name</span><span>Colour</span><span>Line</span><span>Width</span><span>Draw</span></div>
          {traces.map((t, i) => {
            const ts = style.traces?.[t] ?? {};
            return (
              <div key={t} className="trace-row">
                <span className="truncate" title={t}>{t}</span>
                <input className="input input-sm" value={ts.name ?? ""} placeholder={t} onChange={(e) => patchTrace(t, { name: e.target.value })} />
                <span className="color-cell">
                  <input type="color" value={ts.color || CHANNELS[i % CHANNELS.length]} onChange={(e) => patchTrace(t, { color: e.target.value })} aria-label={`Colour of ${t}`} />
                  {ts.color && <button type="button" className="link small" onClick={() => patchTrace(t, { color: null })}>auto</button>}
                </span>
                <Combo dense clearable={false} options={DASHES} value={ts.dash ?? "solid"} onChange={(v) => patchTrace(t, { dash: (v ?? "solid") as DashStyle })} />
                <input className="input input-sm input-num" type="number" min={0.5} max={8} step={0.5} value={ts.width ?? 1.5} onChange={(e) => patchTrace(t, { width: Number(e.target.value) })} />
                <Combo dense clearable={false} value={ts.mode ?? "lines"} onChange={(v) => patchTrace(t, { mode: (v ?? "lines") as TraceStyle["mode"] })}
                  options={[{ value: "lines", label: "Line" }, { value: "markers", label: "Points" }, { value: "lines+markers", label: "Both" }]} />
              </div>
            );
          })}
        </div>
      )}
      {!traces.length && !is3d && <p className="muted small">Choose variables to plot first; their traces will appear here.</p>}
    </Modal>
  );
}
