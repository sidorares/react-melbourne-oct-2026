// A report scrolled through, a page at a time: six pages, each a different
// kind of chart laid out its own way — stacked areas under headline
// numbers, grouped and stacked bars, a million points zoomed into, a live
// series beside small multiples, a histogram over percentiles, a cloud of
// two hundred thousand.
//
// Scrolled, not swapped. A dashboard that keeps its grid and changes its
// numbers turns a page with nothing on the screen moving: it reads as a
// freeze and then a jump. Pages that glide up past each other are seen to
// go, and each one is different enough to be seen to arrive.
//
// Every chart is one element, `<chartplot>`, whose frame is bounded by its
// pixels and never by its points: the million-point line reads a min/max
// pyramid two or three blocks a pixel column, so its zoom from all of them
// to a couple of thousand costs what a chart of a hundred costs, every
// frame of it. The pages' data is built before the shot (idle.ts), and a
// glide copies what stayed on screen and draws only the strip coming in.
import { useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import {
  AreaChart,
  AreaSeries,
  BarChart,
  BarSeries,
  CartesianGrid,
  ChartContainer,
  ChartData,
  LineChart,
  LineSeries,
  ScatterChart,
  ScatterSeries,
  XAxis,
  YAxis,
} from '@react-x11/components/charts';
import { MILLION, cloudData, millionData } from '../chart-data.js';
import { easeInOutCubic, glide, progress, rng, useTick } from '../clock.js';
import { Prepared } from '../idle.js';
import type { SceneProps } from '../scene.js';
import { findScroller } from '../scroll.js';
import type { Scroller } from '../scroll.js';
import { ACCENT, INK, MUTED, PANEL } from '../shell.js';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const REGIONS = ['EMEA', 'Americas', 'APAC', 'LATAM', 'ANZ', 'Nordics'];

type Columns = { length: number; columns: Record<string, Float64Array> };

interface Report {
  traffic: Columns;
  months: { month: string; web: number; desktop: number; mobile: number }[];
  quarters: { quarter: string; web: number; desktop: number; mobile: number }[];
  regions: Columns[];
  histogram: { ms: string; count: number }[];
  percentiles: Columns;
}

/** The report's data, made once, before the shot. */
export const chartPages = new Prepared<Report>('chart pages', function* (out) {
  millionData();
  yield;
  cloudData();
  yield;
  const rand = rng(2026);
  /** A random walk per named column, `n` long, against `t`. */
  const walks = (
    n: number,
    names: Record<string, [start: number, drift: number, wave: number]>,
  ): Columns => {
    const t = new Float64Array(n);
    for (let i = 0; i < n; i++) t[i] = i;
    const columns: Record<string, Float64Array> = { t };
    let k = 0;
    for (const [name, [startAt, drift, wave]] of Object.entries(names)) {
      const col = new Float64Array(n);
      let v = startAt;
      for (let i = 0; i < n; i++) {
        v = Math.max(1, v + (rand() - 0.5 + drift) * startAt * 0.06);
        col[i] = v + wave * Math.sin(i / (40 + k * 9) + k);
      }
      columns[name] = col;
      k++;
    }
    return { length: n, columns };
  };
  const traffic = walks(1200, {
    a: [24, 0.02, 4],
    b: [16, 0, 3],
    c: [8, 0.03, 1],
  });
  yield;
  const months = MONTHS.map((month, i) => ({
    month,
    web: Math.round(80 + 60 * rand() + i * 6),
    desktop: Math.round(60 + 70 * rand()),
    mobile: Math.round(40 + 50 * rand() + i * 4),
  }));
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'].map((quarter, q) => ({
    quarter,
    web: months.slice(q * 3, q * 3 + 3).reduce((s, m) => s + m.web, 0),
    desktop: months.slice(q * 3, q * 3 + 3).reduce((s, m) => s + m.desktop, 0),
    mobile: months.slice(q * 3, q * 3 + 3).reduce((s, m) => s + m.mobile, 0),
  }));
  const regions = REGIONS.map(() =>
    walks(160, { v: [40 + rand() * 30, (rand() - 0.5) * 0.08, 6] }),
  );
  yield;
  // a latency distribution: a body near 12 ms and a long tail
  const counts = new Array<number>(60).fill(0);
  for (let i = 0; i < 40_000; i++) {
    const tail = rand() < 0.12;
    const ms = tail
      ? 20 + -Math.log(1 - rand()) * 14
      : 12 + ((rand() + rand() + rand() - 1.5) / 1.5) * 6;
    const bin = Math.floor(ms);
    if (bin >= 0 && bin < counts.length) counts[bin]++;
  }
  const histogram = counts.map((count, i) => ({ ms: String(i), count }));
  const percentiles = walks(90, {
    p50: [12, 0, 1],
    p95: [28, 0.01, 3],
    p99: [46, 0.02, 6],
  });
  out({ traffic, months, quarters, regions, histogram, percentiles });
});

