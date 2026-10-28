import express from "express";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { getUser, claimFaucet, playSlots, playCoinflip, getLeaderboard } from "./db.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;
const clientId = process.env.VITE_DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID;
const clientSecret = process.env.DISCORD_CLIENT_SECRET;

app.use(express.json());

// 0. Public runtime config for client
app.get("/api/config", (req, res) => {
  res.json({
    clientId: clientId || "",
  });
});

// 1. Discord OAuth2 token exchange
app.post("/api/token", async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "Missing authorization code" });
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: "Server missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET" });
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code: code,
    });

    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Discord token error:", data);
      return res.status(response.status).json(data);
    }

    return res.json({ access_token: data.access_token });
  } catch (error) {
    console.error("Internal OAuth error:", error);
    return res.status(500).json({ error: "Failed to exchange authorization code" });
  }
});

// 2. Casino: Get User Profile & Balance
app.get("/api/user/:id", async (req, res) => {
  const { username, avatar } = req.query;
  const user = await getUser(req.params.id, username, avatar);
  res.json({ ok: true, user });
});

// 3. Casino: Claim Daily Faucet
app.post("/api/faucet", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  const result = await claimFaucet(userId);
  res.json(result);
});

// 4. Casino: Play Slots
app.post("/api/slots", async (req, res) => {
  const { userId, bet } = req.body;
  if (!userId || typeof bet !== "number") {
    return res.status(400).json({ error: "Invalid parameters" });
  }
  const result = await playSlots(userId, Math.floor(bet));
  res.json(result);
});

// 5. Casino: Play Coinflip
app.post("/api/coinflip", async (req, res) => {
  const { userId, bet, side } = req.body;
  if (!userId || typeof bet !== "number" || !["heads", "tails"].includes(side)) {
    return res.status(400).json({ error: "Invalid parameters" });
  }
  const result = await playCoinflip(userId, Math.floor(bet), side);
  res.json(result);
});

// 6. Casino: Leaderboard
app.get("/api/leaderboard", async (req, res) => {
  res.json({ ok: true, leaderboard: await getLeaderboard() });
});

// Production static file serving
const distPath = path.resolve(__dirname, "../dist");
if (process.env.NODE_ENV === "production" || fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`[server] Vetmo Coins Casino backend running on http://localhost:${port}`);
  if (process.env.DISCORD_BOT_TOKEN) {
    import("../bot/bot.js").catch((err) => console.error("[bot] failed to launch:", err));
  }
});
