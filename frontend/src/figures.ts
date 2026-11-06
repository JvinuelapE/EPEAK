// Every figure in E-PEAK is built here, for the live views and for report export alike,
// so styles, markers and axis settings can never drift between code paths.
import type Plotly from "plotly.js-dist-min";
import type { Cursors, DatasetTrace, Limit, Markers, PlotStyle, Range, SeriesResponse, SpectrumResponse, StatsResponse, XKind, DashStyle } from "./types";
import { msToPlotly } from "./util";

export type Theme = "light" | "dark";

// Oscilloscope channel colours first (CH1 amber, CH2 cyan, CH3 magenta, CH4 green), then extras.
export const CHANNELS = ["#C9970C", "#1A9BB5", "#C2399B", "#2E9E5B", "#6A5ACD", "#E0662F", "#5E7D8C", "#A0522D", "#8BA82F", "#D1495B"];

export const MARKER_COLORS = { max: "#D1495B", min: "#1A73B5", mean: "#8E44AD", median: "#C9970C" };
export const LIMIT_FAIL = "#D1495B";
const REGION_STYLE = {
  event: { fill: "rgba(224, 102, 47, 0.16)", line: "rgba(224, 102, 47, 0.7)", text: "#B4501F" },
  steady: { fill: "rgba(46, 158, 91, 0.12)", line: "rgba(46, 158, 91, 0.55)", text: "#1E6B3C" },
};
/** A shaded stretch of the x axis: an event or a steady state. */
export interface Region {
  x0: number;
  x1: number;
  kind: "event" | "steady";
  label?: string;
}

const T = {
  light: { paper: "#FFFFFF", plot: "#FFFFFF", grid: "#E7ECE8", zero: "#C9D3CC", text: "#1B2A22", muted: "#5B6B62", line: "#AEBBB2", hover: "#FFFFFF" },
  dark: { paper: "#18221D", plot: "#18221D", grid: "#26332C", zero: "#3A4A41", text: "#DCE5DF", muted: "#93A39A", line: "#46574D", hover: "#223029" },
};

export const FONT = "'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";

export function baseLayout(theme: Theme, height?: number): Partial<Plotly.Layout> {
  const c = T[theme];
  return {
    height,
    autosize: true,
    paper_bgcolor: c.paper,
    plot_bgcolor: c.plot,
    font: { family: FONT, size: 12, color: c.text },
    margin: { l: 58, r: 58, t: 44, b: 44 },
    hovermode: "x unified",
    hoverlabel: { bgcolor: c.hover, bordercolor: c.line, font: { family: FONT, size: 12, color: c.text } },
    dragmode: "zoom",
    legend: { orientation: "h", x: 0, xanchor: "left", y: 1.01, yanchor: "bottom", font: { size: 11, color: c.muted }, bgcolor: "rgba(0,0,0,0)" },
    title: { text: "", x: 0, xanchor: "left", y: 0.985, yanchor: "top", font: { size: 13, color: c.text } },
  } as Partial<Plotly.Layout>;
}

function axis(theme: Theme, extra: Record<string, unknown> = {}) {
  const c = T[theme];
  return {
    gridcolor: c.grid, zerolinecolor: c.zero, linecolor: c.line, showline: true, mirror: false,
    tickfont: { size: 11, color: c.muted }, title: { font: { size: 12, color: c.muted } },
    automargin: true, ticks: "outside", ticklen: 4, tickcolor: c.line, ...extra,
  };
}

export function xAxisFor(kind: XKind, theme: Theme, title?: string) {
  const base = axis(theme, { title: { text: title ?? "", font: { size: 12, color: T[theme].muted } } });
  if (kind === "date") return { ...base, type: "date", hoverformat: "%Y-%m-%d %H:%M:%S.%L" };
  if (kind === "time") return { ...base, type: "date", tickformat: "%H:%M:%S", hoverformat: "%H:%M:%S.%L" };
  return { ...base, type: "linear" };
}

