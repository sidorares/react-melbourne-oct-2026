// A million rows: glided through, jumped half a million down, re-sorted,
// selected.
//
// `<Table>` renders the slice of rows in view and two spacers, measures
// what each drawn row became (a message that wraps makes a row taller), and
// indexes the heights — so the scrollbar is honest, and a jump across
// 500,000 rows costs what one screen of rows costs. The glides are slow on
// purpose, and readable: at a dozen pixels a frame the pane copies what
// stayed and draws a strip; much faster, every frame mounts a screen of
// new rows.
//
// The sort is the trick worth saying out loud. Sorting a million rows with
// a comparator is a few hundred milliseconds of one thread, which is a
// stall nobody can hide. So the order is built before it is asked for — a
// bucket sort on the integer latency, in slices, while the trailer plays —
// and handed over with `presorted`: the table shows the order it is given
// and the arrow in the header, and does no work of its own.
import { useMemo, useRef, useState } from 'react';
import type { ReactElement, RefObject } from 'react';
import { Icon } from 'react-x11';

import { Table } from '@react-x11/components/table';
import type {
  TableColumn,
  TableHandle,
  TableHeaderCellState,
} from '@react-x11/components/table';
import { glide, progress, rng, useTick } from '../clock.js';
import { Prepared } from '../idle.js';
import type { SceneProps } from '../scene.js';
import { findScroller } from '../scroll.js';
import type { Scroller } from '../scroll.js';
import { INK, MUTED } from '../shell.js';

export interface LogRow {
  id: number;
  level: 0 | 1 | 2;
  source: number;
  message: number;
  ms: number;
}

export const ROW_COUNT = 1_000_000;

const SOURCES = [
  'renderer',
  'compositor',
  'layout',
  'net',
  'fs',
  'gpu',
  'a11y',
];
const LEVELS = ['info', 'warn', 'error'] as const;
const LEVEL_COLOUR = ['#5b6680', '#f5a524', '#ff5c8a'];
const MESSAGES = [
  'frame flushed',
  'damage coalesced into one strip after the scroll settled',
  'selection ownership taken',
  'glyph atlas grew by one page',
  'reconnecting after the peer closed the stream mid-reply; backing off before the next attempt',
  'cache warmed',
  'layout pass converged in two rounds after the viewport report arrived late',
  'promoted a box to its own layer',
  'tile 14/8186/5448 decoded on a worker',
  'font fallback found a face for the emoji',
  'a frame arrived after its vertical blank, so the clock re-anchored on the next one instead of owing the frames it missed; the scene behind it was painted from the damage it had already claimed, and nothing else moved',
  'the pane scrolled by less than its own height, so the frame copied what stayed and drew only the strip that came into view, then repainted the two rows whose hover state changed under the pointer while it moved',
];

export const tableRows = new Prepared<LogRow[]>('table rows', function* (out) {
  const rand = rng(0x5eed);
  const rows: LogRow[] = new Array(ROW_COUNT);
  for (let i = 0; i < ROW_COUNT; i++) {
    const roll = rand();
    rows[i] = {
      id: i + 1,
      level: roll < 0.84 ? 0 : roll < 0.96 ? 1 : 2,
      source: Math.floor(rand() * SOURCES.length),
      message: Math.floor(rand() * MESSAGES.length),
      // long-tailed, as latencies are
      ms: Math.min(999, Math.floor(-Math.log(1 - rand() * 0.9999) * 60)),
    };
    if (i % 20_000 === 0) yield;
  }
  out(rows);
});

/** The rows by latency, slowest first: a counting sort, a slice at a time. */
export const tableBySlowest = new Prepared<LogRow[]>('table sort', function* (
  out,
) {
  const rows = tableRows.get();
  const counts = new Int32Array(1000);
  for (let i = 0; i < rows.length; i++) {
    counts[rows[i].ms]++;
    if (i % 100_000 === 0) yield;
  }
  // descending: the slowest bucket first
  const starts = new Int32Array(1000);
  let at = 0;
  for (let ms = 999; ms >= 0; ms--) {
    starts[ms] = at;
    at += counts[ms];
  }
  const sorted: LogRow[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    sorted[starts[rows[i].ms]++] = rows[i];
    if (i % 100_000 === 0) yield;
  }
  out(sorted);
});

const fmt = new Intl.NumberFormat('en');

/** A quarter over the table's own 12px, and over the 14 a plain cell
 *  inherits — as the rich text editor is: this is read across a room. */
