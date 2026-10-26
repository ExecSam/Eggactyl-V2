#!/bin/bash
# Eggactyl V2 launcher. Written to /home/container/.eggactyl/ by the egg's install script
# and run on every server start. Updates itself from the latest GitHub release when it can,
# but never needs GitHub (or anything except the official download sources) to start.

EGGACTYL_VERSION=2.0.0
UPDATE_URL=${EGGACTYL_UPDATE_URL:-https://github.com/ExecSam/Eggactyl-V2/releases/latest/download/eggactyl.sh}

cd /home/container || exit 1
EGG=/home/container/.eggactyl
RT=$EGG/runtimes
CONF=/home/container/eggactyl.conf
UA="Eggactyl-V2/$EGGACTYL_VERSION"
BROWSER_UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
FILL=https://fill.papermc.io/v3/projects
MOJANG=https://piston-meta.mojang.com/mc/game/version_manifest_v2.json
FABRIC=https://meta.fabricmc.net/v2/versions
M=$(uname -m)
mkdir -p "$EGG/bin" "$RT" "$EGG/tmp"
export PATH="$EGG/bin:$PATH" TMPDIR="$EGG/tmp"

say()  { printf '\033[1;36m[Eggactyl]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[Eggactyl] %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m[Eggactyl] %s\033[0m\n' "$*"; exit 1; }
get()  { curl -fsSL --retry 3 -A "$UA" "$@"; }
dl() { # url dest
    say "Downloading $(basename "$2")..."
    curl -fsSL --retry 3 -A "$UA" -o "$2.part" "$1" && mv -f "$2.part" "$2" && return
    rm -f "$2.part"; die "Download failed: $1"
}
ask() { # prompt default -> $ANSWER
    printf '\033[1;32m> %s\033[0m\n' "$1"
    read -r ANSWER || die "No console input available."
    ANSWER=${ANSWER//$'\r'/}
    ANSWER=${ANSWER#"${ANSWER%%[![:space:]]*}"}; ANSWER=${ANSWER%"${ANSWER##*[![:space:]]}"}
    [ -z "$ANSWER" ] && ANSWER=$2
}
confirm() { ask "$1 [y/N]"; [[ "$ANSWER" =~ ^[Yy] ]]; }
started() { echo "[Eggactyl] Started $NAME"; }
pick_file() { local f; for f in "$@"; do [ -n "$f" ] && [ -f "$f" ] && { echo "$f"; return 0; }; done; return 1; }
x86_only() { [ "$M" = x86_64 ] || die "$NAME only runs on x86_64 nodes (this node is $M)."; }

set_prop() { # file key value
    touch "$1"
    if grep -q "^$2=" "$1"; then sed -i "s|^$2=.*|$2=$3|" "$1"; else echo "$2=$3" >> "$1"; fi
}

self_update() { # swap in the latest released launcher if it's newer; any failure just keeps this copy
    [ "${LAUNCHER_UPDATE:-1}" = 1 ] && [ -z "$EGGACTYL_UPDATED" ] || return
    local new=$EGG/tmp/eggactyl.sh.new v
    curl -fsSL --max-time 20 -A "$UA" -o "$new" "$UPDATE_URL" 2>/dev/null || { rm -f "$new"; return; }
    v=$(sed -n 's/^EGGACTYL_VERSION=//p' "$new" | head -1)
    if [ -n "$v" ] && [ "$v" != "$EGGACTYL_VERSION" ] && [ "$(printf '%s\n' "$EGGACTYL_VERSION" "$v" | sort -V | tail -1)" = "$v" ] \
        && bash -n "$new" 2>/dev/null; then
        say "Updating Eggactyl $EGGACTYL_VERSION -> $v"
        chmod +x "$new" && mv -f "$new" "$EGG/eggactyl.sh" && EGGACTYL_UPDATED=1 exec bash "$EGG/eggactyl.sh"
    fi
    rm -f "$new"
}

need_jq() {
    command -v jq >/dev/null && return
    local a=amd64; [ "$M" = aarch64 ] && a=arm64
    dl "https://github.com/jqlang/jq/releases/latest/download/jq-linux-$a" "$EGG/bin/jq"
    chmod +x "$EGG/bin/jq"
}

save_conf() {
    {
        echo "# Eggactyl V2 - delete this file and restart to run setup again."
        local k; for k in TYPE VERSION BUILD JAVA JAR ARGS_FILE; do
            [ -n "${!k}" ] && printf '%s=%q\n' "$k" "${!k}"
        done
    } > "$CONF"
}

# ---------------------------------------------------------------- runtimes

mc_java() { # minecraft version -> java major from Mojang's version manifest
    local url; url=$(get "$MOJANG" | jq -r --arg v "$1" '.versions[] | select(.id == $v) | .url')
    if [ -n "$url" ]; then get "$url" | jq -r '.javaVersion.majorVersion // 8'; else echo 21; fi
}

ensure_java() {
    local want=${JAVA_VERSION//[^0-9]/} l a=x64
    want=${want:-${JAVA:-21}}
    for l in 8 11 17 21 25; do [ "$want" -le "$l" ] && { want=$l; break; }; done
    local dir=$RT/java-$want
    if [ ! -x "$dir/bin/java" ]; then
        [ "$M" = aarch64 ] && a=aarch64
        dl "https://api.adoptium.net/v3/binary/latest/$want/ga/linux/$a/jre/hotspot/normal/eclipse" "$EGG/tmp/java.tar.gz"
        rm -rf "$dir" && mkdir -p "$dir"
        tar -xzf "$EGG/tmp/java.tar.gz" -C "$dir" --strip-components=1 || die "Could not extract Java $want."
        rm -f "$EGG/tmp/java.tar.gz"
        find "$RT" -maxdepth 1 -name 'java-*' ! -name "java-$want" -exec rm -rf {} +
    fi
    export JAVA_HOME=$dir PATH="$dir/bin:$PATH"
    say "Using $(java -version 2>&1 | head -1)"
}

jvm_flags() {
    local extra; read -ra extra <<< "$JAVA_ARGUMENTS"
    JFLAGS=(-Xms128M)
    [[ "$JAVA_ARGUMENTS" == *-Xmx* || "$JAVA_ARGUMENTS" == *MaxRAM* ]] || JFLAGS+=(-XX:MaxRAMPercentage=95.0)
    JFLAGS+=("${extra[@]}" -Dterminal.jline=false -Dterminal.ansi=true)
}

ensure_node() {
    local want=${NODE_VERSION#v} idx ver a=x64
    [ "$M" = aarch64 ] && a=arm64
    if idx=$(get https://nodejs.org/dist/index.json); then
        if [ -z "$want" ]; then
            ver=$(jq -r '[.[] | select(.lts)][0].version' <<< "$idx")
        else
            ver=$(jq -r --arg w "v$want" '[.[] | select(.version == $w or (.version | startswith($w + ".")))][0].version // empty' <<< "$idx")
        fi
    else # offline: reuse whatever matching version is already installed
        ver=$(cd "$RT" && ls -d node-v"$want"* 2>/dev/null | sort -V | tail -1); ver=${ver#node-}
    fi
    [ -z "$ver" ] && die "Node.js version '$want' not found."
    local dir=$RT/node-$ver
    if [ ! -x "$dir/bin/node" ]; then
        dl "https://nodejs.org/dist/$ver/node-$ver-linux-$a.tar.xz" "$EGG/tmp/node.tar.xz"
        rm -rf "$dir" && mkdir -p "$dir"
        tar -xJf "$EGG/tmp/node.tar.xz" -C "$dir" --strip-components=1 || die "Could not extract Node.js $ver."
        rm -f "$EGG/tmp/node.tar.xz"
        find "$RT" -maxdepth 1 -name 'node-*' ! -name "node-$ver" -exec rm -rf {} +
    fi
    export PATH="$dir/bin:$PATH"
    say "Using Node.js $ver"
}

ensure_uv() {
    export UV_PYTHON_INSTALL_DIR=$RT/python UV_CACHE_DIR=$EGG/cache/uv UV_PYTHON_PREFERENCE=only-managed UV_NO_PROGRESS=1
    [ -x "$EGG/bin/uv" ] && return
    local a=x86_64; [ "$M" = aarch64 ] && a=aarch64
    dl "https://github.com/astral-sh/uv/releases/latest/download/uv-$a-unknown-linux-gnu.tar.gz" "$EGG/tmp/uv.tar.gz"
    tar -xzf "$EGG/tmp/uv.tar.gz" -C "$EGG/bin" --strip-components=1 || die "Could not extract uv."
    rm -f "$EGG/tmp/uv.tar.gz"
}

git_sync() {
    [ -z "$GIT_REPO" ] && return
    local url=$GIT_REPO auth=() branch=$GIT_BRANCH
    [[ "$url" == *://* || "$url" == git@* ]] || url="https://$url"
    [ -n "$GIT_PAT" ] && auth=(-c "http.extraHeader=Authorization: Basic $(printf 'oauth2:%s' "$GIT_PAT" | base64 -w0)")
    if [ ! -d .git ]; then
        say "Cloning $GIT_REPO..."
        git init -q && git remote add origin "$url"
        if [ -z "$branch" ]; then
            branch=$(git "${auth[@]}" ls-remote --symref origin HEAD 2>/dev/null | awk '/^ref:/ {sub("refs/heads/", "", $2); print $2}')
        fi
        git "${auth[@]}" fetch -q origin "${branch:-main}" && git checkout -q -f -B "${branch:-main}" FETCH_HEAD \
            || { rm -rf .git; die "Could not clone $GIT_REPO (check the URL, branch and access token)."; }
        git branch -q --set-upstream-to="origin/${branch:-main}" 2>/dev/null
        printf '.eggactyl/\neggactyl.conf\n' >> .git/info/exclude
    elif [ "${AUTO_UPDATE:-1}" = 1 ]; then
        say "Pulling latest changes..."
        git remote set-url origin "$url"
        git "${auth[@]}" pull -q --ff-only origin "${branch:-$(git rev-parse --abbrev-ref HEAD)}" || warn "git pull failed; starting with the current files."
    fi
}

# ---------------------------------------------------------------- installers

fill_install() { # PaperMC Fill API project (paper, velocity)
    local p=$1 v=$VERSION b
    if [ -z "$v" ] || [ "$v" = latest ]; then
        for v in $(get "$FILL/$p" | jq -r '.versions[][] | select(test("-") | not)' | head -5); do
            b=$(get "$FILL/$p/versions/$v/builds?channel=STABLE" | jq -c '.[0] // empty') && [ -n "$b" ] && break
        done
    else
        b=$(get "$FILL/$p/versions/$v/builds?channel=STABLE" | jq -c '.[0] // empty')
        if [ -z "$b" ]; then
            b=$(get "$FILL/$p/versions/$v/builds/latest") || die "$NAME version '$v' does not exist."
            warn "No stable $NAME build for $v; using the latest experimental build."
        fi
    fi
    [ -z "$b" ] && die "Could not find a $NAME build."
    VERSION=$v BUILD=$(jq -r .id <<< "$b") JAR=server.jar
    JAVA=$(get "$FILL/$p/versions/$v" | jq -r '.version.java.version.minimum // 21')
    # The API under-reports Velocity's minimum for some builds; Java 21+ runs all of them.
    [ "$p" = velocity ] && [ "$JAVA" -lt 21 ] && JAVA=21
    dl "$(jq -r '.downloads["server:default"].url' <<< "$b")" server.jar
}

latest_release() { get "$MOJANG" | jq -r .latest.release; }

install_purpur() {
    local v=$VERSION b
    [ -z "$v" ] || [ "$v" = latest ] && v=$(get https://api.purpurmc.org/v2/purpur | jq -r '.versions[-1]')
    b=$(get "https://api.purpurmc.org/v2/purpur/$v" | jq -r '.builds.latest // empty')
    [ -z "$b" ] && die "Purpur version '$v' does not exist."
    VERSION=$v BUILD=$b JAR=server.jar JAVA=$(mc_java "$v")
    dl "https://api.purpurmc.org/v2/purpur/$v/$b/download" server.jar
}

install_vanilla() {
    local v=$VERSION url meta
    [ -z "$v" ] || [ "$v" = latest ] && v=$(latest_release)
    url=$(get "$MOJANG" | jq -r --arg v "$v" '.versions[] | select(.id == $v) | .url')
    [ -z "$url" ] && die "Minecraft version '$v' does not exist."
    meta=$(get "$url")
    url=$(jq -r '.downloads.server.url // empty' <<< "$meta")
    [ -z "$url" ] && die "Minecraft $v has no dedicated server download."
    VERSION=$v JAR=server.jar JAVA=$(jq -r '.javaVersion.majorVersion // 8' <<< "$meta")
    dl "$url" server.jar
}

install_fabric() {
    local v=$VERSION loader installer
    [ -z "$v" ] || [ "$v" = latest ] && v=$(get "$FABRIC/game" | jq -r '[.[] | select(.stable)][0].version')
    loader=$(get "$FABRIC/loader/$v" | jq -r '.[0].loader.version // empty' 2>/dev/null)
    [ -z "$loader" ] && die "Fabric does not support Minecraft '$v'."
    installer=$(get "$FABRIC/installer" | jq -r '[.[] | select(.stable)][0].version')
    VERSION=$v BUILD=$loader JAR=server.jar JAVA=$(mc_java "$v")
    dl "$FABRIC/loader/$v/$loader/$installer/server/jar" server.jar
}

run_forge_installer() { # url
    ensure_java
    dl "$1" "$EGG/tmp/installer.jar"
    say "Running the $NAME installer (this can take a few minutes)..."
    java -jar "$EGG/tmp/installer.jar" --installServer . > "$EGG/tmp/installer.log" 2>&1 \
        || { tail -20 "$EGG/tmp/installer.log"; die "$NAME installer failed."; }
    rm -f "$EGG/tmp/installer.jar" installer.jar.log "$EGG/tmp/installer.log" run.bat
}

install_forge() {
    local v=$VERSION promos fv
    promos=$(get https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json)
    [ -z "$v" ] || [ "$v" = latest ] && v=$(jq -r '.promos | keys[] | sub("-(latest|recommended)$"; "")' <<< "$promos" | sort -uV | tail -1)
    fv=$(jq -r --arg v "$v" '.promos[$v + "-recommended"] // .promos[$v + "-latest"] // empty' <<< "$promos")
    [ -z "$fv" ] && die "Forge does not support Minecraft '$v'."
    VERSION=$v BUILD=$fv JAVA=$(mc_java "$v")
    run_forge_installer "https://maven.minecraftforge.net/net/minecraftforge/forge/$v-$fv/forge-$v-$fv-installer.jar"
    ARGS_FILE=libraries/net/minecraftforge/forge/$v-$fv/unix_args.txt JAR=
    if [ ! -f "$ARGS_FILE" ]; then
        ARGS_FILE=; local j; for j in forge-"$v-$fv"*.jar; do [[ "$j" == *installer* || ! -f "$j" ]] || { JAR=$j; break; }; done
        [ -z "$JAR" ] && die "Forge installed, but no server jar was found."
    fi
}

install_neoforge() {
    local v=$VERSION all prefix nv a b c
    all=$(get https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml | grep -o '<version>[^<]*</version>' | sed 's/<[^>]*>//g')
    if [ -z "$v" ] || [ "$v" = latest ]; then
        nv=$(grep -v beta <<< "$all" | sort -V | tail -1)
        IFS=. read -r a b c _ <<< "$nv"
        if [ "$a" -lt 26 ]; then v=1.$a; [ "$b" != 0 ] && v=$v.$b; else v=$a.$b; [ "$c" != 0 ] && v=$v.$c; fi
    else
        IFS=. read -r a b c <<< "${v#1.}"
        if [[ "$v" == 1.* ]]; then prefix=$a.${b:-0}.; else prefix=$a.$b.${c:-0}.; fi
        prefix=^${prefix//./\\.}
        nv=$(grep "$prefix" <<< "$all" | grep -v beta | sort -V | tail -1)
        [ -z "$nv" ] && nv=$(grep "$prefix" <<< "$all" | sort -V | tail -1)
        [ -z "$nv" ] && die "NeoForge does not support Minecraft '$v' (use Forge for 1.20.1 and older)."
    fi
    VERSION=$v BUILD=$nv JAVA=$(mc_java "$v")
    run_forge_installer "https://maven.neoforged.net/releases/net/neoforged/neoforge/$nv/neoforge-$nv-installer.jar"
    ARGS_FILE=libraries/net/neoforged/neoforge/$nv/unix_args.txt JAR=
    [ -f "$ARGS_FILE" ] || die "NeoForge installed, but $ARGS_FILE is missing."
}

install_bungeecord() {
    VERSION=latest JAR=server.jar JAVA=21
    dl https://ci.md-5.net/job/BungeeCord/lastSuccessfulBuild/artifact/bootstrap/target/BungeeCord.jar server.jar
}

bedrock_url() {
    curl -fsSL --retry 3 -A "$BROWSER_UA" https://net-secondary.web.minecraft-services.net/api/v1.0/download/links \
        | jq -r '.result.links[] | select(.downloadType == "serverBedrockLinux") | .downloadUrl'
}

install_bedrock() { # $1 = download url (optional)
    x86_only
    local url=${1:-$(bedrock_url)} keep=() f
    [ -z "$url" ] && die "Could not find the Bedrock server download."
    say "Downloading Bedrock server $(basename "$url" .zip)..."
    curl -fsSL --retry 3 -A "$BROWSER_UA" -o "$EGG/tmp/bedrock.zip" "$url" || die "Download failed: $url"
    for f in server.properties permissions.json allowlist.json; do [ -f "$f" ] && keep+=(-x "$f"); done
    unzip -qo "$EGG/tmp/bedrock.zip" -d . "${keep[@]}" || die "Could not extract the Bedrock server."
    rm -f "$EGG/tmp/bedrock.zip"
    chmod +x bedrock_server
    VERSION=$(basename "$url" .zip); VERSION=${VERSION#bedrock-server-}
}

install_teamspeak() {
    x86_only
    command -v bzip2 >/dev/null || die "bzip2 is missing. Reinstall the server from Settings > Reinstall Server."
    local info; info=$(get https://www.teamspeak.com/versions/server.json) || die "Could not reach teamspeak.com."
    VERSION=$(jq -r .linux.x86_64.version <<< "$info")
    dl "$(jq -r '.linux.x86_64.mirrors | to_entries[0].value' <<< "$info")" "$EGG/tmp/ts3.tar.bz2"
    tar -xjf "$EGG/tmp/ts3.tar.bz2" --strip-components=1 || die "Could not extract TeamSpeak."
    rm -f "$EGG/tmp/ts3.tar.bz2"
    touch .ts3server_license_accepted
}

install_lavalink() {
    VERSION=latest JAR=Lavalink.jar JAVA=21
    dl https://github.com/lavalink-devs/Lavalink/releases/latest/download/Lavalink.jar Lavalink.jar
    if [ ! -f application.yml ]; then
        local pw; pw=$(tr -dc A-Za-z0-9 < /dev/urandom | head -c 20)
        printf 'server:\n  address: 0.0.0.0\nlavalink:\n  server:\n    password: "%s"\n' "$pw" > application.yml
        say "Created application.yml - Lavalink password: $pw"
    fi
}

install_type() {
    case $TYPE in
        paper|velocity) fill_install "$TYPE" ;;
        purpur|vanilla|fabric|forge|neoforge|bungeecord|bedrock|teamspeak|lavalink) "install_$TYPE" ;;
    esac
}

# ---------------------------------------------------------------- setup menu

TYPES=(paper purpur fabric forge neoforge vanilla velocity bungeecord bedrock python nodejs java teamspeak lavalink)
NAMES=(Paper Purpur Fabric Forge NeoForge "Vanilla Minecraft" Velocity BungeeCord "Bedrock Dedicated Server" "Python" "Node.js" "Java (custom .jar)" "TeamSpeak 3" Lavalink)
name_of() { local i; for i in "${!TYPES[@]}"; do [ "${TYPES[$i]}" = "$1" ] && echo "${NAMES[$i]}"; done; }
is_versioned() { [[ " paper purpur fabric forge neoforge vanilla velocity " == *" $1 "* ]]; }

eula() {
    grep -qs 'eula=true' eula.txt && return
    say "Minecraft servers require you to accept the Minecraft EULA: https://aka.ms/MinecraftEULA"
    if confirm "Do you accept the Minecraft EULA?"; then echo "eula=true" > eula.txt
    else die "The EULA was not accepted. Restart the server once you are ready to accept it."; fi
}

setup() { # $1 = menu (ask in the console) or preset (Server Type / Server Version from the Startup tab)
    if [ "$1" = menu ]; then
        echo
        say "Welcome to Eggactyl V2! What should this server run?"
        [ -f eggactyl_config.yml ] && say "(Eggactyl v1 config found - pick your server type once and your files are kept.)"
        cat <<'MENU'
  Minecraft Java      1) Paper     2) Purpur    3) Fabric     4) Forge     5) NeoForge   6) Vanilla
  Minecraft Proxy     7) Velocity  8) BungeeCord
  Minecraft Bedrock   9) Bedrock Dedicated Server
  Bots & Apps        10) Python   11) Node.js  12) Java (custom .jar)
  Voice & Music      13) TeamSpeak 3          14) Lavalink
