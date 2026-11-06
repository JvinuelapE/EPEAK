import { useMemo, useState } from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { hasLimit } from "../analysis";
import { NullableNumber } from "../components/PlotAnalysis";
import { Button, Callout, Combo, IconButton, Modal } from "../components/ui";
import { closeModal, updateWs, useApp } from "../store";
import type { Limit, Tab } from "../types";

/** Number of plots that override (or switch off) the workspace limit of each trace. */
function overrideCount(tabs: Tab[]): number {
  let n = 0;
  for (const t of tabs) {
    if (t.type === "generic") t.plots.forEach((p) => (n += Object.keys(p.limits ?? {}).length));
    else if (t.type === "calibration" || t.type === "compare" || t.type === "append") n += Object.keys(t.limits ?? {}).length;
  }
  return n;
}

/** Workspace-wide limits: set once per variable, used wherever it is plotted and in the report. */
export function LimitsManager() {
  const limits = useApp((s) => s.ws.limits) ?? {};
  const logs = useApp((s) => s.library.logs);
  const tabs = useApp((s) => s.ws.tabs);
  const [pick, setPick] = useState<string | null>(null);
  const names = Object.keys(limits).sort((a, b) => a.localeCompare(b));
  const options = useMemo(() => {
    const seen = new Set<string>();
    logs.forEach((l) => l.columns.forEach((c) => c.numeric && seen.add(c.name)));
    return [...seen].filter((c) => !(c in limits)).sort((a, b) => a.localeCompare(b)).map((c) => ({ value: c }));
  }, [logs, limits]);
  const overrides = overrideCount(tabs);

  const set = (key: string, l: Limit | null) => updateWs((ws) => {
    const next = { ...(ws.limits ?? {}) };
    if (l === null) delete next[key];
    else next[key] = l;
    return { ...ws, limits: next };
  }, `limit:${key}`);

  return (
    <Modal title="Limits" onClose={closeModal} width={640}
      subtitle="Each limit applies to that variable in every plot of this workspace, and to the pass/fail table in the report."
      footer={<Button variant="primary" onClick={closeModal}>Done</Button>}>
      {names.length ? (
        <div className="xgrid" style={{ gridTemplateColumns: "minmax(200px, 1fr) 120px 120px 32px" }}>
          <span className="xh">Variable</span><span className="xh">Lower</span><span className="xh">Upper</span><span className="xh" />
          {names.map((k) => {
            const l = limits[k];
            return (
              <div key={k} style={{ display: "contents" }}>
                <span className="truncate" title={k}><b>{k}</b>{!hasLimit(l) && <span className="muted small"> · no values</span>}</span>
                <NullableNumber value={l.lo} placeholder="none" onCommit={(lo) => set(k, { lo, hi: l.hi })} />
                <NullableNumber value={l.hi} placeholder="none" onCommit={(hi) => set(k, { lo: l.lo, hi })} />
                <IconButton label={`Remove the limit for ${k}`} variant="danger" onClick={() => set(k, null)}><LuTrash2 size={14} /></IconButton>
              </div>
            );
          })}
        </div>
      ) : <Callout>No limits yet. Add one below, or use the shield button on any plot.</Callout>}
      <div className="xinline">
        <Combo className="grow" options={options} value={pick} onChange={setPick} placeholder="Variable to add…" />
        <Button icon={<LuPlus size={14} />} disabled={!pick} onClick={() => { if (pick) { set(pick, { lo: null, hi: null }); setPick(null); } }}>Add limit</Button>
      </div>
      <p className="muted small">
        Time-sync and calibration traces such as <code>Log2: V_RMS(V)</code> or <code>REF: V_RMS(V)</code> use the limit of <code>V_RMS(V)</code>.
        Calculated columns like <code>Error 2</code> can be given limits from the plot's Limits panel.
        {overrides > 0 && <> {overrides === 1 ? "One plot has its own limit" : `${overrides} plot limits are set`} or switched off in the plot's Limits panel; those take priority there.</>}
      </p>
    </Modal>
  );
}
