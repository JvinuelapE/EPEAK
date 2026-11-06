import { useMemo, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { LuSearch } from "react-icons/lu";
import { cx } from "../components/ui";
import { closeModal, openModal, redo, setState, setTheme, setView, undo, updateWs, useApp, getState } from "../store";
import { addTab } from "../views/Analysis";
import { TOOLS, toolMeta } from "../views/tabs/registry";
import { guardDirty, newWorkspace, pickAndUpload, pickWorkspaceFile, quit, saveWorkspace } from "./actions";
import { startTour } from "./Tour";
import { createTutorialShortcut, exitTutorial, openTutorial, resetDemo } from "./tutorial";

interface Cmd { id: string; label: string; group: string; hint?: string; run: () => void }

export function Palette() {
  const tabs = useApp((s) => s.ws.tabs);
  const logs = useApp((s) => s.library.logs);
  const tutorial = useApp((s) => s.tutorial);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const cmds = useMemo<Cmd[]>(() => {
    const c: Cmd[] = [
      { id: "save", label: "Save workspace", group: "Workspace", hint: "Ctrl+S", run: () => saveWorkspace() },
      { id: "saveas", label: "Save workspace as…", group: "Workspace", run: () => openModal({ kind: "saveAs" }) },
      { id: "open", label: "Open workspace…", group: "Workspace", hint: "Ctrl+O", run: () => openModal({ kind: "workspaces" }) },
      { id: "import", label: "Import workspace file (.epeak / .pkl)…", group: "Workspace", run: pickWorkspaceFile },
      { id: "new", label: "New workspace", group: "Workspace", run: () => guardDirty("Start new", newWorkspace) },
      { id: "upload", label: "Upload logs…", group: "Data", hint: "Ctrl+U", run: pickAndUpload },
      { id: "library", label: "Open log library", group: "Data", hint: "Ctrl+L", run: () => openModal({ kind: "library" }) },
      { id: "math", label: "Math engine", group: "Data", hint: "Ctrl+M", run: () => openModal({ kind: "math" }) },
      { id: "limits", label: "Limits (pass/fail) for all plots", group: "Data", run: () => openModal({ kind: "limits" }) },
      { id: "hub", label: "Go to Research hub", group: "Navigate", hint: "Ctrl+1", run: () => setView("hub") },
      { id: "analysis", label: "Go to Analysis", group: "Navigate", hint: "Ctrl+2", run: () => setView("analysis") },
      { id: "editor", label: "Go to Log editor", group: "Navigate", hint: "Ctrl+3", run: () => setView("editor") },
      { id: "report", label: "Go to Report studio", group: "Navigate", hint: "Ctrl+4", run: () => setView("report") },
      { id: "undo", label: "Undo", group: "Edit", hint: "Ctrl+Z", run: undo },
      { id: "redo", label: "Redo", group: "Edit", hint: "Ctrl+Shift+Z", run: redo },
      { id: "theme", label: "Toggle dark theme", group: "View", run: () => setTheme(getState().theme === "dark" ? "light" : "dark") },
      { id: "tour", label: "Start guided tour", group: "Help", run: () => startTour(tutorial ? "tutorial" : "overview") },
      { id: "docs", label: "User guide", group: "Help", hint: "F1", run: () => openModal({ kind: "docs" }) },
      { id: "how", label: "How the analysis works", group: "Help", run: () => openModal({ kind: "how", topic: "calibration" }) },
      ...(tutorial
        ? [{ id: "reset-demo", label: "Reset the demo", group: "Tutorial", run: resetDemo },
          { id: "exit-tutorial", label: "Exit the tutorial", group: "Tutorial", run: () => void exitTutorial() }]
        : [{ id: "open-tutorial", label: "Open the tutorial (demo logs and guided tours)", group: "Help", run: () => void openTutorial() },
          { id: "tutorial-shortcut", label: "Create tutorial shortcut on desktop", group: "Help", run: () => void createTutorialShortcut() }]),
      { id: "quit", label: "Quit E-PEAK", group: "App", run: quit },
    ];
    TOOLS.forEach((t) => c.push({ id: `new-${t.type}`, label: `New ${t.label} tab`, group: "Tools", run: () => { setView("analysis"); addTab(t.type); } }));
    tabs.forEach((t) => c.push({ id: `tab-${t.id}`, label: t.name, group: "Open tabs", hint: toolMeta(t.type).label,
      run: () => { setView("analysis"); updateWs((ws) => ({ ...ws, activeTabId: t.id }), "active-tab"); } }));
    logs.forEach((l) => c.push({ id: `log-${l.id}`, label: `Edit ${l.name}`, group: "Logs", hint: `${l.rows.toLocaleString()} rows`,
      run: () => { setState({ editorLogId: l.id }); setView("editor"); } }));
    return c;
  }, [tabs, logs, tutorial]);

  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return cmds.filter((c) => words.every((w) => `${c.label} ${c.group}`.toLowerCase().includes(w))).slice(0, 60);
  }, [q, cmds]);
  useEffect(() => setHi(0), [q]);
  useEffect(() => { list.current?.querySelector(".is-hi")?.scrollIntoView({ block: "nearest" }); }, [hi]);

  const run = (c?: Cmd) => {
    if (!c) return;
    closeModal();
    setTimeout(c.run, 0);
  };
  return createPortal(
    <div className="modal-backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <div className="palette-input"><LuSearch size={16} />
          <input autoFocus placeholder="Type a command, tab or log…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
              if (e.key === "Enter") run(filtered[hi]);
              if (e.key === "Escape") closeModal();
            }} />
        </div>
        <div ref={list} className="palette-list">
          {filtered.map((c, i) => (
            <button key={c.id} type="button" className={cx("palette-item", i === hi && "is-hi")} onMouseEnter={() => setHi(i)} onClick={() => run(c)}>
              <span className="palette-group">{c.group}</span><span className="palette-label">{c.label}</span>{c.hint && <kbd>{c.hint}</kbd>}
            </button>
          ))}
          {!filtered.length && <div className="muted pad">No matches.</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
