import { EventEmitter } from 'node:events';
import { mkdir } from 'node:fs/promises';
import mineflayer from 'mineflayer';
import { loadBotConfigs } from './config-loader.js';
import { ansiToColorRuns } from './chat-colors.js';

const tokenPattern = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const redact = value => String(value).replace(tokenPattern, '[REDACTED TOKEN]');

export class BotManager extends EventEmitter {
    constructor({
        configDir,
        authDir,
        createBot = mineflayer.createBot,
        connectTimeoutMs = 45_000,
        stopTimeoutMs = 3_000,
        reconnectBaseMs = 5_000,
        reconnectMaxMs = 120_000,
        maxLogs = 200,
        joinCommandDelayMs = 2_000
    }) {
        super();
        if (!configDir || !authDir) throw new Error('configDir and authDir are required');

        this.configDir = configDir;
        this.authDir = authDir;
        this.createBot = createBot;
        this.connectTimeoutMs = connectTimeoutMs;
        this.stopTimeoutMs = stopTimeoutMs;
        this.reconnectBaseMs = reconnectBaseMs;
        this.reconnectMaxMs = reconnectMaxMs;
        this.maxLogs = maxLogs;
            this.joinCommandDelayMs = joinCommandDelayMs;
        this.records = new Map();
        this.connectionQueue = Promise.resolve();
        this.shuttingDown = false;
        this.stateTimer = setInterval(() => {
            for (const record of this.records.values()) {
                if (record.status === 'online') this.emitState(record);
            }
        }, 2000);
        this.stateTimer.unref?.();
    }

    async initialize() {
        await mkdir(this.authDir, { recursive: true });
        const configs = await loadBotConfigs(this.configDir, this.authDir);
        this.records = new Map(configs.map(config => [config.id, {
            id: config.id,
            config,
            status: 'stopped',
            desired: false,
            bot: null,
            logs: [],
            lastError: null,
            connectedAt: null,
            reconnectTimer: null,
            connectPromise: null,
            attempts: 0
        }]));
        this.publishSnapshot();
        return this.getSnapshot();
    }

    getSnapshot() {
        return [...this.records.values()].map(record => this.publicState(record));
    }

    publishSnapshot() {
        this.emit('snapshot', this.getSnapshot());
    }

    publicState(record) {
        const entityPosition = record.status === 'online' ? record.bot?.entity?.position : null;
        return {
            id: record.id,
            username: record.config.username,
            host: record.config.host,
            port: record.config.port,
            status: record.status,
            uptimeSeconds: record.connectedAt ? Math.floor((Date.now() - record.connectedAt) / 1000) : 0,
            position: entityPosition ? {
                x: Number(entityPosition.x.toFixed(1)),
                y: Number(entityPosition.y.toFixed(1)),
                z: Number(entityPosition.z.toFixed(1))
            } : null,
            lastError: record.lastError,
            logs: [...record.logs]
        };
    }

    async startAllSequential() {
        const outcomes = [];
        for (const id of this.records.keys()) {
            if (this.shuttingDown) break;
            try {
                outcomes.push(await this.start(id));
            } catch (error) {
                outcomes.push({ id, status: 'reconnecting', error: redact(error.message) });
            }
        }
        return outcomes;
    }

    start(id) {
        const record = this.requireRecord(id);
        if (this.shuttingDown) throw new Error('Bot manager is shutting down');
        if (record.status === 'online') return Promise.resolve(this.publicState(record));
        if (record.connectPromise) return record.connectPromise;

        record.desired = true;
        clearTimeout(record.reconnectTimer);
        record.reconnectTimer = null;
        return this.queueConnection(record);
    }

    async stop(id) {
        const record = this.requireRecord(id);
        record.desired = false;
        clearTimeout(record.reconnectTimer);
        record.reconnectTimer = null;

        const bot = record.bot;
        if (!bot) {
            record.status = 'stopped';
            record.connectedAt = null;
            this.emitState(record);
            return this.publicState(record);
        }

        record.status = 'stopping';
        this.emitState(record);
        return new Promise(resolveStop => {
            let finished = false;
            const finish = () => {
                if (finished) return;
                finished = true;
                clearTimeout(timeout);
                if (record.bot === bot) record.bot = null;
                record.status = 'stopped';
                record.connectedAt = null;
                this.emitState(record);
                resolveStop(this.publicState(record));
            };
            const timeout = setTimeout(() => {
                try { bot._client?.end(); } catch {}
                finish();
            }, this.stopTimeoutMs);
            bot.once('end', finish);
            try {
                bot.quit('Stopped from dashboard');
            } catch {
                finish();
            }
        });
    }

    async stopAll() {
        await Promise.all([...this.records.keys()].map(id => this.stop(id)));
    }

    sendCommand(id, command) {
        const record = this.requireRecord(id);
        if (typeof command !== 'string' || !command.trim()) throw new Error('Command cannot be empty');
        if (command.length > 256) throw new Error('Command cannot exceed 256 characters');
        if (/[\r\n]/.test(command)) throw new Error('Commands must be a single line');
        if (!command.trim().startsWith('/') || command.trim() === '/') throw new Error('Command must be a slash command');
        if (record.status !== 'online' || !record.bot || record.bot._client?.state !== 'play') {
            throw new Error(`${record.config.username} is not online`);
        }

        const text = command.trim();
        record.bot.chat(text);
        this.appendLog(record, `You: ${text}`);
        return { id, sent: text };
    }