MENU
        while :; do
            ask "Type a number and press Enter:"
            if [[ "$ANSWER" =~ ^[0-9]+$ ]] && [ "$ANSWER" -ge 1 ] && [ "$ANSWER" -le ${#TYPES[@]} ]; then
                TYPE=${TYPES[$((ANSWER - 1))]}; break
            fi
            [ -n "$(name_of "${ANSWER,,}")" ] && { TYPE=${ANSWER,,}; break; }
            warn "'$ANSWER' is not an option."
        done
        NAME=$(name_of "$TYPE")
        say "Selected: $NAME"
        VERSION=latest
        is_versioned "$TYPE" && { ask "Which version? (press Enter for latest)" latest; VERSION=$ANSWER; }
    else
        TYPE=$SERVER_TYPE VERSION=${SERVER_VERSION:-latest}
        NAME=$(name_of "$TYPE")
        say "Setting up $NAME (Server Type from the Startup tab)..."
    fi
    is_versioned "$TYPE" || VERSION=''
    BUILD='' JAVA='' JAR='' ARGS_FILE=''

    case $TYPE in
        paper|purpur|fabric|forge|neoforge|vanilla|bedrock) eula ;;
        teamspeak)
            say "TeamSpeak license: https://www.teamspeak.com/en/privacy-and-terms/"
            confirm "Do you accept the TeamSpeak license agreement?" || die "The license was not accepted." ;;
        python|nodejs|java)
            say "Upload your files (or set Git Repository in the Startup tab) and set Startup File if needed." ;;
    esac

    install_type
    save_conf
    if [ "$1" = menu ]; then
        say "Setup complete. To switch later, delete eggactyl.conf and restart (or set Server Type in the Startup tab)."
    else
        say "Setup complete. To switch later, change Server Type in the Startup tab."
    fi
}

