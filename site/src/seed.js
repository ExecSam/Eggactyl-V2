// First-run content. Everything here is editable in the admin panel afterwards.
// Docs and text fields support two tokens: {name} (the site name) and {repo} (the Git repository link).
import crypto from 'node:crypto';

const content = {
  name: 'Eggactyl V2',
  heroLine1: 'One egg.',
  heroLine2: 'Every server.',
  heroIntro: '{name} picks up where the original Eggactyl left off: one Pterodactyl egg for Minecraft, bots, voice servers and more, with no backend that can disappear.',
  storyHeading: 'Why {name} exists',
  storyBody: `The original Eggactyl multi-egg was a go-to for anyone running more than one kind of server on Pterodactyl. Import one egg and you could spin up whatever you needed.

Its launcher fetched the list of server types from eggactyl.cloud. When Eggactyl shut down in 2025 that domain became a parking page, the menu came up empty, and no server type could be installed.

{name} is a rebuild with nothing to shut down. The launcher is plain bash shipped inside the egg, it runs on the maintained community image, and it downloads server software straight from the official sources. Every release is tested against a local copy of Wings before it reaches a server.

Huge thanks to the original Eggactyl authors. None of this would exist without their work.`,
  storySignature: 'ExecSam, maintainer',
  showStatusLabels: true,
  repoUrl: 'https://github.com/ExecSam/Eggactyl-V2',
  releasesUrl: '',
  licence: '',
  minPanelVersion: '',
  footerNote: 'Made with ❤️ by [Rifts](https://rifts.cc)',
};

const sections = [
  { id: 'start', title: 'Getting started' },
  { id: 'config', title: 'Configuration' },
  { id: 'help', title: 'Help' },
];

