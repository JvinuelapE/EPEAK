import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LuX } from "react-icons/lu";
import { Button } from "../components/ui";
import { type PlotPanel, requestPanel } from "../plotBus";
import { closeModal, getState, setState, setView, updateWsQuiet, useApp, type View } from "../store";
import type { DemoInfo, Range, Tab } from "../types";
import { demoLog } from "./tutorial";

interface Step {
  /** data-tour anchor to highlight (the card is centred if it can't be found) */
  target?: string;
  view?: View;
  /** open this analysis tab first */
  tab?: string;
  /** what the tour does before showing the step: open a panel, zoom, open a log… */
  act?: (demo: DemoInfo | null) => void;
  title: string;
  body: string;
  side?: "right" | "bottom" | "left" | "top";
}
interface TourDef { title: string; steps: Step[] }

// ------------------------------------------------------------------ actions the tours perform
function showTab(id: string) {
  const s = getState();
  if (s.view !== "analysis") setView("analysis");
  if (s.ws.tabs.some((t) => t.id === id) && s.ws.activeTabId !== id) updateWsQuiet((ws) => ({ ...ws, activeTabId: id }));
}
const panel = (tabId: string, plotKey: string, p: PlotPanel) => () => requestPanel(tabId, plotKey, p);
/** Zoom a plot (or the whole tab when its X axes are linked). */
function zoom(tabId: string, plotKey: string, range: Range) {
  updateWsQuiet((ws) => ({
    ...ws,
    tabs: ws.tabs.map((t) => {
      if (t.id !== tabId) return t;
      if (t.type === "generic") return { ...t, plots: t.plots.map((p) => (t.linkX || p.id === plotKey ? { ...p, range } : p)) };
      return { ...t, range } as Tab;
    }),
  }));
}
const pad = ([a, b]: [number, number], by: number): [number, number] => [a - by, b + by];

// ------------------------------------------------------------------ the tours
const OVERVIEW: Step[] = [
  { title: "Welcome to E-PEAK 2.0", body: "A quick tour of where everything lives. Use the arrow keys or the buttons; press Esc to leave at any time." },
  { target: "nav-library", title: "Your logs", body: "Every CSV you upload is parsed once and kept in the library. Drop files anywhere in the window to add them. Categories, renaming and downloads live here too.", side: "right" },
  { target: "nav-hub", view: "hub", title: "Research hub", body: "Keep the story of the investigation: the ledger of hypotheses and conclusions, and an evidence board for photos and schematics.", side: "right" },
  { target: "ledger", view: "hub", title: "Investigation ledger", body: "One row per hypothesis, with the logs it refers to and a status. Everything here can go into the report.", side: "bottom" },
  { target: "nav-analysis", view: "analysis", title: "Analysis", body: "All plotting tools open as tabs here: 2D plots, calibration, time sync, append, waveforms, 3D maps and global statistics.", side: "right" },
  { target: "add-tab", view: "analysis", title: "Open a tool", body: "Start any tool from here. Drag tabs to reorder them, double-click to rename, and use the ⋯ menu to duplicate.", side: "bottom" },
  { target: "setup", view: "analysis", title: "Setup panel", body: "Each tool is configured on the left and updates as you change it — there is no Process button any more. Collapse the panel for more room.", side: "right" },
  { target: "plot-tools", view: "analysis", title: "Plot tools", body: "Every plot has its own tools: cursors (ruler) for Δt, ΔY and slope; limits (shield) for pass/fail; events (lightning) for thresholds, steps, spikes and dropouts; steady states (=) for plateaus; and the oscillation finder (waves). Then analysis, style, the data table and notes.", side: "bottom" },
  { target: "nav-editor", view: "editor", title: "Log editor", body: "Fix headers, delete bad rows, merge logs and add derived variables. Edits stay in an undoable draft until you save.", side: "right" },
  { target: "nav-report", view: "report", title: "Report studio", body: "Pick graphs, statistics, pass/fail tables, events, data, notes and hub content, arrange them into sheets, and export one Excel workbook.", side: "right" },
  { target: "menus", title: "File, Data and Help", body: "Open and save workspaces, restore autosave snapshots and import old .pkl workspaces from the File menu. Ctrl+S saves. Help → Open the tutorial starts a demo workspace with built-in logs and a guided tour of every feature.", side: "bottom" },
  { target: "ws-title", title: "Save state", body: "Shows whether the workspace has unsaved changes. Your session is also kept continuously, so closing the browser never loses work.", side: "bottom" },
  { title: "You're set", body: "Press Ctrl+K at any time to search every action, tab and log. The user guide is under Help (F1), with “How the analysis works” for the details behind each tool." },
];

