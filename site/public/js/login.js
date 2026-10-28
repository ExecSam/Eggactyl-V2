// Passkey sign-in on the login page. The password form works without any of this.
(() => {
  const block = document.getElementById('passkey-signin');
  if (!block || !window.eggPasskey?.supported) return;
  const button = document.getElementById('passkey-button');
  const errorEl = document.getElementById('passkey-error');
  block.hidden = false;
  document.getElementById('password-button').classList.replace('btn-primary', 'btn-ghost');

  async function post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    let json = {};
    try { json = await res.json(); } catch { /* empty or non-JSON body */ }
    if (!res.ok) throw new Error(json.error || `The server said ${res.status}.`);
    return json;
  }

  button.addEventListener('click', async () => {
    errorEl.hidden = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      const response = await eggPasskey.get(await post('/admin/passkey/options', {}));
      const { next } = await post('/admin/passkey/verify', { response, next: document.querySelector('input[name="next"]').value });
      location.href = next;
    } catch (err) {
      errorEl.textContent = eggPasskey.message(err);
      errorEl.hidden = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });
})();
