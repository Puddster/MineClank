import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { BotManager } from '../server/bot-manager.js';

const tick = () => new Promise(resolve => setImmediate(resolve));

class FakeBot extends EventEmitter {
    constructor() {
        super();
        this.sent = [];
        this.completionRequests = [];
        this.activeCompletions = 0;
        this.maxConcurrentCompletions = 0;
        this.entity = { position: { x: 1.24, y: 64, z: -8.86 } };
        this.inventory = { slots: Array(46).fill(null) };
        this.inventory.slots[9] = {
            name: 'diamond',
            displayName: 'Diamond',
            count: 3,
            customName: '{"text":"Prismatic Diamond"}',
            enchants: [{ name: 'sharpness', lvl: 3 }],
            customLore: ['{"text":"Forged in light"}', 'Second line'],
            nbt: { privateValue: 'must not be exposed' }
        };
        this.inventory.slots[36] = {
            name: 'tripwire_hook',
            displayName: 'Tripwire Hook',
            count: 1,
            customName: null,
            componentMap: new Map([['item_name', {
                data: {
                    type: 'compound',
                    value: { text: { type: 'string', value: 'Common Crate Key' } }
                }
            }]])
        };
        this.game = { dimension: 'overworld', gameMode: 'survival' };
        this.health = 18;
        this.food = 17;
        this.foodSaturation = 4.5;
        this.oxygenLevel = 14;
        this.experience = { level: 12, points: 100, progress: 0.42 };
        this.isAlive = true;
        this.isSleeping = false;
        this.currentWindow = null;
        this.windowClicks = [];
        this._client = {
            state: 'play',
            profileKeys: {},
            _session: {},
            serverFeatures: { enforcesSecureChat: true },
            end: () => this.emit('end', 'closed')
        };
    }

    chat(message) {
        this.sent.push(message);
    }

    async moveSlotItem(sourceSlot, destinationSlot) {
        const item = this.inventory.slots[sourceSlot];
        this.inventory.slots[sourceSlot] = null;
        this.inventory.slots[destinationSlot] = item;
        if (item) item.slot = destinationSlot;
    }

    async clickWindow(slot, mouseButton, mode) {
        if (this.currentWindow && [0, 1].includes(mode) && [0, 1].includes(mouseButton)) {
            this.windowClicks.push({ slot, mouseButton, mode });
            return;
        }
        if (mode !== 4 || mouseButton !== 0) throw new Error('Unexpected click');
        const item = this.inventory.slots[slot];
        if (!item) throw new Error('Empty slot');
        if (item.count > 1) item.count -= 1;
        else this.inventory.slots[slot] = null;
    }

    async tossStack(item) {
        this.inventory.slots[item.slot] = null;
    }

    async closeWindow(window) {
        if (this.currentWindow !== window) throw new Error('Window is not open');
        this.currentWindow = null;
        this.emit('windowClose', window);
    }

    async tabComplete(command, assumeCommand, sendBlockInSight, timeout) {
        this.completionRequests.push({ command, assumeCommand, sendBlockInSight, timeout });
        this.activeCompletions += 1;
        this.maxConcurrentCompletions = Math.max(this.maxConcurrentCompletions, this.activeCompletions);
        try {
            if (command === '/slow') await new Promise(resolve => setTimeout(resolve, 20));
            return [{ match: command === '/new' ? 'new-result' : 'lemons', tooltip: null }, 'lemonade'];
        } finally {
            this.activeCompletions -= 1;
        }
    }

    quit(reason) {
        this.emit('end', reason);
    }
}

async function setupManager(t, { connectTimeoutMs = 100 } = {}) {
    const root = await mkdtemp(join(os.tmpdir(), 'mf-fe-manager-'));
    const configDir = join(root, 'configs');
    const authDir = join(root, 'auth');
    await mkdir(configDir);
    await writeFile(join(configDir, 'alpha.json'), JSON.stringify({
        username: 'Alpha',
        host: 'server.test',
        onJoin: ['/survival'],
        physicsEnabled: false
    }));
    await writeFile(join(configDir, 'beta.json'), JSON.stringify({ username: 'Beta', host: 'server.test' }));

    const bots = [];
    const manager = new BotManager({
        configDir,
        authDir,
        connectTimeoutMs,
        joinCommandDelayMs: 0,
        reconnectBaseMs: 10_000,
        createBot: options => {
            const bot = new FakeBot();
            bot.options = options;
            bots.push(bot);
            return bot;
        }
    });
    await manager.initialize();
    t.after(async () => {
        await manager.close();
        await rm(root, { recursive: true, force: true });
    });
    return { manager, bots };
}

