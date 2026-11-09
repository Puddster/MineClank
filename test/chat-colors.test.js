import assert from 'node:assert/strict';
import test from 'node:test';
import { ansiToColorRuns } from '../server/chat-colors.js';

test('converts true-color ANSI messages to safe styled text runs', () => {
    assert.deepEqual(ansiToColorRuns('\u001b[38;2;255;128;0mGold\u001b[0m plain'), [
        { text: 'Gold', color: '#ff8000', bold: false, italic: false, underline: false },
        { text: ' plain', color: null, bold: false, italic: false, underline: false }
    ]);
});

test('supports standard and indexed colors while ignoring background colors', () => {
    assert.deepEqual(ansiToColorRuns('\u001b[31;48;2;0;0;0mRed\u001b[0m'), [
        { text: 'Red', color: '#aa0000', bold: false, italic: false, underline: false }
    ]);
    assert.deepEqual(ansiToColorRuns('\u001b[38;5;202mOrange\u001b[0m'), [
        { text: 'Orange', color: '#ff5f00', bold: false, italic: false, underline: false }
    ]);
});