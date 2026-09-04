// index.js
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  REST,
  Routes,
  Events,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID || process.env.CLIENTID;
const GUILD_ID = process.env.GUILD_ID || process.env.GUILDID;

if (!TOKEN) {
  console.error("❌ TOKEN não configurado.");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("❌ CLIENT_ID não configurado.");
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CONFIG_FILE = path.join(DATA_DIR, "config.json");

const DEFAULT_CONFIG = {
  guildId: null,

  channels: {
    queueCategory: null,
    betCategory: null,
    logs: null,
    payments: null,
    results: null,
  },

  roles: {
    mediator: null,
    admin: null,
  },

  queueMessages: {},

  queues: {},

  bets: {},

  pixAdmins: {},

  mediators: [],

  settings: {
    prefix: "!",
  },
};

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      fs.writeFileSync(
        CONFIG_FILE,
        JSON.stringify(DEFAULT_CONFIG, null, 2),
        "utf8"
      );

      return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }

    const raw = fs.readFileSync(CONFIG_FILE, "utf8");

    if (!raw.trim()) {
      return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }

    const parsed = JSON.parse(raw);

    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      channels: {
        ...DEFAULT_CONFIG.channels,
        ...(parsed.channels || {}),
      },
      roles: {
        ...DEFAULT_CONFIG.roles,
        ...(parsed.roles || {}),
      },
      settings: {
        ...DEFAULT_CONFIG.settings,
        ...(parsed.settings || {}),
      },
      queueMessages: parsed.queueMessages || {},
      queues: parsed.queues || {},
      bets: parsed.bets || {},
      pixAdmins: parsed.pixAdmins || {},
      mediators: Array.isArray(parsed.mediators)
        ? parsed.mediators
        : [],
    };
  } catch (error) {
    console.error("❌ Erro ao carregar configuração:", error);

    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

let config = loadConfig();

function saveConfig() {
  try {
    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify(config, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("❌ Erro ao salvar configuração:", error);
  }
}

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.GuildMember,
    Partials.User,
  ],
});

client.queueSetup = {};
client.activeBets = {};
client.queueLocks = new Set();

// ============================================================
// CONSTANTES
// ============================================================

const VALUES = [
  30,
  50,
  75,
  100,
  200,
  300,
  500,
  700,
  1000,
  2000,
  5000,
  10000,
];

const FORMATS = {
  "1x1": "1x1",
  "2x2": "2x2",
  "3x3": "3x3",
  "4x4": "4x4",
};

const MODES = {
  gelo_normal: "Gelo Normal",
  gelo_infinito: "Gelo Infinito",
};

const QUEUE_TYPES = {
  normal: "normal",
  misto: "misto",
};

const MAX_QUEUE_PLAYERS = {
  "1x1": 2,
  "2x2": 4,
  "3x3": 6,
  "4x4": 8,
};

const BOT_NAME = "Mediador Bot";

// ============================================================
// UTILITÁRIOS
// ============================================================

function formatMoney(cents) {
  return `R$ ${(Number(cents) / 100).toFixed(2)}`;
}

function normalizeId(value) {
  return String(value || "").trim();
}

function isValidId(value) {
  return /^\d{17,20}$/.test(normalizeId(value));
}

function safeText(value, fallback = "Não informado") {
  const text = String(value ?? "").trim();

  return text || fallback;
}

