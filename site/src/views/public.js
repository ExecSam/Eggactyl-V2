import { html, raw, icon, fmtDate, jsonScript, sparkPath } from './html.js';
import { fill, render, renderInline } from '../markdown.js';
import { downloadPath, anchorFor } from '../releases.js';

const FONTS = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap';

export function document({ ctx, title, description = '', path = '', bodyClass = '', body, scripts = [] }) {
  const url = ctx.publicUrl && path ? `${ctx.publicUrl}${path}` : '';
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${description ? html`<meta name="description" content="${description}">` : ''}
<meta name="theme-color" content="#8B5CF6">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${ctx.name}">
<meta property="og:title" content="${title}">
${description ? html`<meta property="og:description" content="${description}">` : ''}
${url ? html`<meta property="og:url" content="${url}">
<link rel="canonical" href="${url}">` : ''}
<meta property="og:image" content="${ctx.publicUrl}/og.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The ${ctx.name} egg: a glowing purple egg with a crack across the top">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/css/site.css?v=${ctx.v}">
<script src="/js/site.js?v=${ctx.v}"></script>
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">Skip to content</a>
${body}
${scripts.map(s => html`<script src="${s}?v=${ctx.v}" defer></script>`)}
</body>
</html>`;
}

export const eggMark = (cls = '') => html`<span class="egg-mark ${cls}" aria-hidden="true"></span>`;

const blobs = (set, n) => html`<div class="blobs" aria-hidden="true">${Array.from({ length: n }, (_, i) => html`<div class="blob blob-${set}${i + 1}"></div>`)}</div>`;

function siteHeader({ ctx, docs = false }) {
  return html`<header class="site-header">
<div class="brand-row">
<a class="brand" href="/">${eggMark()}<span class="brand-name">${ctx.name}</span></a>
${docs ? html`<span class="chip">Docs</span>` : ''}
</div>
<button type="button" class="menu-btn" aria-label="Menu" aria-expanded="false" aria-controls="main-nav">${icon('menu', 22)}${icon('x', 22)}</button>
<nav aria-label="Main" class="main-nav" id="main-nav">
${docs ? html`<a class="nav-link" href="/">Home</a>` : html`<a class="nav-link" href="/docs">Docs</a>`}
<a class="nav-link" href="/#updates">Updates</a>
${ctx.repo ? html`<a class="nav-link" href="${ctx.repo}">GitHub ${icon('arrowUpRight', 14)}</a>` : ''}
<a class="btn btn-soft" href="/#download">${icon('download', 16)} Download</a>
</nav>
</header>`;
}

function siteFooter({ ctx, c }) {
  return html`<footer class="site-footer">
<div class="footer-brand">
<div class="brand brand-sm">${eggMark('egg-mark-sm')}<span class="brand-name">${ctx.name}</span></div>
${c.footerNote ? html`<p>${raw(renderInline(c.footerNote, ctx))}</p>` : ''}
</div>
<nav aria-label="Footer" class="footer-nav">
<a href="/docs">Docs</a>
<a href="/#download">Download</a>
${ctx.repo ? html`<a href="${ctx.repo}">GitHub</a>` : ''}
<a href="/#updates">Updates</a>
</nav>
</footer>`;
}

const eggArt = html`<div class="egg-stage" aria-hidden="true">
<div class="egg-glow"></div>
<svg class="spark spark-1" width="22" height="22" viewBox="0 0 24 24" fill="#E9D5FF">${raw(sparkPath)}</svg>
<svg class="spark spark-2" width="14" height="14" viewBox="0 0 24 24" fill="#F5D0FE">${raw(sparkPath)}</svg>
<svg class="spark spark-3" width="18" height="18" viewBox="0 0 24 24" fill="#DDD6FE">${raw(sparkPath)}</svg>
<svg class="spark spark-4" width="12" height="12" viewBox="0 0 24 24" fill="#E9D5FF">${raw(sparkPath)}</svg>
<div class="egg-float">
<div class="egg">
<div class="egg-shine"></div>
<div class="speck speck-1"></div><div class="speck speck-2"></div><div class="speck speck-3"></div>
<div class="speck speck-4"></div><div class="speck speck-5"></div><div class="speck speck-6"></div>
<svg class="crack" width="150" height="46" viewBox="0 0 150 46" fill="none"><path d="M0 24 16 12 30 28 46 8 60 26 76 14 90 30 106 10 122 24 150 18" stroke="#FAE8FF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>
</div>
</div>
<div class="egg-shadow"></div>
</div>`;

// Where a release's download button goes: our mirrored copy, else GitHub.
const releaseHref = r => downloadPath(r) ?? r.file?.remoteUrl ?? r.htmlUrl ?? null;

function card(href, iconName, title, text) {
  return html`<a class="card" href="${href}">
<span class="card-icon" aria-hidden="true">${icon(iconName, 22)}</span>
<span class="card-title">${title}</span>
<span class="card-text">${text}</span>
</a>`;
}

export function homePage({ ctx, c, latest, updates, changelogHref, summaries }) {
  const fine = c.licence ? ['Free and open source', c.licence] : ['Free to use'];
  fine.push(c.minPanelVersion ? `Pterodactyl ${c.minPanelVersion}+` : 'Pterodactyl & Pelican');
  const latestHref = latest ? (latest.file ? '/download/latest' : releaseHref(latest)) : null;

  const body = html`<div class="page home">
${blobs('h', 5)}
<div class="wrap">
${siteHeader({ ctx })}
<main id="main">

<section class="hero">
<div class="hero-copy">
<span class="pill"><span class="dot" aria-hidden="true"></span>Pterodactyl multi-egg${latest ? ` · v${latest.version}` : ''}</span>
<h1 class="hero-title"><span>${fill(c.heroLine1, ctx)}</span><span class="accent">${fill(c.heroLine2, ctx)}</span></h1>
${c.heroIntro ? html`<p class="hero-intro">${fill(c.heroIntro, ctx)}</p>` : ''}
<div class="actions">
<a class="btn btn-primary btn-lg" href="#download">${icon('download', 18, 2.2)} Download the egg</a>
<a class="btn btn-ghost btn-lg" href="/docs">Read the docs ${icon('arrowRight', 18, 2.2)}</a>
</div>
<p class="fineprint">${fine.join(' · ')}</p>
</div>
<div class="hero-art">${eggArt}</div>
</section>

<section id="why" class="section story">
<div class="story-side">
<span class="eyebrow">The story</span>
<h2 class="h2">${fill(c.storyHeading, ctx)}</h2>
${c.showStatusLabels ? html`<div class="status-labels">
<span class="status status-old"><span class="dot dot-dim" aria-hidden="true"></span>Eggactyl (original) · Discontinued</span>
<span class="status status-new"><span class="dot" aria-hidden="true"></span>${ctx.name} · Actively maintained</span>
</div>` : ''}
</div>
<div class="story-body">
${raw(render(c.storyBody, ctx))}
${c.storySignature ? html`<p class="signature">— ${fill(c.storySignature, ctx)}</p>` : ''}
</div>
</section>

<section class="section" aria-labelledby="everything">
<h2 id="everything" class="h2">Everything in one place</h2>
<div class="cards">
${card('/docs', 'book', 'Documentation', 'Installation, configuration and moving over from the original egg.')}
${card('#download', 'download', 'Download', 'Grab the latest egg JSON, ready to import into your panel.')}
${ctx.repo ? card(ctx.repo, 'git', 'Source code', 'Browse the repo, report issues and send pull requests.') : ''}
${card('#updates', 'history', 'Updates', 'Release notes and what changed in each version.')}
</div>
</section>

<section id="download" class="section" aria-labelledby="steps-heading">
<div class="download-panel">
<div class="steps-col">
<h2 id="steps-heading" class="h2 h2-sm">Up and running in three steps</h2>
<ol class="steps">
<li><span class="step-num" aria-hidden="true">1</span><div class="step"><span class="step-title">Download the egg</span><span class="step-text">Grab the JSON file from the latest release.</span></div></li>
<li><span class="step-num" aria-hidden="true">2</span><div class="step"><span class="step-title">Import it into your panel</span><span class="step-text">Upload the file and choose which nest it belongs to.</span><code class="path">Admin → Nests → Import Egg</code></div></li>
<li><span class="step-num" aria-hidden="true">3</span><div class="step"><span class="step-title">Create a server</span><span class="step-text">Pick ${ctx.name} as the egg, start it up, and choose your software from the console. <a href="/docs/installation">Full guide</a></span></div></li>
</ol>
</div>
<div class="latest-card">
<span class="eyebrow">Latest release</span>
${latest ? html`<span class="latest-version">v${latest.version}</span>
<span class="latest-meta">${latest.date ? `Released ${fmtDate(latest.date)}` : 'Released'}${latest.file ? html` · <span class="mono">${latest.file.name}</span>` : ''}</span>
${latestHref ? html`<a class="btn btn-primary btn-block" href="${latestHref}">${icon('download', 18, 2.2)} ${latest.file ? 'Download egg' : 'View release'}</a>` : ''}`
    : html`<span class="latest-version">Soon</span>
<span class="latest-meta">No release has been published yet.</span>`}
${ctx.releasesUrl ? html`<a class="text-link center" href="${ctx.releasesUrl}">All releases on GitHub ${icon('arrowUpRight', 14)}</a>` : ''}
</div>
</div>
</section>

<section id="updates" class="section" aria-labelledby="updates-heading">
<div class="section-head">
<h2 id="updates-heading" class="h2">Updates</h2>
${changelogHref ? html`<a class="text-link" href="${changelogHref}">Full changelog ${icon('arrowRight', 16)}</a>` : ''}
</div>
<div class="updates">
${updates.length ? updates.map((r, i) => html`<article class="update">
<div class="update-meta"><span class="version-chip${i === 0 ? ' is-latest' : ''}">v${r.version}</span><span class="update-date">${fmtDate(r.date)}</span></div>
<div class="update-body">
<h3 class="h3">${changelogHref ? html`<a href="${changelogHref}#${anchorFor(r)}">${r.title}</a>` : r.title}</h3>
${summaries[r.id] ? html`<p>${summaries[r.id]}</p>` : r.htmlUrl ? html`<p><a class="text-link inline" href="${r.htmlUrl}">Release notes on GitHub ${icon('arrowUpRight', 14)}</a></p>` : ''}
</div>
</article>`) : html`<p class="empty">No releases yet. They'll appear here as soon as one is published.</p>`}
</div>
</section>

</main>
${siteFooter({ ctx, c })}
</div>
</div>`;

  return document({
    ctx, path: '/', bodyClass: 'site',
    title: `${ctx.name} – ${fill(c.heroLine1, ctx)} ${fill(c.heroLine2, ctx)}`.trim(),
    description: fill(c.heroIntro, ctx),
    body,
  });
}

export function docPage({ ctx, c, nav, page, sectionTitle, description, bodyHtml, prev, next, searchIndex, changelog }) {
  const body = html`<div class="page docs">
${blobs('d', 3)}
<div class="wrap wrap-wide">
${siteHeader({ ctx, docs: true })}
<div class="docs-layout">
<aside class="docs-aside">
<div class="search">
<label for="docsearch" class="sr-only">Search the docs</label>
${icon('search', 16)}
<input id="docsearch" type="search" placeholder="Search the docs" autocomplete="off" aria-controls="search-results">
</div>
<div id="search-results" class="search-results" hidden></div>
<button type="button" class="nav-toggle" aria-expanded="false" aria-controls="docs-nav">Browse the docs ${icon('chevronRight', 16)}</button>
<nav aria-label="Documentation" class="docs-nav" id="docs-nav">
${nav.map(s => html`<div class="nav-group">
<span class="nav-group-title">${s.title}</span>
${s.pages.map(p => html`<a class="side-link" href="/docs/${p.slug}"${p.slug === page.slug ? raw(' aria-current="page"') : ''}>${p.title}</a>`)}
</div>`)}
</nav>
</aside>
<main id="main" class="docs-main">
<div class="doc-head">
<nav aria-label="Breadcrumb" class="breadcrumb"><span>${sectionTitle}</span>${icon('chevronRight', 14)}<span class="current" aria-current="page">${page.title}</span></nav>
<h1 class="doc-title">${page.title}</h1>
</div>
<div class="doc-body">${raw(bodyHtml)}</div>
${changelog ? changelogList(ctx, changelog) : ''}
${prev || next ? html`<nav aria-label="Previous and next page" class="pager">
${prev ? html`<a class="pager-link" href="/docs/${prev.slug}"><span class="pager-label">Previous</span><span class="pager-title">← ${prev.title}</span></a>` : html`<span></span>`}
${next ? html`<a class="pager-link pager-next" href="/docs/${next.slug}"><span class="pager-label">Next</span><span class="pager-title">${next.title} →</span></a>` : ''}
</nav>` : ''}
<div class="doc-foot">
<span>${page.updatedAt ? `Last updated ${fmtDate(page.updatedAt)}` : ''}</span>
${ctx.repo ? html`<a href="${ctx.repo}/issues/new">Report an issue on GitHub ${icon('arrowUpRight', 13)}</a>` : ''}
</div>
</main>
</div>
</div>
</div>
${jsonScript('search-index', searchIndex)}`;

  return document({
    ctx, path: `/docs/${page.slug}`, bodyClass: 'site',
    title: `${page.title} – ${ctx.name} docs`,
    description,
    body, scripts: ['/js/docs.js'],
  });
}

function changelogList(ctx, releases) {
  if (!releases.length) return html`<p class="empty">No releases yet.</p>`;
  return html`<div class="changelog">
${releases.map(r => html`<article class="change" id="${anchorFor(r)}">
<div class="change-head"><span class="version-chip">v${r.version}</span><span class="update-date">${fmtDate(r.date)}</span></div>
<h2 class="change-title">${r.title}</h2>
${r.notes.trim() ? html`<div class="doc-body change-notes">${raw(render(r.notes, ctx))}</div>` : ''}
<div class="change-links">
${r.file ? html`<a class="text-link" href="${releaseHref(r)}">${icon('download', 15)} ${r.file.name}</a>` : ''}
${r.htmlUrl ? html`<a class="text-link" href="${r.htmlUrl}">View on GitHub ${icon('arrowUpRight', 14)}</a>` : ''}
</div>
</article>`)}
</div>`;
}

export function notFoundPage({ ctx }) {
  const body = html`<div class="page docs">
${blobs('d', 3)}
<div class="wrap">
${siteHeader({ ctx })}
<main id="main" class="not-found">
<span class="eyebrow">404</span>
<h1 class="h2">This page hatched somewhere else.</h1>
<p>The page you're after doesn't exist, or it moved.</p>
<div class="actions"><a class="btn btn-primary" href="/">Go home</a><a class="btn btn-ghost" href="/docs">Read the docs</a></div>
</main>
</div>
</div>`;
  return document({ ctx, title: `Page not found – ${ctx.name}`, bodyClass: 'site', body });
}
