import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { defaultNotificationSettings } from '../shared/notification-defaults.js';

export { defaultNotificationSettings };

export function validateNotificationSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid notification settings');
    const result = {};
    for (const [key, defaultValue] of Object.entries(defaultNotificationSettings)) {
        const value = settings[key];
        if (typeof defaultValue === 'boolean') {
            if (typeof value !== 'boolean') throw new Error(`Invalid ${key} setting`);
        } else {
            const minimum = key === 'nearbyDistance' ? 1 : 0;
            const maximum = key === 'nearbyDistance' ? 256 : 20;
            if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`Invalid ${key} setting`);
        }
        result[key] = value;
    }
    return result;
}

function validateId(id) {
    if (typeof id !== 'string' || !id || id.length > 80) throw new Error('Invalid bot id');
    return id;
}

export class NotificationSettings {
    constructor(databasePath) {
        if (typeof databasePath !== 'string' || !databasePath) throw new Error('A notification database path is required');
        mkdirSync(dirname(databasePath), { recursive: true });
        this.database = new Database(databasePath);
        this.database.pragma('journal_mode = WAL');
        this.database.exec(`
            CREATE TABLE IF NOT EXISTS notification_settings (bot_id TEXT PRIMARY KEY, settings TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS push_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint TEXT PRIMARY KEY, subscription TEXT NOT NULL)
        `);
        this.select = this.database.prepare('SELECT settings FROM notification_settings WHERE bot_id = ?');
        this.selectAll = this.database.prepare('SELECT bot_id AS id, settings FROM notification_settings');
        this.upsert = this.database.prepare('INSERT INTO notification_settings (bot_id, settings) VALUES (?, ?) ON CONFLICT(bot_id) DO UPDATE SET settings = excluded.settings');
        this.remove = this.database.prepare('DELETE FROM notification_settings WHERE bot_id = ?');
    }

    get(id) {
        const row = this.select.get(validateId(id));
        return row ? validateNotificationSettings(JSON.parse(row.settings)) : { ...defaultNotificationSettings };
    }

    listAll() {
        return Object.fromEntries(this.selectAll.all().map(row => [row.id, validateNotificationSettings(JSON.parse(row.settings))]));
    }

    set(id, settings) {
        const validated = validateNotificationSettings(settings);
        this.upsert.run(validateId(id), JSON.stringify(validated));
        return validated;
    }

    deleteBot(id) {
        this.remove.run(validateId(id));
    }

    getMetadata(key) {
        return this.database.prepare('SELECT value FROM push_metadata WHERE key = ?').get(key)?.value ?? null;
    }

    setMetadata(key, value) {
        this.database.prepare('INSERT INTO push_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
    }

    saveSubscription(subscription) {
        this.database.prepare('INSERT INTO push_subscriptions (endpoint, subscription) VALUES (?, ?) ON CONFLICT(endpoint) DO UPDATE SET subscription = excluded.subscription')
            .run(subscription.endpoint, JSON.stringify(subscription));
    }

    getSubscription(endpoint) {
        const row = this.database.prepare('SELECT subscription FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
        return row ? JSON.parse(row.subscription) : null;
    }

    listSubscriptions() {
        return this.database.prepare('SELECT subscription FROM push_subscriptions').all().map(row => JSON.parse(row.subscription));
    }

    deleteSubscription(endpoint) {
        this.database.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
    }

    close() {
        this.database.close();
    }
}