export interface SeriesFigureInput {
  traces: DatasetTrace[];
  series: SeriesResponse | null;
  stats?: StatsResponse | null;
  markers?: Markers;
  style?: PlotStyle;
  meta?: { title?: string; xTitle?: string; yTitle?: string; y2Title?: string };
  xKind: XKind;
  range?: Range;
  yRange?: { y?: [number, number] | null; y2?: [number, number] | null };
  theme: Theme;
  height?: number;
  revision?: string;
  cursors?: Cursors;
  /** limit for each trace that has one */
  limits?: Record<string, Limit>;
  regions?: Region[];
  /** x span the limit lines are drawn across (the view, or the whole dataset) */
  xExtent?: [number, number] | null;
}

export function traceColor(i: number, t: DatasetTrace, style?: PlotStyle) {
  return style?.traces?.[t.col]?.color || t.color || CHANNELS[i % CHANNELS.length];
}

export function buildSeriesFigure(f: SeriesFigureInput): { data: Plotly.Data[]; layout: Partial<Plotly.Layout> } {
  const data: Plotly.Data[] = [];
  const dates = f.xKind === "date" || f.xKind === "time";
  const X = (v: number | null | undefined) => (dates ? msToPlotly(v) : v);
  const hasY2 = f.traces.some((t) => t.axis === "y2");

  // shaded regions first so they sit behind the traces; they live on a hidden 0..1 axis (y3)
  // because layout shapes would become draggable while the cursors are on
  const regions = f.regions ?? [];
  for (const kind of ["steady", "event"] as const) {
    const rs = regions.filter((r) => r.kind === kind);
    if (!rs.length) continue;
    const xs: (string | number | null)[] = [];
    const ys: (number | null)[] = [];
    rs.forEach((r) => {
      const a = X(r.x0) as string | number;
      const b = X(Math.max(r.x0, r.x1)) as string | number;
      xs.push(a, a, b, b, a, null);
      ys.push(0, 1, 1, 0, 0, null);
    });
    data.push({ type: "scatter", mode: "lines", x: xs, y: ys, yaxis: "y3", fill: "toself", fillcolor: REGION_STYLE[kind].fill,
      line: { width: 1, color: REGION_STYLE[kind].line }, hoverinfo: "skip", showlegend: false, name: kind } as Plotly.Data);
    const labelled = rs.filter((r) => r.label);
    if (labelled.length) {
      data.push({ type: "scatter", mode: "text", x: labelled.map((r) => X((r.x0 + r.x1) / 2)), y: labelled.map(() => 0.97), yaxis: "y3",
        text: labelled.map((r) => r.label), textposition: "bottom center", textfont: { size: 10, color: REGION_STYLE[kind].text },
        hoverinfo: "skip", showlegend: false, cliponaxis: true } as Plotly.Data);
    }
  }

  f.traces.forEach((t, i) => {
    const s = f.series?.traces[t.col];
    const ts = f.style?.traces?.[t.col] ?? {};
    const color = traceColor(i, t, f.style);
    const mode = ts.mode ?? t.mode ?? "lines";
    data.push({
      type: "scatter",
      mode,
      x: s?.x ?? [],
      y: s?.y ?? [],
      name: ts.name?.trim() || t.col,
      yaxis: t.axis === "y2" ? "y2" : "y",
      line: { color, width: ts.width ?? t.width ?? 1.5, dash: (ts.dash && ts.dash !== ("original" as DashStyle) ? ts.dash : t.dash) ?? "solid" },
      marker: { color, size: t.marker ?? 5 },
      connectgaps: false,
      hovertemplate: "%{y:.5~g}",
    } as Plotly.Data);

    const lim = f.limits?.[t.col];
    const yaxisL = t.axis === "y2" ? "y2" : "y";
    if (lim) {
      // limit lines across the view, labelled at the right; samples beyond them drawn in red
      const ext = f.range ?? f.xExtent;
      if (ext) {
        for (const [v, word] of [[lim.hi, "max"], [lim.lo, "min"]] as const) {
          if (v == null) continue;
          data.push({ type: "scatter", mode: "lines", x: [X(ext[0]), X(ext[1])], y: [v, v], yaxis: yaxisL, showlegend: false,
            line: { color, width: 1.25, dash: "dash" }, hoverinfo: "skip", name: `${ts.name?.trim() || t.col} ${word}` } as Plotly.Data);
          data.push({ type: "scatter", mode: "text", x: [X(ext[1])], y: [v], yaxis: yaxisL, showlegend: false, hoverinfo: "skip",
            text: [`${word} ${fmt(v)}`], textposition: word === "max" ? "top left" : "bottom left", textfont: { size: 10, color },
            cliponaxis: false } as Plotly.Data);
        }
      }
      if (s?.y?.length) {
        const ox: (string | number | null)[] = [];
        const oy: number[] = [];
        s.y.forEach((v, k) => {
          if (v != null && ((lim.hi != null && v > lim.hi) || (lim.lo != null && v < lim.lo))) {
            ox.push(s.x[k]);
            oy.push(v);
          }
        });
        if (oy.length) {
          data.push({ type: "scatter", mode: "markers", x: ox, y: oy, yaxis: yaxisL, showlegend: false, hoverinfo: "skip",
            marker: { color: LIMIT_FAIL, size: 5 }, name: `${ts.name?.trim() || t.col} out of limits` } as Plotly.Data);
        }
      }
    }

    const kinds = f.markers?.[t.col] ?? [];
    const st = f.stats?.stats[t.col];
    if (!kinds.length || !st) return;
    const yaxis = t.axis === "y2" ? "y2" : "y";
    const label = ts.name?.trim() || t.col;
    if (kinds.includes("max") && st.xAtMax != null) {
      data.push({ type: "scatter", mode: "text+markers", x: [X(st.xAtMax)], y: [st.Max], yaxis, showlegend: false,
        text: [`max ${fmt(st.Max)}`], textposition: "top center", textfont: { size: 11, color: MARKER_COLORS.max },
        marker: { symbol: "triangle-down", size: 11, color: MARKER_COLORS.max }, hoverinfo: "skip", name: `${label} max`, cliponaxis: false } as Plotly.Data);
    }
    if (kinds.includes("min") && st.xAtMin != null) {
      data.push({ type: "scatter", mode: "text+markers", x: [X(st.xAtMin)], y: [st.Min], yaxis, showlegend: false,
        text: [`min ${fmt(st.Min)}`], textposition: "bottom center", textfont: { size: 11, color: MARKER_COLORS.min },
        marker: { symbol: "triangle-up", size: 11, color: MARKER_COLORS.min }, hoverinfo: "skip", name: `${label} min`, cliponaxis: false } as Plotly.Data);
    }
    for (const k of ["mean", "median"] as const) {
      if (!kinds.includes(k) || st.xFirst == null) continue;
      const v = k === "mean" ? st.Mean : st.Median;
      data.push({ type: "scatter", mode: "lines", x: [X(st.xFirst), X(st.xLast)], y: [v, v], yaxis, showlegend: false,
        line: { color: MARKER_COLORS[k], dash: k === "mean" ? "dash" : "dot", width: 1.5 }, hoverinfo: "skip",
        name: `${label} ${k}` } as Plotly.Data);
      data.push({ type: "scatter", mode: "text", x: [X(st.xLast)], y: [v], yaxis, showlegend: false, hoverinfo: "skip",
        text: [`${k} ${fmt(v)}`], textposition: "top left", textfont: { size: 11, color: MARKER_COLORS[k] }, cliponaxis: false } as Plotly.Data);
    }
  });

  const s = f.style ?? {};
  const layout = baseLayout(f.theme, f.height);
  (layout.title as Plotly.Layout["title"]).text = s.title?.trim() || f.meta?.title || "";
  layout.showlegend = s.showLegend ?? true;
  layout.uirevision = f.revision ?? "keep";
  layout.xaxis = xAxisFor(f.xKind, f.theme, s.xTitle?.trim() || f.meta?.xTitle) as Plotly.Layout["xaxis"];
  if (f.range) {
    (layout.xaxis as any).range = dates ? f.range.map((v) => msToPlotly(v)) : f.range;
    (layout.xaxis as any).autorange = false;
  }
  layout.yaxis = axis(f.theme, { title: { text: s.yTitle?.trim() || f.meta?.yTitle || "", font: { size: 12 } } }) as Plotly.Layout["yaxis"];
  if (f.yRange?.y) Object.assign(layout.yaxis as object, { range: f.yRange.y, autorange: false });
  if (hasY2) {
    layout.yaxis2 = axis(f.theme, {
      title: { text: s.y2Title?.trim() || f.meta?.y2Title || "", font: { size: 12 } },
      overlaying: "y", side: "right", showgrid: false,
    }) as Plotly.Layout["yaxis2"];
    if (f.yRange?.y2) Object.assign(layout.yaxis2 as object, { range: f.yRange.y2, autorange: false });
  } else {
    layout.margin = { ...layout.margin, r: 24 };
  }
  if (!layout.title || !(layout.title as any).text) layout.margin = { ...layout.margin, t: f.traces.length > 1 || hasY2 ? 36 : 20 };
  if (regions.length) (layout as any).yaxis3 = { overlaying: "y", range: [0, 1], visible: false, fixedrange: true };
  if (f.cursors) {
    // vertical A (solid) / B (dashed) lines; x goes through X() so date axes get tz-free strings
    const ink = T[f.theme].text;
    (layout as any).shapes = f.cursors.map((v, k) => ({
      type: "line", xref: "x", yref: "paper", x0: X(v), x1: X(v), y0: 0, y1: 1, layer: "above",
      line: { color: ink, width: 1.25, dash: k === 0 ? "solid" : "dash" },
    }));
    (layout as any).annotations = f.cursors.map((v, k) => ({
      xref: "x", yref: "paper", x: X(v), y: 1, xanchor: "left", yanchor: "top", xshift: 3, showarrow: false,
      text: `<b>${k === 0 ? "A" : "B"}</b>`, font: { size: 11, color: ink }, bgcolor: T[f.theme].paper, borderpad: 1,
    }));
    // a new editrevision makes Plotly forget its own copy of a dragged line, so it is redrawn full height at the stored x
    (layout as any).editrevision = `cursors:${f.cursors.join(",")}`;
  }
  return { data, layout };
}

