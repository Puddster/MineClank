const profileLookupUrl = username =>
    `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`;

function normalizeTextureUrl(value) {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value);
        if (['http:', 'https:'].includes(url.protocol) &&
            url.hostname === 'textures.minecraft.net' &&
            /^\/texture\/[a-f0-9]{64}$/i.test(url.pathname)) {
            url.protocol = 'https:';
            url.search = '';
            url.hash = '';
            return url.href;
        }
        return null;
    } catch {
        return null;
    }
}

async function getJson(fetchImpl, url) {
    const response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(8_000)
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Minecraft profile service returned HTTP ${response.status}`);
    return response.json();
}

export async function fetchMinecraftSkin(username, fetchImpl = globalThis.fetch) {
    if (!/^[A-Za-z0-9_]{1,16}$/.test(username)) {
        throw new Error('Invalid Minecraft username for skin lookup');
    }
    if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable for Minecraft skin lookup');

    const profile = await getJson(fetchImpl, profileLookupUrl(username));
    if (!profile) return null;
    if (typeof profile.id !== 'string' || !/^[a-f0-9]{32}$/i.test(profile.id)) {
        throw new Error('Minecraft profile service returned an invalid profile ID');
    }

    const session = await getJson(fetchImpl, `https://sessionserver.mojang.com/session/minecraft/profile/${profile.id}`);
    if (!Array.isArray(session?.properties)) return null;
    const texturesProperty = session.properties.find(property => property?.name === 'textures');
    if (typeof texturesProperty?.value !== 'string') return null;

    let textures;
    try {
        textures = JSON.parse(Buffer.from(texturesProperty.value, 'base64').toString('utf8'));
    } catch {
        throw new Error('Minecraft profile service returned invalid skin data');
    }
    const skinUrl = textures?.textures?.SKIN?.url;
    return normalizeTextureUrl(skinUrl);
}
