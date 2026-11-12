import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createActionHandlers } from './ws-actions.js';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distDir = resolve(projectRoot, 'dist');
const indexFile = resolve(distDir, 'index.html');
const requestLimit = 8 * 1024;

function sendJson(socket, payload) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function rejectUpgrade(socket, status, message) {
    socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
}

function defaultRequireProxyAuth() {
    const setting = process.env.REQUIRE_PROXY_AUTH;
    if (setting === 'true') return true;
    if (setting === 'false') return false;
    if (setting === undefined) return process.env.NODE_ENV === 'production';
    throw new Error('REQUIRE_PROXY_AUTH must be "true" or "false".');
}

export function createControlServer({
    manager,
    savedMessages,
    requireProxyAuth = defaultRequireProxyAuth(),
    proxyUserHeader = (process.env.PROXY_USER_HEADER || 'x-auth-request-user').toLowerCase(),
    allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
        : (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']),
    staticDir = distDir,
    localItemIconsDir = resolve(projectRoot, 'public', 'item-icons')
} = {}) {
    if (!manager) throw new Error('A bot manager is required');

    const app = express();
    const server = createServer(app);
    const webSockets = new WebSocketServer({ noServer: true, maxPayload: requestLimit });
    const originSet = new Set(allowedOrigins);
    const broadcastSavedMessages = () => {
        const payload = JSON.stringify({ type: 'saved-messages:update', messages: savedMessages.list() });
        for (const client of webSockets.clients) {
            if (client.readyState === WebSocket.OPEN) client.send(payload);
        }
    };
    const actionHandlers = createActionHandlers({ manager, savedMessages, broadcastSavedMessages });

    const isAuthenticated = request => !requireProxyAuth || Boolean(request.headers[proxyUserHeader]);
    const validOrigin = (origin, request) => {
        if (typeof origin !== 'string') return false;
        if (originSet.has(origin)) return true;
        if (requireProxyAuth) return false;

        try {
            const originUrl = new URL(origin);
            const protocol = request.socket.encrypted ? 'https:' : 'http:';
            return originUrl.origin === `${protocol}//${request.headers.host}`;
        } catch {
            return false;
        }
    };

    app.get('/api/health', (_request, response) => {
        response.json({ ok: true });
    });
    app.get('/api/bots', (request, response) => {
        if (!isAuthenticated(request)) return response.sendStatus(401);
        response.json({ bots: manager.getSnapshot() });
    });

    app.use('/item-icons', express.static(localItemIconsDir));
    app.use(express.static(staticDir));
    app.get(/.*/, (_request, response) => {
        if (existsSync(indexFile)) return response.sendFile(indexFile);
        response.sendStatus(404);
    });

    server.on('upgrade', (request, socket, head) => {
        const path = new URL(request.url || '/', 'http://localhost').pathname;
        if (path !== '/ws') return rejectUpgrade(socket, 404, 'Not Found');
        if (!isAuthenticated(request)) return rejectUpgrade(socket, 401, 'Unauthorized');
        if (!validOrigin(request.headers.origin, request)) return rejectUpgrade(socket, 403, 'Forbidden');

        webSockets.handleUpgrade(request, socket, head, client => {
            webSockets.emit('connection', client, request);
        });
    });

    webSockets.on('connection', socket => {
        sendJson(socket, { type: 'snapshot', bots: manager.getSnapshot() });
        if (savedMessages) {
            sendJson(socket, { type: 'saved-messages:snapshot', messages: savedMessages.list() });
        }

        socket.on('message', async (data, isBinary) => {
            let requestId;
            try {
                if (isBinary || data.length > requestLimit) throw new Error('Invalid or oversized request');
                const request = JSON.parse(data.toString());
                requestId = typeof request.requestId === 'string' ? request.requestId.slice(0, 80) : undefined;
                if (!request || typeof request !== 'object' || Array.isArray(request)) {
                    throw new Error('Request must be a JSON object');
                }

                const handler = actionHandlers.get(request.type);
                if (!handler) throw new Error('Unsupported action');
                const result = await handler(request);
                if (request.type === 'bot:complete') {
                    sendJson(socket, { ...result, requestId });
                    return;
                }
                sendJson(socket, { type: 'action:result', requestId, ok: true, result });
            } catch (error) {
                sendJson(socket, { type: 'action:result', requestId, ok: false, error: error.message });
            }
        });
    });

    manager.on('bot-state', bot => {
        const payload = JSON.stringify({ type: 'bot:state', bot });
        for (const client of webSockets.clients) {
            if (client.readyState === WebSocket.OPEN) client.send(payload);
        }
    });
    manager.on('snapshot', bots => {
        const payload = JSON.stringify({ type: 'snapshot', bots });
        for (const client of webSockets.clients) {
            if (client.readyState === WebSocket.OPEN) client.send(payload);
        }
    });
    manager.on('bot-log', event => {
        const payload = JSON.stringify({ type: 'bot:log', ...event });
        for (const client of webSockets.clients) {
            if (client.readyState === WebSocket.OPEN) client.send(payload);
        }
    });
    manager.on('bot-direct-message', event => {
        const payload = JSON.stringify({ type: 'bot:direct-message', ...event });
        for (const client of webSockets.clients) {
            if (client.readyState === WebSocket.OPEN) client.send(payload);
        }
    });
    manager.on('bot-authentication', event => {
        const authentication = {
            status: event.authentication?.status,
            ...(typeof event.authentication?.userCode === 'string'
                ? { userCode: event.authentication.userCode }
                : {}),
            ...(typeof event.authentication?.verificationUri === 'string'
                ? { verificationUri: event.authentication.verificationUri }
                : {}),
            ...(Number.isFinite(event.authentication?.expiresAt)
                ? { expiresAt: event.authentication.expiresAt }
                : {}),
            ...(typeof event.authentication?.error === 'string'
                ? { error: event.authentication.error }
                : {})
        };
        const payload = JSON.stringify({
            type: 'bot:authentication',
            id: event.id,
            authentication
        });
        for (const client of webSockets.clients) {
            if (client.readyState === WebSocket.OPEN) client.send(payload);
        }
    });

    return {
        app,
        server,
        webSockets,
        listen(port = Number(process.env.PORT) || 3001, host = process.env.HOST || '127.0.0.1') {
            return new Promise((resolveListen, rejectListen) => {
                server.once('error', rejectListen);
                server.listen(port, host, () => {
                    server.off('error', rejectListen);
                    resolveListen(server.address());
                });
            });
        },
        close() {
            for (const client of webSockets.clients) client.close(1001, 'Server shutting down');
            webSockets.close();
            return new Promise((resolveClose, rejectClose) => {
                if (!server.listening) return resolveClose();
                server.close(error => error ? rejectClose(error) : resolveClose());
            });
        }
    };
}