const fmt = (v: number | null | undefined) =>
  v == null ? "—" : Math.abs(v) >= 1e5 || (v !== 0 && Math.abs(v) < 1e-3) ? v.toExponential(3) : String(Number(v.toPrecision(5)));

/** Padded y-range for "Rescale Y" from viewport stats. */
export function paddedRange(vals: (number | null | undefined)[]): [number, number] | null {
  const v = vals.filter((x): x is number => x != null && Number.isFinite(x));
  if (!v.length) return null;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const r = hi - lo;
  return r === 0 ? [lo - 0.5, hi + 0.5] : [lo - r * 0.05, hi + r * 0.05];
}

/** Oscillation finder: amplitude against frequency, with the strongest periods marked. */
export function buildSpectrumFigure(r: SpectrumResponse, theme: Theme, opts: { logY?: boolean; title?: string; color?: string } = {}) {
  const color = opts.color ?? CHANNELS[1];
  const top = r.peaks.slice(0, 5);
  const unit = r.timeAxis ? "Hz" : "cycles per x unit";
  const data: Plotly.Data[] = [
    { type: "scatter", mode: "lines", x: r.freq, y: r.amp, line: { color, width: 1.25 }, name: "Amplitude",
      hovertemplate: `%{x:.4~g} ${unit}<br>period %{customdata:.4~g}${r.timeAxis ? " s" : ""}<br>amplitude %{y:.4~g}<extra></extra>`,
      customdata: r.freq.map((v) => (v > 0 ? 1 / v : null)) } as Plotly.Data,
    { type: "scatter", mode: "text+markers", x: top.map((p) => p.freq), y: top.map((p) => p.amp), showlegend: false, hoverinfo: "skip",
      marker: { color: MARKER_COLORS.max, size: 8, symbol: "triangle-down" }, textposition: "top center", textfont: { size: 10, color: MARKER_COLORS.max },
      text: top.map((p, i) => `#${i + 1} ${fmt(p.period)}${r.timeAxis ? " s" : ""}`), cliponaxis: false } as Plotly.Data,
  ];
  const layout = baseLayout(theme, 300);
  (layout.title as any).text = opts.title ?? "";
  layout.showlegend = false;
  layout.hovermode = "closest";
  layout.margin = { l: 56, r: 16, t: opts.title ? 34 : 14, b: 44 };
  layout.xaxis = axis(theme, { title: { text: `Frequency (${unit})`, font: { size: 12 } } }) as any;
  layout.yaxis = axis(theme, { title: { text: "Amplitude", font: { size: 12 } }, type: opts.logY ? "log" : "linear" }) as any;
  return { data, layout };
}

