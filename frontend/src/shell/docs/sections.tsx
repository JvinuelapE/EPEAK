// The pages of the user guide. Plain JSX with the real icons (B), pictures and clips (art.tsx),
// "Show me" tour buttons and links between pages (kit.tsx). Search reads the text of these pages.
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import {
  LuArrowDown, LuArrowDownUp, LuArrowUp, LuBookOpen, LuBox, LuCalculator, LuChartColumnBig, LuChartLine,
  LuChevronsDown, LuChevronsUp, LuCircleHelp, LuClock, LuColumns3, LuCommand, LuCompass, LuCopyPlus,
  LuCrosshair, LuDatabase, LuDownload, LuEllipsis, LuEqual, LuFileSpreadsheet, LuFilter, LuFilterX, LuGitMerge, LuGraduationCap,
  LuGripVertical, LuHistory, LuImagePlus, LuLightbulb, LuLink2, LuListPlus, LuMapPin, LuMessageSquareText, LuMoon, LuMoveVertical,
  LuPalette, LuPanelLeftClose, LuPanelLeftOpen, LuPlus, LuRedo2, LuRotateCcw, LuRuler, LuSave, LuScale, LuScan, LuSheet,
  LuShieldCheck, LuTable2, LuTimer, LuTrash2, LuUndo2, LuUpload, LuWaves, LuX, LuZap,
} from "react-icons/lu";
import { HowAll } from "../HowItWorks";
import {
  CursorClip, DropClip, FilterClip, HowFigure, RemovePointsClip, ReorderClip, ReportClip, SchematicClip, ScreenMap,
  ToolCards, ToolHead, ZoomClip,
} from "./art";
import { B, ButtonTable, Go, K, ShowMe, Tip, type BtnRow } from "./kit";

export interface Section {
  id: string;
  group: (typeof GROUPS)[number];
  title: string;
  icon: IconType;
  /** a guided tour that shows this page's subject */
  tour?: string;
  /** extra words for search (synonyms, things only shown in pictures) */
  keywords?: string;
  body: ReactNode;
}

export const GROUPS = ["Start here", "How do I…", "Reference", "Background"] as const;

// ------------------------------------------------------------------ shared tables
const PLOT_BUTTONS: BtnRow[] = [
  [LuScan, "Reset zoom", "Back to the whole plot (same as double-clicking it)."],
  [LuMoveVertical, "Rescale Y", "Fit the Y axes to the points in view."],
  [LuRuler, "Cursors", <>Two cursors, A and B, for Δt, ΔY and the slope between two points. <Go to="plots">Working with plots</Go></>],
  [LuShieldCheck, "Limits", <>Lower and upper limits with PASS/FAIL for the points in view. <Go to="checks">Limits</Go></>],
  [LuZap, "Events", <>Thresholds, limits, steps, spikes and dropouts over the whole plot. <Go to="checks">Events</Go></>],
  [LuEqual, "Steady states", <>Finds the stable plateaus (for example each load step). <Go to="checks">Steady states</Go></>],
  [LuWaves, "Oscillation finder", <>Spectrum of a trace: slow repeating patterns and their period. <Go to="checks">Oscillations</Go></>],
  [LuChartColumnBig, "Analyse", "Correlations and histograms for the points in view."],
  [LuPalette, "Style", "Titles, axis labels, legend, and each trace's name, colour, line and width."],
  [LuSheet, "Data", "The points in view as a table; select rows and press Delete to remove points."],
  [LuMessageSquareText, "Notes", "Observations for this plot; they can go into the report."],
];

const PAGES: [IconType, string, string, string][] = [
  [LuBookOpen, "Research hub", "Ctrl+1", "The investigation ledger and the evidence board (photos, schematics)."],
  [LuChartLine, "Analysis", "Ctrl+2", "All analysis tools, one tab each."],
  [LuTable2, "Log editor", "Ctrl+3", "Clean and reshape logs in an undoable draft."],
  [LuFileSpreadsheet, "Report studio", "Ctrl+4", "Choose content and export one Excel workbook."],
  [LuDatabase, "Logs", "Ctrl+L", "The log library: rename, categorise, download or delete logs."],
];

