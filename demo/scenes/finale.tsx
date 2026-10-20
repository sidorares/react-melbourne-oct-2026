// Everything at once: six of the trailer's scenes running side by side,
// each the real scene at its full size inside a box that scales it down.
//
// The scaling is core's `scale` prop, which is CSS `zoom` and not a
// transform: every length under the box is multiplied by it, text is shaped
// at the size it is drawn at, and a GL surface is a GL surface the size of
// its tile. So the wall is not a picture of six scenes — it is six scenes,
// two GL surfaces among them, one frame loop driving all of them, in one
// window.
import type { ReactElement, ReactNode } from 'react';

import type { SceneProps } from '../scene.js';
import { INK, MUTED } from '../shell.js';
import { ChartsScene } from './charts.js';
import { CodeScene } from './code.js';
import { GalaxyScene } from './galaxy.js';
import { MapScene } from './map.js';
import { TerminalScene } from './terminal.js';
import { VideoScene } from './video.js';

const COLS = 3;
const ROWS = 2;
const GAP = 14;
const PAD = 18;
const LABEL = 24;

const TILES: { title: string; render: (p: SceneProps) => ReactNode }[] = [
  { title: 'Code editor', render: (p) => <CodeScene {...p} /> },
  { title: 'Vector tiles', render: (p) => <MapScene {...p} /> },
  { title: '3D scene', render: (p) => <GalaxyScene {...p} /> },
  { title: 'Terminal', render: (p) => <TerminalScene {...p} /> },
  { title: 'Charts', render: (p) => <ChartsScene {...p} compact /> },
  { title: 'Video', render: (p) => <VideoScene {...p} /> },
];

export function FinaleScene({ active, start, size }: SceneProps): ReactElement {
  const tileW = Math.floor((size.width - PAD * 2 - GAP * (COLS - 1)) / COLS);
  const tileH = Math.floor(
    (size.height - PAD * 2 - GAP * (ROWS - 1)) / ROWS - LABEL,
  );
  // each scene laid out at the stage's own proportions, scaled to the tile
  const scale = Math.min(tileW / size.width, tileH / size.height);
  const inner = {
    width: Math.floor(tileW / scale),
    height: Math.floor(tileH / scale),
  };
  return (
    <box style={{ flexGrow: 1 }}>
      {TILES.map((tile, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        return (
          <box
            key={tile.title}
            style={{
              position: 'absolute',
              left: PAD + col * (tileW + GAP),
              top: PAD + row * (tileH + LABEL + GAP),
              width: tileW,
              height: tileH + LABEL,
            }}
          >
            <box
              style={{
                height: LABEL,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <text style={{ fontSize: 14, fontWeight: 'bold', color: INK }}>
                {tile.title}
              </text>
              <text style={{ fontSize: 12, color: MUTED }}>live</text>
            </box>
            <box
              style={{
                width: tileW,
                height: tileH,
                // square: on macOS a clip with round corners is a mask, and
                // six of them over everything the tiles draw cost a fifth
                // of every frame
                overflow: 'hidden',
              }}
            >
              <box
                scale={scale}
                style={{ width: inner.width, height: inner.height }}
              >
                {tile.render({ active, start, size: inner })}
              </box>
            </box>
          </box>
        );
      })}
    </box>
  );
}
