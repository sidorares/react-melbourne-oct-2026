// What each shot cost, printed to the terminal — never drawn in the window.
//
// A HUD inside the window would claim damage every frame and change the
// number it reports (core's examples/stress/perf.js says why at length), so
// the numbers go to stderr at each cut, one line a shot, and a table at the
// end. Two sources:
//
//  - **the clock's ticks.** The frame loop asks for every frame, so the gap
//    between two ticks is how long the window went between frames. A gap
//    of more than one and a half refresh periods is a dropped frame: the
//    thread was busy when the display wanted one. That is the number this
//    file exists for.
//  - **the window's flush.** Wrapping `WindowNode.flush` (as perf.js does)
//    times every frame that painted, and keeps the damage it painted —
//    what a frame cost the thread, beside whether it was on time.
//
// Animations Core Animation runs (promoted layers, `<Html>` sprites, a
// `<video src>`) cost neither: they show in the ticks as frames that painted
// nothing, which is the point of them.
import type { Clock } from './clock.js';

interface FlushRoot {
  flush(): unknown;
  needsPaint?: boolean;
  needsLayout?: boolean;
  _animating?: { size: number };
  _lastDamageRects?: { width: number; height: number }[] | null;
  _lastReasons?: string[];
  window?: {
    width?: number;
    height?: number;
    refreshInterval?: number;
    _frameInterval?: number;
  };
}

export interface ShotReport {
  shot: string;
  ms: number;
  ticks: number;
  fps: number;
  /** Ticks more than 1.5 refresh periods after the one before. */
  drops: number;
  /** The longest gap between two ticks, in ms. */
  worstGap: number;
  /** Frames that painted something, and what the slowest one cost. */
  paints: number;
  paintMax: number;
  paintMean: number;
  /** Mean painted area per painting frame, in device kilopixels. */
  kpx: number;
}

/** One frame, for `--trace`: when it came (ms into its shot), how long
 *  after the one before, and what its paint cost if it painted. */
export interface TracedFrame {
  shot: string;
  at: number;
  gap: number;
  paint: number | null;
  /** What the paints claimed, and why (core's invalidate reasons). */
  kpx?: number;
  why?: string;
}

/** Device kilopixels a frame has to paint to be a frame anyone sees late.
 *  A table settling the rows it rendered after a glide stops is a layout,
 *  a caret, a pixel or two: a long frame then moves nothing. */
const VISIBLE_KPX = 50;

export class Meter {
  readonly reports: ShotReport[] = [];
  /** Every frame, when tracing. */
  readonly trace: TracedFrame[] | null;
  private pendingPaint: number | null = null;
  private pendingArea = 0;
  private pendingVisible = false;
  private pendingWhy = new Set<string>();
  private shot = '';
  private began = 0;
  private lastTick = NaN;
  private gaps: number[] = [];
  /** Whether each gap painted enough to see (VISIBLE_KPX). */
  private painted: boolean[] = [];
  private paintMs: number[] = [];
  private area = 0;
  private period = 0;
  private root: FlushRoot | null = null;
  private quiet: boolean;

  constructor(clock: Clock, { quiet = false, trace = false } = {}) {
    this.quiet = quiet;
    this.trace = trace ? [] : null;
    clock.on((now) => {
      if (!Number.isNaN(this.lastTick)) {
        const gap = now - this.lastTick;
        this.gaps.push(gap);
        this.painted.push(this.pendingVisible);
        this.pendingVisible = false;
        this.trace?.push({
          shot: this.shot,
          at: Math.round(now - this.began),
          gap: Math.round(gap * 10) / 10,
          paint: this.pendingPaint,
          kpx: Math.round(this.pendingArea / 1000),
          why: [...this.pendingWhy].join('+') || undefined,
        });
      }
      this.pendingPaint = null;
      this.pendingArea = 0;
      this.pendingWhy.clear();
      this.lastTick = now;
    });
  }

  /** The window's frame period, once it is known — 8.3 ms on a 120 Hz
   *  panel. Until then the median gap stands in for it. */
  private refresh(): number {
    const wnd = this.root?.window;
    const known = wnd?._frameInterval || wnd?.refreshInterval || this.period;
    if (known) return known;
    const sorted = [...this.gaps].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 16.7;
  }

