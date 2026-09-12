/*
==========================================================
 BOT DE APOSTAS DISCORD — VERSÃO COMPLETA
==========================================================

REQUISITOS:
  Node.js 18.17+
  discord.js 14+

VARIÁVEIS DE AMBIENTE:
  DISCORD_TOKEN = token do bot
  CLIENT_ID     = ID da aplicação
  GUILD_ID      = opcional; registra comandos no servidor

COMANDOS:
  /config
  /fila
  /cadastro
  /embeds
  /fila streamer
  .ssmob
  .ssemu
  .med
  .p

REGRAS:
  - Embeds organizadas e autoexplicativas.
  - Taxa configurável entre R$0,01 e R$0,50.
  - Até 20 ADMs cadastrados.
  - Valores de fila: 0,30 / 0,50 / 0,75 / 1 / 2 / 3 / 5 / 7 / 10 / 20 / 50 / 100.
  - Fila: 1x1 / 2x2 / 3x3 / 4x4.
  - Modalidade: Mobile / Emulador / Misto.
  - 1x1: Gelo Normal / Gelo Infinito / Sair.
  - 2x2, 3x3, 4x4: Entrar / Sair.
  - Fila de Mediadores: somente cargo Mediador.
  - Fila de Streamer: somente cargo Influencer/Streamer configurado.
  - Rodízio de Mediadores.
  - Sem Mediador disponível, aposta não pode ser puxada.
  - .p mostra: Vitórias / Derrotas / Vitórias por W.O. / Coins.
  - NÃO existe "Vitórias normais" no .p.
==========================================================
*/

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} = require("discord.js");

const fs = require("fs");
const path = require("path");

/* ========================================================
   AMBIENTE
======================================================== */

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || null;

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN não configurado.");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("❌ CLIENT_ID não configurado.");
  process.exit(1);
}

/* ========================================================
   BANCO LOCAL
======================================================== */

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const ALLOWED_VALUES = [
  0.30, 0.50, 0.75, 1.00, 2.00, 3.00,
  5.00, 7.00, 10.00, 20.00, 50.00, 100.00
];

const FORMATS = ["1x1", "2x2", "3x3", "4x4"];
const MODALITIES = ["mobile", "emulador", "misto"];

function createDefaultDatabase() {
  return {
    config: {
      mediatorRoleId: null,
      analystRoleId: null,
      streamerRoleId: null,
      admins: [],
      fee: 0.01,
      embedColor: "#5865F2",
      profileImage: null,
      ssmobChannelId: null,
      ssemuChannelId: null,
      mediatorQueueChannelId: null,
      betCategoryId: null,
      streamerCategoryId: null,
      mediatorQueueMessageId: null
    },

    pix: {},

    users: {},

    queues: {},

    mediatorQueue: [],

    mediatorRotation: 0,

    bets: {},

    analyses: {},

    streamerQueues: {},
    streamerMatches: {},

    createdAt: Date.now()
  };
}

function loadDatabase() {
  if (!fs.existsSync(DATA_FILE)) {
    const fresh = createDefaultDatabase();
    fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return mergeDefaults(createDefaultDatabase(), parsed);
  } catch (error) {
    console.error("⚠️ Banco inválido. Criando novo banco.", error);
    const fresh = createDefaultDatabase();
    fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

function mergeDefaults(base, data) {
  for (const key of Object.keys(data || {})) {
    if (
      data[key] &&
      typeof data[key] === "object" &&
      !Array.isArray(data[key]) &&
      base[key] &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      mergeDefaults(base[key], data[key]);
    } else {
      base[key] = data[key];
    }
  }

  return base;
}

let db = loadDatabase();

// Configurações temporárias do comando /fila por usuário.
const filaSetup = new Map();

let saveTimer = null;
let saveInProgress = false;
let savePending = false;
let shutdownStarted = false;

async function flushDatabase() {
  if (saveInProgress || !savePending) return;
  saveInProgress = true;
  savePending = false;

  try {
    const data = JSON.stringify(db, null, 2);
    const tempFile = `${DATA_FILE}.tmp`;
    await fs.promises.writeFile(tempFile, data, "utf8");
    await fs.promises.rename(tempFile, DATA_FILE);
  } catch (error) {
    savePending = true;
    console.error("❌ Erro ao salvar o banco:", error);
  } finally {
    saveInProgress = false;

    if (savePending && !shutdownStarted) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        flushDatabase().catch(error =>
          console.error("❌ Erro no salvamento agendado:", error)
        );
      }, 500);
    }
  }
}

function saveDatabase() {
  savePending = true;

  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  saveTimer = setTimeout(() => {
    flushDatabase().catch(error =>
      console.error("❌ Erro no salvamento agendado:", error)
    );
  }, 500);
}

/* ========================================================
   FUNÇÕES UTILITÁRIAS
======================================================== */

function money(value) {
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
}

function parseMoney(value) {
  return Number(String(value).trim().replace(",", "."));
}

function valueId(value) {
  return Number(value).toFixed(2);
}

function validHex(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function validUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function modalityName(modality) {
  const names = {
    mobile: "Mobile",
    emulador: "Emulador",
    misto: "Misto"
  };

  return names[modality] || modality;
}

function formatName(format) {
  return format;
}

function requiredPlayers(format) {
  // Toda fila representa uma aposta entre exatamente 2 jogadores,
  // independentemente do formato da partida.
  return 2;
}

function userStats(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      wins: 0,
      losses: 0,
      woWins: 0,
      coins: 0
    };
  }

  return db.users[userId];
}

function configEmbed() {
  const c = db.config;
  return makeEmbed("⚙️ CONFIG DO BOT", [
    `🛡️ **Equipe:** ${c.mediatorRoleId ? `<@&${c.mediatorRoleId}>` : "❌"} • ${c.analystRoleId ? `<@&${c.analystRoleId}>` : "❌"} • ${c.streamerRoleId ? `<@&${c.streamerRoleId}>` : "❌"}`,
    `👑 **ADMs:** ${c.admins.length}/20`,
    `💰 **Taxa:** ${money(c.fee)} • **Categoria:** ${c.betCategoryId ? `<#${c.betCategoryId}>` : "❌"} • **Streamer:** ${c.streamerCategoryId ? `<#${c.streamerCategoryId}>` : "❌"}`,
    `📢 **Filas:** ${c.ssmobChannelId ? `<#${c.ssmobChannelId}>` : "❌"} • ${c.ssemuChannelId ? `<#${c.ssemuChannelId}>` : "❌"}`,
    `👨‍⚖️ **Mediadores:** ${c.mediatorQueueChannelId ? `<#${c.mediatorQueueChannelId}>` : "❌"}`,
    `🎨 **Cor:** \`${c.embedColor}\` • **Foto:** ${c.profileImage ? "✅" : "❌"}`
  ].join("\\n"));
}

function makeEmbed(title, description = "") {
  const result = new EmbedBuilder()
    .setColor(db.config.embedColor || "#5865F2")
    .setTitle(title)
    .setDescription(String(description).trim())
    .setFooter({ text: "🎮 Sistema de Apostas" });

  if (db.config.profileImage && validUrl(db.config.profileImage)) {
    result.setThumbnail(db.config.profileImage);
  }
  return result;
}

function adminCheck(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    db.config.admins.includes(interaction.user.id)
  );
}

function mediatorCheck(interaction) {
  return Boolean(
    db.config.mediatorRoleId &&
    interaction.member?.roles?.cache?.has(db.config.mediatorRoleId)
  );
}

function analystCheck(interaction) {
  return Boolean(
    db.config.analystRoleId &&
    interaction.member?.roles?.cache?.has(db.config.analystRoleId)
  );
}

function streamerCheck(interaction) {
  return Boolean(
    db.config.streamerRoleId &&
    interaction.member?.roles?.cache?.has(db.config.streamerRoleId)
  );
}

async function deny(interaction, text) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ content: text, ephemeral: true }).catch(() => {});
  }
  return interaction.reply({ content: text, ephemeral: true }).catch(() => {});
}

async function requireAdmin(interaction) {
  if (!adminCheck(interaction)) {
    await deny(interaction, "❌ Você precisa ser ADM para usar esta função.");
    return false;
  }
  return true;
}

async function requireMediator(interaction) {
  if (!mediatorCheck(interaction)) {
    await deny(interaction, "❌ Apenas Mediadores podem usar esta função.");
    return false;
  }
  return true;
}

async function requireAnalyst(interaction) {
  if (!analystCheck(interaction)) {
    await deny(interaction, "❌ Apenas Analistas podem usar esta função.");
    return false;
  }
  return true;
}

async function requireStreamer(interaction) {
  if (!streamerCheck(interaction)) {
    await deny(interaction, "❌ Apenas Influencers/Streamers com o cargo configurado podem usar esta função.");
    return false;
  }
  return true;
}

async function getChannel(guild, channelId) {
  if (!channelId) return null;
  return guild.channels.fetch(channelId).catch(() => null);
}

function queueId(format, modality, value, mode) {
  return `${format}:${modality}:${valueId(value)}:${mode}`;
}

function getQueue(format, modality, value, mode) {
  const id = queueId(format, modality, value, mode);
  if (!db.queues[id]) {
    db.queues[id] = {
      id, format, modality, value: Number(value), mode,
      players: [], messageId: null, channelId: null
    };
  }
  return db.queues[id];
}

async function playerSelectOptions(guild, players, emoji) {
  return Promise.all(players.map(async (id) => {
    let member = guild.members.cache.get(id);
    if (!member) member = await guild.members.fetch(id).catch(() => null);
    const name = String(member?.displayName || member?.user?.username || `ID ${id}`)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100);

    return {
      label: name || `ID ${id}`,
      value: id,
      description: "Selecionar este jogador",
      emoji
    };
  }));
}

function queueDescription(queue) {
  const total = requiredPlayers(queue.format);
  const filled = queue.players.length;
  const remaining = Math.max(total - filled, 0);
  const playersText = filled
    ? queue.players.map((id, index) => `**${index + 1}.** <@${id}>`).join("\\n")
    : "_Nenhum jogador._";

  return [
    `🎮 **${queue.format}** • ${modalityName(queue.modality)} • **${money(queue.value)}**`,
    `👥 **Jogadores:** ${filled}/${total}`,
    playersText,
    remaining > 0 ? `⏳ Faltam **${remaining}** jogador${remaining === 1 ? "" : "es"}.` : "🟢 **Fila completa!**"
  ].join("\\n");
}

