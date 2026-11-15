import { resolve } from 'node:path';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { BotManager } from './bot-manager.js';
import { BotSettings } from './bot-settings.js';
import { SavedMessages } from './saved-messages.js';
import { PinBoards } from './pin-boards.js';
import { createControlServer } from './ws.js';
import { NotificationSettings } from './notification-settings.js';
import { PushNotifications } from './push-notifications.js';
import { NotificationMonitor } from './notification-monitor.js';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = resolve(projectRoot, process.env.MINECLANK_DATA_DIR || '.data');
const botSettings = new BotSettings(resolve(dataDir, 'bots.sqlite'), {
    legacySettingsPath: resolve(dataDir, 'bot-settings.json')
});
const manager = new BotManager({
    configDir: resolve(projectRoot, 'configs', 'bots'),
    authDir: resolve(projectRoot, '.auth'),
    botSettings
});
await manager.initialize();
const savedMessages = new SavedMessages(
    resolve(dataDir, 'saved-messages.sqlite')
);
const pinBoards = new PinBoards(resolve(dataDir, 'pin-boards.sqlite'));
const notificationSettings = new NotificationSettings(resolve(dataDir, 'notifications.sqlite'));
const pushNotifications = new PushNotifications(notificationSettings, { subject: process.env.PUSH_VAPID_SUBJECT || 'mailto:admin@localhost' });
const notificationMonitor = new NotificationMonitor(manager, notificationSettings, pushNotifications);
const botIds = new Set(manager.getSnapshot().map(bot => bot.id));
const messageIds = new Set(savedMessages.list().map(message => message.id));
for (const [id, pins] of Object.entries(pinBoards.listAll())) {
    if (!botIds.has(id)) pinBoards.deleteBot(id);
    else for (const pin of pins) {
        if (pin.type === 'message' && !messageIds.has(pin.ref)) pinBoards.set(id, pin, false);
    }
}
for (const id of Object.keys(notificationSettings.listAll())) {
    if (!botIds.has(id)) notificationSettings.deleteBot(id);
}
const controlServer = createControlServer({ manager, savedMessages, pinBoards, notificationSettings, pushNotifications, notificationMonitor });
const address = await controlServer.listen();
console.info(`[server] Listening on ${address.address}:${address.port}`);
console.info(`[server] Loaded ${manager.getSnapshot().length} bot config(s)`);
void manager.startAllSequential();

let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[server] ${signal}: stopping bots and HTTP service`);
    notificationMonitor.close();
    await manager.close();
    await controlServer.close();
    await pushNotifications.close();
    savedMessages.close();
    pinBoards.close();
    notificationSettings.close();
    botSettings.close();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));