const TEXT = 15;
const MESSAGE_TEXT = 18;

/** A column's header at that size. The table draws its own caption at 12
 *  and has no slot for its size, so the header is the column's — and with
 *  it the sort mark, which a header of one's own has to draw. */
const headed =
  (label: string) =>
  ({ column, sort }: TableHeaderCellState<LogRow>): ReactElement => (
    <box style={{ flexGrow: 1, flexDirection: 'row', alignItems: 'center' }}>
      <text style={{ fontSize: TEXT, color: INK, textWrap: 'nowrap' }}>
        {label}
      </text>
      <box style={{ flexGrow: 1 }} />
      {sort?.column === column.id ? (
        <Icon
          name={sort.direction === 'asc' ? 'chevronUp' : 'chevronDown'}
          size={12}
          color={MUTED}
        />
      ) : null}
    </box>
  );

export const COLUMNS: TableColumn<LogRow>[] = [
  {
    id: 'id',
    label: '#',
    renderHeader: headed('#'),
    width: 120,
    align: 'end',
    render: (r, s) => (
      <text
        style={{ color: s.color, fontFamily: '$monoFamily', fontSize: TEXT }}
      >
        {fmt.format(r.id)}
      </text>
    ),
  },
  {
    id: 'level',
    label: 'Level',
    renderHeader: headed('Level'),
    width: 98,
    render: (r) => (
      <box style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <box
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: LEVEL_COLOUR[r.level],
          }}
        />
        <text style={{ fontSize: TEXT, color: LEVEL_COLOUR[r.level] }}>
          {LEVELS[r.level]}
        </text>
      </box>
    ),
  },
  {
    id: 'source',
    label: 'Source',
    renderHeader: headed('Source'),
    width: 138,
    value: (r) => SOURCES[r.source],
    render: (r, s) => (
      <text style={{ color: s.color, fontSize: TEXT }}>
        {SOURCES[r.source]}
      </text>
    ),
  },
  {
    id: 'message',
    label: 'Message — wraps, so rows are not one height',
    renderHeader: headed('Message — wraps, so rows are not one height'),
    // the rung the height index exists for
    render: (r, s) => (
      <text style={{ color: s.color, fontSize: MESSAGE_TEXT }}>
        {MESSAGES[r.message]}
      </text>
    ),
  },
  {
    id: 'ms',
    label: 'Latency',
    renderHeader: headed('Latency'),
    width: 232,
    align: 'end',
    render: (r, s) => (
      <box style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {/* square ends: a rounded fill is a path, a square one a rect, and
            a fling paints sixty of these a frame */}
        <box style={{ width: 100, height: 6, backgroundColor: '#1a2030' }}>
          <box
            style={{
              width: Math.max(2, r.ms / 10),
              height: 6,
              backgroundColor:
                r.ms > 300 ? '#ff5c8a' : r.ms > 120 ? '#f5a524' : '#6c8cff',
            }}
          />
        </box>
        <text
          style={{
            color: s.color,
            fontFamily: '$monoFamily',
            fontSize: TEXT,
            width: 70,
            textAlign: 'right',
          }}
        >
          {`${r.ms} ms`}
        </text>
      </box>
    ),
  },
];

// The shot's beats, in ms, and its glides as [ms, px] stops. A glide of
// ~500 px in 600 ms peaks near 12 px a frame at 120 Hz, which is about the
// fastest the table answers with a copy and a strip: past it every frame
// mounts rows, and a frame on a 2x panel grows from 8 ms to 16 by 24 px.
const BEAT = { jump: 1350, end: 3000, sort: 4300 } as const;
const GLIDE_A = [
  [300, 0],
  [950, 520],
] as const;
const GLIDE_B = [
  [BEAT.jump + 450, 0],
  [BEAT.jump + 1100, 480],
] as const;
const GLIDE_C = [
  [BEAT.sort + 450, 0],
  [BEAT.sort + 1100, 520],
  [BEAT.sort + 1500, 520],
  [BEAT.sort + 2100, 1060],
] as const;

