import { useEffect, useRef, useState } from "react";
import { LuCopy, LuPencil, LuPlus, LuX, LuEllipsis, LuUpload } from "react-icons/lu";
import { Button, Empty, Menu, Popover, cx } from "../components/ui";
import { getState, openModal, updateWs, useApp } from "../store";
import type { Tab, TabType } from "../types";
import { moveItem } from "../util";
import { TOOLS, createTab, duplicateTab, toolMeta } from "./tabs/registry";
import { pickAndUpload } from "../shell/actions";

export function addTab(type: TabType) {
  updateWs((ws) => {
    const tab = createTab(type, ws.tabs);
    return { ...ws, tabs: [...ws.tabs, tab], activeTabId: tab.id };
  });
}

export function closeTab(id: string) {
  updateWs((ws) => {
    const idx = ws.tabs.findIndex((t) => t.id === id);
    const tabs = ws.tabs.filter((t) => t.id !== id);
    const styles = { ...ws.styles };
    delete styles[id];
    const activeTabId = ws.activeTabId === id ? tabs[Math.min(idx, tabs.length - 1)]?.id ?? null : ws.activeTabId;
    return { ...ws, tabs, styles, activeTabId, staging: ws.staging.filter((s) => s.tabId !== id) };
  });
}

export function renameTab(id: string, name: string) {
  const n = name.trim();
  if (!n) return;
  updateWs((ws) => ({ ...ws, tabs: ws.tabs.map((t) => (t.id === id ? { ...t, name: n } : t)) }));
}

export function ToolPicker({ onPick, compact }: { onPick: (t: TabType) => void; compact?: boolean }) {
  return (
    <div className={cx("tool-picker", compact && "is-compact")}>
      {(["Time-domain", "Exploration"] as const).map((g) => (
        <div key={g} className="tool-group">
          <div className="tool-group-title">{g === "Time-domain" ? "Time-domain tools" : "Data exploration"}</div>
          {TOOLS.filter((t) => t.group === g).map((t) => (
            <button key={t.type} type="button" className="tool-option" onClick={() => onPick(t.type)}>
              <span className="tool-option-icon" style={{ color: t.color }}><t.icon size={18} /></span>
              <span>
                <b>{t.label}</b>
                {!compact && <small>{t.description}</small>}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function TabChip({ tab, active, index }: { tab: Tab; active: boolean; index: number }) {
  const meta = toolMeta(tab.type);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(tab.name);
  const [over, setOver] = useState<"l" | "r" | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      setVal(tab.name);
      setTimeout(() => input.current?.select(), 0);
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    renameTab(tab.id, val);
    setEditing(false);
  };
  return (
    <div role="tab" aria-selected={active} tabIndex={0}
      className={cx("tab-chip", active && "is-active", over === "l" && "drop-l", over === "r" && "drop-r")}
      style={{ ["--tab-color" as string]: meta.color }}
      draggable={!editing}
      onDragStart={(e) => { e.dataTransfer.setData("application/x-epeak-tab", String(index)); e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("application/x-epeak-tab")) return;
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setOver(e.clientX < r.left + r.width / 2 ? "l" : "r");
      }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => {
        const from = Number(e.dataTransfer.getData("application/x-epeak-tab"));
        const side = over;
        setOver(null);
        if (Number.isNaN(from)) return;
        let to = side === "r" ? index + 1 : index;
        if (from < to) to -= 1;
        if (from !== to) updateWs((ws) => ({ ...ws, tabs: moveItem(ws.tabs, from, to) }));
      }}
      onClick={() => !active && updateWs((ws) => ({ ...ws, activeTabId: tab.id }), "active-tab")}
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "F2") setEditing(true);
        if (e.key === "Enter" && !editing) updateWs((ws) => ({ ...ws, activeTabId: tab.id }), "active-tab");
      }}
      onAuxClick={(e) => e.button === 1 && closeTab(tab.id)}
      title={`${meta.label} · double-click to rename, drag to reorder`}>
      <span className="tab-icon"><meta.icon size={14} /></span>
      {editing
        ? <input ref={input} className="tab-rename" value={val} onChange={(e) => setVal(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); e.stopPropagation(); }}
            onClick={(e) => e.stopPropagation()} />
        : <span className="tab-name">{tab.name}</span>}
      <Menu align="end" width={190} trigger={({ toggle }) => (
        <span role="button" className="tab-more" aria-label="Tab options" onClick={(e) => { e.stopPropagation(); toggle(); }}><LuEllipsis size={14} /></span>
      )} items={[
        { label: "Rename", icon: <LuPencil size={14} />, shortcut: "F2", onSelect: () => setEditing(true) },
        { label: "Duplicate", icon: <LuCopy size={14} />, onSelect: () => updateWs((ws) => {
          const copy = duplicateTab(tab, ws.tabs);
          const i = ws.tabs.findIndex((t) => t.id === tab.id);
          const tabs = ws.tabs.slice();
          tabs.splice(i + 1, 0, copy);
          const styles = ws.styles[tab.id] ? { ...ws.styles, [copy.id]: JSON.parse(JSON.stringify(ws.styles[tab.id])) } : ws.styles;
          return { ...ws, tabs, styles, activeTabId: copy.id };
        }) },
        { separator: true },
        { label: "Close tab", icon: <LuX size={14} />, danger: true, onSelect: () => closeTab(tab.id) },
      ]} />
      <span role="button" className="tab-close" aria-label={`Close ${tab.name}`} onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}><LuX size={13} /></span>
    </div>
  );
}

export function AnalysisView() {
  const tabs = useApp((s) => s.ws.tabs);
  const activeId = useApp((s) => s.ws.activeTabId);
  const hasLogs = useApp((s) => s.library.logs.length > 0);
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const Comp = active ? toolMeta(active.type).component : null;

  return (
    <div className="analysis">
      <div className="tabbar" role="tablist" data-tour="tabbar">
        <div className="tabbar-scroll">
          {tabs.map((t, i) => <TabChip key={t.id} tab={t} index={i} active={t.id === active?.id} />)}
        </div>
        <Popover width={340} align="start" trigger={({ toggle, open }) => (
          <button type="button" className={cx("tab-add", open && "is-open")} onClick={toggle} data-tour="add-tab">
            <LuPlus size={15} /> New analysis
          </button>
        )}>
          {(close) => <ToolPicker compact onPick={(t) => { addTab(t); close(); }} />}
        </Popover>
      </div>
      <div className="analysis-body">
        {active && Comp ? <Comp key={active.id} tab={active} /> : (
          <div className="analysis-empty">
            <Empty title="Start an analysis">
              {hasLogs ? "Pick a tool to begin. Each tool opens in its own tab, and you can open as many as you like."
                : "Upload your logs first (CSV from DIVA boards, the PPA power analyser, PicoLog or any other source), then pick a tool."}
            </Empty>
            {!hasLogs && <div className="center"><Button variant="primary" icon={<LuUpload size={15} />} onClick={() => pickAndUpload()}>Upload logs</Button></div>}
            <ToolPicker onPick={addTab} />
            <p className="muted small center">Have an old workspace? <button type="button" className="link" onClick={() => openModal({ kind: "workspaces" })}>Open it from File → Open workspace</button> — .pkl files from the previous version are converted automatically.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export const activeTab = () => {
  const s = getState();
  return s.ws.tabs.find((t) => t.id === s.ws.activeTabId);
};
