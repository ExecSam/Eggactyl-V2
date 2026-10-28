import { html, raw, icon, jsonScript } from './html.js';
import { document, eggMark } from './public.js';

const NAV = [
  { key: 'releases', href: '/admin/releases', label: 'Releases', icon: 'package' },
  { key: 'docs', href: '/admin/docs', label: 'Docs', icon: 'book' },
  { key: 'content', href: '/admin/content', label: 'Site content', icon: 'pencil' },
  { key: 'security', href: '/admin/security', label: 'Security', icon: 'key' },
];

function adminLayout({ ctx, active, title, body, data, scripts = [] }) {
  const page = html`<div class="admin">
<aside class="admin-side">
<div class="admin-brand">${eggMark('egg-mark-sm')}<span class="brand-name">${ctx.name}</span><span class="chip chip-sm">Admin</span></div>
<nav aria-label="Admin" class="admin-nav">
${NAV.map(n => html`<a class="nav-item" href="${n.href}"${n.key === active ? raw(' aria-current="page"') : ''}>${icon(n.icon)}${n.label}</a>`)}
</nav>
<div class="admin-side-foot">
<a class="nav-item" href="/" target="_blank" rel="noopener">${icon('arrowUpRight')}View live site</a>
<div class="user-card">
<span class="avatar" aria-hidden="true">${icon('user', 17)}</span>
<div class="user-text"><span class="user-name">Admin</span><span class="user-role">Owner</span></div>
<form method="post" action="/admin/logout"><button class="icon-btn" type="submit" aria-label="Sign out">${icon('logout')}</button></form>
</div>
</div>
</aside>
<main id="main" class="admin-main" data-page="${active}">
${body}
</main>
</div>
<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
${jsonScript('page-data', data)}`;
  return document({ ctx, title: `${title} – ${ctx.name} admin`, bodyClass: 'admin-body', body: page, scripts: [...scripts, '/js/admin.js'] });
}

const field = (id, label, input, extra = '') => html`<div class="field ${extra}"><label for="${id}">${label}</label>${input}</div>`;

const switchControl = (id, checked = false) => html`<span class="switch"><input type="checkbox" role="switch" id="${id}"${checked ? raw(' checked') : ''}><span class="switch-track" aria-hidden="true"></span><span class="switch-thumb" aria-hidden="true"></span></span>`;

export function releasesPage({ ctx, data }) {
  const body = html`<div class="admin-head">
<div class="admin-head-text">
<h1 class="admin-title">Releases</h1>
<p class="admin-sub">These feed the Updates list and the download button on the home page.</p>
</div>
<button type="button" class="btn btn-ghost" id="sync-now">${icon('git', 17)}<span>Import from GitHub</span></button>
</div>

<section class="panel sync-panel" aria-labelledby="sync-heading">
<div class="sync-top">
<div class="panel-heading">
<h2 id="sync-heading" class="panel-title">GitHub updates</h2>
<p class="panel-sub" id="sync-source"></p>
</div>
<label class="switch-row sync-switch" for="sync-auto">
<span class="switch-text"><span class="switch-label">Update automatically</span><span class="switch-sub">New GitHub releases are added and marked latest on their own.</span></span>
${switchControl('sync-auto')}
</label>
</div>
<div class="sync-bottom">
<div class="inline-field" id="interval-field">
<label for="sync-interval">Check every</label>
<select id="sync-interval" class="input input-sm">
<option value="5">5 minutes</option>
<option value="15">15 minutes</option>
<option value="30">30 minutes</option>
<option value="60">hour</option>
<option value="360">6 hours</option>
</select>
</div>
<p class="sync-status" id="sync-status" aria-live="polite"></p>
<button type="button" class="btn-text" id="sync-restore" hidden></button>
</div>
</section>

<div class="split">
<section class="panel table-panel" aria-labelledby="all-releases">
<div class="panel-bar">
<h2 id="all-releases" class="panel-title">All releases</h2>
<span class="muted-sm">Newest first</span>
</div>
<div class="table-scroll">
<table class="table">
<thead>
<tr>
<th scope="col" class="col-version">Version</th>
<th scope="col">Release</th>
<th scope="col">Date</th>
<th scope="col">Status</th>
<th scope="col" class="col-actions"><span class="sr-only">Actions</span></th>
</tr>
</thead>
<tbody id="release-rows"></tbody>
</table>
</div>
</section>

<section class="panel form-panel" aria-labelledby="form-heading">
<form id="release-form" novalidate>
<div class="form-head">
<h2 id="form-heading" class="panel-title">New release</h2>
<button type="button" class="btn-text" id="form-cancel" hidden>Cancel</button>
</div>
<p class="form-note" id="form-note" hidden>Imported from GitHub. Saving your changes stops future imports from overwriting this release.</p>
<div class="row">
${field('rel-version', 'Version', raw('<input id="rel-version" class="input mono" type="text" placeholder="e.g. 2.1.0" autocomplete="off" required>'), 'grow')}
${field('rel-date', 'Release date', raw('<input id="rel-date" class="input" type="date">'), 'grow')}
</div>
${field('rel-title', 'Title', raw('<input id="rel-title" class="input" type="text" placeholder="Short headline for the Updates list" maxlength="140">'))}
${field('rel-notes', 'Release notes', raw('<textarea id="rel-notes" class="input" rows="6" placeholder="What changed? Markdown is supported."></textarea>'))}
<div class="field">
<span class="field-label" id="egg-file-label">Egg file</span>
<label class="dropzone" for="rel-file" id="dropzone">
${icon('upload', 22)}
<span class="dz-main" id="dz-main">Drop the egg JSON here, or <span class="dz-browse">browse</span></span>
<span class="dz-sub" id="dz-sub">Exported from Admin → Nests in your panel</span>
<input id="rel-file" class="sr-only" type="file" accept=".json,application/json" aria-describedby="dz-sub">
</label>
</div>
<label class="switch-row" for="rel-latest">
<span class="switch-text"><span class="switch-label">Mark as latest</span><span class="switch-sub">Points the home page download button at this file</span></span>
${switchControl('rel-latest', true)}
</label>
<p class="form-error" id="form-error" role="alert" hidden></p>
<div class="form-actions">
<button type="button" class="btn btn-ghost grow" id="save-draft">Save draft</button>
<button type="submit" class="btn btn-primary grow-2" id="publish">Publish release</button>
</div>
</form>
</section>
</div>`;
  return adminLayout({ ctx, active: 'releases', title: 'Releases', body, data });
}

