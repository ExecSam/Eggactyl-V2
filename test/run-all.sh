#!/bin/bash
# Runs every Eggactyl V2 server type through the Wings simulator (test/sim.sh).
# Needs Docker and the built egg (python build.py). Exits non-zero if anything fails.
cd "$(dirname "$0")" || exit 1
export MSYS_NO_PATHCONV=1
FIX=$(pwd)/fixtures LOGS=$(pwd)/logs
host() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else echo "$1"; fi; }
rm -rf "$LOGS" && mkdir -p "$LOGS/seed-java" "$LOGS/update-srv"
t() { local n=$1; shift; LABEL=$n "$@" > "$LOGS/$n.result" 2>&1; }
MC_SAVED='Saving worlds|Saving chunks|All RegionFile'
cleanup() { docker rm -f eggtest-updsrv >/dev/null 2>&1; docker network rm eggtest-net >/dev/null 2>&1
            docker volume ls -q | grep '^eggtest-' | xargs -r docker volume rm >/dev/null 2>&1; }
trap cleanup EXIT

# Pull images up front so parallel tests don't race the download.
for img in ghcr.io/parkervcp/yolks:debian debian:trixie-slim busybox:stable; do docker pull -q "$img" >/dev/null || exit 1; done

# Fixtures: any runnable jar works for the custom Java type; a launcher with a higher version for self-update.
curl -fsSL -o logs/seed-java/app.jar https://ci.md-5.net/job/BungeeCord/lastSuccessfulBuild/artifact/bootstrap/target/BungeeCord.jar \
    || { echo "Could not download the test jar"; exit 1; }
sed 's/^EGGACTYL_VERSION=.*/EGGACTYL_VERSION=99.0.0/' ../src/eggactyl.sh > "$LOGS/update-srv/eggactyl.sh"
docker network create eggtest-net >/dev/null || exit 1
docker run -d --name eggtest-updsrv --network eggtest-net -v "$(host "$LOGS/update-srv"):/srv:ro" busybox:stable httpd -f -p 8000 -h /srv >/dev/null

t python   env SEED="$FIX/python" EXPECT='shutting down cleanly' HOLD=2 bash sim.sh python '10\n' 'BOT OK' 300 -e GIT_REPO=https://github.com/octocat/Hello-World &
t nodejs   env SEED="$FIX/node" EXPECT='shutting down cleanly' HOLD=2 bash sim.sh nodejs '11\n' 'BOT OK' 300 &
t paper    env EXPECT="$MC_SAVED" bash sim.sh paper '1\n\ny\n' 'For help, type' 420 &
t vanilla-preset env EXPECT="$MC_SAVED" bash sim.sh vanilla-preset 'y\n' 'For help, type' 420 -e SERVER_TYPE=vanilla -e SERVER_VERSION=1.12.2 &
wait
t forge    env EXPECT="$MC_SAVED" bash sim.sh forge '4\n1.20.1\ny\n' 'For help, type' 600 &
t forge-legacy env EXPECT="$MC_SAVED" bash sim.sh forge-legacy '4\n1.12.2\ny\n' 'For help, type' 600 &
t neoforge env EXPECT="$MC_SAVED" bash sim.sh neoforge '5\n\ny\n' 'For help, type' 600 &
t purpur   env EXPECT="$MC_SAVED" bash sim.sh purpur '2\n\ny\n' 'For help, type' 420 &
wait
t fabric     env EXPECT="$MC_SAVED" bash sim.sh fabric '3\n\ny\n' 'For help, type' 420 &
t velocity   env EXPECT='Shutting down|Closing endpoint' bash sim.sh velocity '7\n\n' 'Done \(' 300 &
t bungeecord env EXPECT='Closing listener' bash sim.sh bungeecord '8\n' 'Listening on /' 300 &
t bedrock    env EXPECT='Quit correctly' HOLD=2 bash sim.sh bedrock '9\ny\nlist\n' 'players online' 300 &
t teamspeak  env EXPECT='shutting down' HOLD=5 bash sim.sh teamspeak '13\ny\n' 'listening for query' 300 &
t lavalink   bash sim.sh lavalink '14\n' 'Lavalink is ready' 300 &
t java       env SEED="$LOGS/seed-java" HOLD=3 bash sim.sh java '12\n' 'Listening on /' 300 &
wait
# Restart scenarios on the volumes above.
docker run --rm -v eggtest-paper:/s debian:trixie-slim sed -i 's/^BUILD=.*/BUILD=1/' /s/eggactyl.conf
t paper-update env KEEP=1 EXPECT='Updating Paper .* -> [0-9]+' bash sim.sh paper '' 'For help, type' 300 &
t python-restart env KEEP=1 EXPECT='Setting up Python 3.12' bash sim.sh python '' 'BOT OK' 300 -e PYTHON_VERSION=3.12 &
t self-update env SEED="$FIX/python" EXPECT='Eggactyl 99\.0\.0' bash sim.sh self-update '10\n' 'BOT OK' 300 \
    --network eggtest-net -e LAUNCHER_UPDATE=1 -e EGGACTYL_UPDATE_URL=http://eggtest-updsrv:8000/eggactyl.sh &
wait

cat "$LOGS"/*.result
fails=$(cat "$LOGS"/*.result | grep -c '^FAIL')
echo "== $(cat "$LOGS"/*.result | grep -c '^PASS') passed, $fails failed"
[ "$fails" = 0 ]
