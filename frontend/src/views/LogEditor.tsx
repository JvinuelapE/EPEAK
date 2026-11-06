import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  LuArrowDownUp, LuArrowDown, LuArrowUp, LuCalculator, LuClock, LuColumns3, LuDownload, LuFilterX, LuGitMerge, LuGripVertical,
  LuListPlus, LuSave, LuTrash2, LuUndo2, LuX, LuChevronsUp, LuChevronsDown, LuFilter, LuCopyPlus,
} from "react-icons/lu";
import { api, type EditorInfo } from "../api";
import { Button, Callout, Combo, Empty, Field, IconButton, Modal, Segmented, Spinner, cx, toast, toastError } from "../components/ui";
import { columnOptions, useLog, useLogOptions } from "../hooks";
import { openModal, setLibrary, setState, useApp } from "../store";
import { fmtCell, moveItem, plural } from "../util";

const PAGE = 300;
const ROW_H = 30;
type Row = (string | number | boolean | null)[];

export function LogEditorView() {
  const logId = useApp((s) => s.editorLogId);
  const logOpts = useLogOptions();
  const log = useLog(logId);
  const [info, setInfo] = useState<EditorInfo | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" } | null>(null);
  const [selCols, setSelCols] = useState<string[]>([]);
  const [selRows, setSelRows] = useState<Set<number>>(new Set());
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState<Map<number, Row[]>>(new Map());
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState<null | "addcol" | "reorder" | "combine" | "saveas">(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [editCell, setEditCell] = useState<{ rid: number; col: string } | null>(null);
  const loading = useRef(new Set<number>());
  const scroller = useRef<HTMLDivElement>(null);
  const [opening, setOpening] = useState(false);

  // open a draft whenever the log changes (or is changed elsewhere, e.g. a new derived variable)
  const infoRef = useRef(info);
  infoRef.current = info;
  useEffect(() => {
    if (infoRef.current?.dirty && infoRef.current.logId === logId) {
      toast("This log changed elsewhere. Save or undo your edits, then reopen it to see the change.", "info", 6000);
      return;
    }
    setInfo(null);
    setFilters({});
    setSort(null);
    setSelCols([]);
    setSelRows(new Set());
    if (!logId) return;
    setOpening(true);
    api.editorOpen(logId).then(setInfo).catch(toastError).finally(() => setOpening(false));
  }, [logId, log?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const filterKey = JSON.stringify([filters, sort, info?.draftId, version]);
  const [debouncedKey, setDebouncedKey] = useState(filterKey);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKey(filterKey), 250);
    return () => clearTimeout(t);
  }, [filterKey]);

  useEffect(() => {
    setPages(new Map());
    loading.current.clear();
    if (info) load(0, true);
  }, [debouncedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback((page: number, force = false) => {
    if (!info || loading.current.has(page) || (!force && pages.has(page))) return;
    loading.current.add(page);
    api.editorRows(info.draftId, { offset: page * PAGE, limit: PAGE, filters, sort })
      .then((r) => { setTotal(r.total); setPages((p) => new Map(p).set(page, r.rows)); })
      .catch(toastError)
      .finally(() => loading.current.delete(page));
  }, [info, pages, filters, sort]);

  const head = useRef<HTMLDivElement>(null);
  const [headH, setHeadH] = useState(62);
  useEffect(() => {
    const el = head.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeadH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [info?.draftId]);
  const v = useVirtualizer({ count: total, getScrollElement: () => scroller.current, estimateSize: () => ROW_H, overscan: 24, scrollMargin: headH });
  const items = v.getVirtualItems();
  useEffect(() => {
    if (!items.length) return;
    for (let p = Math.floor(items[0].index / PAGE); p <= Math.floor(items[items.length - 1].index / PAGE); p++) load(p);
  });

  const cols = info?.columns.map((c) => c.name) ?? [];
  const numeric = useMemo(() => new Set(info?.columns.filter((c) => c.numeric).map((c) => c.name)), [info]);
  const template = `56px ${cols.map((c) => (numeric.has(c) ? "minmax(120px, 1fr)" : "minmax(170px, 1.3fr)")).join(" ")}`;
  const gridWidth = `max(${56 + cols.reduce((a, c) => a + (numeric.has(c) ? 120 : 170), 0)}px, 100%)`;
  const rowAt = (i: number) => pages.get(Math.floor(i / PAGE))?.[i % PAGE];

  const op = async (name: string, body: Record<string, unknown> = {}) => {
    if (!info) return;
    try {
      const r = await api.editorOp(info.draftId, name, body);
      setInfo(r);
      setVersion((x) => x + 1);
      if (r.message) toast(r.message, "info", 2200);
      return r;
    } catch (e) {
      toastError(e);
    }
  };
  const commit = async (name?: string) => {
    if (!info) return;
    try {
      const r = await api.editorCommit(info.draftId, name);
      setLibrary(r.library);
      setInfo(r);
      toast(r.message);
      setDialog(null);
      if (name) setState({ editorLogId: r.logId });
    } catch (e) {
      toastError(e);
    }
  };

  const activeFilters = Object.values(filters).some(Boolean);
  if (!logId) {
    return (
      <div className="editor">
        <div className="editor-top"><h1>Log editor</h1><Combo options={logOpts} value={null} placeholder="Choose a log to edit…" onChange={(id) => setState({ editorLogId: id })} /></div>
        <Empty title="Clean and reshape logs">Fix headers, delete bad rows, rename and reorder columns, combine logs and add derived variables. Changes stay in a draft until you save.</Empty>
      </div>
    );
  }
  return (
    <div className="editor">
      <div className="editor-top">
        <h1>Log editor</h1>
        <Combo className="editor-log" options={logOpts} value={logId} onChange={(id) => {
          if (info?.dirty && !confirm("Discard the unsaved edits to this log?")) return;
          setState({ editorLogId: id });
        }} />
        <span className="muted small">{info ? `${plural(info.rows, "row")} · ${plural(cols.length, "column")}` : opening ? <Spinner /> : null}{info?.dirty && <span className="dirty-pill">Unsaved edits</span>}</span>
        <span className="grow" />
        <IconButton label="Undo last edit" disabled={!info?.canUndo} onClick={() => op("undo")}><LuUndo2 size={16} /></IconButton>
        <Button icon={<LuDownload size={14} />} onClick={() => info && api.editorCsv(info.draftId).catch(toastError)}>Download CSV</Button>
        <Button icon={<LuCopyPlus size={14} />} onClick={() => setDialog("saveas")} disabled={!info}>Save as new log</Button>
        <Button variant="primary" icon={<LuSave size={14} />} disabled={!info?.dirty} onClick={() => commit()}>Save changes</Button>
      </div>
      <div className="editor-tools" data-tour="editor-tools">
        <div className="tool-cluster">
          <span className="cluster-label">Structure</span>
          <IconButton label="Add blank row at top" onClick={() => op("add_row_top")}><LuListPlus size={16} /></IconButton>
          <IconButton label="Add column" onClick={() => setDialog("addcol")}><LuColumns3 size={16} /></IconButton>
          <IconButton label="First row → header" onClick={() => op("promote_header")}><LuChevronsUp size={16} /></IconButton>
          <IconButton label="Header → first row" onClick={() => op("demote_header")}><LuChevronsDown size={16} /></IconButton>
          <IconButton label="Reorder columns" onClick={() => setDialog("reorder")}><LuArrowDownUp size={16} /></IconButton>
        </div>
        <div className="tool-cluster">
          <span className="cluster-label">Clean</span>
          <IconButton label={selCols.length === 1 ? `Format “${selCols[0]}” as date/time` : "Format time (select one column)"} disabled={selCols.length !== 1}
            onClick={() => op("format_time", { col: selCols[0] })}><LuClock size={16} /></IconButton>
          <IconButton label={selCols.length ? `Delete ${plural(selCols.length, "selected column")}` : "Delete columns (select them first)"} variant="danger" disabled={!selCols.length}
            onClick={() => op("delete_cols", { cols: selCols }).then(() => setSelCols([]))}><LuTrash2 size={16} /></IconButton>
          <IconButton label="Delete all rows matching the filters" variant="danger" disabled={!activeFilters}
            onClick={() => confirm(`Delete all ${total.toLocaleString()} rows that match the current filters?`) && op("delete_filtered", { filters })}><LuFilter size={16} /></IconButton>
          <IconButton label="Clear filters" disabled={!activeFilters && !sort} onClick={() => { setFilters({}); setSort(null); }}><LuFilterX size={16} /></IconButton>
        </div>
        <div className="tool-cluster">
          <span className="cluster-label">Combine &amp; derive</span>
          <IconButton label="Math engine (derived variables)" onClick={() => openModal({ kind: "math", logId })}><LuCalculator size={16} /></IconButton>
          <IconButton label="Combine with another log" onClick={() => setDialog("combine")}><LuGitMerge size={16} /></IconButton>
        </div>
        {selRows.size > 0 && (
          <Button size="sm" variant="danger" icon={<LuTrash2 size={13} />} onClick={() => op("delete_rows", { rids: [...selRows] }).then(() => setSelRows(new Set()))}>
            Delete {plural(selRows.size, "row")}
          </Button>
        )}
        <span className="grow" />
        <span className="muted small">{activeFilters ? `${total.toLocaleString()} rows match` : "Filter syntax: > 230, <= 10, != 4, contains fault, datestartswith 2026-10-02"}</span>
      </div>

      <div className="egrid" tabIndex={0} onKeyDown={(e) => {
        if ((e.key === "Delete" || e.key === "Backspace") && selRows.size && !editCell && !renaming) op("delete_rows", { rids: [...selRows] }).then(() => setSelRows(new Set()));
      }}>
        <div ref={scroller} className="egrid-scroll">
          <div ref={head} className="egrid-sticky" style={{ width: gridWidth }}>
        <div className="egrid-head" style={{ gridTemplateColumns: template }}>
              <span className="egrid-corner" />
              {cols.map((c) => {
                const sel = selCols.includes(c);
                return (
                  <div key={c} className={cx("egrid-th", sel && "is-sel")}>
                    {renaming === c ? (
                      <input className="input input-sm" autoFocus defaultValue={c}
                        onBlur={(e) => { const n = e.target.value.trim(); setRenaming(null); if (n && n !== c) op("rename_col", { col: c, name: n }); }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }} />
                    ) : (
                      <button type="button" className="th-name" title="Click to select · double-click to rename"
                        onClick={(e) => setSelCols((s) => (e.ctrlKey || e.metaKey || e.shiftKey ? (sel ? s.filter((x) => x !== c) : [...s, c]) : sel && s.length === 1 ? [] : [c]))}
                        onDoubleClick={() => setRenaming(c)}>
                        {c}{log?.math[c] && <span className="badge">f(x)</span>}
                      </button>
                    )}
                    <button type="button" className={cx("th-sort", sort?.col === c && "is-on")} aria-label={`Sort by ${c}`}
                      onClick={() => setSort((s) => (s?.col !== c ? { col: c, dir: "asc" } : s.dir === "asc" ? { col: c, dir: "desc" } : null))}>
                      {sort?.col === c ? (sort.dir === "asc" ? <LuArrowUp size={12} /> : <LuArrowDown size={12} />) : <LuArrowDownUp size={12} />}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="egrid-filters" style={{ gridTemplateColumns: template }}>
              <span />
              {cols.map((c) => (
                <input key={c} className={cx("input input-sm", filters[c] && "is-active")} placeholder="filter" value={filters[c] ?? ""}
                  onChange={(e) => setFilters((f) => ({ ...f, [c]: e.target.value }))} />
              ))}
            </div>
          </div>
          {!info && <div className="center pad"><Spinner size={20} /></div>}
          <div style={{ height: v.getTotalSize(), position: "relative", width: gridWidth }}>
            {items.map((it) => {
              const r = rowAt(it.index);
              const rid = r?.[0] as number | undefined;
              return (
                <div key={it.key} className={cx("egrid-row", rid !== undefined && selRows.has(rid) && "is-sel", it.index % 2 === 1 && "is-odd")}
                  style={{ transform: `translateY(${it.start - headH}px)`, gridTemplateColumns: template }}>
                  <span className="egrid-rh" onClick={(e) => rid !== undefined && setSelRows((s) => {
                    const n = new Set(e.ctrlKey || e.metaKey || e.shiftKey ? s : []);
                    if (n.has(rid)) n.delete(rid); else n.add(rid);
                    return n;
                  })} title="Select row">
                    <span className="rh-num">{it.index + 1}</span>
                    {rid !== undefined && <button type="button" className="row-del" aria-label="Delete row" onClick={(e) => { e.stopPropagation(); op("delete_rows", { rids: [rid] }); }}><LuX size={11} /></button>}
                  </span>
                  {r ? cols.map((c, j) => {
                    const val = r[j + 1];
                    const editing = editCell?.rid === rid && editCell?.col === c;
                    return (
                      <span key={c} className={cx("egrid-td", typeof val === "number" && "num", selCols.includes(c) && "is-colsel")}
                        onDoubleClick={() => rid !== undefined && setEditCell({ rid, col: c })}>
                        {editing ? (
                          <input className="cell-input" autoFocus defaultValue={fmtCell(val)}
                            onBlur={(e) => { setEditCell(null); if (e.target.value !== fmtCell(val)) op("set_cell", { rid, col: c, value: e.target.value }); }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditCell(null); }} />
                        ) : fmtCell(val)}
                      </span>
                    );
                  }) : <span className="muted">…</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="muted small editor-help">Double-click a header to rename it and a cell to edit it. Click headers to select columns (Ctrl for several). Click row numbers to select rows, then press Delete.</p>

      {dialog === "addcol" && <AddColumn onClose={() => setDialog(null)} onAdd={(name, value) => op("add_col", { name, value }).then((r) => r && setDialog(null))} />}
      {dialog === "reorder" && <ReorderColumns cols={cols} onClose={() => setDialog(null)} onApply={(order) => op("reorder_cols", { order }).then(() => setDialog(null))} />}
      {dialog === "combine" && info && <CombineLogs cols={cols} currentId={logId} onClose={() => setDialog(null)} onApply={(b) => op("combine", b).then((r) => r && setDialog(null))} />}
      {dialog === "saveas" && <SaveAsLog base={log?.name ?? "log"} onClose={() => setDialog(null)} onSave={(n) => commit(n)} />}
    </div>
  );
}

function AddColumn({ onClose, onAdd }: { onClose: () => void; onAdd: (n: string, v: string) => void }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  return (
    <Modal title="Add column" onClose={onClose} width={420}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={() => onAdd(name, value)}>Add column</Button></>}>
      <Field label="Column name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Status" data-autofocus /></Field>
      <Field label="Value for every row" hint="Leave empty for blank cells. Numbers are stored as numbers.">
        <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 0 or Active" onKeyDown={(e) => e.key === "Enter" && name.trim() && onAdd(name, value)} />
      </Field>
    </Modal>
  );
}

function ReorderColumns({ cols, onClose, onApply }: { cols: string[]; onClose: () => void; onApply: (o: string[]) => void }) {
  const [order, setOrder] = useState(cols);
  const [drag, setDrag] = useState<number | null>(null);
  return (
    <Modal title="Reorder columns" subtitle="Drag columns into the order you want." onClose={onClose} width={420}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onApply(order)}>Apply order</Button></>}>
      <div className="reorder-list">
        {order.map((c, i) => (
          <div key={c} className={cx("reorder-item", drag === i && "is-dragging")} draggable
            onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}
            onDragOver={(e) => { e.preventDefault(); if (drag !== null && drag !== i) { setOrder((o) => moveItem(o, drag, i)); setDrag(i); } }}>
            <LuGripVertical size={14} /><span className="truncate">{c}</span>
            <span className="grow" />
            <IconButton label="Move up" disabled={i === 0} onClick={() => setOrder((o) => moveItem(o, i, i - 1))}><LuArrowUp size={14} /></IconButton>
            <IconButton label="Move down" disabled={i === order.length - 1} onClick={() => setOrder((o) => moveItem(o, i, i + 1))}><LuArrowDown size={14} /></IconButton>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function CombineLogs({ cols, currentId, onClose, onApply }: { cols: string[]; currentId: string; onClose: () => void; onApply: (b: Record<string, unknown>) => void }) {
  const logOpts = useLogOptions().filter((o) => o.value !== currentId);
  const [target, setTarget] = useState<string | null>(null);
  const [method, setMethod] = useState<"append" | "merge">("append");
  const [keyC, setKeyC] = useState<string | null>(cols.find((c) => /time/i.test(c)) ?? null);
  const [keyT, setKeyT] = useState<string | null>(null);
  const [tol, setTol] = useState(1);
  const tlog = useLog(target);
  const ok = target && (method === "append" || (keyC && keyT));
  return (
    <Modal title="Combine logs" onClose={onClose} width={520}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!ok}
        onClick={() => onApply({ targetId: target, method, keyCurrent: keyC, keyTarget: keyT, tolerance: tol })}>Combine</Button></>}>
      <Field label="Log to combine with"><Combo options={logOpts} value={target} onChange={(v) => { setTarget(v); setKeyT(null); }} /></Field>
      <Segmented value={method} onChange={setMethod} options={[{ value: "append", label: "Append rows (stack)" }, { value: "merge", label: "Merge columns (by time)" }]} />
      {method === "merge" && (
        <>
          <div className="two-col">
            <Field label="Time key in this log"><Combo options={cols.map((c) => ({ value: c }))} value={keyC} onChange={setKeyC} /></Field>
            <Field label="Time key in the other log"><Combo options={columnOptions(tlog)} value={keyT} onChange={setKeyT} disabled={!tlog} /></Field>
          </div>
          <Field label="Match tolerance (s)" hint="Rows are matched to the nearest timestamp within this tolerance."><input className="input input-num" type="number" step={0.1} value={tol} onChange={(e) => setTol(Number(e.target.value))} /></Field>
        </>
      )}
      <Callout>The result replaces this draft. Undo is available, and nothing is saved until you choose Save changes or Save as new log.</Callout>
    </Modal>
  );
}

function SaveAsLog({ base, onClose, onSave }: { base: string; onClose: () => void; onSave: (n: string) => void }) {
  const [name, setName] = useState(base.replace(/(\.csv)?$/i, "_edited.csv"));
  return (
    <Modal title="Save as new log" onClose={onClose} width={420}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={() => onSave(name.trim())}>Save</Button></>}>
      <Field label="New log name" hint="The original log is left unchanged."><input className="input" value={name} onChange={(e) => setName(e.target.value)} data-autofocus onKeyDown={(e) => e.key === "Enter" && onSave(name.trim())} /></Field>
    </Modal>
  );
}
