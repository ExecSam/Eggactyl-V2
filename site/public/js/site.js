// Loaded in <head> so the "js" class is set before the first paint; the mobile menu is wired up once the page has loaded.
document.documentElement.classList.add('js');
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('.menu-btn');
  const nav = document.getElementById('main-nav');
  if (!btn || !nav) return;
  const isOpen = () => btn.getAttribute('aria-expanded') === 'true';
  const set = open => { btn.setAttribute('aria-expanded', String(open)); nav.classList.toggle('is-open', open); };
  btn.addEventListener('click', () => set(!isOpen()));
  nav.addEventListener('click', e => { if (e.target.closest('a')) set(false); });
  document.addEventListener('click', e => { if (isOpen() && !e.target.closest('.site-header')) set(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) { set(false); btn.focus(); } });
});
