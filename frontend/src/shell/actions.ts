import { api } from "../api";
import { toast, toastError } from "../components/ui";
import { closeModal, emptyWorkspace, getState, loadWorkspaceState, openModal, setLibrary, setState, updateWs } from "../store";
import type { Evidence } from "../types";
import { plural } from "../util";

export async function boot() {
  try {
    const s = await api.session();
    loadWorkspaceState(s.state ?? emptyWorkspace(), s.workspaceName || "Untitled", s.library, false);
    if (s.state) {
      // compare with the last named save so the "unsaved" dot is honest after a restart
      if (s.savedSignature) {
        const { signature } = await api.signature(getState().ws).catch(() => ({ signature: "" }));
        setState({ dirty: signature !== s.savedSignature });
      } else {
        setState({ dirty: s.state.tabs.length > 0 || s.library.logs.length > 0 });
      }
    }
    setState({ ready: true });
  } catch (e) {
    setState({ bootError: (e as Error).message, ready: true });
  }
}

function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

export async function uploadLogs(files: File[]) {
  if (!files.length) return;
  setState({ busy: `Reading ${plural(files.length, "file")}…` });
  try {
    const r = await api.upload(files);
    setLibrary(r.library);
    const fresh = r.added.length - r.replaced.length;
    if (fresh > 0) toast(`Added ${plural(fresh, "log")} (${r.added.filter((a) => !r.replaced.includes(a.name)).reduce((a, b) => a + b.rows, 0).toLocaleString()} rows).`);
    if (r.replaced.length) toast(`Replaced ${plural(r.replaced.length, "existing log")} with the uploaded version: ${r.replaced.join(", ")}. Tabs using them now show the new data.`, "info", 7000);
    r.errors.forEach((e) => toast(e, "error"));
  } catch (e) {
    toastError(e);
  } finally {
    setState({ busy: null });
  }
}

export const pickAndUpload = async () => uploadLogs(await pickFiles(".csv,.txt,.tsv,.log,text/csv,*/*"));

export async function addEvidence(files: File[]) {
  const imgs = files.filter((f) => f.type.startsWith("image/") || /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(f.name));
  if (!imgs.length) return;
  try {
    const r = await api.uploadEvidence(imgs);
    updateWs((ws) => ({ ...ws, evidence: [...ws.evidence, ...r.items as Evidence[]] }));
    toast(`Added ${plural(r.items.length, "image")} to the evidence board.`);
  } catch (e) {
    toastError(e);
  }
}
export const pickEvidence = async () => addEvidence(await pickFiles("image/*"));

export async function saveWorkspace(name?: string) {
  const s = getState();
  const target = name ?? s.wsName;
  if (!name && (!s.wsName || s.wsName === "Untitled")) {
    openModal({ kind: "saveAs" });
    return;
  }
  setState({ busy: "Saving workspace…" });
  try {
    const r = await api.saveWorkspace(target, s.ws);
    setState({ wsName: r.name, dirty: false });
    toast(`Saved “${r.name}”.`);
    closeModal();
  } catch (e) {
    toastError(e);
  } finally {
    setState({ busy: null });
  }
}

/** Ask before throwing away unsaved work. */
export function guardDirty(action: string, run: () => void) {
  if (!getState().dirty) return run();
  openModal({
    kind: "confirm", title: "Discard unsaved changes?", danger: true, action,
    body: `“${getState().wsName}” has changes that aren't saved to a workspace file. They will be lost (the latest autosave snapshot can still be restored).`,
    onConfirm: run,
  });
}

export async function openWorkspace(ref: string) {
  setState({ busy: "Opening workspace…" });
  try {
    const r = await api.loadWorkspace(ref);
    loadWorkspaceState(r.state, r.workspaceName, r.library, !!r.restored || !!r.converted);
    closeModal();
    if (r.converted) toast(`Converted “${r.workspaceName}” from the previous version. Save it to keep the new format.`, "info", 6000);
    else if (r.restored) toast(`Restored an autosave of “${r.workspaceName}”. Save to keep it.`, "info", 6000);
    else toast(`Opened “${r.workspaceName}”.`);
  } catch (e) {
    toastError(e);
  } finally {
    setState({ busy: null });
  }
}

export async function importWorkspaceFile(file: File) {
  setState({ busy: "Importing workspace…" });
  try {
    const r = await api.importWorkspace(file);
    loadWorkspaceState(r.state, r.workspaceName, r.library, !!r.converted);
    closeModal();
    toast(r.converted ? `Converted “${r.workspaceName}”. Save it to keep the new format.` : `Opened “${r.workspaceName}”.`, r.converted ? "info" : "ok", 6000);
  } catch (e) {
    toastError(e);
  } finally {
    setState({ busy: null });
  }
}
export const pickWorkspaceFile = async () => {
  const [f] = await pickFiles(".epeak,.pkl", false);
  if (f) guardDirty("Open", () => importWorkspaceFile(f));
};

export async function newWorkspace() {
  try {
    const r = await api.newWorkspace(emptyWorkspace());
    loadWorkspaceState(r.state, "Untitled", r.library, false);
    toast("Started a new workspace.");
  } catch (e) {
    toastError(e);
  }
}

export async function quit() {
  guardDirty("Quit", async () => {
    try {
      await api.saveSession(getState().ws, getState().wsName);
      await api.shutdown();
    } catch {
      /* server may already be gone */
    }
    setState({ stopped: true });
    setTimeout(() => window.close(), 300);
  });
}
