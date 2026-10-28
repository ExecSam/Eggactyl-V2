// End-to-end tests against a real server and a fake GitHub API. Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';
import { createStore } from '../src/store.js';
import { seed } from '../src/seed.js';
import { ipKey } from '../src/auth.js';
import { compareVersions } from '../src/releases.js';

const PASSWORD = 'correct horse battery staple';
const egg = tag => JSON.stringify({ meta: { version: 'PTDL_v2' }, name: 'Eggactyl V2', tag });

// ---- fake GitHub
const gh = { releases: [], latestTag: null, etag: 'W/"1"', calls: 0 };
const ghRelease = (id, tag, extra = {}) => ({
  id, tag_name: tag, name: `Eggactyl ${tag}`, body: `Notes for ${tag}`, draft: false, prerelease: false,
  published_at: '2026-10-26T16:59:56Z', html_url: `https://github.com/o/r/releases/tag/${tag}`,
  assets: [
    { id: id * 10, name: 'egg-eggactyl-v2.json', size: 10, updated_at: '2026-10-26T17:00:00Z', browser_download_url: `${gh.base}/assets/${tag}/egg-eggactyl-v2.json` },
    { id: id * 10 + 1, name: 'eggactyl.sh', size: 10, updated_at: '2026-10-26T17:00:00Z', browser_download_url: `${gh.base}/assets/${tag}/eggactyl.sh` },
  ],
  ...extra,
});
const ghServer = http.createServer((req, res) => {
  gh.calls++;
  const send = (status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(body === undefined ? '' : JSON.stringify(body)); };
  if (req.url.startsWith('/repos/o/r/releases?')) {
    if (req.headers['if-none-match'] === gh.etag) return send(304);
    return send(200, gh.releases, { ETag: gh.etag });
  }
  if (req.url === '/repos/o/r/releases/latest' && gh.latestFails) return send(502, { message: 'Bad gateway' });
  if (req.url === '/repos/o/r/releases/latest') return gh.latestTag ? send(200, gh.releases.find(r => r.tag_name === gh.latestTag)) : send(404, { message: 'Not Found' });
  if (req.url.startsWith('/repos/missing/repo/')) return send(404, { message: 'Not Found' });
  const asset = req.url.match(/^\/assets\/([^/]+)\/egg-eggactyl-v2\.json$/);
  if (asset) { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(egg(asset[1])); }
  send(404, { message: 'Not Found' });
});

// ---- software passkey: just enough CBOR and WebAuthn to register and sign like a real authenticator
const b64u = b => Buffer.from(b).toString('base64url');
function cbor(v) {
  const head = (major, n) => (n < 24 ? Buffer.from([major << 5 | n]) : n < 256 ? Buffer.from([major << 5 | 24, n]) : Buffer.from([major << 5 | 25, n >> 8, n & 255]));
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') return Buffer.concat([head(3, Buffer.byteLength(v)), Buffer.from(v)]);
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  const entries = v instanceof Map ? [...v] : Object.entries(v);
  return Buffer.concat([head(5, entries.length), ...entries.flatMap(([k, x]) => [cbor(k), cbor(x)])]);
}
function softPasskey(rpId = 'eggactyl.dev', origin = 'https://eggactyl.dev') {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const id = crypto.randomBytes(16);
  const rpHash = crypto.createHash('sha256').update(rpId).digest();
  const clientData = (type, challenge, o = origin) => Buffer.from(JSON.stringify({ type, challenge, origin: o, crossOrigin: false }));
  const credential = response => ({ id: b64u(id), rawId: b64u(id), type: 'public-key', clientExtensionResults: {}, response });
  let count = 0;
  return {
    register(options) {
      const cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
      const authData = Buffer.concat([rpHash, Buffer.from([0x45, 0, 0, 0, 0]), Buffer.alloc(16), Buffer.from([0, id.length]), id, cose]);
      return credential({ clientDataJSON: b64u(clientData('webauthn.create', options.challenge)), attestationObject: b64u(cbor({ fmt: 'none', attStmt: {}, authData })), transports: ['internal'] });
    },
    sign(options, o) {
      const counter = Buffer.alloc(4);
      counter.writeUInt32BE(++count);
      const authData = Buffer.concat([rpHash, Buffer.from([0x05]), counter]);
      const cd = clientData('webauthn.get', options.challenge, o);
      const signature = crypto.sign('sha256', Buffer.concat([authData, crypto.createHash('sha256').update(cd).digest()]), privateKey);
      return credential({ clientDataJSON: b64u(cd), authenticatorData: b64u(authData), signature: b64u(signature), userHandle: b64u('eggactyl-admin') });
    },
  };
}

