#!/bin/bash
# Simulates Pterodactyl Wings for one Eggactyl V2 server: runs the egg's install script in the
# installer image, starts the runtime image like Wings does (tini, uid 988, 1536 MB + 15% overhead, tmpfs /tmp),
# types the console input, waits for the ready line, then stops it with SIGINT like the panel's Stop button.
#
# usage: sim.sh <name> <console input (printf format)> <ready regex> [timeout secs] [extra docker args...]
# env:   KEEP=1     reuse the existing volume (simulates a restart)
#        SEED=dir   copy these files into the server before the first start
#        EXPECT=re  regex that must also appear in the log by the end (e.g. a clean-shutdown line)
#        HOLD=secs  wait this long after the ready line before stopping
export MSYS_NO_PATHCONV=1
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=$ROOT/test/logs
host() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else echo "$1"; fi; }
for PY in python3 python; do "$PY" -c 'import json' 2>/dev/null && break; done

NAME=$1 INPUT=$2 READY=$3 TIMEOUT=${4:-300}; shift 4
EXTRA=("$@")
C=eggtest-$NAME V=eggtest-$NAME LOG=$OUT/$NAME.log
mkdir -p "$OUT"
fail() { echo "FAIL ${LABEL:-$NAME}: $1"; [ -f "$LOG.txt" ] && tail -30 "$LOG.txt" | sed 's/^/    /'; exit 1; }

docker rm -f "$C" >/dev/null 2>&1
if [ -z "$KEEP" ]; then
    docker volume rm -f "$V" >/dev/null 2>&1; docker volume create "$V" >/dev/null
    "$PY" -c "import json,sys;open(sys.argv[2],'w',newline='\n').write(json.load(open(sys.argv[1]))['scripts']['installation']['script'])" \
        "$(host "$ROOT/egg-eggactyl-v2.json")" "$(host "$OUT/$NAME.install.sh")"
    docker run --rm -v "$V:/mnt/server" -v "$(host "$OUT"):/mnt/install:ro" "${EXTRA[@]}" debian:trixie-slim \
        bash "/mnt/install/$NAME.install.sh" > "$OUT/$NAME.install.log" 2>&1 || fail "install script failed"
    [ -n "$SEED" ] && docker run --rm -v "$V:/mnt/server" -v "$(host "$SEED"):/seed:ro" debian:trixie-slim cp -r /seed/. /mnt/server/
    docker run --rm -v "$V:/mnt/server" debian:trixie-slim chown -R 988:988 /mnt/server
fi

{ printf "$INPUT"; sleep $((TIMEOUT + 120)); } | docker run -i --name "$C" --user 988:988 --memory 1766m --tmpfs /tmp:rw,exec,size=100m \
    -v "$V:/home/container" -w /home/container \
    -e STARTUP="bash .eggactyl/eggactyl.sh" -e SERVER_MEMORY=1536 -e SERVER_IP=0.0.0.0 -e SERVER_PORT=25565 \
    -e P_SERVER_LOCATION=test -e P_SERVER_UUID=test -e TZ=UTC -e AUTO_UPDATE=1 -e PYTHON_VERSION=3.13 \
    -e QUERY_PORT=10011 -e FILE_PORT=30033 -e SERVER_TYPE=menu -e SERVER_VERSION=latest -e LAUNCHER_UPDATE=0 \
    "${EXTRA[@]}" ghcr.io/parkervcp/yolks:debian > "$LOG" 2>&1 &

start=$SECONDS ready=
while [ $((SECONDS - start)) -lt "$TIMEOUT" ]; do
    sleep 3
    grep -qE "$READY" "$LOG" && { ready=$((SECONDS - start)); break; }
    [ $((SECONDS - start)) -gt 10 ] && [ "$(docker inspect -f '{{.State.Running}}' "$C" 2>/dev/null)" != true ] && break
done
[ -n "$HOLD" ] && [ -n "$ready" ] && sleep "$HOLD"
state=$(docker inspect -f 'exit code {{.State.ExitCode}}, OOM-killed {{.State.OOMKilled}}' "$C" 2>/dev/null)
docker kill -s INT "$C" >/dev/null 2>&1
for _ in $(seq 1 60); do [ "$(docker inspect -f '{{.State.Running}}' "$C" 2>/dev/null)" = true ] || break; sleep 1; done
running=$(docker inspect -f '{{.State.Running}}' "$C" 2>/dev/null)
docker rm -f "$C" >/dev/null 2>&1
sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' "$LOG" | tr -d '\r' > "$LOG.txt"

[ -n "$ready" ] || fail "never printed /$READY/ (container: $state; timeout ${TIMEOUT}s)"
[ "$running" = true ] && fail "did not stop within 60s of SIGINT"
[ -n "$EXPECT" ] && ! grep -qE "$EXPECT" "$LOG.txt" && fail "log is missing /$EXPECT/"
echo "PASS ${LABEL:-$NAME} (ready in ${ready}s)"
