// A rich text editor over a long document, edited as it is read and then
// written into by a script that only presses keys and runs the editor's
// commands — with three ProseMirror plugins doing what they would in a
// browser.
//
// The opening is edits, not reading: a phrase typed over, a link put on the
// heading, a task ticked, two cells of the table changed on the way down —
// each a change in the frame it is made, where three slow scrolls through
// text nobody could read were the first four seconds.
//
// Every character goes in through the view's `insertText` — ProseMirror's
// `handleTextInput`, where its input rules live — so `## ` becomes a
// heading, `- ` a list and `> ` a quote the way they do under a person's
// fingers, and Return and Tab are key events through the editor's own
// keymap. The plugins are stock ProseMirror: a decoration plugin that
// marks every TODO, and the editor's suggestions — `/` opens a block menu
// whose rows are commands (the table comes from there), `@` a list of
// people. What draws it is this package's view, one `<richeditortext>` per
// textblock, so a keystroke re-renders the paragraph it lands in. The pane
// on the right is `onChange`'s markdown: what an app would save, in a
// `<Code>` block highlighted by highlight.js's markdown grammar through
// the package's `hljsLanguage` adapter.
import { useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { XK_RETURN, XK_TAB } from 'react-x11/keysyms';
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, Selection, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

import {
  RichTextEditor,
  insertTable,
  schema,
  setLink,
  setTaskChecked,
  toggleBlockType,
  toggleList,
} from '@react-x11/components/rich-text-editor';
import type {
  RichTextEditorHandle,
  Suggester,
  SuggestionItem,
} from '@react-x11/components/rich-text-editor';
import { Code } from '@react-x11/components/code';
import { hljsLanguage } from '@react-x11/components/code-language';
import hljs from 'highlight.js/lib/core';
import markdownGrammar from 'highlight.js/lib/languages/markdown';
import { easeInOutCubic, lerp, progress, useTick } from '../clock.js';
import type { SceneProps } from '../scene.js';
import { findScroller } from '../scroll.js';
import type { Scroller } from '../scroll.js';
import { Script } from '../script.js';
import type { Step } from '../script.js';
import { MUTED, PANEL } from '../shell.js';

const START = `# Launch notes — react-x11 2.48

Everything in this document was typed by nobody. The part below the line
at the end is typed **live**, by a script that only presses keys.

## What shipped

- **Drag and drop on a Mac.** A press dragged past the threshold used to
  throw from \`beginDrag\` on a worker; every \`dragData\` thunk now resolves
  as the drag begins.
- **Video in panes.** A \`<Frame>\` pane's \`<video src>\` is played by its
  host and copied down through shared IOSurfaces.
- **Sprites with clips.** A part cut to a rounded clip is lifted onto a
  layer instead of painted every frame.
- [x] Release notes written
- [x] Floor moved in both specs
- [ ] Trailer recorded

## Numbers

| Scene | Frames | Dropped |
| :-- | --: | --: |
| Code editor | 510 | 11 |
| Table | 291 | 18 |
| Map | 64 | 1 |
| Galaxy | 64 | 1 |

> A frame is a budget — eight milliseconds of it on a 120 Hz panel — and
> every one of them can be accounted for.

## How a frame is spent

1. **Layout**: yoga, and the content floors core keeps for every box.
2. **Paint**: the damage, at device pixels, through CoreGraphics.
3. **Present**: a swapchain of IOSurfaces, and the layers above them.

\`\`\`ts
export function measure(frames: number): Promise<number> {
  const start = performance.now();
  return nextFrames(frames).then(() => (performance.now() - start) / frames);
}
\`\`\`

## Open questions

- Should a card's colour loop be a style of its own?
- Can a table hand its scroll pill to core as a pinned rect?
- What does a scroll cost when nothing on screen changes?

TODO: decide what the trailer leaves out.

---
`;

hljs.registerLanguage('markdown', markdownGrammar);
/** Markdown, tokenized by highlight.js: no tokenizer for it ships with the
 *  package, and its adapter turns any of highlight.js's grammars into one. */
const MARKDOWN = hljsLanguage({ hljs, name: 'markdown' }) ?? undefined;

/** A ProseMirror plugin, unchanged from what a browser editor would run:
 *  every TODO, decorated. */
function todoPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const found: Decoration[] = [];
        state.doc.descendants((node, pos) => {
          if (!node.isText || !node.text) return;
          for (const m of node.text.matchAll(/\bTODO\b/g)) {
            const from = pos + (m.index ?? 0);
            found.push(Decoration.inline(from, from + 4, { class: 'todo' }));
          }
        });
        return DecorationSet.create(state.doc, found);
      },
    },
  });
}

