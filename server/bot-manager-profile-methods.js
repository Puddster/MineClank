import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseConfig } from './config-loader.js';
import { redact } from './bot-manager-utils.js';

export const botManagerProfileMethods = {
    async startAllSequential() {
        const outcomes = [];
        for (const id of this.records.keys()) {
            if (this.shuttingDown) break;
            if (!(this.botSettings?.getAutoStart(id) ?? true)) {
                outcomes.push({ id, status: 'disabled' });
                continue;
            }
            try {
                outcomes.push(await this.start(id));
            } catch (error) {
                outcomes.push({ id, status: 'reconnecting', error: redact(error.message) });
            }
        }
        return outcomes;
    },

    setAutoStart(id, enabled) {
        const record = this.requireRecord(id);
        if (!this.botSettings) throw new Error('Bot settings are unavailable');
        if (typeof enabled !== 'boolean') throw new Error('Auto-start setting must be a boolean');
        this.botSettings.setAutoStart(id, enabled);
        this.emitState(record);
        return { id, autoStart: enabled };
    },

    createBotProfile(id, profile, autoStart) {
        if (!this.botSettings) throw new Error('Bot profile storage is unavailable');
        if (typeof autoStart !== 'boolean') throw new Error('Auto-start setting must be a boolean');
        parseConfig(id, JSON.stringify(profile), this.authDir);
        if (this.records.has(id)) throw new Error(`Bot already exists: ${id}`);
        const savedConfig = this.botSettings.createProfile(id, profile, autoStart, this.authDir);
        const record = this.createRecord(savedConfig);
        this.records.set(id, record);
        this.scheduleSkinLookup(record);
        this.publishSnapshot();
        return { id, autoStart };
    },

    async updateBotProfile(id, profile, autoStart) {
        const record = this.requireRecord(id);
        if (!this.botSettings) throw new Error('Bot profile storage is unavailable');
        if (typeof autoStart !== 'boolean') throw new Error('Auto-start setting must be a boolean');
        parseConfig(id, JSON.stringify(profile), this.authDir);
        if (record.status !== 'stopped') await this.stop(id);
        const previousUsername = record.config.username;
        record.config = this.botSettings.updateProfile(id, profile, autoStart, this.authDir);
        if (previousUsername.toLowerCase() !== record.config.username.toLowerCase()) record.skinUrl = null;
        this.scheduleSkinLookup(record);
        this.emitState(record);
        return { id, autoStart };
    },

    async deleteBotProfile(id) {
        const record = this.requireRecord(id);
        if (!this.botSettings) throw new Error('Bot profile storage is unavailable');
        if (record.status !== 'stopped') await this.stop(id);
        this.botSettings.deleteProfile(id);
        this.records.delete(id);
        this.publishSnapshot();
        return { id, deleted: true };
    },

    async resetMicrosoftAuthentication(id) {
        const record = this.requireRecord(id);
        if (record.config.auth !== 'microsoft') {
            throw new Error('Authentication reset is only available for Microsoft accounts');
        }
        await this.clearMicrosoftAuthentication(record);
        this.appendLog(record, 'Microsoft authentication cache cleared; start the bot to sign in again');
        this.emitState(record);
        return { id, status: record.status, authenticationReset: true };
    },

    async startMicrosoftAuthentication(id) {
        const record = this.requireRecord(id);
        if (record.config.auth !== 'microsoft') {
            throw new Error('Microsoft sign-in is only available for Microsoft accounts');
        }
        await this.clearMicrosoftAuthentication(record);
        this.appendLog(record, 'Starting fresh Microsoft sign-in');
        this.emitState(record);
        void this.start(id).catch(() => {
            record.authentication = {
                status: 'failed',
                error: 'Microsoft sign-in could not be started; check the bot log for details'
            };
            this.emitAuthenticationState(record);
        });
        return { id, status: 'connecting', authenticationStarted: true };
    },

    async clearMicrosoftAuthentication(record) {
        if (record.config.auth !== 'microsoft') {
            throw new Error('Authentication reset is only available for Microsoft accounts');
        }
        if (record.status !== 'stopped' || record.desired || record.reconnectTimer) {
            await this.stop(record.id);
        }
        const profileDir = resolve(this.authDir, record.id);
        if (dirname(profileDir) !== resolve(this.authDir)) {
            throw new Error('Invalid authentication profile path');
        }
        await rm(profileDir, { recursive: true, force: true });
        record.attempts = 0;
        record.retryClass = null;
        record.lastError = null;
        record.authentication = { status: 'idle' };
    }
};