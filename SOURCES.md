# Sources

Where the content of each section comes from. "rx" is
[sidorares/react-x11](https://github.com/sidorares/react-x11), "comp" is
[sidorares/react-x11-components](https://github.com/sidorares/react-x11-components),
"ntk" is [sidorares/ntk](https://github.com/sidorares/ntk). Numbered links
go to the pull request or issue; file paths are in the react-x11 repository
unless marked. Line numbers are as of react-x11 2.47.1 (October 2026).

Every measured number on the slides was copied from the PR body or design
document named next to it, and the headline figures were re-checked against
those bodies. Nothing was re-measured for the talk except where marked
**captured**.

## Try it

- Install steps and the backend table: `website/docs/getting-started.md`.
- `react-x11 dev` (step 1): **captured** with react-x11 2.51.0 on Node 26,
  from an empty folder with only `npm install react-x11 react`: without a
  terminal it prints the toolchain install line; with the toolchain it mounts
  `app.jsx` in its own window and reloads on save. It also runs with
  `"type": "commonjs"`. Node 22.15+ is its own check (`module.registerHooks`,
  `src/cli/dev.js`).
- `npm pkg set type=module`: checked with npm 11.12.1, whose `npm init -y`
  writes `"type": "commonjs"`; tsx then fails with "Top-level await is
  currently not supported with the cjs output format". Bun runs the file
  either way.
- `examples/*.jsx`: **captured** — each rendered (app.jsx inside dev's window) without errors into
  node-x11's in-process X server; the screenshots are those renders
  (`tools/render-examples.mjs`). `paddingHorizontal` is not a supported
  style key (it throws), which is why the counter uses `padding`.

## Let's build together

- `npx react-x11 dev`: the bin is `src/cli/index.js`, whose only command is
  `dev`; the error window is `src/cli/errorwindow.js` (`describeError` is
  pure). DevTools and click-to-component: `docs/devtools.md`,
  `docs/click-to-component.md`.
- AIDX slide, "already there": `oneshot/AGENTS.md` and `oneshot/DESIGN.md`
  in this repo; `toPNG` in react-x11's `docs/testing.md`. "Next" is a list
  of proposals, none of which exists. `create-react-x11` and
  `@react-x11/create` were both unclaimed on npm on 21 October 2026
  (`npm view` returns 404).
- "Agent Experience (AX)": Mathias Biilmann (Netlify), early 2025. Not
  re-checked for the talk.
- Steps 3 and 4 (counter, todo) moved to Backup; their sources are under
  "Try it".

## Under the hood: before and after #4

- The two commits, both 26 July 2026: `c43453f` "create X11 windows
  top-down in the commit phase" (Fixes #4; 3 files, +145 −86, mostly
  `src/Reconciler.js`) and `1a9afcd` "retained widget renderer with yoga
  layout, synthetic events, and drawn elements" (22 files, +3,956 −587).
- **Captured** 21 October 2026 from react-x11's git history: lines of every
  `.js/.ts/.jsx/.tsx/.mjs` file under `src/` (comments and blank lines
  included), via `git ls-tree` + `git show`, so the working tree does not
  matter.

  | | commit | src lines | src code files | test lines |
  | --- | --- | ---: | ---: | ---: |
  | #4 closed | `c43453f` | 411 | 3 | 262 |
  | 2.51.0 | `f97c1be` | 133,949 | 334 | 144,517 |

- The breakdown on the "411 lines became 134,000" slide (`<CodeShare />`),
  by file, first rule that matches:

  | area | rule | lines | share |
  | --- | --- | ---: | ---: |
  | Reconciler.js | `src/Reconciler.js` | 1,078 | 0.8% |
  | Types | any `.d.ts`, and `src/types/` | 9,899 | 7.4% |
  | Platform backends | `src/cocoa/`, `src/wayland/`, `src/win32/` | 36,599 | 27.3% |
  | Retained tree and painting | `src/nodes/`, `src/backend/`, `frames`, `pacing`, `paintcache`, `compositing`, `yoga`, `offscreen` | 27,521 | 20.5% |
  | Built-in components | `src/components/` | 8,287 | 6.2% |
  | DX | `src/cli/`, `src/refresh/`, `src/testing/`, `DevToolsIntegration`, `ClickToComponent`, `editor`, `trace-registry`, `debug` | 6,423 | 4.8% |
  | Desktop and input | everything else: events, focus, styles, fonts, a11y, menus, tray, DnD, clipboard, DBus, `src/frame/` | 44,142 | 33.0% |

  react-x11 only: ntk, node-x11 and react-x11-components are not counted.

## Overview

- Backends, the layer split and the "how often vs how" division:
  `AGENTS.md` ("What this project is", "Protocol efficiency"), `README.md`.
- Screenshot: `docs/img/tasks.png`.

## The reconciler contract

- `src/Reconciler.js`: `ReactReconciler(HostConfig)` (l. 564),
  `createContainer(app, ConcurrentRoot, …)` (l. 893), `render()` with
  `updateContainerSync` + `flushSyncWork`, the host config (l. 148–560).
- React 19 removed `prepareUpdate`; `commitUpdate(instance, type, oldProps,
  newProps)` is at l. 466 and calls `applyProps`.
- Persistence and hydration callback names: react-reconciler's host config
  contract (React Native Fabric, react-dom).

## Render vs commit

- Commit order checked against the installed react-reconciler (0.34,
  `cjs/react-reconciler.development.js`): `prepareForCommit` is called from
  `commitBeforeMutationEffects`; `resetAfterCommit` runs right after the
  mutation pass and before `root.current = finishedWork`; layout effects,
  refs and `commitMount` follow. The mutation pass runs at discrete priority.
- `createInstance` (l. 239), `appendInitialChild` (l. 388),
  `finalizeInitialChildren` (l. 392), `commitMount` (l. 413),
  `appendChildToContainer` → `attachTopLevel` (`src/nodes/scope.js`).
- `WindowNode.realize()` (`src/nodes/window/window.js:318`) and
  `WindowNode.insertBefore()` (l. 698).
- `getChildHostContext` (`src/Reconciler.js:189`).
- The 5 ms slice: the scheduler's `frameInterval`.

## Priorities

- Lanes and time slicing: react-reconciler's `performWorkOnRoot` — lanes
  in the blocking mask (sync, continuous, default) render with
  `renderRootSync`; others with `renderRootConcurrent`, which checks
  `shouldYield()` between fibers. Expired lanes render synchronously.
- `src/priority.js` (`runWithPriority`, l. 57; `resolveUpdatePriority`, l. 24);
  call sites in `src/events.js` (`_onMouseDown`, `_onKey`: discrete;
  `_onMouseMove`, `_onWheel`: continuous).
- Discarded work: React's documented behaviour (transitions, Suspense, error
  retries, StrictMode, Activity pre-rendering); `hideInstance` →
  `node.setHidden` in `src/Reconciler.js:480`.

## One update

- `discrete()` (`src/events.js:313`), `flushPendingFrames`
  (`src/frames.js`).
- `Node.applyProps` (`src/nodes/node.js:660`), `paintChanged`,
  `NO_DAMAGE`.
- `WindowNode.flush()` (`src/nodes/window/flush.js:118`).

## Architecture

- `HOST_TYPES` (`src/Reconciler.js:100`), `AGENTS.md` architecture notes.
- `useGlobalMenu` / `useGlobalMenuExport` (`src/globalmenu.js:542–600`).

## Damage

- Invalidation: `src/nodes/invalidate.js`; damage list:
  `src/nodes/damage.js` (`MAX_DAMAGE_RECTS = 4`, `SPLIT_SAVING = 0.75`,
  `addDamageRects`).
- Paint walk: `src/nodes/paint.js` (`_paintChildren` l. 341, `_outsideDamage`
  l. 478, `_paintRegion` l. 553).
- Expose: ntk `lib/window.js` `_handleExpose` / `_requestRedraw`;
  `src/nodes/window/listeners.js:87` (the `'draw'` handler);
  `backgroundPixel` in `WindowNode.realize()`.
- Scroll blit numbers and the per-frame ledger: `AGENTS.md` ("Gotchas"),
  rx [#138](https://github.com/sidorares/react-x11/issues/138),
  [#398](https://github.com/sidorares/react-x11/issues/398).
- Debug switches: `docs/debugging.md` (`REACT_X11_DEBUG_PAINT`).

## Text

- ntk `docs/text.md`, `docs/fonts.md`, `docs/shared-glyphs.md`, and
  `lib/text/` (`shape.js`, `font.js`, `glyphs.js` — `encodeGlyphItems`,
  `positionGlyphs`, `DEFAULT_TEXT_POLICY`), `lib/rasterize.js`.
- **Captured**: the shaped run, the AddGlyphs table and the 52-byte
  CompositeGlyphs8 request for "Type" in Arial 32px, and the magnified
  picture, from ntk 8.23.2 into node-x11's in-process server
  (`tools/capture-glyphs.mjs`; reproduces with react-x11 2.47.5 from npm).
- Per-backend text engines: `docs/macos.md` ("Text: the engine contract"),
  `docs/windows.md` ("Text"), `src/wayland/glyphatlas.js`,
  `src/nodes/text.js` (`measureContent`).
- Formats and features: ntk [#504](https://github.com/sidorares/ntk/issues/504)
  (WOFF2 via native Brotli), [#227](https://github.com/sidorares/ntk/issues/227)
  (variable fonts), [#333](https://github.com/sidorares/ntk/issues/333) (opsz),
  [#434](https://github.com/sidorares/ntk/issues/434) (CBDT);
  rx [#347](https://github.com/sidorares/react-x11/issues/347) (`loadFont`),
  [#604](https://github.com/sidorares/react-x11/issues/604) (font features),
  [#805](https://github.com/sidorares/react-x11/issues/805),
  [#806](https://github.com/sidorares/react-x11/issues/806) (Cocoa gaps),
  [#86](https://github.com/sidorares/react-x11/issues/86) (Hiragino).
- Shaping gaps: Thai/Lao/Khmer breaking (ntk `lib/text/layout.js`,
  `UNSPACED`), IME rx [#272](https://github.com/sidorares/react-x11/issues/272).
- Bidi: rx [#275](https://github.com/sidorares/react-x11/issues/275),
  [#341](https://github.com/sidorares/react-x11/issues/341),
  [#342](https://github.com/sidorares/react-x11/issues/342); ntk
  [#533](https://github.com/sidorares/ntk/issues/533) (empty RTL paragraph),
  [#379](https://github.com/sidorares/ntk/issues/379) (Latin skips bidi);
  `docs/styling.md` ("Direction").
- **Inferred, not observed**: emoji draw in one ink colour on X11 — glyph sets
  are A8 coverage. The shaping slide's Arabic and Devanagari samples are drawn
  by the browser, not by ntk.

## Making it fast

| slide | sources |
| --- | --- |
| Commands or pixels | `docs/remote.md` (protocol bench baseline); rx [#441](https://github.com/sidorares/react-x11/issues/441) (damage cap per backend) |
| Rasterization gate | rx [#199](https://github.com/sidorares/react-x11/issues/199) (`examples:raster-gate`, ntk `routeRaster`), [#890](https://github.com/sidorares/react-x11/issues/890) |
| Same style, different bill | rx [#412](https://github.com/sidorares/react-x11/issues/412) / [#413](https://github.com/sidorares/react-x11/issues/413) / [#414](https://github.com/sidorares/react-x11/issues/414), [#794](https://github.com/sidorares/react-x11/issues/794), [#690](https://github.com/sidorares/react-x11/issues/690), [#695](https://github.com/sidorares/react-x11/issues/695), [#485](https://github.com/sidorares/react-x11/issues/485) |
| Measure pixels | `AGENTS.md` (ntk [#107](https://github.com/sidorares/ntk/issues/107), ntk 3.10.1; the clip-request experiment; the `boxShadow` filter) |
| Coalescing | ntk [#50](https://github.com/sidorares/ntk/issues/50) (`lib/events_map.js`), ntk [#331](https://github.com/sidorares/ntk/issues/331), rx [#657](https://github.com/sidorares/react-x11/issues/657) |
| Backpressure | ntk [#50](https://github.com/sidorares/ntk/issues/50), [#220](https://github.com/sidorares/ntk/issues/220), [#370](https://github.com/sidorares/ntk/issues/370) (measured through a latency proxy, not a real network), [#195](https://github.com/sidorares/ntk/issues/195); rx [#153](https://github.com/sidorares/react-x11/issues/153) |
| Newest state | comp [#70](https://github.com/sidorares/react-x11-components/issues/70), [#130](https://github.com/sidorares/react-x11-components/issues/130); rx [#876](https://github.com/sidorares/react-x11/issues/876), [#847](https://github.com/sidorares/react-x11/issues/847), [#719](https://github.com/sidorares/react-x11/issues/719); `examples/monitor.jsx` (`useDeferredValue`) |
| Token bucket | rx [#497](https://github.com/sidorares/react-x11/issues/497), `src/pacing.js`, `docs/architecture/frame-pacing.md`; comp [#69](https://github.com/sidorares/react-x11-components/issues/69) (the PRD) |
| Fast while moving | comp [#128](https://github.com/sidorares/react-x11-components/issues/128) and `docs/prd-flow-gl.md`, comp [#719](https://github.com/sidorares/react-x11-components/issues/719), comp [#44](https://github.com/sidorares/react-x11-components/issues/44); rx [#441](https://github.com/sidorares/react-x11/issues/441). The browser comparisons are analogies |
| Map ladder | comp [#100](https://github.com/sidorares/react-x11-components/issues/100), `src/maps/gl/view.ts` (`QUALITY_LADDER`, `chooseQuality`), `docs/prd-maps-gl.md` |
| Plateaus | rx [#632](https://github.com/sidorares/react-x11/issues/632) (issue [#631](https://github.com/sidorares/react-x11/issues/631)), [#444](https://github.com/sidorares/react-x11/issues/444), [#450](https://github.com/sidorares/react-x11/issues/450); `AGENTS.md` ("A display period is a fraction") |

No PR in either repository measures react-x11 over a real network link;
"works over SSH" is the only remote claim the slides make.

## Lessons learned

- PR counts on "What working with agents changed": **captured** 21 October
  2026 with GitHub search, `repo:R is:pr is:merged merged:2026-07-01..2026-10-31`,
  per month, and `merged:2017-04-01..2026-06-30` for the years before.

  | repo | Jul | Aug | Sep | Oct (to the 21st) | since July | Apr 2017 – Jun 2026 |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: |
  | sidorares/react-x11 | 93 | 204 | 301 | 154 | 752 | 4 |
  | sidorares/react-x11-components | 0 | 41 | 452 | 306 | 799 | 0 |
  | sidorares/ntk | 75 | 144 | 130 | 50 | 399 | 1 |
  | sidorares/dbus-native | 87 | 4 | 13 | 3 | 107 | 42 |
  | sidorares/node-x11 | 39 | 29 | 10 | 5 | 83 | 18 |
  | windowkit/appkit | 0 | 0 | 62 | 32 | 94 | 0 |
  | windowkit/win32 | 0 | 0 | 10 | 6 | 16 | 0 |
  | windowkit/wayland | 0 | 0 | 7 | 0 | 7 | 0 |
  | sidorares/node-x11-dri | 0 | 15 | 15 | 0 | 30 | 0 |
  | **total** | 294 | 437 | 1,000 | 556 | **2,287** | 65 |

  Not counted: windowkit/fontkit (5) and hot-module-replacement (5). The
  Evolution slide's bars are commits on react-x11's master, not merged PRs:
  July had direct commits before the PR flow started.

## Known stale documentation

Found while preparing the talk, left for the repositories to fix:
`docs/remote.md` says native Wayland does not exist; comp
`docs/prd-maps-gl.md` gives the map's settle delay as 180 ms where the code
uses 140; `docs/elements.md` says a variable WOFF2 cannot be instantiated;
`AGENTS.md` says nothing works around #86 (ntk #354 does).
