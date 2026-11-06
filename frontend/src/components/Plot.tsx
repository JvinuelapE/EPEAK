import { useEffect, useRef } from "react";
import Plotly from "plotly.js-dist-min";

export interface PlotProps {
  data: Plotly.Data[];
  layout: Partial<Plotly.Layout>;
  config?: Partial<Plotly.Config>;
  onRelayout?: (e: Plotly.PlotRelayoutEvent) => void;
  onClick?: (e: Plotly.PlotMouseEvent) => void;
  onDoubleClick?: () => void;
  className?: string;
  height?: number | string;
  exportName?: string;
}

const BASE_CONFIG: Partial<Plotly.Config> = {
  displaylogo: false,
  responsive: true,
  scrollZoom: false,
  showTips: false,
  modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d", "toggleSpikelines"],
};

/** Thin, efficient Plotly wrapper: Plotly.react on change, resize-aware, events via refs. */
export function Plot({ data, layout, config, onRelayout, onClick, onDoubleClick, className, height = 400, exportName }: PlotProps) {
  const el = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onRelayout, onClick, onDoubleClick });
  handlers.current = { onRelayout, onClick, onDoubleClick };
  const ready = useRef(false);

  useEffect(() => {
    const div = el.current as unknown as Plotly.PlotlyHTMLElement | null;
    if (!div) return;
    const cfg = {
      ...BASE_CONFIG,
      toImageButtonOptions: { format: "png", scale: 2, filename: exportName ?? "epeak-plot" },
      ...config,
    } as Plotly.Config;
    if (!ready.current) {
      Plotly.newPlot(div, data, layout, cfg).then(() => {
        ready.current = true;
        div.on("plotly_relayout", (e) => handlers.current.onRelayout?.(e));
        div.on("plotly_click", (e) => handlers.current.onClick?.(e));
        div.on("plotly_doubleclick", () => {
          handlers.current.onDoubleClick?.();
          return false;
        });
      });
    } else {
      Plotly.react(div, data, layout, cfg);
    }
  }, [data, layout, config, exportName]);

  useEffect(() => {
    const div = el.current;
    if (!div) return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (ready.current && div.offsetParent !== null) Plotly.Plots.resize(div);
      });
    });
    ro.observe(div);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
      Plotly.purge(div);
      ready.current = false;
    };
  }, []);

  return <div ref={el} className={className} style={{ width: "100%", height }} />;
}

export async function figureToPng(data: Plotly.Data[], layout: Partial<Plotly.Layout>, width = 1100, height = 520): Promise<string> {
  const div = document.createElement("div");
  div.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;`;
  document.body.appendChild(div);
  try {
    await Plotly.newPlot(div, data, { ...layout, width, height }, { staticPlot: true });
    return await Plotly.toImage(div, { format: "png", width, height, scale: 2 });
  } finally {
    Plotly.purge(div);
    div.remove();
  }
}
