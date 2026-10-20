// The frame around every shot: a letterbox, with the titles in the bars.
//
// Titles never sit over a scene, and that is a constraint before it is a
// look. On the Cocoa backend a `<glarea>` — the map, the 3D scene — is a
// layer above everything the window paints, so a caption laid over one is
// a caption nobody sees. In the bars it is over nothing, and it can fade on
// a layer of its own: every animation in this file is an `opacity` or a
// `backgroundColor` transition or loop on a plain `<box>`, which macOS
// promotes to Core Animation (core's docs/macos.md, "Layer promotion") —
// they run in the render server and cost the JS thread no frames at all.
import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { useClock } from './clock.js';

export const INK = '#f4f6fb';
export const MUTED = '#8a93a8';
export const DIM = '#4b5266';
export const GROUND = '#05060a';
/** One level from the ground: a colour loop between the two keeps a box on
 *  its own layer without anyone seeing it move (`CardGround`). */
export const GROUND_NEAR = '#05060b';
export const PANEL = '#0d1018';
export const ACCENT = '#6c8cff';
export const ACCENT_2 = '#b388ff';
export const HOT = '#ff5c8a';

export const TOP_BAR = 44;
export const BOTTOM_BAR = 92;

/** A box that is invisible on its first frame and fades in on the next —
 *  a transition needs a change to run, and a mount is not one. */
function useShown(delay = 16): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(id);
  }, [delay]);
  return shown;
}

export function TopBar({
  count,
  index,
}: {
  count: number;
  index: number;
}): ReactElement {
  return (
    <box
      style={{
        height: TOP_BAR,
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 24,
        paddingRight: 24,
        gap: 10,
      }}
    >
      <text style={{ fontSize: 15, fontWeight: 'bold', color: INK }}>
        react-x11
      </text>
      <text style={{ fontSize: 13, color: DIM }}>stress demo</text>
      <box style={{ flexGrow: 1 }} />
      <box style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        {Array.from({ length: count }, (_, i) => (
          <box
            key={i}
            style={{
              width: i === index ? 22 : 7,
              height: 7,
              borderRadius: 4,
              backgroundColor:
                i === index ? ACCENT : i < index ? '#3a4260' : '#1b2030',
              // the colour is the layer's to run; the width is not, and a
              // width that snaps reads as the step it is
              transition: { backgroundColor: 260 },
            }}
          />
        ))}
      </box>
    </box>
  );
}

export interface Caption {
  kicker?: string;
  title?: string;
  subtitle?: string;
}

/** The lower third: keyed by shot, so each one mounts and fades in. */
export function LowerThird({ kicker, title, subtitle }: Caption): ReactElement {
  const shown = useShown();
  return (
    <box
      style={{
        height: BOTTOM_BAR,
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 24,
        paddingRight: 24,
        gap: 16,
      }}
    >
      {title ? (
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
            opacity: shown ? 1 : 0,
            transition: { opacity: 240 },
          }}
        >
          {/* a rule that breathes between the two accents, forever, on a
              layer: the render server's frames, not ours */}
          <box
            style={{
              width: 5,
              height: 50,
              borderRadius: 3,
              backgroundColor: ACCENT,
              animation: {
                backgroundColor: {
                  to: ACCENT_2,
                  duration: 900,
                  alternate: true,
                  easing: 'ease-in-out',
                },
              },
            }}
          />
          <box style={{ gap: 4 }}>
            <box
              style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
            >
              {kicker ? (
                <text
                  style={{
                    fontSize: 13,
                    fontWeight: 'bold',
                    color: ACCENT,
                    letterSpacing: 1.5,
                  }}
                >
                  {kicker}
                </text>
              ) : null}
              <text style={{ fontSize: 26, fontWeight: 'bold', color: INK }}>
                {title}
              </text>
            </box>
            {subtitle ? (
              <text style={{ fontSize: 15, color: MUTED }}>{subtitle}</text>
            ) : null}
          </box>
        </box>
      ) : null}
    </box>
  );
}

/** How long a card takes to fade up — slow, so the words arrive before
 *  they are read — and to fade away into the scene. */
export const CARD_FADE_IN_MS = 2000;
export const CARD_FADE_OUT_MS = 1000;

/**
 * The question, on black, in very large type — held still, so it is read
 * before anything moves again.
 */
export function SmashCard({
  text,
  start,
  ms,
}: {
  text: string;
  start: number;
  ms: number;
}): ReactElement {
  return (
    <CardGround start={start} ms={ms}>
      <text
        style={{
          fontSize: 96,
          fontWeight: 'bold',
          color: INK,
          letterSpacing: -2,
        }}
      >
        {text}
      </text>
    </CardGround>
  );
}

