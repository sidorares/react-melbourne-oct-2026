// Core's `<video>`, both ways it takes pictures, under scripted controls.
//
// Left, `<video src>`: a file the platform plays — AVFoundation on macOS,
// on a layer of its own, so its frames reach the screen with no frame of
// the window's. The controls under it are ordinary widgets driving the
// element's handle: `playbackRate`, `seek()` while a scrubber is dragged,
// `paused`. They sit under the picture and not over it, because a node
// painted over a video takes it off its layer.
//
// Right, `<video frames>`: a sink the application pushes decoded frames
// into — here a plasma computed in JavaScript, a frame per display frame.
// That one works on every backend.
//
// The clip is made on this machine, not downloaded: a Mandelbrot zoom
// rendered by ffmpeg's own `mandelbrot` source at startup, in a process of
// its own, and kept in the temp directory for the next run. `--video=file`
// plays something of your own instead; with neither, the left pane says so.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Button, Slider, useSupports, useVideoFrames } from 'react-x11';
import type { VideoNode } from 'react-x11';

import { progress, useTick } from '../clock.js';
import type { SceneProps } from '../scene.js';
import { ACCENT, INK, MUTED, PANEL } from '../shell.js';

const CACHE = path.join(os.tmpdir(), 'react-x11-stress-demo');
const CLIP = path.join(CACHE, 'mandelbrot-720p60.mp4');
const own = process.argv
  .find((a) => a.startsWith('--video='))
  ?.slice('--video='.length);

let making: Promise<string | null> | null = null;

/** The clip's path once it exists: the user's, the cached one, or one
 *  ffmpeg is asked to make now (null when there is no ffmpeg). */
export function prepareClip(): Promise<string | null> {
  if (own) return Promise.resolve(path.resolve(own));
  if (existsSync(CLIP)) return Promise.resolve(CLIP);
  making ??= new Promise((resolve) => {
    mkdirSync(CACHE, { recursive: true });
    const partial = `${CLIP}.part.mp4`;
    const child = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'mandelbrot=size=1280x720:rate=60:start_x=-0.743643887037158704752191506114774:start_y=-0.131825904205311970493132056385139:start_scale=3:end_scale=0.00002:end_pts=600:maxiter=300:outer=normalized_iteration_count:inner=period',
        '-t',
        '10',
        '-c:v',
        process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264',
        '-b:v',
        '12M',
        '-pix_fmt',
        'yuv420p',
        '-tag:v',
        'avc1',
        partial,
      ],
      { stdio: 'ignore' },
    );
    child.on('error', () => resolve(null));
    child.on('exit', (code) => {
      if (code !== 0) return resolve(null);
      renameSync(partial, CLIP);
      resolve(CLIP);
    });
  });
  return making;
}

let clipPath: string | null = existsSync(CLIP)
  ? CLIP
  : own
    ? path.resolve(own)
    : null;
void prepareClip().then((p) => (clipPath = p));

// --- the plasma ------------------------------------------------------------------

const PW = 480;
const PH = 270;
const SIN = new Int32Array(1024);
for (let i = 0; i < 1024; i++) {
  SIN[i] = Math.round(64 + 63 * Math.sin((i / 1024) * Math.PI * 2));
}
const PALETTE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  const a = (i / 256) * Math.PI * 2;
  const r = Math.round(128 + 127 * Math.sin(a));
  const g = Math.round(128 + 127 * Math.sin(a + 2.1));
  const b = Math.round(128 + 127 * Math.sin(a + 4.2));
  // BGRA bytes, little-endian
  PALETTE[i] = (255 << 24) | (r << 16) | (g << 8) | b;
}
const RADIUS = new Int32Array(PW * PH);
for (let y = 0; y < PH; y++) {
  for (let x = 0; x < PW; x++) {
    RADIUS[y * PW + x] = Math.round(Math.hypot(x - PW / 2, y - PH / 2) * 6);
  }
}
const plasmaFrame = new Uint8Array(PW * PH * 4);
const plasmaPixels = new Uint32Array(plasmaFrame.buffer);

/** One frame of an old-school plasma: four sine fields, a palette — about
 *  a millisecond of this thread for 130,000 pixels. */
function plasma(t: number): Uint8Array {
  const t1 = Math.floor(t * 0.09);
  const t2 = Math.floor(t * 0.13);
  const t3 = Math.floor(t * 0.05);
  for (let y = 0, i = 0; y < PH; y++) {
    const sy = SIN[(y * 5 + t2) & 1023];
    for (let x = 0; x < PW; x++, i++) {
      const v =
        SIN[(x * 4 + t1) & 1023] +
        sy +
        SIN[((x + y) * 3 + t3) & 1023] +
        SIN[(RADIUS[i] + t1 * 2) & 1023];
      plasmaPixels[i] = PALETTE[(v + t3) & 255];
    }
  }
  return plasmaFrame;
}

// --- the scene ---------------------------------------------------------------------

const fmt = (s: number): string =>
  Number.isFinite(s)
    ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
    : '–:––';

const BEAT = {
  rates: [
    [1100, 2],
    [4400, 4],
    [5300, 1],
  ],
  scrubs: [
    [2000, 3100],
    [5700, 6500],
  ],
  pause: 3300,
  resume: 4000,
} as const;