function queueComponents(queue) {
  if (queue.format === "1x1") {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`queue_join|${queue.id}|gelo_normal`).setLabel("Gelo Normal").setEmoji("🧊").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`queue_join|${queue.id}|gelo_infinito`).setLabel("Gelo Infinito").setEmoji("♾️").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`queue_leave|${queue.id}`).setLabel("Sair").setEmoji("🚪").setStyle(ButtonStyle.Danger)
      )
    ];
  }
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`queue_join|${queue.id}`).setLabel("Entrar").setEmoji("🎮").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`queue_leave|${queue.id}`).setLabel("Sair").setEmoji("🚪").setStyle(ButtonStyle.Danger)
    )
  ];
}

function queueOneVsOneModeComponents(format, modality, value, channelId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`publish_queue|${format}|${modality}|${value}|gelo_normal|${channelId}`).setLabel("Gelo Normal").setEmoji("🧊").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`publish_queue|${format}|${modality}|${value}|gelo_infinito|${channelId}`).setLabel("Gelo Infinito").setEmoji("♾️").setStyle(ButtonStyle.Primary)
    )
  ];
}

function mediatorQueueEmbed() {
  const list = db.mediatorQueue.length
    ? db.mediatorQueue.map((id, index) => `**${index + 1}.** <@${id}>`).join("\\n")
    : "_Nenhum Mediador aguardando._";
  const next = db.mediatorQueue.length > 0
    ? db.mediatorQueue[db.mediatorRotation % db.mediatorQueue.length]
    : null;

  return makeEmbed("👨‍⚖️ FILA DE MEDIADORES", [
    `👥 **Na fila:** ${db.mediatorQueue.length}`,
    list,
    `🎯 **Próximo:** ${next ? `<@${next}>` : "_Nenhum_"}`
  ].join("\\n"));
}

function mediatorQueueComponents() {
  return safeMediatorQueueComponents();
}

function safeMediatorQueueComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("mediator_join").setLabel("Entrar").setEmoji("➕").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("mediator_leave").setLabel("Sair").setEmoji("🚪").setStyle(ButtonStyle.Danger)
    )
  ];
}

async function updateMediatorQueueMessage(guild) {
  const channel = await getChannel(guild, db.config.mediatorQueueChannelId);
  if (!channel || !channel.isTextBased()) return;
  let message = null;
  if (db.config.mediatorQueueMessageId) {
    message = await channel.messages.fetch(db.config.mediatorQueueMessageId).catch(() => null);
  }
  if (!message) {
    message = await channel.send({ embeds: [mediatorQueueEmbed()], components: safeMediatorQueueComponents() });
    db.config.mediatorQueueMessageId = message.id;
  } else {
    await message.edit({ embeds: [mediatorQueueEmbed()], components: safeMediatorQueueComponents() }).catch(() => {});
  }
  saveDatabase();
}

function betEmbed(bet) {
  return makeEmbed("🎮 APOSTA", [
    `🎮 **${bet.format}** • ${modalityName(bet.modality)} • **${money(bet.value)}**`,
    `🧊 **Modo:** ${bet.mode === "gelo_infinito" ? "Gelo Infinito" : "Gelo Normal"}`,
    `👥 **Jogadores:**`,
    bet.players.map((id, index) => `**${index + 1}.** <@${id}>`).join("\\n"),
    `👨‍⚖️ **Mediador:** ${bet.mediatorId ? `<@${bet.mediatorId}>` : "_aguardando_"}`,
    `✅ **Confirmações:** ${bet.confirmedBy.length}/${bet.players.length}`,
    bet.confirmedBy.length === bet.players.length ? "🟢 **Confirmada.**" : "⏳ **Aguardando confirmação.**"
  ].join("\\n"));
}

function betButtons(betId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bet_confirm|${betId}`).setLabel("Confirmar").setEmoji("✅").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`bet_cancel|${betId}`).setLabel("Cancelar").setEmoji("❌").setStyle(ButtonStyle.Danger)
    )
  ];
}

function mediatorPanelComponents(betId) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`med_panel|${betId}`).setPlaceholder("Selecione uma ação")
        .addOptions([
          { label: "Escolher vencedor", value: "winner", emoji: "🏆" },
          { label: "Vitória por W.O.", value: "wo", emoji: "🚫" },
          { label: "Enviar ID e senha", value: "room", emoji: "🎮" },
          { label: "Finalizar aposta", value: "finish", emoji: "🏁" }
        ])
    )
  ];
}

function paymentMessage(bet) {
  const entries = bet.mediatorId && db.pix[bet.mediatorId]
    ? [[bet.mediatorId, db.pix[bet.mediatorId]]]
    : Object.entries(db.pix);
  const amountToPay = Number((Number(bet.value) + Number(db.config.fee || 0)).toFixed(2));

  if (!entries.length) {
    return {
      content: [
        "💳 **PAGAMENTO DA APOSTA**",
        "━━━━━━━━━━━━━━━━━━━━",
        `💰 **Valor:** ${money(amountToPay)}`,
        "",
        "⚠️ **PIX não configurado.**",
        "Um ADM deve cadastrar o Pix em `/cadastro`.",
        "━━━━━━━━━━━━━━━━━━━━"
      ].join("\n")
    };
  }

  const [, pix] = entries[0];
  const content = [
    "💳 **PAGAMENTO DA APOSTA**",
    "━━━━━━━━━━━━━━━━━━━━",
    `💰 **Valor:** ${money(amountToPay)}`,
    `👤 **Titular:** ${pix.name}`,
    `🔑 **Chave PIX:** \`${pix.key}\``,
    pix.qr && validUrl(pix.qr)
      ? `🔗 **Link do QR Code:** ${pix.qr}`
      : "⚠️ **QR Code não cadastrado.**",
    "",
    "📌 **Faça o pagamento e aguarde a orientação do Mediador.**",
    "━━━━━━━━━━━━━━━━━━━━"
  ].join("\n");

  const result = { content };

  // O pagamento fica em mensagem normal. O QR aparece separadamente
  // apenas como imagem, sem colocar os dados de pagamento em embed.
  if (pix.qr && validUrl(pix.qr)) {
    result.embeds = [new EmbedBuilder().setImage(pix.qr).setColor(db.config.embedColor || "#5865F2")];
  }

  return result;
}

async function createPrivateAnalysisChannel(guild, analysis) {
  const category = db.config.streamerCategoryId
    ? await guild.channels.fetch(db.config.streamerCategoryId).catch(() => null)
    : null;

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: analysis.requesterId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    },
    {
      id: analysis.analystId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    }
  ];

  return guild.channels.create({
    name: `analise-${analysis.type.toLowerCase()}-${analysis.id.slice(-6)}`,
    type: ChannelType.GuildText,
    parent: category?.type === ChannelType.GuildCategory ? category.id : undefined,
    permissionOverwrites: overwrites
  });
}

async function createPrivateBetChannel(guild, bet) {
  const category = db.config.betCategoryId
    ? await guild.channels.fetch(db.config.betCategoryId).catch(() => null)
    : null;

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    }
  ];

  // Nenhum Mediador pode ver a aposta apenas por possuir o cargo.
  // Somente o Mediador que foi sorteado para esta aposta recebe acesso
  // individualmente depois que todos os jogadores confirmarem.
  if (db.config.mediatorRoleId) {
    overwrites.push({
      id: db.config.mediatorRoleId,
      deny: [PermissionFlagsBits.ViewChannel]
    });
  }

  for (const userId of bet.players) {
    overwrites.push({
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  const channel = await guild.channels.create({
    name: `aposta-${bet.format}-${valueId(bet.value).replace(".", "-")}`,
    type: ChannelType.GuildText,
    parent:
      category?.type === ChannelType.GuildCategory
        ? category.id
        : undefined,
    permissionOverwrites: overwrites
  });

  return channel;
}

function getNextMediator() {
  if (!db.mediatorQueue.length) return null;

  // Remove duplicados.
  db.mediatorQueue = [...new Set(db.mediatorQueue)];

  if (!db.mediatorQueue.length) return null;

  const index = db.mediatorRotation % db.mediatorQueue.length;
  const mediatorId = db.mediatorQueue[index];

  db.mediatorRotation =
    (index + 1) % db.mediatorQueue.length;

  return mediatorId;
}

async function distributeMediator(bet, guild) {
  const mediatorId = getNextMediator();

  if (!mediatorId) {
    return false;
  }

  bet.mediatorId = mediatorId;

  // O acesso ao canal só é concedido depois das duas confirmações.
  saveDatabase();
  return true;
}

async function createBetFromQueue(interaction, queue) {
  const needed = requiredPlayers(queue.format);

  if (queue.players.length < needed) {
    return null;
  }

  if (!db.mediatorQueue.length) {
    return null;
  }

  const players = queue.players.splice(0, needed);
  const matchMode = queue.mode;

  const id =
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const bet = {
    id,
    guildId: interaction.guild.id,
    channelId: null,
    format: queue.format,
    modality: queue.modality,
    value: queue.value,
    mode: matchMode,
    players,
    mediatorId: null,
    confirmedBy: [],
    status: "waiting_confirmation",
    winnerId: null,
    resultType: null,
    roomId: null,
    roomPassword: null,
    createdAt: Date.now()
  };

  if (queue.format === "1x1") queue.mode = "choice";

  db.bets[id] = bet;

  const hasMediator = await distributeMediator(bet, interaction.guild);

  if (!hasMediator) {
    queue.players.unshift(...players);
    delete db.bets[id];
    return null;
  }

  const channel = await createPrivateBetChannel(interaction.guild, bet);

  bet.channelId = channel.id;

  await channel.send({
    content: players.map(id => `<@${id}>`).join(" "),
    embeds: [betEmbed(bet)],
    components: betButtons(id)
  });

  saveDatabase();

  return bet;
}

/* ========================================================
   FILAS DE STREAMERS / INFLUENCERS
======================================================== */

function streamerQueueEmbed(queue, guild) {
  const streamerMention = `<@${queue.streamerId}>`;
  const waiting = queue.players?.length
    ? queue.players.map((id, index) => `**${index + 1}.** <@${id}>`).join("\n")
    : "_Ninguém aguardando._";

  const active = queue.activeMatchId && db.streamerMatches?.[queue.activeMatchId]
    ? "🟢 **Em atendimento:** 1 jogador"
    : "🟢 **Disponível:** aguardando jogador";

  return makeEmbed(`🎥 FILA DO ${guild?.members?.cache?.get(queue.streamerId)?.displayName || "INFLUENCER"}`, [
    `👑 **Influencer:** ${streamerMention}`,
    `🎮 **Formato:** ${queue.format}`,
    `💰 **Valor:** ${money(queue.value)}`,
    "",
    `📜 **Regras / descrição:**\n${queue.description || "_Nenhuma regra informada._"}`,
    "",
    active,
    `👥 **Aguardando:** ${queue.players?.length || 0}`,
    waiting
  ].join("\n"));
}

function streamerQueueComponents(queue) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`streamer_join|${queue.id}`)
        .setLabel("Entrar na fila")
        .setEmoji("🎮")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`streamer_leave|${queue.id}`)
        .setLabel("Sair da fila")
        .setEmoji("🚪")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

