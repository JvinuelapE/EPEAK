import { useSyncExternalStore } from "react";
import { api } from "./api";
import type { DemoInfo, HowTopic, LibrarySnapshot, Tab, WorkspaceState } from "./types";
import { debounce } from "./util";

export type View = "hub" | "analysis" | "editor" | "report";
export type Modal =
  | { kind: "workspaces" }
  | { kind: "saveAs" }
  | { kind: "library" }
  | { kind: "math"; logId?: string | null }
  | { kind: "style"; tabId: string; plotKey: string }
  | { kind: "docs"; section?: string }
  | { kind: "palette" }
  | { kind: "limits" }
  | { kind: "how"; topic: HowTopic }
  | { kind: "confirm"; title: string; body: string; action: string; danger?: boolean; onConfirm: () => void }
  | null;

export interface AppState {
  ready: boolean;
  bootError: string | null;
  ws: WorkspaceState;
  wsName: string;
  dirty: boolean;
  library: LibrarySnapshot;
  view: View;
  theme: "light" | "dark";
  autosaveOn: boolean;
  lastAutosave: string | null;
  busy: string | null;
  modal: Modal;
  tour: number | null;
  /** which guided tour is running (see shell/Tour.tsx) */
  tourId: string;
  /** running as the tutorial (demo logs, guided tours, separate data folder) */
  tutorial: boolean;
  demo: DemoInfo | null;
  stopped: boolean;
  editorLogId: string | null;
  setupOpen: boolean;
  past: WorkspaceState[];
  future: WorkspaceState[];
}

export const emptyWorkspace = (): WorkspaceState => ({
  version: 2, tabs: [], activeTabId: null, ledger: [], evidence: [], styles: {}, staging: [],
});

const prefs = (() => {
  try {
    return JSON.parse(localStorage.getItem("epeak.prefs") || "{}");
  } catch {
    return {};
  }
})();

let state: AppState = {
  ready: false,
  bootError: null,
  ws: emptyWorkspace(),
  wsName: "Untitled",
  dirty: false,
  library: { version: 0, categories: [], logs: [] },
  view: prefs.view ?? "analysis",
  theme: prefs.theme ?? (matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  autosaveOn: prefs.autosaveOn ?? true,
  lastAutosave: null,
  busy: null,
  modal: null,
  tour: null,
  tourId: "overview",
  tutorial: false,
  demo: null,
  stopped: false,
  editorLogId: null,
  setupOpen: prefs.setupOpen ?? true,
  past: [],
  future: [],
};

const listeners = new Set<() => void>();
export const getState = () => state;
export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export function useApp<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}

function savePrefs() {
  try {
    localStorage.setItem("epeak.prefs", JSON.stringify({ view: state.view, theme: state.theme, autosaveOn: state.autosaveOn, setupOpen: state.setupOpen }));
  } catch {
    /* storage unavailable */
  }
}

// ---------------------------------------------------------------- workspace updates + undo
let lastKey: string | null = null;
let lastTime = 0;

/** Update the workspace. Edits sharing a `coalesce` key within ~1 s form a single undo step. */
export function updateWs(fn: (ws: WorkspaceState) => WorkspaceState, coalesce?: string) {
  const prev = state.ws;
  const next = fn(prev);
  if (next === prev) return;
  const now = Date.now();
  const merge = coalesce && coalesce === lastKey && now - lastTime < 1200;
  lastKey = coalesce ?? null;
  lastTime = now;
  setState({
    ws: next,
    dirty: true,
    past: merge ? state.past : [...state.past.slice(-99), prev],
    future: [],
  });
}

export function updateTab<T extends Tab>(id: string, fn: (t: T) => Partial<T> | T, coalesce?: string) {
  updateWs((ws) => {
    const idx = ws.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return ws;
    const cur = ws.tabs[idx] as T;
    const patch = fn(cur);
    const tabs = ws.tabs.slice();
    tabs[idx] = { ...cur, ...patch } as T;
    return { ...ws, tabs };
  }, coalesce ?? `tab:${id}`);
}

/** Changes that should not create undo steps (e.g. zoom ranges while panning). */
export function updateWsQuiet(fn: (ws: WorkspaceState) => WorkspaceState) {
  const next = fn(state.ws);
  if (next !== state.ws) setState({ ws: next, dirty: true });
}

export function undo() {
  const prev = state.past[state.past.length - 1];
  if (!prev) return false;
  setState({ ws: prev, past: state.past.slice(0, -1), future: [state.ws, ...state.future], dirty: true });
  lastKey = null;
  return true;
}
export function redo() {
  const next = state.future[0];
  if (!next) return false;
  setState({ ws: next, future: state.future.slice(1), past: [...state.past, state.ws], dirty: true });
  lastKey = null;
  return true;
}

export const setView = (view: View) => {
  setState({ view });
  savePrefs();
};
export const setTheme = (theme: "light" | "dark") => {
  setState({ theme });
  savePrefs();
};
export const setAutosave = (autosaveOn: boolean) => {
  setState({ autosaveOn });
  savePrefs();
};
export const setSetupOpen = (setupOpen: boolean) => {
  setState({ setupOpen });
  savePrefs();
};
export const openModal = (modal: Modal) => setState({ modal });
export const closeModal = () => setState({ modal: null });
export const setLibrary = (library: LibrarySnapshot, markDirty = true) =>
  setState((s) => ({ library, dirty: markDirty ? s.dirty || library.version !== s.library.version : s.dirty }));

// ---------------------------------------------------------------- persistence
const persist = debounce(() => {
  if (!state.ready || state.stopped) return;
  api.saveSession(state.ws, state.wsName).catch(() => undefined);
}, 900);

let prevWs = state.ws;
let prevName = state.wsName;
subscribe(() => {
  if (state.ws !== prevWs || state.wsName !== prevName) {
    prevWs = state.ws;
    prevName = state.wsName;
    persist();
  }
});

/** Replace everything after loading/creating a workspace. */
export function loadWorkspaceState(ws: WorkspaceState, name: string, library: LibrarySnapshot, dirty = false) {
  const normal = normalise(ws);
  setState({ ws: normal, wsName: name, library, dirty, past: [], future: [] });
}

export function normalise(ws: Partial<WorkspaceState> | null): WorkspaceState {
  const base = emptyWorkspace();
  const out = { ...base, ...(ws ?? {}) } as WorkspaceState;
  out.tabs = (out.tabs ?? []).filter(Boolean);
  if (out.activeTabId && !out.tabs.some((t) => t.id === out.activeTabId)) out.activeTabId = out.tabs[0]?.id ?? null;
  if (!out.activeTabId) out.activeTabId = out.tabs[0]?.id ?? null;
  return out;
}

// ---------------------------------------------------------------- autosave
let lastAutosaveWs: WorkspaceState | null = null;
let lastAutosaveLib = -1;
setInterval(async () => {
  const s = state;
  if (!s.ready || s.stopped || !s.autosaveOn) return;
  if (lastAutosaveWs === s.ws && lastAutosaveLib === s.library.version) return;
  if (!s.ws.tabs.length && !s.library.logs.length) return;
  try {
    const r = await api.autosave(s.wsName, s.ws);
    lastAutosaveWs = s.ws;
    lastAutosaveLib = s.library.version;
    if (r.saved) setState({ lastAutosave: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
  } catch {
    /* next tick will retry */
  }
}, 120_000);

export const libLog = (id: string | null | undefined) => (id ? state.library.logs.find((l) => l.id === id) : undefined);
