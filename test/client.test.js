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