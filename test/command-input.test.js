import assert from 'node:assert/strict';
import test from 'node:test';
import { handleCommandKeyDown } from '../src/command-input.js';

function createContext(overrides = {}) {
    let context;
    context = {
        suggestions: [],
        selectedBot: { id: 'alpha' },
        command: '',
        commandHistoryRef: { current: { alpha: ['/one', '/two'] } },
        historyNavigationRef: { current: null },
        completionTimerRef: { current: 0 },
        setCommand: value => { context.command = value; },
        setSuggestions: value => { context.suggestions = value; },
        applySuggestion(value) { this.appliedSuggestion = value; },
        requestCompletions(value) { this.completionRequest = value; },
        clearCompletionTimer() {},
        ...overrides
    };
    return context;
}

function keyboardEvent(key) {
    return { key, prevented: false, preventDefault() { this.prevented = true; } };
}

test('navigates command history and restores the draft', () => {
    const context = createContext({ command: 'draft' });
    const up = keyboardEvent('ArrowUp');
    handleCommandKeyDown(up, context);
    assert.equal(context.command, '/two');
    assert.equal(up.prevented, true);

    handleCommandKeyDown(keyboardEvent('ArrowUp'), context);
    assert.equal(context.command, '/one');
    handleCommandKeyDown(keyboardEvent('ArrowDown'), context);
    assert.equal(context.command, '/two');
    handleCommandKeyDown(keyboardEvent('ArrowDown'), context);
    assert.equal(context.command, 'draft');
});

test('Tab requests completions when no suggestion is available', () => {
    const context = createContext({ command: '/he' });
    const event = keyboardEvent('Tab');
    handleCommandKeyDown(event, context);
    assert.equal(context.completionRequest, '/he');
    assert.equal(event.prevented, true);
});