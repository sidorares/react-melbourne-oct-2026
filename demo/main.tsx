// The trailer. Started by ./index.tsx, which sets React's production build
// first — run that, not this.
//
// A trailer for react-x11 and @react-x11/components, fully automated: nobody
// touches anything, and every frame is rendered live. It cuts like a
// trailer — a still title card, then a component for a few seconds, every
// interaction in it under one — and asks, then answers, the one question a
// desktop toolkit in JavaScript gets asked: but can it be fast?
//
// `npm start` runs it under Bun (`npm run start:node` under Node),
// on React's production build. The first run fetches the map's tiles and
// renders the video clip with ffmpeg in the background; `--prefetch` does
// both up front.
//
//   npm start                                 # the whole trailer, on Start
//   npm start -- --autostart                  # no Start button: play at once
//   npm start -- --autostart=4000             # …or press it after 4 s
//   npm start -- --loop                       # round and round
//   npm start -- --from=map                   # start at a shot
//   npm start -- --only=map,flow              # just these shots
//   npm start -- --speed=0.5                  # slow motion
//   npm start -- --size=1920x1080             # the window, logical px
//   npm start -- --fps=60                     # cap the window's rate
//   npm start -- --video=clip.mp4             # your own video shot
//   npm start -- --exit                       # quit after the end card
//   npm start -- --prefetch                   # fetch tiles, make the clip, exit
//   npm start -- --offline                    # the map from the tile cache only
//   npm start -- --snapshots=dir              # a PNG of every shot (macOS)
//   npm start -- --snap-at=500,900            # …taken at these ms instead
//   npm start -- --resize-at=9000:1728x1080   # going full screen
//   npm start -- --trace=f.json               # every frame's gap and paint
//
// It is not a benchmark, and it shows no numbers: a counter in the window
// would claim damage every frame and change what it counted. What it does
// measure, it prints to the terminal — one line a shot, frames and dropped
// frames (./meter.ts) — which is how it was tuned to drop none.
//
// What keeps it smooth, in the order it matters:
//
//  - **Everything is driven by time, from one frame loop** (clock.ts). A late
//    frame shows the motion further along; nothing waits on a timer.
//  - **The data is built before it is shown** (idle.ts): a million table
//    rows, a quarter of a million stars, a 20,000-line file, sliced into
//    five-millisecond steps between frames from the moment the window is up.
//  - **The next shot is rendered before the cut**, under a hidden
//    `<Activity>`: React builds its tree at idle priority while the current
//    shot plays, and the cut only has to lay it out and paint it.
//  - **The next scene is shown under the card before it** (`WARM_MS`): laid
//    out, painted and settled while the card covers it, so the card's fade
//    away is a dissolve into a scene that is already there. A scene with a
//    GL surface, which would show through the card, warms up off-stage.
//  - **On macOS, the titles and cards animate on Core Animation layers.**
//    Their fades and colour pulses are transitions and loops a layer can
//    run, so core promotes them (docs/macos.md, "Layer promotion"), and the
//    intro's kinetic type is CSS that `<Html>` hands to the render server as
//    sprites. They cost the JS thread no frames — which is exactly when it
//    does the preparation above.
//  - **Every scene box is sized in numbers** (shell.tsx, `sceneBox`), which
//    keeps core's content-floor measurement inside the scene that changed.
//  - **Tiles are fetched before the map flies** (scenes/map.tsx), and kept on
//    disk, so the second run never touches the network.
import { writeFileSync } from 'node:fs';
import {
  Activity,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import { ThemeProvider, createRoot } from 'react-x11';
import type { FrameRate } from 'react-x11';
import {
  XK_KP_ENTER,
  XK_PAGE_DOWN,
  XK_RETURN,
  XK_RIGHT,
  XK_SPACE,
} from 'react-x11/keysyms';

import { Clock, ClockContext } from './clock.js';
import type { FrameSource } from './clock.js';
import { Meter } from './meter.js';
import type { SceneProps } from './scene.js';
import { ChartsScene, chartPages } from './scenes/charts.js';
import { CodeScene, codeCorpus } from './scenes/code.js';
import { FlowScene } from './scenes/flow.js';
import { FinaleScene } from './scenes/finale.js';
import { GalaxyScene, galaxyStars } from './scenes/galaxy.js';
import { MapScene, prefetchFlight } from './scenes/map.js';
import { HtmlScene } from './scenes/html.js';
import { MarkdownScene } from './scenes/markdown.js';
import { MontageScene } from './scenes/montage.js';
import { ReorderScene } from './scenes/reorder.js';
import { RichTextScene } from './scenes/richtext.js';
import { TerminalScene } from './scenes/terminal.js';
import { VideoScene, prepareClip } from './scenes/video.js';
import { TableScene, tableBySlowest, tableRows } from './scenes/table.js';
import {
  ACCENT,
  BOTTOM_BAR,
  GROUND,
  INK,
  LowerThird,
  SmashCard,
  Stage,
  TitleCard,
  TOP_BAR,
  TopBar,
  sceneBox,
} from './shell.js';
import type { Caption } from './shell.js';
import { Intro, Outro } from './titles.js';

// --- arguments ---------------------------------------------------------------

const args = process.argv.slice(2);
const arg = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string): boolean => args.includes(`--${name}`);

