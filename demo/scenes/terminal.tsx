// A terminal under a flood: a build log at several megabytes a second, and
// then a full-screen program drawing with the cursor.
//
// `<Terminal backend="vt">` is a pty, `@xterm/headless` as the escape
// sequence state machine, and `<vtterm>` drawing the cell grid itself. The
// program on the other end here is no process at all: `PtyHost` is a public
// seam (the one ssh and containers plug into), and this one is a script in
// this process — so the shot needs no shell, no native pty module and no
// network, and is the same every run. The renderer's damage is a diff of
// what each row shows, and a scroll is a copy of the rows that stayed: a
// flood costs what changed on screen, not what went by.
import { useMemo, useRef } from 'react';
import type { ReactElement } from 'react';

import { Terminal } from '@react-x11/components/terminal';
import type { TerminalProps } from '@react-x11/components/terminal';
import { progress, rng, useTick } from '../clock.js';
import type { SceneProps } from '../scene.js';

// The pty seam's types, named off the prop that takes one: the subpath
// exports `<Terminal>`'s props, not the names of what they hold.
type PtyHost = NonNullable<TerminalProps['pty']>;
type PtyOptions = Parameters<PtyHost['openPty']>[1];
type PtySession = Awaited<ReturnType<PtyHost['openPty']>>;

const ESC = '\x1b[';
const C = {
  dim: `${ESC}2m`,
  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
  bold: `${ESC}1m`,
  reset: `${ESC}0m`,
};

/** A program on the other end of the pty: whatever `feed` is handed. */
class ScriptedPty implements PtySession {
  readonly pid = null;
  private listeners: ((chunk: string) => void)[] = [];
  cols = 120;
  rows = 40;
  write(): void {}
  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
  }
  kill(): boolean {
    return true;
  }
  onData(listener: (chunk: string) => void): void {
    this.listeners.push(listener);
  }
  onExit(): void {}
  feed(chunk: string): void {
    for (const listener of this.listeners) listener(chunk);
  }
}

class ScriptedHost implements PtyHost {
  readonly session = new ScriptedPty();
  async available(): Promise<boolean> {
    return true;
  }
  async openPty(
    _argv: readonly string[],
    options: PtyOptions,
  ): Promise<PtySession> {
    this.session.resize(options.cols, options.rows);
    return this.session;
  }
}

/** Two thousand lines of a build log, made once and dealt out in order. */
const LOG = (() => {
  const rand = rng(7);
  const dirs = [
    'src/html/layout',
    'src/maps/gl',
    'src/flow',
    'src/table',
    'src/code-editor',
    'src/three',
    'src/charts',
    'src/rich-text-editor',
  ];
  const words = [
    'paint',
    'scene',
    'index',
    'node',
    'render',
    'tiles',
    'cascade',
    'shader',
    'rows',
    'text',
    'layout',
    'pack',
  ];
  const lines: string[] = [];
  for (let i = 0; i < 2000; i++) {
    const r = rand();
    const file = `${dirs[i % dirs.length]}/${words[Math.floor(rand() * words.length)]}.ts`;
    const ms = Math.floor(rand() * 90);
    if (r < 0.72) {
      lines.push(
        `${C.green}✓${C.reset} ${C.dim}compiled${C.reset} ${file} ${C.dim}(${ms} ms)${C.reset}`,
      );
    } else if (r < 0.85) {
      lines.push(
        `${C.cyan}▸${C.reset} bundling ${C.bold}${file.replace('.ts', '.js')}${C.reset} ${C.magenta}${(rand() * 400).toFixed(1)} kB${C.reset}`,
      );
    } else if (r < 0.95) {
      lines.push(
        `${C.yellow}▲${C.reset} ${file}:${Math.floor(rand() * 900)}:${Math.floor(rand() * 80)} ${C.yellow}unused '${words[i % words.length]}${i}'${C.reset}`,
      );
    } else {
      lines.push(
        `${C.blue}•${C.reset} cache ${C.dim}hit${C.reset} ${(rand() * 1e6).toString(16).slice(0, 8)} ${C.dim}${file}${C.reset}`,
      );
    }
  }
  return lines;
})();

