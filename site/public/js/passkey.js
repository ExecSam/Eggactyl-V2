// WebAuthn helpers shared by the sign-in page and Admin → Security: options JSON from the server in, credential JSON out.
(() => {
  const toBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
  const toB64 = buf => {
    let s = '';
    for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const withIds = list => (list ?? []).map(c => ({ ...c, id: toBytes(c.id) }));
  const base = cred => ({
    id: cred.id,
    rawId: toB64(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults(),
  });

  async function create(o) {
    const cred = await navigator.credentials.create({
      publicKey: { ...o, challenge: toBytes(o.challenge), user: { ...o.user, id: toBytes(o.user.id) }, excludeCredentials: withIds(o.excludeCredentials) },
    });
    const r = cred.response;
    return {
      ...base(cred),
      response: { clientDataJSON: toB64(r.clientDataJSON), attestationObject: toB64(r.attestationObject), transports: r.getTransports?.() ?? [] },
    };
  }

  async function get(o) {
    const cred = await navigator.credentials.get({
      publicKey: { ...o, challenge: toBytes(o.challenge), allowCredentials: withIds(o.allowCredentials) },
    });
    const r = cred.response;
    return {
      ...base(cred),
      response: {
        clientDataJSON: toB64(r.clientDataJSON),
        authenticatorData: toB64(r.authenticatorData),
        signature: toB64(r.signature),
        userHandle: r.userHandle ? toB64(r.userHandle) : undefined,
      },
    };
  }

  // Browser errors in words a person can act on.
  function message(err) {
    if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return 'The passkey prompt was closed or timed out.';
    if (err?.name === 'InvalidStateError') return 'This device already has a passkey for this site.';
    if (err?.name === 'SecurityError') return `Passkeys don't work on ${location.host}. Open the site at its public address.`;
    return err?.message || 'Something went wrong. Try again.';
  }

  window.eggPasskey = { supported: Boolean(window.PublicKeyCredential && navigator.credentials), create, get, message };
})();