const TRAFFIC = {
  a: { label: 'Requests', color: '#6c8cff' },
  b: { label: 'Cache hits', color: '#b388ff' },
  c: { label: 'Errors', color: '#ff5c8a' },
};
const DEVICES = {
  web: { label: 'Web', color: '#6c8cff' },
  desktop: { label: 'Desktop', color: '#35c48b' },
  mobile: { label: 'Mobile', color: '#f5a524' },
};
const WALK = { walk: { label: '1,000,000 points', color: '#35c48b' } };
const CLOUD = { y: { label: '200,000 points', color: '#b388ff' } };
const LIVE = {
  cpu: { label: 'CPU', color: ACCENT },
  mem: { label: 'Memory', color: '#ff5c8a' },
};
const SPARK = { v: { label: 'Sessions', color: '#35c48b' } };
const HISTOGRAM = { count: { label: 'Requests', color: '#6c8cff' } };
const PERCENTILES = {
  p50: { label: 'p50', color: '#35c48b' },
  p95: { label: 'p95', color: '#f5a524' },
  p99: { label: 'p99', color: '#ff5c8a' },
};

/** How long a page holds still, and how long the glide to the next takes. */
const HOLD = 850;
const GLIDE = 450;
const PAGES = 6;

/** The pane's stops, in pages: hold, glide, hold, … */
const STOPS: (readonly [number, number])[] = [];
for (let k = 0, at = 0; k < PAGES; k++) {
  STOPS.push([at, k]);
  at += HOLD;
  if (k < PAGES - 1) {
    STOPS.push([at, k]);
    at += GLIDE;
  }
}
/** When page `k` comes to rest. */
const restsAt = (k: number): number => k * (HOLD + GLIDE);

