require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
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
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const TOKEN = process.env.TOKEN;

console.log("==========================================");
console.log("🔎 INICIANDO BOT");
console.log("==========================================");
console.log("🔎 Verificando TOKEN...");
console.log("TOKEN encontrado:", TOKEN ? "✅ SIM" : "❌ NÃO");

if (!TOKEN) {
  console.error("❌ A variável TOKEN não foi encontrada.");
  console.error("❌ Configure TOKEN nas Variables do Railway.");
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "bot.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================
// BANCO
// ============================================================

const defaultDatabase = {
  guilds: {},
  queues: {},
  bets: {},
  analyses: {},
  stats: {}
};

let db = null;

function cloneDefaultDatabase() {
  return JSON.parse(JSON.stringify(defaultDatabase));
}

function saveDatabase() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("❌ Erro ao salvar banco:", error);
  }
}

function loadDatabase() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      db = cloneDefaultDatabase();
      saveDatabase();
      return;
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");

    if (!raw.trim()) {
      db = cloneDefaultDatabase();
      saveDatabase();
      return;
    }

    db = JSON.parse(raw);

    if (!db || typeof db !== "object") {
      db = cloneDefaultDatabase();
    }

    db.guilds ??= {};
    db.queues ??= {};
    db.bets ??= {};
    db.analyses ??= {};
    db.stats ??= {};

    // --------------------------------------------------------
    // MIGRAÇÃO DAS GUILDS
    // --------------------------------------------------------

    for (const guildId of Object.keys(db.guilds)) {
      const config = db.guilds[guildId];

      config.mobileChannelId ??= null;
      config.emulatorChannelId ??= null;
      config.betsCategoryId ??= null;
      config.mediatorRoleId ??= null;
      config.analystRoleId ??= null;
      config.mobileAnalysisChannelId ??= null;
      config.emulatorAnalysisChannelId ??= null;

      config.fee ??= 0;

      config.appearance ??= {};
      config.appearance.color ??= null;

      config.mediators ??= [];

      config.mediatorQueue ??= [];
      config.mediatorRotation ??= 0;

      config.mediatorQueueMessages ??= [];
    }

    // --------------------------------------------------------
    // MIGRAÇÃO DAS APOSTAS
    // --------------------------------------------------------

    for (const bet of Object.values(db.bets)) {
      bet.players ??= [];
      bet.payments ??= {};

      for (const userId of bet.players) {
        bet.payments[userId] ??= false;
      }

      bet.channelId ??= null;
      bet.mediatorId ??= null;
      bet.analystId ??= null;

      bet.roomId ??= null;
      bet.roomPassword ??= null;

      bet.winnerId ??= null;

      bet.resultRecorded ??= false;
      bet.finalizedAt ??= null;
    }

    // --------------------------------------------------------
    // MIGRAÇÃO DAS ANÁLISES
    // --------------------------------------------------------

    for (const analysis of Object.values(db.analyses)) {
      analysis.analystId ??= null;
      analysis.status ??= "aguardando";
    }

    saveDatabase();
  } catch (error) {
    console.error("❌ Erro ao carregar banco:", error);

    db = cloneDefaultDatabase();
    saveDatabase();
  }
}

loadDatabase();

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],

  partials: [
    Partials.Channel,
    Partials.GuildMember,
    Partials.User
  ]
});

// ============================================================
// CONSTANTES
// ============================================================

const PREFIX = ".";

const VALUES = [
  100,
  50,
  20,
  10,
  7,
  5,
  3,
  2,
  1,
  0.75,
  0.5,
  0.3
];

const FORMATS = [
  "1x1",
  "2x2",
  "3x3",
  "4x4"
];

const MODALITIES = [
  "Mobile",
  "Emulador",
  "Misto"
];

const MAX_MEDIATORS = 20;

const queueLocks = new Set();
const filaSelections = new Map();

// ============================================================
// UTILITÁRIOS
// ============================================================

function generateId(length = 12) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars[
      Math.floor(Math.random() * chars.length)
    ];
  }

  return result;
}

function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0,00";
  }

  return number
    .toFixed(2)
    .replace(".", ",");
}

function moneyBRL(value) {
  return `R$ ${money(value)}`;
}

function selectionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function getGuildConfig(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      mobileChannelId: null,
      emulatorChannelId: null,
      betsCategoryId: null,
      mediatorRoleId: null,
      analystRoleId: null,

      mobileAnalysisChannelId: null,
      emulatorAnalysisChannelId: null,

      fee: 0,

      appearance: {
        color: null
      },

      mediators: [],

      mediatorQueue: [],
      mediatorRotation: 0,

      mediatorQueueMessages: []
    };

    saveDatabase();
  }

  const config = db.guilds[guildId];

  config.mediators ??= [];

  config.appearance ??= {};
  config.appearance.color ??= null;

  config.mediatorQueue ??= [];
  config.mediatorRotation ??= 0;
  config.mediatorQueueMessages ??= [];

  config.mobileChannelId ??= null;
  config.emulatorChannelId ??= null;
  config.betsCategoryId ??= null;
  config.mediatorRoleId ??= null;
  config.analystRoleId ??= null;

  config.mobileAnalysisChannelId ??= null;
  config.emulatorAnalysisChannelId ??= null;

  config.fee ??= 0;

  return config;
}

function isAdmin(member) {
  return Boolean(
    member &&
    member.permissions &&
    member.permissions.has(
      PermissionFlagsBits.Administrator
    )
  );
}

function isMediator(member, guildId) {
  if (!member) return false;

  const config = getGuildConfig(guildId);

  if (
    config.mediatorRoleId &&
    member.roles?.cache?.has(
      config.mediatorRoleId
    )
  ) {
    return true;
  }

  return config.mediators.some(
    mediator => mediator.id === member.id
  );
}

function isAnalyst(member, guildId) {
  if (!member) return false;

  const config = getGuildConfig(guildId);

  return Boolean(
    config.analystRoleId &&
    member.roles?.cache?.has(
      config.analystRoleId
    )
  );
}

function getEmbedColor(guildId) {
  const config = getGuildConfig(guildId);

  if (
    config.appearance?.color &&
    /^#[0-9A-F]{6}$/i.test(
      config.appearance.color
    )
  ) {
    return config.appearance.color;
  }

  return null;
}

function applyGuildColor(embed, guildId) {
  const color = getEmbedColor(guildId);

  if (color) {
    embed.setColor(color);
  }

  return embed;
}

function queueCapacity() {
  return 2;
}

// ============================================================
// ESTATÍSTICAS
// ============================================================

function getStats(guildId, userId) {
  db.stats[guildId] ??= {};

  db.stats[guildId][userId] ??= {
    bets: 0,
    wins: 0,
    losses: 0,
    woWins: 0,
    woLosses: 0,
    totalWon: 0,
    totalLost: 0
  };

  return db.stats[guildId][userId];
}

function registerBetResult(
  guildId,
  winnerId,
  loserId,
  value,
  wo = false
) {
  const winner = getStats(
    guildId,
    winnerId
  );

  const loser = getStats(
    guildId,
    loserId
  );

  winner.bets++;
  loser.bets++;

  winner.wins++;
  loser.losses++;

  if (wo) {
    winner.woWins++;
    loser.woLosses++;
  }

  winner.totalWon += Number(value);
  loser.totalLost += Number(value);

  saveDatabase();
}

// ============================================================
// FILAS
// ============================================================

function createQueueData({
  guildId,
  channelId,
  format,
  modality,
  value
}) {
  const id = generateId(14);

  const queue = {
    id,
    guildId,
    channelId,
    format,
    modality,
    value,
    players: [],
    gelo: null,
    messageId: null,
    createdAt: Date.now()
  };

  db.queues[id] = queue;

  saveDatabase();

  return queue;
}

function getQueue(queueId) {
  return db.queues[queueId] || null;
}

function deleteQueue(queueId) {
  if (!db.queues[queueId]) {
    return;
  }

  delete db.queues[queueId];
  saveDatabase();
}

// ============================================================
// FILA DE MEDIADORES
// ============================================================

function getActiveMediatorQueue(guildId) {
  const config = getGuildConfig(guildId);

  const validIds = new Set(
    config.mediators.map(
      mediator => mediator.id
    )
  );

  const oldQueue = Array.isArray(
    config.mediatorQueue
  )
    ? config.mediatorQueue
    : [];

  config.mediatorQueue = oldQueue.filter(
    id => validIds.has(id)
  );

  if (
    config.mediatorRotation >=
    config.mediatorQueue.length
  ) {
    config.mediatorRotation = 0;
  }

  return config.mediatorQueue;
}

function mediatorQueueEmbed(guildId) {
  const config = getGuildConfig(guildId);

  const queue =
    getActiveMediatorQueue(guildId);

  let description;

  if (queue.length === 0) {
    description =
      "👥 Nenhum mediador na fila.";
  } else {
    description = queue
      .map((id, index) => {
        const mediator =
          config.mediators.find(
            item => item.id === id
          );

        return [
          `${index + 1}. 👤 **${mediator?.name || "Mediador"}**`,
          `<@${id}>`
        ].join(" — ");
      })
      .join("\n");
  }

  const embed = new EmbedBuilder()
    .setTitle("👮 FILA DE MEDIADORES")
    .setDescription(description)
    .setFooter({
      text:
        `${queue.length} mediador(es) na fila`
    });

  return applyGuildColor(
    embed,
    guildId
  );
}

function mediatorQueueButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("medq_join")
        .setLabel("Entrar na Fila")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("medq_leave")
        .setLabel("Sair da Fila")
        .setEmoji("🚪")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ============================================================
// EMBED DA FILA
// ============================================================

function queueEmbed(queue) {
  const players =
    queue.players.length > 0
      ? queue.players
        .map(id => `👤 <@${id}>`)
        .join("\n")
      : "👤 Nenhum jogador";

  const gelo =
    queue.format === "1x1" &&
    queue.gelo
      ? `🧊 Gelo: ${
          queue.gelo === "normal"
            ? "Normal"
            : "Infinito"
        }`
      : null;

  const lines = [
    `📌 Formato: ${queue.format}`,
    `📱 Modalidade: ${queue.modality}`,
    "",
    `💰 ${moneyBRL(queue.value)}`,
    `👥 ${queue.players.length}/2`
  ];

  if (gelo) {
    lines.push(gelo);
  }

  lines.push("");
  lines.push(players);

  const embed = new EmbedBuilder()
    .setTitle("🎮 FILA")
    .setDescription(
      lines.join("\n")
    );

  return applyGuildColor(
    embed,
    queue.guildId
  );
}

// ============================================================
// BOTÕES DA FILA
// ============================================================

function queueButtons(queue) {
  const hasMediator =
    getActiveMediatorQueue(
      queue.guildId
    ).length > 0;

  const full =
    queue.players.length >=
    queueCapacity();

  if (queue.format === "1x1") {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `qg|${queue.id}|normal`
          )
          .setLabel("Gelo Normal")
          .setEmoji("🧊")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(
            !hasMediator ||
            full
          ),

        new ButtonBuilder()
          .setCustomId(
            `qg|${queue.id}|infinito`
          )
          .setLabel("Gelo Infinito")
          .setEmoji("♾️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(
            !hasMediator ||
            full
          ),

        new ButtonBuilder()
          .setCustomId(
            `ql|${queue.id}`
          )
          .setLabel("Sair")
          .setEmoji("🚪")
          .setStyle(ButtonStyle.Secondary)
      )
    ];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `qe|${queue.id}`
        )
        .setLabel("Entrar")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success)
        .setDisabled(
          !hasMediator ||
          full
        ),

      new ButtonBuilder()
        .setCustomId(
          `ql|${queue.id}`
        )
        .setLabel("Sair")
        .setEmoji("🚪")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ============================================================
