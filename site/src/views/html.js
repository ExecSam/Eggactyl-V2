// Tiny templating: html`...` escapes every interpolated value unless it is already Safe (raw() or another html`...`).
import { escapeHtml } from '../markdown.js';

class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const raw = s => new Safe(String(s ?? ''));

const toHtml = v => {
  if (v == null || v === false) return '';
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(toHtml).join('');
  return escapeHtml(v);
};

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += toHtml(v) + strings[i + 1]; });
  return new Safe(out);
}

// JSON for <script type="application/json">: "<" is escaped so the data can't close the tag.
export const jsonScript = (id, data) => raw(`<script type="application/json" id="${id}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const paths = {
  arrowUpRight: '<path d="M7 17 17 7"></path><path d="M8 7h9v9"></path>',
  arrowRight: '<path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path>',
  download: '<path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path>',
  upload: '<path d="M12 15V3"></path><path d="m7 8 5-5 5 5"></path><path d="M5 21h14"></path>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>',
  git: '<circle cx="6" cy="6" r="2.5"></circle><circle cx="6" cy="18" r="2.5"></circle><circle cx="18" cy="7" r="2.5"></circle><path d="M6 8.5v7"></path><path d="M18 9.5c0 4.5-5 4.5-10.3 6.8"></path>',
  history: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"></path><path d="M3 3v5h5"></path><path d="M12 7v5l3 2"></path>',
  search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>',
  chevronRight: '<path d="m9 6 6 6-6 6"></path>',
  package: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"></path><path d="m3 8 9 5 9-5"></path><path d="M12 13v8"></path>',
  pencil: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>',
  user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21c0-4 4-6 8-6s8 2 8 6"></path>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="m16 17 5-5-5-5"></path><path d="M21 12H9"></path>',
  plus: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
  trash: '<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M6 6l1 14h10l1-14"></path>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"></path><path d="M21 3v5h-5"></path>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path>',
  heading: '<path d="M6 4v16"></path><path d="M18 4v16"></path><path d="M6 12h12"></path>',
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z"></path><path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z"></path>',
  italic: '<path d="M19 4h-9"></path><path d="M14 20H5"></path><path d="M15 4 9 20"></path>',
  code: '<path d="m8 8-5 4 5 4"></path><path d="m16 8 5 4-5 4"></path>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"></path><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"></path>',
  list: '<path d="M9 6h11"></path><path d="M9 12h11"></path><path d="M9 18h11"></path><circle cx="4.5" cy="6" r="1"></circle><circle cx="4.5" cy="12" r="1"></circle><circle cx="4.5" cy="18" r="1"></circle>',
  callout: '<rect x="3" y="4" width="18" height="16" rx="3"></rect><path d="M12 9v4"></path><path d="M12 16h.01"></path>',
  swap: '<path d="M17 3l4 4-4 4"></path><path d="M3 7h18"></path><path d="M7 21l-4-4 4-4"></path><path d="M21 17H3"></path>',
  x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
  menu: '<path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path>',
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"></path><path d="m21 2-9.6 9.6"></path><circle cx="7.5" cy="15.5" r="5.5"></circle>',
};

export const icon = (name, size = 18, stroke = 2) =>
  raw(`<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`);

export const moreIcon = raw('<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>');

export const sparkPath = '<path d="M12 1 13.9 10.1 23 12 13.9 13.9 12 23 10.1 13.9 1 12 10.1 10.1Z"></path>';