export function ChartsScene({
  active,
  start,
  size,
  compact = false,
}: SceneProps & {
  /** One page and no scrolling: the live one, for the finale's wall. A
   *  chart in a scroll pane inside a scaled box was laid out billions of
   *  pixels tall there, and the scatter's density grid ran the process out
   *  of memory allocating for it. */
  compact?: boolean;
}): ReactElement {
  const report = useMemo(() => chartPages.get(), []);
  const live = useMemo(() => new ChartData({ maxLength: 600 }), []);
  const phase = useMemo(() => ({ v: 0, n: 0 }), []);
  const box = useRef(null);
  const pane = useRef<Scroller | null>(null);

  useTick(active, start, (t, dt) => {
    const p = compact ? null : (pane.current ??= findScroller(box.current));
    // a share of the pane's room, in its own units: the finale shows this
    // scene scaled down, where a page is not the stage's height
    if (p) {
      p.scrollTo({
        y: Math.round((glide(t, STOPS) / (PAGES - 1)) * p.room()),
      });
    }
    // two points a frame into the streaming chart, the whole shot
    for (let i = 0; i < Math.max(1, Math.round(dt / 8)); i++) {
      phase.v += 0.035;
      live.append({
        t: phase.n++,
        cpu: 50 + 30 * Math.sin(phase.v) + 8 * Math.sin(phase.v * 7.3),
        mem: 40 + 14 * Math.sin(phase.v / 3 + 1) + 4 * Math.sin(phase.v * 5),
      });
    }
  });

  const page = { height: size.height, padding: 22, gap: 16 } as const;
  if (compact) {
    return (
      <box style={{ ...page, width: size.width }}>
        <LivePage report={report} live={live} n={null} />
      </box>
    );
  }
  return (
    <box
      ref={box}
      style={{ width: size.width, height: size.height, overflow: 'scroll' }}
    >
      <box style={page}>
        <Heading n={1} title="Traffic" note="the last 1,200 minutes" />
        <Headlines active={active} start={start} />
        <Panel title="Requests, cache hits and errors, stacked" grow={1}>
          <ChartContainer
            config={TRAFFIC}
            style={{ flexGrow: 1, minHeight: 0 }}
          >
            <AreaChart data={report.traffic}>
              <CartesianGrid />
              <XAxis dataKey="t" hide />
              <YAxis width={34} />
              <AreaSeries dataKey="a" stackId="s" curve="monotone" />
              <AreaSeries dataKey="b" stackId="s" curve="monotone" />
              <AreaSeries dataKey="c" stackId="s" curve="monotone" />
            </AreaChart>
          </ChartContainer>
        </Panel>
      </box>

      <box style={page}>
        <Heading n={2} title="Sessions" note="by device, month and quarter" />
        <box
          style={{ flexGrow: 1, minHeight: 0, flexDirection: 'row', gap: 16 }}
        >
          <Panel title="By month, side by side" grow={3}>
            <ChartContainer
              config={DEVICES}
              style={{ flexGrow: 1, minHeight: 0 }}
            >
              <BarChart data={report.months}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" />
                <YAxis width={34} />
                <BarSeries dataKey="web" radius={3} />
                <BarSeries dataKey="desktop" radius={3} />
                <BarSeries dataKey="mobile" radius={3} />
              </BarChart>
            </ChartContainer>
          </Panel>
          <Panel title="By quarter, stacked" grow={2}>
            <ChartContainer
              config={DEVICES}
              style={{ flexGrow: 1, minHeight: 0 }}
            >
              <BarChart data={report.quarters}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="quarter" />
                <YAxis width={40} />
                <BarSeries dataKey="web" stackId="q" />
                <BarSeries dataKey="desktop" stackId="q" />
                <BarSeries dataKey="mobile" stackId="q" radius={4} />
              </BarChart>
            </ChartContainer>
          </Panel>
        </box>
      </box>

      <box style={page}>
        <Million active={active} start={start} />
      </box>

      <box style={page}>
        <LivePage report={report} live={live} n={4} />
      </box>

      <box style={page}>
        <Heading
          n={5}
          title="Latency"
          note="40,000 requests, and 90 days of percentiles"
        />
        <Panel title="How long requests took, in milliseconds" grow={1}>
          <ChartContainer
            config={HISTOGRAM}
            style={{ flexGrow: 1, minHeight: 0 }}
          >
            <BarChart data={report.histogram}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="ms" />
              <YAxis width={44} />
              <BarSeries dataKey="count" radius={2} />
            </BarChart>
          </ChartContainer>
        </Panel>
        <Panel title="p50, p95 and p99, a point a day" grow={1}>
          <ChartContainer
            config={PERCENTILES}
            style={{ flexGrow: 1, minHeight: 0 }}
          >
            <LineChart data={report.percentiles}>
              <CartesianGrid />
              <XAxis dataKey="t" hide />
              <YAxis width={44} />
              <LineSeries dataKey="p50" curve="monotone" dot={2} />
              <LineSeries dataKey="p95" curve="monotone" dot={2} />
              <LineSeries dataKey="p99" curve="step" />
            </LineChart>
          </ChartContainer>
        </Panel>
      </box>

      <box style={page}>
        <Heading
          n={6}
          title="200,000 points"
          note="one element, drawn by pixel"
        />
        <Panel title="Two clusters and the noise between them" grow={1}>
          <ChartContainer config={CLOUD} style={{ flexGrow: 1, minHeight: 0 }}>
            <ScatterChart data={cloudData()}>
              <CartesianGrid />
              <XAxis dataKey="x" hide />
              <YAxis width={34} />
              <ScatterSeries dataKey="y" size={1.5} />
            </ScatterChart>
          </ChartContainer>
        </Panel>
      </box>
    </box>
  );
}

/** The live page: the streaming series, and six regions as small
 *  multiples. On its own, it is the finale's tile (see `compact`). */
function LivePage({
  report,
  live,
  n,
}: {
  report: Report;
  live: ChartData;
  /** Its page number, or null on its own. */
  n: number | null;
}): ReactElement {
  return (
    <>
      <Heading n={n} title="Live" note="240 points a second, and six regions" />
      <box style={{ flexGrow: 1, minHeight: 0, flexDirection: 'row', gap: 16 }}>
        <Panel title="CPU and memory, streaming" grow={3}>
          <ChartContainer config={LIVE} style={{ flexGrow: 1, minHeight: 0 }}>
            <LineChart data={live}>
              <CartesianGrid />
              <XAxis dataKey="t" hide />
              <YAxis width={34} domain={[0, 100]} />
              <LineSeries dataKey="cpu" />
              <LineSeries dataKey="mem" />
            </LineChart>
          </ChartContainer>
        </Panel>
        <box style={{ flexGrow: 2, flexBasis: 0, minHeight: 0, gap: 16 }}>
          {[0, 2, 4].map((row) => (
            <box
              key={row}
              style={{
                flexGrow: 1,
                minHeight: 0,
                flexDirection: 'row',
                gap: 16,
              }}
            >
              {[row, row + 1].map((r) => (
                <Panel key={r} title={REGIONS[r]} grow={1}>
                  <ChartContainer
                    config={SPARK}
                    style={{ flexGrow: 1, minHeight: 0 }}
                  >
                    <AreaChart data={report.regions[r]}>
                      <XAxis dataKey="t" hide />
                      <YAxis hide />
                      <AreaSeries dataKey="v" curve="monotone" />
                    </AreaChart>
                  </ChartContainer>
                </Panel>
              ))}
            </box>
          ))}
        </box>
      </box>
    </>
  );
}

