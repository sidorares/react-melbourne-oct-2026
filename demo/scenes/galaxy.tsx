// A galaxy forming: 200,000 stars as one `<points>` draw, collapsing out of
// a shapeless cloud into spiral arms that turn the way a galaxy turns —
// the inner stars faster — while the camera swoops down from overhead and
// then on, past the edge of the disc, to Voyager drifting there with the
// galaxy behind it.
//
// The scene graph is this package's react-three-fiber-shaped layer over
// core's `<glarea>`, and everything that moves is uniforms: the shape and
// the orbit are worked out per star in the vertex shader, so a frame sends
// two floats and a camera to the GPU and the stars never come back to
// JavaScript. (No bloom pass: on macOS a scene drawn through
// `<effectComposer>` comes out black — a bug of its own, not this shot's.) The geometry — eight floats a star — is built before the
// shot, in slices (idle.ts).
import { createElement as h, useMemo, useRef } from 'react';
import type { ReactElement } from 'react';
import { useScale } from 'react-x11';

import { Canvas, useFrame } from '@react-x11/components/three';
import type { RootState } from '@react-x11/components/three';
import { easeInOutCubic, lerp, progress, rng } from '../clock.js';
import { Prepared } from '../idle.js';
import type { SceneProps } from '../scene.js';
import { GROUND, MUTED } from '../shell.js';

const STARS = 200_000;

interface Stars {
  /** radius, height, starting angle */
  position: Float32Array;
  /** where the star starts, in the cloud */
  normal: Float32Array;
  /** hue along the palette, brightness */
  uv: Float32Array;
}

export const galaxyStars = new Prepared<Stars>('galaxy', function* (out) {
  const rand = rng(1977);
  const gauss = (): number =>
    (rand() + rand() + rand() + rand() + rand() + rand() - 3) / 1.5;
  const position = new Float32Array(STARS * 3);
  const normal = new Float32Array(STARS * 3);
  const uv = new Float32Array(STARS * 2);
  const ARMS = 4;
  for (let i = 0; i < STARS; i++) {
    const core = rand() < 0.18;
    // radius: a dense bulge and a long exponential disc
    const r = core
      ? Math.abs(gauss()) * 0.9
      : 0.6 + -Math.log(1 - rand() * 0.995) * 2.2;
    const arm = Math.floor(rand() * ARMS);
    // logarithmic spiral arms, scattered more the further out a star is
    const swirl = Math.log(1 + r) * 2.6;
    const spread = gauss() * (core ? 3 : 0.32 + r * 0.02);
    const angle = (arm / ARMS) * Math.PI * 2 + swirl + spread;
    const h = gauss() * (core ? 0.35 : 0.12) * Math.exp(-r * 0.12);
    position[i * 3] = r;
    position[i * 3 + 1] = h;
    position[i * 3 + 2] = angle;
    // the cloud it starts in: a fat, tumbling sphere
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const rr = 4 + rand() * 9;
    const s = Math.sqrt(1 - u * u);
    normal[i * 3] = rr * s * Math.cos(th);
    normal[i * 3 + 1] = rr * u * 0.8;
    normal[i * 3 + 2] = rr * s * Math.sin(th);
    // the core warm, the arms blue, a sprinkle of pink nebulae
    uv[i * 2] = core
      ? rand() * 0.2
      : rand() < 0.07
        ? 0.85 + rand() * 0.15
        : 0.35 + rand() * 0.4;
    uv[i * 2 + 1] = core ? 0.7 + rand() * 0.6 : 0.25 + rand() * rand() * 1.1;
    if (i % 20_000 === 0) yield;
  }
  out({ position, normal, uv });
});

const VERTEX = `
  uniform float uTime;
  uniform float uForm;
  uniform float uSize;
  varying vec3 vColor;
  varying float vAlpha;

  vec3 palette(float t) {
    vec3 warm = vec3(1.0, 0.86, 0.62);
    vec3 blue = vec3(0.45, 0.62, 1.0);
    vec3 violet = vec3(0.70, 0.52, 1.0);
    vec3 pink = vec3(1.0, 0.42, 0.66);
    if (t < 0.3) return mix(warm, blue, t / 0.3);
    if (t < 0.8) return mix(blue, violet, (t - 0.3) / 0.5);
    return pink;
  }

  void main() {
    float r = position.x;
    // differential rotation: the inner disc laps the outer one
    float a = position.z - uTime * 0.55 / (0.6 + r * 0.6);
    vec3 disc = vec3(cos(a) * r, position.y, sin(a) * r);
    // the cloud turns too, slower, and gives way to the disc
    float c = uTime * 0.12;
    vec3 cloud = vec3(
      normal.x * cos(c) - normal.z * sin(c),
      normal.y,
      normal.x * sin(c) + normal.z * cos(c));
    float k = smoothstep(0.0, 1.0, uForm + (1.0 - r / 14.0) * 0.25 * uForm);
    vec3 p = mix(cloud, disc, clamp(k, 0.0, 1.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.6 + uv.y) / -mv.z;
    vColor = palette(uv.x) * (0.55 + uv.y * 0.6);
    vAlpha = 0.35 + 0.65 * min(1.0, uv.y);
  }
`;

