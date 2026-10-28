import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import dotenv from "dotenv";
import {
  getUser,
  claimFaucet,
  playSlots,
  playCoinflip,
  getLeaderboard,
  addVoiceReward,
} from "../server/db.js";

dotenv.config();

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.VITE_DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID;

// Voice mining parameters
const VOICE_REWARD_PER_MIN = 15; // 15 VMC per minute
const REQUIRE_COMPANION = true; // true = needs >= 2 people in channel to prevent lone AFK abuse

if (!token) {
  console.log("[bot] DISCORD_BOT_TOKEN is not defined in .env. Bot runner skipped.");
  process.exit(0);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Slash Commands Definition
const commands = [
  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Проверить свой баланс Vetmo Coins (VMC)"),
  new SlashCommandBuilder()
    .setName("slots")
    .setDescription("Крутить слот-машину на Vetmo Coins")
    .addIntegerOption((opt) =>
      opt.setName("bet").setDescription("Размер ставки в VMC").setRequired(true).setMinValue(10)
    ),
  new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Сыграть в Орёл / Решка на Vetmo Coins (x2)")
    .addIntegerOption((opt) =>
      opt.setName("bet").setDescription("Размер ставки в VMC").setRequired(true).setMinValue(10)
    )
    .addStringOption((opt) =>
      opt
        .setName("side")
        .setDescription("Орёл или Решка")
        .setRequired(true)
        .addChoices(
          { name: "Орёл (Heads)", value: "heads" },
          { name: "Решка (Tails)", value: "tails" }
        )
    ),
  new SlashCommandBuilder()
    .setName("top")
    .setDescription("Топ игроков по количеству Vetmo Coins"),
  new SlashCommandBuilder()
    .setName("casino")
    .setDescription("Запустить казино Vetmo Casino прямо в Discord"),
];

async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(token);
    console.log("[bot] Registering slash commands globally...");
    await rest.put(Routes.applicationCommands(clientId), {
      body: commands.map((c) => c.toJSON()),
    });
    console.log("[bot] Slash commands registered successfully.");
  } catch (err) {
    console.error("[bot] Failed to register slash commands:", err);
  }
}

