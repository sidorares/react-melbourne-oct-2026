// A 300-node graph, on the GPU: a node dragged with its edges following it, its edges
// re-wired one after another, then the camera pulling back to show the
// whole graph and sweeping across it.
//
// `<Flow>` draws the graph in one element — a card is a `paint`, not a
// React tree — so a pan is two numbers and a zoom is arithmetic, and the
// viewport here is the pane's own (`setViewport` from the frame loop, no
// render). A drag is what react-flow's is: a new position in the nodes'
// state, and the pane repaints the card and the edges that touch it. The
// three cards in the middle are the other kind of node, a `render`: real
// widgets laid out by yoga over the card, which zoom with the pane.
import { useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ProgressBar } from 'react-x11';

import { Flow } from '@react-x11/components/flow';
import type {
  FlowEdge,
  FlowInstance,
  FlowNode,
  FlowNodeType,
  Viewport,
} from '@react-x11/components/flow';
import { easeInOutCubic, lerp, progress, rng, useTick } from '../clock.js';
import type { SceneProps } from '../scene.js';

interface Data {
  label: string;
  load?: number;
}

const LAYERS = 14;
const PER_LAYER = 22;
const DX = 260;
const DY = 74;
const ACCENTS = ['#6c8cff', '#b388ff', '#35c48b', '#f5a524', '#ff5c8a'];
const STAGES = [
  'ingest',
  'parse',
  'resolve',
  'typecheck',
  'transform',
  'bundle',
  'minify',
  'test',
  'sign',
  'upload',
  'cache',
  'route',
  'deploy',
  'serve',
];

/** A layered pipeline, fanned out the way a build graph is. */
function graph(): { nodes: FlowNode<Data>[]; edges: FlowEdge[] } {
  const rand = rng(42);
  const nodes: FlowNode<Data>[] = [];
  const edges: FlowEdge[] = [];
  for (let l = 0; l < LAYERS; l++) {
    for (let i = 0; i < PER_LAYER; i++) {
      const id = `n${l}-${i}`;
      const live = l === 6 && i >= 10 && i <= 12;
      nodes.push({
        id,
        type: live ? 'live' : undefined,
        position: { x: l * DX, y: (i - PER_LAYER / 2) * DY + (l % 2) * 18 },
        width: live ? 200 : 168,
        height: live ? 64 : 44,
        data: { label: `${STAGES[l]} ${i + 1}`, load: rand() },
        sourcePosition: 'right',
        targetPosition: 'left',
        style: { accent: ACCENTS[l % ACCENTS.length] },
      });
      if (l + 1 < LAYERS) {
        for (let k = 0; k < 2; k++) {
          const j = (i + Math.floor(rand() * 5) - 2 + PER_LAYER) % PER_LAYER;
          edges.push({
            id: `${id}>${j}:${k}`,
            source: id,
            target: `n${l + 1}-${j}`,
            type: 'smoothstep',
            animated: rand() < 0.08,
          });
        }
      }
    }
  }
  return { nodes, edges };
}

/** The mounted node type: a real progress bar and a caption over the card. */
const live: FlowNodeType<Data> = {
  headerHeight: 0,
  handles: [
    { type: 'target', position: 'left' },
    { type: 'source', position: 'right' },
  ],
  render: ({ node }) => (
    <box style={{ flexGrow: 1, padding: 8, gap: 6, justifyContent: 'center' }}>
      <text style={{ fontSize: 13, fontWeight: 'bold', color: '$text' }}>
        {node.data?.label}
      </text>
      {/* a still bar: a body is drawn on the pane over the GL surface,
          and a bar that moves would present all of that pane each frame */}
      <ProgressBar value={node.data?.load ?? 0.5} height={5} />
    </box>
  ),
};

// The dragged node, and the beats.
const HUB = 'n6-11';
const BEAT = {
  drag: [350, 1550],
  rewire: [1650, 2450],
  pull: [2550, 3600],
  sweep: [4000, 5000],
  // in the corner it swooped to: a node shoved down a few rows, and its
  // neighbour up to take its place, then the camera back out to all of it
  shove: [5200, 6100],
  back: [6300, 7200],
} as const;
const SHOVED = ['n10-5', 'n10-8'] as const;

/** A camera as the graph point at the pane's centre and a zoom — what is
 *  interpolated, so a pull-back keeps its subject in the middle. */
interface Shot {
  cx: number;
  cy: number;
  zoom: number;
}

