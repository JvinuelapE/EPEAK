"""FastAPI application: REST API + the built frontend."""
from __future__ import annotations

import io
import json
import os
import re
import sys
import threading
import urllib.parse
from typing import Any

import numpy as np
from fastapi import Body, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, config
from . import datasets as dsmod
from . import demo
from . import detect
from . import editor as edmod
from . import export as exmod
from . import tools
from . import tutorial
from . import workspace as wsmod
from .library import Library
from .mathexpr import ExpressionError

lib = Library()
if config.TUTORIAL:
    demo.ensure_installed(lib)  # first start, or after an update of the demo
store = dsmod.DatasetStore(lib)
editor = edmod.Editor(lib)

app = FastAPI(title="E-PEAK", version=__version__)
# lets run.py tell whether a running E-PEAK uses the current backend code
CODE_HASH = config.backend_code_hash()

USER_ERRORS = (ValueError, KeyError, dsmod.DatasetError, edmod.EditorError, ExpressionError,
               wsmod.WorkspaceError, exmod.ExportError)


async def _user_error(request: Request, exc: Exception):
    msg = exc.args[0] if exc.args else str(exc)
    return JSONResponse({"detail": str(msg)}, status_code=400)


for _cls in USER_ERRORS:
    app.add_exception_handler(_cls, _user_error)


@app.exception_handler(Exception)
async def _unexpected(request: Request, exc: Exception):
    return JSONResponse({"detail": f"Unexpected error: {exc}"}, status_code=500)


def _download(data: bytes, filename: str, mime: str) -> Response:
    quoted = urllib.parse.quote(filename)
    return Response(data, media_type=mime,
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quoted}"})


def _date_json(ms: np.ndarray) -> str:
    """Timezone-free date strings: Plotly would read epoch numbers in the browser's local time."""
    if not len(ms):
        return "[]"
    ok = np.isfinite(ms)
    s = np.datetime_as_string(np.where(ok, ms, 0).astype("int64").astype("datetime64[ms]"), unit="ms").astype(object)
    s = np.char.replace(s.astype(str), "T", " ").astype(object)
    s = np.char.add(np.char.add('"', s.astype(str)), '"').astype(object)
    s[~ok] = "null"
    return "[" + ",".join(s.tolist()) + "]"


def _num_json(arr: np.ndarray, fmt: str) -> str:
    if not len(arr):
        return "[]"
    s = np.char.mod(fmt, arr.astype("float64"))
    bad = ~np.isfinite(arr)
    if bad.any():
        s = s.astype(object)
        s[bad] = "null"
    return "[" + ",".join(s.tolist()) + "]"


# ------------------------------------------------------------------ app / session

@app.get("/api/health")
def health():
    return {"ok": True, "version": __version__, "code": CODE_HASH, "tutorial": config.TUTORIAL}


@app.get("/api/session")
def get_session():
    sess = wsmod.load_session()
    return {**sess, "library": lib.snapshot(), "version": __version__, "dataDir": str(config.DATA_DIR)}


@app.put("/api/session/state")
def put_session_state(payload: dict = Body(...)):
    wsmod.save_session(payload.get("state") or {}, payload.get("workspaceName"))
    return {"ok": True, "signature": wsmod.state_signature(payload.get("state") or {}, lib)}


@app.post("/api/open-folder")
def open_folder(payload: dict = Body(...)):
    """Show the workspaces (or data) folder in the file manager — this is a local, single-user app."""
    import subprocess
    target = config.WORKSPACE_DIR if payload.get("which", "workspaces") == "workspaces" else config.DATA_DIR
    if sys.platform.startswith("win"):
        os.startfile(str(target))  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(target)])
    else:
        subprocess.Popen(["xdg-open", str(target)])
    return {"path": str(target)}


@app.post("/api/shutdown")
def shutdown():
    threading.Timer(0.6, lambda: os._exit(0)).start()
    return {"ok": True}


# ------------------------------------------------------------------ tutorial

@app.get("/api/tutorial")
def tutorial_info():
    return {"tutorial": config.TUTORIAL, "demo": demo.load_info() if config.TUTORIAL else None, "port": config.TUTORIAL_PORT}


@app.post("/api/tutorial/reset")
def tutorial_reset():
    if not config.TUTORIAL:
        raise ValueError("Only the tutorial can be reset.")
    res = demo.install(lib)
    return {"state": res["state"], "workspaceName": demo.WS_NAME, "library": lib.snapshot(), "demo": res["info"]}


