// One frame loop for the whole trailer.
//
// Every scene is driven by time, not by frames: a scroll is "where the pane
// is 1.2 s into the shot", a camera is "where the fly has got to now". So a
// frame that comes late shows the motion further along instead of slowing
// the show down, and the trailer lasts what its shot list says whatever
// the machine does with it.
//
// The loop is the window's own `requestAnimationFrame`, paced by its frame
// clock — the display's period on the Cocoa backend, the vertical blank
// where an X server reports one — and it is the only thing in the demo that
// asks for frames. Asking costs nothing when nothing is dirty: a frame with
// no damage paints nothing.
import { createContext, useContext, useEffect, useRef } from 'react';

/** What a window ref is, as far as the clock cares: ntk's `Window` on X11
 *  and the Cocoa backend's window both have it. */
export interface FrameSource {
  requestAnimationFrame(cb: (time: number) => void): unknown;
}

type Listener = (now: number) => void;

export class Clock {
  /** Wall-clock milliseconds per show millisecond: `--speed=0.5` plays the
   *  whole trailer at half speed, motion and cuts alike. */
  readonly speed: number;
  private listeners = new Set<Listener>();
  private source: FrameSource | null = null;
  private running = false;

  constructor(speed = 1) {
    this.speed = speed;
  }

  attach(source: FrameSource): void {
    this.source = source;
    if (this.running) return;
    this.running = true;
    source.requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
  }

  /** Called once a frame, before the frame paints, in subscription order. */
  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private frame = (): void => {
    if (!this.running || !this.source) return;
    const now = performance.now();
    for (const listener of this.listeners) {
      try {
        listener(now);
      } catch (error) {
        // a scene that throws loses its motion, not the trailer
        process.stderr.write(`stress-demo: ${String(error)}\n`);
      }
    }
    this.source.requestAnimationFrame(this.frame);
  };
}

export const ClockContext = createContext<Clock>(new Clock());

export const useClock = (): Clock => useContext(ClockContext);

/**
 * Run `fn` on every frame while `active`, with the show time since `start`
 * (performance.now() of the moment the shot began) in show milliseconds.
 * `fn` may change every render; the subscription does not.
 */
export function useTick(
  active: boolean,
  start: number,
  fn: (elapsed: number, dt: number) => void,
): void {
  const clock = useClock();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    let last = NaN;
    return clock.on((now) => {
      const elapsed = Math.max(0, (now - start) / clock.speed);
      const dt = Number.isNaN(last) ? 0 : elapsed - last;
      last = elapsed;
      ref.current(elapsed, dt);
    });
  }, [active, start, clock]);
}

// --- easing --------------------------------------------------------------

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Where `t` is between `a` and `b`, as 0..1. */
export const progress = (t: number, a: number, b: number): number =>
  clamp01((t - a) / (b - a));

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

export const easeInOutSine = (t: number): number =>
  -(Math.cos(Math.PI * t) - 1) / 2;

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;

/** A seeded generator, so a run of the trailer is the same run every time. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A value that moves in eased glides between rests: `[ms, value]` stops,
 * each leg eased in and out, holding wherever two stops share a value. A
 * scroll written this way starts gently, glides, settles, and stays still
 * long enough to be read before the next — never a constant blur.
 */
export function glide(
  t: number,
  stops: readonly (readonly [number, number])[],
): number {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [b, vb] = stops[i];
    if (t >= b) continue;
    const [a, va] = stops[i - 1];
    return lerp(va, vb, easeInOutCubic((t - a) / (b - a)));
  }
  return stops[stops.length - 1][1];
}