function truncate(text, max = 1024) {
  const value = String(text || "");

  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 3)}...`;
}

function timestamp() {
  return Math.floor(Date.now() / 1000);
}

function discordTimestamp(ms = Date.now()) {
  return `<t:${Math.floor(ms / 1000)}:f>`;
}

function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function ensureConfigStructure() {
  if (!config || typeof config !== "object") {
    config = cloneDefaultConfig();
  }

  if (!config.channels || typeof config.channels !== "object") {
    config.channels = {};
  }

  if (!config.roles || typeof config.roles !== "object") {
    config.roles = {};
  }

  if (!config.queueMessages || typeof config.queueMessages !== "object") {
    config.queueMessages = {};
  }

  if (!config.queues || typeof config.queues !== "object") {
    config.queues = {};
  }

  if (!config.bets || typeof config.bets !== "object") {
    config.bets = {};
  }

  if (!config.pixAdmins || typeof config.pixAdmins !== "object") {
    config.pixAdmins = {};
  }

  if (!Array.isArray(config.mediators)) {
    config.mediators = [];
  }

  if (!config.settings || typeof config.settings !== "object") {
    config.settings = {};
  }
}

ensureConfigStructure();

function getGuildId(interaction) {
  return interaction?.guildId || config.guildId || GUILD_ID || null;
}

function isAdmin(member) {
  if (!member) {
    return false;
  }

  if (member.permissions?.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  const adminRoleId = config.roles?.admin;

  if (
    adminRoleId &&
    member.roles?.cache?.has(adminRoleId)
  ) {
    return true;
  }

  return false;
}

function isMediator(member) {
  if (!member) {
    return false;
  }

  if (isAdmin(member)) {
    return true;
  }

  const userId = member.id;

  if (Array.isArray(config.mediators)) {
    if (config.mediators.includes(userId)) {
      return true;
    }
  }

  const mediatorRoleId = config.roles?.mediator;

  if (
    mediatorRoleId &&
    member.roles?.cache?.has(mediatorRoleId)
  ) {
    return true;
  }

  return false;
}

function getMember(interaction) {
  return interaction?.member || null;
}

function canManage(interaction) {
  return isAdmin(getMember(interaction));
}

function canMediate(interaction) {
  return isMediator(getMember(interaction));
}

async function sendSafeReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.followUp(payload);
    }

    return await interaction.reply(payload);
  } catch (error) {
    console.error("❌ Erro ao responder interação:", error);
    return null;
  }
}

async function deferSafe(interaction, ephemeral = true) {
  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply({ ephemeral });
      return true;
    }

    return false;
  } catch (error) {
    console.error("❌ Erro ao deferir interação:", error);
    return false;
  }
}

async function editSafeReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(payload);
    }

    return await interaction.reply(payload);
  } catch (error) {
    console.error("❌ Erro ao editar resposta:", error);
    return null;
  }
}

async function fetchGuild(guildId) {
  if (!guildId) {
    return null;
  }

  try {
    return await client.guilds.fetch(guildId);
  } catch (error) {
    console.error("❌ Erro ao buscar servidor:", error);
    return null;
  }
}

async function fetchChannel(channelId) {
  if (!channelId) {
    return null;
  }

  try {
    return await client.channels.fetch(channelId);
  } catch (error) {
    console.error("❌ Erro ao buscar canal:", error);
    return null;
  }
}

async function fetchUser(userId) {
  if (!userId) {
    return null;
  }

  try {
    return await client.users.fetch(userId);
  } catch (error) {
    console.error("❌ Erro ao buscar usuário:", error);
    return null;
  }
}

// ============================================================
// CHAVES DE FILA
// ============================================================

function makeQueueKey(
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  return [
    guildId,
    format,
    mode,
    Number(value),
    type,
  ].join("|");
}

function getQueue(
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  const key = makeQueueKey(
    guildId,
    format,
    mode,
    value,
    type
  );

  if (!config.queues[key]) {
    config.queues[key] = {
      key,
      guildId,
      format,
      mode,
      value: Number(value),
      type,
      players: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  const queue = config.queues[key];

  if (!Array.isArray(queue.players)) {
    queue.players = [];
  }

  return queue;
}

function getQueueChoiceKey(
  guildId,
  format,
  mode,
  type = "normal"
) {
  return [
    guildId,
    format,
    mode,
    type,
  ].join("|");
}

function getQueueChoices(
  guildId,
  format,
  mode,
  type = "normal"
) {
  const key = getQueueChoiceKey(
    guildId,
    format,
    mode,
    type
  );

  if (!config.queueChoices) {
    config.queueChoices = {};
  }

  if (!Array.isArray(config.queueChoices[key])) {
    config.queueChoices[key] = [];
  }

  return config.queueChoices[key];
}

function clearQueueChoices(
  guildId,
  format,
  mode,
  type = "normal"
) {
  const key = getQueueChoiceKey(
    guildId,
    format,
    mode,
    type
  );

  if (config.queueChoices) {
    delete config.queueChoices[key];
  }
}

function requiredPlayers(format) {
  return MAX_QUEUE_PLAYERS[format] || 2;
}

function isQueueFull(queue) {
  return (
    Array.isArray(queue?.players) &&
    queue.players.length >=
      requiredPlayers(queue.format)
  );
}

function userInQueue(queue, userId) {
  return Boolean(
    queue?.players?.some(
      player =>
        (player?.userId || player?.id) ===
        userId
    )
  );
}

function removeUserFromQueue(queue, userId) {
  if (!queue || !Array.isArray(queue.players)) {
    return false;
  }

  const index = queue.players.findIndex(
    player =>
      (player?.userId || player?.id) ===
      userId
  );

  if (index === -1) {
    return false;
  }

  queue.players.splice(index, 1);

  return true;
}

// ============================================================
// EMBEDS
// ============================================================

function getGuildConfig(guildId) {
  if (!guildId) {
    return config;
  }

  if (!config.guilds) {
    config.guilds = {};
  }

  if (!config.guilds[guildId]) {
    config.guilds[guildId] = cloneDefaultConfig();
    config.guilds[guildId].guildId = guildId;
  }

  return {
    ...config,
    ...config.guilds[guildId],
    channels: {
      ...config.channels,
      ...(config.guilds[guildId].channels || {}),
    },
    roles: {
      ...config.roles,
      ...(config.guilds[guildId].roles || {}),
    },
    settings: {
      ...config.settings,
      ...(config.guilds[guildId].settings || {}),
    },
  };
}

function getEmbedColor(guildId) {
  const guildConfig =
    getGuildConfig(guildId);

  return (
    guildConfig.embedColor ||
    guildConfig.settings?.embedColor ||
    "#5865F2"
  );
}

function createEmbed(
  guildId,
  title,
  description
) {
  const embed =
    new EmbedBuilder()
      .setColor(getEmbedColor(guildId))
      .setTitle(
        safeText(
          title,
          BOT_NAME
        )
      )
      .setDescription(
        safeText(
          description,
          " "
        )
      )
      .setTimestamp();

  const guildConfig =
    getGuildConfig(guildId);

  if (guildConfig.botAvatar) {
    embed.setThumbnail(
      guildConfig.botAvatar
    );
  }

  return embed;
}

function modeLabel(mode) {
  if (mode === "gelo_normal") {
    return "🧊 Gelo Normal";
  }

  if (mode === "gelo_infinito") {
    return "♾️ Gelo Infinito";
  }

  return safeText(mode);
}

function formatLabel(format) {
  return safeText(format);
}

function queueTypeLabel(type) {
  if (type === "misto") {
    return "🔀 Misto";
  }

  return "👤 Normal";
}

function queueEmbed(queue) {
  const players =
    Array.isArray(queue?.players)
      ? queue.players
      : [];

  const required =
    requiredPlayers(queue?.format);

  const playerText =
    players.length
      ? players
          .map(
            (player, index) =>
              `${index + 1}. <@${player.userId || player.id}>`
          )
          .join("\n")
      : "Nenhum jogador na fila.";

  return createEmbed(
    queue.guildId,
    `🎮 FILA ${formatLabel(queue.format)}`,
    [
      `🎯 **Modalidade:** ${modeLabel(queue.mode)}`,
      `💰 **Valor:** ${formatMoney(queue.value)}`,
      `📌 **Tipo:** ${queueTypeLabel(queue.type)}`,
      "",
      `👥 **Jogadores:** ${players.length}/${required}`,
      playerText,
      "",
      "Clique em **Entrar na fila** para participar.",
    ].join("\n")
  );
}

function queueButtons(queue) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          [
            "queue_join",
            queue.format,
            queue.mode,
            queue.value,
            queue.type,
          ].join("|")
        )
        .setLabel("Entrar na fila")
        .setEmoji("🎮")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          [
            "queue_leave",
            queue.format,
            queue.mode,
            queue.value,
            queue.type,
          ].join("|")
        )
        .setLabel("Sair da fila")
        .setEmoji("🚪")
        .setStyle(
          ButtonStyle.Danger
        )
    ),
  ];
}

// ============================================================
// APOSTAS
// ============================================================

function betEmbed(bet) {
  const players =
    Array.isArray(bet?.players)
      ? bet.players
      : [];

  const playerText =
    players.length
      ? players
          .map(
            (player, index) =>
              `${index + 1}. <@${player.userId || player.id}>`
          )
          .join("\n")
      : "Nenhum jogador.";

  let statusText =
    "⏳ Aguardando processamento.";

  if (bet.status === "confirmed") {
    statusText =
      "✅ Aposta confirmada.";
  } else if (
    bet.status === "cancelled"
  ) {
    statusText =
      "❌ Aposta cancelada.";
  } else if (
    bet.status === "finished"
  ) {
    statusText =
      "🏆 Aposta finalizada.";
  }

  return createEmbed(
    bet.guildId,
    "🎮 APOSTA",
    [
      `💰 **Valor:** ${formatMoney(bet.value)}`,
      `🎯 **Formato:** ${formatLabel(bet.format)}`,
      `🕹️ **Modalidade:** ${modeLabel(bet.mode)}`,
      `📌 **Tipo:** ${queueTypeLabel(bet.type)}`,
      "",
      `👥 **Jogadores:**`,
      playerText,
      "",
      `📊 **Status:** ${statusText}`,
    ].join("\n")
  );
}

function betButtons(bet) {
  if (
    bet.status !== "waiting" &&
    bet.status !== "pending"
  ) {
    return [];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `bet_ready|${bet.value}|${bet.channelId}`
        )
        .setLabel("Confirmar aposta")
        .setEmoji("✅")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          `bet_cancel|${bet.channelId}`
        )
        .setLabel("Cancelar")
        .setEmoji("❌")
        .setStyle(
          ButtonStyle.Danger
        )
    ),
  ];
}

// ============================================================
// CONFIGURAÇÃO DOS CANAIS
// ============================================================

function getConfiguredChannel(
  guildId,
  key
) {
  const guildConfig =
    getGuildConfig(guildId);

  return (
    guildConfig.channels?.[key] ||
    null
  );
}

async function registerQueueMessage(
  channel,
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  if (!channel?.isTextBased?.()) {
    throw new Error(
      "Canal inválido para publicar fila."
    );
  }

  const queue = getQueue(
    guildId,
    format,
    mode,
    value,
    type
  );

  const message =
    await channel.send({
      embeds: [
        queueEmbed(queue),
      ],
      components:
        queueButtons(queue),
    });

  if (!config.guilds) {
    config.guilds = {};
  }

  if (!config.guilds[guildId]) {
    config.guilds[guildId] =
      cloneDefaultConfig();

    config.guilds[guildId].guildId =
      guildId;
  }

  if (
    !config.guilds[guildId]
      .queueMessages
  ) {
    config.guilds[guildId]
      .queueMessages = {};
  }

  const key = makeQueueKey(
    guildId,
    format,
    mode,
    value,
    type
  );

  config.guilds[guildId]
    .queueMessages[key] =
    message.id;

  if (
    !config.queueMessages
  ) {
    config.queueMessages = {};
  }

  config.queueMessages[key] =
    message.id;

  saveConfig();

  return message;
}

// ============================================================
// CRIAÇÃO DO CANAL DA APOSTA
// ============================================================

async function createBetChannel(
  guild,
  queue,
  players
) {
  if (!guild) {
    throw new Error(
      "Servidor não encontrado."
    );
  }

  const categoryId =
    getConfiguredChannel(
      guild.id,
      "betCategory"
    );

  const channelName =
    `aposta-${String(
      queue.format
    ).replace(
      /[^a-zA-Z0-9-]/g,
      ""
    )}-${queue.value}`;

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel,
      ],
    },
  ];

  for (const player of players) {
    const userId =
      player.userId ||
      player.id;

    if (!userId) {
      continue;
    }

    permissionOverwrites.push({
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  if (config.roles?.mediator) {
    permissionOverwrites.push({
      id: config.roles.mediator,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  if (config.roles?.admin) {
    permissionOverwrites.push({
      id: config.roles.admin,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const options = {
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites,
  };

  if (
    categoryId &&
    guild.channels.cache.has(categoryId)
  ) {
    options.parent =
      categoryId;
  }

  const channel =
    await guild.channels.create(
      options
    );

  const betId =
    `${guild.id}-${channel.id}`;

  const bet = {
    id: betId,
    channelId: channel.id,
    guildId: guild.id,
    format: queue.format,
    mode: queue.mode,
    value: Number(queue.value),
    type: queue.type,
    players: players.map(
      (player) => ({
        userId:
          player.userId ||
          player.id,
        joinedAt:
          player.joinedAt ||
          Date.now(),
      })
    ),
    createdBy:
      players[0]?.userId ||
      players[0]?.id ||
      null,
    createdAt: Date.now(),
    status: "waiting",
  };

  config.bets[betId] =
    bet;

  saveConfig();

  await channel.send({
    embeds: [
      betEmbed(bet),
    ],
    components:
      betButtons(bet),
  });

  return {
    channel,
    bet,
  };
}

// ============================================================
// FILA — ENTRAR
// ============================================================

async function handleQueueJoin(
  interaction
) {
  const parts =
    String(
      interaction.customId || ""
    ).split("|");

  if (parts.length < 5) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Dados da fila inválidos.",
        ephemeral: true,
      }
    );
  }

  const [
    action,
    format,
    mode,
    rawValue,
    type = "normal",
  ] = parts;

  if (
    action !==
    "queue_join"
  ) {
    return;
  }

  const value =
    Number(rawValue);

  if (
    !Object.values(
      FORMATS
    ).includes(format)
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Formato de fila inválido.",
        ephemeral: true,
      }
    );
  }

  if (
    !Object.keys(
      MODES
    ).includes(mode)
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Modo de fila inválido.",
        ephemeral: true,
      }
    );
  }

  if (
    !VALUES.includes(
      value
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Valor de fila inválido.",
        ephemeral: true,
      }
    );
  }

  if (
    !Object.values(
      QUEUE_TYPES
    ).includes(type)
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Tipo de fila inválido.",
        ephemeral: true,
      }
    );
  }

  const guildId =
    getGuildId(
      interaction
    );

  if (!guildId) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Servidor não configurado.",
        ephemeral: true,
      }
    );
  }

  const queueKey =
    makeQueueKey(
      guildId,
      format,
      mode,
      value,
      type
    );

  if (
    client.queueLocks.has(
      queueKey
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "⏳ Aguarde, processando a fila...",
        ephemeral: true,
      }
    );
  }

  client.queueLocks.add(
    queueKey
  );

  try {
    const queue =
      getQueue(
        guildId,
        format,
        mode,
        value,
        type
      );

    if (
      userInQueue(
        queue,
        interaction.user.id
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "⚠️ Você já está nessa fila.",
          ephemeral: true,
        }
      );
    }

    if (
      isQueueFull(
        queue
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Essa fila já está cheia.",
          ephemeral: true,
        }
      );
    }

    queue.players.push({
      userId:
        interaction.user.id,
      joinedAt:
        Date.now(),
    });

    queue.updatedAt =
      Date.now();

    saveConfig();

    try {
      await interaction.message.edit(
        {
          embeds: [
            queueEmbed(
              queue
            ),
          ],
          components:
            queueButtons(
              queue
            ),
        }
      );
    } catch (error) {
      console.error(
        "❌ Erro ao atualizar fila após entrada:",
        error
      );
    }

    if (
      isQueueFull(
        queue
      )
    ) {
      const players =
        [...queue.players];

      try {
        await createBetChannel(
          interaction.guild,
          queue,
          players
        );

        queue.players =
          [];

        queue.updatedAt =
          Date.now();

        saveConfig();

        try {
          await interaction.message.edit(
            {
              embeds: [
                queueEmbed(
                  queue
                ),
              ],
              components:
                queueButtons(
                  queue
                ),
            }
          );
        } catch (error) {
          console.error(
            "❌ Erro ao limpar fila após criação da aposta:",
            error
          );
        }

        await sendSafeReply(
          interaction,
          {
            content:
              "✅ Fila completa! O canal da aposta foi criado.",
            ephemeral: true,
          }
        );
      } catch (error) {
        console.error(
          "❌ Erro ao criar canal da aposta:",
          error
        );

        queue.players =
          players;

        saveConfig();

        await sendSafeReply(
          interaction,
          {
            content:
              "❌ Não foi possível criar o canal da aposta.",
            ephemeral: true,
          }
        );
      }

      return;
    }

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Você entrou na fila!",
        ephemeral: true,
      }
    );
  } finally {
    client.queueLocks.delete(
      queueKey
    );
  }
}

// ============================================================
// FILA — SAIR
// ============================================================

async function handleQueueLeave(
  interaction
) {
  const parts =
    String(
      interaction.customId || ""
    ).split("|");

  if (parts.length < 5) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Dados da fila inválidos.",
        ephemeral: true,
      }
    );
  }

  const [
    action,
    format,
    mode,
    rawValue,
    type = "normal",
  ] = parts;

  if (
    action !==
    "queue_leave"
  ) {
    return;
  }

  const value =
    Number(rawValue);

  if (
    !Object.values(
      FORMATS
    ).includes(format)
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Formato de fila inválido.",
        ephemeral: true,
      }
    );
  }

  if (
    !Object.keys(
      MODES
    ).includes(mode)
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Modo de fila inválido.",
        ephemeral: true,
      }
    );
  }

  if (
    !VALUES.includes(
      value
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Valor de fila inválido.",
        ephemeral: true,
      }
    );
  }

  if (
    !Object.values(
      QUEUE_TYPES
    ).includes(type)
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Tipo de fila inválido.",
        ephemeral: true,
      }
    );
  }

  const guildId =
    getGuildId(
      interaction
    );

  if (!guildId) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Servidor não configurado.",
        ephemeral: true,
      }
    );
  }

  const queue =
    getQueue(
      guildId,
      format,
      mode,
      value,
      type
    );

  const removed =
    removeUserFromQueue(
      queue,
      interaction.user.id
    );

  if (!removed) {
    return sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Você não está nessa fila.",
        ephemeral: true,
      }
    );
  }

  queue.updatedAt =
    Date.now();

  saveConfig();

  try {
    await interaction.message.edit(
      {
        embeds: [
          queueEmbed(
            queue
          ),
        ],
        components:
          queueButtons(
            queue
          ),
      }
    );
  } catch (error) {
    console.error(
      "❌ Erro ao atualizar fila após saída:",
      error
    );
  }

  await sendSafeReply(
    interaction,
    {
      content:
        "✅ Você saiu da fila.",
      ephemeral: true,
    }
  );
}

// ============================================================
// CONFIGURAÇÃO DE FILA
// ============================================================

async function handleQueueSetupChannel(
  interaction
) {
  const setup =
    client.queueSetup[
      interaction.user.id
    ];

  if (!setup) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Sua configuração de fila expirou. Comece novamente.",
        ephemeral: true,
      }
    );
  }

  const channelId =
    interaction.values?.[0];

  if (
    !channelId ||
    channelId === "none"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Canal inválido.",
        ephemeral: true,
      }
    );
  }

  const targetChannel =
    interaction.guild.channels.cache.get(
      channelId
    );

  if (
    !targetChannel ||
    targetChannel.type !==
      ChannelType.GuildText
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ O canal selecionado não é um canal de texto válido.",
        ephemeral: true,
      }
    );
  }

  const numericValue =
    Number(setup.value);

  if (
    !setup.format ||
    !setup.mode ||
    !Number.isFinite(
      numericValue
    ) ||
    !VALUES.includes(
      numericValue
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ A configuração da fila está incompleta ou possui um valor inválido.",
        ephemeral: true,
      }
    );
  }

  const type =
    setup.type ||
    "normal";

  if (
    !Object.values(
      QUEUE_TYPES
    ).includes(type)
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Tipo de fila inválido.",
        ephemeral: true,
      }
    );
  }

  try {
    await registerQueueMessage(
      targetChannel,
      interaction.guildId,
      setup.format,
      setup.mode,
      numericValue,
      type
    );

    delete client.queueSetup[
      interaction.user.id
    ];

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Fila publicada em ${targetChannel}.`,
        ephemeral: true,
      }
    );
  } catch (error) {
    console.error(
      "❌ Erro ao publicar fila:",
      error
    );

    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Não foi possível publicar a fila. Verifique as permissões do bot.",
        ephemeral: true,
      }
    );
  }
}

