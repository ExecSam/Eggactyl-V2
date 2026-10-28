# Eggactyl website

The site at https://eggactyl.dev: home page, docs, and an admin panel for releases, docs and site text. Built from the Claude Design canvas "Eggactyl V2 Website".

Node 24 + Express, no database. Everything lives in one JSON file plus mirrored egg files under `DATA_DIR` (a Docker volume).

## Run it

```bash
npm install
ADMIN_PASSWORD=change-me npm start      # http://localhost:3000, admin at /admin
npm test                                 # end-to-end tests against a fake GitHub API
```

## Docker

```bash
echo "ADMIN_PASSWORD=$(openssl rand -base64 24)" > .env
docker compose up -d --build             # listens on 127.0.0.1:3447
```

| Variable | Default | Notes |
| --- | --- | --- |
| `ADMIN_PASSWORD` | required | The admin password. Changing it signs everyone out. |
| `PUBLIC_URL` | `https://eggactyl.dev` | Used for link previews, passkeys, and to accept admin requests from that origin. |
| `GITHUB_TOKEN` | blank | Optional. Raises GitHub's API limit from 60 to 5,000 requests an hour. |
| `PORT` (compose) | `3447` | Host port, bound to 127.0.0.1 for the Cloudflare tunnel. |
| `SESSION_SECRET` | generated | Kept in the volume as `secret.key` if not set. |

## Passkeys

Add passkeys under **Admin → Security**, then use **Sign in with a passkey** on the login page. They belong to `PUBLIC_URL`'s domain, so they only work on that address. The password keeps working as a fallback.

## Releases from GitHub

Releases come from the repository set in **Admin → Site content → Links** (`ExecSam/Eggactyl-V2`). The egg JSON attached to each release is copied to the volume, so downloads are served from this site.

- **Update automatically on:** the site checks GitHub every 5 minutes to 6 hours (15 by default). New releases appear and the newest becomes the download button's target.
- **Off:** nothing changes until you press **Import from GitHub**, or add a release by hand with the form.

Editing an imported release stops later imports from overwriting it. Deleting one stops it being imported again; the restore link on the Releases page brings deleted ones back.

## Text tokens

Write `{name}` (the site name) or `{repo}` (the repository link) in any site text or doc page.
