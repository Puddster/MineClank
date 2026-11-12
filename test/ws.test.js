import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import { createControlServer } from '../server/ws.js';

class FakeManager extends EventEmitter {
    constructor() {
        super();
        this.bots = [{ id: 'alpha', username: 'Alpha', status: 'online', autoStart: true, logs: [] }];
        this.commands = [];
    }

    getSnapshot() {
        return this.bots;
    }

    async start(id) {
        return { id, status: 'online' };
    }

    async stop(id) {
        return { id, status: 'stopped' };
    }

    async resetMicrosoftAuthentication(id) {
        return { id, status: 'stopped', authenticationReset: true };
    }

    async startMicrosoftAuthentication(id) {
        return { id, status: 'connecting', authenticationStarted: true };
    }

    setAutoStart(id, enabled) {
        return { id, autoStart: enabled };
    }

    createBotProfile(id, profile, autoStart) {
        return { id, username: profile.username, autoStart };
    }

    async updateBotProfile(id, profile, autoStart) {
        return { id, username: profile.username, autoStart, updated: true };
    }

    async deleteBotProfile(id) {
        return { id, deleted: true };
    }

    sendCommand(id, command) {
        this.commands.push({ id, command });
        return { id, sent: command };
    }

    async completeCommand(id, command) {
        return command === '/lem' ? ['lemons'] : [];
    }

    async moveInventoryItem(id, sourceSlot, destinationSlot) {
        return { id, sourceSlot, destinationSlot, moved: 2 };
    }

    async clickInventorySlot(id, slot, mouseButton, mode) {
        return { id, slot, mouseButton, mode, clicked: null };
    }

    async dropInventoryItem(id, slot) {
        return { id, slot, dropped: 1 };
    }

    async dropInventoryStack(id, slot) {
        return { id, slot, dropped: 4 };
    }

    async clickOpenWindowSlot(id, windowId, slot, mouseButton, mode) {
        return { id, windowId, slot, mouseButton, mode, clicked: 'Diamond' };
    }

    async closeOpenWindow(id, windowId) {
        return { id, windowId, closed: true };
    }
}

class FakeSavedMessages {
    constructor() {
        this.messages = [];
    }

    list() {
        return this.messages;
    }

    create(entry) {
        const saved = { id: 'saved-1', ...entry };
        this.messages.push(saved);
        return saved;
    }

    update(messageId, entry) {
        const index = this.messages.findIndex(message => message.id === messageId);
        if (index < 0) throw new Error('Saved message was not found');
        this.messages[index] = { id: messageId, ...entry };
        return this.messages[index];
    }

    delete(messageId) {
        this.messages = this.messages.filter(message => message.id !== messageId);
        return { id: messageId };
    }
}

async function openServer(t, options = {}) {
    const manager = new FakeManager();
    const app = createControlServer({
        manager,
        staticDir: 'missing-dist-for-test',
        allowedOrigins: ['http://localhost:5173'],
        ...options
    });
    const address = await app.listen(0, '127.0.0.1');
    t.after(() => app.close());
    return {
        manager,
        app,
        origin: `http://127.0.0.1:${address.port}`,
        url: `ws://127.0.0.1:${address.port}/ws`
    };
}

function nextSocketMessage(socket, expectedType) {
    return new Promise((resolve, reject) => {
        const handleMessage = data => {
            const message = JSON.parse(data.toString());
            if (expectedType && message.type !== expectedType) return;
            socket.off('message', handleMessage);
            socket.off('error', handleError);
            resolve(message);
        };
        const handleError = error => {
            socket.off('message', handleMessage);
            reject(error);
        };
        socket.on('message', handleMessage);
        socket.on('error', handleError);
    });
}