const pages = [
  {
    sectionId: 'start', title: 'Introduction', slug: 'introduction',
    body: `{name} is a single Pterodactyl egg that can run any of these. Create a server, start it, and pick what it runs from the console. Or set it in the Startup tab and skip the menu.

| Category | Options |
| --- | --- |
| Minecraft Java | Paper, Purpur, Fabric, Forge, NeoForge, Vanilla |
| Minecraft proxy | Velocity, BungeeCord |
| Minecraft Bedrock | Bedrock Dedicated Server (auto-updates) |
| Bots & apps | Python, Node.js, custom Java \`.jar\` (optionally from a Git repo) |
| Voice & music | TeamSpeak 3, Lavalink |

It works on Pterodactyl and Pelican.

## How it works

- **Runtime image:** \`ghcr.io/parkervcp/yolks:debian\`, the maintained community image used by the official Pterodactyl eggs.
- **Launcher:** plain bash, written into every server by the egg's install script, so each server has its own working copy.
- **Downloads:** server software and runtimes come straight from the official sources: PaperMC, Mojang, Fabric, Forge, NeoForge, Purpur, md-5, minecraft.net, TeamSpeak, Lavalink, Adoptium (Java), nodejs.org and astral uv (Python).

There's no {name} server in the middle. If this website went away tomorrow, your servers would keep working.`,
  },
  {
    sectionId: 'start', title: 'Installation', slug: 'installation',
    body: `Get {name} into your panel and create your first server. It takes about five minutes.

## Before you start

- A Pterodactyl or Pelican panel you have admin access to
- At least one node running Wings

## 1. Download the egg

Download the egg JSON from the [latest release](/download/latest), or fetch it from the command line:

\`\`\`bash
curl -LO {repo}/releases/latest/download/egg-eggactyl-v2.json
\`\`\`

## 2. Import it into your panel

In the admin area, open \`Nests\`, choose \`Import Egg\`, upload the JSON and pick the nest it should live in.

## 3. Create a server

Create a new server as usual and select {name} as its egg. Start it and pick what it runs:

- **Console menu** (Server Type = \`menu\`, the default): type the number, then the version (Enter = latest), then accept the EULA.
- **Startup tab:** set **Server Type** (and **Server Version** for Minecraft and Velocity) before the first start. The menu is skipped, but Minecraft still asks for the EULA once.

> **Coming from the original Eggactyl?**
>
> Existing servers can switch to {name} in place, and your worlds and files are kept.
>
> [Read the migration guide →](/docs/migrating-from-eggactyl)`,
  },
  {
    sectionId: 'start', title: 'Migrating from Eggactyl', slug: 'migrating-from-eggactyl',
    body: `Servers created with the original Eggactyl egg can move to {name} without losing their files. The launcher spots the old \`eggactyl_config.yml\`, so you only pick the server type once.

## Steps

Back up the server first. Then make these changes in **Admin → Servers → (server) → Startup**:

- **Egg:** {name}.
- **Docker image:** \`ghcr.io/parkervcp/yolks:debian\`.
- **Startup command:** \`bash .eggactyl/eggactyl.sh\`. Make sure **Skip Egg Install Script** is *off*.

Then run **Settings → Reinstall Server**. Reinstalling only writes \`.eggactyl/\` and doesn't delete your files. On the next start, pick the server type once.

## Why the old egg stopped working

The original egg's launcher downloaded its list of server types from \`www.eggactyl.cloud\`. Eggactyl shut down in 2025 and that domain now points to a parking page, so the menu came up empty ("Please choose an option from 1 to 0") and no server type could be installed.`,
  },
  {
    sectionId: 'config', title: 'Variables', slug: 'variables',
    body: `These appear on each server's Startup tab.

| Variable | Default | What it does |
| --- | --- | --- |
| \`SERVER_TYPE\` | \`menu\` | **Server Type.** \`menu\` asks in the console on first start. Or set a type: \`paper\`, \`purpur\`, \`fabric\`, \`forge\`, \`neoforge\`, \`vanilla\`, \`velocity\`, \`bungeecord\`, \`bedrock\`, \`python\`, \`nodejs\`, \`java\`, \`teamspeak\`, \`lavalink\`. Changing it reinstalls the server software; files are kept. |
| \`SERVER_VERSION\` | \`latest\` | **Server Version** for Minecraft Java and Velocity: \`latest\` or a version such as \`1.21.4\`. Only used with Server Type. |
| \`BOT_FILENAME\` | blank | **Startup File** for Python, Node.js and Java. Blank auto-detects (\`main.py\`/\`bot.py\`…, \`npm start\`/\`index.js\`…, the only \`.jar\`). |
| \`GIT_REPO\` | blank | **Git Repository**, cloned into the server root (Python, Node.js, Java). |
| \`GIT_BRANCH\` | blank | **Git Branch.** Blank uses the repository's default branch. |
| \`GIT_PAT\` | blank | **Git Access Token** for private repositories. Sent as an HTTP header and never written to disk. |
| \`AUTO_UPDATE\` | \`1\` | **Auto Update.** \`1\` updates software on start (see [Startup and updates](/docs/startup-and-updates)), \`0\` turns it off. |
| \`EXTRA_PACKAGES\` | blank | **Additional Packages.** Extra pip or npm packages, installed on every start. |
| \`PYTHON_VERSION\` | \`3.13\` | Any version uv can install. |
| \`NODE_VERSION\` | blank | \`22\`, \`24.1.0\`, … Blank uses the latest LTS. |
| \`JAVA_VERSION\` | blank | Blank picks it from the Minecraft version, Paper's API, or 21. |
| \`JAVA_ARGUMENTS\` | blank | Appended to the defaults. The heap defaults to the server's memory minus 10% (128 MB–1 GB) for the JVM itself, unless you pass \`-Xmx\`. |
| \`QUERY_PORT\` | \`10011\` | TeamSpeak 3 query port. Add it as an extra allocation on the server. |
| \`FILE_PORT\` | \`30033\` | TeamSpeak 3 file transfer port. Add it as an extra allocation on the server. |
| \`LAUNCHER_UPDATE\` | \`1\` | **Eggactyl Self-Update.** Admin-only. \`0\` freezes the launcher on that server. |

\`requirements.txt\` / \`pyproject.toml\` and \`package.json\` dependencies are installed automatically on every start.`,
  },
  {
    sectionId: 'config', title: 'Choosing server software', slug: 'choosing-server-software',
    body: `On first start the console shows this menu. Type a number (or a name such as \`paper\`) and press Enter:

\`\`\`text
  Minecraft Java      1) Paper     2) Purpur    3) Fabric     4) Forge     5) NeoForge   6) Vanilla
  Minecraft Proxy     7) Velocity  8) BungeeCord
  Minecraft Bedrock   9) Bedrock Dedicated Server
  Bots & Apps        10) Python   11) Node.js  12) Java (custom .jar)
  Voice & Music      13) TeamSpeak 3          14) Lavalink
\`\`\`

Minecraft Java and Velocity then ask for a version (press Enter for the latest). Minecraft and Bedrock ask you to accept the EULA, and TeamSpeak asks you to accept its license.

## Skipping the menu

Set **Server Type** (and **Server Version**) in the Startup tab before the first start. Handy when you create servers for other people.

## Switching later

Change Server Type in the Startup tab and restart. On a menu-mode server, deleting \`eggactyl.conf\` brings the menu back. Either way your worlds and files are kept.

## Changing the Minecraft version

Set Server Version to the new version and restart. Back up first: worlds can't be downgraded.

## Bots and apps

For Python, Node.js and custom Java, upload your files (or set **Git Repository** in the Startup tab) and set **Startup File** if it isn't detected.

Bedrock Dedicated Server and TeamSpeak 3 only run on x86_64 nodes.`,
  },
  {
    sectionId: 'config', title: 'Startup and updates', slug: 'startup-and-updates',
    body: `## What updates itself

| What | How it updates |
| --- | --- |
| Eggactyl launcher | On every start the server checks the latest release. If it's newer and passes a syntax check, the server swaps it in. If GitHub is unreachable it just starts with the copy it has. Admins can turn this off per server with **Eggactyl Self-Update**. |
| Paper / Purpur / Velocity | Newest stable build of the **same** game version on start (Auto Update = 1). |
| Bedrock | Latest release on start (Auto Update = 1); clients require it. |
| Bots from Git | \`git pull --ff-only\` on start (Auto Update = 1). |
| The egg itself (variables, startup) | Only when you re-import the egg JSON. Needed only when a release adds or changes egg variables; the release notes will say. |

Servers only ever move to a newer launcher, and the downloaded script must pass a syntax check before it's used. Releases are published only after the full test suite passes.

## Layout on the server

\`\`\`text
eggactyl.conf          chosen type/version/build (delete to re-run setup)
.eggactyl/eggactyl.sh  launcher (self-updates; rewritten by Reinstall)
.eggactyl/runtimes/    Java / Node.js / Python, downloaded on demand
.eggactyl/venv/        Python virtualenv
\`\`\``,
  },
  {
    sectionId: 'help', title: 'Troubleshooting', slug: 'troubleshooting',
    body: `Messages from the launcher start with \`[Eggactyl]\` in the console. Here's what the common ones mean.

### "No console input available."

The setup menu needs the console. Answer it from the server's Console tab, or set **Server Type** in the Startup tab to skip the menu.

### "The EULA was not accepted."

Minecraft servers need you to accept the [Minecraft EULA](https://aka.ms/MinecraftEULA). Restart the server and answer \`y\` when asked.

### "… version '…' does not exist."

The version in **Server Version** (or the one you typed) isn't available for that software. Check the spelling, or use \`latest\`. For NeoForge, use Forge for Minecraft 1.20.1 and older.

### "No Python file found." / "No Node.js file found."

Upload your files or set **Git Repository**, then set **Startup File** in the Startup tab.

### "Set Startup File to your .jar in the Startup tab"

For custom Java, upload exactly one \`.jar\`, or set **Startup File** to the one to run.

### "Could not clone …"

Check the repository URL, the branch and, for private repositories, the **Git Access Token**.

### "… only runs on x86_64 nodes"

Bedrock Dedicated Server and TeamSpeak 3 have no ARM builds. Move the server to an x86_64 node.

### "Download failed: …"

The official download source for that software couldn't be reached. Each download is retried three times; wait a minute and start the server again.

### "eggactyl.conf was invalid and has been removed."

Restart the server and pick the server type again. Your files are kept.

### Starting over

Delete \`eggactyl.conf\` and restart to run setup again. Your worlds and files are kept.`,
  },
  {
    sectionId: 'help', title: 'FAQ', slug: 'faq',
    body: `### Is it free?

Yes.

### Does it rely on this website or an Eggactyl server?

No. The launcher ships inside the egg and downloads only from official sources. It checks GitHub for launcher updates, and starts normally if GitHub can't be reached.

### Will switching server type delete my files?

No. Changing the type reinstalls the server software; your worlds and files are kept.

### Does it work on Pelican?

Yes, {name} works on Pterodactyl and Pelican.

### Which Java version does Minecraft get?

It's picked automatically from the Minecraft version, Paper's API, or 21. Set **Java Version** to choose it yourself.

### How much memory does Java get?

The heap defaults to the server's memory minus 10% (128 MB–1 GB) for the JVM itself. Pass \`-Xmx\` in **Java Arguments** to set it yourself.

### Can I stop a server updating itself?

Set **Auto Update** to \`0\` to stop software updates on start. Admins can set **Eggactyl Self-Update** to \`0\` to freeze the launcher on a server.

### Do I need to re-import the egg for every release?

No. The launcher updates itself. Re-import only when a release adds or changes egg variables; the release notes will say.`,
  },
  {
    sectionId: 'help', title: 'Changelog', slug: 'changelog', kind: 'changelog',
    body: 'Every release of {name}, newest first. Servers pick up launcher updates on their next start.',
  },
  {
    sectionId: 'help', title: 'Getting help', slug: 'getting-help',
    body: `Stuck? [Troubleshooting](/docs/troubleshooting) explains the common console messages, and the [FAQ](/docs/faq) answers the usual questions.

## Reporting a problem

[Open an issue on GitHub]({repo}/issues/new) and include:

- The server type and version
- Whether your panel is Pterodactyl or Pelican
- The console output from the first \`[Eggactyl]\` line onwards

## Requesting a feature

Want another server type, or something to work differently? [Open an issue]({repo}/issues/new) and describe what you need.`,
  },
];

