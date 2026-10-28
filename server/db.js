import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.resolve(__dirname, "data.json");

const databaseUrl = process.env.DATABASE_URL;
let pool = null;

if (databaseUrl) {
  pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  pool
    .query(
      `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        username VARCHAR(64) DEFAULT '',
        avatar VARCHAR(128) DEFAULT '',
        balance BIGINT NOT NULL DEFAULT 1000,
        last_faucet BIGINT NOT NULL DEFAULT 0,
        total_spins INTEGER NOT NULL DEFAULT 0,
        total_wins BIGINT NOT NULL DEFAULT 0,
        voice_minutes INTEGER NOT NULL DEFAULT 0,
        voice_earned BIGINT NOT NULL DEFAULT 0
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(64) DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(128) DEFAULT '';`
    )
    .then(() => {
      console.log("[db] PostgreSQL connected and table verified.");
    })
    .catch((err) => {
      console.error("[db] PostgreSQL init error:", err);
    });
} else {
  console.log("[db] No DATABASE_URL found. Using local JSON store.");
}

// Local JSON fallback
let state = { users: {} };
if (fs.existsSync(DB_FILE)) {
  try {
    state = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch (_) {}
}

function saveJson() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (_) {}
}

export async function getUser(userId, username = null, avatar = null) {
  if (pool) {
    try {
      const res = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        if ((username && username !== row.username) || (avatar && avatar !== row.avatar)) {
          const newName = username || row.username || "";
          const newAvatar = avatar || row.avatar || "";
          await pool.query("UPDATE users SET username = $1, avatar = $2 WHERE id = $3", [
            newName,
            newAvatar,
            userId,
          ]);
          row.username = newName;
          row.avatar = newAvatar;
        }
        return {
          id: row.id,
          username: row.username || "",
          avatar: row.avatar || "",
          balance: parseInt(row.balance, 10),
          lastFaucet: parseInt(row.last_faucet, 10),
          totalSpins: parseInt(row.total_spins, 10),
          totalWins: parseInt(row.total_wins, 10),
          voiceMinutes: parseInt(row.voice_minutes, 10),
          voiceEarned: parseInt(row.voice_earned, 10),
        };
      }
      await pool.query(
        "INSERT INTO users (id, username, avatar, balance, last_faucet, total_spins, total_wins, voice_minutes, voice_earned) VALUES ($1, $2, $3, 1000, 0, 0, 0, 0, 0)",
        [userId, username || "", avatar || ""]
      );
      return {
        id: userId,
        username: username || "",
        avatar: avatar || "",
        balance: 1000,
        lastFaucet: 0,
        totalSpins: 0,
        totalWins: 0,
        voiceMinutes: 0,
        voiceEarned: 0,
      };
    } catch (err) {
      console.error("[db] getUser error:", err);
    }
  }

  // JSON fallback
  if (!state.users[userId]) {
    state.users[userId] = {
      id: userId,
      username: username || "",
      avatar: avatar || "",
      balance: 1000,
      lastFaucet: 0,
      totalSpins: 0,
      totalWins: 0,
      voiceMinutes: 0,
      voiceEarned: 0,
    };
    saveJson();
  } else if (username || avatar) {
    if (username) state.users[userId].username = username;
    if (avatar) state.users[userId].avatar = avatar;
    saveJson();
  }
  return state.users[userId];
}

export async function addVoiceMinute(userId) {
  const user = await getUser(userId);
  const newVoiceMinutes = (user.voiceMinutes || 0) + 1;
  let awarded = 0;
  if (newVoiceMinutes % 10 === 0) {
    awarded = 25;
  }
  const newBalance = user.balance + awarded;
  const newVoiceEarned = (user.voiceEarned || 0) + awarded;

  if (pool) {
    try {
      await pool.query(
        "UPDATE users SET balance = $1, voice_minutes = $2, voice_earned = $3 WHERE id = $4",
        [newBalance, newVoiceMinutes, newVoiceEarned, userId]
      );
    } catch (err) {
      console.error("[db] addVoiceMinute pg error:", err);
    }
  } else {
    user.voiceMinutes = newVoiceMinutes;
    user.balance = newBalance;
    user.voiceEarned = newVoiceEarned;
    saveJson();
  }

  return {
    balance: newBalance,
    voiceMinutes: newVoiceMinutes,
    voiceEarned: newVoiceEarned,
    awarded,
  };
}

