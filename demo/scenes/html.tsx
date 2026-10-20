// A long, loud HTML document — a magazine feature, display type and all —
// read top to bottom in glides.
//
// `<Html>` draws the document itself: its own CSS cascade, block and inline
// layout, flexbox and grid, multi-column text, gradients through text,
// shadows, 3D transforms and inline SVG, in one element. Nothing here is a
// browser. Its `@keyframes` animations — the floating orbs, the marquee,
// the pulse — are handed to Core Animation on macOS as sprites, so they
// keep moving at the display's rate whatever the page underneath costs.
import { useMemo, useRef } from 'react';
import type { ReactElement } from 'react';

import { Html } from '@react-x11/components/html';
import { glide, rng, useTick } from '../clock.js';
import type { SceneProps } from '../scene.js';
import { findScroller } from '../scroll.js';
import type { Scroller } from '../scroll.js';

const DISPLAY = `"Didot", "Bodoni 72", "Playfair Display", "Iowan Old Style", Georgia, serif`;
const SANS = `-apple-system, "SF Pro Display", "Avenir Next", "Helvetica Neue", Inter, sans-serif`;
const MONO = `"SF Mono", Menlo, "JetBrains Mono", monospace`;

/** A generative print: rings and blobs, seeded, so each card is its own. */
function art(seed: number, hue: number): string {
  const rand = rng(seed);
  const shapes: string[] = [];
  for (let i = 0; i < 9; i++) {
    const r = 18 + rand() * 70;
    const cx = rand() * 320;
    const cy = rand() * 220;
    const h = (hue + rand() * 70) % 360;
    shapes.push(
      i % 3 === 0
        ? `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="none" stroke="hsl(${h.toFixed(0)},85%,65%)" stroke-width="${(2 + rand() * 6).toFixed(1)}" opacity="0.85"/>`
        : `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="hsl(${h.toFixed(0)},80%,${(45 + rand() * 25).toFixed(0)}%)" opacity="${(0.35 + rand() * 0.5).toFixed(2)}"/>`,
    );
  }
  for (let i = 0; i < 5; i++) {
    const y = 30 + i * 40;
    shapes.push(
      `<path d="M0 ${y} Q 80 ${y - 30 - rand() * 30} 160 ${y} T 320 ${y}" fill="none" stroke="rgba(255,255,255,${(0.15 + rand() * 0.3).toFixed(2)})" stroke-width="2"/>`,
    );
  }
  return `<svg viewBox="0 0 320 220" width="100%" height="220" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="220" fill="hsl(${hue},45%,12%)"/>${shapes.join('')}</svg>`;
}

const GALLERY = [
  [
    'Promotion',
    'A box that animates gets a layer of its own, and the render server runs it.',
    228,
  ],
  [
    'Blitting',
    'A scroll copies what stayed and draws the strip that came in.',
    268,
  ],
  ['Pacing', 'A frame waits for the display, not for a timer.', 310],
  [
    'Prefetch',
    'The flight is a curve known in advance, and so are its tiles.',
    190,
  ],
  [
    'Warm-up',
    'The next scene is painted under the card before the card goes.',
    330,
  ],
  ['Floors', 'A box sized in numbers keeps a change inside itself.', 150],
] as const;

const PARAGRAPH =
  'There is a moment in every demo of a desktop toolkit written in JavaScript when somebody leans back and asks the question. Not whether it works — the window is right there — but whether it keeps up: whether a table of a million rows scrolls, whether a map flies, whether a terminal survives a flood. The honest answer is that a frame is a budget, eight milliseconds of it on a modern panel, and that every one of those milliseconds can be accounted for. ';

