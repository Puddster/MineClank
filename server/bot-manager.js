import { EventEmitter } from 'node:events';
import { mkdir } from 'node:fs/promises';
import mineflayer from 'mineflayer';
import { loadBotConfigs } from './config-loader.js';
import { ansiToColorRuns } from './chat-colors.js';
import { extractPlayerLinks } from './chat-player-links.js';

const tokenPattern = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const redact = value => String(value).replace(tokenPattern, '[REDACTED TOKEN]');
const maxChatLength = 256;
const maxItemTextLength = 160;

function itemComponentText(value) {
    const flatten = (node, depth = 0) => {
        if (depth > 8) return '';
        if (typeof node === 'string') {
            try {
                return flatten(JSON.parse(node), depth + 1);
            } catch {
                return node;
            }
        }
        if (Array.isArray(node)) return node.map(child => flatten(child, depth + 1)).join('');
        if (!node || typeof node !== 'object') return '';
        if (node.type === 'string' && typeof node.value === 'string') return node.value;

        const content = node.type === 'compound' ? node.value : node;
        if (node.type === 'list') return flatten(node.value?.value ?? node.value, depth + 1);
        if (!content || typeof content !== 'object') return '';
        const ownText = flatten(content.text, depth + 1);
        const extraText = flatten(content.extra, depth + 1);
        return ownText + extraText;
    };

    return flatten(value).slice(0, maxItemTextLength);
}

function itemSlotsSnapshot(slots) {
    if (!Array.isArray(slots)) return [];

    return slots.map((item, slot) => {
        if (!item) return null;
        const displayName = typeof item.displayName === 'string'
            ? item.displayName
            : item.displayName?.toString?.();
        let enchantments = [];
        let lore = [];
        try {
            enchantments = (Array.isArray(item.enchants) ? item.enchants : [])
                .filter(enchantment => typeof enchantment?.name === 'string')
                .slice(0, 12)
                .map(enchantment => ({
                    name: enchantment.name.slice(0, 80),
                    level: Number.isInteger(enchantment.lvl) ? enchantment.lvl : 0
                }));
        } catch {}
        try {
            const rawLore = item.customLore;
            const loreLines = Array.isArray(rawLore) ? rawLore : typeof rawLore === 'string' ? [rawLore] : [];
            lore = loreLines.slice(0, 8).map(itemComponentText).filter(Boolean);
        } catch {}
        let customName = null;
        try {
            const nameComponent = item.componentMap?.get('item_name')?.data;
            customName = itemComponentText(item.customName ?? nameComponent) || null;
        } catch {}

        return {
            slot,
            name: item.name || 'Unknown item',
            displayName: displayName || item.name || 'Unknown item',
            count: Number.isInteger(item.count) ? item.count : 1,
            customName,
            enchantments,
            lore
        };
    });
}

function inventorySnapshot(bot) {
    return itemSlotsSnapshot(bot?.inventory?.slots);
}

function openWindowSnapshot(window) {
    if (!window) return null;
    return {
        id: window.id,
        title: window.title?.toString?.() || String(window.title || 'Server Menu'),
        type: String(window.type || 'container'),
        inventoryStart: Number.isInteger(window.inventoryStart) ? window.inventoryStart : window.slots?.length || 0,
        slots: itemSlotsSnapshot(window.slots),
        selectedItem: window.selectedItem ? itemSlotsSnapshot([window.selectedItem])[0] : null
    };
}