const TOURS: Record<string, TourDef> = {
  overview: { title: "Overview", steps: OVERVIEW },

  tutorial: { title: "Tutorial", steps: [
    { title: "Welcome to the E-PEAK tutorial", body: "This is a complete demo workspace built from demo logs, so you can see every feature working on real-looking data. Nothing you do here touches your own logs or workspaces. Use Next or the arrow keys; Esc stops the tour." },
    { target: "tutorial-banner", title: "The tutorial bar", body: "Always at the top. “Tour this tab” explains the tab or page you're on, “How the analysis works” explains the maths in plain language, “Reset demo” puts everything back, and “Exit” closes the tutorial.", side: "bottom" },
    { target: "nav-library", title: "The demo logs", body: "Eleven logs in the formats E-PEAK reads: DIVA boards, the PPA analyser (with its # header line), PicoLog (with a blank time header and a clock passing midnight) and one badly exported file for the Log editor.", side: "right" },
    { target: "tabbar", view: "analysis", title: "One tab per feature", body: "1 · First look, 2 · Calibration, 3 · Finding problems, 4 · Comparing runs, 5 · Stitching logs, 6 · Oscillations, then statistics, 3D and waveforms. The notes under each plot say what you're looking at.", side: "bottom" },
    { tab: "demo-first", target: "readout", title: "Measurements in view", body: "Under every plot, the measurement bar shows mean, min, max, peak-to-peak, RMS, σ and median for the points currently in view. Zoom in and they update.", side: "top" },
    { target: "tutorial-banner", title: "Next: Tour this tab", body: "Each tab has its own short tour. Press “Tour this tab” on any tab, or in the Research hub, Log editor and Report studio. A good order: tabs 1 to 3, then the Report studio.", side: "bottom" },
  ] },

  "demo-first": { title: "1 · First look", steps: [
    { tab: "demo-first", act: () => zoom("demo-first", "plot_first_vi", null), target: "plot-tools", title: "A one-hour bench run", body: "Voltage on the left axis, current on the right. Zoom by dragging a box on the plot; double-click to zoom back out. Link X axes is on, so both plots zoom together. The tools on the right of this bar belong to this plot.", side: "bottom" },
    { act: panel("demo-first", "plot_first_vi", "readout"), target: "readout", title: "The measurement bar", body: "Statistics for the points in view, per trace. The ▼ max, ▲ min, mean and median buttons draw markers on the plot; the voltage maximum is marked here.", side: "top" },
    { target: "cursor-bar", title: "Cursors A and B", body: "Two cursors sit on the load ramp. The bar reads the real sample under each one, the difference ΔY, Δt and the slope: the ramp rate, about 0.033 A per second (10 A over 300 s). Drag the lines or type a position.", side: "top" },
    { target: "btn-cursors", title: "Turning cursors on", body: "The ruler button adds or removes cursors on any plot. They are saved with the workspace and appear on exported graphs.", side: "bottom" },
    { target: "setup", title: "Setup panel", body: "The log, the X axis and the plots of this tab. Add more plots, each with its own left and right axes, and drag them into order. Collapse the panel for more room.", side: "right" },
  ] },

  "demo-calib": { title: "2 · Calibration", steps: [
    { tab: "demo-calib", act: () => zoom("demo-calib", "default", null), target: "setup", title: "Reference and targets", body: "The PPA analyser's current is the reference; Targets 2 and 3 are CT A and CT B, logged by DIVA boards. Each log's time becomes elapsed seconds and each target sample is matched to the nearest reference sample within ±1 s.", side: "right" },
    { target: "plot-tools", title: "Currents and errors", body: "Five load steps (5, 10, 20, 40 and 60 A) on the left axis; the % error of each CT, dotted, on the right axis.", side: "bottom" },
    { act: panel("demo-calib", "default", "steady"), target: "panel-steady", title: "One figure per load step", body: "Steady states finds the five load steps on the reference and gives the mean ± σ of every trace on each. CT A's error stays at 0.25 %; CT B's grows with current to about 0.8 % at 60 A. Click a row to zoom to that step.", side: "top" },
    { act: panel("demo-calib", "default", "limits"), target: "panel-limits", title: "Pass/fail", body: "A 0.5 % limit is set on both error traces, for this plot only. CT A passes; CT B fails. A ✓ or ✗ also shows next to each trace in the measurement bar.", side: "top" },
    { act: (d) => d && zoom("demo-calib", "default", pad(d.calib.plateaus[4], 10)), target: "readout", title: "Just the 60 A step", body: "Zoomed into the top load step: the measurements and pass/fail now cover only this step, which is where CT B fails.", side: "top" },
    { target: "nav-report", title: "Into the report", body: "This tab's graph, steady-state table and pass/fail table are already staged in the Report studio, ready to export.", side: "right" },
  ] },

  "demo-problems": { title: "3 · Finding problems", steps: [
    { tab: "demo-problems", act: () => zoom("demo-problems", "plot_prob_v", null), target: "plot-tools", title: "Limits for the whole workspace", body: "The supply limits, 216.2 V to 253 V (UK 230 V +10 % / −6 %), are set once for V_RMS(V) and apply in every plot. Data → Limits… lists them. The limit lines are drawn and samples beyond them turn red.", side: "bottom" },
    { act: panel("demo-problems", "plot_prob_v", "events"), target: "panel-events", title: "Event rules", body: "The rule “outside limits” finds the two over-voltages, about 3 s and 7 s long. Rules can also look for values above or below a threshold, steps, spikes and dropouts, each with a minimum duration.", side: "top" },
    { act: (d) => d && zoom("demo-problems", "plot_prob_v", pad(d.bench.overvoltage[1], 40_000)), target: "readout", title: "Zoomed to an event", body: "Clicking an event zooms to it. Events are shaded orange; because Link X axes is on, the current and temperature plots below show the same moment.", side: "top" },
    { act: () => { zoom("demo-problems", "plot_prob_v", null); requestPanel("demo-problems", "plot_prob_i", "events"); requestPanel("demo-problems", "plot_prob_tc", "events"); },
      title: "Dropouts and spikes", body: "Further down, the second plot's rule finds the 40 s dropout where the board stopped logging, and the third finds three single-sample spikes on TC2." },
    { title: "Removing bad points", body: "To leave glitches out of every calculation, open the data table under a plot (the sheet button), select the rows and press Delete. They can be restored from the setup panel at any time." },
  ] },

  "demo-sync": { title: "4 · Comparing runs", steps: [
    { tab: "demo-sync", target: "setup", title: "Two days, one timeline", body: "The same heat run logged on two different days. Each log starts at 0 s. On Day 2 the load started 12 s later, so Log 2 has a time offset of −12 s.", side: "right" },
    { target: "plot-tools", title: "Lined up", body: "With the offset, the two runs lie on top of each other. That's why the ledger's “Day 2 runs hotter” hypothesis was rejected: it simply started later.", side: "bottom" },
  ] },

  "demo-append": { title: "5 · Stitching logs", steps: [
    { tab: "demo-append", target: "setup", title: "One run, three files", body: "Each segment started with a minute of idle set-up time. The trim boxes cut it off (any part of a timestamp works, such as 10:01:00) and the segments are joined end to end with a 1 s gap.", side: "right" },
    { target: "plot-tools", title: "A continuous timeline", body: "The temperature carries on across the joins, as one run.", side: "bottom" },
  ] },

  "demo-osc": { title: "6 · Oscillations", steps: [
    { tab: "demo-osc", target: "plot-tools", title: "A thermal soak", body: "A PicoLog export. Its clock passes midnight and E-PEAK carries on into the next day. Channel 1 cycles up and down on a slow rise.", side: "bottom" },
    { act: panel("demo-osc", "plot_osc", "oscillation"), target: "spectrum", title: "The oscillation finder", body: "The waves button shows the spectrum of the points in view. The strongest period is 240 s, the thermostat cycle, with an amplitude of about 1.5 °C. The smaller peaks are its shape, not separate cycles.", side: "left" },
  ] },

  "demo-stats": { title: "7 · Statistics", steps: [
    { tab: "demo-stats", target: "setup", title: "A whole log at once", body: "Summary statistics, box plots with outliers and a scatter matrix for the variables you pick. The scatter matrix shows how temperature follows current.", side: "right" },
  ] },

  "demo-3d": { title: "8 · 3D map", steps: [
    { tab: "demo-3d", target: "setup", title: "Three variables", body: "Time, current and temperature as a 3D line coloured by temperature. Drag to rotate; scroll to zoom.", side: "right" },
  ] },

  "demo-wave": { title: "9 · Waveform", steps: [
    { tab: "demo-wave", target: "wave-scrub", title: "Waveforms from a log", body: "Two cycles of voltage and current rebuilt from the bench run's RMS, frequency and phase. Drag the slider to move through the log: the current grows with each load step. This tab follows tab 1's log.", side: "bottom" },
  ] },

  "view:hub": { title: "Research hub", steps: [
    { view: "hub", target: "ledger", title: "The ledger", body: "Three hypotheses from the demo: one validated (CT B saturates), one still being tested (supply over-voltage) and one rejected (Day 2 running hotter).", side: "bottom" },
    { view: "hub", target: "evidence", title: "Evidence and schematics", body: "The test bench schematic is marked as a schematic, with seven named measurement points. Press Nodes on it to see or move them.", side: "top" },
  ] },

  "view:editor": { title: "Log editor", steps: [
    { view: "editor", act: () => { const id = demoLog("messy"); if (id) setState({ editorLogId: id }); }, target: "editor-tools", title: "A messy export", body: "This file has a title line (skipped automatically), a units row under the header, ERR codes in Ch2 and vague column names. Type “contains ERR” in the filter under Ch2 and use “Delete all rows matching the filters”; double-click a header to rename it. Nothing changes until you save.", side: "bottom" },
  ] },

  "view:report": { title: "Report studio", steps: [
    { view: "report", target: "export", title: "A report, ready to export", body: "The calibration graph, steady-state table and pass/fail table, the problems found in tab 3, the ledger and the schematic are already staged. Press Export to get the Excel workbook.", side: "left" },
  ] },
};