/**
 * The million-point line, zoomed into while its page holds: from all of it
 * to two and a half thousand points, an order of magnitude every few
 * hundred milliseconds. Its own component, so a frame of the zoom renders
 * this chart and nothing else on the page.
 */
function Million({
  active,
  start,
}: {
  active: boolean;
  start: number;
}): ReactElement {
  const walk = useMemo(() => millionData(), []);
  const [span, setSpan] = useState(MILLION);
  const centre = MILLION * 0.618;
  useTick(active, start, (t) => {
    const k = easeInOutCubic(progress(t, restsAt(2) - 200, restsAt(3) - 150));
    const next = Math.round(MILLION * Math.pow(2500 / MILLION, k));
    if (next !== span) setSpan(next);
  });
  const from = Math.max(0, Math.round(centre - span / 2));
  // the y axis fitted to what is on screen, or the zoom flattens the line:
  // read off a few thousand of the points in view, which is all an axis
  // needs, and padded past whatever the sampling stepped over
  const range = useMemo((): [number, number] => {
    const ys = walk.columns.walk;
    const step = Math.max(1, Math.floor(span / 3000));
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = from; i < Math.min(ys.length, from + span); i += step) {
      if (ys[i] < lo) lo = ys[i];
      if (ys[i] > hi) hi = ys[i];
    }
    const pad = (hi - lo) * 0.1 || 1;
    return [Math.floor(lo - pad), Math.ceil(hi + pad)];
  }, [walk, from, span]);
  return (
    <>
      <Heading
        n={3}
        title="A million points"
        note={`${span.toLocaleString('en-US')} of them on screen`}
      />
      <Panel
        title="A random walk, zoomed into — every frame drawn from all of it"
        grow={1}
      >
        <ChartContainer config={WALK} style={{ flexGrow: 1, minHeight: 0 }}>
          <LineChart data={walk}>
            <CartesianGrid />
            <XAxis domain={[from, from + span]} />
            <YAxis width={40} domain={range} />
            <LineSeries dataKey="walk" strokeWidth={1.5} />
          </LineChart>
        </ChartContainer>
      </Panel>
    </>
  );
}

/** Three headline numbers, counting up as the page arrives. */
function Headlines({
  active,
  start,
}: {
  active: boolean;
  start: number;
}): ReactElement {
  const [k, setK] = useState(0);
  useTick(active, start, (t) => {
    const next = Math.round(easeInOutCubic(progress(t, 100, 900)) * 100) / 100;
    if (next !== k) setK(next);
  });
  const figures: [string, string, string][] = [
    [Math.round(4_812_330 * k).toLocaleString('en-US'), 'requests', '#6c8cff'],
    [`${(93.4 * k).toFixed(1)}%`, 'served from cache', '#b388ff'],
    [`${(0.02 * k).toFixed(2)}%`, 'errors', '#ff5c8a'],
  ];
  return (
    <box style={{ flexDirection: 'row', gap: 16 }}>
      {figures.map(([value, label, color]) => (
        <box
          key={label}
          style={{
            flexGrow: 1,
            flexBasis: 0,
            padding: 16,
            gap: 4,
            borderRadius: 12,
            backgroundColor: PANEL,
          }}
        >
          <text style={{ fontSize: 34, fontWeight: 'bold', color }}>
            {value}
          </text>
          <text style={{ fontSize: 14, color: MUTED }}>{label}</text>
        </box>
      ))}
    </box>
  );
}

function Heading({
  n,
  title,
  note,
}: {
  n: number | null;
  title: string;
  note: string;
}): ReactElement {
  return (
    <box style={{ flexDirection: 'row', alignItems: 'baseline', gap: 14 }}>
      <text style={{ fontSize: 26, fontWeight: 'bold', color: INK }}>
        {title}
      </text>
      <text style={{ fontSize: 15, color: MUTED }}>{note}</text>
      <box style={{ flexGrow: 1 }} />
      {n === null ? null : (
        <text style={{ fontSize: 15, color: MUTED }}>{`${n} / ${PAGES}`}</text>
      )}
    </box>
  );
}

function Panel({
  title,
  grow,
  children,
}: {
  title: string;
  grow: number;
  children?: ReactNode;
}): ReactElement {
  return (
    <box
      style={{
        flexGrow: grow,
        flexBasis: 0,
        // free to shrink below what it holds: core's content floors would
        // otherwise keep a chart at its content's height, and a page of
        // them — the finale's tile above all — would run off its bottom
        minHeight: 0,
        padding: 14,
        gap: 8,
        borderRadius: 12,
        backgroundColor: PANEL,
      }}
    >
      <text style={{ fontSize: 14, color: MUTED }}>{title}</text>
      {children}
    </box>
  );
}