const speed = Number(arg('speed') ?? 1) || 1;
const [width, height] = (arg('size') ?? '1600x1000').split('x').map(Number);
const fps = arg('fps');
const frameRate: FrameRate | undefined = fps
  ? fps === 'display'
    ? 'display'
    : Number(fps)
  : undefined;

// --- the shot list -----------------------------------------------------------

interface Shot extends Caption {
  id: string;
  /** The scene a card introduces, so `--only=table` brings its card too. */
  of?: string;
  /** How long it holds, in show milliseconds. */
  ms: number;
  render: (props: SceneProps) => ReactNode;
  /** A card is cheap to show and needs nothing prepared. */
  card?: boolean;
  /**
   * A scene with a GL surface in it, which cannot warm up under the card
   * before it: on macOS a surface is a layer over everything the window
   * paints, the card included, so it would show through. It warms up
   * off-stage instead — mounted and drawing just past the window's left
   * edge, where its context, its shaders, its workers and its first tiles
   * get made, and moved into place at the cut.
   */
  cold?: boolean;
}

/** How long before a card ends the scene after it is shown under it: laid
 *  out, painted, its effects run, its first commits settled — so the cut
 *  only takes the card away. */
const WARM_MS = 1600;

/** How long a title card holds, its fades included — two seconds up, one
 *  away: long enough to read twice. The scenes move fast; the words
 *  between them stand still. */
const CARD_MS = 4600;

/**
 * A scene and the card that introduces it. The card says what is coming in
 * a few words that stay put; then the scene does it, in a couple of
 * seconds, with its caption kept in the lower third.
 */
function scene(
  id: string,
  caption: Required<Pick<Caption, 'kicker' | 'title' | 'subtitle'>> & {
    big: string;
  },
  ms: number,
  render: (props: SceneProps) => ReactNode,
  options: { cold?: boolean } = {},
): Shot[] {
  return [
    {
      id: `${id}-card`,
      of: id,
      ms: CARD_MS,
      card: true,
      render: (p) => (
        <TitleCard
          kicker={caption.kicker}
          big={caption.big}
          small={caption.subtitle}
          start={p.start}
          ms={CARD_MS * speed}
        />
      ),
    },
    { id, ms, render, ...caption, ...options },
  ];
}

// --- the start ----------------------------------------------------------------

/** What the first screen's Start reads: whether the trailer is still
 *  waiting on it, and what pressing it does. */
const StartContext = createContext<{ waiting: boolean; start: () => void }>({
  waiting: false,
  start: () => {},
});

