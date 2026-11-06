// Lets the guided tours open a panel on a plot ("show the steady states") without the plot
// having been rendered yet: a request waits until that plot mounts, then it is applied once.
export type PlotPanel = "limits" | "events" | "steady" | "oscillation" | "table" | "notes" | "readout";

type Listener = (panel: PlotPanel) => void;
const pending = new Map<string, PlotPanel[]>();
const listeners = new Map<string, Set<Listener>>();
const key = (tabId: string, plotKey: string) => `${tabId}\u0001${plotKey}`;

/** Ask a plot to open a panel. plotKey is the plot id in a 2D plot tab, "default" in other tabs. */
export function requestPanel(tabId: string, plotKey: string, panel: PlotPanel) {
  const k = key(tabId, plotKey);
  const ls = listeners.get(k);
  if (ls?.size) ls.forEach((l) => l(panel));
  else pending.set(k, [...(pending.get(k) ?? []), panel]);
}

/** Called by each plot: receive requests (including ones made before it mounted). */
export function onPanelRequest(tabId: string, plotKey: string, l: Listener): () => void {
  const k = key(tabId, plotKey);
  if (!listeners.has(k)) listeners.set(k, new Set());
  listeners.get(k)!.add(l);
  const waiting = pending.get(k);
  if (waiting) {
    pending.delete(k);
    waiting.forEach((p) => l(p));
  }
  return () => {
    listeners.get(k)?.delete(l);
  };
}