// ============================================================
// MEDIADORES
// ============================================================

async function addMediator(
  interaction,
  userId
) {
  const id =
    normalizeId(
      userId
    );

  if (!isValidId(id)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ ID do Discord inválido.",
        ephemeral: true,
      }
    );
  }

  if (
    !Array.isArray(
      config.mediators
    )
  ) {
    config.mediators =
      [];
  }

  if (
    config.mediators.includes(
      id
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Esse usuário já é mediador.",
        ephemeral: true,
      }
    );
  }

  config.mediators.push(
    id
  );

  saveConfig();

  return sendSafeReply(
    interaction,
    {
      content:
        `✅ <@${id}> foi adicionado como mediador.`,
      ephemeral: true,
    }
  );
}

async function removeMediator(
  interaction,
  userId
) {
  const id =
    normalizeId(
      userId
    );

  if (!isValidId(id)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ ID do Discord inválido.",
        ephemeral: true,
      }
    );
  }

  if (
    !Array.isArray(
      config.mediators
    )
  ) {
    config.mediators =
      [];
  }

  const index =
    config.mediators.indexOf(
      id
    );

  if (index === -1) {
    return sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Esse usuário não está cadastrado como mediador.",
        ephemeral: true,
      }
    );
  }

  config.mediators.splice(
    index,
    1
  );

  saveConfig();

  return sendSafeReply(
    interaction,
    {
      content:
        `✅ <@${id}> foi removido dos mediadores.`,
      ephemeral: true,
    }
  );
}

