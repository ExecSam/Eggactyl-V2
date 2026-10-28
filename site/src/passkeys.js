// Passkey (WebAuthn) sign-in for the admin panel, alongside the password. Registered passkeys live in db.json.
// The relying party is PUBLIC_URL's host; without PUBLIC_URL (local dev) it's whatever host the request came in on.
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const CHALLENGE_MS = 5 * 60 * 1000;
const MAX_CHALLENGES = 1000;
const USER_ID = new TextEncoder().encode('eggactyl-admin'); // one admin account, so one fixed user handle

export function createPasskeys(store, { publicUrl } = {}) {
  const { data } = store;
  const challenges = new Map(); // challenge -> expiry. Each one works once.

  const rp = req => {
    if (publicUrl) {
      const u = new URL(publicUrl);
      return { id: u.hostname, origin: u.origin };
    }
    return { id: req.hostname, origin: `${req.protocol}://${req.get('host')}` };
  };

  function remember(challenge) {
    const now = Date.now();
    if (challenges.size >= MAX_CHALLENGES) {
      for (const [c, exp] of challenges) if (exp < now) challenges.delete(c);
      while (challenges.size >= MAX_CHALLENGES) challenges.delete(challenges.keys().next().value);
    }
    challenges.set(challenge, now + CHALLENGE_MS);
  }

  const take = challenge => {
    const exp = challenges.get(challenge);
    challenges.delete(challenge);
    return exp > Date.now();
  };

  return {
    get any() { return data.passkeys.length > 0; },

    list: () => data.passkeys.map(({ id, name, createdAt, lastUsedAt }) => ({ id, name, createdAt, lastUsedAt })),

    async registrationOptions(req) {
      const options = await generateRegistrationOptions({
        rpName: data.content.name,
        rpID: rp(req).id,
        userID: USER_ID,
        userName: 'admin',
        userDisplayName: `${data.content.name} admin`,
        attestationType: 'none',
        excludeCredentials: data.passkeys.map(p => ({ id: p.id, transports: p.transports })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      });
      remember(options.challenge);
      return options;
    },

    // Returns the saved passkey, or null if the browser's response doesn't check out.
    async register(req, response, name) {
      const { id: rpID, origin } = rp(req);
      const { verified, registrationInfo: info } = await verifyRegistrationResponse({
        response, expectedChallenge: take, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      }).catch(() => ({ verified: false }));
      if (!verified || data.passkeys.some(p => p.id === info.credential.id)) return null;
      const passkey = {
        id: info.credential.id,
        publicKey: Buffer.from(info.credential.publicKey).toString('base64url'),
        counter: info.credential.counter,
        transports: info.credential.transports ?? [],
        name: String(name ?? '').trim().slice(0, 60) || `Passkey ${data.passkeys.length + 1}`,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      };
      data.passkeys.push(passkey);
      store.save();
      return passkey;
    },

    remove(id) {
      const i = data.passkeys.findIndex(p => p.id === id);
      if (i < 0) return false;
      data.passkeys.splice(i, 1);
      store.save();
      return true;
    },

    async authenticationOptions(req) {
      // No allowCredentials: passkeys are discoverable, so the browser offers whichever ones it holds for this site.
      const options = await generateAuthenticationOptions({ rpID: rp(req).id, userVerification: 'required' });
      remember(options.challenge);
      return options;
    },

    // True if the response is a valid signature from one of the registered passkeys.
    async authenticate(req, response) {
      const passkey = data.passkeys.find(p => p.id === response?.id);
      if (!passkey) return false;
      const { id: rpID, origin } = rp(req);
      const { verified, authenticationInfo } = await verifyAuthenticationResponse({
        response,
        expectedChallenge: take,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: { id: passkey.id, publicKey: Buffer.from(passkey.publicKey, 'base64url'), counter: passkey.counter, transports: passkey.transports },
      }).catch(() => ({ verified: false }));
      if (!verified) return false;
      passkey.counter = authenticationInfo.newCounter;
      passkey.lastUsedAt = new Date().toISOString();
      store.save();
      return true;
    },
  };
}
