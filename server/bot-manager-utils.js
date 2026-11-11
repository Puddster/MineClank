const tokenPattern = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

export const redact = value => String(value).replace(tokenPattern, '[REDACTED TOKEN]');

const maxChatLength = 256;

export function validateSingleLineText(value, label) {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} cannot be empty`);
	if (value.length > maxChatLength) throw new Error(`${label} cannot exceed ${maxChatLength} characters`);
	if (/[\r\n]/.test(value)) throw new Error(`${label} must be a single line`);
	return value;
}