const PROMPT = `${C.green}${C.bold}~/react-x11${C.reset} ${C.blue}❯${C.reset} `;
const COMMAND = 'npm run build -- --verbose';
const MATRIX = 'cmatrix';
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789ABCDEF<>=+*';

const BEAT = {
  typed: [150, 750],
  flood: [800, 4200],
  done: 4250,
  matrixTyped: [4500, 4900],
  matrix: 5000,
} as const;

export function TerminalScene({ active, start }: SceneProps): ReactElement {
  const host = useMemo(() => new ScriptedHost(), []);
  const state = useRef({
    typed: 0,
    line: 0,
    done: false,
    matrixTyped: 0,
    drops: null as number[] | null,
    last: 0,
  });
  const rand = useMemo(() => rng(11), []);

  useTick(active, start, (t) => {
    const pty = host.session;
    const s = state.current;
    const out: string[] = [];
    if (s.typed === 0) out.push(PROMPT);
    const typed = Math.floor(progress(t, ...BEAT.typed) * COMMAND.length);
    if (typed > s.typed) {
      out.push(COMMAND.slice(s.typed, typed));
      if (typed === COMMAND.length) out.push('\r\n');
      s.typed = typed;
    }
    // the flood: from a few lines a frame up to two hundred, ~6 MB/s
    if (t >= BEAT.flood[0] && t < BEAT.flood[1]) {
      const k = progress(t, ...BEAT.flood);
      const lines = Math.floor(2 + 200 * k * k);
      for (let i = 0; i < lines; i++) {
        out.push(LOG[s.line++ % LOG.length], '\r\n');
      }
    }
    if (t >= BEAT.done && !s.done) {
      s.done = true;
      out.push(
        `\r\n${C.green}${C.bold}✔ built ${s.line.toLocaleString('en')} modules${C.reset} ${C.dim}in 2.3 s${C.reset}\r\n\r\n${PROMPT}`,
      );
    }
    const mt = Math.floor(progress(t, ...BEAT.matrixTyped) * MATRIX.length);
    if (mt > s.matrixTyped) {
      out.push(MATRIX.slice(s.matrixTyped, mt));
      s.matrixTyped = mt;
    }
    // then a full-screen program: the alternate screen, the cursor moved
    // cell by cell, a frame of rain per display frame
    if (t >= BEAT.matrix && t - s.last >= 30) {
      s.last = t;
      const { cols, rows } = pty;
      if (!s.drops) {
        s.drops = Array.from(
          { length: cols },
          () => -Math.floor(rand() * rows),
        );
        out.push('\r\n', `${ESC}?1049h${ESC}?25l${ESC}2J`);
      }
      for (let x = 0; x < cols; x += 1) {
        const y = s.drops[x];
        if (y >= 0 && y < rows) {
          const ch = GLYPHS[Math.floor(rand() * GLYPHS.length)];
          out.push(`${ESC}${y + 1};${x + 1}H${C.bold}${ESC}97m${ch}`);
          if (y > 0) {
            out.push(
              `${ESC}${y};${x + 1}H${C.reset}${C.green}${GLYPHS[(x * 7 + y) % GLYPHS.length]}`,
            );
          }
        }
        const tail = y - 14;
        if (tail >= 0 && tail < rows) out.push(`${ESC}${tail + 1};${x + 1}H `);
        s.drops[x] = y + 1 > rows + 16 ? -Math.floor(rand() * 10) : y + 1;
      }
      out.push(C.reset);
    }
    if (out.length) pty.feed(out.join(''));
  });

  return (
    <box style={{ flexGrow: 1, padding: 18 }}>
      <Terminal
        backend="vt"
        pty={host}
        fontSize={13}
        scrollback={2000}
        colors={{ background: '#07090f', foreground: '#c8d3f5' }}
        style={{ flexGrow: 1, borderRadius: 10 }}
      />
    </box>
  );
}
