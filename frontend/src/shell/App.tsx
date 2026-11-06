import { useEffect, useState } from "react";
import {
  LuBookOpen, LuChartLine, LuFileSpreadsheet, LuTable2, LuDatabase, LuSun, LuMoon, LuCommand, LuCircleHelp,
  LuFolderOpen, LuSave, LuSaveAll, LuFilePlus, LuUpload, LuCalculator, LuPalette, LuPower, LuUndo2, LuRedo2, LuCompass, LuHistory, LuFileInput,
  LuShieldCheck, LuGraduationCap, LuRotateCcw, LuLogOut, LuLightbulb, LuMonitorDown, LuPlay,
} from "react-icons/lu";
import { api } from "../api";
import { Callout, Menu, Spinner, Toaster, cx, toastError, type MenuItem } from "../components/ui";
import { closeModal, openModal, redo, setAutosave, setTheme, setView, undo, useApp, getState, type View } from "../store";
import { isTypingTarget } from "../util";
import { AnalysisView, activeTab } from "../views/Analysis";
import { HubView } from "../views/Hub";
import { LogEditorView } from "../views/LogEditor";
import { ReportStudioView } from "../views/ReportStudio";
import { guardDirty, newWorkspace, pickAndUpload, pickWorkspaceFile, quit, saveWorkspace, uploadLogs, addEvidence } from "./actions";
import { Docs } from "./Docs";
import { HowModal } from "./HowItWorks";
import { LibraryDrawer } from "./LibraryDrawer";
import { LimitsManager } from "./LimitsManager";
import { MathEngine } from "./MathEngine";
import { Palette } from "./Palette";
import { StyleEditor } from "./StyleEditor";
import { Tour, hasTour, maybeOfferTour, startTour } from "./Tour";
import { createTutorialShortcut, exitTutorial, initTutorial, openTutorial, resetDemo } from "./tutorial";
import { ConfirmDialog, SaveAsDialog, WorkspaceBrowser } from "./WorkspaceDialogs";
import logo from "../../favicon.svg";

const NAV: { view: View; label: string; icon: typeof LuBookOpen; tour: string }[] = [
  { view: "hub", label: "Research hub", icon: LuBookOpen, tour: "nav-hub" },
  { view: "analysis", label: "Analysis", icon: LuChartLine, tour: "nav-analysis" },
  { view: "editor", label: "Log editor", icon: LuTable2, tour: "nav-editor" },
  { view: "report", label: "Report studio", icon: LuFileSpreadsheet, tour: "nav-report" },
];

function Rail() {
  const view = useApp((s) => s.view);
  const logs = useApp((s) => s.library.logs.length);
  return (
    <nav className="rail" aria-label="Main">
      <div className="rail-logo" dangerouslySetInnerHTML={{ __html: logo }} title="E-PEAK" />
      {NAV.map((n, i) => (
        <button key={n.view} type="button" className={cx("rail-btn", view === n.view && "is-active")} onClick={() => setView(n.view)}
          title={`${n.label} (Ctrl+${i + 1})`} aria-current={view === n.view} data-tour={n.tour}>
          <n.icon size={20} /><span>{n.label.split(" ")[0]}</span>
        </button>
      ))}
      <span className="grow" />
      <button type="button" className="rail-btn" onClick={() => openModal({ kind: "library" })} title="Log library" data-tour="nav-library">
        <LuDatabase size={20} /><span>Logs</span>{logs > 0 && <b className="rail-count">{logs}</b>}
      </button>
    </nav>
  );
}

