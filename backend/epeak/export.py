"""Report Studio export: one Excel workbook (plus optional CSVs bundled in a zip)."""
from __future__ import annotations

import base64
import io
import zipfile

import numpy as np
import pandas as pd

from . import detect
from .datasets import DatasetStore
from .library import Library
from .parsing import format_axis_array
from .tools import stats_table
from .workspace import evidence_path

STATUS_LABEL = {"testing": "Testing", "validated": "Validated", "rejected": "Rejected"}


class ExportError(ValueError):
    pass


def _stats_frame(table: dict) -> pd.DataFrame:
    metrics = table.get("metrics", [])
    data = {"Metric": metrics}
    for col, s in (table.get("stats") or {}).items():
        data[col] = [None if s is None else s.get(m) for m in metrics]
    return pd.DataFrame(data)


def _dataset_frame(store: DatasetStore, item: dict) -> pd.DataFrame:
    ds = store.build(item["datasetKind"], item["cfg"])
    cols = item.get("cols") or ds.table_cols
    keep = [c for c in dict.fromkeys(cols) if c in ds.df.columns]
    df = ds.df[keep].copy() if keep else ds.df.drop(columns=["_rid"]).copy()
    if ds.x_kind in ("date", "time") and ds.x_label not in keep:
        df.insert(0, ds.x_label, format_axis_array(ds.x, ds.x_kind))
    elif ds.x_kind in ("date", "time"):
        df[ds.x_label] = format_axis_array(ds.x, ds.x_kind)
    return df


# ------------------------------------------------------------------ limits / events / steady states

def _xfmt(ds, v):
    """An x value as the report shows it: a timestamp on date/time axes, a number otherwise."""
    if v is None:
        return None
    if ds.x_kind in ("date", "time"):
        return format_axis_array(np.array([float(v)]), ds.x_kind)[0]
    return round(float(v), 4)


def _range_text(ds, rng) -> str:
    if not rng:
        return "Whole plot"
    return f"{_xfmt(ds, rng[0])} → {_xfmt(ds, rng[1])}"


def _limits_tables(store: DatasetStore, item: dict) -> list[tuple[str | None, pd.DataFrame]]:
    ds = store.build(item["datasetKind"], item["cfg"])
    rows = []
    for p in item.get("plots") or []:
        rng = p.get("range") or [None, None]
        names = {c["col"]: c.get("name") or c["col"] for c in p.get("checks") or []}
        res = detect.limit_check(ds, p.get("checks") or [], rng[0], rng[1])["results"]
        for col, r in res.items():
            verdict = "No data" if r["pass"] is None else ("PASS" if r["pass"] else "FAIL")
            rows.append({"Plot": p.get("title", ""), "Variable": names.get(col, col), "Lower limit": r["lo"],
                         "Upper limit": r["hi"], "Range": _range_text(ds, p.get("range")), "Samples": r["n"],
                         "Out of limits": r["out"], "% out": None if r["pct"] is None else round(r["pct"], 4),
                         "Min": r["min"], "Max": r["max"], "Worst excess": r["worst"], "Result": verdict})
    if not rows:
        return [(None, pd.DataFrame({"Note": ["No limits are set for the variables in this tab."]}))]
    return [(None, pd.DataFrame(rows))]


def _events_tables(store: DatasetStore, item: dict) -> list[tuple[str | None, pd.DataFrame]]:
    ds = store.build(item["datasetKind"], item["cfg"])
    unit = "s" if ds.x_kind in ("date", "time", "elapsed") else "x units"
    summary, detail = [], []
    for p in item.get("plots") or []:
        rules = [r for r in p.get("rules") or [] if r.get("enabled", True)]
        rng = p.get("range") or [None, None]
        res = detect.find_events(ds, rules, rng[0], rng[1])["rules"]
        for k, r in enumerate(rules):
            out = res.get(str(r.get("id") or k)) or {}
            label = f"{r.get('name') or r.get('col')}: {r.get('label') or r.get('kind')}"
            summary.append({"Plot": p.get("title", ""), "Rule": label, "Range": _range_text(ds, p.get("range")),
                            "Events": out.get("count", 0), f"Total duration ({unit})": round(out.get("totalDur", 0.0), 4),
                            "Note": out.get("error") or ("Only the first 2000 events are listed." if out.get("truncated") else "")})
            for i, e in enumerate(out.get("events") or [], start=1):
                detail.append({"Plot": p.get("title", ""), "Rule": label, "#": i, "Start": _xfmt(ds, e["start"]),
                               "End": _xfmt(ds, e["end"]), f"Duration ({unit})": round(e["dur"], 4),
                               "Peak / change": e.get("peak")})
    if not summary:
        return [(None, pd.DataFrame({"Note": ["No event rules are set up in this tab."]}))]
    tables = [("Summary", pd.DataFrame(summary))]
    tables.append(("Events", pd.DataFrame(detail) if detail else pd.DataFrame({"Note": ["No events found."]})))
    return tables


