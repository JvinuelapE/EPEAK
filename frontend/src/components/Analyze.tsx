import { Fragment, useEffect, useState } from "react";
import { api } from "../api";
import { buildHistogram } from "../figures";
import { useApp } from "../store";
import type { AnalyticsResponse, Range } from "../types";
import { Plot } from "./Plot";
import { Callout, Drawer, Spinner } from "./ui";

function CorrMatrix({ title, cols, m }: { title: string; cols: string[]; m: (number | null)[][] }) {
  return (
    <section className="analyze-sec">
      <h4>{title}</h4>
      <div className="corr" style={{ gridTemplateColumns: `minmax(90px, auto) repeat(${cols.length}, minmax(54px, 1fr))` }}>
        <span />
        {cols.map((c) => <span key={c} className="corr-head" title={c}>{c}</span>)}
        {m.map((row, i) => (
          <Fragment key={i}>
            <span className="corr-head corr-row" title={cols[i]}>{cols[i]}</span>
            {row.map((v, j) => {
              const a = v == null ? 0 : Math.abs(v);
              const bg = v == null ? "transparent" : v >= 0 ? `rgba(46,158,91,${a * 0.75})` : `rgba(209,73,91,${a * 0.75})`;
              return <span key={`${i}-${j}`} className="corr-cell" style={{ background: bg, color: a > 0.55 ? "#fff" : undefined }}>{v == null ? "—" : v.toFixed(2)}</span>;
            })}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

/** Correlations and distributions for whatever is visible in the plot. */
export function AnalyzeDrawer({ dsId, cols, range, title, onClose }: { dsId: string; cols: string[]; range: Range; title: string; onClose: () => void }) {
  const theme = useApp((s) => s.theme);
  const [res, setRes] = useState<AnalyticsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setRes(null);
    api.analytics(dsId, { cols, x0: range?.[0], x1: range?.[1] }).then(setRes).catch((e) => setErr(e.message));
  }, [dsId, JSON.stringify(cols), JSON.stringify(range)]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Drawer title={`Analysis · ${title}`} onClose={onClose} width={520}>
      <p className="muted small">Computed on the points currently in view{range ? "" : " (whole dataset)"}.</p>
      {err && <Callout kind="error">{err}</Callout>}
      {!res && !err && <div className="center pad"><Spinner size={20} /></div>}
      {res && (
        <>
          {res.pearson && <CorrMatrix title="Pearson correlation (linear)" cols={res.columns} m={res.pearson} />}
          {res.spearman && <CorrMatrix title="Spearman correlation (monotonic)" cols={res.columns} m={res.spearman} />}
          {res.columns.length < 2 && <Callout>Add a second variable to see correlations.</Callout>}
          <section className="analyze-sec">
            <h4>Distributions</h4>
            {Object.entries(res.histograms).map(([c, h], i) => {
              const f = buildHistogram(c, h, theme, ["#1A9BB5", "#C9970C", "#C2399B", "#2E9E5B"][i % 4]);
              return <div key={c} className="hist"><Plot data={f.data} layout={f.layout} height={190} config={{ displayModeBar: false }} /></div>;
            })}
          </section>
        </>
      )}
    </Drawer>
  );
}
