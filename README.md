# Eggactyl V2

A self-contained multi-egg for Pterodactyl (and Pelican). Create a server, start it, and pick what it runs from the console. Or set it in the Startup tab and skip the menu.

| Category | Options |
| --- | --- |
| Minecraft Java | Paper, Purpur, Fabric, Forge, NeoForge, Vanilla |
| Minecraft proxy | Velocity, BungeeCord |
| Minecraft Bedrock | Bedrock Dedicated Server (auto-updates) |
| Bots & apps | Python, Node.js, custom Java `.jar` (optionally from a Git repo) |
| Voice & music | TeamSpeak 3, Lavalink |

## Why V2 exists

The original Eggactyl egg kept everything in `ghcr.io/eggactyl/multi-egg`. Its obfuscated `/t.sh` downloaded the list of server types from `www.eggactyl.cloud`. Eggactyl shut down in 2025 and that domain now points to a parking page, so the menu came up empty ("Please choose an option from 1 to 0") and no server type could be installed.

V2 has no Eggactyl backend:

- **Runtime image:** `ghcr.io/parkervcp/yolks:debian`, the maintained community image used by the official Pterodactyl eggs.
- **Launcher:** plain bash ([src/eggactyl.sh](src/eggactyl.sh)), embedded in the egg's install script so every server has a working copy.
- **Downloads:** server software and runtimes come straight from the official sources: PaperMC, Mojang, Fabric, Forge, NeoForge, Purpur, md-5, minecraft.net, TeamSpeak, Lavalink, Adoptium (Java), nodejs.org and astral uv (Python).

## Install

1. In the admin panel, go to **Nests → Import Egg** and upload `egg-eggactyl-v2.json` (also attached to every [release](https://github.com/ExecSam/Eggactyl-V2/releases)).
2. Create a server with the **Eggactyl V2** egg.
3. Start it and pick what it runs. There are two ways:
   - **Console menu** (Server Type = `menu`, the default): type the number, then the version (Enter = latest), then accept the EULA.
   - **Startup tab**: set **Server Type** (and **Server Version** for Minecraft/Velocity) before the first start. The menu is skipped, but Minecraft still asks for the EULA once.

**Switching type:** change Server Type in the Startup tab and restart. On a menu-mode server, deleting `eggactyl.conf` brings the menu back. Either way your worlds and files are kept.

**Changing Minecraft version:** set Server Version to the new version and restart. Back up first; worlds can't be downgraded.

### Moving an existing Eggactyl v1 server to V2

Make these changes in **Admin → Servers → (server) → Startup**:

- **Egg:** Eggactyl V2.
- **Docker image:** `ghcr.io/parkervcp/yolks:debian`.
- **Startup command:** `bash .eggactyl/eggactyl.sh`. Make sure **Skip Egg Install Script** is *off*.

Then run **Settings → Reinstall Server**. Reinstalling only writes `.eggactyl/` and doesn't delete your files. On the next start, pick the server type once.

## Updates

| What | How it updates |
| --- | --- |
| Eggactyl launcher | On every start, the server checks the [latest release](https://github.com/ExecSam/Eggactyl-V2/releases/latest). If it's newer and passes a syntax check, the server swaps it in. If GitHub is unreachable it just starts with the copy it has. Admins can turn this off per server with **Eggactyl Self-Update**. |
| Paper / Purpur / Velocity | Newest stable build of the **same** game version on start (Auto Update = 1). |
| Bedrock | Latest release on start (Auto Update = 1); clients require it. |
| Bots from Git | `git pull --ff-only` on start (Auto Update = 1). |
| The egg itself (variables, startup) | Only when you re-import `egg-eggactyl-v2.json`. Needed only when a release adds or changes egg variables; the release notes will say. |

### Shipping an update

1. Edit `src/eggactyl.sh` (or `src/install.sh`) and bump `EGGACTYL_VERSION` at the top of `src/eggactyl.sh`.
2. Run `python build.py`, commit, and push.
3. Tag a release: `git tag v2.0.1 && git push origin v2.0.1`.

The GitHub Action runs the full test suite. Only if every test passes does it publish the release, and every server picks it up on its next start. A broken change never reaches servers through self-update. Servers only ever move to a newer version, and the downloaded script must pass a syntax check before it's used.

## Variables

| Variable | Used by | Notes |
| --- | --- | --- |
| Server Type (`SERVER_TYPE`) | all | `menu` (default) or a type. Changing it reinstalls the server software; files are kept |
| Server Version (`SERVER_VERSION`) | Minecraft Java, Velocity | `latest` or e.g. `1.21.4`; only used with Server Type |
| Startup File (`BOT_FILENAME`) | Python, Node.js, Java | Blank = auto-detect (`main.py`/`bot.py`…, `npm start`/`index.js`…, the only `.jar`) |
| Git Repository / Branch / Access Token | Python, Node.js, Java | Cloned into the server root. The token is sent as an HTTP header and never written to disk |
| Auto Update (`AUTO_UPDATE`) | see Updates | `1` (default) / `0` |
| Additional Packages (`EXTRA_PACKAGES`) | Python, Node.js | Extra pip/npm packages, installed on every start |
| Python Version | Python | Any version uv can install (default 3.13) |
| Node.js Version | Node.js | `22`, `24.1.0`, … blank = latest LTS |
| Java Version | Java types | Blank = picked automatically from the Minecraft version, Paper's API, or 21 |
| Java Arguments | Java types | Appended to the defaults. Heap defaults to the server's memory minus 10% (128 MB–1 GB) for the JVM itself, unless you pass `-Xmx` |
| Query Port / File Port | TeamSpeak 3 | Add these as extra allocations on the server |
| Eggactyl Self-Update (`LAUNCHER_UPDATE`) | all | Admin-only. `0` freezes the launcher on that server |

`requirements.txt` / `pyproject.toml` and `package.json` dependencies are installed automatically on every start.

## Layout on the server

```
eggactyl.conf          chosen type/version/build (delete to re-run setup)
.eggactyl/eggactyl.sh  launcher (self-updates; rewritten by Reinstall)
.eggactyl/runtimes/    Java / Node.js / Python, downloaded on demand
.eggactyl/venv/        Python virtualenv
```

## Development

- `python build.py` regenerates `egg-eggactyl-v2.json` from `src/`. Pterodactyl caps the install script at 64 KB, and the build fails if the script goes over.
- `bash test/run-all.sh` runs every server type through `test/sim.sh`, a local imitation of Wings. It needs Docker. Each test runs the install script, starts the server as Wings would (tini, uid 988, memory limit, tmpfs `/tmp`), answers the console prompts, waits for the ready line, then stops it with SIGINT like the panel's Stop button. It also covers restarts, Paper build updates, Python version changes and launcher self-update. Logs go to `test/logs/`.
- GitHub Actions runs the same suite nightly and on every `v*` tag. A failed nightly run emails the repo owner.

`legacy/egg-v1.json` is the original broken egg, kept for reference.
