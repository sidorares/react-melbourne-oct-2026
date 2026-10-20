// A flight from Trafalgar Square to Notre-Dame: street level, up over the
// Channel, down to street level again, on OpenStreetMap's vector tiles.
//
// `<Map>` draws through GL here (renderer "auto" picks it wherever the
// connection has direct GL, which a Mac always does): every frame from
// vector buckets on the GPU, a zoom a uniform, labels from distance fields.
// The camera is the map's own — `setCamera` from the frame loop, no React
// render in the path.
//
// **The network is taken out of the shot before it starts.** The flight is
// a curve known in advance (`flyCamera`, van Wijk and Nuij's — the one
// every map library's flyTo is), so the tiles it will see are known too:
// `prefetchFlight` walks the curve at startup, works out every tile in view
// at every step, and fetches the ones not yet on disk while the trailer's
// first shots play. Tiles are kept in the same cache the maps bench uses
// (`scripts/bench/tiles.ts`), so a second run reads them all from disk.
// Identifying the client is the first line of OSM's tile usage policy;
// fetching a flight's worth once and keeping it is the second.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { useMemo, useRef } from 'react';
import type { ReactElement } from 'react';

import {
  Map,
  project,
  shortbreadStyle,
  unproject,
  worldSize,
} from '@react-x11/components/maps';
import type {
  LngLat,
  MapCamera,
  MapHandle,
  MapMarker,
  MapOverlay,
  MapSource,
} from '@react-x11/components/maps';
import { cachePath } from '../tiles.js';
import { easeInOutSine, progress, useTick } from '../clock.js';
import type { SceneProps } from '../scene.js';

const LONDON: LngLat = { lon: -0.1281, lat: 51.508 };
const PARIS: LngLat = { lon: 2.3499, lat: 48.853 };
const STREET = 15.6;

const URL_OF = (z: number, x: number, y: number) =>
  `https://vector.openstreetmap.org/shortbread_v1/${z}/${x}/${y}.mvt`;
const USER_AGENT =
  'react-x11-components-stress-demo/0.1 (+https://github.com/sidorares/react-x11-components)';
const OSM_MAX = 14;

const offline = process.argv.includes('--offline');

// --- the flight ----------------------------------------------------------------

/**
 * Where a flyTo has the camera at `f` (0..1) of the way: van Wijk and Nuij's
 * "Smooth and efficient zooming and panning" — the path that zooms out as
 * far as the distance needs and no further, at a constant perceived speed.
 * `viewport` is the larger side of the pane in pixels.
 */
export function flyCamera(
  from: MapCamera,
  to: MapCamera,
  f: number,
  viewport: number,
): MapCamera {
  const rho = 1.42;
  const a = project(from.center);
  const b = project(to.center);
  const world0 = worldSize(from.zoom);
  const w0 = viewport;
  const w1 = w0 / 2 ** (to.zoom - from.zoom);
  const u1 = Math.hypot(b.x - a.x, b.y - a.y) * world0;
  const r = (i: 0 | 1): number => {
    const bi =
      (w1 * w1 - w0 * w0 + (i ? -1 : 1) * rho ** 4 * u1 * u1) /
      (2 * (i ? w1 : w0) * rho * rho * u1);
    return Math.log(Math.sqrt(bi * bi + 1) - bi);
  };
  const r0 = r(0);
  const S = (r(1) - r0) / rho;
  const s = f * S;
  const w = (w0 * Math.cosh(r0)) / Math.cosh(rho * s + r0);
  const u =
    (w0 * (Math.cosh(r0) * Math.tanh(rho * s + r0) - Math.sinh(r0))) /
    (rho * rho) /
    u1;
  return {
    center: unproject({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }),
    zoom: from.zoom + Math.log2(w0 / w),
  };
}

const EIFFEL: LngLat = { lon: 2.2945, lat: 48.8584 };
const FROM: MapCamera = { center: LONDON, zoom: STREET };
const TO: MapCamera = { center: PARIS, zoom: STREET };
/** The second leg: along the Seine to the Eiffel Tower, a hop at street
 *  level that only lifts a couple of zoom levels. */
const ON: MapCamera = { center: EIFFEL, zoom: STREET + 0.4 };

// --- tiles ---------------------------------------------------------------------

type Tile = { z: number; x: number; y: number };

/** Every tile a pane `width`×`height` shows at `camera`, at the level the
 *  map reads and the one above it (a zoom crossing a level shows both). */
function tilesFor(camera: MapCamera, width: number, height: number): Tile[] {
  const c = project(camera.center);
  const world = worldSize(camera.zoom);
  const halfW = (width / 2 + 256) / world;
  const halfH = (height / 2 + 256) / world;
  const out: Tile[] = [];
  const base = Math.min(OSM_MAX, Math.max(0, Math.floor(camera.zoom)));
  for (const z of new Set([base, Math.min(OSM_MAX, base + 1)])) {
    const n = 2 ** z;
    const x0 = Math.floor((c.x - halfW) * n);
    const x1 = Math.floor((c.x + halfW) * n);
    const y0 = Math.max(0, Math.floor((c.y - halfH) * n));
    const y1 = Math.min(n - 1, Math.floor((c.y + halfH) * n));
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) out.push({ z, x: ((x % n) + n) % n, y });
    }
  }
  return out;
}