test('streams a snapshot and dispatches validated bot commands', async t => {
    const { manager, url } = await openServer(t);
    const socket = new WebSocket(url, { headers: { origin: 'http://localhost:5173' } });
    const firstMessage = new Promise((resolve, reject) => {
        socket.once('message', data => resolve(JSON.parse(data.toString())));
        socket.once('error', reject);
    });
    await once(socket, 'open');
    assert.deepEqual(await firstMessage, { type: 'snapshot', bots: manager.getSnapshot() });

    const updatedSnapshot = nextSocketMessage(socket, 'snapshot');
    manager.emit('snapshot', [{ id: 'alpha', username: 'Alpha Updated' }]);
    assert.deepEqual(await updatedSnapshot, {
        type: 'snapshot',
        bots: [{ id: 'alpha', username: 'Alpha Updated' }]
    });

    const actionResult = new Promise((resolve, reject) => {
        socket.once('message', data => resolve(JSON.parse(data.toString())));
        socket.once('error', reject);
    });
    socket.send(JSON.stringify({ type: 'bot:command', id: 'alpha', command: '/survival', requestId: 'hop-1' }));
    assert.deepEqual(await actionResult, {
        type: 'action:result',
        requestId: 'hop-1',
        ok: true,
        result: { id: 'alpha', sent: '/survival' }
    });
    assert.deepEqual(manager.commands, [{ id: 'alpha', command: '/survival' }]);

    const chatResult = new Promise((resolve, reject) => {
        socket.once('message', data => resolve(JSON.parse(data.toString())));
        socket.once('error', reject);
    });
    socket.send(JSON.stringify({ type: 'bot:command', id: 'alpha', command: 'Hello server', requestId: 'chat-1' }));
    assert.deepEqual(await chatResult, {
        type: 'action:result',
        requestId: 'chat-1',
        ok: true,
        result: { id: 'alpha', sent: 'Hello server' }
    });
    assert.deepEqual(manager.commands, [
        { id: 'alpha', command: '/survival' },
        { id: 'alpha', command: 'Hello server' }
    ]);

    const autoStartResult = nextSocketMessage(socket, 'action:result');
    socket.send(JSON.stringify({
        type: 'bot:auto-start',
        id: 'alpha',
        enabled: false,
        requestId: 'auto-start-1'
    }));
    assert.deepEqual(await autoStartResult, {
        type: 'action:result',
        requestId: 'auto-start-1',
        ok: true,
        result: { id: 'alpha', autoStart: false }
    });

    const authResetResult = nextSocketMessage(socket, 'action:result');
    socket.send(JSON.stringify({
        type: 'bot:auth-reset',
        id: 'alpha',
        requestId: 'auth-reset-1'
    }));
    assert.deepEqual(await authResetResult, {
        type: 'action:result',
        requestId: 'auth-reset-1',
        ok: true,
        result: { id: 'alpha', status: 'stopped', authenticationReset: true }
    });

    const authStartResult = nextSocketMessage(socket, 'action:result');
    socket.send(JSON.stringify({
        type: 'bot:auth-start',
        id: 'alpha',
        requestId: 'auth-start-1'
    }));
    assert.deepEqual(await authStartResult, {
        type: 'action:result',
        requestId: 'auth-start-1',
        ok: true,
        result: { id: 'alpha', status: 'connecting', authenticationStarted: true }
    });

    const authEvent = nextSocketMessage(socket, 'bot:authentication');
    manager.emit('bot-authentication', {
        id: 'alpha',
        authentication: {
            status: 'required',
            userCode: 'ABCD-EFGH',
            verificationUri: 'https://microsoft.com/devicelogin'
        },
        device_code: 'must-not-be-sent'
    });
    const authenticationMessage = await authEvent;
    assert.deepEqual(authenticationMessage, {
        type: 'bot:authentication',
        id: 'alpha',
        authentication: {
            status: 'required',
            userCode: 'ABCD-EFGH',
            verificationUri: 'https://microsoft.com/devicelogin'
        }
    });
    assert.equal(JSON.stringify(authenticationMessage).includes('must-not-be-sent'), false);

    const createProfileResult = nextSocketMessage(socket, 'action:result');
    socket.send(JSON.stringify({
        type: 'bot:profile-create',
        id: 'beta',
        profile: { username: 'Beta', host: 'server.test' },
        autoStart: true,
        requestId: 'profile-create-1'
    }));
    assert.deepEqual(await createProfileResult, {
        type: 'action:result',
        requestId: 'profile-create-1',
        ok: true,
        result: { id: 'beta', username: 'Beta', autoStart: true }
    });

    const updateProfileResult = nextSocketMessage(socket, 'action:result');
    socket.send(JSON.stringify({
        type: 'bot:profile-update',
        id: 'beta',
        profile: { username: 'Beta Updated', host: 'new.server.test' },
        autoStart: false,
        requestId: 'profile-update-1'
    }));
    assert.deepEqual(await updateProfileResult, {
        type: 'action:result',
        requestId: 'profile-update-1',
        ok: true,
        result: { id: 'beta', username: 'Beta Updated', autoStart: false, updated: true }
    });

    const deleteProfileResult = nextSocketMessage(socket, 'action:result');
    socket.send(JSON.stringify({
        type: 'bot:profile-delete',
        id: 'beta',
        requestId: 'profile-delete-1'
    }));
    assert.deepEqual(await deleteProfileResult, {
        type: 'action:result',
        requestId: 'profile-delete-1',
        ok: true,
        result: { id: 'beta', deleted: true }
    });

    const inventoryClickResult = nextSocketMessage(socket, 'action:result');
    socket.send(JSON.stringify({
        type: 'bot:inventory-click',
        id: 'alpha',
        slot: 10,
        mouseButton: 1,
        mode: 1,
        requestId: 'inventory-click-1'
    }));
    assert.deepEqual(await inventoryClickResult, {
        type: 'action:result',
        requestId: 'inventory-click-1',
        ok: true,
        result: { id: 'alpha', slot: 10, mouseButton: 1, mode: 1, clicked: null }
    });

    const completionResult = new Promise((resolve, reject) => {
        socket.once('message', data => resolve(JSON.parse(data.toString())));
        socket.once('error', reject);
    });
    socket.send(JSON.stringify({ type: 'bot:complete', id: 'alpha', command: '/lem', requestId: 'complete-1' }));
    assert.deepEqual(await completionResult, {
        type: 'bot:completion', requestId: 'complete-1', suggestions: ['lemons']
    });

    const inventoryResult = new Promise((resolve, reject) => {
        socket.once('message', data => resolve(JSON.parse(data.toString())));
        socket.once('error', reject);
    });
    socket.send(JSON.stringify({ type: 'bot:inventory-move', id: 'alpha', sourceSlot: 36, destinationSlot: 37, requestId: 'move-1' }));
    assert.deepEqual(await inventoryResult, {
        type: 'action:result', requestId: 'move-1', ok: true,
        result: { id: 'alpha', sourceSlot: 36, destinationSlot: 37, moved: 2 }
    });

    const dropOneResult = new Promise((resolve, reject) => {
        socket.once('message', data => resolve(JSON.parse(data.toString())));
        socket.once('error', reject);
    });
    socket.send(JSON.stringify({ type: 'bot:inventory-drop-one', id: 'alpha', slot: 37, requestId: 'drop-1' }));
    assert.equal((await dropOneResult).result.dropped, 1);

    const dropStackResult = new Promise((resolve, reject) => {
        socket.once('message', data => resolve(JSON.parse(data.toString())));
        socket.once('error', reject);
    });
    socket.send(JSON.stringify({ type: 'bot:inventory-drop-stack', id: 'alpha', slot: 37, requestId: 'drop-stack' }));
    assert.equal((await dropStackResult).result.dropped, 4);

    const menuClickResult = new Promise((resolve, reject) => {
        socket.once('message', data => resolve(JSON.parse(data.toString())));
        socket.once('error', reject);
    });
    socket.send(JSON.stringify({
        type: 'bot:window-click',
        id: 'alpha',
        windowId: 7,
        slot: 13,
        mouseButton: 1,
        mode: 1,
        requestId: 'menu-click'
    }));
    assert.deepEqual(await menuClickResult, {
        type: 'action:result', requestId: 'menu-click', ok: true,
        result: { id: 'alpha', windowId: 7, slot: 13, mouseButton: 1, mode: 1, clicked: 'Diamond' }
    });

    const menuCloseResult = new Promise((resolve, reject) => {
        socket.once('message', data => resolve(JSON.parse(data.toString())));
        socket.once('error', reject);
    });
    socket.send(JSON.stringify({ type: 'bot:window-close', id: 'alpha', windowId: 7, requestId: 'menu-close' }));
    assert.deepEqual(await menuCloseResult, {
        type: 'action:result', requestId: 'menu-close', ok: true,
        result: { id: 'alpha', windowId: 7, closed: true }
    });
    socket.close();
});