def _steady_tables(store: DatasetStore, item: dict) -> list[tuple[str | None, pd.DataFrame]]:
    ds = store.build(item["datasetKind"], item["cfg"])
    unit = "s" if ds.x_kind in ("date", "time", "elapsed") else "x units"
    tables = []
    for p in item.get("plots") or []:
        cfg = p.get("steady") or {}
        if not cfg.get("col"):
            continue
        names = p.get("names") or {}
        rng = p.get("range") or [None, None]
        res = detect.find_steady(ds, cfg, p.get("cols") or [], rng[0], rng[1])
        rows = []
        for i, pl in enumerate(res["plateaus"], start=1):
            row = {"#": i, "Start": _xfmt(ds, pl["start"]), "End": _xfmt(ds, pl["end"]), f"Duration ({unit})": round(pl["dur"], 4)}
            for col, s in pl["stats"].items():
                n = names.get(col, col)
                row[f"{n} mean"] = s["mean"]
                row[f"{n} σ"] = s["std"]
            rows.append(row)
        caption = (f"{p.get('title', '')}: steady states of {names.get(cfg['col'], cfg['col'])} "
                   f"(σ ≤ {cfg.get('tol')}{' %' if cfg.get('tolMode') == 'pct' else ''} over {cfg.get('window')} {unit}, "
                   f"at least {cfg.get('minDur')} {unit}; {_range_text(ds, p.get('range'))})")
        tables.append((caption, pd.DataFrame(rows) if rows else pd.DataFrame({"Note": ["No steady states found."]})))
    return tables or [(None, pd.DataFrame({"Note": ["Steady-state detection isn't set up in this tab."]}))]


def item_tables(lib: Library, store: DatasetStore, item: dict) -> list[tuple[str | None, pd.DataFrame]]:
    """One or more (caption, table) pairs for an item; most items are a single table."""
    kind = item.get("kind")
    if kind == "dataset_limits":
        return _limits_tables(store, item)
    if kind == "dataset_events":
        return _events_tables(store, item)
    if kind == "dataset_steady":
        return _steady_tables(store, item)
    df = item_frame(lib, store, item)
    return [] if df is None else [(None, df)]


def item_frame(lib: Library, store: DatasetStore, item: dict) -> pd.DataFrame | None:
    kind = item.get("kind")
    if kind == "raw_log":
        return lib.get(item["logId"]).df
    if kind == "dataset":
        return _dataset_frame(store, item)
    if kind == "dataset_stats":
        ds = store.build(item["datasetKind"], item["cfg"])
        cols = item.get("cols") or ds.columns
        return _stats_frame(stats_table(ds.df, [c for c in cols if c in ds.df.columns]))
    if kind == "stats":
        return _stats_frame(item["table"])
    if kind == "table":
        return pd.DataFrame(item.get("rows", []), columns=item.get("columns"))
    if kind == "ledger":
        return pd.DataFrame([{"Date": r.get("date", ""), "Log ref": r.get("logRef", ""),
                              "Hypothesis / observation": r.get("hypothesis", ""),
                              "Status": STATUS_LABEL.get(r.get("status"), r.get("status", "")),
                              "Conclusion": r.get("conclusion", "")} for r in item.get("rows", [])])
    if kind in ("dataset_limits", "dataset_events", "dataset_steady"):
        tables = item_tables(lib, store, item)
        return tables[-1][1] if tables else None  # CSV: the detailed table
    return None


