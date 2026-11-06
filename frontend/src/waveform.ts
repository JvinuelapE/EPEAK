import type Plotly from "plotly.js-dist-min";
import { baseLayout, xAxisFor } from "./figures";
import type { Theme } from "./figures";
import type { PlotStyle, WaveformTab } from "./types";
import { fmtNum } from "./util";

const N = 600;

function shape(kind: string, th: number) {
  switch (kind) {
    case "square": return Math.sin(th) >= 0 ? 1 : -1;
    case "triangle": return (2 / Math.PI) * Math.asin(Math.sin(th));
    case "sawtooth": return 2 * (((th + Math.PI) / (2 * Math.PI)) % 1) - 1;
    default: return Math.sin(th);
  }
}
// peak-to-RMS factor so the entered value really is the RMS of each shape
const crest = (kind: string) => (kind === "square" ? 1 : kind === "sine" ? Math.SQRT2 : Math.sqrt(3));

export function synth(t: Pick<WaveformTab, "shape" | "v" | "i" | "f" | "p" | "thdV" | "thdI">) {
  const f = t.f > 0 ? t.f : 50;
  const w = 2 * Math.PI * f;
  const ph = (t.p * Math.PI) / 180;
  const vp = t.v * crest(t.shape);
  const ip = t.i * crest(t.shape);
  const tEnd = 2 / f;
  const x: number[] = [], v: number[] = [], i: number[] = [];
  for (let k = 0; k < N; k++) {
    const tt = (tEnd * k) / (N - 1);
    let vv = vp * shape(t.shape, w * tt);
    let ii = ip * shape(t.shape, w * tt - ph);
    if (t.thdV > 0) {
      const m = vp * (t.thdV / 100);
      vv += 0.8 * m * Math.sin(3 * w * tt) + 0.2 * m * Math.sin(5 * w * tt);
    }
    if (t.thdI > 0) {
      const m = ip * (t.thdI / 100);
      ii += 0.8 * m * Math.sin(3 * (w * tt - ph)) + 0.2 * m * Math.sin(5 * (w * tt - ph));
    }
    x.push(tt * 1000);
    v.push(vv);
    i.push(ii);
  }
  return { x, v, i };
}

export function buildWaveFigure(t: WaveformTab, theme: Theme, style?: PlotStyle) {
  const { x, v, i } = synth(t);
  const vc = style?.traces?.Voltage?.color || "#C9970C";
  const ic = style?.traces?.Current?.color || "#1A9BB5";
  const ext = (arr: number[]) => {
    let a = 0, b = 0;
    arr.forEach((val, k) => { if (val > arr[a]) a = k; if (val < arr[b]) b = k; });
    return [a, b];
  };
  const data: Plotly.Data[] = [
    { type: "scatter", mode: "lines", x, y: v, name: style?.traces?.Voltage?.name || "Voltage", line: { color: vc, width: 2, dash: style?.traces?.Voltage?.dash }, hovertemplate: "%{y:.4~g} V" },
    { type: "scatter", mode: "lines", x, y: i, name: style?.traces?.Current?.name || "Current", yaxis: "y2", line: { color: ic, width: 2, dash: style?.traces?.Current?.dash }, hovertemplate: "%{y:.4~g} A" },
  ];
  const [vmax, vmin] = ext(v);
  const [imax, imin] = ext(i);
  if (t.v) data.push({ type: "scatter", mode: "text+markers", x: [x[vmax], x[vmin]], y: [v[vmax], v[vmin]], text: [`${fmtNum(v[vmax])} V`, `${fmtNum(v[vmin])} V`],
    textposition: ["top center", "bottom center"], marker: { symbol: ["triangle-down", "triangle-up"], size: 9, color: vc }, showlegend: false, hoverinfo: "skip", textfont: { color: vc, size: 11 } } as any);
  if (t.i) data.push({ type: "scatter", mode: "text+markers", x: [x[imax], x[imin]], y: [i[imax], i[imin]], yaxis: "y2", text: [`${fmtNum(i[imax])} A`, `${fmtNum(i[imin])} A`],
    textposition: ["top center", "bottom center"], marker: { symbol: ["triangle-down", "triangle-up"], size: 9, color: ic }, showlegend: false, hoverinfo: "skip", textfont: { color: ic, size: 11 } } as any);
  const layout = baseLayout(theme, 460);
  (layout.title as any).text = style?.title || "Synthetic oscilloscope";
  layout.showlegend = style?.showLegend ?? true;
  layout.xaxis = xAxisFor("number", theme, style?.xTitle || "Time (ms)") as any;
  layout.yaxis = { ...(xAxisFor("number", theme, style?.yTitle || "Voltage (V)") as any), zeroline: true };
  layout.yaxis2 = { ...(xAxisFor("number", theme, style?.y2Title || "Current (A)") as any), overlaying: "y", side: "right", showgrid: false, zeroline: false };
  return { data, layout };
}

export function waveReadouts(t: WaveformTab) {
  const phi = (t.p * Math.PI) / 180;
  const s = t.v * t.i;
  const thdFactor = 1 / Math.sqrt(1 + (t.thdI / 100) ** 2);
  const pf = t.shape === "sine" ? Math.cos(phi) * thdFactor : NaN;
  return [
    { label: "V peak", value: `${fmtNum(t.v * crest(t.shape))} V` },
    { label: "I peak", value: `${fmtNum(t.i * crest(t.shape))} A` },
    { label: "Period", value: `${fmtNum(t.f > 0 ? 1000 / t.f : NaN)} ms` },
    { label: "Apparent power S", value: `${fmtNum(s)} VA` },
    { label: "Real power P", value: t.shape === "sine" ? `${fmtNum(s * pf)} W` : "—" },
    { label: "Reactive Q", value: t.shape === "sine" ? `${fmtNum(s * Math.sin(phi) * thdFactor)} var` : "—" },
    { label: "Power factor", value: t.shape === "sine" ? fmtNum(pf, 3) : "—" },
  ];
}