function TopBar() {
  const name = useApp((s) => s.wsName);
  const dirty = useApp((s) => s.dirty);
  const theme = useApp((s) => s.theme);
  const autosaveOn = useApp((s) => s.autosaveOn);
  const canUndo = useApp((s) => s.past.length > 0);
  const canRedo = useApp((s) => s.future.length > 0);
  const view = useApp((s) => s.view);
  const tutorial = useApp((s) => s.tutorial);
  const file: MenuItem[] = [
    { label: "New workspace", icon: <LuFilePlus size={15} />, onSelect: () => guardDirty("Start new", newWorkspace) },
    { label: "Open workspace…", icon: <LuFolderOpen size={15} />, shortcut: "Ctrl+O", onSelect: () => openModal({ kind: "workspaces" }) },
    { label: "Import workspace file…", icon: <LuFileInput size={15} />, onSelect: pickWorkspaceFile },
    { separator: true },
    { label: "Save", icon: <LuSave size={15} />, shortcut: "Ctrl+S", onSelect: () => saveWorkspace() },
    { label: "Save as…", icon: <LuSaveAll size={15} />, shortcut: "Ctrl+Shift+S", onSelect: () => openModal({ kind: "saveAs" }) },
    { separator: true },
    { label: "Autosave every 2 minutes", checked: autosaveOn, onSelect: () => setAutosave(!autosaveOn) },
    { label: "Restore an autosave…", icon: <LuHistory size={15} />, onSelect: () => openModal({ kind: "workspaces" }) },
    { label: "Show workspaces folder", icon: <LuFolderOpen size={15} />, onSelect: () => api.openFolder("workspaces").catch(toastError) },
    { separator: true },
    { label: "Quit E-PEAK", icon: <LuPower size={15} />, danger: true, onSelect: quit },
  ];
  const tab = view === "analysis" ? activeTab() : undefined;
  const data: MenuItem[] = [
    { label: "Upload logs…", icon: <LuUpload size={15} />, shortcut: "Ctrl+U", onSelect: pickAndUpload },
    { label: "Log library…", icon: <LuDatabase size={15} />, shortcut: "Ctrl+L", onSelect: () => openModal({ kind: "library" }) },
    { label: "Math engine…", icon: <LuCalculator size={15} />, shortcut: "Ctrl+M", onSelect: () => openModal({ kind: "math" }) },
    { label: "Limits…", icon: <LuShieldCheck size={15} />, onSelect: () => openModal({ kind: "limits" }) },
    { label: "Plot style of current tab…", icon: <LuPalette size={15} />, disabled: !tab,
      onSelect: () => tab && openModal({ kind: "style", tabId: tab.id, plotKey: tab.type === "generic" ? tab.plots[0]?.id : tab.type === "global_stats" ? "boxplot" : "default" }) },
  ];
  const help: MenuItem[] = [
    { label: "Guided tour", icon: <LuCompass size={15} />, onSelect: () => startTour(tutorial ? "tutorial" : "overview") },
    { label: "User guide", icon: <LuCircleHelp size={15} />, shortcut: "F1", onSelect: () => openModal({ kind: "docs" }) },
    { label: "How the analysis works", icon: <LuLightbulb size={15} />, onSelect: () => openModal({ kind: "how", topic: "calibration" }) },
    { separator: true },
    ...(tutorial ? [
      { label: "Reset the demo", icon: <LuRotateCcw size={15} />, onSelect: resetDemo },
      { label: "Exit the tutorial", icon: <LuLogOut size={15} />, onSelect: exitTutorial },
    ] : [
      { label: "Open the tutorial", icon: <LuGraduationCap size={15} />, onSelect: openTutorial },
      { label: "Create tutorial shortcut on desktop", icon: <LuMonitorDown size={15} />, onSelect: createTutorialShortcut },
    ]),
    { separator: true },
    { label: "What's new in 2.0", icon: <LuHistory size={15} />, onSelect: () => openModal({ kind: "docs", section: "changes" }) },
    { label: "Command palette", icon: <LuCommand size={15} />, shortcut: "Ctrl+K", onSelect: () => openModal({ kind: "palette" }) },
  ];
  return (
    <header className="topbar">
      <div className="menus" data-tour="menus">
        <Menu items={file} trigger={({ toggle, open }) => <button type="button" className={cx("menu-trigger", open && "is-open")} onClick={toggle}>File</button>} />
        <Menu items={data} trigger={({ toggle, open }) => <button type="button" className={cx("menu-trigger", open && "is-open")} onClick={toggle}>Data</button>} />
        <Menu items={help} trigger={({ toggle, open }) => <button type="button" className={cx("menu-trigger", open && "is-open")} onClick={toggle}>Help</button>} />
      </div>
      <div className="ws-title" data-tour="ws-title">
        <button type="button" className="ws-name-btn" onClick={() => openModal({ kind: "saveAs" })} title="Save as…">{name.replace(/_/g, " ")}</button>
        <span className={cx("save-state", dirty && "is-dirty")} title={dirty ? "Unsaved changes (your session is kept even if you close the browser)" : "Saved"}>{dirty ? "Unsaved" : "Saved"}</span>
      </div>
      <div className="top-actions">
        <button type="button" className="icon-btn on-dark" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><LuUndo2 size={17} /></button>
        <button type="button" className="icon-btn on-dark" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}><LuRedo2 size={17} /></button>
        <button type="button" className="palette-btn" onClick={() => openModal({ kind: "palette" })}><LuCommand size={13} /> Search actions <kbd>Ctrl K</kbd></button>
        <button type="button" className="icon-btn on-dark" title={theme === "dark" ? "Light theme" : "Dark theme"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <LuSun size={17} /> : <LuMoon size={17} />}
        </button>
      </div>
    </header>
  );
}

