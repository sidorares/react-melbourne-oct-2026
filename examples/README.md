# Follow-along examples

The three programs from the "Try it" slides, exactly as shown there.

```bash
cd examples
npm install
npm run hello      # or: npx tsx hello.jsx, or: bun hello.jsx
npm run counter
npm run todo
```

Starting from an empty folder instead, as on the install slide:

```bash
mkdir hello-x11 && cd hello-x11
npm init -y
npm pkg set type=module
npm install react-x11 react
npm install -D tsx
```

`type=module` matters: the examples call `await createRoot()` at the top
level, which needs an ES module. `npm init -y` writes `"type": "commonjs"`,
and tsx then stops with _"Top-level await is currently not supported with
the cjs output format"_. Bun runs the files either way.

| On       | You get                                                       |
| -------- | ------------------------------------------------------------- |
| macOS    | a native Cocoa window (the default backend there)             |
| Linux    | an X11 window on your `$DISPLAY`                              |
| Windows  | the win32 backend, which is young                             |
| `ssh -X` | the window on your laptop, drawn over the network             |
| nothing  | the [playground](https://sidorares.github.io/react-x11/playground) in a browser |

Node 20.19 or newer. Nothing compiles.

## What each one shows

- **hello.jsx** — the three host elements: `<window>` (a real window),
  `<box>` (a flexbox container), `<text>`.
- **counter.jsx** — `useState`, an `onClick` on a `<box>`, and `:hover` /
  `:active` style blocks, which the renderer repaints on the press without a
  React render. Hold the mouse down on +1: it darkens before you let go.
- **todo.jsx** — a controlled `<textinput>` (`onChange` per edit,
  `onSubmit` on Enter) and a mapped list.

The screenshots on the slides were rendered from these files with the
in-process X server that ships with node-x11; the windows follow the
desktop's light or dark mode.
