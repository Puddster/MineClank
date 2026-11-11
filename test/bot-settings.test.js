import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { BotSettings } from '../server/bot-settings.js';

const profile = (username, host = 'server.test') => ({
    username,
    host,
    port: 25565,
    auth: 'microsoft',
    physicsEnabled: true,
    onJoin: []
});

test('imports legacy profiles once and persists profile and auto-start changes in SQLite', async () => {
    const root = await mkdtemp(join(os.tmpdir(), 'mineclank-bot-settings-'));
    const databasePath = join(root, 'data', 'bots.sqlite');
    const legacySettingsPath = join(root, 'data', 'bot-settings.json');
    const authDir = join(root, 'auth');
    await mkdir(join(root, 'data'));
    await writeFile(legacySettingsPath, JSON.stringify({ autoStart: { alpha: false } }));
    let settings = new BotSettings(databasePath, { legacySettingsPath });

    try {
        assert.equal(settings.importLegacyProfiles([
            { id: 'alpha', ...profile('Alpha'), profilesFolder: join(authDir, 'alpha') }
        ]), true);
        assert.equal(settings.importLegacyProfiles([{ id: 'later', ...profile('Later') }]), false);
        assert.deepEqual(settings.listProfiles(authDir).map(({ id, autoStart }) => ({ id, autoStart })), [
            { id: 'alpha', autoStart: false }
        ]);
        assert.deepEqual(settings.createProfile('beta', profile('Beta'), true, authDir), {
            id: 'beta',
            ...profile('Beta'),
            profilesFolder: join(authDir, 'beta'),
            autoStart: true
        });
        settings.setAutoStart('beta', false);
        settings.updateProfile('beta', profile('Beta Updated', 'new.server.test'), true, authDir);
        assert.equal(settings.listProfiles(authDir).find(bot => bot.id === 'beta').host, 'new.server.test');
        assert.equal(settings.getAutoStart('beta'), true);

        settings.close();
        settings = new BotSettings(databasePath, { legacySettingsPath });
        assert.deepEqual(settings.listProfiles(authDir).map(bot => bot.id), ['alpha', 'beta']);
        assert.equal(settings.getAutoStart('alpha'), false);
        settings.deleteProfile('beta');
        assert.deepEqual(settings.listProfiles(authDir).map(bot => bot.id), ['alpha']);
    } finally {
        settings.close();
        await rm(root, { recursive: true, force: true });
    }
});

test('validates profiles and auto-start values before saving', async () => {
    const root = await mkdtemp(join(os.tmpdir(), 'mineclank-invalid-settings-'));
    const settings = new BotSettings(join(root, 'bots.sqlite'));

    try {
        assert.throws(() => settings.createProfile('bad id', profile('Bot'), true, root), /Invalid bot config filename/);
        assert.throws(() => settings.createProfile('bad', { ...profile('Bot'), port: 70000 }, true, root), /port must be an integer/);
        assert.throws(() => settings.createProfile('bad', profile('Bot'), 'false', root), /Auto-start setting must be a boolean/);
        assert.throws(() => settings.setAutoStart('missing', false), /Unknown bot/);
    } finally {
        settings.close();
        await rm(root, { recursive: true, force: true });
    }
});
