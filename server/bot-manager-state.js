function safeSkinTextureUrl(value) {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value);
        if (url.hostname !== 'textures.minecraft.net' || !/^\/texture\/[a-f0-9]{64}$/i.test(url.pathname)) return null;
        url.protocol = 'https:';
        url.search = '';
        url.hash = '';
        return url.href;
    } catch {
        return null;
    }
}

export function onlinePlayersSnapshot(bot) {
    const botPosition = bot?.entity?.position;
    return Object.values(bot?.players ?? {})
        .filter(player => typeof player?.username === 'string')
        .map(player => {
            const playerPosition = player.entity?.position;
            const isSelf = player.username === bot?.username;
            const hasPosition = !isSelf &&
                Number.isFinite(botPosition?.x) && Number.isFinite(botPosition?.y) && Number.isFinite(botPosition?.z) &&
                Number.isFinite(playerPosition?.x) && Number.isFinite(playerPosition?.y) && Number.isFinite(playerPosition?.z);
            const onlinePlayer = {
                username: player.username,
                displayName: player.displayName?.toString?.().trim() || player.username,
                isSelf,
                distance: hasPosition
                    ? Number(Math.hypot(
                        playerPosition.x - botPosition.x,
                        playerPosition.y - botPosition.y,
                        playerPosition.z - botPosition.z
                    ).toFixed(1))
                    : null
            };
            const skinUrl = safeSkinTextureUrl(player.skinData?.url);
            if (skinUrl) onlinePlayer.skinUrl = skinUrl;
            return onlinePlayer;
        })
        .sort((left, right) => left.username.localeCompare(right.username));
}

function finiteOrNull(value) {
    return Number.isFinite(value) ? value : null;
}

export function playerStatsSnapshot(bot) {
    if (!bot) return null;
    const progress = finiteOrNull(bot.experience?.progress);
    return {
        health: finiteOrNull(bot.health),
        food: finiteOrNull(bot.food),
        foodSaturation: finiteOrNull(bot.foodSaturation),
        oxygenLevel: Number.isFinite(bot.oxygenLevel) ? bot.oxygenLevel : 20,
        experienceLevel: finiteOrNull(bot.experience?.level),
        experienceProgress: progress === null ? null : Math.max(0, Math.min(1, progress)),
        gameMode: typeof bot.game?.gameMode === 'string' ? bot.game.gameMode : null,
        isAlive: typeof bot.isAlive === 'boolean' ? bot.isAlive : null,
        isSleeping: typeof bot.isSleeping === 'boolean' ? bot.isSleeping : null
    };
}

export function profileSnapshot(config) {
    return {
        username: config.username,
        host: config.host,
        port: config.port,
        auth: config.auth,
        ...(config.version ? { version: config.version } : {}),
        physicsEnabled: config.physicsEnabled,
        onJoin: [...config.onJoin]
    };
}

export function positionSnapshot(position) {
    if (!position) return null;
    return {
        x: Number(position.x.toFixed(1)),
        y: Number(position.y.toFixed(1)),
        z: Number(position.z.toFixed(1))
    };
}