// "How this works": plain-language explanations of the analysis, with small diagrams.
// The same text appears in the pop-up from each panel and in the user guide.
import { type ReactNode, useState } from "react";
import { Modal, cx } from "../components/ui";
import { closeModal } from "../store";
import type { HowTopic } from "../types";

// ------------------------------------------------------------------ tiny diagram helpers
const W = 320;
const H = 110;
const noise = (k: number) => Math.sin(k * 12.9898) * 43758.5453 % 1; // repeatable "noise" in -1..1
const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");

function Svg({ children, label }: { children: ReactNode; label: string }) {
  return <svg className="how-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>{children}</svg>;
}

function CalibrationDiagram() {
  const ref = Array.from({ length: 7 }, (_, k) => 30 + k * 42);
  const tgt = [38, 76, 115, 160, 196, 240, 279];
  return (
    <Svg label="Each reference sample is paired with the nearest target sample in time">
      <text x={4} y={24} className="how-t">Reference</text>
      <text x={4} y={98} className="how-t">Target</text>
      {ref.map((x, k) => <line key={`l${k}`} x1={x} y1={34} x2={tgt[k]} y2={76} className="how-link-line" />)}
      {ref.map((x) => <circle key={`r${x}`} cx={x} cy={32} r={4} className="how-ref" />)}
      {tgt.map((x) => <circle key={`t${x}`} cx={x} cy={78} r={4} className="how-tgt" />)}
      <text x={210} y={58} className="how-t how-small">nearest sample, within ±1 s</text>
    </Svg>
  );
}

function SteadyDiagram() {
  const lv = (x: number) => (x < 90 ? 80 : x < 115 ? 80 - (x - 90) * 1.6 : x < 210 ? 40 : x < 235 ? 40 + (x - 210) * 1.2 : 70);
  const pts: [number, number][] = Array.from({ length: 160 }, (_, k) => [10 + k * 1.9, lv(10 + k * 1.9) + noise(k) * 2.5]);
  return (
    <Svg label="Calm stretches that also hold their level are steady states; ramps are not">
      <rect x={14} y={14} width={74} height={88} className="how-steady" />
      <rect x={118} y={14} width={90} height={88} className="how-steady" />
      <rect x={238} y={14} width={74} height={88} className="how-steady" />
      <path d={path(pts)} className="how-sig" />
      <text x={34} y={28} className="how-t how-ok">#1</text>
      <text x={150} y={28} className="how-t how-ok">#2</text>
      <text x={262} y={28} className="how-t how-ok">#3</text>
      <path d="M130,58 v6 h40 v-6" className="how-bracket" />
      <text x={134} y={76} className="how-t how-small">window</text>
      <text x={84} y={100} className="how-t how-small">ramp: not steady</text>
    </Svg>
  );
}

function EventsDiagram() {
  const pts: [number, number][] = Array.from({ length: 70 }, (_, k) => {
    const x = 10 + k * 4.4;
    const bump = Math.exp(-(((x - 150) / 34) ** 2)) * 52;
    return [x, 82 - bump + noise(k) * 3];
  });
  return (
    <Svg label="Samples above the threshold form one event; its duration runs from the first to the last of them">
      <rect x={124} y={10} width={54} height={92} className="how-event" />
      <line x1={8} y1={52} x2={312} y2={52} className="how-limit" />
      <text x={262} y={46} className="how-t how-small how-bad">threshold</text>
      <path d={path(pts)} className="how-sig" />
      <path d="M124,96 v-6 h54 v6" className="how-bracket" />
      <text x={186} y={98} className="how-t how-small">duration: first → last sample above</text>
    </Svg>
  );
}

