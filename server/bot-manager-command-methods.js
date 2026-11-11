import { validateSingleLineText } from './bot-manager-utils.js';

export const botManagerCommandMethods = {
    sendCommand(id, command) {
        const record = this.requireRecord(id);
        const text = validateSingleLineText(command, 'Message').trim();
        if (text === '/') throw new Error('Command cannot be empty');
        this.requireOnlineBot(record).chat(text);
        this.appendLog(record, `You: ${text}`);
        return { id, sent: text };
    },

    async completeCommand(id, command) {
        const record = this.requireRecord(id);
        if (typeof command !== 'string' || !command.trim().startsWith('/')) {
            throw new Error('Completion requires a slash command');
        }
        const text = validateSingleLineText(command, 'Command');
        const bot = this.requireOnlineBot(record);
        const sequence = ++record.completionSequence;
        const complete = async () => {
            if (sequence !== record.completionSequence) return [];
            if (this.requireOnlineBot(record) !== bot) throw new Error(`${record.config.username} is not online`);
            const matches = await bot.tabComplete(text.trimStart(), true, false, 3000);
            if (sequence !== record.completionSequence) return [];
            return (Array.isArray(matches) ? matches : [])
                .map(entry => typeof entry === 'string' ? entry : entry?.match)
                .filter(match => typeof match === 'string' && match.length > 0)
                .slice(0, 25);
        };
        const request = record.completionQueue.then(complete, complete);
        record.completionQueue = request.catch(() => {});
        return request;
    },

    requireOnlineBot(record) {
        const bot = record.bot;
        if (record.status !== 'online' || !bot || bot._client?.state !== 'play') {
            throw new Error(`${record.config.username} is not online`);
        }
        return bot;
    }
};