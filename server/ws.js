import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';

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

export function createControlServer({
    manager,
    requireProxyAuth = process.env.NODE_ENV === 'production',
    proxyUserHeader = (process.env.PROXY_USER_HEADER || 'x-auth-request-user').toLowerCase(),
    allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
        : (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']),
    staticDir = distDir
} = {}) {
    if (!manager) throw new Error('A bot manager is required');

    const app = express();
    const server = createServer(app);
    const webSockets = new WebSocketServer({ noServer: true, maxPayload: requestLimit });
    const originSet = new Set(allowedOrigins);

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

        socket.on('message', async (data, isBinary) => {
            let requestId;
            try {
                if (isBinary || data.length > requestLimit) throw new Error('Invalid or oversized request');
                const request = JSON.parse(data.toString());
                requestId = typeof request.requestId === 'string' ? request.requestId.slice(0, 80) : undefined;
                if (!request || typeof request !== 'object' || Array.isArray(request)) {
                    throw new Error('Request must be a JSON object');
                }

                let result;
                if (request.type === 'bot:start') {
                    result = await manager.start(request.id);
                } else if (request.type === 'bot:stop') {
                    result = await manager.stop(request.id);
                } else if (request.type === 'bot:command') {
                    result = manager.sendCommand(request.id, request.command);
                } else if (request.type === 'bot:complete') {
                    const suggestions = await manager.completeCommand(request.id, request.command);
                    sendJson(socket, { type: 'bot:completion', requestId, suggestions });
                    return;
                } else if (request.type === 'bot:inventory-move') {
                    result = await manager.moveInventoryItem(request.id, request.sourceSlot, request.destinationSlot);
                } else if (request.type === 'bot:inventory-drop-one') {
                    result = await manager.dropInventoryItem(request.id, request.slot);
                } else if (request.type === 'bot:inventory-drop-stack') {
                    result = await manager.dropInventoryStack(request.id, request.slot);
                } else {
                    throw new Error('Unsupported action');
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
    manager.on('bot-log', event => {
        const payload = JSON.stringify({ type: 'bot:log', ...event });
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