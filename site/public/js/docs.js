// Docs page: search, copy buttons on code blocks, and the collapsible nav on small screens.
(() => {
  document.documentElement.classList.add('js');

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // ---- copy buttons
  document.addEventListener('click', async e => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    const code = btn.parentElement.querySelector('code').cloneNode(true);
    code.querySelectorAll('.prompt').forEach(p => p.remove());
    try {
      await navigator.clipboard.writeText(code.textContent);
      btn.classList.add('copied');
      btn.setAttribute('aria-label', 'Copied');
      setTimeout(() => { btn.classList.remove('copied'); btn.setAttribute('aria-label', 'Copy code'); }, 1600);
    } catch {
      btn.setAttribute('aria-label', 'Copy failed');
    }
  });

  // ---- mobile nav
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('docs-nav');
  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  });

  // ---- search
  const input = document.getElementById('docsearch');
  const results = document.getElementById('search-results');
  const indexEl = document.getElementById('search-index');
  if (!input || !results || !indexEl) return;
  const pages = JSON.parse(indexEl.textContent);

  function snippet(text, terms) {
    const lower = text.toLowerCase();
    let at = -1;
    for (const t of terms) { at = lower.indexOf(t); if (at >= 0) break; }
    if (at < 0) return '';
    const start = Math.max(0, at - 50);
    const raw = (start ? '…' : '') + text.slice(start, at + 110) + (at + 110 < text.length ? '…' : '');
    // Escape around the matches rather than after, so highlighting can't cut through an entity.
    let out = '', last = 0;
    raw.replace(new RegExp(terms.map(escRe).join('|'), 'gi'), (m, i) => {
      out += esc(raw.slice(last, i)) + `<mark>${esc(m)}</mark>`;
      last = i + m.length;
      return m;
    });
    return out + esc(raw.slice(last));
  }

  function run() {
    const q = input.value.trim().toLowerCase();
    const searching = q.length > 0;
    results.hidden = !searching;
    nav.hidden = searching;
    if (toggle) toggle.hidden = searching;
    if (!searching) return;
    const terms = q.split(/\s+/).filter(Boolean);
    const hits = pages
      .map(p => {
        const title = p.t.toLowerCase(), body = p.x.toLowerCase();
        if (!terms.every(t => title.includes(t) || body.includes(t))) return null;
        const score = terms.reduce((n, t) => n + (title.includes(t) ? 10 : 0) + (body.split(t).length - 1), 0);
        return { p, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    results.innerHTML = hits.length
      ? hits.map(({ p }) => `<a class="search-result" href="/docs/${encodeURIComponent(p.s)}"><span>${esc(p.t)}</span><small>${snippet(p.x, terms) || esc(p.g)}</small></a>`).join('')
      : `<p class="search-none">Nothing matches “${esc(input.value.trim())}”.</p>`;
  }

  input.addEventListener('input', run);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const first = results.querySelector('a');
      if (first) { e.preventDefault(); location.href = first.href; }
    } else if (e.key === 'Escape') {
      input.value = '';
      run();
    }
  });
})();
