import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SavedMessages, savedMessageVariables } from '../server/saved-messages.js';

test('stores, updates, and persists saved messages in SQLite', async t => {
    const directory = await mkdtemp(join(os.tmpdir(), 'mineclank-saved-messages-'));
    const databasePath = join(directory, 'saved.sqlite');
    let store = new SavedMessages(databasePath);
    t.after(async () => {
        store?.close();
        await rm(directory, { recursive: true, force: true });
    });

    const created = store.create({
        title: 'Chest shop setup',
        category: 'Guides',
        message: 'To sell {{item}}, create a chest shop.'
    });
    assert.equal(created.title, 'Chest shop setup');
    assert.deepEqual(savedMessageVariables(created.message), ['item']);
    assert.deepEqual(store.list(), [created]);

    const updated = store.update(created.id, {
        title: 'Chest shop help',
        category: 'Guides',
        message: 'Create a chest shop for {{item}} at {{price}}.'
    });
    assert.equal(updated.title, 'Chest shop help');
    assert.deepEqual(savedMessageVariables(updated.message), ['item', 'price']);

    store.close();
    store = new SavedMessages(databasePath);
    assert.deepEqual(store.list(), [updated]);
    assert.deepEqual(store.delete(created.id), { id: created.id });
    assert.deepEqual(store.list(), []);
});

test('rejects invalid saved messages and unknown records', async t => {
    const directory = await mkdtemp(join(os.tmpdir(), 'mineclank-saved-messages-'));
    const store = new SavedMessages(join(directory, 'saved.sqlite'));
    t.after(async () => {
        store.close();
        await rm(directory, { recursive: true, force: true });
    });

    assert.throws(() => store.create({ title: '', category: '', message: 'hello' }), /Title cannot be empty/);
    assert.throws(() => store.create({ title: 'Multiline', category: '', message: 'hello\nthere' }), /single line/);
    assert.throws(() => store.create({ title: 'Invalid variable', category: '', message: 'Hi {{bad-name}}' }), /Placeholders/);
    assert.throws(() => store.create({ title: 'Too long', category: '', message: 'x'.repeat(257) }), /256 characters/);
    assert.throws(() => store.update('missing', { title: 'Title', category: '', message: 'text' }), /not found/);
    assert.throws(() => store.delete('missing'), /not found/);
});
