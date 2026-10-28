// Release helpers. Versions are stored without the leading "v" (2.0.2) and shown with it (v2.0.2).

export const VERSION_RE = /^\d+(\.\d+){0,3}([-+][0-9A-Za-z.-]+)?$/;
export const normVersion = v => String(v ?? '').trim().replace(/^v/i, '');

export function compareVersions(a, b) {
  const [coreA, preA] = String(a).split(/-(.*)/s);
  const [coreB, preB] = String(b).split(/-(.*)/s);
  const pa = coreA.split('+')[0].split('.').map(Number);
  const pb = coreB.split('+')[0].split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  if (preA && !preB) return -1; // 2.1.0-rc1 comes before 2.1.0
  if (!preA && preB) return 1;
  return String(preA ?? '').localeCompare(String(preB ?? ''), 'en', { numeric: true }); // rc.10 after rc.9
}

// Newest first.
export const sortReleases = list => [...list].sort((a, b) =>
  compareVersions(b.version, a.version) || String(b.date ?? '').localeCompare(String(a.date ?? '')));

export const published = list => sortReleases(list.filter(r => r.status === 'published'));

// The release the download button points at: the one marked latest, otherwise the newest published one.
export function latestRelease(list) {
  const pub = published(list);
  return pub.find(r => r.latest) ?? pub[0] ?? null;
}

export function setLatest(list, id) {
  for (const r of list) r.latest = r.id === id;
}

export const downloadPath = r => (r?.file ? `/download/v${r.version}/${encodeURIComponent(r.file.name)}` : null);

export const anchorFor = r => `v${String(r.version).replace(/[^0-9A-Za-z]+/g, '-')}`;

export const today = () => new Date().toISOString().slice(0, 10);