async function refreshStreamerQueueMessage(queue, guild) {
  if (!queue.channelId || !queue.messageId) return;
  const channel = await guild.channels.fetch(queue.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;
  const message = await channel.messages.fetch(queue.messageId).catch(() => null);
  if (!message) return;
  await message.edit({
    embeds: [streamerQueueEmbed(queue, guild)],
    components: streamerQueueComponents(queue)
  }).catch(() => {});
}

async function createStreamerMatchChannel(guild, queue, playerId) {
  const streamerMember = await guild.members.fetch(queue.streamerId).catch(() => null);
  if (!streamerMember) return null;

  // A sala privada do Influencer usa EXCLUSIVAMENTE a categoria configurada
  // para Streamer. O acesso fica restrito ao Influencer e ao jogador chamado.
  const category = db.config.streamerCategoryId
    ? await guild.channels.fetch(db.config.streamerCategoryId).catch(() => null)
    : null;

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    },
    {
      id: queue.streamerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    },
    {
      id: playerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];

  return guild.channels.create({
    name: `streamer-${valueId(queue.value).replace(".", "-")}`,
    type: ChannelType.GuildText,
    parent: category?.type === ChannelType.GuildCategory ? category.id : undefined,
    permissionOverwrites: overwrites
  });
}

async function startNextStreamerMatch(queue, guild) {
  if (queue.activeMatchId) return null;
  if (!queue.players?.length) {
    await refreshStreamerQueueMessage(queue, guild);
    saveDatabase();
    return null;
  }

  const playerId = queue.players.shift();
  const channel = await createStreamerMatchChannel(guild, queue, playerId);

  if (!channel) {
    queue.players.unshift(playerId);
    await refreshStreamerQueueMessage(queue, guild);
    saveDatabase();
    return null;
  }

  const matchId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const match = {
    id: matchId,
    guildId: guild.id,
    queueId: queue.id,
    streamerId: queue.streamerId,
    playerId,
    channelId: channel.id,
    format: queue.format,
    value: queue.value,
    createdAt: Date.now(),
    status: "active"
  };

  db.streamerMatches[matchId] = match;
  queue.activeMatchId = matchId;

  await channel.send({
    content: `<@${queue.streamerId}> <@${playerId}>`,
    embeds: [
      makeEmbed("🎥 APOSTA COM INFLUENCER", [
        `👑 **Influencer:** <@${queue.streamerId}>`,
        `🎮 **Jogador:** <@${playerId}>`,
        `🎯 **Formato:** ${queue.format}`,
        `💰 **Valor:** ${money(queue.value)}`,
        "",
        `📜 **Regras:**\n${queue.description || "_Nenhuma regra informada._"}`,
        "",
        "👑 O Influencer é o responsável por gerenciar esta aposta.",
        "🏁 Para finalizar, o Influencer deve usar **`.f`** neste canal."
      ].join("\n"))
    ]
  }).catch(() => {});

  saveDatabase();
  await refreshStreamerQueueMessage(queue, guild);
  return match;
}

async function finishStreamerMatch(message, match) {
  const queue = db.streamerQueues?.[match.queueId];
  if (!queue) {
    delete db.streamerMatches[match.id];
    saveDatabase();
    return;
  }

  match.status = "finished";
  delete db.streamerMatches[match.id];
  queue.activeMatchId = null;
  saveDatabase();

  await message.reply({
    embeds: [makeEmbed("🏁 APOSTA FINALIZADA", [
      "A aposta com o Influencer foi finalizada.",
      "",
      `👑 **Influencer:** <@${match.streamerId}>`,
      `🎮 **Jogador:** <@${match.playerId}>`,
      `💰 **Valor:** ${money(match.value)}`,
      "",
      "⏭️ O próximo jogador da fila será chamado automaticamente."
    ].join("\n"))]
  }).catch(() => {});

  const guild = message.guild;
  setTimeout(async () => {
    await guild.channels.delete(match.channelId, "Aposta com Influencer finalizada").catch(() => {});
    await startNextStreamerMatch(queue, guild);
  }, 3000);
}

/* ========================================================
   CONFIGURAÇÃO
======================================================== */

function configButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_roles")
        .setLabel("Cargos")
        .setEmoji("👥")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_admins")
        .setLabel("Administradores")
        .setEmoji("👑")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_fee")
        .setLabel("Taxa")
        .setEmoji("💰")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_appearance")
        .setLabel("Aparência")
        .setEmoji("🎨")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_channels")
        .setLabel("Canais")
        .setEmoji("📢")
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_category")
        .setLabel("Categoria")
        .setEmoji("📁")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_streamer_category")
        .setLabel("Categoria Streamer")
        .setEmoji("🎥")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_mediator_queue")
        .setLabel("Publicar fila de Mediadores")
        .setEmoji("👨‍⚖️")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_view")
        .setLabel("Ver configuração")
        .setEmoji("🔎")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_save")
        .setLabel("Salvar")
        .setEmoji("💾")
        .setStyle(ButtonStyle.Success)
    )
  ];
}

/* ========================================================
   COMANDOS SLASH
======================================================== */

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("config")
      .setDescription("Configura o sistema do bot.")
      .setDefaultMemberPermissions(null),

    new SlashCommandBuilder()
      .setName("fila")
      .setDescription("Cria e publica as filas de apostas.")
      .setDefaultMemberPermissions(null)
      .addSubcommand(subcommand =>
        subcommand
          .setName("streamer")
          .setDescription("Cria uma fila exclusiva para um Influencer/Streamer.")
      ),

    new SlashCommandBuilder()
      .setName("cadastro")
      .setDescription("Cadastra os dados Pix de um usuário.")
      .setDefaultMemberPermissions(null)
      .addUserOption(option =>
        option
          .setName("usuario")
          .setDescription("Usuário que receberá o cadastro Pix.")
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("embeds")
      .setDescription("Cria e envia uma embed personalizada no canal atual.")
      .setDefaultMemberPermissions(null)
  ].map(command => command.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);

  await rest.put(route, { body: commands });
}

/* ========================================================
   CLIENT
======================================================== */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Channel,
    Partials.Message
  ]
});

/* ========================================================
   READY
======================================================== */

client.once("ready", async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);

  try {
    await registerCommands();
    console.log("✅ Comandos registrados.");
  } catch (error) {
    console.error("❌ Falha ao registrar comandos:", error);
  }
});

/* ========================================================
   PREFIXADOS
======================================================== */

async function processAnalysis(message, type) {
  const channelId =
    type === "Mobile"
      ? db.config.ssmobChannelId
      : db.config.ssemuChannelId;

  if (!channelId) {
    await message.reply(
      "❌ O canal desta análise ainda não foi configurado no `/config`."
    ).catch(() => {});
    return;
  }

  const channel = await getChannel(message.guild, channelId);

  if (!channel || !channel.isTextBased()) {
    await message.reply("❌ O canal configurado é inválido.").catch(() => {});
    return;
  }

  const id =
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  db.analyses[id] = {
    id,
    guildId: message.guild.id,
    requesterId: message.author.id,
    type,
    analystId: null,
    status: "pending",
    createdAt: Date.now()
  };

  await channel.send({
    embeds: [
      makeEmbed(
        "🔎 SOLICITAÇÃO DE ANÁLISE",
        [
          "**Nova solicitação aguardando atendimento.**",
          "",
          `📱 **Modalidade:** ${type}`,
          `👤 **Solicitante:** <@${message.author.id}>`,
          "",
          "⏳ **Status:** Aguardando Analista",
          "_Um Analista pode assumir esta solicitação abaixo._"
        ].join("\n")
      )
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`analysis_take|${id}`)
          .setLabel("Assumir análise")
          .setEmoji("🔎")
          .setStyle(ButtonStyle.Success)
      )
    ]
  });

  saveDatabase();

  await message.reply(
    `✅ Sua solicitação de análise **${type}** foi enviada.`
  ).catch(() => {});
}

client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  try {
    const command = message.content.trim().toLowerCase();

    if (command === ".ssmob") {
      await processAnalysis(message, "Mobile");
    }

    if (command === ".ssemu") {
      await processAnalysis(message, "Emulador");
    }

    if (command === ".f") {
      const match = Object.values(db.streamerMatches || {}).find(
        item =>
          item.guildId === message.guild.id &&
          item.channelId === message.channel.id &&
          item.status === "active"
      );

      if (!match) {
        return message.reply("❌ Este comando só pode ser usado no canal privado de uma aposta com Influencer.");
      }

      if (match.streamerId !== message.author.id || !streamerCheck({ member: message.member })) {
        return message.reply("❌ Apenas o Influencer responsável por esta aposta pode usar `.f`.");
      }

      await finishStreamerMatch(message, match);
      return;
    }

    if (command === ".med") {
      const bet = Object.values(db.bets).find(
        item =>
          item.guildId === message.guild.id &&
          item.channelId === message.channel.id &&
          item.status !== "finished"
      );

      if (!bet) {
        return message.reply("❌ Este comando só pode ser usado no canal privado de uma aposta.");
      }

      if (!(await requireMediator({
        member: message.member,
        user: message.author,
        guild: message.guild,
        reply: options => message.reply(options)
      }))) {
        return;
      }

      if (bet.mediatorId && bet.mediatorId !== message.author.id) {
        return message.reply("❌ Você não é o Mediador responsável por esta aposta.");
      }

      if (bet.confirmedBy.length < bet.players.length) {
        return message.reply("🔒 O painel do Mediador será liberado somente após os 2 jogadores confirmarem.");
      }

      return message.reply({
        embeds: [
          makeEmbed(
            "👨‍⚖️ PAINEL DO MEDIADOR",
            [
              "**Central de controle desta aposta.**",
              "",
              `🎮 **Formato:** ${bet.format}`,
              `📱 **Modalidade:** ${modalityName(bet.modality)}`,
              `💰 **Valor:** ${money(bet.value)}`,
              `🏆 **Prêmio:** ${money(bet.value * 2)}`,
              "",
              "🛠️ **Ações disponíveis**",
              "Escolha uma opção no menu abaixo para administrar a partida."
            ].join("\n")
          )
        ],
        components: mediatorPanelComponents(bet.id)
      });
    }
    if (command === ".p") {
      const stats = userStats(message.author.id);

      return message.reply({
        embeds: [
          makeEmbed(
            `📊 ESTATÍSTICAS — ${message.author.username}`,
            [
              "**DESEMPENHO**",
              "",
              `🏆 **Vitórias:** ${stats.wins}`,
              `💔 **Derrotas:** ${stats.losses}`,
              `🚫 **Vitórias por W.O.:** ${stats.woWins}`,
              `🪙 **Coins:** ${stats.coins}`
            ].join("\n")
          )
        ]
      });
    }

  } catch (error) {
    console.error("❌ Erro no comando prefixado:", error);
  }
});