// ATUALIZAR TODAS AS FILAS
// ============================================================

async function updateQueueMessage(queue) {
  if (
    !queue ||
    !queue.channelId ||
    !queue.messageId
  ) {
    return;
  }

  const guild =
    client.guilds.cache.get(
      queue.guildId
    );

  if (!guild) return;

  const channel =
    await guild.channels.fetch(
      queue.channelId
    ).catch(() => null);

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    return;
  }

  const message =
    await channel.messages.fetch(
      queue.messageId
    ).catch(() => null);

  if (!message) return;

  await message.edit({
    embeds: [
      queueEmbed(queue)
    ],
    components:
      queueButtons(queue)
  }).catch(() => {});
}

async function updateAllQueueMessages(
  guildId
) {
  const queues =
    Object.values(db.queues).filter(
      queue =>
        queue.guildId === guildId
    );

  for (const queue of queues) {
    await updateQueueMessage(
      queue
    );
  }
}

// ============================================================
// ATUALIZAR MENSAGENS DA FILA DE MEDIADORES
// ============================================================

async function updateMediatorQueueMessages(
  guildId
) {
  const config =
    getGuildConfig(guildId);

  if (
    !config.mediatorQueueMessages?.length
  ) {
    await updateAllQueueMessages(
      guildId
    );
    return;
  }

  const guild =
    client.guilds.cache.get(
      guildId
    );

  if (!guild) return;

  const validMessages = [];

  for (
    const item of
    config.mediatorQueueMessages
  ) {
    try {
      const channel =
        await guild.channels.fetch(
          item.channelId
        );

      if (
        !channel ||
        !channel.isTextBased()
      ) {
        continue;
      }

      const message =
        await channel.messages.fetch(
          item.messageId
        );

      await message.edit({
        embeds: [
          mediatorQueueEmbed(
            guildId
          )
        ],
        components:
          mediatorQueueButtons()
      });

      validMessages.push(item);
    } catch {
      // Mensagem ou canal não existe mais.
    }
  }

  config.mediatorQueueMessages =
    validMessages;

  saveDatabase();

  // Também atualiza os botões das filas.
  await updateAllQueueMessages(
    guildId
  );
}

// ============================================================
// ENTRAR NA FILA DE MEDIADORES
// ============================================================

async function joinMediatorQueue(
  interaction
) {
  const guildId =
    interaction.guild.id;

  const config =
    getGuildConfig(guildId);

  if (
    !isMediator(
      interaction.member,
      guildId
    )
  ) {
    await interaction.reply({
      content:
        "❌ Apenas mediadores cadastrados podem entrar na fila.",
      ephemeral: true
    });
    return;
  }

  if (
    config.mediatorQueue.includes(
      interaction.user.id
    )
  ) {
    await interaction.reply({
      content:
        "❌ Você já está na fila de mediadores.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferUpdate();

  config.mediatorQueue.push(
    interaction.user.id
  );

  saveDatabase();

  await updateMediatorQueueMessages(
    guildId
  );
}

// ============================================================
// SAIR DA FILA DE MEDIADORES
// ============================================================

async function leaveMediatorQueue(
  interaction
) {
  const guildId =
    interaction.guild.id;

  const config =
    getGuildConfig(guildId);

  if (
    !isMediator(
      interaction.member,
      guildId
    )
  ) {
    await interaction.reply({
      content:
        "❌ Apenas mediadores cadastrados podem usar esta fila.",
      ephemeral: true
    });
    return;
  }

  const index =
    config.mediatorQueue.indexOf(
      interaction.user.id
    );

  if (index === -1) {
    await interaction.reply({
      content:
        "❌ Você não está na fila de mediadores.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferUpdate();

  config.mediatorQueue.splice(
    index,
    1
  );

  if (
    config.mediatorRotation >=
    config.mediatorQueue.length
  ) {
    config.mediatorRotation = 0;
  }

  saveDatabase();

  await updateMediatorQueueMessages(
    guildId
  );
}

// ============================================================
// ESCOLHER MEDIADOR
// ============================================================

function assignMediator(guildId) {
  const config =
    getGuildConfig(guildId);

  const queue =
    getActiveMediatorQueue(guildId);

  if (queue.length === 0) {
    return null;
  }

  if (
    config.mediatorRotation >=
    queue.length
  ) {
    config.mediatorRotation = 0;
  }

  const index =
    config.mediatorRotation;

  const mediatorId =
    queue[index];

  config.mediatorRotation =
    (index + 1) % queue.length;

  saveDatabase();

  return mediatorId;
}

// ============================================================
// APOSTAS
// ============================================================

function createBet({
  guildId,
  categoryId,
  format,
  modality,
  value,
  players
}) {
  const id =
    generateId(16);

  const bet = {
    id,
    guildId,
    categoryId,

    format,
    modality,
    value,

    players: [
      ...players
    ],

    channelId: null,

    mediatorId: null,
    analystId: null,

    roomId: null,
    roomPassword: null,

    winnerId: null,

    status:
      "aguardando_pagamento",

    payments: {},

    resultRecorded: false,

    createdAt: Date.now(),
    finalizedAt: null
  };

  for (
    const userId of players
  ) {
    bet.payments[userId] =
      false;
  }

  db.bets[id] =
    bet;

  saveDatabase();

  return bet;
}

function getBet(betId) {
  return db.bets[betId] || null;
}

function findBetByChannel(
  channelId
) {
  return (
    Object.values(db.bets).find(
      bet =>
        bet.channelId === channelId
    ) || null
  );
}

function updateBet(
  betId,
  data
) {
  const bet =
    getBet(betId);

  if (!bet) return null;

  Object.assign(
    bet,
    data
  );

  saveDatabase();

  return bet;
}

// ============================================================
// CANAL DA APOSTA
// ============================================================

async function createBetChannel(
  guild,
  bet
) {
  const config =
    getGuildConfig(
      guild.id
    );

  if (
    config.betsCategoryId
  ) {
    const category =
      await guild.channels.fetch(
        config.betsCategoryId
      ).catch(() => null);

    if (
      category &&
      category.type !==
        ChannelType.GuildCategory
    ) {
      throw new Error(
        "A categoria configurada não é uma categoria válida."
      );
    }
  }

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel
      ]
    }
  ];

  for (
    const userId of bet.players
  ) {
    overwrites.push({
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  if (bet.mediatorId) {
    overwrites.push({
      id: bet.mediatorId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  const name =
    `aposta-${bet.players[0].slice(-4)}-${bet.players[1].slice(-4)}`;

  const channel =
    await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent:
        config.betsCategoryId || undefined,
      permissionOverwrites:
        overwrites
    });

  bet.channelId =
    channel.id;

  saveDatabase();

  return channel;
}

// ============================================================
// EMBED DA APOSTA
// ============================================================

function betStatusText(status) {
  switch (status) {
    case "aguardando_pagamento":
      return "⏳ Aguardando pagamento";

    case "aguardando_sala":
      return "⏳ Aguardando sala";

    case "em_andamento":
      return "🎮 Em andamento";

    case "wo":
      return "⚠️ Vitória por W.O.";

    case "finalizada":
      return "✅ Finalizada";

    default:
      return "⏳ Aguardando";
  }
}

function betEmbed(bet) {
  const embed =
    new EmbedBuilder()
      .setTitle("🎮 APOSTA")
      .setDescription([
        "👥 Jogadores",
        `• <@${bet.players[0]}>`,
        `• <@${bet.players[1]}>`,
        "",
        `🎯 Formato: ${bet.format}`,
        `📱 Modalidade: ${bet.modality}`,
        `💰 Valor: ${moneyBRL(bet.value)}`,
        "",
        `Status: ${betStatusText(bet.status)}`
      ].join("\n"));

  return applyGuildColor(
    embed,
    bet.guildId
  );
}

// ============================================================
// BOTÕES DE PAGAMENTO
// ============================================================

function betPaymentButtons(bet) {
  const rows = [];

  for (
    const userId of bet.players
  ) {
    const paid =
      Boolean(
        bet.payments[userId]
      );

    const playerNumber =
      userId === bet.players[0]
        ? "Jogador 1"
        : "Jogador 2";

    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `pay|${bet.id}|${userId}`
          )
          .setLabel(
            paid
              ? `${playerNumber}: Pago`
              : `${playerNumber}: Confirmar pagamento`
          )
          .setStyle(
            paid
              ? ButtonStyle.Success
              : ButtonStyle.Primary
          )
          .setDisabled(paid)
      )
    );
  }

  return rows;
}

// ============================================================
// PAINEL DO MEDIADOR
// ============================================================

function mediatorPanelEmbed(bet) {
  const embed =
    new EmbedBuilder()
      .setTitle(
        "🎮 PAINEL DO MEDIADOR"
      )
      .setDescription([
        "👥 Jogadores",
        `• <@${bet.players[0]}>`,
        `• <@${bet.players[1]}>`,
        "",
        `🎯 Formato: ${bet.format}`,
        `📱 Modalidade: ${bet.modality}`,
        `💰 Valor: ${moneyBRL(bet.value)}`,
        "",
        `Status: ${betStatusText(bet.status)}`
      ].join("\n"));

  return applyGuildColor(
    embed,
    bet.guildId
  );
}

function mediatorPanelButtons(bet) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `room|${bet.id}`
        )
        .setLabel("Abrir Sala")
        .setEmoji("🏠")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          `winner|${bet.id}`
        )
        .setLabel("Escolher Vencedor")
        .setEmoji("🏆")
        .setStyle(
          ButtonStyle.Success
        )
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `wo|${bet.id}`
        )
        .setLabel("Vitória por W.O.")
        .setEmoji("⚠️")
        .setStyle(
          ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          `finish|${bet.id}`
        )
        .setLabel("Finalizar Aposta")
        .setEmoji("🔒")
        .setStyle(
          ButtonStyle.Secondary
        )
    )
  ];
}

// ============================================================
// MODAIS
// ============================================================

function roomModal(betId) {
  const modal =
    new ModalBuilder()
      .setCustomId(
        `room_modal|${betId}`
      )
      .setTitle(
        "🏠 Abrir Sala"
      );

  const roomId =
    new TextInputBuilder()
      .setCustomId("room_id")
      .setLabel("ID da sala")
      .setPlaceholder(
        "Digite o ID da sala"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true)
      .setMaxLength(50);

  const password =
    new TextInputBuilder()
      .setCustomId(
        "room_password"
      )
      .setLabel("Senha da sala")
      .setPlaceholder(
        "Digite a senha da sala"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true)
      .setMaxLength(50);

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(roomId),

    new ActionRowBuilder()
      .addComponents(password)
  );

  return modal;
}

function winnerModal(betId) {
  const modal =
    new ModalBuilder()
      .setCustomId(
        `winner_modal|${betId}`
      )
      .setTitle(
        "🏆 Escolher Vencedor"
      );

  const winner =
    new TextInputBuilder()
      .setCustomId(
        "winner_id"
      )
      .setLabel(
        "ID do jogador vencedor"
      )
      .setPlaceholder(
        "Digite o ID do jogador"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true)
      .setMaxLength(30);

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(winner)
  );

  return modal;
}