const DOCUMENT = `<!doctype html>
<style>
  html, body { margin: 0; background: #06070c; color: #e9ecf5; }
  body { font-family: ${SANS}; font-size: 18px; line-height: 1.55; }
  .hero {
    position: relative; overflow: hidden; padding: 90px 80px 110px;
    background:
      radial-gradient(circle at 15% 20%, rgba(108,140,255,.55), transparent 42%),
      radial-gradient(circle at 85% 30%, rgba(255,92,138,.45), transparent 40%),
      radial-gradient(circle at 60% 95%, rgba(179,136,255,.5), transparent 45%),
      linear-gradient(160deg, #0b0f24 0%, #160b26 60%, #06070c 100%);
    border-bottom: 1px solid rgba(255,255,255,.08);
  }
  .kicker { font-size: 15px; letter-spacing: 6px; text-transform: uppercase; color: #9fb2ff; font-weight: 700; }
  .headline {
    font-family: ${DISPLAY}; font-size: 132px; line-height: .95; margin: 22px 0 26px;
    font-weight: 700; font-style: italic; letter-spacing: -3px;
    background: linear-gradient(100deg, #ffffff 10%, #b9c6ff 40%, #ff9ac1 75%, #ffd89a 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .dek { font-size: 26px; max-width: 900px; color: #c9d1ea; font-weight: 300; }
  .byline { margin-top: 34px; font-size: 15px; color: #8a93a8; }
  .byline b { color: #e9ecf5; }
  .live { display: inline-block; width: 10px; height: 10px; border-radius: 5px; background: #ff5c8a;
          margin-right: 8px; animation: pulse 1s ease-in-out infinite alternate; }
  .orb { position: absolute; border-radius: 50%; opacity: .55; }
  .o1 { width: 220px; height: 220px; right: 140px; top: 70px;
        background: radial-gradient(circle at 35% 30%, #ffffff, #8ea2ff 40%, rgba(108,140,255,0) 70%);
        animation: float 5s ease-in-out infinite alternate; }
  .o2 { width: 120px; height: 120px; right: 420px; top: 300px;
        background: radial-gradient(circle at 35% 30%, #fff, #ff8fb3 45%, rgba(255,92,138,0) 72%);
        animation: float 4s ease-in-out -2s infinite alternate; }
  .o3 { width: 70px; height: 70px; right: 90px; top: 360px;
        background: radial-gradient(circle at 35% 30%, #fff, #ffd18a 45%, rgba(255,200,120,0) 72%);
        animation: float 3.2s ease-in-out -1s infinite alternate; }
  @keyframes float { from { transform: translateY(-18px) scale(.94); } to { transform: translateY(22px) scale(1.06); } }
  @keyframes pulse { from { opacity: .35; transform: scale(.8); } to { opacity: 1; transform: scale(1.15); } }
  @keyframes slide { from { transform: translateX(0); } to { transform: translateX(-50%); } }

  .band { overflow: hidden; white-space: nowrap; border-bottom: 1px solid rgba(255,255,255,.08);
          background: linear-gradient(90deg, #6c8cff, #b388ff 50%, #ff5c8a); }
  .ticker { display: inline-block; padding: 14px 0; font-weight: 800; font-size: 20px; letter-spacing: 3px;
            text-transform: uppercase; color: #0a0b12; animation: slide 9s linear infinite; }
  .ticker span { margin: 0 26px; }

  .wrap { padding: 70px 80px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .stat { padding: 26px 26px 22px; border-radius: 22px; background: linear-gradient(180deg, #121628, #0c0f1c);
          border: 1px solid rgba(160,180,255,.18); box-shadow: 0 20px 50px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06); }
  .stat .n { font-family: ${DISPLAY}; font-size: 66px; line-height: 1; font-weight: 700;
             background: linear-gradient(90deg, #9fb2ff, #ff9ac1); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .stat .l { margin-top: 8px; color: #8a93a8; font-size: 15px; }

  h2 { font-family: ${DISPLAY}; font-size: 64px; font-weight: 700; margin: 0 0 18px; letter-spacing: -1px; }
  h2 em { color: #ff9ac1; }
  .cols { column-count: 2; column-gap: 54px; color: #c4cbe0; font-size: 19px; }
  .cols p:first-child::first-letter { font-family: ${DISPLAY}; float: left; font-size: 104px; line-height: .8;
          padding: 8px 12px 0 0; color: #ffd89a; font-weight: 700; }

  .gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px; margin-top: 30px; perspective: 1200px; }
  .card { border-radius: 20px; overflow: hidden; background: #0e1120; border: 1px solid rgba(255,255,255,.08);
          box-shadow: 0 30px 60px rgba(0,0,0,.5); }
  .card:nth-child(3n+1) { transform: rotateY(9deg) rotateX(3deg); }
  .card:nth-child(3n+3) { transform: rotateY(-9deg) rotateX(3deg); }
  .card .cap { padding: 16px 20px 20px; }
  .card h3 { margin: 0 0 6px; font-size: 22px; }
  .card p { margin: 0; color: #9aa3ba; font-size: 15px; line-height: 1.45; }

  .quote { margin: 80px 0; padding: 50px 70px; border-radius: 28px; position: relative;
           background: radial-gradient(circle at 0% 0%, rgba(108,140,255,.25), transparent 50%), #0d1020;
           border: 1px solid rgba(255,154,193,.35); }
  .quote .mark { font-family: ${DISPLAY}; font-size: 220px; line-height: .7; color: #ff5c8a; opacity: .5; position: absolute; left: 30px; top: 40px; }
  .quote p { font-family: ${DISPLAY}; font-style: italic; font-size: 44px; line-height: 1.2; margin: 0 0 0 80px; color: #f4f1ff; }
  .quote cite { display: block; margin: 22px 0 0 80px; font-style: normal; color: #8a93a8; font-size: 16px; letter-spacing: 2px; text-transform: uppercase; }

  table { width: 100%; border-collapse: collapse; font-size: 17px; }
  th { text-align: left; color: #9fb2ff; font-weight: 700; padding: 14px 18px; border-bottom: 2px solid rgba(159,178,255,.4); letter-spacing: 1px; text-transform: uppercase; font-size: 13px; }
  td { padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,.06); }
  tr:nth-child(even) td { background: rgba(255,255,255,.025); }
  td code { font-family: ${MONO}; color: #ffd89a; font-size: 15px; }
  .pill { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; }
  .ok { background: rgba(53,196,139,.18); color: #5fe0aa; } .hot { background: rgba(255,92,138,.18); color: #ff8fb3; }

  .end { margin-top: 70px; padding: 60px; text-align: center; border-radius: 28px;
         background: linear-gradient(120deg, #6c8cff 0%, #b388ff 45%, #ff5c8a 100%); color: #0a0b12; }
  .end b { font-family: ${DISPLAY}; font-size: 72px; font-style: italic; display: block; line-height: 1; }
</style>

<section class="hero">
  <div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div>
  <div class="kicker">The field guide · Issue 120</div>
  <div class="headline">Eight milliseconds<br>to make it real.</div>
  <div class="dek">A document of display type, gradients, shadows, columns and art — laid out and drawn by a component, inside a desktop window, with no browser anywhere.</div>
  <div class="byline"><span class="live"></span><b>Rendered live</b> · react-x11 · @react-x11/components/html</div>
</section>

<div class="band"><div class="ticker">${Array.from({ length: 2 }, () => ['120 Hz', 'Core Animation', 'Bun', 'Yoga', 'ProseMirror', 'Vector tiles', 'GLSL', 'xterm', 'KaTeX', 'Flexbox & grid', 'Zero dropped frames'].map((w) => `<span>✦ ${w}</span>`).join('')).join('')}</div></div>

<div class="wrap">
  <div class="stats">
    <div class="stat"><div class="n">8.3</div><div class="l">milliseconds in a frame at 120 Hz</div></div>
    <div class="stat"><div class="n">1M</div><div class="l">table rows, one screen of them drawn</div></div>
    <div class="stat"><div class="n">200k</div><div class="l">stars in a single draw call</div></div>
    <div class="stat"><div class="n">0</div><div class="l">frames the title cards cost</div></div>
  </div>
</div>

<div class="wrap" style="padding-top: 10px">
  <h2>The question, <em>answered</em></h2>
  <div class="cols">
    <p>${PARAGRAPH.repeat(2)}</p>
    <p>${PARAGRAPH.slice(0, 380)} Each of the scenes before this page spent them differently: the editor on the strip a scroll brought in, the table on one screen of rows, the map on uniforms, the galaxy on two floats and a camera.</p>
    <p>What they share is a rule, and it is the whole of the trick: do the work where nobody can see it. Build the data before it is shown. Paint the next scene before the cut. Let the render server run what it can, and keep the rest of the frame for what moved.</p>
  </div>

  <div class="gallery">
    ${GALLERY.map(([title, text, hue], i) => `<div class="card">${art(100 + i, hue)}<div class="cap"><h3>${title}</h3><p>${text}</p></div></div>`).join('')}
  </div>

  <div class="quote">
    <div class="mark">“</div>
    <p>If a frame is going to be late, make it late where nothing moves.</p>
    <cite>— a rule of this trailer</cite>
  </div>

  <h2>What drew <em>what</em></h2>
  <table>
    <tr><th>Scene</th><th>Drawn by</th><th>Per frame</th><th>Status</th></tr>
    <tr><td>Code editor</td><td><code>&lt;codeeditor&gt;</code></td><td>a copy and a strip</td><td><span class="pill ok">120 fps</span></td></tr>
    <tr><td>Table</td><td><code>&lt;Table&gt;</code></td><td>one screen of rows</td><td><span class="pill ok">120 fps</span></td></tr>
    <tr><td>Map</td><td><code>&lt;mapview&gt;</code> · GL</td><td>uniforms</td><td><span class="pill ok">120 fps</span></td></tr>
    <tr><td>Galaxy</td><td><code>&lt;glarea&gt;</code></td><td>two floats, a camera</td><td><span class="pill ok">120 fps</span></td></tr>
    <tr><td>This page</td><td><code>&lt;htmlview&gt;</code></td><td>the strip the scroll exposed</td><td><span class="pill hot">you are here</span></td></tr>
    <tr><td>Title cards</td><td>Core Animation</td><td>nothing at all</td><td><span class="pill ok">0 frames</span></td></tr>
  </table>

  <div class="end"><b>Same window. Same frame loop.</b><br>Keep scrolling — there is more.</div>
</div>
`;

