// A full-screen code editor over a 20,000-line file — react-x11's own
// source, as installed, concatenated — flung from the top to deep inside
// it, and then typed into.
//
// The fling is a scroll the editor blits: each frame copies the rows that
// stayed and draws the ones that came in, so its cost is the strip the
// frame moved, not the screen. Highlighting past the tokenizer's frontier
// is guessed from the lines just above and corrected by a background walk
// (src/code-language/stream.ts), which is why a jump ten thousand lines
// down does not tokenize ten thousand lines first.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useRef } from 'react';
import type { ReactElement } from 'react';

import { CodeEditor, javascript } from '@react-x11/components/code-editor';
import type {
  CodeEditorHandle,
  Diagnostic,
} from '@react-x11/components/code-editor';
import { easeInOutCubic, progress, useTick } from '../clock.js';
import type { SceneProps } from '../scene.js';

/** Where react-x11's entry point is: its source directory, which the
 *  package ships as written. */
const ROOT = path.dirname(fileURLToPath(import.meta.resolve('react-x11')));
const TARGET_LINES = 20_000;

let corpus: string | null = null;

/** react-x11's own JavaScript, a file after another until the target —
 *  real code, so the highlighting has real work in it. Read once. */
export function codeCorpus(): string {
  if (corpus) return corpus;
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (name.endsWith('.js')) files.push(file);
    }
  };
  walk(ROOT);
  const out: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8').split('\n');
    out.push(
      `// ${'─'.repeat(6)} react-x11/src/${path.relative(ROOT, file)}`,
      ...text,
    );
    if (out.length >= TARGET_LINES) break;
  }
  corpus = out.slice(0, TARGET_LINES).join('\n');
  return corpus;
}

/** What replaces the block deleted mid-screen. */
const FUNCTION = `/** Typed in at three hundred characters a second, coloured as it lands. */
export function flingTo(pane: Scroller, target: number, ms = 600): Promise<void> {
  const from = pane.y();
  const start = performance.now();
  return new Promise((done) => {
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / ms);
      pane.scrollTo({ y: from + (target - from) * ease(t) });
      if (t < 1) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });
}
`;

/** …and what is typed seven thousand lines further down. */
const SECOND = `
    // seven thousand lines down, and the keys still land in the frame they are typed in
    if (frame.late) return schedule(frame.next(), { budget: 4 });`;

const DIAGNOSTICS: readonly Diagnostic[] = [
  {
    from: { line: 40, ch: 9 },
    to: { line: 40, ch: 20 },
    severity: 'warning',
    message: 'unused',
  },
];

// Where the flings land, in lines, and the shot's beats, in ms. Everything
// after the first fling is the editing: under three seconds of it.
const FIRST = 1400;
const SECOND_AT = 8600;
const BEAT = {
  fling: [150, 1250],
  select: [1450, 1900],
  remove: 1930,
  type: [1980, 3700],
  jump: [3900, 4500],
  second: [4650, 5500],
  // the editor's own commands on what was just typed, a key a beat
  commands: [5800, 6250, 6650, 7000],
} as const;
// the block selected and deleted, from the top of the view
const BLOCK_FROM = 15;
const BLOCK_LINES = 14;

/** Characters of `text` due at `t` in a beat `[a, b]`. */
const typed = (text: string, t: number, [a, b]: readonly [number, number]) =>
  Math.floor(progress(t, a, b) * text.length);

export function CodeScene({ active, start }: SceneProps): ReactElement {
  const editor = useRef<CodeEditorHandle>(null);
  const state = useRef({
    line: 0,
    scrolled: 0,
    top: 0,
    selected: false,
    removed: false,
    typed: 0,
    jumpFrom: -1,
    second: -1,
    commands: 0,
  });

  useTick(active, start, (t) => {
    const ed = editor.current;
    if (!ed) return;
    const s = state.current;
    if (!s.line) {
      // the line pitch, as the editor laid it out: two carets a line apart
      ed.focus();
      ed.moveCaret({ line: 1, ch: 0 }, false);
      const below = ed.caretRect().y;
      ed.moveCaret({ line: 0, ch: 0 }, false);
      s.line = below - ed.caretRect().y || 18;
    }
    const scrollTo = (px: number): void => {
      const want = Math.round(px);
      if (want === s.scrolled) return;
      ed.scrollBy(0, want - s.scrolled);
      s.scrolled = want;
    };

    // the fling, eased in and out as a flick of a trackpad is
    if (t < BEAT.select[0]) {
      scrollTo(easeInOutCubic(progress(t, ...BEAT.fling)) * FIRST * s.line);
      return;
    }
    s.top ||= Math.round(s.scrolled / s.line);
    const from = s.top + BLOCK_FROM;

    // a block in the middle of the screen, selected a line at a time…
    if (t < BEAT.remove) {
      const lines = Math.ceil(progress(t, ...BEAT.select) * BLOCK_LINES);
      ed.select({ line: from, ch: 0 }, { line: from + lines, ch: 0 });
      return;
    }
    // …deleted…
    if (!s.removed) {
      s.removed = true;
      ed.replaceRange(
        { line: from, ch: 0 },
        { line: from + BLOCK_LINES, ch: 0 },
        '',
      );
      ed.moveCaret({ line: from, ch: 0 }, false);
    }
    // …and a function typed where it was
    const due = typed(FUNCTION, t, BEAT.type);
    if (due > s.typed) {
      ed.insertText(FUNCTION.slice(s.typed, due));
      s.typed = due;
    }
    if (t < BEAT.jump[0]) return;

    // then away through the file, seven thousand lines…
    if (s.jumpFrom < 0) s.jumpFrom = s.scrolled;
    const target = SECOND_AT * s.line;
    scrollTo(
      s.jumpFrom +
        (target - s.jumpFrom) * easeInOutCubic(progress(t, ...BEAT.jump)),
    );
    if (t < BEAT.second[0]) return;

    // …and typing again, at the end of a line in the middle of the view
    if (s.second < 0) {
      const line = SECOND_AT + 18;
      ed.moveCaret({ line, ch: ed.lines[line]?.length ?? 0 }, false);
      s.second = 0;
    }
    const more = typed(SECOND, t, BEAT.second);
    if (more > s.second) {
      ed.insertText(SECOND.slice(s.second, more));
      s.second = more;
    }

    // …then the commands an editor is for, on those two lines: selected,
    // commented out (Ctrl+/), back in, indented (Tab), and undone (Ctrl+Z)
    const [select, comment, uncomment, undo] = BEAT.commands;
    const line = SECOND_AT + 19;
    const step = (at: number, run: () => void): void => {
      if (t >= at && s.commands < at) {
        s.commands = at;
        run();
      }
    };
    step(select, () =>
      ed.select(
        { line, ch: 0 },
        { line: line + 1, ch: ed.lines[line + 1]?.length ?? 0 },
      ),
    );
    step(comment, () => ed.toggleLineComment());
    step(uncomment, () => {
      ed.toggleLineComment();
      ed.indentSelection(1);
    });
    step(undo, () => ed.undo());
  });

  return (
    <CodeEditor
      ref={editor}
      language={javascript({ typescript: true })}
      defaultValue={codeCorpus()}
      diagnostics={DIAGNOSTICS}
      lineNumbers
      activeLine
      style={{
        flexGrow: 1,
        // a quarter over the editor's 13, as the rich text editor is
        fontSize: 16,
        backgroundColor: '#0b0e16',
        color: '#c8d3f5',
        borderWidth: 0,
      }}
    />
  );
}