@app.post("/api/tutorial/open")
def tutorial_open():
    return tutorial.launch()


@app.post("/api/tutorial/shortcut")
def tutorial_shortcut():
    return {"path": tutorial.create_shortcut()}


# ------------------------------------------------------------------ library

@app.get("/api/library")
def get_library():
    return lib.snapshot()


@app.post("/api/library/upload")
async def upload_logs(files: list[UploadFile] = File(...)):
    added, errors, replaced = [], [], []
    for f in files:
        raw = await f.read()
        try:
            existed = lib.find_by_name(f.filename or "log.csv") is not None
            e = lib.add_upload(f.filename or "log.csv", raw)
            added.append({"id": e.id, "name": e.name, "rows": len(e.df)})
            if existed:
                replaced.append(e.name)
        except Exception as exc:  # report and continue with the other files
            errors.append(f"{f.filename}: {exc}")
    return {"added": added, "errors": errors, "replaced": replaced, "library": lib.snapshot()}


@app.patch("/api/library/{log_id}")
def patch_log(log_id: str, payload: dict = Body(...)):
    if "name" in payload:
        lib.rename(log_id, payload["name"])
    if "category" in payload:
        lib.set_category(log_id, payload["category"])
    return lib.snapshot()


@app.delete("/api/library/{log_id}")
def delete_log(log_id: str):
    lib.delete(log_id)
    return lib.snapshot()


@app.post("/api/library/categories")
def add_category(payload: dict = Body(...)):
    lib.add_category(payload.get("name", ""))
    return lib.snapshot()


@app.delete("/api/library/categories/{name}")
def delete_category(name: str):
    lib.delete_category(name)
    return lib.snapshot()


@app.post("/api/library/{log_id}/math")
def set_math(log_id: str, payload: dict = Body(...)):
    lib.set_math(log_id, payload.get("var", ""), payload.get("expr", ""))
    return lib.snapshot()


@app.post("/api/library/{log_id}/math/preview")
def preview_math(log_id: str, payload: dict = Body(...)):
    from .mathexpr import evaluate
    vals = evaluate(payload.get("expr", ""), lib.df(log_id))
    finite = vals[np.isfinite(vals)]
    return {"sample": [None if not np.isfinite(v) else float(v) for v in vals[:5]],
            "min": float(finite.min()) if len(finite) else None,
            "max": float(finite.max()) if len(finite) else None,
            "nan": int((~np.isfinite(vals)).sum())}


@app.delete("/api/library/{log_id}/math/{var}")
def delete_math(log_id: str, var: str):
    lib.delete_math(log_id, var)
    return lib.snapshot()


@app.get("/api/library/{log_id}/csv")
def download_log(log_id: str):
    data, name, mime = exmod.logs_archive(lib, [log_id])
    return _download(data, name, mime)


@app.post("/api/library/download")
def download_logs(payload: dict = Body(...)):
    data, name, mime = exmod.logs_archive(lib, payload.get("ids") or [])
    return _download(data, name, mime)


@app.get("/api/library/{log_id}/row")
def log_row(log_id: str, index: int = 0, cols: str = "", timeCol: str | None = None):
    return tools.log_row(lib, log_id, index, [c for c in cols.split("\x1f") if c], timeCol)


@app.get("/api/library/{log_id}/marks")
def log_marks(log_id: str, timeCol: str):
    return tools.log_time_marks(lib, log_id, timeCol)


@app.get("/api/library/{log_id}/find")
def log_find(log_id: str, timeCol: str, q: str):
    return {"index": tools.find_time(lib, log_id, timeCol, q)}


@app.get("/api/library/{log_id}/axis-kind")
def axis_kind(log_id: str, col: str):
    return {"kind": lib.axis(log_id, col)[1]}


# ------------------------------------------------------------------ datasets

@app.post("/api/dataset")
def build_dataset(payload: dict = Body(...)):
    ds = store.build(payload["kind"], payload.get("cfg") or {})
    return ds.describe()


def _xr(p: dict):
    return p.get("x0"), p.get("x1")


