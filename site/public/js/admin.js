// Admin panel: Releases, Docs, Site content and Security. Talks to /api/admin/* with JSON.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const svg = (paths, size = 17, extra = '') => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${extra}>${paths}</svg>`;
  const ICON = {
    pencil: svg('<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>'),
    pencilSm: svg('<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>', 14),
    key: svg('<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"></path><path d="m21 2-9.6 9.6"></path><circle cx="7.5" cy="15.5" r="5.5"></circle>', 18),
    trashSm: svg('<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M6 6l1 14h10l1-14"></path>', 14),
    more: '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>',
    grip: '<svg class="grip" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"></circle><circle cx="15" cy="6" r="1.6"></circle><circle cx="9" cy="12" r="1.6"></circle><circle cx="15" cy="12" r="1.6"></circle><circle cx="9" cy="18" r="1.6"></circle><circle cx="15" cy="18" r="1.6"></circle></svg>',
    spinner: svg('<path d="M21 12a9 9 0 1 1-6.2-8.6"></path>', 16, ' class="spin"'),
  };

  const page = $('#main')?.dataset.page;
  const data = JSON.parse($('#page-data')?.textContent || '{}');

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
    let json = {};
    try { json = await res.json(); } catch { /* empty or non-JSON body */ }
    if (res.status === 401) {
      location.href = `/admin/login?next=${encodeURIComponent(location.pathname)}`;
      throw new Error(json.error || 'You were signed out.');
    }
    if (!res.ok) throw new Error(json.error || `The server said ${res.status}.`);
    return json;
  }

  let toastTimer;
  function toast(message, isError = false) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.toggle('is-error', isError);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 7000 : 3500);
  }

  const fmtDate = iso => {
    if (!iso) return '';
    const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...(iso.length === 10 ? { timeZone: 'UTC' } : {}) });
  };
  const fmtDateTime = iso => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const ago = iso => {
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return fmtDateTime(iso);
  };
  // Must match slugify() in src/markdown.js.
  const slugify = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  const randomId = prefix => prefix + Math.random().toString(36).slice(2, 10);

  async function withBusy(btn, fn) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    try { return await fn(); } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
  }

  // Two-step delete buttons: the first click arms them, the second within 4 seconds confirms.
  function armed(btn, label) {
    if (btn.classList.contains('confirm')) return true;
    btn.dataset.original = btn.innerHTML;
    btn.classList.add('confirm');
    btn.lastElementChild ? (btn.lastElementChild.textContent = label) : (btn.textContent = label);
    btn.armTimer = setTimeout(() => disarm(btn), 4000);
    return false;
  }
  function disarm(btn) {
    clearTimeout(btn.armTimer);
    if (!btn.classList.contains('confirm')) return;
    btn.classList.remove('confirm');
    btn.innerHTML = btn.dataset.original;
  }

  if (page === 'releases') releases();
  if (page === 'docs') docs();
  if (page === 'content') content();
  if (page === 'security') security();

  // ================================================================ Releases

  function releases() {
    let state = data;
    let editing = null;
    let upload = null;
    let syncing = false;

    const rows = $('#release-rows');
    const form = $('#release-form');
    const f = {
      version: $('#rel-version'), date: $('#rel-date'), title: $('#rel-title'), notes: $('#rel-notes'),
      file: $('#rel-file'), latest: $('#rel-latest'),
    };
    const draftBtn = $('#save-draft');
    const publishBtn = $('#publish');
    const dropzone = $('#dropzone');
    const errorEl = $('#form-error');

    const find = id => state.releases.find(r => r.id === id);
    const setError = msg => { errorEl.textContent = msg; errorEl.hidden = !msg; };

    function renderSync() {
      const s = state.sync;
      $('#sync-auto').checked = s.auto;
      $('#sync-interval').value = String(s.intervalMinutes);
      $('#sync-interval').disabled = !s.auto;
      $('#interval-field').classList.toggle('is-off', !s.auto);
      $('#sync-source').innerHTML = s.repo
        ? `Releases come from <a href="https://github.com/${esc(s.repo)}" target="_blank" rel="noopener">${esc(s.repo)}</a>. Change it in <a href="/admin/content#links">Site content</a>.`
        : 'No GitHub repository is set. Add one under <a href="/admin/content#links">Site content → Links</a>.';
      const status = $('#sync-status');
      status.classList.toggle('is-error', Boolean(s.lastResult && !s.lastResult.ok) && !syncing);
      if (syncing) status.innerHTML = `${ICON.spinner} Checking GitHub…`;
      else if (s.lastRunAt) status.textContent = `${s.lastResult?.ok === false ? 'Last check failed: ' : ''}${s.lastResult?.message ?? ''} · checked ${ago(s.lastRunAt)}${s.auto ? '' : '. Automatic updates are off.'}`;
      else status.textContent = s.auto ? 'Waiting for the first check.' : 'Not checked yet. Automatic updates are off.';
      const restore = $('#sync-restore');
      restore.hidden = !s.ignoredCount;
      restore.textContent = `Restore ${s.ignoredCount} deleted GitHub release${s.ignoredCount === 1 ? '' : 's'}`;
    }

    function renderRows() {
      rows.innerHTML = state.releases.length ? state.releases.map(r => `<tr data-id="${esc(r.id)}"${r.id === editing ? ' class="is-editing"' : ''}>
<td><div class="ver-cell"><span class="ver">v${esc(r.version)}</span>${r.isLatest ? '<span class="badge-latest">Latest</span>' : ''}</div></td>
<td><span class="rel-title">${esc(r.title || 'Untitled')}</span>${r.source === 'github' ? `<span class="rel-source">From GitHub${r.edited ? ' · edited here' : ''}</span>` : ''}</td>
<td class="td-date">${r.date ? esc(fmtDate(r.date)) : '<span class="not-set">Not set</span>'}</td>
<td>${r.status === 'published'
    ? '<span class="status-pill status-published"><span class="pill-dot" aria-hidden="true"></span>Published</span>'
    : '<span class="status-pill status-draft"><span class="pill-dot" aria-hidden="true"></span>Draft</span>'}</td>
<td><div class="row-actions">
<button class="icon-btn" type="button" data-act="edit" aria-label="Edit v${esc(r.version)}">${ICON.pencil}</button>
<button class="icon-btn" type="button" data-act="menu" aria-label="More actions for v${esc(r.version)}" aria-haspopup="menu" aria-expanded="false">${ICON.more}</button>
</div></td>
</tr>`).join('') : '<tr class="empty-row"><td colspan="5">No releases yet. Import them from GitHub, or add one with the form.</td></tr>';
    }

    function render() { renderSync(); renderRows(); }

    function showFile(name, sub) {
      dropzone.classList.toggle('has-file', Boolean(name));
      $('#dz-main').innerHTML = name ? esc(name) : 'Drop the egg JSON here, or <span class="dz-browse">browse</span>';
      $('#dz-sub').textContent = sub || 'Exported from Admin → Nests in your panel';
    }

    // Heading, buttons and switches that depend on the release's state, not on what's typed.
    function formMeta(r) {
      $('#form-heading').textContent = r ? `Edit v${r.version}` : 'New release';
      $('#form-cancel').hidden = !r;
      $('#form-note').hidden = !(r && r.source === 'github' && !r.edited);
      f.latest.checked = r ? r.isLatest || r.status === 'draft' : true;
      const live = r?.status === 'published';
      draftBtn.textContent = live ? 'Unpublish' : 'Save draft';
      publishBtn.textContent = live ? 'Save changes' : 'Publish release';
    }

    function fillForm(r) {
      editing = r?.id ?? null;
      upload = null;
      f.file.value = '';
      f.version.value = r?.version ?? '';
      f.date.value = r?.date ?? '';
      f.title.value = r?.title ?? '';
      f.notes.value = r?.notes ?? '';
      showFile(r?.file?.name, r?.file ? 'Current file. Drop a new one to replace it.' : '');
      formMeta(r);
      f.version.removeAttribute('aria-invalid');
      setError('');
      renderRows();
    }

    async function takeFile(file) {
      if (!file) return;
      setError('');
      if (file.size > 2 * 1024 * 1024) return setError('The egg file is larger than 2 MB.');
      const text = await file.text();
      try { JSON.parse(text); } catch { return setError(`${file.name} isn't valid JSON.`); }
      upload = { name: file.name, content: text };
      showFile(file.name, 'Ready to upload when you save.');
    }

    async function save(publish) {
      setError('');
      const version = f.version.value.trim().replace(/^v/i, '');
      if (!version) {
        f.version.setAttribute('aria-invalid', 'true');
        f.version.focus();
        return setError('Add a version, like 2.1.0.');
      }
      f.version.removeAttribute('aria-invalid');
      if (publish && !upload && !find(editing)?.file) return setError('Add the egg file before publishing.');
      const body = { version, date: f.date.value, title: f.title.value, notes: f.notes.value, publish, latest: f.latest.checked };
      if (upload) body.file = upload;
      try {
        state = await withBusy(publish ? publishBtn : draftBtn, () =>
          editing ? api('PUT', `/api/admin/releases/${editing}`, body) : api('POST', '/api/admin/releases', body));
        toast(publish ? `v${version} is live.` : `v${version} saved as a draft.`);
        fillForm(null);
        render();
      } catch (err) {
        setError(err.message);
      }
    }

    form.addEventListener('submit', e => { e.preventDefault(); save(true); });
    draftBtn.addEventListener('click', () => save(false));
    $('#form-cancel').addEventListener('click', () => fillForm(null));
    f.file.addEventListener('change', () => takeFile(f.file.files[0]));
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('is-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-over'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('is-over');
      takeFile(e.dataTransfer.files[0]);
    });

    // ---- row menu
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    document.body.append(menu);
    let menuFor = null;

    function closeMenu(focusBack = false) {
      if (menu.hidden) return;
      menu.hidden = true;
      menuFor?.setAttribute('aria-expanded', 'false');
      if (focusBack) menuFor?.focus();
      menuFor = null;
    }

    function openMenu(btn, r) {
      closeMenu();
      const items = [];
      if (r.status === 'published' && !r.isLatest) items.push('<button type="button" role="menuitem" data-do="latest">Mark as latest</button>');
      items.push(r.status === 'published'
        ? '<button type="button" role="menuitem" data-do="unpublish">Unpublish</button>'
        : '<button type="button" role="menuitem" data-do="publish">Publish</button>');
      if (r.href) items.push(`<a role="menuitem" href="${esc(r.href)}">Download egg file</a>`);
      if (r.htmlUrl) items.push(`<a role="menuitem" href="${esc(r.htmlUrl)}" target="_blank" rel="noopener">View on GitHub</a>`);
      items.push('<button type="button" role="menuitem" class="danger" data-do="delete">Delete release</button>');
      menu.innerHTML = items.join('');
      menu.dataset.id = r.id;
      menu.hidden = false;
      menuFor = btn;
      btn.setAttribute('aria-expanded', 'true');
      const rect = btn.getBoundingClientRect();
      const below = rect.bottom + 4 + menu.offsetHeight < window.innerHeight;
      menu.style.top = `${below ? rect.bottom + 4 : rect.top - menu.offsetHeight - 4}px`;
      menu.style.left = `${Math.max(8, rect.right - menu.offsetWidth)}px`;
      menu.querySelector('[role="menuitem"]').focus();
    }

    menu.addEventListener('keydown', e => {
      const items = [...menu.querySelectorAll('[role="menuitem"]')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenu(true); }
    });

    menu.addEventListener('click', async e => {
      const item = e.target.closest('button[data-do]');
      if (!item) { if (e.target.closest('a')) closeMenu(); return; }
      const r = find(menu.dataset.id);
      if (!r) return closeMenu();
      const action = item.dataset.do;
      if (action === 'delete') {
        if (item.textContent !== 'Click again to delete') {
          item.textContent = 'Click again to delete';
          item.classList.add('confirm');
          return;
        }
      }
      closeMenu();
      try {
        state = action === 'delete'
          ? await api('DELETE', `/api/admin/releases/${r.id}`)
          : await api('POST', `/api/admin/releases/${r.id}/action`, { action });
        if (editing === r.id) action === 'delete' ? fillForm(null) : formMeta(find(r.id));
        render();
        const menuBtn = id => rows.querySelector(`tr[data-id="${CSS.escape(id)}"] [data-act="menu"]`);
        (menuBtn(r.id) ?? rows.querySelector('[data-act="menu"]') ?? $('#sync-now')).focus();
        toast({
          delete: r.source === 'github' ? `v${r.version} deleted. Imports will skip it.` : `v${r.version} deleted.`,
          latest: `v${r.version} is now the latest release.`,
          publish: `v${r.version} is live.`,
          unpublish: `v${r.version} is now a draft.`,
        }[action]);
      } catch (err) {
        toast(err.message, true);
      }
    });

    document.addEventListener('click', e => {
      if (!menu.hidden && !menu.contains(e.target) && e.target.closest('[data-act="menu"]') !== menuFor) closeMenu();
    });
    window.addEventListener('resize', () => closeMenu());
    window.addEventListener('scroll', () => closeMenu(), true);

    rows.addEventListener('click', e => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const r = find(btn.closest('tr').dataset.id);
      if (!r) return;
      if (btn.dataset.act === 'edit') {
        closeMenu();
        fillForm(r);
        f.version.focus();
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else if (menuFor === btn) {
        closeMenu();
      } else {
        openMenu(btn, r);
      }
    });

    // ---- GitHub sync
    async function runSync(url) {
      syncing = true;
      renderSync();
      try {
        const res = await withBusy($('#sync-now'), () => api('POST', url));
        state = res;
        toast(res.result.ok ? `GitHub: ${res.result.message}.` : `GitHub import failed: ${res.result.message}`, !res.result.ok);
      } catch (err) {
        toast(err.message, true);
      } finally {
        syncing = false;
        render();
      }
    }

    async function refresh() {
      try {
        const res = await api('GET', '/api/admin/state');
        state = { sync: res.sync, releases: res.releases };
        render();
      } catch { /* the next refresh will try again */ }
    }

    $('#sync-now').addEventListener('click', () => runSync('/api/admin/sync/run'));
    $('#sync-restore').addEventListener('click', () => runSync('/api/admin/sync/restore'));
    $('#sync-auto').addEventListener('change', async e => {
      const auto = e.target.checked;
      try {
        state = await api('PUT', '/api/admin/sync', { auto });
        render();
        toast(auto ? 'Automatic updates are on. New GitHub releases will appear by themselves.' : 'Automatic updates are off. Use Import from GitHub when you want new releases.');
        if (auto) setTimeout(refresh, 4000);
      } catch (err) {
        e.target.checked = !auto;
        toast(err.message, true);
      }
    });
    $('#sync-interval').addEventListener('change', async e => {
      try {
        state = await api('PUT', '/api/admin/sync', { intervalMinutes: Number(e.target.value) });
        render();
        toast(`GitHub will be checked every ${e.target.selectedOptions[0].textContent}.`);
      } catch (err) {
        toast(err.message, true);
      }
    });

    setInterval(() => { if (!syncing && document.visibilityState === 'visible') refresh(); }, 60_000);
    fillForm(null);
    render();
  }

  // ================================================================ Docs

  function docs() {
    let saved = structuredClone(data.docs);
    let model = structuredClone(data.docs);
    let currentId = model.pages[0]?.id ?? null;
    let dragId = null;
    const autoSlug = new Set(); // new pages whose URL still follows their title

    const tree = $('#tree');
    const e = {
      title: $('#doc-title'), section: $('#doc-section'), slug: $('#doc-slug'), status: $('#doc-status'),
      body: $('#doc-body'), preview: $('#doc-preview'),
    };

    const current = () => model.pages.find(p => p.id === currentId);
    const isDirty = () => JSON.stringify(model) !== JSON.stringify(saved);

    function updateDirty() {
      const dirty = isDirty();
      $('#dirty').hidden = !dirty;
      $('#discard').disabled = !dirty;
      $('#publish-docs').disabled = !dirty;
    }

    window.addEventListener('beforeunload', ev => { if (isDirty()) { ev.preventDefault(); ev.returnValue = ''; } });

    function renderTree() {
      tree.innerHTML = model.sections.map(s => {
        const pages = model.pages.filter(p => p.sectionId === s.id);
        return `<div class="tree-section" data-section="${esc(s.id)}">
<div class="tree-section-head">
<span class="tree-section-title">${esc(s.title)}</span>
<button type="button" class="icon-btn icon-btn-sm" data-act="rename" aria-label="Rename section ${esc(s.title)}">${ICON.pencilSm}</button>
${pages.length ? '' : `<button type="button" class="icon-btn icon-btn-sm" data-act="delete-section" aria-label="Delete section ${esc(s.title)}">${ICON.trashSm}</button>`}
</div>
${pages.map(p => `<button type="button" class="tree-item" draggable="true" data-page="${esc(p.id)}" aria-current="${p.id === currentId}">${ICON.grip}<span class="t">${esc(p.title || 'Untitled')}</span>${p.kind === 'changelog' ? '<span class="badge badge-auto">Auto</span>' : ''}${p.published ? '' : '<span class="badge">Draft</span>'}</button>`).join('')}
${pages.length ? '' : '<div class="tree-drop">Drop a page here</div>'}
</div>`;
      }).join('') || '<p class="muted-sm">No sections yet. Add one below.</p>';
    }

    function renderEditor() {
      const p = current();
      $('#editor-panel').hidden = !p;
      $('#editor-empty').hidden = Boolean(p);
      if (!p) return;
      e.title.value = p.title;
      e.section.innerHTML = model.sections.map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('');
      e.section.value = p.sectionId;
      e.slug.value = `/docs/${p.slug}`;
      e.status.value = p.published ? 'published' : 'draft';
      e.body.value = p.body;
      $('#changelog-note').hidden = p.kind !== 'changelog';
      const was = saved.pages.find(x => x.id === p.id);
      $('#doc-meta').textContent = `Markdown supported · ${was ? `Last published ${fmtDate(was.updatedAt)}` : 'Not published yet'}`;
      setMode('write');
    }

    function render() { renderTree(); renderEditor(); updateDirty(); }

    function select(id) {
      currentId = id;
      disarm($('#delete-page'));
      render();
    }
    const focusPage = id => tree.querySelector(`[data-page="${CSS.escape(id)}"]`)?.focus();

    // ---- write / preview
    let mode = 'write';
    async function setMode(next) {
      mode = next;
      $('#mode-write').setAttribute('aria-pressed', String(mode === 'write'));
      $('#mode-preview').setAttribute('aria-pressed', String(mode === 'preview'));
      document.querySelectorAll('.toolbar .icon-btn').forEach(b => { b.disabled = mode === 'preview'; });
      e.body.hidden = mode === 'preview';
      e.preview.hidden = mode !== 'preview';
      if (mode !== 'preview') return;
      e.preview.innerHTML = '<p class="muted-sm">Rendering…</p>';
      try {
        const res = await api('POST', '/api/admin/preview', { markdown: e.body.value, doc: true });
        if (mode === 'preview') e.preview.innerHTML = res.html || '<p class="muted-sm">Nothing to preview yet.</p>';
      } catch (err) {
        e.preview.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
      }
    }
    $('#mode-write').addEventListener('click', () => { setMode('write'); e.body.focus(); });
    $('#mode-preview').addEventListener('click', () => setMode('preview'));

    // ---- editing fields
    e.title.addEventListener('input', () => {
      const p = current();
      p.title = e.title.value;
      if (autoSlug.has(p.id)) { p.slug = slugify(p.title); e.slug.value = `/docs/${p.slug}`; }
      renderTree(); updateDirty();
    });
    e.slug.addEventListener('input', () => {
      const p = current();
      p.slug = slugify(e.slug.value.replace(/^\/?docs\//, ''));
      autoSlug.delete(p.id);
      updateDirty();
    });
    e.slug.addEventListener('change', () => { e.slug.value = `/docs/${current().slug}`; });
    e.status.addEventListener('change', () => { current().published = e.status.value === 'published'; renderTree(); updateDirty(); });
    e.body.addEventListener('input', () => { current().body = e.body.value; updateDirty(); });
    e.section.addEventListener('change', () => {
      movePage(currentId, e.section.value, null);
      renderTree(); updateDirty();
    });

    // ---- formatting toolbar
    function replaceRange(start, end, text, selStart, selEnd) {
      e.body.focus();
      e.body.setSelectionRange(start, end);
      // execCommand keeps the edit on the browser's undo stack; setRangeText is the fallback.
      if (!document.execCommand('insertText', false, text)) {
        e.body.setRangeText(text, start, end, 'end');
        e.body.dispatchEvent(new Event('input'));
      }
      e.body.setSelectionRange(selStart, selEnd);
    }
    function wrap(before, after, placeholder) {
      const { selectionStart: s, selectionEnd: t, value } = e.body;
      const inner = value.slice(s, t) || placeholder;
      replaceRange(s, t, before + inner + after, s + before.length, s + before.length + inner.length);
    }
    function lineRange() {
      const { selectionStart: s, selectionEnd: t, value } = e.body;
      const start = value.lastIndexOf('\n', s - 1) + 1;
      let end = value.indexOf('\n', t);
      if (end < 0) end = value.length;
      return [start, end, value.slice(start, end)];
    }
    function prefixLines(prefix) {
      const [start, end, text] = lineRange();
      const out = text.split('\n').map(l => prefix + l).join('\n');
      replaceRange(start, end, out, start + out.length, start + out.length);
    }
    const commands = {
      heading: () => prefixLines('## '),
      bold: () => wrap('**', '**', 'bold text'),
      italic: () => wrap('*', '*', 'italic text'),
      code: () => (e.body.value.slice(e.body.selectionStart, e.body.selectionEnd).includes('\n')
        ? wrap('```\n', '\n```', '') : wrap('`', '`', 'code')),
      link: () => {
        const { selectionStart: s, selectionEnd: t, value } = e.body;
        const label = value.slice(s, t) || 'link text';
        const text = `[${label}](https://)`;
        replaceRange(s, t, text, s + label.length + 3, s + text.length - 1);
      },
      list: () => prefixLines('- '),
      callout: () => {
        const [start, end, text] = lineRange();
        const block = `> **Note**\n>\n${(text || 'Your text').split('\n').map(l => `> ${l}`).join('\n')}`;
        replaceRange(start, end, block, start + block.length, start + block.length);
      },
    };
    document.querySelector('.toolbar').addEventListener('click', ev => {
      const btn = ev.target.closest('[data-cmd]');
      if (btn && current()) commands[btn.dataset.cmd]();
    });
    e.body.addEventListener('keydown', ev => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
      const cmd = { b: 'bold', i: 'italic', k: 'link' }[ev.key.toLowerCase()];
      if (cmd) { ev.preventDefault(); commands[cmd](); }
    });
    document.addEventListener('keydown', ev => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); if (isDirty()) publish(); }
    });

    // ---- tree: selecting, reordering, sections
    function movePage(id, sectionId, targetId, after = false) {
      const from = model.pages.findIndex(p => p.id === id);
      const [p] = model.pages.splice(from, 1);
      p.sectionId = sectionId;
      let to;
      if (targetId) {
        to = model.pages.findIndex(x => x.id === targetId) + (after ? 1 : 0);
      } else {
        const last = model.pages.map(x => x.sectionId).lastIndexOf(sectionId);
        to = last >= 0 ? last + 1 : model.pages.length;
      }
      model.pages.splice(to, 0, p);
    }

    // Pages in the order readers see them: by section, then position.
    const ordered = () => model.sections.flatMap(s => model.pages.filter(p => p.sectionId === s.id));

    tree.addEventListener('click', ev => {
      const item = ev.target.closest('.tree-item');
      if (item) { select(item.dataset.page); return focusPage(item.dataset.page); }
      const btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      const id = btn.closest('.tree-section').dataset.section;
      if (btn.dataset.act === 'rename') renameSection(id);
      if (btn.dataset.act === 'delete-section') {
        model.sections = model.sections.filter(s => s.id !== id);
        render();
        $('#new-section').focus();
      }
    });

    tree.addEventListener('keydown', ev => {
      const item = ev.target.closest('.tree-item');
      if (!item || !ev.altKey || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
      ev.preventDefault();
      const list = ordered();
      const i = list.findIndex(p => p.id === item.dataset.page);
      const down = ev.key === 'ArrowDown';
      const neighbour = list[i + (down ? 1 : -1)];
      if (!neighbour) return;
      const crossing = neighbour.sectionId !== list[i].sectionId;
      movePage(item.dataset.page, neighbour.sectionId, neighbour.id, crossing ? !down : down);
      renderTree(); updateDirty();
      focusPage(item.dataset.page);
    });

    const clearDrop = () => tree.querySelectorAll('.drop-before, .drop-after, .is-over').forEach(n => n.classList.remove('drop-before', 'drop-after', 'is-over'));
    tree.addEventListener('dragstart', ev => {
      const item = ev.target.closest('.tree-item');
      if (!item) return;
      dragId = item.dataset.page;
      item.classList.add('is-dragging');
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('application/x-egg-page', dragId); // not text, so fields won't accept the drop
    });
    tree.addEventListener('dragover', ev => {
      if (!dragId) return;
      const item = ev.target.closest('.tree-item');
      const zone = ev.target.closest('.tree-drop');
      if (!item && !zone) return;
      ev.preventDefault();
      clearDrop();
      if (zone) return zone.classList.add('is-over');
      const r = item.getBoundingClientRect();
      item.classList.add(ev.clientY > r.top + r.height / 2 ? 'drop-after' : 'drop-before');
    });
    tree.addEventListener('drop', ev => {
      if (!dragId) return;
      ev.preventDefault();
      const item = ev.target.closest('.tree-item');
      const sectionId = ev.target.closest('.tree-section')?.dataset.section;
      if (item && item.dataset.page !== dragId) {
        const r = item.getBoundingClientRect();
        movePage(dragId, sectionId, item.dataset.page, ev.clientY > r.top + r.height / 2);
      } else if (!item && sectionId) {
        movePage(dragId, sectionId, null);
      }
      dragId = null;
      render();
    });
    tree.addEventListener('dragend', () => { dragId = null; clearDrop(); tree.querySelectorAll('.is-dragging').forEach(n => n.classList.remove('is-dragging')); });

    function renameSection(id) {
      const s = model.sections.find(x => x.id === id);
      const head = tree.querySelector(`[data-section="${CSS.escape(id)}"] .tree-section-head`);
      head.innerHTML = `<label class="sr-only" for="rename-${esc(id)}">Section name</label><input id="rename-${esc(id)}" class="input" type="text" maxlength="60" value="${esc(s.title)}">`;
      const input = head.querySelector('input');
      let done = false;
      const finish = keep => {
        if (done) return;
        done = true;
        if (keep && input.value.trim()) s.title = input.value.trim();
        render();
        tree.querySelector(`[data-section="${CSS.escape(id)}"] [data-act="rename"]`)?.focus();
      };
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
        if (ev.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
      input.focus();
      input.select();
    }

    $('#new-section').addEventListener('click', () => {
      $('#new-section-form').hidden = false;
      $('#new-section-name').focus();
    });
    $('#new-section-form').addEventListener('submit', ev => {
      ev.preventDefault();
      const title = $('#new-section-name').value.trim();
      if (!title) return;
      model.sections.push({ id: randomId('s'), title });
      $('#new-section-name').value = '';
      $('#new-section-form').hidden = true;
      render();
    });

    $('#new-page').addEventListener('click', () => {
      if (!model.sections.length) {
        toast('Add a section first.', true);
        $('#new-section').click();
        return;
      }
      const sectionId = current()?.sectionId ?? model.sections[0].id;
      let slug = 'untitled-page';
      for (let n = 2; model.pages.some(p => p.slug === slug); n++) slug = `untitled-page-${n}`;
      const p = { id: randomId('p'), sectionId, title: 'Untitled page', slug, body: '', published: false, kind: 'page' };
      model.pages.push(p);
      movePage(p.id, sectionId, null);
      autoSlug.add(p.id);
      select(p.id);
      e.title.focus();
      e.title.select();
    });

    $('#delete-page').addEventListener('click', ev => {
      const btn = ev.currentTarget;
      if (!armed(btn, 'Click again to delete')) return;
      const list = ordered();
      const i = list.findIndex(p => p.id === currentId);
      model.pages = model.pages.filter(p => p.id !== currentId);
      select((list[i + 1] ?? list[i - 1])?.id ?? null);
      toast('Page removed. Publish changes to make it final, or Discard to bring it back.');
    });

    $('#discard').addEventListener('click', () => {
      model = structuredClone(saved);
      if (!current()) currentId = model.pages[0]?.id ?? null;
      autoSlug.clear();
      render();
      toast('Changes discarded.');
    });

    async function publish() {
      const slugs = new Map();
      for (const p of model.pages) {
        if (!p.title.trim()) { select(p.id); e.title.focus(); return toast('Every page needs a title.', true); }
        if (!p.slug) { select(p.id); e.slug.focus(); return toast(`"${p.title}" needs a URL.`, true); }
        if (slugs.has(p.slug)) { select(p.id); e.slug.focus(); return toast(`"${p.title}" and "${slugs.get(p.slug)}" use the same URL.`, true); }
        slugs.set(p.slug, p.title);
      }
      const sent = JSON.stringify(model);
      try {
        const res = await withBusy($('#publish-docs'), () => api('PUT', '/api/admin/docs', JSON.parse(sent)));
        saved = res.docs;
        if (JSON.stringify(model) === sent) {
          model = structuredClone(saved);
          autoSlug.clear();
          render();
        } else {
          renderTree(); // edits made while publishing: keep them, still unsaved
          updateDirty();
        }
        toast('Docs published.');
      } catch (err) {
        toast(err.message, true);
        updateDirty();
      }
    }
    $('#publish-docs').addEventListener('click', publish);

    render();
  }

  // ================================================================ Site content

  function content() {
    const form = $('#content-form');
    const errorEl = $('#content-error');
    const savedAt = $('#saved-at');
    const snapshot = () => JSON.stringify([...new FormData(form)]) + $('#c-labels').checked;
    let clean = snapshot();

    if (data.savedAt) savedAt.textContent = `Last saved ${fmtDateTime(data.savedAt)}`;
    if (location.hash === '#links') $('#c-repo').focus();

    window.addEventListener('beforeunload', ev => { if (snapshot() !== clean) { ev.preventDefault(); ev.returnValue = ''; } });

    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      errorEl.hidden = true;
      const body = Object.fromEntries(new FormData(form));
      body.showStatusLabels = $('#c-labels').checked;
      if (!body.name.trim()) {
        errorEl.textContent = 'The site needs a name.';
        errorEl.hidden = false;
        $('#c-name').focus();
        return;
      }
      const buttons = form.querySelectorAll('button[type="submit"]');
      buttons.forEach(b => { b.disabled = true; });
      const sent = snapshot();
      try {
        const res = await api('PUT', '/api/admin/content', body);
        clean = sent;
        savedAt.textContent = `Last saved ${fmtDateTime(res.content.updatedAt)}`;
        document.querySelectorAll('.admin-brand .brand-name').forEach(n => { n.textContent = res.content.name; });
        toast('Saved. The site is updated.');
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      } finally {
        buttons.forEach(b => { b.disabled = false; });
      }
    });
  }

  // ================================================================ Security

  function security() {
    let passkeys = data.passkeys;
    const list = $('#passkey-list');
    const addBtn = $('#passkey-add');
    const nameInput = $('#passkey-name');
    const errorEl = $('#passkey-error');
    const setError = msg => { errorEl.textContent = msg; errorEl.hidden = !msg; };

    function render() {
      list.innerHTML = passkeys.length ? passkeys.map(p => `<li class="passkey-item">
<span class="passkey-icon" aria-hidden="true">${ICON.key}</span>
<div class="passkey-text"><span class="passkey-name">${esc(p.name)}</span><span class="passkey-meta">Added ${esc(fmtDate(p.createdAt))} · ${p.lastUsedAt ? `last used ${esc(ago(p.lastUsedAt))}` : 'not used yet'}</span></div>
<button type="button" class="btn-danger" data-id="${esc(p.id)}">${ICON.trashSm}<span class="sr-only">${esc(p.name)}: </span><span>Remove</span></button>
</li>`).join('') : '<li class="passkey-empty">No passkeys yet. Add one to sign in without the password.</li>';
    }
    render();

    if (!window.eggPasskey?.supported) {
      addBtn.disabled = true;
      setError("This browser doesn't support passkeys.");
      return;
    }

    $('#passkey-form').addEventListener('submit', ev => {
      ev.preventDefault();
      setError('');
      withBusy(addBtn, async () => {
        try {
          const response = await eggPasskey.create(await api('POST', '/api/admin/passkeys/options'));
          ({ passkeys } = await api('POST', '/api/admin/passkeys', { name: nameInput.value, response }));
          nameInput.value = '';
          render();
          toast('Passkey added. Use it next time you sign in.');
        } catch (err) {
          setError(eggPasskey.message(err));
        }
      });
    });

    list.addEventListener('click', async ev => {
      const btn = ev.target.closest('button[data-id]');
      if (!btn || !armed(btn, 'Click again to remove')) return;
      disarm(btn);
      try {
        ({ passkeys } = await api('DELETE', `/api/admin/passkeys/${encodeURIComponent(btn.dataset.id)}`));
        render();
        toast('Passkey removed.');
      } catch (err) {
        toast(err.message, true);
      }
    });
  }
})();