const { nodes } = schema;

const SUGGESTIONS: Suggester[] = [
  {
    char: '/',
    startOfLine: true,
    items: [
      {
        label: 'Heading 2',
        detail: '##',
        command: toggleBlockType(nodes.heading, { level: 2 }),
      },
      {
        label: 'Bulleted list',
        detail: '-',
        command: toggleList(nodes.bullet_list, nodes.list_item),
      },
      { label: 'Table', detail: '| |', command: insertTable() },
      {
        label: 'Code block',
        detail: '```',
        command: toggleBlockType(nodes.code_block),
      },
    ],
  },
  {
    char: '@',
    items: (
      [
        ['Ada Lovelace', 'ada'],
        ['Grace Hopper', 'grace'],
        ['Katherine Johnson', 'katherine'],
        ['Margaret Hamilton', 'margaret'],
      ] as Array<[string, string]>
    ).map(([label, handle]): SuggestionItem => ({
      label,
      detail: `@${handle}`,
      insert: `@${handle}`,
    })),
  },
];

const DECORATIONS = {
  todo: { bg: '#ffe08a', color: '#5c4400', weight: 700 },
};

/** A key through the editor's keymap — as core hands one to the view. */
function press(editor: RichTextEditorHandle | null, keysym: number): void {
  editor?.view.keyDown({
    keysym,
    key: '',
    codepoint: 0,
    preventDefault() {},
    stopPropagation() {},
  } as never);
}

/** Where `text` is in the document: the first text node holding it, or,
 *  with `whole`, the first that is nothing else (a table cell's number). */
function findText(
  doc: PMNode,
  text: string,
  whole = false,
): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.isText || !node.text) return true;
    const i = whole ? (node.text === text ? 0 : -1) : node.text.indexOf(text);
    if (i >= 0) found = { from: pos + i, to: pos + i + text.length };
    return true;
  });
  return found;
}

/** What the script asks of the scene around the editor. */
interface Stage {
  /** Glide the pane, over `ms`, to the table or to the end. */
  glideTo(where: 'table' | 'end', ms: number): void;
  /** The saved-markdown pane follows the end of the document from now. */
  followEnd(): void;
}

