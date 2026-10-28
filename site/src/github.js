// Pulls releases from GitHub into the site. Runs on a timer when automatic updates are on,
// and on demand from Admin → Releases → Import from GitHub.
import fs from 'node:fs';
import path from 'node:path';
import { newId } from './store.js';
import { VERSION_RE, normVersion, setLatest } from './releases.js';

const MAX_EGG_BYTES = 2 * 1024 * 1024;

export function parseRepo(url) {
  const m = String(url ?? '').trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

// The egg is the release's .json asset (preferring one named egg-*.json).
export function pickAsset(assets = []) {
  const json = assets.filter(a => /\.json$/i.test(a.name));
  return json.find(a => /^egg-/i.test(a.name)) ?? json[0] ?? null;
}

export function createSync(store, opts = {}) {
  const apiBase = (opts.apiBase ?? process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/+$/, '');
  const token = opts.token ?? process.env.GITHUB_TOKEN;
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  let running = null;
  let timer = null;

  const headers = extra => ({
    'User-Agent': 'eggactyl-site',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  });

  const get = (url, extra = {}) => fetchImpl(url, { headers: headers(extra), signal: AbortSignal.timeout(15000) });

  async function apiError(res) {
    if (res.status === 404) return new Error('GitHub says the repository was not found. It must be public (or set GITHUB_TOKEN).');
    if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
      const at = reset ? ` It resets at ${new Date(reset).toISOString().slice(11, 16)} UTC.` : '';
      return new Error(`GitHub's rate limit was reached.${at} Setting GITHUB_TOKEN raises the limit.`);
    }
    return new Error(`GitHub returned HTTP ${res.status}.`);
  }

  // Keep a copy of the egg so downloads don't depend on GitHub. If that fails, downloads redirect to GitHub instead.
  async function mirror(release, asset) {
    const file = { name: asset.name, size: asset.size, stored: null, remoteUrl: asset.browser_download_url, assetId: asset.id, assetUpdatedAt: asset.updated_at };
    try {
      const res = await fetchImpl(asset.browser_download_url, { headers: { 'User-Agent': 'eggactyl-site' }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (Buffer.byteLength(text) > MAX_EGG_BYTES) throw new Error('too large');
      JSON.parse(text);
      fs.writeFileSync(path.join(store.filesDir, `${release.id}.json`), text);
      return { ...file, size: Buffer.byteLength(text), stored: `${release.id}.json` };
    } catch {
      return file;
    }
  }

  async function doRun({ force }) {
    const { data } = store;
    const result = { ok: true, added: [], updated: [], message: '' };
    try {
      const repo = parseRepo(data.content.repoUrl);
      if (!repo) throw new Error('Set Git repository in Site content to a github.com link.');
      const etag = !force && data.sync.etagRepo === repo ? data.sync.etag : null;
      const res = await get(`${apiBase}/repos/${repo}/releases?per_page=30`, etag ? { 'If-None-Match': etag } : {});
      if (res.status !== 304) {
        if (!res.ok) throw await apiError(res);
        const list = await res.json();
        const latestRes = await get(`${apiBase}/repos/${repo}/releases/latest`);
        const latestTag = latestRes.ok ? (await latestRes.json()).tag_name : null;
        const now = new Date().toISOString();
        let incomplete = !latestTag;

        // Oldest first, so if several arrive at once the newest is the one left marked latest.
        for (const gh of [...list].reverse()) {
          const version = normVersion(gh.tag_name);
          if (gh.draft || gh.prerelease || !VERSION_RE.test(version) || data.sync.ignored.includes(gh.id)) continue;
          const asset = pickAsset(gh.assets);
          const fields = {
            title: gh.name || gh.tag_name,
            notes: (gh.body || '').replace(/\r\n?/g, '\n'), // GitHub stores CRLF; textareas send LF back
            date: String(gh.published_at || gh.created_at || '').slice(0, 10),
            htmlUrl: gh.html_url,
          };
          let rel = data.releases.find(r => r.githubId === gh.id) ?? data.releases.find(r => r.version === version);
          // A release deleted and re-created on GitHub under the same tag gets a new id.
          if (rel?.source === 'github' && rel.githubId !== gh.id) rel.githubId = gh.id;
          if (!rel) {
            rel = { id: newId(), version, ...fields, status: 'published', latest: false, source: 'github', githubId: gh.id, edited: false, file: null, createdAt: now, updatedAt: now };
            if (asset) rel.file = await mirror(rel, asset);
            if (asset && !rel.file.stored) incomplete = true;
            if (data.releases.some(r => r.version === version)) continue; // added by hand while we were downloading
            data.releases.push(rel);
            result.added.push(version);
          } else if (rel.source === 'github' && !rel.edited) {
            let changed = false;
            for (const [k, v] of Object.entries(fields)) if (rel[k] !== v) { rel[k] = v; changed = true; }
            if (asset && (!rel.file?.stored || rel.file.assetId !== asset.id || rel.file.assetUpdatedAt !== asset.updated_at)) {
              rel.file = await mirror(rel, asset);
              if (!rel.file.stored) incomplete = true;
              changed = true;
            }
            if (changed) { rel.updatedAt = now; result.updated.push(version); }
          }
        }

        // Follow GitHub's latest whenever it changes. A "Mark as latest" made here stays until it does.
        if (latestTag && latestTag !== data.sync.latestTag) {
          const target = data.releases.find(r => r.version === normVersion(latestTag) && r.status === 'published');
          if (target) {
            setLatest(data.releases, target.id);
            data.sync.latestTag = latestTag;
          }
        }
        // If anything failed this time, skip the ETag so the next run fetches the full list again.
        data.sync.etag = incomplete ? null : res.headers.get('etag');
        data.sync.etagRepo = repo;
      }
      const parts = [];
      if (result.added.length) parts.push(`Added ${result.added.map(v => `v${v}`).join(', ')}`);
      if (result.updated.length) parts.push(`Updated ${result.updated.map(v => `v${v}`).join(', ')}`);
      result.message = parts.join('. ') || 'Up to date';
    } catch (err) {
      result.ok = false;
      result.message = err.name === 'TimeoutError' ? 'GitHub did not respond in time.' : err.message;
    }
    data.sync.lastRunAt = new Date().toISOString();
    data.sync.lastResult = result;
    store.save();
    if (!result.ok || result.added.length || result.updated.length) console.log(`[github] ${result.message}`);
    return result;
  }

  // Concurrent callers share the run in progress.
  function run({ force = false } = {}) {
    running ??= doRun({ force }).finally(() => { running = null; });
    return running;
  }

  return {
    run,
    start() {
      const tick = () => {
        const s = store.data.sync;
        if (!s.auto) return;
        const due = !s.lastRunAt || Date.now() - Date.parse(s.lastRunAt) >= s.intervalMinutes * 60_000;
        if (due) run().catch(() => {});
      };
      setTimeout(tick, 2000).unref();
      timer = setInterval(tick, 60_000);
      timer.unref();
    },
    stop() { clearInterval(timer); },
  };
}