// ------------------------------------------------------------------ other tools
export function buildHistogram(col: string, h: { counts: number[]; edges: number[] }, theme: Theme, color = CHANNELS[1]) {
  const centers = h.counts.map((_, i) => (h.edges[i] + h.edges[i + 1]) / 2);
  const width = h.edges.length > 1 ? h.edges[1] - h.edges[0] : 1;
  const layout = baseLayout(theme, 190);
  (layout.title as any).text = col;
  (layout.title as any).font = { size: 12 };
  layout.margin = { l: 44, r: 12, t: 30, b: 30 };
  layout.showlegend = false;
  layout.hovermode = "closest";
  layout.xaxis = axis(theme) as any;
  layout.yaxis = axis(theme) as any;
  layout.bargap = 0.04;
  return { data: [{ type: "bar", x: centers, y: h.counts, width, marker: { color, opacity: 0.85 }, hovertemplate: "%{x:.4~g}: %{y}<extra></extra>" }] as Plotly.Data[], layout };
}

export function buildBoxFigure(cols: string[], boxes: Record<string, any>, theme: Theme, style?: PlotStyle) {
  const n = cols.length;
  const data: Plotly.Data[] = [];
  const layout = baseLayout(theme, 460);
  layout.showlegend = false;
  layout.hovermode = "closest";
  (layout.title as any).text = style?.title || "";
  layout.grid = { rows: 1, columns: n, pattern: "independent" } as any;
  cols.forEach((c, i) => {
    const b = boxes[c];
    if (!b) return;
    const ax = i === 0 ? "" : String(i + 1);
    const color = style?.traces?.[c]?.color || CHANNELS[i % CHANNELS.length];
    data.push({
      type: "box", name: style?.traces?.[c]?.name || c, x: [style?.traces?.[c]?.name || c], q1: [b.q1], median: [b.median], q3: [b.q3],
      lowerfence: [b.lower], upperfence: [b.upper], mean: [b.mean], boxmean: true, xaxis: `x${ax}`, yaxis: `y${ax}`,
      marker: { color }, line: { color }, fillcolor: color + "33",
    } as any);
    if (b.outliers?.length) {
      data.push({ type: "scatter", mode: "markers", x: b.outliers.map(() => style?.traces?.[c]?.name || c), y: b.outliers,
        xaxis: `x${ax}`, yaxis: `y${ax}`, marker: { color, size: 4, opacity: 0.6 }, hovertemplate: "%{y:.5~g}<extra>outlier</extra>" } as any);
    }
    (layout as any)[`xaxis${ax}`] = axis(theme, { showline: false, ticks: "" });
    (layout as any)[`yaxis${ax}`] = axis(theme);
  });
  layout.margin = { l: 56, r: 16, t: style?.title ? 40 : 16, b: 40 };
  return { data, layout };
}

