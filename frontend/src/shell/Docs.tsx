// The user guide (F1): pages grouped in a side menu, a search box, and context: opened without a
// page it starts at the page about whatever is on screen (the tool in the open tab, the Log editor…).
// The pages themselves are in docs/sections.tsx; pictures and clips in docs/art.tsx.
import { Fragment, isValidElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LuChevronLeft, LuChevronRight, LuSearch, LuX } from "react-icons/lu";
import { Modal, cx } from "../components/ui";
import { closeModal, getState } from "../store";
import { CURRENT_VERSION } from "./docs/changelog";
import { GuideNav, ShowMe } from "./docs/kit";
import { GROUPS, SECTIONS, type Section } from "./docs/sections";
import "./docs/docs.css";

/** The guide page that fits what is on screen now: "plots", "tools#calibration", "editor"… */
export function contextSection(): string {
  const s = getState();
  if (s.view === "hub") return "hub";
  if (s.view === "editor") return "editor";
  if (s.view === "report") return "report";
  const tab = s.ws.tabs.find((t) => t.id === s.ws.activeTabId);
  if (!tab) return "start";
  return tab.type === "generic" ? "plots" : `tools#${tab.type}`;
}

// ------------------------------------------------------------------ search
const SKIP_PROPS = new Set(["className", "style", "to", "tour", "i", "id", "tone", "kind", "dark"]);

/** All the text in a page's JSX (strings in children and props), for searching. */
function textOf(n: unknown): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join(" ");
  if (isValidElement(n)) {
    return Object.entries(n.props as Record<string, unknown>).filter(([k]) => !SKIP_PROPS.has(k)).map(([, v]) => textOf(v)).join(" ");
  }
  if (typeof n === "object") return Object.values(n as Record<string, unknown>).map(textOf).join(" "); // data passed as props (release notes)
  return "";
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const INDEX = SECTIONS.map((s) => {
  const text = clean(textOf(s.body));
  return { s, text, hay: `${s.title} ${s.keywords ?? ""} ${text}`.toLowerCase() };
});
const terms = (q: string) => q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);

function search(q: string) {
  const words = terms(q);
  if (!words.length) return [];
  return INDEX
    .filter((e) => words.every((w) => e.hay.includes(w)))
    .map((e) => {
      const title = e.s.title.toLowerCase();
      let score = words.filter((w) => title.includes(w)).length * 20 + words.filter((w) => (e.s.keywords ?? "").includes(w)).length * 5;
      for (const w of words) score += Math.min(10, e.hay.split(w).length - 1);
      return { ...e, score };
    })
    .sort((a, b) => b.score - a.score);
}

/** A short piece of the page around the first match, with the matches marked. */
function Snippet({ text, words }: { text: string; words: string[] }) {
  const low = text.toLowerCase();
  const at = Math.min(...words.map((w) => low.indexOf(w)).filter((i) => i >= 0), text.length);
  if (at >= text.length) return null;
  const start = Math.max(0, at - 40);
  const piece = (start ? "…" : "") + text.slice(start, start + 130) + (start + 130 < text.length ? "…" : "");
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return <span className="guide-snippet">{piece.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>))}</span>;
}

/** Mark the search words on the open page (CSS Custom Highlight API; skipped where the browser lacks it). */
function useHighlight(el: React.RefObject<HTMLElement | null>, q: string, page: string, hop: number, jump: React.RefObject<boolean>) {
  useEffect(() => {
    const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    const Hl = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    if (!reg || !Hl) {
      jump.current = false;
      return;
    }
    reg.delete("guide-hit");
    const words = terms(q);
    const root = el.current;
    if (!words.length || !root) return;
    const ranges: Range[] = [];
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n && ranges.length < 400; n = walk.nextNode()) {
      const t = (n.textContent ?? "").toLowerCase();
      for (const w of words) {
        for (let i = t.indexOf(w); i >= 0; i = t.indexOf(w, i + w.length)) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + w.length);
          ranges.push(r);
        }
      }
    }
    if (ranges.length) {
      reg.set("guide-hit", new Hl(...ranges));
      if (jump.current) ranges[0].startContainer.parentElement?.scrollIntoView({ block: "center" });
    }
    jump.current = false;
    return () => { reg.delete("guide-hit"); };
  }, [q, page, hop]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ------------------------------------------------------------------ the guide
