#!/bin/sh
# Level observation run: fresh work copy at reference/work/levels_obs, HARNESS.levels.LSP, window screenshots.
# Usage: scripts/observe_levels.sh [TIMEOUT_SEC]
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
timeout=${1:-200}
w="$root/reference/work/levels_obs"
ev="$root/docs/evidence/abuse_levels/run"
rm -rf "$w"; mkdir -p "$w" "$ev"
cp -R "$root/reference/private/abuse-box/." "$w/"; chmod -R u+w "$w"
cp "$root/reference/harness/HARNESS.levels.LSP" "$w/ABUSE/HARNESS.LSP"
cat > "$ev/dosbox.conf" <<CONF
[sdl]
fullscreen = false
window_size = 960x720
[render]
glshader = none
[cpu]
cycles = fixed 20000
[mixer]
nosound = true
[speaker]
pcspeaker = false
[autoexec]
mount c "$w"
c:
cd ABUSE
autotype -w 8 -p 3 esc esc enter enter
ABUSE.EXE -lsf harness.lsp
exit
CONF
SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy "$root/.tools/DOSBox Staging.app/Contents/MacOS/dosbox" --noprimaryconf --conf "$ev/dosbox.conf" > "$ev/dosbox.log" 2>&1 &
pid=$!
i=0
while [ $i -lt "$timeout" ]; do
  sleep 2; i=$((i+2))
  wid=$(swift "$root/scripts/winid.swift" 2>/dev/null | awk '$4>600{print $1; exit}')
  [ -n "$wid" ] && screencapture -x -o -l "$wid" "$ev/t$(printf %03d $i).png" 2>/dev/null || true
  kill -0 $pid 2>/dev/null || break
done
kill $pid 2>/dev/null || true
[ -f "$w/ABUSE/HLOG.TXT" ] && cp "$w/ABUSE/HLOG.TXT" "$ev/hlog.txt"
ls "$ev" | wc -l
