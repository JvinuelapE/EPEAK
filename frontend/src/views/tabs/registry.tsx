import type { ComponentType } from "react";
import { LuAudioWaveform, LuBox, LuChartLine, LuChartNoAxesCombined, LuLink2, LuScale, LuTimer } from "react-icons/lu";
import type { IconType } from "react-icons";
import type { Tab, TabType } from "../../types";
import { uid } from "../../util";
import { GenericTab, newPlot } from "./GenericTab";
import { AppendTab, CalibrationTab, CompareTab } from "./SeriesTabs";
import { GlobalStatsTab, ThreeDTab, WaveformTab } from "./ToolTabs";

export interface ToolMeta {
  type: TabType;
  label: string;
  short: string;
  description: string;
  icon: IconType;
  color: string;
  group: "Time-domain" | "Exploration";
  component: ComponentType<{ tab: any }>;
}

export const TOOLS: ToolMeta[] = [
  { type: "generic", label: "2D plot", short: "2D Plot", description: "Plot any variables against time, stacked plots with dual Y axes.", icon: LuChartLine, color: "#1A9BB5", group: "Time-domain", component: GenericTab },
  { type: "calibration", label: "Calibration", short: "Calibration", description: "Compare targets against a reference log and plot the error.", icon: LuScale, color: "#2E9E5B", group: "Time-domain", component: CalibrationTab },
  { type: "compare", label: "Time sync", short: "Time Sync", description: "Overlay several logs on a shared elapsed-time axis.", icon: LuTimer, color: "#C9970C", group: "Time-domain", component: CompareTab },
  { type: "append", label: "Append logs", short: "Append", description: "Stitch log segments into one continuous timeline.", icon: LuLink2, color: "#5E7D8C", group: "Time-domain", component: AppendTab },
  { type: "waveform", label: "Waveform generator", short: "Waveform", description: "Reconstruct V/I waveforms from RMS, frequency and phase.", icon: LuAudioWaveform, color: "#C2399B", group: "Time-domain", component: WaveformTab },
  { type: "three_d", label: "3D mapping", short: "3D Plot", description: "Explore three variables as a line, point cloud or surface.", icon: LuBox, color: "#6A5ACD", group: "Exploration", component: ThreeDTab },
  { type: "global_stats", label: "Global statistics", short: "Global Stats", description: "Summary statistics, box plots and a scatter matrix for a log.", icon: LuChartNoAxesCombined, color: "#E0662F", group: "Exploration", component: GlobalStatsTab },
];
export const toolMeta = (t: TabType) => TOOLS.find((m) => m.type === t) ?? TOOLS[0];

export function createTab(type: TabType, existing: Tab[]): Tab {
  const meta = toolMeta(type);
  const n = existing.filter((t) => t.type === type).length + 1;
  const base = { id: uid(12), name: `${meta.short} ${n}`, comment: "" };
  const series = { skip: 1, excluded: [], range: null, markers: {} };
  switch (type) {
    case "generic":
      return { ...base, type, logId: null, x: null, skip: 1, linkX: false, excluded: [], plots: [newPlot()] };
    case "calibration":
      return { ...base, type, ...series, errMode: "percentage", sources: [{ logId: null, x: null, y: null, offset: 0 }, { logId: null, x: null, y: null, offset: 0 }] };
    case "compare":
      return { ...base, type, ...series, sources: [1, 2].map((slot) => ({ slot, logId: null, x: null, yl: [], yr: [], offset: 0 })) };
    case "append":
      return { ...base, type, ...series, yl: [], yr: [], sources: [1, 2].map((slot) => ({ slot, logId: null, x: null, start: "", end: "" })) };
    case "three_d":
      return { ...base, type, logId: null, x: null, y: null, z: null, mode: "lines" };
    case "global_stats":
      return { ...base, type, logId: null, vars: [] };
    case "waveform":
      return { ...base, type, shape: "sine", v: 230, i: 10, f: 50, p: 45, thdV: 0, thdI: 0, linkTabId: null, logId: null, timeCol: null, row: 0, live: true,
        cols: { v: null, i: null, f: null, p: null, thdV: null, thdI: null } };
  }
}

export function duplicateTab(tab: Tab, existing: Tab[]): Tab {
  const copy = JSON.parse(JSON.stringify(tab)) as Tab;
  copy.id = uid(12);
  let name = `${tab.name} copy`;
  let k = 2;
  while (existing.some((t) => t.name === name)) name = `${tab.name} copy ${k++}`;
  copy.name = name;
  if (copy.type === "generic") copy.plots = copy.plots.map((p) => ({ ...p, id: `plot_${uid(8)}` }));
  return copy;
}
