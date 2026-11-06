// Small building blocks for the user guide: inline buttons with their real icons, links between
// pages, "Show me" buttons that start a guided tour, tips and button reference tables.
import { createContext, useContext, type ReactNode } from "react";
import type { IconType } from "react-icons";
import { LuArrowRight, LuLightbulb, LuPlay, LuTriangleAlert } from "react-icons/lu";
import { api } from "../../api";
import { cx, toast, toastError } from "../../components/ui";
import { useApp } from "../../store";
import { startTour } from "../Tour";

/** Lets any piece of the guide open another page ("plots", or "tools#calibration" for a heading on it). */
export const GuideNav = createContext<{ go: (to: string) => void }>({ go: () => undefined });

/** A link to another page of the guide. */
export function Go({ to, children }: { to: string; children: ReactNode }) {
  const { go } = useContext(GuideNav);
  return (
    <button type="button" className="link guide-go" onClick={() => go(to)}>
      {children}<LuArrowRight size={11} />
    </button>
  );
}

/** A button as it looks in E-PEAK: the same icon, with its name. Icon only when there is no label. */
export function B({ i: Icon, children, tone }: { i?: IconType; children?: ReactNode; tone?: "primary" | "dark" }) {
  return (
    <span className={cx("guide-btn", !children && "is-icon", tone === "primary" && "is-primary", tone === "dark" && "is-dark")}>
      {Icon && <Icon size={13} />}
      {children !== undefined && <span>{children}</span>}
    </span>
  );
}

/** A keyboard key or shortcut. */
export const K = ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>;

export function Tip({ children, kind = "tip" }: { children: ReactNode; kind?: "tip" | "warn" }) {
  const Icon = kind === "warn" ? LuTriangleAlert : LuLightbulb;
  return (
    <div className={cx("guide-tip", kind === "warn" && "is-warn")}>
      <Icon size={15} />
      <div>{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------ "Show me": guided tours
/** Where each demo tour lives in the tutorial, for the hint shown when the tutorial opens. */
const TOUR_PLACE: Record<string, string> = {
  "demo-first": "the “1 · First look” tab",
  "demo-calib": "the “2 · Calibration” tab",
  "demo-problems": "the “3 · Finding problems” tab",
  "demo-sync": "the “4 · Comparing runs” tab",
  "demo-append": "the “5 · Stitching logs” tab",
  "demo-osc": "the “6 · Oscillations” tab",
  "demo-stats": "the “7 · Statistics” tab",
  "demo-3d": "the “8 · 3D map” tab",
  "demo-wave": "the “9 · Waveform” tab",
  "view:hub": "the Research hub",
  "view:editor": "the Log editor",
  "view:report": "the Report studio",
};

/** Tours that also work in a normal workspace (they only point at the app itself, not at demo data). */
const LOCAL_TOURS = new Set(["overview"]);

/**
 * Starts the guided tour for a feature. In the tutorial it runs right away. In a normal E-PEAK the feature
 * tours need the demo workspace, so the tutorial is opened and the hint says where to press "Tour this tab".
 */
export function ShowMe({ tour, children }: { tour: string; children?: ReactNode }) {
  const tutorial = useApp((s) => s.tutorial);
  const here = tutorial || LOCAL_TOURS.has(tour);
  const run = async () => {
    if (here) {
      startTour(tutorial && tour === "overview" ? "tutorial" : tour);
      return;
    }
    try {
      await api.tutorialOpen();
      const page = tour.startsWith("view:") ? "page" : "tab";
      toast(`The tutorial is opening in a new browser tab (the first time takes a few seconds). There, go to ${TOUR_PLACE[tour] ?? "the matching tab"} and press “Tour this ${page}” in the bar at the top.`, "info", 10000);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <button type="button" className="guide-show" onClick={run}
      title={here ? "Start a guided tour that shows this in the app" : "Opens the tutorial (demo logs, separate from your work), where a guided tour shows this"}>
      <LuPlay size={12} />
      <span>{children ?? (here ? "Show me" : "Show me in the tutorial")}</span>
    </button>
  );
}

// ------------------------------------------------------------------ button reference
export type BtnRow = [IconType | null, ReactNode, ReactNode];

/** A table of buttons: the real icon, its name and what it does. */
export function ButtonTable({ rows, dark }: { rows: BtnRow[]; dark?: boolean }) {
  return (
    <table className="guide-btable">
      <tbody>
        {rows.map(([Icon, name, what], k) => (
          <tr key={k}>
            <td className="gb-icon">
              {Icon && <span className={cx("guide-iconbtn", dark && "is-dark")}><Icon size={16} /></span>}
            </td>
            <th>{name}</th>
            <td>{what}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