// ============================================================
// CONFIGURAÇÃO DE PIX
// ============================================================

function getPixAdmins(
  guildId
) {
  if (!config.pixAdmins) {
    config.pixAdmins =
      {};
  }

  if (
    !Array.isArray(
      config.pixAdmins[guildId]
    )
  ) {
    config.pixAdmins[guildId] =
      [];
  }

  return config.pixAdmins[
    guildId
  ];
}

function addPixAdmin(
  guildId,
  userId
) {
  const id =
    normalizeId(
      userId
    );

  if (!isValidId(id)) {
    return false;
  }

  const admins =
    getPixAdmins(
      guildId
    );

  if (
    !admins.includes(id)
  ) {
    admins.push(id);
    saveConfig();
  }

  return true;
}

function removePixAdmin(
  guildId,
  userId
) {
  const id =
    normalizeId(
      userId
    );

  const admins =
    getPixAdmins(
      guildId
    );

  const index =
    admins.indexOf(id);

  if (index === -1) {
    return false;
  }

  admins.splice(
    index,
    1
  );

  saveConfig();

  return true;
}

function isPixAdmin(
  guildId,
  userId
) {
  if (
    isAdmin(
      client.guilds.cache
        .get(guildId)
        ?.members.cache.get(
          userId
        )
    )
  ) {
    return true;
  }

  return getPixAdmins(
    guildId
  ).includes(
    userId
  );
}

// ============================================================
// CONFIGURAÇÃO GERAL
// ============================================================

function configurationEmbed(
  guildId
) {
  const guildConfig =
    getGuildConfig(
      guildId
    );

  return createEmbed(
    guildId,
    "⚙️ CONFIGURAÇÃO DO BOT",
    [
      "Configure o bot usando os botões abaixo.",
      "",
      `🎰 **Categoria de filas:** ${
        guildConfig.channels
          ?.queueCategory
          ? `<#${guildConfig.channels.queueCategory}>`
          : "Não configurada"
      }`,
      `🎮 **Categoria de apostas:** ${
        guildConfig.channels
          ?.betCategory
          ? `<#${guildConfig.channels.betCategory}>`
          : "Não configurada"
      }`,
      `📝 **Canal de logs:** ${
        guildConfig.channels
          ?.logs
          ? `<#${guildConfig.channels.logs}>`
          : "Não configurado"
      }`,
      `💳 **Canal de pagamentos:** ${
        guildConfig.channels
          ?.payments
          ? `<#${guildConfig.channels.payments}>`
          : "Não configurado"
      }`,
      `🏆 **Canal de resultados:** ${
        guildConfig.channels
          ?.results
          ? `<#${guildConfig.channels.results}>`
          : "Não configurado"
      }`,
      "",
      `👮 **Cargo mediador:** ${
        guildConfig.roles
          ?.mediator
          ? `<@&${guildConfig.roles.mediator}>`
          : "Não configurado"
      }`,
      `👑 **Cargo administrador:** ${
        guildConfig.roles
          ?.admin
          ? `<@&${guildConfig.roles.admin}>`
          : "Não configurado"
      }`,
    ].join("\n")
  );
}

function configurationComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config_channels"
        )
        .setLabel(
          "Canais"
        )
        .setEmoji(
          "📁"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_roles"
        )
        .setLabel(
          "Cargos"
        )
        .setEmoji(
          "👮"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_bets"
        )
        .setLabel(
          "Apostas"
        )
        .setEmoji(
          "🎰"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_appearance"
        )
        .setLabel(
          "Aparência"
        )
        .setEmoji(
          "🎨"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),
  ];
}

// ============================================================
// CONFIGURAÇÃO DE CANAIS
// ============================================================

function channelsConfigEmbed(
  guildId
) {
  const cfg =
    getGuildConfig(
      guildId
    );

  return createEmbed(
    guildId,
    "📁 CONFIGURAÇÃO DE CANAIS",
    [
      `🎰 **Fila:** ${
        cfg.channels?.queueCategory
          ? `<#${cfg.channels.queueCategory}>`
          : "Não configurada"
      }`,
      `🎮 **Apostas:** ${
        cfg.channels?.betCategory
          ? `<#${cfg.channels.betCategory}>`
          : "Não configurada"
      }`,
      `📝 **Logs:** ${
        cfg.channels?.logs
          ? `<#${cfg.channels.logs}>`
          : "Não configurado"
      }`,
      `💳 **Pagamentos:** ${
        cfg.channels?.payments
          ? `<#${cfg.channels.payments}>`
          : "Não configurado"
      }`,
      `🏆 **Resultados:** ${
        cfg.channels?.results
          ? `<#${cfg.channels.results}>`
          : "Não configurado"
      }`,
    ].join("\n")
  );
}

function channelsConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_queue_category"
        )
        .setPlaceholder(
          "Selecione a categoria de filas"
        )
        .addChannelTypes(
          ChannelType.GuildCategory
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_bet_category"
        )
        .setPlaceholder(
          "Selecione a categoria de apostas"
        )
        .addChannelTypes(
          ChannelType.GuildCategory
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_logs_channel"
        )
        .setPlaceholder(
          "Selecione o canal de logs"
        )
        .addChannelTypes(
          ChannelType.GuildText
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_payments_channel"
        )
        .setPlaceholder(
          "Selecione o canal de pagamentos"
        )
        .addChannelTypes(
          ChannelType.GuildText
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_results_channel"
        )
        .setPlaceholder(
          "Selecione o canal de resultados"
        )
        .addChannelTypes(
          ChannelType.GuildText
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),
  ];
}

// ============================================================
// CONFIGURAÇÃO DE CARGOS
// ============================================================

function rolesConfigEmbed(
  guildId
) {
  const cfg =
    getGuildConfig(
      guildId
    );

  return createEmbed(
    guildId,
    "👮 CONFIGURAÇÃO DE CARGOS",
    [
      `👮 **Mediador:** ${
        cfg.roles?.mediator
          ? `<@&${cfg.roles.mediator}>`
          : "Não configurado"
      }`,
      `👑 **Administrador:** ${
        cfg.roles?.admin
          ? `<@&${cfg.roles.admin}>`
          : "Não configurado"
      }`,
    ].join("\n")
  );
}

function rolesConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(
          "config_mediator_role"
        )
        .setPlaceholder(
          "Selecione o cargo de mediador"
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(
          "config_admin_role"
        )
        .setPlaceholder(
          "Selecione o cargo de administrador"
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),
  ];
}

// ============================================================
// CONFIGURAÇÃO DE APOSTAS
// ============================================================

function betsConfigEmbed(
  guildId
) {
  const cfg =
    getGuildConfig(
      guildId
    );

  return createEmbed(
    guildId,
    "🎰 CONFIGURAÇÃO DE APOSTAS",
    `💰 **Taxa do ADM:** ${formatMoney(
      cfg.admFee || 0
    )}\n\n` +
      "Configure as opções relacionadas às apostas usando os controles abaixo."
  );
}

function betsComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config_fee_set"
        )
        .setLabel(
          "Configurar taxa"
        )
        .setEmoji(
          "💰"
        )
        .setStyle(
          ButtonStyle.Primary
        )
    ),
  ];
}

// ============================================================
// APARÊNCIA
// ============================================================

function appearanceEmbed(
  guildId
) {
  const cfg =
    getGuildConfig(
      guildId
    );

  return createEmbed(
    guildId,
    "🎨 APARÊNCIA",
    [
      `🎨 **Cor atual:** \`${safeText(
        cfg.embedColor ||
          cfg.settings?.embedColor,
        "#5865F2"
      )}\``,
      "",
      `🖼️ **Avatar do bot:** ${
        cfg.botAvatar
          ? "Configurado"
          : "Não configurado"
      }`,
    ].join("\n")
  );
}

function appearanceComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "appearance_color"
        )
        .setLabel(
          "Alterar cor"
        )
        .setEmoji(
          "🎨"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "appearance_avatar"
        )
        .setLabel(
          "Alterar avatar"
        )
        .setEmoji(
          "🖼️"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),
  ];
}        }))
      )
  );

  return;
}

// ============================================================
// INTERAÇÕES DE CONFIGURAÇÃO
// ============================================================

async function handleConfigInteraction(
  interaction
) {
  const id =
    String(
      interaction.customId || ""
    );

  if (
    !id.startsWith("config_") &&
    !id.startsWith("appearance_")
  ) {
    return false;
  }

  if (
    !interaction.guildId
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa ação só pode ser usada dentro de um servidor.",
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    !canManage(
      interaction
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para configurar o bot.",
        ephemeral: true,
      }
    );

    return true;
  }

  const guildId =
    interaction.guildId;

  if (
    id ===
    "config_channels"
  ) {
    await sendSafeReply(
      interaction,
      {
        embeds: [
          channelsConfigEmbed(
            guildId
          ),
        ],
        components:
          channelsConfigComponents(),
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    id ===
    "config_roles"
  ) {
    await sendSafeReply(
      interaction,
      {
        embeds: [
          rolesConfigEmbed(
            guildId
          ),
        ],
        components:
          rolesConfigComponents(),
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    id ===
    "config_bets"
  ) {
    await sendSafeReply(
      interaction,
      {
        embeds: [
          betsConfigEmbed(
            guildId
          ),
        ],
        components:
          betsComponents(),
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    id ===
    "config_appearance"
  ) {
    await sendSafeReply(
      interaction,
      {
        embeds: [
          appearanceEmbed(
            guildId
          ),
        ],
        components:
          appearanceComponents(),
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    id ===
    "config_queue_category"
  ) {
    const channelId =
      interaction.values?.[0];

    if (!channelId) {
      return true;
    }

    if (!config.guilds) {
      config.guilds = {};
    }

    if (
      !config.guilds[
        guildId
      ]
    ) {
      config.guilds[
        guildId
      ] =
        cloneDefaultConfig();
    }

    if (
      !config.guilds[
        guildId
      ].channels
    ) {
      config.guilds[
        guildId
      ].channels = {};
    }

    config.guilds[
      guildId
    ].channels.queueCategory =
      channelId;

    config.channels.queueCategory =
      channelId;

    saveConfig();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Categoria de filas definida: <#${channelId}>`,
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    id ===
    "config_bet_category"
  ) {
    const channelId =
      interaction.values?.[0];

    if (!channelId) {
      return true;
    }

    if (!config.guilds) {
      config.guilds = {};
    }

    if (
      !config.guilds[
        guildId
      ]
    ) {
      config.guilds[
        guildId
      ] =
        cloneDefaultConfig();
    }

    if (
      !config.guilds[
        guildId
      ].channels
    ) {
      config.guilds[
        guildId
      ].channels = {};
    }

    config.guilds[
      guildId
    ].channels.betCategory =
      channelId;

    config.channels.betCategory =
      channelId;

    saveConfig();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Categoria de apostas definida: <#${channelId}>`,
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    id ===
    "config_logs_channel"
  ) {
    const channelId =
      interaction.values?.[0];

    if (!channelId) {
      return true;
    }

    if (!config.guilds) {
      config.guilds = {};
    }

    if (
      !config.guilds[
        guildId
      ]
    ) {
      config.guilds[
        guildId
      ] =
        cloneDefaultConfig();
    }

    if (
      !config.guilds[
        guildId
      ].channels
    ) {
      config.guilds[
        guildId
      ].channels = {};
    }

    config.guilds[
      guildId
    ].channels.logs =
      channelId;

    config.channels.logs =
      channelId;

    saveConfig();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal de logs definido: <#${channelId}>`,
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    id ===
    "config_payments_channel"
  ) {
    const channelId =
      interaction.values?.[0];

    if (!channelId) {
      return true;
    }

    if (!config.guilds) {
      config.guilds = {};
    }

    if (
      !config.guilds[
        guildId
      ]
    ) {
      config.guilds[
        guildId
      ] =
        cloneDefaultConfig();
    }

    if (
      !config.guilds[
        guildId
      ].channels
    ) {
      config.guilds[
        guildId
      ].channels = {};
    }

    config.guilds[
      guildId
    ].channels.payments =
      channelId;

    config.channels.payments =
      channelId;

    saveConfig();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal de pagamentos definido: <#${channelId}>`,
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    id ===
    "config_results_channel"
  ) {
    const channelId =
      interaction.values?.[0];

    if (!channelId) {
      return true;
    }

    if (!config.guilds) {
      config.guilds = {};
    }

    if (
      !config.guilds[
        guildId
      ]
    ) {
      config.guilds[
        guildId
      ] =
        cloneDefaultConfig();
    }

    if (
      !config.guilds[
        guildId
      ].channels
    ) {
      config.guilds[
        guildId
      ].channels = {};
    }

    config.guilds[
      guildId
    ].channels.results =
      channelId;

    config.channels.results =
      channelId;

    saveConfig();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal de resultados definido: <#${channelId}>`,
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    id ===
    "config_mediator_role"
  ) {
    const roleId =
      interaction.values?.[0];

    if (!roleId) {
      return true;
    }

    if (!config.guilds) {
      config.guilds = {};
    }

    if (
      !config.guilds[
        guildId
      ]
    ) {
      config.guilds[
        guildId
      ] =
        cloneDefaultConfig();
    }

    if (
      !config.guilds[
        guildId
      ].roles
    ) {
      config.guilds[
        guildId
      ].roles = {};
    }

    config.guilds[
      guildId
    ].roles.mediator =
      roleId;

    config.roles.mediator =
      roleId;

    saveConfig();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Cargo de mediador definido: <@&${roleId}>`,
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    id ===
    "config_admin_role"
  ) {
    const roleId =
      interaction.values?.[0];

    if (!roleId) {
      return true;
    }

    if (!config.guilds) {
      config.guilds = {};
    }

    if (
      !config.guilds[
        guildId
      ]
    ) {
      config.guilds[
        guildId
      ] =
        cloneDefaultConfig();
    }

    if (
      !config.guilds[
        guildId
      ].roles
    ) {
      config.guilds[
        guildId
      ].roles = {};
    }

    config.guilds[
      guildId
    ].roles.admin =
      roleId;

    config.roles.admin =
      roleId;

    saveConfig();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Cargo de administrador definido: <@&${roleId}>`,
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    id ===
    "config_fee_set"
  ) {
    const modal =
      new ModalBuilder()
        .setCustomId(
          "modal_config_fee"
        )
        .setTitle(
          "Configurar taxa"
        );

    const input =
      new TextInputBuilder()
        .setCustomId(
          "fee_value"
        )
        .setLabel(
          "Valor da taxa em reais"
        )
        .setPlaceholder(
          "Ex.: 5.00"
        )
        .setRequired(
          true
        )
        .setStyle(
          TextInputStyle.Short
        );

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        input
      )
    );

    await interaction.showModal(
      modal
    );

    return true;
  }

  if (
    id ===
    "appearance_color"
  ) {
    const modal =
      new ModalBuilder()
        .setCustomId(
          "modal_appearance_color"
        )
        .setTitle(
          "Alterar cor"
        );

    const input =
      new TextInputBuilder()
        .setCustomId(
          "embed_color"
        )
        .setLabel(
          "Cor hexadecimal"
        )
        .setPlaceholder(
          "#5865F2"
        )
        .setRequired(
          true
        )
        .setStyle(
          TextInputStyle.Short
        );

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        input
      )
    );

    await interaction.showModal(
      modal
    );

    return true;
  }

  if (
    id ===
    "appearance_avatar"
  ) {
    const modal =
      new ModalBuilder()
        .setCustomId(
          "modal_appearance_avatar"
        )
        .setTitle(
          "Alterar avatar"
        );

    const input =
      new TextInputBuilder()
        .setCustomId(
          "bot_avatar"
        )
        .setLabel(
          "URL da imagem"
        )
        .setPlaceholder(
          "https://..."
        )
        .setRequired(
          true
        )
        .setStyle(
          TextInputStyle.Short
        );

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        input
      )
    );

    await interaction.showModal(
      modal
    );

    return true;
  }

  return true;
}

// ============================================================
// MODAIS
// ============================================================

async function handleModalSubmit(
  interaction
) {
  const id =
    String(
      interaction.customId || ""
    );

  if (
    !id.startsWith("modal_")
  ) {
    return false;
  }

  if (
    !interaction.guildId
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa ação só pode ser usada em um servidor.",
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    !canManage(
      interaction
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para isso.",
        ephemeral: true,
      }
    );

    return true;
  }

  const guildId =
    interaction.guildId;

  if (
    id ===
    "modal_config_fee"
  ) {
    const raw =
      interaction.fields.getTextInputValue(
        "fee_value"
      );

    const normalized =
      String(raw || "")
        .replace(
          ",",
          "."
        )
        .trim();

    const value =
      Number(
        normalized
      );

    if (
      !Number.isFinite(
        value
      ) ||
      value < 0
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Informe um valor válido.",
          ephemeral: true,
        }
      );

      return true;
    }

    if (!config.guilds) {
      config.guilds = {};
    }

    if (
      !config.guilds[
        guildId
      ]
    ) {
      config.guilds[
        guildId
      ] =
        cloneDefaultConfig();
    }

    config.guilds[
      guildId
    ].admFee =
      Math.round(
        value * 100
      );

    config.admFee =
      Math.round(
        value * 100
      );

    saveConfig();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Taxa configurada para ${formatMoney(
            Math.round(
              value * 100
            )
          )}.`,
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    id ===
    "modal_appearance_color"
  ) {
    const raw =
      interaction.fields.getTextInputValue(
        "embed_color"
      );

    const color =
      String(
        raw || ""
      ).trim();

    if (
      !/^#[0-9A-Fa-f]{6}$/.test(
        color
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Cor inválida. Use o formato `#5865F2`.",
          ephemeral: true,
        }
      );

      return true;
    }

    if (!config.guilds) {
      config.guilds = {};
    }

    if (
      !config.guilds[
        guildId
      ]
    ) {
      config.guilds[
        guildId
      ] =
        cloneDefaultConfig();
    }

    if (
      !config.guilds[
        guildId
      ].settings
    ) {
      config.guilds[
        guildId
      ].settings = {};
    }

    config.guilds[
      guildId
    ].settings.embedColor =
      color;

    config.guilds[
      guildId
    ].embedColor =
      color;

    config.embedColor =
      color;

    saveConfig();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Cor alterada para \`${color}\`.`,
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    id ===
    "modal_appearance_avatar"
  ) {
    const avatar =
      String(
        interaction.fields.getTextInputValue(
          "bot_avatar"
        ) || ""
      ).trim();

    if (
      !/^https?:\/\/.+/i.test(
        avatar
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ URL de avatar inválida.",
          ephemeral: true,
        }
      );

      return true;
    }

    if (!config.guilds) {
      config.guilds = {};
    }

    if (
      !config.guilds[
        guildId
      ]
    ) {
      config.guilds[
        guildId
      ] =
        cloneDefaultConfig();
    }

    config.guilds[
      guildId
    ].botAvatar =
      avatar;

    config.botAvatar =
      avatar;

    saveConfig();

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Avatar configurado.",
        ephemeral: true,
      }
    );

    return true;
  }

  return true;
}