  /** Wrap the window's flush, once, to time what each frame painted. */
  watch(root: FlushRoot): void {
    if (this.root) return;
    this.root = root;
    const original = root.flush.bind(root);
    root.flush = () => {
      const willPaint =
        root.needsPaint || root.needsLayout || (root._animating?.size ?? 0) > 0;
      if (!willPaint) return original();
      const t = performance.now();
      const result = original();
      const ms = performance.now() - t;
      this.paintMs.push(ms);
      this.pendingPaint = Math.round(((this.pendingPaint ?? 0) + ms) * 10) / 10;
      const rects = root._lastDamageRects;
      const area = rects
        ? rects.reduce((sum, r) => sum + r.width * r.height, 0)
        : (root.window?.width ?? 0) * (root.window?.height ?? 0);
      this.area += area;
      if (area > VISIBLE_KPX * 1000) this.pendingVisible = true;
      if (this.trace) {
        this.pendingArea += area;
        for (const why of root._lastReasons ?? []) this.pendingWhy.add(why);
        if (!rects) this.pendingWhy.add('FULL');
      }
      return result;
    };
  }

  /** A cut: close the shot before it and start counting this one. */
  begin(shot: string, now = performance.now()): void {
    if (this.shot) this.close(now);
    this.shot = shot;
    this.began = now;
    this.gaps = [];
    this.painted = [];
    this.paintMs = [];
    this.area = 0;
  }

  end(now = performance.now()): void {
    if (this.shot) this.close(now);
    this.shot = '';
  }

  private close(now: number): void {
    const period = this.refresh();
    this.period = period;
    // A long gap is a dropped frame only where something was moving: a
    // visible paint in it or in the gap after it (a stalled tick paints
    // late). A thread busy under a still card, or under animations Core
    // Animation runs, drops nothing anyone sees — that is when the trailer
    // does its preparation. The first gap of a shot holds the cut itself,
    // and is counted like any other.
    const drops = this.gaps.filter(
      (g, i) =>
        g > period * 1.5 && (this.painted[i] || this.painted[i + 1] === true),
    ).length;
    const ms = now - this.began;
    const paints = this.paintMs.length;
    const report: ShotReport = {
      shot: this.shot,
      ms,
      ticks: this.gaps.length,
      fps: this.gaps.length / (ms / 1000),
      drops,
      worstGap: Math.max(0, ...this.gaps),
      paints,
      paintMax: Math.max(0, ...this.paintMs),
      paintMean: paints ? this.paintMs.reduce((a, b) => a + b, 0) / paints : 0,
      kpx: paints ? this.area / paints / 1000 : 0,
    };
    this.reports.push(report);
    if (!this.quiet) process.stderr.write(`${line(report, period)}\n`);
  }

  summary(): string {
    const period = this.refresh();
    const rows = this.reports.map((r) => line(r, period));
    const total = this.reports.reduce((n, r) => n + r.drops, 0);
    const ticks = this.reports.reduce((n, r) => n + r.ticks, 0);
    rows.push(
      `total: ${ticks} frames, ${total} dropped ` +
        `(refresh ${period.toFixed(1)} ms, ${(1000 / period).toFixed(0)} Hz)`,
    );
    return rows.join('\n');
  }
}

function line(r: ShotReport, period: number): string {
  const flag = r.drops === 0 ? ' ' : r.drops <= 2 ? '·' : '!';
  return (
    `${flag} ${r.shot.padEnd(12)} ` +
    `${String(Math.round(r.fps)).padStart(4)} fps  ` +
    `${String(r.drops).padStart(3)} dropped  ` +
    `worst ${r.worstGap.toFixed(1).padStart(6)} ms  ` +
    `paint ${r.paintMean.toFixed(1).padStart(5)} / ${r.paintMax.toFixed(1).padStart(5)} ms ` +
    `(${r.paints} frames, ${Math.round(r.kpx)} kpx)` +
    (r.worstGap > period * 4 ? '  <- stall' : '')
  );
}
