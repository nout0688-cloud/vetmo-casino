import { DiscordSDK } from "@discord/embedded-app-sdk";

let clientId = import.meta.env.VITE_DISCORD_CLIENT_ID || "";
let discordSdk = null;
let currentUserId = "guest_player";
let currentUsername = "ИГРОК (VETMO)";
let currentUserAvatar = "";
let balance = 1000;
let isBusy = false;
let selectedCoinSide = "heads";

// DOM references
const usernameEl = document.getElementById("username");
const channelNameEl = document.getElementById("channel-name");
const avatarEl = document.getElementById("avatar");
const statusBadge = document.getElementById("status-badge");
const balanceVal = document.getElementById("balance-val");

const tabButtons = document.querySelectorAll(".tab-btn");
const viewPanels = {
  slots: document.getElementById("view-slots"),
  coinflip: document.getElementById("view-coinflip"),
  leaderboard: document.getElementById("view-leaderboard"),
};

const reel1 = document.getElementById("reel-1");
const reel2 = document.getElementById("reel-2");
const reel3 = document.getElementById("reel-3");
const slotStatus = document.getElementById("slot-status");
const slotBetInput = document.getElementById("slot-bet");
const spinBtn = document.getElementById("spin-btn");

const coinElement = document.getElementById("coin-element");
const flipStatus = document.getElementById("flip-status");
const flipBetInput = document.getElementById("flip-bet");
const flipBtn = document.getElementById("flip-btn");
const sideButtons = document.querySelectorAll(".side-btn");
const leaderboardList = document.getElementById("leaderboard-list");

// Audio SFX Manager with Real Downloaded Sounds
const sfxPool = {
  click: new Audio("/sounds/click.mp3"),
  spin: new Audio("/sounds/spin.mp3"),
  coin: new Audio("/sounds/coin.mp3"),
  win: new Audio("/sounds/win.mp3"),
  loss: new Audio("/sounds/loss.mp3"),
};

function playSfx(name) {
  try {
    const audio = sfxPool[name];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  } catch (_) {}
}

function updateBalanceDisplay(newBalance) {
  balance = newBalance;
  balanceVal.textContent = `${balance.toLocaleString()} VMC`;
}

// Tab Switching
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    playSfx("click");
    const target = btn.dataset.tab;
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    Object.keys(viewPanels).forEach((k) => {
      viewPanels[k].classList.toggle("active", k === target);
    });

    if (target === "leaderboard") {
      fetchLeaderboard();
    }
  });
});

// Chip bet buttons
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    playSfx("click");
    const val = chip.dataset.bet;
    if (val === "max") {
      slotBetInput.value = balance;
    } else {
      slotBetInput.value = val;
    }
  });
});

// Coinflip Side selection
sideButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    playSfx("click");
    sideButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedCoinSide = btn.dataset.side;
  });
});

// Slots Spin
spinBtn.addEventListener("click", async () => {
  if (isBusy) return;
  const bet = parseInt(slotBetInput.value, 10);
  if (isNaN(bet) || bet <= 0) return;
  if (bet > balance) {
    slotStatus.textContent = "НЕДОСТАТОЧНО VETMO COINS!";
    return;
  }

  isBusy = true;
  spinBtn.disabled = true;
  slotStatus.textContent = "БАРАБАНЫ КРУТЯТСЯ...";
  playSfx("spin");

  const symbols = ["7", "V", "†", "‡", "0", "★"];
  const reelEls = [reel1, reel2, reel3];
  const spinInterval = setInterval(() => {
    reelEls.forEach((el) => {
      el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    });
  }, 70);

  try {
    const res = await fetch("/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUserId, bet }),
    });
    const data = await res.json();

    setTimeout(() => {
      clearInterval(spinInterval);
      if (data.ok) {
        reel1.textContent = data.reels[0];
        reel2.textContent = data.reels[1];
        reel3.textContent = data.reels[2];
        updateBalanceDisplay(data.balance);

        if (data.win > 0) {
          playSfx("win");
          slotStatus.textContent = `ВЫИГРЫШ: +${data.win.toLocaleString()} VMC (x${data.multiplier})!`;
          slotStatus.style.color = "#ffffff";
        } else {
          playSfx("loss");
          slotStatus.textContent = `МИМО (-${bet} VMC)`;
          slotStatus.style.color = "var(--text-dim)";
        }
      } else {
        slotStatus.textContent = data.error || "ОШИБКА";
      }
      spinBtn.disabled = false;
      isBusy = false;
    }, 1000);
  } catch (err) {
    clearInterval(spinInterval);
    spinBtn.disabled = false;
    isBusy = false;
    slotStatus.textContent = "СЕТЕВАЯ ОШИБКА";
  }
});