export function docsPage({ ctx, data }) {
  const tool = (cmd, label, name, stroke) => html`<button class="icon-btn" type="button" data-cmd="${cmd}" aria-label="${label}">${icon(name, 17, stroke)}</button>`;
  const body = html`<div class="admin-head">
<div class="admin-head-text">
<h1 class="admin-title">Docs</h1>
<p class="admin-sub">Write and organise the documentation pages.</p>
</div>
<div class="head-actions">
<span class="dirty" id="dirty" hidden><span class="dot dot-amber" aria-hidden="true"></span>Unsaved changes</span>
<button type="button" class="btn btn-ghost" id="discard" disabled>Discard</button>
<button type="button" class="btn btn-primary" id="publish-docs" disabled>Publish changes</button>
</div>
</div>

<div class="split split-docs">
<section class="panel tree-panel" aria-labelledby="pages-heading">
<h2 id="pages-heading" class="panel-title tree-title">Pages</h2>
<p class="sr-only" id="tree-help">Drag pages to reorder them, or focus a page and press Alt with the up or down arrow.</p>
<div id="tree" class="tree" aria-describedby="tree-help"></div>
<form id="new-section-form" class="new-section" hidden>
<label for="new-section-name" class="sr-only">Section name</label>
<input id="new-section-name" class="input input-sm" type="text" placeholder="Section name" maxlength="60" required>
<button type="submit" class="btn btn-soft btn-sm">Add</button>
</form>
<div class="tree-actions">
<button type="button" class="btn-text strong" id="new-page">${icon('plus', 16, 2.2)}New page</button>
<button type="button" class="btn-text" id="new-section">${icon('plus', 16, 2.2)}New section</button>
</div>
</section>

<section class="panel editor-panel" aria-label="Page editor" id="editor-panel">
<div class="row editor-meta">
${field('doc-title', 'Page title', raw('<input id="doc-title" class="input" type="text" maxlength="120">'), 'grow-2')}
${field('doc-section', 'Section', raw('<select id="doc-section" class="input"></select>'), 'grow')}
${field('doc-slug', 'URL', raw('<input id="doc-slug" class="input mono" type="text" maxlength="90" spellcheck="false">'), 'grow-2')}
${field('doc-status', 'Status', raw('<select id="doc-status" class="input"><option value="published">Published</option><option value="draft">Draft</option></select>'), 'grow')}
</div>
<p class="form-note" id="changelog-note" hidden>This page lists your published releases automatically. Anything you write here appears above the list.</p>
<div class="editor">
<div class="editor-bar">
<div role="toolbar" aria-label="Formatting" class="toolbar" aria-controls="doc-body">
${tool('heading', 'Heading', 'heading')}
${tool('bold', 'Bold', 'bold', 2.2)}
${tool('italic', 'Italic', 'italic')}
${tool('code', 'Code', 'code')}
${tool('link', 'Link', 'link')}
${tool('list', 'Bulleted list', 'list')}
${tool('callout', 'Callout', 'callout')}
</div>
<div class="segmented">
<button type="button" id="mode-write" aria-pressed="true">Write</button>
<button type="button" id="mode-preview" aria-pressed="false">Preview</button>
</div>
</div>
<label for="doc-body" class="sr-only">Page content</label>
<textarea id="doc-body" class="editor-text" rows="22" spellcheck="true"></textarea>
<div id="doc-preview" class="doc-body editor-preview" hidden></div>
</div>
<div class="editor-foot">
<span id="doc-meta">Markdown supported</span>
<button type="button" class="btn-danger" id="delete-page">${icon('trash', 16)}<span>Delete page</span></button>
</div>
</section>
<section class="panel editor-empty" id="editor-empty" hidden>
<p>No pages yet. Add one with <strong>New page</strong>.</p>
</section>
</div>`;
  return adminLayout({ ctx, active: 'docs', title: 'Docs', body, data });
}

