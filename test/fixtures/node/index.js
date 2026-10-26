const { version } = require('discord.js');
console.log(`BOT OK node ${process.version} discord.js ${version}`);
process.on('SIGINT', () => { console.log('BOT got SIGINT, shutting down cleanly'); process.exit(0); });
setInterval(() => {}, 1000);