// Coinflip Play
flipBtn.addEventListener("click", async () => {
  if (isBusy) return;
  const bet = parseInt(flipBetInput.value, 10);
  if (isNaN(bet) || bet <= 0) return;
  if (bet > balance) {
    flipStatus.textContent = "НЕДОСТАТОЧНО VETMO COINS!";
    return;
  }

  isBusy = true;
  flipBtn.disabled = true;
  flipStatus.textContent = "МОНЕТА В ВОЗДУХЕ...";
  playSfx("spin");

  coinElement.classList.remove("coin-spinning");
  void coinElement.offsetWidth;
  coinElement.classList.add("coin-spinning");

  const flipTimer = setInterval(() => {
    coinElement.textContent = coinElement.textContent === "V" ? "Ш" : "V";
  }, 90);

  try {
    const res = await fetch("/api/coinflip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUserId, bet, side: selectedCoinSide }),
    });
    const data = await res.json();

    setTimeout(() => {
      clearInterval(flipTimer);
      if (data.ok) {
        const char = data.outcome === "heads" ? "V" : "Ш";
        const sideName = data.outcome === "heads" ? "ОРЁЛ (VETMO)" : "РЕШКА (ШАКИРЗЯН)";
        coinElement.textContent = char;
        updateBalanceDisplay(data.balance);

        if (data.won) {
          playSfx("win");
          flipStatus.textContent = `ПОБЕДА! ВЫПАЛО: ${sideName}. +${data.win} VMC`;
          flipStatus.style.color = "#ffffff";
        } else {
          playSfx("loss");
          flipStatus.textContent = `ПРОИГРЫШ! ВЫПАЛО: ${sideName}. -${bet} VMC`;
          flipStatus.style.color = "var(--text-dim)";
        }
      }
      flipBtn.disabled = false;
      isBusy = false;
    }, 1100);
  } catch (err) {
    clearInterval(flipTimer);
    flipBtn.disabled = false;
    isBusy = false;
    flipStatus.textContent = "СЕТЕВАЯ ОШИБКА";
  }
});

// Leaderboard Fetch
async function fetchLeaderboard() {
  try {
    leaderboardList.innerHTML = `<p class="empty-text">ОБНОВЛЕНИЕ...</p>`;
    const res = await fetch("/api/leaderboard");
    const data = await res.json();
    if (!data.ok || !data.leaderboard.length) {
      leaderboardList.innerHTML = `<p class="empty-text">ТАБЛИЦА ЛИДЕРОВ ПУСТА</p>`;
      return;
    }

    leaderboardList.innerHTML = data.leaderboard
      .map((item, idx) => {
        const isMe = item.id === currentUserId;
        const name = item.username || item.id;
        const avatarUrl = item.avatar
          ? (item.avatar.startsWith("http")
              ? item.avatar
              : `https://cdn.discordapp.com/avatars/${item.id}/${item.avatar}.png?size=64`)
          : "https://cdn.discordapp.com/embed/avatars/0.png";

        return `
        <div class="leader-item ${isMe ? "leader-item-me" : ""}">
          <span class="leader-rank">#${idx + 1}</span>
          <img class="leader-avatar" src="${avatarUrl}" alt="" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" />
          <div class="leader-info">
            <span class="leader-name">${name}</span>
            ${isMe ? '<span class="leader-tag">ВЫ</span>' : ""}
          </div>
          <span class="leader-coins">${item.balance.toLocaleString()} VMC</span>
        </div>
      `;
      })
      .join("");
  } catch (err) {
    leaderboardList.innerHTML = `<p class="empty-text">ОШИБКА ЗАГРУЗКИ</p>`;
  }
}

