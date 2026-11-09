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
        this.entity = { position: { x: 1.24, y: 64, z: -8.86 } };
        this.game = { dimension: 'overworld' };
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

    async tabComplete(command, assumeCommand, sendBlockInSight, timeout) {
        this.completionRequests.push({ command, assumeCommand, sendBlockInSight, timeout });
        return [{ match: 'lemons', tooltip: null }, 'lemonade'];
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
    assert.equal(bots[0].options.physicsEnabled, false);
    assert.equal(bots[1].options.physicsEnabled, true);
    assert.deepEqual(manager.getSnapshot()[0].position, { x: 1.2, y: 64, z: -8.9 });
    assert.equal(manager.getSnapshot()[0].dimension, 'overworld');
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