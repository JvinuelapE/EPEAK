import { useEffect, useRef, useState } from "react";
import { LuChevronLeft, LuChevronRight, LuImagePlus, LuMapPin, LuPlus, LuTrash2, LuX, LuMaximize2 } from "react-icons/lu";
import { createPortal } from "react-dom";
import { api, evidenceUrl } from "../api";
import { Button, Empty, IconButton, Modal, Segmented, TextArea, cx } from "../components/ui";
import { updateWs, useApp } from "../store";
import type { Evidence, LedgerRow, LedgerStatus } from "../types";
import { today, uid } from "../util";
import { addEvidence, pickEvidence } from "../shell/actions";

const STATUS: { value: LedgerStatus; label: string }[] = [
  { value: "testing", label: "Testing" }, { value: "validated", label: "Validated" }, { value: "rejected", label: "Rejected" },
];

const setRow = (id: string, p: Partial<LedgerRow>, field: string) =>
  updateWs((ws) => ({ ...ws, ledger: ws.ledger.map((r) => (r.id === id ? { ...r, ...p } : r)) }), `ledger:${id}:${field}`);

function Ledger() {
  const rows = useApp((s) => s.ws.ledger);
  const add = () => updateWs((ws) => ({ ...ws, ledger: [...ws.ledger, { id: uid(), date: today(), logRef: "", hypothesis: "", status: "testing", conclusion: "" }] }));
  const counts = STATUS.map((s) => ({ ...s, n: rows.filter((r) => r.status === s.value).length }));
  return (
    <section className="hub-section" data-tour="ledger">
      <header className="hub-head">
        <div>
          <h2>Investigation ledger</h2>
          <p className="muted">One row per hypothesis: what you tested, against which logs, and what you concluded.</p>
        </div>
        <div className="ledger-counts">{counts.map((c) => <span key={c.value} className={`status-dot s-${c.value}`}>{c.n} {c.label.toLowerCase()}</span>)}</div>
        <Button variant="primary" icon={<LuPlus size={15} />} onClick={add}>Add entry</Button>
      </header>
      {!rows.length ? <Empty title="No entries yet">Add the first hypothesis you want to test.</Empty> : (
        <div className="ledger">
          <div className="ledger-row ledger-head"><span>Date</span><span>Logs / variables</span><span>Hypothesis or observation</span><span>Status</span><span>Conclusion</span><span /></div>
          {rows.map((r) => (
            <div key={r.id} className={`ledger-row s-${r.status}`}>
              <input className="input input-sm" type="date" value={r.date} onChange={(e) => setRow(r.id, { date: e.target.value }, "date")} />
              <TextArea rows={1} value={r.logRef} placeholder="e.g. Tests 14 & 15" onChange={(v) => setRow(r.id, { logRef: v }, "ref")} />
              <TextArea rows={1} value={r.hypothesis} placeholder="What do you expect, and why?" onChange={(v) => setRow(r.id, { hypothesis: v }, "hyp")} />
              <Segmented size="sm" value={r.status} options={STATUS} onChange={(v) => setRow(r.id, { status: v }, "status")} />
              <TextArea rows={1} value={r.conclusion} placeholder="What the data showed" onChange={(v) => setRow(r.id, { conclusion: v }, "concl")} />
              <IconButton label="Delete entry" variant="danger" onClick={() => updateWs((ws) => ({ ...ws, ledger: ws.ledger.filter((x) => x.id !== r.id) }))}><LuTrash2 size={15} /></IconButton>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const setEv = (id: string, p: Partial<Evidence>, field = "x") =>
  updateWs((ws) => ({ ...ws, evidence: ws.evidence.map((e) => (e.id === id ? { ...e, ...p } : e)) }), `ev:${id}:${field}`);

function EvidenceBoard() {
  const items = useApp((s) => s.ws.evidence);
  const [view, setView] = useState<number | null>(null);
  const [blueprint, setBlueprint] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const remove = (e: Evidence) => {
    updateWs((ws) => ({ ...ws, evidence: ws.evidence.filter((x) => x.id !== e.id) }));
    api.deleteEvidence(e.file).catch(() => undefined);
  };
  return (
    <section className={cx("hub-section", over && "is-drop")} data-tour="evidence"
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.stopPropagation(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); e.stopPropagation(); setOver(false); addEvidence(Array.from(e.dataTransfer.files)); } }}>
      <header className="hub-head">
        <div>
          <h2>Evidence &amp; schematics</h2>
          <p className="muted">Photos of the set-up, schematics and screenshots. Drop images here. Mark an image as a schematic to pin named measurement nodes on it.</p>
        </div>
        <Button icon={<LuImagePlus size={15} />} onClick={pickEvidence}>Add images</Button>
      </header>
      {!items.length ? (
        <button type="button" className="dropzone" onClick={pickEvidence}><LuImagePlus size={22} /><span>Drop images here or click to choose</span></button>
      ) : (
        <div className="evidence-grid">
          {items.map((e, i) => (
            <figure key={e.id} className="ev-card">
              <button type="button" className="ev-thumb" onClick={() => setView(i)} aria-label={`View ${e.name}`}>
                <img src={evidenceUrl(e.file)} alt={e.name} loading="lazy" />
                {e.type === "schematic" && e.nodes.length > 0 && <span className="ev-badge"><LuMapPin size={11} /> {e.nodes.length}</span>}
                <span className="ev-zoom"><LuMaximize2 size={14} /></span>
              </button>
              <figcaption>
                <input className="ev-name" value={e.name} onChange={(ev) => setEv(e.id, { name: ev.target.value }, "name")} aria-label="Image name" />
                <div className="ev-actions">
                  <Segmented size="sm" value={e.type} onChange={(v) => setEv(e.id, { type: v }, "type")}
                    options={[{ value: "image", label: "Image" }, { value: "schematic", label: "Schematic" }]} />
                  {e.type === "schematic" && <Button size="sm" icon={<LuMapPin size={13} />} onClick={() => setBlueprint(e.id)}>Nodes</Button>}
                  <IconButton label="Delete image" variant="danger" onClick={() => remove(e)}><LuTrash2 size={14} /></IconButton>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {view !== null && items[view] && <Lightbox items={items} index={view} onIndex={setView} onClose={() => setView(null)} />}
      {blueprint && <Blueprint id={blueprint} onClose={() => setBlueprint(null)} />}
    </section>
  );
}

function Lightbox({ items, index, onIndex, onClose }: { items: Evidence[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const e = items[index];
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
      if (ev.key === "ArrowRight") onIndex((index + 1) % items.length);
      if (ev.key === "ArrowLeft") onIndex((index - 1 + items.length) % items.length);
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [index, items.length, onClose, onIndex]);
  return createPortal(
    <div className="lightbox" onClick={onClose}>
      <div className="lightbox-bar" onClick={(ev) => ev.stopPropagation()}>
        <span>{e.name}</span><span className="muted">{index + 1} / {items.length}</span>
        <IconButton label="Close" onClick={onClose}><LuX size={18} /></IconButton>
      </div>
      {items.length > 1 && <button type="button" className="lb-nav lb-prev" aria-label="Previous" onClick={(ev) => { ev.stopPropagation(); onIndex((index - 1 + items.length) % items.length); }}><LuChevronLeft size={26} /></button>}
      <div className="lb-stage" onClick={(ev) => ev.stopPropagation()}>
        <img src={evidenceUrl(e.file)} alt={e.name} />
        {e.type === "schematic" && e.width && e.height && <NodeOverlay e={e} />}
      </div>
      {items.length > 1 && <button type="button" className="lb-nav lb-next" aria-label="Next" onClick={(ev) => { ev.stopPropagation(); onIndex((index + 1) % items.length); }}><LuChevronRight size={26} /></button>}
    </div>,
    document.body,
  );
}

function NodeOverlay({ e, target, onPinDown }: { e: Evidence; target?: { x: number; y: number } | null; onPinDown?: (id: string, ev: React.PointerEvent) => void }) {
  const w = e.width ?? 1000;
  const h = e.height ?? 1000;
  const r = Math.max(w, h) / 120;
  return (
    <svg className="node-overlay" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {e.nodes.map((n) => (
        <g key={n.id} transform={`translate(${n.x} ${n.y})`} className={onPinDown ? "pin is-draggable" : "pin"} onPointerDown={(ev) => onPinDown?.(n.id, ev)}>
          <circle r={r} />
          <text y={-r * 1.6} fontSize={r * 2.1} textAnchor="middle">{n.name}</text>
        </g>
      ))}
      {target && (
        <g transform={`translate(${target.x} ${target.y})`} className="pin-target">
          <circle r={r * 1.4} /><line x1={-r * 2.4} x2={r * 2.4} y1={0} y2={0} /><line y1={-r * 2.4} y2={r * 2.4} x1={0} x2={0} />
        </g>
      )}
    </svg>
  );
}

function Blueprint({ id, onClose }: { id: string; onClose: () => void }) {
  const e = useApp((s) => s.ws.evidence.find((x) => x.id === id));
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null);
  const [name, setName] = useState("");
  const stage = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(e?.width && e?.height ? { w: e.width, h: e.height } : null);
  if (!e) return null;
  const ev = dims && (!e.width || !e.height) ? { ...e, width: dims.w, height: dims.h } : e;

  const toImage = (cx: number, cy: number) => {
    const img = stage.current?.querySelector("img");
    if (!img || !ev.width || !ev.height) return null;
    const b = img.getBoundingClientRect();
    return { x: ((cx - b.left) / b.width) * ev.width, y: ((cy - b.top) / b.height) * ev.height };
  };
  const register = () => {
    if (!target || !name.trim()) return;
    setEv(e.id, { nodes: [...e.nodes, { id: uid(8), name: name.trim(), x: target.x, y: target.y }], width: ev.width, height: ev.height }, "nodes");
    setTarget(null);
    setName("");
  };
  const dragPin = (pid: string, pe: React.PointerEvent) => {
    pe.stopPropagation();
    const move = (m: PointerEvent) => {
      const p = toImage(m.clientX, m.clientY);
      if (p) updateWs((ws) => ({ ...ws, evidence: ws.evidence.map((x) => (x.id !== e.id ? x : { ...x, nodes: x.nodes.map((n) => (n.id === pid ? { ...n, ...p } : n)) })) }), `pin:${pid}`);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <Modal title="Schematic nodes" subtitle={`${e.name} — click to place a node, drag pins to move them`} onClose={onClose} width={1180} className="blueprint-modal"
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="blueprint">
        <div ref={stage} className="bp-stage" onClick={(c) => { const p = toImage(c.clientX, c.clientY); if (p) { setTarget(p); setTimeout(() => nameInput.current?.focus(), 0); } }}>
          <img src={evidenceUrl(e.file)} alt={e.name} draggable={false}
            onLoad={(i) => !e.width && setDims({ w: (i.target as HTMLImageElement).naturalWidth, h: (i.target as HTMLImageElement).naturalHeight })} />
          {ev.width && <NodeOverlay e={ev} target={target} onPinDown={dragPin} />}
        </div>
        <aside className="bp-side">
          <h4>New node</h4>
          <p className="muted small">{target ? `Placed at (${target.x.toFixed(0)}, ${target.y.toFixed(0)}). Name it:` : "Click the schematic where the measurement point is."}</p>
          <input ref={nameInput} className="input" placeholder="e.g. JB1_V" value={name} onChange={(x) => setName(x.target.value)} onKeyDown={(k) => k.key === "Enter" && register()} />
          <Button variant="primary" disabled={!target || !name.trim()} icon={<LuPlus size={14} />} onClick={register}>Add node</Button>
          <h4>Nodes ({e.nodes.length})</h4>
          <div className="bp-list">
            {e.nodes.map((n) => (
              <div key={n.id} className="bp-node">
                <LuMapPin size={13} />
                <input className="input input-sm" value={n.name} onChange={(x) => setEv(e.id, { nodes: e.nodes.map((m) => (m.id === n.id ? { ...m, name: x.target.value } : m)) }, `node:${n.id}`)} />
                <IconButton label="Delete node" variant="danger" onClick={() => setEv(e.id, { nodes: e.nodes.filter((m) => m.id !== n.id) }, "nodes")}><LuTrash2 size={14} /></IconButton>
              </div>
            ))}
            {!e.nodes.length && <p className="muted small">No nodes yet.</p>}
          </div>
        </aside>
      </div>
    </Modal>
  );
}

export function HubView() {
  const name = useApp((s) => s.wsName);
  return (
    <div className="hub">
      <div className="hub-title">
        <h1>{name === "Untitled" ? "Research hub" : name.replace(/_/g, " ")}</h1>
        <p className="muted">The record of your investigation, saved with the workspace and available to the report.</p>
      </div>
      <Ledger />
      <EvidenceBoard />
    </div>
  );
}