// Preloader Controls
const preloader = document.getElementById("preloader");
const preloaderBar = document.getElementById("preloader-bar");
const preloaderStatus = document.getElementById("preloader-status");
const preloaderPct = document.getElementById("preloader-pct");

function setProgress(pct, msg) {
  if (preloaderBar) preloaderBar.style.width = `${pct}%`;
  if (preloaderPct) preloaderPct.textContent = `${pct}%`;
  if (preloaderStatus && msg) preloaderStatus.textContent = msg;
}

function dismissPreloader() {
  setProgress(100, "ГОТОВО");
  setTimeout(() => {
    if (preloader) preloader.classList.add("fade-out");
  }, 400);
}

// App Initialization
async function initApp() {
  setProgress(20, "ПРОВЕРКА АССЕТОВ...");
  await new Promise((r) => setTimeout(r, 100));

  // 1. Fetch runtime Discord Client ID if not baked into Vite
  if (!clientId) {
    try {
      const cfgRes = await fetch("/api/config");
      const cfg = await cfgRes.json();
      if (cfg && cfg.clientId) {
        clientId = cfg.clientId;
      }
    } catch (err) {
      console.warn("Failed to retrieve runtime client_id:", err);
    }
  }

  setProgress(45, "СИНХРОНИЗАЦИЯ DISCORD IPC...");

  const inDiscordIframe = window !== window.parent || window.location.search.includes("frame_id");

  if (!inDiscordIframe || !clientId) {
    statusBadge.textContent = "STANDALONE";
    channelNameEl.textContent = "ЛОКАЛЬНЫЙ ТЕСТ";
    usernameEl.textContent = "ИГРОК (VETMO)";
    currentUserId = "local_dev_user";
    currentUsername = "ИГРОК (VETMO)";
  } else {
    try {
      discordSdk = new DiscordSDK(clientId);
      await discordSdk.ready();

      const { code } = await discordSdk.commands.authorize({
        client_id: clientId,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify", "guilds"],
      });

      const tokenRes = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const { access_token } = await tokenRes.json();

      const auth = await discordSdk.commands.authenticate({ access_token });
      const user = auth.user;
      currentUserId = user.id;

      const displayName = user.global_name || user.username;
      currentUsername = displayName;
      usernameEl.textContent = displayName;
      channelNameEl.textContent = `КАНАЛ: ${discordSdk.channelId ?? "VOICE/TEXT"}`;
      statusBadge.textContent = "ONLINE";
      statusBadge.classList.add("online");

      if (user.avatar) {
        currentUserAvatar = user.avatar;
        avatarEl.src = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
      } else {
        avatarEl.src = `https://cdn.discordapp.com/embed/avatars/0.png`;
      }
    } catch (err) {
      console.error("Discord SDK auth failed:", err);
      statusBadge.textContent = "AUTH ERROR";
      usernameEl.textContent = "DISCORD ГОСТЬ";
      currentUserId = "discord_guest_" + Math.random().toString(36).substring(2, 7);
      currentUsername = usernameEl.textContent;
    }
  }

  setProgress(75, "ЗАГРУЗКА БАЛАНСА VETMO COINS...");
  await new Promise((r) => setTimeout(r, 120));

  try {
    const q = new URLSearchParams({
      username: currentUsername || "",
      avatar: currentUserAvatar || "",
    });
    const res = await fetch(`/api/user/${currentUserId}?${q.toString()}`);
    const data = await res.json();
    if (data.ok && data.user) {
      updateBalanceDisplay(data.user.balance);
    }
  } catch (_) {
    updateBalanceDisplay(1000);
  }

  dismissPreloader();
}

initApp();
