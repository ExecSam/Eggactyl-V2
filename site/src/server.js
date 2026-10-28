import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, newId } from './store.js';
import { createAuth, ipKey } from './auth.js';
import { createPasskeys } from './passkeys.js';
import { createSync, parseRepo } from './github.js';
import { VERSION_RE, normVersion, sortReleases, published, latestRelease, setLatest, downloadPath, today } from './releases.js';
import { orderedPages, navTree, validateDocs } from './docs.js';
import { fill, render, renderDoc, plainText, summary } from './markdown.js';
import * as site from './views/public.js';
import * as admin from './views/admin.js';
import { fmtDate } from './views/html.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const ASSET_VERSION = Date.now().toString(36);
const MAX_EGG_BYTES = 2 * 1024 * 1024;

const CONTENT_FIELDS = {
  name: 60, heroLine1: 80, heroLine2: 80, heroIntro: 400,
  storyHeading: 120, storyBody: 8000, storySignature: 120,
  repoUrl: 300, releasesUrl: 300, licence: 40, minPanelVersion: 20, footerNote: 200,
};
const URL_FIELDS = new Set(['repoUrl', 'releasesUrl']);
const INTERVALS = [5, 15, 30, 60, 360];

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const lf = s => String(s ?? '').replace(/\r\n?/g, '\n');