function mediatorAddIdModal() {
  const modal =
    new ModalBuilder()
      .setCustomId(
        "cfg_med_id"
      )
      .setTitle(
        "➕ Adicionar Mediador"
      );

  const id =
    new TextInputBuilder()
      .setCustomId(
        "mediator_id"
      )
      .setLabel(
        "Discord ID"
      )
      .setPlaceholder(
        "Digite o ID do Discord"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true)
      .setMaxLength(30);

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(id)
  );

  return modal;
}

function mediatorDataModal(
  userId
) {
  const modal =
    new ModalBuilder()
      .setCustomId(
        `cfg_med_data|${userId}`
      )
      .setTitle(
        "Dados do Mediador"
      );

  const name =
    new TextInputBuilder()
      .setCustomId(
        "mediator_name"
      )
      .setLabel(
        "Nome do mediador"
      )
      .setPlaceholder(
        "Nome"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true)
      .setMaxLength(100);

  const pix =
    new TextInputBuilder()
      .setCustomId(
        "mediator_pix"
      )
      .setLabel(
        "Chave Pix"
      )
      .setPlaceholder(
        "Chave Pix"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true)
      .setMaxLength(200);

  const qr =
    new TextInputBuilder()
      .setCustomId(
        "mediator_qr"
      )
      .setLabel(
        "QR Code"
      )
      .setPlaceholder(
        "URL ou referência do QR Code"
      )
      .setStyle(
        TextInputStyle.Paragraph
      )
      .setRequired(false)
      .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(name),

    new ActionRowBuilder()
      .addComponents(pix),

    new ActionRowBuilder()
      .addComponents(qr)
  );

  return modal;
}

function feeModal() {
  const modal =
    new ModalBuilder()
      .setCustomId(
        "cfg_fee"
      )
      .setTitle(
        "💰 Taxa"
      );

  const fee =
    new TextInputBuilder()
      .setCustomId(
        "fee"
      )
      .setLabel(
        "Taxa"
      )
      .setPlaceholder(
        "Ex: 10 ou 5,00"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true)
      .setMaxLength(20);

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(fee)
  );

  return modal;
}

function colorModal() {
  const modal =
    new ModalBuilder()
      .setCustomId(
        "cfg_color"
      )
      .setTitle(
        "🎨 Cor dos Embeds"
      );

  const color =
    new TextInputBuilder()
      .setCustomId(
        "color"
      )
      .setLabel(
        "Cor HEX"
      )
      .setPlaceholder(
        "#5865F2"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true)
      .setMaxLength(7);

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(color)
  );

  return modal;
}

function avatarModal() {
  const modal =
    new ModalBuilder()
      .setCustomId(
        "cfg_avatar"
      )
      .setTitle(
        "🤖 Foto do Bot"
      );

  const avatar =
    new TextInputBuilder()
      .setCustomId(
        "avatar_url"
      )
      .setLabel(
        "URL da imagem"
      )
      .setPlaceholder(
        "https://..."
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true)
      .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(avatar)
  );

  return modal;
}

// ============================================================
// CONFIGURAÇÃO
// ============================================================

function configEmbed(guildId) {
  const config =
    getGuildConfig(guildId);

  const mobile =
    config.mobileChannelId
      ? `<#${config.mobileChannelId}>`
      : "❌ Não configurado";

  const emulator =
    config.emulatorChannelId
      ? `<#${config.emulatorChannelId}>`
      : "❌ Não configurado";

  const category =
    config.betsCategoryId
      ? `<#${config.betsCategoryId}>`
      : "❌ Não configurado";

  const mediatorRole =
    config.mediatorRoleId
      ? `<@&${config.mediatorRoleId}>`
      : "❌ Não configurado";

  const analystRole =
    config.analystRoleId
      ? `<@&${config.analystRoleId}>`
      : "❌ Não configurado";

  const mobileAnalysis =
    config.mobileAnalysisChannelId
      ? `<#${config.mobileAnalysisChannelId}>`
      : "❌ Não configurado";

  const emulatorAnalysis =
    config.emulatorAnalysisChannelId
      ? `<#${config.emulatorAnalysisChannelId}>`
      : "❌ Não configurado";

  const embed =
    new EmbedBuilder()
      .setTitle(
        "⚙️ CONFIGURAÇÃO"
      )
      .setDescription([
        `📱 Canal Mobile: ${mobile}`,
        `🖥️ Canal Emulador: ${emulator}`,
        `📁 Categoria das Apostas: ${category}`,
        `👮 Cargo Mediador: ${mediatorRole}`,
        `🔎 Cargo Analista: ${analystRole}`,
        `🔎 Análise Mobile: ${mobileAnalysis}`,
        `🔎 Análise Emulador: ${emulatorAnalysis}`,
        `💰 Taxa: ${config.fee}%`,
        "",
        `👥 Mediadores: ${config.mediators.length}/${MAX_MEDIATORS}`,
        `🟢 Na fila: ${config.mediatorQueue.length}`
      ].join("\n"));

  return applyGuildColor(
    embed,
    guildId
  );
}

function configButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "cfg_mobile"
        )
        .setLabel(
          "Canal Mobile"
        )
        .setEmoji("📱")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "cfg_emulator"
        )
        .setLabel(
          "Canal Emulador"
        )
        .setEmoji("🖥️")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "cfg_category"
        )
        .setLabel(
          "Categoria das Apostas"
        )
        .setEmoji("📁")
        .setStyle(
          ButtonStyle.Primary
        )
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "cfg_mediator_role"
        )
        .setLabel(
          "Cargo Mediador"
        )
        .setEmoji("👮")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "cfg_analyst_role"
        )
        .setLabel(
          "Cargo Analista"
        )
        .setEmoji("🔎")
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "cfg_mobile_analysis"
        )
        .setLabel(
          "Análise Mobile"
        )
        .setEmoji("📱")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "cfg_emulator_analysis"
        )
        .setLabel(
          "Análise Emulador"
        )
        .setEmoji("🖥️")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "cfg_fee_button"
        )
        .setLabel(
          "Taxa"
        )
        .setEmoji("💰")
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "cfg_mediators"
        )
        .setLabel(
          "Mediadores"
        )
        .setEmoji("👥")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "cfg_appearance"
        )
        .setLabel(
          "Aparência"
        )
        .setEmoji("🎨")
        .setStyle(
          ButtonStyle.Secondary
        )
    )
  ];
}

function mediatorConfigButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "cfg_add_mediator"
        )
        .setLabel(
          "Adicionar Mediador"
        )
        .setEmoji("➕")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "cfg_remove_mediator"
        )
        .setLabel(
          "Remover Mediador"
        )
        .setEmoji("➖")
        .setStyle(
          ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          "cfg_list_mediators"
        )
        .setLabel(
          "Listar Mediadores"
        )
        .setEmoji("📋")
        .setStyle(
          ButtonStyle.Secondary
        )
    )
  ];
}

function appearanceButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "cfg_color_button"
        )
        .setLabel(
          "Cor dos Embeds"
        )
        .setEmoji("🎨")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "cfg_avatar_button"
        )
        .setLabel(
          "Foto do Bot"
        )
        .setEmoji("🤖")
        .setStyle(
          ButtonStyle.Secondary
        )
    )
  ];
}

// ============================================================
// SELECTS
// ============================================================

function channelSelect(
  customId,
  placeholder
) {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
  );
}

function roleSelect(
  customId,
  placeholder
) {
  return new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
  );
}

// ============================================================
// /FILA
// ============================================================

function filaFormatSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        "fila_format"
      )
      .setPlaceholder(
        "🎯 Escolha o formato"
      )
      .addOptions(
        FORMATS.map(format => ({
          label: format,
          value: format,
          emoji: "🎮"
        }))
      )
  );
}

function filaModalitySelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        "fila_modality"
      )
      .setPlaceholder(
        "📱 Escolha a modalidade"
      )
      .addOptions(
        MODALITIES.map(
          modality => ({
            label: modality,
            value: modality,
            emoji:
              modality === "Mobile"
                ? "📱"
                : modality === "Emulador"
                  ? "🖥️"
                  : "🎮"
          })
        )
      )
  );
}

function filaChannelSelect() {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(
        "fila_channel"
      )
      .setPlaceholder(
        "📢 Escolha o canal"
      )
      .setMinValues(1)
      .setMaxValues(1)
  );
}

// ============================================================
// ANÁLISE
// ============================================================

function analysisEmbed(
  type,
  bet
) {
  const name =
    type === "mobile"
      ? "Mobile"
      : "Emulador";

  const embed =
    new EmbedBuilder()
      .setTitle(
        "🔎 ANÁLISE SOLICITADA"
      )
      .setDescription([
        `Uma análise ${name} foi solicitada.`,
        "",
        "Status: ⏳ Aguardando analista"
      ].join("\n"))
      .setFooter({
        text:
          `Aposta: ${bet.id}`
      });

  return applyGuildColor(
    embed,
    bet.guildId
  );
}

function analysisAssumedEmbed(
  type,
  bet,
  analystId
) {
  const name =
    type === "mobile"
      ? "Mobile"
      : "Emulador";

  const embed =
    new EmbedBuilder()
      .setTitle(
        "🔎 ANÁLISE SOLICITADA"
      )
      .setDescription([
        `Uma análise ${name} foi solicitada.`,
        "",
        "Status: ✅ Análise assumida",
        `👤 Analista: <@${analystId}>`
      ].join("\n"))
      .setFooter({
        text:
          `Aposta: ${bet.id}`
      });

  return applyGuildColor(
    embed,
    bet.guildId
  );
}

function analysisButton(
  analysisId
) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          `analysis_claim|${analysisId}`
        )
        .setLabel(
          "Assumir Análise"
        )
        .setEmoji("🔎")
        .setStyle(
          ButtonStyle.Primary
        )
    );
}

// ============================================================
// /P
// ============================================================

async function handlePlayerStats(
  message
) {
  const stats =
    getStats(
      message.guild.id,
      message.author.id
    );

  const embed =
    new EmbedBuilder()
      .setTitle(
        "📊 ESTATÍSTICAS DO JOGADOR"
      )
      .setDescription([
        `👤 Jogador: ${message.author}`,
        "",
        `🎮 Total de apostas: ${stats.bets}`,
        `🏆 Vitórias: ${stats.wins}`,
        `❌ Derrotas: ${stats.losses}`,
        `⚠️ W.O. ganhos: ${stats.woWins}`,
        `⚠️ W.O. perdidos: ${stats.woLosses}`,
        "",
        `💰 Total ganho: ${moneyBRL(stats.totalWon)}`,
        `💸 Total perdido: ${moneyBRL(stats.totalLost)}`
      ].join("\n"));

  applyGuildColor(
    embed,
    message.guild.id
  );

  await message.reply({
    embeds: [embed]
  });
}

// ============================================================
// .MED
// ============================================================

async function handleDotMed(
  message
) {
  if (!message.guild) return;

  if (
    !isMediator(
      message.member,
      message.guild.id
    )
  ) {
    await message.reply(
      "❌ Você não tem permissão para usar este comando."
    );
    return;
  }

  const bet =
    findBetByChannel(
      message.channel.id
    );

  if (!bet) {
    await message.reply(
      "❌ O comando `.med` deve ser usado dentro do canal privado de uma aposta."
    );
    return;
  }

  if (
    bet.mediatorId &&
    bet.mediatorId !==
      message.author.id
  ) {
    await message.reply(
      `❌ Esta aposta já possui o mediador <@${bet.mediatorId}>.`
    );
    return;
  }

  bet.mediatorId =
    message.author.id;

  saveDatabase();

  await message.channel.permissionOverwrites
    .edit(
      message.author.id,
      {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      }
    )
    .catch(() => {});

  await message.channel.send({
    embeds: [
      mediatorPanelEmbed(bet)
    ],
    components:
      mediatorPanelButtons(bet)
  });
}