def build_report(lib: Library, store: DatasetStore, items: list[dict]) -> tuple[bytes, str, str]:
    if not items:
        raise ExportError("The staging area is empty. Add items first.")
    excel_items = [i for i in items if i.get("format", "excel") == "excel"]
    csv_items = [i for i in items if i.get("format") == "csv"]

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="xlsxwriter") as writer:
        wb = writer.book
        fmt_title = wb.add_format({"bold": True, "font_size": 13, "font_color": "#1F3D2E", "bottom": 2,
                                   "bottom_color": "#1F3D2E"})
        fmt_head = wb.add_format({"bold": True, "bg_color": "#1F3D2E", "font_color": "white"})
        fmt_caption = wb.add_format({"bold": True, "italic": True, "font_color": "#4B5B52"})
        fmt_note = wb.add_format({"text_wrap": True, "valign": "top", "bg_color": "#FFF8E1", "border": 1,
                                  "border_color": "#E0C46C"})
        fmt_pass = wb.add_format({"bold": True, "font_color": "#1E6B3C", "bg_color": "#DFF3E6"})
        fmt_fail = wb.add_format({"bold": True, "font_color": "#9C1C2B", "bg_color": "#FBE3E6"})
        sheets: dict[str, list[dict]] = {}
        for it in excel_items:
            name = (it.get("sheet") or "Report").strip()[:31] or "Report"
            for ch in "[]:*?/\\":
                name = name.replace(ch, "-")
            sheets.setdefault(name, []).append(it)
        if not sheets:
            ws = wb.add_worksheet("Report")
            ws.write(0, 0, "All items were exported as separate CSV files.")
        for sheet, its in sheets.items():
            ws = wb.add_worksheet(sheet)
            writer.sheets[sheet] = ws
            ws.set_column(0, 12, 18)
            row = 0
            for it in its:
                ws.merge_range(row, 0, row, 7, f"{it.get('title', 'Item')} — {it.get('source', '')}", fmt_title)
                row += 2
                kind = it.get("kind")
                if kind == "images":
                    images = it.get("images") or []
                    if not images:
                        ws.write(row, 0, "No graphs to export for this tab.")
                        row += 2
                    for img in images:
                        ws.write(row, 0, img.get("name", "Graph"), fmt_head)
                        row += 1
                        data = base64.b64decode(img["png"].split(",", 1)[-1])
                        ws.insert_image(row, 0, f"{img.get('name', 'graph')}.png",
                                        {"image_data": io.BytesIO(data), "x_scale": 0.5, "y_scale": 0.5,
                                         "x_offset": 6, "y_offset": 6, "object_position": 1})
                        row += int(img.get("rows", 24))
                elif kind == "evidence":
                    for ev in it.get("evidence") or []:
                        p = evidence_path(ev.get("file", ""))
                        if not p.exists():
                            continue
                        ws.write(row, 0, ev.get("name", "Evidence"), fmt_head)
                        row += 1
                        scale = 0.5
                        w = ev.get("width") or 1200
                        if w * scale > 900:
                            scale = 900 / w
                        ws.insert_image(row, 0, p.name, {"image_data": io.BytesIO(p.read_bytes()),
                                                         "x_scale": scale, "y_scale": scale,
                                                         "x_offset": 6, "y_offset": 6, "object_position": 1})
                        h = (ev.get("height") or 800) * scale
                        row += int(h / 20) + 3
                elif kind == "text":
                    lines = [ln for ln in it.get("lines", []) if ln and ln.strip()]
                    if not lines:
                        ws.write(row, 0, "No notes for this tab.")
                        row += 2
                    for ln in lines:
                        ws.merge_range(row, 0, row + 2, 7, ln, fmt_note)
                        row += 4
                else:
                    tables = item_tables(lib, store, it)
                    if not tables or all(df.empty for _, df in tables):
                        ws.write(row, 0, "No data.")
                        row += 2
                        continue
                    for caption, df in tables:
                        if caption:
                            ws.write(row, 0, caption, fmt_caption)
                            row += 1
                        df.to_excel(writer, sheet_name=sheet, startrow=row, index=False)
                        for j, c in enumerate(df.columns):
                            ws.write(row, j, str(c), fmt_head)
                        if "Result" in df.columns and len(df):
                            j = list(df.columns).index("Result")
                            ws.conditional_format(row + 1, j, row + len(df), j,
                                                  {"type": "cell", "criteria": "==", "value": '"PASS"', "format": fmt_pass})
                            ws.conditional_format(row + 1, j, row + len(df), j,
                                                  {"type": "cell", "criteria": "==", "value": '"FAIL"', "format": fmt_fail})
                        row += len(df) + 3
    xlsx = buf.getvalue()

    if not csv_items:
        return xlsx, "EPEAK_Report.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    zbuf = io.BytesIO()
    with zipfile.ZipFile(zbuf, "w", zipfile.ZIP_DEFLATED) as z:
        if excel_items:
            z.writestr("EPEAK_Report.xlsx", xlsx)
        used = set()
        for it in csv_items:
            df = item_frame(lib, store, it)
            if df is None:
                continue
            name = (it.get("sheet") or "data").strip() or "data"
            if not name.lower().endswith(".csv"):
                name += ".csv"
            base, k = name[:-4], 1
            while name in used:
                k += 1
                name = f"{base}_{k}.csv"
            used.add(name)
            z.writestr(name, df.to_csv(index=False))
    return zbuf.getvalue(), "EPEAK_Export.zip", "application/zip"


def logs_archive(lib: Library, ids: list[str]) -> tuple[bytes, str, str]:
    entries = [lib.get(i) for i in ids]
    if len(entries) == 1:
        e = entries[0]
        name = e.name if e.name.lower().endswith(".csv") else f"{e.name}.csv"
        return e.df.to_csv(index=False).encode(), name, "text/csv"
    zbuf = io.BytesIO()
    with zipfile.ZipFile(zbuf, "w", zipfile.ZIP_DEFLATED) as z:
        for e in entries:
            name = e.name if e.name.lower().endswith(".csv") else f"{e.name}.csv"
            z.writestr(name, e.df.to_csv(index=False))
    return zbuf.getvalue(), "EPEAK_Logs.zip", "application/zip"