export function HtmlScene({ active, start, size }: SceneProps): ReactElement {
  const box = useRef(null);
  const pane = useRef<Scroller | null>(null);
  const stops = useRef<(readonly [number, number])[] | null>(null);

  useTick(active, start, (t) => {
    const p = (pane.current ??= findScroller(box.current));
    if (!p) return;
    // the glides, laid out against the page's own length once it has one:
    // the hero held, then down a screen at a time with a beat on each
    if (!stops.current) {
      const room = p.room();
      if (room <= 0) return;
      const step = Math.min(room / 6, size.height * 0.75);
      const out: (readonly [number, number])[] = [
        [0, 0],
        [900, 0],
      ];
      let at = 900;
      for (let i = 1; i <= 6; i++) {
        out.push([at + 650, Math.min(room, step * i)]);
        at += 650 + 550;
        out.push([at, Math.min(room, step * i)]);
      }
      stops.current = out;
    }
    p.scrollTo({ y: Math.round(glide(t, stops.current)) });
  });

  const source = useMemo(() => DOCUMENT, []);
  return (
    <box
      ref={box}
      style={{ width: size.width, height: size.height, overflow: 'scroll' }}
    >
      <Html
        source={source}
        partial={false}
        selectable={false}
        defaultColorScheme="dark"
      />
    </box>
  );
}
