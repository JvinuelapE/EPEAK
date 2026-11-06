// Shared logic for limits, event rules and steady states: used by the plot panels, the
// figures and the report export, so all three always agree.
import type { EventKind, EventRule, Limit, LimitOverrides, PlotExtras, SteadyConfig, XKind } from "./types";
import { fmtNum, uid } from "./util";

/** The variable a trace shows. Time-sync and calibration traces carry a prefix ("Log2: ", "REF: ", "TGT 3: "). */
export const baseVar = (col: string) => col.replace(/^(Log\d+|REF|TGT \d+): /, "");

export const hasLimit = (l?: Limit | null): l is Limit => !!l && (l.lo != null || l.hi != null);

export interface ResolvedLimit extends Limit {
  scope: "workspace" | "plot";
  /** the workspace key (variable name) or, for a plot limit, the trace */
  key: string;
}
export type LimitScope = "workspace" | "plot" | "off" | "none";

/** Workspace key for a trace: an exact entry wins, otherwise the variable without its log prefix. */
export function workspaceKey(col: string, ws?: Record<string, Limit>): string {
  return ws && hasLimit(ws[col]) ? col : baseVar(col);
}

export function limitScope(col: string, ws?: Record<string, Limit>, over?: LimitOverrides): LimitScope {
  if (over && col in over) return over[col] === null ? "off" : "plot";
  return hasLimit(ws?.[workspaceKey(col, ws)]) ? "workspace" : "none";
}

/** The limit that applies to each trace: the plot's own limit first, then the workspace limit. */
export function resolveLimits(cols: string[], ws?: Record<string, Limit>, over?: LimitOverrides): Record<string, ResolvedLimit> {
  const out: Record<string, ResolvedLimit> = {};
  for (const col of cols) {
    if (over && col in over) {
      const o = over[col];
      if (hasLimit(o)) out[col] = { lo: o.lo, hi: o.hi, scope: "plot", key: col };
      continue;
    }
    const key = workspaceKey(col, ws);
    const w = ws?.[key];
    if (hasLimit(w)) out[col] = { lo: w.lo, hi: w.hi, scope: "workspace", key };
  }
  return out;
}

export function limitText(l: Limit): string {
  if (l.lo != null && l.hi != null) return `${fmtNum(l.lo)} … ${fmtNum(l.hi)}`;
  return l.hi != null ? `≤ ${fmtNum(l.hi)}` : `≥ ${fmtNum(l.lo)}`;
}

export const EVENT_KINDS: { value: EventKind; label: string; valueLabel?: string; durable: boolean; title: string }[] = [
  { value: "above", label: "Above", valueLabel: "Threshold", durable: true, title: "The value is above a threshold" },
  { value: "below", label: "Below", valueLabel: "Threshold", durable: true, title: "The value is below a threshold" },
  { value: "outside", label: "Outside limits", durable: true, title: "The value is outside this variable's limits" },
  { value: "step", label: "Step", valueLabel: "Change ≥", durable: false, title: "The value changes by at least this much from one sample to the next" },
  { value: "spike", label: "Spike", valueLabel: "Jump ≥", durable: true, title: "A sample jumps away from its neighbours (rolling median of 5) by at least this much" },
  { value: "dropout", label: "Dropout", valueLabel: "Gap >", durable: false, title: "No real sample for longer than this (missing rows or empty cells)" },
];
export const eventKind = (k: EventKind) => EVENT_KINDS.find((e) => e.value === k) ?? EVENT_KINDS[0];

export const durUnit = (k: XKind) => (k === "date" || k === "time" || k === "elapsed" ? "s" : "x units");

export function ruleLabel(r: EventRule, unit = "s"): string {
  const v = r.value == null ? "?" : fmtNum(r.value);
  const dur = r.minDur > 0 && eventKind(r.kind).durable ? ` for ≥ ${fmtNum(r.minDur)} ${unit}` : "";
  switch (r.kind) {
    case "above": return `> ${v}${dur}`;
    case "below": return `< ${v}${dur}`;
    case "outside": return `outside limits${dur}`;
    case "step": return `step ≥ ${v}`;
    case "spike": return `spike ≥ ${v}${dur}`;
    case "dropout": return `no data for > ${v} ${unit}`;
  }
}

export const newRule = (col: string | null): EventRule => ({ id: uid(8), col, kind: "above", value: null, minDur: 0, enabled: true });
export const defaultSteady = (col: string | null): SteadyConfig => ({ col, window: 10, tol: 1, tolMode: "pct", minDur: 30 });

/** Active rules for traces that are in the plot, as the backend wants them ("outside" carries the limits). */
export function rulesPayload(rules: EventRule[] | undefined, cols: string[], limits: Record<string, Limit>) {
  return (rules ?? [])
    .filter((r) => r.enabled && r.col && cols.includes(r.col))
    .map((r) => ({ ...r, lo: limits[r.col!]?.lo ?? null, hi: limits[r.col!]?.hi ?? null }));
}

export const steadyActive = (s: SteadyConfig | null | undefined, cols: string[]): s is SteadyConfig =>
  !!s && !!s.col && cols.includes(s.col);

export const extrasActive = (e: PlotExtras, cols: string[], ws?: Record<string, Limit>) => ({
  limits: Object.keys(resolveLimits(cols, ws, e.limits)).length > 0,
  events: rulesPayload(e.events, cols, {}).length > 0,
  steady: steadyActive(e.steady, cols),
});
