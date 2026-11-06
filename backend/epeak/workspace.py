"""Workspaces: session persistence, named saves, rolling autosaves and legacy import.

A saved workspace is a single ``.epeak`` file (a zip) containing:
    manifest.json   name, save time, tab and log counts (read by the workspace browser)
    state.json      tabs, ledger, evidence board, styles, report staging
    library.json    log names, categories and math formulas
    logs/<id>.csv   one CSV per log
    evidence/...    images from the evidence board
No pickles: files are portable, inspectable and safe to share.
"""
from __future__ import annotations

import base64
import gzip
import hashlib
import io
import json
import mimetypes
import pickle
import threading
import time
import uuid
import zipfile
from pathlib import Path

import pandas as pd

from . import config
from .library import Library
from .parsing import axis_values, coerce_numeric, parse_log_bytes

FORMAT = "epeak-workspace"
FORMAT_VERSION = 2
_lock = threading.RLock()
_last_autosave_sig: dict[str, str] = {}


class WorkspaceError(ValueError):
    pass


def safe_stem(name: str) -> str:
    stem = "".join(c for c in (name or "") if c.isalnum() or c in " _-.").strip().replace(" ", "_")
    for ext in (".epeak", ".pkl"):
        if stem.lower().endswith(ext):
            stem = stem[: -len(ext)]
    return stem or "Untitled"


# ------------------------------------------------------------------ session

def _session_file(name: str) -> Path:
    return config.SESSION_DIR / name


def load_session() -> dict:
    state, meta = None, {}
    for fname, target in (("state.json", "state"), ("meta.json", "meta")):
        p = _session_file(fname)
        if p.exists():
            try:
                data = json.loads(p.read_text())
            except Exception:
                data = None
            if target == "state":
                state = data
            else:
                meta = data or {}
    return {"state": state, "workspaceName": meta.get("workspaceName", "Untitled"),
            "savedSignature": meta.get("savedSignature")}


def save_session(state: dict, workspace_name: str | None = None, saved_signature: str | None = None) -> None:
    with _lock:
        p = _session_file("state.json")
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(state))
        tmp.replace(p)
        meta = load_session()
        m = {"workspaceName": workspace_name or meta["workspaceName"],
             "savedSignature": saved_signature if saved_signature is not None else meta.get("savedSignature")}
        _session_file("meta.json").write_text(json.dumps(m))


def set_session_meta(workspace_name: str, saved_signature: str | None) -> None:
    _session_file("meta.json").write_text(json.dumps({"workspaceName": workspace_name, "savedSignature": saved_signature}))


# ------------------------------------------------------------------ evidence files

def evidence_path(file: str) -> Path:
    p = (config.SESSION_EVIDENCE / Path(file).name).resolve()
    if p.parent != config.SESSION_EVIDENCE.resolve():
        raise WorkspaceError("Invalid evidence file.")
    return p


def store_evidence(filename: str, raw: bytes) -> dict:
    ext = Path(filename).suffix.lower() or ".png"
    file = f"{uuid.uuid4().hex[:12]}{ext}"
    evidence_path(file).write_bytes(raw)
    width = height = None
    try:
        from PIL import Image
        with Image.open(io.BytesIO(raw)) as im:
            width, height = im.size
    except Exception:
        pass
    return {"id": uuid.uuid4().hex[:12], "name": filename, "file": file,
            "mime": mimetypes.guess_type(filename)[0] or "image/png",
            "type": "image", "nodes": [], "width": width, "height": height}


# ------------------------------------------------------------------ save / load

def state_signature(state: dict, lib: Library) -> str:
    body = json.dumps(state, sort_keys=True, default=str)
    hashes = sorted(f"{e.id}:{e.name}:{e.category}:{e.content_hash}" for e in lib.logs.values())
    return hashlib.sha1((body + "|".join(hashes) + "|".join(lib.categories)).encode()).hexdigest()


def _library_manifest(lib: Library) -> dict:
    return {"categories": lib.categories,
            "logs": [{"id": e.id, "name": e.name, "category": e.category, "math": e.math,
                      "file": f"logs/{e.id}.csv"} for e in lib.logs.values()]}


