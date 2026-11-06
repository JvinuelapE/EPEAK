import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { LuTrash2, LuX } from "react-icons/lu";
import { api } from "../api";
import type { Range } from "../types";
import { fmtCell, plural } from "../util";
import { Button, Spinner, cx } from "./ui";

const PAGE = 200;
const ROW_H = 28;
const HEAD_H = 30;

/** Server-paged, virtualised table of the points inside the current viewport. */
export function DataTable({ dsId, cols, range, onExclude, height = 320 }: {
  dsId: string; cols: string[]; range: Range; onExclude?: (rids: number[]) => void; height?: number;
}) {
  const [total, setTotal] = useState<number | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [pages, setPages] = useState<Map<number, (string | number | boolean | null)[][]>>(new Map());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const loading = useRef(new Set<number>());
  const scroller = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([dsId, cols, range]);

  useEffect(() => {
    setPages(new Map());
    setSelected(new Set());
    setTotal(null);
    loading.current.clear();
    scroller.current?.scrollTo({ top: 0 });
  }, [key]);

  const load = (page: number, force = false) => {
    if (loading.current.has(page) || (!force && pages.has(page))) return;
    loading.current.add(page);
    api.rows(dsId, { cols, x0: range?.[0], x1: range?.[1], offset: page * PAGE, limit: PAGE })
      .then((r) => {
        setTotal(r.total);
        setColumns(r.columns);
        setPages((p) => new Map(p).set(page, r.rows));
      })
      .catch(() => undefined)
      .finally(() => loading.current.delete(page));
  };

  useEffect(() => load(0, true), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = useVirtualizer({ count: total ?? 0, getScrollElement: () => scroller.current, estimateSize: () => ROW_H, overscan: 20, scrollMargin: HEAD_H });
  const items = v.getVirtualItems();
  useEffect(() => {
    if (!items.length) return;
    const first = Math.floor(items[0].index / PAGE);
    const last = Math.floor(items[items.length - 1].index / PAGE);
    for (let p = first; p <= last; p++) load(p);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const rowAt = (i: number) => pages.get(Math.floor(i / PAGE))?.[i % PAGE];
  const visibleCols = columns.slice(1);
  const template = useMemo(() => `36px minmax(170px, 1.4fr) ${visibleCols.slice(1).map(() => "minmax(120px, 1fr)").join(" ")}`, [visibleCols]);
  const gridWidth = `max(${36 + 170 + (visibleCols.length - 1) * 120}px, 100%)`;

  const click = (i: number, rid: number, e: React.MouseEvent) => {
    setSelected((cur) => {
      const next = new Set(e.metaKey || e.ctrlKey ? cur : []);
      if (e.shiftKey && anchor !== null) {
        const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
        for (let k = a; k <= b; k++) {
          const r = rowAt(k);
          if (r) next.add(r[0] as number);
        }
      } else if (cur.has(rid) && (e.metaKey || e.ctrlKey)) next.delete(rid);
      else next.add(rid);
      return next;
    });
    if (!e.shiftKey) setAnchor(i);
  };

  const removeSelected = () => {
    if (!selected.size) return;
    onExclude?.([...selected]);
    setSelected(new Set());
  };

  return (
    <div className="dtable" onKeyDown={(e) => (e.key === "Delete" || e.key === "Backspace") && removeSelected()} tabIndex={0}>
      <div className="dtable-bar">
        <span className="muted">{total === null ? <Spinner size={12} /> : `${plural(total, "point")} in view`}</span>
        {onExclude && selected.size > 0 && (
          <Button size="sm" variant="danger" icon={<LuTrash2 size={13} />} onClick={removeSelected}>
            Remove {plural(selected.size, "point")}
          </Button>
        )}
        {onExclude && !selected.size && <span className="muted small">Click rows to select (Shift for a range), then press Delete to remove points.</span>}
      </div>
      <div ref={scroller} className="dtable-scroll" style={{ height }}>
        <div className="dtable-head" style={{ gridTemplateColumns: template, width: gridWidth, height: HEAD_H }}>
          <span />
          {visibleCols.map((c) => <span key={c} title={c}>{c}</span>)}
        </div>
        <div style={{ height: v.getTotalSize(), position: "relative", width: gridWidth }}>
          {items.map((it) => {
            const r = rowAt(it.index);
            const rid = r?.[0] as number | undefined;
            return (
              <div key={it.key} className={cx("dtable-row", rid !== undefined && selected.has(rid) && "is-sel", it.index % 2 === 1 && "is-odd")}
                style={{ transform: `translateY(${it.start - HEAD_H}px)`, gridTemplateColumns: template }}
                onClick={(e) => rid !== undefined && click(it.index, rid, e)}>
                <span className="dtable-x">
                  {onExclude && rid !== undefined && (
                    <button type="button" className="row-del" aria-label="Remove this point"
                      onClick={(e) => { e.stopPropagation(); onExclude([rid]); }}><LuX size={12} /></button>
                  )}
                </span>
                {r ? r.slice(1).map((c, j) => <span key={j} className={typeof c === "number" ? "num" : undefined}>{fmtCell(c)}</span>)
                  : <span className="muted">…</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
