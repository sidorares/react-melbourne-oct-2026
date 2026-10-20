// The opening and closing titles, as HTML.
//
// Kinetic type wants transforms, and core's styles have none — but
// `<Html>` has CSS animations, and on macOS it hands every element whose
// animation a layer can carry to core as a sprite (src/html/sprites.ts):
// each letter below rises, turns and fades on a Core Animation layer of its
// own, and the window paints no frame for any of it. That is what lets the
// intro run while the JS thread does the trailer's preparation — building a
// million table rows, a galaxy's geometry — without a dropped frame on the
// screen. Elsewhere the same document runs on `<Html>`'s own clock.
import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { Html } from '@react-x11/components/html';
import { ACCENT, GROUND } from './shell.js';

const FONT = `-apple-system, "SF Pro Display", "Helvetica Neue", Inter, "Segoe UI", sans-serif`;

/** One span a letter, each a step behind the one before it. */
function letters(word: string, className: string, step: number, from = 0) {
  return [...word]
    .map(
      (ch, i) =>
        `<span class="${className}" style="animation-delay:${from + i * step}ms">${ch}</span>`,
    )
    .join('');
}

const INTRO = `<!doctype html>
<style>
  html, body { margin: 0; background: ${GROUND}; color: #f4f6fb; }
  body { font-family: ${FONT}; text-align: center; padding-top: 6px; }
  .logo { font-size: 150px; font-weight: 800; letter-spacing: -6px; line-height: 1.05; }
  .l { display: inline-block; animation: rise 900ms cubic-bezier(.16, 1, .3, 1) both; }
  .x { color: #6c8cff; }
  .tag { font-size: 30px; color: #8a93a8; margin-top: 18px; animation: fade 700ms ease-out 650ms both; }
  .pills { margin-top: 34px; }
  .live { font-size: 19px; color: #6c8cff; margin-top: 46px; letter-spacing: 4px; text-transform: uppercase;
          font-weight: 700; animation: fade 900ms ease-out 2300ms both; }
  .p { display: inline-block; font-size: 17px; color: #c9cfe0; padding: 7px 16px; margin: 0 6px;
       border-radius: 999px; background: #141826; animation: pop 600ms cubic-bezier(.34, 1.56, .64, 1) both; }
  @keyframes rise {
    from { opacity: 0; transform: translateY(90px) rotate(10deg) scale(.6); }
    to { opacity: 1; transform: none; }
  }
  @keyframes fade { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  @keyframes pop { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: none; } }
</style>
<div class="logo">${letters('react-', 'l', 55)}<span class="x">${letters('x11', 'l', 55, 330)}</span></div>
<div class="tag">React for the desktop. Drawn natively.</div>
<div class="pills">${['X11', 'macOS', 'Wayland', 'Windows']
  .map(
    (p, i) =>
      `<span class="p" style="animation-delay:${1000 + i * 90}ms">${p}</span>`,
  )
  .join('')}</div>
<div class="live">Nothing you are about to see is a recording</div>
`;

const OUTRO = `<!doctype html>
<style>
  html, body { margin: 0; background: ${GROUND}; color: #f4f6fb; }
  body { font-family: ${FONT}; text-align: center; }
  .big { font-size: 96px; font-weight: 800; letter-spacing: -3px; animation: rise 900ms cubic-bezier(.16, 1, .3, 1) both; }
  .x { color: #6c8cff; }
  .sub { font-size: 40px; font-weight: 700; color: #b388ff; margin-top: 6px; animation: rise 900ms cubic-bezier(.16, 1, .3, 1) 140ms both; }
  .url { font-size: 22px; color: #8a93a8; margin-top: 30px; animation: fade 800ms ease-out 450ms both; }
  .note { font-size: 16px; color: #4b5266; margin-top: 12px; animation: fade 800ms ease-out 700ms both; }
  @keyframes rise { from { opacity: 0; transform: translateY(60px) scale(.85); } to { opacity: 1; transform: none; } }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
</style>
<div class="big">react-<span class="x">x11</span></div>
<div class="sub">@react-x11/components</div>
<div class="url">github.com/sidorares/react-x11 &nbsp;·&nbsp; github.com/sidorares/react-x11-components</div>
<div class="note">Every frame you just saw was rendered live — nothing here was a recording.</div>
`;

function Centered({
  source,
  children,
}: {
  source: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <box
      style={{
        flexGrow: 1,
        justifyContent: 'center',
        backgroundColor: GROUND,
      }}
    >
      <Html
        source={source}
        partial={false}
        selectable={false}
        defaultColorScheme="dark"
      />
      {children}
    </box>
  );
}

/** When the Start button fades in: once the intro's own lines are up. */
const START_SHOWN_AT = 3000;

/**
 * Start, under the intro: the trailer waits on the first screen until it is
 * pressed, so it can be put up before a talk and started on cue. A pill in
 * the intro's own look rather than core's `<Button>`, which on macOS is the
 * native push button — a fixed small height, whatever it is given — and
 * this one is seen from the back of a room. It fades in once the title has
 * finished arriving and away as it is pressed; the keys that start it —
 * Return, Space, → and Page Down, what a presentation clicker sends — are
 * the director's (main.tsx).
 */
function StartButton({
  waiting,
  onStart,
}: {
  waiting: boolean;
  onStart: () => void;
}): ReactElement {
  const [shown, setShown] = useState(false);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShown(true), START_SHOWN_AT);
    return () => clearTimeout(id);
  }, []);
  return (
    <box
      style={{
        alignItems: 'center',
        marginTop: 30,
        opacity: shown && waiting ? 1 : 0,
        transition: { opacity: waiting ? 700 : 300 },
      }}
    >
      <box
        aria-label="Start"
        onClick={waiting ? onStart : undefined}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingLeft: 40,
          paddingRight: 40,
          paddingTop: 14,
          paddingBottom: 14,
          borderRadius: 999,
          backgroundColor: hover ? '#8aa3ff' : ACCENT,
          transition: { backgroundColor: 150 },
        }}
      >
        <text style={{ fontSize: 26, fontWeight: 'bold', color: '#ffffff' }}>
          ▶ Start
        </text>
      </box>
    </box>
  );
}

/** The opening title; with `onStart`, the Start button under it. */
export const Intro = ({
  waiting = false,
  onStart,
}: {
  waiting?: boolean;
  onStart?: () => void;
}): ReactElement => (
  <Centered source={INTRO}>
    {onStart ? <StartButton waiting={waiting} onStart={onStart} /> : null}
  </Centered>
);
export const Outro = (): ReactElement => <Centered source={OUTRO} />;
