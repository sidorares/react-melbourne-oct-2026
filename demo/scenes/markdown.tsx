// Markdown arriving the way a model writes it: a few characters at a time,
// rendered at every instant, with the view following the end.
//
// `<Markdown partial>` never shows raw syntax — an unclosed `**` or a
// half-arrived link renders as what it will be — and re-renders only the
// block the stream is in: the blocks above it keep their nodes and their
// layout, so a frame costs the paragraph being written, not the document.
// The fences are the `fences` seam: ```math is a `<Formula>`, typeset by
// KaTeX's layout as it streams, and ```mermaid is a `<Mermaid>`, compiled
// by ondine on every append and holding the last diagram that compiled.
import { useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { Formula } from '@react-x11/components/formula';
import { Markdown } from '@react-x11/components/markdown';
import type { FenceInfo } from '@react-x11/components/markdown';
import { Mermaid } from '@react-x11/components/mermaid';
import { useTick } from '../clock.js';
import type { SceneProps } from '../scene.js';
import { findScroller } from '../scroll.js';
import type { Scroller } from '../scroll.js';

const DOCUMENT = `# Building a desktop app that keeps up

You asked how to build a desktop app in React that **never drops a frame**.
Short answer: you can't promise *never*, but you can make every late frame
land where nothing moves. Here is the long answer, in the order it matters.

## 1. Know what a frame costs

A frame is late for one of three reasons, and **only one of them is the
renderer's**. The other two — *the work you asked for* and ~~the garbage
collector~~ the allocation you made — are yours.

| phase | where the time goes | what makes it cheap |
| :---- | :------------------ | :------------------ |
| React | reconciling what changed | memoized rows, stable props |
| layout | yoga, and the content floors | a box sized in numbers |
| paint | the damage, at device pixels | a scroll that copies |
| present | the swapchain, a memcpy | a layer that moves itself |

\`\`\`mermaid
flowchart LR
  S[state change] --> R[React]
  R --> L[layout]
  L --> P[paint]
  P --> X[present]
  T[scroll] -->|a copy| P
\`\`\`

The budget, written down:

\`\`\`math
T_{react} + T_{layout} + T_{paint} + T_{present} \\le \\frac{1}{f_{display}} = 8.3\\,\\text{ms}
\`\`\`

## 2. Measure before you guess

Put a frame loop in, and keep the gaps:

\`\`\`ts
const gaps: number[] = [];
let last = performance.now();
window.requestAnimationFrame(function tick(now) {
  gaps.push(now - last);
  last = now;
  window.requestAnimationFrame(tick);
});
\`\`\`

Then read them the way the display does:

- a gap under **1.5 periods** is a frame on time;
- a longer one is a **dropped frame** — but only if something was moving;
- a gap under a still card is *invisible*, and that is where work belongs.

> A dropped frame is a gap longer than one and a half periods **in which
> something was moving**. Under a still card, nobody can see it.

## 3. Build the data before it is shown

Big data is a stall in the frame that first needs it. Make it earlier, in
slices, and yield between them:

\`\`\`ts
function* rows(out: (rows: Row[]) => void) {
  const all: Row[] = new Array(1_000_000);
  for (let i = 0; i < all.length; i++) {
    all[i] = makeRow(i);
    if (i % 20_000 === 0) yield; // five milliseconds, then a frame
  }
  out(all);
}
\`\`\`

1. Start the generators the moment the window is up.
2. Pump them for a few milliseconds between frames.
3. Let a scene that arrives early finish the rest **on the spot**.

\`\`\`mermaid
sequenceDiagram
  participant F as frame loop
  participant I as idle pump
  participant G as rows()
  F->>I: frame done, 11 ms left
  I->>G: next()
  G-->>I: yield, 20,000 rows later
  I-->>F: back before the deadline
  F->>F: next frame, on time
\`\`\`

## 4. Render the next scene before the cut

React can build a tree nobody sees yet:

\`\`\`tsx
<Activity mode={next ? 'visible' : 'hidden'}>
  <Scene start={start} />
</Activity>
\`\`\`

- [x] the tree is built at idle priority
- [x] effects wait until it is shown
- [ ] layout and paint still happen at the cut — so show it *under* the card

## 5. Let the render server run what it can

On macOS, an animation a layer can express costs your thread **nothing**:

| animation | runs on | frames from JS |
| :-- | :-- | --: |
| \`opacity\` transition on a box | Core Animation | 0 |
| \`backgroundColor\` loop | Core Animation | 0 |
| CSS \`@keyframes\` in \`<Html>\` | a sprite layer | 0 |
| \`<video src>\` | AVFoundation | 0 |
| a scroll | the frame clock, as a copy | 1 a frame |

\`\`\`json
{
  "promoted": ["card", "lower-third", "progress-dots"],
  "sprites": ["logo letters", "orbs", "marquee"],
  "layers": ["video", "map", "galaxy"]
}
\`\`\`

## 6. Scroll in glides, not blurs

A constant fling is a wall of blur *and* the most expensive frame there is.
Ease in, travel, settle, **hold** — then the next glide:

\`\`\`math
y(t) = y_0 + (y_1 - y_0)\\,\\frac{1 - \\cos(\\pi t / T)}{2}
\`\`\`

Kept under a dozen pixels a frame, a scroll is a copy of what stayed and a
strip of what came in.

## 7. Size things in numbers

Every box carries a floor of its content's size, measured again on every
frame that lays anything out. A box **absolutely placed at a numeric width
and height** holds a change inside itself:

\`\`\`tsx
<box style={{ position: 'absolute', left: 0, top: 0, width, height }}>
  {scene}
</box>
\`\`\`

## 8. Run the production build

\`\`\`bash
NODE_ENV=production bun examples/stress-demo.tsx
\`\`\`

React's development build logs a performance-track entry for every render,
with a diff of the props — and \`structuredClone\`s it. Hand a component a
million rows and that is a **6.4-second** stall that is not yours.

## 9. Virtualize what is long

A list of a million rows is **one screen of rows** and two spacers. What
the scrollbar needs is the height of the rest, and that is an index, not a
render:

| rows | rendered | measured | memory |
| --: | --: | --: | --: |
| 1,000 | 40 | 40 | small |
| 100,000 | 40 | as seen | an index |
| 1,000,000 | 40 | as seen | an index |

Rows of different heights are fine — measure each one as it is drawn, keep
an estimate for the rest, and correct the scroll where the estimate was
wrong. *Never* lay a million rows out to find where row 600,000 is.

## 10. Keep React out of the hot path

React is the right tool for **what** is on screen and the wrong one for
**where**, sixty times a second:

- a camera is two numbers on an element — \`map.setCamera()\`, not state;
- a scroll is \`pane.scrollTo()\`, not a re-render of the list;
- a drag ghost is one small component, re-rendered alone;
- a uniform is \`material.uniforms.uTime.value = t\`.

\`\`\`tsx
useFrame((state) => {
  material.current.uniforms.uTime.value = state.clock.elapsedTime;
  state.camera.position.set(Math.cos(t) * r, h, Math.sin(t) * r);
});
\`\`\`

What *does* go through React should change rarely and touch little: a page
of data, a selection, a gap in a list.

## 11. Text is the expensive part of 2D

Shaping a line costs more than drawing it. So:

1. **Shape once**, draw many times — a label at a new size is a new shape.
2. Keep strings **stable** — a number formatted differently every frame is
   a new layout every frame.
3. Prefer **one run** to many: every style change splits a line.

\`\`\`math
T_{text} \\approx n_{lines} \\cdot (c_{shape} + c_{draw}), \\quad c_{shape} \\gg c_{draw}
\`\`\`

## 12. When it is a scene, use the GPU

A map, a graph at every zoom, a galaxy: anything whose viewport is a
**transform** wants to be drawn, not composed. On a GPU a pan is a uniform
and a zoom is arithmetic:

- [x] vector tiles built into buckets on workers, drawn every frame
- [x] graph edges as instanced quads, labels as distance fields
- [x] 200,000 points in **one** draw call
- [ ] a text editor — that one stays 2D, and copies its scroll

## 13. A profiling recipe

\`\`\`bash
# where the frame goes, on the thread that paints it
REACT_X11_THREADED=0 bun --cpu-prof --cpu-prof-dir=prof examples/stress-demo.tsx --only=table

# every frame's gap and paint, one shot at a time
bun examples/stress-demo.tsx --only=map --trace=trace.json --exit
\`\`\`

Then sort by self time and look for three shapes:

| shape | usually means | try |
| :-- | :-- | :-- |
| \`_applyContentFloors\` | the whole tree re-measured | size the box in numbers |
| \`_paintRegion\`, full window | a scroll that could not copy | find what is painted over it |
| \`structuredClone\` in React | the development build | \`NODE_ENV=production\` |

## FAQ

**Is this a browser?** No. There is no DOM and no HTML engine under the
editor or the table — they are React components over a renderer that draws
with the platform's own 2D context.

**Does it run on Linux?** Yes — X11 and Wayland, and Windows too. The
render-server tricks are macOS's; elsewhere the same animations run on the
frame clock.

**Can I use my React components?** The ones that render \`<div>\`s, no. The
ones that are hooks, state and logic — yes, unchanged.

## 14. Put it together

A whole scene, the way this trailer writes one — data built before, motion
as a function of time, React only for what changes rarely:

\`\`\`tsx
export function TableScene({ active, start }: SceneProps) {
  const rows = useMemo(() => tableRows.get(), []); // built while you waited
  const pane = useRef<Scroller | null>(null);
  const box = useRef(null);

  useTick(active, start, (t) => {
    pane.current ??= findScroller(box.current);
    // glides you can read: ease in, travel, settle, hold
    pane.current?.scrollTo({ y: Math.round(glide(t, STOPS)) });
  });

  return (
    <box ref={box} style={{ flexGrow: 1 }}>
      <Table rows={rows} columns={COLUMNS} estimatedRowHeight={30} />
    </box>
  );
}
\`\`\`

Three things in it are worth copying:

1. **\`useMemo\` over prepared data** — the million rows exist before the
   first render asks for them.
2. **\`useTick\`, not \`useState\`** — the scroll position never becomes
   React state, so a frame of motion renders nothing.
3. **A glide, not a velocity** — the position is a pure function of \`t\`,
   so a late frame shows it further along instead of slowing it down.

### And what it costs

| frame | React | layout | paint | total |
| :-- | --: | --: | --: | --: |
| a glide step | 0.0 ms | 0.4 ms | 1.9 ms | **2.3 ms** |
| a jump | 2.1 ms | 3.0 ms | 9.0 ms | 14.1 ms |
| a re-sort | 0.0 ms | 4.0 ms | 10.0 ms | 14.0 ms |

The jump and the re-sort are a frame each, at a moment the eye expects a
change — and everything between them fits in a quarter of the budget.

## Checklist

- [x] one frame loop, everything a function of time
- [x] data built in idle slices
- [x] the next scene rendered, and painted, before the cut
- [x] cards and titles on Core Animation
- [x] scenes sized in numbers
- [x] production React, under Bun
- [ ] the frame you have not measured yet

> If a frame is going to be late, make it late where nothing moves.
`;

const FENCES = {
  math: ({ text, partial }: FenceInfo) => (
    <Formula tex={text} display partial={partial} />
  ),
  mermaid: ({ text, partial }: FenceInfo) => (
    <Mermaid source={text} partial={partial} />
  ),
};

/** Characters a second: a fast model — faster than reading, slower than
 *  the eye loses it. */
const CPS = 1450;

export function MarkdownScene({
  active,
  start,
  size,
}: SceneProps): ReactElement {
  const [length, setLength] = useState(0);
  const box = useRef(null);
  const pane = useRef<Scroller | null>(null);
  const follow = useRef(0);
  const fences = useMemo(() => FENCES, []);

  useTick(active, start, (t, dt) => {
    const want = Math.min(DOCUMENT.length, Math.floor((t / 1000) * CPS));
    if (want !== length) setLength(want);
    // the view eases after the end of the document, as a chat pane does
    const p = (pane.current ??= findScroller(box.current));
    if (p) {
      const room = p.room();
      follow.current += (room - follow.current) * Math.min(1, dt / 120);
      if (Math.abs(room - follow.current) < 0.5) follow.current = room;
      p.scrollTo({ y: Math.round(follow.current) });
    }
  });

  const done = length >= DOCUMENT.length;
  return (
    <box style={{ flexGrow: 1, alignItems: 'center' }}>
      <box
        ref={box}
        style={{
          // a column as wide as the text is large: the size of a chat
          // answer read from across a room
          width: Math.min(1440, size.width - 64),
          height: size.height,
          overflow: 'scroll',
        }}
      >
        <Markdown
          source={DOCUMENT.slice(0, length)}
          partial={!done}
          fences={fences}
          fontSize={21}
          style={{ padding: 28 }}
        />
      </box>
    </box>
  );
}
