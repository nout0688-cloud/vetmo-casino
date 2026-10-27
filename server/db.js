import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.resolve(__dirname, "data.json");

let state = {
  users: {}, // [discord_id]: { balance: 1000, lastFaucet: 0, totalSpins: 0, totalWins: 0 }
};

// Load existing DB
if (fs.existsSync(DB_FILE)) {
  try {
    state = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch (err) {
    console.error("Failed to parse data.json, starting fresh", err);
  }
}

function save() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write to data.json", err);
  }
}

export function getUser(userId) {
  if (!state.users[userId]) {
    state.users[userId] = {
      balance: 1000, // starting balance in Vetmo Coins
      lastFaucet: 0,
      totalSpins: 0,
      totalWins: 0,
      voiceMinutes: 0,
      voiceEarned: 0,
    };
    save();
  }
  return state.users[userId];
}

export function addVoiceMinute(userId) {
  const user = getUser(userId);
  user.voiceMinutes = (user.voiceMinutes || 0) + 1;
  let awarded = 0;
  // 25 Vetmo Coins every 10 minutes in voice
  if (user.voiceMinutes % 10 === 0) {
    awarded = 25;
    user.balance += awarded;
    user.voiceEarned = (user.voiceEarned || 0) + awarded;
  }
  save();
  return {
    balance: user.balance,
    voiceMinutes: user.voiceMinutes,
    voiceEarned: user.voiceEarned || 0,
    awarded,
  };
}

export function addVoiceReward(userId) {
  return addVoiceMinute(userId);
}

export function claimFaucet(userId) {
  const user = getUser(userId);
  const now = Date.now();
  const COOLDOWN_MS = 60 * 1000; // 1 minute faucet cooldown for testing

  if (now - user.lastFaucet < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (now - user.lastFaucet)) / 1000);
    return { ok: false, error: `Жди ${remaining} сек перед следующим клеймом.` };
  }

  user.balance += 500;
  user.lastFaucet = now;
  save();
  return { ok: true, balance: user.balance, added: 500 };
}

export function playSlots(userId, bet) {
  const user = getUser(userId);
  if (bet <= 0 || user.balance < bet) {
    return { ok: false, error: "Недостаточно Vetmo Coins" };
  }

  user.balance -= bet;
  user.totalSpins++;

  const SYMBOLS = ["7", "V", "†", "‡", "0", "★"];
  const MULTIPLIERS = {
    "7": 50,
    "V": 25,
    "†": 15,
    "‡": 10,
    "★": 5,
    "0": 2,
  };

  const reels = [
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
  ];

  // Lucky bias: 20% chance to match reel 2 to reel 1
  if (Math.random() < 0.2) {
    reels[1] = reels[0];
  }

  let win = 0;
  let multiplier = 0;

  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    multiplier = MULTIPLIERS[reels[0]] || 5;
    win = bet * multiplier;
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    multiplier = 1.5;
    win = Math.floor(bet * 1.5);
  }

  if (win > 0) {
    user.balance += win;
    user.totalWins += win;
  }

  save();
  return {
    ok: true,
    reels,
    bet,
    win,
    multiplier,
    balance: user.balance,
  };
}

export function playCoinflip(userId, bet, chosenSide) {
  const user = getUser(userId);
  if (bet <= 0 || user.balance < bet) {
    return { ok: false, error: "Недостаточно Vetmo Coins" };
  }

  user.balance -= bet;
  const outcome = Math.random() < 0.5 ? "heads" : "tails";
  const won = outcome === chosenSide;
  const win = won ? bet * 2 : 0;

  if (won) {
    user.balance += win;
    user.totalWins += win;
  }

  save();
  return {
    ok: true,
    outcome,
    won,
    bet,
    win,
    balance: user.balance,
  };
}

export function getLeaderboard() {
  const list = Object.entries(state.users).map(([id, u]) => ({
    id,
    balance: u.balance,
    totalWins: u.totalWins,
  }));
  list.sort((a, b) => b.balance - a.balance);
  return list.slice(0, 10);
}
