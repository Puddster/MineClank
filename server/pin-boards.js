import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

const statusKeys = new Set(['health', 'hunger', 'air', 'experience', 'game-mode', 'player', 'session-time']);
const inventorySlots = new Set([5, 6, 7, 8, ...Array.from({ length: 36 }, (_, index) => index + 9), 45]);

export function validatePin(pin) {
    if (!pin || typeof pin !== 'object' || Array.isArray(pin)) throw new Error('Invalid pin');
    const { type, ref } = pin;
    if (typeof ref !== 'string' || !ref || ref.length > 80) throw new Error('Invalid pin reference');
    if (type === 'status' && statusKeys.has(ref)) return { type, ref };
    if (type === 'inventory' && inventorySlots.has(Number(ref)) && String(Number(ref)) === ref) return { type, ref };
    if (type === 'message') return { type, ref };
    throw new Error('Invalid pin reference');
}

function validateBotId(id) {
    if (typeof id !== 'string' || !id || id.length > 80) throw new Error('Invalid bot id');
    return id;
}

export class PinBoards {
    constructor(databasePath) {
        if (typeof databasePath !== 'string' || !databasePath) throw new Error('A pin board database path is required');
        mkdirSync(dirname(databasePath), { recursive: true });
        this.database = new Database(databasePath);
        this.database.pragma('journal_mode = WAL');
        this.database.exec(`
            CREATE TABLE IF NOT EXISTS pin_board_items (
                bot_id TEXT NOT NULL,
                type TEXT NOT NULL,
                ref TEXT NOT NULL,
                position INTEGER NOT NULL,
                PRIMARY KEY (bot_id, type, ref)
            )
        `);
        this.select = this.database.prepare('SELECT type, ref FROM pin_board_items WHERE bot_id = ? ORDER BY position');
        this.selectAll = this.database.prepare('SELECT bot_id AS botId, type, ref FROM pin_board_items ORDER BY bot_id, position');
        this.nextPosition = this.database.prepare('SELECT COALESCE(MAX(position) + 1, 0) AS position FROM pin_board_items WHERE bot_id = ?');
        this.insert = this.database.prepare('INSERT OR IGNORE INTO pin_board_items (bot_id, type, ref, position) VALUES (?, ?, ?, ?)');
        this.remove = this.database.prepare('DELETE FROM pin_board_items WHERE bot_id = ? AND type = ? AND ref = ?');
        this.updatePosition = this.database.prepare('UPDATE pin_board_items SET position = ? WHERE bot_id = ? AND type = ? AND ref = ?');
        this.setTransaction = this.database.transaction((id, pin, enabled) => {
            if (enabled) this.insert.run(id, pin.type, pin.ref, this.nextPosition.get(id).position);
            else this.remove.run(id, pin.type, pin.ref);
            this.saveOrder(id, this.list(id));
            return this.list(id);
        });
        this.moveTransaction = this.database.transaction((id, source, target, after) => {
            const pins = this.list(id);
            const sourceIndex = pins.findIndex(pin => pin.type === source.type && pin.ref === source.ref);
            const targetIndex = pins.findIndex(pin => pin.type === target.type && pin.ref === target.ref);
            if (sourceIndex < 0 || targetIndex < 0) throw new Error('Pin board changed; try again');
            if (sourceIndex === targetIndex) return pins;
            const [item] = pins.splice(sourceIndex, 1);
            const index = pins.findIndex(pin => pin.type === target.type && pin.ref === target.ref);
            pins.splice(index + (after ? 1 : 0), 0, item);
            this.saveOrder(id, pins);
            return pins;
        });
    }

    list(id) {
        return this.select.all(validateBotId(id));
    }

    listAll() {
        const boards = new Map();
        for (const { botId, type, ref } of this.selectAll.all()) {
            if (!boards.has(botId)) boards.set(botId, []);
            boards.get(botId).push({ type, ref });
        }
        return Object.fromEntries(boards);
    }

    saveOrder(id, pins) {
        pins.forEach((pin, index) => this.updatePosition.run(index, id, pin.type, pin.ref));
    }

    set(id, pin, enabled) {
        if (typeof enabled !== 'boolean') throw new Error('Pin state must be a boolean');
        return this.setTransaction(validateBotId(id), validatePin(pin), enabled);
    }

    move(id, source, target, after) {
        if (typeof after !== 'boolean') throw new Error('Invalid pin position');
        return this.moveTransaction(validateBotId(id), validatePin(source), validatePin(target), after);
    }

    deleteBot(id) {
        this.database.prepare('DELETE FROM pin_board_items WHERE bot_id = ?').run(validateBotId(id));
    }

    deleteMessage(id) {
        const affected = this.database.prepare('SELECT DISTINCT bot_id AS botId FROM pin_board_items WHERE type = ? AND ref = ?').all('message', id);
        this.database.prepare('DELETE FROM pin_board_items WHERE type = ? AND ref = ?').run('message', id);
        return affected.map(row => row.botId);
    }

    close() {
        this.database.close();
    }
}