/**
 * The opaque ground a card stands on. It fades up out of black over two
 * seconds, holds, and fades away into whatever is under it in one.
 *
 * The whole card — ground and words — lives on a Core Animation layer of
 * its own from its first frame to its last, and that is the point of the
 * colour loop below, which no one can see (one level of blue, back and
 * forth). Core promotes a box while it animates and for a second after,
 * then paints it back into the window's bitmap; a card that fades up,
 * holds and fades away was promoted, given back and promoted again, and a
 * hand-over between the bitmap and a new layer is not one atomic present:
 * the scene the director had already painted under the card could show
 * for a frame before the card's new layer did. With the loop the card is
 * never given back, the bitmap under it can change freely — the next
 * scene is laid out and painted there for the card's last moments — and
 * the fade away is a dissolve into that scene, run by the render server.
 *
 * Both fades are cued by the frame clock, not by timers. The fade up waits
 * for the card's second frame, so the first one has painted it at nothing:
 * a cut that unmounts a big scene can hold the thread past a timer's turn,
 * and a change made before the card was ever drawn is no transition — the
 * card came up at full strength, at once. The fade away is cued from the
 * shot's own start, so it ends on the cut however late the card mounted.
 *
 * `start` is the shot's start on the clock, and `ms` the card's whole
 * length on the wall clock, fades included.
 */
function CardGround({
  start,
  ms,
  children,
}: {
  start: number;
  ms: number;
  children?: ReactNode;
}): ReactElement {
  const clock = useClock();
  const [phase, setPhase] = useState<'before' | 'up' | 'away'>('before');
  useEffect(() => {
    let frames = 0;
    const off = clock.on((now) => {
      frames++;
      if (now - start >= ms - CARD_FADE_OUT_MS) {
        setPhase('away');
        off();
      } else if (frames === 2) {
        setPhase('up');
      }
    });
    return off;
  }, [clock, start, ms]);
  return (
    <box
      style={{
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: GROUND,
        opacity: phase === 'up' ? 1 : 0,
        // the duration a change is made with is the one it runs at
        transition: {
          opacity: phase === 'away' ? CARD_FADE_OUT_MS : CARD_FADE_IN_MS,
        },
        animation: {
          backgroundColor: { to: GROUND_NEAR, duration: 1500, alternate: true },
        },
      }}
    >
      {children}
    </box>
  );
}

/**
 * The card before a scene: its number, what it is in two or three words,
 * and one line on what to watch for. It holds still between its fades,
 * because the scene after it is all motion, and a title nobody can read is
 * not a title. A trailer's cards are the slow beats that make the fast
 * ones read.
 */
export function TitleCard({
  kicker,
  big,
  small,
  start,
  ms,
}: {
  kicker: string;
  big: string;
  small: string;
  start: number;
  ms: number;
}): ReactElement {
  return (
    <CardGround start={start} ms={ms}>
      <box style={{ alignItems: 'center', gap: 14 }}>
        <text
          style={{
            fontSize: 20,
            fontWeight: 'bold',
            color: ACCENT,
            letterSpacing: 4,
          }}
        >
          {kicker}
        </text>
        <text
          style={{
            fontSize: 88,
            fontWeight: 'bold',
            color: INK,
            letterSpacing: -2,
          }}
        >
          {big}
        </text>
        <text style={{ fontSize: 26, color: MUTED }}>{small}</text>
      </box>
    </CardGround>
  );
}

/** The stage a scene fills: everything between the bars. */
export function Stage({
  children,
  onSize,
}: {
  children?: ReactNode;
  onSize?: (width: number, height: number) => void;
}): ReactElement {
  return (
    <box
      onLayout={(ev) => onSize?.(Math.round(ev.width), Math.round(ev.height))}
      style={{
        flexGrow: 1,
        flexShrink: 1,
        minHeight: 0,
        position: 'relative',
        backgroundColor: GROUND,
      }}
    >
      {children}
    </box>
  );
}

/**
 * One scene's box inside the stage: absolutely placed **at a size in
 * numbers**, which is not tidiness. Core floors every box at its content's
 * size, and measures the floors again on every frame that lays anything
 * out — the whole window, three passes, unless a change is held inside a
 * box whose own size cannot move (core's `isFloorBoundary`: absolute, with
 * a numeric width and height). A table that mounts a fresh screen of rows
 * every frame of a fling paid 4 ms a frame for that measurement over the
 * whole tree; inside a sized scene box it measures the scene alone.
 */
export function sceneBox(size: { width: number; height: number }) {
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: size.width,
    height: size.height,
  } as const;
}