/** The intro, with its Start button when the trailer waits for one. */
function IntroScreen(): ReactElement {
  const { waiting, start } = useContext(StartContext);
  return <Intro waiting={waiting} onStart={WAITS ? start : undefined} />;
}

/** The keys that press Start: Return and Space as on the button, and → and
 *  Page Down, which are what a presentation clicker sends. */
const START_KEYS = new Set<number>([
  XK_RETURN,
  XK_KP_ENTER,
  XK_SPACE,
  XK_RIGHT,
  XK_PAGE_DOWN,
]);

/** How long the intro stays up once Start is pressed: the button fades,
 *  and the cut comes. */
const START_TAIL_MS = 1200;

const ALL_SHOTS: Shot[] = [
  { id: 'intro', ms: 5200, render: () => <IntroScreen /> },
  {
    id: 'question',
    ms: 4400,
    card: true,
    render: (p) => (
      <SmashCard text="But can it be fast?" start={p.start} ms={4400 * speed} />
    ),
  },
  ...scene(
    'code',
    {
      kicker: '01',
      big: 'Code editor',
      title: 'Code editor',
      subtitle: '20,000 lines of real TypeScript · edited mid-file',
    },
    7500,
    (p) => <CodeScene {...p} />,
  ),
  ...scene(
    'table',
    {
      kicker: '02',
      big: '1,000,000 rows',
      title: 'Table with virtual content',
      subtitle: 'Rows of any height · re-sorted in the frame it is asked',
    },
    6900,
    (p) => <TableScene {...p} />,
  ),
  ...scene(
    'richtext',
    {
      kicker: '03',
      big: 'Rich text',
      title: 'Rich text editor',
      subtitle: "ProseMirror's model, input rules and plugins · our own view",
    },
    13400,
    (p) => <RichTextScene {...p} />,
  ),
  ...scene(
    'reorder',
    {
      kicker: '04',
      big: 'Reorder',
      title: 'Lists you can re-order',
      subtitle:
        '320 cards · dragged, room made for them · walked by the keyboard',
    },
    7000,
    (p) => <ReorderScene {...p} />,
  ),
  ...scene(
    'map',
    {
      kicker: '05',
      big: 'London → Paris',
      title: 'Vector tiles on the GPU',
      subtitle: 'OpenStreetMap · street level to the Channel and back',
    },
    7500,
    (p) => <MapScene {...p} />,
    { cold: true },
  ),
  ...scene(
    'flow',
    {
      kicker: '06',
      big: 'Flow diagrams',
      title: 'Node graphs',
      subtitle: '300 nodes · dragged, re-wired, zoomed — drawn by one element',
    },
    7400,
    (p) => <FlowScene {...p} />,
    { cold: true },
  ),
  ...scene(
    'charts',
    {
      kicker: '07',
      big: 'Pages of data',
      title: 'Charts bounded by pixels',
      subtitle: 'Six pages scrolled · a million points zoomed into · one live',
    },
    7600,
    (p) => <ChartsScene {...p} />,
  ),
  ...scene(
    'markdown',
    {
      kicker: '08',
      big: 'Streamed',
      title: 'Markdown as it arrives',
      subtitle: 'Never raw syntax · tables, code and TeX mid-stream',
    },
    8600,
    (p) => <MarkdownScene {...p} />,
  ),
  ...scene(
    'html',
    {
      kicker: '09',
      big: 'The Field Guide',
      title: 'An HTML document, drawn natively',
      subtitle: 'Display type, gradients, columns, 3D cards, CSS animations',
    },
    8600,
    (p) => <HtmlScene {...p} />,
  ),
  ...scene(
    'video',
    {
      kicker: '10',
      big: 'Video',
      title: 'Video, natively',
      subtitle: 'A file AVFoundation plays · frames pushed from JavaScript',
    },
    6900,
    (p) => <VideoScene {...p} />,
  ),
  ...scene(
    'galaxy',
    {
      kicker: '11',
      big: 'A galaxy forming',
      title: '3D scene graph on the GPU',
      subtitle: '200,000 stars in one draw · and Voyager, out past the disc',
    },
    8600,
    (p) => <GalaxyScene {...p} />,
    { cold: true },
  ),
  ...scene(
    'terminal',
    {
      kicker: '12',
      big: 'Terminal',
      title: 'A terminal under a flood',
      subtitle: 'Megabytes a second of ANSI · then a full-screen program',
    },
    10000,
    (p) => <TerminalScene {...p} />,
  ),
  ...scene(
    'montage',
    {
      kicker: '13',
      big: 'And the rest',
      title: 'The smaller pieces',
      subtitle: 'Formula · Timeline · Color picker · Calendar · core widgets',
    },
    7300,
    (p) => <MontageScene {...p} />,
  ),
  ...scene(
    'finale',
    {
      kicker: '14',
      big: 'All at once.',
      title: 'Everything, at the same time',
      subtitle:
        'Six scenes live in one window · two GL surfaces · one frame loop',
    },
    10200,
    (p) => <FinaleScene {...p} />,
    { cold: true },
  ),
  { id: 'outro', ms: 5000, render: () => <Outro /> },
];