    async completeCommand(id, command) {
        const record = this.requireRecord(id);
        if (typeof command !== 'string' || !command.trim().startsWith('/')) {
            throw new Error('Completion requires a slash command');
        }
        if (command.length > 256 || /[\r\n]/.test(command)) {
            throw new Error('Command must be a single line of at most 256 characters');
        }
        if (record.status !== 'online' || !record.bot || record.bot._client?.state !== 'play') {
            throw new Error(`${record.config.username} is not online`);
        }

        const matches = await record.bot.tabComplete(command.trimStart(), true, false, 3000);
        return (Array.isArray(matches) ? matches : [])
            .map(entry => typeof entry === 'string' ? entry : entry?.match)
            .filter(match => typeof match === 'string' && match.length > 0)
            .slice(0, 25);
    }

    requireRecord(id) {
        const record = this.records.get(id);
        if (!record) throw new Error(`Unknown bot: ${id}`);
        return record;
    }

    queueConnection(record) {
        if (record.connectPromise) return record.connectPromise;
        const attempt = this.connectionQueue.then(() => this.connectOnce(record));
        record.connectPromise = attempt;
        this.connectionQueue = attempt.catch(() => {});
        attempt.finally(() => {
            if (record.connectPromise === attempt) record.connectPromise = null;
        }).catch(() => {});
        return attempt;
    }

    connectOnce(record) {
        if (!record.desired || this.shuttingDown) throw new Error('Bot start was cancelled');

        record.status = 'connecting';
        record.lastError = null;
        record.attempts += 1;
        this.emitState(record);

        const config = record.config;
        let bot;
        try {
            bot = this.createBot({
                username: config.username,
                host: config.host,
                port: config.port,
                auth: config.auth,
                profilesFolder: config.profilesFolder,
                ...(config.version ? { version: config.version } : {})
            });
        } catch (error) {
            this.handleAttemptFailure(record, null, error);
            throw error;
        }

        record.bot = bot;
        return new Promise((resolveConnect, rejectConnect) => {
            let settled = false;
            let spawned = false;
            const timeout = setTimeout(() => {
                fail(new Error(`Connection timed out after ${this.connectTimeoutMs}ms`));
            }, this.connectTimeoutMs);

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
                record.lastError = null;
                record.connectedAt = Date.now();
                this.appendLog(record, `Connected to ${config.host}:${config.port}`);
                this.emitState(record);
                void this.runOnJoin(record, bot);
                resolveConnect(this.publicState(record));
            });

            bot.on('message', component => {
                const text = component?.toString?.() ?? String(component);
                const formatted = component?.toAnsi?.() ?? text;
                this.appendLog(record, text, ansiToColorRuns(redact(formatted)));
            });
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

    handleAttemptFailure(record, bot, error) {
        if (record.bot === bot) record.bot = null;
        record.connectedAt = null;
        record.lastError = redact(error?.message || error);
        this.appendLog(record, `Connection failed: ${record.lastError}`);
        if (record.desired && !this.shuttingDown) {
            record.status = 'reconnecting';
            this.scheduleReconnect(record);
        } else {
            record.status = 'stopped';
        }
        this.emitState(record);
        try { bot?.quit('Connection attempt failed'); } catch {}
    }

    async runOnJoin(record, bot) {
        for (const command of record.config.onJoin) {
            await new Promise(resolveDelay => setTimeout(resolveDelay, this.joinCommandDelayMs));
            if (!record.desired || this.shuttingDown || record.bot !== bot || record.status !== 'online') return;

            try {
                bot.chat(command);
                this.appendLog(record, `You: ${command}`);
            } catch (error) {
                this.appendLog(record, `Join command failed: ${error.message}`);
            }
        }
    }

    scheduleReconnect(record) {
        if (!record.desired || this.shuttingDown || record.reconnectTimer) return;
        const exponent = Math.min(Math.max(record.attempts - 1, 0), 5);
        const delay = Math.min(this.reconnectMaxMs, this.reconnectBaseMs * 2 ** exponent);
        this.appendLog(record, `Retrying in ${Math.round(delay / 1000)}s`);
        record.reconnectTimer = setTimeout(() => {
            record.reconnectTimer = null;
            if (record.desired && !this.shuttingDown) {
                this.queueConnection(record).catch(() => {});
            }
        }, delay);
    }

    appendLog(record, text, colorRuns) {
        const entry = { at: new Date().toISOString(), text: redact(text) };
        if (colorRuns) entry.colorRuns = colorRuns;
        record.logs.push(entry);
        if (record.logs.length > this.maxLogs) record.logs.splice(0, record.logs.length - this.maxLogs);
        this.emit('bot-log', { id: record.id, entry });
    }

    emitState(record) {
        this.emit('bot-state', this.publicState(record));
    }

    async close() {
        this.shuttingDown = true;
        clearInterval(this.stateTimer);
        for (const record of this.records.values()) {
            record.desired = false;
            clearTimeout(record.reconnectTimer);
            record.reconnectTimer = null;
        }
        await this.stopAll();
    }
}