client.on("interactionCreate", async (interaction) => {
  // 1. Native Activity Launch Button (Discord Type 12 Callback)
  if (interaction.isButton() && interaction.customId === "launch_activity") {
    try {
      await client.rest.post(
        Routes.interactionCallback(interaction.id, interaction.token),
        {
          body: {
            type: 12, // InteractionCallbackType.LAUNCH_ACTIVITY
          },
        }
      );
      return;
    } catch (err) {
      console.error("[bot] LAUNCH_ACTIVITY failed:", err);
      return interaction.reply({
        content: "⚠️ Нажми ракету 🚀 в голосовом канале или открой в браузере: https://vetmo-casino.onrender.com",
        ephemeral: true,
      });
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;
  const username = interaction.user.globalName || interaction.user.username;
  const avatar = interaction.user.avatar || "";

  if (interaction.commandName === "balance") {
    const user = await getUser(userId, username, avatar);
    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle(`🪙 Баланс Vetmo Coins`)
      .setDescription(
        `Игрок: **${username}**\n` +
          `Баланс: **${user.balance.toLocaleString()} VMC**\n` +
          `Всего выиграно: **${(user.totalWins || 0).toLocaleString()} VMC**\n\n` +
          `🎙️ **Майнинг в войсе:**\n` +
          `Время в войсе: **${user.voiceMinutes || 0} мин**\n` +
          `Заработано в войсе: **${(user.voiceEarned || 0).toLocaleString()} VMC**\n` +
          `(Начисление: +25 VMC за каждые 10 минут)`
      );
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "slots") {
    await getUser(userId, username, avatar);
    const bet = interaction.options.getInteger("bet");
    const result = await playSlots(userId, bet);
    if (!result.ok) {
      return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
    }

    const reelString = result.reels.join(" | ");
    const isWin = result.win > 0;
    const embed = new EmbedBuilder()
      .setColor(isWin ? 0xf59e0b : 0xef4444)
      .setTitle("🎰 Vetmo Slots")
      .setDescription(
        `[ **${reelString}** ]\n\n` +
          (isWin
            ? `🎉 **Выигрыш:** +${result.win.toLocaleString()} VMC (x${result.multiplier})!`
            : `💀 **Проигрыш:** -${bet.toLocaleString()} VMC`) +
          `\nТекущий баланс: **${result.balance.toLocaleString()} VMC**`
      );
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "coinflip") {
    await getUser(userId, username, avatar);
    const bet = interaction.options.getInteger("bet");
    const side = interaction.options.getString("side");
    const result = await playCoinflip(userId, bet, side);
    if (!result.ok) {
      return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
    }

    const coinEmoji = result.outcome === "heads" ? "🦅 Орёл" : "🪙 Решка";
    const embed = new EmbedBuilder()
      .setColor(result.won ? 0xf59e0b : 0xef4444)
      .setTitle("🪙 Vetmo Coinflip")
      .setDescription(
        `Выпало: **${coinEmoji}**\nТвой выбор: **${side === "heads" ? "Орёл" : "Решка"}**\n\n` +
          (result.won
            ? `🎉 **Победа!** +${result.win.toLocaleString()} VMC (x2)!`
            : `💀 **Проигрыш!** -${bet.toLocaleString()} VMC`) +
          `\nТекущий баланс: **${result.balance.toLocaleString()} VMC**`
      );
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "top") {
    const top = await getLeaderboard();
    const desc = top
      .map(
        (u, i) =>
          `**#${i + 1}** ${u.username ? `**${u.username}**` : `<@${u.id}>`} — **${u.balance.toLocaleString()} VMC**`
      )
      .join("\n");
    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle("🏆 Таблица лидеров Vetmo Coins")
      .setDescription(desc || "Пока никто не играл.");
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "casino") {
    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle("🎰 VETMO CASINO | MONOCHROME EDITION")
      .setDescription(
        "Нажми зелёную кнопку **«ИГРАТЬ В КАЗИНО»** ниже — окно активности запустится прямо внутри Discord!\n\n" +
          "• Монохромные слоты и Coinflip\n" +
          "• Живой баланс Vetmo Coins (VMC)\n" +
          "• Войс-майнинг (+25 VMC за 10 мин в войсе)"
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("launch_activity")
        .setLabel("ИГРАТЬ В КАЗИНО")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🎰"),
      new ButtonBuilder()
        .setLabel("ИГРАТЬ В БРАУЗЕРЕ")
        .setStyle(ButtonStyle.Link)
        .setURL("https://vetmo-casino.onrender.com")
        .setEmoji("🌐")
    );

    return interaction.reply({ embeds: [embed], components: [row] });
  }
});

client.once("ready", () => {
  console.log(`[bot] Logged in as ${client.user.tag}`);
  registerCommands();

  // Voice mining ticker: runs every 60 seconds
  setInterval(async () => {
    let rewardedCount = 0;
    for (const guild of client.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (channel.isVoiceBased()) {
          const humanMembers = channel.members.filter((m) => !m.user.bot);
          const minRequired = REQUIRE_COMPANION ? 2 : 1;

          if (humanMembers.size >= minRequired) {
            for (const member of humanMembers.values()) {
              const isDeaf = member.voice.selfDeaf || member.voice.serverDeaf;
              if (!isDeaf) {
                try {
                  const res = await addVoiceReward(member.id);
                  if (res && res.awarded > 0) {
                    rewardedCount++;
                  }
                } catch (_) {}
              }
            }
          }
        }
      }
    }
    if (rewardedCount > 0) {
      console.log(`[voice-miner] Awarded +25 VMC to ${rewardedCount} active voice members reaching 10-min mark.`);
    }
  }, 60 * 1000);
    if (rewardedCount > 0) {
      console.log(`[voice-miner] Awarded +25 VMC to ${rewardedCount} active voice members reaching 10-min mark.`);
    }
  }, 60 * 1000);
});

client.login(token);