export function Docs({ section }: { section?: string }) {
  const [cur, setCur] = useState(() => section ?? contextSection());
  const [q, setQ] = useState("");
  const article = useRef<HTMLElement>(null);
  const jump = useRef(false);
  const [hop, setHop] = useState(0);
  const [pageId, anchor] = cur.split("#");
  const page: Section = SECTIONS.find((x) => x.id === pageId) ?? SECTIONS[0];
  const idx = SECTIONS.indexOf(page);
  const results = useMemo(() => search(q), [q]);
  const words = terms(q);

  const go = (to: string) => setCur(to);
  const nav = useMemo(() => ({ go }), []);

  // a new page starts at the top, or at its heading when one was asked for (F1 on a calibration tab)
  useEffect(() => {
    const el = article.current;
    if (!el) return;
    const target = anchor ? el.querySelector(`#doc-${CSS.escape(anchor)}`) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else if (!jump.current) el.scrollTop = 0;
  }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  useHighlight(article, q, cur, hop, jump);

  const navItem = (s: Section, body?: ReactNode) => (
    <button key={s.id} type="button" className={cx("guide-nav-item", s.id === page.id && "is-on")}
      onClick={() => { jump.current = !!body; setCur(s.id); setHop((h) => h + 1); }}>
      <s.icon size={15} />
      <span>{s.title}{body}</span>
    </button>
  );

  return (
    <Modal title="User guide" onClose={closeModal} width={1180} className="guide-modal">
      <GuideNav.Provider value={nav}>
        <div className="guide">
          <aside className="guide-side">
            <div className="guide-search">
              <LuSearch size={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the guide…" aria-label="Search the guide" />
              {q && <button type="button" className="guide-search-x" aria-label="Clear search" onClick={() => setQ("")}><LuX size={13} /></button>}
            </div>
            <nav className="guide-nav">
              {q ? (
                results.length
                  ? <>{<div className="guide-group">{results.length} {results.length === 1 ? "page" : "pages"}</div>}{results.map((r) => navItem(r.s, <Snippet text={r.text} words={words} />))}</>
                  : <p className="muted small guide-none">Nothing found for “{q}”. Try fewer or other words.</p>
              ) : GROUPS.map((g) => (
                <Fragment key={g}>
                  <div className="guide-group">{g}</div>
                  {SECTIONS.filter((s) => s.group === g).map((s) => navItem(s))}
                </Fragment>
              ))}
            </nav>
            <button type="button" className="guide-version" onClick={() => { setQ(""); setCur("changes"); }} title="Version history">
              E-PEAK {CURRENT_VERSION} · What's new
            </button>
          </aside>
          <article ref={article} className="guide-article">
            <header className="guide-head">
              <span className="guide-head-icon"><page.icon size={20} /></span>
              <div>
                <span className="guide-head-group">{page.group}</span>
                <h3>{page.title}</h3>
              </div>
              <span className="grow" />
              {page.tour && <ShowMe tour={page.tour} />}
            </header>
            <div className="guide-body">{page.body}</div>
            <footer className="guide-foot">
              {idx > 0 ? (
                <button type="button" className="guide-pn" onClick={() => setCur(SECTIONS[idx - 1].id)}>
                  <LuChevronLeft size={15} /><span><small>Previous</small>{SECTIONS[idx - 1].title}</span>
                </button>
              ) : <span />}
              {idx < SECTIONS.length - 1 && (
                <button type="button" className="guide-pn is-next" onClick={() => setCur(SECTIONS[idx + 1].id)}>
                  <span><small>Next</small>{SECTIONS[idx + 1].title}</span><LuChevronRight size={15} />
                </button>
              )}
            </footer>
          </article>
        </div>
      </GuideNav.Provider>
    </Modal>
  );
}
