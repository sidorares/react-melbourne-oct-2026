#!/bin/bash
# One agent per audience idea, each in its own folder and Terminal window:
#
#   ./start.sh "a pomodoro timer with a task list" "a markdown journal" "a synth"
#
# Each idea gets runs/N-slug/ with AGENTS.md, CLAUDE.md and DESIGN.md linked in,
# and builds its app in runs/N-slug/app/. The agents stay headless
# (ONESHOT_NO_WINDOWS=1), so no app window pops up over the slides while you
# talk; set ONESHOT_WINDOWS=1 to let them open real windows for screenshots.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
REACT_X11_DOCS=/Users/laplace/Projects/react-x11/.claude/worktrees/video-support-cocoa-2b2333
COMPONENTS=/Users/laplace/Projects/react-x11-components
DEMO="$(cd "$here/../demo" && pwd)"

if [ $# -eq 0 ]; then
  echo "usage: $0 \"idea one\" [\"idea two\" ...]" >&2
  exit 1
fi

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

  cmd="cd '$dir' && ${no_windows}claude \"\$(cat prompt.txt)\" --permission-mode auto --add-dir '$REACT_X11_DOCS' '$COMPONENTS' '$DEMO'"
  # A Terminal window per agent, opened behind the deck: glance at them
  # between slides, Ctrl+→ to their Space at the end.
  osascript - "$cmd" <<'APPLESCRIPT' >/dev/null
on run argv
  tell application "Terminal" to do script (item 1 of argv)
end run
APPLESCRIPT
  echo "started: $dir"
done