// ============================================================
// .SSMOB / .SSEMU
// ============================================================

async function requestAnalysis(
  message,
  type
) {
  if (!message.guild) {
    return;
  }

  if (
    !isMediator(
      message.member,
      message.guild.id
    )
  ) {
    await message.reply(
      "❌ Você não tem permissão para usar este comando."
    ).catch(() => {});
    return;
  }

  const bet =
    findBetByChannel(
      message.channel.id
    );

  if (!bet) {
    await message.reply(
      "❌ Este comando deve ser usado dentro do canal privado de uma aposta."
    );
    return;
  }

  if (
    bet.status === "finalizada" ||
    bet.status === "wo"
  ) {
    await message.reply(
      "❌ Esta aposta já foi finalizada."
    );
    return;
  }

  const config =
    getGuildConfig(
      message.guild.id
    );

  const analysisChannelId =
    type === "mobile"
      ? config.mobileAnalysisChannelId
      : config.emulatorAnalysisChannelId;

  if (!analysisChannelId) {
    await message.reply(
      `❌ O canal de análise ${
        type === "mobile"
          ? "Mobile"
          : "Emulador"
      } não foi configurado.`
    );
    return;
  }

  const analysisChannel =
    await message.guild.channels
      .fetch(
        analysisChannelId
      )
      .catch(() => null);

  if (
    !analysisChannel ||
    !analysisChannel.isTextBased()
  ) {
    await message.reply(
      "❌ O canal de análise configurado não está disponível."
    );
    return;
  }

  const existing =
    Object.values(
      db.analyses
    ).find(
      analysis =>
        analysis.betId === bet.id &&
        analysis.type === type &&
        analysis.status ===
          "aguardando"
    );

  if (existing) {
    await message.reply(
      `❌ Já existe uma análise ${
        type === "mobile"
          ? "Mobile"
          : "Emulador"
      } aguardando analista.`
    );
    return;
  }

  const analysisId =
    generateId(14);

  const analysis = {
    id: analysisId,
    betId: bet.id,
    guildId: message.guild.id,
    type,
    requesterId:
      message.author.id,
    analystId: null,
    channelId:
      analysisChannel.id,
    messageId: null,
    createdAt: Date.now(),
    status: "aguardando"
  };

  db.analyses[
    analysisId
  ] = analysis;

  saveDatabase();

  try {
    const sent =
      await analysisChannel.send({
        embeds: [
          analysisEmbed(
            type,
            bet
          )
        ],
        components: [
          analysisButton(
            analysisId
          )
        ]
      });

    analysis.messageId =
      sent.id;

    saveDatabase();

    await message.reply(
      `🔎 Análise ${
        type === "mobile"
          ? "Mobile"
          : "Emulador"
      } solicitada.`
    );
  } catch (error) {
    console.error(
      "❌ Erro ao enviar análise:",
      error
    );

    delete db.analyses[
      analysisId
    ];

    saveDatabase();

    await message.reply(
      "❌ Não foi possível enviar a solicitação de análise."
    ).catch(() => {});
  }
}

// ============================================================
// ASSUMIR ANÁLISE
// ============================================================

async function claimAnalysis(
  interaction,
  analysis
) {
  if (!analysis) {
    await interaction.reply({
      content:
        "❌ Análise não encontrada.",
      ephemeral: true
    });
    return;
  }

  if (
    !isAnalyst(
      interaction.member,
      interaction.guild.id
    )
  ) {
    await interaction.reply({
      content:
        "❌ Apenas usuários com o cargo de Analista podem assumir esta análise.",
      ephemeral: true
    });
    return;
  }

  if (
    analysis.status !==
    "aguardando"
  ) {
    await interaction.reply({
      content:
        `❌ Esta análise já foi assumida por <@${analysis.analystId}>.`,
      ephemeral: true
    });
    return;
  }

  const bet =
    getBet(
      analysis.betId
    );

  if (!bet) {
    await interaction.reply({
      content:
        "❌ Aposta vinculada à análise não encontrada.",
      ephemeral: true
    });
    return;
  }

  // Marca imediatamente.
  analysis.status =
    "assumida";

  analysis.analystId =
    interaction.user.id;

  bet.analystId =
    interaction.user.id;

  saveDatabase();

  await interaction.deferUpdate();

  if (bet.channelId) {
    const betChannel =
      await interaction.guild.channels
        .fetch(
          bet.channelId
        )
        .catch(() => null);

    if (betChannel) {
      await betChannel.permissionOverwrites
        .edit(
          interaction.user.id,
          {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          }
        )
        .catch(() => {});
    }
  }

  await interaction.message
    .edit({
      embeds: [
        analysisAssumedEmbed(
          analysis.type,
          bet,
          interaction.user.id
        )
      ],
      components: [
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                "analysis_claimed"
              )
              .setLabel(
                "Análise Assumida"
              )
              .setEmoji("✅")
              .setStyle(
                ButtonStyle.Success
              )
              .setDisabled(true)
          )
      ]
    })
    .catch(() => {});
}

// ============================================================
// PAGAMENTO
// ============================================================