def write_workspace(path: Path, name: str, state: dict, lib: Library) -> None:
    tmp = path.with_suffix(".tmp")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=4) as z:
        z.writestr("manifest.json", json.dumps({
            "format": FORMAT, "version": FORMAT_VERSION, "name": name,
            "savedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
            "tabs": len(state.get("tabs", [])), "logs": len(lib.logs)}))
        z.writestr("state.json", json.dumps(state))
        z.writestr("library.json", json.dumps(_library_manifest(lib)))
        for e in lib.logs.values():
            z.writestr(f"logs/{e.id}.csv", e.df.to_csv(index=False))
        for ev in state.get("evidence", []) or []:
            p = evidence_path(ev.get("file", ""))
            if p.exists():
                z.write(p, f"evidence/{p.name}")
    tmp.replace(path)


def save_workspace(name: str, state: dict, lib: Library) -> dict:
    stem = safe_stem(name)
    with _lock:
        write_workspace(config.WORKSPACE_DIR / f"{stem}.epeak", stem, state, lib)
    sig = state_signature(state, lib)
    set_session_meta(stem, sig)
    return {"name": stem, "signature": sig}


def _read_csv_bytes(raw: bytes) -> pd.DataFrame:
    df = pd.read_csv(io.BytesIO(raw), low_memory=False)
    return coerce_numeric(df)


def load_workspace_file(path: Path, lib: Library) -> dict:
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        if "state.json" not in names:
            raise WorkspaceError("This file is not an E-PEAK workspace.")
        state = json.loads(z.read("state.json"))
        libman = json.loads(z.read("library.json")) if "library.json" in names else {"logs": []}
        with _lock:
            lib.clear()
            for f in config.SESSION_EVIDENCE.glob("*"):
                f.unlink(missing_ok=True)
            for m in libman.get("logs", []):
                if m["file"] not in names:
                    continue
                df = _read_csv_bytes(z.read(m["file"]))
                lib.add_dataframe(m["name"], df, category=m.get("category", ""), math=m.get("math", {}),
                                  log_id=m["id"], replace_same_name=False)
            for c in libman.get("categories", []):
                if c not in lib.categories:
                    lib.categories.append(c)
            for n in names:
                if n.startswith("evidence/") and not n.endswith("/"):
                    evidence_path(Path(n).name).write_bytes(z.read(n))
    return state


def load_workspace(ref: str, lib: Library) -> dict:
    """Load by reference: 'saved/<file>', 'autosave/<file>' or 'legacy/<file>'."""
    kind, _, fname = ref.partition("/")
    fname = Path(fname).name
    if kind == "saved":
        path = config.WORKSPACE_DIR / fname
        if not path.exists():
            raise WorkspaceError("That workspace no longer exists.")
        state = load_workspace_file(path, lib)
        name = path.stem
        sig = state_signature(state, lib)
        save_session(state, name, sig)
        return {"state": state, "workspaceName": name, "restored": False, "savedSignature": sig}
    if kind == "autosave":
        state, name = load_autosave(config.AUTOSAVE_DIR / fname, lib)
        save_session(state, name, "")
        return {"state": state, "workspaceName": name, "restored": True, "savedSignature": ""}
    if kind == "legacy":
        path = config.WORKSPACE_DIR / fname
        state = import_legacy(path.read_bytes(), lib)
        name = path.stem
        save_session(state, name, "")
        return {"state": state, "workspaceName": name, "restored": False, "converted": True, "savedSignature": ""}
    raise WorkspaceError("Unknown workspace reference.")


# ------------------------------------------------------------------ autosave

