// Markdown for docs, the story and release notes. Raw HTML is disabled, so content can't inject markup,
// and markdown-it rejects javascript:/vbscript:/data: links on its own.
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
md.linkify.set({ fuzzyLink: false }); // only autolink real URLs, not bare names like eggactyl.cloud

export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const slugify = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

// Anchor ids on h2/h3 so docs can link to #sections.
md.core.ruler.push('heading_ids', state => {
  const used = new Set();
  state.tokens.forEach((t, i) => {
    if (t.type !== 'heading_open' || (t.tag !== 'h2' && t.tag !== 'h3')) return;
    const base = slugify(plainInline(state.tokens[i + 1])) || 'section';
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    t.attrSet('id', id);
  });
});

const copyIcon = '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"></path></svg>';

// Code blocks get a copy button; shell blocks get a "$" prompt that isn't copied.
md.renderer.rules.fence = (tokens, idx) => {
  const t = tokens[idx];
  const lang = t.info.trim().split(/\s+/)[0].toLowerCase();
  const shell = ['bash', 'sh', 'shell'].includes(lang);
  const lines = t.content.replace(/\n$/, '').split('\n')
    .map(l => (shell && l.trim() ? `<span class="prompt" aria-hidden="true">$ </span>` : '') + escapeHtml(l));
  return `<div class="codeblock"><pre><code>${lines.join('\n')}</code></pre><button type="button" class="copy-btn" aria-label="Copy code">${copyIcon}</button></div>\n`;
};

// Column alignment as classes: the CSP blocks inline styles.
md.core.ruler.push('table_align_classes', state => {
  for (const t of state.tokens) {
    if (t.type !== 'th_open' && t.type !== 'td_open') continue;
    const align = /text-align:(left|center|right)/.exec(t.attrGet('style') ?? '')?.[1];
    if (!align) continue;
    t.attrs = t.attrs.filter(([k]) => k !== 'style');
    t.attrJoin('class', `ta-${align}`);
  }
});

// Wide tables scroll inside their own box instead of the page.
md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n';
md.renderer.rules.table_close = () => '</table></div>\n';

function plainInline(token) {
  if (!token?.children) return token?.content ?? '';
  return token.children.map(c => (c.type === 'softbreak' || c.type === 'hardbreak' ? ' ' : c.content || '')).join('');
}

// {name} and {repo} in any editable text.
export function fill(text, ctx) {
  return String(text ?? '').replaceAll('{name}', ctx.name ?? '').replaceAll('{repo}', ctx.repo ?? '');
}

export function render(markdown, ctx = {}) {
  return md.render(fill(markdown, ctx));
}

// One line of inline markdown (links, emphasis), for short fields like the footer note.
export function renderInline(markdown, ctx = {}) {
  return md.renderInline(fill(markdown, ctx));
}

// Doc pages show their title separately, so a leading "# Title" line in the body is dropped.
export function renderDoc(body, ctx = {}) {
  return render(String(body ?? '').replace(/^\s*#\s[^\n]*\n?/, ''), ctx);
}

// Plain-text version of a document, for search.
export function plainText(markdown, ctx = {}) {
  return md.parse(fill(markdown, ctx), {})
    .map(t => (t.type === 'inline' ? plainInline(t) : t.type === 'fence' || t.type === 'code_block' ? t.content : ''))
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

// One-line summary of release notes: the first paragraph that isn't GitHub's "Full Changelog" link.
export function summary(markdown, max = 240) {
  const tokens = md.parse(String(markdown ?? ''), {});
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i].type !== 'inline' || tokens[i - 1].type !== 'paragraph_open') continue;
    const text = plainInline(tokens[i]).replace(/\s+/g, ' ').trim();
    if (!text || /^full changelog\b/i.test(text)) continue;
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  }
  return '';
}
