import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { parseConfig } from './config-loader.js';

function storedProfile(config) {
    return {
        username: config.username,
        host: config.host,
        port: config.port,
        auth: config.auth,
        ...(config.version ? { version: config.version } : {}),
        physicsEnabled: config.physicsEnabled,
        onJoin: config.onJoin
    };
}

function parseLegacyAutoStart(filePath) {
    if (!filePath || !existsSync(filePath)) return {};
    const settings = JSON.parse(readFileSync(filePath, 'utf8'));
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) ||
        !settings.autoStart || typeof settings.autoStart !== 'object' || Array.isArray(settings.autoStart) ||
        Object.values(settings.autoStart).some(value => typeof value !== 'boolean')) {
        throw new Error('Legacy bot settings file must contain an autoStart object with boolean values');
    }
    return settings.autoStart;
}

export class BotSettings {
    constructor(databasePath, { legacySettingsPath = null } = {}) {
        if (typeof databasePath !== 'string' || !databasePath) {
            throw new Error('A bot settings database path is required');
        }
        mkdirSync(dirname(databasePath), { recursive: true });
        this.database = new Database(databasePath);
        this.database.pragma('journal_mode = WAL');
        this.database.exec(`
            CREATE TABLE IF NOT EXISTS bot_profiles (
                id TEXT PRIMARY KEY,
                profile TEXT NOT NULL,
                auto_start INTEGER NOT NULL DEFAULT 1 CHECK (auto_start IN (0, 1))
            );
            CREATE TABLE IF NOT EXISTS bot_settings_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS bot_skin_cache (
                username TEXT PRIMARY KEY COLLATE NOCASE,
                skin_url TEXT,
                fetched_at INTEGER NOT NULL,
                lookup_version INTEGER NOT NULL DEFAULT 0
            )
        `);
        const skinCacheColumns = this.database.prepare('PRAGMA table_info(bot_skin_cache)').all();
        if (!skinCacheColumns.some(column => column.name === 'lookup_version')) {
            this.database.exec('ALTER TABLE bot_skin_cache ADD COLUMN lookup_version INTEGER NOT NULL DEFAULT 0');
        }
        this.legacySettingsPath = legacySettingsPath;
        this.selectProfiles = this.database.prepare(
            'SELECT id, profile, auto_start AS autoStart FROM bot_profiles ORDER BY id COLLATE NOCASE'
        );
        this.selectProfile = this.database.prepare(
            'SELECT id, profile, auto_start AS autoStart FROM bot_profiles WHERE id = ?'
        );
        this.insertProfile = this.database.prepare(
            'INSERT INTO bot_profiles (id, profile, auto_start) VALUES (?, ?, ?)'
        );
        this.updateProfileStatement = this.database.prepare(
            'UPDATE bot_profiles SET profile = ?, auto_start = ? WHERE id = ?'
        );
        this.updateAutoStartStatement = this.database.prepare(
            'UPDATE bot_profiles SET auto_start = ? WHERE id = ?'
        );
        this.deleteProfileStatement = this.database.prepare('DELETE FROM bot_profiles WHERE id = ?');
        this.selectSkinCache = this.database.prepare(
            'SELECT skin_url AS skinUrl, fetched_at AS fetchedAt, lookup_version AS lookupVersion FROM bot_skin_cache WHERE username = ?'
        );
        this.upsertSkinCache = this.database.prepare(`
            INSERT INTO bot_skin_cache (username, skin_url, fetched_at, lookup_version)
            VALUES (?, ?, ?, 2)
            ON CONFLICT(username) DO UPDATE SET
                skin_url = excluded.skin_url,
                fetched_at = excluded.fetched_at,
                lookup_version = excluded.lookup_version
        `);
        this.hasImportedLegacy = this.database.prepare(
            "SELECT value FROM bot_settings_metadata WHERE key = 'legacy_profiles_imported'"
        );
        this.markLegacyImported = this.database.prepare(
            "INSERT INTO bot_settings_metadata (key, value) VALUES ('legacy_profiles_imported', 'true')"
        );
        this.importTransaction = this.database.transaction((configs, autoStart) => {
            for (const config of configs) {
                if (!this.selectProfile.get(config.id)) {
                    this.insertProfile.run(
                        config.id,
                        JSON.stringify(storedProfile(config)),
                        autoStart[config.id] === false ? 0 : 1
                    );
                }
            }
            this.markLegacyImported.run();
        });
    }

    importLegacyProfiles(configs) {
        if (this.hasImportedLegacy.get()) return false;
        this.importTransaction(configs, parseLegacyAutoStart(this.legacySettingsPath));
        return true;
    }

    needsLegacyImport() {
        return !this.hasImportedLegacy.get();
    }

    listProfiles(authDir) {
        return this.selectProfiles.all().map(row => ({
            ...parseConfig(row.id, row.profile, authDir),
            autoStart: Boolean(row.autoStart)
        }));
    }

    getAutoStart(id) {
        const row = this.selectProfile.get(id);
        if (!row) throw new Error(`Unknown bot: ${id}`);
        return Boolean(row.autoStart);
    }

    createProfile(id, profile, autoStart, authDir) {
        const config = parseConfig(id, JSON.stringify(profile), authDir);
        if (typeof autoStart !== 'boolean') throw new Error('Auto-start setting must be a boolean');
        this.insertProfile.run(id, JSON.stringify(storedProfile(config)), autoStart ? 1 : 0);
        return { ...config, autoStart };
    }

    updateProfile(id, profile, autoStart, authDir) {
        const config = parseConfig(id, JSON.stringify(profile), authDir);
        if (typeof autoStart !== 'boolean') throw new Error('Auto-start setting must be a boolean');
        const result = this.updateProfileStatement.run(
            JSON.stringify(storedProfile(config)),
            autoStart ? 1 : 0,
            id
        );
        if (!result.changes) throw new Error(`Unknown bot: ${id}`);
        return { ...config, autoStart };
    }

    setAutoStart(id, enabled) {
        if (typeof enabled !== 'boolean') throw new Error('Auto-start setting must be a boolean');
        const result = this.updateAutoStartStatement.run(enabled ? 1 : 0, id);
        if (!result.changes) throw new Error(`Unknown bot: ${id}`);
    }

    deleteProfile(id) {
        const result = this.deleteProfileStatement.run(id);
        if (!result.changes) throw new Error(`Unknown bot: ${id}`);
    }

    getCachedSkin(username) {
        return this.selectSkinCache.get(username) || null;
    }

    cacheSkin(username, skinUrl, fetchedAt = Date.now()) {
        if (typeof username !== 'string' || !username) throw new Error('A username is required for skin caching');
        if (skinUrl !== null && typeof skinUrl !== 'string') throw new Error('Skin URL must be a string or null');
        if (!Number.isFinite(fetchedAt)) throw new Error('Skin cache timestamp must be a number');
        this.upsertSkinCache.run(username, skinUrl, fetchedAt);
    }

    close() {
        this.database.close();
    }
}