/** Shown at the top in tutorial mode. */
function TutorialBanner() {
  const on = useApp((s) => s.tutorial);
  const view = useApp((s) => s.view);
  const activeId = useApp((s) => s.ws.activeTabId);
  if (!on) return null;
  const tourId = view === "analysis" ? (hasTour(activeId) ? activeId : null) : hasTour(`view:${view}`) ? `view:${view}` : null;
  return (
    <div className="tutorial-banner" data-tour="tutorial-banner">
      <LuGraduationCap size={17} />
      <b>Tutorial</b>
      <span className="tutorial-banner-text">Demo workspace with built-in logs. Nothing here touches your own work.</span>
      <span className="grow" />
      {tourId && <button type="button" className="tb-btn is-primary" onClick={() => startTour(tourId)}><LuPlay size={13} /> Tour this {view === "analysis" ? "tab" : "page"}</button>}
      <button type="button" className="tb-btn" onClick={() => startTour("tutorial")}><LuCompass size={13} /> Overview</button>
      <button type="button" className="tb-btn" onClick={() => openModal({ kind: "how", topic: "calibration" })}><LuLightbulb size={13} /> How the analysis works</button>
      <button type="button" className="tb-btn" onClick={resetDemo}><LuRotateCcw size={13} /> Reset demo</button>
      <button type="button" className="tb-btn" onClick={exitTutorial}><LuLogOut size={13} /> Exit</button>
    </div>
  );
}

function StatusBar() {
  const lib = useApp((s) => s.library);
  const autosaveOn = useApp((s) => s.autosaveOn);
  const last = useApp((s) => s.lastAutosave);
  const busy = useApp((s) => s.busy);
  const tabs = useApp((s) => s.ws.tabs.length);
  return (
    <footer className="statusbar">
      <span>{lib.logs.length} logs · {lib.logs.reduce((a, l) => a + l.rows, 0).toLocaleString()} rows</span>
      <span>{tabs} analysis tabs</span>
      <span className="grow" />
      {busy && <span className="busy"><Spinner size={11} /> {busy}</span>}
      <button type="button" className={cx("autosave-pill", !autosaveOn && "is-off")} onClick={() => setAutosave(!autosaveOn)} title="Click to toggle autosave">
        <i />{autosaveOn ? `Autosave on${last ? ` · last ${last}` : ""}` : "Autosave paused"}
      </button>
    </footer>
  );
}

function ModalHost() {
  const m = useApp((s) => s.modal);
  if (!m) return null;
  switch (m.kind) {
    case "workspaces": return <WorkspaceBrowser />;
    case "saveAs": return <SaveAsDialog />;
    case "library": return <LibraryDrawer />;
    case "math": return <MathEngine logId={m.logId} />;
    case "style": return <StyleEditor tabId={m.tabId} plotKey={m.plotKey} />;
    case "docs": return <Docs section={m.section} />;
    case "palette": return <Palette />;
    case "limits": return <LimitsManager />;
    case "how": return <HowModal topic={m.topic} />;
    case "confirm": return <ConfirmDialog {...m} />;
  }
}

