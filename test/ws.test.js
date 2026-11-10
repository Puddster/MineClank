import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import test from 'node:test';
import WebSocket from 'ws';
import { createControlServer } from '../server/ws.js';

class FakeManager extends EventEmitter {
    constructor() {
        super();
        this.bots = [{ id: 'alpha', username: 'Alpha', status: 'online', logs: [] }];
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

    async dropInventoryItem(id, slot) {
        return { id, slot, dropped: 1 };
    }

    async dropInventoryStack(id, slot) {
        return { id, slot, dropped: 4 };
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

test('streams a snapshot and dispatches validated bot commands', async t => {
    const { manager, url } = await openServer(t);
    const socket = new WebSocket(url, { headers: { origin: 'http://localhost:5173' } });
    const firstMessage = new Promise((resolve, reject) => {
        socket.once('message', data => resolve(JSON.parse(data.toString())));
        socket.once('error', reject);
    });
    await once(socket, 'open');
    assert.deepEqual(await firstMessage, { type: 'snapshot', bots: manager.getSnapshot() });

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