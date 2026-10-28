// The whole site lives in one JSON file (db.json) plus mirrored egg files, all under DATA_DIR.
// Writes are synchronous and atomic (write a temp file, then rename), so a crash never leaves a half-written db.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { seed, migrate } from './seed.js';

export function createStore(dir) {
  const dataDir = path.resolve(dir);
  const filesDir = path.join(dataDir, 'files');
  fs.mkdirSync(filesDir, { recursive: true });
  const dbFile = path.join(dataDir, 'db.json');

  let data;
  if (fs.existsSync(dbFile)) {
    data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    // Fill in anything added since this db was created.
    const fresh = seed();
    for (const key of Object.keys(fresh)) data[key] ??= fresh[key];
    data.content = { ...fresh.content, ...data.content };
    data.sync = { ...fresh.sync, ...data.sync };
    migrate(data);
  } else {
    data = seed();
  }

  const store = {
    data,
    filesDir,
    save() {
      const tmp = `${dbFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, dbFile);
    },
    // Session-signing secret: SESSION_SECRET if set, otherwise generated once and kept in the data volume.
    secret() {
      if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
      const file = path.join(dataDir, 'secret.key');
      if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
      return fs.readFileSync(file, 'utf8').trim();
    },
  };
  store.save();
  return store;
}

export const newId = () => crypto.randomBytes(6).toString('hex');