@app.post("/api/dataset/{ds_id}/series")
def dataset_series(ds_id: str, payload: dict = Body(...)):
    ds = store.get(ds_id)
    res = dsmod.series(ds, payload.get("cols") or [], *_xr(payload), int(payload.get("width") or 1200))
    as_dates = ds.x_kind in ("date", "time")
    parts = []
    for col, tr in res["traces"].items():
        xs = _date_json(tr["x"]) if as_dates else _num_json(tr["x"], "%.15g")
        parts.append(f"{json.dumps(col)}:{{\"x\":{xs},\"y\":{_num_json(tr['y'], '%.8g')}}}")
    body = (f"{{\"traces\":{{{','.join(parts)}}},\"decimated\":{json.dumps(res['decimated'])},"
            f"\"points\":{res['points']}}}")
    return Response(body, media_type="application/json")


@app.post("/api/dataset/{ds_id}/stats")
def dataset_stats(ds_id: str, payload: dict = Body(...)):
    return dsmod.stats(store.get(ds_id), payload.get("cols") or [], *_xr(payload))


@app.post("/api/dataset/{ds_id}/rows")
def dataset_rows(ds_id: str, payload: dict = Body(...)):
    return dsmod.rows(store.get(ds_id), payload.get("cols") or [], *_xr(payload),
                      int(payload.get("offset") or 0), min(int(payload.get("limit") or 200), 2000))


@app.post("/api/dataset/{ds_id}/analytics")
def dataset_analytics(ds_id: str, payload: dict = Body(...)):
    return dsmod.analytics(store.get(ds_id), payload.get("cols") or [], *_xr(payload))


@app.post("/api/dataset/{ds_id}/at")
def dataset_at(ds_id: str, payload: dict = Body(...)):
    """Values under the measurement cursors (nearest real sample, full resolution)."""
    return dsmod.values_at(store.get(ds_id), payload.get("cols") or [], payload.get("xs") or [])


@app.post("/api/dataset/{ds_id}/limits")
def dataset_limits(ds_id: str, payload: dict = Body(...)):
    """Pass/fail of each trace against its limits, for the points in view."""
    return detect.limit_check(store.get(ds_id), payload.get("checks") or [], *_xr(payload))


@app.post("/api/dataset/{ds_id}/events")
def dataset_events(ds_id: str, payload: dict = Body(...)):
    """Threshold, step, spike and dropout events for the points in view."""
    return detect.find_events(store.get(ds_id), payload.get("rules") or [], *_xr(payload))


@app.post("/api/dataset/{ds_id}/steady")
def dataset_steady(ds_id: str, payload: dict = Body(...)):
    """Steady states (plateaus) of one trace, with the statistics of every trace over each one."""
    return detect.find_steady(store.get(ds_id), payload.get("cfg") or {}, payload.get("cols") or [], *_xr(payload))


@app.post("/api/dataset/{ds_id}/spectrum")
def dataset_spectrum(ds_id: str, payload: dict = Body(...)):
    """Oscillation finder: amplitude spectrum of one trace for the points in view."""
    return detect.spectrum(store.get(ds_id), payload.get("col") or "", *_xr(payload))


# ------------------------------------------------------------------ tools

@app.post("/api/tools/3d")
def tool_3d(payload: dict = Body(...)):
    return tools.three_d(lib, payload)


@app.post("/api/tools/global-stats")
def tool_global_stats(payload: dict = Body(...)):
    return tools.global_stats(lib, payload)


# ------------------------------------------------------------------ log editor

@app.post("/api/editor/open")
def editor_open(payload: dict = Body(...)):
    return editor.info(editor.open(payload["logId"]))


@app.post("/api/editor/{draft_id}/rows")
def editor_rows(draft_id: str, payload: dict = Body(...)):
    d = editor.get(draft_id)
    return editor.rows(d, int(payload.get("offset") or 0), min(int(payload.get("limit") or 200), 2000),
                       payload.get("filters"), payload.get("sort"))


@app.post("/api/editor/{draft_id}/op")
def editor_op(draft_id: str, payload: dict = Body(...)):
    d = editor.get(draft_id)
    msg = editor.apply(d, payload.get("op", ""), payload)
    return {"message": msg, **editor.info(d)}


@app.post("/api/editor/{draft_id}/commit")
def editor_commit(draft_id: str, payload: dict = Body(...)):
    d = editor.get(draft_id)
    res = editor.commit(d, payload.get("name"))
    return {**res, **editor.info(d), "library": lib.snapshot()}