function pickShots(): Shot[] {
  const only = arg('only')?.split(',');
  const from = arg('from');
  let shots = ALL_SHOTS;
  if (only) shots = shots.filter((s) => only.includes(s.of ?? s.id));
  if (from) {
    const at = shots.findIndex((s) => (s.of ?? s.id) === from);
    if (at > 0) shots = shots.slice(at);
  }
  return shots.length ? shots : ALL_SHOTS;
}

const SHOTS = pickShots();

/** Whether the trailer waits on the first screen for Start: when it opens
 *  on the intro, unless `--autostart` says to play at once. */
const WAITS = SHOTS[0].id === 'intro' && !flag('autostart');

/**
 * What the director keeps mounted, as scene index → how: the scene on
 * screen; the next scene, rendered by React under a hidden `<Activity>`
 * while this one plays; and, in a card's last WARM_MS, that next scene
 * shown under the card but not yet running. Cards are not in it — a card
 * is an overlay over the stage, painted after every scene.
 */
type Mount = 'active' | 'warm' | 'offstage' | 'hidden';

function mountsAround(index: number, warm: boolean): Map<number, Mount> {
  const mounts = new Map<number, Mount>();
  if (!SHOTS[index].card) mounts.set(index, 'active');
  for (let i = index + 1; i < SHOTS.length; i++) {
    if (SHOTS[i].card) continue;
    // only under the card right before it: a scene warmed under an earlier
    // card would be hidden again by the next, and its effects run twice
    const warming = warm && SHOTS[index].card && i === index + 1;
    mounts.set(i, !warming ? 'hidden' : SHOTS[i].cold ? 'offstage' : 'warm');
    break;
  }
  return mounts;
}

/** The card on screen, if the shot is one. */
const cardOf = (index: number): Shot | null =>
  SHOTS[index].card ? SHOTS[index] : null;

// --- preparation -------------------------------------------------------------

/** Started once the window is up, in slices between frames (idle.ts). */
function prepare(): void {
  // network first: it waits on sockets, not on this thread
  void prefetchFlight(width, height - TOP_BAR - BOTTOM_BAR);
  void prepareClip();
  codeCorpus();
  tableRows.start();
  tableBySlowest.start();
  chartPages.start();
  galaxyStars.start();
}

// --- the director ------------------------------------------------------------

const THEME = { accent: ACCENT, text: INK, background: GROUND };