export function VideoScene({ active, start }: SceneProps): ReactElement {
  const playback = useSupports('mediaPlayback');
  const frames = useVideoFrames({ width: PW, height: PH, format: 'BGRA' });
  const video = useRef<VideoNode>(null);
  const [rate, setRate] = useState(1);
  const [paused, setPaused] = useState(false);
  const [at, setAt] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [duration, setDuration] = useState(10);

  const pushed = useRef(-Infinity);

  useTick(active, start, (t) => {
    // a frame of plasma every 16 ms: a video's rate, not the display's
    if (t - pushed.current >= 15) {
      pushed.current = t;
      frames.push(plasma(t));
    }
    const v = video.current;
    // the rate buttons, pressed in turn
    let want: number = rate;
    for (const [at, r] of BEAT.rates) if (t >= at) want = r;
    if (want !== rate) setRate(want);
    // the scrubber dragged back and forth; the picture follows the thumb
    const scrub = BEAT.scrubs.find(([a, b]) => t >= a && t < b);
    if (scrub) {
      if (!scrubbing) setScrubbing(true);
      const k = progress(t, scrub[0], scrub[1]);
      const to = 1.5 + Math.sin(k * Math.PI * 1.5) * 4 + k * 3;
      v?.seek(to);
      setAt(to);
      return;
    }
    if (scrubbing) setScrubbing(false);
    if (t >= BEAT.pause && t < BEAT.resume && !paused) setPaused(true);
    if (t >= BEAT.resume && paused) setPaused(false);
  });

  return (
    <box style={{ flexGrow: 1, flexDirection: 'row', gap: 28, padding: 28 }}>
      <box style={{ flexGrow: 3, gap: 14 }}>
        <Caption
          title="<video src>"
          note="AVFoundation, on a layer of its own"
        />
        <box
          style={{
            flexGrow: 1,
            backgroundColor: '#000',
            borderRadius: 10,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {playback && clipPath ? (
            <video
              ref={video}
              src={clipPath}
              autoPlay
              loop
              muted
              paused={paused || scrubbing}
              playbackRate={rate}
              // the clock under the picture: the player says where it is a
              // few times a second, as HTML's timeupdate does
              onTimeUpdate={(ev) => {
                if (process.env.SD_DEBUG)
                  process.stderr.write(`time ${ev.currentTime.toFixed(2)}\n`);
                if (!scrubbing) setAt(ev.currentTime);
              }}
              onLoadedMetadata={(ev) => setDuration(ev.duration)}
              onError={(err) => process.stderr.write(`video: ${err.message}\n`)}
              style={{ flexGrow: 1, alignSelf: 'stretch' }}
            />
          ) : (
            <text style={{ color: MUTED, fontSize: 16 }}>
              {playback
                ? 'No clip: install ffmpeg, or pass --video=file'
                : 'This backend has no platform player — see the sink on the right'}
            </text>
          )}
        </box>
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: 10,
            borderRadius: 10,
            backgroundColor: PANEL,
          }}
        >
          <Button
            primary={!paused}
            label={paused ? 'Play' : 'Pause'}
            onPress={() => setPaused((p) => !p)}
            style={{ width: 84 }}
          />
          <text style={{ color: INK, fontFamily: '$monoFamily', fontSize: 14 }}>
            {fmt(at)}
          </text>
          <Slider
            value={Number.isFinite(duration) ? at / duration : 0}
            onChange={(ev) => video.current?.seek(ev.value * duration)}
            style={{ flexGrow: 1 }}
          />
          <text
            style={{ color: MUTED, fontFamily: '$monoFamily', fontSize: 14 }}
          >
            {fmt(duration)}
          </text>
          {[1, 2, 4].map((r) => (
            <Button
              key={r}
              size="small"
              variant={rate === r ? 'solid' : 'ghost'}
              primary={rate === r}
              label={`${r}×`}
              onPress={() => setRate(r)}
            />
          ))}
        </box>
      </box>
      <box style={{ flexGrow: 2, gap: 14 }}>
        <Caption
          title="<video frames>"
          note="pushed from JavaScript, every frame"
        />
        <box
          style={{
            flexGrow: 1,
            backgroundColor: '#000',
            borderRadius: 10,
            justifyContent: 'center',
          }}
        >
          <video
            frames={frames}
            style={{ flexGrow: 1, alignSelf: 'stretch' }}
          />
        </box>
        <box
          style={{
            padding: 14,
            borderRadius: 10,
            backgroundColor: PANEL,
            gap: 4,
          }}
        >
          <text style={{ color: INK, fontSize: 14 }}>
            {`${PW}×${PH} BGRA · ${Math.round((PW * PH * 4) / 1024)} KB a frame`}
          </text>
          <text style={{ color: MUTED, fontSize: 13 }}>
            a frame is a push: no layout, no paint of the window
          </text>
        </box>
      </box>
    </box>
  );
}

function Caption({
  title,
  note,
}: {
  title: string;
  note: string;
}): ReactElement {
  return (
    <box style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
      <text
        style={{
          fontSize: 18,
          fontWeight: 'bold',
          color: ACCENT,
          fontFamily: '$monoFamily',
        }}
      >
        {title}
      </text>
      <text style={{ fontSize: 15, color: MUTED }}>{note}</text>
    </box>
  );
}
