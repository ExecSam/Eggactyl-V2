#!/bin/bash
# Eggactyl V2 installer: writes the launcher into the server folder.
# What the server runs is chosen from the console on first start.

mkdir -p /mnt/server/.eggactyl/bin

# TeamSpeak ships as .tar.bz2 and the runtime image has libbz2 but no bzip2 binary.
if apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq --no-install-recommends bzip2 >/dev/null 2>&1; then
    cp "$(command -v bzip2)" /mnt/server/.eggactyl/bin/bzip2
else
    echo "Warning: could not install bzip2 (only needed for TeamSpeak 3)."
fi

cat > /mnt/server/.eggactyl/eggactyl.sh <<'EGGACTYL_LAUNCHER_EOF'
__EGGACTYL_LAUNCHER__
EGGACTYL_LAUNCHER_EOF
chmod +x /mnt/server/.eggactyl/eggactyl.sh

echo "Eggactyl V2 installed. Start the server and choose what it should run from the console."