export function createApp({ dataDir = 'data', password, github = {}, autoSync = true, publicUrl = process.env.PUBLIC_URL } = {}) {
  const store = createStore(dataDir);
  const auth = createAuth(store, password === undefined ? {} : { password });
  const sync = createSync(store, github);
  const passkeys = createPasskeys(store, { publicUrl });
  const { data } = store;
  const publicHost = publicUrl ? new URL(publicUrl).host : null;

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true); // runs behind cloudflared; X-Forwarded-Proto decides the Secure cookie flag

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    });
    next();
  });
  app.use(express.static(publicDir, { maxAge: '7d', index: false }));

  const ctx = () => {
    const c = data.content;
    const repo = c.repoUrl.trim().replace(/\/+$/, '');
    return {
      name: c.name,
      repo,
      releasesUrl: c.releasesUrl.trim() || (repo ? `${repo}/releases` : ''),
      publicUrl: publicUrl?.replace(/\/+$/, '') ?? '',
      v: ASSET_VERSION,
    };
  };

  // Blocks cross-site form posts and fetches. SameSite cookies already do most of this; this is the second lock.
  const sameOrigin = req => {
    if (req.get('sec-fetch-site') === 'cross-site') return false;
    const origin = req.get('origin');
    if (!origin) return true;
    let host;
    try { host = new URL(origin).host; } catch { return false; }
    return [req.get('host'), req.get('x-forwarded-host'), publicHost].includes(host);
  };

  const clientIp = req => ipKey(req.get('cf-connecting-ip') || req.ip);
  const isAdmin = req => auth.verify(req);
  const sendHtml = (res, page, status = 200) => res.status(status).type('html').send(String(page));
  const notFound = (req, res) => sendHtml(res, site.notFoundPage({ ctx: ctx() }), 404);

  const changelogPage = () => data.docs.pages.find(p => p.kind === 'changelog' && p.published);
  const releaseHref = r => downloadPath(r) ?? r.file?.remoteUrl ?? r.htmlUrl ?? null;

  // ------------------------------------------------------------------ public site

  app.get('/', (req, res) => {
    const updates = published(data.releases).slice(0, 3);
    const cl = changelogPage();
    sendHtml(res, site.homePage({
      ctx: ctx(),
      c: data.content,
      latest: latestRelease(data.releases),
      updates,
      summaries: Object.fromEntries(updates.map(r => [r.id, summary(r.notes)])),
      changelogHref: cl ? `/docs/${cl.slug}` : null,
    }));
  });

  app.get('/docs', (req, res) => {
    const first = orderedPages(data.docs)[0];
    first ? res.redirect(302, `/docs/${first.slug}`) : notFound(req, res);
  });

  app.get('/docs/:slug', (req, res) => {
    const page = data.docs.pages.find(p => p.slug === req.params.slug);
    if (!page || (!page.published && !isAdmin(req))) return notFound(req, res);
    const c = ctx();
    const pages = orderedPages(data.docs);
    const i = pages.indexOf(page);
    if (!page.published) res.set('Cache-Control', 'no-store');
    sendHtml(res, site.docPage({
      ctx: c,
      c: data.content,
      nav: navTree(data.docs),
      page,
      sectionTitle: data.docs.sections.find(s => s.id === page.sectionId)?.title ?? '',
      description: summary(fill(page.body, c)) || `${page.title}: ${c.name} documentation.`,
      bodyHtml: renderDoc(page.body, c),
      prev: i > 0 ? pages[i - 1] : null,
      next: i >= 0 && i < pages.length - 1 ? pages[i + 1] : null,
      changelog: page.kind === 'changelog' ? published(data.releases) : null,
      searchIndex: pages.map(p => ({
        t: p.title, s: p.slug,
        g: data.docs.sections.find(s => s.id === p.sectionId)?.title ?? '',
        x: plainText(p.body, c).slice(0, 6000),
      })),
    }));
  });

  app.get('/download/latest', (req, res) => {
    const r = latestRelease(data.releases);
    const href = r && releaseHref(r);
    if (!href) return notFound(req, res);
    res.set('Cache-Control', 'no-store').redirect(302, href);
  });

  app.get('/download/:version/:file', (req, res) => {
    const version = normVersion(req.params.version);
    const r = data.releases.find(x => x.version === version);
    if (!r || !r.file || r.file.name !== req.params.file || (r.status !== 'published' && !isAdmin(req))) return notFound(req, res);
    if (!r.file.stored) return r.file.remoteUrl ? res.redirect(302, r.file.remoteUrl) : notFound(req, res);
    res.set('Cache-Control', 'public, max-age=300');
    res.attachment(r.file.name);
    res.type('application/json');
    res.sendFile(path.join(store.filesDir, r.file.stored), err => {
      if (err && !res.headersSent) notFound(req, res);
    });
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // ------------------------------------------------------------------ admin pages

  const requireAdmin = (req, res, next) => {
    if (isAdmin(req)) return next();
    if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'You were signed out. Sign in again to continue.' });
    res.redirect(302, `/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
  };
  const safeNext = n => (typeof n === 'string' && /^\/admin\/[a-z]+$/.test(n) ? n : '/admin/releases');
  const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };

  app.use('/admin', noStore);
  app.get('/admin', (req, res) => res.redirect(302, isAdmin(req) ? '/admin/releases' : '/admin/login'));

  app.get('/admin/login', (req, res) => {
    if (isAdmin(req)) return res.redirect(302, safeNext(req.query.next));
    sendHtml(res, admin.loginPage({ ctx: ctx(), next: safeNext(req.query.next), enabled: auth.enabled, passkeys: passkeys.any }));
  });

  app.post('/admin/login', express.urlencoded({ extended: false, limit: '8kb' }), (req, res) => {
    const page = (error, status) => sendHtml(res, admin.loginPage({ ctx: ctx(), error, next: safeNext(req.body?.next), enabled: auth.enabled, passkeys: passkeys.any }), status);
    if (!auth.enabled) return page('', 503);
    if (!sameOrigin(req)) return page('That sign-in came from another site, so it was blocked.', 403);
    const ip = clientIp(req);
    if (auth.locked(ip)) return page('Too many wrong passwords. Try again in 15 minutes.', 429);
    if (!auth.check(String(req.body?.password ?? ''))) {
      auth.failed(ip);
      return page("That password isn't right.", 401);
    }
    auth.succeeded(ip);
    auth.issue(res, req.secure);
    res.redirect(303, safeNext(req.body?.next));
  });

  // Passkey sign-in: the page fetches a challenge, the browser signs it, and a good signature gets the usual session cookie.
  const passkeyGate = (req, res, next) => {
    if (!auth.enabled || !passkeys.any) return res.status(404).json({ error: 'Passkey sign-in is not set up.' });
    if (!sameOrigin(req) || !req.is('application/json')) return res.status(403).json({ error: 'That sign-in came from another site, so it was blocked.' });
    if (auth.locked(clientIp(req))) return res.status(429).json({ error: 'Too many failed sign-ins. Try again in 15 minutes.' });
    next();
  };

  app.post('/admin/passkey/options', passkeyGate, async (req, res) => res.json(await passkeys.authenticationOptions(req)));

  app.post('/admin/passkey/verify', passkeyGate, express.json({ limit: '16kb' }), async (req, res) => {
    const ip = clientIp(req);
    if (!(await passkeys.authenticate(req, req.body?.response))) {
      auth.failed(ip);
      return res.status(401).json({ error: "That passkey didn't work. Try again, or use the password." });
    }
    auth.succeeded(ip);
    auth.issue(res, req.secure);
    res.json({ next: safeNext(req.body?.next) });
  });

  app.post('/admin/logout', (req, res) => {
    if (sameOrigin(req)) auth.clear(res);
    res.redirect(303, '/admin/login');
  });

  app.get('/admin/releases', requireAdmin, (req, res) => sendHtml(res, admin.releasesPage({ ctx: ctx(), data: adminState() })));
  app.get('/admin/docs', requireAdmin, (req, res) => sendHtml(res, admin.docsPage({ ctx: ctx(), data: { docs: data.docs } })));
  app.get('/admin/security', requireAdmin, (req, res) => sendHtml(res, admin.securityPage({ ctx: ctx(), data: { passkeys: passkeys.list() } })));
  app.get('/admin/content', requireAdmin, (req, res) => sendHtml(res, admin.contentPage({
    ctx: ctx(), c: data.content, savedAt: data.content.updatedAt ? `Last saved ${fmtDate(data.content.updatedAt)}` : 'Not edited yet',
  })));

  function adminState() {
    const latest = latestRelease(data.releases);
    return {
      sync: {
        auto: data.sync.auto,
        intervalMinutes: data.sync.intervalMinutes,
        lastRunAt: data.sync.lastRunAt,
        lastResult: data.sync.lastResult,
        repo: parseRepo(data.content.repoUrl),
        ignoredCount: data.sync.ignored.length,
      },
      releases: sortReleases(data.releases).map(r => ({ ...r, isLatest: latest?.id === r.id, href: releaseHref(r) })),
    };
  }

  // ------------------------------------------------------------------ admin API

  const api = express.Router();
  api.use(requireAdmin, noStore);
  api.use((req, res, next) => {
    if (req.method === 'GET') return next();
    if (!sameOrigin(req) || !req.is('application/json')) return res.status(403).json({ error: 'Blocked a request that did not come from this admin panel.' });
    next();
  });
  api.use(express.json({ limit: '4mb' }));

  api.get('/state', (req, res) => res.json({ ...adminState(), docs: data.docs, content: data.content }));

  // Egg uploads arrive as { name, content } from the browser; they must be valid JSON.
  function parseEggFile(file) {
    if (!file || typeof file.content !== 'string') throw bad('The egg file did not upload.');
    if (Buffer.byteLength(file.content) > MAX_EGG_BYTES) throw bad('The egg file is larger than 2 MB.');
    try { JSON.parse(file.content); } catch { throw bad("The egg file isn't valid JSON."); }
    let name = path.basename(String(file.name ?? '')).replace(/[^\w.-]+/g, '-').slice(0, 100) || 'egg.json';
    if (!/\.json$/i.test(name)) name += '.json';
    return { name, content: file.content };
  }

  function releaseFields(body, self) {
    const version = normVersion(body.version);
    if (!VERSION_RE.test(version)) throw bad('Version should look like 2.1.0.');
    if (data.releases.some(r => r.version === version && r.id !== self?.id)) throw bad(`v${version} already exists.`);
    const date = String(body.date ?? '').trim();
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))) throw bad('Release date is not a valid date.');
    return {
      version,
      date,
      title: String(body.title ?? '').trim().slice(0, 140),
      notes: lf(body.notes).slice(0, 50_000),
    };
  }

  function saveRelease(r, body, isNew) {
    const fields = releaseFields(body, isNew ? null : r);
    const upload = body.file ? parseEggFile(body.file) : null;
    const publish = body.publish === true;
    if (publish && !upload && !r.file) throw bad('Add the egg file before publishing.');
    // Hand edits to an imported release stop later imports from overwriting them.
    if (!isNew && r.source === 'github' && (upload || ['version', 'date', 'title', 'notes'].some(k => (k === 'notes' ? lf(r.notes) : r[k]) !== fields[k]))) r.edited = true;

    Object.assign(r, fields, { status: publish ? 'published' : 'draft', updatedAt: new Date().toISOString() });
    if (publish) {
      r.date ||= today();
      r.title ||= `v${r.version}`;
    }
    if (upload) {
      fs.writeFileSync(path.join(store.filesDir, `${r.id}.json`), upload.content);
      r.file = { name: upload.name, size: Buffer.byteLength(upload.content), stored: `${r.id}.json` };
    }
    if (isNew) data.releases.push(r);
    if (r.status === 'published' && body.latest === true) setLatest(data.releases, r.id);
    else if (r.status !== 'published' || body.latest === false) r.latest = false;
    store.save();
  }

  api.post('/releases', (req, res) => {
    const now = new Date().toISOString();
    const r = { id: newId(), source: 'manual', githubId: null, htmlUrl: null, edited: false, latest: false, file: null, createdAt: now };
    saveRelease(r, req.body ?? {}, true);
    res.status(201).json(adminState());
  });

  const findRelease = req => {
    const r = data.releases.find(x => x.id === req.params.id);
    if (!r) throw bad('That release no longer exists.', 404);
    return r;
  };

  api.put('/releases/:id', (req, res) => {
    saveRelease(findRelease(req), req.body ?? {}, false);
    res.json(adminState());
  });

  api.post('/releases/:id/action', (req, res) => {
    const r = findRelease(req);
    const action = req.body?.action;
    if (action === 'latest') {
      if (r.status !== 'published') throw bad('Publish the release before marking it latest.');
      setLatest(data.releases, r.id);
    } else if (action === 'publish') {
      if (!r.file) throw bad('Add the egg file before publishing.');
      r.status = 'published';
      r.date ||= today();
      r.title ||= `v${r.version}`;
    } else if (action === 'unpublish') {
      r.status = 'draft';
      r.latest = false;
    } else {
      throw bad('Unknown action.');
    }
    r.updatedAt = new Date().toISOString();
    store.save();
    res.json(adminState());
  });

  api.delete('/releases/:id', (req, res) => {
    const r = findRelease(req);
    data.releases.splice(data.releases.indexOf(r), 1);
    if (r.file?.stored) fs.rmSync(path.join(store.filesDir, r.file.stored), { force: true });
    // Deleting a GitHub release here shouldn't bring it straight back on the next import.
    if (r.githubId && !data.sync.ignored.includes(r.githubId)) data.sync.ignored.push(r.githubId);
    store.save();
    res.json(adminState());
  });

  api.post('/sync/run', async (req, res) => {
    const result = await sync.run({ force: true });
    res.json({ result, ...adminState() });
  });

  api.put('/sync', (req, res) => {
    const { auto, intervalMinutes } = req.body ?? {};
    if (auto !== undefined) {
      if (typeof auto !== 'boolean') throw bad('Malformed setting.');
      const turnedOn = auto && !data.sync.auto;
      data.sync.auto = auto;
      if (turnedOn) sync.run().catch(() => {});
    }
    if (intervalMinutes !== undefined) {
      if (!INTERVALS.includes(intervalMinutes)) throw bad('Pick one of the listed intervals.');
      data.sync.intervalMinutes = intervalMinutes;
    }
    store.save();
    res.json(adminState());
  });

  api.post('/sync/restore', async (req, res) => {
    data.sync.ignored = [];
    store.save();
    const result = await sync.run({ force: true });
    res.json({ result, ...adminState() });
  });

  api.put('/docs', (req, res) => {
    data.docs = validateDocs(req.body, data.docs);
    store.save();
    res.json({ docs: data.docs });
  });

  api.post('/preview', (req, res) => {
    const markdown = String(req.body?.markdown ?? '').slice(0, 200_000);
    res.json({ html: req.body?.doc ? renderDoc(markdown, ctx()) : render(markdown, ctx()) });
  });

  api.put('/content', (req, res) => {
    const body = req.body ?? {};
    const next = { ...data.content };
    for (const [key, max] of Object.entries(CONTENT_FIELDS)) {
      if (body[key] === undefined) continue;
      const value = String(body[key]).trim();
      if (value.length > max) throw bad(`${key} is longer than ${max} characters.`);
      if (URL_FIELDS.has(key) && value && !/^https?:\/\/[^\s]+$/i.test(value)) throw bad('Links must start with https://');
      next[key] = value;
    }
    if (!next.name) throw bad('The site needs a name.');
    if (body.showStatusLabels !== undefined) next.showStatusLabels = body.showStatusLabels === true;
    next.updatedAt = new Date().toISOString();
    data.content = next;
    store.save();
    res.json({ content: next });
  });

  api.post('/passkeys/options', async (req, res) => res.json(await passkeys.registrationOptions(req)));

  api.post('/passkeys', async (req, res) => {
    if (!(await passkeys.register(req, req.body?.response, req.body?.name))) throw bad("The passkey couldn't be verified. Try adding it again.");
    res.status(201).json({ passkeys: passkeys.list() });
  });

  api.delete('/passkeys/:id', (req, res) => {
    if (!passkeys.remove(req.params.id)) throw bad('That passkey no longer exists.', 404);
    res.json({ passkeys: passkeys.list() });
  });

  app.use('/api/admin', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use(notFound);

  app.use((err, req, res, next) => {
    let status = err.status || err.statusCode || 500;
    let message = err.message;
    if (err.type === 'entity.too.large') message = 'That upload is too large.';
    else if (err.type === 'entity.parse.failed') message = 'The request was malformed.';
    else if (status >= 500) {
      console.error(err);
      message = 'Something went wrong on the server.';
      status = 500;
    }
    if (res.headersSent) return next(err);
    if (req.originalUrl.startsWith('/api/')) return res.status(status).json({ error: message });
    res.status(status).type('text').send(message);
  });

  if (autoSync) sync.start();
  return { app, store, sync, auth, passkeys };
}
