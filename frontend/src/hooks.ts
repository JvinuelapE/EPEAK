import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { Option } from "./components/ui";
import { useApp } from "./store";
import type { DatasetInfo, LibrarySnapshot, LogMeta } from "./types";

const dsCache = new Map<string, DatasetInfo>();

/** Build (or reuse) the server-side dataset for a tab config. Debounced and abortable. */
export function useDataset(kind: string, cfg: Record<string, unknown> | null, delay = 220) {
  const key = cfg ? JSON.stringify([kind, cfg]) : null;
  const libVersion = useApp((s) => s.library.version);
  const [state, setState] = useState<{ info: DatasetInfo | null; error: string | null; loading: boolean }>(
    () => ({ info: key ? dsCache.get(key + libVersion) ?? null : null, error: null, loading: false }));
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!key || !cfg) {
      setState({ info: null, error: null, loading: false });
      return;
    }
    const cached = dsCache.get(key + libVersion);
    if (cached && retry === 0) {
      setState({ info: cached, error: null, loading: false });
      return;
    }
    const ctl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(() => {
      api.dataset(kind, cfg, ctl.signal)
        .then((info) => {
          dsCache.set(key + libVersion, info);
          setState({ info, error: null, loading: false });
        })
        .catch((e: Error) => {
          if (e.name === "AbortError") return;
          setState({ info: null, error: e.message, loading: false });
        });
    }, cached ? 0 : delay);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [key, libVersion, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    if (key) dsCache.delete(key + libVersion);
    setRetry((r) => r + 1);
  };
  return { ...state, refresh };
}

/** Datasets live in a bounded server cache; when one expires, rebuild transparently. */
export const isExpired = (msg?: string | null) => !!msg && msg.includes("expired");

export function logOptions(lib: LibrarySnapshot): Option[] {
  return lib.logs
    .slice()
    .sort((a, b) => (a.category || "~").localeCompare(b.category || "~") || a.name.localeCompare(b.name))
    .map((l) => ({ value: l.id, label: l.name, group: l.category || "Uncategorised", hint: `${l.rows.toLocaleString()} rows` }));
}

export function useLogOptions() {
  const lib = useApp((s) => s.library);
  return useMemo(() => logOptions(lib), [lib]);
}

export function useLog(id: string | null | undefined): LogMeta | undefined {
  return useApp((s) => (id ? s.library.logs.find((l) => l.id === id) : undefined));
}

export function columnOptions(log: LogMeta | undefined, opts: { numeric?: boolean; exclude?: (string | null | undefined)[] } = {}): Option[] {
  if (!log) return [];
  return log.columns
    .filter((c) => (!opts.numeric || c.numeric) && !opts.exclude?.includes(c.name))
    .map((c) => ({ value: c.name, label: c.name, hint: log.math[c.name] ? "derived" : c.numeric ? undefined : "text" }));
}

export function guessTimeColumn(log: LogMeta | undefined): string | null {
  if (!log?.columns.length) return null;
  const names = log.columns.map((c) => c.name);
  return names.find((n) => n === "Time") ?? names.find((n) => n === "Timestamp")
    ?? names.find((n) => /time|date/i.test(n)) ?? names[0];
}

export function useAbortableEffect(fn: (signal: AbortSignal) => void | Promise<void>, deps: unknown[], delay = 0) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => void ref.current(ctl.signal), delay);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