// ============================================================
// CADASTRO DE PIX
// ============================================================

function pixAdminEmbed(
  guildId
) {
  const admins =
    getPixAdmins(
      guildId
    );

  const list =
    admins.length
      ? admins
          .map(
            (id, index) =>
              `${index + 1}. <@${id}>`
          )
          .join("\n")
      : "Nenhum administrador de PIX cadastrado.";

  return createEmbed(
    guildId,
    "💳 ADMINISTRADORES DE PIX",
    [
      "Administradores cadastrados:",
      "",
      list,
    ].join("\n")
  );
}

function pixAdminComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "pix_admin_add"
        )
        .setLabel(
          "Adicionar"
        )
        .setEmoji(
          "➕"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "pix_admin_remove"
        )
        .setLabel(
          "Remover"
        )
        .setEmoji(
          "➖"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    ),
  ];
}

async function showPixAdminModal(
  interaction,
  action
) {
  const modal =
    new ModalBuilder()
      .setCustomId(
        `modal_pix_admin_${action}`
      )
      .setTitle(
        action === "add"
          ? "Adicionar administrador PIX"
          : "Remover administrador PIX"
      );

  const input =
    new TextInputBuilder()
      .setCustomId(
        "user_id"
      )
      .setLabel(
        "ID do usuário"
      )
      .setPlaceholder(
        "Digite o ID do Discord"
      )
      .setRequired(
        true
      )
      .setStyle(
        TextInputStyle.Short
      );

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      input
    )
  );

  await interaction.showModal(
    modal
  );
}

async function handlePixAdminButton(
  interaction
) {
  const id =
    String(
      interaction.customId || ""
    );

  if (
    id !== "pix_admin_add" &&
    id !== "pix_admin_remove"
  ) {
    return false;
  }

  if (
    !canManage(
      interaction
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para gerenciar administradores de PIX.",
        ephemeral: true,
      }
    );

    return true;
  }

  await showPixAdminModal(
    interaction,
    id ===
      "pix_admin_add"
      ? "add"
      : "remove"
  );

  return true;
}

async function handlePixAdminModal(
  interaction
) {
  const id =
    String(
      interaction.customId || ""
    );

  if (
    !id.startsWith(
      "modal_pix_admin_"
    )
  ) {
    return false;
  }

  if (
    !canManage(
      interaction
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para isso.",
        ephemeral: true,
      }
    );

    return true;
  }

  const action =
    id.endsWith(
      "_add"
    )
      ? "add"
      : "remove";

  const userId =
    String(
      interaction.fields.getTextInputValue(
        "user_id"
      ) || ""
    ).trim();

  if (
    !isValidId(
      userId
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ ID do Discord inválido.",
        ephemeral: true,
      }
    );

    return true;
  }

  const guildId =
    interaction.guildId;

  if (
    action === "add"
  ) {
    const result =
      addPixAdmin(
        guildId,
        userId
      );

    await sendSafeReply(
      interaction,
      {
        content:
          result
            ? `✅ <@${userId}> foi cadastrado como administrador de PIX.`
            : "❌ Não foi possível cadastrar o administrador de PIX.",
        ephemeral: true,
      }
    );

    return true;
  }

  const removed =
    removePixAdmin(
      guildId,
      userId
    );

  await sendSafeReply(
    interaction,
    {
      content:
        removed
          ? `✅ <@${userId}> foi removido dos administradores de PIX.`
          : "⚠️ Esse usuário não está cadastrado como administrador de PIX.",
      ephemeral: true,
    }
  );

  return true;
}

// ============================================================
// CADASTRO DE FILAS
// ============================================================

function queueSetupStartEmbed(
  guildId
) {
  return createEmbed(
    guildId,
    "🎮 CADASTRAR FILA",
    [
      "Escolha o formato da fila.",
      "",
      "Depois você poderá escolher o modo, o valor e o tipo da fila.",
    ].join("\n")
  );
}

function queueFormatComponents() {
  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "queue_setup_format"
      )
      .setPlaceholder(
        "Escolha o formato"
      )
      .addOptions(
        Object.values(
          FORMATS
        ).map(
          format => ({
            label:
              format,
            value:
              format,
            emoji:
              "🎮",
          })
        )
      );

  return [
    new ActionRowBuilder().addComponents(
      menu
    ),
  ];
}

