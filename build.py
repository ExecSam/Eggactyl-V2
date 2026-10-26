"""Build egg-eggactyl-v2.json from src/. Run: python build.py"""
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
MAX_SCRIPT = 65535  # Pterodactyl stores the install script in a MySQL TEXT column


TYPES = "paper,purpur,fabric,forge,neoforge,vanilla,velocity,bungeecord,bedrock,python,nodejs,java,teamspeak,lavalink"


def var(name, env, description, default="", rules="nullable|string|max:255", editable=True):
    return {
        "name": name,
        "description": description,
        "env_variable": env,
        "default_value": default,
        "user_viewable": True,
        "user_editable": editable,
        "rules": rules,
        "field_type": "text",
    }


launcher = (ROOT / "src/eggactyl.sh").read_text(encoding="utf-8").replace("\r\n", "\n")
assert "EGGACTYL_LAUNCHER_EOF" not in launcher
install = (ROOT / "src/install.sh").read_text(encoding="utf-8").replace("\r\n", "\n")
install = install.replace("__EGGACTYL_LAUNCHER__", launcher.rstrip("\n"))
size = len(install.encode("utf-8"))
assert size < MAX_SCRIPT, f"install script is {size} bytes, Pterodactyl allows {MAX_SCRIPT}"

done = [
    ")! For help, type",  # Minecraft Java (Paper, Fabric, Forge, ...)
    "Done (",  # Velocity
    "Listening on /",  # BungeeCord
    "Server started.",  # Bedrock
    "Lavalink is ready to accept connections",
    "[Eggactyl] Started",  # Python, Node.js, custom Java, TeamSpeak
]

egg = {
    "_comment": "DO NOT EDIT: FILE GENERATED AUTOMATICALLY BY PTERODACTYL PANEL - PTERODACTYL.IO",
    "meta": {"version": "PTDL_v2", "update_url": None},
    "exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00"),
    "name": "Eggactyl V2",
    "author": "mail@samjackaman.dev",
    "description": (
        "Multi-egg: pick what the server runs from the console on first start. "
        "Minecraft Java (Paper, Purpur, Fabric, Forge, NeoForge, Vanilla), proxies (Velocity, Waterfall, BungeeCord), "
        "Bedrock, Python and Node.js bots, custom Java apps, TeamSpeak 3 and Lavalink. "
        "Or set Server Type in the Startup tab to skip the menu."
    ),
    "features": ["eula"],
    "docker_images": {"Eggactyl V2 (Debian)": "ghcr.io/parkervcp/yolks:debian"},
    "file_denylist": [],
    "startup": "bash .eggactyl/eggactyl.sh",
    "config": {
        "files": "{}",
        "startup": json.dumps({"done": done}, indent=4),
        "logs": "{}",
        "stop": "^C",
    },
    "scripts": {
        "installation": {
            "script": install,
            "container": "debian:trixie-slim",
            "entrypoint": "bash",
        }
    },
    "variables": [
        var("Server Type", "SERVER_TYPE",
            "menu = choose in the console on first start. Pick a type to set the server up without the menu; "
            "changing it later reinstalls the server software (your files are kept).",
            default="menu", rules=f"required|string|in:menu,{TYPES}"),
        var("Server Version", "SERVER_VERSION",
            "Minecraft / Velocity version used with Server Type, e.g. 1.21.4. latest = newest at setup time "
            "(the game version is never upgraded automatically; set a version here to change it).",
            default="latest", rules="required|string|max:40"),
        var("Startup File", "BOT_FILENAME",
            "File to run for Python / Node.js / custom Java (e.g. bot.py, index.js, app.jar). Blank = auto-detect."),
        var("Git Repository", "GIT_REPO",
            "Optional. Git URL to clone your bot/app from (Python, Node.js, custom Java).", rules="nullable|string|max:400"),
        var("Git Branch", "GIT_BRANCH", "Branch to use. Blank = the repository's default branch."),
        var("Git Access Token", "GIT_PAT",
            "Personal access token for private repositories. Never written to disk.", rules="nullable|string|max:2000"),
        var("Auto Update", "AUTO_UPDATE",
            "1 = on start: git pull (bots), newest Paper/Purpur/Velocity build for the same game version, "
            "latest Bedrock release. 0 = off.",
            default="1", rules="required|boolean"),
        var("Additional Packages", "EXTRA_PACKAGES",
            "Extra pip (Python) or npm (Node.js) packages to install on start, space separated.",
            rules="nullable|string|max:1000"),
        var("Python Version", "PYTHON_VERSION", "Python version for Python bots, e.g. 3.13 or 3.12.",
            default="3.13", rules="nullable|regex:/^3\\.[0-9]+(\\.[0-9]+)?$/"),
        var("Node.js Version", "NODE_VERSION", "Node.js version, e.g. 22 or 24.1.0. Blank = latest LTS.",
            rules="nullable|regex:/^v?[0-9]+(\\.[0-9]+){0,2}$/"),
        var("Java Version", "JAVA_VERSION",
            "Force a Java version (8, 11, 17, 21, 25). Blank = automatic for the chosen server.",
            rules="nullable|regex:/^[0-9]{1,2}$/"),
        var("Java Arguments", "JAVA_ARGUMENTS",
            "Extra JVM flags. Memory is set automatically from the server's limit unless you pass -Xmx.",
            rules="nullable|string|max:2000"),
        var("Query Port", "QUERY_PORT", "TeamSpeak 3 ServerQuery port (must be an allocation on this server).",
            default="10011", rules="nullable|integer|between:1,65535"),
        var("File Port", "FILE_PORT", "TeamSpeak 3 file transfer port (must be an allocation on this server).",
            default="30033", rules="nullable|integer|between:1,65535"),
        var("Eggactyl Self-Update", "LAUNCHER_UPDATE",
            "1 = update the Eggactyl launcher from the latest GitHub release on start "
            "(keeps the installed copy if GitHub is unreachable). Admin only.",
            default="1", rules="required|boolean", editable=False),
    ],
}

out = ROOT / "egg-eggactyl-v2.json"
out.write_text(json.dumps(egg, indent=4) + "\n", encoding="utf-8", newline="\n")
print(f"wrote {out.name} (install script {size} bytes)")