test('broadcasts direct messages to all clients and includes history in new snapshots', async t => {
    const { manager, url } = await openServer(t);
    manager.bots[0].directMessages = [];
    const first = new WebSocket(url, { headers: { origin: 'http://localhost:5173' } });
    const second = new WebSocket(url, { headers: { origin: 'http://localhost:5173' } });
    const snapshots = [nextSocketMessage(first, 'snapshot'), nextSocketMessage(second, 'snapshot')];
    await Promise.all(snapshots);
    const entry = { at: '2026-01-01T00:00:00.000Z', player: 'Puddster', direction: 'incoming', text: 'TEST' };
    const messages = [nextSocketMessage(first, 'bot:direct-message'), nextSocketMessage(second, 'bot:direct-message')];
    manager.bots[0].directMessages.push(entry);
    manager.emit('bot-direct-message', { id: 'alpha', entry });
    assert.deepEqual(await Promise.all(messages), [
        { type: 'bot:direct-message', id: 'alpha', entry },
        { type: 'bot:direct-message', id: 'alpha', entry }
    ]);
    first.close();
    second.close();
    const reconnected = new WebSocket(url, { headers: { origin: 'http://localhost:5173' } });
    const snapshot = await nextSocketMessage(reconnected, 'snapshot');
    assert.deepEqual(snapshot.bots[0].directMessages, [entry]);
    reconnected.close();
});

