# Writing slides

Every slide is MDX: markdown plus a few React components, on a fixed
1920×1080 canvas that is scaled to the screen. Sizes in this guide are canvas
pixels.

## Where things are

```
src/slides/index.js      the deck order: one import per section file
src/slides/NN-name.mdx   a section; each top-level <Slide> is one slide
src/components/          the components below (blocks.jsx, diagrams.jsx)
                         and their look (components.css)
public/img/              images, referenced as "img/name.png"
```

A section file starts with its name, which goes into every footer:

```mdx
export const section = 'Render vs commit';
```

## A slide

```mdx
<Slide theme="dark" source="src/Reconciler.js:239">

## The title

A paragraph of body text.

<Notes>

Speaker notes, as markdown. Shown only in the presenter window (`p`).

</Notes>
</Slide>
```

| prop     | values                                                        |
| -------- | ------------------------------------------------------------- |
| `theme`  | `light` (default), `dark`, `accent` (the orange statement)    |
| `layout` | `default` (title at the top, footer), `statement` (centred)   |
| `source` | footer text after "react-x11 · section"                       |
| `footer` | `false` hides the footer on a default slide                   |
| `bar`    | draws the orange bar down the left edge                       |
| `gap`    | space between blocks in px (default 40)                       |

**MDX rule that bites:** markdown inside a component needs a blank line
after the opening tag and before the closing one. Without them the text is
taken literally.

```mdx
<Card title="Pure">

This is markdown: **bold** works.

</Card>
```

Text that contains `<` or `{` must be escaped: `{'<window>'}`, or write it in
backticks.

## Building blocks

| component | what it is |
| --- | --- |
| `<Cols template="1fr 600px" gap={40} align="start">` | columns; each child is one column, usually a `<Col>` |
| `<Col gap={24}>` | a vertical stack |
| `<Grid cols={3} gap={24}>` | equal columns, e.g. of cards |
| `<Card title label tone variant dense>` | `dense`: tighter padding, 24px text; `variant`: `panel` (default), `top` (panel with an accent bar), `rule` (accent bar on the left, no fill), `line` (top rule only), `inverse` (dark panel on a light slide), `dashed`; `tone`: `blue`, `orange`, `muted` |
| `<Stat value="4.2 kB" label="…" tone="orange">` | a big number with a caption |
| `<Numbered n="1" tone="orange" variant="box" size="lg">` | a numbered row (`box`: on a panel; `lg`: the takeaways size) |
| `<Layer name="react" tone dashed>` | a row of the layer diagram |
| `<Eyebrow tone>` | small uppercase label |
| `<Lead>` | large paragraph (44px) |
| `<Small>` | small muted paragraph (24px) |
| `<O>`, `<B>` | inline orange / blue accent (amber / cyan on dark slides) |
| `<Mono>` | inline monospace (backticks work too) |
| `<Code size={26} pad={24}>` | wrap a fenced code block to change its font size (default 24px) or padding (default 28px 36px) |
| `<Shot src alt width height style>` | a screenshot with a shadow; `style` to pin it |
| `<Spacer />` | takes the remaining space in a column |

Fenced code blocks are highlighted at build time (shiki). Markdown tables
work (GFM). When a table needs a highlighted row or a monospace column,
write it as JSX: `<tr className="hl-blue">`, `<tr className="hl-orange">`,
`<table className="mono-first">`.

Diagrams, one tag each: `<InterruptTimeline />`, `<DamageRects />`,
`<ScrollBlit />`, `<BidiRows />`, `<QualityLadder />`, `<CodeShare />`
(src/components/diagrams.jsx; their data are props with defaults).

## Builds: a slide in several steps

Wrap anything in `<Step>` and it appears on a later click of the same
slide. → shows the next step before moving on; ← takes steps back, and
going back into a slide lands on its last step.

```mdx
<Grid cols={3}>
<Card title="Always there">…</Card>
<Step><Card title="Click 1">…</Card></Step>
<Step><Card title="Click 2">…</Card></Step>
</Grid>

Inline: the answer is <Step inline at={3}>**42**</Step>.

<Step at={1} until={2}>

Shown on clicks 1 and 2, gone on 3.

</Step>

<Step dim>

Faded until its click, instead of hidden.

</Step>
```

| prop | |
| --- | --- |
| `at` | the click it appears on (1, 2, …). Left out: the next number in document order, after the highest `at` before it. Several steps can share a number. |
| `until` | the last click it is shown on |
| `dim` | faded before its click instead of hidden |
| `inline` | a `<span>`, for inside a paragraph or a table cell |

Hidden content keeps its space, so nothing moves when it appears, and a
`<Step>` adds no box of its own: a `<Card>` wrapped in one is still an item
of the grid around it.

A component that changes with the click, a diagram say, reads the step
itself and the slide says how many there are:

```jsx
import { useStep } from '../deck/steps.js';

function Pipeline() {
  const step = useStep(); // 0 before the first click
  return …;
}
```

```mdx
<Slide steps={3}>
```

The URL carries the step (`#/12.2` is slide 12 after two clicks). The
presenter window shows the step count and previews what the next click
shows. The overview and print show every slide in its final state.

## Checking

```bash
npm run check   # compiles every .mdx and reports syntax errors
npm run dev     # then press `o`: a slide that overflows the canvas is outlined in red
```

## Presenting

| key | |
| --- | --- |
| → ↓ Space PageDown Enter | next step, then next slide |
| ← ↑ Shift+Space PageUp Backspace | previous step, then previous slide |
| Home / End | first / last |
| `p` | open the presenter window: current and next slide, notes, timer |
| `o` | overview of every slide; Esc to leave |
| `f` | fullscreen |

The URL says where you are (`#/12`, or `#/12.2` after two clicks), so a reload keeps your place, and the
presenter and audience windows follow each other (same browser, any two
windows or screens). `#/print` lays every slide out one per page: print to
PDF from there, with margins off and background graphics on.