function App({ clock, meter }: { clock: Clock; meter: Meter }): ReactElement {
  const [shot, setShot] = useState({ index: 0, start: performance.now() });
  const [warm, setWarm] = useState(false);
  const live = useRef(shot);
  live.current = shot;
  // Held on the intro until Start: the clock runs, the intro animates and
  // the data is prepared behind it, but no cut is made.
  const [waiting, setWaiting] = useState(WAITS);
  const held = useRef(WAITS);
  const start = useCallback(() => {
    if (!held.current) return;
    held.current = false;
    setWaiting(false);
    // the intro's last beat from here, then the trailer
    const now = performance.now();
    const { index } = live.current;
    const resumed = {
      index,
      start: now - (SHOTS[index].ms - START_TAIL_MS) * clock.speed,
    };
    live.current = resumed;
    setShot(resumed);
    meter.begin(SHOTS[index].id, now);
  }, [clock, meter]);
  const startContext = useMemo(() => ({ waiting, start }), [waiting, start]);

  // `--autostart=ms`: Start pressed for you, that long after the window
  // opens — the button's own path, for a run nobody is at
  useEffect(() => {
    const at = Number(arg('autostart'));
    if (!WAITS || !(at >= 0)) return;
    const id = setTimeout(start, at);
    return () => clearTimeout(id);
  }, [start]);
  const windowRef = useRef<FrameSource>(null);
  const rootBox = useRef<{ root?: unknown } | null>(null);

  // The frame loop starts with the window, and the meter with it.
  useEffect(() => {
    if (windowRef.current) clock.attach(windowRef.current);
    const root = rootBox.current?.root;
    if (root) meter.watch(root as Parameters<Meter['watch']>[0]);
    meter.begin(SHOTS[0].id, live.current.start);
    // give the first frame to the intro, then start building
    const id = setTimeout(prepare, 120);
    return () => clearTimeout(id);
  }, [clock, meter]);

  const finish = (): void => {
    live.current = { index: live.current.index, start: Infinity };
    meter.end();
    process.stderr.write(`\n${meter.summary()}\n`);
    const trace = arg('trace');
    if (trace && meter.trace) {
      writeFileSync(trace, JSON.stringify(meter.trace));
    }
    if (flag('exit')) setTimeout(() => process.exit(0), 50);
  };

  // Cuts happen on the frame clock, so a cut and the frame that shows it are
  // the same frame.
  useEffect(
    () =>
      clock.on((now) => {
        if (held.current) return;
        const { index, start } = live.current;
        const ms = SHOTS[index].ms * clock.speed;
        if (now - start < ms) {
          if (SHOTS[index].card && now - start >= ms - WARM_MS * clock.speed) {
            setWarm(true);
          }
          return;
        }
        const next = index + 1;
        if (next >= SHOTS.length) {
          if (flag('loop')) {
            meter.begin(SHOTS[0].id, now);
            setShot({ index: 0, start: now });
            return;
          }
          finish();
          return;
        }
        meter.begin(SHOTS[next].id, now);
        const nextShot = { index: next, start: now };
        live.current = nextShot;
        setShot(nextShot);
        setWarm(false);
      }),
    [clock, meter],
  );

  // `--snapshots=dir`: a PNG of the window two thirds into every shot, for
  // checking a change without watching the whole trailer (macOS only — the
  // Cocoa window's `snapshot`).
  const snapshots = arg('snapshots');
  useEffect(() => {
    if (!snapshots) return;
    const at = SHOTS[shot.index];
    // `--snap-at=ms,…`: when, in show ms into each shot; two thirds in by
    // default
    const times = arg('snap-at')
      ?.split(',')
      .map(Number)
      .filter((n) => n < at.ms) ?? [at.ms * 0.66];
    const ids = times.map((ms) =>
      setTimeout(() => {
        const name = `${String(shot.index).padStart(2, '0')}-${at.id}-${Math.round(ms)}.png`;
        nativeWindow()?.snapshot?.(`${snapshots}/${name}`);
      }, ms * clock.speed),
    );
    return () => ids.forEach(clearTimeout);
  }, [shot.index, snapshots, clock]);

  // `--resize-at=ms:WxH`: the window resized ms into the run, to a size in
  // logical pixels — what going full screen mid-trailer does to every scene,
  // the ones pre-rendered out of sight included
  useEffect(() => {
    const [at, to] = arg('resize-at')?.split(':') ?? [];
    if (!to) return;
    const [w, h] = to.split('x').map(Number);
    const id = setTimeout(() => {
      const wnd = nativeWindow();
      const s = wnd?.scale ?? 1;
      wnd?.resize?.(w * s, h * s);
    }, Number(at));
    return () => clearTimeout(id);
  }, []);

  // The stage's size in numbers, for the scene boxes (shell.tsx, sceneBox):
  // the window's until the first layout says otherwise.
  const [stage, setStage] = useState({
    width,
    height: height - TOP_BAR - BOTTOM_BAR,
  });
  const box = useMemo(() => sceneBox(stage), [stage]);
  const offstage = useMemo(
    () => ({ ...sceneBox(stage), left: -(stage.width + 64) }),
    [stage],
  );

  const mounts = useMemo(
    () => mountsAround(shot.index, warm),
    [shot.index, warm],
  );
  const current = SHOTS[shot.index];
  const card = cardOf(shot.index);

  return (
    // directly around the window: a provider around a component that
    // renders one would put a box above it
    <ThemeProvider colorScheme="dark" value={THEME}>
      <window
        ref={windowRef as never}
        title="react-x11 — stress demo"
        width={width}
        height={height}
        frameRate={frameRate}
        style={{ backgroundColor: GROUND }}
        onKeyDown={(ev) => {
          if (held.current && START_KEYS.has(ev.keysym ?? 0)) start();
        }}
      >
        <StartContext.Provider value={startContext}>
          <box ref={rootBox as never} style={{ flexGrow: 1 }}>
            <TopBar count={SHOTS.length} index={shot.index} />
            <Stage
              onSize={(w, h) =>
                setStage((s) =>
                  s.width === w && s.height === h ? s : { width: w, height: h },
                )
              }
            >
              {[...mounts].map(([i, mount]) => (
                <Activity
                  key={SHOTS[i].id}
                  mode={mount === 'hidden' ? 'hidden' : 'visible'}
                >
                  <box style={mount === 'offstage' ? offstage : box}>
                    {SHOTS[i].render({
                      active: mount === 'active',
                      start: mount === 'active' ? shot.start : NaN,
                      size: stage,
                    })}
                  </box>
                </Activity>
              ))}
              {/* after the scenes, so it is painted over them — and on macOS
                on a layer of its own over them, which is what lets the scene
                under it be laid out and painted while it is up */}
              {card ? (
                <box key={card.id} style={box}>
                  {card.render({
                    active: true,
                    start: shot.start,
                    size: stage,
                  })}
                </box>
              ) : null}
            </Stage>
            <LowerThird
              key={current.id}
              kicker={current.kicker}
              title={current.title}
              subtitle={current.subtitle}
            />
          </box>
        </StartContext.Provider>
      </window>
    </ThemeProvider>
  );
}

// `--prefetch`: fetch the map's tiles and make the video clip, then exit —
// the first run's network and ffmpeg time, taken before the show.
if (flag('prefetch')) {
  process.stderr.write('stress-demo: preparing the map tiles and the clip…\n');
  await Promise.all([
    prefetchFlight(width, height - TOP_BAR - BOTTOM_BAR),
    prepareClip(),
  ]);
  process.stderr.write('stress-demo: ready.\n');
  process.exit(0);
}

const clock = new Clock(speed);
const meter = new Meter(clock, { trace: Boolean(arg('trace')) });
const root = await createRoot({ glPolicy: 'auto' });

/** The backend's window, for the debugging flags (macOS: `snapshot`). */
function nativeWindow():
  | {
      scale?: number;
      snapshot?: (path: string) => unknown;
      resize?: (width: number, height: number) => void;
    }
  | undefined {
  const app = (root as { app?: { _windows?: Map<unknown, unknown> } }).app;
  return [...(app?._windows?.values() ?? [])][0] as never;
}
root.render(
  <ClockContext.Provider value={clock}>
    <App clock={clock} meter={meter} />
  </ClockContext.Provider>,
);
