# MineClank

A local web console for managing Mineflayer bots. The Node service owns Minecraft connections and streams bot state and server messages to the React dashboard over WebSockets.

## Requirements

- Node.js 20.19 or newer
- One Microsoft-authenticated Minecraft account per bot profile
- Access to a Minecraft server you are authorized to use

## Configure bots

Add and manage bot profiles from the dashboard. Select **Add bot** to enter a bot ID, Minecraft username, server host and port, authentication type, optional version, physics setting, and slash commands to run after joining. Use each bot's **Settings** tab to edit or delete its profile and choose whether it starts automatically. Editing or deleting a connected bot stops it first; its Microsoft authentication cache is kept if its profile is deleted.

Bot profiles and auto-start preferences are stored in `.data/bots.sqlite`. Profiles in `configs/bots/*.json` are imported once on the first startup to migrate existing installations; afterward, the database is the source of truth. If `.data/bot-settings.json` exists from an earlier version, its auto-start choices are included in that import. Store `.data/` and `.auth/` privately and persist them across deployments.

Authentication profiles remain separate per bot under `.auth/<id>/`. Mineflayer creates the directory on first login. Use Microsoft authentication for Microsoft accounts; choose offline only for servers that permit offline accounts. Starting a Microsoft-authenticated bot automatically displays a temporary device code in the dashboard when Microsoft authorization is required. From **Settings → Start Microsoft sign-in**, you can stop the bot, clear only its login cache, and start a fresh sign-in. Optional join commands are sent six seconds after each spawn and repeated on reconnect. Each must be a single-line slash command; up to 20 commands of at most 256 characters are accepted.

Device codes are shared only with authenticated dashboard clients and are kept in memory for the active sign-in flow; they are never written to the database or logs. The private OAuth device credential and access tokens are not sent to the browser.

### Authentication cache

Microsoft auth profiles are stored separately per bot under `.auth/<id>/`. Mineflayer creates the directory on first login. To reuse an existing cache, copy the **contents** of that account's Mineflayer cache folder into the matching `.auth/<id>/` directory, preserving the hashed cache filenames. Keep `.auth/` private and never commit or share its files; they contain authentication tokens. Use `auth: "offline"` only for servers that permit offline accounts.

## Run locally

```powershell
npm install
npm run dev
```

Open the Vite URL printed in the terminal. The development server proxies API and WebSocket traffic to the Node service. Use **Add bot** in the Fleet panel to create the first profile.

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
printf 'ALLOWED_ORIGINS=https://bots.example.net\n' > .env
docker compose -f docker-compose.example.yml pull
docker compose -f docker-compose.example.yml up -d
```

Change the origin to match the proxy URL. The Compose service is not published on a host port; attach the proxy to the same external Docker network and proxy traffic to `mineclank:3001`. The named `mineclank-auth` volume persists Microsoft login tokens, and `mineclank-data` persists bot profiles and the saved-message SQLite database. Legacy bot JSON files can remain mounted read-only for the one-time import. For local runs, databases default to `.data/`; set `MINECLANK_DATA_DIR` to use another directory. Keep both data volumes private. If the GHCR package is private, authenticate Docker to `ghcr.io` on the deployment host before pulling.

## Dashboard controls

The dashboard shows bot connection state and current position. The default Player Status tab shows health, hunger and saturation, air, experience, game mode, alive/sleeping status, and current connection session time. Tabs show icons only on small screens and icons with labels on larger screens. Session time is how long this bot has been connected; total server playtime is not generally available unless the server exposes it. Login throttling and Mojang session-service errors use a longer exponential reconnect cooldown, starting at one minute, to avoid repeatedly retrying rejected or interrupted logins. Use **Stop reconnecting** while a bot is connecting or waiting for a retry to cancel its retry timer and stop the connection attempt. Inventory-style server menus opened by commands such as `/vault`, `/pv`, `/ah`, `/shop`, or `/kits` appear in the Server Menu tab. Within Server Menu, left-click, right-click, and shift-click on menu or player inventory slots are forwarded to Minecraft, allowing items to be moved between the player inventory and server containers. Menu buttons can trigger server actions such as purchases.

In the player Inventory tab, click a slot to inspect it, or drag an item to move it, merge compatible stacks, or swap occupied slots. On touch screens, hold briefly before dragging; scroll normally without holding. Keyboard users can pick up an item with Space, choose a destination with the arrow keys, and press Space again to move it or Escape to cancel. Shift-click retains Minecraft quick transfer. Right-click an occupied slot, press Shift+F10, or use the selected item's actions button to open the Drop 1 / Drop All context menu. Drop All requires confirmation. Armor slots require a single compatible equipment item; offhand accepts any item. Close an open server container before managing the player inventory.

The Saved Messages tab stores reusable one-line chat messages and commands in SQLite, shared across bots. Search/filter by category, edit or delete entries, and use `{{placeholder}}` variables; selecting an entry only fills the command box and never sends it. The command field keeps the last 100 sent messages and commands per bot for the current browser session; use Up/Down to browse and return to your draft. Clicking an Online Players tile switches to Live Stream, fills `/msg <username> `, and focuses the command field with the cursor at the end; it does not send the message. Matching chat names support the same action; hover over a linked name to see its Minecraft username. Unmatched or ambiguous names remain plain text. Use the per-bot stop control to disconnect a bot, Start bot to reconnect it, the `/survival` and `/hub1` shortcuts for common hops, or the command field for chat and slash commands. Command allowlists are not enforced in this initial version; only grant dashboard access to trusted users.

## Checks

```powershell
npm test
npm run lint
npm run build
```

Tests use mocked Mineflayer clients and do not connect to a live Minecraft server.
