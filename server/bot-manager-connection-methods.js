import { ansiToColorRuns } from './chat-colors.js';
import { extractPlayerLinks } from './chat-player-links.js';
import { redact } from './bot-manager-utils.js';
import { onlinePlayersSnapshot } from './bot-manager-state.js';
import { parseIncomingDirectMessage } from './bot-manager-event-methods.js';

export const botManagerConnectionMethods = {
    queueConnection(record) {
        if (record.connectPromise) return record.connectPromise;
        const attempt = this.connectionQueue.then(() => this.connectOnce(record));
        record.connectPromise = attempt;
        this.connectionQueue = attempt.catch(() => {});
        attempt.finally(() => {
            if (record.connectPromise === attempt) record.connectPromise = null;
        }).catch(() => {});
        return attempt;
    },

    connectOnce(record) {
        if (!record.desired || this.shuttingDown) throw new Error('Bot start was cancelled');
        record.status = 'connecting';
        record.lastError = null;
        record.attempts += 1;
        this.emitState(record);

        const config = record.config;
        let bot;
        let pendingMsaCode = null;
        const onMsaCode = data => {
            if (!bot) {
                pendingMsaCode = data;
                return;
            }
            this.handleMsaCode(record, bot, data);
        };
        try {
            bot = this.createBot({
                username: config.username,
                host: config.host,
                port: config.port,
                auth: config.auth,
                profilesFolder: config.profilesFolder,
                physicsEnabled: config.physicsEnabled,
                ...(config.auth === 'microsoft' ? { onMsaCode } : {}),
                ...(config.version ? { version: config.version } : {})
            });
        } catch (error) {
            this.handleAttemptFailure(record, null, error);
            throw error;
        }

        record.bot = bot;
        if (pendingMsaCode) this.handleMsaCode(record, bot, pendingMsaCode);
        return new Promise((resolveConnect, rejectConnect) => {
            let settled = false;
            let spawned = false;
            let onlinePlayersSignature = JSON.stringify(onlinePlayersSnapshot(bot));
            const timeout = setTimeout(() => fail(new Error(`Connection timed out after ${this.connectTimeoutMs}ms`)), this.connectTimeoutMs);
            const refreshOnlinePlayers = () => {
                const players = onlinePlayersSnapshot(bot);
                const signature = JSON.stringify(players);
                if (signature === onlinePlayersSignature) return;
                onlinePlayersSignature = signature;
                if (record.bot === bot && record.status === 'online') this.emitState(record);
            };
            const fail = error => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                this.handleAttemptFailure(record, bot, error);
                rejectConnect(error);
            };

            bot.once('spawn', () => {
                if (settled || !record.desired || record.bot !== bot) return;
                settled = true;
                spawned = true;
                clearTimeout(timeout);
                record.status = 'online';
                record.attempts = 0;
                record.retryClass = null;
                record.lastError = null;
                record.connectedAt = Date.now();
                if (config.auth === 'microsoft') record.authentication = { status: 'authenticated' };
                this.appendLog(record, `Connected to ${config.host}:${config.port}`);
                const client = bot._client;
                const secureChat = client?.serverFeatures?.enforcesSecureChat;
                this.appendLog(
                    record,
                    `Chat security: ${secureChat === undefined ? 'unknown' : secureChat ? 'required' : 'not required'}; ` +
                    `profile key ${client?.profileKeys ? 'available' : 'missing'}; ` +
                    `chat session ${client?._session ? 'available' : 'missing'}`
                );
                this.appendLog(record, `Physics simulation: ${config.physicsEnabled ? 'enabled' : 'disabled'}`);
                this.emitState(record);
                this.emitAuthenticationState(record);
                void this.runOnJoin(record, bot);
                resolveConnect(this.publicState(record));
            });

            bot.on('message', component => {
                const text = component?.toString?.() ?? String(component);
                const formatted = component?.toAnsi?.() ?? text;
                const safeText = redact(text);
                this.appendLog(record, safeText, ansiToColorRuns(redact(formatted)), extractPlayerLinks(safeText, bot.players));
                this.appendDirectMessage(record, parseIncomingDirectMessage(safeText));
            });
            bot.on('windowOpen', () => this.emitState(record));
            bot.on('windowClose', () => this.emitState(record));
            bot.on('playerJoined', refreshOnlinePlayers);
            bot.on('playerUpdated', refreshOnlinePlayers);
            bot.on('playerLeft', refreshOnlinePlayers);
            bot.on('kicked', reason => {
                const text = typeof reason === 'string' ? reason : JSON.stringify(reason);
                this.appendLog(record, `Kicked: ${text}`);
                if (!spawned) fail(new Error(`Kicked before spawn: ${text}`));
            });
            bot.on('error', error => {
                this.appendLog(record, `Connection error: ${error.message}`);
                if (!spawned) fail(error);
            });
            bot.on('end', reason => {
                if (record.bot !== bot) return;
                record.bot = null;
                record.connectedAt = null;
                if (!spawned) {
                    fail(new Error(`Connection ended before spawn${reason ? `: ${reason}` : ''}`));
                    return;
                }
                if (record.desired && !this.shuttingDown) {
                    record.status = 'reconnecting';
                    this.appendLog(record, `Disconnected${reason ? `: ${reason}` : ''}`);
                    this.emitState(record);
                    this.scheduleReconnect(record);
                } else {
                    record.status = 'stopped';
                    this.emitState(record);
                }
            });
        });
    }
};