test('starts configured bots sequentially and sends chat and commands', async t => {
    const { manager, bots } = await setupManager(t);
    const starting = manager.startAllSequential();
    const stateUpdates = [];
    manager.on('bot-state', state => stateUpdates.push(state));

    await tick();
    assert.equal(bots.length, 1);
    bots[0].emit('spawn');
    bots[0].emit('message', {
        toString: () => 'Welcome',
        toAnsi: () => '\u001b[38;2;80;220;140mWelcome\u001b[0m'
    }, 'system');
    await tick();
    assert.equal(bots.length, 2);
    bots[1].emit('spawn');

    const outcomes = await starting;
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(outcomes.map(outcome => outcome.status), ['online', 'online']);
    assert.deepEqual(manager.getSnapshot().map(bot => bot.id), ['alpha', 'beta']);
    assert.ok(stateUpdates.length > 0);
    assert.ok(stateUpdates.every(state => !Object.hasOwn(state, 'logs')));
    assert.ok(Array.isArray(manager.getSnapshot()[0].logs));
    assert.equal(bots[0].options.physicsEnabled, false);
    assert.equal(bots[1].options.physicsEnabled, true);
    assert.deepEqual(manager.getSnapshot()[0].position, { x: 1.2, y: 64, z: -8.9 });
    assert.equal(manager.getSnapshot()[0].dimension, 'overworld');
    assert.deepEqual(manager.getSnapshot()[0].playerStats, {
        health: 18,
        food: 17,
        foodSaturation: 4.5,
        oxygenLevel: 14,
        experienceLevel: 12,
        experienceProgress: 0.42,
        gameMode: 'survival',
        isAlive: true,
        isSleeping: false
    });
    bots[0].oxygenLevel = undefined;
    assert.equal(manager.getSnapshot()[0].playerStats.oxygenLevel, 20);
    assert.deepEqual(manager.getSnapshot()[0].inventory[9], {
        slot: 9,
        name: 'diamond',
        displayName: 'Diamond',
        count: 3,
        customName: 'Prismatic Diamond',
        enchantments: [{ name: 'sharpness', level: 3 }],
        lore: ['Forged in light', 'Second line']
    });
    assert.equal(JSON.stringify(manager.getSnapshot()[0].inventory).includes('privateValue'), false);
    assert.equal(manager.getSnapshot()[0].inventory[36].customName, 'Common Crate Key');
    assert.deepEqual(await manager.moveInventoryItem('alpha', 36, 39), {
        id: 'alpha', sourceSlot: 36, destinationSlot: 39, moved: 1
    });
    assert.equal(manager.getSnapshot()[0].inventory[36], null);
    assert.equal(manager.getSnapshot()[0].inventory[39].customName, 'Common Crate Key');
    await assert.rejects(manager.moveInventoryItem('alpha', 9, 39), /Destination slot must be empty/);
    assert.deepEqual(await manager.dropInventoryItem('alpha', 9), { id: 'alpha', slot: 9, dropped: 1 });
    assert.equal(manager.getSnapshot()[0].inventory[9].count, 2);
    assert.deepEqual(await manager.dropInventoryStack('alpha', 39), { id: 'alpha', slot: 39, dropped: 1 });
    assert.equal(manager.getSnapshot()[0].inventory[39], null);
    assert.ok(manager.getSnapshot()[0].logs.some(entry => (
        entry.text === 'Chat security: required; profile key available; chat session available'
    )));
    const welcomeLog = manager.getSnapshot()[0].logs.find(entry => entry.text === 'Welcome');
    assert.equal(welcomeLog.colorRuns[0].color, '#50dc8c');

    assert.deepEqual(bots[0].sent, ['/survival']);
    assert.deepEqual(await manager.completeCommand('alpha', '/lem'), ['lemons', 'lemonade']);
    assert.deepEqual(bots[0].completionRequests, [{
        command: '/lem', assumeCommand: true, sendBlockInSight: false, timeout: 3000
    }]);
    await manager.completeCommand('alpha', '/warp ');
    assert.equal(bots[0].completionRequests[1].command, '/warp ');
    assert.deepEqual(manager.sendCommand('alpha', '/hub1'), { id: 'alpha', sent: '/hub1' });
    assert.deepEqual(manager.sendCommand('alpha', 'Hello server'), { id: 'alpha', sent: 'Hello server' });
    assert.deepEqual(bots[0].sent, ['/survival', '/hub1', 'Hello server']);
    assert.throws(() => manager.sendCommand('alpha', '/help\n/tpaccept'), /single line/);
    assert.throws(() => manager.sendCommand('alpha', '   '), /cannot be empty/);
    assert.throws(() => manager.sendCommand('alpha', '/'), /Command cannot be empty/);
    assert.throws(() => manager.sendCommand('missing', '/survival'), /Unknown bot/);
});

