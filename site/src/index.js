import { createApp } from './server.js';

const port = Number(process.env.PORT) || 3000;
const { app, sync, auth } = createApp({ dataDir: process.env.DATA_DIR || 'data' });

if (!auth.enabled) console.warn('ADMIN_PASSWORD is not set, so the admin panel is turned off.');

const server = app.listen(port, () => console.log(`Eggactyl site listening on port ${port}`));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    sync.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
