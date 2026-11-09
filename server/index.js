import { resolve } from 'node:path';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { BotManager } from './bot-manager.js';
import { createControlServer } from './ws.js';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manager = new BotManager({
    configDir: resolve(projectRoot, 'configs', 'bots'),
    authDir: resolve(projectRoot, '.auth')
});

await manager.initialize();
const controlServer = createControlServer({ manager });
const address = await controlServer.listen();
console.info(`[server] Listening on ${address.address}:${address.port}`);
console.info(`[server] Loaded ${manager.getSnapshot().length} bot config(s)`);
void manager.startAllSequential();

let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[server] ${signal}: stopping bots and HTTP service`);
    await manager.close();
    await controlServer.close();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));