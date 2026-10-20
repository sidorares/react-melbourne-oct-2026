// A board of four long lists: cards dragged by a hand that is not there,
// and walked from the keyboard.
//
// **The drags** are the board's own, the way a sortable list draws one: a
// card is picked up — its slot becomes a dashed drop area — carried along
// a curve the way a hand moves (it eases out, arcs, overshoots a little and
// settles), and the cards it passes slide apart to make room for it. The
// sliding is core's: each card's `marginTop` has a `transition`, so a card
// moves by a layout transition when the gap opens above it or closes. A
// script cannot hold a real pointer — on macOS a drag is AppKit's drag
// session — so the hand is drawn, and the drop is what `onReorder` would
// report: `arrayMove`, or a move between two lists.
//
// **The keyboard** is `<ReorderList>`'s own: a card lifted (Return),
// stepped a slot at a time (Down, Up), dropped (Return), each step an
// `onReorder`. The keys go where a key press goes — the item's own
// `onKeyDown`, found on its node as the event dispatcher finds it.
import { memo, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { Style } from 'react-x11';
import { XK_DOWN, XK_RETURN, XK_UP } from 'react-x11/keysyms';

import {
  ReorderItem,
  ReorderList,
  arrayMove,
} from '@react-x11/components/reorder';
import type { ReorderId } from '@react-x11/components/reorder';
import {
  easeInOutSine,
  easeOutCubic,
  progress,
  rng,
  useTick,
} from '../clock.js';
import type { SceneProps } from '../scene.js';
import { ACCENT, INK, MUTED, PANEL } from '../shell.js';

interface Card {
  id: string;
  title: string;
  tag: number;
  who: string;
  done: number;
}

const COLUMNS = ['Backlog', 'In progress', 'Review', 'Shipped'];
const PER_COLUMN = 40;
const TAGS = [
  ['perf', '#6c8cff'],
  ['a11y', '#35c48b'],
  ['macOS', '#b388ff'],
  ['bug', '#ff5c8a'],
  ['docs', '#f5a524'],
] as const;
const VERBS = [
  'Promote',
  'Cache',
  'Batch',
  'Measure',
  'Lift',
  'Virtualize',
  'Blit',
  'Pace',
  'Decode',
  'Shape',
];
const NOUNS = [
  'the hover fades',
  'glyph runs',
  'tile buckets',
  'row heights',
  'the drag ghost',
  'shadow tiles',
  'selection bands',
  'the frame clock',
  'label atlases',
  'scroll strips',
];
const PEOPLE = ['AS', 'KZ', 'MJ', 'RL', 'TP', 'DN'];

function board(): Card[][] {
  const rand = rng(99);
  return COLUMNS.map((_, c) =>
    Array.from({ length: PER_COLUMN }, (_, i) => ({
      id: `c${c}-${i}`,
      title: `${VERBS[Math.floor(rand() * VERBS.length)]} ${NOUNS[Math.floor(rand() * NOUNS.length)]}`,
      tag: Math.floor(rand() * TAGS.length),
      who: PEOPLE[Math.floor(rand() * PEOPLE.length)],
      done: rand(),
    })),
  );
}

/** A key, as core hands one to `onKeyDown`. */
const key = (keysym: number) => ({
  keysym,
  codepoint: 0,
  key: '',
  defaultPrevented: false,
  preventDefault() {},
  stopPropagation() {},
});

interface KeyNode {
  parent?: KeyNode | null;
  props?: { onKeyDown?: (ev: unknown) => void };
}

/** The item's own key handler, found the way dispatch finds it: up from a
 *  node inside the item to the first that has one. */
function pressOn(node: KeyNode | null, keysym: number): void {
  for (let n = node; n; n = n.parent ?? null) {
    if (n.props?.onKeyDown) {
      n.props.onKeyDown(key(keysym));
      return;
    }
  }
}

/** One card's walk from the keyboard: how far, and when. */
interface Walk {
  card: string;
  steps: number;
  at: number;
}

const WALKS: Walk[] = [
  { card: 'c3-1', steps: 5, at: 400 },
  { card: 'c3-8', steps: -6, at: 1900 },
  { card: 'c2-9', steps: -4, at: 3700 },
];
const STEP_MS = 95;

/** One card's drag: where it goes, when, and how long the hand takes. */
interface Drag {
  card: string;
  to: readonly [number, number];
  at: number;
  ms: number;
  /** How far the hand's path bows, in px. */
  arc: number;
}

// one at a time — there is one hand
const DRAGS: Drag[] = [
  { card: 'c0-1', to: [0, 5], at: 250, ms: 1100, arc: 90 },
  { card: 'c1-0', to: [2, 2], at: 1850, ms: 1300, arc: 140 },
  { card: 'c0-6', to: [1, 0], at: 3600, ms: 1050, arc: 110 },
  { card: 'c3-3', to: [0, 3], at: 5100, ms: 1450, arc: 170 },
];
const LIFT_MS = 170;
const SETTLE_MS = 150;

const PAD = 24;
const GAP = 18;
const HEAD = 34;
const CARD_H = 82;
const ROW_GAP = 8;
const PITCH = CARD_H + ROW_GAP;
const LIST_TOP = PAD + HEAD + 12;
const SLIDE = { marginTop: 170 };

interface Lifted {
  card: Card;
  /** Where the drop area is: the column and the slot. */
  col: number;
  index: number;
  /** This commit opens or closes the gap at once — the pick-up and the
   *  drop, where a card leaves or lands in the same frame. */
  instant: boolean;
}

/** A point on a cubic Bézier. */
function bezier(a: number, b: number, c: number, d: number, s: number): number {
  const u = 1 - s;
  return u * u * u * a + 3 * u * u * s * b + 3 * u * s * s * c + s * s * s * d;
}

export function ReorderScene({
  active,
  start,
  size,
}: SceneProps): ReactElement {
  const [columns, setColumns] = useState(board);
  const [lifted, setLifted] = useState<Lifted | null>(null);
  const live = useRef({ columns, lifted });
  live.current = { columns, lifted };
  const nodes = useRef(new Map<ReorderId, KeyNode>());
  const walked = useRef(new Map<Walk, number>());
  const dragged = useRef(new Map<Drag, 'lifted' | 'dropped'>());
  /** Where each drag picked its card up: column, slot. */
  const origins = useRef(new Map<Drag, readonly [number, number]>());
  const ghost = useRef<(pos: GhostPos | null) => void>(() => {});
  const moves = useMemo(
    () =>
      COLUMNS.map(
        (_, c) =>
          (from: number, to: number): void =>
            setColumns((all) =>
              all.map((list, i) =>
                i === c ? arrayMove(list, from, to) : list,
              ),
            ),
      ),
    [],
  );

  const width = Math.floor((size.width - PAD * 2 - GAP * 3) / 4);
  const height = size.height - PAD * 2;
  const colX = (c: number): number => PAD + c * (width + GAP);

  useTick(active, start, (t) => {
    // --- the keyboard ---
    for (const walk of WALKS) {
      const due = Math.floor((t - walk.at) / STEP_MS) + 1;
      if (due <= 0) continue;
      const total = Math.abs(walk.steps) + 2;
      let pressed = walked.current.get(walk) ?? 0;
      while (pressed < Math.min(due, total)) {
        const keysym =
          pressed === 0 || pressed === total - 1
            ? XK_RETURN
            : walk.steps > 0
              ? XK_DOWN
              : XK_UP;
        pressOn(nodes.current.get(walk.card) ?? null, keysym);
        pressed++;
      }
      walked.current.set(walk, pressed);
    }

    // --- the hand ---
    for (const drag of DRAGS) {
      const phase = dragged.current.get(drag);
      if (t < drag.at || phase === 'dropped') continue;
      const { columns: cols } = live.current;
      if (!phase) {
        // pick up: the card leaves its list, and its slot is the drop area
        const col = cols.findIndex((l) => l.some((c) => c.id === drag.card));
        if (col < 0) continue;
        const index = cols[col].findIndex((c) => c.id === drag.card);
        const card = cols[col][index];
        dragged.current.set(drag, 'lifted');
        origins.current.set(drag, [col, index]);
        setColumns((all) =>
          all.map((l, i) =>
            i === col ? l.filter((c) => c.id !== card.id) : l,
          ),
        );
        setLifted({ card, col, index, instant: true });
      }
      const [fc, fi] = origins.current.get(drag) ?? drag.to;
      const x0 = colX(fc);
      const y0 = LIST_TOP + fi * PITCH;
      const x3 = colX(drag.to[0]);
      const y3 = LIST_TOP + drag.to[1] * PITCH;
      const local = t - drag.at;
      // the lift: up and a little to the side, as a card comes off a table
      const lift = easeOutCubic(progress(local, 0, LIFT_MS));
      // the carry: eased, a 4% overshoot, then the settle back onto the slot
      const k = progress(local, LIFT_MS, LIFT_MS + drag.ms);
      const s =
        k < 0.86
          ? easeInOutSine(k / 0.86) * 1.04
          : 1.04 - 0.04 * easeOutCubic((k - 0.86) / 0.14);
      const dx = x3 - x0;
      const dy = y3 - y0;
      const bow = drag.arc * (dx === 0 ? 1 : -Math.sign(dy || 1));
      let x = bezier(
        x0,
        x0 + dx * 0.15 + bow,
        x3 - dx * 0.25 + bow * 0.6,
        x3,
        s,
      );
      let y = bezier(
        y0,
        y0 + dy * 0.1 - Math.abs(bow) * 0.4,
        y3 - dy * 0.15,
        y3,
        s,
      );
      // a hand is not a plotter
      const tremor =
        Math.sin(local / 37) * Math.sin(local / 91) * 2.2 * (1 - lift * k);
      x += tremor - 5 * lift * (1 - k);
      y += tremor * 0.6 - 7 * lift * (1 - k);
      ghost.current({
        x,
        y,
        width,
        lift:
          lift *
          (1 -
            easeOutCubic(
              progress(local, LIFT_MS + drag.ms, LIFT_MS + drag.ms + SETTLE_MS),
            )),
      });

      // where it would land now: the column under the card's middle, the
      // slot nearest its top — the cards there part to make room
      const mid = x + width / 2;
      const over = COLUMNS.findIndex(
        (_, c) => mid >= colX(c) - GAP / 2 && mid < colX(c) + width + GAP / 2,
      );
      const cur = live.current.lifted;
      if (cur && over >= 0) {
        const len = live.current.columns[over].length;
        const index = Math.max(
          0,
          Math.min(len, Math.round((y - LIST_TOP) / PITCH)),
        );
        if (index !== cur.index || over !== cur.col) {
          setLifted({ ...cur, col: over, index, instant: false });
        }
      }

      // the drop: into the gap, which is where it already is
      if (local >= LIFT_MS + drag.ms + SETTLE_MS && cur) {
        dragged.current.set(drag, 'dropped');
        setColumns((all) =>
          all.map((l, i) =>
            i === cur.col
              ? [...l.slice(0, cur.index), cur.card, ...l.slice(cur.index)]
              : l,
          ),
        );
        setLifted(null);
        ghost.current(null);
      }
    }
  });

  return (
    <box style={{ flexGrow: 1 }}>
      {columns.map((cards, c) => (
        <Column
          key={COLUMNS[c]}
          title={COLUMNS[c]}
          cards={cards}
          gap={lifted && lifted.col === c ? lifted.index : -1}
          instant={lifted?.instant ?? true}
          move={moves[c]}
          nodes={nodes.current}
          box={{
            position: 'absolute',
            left: colX(c),
            top: PAD,
            width,
            height,
          }}
        />
      ))}
      {/* The hand's layer: the drop area and the card in the hand, in a box
          of their own sized in numbers, so a step of the hand is measured
          inside it and not across the board's 160 cards (shell.tsx,
          `sceneBox`). */}
      <box
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: size.width,
          height: size.height,
          pointerEvents: 'none',
        }}
      >
        {lifted ? (
          <box
            style={{
              position: 'absolute',
              left: colX(lifted.col),
              top: LIST_TOP + lifted.index * PITCH,
              width,
              height: CARD_H,
              borderRadius: 10,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: ACCENT,
              backgroundColor: 'rgba(108, 140, 255, 0.08)',
              transition: lifted.instant ? undefined : { top: 170, left: 170 },
            }}
          />
        ) : null}
        {lifted ? <Ghost card={lifted.card} setter={ghost} /> : null}
      </box>
    </box>
  );
}