# ---------------------------------------------------------------- start

update_build() { # newer build of the *same* version for Paper / Purpur / Velocity; never changes the game version
    [ "${AUTO_UPDATE:-1}" = 1 ] || return
    local id url b
    case $TYPE in
        paper|velocity)
            b=$(get "$FILL/$TYPE/versions/$VERSION/builds?channel=STABLE" | jq -c '.[0] // empty')
            [ -n "$b" ] || return
            id=$(jq -r .id <<< "$b"); url=$(jq -r '.downloads["server:default"].url' <<< "$b") ;;
        purpur)
            id=$(get "https://api.purpurmc.org/v2/purpur/$VERSION" | jq -r '.builds.latest // empty')
            url="https://api.purpurmc.org/v2/purpur/$VERSION/$id/download" ;;
        *) return ;;
    esac
    [[ "$id" =~ ^[0-9]+$ ]] && [ "$id" -gt "${BUILD:-0}" ] || return
    say "Updating $NAME $VERSION: build ${BUILD:-unknown} -> $id"
    if curl -fsSL --retry 3 -A "$UA" -o "$JAR.part" "$url"; then
        mv -f "$JAR.part" "$JAR"; BUILD=$id; save_conf
    else
        rm -f "$JAR.part"; warn "Update download failed; starting the current build."
    fi
}

