import { useEffect, useState } from "react";
import { LuDownload, LuFolderOpen, LuHistory, LuTrash2, LuUpload, LuArchive } from "react-icons/lu";
import { api } from "../api";
import { Button, Callout, IconButton, Modal, Segmented, Spinner, cx, toastError } from "../components/ui";
import { closeModal, getState, useApp } from "../store";
import type { WorkspaceEntry } from "../types";
import { guardDirty, openWorkspace, pickWorkspaceFile, saveWorkspace } from "./actions";

export function WorkspaceBrowser() {
  const [list, setList] = useState<{ saved: WorkspaceEntry[]; autosaves: WorkspaceEntry[] } | null>(null);
  const [tab, setTab] = useState<"saved" | "autosaves">("saved");
  const [sel, setSel] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const busy = useApp((s) => s.busy);
  useEffect(() => { api.workspaces().then(setList).catch(toastError); }, []);
  const rows = list ? list[tab] : [];
  const selected = rows.find((r) => r.ref === sel);

  const open = (ref: string) => guardDirty("Open", () => openWorkspace(ref));
  const del = async () => {
    if (!sel) return;
    try {
      setList(await api.deleteWorkspace(sel));
      setSel(null);
      setConfirmDel(false);
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Modal title="Open workspace" onClose={closeModal} width={760}
      subtitle="Workspaces hold your logs, analysis tabs, ledger and evidence board in one .epeak file."
      footer={<>
        <Button icon={<LuUpload size={14} />} onClick={pickWorkspaceFile}>Import file…</Button>
        <span className="grow" />
        {selected && tab === "saved" && !selected.legacy && <IconButton label="Download this workspace file" onClick={() => api.downloadWorkspace(selected.ref).catch(toastError)}><LuDownload size={16} /></IconButton>}
        {selected && (confirmDel
          ? <><span className="danger-text small">Delete “{selected.name}”?</span><Button variant="danger" onClick={del}>Delete</Button><Button onClick={() => setConfirmDel(false)}>Keep</Button></>
          : <IconButton label="Delete" variant="danger" onClick={() => setConfirmDel(true)}><LuTrash2 size={16} /></IconButton>)}
        <Button variant="primary" disabled={!selected || !!busy} icon={busy ? <Spinner /> : <LuFolderOpen size={15} />} onClick={() => selected && open(selected.ref)}>
          {selected?.legacy ? "Convert and open" : tab === "autosaves" ? "Restore snapshot" : "Open"}
        </Button>
      </>}>
      <Segmented value={tab} onChange={(v) => { setTab(v); setSel(null); setConfirmDel(false); }}
        options={[{ value: "saved", label: <><LuArchive size={13} /> Saved</> }, { value: "autosaves", label: <><LuHistory size={13} /> Autosave snapshots</> }]} />
      {tab === "autosaves" && <p className="muted small">A snapshot is taken every 2 minutes while there are changes; the last 10 per workspace are kept. Restoring never overwrites a saved workspace.</p>}
      <div className="ws-table">
        <div className="ws-row ws-head"><span>Name</span><span>{tab === "saved" ? "Saved" : "Snapshot"}</span><span>Size</span><span>Tabs</span><span>Logs</span></div>
        {!list && <div className="center pad"><Spinner size={18} /></div>}
        {list && !rows.length && <div className="muted pad center">{tab === "saved" ? "No saved workspaces yet. Use File → Save workspace, or import a file." : "No autosave snapshots yet."}</div>}
        {rows.map((r) => (
          <button type="button" key={r.ref} className={cx("ws-row", sel === r.ref && "is-sel")} onClick={() => { setSel(r.ref); setConfirmDel(false); }} onDoubleClick={() => open(r.ref)}>
            <span className="ws-name">{r.name}{r.legacy && <span className="badge" title="Saved by the previous Dash version; converted when opened">v1 .pkl</span>}{r.error && <span className="badge badge-bad">{r.error}</span>}</span>
            <span className="num">{r.modified}</span><span className="num">{r.size}</span><span className="num">{r.tabs ?? "—"}</span><span className="num">{r.logs ?? "—"}</span>
          </button>
        ))}
      </div>
      {list?.saved.some((r) => r.legacy) && tab === "saved" && <Callout>Workspaces marked v1 come from the previous version. They open normally; save them once to convert them to the new .epeak format.</Callout>}
    </Modal>
  );
}

export function SaveAsDialog() {
  const cur = useApp((s) => s.wsName);
  const [name, setName] = useState(cur === "Untitled" ? "" : cur);
  const [exists, setExists] = useState<string[]>([]);
  useEffect(() => { api.workspaces().then((l) => setExists(l.saved.filter((s) => !s.legacy).map((s) => s.name))).catch(() => undefined); }, []);
  const clean = name.trim().replace(/[^\w .-]/g, "").replace(/ /g, "_");
  const overwrite = exists.includes(clean) && clean !== getState().wsName;
  return (
    <Modal title="Save workspace as" onClose={closeModal} width={420}
      footer={<><Button onClick={closeModal}>Cancel</Button><Button variant={overwrite ? "danger" : "primary"} disabled={!clean} onClick={() => saveWorkspace(clean)}>{overwrite ? "Replace" : "Save"}</Button></>}>
      <label className="field">
        <span className="field-label">Workspace name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CT calibration September"
          onKeyDown={(e) => e.key === "Enter" && clean && saveWorkspace(clean)} data-autofocus />
        <span className="field-hint">{overwrite ? `A workspace named “${clean}” already exists and will be replaced.` : clean ? `Saved as ${clean}.epeak` : "Letters, numbers, spaces, dots and dashes."}</span>
      </label>
    </Modal>
  );
}

export function ConfirmDialog({ title, body, action, danger, onConfirm }: { title: string; body: string; action: string; danger?: boolean; onConfirm: () => void }) {
  return (
    <Modal title={title} onClose={closeModal} width={440}
      footer={<><Button onClick={closeModal}>Cancel</Button><Button data-autofocus variant={danger ? "danger" : "primary"} onClick={() => { closeModal(); onConfirm(); }}>{action}</Button></>}>
      <p>{body}</p>
    </Modal>
  );
}
