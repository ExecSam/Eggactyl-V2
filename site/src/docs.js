// Docs tree: ordered sections, each holding ordered pages. Pages are stored in one array; their order is the reading order.
import { slugify } from './markdown.js';

const ID_RE = /^[\w-]{1,40}$/;

// Published pages in reading order (section order, then page order).
export function orderedPages(docs, { includeDrafts = false } = {}) {
  return docs.sections.flatMap(s => docs.pages.filter(p => p.sectionId === s.id && (includeDrafts || p.published)));
}

export function navTree(docs) {
  return docs.sections
    .map(s => ({ title: s.title, pages: docs.pages.filter(p => p.sectionId === s.id && p.published) }))
    .filter(s => s.pages.length);
}

// Validates a whole docs tree sent by the admin editor and returns the cleaned version, or throws with a message.
export function validateDocs(input, current, now = new Date().toISOString()) {
  const fail = msg => { throw Object.assign(new Error(msg), { status: 400 }); };
  if (!input || !Array.isArray(input.sections) || !Array.isArray(input.pages)) fail('Malformed docs.');
  if (input.sections.length > 50 || input.pages.length > 300) fail('Too many sections or pages.');

  const sectionIds = new Set();
  const sections = input.sections.map(s => {
    const id = String(s?.id ?? '');
    const title = String(s?.title ?? '').trim();
    if (!ID_RE.test(id) || sectionIds.has(id)) fail('Malformed section.');
    if (!title || title.length > 60) fail('Every section needs a name (up to 60 characters).');
    sectionIds.add(id);
    return { id, title };
  });

  const oldById = new Map(current.pages.map(p => [p.id, p]));
  const slugs = new Set();
  const pageIds = new Set();
  // Keep pages grouped by section in the order the sections are listed.
  const pages = input.pages.map(p => {
    const id = String(p?.id ?? '');
    if (!ID_RE.test(id) || pageIds.has(id)) fail('Malformed page.');
    pageIds.add(id);
    const title = String(p.title ?? '').trim();
    if (!title || title.length > 120) fail('Every page needs a title (up to 120 characters).');
    const slug = slugify(String(p.slug ?? '').replace(/^\/?docs\//, '') || title);
    if (!slug) fail(`"${title}" needs a URL made of letters or numbers.`);
    if (slugs.has(slug)) fail(`Two pages use the URL /docs/${slug}.`);
    slugs.add(slug);
    if (!sectionIds.has(p.sectionId)) fail(`"${title}" is in a section that doesn't exist.`);
    const body = String(p.body ?? '');
    if (body.length > 200_000) fail(`"${title}" is too long.`);
    const old = oldById.get(id);
    const page = {
      id, sectionId: p.sectionId, title, slug, body,
      published: p.published !== false,
      kind: old?.kind === 'changelog' ? 'changelog' : 'page', // only the seeded changelog page lists releases
      updatedAt: old?.updatedAt ?? now,
    };
    if (!old || old.title !== title || old.body !== body || old.slug !== slug || old.published !== page.published) page.updatedAt = now;
    return page;
  });
  pages.sort((a, b) => sections.findIndex(s => s.id === a.sectionId) - sections.findIndex(s => s.id === b.sectionId));
  return { sections, pages };
}