export function buildMatrixFigure(cols: string[], sample: Record<string, (number | null)[]>, theme: Theme, style?: PlotStyle) {
  const n = cols.length;
  const data: Plotly.Data[] = [];
  const layout = baseLayout(theme, Math.max(460, n * 170));
  layout.showlegend = false;
  layout.hovermode = "closest";
  (layout.title as any).text = style?.title || "";
  const gap = 0.035;
  const size = (1 - gap * (n - 1)) / n;
  const color = style?.traces?.["points"]?.color || CHANNELS[0];
  cols.forEach((yv, i) => {
    cols.forEach((xv, j) => {
      const k = i * n + j + 1;
      const ax = k === 1 ? "" : String(k);
      if (i === j) {
        data.push({ type: "histogram", x: sample[xv], xaxis: `x${ax}`, yaxis: `y${ax}`, marker: { color: CHANNELS[1], opacity: 0.8 }, nbinsx: 30 } as any);
      } else {
        data.push({ type: "scattergl", mode: "markers", x: sample[xv], y: sample[yv], xaxis: `x${ax}`, yaxis: `y${ax}`,
          marker: { size: 3, color, opacity: 0.55 }, hovertemplate: `${xv}: %{x:.4~g}<br>${yv}: %{y:.4~g}<extra></extra>` } as any);
      }
      const x0 = j * (size + gap);
      const y0 = 1 - (i + 1) * size - i * gap;
      (layout as any)[`xaxis${ax}`] = axis(theme, { domain: [x0, x0 + size], anchor: `y${ax}`, mirror: true,
        title: { text: i === n - 1 ? xv : "", font: { size: 11 } }, showticklabels: i === n - 1 });
      (layout as any)[`yaxis${ax}`] = axis(theme, { domain: [y0, y0 + size], anchor: `x${ax}`, mirror: true,
        title: { text: j === 0 ? yv : "", font: { size: 11 } }, showticklabels: j === 0 });
    });
  });
  layout.margin = { l: 70, r: 16, t: style?.title ? 40 : 16, b: 60 };
  return { data, layout };
}

