import { fetchMinecraftSkin } from './minecraft-skin.js';

const skinCacheTtlMs = 7 * 24 * 60 * 60 * 1000;
const missingSkinCacheTtlMs = 24 * 60 * 60 * 1000;
const skinLookupVersion = 2;

export const botManagerSkinMethods = {
    scheduleSkinLookup(record) {
        const username = record.config.username;
        const now = Date.now();
        const cached = this.botSettings?.getCachedSkin?.(username);
        if (cached) {
            record.skinUrl = cached.skinUrl;
            const ttl = cached.skinUrl ? skinCacheTtlMs : missingSkinCacheTtlMs;
            if (cached.lookupVersion === skinLookupVersion &&
                cached.fetchedAt <= now &&
                now - cached.fetchedAt < ttl) return;
        }

        this.lookupMinecraftSkin(record).catch(error => {
            this.logger.warn(`[server] Unable to resolve Minecraft skin for ${username}: ${error.message}`);
        });
    },

    async refreshMinecraftSkin(id) {
        const record = this.requireRecord(id);
        const skinUrl = await this.lookupMinecraftSkin(record);
        return { id, skinFound: Boolean(skinUrl) };
    },

    lookupMinecraftSkin(record) {
        const username = record.config.username;
        const normalizedUsername = username.toLowerCase();
        let lookup = this.skinLookupPromises.get(normalizedUsername);
        if (!lookup) {
            lookup = this.skinLookupQueue.then(async () => {
                const skinUrl = await fetchMinecraftSkin(username, this.fetchImpl);
                this.botSettings?.cacheSkin?.(username, skinUrl);
                return skinUrl;
            });
            this.skinLookupPromises.set(normalizedUsername, lookup);
            this.skinLookupQueue = lookup.catch(() => {});
            const clearLookup = () => this.skinLookupPromises.delete(normalizedUsername);
            lookup.then(clearLookup, clearLookup);
        }

        return lookup.then(skinUrl => {
            if (this.shuttingDown || this.records.get(record.id) !== record ||
                record.config.username.toLowerCase() !== normalizedUsername) return;
            record.skinUrl = skinUrl;
            this.emitState(record);
            return skinUrl;
        });
    }
};
