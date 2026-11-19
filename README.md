# MineClank

A local web console for managing Mineflayer bots. The Node service owns Minecraft connections and streams bot state and server messages to the React dashboard over WebSockets.

## Requirements

- Node.js 20.19 or newer
- One Microsoft-authenticated Minecraft account per bot profile
- Access to a Minecraft server you are authorized to use

## Configure bots

Add and manage bot profiles from the dashboard. Select **Add bot** to enter a bot ID, Minecraft username, server host and port, authentication type, optional version, physics setting, join commands, and quick commands. Use each bot's **Settings** tab to edit or delete its profile and choose whether it starts automatically. Editing or deleting a connected bot stops it first; its Microsoft authentication cache is kept if its profile is deleted.

Bot profiles, auto-start preferences, and cached Minecraft skin URLs are stored in `.data/bots.sqlite`. Profiles in `configs/bots/*.json` are imported once on the first startup to migrate existing installations; afterward, the database is the source of truth. If `.data/bot-settings.json` exists from an earlier version, its auto-start choices are included in that import. The server looks up each configured Minecraft username through Mojang's public profile services, so bot heads can appear in Fleet while bots are offline. Successful lookups are cached for seven days and missing skins for one day. Store `.data/` and `.auth/` privately and persist them across deployments.

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

Change the origin to match the proxy URL. The Compose service is not published on a host port; attach the proxy to the same external Docker network and proxy traffic to `mineclank:3001`. The named `mineclank-auth` volume persists Microsoft login tokens, and `mineclank-data` persists bot profiles, saved messages, and pin boards. Legacy bot JSON files can remain mounted read-only for the one-time import. For local runs, databases default to `.data/`; set `MINECLANK_DATA_DIR` to use another directory. Keep both data volumes private. If the GHCR package is private, authenticate Docker to `ghcr.io` on the deployment host before pulling.

## Dashboard controls

Each bot has a pin board above its tabs. Select the pin icon to enter edit mode, then select Player Status tiles, inventory slots, or saved messages to add or remove them. Drag the handles or use the arrow buttons to reorder pins; select a board item in edit mode to remove it. Inventory pins follow slot positions, including empty slots, rather than individual items. Outside edit mode, pinned inventory slots open the Inventory tab and pinned messages fill the command box. Boards are stored in `.data/pin-boards.sqlite` and shared between connected browsers.

The dashboard shows bot connection state and current position. The default Player Status tab shows health, hunger and saturation, air, experience, game mode, alive/sleeping status, and current connection session time. Tabs show icons only on small screens and icons with labels on larger screens. Session time is how long this bot has been connected; total server playtime is not generally available unless the server exposes it. Login throttling and Mojang session-service errors use a longer exponential reconnect cooldown, starting at one minute, to avoid repeatedly retrying rejected or interrupted logins. Use **Stop reconnecting** while a bot is connecting or waiting for a retry to cancel its retry timer and stop the connection attempt. Inventory-style server menus opened by commands such as `/vault`, `/pv`, `/ah`, `/shop`, or `/kits` appear in the Server Menu tab. Within Server Menu, left-click, right-click, and shift-click on menu or player inventory slots are forwarded to Minecraft, allowing items to be moved between the player inventory and server containers. Menu buttons can trigger server actions such as purchases.

In the player Inventory tab, click a slot to inspect it, or drag an item to move it, merge compatible stacks, or swap occupied slots. On touch screens, hold briefly before dragging; scroll normally without holding. Keyboard users can pick up an item with Space, choose a destination with the arrow keys, and press Space again to move it or Escape to cancel. Shift-click retains Minecraft quick transfer. Right-click an occupied slot, press Shift+F10, or use the selected item's actions button to open the Drop 1 / Drop All context menu. Drop All requires confirmation. Armor slots require a single compatible equipment item; offhand accepts any item. Close an open server container before managing the player inventory.

Hover over a shulker box or focus its slot with the keyboard to preview its contents. Press Escape to dismiss the preview. This works in the Inventory tab and in both **Menu items** and **Your inventory** on the Server Menu tab. In the Inventory tab, you can also select the slot (including on touch screens) to inspect its contents in the details panel.

The Saved Messages tab stores reusable one-line chat messages and commands in SQLite, shared across bots. Search/filter by category, edit or delete entries, and use `{{placeholder}}` variables; selecting an entry only fills the command box and never sends it. The command field keeps the last 100 sent messages and commands per bot for the current browser session; use Up/Down to browse and return to your draft. Clicking an Online Players tile switches to Live Stream, fills `/msg <username> `, and focuses the command field with the cursor at the end; it does not send the message. Matching chat names support the same action; hover over a linked name to see its Minecraft username. Unmatched or ambiguous names remain plain text. Use the per-bot stop control to disconnect a bot, Start bot to reconnect it, or the command field for chat and slash commands. Configure up to 10 single-line slash commands of at most 256 characters as quick commands in each bot profile; their buttons send immediately instead of filling the command box. New bots start with `/bal` and `/spawn`, which can be edited or removed. Existing bots without a quick-command setting start with no quick commands. Command allowlists are not enforced in this initial version; only grant dashboard access to trusted users.

The Direct Messages tab groups conversations by Minecraft username. It captures incoming messages formatted like `[survival] [Player -> me] message` and outgoing `/msg` and `/w` commands, including on-join commands; other server-specific formats and aliases are not captured. Outgoing entries record commands sent, not confirmed delivery. History is held in the bot record and shared with connected dashboard clients, survives bot stop/start and browser refresh, and is cleared when the bot is removed or the backend restarts. It is not limited by the live feed's 200-line limit, so memory use grows with the history. Existing feed lines are not imported retroactively.

## Push notifications

The **Notifications** tab configures alerts for each bot. Enable individual alerts for unexpected disconnects or kicks, incoming direct messages, death, low health, hunger or air, and nearby players. All alerts are off by default; the initial stat thresholds are 6/20 and the nearby radius is 32 blocks. Settings are shared across browsers, while each device must separately select **Enable** and grant notification permission. Use **Test** to check delivery; **Disable** removes that device's subscription. Every subscribed device receives the enabled alerts for every bot.

Browser push requires HTTPS or localhost, a browser and operating system with Web Push support, and outbound HTTPS access to Google, Mozilla, Apple, or Windows push services. The Notifications tab is hidden when the browser or current connection does not support Web Push. On iOS/iPadOS, add MineClank to the Home Screen and enable notifications from the installed app. Set `PUSH_VAPID_SUBJECT` to a contact URI such as `mailto:admin@example.net`. Notification rules, device subscriptions and the server's private push key are stored in `.data/notifications.sqlite`; keep the data directory private and persistent. Replacing the push key requires devices to enable notifications again. Messages and kick reasons may be visible on lock screens. Delivery is best-effort, and the Node service must be running even when the dashboard is closed.

Direct-message alerts use the formats described above. Nearby alerts use 3D distance to currently tracked players, normally checked every two seconds; unavailable positions cannot trigger an alert. Newly nearby players are combined into a single alert, sent at most once per minute per bot; players detected during the cooldown (for example when a bot joins a busy hub or a server restarts) are grouped into the next alert. Low-stat alerts fire when a threshold is crossed, with a one-minute cooldown for repeated crossings. Disconnect alerts exclude deliberate stops and avoid repeated alerts during a reconnect cycle.

## Checks

```powershell
npm test
npm run lint
npm run build
```

Tests use mocked Mineflayer clients and do not connect to a live Minecraft server.