/* ========================================================
   INTERAÇÕES
======================================================== */

client.on("interactionCreate", async interaction => {
  try {
    /* ----------------------------------------------------
       CHAT INPUT
    ---------------------------------------------------- */

    if (interaction.isChatInputCommand()) {
      /* /config */
      if (interaction.commandName === "config") {
        return interaction.reply({
          embeds: [configEmbed()],
          components: configButtons(),
          ephemeral: true
        });
      }

      /* /embeds */
      if (interaction.commandName === "embeds") {
        if (!(await requireAdmin(interaction))) return;

        const modal = new ModalBuilder()
          .setCustomId("embed_builder")
          .setTitle("Criar Embed");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("embed_title")
              .setLabel("Título")
              .setPlaceholder("Título da embed")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(256)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("embed_description")
              .setLabel("Descrição")
              .setPlaceholder("Digite o conteúdo da embed")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(4000)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("embed_color")
              .setLabel("Cor HEX (opcional)")
              .setPlaceholder("#5865F2")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(7)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("embed_image")
              .setLabel("Imagem (URL, opcional)")
              .setPlaceholder("https://...")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(500)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("embed_footer")
              .setLabel("Rodapé (opcional)")
              .setPlaceholder("Texto do rodapé")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(2048)
          )
        );

        return interaction.showModal(modal);
      }

      /* /cadastro */
      if (interaction.commandName === "cadastro") {
        const user = interaction.options.getUser("usuario");

        const modal = new ModalBuilder()
          .setCustomId(`pix_register|${user.id}`)
          .setTitle("Cadastro Pix");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pix_name")
              .setLabel("Nome")
              .setPlaceholder("Nome do titular do Pix")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pix_key")
              .setLabel("Chave Pix")
              .setPlaceholder("Digite a chave Pix")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(200)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pix_qr")
              .setLabel("QR Code")
              .setPlaceholder("URL da imagem do QR Code")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(500)
          )
        );

        return interaction.showModal(modal);
      }

      /* /fila */
      if (interaction.commandName === "fila") {
        const subcommand = interaction.options.getSubcommand(false);

        if (subcommand === "streamer") {
          if (!(await requireStreamer(interaction))) return;

          if (!db.config.streamerRoleId) {
            return deny(interaction, "❌ O cargo de Influencer / Streamer ainda não foi configurado no `/config`.");
          }

          const modal = new ModalBuilder()
            .setCustomId("streamer_queue_create")
            .setTitle("Criar fila de Streamer");

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("streamer_value")
                .setLabel("Valor da aposta")
                .setPlaceholder("Ex.: 5 ou 5,00")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("streamer_format")
                .setLabel("Formato")
                .setPlaceholder("Ex.: 1x1, 2x2, 3x3 ou 4x4")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(10)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("streamer_description")
                .setLabel("Descrição / regras")
                .setPlaceholder("Digite as regras da fila e informações da aposta...")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000)
            )
          );

          return interaction.showModal(modal);
        }

        filaSetup.set(interaction.user.id, {
          format: null,
          modality: null,
          channelId: null
        });

        return interaction.reply({
          content: "🎯 **Configuração da fila**\n\nEscolha somente o **formato**, a **modalidade** e o **canal onde todas as filas serão publicadas**.",
          components: [
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId("fila_setup_format")
                .setPlaceholder("1️⃣ Escolha o formato")
                .addOptions(FORMATS.map(format => ({
                  label: format,
                  value: format,
                  description: "Fila para 2 jogadores"
                })))
            ),
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId("fila_setup_modality")
                .setPlaceholder("2️⃣ Escolha a modalidade")
                .addOptions(MODALITIES.map(modality => ({
                  label: modalityName(modality),
                  value: modality
                })))
            ),
            new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId("fila_setup_channel")
                .setPlaceholder("3️⃣ Escolha o canal de publicação")
                .setChannelTypes(ChannelType.GuildText)
            )
          ],
          ephemeral: true
        });
      }




    }

    /* ----------------------------------------------------
       BOTÕES
    ---------------------------------------------------- */

    if (interaction.isButton()) {
      const [action, ...parts] = interaction.customId.split("|");

      /* CONFIG */
      if (action === "config_roles") {
        if (!(await requireAdmin(interaction))) return;

        return interaction.reply({
          content: "👥 Selecione os cargos que serão usados pelo bot:",
          components: [
            new ActionRowBuilder().addComponents(
              new RoleSelectMenuBuilder()
                .setCustomId("set_mediator_role")
                .setPlaceholder("Selecionar cargo Mediador")
            ),
            new ActionRowBuilder().addComponents(
              new RoleSelectMenuBuilder()
                .setCustomId("set_analyst_role")
                .setPlaceholder("Selecionar cargo Analista")
            )
            ,
            new ActionRowBuilder().addComponents(
              new RoleSelectMenuBuilder()
                .setCustomId("set_streamer_role")
                .setPlaceholder("Selecionar cargo Influencer / Streamer")
            )
          ],
          ephemeral: true
        });
      }

      if (action === "config_admins") {
        if (!(await requireAdmin(interaction))) return;

        return interaction.reply({
          embeds: [
            makeEmbed(
              "👑 ADMINISTRADORES",
              [
                `**Administradores cadastrados:** ${db.config.admins.length}/20`,
                "",
                db.config.admins.length
                  ? db.config.admins
                      .map((id, i) => `**${i + 1}.** <@${id}>`)
                      .join("\n")
                  : "_Nenhum ADM cadastrado._"
              ].join("\n")
            )
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("admin_add")
                .setLabel("Cadastrar ADM")
                .setEmoji("➕")
                .setStyle(ButtonStyle.Success),

              new ButtonBuilder()
                .setCustomId("admin_remove")
                .setLabel("Remover ADM")
                .setEmoji("➖")
                .setStyle(ButtonStyle.Danger)
            )
          ],
          ephemeral: true
        });
      }

      if (action === "config_fee") {
        if (!(await requireAdmin(interaction))) return;

        const modal = new ModalBuilder()
          .setCustomId("fee_modal")
          .setTitle("Configurar taxa");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("fee")
              .setLabel("Taxa de R$0,01 até R$0,50")
              .setPlaceholder("Ex.: 0,25")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      if (action === "config_appearance") {
        if (!(await requireAdmin(interaction))) return;

        const modal = new ModalBuilder()
          .setCustomId("appearance_modal")
          .setTitle("Aparência das embeds");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("color")
              .setLabel("Cor HEX")
              .setPlaceholder("#5865F2")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("image")
              .setLabel("Foto de perfil — URL")
              .setPlaceholder("https://...")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        );

        return interaction.showModal(modal);
      }

      if (action === "config_channels") {
        if (!(await requireAdmin(interaction))) return;

        return interaction.reply({
          content: "📢 Configure os canais individualmente:",
          components: [
            new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId("channel_ssmob")
                .setPlaceholder("Canal das solicitações .ssmob")
                .setChannelTypes(ChannelType.GuildText)
            ),
            new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId("channel_ssemu")
                .setPlaceholder("Canal das solicitações .ssemu")
                .setChannelTypes(ChannelType.GuildText)
            ),
            new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId("channel_mediator_queue")
                .setPlaceholder("Canal da fila de Mediadores")
                .setChannelTypes(ChannelType.GuildText)
            )
          ],
          ephemeral: true
        });
      }

      if (action === "config_category") {
        if (!(await requireAdmin(interaction))) return;

        return interaction.reply({
          content: "📁 Selecione a categoria das apostas:",
          components: [
            new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId("bet_category")
                .setPlaceholder("Selecionar categoria")
                .setChannelTypes(ChannelType.GuildCategory)
            )
          ],
          ephemeral: true
        });
      }

      if (action === "config_streamer_category") {
        if (!(await requireAdmin(interaction))) return;

        return interaction.reply({
          content: "🎥 Selecione a categoria onde serão criados os canais das filas de Streamer:",
          components: [
            new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId("streamer_category")
                .setPlaceholder("Selecionar categoria Streamer")
                .setChannelTypes(ChannelType.GuildCategory)
            )
          ],
          ephemeral: true
        });
      }

      if (action === "config_mediator_queue") {
        if (!(await requireAdmin(interaction))) return;

        if (!db.config.mediatorQueueChannelId) {
          return deny(
            interaction,
            "❌ Primeiro configure o canal da fila de Mediadores."
          );
        }

        await updateMediatorQueueMessage(interaction.guild);

        return interaction.reply({
          content: "✅ Fila de Mediadores publicada/atualizada.",
          ephemeral: true
        });
      }

      if (action === "config_view") {
        if (!(await requireAdmin(interaction))) return;

        return interaction.reply({
          embeds: [configEmbed()],
          ephemeral: true
        });
      }

      if (action === "config_save") {
        if (!(await requireAdmin(interaction))) return;

        saveDatabase();

        return interaction.reply({
          content: "✅ Configuração salva.",
          ephemeral: true
        });
      }

      /* ADMIN */
      if (action === "admin_add") {
        if (!(await requireAdmin(interaction))) return;

        if (db.config.admins.length >= 20) {
          return deny(
            interaction,
            "❌ Limite atingido: no máximo 20 ADMs."
          );
        }

        const modal = new ModalBuilder()
          .setCustomId("admin_add_modal")
          .setTitle("Cadastrar ADM");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("user_id")
              .setLabel("ID do usuário")
              .setPlaceholder("Ex.: 123456789012345678")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      if (action === "admin_remove") {
        if (!(await requireAdmin(interaction))) return;

        const modal = new ModalBuilder()
          .setCustomId("admin_remove_modal")
          .setTitle("Remover ADM");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("user_id")
              .setLabel("ID do usuário")
              .setPlaceholder("ID Discord")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      /* FILA DE STREAMER */
      if (action === "streamer_join") {
        await interaction.deferReply({ ephemeral: true });
        const queue = db.streamerQueues?.[parts[0]];

        if (!queue) return deny(interaction, "❌ Esta fila de Streamer não existe mais.");
        if (interaction.user.id === queue.streamerId) return deny(interaction, "❌ O Influencer não pode entrar na própria fila.");
        if (queue.players.includes(interaction.user.id)) return deny(interaction, "❌ Você já está nessa fila.");

        const alreadyInStreamerQueue = Object.values(db.streamerQueues).some(
          q => q.guildId === interaction.guild.id && q.players?.includes(interaction.user.id)
        );
        if (alreadyInStreamerQueue) return deny(interaction, "❌ Você já está em uma fila de Streamer.");

        const activeMatch = queue.activeMatchId ? db.streamerMatches?.[queue.activeMatchId] : null;
        queue.players.push(interaction.user.id);

        if (!activeMatch) {
          const match = await startNextStreamerMatch(queue, interaction.guild);
          if (!match) {
            queue.players = queue.players.filter(id => id !== interaction.user.id);
            saveDatabase();
            await refreshStreamerQueueMessage(queue, interaction.guild);
            return interaction.editReply({ content: "❌ Não foi possível iniciar o atendimento agora." });
          }

          return interaction.editReply({
            content: `✅ Você foi chamado para jogar com o Influencer. Canal privado: <#${match.channelId}>`
          });
        }

        saveDatabase();
        await refreshStreamerQueueMessage(queue, interaction.guild);
        return interaction.editReply({
          content: `✅ Você entrou na fila. Há **${queue.players.length}** jogador${queue.players.length === 1 ? "" : "es"} aguardando.`
        });
      }

      if (action === "streamer_leave") {
        const queue = db.streamerQueues?.[parts[0]];
        if (!queue) return deny(interaction, "❌ Esta fila de Streamer não existe.");

        queue.players = queue.players.filter(id => id !== interaction.user.id);
        saveDatabase();
        await refreshStreamerQueueMessage(queue, interaction.guild);

        return interaction.reply({
          content: "✅ Você saiu da fila de Streamer.",
          ephemeral: true
        });
      }

      /* FILA */
      if (action === "queue_join") {
        await interaction.deferReply({ ephemeral: true });
        const queue = db.queues[parts[0]];
        const selectedMode = parts[1] || null;

        if (!queue) {
          return deny(interaction, "❌ Esta fila não existe mais.");
        }

        if (queue.players.includes(interaction.user.id)) {
          return deny(interaction, "❌ Você já está nessa fila.");
        }

        const occupiedElsewhere = Object.values(db.queues).some(
          q =>
            q.guildId === interaction.guild.id &&
            q.players?.includes(interaction.user.id) &&
            q.id !== queue.id
        );

        if (occupiedElsewhere) {
          return deny(
            interaction,
            "❌ Você já está em outra fila. Saia dela primeiro."
          );
        }

        if (queue.format === "1x1") {
          if (!["gelo_normal", "gelo_infinito"].includes(selectedMode)) {
            return deny(interaction, "❌ Escolha Gelo Normal ou Gelo Infinito.");
          }

          if (queue.players.length > 0 && queue.mode !== selectedMode) {
            return deny(
              interaction,
              `❌ Esta fila já está configurada para **${queue.mode === "gelo_infinito" ? "Gelo Infinito" : "Gelo Normal"}**. Escolha o mesmo modo do primeiro jogador.`
            );
          }

          queue.mode = selectedMode;
        }

        queue.players.push(interaction.user.id);

        if (
          queue.players.length >= requiredPlayers(queue.format) &&
          db.mediatorQueue.length === 0
        ) {
          queue.players.pop();
          saveDatabase();
          await refreshQueueMessage(queue, interaction.guild);
          return interaction.editReply({
            content: "❌ Não há Mediador disponível no momento. A aposta não pode ser puxada.",
            components: []
          });
        }

        const bet =
          queue.players.length >= requiredPlayers(queue.format)
            ? await createBetFromQueue(interaction, queue)
            : null;

        saveDatabase();

        if (bet) {
          return interaction.editReply({
            content:
              `🎮 Aposta criada em ${bet.channelId ? `<#${bet.channelId}>` : "canal privado"}.`,
            ephemeral: true
          });
        }

        await refreshQueueMessage(queue, interaction.guild);

        await interaction.editReply({
          content:
            `✅ Você entrou na fila **${queue.format} ${modalityName(queue.modality)}** por **${money(queue.value)}**.`,
          components: []
        });

        return;
      }

      if (action === "queue_leave") {
        const queue = db.queues[parts[0]];

        if (!queue) {
          return deny(interaction, "❌ Esta fila não existe.");
        }

        const oldLength = queue.players.length;

        queue.players = queue.players.filter(
          id => id !== interaction.user.id
        );

        saveDatabase();
        await refreshQueueMessage(queue, interaction.guild);

        return interaction.reply({
          content:
            queue.players.length < oldLength
              ? "✅ Você saiu da fila."
              : "❌ Você não estava nessa fila.",
          ephemeral: true
        });
      }

      /* FILA MEDIADORES */
      if (action === "mediator_join") {
        if (!(await requireMediator(interaction))) return;

        if (!db.mediatorQueue.includes(interaction.user.id)) {
          db.mediatorQueue.push(interaction.user.id);
        }

        saveDatabase();
        await updateMediatorQueueMessage(interaction.guild);

        return interaction.reply({
          content: "✅ Você entrou na fila de Mediadores.",
          ephemeral: true
        });
      }

      if (action === "mediator_leave") {
        if (!(await requireMediator(interaction))) return;

        db.mediatorQueue = db.mediatorQueue.filter(
          id => id !== interaction.user.id
        );

        if (db.mediatorQueue.length === 0) {
          db.mediatorRotation = 0;
        } else {
          db.mediatorRotation %= db.mediatorQueue.length;
        }

        saveDatabase();
        await updateMediatorQueueMessage(interaction.guild);

        return interaction.reply({
          content: "✅ Você saiu da fila de Mediadores.",
          ephemeral: true
        });
      }

      /* ANÁLISE */
      if (action === "analysis_take") {
        if (!(await requireAnalyst(interaction))) return;

        const analysis = db.analyses[parts[0]];

        if (!analysis) {
          return deny(interaction, "❌ Solicitação não encontrada.");
        }

        if (analysis.status !== "pending") {
          return deny(
            interaction,
            "❌ Essa solicitação já foi assumida."
          );
        }

        analysis.analystId = interaction.user.id;

        // A solicitação já está no canal privado configurado.
        // Não crie outro canal: apenas adicione o Analista que assumiu.
        const privateChannel = interaction.channel;

        if (!privateChannel || !privateChannel.isTextBased()) {
          analysis.analystId = null;
          return deny(interaction, "❌ O canal privado da análise é inválido.");
        }

        try {
          await privateChannel.permissionOverwrites.edit(analysis.analystId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            ManageMessages: true
          });
        } catch (error) {
          analysis.analystId = null;
          console.error("❌ Não foi possível adicionar o Analista ao canal privado:", error);
          return deny(
            interaction,
            "❌ Não foi possível adicionar o Analista ao canal privado. Verifique as permissões do bot."
          );
        }

        analysis.channelId = privateChannel.id;
        analysis.status = "assigned";

        await privateChannel.send({
          content: `<@${analysis.requesterId}> <@${analysis.analystId}>`,
          embeds: [
            makeEmbed(
              "🔎 ANÁLISE EM ATENDIMENTO",
              [
                `📱 **Modalidade:** ${analysis.type}`,
                `👤 **Solicitante:** <@${analysis.requesterId}>`,
                `🔎 **Analista:** <@${analysis.analystId}>`,
                "",
                "🟢 **Status:** Em atendimento",
                "💬 Este é o canal privado para tratar a análise."
              ].join("\n")
            )
          ]
        }).catch(() => {});

        saveDatabase();

        return interaction.update({
          embeds: [
            makeEmbed(
              "🔎 ANÁLISE ASSUMIDA",
              [
                "**Solicitação assumida com sucesso.**",
                "",
                `📱 **Modalidade:** ${analysis.type}`,
                `👤 **Solicitante:** <@${analysis.requesterId}>`,
                `🔎 **Analista responsável:** <@${interaction.user.id}>`,
                `🔒 **Canal privado:** ${privateChannel}`,
                "",
                "🟢 **Status:** Em atendimento"
              ].join("\n")
            )
          ],
          components: []
        });
      }

      /* APOSTA */
      if (action === "bet_confirm") {
        const bet = db.bets[parts[0]];
        if (!bet) return deny(interaction, "❌ Aposta não encontrada.");
        if (!bet.players.includes(interaction.user.id)) {
          return deny(interaction, "❌ Você não participa desta aposta.");
        }
        if (bet.status !== "waiting_confirmation") {
          return deny(interaction, "❌ Esta aposta não está mais aguardando confirmações.");
        }

        await interaction.deferReply({ ephemeral: true });
        if (!bet.confirmedBy.includes(interaction.user.id)) {
          bet.confirmedBy.push(interaction.user.id);
        }
        saveDatabase();

        await interaction.message.edit({
          embeds: [betEmbed(bet)],
          components: bet.confirmedBy.length < bet.players.length ? betButtons(bet.id) : []
        }).catch(() => {});

        // Confirmação individual: aviso visual em verde no canal, sem remover o painel.
        const confirmationEmbed = makeEmbed(
          "✅ APOSTA CONFIRMADA",
          [
            `👤 **Jogador:** <@${interaction.user.id}>`,
            "",
            `🟢 **Confirmou a aposta com sucesso.**`,
            `📋 **Confirmações:** ${bet.confirmedBy.length}/${bet.players.length}`
          ].join("\n")
        ).setColor("#57F287");

        await interaction.channel.send({ embeds: [confirmationEmbed] }).catch(() => {});

        if (bet.confirmedBy.length < bet.players.length) {
          return interaction.editReply({
            content: `✅ Você confirmou a aposta. ${bet.confirmedBy.length}/${bet.players.length} jogadores confirmaram.`,
            components: []
          });
        }

        bet.status = "payment";

        if (bet.mediatorId && bet.channelId) {
          const channel = await interaction.guild.channels.fetch(bet.channelId).catch(() => null);
          if (channel) {
            await channel.permissionOverwrites.edit(bet.mediatorId, {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true,
              ManageChannels: true
            }).catch(() => {});
          }
        }

        // PIX é enviado como nova mensagem, preservando o painel de confirmação.
        await interaction.channel.send(paymentMessage(bet)).catch(() => {});

        if (bet.mediatorId) {
          await interaction.channel.send({
            content: `<@${bet.mediatorId}>`,
            embeds: [makeEmbed("👨‍⚖️ MEDIADOR LIBERADO", "Os dois jogadores confirmaram. Seu acesso à aposta foi liberado. Use **.med** neste canal para abrir o painel de controle.")]
          }).catch(() => {});
        }

        saveDatabase();
        return interaction.editReply({
          content: "✅ Todos os jogadores confirmaram. Pagamento liberado e acesso do Mediador concedido.",
          components: []
        });
      }

      if (action === "bet_cancel") {
        const bet = db.bets[parts[0]];

        if (!bet) {
          return deny(interaction, "❌ Aposta não encontrada.");
        }

        const allowed =
          bet.players.includes(interaction.user.id) ||
          mediatorCheck(interaction);

        if (!allowed) {
          return deny(
            interaction,
            "❌ Você não pode cancelar esta aposta."
          );
        }

        bet.status = "cancelled";
        saveDatabase();

        await interaction.reply(
          "❌ Aposta cancelada. Este canal será excluído em 5 segundos."
        );

        setTimeout(() => {
          interaction.channel?.delete("Aposta cancelada").catch(() => {});
        }, 5000);

        return;
      }

      /* MEDIADOR */
      if (action === "med_winner") {
        if (!(await requireMediator(interaction))) return;

        const bet = db.bets[parts[0]];

        if (!bet) {
          return deny(interaction, "❌ Aposta não encontrada.");
        }

        if (bet.mediatorId && bet.mediatorId !== interaction.user.id) {
          return deny(
            interaction,
            "❌ Você não é o Mediador responsável por esta aposta."
          );
        }

        if (bet.confirmedBy.length < bet.players.length) return deny(interaction, "🔒 Aguarde os 2 jogadores confirmarem.");
        return interaction.reply({
          content: "🏆 Selecione um dos 2 jogadores:",
          components: [new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId(`result_normal|${bet.id}`).setPlaceholder("Escolher vencedor")
              .addOptions(await playerSelectOptions(interaction.guild, bet.players, "🏆"))
          )], ephemeral: true
        });
      }

      if (action === "med_wo") {
        if (!(await requireMediator(interaction))) return;

        const bet = db.bets[parts[0]];

        if (!bet) {
          return deny(interaction, "❌ Aposta não encontrada.");
        }

        if (bet.mediatorId && bet.mediatorId !== interaction.user.id) {
          return deny(
            interaction,
            "❌ Você não é o Mediador responsável por esta aposta."
          );
        }

        if (bet.confirmedBy.length < bet.players.length) return deny(interaction, "🔒 Aguarde os 2 jogadores confirmarem.");
        return interaction.reply({
          content: "🚫 Selecione um dos 2 jogadores:",
          components: [new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId(`result_wo|${bet.id}`).setPlaceholder("Escolher vencedor por W.O.")
              .addOptions(await playerSelectOptions(interaction.guild, bet.players, "🚫"))
          )], ephemeral: true
        });
      }

      if (action === "med_finish") {
        if (!(await requireMediator(interaction))) return;

        const bet = db.bets[parts[0]];

        if (!bet) {
          return deny(interaction, "❌ Aposta não encontrada.");
        }

        if (bet.mediatorId && bet.mediatorId !== interaction.user.id) {
          return deny(
            interaction,
            "❌ Você não é o Mediador responsável."
          );
        }

        if (bet.confirmedBy.length < bet.players.length) return deny(interaction, "🔒 Aguarde os 2 jogadores confirmarem.");
        bet.status = "finished";
        saveDatabase();

        await interaction.reply({
          embeds: [
            makeEmbed(
              "🏁 APOSTA FINALIZADA",
              "A aposta foi finalizada pelo Mediador."
            )
          ]
        });

        setTimeout(() => {
          interaction.channel?.delete("Aposta finalizada").catch(() => {});
        }, 5000);

        return;
      }

      if (action === "room_credentials") {
        if (!(await requireMediator(interaction))) return;

        const bet = db.bets[parts[0]];

        if (!bet) {
          return deny(interaction, "❌ Aposta não encontrada.");
        }

        if (bet.mediatorId && bet.mediatorId !== interaction.user.id) {
          return deny(
            interaction,
            "❌ Você não é o Mediador responsável."
          );
        }

        if (bet.confirmedBy.length < bet.players.length) return deny(interaction, "🔒 Aguarde os 2 jogadores confirmarem.");

        const modal = new ModalBuilder()
          .setCustomId(`room_modal|${bet.id}`)
          .setTitle("Sala Free Fire");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("room_id")
              .setLabel("ID da sala")
              .setPlaceholder("ID")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("room_password")
              .setLabel("Senha da sala")
              .setPlaceholder("Senha")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      if (action === "room_copy_id" || action === "room_copy_password") {
        const bet = db.bets[parts[0]];

        if (!bet) {
          return deny(interaction, "❌ Aposta não encontrada.");
        }

        const value =
          action === "room_copy_id"
            ? bet.roomId
            : bet.roomPassword;

        if (!value) {
          return deny(
            interaction,
            "❌ Esse dado ainda não foi enviado."
          );
        }

        return interaction.reply({
          content: `\`${value}\``,
          ephemeral: true
        });
      }

      return;
    }

    /* ----------------------------------------------------
       MENUS DE CARGOS
    ---------------------------------------------------- */

    if (interaction.isRoleSelectMenu()) {
      if (!(await requireAdmin(interaction))) return;

      const roleId = interaction.values[0];

      if (interaction.customId === "set_mediator_role") {
        db.config.mediatorRoleId = roleId;
      }

      if (interaction.customId === "set_analyst_role") {
        db.config.analystRoleId = roleId;
      }

      if (interaction.customId === "set_streamer_role") {
        db.config.streamerRoleId = roleId;
      }

      saveDatabase();

      return interaction.update({
        content: "✅ Cargo configurado.",
        components: []
      });
    }

    /* ----------------------------------------------------
       MENUS DE CANAIS
    ---------------------------------------------------- */

    if (interaction.isChannelSelectMenu()) {
      if (!(await requireAdmin(interaction))) return;

      if (interaction.customId === "fila_setup_channel") {
        const setup = filaSetup.get(interaction.user.id) || {
          format: null,
          modality: null,
          channelId: null
        };
        setup.channelId = interaction.values[0];
        filaSetup.set(interaction.user.id, setup);

        if (!setup.format || !setup.modality) {
          return interaction.deferUpdate();
        }

        // Confirma imediatamente a seleção para não deixar a interação expirar.
        await interaction.deferUpdate();

        const channel = await getChannel(interaction.guild, setup.channelId);
        if (!channel || !channel.isTextBased() || typeof channel.send !== "function") {
          filaSetup.delete(interaction.user.id);
          return interaction.editReply({
            content: "❌ O canal selecionado é inválido ou não permite o envio de mensagens.",
            components: []
          });
        }

        const values = ALLOWED_VALUES.slice().sort((a, b) => b - a);

        try {
          for (const value of values) {
            // 1x1 = uma fila por valor, com exatamente 3 botões.
            const modes = setup.format === "1x1" ? ["choice"] : ["normal"];

            for (const mode of modes) {
              const queue = getQueue(setup.format, setup.modality, value, mode);
              queue.channelId = channel.id;
              queue.guildId = interaction.guild.id;

              let message = queue.messageId
                ? await channel.messages.fetch(queue.messageId).catch(() => null)
                : null;

              const payload = {
                embeds: [makeEmbed(`🎮 FILA ${setup.format}`, queueDescription(queue))],
                components: queueComponents(queue)
              };

              if (message) {
                await message.edit(payload);
              } else {
                message = await channel.send(payload);
                queue.messageId = message.id;
              }
            }
          }

          saveDatabase();
          filaSetup.delete(interaction.user.id);

          return interaction.editReply({
            content: [
              "✅ **FILAS PUBLICADAS COM SUCESSO!**",
              "",
              `📌 **Canal:** ${channel}`,
              `🎮 **Formato:** ${setup.format}`,
              `📱 **Modalidade:** ${modalityName(setup.modality)}`,
              `💰 **Valores:** ${values.map(money).join(", ")}`,
              "",
              "📋 As filas já estão disponíveis no canal escolhido."
            ].join("\n"),
            components: []
          });
        } catch (error) {
          console.error("❌ Erro ao publicar as filas pelo /fila:", error);
          filaSetup.delete(interaction.user.id);

          return interaction.editReply({
            content: [
              "❌ **NÃO FOI POSSÍVEL PUBLICAR AS FILAS.**",
              "",
              "Verifique as permissões do bot no canal escolhido: Ver Canal, Enviar Mensagens, Inserir Links e Usar Componentes.",
              "",
              `Detalhe técnico: ${error?.message || "erro desconhecido"}`
            ].join("\n"),
            components: []
          });
        }
      }

      // fila_setup_channel é tratado exclusivamente pelo fluxo de publicação acima.
      // Nunca deixar cair no salvamento genérico de canais.
      if (interaction.customId === "fila_setup_channel") return;

      const channelId = interaction.values[0];

      if (interaction.customId === "channel_ssmob") {
        db.config.ssmobChannelId = channelId;
      }
      if (interaction.customId === "channel_ssemu") {
        db.config.ssemuChannelId = channelId;
      }
      if (interaction.customId === "channel_mediator_queue") {
        db.config.mediatorQueueChannelId = channelId;
      }
      if (interaction.customId === "bet_category") {
        db.config.betCategoryId = channelId;
      }
      if (interaction.customId === "streamer_category") {
        db.config.streamerCategoryId = channelId;
      }

      saveDatabase();
      return interaction.update({
        content: "✅ Configuração de canal salva.",
        components: []
      });
    }
    /* ----------------------------------------------------
       MODAIS
    ---------------------------------------------------- */

    if (interaction.isModalSubmit()) {
      if (interaction.customId === "streamer_queue_create") {
        if (!(await requireStreamer(interaction))) return;

        const value = parseMoney(interaction.fields.getTextInputValue("streamer_value"));
        const format = interaction.fields.getTextInputValue("streamer_format").trim().toLowerCase();
        const description = interaction.fields.getTextInputValue("streamer_description").trim();

        if (!Number.isFinite(value) || value <= 0) {
          return deny(interaction, "❌ Informe um valor válido para a aposta.");
        }

        if (!FORMATS.includes(format)) {
          return deny(interaction, "❌ Formato inválido. Use `1x1`, `2x2`, `3x3` ou `4x4`.");
        }

        if (!description) {
          return deny(interaction, "❌ Informe a descrição ou as regras da fila.");
        }

        const existing = Object.values(db.streamerQueues).find(
          queue => queue.guildId === interaction.guild.id && queue.streamerId === interaction.user.id
        );

        if (existing) {
          return deny(interaction, "❌ Você já possui uma fila de Streamer ativa neste servidor.");
        }

        const queueId = `streamer-${interaction.user.id}-${Date.now()}`;
        const queue = {
          id: queueId,
          guildId: interaction.guild.id,
          streamerId: interaction.user.id,
          channelId: interaction.channel.id,
          messageId: null,
          value: Number(value.toFixed(2)),
          format,
          description,
          players: [],
          activeMatchId: null,
          createdAt: Date.now()
        };

        const sent = await interaction.channel.send({
          embeds: [streamerQueueEmbed(queue, interaction.guild)],
          components: streamerQueueComponents(queue)
        });

        queue.messageId = sent.id;
        db.streamerQueues[queueId] = queue;
        saveDatabase();

        return interaction.reply({
          content: `✅ Sua fila de Streamer foi criada neste canal: ${sent.url}`,
          ephemeral: true
        });
      }

      if (interaction.customId === "embed_builder") {
        if (!(await requireAdmin(interaction))) return;

        const title = interaction.fields.getTextInputValue("embed_title").trim();
        const description = interaction.fields.getTextInputValue("embed_description").trim();
        const colorInput = interaction.fields.getTextInputValue("embed_color").trim();
        const image = interaction.fields.getTextInputValue("embed_image").trim();
        const footer = interaction.fields.getTextInputValue("embed_footer").trim();

        const color = colorInput || db.config.embedColor || "#5865F2";
        if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
          return deny(interaction, "❌ A cor da embed deve estar no formato `#5865F2`.");
        }

        if (image && !validUrl(image)) {
          return deny(interaction, "❌ A URL da imagem é inválida.");
        }

        const embed = new EmbedBuilder()
          .setColor(color)
          .setTitle(title)
          .setDescription(description);

        if (image) embed.setImage(image);
        if (footer) embed.setFooter({ text: footer });

        await interaction.channel.send({ embeds: [embed] });
        return interaction.reply({
          content: "✅ **Embed enviada com sucesso!**",
          ephemeral: true
        });
      }

      /* PIX */

      if (interaction.customId.startsWith("pix_register|")) {
        if (!(await requireAdmin(interaction))) return;

        const userId =
          interaction.customId.split("|")[1];

        const name =
          interaction.fields.getTextInputValue("pix_name").trim();

        const key =
          interaction.fields.getTextInputValue("pix_key").trim();

        const qr =
          interaction.fields.getTextInputValue("pix_qr").trim();

        if (!validUrl(qr)) {
          return deny(
            interaction,
            "❌ A URL do QR Code não é válida."
          );
        }

        db.pix[userId] = {
          name,
          key,
          qr,
          updatedAt: Date.now()
        };

        saveDatabase();

        const e = makeEmbed(
          "💳 CADASTRO PIX",
          [
            "**Cadastro de pagamento salvo.**",
            "",
            `👤 **Usuário:** <@${userId}>`,
            `📝 **Titular:** ${name}`,
            `🔑 **Chave Pix:** \`${key}\``,
            "",
            `🔗 **Link do QR Code:** ${qr}`,
            "",
            "✅ Os dados estão prontos para serem usados nas apostas."
          ].join("\n")
        );

        return interaction.reply({
          embeds: [e],
          ephemeral: true
        });
      }

      /* TAXA */
      if (interaction.customId === "fee_modal") {
        if (!(await requireAdmin(interaction))) return;

        const fee =
          parseMoney(
            interaction.fields.getTextInputValue("fee")
          );

        if (!Number.isFinite(fee) || fee < 0.01 || fee > 0.50) {
          return deny(
            interaction,
            "❌ A taxa deve ficar entre R$0,01 e R$0,50."
          );
        }

        db.config.fee = fee;
        saveDatabase();

        return interaction.reply({
          content: `✅ Taxa configurada: ${money(fee)}.`,
          ephemeral: true
        });
      }

      /* APARÊNCIA */
      if (interaction.customId === "appearance_modal") {
        if (!(await requireAdmin(interaction))) return;

        const color =
          interaction.fields.getTextInputValue("color").trim();

        const image =
          interaction.fields.getTextInputValue("image").trim();

        if (!validHex(color)) {
          return deny(
            interaction,
            "❌ Cor HEX inválida. Exemplo: #5865F2."
          );
        }

        if (image && !validUrl(image)) {
          return deny(
            interaction,
            "❌ A URL da foto é inválida."
          );
        }

        db.config.embedColor = color;
        db.config.profileImage = image || null;

        saveDatabase();

        return interaction.reply({
          content: "✅ Aparência atualizada.",
          ephemeral: true
        });
      }

      /* SALA FREE FIRE */
      if (interaction.customId.startsWith("room_modal|")) {
        await interaction.deferReply({ ephemeral: true });
        if (!(await requireMediator(interaction))) return;

        const betId = interaction.customId.split("|")[1];
        const bet = db.bets[betId];

        if (!bet) {
          return deny(interaction, "❌ Aposta não encontrada.");
        }

        if (bet.mediatorId && bet.mediatorId !== interaction.user.id) {
          return deny(interaction, "❌ Você não é o Mediador responsável.");
        }

        const roomId =
          interaction.fields.getTextInputValue("room_id").trim();

        const roomPassword =
          interaction.fields.getTextInputValue("room_password").trim();

        if (!roomId || !roomPassword) {
          return deny(interaction, "❌ Informe o ID e a senha da sala.");
        }

        bet.roomId = roomId;
        bet.roomPassword = roomPassword;

        const paymentValue = Number((bet.value * 2).toFixed(2));
        const paymentLabel = paymentValue.toFixed(2).replace(".", "-");

        const channel = interaction.channel;

        if (channel && channel.isTextBased() && "setName" in channel) {
          await channel.setName(`pagar-${paymentLabel}`).catch(error => {
            console.error("❌ Não foi possível renomear o canal:", error);
          });
        }

        saveDatabase();

        const embed = makeEmbed(
          "🎮 SALA FREE FIRE",
          [
            "**Dados da sala liberados pelo Mediador.**",
            "",
            `💰 **Valor da aposta:** ${money(bet.value)}`,
            `🏆 **Prêmio ao vencedor:** ${money(paymentValue)}`,
            "",
            "🎮 **ACESSO À SALA**",
            `🆔 **ID:** \`${roomId}\``,
            `🔐 **Senha:** \`${roomPassword}\``,
            "",
            `📌 **Canal de pagamento:** \`pagar-${paymentLabel}\``
          ].join("\n")
        );

        return interaction.editReply({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`room_copy_id|${bet.id}`)
                .setLabel("Copiar ID")
                .setEmoji("🆔")
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`room_copy_password|${bet.id}`)
                .setLabel("Copiar senha")
                .setEmoji("🔐")
                .setStyle(ButtonStyle.Secondary)
            )
          ]
        });
      }

      /* ADM ADD */
      if (interaction.customId === "admin_add_modal") {
        if (!(await requireAdmin(interaction))) return;

        if (db.config.admins.length >= 20) {
          return deny(
            interaction,
            "❌ O limite máximo de 20 ADMs já foi atingido."
          );
        }

        const userId =
          interaction.fields.getTextInputValue("user_id").trim();

        if (!/^\d{17,20}$/.test(userId)) {
          return deny(
            interaction,
            "❌ ID Discord inválido."
          );
        }

        if (!db.config.admins.includes(userId)) {
          db.config.admins.push(userId);
        }

        saveDatabase();

        return interaction.reply({
          content: `✅ <@${userId}> foi cadastrado como ADM.`,
          ephemeral: true
        });
      }

      /* ADM REMOVE */
      if (interaction.customId === "admin_remove_modal") {
        if (!(await requireAdmin(interaction))) return;

        const userId =
          interaction.fields.getTextInputValue("user_id").trim();

        if (!db.config.admins.includes(userId)) {
          return deny(
            interaction,
            "❌ Esse usuário não está cadastrado como ADM."
          );
        }

        db.config.admins =
          db.config.admins.filter(id => id !== userId);

        saveDatabase();

        return interaction.reply({
          content: `✅ <@${userId}> foi removido dos ADMs.`,
          ephemeral: true
        });
      }

      /* INÍCIO FILA */
      // O /fila utiliza os seletores abaixo para formato, modalidade e canal.

    }

    /* ----------------------------------------------------
       SELECTS
    ---------------------------------------------------- */

    if (interaction.isChannelSelectMenu() && interaction.customId === "fila_setup_channel") {
      if (!(await requireAdmin(interaction))) return;
      await interaction.deferUpdate();
      const setup = filaSetup.get(interaction.user.id) || { format: null, modality: null, channelId: null };
      setup.channelId = interaction.values[0];
      filaSetup.set(interaction.user.id, setup);

      if (!setup.format || !setup.modality || !setup.channelId) {
        return;
      }

      const channel = await getChannel(interaction.guild, setup.channelId);
      if (!channel || !channel.isTextBased()) {
        filaSetup.delete(interaction.user.id);
        return interaction.editReply({ content: "❌ O canal selecionado é inválido.", components: [] });
      }

      const values = ALLOWED_VALUES.slice().sort((a, b) => b - a);
      const published = [];

      try {
        for (const value of values) {
          const modes = setup.format === "1x1" ? ["choice"] : ["normal"];
          for (const mode of modes) {
            const queue = getQueue(setup.format, setup.modality, value, mode);
            queue.channelId = channel.id;
            queue.guildId = interaction.guild.id;
            let msg = queue.messageId ? await channel.messages.fetch(queue.messageId).catch(() => null) : null;
            const payload = { embeds: [makeEmbed(`🎮 FILA ${setup.format}`, queueDescription(queue))], components: queueComponents(queue) };
            if (msg) await msg.edit(payload);
            else { msg = await channel.send(payload); queue.messageId = msg.id; }
            published.push(money(value));
          }
        }
      } catch (error) {
        console.error("❌ Erro ao publicar as filas:", error);
        filaSetup.delete(interaction.user.id);
        return interaction.editReply({ content: `❌ Não foi possível publicar as filas no canal selecionado. Verifique as permissões do bot.\n\nDetalhe: ${error.message || "erro desconhecido"}`, components: [] });
      }

      saveDatabase();
      filaSetup.delete(interaction.user.id);
      return interaction.editReply({ content: `✅ **Todas as filas foram publicadas!**\n\n📌 **Canal:** ${channel}\n🎮 **Formato:** ${setup.format}\n📱 **Modalidade:** ${modalityName(setup.modality)}\n💰 **Valores:** ${values.map(money).join(", ")}\n👥 **Limite por fila:** 2 jogadores`, components: [] });
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith("result_normal|") || interaction.customId.startsWith("result_wo|")) {
        if (!(await requireMediator(interaction))) return;
        const [resultAction, betId] = interaction.customId.split("|");
        const bet = db.bets[betId];
        if (!bet) return deny(interaction, "❌ Aposta não encontrada.");
        if (bet.mediatorId && bet.mediatorId !== interaction.user.id) return deny(interaction, "❌ Você não é o Mediador responsável.");
        if (bet.confirmedBy.length < bet.players.length) return deny(interaction, "🔒 Os 2 jogadores precisam confirmar.");
        if (bet.resultType) return deny(interaction, "❌ O resultado desta aposta já foi definido.");
        const winnerId = interaction.values[0];
        const loserId = bet.players.find(id => id !== winnerId);
        if (!loserId) return deny(interaction, "❌ Não foi possível identificar o outro jogador.");
        bet.winnerId = winnerId;
        bet.resultType = resultAction === "result_wo" ? "wo" : "normal";
        bet.status = "result_set";
        userStats(winnerId).wins += 1;
        userStats(loserId).losses += 1;
        if (bet.resultType === "wo") userStats(winnerId).woWins += 1;
        saveDatabase();
        return interaction.update({
          embeds: [makeEmbed(bet.resultType === "wo" ? "🚫 VITÓRIA POR W.O." : "🏆 VENCEDOR DEFINIDO", [
            "**Resultado registrado com sucesso.**",
            "",
            `🏆 **Vencedor:** <@${winnerId}>`,
            `❌ **Derrotado:** <@${loserId}>`,
            "",
            "🏁 **Próximo passo:** finalize a aposta pelo painel do Mediador."
          ].join("\n"))],
          components: []
        });
      }

      if (interaction.customId === "fila_setup_format") {
        if (!(await requireAdmin(interaction))) return;
        const setup = filaSetup.get(interaction.user.id) || { format: null, modality: null, channelId: null };
        setup.format = interaction.values[0];
        filaSetup.set(interaction.user.id, setup);
        return interaction.deferUpdate();
      }

      if (interaction.customId === "fila_setup_modality") {
        if (!(await requireAdmin(interaction))) return;
        const setup = filaSetup.get(interaction.user.id) || { format: null, modality: null, channelId: null };
        setup.modality = interaction.values[0];
        filaSetup.set(interaction.user.id, setup);
        return interaction.deferUpdate();
      }

      if (interaction.customId === "fila_setup_channel") {
        if (!(await requireAdmin(interaction))) return;
        const setup = filaSetup.get(interaction.user.id) || { format: null, modality: null, channelId: null };
        setup.channelId = interaction.values[0];
        filaSetup.set(interaction.user.id, setup);

        if (!setup.format || !setup.modality || !setup.channelId) {
          return interaction.deferUpdate();
        }

        const channel = await getChannel(interaction.guild, setup.channelId);
        if (!channel || !channel.isTextBased()) {
          filaSetup.delete(interaction.user.id);
          return interaction.update({ content: "❌ O canal selecionado é inválido.", components: [] });
        }

        // Publica AUTOMATICAMENTE todas as filas pré-definidas.
        // O ADM escolhe apenas formato, modalidade e canal.
        const values = ALLOWED_VALUES.slice().sort((a, b) => b - a);
        const published = [];

        try {
          for (const value of values) {
            const modes = setup.format === "1x1"
              ? ["choice"]
              : ["normal"];

            for (const mode of modes) {
              const queue = getQueue(setup.format, setup.modality, value, mode);
              queue.channelId = channel.id;
              queue.guildId = interaction.guild.id;

              let sentMessage = null;
              if (queue.messageId) {
                sentMessage = await channel.messages.fetch(queue.messageId).catch(() => null);
              }

              if (sentMessage) {
                await sentMessage.edit({
                  embeds: [makeEmbed(`🎮 FILA ${setup.format}`, queueDescription(queue))],
                  components: queueComponents(queue)
                });
              } else {
                sentMessage = await channel.send({
                  embeds: [makeEmbed(`🎮 FILA ${setup.format}`, queueDescription(queue))],
                  components: queueComponents(queue)
                });
                queue.messageId = sentMessage.id;
              }

              published.push(`${money(value)}${setup.format === "1x1" ? ` — ${mode === "gelo_infinito" ? "Gelo Infinito" : "Gelo Normal"}` : ""}`);
            }
          }
        } catch (error) {
          console.error("❌ Erro ao publicar as filas:", error);
          filaSetup.delete(interaction.user.id);
          return interaction.update({
            content: `❌ Não foi possível publicar as filas no canal selecionado. Verifique se o bot tem permissão para **Ver Canal**, **Enviar Mensagens** e **Incorporar Links**.\n\nDetalhe: ${error.message || "erro desconhecido"}`,
            components: []
          });
        }

        saveDatabase();
        filaSetup.delete(interaction.user.id);

        return interaction.update({
          content: `✅ **Todas as filas foram publicadas!**\n\n📌 **Canal:** ${channel}\n🎮 **Formato:** ${setup.format}\n📱 **Modalidade:** ${modalityName(setup.modality)}\n💰 **Valores:** ${values.map(money).join(", ")}\n👥 **Limite por fila:** 2 jogadores`,
          components: []
        });
      }
    }

    /* ----------------------------------------------------
       PAINEL DO MEDIADOR — MENU SUSPENSO
    ---------------------------------------------------- */
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("med_panel|")) {
      if (!(await requireMediator(interaction))) return;
      const betId = interaction.customId.split("|")[1];
      const bet = db.bets[betId];
      if (!bet) return deny(interaction, "❌ Aposta não encontrada.");
      if (bet.mediatorId && bet.mediatorId !== interaction.user.id) {
        return deny(interaction, "❌ Você não é o Mediador responsável.");
      }
      if (bet.confirmedBy.length < bet.players.length) {
        return deny(interaction, "🔒 Aguarde os 2 jogadores confirmarem.");
      }

      const choice = interaction.values[0];
      if (choice === "winner" || choice === "wo") {
        return interaction.reply({
          content: choice === "winner" ? "🏆 Selecione um dos 2 jogadores:" : "🚫 Selecione um dos 2 jogadores:",
          components: [new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`${choice === "winner" ? "result_normal" : "result_wo"}|${bet.id}`)
              .setPlaceholder("👥 Escolha o jogador")
              .addOptions(await playerSelectOptions(
                interaction.guild,
                bet.players,
                choice === "winner" ? "🏆" : "🚫"
              ))
          )],
          ephemeral: true
        });
      }
      if (choice === "room") {
        const modal = new ModalBuilder().setCustomId(`room_modal|${bet.id}`).setTitle("Sala Free Fire");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("room_id").setLabel("ID da sala").setPlaceholder("ID").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("room_password").setLabel("Senha da sala").setPlaceholder("Senha").setStyle(TextInputStyle.Short).setRequired(true))
        );
        return interaction.showModal(modal);
      }
      if (choice === "finish") {
        bet.status = "finished";
        saveDatabase();
        await interaction.reply({ embeds: [makeEmbed("🏁 APOSTA FINALIZADA", "**A aposta foi finalizada com sucesso pelo Mediador.**\n\n✅ O atendimento foi encerrado.")] });
        setTimeout(() => interaction.channel?.delete("Aposta finalizada").catch(() => {}), 5000);
        return;
      }
    }

    /* ----------------------------------------------------
       BOTÕES DE PUBLICAÇÃO 1X1
    ---------------------------------------------------- */

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("publish_queue|")
    ) {
      if (!(await requireAdmin(interaction))) return;

      const [, format, modality, valueRaw, mode, channelId] =
        interaction.customId.split("|");

      const value = parseMoney(valueRaw);

      const channel =
        await getChannel(interaction.guild, channelId);

      if (!channel || !channel.isTextBased()) {
        return interaction.update({
          content: "❌ Canal inválido.",
          components: []
        });
      }

      const queue =
        getQueue(
          format,
          modality,
          value,
          mode
        );

      queue.channelId = channel.id;

      const message =
        await channel.send({
          embeds: [
            makeEmbed(
              `🎮 FILA ${format}`,
              queueDescription(queue)
            )
          ],
          components: queueComponents(queue)
        });

      queue.messageId = message.id;

      saveDatabase();

      return interaction.update({
        content:
          `✅ Fila ${format} — ${modalityName(modality)} — ${money(value)} publicada.`,
        components: []
      });
    }

  } catch (error) {
    console.error("❌ ERRO NA INTERAÇÃO:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          "❌ Ocorreu um erro ao processar esta interação.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

/* ========================================================
   MANUTENÇÃO DAS FILAS
======================================================== */

async function refreshQueueMessage(queue, guild) {
  if (!queue.channelId || !queue.messageId) return;

  const channel =
    await guild.channels
      .fetch(queue.channelId)
      .catch(() => null);

  if (!channel || !channel.isTextBased()) return;

  const message =
    await channel.messages
      .fetch(queue.messageId)
      .catch(() => null);

  if (!message) return;

  await message.edit({
    embeds: [
      makeEmbed(
        `🎮 FILA ${queue.format}`,
        queueDescription(queue)
      )
    ],
    components: queueComponents(queue)
  }).catch(() => {});
}

let maintenanceRunning = false;

setInterval(async () => {
  if (maintenanceRunning) return;

  maintenanceRunning = true;

  try {
    for (const guild of client.guilds.cache.values()) {
      for (const queue of Object.values(db.queues)) {
        if (!queue.channelId) continue;
        if (queue.guildId && queue.guildId !== guild.id) continue;

        await refreshQueueMessage(queue, guild);
      }

      if (
        db.config.mediatorQueueChannelId &&
        (!db.config.guildId || db.config.guildId === guild.id)
      ) {
        await updateMediatorQueueMessage(guild);
      }

      for (const queue of Object.values(db.streamerQueues || {})) {
        if (!queue.channelId) continue;
        if (queue.guildId && queue.guildId !== guild.id) continue;

        await refreshStreamerQueueMessage(queue, guild);
      }
    }
  } catch (error) {
    console.error("❌ Erro na manutenção:", error);
  } finally {
    maintenanceRunning = false;
  }
}, 300000);

/* ========================================================
   SALVAMENTO E ERROS
======================================================== */

process.on("unhandledRejection", error => {
  console.error("❌ Unhandled Promise Rejection:", error);
});

process.on("uncaughtException", error => {
  console.error("❌ Uncaught Exception:", error);
});

async function shutdown(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;

  console.log(`🛑 ${signal} recebido. Salvando banco antes de encerrar...`);

  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  savePending = true;

  try {
    await flushDatabase();
  } catch (error) {
    console.error("❌ Erro ao salvar durante o encerramento:", error);
  }

  process.exit(0);
}

process.on("SIGINT", () => {
  shutdown("SIGINT").catch(error => {
    console.error("❌ Erro no encerramento:", error);
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch(error => {
    console.error("❌ Erro no encerramento:", error);
    process.exit(1);
  });
});

/* ========================================================
   LOGIN
======================================================== */

client.login(TOKEN).catch(error => {
  console.error("❌ Não foi possível iniciar o bot:", error);
  process.exit(1);
});