export function build3DFigure(r: any, cfg: { x: string; y: string; z: string; mode: string }, theme: Theme, title: string, style?: PlotStyle) {
  const c = T[theme];
  const asDates = (arr: (number | null)[], kind: string) => (kind === "date" || kind === "time" ? arr.map((v) => msToPlotly(v)) : arr);
  r = { ...r, x: asDates(r.x, r.kinds.x), y: asDates(r.y, r.kinds.y), z: asDates(r.z, r.kinds.z), zColor: r.z };
  const zNum = (r.kinds.z === "date" || r.kinds.z === "time" ? r.zColor : r.z) as (number | null)[];
  const hover = `${cfg.x}: %{x}<br>${cfg.y}: %{y}<br>${cfg.z}: %{z}<extra></extra>`;
  const scale = [[0, "#1F3D2E"], [0.35, "#1A9BB5"], [0.7, "#8BA82F"], [1, "#E2B42B"]];
  let trace: any;
  if (cfg.mode === "mesh") {
    trace = { type: "mesh3d", x: r.x, y: r.y, z: r.z, intensity: zNum, colorscale: scale, opacity: 0.85, alphahull: -1, hovertemplate: hover };
  } else if (cfg.mode === "markers") {
    trace = { type: "scatter3d", mode: "markers", x: r.x, y: r.y, z: r.z, marker: { size: 3, color: zNum, colorscale: scale, opacity: 0.85 }, hovertemplate: hover };
  } else {
    trace = { type: "scatter3d", mode: "lines", x: r.x, y: r.y, z: r.z, line: { width: 4, color: zNum, colorscale: scale }, hovertemplate: hover };
  }
  const ax = (title: string, kind: string) => ({
    title: { text: title }, gridcolor: c.grid, zerolinecolor: c.zero, color: c.muted, backgroundcolor: c.plot,
    type: kind === "date" || kind === "time" ? "date" : "linear", ...(kind === "time" ? { tickformat: "%H:%M:%S" } : {}),
  });
  const layout = baseLayout(theme, 640);
  (layout.title as any).text = style?.title || title;
  layout.margin = { l: 0, r: 0, t: 40, b: 0 };
  layout.scene = { xaxis: ax(style?.xTitle || cfg.x, r.kinds.x), yaxis: ax(style?.yTitle || cfg.y, r.kinds.y), zaxis: ax(style?.y2Title || cfg.z, r.kinds.z) } as any;
  layout.hovermode = "closest";
  return { data: [trace] as Plotly.Data[], layout };
}