function steps(get: () => RichTextEditorHandle | null, stage: Stage): Step[] {
  const key = (fn: (e: RichTextEditorHandle) => unknown, wait = 70): Step => ({
    run: () => {
      const e = get();
      if (e) fn(e);
    },
    wait,
  });
  const enter = (wait = 70) => key((e) => press(e, XK_RETURN), wait);
  /** Select `text`, as a double-click and a drag would. */
  const select = (text: string, wait: number, whole = false): Step =>
    key((e) => {
      e.run((state, dispatch) => {
        const at = findText(state.doc, text, whole);
        if (!at) return false;
        dispatch?.(
          state.tr.setSelection(
            TextSelection.create(state.doc, at.from, at.to),
          ),
        );
        return true;
      });
    }, wait);
  return [
    // the opening: edits all the way down, each in the frame it is made
    key((e) => e.focus(), 0),
    select('typed by nobody', 380),
    { type: 'edited while you watch', cps: 44 },
    { wait: 180 },
    // a link on the heading, the caret left at its end to show it
    select('react-x11 2.48', 300),
    key((e) => {
      e.run(setLink('https://github.com/sidorares/react-x11'));
      e.run((state, dispatch) => {
        dispatch?.(
          state.tr.setSelection(
            TextSelection.create(state.doc, state.selection.to),
          ),
        );
        return true;
      });
    }, 360),
    // the one task left, ticked — what clicking its box does
    key((e) => {
      e.run((state, dispatch) => {
        let at = -1;
        state.doc.descendants((node, pos) => {
          if (at < 0 && node.attrs.checked === false) at = pos;
          return at < 0;
        });
        return at >= 0 && setTaskChecked(at, true)(state, dispatch);
      });
    }, 380),
    // down to the numbers, and nothing dropped any more
    key(() => stage.glideTo('table', 620), 680),
    select('11', 180, true),
    { type: '0', cps: 10 },
    { wait: 120 },
    select('18', 180, true),
    { type: '0', cps: 10 },
    { wait: 260 },
    // and on to the end, where the rest is written
    key(() => {
      stage.glideTo('end', 700);
      stage.followEnd();
    }, 760),
    // to the end, ready to write: a new paragraph after the rule the
    // document ends on (the end of a document that ends in a rule is the
    // rule itself, selected, and typing would replace it)
    key((e) => {
      e.run((state, dispatch) => {
        const end = state.doc.content.size;
        const tr = state.tr.insert(end, nodes.paragraph.create());
        dispatch?.(tr.setSelection(TextSelection.create(tr.doc, end + 1)));
        return true;
      });
    }, 150),
    { type: '## ', cps: 30 },
    { type: 'Typed live' },
    enter(),
    { type: '- ', cps: 30 },
    { type: 'Drawn natively, ' },
    key((e) => e.toggleMark('strong'), 0),
    { type: 'not in a browser' },
    key((e) => e.toggleMark('strong'), 0),
    enter(),
    { type: 'Markdown in, ' },
    key((e) => e.toggleMark('em'), 0),
    { type: 'markdown out' },
    key((e) => e.toggleMark('em'), 0),
    { type: ' — see the pane on the right' },
    enter(),
    { type: 'Plugins from ProseMirror, ' },
    key((e) => e.toggleMark('code'), 0),
    { type: 'unchanged' },
    key((e) => e.toggleMark('code'), 0),
    enter(),
    enter(160),
    // the block menu: `/`, a filter, Return on the row it leaves
    { type: '/', cps: 20 },
    { wait: 250 },
    { type: 'tab', cps: 12 },
    { wait: 300 },
    enter(200),
    // three cells, Tab between them, as a table's keymap has it
    { type: 'Scene', cps: 30 },
    key((e) => press(e, XK_TAB)),
    { type: 'Frames', cps: 30 },
    key((e) => press(e, XK_TAB)),
    { type: 'Feels', cps: 30 },
    key((e) => press(e, XK_TAB)),
    { type: 'Trailer', cps: 30 },
    key((e) => press(e, XK_TAB)),
    { type: '12,419', cps: 30 },
    key((e) => press(e, XK_TAB)),
    { type: 'smooth', cps: 30 },
    // out of the table, onto a new line after it
    key((e) => {
      e.run((state, dispatch) => {
        const end = state.doc.content.size;
        const tr = state.tr.insert(end, nodes.paragraph.create());
        dispatch?.(tr.setSelection(Selection.atEnd(tr.doc)));
        return true;
      });
    }, 150),
    { type: 'Reviewed with @gra', cps: 40 },
    { wait: 350 },
    enter(200),
    { type: ' — TODO: post the trailer.', cps: 45 },
    { wait: 300 },
  ];
}

/** When the script starts: the editor on screen, the card gone. */
const SCRIPT_AT = 200;