@app.get("/api/editor/{draft_id}/csv")
def editor_csv(draft_id: str):
    d = editor.get(draft_id)
    name = lib.get(d.log_id).name
    name = name if name.lower().endswith(".csv") else f"{name}.csv"
    return _download(editor.export_df(d).to_csv(index=False).encode(), name, "text/csv")


# ------------------------------------------------------------------ evidence

@app.post("/api/evidence")
async def upload_evidence(files: list[UploadFile] = File(...)):
    return {"items": [wsmod.store_evidence(f.filename or "image.png", await f.read()) for f in files]}


@app.get("/api/evidence/{file}")
def get_evidence(file: str):
    p = wsmod.evidence_path(file)
    if not p.exists():
        raise HTTPException(404, "Image not found.")
    return FileResponse(p, headers={"Cache-Control": "max-age=31536000, immutable"})


@app.delete("/api/evidence/{file}")
def delete_evidence(file: str):
    wsmod.evidence_path(file).unlink(missing_ok=True)
    return {"ok": True}


# ------------------------------------------------------------------ workspaces

@app.get("/api/workspaces")
def workspaces():
    return wsmod.list_workspaces()


@app.post("/api/workspaces/save")
def workspace_save(payload: dict = Body(...)):
    state = payload.get("state") or {}
    res = wsmod.save_workspace(payload.get("name") or "Untitled", state, lib)
    wsmod.save_session(state, res["name"], res["signature"])
    return res


@app.post("/api/workspaces/load")
def workspace_load(payload: dict = Body(...)):
    res = wsmod.load_workspace(payload["ref"], lib)
    return {**res, "library": lib.snapshot()}


@app.post("/api/workspaces/new")
def workspace_new(payload: dict = Body(...)):
    lib.clear()
    for f in config.SESSION_EVIDENCE.glob("*"):
        f.unlink(missing_ok=True)
    state = payload.get("state") or {}
    wsmod.save_session(state, "Untitled", "")
    return {"state": state, "workspaceName": "Untitled", "library": lib.snapshot()}


@app.post("/api/workspaces/autosave")
def workspace_autosave(payload: dict = Body(...)):
    ts = wsmod.autosave(payload.get("name") or "Untitled", payload.get("state") or {}, lib)
    return {"saved": ts is not None, "timestamp": ts}


@app.post("/api/workspaces/delete")
def workspace_delete(payload: dict = Body(...)):
    wsmod.delete_workspace(payload["ref"])
    return wsmod.list_workspaces()


@app.post("/api/workspaces/import")
async def workspace_import(file: UploadFile = File(...)):
    raw = await file.read()
    res = wsmod.import_upload(file.filename or "workspace.epeak", raw, lib)
    return {**res, "library": lib.snapshot()}


@app.get("/api/workspaces/download")
def workspace_download(ref: str):
    kind, _, fname = ref.partition("/")
    base = config.AUTOSAVE_DIR if kind == "autosave" else config.WORKSPACE_DIR
    p = base / os.path.basename(fname)
    if kind != "saved" or not p.exists():
        raise HTTPException(404, "Only saved workspaces can be downloaded.")
    return _download(p.read_bytes(), p.name, "application/zip")


@app.post("/api/workspaces/signature")
def workspace_signature(payload: dict = Body(...)):
    return {"signature": wsmod.state_signature(payload.get("state") or {}, lib)}


# ------------------------------------------------------------------ report export

@app.post("/api/export/report")
def export_report(payload: dict = Body(...)):
    data, name, mime = exmod.build_report(lib, store, payload.get("items") or [])
    return _download(data, name, mime)


# ------------------------------------------------------------------ frontend

if config.FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets", check_dir=False), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        target = (config.FRONTEND_DIST / path).resolve()
        if path and target.is_file() and config.FRONTEND_DIST.resolve() in target.parents:
            return FileResponse(target)
        index = config.FRONTEND_DIST / "index.html"
        if not index.exists():
            return Response("Frontend not built. Run `npm run build` in /frontend.", media_type="text/plain")
        # tag the script and stylesheet with the build time so the browser never runs an old interface
        app_js = config.FRONTEND_DIST / "assets" / "app.js"
        stamp = app_js.stat().st_mtime_ns if app_js.exists() else 0
        html = re.sub(r'(/assets/[\w.-]+\.(?:js|css))"', rf'\1?v={stamp}"', index.read_text(encoding="utf-8"))
        return HTMLResponse(html, headers={"Cache-Control": "no-cache"})