function queueModeComponents() {
  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "queue_setup_mode"
      )
      .setPlaceholder(
        "Escolha o modo"
      )
      .addOptions(
        Object.entries(
          MODES
        ).map(
          ([value, label]) => ({
            label,
            value,
            emoji:
              value ===
              "gelo_infinito"
                ? "♾️"
                : "🧊",
          })
        )
      );

  return [
    new ActionRowBuilder().addComponents(
      menu
    ),
  ];
}

function queueValueComponents() {
  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "queue_setup_value"
      )
      .setPlaceholder(
        "Escolha o valor"
      )
      .addOptions(
        VALUES.map(
          value => ({
            label:
              formatMoney(
                value * 100
              ),
            value:
              String(
                value
              ),
            emoji:
              "💰",
          })
        )
      );

  return [
    new ActionRowBuilder().addComponents(
      menu
    ),
  ];
}

function queueTypeComponents() {
  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "queue_setup_type"
      )
      .setPlaceholder(
        "Escolha o tipo"
      )
      .addOptions(
        [
          {
            label:
              "Normal",
            value:
              "normal",
            description:
              "Fila padrão",
            emoji:
              "👤",
          },
          {
            label:
              "Misto",
            value:
              "misto",
            description:
              "Fila mista",
            emoji:
              "🔀",
          },
        ]
      );

  return [
    new ActionRowBuilder().addComponents(
      menu
    ),
  ];
}

