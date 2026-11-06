import type { XKind } from "./types";

export const uid = (n = 10) =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "").slice(0, n);

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const d = (...a: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Compact numeric display for readouts: 4 significant digits, SI-ish for large/small values. */
export function fmtNum(v: number | null | undefined, digits = 4): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (!Number.isFinite(v)) return v > 0 ? "∞" : "−∞";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e7 || a < 1e-4)) return v.toExponential(digits - 1).replace("e+", "e");
  const s = Number(v.toPrecision(digits + (a >= 1000 ? Math.floor(Math.log10(a)) - 2 : 0)));
  return s.toLocaleString(undefined, { maximumFractionDigits: 6 }).replace("-", "−");
}

export function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6)));
  return String(v);
}

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, "0");

/** Parse a Plotly/ISO date string as UTC (Plotly date axes are timezone-free). */
export function dateStrToMs(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?/.exec(s.trim());
  if (!m) return null;
  const frac = m[7] ? Number(`0.${m[7]}`) * 1000 : 0;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)) + frac;
}

export function timeStrToMs(s: string): number | null {
  const m = /^\s*(-)?(\d+):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*$/.exec(s);
  if (!m) return null;
  const v = (+m[2] * 3600 + +m[3] * 60 + +(m[4] ?? 0)) * 1000 + (m[5] ? Number(`0.${m[5]}`) * 1000 : 0);
  return m[1] ? -v : v;
}

export const isDateKind = (k?: XKind | string) => k === "date" || k === "time";

/** Plotly gives date-axis ranges as strings; everything else as numbers. Normalise to numbers. */
export function axisValueToNumber(v: unknown, kind: XKind): number | null {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return null;
  if (isDateKind(kind)) return dateStrToMs(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Timezone-free Plotly date string for an axis value in ms (Plotly reads raw numbers as local time). */
export function msToPlotly(v: number | null | undefined): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const d = new Date(v);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
}

export function fmtAxis(v: number | null | undefined, kind: XKind): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  if (kind === "date") {
    const d = new Date(v);
    const ms = d.getUTCMilliseconds();
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${ms ? "." + pad(ms, 3) : ""}`;
  }
  if (kind === "time") {
    const neg = v < 0;
    const t = Math.abs(v);
    const ms = Math.round(t % 1000);
    const s = Math.floor(t / 1000);
    return `${neg ? "-" : ""}${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}${ms ? "." + pad(ms, 3) : ""}`;
  }
  return String(Number(v.toPrecision(10)));
}

export function parseAxisInput(s: string, kind: XKind): number | null {
  if (!s.trim()) return null;
  if (kind === "date") return dateStrToMs(s);
  if (kind === "time") return timeStrToMs(s);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const out = arr.slice();
  const [it] = out.splice(from, 1);
  out.splice(clamp(to, 0, out.length), 0, it);
  return out;
}

export const plural = (n: number, w: string, p = `${w}s`) => `${n.toLocaleString()} ${n === 1 ? w : p}`;

export function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}
