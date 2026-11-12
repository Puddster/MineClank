import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { access, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import itemLoader from 'prismarine-item';
import windowLoader from 'prismarine-windows';
import minecraftData from 'minecraft-data';
import { BotManager } from '../server/bot-manager.js';
import { BotSettings } from '../server/bot-settings.js';
import { getItemCategory } from '../server/item-category.js';
import { parseIncomingDirectMessage, parseOutgoingDirectMessage } from '../server/bot-manager-event-methods.js';

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
        this.players = {};
        this.registry = { blocksByName: { tripwire_hook: {} }, foodsByName: {}, enchantments: [{ name: 'sharpness' }] };
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
            componentMap: new Map([
                ['item_name', {
                    data: {
                        type: 'compound',
                        value: { text: { type: 'string', value: 'Common Crate Key' } }
                    }
                }],
                ['enchantments', { data: { enchantments: [{ id: 0, level: 2 }] } }],
                ['enchantment_glint_override', { data: true }]
            ])
        };
        this.inventory.slots[37] = {
            name: 'diamond',
            displayName: 'Diamond',
            count: 1,
            componentMap: new Map([['enchantments', { data: { enchantments: [{ id: 999, level: 1 }] } }]])
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
        this.inventoryClicks = [];
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
        const window = windowLoader('1.21.1').createWindow(0, 'minecraft:inventory', 'Inventory');
        window.slots = this.inventory.slots;
        for (const slot of [sourceSlot, destinationSlot]) {
            window.acceptClick({ slot, mouseButton: 0, mode: 0, item: window.slots[slot] });
        }
        if (window.selectedItem) {
            window.acceptClick({ slot: sourceSlot, mouseButton: 0, mode: 0, item: window.slots[sourceSlot] });
        }
        this.inventory.selectedItem = window.selectedItem;
    }

    async clickWindow(slot, mouseButton, mode) {
        if ([0, 1].includes(mode) && [0, 1].includes(mouseButton)) {
            const click = { slot, mouseButton, mode };
            if (this.currentWindow) this.windowClicks.push(click);
            else this.inventoryClicks.push(click);
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

async function setupManager(t, { connectTimeoutMs = 100, botSettings = null } = {}) {
    const root = await mkdtemp(join(os.tmpdir(), 'mf-fe-manager-'));
    const configDir = join(root, 'configs');
    const authDir = join(root, 'auth');
    await mkdir(configDir);
    await writeFile(join(configDir, 'alpha.json'), JSON.stringify({
        username: 'Alpha',
        host: 'server.test',
        auth: 'microsoft',
        onJoin: ['/survival'],
        physicsEnabled: false
    }));
    await writeFile(join(configDir, 'beta.json'), JSON.stringify({ username: 'Beta', host: 'server.test' }));

    const bots = [];
    const manager = new BotManager({
        configDir,
        authDir,
        botSettings,
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

test('parses only supported direct message formats', () => {
    assert.deepEqual(parseIncomingDirectMessage('[survival] [Puddster -> me] TEST'), { player: 'Puddster', direction: 'incoming', text: 'TEST' });
    assert.deepEqual(parseIncomingDirectMessage('[Player_1 -> ME] hello'), { player: 'Player_1', direction: 'incoming', text: 'hello' });
    assert.equal(parseIncomingDirectMessage('[me -> Puddster] TEST'), null);
    assert.equal(parseIncomingDirectMessage('Public chat [Puddster -> me] TEST'), null);
    assert.equal(parseIncomingDirectMessage('[name-with-dashes -> me] TEST'), null);
    assert.deepEqual(parseOutgoingDirectMessage('/w Puddster hello there'), { player: 'Puddster', direction: 'outgoing', text: 'hello there' });
    assert.deepEqual(parseOutgoingDirectMessage('/msg puddster hello'), { player: 'puddster', direction: 'outgoing', text: 'hello' });
    assert.equal(parseOutgoingDirectMessage('/msg Puddster'), null);
    assert.equal(parseOutgoingDirectMessage('/msg invalid-name hello'), null);
    assert.equal(parseOutgoingDirectMessage('/r hello'), null);
});

test('retains and emits direct messages independently of live feed and bot connections', async t => {
    const { manager, bots } = await setupManager(t);
    manager.requireRecord('alpha').config.onJoin = ['/w Puddster welcome'];
    const events = [];
    manager.on('bot-direct-message', event => events.push(event));
    const joinMessage = once(manager, 'bot-direct-message');
    const connection = manager.start('alpha');
    await tick();
    bots[0].emit('spawn');
    await connection;
    await joinMessage;
    bots[0].emit('message', { toString: () => '[survival] [Puddster -> me] TEST' });
    bots[0].emit('message', { toString: () => '[survival] [me -> Puddster] welcome' });
    manager.sendCommand('alpha', '/msg puddster eyJabc.def.ghi');
    for (let index = 0; index < 205; index++) manager.appendLog(manager.requireRecord('alpha'), 'other');

    const alpha = manager.getSnapshot()[0];
    assert.equal(alpha.logs.length, 200);
    assert.deepEqual(alpha.directMessages.map(({ player, direction, text }) => ({ player, direction, text })), [
        { player: 'Puddster', direction: 'outgoing', text: 'welcome' },
        { player: 'Puddster', direction: 'incoming', text: 'TEST' },
        { player: 'puddster', direction: 'outgoing', text: '[REDACTED TOKEN]' }
    ]);
    assert.equal(events.length, 3);
    assert.deepEqual(manager.getSnapshot()[1].directMessages, []);
    assert.equal(Object.hasOwn(manager.publicState(manager.requireRecord('alpha')), 'directMessages'), false);
    await manager.stop('alpha');
    assert.equal(manager.getSnapshot()[0].directMessages.length, 3);
    assert.throws(() => manager.sendCommand('alpha', '/w Puddster fail'));
    assert.equal(manager.getSnapshot()[0].directMessages.length, 3);
    manager.requireRecord('alpha').config.onJoin = [];
    const restarted = manager.start('alpha');
    await tick();
    bots[1].emit('spawn');
    await restarted;
    assert.equal(manager.getSnapshot()[0].directMessages.length, 3);
});

test('categorizes blocks by realm and other items into their inventory groups', () => {
    const registry = {
        blocksByName: {
            stone: {}, netherrack: {}, polished_blackstone_bricks: {}, red_nether_bricks: {},
            end_stone: {}, purpur_block: {}, crafting_table: {}
        },
        foodsByName: { apple: {} }
    };

    assert.equal(getItemCategory({ name: 'stone' }, registry), 'blocks-overworld');
    assert.equal(getItemCategory({ name: 'netherrack' }, registry), 'blocks-nether');
    assert.equal(getItemCategory({ name: 'polished_blackstone_bricks' }, registry), 'blocks-nether');
    assert.equal(getItemCategory({ name: 'red_nether_bricks' }, registry), 'blocks-nether');
    assert.equal(getItemCategory({ name: 'end_stone' }, registry), 'blocks-end');
    assert.equal(getItemCategory({ name: 'purpur_block' }, registry), 'blocks-end');
    assert.equal(getItemCategory({ name: 'crafting_table' }, registry), 'blocks-other');
    assert.equal(getItemCategory({ name: 'diamond' }, registry), 'materials');
    assert.equal(getItemCategory({ name: 'iron_pickaxe' }, registry), 'equipment');
    assert.equal(getItemCategory({ name: 'zombie_spawn_egg' }, registry), 'spawn-eggs');
    assert.equal(getItemCategory({ name: 'apple' }, registry), 'food');
    assert.equal(getItemCategory({ name: 'oak_boat' }, registry), 'transport');
});

test('Microsoft device-code callback exposes only user-facing sign-in details', async t => {
    const { manager, bots } = await setupManager(t);
    const connection = manager.start('alpha');
    await tick();
    const bot = bots[0];
    const authenticationEvents = [];
    manager.on('bot-authentication', event => authenticationEvents.push(event));

    bot.options.onMsaCode({
        device_code: 'private-device-credential',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://microsoft.com/devicelogin',
        expires_in: 900,
        interval: 5,
        message: 'Sensitive provider message'
    });

    assert.deepEqual(manager.getSnapshot()[0].authentication.status, 'required');
    assert.equal(manager.getSnapshot()[0].authentication.userCode, 'ABCD-EFGH');
    assert.equal(manager.getSnapshot()[0].authentication.verificationUri, 'https://microsoft.com/devicelogin');
    assert.equal(JSON.stringify(authenticationEvents).includes('private-device-credential'), false);
    assert.equal(JSON.stringify(manager.getSnapshot()).includes('private-device-credential'), false);
    assert.equal(JSON.stringify(authenticationEvents).includes('Sensitive provider message'), false);
    bot.emit('spawn');
    await connection;
    assert.deepEqual(manager.getSnapshot()[0].authentication, { status: 'authenticated' });
});

test('starts configured bots sequentially and sends chat and commands', async t => {
    const { manager, bots } = await setupManager(t);
    const starting = manager.startAllSequential();
    const stateUpdates = [];
    manager.on('bot-state', state => stateUpdates.push(state));

    await tick();
    assert.equal(bots.length, 1);
    bots[0].players.GraysonOakes = {
        username: 'GraysonOakes',
        displayName: { toString: () => '[October] [Hero] sophia' },
        uuid: 'private-player-uuid'
    };
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
    assert.deepEqual(manager.getSnapshot()[0].onlinePlayers, [{
        username: 'GraysonOakes',
        displayName: '[October] [Hero] sophia',
        isSelf: false,
        distance: null
    }]);
    assert.equal(JSON.stringify(manager.getSnapshot()[0].onlinePlayers).includes('private-player-uuid'), false);
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
        category: 'materials',
        displayName: 'Diamond',
        count: 3,
        customName: 'Prismatic Diamond',
        enchantments: [{ name: 'sharpness', level: 3 }],
        hasEnchantmentGlint: true,
        lore: ['Forged in light', 'Second line']
    });
    assert.equal(manager.getSnapshot()[0].inventory[36].category, 'blocks-other');
    assert.deepEqual(manager.getSnapshot()[0].inventory[36].enchantments, [{ name: 'sharpness', level: 2 }]);
    assert.equal(manager.getSnapshot()[0].inventory[36].hasEnchantmentGlint, true);
    assert.deepEqual(manager.getSnapshot()[0].inventory[37].enchantments, []);
    assert.equal(manager.getSnapshot()[0].inventory[37].hasEnchantmentGlint, true);
    assert.equal(JSON.stringify(manager.getSnapshot()[0].inventory).includes('privateValue'), false);
    assert.equal(manager.getSnapshot()[0].inventory[36].customName, 'Common Crate Key');
    assert.deepEqual(await manager.moveInventoryItem('alpha', 36, 39), {
        id: 'alpha', sourceSlot: 36, destinationSlot: 39, moved: 1
    });
    assert.equal(manager.getSnapshot()[0].inventory[36], null);
    assert.equal(manager.getSnapshot()[0].inventory[39].customName, 'Common Crate Key');
    assert.deepEqual(await manager.clickInventorySlot('alpha', 9), {
        id: 'alpha', slot: 9, mouseButton: 0, mode: 0, clicked: 'Prismatic Diamond'
    });
    assert.deepEqual(await manager.clickInventorySlot('alpha', 10, 1), {
        id: 'alpha', slot: 10, mouseButton: 1, mode: 0, clicked: null
    });
    assert.deepEqual(await manager.clickInventorySlot('alpha', 39, 0, 1), {
        id: 'alpha', slot: 39, mouseButton: 0, mode: 1, clicked: 'Common Crate Key'
    });
    assert.deepEqual(bots[0].inventoryClicks, [
        { slot: 9, mouseButton: 0, mode: 0 },
        { slot: 10, mouseButton: 1, mode: 0 },
        { slot: 39, mouseButton: 0, mode: 1 }
    ]);
    await assert.rejects(manager.clickInventorySlot('alpha', 9, 2, 0), /Unsupported inventory click/);
    await assert.rejects(manager.clickInventorySlot('alpha', 2), /out of range/);
    bots[0].currentWindow = { id: 1 };
    await assert.rejects(manager.clickInventorySlot('alpha', 9), /Close the open server menu/);
    bots[0].currentWindow = null;
    await assert.rejects(manager.moveInventoryItem('alpha', 9, 9), /different destination/);
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

test('inventory moves merge, swap and reject unsafe operations without losing items', async t => {
    const { manager, bots } = await setupManager(t);
    const starting = manager.start('alpha');
    await tick();
    const bot = bots[0];
    bot.emit('spawn');
    await starting;
    const data = minecraftData('1.21.1');
    const Item = itemLoader('1.21.1');
    const diamond = count => new Item(data.itemsByName.diamond.id, count);
    const slots = bot.inventory.slots;
    slots.fill(null);
    slots[9] = diamond(12);
    slots[10] = diamond(60);
    assert.equal((await manager.moveInventoryItem('alpha', 9, 10)).moved, 4);
    assert.equal(slots[9].count, 8);
    assert.equal(slots[10].count, 64);
    assert.equal(bot.inventory.selectedItem, null);
    await assert.rejects(manager.moveInventoryItem('alpha', 9, 10), /full or cannot accept/);
    assert.equal(slots[9].count, 8);
    assert.equal(slots[10].count, 64);
    slots[11] = diamond(3);
    assert.equal((await manager.moveInventoryItem('alpha', 9, 11)).moved, 8);
    assert.equal(slots[9], null);
    assert.equal(slots[11].count, 11);
    const stone = new Item(data.itemsByName.stone.id, 5);
    slots[12] = stone;
    await manager.moveInventoryItem('alpha', 11, 12);
    assert.equal(slots[11], stone);
    assert.equal(slots[12].name, 'diamond');
    assert.equal(slots[12].count, 11);
    const named = new Item(data.itemsByName.diamond.id, 2, 0, { type: 'compound', value: { marker: { type: 'string', value: 'special' } } });
    slots[13] = named;
    await manager.moveInventoryItem('alpha', 12, 13);
    assert.equal(slots[12], named);
    assert.equal(slots[13].count, 11);
    bot.inventory.selectedItem = diamond(1);
    await assert.rejects(manager.moveInventoryItem('alpha', 13, 14), /cursor-held/);
    assert.equal(slots[13].count, 11);
    bot.inventory.selectedItem = null;
    await assert.rejects(manager.moveInventoryItem('alpha', 13, 13), /different destination/);
    await assert.rejects(manager.moveInventoryItem('alpha', 13, 4), /out of range/);
    await assert.rejects(manager.moveInventoryItem('alpha', 14, 15), /empty/);
    bot.currentWindow = { id: 1 };
    await assert.rejects(manager.moveInventoryItem('alpha', 13, 14), /Close the open container/);
    bot.currentWindow = null;
    await Promise.all([
        manager.moveInventoryItem('alpha', 13, 14),
        manager.moveInventoryItem('alpha', 14, 15)
    ]);
    assert.equal(slots[13], null);
    assert.equal(slots[14], null);
    assert.equal(slots[15].count, 11);
    assert.equal(bot.inventory.selectedItem, null);
    await assert.rejects(manager.moveInventoryItem('alpha', 15, 5), /compatible equipment/);
    assert.equal(slots[15].count, 11);
    slots[16] = new Item(data.itemsByName.diamond_helmet.id, 1);
    await manager.moveInventoryItem('alpha', 16, 5);
    assert.equal(slots[5].name, 'diamond_helmet');
    await assert.rejects(manager.moveInventoryItem('alpha', 5, 15), /compatible equipment/);
    assert.equal(slots[5].name, 'diamond_helmet');
    await manager.moveInventoryItem('alpha', 5, 16);
    await manager.moveInventoryItem('alpha', 15, 45);
    assert.equal(slots[45].count, 11);
    assert.equal(bot.inventory.selectedItem, null);
});

test('auto-start preferences filter startup while allowing manual starts', async t => {
    const values = new Map();
    const botSettings = {
        getAutoStart: id => values.get(id) ?? true,
        setAutoStart: (id, enabled) => values.set(id, enabled)
    };
    const { manager, bots } = await setupManager(t, { botSettings });
    assert.deepEqual(manager.setAutoStart('beta', false), { id: 'beta', autoStart: false });
    assert.equal(manager.getSnapshot().find(bot => bot.id === 'beta').autoStart, false);

    const starting = manager.startAllSequential();
    await tick();
    assert.equal(bots.length, 1);
    bots[0].emit('spawn');
    assert.deepEqual((await starting).map(result => result.status), ['online', 'disabled']);
    assert.equal(manager.getSnapshot().find(bot => bot.id === 'beta').status, 'stopped');

    const manualStart = manager.start('beta');
    await tick();
    assert.equal(bots.length, 2);
    bots[1].emit('spawn');
    assert.equal((await manualStart).status, 'online');
});

test('creates, updates, and deletes database-backed bot profiles safely', async t => {
    const root = await mkdtemp(join(os.tmpdir(), 'mf-fe-profile-store-'));
    const botSettings = new BotSettings(join(root, 'bots.sqlite'));
    const { manager, bots } = await setupManager(t, { botSettings });
    t.after(async () => {
        botSettings.close();
        await rm(root, { recursive: true, force: true });
    });

    assert.deepEqual(manager.createBotProfile('gamma', {
        username: 'Gamma',
        host: 'server.test',
        auth: 'offline',
        onJoin: []
    }, false), { id: 'gamma', autoStart: false });
    assert.equal(manager.getSnapshot().find(bot => bot.id === 'gamma').profile.auth, 'offline');

    const starting = manager.start('gamma');
    await tick();
    bots[0].emit('spawn');
    assert.equal((await starting).status, 'online');
    assert.deepEqual(await manager.updateBotProfile('gamma', {
        username: 'GammaUpdated',
        host: 'new.server.test',
        port: 25566,
        auth: 'offline',
        physicsEnabled: false,
        onJoin: ['/lobby']
    }, true), { id: 'gamma', autoStart: true });
    const updated = manager.getSnapshot().find(bot => bot.id === 'gamma');
    assert.equal(updated.status, 'stopped');
    assert.equal(updated.username, 'GammaUpdated');
    assert.equal(updated.host, 'new.server.test');
    assert.equal(updated.autoStart, true);

    const restart = manager.start('gamma');
    await tick();
    bots[1].emit('spawn');
    assert.equal((await restart).status, 'online');
    assert.deepEqual(await manager.deleteBotProfile('gamma'), { id: 'gamma', deleted: true });
    assert.equal(manager.getSnapshot().some(bot => bot.id === 'gamma'), false);
    assert.throws(() => manager.start('gamma'), /Unknown bot/);
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

test('backs off longer for login throttles and Mojang session service failures', async t => {
    const { manager, bots } = await setupManager(t);

    const rateLimitedStart = manager.start('alpha').catch(error => error);
    await tick();
    bots[0].emit('kicked', { text: 'You are logging in too fast, try again later.' });
    assert.match((await rateLimitedStart).message, /logging in too fast/);
    assert.ok(manager.getSnapshot()[0].logs.some(entry => (
        entry.text === 'Retrying in 60s (login rate-limit cooldown)'
    )));

    const sessionFailureStart = manager.start('beta').catch(error => error);
    await tick();
    bots[1].emit('error', new Error(
        'Invalid response body while trying to fetch https://sessionserver.mojang.com/session/minecraft/join: Premature close'
    ));
    assert.match((await sessionFailureStart).message, /sessionserver\.mojang\.com/);
    assert.ok(manager.getSnapshot()[1].logs.some(entry => (
        entry.text === 'Retrying in 60s (session service cooldown)'
    )));
});

test('stops an in-flight connection and cancels a scheduled reconnect', async t => {
    const { manager, bots } = await setupManager(t);

    const connecting = manager.start('alpha').catch(error => error);
    await tick();
    assert.equal(bots.length, 1);
    assert.equal((await manager.stop('alpha')).status, 'stopped');
    assert.match((await connecting).message, /Connection ended before spawn/);
    assert.equal(manager.getSnapshot()[0].status, 'stopped');
    assert.equal(manager.records.get('alpha').reconnectTimer, null);
    assert.equal(manager.records.get('alpha').desired, false);

    const throttled = manager.start('beta').catch(error => error);
    await tick();
    bots[1].emit('kicked', { text: 'You are logging in too fast, try again later.' });
    await throttled;
    assert.ok(manager.records.get('beta').reconnectTimer);
    assert.equal((await manager.stop('beta')).status, 'stopped');
    assert.equal(manager.records.get('beta').reconnectTimer, null);
    assert.equal(manager.records.get('beta').desired, false);
    await tick();
    assert.equal(bots.length, 2);
});

test('clears only a Microsoft bot auth cache and leaves the bot stopped for manual sign-in', async t => {
    const { manager, bots } = await setupManager(t);
    const authPath = join(manager.authDir, 'alpha');
    await mkdir(authPath, { recursive: true });
    await writeFile(join(authPath, 'tokens.json'), '{"refreshToken":"secret"}');

    const connecting = manager.start('alpha').catch(error => error);
    await tick();
    bots[0].emit('spawn');
    await connecting;
    const result = await manager.resetMicrosoftAuthentication('alpha');

    assert.deepEqual(result, { id: 'alpha', status: 'stopped', authenticationReset: true });
    await assert.rejects(access(authPath));
    assert.equal(manager.getSnapshot()[0].status, 'stopped');
    assert.equal(manager.records.get('alpha').desired, false);
    assert.ok(manager.getSnapshot()[0].logs.some(entry => (
        entry.text === 'Microsoft authentication cache cleared; start the bot to sign in again'
    )));

    manager.records.get('beta').config.auth = 'offline';
    await assert.rejects(
        manager.resetMicrosoftAuthentication('beta'),
        /only available for Microsoft accounts/
    );
});

test('starts a fresh Microsoft sign-in after clearing only that bot cache', async t => {
    const { manager, bots } = await setupManager(t);
    const authPath = join(manager.authDir, 'alpha');
    await mkdir(authPath, { recursive: true });
    await writeFile(join(authPath, 'tokens.json'), '{"refreshToken":"secret"}');

    const result = await manager.startMicrosoftAuthentication('alpha');
    assert.deepEqual(result, { id: 'alpha', status: 'connecting', authenticationStarted: true });
    await tick();
    await assert.rejects(access(authPath));
    assert.equal(bots.length, 1);
    assert.equal(typeof bots[0].options.onMsaCode, 'function');
    bots[0].emit('spawn');
    await tick();
    assert.equal(manager.getSnapshot()[0].status, 'online');
});

test('publishes online player list changes', async t => {
    const { manager, bots } = await setupManager(t);
    const starting = manager.start('alpha');
    await tick();
    bots[0].emit('spawn');
    await starting;

    const states = [];
    manager.on('bot-state', state => states.push(state));
    bots[0].entity.position = { x: 0, y: 64, z: 0 };
    const player = {
        username: 'GraysonOakes',
        displayName: { toString: () => '[October] [Hero] sophia' },
        ping: 38,
        uuid: 'private-player-uuid',
        entity: { position: { x: 3, y: 68, z: 0 } },
        skinData: {
            url: `http://textures.minecraft.net/texture/${'a'.repeat(64)}`,
            model: 'slim',
            capeUrl: 'https://textures.minecraft.net/texture/private-cape'
        }
    };
    bots[0].players.GraysonOakes = player;
    bots[0].emit('playerJoined', player);

    assert.deepEqual(states.at(-1).onlinePlayers, [{
        username: 'GraysonOakes',
        displayName: '[October] [Hero] sophia',
        skinUrl: `https://textures.minecraft.net/texture/${'a'.repeat(64)}`,
        isSelf: false,
        distance: 5
    }]);

    player.displayName = { toString: () => '[October] [Hero] Sophie' };
    bots[0].emit('playerUpdated', player);
    assert.deepEqual(states.at(-1).onlinePlayers, [{
        username: 'GraysonOakes',
        displayName: '[October] [Hero] Sophie',
        skinUrl: `https://textures.minecraft.net/texture/${'a'.repeat(64)}`,
        isSelf: false,
        distance: 5
    }]);

    bots[0].players.Unsafe = {
        username: 'Unsafe',
        displayName: { toString: () => 'Unsafe' },
        skinData: { url: 'https://tracker.example/skin.png' }
    };
    bots[0].emit('playerJoined', bots[0].players.Unsafe);
    assert.deepEqual(states.at(-1).onlinePlayers.find(entry => entry.username === 'Unsafe'), {
        username: 'Unsafe',
        displayName: 'Unsafe',
        isSelf: false,
        distance: null
    });
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
                category: 'materials',
                displayName: 'Diamond',
                count: 2,
                customName: null,
                enchantments: [],
                hasEnchantmentGlint: false,
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