async function handleQueueSetupSelect(
  interaction
) {
  const id =
    String(
      interaction.customId || ""
    );

  if (
    !id.startsWith(
      "queue_setup_"
    )
  ) {
    return false;
  }

  if (
    !canManage(
      interaction
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para cadastrar filas.",
        ephemeral: true,
      }
    );

    return true;
  }

  const userId =
    interaction.user.id;

  if (
    !client.queueSetup[
      userId
    ]
  ) {
    client.queueSetup[
      userId
    ] = {};
  }

  const setup =
    client.queueSetup[
      userId
    ];

  if (
    id ===
    "queue_setup_format"
  ) {
    setup.format =
      interaction.values?.[0];

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Formato selecionado: **${setup.format}**\n\nAgora escolha o modo.`,
        components:
          queueModeComponents(),
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    id ===
    "queue_setup_mode"
  ) {
    setup.mode =
      interaction.values?.[0];

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Modo selecionado: **${modeLabel(
            setup.mode
          )}**\n\nAgora escolha o valor.`,
        components:
          queueValueComponents(),
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    id ===
    "queue_setup_value"
  ) {
    setup.value =
      Number(
        interaction.values?.[0]
      );

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Valor selecionado: **${formatMoney(
            setup.value *
              100
          )}**\n\nAgora escolha o tipo da fila.`,
        components:
          queueTypeComponents(),
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    id ===
    "queue_setup_type"
  ) {
    setup.type =
      interaction.values?.[0] ||
      "normal";

    if (
      !Object.values(
        QUEUE_TYPES
      ).includes(
        setup.type
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Tipo de fila inválido.",
          ephemeral: true,
        }
      );

      return true;
    }

    const guild =
      interaction.guild;

    if (!guild) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Servidor não encontrado.",
          ephemeral: true,
        }
      );

      return true;
    }

    const channels =
      guild.channels.cache.filter(
        channel =>
          channel.type ===
          ChannelType.GuildText
      );

    const options =
      channels
        .first(25)
        .map(
          channel => ({
            label:
              truncate(
                channel.name,
                100
              ),
            value:
              channel.id,
            description:
              "Canal onde a fila será publicada",
          })
        );

    if (!options.length) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Nenhum canal de texto disponível.",
          ephemeral: true,
        }
      );

      return true;
    }

    const menu =
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "queue_setup_channel"
        )
        .setPlaceholder(
          "Escolha o canal da fila"
        )
        .addChannelTypes(
          ChannelType.GuildText
        )
        .setMinValues(1)
        .setMaxValues(1);

    await sendSafeReply(
      interaction,
      {
        content:
          [
            "✅ Configuração concluída.",
            "",
            `🎮 **Formato:** ${setup.format}`,
            `🧊 **Modo:** ${modeLabel(
              setup.mode
            )}`,
            `💰 **Valor:** ${formatMoney(
              setup.value *
                100
            )}`,
            `📌 **Tipo:** ${queueTypeLabel(
              setup.type
            )}`,
            "",
            "Agora selecione o canal onde a fila será publicada.",
          ].join("\n"),
        components: [
          new ActionRowBuilder().addComponents(
            menu
          ),
        ],
        ephemeral: true,
      }
    );

    return true;
  }

  return true;
}

// ============================================================
// COMANDO DE CONFIGURAÇÃO DE FILA
// ============================================================

async function startQueueSetup(
  interaction
) {
  if (
    !canManage(
      interaction
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para cadastrar filas.",
        ephemeral: true,
      }
    );
  }

  client.queueSetup[
    interaction.user.id
  ] = {};

  await sendSafeReply(
    interaction,
    {
      embeds: [
        queueSetupStartEmbed(
          interaction.guildId
        ),
      ],
      components:
        queueFormatComponents(),
      ephemeral: true,
    }
  );
}

// ============================================================
// PAINEL DE PIX
// ============================================================

async function showPixPanel(
  interaction
) {
  if (
    !canManage(
      interaction
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para acessar esse painel.",
        ephemeral: true,
      }
    );
  }

  await sendSafeReply(
    interaction,
    {
      embeds: [
        pixAdminEmbed(
          interaction.guildId
        ),
      ],
      components:
        pixAdminComponents(),
      ephemeral: true,
    }
  );
}

// ============================================================
// COMANDOS SLASH
// ============================================================

const commands = [
  new SlashCommandBuilder()
    .setName(
      "config"
    )
    .setDescription(
      "Configura o bot"
    ),

  new SlashCommandBuilder()
    .setName(
      "fila"
    )
    .setDescription(
      "Gerencia as filas"
    )
    .addSubcommand(
      sub =>
        sub
          .setName(
            "cadastrar"
          )
          .setDescription(
            "Cadastra uma fila"
          )
    ),

  new SlashCommandBuilder()
    .setName(
      "pix"
    )
    .setDescription(
      "Gerencia administradores de PIX"
    )
    .addSubcommand(
      sub =>
        sub
          .setName(
            "painel"
          )
          .setDescription(
            "Abre o painel de PIX"
          )
    ),

  new SlashCommandBuilder()
    .setName(
      "mediador"
    )
    .setDescription(
      "Gerencia mediadores"
    )
    .addSubcommand(
      sub =>
        sub
          .setName(
            "adicionar"
          )
          .setDescription(
            "Adiciona um mediador"
          )
          .addStringOption(
            option =>
              option
                .setName(
                  "id"
                )
                .setDescription(
                  "ID do usuário"
                )
                .setRequired(
                  true
                )
          )
    )
    .addSubcommand(
      sub =>
        sub
          .setName(
            "remover"
          )
          .setDescription(
            "Remove um mediador"
          )
          .addStringOption(
            option =>
              option
                .setName(
                  "id"
                )
                .setDescription(
                  "ID do usuário"
                )
                .setRequired(
                  true
                )
          )
    ),
].map(
  command =>
    command.toJSON()
);

// ============================================================
// REGISTRO DOS COMANDOS
// ============================================================

async function registerCommands() {
  const rest =
    new REST({
      version: "10",
    }).setToken(
      TOKEN
    );

  try {
    if (GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(
          CLIENT_ID,
          GUILD_ID
        ),
        {
          body: commands,
        }
      );

      console.log(
        `✅ ${commands.length} comandos registrados no servidor ${GUILD_ID}.`
      );
    } else {
      await rest.put(
        Routes.applicationCommands(
          CLIENT_ID
        ),
        {
          body: commands,
        }
      );

      console.log(
        `✅ ${commands.length} comandos globais registrados.`
      );
    }
  } catch (error) {
    console.error(
      "❌ Erro ao registrar comandos:",
      error
    );

    throw error;
  }
}

// ============================================================
// EXECUÇÃO DOS COMANDOS
// ============================================================

async function handleCommand(
  interaction
) {
  if (
    !interaction.isChatInputCommand()
  ) {
    return false;
  }

  if (
    interaction.commandName ===
    "config"
  ) {
    if (
      !canManage(
        interaction
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Você não tem permissão para configurar o bot.",
          ephemeral: true,
        }
      );

      return true;
    }

    await sendSafeReply(
      interaction,
      {
        embeds: [
          configurationEmbed(
            interaction.guildId
          ),
        ],
        components:
          configurationComponents(),
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    interaction.commandName ===
    "fila"
  ) {
    const subcommand =
      interaction.options.getSubcommand();

    if (
      subcommand ===
      "cadastrar"
    ) {
      await startQueueSetup(
        interaction
      );

      return true;
    }
  }

  if (
    interaction.commandName ===
    "pix"
  ) {
    const subcommand =
      interaction.options.getSubcommand();

    if (
      subcommand ===
      "painel"
    ) {
      await showPixPanel(
        interaction
      );

      return true;
    }
  }

  if (
    interaction.commandName ===
    "mediador"
  ) {
    if (
      !canManage(
        interaction
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Você não tem permissão para gerenciar mediadores.",
          ephemeral: true,
        }
      );

      return true;
    }

    const subcommand =
      interaction.options.getSubcommand();

    const userId =
      interaction.options.getString(
        "id",
        true
      );

    if (
      subcommand ===
      "adicionar"
    ) {
      await addMediator(
        interaction,
        userId
      );

      return true;
    }

    if (
      subcommand ===
      "remover"
    ) {
      await removeMediator(
        interaction,
        userId
      );

      return true;
    }
  }

  return false;
}

// ============================================================
// BOTÕES
// ============================================================

async function handleButton(
  interaction
) {
  if (
    !interaction.isButton()
  ) {
    return false;
  }

  const id =
    String(
      interaction.customId || ""
    );

  if (
    id.startsWith(
      "queue_join|"
    )
  ) {
    await handleQueueJoin(
      interaction
    );

    return true;
  }

  if (
    id.startsWith(
      "queue_leave|"
    )
  ) {
    await handleQueueLeave(
      interaction
    );

    return true;
  }

  if (
    id ===
      "pix_admin_add" ||
    id ===
      "pix_admin_remove"
  ) {
    await handlePixAdminButton(
      interaction
    );

    return true;
  }

  if (
    id.startsWith(
      "bet_ready|"
    )
  ) {
    await handleBetReady(
      interaction
    );

    return true;
  }

  if (
    id.startsWith(
      "bet_cancel|"
    )
  ) {
    await handleBetCancel(
      interaction
    );

    return true;
  }

  return false;
}

// ============================================================
// APOSTA — CONFIRMAR
// ============================================================

async function handleBetReady(
  interaction
) {
  if (
    !interaction.channelId
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Canal da aposta não encontrado.",
        ephemeral: true,
      }
    );
  }

  const bet =
    Object.values(
      config.bets || {}
    ).find(
      item =>
        item.channelId ===
        interaction.channelId
    );

  if (!bet) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Aposta não encontrada.",
        ephemeral: true,
      }
    );
  }

  if (
    bet.status !==
      "waiting" &&
    bet.status !==
      "pending"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Essa aposta não está aguardando confirmação.",
        ephemeral: true,
      }
    );
  }

  if (
    !canMediate(
      interaction
    ) &&
    !bet.players.some(
      player =>
        (
          player.userId ||
          player.id
        ) ===
        interaction.user.id
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não participa dessa aposta.",
        ephemeral: true,
      }
    );
  }

  if (
    !bet.confirmations
  ) {
    bet.confirmations =
      [];
  }

  if (
    !bet.confirmations.includes(
      interaction.user.id
    )
  ) {
    bet.confirmations.push(
      interaction.user.id
    );
  }

  const required =
    bet.players.length;

  if (
    bet.confirmations.length >=
    required
  ) {
    bet.status =
      "confirmed";

    bet.confirmedAt =
      Date.now();

    saveConfig();

    try {
      await interaction.message.edit(
        {
          embeds: [
            betEmbed(
              bet
            ),
          ],
          components: [],
        }
      );
    } catch (error) {
      console.error(
        "❌ Erro ao atualizar aposta confirmada:",
        error
      );
    }

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Todos os jogadores confirmaram a aposta.",
        ephemeral: true,
      }
    );

    return;
  }

  saveConfig();

  await sendSafeReply(
    interaction,
    {
      content:
        `✅ Confirmação registrada. ${bet.confirmations.length}/${required} jogadores confirmaram.`,
      ephemeral: true,
    }
  );
}

// ============================================================
// APOSTA — CANCELAR
// ============================================================

async function handleBetCancel(
  interaction
) {
  const bet =
    Object.values(
      config.bets || {}
    ).find(
      item =>
        item.channelId ===
        interaction.channelId
    );

  if (!bet) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Aposta não encontrada.",
        ephemeral: true,
      }
    );
  }

  if (
    !canMediate(
      interaction
    ) &&
    !bet.players.some(
      player =>
        (
          player.userId ||
          player.id
        ) ===
        interaction.user.id
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não participa dessa aposta.",
        ephemeral: true,
      }
    );
  }

  if (
    bet.status ===
    "finished"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa aposta já foi finalizada.",
        ephemeral: true,
      }
    );
  }

  bet.status =
    "cancelled";

  bet.cancelledAt =
    Date.now();

  bet.cancelledBy =
    interaction.user.id;

  saveConfig();

  try {
    await interaction.message.edit(
      {
        embeds: [
          betEmbed(
            bet
          ),
        ],
        components: [],
      }
    );
  } catch (error) {
    console.error(
      "❌ Erro ao atualizar aposta cancelada:",
      error
    );
  }

  await sendSafeReply(
    interaction,
    {
      content:
        "✅ Aposta cancelada.",
      ephemeral: true,
    }
  );

  return;
}

// ============================================================
// SELECT MENUS
// ============================================================

async function handleSelectMenu(
  interaction
) {
  if (
    !interaction.isAnySelectMenu()
  ) {
    return false;
  }

  const id =
    String(
      interaction.customId || ""
    );

  if (
    id.startsWith(
      "queue_setup_"
    )
  ) {
    await handleQueueSetupSelect(
      interaction
    );

    return true;
  }

  if (
    id.startsWith(
      "config_"
    )
  ) {
    await handleConfigInteraction(
      interaction
    );

    return true;
  }

  return false;
}

// ============================================================
// EVENTO DE INTERAÇÃO
// ============================================================

client.on(
  Events.InteractionCreate,
  async interaction => {
    try {
      if (
        interaction.isChatInputCommand()
      ) {
        await handleCommand(
          interaction
        );

        return;
      }

      if (
        interaction.isButton()
      ) {
        await handleButton(
          interaction
        );

        return;
      }

      if (
        interaction.isStringSelectMenu() ||
        interaction.isChannelSelectMenu() ||
        interaction.isRoleSelectMenu() ||
        interaction.isUserSelectMenu() ||
        interaction.isMentionableSelectMenu()
      ) {
        await handleSelectMenu(
          interaction
        );

        return;
      }

      if (
        interaction.isModalSubmit()
      ) {
        const handled =
          await handleModalSubmit(
            interaction
          );

        if (
          handled
        ) {
          return;
        }

        const pixHandled =
          await handlePixAdminModal(
            interaction
          );

        if (
          pixHandled
        ) {
          return;
        }
      }
    } catch (error) {
      console.error(
        "❌ Erro ao processar interação:",
        error
      );

      try {
        await sendSafeReply(
          interaction,
          {
            content:
              "❌ Ocorreu um erro ao processar essa ação.",
            ephemeral: true,
          }
        );
      } catch {}
    }
  }
);

// ============================================================
// READY
// ============================================================

client.once(
  Events.ClientReady,
  async readyClient => {
    console.log(
      `✅ Bot iniciado como ${readyClient.user.tag}`
    );

    config.guildId =
      GUILD_ID ||
      config.guildId ||
      readyClient.guilds.cache.first()
        ?.id ||
      null;

    saveConfig();

    try {
      await registerCommands();
    } catch (error) {
      console.error(
        "❌ Falha no registro dos comandos:",
        error
      );
    }

    console.log(
      `🤖 ${BOT_NAME} está online.`
    );
  }
);

// ============================================================
// EVENTOS DE ERRO
// ============================================================

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "❌ Unhandled Promise Rejection:",
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

client.login(
  TOKEN
).catch(
  error => {
    console.error(
      "❌ Erro ao iniciar/login do bot:",
      error
    );

    process.exit(1);
  }
);
