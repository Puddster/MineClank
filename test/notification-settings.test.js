import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { defaultNotificationSettings, NotificationSettings } from '../server/notification-settings.js';
import { PushNotifications, validatePushSubscription } from '../server/push-notifications.js';

test('notification settings persist per bot and validate thresholds', async t => {
    const directory = await mkdtemp(join(os.tmpdir(), 'mineclank-notifications-'));
    const path = join(directory, 'notifications.sqlite');
    let store = new NotificationSettings(path);
    t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
    const settings = { ...defaultNotificationSettings, disconnect: true, nearbyDistance: 40 };
    assert.deepEqual(store.get('alpha'), defaultNotificationSettings);
    store.set('alpha', settings);
    assert.throws(() => store.set('alpha', { ...settings, airThreshold: 21 }), /airThreshold/);
    assert.throws(() => store.set('alpha', { ...settings, nearbyDistance: 0 }), /nearbyDistance/);
    assert.throws(() => store.set('alpha', { ...settings, death: 'true' }), /death/);
    store.close();
    store = new NotificationSettings(path);
    assert.deepEqual(store.get('alpha'), settings);
    assert.deepEqual(store.get('beta'), defaultNotificationSettings);
    assert.deepEqual(store.listAll(), { alpha: settings });
    store.deleteBot('alpha');
    assert.deepEqual(store.listAll(), {});
});

test('push subscriptions and VAPID keys persist and expired subscriptions are removed', async t => {
    const directory = await mkdtemp(join(os.tmpdir(), 'mineclank-push-'));
    const path = join(directory, 'notifications.sqlite');
    let store = new NotificationSettings(path);
    t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
    const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/example', keys: {
        p256dh: Buffer.alloc(65, 1).toString('base64url'), auth: Buffer.alloc(16, 2).toString('base64url')
    } };
    const push = new PushNotifications(store, { send: async () => { throw { statusCode: 410 }; } });
    push.subscribe(subscription);
    const publicKey = push.publicKey;
    store.close();
    store = new NotificationSettings(path);
    const restored = new PushNotifications(store, { send: async () => { throw { statusCode: 410 }; } });
    assert.equal(restored.publicKey, publicKey);
    assert.deepEqual(store.listSubscriptions(), [subscription]);
    await assert.rejects(restored.test(subscription.endpoint), /delivery failed/);
    assert.deepEqual(store.listSubscriptions(), []);
    assert.throws(() => validatePushSubscription({ ...subscription, endpoint: 'https://127.0.0.1/' }), /Unsupported/);
    assert.throws(() => validatePushSubscription({ ...subscription, endpoint: 'https://fcm.googleapis.com.evil.example/' }), /Unsupported/);
    assert.throws(() => validatePushSubscription({ ...subscription, keys: {} }), /keys/);
});