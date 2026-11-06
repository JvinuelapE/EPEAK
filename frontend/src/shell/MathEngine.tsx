import { useEffect, useRef, useState } from "react";
import { LuDelete, LuPlus, LuTrash2 } from "react-icons/lu";
import { api } from "../api";
import { Button, Callout, Combo, CommitInput, IconButton, Modal, toast, toastError } from "../components/ui";
import { useLog, useLogOptions } from "../hooks";
import { closeModal, setLibrary, useApp } from "../store";
import { fmtNum } from "../util";

const FUNCS = ["sin()", "cos()", "tan()", "sqrt()", "abs()", "log10()", "ln()", "exp()", "deg()", "rad()", "diff()", "mean()", "min(, )", "max(, )", "where(, , )"];
const KEYS = ["7", "8", "9", " / ", "4", "5", "6", " * ", "1", "2", "3", " - ", "0", ".", "pi", " + ", "(", ")", "**", " > "];

export function MathEngine({ logId: initial }: { logId?: string | null }) {
  const editorLog = useApp((s) => s.editorLogId);
  const [logId, setLogId] = useState<string | null>(initial ?? editorLog ?? null);
  const log = useLog(logId);
  const logOpts = useLogOptions();
  const [name, setName] = useState("");
  const [expr, setExpr] = useState("");
  const [preview, setPreview] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!logId || !expr.trim()) { setPreview(null); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api.previewMath(logId, expr, ctl.signal)
        .then((r) => setPreview({ ok: true, text: `First values ${r.sample.map((v) => fmtNum(v)).join(", ")} · range ${fmtNum(r.min)} to ${fmtNum(r.max)}${r.nan ? ` · ${r.nan.toLocaleString()} empty` : ""}` }))
        .catch((e: Error) => e.name !== "AbortError" && setPreview({ ok: false, text: e.message }));
    }, 300);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [logId, expr, log?.version]);

  const insert = (txt: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? expr.length;
    const end = el?.selectionEnd ?? expr.length;
    const next = expr.slice(0, start) + txt + expr.slice(end);
    setExpr(next);
    const caret = txt.includes("(") && txt.endsWith(")") ? start + txt.indexOf("(") + 1 : start + txt.length;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(caret, caret); });
  };

  const add = async () => {
    if (!logId) return;
    try {
      setLibrary(await api.setMath(logId, name, expr));
      toast(`Added “${name}” to ${log?.name}.`);
      setName("");
      setExpr("");
    } catch (e) {
      toastError(e);
    }
  };

  const cols = (log?.columns ?? []).filter((c) => c.numeric && (!filter || c.name.toLowerCase().includes(filter.toLowerCase())));
  const derived = Object.entries(log?.math ?? {});
  return (
    <Modal title="Math engine" onClose={closeModal} width={860} subtitle="Create derived variables from a log's columns. They behave like any other column everywhere in E-PEAK.">
      <div className="math">
        <label className="field"><span className="field-label">Log</span>
          <Combo options={logOpts} value={logId} onChange={setLogId} placeholder="Choose a log…" />
        </label>
        {log && (
          <>
            <div className="math-grid">
              <section>
                <div className="math-sec-head"><span>Columns</span><input className="input input-sm" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
                <div className="var-palette">
                  {cols.map((c) => <button key={c.name} type="button" className="var-chip" onClick={() => insert(`\`${c.name}\``)} title={`Insert \`${c.name}\``}>{c.name}</button>)}
                </div>
              </section>
              <section>
                <div className="math-sec-head"><span>Functions and operators</span></div>
                <div className="keypad-funcs">{FUNCS.map((f) => <button key={f} type="button" onClick={() => insert(f)}>{f.replace(/, ?/g, ",").replace("(,,)", "(…)")}</button>)}</div>
                <div className="keypad">{KEYS.map((k) => <button key={k} type="button" onClick={() => insert(k)}>{k.trim()}</button>)}</div>
              </section>
            </div>
            <div className="math-build">
              <input className="input" placeholder="New variable name, e.g. P_total" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="math-expr">
                <span className="eq">=</span>
                <input ref={input} className="input mono-ish" placeholder="`Watts PH1 PPA1` + `Watts PH2 PPA1`" value={expr} onChange={(e) => setExpr(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && name && expr && preview?.ok && add()} />
                <IconButton label="Clear formula" onClick={() => setExpr("")}><LuDelete size={16} /></IconButton>
              </div>
              {preview && <div className={preview.ok ? "math-preview" : "math-preview is-error"}>{preview.text}</div>}
              <Button variant="primary" icon={<LuPlus size={15} />} disabled={!name.trim() || !expr.trim() || preview?.ok === false} onClick={add}>Add variable</Button>
            </div>
            <section className="math-existing">
              <div className="math-sec-head"><span>Derived variables in {log.name}</span></div>
              {!derived.length && <p className="muted small">None yet.</p>}
              {derived.map(([v, e]) => (
                <div key={v} className="derived-row">
                  <b>{v}</b><span className="eq">=</span>
                  <CommitInput value={e} onCommit={(ne) => api.setMath(log.id, v, ne).then((l) => { setLibrary(l); toast(`Recalculated “${v}”.`); }).catch(toastError)} />
                  <IconButton label={`Delete ${v}`} variant="danger" onClick={() => api.deleteMath(log.id, v).then(setLibrary).catch(toastError)}><LuTrash2 size={15} /></IconButton>
                </div>
              ))}
              {derived.length > 0 && <p className="muted small">Edit a formula and press Enter to recalculate.</p>}
            </section>
          </>
        )}
        {!log && <Callout>Pick the log to add variables to.</Callout>}
      </div>
    </Modal>
  );
}