run_console() { # stop-command cmd...
    # Minecraft servers only reliably save when told "stop" (old versions, Bedrock and some mods lose
    # data on a signal). So run the server in its own session, pass console input through, and turn
    # the panel's stop signal (SIGINT/SIGTERM) into the server's stop command.
    STOP_CMD=$1; shift
    local fifo=$EGG/tmp/console.stdin pid reader rc
    rm -f "$fifo" && mkfifo "$fifo"
    setsid "$@" < "$fifo" &
    pid=$!
    exec 3> "$fifo" 4<&0
    trap 'echo "$STOP_CMD" >&3' INT TERM
    (trap '' INT TERM; while IFS= read -r line; do echo "$line" >&3; done) <&4 &
    reader=$!
    while :; do wait "$pid"; rc=$?; kill -0 "$pid" 2>/dev/null || break; done
    kill -9 "$reader" 2>/dev/null
    exit "$rc"
}

start_minecraft() {
    set_prop server.properties server-ip 0.0.0.0
    set_prop server.properties server-port "$SERVER_PORT"
    set_prop server.properties query.port "$SERVER_PORT"
    eula
    ensure_java; jvm_flags
    if [ -n "$ARGS_FILE" ]; then
        local user_args=(); [ -f user_jvm_args.txt ] && user_args=(@user_jvm_args.txt)
        run_console stop java "${JFLAGS[@]}" "${user_args[@]}" "@$ARGS_FILE" nogui
    fi
    run_console stop java "${JFLAGS[@]}" -jar "$JAR" nogui
}

