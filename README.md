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

Build the client and start the server with `NODE_ENV=production`. Set `HOST`, `PORT`, `ALLOWED_ORIGINS`, and `PROXY_USER_HEADER` in the process environment or a local `.env` file. In production, the server requires the configured proxy identity header on the bot API and WebSocket upgrade by default. Set `REQUIRE_PROXY_AUTH=false` only when access is restricted to a trusted private network; the server will still validate browser origins. Otherwise, the reverse proxy must authenticate users, strip any client-supplied identity header, and inject its own trusted value.

Keep the backend unreachable directly from the LAN or internet. Bind to `127.0.0.1` when the proxy is on the same host; for a container network, bind to the container interface and expose the service only on a private network shared with the proxy. Set `ALLOWED_ORIGINS` to the exact browser origin, including scheme and port where applicable.

```powershell
npm run build
$env:NODE_ENV = 'production'
npm start
```

## Container deployment

GitHub Actions runs tests, lint, and the frontend build on pull requests to `main`. It builds the Docker image for those checks and publishes it to `ghcr.io/puddster/mineclank` on pushes to `main` and version tags matching `v*`.

By default, the example Compose file expects a reverse proxy that authenticates users, strips any client-supplied identity header, and injects the trusted `x-auth-request-user` header. For a trusted LAN-only deployment without proxy authentication, set `REQUIRE_PROXY_AUTH=false` in `.env` and keep the service restricted to that private network. Set the exact dashboard origin in `ALLOWED_ORIGINS`:

```sh
docker network create proxy
mkdir -p configs/bots
printf 'ALLOWED_ORIGINS=https://bots.example.net\n' > .env
docker compose -f docker-compose.example.yml pull
docker compose -f docker-compose.example.yml up -d
```

Change the origin to match the proxy URL. The Compose service is not published on a host port; attach the proxy to the same external Docker network and proxy traffic to `mineclank:3001`. Bot JSON profiles are mounted read-only from `configs/bots/`, and the named `mineclank-auth` volume persists Microsoft login tokens. Keep that volume private. If the GHCR package is private, authenticate Docker to `ghcr.io` on the deployment host before pulling.

## Dashboard controls

The dashboard shows bot connection state, current position, health, hunger and saturation, air, experience, game mode, alive/sleeping status, and current connection session time. Session time is how long this bot has been connected; total server playtime is not generally available unless the server exposes it. When a chat name matches a unique player-list display name, click it to fill the command field with `/msg <username>`; hover over it to see the Minecraft username. Unmatched or ambiguous names remain plain text. Use the per-bot stop control to disconnect a bot, Start bot to reconnect it, the `/survival` and `/hub1` shortcuts for common hops, or the command field for chat and slash commands. Command allowlists are not enforced in this initial version; only grant dashboard access to trusted users.

## Checks

```powershell
npm test
npm run lint
npm run build
```

Tests use mocked Mineflayer clients and do not connect to a live Minecraft server.