test('streams and updates the shared saved-message library', async t => {
    const savedMessages = new FakeSavedMessages();
    const { url } = await openServer(t, { savedMessages });
    const socket = new WebSocket(url, { headers: { origin: 'http://localhost:5173' } });
    const snapshotPromise = nextSocketMessage(socket, 'snapshot');
    const savedSnapshotPromise = nextSocketMessage(socket, 'saved-messages:snapshot');
    await once(socket, 'open');
    assert.equal((await snapshotPromise).type, 'snapshot');
    assert.deepEqual(await savedSnapshotPromise, {
        type: 'saved-messages:snapshot',
        messages: []
    });

    const createUpdate = nextSocketMessage(socket, 'saved-messages:update');
    const createResult = nextSocketMessage(socket, 'action:result');
    socket.send(JSON.stringify({
        type: 'saved-message:create',
        entry: { title: 'Welcome', category: 'Chat', message: 'Hello {{player}}' },
        requestId: 'saved-create'
    }));
    assert.deepEqual(await createUpdate, {
        type: 'saved-messages:update',
        messages: [{ id: 'saved-1', title: 'Welcome', category: 'Chat', message: 'Hello {{player}}' }]
    });
    assert.deepEqual(await createResult, {
        type: 'action:result',
        requestId: 'saved-create',
        ok: true,
        result: { id: 'saved-1', title: 'Welcome', category: 'Chat', message: 'Hello {{player}}' }
    });

    const deleteUpdate = nextSocketMessage(socket, 'saved-messages:update');
    const deleteResult = nextSocketMessage(socket, 'action:result');
    socket.send(JSON.stringify({
        type: 'saved-message:delete',
        messageId: 'saved-1',
        requestId: 'saved-delete'
    }));
    assert.deepEqual(await deleteUpdate, { type: 'saved-messages:update', messages: [] });
    assert.deepEqual(await deleteResult, {
        type: 'action:result',
        requestId: 'saved-delete',
        ok: true,
        result: { id: 'saved-1' }
    });
    socket.close();
});

test('rejects websocket connections without proxy identity or an allowed origin', async t => {
    const { url } = await openServer(t, { requireProxyAuth: true });
    const responseStatus = await new Promise(resolveStatus => {
        const socket = new WebSocket(url, { headers: { origin: 'http://localhost:5173' } });
        socket.once('unexpected-response', (_request, response) => {
            resolveStatus(response.statusCode);
            response.resume();
        });
        socket.once('error', () => {});
    });
    assert.equal(responseStatus, 401);
});

test('allows same-origin websocket access in production when proxy auth is disabled', async t => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousProxyAuth = process.env.REQUIRE_PROXY_AUTH;
    process.env.NODE_ENV = 'production';
    process.env.REQUIRE_PROXY_AUTH = 'false';

    let server;
    try {
        server = await openServer(t);
    } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        if (previousProxyAuth === undefined) delete process.env.REQUIRE_PROXY_AUTH;
        else process.env.REQUIRE_PROXY_AUTH = previousProxyAuth;
    }

    const socket = new WebSocket(server.url, { headers: { origin: server.origin } });
    const snapshot = new Promise((resolve, reject) => {
        socket.once('message', data => resolve(JSON.parse(data.toString())));
        socket.once('error', reject);
    });
    await once(socket, 'open');
    assert.deepEqual(await snapshot, { type: 'snapshot', bots: server.manager.getSnapshot() });
    socket.close();
});

test('rejects invalid browser origins', async t => {
    const { url } = await openServer(t);
    const responseStatus = await new Promise(resolveStatus => {
        const socket = new WebSocket(url, { headers: { origin: 'https://untrusted.example' } });
        socket.once('unexpected-response', (_request, response) => {
            resolveStatus(response.statusCode);
            response.resume();
        });
        socket.once('error', () => {});
    });
    assert.equal(responseStatus, 403);
});

test('allows same-origin websocket access for local non-production use', async t => {
    const { manager, origin, url } = await openServer(t);
    const socket = new WebSocket(url, { headers: { origin } });
    const snapshot = new Promise((resolve, reject) => {
        socket.once('message', data => resolve(JSON.parse(data.toString())));
        socket.once('error', reject);
    });
    await once(socket, 'open');
    assert.deepEqual(await snapshot, { type: 'snapshot', bots: manager.getSnapshot() });
    socket.close();
});

test('serves locally generated item sprite maps', async t => {
    const iconDirectory = await mkdtemp(join(tmpdir(), 'mineclank-item-icons-'));
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await writeFile(join(iconDirectory, 'food-sprites.svg'), svg);
    t.after(() => rm(iconDirectory, { recursive: true, force: true }));

    const { origin } = await openServer(t, { localItemIconsDir: iconDirectory });
    const response = await fetch(`${origin}/item-icons/food-sprites.svg`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/svg+xml');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), svg);
});