start_proxy() {
    ensure_java; jvm_flags
    if [ "$TYPE" = velocity ]; then run_console shutdown java "${JFLAGS[@]}" -jar "$JAR" --port "$SERVER_PORT"; fi
    if [ -f config.yml ]; then
        sed -i -E "s|^(\s*-?\s*host:\s*).*|\1""0.0.0.0:$SERVER_PORT|; s|^(\s*-?\s*query_port:\s*).*|\1$SERVER_PORT|" config.yml
    else
        printf 'listeners:\n- host: 0.0.0.0:%s\n  query_port: %s\n' "$SERVER_PORT" "$SERVER_PORT" > config.yml
    fi
    run_console end java "${JFLAGS[@]}" -jar "$JAR"
}

start_bedrock() {
    if [ "${AUTO_UPDATE:-1}" = 1 ]; then
        local url; url=$(bedrock_url)
        if [ -n "$url" ] && [ "$(basename "$url" .zip)" != "bedrock-server-$VERSION" ]; then
            say "Updating Bedrock server $VERSION -> $(basename "$url" .zip | sed 's/bedrock-server-//')"
            install_bedrock "$url"; save_conf
        fi
    fi
    set_prop server.properties server-port "$SERVER_PORT"
    set_prop server.properties server-portv6 "$((SERVER_PORT + 1))"
    export LD_LIBRARY_PATH=.
    run_console stop ./bedrock_server
}

