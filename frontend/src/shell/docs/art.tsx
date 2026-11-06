// Pictures for the user guide, all drawn in code so they follow the light/dark theme, stay small
// and work offline: a map of the main screen, tool cards, and short animated clips of the key
// gestures (zoom, cursors, removing points, reordering, the report, schematic nodes, filters, drop).
import { type ReactNode, useContext, useState } from "react";
import { LuPause, LuPlay } from "react-icons/lu";
import { cx } from "../../components/ui";
import type { HowTopic, TabType } from "../../types";
import { TOOLS, toolMeta } from "../../views/tabs/registry";
import { HOW } from "../HowItWorks";
import { GuideNav } from "./kit";

// ------------------------------------------------------------------ helpers
const noise = (k: number) => (Math.sin(k * 12.9898) * 43758.5453) % 1; // repeatable "noise" in -1..1
const pts = (x0: number, x1: number, n: number, f: (x: number, k: number) => number): [number, number][] =>
  Array.from({ length: n }, (_, k) => {
    const x = x0 + ((x1 - x0) * k) / (n - 1);
    return [x, f(x, k)];
  });
const path = (p: [number, number][]) => p.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join("");
const PTR = "M0,0 L0,15 L4,11 L7,17 L9.5,16 L6.5,10 L12,10 Z";

/** The mouse pointer; its tip is at (0, 0) and the clip's CSS moves it. */
const Pointer = ({ className }: { className: string }) => <g className={cx("c-ptr", className)}><path d={PTR} /></g>;
/** A click ring at (x, y); the clip's CSS decides when it pulses. */
const Click = ({ x, y, className }: { x: number; y: number; className: string }) => <circle className={cx("c-click", className)} cx={x} cy={y} r={9} />;

