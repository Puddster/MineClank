# MineClank

A local web console for managing Mineflayer bots. The Node service owns Minecraft connections and streams bot state and server messages to the React dashboard over WebSockets.

## Requirements

- Node.js 20.19 or newer
- One Microsoft-authenticated Minecraft account per bot profile
- Access to a Minecraft server you are authorized to use

## Configure bots

Each bot is configured by one JSON file in `configs/bots/`. The filename, without `.json`, is the bot ID and may contain letters, numbers, underscores, and hyphens.

1. Copy the example profile and open it for editing:
  ```powershell
  Copy-Item configs/bots.example.json configs/bots/8JUO.json
  notepad configs/bots/8JUO.json
  ```
2. Set `username` to the Minecraft name for the account, `host` to the server address, and `port` if it is not `25565`. Keep `auth` as `microsoft` for Microsoft-authenticated accounts. `version` is optional and should only be set when you need to pin a protocol version. `physicsEnabled` defaults to `true`; set it to `false` to disable Mineflayer's physics simulation for an idle bot.

3. Optionally add an `onJoin` array of slash commands. The manager waits six seconds after each spawn, then sends each command in array order with `bot.chat()`. It repeats this on reconnect. Each entry must be a single-line slash command; up to 20 commands of at most 256 characters are accepted.

Example:

```json
{
  "username": "YourMinecraftUsername",
  "host": "play.example.com",
  "port": 25565,
  "auth": "microsoft",
  "physicsEnabled": true,
  "onJoin": [
    "/survival"
  ]
}
```

The supported keys are `username`, `host`, `port`, `auth`, `version`, `physicsEnabled`, and `onJoin`. The loader rejects unknown keys and invalid values. Config files are loaded in alphabetical filename order; startup connects bots sequentially, waiting for each bot to spawn or time out before proceeding.

Local files in `configs/bots/*.json` are intentionally git-ignored, so bot names and server settings are not included in commits. The example profile remains tracked.

### Authentication cache

Microsoft auth profiles are stored separately per bot under `.auth/<id>/`. Mineflayer creates the directory on first login. To reuse an existing cache, copy the **contents** of that account's Mineflayer cache folder into the matching `.auth/<id>/` directory, preserving the hashed cache filenames. Keep `.auth/` private and never commit or share its files; they contain authentication tokens. Use `auth: "offline"` only for servers that permit offline accounts.

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
