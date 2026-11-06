"""Log Editor: edit a copy ("draft") of a log on the server, page by page.

The browser only ever receives the rows on screen, so editing a million-row log is as
quick as editing a small one. Every operation is undoable until the draft is saved.
"""
from __future__ import annotations

import re
import threading
import uuid
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .datasets import _cell
from .library import Library
from .parsing import axis_values, coerce_numeric, format_axis_array

MAX_UNDO = 25


class EditorError(ValueError):
    pass


@dataclass
class Draft:
    id: str
    log_id: str
    df: pd.DataFrame                       # always carries `_rid`
    history: list[pd.DataFrame] = field(default_factory=list)
    dirty: bool = False
    next_rid: int = 0

    def push(self) -> None:
        self.history.append(self.df.copy())
        if len(self.history) > MAX_UNDO:
            self.history.pop(0)
        self.dirty = True


FILTER_RE = re.compile(
    r"^\s*(=|eq|!=|ne|>=|ge|<=|le|>|gt|<|lt|contains|datestartswith|startswith)\s+(.+?)\s*$", re.I)
OPS = {"=": "eq", "eq": "eq", "!=": "ne", "ne": "ne", ">=": "ge", "ge": "ge", "<=": "le", "le": "le",
       ">": "gt", "gt": "gt", "<": "lt", "lt": "lt", "contains": "contains",
       "datestartswith": "startswith", "startswith": "startswith"}


def _filter_mask(s: pd.Series, expr: str) -> np.ndarray:
    expr = (expr or "").strip()
    if not expr:
        return np.ones(len(s), dtype=bool)
    m = FILTER_RE.match(expr)
    if m:
        op, val = OPS[m.group(1).lower()], m.group(2).strip().strip('"').strip("'")
    else:
        op, val = ("eq" if re.fullmatch(r"[-+]?\d*\.?\d+(e[-+]?\d+)?", expr, re.I) else "contains"), expr.strip('"')
    text = s.astype(str)
    if op == "contains":
        return text.str.contains(val, case=False, regex=False).to_numpy()
    if op == "startswith":
        return text.str.startswith(val).to_numpy()
    num = pd.to_numeric(s, errors="coerce")
    try:
        v = float(val)
        cmp_s = num
    except ValueError:
        v, cmp_s = val, text
    with np.errstate(invalid="ignore"):
        res = {"eq": cmp_s == v, "ne": cmp_s != v, "gt": cmp_s > v, "ge": cmp_s >= v,
               "lt": cmp_s < v, "le": cmp_s <= v}[op]
    return np.asarray(res.fillna(False) if hasattr(res, "fillna") else res, dtype=bool)


