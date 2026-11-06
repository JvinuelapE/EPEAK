// ---------- library ----------
export interface ColumnInfo {
  name: string;
  numeric: boolean;
}
export interface LogMeta {
  id: string;
  name: string;
  category: string;
  math: Record<string, string>;
  version: number;
  rows: number;
  columns: ColumnInfo[];
  contentHash: string;
}
export interface LibrarySnapshot {
  version: number;
  categories: string[];
  logs: LogMeta[];
}

// ---------- workspace state ----------
export type TabType = "generic" | "calibration" | "compare" | "append" | "three_d" | "global_stats" | "waveform";
export type Range = [number, number] | null;
export type MarkerKind = "max" | "min" | "mean" | "median";
export type Markers = Record<string, MarkerKind[]>;
/** Two measurement cursors (A, B) as x positions in axis units (ms for date/time axes); null when hidden. */
export type Cursors = [number, number] | null;
/** Lower and upper limit of a variable; either may be null for a one-sided limit. */
export interface Limit {
  lo: number | null;
  hi: number | null;
}
/** Per-plot limits keyed by trace: a Limit replaces the workspace limit on this plot, null switches it off here. */
export type LimitOverrides = Record<string, Limit | null>;
export type EventKind = "above" | "below" | "outside" | "step" | "spike" | "dropout";
export interface EventRule {
  id: string;
  col: string | null;
  kind: EventKind;
  /** threshold (above/below), change (step), jump size (spike) or gap length in s (dropout) */
  value: number | null;
  /** minimum duration in s (x units on numeric axes) for above/below/outside/spike */
  minDur: number;
  enabled: boolean;
}
export interface SteadyConfig {
  col: string | null;
  /** rolling window length in s (x units on numeric axes) */
  window: number;
  /** largest standard deviation inside the window that still counts as steady */
  tol: number;
  tolMode: "abs" | "pct";
  minDur: number;
}
/** Limits, event rules and steady-state settings stored with each plot. */
export interface PlotExtras {
  limits?: LimitOverrides;
  events?: EventRule[];
  steady?: SteadyConfig | null;
}

interface TabBase {
  id: string;
  name: string;
  type: TabType;
  comment: string;
}

export interface GenericPlot extends PlotExtras {
  id: string;
  yl: string[];
  yr: string[];
  comment: string;
  range: Range;
  markers: Markers;
  cursors?: Cursors;
}
export interface GenericTab extends TabBase {
  type: "generic";
  logId: string | null;
  x: string | null;
  skip: number;
  linkX: boolean;
  excluded: number[];
  legacyValid?: number[] | null;
  plots: GenericPlot[];
}

export interface SeriesTabCommon extends PlotExtras {
  skip: number;
  excluded: number[];
  legacyValid?: number[] | null;
  range: Range;
  markers: Markers;
  cursors?: Cursors;
}
export interface CalibSource {
  logId: string | null;
  x: string | null;
  y: string | null;
  offset: number;
}
export type ErrMode = "absolute" | "percentage" | "phase";
export interface CalibrationTab extends TabBase, SeriesTabCommon {
  type: "calibration";
  sources: CalibSource[];
  errMode: ErrMode;
}
export interface CompareSource {
  slot: number;
  logId: string | null;
  x: string | null;
  yl: string[];
  yr: string[];
  offset: number;
}
export interface CompareTab extends TabBase, SeriesTabCommon {
  type: "compare";
  sources: CompareSource[];
}
export interface AppendSource {
  slot: number;
  logId: string | null;
  x: string | null;
  start: string;
  end: string;
}
export interface AppendTab extends TabBase, SeriesTabCommon {
  type: "append";
  sources: AppendSource[];
  yl: string[];
  yr: string[];
}
export interface ThreeDTab extends TabBase {
  type: "three_d";
  logId: string | null;
  x: string | null;
  y: string | null;
  z: string | null;
  mode: "lines" | "markers" | "mesh";
}
export interface GlobalStatsTab extends TabBase {
  type: "global_stats";
  logId: string | null;
  vars: string[];
}
export type WaveShape = "sine" | "square" | "triangle" | "sawtooth";
export interface WaveformTab extends TabBase {
  type: "waveform";
  shape: WaveShape;
  v: number;
  i: number;
  f: number;
  p: number;
  thdV: number;
  thdI: number;
  linkTabId: string | null;
  logId: string | null;
  timeCol: string | null;
  row: number;
  live?: boolean;
  cols: { v: string | null; i: string | null; f: string | null; p: string | null; thdV: string | null; thdI: string | null };
}
export type Tab = GenericTab | CalibrationTab | CompareTab | AppendTab | ThreeDTab | GlobalStatsTab | WaveformTab;
export type SeriesTab = CalibrationTab | CompareTab | AppendTab;