function LimitsDiagram() {
  const pts: [number, number][] = Array.from({ length: 60 }, (_, k) => [12 + k * 5, 56 + Math.sin(k / 5) * 30 + noise(k) * 4]);
  return (
    <Svg label="Samples beyond the upper or lower limit are counted and drawn in red">
      <line x1={8} y1={30} x2={312} y2={30} className="how-limit" />
      <line x1={8} y1={84} x2={312} y2={84} className="how-limit" />
      <text x={270} y={24} className="how-t how-small how-bad">max</text>
      <text x={270} y={98} className="how-t how-small how-bad">min</text>
      <path d={path(pts)} className="how-sig" />
      {pts.filter((p) => p[1] < 30 || p[1] > 84).map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3} className="how-badpt" />)}
    </Svg>
  );
}

function OscillationDiagram() {
  const wave: [number, number][] = Array.from({ length: 80 }, (_, k) => [8 + k * 1.75, 70 - k * 0.3 + Math.sin(k / 3.2) * 16]);
  const spec: [number, number][] = Array.from({ length: 60 }, (_, k) => {
    const x = 186 + k * 2.1;
    return [x, 96 - Math.exp(-(((k - 18) / 2.2) ** 2)) * 72 - Math.abs(noise(k)) * 6];
  });
  return (
    <Svg label="A repeating pattern in the signal becomes a peak in the spectrum at its frequency">
      <path d={path(wave)} className="how-sig" />
      <text x={10} y={104} className="how-t how-small">signal (trend removed)</text>
      <path d="M156,56 h18 m-6,-5 l6,5 l-6,5" className="how-bracket" />
      <path d={path(spec)} className="how-spec" />
      <text x={200} y={22} className="how-t how-small how-bad">peak = period</text>
      <text x={196} y={106} className="how-t how-small">frequency →</text>
    </Svg>
  );
}

function DecimationDiagram() {
  const dense: [number, number][] = Array.from({ length: 120 }, (_, k) => [8 + k * 1.15, 55 + noise(k) * 30 + Math.sin(k / 9) * 10]);
  const buckets = Array.from({ length: 8 }, (_, b) => {
    const seg = dense.slice(b * 15, b * 15 + 15).map((p) => p[1]);
    return { x: 186 + b * 16, lo: Math.max(...seg), hi: Math.min(...seg) };
  });
  return (
    <Svg label="Each screen bucket keeps only its lowest and highest point, so peaks are never lost">
      <path d={path(dense)} className="how-sig" />
      <text x={10} y={104} className="how-t how-small">every sample</text>
      <path d="M150,56 h18 m-6,-5 l6,5 l-6,5" className="how-bracket" />
      <path d={path(buckets.flatMap((b) => [[b.x, b.hi], [b.x + 8, b.lo]] as [number, number][]))} className="how-sig" />
      {buckets.map((b) => <g key={b.x}><circle cx={b.x} cy={b.hi} r={2.6} className="how-tgt" /><circle cx={b.x + 8} cy={b.lo} r={2.6} className="how-tgt" /></g>)}
      <text x={186} y={104} className="how-t how-small">min + max per bucket</text>
    </Svg>
  );
}

function CursorsDiagram() {
  const pts: [number, number][] = Array.from({ length: 60 }, (_, k) => [12 + k * 5, 90 - k * 1.1 + noise(k) * 2]);
  return (
    <Svg label="Cursors A and B read the nearest real sample; the bar shows the difference and the slope">
      <path d={path(pts)} className="how-sig" />
      <line x1={80} y1={8} x2={80} y2={104} className="how-cursor" />
      <line x1={240} y1={8} x2={240} y2={104} className="how-cursor how-dashed" />
      <text x={84} y={18} className="how-t">A</text>
      <text x={244} y={18} className="how-t">B</text>
      <path d="M80,100 h160" className="how-bracket" />
      <text x={146} y={96} className="how-t how-small">Δt</text>
      <path d="M262,75 v-32" className="how-bracket" />
      <text x={268} y={62} className="how-t how-small">ΔY</text>
    </Svg>
  );
}