def autosave(name: str, state: dict, lib: Library) -> str | None:
    stem = safe_stem(name)
    sig = state_signature(state, lib)
    if _last_autosave_sig.get(stem) == sig:
        return None
    with _lock:
        logs = []
        for e in lib.logs.values():
            blob = config.AUTOSAVE_BLOBS / f"{e.content_hash}.csv.gz"
            if not blob.exists():
                tmp = blob.with_suffix(".tmp")
                with gzip.open(tmp, "wt", compresslevel=3) as fh:
                    e.df.to_csv(fh, index=False)
                tmp.replace(blob)
            logs.append({"id": e.id, "name": e.name, "category": e.category, "math": e.math, "blob": blob.name})
        evidence = []
        for ev in state.get("evidence", []) or []:
            p = evidence_path(ev.get("file", ""))
            if p.exists():
                raw = p.read_bytes()
                bname = f"ev_{hashlib.sha1(raw).hexdigest()[:20]}{p.suffix}"
                b = config.AUTOSAVE_BLOBS / bname
                if not b.exists():
                    b.write_bytes(raw)
                evidence.append({"file": p.name, "blob": bname})
        ts = time.strftime("%Y%m%d-%H%M%S")
        snap = {"wsName": stem, "savedAt": time.strftime("%Y-%m-%d %H:%M:%S"), "state": state,
                "library": {"categories": lib.categories, "logs": logs}, "evidence": evidence}
        out = config.AUTOSAVE_DIR / f"{stem}__{ts}.json"
        tmp = out.with_suffix(".tmp")
        tmp.write_text(json.dumps(snap))
        tmp.replace(out)
        _last_autosave_sig[stem] = sig
        _prune_autosaves(stem)
    return ts


def _prune_autosaves(stem: str) -> None:
    mine = sorted(p for p in config.AUTOSAVE_DIR.glob("*.json") if p.name.rsplit("__", 1)[0] == stem)
    for old in mine[: -config.AUTOSAVE_KEEP]:
        old.unlink(missing_ok=True)
    used = set()
    for p in config.AUTOSAVE_DIR.glob("*.json"):
        try:
            snap = json.loads(p.read_text())
        except Exception:
            continue
        used.update(m["blob"] for m in snap.get("library", {}).get("logs", []))
        used.update(e["blob"] for e in snap.get("evidence", []))
    for b in config.AUTOSAVE_BLOBS.glob("*"):
        if b.name not in used:
            b.unlink(missing_ok=True)


def load_autosave(path: Path, lib: Library) -> tuple[dict, str]:
    if not path.exists():
        raise WorkspaceError("That snapshot no longer exists.")
    snap = json.loads(path.read_text())
    with _lock:
        lib.clear()
        for f in config.SESSION_EVIDENCE.glob("*"):
            f.unlink(missing_ok=True)
        for m in snap["library"]["logs"]:
            b = config.AUTOSAVE_BLOBS / m["blob"]
            if not b.exists():
                raise WorkspaceError(f"The data for '{m['name']}' is missing from the autosave store.")
            with gzip.open(b, "rb") as fh:
                df = _read_csv_bytes(fh.read())
            lib.add_dataframe(m["name"], df, category=m.get("category", ""), math=m.get("math", {}),
                              log_id=m["id"], replace_same_name=False)
        for c in snap["library"].get("categories", []):
            if c not in lib.categories:
                lib.categories.append(c)
        for ev in snap.get("evidence", []):
            b = config.AUTOSAVE_BLOBS / ev["blob"]
            if b.exists():
                evidence_path(ev["file"]).write_bytes(b.read_bytes())
    return snap["state"], snap["wsName"]


# ------------------------------------------------------------------ listing

def _fmt_size(n: int) -> str:
    return f"{n / 1048576:.2f} MB" if n >= 1048576 else f"{n / 1024:.0f} KB"


