# One-shot demo — presenter notes

"As an experiment, I'll try to one-shot a demo from your suggestions." One
Claude Code session per idea starts in its own folder under `runs/`, reads
[AGENTS.md](AGENTS.md) (the mission, setup, rules, verification loop, linked
in as its `CLAUDE.md`) and [DESIGN.md](DESIGN.md) (how a Mac app should
look), and builds the app while you talk.

It works the way it would for anyone in the audience: react-x11 and
@react-x11/components installed from npm, the agent reading the installed
packages (READMEs, `.d.ts`, source) and the public docs sites. No checkout of
either library is needed, and the deck can be anywhere on the machine.

## The night before

On the machine you will present from (a Mac, with Claude Code installed and
signed in):

1. `./start.sh --prepare` warms the npm cache with every package the apps
   install (venue Wi-Fi).
2. **Rehearse once** with a throwaway idea (`./start.sh "a pomodoro timer with
   a task list"`) end to end, then `rm -rf runs`.
3. Screen awake, not locked, Do Not Disturb on.

## Starting the runs: one agent per idea

```bash
cd oneshot      # in this deck's checkout, wherever it is
./start.sh "a pomodoro timer with a task list" "a recipe book" "a synth"
```

Each idea gets its own folder, `runs/N-slug/` (AGENTS.md, CLAUDE.md and
DESIGN.md linked in, the filled-in `prompt.txt` saved), and its own Terminal
window running Claude Code there, building `runs/N-slug/app/`. Outside macOS
it opens a tmux window per agent when run inside tmux, and otherwise prints
the commands to paste. Three ideas is
plenty: they share the laptop's CPU and the npm cache.

The agents run with `ONESHOT_NO_WINDOWS=1`: they check their app through the
headless renderer's PNGs and never open a real window, so nothing pops up over
the slides. `ONESHOT_WINDOWS=1 ./start.sh …` lets them open windows for native
screenshots (better results, but put the deck on its own Space first).

`rm -rf runs` before the next talk.

## Starting a run by hand

`./start.sh "one idea"` is a single run. What it runs in each folder, if you
want to start one yourself:

```bash
cd runs/1-a-pomodoro-timer-with-a-task-list
ONESHOT_NO_WINDOWS=1 claude "$(cat prompt.txt)" --permission-mode auto \
  --add-dir ../../../demo ../../../examples
```

(Keep the prompt **first**: `--add-dir` takes every word after it as a
directory, so a prompt placed after it would be swallowed.)

Permission modes (`claude --help`, Claude Code 2.1):

- `--permission-mode auto` — **recommended**: routine edits and commands run
  without asking, risky ones are still checked. It may occasionally pause on
  something unusual; glance at the terminal between slides.
- `--permission-mode acceptEdits` — file edits are automatic, but every
  `npm install`/`npm start` asks, so it **will stall** while you talk.
- `--permission-mode bypassPermissions` (or `--dangerously-skip-permissions`)
  — never asks. Only if you are comfortable with an agent running anything on
  this laptop unattended; not the default here.

`--add-dir` lets it read the talk's `demo/` and `examples/` without
prompting; the library docs it fetches from the web. Optional: `--effort high`.

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
cd runs/1-*/app && npm start   # each idea in turn
cat NOTES.md                   # what it decided and what it cut
npm run dev                    # optional: hot reload, edit live on stage
```

If `npm start` dies on launch: `REACT_X11_THREADED=0 npm start` (keeps the
JS on the main thread), or `bun app.jsx`. Toggle System Settings →
Appearance to dark while it runs — it should follow live.

`runs/` is git-ignored; delete it before the next run.
