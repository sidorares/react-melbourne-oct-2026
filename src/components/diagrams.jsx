// The few slides whose picture is a diagram rather than text. Each is a
// self-contained component with its data as default props, so a slide uses
// it with one tag and can still override the data.

/** A transition render interrupted by a click (Priorities section). */
export function InterruptTimeline() {
  const slice = (x, w = 120) => (
    <div className="tl__slice" style={{ left: x, width: w }} />
  );
  return (
    <div className="tl">
      <p className="tl__lane">JS thread</p>
      <p className="tl__note tone--blue" style={{ left: 232, top: 40, width: 520 }}>
        transition render, ~5 ms slices
      </p>
      {slice(232)}
      {slice(368)}
      {slice(504)}
      {slice(640)}
      <div className="tl__discard" />
      <p className="tl__note tone--orange" style={{ left: 232, top: 210, width: 540 }}>
        work in progress thrown away (prepareFreshStack)
      </p>
      <div className="tl__marker" />
      <p className="tl__note tone--orange" style={{ left: 798, top: 6, width: 300 }}>
        click: SyncLane
      </p>
      <p className="tl__block tl__block--sync" style={{ left: 802, width: 220 }}>
        sync render
      </p>
      <p className="tl__block tl__block--commit" style={{ left: 1032, width: 100 }}>
        commit
      </p>
      {slice(1162, 110)}
      {slice(1286, 110)}
      {slice(1410, 110)}
      <p className="tl__block tl__block--commit2" style={{ left: 1534, width: 130 }}>
        commit
      </p>
      <p className="tl__note" style={{ left: 802, top: 210, width: 330 }}>
        the click is on screen first
      </p>
      <p className="tl__note" style={{ left: 1162, top: 210, width: 502 }}>
        transition restarts from <b>current</b>, with both updates applied
      </p>
    </div>
  );
}

function Window({ rects }) {
  return (
    <div className="dmg__window">
      <div className="dmg__bar" style={{ left: 40, top: 124, width: 720 }} />
      <div className="dmg__bar" style={{ left: 40, top: 168, width: 600 }} />
      <div className="dmg__bar" style={{ left: 40, top: 212, width: 680 }} />
      <div className="dmg__node" style={{ left: 40, top: 40, width: 140 }} />
      <div className="dmg__node" style={{ left: 600, top: 256, width: 160 }} />
      {rects.map(([left, top, width, height]) => (
        <div
          key={`${left},${top}`}
          className="dmg__rect"
          style={{ left, top, width, height }}
        />
      ))}
    </div>
  );
}

/** Two changes at opposite corners: one bounding box vs a list of rects. */
export function DamageRects() {
  return (
    <div className="dmg">
      <div className="dmg__side">
        <p className="dmg__caption">
          <b>One box</b> around both changes: most of the window
        </p>
        <Window rects={[[30, 30, 740, 292]]} />
      </div>
      <div className="dmg__side">
        <p className="dmg__caption">
          <b>A list</b>: two small passes, each clipped to its rect
        </p>
        <Window
          rects={[
            [30, 30, 160, 76],
            [590, 246, 180, 76],
          ]}
        />
      </div>
    </div>
  );
}

/** A viewport before and after a two-row scroll: what is copied, what is painted. */
export function ScrollBlit({ rows = 8, by = 2 }) {
  const before = Array.from({ length: rows }, (_, i) => i + 1);
  const after = before.map((r) => r + by);
  return (
    <div className="blit">
      <div className="blit__side">
        <p className="eyebrow">Before</p>
        <div className="blit__viewport">
          {before.map((r) => (
            <p key={r} className="blit__row">
              row {r}
            </p>
          ))}
        </div>
      </div>
      <div className="blit__arrow" />
      <div className="blit__side">
        <p className="eyebrow">After {by} rows</p>
        <div className="blit__viewport">
          {after.map((r) => (
            <p
              key={r}
              className={`blit__row ${r > rows ? 'blit__row--painted' : 'blit__row--copied'}`}
            >
              row {r}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * A line in memory order and in screen order. Characters at an odd bidi
 * level are tinted. The visual row is authored, not computed: each
 * character is its own box, so the browser never reorders them.
 */
export function BidiRows({
  logical = ['H', 'e', 'l', 'l', 'o', '␣', 'ש', 'ל', 'ו', 'ם', '␣', '4', '2'],
  visual = ['H', 'e', 'l', 'l', 'o', '␣', 'ם', 'ו', 'ל', 'ש', '␣', '4', '2'],
  rtl = (c) => /[֐-ࣿ]/.test(c),
}) {
  const row = (label, chars) => (
    <div className="bidi__row">
      <p className="bidi__label">{label}</p>
      <div className="bidi__chars">
        {chars.map((c, i) => (
          <p key={i} className={`bidi__ch${rtl(c) ? ' bidi__ch--rtl' : ''}`}>
            {c}
          </p>
        ))}
      </div>
    </div>
  );
  return (
    <div className="bidi">
      {row('in memory', logical)}
      {row('on screen', visual)}
    </div>
  );
}

/** The GL map's adaptive-quality ladder, widest rung = most detail. */
export function QualityLadder({
  rungs = [
    'full detail',
    '− edge antialiasing, ⅕ of a dense frame',
    '− newest detail: buildings, service roads',
    '− next: sites, minor roads',
    '+ parent-level tiles',
    'tiles two levels up',
  ],
}) {
  const shades = ['#1F6FA8', '#3B7FB2', '#5A93BE', '#7FAACC', '#A5C2DA', '#CBDAE7'];
  return (
    <div className="ladder">
      {rungs.map((text, i) => (
        <div key={i} className="ladder__row">
          <p className="ladder__n">{i}</p>
          <p
            className="ladder__rung"
            style={{
              width: 860 - i * 100,
              background: shades[i] ?? shades.at(-1),
              color: i < 2 ? '#F3F1EB' : '#14181F',
            }}
          >
            {text}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Where react-x11's source lines are, by area (Under the hood section). */
export function CodeShare({
  rows = [
    { name: 'Desktop and input', detail: 'events, focus, styles, fonts, a11y, menus, tray, DnD, DBus', lines: 44142 },
    { name: 'Platform backends', detail: 'Cocoa, Wayland, win32', lines: 36599 },
    { name: 'Retained tree and painting', detail: 'layout, paint, damage, scroll', lines: 27521 },
    { name: 'Types', detail: 'hand-written .d.ts', lines: 9899 },
    { name: 'Built-in components', detail: 'Button, Select, menus, Dialog…', lines: 8287 },
    { name: 'DX', detail: 'dev CLI, Fast Refresh, test harness, DevTools', lines: 6423 },
    { name: 'Reconciler.js', detail: 'everything React calls', lines: 1078, tone: 'orange' },
  ],
  total = 133949,
}) {
  const max = Math.max(...rows.map((r) => r.lines));
  const k = (n) => `${(n / 1000).toFixed(1)}k`;
  const pct = (n) => {
    const p = (100 * n) / total;
    return p < 1 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
  };
  return (
    <div className="share">
      {rows.map((r) => (
        <div key={r.name} className={`share__row tone--${r.tone ?? 'blue'}`}>
          <div>
            <p className="share__name">{r.name}</p>
            <p className="share__detail">{r.detail}</p>
          </div>
          <div className="share__track">
            <div className="share__bar" style={{ width: (440 * r.lines) / max }} />
            <p className="share__value">
              {k(r.lines)} · {pct(r.lines)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
