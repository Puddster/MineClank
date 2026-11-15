export class NotificationMonitor {
    constructor(manager, settings, push, { now = Date.now } = {}) {
        this.manager = manager;
        this.settings = settings;
        this.push = push;
        this.now = now;
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
        if (!this.states.has(id)) this.states.set(id, { active: new Set(), cooldowns: new Map(), connected: false, disconnected: false, dead: false });
        return this.states.get(id);
    }

    reset(id) {
        const state = this.state(id);
        state.active.clear();
        state.dead = false;
    }

    deleteBot(id) {
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
        const nearby = new Set();
        for (const player of bot.onlinePlayers || []) {
            if (player.isSelf || !player.username || !Number.isFinite(player.distance)) continue;
            const key = `player:${player.username.toLowerCase()}`;
            if (settings.nearbyPlayer && player.distance <= settings.nearbyDistance) nearby.add(key);
            this.crossing(bot.id, key, nearby.has(key), `${player.username} nearby (${player.distance} blocks)`);
        }
        for (const key of state.active) {
            if (key.startsWith('player:') && !nearby.has(key)) state.active.delete(key);
        }
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
    }
}