export function FlowScene({ active, start }: SceneProps): ReactElement {
  const flow = useRef<FlowInstance>(null);
  const pane = useRef({ width: 1600, height: 860 });
  const initial = useMemo(graph, []);
  const [nodes, setNodes] = useState(initial.nodes);
  const [edges, setEdges] = useState(initial.edges);
  const nodeTypes = useMemo(() => ({ live }), []);
  const state = useRef({
    shots: null as null | { close: Shot; wide: Shot; detail: Shot },
    rewired: 0,
  });
  const home = initial.nodes.find((n) => n.id === HUB)!.position;

  const asShot = (v: Viewport): Shot => ({
    cx: (pane.current.width / 2 - v.x) / v.zoom,
    cy: (pane.current.height / 2 - v.y) / v.zoom,
    zoom: v.zoom,
  });
  const show = (f: FlowInstance, s: Shot): void =>
    f.setViewport({
      x: pane.current.width / 2 - s.cx * s.zoom,
      y: pane.current.height / 2 - s.cy * s.zoom,
      zoom: s.zoom,
    });
  /** Between two shots: the centre in a straight line, the zoom by ratio. */
  const between = (a: Shot, b: Shot, k: number): Shot => ({
    cx: lerp(a.cx, b.cx, k),
    cy: lerp(a.cy, b.cy, k),
    zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), k)),
  });

  useTick(active, start, (t) => {
    const f = flow.current;
    if (!f) return;
    const s = state.current;
    if (!s.shots) {
      // the three framings, read off the pane's own fitting, then the first
      f.fitView({ padding: 0.04 });
      const wide = asShot(f.getViewport());
      const close = { cx: home.x + 140, cy: home.y + 40, zoom: 1.2 };
      const detail = { cx: 10.5 * DX, cy: -2 * DY, zoom: 0.62 };
      s.shots = { close, wide, detail };
      show(f, close);
    }
    const { close, wide, detail } = s.shots;

    // the drag: the hub on a loop, up and over and back, its edges in tow
    if (t >= BEAT.drag[0] && t <= BEAT.drag[1] + 40) {
      const k = easeInOutCubic(progress(t, ...BEAT.drag));
      const a = k * Math.PI * 2;
      const position = {
        x: home.x + Math.sin(a) * 230,
        y: home.y - Math.sin(a / 2) * 210,
      };
      setNodes((list) =>
        list.map((n) => (n.id === HUB ? { ...n, position } : n)),
      );
    }

    // the re-wiring: the hub's two edges go to a new target, one every
    // hundred-odd milliseconds, and the new ones march
    const want = Math.floor(progress(t, ...BEAT.rewire) * 7);
    if (want > s.rewired) {
      s.rewired = want;
      const j = (want * 3) % PER_LAYER;
      setEdges((list) =>
        list.map((e) =>
          e.source === HUB
            ? {
                ...e,
                target: `n7-${(j + (e.id.endsWith('1') ? 2 : 0)) % PER_LAYER}`,
                animated: true,
                style: { stroke: '#b388ff', strokeWidth: 2.5 },
              }
            : e,
        ),
      );
    }

    // the pull-back to the whole graph, a beat to take it in, and a swoop
    // down into another corner of it — and, at the end, back out
    if (t >= BEAT.pull[0]) {
      const k = easeInOutCubic(progress(t, ...BEAT.pull));
      const pulled = between(close, wide, k);
      const sweep = easeInOutCubic(progress(t, ...BEAT.sweep));
      const back = easeInOutCubic(progress(t, ...BEAT.back));
      show(f, between(between(pulled, detail, sweep), wide, back));
    }

    // two nodes trading places, both carried at once
    if (t >= BEAT.shove[0] && t <= BEAT.shove[1] + 40) {
      const k = easeInOutCubic(progress(t, ...BEAT.shove));
      const [a, b] = SHOVED.map(
        (id) => initial.nodes.find((n) => n.id === id)!.position,
      );
      const arc = Math.sin(k * Math.PI) * 90;
      const at: Record<string, { x: number; y: number }> = {
        [SHOVED[0]]: { x: lerp(a.x, b.x, k) + arc, y: lerp(a.y, b.y, k) },
        [SHOVED[1]]: { x: lerp(b.x, a.x, k) - arc, y: lerp(b.y, a.y, k) },
      };
      setNodes((list) =>
        list.map((n) => (at[n.id] ? { ...n, position: at[n.id] } : n)),
      );
    }
  });

  return (
    <box
      style={{ flexGrow: 1 }}
      onLayout={(ev) => {
        pane.current = { width: ev.width, height: ev.height };
      }}
    >
      <Flow<Data, unknown>
        ref={flow}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        renderer="gl"
        // nobody presses them, and drawn before the GL world's first frame
        // they flash in the corner and go
        controls={false}
        minZoom={0.1}
        background={{ variant: 'dots', gap: 26 }}
        palette={{ background: '#05060a' }}
        style={{ flexGrow: 1 }}
      />
    </box>
  );
}
