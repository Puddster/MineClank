import * as webPush from 'web-push';

const providerHosts = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];

export function validatePushSubscription(subscription) {
    if (!subscription || typeof subscription !== 'object' || typeof subscription.endpoint !== 'string' || subscription.endpoint.length > 2048) {
        throw new Error('Invalid push subscription');
    }
    let url;
    try { url = new URL(subscription.endpoint); } catch { throw new Error('Invalid push endpoint'); }
    const allowed = providerHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
    if (url.protocol !== 'https:' || !allowed || url.username || url.password || url.port || url.hash) throw new Error('Unsupported push endpoint');
    const keys = subscription.keys;
    for (const [key, size] of [['p256dh', 65], ['auth', 16]]) {
        if (typeof keys?.[key] !== 'string' || !/^[A-Za-z0-9_-]+$/.test(keys[key]) || Buffer.from(keys[key], 'base64url').length !== size) {
            throw new Error('Invalid push subscription keys');
        }
    }
    return { endpoint: url.href, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

export class PushNotifications {
    constructor(store, { send = webPush.sendNotification.bind(webPush), subject = 'mailto:admin@localhost' } = {}) {
        this.store = store;
        this.send = send;
        this.queue = Promise.resolve();
        this.queued = 0;
        let keys = store.getMetadata('vapid');
        if (!keys) {
            keys = JSON.stringify(webPush.generateVAPIDKeys());
            store.setMetadata('vapid', keys);
        }
        this.vapid = { subject, ...JSON.parse(keys) };
    }

    get publicKey() {
        return this.vapid.publicKey;
    }

    subscribe(subscription) {
        const validated = validatePushSubscription(subscription);
        this.store.saveSubscription(validated);
    }

    unsubscribe(endpoint) {
        if (typeof endpoint !== 'string' || endpoint.length > 2048) throw new Error('Invalid push endpoint');
        this.store.deleteSubscription(endpoint);
    }

    async deliver(subscription, payload) {
        try {
            await this.send(subscription, JSON.stringify(payload), { vapidDetails: this.vapid, TTL: 300, timeout: 10000 });
        } catch (error) {
            if (error.statusCode === 404 || error.statusCode === 410) this.store.deleteSubscription(subscription.endpoint);
            throw new Error('Push delivery failed');
        }
    }

    async test(endpoint) {
        const subscription = this.store.getSubscription(endpoint);
        if (!subscription) throw new Error('This device is not subscribed');
        await this.deliver(subscription, { title: 'MineClank', body: 'Test notification' });
    }

    broadcast(payload) {
        if (this.queued >= 100) return Promise.resolve();
        this.queued += 1;
        const delivery = this.queue.then(() => this.deliverBroadcast(payload));
        this.queue = delivery.catch(() => {}).finally(() => { this.queued -= 1; });
        return delivery;
    }

    async deliverBroadcast(payload) {
        const subscriptions = this.store.listSubscriptions();
        for (let index = 0; index < subscriptions.length; index += 8) {
            await Promise.allSettled(subscriptions.slice(index, index + 8).map(subscription => this.deliver(subscription, payload)));
        }
    }

    async close() {
        await this.queue;
    }
}