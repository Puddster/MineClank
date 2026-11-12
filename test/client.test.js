import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequestId } from '../src/client.js';
import { inventoryKeyboardCoordinates } from '../src/inventory-drag.js';
import { createDashboardMessageHandler } from '../src/dashboard-socket-messages.js';

test('uses the browser UUID API when available', () => {
    assert.equal(createRequestId({ randomUUID: () => 'native-uuid' }), 'native-uuid');
});

test('generates a UUID with getRandomValues when randomUUID is unavailable', () => {
    const cryptoApi = {
        getRandomValues(bytes) {
            bytes.fill(0);
            return bytes;
        }
    };

    const requestId = createRequestId(cryptoApi);

    assert.match(requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('keyboard inventory dragging chooses the adjacent slot in the requested direction', () => {
    const coordinates = {
        currentCoordinates: { x: 100, y: 200 },
        context: {
            collisionRect: { left: 100, top: 200 },
            droppableContainers: {
                getEnabled: () => [
                    { rect: { current: { left: 100, top: 200 } } },
                    { rect: { current: { left: 140, top: 200 } } },
                    { rect: { current: { left: 100, top: 240 } } },
                    { rect: { current: null } }
                ]
            }
        }
    };
    const event = code => ({ code, preventDefault() {} });
    assert.deepEqual(inventoryKeyboardCoordinates(event('ArrowRight'), coordinates), { x: 140, y: 200 });
    assert.deepEqual(inventoryKeyboardCoordinates(event('ArrowDown'), coordinates), { x: 100, y: 240 });
    assert.equal(inventoryKeyboardCoordinates(event('ArrowLeft'), coordinates), undefined);
    assert.equal(inventoryKeyboardCoordinates(event('Escape'), coordinates), undefined);
});

test('closing a server menu returns to status without overriding an explicitly chosen tab', () => {
    let activeView = 'menu';
    const handler = createDashboardMessageHandler({
        openWindowsRef: { current: { alpha: true } },
        setActiveView: update => { activeView = typeof update === 'function' ? update(activeView) : update; },
        setBots() {},
        setSelectedId() {}
    });
    const state = openWindow => ({ data: JSON.stringify({
        type: 'bot:state', bot: { id: 'alpha', status: 'online', openWindow }
    }) });
    handler(state(null));
    assert.equal(activeView, 'status');
    handler(state({ id: 1 }));
    assert.equal(activeView, 'menu');
    activeView = 'inventory';
    handler(state(null));
    assert.equal(activeView, 'inventory');
});

test('direct message events are retained through bot state updates', () => {
    let bots = [{ id: 'alpha', logs: [], directMessages: [] }, { id: 'beta', directMessages: [] }];
    const handler = createDashboardMessageHandler({
        openWindowsRef: { current: {} },
        setBots: update => { bots = typeof update === 'function' ? update(bots) : update; },
        setActiveView() {},
        setSelectedId() {}
    });
    const entry = { player: 'Puddster', text: 'hello', direction: 'incoming', at: '2026-01-01T00:00:00.000Z' };
    handler({ data: JSON.stringify({ type: 'bot:direct-message', id: 'alpha', entry }) });
    handler({ data: JSON.stringify({ type: 'bot:state', bot: { id: 'alpha', status: 'online', openWindow: null } }) });
    assert.deepEqual(bots[0].directMessages, [entry]);
    assert.deepEqual(bots[1].directMessages, []);
});

test('replaces pin boards on snapshot and updates only the affected bot', () => {
    let boards = {};
    let notice = '';
    let pending = { request: 'pin-board:set' };
    const handler = createDashboardMessageHandler({
        setPinBoards: update => { boards = typeof update === 'function' ? update(boards) : update; },
        setPinNotice: value => { notice = value; },
        pendingRef: { current: { ...pending } },
        setPending: update => { pending = update(pending); }
    });
    const receive = message => handler({ data: JSON.stringify(message) });
    receive({ type: 'pin-boards:snapshot', boards: { alpha: [{ type: 'status', ref: 'health' }], beta: [] } });
    receive({ type: 'pin-board:update', id: 'beta', pins: [{ type: 'inventory', ref: '9' }] });
    assert.deepEqual(boards, { alpha: [{ type: 'status', ref: 'health' }], beta: [{ type: 'inventory', ref: '9' }] });
    receive({ type: 'action:result', requestId: 'request', ok: false, error: 'Unsupported action' });
    assert.match(notice, /Restart the backend/);
    assert.deepEqual(pending, {});
});