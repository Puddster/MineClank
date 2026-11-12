import { redact } from './bot-manager-utils.js';
import { parseOutgoingDirectMessage } from './bot-manager-event-methods.js';

export const botManagerRetryMethods = {
    handleAttemptFailure(record, bot, error) {
        if (record.bot === bot) record.bot = null;
        record.connectedAt = null;
        record.lastError = redact(error?.message || error);
        if (record.authentication.status === 'required') {
            record.authentication = {
                status: 'failed',
                error: 'Microsoft sign-in failed; check the bot log for details'
            };
            this.emitAuthenticationState(record);
        }
        const failureText = String(error?.message || error);
        if (/logging in too fast|too many login attempts|rate.?limit/i.test(failureText)) {
            record.retryClass = 'login-throttled';
        } else if (/sessionserver\.mojang\.com.*session\/minecraft\/join|session\/minecraft\/join|premature close/i.test(failureText)) {
            record.retryClass = 'session-service';
        } else {
            record.retryClass = null;
        }
        this.appendLog(record, `Connection failed: ${record.lastError}`);
        if (record.desired && !this.shuttingDown) {
            record.status = 'reconnecting';
            this.scheduleReconnect(record);
        } else {
            record.status = 'stopped';
        }
        this.emitState(record);
        try { bot?.quit('Connection attempt failed'); } catch {}
    },

    handleMsaCode(record, bot, data) {
        if (record.bot !== bot || !record.desired) return;
        let verificationUri;
        try {
            verificationUri = new URL(data?.verification_uri);
        } catch {
            record.authentication = { status: 'failed', error: 'Microsoft returned an invalid sign-in URL' };
            this.emitAuthenticationState(record);
            return;
        }
        const microsoftHost = verificationUri.hostname === 'microsoft.com' ||
            verificationUri.hostname.endsWith('.microsoft.com');
        if (verificationUri.protocol !== 'https:' || !microsoftHost ||
            typeof data?.user_code !== 'string' || !data.user_code.trim() ||
            data.user_code.length > 64 || !Number.isFinite(data?.expires_in) || data.expires_in <= 0) {
            record.authentication = { status: 'failed', error: 'Microsoft returned invalid device sign-in details' };
            this.emitAuthenticationState(record);
            return;
        }
        record.authentication = {
            status: 'required',
            userCode: data.user_code,
            verificationUri: verificationUri.href,
            expiresAt: Date.now() + data.expires_in * 1000
        };
        this.emitAuthenticationState(record);
    },

    emitAuthenticationState(record) {
        this.emit('bot-authentication', { id: record.id, authentication: { ...record.authentication } });
    },

    async runOnJoin(record, bot) {
        for (const command of record.config.onJoin) {
            await new Promise(resolveDelay => setTimeout(resolveDelay, this.joinCommandDelayMs));
            if (!record.desired || this.shuttingDown || record.bot !== bot || record.status !== 'online') return;
            try {
                bot.chat(command);
                this.appendLog(record, `You: ${command}`);
                this.appendDirectMessage(record, parseOutgoingDirectMessage(command));
            } catch (error) {
                this.appendLog(record, `Join command failed: ${error.message}`);
            }
        }
    },

    scheduleReconnect(record) {
        if (!record.desired || this.shuttingDown || record.reconnectTimer) return;
        const exponent = Math.min(Math.max(record.attempts - 1, 0), 5);
        const isLoginFailure = record.retryClass !== null;
        const baseDelay = isLoginFailure ? this.loginRetryBaseMs : this.reconnectBaseMs;
        const maxDelay = isLoginFailure ? this.loginRetryMaxMs : this.reconnectMaxMs;
        const delay = Math.min(maxDelay, baseDelay * 2 ** exponent);
        const reason = record.retryClass === 'login-throttled'
            ? ' (login rate-limit cooldown)'
            : record.retryClass === 'session-service'
                ? ' (session service cooldown)'
                : '';
        this.appendLog(record, `Retrying in ${Math.round(delay / 1000)}s${reason}`);
        record.reconnectTimer = setTimeout(() => {
            record.reconnectTimer = null;
            if (record.desired && !this.shuttingDown) this.queueConnection(record).catch(() => {});
        }, delay);
    }
};