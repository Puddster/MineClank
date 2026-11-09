import { mkdir, readFile, readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const idPattern = /^[a-z0-9][a-z0-9_-]{0,47}$/i;
const supportedAuth = new Set(['microsoft', 'offline']);
const supportedKeys = new Set(['username', 'host', 'port', 'auth', 'version', 'onJoin', 'physicsEnabled']);

function parseConfig(id, text, authDir) {
    if (!idPattern.test(id)) {
        throw new Error(`Invalid bot config filename: ${id}. Use letters, numbers, underscores, and hyphens.`);
    }

    let raw;
    try {
        raw = JSON.parse(text);
    } catch (error) {
        throw new Error(`Invalid JSON in ${id}.json: ${error.message}`);
    }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`${id}.json must contain a JSON object.`);
    }

    const unknownKeys = Object.keys(raw).filter(key => !supportedKeys.has(key));
    if (unknownKeys.length) {
        throw new Error(`${id}.json contains unsupported fields: ${unknownKeys.join(', ')}`);
    }

    if (typeof raw.username !== 'string' || !raw.username.trim()) {
        throw new Error(`${id}.json requires a non-empty username.`);
    }
    if (typeof raw.host !== 'string' || !raw.host.trim() || /\s/.test(raw.host)) {
        throw new Error(`${id}.json requires a valid host.`);
    }

    const port = raw.port ?? 25565;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`${id}.json port must be an integer from 1 to 65535.`);
    }

    const auth = raw.auth ?? 'microsoft';
    if (!supportedAuth.has(auth)) {
        throw new Error(`${id}.json auth must be "microsoft" or "offline".`);
    }
    if (raw.version != null && (typeof raw.version !== 'string' || !raw.version.trim())) {
        throw new Error(`${id}.json version must be a non-empty string when provided.`);
    }
    if (raw.physicsEnabled != null && typeof raw.physicsEnabled !== 'boolean') {
        throw new Error(`${id}.json physicsEnabled must be a boolean when provided.`);
    }
    const onJoin = raw.onJoin ?? [];
    if (!Array.isArray(onJoin) || onJoin.length > 20 || onJoin.some(command =>
        typeof command !== 'string' || command.length > 256 || /[\r\n]/.test(command) || !command.trim().startsWith('/') || command.trim() === '/'
    )) {
        throw new Error(`${id}.json onJoin must be an array of up to 20 single-line slash commands.`);
    }

    return {
        id,
        username: raw.username.trim(),
        host: raw.host.trim(),
        port,
        auth,
        ...(raw.version ? { version: raw.version.trim() } : {}),
        physicsEnabled: raw.physicsEnabled ?? true,
        onJoin: onJoin.map(command => command.trim()),
        profilesFolder: resolve(authDir, id)
    };
}

export async function loadBotConfigs(configDir, authDir) {
    await mkdir(configDir, { recursive: true });
    const names = (await readdir(configDir, { withFileTypes: true }))
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => entry.name)
        .sort((left, right) => left.localeCompare(right));

    const configs = [];
    for (const name of names) {
        const id = basename(name, '.json');
        const text = await readFile(resolve(configDir, name), 'utf8');
        configs.push(parseConfig(id, text, authDir));
    }

    return configs;
}