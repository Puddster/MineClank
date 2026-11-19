import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { defaultNotificationSettings } from '../server/notification-settings.js';
import { NotificationMonitor } from '../server/notification-monitor.js';

test('notifies once per crossing, connection loss, death, and incoming message', () => {
    const manager = new EventEmitter();
    manager.getSnapshot = () => [{ id: 'alpha', username: 'Alice' }];
    const settings = { get: () => ({ ...defaultNotificationSettings, disconnect: true, directMessage: true, lowHealth: true, death: true, nearbyPlayer: true }) };
    const messages = [];
    const push = { broadcast: async payload => { messages.push(payload.body); } };
    let time = 0;
    const monitor = new NotificationMonitor(manager, settings, push, { now: () => time });
    const bot = { id: 'alpha', status: 'online', playerStats: { health: 6, isAlive: true }, onlinePlayers: [{ username: 'Bob', distance: 5 }] };
    manager.emit('bot-state', bot);
    manager.emit('bot-state', bot);
    manager.emit('bot-direct-message', { id: 'alpha', entry: { direction: 'outgoing', player: 'Bob', text: 'ignore' } });
    manager.emit('bot-direct-message', { id: 'alpha', entry: { direction: 'incoming', player: 'Bob', text: 'hello' } });
    manager.emit('bot-death', { id: 'alpha' });
    manager.emit('bot-state', { ...bot, playerStats: { health: 0, isAlive: false } });
    manager.emit('bot-disconnected', { id: 'alpha', kicked: true, reason: 'reason' });
    manager.emit('bot-disconnected', { id: 'alpha', kicked: false, reason: 'end' });
    assert.deepEqual(messages, ['Health low: 6/20', 'Bob nearby (5 blocks)', 'Bob: hello', 'Bot died', 'Kicked: reason']);
    time = 60001;
    manager.emit('bot-state', { ...bot, playerStats: { health: 10, isAlive: true }, onlinePlayers: [] });
    manager.emit('bot-state', bot);
    assert.deepEqual(messages.slice(-2), ['Health low: 6/20', 'Bob nearby (5 blocks)']);
    monitor.close();
});

test('handles low hunger and air, unknown players, cooldowns and reconnects', () => {
    const manager = new EventEmitter();
    manager.getSnapshot = () => [{ id: 'alpha', username: 'Alice' }];
    const settings = { get: () => ({ ...defaultNotificationSettings, lowHunger: true, lowAir: true, nearbyPlayer: true, disconnect: true }) };
    const messages = [];
    const push = { broadcast: async payload => { messages.push(payload.body); } };
    let time = 0;
    const monitor = new NotificationMonitor(manager, settings, push, { now: () => time });
    const bot = { id: 'alpha', status: 'online', playerStats: { food: 6, oxygenLevel: 5 }, onlinePlayers: [
        { username: 'Alice', isSelf: true, distance: 0 }, { username: 'Bob', distance: null }
    ] };
    manager.emit('bot-state', bot);
    assert.deepEqual(messages, ['Hunger low: 6/20', 'Air low: 5/20']);
    manager.emit('bot-state', { ...bot, playerStats: { food: 10, oxygenLevel: 10 } });
    manager.emit('bot-state', bot);
    assert.equal(messages.length, 2);
    manager.emit('bot-disconnected', { id: 'alpha', reason: 'lost' });
    manager.emit('bot-state', { ...bot, status: 'reconnecting' });
    time = 60001;
    manager.emit('bot-state', { ...bot, onlinePlayers: [{ username: 'Bob', distance: 2 }] });
    manager.emit('bot-disconnected', { id: 'alpha', reason: 'again' });
    assert.deepEqual(messages.slice(2), ['Disconnected: lost', 'Hunger low: 6/20', 'Air low: 5/20', 'Bob nearby (2 blocks)', 'Disconnected: again']);
    monitor.close();
});

test('combines nearby players and limits notifications to one per minute', () => {
    const manager = new EventEmitter();
    manager.getSnapshot = () => [{ id: 'alpha', username: 'Alice' }];
    const settings = { get: () => ({ ...defaultNotificationSettings, nearbyPlayer: true }) };
    const messages = [];
    const push = { broadcast: async payload => { messages.push(payload.body); } };
    let time = 0;
    const timers = [];
    const monitor = new NotificationMonitor(manager, settings, push, {
        now: () => time,
        schedule: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
        cancel: () => {}
    });
    const state = players => ({ id: 'alpha', status: 'online', playerStats: {}, onlinePlayers: players });
    manager.emit('bot-state', state([{ username: 'Bob', distance: 5 }, { username: 'Carol', distance: 10 }, { username: 'Dave', distance: 2 }]));
    assert.deepEqual(messages, ['3 players nearby: Bob (5 blocks), Carol (10 blocks), Dave (2 blocks)']);
    time = 10000;
    manager.emit('bot-state', state([{ username: 'Bob', distance: 5 }, { username: 'Eve', distance: 8 }]));
    assert.equal(messages.length, 1);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delay, 50000);
    time = 20000;
    manager.emit('bot-state', state([{ username: 'Bob', distance: 5 }, { username: 'Eve', distance: 8 }, { username: 'Frank', distance: 3 }]));
    assert.equal(timers.length, 1);
    time = 30000;
    manager.emit('bot-state', state([{ username: 'Bob', distance: 5 }, { username: 'Frank', distance: 3 }]));
    time = 60001;
    timers[0].callback();
    assert.deepEqual(messages.slice(1), ['Frank nearby (3 blocks)']);
    time = 70000;
    manager.emit('bot-state', { ...state([]), status: 'reconnecting' });
    manager.emit('bot-state', state([{ username: 'Bob', distance: 5 }, { username: 'Frank', distance: 3 }]));
    assert.equal(messages.length, 2);
    assert.equal(timers.length, 2);
    assert.equal(timers[1].delay, 50001);
    time = 120001;
    timers[1].callback();
    assert.deepEqual(messages.slice(2), ['2 players nearby: Bob (5 blocks), Frank (3 blocks)']);
    monitor.close();
});

test('does not mistake respawn state for death', () => {
    const manager = new EventEmitter();
    manager.getSnapshot = () => [{ id: 'alpha' }];
    const settings = { get: () => ({ ...defaultNotificationSettings, death: true }) };
    const messages = [];
    const monitor = new NotificationMonitor(manager, settings, { broadcast: async payload => { messages.push(payload.body); } });
    manager.emit('bot-state', { id: 'alpha', status: 'online', playerStats: { isAlive: false }, onlinePlayers: [] });
    assert.deepEqual(messages, []);
    manager.emit('bot-death', { id: 'alpha' });
    manager.emit('bot-state', { id: 'alpha', status: 'online', playerStats: { isAlive: false }, onlinePlayers: [] });
    assert.deepEqual(messages, ['Bot died']);
    monitor.close();
});