export function RichTextScene({
  active,
  start,
  size,
}: SceneProps): ReactElement {
  const editor = useRef<RichTextEditorHandle>(null);
  const box = useRef(null);
  const pane = useRef<Scroller | null>(null);
  const [saved, setSaved] = useState(START);
  // the saved-markdown pane: kept at the top while the edits are up
  // there, then following the end as the typing does
  const savedBox = useRef(null);
  const savedPane = useRef<Scroller | null>(null);
  const following = useRef(false);
  const followed = useRef(0);
  const plugins = useMemo(() => [todoPlugin()], []);
  // the glide under way, in show ms, and the clock it is read against
  const glide = useRef<{
    from: number;
    to: number;
    at: number;
    ms: number;
  } | null>(null);
  const now = useRef(0);
  const script = useMemo(
    () =>
      new Script(
        steps(() => editor.current, {
          glideTo(where, ms) {
            const p = (pane.current ??= findScroller(box.current));
            const e = editor.current;
            if (!p || !e) return;
            let to = p.room();
            if (where === 'table') {
              // the table a little under the top, wherever layout put it
              const at = findText(e.state.doc, 'Code editor', true);
              if (at) {
                to = p.y() + e.view.coordsAtPos(at.from).top - p.top() - 110;
              }
            }
            glide.current = {
              from: p.y(),
              to: Math.max(0, Math.min(p.room(), to)),
              at: now.current,
              ms,
            };
          },
          followEnd: () => {
            following.current = true;
          },
        }),
        (text) => {
          // a key at a time, as typed: an input rule sees each one
          for (const ch of text) editor.current?.view.insertText(ch);
        },
        { cps: 60, start: SCRIPT_AT },
      ),
    [],
  );

  useTick(active, start, (t, dt) => {
    now.current = t;
    script.tick(t);
    const g = glide.current;
    const p = pane.current;
    if (g && p) {
      const k = easeInOutCubic(progress(t, g.at, g.at + g.ms));
      p.scrollTo({ y: Math.round(lerp(g.from, g.to, k)) });
      // let go at the end, so the editor's own scrolling has the pane back
      if (k >= 1) glide.current = null;
    }
    // the saved markdown eases after its end, as a chat pane does
    const sp = (savedPane.current ??= findScroller(savedBox.current));
    if (sp) {
      const target = following.current ? sp.room() : 0;
      followed.current += (target - followed.current) * Math.min(1, dt / 120);
      if (Math.abs(target - followed.current) < 0.5) followed.current = target;
      sp.scrollTo({ y: Math.round(followed.current) });
    }
  });

  const height = size.height - 56;
  return (
    <box style={{ flexGrow: 1, flexDirection: 'row', gap: 22, padding: 28 }}>
      <box ref={box} style={{ flexGrow: 3, flexBasis: 0, height }}>
        <RichTextEditor
          ref={editor}
          defaultValue={START}
          onChange={(ev) => setSaved(ev.value)}
          toolbar
          plugins={plugins}
          suggestions={SUGGESTIONS}
          decorationClasses={DECORATIONS}
          fontSize={18}
          style={{
            height,
            borderWidth: 1,
            borderColor: '#1b2030',
            borderRadius: 12,
            backgroundColor: '#0b0e16',
          }}
        />
      </box>
      <box
        style={{
          flexGrow: 2,
          flexBasis: 0,
          height,
          gap: 10,
          padding: 16,
          borderRadius: 12,
          backgroundColor: PANEL,
        }}
      >
        <text style={{ fontSize: 14, color: MUTED }}>
          onChange · the markdown an app would save
        </text>
        <box
          ref={savedBox}
          // sized in numbers: the pane's own padding, caption and gap off
          style={{ height: height - 62, overflow: 'scroll' }}
        >
          <Code
            source={saved}
            language={MARKDOWN}
            wrap
            selectable={false}
            fontSize={15}
            style={{ backgroundColor: 'transparent' }}
          />
        </box>
      </box>
    </box>
  );
}