let base, server, app, dataDir, cookie;

before(async () => {
  await new Promise(r => ghServer.listen(0, '127.0.0.1', r));
  gh.base = `http://127.0.0.1:${ghServer.address().port}`;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'egg-site-'));
  app = createApp({ dataDir, password: PASSWORD, autoSync: false, github: { apiBase: gh.base, token: '' }, publicUrl: 'https://eggactyl.dev' });
  app.store.data.content.repoUrl = 'https://github.com/o/r';
  server = await new Promise(r => { const s = app.app.listen(0, '127.0.0.1', () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  ghServer.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const get = (p, opts = {}) => fetch(base + p, { redirect: 'manual', ...opts });
const text = async p => (await get(p)).text();
const login = (password, ip = '10.0.0.1') => fetch(`${base}/admin/login`, {
  method: 'POST', redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': ip, Origin: base },
  body: new URLSearchParams({ password, next: '/admin/docs' }),
});
async function api(method, p, body, headers = {}) {
  const res = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: base, ...headers },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

test('home page renders the seeded content before any release exists', async () => {
  const html = await text('/');
  assert.match(html, /<title>Eggactyl V2 – One egg\. Every server\.<\/title>/);
  assert.match(html, /Why Eggactyl V2 exists/);
  assert.match(html, /No release has been published yet/);
  assert.doesNotMatch(html, /\{name\}/);
});

test('docs redirect to the first page and render markdown', async () => {
  const res = await get('/docs');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/docs/introduction');
  const html = await text('/docs/installation');
  assert.match(html, /<h1 class="doc-title">Installation<\/h1>/);
  assert.match(html, /class="codeblock"/);
  assert.match(html, /curl -LO https:\/\/github\.com\/o\/r\/releases\/latest/);
  assert.equal((await get('/docs/nope')).status, 404);
});

test('admin pages and API need a session', async () => {
  const res = await get('/admin/releases');
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /^\/admin\/login\?next=/);
  assert.equal((await get('/api/admin/state')).status, 401);
});

test('a wrong password is refused and repeated failures lock the IP out', async () => {
  assert.equal((await login('wrong', '10.9.9.9')).status, 401);
  for (let i = 0; i < 9; i++) await login('wrong', '10.9.9.9');
  assert.equal((await login(PASSWORD, '10.9.9.9')).status, 429, 'locked even with the right password');
  assert.equal((await login(PASSWORD, '10.9.9.8')).status, 303, 'other IPs are unaffected');
});

test('signing in sets an HttpOnly session cookie and honours next', async () => {
  const res = await login(PASSWORD);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/admin/docs');
  const set = res.headers.get('set-cookie');
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=Lax/i);
  cookie = set.split(';')[0];
  assert.equal((await get('/admin/releases', { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await get('/admin/login?next=https://evil.example', { headers: { Cookie: cookie } })).headers.get('location'), '/admin/releases');
});

test('a forged cookie is rejected', async () => {
  const [payload] = cookie.split('=')[1].split('.');
  const forged = `egg_admin=${payload}.AAAA`;
  assert.equal((await fetch(`${base}/api/admin/state`, { headers: { Cookie: forged } })).status, 401);
});

test('cross-site and non-JSON writes are blocked', async () => {
  assert.equal((await api('PUT', '/api/admin/content', { name: 'Evil' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await api('PUT', '/api/admin/content', { name: 'Evil' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const form = await fetch(`${base}/api/admin/content`, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'text/plain' }, body: '{"name":"Evil"}' });
  assert.equal(form.status, 403);
  assert.equal(app.store.data.content.name, 'Eggactyl V2');
});

test('passkeys: register, sign in, replays and removal', async () => {
  const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) });
  const loginOptions = async () => (await post('/admin/passkey/options', {})).json();
  assert.doesNotMatch(await text('/admin/login'), /passkey/i, 'no passkey button until one is registered');
  assert.equal((await post('/admin/passkey/options', {})).status, 404);

  const key = softPasskey();
  let res = await api('POST', '/api/admin/passkeys/options');
  assert.equal(res.status, 200);
  assert.equal(res.json.rp.id, 'eggactyl.dev');
  assert.equal(res.json.authenticatorSelection.residentKey, 'required');
  assert.equal((await api('POST', '/api/admin/passkeys/options', {}, { Cookie: '' })).status, 401);
  const registration = key.register(res.json);
  res = await api('POST', '/api/admin/passkeys', { name: 'Test laptop', response: registration });
  assert.equal(res.status, 201);
  assert.deepEqual(res.json.passkeys.map(p => p.name), ['Test laptop']);
  assert.equal(res.json.passkeys[0].publicKey, undefined, 'key material stays on the server');
  assert.equal((await api('POST', '/api/admin/passkeys', { response: registration })).status, 400, 'a registration challenge works once');
  assert.match(await (await get('/admin/security', { headers: { Cookie: cookie } })).text(), /Test laptop/);

  assert.match(await text('/admin/login'), /Sign in with a passkey/);
  assert.equal((await post('/admin/passkey/options', {}, { Origin: 'https://evil.example' })).status, 403);

  const options = await loginOptions();
  assert.equal(options.userVerification, 'required');
  const assertion = key.sign(options);
  res = await post('/admin/passkey/verify', { response: assertion, next: '/admin/security' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { next: '/admin/security' });
  const session = res.headers.get('set-cookie').split(';')[0];
  assert.equal((await get('/admin/security', { headers: { Cookie: session } })).status, 200);
  assert.ok(app.store.data.passkeys[0].lastUsedAt);
  assert.equal(app.store.data.passkeys[0].counter, 1);

  assert.equal((await post('/admin/passkey/verify', { response: assertion })).status, 401, 'an assertion cannot be replayed');
  const phished = key.sign(await loginOptions(), 'https://evil.example');
  assert.equal((await post('/admin/passkey/verify', { response: phished })).status, 401, 'a signature made for another site is refused');
  const stranger = softPasskey().sign(await loginOptions());
  assert.equal((await post('/admin/passkey/verify', { response: stranger })).status, 401, 'an unregistered passkey is refused');
  assert.equal((await post('/admin/passkey/verify', { response: 'junk' })).status, 401);

  res = await api('DELETE', `/api/admin/passkeys/${encodeURIComponent(registration.id)}`);
  assert.deepEqual(res.json.passkeys, []);
  assert.equal((await api('DELETE', `/api/admin/passkeys/${encodeURIComponent(registration.id)}`)).status, 404);
  assert.equal((await post('/admin/passkey/options', {})).status, 404);
});

test('an older db is upgraded, keeping anything edited', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egg-site-'));
  const old = seed();
  old.schema = 1;
  delete old.passkeys;
  old.content.footerNote = 'Made by ExecSam. Not affiliated with Pterodactyl or the original Eggactyl project.';
  Object.assign(old.docs.pages.find(p => p.slug === 'getting-help'), { title: 'Contributing', slug: 'contributing', body: 'Edited by hand.' });
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify(old));
  const { data } = createStore(dir);
  assert.equal(data.schema, 2);
  assert.deepEqual(data.passkeys, []);
  assert.equal(data.content.footerNote, 'Made with ❤️ by [Rifts](https://rifts.cc)');
  assert.equal(data.docs.pages.find(p => p.slug === 'contributing')?.body, 'Edited by hand.');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('GitHub import adds releases, mirrors the egg and marks the latest', async () => {
  gh.releases = [ghRelease(2, 'v2.0.2'), ghRelease(1, 'v2.0.0'), ghRelease(3, 'v2.1.0-rc1', { prerelease: true })];
  gh.latestTag = 'v2.0.2';
  const { status, json } = await api('POST', '/api/admin/sync/run');
  assert.equal(status, 200);
  assert.equal(json.result.ok, true);
  assert.deepEqual(json.result.added.sort(), ['2.0.0', '2.0.2']);
  assert.deepEqual(json.releases.map(r => r.version), ['2.0.2', '2.0.0'], 'prereleases are skipped, newest first');
  assert.equal(json.releases[0].isLatest, true);
  assert.ok(json.releases[0].file.stored, 'egg mirrored locally');

  const home = await text('/');
  assert.match(home, /Pterodactyl multi-egg · v2\.0\.2/);
  const latest = await get('/download/latest');
  assert.equal(latest.status, 302);
  assert.equal(latest.headers.get('location'), '/download/v2.0.2/egg-eggactyl-v2.json');
  const file = await get('/download/v2.0.2/egg-eggactyl-v2.json');
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-disposition'), /attachment; filename="egg-eggactyl-v2\.json"/);
  assert.equal(JSON.parse(await file.text()).tag, 'v2.0.2');
});

test('an unchanged GitHub release list is a cheap no-op', async () => {
  const { json } = await api('POST', '/api/admin/sync/run');
  assert.equal(json.result.message, 'Up to date');
  // A forced manual run skips the ETag, so this exercised the full list; now check the conditional path directly.
  const before = gh.calls;
  const result = await app.sync.run();
  assert.equal(result.message, 'Up to date');
  assert.equal(gh.calls - before, 1, 'only the list was requested (304)');
});

test('a new GitHub release is picked up and becomes latest', async () => {
  gh.releases.unshift(ghRelease(4, 'v2.0.3'));
  gh.latestTag = 'v2.0.3';
  gh.etag = 'W/"2"';
  const result = await app.sync.run();
  assert.deepEqual(result.added, ['2.0.3']);
  assert.match(await text('/'), /v2\.0\.3/);
  assert.equal((await get('/download/latest')).headers.get('location'), '/download/v2.0.3/egg-eggactyl-v2.json');
});

test('hand edits to an imported release survive later imports', async () => {
  const { json: state } = await api('GET', '/api/admin/state');
  const r = state.releases.find(x => x.version === '2.0.3');
  const edit = await api('PUT', `/api/admin/releases/${r.id}`, { version: '2.0.3', date: r.date, title: 'Faster installs', notes: 'Hand-written notes.', publish: true, latest: true });
  assert.equal(edit.status, 200);
  gh.releases[0] = { ...gh.releases[0], name: 'Changed upstream' };
  gh.etag = 'W/"3"';
  await app.sync.run();
  const after = app.store.data.releases.find(x => x.version === '2.0.3');
  assert.equal(after.title, 'Faster installs');
  assert.equal(after.edited, true);
});

test('deleting an imported release keeps it deleted until restored', async () => {
  const r = app.store.data.releases.find(x => x.version === '2.0.0');
  const del = await api('DELETE', `/api/admin/releases/${r.id}`);
  assert.equal(del.status, 200);
  assert.equal(del.json.sync.ignoredCount, 1);
  await api('POST', '/api/admin/sync/run');
  assert.ok(!app.store.data.releases.some(x => x.version === '2.0.0'), 'not re-imported');
  assert.equal((await get('/download/v2.0.0/egg-eggactyl-v2.json')).status, 404);
  const restored = await api('POST', '/api/admin/sync/restore');
  assert.deepEqual(restored.json.result.added, ['2.0.0']);
});

test('manual releases: validation, publishing, latest and downloads', async () => {
  let res = await api('POST', '/api/admin/releases', { version: 'banana', publish: false });
  assert.equal(res.status, 400);
  res = await api('POST', '/api/admin/releases', { version: '2.0.2', publish: false });
  assert.equal(res.status, 400, 'duplicate version');
  assert.match(res.json.error, /already exists/);
  res = await api('POST', '/api/admin/releases', { version: '3.0.0', publish: true });
  assert.equal(res.status, 400);
  assert.match(res.json.error, /egg file/);
  res = await api('POST', '/api/admin/releases', { version: '3.0.0', publish: true, file: { name: 'egg.json', content: '{not json' } });
  assert.equal(res.status, 400);

  res = await api('POST', '/api/admin/releases', { version: 'v3.0.0', title: 'Draft one', publish: false, latest: true, file: { name: '../../evil name.json', content: egg('v3.0.0') } });
  assert.equal(res.status, 201);
  const draft = res.json.releases.find(r => r.version === '3.0.0');
  assert.equal(draft.status, 'draft');
  assert.equal(draft.isLatest, false, 'drafts are never latest');
  assert.equal(draft.file.name, 'evil-name.json', 'file name is sanitised');
  assert.equal((await get('/download/v3.0.0/evil-name.json')).status, 404, 'drafts are not public');
  assert.equal((await get('/download/v3.0.0/evil-name.json', { headers: { Cookie: cookie } })).status, 200, 'admins can fetch drafts');

  res = await api('PUT', `/api/admin/releases/${draft.id}`, { version: '3.0.0', title: '', notes: 'Big one.', publish: true, latest: true });
  assert.equal(res.status, 200);
  const live = res.json.releases.find(r => r.version === '3.0.0');
  assert.equal(live.status, 'published');
  assert.equal(live.isLatest, true);
  assert.equal(live.title, 'v3.0.0', 'title defaults to the version');
  assert.match(live.date, /^\d{4}-\d{2}-\d{2}$/, 'date defaults to today');
  assert.equal((await get('/download/latest')).headers.get('location'), '/download/v3.0.0/evil-name.json');

  res = await api('POST', `/api/admin/releases/${live.id}/action`, { action: 'unpublish' });
  assert.equal(res.json.releases.find(r => r.version === '3.0.0').status, 'draft');
  assert.equal((await get('/download/latest')).headers.get('location'), '/download/v2.0.3/egg-eggactyl-v2.json', 'falls back to the newest published release');
  res = await api('POST', `/api/admin/releases/${live.id}/action`, { action: 'latest' });
  assert.equal(res.status, 400);
});

test('site content: rename, links and validation', async () => {
  let res = await api('PUT', '/api/admin/content', { name: 'Eggactyl Remastered', heroLine1: 'Hatched.', storyHeading: 'Why {name} exists' });
  assert.equal(res.status, 200);
  const home = await text('/');
  assert.match(home, /Why Eggactyl Remastered exists/);
  assert.match(home, /Hatched\./);
  assert.match(await text('/docs/introduction'), /Eggactyl Remastered is a single Pterodactyl egg/);
  res = await api('PUT', '/api/admin/content', { name: '   ' });
  assert.equal(res.status, 400);
  res = await api('PUT', '/api/admin/content', { repoUrl: 'javascript:alert(1)' });
  assert.equal(res.status, 400);
  res = await api('PUT', '/api/admin/content', { heroLine1: '<script>alert(1)</script>' });
  assert.equal(res.status, 200);
  assert.doesNotMatch(await text('/'), /<script>alert\(1\)/, 'text is escaped');
  await api('PUT', '/api/admin/content', { name: 'Eggactyl V2', heroLine1: 'One egg.' });
});

test('markdown cannot inject HTML or script links', async () => {
  const { json } = await api('POST', '/api/admin/preview', { markdown: '<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1)) eggactyl.cloud' });
  assert.doesNotMatch(json.html, /<img/);
  assert.doesNotMatch(json.html, /href="javascript/);
  assert.doesNotMatch(json.html, /href="http:\/\/eggactyl\.cloud/, 'bare domains are not linked');
});

test('docs: save, drafts, slugs and ordering', async () => {
  const { json: state } = await api('GET', '/api/admin/state');
  const docs = structuredClone(state.docs);
  const changelog = docs.pages.find(p => p.kind === 'changelog');
  docs.pages.unshift({ id: 'pnew', sectionId: 'help', title: 'Hidden page', slug: '/docs/Hidden Page!', body: '# Hidden page\n\nSecret draft.', published: false, kind: 'changelog' });
  let res = await api('PUT', '/api/admin/docs', docs);
  assert.equal(res.status, 200);
  const saved = res.json.docs.pages.find(p => p.id === 'pnew');
  assert.equal(saved.slug, 'hidden-page');
  assert.equal(saved.kind, 'page', 'only the seeded changelog page can list releases');
  assert.equal(res.json.docs.pages.find(p => p.id === changelog.id).kind, 'changelog');
  assert.equal(res.json.docs.pages.at(-1).sectionId, 'help', 'pages stay grouped by section order');

  assert.equal((await get('/docs/hidden-page')).status, 404, 'drafts are hidden from the public');
  const asAdmin = await (await get('/docs/hidden-page', { headers: { Cookie: cookie } })).text();
  assert.match(asAdmin, /Secret draft/);
  assert.doesNotMatch(asAdmin, /<h2[^>]*>Hidden page/, 'leading # title is not repeated');

  const dup = structuredClone(res.json.docs);
  dup.pages[0].slug = dup.pages[1].slug;
  res = await api('PUT', '/api/admin/docs', dup);
  assert.equal(res.status, 400);
  assert.match(res.json.error, /same URL|use the URL/);

  const bad = structuredClone(state.docs);
  bad.pages[0].sectionId = 'gone';
  assert.equal((await api('PUT', '/api/admin/docs', bad)).status, 400);
});

test('changelog page lists published releases', async () => {
  const html = await text('/docs/changelog');
  assert.match(html, /id="v2-0-3"/);
  assert.match(html, /Hand-written notes\./);
  assert.doesNotMatch(html, /id="v3-0-0"/, 'drafts are not listed');
});

test('sync settings: toggle and interval validation', async () => {
  let res = await api('PUT', '/api/admin/sync', { auto: false, intervalMinutes: 60 });
  assert.equal(res.status, 200);
  assert.equal(res.json.sync.auto, false);
  assert.equal(res.json.sync.intervalMinutes, 60);
  res = await api('PUT', '/api/admin/sync', { intervalMinutes: 1 });
  assert.equal(res.status, 400);
  res = await api('PUT', '/api/admin/sync', { auto: 'yes' });
  assert.equal(res.status, 400);
});

test('a GitHub error is reported, not thrown', async () => {
  await api('PUT', '/api/admin/content', { repoUrl: 'https://github.com/missing/repo' });
  const { json } = await api('POST', '/api/admin/sync/run');
  assert.equal(json.result.ok, false);
  assert.match(json.result.message, /not found/i);
  await api('PUT', '/api/admin/content', { repoUrl: 'https://gitlab.com/o/r' });
  const r2 = await api('POST', '/api/admin/sync/run');
  assert.match(r2.json.result.message, /github\.com link/);
  await api('PUT', '/api/admin/content', { repoUrl: 'https://github.com/o/r' });
});

test('GitHub latest is followed even after a failed latest lookup', async () => {
  const r202 = app.store.data.releases.find(x => x.version === '2.0.2');
  await api('POST', `/api/admin/releases/${r202.id}/action`, { action: 'latest' });
  gh.releases.unshift(ghRelease(5, 'v2.0.4'));
  gh.latestTag = 'v2.0.4';
  gh.etag = 'W/"5"';
  gh.latestFails = true;
  let result = await app.sync.run();
  assert.deepEqual(result.added, ['2.0.4']);
  assert.equal((await get('/download/latest')).headers.get('location'), '/download/v2.0.2/egg-eggactyl-v2.json', 'manual pick stays while GitHub is unknown');
  gh.latestFails = false;
  result = await app.sync.run(); // not forced: the failed run must not have saved the ETag
  assert.equal((await get('/download/latest')).headers.get('location'), '/download/v2.0.4/egg-eggactyl-v2.json');
});

test('saving an imported release unchanged does not mark it edited', async () => {
  gh.releases[0] = { ...gh.releases[0], body: 'Line one\r\nLine two' };
  gh.etag = 'W/"6"';
  await app.sync.run();
  const r = app.store.data.releases.find(x => x.version === '2.0.4');
  assert.equal(r.notes, 'Line one\nLine two');
  const res = await api('PUT', `/api/admin/releases/${r.id}`, { version: '2.0.4', date: r.date, title: r.title, notes: 'Line one\r\nLine two', publish: true, latest: true });
  assert.equal(res.status, 200);
  assert.equal(app.store.data.releases.find(x => x.version === '2.0.4').edited, false);
});

test('a release re-created on GitHub keeps syncing under its new id', async () => {
  gh.releases[0] = { ...gh.releases[0], id: 55, name: 'Re-made' };
  gh.etag = 'W/"7"';
  await app.sync.run();
  const rows = app.store.data.releases.filter(x => x.version === '2.0.4');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].githubId, 55);
  assert.equal(rows[0].title, 'Re-made');
});

test('odd cookies, IPv6 keys, prerelease order and table alignment', async () => {
  assert.equal((await get('/admin/login', { headers: { Cookie: 'other=%E0%A4%A; x=100%' } })).status, 200);
  assert.equal((await get('/api/admin/state', { headers: { Cookie: `${cookie}; other=%E0%A4%A` } })).status, 200);
  assert.equal(ipKey('2001:db8:1:2:3:4:5:6'), '2001:db8:1:2::/64');
  assert.equal(ipKey('2001:DB8::1'), '2001:db8:0:0::/64');
  assert.equal(ipKey('::ffff:10.0.0.1'), '10.0.0.1');
  assert.equal(ipKey('203.0.113.9'), '203.0.113.9');
  assert.ok(compareVersions('2.1.0-rc.10', '2.1.0-rc.9') > 0);
  assert.ok(compareVersions('2.1.0', '2.1.0-rc.10') > 0);
  const { json } = await api('POST', '/api/admin/preview', { markdown: '| a | b |\n| :-: | --: |\n| 1 | 2 |' });
  assert.match(json.html, /class="ta-center"/);
  assert.doesNotMatch(json.html, /style=/);
});

test('a missing egg file gives a 404 page, not a server path', async () => {
  const r = app.store.data.releases.find(x => x.version === '2.0.2');
  fs.rmSync(path.join(app.store.filesDir, r.file.stored));
  const res = await get('/download/v2.0.2/egg-eggactyl-v2.json');
  assert.equal(res.status, 404);
  assert.doesNotMatch(await res.text(), /ENOENT/);
});

test('data survives a restart', async () => {
  const again = createApp({ dataDir, password: PASSWORD, autoSync: false, github: { apiBase: gh.base } });
  assert.equal(again.store.data.releases.length, app.store.data.releases.length);
  assert.ok(again.store.data.docs.pages.some(p => p.id === 'pnew'));
  assert.equal(again.store.data.sync.auto, false);
});

test('signing out clears the cookie', async () => {
  const res = await fetch(`${base}/admin/logout`, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, Origin: base } });
  assert.equal(res.status, 303);
  assert.match(res.headers.get('set-cookie'), /egg_admin=;/);
});

test('security headers are set', async () => {
  const res = await get('/');
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('link previews, footer credit and user-facing docs', async () => {
  const home = await text('/');
  assert.match(home, /<meta property="og:image" content="https:\/\/eggactyl\.dev\/og\.png">/);
  assert.match(home, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(home, /<link rel="canonical" href="https:\/\/eggactyl\.dev\/">/);
  assert.match(home, /Made with ❤️ by <a href="https:\/\/rifts\.cc">Rifts<\/a>/);
  assert.match(home, /Download egg/);
  assert.doesNotMatch(home, /ExecSam\. Not affiliated|Download \.json/);
  assert.match(await text('/docs/installation'), /<meta property="og:description" content="Get Eggactyl V2 into your panel and create your first server\. It takes about five minutes\.">/);
  const help = await text('/docs/getting-help');
  assert.match(help, /Reporting a problem/);
  assert.doesNotMatch(help, /build\.py|git tag|Shipping a release/);
  assert.equal((await get('/og.png')).headers.get('content-type'), 'image/png');
});