export function TableScene({ active, start, size }: SceneProps): ReactElement {
  const table = useRef<TableHandle<LogRow>>(null);
  const natural = useRef(null);
  const bySlowest = useRef(null);
  const scrollers = useRef<{
    natural?: Scroller | null;
    sorted?: Scroller | null;
  }>({});
  const [sorted, setSorted] = useState(false);
  const state = useRef({ deep: 0, sorted: false, picked: 0 });
  const rows = useMemo(
    () => ({ natural: tableRows.get(), sorted: tableBySlowest.get() }),
    [],
  );

  useTick(active, start, (t) => {
    const sc = scrollers.current;
    const pane = state.current.sorted
      ? (sc.sorted ??= findScroller(bySlowest.current))
      : (sc.natural ??= findScroller(natural.current));
    if (!pane) return;
    const s = state.current;
    // Glides you can read: each eases in, travels a dozen rows, settles and
    // holds — and each frame of one is a copy of what stayed plus a strip
    // of new rows, which is what keeps it inside a frame.
    if (t < BEAT.jump) {
      pane.scrollTo({ y: Math.round(glide(t, GLIDE_A)) });
      return;
    }
    // Then a click on the scrollbar's track: half a million rows down in
    // one frame — one screen of rows drawn, as any frame draws at most —
    // held, so the row numbers can be read, and another glide.
    s.deep ||= Math.round(pane.room() * 0.55);
    if (t < BEAT.end) {
      pane.scrollTo({ y: s.deep + Math.round(glide(t, GLIDE_B)) });
      return;
    }
    // …and the End key: the last of the million, row 1,000,000, held.
    if (t < BEAT.sort) {
      pane.scrollTo({ y: Infinity });
      return;
    }
    // Then the header clicked: sorted by latency, a million rows, in the
    // frame it was asked for (see `SortedView`).
    if (!s.sorted) {
      s.sorted = true;
      setSorted(true);
      return;
    }
    pane.scrollTo({ y: Math.round(glide(t, GLIDE_C)) });
    // …and the slowest requests picked out as the last glide passes them
    const want = Math.floor(progress(t, BEAT.sort + 550, BEAT.sort + 1250) * 7);
    while (s.picked < want) {
      const row = rows.sorted[1 + s.picked * 3];
      if (row) table.current?.select(row.id);
      s.picked++;
    }
  });

  // Two tables, one shown. A table handed a new million-row array wraps
  // every row before it draws one — 60-80 ms of this thread, in the frame
  // the click asked for. So the sorted view is its own table, rendered with
  // the rest of the scene before the cut and parked off the stage: the
  // click only swaps which of the two is on it.
  //
  // Parked, not hidden. Both are laid out at the stage's real size the
  // whole time, so a window resized before the click — gone full screen
  // mid-trailer — reaches the sorted table as it reaches the one on show.
  // Kept under a hidden <Activity> instead, it missed the resize: shown
  // after one, its columns were laid out at a width the stage no longer
  // had, and in two runs of six the window died on a NaN layout.
  const on = {
    position: 'absolute',
    left: 18,
    top: 18,
    width: size.width - 36,
    height: size.height - 18,
  } as const;
  const off = { ...on, left: -(size.width + 64) };
  return (
    <box style={{ flexGrow: 1 }}>
      <box ref={natural} style={sorted ? off : on}>
        <LogTable rows={rows.natural} sort={null} />
      </box>
      <box ref={bySlowest} style={sorted ? on : off}>
        <LogTable rows={rows.sorted} sort={SLOWEST} handle={table} />
      </box>
    </box>
  );
}

const SLOWEST = { column: 'ms', direction: 'desc' } as const;

function LogTable({
  rows,
  sort,
  handle,
}: {
  rows: LogRow[];
  sort: typeof SLOWEST | null;
  handle?: RefObject<TableHandle<LogRow> | null>;
}): ReactElement {
  return (
    <Table<LogRow>
      ref={handle}
      rows={rows}
      columns={COLUMNS}
      presorted
      sort={sort}
      estimatedRowHeight={38}
      // The fast-scroll pill is left out: while it is up it stands over
      // the pane, and a pane with something painted over it cannot scroll
      // by copying — every frame after a jump repainted the whole table,
      // 9-14 ms a frame where the copy is 3.5.
      renderScrollHint={() => null}
      styles={{
        // room for the larger caption: the table's own header is 24 high
        header: { height: 32 },
        row: (s) =>
          !s.selected && s.index % 2 === 1 && { backgroundColor: '#0c0f17' },
      }}
      aria-label="Log rows"
      style={{
        flexGrow: 1,
        minHeight: 0,
        borderWidth: 1,
        borderColor: '#1b2030',
        borderRadius: 10,
      }}
    />
  );
}