export function contentPage({ ctx, c, savedAt }) {
  const body = html`<form id="content-form" class="content-form" novalidate>
<div class="admin-head narrow">
<div class="admin-head-text">
<h1 class="admin-title">Site content</h1>
<p class="admin-sub">The name, words and links on the home page.</p>
</div>
<button type="submit" class="btn btn-primary">Save changes</button>
</div>

<section class="panel narrow" aria-labelledby="sec-name">
<div class="panel-heading">
<h2 id="sec-name" class="panel-title">Project name</h2>
<p class="panel-sub">Used everywhere the name appears, including the docs and admin. Write <code>{name}</code> in any text to insert it.</p>
</div>
<div class="field">
<label for="c-name">Name</label>
<input id="c-name" name="name" class="input input-display" type="text" maxlength="60" required value="${c.name}">
</div>
</section>

<section class="panel narrow" aria-labelledby="sec-hero">
<h2 id="sec-hero" class="panel-title">Hero</h2>
<div class="row">
${field('c-hero1', 'Headline, line 1', html`<input id="c-hero1" name="heroLine1" class="input" type="text" maxlength="80" value="${c.heroLine1}">`, 'grow')}
${field('c-hero2', html`Headline, line 2 <span class="label-hint">(shown in purple)</span>`, html`<input id="c-hero2" name="heroLine2" class="input input-accent" type="text" maxlength="80" value="${c.heroLine2}">`, 'grow')}
</div>
${field('c-intro', 'Intro', html`<textarea id="c-intro" name="heroIntro" class="input" rows="3" maxlength="400">${c.heroIntro}</textarea>`)}
</section>

<section class="panel narrow" aria-labelledby="sec-story">
<div class="panel-heading">
<h2 id="sec-story" class="panel-title">The story</h2>
<p class="panel-sub">The "Why it exists" section. Leave a blank line between paragraphs.</p>
</div>
${field('c-story-heading', 'Heading', html`<input id="c-story-heading" name="storyHeading" class="input" type="text" maxlength="120" value="${c.storyHeading}">`)}
<div class="field">
<div class="label-row"><label for="c-story">Story</label><span class="muted-sm">Markdown supported</span></div>
<textarea id="c-story" name="storyBody" class="input input-story" rows="12" maxlength="8000">${c.storyBody}</textarea>
</div>
<div class="row align-end">
${field('c-sign', 'Signed as', html`<input id="c-sign" name="storySignature" class="input" type="text" maxlength="120" value="${c.storySignature}">`, 'grow')}
<label class="switch-row grow" for="c-labels">
<span class="switch-label">Show "Discontinued / Maintained" labels</span>
${switchControl('c-labels', c.showStatusLabels)}
</label>
</div>
</section>

<section class="panel narrow" aria-labelledby="sec-links" id="links">
<div class="panel-heading">
<h2 id="sec-links" class="panel-title">Links</h2>
<p class="panel-sub">Used by the nav, link cards and footer. Releases are imported from the Git repository when it's on GitHub.</p>
</div>
${field('c-repo', 'Git repository', html`<input id="c-repo" name="repoUrl" class="input mono" type="url" placeholder="https://github.com/owner/repo" value="${c.repoUrl}">`)}
${field('c-releases', html`All releases <span class="label-hint">(blank = the repository's releases page)</span>`, html`<input id="c-releases" name="releasesUrl" class="input mono" type="url" placeholder="https://github.com/owner/repo/releases" value="${c.releasesUrl}">`)}
<div class="row">
${field('c-licence', 'Licence', html`<input id="c-licence" name="licence" class="input" type="text" maxlength="40" placeholder="e.g. MIT" value="${c.licence}">`, 'grow')}
${field('c-panel', 'Minimum panel version', html`<input id="c-panel" name="minPanelVersion" class="input mono" type="text" maxlength="20" placeholder="e.g. 1.11" value="${c.minPanelVersion}">`, 'grow')}
</div>
${field('c-footer', html`Footer note <span class="label-hint">(links work: [text](https://…))</span>`, html`<input id="c-footer" name="footerNote" class="input" type="text" maxlength="200" value="${c.footerNote}">`)}
</section>

<p class="form-error narrow" id="content-error" role="alert" hidden></p>
<div class="form-foot narrow">
<span class="muted-sm" id="saved-at">${savedAt}</span>
<div class="form-actions">
<a class="btn btn-ghost" href="/" target="_blank" rel="noopener">Preview site ${icon('arrowUpRight', 15)}</a>
<button type="submit" class="btn btn-primary">Save changes</button>
</div>
</div>
</form>`;
  return adminLayout({ ctx, active: 'content', title: 'Site content', body, data: { savedAt: c.updatedAt } });
}

export function securityPage({ ctx, data }) {
  const body = html`<div class="admin-head narrow">
<div class="admin-head-text">
<h1 class="admin-title">Security</h1>
<p class="admin-sub">Passkeys sign you in without the password. The password keeps working as a fallback.</p>
</div>
</div>

<section class="panel narrow" aria-labelledby="sec-passkeys">
<div class="panel-heading">
<h2 id="sec-passkeys" class="panel-title">Passkeys</h2>
<p class="panel-sub">Use Face ID, Touch ID, Windows Hello, your phone or a security key. Passkeys saved to iCloud Keychain, Google Password Manager or a password manager follow you to your other devices.</p>
</div>
<ul class="passkey-list" id="passkey-list"></ul>
<form id="passkey-form" class="passkey-form" novalidate>
${field('passkey-name', html`Name <span class="label-hint">(optional)</span>`, raw('<input id="passkey-name" class="input" type="text" maxlength="60" placeholder="e.g. MacBook, iPhone, YubiKey" autocomplete="off">'), 'grow')}
<button type="submit" class="btn btn-primary" id="passkey-add">${icon('plus', 17, 2.2)} Add a passkey</button>
</form>
<p class="form-error" id="passkey-error" role="alert" hidden></p>
</section>`;
  return adminLayout({ ctx, active: 'security', title: 'Security', body, data, scripts: ['/js/passkey.js'] });
}

export function loginPage({ ctx, error, next, enabled, passkeys = false }) {
  const body = html`<div class="page login-page">
<div class="blobs" aria-hidden="true"><div class="blob blob-d1"></div><div class="blob blob-d2"></div></div>
<main id="main" class="login-wrap">
<form class="panel login-card" method="post" action="/admin/login">
<div class="login-brand">${eggMark()}<span class="brand-name">${ctx.name}</span><span class="chip chip-sm">Admin</span></div>
<h1 class="login-title">Sign in</h1>
${enabled && passkeys ? html`<div class="passkey-signin" id="passkey-signin" hidden>
<button type="button" class="btn btn-primary btn-block" id="passkey-button">${icon('key', 17)} Sign in with a passkey</button>
<p class="form-error" id="passkey-error" role="alert" hidden></p>
<p class="or">or use the password</p>
</div>` : ''}
${enabled ? html`<input type="hidden" name="next" value="${next}">
<div class="field">
<label for="password">Password</label>
<input id="password" name="password" class="input" type="password" autocomplete="current-password" required autofocus>
</div>
${error ? html`<p class="form-error" role="alert">${error}</p>` : ''}
<button type="submit" class="btn btn-primary btn-block" id="password-button">${icon('lock', 17)} Sign in</button>`
    : html`<p class="form-error" role="alert">The admin panel is turned off. Set the ADMIN_PASSWORD environment variable and restart the container.</p>`}
<a class="text-link center" href="/">Back to the site</a>
</form>
</main>
</div>`;
  return document({ ctx, title: `Sign in – ${ctx.name} admin`, bodyClass: 'site', body, scripts: passkeys ? ['/js/passkey.js', '/js/login.js'] : [] });
}