export const hasTour = (id: string | null | undefined) => !!id && id in TOURS;

export function startTour(id = "overview") {
  closeModal();
  setState({ tourId: id in TOURS ? id : "overview", tour: 0 });
}

export function maybeOfferTour() {
  try {
    if (localStorage.getItem("epeak.tourSeen")) return;
    localStorage.setItem("epeak.tourSeen", "1");
  } catch {
    return;
  }
  setTimeout(() => {
    const s = getState();
    if (s.tour === null && !s.modal) startTour(s.tutorial ? "tutorial" : "overview");
  }, 600);
}

export function Tour() {
  const i = useApp((s) => s.tour);
  const tourId = useApp((s) => s.tourId);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const steps = TOURS[tourId]?.steps ?? OVERVIEW;
  const step = i === null ? null : steps[i];

  // perform the step's actions: change view, open the tab, open a panel or zoom
  useEffect(() => {
    if (!step) return;
    if (step.view && getState().view !== step.view) setView(step.view);
    if (step.tab) showTab(step.tab);
    step.act?.(getState().demo);
  }, [tourId, i]); // eslint-disable-line react-hooks/exhaustive-deps

  // find the highlighted element; it may appear a moment later (data loading, a panel opening)
  useLayoutEffect(() => {
    if (!step) return;
    setRect(null);
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const el = () => (step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null);
    const find = () => {
      const e = el();
      if (e) {
        e.scrollIntoView?.({ block: "nearest" });
        setRect(e.getBoundingClientRect());
        timer = setTimeout(find, 500); // keep following it while the page settles
      } else if (step.target && tries++ < 40) {
        timer = setTimeout(find, 120);
      }
    };
    timer = setTimeout(find, step.act || step.tab || step.view ? 250 : 60);
    const onResize = () => {
      const e = el();
      if (e) setRect(e.getBoundingClientRect());
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [tourId, i]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (i === null) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setState({ tour: null });
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [i, tourId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (i === null || !step) return null;
  const go = (d: number) => {
    const n = (getState().tour ?? 0) + d;
    setState({ tour: n < 0 || n >= steps.length ? null : n });
  };
  const gap = 6;
  const hole = rect ? { left: rect.left - gap, top: rect.top - gap, width: rect.width + gap * 2, height: rect.height + gap * 2 } : null;
  const W = 340;
  let pos: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  if (hole) {
    const side = step.side ?? "bottom";
    const maxTop = window.innerHeight - 240;
    if (side === "right") pos = { left: Math.min(hole.left + hole.width + 14, window.innerWidth - W - 12), top: Math.max(12, Math.min(hole.top, maxTop)) };
    else if (side === "bottom") pos = { left: Math.max(12, Math.min(hole.left, window.innerWidth - W - 12)), top: Math.max(12, Math.min(hole.top + hole.height + 14, maxTop)) };
    else if (side === "left") pos = { left: Math.max(12, hole.left - W - 14), top: Math.max(12, Math.min(hole.top, maxTop)) };
    else pos = { left: Math.max(12, Math.min(hole.left, window.innerWidth - W - 12)), top: Math.max(12, hole.top - 230) };
  }
  const multi = TOURS[tourId] && tourId !== "overview" && tourId !== "tutorial";
  return createPortal(
    <div className="tour" role="dialog" aria-label="Guided tour">
      {hole ? <div className="tour-hole" style={hole} /> : <div className="tour-dim" />}
      <div className="tour-card" style={{ ...pos, width: W }}>
        <div className="tour-top">
          <span className="tour-count">{multi ? `${TOURS[tourId].title} · ` : ""}{i + 1} / {steps.length}</span>
          <button type="button" className="icon-btn" aria-label="End tour" onClick={() => setState({ tour: null })}><LuX size={15} /></button>
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-progress"><i style={{ width: `${((i + 1) / steps.length) * 100}%` }} /></div>
        <div className="tour-actions">
          {i > 0 ? <Button size="sm" variant="ghost" onClick={() => go(-1)}>Back</Button> : <Button size="sm" variant="ghost" onClick={() => setState({ tour: null })}>Skip tour</Button>}
          <Button size="sm" variant="primary" onClick={() => go(1)}>{i === steps.length - 1 ? "Finish" : "Next"}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