async function confirmPayment(
  interaction,
  bet,
  targetUserId
) {
  if (!bet) {
    await interaction.reply({
      content:
        "❌ Aposta não encontrada.",
      ephemeral: true
    });
    return;
  }

  if (
    bet.status !==
    "aguardando_pagamento"
  ) {
    await interaction.reply({
      content:
        "❌ O pagamento desta aposta não está mais aberto.",
      ephemeral: true
    });
    return;
  }

  if (
    interaction.user.id !==
    targetUserId
  ) {
    await interaction.reply({
      content:
        "❌ Esse botão pertence ao outro jogador.",
      ephemeral: true
    });
    return;
  }

  if (
    !bet.players.includes(
      interaction.user.id
    )
  ) {
    await interaction.reply({
      content:
        "❌ Você não participa desta aposta.",
      ephemeral: true
    });
    return;
  }

  if (
    bet.payments[targetUserId]
  ) {
    await interaction.reply({
      content:
        "✅ Seu pagamento já foi confirmado.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({
    ephemeral: true
  });

  bet.payments[targetUserId] =
    true;

  const allPaid =
    bet.players.every(
      userId =>
        bet.payments[userId] === true
    );

  if (allPaid) {
    bet.status =
      "aguardando_sala";
  }

  saveDatabase();

  await interaction.message
    .edit({
      embeds: [
        betEmbed(bet)
      ],
      components:
        allPaid
          ? []
          : betPaymentButtons(bet)
    })
    .catch(() => {});

  await interaction.editReply({
    content:
      allPaid
        ? "✅ Pagamento confirmado. Os dois jogadores confirmaram o pagamento."
        : "✅ Pagamento confirmado."
  });

  if (allPaid) {
    await interaction.channel.send(
      "💰 Os dois jogadores confirmaram o pagamento. Aguardando o mediador abrir a sala."
    ).catch(() => {});
  }
}

// ============================================================
// CONTROLE DO MEDIADOR
// ============================================================

function canControlBet(
  interaction,
  bet
) {
  if (
    !isMediator(
      interaction.member,
      interaction.guild.id
    )
  ) {
    return {
      ok: false,
      message:
        "❌ Apenas mediadores podem controlar esta aposta."
    };
  }

  if (
    bet.mediatorId &&
    bet.mediatorId !==
      interaction.user.id
  ) {
    return {
      ok: false,
      message:
        `❌ O mediador desta aposta é <@${bet.mediatorId}>.`
    };
  }

  return {
    ok: true
  };
}

// ============================================================
// ABRIR SALA
// ============================================================

async function openRoom(
  interaction,
  bet
) {
  const permission =
    canControlBet(
      interaction,
      bet
    );

  if (!permission.ok) {
    await interaction.reply({
      content:
        permission.message,
      ephemeral: true
    });
    return;
  }

  if (
    bet.resultRecorded
  ) {
    await interaction.reply({
      content:
        "❌ O resultado desta aposta já foi registrado.",
      ephemeral: true
    });
    return;
  }

  bet.mediatorId =
    interaction.user.id;

  saveDatabase();

  await interaction.showModal(
    roomModal(bet.id)
  );
}

// ============================================================
// PROCESSAR SALA
// ============================================================

async function processRoomModal(
  interaction,
  bet
) {
  const permission =
    canControlBet(
      interaction,
      bet
    );

  if (!permission.ok) {
    await interaction.reply({
      content:
        permission.message,
      ephemeral: true
    });
    return;
  }

  const roomId =
    interaction.fields
      .getTextInputValue(
        "room_id"
      )
      .trim();

  const password =
    interaction.fields
      .getTextInputValue(
        "room_password"
      )
      .trim();

  await interaction.deferReply();

  bet.roomId =
    roomId;

  bet.roomPassword =
    password;

  bet.status =
    "em_andamento";

  bet.mediatorId =
    interaction.user.id;

  saveDatabase();

  const embed =
    new EmbedBuilder()
      .setTitle(
        "🏠 SALA ABERTA"
      )
      .setDescription([
        `🆔 ID da sala: **${roomId}**`,
        `🔑 Senha: **${password}**`,
        "",
        `👥 <@${bet.players[0]}>`,
        `👥 <@${bet.players[1]}>`
      ].join("\n"));

  applyGuildColor(
    embed,
    bet.guildId
  );

  await interaction.editReply({
    embeds: [embed]
  });

  await interaction.channel.send({
    embeds: [
      mediatorPanelEmbed(bet)
    ],
    components:
      mediatorPanelButtons(bet)
  }).catch(() => {});
}

// ============================================================
// VENCEDOR
// ============================================================

async function chooseWinner(
  interaction,
  bet
) {
  const permission =
    canControlBet(
      interaction,
      bet
    );

  if (!permission.ok) {
    await interaction.reply({
      content:
        permission.message,
      ephemeral: true
    });
    return;
  }

  if (
    bet.resultRecorded
  ) {
    await interaction.reply({
      content:
        "❌ O resultado desta aposta já foi registrado.",
      ephemeral: true
    });
    return;
  }

  bet.mediatorId =
    interaction.user.id;

  saveDatabase();

  await interaction.showModal(
    winnerModal(bet.id)
  );
}

// ============================================================
// PROCESSAR VENCEDOR
// ============================================================

async function processWinnerModal(
  interaction,
  bet
) {
  const permission =
    canControlBet(
      interaction,
      bet
    );

  if (!permission.ok) {
    await interaction.reply({
      content:
        permission.message,
      ephemeral: true
    });
    return;
  }

  if (
    bet.resultRecorded
  ) {
    await interaction.reply({
      content:
        "❌ O resultado desta aposta já foi registrado.",
      ephemeral: true
    });
    return;
  }

  const winnerId =
    interaction.fields
      .getTextInputValue(
        "winner_id"
      )
      .trim()
      .replace(
        /[<@!>]/g,
        ""
      );

  if (
    !bet.players.includes(
      winnerId
    )
  ) {
    await interaction.reply({
      content:
        "❌ O ID informado não pertence a nenhum dos jogadores.",
      ephemeral: true
    });
    return;
  }

  const loserId =
    bet.players.find(
      id => id !== winnerId
    );

  if (!loserId) {
    await interaction.reply({
      content:
        "❌ Não foi possível identificar o perdedor.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  bet.winnerId =
    winnerId;

  bet.status =
    "finalizada";

  bet.mediatorId =
    interaction.user.id;

  bet.resultRecorded =
    true;

  registerBetResult(
    interaction.guild.id,
    winnerId,
    loserId,
    bet.value,
    false
  );

  saveDatabase();

  const embed =
    new EmbedBuilder()
      .setTitle(
        "🏆 RESULTADO"
      )
      .setDescription([
        `🏆 Vencedor: <@${winnerId}>`,
        `❌ Perdedor: <@${loserId}>`,
        "",
        `💰 Valor: ${moneyBRL(bet.value)}`
      ].join("\n"));

  applyGuildColor(
    embed,
    bet.guildId
  );

  await interaction.editReply({
    embeds: [embed]
  });

  await interaction.channel.send({
    embeds: [
      mediatorPanelEmbed(bet)
    ],
    components:
      mediatorPanelButtons(bet)
  }).catch(() => {});
}

// ============================================================
// W.O.
// ============================================================

async function handleWOButton(
  interaction,
  bet
) {
  const permission =
    canControlBet(
      interaction,
      bet
    );

  if (!permission.ok) {
    await interaction.reply({
      content:
        permission.message,
      ephemeral: true
    });
    return;
  }

  if (
    bet.resultRecorded
  ) {
    await interaction.reply({
      content:
        "❌ O resultado desta aposta já foi registrado.",
      ephemeral: true
    });
    return;
  }

  bet.mediatorId =
    interaction.user.id;

  saveDatabase();

  await interaction.reply({
    content:
      "⚠️ Para registrar W.O., use `.wo <ID_DO_VENCEDOR>` neste canal.",
    ephemeral: true
  });
}

async function processWOCommand(
  message,
  args
) {
  const bet =
    findBetByChannel(
      message.channel.id
    );

  if (!bet) {
    await message.reply(
      "❌ Este comando precisa ser usado dentro de uma aposta."
    );
    return;
  }

  if (
    !isMediator(
      message.member,
      message.guild.id
    )
  ) {
    await message.reply(
      "❌ Apenas mediadores podem registrar W.O."
    );
    return;
  }

  if (
    bet.resultRecorded
  ) {
    await message.reply(
      "❌ O resultado desta aposta já foi registrado."
    );
    return;
  }

  if (
    bet.mediatorId &&
    bet.mediatorId !==
      message.author.id
  ) {
    await message.reply(
      `❌ O mediador desta aposta é <@${bet.mediatorId}>.`
    );
    return;
  }

  const winnerId =
    String(
      args[0] || ""
    )
      .trim()
      .replace(
        /[<@!>]/g,
        ""
      );

  if (
    !winnerId ||
    !bet.players.includes(
      winnerId
    )
  ) {
    await message.reply(
      "❌ Informe o ID de um dos jogadores da aposta."
    );
    return;
  }

  const loserId =
    bet.players.find(
      id => id !== winnerId
    );

  if (!loserId) {
    await message.reply(
      "❌ Não foi possível identificar o perdedor."
    );
    return;
  }

  bet.winnerId =
    winnerId;

  bet.mediatorId =
    message.author.id;

  bet.status =
    "wo";

  bet.resultRecorded =
    true;

  registerBetResult(
    message.guild.id,
    winnerId,
    loserId,
    bet.value,
    true
  );

  saveDatabase();

  const embed =
    new EmbedBuilder()
      .setTitle(
        "⚠️ VITÓRIA POR W.O."
      )
      .setDescription([
        `🏆 Vencedor: <@${winnerId}>`,
        `❌ Perdedor: <@${loserId}>`,
        "",
        `💰 Valor: ${moneyBRL(bet.value)}`
      ].join("\n"));

  applyGuildColor(
    embed,
    bet.guildId
  );

  await message.reply({
    embeds: [embed]
  });
}

// ============================================================
// FINALIZAR APOSTA
// ============================================================

async function finalizeBetChannel(
  channel,
  bet
) {
  if (!channel) {
    return;
  }

  if (bet.finalizedAt) {
    return;
  }

  bet.status =
    "finalizada";

  bet.finalizedAt =
    Date.now();

  saveDatabase();

  await channel.send({
    embeds: [
      applyGuildColor(
        new EmbedBuilder()
          .setTitle(
            "🔒 APOSTA FINALIZADA"
          )
          .setDescription([
            "A aposta foi finalizada.",
            "🗑️ Este canal será deletado em 5 segundos."
          ].join("\n")),
        bet.guildId
      )
    ]
  }).catch(() => {});

  setTimeout(
    async () => {
      try {
        await channel.delete();
      } catch (error) {
        console.error(
          "❌ Erro ao deletar canal:",
          error.message
        );
      }
    },
    5000
  );
}

// ============================================================
// CRIAR APOSTA DA FILA
// ============================================================

async function startBetFromQueue(
  queue
) {
  if (!queue) {
    return null;
  }

  if (
    queue.players.length !==
    queueCapacity()
  ) {
    return null;
  }

  const guild =
    client.guilds.cache.get(
      queue.guildId
    );

  if (!guild) {
    return null;
  }

  const mediatorId =
    assignMediator(
      queue.guildId
    );

  if (!mediatorId) {
    return null;
  }

  const config =
    getGuildConfig(
      queue.guildId
    );

  const players =
    [...queue.players];

  const gelo =
    queue.gelo;

  const bet =
    createBet({
      guildId:
        queue.guildId,

      categoryId:
        config.betsCategoryId,

      format:
        queue.format,

      modality:
        queue.modality,

      value:
        queue.value,

      players
    });

  bet.mediatorId =
    mediatorId;

  saveDatabase();

  try {
    const channel =
      await createBetChannel(
        guild,
        bet
      );

    await channel.send({
      content: [
        ...players.map(
          id => `<@${id}>`
        ),
        `<@${mediatorId}>`
      ].join(" "),

      embeds: [
        betEmbed(bet)
      ],

      components:
        betPaymentButtons(bet)
    });

    // Guarda o gelo escolhido para o 1x1.
    if (gelo) {
      bet.gelo = gelo;
    }

    saveDatabase();

    // A fila foi consumida.
    deleteQueue(queue.id);

    return bet;
  } catch (error) {
    console.error(
      "❌ Erro ao criar aposta:",
      error
    );

    // Remove aposta quebrada.
    delete db.bets[
      bet.id
    ];

    // RESTAURA a fila.
    queue.players =
      players;

    queue.gelo =
      gelo;

    db.queues[
      queue.id
    ] = queue;

    saveDatabase();

    await updateQueueMessage(
      queue
    );

    return null;
  }
}

// ============================================================
// ENTRAR NA FILA
// ============================================================

async function enterQueue(
  interaction,
  queue,
  gelo = null
) {
  if (!queue) {
    await interaction.reply({
      content:
        "❌ Fila não encontrada.",
      ephemeral: true
    });
    return;
  }

  if (
    queue.guildId !==
    interaction.guild.id
  ) {
    await interaction.reply({
      content:
        "❌ Esta fila pertence a outro servidor.",
      ephemeral: true
    });
    return;
  }

  if (
    queueLocks.has(queue.id)
  ) {
    await interaction.reply({
      content:
        "⏳ Esta fila está sendo processada. Tente novamente.",
      ephemeral: true
    });
    return;
  }

  queueLocks.add(queue.id);

  try {
    // --------------------------------------------------------
    // MEDIADOR
    // --------------------------------------------------------

    if (
      getActiveMediatorQueue(
        interaction.guild.id
      ).length === 0
    ) {
      await interaction.reply({
        content:
          "❌ Não há mediadores na fila no momento.",
        ephemeral: true
      });
      return;
    }

    // --------------------------------------------------------
    // JÁ ESTÁ NA FILA
    // --------------------------------------------------------

    if (
      queue.players.includes(
        interaction.user.id
      )
    ) {
      await interaction.reply({
        content:
          "❌ Você já está nesta fila.",
        ephemeral: true
      });
      return;
    }

    // --------------------------------------------------------
    // CHEIA
    // --------------------------------------------------------

    if (
      queue.players.length >=
      queueCapacity()
    ) {
      await interaction.reply({
        content:
          "❌ Esta fila já está cheia.",
        ephemeral: true
      });
      return;
    }

    // --------------------------------------------------------
    // GELO 1X1
    // --------------------------------------------------------

    if (
      queue.format === "1x1"
    ) {
      if (
        gelo !== "normal" &&
        gelo !== "infinito"
      ) {
        await interaction.reply({
          content:
            "❌ Escolha um tipo de gelo válido.",
          ephemeral: true
        });
        return;
      }

      if (
        queue.players.length === 0
      ) {
        queue.gelo =
          gelo;
      } else if (
        queue.players.length === 1
      ) {
        if (
          queue.gelo !==
          gelo
        ) {
          await interaction.reply({
            content:
              "❌ O segundo jogador precisa escolher o mesmo tipo de gelo.",
            ephemeral: true
          });
          return;
        }
      }
    }

    // --------------------------------------------------------
    // ACK
    // --------------------------------------------------------

    await interaction.deferReply({
      ephemeral: true
    });

    // --------------------------------------------------------
    // ADICIONAR JOGADOR
    // --------------------------------------------------------

    queue.players.push(
      interaction.user.id
    );

    saveDatabase();

    await updateQueueMessage(
      queue
    );

    // --------------------------------------------------------
    // SEGUNDO JOGADOR
    // --------------------------------------------------------

    if (
      queue.players.length ===
      queueCapacity()
    ) {
      const bet =
        await startBetFromQueue(
          queue
        );

      if (bet) {
        await interaction.editReply({
          content:
            "✅ Você entrou na fila. A aposta foi criada."
        });
      } else {
        await interaction.editReply({
          content:
            "❌ Não foi possível criar a aposta. A fila foi restaurada."
        });
      }

      return;
    }

    await interaction.editReply({
      content:
        "✅ Você entrou na fila."
    });
  } finally {
    queueLocks.delete(
      queue.id
    );
  }
}

// ============================================================
// SAIR DA FILA
// ============================================================

async function leaveQueue(
  interaction,
  queue
) {
  if (!queue) {
    await interaction.reply({
      content:
        "❌ Fila não encontrada.",
      ephemeral: true
    });
    return;
  }

  if (
    queueLocks.has(queue.id)
  ) {
    await interaction.reply({
      content:
        "⏳ Esta fila está sendo processada. Tente novamente.",
      ephemeral: true
    });
    return;
  }

  queueLocks.add(queue.id);

  try {
    const index =
      queue.players.indexOf(
        interaction.user.id
      );

    if (index === -1) {
      await interaction.reply({
        content:
          "❌ Você não está nesta fila.",
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({
      ephemeral: true
    });

    queue.players.splice(
      index,
      1
    );

    if (
      queue.format === "1x1" &&
      queue.players.length === 0
    ) {
      queue.gelo = null;
    }

    saveDatabase();

    await updateQueueMessage(
      queue
    );

    await interaction.editReply({
      content:
        "🚪 Você saiu da fila."
    });
  } finally {
    queueLocks.delete(
      queue.id
    );
  }
}

// ============================================================
// PUBLICAR FILAS
// ============================================================

async function publishQueues(
  interaction,
  channel,
  format,
  modality
) {
  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      "Canal inválido."
    );
  }

  const created = [];

  try {
    for (
      const value of VALUES
    ) {
      const queue =
        createQueueData({
          guildId:
            interaction.guild.id,
          channelId:
            channel.id,
          format,
          modality,
          value
        });

      try {
        const message =
          await channel.send({
            embeds: [
              queueEmbed(queue)
            ],
            components:
              queueButtons(queue)
          });

        queue.messageId =
          message.id;

        saveDatabase();

        created.push(queue);
      } catch (error) {
        deleteQueue(
          queue.id
        );

        throw error;
      }
    }

    return created;
  } catch (error) {
    // Remove somente filas criadas nesta publicação.
    for (
      const queue of created
    ) {
      deleteQueue(
        queue.id
      );
    }

    throw error;
  }
}

// ============================================================
// /FILA
// ============================================================

async function startFila(
  interaction
) {
  await interaction.reply({
    content:
      "🎯 Escolha o formato da fila:",
    components: [
      filaFormatSelect()
    ],
    ephemeral: true
  });
}

async function handleFilaFormat(
  interaction
) {
  const format =
    interaction.values[0];

  if (
    !FORMATS.includes(format)
  ) {
    await interaction.reply({
      content:
        "❌ Formato inválido.",
      ephemeral: true
    });
    return;
  }

  filaSelections.set(
    selectionKey(
      interaction.guild.id,
      interaction.user.id
    ),
    {
      format,
      createdAt: Date.now()
    }
  );

  await interaction.update({
    content:
      `🎯 Formato escolhido: **${format}**\n\n📱 Agora escolha a modalidade:`,
    components: [
      filaModalitySelect()
    ]
  });
}

async function handleFilaModality(
  interaction
) {
  const modality =
    interaction.values[0];

  if (
    !MODALITIES.includes(
      modality
    )
  ) {
    await interaction.reply({
      content:
        "❌ Modalidade inválida.",
      ephemeral: true
    });
    return;
  }

  const key =
    selectionKey(
      interaction.guild.id,
      interaction.user.id
    );

  const selection =
    filaSelections.get(key);

  if (!selection) {
    await interaction.reply({
      content:
        "❌ A sessão expirou. Use `/fila` novamente.",
      ephemeral: true
    });
    return;
  }

  selection.modality =
    modality;

  await interaction.update({
    content:
      `🎯 Formato: **${selection.format}**\n` +
      `📱 Modalidade: **${modality}**\n\n` +
      "📢 Agora escolha o canal onde as filas serão publicadas:",
    components: [
      filaChannelSelect()
    ]
  });
}

async function handleFilaChannel(
  interaction
) {
  const channelId =
    interaction.values[0];

  const key =
    selectionKey(
      interaction.guild.id,
      interaction.user.id
    );

  const selection =
    filaSelections.get(key);

  if (
    !selection ||
    !selection.format ||
    !selection.modality
  ) {
    await interaction.reply({
      content:
        "❌ A sessão expirou. Use `/fila` novamente.",
      ephemeral: true
    });
    return;
  }

  const channel =
    interaction.guild.channels.cache.get(
      channelId
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    await interaction.reply({
      content:
        "❌ O canal selecionado não permite mensagens.",
      ephemeral: true
    });
    return;
  }

  await interaction.update({
    content:
      "⏳ Publicando as 12 filas...",
    components: []
  });

  try {
    await publishQueues(
      interaction,
      channel,
      selection.format,
      selection.modality
    );

    filaSelections.delete(key);

    await interaction.editReply({
      content:
        `✅ **12 filas publicadas!**\n\n` +
        `🎯 Formato: **${selection.format}**\n` +
        `📱 Modalidade: **${selection.modality}**\n` +
        `📢 Canal: ${channel}`,
      components: []
    });
  } catch (error) {
    console.error(
      "❌ Erro ao publicar filas:",
      error
    );

    await interaction.editReply({
      content:
        "❌ Ocorreu um erro ao publicar as filas.",
      components: []
    }).catch(() => {});
  }
}

// ============================================================
// /MED
// ============================================================

async function publishMediatorQueue(
  interaction
) {
  const guildId =
    interaction.guild.id;

  const sent =
    await interaction.reply({
      embeds: [
        mediatorQueueEmbed(
          guildId
        )
      ],
      components:
        mediatorQueueButtons(),
      fetchReply: true
    });

  const config =
    getGuildConfig(guildId);

  config.mediatorQueueMessages ??= [];

  config.mediatorQueueMessages.push({
    channelId:
      sent.channelId,
    messageId:
      sent.id
  });

  if (
    config.mediatorQueueMessages.length >
    20
  ) {
    config.mediatorQueueMessages =
      config.mediatorQueueMessages.slice(
        -20
      );
  }

  saveDatabase();
}

// ============================================================
// CONFIG — ADMIN
// ============================================================

async function ensureAdminInteraction(
  interaction
) {
  if (
    !interaction.guild ||
    !isAdmin(
      interaction.member
    )
  ) {
    const content =
      "❌ Apenas administradores podem usar esta configuração.";

    if (
      interaction.replied ||
      interaction.deferred
    ) {
      await interaction.followUp({
        content,
        ephemeral: true
      }).catch(() => {});
    } else {
      await interaction.reply({
        content,
        ephemeral: true
      }).catch(() => {});
    }

    return false;
  }

  return true;
}

// ============================================================
// CONFIG — CANAIS
// ============================================================

async function handleConfigChannelSelect(
  interaction
) {
  if (
    !(await ensureAdminInteraction(
      interaction
    ))
  ) {
    return;
  }

  const channelId =
    interaction.values[0];

  const channel =
    await interaction.guild.channels
      .fetch(channelId)
      .catch(() => null);

  if (!channel) {
    await interaction.reply({
      content:
        "❌ Canal não encontrado.",
      ephemeral: true
    });
    return;
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  switch (
    interaction.customId
  ) {
    case "cfg_mobile_select":
      if (!channel.isTextBased()) {
        await interaction.reply({
          content:
            "❌ Selecione um canal de texto.",
          ephemeral: true
        });
        return;
      }

      config.mobileChannelId =
        channelId;
      break;

    case "cfg_emulator_select":
      if (!channel.isTextBased()) {
        await interaction.reply({
          content:
            "❌ Selecione um canal de texto.",
          ephemeral: true
        });
        return;
      }

      config.emulatorChannelId =
        channelId;
      break;

    case "cfg_category_select":
      if (
        channel.type !==
        ChannelType.GuildCategory
      ) {
        await interaction.reply({
          content:
            "❌ Você precisa selecionar uma categoria.",
          ephemeral: true
        });
        return;
      }

      config.betsCategoryId =
        channelId;
      break;

    case "cfg_mobile_analysis_select":
      if (!channel.isTextBased()) {
        await interaction.reply({
          content:
            "❌ Selecione um canal de texto.",
          ephemeral: true
        });
        return;
      }

      config.mobileAnalysisChannelId =
        channelId;
      break;

    case "cfg_emulator_analysis_select":
      if (!channel.isTextBased()) {
        await interaction.reply({
          content:
            "❌ Selecione um canal de texto.",
          ephemeral: true
        });
        return;
      }

      config.emulatorAnalysisChannelId =
        channelId;
      break;

    default:
      return;
  }

  saveDatabase();

  await interaction.update({
    embeds: [
      configEmbed(
        interaction.guild.id
      )
    ],
    components:
      configButtons()
  });
}

// ============================================================
// CONFIG — CARGOS
// ============================================================

async function handleConfigRoleSelect(
  interaction
) {
  if (
    !(await ensureAdminInteraction(
      interaction
    ))
  ) {
    return;
  }

  const roleId =
    interaction.values[0];

  const role =
    interaction.guild.roles.cache.get(
      roleId
    );

  if (!role) {
    await interaction.reply({
      content:
        "❌ Cargo não encontrado.",
      ephemeral: true
    });
    return;
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  if (
    interaction.customId ===
    "cfg_mediator_role_select"
  ) {
    config.mediatorRoleId =
      roleId;
  }

  if (
    interaction.customId ===
    "cfg_analyst_role_select"
  ) {
    config.analystRoleId =
      roleId;
  }

  saveDatabase();

  await interaction.update({
    embeds: [
      configEmbed(
        interaction.guild.id
      )
    ],
    components:
      configButtons()
  });
}

// ============================================================
// CONFIG — MEDIADORES
// ============================================================

function mediatorsListEmbed(
  guildId
) {
  const config =
    getGuildConfig(guildId);

  const embed =
    new EmbedBuilder()
      .setTitle(
        "👥 MEDIADORES"
      );

  if (
    config.mediators.length ===
    0
  ) {
    embed.setDescription(
      "Nenhum mediador cadastrado."
    );

    return applyGuildColor(
      embed,
      guildId
    );
  }

  const lines =
    config.mediators.map(
      (mediator, index) =>
        [
          `**${index + 1}. ${mediator.name}**`,
          `👤 <@${mediator.id}>`,
          `💳 Pix: \`${mediator.pix}\``,
          mediator.qr
            ? `📷 QR Code: ${mediator.qr}`
            : "📷 QR Code: não informado"
        ].join("\n")
    );

  embed
    .setDescription(
      lines.join("\n\n")
    )
    .setFooter({
      text:
        `${config.mediators.length}/${MAX_MEDIATORS} mediadores`
    });

  return applyGuildColor(
    embed,
    guildId
  );
}

function mediatorRemoveSelect(
  guildId
) {
  const config =
    getGuildConfig(guildId);

  if (
    config.mediators.length ===
    0
  ) {
    return null;
  }

  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          "cfg_remove_mediator_select"
        )
        .setPlaceholder(
          "➖ Escolha o mediador"
        )
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          config.mediators.map(
            mediator => ({
              label:
                String(
                  mediator.name
                ).slice(
                  0,
                  100
                ),
              description:
                mediator.id,
              value:
                mediator.id,
              emoji: "👤"
            })
          )
        )
    );
}

async function addMediatorId(
  interaction
) {
  if (
    !(await ensureAdminInteraction(
      interaction
    ))
  ) {
    return;
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  if (
    config.mediators.length >=
    MAX_MEDIATORS
  ) {
    await interaction.reply({
      content:
        `❌ Limite máximo atingido: ${MAX_MEDIATORS}/${MAX_MEDIATORS}.`,
      ephemeral: true
    });
    return;
  }

  // NÃO fazer fetch aqui.
  await interaction.showModal(
    mediatorAddIdModal()
  );
}

async function processMediatorId(
  interaction
) {
  const userId =
    interaction.fields
      .getTextInputValue(
        "mediator_id"
      )
      .trim()
      .replace(
        /[<@!>]/g,
        ""
      );

  if (
    !/^\d{17,20}$/.test(
      userId
    )
  ) {
    await interaction.reply({
      content:
        "❌ O ID do Discord informado é inválido.",
      ephemeral: true
    });
    return;
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  if (
    config.mediators.some(
      mediator =>
        mediator.id === userId
    )
  ) {
    await interaction.reply({
      content:
        "❌ Este usuário já está cadastrado como mediador.",
      ephemeral: true
    });
    return;
  }

  if (
    config.mediators.length >=
    MAX_MEDIATORS
  ) {
    await interaction.reply({
      content:
        `❌ Limite máximo atingido: ${MAX_MEDIATORS}/${MAX_MEDIATORS}.`,
      ephemeral: true
    });
    return;
  }

  // Muito importante:
  // NÃO buscar o membro antes do segundo modal.
  await interaction.showModal(
    mediatorDataModal(
      userId
    )
  );
}

async function processMediatorData(
  interaction
) {
  if (
    !(await ensureAdminInteraction(
      interaction
    ))
  ) {
    return;
  }

  const userId =
    interaction.customId.split(
      "|"
    )[1];

  const name =
    interaction.fields
      .getTextInputValue(
        "mediator_name"
      )
      .trim();

  const pix =
    interaction.fields
      .getTextInputValue(
        "mediator_pix"
      )
      .trim();

  const qr =
    interaction.fields
      .getTextInputValue(
        "mediator_qr"
      )
      .trim();

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  if (
    config.mediators.length >=
    MAX_MEDIATORS
  ) {
    await interaction.reply({
      content:
        `❌ Limite máximo atingido: ${MAX_MEDIATORS}/${MAX_MEDIATORS}.`,
      ephemeral: true
    });
    return;
  }

  if (
    config.mediators.some(
      mediator =>
        mediator.id === userId
    )
  ) {
    await interaction.reply({
      content:
        "❌ Este usuário já está cadastrado como mediador.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({
    ephemeral: true
  });

  const member =
    await interaction.guild.members
      .fetch(userId)
      .catch(() => null);

  if (!member) {
    await interaction.editReply({
      content:
        "❌ Não encontrei esse usuário neste servidor."
    });
    return;
  }

  config.mediators.push({
    id: userId,
    name,
    pix,
    qr
  });

  saveDatabase();

  await interaction.editReply({
    content:
      `✅ Mediador **${name}** adicionado. (${config.mediators.length}/${MAX_MEDIATORS})`
  });

  await updateMediatorQueueMessages(
    interaction.guild.id
  );
}

async function removeMediator(
  interaction
) {
  if (
    !(await ensureAdminInteraction(
      interaction
    ))
  ) {
    return;
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  if (
    config.mediators.length ===
    0
  ) {
    await interaction.reply({
      content:
        "❌ Não existem mediadores cadastrados.",
      ephemeral: true
    });
    return;
  }

  const select =
    mediatorRemoveSelect(
      interaction.guild.id
    );

  await interaction.reply({
    content:
      "➖ Escolha o mediador que deseja remover:",
    components:
      select ? [select] : [],
    ephemeral: true
  });
}

async function processRemoveMediator(
  interaction
) {
  if (
    !(await ensureAdminInteraction(
      interaction
    ))
  ) {
    return;
  }

  const userId =
    interaction.values[0];

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  const index =
    config.mediators.findIndex(
      mediator =>
        mediator.id === userId
    );

  if (index === -1) {
    await interaction.reply({
      content:
        "❌ Mediador não encontrado.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferUpdate();

  const removed =
    config.mediators.splice(
      index,
      1
    )[0];

  config.mediatorQueue =
    config.mediatorQueue.filter(
      id => id !== userId
    );

  if (
    config.mediatorRotation >=
    config.mediatorQueue.length
  ) {
    config.mediatorRotation = 0;
  }

  saveDatabase();

  await interaction.editReply({
    content:
      `✅ Mediador **${removed.name}** removido.`,
    components: []
  }).catch(() => {});

  await updateMediatorQueueMessages(
    interaction.guild.id
  );
}

// ============================================================
// CONFIG — TAXA
// ============================================================

async function processFee(
  interaction
) {
  if (
    !(await ensureAdminInteraction(
      interaction
    ))
  ) {
    return;
  }

  const raw =
    interaction.fields
      .getTextInputValue(
        "fee"
      )
      .trim()
      .replace(
        ",",
        "."
      );

  const fee =
    Number(raw);

  if (
    !Number.isFinite(fee) ||
    fee < 0
  ) {
    await interaction.reply({
      content:
        "❌ Informe uma taxa válida.",
      ephemeral: true
    });
    return;
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  config.fee =
    fee;

  saveDatabase();

  await interaction.reply({
    content:
      `✅ Taxa configurada para **${fee}%**.`,
    ephemeral: true
  });
}

// ============================================================
// CONFIG — COR
// ============================================================

async function processColor(
  interaction
) {
  if (
    !(await ensureAdminInteraction(
      interaction
    ))
  ) {
    return;
  }

  const color =
    interaction.fields
      .getTextInputValue(
        "color"
      )
      .trim();

  if (
    !/^#[0-9A-F]{6}$/i.test(
      color
    )
  ) {
    await interaction.reply({
      content:
        "❌ Cor inválida. Use, por exemplo, `#5865F2`.",
      ephemeral: true
    });
    return;
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  config.appearance.color =
    color.toUpperCase();

  saveDatabase();

  await interaction.reply({
    content:
      `✅ Cor dos embeds alterada para **${color.toUpperCase()}**.`,
    ephemeral: true
  });
}

// ============================================================
// CONFIG — AVATAR
// ============================================================

async function processAvatar(
  interaction
) {
  if (
    !(await ensureAdminInteraction(
      interaction
    ))
  ) {
    return;
  }

  const url =
    interaction.fields
      .getTextInputValue(
        "avatar_url"
      )
      .trim();

  if (
    !/^https?:\/\//i.test(
      url
    )
  ) {
    await interaction.reply({
      content:
        "❌ Informe uma URL válida começando com `http://` ou `https://`.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({
    ephemeral: true
  });

  try {
    await client.user.setAvatar(
      url
    );

    await interaction.editReply({
      content:
        "✅ Foto do bot alterada."
    });
  } catch (error) {
    console.error(
      "❌ Erro ao alterar avatar:",
      error
    );

    await interaction.editReply({
      content:
        "❌ Não foi possível alterar a foto do bot. Verifique se a URL é uma imagem válida."
    });
  }
}

// ============================================================
// REGISTRO DOS COMANDOS
// ============================================================

const slashCommands = [
  {
    name: "fila",
    description:
      "Publica as filas de apostas"
  },
  {
    name: "med",
    description:
      "Publica a fila de mediadores"
  },
  {
    name: "config",
    description:
      "Configura o bot"
  }
];

async function registerCommands() {
  try {
    const guildId =
      process.env.GUILD_ID;

    if (guildId) {
      const guild =
        client.guilds.cache.get(
          guildId
        );

      if (guild) {
        await guild.commands.set(
          slashCommands
        );

        console.log(
          `✅ Slash commands registrados em ${guild.name}.`
        );

        return;
      }

      console.log(
        "⚠️ GUILD_ID informado, mas o bot não está nesse servidor."
      );
    }

    await client.application.commands.set(
      slashCommands
    );

    console.log(
      "✅ Slash commands registrados globalmente."
    );
  } catch (error) {
    console.error(
      "❌ Erro ao registrar slash commands:",
      error
    );
  }
}

// ============================================================
// INTERAÇÕES
// ============================================================

client.on(
  Events.InteractionCreate,
  async interaction => {
    try {
      // ========================================================
      // SLASH
      // ========================================================

      if (
        interaction.isChatInputCommand()
      ) {
        if (!interaction.guild) {
          await interaction.reply({
            content:
              "❌ Este comando só pode ser usado em um servidor.",
            ephemeral: true
          });
          return;
        }

        if (
          interaction.commandName ===
          "fila"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            await interaction.reply({
              content:
                "❌ Apenas administradores podem usar `/fila`.",
              ephemeral: true
            });
            return;
          }

          await startFila(
            interaction
          );

          return;
        }

        if (
          interaction.commandName ===
          "med"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            await interaction.reply({
              content:
                "❌ Apenas administradores podem usar `/med`.",
              ephemeral: true
            });
            return;
          }

          await publishMediatorQueue(
            interaction
          );

          return;
        }

        if (
          interaction.commandName ===
          "config"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            await interaction.reply({
              content:
                "❌ Apenas administradores podem usar `/config`.",
              ephemeral: true
            });
            return;
          }

          await interaction.reply({
            embeds: [
              configEmbed(
                interaction.guild.id
              )
            ],
            components:
              configButtons(),
            ephemeral: true
          });

          return;
        }
      }

      // ========================================================
      // BOTÕES
      // ========================================================

      if (
        interaction.isButton()
      ) {
        const id =
          interaction.customId;

        // ------------------------------------------------------
        // FILA
        // ------------------------------------------------------

        if (
          id.startsWith("qe|")
        ) {
          const queue =
            getQueue(
              id.split("|")[1]
            );

          await enterQueue(
            interaction,
            queue
          );

          return;
        }

        if (
          id.startsWith("qg|")
        ) {
          const parts =
            id.split("|");

          const queue =
            getQueue(parts[1]);

          await enterQueue(
            interaction,
            queue,
            parts[2]
          );

          return;
        }

        if (
          id.startsWith("ql|")
        ) {
          const queue =
            getQueue(
              id.split("|")[1]
            );

          await leaveQueue(
            interaction,
            queue
          );

          return;
        }

        // ------------------------------------------------------
        // FILA DE MEDIADORES
        // ------------------------------------------------------

        if (
          id === "medq_join"
        ) {
          await joinMediatorQueue(
            interaction
          );
          return;
        }

        if (
          id === "medq_leave"
        ) {
          await leaveMediatorQueue(
            interaction
          );
          return;
        }

        // ------------------------------------------------------
        // PAGAMENTO
        // ------------------------------------------------------

        if (
          id.startsWith("pay|")
        ) {
          const parts =
            id.split("|");

          const bet =
            getBet(parts[1]);

          await confirmPayment(
            interaction,
            bet,
            parts[2]
          );

          return;
        }

        // ------------------------------------------------------
        // SALA
        // ------------------------------------------------------

        if (
          id.startsWith("room|")
        ) {
          const bet =
            getBet(
              id.split("|")[1]
            );

          if (!bet) {
            await interaction.reply({
              content:
                "❌ Aposta não encontrada.",
              ephemeral: true
            });
            return;
          }

          await openRoom(
            interaction,
            bet
          );

          return;
        }

        // ------------------------------------------------------
        // VENCEDOR
        // ------------------------------------------------------

        if (
          id.startsWith("winner|")
        ) {
          const bet =
            getBet(
              id.split("|")[1]
            );

          if (!bet) {
            await interaction.reply({
              content:
                "❌ Aposta não encontrada.",
              ephemeral: true
            });
            return;
          }

          await chooseWinner(
            interaction,
            bet
          );

          return;
        }

        // ------------------------------------------------------
        // W.O.
        // ------------------------------------------------------

        if (
          id.startsWith("wo|")
        ) {
          const bet =
            getBet(
              id.split("|")[1]
            );

          if (!bet) {
            await interaction.reply({
              content:
                "❌ Aposta não encontrada.",
              ephemeral: true
            });
            return;
          }

          await handleWOButton(
            interaction,
            bet
          );

          return;
        }

        // ------------------------------------------------------
        // FINALIZAR
        // ------------------------------------------------------

        if (
          id.startsWith("finish|")
        ) {
          const bet =
            getBet(
              id.split("|")[1]
            );

          if (!bet) {
            await interaction.reply({
              content:
                "❌ Aposta não encontrada.",
              ephemeral: true
            });
            return;
          }

          const permission =
            canControlBet(
              interaction,
              bet
            );

          if (!permission.ok) {
            await interaction.reply({
              content:
                permission.message,
              ephemeral: true
            });
            return;
          }

          await interaction.deferUpdate();

          bet.mediatorId =
            interaction.user.id;

          saveDatabase();

          await finalizeBetChannel(
            interaction.channel,
            bet
          );

          return;
        }

        // ------------------------------------------------------
        // ANÁLISE
        // ------------------------------------------------------

        if (
          id.startsWith(
            "analysis_claim|"
          )
        ) {
          const analysis =
            db.analyses[
              id.split("|")[1]
            ];

          await claimAnalysis(
            interaction,
            analysis
          );

          return;
        }

        // ======================================================
        // CONFIG
        // ======================================================

        if (
          id === "cfg_mobile"
        ) {
          if (
            !(await ensureAdminInteraction(
              interaction
            ))
          ) return;

          await interaction.reply({
            content:
              "📱 Escolha o canal Mobile:",
            components: [
              channelSelect(
                "cfg_mobile_select",
                "📱 Selecionar canal Mobile"
              )
            ],
            ephemeral: true
          });

          return;
        }

        if (
          id === "cfg_emulator"
        ) {
          if (
            !(await ensureAdminInteraction(
              interaction
            ))
          ) return;

          await interaction.reply({
            content:
              "🖥️ Escolha o canal Emulador:",
            components: [
              channelSelect(
                "cfg_emulator_select",
                "🖥️ Selecionar canal Emulador"
              )
            ],
            ephemeral: true
          });

          return;
        }

        if (
          id === "cfg_category"
        ) {
          if (
            !(await ensureAdminInteraction(
              interaction
            ))
          ) return;

          await interaction.reply({
            content:
              "📁 Escolha a categoria das apostas:",
            components: [
              channelSelect(
                "cfg_category_select",
                "📁 Selecionar categoria"
              )
            ],
            ephemeral: true
          });

          return;
        }

        if (
          id === "cfg_mediator_role"
        ) {
          if (
            !(await ensureAdminInteraction(
              interaction
            ))
          ) return;

          await interaction.reply({
            content:
              "👮 Escolha o cargo de Mediador:",
            components: [
              roleSelect(
                "cfg_mediator_role_select",
                "👮 Selecionar cargo"
              )
            ],
            ephemeral: true
          });

          return;
        }

        if (
          id === "cfg_analyst_role"
        ) {
          if (
            !(await ensureAdminInteraction(
              interaction
            ))
          ) return;

          await interaction.reply({
            content:
              "🔎 Escolha o cargo de Analista:",
            components: [
              roleSelect(
                "cfg_analyst_role_select",
                "🔎 Selecionar cargo"
              )
            ],
            ephemeral: true
          });

          return;
        }

        if (
          id === "cfg_mobile_analysis"
        ) {
          if (
            !(await ensureAdminInteraction(
              interaction
            ))
          ) return;

          await interaction.reply({
            content:
              "📱 Escolha o canal de análise Mobile:",
            components: [
              channelSelect(
                "cfg_mobile_analysis_select",
                "📱 Selecionar canal"
              )
            ],
            ephemeral: true
          });

          return;
        }

        if (
          id === "cfg_emulator_analysis"
        ) {
          if (
            !(await ensureAdminInteraction(
              interaction
            ))
          ) return;

          await interaction.reply({
            content:
              "🖥️ Escolha o canal de análise Emulador:",
            components: [
              channelSelect(
                "cfg_emulator_analysis_select",
                "🖥️ Selecionar canal"
              )
            ],
            ephemeral: true
          });

          return;
        }

        if (
          id === "cfg_fee_button"
        ) {
          if (
            !(await ensureAdminInteraction(
              interaction
            ))
          ) return;

          await interaction.showModal(
            feeModal()
          );

          return;
        }

        if (
          id === "cfg_mediators"
        ) {
          if (
            !(await ensureAdminInteraction(
              interaction
            ))
          ) return;

          await interaction.reply({
            embeds: [
              mediatorsListEmbed(
                interaction.guild.id
              )
            ],
            components:
              mediatorConfigButtons(),
            ephemeral: true
          });

          return;
        }

        if (
          id === "cfg_add_mediator"
        ) {
          await addMediatorId(
            interaction
          );
          return;
        }

        if (
          id === "cfg_remove_mediator"
        ) {
          await removeMediator(
            interaction
          );
          return;
        }

        if (
          id === "cfg_list_mediators"
        ) {
          if (
            !(await ensureAdminInteraction(
              interaction
            ))
          ) return;

          await interaction.reply({
            embeds: [
              mediatorsListEmbed(
                interaction.guild.id
              )
            ],
            ephemeral: true
          });

          return;
        }

        if (
          id === "cfg_appearance"
        ) {
          if (
            !(await ensureAdminInteraction(
              interaction
            ))
          ) return;

          await interaction.reply({
            content:
              "🎨 Escolha o que deseja alterar:",
            components:
              appearanceButtons(),
            ephemeral: true
          });

          return;
        }

        if (
          id === "cfg_color_button"
        ) {
          if (
            !(await ensureAdminInteraction(
              interaction
            ))
          ) return;

          await interaction.showModal(
            colorModal()
          );

          return;
        }

        if (
          id === "cfg_avatar_button"
        ) {
          if (
            !(await ensureAdminInteraction(
              interaction
            ))
          ) return;

          await interaction.showModal(
            avatarModal()
          );

          return;
        }
      }

      // ========================================================
      // SELECT MENUS
      // ========================================================

      if (
        interaction.isStringSelectMenu() ||
        interaction.isChannelSelectMenu() ||
        interaction.isRoleSelectMenu()
      ) {
        const id =
          interaction.customId;

        if (
          id === "fila_format"
        ) {
          await handleFilaFormat(
            interaction
          );
          return;
        }

        if (
          id === "fila_modality"
        ) {
          await handleFilaModality(
            interaction
          );
          return;
        }

        if (
          id === "fila_channel"
        ) {
          await handleFilaChannel(
            interaction
          );
          return;
        }

        if (
          id === "cfg_mobile_select" ||
          id === "cfg_emulator_select" ||
          id === "cfg_category_select" ||
          id === "cfg_mobile_analysis_select" ||
          id === "cfg_emulator_analysis_select"
        ) {
          await handleConfigChannelSelect(
            interaction
          );
          return;
        }

        if (
          id ===
            "cfg_mediator_role_select" ||
          id ===
            "cfg_analyst_role_select"
        ) {
          await handleConfigRoleSelect(
            interaction
          );
          return;
        }

        if (
          id ===
            "cfg_remove_mediator_select"
        ) {
          await processRemoveMediator(
            interaction
          );
          return;
        }
      }

      // ========================================================
      // MODAIS
      // ========================================================

      if (
        interaction.isModalSubmit()
      ) {
        const id =
          interaction.customId;

        if (
          id === "cfg_med_id"
        ) {
          await processMediatorId(
            interaction
          );
          return;
        }

        if (
          id.startsWith(
            "cfg_med_data|"
          )
        ) {
          await processMediatorData(
            interaction
          );
          return;
        }

        if (
          id === "cfg_fee"
        ) {
          await processFee(
            interaction
          );
          return;
        }

        if (
          id === "cfg_color"
        ) {
          await processColor(
            interaction
          );
          return;
        }

        if (
          id === "cfg_avatar"
        ) {
          await processAvatar(
            interaction
          );
          return;
        }

        if (
          id.startsWith(
            "room_modal|"
          )
        ) {
          const bet =
            getBet(
              id.split("|")[1]
            );

          if (!bet) {
            await interaction.reply({
              content:
                "❌ Aposta não encontrada.",
              ephemeral: true
            });
            return;
          }

          await processRoomModal(
            interaction,
            bet
          );

          return;
        }

        if (
          id.startsWith(
            "winner_modal|"
          )
        ) {
          const bet =
            getBet(
              id.split("|")[1]
            );

          if (!bet) {
            await interaction.reply({
              content:
                "❌ Aposta não encontrada.",
              ephemeral: true
            });
            return;
          }

          await processWinnerModal(
            interaction,
            bet
          );

          return;
        }
      }
    } catch (error) {
      console.error(
        "=========================================="
      );
      console.error(
        "❌ ERRO AO PROCESSAR INTERAÇÃO"
      );
      console.error(error);
      console.error(
        "=========================================="
      );

      try {
        if (
          interaction.replied ||
          interaction.deferred
        ) {
          await interaction.followUp({
            content:
              "❌ Ocorreu um erro ao processar essa ação.",
            ephemeral: true
          });
        } else {
          await interaction.reply({
            content:
              "❌ Ocorreu um erro ao processar essa ação.",
            ephemeral: true
          });
        }
      } catch {}
    }
  }
);

// ============================================================
// COMANDOS COM PREFIXO
// ============================================================

client.on(
  Events.MessageCreate,
  async message => {
    try {
      if (
        message.author.bot ||
        !message.guild ||
        !message.content.startsWith(
          PREFIX
        )
      ) {
        return;
      }

      const args =
        message.content
          .slice(PREFIX.length)
          .trim()
          .split(/\s+/);

      const command =
        (
          args.shift() || ""
        ).toLowerCase();

      if (!command) {
        return;
      }

      // --------------------------------------------------------
      // .P
      // --------------------------------------------------------

      if (
        command === "p"
      ) {
        await handlePlayerStats(
          message
        );
        return;
      }

      // --------------------------------------------------------
      // .MED
      // --------------------------------------------------------

      if (
        command === "med"
      ) {
        await handleDotMed(
          message
        );
        return;
      }

      // --------------------------------------------------------
      // .SSMOB
      // --------------------------------------------------------

      if (
        command === "ssmob"
      ) {
        await requestAnalysis(
          message,
          "mobile"
        );
        return;
      }

      // --------------------------------------------------------
      // .SSEMU
      // --------------------------------------------------------

      if (
        command === "ssemu"
      ) {
        await requestAnalysis(
          message,
          "emulador"
        );
        return;
      }

      // --------------------------------------------------------
      // .WO
      // --------------------------------------------------------

      if (
        command === "wo"
      ) {
        await processWOCommand(
          message,
          args
        );
        return;
      }
    } catch (error) {
      console.error(
        "❌ Erro no comando:",
        error
      );

      await message.reply(
        "❌ Ocorreu um erro ao executar o comando."
      ).catch(() => {});
    }
  }
);

// ============================================================
// LIMPEZA DAS SESSÕES /FILA
// ============================================================

setInterval(
  () => {
    const now =
      Date.now();

    for (
      const [
        key,
        value
      ] of filaSelections
    ) {
      if (
        now -
          value.createdAt >
        10 * 60 * 1000
      ) {
        filaSelections.delete(
          key
        );
      }
    }
  },
  60 * 1000
);

// ============================================================
// READY
// ============================================================

client.once(
  Events.ClientReady,
  async readyClient => {
    console.log("");
    console.log(
      "=========================================="
    );
    console.log(
      `✅ BOT ONLINE: ${readyClient.user.tag}`
    );
    console.log(
      `🌐 SERVIDORES: ${readyClient.guilds.cache.size}`
    );
    console.log(
      "=========================================="
    );
    console.log("");

    await registerCommands();
  }
);

// ============================================================
// ERROS GLOBAIS
// ============================================================

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "❌ Unhandled Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "❌ Uncaught Exception:",
      error
    );
  }
);

// ============================================================
// LOGIN
// ============================================================

console.log("🔐 Conectando ao Discord...");

client.login(TOKEN)
  .then(() => {
    console.log(
      "✅ Login enviado ao Discord."
    );
  })
  .catch(error => {
    console.error(
      "❌ Erro ao fazer login:",
      error
    );
    process.exit(1);
  });