function useShortcuts() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === "F1") { e.preventDefault(); openModal({ kind: "docs" }); return; }
      if (!mod) return;
      if (k === "s") { e.preventDefault(); if (e.shiftKey) openModal({ kind: "saveAs" }); else saveWorkspace(); return; }
      if (k === "o") { e.preventDefault(); openModal({ kind: "workspaces" }); return; }
      if (k === "k") { e.preventDefault(); openModal(getState().modal?.kind === "palette" ? null : { kind: "palette" }); return; }
      if (k === "u") { e.preventDefault(); pickAndUpload(); return; }
      if (k === "l") { e.preventDefault(); openModal({ kind: "library" }); return; }
      if (k === "m") { e.preventDefault(); openModal({ kind: "math" }); return; }
      if (["1", "2", "3", "4"].includes(k)) { e.preventDefault(); setView(NAV[Number(k) - 1].view); closeModal(); return; }
      if (isTypingTarget(e.target) || getState().modal) return;
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
}

function GlobalDrop() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const isFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => { if (isFiles(e)) { depth++; setOver(true); } };
    const leave = (e: DragEvent) => { if (isFiles(e)) { depth = Math.max(0, depth - 1); if (!depth) setOver(false); } };
    const overH = (e: DragEvent) => { if (isFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const files = Array.from(e.dataTransfer!.files);
      const ws = files.filter((f) => /\.(epeak|pkl)$/i.test(f.name));
      const imgs = files.filter((f) => f.type.startsWith("image/"));
      const logs = files.filter((f) => !ws.includes(f) && !imgs.includes(f));
      if (ws[0]) import("./actions").then((a) => guardDirty("Open", () => a.importWorkspaceFile(ws[0])));
      if (imgs.length) addEvidence(imgs);
      if (logs.length) uploadLogs(logs);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overH);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overH);
      window.removeEventListener("drop", drop);
    };
  }, []);
  if (!over) return null;
  return <div className="global-drop"><div><LuUpload size={28} /><b>Drop to add</b><span>CSV logs go to the library, images to the evidence board, .epeak / .pkl files open as a workspace.</span></div></div>;
}

export function App() {
  const ready = useApp((s) => s.ready);
  const bootError = useApp((s) => s.bootError);
  const view = useApp((s) => s.view);
  const theme = useApp((s) => s.theme);
  const stopped = useApp((s) => s.stopped);
  const tutorial = useApp((s) => s.tutorial);
  useShortcuts();
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { if (ready && !bootError) void initTutorial().then(maybeOfferTour); }, [ready, bootError]);
  useEffect(() => {
    // the tutorial keeps its own session, so there is nothing to lose by closing it
    const h = (e: BeforeUnloadEvent) => { const s = getState(); if (s.dirty && !s.stopped && !s.tutorial) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  if (stopped) return <div className="stopped"><div dangerouslySetInnerHTML={{ __html: logo }} className="stopped-logo" />
    <h1>{tutorial ? "The tutorial is closed" : "E-PEAK has stopped"}</h1>
    <p>{tutorial ? "You can close this browser tab. Your own E-PEAK is not affected; open the tutorial again from Help any time." : "You can close this browser tab. Open E-PEAK again to continue where you left off."}</p></div>;
  if (!ready) return <div className="boot"><Spinner size={22} /></div>;
  return (
    <div className="app">
      <Rail />
      <div className="app-main">
        <TopBar />
        <TutorialBanner />
        {bootError && <div className="pad"><Callout kind="error">{bootError}</Callout></div>}
        <main className="view" key={view}>
          {view === "hub" && <HubView />}
          {view === "analysis" && <AnalysisView />}
          {view === "editor" && <LogEditorView />}
          {view === "report" && <ReportStudioView />}
        </main>
        <StatusBar />
      </div>
      <ModalHost />
      <GlobalDrop />
      <Tour />
      <Toaster />
    </div>
  );
}