def list_workspaces() -> dict:
    saved, legacy, autos = [], [], []
    for p in config.WORKSPACE_DIR.glob("*.epeak"):
        info = {"ref": f"saved/{p.name}", "name": p.stem, "size": _fmt_size(p.stat().st_size),
                "modified": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(p.stat().st_mtime)),
                "tabs": None, "logs": None}
        try:
            with zipfile.ZipFile(p) as z:
                man = json.loads(z.read("manifest.json"))
            info.update(tabs=man.get("tabs"), logs=man.get("logs"), modified=man.get("savedAt", info["modified"]))
        except Exception:
            info["error"] = "Unreadable file"
        saved.append(info)
    for p in config.WORKSPACE_DIR.glob("*.pkl"):
        legacy.append({"ref": f"legacy/{p.name}", "name": p.stem, "size": _fmt_size(p.stat().st_size),
                       "modified": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(p.stat().st_mtime)),
                       "tabs": None, "logs": None, "legacy": True})
    for p in config.AUTOSAVE_DIR.glob("*.json"):
        stem, _, ts = p.stem.rpartition("__")
        try:
            snap = json.loads(p.read_text())
            tabs, logs = len(snap["state"].get("tabs", [])), len(snap["library"]["logs"])
            when = snap.get("savedAt", ts)
        except Exception:
            tabs = logs = None
            when = ts
        size = p.stat().st_size + sum((config.AUTOSAVE_BLOBS / m["blob"]).stat().st_size
                                      for m in (snap.get("library", {}).get("logs", []) if tabs is not None else [])
                                      if (config.AUTOSAVE_BLOBS / m["blob"]).exists())
        autos.append({"ref": f"autosave/{p.name}", "name": stem, "modified": when, "size": _fmt_size(size),
                      "tabs": tabs, "logs": logs})
    key = lambda d: d["modified"] or ""
    return {"saved": sorted(saved + legacy, key=key, reverse=True), "autosaves": sorted(autos, key=key, reverse=True)}


def delete_workspace(ref: str) -> None:
    kind, _, fname = ref.partition("/")
    base = config.AUTOSAVE_DIR if kind == "autosave" else config.WORKSPACE_DIR
    p = base / Path(fname).name
    if not p.exists():
        raise WorkspaceError("That workspace no longer exists.")
    p.unlink()
    if kind == "autosave":
        _prune_autosaves("\0")


# ------------------------------------------------------------------ legacy (.pkl from the Dash app)

class _Stub:
    def __init__(self, *a, **k):
        pass

    def __setstate__(self, s):
        self.state = s


class _SafeUnpickler(pickle.Unpickler):
    """Only plain data is loaded; any other object (e.g. a plotly Figure) becomes an inert stub."""
    ALLOWED = ("builtins", "collections", "datetime", "numpy", "pandas", "copyreg", "_codecs")

    def find_class(self, module, name):
        if module.split(".")[0] in self.ALLOWED and not (module == "builtins" and name in ("eval", "exec", "getattr", "__import__", "open", "compile")):
            return super().find_class(module, name)
        return _Stub


STATUS_MAP = {"🟡 Testing": "testing", "🟢 Validated": "validated", "🔴 Rejected": "rejected"}


def _legacy_range(rel, kind: str | None) -> list[float] | None:
    if not isinstance(rel, dict) or "xaxis.range[0]" not in rel:
        return None
    a, b = rel.get("xaxis.range[0]"), rel.get("xaxis.range[1]")
    try:
        return [float(a), float(b)]
    except (TypeError, ValueError):
        pass
    try:
        ta, tb = pd.Timestamp(a), pd.Timestamp(b)
    except (TypeError, ValueError):
        return None
    if kind == "time":
        day = lambda t: (t - t.normalize()).total_seconds() * 1000
        return [day(ta), day(tb)]
    return [ta.value / 1e6, tb.value / 1e6]


def _ints(v) -> list[int] | None:
    if not v:
        return None
    out = []
    for x in v:
        try:
            out.append(int(x))
        except (TypeError, ValueError):
            pass
    return out or None