const FRAGMENT = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 q = gl_PointCoord - vec2(0.5);
    float d = dot(q, q) * 4.0;
    float a = exp(-d * 5.0) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

// GL_PROGRAM_POINT_SIZE: a core-profile context — macOS's — sizes a point
// by the vertex shader only when this is on, and draws every star one
// pixel wide otherwise.
const PROGRAM_POINT_SIZE = 0x8642;

/** The shot, in show ms: the cloud collapses into a disc while the camera
 *  comes down from overhead into a low pass across the arms. */
const FORM = [200, 2600] as const;
const SWOOP = [0, 3900] as const;
/** …and then in, past the edge of the disc, to a probe drifting there. */
const APPROACH = [4300, 8000] as const;

/** Where the probe drifts: out past the arms, on the side the swoop ends
 *  on, so the galaxy is behind it when the camera arrives. */
const PROBE = { x: -4.4, y: 1.5, z: 7.6 } as const;
/** The way out from the galaxy's centre through the probe, flat. */
const OUT = (() => {
  const l = Math.hypot(PROBE.x, PROBE.z);
  return { x: PROBE.x / l, z: PROBE.z / l };
})();
/** Where the camera ends: just past the probe, a little to one side and
 *  above, so the probe sits in front of the bright core and not over it. */
const ARRIVE = {
  x: PROBE.x + OUT.x * 3.1 - OUT.z * 1.3,
  y: PROBE.y + 0.7,
  z: PROBE.z + OUT.z * 3.1 + OUT.x * 1.3,
};

function Galaxy({
  start,
  scale,
}: {
  start: number;
  scale: number;
}): ReactElement {
  // a copy each: a geometry keeps what it is handed, and the finale draws
  // a second galaxy from the same stars
  const stars = useMemo(() => {
    const { position, normal, uv } = galaxyStars.get();
    return {
      position: position.slice(),
      normal: normal.slice(),
      uv: uv.slice(),
    };
  }, []);
  const material = useRef<{
    uniforms: Record<string, { value: number }>;
  }>(null);

  useFrame((state: RootState) => {
    const m = material.current;
    // off stage, waiting for its cut: the cloud, turning
    const t = Number.isNaN(start) ? 0 : performance.now() - start;
    if (m) {
      m.uniforms.uTime.value = 6 + t / 1000;
      m.uniforms.uForm.value = easeInOutCubic(progress(t, ...FORM));
    }
    const k = easeInOutCubic(progress(t, ...SWOOP));
    const orbit = lerp(0.2, 2.1, k);
    const radius = lerp(30, 13.5, k);
    const height = lerp(26, 3.2, k);
    const swoop = {
      x: Math.cos(orbit) * radius,
      y: height,
      z: Math.sin(orbit) * radius,
    };
    // the approach: the camera eases over to the probe, and what it looks
    // at slides from the galaxy's centre to the probe
    const a = easeInOutCubic(progress(t, ...APPROACH));
    state.camera.position.set(
      lerp(swoop.x, ARRIVE.x, a),
      lerp(swoop.y, ARRIVE.y, a),
      lerp(swoop.z, ARRIVE.z, a),
    );
    state.camera.lookAt(
      lerp(0, PROBE.x - OUT.z * 0.35, a),
      lerp(lerp(0, -0.6, k), PROBE.y + 0.1, a),
      lerp(0, PROBE.z + OUT.x * 0.35, a),
    );
  });

  // `createElement` for the scene's own elements: core's JSX declarations do
  // not have these three, and this package's (the three JSX pragma) resolve
  // through its built `dist/` — a step running a demo should not need.
  return h(
    'points',
    null,
    h('bufferGeometry', {
      position: stars.position,
      normal: stars.normal,
      uv: stars.uv,
    }),
    h('shaderMaterial', {
      ref: material,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      uniforms: { uTime: 0, uForm: 0, uSize: 34 * scale },
    }),
  );
}

/**
 * Voyager, from a dozen primitives: the ten-sided bus, the 3.7 m high-gain
 * dish and its feed, the long magnetometer boom, the boom carrying the
 * three radioisotope generators, the science boom and its scan platform,
 * and the golden record on the side of the bus. Lit by one sun; it turns
 * slowly as it drifts.
 */
