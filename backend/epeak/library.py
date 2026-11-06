"""The log library: every uploaded log, parsed once, cached in memory and on disk.

Logs are identified by a stable ``id`` so tabs keep working when a log is renamed.
The session library is persisted continuously to ``epeak_data/session`` so a server
restart or a browser refresh never loses data.
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from . import config
from .mathexpr import evaluate
from .parsing import axis_values, parse_log_bytes


@dataclass
class LogEntry:
    id: str
    name: str
    category: str = ""
    math: dict[str, str] = field(default_factory=dict)
    version: int = 1
    content_hash: str = ""
    df: pd.DataFrame | None = None

    def meta(self) -> dict:
        df = self.df
        cols = []
        if df is not None:
            for c in df.columns:
                cols.append({"name": str(c), "numeric": bool(pd.api.types.is_numeric_dtype(df[c]))})
        return {
            "id": self.id, "name": self.name, "category": self.category,
            "math": self.math, "version": self.version,
            "rows": 0 if df is None else int(len(df)),
            "columns": cols, "contentHash": self.content_hash,
        }


def df_hash(df: pd.DataFrame) -> str:
    h = hashlib.sha1()
    h.update("|".join(map(str, df.columns)).encode())
    h.update(str(df.shape).encode())
    h.update(pd.util.hash_pandas_object(df, index=False).to_numpy().tobytes())
    return h.hexdigest()[:20]


class Library:
    def __init__(self, root: Path = config.SESSION_DIR):
        self.root = root
        self.logs_dir = root / "logs"
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.logs: dict[str, LogEntry] = {}
        self.categories: list[str] = []
        self.version = 0
        self._axis_cache: dict[tuple, tuple[np.ndarray, str]] = {}
        self._load()

    # ---------- persistence ----------
    def _meta_path(self) -> Path:
        return self.root / "library.json"

    def _load(self) -> None:
        p = self._meta_path()
        if not p.exists():
            return
        try:
            meta = json.loads(p.read_text())
        except Exception:
            return
        self.categories = meta.get("categories", [])
        for m in meta.get("logs", []):
            f = self.logs_dir / f"{m['id']}.pkl"
            if not f.exists():
                continue
            try:
                df = pd.read_pickle(f)
            except Exception:
                continue
            self.logs[m["id"]] = LogEntry(
                id=m["id"], name=m["name"], category=m.get("category", ""),
                math=m.get("math", {}), version=m.get("version", 1),
                content_hash=m.get("contentHash") or df_hash(df), df=df,
            )
        self.version = meta.get("libVersion", 0)

    def _save_meta(self) -> None:
        meta = {
            "categories": self.categories,
            "libVersion": self.version,
            "logs": [{"id": e.id, "name": e.name, "category": e.category, "math": e.math,
                      "version": e.version, "contentHash": e.content_hash} for e in self.logs.values()],
        }
        tmp = self._meta_path().with_suffix(".tmp")
        tmp.write_text(json.dumps(meta))
        tmp.replace(self._meta_path())

    def _save_df(self, entry: LogEntry) -> None:
        f = self.logs_dir / f"{entry.id}.pkl"
        tmp = f.with_suffix(".tmp")
        entry.df.to_pickle(tmp)
        tmp.replace(f)

    def _touch(self) -> None:
        self.version += 1
        self._save_meta()

    # ---------- queries ----------
    def get(self, log_id: str) -> LogEntry:
        e = self.logs.get(log_id)
        if e is None:
            raise KeyError(f"Log '{log_id}' is not in the library.")
        return e

    def find_by_name(self, name: str) -> LogEntry | None:
        return next((e for e in self.logs.values() if e.name == name), None)

    def df(self, log_id: str) -> pd.DataFrame:
        return self.get(log_id).df

    def axis(self, log_id: str, col: str) -> tuple[np.ndarray, str]:
        """Axis values for a column, converted once and cached per log version."""
        e = self.get(log_id)
        if col not in e.df.columns:
            raise KeyError(f"Column '{col}' is not in '{e.name}'.")
        key = (log_id, e.version, col)
        hit = self._axis_cache.get(key)
        if hit is None:
            hit = axis_values(e.df[col])
            if len(self._axis_cache) > 256:
                self._axis_cache.clear()
            self._axis_cache[key] = hit
        return hit

    def snapshot(self) -> dict:
        with self.lock:
            return {
                "version": self.version,
                "categories": list(self.categories),
                "logs": sorted((e.meta() for e in self.logs.values()), key=lambda m: m["name"].lower()),
            }

    # ---------- mutations ----------
    def add_dataframe(self, name: str, df: pd.DataFrame, category: str = "", math: dict | None = None,
                      log_id: str | None = None, replace_same_name: bool = True) -> LogEntry:
        with self.lock:
            existing = self.find_by_name(name) if replace_same_name and log_id is None else None
            if existing is not None:
                existing.df = df
                existing.version += 1
                existing.content_hash = df_hash(df)
                if category:
                    existing.category = category
                entry = existing
            else:
                entry = LogEntry(id=log_id or uuid.uuid4().hex[:12], name=name, category=category,
                                 math=dict(math or {}), df=df, content_hash=df_hash(df))
                self.logs[entry.id] = entry
            if entry.category and entry.category not in self.categories:
                self.categories.append(entry.category)
            self._save_df(entry)
            self._touch()
            return entry

    def add_upload(self, filename: str, raw: bytes) -> LogEntry:
        df = parse_log_bytes(raw, filename)
        return self.add_dataframe(filename, df)

    def set_df(self, log_id: str, df: pd.DataFrame) -> LogEntry:
        with self.lock:
            e = self.get(log_id)
            e.df = df.reset_index(drop=True)
            e.version += 1
            e.content_hash = df_hash(e.df)
            # drop formulas whose column disappeared (e.g. deleted in the Log Editor)
            e.math = {k: v for k, v in e.math.items() if k in e.df.columns}
            self._save_df(e)
            self._touch()
            return e

    def rename(self, log_id: str, new_name: str) -> LogEntry:
        new_name = new_name.strip()
        with self.lock:
            e = self.get(log_id)
            if not new_name:
                raise ValueError("Enter a name for the log.")
            other = self.find_by_name(new_name)
            if other is not None and other.id != log_id:
                raise ValueError(f"A log named '{new_name}' already exists.")
            e.name = new_name
            self._touch()
            return e

    def set_category(self, log_id: str, category: str) -> LogEntry:
        with self.lock:
            e = self.get(log_id)
            e.category = category or ""
            if e.category and e.category not in self.categories:
                self.categories.append(e.category)
            self._touch()
            return e

    def delete(self, log_id: str) -> None:
        with self.lock:
            self.logs.pop(log_id, None)
            (self.logs_dir / f"{log_id}.pkl").unlink(missing_ok=True)
            self._touch()

    def add_category(self, name: str) -> None:
        name = name.strip()
        with self.lock:
            if not name:
                raise ValueError("Enter a category name.")
            if name not in self.categories:
                self.categories.append(name)
                self._touch()

    def delete_category(self, name: str) -> None:
        with self.lock:
            if name in self.categories:
                self.categories.remove(name)
            for e in self.logs.values():
                if e.category == name:
                    e.category = ""
            self._touch()

    # ---------- math engine ----------
    def set_math(self, log_id: str, var: str, expr: str) -> LogEntry:
        var = var.strip()
        if not var:
            raise ValueError("Enter a name for the new variable.")
        with self.lock:
            e = self.get(log_id)
            if var in e.df.columns and var not in e.math:
                raise ValueError(f"'{var}' is an original column of this log. Pick another name.")
            values = evaluate(expr, e.df)
            df = e.df.copy()
            df[var] = values
            e.math[var] = expr
            return self.set_df(log_id, df)

    def delete_math(self, log_id: str, var: str) -> LogEntry:
        with self.lock:
            e = self.get(log_id)
            e.math.pop(var, None)
            df = e.df.drop(columns=[var]) if var in e.df.columns else e.df
            return self.set_df(log_id, df)

    # ---------- bulk ----------
    def clear(self) -> None:
        with self.lock:
            for f in self.logs_dir.glob("*.pkl"):
                f.unlink(missing_ok=True)
            self.logs.clear()
            self.categories = []
            self._axis_cache.clear()
            self._touch()


def now_stamp() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")
