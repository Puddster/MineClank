# MineClank

A local web console for managing Mineflayer bots. The Node service owns Minecraft connections and streams bot state and server messages to the React dashboard over WebSockets.

## Requirements

- Node.js 20.19 or newer
- One Microsoft-authenticated Minecraft account per bot profile
- Access to a Minecraft server you are authorized to use

## Configure bots

Copy `configs/bots.example.json` to `configs/bots/<id>.json` for each bot, then set its username, host, port, and auth mode. The ID is the filename without `.json`; use letters, numbers, underscores, and hyphens. Optional `version` can pin a Mineflayer protocol version.
Copy `configs/bots.example.json` to `configs/bots/<id>.json` for each bot, then set its username, host, port, and auth mode. The ID is the filename without `.json`; use letters, numbers, underscores, and hyphens. Optional `version` can pin a Mineflayer protocol version. `onJoin` is an optional ordered array of slash commands; the manager waits two seconds after each spawn and then sends each command with `bot.chat()`.

Bot files load in alphabetical order. The manager starts them sequentially, waiting for each bot to spawn before attempting the next. If a connection fails or times out, it schedules a retry and continues the initial queue. No bot profiles are checked in by default.

Microsoft auth profiles are created independently under `.auth/<id>` on first connection. Keep `.auth` private and do not copy auth-cache files from another Mineflayer installation. Use `auth: "offline"` only for servers that permit offline accounts.

## Run locally

```powershell
npm install
npm run dev
```

Open the Vite URL printed in the terminal. The development server proxies API and WebSocket traffic to the Node service. The bot list is empty until a JSON file is added under `configs/bots/`.

## Production and reverse proxy

Build the client and start the server with `NODE_ENV=production`. Set `HOST`, `PORT`, `ALLOWED_ORIGINS`, and `PROXY_USER_HEADER` in the process environment or a local `.env` file. In production, the server requires the configured proxy identity header on the bot API and WebSocket upgrade. The reverse proxy must authenticate users, strip any client-supplied identity header, and inject its own trusted value.

Keep the backend unreachable directly from the LAN or internet. Bind to `127.0.0.1` when the proxy is on the same host; for a container network, bind to the container interface and expose the service only on a private network shared with the proxy. Set `ALLOWED_ORIGINS` to the exact browser origin, including scheme and port where applicable.

```powershell
npm run build
$env:NODE_ENV = 'production'
npm start
```

## Dashboard controls

The dashboard shows bot connection state, current position, and recent chat/server messages. Use the per-bot stop control to disconnect a bot, Start bot to reconnect it, the `/survival` and `/hub1` shortcuts for common hops, or the command field for another single-line slash command. Command allowlists are not enforced in this initial version; only grant dashboard access to trusted users.

## Checks

```powershell
npm test
npm run lint
npm run build
```

Tests use mocked Mineflayer clients and do not connect to a live Minecraft server.