class Editor:
    def __init__(self, lib: Library):
        self.lib = lib
        self.drafts: dict[str, Draft] = {}
        self.lock = threading.RLock()

    def open(self, log_id: str) -> Draft:
        entry = self.lib.get(log_id)
        df = entry.df.copy()
        df.insert(0, "_rid", np.arange(len(df)))
        d = Draft(id=uuid.uuid4().hex[:10], log_id=log_id, df=df, next_rid=len(df))
        with self.lock:
            # one draft per log is plenty; drop stale drafts
            for k in [k for k, v in self.drafts.items() if v.log_id == log_id]:
                self.drafts.pop(k)
            self.drafts[d.id] = d
        return d

    def get(self, draft_id: str) -> Draft:
        d = self.drafts.get(draft_id)
        if d is None:
            raise KeyError("This editing session has ended. Reopen the log.")
        return d

    def info(self, d: Draft) -> dict:
        cols = [c for c in d.df.columns if c != "_rid"]
        return {
            "draftId": d.id, "logId": d.log_id, "rows": int(len(d.df)), "dirty": d.dirty,
            "canUndo": bool(d.history),
            "columns": [{"name": str(c), "numeric": bool(pd.api.types.is_numeric_dtype(d.df[c]))} for c in cols],
        }

    def _filtered(self, d: Draft, filters: dict | None, sort: dict | None) -> pd.DataFrame:
        df = d.df
        if filters:
            mask = np.ones(len(df), dtype=bool)
            for col, expr in filters.items():
                if col in df.columns and expr:
                    mask &= _filter_mask(df[col], expr)
            df = df.loc[mask]
        if sort and sort.get("col") in df.columns:
            df = df.sort_values(sort["col"], ascending=sort.get("dir", "asc") == "asc", kind="stable")
        return df

    def rows(self, d: Draft, offset: int, limit: int, filters=None, sort=None) -> dict:
        view = self._filtered(d, filters, sort)
        page = view.iloc[offset: offset + limit]
        cols = [c for c in d.df.columns if c != "_rid"]
        data = [[int(r[0])] + [_cell(v) for v in r[1:]] for r in page[["_rid"] + cols].itertuples(index=False, name=None)]
        return {"total": int(len(view)), "offset": offset, "rows": data, "columns": cols}

    def apply(self, d: Draft, op: str, p: dict) -> str:
        with self.lock:
            df = d.df
            cols = [c for c in df.columns if c != "_rid"]
            if op == "undo":
                if not d.history:
                    raise EditorError("Nothing to undo.")
                d.df = d.history.pop()
                d.dirty = True
                return "Undid the last change."
            d.push()
            try:
                return self._apply(d, op, p, df, cols)
            except Exception:
                d.df = d.history.pop()
                raise

    def _apply(self, d: Draft, op: str, p: dict, df: pd.DataFrame, cols: list) -> str:
        if op == "rename_col":
            old, new = p.get("col"), (p.get("name") or "").strip()
            if not new:
                raise EditorError("Enter a column name.")
            if new in df.columns and new != old:
                raise EditorError(f"Column '{new}' already exists.")
            d.df = df.rename(columns={old: new})
            return f"Renamed '{old}' to '{new}'."
        if op == "delete_cols":
            sel = [c for c in p.get("cols", []) if c in cols]
            if not sel:
                raise EditorError("Select columns first.")
            d.df = df.drop(columns=sel)
            return f"Deleted {len(sel)} column(s)."
        if op == "add_col":
            name = (p.get("name") or "").strip()
            if not name:
                raise EditorError("Enter a column name.")
            if name in df.columns:
                raise EditorError(f"Column '{name}' already exists.")
            val = p.get("value", "")
            num = pd.to_numeric(pd.Series([val]), errors="coerce").iloc[0]
            d.df = df.assign(**{name: (num if val not in ("", None) and not pd.isna(num) else (val if val else np.nan))})
            return f"Added column '{name}'."
        if op == "reorder_cols":
            order = [c for c in p.get("order", []) if c in cols]
            order += [c for c in cols if c not in order]
            d.df = df[["_rid"] + order]
            return "Columns reordered."
        if op == "promote_header":
            if not len(df):
                raise EditorError("There is no row to promote.")
            first = df.iloc[0]
            names, seen = [], set()
            for c in cols:
                n = str(first[c]).strip() if not pd.isna(first[c]) else ""
                n = n or str(c)
                base, k = n, 1
                while n in seen:
                    k += 1
                    n = f"{base}_{k}"
                seen.add(n)
                names.append(n)
            body = df.iloc[1:].copy()
            body.columns = ["_rid"] + names
            d.df = coerce_numeric(body.reset_index(drop=True))
            return "First row promoted to header."
        if op == "demote_header":
            header = {"_rid": d.next_rid, **{c: str(c) for c in cols}}
            d.next_rid += 1
            body = df.astype({c: object for c in cols})
            new = pd.concat([pd.DataFrame([header]), body], ignore_index=True)
            new.columns = ["_rid"] + [f"Column_{i}" for i in range(len(cols))]
            d.df = new
            return "Header pushed down into the first row."
        if op == "add_row_top":
            row = {"_rid": d.next_rid, **{c: np.nan for c in cols}}
            d.next_rid += 1
            d.df = pd.concat([pd.DataFrame([row]), df], ignore_index=True)
            return "Blank row added at the top."
        if op == "delete_rows":
            rids = set(int(r) for r in p.get("rids", []))
            if not rids:
                raise EditorError("Select rows first.")
            d.df = df[~df["_rid"].isin(rids)].reset_index(drop=True)
            return f"Deleted {len(rids)} row(s)."
        if op == "delete_filtered":
            filters = p.get("filters") or {}
            if not any(filters.values()):
                raise EditorError("Apply a filter first to choose the rows to delete.")
            view = self._filtered(d, filters, None)
            if not len(view):
                raise EditorError("No rows match the current filter.")
            d.df = df[~df["_rid"].isin(set(view["_rid"]))].reset_index(drop=True)
            return f"Deleted {len(view)} filtered row(s)."
        if op == "format_time":
            col = p.get("col")
            if col not in cols:
                raise EditorError("Select a time column first.")
            vals, kind = axis_values(df[col])
            if kind not in ("date", "time"):
                raise EditorError(f"'{col}' does not look like a date or time column.")
            new = df.copy()
            new[col] = format_axis_array(vals, kind)
            d.df = new
            return f"Formatted '{col}' as {'date-time' if kind == 'date' else 'time'}."
        if op == "set_cell":
            rid, col, val = int(p.get("rid")), p.get("col"), p.get("value")
            if col not in cols:
                raise EditorError("Unknown column.")
            new = df.copy()
            loc = new.index[new["_rid"] == rid]
            if not len(loc):
                raise EditorError("That row no longer exists.")
            if pd.api.types.is_numeric_dtype(new[col]):
                num = pd.to_numeric(pd.Series([val]), errors="coerce").iloc[0]
                if pd.isna(num) and val not in ("", None):
                    new[col] = new[col].astype(object)
                    new.loc[loc, col] = val
                else:
                    new.loc[loc, col] = num
            else:
                new[col] = new[col].astype(object)
                new.loc[loc, col] = val
            d.df = new
            return "Cell updated."
        if op == "combine":
            return self._combine(d, p, df, cols)
        raise EditorError(f"Unknown operation '{op}'.")

    def _combine(self, d: Draft, p: dict, df: pd.DataFrame, cols: list) -> str:
        tgt = self.lib.get(p.get("targetId"))
        other = tgt.df.copy()
        method = p.get("method", "append")
        cur = df.drop(columns=["_rid"])
        if method == "append":
            res = pd.concat([cur, other], ignore_index=True)
        else:
            kc, kt = p.get("keyCurrent"), p.get("keyTarget")
            if kc not in cur.columns or kt not in other.columns:
                raise EditorError("Merging needs a key column in both logs.")
            ac, kind_c = axis_values(cur[kc])
            at, kind_t = axis_values(other[kt])
            tol = float(p.get("tolerance") or 1.0)
            if kind_c in ("date", "time") and kind_t in ("date", "time"):
                tol *= 1000.0
            left = cur.assign(__k=ac).dropna(subset=["__k"]).sort_values("__k")
            right = other.assign(__k=at).dropna(subset=["__k"]).sort_values("__k")
            overlap = [c for c in right.columns if c in left.columns and c != "__k"]
            right = right.rename(columns={c: f"{c} ({tgt.name})" for c in overlap})
            res = pd.merge_asof(left, right, on="__k", direction="nearest", tolerance=tol).drop(columns=["__k"])
        res = res.reset_index(drop=True)
        res.insert(0, "_rid", np.arange(len(res)))
        d.next_rid = len(res)
        d.df = res
        verb = "Appended" if method == "append" else "Merged"
        return f"{verb} '{tgt.name}' ({len(other)} rows)."

    def export_df(self, d: Draft) -> pd.DataFrame:
        return d.df.drop(columns=["_rid"]).reset_index(drop=True)

    def commit(self, d: Draft, new_name: str | None) -> dict:
        df = coerce_numeric(self.export_df(d).copy())
        if new_name and new_name.strip():
            name = new_name.strip()
            if self.lib.find_by_name(name):
                raise EditorError(f"A log named '{name}' already exists.")
            src = self.lib.get(d.log_id)
            entry = self.lib.add_dataframe(name, df, category=src.category, replace_same_name=False)
            msg = f"Saved as new log '{name}'."
        else:
            entry = self.lib.set_df(d.log_id, df)
            msg = f"Saved changes to '{entry.name}'."
        d.dirty = False
        d.history.clear()
        return {"message": msg, "logId": entry.id}