function validateSingleLineText(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} cannot be empty`);
    if (value.length > maxChatLength) throw new Error(`${label} cannot exceed ${maxChatLength} characters`);
    if (/[\r\n]/.test(value)) throw new Error(`${label} must be a single line`);
    return value;
}

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
        joinCommandDelayMs = 6_000
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
            completionQueue: Promise.resolve(),
            completionSequence: 0,
            inventoryActionQueue: Promise.resolve(),
            windowActionQueue: Promise.resolve(),
            attempts: 0
        }]));
        this.publishSnapshot();
        return this.getSnapshot();
    }

    getSnapshot() {
        return [...this.records.values()].map(record => ({
            ...this.publicState(record),
            logs: [...record.logs]
        }));
    }

    publishSnapshot() {
        this.emit('snapshot', this.getSnapshot());
    }

    publicState(record) {
        const bot = record.status === 'online' ? record.bot : null;
        const entityPosition = bot?.entity?.position;
        const dimension = bot?.game?.dimension ?? null;
        const playerStats = bot ? {
            health: Number.isFinite(bot.health) ? bot.health : null,
            food: Number.isFinite(bot.food) ? bot.food : null,
            foodSaturation: Number.isFinite(bot.foodSaturation) ? bot.foodSaturation : null,
            oxygenLevel: Number.isFinite(bot.oxygenLevel) ? bot.oxygenLevel : 20,
            experienceLevel: Number.isFinite(bot.experience?.level) ? bot.experience.level : null,
            experienceProgress: Number.isFinite(bot.experience?.progress)
                ? Math.max(0, Math.min(1, bot.experience.progress))
                : null,
            gameMode: typeof bot.game?.gameMode === 'string' ? bot.game.gameMode : null,
            isAlive: typeof bot.isAlive === 'boolean' ? bot.isAlive : null,
            isSleeping: typeof bot.isSleeping === 'boolean' ? bot.isSleeping : null
        } : null;
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
            dimension,
            playerStats,
            openWindow: bot ? openWindowSnapshot(bot.currentWindow) : null,
            lastError: record.lastError,
            inventory: bot ? inventorySnapshot(bot) : []
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
        const text = validateSingleLineText(command, 'Message').trim();
        if (text === '/') throw new Error('Command cannot be empty');
        this.requireOnlineBot(record).chat(text);
        this.appendLog(record, `You: ${text}`);
        return { id, sent: text };
    }

    moveInventoryItem(id, sourceSlot, destinationSlot) {
        return this.queueInventoryAction(id, sourceSlot, async (bot, item, record) => {
            this.validateInventorySlot(bot, destinationSlot);
            if (sourceSlot === destinationSlot) throw new Error('Choose a different destination slot');
            if (bot.inventory.slots[destinationSlot]) throw new Error('Destination slot must be empty');
            if (typeof bot.moveSlotItem !== 'function') throw new Error('Inventory moves are unavailable');

            await bot.moveSlotItem(sourceSlot, destinationSlot);
            this.appendLog(record, `Inventory: moved ${item.count} x ${this.inventoryItemName(item)} from slot ${sourceSlot} to ${destinationSlot}`);
            return { id, sourceSlot, destinationSlot, moved: item.count };
        });
    }

    dropInventoryItem(id, slot) {
        return this.queueInventoryAction(id, slot, async (bot, item, record) => {
            if (typeof bot.clickWindow !== 'function') throw new Error('Inventory drops are unavailable');
            await bot.clickWindow(slot, 0, 4);
            this.appendLog(record, `Inventory: dropped 1 x ${this.inventoryItemName(item)} from slot ${slot}`);
            return { id, slot, dropped: 1 };
        });
    }

    dropInventoryStack(id, slot) {
        return this.queueInventoryAction(id, slot, async (bot, item, record) => {
            if (typeof bot.tossStack !== 'function') throw new Error('Stack drops are unavailable');
            await bot.tossStack(item);
            this.appendLog(record, `Inventory: dropped stack of ${this.inventoryItemName(item)} from slot ${slot}`);
            return { id, slot, dropped: item.count };
        });
    }

    clickOpenWindowSlot(id, windowId, slot, mouseButton = 0, mode = 0) {
        const record = this.requireRecord(id);
        const run = async () => {
            const bot = this.requireOnlineBot(record);
            const window = bot.currentWindow;
            if (!window || window.id !== windowId) throw new Error('The server menu has changed or closed');
            if (!Number.isInteger(slot) || slot < 0 || slot >= window.slots.length) {
                throw new Error('Window slot is out of range');
            }
            if (![0, 1].includes(mouseButton) || ![0, 1].includes(mode)) {
                throw new Error('Unsupported window click');
            }
            if (typeof bot.clickWindow !== 'function') throw new Error('Server menu clicks are unavailable');

            const item = window.slots[slot];
            await bot.clickWindow(slot, mouseButton, mode);
            this.appendLog(
                record,
                `Menu: ${mode === 1 ? 'shift-clicked' : mouseButton === 1 ? 'right-clicked' : 'clicked'} ` +
                `${item ? this.inventoryItemName(item) : 'empty slot'} in slot ${slot}`
            );
            this.emitState(record);
            return { id, slot, mouseButton, mode, clicked: item ? this.inventoryItemName(item) : null };
        };

        const action = record.windowActionQueue.then(run, run);
        record.windowActionQueue = action.catch(() => {});
        return action;
    }

    async closeOpenWindow(id, windowId) {
        const record = this.requireRecord(id);
        const bot = this.requireOnlineBot(record);
        const window = bot.currentWindow;
        if (!window || window.id !== windowId) throw new Error('The server menu has changed or closed');
        if (typeof bot.closeWindow !== 'function') throw new Error('Closing the server menu is unavailable');
        await bot.closeWindow(window);
        this.appendLog(record, `Menu: closed ${window.title?.toString?.() || 'server menu'}`);
        this.emitState(record);
        return { id, closed: true };
    }

    queueInventoryAction(id, slot, operation) {
        const record = this.requireRecord(id);
        const run = async () => {
            const bot = this.requireOnlineBot(record);
            if (bot.currentWindow) throw new Error('Close the open container before managing inventory');
            this.validateInventorySlot(bot, slot);
            const item = bot.inventory.slots[slot];
            if (!item) throw new Error(`Inventory slot ${slot} is empty`);

            const result = await operation(bot, item, record);
            this.emitState(record);
            return result;
        };

        const action = record.inventoryActionQueue.then(run, run);
        record.inventoryActionQueue = action.catch(() => {});
        return action;
    }

    validateInventorySlot(bot, slot) {
        if (!Number.isInteger(slot) || slot < 5 || slot >= (bot.inventory?.slots?.length || 0)) {
            throw new Error('Inventory slot is out of range');
        }
    }

    inventoryItemName(item) {
        return itemComponentText(item.customName ?? item.componentMap?.get('item_name')?.data) ||
            item.displayName || item.name || 'Unknown item';
    }

    async completeCommand(id, command) {
        const record = this.requireRecord(id);
        if (typeof command !== 'string' || !command.trim().startsWith('/')) {
            throw new Error('Completion requires a slash command');
        }
        const text = validateSingleLineText(command, 'Command');
        const bot = this.requireOnlineBot(record);

        const sequence = ++record.completionSequence;
        const complete = async () => {
            if (sequence !== record.completionSequence) return [];
            if (this.requireOnlineBot(record) !== bot) throw new Error(`${record.config.username} is not online`);

            const matches = await bot.tabComplete(text.trimStart(), true, false, 3000);
            if (sequence !== record.completionSequence) return [];
            return (Array.isArray(matches) ? matches : [])
                .map(entry => typeof entry === 'string' ? entry : entry?.match)
                .filter(match => typeof match === 'string' && match.length > 0)
                .slice(0, 25);
        };

        const request = record.completionQueue.then(complete, complete);
        record.completionQueue = request.catch(() => {});
        return request;
    }

    requireOnlineBot(record) {
        const bot = record.bot;
        if (record.status !== 'online' || !bot || bot._client?.state !== 'play') {
            throw new Error(`${record.config.username} is not online`);
        }
        return bot;
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
                physicsEnabled: config.physicsEnabled,
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
                void this.runOnJoin(record, bot);
                resolveConnect(this.publicState(record));
            });

            bot.on('message', component => {
                const text = component?.toString?.() ?? String(component);
                const formatted = component?.toAnsi?.() ?? text;
                const safeText = redact(text);
                this.appendLog(
                    record,
                    safeText,
                    ansiToColorRuns(redact(formatted)),
                    extractPlayerLinks(safeText, bot.players)
                );
            });
            bot.on('windowOpen', () => this.emitState(record));
            bot.on('windowClose', () => this.emitState(record));
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

    appendLog(record, text, colorRuns, playerLinks) {
        const entry = { at: new Date().toISOString(), text: redact(text) };
        if (colorRuns) entry.colorRuns = colorRuns;
        if (playerLinks?.length) entry.playerLinks = playerLinks;
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