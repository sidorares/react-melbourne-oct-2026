#!/bin/bash
# One agent per audience idea, each in its own folder and Terminal window:
#
#   ./start.sh "a pomodoro timer with a task list" "a markdown journal" "a synth"
#   ./start.sh --prepare     # the night before: warm the npm cache, start nothing
#
# Works from wherever this deck is checked out, and needs nothing but Claude
# Code and npm: the agents use react-x11 and @react-x11/components the way any
# app does, installed from npm, reading the installed packages and the public
# docs sites (AGENTS.md says where).
#
# Each idea gets runs/N-slug/ with AGENTS.md (as CLAUDE.md too) and DESIGN.md
# linked in and the filled-in prompt.txt saved, and builds its app in
# runs/N-slug/app/. The agents stay headless (ONESHOT_NO_WINDOWS=1), so no app
# window pops up over the slides; ONESHOT_WINDOWS=1 lets them open real
# windows for screenshots.
#
# macOS opens a Terminal window per agent. Elsewhere, inside tmux, a tmux
# window each; otherwise the commands are printed to paste into terminals.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
deck="$(cd "$here/.." && pwd -P)"

if [ $# -eq 0 ]; then
  echo "usage: $0 \"idea one\" [\"idea two\" ...]" >&2
  echo "       $0 --prepare" >&2
  exit 1
fi

if [ "$1" = "--prepare" ]; then
  # What AGENTS.md has every app install, fetched once into the npm cache, so
  # the agents' installs work on venue Wi-Fi.
  tmp="$(mktemp -d)"
  (cd "$tmp" && npm init -y >/dev/null && npm install --no-audit --no-fund \
    'react-x11@^2.51.0' '@react-x11/components@^0.26.0' 'react@^19.3.0' \
    'tsx@^4.23.0' 'pngjs@^7.0.0' '@babel/core@^8.0.0' \
    '@babel/plugin-transform-react-jsx@^8.0.0' 'hot-module-replacement@^4.0.2' \
    'react-refresh@^0.19.0' >/dev/null)
  rm -rf "$tmp"
  echo "npm cache warmed."
  command -v claude >/dev/null || echo "Claude Code is not on PATH yet: npm install -g @anthropic-ai/claude-code" >&2
  exit 0
fi

command -v claude >/dev/null || { echo "start.sh: claude (Claude Code) is not on PATH" >&2; exit 1; }

no_windows="ONESHOT_NO_WINDOWS=1 "
[ "${ONESHOT_WINDOWS:-}" = 1 ] && no_windows=""

mkdir -p "$here/runs"
n=$(find "$here/runs" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')

for idea in "$@"; do
  n=$((n + 1))
  slug=$(printf '%s' "$idea" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//' | cut -c1-40)
  dir="$here/runs/$n-$slug"
  mkdir -p "$dir"
  ln -sf ../../AGENTS.md "$dir/AGENTS.md"
  ln -sf ../../AGENTS.md "$dir/CLAUDE.md"
  ln -sf ../../DESIGN.md "$dir/DESIGN.md"

  # The template with the idea in it, saved so the run is reproducible.
  prompt="$(cat "$here/prompt.txt")"
  printf '%s\n' "${prompt//<AUDIENCE IDEA>/$idea}" > "$dir/prompt.txt"

  # --add-dir: the talk's demo/ and examples/, which AGENTS.md points at, read
  # without a prompt.
  q() { printf '%q' "$1"; }
  cmd="cd $(q "$dir") && ${no_windows}claude \"\$(cat prompt.txt)\" --permission-mode auto --add-dir $(q "$deck/demo") $(q "$deck/examples")"

  if command -v osascript >/dev/null; then
    # A Terminal window per agent, behind the deck: glance at them between
    # slides, Ctrl+→ to their Space at the end.
    osascript - "$cmd" <<'APPLESCRIPT' >/dev/null
on run argv
  tell application "Terminal" to do script (item 1 of argv)
end run
APPLESCRIPT
    echo "started: $dir"
  elif [ -n "${TMUX:-}" ]; then
    tmux new-window -d -n "oneshot-$n" "$cmd; exec \$SHELL"
    echo "started in tmux window oneshot-$n: $dir"
  else
    echo "run in a terminal of its own:"
    echo "  $cmd"
  fi
done
