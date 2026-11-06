import { useMemo, useState } from "react";
import { LuDownload, LuFileSpreadsheet, LuGripVertical, LuPlus, LuTrash2, LuX, LuBookOpen, LuFolderOpen } from "react-icons/lu";
import { api } from "../api";
import { Button, Checkbox, Empty, IconButton, Segmented, Spinner, cx, toast, toastError } from "../components/ui";
import { buildExportItems, csvCapable, defaultSheet, PART_LABEL, partsFor, stagingId } from "../report";
import { getState, updateWs, useApp } from "../store";
import type { StagingItem, StagingPart } from "../types";
import { moveItem, plural } from "../util";
import { toolMeta } from "./tabs/registry";

type Pick = { part: StagingPart; tabId?: string; logId?: string; label: string };

export function ReportStudioView() {
  const tabs = useApp((s) => s.ws.tabs);
  const staging = useApp((s) => s.ws.staging);
  const logs = useApp((s) => s.library.logs);
  const wsLimits = useApp((s) => s.ws.limits);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const groups = useMemo(() => {
    const g: { key: string; title: string; icon?: React.ReactNode; color?: string; picks: Pick[] }[] = [
      { key: "hub", title: "Research hub", icon: <LuBookOpen size={15} />, picks: [{ part: "ledger", label: "Investigation ledger" }, { part: "evidence", label: "Evidence images" }] },
    ];
    tabs.forEach((t) => {
      const m = toolMeta(t.type);
      g.push({ key: t.id, title: t.name, icon: <m.icon size={15} />, color: m.color, picks: partsFor(t, wsLimits).map((p) => ({ part: p, tabId: t.id, label: PART_LABEL[p] })) });
    });
    if (logs.length) g.push({ key: "raw", title: "Raw logs", icon: <LuFolderOpen size={15} />, picks: logs.map((l) => ({ part: "raw" as const, logId: l.id, label: l.name })) });
    return g;
  }, [tabs, logs, wsLimits]);

  const staged = new Set(staging.map(stagingId));
  const toggle = (id: string, v: boolean) => setChecked((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });

  const addChecked = () => {
    const items: StagingItem[] = [];
    groups.forEach((g) => g.picks.forEach((p) => {
      const id = stagingId(p);
      if (!checked.has(id) || staged.has(id)) return;
      const tabName = tabs.find((t) => t.id === p.tabId)?.name;
      const logName = logs.find((l) => l.id === p.logId)?.name;
      items.push({ id, part: p.part, tabId: p.tabId, logId: p.logId, format: "excel", sheet: defaultSheet(p.part, tabName ?? logName?.replace(/\.csv$/i, "") ?? "Report") });
    }));
    if (!items.length) return;
    updateWs((ws) => ({ ...ws, staging: [...ws.staging, ...items] }));
    setChecked(new Set());
  };

  const setItem = (id: string, p: Partial<StagingItem>) => updateWs((ws) => ({ ...ws, staging: ws.staging.map((s) => (s.id === id ? { ...s, ...p } : s)) }), `stage:${id}`);

  const exportReport = async () => {
    setBusy("Preparing…");
    try {
      const s = getState();
      const items = await buildExportItems(s.ws, s.library, setBusy);
      setBusy("Building the workbook…");
      await api.exportReport(items);
      toast("Report exported.");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const describe = (s: StagingItem) => {
    const tab = tabs.find((t) => t.id === s.tabId);
    const log = logs.find((l) => l.id === s.logId);
    return { source: tab?.name ?? (s.part === "raw" ? log?.name ?? "Missing log" : "Research hub"), missing: (s.tabId && !tab) || (s.logId && !log) };
  };
  const csvCount = staging.filter((s) => s.format === "csv").length;

  return (
    <div className="report">
      <div className="report-head">
        <div>
          <h1>Report studio</h1>
          <p className="muted">Choose what to include, arrange it into sheets, and export one Excel workbook. Items set to CSV are bundled alongside it in a zip.</p>
        </div>
        <Button variant="primary" icon={busy ? <Spinner /> : <LuFileSpreadsheet size={16} />} disabled={!staging.length || !!busy} onClick={exportReport} data-tour="export">
          {busy ?? (csvCount ? "Export report (.zip)" : "Export report (.xlsx)")}
        </Button>
      </div>
      <div className="report-body">
        <aside className="report-pick">
          <div className="report-pick-head">
            <h3>Content</h3>
            <Button size="sm" variant="primary" icon={<LuPlus size={13} />} disabled={!checked.size} onClick={addChecked}>Add {checked.size ? checked.size : ""} to report</Button>
          </div>
          {groups.map((g) => {
            const ids = g.picks.map(stagingId).filter((id) => !staged.has(id));
            const all = ids.length > 0 && ids.every((id) => checked.has(id));
            const some = ids.some((id) => checked.has(id));
            return (
              <details key={g.key} className="pick-group" open={g.key !== "raw"}>
                <summary style={g.color ? { ["--tab-color" as string]: g.color } : undefined}>
                  <span onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={all} indeterminate={!all && some} onChange={(v) => setChecked((s) => { const n = new Set(s); ids.forEach((id) => (v ? n.add(id) : n.delete(id))); return n; })} />
                  </span>
                  <span className="pick-icon" style={{ color: g.color }}>{g.icon}</span>
                  <span className="truncate">{g.title}</span>
                </summary>
                <div className="pick-items">
                  {g.picks.map((p) => {
                    const id = stagingId(p);
                    const isStaged = staged.has(id);
                    return (
                      <div key={id} className={cx("pick-item", isStaged && "is-staged")}>
                        <Checkbox checked={isStaged || checked.has(id)} onChange={(v) => !isStaged && toggle(id, v)} label={p.label} />
                        {isStaged && <span className="muted small">in report</span>}
                      </div>
                    );
                  })}
                  {g.key === "raw" && (
                    <Button size="sm" icon={<LuDownload size={13} />} disabled={!g.picks.some((p) => checked.has(stagingId(p)))}
                      onClick={() => api.downloadLogs(g.picks.filter((p) => checked.has(stagingId(p))).map((p) => p.logId!)).catch(toastError)}>
                      Download checked as CSV
                    </Button>
                  )}
                </div>
              </details>
            );
          })}
        </aside>
        <section className="report-stage">
          <div className="stage-head"><h3>In the report</h3><span className="muted small">{plural(staging.length, "item")} · drag to reorder · items with the same sheet name share a sheet</span></div>
          {!staging.length ? <Empty title="Nothing staged yet">Tick items on the left and choose Add to report.</Empty> : (
            <div className="stage-list">
              <div className="stage-row stage-th"><span /><span>Item</span><span>Source</span><span>Sheet or file name</span><span>Format</span><span /></div>
              {staging.map((s, i) => {
                const d = describe(s);
                return (
                  <div key={s.id} className={cx("stage-row", drag === i && "is-dragging", d.missing && "is-missing")} draggable
                    onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}
                    onDragOver={(e) => { e.preventDefault(); if (drag !== null && drag !== i) { updateWs((ws) => ({ ...ws, staging: moveItem(ws.staging, drag, i) }), "stage-order"); setDrag(i); } }}>
                    <span className="muted"><LuGripVertical size={14} /></span>
                    <span>{PART_LABEL[s.part]}</span>
                    <span className="truncate muted" title={d.source}>{d.missing ? "Removed from workspace" : d.source}</span>
                    <input className="input input-sm" value={s.sheet} maxLength={s.format === "excel" ? 31 : 120} onChange={(e) => setItem(s.id, { sheet: e.target.value })} />
                    {csvCapable(s.part)
                      ? <Segmented size="sm" value={s.format} onChange={(v) => setItem(s.id, { format: v })} options={[{ value: "excel", label: "Sheet" }, { value: "csv", label: "CSV" }]} />
                      : <span className="muted small">Sheet</span>}
                    <IconButton label="Remove from report" onClick={() => updateWs((ws) => ({ ...ws, staging: ws.staging.filter((x) => x.id !== s.id) }))}><LuX size={14} /></IconButton>
                  </div>
                );
              })}
              <div className="stage-foot">
                <Button size="sm" variant="ghost" icon={<LuTrash2 size={13} />} onClick={() => updateWs((ws) => ({ ...ws, staging: [] }))}>Clear all</Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
