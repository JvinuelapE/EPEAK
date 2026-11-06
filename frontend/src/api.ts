import type {
  AnalyticsResponse, AtResponse, DatasetInfo, DemoInfo, EventsResponse, LibrarySnapshot, LimitsResponse, RowsResponse, SeriesResponse,
  SpectrumResponse, StatsResponse, SteadyConfig, SteadyResponse, WorkspaceEntry, WorkspaceState, Evidence,
} from "./types";

export class ApiError extends Error {}

async function request<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const init: RequestInit = { method, signal };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Can't reach the E-PEAK server. Check that it is still running.");
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status}).`;
    try {
      const j = await res.json();
      if (j.detail) msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* not json */
    }
    throw new ApiError(msg);
  }
  return res.json() as Promise<T>;
}

async function download(method: string, url: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    let msg = `Download failed (${res.status}).`;
    try {
      msg = (await res.json()).detail ?? msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(msg);
  }
  const cd = res.headers.get("Content-Disposition") || "";
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd) || /filename="?([^";]+)"?/.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : "download";
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const files = (list: File[] | FileList, field = "files") => {
  const fd = new FormData();
  Array.from(list).forEach((f) => fd.append(field, f, f.name));
  return fd;
};

export interface SessionResponse {
  state: WorkspaceState | null;
  workspaceName: string;
  savedSignature: string | null;
  library: LibrarySnapshot;
  version: string;
}
export interface LoadResponse {
  state: WorkspaceState;
  workspaceName: string;
  library: LibrarySnapshot;
  restored?: boolean;
  converted?: boolean;
  savedSignature?: string;
}
export interface EditorInfo {
  draftId: string;
  logId: string;
  rows: number;
  dirty: boolean;
  canUndo: boolean;
  columns: { name: string; numeric: boolean }[];
  message?: string;
}

export const api = {
  session: () => request<SessionResponse>("GET", "/api/session"),
  saveSession: (state: WorkspaceState, workspaceName: string) =>
    request<{ ok: boolean; signature: string }>("PUT", "/api/session/state", { state, workspaceName }),
  shutdown: () => request("POST", "/api/shutdown"),
  openFolder: (which: "workspaces" | "data") => request<{ path: string }>("POST", "/api/open-folder", { which }),

  library: () => request<LibrarySnapshot>("GET", "/api/library"),
  upload: (list: File[] | FileList) =>
    request<{ added: { id: string; name: string; rows: number }[]; errors: string[]; replaced: string[]; library: LibrarySnapshot }>(
      "POST", "/api/library/upload", files(list)),
  patchLog: (id: string, body: { name?: string; category?: string }) =>
    request<LibrarySnapshot>("PATCH", `/api/library/${id}`, body),
  deleteLog: (id: string) => request<LibrarySnapshot>("DELETE", `/api/library/${id}`),
  addCategory: (name: string) => request<LibrarySnapshot>("POST", "/api/library/categories", { name }),
  deleteCategory: (name: string) => request<LibrarySnapshot>("DELETE", `/api/library/categories/${encodeURIComponent(name)}`),
  setMath: (id: string, v: string, expr: string) => request<LibrarySnapshot>("POST", `/api/library/${id}/math`, { var: v, expr }),
  previewMath: (id: string, expr: string, signal?: AbortSignal) =>
    request<{ sample: (number | null)[]; min: number | null; max: number | null; nan: number }>(
      "POST", `/api/library/${id}/math/preview`, { expr }, signal),
  deleteMath: (id: string, v: string) => request<LibrarySnapshot>("DELETE", `/api/library/${id}/math/${encodeURIComponent(v)}`),
  downloadLogs: (ids: string[]) => download("POST", "/api/library/download", { ids }),
  logRow: (id: string, index: number, cols: (string | null)[], timeCol?: string | null) => {
    const q = new URLSearchParams({ index: String(index), cols: cols.filter(Boolean).join("\x1f") });
    if (timeCol) q.set("timeCol", timeCol);
    return request<{ index: number; rows: number; values: Record<string, number | null>; label: string | null }>(
      "GET", `/api/library/${id}/row?${q}`);
  },
  logMarks: (id: string, timeCol: string) =>
    request<{ rows: number; marks: { index: number; label: string }[] }>(
      "GET", `/api/library/${id}/marks?timeCol=${encodeURIComponent(timeCol)}`),
  logFind: (id: string, timeCol: string, q: string) =>
    request<{ index: number | null }>(
      "GET", `/api/library/${id}/find?timeCol=${encodeURIComponent(timeCol)}&q=${encodeURIComponent(q)}`),

  dataset: (kind: string, cfg: unknown, signal?: AbortSignal) =>
    request<DatasetInfo>("POST", "/api/dataset", { kind, cfg }, signal),
  series: (id: string, body: { cols: string[]; x0?: number | null; x1?: number | null; width: number }, signal?: AbortSignal) =>
    request<SeriesResponse>("POST", `/api/dataset/${id}/series`, body, signal),
  stats: (id: string, body: { cols: string[]; x0?: number | null; x1?: number | null }, signal?: AbortSignal) =>
    request<StatsResponse>("POST", `/api/dataset/${id}/stats`, body, signal),
  rows: (id: string, body: { cols: string[]; x0?: number | null; x1?: number | null; offset: number; limit: number }, signal?: AbortSignal) =>
    request<RowsResponse>("POST", `/api/dataset/${id}/rows`, body, signal),
  analytics: (id: string, body: { cols: string[]; x0?: number | null; x1?: number | null }) =>
    request<AnalyticsResponse>("POST", `/api/dataset/${id}/analytics`, body),
  at: (id: string, body: { cols: string[]; xs: number[] }, signal?: AbortSignal) =>
    request<AtResponse>("POST", `/api/dataset/${id}/at`, body, signal),
  limits: (id: string, body: { checks: { col: string; lo: number | null; hi: number | null }[]; x0?: number | null; x1?: number | null }, signal?: AbortSignal) =>
    request<LimitsResponse>("POST", `/api/dataset/${id}/limits`, body, signal),
  events: (id: string, body: { rules: unknown[]; x0?: number | null; x1?: number | null }, signal?: AbortSignal) =>
    request<EventsResponse>("POST", `/api/dataset/${id}/events`, body, signal),
  steady: (id: string, body: { cfg: SteadyConfig; cols: string[]; x0?: number | null; x1?: number | null }, signal?: AbortSignal) =>
    request<SteadyResponse>("POST", `/api/dataset/${id}/steady`, body, signal),
  spectrum: (id: string, body: { col: string; x0?: number | null; x1?: number | null }, signal?: AbortSignal) =>
    request<SpectrumResponse>("POST", `/api/dataset/${id}/spectrum`, body, signal),

  threeD: (cfg: unknown, signal?: AbortSignal) => request<any>("POST", "/api/tools/3d", cfg, signal),
  globalStats: (cfg: unknown, signal?: AbortSignal) => request<any>("POST", "/api/tools/global-stats", cfg, signal),

  editorOpen: (logId: string) => request<EditorInfo>("POST", "/api/editor/open", { logId }),
  editorRows: (id: string, body: { offset: number; limit: number; filters?: Record<string, string>; sort?: { col: string; dir: "asc" | "desc" } | null }, signal?: AbortSignal) =>
    request<{ total: number; offset: number; rows: (string | number | boolean | null)[][]; columns: string[] }>(
      "POST", `/api/editor/${id}/rows`, body, signal),
  editorOp: (id: string, op: string, body: Record<string, unknown> = {}) =>
    request<EditorInfo>("POST", `/api/editor/${id}/op`, { op, ...body }),
  editorCommit: (id: string, name?: string) =>
    request<EditorInfo & { message: string; logId: string; library: LibrarySnapshot }>("POST", `/api/editor/${id}/commit`, { name }),
  editorCsv: (id: string) => download("GET", `/api/editor/${id}/csv`),

  uploadEvidence: (list: File[] | FileList) => request<{ items: Evidence[] }>("POST", "/api/evidence", files(list)),
  deleteEvidence: (file: string) => request("DELETE", `/api/evidence/${file}`),

  workspaces: () => request<{ saved: WorkspaceEntry[]; autosaves: WorkspaceEntry[] }>("GET", "/api/workspaces"),
  saveWorkspace: (name: string, state: WorkspaceState) =>
    request<{ name: string; signature: string }>("POST", "/api/workspaces/save", { name, state }),
  loadWorkspace: (ref: string) => request<LoadResponse>("POST", "/api/workspaces/load", { ref }),
  newWorkspace: (state: WorkspaceState) => request<LoadResponse>("POST", "/api/workspaces/new", { state }),
  autosave: (name: string, state: WorkspaceState) =>
    request<{ saved: boolean; timestamp: string | null }>("POST", "/api/workspaces/autosave", { name, state }),
  deleteWorkspace: (ref: string) =>
    request<{ saved: WorkspaceEntry[]; autosaves: WorkspaceEntry[] }>("POST", "/api/workspaces/delete", { ref }),
  importWorkspace: (file: File) => request<LoadResponse>("POST", "/api/workspaces/import", files([file], "file")),
  downloadWorkspace: (ref: string) => download("GET", `/api/workspaces/download?ref=${encodeURIComponent(ref)}`),
  signature: (state: WorkspaceState) => request<{ signature: string }>("POST", "/api/workspaces/signature", { state }),

  exportReport: (items: unknown[]) => download("POST", "/api/export/report", { items }),

  tutorial: () => request<{ tutorial: boolean; demo: DemoInfo | null; port: number }>("GET", "/api/tutorial"),
  tutorialReset: () => request<LoadResponse & { demo: DemoInfo }>("POST", "/api/tutorial/reset"),
  tutorialOpen: () => request<{ url: string }>("POST", "/api/tutorial/open"),
  tutorialShortcut: () => request<{ path: string }>("POST", "/api/tutorial/shortcut"),
};

export const evidenceUrl = (file: string) => `/api/evidence/${file}`;
