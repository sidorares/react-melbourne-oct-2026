# React without the DOM: how react-x11 works

Slides for **React Melbourne, October 2026** — Andrey Sidorov.

**Live:** <https://sidorares.github.io/react-melbourne-oct-2026/>

How a custom React renderer works, using
[react-x11](https://github.com/sidorares/react-x11) as the worked example:
the reconciler's host config, render vs commit, priorities and discarded
work, one update from an X event to pixels, which elements become native
windows and which are painted, damage tracking, text from fonts down to
XRender glyph bytes, and what made it fast.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

| key | |
| --- | --- |
| → ↓ Space | next build step, then next slide |
| ← ↑ Shift+Space | back |
| `p` | presenter window: current and next slide, speaker notes, timer |
| `o` | overview of all slides |
| `f` | fullscreen |

`#/print` shows every slide one per page; print to PDF from there.

## Edit it

Slides are MDX, one file per section, in [src/slides](src/slides). Each
`<Slide>` is a slide, its `<Notes>` are the speaker notes, kept next to
the slide they belong to, and `<Step>` makes part of a slide appear on a
later click. The components and how to use them are in
[AUTHORING.md](AUTHORING.md).

```
src/slides/        the talk: NN-section.mdx, ordered by src/slides/index.js
src/components/    slide building blocks and diagrams, and their CSS
src/deck/          the deck runtime: scaling, keys, presenter, overview, print
public/img/        images
examples/          the follow-along programs from the "Try it" slides
demo/              the stress-demo trailer, a package of its own (demo/README.md)
tools/             scripts that regenerate the screenshots and the glyph capture
SOURCES.md         where every claim and number on the slides comes from
```

`npm run check` compiles every slide file and reports MDX errors; in
`npm run dev`, a slide whose content overflows the 1920×1080 canvas is
outlined in red in the overview (`o`).

## Publish to GitHub Pages

The build uses relative paths and hash URLs, so it works at any Pages
address (`https://<you>.github.io/<repo>/`) with no configuration.

1. Push this folder to a GitHub repository, on `main`.
2. In the repository: **Settings → Pages → Build and deployment → Source:
   GitHub Actions**.
3. Every push to `main` runs [.github/workflows/pages.yml](.github/workflows/pages.yml):
   `npm ci`, `npm run check`, `npm run build`, and deploys `dist/`.

To check the production build locally: `npm run build && npm run preview`.

## The examples

[examples/](examples) holds `app.jsx`, `hello.jsx`, `counter.jsx` and `todo.jsx`, the
same files the slides show. See [examples/README.md](examples/README.md).

## Regenerating the images

```bash
cd examples && npm install
node ../tools/capture-glyphs.mjs              # the Text section's bytes and type-glyphs.png
node --import tsx ../tools/render-examples.mjs   # app.png, hello.png, counter.png, todo.png
```

Both draw into node-x11's in-process X server, so no display is needed. With
the default font (Arial, as shipped with macOS) they reproduce the committed
images byte for byte. `public/img/tasks.png` is react-x11's own
`docs/img/tasks.png`.