export function seed(now = new Date().toISOString()) {
  return {
    schema: 2,
    content: { ...content, updatedAt: null },
    sync: { auto: true, intervalMinutes: 15, lastRunAt: null, lastResult: null, etag: null, ignored: [] },
    releases: [],
    passkeys: [],
    docs: {
      sections: sections.map(s => ({ ...s })),
      pages: pages.map((p, i) => ({ id: `p${i + 1}`, kind: 'page', published: true, updatedAt: now, ...p })),
    },
  };
}

// Brings a db made by an older version up to date. Seeded content is only replaced while it's still the
// old default, so anything edited in the admin panel is left alone.
const OLD_FOOTER = 'Made by ExecSam. Not affiliated with Pterodactyl or the original Eggactyl project.';
const OLD_CONTRIBUTING_SHA256 = '02dec789eeb8304a478b388337c56eb5af653f677d0c5aed4c9ebf10c542fca3';

export function migrate(data, now = new Date().toISOString()) {
  if (data.schema < 2) {
    // v2: the footer credits Rifts, and the maintainer-facing Contributing page became Getting help.
    if (data.content.footerNote === OLD_FOOTER) data.content.footerNote = content.footerNote;
    const old = data.docs.pages.find(p => p.slug === 'contributing');
    const help = pages.find(p => p.slug === 'getting-help');
    if (old && crypto.createHash('sha256').update(old.body).digest('hex') === OLD_CONTRIBUTING_SHA256 && !data.docs.pages.some(p => p.slug === help.slug)) {
      Object.assign(old, { title: help.title, slug: help.slug, body: help.body, updatedAt: now });
    }
    data.schema = 2;
  }
}
