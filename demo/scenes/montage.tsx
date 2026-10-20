// The smaller components, and core's own widgets, on one long page that
// scrolls past them in eased glides, its section headers sticking to the
// top as their sections go by.
//
// Everything on the page is live while it scrolls: a pipeline advances, a
// calendar's range grows, a colour picker's hue turns, switches flip and
// sliders slide — each on its own beat, a state change at a time. The
// headers are core's `position: 'sticky'`, held by the scroll pane in the
// pass that scrolls it, so a glide is still a copy of what stayed.
import { useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  Button,
  Checkbox,
  Icon,
  ProgressBar,
  Radio,
  RadioGroup,
  Slider,
  Switch,
} from 'react-x11';

import { Calendar } from '@react-x11/components/calendar';
import type { CalendarDay } from '@react-x11/components/calendar';
import { ColorPicker } from '@react-x11/components/color-picker';
import { Formula } from '@react-x11/components/formula';
import {
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDescription,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from '@react-x11/components/timeline';
import { glide, useTick } from '../clock.js';
import type { SceneProps } from '../scene.js';
import { findScroller } from '../scroll.js';
import type { Scroller } from '../scroll.js';
import { ACCENT, GROUND, INK, MUTED, PANEL } from '../shell.js';

const SECTION_H = 470;
const HEADER_H = 64;

const FORMULAS = [
  '\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}',
  'e^{i\\pi} + 1 = 0',
  '\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}',
  '\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}',
];

const STAGES = ['Checkout', 'Install', 'Build', 'Test', 'Sign', 'Publish'];

/** Where the page stands, in px, at each moment: a glide to each section
 *  and a hold on it while its header sticks. */
function stops(): (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [[0, 0]];
  let t = 650;
  for (let i = 1; i <= 4; i++) {
    out.push([t, (i - 1) * SECTION_H]);
    t += 620;
    out.push([t, i * SECTION_H]);
    t += 880;
  }
  return out;
}
const STOPS = stops();

export function MontageScene({
  active,
  start,
  size,
}: SceneProps): ReactElement {
  const box = useRef(null);
  const pane = useRef<Scroller | null>(null);
  const [beat, setBeat] = useState(0);
  const [hue, setHue] = useState(220);
  const [slider, setSlider] = useState(0.2);

  useTick(active, start, (t) => {
    const p = (pane.current ??= findScroller(box.current));
    p?.scrollTo({ y: Math.round(glide(t, STOPS)) });
    // the discrete things move on a beat, a tenth of a second or so
    const b = Math.floor(t / 110);
    if (b !== beat) setBeat(b);
    // the smooth ones every frame, but only while they can be seen
    const y = p?.y() ?? 0;
    if (y > SECTION_H * 2 && y < SECTION_H * 4) {
      setHue(Math.round(220 + ((t / 6) % 360)) % 360);
    }
    if (y > SECTION_H * 3) setSlider(0.5 + 0.45 * Math.sin(t / 260));
  });

  return (
    <box style={{ flexGrow: 1, alignItems: 'center' }}>
      <box
        ref={box}
        style={{ width: 1180, height: size.height, overflow: 'scroll' }}
      >
        <Section title="Formula" note="TeX, typeset natively — and selectable">
          <box style={{ gap: 26, paddingTop: 10, alignItems: 'center' }}>
            {FORMULAS.map((tex) => (
              <Formula key={tex} tex={tex} display size={30} />
            ))}
          </box>
        </Section>
        <Section title="Timeline" note="A release pipeline, advancing">
          <Pipeline at={Math.floor(beat / 3) % (STAGES.length + 2)} />
        </Section>
        <Section
          title="Color picker"
          note="Three canvases and two thumbs, a hue a frame"
        >
          <box
            style={{ flexDirection: 'row', gap: 40, alignItems: 'flex-start' }}
          >
            <ColorPicker
              value={`hsl(${hue}, 78%, 62%)`}
              alpha
              style={{ width: 300 }}
            />
            <Swatches hue={hue} />
          </box>
        </Section>
        <Section title="Calendar" note="A range, growing a day at a time">
          <Range beat={beat} />
        </Section>
        <Section
          title="Core widgets"
          note="react-x11's own: Button, Switch, Slider, ProgressBar…"
        >
          <Widgets beat={beat} slider={slider} />
        </Section>
      </box>
    </box>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <box style={{ height: SECTION_H, flexShrink: 0 }}>
      <box
        style={{
          position: 'sticky',
          top: 0,
          height: HEADER_H,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          paddingLeft: 8,
          backgroundColor: GROUND,
          zIndex: 1,
        }}
      >
        <text style={{ fontSize: 30, fontWeight: 'bold', color: INK }}>
          {title}
        </text>
        <text style={{ fontSize: 17, color: MUTED }}>{note}</text>
      </box>
      <box style={{ flexGrow: 1, padding: 8 }}>{children}</box>
    </box>
  );
}

function Pipeline({ at }: { at: number }): ReactElement {
  return (
    <box style={{ flexDirection: 'row', gap: 60 }}>
      <Timeline size="lg">
        {STAGES.map((stage, i) => (
          <TimelineItem key={stage}>
            <TimelineConnector>
              <TimelineSeparator />
              <TimelineIndicator
                variant={i < at ? 'solid' : i === at ? 'solid' : 'outline'}
                accent={i < at ? '$success' : undefined}
              >
                {i < at ? <Icon name="check" size={14} /> : String(i + 1)}
              </TimelineIndicator>
            </TimelineConnector>
            <TimelineContent>
              <TimelineTitle>{stage}</TimelineTitle>
              <TimelineDescription>
                {i < at ? 'done' : i === at ? 'running…' : 'queued'}
              </TimelineDescription>
            </TimelineContent>
          </TimelineItem>
        ))}
      </Timeline>
      <box style={{ flexGrow: 1, gap: 14, paddingTop: 8 }}>
        {STAGES.map((stage, i) => (
          <box key={stage} style={{ gap: 6 }}>
            <text style={{ color: MUTED, fontSize: 13 }}>{stage}</text>
            <ProgressBar
              value={i < at ? 1 : 0}
              indeterminate={i === at}
              height={6}
            />
          </box>
        ))}
      </box>
    </box>
  );
}

function Swatches({ hue }: { hue: number }): ReactElement {
  return (
    <box style={{ gap: 12 }}>
      {[0, 30, 60, 120, 180].map((d) => (
        <box
          key={d}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <box
            style={{
              width: 120,
              height: 44,
              borderRadius: 10,
              backgroundColor: `hsl(${(hue + d) % 360}, 78%, 62%)`,
            }}
          />
          <text
            style={{ color: MUTED, fontFamily: '$monoFamily', fontSize: 14 }}
          >
            {`hsl(${(hue + d) % 360}, 78%, 62%)`}
          </text>
        </box>
      ))}
    </box>
  );
}

const FIRST: CalendarDay = '2026-10-05' as CalendarDay;

function Range({ beat }: { beat: number }): ReactElement {
  const days = 2 + (Math.floor(beat / 2) % 24);
  const end = useMemo(() => {
    const d = new Date(2026, 9, 5 + days);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` as CalendarDay;
  }, [days]);
  return (
    <box style={{ flexDirection: 'row', gap: 40 }}>
      <Calendar
        mode="range"
        value={{ start: FIRST, end }}
        month="2026-10"
        locale="en-GB"
        focusable={false}
      />
      <box style={{ gap: 10, paddingTop: 12 }}>
        <text style={{ color: INK, fontSize: 22 }}>{`${days + 1} days`}</text>
        <text
          style={{ color: MUTED, fontSize: 15 }}
        >{`5 October → ${end}`}</text>
      </box>
    </box>
  );
}

function Widgets({
  beat,
  slider,
}: {
  beat: number;
  slider: number;
}): ReactElement {
  const on = (k: number) => Math.floor(beat / 3 + k) % 2 === 0;
  const fill = ((beat % 30) / 30) ** 0.7;
  return (
    <box style={{ flexDirection: 'row', gap: 36 }}>
      <box style={{ gap: 18, width: 300 }}>
        <box style={{ flexDirection: 'row', gap: 10 }}>
          <Button primary label="Deploy" />
          <Button label="Preview" />
          <Button variant="ghost" label="Cancel" />
        </box>
        {['Promote animations', 'Blit on scroll', 'Prefetch tiles'].map(
          (label, k) => (
            <box
              key={label}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <Switch checked={on(k)} />
              <text style={{ color: INK, fontSize: 15 }}>{label}</text>
            </box>
          ),
        )}
        <Checkbox label="Reduced motion respected" checked={on(1)} />
      </box>
      <box style={{ gap: 18, flexGrow: 1 }}>
        <Slider min={0} max={1} step={0.001} value={slider} />
        <Slider min={0} max={1} step={0.001} value={1 - slider * 0.8} />
        <ProgressBar value={fill} height={8} />
        <ProgressBar indeterminate height={8} />
        <RadioGroup value={Math.floor(beat / 4) % 3}>
          <box style={{ flexDirection: 'row', gap: 22 }}>
            <Radio value={0} label="60 Hz" />
            <Radio value={1} label="120 Hz" />
            <Radio value={2} label="Display" />
          </box>
        </RadioGroup>
        <box
          style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor: PANEL,
            borderWidth: 1,
            borderColor: ACCENT,
          }}
        >
          <text style={{ color: MUTED, fontSize: 14 }}>
            Every widget here is core's — drawn by react-x11, or the platform's
            own bezel where the backend has one.
          </text>
        </box>
      </box>
    </box>
  );
}
