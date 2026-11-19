export class NotificationMonitor {
    constructor(manager, settings, push, { now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {}) {
        this.manager = manager;
        this.settings = settings;
        this.push = push;
        this.now = now;
        this.schedule = schedule;
        this.cancel = cancel;
        this.states = new Map();
        this.handlers = {
            'bot-state': bot => this.onState(bot),
            'bot-direct-message': event => this.onMessage(event),
            'bot-disconnected': event => this.onDisconnected(event),
            'bot-death': event => this.onDeath(event.id)
        };
        for (const [event, handler] of Object.entries(this.handlers)) manager.on(event, handler);
    }

    state(id) {
        if (!this.states.has(id)) {
            this.states.set(id, {
                active: new Set(), cooldowns: new Map(), connected: false, disconnected: false, dead: false,
                nearbyPending: new Map(), nearbyLast: null, nearbyTimer: null
            });
        }
        return this.states.get(id);
    }

    reset(id) {
        const state = this.state(id);
        state.active.clear();
        state.nearbyPending.clear();
        state.dead = false;
    }

    clearNearbyTimer(state) {
        if (state.nearbyTimer === null) return;
        this.cancel(state.nearbyTimer);
        state.nearbyTimer = null;
    }

    deleteBot(id) {
        const state = this.states.get(id);
        if (state) this.clearNearbyTimer(state);
        this.states.delete(id);
    }

    notify(id, body) {
        const bot = this.manager.getSnapshot().find(item => item.id === id);
        void this.push.broadcast({ title: `MineClank: ${String(bot?.username || id).slice(0, 80)}`, body: String(body).slice(0, 300) }).catch(() => {});
    }

    crossing(id, key, active, body) {
        const state = this.state(id);
        if (!active) {
            state.active.delete(key);
            return;
        }
        if (state.active.has(key)) return;
        state.active.add(key);
        const previous = state.cooldowns.get(key);
        if (previous !== undefined && this.now() - previous < 60000) return;
        state.cooldowns.set(key, this.now());
        this.notify(id, body);
    }

    onState(bot) {
        const state = this.state(bot.id);
        if (bot.status !== 'online') {
            state.connected = false;
            return;
        }
        if (!state.connected) {
            state.connected = true;
            state.disconnected = false;
            this.reset(bot.id);
        }
        const settings = this.settings.get(bot.id);
        const stats = bot.playerStats || {};
        if (stats.isAlive === true) state.dead = false;
        for (const [key, value, enabled, threshold, label] of [
            ['health', stats.health, settings.lowHealth, settings.healthThreshold, 'Health'],
            ['hunger', stats.food, settings.lowHunger, settings.hungerThreshold, 'Hunger'],
            ['air', stats.oxygenLevel, settings.lowAir, settings.airThreshold, 'Air']
        ]) {
            if (!Number.isFinite(value)) continue;
            this.crossing(bot.id, key, enabled && value <= threshold && !(key === 'health' && (value <= 0 || state.dead || stats.isAlive === false)), `${label} low: ${value}/20`);
        }
        this.trackNearby(bot, state, settings);
    }

    trackNearby(bot, state, settings) {
        const nearby = new Set();
        for (const player of bot.onlinePlayers || []) {
            if (!this.isNearby(player, settings)) continue;
            const key = `player:${player.username.toLowerCase()}`;
            nearby.add(key);
            if (!state.active.has(key) || state.nearbyPending.has(key)) {
                state.active.add(key);
                state.nearbyPending.set(key, { username: player.username, distance: player.distance });
            }
        }
        for (const key of state.active) {
            if (key.startsWith('player:') && !nearby.has(key)) {
                state.active.delete(key);
                state.nearbyPending.delete(key);
            }
        }
        this.flushNearby(bot.id);
    }

    isNearby(player, settings) {
        return settings.nearbyPlayer && !player.isSelf && Boolean(player.username)
            && Number.isFinite(player.distance) && player.distance <= settings.nearbyDistance;
    }

    flushNearby(id) {
        const state = this.state(id);
        if (!state.nearbyPending.size) return;
        const elapsed = state.nearbyLast === null ? Infinity : this.now() - state.nearbyLast;
        if (elapsed < 60000) {
            // Rate-limited: keep accumulating players and flush once the minute window ends.
            if (state.nearbyTimer === null) {
                state.nearbyTimer = this.schedule(() => {
                    state.nearbyTimer = null;
                    this.flushNearby(id);
                }, 60000 - elapsed);
            }
            return;
        }
        this.clearNearbyTimer(state);
        const players = [...state.nearbyPending.values()];
        state.nearbyPending.clear();
        state.nearbyLast = this.now();
        const body = players.length === 1
            ? `${players[0].username} nearby (${players[0].distance} blocks)`
            : `${players.length} players nearby: ${players.map(player => `${player.username} (${player.distance} blocks)`).join(', ')}`;
        this.notify(id, body);
    }

    onMessage({ id, entry }) {
        if (entry.direction === 'incoming' && this.settings.get(id).directMessage) this.notify(id, `${entry.player}: ${entry.text}`);
    }

    onDisconnected({ id, kicked, reason }) {
        const state = this.state(id);
        if (state.disconnected) return;
        state.disconnected = true;
        if (this.settings.get(id).disconnect) this.notify(id, `${kicked ? 'Kicked' : 'Disconnected'}${reason ? `: ${reason}` : ''}`);
    }

    onDeath(id) {
        const state = this.state(id);
        if (state.dead) return;
        state.dead = true;
        if (this.settings.get(id).death) this.notify(id, 'Bot died');
    }

    close() {
        for (const [event, handler] of Object.entries(this.handlers)) this.manager.off(event, handler);
        for (const state of this.states.values()) this.clearNearbyTimer(state);
    }
}