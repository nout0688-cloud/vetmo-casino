# Discord Activity Starter

Minimal Discord Embedded App (Mini App) using `@discord/embedded-app-sdk`, Vite, and Express.

## Setup

1. Copy env file and fill credentials:
```bash
cp .env.example .env
```
Fill `VITE_DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` from [Discord Developer Portal](https://discord.com/developers/applications).

2. In Discord Developer Portal:
   - Go to **Applications -> Your App -> Embedded App** (or Activities).
   - Set **Default URL**: `https://<your-tunnel-url>`
   - Under **URL Mappings**:
     - Prefix: `/`
     - Target: `https://<your-tunnel-url>`
   - Go to **OAuth2 -> Redirects** and add: `https://<your-tunnel-url>`

3. Start dev servers:
```bash
npm run dev
```

4. Tunneling (Discord requires HTTPS):
```bash
cloudflared tunnel --url http://localhost:5173
# or
ngrok http 5173
```