const inFlight: Record<string, Promise<Uint8Array | null>> = {};

/** A tile from the disk cache, or from OSM into it. */
function tile({ z, x, y }: Tile): Promise<Uint8Array | null> {
  const key = `${z}/${x}/${y}`;
  inFlight[key] ??= (async () => {
    const file = cachePath({ z, x, y });
    if (existsSync(file)) {
      const bytes = new Uint8Array(await readFile(file));
      return bytes.length > 0 ? bytes : null;
    }
    if (offline) return null;
    const response = await fetch(URL_OF(z, x, y), {
      headers: { 'user-agent': USER_AGENT },
    });
    if (response.status === 404 || response.status === 204) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${key}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    return bytes;
  })().catch((error: unknown) => {
    delete inFlight[key];
    throw error;
  });
  return inFlight[key];
}

const SOURCE: MapSource = {
  id: 'osm-shortbread',
  minZoom: 0,
  maxZoom: OSM_MAX,
  tileSize: 512,
  attribution: '© OpenStreetMap contributors',
  async load(request) {
    const data = await tile(request);
    return data ? { kind: 'vector', data } : null;
  },
};

/**
 * Fetch every tile the flight will show, six at a time, at startup. Answers
 * when they are all on disk; the trailer does not wait for it — a tile not
 * in yet when the map shows is fetched then, as any map does.
 */
export async function prefetchFlight(width: number, height: number) {
  const want = new globalThis.Map<string, Tile>();
  for (const [a, b] of [
    [FROM, TO],
    [TO, ON],
  ] as const) {
    for (let i = 0; i <= 160; i++) {
      const cam = flyCamera(a, b, i / 160, Math.max(width, height));
      for (const t of tilesFor(cam, width, height)) {
        want.set(`${t.z}/${t.x}/${t.y}`, t);
      }
    }
  }
  const missing = [...want.values()].filter((t) => !existsSync(cachePath(t)));
  if (missing.length && !offline) {
    process.stderr.write(
      `stress-demo: fetching ${missing.length} of ${want.size} map tiles for the flight (cached for next time)\n`,
    );
  }
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < missing.length) {
      const t = missing[next++];
      await tile(t).catch(() => null);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

// --- the scene -------------------------------------------------------------------

const STYLE = shortbreadStyle({ dark: true, labels: true });

const ROUTE: LngLat[] = Array.from({ length: 33 }, (_, i) => ({
  lon: LONDON.lon + ((PARIS.lon - LONDON.lon) * i) / 32,
  lat: LONDON.lat + ((PARIS.lat - LONDON.lat) * i) / 32,
}));

const OVERLAYS: MapOverlay[] = [
  {
    kind: 'line',
    id: 'route',
    path: ROUTE,
    color: '#b388ff',
    width: 4,
    casing: '#05060a',
    casingWidth: 8,
    cap: 'round',
    join: 'round',
  },
];

const MARKERS: MapMarker[] = [
  { id: 'london', position: LONDON, color: '#6c8cff', size: 22 },
  { id: 'paris', position: PARIS, color: '#ff5c8a', size: 22 },
  { id: 'eiffel', position: EIFFEL, color: '#f5a524', size: 22 },
];

// the beats: hold on London while its tiles land, fly, settle in Paris,
// then down the Seine to the tower
const FLY = [700, 4300] as const;
const HOP = [4900, 6900] as const;

export function MapScene({ active, start }: SceneProps): ReactElement {
  const map = useRef<MapHandle>(null);
  const size = useRef({ width: 1600, height: 900 });

  useTick(active, start, (t) => {
    const m = map.current;
    if (!m) return;
    const viewport = Math.max(size.current.width, size.current.height);
    // at rest between the legs: the map owns its frames, and the labels
    // the stillness lets it place
    if (t <= FLY[1] + 100) {
      m.setCamera(
        flyCamera(FROM, TO, easeInOutSine(progress(t, ...FLY)), viewport),
      );
    } else if (t >= HOP[0] && t <= HOP[1] + 100) {
      m.setCamera(
        flyCamera(TO, ON, easeInOutSine(progress(t, ...HOP)), viewport),
      );
    }
  });

  const defaultCamera = useMemo(() => FROM, []);

  return (
    <box
      style={{ flexGrow: 1 }}
      onLayout={(ev) => {
        size.current = { width: ev.width, height: ev.height };
      }}
    >
      <Map
        ref={map}
        sources={[SOURCE]}
        mapStyle={STYLE}
        defaultCamera={defaultCamera}
        markers={MARKERS}
        overlays={OVERLAYS}
        levelFade={250}
        buildWorkers={2}
        style={{ flexGrow: 1 }}
      />
    </box>
  );
}
