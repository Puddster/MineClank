import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadBotConfigs } from '../server/config-loader.js';

test('loads bot configs in filename order with isolated auth folders', async () => {
    const root = await mkdtemp(join(os.tmpdir(), 'mf-fe-config-'));
    const configsPath = join(root, 'configs');
    const authPath = join(root, 'auth');
    await mkdir(configsPath);
    await writeFile(join(configsPath, 'zeta.json'), JSON.stringify({ username: 'Zed', host: 'server.test' }));
    await writeFile(join(configsPath, 'alpha.json'), JSON.stringify({
        username: 'Alpha',
        host: 'server.test',
        port: 25566,
        onJoin: ['/survival'],
        physicsEnabled: false
    }));
    await writeFile(join(configsPath, 'ignored.json.example'), 'not json');

    try {
        const configs = await loadBotConfigs(configsPath, authPath);
        assert.deepEqual(configs.map(config => config.id), ['alpha', 'zeta']);
        assert.equal(configs[0].port, 25566);
        assert.equal(configs[1].port, 25565);
        assert.equal(configs[0].auth, 'microsoft');
        assert.equal(configs[0].physicsEnabled, false);
        assert.equal(configs[1].physicsEnabled, true);
        assert.deepEqual(configs[0].onJoin, ['/survival']);
        assert.equal(configs[0].profilesFolder, join(authPath, 'alpha'));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('rejects custom auth paths and invalid ports', async () => {
    const root = await mkdtemp(join(os.tmpdir(), 'mf-fe-invalid-'));
    const configsPath = join(root, 'configs');

    try {
        await mkdir(configsPath);
        await writeFile(join(configsPath, 'bad.json'), JSON.stringify({ username: 'Bot', host: 'server.test', port: 70000 }));
        await assert.rejects(loadBotConfigs(configsPath, join(root, 'auth')), /port must be an integer/);

        await rm(join(configsPath, 'bad.json'));
        await writeFile(join(configsPath, 'bad.json'), JSON.stringify({ username: 'Bot', host: 'server.test', profilesFolder: '..' }));
        await assert.rejects(loadBotConfigs(configsPath, join(root, 'auth')), /unsupported fields: profilesFolder/);

        await rm(join(configsPath, 'bad.json'));
        await writeFile(join(configsPath, 'bad.json'), JSON.stringify({ username: 'Bot', host: 'server.test', onJoin: ['hello'] }));
        await assert.rejects(loadBotConfigs(configsPath, join(root, 'auth')), /onJoin must be an array/);

        await rm(join(configsPath, 'bad.json'));
        await writeFile(join(configsPath, 'bad.json'), JSON.stringify({ username: 'Bot', host: 'server.test', physicsEnabled: 'false' }));
        await assert.rejects(loadBotConfigs(configsPath, join(root, 'auth')), /physicsEnabled must be a boolean/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});