// ------------------------------------------------------------------ the pages
export const SECTIONS: Section[] = [
  // ================================================================ start here
  {
    id: "start", group: "Start here", title: "Getting started", icon: LuCompass, tour: "overview",
    keywords: "first steps overview introduction install run exe launch data folder",
    body: (<>
      <p>E-PEAK runs on your computer. Opening <code>E-PEAK.exe</code> (or <code>python run.py</code>) starts it and opens this page in the browser. Opening it again while it is running just opens another tab. Use File → Quit to stop it.</p>
      <ScreenMap />
      <h4>Four steps</h4>
      <ol className="guide-steps">
        <li><b>Add logs.</b> Drop CSV files anywhere in the window, or use <B i={LuUpload}>Upload logs</B> in the Data menu (<K>Ctrl+U</K>). A file with the same name replaces the existing log, and every tab using it updates.</li>
        <li><b>Open a tool.</b> In Analysis, press <B i={LuPlus}>New analysis</B> and pick a tool. Tools update as you set them up; there is no Process button.</li>
        <li><b>Record what you find</b> in the <B i={LuBookOpen}>Research hub</B>, and <b>export</b> it from the <B i={LuFileSpreadsheet}>Report studio</B>.</li>
        <li><b>Save</b> the workspace (<K>Ctrl+S</K>). Your session also survives restarts, and an autosave snapshot is taken every 2 minutes while there are changes.</li>
      </ol>
      <DropClip />
      <h4>Where things are kept</h4>
      <p>Your data is kept in <code>%LOCALAPPDATA%\E-PEAK</code> for the .exe (or <code>epeak_data</code> next to <code>run.py</code>). File → <B>Show workspaces folder</B> opens it.</p>
      <h4>Log formats</h4>
      <p>Comma, semicolon or tab separated text. Metadata lines starting with <code>#</code> (PPA exports) and title lines above the header are skipped automatically. A blank first header cell holding times (PicoLog) becomes <code>Time</code>. Time columns can be full timestamps (<code>2026-10-07 16:36:01.869</code>) or clock times (<code>14:46:16.768</code>, <code>00:01:05</code>); clocks that pass midnight continue into the next day.</p>
      <Tip>New to E-PEAK? Help → <B i={LuGraduationCap}>Open the tutorial</B> starts a demo workspace with built-in logs. Guided tours there show every feature on real-looking data, and nothing you do touches your own work.</Tip>
    </>),
  },
  {
    id: "buttons", group: "Start here", title: "What does this button do?", icon: LuCircleHelp,
    keywords: "icons toolbar legend reference symbols meaning",
    body: (<>
      <p>Every button in E-PEAK, with the icon you see on screen. Hover over any button in the app to see its name as well.</p>
      <h4>Plot toolbar</h4>
      <p className="muted small">On the right above every plot. A highlighted button means its panel is open; a small yellow dot means the tool is set up on this plot.</p>
      <ButtonTable rows={PLOT_BUTTONS} />
      <p className="muted small">Plotly's own toolbar appears in the top-right corner of a plot when you hover over it; its camera button saves the plot as a PNG.</p>
      <h4>Pages (the rail on the left)</h4>
      <ButtonTable dark rows={PAGES.map(([i, n, k, w]) => [i, <>{n} <K>{k}</K></>, w])} />
      <h4>Top bar</h4>
      <ButtonTable dark rows={[
        [LuUndo2, <>Undo <K>Ctrl+Z</K></>, "Undo the last change to tabs, settings, ledger or report (not log edits, which have their own undo)."],
        [LuRedo2, <>Redo <K>Ctrl+Shift+Z</K></>, "Redo what you undid."],
        [LuCommand, <>Search actions <K>Ctrl+K</K></>, "Type to find any action, tab or log and run it."],
        [LuMoon, "Theme", "Switch between light and dark."],
      ]} />
      <h4>Tabs and plot cards</h4>
      <ButtonTable rows={[
        [LuPlus, "New analysis", "Open another tool in its own tab."],
        [LuEllipsis, "Tab menu", "Rename (F2), duplicate or close a tab. Double-click a tab to rename it, drag to reorder, middle-click to close."],
        [LuX, "Close tab", "Closes the tab and removes its items from the report."],
        [LuPanelLeftClose, "Hide setup panel", <>More room for plots; <B i={LuPanelLeftOpen} /> brings it back.</>],
        [LuGripVertical, "Drag handle", "Drag a plot (or a report item) to a new place."],
        [LuArrowUp, "Move up / down", <>Move a plot one place; <B i={LuArrowDown} /> moves it down.</>],
        [LuTrash2, "Remove plot", "Remove a plot from a 2D plot tab."],
      ]} />
      <h4>Measurement bar</h4>
      <ButtonTable dark rows={[
        [null, <span className="guide-pill">▼ max</span>, "Marks the maximum in view on the plot. ▲ min, – mean and ··· median work the same way."],
        [LuCrosshair, "Centre in view", "Moves both cursors back into the visible range."],
        [null, <span className="lim-badge is-pass">✓</span>, <>The trace is within its limits in view; <span className="lim-badge is-fail">✗</span> means some samples are outside. Click it for details.</>],
      ]} />
      <h4>Log editor</h4>
      <ButtonTable rows={[
        [LuListPlus, "Add blank row at top", "Room to type a missing header, for example."],
        [LuColumns3, "Add column", "A new column with the same value in every row."],
        [LuChevronsUp, "First row → header", "Use the first data row as the column names."],
        [LuChevronsDown, "Header → first row", "Turn the header back into a data row."],
        [LuArrowDownUp, "Reorder columns", "Drag the columns into a new order."],
        [LuClock, "Format as date/time", "Turn the selected column into proper timestamps."],
        [LuTrash2, "Delete columns", "Delete the selected columns."],
        [LuFilter, "Delete rows matching the filters", "Remove every row the filters currently show."],
        [LuFilterX, "Clear filters", "Show all rows again."],
        [LuCalculator, "Math engine", "Add derived variables from formulas."],
        [LuGitMerge, "Combine", "Append another log's rows, or merge its columns by time."],
        [LuUndo2, "Undo last edit", "Step back through the draft."],
        [LuCopyPlus, "Save as new log", "Keep the original and save the result under a new name."],
        [LuSave, "Save changes", "Write the draft back to the log; tabs using it update."],
      ]} />
      <h4>Research hub and Report studio</h4>
      <ButtonTable rows={[
        [LuPlus, "Add entry / Add to report", "A new ledger row, or the ticked items into the report."],
        [LuImagePlus, "Add images", "Photos, schematics and screenshots for the evidence board."],
        [LuMapPin, "Nodes", "Place named measurement points on a schematic."],
        [LuFileSpreadsheet, "Export report", "One Excel workbook, or a zip with CSV files when items are set to CSV."],
        [LuDownload, "Download", "Download logs as CSV."],
      ]} />
    </>),
  },

  // ================================================================ how do I…
  {
    id: "task-look", group: "How do I…", title: "Plot a log and read values", icon: LuChartLine, tour: "demo-first",
    keywords: "plot chart graph view see open values statistics mean max min rms",
    body: (<>
      <ol className="guide-steps">
        <li>Press <B i={LuPlus}>New analysis</B> and choose <b>2D plot</b>.</li>
        <li>In the setup panel, pick the <b>Log file</b>. The time column is chosen for you; change it under <b>X axis</b> if needed.</li>
        <li>Above the plot, choose variables for the <b>Left Y axis</b> and the <b>Right Y axis</b>.</li>
        <li>Drag a box on the plot to zoom. The <b>measurement bar</b> under it shows mean, min, max, peak-to-peak, RMS, σ and median for the points in view.</li>
        <li>Need another view of the same log? <B i={LuPlus}>Add plot</B>, and turn on <b>Link X axes</b> so they zoom together.</li>
      </ol>
      <ZoomClip />
      <Tip>On large logs the plot draws a peak-preserving summary of what's in view. The measurements always use every sample. <Go to="how">Why a plot shows a summary</Go></Tip>
    </>),
  },
  {
    id: "task-measure", group: "How do I…", title: "Measure a ramp, a delay or a period", icon: LuRuler, tour: "demo-first",
    keywords: "cursors delta dt dy slope rate time difference frequency",
    body: (<>
      <ol className="guide-steps">
        <li>Press <B i={LuRuler} /> on the plot. Cursors <b>A</b> (solid) and <b>B</b> (dashed) appear in the visible range.</li>
        <li>Drag them onto the two points, or type exact positions in the cursor bar.</li>
        <li>Read the bar under the plot: the value at A and B for every trace (the nearest real sample), <b>ΔY</b>, the <b>slope</b> ΔY/Δt, <b>Δt</b> and <b>1/Δt</b>.</li>
      </ol>
      <CursorClip />
      <ul>
        <li><b>A ramp rate</b>: put A and B at the start and end of the ramp and read the slope (for example A per second).</li>
        <li><b>A delay</b>: put A on one trace's step and B on the other's, and read Δt.</li>
        <li><b>A period</b>: put A and B one cycle apart; 1/Δt is the frequency.</li>
      </ul>
      <Tip>Cursors are saved with the workspace and appear on exported graphs. <B i={LuCrosshair}>Centre in view</B> brings them back after zooming elsewhere.</Tip>
    </>),
  },
  {
    id: "task-calibrate", group: "How do I…", title: "Check a CT or meter against a reference", icon: LuScale, tour: "demo-calib",
    keywords: "calibration error percentage reference target accuracy ppa diva ct",
    body: (<>
      <ol className="guide-steps">
        <li>Open a <b>Calibration</b> tab. Under <b>Reference</b>, choose the trusted log (for example the PPA), its time column and the variable.</li>
        <li>Under <b>Target 2</b>, choose the log being checked and the same quantity. Add more targets with <B i={LuPlus}>Add target</B> (up to nine).</li>
        <li>Choose the error: <b>%</b>, <b>Absolute</b> or <b>Phase</b>. The errors are drawn dotted on the right axis.</li>
        <li>If the error spikes at every change of level, the logs are slightly out of step: adjust the target's <b>Time offset</b> until the spikes go away.</li>
        <li>Press <B i={LuEqual} /> to get one mean ± σ per load step, and <B i={LuShieldCheck} /> to give the error a limit for PASS/FAIL.</li>
      </ol>
      <HowFigure topic="calibration" />
      <p>Each target sample is matched to the nearest reference sample within ±1 s. <Go to="how">How the error is worked out</Go></p>
    </>),
  },
  {
    id: "task-problems", group: "How do I…", title: "Find over-voltages, dropouts and spikes", icon: LuZap, tour: "demo-problems",
    keywords: "events threshold limit over voltage under dropout gap missing spike glitch step fault",
    body: (<>
      <ol className="guide-steps">
        <li>Set the limits once: Data → <B i={LuShieldCheck}>Limits…</B>, or <B i={LuShieldCheck} /> on any plot with <b>All plots</b> selected. Example: <code>V_RMS(V)</code> from 216.2 to 253.</li>
        <li>Press <B i={LuZap} /> and <B i={LuPlus}>Add rule</B>. Choose the trace and the type: <i>outside limits</i>, <i>above</i>, <i>below</i>, <i>step</i>, <i>spike</i> or <i>dropout</i>.</li>
        <li>Set a <b>Min duration</b> to ignore very short excursions.</li>
        <li>Events are shaded on the plot and listed with start, end, duration and peak. Click one to zoom to it.</li>
      </ol>
      <HowFigure topic="events" />
      <Tip>Found a sensor glitch you want left out of every calculation? Remove those points from the data table. <Go to="task-clean-points">Remove bad points</Go></Tip>
    </>),
  },
  {
    id: "task-clean-points", group: "How do I…", title: "Remove bad points from an analysis", icon: LuSheet,
    keywords: "exclude delete points outliers glitch restore",
    body: (<>
      <ol className="guide-steps">
        <li>Zoom to the bad points, then press <B i={LuSheet} /> to show the data in view.</li>
        <li>Click a row; Shift-click for a range, Ctrl-click to add single rows.</li>
        <li>Press <K>Delete</K>, or use the × at the start of a row.</li>
      </ol>
      <RemovePointsClip />
      <p>The points are left out of this tab's plots, measurements, limits, events and exports. The log itself isn't changed. The setup panel shows how many points are removed; <B i={LuRotateCcw}>Restore all</B> puts them back.</p>
      <p>To delete rows from the log for good, use the <Go to="editor">Log editor</Go>.</p>
    </>),
  },
  {
    id: "task-steady", group: "How do I…", title: "Get one figure per load step", icon: LuEqual, tour: "demo-calib",
    keywords: "steady state plateau load step level table mean sigma",
    body: (<>
      <ol className="guide-steps">
        <li>Press <B i={LuEqual} /> and <b>Find steady states</b>.</li>
        <li>In <b>Detect on</b>, choose the trace that defines the steps (usually the reference or the current).</li>
        <li>Adjust the <b>Window</b>, the <b>σ tolerance</b> and the <b>Min duration</b> until each step is found once.</li>
        <li>The table gives the mean ± σ of every trace on each plateau. Click a row to zoom to it.</li>
      </ol>
      <HowFigure topic="steady" />
      <Tip>Starting values that suit most RMS logs: window 10–20 s, σ ≤ 0.5–1 % of value, min duration 30 s. <Go to="how">Choosing the settings</Go></Tip>
    </>),
  },
  {
    id: "task-compare", group: "How do I…", title: "Compare runs from different days", icon: LuTimer, tour: "demo-sync",
    keywords: "time sync overlay compare days runs offset align elapsed",
    body: (<>
      <ol className="guide-steps">
        <li>Open a <b>Time sync</b> tab and choose two or more logs, each with its time column and the variables to plot.</li>
        <li>Each log starts at 0 s, so the runs share one elapsed-time axis.</li>
        <li>If one run started later, give it a negative <b>Time offset</b> (for example −12 s) until the runs line up.</li>
      </ol>
      <p>Each log gets its own line style. The data table merges all logs on a common timeline.</p>
    </>),
  },
  {
    id: "task-append", group: "How do I…", title: "Join a test split over several files", icon: LuLink2, tour: "demo-append",
    keywords: "append stitch join segments concatenate trim",
    body: (<>
      <ol className="guide-steps">
        <li>Open an <b>Append logs</b> tab and add the segments in order.</li>
        <li>Use the trim boxes to drop dead time at the start or end. Any part of a timestamp works, such as <code>10:00:00</code>.</li>
        <li>Choose what to plot. Segments are joined end to end with a 1 s gap.</li>
      </ol>
    </>),
  },
  {
    id: "task-osc", group: "How do I…", title: "Find a slow oscillation or hunting", icon: LuWaves, tour: "demo-osc",
    keywords: "oscillation fft spectrum period frequency hunting cycle thermostat drift",
    body: (<>
      <ol className="guide-steps">
        <li>Zoom to a stretch where the behaviour is steady.</li>
        <li>Press <B i={LuWaves} /> and choose the trace.</li>
        <li>Read the strongest periods and their amplitude. A peak well above the noise (× 5 or more) is a real oscillation.</li>
      </ol>
      <HowFigure topic="oscillation" />
      <Tip kind="warn">Logs hold about one value per second, so this finds slow patterns (control-loop hunting, thermal cycling), not 50 Hz harmonics.</Tip>
    </>),
  },
  {
    id: "task-clean", group: "How do I…", title: "Clean up a messy CSV export", icon: LuTable2, tour: "view:editor",
    keywords: "log editor clean header rename filter delete rows err units",
    body: (<>
      <ol className="guide-steps">
        <li>Open the <B i={LuTable2}>Log editor</B> and choose the log.</li>
        <li>Header read as data (or the other way round)? Use <B i={LuChevronsUp} /> or <B i={LuChevronsDown} />.</li>
        <li>Type filters under the columns, such as <code>contains ERR</code>, then <B i={LuFilter} /> deletes every matching row.</li>
        <li>Double-click a header to rename it; double-click a cell to edit it.</li>
        <li>Press <B i={LuSave} tone="primary">Save changes</B>, or <B i={LuCopyPlus}>Save as new log</B> to keep the original.</li>
      </ol>
      <FilterClip />
    </>),
  },
  {
    id: "task-math", group: "How do I…", title: "Add a calculated variable", icon: LuCalculator,
    keywords: "math engine formula derived variable power sum calculate expression",
    body: (<>
      <ol className="guide-steps">
        <li>Open Data → <B i={LuCalculator}>Math engine…</B> (<K>Ctrl+M</K>) and choose the log.</li>
        <li>Name the new variable, for example <code>P_total</code>.</li>
        <li>Build the formula by clicking columns and functions, or type it: <code>`Watts PH1 PPA1` + `Watts PH2 PPA1`</code>.</li>
        <li>Check the live preview (first values and range), then press <B i={LuPlus} tone="primary">Add variable</B>.</li>
      </ol>
      <p>The variable behaves like any other column everywhere in E-PEAK. <Go to="editor">Available functions</Go></p>
    </>),
  },
  {
    id: "task-hub", group: "How do I…", title: "Record findings and schematics", icon: LuBookOpen, tour: "view:hub",
    keywords: "ledger hypothesis evidence photos schematic nodes pins",
    body: (<>
      <ol className="guide-steps">
        <li>In the <B i={LuBookOpen}>Research hub</B>, press <B i={LuPlus} tone="primary">Add entry</B> for each hypothesis: the logs it refers to, what you expect, the status and the conclusion.</li>
        <li>Drop photos and schematics on the evidence board, or press <B i={LuImagePlus}>Add images</B>.</li>
        <li>Mark a drawing as <b>Schematic</b> and press <B i={LuMapPin}>Nodes</B> to name the measurement points on it.</li>
      </ol>
      <SchematicClip />
    </>),
  },
  {
    id: "task-report", group: "How do I…", title: "Export a report", icon: LuFileSpreadsheet, tour: "view:report",
    keywords: "report excel xlsx export workbook csv sheet",
    body: (<>
      <ol className="guide-steps">
        <li>Open the <B i={LuFileSpreadsheet}>Report studio</B>.</li>
        <li>On the left, tick what you want from each tab (graphs, statistics, pass/fail, events, steady states, data, notes) and from the Research hub.</li>
        <li>Press <B i={LuPlus} tone="primary">Add to report</B>. Drag items into order; items with the same sheet name share a sheet.</li>
        <li>Set data or tables to <b>CSV</b> if you want them as separate files.</li>
        <li>Press <B i={LuFileSpreadsheet} tone="primary">Export report</B>.</li>
      </ol>
      <ReportClip />
      <p>Graphs are exported as they look on screen, with limit lines, shaded events and steady states, markers and cursors. Pass/fail uses each plot's visible range.</p>
    </>),
  },
  {
    id: "task-share", group: "How do I…", title: "Share a workspace with a colleague", icon: LuDownload,
    keywords: "share send workspace file epeak copy colleague import",
    body: (<>
      <ol className="guide-steps">
        <li>Save the workspace (<K>Ctrl+S</K>).</li>
        <li>Open File → Open workspace, select it and press <B i={LuDownload} />. You get one <code>.epeak</code> file with the logs, tabs, ledger, evidence and styles inside.</li>
        <li>Your colleague drops the file on E-PEAK, or uses File → Import workspace file.</li>
      </ol>
    </>),
  },

  // ================================================================ reference
  {
    id: "plots", group: "Reference", title: "Working with plots", icon: LuChartLine, tour: "demo-first",
    keywords: "zoom pan measurements markers cursors rescale data table style resize link x",
    body: (<>
      <ul>
        <li><b>Zoom</b> by dragging a box; double-click to reset (or <B i={LuScan} />). The Start/End boxes show and set the visible range.</li>
        <li><b>Large logs:</b> plots draw a peak-preserving summary of the visible range (like an oscilloscope), so millions of rows stay smooth. Zoom in and full detail is fetched automatically.</li>
        <li><b>Measurements</b> under each plot show mean, min, max, peak-to-peak, RMS, σ and median for the points in view. The <span className="guide-pill">▼ max</span> <span className="guide-pill">▲ min</span> <span className="guide-pill">– mean</span> <span className="guide-pill">··· median</span> buttons draw markers for that trace.</li>
        <li><b>Cursors</b> (<B i={LuRuler} />) add two vertical lines, A (solid) and B (dashed). Drag them, or type exact positions in the bar under the plot. For every trace the bar shows the value at A and at B (the nearest real sample, never a decimated display point), ΔY = B − A and the slope ΔY/Δt; on time axes it also shows Δt and 1/Δt. Cursors are saved with the workspace and appear on exported graphs.</li>
        <li><B i={LuMoveVertical}>Rescale Y</B> fits the Y axes to the points in view. <B i={LuChartColumnBig}>Analyse</B> opens correlations and histograms for the view.</li>
        <li><B i={LuSheet}>Data</B> shows the points in view. Click rows (Shift for a range) and press Delete, or use the × on a row, to remove points from the analysis. Restore them from the setup panel.</li>
        <li><B i={LuPalette}>Style</B> sets titles, axis labels, legend, and each trace's name, colour, line style, width and drawing mode. Changes apply as you edit.</li>
        <li>Drag the bottom edge of a plot to make it taller. Drag a plot by <B i={LuGripVertical} /> to reorder it.</li>
      </ul>
      <div className="clip-row">
        <ZoomClip />
        <CursorClip />
      </div>
      <div className="clip-row">
        <RemovePointsClip />
        <ReorderClip />
      </div>
      <h4>The plot toolbar</h4>
      <ButtonTable rows={PLOT_BUTTONS} />
    </>),
  },
  {
    id: "checks", group: "Reference", title: "Limits, events and steady states", icon: LuShieldCheck, tour: "demo-problems",
    keywords: "limits pass fail events threshold steady plateau oscillation spectrum report",
    body: (<>
      <p>Four tools on every 2D plot, Calibration, Time sync and Append plot: <B i={LuShieldCheck} /> <B i={LuZap} /> <B i={LuEqual} /> <B i={LuWaves} />. They always work on the full data, never on the thinned-out points drawn on screen, and they skip removed points.</p>
      <h4><B i={LuShieldCheck}>Limits</B></h4>
      <HowFigure topic="limits" />
      <ul>
        <li>Give a trace a lower and/or upper limit; leave a box empty for a one-sided limit. Limit lines are drawn on the plot and samples beyond them turn red.</li>
        <li><b>All plots</b> sets the limit once for the variable: it applies wherever that variable is plotted in this workspace, and Time-sync or calibration traces such as <code>Log2: V_RMS(V)</code> use the limit of <code>V_RMS(V)</code>. <b>This plot</b> sets a limit for one plot only, and <b>Off</b> switches the limit off there.</li>
        <li>The result is for the points in view, like the measurements: PASS, or FAIL with the number of samples outside, the percentage and the worst excess. A <span className="lim-badge is-pass">✓</span> or <span className="lim-badge is-fail">✗</span> also shows next to each trace in the measurement bar.</li>
        <li>Data → <B i={LuShieldCheck}>Limits…</B> lists every workspace limit in one place.</li>
      </ul>
      <h4><B i={LuZap}>Events</B></h4>
      <HowFigure topic="events" />
      <ul>
        <li>Add rules: <i>above</i> or <i>below</i> a threshold, <i>outside limits</i>, a <i>step</i> (change between two consecutive samples), a <i>spike</i> (a sample that jumps away from its neighbours) or a <i>dropout</i> (no real sample for longer than a gap, from missing rows or empty cells).</li>
        <li><i>Min duration</i> keeps only events that last at least that long, measured from the first to the last sample beyond the threshold. 0 also counts single samples. Example: <code>V_RMS above 253</code> with min duration 0.1 s.</li>
        <li>Events are found over the whole plot, shaded on it, and listed with their start, end, duration and peak. Click an event to zoom to it.</li>
      </ul>
      <h4><B i={LuEqual}>Steady states</B></h4>
      <HowFigure topic="steady" />
      <ul>
        <li>Finds the stable plateaus of one trace, for example each load level in a calibration run. A stretch is steady when the standard deviation over the moving <i>window</i> stays below the tolerance (absolute, or % of the value) and the level doesn't drift, for at least the <i>min duration</i>.</li>
        <li>For each plateau you get the mean ± σ of every trace in the plot, so in a calibration tab you see the reference, the targets and the error at each load point. Plateaus are numbered and shaded on the plot; click one to zoom to it.</li>
      </ul>
      <h4><B i={LuWaves}>Oscillation finder</B></h4>
      <HowFigure topic="oscillation" />
      <p>Shows the spectrum of a trace for the points in view and lists its strongest periods with their amplitude. Logs hold about one RMS, frequency or phase value per second, so it finds slow oscillations and drift (control-loop hunting, thermal cycling), not waveform harmonics.</p>
      <h4>In the report</h4>
      <p>Tabs that use these tools offer <i>Pass/fail (limits)</i>, <i>Events</i> and <i>Steady states</i> in the Report studio. Pass/fail is worked out for each plot's visible range, like its graph, with PASS and FAIL coloured in Excel; events and steady states cover the whole plot. Exported graphs show the limit lines and shaded regions.</p>
      <p><Go to="how">How the analysis works, in detail</Go></p>
    </>),
  },
  {
    id: "tools", group: "Reference", title: "Analysis tools", icon: LuBox,
    keywords: "2d plot calibration time sync append waveform 3d mapping global statistics tools",
    body: (<>
      <p>Each tool opens in its own tab from <B i={LuPlus}>New analysis</B>. Click a card to jump to it.</p>
      <ToolCards />
      <ToolHead type="generic" />
      <p>Stack as many plots as you need from one log, each with left and right Y axes. Drag plots by the handle to reorder. <i>Link X axes</i> zooms all plots together. <ShowMe tour="demo-first" /></p>
      <ToolHead type="calibration" />
      <p>The reference log is ground truth; add up to nine targets. Each is aligned to the reference timeline (nearest sample within ±1 s, after the time offset). Error: percentage |t−r|/r, absolute t−r, or phase difference wrapped to 0–180°. Errors are dotted on the right axis. <ShowMe tour="demo-calib" /></p>
      <ToolHead type="compare" />
      <p>Overlays logs on elapsed seconds, so tests from different days line up. Each log gets its own line style; use the offset to align events. The data table merges all logs on a common timeline. <ShowMe tour="demo-sync" /></p>
      <ToolHead type="append" />
      <p>Joins segments end to end with a 1 s gap. Trim boxes accept any part of a timestamp (e.g. <code>10:00:00</code>). <ShowMe tour="demo-append" /></p>
      <ToolHead type="waveform" />
      <p>Reconstructs two cycles from RMS, frequency and phase (sine, square, triangle, sawtooth), with optional 3rd/5th harmonics for THD. Scrub through a log to load each row's values; <i>Follow a 2D plot tab</i> keeps the waveform on the same log as that tab. With <b>Live</b> off, press <b>Apply values</b> to load a row. <ShowMe tour="demo-wave" /></p>
      <ToolHead type="three_d" />
      <p>Line, point cloud or surface of three variables; Z sets the colour. Drag to rotate, scroll to zoom. <B i={LuChartColumnBig} /> analyses X, Y and Z together. <ShowMe tour="demo-3d" /></p>
      <ToolHead type="global_stats" />
      <p>Summary table, box plots with independent axes and a scatter matrix for a whole log. <ShowMe tour="demo-stats" /></p>
    </>),
  },
  {
    id: "hub", group: "Reference", title: "Research hub", icon: LuBookOpen, tour: "view:hub",
    keywords: "ledger hypothesis status validated rejected testing evidence images schematic nodes lightbox",
    body: (<>
      <p>The record of your investigation, saved with the workspace and available to the report.</p>
      <h4>Investigation ledger</h4>
      <p>One row per hypothesis: the date, the logs or variables it refers to, what you expect, the status and what the data showed. The status is <span className="status-dot s-testing">Testing</span>, <span className="status-dot s-validated">Validated</span> or <span className="status-dot s-rejected">Rejected</span>; the counts are shown at the top. <B i={LuTrash2} /> deletes a row.</p>
      <h4>Evidence and schematics</h4>
      <ul>
        <li>Drop images on the board or press <B i={LuImagePlus}>Add images</B>. Click a thumbnail to view it full size; use the arrow keys to move between images.</li>
        <li>Mark an image as <b>Schematic</b> to name measurement points on it: press <B i={LuMapPin}>Nodes</B>, click the point and type its name. Drag pins to move them.</li>
      </ul>
      <SchematicClip />
    </>),
  },
  {
    id: "editor", group: "Reference", title: "Log editor and math engine", icon: LuTable2, tour: "view:editor",
    keywords: "editor draft filter syntax rename header combine merge append math formula functions",
    body: (<>
      <p>The editor works on a draft: nothing changes until <B i={LuSave} tone="primary">Save changes</B> (or <B i={LuCopyPlus}>Save as new log</B>), and every step can be undone with <B i={LuUndo2} />.</p>
      <ul>
        <li>Double-click a header to rename; double-click a cell to edit.</li>
        <li>Select columns by clicking headers (Ctrl for several) to delete them (<B i={LuTrash2} />) or format a time column (<B i={LuClock} />).</li>
        <li>Filter under each header: <code>&gt; 230</code>, <code>&lt;= 10</code>, <code>!= 4</code>, <code>= 1</code>, <code>contains fault</code>, <code>datestartswith 2026-10-02</code>, or plain text. <B i={LuFilter} /> deletes all rows matching the filters at once.</li>
        <li>Click row numbers to select rows (Ctrl or Shift for several) and press <K>Delete</K>.</li>
        <li><B i={LuChevronsUp} /> <b>First row → header</b> and <B i={LuChevronsDown} /> <b>Header → first row</b> repair files whose header was read as data (or vice versa).</li>
        <li><B i={LuGitMerge}>Combine</B> appends another log's rows or merges its columns by nearest timestamp, within a tolerance.</li>
      </ul>
      <FilterClip />
      <h4><B i={LuCalculator}>Math engine</B></h4>
      <p>Write formulas with backticked column names: <code>`Watts PH1 PPA1` + `Watts PH2 PPA1`</code>. Available: <code>sin cos tan asin acos atan sqrt abs exp ln log10 log2 deg rad round floor ceil min max clip where diff cumsum mean pi e</code>, comparisons and <code>**</code> for powers. A live preview shows the first values and the range before you add the variable. Edit an existing formula and press Enter to recalculate it. Formulas are evaluated safely; nothing else can run.</p>
    </>),
  },
  {
    id: "report", group: "Reference", title: "Report studio", icon: LuFileSpreadsheet, tour: "view:report",
    keywords: "report export excel sheet csv zip graphs pass fail",
    body: (<>
      <ReportClip />
      <ul>
        <li>The left column lists what each tab can contribute: graphs, statistics, pass/fail, events and steady states (when set up), processed data and notes; plus the ledger, the evidence images and raw logs.</li>
        <li>Items sharing a sheet name are placed on the same sheet, in order. Excel sheet names are limited to 31 characters.</li>
        <li>Data, statistics, tables and raw logs can be set to <b>CSV</b> instead; they're bundled with the workbook in a zip.</li>
        <li><B i={LuDownload}>Download checked as CSV</B> under Raw logs downloads the logs straight away.</li>
        <li>Items whose tab was closed are shown in red as “Removed from workspace”.</li>
      </ul>
    </>),
  },
  {
    id: "files", group: "Reference", title: "Workspaces, autosave and files", icon: LuSave,
    keywords: "workspace save open import pkl legacy autosave snapshot restore folder epeak",
    body: (<>
      <ul>
        <li>A workspace is one <code>.epeak</code> file in the workspaces folder (File → Show workspaces folder): a zip with your logs as CSV, the tabs, ledger, evidence and styles. Use File → Open workspace to download one for sharing, or Import to open one from elsewhere.</li>
        <li>Old <code>.pkl</code> workspaces from version 1 open directly (import them, or copy them into the workspaces folder). Save once to convert.</li>
        <li>The name in the top bar shows <b>Saved</b> or <b>Unsaved</b>; click it to save under another name. Your session is also kept continuously, so closing the browser never loses work.</li>
        <li>Autosave snapshots (File → <B i={LuHistory}>Restore an autosave…</B>) never overwrite a saved workspace. Ten per workspace are kept; logs are stored once and shared between snapshots. The pill in the status bar switches autosave on and off.</li>
      </ul>
    </>),
  },
  {
    id: "keys", group: "Reference", title: "Keyboard shortcuts", icon: LuCommand,
    keywords: "keyboard shortcuts keys hotkeys ctrl",
    body: (<>
      <table className="kbd-table"><tbody>
        {[["Ctrl+S", "Save"], ["Ctrl+Shift+S", "Save as"], ["Ctrl+O", "Open workspace"], ["Ctrl+K", "Search actions, tabs and logs"], ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo configuration changes"],
          ["Ctrl+1…4", "Research hub, Analysis, Log editor, Report studio"], ["Ctrl+U", "Upload logs"], ["Ctrl+L", "Log library"], ["Ctrl+M", "Math engine"],
          ["F2", "Rename the focused tab"], ["Delete", "Remove the selected rows (data table, Log editor)"], ["F1", "This guide, opened at the page you're on"],
          ["← →", "Previous / next step in a guided tour, or image in the lightbox"], ["Esc", "Close a dialog or stop a tour"]].map(([k, d]) => <tr key={k}><td><K>{k}</K></td><td>{d}</td></tr>)}
      </tbody></table>
    </>),
  },

  // ================================================================ background
  {
    id: "how", group: "Background", title: "How the analysis works", icon: LuLightbulb,
    keywords: "decimation summary cursors calibration error steady states limits events oscillation spectrum fft hann maths",
    body: (<>
      <p>Plain-language explanations of what each tool calculates. The same cards open from the “How this works” links in the plot panels.</p>
      <HowAll />
    </>),
  },
  {
    id: "tutorial", group: "Background", title: "Tutorial", icon: LuGraduationCap, tour: "overview",
    keywords: "tutorial demo shortcut desktop reset exit tours",
    body: (<>
      <p>The tutorial is a complete demo workspace built from demo logs, with a guided tour of every feature. It is the same E-PEAK started in tutorial mode, with its own data folder, so it runs next to your own E-PEAK and never touches your logs or workspaces.</p>
      <ul>
        <li><b>Open it</b> from Help → <B i={LuGraduationCap}>Open the tutorial</B>; it opens in a new browser tab. Help → Create tutorial shortcut on desktop adds an “E-PEAK Tutorial” icon that starts it directly (it runs <code>E-PEAK.exe --tutorial</code>).</li>
        <li><b>What's in it:</b> eleven demo logs (DIVA boards, the PPA analyser, PicoLog and a messy export), nine tabs (first look, calibration, finding problems, comparing runs, stitching logs, oscillations, statistics, 3D and waveforms), a filled-in ledger, an annotated schematic and a report ready to export.</li>
        <li><b>Tours:</b> the bar at the top has “Tour this tab” for whichever tab or page you're on, and an overview tour. The tours open panels and zoom by themselves; you just press Next. The <b>Show me</b> buttons in this guide start the same tours.</li>
        <li><b>Experiment freely.</b> <B i={LuRotateCcw}>Reset demo</B> puts everything back as it was; Exit closes the tutorial.</li>
      </ul>
      <p>The demo logs are generated, not real test data, with known features built in: two over-voltages, a 40 s dropout, sensor spikes, five load steps where one CT reads 0.25 % high and another drifts to 0.8 %, a 4-minute thermostat cycle and two runs 12 s apart.</p>
    </>),
  },
  {
    id: "changes", group: "Background", title: "What's new in 2.0", icon: LuHistory,
    keywords: "changes release notes version new",
    body: (<>
      <p>Version 2.0 is a rebuild: a FastAPI backend with a React interface. Every v1 feature is kept.</p>
      <h4>Speed and scale</h4>
      <ul>
        <li>Logs are parsed once and cached; nothing re-reads CSV on each interaction.</li>
        <li>Plots, tables and statistics fetch only what's visible, so multi-million-row logs stay responsive.</li>
        <li>No more "Process" buttons: tools update as you configure them.</li>
      </ul>
      <h4>Interface</h4>
      <ul>
        <li>Drag to reorder tabs and plots, rename tabs inline, duplicate tabs.</li>
        <li>Unlimited plots per 2D tab (was 10) and up to ten logs in calibration, time sync and append (was 5), with linked X zoom.</li>
        <li>Measurement readouts and marker toggles directly under each plot; resizable plots.</li>
        <li>Cursors, limits with pass/fail, event detection, steady states and the oscillation finder.</li>
        <li>Undo/redo for configuration, command palette, keyboard shortcuts, dark theme, global drag and drop.</li>
        <li>Style changes apply live, add line width and drawing mode, and are now consistent everywhere (point removal no longer drops custom styles).</li>
        <li>A tutorial with demo logs and guided tours, and this guide with pictures, short clips, search and “Show me” tours.</li>
      </ul>
      <h4>Data safety</h4>
      <ul>
        <li>The session is persisted continuously; a server restart or browser refresh no longer loses work (the old "amnesia" problem).</li>
        <li>Workspaces are portable .epeak files instead of pickles; old .pkl files are converted on open.</li>
        <li>The math engine no longer uses <code>eval</code>.</li>
        <li>Logs are referenced by ID, so renaming a log doesn't break tabs that use it.</li>
      </ul>
      <h4>Fixes</h4>
      <ul>
        <li>The waveform link to a 2D plot tab now follows that tab's log reliably.</li>
        <li>PicoLog files with a blank first header cell are read correctly.</li>
        <li>Markers, point removals and zoom ranges are saved with the workspace.</li>
        <li>Waveform peaks use each shape's true crest factor, so the RMS you enter is the RMS drawn.</li>
      </ul>
    </>),
  },
];

