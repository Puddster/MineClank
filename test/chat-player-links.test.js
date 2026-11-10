import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPlayerLinks } from '../server/chat-player-links.js';

test('maps a displayed nickname to the Mineflayer player username', () => {
    const players = {
        Jessica_42: {
            username: 'Jessica_42',
            displayName: { toString: () => 'Jess' }
        }
    };

    assert.deepEqual(extractPlayerLinks('[VIP] Jess: hello', players), [
        { start: 6, end: 10, username: 'Jessica_42' }
    ]);
});

test('leaves ambiguous, partial, and absent display names unmatched', () => {
    const players = {
        Alex1: { username: 'Alex1', displayName: { toString: () => 'Alex' } },
        Alex2: { username: 'Alex2', displayName: { toString: () => 'Alex' } },
        Jessica: { username: 'Jessica', displayName: { toString: () => 'Jessica' } }
    };

    assert.deepEqual(extractPlayerLinks('Alex and Jessica', players), [
        { start: 9, end: 16, username: 'Jessica' }
    ]);
});

test('requires name boundaries and prefers the longest matching display name', () => {
    const players = {
        Jess: { username: 'Jess', displayName: { toString: () => 'Jess' } },
        Jessica: { username: 'Jessica', displayName: { toString: () => 'Jess A' } }
    };

    assert.deepEqual(extractPlayerLinks('Jessica says hi; Jess A says bye', players), [
        { start: 17, end: 23, username: 'Jessica' }
    ]);
});
