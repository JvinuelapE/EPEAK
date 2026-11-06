import {
  type ReactNode, type CSSProperties, type KeyboardEvent as RKeyboardEvent,
  createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { LuCheck, LuChevronDown, LuX, LuSearch, LuCircleAlert, LuCircleCheck, LuInfo } from "react-icons/lu";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ------------------------------------------------------------------ buttons
type BtnVariant = "primary" | "default" | "ghost" | "danger" | "subtle";
export function Button({
  children, variant = "default", size = "md", icon, className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md"; icon?: ReactNode }) {
  return (
    <button type="button" className={cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", className)} {...rest}>
      {icon}
      {children !== undefined && children !== null && <span>{children}</span>}
    </button>
  );
}

export function IconButton({
  label, children, active, className, variant = "ghost", ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; variant?: "ghost" | "default" | "danger" }) {
  return (
    <button type="button" aria-label={label} title={label}
      className={cx("icon-btn", variant !== "ghost" && `icon-btn-${variant}`, active && "is-active", className)} {...rest}>
      {children}
    </button>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="Loading" />;
}

// ------------------------------------------------------------------ fields
export function Field({ label, hint, children, className, inline }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; inline?: boolean }) {
  return (
    <label className={cx("field", inline && "field-inline", className)}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** Text input that only reports its value on blur / Enter (for edits that trigger recomputation). */
export function CommitInput({
  value, onCommit, className, placeholder, type = "text", ...rest
}: { value: string | number | null | undefined; onCommit: (v: string) => void; className?: string; placeholder?: string; type?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [value]);
  const commit = () => {
    if (String(v) !== String(value ?? "")) onCommit(String(v));
  };
  return (
    <input className={cx("input", className)} type={type} value={v} placeholder={placeholder}
      onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Escape") setV(value ?? "");
      }} {...rest} />
  );
}

export function NumberInput({ value, onCommit, step = 1, min, className, placeholder }: {
  value: number | null | undefined; onCommit: (v: number) => void; step?: number; min?: number; className?: string; placeholder?: string;
}) {
  return (
    <CommitInput type="number" className={cx("input-num", className)} value={value ?? ""} step={step} min={min} placeholder={placeholder}
      onCommit={(s) => {
        const n = Number(s);
        onCommit(Number.isFinite(n) ? (min !== undefined ? Math.max(min, n) : n) : (min ?? 0));
      }} />
  );
}

export function TextArea({ value, onChange, placeholder, rows = 2, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 320)}px`;
  }, [value]);
  return <textarea ref={ref} className={cx("input textarea", className)} rows={rows} value={value} placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)} />;
}

export function Toggle({ checked, onChange, label, title }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; title?: string }) {
  return (
    <label className="toggle" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
}

export function Checkbox({ checked, onChange, label, indeterminate }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <label className="checkbox">
      <input ref={ref} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size }: {
  value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; size?: "sm";
}) {
  return (
    <div className={cx("segmented", size === "sm" && "segmented-sm")} role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} title={o.title}
          className={cx(o.value === value && "is-on")} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ floating layer
export function useFloating(open: boolean, anchor: React.RefObject<HTMLElement | null>, opts: { minWidth?: number; align?: "start" | "end"; offset?: number } = {}) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const vh = window.innerHeight;
      const below = vh - a.bottom;
      const width = Math.max(a.width, opts.minWidth ?? 0);
      const maxH = Math.max(160, Math.min(380, below > 240 ? below - 16 : a.top - 16));
      const top = below > 240 || below > a.top ? a.bottom + (opts.offset ?? 4) : undefined;
      const bottom = top === undefined ? vh - a.top + (opts.offset ?? 4) : undefined;
      let left = opts.align === "end" ? a.right - width : a.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      setStyle({ position: "fixed", top, bottom, left, width, maxHeight: maxH, zIndex: 1000 });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor, opts.minWidth, opts.align, opts.offset]);
  return style;
}

function useOutside(open: boolean, refs: React.RefObject<HTMLElement | null>[], onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      if (refs.some((r) => r.current?.contains(e.target as Node))) return;
      onClose();
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", h, true);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("pointerdown", h, true);
      document.removeEventListener("keydown", k);
    };
  }, [open, onClose, refs]);
}

// ------------------------------------------------------------------ combobox (single & multi)
export interface Option {
  value: string;
  label?: string;
  group?: string;
  hint?: string;
  disabled?: boolean;
}

interface ComboBase {
  options: Option[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
  dense?: boolean;
  "data-tour"?: string;
  title?: string;
}
type ComboProps =
  | (ComboBase & { multi?: false; value: string | null | undefined; onChange: (v: string | null) => void })
  | (ComboBase & { multi: true; value: string[]; onChange: (v: string[]) => void });

export function Combo(props: ComboProps) {
  const { options, placeholder, className, disabled, dense } = props;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const style = useFloating(open, anchor, { minWidth: 240 });
  const close = useMemo(() => () => { setOpen(false); setQ(""); }, []);
  const refs = useMemo(() => [anchor, panel], []);
  useOutside(open, refs, close);

  const selected = props.multi ? props.value ?? [] : props.value ? [props.value] : [];
  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => (o.label ?? o.value).toLowerCase().includes(s) || o.group?.toLowerCase().includes(s)) : options;
  }, [q, options]);
  useEffect(() => setHi(0), [q, open]);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 0);
  }, [open]);
  useEffect(() => {
    panel.current?.querySelector(".combo-opt.is-hi")?.scrollIntoView({ block: "nearest" });
  }, [hi]);

  const pick = (v: string) => {
    if (props.multi) {
      const cur = props.value ?? [];
      props.onChange(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
      setQ("");
    } else {
      props.onChange(v);
      close();
    }
  };
  const onKey = (e: RKeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const o = filtered[hi]; if (o && !o.disabled) pick(o.value); }
    else if (e.key === "Backspace" && !q && props.multi && props.value?.length) props.onChange(props.value.slice(0, -1));
  };

  let lastGroup: string | undefined;
  return (
    <div ref={anchor} className={cx("combo", open && "is-open", disabled && "is-disabled", dense && "combo-dense", className)}
      data-tour={props["data-tour"]} title={props.title}>
      <div className="combo-control" role="combobox" aria-expanded={open} tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => { if (!open && (e.key === "Enter" || e.key === "ArrowDown" || e.key === " ")) { e.preventDefault(); setOpen(true); } }}>
        {selected.length === 0 && <span className="combo-placeholder">{placeholder ?? "Select…"}</span>}
        {props.multi
          ? <span className="combo-chips">
            {selected.map((v) => (
              <span key={v} className="chip">
                <span className="chip-text">{byValue.get(v)?.label ?? v}</span>
                <span className="chip-x" role="button" aria-label={`Remove ${v}`}
                  onClick={(e) => { e.stopPropagation(); pick(v); }}><LuX size={11} /></span>
              </span>
            ))}
          </span>
          : selected[0] && <span className="combo-value">{byValue.get(selected[0])?.label ?? selected[0]}</span>}
        {props.clearable !== false && !props.multi && selected.length > 0 && !disabled && (
          <span className="combo-clear" role="button" aria-label="Clear" onClick={(e) => { e.stopPropagation(); props.onChange(null); }}><LuX size={12} /></span>
        )}
        <span className="combo-caret"><LuChevronDown size={14} /></span>
      </div>
      {open && createPortal(
        <div ref={panel} className="combo-panel" style={style} onKeyDown={onKey}>
          {options.length > 6 && (
            <div className="combo-search">
              <LuSearch size={13} />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" onKeyDown={onKey} />
            </div>
          )}
          {options.length <= 6 && <input ref={input} className="sr-only" onKeyDown={onKey} aria-label="Options" />}
          <div className="combo-list" role="listbox" aria-multiselectable={!!props.multi}>
            {filtered.length === 0 && <div className="combo-empty">{options.length ? "No matches" : "Nothing to choose from yet"}</div>}
            {filtered.map((o, i) => {
              const head = o.group !== lastGroup ? o.group : undefined;
              lastGroup = o.group;
              const sel = selected.includes(o.value);
              return (
                <div key={o.value}>
                  {head && <div className="combo-group">{head}</div>}
                  <div role="option" aria-selected={sel} aria-disabled={o.disabled}
                    className={cx("combo-opt", sel && "is-sel", i === hi && "is-hi", o.disabled && "is-disabled")}
                    onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()}
                    onClick={() => !o.disabled && pick(o.value)}>
                    <span className="combo-check">{sel && <LuCheck size={13} />}</span>
                    <span className="combo-label">{o.label ?? o.value}</span>
                    {o.hint && <span className="combo-hint">{o.hint}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {props.multi && selected.length > 0 && (
            <div className="combo-foot">
              <span>{selected.length} selected</span>
              <button type="button" className="link" onClick={() => props.onChange([])}>Clear</button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ------------------------------------------------------------------ popover / menu
export function Popover({ trigger, children, align = "start", width = 260, open: openProp, onOpenChange, className }: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end"; width?: number; open?: boolean; onOpenChange?: (o: boolean) => void; className?: string;
}) {
  const [own, setOwn] = useState(false);
  const open = openProp ?? own;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setOwn(o));
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const style = useFloating(open, anchor, { minWidth: width, align });
  const close = useMemo(() => () => setOpen(false), [onOpenChange]); // eslint-disable-line
  const refs = useMemo(() => [anchor, panel], []);
  useOutside(open, refs, close);
  return (
    <>
      <span ref={anchor} className="popover-anchor">{trigger({ open, toggle: () => setOpen(!open) })}</span>
      {open && createPortal(
        <div ref={panel} className={cx("popover", className)} style={{ ...style, width, maxHeight: undefined }}>
          {typeof children === "function" ? children(close) : children}
        </div>, document.body)}
    </>
  );
}

export interface MenuItem {
  label?: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  header?: string;
  checked?: boolean;
  keepOpen?: boolean;
}
export function Menu({ trigger, items, align = "start", width = 240 }: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; items: MenuItem[]; align?: "start" | "end"; width?: number;
}) {
  return (
    <Popover trigger={trigger} align={align} width={width} className="menu">
      {(close) => (
        <div role="menu">
          {items.map((it, i) => {
            if (it.separator) return <div key={i} className="menu-sep" />;
            if (it.header) return <div key={i} className="menu-header">{it.header}</div>;
            return (
              <button key={i} role="menuitem" type="button" disabled={it.disabled}
                className={cx("menu-item", it.danger && "is-danger")}
                onClick={() => { if (!it.keepOpen) close(); it.onSelect?.(); }}>
                <span className="menu-icon">{it.checked !== undefined ? (it.checked ? <LuCheck size={14} /> : null) : it.icon}</span>
                <span className="menu-label">{it.label}</span>
                {it.shortcut && <kbd>{it.shortcut}</kbd>}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

// ------------------------------------------------------------------ modal / drawer
export function Modal({ title, onClose, children, footer, width = 560, className, subtitle }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number; className?: string; subtitle?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".combo-panel, .popover")) onClose();
    };
    document.addEventListener("keydown", k);
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>("[data-autofocus], input:not([type=checkbox]):not([type=color]), textarea");
      (el ?? ref.current)?.focus();
    }, 20);
    return () => {
      document.removeEventListener("keydown", k);
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={cx("modal", className)} style={{ width }} role="dialog" aria-modal="true" tabIndex={-1}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="modal-sub">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}><LuX size={16} /></IconButton>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ title, onClose, children, width = 440, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: number; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".combo-panel, .popover, .modal") && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" style={{ width }} role="dialog" aria-modal="true">
        <header className="modal-head">
          <h2>{title}</h2>
          <IconButton label="Close" onClick={onClose}><LuX size={16} /></IconButton>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Callout({ kind = "info", children }: { kind?: "info" | "error" | "warn"; children: ReactNode }) {
  const Icon = kind === "error" ? LuCircleAlert : kind === "warn" ? LuCircleAlert : LuInfo;
  return <div className={cx("callout", `callout-${kind}`)}><Icon size={15} /><div>{children}</div></div>;
}

// ------------------------------------------------------------------ toasts
type Toast = { id: number; kind: "ok" | "error" | "info"; text: ReactNode };
let toasts: Toast[] = [];
const toastSubs = new Set<() => void>();
let toastId = 0;
export function toast(text: ReactNode, kind: Toast["kind"] = "ok", ms = 3200) {
  const id = ++toastId;
  toasts = [...toasts.slice(-3), { id, kind, text }];
  toastSubs.forEach((f) => f());
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    toastSubs.forEach((f) => f());
  }, kind === "error" ? Math.max(ms, 6000) : ms);
}
export const toastError = (e: unknown) => toast((e as Error)?.message ?? String(e), "error");
export function Toaster() {
  const list = useSyncExternalStore((f) => { toastSubs.add(f); return () => toastSubs.delete(f); }, () => toasts);
  return createPortal(
    <div className="toaster" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={cx("toast", `toast-${t.kind}`)}>
          {t.kind === "error" ? <LuCircleAlert size={16} /> : t.kind === "ok" ? <LuCircleCheck size={16} /> : <LuInfo size={16} />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ misc
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const DragCtx = createContext<{ dragging: string | null; setDragging: (s: string | null) => void }>({ dragging: null, setDragging: () => undefined });
export const useDragCtx = () => useContext(DragCtx);
export function DragProvider({ children }: { children: ReactNode }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const v = useMemo(() => ({ dragging, setDragging }), [dragging]);
  return <DragCtx.Provider value={v}>{children}</DragCtx.Provider>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