export type LedgerStatus = "testing" | "validated" | "rejected";
export interface LedgerRow {
  id: string;
  date: string;
  logRef: string;
  hypothesis: string;
  status: LedgerStatus;
  conclusion: string;
}
export interface BlueprintNode {
  id: string;
  name: string;
  x: number;
  y: number;
}
export interface Evidence {
  id: string;
  name: string;
  file: string;
  mime: string;
  type: "image" | "schematic";
  nodes: BlueprintNode[];
  width?: number | null;
  height?: number | null;
}
export type DashStyle = "solid" | "dash" | "dot" | "dashdot" | "longdash";
export interface TraceStyle {
  name?: string;
  color?: string | null;
  dash?: DashStyle;
  width?: number;
  mode?: "lines" | "markers" | "lines+markers";
}
export interface PlotStyle {
  title?: string;
  xTitle?: string;
  yTitle?: string;
  y2Title?: string;
  showLegend?: boolean;
  traces?: Record<string, TraceStyle>;
}
export type StagingPart = "graph" | "stats" | "limits" | "events" | "steady" | "data" | "notes" | "ledger" | "evidence" | "raw";
export interface StagingItem {
  id: string;
  part: StagingPart;
  tabId?: string;
  logId?: string;
  format: "excel" | "csv";
  sheet: string;
}
export interface WorkspaceState {
  version: 2;
  tabs: Tab[];
  activeTabId: string | null;
  ledger: LedgerRow[];
  evidence: Evidence[];
  styles: Record<string, Record<string, PlotStyle>>;
  staging: StagingItem[];
  /** Workspace-wide limits by variable name; they apply wherever the variable is plotted. */
  limits?: Record<string, Limit>;
}

// ---------- tutorial ----------
/** Where the features planted in the demo logs are, so the guided tours can zoom to them. */
export interface DemoInfo {
  version: number;
  /** demo log ids by key: bench, ref, ct_a, ct_b, thermal, day1, day2, part1..3, messy */
  logs: Record<string, string>;
  bench: { overvoltage: [number, number][]; dropout: [number, number]; ramp: [number, number]; spikes: number[] };
  calib: { plateaus: [number, number][]; steps: number[] };
  thermal: { period: number };
  sync: { offset: number };
}
export type HowTopic = "calibration" | "steady" | "events" | "limits" | "oscillation" | "decimation" | "cursors";

// ---------- API payloads ----------
export type XKind = "date" | "time" | "number" | "index" | "elapsed";
export interface DatasetTrace {
  col: string;
  axis: "y" | "y2";
  color?: string;
  dash?: DashStyle;
  width?: number;
  mode?: "lines" | "markers" | "lines+markers";
  marker?: number;
}
export interface DatasetInfo {
  id: string;
  kind: string;
  xKind: XKind;
  xLabel: string;
  rows: number;
  columns: string[];
  traces: DatasetTrace[];
  tableColumns: string[];
  warnings: string[];
  meta: { title?: string; xTitle?: string; yTitle?: string; y2Title?: string };
  xMin: number | null;
  xMax: number | null;
}
export interface SeriesResponse {
  traces: Record<string, { x: (number | string | null)[]; y: (number | null)[] }>;
  decimated: boolean;
  points: number;
}
export interface ColStats {
  Mean: number | null;
  Median: number | null;
  Min: number | null;
  Max: number | null;
  "Std Dev": number | null;
  "Peak-to-Peak": number | null;
  RMS: number | null;
  count: number;
  xAtMin?: number | null;
  xAtMax?: number | null;
  xFirst?: number | null;
  xLast?: number | null;
}
export interface StatsResponse {
  metrics: string[];
  stats: Record<string, ColStats | null>;
  points?: number;
}
export interface RowsResponse {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  total: number;
  offset: number;
}
export interface AnalyticsResponse {
  columns: string[];
  pearson: (number | null)[][] | null;
  spearman: (number | null)[][] | null;
  histograms: Record<string, { counts: number[]; edges: number[] }>;
}
export interface AtResponse {
  values: Record<string, ({ x: number | null; y: number | null; rid: number } | null)[]>;
}
export interface LimitResult {
  lo: number | null;
  hi: number | null;
  n: number;
  out: number;
  above: number;
  below: number;
  pct: number | null;
  min: number | null;
  max: number | null;
  worst: number | null;
  firstX: number | null;
  pass: boolean | null;
}
export interface LimitsResponse {
  results: Record<string, LimitResult>;
}
export interface EventItem {
  start: number;
  end: number;
  dur: number;
  peak: number | null;
  peakX: number | null;
  n: number;
}
export interface RuleResult {
  count: number;
  totalDur: number;
  events: EventItem[];
  truncated: boolean;
  error?: string;
}
export interface EventsResponse {
  rules: Record<string, RuleResult>;
}
export interface PlateauStats {
  mean: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
  n: number;
}
export interface Plateau {
  start: number;
  end: number;
  dur: number;
  n: number;
  stats: Record<string, PlateauStats>;
}
export interface SteadyResponse {
  driver: string;
  plateaus: Plateau[];
  count: number;
  truncated: boolean;
}
export interface SpectrumPeak {
  freq: number;
  period: number;
  amp: number;
  snr: number;
}
export interface SpectrumResponse {
  col: string;
  freq: number[];
  amp: number[];
  peaks: SpectrumPeak[];
  dt: number;
  n: number;
  samples: number;
  bridgedPct: number;
  nyquist: number;
  resolution: number;
  timeAxis: boolean;
}
export interface WorkspaceEntry {
  ref: string;
  name: string;
  modified: string;
  size: string;
  tabs: number | null;
  logs: number | null;
  legacy?: boolean;
  error?: string;
}