test('continues the startup queue after a bot fails before spawn', async t => {
    const { manager, bots } = await setupManager(t);
    const starting = manager.startAllSequential();

    await tick();
    assert.equal(bots.length, 1);
    bots[0].emit('error', new Error('login failed'));
    await tick();
    assert.equal(bots.length, 2);
    bots[1].emit('spawn');

    const outcomes = await starting;
    assert.equal(outcomes[0].status, 'reconnecting');
    assert.equal(manager.getSnapshot()[1].status, 'online');
});

test('preserves clickable player usernames in chat log entries', async t => {
    const { manager, bots } = await setupManager(t);
    const starting = manager.start('alpha');
    await tick();
    bots[0].emit('spawn');
    await starting;

    bots[0].players = {
        Jessica_42: {
            username: 'Jessica_42',
            displayName: { toString: () => 'Jess' }
        }
    };
    bots[0].emit('message', {
        toString: () => '[VIP] Jess: hello',
        toAnsi: () => '[VIP] Jess: hello'
    });

    const chatLog = manager.getSnapshot()[0].logs.find(entry => entry.text === '[VIP] Jess: hello');
    assert.deepEqual(chatLog.playerLinks, [
        { start: 6, end: 10, username: 'Jessica_42' }
    ]);
});

test('exposes and safely dispatches clicks to open server menus', async t => {
    const { manager, bots } = await setupManager(t);
    const starting = manager.start('alpha');
    await tick();
    bots[0].emit('spawn');
    await starting;

    const window = {
        id: 7,
        type: 'minecraft:generic_9x3',
        title: { toString: () => 'Auction House' },
        inventoryStart: 27,
        slots: Array(63).fill(null)
    };
    window.slots[13] = {
        name: 'diamond',
        displayName: 'Diamond',
        count: 2,
        customLore: ['Top listing']
    };
    bots[0].currentWindow = window;
    bots[0].emit('windowOpen', window);

    assert.deepEqual(manager.getSnapshot()[0].openWindow, {
        id: 7,
        type: 'minecraft:generic_9x3',
        title: 'Auction House',
        inventoryStart: 27,
        slots: [
            ...Array(13).fill(null),
            {
                slot: 13,
                name: 'diamond',
                displayName: 'Diamond',
                count: 2,
                customName: null,
                enchantments: [],
                lore: ['Top listing']
            },
            ...Array(49).fill(null)
        ],
        selectedItem: null
    });

    await assert.rejects(manager.clickOpenWindowSlot('alpha', 7, 63), /out of range/);
    await assert.rejects(manager.clickOpenWindowSlot('alpha', 6, 13), /changed or closed/);
    assert.deepEqual(await manager.clickOpenWindowSlot('alpha', 7, 13), {
        id: 'alpha',
        slot: 13,
        mouseButton: 0,
        mode: 0,
        clicked: 'Diamond'
    });
    assert.deepEqual(await manager.clickOpenWindowSlot('alpha', 7, 27, 1, 0), {
        id: 'alpha',
        slot: 27,
        mouseButton: 1,
        mode: 0,
        clicked: null
    });
    assert.deepEqual(await manager.clickOpenWindowSlot('alpha', 7, 36, 0, 1), {
        id: 'alpha',
        slot: 36,
        mouseButton: 0,
        mode: 1,
        clicked: null
    });
    await assert.rejects(manager.clickOpenWindowSlot('alpha', 7, 13, 3, 0), /Unsupported window click/);
    assert.deepEqual(bots[0].windowClicks, [
        { slot: 13, mouseButton: 0, mode: 0 },
        { slot: 27, mouseButton: 1, mode: 0 },
        { slot: 36, mouseButton: 0, mode: 1 }
    ]);
    assert.deepEqual(await manager.closeOpenWindow('alpha', 7), { id: 'alpha', closed: true });
    assert.equal(manager.getSnapshot()[0].openWindow, null);
});

test('serializes completion requests and drops stale queued prefixes', async t => {
    const { manager, bots } = await setupManager(t);
    const starting = manager.start('alpha');
    await tick();
    bots[0].emit('spawn');
    await starting;

    const stale = manager.completeCommand('alpha', '/slow');
    await tick();
    const latest = manager.completeCommand('alpha', '/new');
    const [staleMatches, latestMatches] = await Promise.all([stale, latest]);

    assert.deepEqual(staleMatches, []);
    assert.deepEqual(latestMatches, ['new-result', 'lemonade']);
    assert.deepEqual(bots[0].completionRequests.map(request => request.command), ['/slow', '/new']);
    assert.equal(bots[0].maxConcurrentCompletions, 1);
});