def import_legacy(raw: bytes, lib: Library) -> dict:
    """Convert a v1 (Dash) ``.pkl`` workspace into the new state and load its logs."""
    try:
        data = _SafeUnpickler(io.BytesIO(raw)).load()
    except Exception as exc:
        raise WorkspaceError(f"Could not read this legacy workspace: {exc}") from None
    if not isinstance(data, dict):
        data = {"tabs": data}
    old = data.get("library", {}) or {}
    files, cats, file_cats, math = old.get("FILES"), list(old.get("CATEGORIES", [])), dict(old.get("FILE_CATS", {})), old.get("MATH", {})
    if files is None:  # very old layout: {'DIVA': {...}, 'PPA': {...}}
        files = {}
        for legacy_type in ("DIVA", "PPA", "GENERIC"):
            for fname, content in (old.get(legacy_type) or {}).items():
                files[fname] = content
                file_cats[fname] = legacy_type
                if legacy_type not in cats:
                    cats.append(legacy_type)

    with _lock:
        lib.clear()
        for f in config.SESSION_EVIDENCE.glob("*"):
            f.unlink(missing_ok=True)
        ids: dict[str, str] = {}
        for fname, content in files.items():
            try:
                b64 = content.split(",", 1)[1] if "," in content else content
                df = parse_log_bytes(base64.b64decode(b64), fname)
            except Exception:
                continue
            entry = lib.add_dataframe(fname, df, category=file_cats.get(fname, ""),
                                      math=(math or {}).get(fname, {}), replace_same_name=False)
            ids[fname] = entry.id
        for c in cats:
            if c not in lib.categories:
                lib.categories.append(c)

    def lid(name):
        return ids.get(name) if name else None

    def kind_of(log_name, col):
        i = lid(log_name)
        if not i or not col:
            return None
        try:
            return lib.axis(i, col)[1]
        except KeyError:
            return None

    tabs = []
    for t in data.get("tabs", []) or []:
        ttype = t.get("tab_type", "calibration")
        base = {"id": t.get("id") or uuid.uuid4().hex, "name": t.get("tab_name") or "Analysis",
                "comment": t.get("comment", "") or ""}
        if ttype == "generic":
            active = t.get("active_plots") or list(range(1, int(t.get("num_plots", 1)) + 1))
            kind = kind_of(t.get("g_name"), t.get("g_x"))
            plots = [{"id": f"plot_{p}", "yl": t.get(f"g_yl{p}") or [], "yr": t.get(f"g_yr{p}") or [],
                      "comment": t.get(f"comment_{p}") or "", "range": _legacy_range(t.get(f"g_rel{p}"), kind),
                      "markers": {}} for p in active]
            tabs.append({**base, "type": "generic", "logId": lid(t.get("g_name")), "x": t.get("g_x"),
                         "skip": t.get("downsample") or 1, "linkX": False, "excluded": [],
                         "legacyValid": _ints(t.get("valid_row_ids")), "plots": plots or [
                             {"id": "plot_1", "yl": [], "yr": [], "comment": "", "range": None, "markers": {}}]})
        elif ttype == "calibration":
            n = int(t.get("calib_num_logs", 2))
            logs, xs, ys, offs = (t.get(k, [None] * 5) for k in ("calib_logs", "calib_xs", "calib_ys", "calib_offs"))
            sources = [{"logId": lid(logs[i]), "x": xs[i], "y": ys[i], "offset": float(offs[i] or 0)} for i in range(n)]
            tabs.append({**base, "type": "calibration", "sources": sources,
                         "errMode": t.get("calib_err_mode", "percentage"), "skip": t.get("downsample") or 1,
                         "excluded": [], "legacyValid": _ints(t.get("valid_row_ids")),
                         "range": _legacy_range(t.get("calib_rel"), "number"), "markers": {}})
        elif ttype == "compare":
            logs, xs, yls, yrs, offs = (t.get(k, [None] * 5) for k in ("c_logs", "c_xs", "c_yls", "c_yrs", "c_offs"))
            sources = [{"slot": i + 1, "logId": lid(logs[i]), "x": xs[i], "yl": yls[i] or [], "yr": yrs[i] or [],
                        "offset": float(offs[i] or 0)} for i in range(len(logs)) if logs[i]]
            while len(sources) < 2:
                sources.append({"slot": len(sources) + 1, "logId": None, "x": None, "yl": [], "yr": [], "offset": 0})
            tabs.append({**base, "type": "compare", "sources": sources, "skip": t.get("downsample") or 1,
                         "excluded": [], "range": _legacy_range(t.get("comp_rel"), "number"), "markers": {}})
        elif ttype == "append":
            n = int(t.get("a_num_logs", 2))
            logs, xs, sts, ens = (t.get(k, [None] * 5) for k in ("a_logs", "a_xs", "a_starts", "a_ends"))
            sources = [{"slot": i + 1, "logId": lid(logs[i]), "x": xs[i], "start": sts[i] or "", "end": ens[i] or ""}
                       for i in range(n)]
            tabs.append({**base, "type": "append", "sources": sources, "yl": t.get("a_yl") or [],
                         "yr": t.get("a_yr") or [], "skip": t.get("downsample") or 1, "excluded": [],
                         "range": _legacy_range(t.get("a_rel"), "number"), "markers": {}})
        elif ttype == "3d_plot":
            tabs.append({**base, "type": "three_d", "logId": lid(t.get("3d-log")), "x": t.get("3d-x"),
                         "y": t.get("3d-y"), "z": t.get("3d-z"), "mode": t.get("3d-mode") or "lines"})
        elif ttype == "global_stats":
            tabs.append({**base, "type": "global_stats", "logId": lid(t.get("log_name")), "vars": t.get("vars") or []})
        elif ttype == "waveform":
            tabs.append({**base, "type": "waveform", "shape": t.get("w_type", "sine"),
                         "v": t.get("w_v", 230), "i": t.get("w_i", 10), "f": t.get("w_f", 50),
                         "p": t.get("w_p", 45), "thdV": t.get("w_v_thd", 0), "thdI": t.get("w_i_thd", 0),
                         "linkTabId": t.get("w_link"), "logId": lid(t.get("w_log")),
                         "timeCol": t.get("w_time_col"), "row": t.get("w_time_slider") or 0,
                         "cols": {"v": t.get("w_log_v"), "i": t.get("w_log_i"), "f": t.get("w_log_f"),
                                  "p": t.get("w_log_p"), "thdV": t.get("w_log_thdv"), "thdI": t.get("w_log_thdi")}})

    ledger = [{"id": r.get("id") or uuid.uuid4().hex, "date": r.get("date", ""), "logRef": r.get("log_ref", ""),
               "hypothesis": r.get("hypothesis", ""), "status": STATUS_MAP.get(r.get("status"), "testing"),
               "conclusion": r.get("conclusion", "")} for r in data.get("ledger", []) or []]

    evidence = []
    for e in data.get("evidence", []) or []:
        content = e.get("content", "")
        if "," not in content:
            continue
        header, b64 = content.split(",", 1)
        mime = header.split(";")[0].replace("data:", "") or "image/png"
        ext = mimetypes.guess_extension(mime) or ".png"
        name = e.get("name") or f"image{ext}"
        item = store_evidence(name if Path(name).suffix else name + ext, base64.b64decode(b64))
        item.update(id=e.get("id") or item["id"], name=name, type=e.get("type", "image"),
                    nodes=[{"id": n.get("node_id") or uuid.uuid4().hex[:8], "name": n.get("name", ""),
                            "x": n.get("x"), "y": n.get("y")} for n in e.get("nodes", []) or []])
        evidence.append(item)

    styles = {}
    for tab_id, plots in (data.get("global_styles") or {}).items():
        styles[tab_id] = {}
        for plot_key, s in (plots or {}).items():
            styles[tab_id][plot_key] = {
                "title": s.get("title", ""), "xTitle": s.get("xaxis_title", ""), "yTitle": s.get("yaxis_title", ""),
                "y2Title": s.get("yaxis2_title", ""), "showLegend": s.get("showlegend", True),
                "traces": {k: {"name": v.get("name", ""), "color": v.get("color"), "dash": v.get("dash", "solid")}
                           for k, v in (s.get("traces") or {}).items()}}

    return {"version": 2, "tabs": tabs, "activeTabId": tabs[0]["id"] if tabs else None, "ledger": ledger,
            "evidence": evidence, "styles": styles, "staging": []}


def import_upload(filename: str, raw: bytes, lib: Library) -> dict:
    """Import a workspace file uploaded from the browser (.epeak or legacy .pkl)."""
    stem = safe_stem(Path(filename).stem)
    if filename.lower().endswith(".pkl"):
        state = import_legacy(raw, lib)
        save_session(state, stem, "")
        return {"state": state, "workspaceName": stem, "converted": True, "savedSignature": ""}
    path = config.WORKSPACE_DIR / f"{stem}.epeak"
    if path.exists():
        path = config.WORKSPACE_DIR / f"{stem}_{time.strftime('%H%M%S')}.epeak"
    path.write_bytes(raw)
    try:
        return load_workspace(f"saved/{path.name}", lib)
    except (zipfile.BadZipFile, WorkspaceError):
        path.unlink(missing_ok=True)
        raise WorkspaceError("This file is not an E-PEAK workspace.") from None
