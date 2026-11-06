// Tutorial mode in the browser: knowing we're the tutorial, opening it from a normal E-PEAK,
// the desktop shortcut, resetting the demo and leaving.
import { api } from "../api";
import { toast, toastError } from "../components/ui";
import { getState, loadWorkspaceState, openModal, setState } from "../store";

/** Ask the server whether this is the tutorial; called once the session has loaded. */
export async function initTutorial() {
  try {
    const r = await api.tutorial();
    if (r.tutorial) setState({ tutorial: true, demo: r.demo, autosaveOn: false, dirty: false });
  } catch {
    /* an older server: not the tutorial */
  }
}

export async function openTutorial() {
  try {
    await api.tutorialOpen();
    toast("Opening the tutorial in a new browser tab. The first time takes a few seconds while the demo logs are created.", "info", 7000);
  } catch (e) {
    toastError(e);
  }
}

export async function createTutorialShortcut() {
  try {
    const r = await api.tutorialShortcut();
    toast(`Created the “E-PEAK Tutorial” shortcut: ${r.path}`, "ok", 6000);
  } catch (e) {
    toastError(e);
  }
}

export function resetDemo() {
  openModal({
    kind: "confirm", title: "Reset the demo?", action: "Reset", danger: true,
    body: "Puts every demo log, tab, limit and report item back as it was. Anything you changed in the tutorial is lost; your own E-PEAK work is not affected.",
    onConfirm: async () => {
      setState({ busy: "Resetting the demo…" });
      try {
        const r = await api.tutorialReset();
        loadWorkspaceState(r.state, r.workspaceName, r.library, false);
        setState({ demo: r.demo, view: "analysis" });
        toast("The demo is back to its starting point.");
      } catch (e) {
        toastError(e);
      } finally {
        setState({ busy: null });
      }
    },
  });
}

/** Close the tutorial copy of E-PEAK (the user's own E-PEAK keeps running). */
export async function exitTutorial() {
  try {
    await api.saveSession(getState().ws, getState().wsName);
    await api.shutdown();
  } catch {
    /* already gone */
  }
  setState({ stopped: true });
  setTimeout(() => window.close(), 300);
}

/** Id of a demo log by its key (bench, ref, ct_a, ct_b, thermal, day1, day2, part1-3, messy). */
export const demoLog = (key: string) => getState().demo?.logs[key] ?? null;
