import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

const maxTitleLength = 80;
const maxCategoryLength = 40;
const maxMessageLength = 256;
const placeholderPattern = /\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g;

export function savedMessageVariables(message) {
    const variables = new Set();
    for (const match of message.matchAll(placeholderPattern)) variables.add(match[1]);
    return [...variables];
}

function validateSavedMessage(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Saved message must be an object');
    }

    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const category = typeof input.category === 'string' ? input.category.trim() : '';
    const message = typeof input.message === 'string' ? input.message.trim() : '';
    if (!title) throw new Error('Title cannot be empty');
    assertLength(title, maxTitleLength, 'Title');
    assertLength(category, maxCategoryLength, 'Category');
    if (!message) throw new Error('Message cannot be empty');
    assertLength(message, maxMessageLength, 'Message');
    if (/[\r\n]/.test(message)) throw new Error('Saved messages must be a single line');
    if (/\{\{|\}\}/.test(message.replace(placeholderPattern, ''))) {
        throw new Error('Placeholders must use {{name}} with a letter followed by letters, numbers, or underscores');
    }

    return { title, category, message };
}

function assertLength(value, limit, label) {
    if (value.length > limit) throw new Error(`${label} cannot exceed ${limit} characters`);
}

function validateId(id) {
    if (typeof id !== 'string' || !id || id.length > 80) throw new Error('Invalid saved message id');
    return id;
}

export class SavedMessages {
    constructor(databasePath) {
        if (typeof databasePath !== 'string' || !databasePath) {
            throw new Error('A saved messages database path is required');
        }
        mkdirSync(dirname(databasePath), { recursive: true });
        this.database = new Database(databasePath);
        this.database.pragma('journal_mode = WAL');
        this.database.exec(`
            CREATE TABLE IF NOT EXISTS saved_messages (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT '',
                message TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        `);
        this.listStatement = this.database.prepare(`
            SELECT id, title, category, message, created_at AS createdAt, updated_at AS updatedAt
            FROM saved_messages
            ORDER BY category COLLATE NOCASE, title COLLATE NOCASE, id
        `);
        this.getStatement = this.database.prepare(`
            SELECT id, title, category, message, created_at AS createdAt, updated_at AS updatedAt
            FROM saved_messages WHERE id = ?
        `);
        this.insertStatement = this.database.prepare(`
            INSERT INTO saved_messages (id, title, category, message, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        this.updateStatement = this.database.prepare(`
            UPDATE saved_messages
            SET title = ?, category = ?, message = ?, updated_at = ?
            WHERE id = ?
        `);
        this.deleteStatement = this.database.prepare('DELETE FROM saved_messages WHERE id = ?');
    }

    list() {
        return this.listStatement.all();
    }

    create(input) {
        const values = validateSavedMessage(input);
        const id = randomUUID();
        const now = new Date().toISOString();
        this.insertStatement.run(id, values.title, values.category, values.message, now, now);
        return this.getStatement.get(id);
    }

    update(id, input) {
        const validId = validateId(id);
        const values = validateSavedMessage(input);
        const result = this.updateStatement.run(
            values.title,
            values.category,
            values.message,
            new Date().toISOString(),
            validId
        );
        if (!result.changes) throw new Error('Saved message was not found');
        return this.getStatement.get(validId);
    }

    delete(id) {
        const result = this.deleteStatement.run(validateId(id));
        if (!result.changes) throw new Error('Saved message was not found');
        return { id };
    }

    close() {
        this.database.close();
    }
}
