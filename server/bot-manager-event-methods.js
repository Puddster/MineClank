import { redact } from './bot-manager-utils.js';

export const botManagerEventMethods = {
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