// ------------------------------------------------------------------ the explanations
export const HOW: Record<HowTopic, { title: string; diagram: () => ReactNode; body: ReactNode }> = {
  calibration: {
    title: "Calibration: lining logs up and the error",
    diagram: CalibrationDiagram,
    body: (<>
      <p>Each log's time is turned into elapsed seconds from its own first sample, then the <i>time offset</i> you set is added. That is why logs from different instruments, or even different days, can be compared.</p>
      <p>For every reference sample, E-PEAK takes the target sample <b>nearest in time</b>, if there is one within ±1 s. Where there isn't, the target and the error are left empty at that point.</p>
      <ul>
        <li><b>%</b>: |target − reference| ÷ reference × 100. Always positive; empty where the reference is 0.</li>
        <li><b>Absolute</b>: target − reference, in the variable's own units, keeping the sign (positive means the target reads high).</li>
        <li><b>Phase</b>: the angle between the two, wrapped to 0–180°, for phase readings that roll over at ±180°.</li>
      </ul>
      <p><b>Tip:</b> if the error spikes at every change of level, the logs are slightly out of step. Adjust a target's offset until the spikes disappear. Then use <i>Steady states</i> to get one error figure per load point, and a <i>limit</i> on the error for PASS/FAIL.</p>
    </>),
  },
  steady: {
    title: "Steady states",
    diagram: SteadyDiagram,
    body: (<>
      <p>Over a moving <b>window</b> (say 20 s), E-PEAK works out the standard deviation σ of the chosen trace. Where σ stays below the <b>tolerance</b> (absolute, or a percentage of the value), the signal is calm.</p>
      <p>Calm isn't enough on its own: a slow ramp is calm in every window but never settles. So the <b>level must hold</b> too. If the window's mean moves more than twice the tolerance away from where the plateau started, the plateau ends there.</p>
      <p>A plateau starts at the beginning of its first calm window and ends at its last calm sample. Plateaus shorter than the <b>minimum duration</b> are dropped. For each one you get the mean, σ, minimum and maximum of <i>every</i> trace in the plot over the same stretch of time.</p>
      <p><b>Choosing settings:</b> make the window a few times longer than the noise but shorter than a load step; set the tolerance a little above the normal noise (0.5 % suits most RMS readings); use the minimum duration to ignore brief pauses.</p>
    </>),
  },
  events: {
    title: "Events",
    diagram: EventsDiagram,
    body: (<>
      <ul>
        <li><b>Above / Below</b>: each run of consecutive samples beyond the threshold is one event. Its <b>duration</b> runs from the first to the last sample beyond it, so a single sample lasts 0 s. <i>Min duration</i> drops shorter runs. <b>Peak</b> is the most extreme sample.</li>
        <li><b>Outside limits</b>: the same, using the limits set for that variable.</li>
        <li><b>Step</b>: the value changes by at least the amount from one sample to the next. The <i>Change</i> column shows the size and direction.</li>
        <li><b>Spike</b>: a sample is at least the amount away from the median of the 5 samples around it. This catches single bad readings without flagging genuine steps.</li>
        <li><b>Dropout</b>: no real sample for longer than the gap, because rows are missing from the log or the cells are empty.</li>
      </ul>
      <p>Empty cells never count as beyond a threshold. Events are found over the whole plot; up to 2,000 per rule are listed, and the count is always exact.</p>
    </>),
  },
  limits: {
    title: "Limits and pass/fail",
    diagram: LimitsDiagram,
    body: (<>
      <p>A limit can have a lower value, an upper value or both. A sample fails when it is <b>strictly</b> above the upper limit or below the lower one; a sample exactly on the limit passes.</p>
      <ul>
        <li><b>All plots</b> stores the limit once for the variable. Log prefixes such as <code>Log2:</code>, <code>REF:</code> or <code>TGT 3:</code> are ignored, so a limit on <code>V_RMS(V)</code> also applies to <code>Log2: V_RMS(V)</code>.</li>
        <li><b>This plot</b> overrides it on one plot; <b>Off</b> switches it off there.</li>
      </ul>
      <p>PASS/FAIL is for the <b>points in view</b>, like the measurement bar, and leaves out removed points. Zoom to the part of the test that matters to judge only that part. The report's pass/fail table uses each plot's visible range in the same way. <b>Worst excess</b> is how far the furthest sample lies beyond its limit.</p>
    </>),
  },
  oscillation: {
    title: "The oscillation finder",
    diagram: OscillationDiagram,
    body: (<>
      <p>It takes the points in view, puts them on an even time grid (gaps are bridged with straight lines, and you're warned if a lot had to be), removes the straight-line trend, smooths the ends with a Hann window and computes the spectrum.</p>
      <ul>
        <li><b>Amplitude</b> is the size of the swing either side of the trend: a ±1.5 °C cycle shows about 1.5. <b>Period</b> = 1 ÷ frequency.</li>
        <li>The shortest period it can see is two samples (2 s for a 1 Hz log); the longest is about the length of the view. Peaks near the longest periods usually reflect drift rather than a real cycle.</li>
        <li><b>Above noise</b> compares a peak with the typical level of the spectrum. ×5 or more is a real repeating pattern.</li>
      </ul>
      <p><b>Why no harmonics:</b> logs hold one RMS, frequency or phase value per second or so, each already averaged over many mains cycles. Harmonics of the 50 Hz waveform need the raw waveform sampled thousands of times a second, from a scope or an analyser's waveform capture.</p>
    </>),
  },
  decimation: {
    title: "Why a plot shows a summary of large logs",
    diagram: DecimationDiagram,
    body: (<>
      <p>A screen is one or two thousand pixels wide, so drawing millions of points would be slow and look exactly the same. For the visible range, E-PEAK splits the points into about two buckets per pixel and draws only the <b>lowest and highest</b> point of each bucket.</p>
      <p>Every peak and dip is still drawn, just as on an oscilloscope. Zoom in and the real samples appear once there are few enough.</p>
      <p>Measurements, cursors, limits, events, steady states and exports always use <b>every point</b>, never the summary.</p>
    </>),
  },
  cursors: {
    title: "Cursors",
    diagram: CursorsDiagram,
    body: (<>
      <p>Cursors A and B are vertical lines you can drag or type positions into. The value shown at each is the <b>nearest real sample</b> of each trace (skipping empty cells), never a display point or an interpolation.</p>
      <ul>
        <li><b>ΔY</b> = value at B − value at A; <b>Δt</b> = B − A, in seconds on time axes.</li>
        <li><b>Slope</b> = ΔY ÷ Δt, for example a ramp rate in A per second.</li>
        <li><b>1/Δt</b> is a frequency: put A and B one cycle apart to measure it.</li>
      </ul>
    </>),
  },
};
export const HOW_ORDER: HowTopic[] = ["decimation", "cursors", "calibration", "steady", "limits", "events", "oscillation"];

function HowCard({ topic, heading = "h3" }: { topic: HowTopic; heading?: "h3" | "h4" }) {
  const h = HOW[topic];
  const Heading = heading;
  const D = h.diagram;
  return (
    <div className="how-card">
      <Heading>{h.title}</Heading>
      <div className="how-figure"><D /></div>
      {h.body}
    </div>
  );
}

/** Every explanation, one after another (for the user guide). */
export function HowAll() {
  return <>{HOW_ORDER.map((t) => <HowCard key={t} topic={t} heading="h4" />)}</>;
}

/** The pop-up opened by "How this works" links; other topics are one click away. */
export function HowModal({ topic }: { topic: HowTopic }) {
  const [cur, setCur] = useState<HowTopic>(topic);
  return (
    <Modal title="How this works" onClose={closeModal} width={860} className="docs-modal">
      <div className="docs">
        <nav>{HOW_ORDER.map((t) => <button key={t} type="button" className={cx(t === cur && "is-on")} onClick={() => setCur(t)}>{HOW[t].title}</button>)}</nav>
        <article><HowCard topic={cur} /></article>
      </div>
    </Modal>
  );
}
