import { redact } from './bot-manager-utils.js';

export function parseIncomingDirectMessage(text) {
    const match = /^(?:\[[^\]\r\n]+\]\s+)*\[([A-Za-z0-9_]{1,16})\s*->\s*me\]\s+(.+)$/i.exec(text);
    return match ? { player: match[1], text: match[2], direction: 'incoming' } : null;
}

export function parseOutgoingDirectMessage(text) {
    const match = /^\/(?:msg|w)\s+([A-Za-z0-9_]{1,16})\s+(\S.*)$/i.exec(text);
    return match ? { player: match[1], text: match[2], direction: 'outgoing' } : null;
}

export const botManagerEventMethods = {
    appendDirectMessage(record, message) {
        if (!message) return;
        const entry = { ...message, text: redact(message.text), at: new Date().toISOString() };
        record.directMessages.push(entry);
        this.emit('bot-direct-message', { id: record.id, entry });
    },

    appendLog(record, text, colorRuns, playerLinks) {
        const entry = { at: new Date().toISOString(), text: redact(text) };
        if (colorRuns) entry.colorRuns = colorRuns;
        if (playerLinks?.length) entry.playerLinks = playerLinks;
        record.logs.push(entry);
        if (record.logs.length > this.maxLogs) record.logs.splice(0, record.logs.length - this.maxLogs);
        this.emit('bot-log', { id: record.id, entry });
    },

    emitState(record) {
        this.emit('bot-state', this.publicState(record));
    }
};