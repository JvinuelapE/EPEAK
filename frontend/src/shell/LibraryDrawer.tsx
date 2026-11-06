import { useMemo, useState } from "react";
import { LuCalculator, LuDownload, LuPlus, LuSearch, LuTrash2, LuUpload, LuX, LuTable2 } from "react-icons/lu";
import { api } from "../api";
import { Button, Checkbox, Combo, CommitInput, Drawer, Empty, IconButton, toastError } from "../components/ui";
import { closeModal, getState, openModal, setLibrary, setState, setView, updateWs, useApp } from "../store";
import { plural } from "../util";
import { pickAndUpload } from "./actions";

export function LibraryDrawer() {
  const lib = useApp((s) => s.library);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [newCat, setNewCat] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const logs = useMemo(() => lib.logs.filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase()) || l.category.toLowerCase().includes(q.toLowerCase())), [lib, q]);
  const catOpts = lib.categories.map((c) => ({ value: c }));
  const run = (p: Promise<typeof lib>) => p.then((l) => setLibrary(l)).catch(toastError);

  const usage = (id: string) => getState().ws.tabs.filter((t) => JSON.stringify(t).includes(`"${id}"`)).map((t) => t.name);

  return (
    <Drawer title="Log library" onClose={closeModal} width={560}
      footer={<>
        <span className="muted small grow">{plural(lib.logs.length, "log")} · {lib.logs.reduce((a, l) => a + l.rows, 0).toLocaleString()} rows</span>
        {sel.size > 0 && <Button icon={<LuDownload size={14} />} onClick={() => api.downloadLogs([...sel]).catch(toastError)}>Download {sel.size} as CSV</Button>}
        <Button variant="primary" icon={<LuUpload size={14} />} onClick={pickAndUpload}>Upload logs</Button>
      </>}>
      <div className="lib-toolbar">
        <div className="search-input"><LuSearch size={14} /><input placeholder="Filter logs…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {!lib.logs.length ? (
        <Empty title="No logs yet">Upload CSV logs, or drop files anywhere in the window. Files with the same name replace the existing log, and tabs that use it update.</Empty>
      ) : (
        <div className="lib-list">
          {logs.map((l) => {
            const derived = Object.keys(l.math);
            return (
              <div key={l.id} className="lib-item">
                <Checkbox checked={sel.has(l.id)} onChange={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(l.id); else n.delete(l.id); return n; })} />
                <div className="lib-main">
                  <CommitInput className="lib-name" value={l.name} onCommit={(name) => run(api.patchLog(l.id, { name }))} aria-label="Log name" />
                  <div className="lib-meta muted small">
                    {l.rows.toLocaleString()} rows · {l.columns.length} columns{derived.length ? ` · ${derived.length} derived` : ""}
                  </div>
                </div>
                <Combo dense className="lib-cat" options={catOpts} value={l.category || null} placeholder="Category"
                  onChange={(v) => run(api.patchLog(l.id, { category: v ?? "" }))} />
                <div className="lib-actions">
                  <IconButton label="Open in Log Editor" onClick={() => { setState({ editorLogId: l.id }); setView("editor"); closeModal(); }}><LuTable2 size={15} /></IconButton>
                  <IconButton label="Derived variables (math engine)" onClick={() => openModal({ kind: "math", logId: l.id })}><LuCalculator size={15} /></IconButton>
                  <IconButton label="Download CSV" onClick={() => api.downloadLogs([l.id]).catch(toastError)}><LuDownload size={15} /></IconButton>
                  {confirm === l.id ? (
                    <span className="inline-confirm">
                      <Button size="sm" variant="danger" onClick={() => {
                        run(api.deleteLog(l.id));
                        updateWs((ws) => ({ ...ws, staging: ws.staging.filter((s) => s.logId !== l.id) }));
                        setConfirm(null);
                      }}>Delete</Button>
                      <IconButton label="Cancel" onClick={() => setConfirm(null)}><LuX size={14} /></IconButton>
                    </span>
                  ) : <IconButton label="Delete log" variant="danger" onClick={() => setConfirm(l.id)}><LuTrash2 size={15} /></IconButton>}
                </div>
                {confirm === l.id && usage(l.id).length > 0 && <div className="lib-warn small">Used by: {usage(l.id).join(", ")}. Those tabs will show an empty selection.</div>}
              </div>
            );
          })}
        </div>
      )}
      <div className="lib-cats">
        <h4>Categories</h4>
        <p className="muted small">Group logs (e.g. DIVA, PPA, PicoLog). Categories show as headings in every log picker.</p>
        <div className="chip-row">
          {lib.categories.map((c) => (
            <span key={c} className="chip chip-lg">{c}
              <span className="chip-x" role="button" aria-label={`Delete category ${c}`} onClick={() => run(api.deleteCategory(c))}><LuX size={11} /></span>
            </span>
          ))}
          <span className="add-cat">
            <input className="input input-sm" placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newCat.trim()) { run(api.addCategory(newCat)); setNewCat(""); } }} />
            <IconButton label="Add category" disabled={!newCat.trim()} onClick={() => { run(api.addCategory(newCat)); setNewCat(""); }}><LuPlus size={15} /></IconButton>
          </span>
        </div>
      </div>
    </Drawer>
  );
}
