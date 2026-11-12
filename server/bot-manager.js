import { EventEmitter } from 'node:events';
import { mkdir } from 'node:fs/promises';
import mineflayer from 'mineflayer';
import { loadBotConfigs } from './config-loader.js';
import { inventorySnapshot, openWindowSnapshot } from './item-snapshot.js';
import { botManagerProfileMethods } from './bot-manager-profile-methods.js';
import { botManagerInventoryMethods } from './bot-manager-inventory-methods.js';
import { botManagerCommandMethods } from './bot-manager-command-methods.js';
import { botManagerConnectionMethods } from './bot-manager-connection-methods.js';
import { botManagerRetryMethods } from './bot-manager-retry-methods.js';
import { onlinePlayersSnapshot, playerStatsSnapshot, positionSnapshot, profileSnapshot } from './bot-manager-state.js';
import { botManagerEventMethods } from './bot-manager-event-methods.js';
import { botManagerSkinMethods } from './bot-manager-skin-methods.js';

export class BotManager extends EventEmitter {
    constructor({
        configDir,
        authDir,
        createBot = mineflayer.createBot,
        connectTimeoutMs = 45_000,
        stopTimeoutMs = 3_000,
        reconnectBaseMs = 5_000,
        reconnectMaxMs = 120_000,
        loginRetryBaseMs = 60_000,
        loginRetryMaxMs = 600_000,
        maxLogs = 200,
        joinCommandDelayMs = 6_000,
        botSettings = null,
        fetchImpl = globalThis.fetch,
        logger = console
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
        this.loginRetryBaseMs = loginRetryBaseMs;
        this.loginRetryMaxMs = loginRetryMaxMs;
        this.maxLogs = maxLogs;
        this.joinCommandDelayMs = joinCommandDelayMs;
        this.botSettings = botSettings;
        this.fetchImpl = fetchImpl;
        this.logger = logger;
        this.records = new Map();
        this.skinLookupQueue = Promise.resolve();
        this.skinLookupPromises = new Map();
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
        let configs;
        if (this.botSettings?.listProfiles) {
            if (this.botSettings.needsLegacyImport()) {
                this.botSettings.importLegacyProfiles(await loadBotConfigs(this.configDir, this.authDir));
            }
            configs = this.botSettings.listProfiles(this.authDir);
        } else {
            configs = await loadBotConfigs(this.configDir, this.authDir);
        }
        this.records = new Map(configs.map(config => [config.id, this.createRecord(config)]));
        for (const record of this.records.values()) this.scheduleSkinLookup(record);
        this.publishSnapshot();
        return this.getSnapshot();
    }

    getSnapshot() {
        return [...this.records.values()].map(record => ({
            ...this.publicState(record),
            logs: [...record.logs],
            directMessages: [...record.directMessages]
        }));
    }

    publishSnapshot() {
        this.emit('snapshot', this.getSnapshot());
    }

    publicState(record) {
        const bot = record.status === 'online' ? record.bot : null;
        const entityPosition = bot?.entity?.position;
        const onlinePlayers = bot ? onlinePlayersSnapshot(bot) : [];
        return {
            id: record.id,
            username: record.config.username,
            host: record.config.host,
            port: record.config.port,
            profile: profileSnapshot(record.config),
            autoStart: this.botSettings?.getAutoStart(record.id) ?? true,
            authentication: { ...record.authentication },
            skinUrl: record.skinUrl || onlinePlayers.find(player => player.isSelf)?.skinUrl || null,
            status: record.status,
            uptimeSeconds: record.connectedAt ? Math.floor((Date.now() - record.connectedAt) / 1000) : 0,
            position: positionSnapshot(entityPosition),
            dimension: bot?.game?.dimension ?? null,
            playerStats: playerStatsSnapshot(bot),
            onlinePlayers,
            openWindow: bot ? openWindowSnapshot(bot.currentWindow, bot.registry) : null,
            lastError: record.lastError,
            inventory: bot ? inventorySnapshot(bot) : []
        };
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
        if (record.authentication.status === 'required') {
            record.authentication = { status: 'cancelled' };
            this.emitAuthenticationState(record);
        }

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

    createRecord(config) {
        return {
            id: config.id,
            config,
            status: 'stopped',
            desired: false,
            bot: null,
            logs: [],
            directMessages: [],
            lastError: null,
            connectedAt: null,
            reconnectTimer: null,
            retryClass: null,
            connectPromise: null,
            completionQueue: Promise.resolve(),
            completionSequence: 0,
            inventoryActionQueue: Promise.resolve(),
            windowActionQueue: Promise.resolve(),
            attempts: 0,
            authentication: { status: 'idle' },
            skinUrl: null
        };
    }

    requireRecord(id) {
        const record = this.records.get(id);
        if (!record) throw new Error(`Unknown bot: ${id}`);
        return record;
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

Object.assign(BotManager.prototype, botManagerProfileMethods);
Object.assign(BotManager.prototype, botManagerSkinMethods);
Object.assign(BotManager.prototype, botManagerInventoryMethods, botManagerCommandMethods);
Object.assign(BotManager.prototype, botManagerConnectionMethods, botManagerRetryMethods);
Object.assign(BotManager.prototype, botManagerEventMethods);