interface GhostPos {
  x: number;
  y: number;
  width: number;
  lift: number;
}

/** The card in the hand. Its own component, so a frame of the carry
 *  renders the ghost and nothing else. */
function Ghost({
  card,
  setter,
}: {
  card: Card;
  setter: { current: (pos: GhostPos | null) => void };
}): ReactElement | null {
  const [pos, setPos] = useState<GhostPos | null>(null);
  setter.current = setPos;
  if (!pos) return null;
  return (
    <box
      style={{
        position: 'absolute',
        left: Math.round(pos.x),
        top: Math.round(pos.y),
        width: pos.width,
        height: CARD_H,
        padding: 12,
        gap: 8,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: ACCENT,
        backgroundColor: '#1d2440',
        boxShadow: `0 ${Math.round(6 + 14 * pos.lift)}px ${Math.round(14 + 26 * pos.lift)}px rgba(0, 0, 0, 0.55)`,
        pointerEvents: 'none',
      }}
    >
      <CardFace card={card} />
    </box>
  );
}

/** One list. Memoized: a step in one column re-renders that column. */
const Column = memo(function Column({
  title,
  cards,
  gap,
  instant,
  move,
  nodes,
  box,
}: {
  title: string;
  cards: Card[];
  /** The slot the drop area is in, or -1. */
  gap: number;
  instant: boolean;
  move: (from: number, to: number) => void;
  nodes: Map<ReorderId, KeyNode>;
  box: Style;
}): ReactElement {
  return (
    <box style={[box, { gap: 12 }]}>
      <box
        style={{
          height: HEAD,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <text style={{ fontSize: 17, fontWeight: 'bold', color: INK }}>
          {title}
        </text>
        <text style={{ fontSize: 14, color: MUTED }}>
          {cards.length + (gap >= 0 ? 1 : 0)}
        </text>
      </box>
      <ReorderList
        onReorder={(e) => move(e.from, e.to)}
        styles={LIST_STYLES}
        style={{ flexGrow: 1, minHeight: 0, overflow: 'scroll', gap: ROW_GAP }}
      >
        {cards.map((card, i) => (
          <ReorderItem
            key={card.id}
            id={card.id}
            // the room the card in the hand would land in, opened above the
            // card that would follow it and closed again as the hand moves
            // on, both as layout transitions — one of four styles made
            // once, so a card the gap does not touch is handed the same
            // object and core has nothing to compare
            style={ITEM[i === gap ? 'gap' : 'rest'][instant ? 'now' : 'slide']}
          >
            <CardBody card={card} nodes={nodes} />
          </ReorderItem>
        ))}
      </ReorderList>
    </box>
  );
});

const LIST_STYLES = {
  item: (s: { lifted: boolean }) =>
    s.lifted && {
      backgroundColor: '#1d2440',
      borderColor: ACCENT,
      borderWidth: 2,
    },
};

const ITEM_STYLE = {
  height: CARD_H,
  padding: 12,
  gap: 8,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: '#1b2030',
  backgroundColor: PANEL,
} as const;

const ITEM = {
  rest: {
    now: { ...ITEM_STYLE, marginTop: 0 },
    slide: { ...ITEM_STYLE, marginTop: 0, transition: SLIDE },
  },
  gap: {
    now: { ...ITEM_STYLE, marginTop: PITCH },
    slide: { ...ITEM_STYLE, marginTop: PITCH, transition: SLIDE },
  },
} as const;

const CardBody = memo(function CardBody({
  card,
  nodes,
}: {
  card: Card;
  nodes: Map<ReorderId, KeyNode>;
}): ReactElement {
  const ref = useMemo(
    () => (node: KeyNode | null) => {
      if (node) nodes.set(card.id, node);
    },
    [card.id, nodes],
  );
  return (
    <box ref={ref as never} style={{ gap: 8 }}>
      <CardFace card={card} />
    </box>
  );
});

function CardFace({ card }: { card: Card }): ReactElement {
  const [name, colour] = TAGS[card.tag];
  return (
    <>
      <text style={{ fontSize: 15, color: INK }}>{card.title}</text>
      <box style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <box
          style={{
            paddingLeft: 7,
            paddingRight: 7,
            paddingTop: 2,
            paddingBottom: 2,
            borderRadius: 6,
            backgroundColor: `${colour}33`,
          }}
        >
          <text style={{ fontSize: 12, color: colour }}>{name}</text>
        </box>
        <box style={{ flexGrow: 1, height: 4, backgroundColor: '#1a2030' }}>
          <box
            style={{
              width: `${Math.round(card.done * 100)}%`,
              height: 4,
              backgroundColor: colour,
            }}
          />
        </box>
        <box
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: '#232a40',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <text style={{ fontSize: 10, color: MUTED }}>{card.who}</text>
        </box>
      </box>
    </>
  );
}