export async function addVoiceReward(userId) {
  return await addVoiceMinute(userId);
}

export async function claimFaucet(userId) {
  const user = await getUser(userId);
  const now = Date.now();
  const COOLDOWN_MS = 60 * 1000;

  if (now - user.lastFaucet < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (now - user.lastFaucet)) / 1000);
    return { ok: false, error: `Жди ${remaining} сек перед следующим клеймом.` };
  }

  const newBalance = user.balance + 500;

  if (pool) {
    try {
      await pool.query("UPDATE users SET balance = $1, last_faucet = $2 WHERE id = $3", [
        newBalance,
        now,
        userId,
      ]);
    } catch (err) {
      console.error("[db] claimFaucet pg error:", err);
    }
  } else {
    user.balance = newBalance;
    user.lastFaucet = now;
    saveJson();
  }

  return { ok: true, balance: newBalance, added: 500 };
}

export async function playSlots(userId, bet) {
  const user = await getUser(userId);
  if (bet <= 0 || user.balance < bet) {
    return { ok: false, error: "Недостаточно Vetmo Coins" };
  }

  const SYMBOLS = ["7", "V", "†", "‡", "0", "★"];
  const MULTIPLIERS = { "7": 50, "V": 25, "†": 15, "‡": 10, "★": 5, "0": 2 };

  const reels = [
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
  ];

  if (Math.random() < 0.2) reels[1] = reels[0];

  let win = 0;
  let multiplier = 0;

  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    multiplier = MULTIPLIERS[reels[0]] || 5;
    win = bet * multiplier;
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    multiplier = 1.5;
    win = Math.floor(bet * 1.5);
  }

  const newBalance = user.balance - bet + win;
  const newTotalSpins = (user.totalSpins || 0) + 1;
  const newTotalWins = (user.totalWins || 0) + win;

  if (pool) {
    try {
      await pool.query(
        "UPDATE users SET balance = $1, total_spins = $2, total_wins = $3 WHERE id = $4",
        [newBalance, newTotalSpins, newTotalWins, userId]
      );
    } catch (err) {
      console.error("[db] playSlots pg error:", err);
    }
  } else {
    user.balance = newBalance;
    user.totalSpins = newTotalSpins;
    user.totalWins = newTotalWins;
    saveJson();
  }

  return {
    ok: true,
    reels,
    bet,
    win,
    multiplier,
    balance: newBalance,
  };
}

export async function playCoinflip(userId, bet, chosenSide) {
  const user = await getUser(userId);
  if (bet <= 0 || user.balance < bet) {
    return { ok: false, error: "Недостаточно Vetmo Coins" };
  }

  const outcome = Math.random() < 0.5 ? "heads" : "tails";
  const won = outcome === chosenSide;
  const win = won ? bet * 2 : 0;

  const newBalance = user.balance - bet + win;
  const newTotalWins = (user.totalWins || 0) + win;

  if (pool) {
    try {
      await pool.query(
        "UPDATE users SET balance = $1, total_wins = $2 WHERE id = $3",
        [newBalance, newTotalWins, userId]
      );
    } catch (err) {
      console.error("[db] playCoinflip pg error:", err);
    }
  } else {
    user.balance = newBalance;
    user.totalWins = newTotalWins;
    saveJson();
  }

  return {
    ok: true,
    outcome,
    won,
    bet,
    win,
    balance: newBalance,
  };
}

export async function getLeaderboard() {
  if (pool) {
    try {
      const res = await pool.query(
        'SELECT id, username, avatar, balance, total_wins AS "totalWins" FROM users ORDER BY balance DESC LIMIT 10'
      );
      return res.rows.map((r) => ({
        id: r.id,
        username: r.username || "",
        avatar: r.avatar || "",
        balance: parseInt(r.balance, 10),
        totalWins: parseInt(r.totalWins, 10),
      }));
    } catch (err) {
      console.error("[db] getLeaderboard pg error:", err);
    }
  }

  const list = Object.entries(state.users).map(([id, u]) => ({
    id,
    username: u.username || "",
    avatar: u.avatar || "",
    balance: u.balance,
    totalWins: u.totalWins || 0,
  }));
  list.sort((a, b) => b.balance - a.balance);
  return list.slice(0, 10);
}
