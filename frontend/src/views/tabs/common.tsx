import type { ReactNode } from "react";
import { LuPanelLeftClose, LuPanelLeftOpen, LuRotateCcw } from "react-icons/lu";
import { Button, Callout, IconButton, NumberInput, Spinner, cx } from "../../components/ui";
import { setSetupOpen, updateTab, useApp } from "../../store";
import type { Tab } from "../../types";
import { plural } from "../../util";

/** Two-column tool layout: a collapsible setup panel on the left, results on the right. */
export function ToolLayout({ setup, children, title }: { setup: ReactNode; children: ReactNode; title?: ReactNode }) {
  const open = useApp((s) => s.setupOpen);
  return (
    <div className={cx("tool", !open && "setup-closed")}>
      <aside className="tool-setup" data-tour="setup">
        <div className="tool-setup-head">
          <span className="tool-setup-title">{title ?? "Setup"}</span>
          <IconButton label="Hide setup panel" onClick={() => setSetupOpen(false)}><LuPanelLeftClose size={16} /></IconButton>
        </div>
        <div className="tool-setup-body">{setup}</div>
      </aside>
      {!open && (
        <IconButton className="setup-reopen" label="Show setup panel" onClick={() => setSetupOpen(true)}>
          <LuPanelLeftOpen size={16} />
        </IconButton>
      )}
      <section className="tool-main">{children}</section>
    </div>
  );
}

export function SetupSection({ title, children, aside }: { title?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="setup-sec">
      {(title || aside) && <div className="setup-sec-head"><span>{title}</span>{aside}</div>}
      {children}
    </div>
  );
}

export function SkipField({ tab }: { tab: Tab & { skip: number } }) {
  return (
    <label className="field">
      <span className="field-label">Use every Nth row</span>
      <NumberInput value={tab.skip} min={1} onCommit={(v) => updateTab(tab.id, () => ({ skip: Math.max(1, Math.round(v)) }) as never)} />
      <span className="field-hint">1 keeps every row. Plots are decimated for display automatically, so this is only needed to thin the data itself.</span>
    </label>
  );
}

export function ExcludedNote({ tab }: { tab: Tab & { excluded: number[]; legacyValid?: number[] | null } }) {
  const n = tab.excluded.length;
  if (!n && !tab.legacyValid) return null;
  return (
    <div className="excluded-note">
      <span>{n ? `${plural(n, "point")} removed` : "Point selection from the old workspace applied"}</span>
      <Button size="sm" variant="ghost" icon={<LuRotateCcw size={13} />}
        onClick={() => updateTab(tab.id, () => ({ excluded: [], legacyValid: null }) as never)}>Restore all</Button>
    </div>
  );
}

export function DatasetStatus({ loading, error, children }: { loading: boolean; error: string | null; children?: ReactNode }) {
  if (error) return <Callout kind="warn">{error}</Callout>;
  if (loading && !children) return <div className="center pad"><Spinner size={20} /></div>;
  return <>{children}</>;
}

export function CommentBox({ tab }: { tab: Tab }) {
  return (
    <label className="field">
      <span className="field-label">Notes</span>
      <textarea className="input textarea" rows={3} value={tab.comment} placeholder="Observations for this analysis…"
        onChange={(e) => updateTab(tab.id, () => ({ comment: e.target.value }) as never, `comment:${tab.id}`)} />
    </label>
  );
}