start_python() {
    git_sync
    ensure_uv
    local py=${PYTHON_VERSION:-3.13} venv=$EGG/venv file
    if [ ! -x "$venv/bin/python" ] || [ "$(cat "$venv/.eggactyl-python" 2>/dev/null)" != "$py" ]; then
        say "Setting up Python $py..."
        rm -rf "$venv"
        uv venv -q --seed --python "$py" "$venv" || die "Could not install Python $py."
        echo "$py" > "$venv/.eggactyl-python"
    fi
    export VIRTUAL_ENV=$venv PATH="$venv/bin:$PATH" PYTHONUNBUFFERED=1
    say "Using $(python --version)"
    if [ -f requirements.txt ]; then
        say "Installing requirements.txt..."; uv pip install -q -r requirements.txt || warn "Installing requirements.txt failed."
    elif [ -f pyproject.toml ]; then
        say "Installing pyproject.toml dependencies..."; uv pip install -q -r pyproject.toml || warn "Installing dependencies failed."
    fi
    if [ -n "$EXTRA_PACKAGES" ]; then
        # shellcheck disable=SC2086
        say "Installing extra packages: $EXTRA_PACKAGES"; uv pip install -q $EXTRA_PACKAGES || warn "Installing extra packages failed."
    fi
    [ -n "$BOT_FILENAME" ] && [ ! -f "$BOT_FILENAME" ] && die "Startup File '$BOT_FILENAME' not found."
    file=$(pick_file "$BOT_FILENAME" main.py bot.py app.py index.py run.py) \
        || die "No Python file found. Upload your files or set Git Repository, then set Startup File in the Startup tab."
    started; exec python -u "$file"
}