function Voyager({ start }: { start: number }): ReactElement {
  const probe = useRef<{
    rotation: { x: number; y: number; z: number };
    position: { y: number };
  }>(null);
  useFrame(() => {
    const p = probe.current;
    if (!p) return;
    const t = Number.isNaN(start) ? 0 : (performance.now() - start) / 1000;
    p.rotation.y = 0.9 + t * 0.12;
    p.rotation.z = 0.18 + Math.sin(t * 0.5) * 0.04;
    p.position.y = PROBE.y + Math.sin(t * 0.7) * 0.05;
  });
  const white = { color: '#e9ecf2', roughness: 0.45, metalness: 0.1 };
  const gold = { color: '#c9a45c', roughness: 0.35, metalness: 0.75 };
  const grey = { color: '#7d8494', roughness: 0.6, metalness: 0.4 };
  const part = (
    geometry: [string, unknown[]],
    material: Record<string, unknown>,
    at: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
  ) =>
    h(
      'mesh',
      { position: at, rotation },
      h(geometry[0], { args: geometry[1] }),
      h('meshStandardMaterial', material),
    );
  return h(
    'group',
    { ref: probe, position: [PROBE.x, PROBE.y, PROBE.z], scale: 0.42 },
    // the bus: ten sides, foil-gold
    part(['cylinderGeometry', [0.9, 0.9, 0.45, 10]], gold, [0, 0, 0]),
    // the high-gain dish above it, its feed on struts
    part(['cylinderGeometry', [1.85, 0.32, 0.42, 48]], white, [0, 0.5, 0]),
    part(['cylinderGeometry', [0.05, 0.05, 1.0, 8]], grey, [0, 1.1, 0]),
    part(['sphereGeometry', [0.12, 12, 8]], white, [0, 1.62, 0]),
    // the magnetometer boom, thirteen metres of it, off to one side
    part(
      ['cylinderGeometry', [0.025, 0.025, 7.5, 6]],
      grey,
      [4.4, -0.15, 0.4],
      [0, 0, Math.PI / 2],
    ),
    // the RTG boom, and the three generators at its end
    part(
      ['cylinderGeometry', [0.04, 0.04, 2.4, 6]],
      grey,
      [-1.6, -0.25, -0.5],
      [0, 0.3, Math.PI / 2],
    ),
    ...[0, 1, 2].map((i) =>
      part(
        ['cylinderGeometry', [0.17, 0.17, 0.32, 12]],
        grey,
        [-2.25 - i * 0.36, -0.25, -0.7],
        [0, 0.3, Math.PI / 2],
      ),
    ),
    // the science boom and its scan platform
    part(
      ['cylinderGeometry', [0.04, 0.04, 2.2, 6]],
      grey,
      [1.3, -0.3, -0.9],
      [0, -0.6, Math.PI / 2],
    ),
    part(['boxGeometry', [0.55, 0.4, 0.45]], white, [2.25, -0.3, -1.55]),
    part(['boxGeometry', [0.2, 0.2, 0.5]], grey, [2.25, -0.05, -1.85]),
    // the golden record, on the side of the bus
    part(
      ['cylinderGeometry', [0.3, 0.3, 0.03, 32]],
      { color: '#e8c15a', roughness: 0.2, metalness: 0.9 },
      [0, -0.02, 0.86],
      [Math.PI / 2, 0, 0],
    ),
  );
}

export function GalaxyScene({ start }: SceneProps): ReactElement {
  const scale = useScale();
  return (
    <Canvas
      style={{ flexGrow: 1 }}
      camera={{
        position: [0, 30, 0.1],
        target: [0, 0, 0],
        fov: 50,
        near: 0.05,
        far: 400,
      }}
      glx={{ DEPTH_SIZE: 24 }}
      onCreated={(state: RootState) => {
        const gl = state.gl as {
          enable?: (cap: number) => void;
          createVertexArray?: () => unknown;
          bindVertexArray?: (vao: unknown) => void;
        } | null;
        gl?.enable?.(PROGRAM_POINT_SIZE);
        // A vertex array of its own, bound for good. On macOS every GL
        // surface in the app shares one context, and the flow scene's
        // renderer — up to the fix in react-x11-components#816 — deleted
        // the vertex array it left bound when it unmounted: the context
        // had none, a core profile draws nothing without one, and this
        // scene came out as a single point.
        gl?.bindVertexArray?.(gl.createVertexArray?.());
      }}
      onError={(error: Error) =>
        process.stderr.write(`galaxy: ${error.message}\n`)
      }
      fallback={(error: Error) => (
        <box
          style={{
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: GROUND,
          }}
        >
          <text style={{ color: MUTED, fontSize: 16 }}>{error.message}</text>
        </box>
      )}
    >
      <color attach="background" args={['#020308']} />
      {h('ambientLight', { intensity: 0.35 })}
      {/* the sun, far behind and above the camera's last position */}
      {h('directionalLight', { position: [9, 6, 14], intensity: 1.15 })}
      <Galaxy start={start} scale={scale} />
      <Voyager start={start} />
    </Canvas>
  );
}