// ------------------------------------------------------------------ figure frames
/** A still illustration with a caption. */
export function Figure({ caption, children, wide }: { caption?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={cx("guide-fig", wide && "is-wide")}>
      {children}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/** An animated clip that loops, with a pause button and the steps it shows. */
export function Clip({ title, steps, children }: { title: string; steps?: ReactNode[]; children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  return (
    <figure className={cx("clip", paused && "is-paused")}>
      <div className="clip-stage">
        {children}
        <button type="button" className="clip-pp" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play" : "Pause"} title={paused ? "Play" : "Pause"}>
          {paused ? <LuPlay size={12} /> : <LuPause size={12} />}
        </button>
      </div>
      <figcaption>
        <b>{title}</b>
        {steps && <ol>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
      </figcaption>
    </figure>
  );
}

/** One of the "How this works" diagrams. */
export function HowFigure({ topic }: { topic: HowTopic }) {
  const D = HOW[topic].diagram;
  return <div className="how-figure"><D /></div>;
}

// ------------------------------------------------------------------ the main screen, numbered
const SCREEN_PARTS: { n: number; title: string; text: string; to: string; x: number; y: number }[] = [
  { n: 1, title: "Side rail", text: "Research hub, Analysis, Log editor, Report studio, and the log library at the bottom.", to: "buttons", x: 22, y: 186 },
  { n: 2, title: "Menus", text: "File (workspaces, autosave), Data (upload, math engine, limits) and Help.", to: "files", x: 156, y: 13 },
  { n: 3, title: "Workspace name", text: "Shows Saved or Unsaved. Click the name to save under a new name.", to: "files", x: 384, y: 13 },
  { n: 4, title: "Undo, search and theme", text: "Undo/redo, Search actions (Ctrl+K) and the light/dark switch.", to: "keys", x: 560, y: 13 },
  { n: 5, title: "Analysis tabs", text: "One tab per tool. New analysis opens another; drag tabs to reorder.", to: "tools", x: 214, y: 38 },
  { n: 6, title: "Setup panel", text: "Choose the log, the time column and what to plot. Results update by themselves.", to: "plots", x: 110, y: 214 },
  { n: 7, title: "Plot toolbar", text: "Zoom, cursors, limits, events, steady states, oscillations, style, data, notes.", to: "buttons", x: 548, y: 72 },
  { n: 8, title: "The plot", text: "Drag a box to zoom; double-click to zoom out.", to: "plots", x: 520, y: 112 },
  { n: 9, title: "Measurement bar", text: "Mean, min, max, RMS… for the points in view, plus the cursor readings.", to: "plots", x: 420, y: 262 },
  { n: 10, title: "Status bar", text: "Logs and rows loaded, what's running, and the autosave switch.", to: "files", x: 600, y: 319 },
];

export function ScreenMap() {
  const { go } = useContext(GuideNav);
  const trace = path(pts(200, 616, 140, (x, k) => 158 + Math.sin(x / 22) * 26 + Math.sin(x / 7) * 4 + noise(k) * 3));
  const trace2 = path(pts(200, 616, 140, (x, k) => 190 - (x - 200) * 0.06 + noise(k + 99) * 2.5));
  return (
    <Figure wide caption="The main screen. Click a number's description below to read more about that part.">
      <svg className="guide-svg screen-map" viewBox="0 0 640 330" role="img" aria-label="Map of the E-PEAK window with numbered parts">
        {/* rail */}
        <rect x={0} y={0} width={44} height={330} className="sm-board" />
        <rect x={10} y={10} width={24} height={24} rx={6} className="sm-logo" />
        {[52, 84, 116, 148].map((y, i) => <rect key={y} x={11} y={y} width={22} height={20} rx={5} className={i === 1 ? "sm-rail-on" : "sm-rail"} />)}
        <rect x={11} y={290} width={22} height={20} rx={5} className="sm-rail" />
        {/* top bar */}
        <rect x={44} y={0} width={596} height={26} className="sm-deep" />
        {["File", "Data", "Help"].map((t, i) => <text key={t} x={56 + i * 30} y={17} className="sm-t-light">{t}</text>)}
        <text x={278} y={17} className="sm-t-light sm-bold">CT calibration</text>
        <circle cx={364} cy={13} r={3} className="sm-ok" />
        <rect x={500} y={7} width={92} height={13} rx={3} className="sm-search" />
        {/* tab bar */}
        <rect x={44} y={26} width={596} height={24} className="sm-p3" />
        <rect x={52} y={30} width={86} height={20} rx={4} className="sm-tab-on" />
        <rect x={52} y={30} width={86} height={3} rx={1} className="sm-cyan-fill" />
        <rect x={142} y={32} width={70} height={16} rx={4} className="sm-tab" />
        <rect x={236} y={31} width={84} height={17} rx={4} className="sm-tab-add" />
        <text x={248} y={43} className="sm-t">+ New analysis</text>
        {/* setup panel */}
        <rect x={44} y={50} width={130} height={258} className="sm-panel" />
        {[66, 98, 130, 162].map((y) => <g key={y}><rect x={56} y={y} width={50} height={6} rx={2} className="sm-label" /><rect x={56} y={y + 10} width={106} height={14} rx={3} className="sm-input" /></g>)}
        {/* main area */}
        <rect x={174} y={50} width={466} height={258} className="sm-bg" />
        <rect x={186} y={60} width={442} height={236} rx={6} className="sm-card" />
        <rect x={194} y={66} width={70} height={12} rx={3} className="sm-input" />
        <rect x={270} y={66} width={70} height={12} rx={3} className="sm-input" />
        {Array.from({ length: 11 }, (_, k) => <rect key={k} x={472 + k * 13.5} y={66} width={10} height={10} rx={2} className={k === 2 ? "sm-icon-on" : "sm-icon"} />)}
        <line x1={196} y1={84} x2={618} y2={84} className="sm-line" />
        <path d={trace} className="sm-trace" />
        <path d={trace2} className="sm-trace2" />
        <line x1={300} y1={88} x2={300} y2={224} className="sm-cursor" />
        <line x1={430} y1={88} x2={430} y2={224} className="sm-cursor sm-dashed" />
        {/* measurement bar */}
        <rect x={186} y={228} width={442} height={68} className="sm-deep" />
        {[240, 256, 272].map((y, r) => (
          <g key={y}>
            <rect x={198} y={y} width={8} height={8} rx={1.5} className={r === 0 ? "sm-cyan-fill" : r === 1 ? "sm-amber-fill" : "sm-faint"} />
            <rect x={212} y={y + 1} width={60} height={6} rx={2} className="sm-faint" />
            {Array.from({ length: 7 }, (_, k) => <rect key={k} x={290 + k * 44} y={y} width={36} height={9} rx={2} className="sm-cell" />)}
          </g>
        ))}
        {/* status bar */}
        <rect x={44} y={308} width={596} height={22} className="sm-panel" />
        <line x1={44} y1={308} x2={640} y2={308} className="sm-line" />
        <circle cx={566} cy={319} r={3} className="sm-ok" />
        {/* numbers */}
        {SCREEN_PARTS.map((p) => (
          <g key={p.n} className="sm-num" transform={`translate(${p.x} ${p.y})`}>
            <circle r={9} />
            <text y={3.5}>{p.n}</text>
          </g>
        ))}
      </svg>
      <div className="sm-legend">
        {SCREEN_PARTS.map((p) => (
          <button type="button" key={p.n} className="sm-legend-item" onClick={() => go(p.to)}>
            <span className="sm-legend-n">{p.n}</span>
            <span><b>{p.title}</b><span className="muted">{p.text}</span></span>
          </button>
        ))}
      </div>
    </Figure>
  );
}

// ------------------------------------------------------------------ tools
/** A heading for a tool, with its own icon and colour, as in the tab strip. The id lets F1 jump to it. */
export function ToolHead({ type }: { type: TabType }) {
  const m = toolMeta(type);
  return (
    <h4 id={`doc-${type}`} className="guide-toolhead" style={{ ["--tool-color" as string]: m.color }}>
      <span className="guide-toolicon"><m.icon size={16} /></span>
      {m.label}
    </h4>
  );
}

/** Every tool as a card; a click jumps to its description. */
export function ToolCards() {
  const { go } = useContext(GuideNav);
  return (
    <div className="guide-tools">
      {TOOLS.map((t) => (
        <button type="button" key={t.type} className="guide-tool" style={{ ["--tool-color" as string]: t.color }} onClick={() => go(`tools#${t.type}`)}>
          <span className="guide-toolicon"><t.icon size={18} /></span>
          <span><b>{t.label}</b><small>{t.description}</small></span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ animated clips
const W = 360;
const H = 150;
const svgProps = (label: string) => ({ className: "clip-svg", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": label });

export function ZoomClip() {
  const sig = path(pts(20, 340, 240, (x, k) => 72 + Math.sin(x / 9) * 14 + Math.sin(x / 37) * 22 + noise(k) * 3));
  return (
    <Clip title="Zoom in and out" steps={["Drag a box over the part you want to see.", "Double-click the plot to zoom back out."]}>
      <svg {...svgProps("Dragging a box zooms the plot; a double-click zooms back out")}>
        <defs><clipPath id="clip-zoom-frame"><rect x={20} y={14} width={320} height={112} /></clipPath></defs>
        <rect className="c-frame" x={20} y={14} width={320} height={112} />
        <g clipPath="url(#clip-zoom-frame)"><path className="c-sig z-sig" d={sig} /></g>
        <rect className="c-sel z-box" x={90} y={40} width={110} height={70} />
        <Click x={180} y={70} className="z-click" />
        <Pointer className="z-ptr" />
      </svg>
    </Clip>
  );
}

export function CursorClip() {
  const f = (x: number, k: number) => 112 - (x - 20) * 0.26 + noise(k) * 1.6;
  return (
    <Clip title="Measure with cursors" steps={["Press the ruler button: cursors A and B appear.", "Drag a cursor, or type its position in the bar under the plot.", "Read Δt, ΔY and the slope for every trace."]}>
      <svg {...svgProps("Dragging cursor B along a ramp: the time difference and the value difference grow")}>
        <rect className="c-frame" x={20} y={14} width={320} height={112} />
        <path className="c-sig" d={path(pts(20, 340, 160, f))} />
        <line className="c-level" x1={20} x2={340} y1={91.2} y2={91.2} />
        <line className="c-level k-lvb" x1={20} x2={340} y1={75.6} y2={75.6} />
        <line className="c-bracket k-dy" x1={330} x2={330} y1={75.6} y2={91.2} />
        <line className="c-cursor" x1={100} x2={100} y1={14} y2={126} />
        <text className="c-t c-bold" x={104} y={26}>A</text>
        <line className="c-bracket k-dt" x1={100} x2={160} y1={136} y2={136} />
        <line className="c-bracket" x1={100} x2={100} y1={131} y2={141} />
        <g className="k-b">
          <line className="c-cursor c-dashed" x1={160} x2={160} y1={14} y2={126} />
          <text className="c-t c-bold" x={164} y={26}>B</text>
          <line className="c-bracket" x1={160} x2={160} y1={131} y2={141} />
        </g>
        <text className="c-t c-small" x={24} y={146}>Δt</text>
        <text className="c-t c-small" x={334} y={110}>ΔY</text>
        <Pointer className="k-ptr" />
      </svg>
    </Clip>
  );
}

export function RemovePointsClip() {
  const rows = [["10:00:01", "230.1"], ["10:00:02", "230.4"], ["10:00:03", "9999"], ["10:00:04", "230.2"], ["10:00:05", "229.9"]];
  const base = path(pts(196, 344, 90, (_x, k) => 82 + noise(k) * 3));
  return (
    <Clip title="Remove bad points" steps={["Press the sheet button to show the data in view.", "Click a row (Shift-click for a range, Ctrl-click for several).", "Press Delete. Restore them any time from the setup panel."]}>
      <svg {...svgProps("Selecting a glitch row in the data table and pressing Delete removes the spike from the plot")}>
        <rect className="c-frame" x={14} y={14} width={162} height={110} />
        <rect className="c-head" x={14} y={14} width={162} height={18} />
        <text className="c-t c-small c-on-dark" x={22} y={26}>Time</text>
        <text className="c-t c-small c-on-dark" x={120} y={26}>V_RMS</text>
        <rect className="c-hl r-hl" x={14} y={68} width={162} height={18} />
        {rows.map(([t, v], i) => (
          <g key={t} className={i === 2 ? "r-row3" : i > 2 ? "r-below" : undefined}>
            <text className="c-t c-small" x={22} y={46 + i * 18}>{t}</text>
            <text className={cx("c-t c-small", i === 2 && "c-bad")} x={120} y={46 + i * 18}>{v}</text>
          </g>
        ))}
        <rect className="c-frame" x={194} y={14} width={152} height={110} />
        <path className="c-sig" d={base} />
        <path className="c-sig c-bad-stroke r-spike" d="M262,82 L270,22 L278,82" />
        <g className="r-key">
          <rect className="c-key" x={66} y={130} width={56} height={16} rx={3} />
          <text className="c-t c-small" x={76} y={142}>Delete</text>
        </g>
        <Click x={70} y={77} className="r-click" />
        <Pointer className="r-ptr" />
      </svg>
    </Clip>
  );
}

export function ReorderClip() {
  const card = (label: string, cls: string, y: number, sig: string) => (
    <g className={cls}>
      <rect className="c-card" x={40} y={y} width={280} height={56} rx={5} />
      <g className="c-grip">{[0, 1, 2].map((r) => [0, 1].map((c) => <circle key={`${r}${c}`} cx={50 + c * 5} cy={y + 22 + r * 6} r={1.4} />))}</g>
      <text className="c-t c-bold" x={64} y={y + 18}>{label}</text>
      <path className={sig} d={path(pts(64, 310, 90, (x, k) => y + 38 + Math.sin(x / (cls === "o-c1" ? 11 : 6)) * 9 + noise(k) * 1.5))} />
    </g>
  );
  return (
    <Clip title="Reorder plots" steps={["Grab a plot by the handle on the left of its header.", "Drop it where you want it. Tabs and report items reorder the same way."]}>
      <svg {...svgProps("Dragging Plot 2 by its handle above Plot 1")}>
        {card("Plot 1", "o-c1", 14, "c-sig")}
        {card("Plot 2", "o-c2", 80, "c-sig c-sig2")}
        <Pointer className="o-ptr" />
      </svg>
    </Clip>
  );
}

export function ReportClip() {
  const items = ["Graphs", "Statistics", "Pass/fail (limits)"];
  return (
    <Clip title="Build a report" steps={["Tick what you want from each tab.", "Press Add to report; drag items to reorder and set the sheet names.", "Press Export to get the Excel workbook."]}>
      <svg {...svgProps("Ticking items, adding them to the report and exporting")}>
        <rect className="c-card" x={14} y={14} width={140} height={122} rx={6} />
        <text className="c-t c-bold" x={24} y={30}>Content</text>
        {items.map((t, i) => (
          <g key={t}>
            <rect className="c-box" x={24} y={40 + i * 22} width={10} height={10} rx={2} />
            <path className={cx("c-check", i === 0 && "p-ck1", i === 2 && "p-ck3", i === 1 && "c-hidden")} d={`M26,${45 + i * 22} l2.5,2.5 l4,-5`} />
            <text className="c-t c-small" x={40} y={49 + i * 22}>{t}</text>
          </g>
        ))}
        <g className="p-add">
          <rect className="c-primary" x={24} y={108} width={92} height={18} rx={4} />
          <text className="c-t c-small c-on-dark" x={34} y={120}>Add to report</text>
        </g>
        <rect className="c-card" x={168} y={14} width={178} height={122} rx={6} />
        <text className="c-t c-bold" x={178} y={30}>In the report</text>
        <g className="p-i1"><rect className="c-row" x={178} y={40} width={158} height={18} rx={3} /><text className="c-t c-small" x={186} y={52}>Graphs · Sheet</text></g>
        <g className="p-i2"><rect className="c-row" x={178} y={62} width={158} height={18} rx={3} /><text className="c-t c-small" x={186} y={74}>Pass/fail · Sheet</text></g>
        <g className="p-exp">
          <rect className="c-primary" x={248} y={108} width={88} height={18} rx={4} />
          <text className="c-t c-small c-on-dark" x={262} y={120}>Export .xlsx</text>
        </g>
        <Pointer className="p-ptr" />
      </svg>
    </Clip>
  );
}

export function SchematicClip() {
  return (
    <Clip title="Name measurement points on a schematic" steps={["In the Research hub, mark an image as Schematic and press Nodes.", "Click where the measurement is taken and type its name.", "Drag pins to move them; they show in the lightbox and the report."]}>
      <svg {...svgProps("Clicking a schematic and naming the point JB1_V places a pin")}>
        <rect className="c-frame" x={14} y={10} width={332} height={102} />
        <rect className="c-wire-box" x={36} y={34} width={76} height={52} rx={4} />
        <text className="c-t c-bold" x={56} y={64}>DIVA</text>
        <line className="c-wire" x1={112} x2={216} y1={60} y2={60} />
        <circle className="c-wire-box" cx={230} cy={60} r={14} />
        <text className="c-t c-small" x={222} y={64}>CT</text>
        <line className="c-wire" x1={244} x2={280} y1={60} y2={60} />
        <rect className="c-wire-box" x={280} y={40} width={50} height={40} rx={4} />
        <text className="c-t c-small" x={292} y={64}>Load</text>
        <g className="s-tgt"><circle className="c-target" cx={170} cy={60} r={7} /><line className="c-target" x1={160} x2={180} y1={60} y2={60} /><line className="c-target" x1={170} x2={170} y1={50} y2={70} /></g>
        <g className="s-pin"><circle className="c-pin" cx={170} cy={60} r={5} /><text className="c-t c-bold c-pin-t" x={154} y={48}>JB1_V</text></g>
        <rect className="c-input" x={110} y={120} width={140} height={22} rx={4} />
        <text className="c-t" x={118} y={135}>JB1_V</text>
        <rect className="c-cover s-type" x={116} y={123} width={130} height={16} />
        <Click x={170} y={60} className="s-click" />
        <Pointer className="s-ptr" />
      </svg>
    </Clip>
  );
}

export function FilterClip() {
  const rows = [["10:00:01", "1.02"], ["10:00:02", "ERR"], ["10:00:03", "1.05"], ["10:00:04", "ERR"], ["10:00:05", "0.99"]];
  return (
    <Clip title="Filter and delete rows in the Log editor" steps={["Type a filter under a column, e.g. contains ERR.", "Use “Delete all rows matching the filters”.", "Clear the filter; nothing is saved until you press Save changes."]}>
      <svg {...svgProps("Filtering a column for ERR and deleting the matching rows")}>
        <rect className="c-frame" x={14} y={10} width={332} height={110} />
        <rect className="c-head" x={14} y={10} width={332} height={18} />
        {["Time", "Ch1", "Ch2"].map((t, i) => <text key={t} className="c-t c-small c-on-dark" x={24 + i * 110} y={22}>{t}</text>)}
        <rect className="c-input" x={240} y={30} width={104} height={16} rx={2} />
        <text className="c-t c-small" x={246} y={41}>contains ERR</text>
        <rect className="c-cover f-type" x={244} y={32} width={98} height={12} />
        {rows.map(([t, v], i) => (
          <g key={t} className={v === "ERR" ? "f-err" : `f-ok f-r${i}`}>
            <text className="c-t c-small" x={24} y={62 + i * 13}>{t}</text>
            <text className="c-t c-small" x={134} y={62 + i * 13}>{(0.5 + i * 0.01).toFixed(2)}</text>
            <text className={cx("c-t c-small", v === "ERR" && "c-bad")} x={244} y={62 + i * 13}>{v}</text>
          </g>
        ))}
        <g className="f-btn">
          <rect className="c-row" x={196} y={126} width={150} height={18} rx={4} />
          <path className="c-funnel" d="M204,130 h12 l-4.5,5 v5 l-3,-1.5 v-3.5 z" />
          <text className="c-t c-small" x={222} y={139}>Delete matching rows</text>
        </g>
        <Click x={270} y={135} className="f-click" />
        <Pointer className="f-ptr" />
      </svg>
    </Clip>
  );
}

export function DropClip() {
  return (
    <Clip title="Add logs by dropping them" steps={["Drag CSV files from Explorer onto the E-PEAK window.", "Images go to the evidence board, .epeak / .pkl files open as a workspace."]}>
      <svg {...svgProps("A CSV file dragged onto the window is added to the log library")}>
        <rect className="c-card" x={70} y={12} width={276} height={126} rx={6} />
        <rect className="c-head" x={70} y={12} width={276} height={16} rx={3} />
        <rect className="c-drop d-over" x={84} y={38} width={248} height={86} rx={8} />
        <text className="c-t c-bold d-over" x={170} y={86}>Drop to add</text>
        <g className="d-file">
          <path className="c-file" d="M0,0 h20 l8,8 v26 h-28 z" />
          <path className="c-file-fold" d="M20,0 v8 h8" />
          <text className="c-t c-small" x={-4} y={46}>test.csv</text>
          <g transform="translate(18 26)"><path className="c-ptr-shape" d={PTR} /></g>
        </g>
        <g className="d-toast">
          <rect className="c-toast" x={226} y={112} width={112} height={20} rx={4} />
          <text className="c-t c-small c-on-dark" x={236} y={126}>✓ Added 1 log</text>
        </g>
      </svg>
    </Clip>
  );
}
