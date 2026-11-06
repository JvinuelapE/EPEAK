// Version history shown in Help → What's new and in the user guide.
//
// Versions go 2.0, 2.1, 2.2… (one step per update). For every new version:
//   1. Add an entry at the TOP of RELEASES below (newest first).
//   2. Set the same number in backend/epeak/__init__.py (__version__ = "2.1.0"),
//      frontend/package.json ("version": "2.1.0") and packaging/version_info.txt
//      (filevers=(2, 1, 0, 0), prodvers=(2, 1, 0, 0), FileVersion/ProductVersion "2.1.0").
// The Help menu label and the guide read the current version from RELEASES[0].
import type { ReactNode } from "react";

export interface Release {
  /** "2.1" — major.minor, as users see it */
  version: string;
  /** when it was released, e.g. "November 2026" */
  date: string;
  /** one sentence: what this version is about */
  summary: string;
  groups: { title: string; items: ReactNode[] }[];
}

export const RELEASES: Release[] = [
  // ---------------------------------------------------------------- template for the next version
  // {
  //   version: "2.1",
  //   date: "Month 2026",
  //   summary: "One sentence about this update.",
  //   groups: [
  //     { title: "New", items: ["…"] },
  //     { title: "Improved", items: ["…"] },
  //     { title: "Fixed", items: ["…"] },
  //   ],
  // },
  {
    version: "2.0",
    date: "November 2026",
    summary: "A rebuild of E-PEAK: a FastAPI backend with a React interface. Every v1 feature is kept.",
    groups: [
      {
        title: "Speed and scale",
        items: [
          "Logs are parsed once and cached; nothing re-reads CSV on each interaction.",
          "Plots, tables and statistics fetch only what's visible, so multi-million-row logs stay responsive.",
          "No more \"Process\" buttons: tools update as you configure them.",
        ],
      },
      {
        title: "Interface",
        items: [
          "Drag to reorder tabs and plots, rename tabs inline, duplicate tabs.",
          "Unlimited plots per 2D tab (was 10) and up to ten logs in calibration, time sync and append (was 5), with linked X zoom.",
          "Measurement readouts and marker toggles directly under each plot; resizable plots.",
          "Cursors, limits with pass/fail, event detection, steady states and the oscillation finder.",
          "Undo/redo for configuration, command palette, keyboard shortcuts, dark theme, global drag and drop.",
          "Style changes apply live, add line width and drawing mode, and are now consistent everywhere (point removal no longer drops custom styles).",
          "A tutorial with demo logs and guided tours, and a user guide with pictures, short clips, search and “Show me” tours.",
        ],
      },
      {
        title: "Data safety",
        items: [
          "The session is persisted continuously; a server restart or browser refresh no longer loses work (the old \"amnesia\" problem).",
          "Workspaces are portable .epeak files instead of pickles; old .pkl files are converted on open.",
          "The math engine no longer uses eval.",
          "Logs are referenced by ID, so renaming a log doesn't break tabs that use it.",
        ],
      },
      {
        title: "Fixes",
        items: [
          "The waveform link to a 2D plot tab now follows that tab's log reliably.",
          "PicoLog files with a blank first header cell are read correctly.",
          "Markers, point removals and zoom ranges are saved with the workspace.",
          "Waveform peaks use each shape's true crest factor, so the RMS you enter is the RMS drawn.",
        ],
      },
    ],
  },
];

/** The version this build is, as users see it ("2.0"). */
export const CURRENT_VERSION = RELEASES[0].version;

/** One release in the version history. */
export function ReleaseNotes({ release, current }: { release: Release; current?: boolean }) {
  return (
    <section className="release" id={`doc-v${release.version.replace(".", "-")}`}>
      <header className="release-head">
        <h4>Version {release.version}</h4>
        {current && <span className="release-tag">You're using this version</span>}
        <span className="muted small">{release.date}</span>
      </header>
      <p>{release.summary}</p>
      {release.groups.map((g) => (
        <div key={g.title} className="release-group">
          <b>{g.title}</b>
          <ul>{g.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
        </div>
      ))}
    </section>
  );
}
