#!/bin/sh
# G1 observation run: fresh work copy of the original package + harness Lisp, DOSBox Staging fixed config.
# Usage: scripts/observe.sh RUN_NAME "AUTOTYPE_ARGS" [TIMEOUT_SEC]
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
run=$1; keys=$2; timeout=${3:-90}; ABUSE_ARGS=${ABUSE_ARGS:-}
w="$root/reference/work/$run"
ev="$root/docs/evidence/g1/runs/$run"
rm -rf "$w"; mkdir -p "$w" "$ev"
cp -R "$root/reference/private/abuse-box/." "$w/"; chmod -R u+w "$w"
cp "$root/reference/harness/HARNESS.LSP" "$w/ABUSE/HARNESS.LSP"
cat > "$ev/dosbox.conf" <<EOF
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
autotype $keys
ABUSE.EXE ${LSF_ARGS--lsf harness.lsp} $ABUSE_ARGS
exit
EOF
"$root/.tools/DOSBox Staging.app/Contents/MacOS/dosbox" --noprimaryconf --conf "$ev/dosbox.conf" > "$ev/dosbox.log" 2>&1 &
pid=$!
i=0
while [ $i -lt "$timeout" ]; do
  sleep 3; i=$((i+3))
  wid=$(swift "$root/scripts/winid.swift" 2>/dev/null | awk '$4>600{print $1; exit}')
  [ -n "$wid" ] && screencapture -x -o -l "$wid" "$ev/t$(printf %03d $i).png" 2>/dev/null || true
  [ -f "$w/DONE.TXT" ] && { sleep 2; break; }
  kill -0 $pid 2>/dev/null || break
done
kill $pid 2>/dev/null || true
[ -f "$w/ABUSE/HLOG.TXT" ] && cp "$w/ABUSE/HLOG.TXT" "$ev/hlog.txt"
ls "$ev"
