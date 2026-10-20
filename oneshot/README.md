# One-shot demo — presenter notes

"As an experiment, I'll try to one-shot a demo from your suggestions." Claude
Code starts in this folder, reads `CLAUDE.md` (a symlink to
[AGENTS.md](AGENTS.md): the mission, setup, rules, verification loop) and
[DESIGN.md](DESIGN.md) (how a Mac app should look), and builds the app in
`./app/` while you talk.

## The night before

1. **Rehearse once** with a throwaway idea ("a pomodoro timer with a task
   list") end to end, then `rm -rf app`.
2. **Warm the npm cache** (venue Wi-Fi): the rehearsal does it; or
   `cd "$(mktemp -d)" && npm init -y && npm i react-x11@^2.50 @react-x11/components@^0.25 react@^19.3 tsx pngjs @babel/core@^8 @babel/plugin-transform-react-jsx@^8 hot-module-replacement@^4.0.2 react-refresh@^0.19`.
3. **Keep the reference checkouts in place** — AGENTS.md points at
   `/Users/laplace/Projects/react-x11/.claude/worktrees/video-support-cocoa-2b2333`
   (docs, examples), `/Users/laplace/Projects/react-x11-components` and
   `../demo`. Don't clean up that worktree before the talk.
4. Screen awake, not locked, Do Not Disturb on.

## Starting the run

```bash
cd ~/Projects/react-melbourne-oct-2026/oneshot
rm -rf app                     # fresh start
IDEA="a pomodoro timer with a task list"     # what the audience said
claude "$(sed "s|<AUDIENCE IDEA>|$IDEA|" prompt.txt)" \
  --permission-mode auto \
  --add-dir /Users/laplace/Projects/react-x11/.claude/worktrees/video-support-cocoa-2b2333 \
            /Users/laplace/Projects/react-x11-components \
            /Users/laplace/Projects/react-melbourne-oct-2026/demo
```

(`prompt.txt` is the template below, saved next to this file. Keep the prompt
**first**: `--add-dir` takes every word after it as a directory, so a prompt
placed after it would be swallowed. Avoid `|` in the idea, or just paste the
whole prompt in quotes instead of using `sed`.)

Permission modes (`claude --help`, Claude Code 2.1):

- `--permission-mode auto` — **recommended**: routine edits and commands run
  without asking, risky ones are still checked. It may occasionally pause on
  something unusual; glance at the terminal between slides.
- `--permission-mode acceptEdits` — file edits are automatic, but every
  `npm install`/`npm start` asks, so it **will stall** while you talk.
- `--permission-mode bypassPermissions` (or `--dangerously-skip-permissions`)
  — never asks. Only if you are comfortable with an agent running anything on
  this laptop unattended; not the default here.

`--add-dir` lets it read the docs and examples outside this folder without
prompting. Optional: `--effort high`.

**Windows will pop up.** The verification loop opens the app for ~3 s to
screenshot it, and the new window takes focus. Either run Claude in a
separate macOS Space/desktop (Ctrl+→ to it at the end), or tell it to stay
headless by prefixing the command with `ONESHOT_NO_WINDOWS=1 claude …` — it
then checks the app only through the in-process renderer's PNGs.

## Prompt template

Paste this as the argument, with the idea in the first line:

```
Build this as a native macOS desktop app: <AUDIENCE IDEA>.
Follow AGENTS.md and DESIGN.md in this folder exactly. Work fully unattended:
don't ask me anything, make sensible product decisions and note them in
app/NOTES.md. Use react-x11 and @react-x11/components only (no DOM, no
Electron). Prioritise a working, good-looking core experience over breadth,
with realistic sample data, a proper menu bar with shortcuts, and correct
light and dark mode. Verify by running the tests and by looking at
screenshots, fix what looks off, and finish with `cd app && npm start`
opening the app and app/README.md explaining it. Aim to be done in about
40 minutes.
```

## At the end of the talk

```bash
cd app && npm start          # the app
cat NOTES.md                 # what it decided and what it cut
npm run dev                  # optional: hot reload, edit live on stage
```

If `npm start` dies on launch: `REACT_X11_THREADED=0 npm start` (keeps the
JS on the main thread), or `bun app.jsx`. Toggle System Settings →
Appearance to dark while it runs — it should follow live.

`app/` is not committed anywhere; delete it before the next run.