start_nodejs() {
    git_sync
    ensure_node
    export NPM_CONFIG_UPDATE_NOTIFIER=false
    if [ -f package.json ]; then
        say "Installing npm packages..."; npm install --no-audit --no-fund --loglevel=error || warn "npm install failed."
    fi
    if [ -n "$EXTRA_PACKAGES" ]; then
        # shellcheck disable=SC2086
        say "Installing extra packages: $EXTRA_PACKAGES"; npm install --no-audit --no-fund --no-save --loglevel=error $EXTRA_PACKAGES || warn "Installing extra packages failed."
    fi
    if [ -n "$BOT_FILENAME" ]; then
        [ -f "$BOT_FILENAME" ] || die "Startup File '$BOT_FILENAME' not found."
        started; exec node "$BOT_FILENAME"
    fi
    if [ -f package.json ] && [ "$(jq -r '.scripts.start // empty' package.json)" ]; then started; exec npm start; fi
    local file; file=$(pick_file index.js main.js bot.js app.js index.mjs) \
        || die "No Node.js file found. Upload your files or set Git Repository, then set Startup File in the Startup tab."
    started; exec node "$file"
}

start_java() {
    git_sync
    local file=$BOT_FILENAME jars
    if [ -z "$file" ]; then
        jars=$(ls ./*.jar 2>/dev/null)
        [ "$(echo "$jars" | grep -c .)" = 1 ] && file=${jars#./}
    fi
    [ -n "$file" ] && [ -f "$file" ] || die "Set Startup File to your .jar in the Startup tab (or upload exactly one .jar)."
    ensure_java; jvm_flags; started
    exec java "${JFLAGS[@]}" -jar "$file"
}

start_teamspeak() {
    export LD_LIBRARY_PATH=".:$LD_LIBRARY_PATH"
    started
    exec ./ts3server default_voice_port="$SERVER_PORT" query_port="${QUERY_PORT:-10011}" filetransfer_port="${FILE_PORT:-30033}" \
        voice_ip=0.0.0.0 query_ip=0.0.0.0 filetransfer_ip=0.0.0.0 license_accepted=1
}

start_lavalink() {
    ensure_java; jvm_flags
    exec java "${JFLAGS[@]}" -jar "$JAR"
}

# ---------------------------------------------------------------- main

self_update
need_jq
# shellcheck disable=SC1090
[ -f "$CONF" ] && source "$CONF"
if [ -n "$SERVER_TYPE" ] && [ "$SERVER_TYPE" != menu ]; then
    [ -n "$(name_of "$SERVER_TYPE")" ] || die "Unknown Server Type '$SERVER_TYPE'."
    # (Re)install when the Startup tab asks for a different type, or for a specific version we don't have.
    if [ "$SERVER_TYPE" != "$TYPE" ] || { is_versioned "$TYPE" && [ -n "$SERVER_VERSION" ] \
        && [ "$SERVER_VERSION" != latest ] && [ "$SERVER_VERSION" != "$VERSION" ]; }; then
        setup preset
    fi
elif [ ! -f "$CONF" ]; then
    setup menu
fi
NAME=$(name_of "$TYPE")
[ -z "$NAME" ] && { rm -f "$CONF"; die "eggactyl.conf was invalid and has been removed. Restart to choose a server type."; }

# Reinstall the server software if its files went missing (e.g. deleted by accident).
if { [ -n "$JAR" ] && [ ! -f "$JAR" ] && [ -z "$ARGS_FILE" ]; } || { [ -n "$ARGS_FILE" ] && [ ! -f "$ARGS_FILE" ]; } \
    || { [ "$TYPE" = bedrock ] && [ ! -f bedrock_server ]; } || { [ "$TYPE" = teamspeak ] && [ ! -f ts3server ]; }; then
    warn "$NAME files are missing - reinstalling $VERSION."
    install_type && save_conf
fi
update_build

say "Starting $NAME${VERSION:+ $VERSION}${BUILD:+ (build $BUILD)} - Eggactyl $EGGACTYL_VERSION"
case $TYPE in
    paper|purpur|fabric|forge|neoforge|vanilla) start_minecraft ;;
    velocity|bungeecord) start_proxy ;;
    *) "start_$TYPE" ;;
esac
