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
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
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

      return JSON.parse(
        JSON.stringify(DEFAULT_CONFIG)
      );
    }

    const raw =
      fs.readFileSync(
        CONFIG_FILE,
        "utf8"
      );

    if (!raw.trim()) {
      return JSON.parse(
        JSON.stringify(DEFAULT_CONFIG)
      );
    }

    const parsed =
      JSON.parse(raw);

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

      queueMessages:
        parsed.queueMessages || {},

      queues:
        parsed.queues || {},

      bets:
        parsed.bets || {},

      pixAdmins:
        parsed.pixAdmins || {},

      mediators:
        Array.isArray(
          parsed.mediators
        )
          ? parsed.mediators
          : [],
    };
  } catch (error) {
    console.error(
      "❌ Erro ao carregar configuração:",
      error
    );

    return JSON.parse(
      JSON.stringify(DEFAULT_CONFIG)
    );
  }
}

let config =
  loadConfig();

function saveConfig() {
  try {
    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify(
        config,
        null,
        2
      ),
      "utf8"
    );
  } catch (error) {
    console.error(
      "❌ Erro ao salvar configuração:",
      error
    );
  }
}

// ============================================================
// CLIENT
// ============================================================

const client =
  new Client({
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

client.queueSetup =
  {};

client.activeBets =
  {};

client.queueLocks =
  new Set();

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

const BOT_NAME =
  "Mediador Bot";

// ============================================================
// UTILITÁRIOS
// ============================================================

function formatMoney(
  cents
) {
  return `R$ ${(
    Number(cents) /
    100
  ).toFixed(2)}`;
}

function normalizeId(
  value
) {
  return String(
    value || ""
  ).trim();
}

function isValidId(
  value
) {
  return /^\d{17,20}$/.test(
    normalizeId(value)
  );
}

function safeText(
  value,
  fallback = "Não informado"
) {
  const text =
    String(
      value ?? ""
    ).trim();

  return (
    text ||
    fallback
  );
}

function truncate(
  text,
  max = 1024
) {
  const value =
    String(text || "");

  if (
    value.length <= max
  ) {
    return value;
  }

  return `${value.slice(
    0,
    max - 3
  )}...`;
}

function timestamp() {
  return Math.floor(
    Date.now() / 1000
  );
}

function discordTimestamp(
  ms = Date.now()
) {
  return `<t:${Math.floor(
    ms / 1000
  )}:f>`;
}

function cloneDefaultConfig() {
  return JSON.parse(
    JSON.stringify(
      DEFAULT_CONFIG
    )
  );
}

function ensureConfigStructure() {
  if (
    !config ||
    typeof config !==
      "object"
  ) {
    config =
      cloneDefaultConfig();
  }

  if (
    !config.channels ||
    typeof config.channels !==
      "object"
  ) {
    config.channels = {};
  }

  if (
    !config.roles ||
    typeof config.roles !==
      "object"
  ) {
    config.roles = {};
  }

  if (
    !config.queueMessages ||
    typeof config.queueMessages !==
      "object"
  ) {
    config.queueMessages =
      {};
  }

  if (
    !config.queues ||
    typeof config.queues !==
      "object"
  ) {
    config.queues = {};
  }

  if (
    !config.bets ||
    typeof config.bets !==
      "object"
  ) {
    config.bets = {};
  }

  if (
    !config.pixAdmins ||
    typeof config.pixAdmins !==
      "object"
  ) {
    config.pixAdmins =
      {};
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
    !config.settings ||
    typeof config.settings !==
      "object"
  ) {
    config.settings =
      {};
  }
}

ensureConfigStructure();

const PREFIX =
  config.settings?.prefix ||
  "!";

function getGuildId(
  interaction
) {
  return (
    interaction?.guildId ||
    config.guildId ||
    GUILD_ID ||
    null
  );
}

function isAdmin(
  member
) {
  if (!member) {
    return false;
  }

  if (
    member.permissions?.has(
      PermissionFlagsBits.Administrator
    )
  ) {
    return true;
  }

  const adminRoleId =
    config.roles?.admin;

  if (
    adminRoleId &&
    member.roles?.cache?.has(
      adminRoleId
    )
  ) {
    return true;
  }

  return false;
}

function isMediator(
  member
) {
  if (!member) {
    return false;
  }

  if (
    isAdmin(member)
  ) {
    return true;
  }

  const userId =
    member.id;

  if (
    Array.isArray(
      config.mediators
    )
  ) {
    if (
      config.mediators.includes(
        userId
      )
    ) {
      return true;
    }
  }

  const mediatorRoleId =
    config.roles?.mediator;

  if (
    mediatorRoleId &&
    member.roles?.cache?.has(
      mediatorRoleId
    )
  ) {
    return true;
  }

  return false;
}

function getMember(
  interaction
) {
  return (
    interaction?.member ||
    null
  );
}

function canManage(
  interaction
) {
  return isAdmin(
    getMember(
      interaction
    )
  );
}

function canMediate(
  interaction
) {
  return isMediator(
    getMember(
      interaction
    )
  );
}

async function sendSafeReply(
  interaction,
  payload
) {
  try {
    if (
      interaction.replied ||
      interaction.deferred
    ) {
      return await interaction.followUp(
        payload
      );
    }

    return await interaction.reply(
      payload
    );
  } catch (error) {
    console.error(
      "❌ Erro ao responder interação:",
      error
    );

    return null;
  }
}

async function deferSafe(
  interaction,
  ephemeral = true
) {
  try {
    if (
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.deferReply(
        {
          ephemeral,
        }
      );

      return true;
    }

    return false;
  } catch (error) {
    console.error(
      "❌ Erro ao deferir interação:",
      error
    );

    return false;
  }
}

async function editSafeReply(
  interaction,
  payload
) {
  try {
    if (
      interaction.deferred ||
      interaction.replied
    ) {
      return await interaction.editReply(
        payload
      );
    }

    return await interaction.reply(
      payload
    );
  } catch (error) {
    console.error(
      "❌ Erro ao editar resposta:",
      error
    );

    return null;
  }
}

async function fetchGuild(
  guildId
) {
  if (!guildId) {
    return null;
  }

  try {
    return await client.guilds.fetch(
      guildId
    );
  } catch (error) {
    console.error(
      "❌ Erro ao buscar servidor:",
      error
    );

    return null;
  }
}

async function fetchChannel(
  channelId
) {
  if (!channelId) {
    return null;
  }

  try {
    return await client.channels.fetch(
      channelId
    );
  } catch (error) {
    console.error(
      "❌ Erro ao buscar canal:",
      error
    );

    return null;
  }
}

async function fetchUser(
  userId
) {
  if (!userId) {
    return null;
  }

  try {
    return await client.users.fetch(
      userId
    );
  } catch (error) {
    console.error(
      "❌ Erro ao buscar usuário:",
      error
    );

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
  const key =
    makeQueueKey(
      guildId,
      format,
      mode,
      value,
      type
    );

  if (
    !config.queues[key]
  ) {
    config.queues[key] = {
      key,
      guildId,
      format,
      mode,
      value:
        Number(value),
      type,
      players: [],
      createdAt:
        Date.now(),
      updatedAt:
        Date.now(),
    };
  }

  const queue =
    config.queues[key];

  if (
    !Array.isArray(
      queue.players
    )
  ) {
    queue.players =
      [];
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
  const key =
    getQueueChoiceKey(
      guildId,
      format,
      mode,
      type
    );

  if (
    !config.queueChoices
  ) {
    config.queueChoices =
      {};
  }

  if (
    !Array.isArray(
      config.queueChoices[key]
    )
  ) {
    config.queueChoices[key] =
      [];
  }

  return config.queueChoices[
    key
  ];
}

function clearQueueChoices(
  guildId,
  format,
  mode,
  type = "normal"
) {
  const key =
    getQueueChoiceKey(
      guildId,
      format,
      mode,
      type
    );

  if (
    !config.queueChoices
  ) {
    config.queueChoices =
      {};
  }

  delete config.queueChoices[
    key
  ];

  saveConfig();
}

function getQueueCapacity(
  format
) {
  return (
    MAX_QUEUE_PLAYERS[
      format
    ] || 0
  );
}

function isQueueFull(
  queue
) {
  return (
    queue &&
    Array.isArray(
      queue.players
    ) &&
    queue.players.length >=
      getQueueCapacity(
        queue.format
      )
  );
}

function userInQueue(
  queue,
  userId
) {
  if (
    !queue ||
    !Array.isArray(
      queue.players
    )
  ) {
    return false;
  }

  return queue.players.some(
    (player) =>
      String(
        player.userId ||
          player.id
      ) ===
      String(userId)
  );
}

function removeUserFromQueue(
  queue,
  userId
) {
  if (
    !queue ||
    !Array.isArray(
      queue.players
    )
  ) {
    return false;
  }

  const before =
    queue.players.length;

  queue.players =
    queue.players.filter(
      (player) =>
        String(
          player.userId ||
            player.id
        ) !==
        String(userId)
    );

  if (
    queue.players.length !==
    before
  ) {
    queue.updatedAt =
      Date.now();

    return true;
  }

  return false;
}

// ============================================================
// EMBEDS
// ============================================================

function createBaseEmbed(
  title,
  description = ""
) {
  const embed =
    new EmbedBuilder()
      .setTitle(title)
      .setDescription(
        description
      )
      .setTimestamp();

  return embed;
}

function configEmbed() {
  return new EmbedBuilder()
    .setTitle(
      "⚙️ Configuração"
    )
    .setDescription(
      "Utilize os botões abaixo para configurar o sistema."
    )
    .setTimestamp();
}

function cadastroEmbed() {
  return new EmbedBuilder()
    .setTitle(
      "📋 Cadastro"
    )
    .setDescription(
      [
        "Use os botões abaixo para gerenciar os cadastros do servidor.",
        "",
        "👤 **Mediadores**",
        "Cadastre, remova ou consulte os mediadores.",
        "",
        "💠 **ADM/Pix**",
        "Cadastre os dados de pagamento dos administradores.",
      ].join("\n")
    )
    .setTimestamp();
}

function queueEmbed(
  queue
) {
  const capacity =
    getQueueCapacity(
      queue.format
    );

  const players =
    Array.isArray(
      queue.players
    )
      ? queue.players
      : [];

  const playerList =
    players.length > 0
      ? players
          .map(
            (
              player,
              index
            ) =>
              `**${
                index + 1
              }.** <@${
                player.userId ||
                player.id
              }>`
          )
          .join("\n")
      : "Nenhum jogador na fila.";

  const modeName =
    MODES[
      queue.mode
    ] ||
    safeText(
      queue.mode
    );

  const typeName =
    queue.type ===
    "misto"
      ? "Misto"
      : "Normal";

  return new EmbedBuilder()
    .setTitle(
      `🎮 Fila ${queue.format} • ${formatMoney(
        queue.value
      )}`
    )
    .setDescription(
      [
        `🎯 **Modo:** ${modeName}`,
        `🏷️ **Tipo:** ${typeName}`,
        `👥 **Jogadores:** ${players.length}/${capacity}`,
        "",
        playerList,
      ].join("\n")
    )
    .setTimestamp();
}

function betEmbed(
  bet
) {
  return new EmbedBuilder()
    .setTitle(
      "🎮 Aposta"
    )
    .setDescription(
      [
        `💰 **Valor:** ${formatMoney(
          bet.value
        )}`,
        `🎯 **Modo:** ${safeText(
          MODES[
            bet.mode
          ],
          bet.mode
        )}`,
        `🏷️ **Formato:** ${safeText(
          bet.format
        )}`,
        "",
        `👤 **Criador:** <@${bet.createdBy}>`,
        `👥 **Jogadores:** ${
          bet.players?.length ||
          0
        }`,
      ].join("\n")
    )
    .setTimestamp();
}

// ============================================================
// COMPONENTES DE CONFIGURAÇÃO
// ============================================================

function configButtons() {
  const row1 =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "config_channels"
          )
          .setLabel(
            "Canais"
          )
          .setEmoji(
            "📺"
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
            "🎭"
          )
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "config_queue"
          )
          .setLabel(
            "Filas"
          )
          .setEmoji(
            "🎮"
          )
          .setStyle(
            ButtonStyle.Primary
          )
      );

  const row2 =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "config_general"
          )
          .setLabel(
            "Geral"
          )
          .setEmoji(
            "⚙️"
          )
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "config_reset"
          )
          .setLabel(
            "Resetar"
          )
          .setEmoji(
            "♻️"
          )
          .setStyle(
            ButtonStyle.Danger
          )
      );

  return [
    row1,
    row2,
  ];
}

function mediatorConfigComponents() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "mediator_add"
          )
          .setLabel(
            "Cadastrar Mediador"
          )
          .setEmoji(
            "👤"
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            "mediator_remove"
          )
          .setLabel(
            "Remover Mediador"
          )
          .setEmoji(
            "🗑️"
          )
          .setStyle(
            ButtonStyle.Danger
          ),

        new ButtonBuilder()
          .setCustomId(
            "mediator_list"
          )
          .setLabel(
            "Lista de Mediadores"
          )
          .setEmoji(
            "📋"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "pix_add"
          )
          .setLabel(
            "Cadastrar ADM/Pix"
          )
          .setEmoji(
            "💠"
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            "pix_list"
          )
          .setLabel(
            "Lista ADM/Pix"
          )
          .setEmoji(
            "📋"
          )
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "publish_mediator_queue"
          )
          .setLabel(
            "Publicar Fila"
          )
          .setEmoji(
            "📢"
          )
          .setStyle(
            ButtonStyle.Primary
          )
      ),
  ];
}

function cadastroComponents() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "cadastro_mediator_add"
          )
          .setLabel(
            "Cadastrar Mediador"
          )
          .setEmoji(
            "👤"
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            "cadastro_mediator_remove"
          )
          .setLabel(
            "Remover Mediador"
          )
          .setEmoji(
            "🗑️"
          )
          .setStyle(
            ButtonStyle.Danger
          ),

        new ButtonBuilder()
          .setCustomId(
            "cadastro_mediator_list"
          )
          .setLabel(
            "Lista de Mediadores"
          )
          .setEmoji(
            "📋"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "cadastro_pix_add"
          )
          .setLabel(
            "Cadastrar ADM/Pix"
          )
          .setEmoji(
            "💠"
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            "cadastro_pix_list"
          )
          .setLabel(
            "Lista ADM/Pix"
          )
          .setEmoji(
            "📋"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];
}

// ============================================================
// MODAIS
// ============================================================

function createMediatorAddModal() {
  return new ModalBuilder()
    .setCustomId(
      "mediator_add_modal"
    )
    .setTitle(
      "Cadastrar Mediador"
    )
    .addComponents(
      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "mediator_id"
            )
            .setLabel(
              "ID do Discord"
            )
            .setPlaceholder(
              "Digite o ID do usuário"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(
              true
            )
        )
    );
}

function createMediatorRemoveModal() {
  return new ModalBuilder()
    .setCustomId(
      "mediator_remove_modal"
    )
    .setTitle(
      "Remover Mediador"
    )
    .addComponents(
      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "mediator_id"
            )
            .setLabel(
              "ID do Discord"
            )
            .setPlaceholder(
              "Digite o ID do usuário"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(
              true
            )
        )
    );
}

function createPixIdModal() {
  return new ModalBuilder()
    .setCustomId(
      "pix_id_modal"
    )
    .setTitle(
      "Cadastrar ADM/Pix"
    )
    .addComponents(
      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "pix_discord_id"
            )
            .setLabel(
              "ID do Discord"
            )
            .setPlaceholder(
              "Digite o ID do ADM"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(
              true
            )
        )
    );
}

function createPixDataModal(
  userId
) {
  return new ModalBuilder()
    .setCustomId(
      `pix_data_modal|${userId}`
    )
    .setTitle(
      "Dados do ADM/Pix"
    )
    .addComponents(
      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "admin_name"
            )
            .setLabel(
              "Nome"
            )
            .setPlaceholder(
              "Nome do ADM"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(
              true
            )
        ),

      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "admin_pix_key"
            )
            .setLabel(
              "Chave Pix"
            )
            .setPlaceholder(
              "Digite a chave Pix"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(
              true
            )
        ),

      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "admin_pix_qr"
            )
            .setLabel(
              "QR Code"
            )
            .setPlaceholder(
              "URL da imagem do QR Code (opcional)"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(
              false
            )
        )
    );
}

// ============================================================
// LISTAS
// ============================================================

function getMediatorListText() {
  if (
    !Array.isArray(
      config.mediators
    ) ||
    config.mediators.length ===
      0
  ) {
    return "Nenhum mediador cadastrado.";
  }

  return config.mediators
    .map(
      (
        id,
        index
      ) =>
        `**${
          index + 1
        }.** <@${id}> — \`${id}\``
    )
    .join("\n");
}

function getPixAdminListText() {
  const admins =
    Object.values(
      config.pixAdmins ||
        {}
    );

  if (
    admins.length === 0
  ) {
    return "Nenhum ADM/Pix cadastrado.";
  }

  return admins
    .map(
      (
        admin,
        index
      ) => {
        const name =
          safeText(
            admin.name
          );

        const id =
          safeText(
            admin.userId ||
              admin.id
          );

        const key =
          safeText(
            admin.key
          );

        return [
          `**${
            index + 1
          }.** ${name}`,
          `👤 <@${id}>`,
          `💠 \`${key}\``,
        ].join("\n");
      }
    )
    .join("\n\n");
}

// ============================================================
// FILA — COMPONENTES
// ============================================================

function queueButtons(
  queue
) {
  const rows = [];

  const joinButton =
    new ButtonBuilder()
      .setCustomId(
        `queue_join|${queue.format}|${queue.mode}|${queue.value}|${queue.type}`
      )
      .setLabel(
        "Entrar na fila"
      )
      .setEmoji(
        "🎮"
      )
      .setStyle(
        ButtonStyle.Success
      );

  const leaveButton =
    new ButtonBuilder()
      .setCustomId(
        `queue_leave|${queue.format}|${queue.mode}|${queue.value}|${queue.type}`
      )
      .setLabel(
        "Sair da fila"
      )
      .setEmoji(
        "🚪"
      )
      .setStyle(
        ButtonStyle.Danger
      );

  rows.push(
    new ActionRowBuilder()
      .addComponents(
        joinButton,
        leaveButton
      )
  );

  return rows;
}

function queueSetupFormatMenu() {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          "queue_setup_format"
        )
        .setPlaceholder(
          "Selecione o formato"
        )
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          Object.values(
            FORMATS
          ).map(
            (
              format
            ) => ({
              label:
                format,
              value:
                format,
              emoji:
                "🎮",
            })
          )
        )
    );
}function queueSetupModeMenu(
  format
) {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          `queue_setup_mode|${format}`
        )
        .setPlaceholder(
          "Selecione o modo"
        )
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          Object.entries(
            MODES
          ).map(
            ([value, label]) => ({
              label,
              value,
              emoji: "🎯",
            })
          )
        )
    );
}

function queueSetupTypeMenu(
  format,
  mode
) {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          `queue_setup_type|${format}|${mode}`
        )
        .setPlaceholder(
          "Selecione o tipo de fila"
        )
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          Object.entries(
            QUEUE_TYPES
          ).map(
            ([value]) => ({
              label:
                value === "misto"
                  ? "Misto"
                  : "Normal",
              value,
              emoji:
                value === "misto"
                  ? "🔀"
                  : "👥",
            })
          )
        )
    );
}

function queueSetupValueMenu(
  format,
  mode,
  type
) {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          `queue_setup_value|${format}|${mode}|${type}`
        )
        .setPlaceholder(
          "Selecione o valor da aposta"
        )
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          VALUES.map(
            (value) => ({
              label:
                formatMoney(
                  value * 100
                ),
              value:
                String(value),
              emoji: "💰",
            })
          )
        )
    );
}

function queuePublishButton(
  format,
  mode,
  value,
  type
) {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `queue_publish|${format}|${mode}|${value}|${type}`
          )
          .setLabel(
            "Publicar fila"
          )
          .setEmoji(
            "📢"
          )
          .setStyle(
            ButtonStyle.Success
          )
      ),
  ];
}

function queueSetupEmbed(
  format,
  mode,
  value,
  type
) {
  return new EmbedBuilder()
    .setTitle(
      "🎮 Configuração de fila"
    )
    .setDescription(
      [
        `🎮 **Formato:** ${safeText(
          format
        )}`,
        `🎯 **Modo:** ${safeText(
          MODES[mode],
          mode
        )}`,
        `🏷️ **Tipo:** ${
          type === "misto"
            ? "Misto"
            : "Normal"
        }`,
        `💰 **Valor:** ${
          value
            ? formatMoney(
                Number(value) *
                  100
              )
            : "Não selecionado"
        }`,
        "",
        "Configure todos os campos antes de publicar a fila.",
      ].join("\n")
    )
    .setTimestamp();
}

// ============================================================
// CONFIGURAÇÃO DE FILAS
// ============================================================

function queueConfigEmbed() {
  const totalQueues =
    Object.keys(
      config.queues || {}
    ).length;

  return new EmbedBuilder()
    .setTitle(
      "🎮 Configuração de filas"
    )
    .setDescription(
      [
        `📊 **Filas cadastradas:** ${totalQueues}`,
        "",
        "Use o botão abaixo para criar/publicar uma fila.",
      ].join("\n")
    )
    .setTimestamp();
}

function queueConfigButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "queue_setup_start"
          )
          .setLabel(
            "Criar fila"
          )
          .setEmoji(
            "➕"
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            "queue_list"
          )
          .setLabel(
            "Listar filas"
          )
          .setEmoji(
            "📋"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];
}

async function handleQueueSetupStart(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não possui permissão para configurar filas.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      content:
        "🎮 Selecione o formato da fila:",
      components: [
        queueSetupFormatMenu(),
      ],
      ephemeral: true,
    }
  );
}

async function handleQueueSetupFormat(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não possui permissão para configurar filas.",
        ephemeral: true,
      }
    );
  }

  const format =
    interaction.values?.[0];

  if (
    !format ||
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

  return sendSafeReply(
    interaction,
    {
      content:
        `🎮 Formato selecionado: **${format}**\n\nAgora selecione o modo:`,
      components: [
        queueSetupModeMenu(
          format
        ),
      ],
      ephemeral: true,
    }
  );
}

async function handleQueueSetupMode(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não possui permissão para configurar filas.",
        ephemeral: true,
      }
    );
  }

  const parts =
    String(
      interaction.customId ||
        ""
    ).split("|");

  const format =
    parts[1];

  const mode =
    interaction.values?.[0];

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

  return sendSafeReply(
    interaction,
    {
      content:
        `🎯 Modo selecionado: **${MODES[mode]}**\n\nAgora selecione o tipo de fila:`,
      components: [
        queueSetupTypeMenu(
          format,
          mode
        ),
      ],
      ephemeral: true,
    }
  );
}

async function handleQueueSetupType(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não possui permissão para configurar filas.",
        ephemeral: true,
      }
    );
  }

  const parts =
    String(
      interaction.customId ||
        ""
    ).split("|");

  const format =
    parts[1];

  const mode =
    parts[2];

  const type =
    interaction.values?.[0];

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
    !Object.keys(
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

  return sendSafeReply(
    interaction,
    {
      content:
        `🏷️ Tipo selecionado: **${
          type === "misto"
            ? "Misto"
            : "Normal"
        }**\n\nAgora selecione o valor da aposta:`,
      components: [
        queueSetupValueMenu(
          format,
          mode,
          type
        ),
      ],
      ephemeral: true,
    }
  );
}

async function handleQueueSetupValue(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não possui permissão para configurar filas.",
        ephemeral: true,
      }
    );
  }

  const parts =
    String(
      interaction.customId ||
        ""
    ).split("|");

  const format =
    parts[1];

  const mode =
    parts[2];

  const type =
    parts[3];

  const value =
    Number(
      interaction.values?.[0]
    );

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
    !Object.keys(
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

  if (
    !VALUES.includes(value)
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Valor de aposta inválido.",
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
          "❌ Não foi possível identificar o servidor.",
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

  saveConfig();

  return sendSafeReply(
    interaction,
    {
      embeds: [
        queueSetupEmbed(
          format,
          mode,
          value,
          type
        ),
      ],
      components:
        queuePublishButton(
          format,
          mode,
          value,
          type
        ),
      ephemeral: true,
    }
  );
}

// ============================================================
// PUBLICAÇÃO DA FILA
// ============================================================

async function handleQueuePublish(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não possui permissão para publicar filas.",
        ephemeral: true,
      }
    );
  }

  const parts =
    String(
      interaction.customId ||
        ""
    ).split("|");

  const format =
    parts[1];

  const mode =
    parts[2];

  const value =
    Number(parts[3]);

  const type =
    parts[4] ||
    "normal";

  if (
    !Object.values(
      FORMATS
    ).includes(format)
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Formato inválido.",
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
          "❌ Modo inválido.",
        ephemeral: true,
      }
    );
  }

  if (
    !VALUES.includes(value)
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Valor inválido.",
        ephemeral: true,
      }
    );
  }

  if (
    !Object.keys(
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
          "❌ Servidor não identificado.",
        ephemeral: true,
      }
    );
  }

  const categoryId =
    config.channels
      ?.queueCategory;

  if (!categoryId) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ A categoria das filas ainda não foi configurada.",
        ephemeral: true,
      }
    );
  }

  const guild =
    await fetchGuild(
      guildId
    );

  if (!guild) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Não foi possível acessar o servidor.",
        ephemeral: true,
      }
    );
  }

  let category = null;

  try {
    category =
      await guild.channels.fetch(
        categoryId
      );
  } catch (error) {
    console.error(
      "❌ Erro ao buscar categoria da fila:",
      error
    );
  }

  if (
    !category ||
    category.type !==
      ChannelType.GuildCategory
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ A categoria configurada para as filas não é válida.",
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

  let channel = null;

  try {
    channel =
      await guild.channels.create(
        {
          name:
            `fila-${format}-${value}-${type}`
              .toLowerCase()
              .replace(
                /[^a-z0-9-]/g,
                "-"
              ),

          type:
            ChannelType.GuildText,

          parent:
            category.id,

          reason:
            "Criação de fila pelo bot",
        }
      );
  } catch (error) {
    console.error(
      "❌ Erro ao criar canal da fila:",
      error
    );

    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Não foi possível criar o canal da fila. Verifique as permissões do bot.",
        ephemeral: true,
      }
    );
  }

  const message =
    await channel.send(
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

  config.queueMessages[
    queue.key
  ] = {
    guildId,
    channelId:
      channel.id,
    messageId:
      message.id,
    createdAt:
      Date.now(),
  };

  saveConfig();

  return sendSafeReply(
    interaction,
    {
      content:
        `✅ Fila publicada com sucesso em ${channel}.`,
      ephemeral: true,
    }
  );
}

// ============================================================
// ENTRAR NA FILA
// ============================================================

async function handleQueueJoin(
  interaction
) {
  const parts =
    String(
      interaction.customId ||
        ""
    ).split("|");

  if (
    parts.length < 5
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Dados da fila inválidos.",
        ephemeral: true,
      }
    );
  }

  const format =
    parts[1];

  const mode =
    parts[2];

  const value =
    Number(parts[3]);

  const type =
    parts[4] ||
    "normal";

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
    !VALUES.includes(value)
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Valor da fila inválido.",
        ephemeral: true,
      }
    );
  }

  if (
    !Object.keys(
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
          "❌ Servidor não identificado.",
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

    queue.players.push(
      {
        userId:
          interaction.user.id,
        username:
          interaction.user.username,
        joinedAt:
          Date.now(),
      }
    );

    queue.updatedAt =
      Date.now();

    saveConfig();

    const queueMessage =
      config.queueMessages[
        queue.key
      ];

    if (
      queueMessage
    ) {
      try {
        const channel =
          await fetchChannel(
            queueMessage.channelId
          );

        if (channel) {
          const message =
            await channel.messages.fetch(
              queueMessage.messageId
            );

          await message.edit(
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
        }
      } catch (error) {
        console.error(
          "❌ Erro ao atualizar mensagem da fila:",
          error
        );
      }
    }

    if (
      isQueueFull(
        queue
      )
    ) {
      await handleQueueFull(
        queue
      );
    }

    return sendSafeReply(
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
}// ============================================================
// FILA — CHEIA
// ============================================================

async function handleQueueFull(
  queue
) {
  if (!queue) {
    return null;
  }

  const guildId =
    queue.guildId;

  const guild =
    await fetchGuild(
      guildId
    );

  if (!guild) {
    console.error(
      "❌ Não foi possível encontrar o servidor da fila."
    );

    return null;
  }

  if (
    !Array.isArray(
      queue.players
    ) ||
    queue.players.length === 0
  ) {
    return null;
  }

  const players =
    queue.players.map(
      (player) => ({
        userId:
          player.userId ||
          player.id,
        username:
          player.username ||
          null,
        joinedAt:
          player.joinedAt ||
          Date.now(),
      })
    );

  const mediator =
    await getAvailableMediator(
      guild
    );

  if (!mediator) {
    console.warn(
      `⚠️ A fila ${queue.key} está cheia, mas não existe mediador disponível.`
    );

    return null;
  }

  let betResult = null;

  try {
    betResult =
      await createBetChannel(
        guild,
        queue,
        players
      );
  } catch (error) {
    console.error(
      "❌ Erro ao criar canal da aposta:",
      error
    );

    return null;
  }

  if (!betResult) {
    return null;
  }

  const bet =
    betResult.bet;

  bet.mediatorId =
    mediator.id;

  bet.mediatorName =
    mediator.user?.username ||
    mediator.username ||
    null;

  bet.status =
    "waiting";

  bet.updatedAt =
    Date.now();

  config.bets[
    bet.id
  ] = bet;

  /*
   * Limpa os jogadores da fila somente
   * depois que a aposta foi criada.
   *
   * Isso evita perder os jogadores caso
   * a criação do canal dê erro.
   */
  queue.players = [];

  queue.updatedAt =
    Date.now();

  saveConfig();

  /*
   * Atualiza a mensagem original da fila.
   */
  await updateQueueMessage(
    queue
  );

  /*
   * Remove a fila de escolhas temporárias,
   * se existir.
   */
  clearQueueChoices(
    guildId,
    queue.format,
    queue.mode,
    queue.type
  );

  /*
   * Envia a informação para o canal
   * da aposta.
   */
  try {
    await sendBetCreatedMessage(
      betResult.channel,
      bet,
      mediator
    );
  } catch (error) {
    console.error(
      "❌ Erro ao enviar mensagem inicial da aposta:",
      error
    );
  }

  /*
   * Notifica o mediador.
   */
  try {
    await notifyMediator(
      mediator,
      bet,
      betResult.channel
    );
  } catch (error) {
    console.error(
      "❌ Erro ao notificar mediador:",
      error
    );
  }

  return bet;
}

// ============================================================
// MEDIADORES DISPONÍVEIS
// ============================================================

async function getAvailableMediator(
  guild
) {
  if (!guild) {
    return null;
  }

  /*
   * Primeiro tenta utilizar os mediadores
   * cadastrados individualmente.
   */
  const mediatorIds =
    Array.isArray(
      config.mediators
    )
      ? config.mediators
      : [];

  for (
    const userId of mediatorIds
  ) {
    if (
      !isValidId(
        userId
      )
    ) {
      continue;
    }

    try {
      const member =
        await guild.members.fetch(
          userId
        );

      if (
        member &&
        !member.user.bot
      ) {
        return member;
      }
    } catch {
      /*
       * O usuário pode ter saído do servidor.
       * Nesse caso passa para o próximo.
       */
    }
  }

  /*
   * Caso não exista mediador cadastrado
   * individualmente, procura pelo cargo.
   */
  const mediatorRoleId =
    config.roles?.mediator;

  if (
    !mediatorRoleId
  ) {
    return null;
  }

  try {
    const role =
      await guild.roles.fetch(
        mediatorRoleId
      );

    if (
      !role ||
      !role.members ||
      role.members.size === 0
    ) {
      return null;
    }

    const members =
      [...role.members.values()]
        .filter(
          (member) =>
            member &&
            !member.user.bot
        );

    if (
      members.length === 0
    ) {
      return null;
    }

    /*
     * Escolhe um mediador de forma
     * rotativa para distribuir as apostas.
     */
    const cursor =
      Number(
        config.mediatorCursor || 0
      );

    const index =
      cursor %
      members.length;

    const selected =
      members[index];

    config.mediatorCursor =
      (index + 1) %
      members.length;

    saveConfig();

    return selected;
  } catch (error) {
    console.error(
      "❌ Erro ao buscar mediadores:",
      error
    );

    return null;
  }
}

// ============================================================
// ATUALIZAÇÃO DA MENSAGEM DA FILA
// ============================================================

async function updateQueueMessage(
  queue
) {
  if (!queue) {
    return null;
  }

  const queueMessage =
    config.queueMessages[
      queue.key
    ];

  if (
    !queueMessage
  ) {
    return null;
  }

  try {
    const channel =
      await fetchChannel(
        queueMessage.channelId
      );

    if (!channel) {
      return null;
    }

    const message =
      await channel.messages.fetch(
        queueMessage.messageId
      );

    if (!message) {
      return null;
    }

    await message.edit({
      embeds: [
        queueEmbed(
          queue
        ),
      ],
      components:
        queueButtons(
          queue
        ),
    });

    return message;
  } catch (error) {
    console.error(
      "❌ Erro ao atualizar mensagem da fila:",
      error
    );

    return null;
  }
}

// ============================================================
// MENSAGEM DE APOSTA CRIADA
// ============================================================

async function sendBetCreatedMessage(
  channel,
  bet,
  mediator
) {
  if (!channel) {
    return null;
  }

  const mediatorId =
    mediator?.id ||
    bet?.mediatorId ||
    null;

  const embed =
    new EmbedBuilder()
      .setTitle(
        "🎮 Aposta criada"
      )
      .setDescription(
        [
          `💰 **Valor:** ${formatMoney(
            Number(
              bet.value
            ) * 100
          )}`,
          `🎮 **Formato:** ${safeText(
            bet.format
          )}`,
          `🎯 **Modo:** ${safeText(
            MODES[
              bet.mode
            ],
            bet.mode
          )}`,
          `🏷️ **Tipo:** ${
            bet.type ===
            "misto"
              ? "Misto"
              : "Normal"
          }`,
          "",
          mediatorId
            ? `🛡️ **Mediador:** <@${mediatorId}>`
            : "🛡️ **Mediador:** Não definido",
        ].join("\n")
      )
      .setTimestamp();

  const components = [];

  if (
    mediatorId
  ) {
    components.push(
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              `bet_accept|${bet.id}`
            )
            .setLabel(
              "Assumir aposta"
            )
            .setEmoji(
              "🛡️"
            )
            .setStyle(
              ButtonStyle.Success
            )
        )
    );
  }

  return channel.send({
    embeds: [
      embed,
    ],
    components,
  });
}

// ============================================================
// NOTIFICAR MEDIADOR
// ============================================================

async function notifyMediator(
  mediator,
  bet,
  channel
) {
  if (
    !mediator ||
    !mediator.user
  ) {
    return null;
  }

  try {
    const dm =
      await mediator.user.createDM();

    await dm.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            "🛡️ Nova aposta disponível"
          )
          .setDescription(
            [
              `🎮 **Formato:** ${safeText(
                bet.format
              )}`,
              `🎯 **Modo:** ${safeText(
                MODES[
                  bet.mode
                ],
                bet.mode
              )}`,
              `💰 **Valor:** ${formatMoney(
                Number(
                  bet.value
                ) * 100
              )}`,
              "",
              `📍 **Canal:** ${channel}`,
              "",
              "Você foi selecionado para mediar esta aposta.",
            ].join("\n")
          )
          .setTimestamp(),
      ],
    });

    return true;
  } catch (error) {
    console.error(
      "❌ Não foi possível enviar DM ao mediador:",
      error
    );

    return false;
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
      interaction.customId ||
        ""
    ).split("|");

  if (
    parts.length < 5
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Dados da fila inválidos.",
        ephemeral: true,
      }
    );
  }

  const format =
    parts[1];

  const mode =
    parts[2];

  const value =
    Number(parts[3]);

  const type =
    parts[4] ||
    "normal";

  if (
    !Object.values(
      FORMATS
    ).includes(format)
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Formato da fila inválido.",
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
          "❌ Modo da fila inválido.",
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
          "❌ Valor da fila inválido.",
        ephemeral: true,
      }
    );
  }

  if (
    !Object.keys(
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
          "❌ Servidor não identificado.",
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

    saveConfig();

    await updateQueueMessage(
      queue
    );

    return sendSafeReply(
      interaction,
      {
        content:
          "✅ Você saiu da fila com sucesso.",
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
// LISTAR FILAS
// ============================================================

function getActiveQueues(
  guildId
) {
  return Object.values(
    config.queues || {}
  ).filter(
    (queue) =>
      queue &&
      String(
        queue.guildId
      ) ===
        String(guildId) &&
      Array.isArray(
        queue.players
      )
  );
}

function activeQueuesEmbed(
  guildId
) {
  const queues =
    getActiveQueues(
      guildId
    );

  if (
    queues.length === 0
  ) {
    return new EmbedBuilder()
      .setTitle(
        "🎮 Filas"
      )
      .setDescription(
        "Nenhuma fila cadastrada."
      )
      .setTimestamp();
  }

  const description =
    queues
      .map(
        (
          queue,
          index
        ) => {
          const capacity =
            getQueueCapacity(
              queue.format
            );

          return [
            `**${
              index + 1
            }. ${queue.format}**`,
            `🎯 ${safeText(
              MODES[
                queue.mode
              ],
              queue.mode
            )}`,
            `💰 ${formatMoney(
              Number(
                queue.value
              ) * 100
            )}`,
            `🏷️ ${
              queue.type ===
              "misto"
                ? "Misto"
                : "Normal"
            }`,
            `👥 ${
              queue.players
                ?.length ||
              0
            }/${capacity}`,
          ].join(" • ");
        }
      )
      .join("\n\n");

  return new EmbedBuilder()
    .setTitle(
      "🎮 Filas ativas"
    )
    .setDescription(
      truncate(
        description,
        4000
      )
    )
    .setTimestamp();
}

async function handleQueueList(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não possui permissão para visualizar as filas.",
        ephemeral: true,
      }
    );
  }

  const guildId =
    getGuildId(
      interaction
    );

  return sendSafeReply(
    interaction,
    {
      embeds: [
        activeQueuesEmbed(
          guildId
        ),
      ],
      ephemeral: true,
    }
  );
}

// ============================================================
// BET — CONSULTA
// ============================================================

function getBetByChannel(
  channelId
) {
  if (!channelId) {
    return null;
  }

  const bets =
    Object.values(
      config.bets || {}
    );

  return (
    bets.find(
      (bet) =>
        String(
          bet.channelId
        ) ===
        String(channelId)
    ) || null
  );
}

function getBet(
  betId
) {
  if (!betId) {
    return null;
  }

  return (
    config.bets?.[
      betId
    ] || null
  );
}

function userInBet(
  bet,
  userId
) {
  if (
    !bet ||
    !Array.isArray(
      bet.players
    )
  ) {
    return false;
  }

  return bet.players.some(
    (player) =>
      String(
        player.userId ||
          player.id
      ) ===
      String(userId)
  );
}

// ============================================================
// BET — ASSUMIR PELO MEDIADOR
// ============================================================

async function handleBetAccept(
  interaction
) {
  const parts =
    String(
      interaction.customId ||
        ""
    ).split("|");

  const betId =
    parts[1];

  if (!betId) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Aposta inválida.",
        ephemeral: true,
      }
    );
  }

  const bet =
    getBet(
      betId
    );

  if (!bet) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa aposta não existe mais.",
        ephemeral: true,
      }
    );
  }

  if (
    !canMediate(
      interaction
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não possui permissão de mediador.",
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
          "⚠️ Essa aposta já foi finalizada.",
        ephemeral: true,
      }
    );
  }

  if (
    bet.status ===
    "cancelled"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Essa aposta foi cancelada.",
        ephemeral: true,
      }
    );
  }

  if (
    bet.mediatorId &&
    String(
      bet.mediatorId
    ) !==
      String(
        interaction.user.id
      )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa aposta foi atribuída a outro mediador.",
        ephemeral: true,
      }
    );
  }

  bet.mediatorId =
    interaction.user.id;

  bet.mediatorName =
    interaction.user.username;

  bet.status =
    "accepted";

  bet.acceptedAt =
    Date.now();

  bet.updatedAt =
    Date.now();

  saveConfig();

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Você assumiu essa aposta como mediador.",
      ephemeral: true,
    }
  );
}```js
// ============================================================
// BET — CRIAR CANAL
// ============================================================

async function createBetChannel(
  guild,
  queue,
  players
) {
  if (!guild || !queue) {
    return null;
  }

  const categoryId =
    config.channels?.betCategory;

  if (!categoryId) {
    throw new Error(
      "Categoria de apostas não configurada."
    );
  }

  const category =
    await guild.channels.fetch(
      categoryId
    );

  if (
    !category ||
    category.type !==
      ChannelType.GuildCategory
  ) {
    throw new Error(
      "Categoria de apostas inválida."
    );
  }

  const betId =
    `${guild.id}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

  const channelName =
    `aposta-${queue.format}-${queue.value}-${queue.type}`
      .toLowerCase()
      .replace(
        /[^a-z0-9-]/g,
        "-"
      )
      .slice(0, 90);

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel,
      ],
    },
  ];

  for (
    const player of players
  ) {
    const userId =
      player.userId ||
      player.id;

    if (
      isValidId(userId)
    ) {
      permissionOverwrites.push({
        id: userId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
    }
  }

  const mediatorRoleId =
    config.roles?.mediator;

  if (mediatorRoleId) {
    permissionOverwrites.push({
      id: mediatorRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  try {
    const channel =
      await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites,
        reason:
          `Criação da aposta ${betId}`,
      });

    const bet = {
      id: betId,
      guildId: guild.id,
      channelId: channel.id,
      queueKey: queue.key,
      format: queue.format,
      mode: queue.mode,
      type: queue.type,
      value: Number(
        queue.value
      ),
      createdBy:
        players[0]?.userId ||
        players[0]?.id ||
        null,
      players:
        players.map(
          (player) => ({
            userId:
              player.userId ||
              player.id,
            username:
              player.username ||
              null,
            joinedAt:
              player.joinedAt ||
              Date.now(),
          })
        ),
      status:
        "waiting",
      mediatorId: null,
      mediatorName: null,
      createdAt:
        Date.now(),
      updatedAt:
        Date.now(),
    };

    client.activeBets[
      betId
    ] = bet;

    return {
      channel,
      bet,
    };
  } catch (error) {
    console.error(
      "❌ Erro ao criar canal da aposta:",
      error
    );

    throw error;
  }
}

// ============================================================
// BET — EMBED COMPLETO
// ============================================================

function fullBetEmbed(
  bet
) {
  const players =
    Array.isArray(
      bet?.players
    )
      ? bet.players
      : [];

  const playerList =
    players.length
      ? players
          .map(
            (
              player,
              index
            ) =>
              `**${
                index + 1
              }.** <@${
                player.userId ||
                player.id
              }>`
          )
          .join("\n")
      : "Nenhum jogador.";

  const statusMap = {
    waiting:
      "⏳ Aguardando mediador",
    accepted:
      "🛡️ Mediador assumiu",
    room:
      "🎮 Sala criada",
    finished:
      "✅ Finalizada",
    cancelled:
      "❌ Cancelada",
  };

  return new EmbedBuilder()
    .setTitle(
      "🎮 Central da Aposta"
    )
    .setDescription(
      [
        `💰 **Valor:** ${formatMoney(
          Number(
            bet.value
          ) * 100
        )}`,
        `🎮 **Formato:** ${safeText(
          bet.format
        )}`,
        `🎯 **Modo:** ${safeText(
          MODES[
            bet.mode
          ],
          bet.mode
        )}`,
        `🏷️ **Tipo:** ${
          bet.type ===
          "misto"
            ? "Misto"
            : "Normal"
        }`,
        `📌 **Status:** ${
          statusMap[
            bet.status
          ] ||
          safeText(
            bet.status
          )
        }`,
        "",
        "👥 **Jogadores**",
        playerList,
        "",
        `🛡️ **Mediador:** ${
          bet.mediatorId
            ? `<@${bet.mediatorId}>`
            : "Aguardando"
        }`,
      ].join("\n")
    )
    .setTimestamp();
}

function betControlButtons(
  bet
) {
  const rows = [];

  const row =
    new ActionRowBuilder();

  if (
    bet.status ===
      "waiting" &&
    bet.mediatorId
  ) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(
          `bet_accept|${bet.id}`
        )
        .setLabel(
          "Assumir aposta"
        )
        .setEmoji(
          "🛡️"
        )
        .setStyle(
          ButtonStyle.Success
        )
    );
  }

  if (
    bet.status ===
    "accepted"
  ) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(
          `bet_room|${bet.id}`
        )
        .setLabel(
          "Enviar sala"
        )
        .setEmoji(
          "🎮"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          `bet_cancel|${bet.id}`
        )
        .setLabel(
          "Cancelar"
        )
        .setEmoji(
          "❌"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    );
  }

  if (
    bet.status ===
    "room"
  ) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(
          `bet_finish|${bet.id}`
        )
        .setLabel(
          "Finalizar"
        )
        .setEmoji(
          "🏁"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          `bet_cancel|${bet.id}`
        )
        .setLabel(
          "Cancelar"
        )
        .setEmoji(
          "❌"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    );
  }

  if (
    row.components.length
  ) {
    rows.push(row);
  }

  return rows;
}

// ============================================================
// BET — ATUALIZAR CANAL
// ============================================================

async function updateBetChannel(
  bet
) {
  if (!bet?.channelId) {
    return null;
  }

  try {
    const channel =
      await fetchChannel(
        bet.channelId
      );

    if (!channel) {
      return null;
    }

    const messages =
      await channel.messages.fetch({
        limit: 20,
      });

    const botMessage =
      messages.find(
        (message) =>
          message.author?.id ===
          client.user?.id &&
          message.embeds?.some(
            (embed) =>
              embed.title ===
              "🎮 Central da Aposta"
          )
      );

    if (botMessage) {
      await botMessage.edit({
        embeds: [
          fullBetEmbed(
            bet
          ),
        ],
        components:
          betControlButtons(
            bet
          ),
      });

      return botMessage;
    }

    return await channel.send({
      embeds: [
        fullBetEmbed(
          bet
        ),
      ],
      components:
        betControlButtons(
          bet
        ),
    });
  } catch (error) {
    console.error(
      "❌ Erro ao atualizar canal da aposta:",
      error
    );

    return null;
  }
}

// ============================================================
// BET — ENVIAR SALA
// ============================================================

function createRoomModal(
  betId
) {
  return new ModalBuilder()
    .setCustomId(
      `room_modal|${betId}`
    )
    .setTitle(
      "Dados da sala"
    )
    .addComponents(
      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "room_id"
            )
            .setLabel(
              "ID da sala"
            )
            .setPlaceholder(
              "Digite o ID da sala"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(
              true
            )
        ),

      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "room_password"
            )
            .setLabel(
              "Senha da sala"
            )
            .setPlaceholder(
              "Digite a senha"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(
              true
            )
        )
    );
}

async function handleBetRoom(
  interaction
) {
  const parts =
    String(
      interaction.customId ||
        ""
    ).split("|");

  const betId =
    parts[1];

  const bet =
    getBet(
      betId
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
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas um mediador pode enviar os dados da sala.",
        ephemeral: true,
      }
    );
  }

  if (
    String(
      bet.mediatorId
    ) !==
    String(
      interaction.user.id
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não é o mediador desta aposta.",
        ephemeral: true,
      }
    );
  }

  if (
    bet.status !==
    "accepted"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Esta aposta não está aguardando os dados da sala.",
        ephemeral: true,
      }
    );
  }

  return interaction.showModal(
    createRoomModal(
      bet.id
    )
  );
}

// ============================================================
// BET — RECEBER SALA
// ============================================================

async function handleRoomModal(
  interaction
) {
  const parts =
    String(
      interaction.customId ||
        ""
    ).split("|");

  const betId =
    parts[1];

  const bet =
    getBet(
      betId
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
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas mediadores podem enviar os dados da sala.",
        ephemeral: true,
      }
    );
  }

  if (
    String(
      bet.mediatorId
    ) !==
    String(
      interaction.user.id
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não é o mediador desta aposta.",
        ephemeral: true,
      }
    );
  }

  const roomId =
    interaction.fields.getTextInputValue(
      "room_id"
    ).trim();

  const password =
    interaction.fields.getTextInputValue(
      "room_password"
    ).trim();

  if (
    !roomId ||
    !password
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ ID e senha da sala são obrigatórios.",
        ephemeral: true,
      }
    );
  }

  bet.roomId =
    roomId;

  bet.roomPassword =
    password;

  bet.status =
    "room";

  bet.roomSentAt =
    Date.now();

  bet.updatedAt =
    Date.now();

  saveConfig();

  await updateBetChannel(
    bet
  );

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Dados da sala enviados com sucesso.",
      ephemeral: true,
    }
  );
}

// ============================================================
// BET — CANCELAR
// ============================================================

async function handleBetCancel(
  interaction
) {
  const parts =
    String(
      interaction.customId ||
        ""
    ).split("|");

  const betId =
    parts[1];

  const bet =
    getBet(
      betId
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
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas um mediador pode cancelar a aposta.",
        ephemeral: true,
      }
    );
  }

  if (
    bet.mediatorId &&
    String(
      bet.mediatorId
    ) !==
      String(
        interaction.user.id
      )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não é o mediador desta aposta.",
        ephemeral: true,
      }
    );
  }

  if (
    bet.status ===
      "finished" ||
    bet.status ===
      "cancelled"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Esta aposta já foi encerrada.",
        ephemeral: true,
      }
    );
  }

  bet.status =
    "cancelled";

  bet.cancelledAt =
    Date.now();

  bet.updatedAt =
    Date.now();

  saveConfig();

  await updateBetChannel(
    bet
  );

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Aposta cancelada.",
      ephemeral: true,
    }
  );
}

// ============================================================
// BET — FINALIZAR
// ============================================================

async function handleBetFinish(
  interaction
) {
  const parts =
    String(
      interaction.customId ||
        ""
    ).split("|");

  const betId =
    parts[1];

  const bet =
    getBet(
      betId
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
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas um mediador pode finalizar a aposta.",
        ephemeral: true,
      }
    );
  }

  if (
    String(
      bet.mediatorId
    ) !==
    String(
      interaction.user.id
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não é o mediador desta aposta.",
        ephemeral: true,
      }
    );
  }

  if (
    bet.status !==
    "room"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "⚠️ A aposta precisa ter uma sala antes de ser finalizada.",
        ephemeral: true,
      }
    );
  }

  bet.status =
    "finished";

  bet.finishedAt =
    Date.now();

  bet.updatedAt =
    Date.now();

  saveConfig();

  await updateBetChannel(
    bet
  );

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Aposta finalizada com sucesso.",
      ephemeral: true,
    }
  );
}

// ============================================================
// CADASTRO — MEDIADORES
// ============================================================

async function handleMediatorAdd(
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
          "❌ Apenas administradores podem cadastrar mediadores.",
        ephemeral: true,
      }
    );
  }

  return interaction.showModal(
    createMediatorAddModal()
  );
}

async function handleMediatorAddModal(
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
          "❌ Apenas administradores podem cadastrar mediadores.",
        ephemeral: true,
      }
    );
  }

  const userId =
    normalizeId(
      interaction.fields.getTextInputValue(
        "mediator_id"
      )
    );

  if (
    !isValidId(
      userId
    )
  ) {
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
    config.mediators.includes(
      userId
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Esse usuário já está cadastrado como mediador.",
        ephemeral: true,
      }
    );
  }

  const guild =
    await fetchGuild(
      getGuildId(
        interaction
      )
    );

  if (!guild) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Servidor não encontrado.",
        ephemeral: true,
      }
    );
  }

  let member = null;

  try {
    member =
      await guild.members.fetch(
        userId
      );
  } catch {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Esse usuário não está no servidor.",
        ephemeral: true,
      }
    );
  }

  config.mediators.push(
    userId
  );

  saveConfig();

  return sendSafeReply(
    interaction,
    {
      content:
        `✅ ${member} foi cadastrado como mediador.`,
      ephemeral: true,
    }
  );
}

async function handleMediatorRemove(
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
          "❌ Apenas administradores podem remover mediadores.",
        ephemeral: true,
      }
    );
  }

  return interaction.showModal(
    createMediatorRemoveModal()
  );
}

async function handleMediatorRemoveModal(
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
          "❌ Apenas administradores podem remover mediadores.",
        ephemeral: true,
      }
    );
  }

  const userId =
    normalizeId(
      interaction.fields.getTextInputValue(
        "mediator_id"
      )
    );

  const before =
    config.mediators.length;

  config.mediators =
    config.mediators.filter(
      (id) =>
        String(id) !==
        String(userId)
    );

  if (
    config.mediators.length ===
    before
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Esse usuário não está cadastrado como mediador.",
        ephemeral: true,
      }
    );
  }

  saveConfig();

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Mediador removido com sucesso.",
      ephemeral: true,
    }
  );
}

async function handleMediatorList(
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
          "❌ Apenas administradores podem visualizar os mediadores.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        new EmbedBuilder()
          .setTitle(
            "👤 Mediadores"
          )
          .setDescription(
            truncate(
              getMediatorListText(),
              4000
            )
          )
          .setTimestamp(),
      ],
      ephemeral: true,
    }
  );
}

// ============================================================
// CADASTRO — PIX
// ============================================================

async function handlePixAdd(
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
          "❌ Apenas administradores podem cadastrar ADM/Pix.",
        ephemeral: true,
      }
    );
  }

  return interaction.showModal(
    createPixIdModal()
  );
}

async function handlePixIdModal(
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
          "❌ Apenas administradores podem cadastrar ADM/Pix.",
        ephemeral: true,
      }
    );
  }

  const userId =
    normalizeId(
      interaction.fields.getTextInputValue(
        "pix_discord_id"
      )
    );

  if (
    !isValidId(
      userId
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ ID do Discord inválido.",
        ephemeral: true,
      }
    );
  }

  return interaction.showModal(
    createPixDataModal(
      userId
    )
  );
}

async function handlePixDataModal(
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
          "❌ Apenas administradores podem cadastrar ADM/Pix.",
        ephemeral: true,
      }
    );
  }

  const parts =
    String(
      interaction.customId ||
        ""
    ).split("|");

  const userId =
    parts[1];

  if (
    !isValidId(
      userId
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ ID do ADM inválido.",
        ephemeral: true,
      }
    );
  }

  const name =
    safeText(
      interaction.fields.getTextInputValue(
        "admin_name"
      )
    );

  const key =
    safeText(
      interaction.fields.getTextInputValue(
        "admin_pix_key"
      )
    );

  const qr =
    interaction.fields.getTextInputValue(
      "admin_pix_qr"
    )?.trim() ||
    null;

  config.pixAdmins[
    userId
  ] = {
    userId,
    name,
    key,
    qr,
    updatedAt:
      Date.now(),
    updatedBy:
      interaction.user.id,
  };

  saveConfig();

  return sendSafeReply(
    interaction,
    {
      content:
        `✅ ADM/Pix **${name}** cadastrado com sucesso.`,
      ephemeral: true,
    }
  );
}

async function handlePixList(
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
          "❌ Apenas administradores podem visualizar os ADM/Pix.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        new EmbedBuilder()
          .setTitle(
            "💠 ADM/Pix cadastrados"
          )
          .setDescription(
            truncate(
              getPixAdminListText(),
              4000
            )
          )
          .setTimestamp(),
      ],
      ephemeral: true,
    }
  );
}

// ============================================================
// CADASTRO — PAINEL
// ============================================================

async function handleCadastroPanel(
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
          "❌ Apenas administradores podem acessar o cadastro.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        cadastroEmbed(),
      ],
      components:
        cadastroComponents(),
      ephemeral: true,
    }
  );
}

// ============================================================
// EVENTO DE INTERAÇÕES
// ============================================================

client.on(
  Events.InteractionCreate,
  async (
    interaction
  ) => {
    try {
      if (
        interaction.isButton()
      ) {
        const id =
          interaction.customId;

        if (
          id ===
          "config_channels"
        ) {
          return handleConfigChannels(
            interaction
          );
        }

        if (
          id ===
          "config_roles"
        ) {
          return handleConfigRoles(
            interaction
          );
        }

        if (
          id ===
          "config_queue"
        ) {
          return handleQueueConfig(
            interaction
          );
        }

        if (
          id ===
          "config_general"
        ) {
          return handleConfigGeneral(
            interaction
          );
        }

        if (
          id ===
          "config_reset"
        ) {
          return handleConfigReset(
            interaction
          );
        }

        if (
          id ===
          "queue_setup_start"
        ) {
          return handleQueueSetupStart(
            interaction
          );
        }

        if (
          id ===
          "queue_list"
        ) {
          return handleQueueList(
            interaction
          );
        }

        if (
          id ===
          "queue_publish" ||
          id.startsWith(
            "queue_publish|"
          )
        ) {
          return handleQueuePublish(
            interaction
          );
        }

        if (
          id.startsWith(
            "queue_join|"
          )
        ) {
          return handleQueueJoin(
            interaction
          );
        }

        if (
          id.startsWith(
            "queue_leave|"
          )
        ) {
          return handleQueueLeave(
            interaction
          );
        }

        if (
          id.startsWith(
            "bet_accept|"
          )
        ) {
          return handleBetAccept(
            interaction
          );
        }

        if (
          id.startsWith(
            "bet_room|"
          )
        ) {
          return handleBetRoom(
            interaction
          );
        }

        if (
          id.startsWith(
            "bet_cancel|"
          )
        ) {
          return handleBetCancel(
            interaction
          );
        }

        if (
          id.startsWith(
            "bet_finish|"
          )
        ) {
          return handleBetFinish(
            interaction
          );
        }

        if (
          id ===
          "cadastro"
        ) {
          return handleCadastroPanel(
            interaction
          );
        }

        if (
          id ===
          "cadastro_mediator_add"
        ) {
          return handleMediatorAdd(
            interaction
          );
        }

        if (
          id ===
          "cadastro_mediator_remove"
        ) {
          return handleMediatorRemove(
            interaction
          );
        }

        if (
          id ===
          "cadastro_mediator_list"
        ) {
          return handleMediatorList(
            interaction
          );
        }

        if (
          id ===
          "cadastro_pix_add"
        ) {
          return handlePixAdd(
            interaction
          );
        }

        if (
          id ===
          "cadastro_pix_list"
        ) {
          return handlePixList(
            interaction
          );
        }

        if (
          id ===
          "mediator_add"
        ) {
          return handleMediatorAdd(
            interaction
          );
        }

        if (
          id ===
          "mediator_remove"
        ) {
          return handleMediatorRemove(
            interaction
          );
        }

        if (
          id ===
          "mediator_list"
        ) {
          return handleMediatorList(
            interaction
          );
        }

        if (
          id ===
          "pix_add"
        ) {
          return handlePixAdd(
            interaction
          );
        }

        if (
          id ===
          "pix_list"
        ) {
          return handlePixList(
            interaction
          );
        }

        if (
          id ===
          "publish_mediator_queue"
        ) {
          return handleQueueSetupStart(
            interaction
          );
        }
      }

      if (
        interaction.isStringSelectMenu()
      ) {
        const id =
          interaction.customId;

        if (
          id ===
          "queue_setup_format"
        ) {
          return handleQueueSetupFormat(
            interaction
          );
        }

        if (
          id.startsWith(
            "queue_setup_mode|"
          )
        ) {
          return handleQueueSetupMode(
            interaction
          );
        }

        if (
          id.startsWith(
            "queue_setup_type|"
          )
        ) {
          return handleQueueSetupType(
            interaction
          );
        }

        if (
          id.startsWith(
            "queue_setup_value|"
          )
        ) {
          return handleQueueSetupValue(
            interaction
          );
        }
      }

      if (
        interaction.isModalSubmit()
      ) {
        const id =
          interaction.customId;

        if (
          id ===
          "mediator_add_modal"
        ) {
          return handleMediatorAddModal(
            interaction
          );
        }

        if (
          id ===
          "mediator_remove_modal"
        ) {
          return handleMediatorRemoveModal(
            interaction
          );
        }

        if (
          id ===
          "pix_id_modal"
        ) {
          return handlePixIdModal(
            interaction
          );
        }

        if (
          id.startsWith(
            "pix_data_modal|"
          )
        ) {
          return handlePixDataModal(
            interaction
          );
        }

        if (
          id.startsWith(
            "room_modal|"
          )
        ) {
          return handleRoomModal(
            interaction
          );
        }
      }

      if (
        interaction.isChatInputCommand()
      ) {
        await handleSlashCommand(
          interaction
        );
      }
    } catch (error) {
      console.error(
        "❌ Erro no processamento da interação:",
        error
      );

      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Ocorreu um erro ao processar esta ação.",
          ephemeral: true,
        }
      );
    }
  }
);

// ============================================================
// SLASH COMMANDS
// ============================================================

const commands = [
  new SlashCommandBuilder()
    .setName(
      "config"
    )
    .setDescription(
      "Abrir painel de configuração"
    ),

  new SlashCommandBuilder()
    .setName(
      "cadastro"
    )
    .setDescription(
      "Abrir painel de cadastro"
    ),

  new SlashCommandBuilder()
    .setName(
      "filas"
    )
    .setDescription(
      "Abrir gerenciamento de filas"
    ),

  new SlashCommandBuilder()
    .setName(
      "mediadores"
    )
    .setDescription(
      "Listar mediadores"
    ),

  new SlashCommandBuilder()
    .setName(
      "pix"
    )
    .setDescription(
      "Listar ADM/Pix cadastrados"
    ),
].map(
  (command) =>
    command.toJSON()
);

// ============================================================
// SLASH COMMAND HANDLER
// ============================================================

async function handleSlashCommand(
  interaction
) {
  if (
    interaction.commandName ===
    "config"
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
            "❌ Apenas administradores podem acessar a configuração.",
          ephemeral: true,
        }
      );
    }

    return sendSafeReply(
      interaction,
      {
        embeds: [
          configEmbed(),
        ],
        components:
          configButtons(),
        ephemeral: true,
      }
    );
  }

  if (
    interaction.commandName ===
    "cadastro"
  ) {
    return handleCadastroPanel(
      interaction
    );
  }

  if (
    interaction.commandName ===
    "filas"
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
            "❌ Apenas administradores podem acessar as filas.",
          ephemeral: true,
        }
      );
    }

    return sendSafeReply(
      interaction,
      {
        embeds: [
          queueConfigEmbed(),
        ],
        components:
          queueConfigButtons(),
        ephemeral: true,
      }
    );
  }

  if (
    interaction.commandName ===
    "mediadores"
  ) {
    return handleMediatorList(
      interaction
    );
  }

  if (
    interaction.commandName ===
    "pix"
  ) {
    return handlePixList(
      interaction
    );
  }
}

// ============================================================
// CONFIGURAÇÃO DE CANAIS
// ============================================================

function channelConfigEmbed() {
  return new EmbedBuilder()
    .setTitle(
      "📺 Configuração de canais"
    )
    .setDescription(
      [
        `🎮 **Categoria das filas:** ${
          config.channels?.queueCategory
            ? `<#${config.channels.queueCategory}>`
            : "Não configurada"
        }`,
        `🎲 **Categoria das apostas:** ${
          config.channels?.betCategory
            ? `<#${config.channels.betCategory}>`
            : "Não configurada"
        }`,
        `📜 **Canal de logs:** ${
          config.channels?.logs
            ? `<#${config.channels.logs}>`
            : "Não configurado"
        }`,
        `💳 **Canal de pagamentos:** ${
          config.channels?.payments
            ? `<#${config.channels.payments}>`
            : "Não configurado"
        }`,
        `🏆 **Canal de resultados:** ${
          config.channels?.results
            ? `<#${config.channels.results}>`
            : "Não configurado"
        }`,
      ].join("\n")
    )
    .setTimestamp();
}

function channelConfigButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "channel_queue_category"
          )
          .setLabel(
            "Categoria Filas"
          )
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "channel_bet_category"
          )
          .setLabel(
            "Categoria Apostas"
          )
          .setStyle(
            ButtonStyle.Primary
          )
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "channel_logs"
          )
          .setLabel(
            "Logs"
          )
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "channel_payments"
          )
          .setLabel(
            "Pagamentos"
          )
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "channel_results"
          )
          .setLabel(
            "Resultados"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];
}

function createChannelSelect(
  customId
) {
  return new ActionRowBuilder()
    .addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          customId
        )
        .setPlaceholder(
          "Selecione uma categoria"
        )
        .setChannelTypes(
          ChannelType.GuildCategory
        )
        .setMinValues(1)
        .setMaxValues(1)
    );
}

async function handleConfigChannels(
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
          "❌ Apenas administradores podem configurar canais.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        channelConfigEmbed(),
      ],
      components:
        channelConfigButtons(),
      ephemeral: true,
    }
  );
}

async function handleChannelSelect(
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
          "❌ Você não possui permissão.",
        ephemeral: true,
      }
    );
  }

  const channelId =
    interaction.values?.[0];

  const id =
    interaction.customId;

  if (
    !channelId
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Nenhum canal selecionado.",
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "channel_queue_category"
  ) {
    config.channels.queueCategory =
      channelId;
  } else if (
    id ===
    "channel_bet_category"
  ) {
    config.channels.betCategory =
      channelId;
  } else if (
    id ===
    "channel_logs"
  ) {
    config.channels.logs =
      channelId;
  } else if (
    id ===
    "channel_payments"
  ) {
    config.channels.payments =
      channelId;
  } else if (
    id ===
    "channel_results"
  ) {
    config.channels.results =
      channelId;
  }

  saveConfig();

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Configuração de canal salva com sucesso.",
      ephemeral: true,
    }
  );
}

// ============================================================
// CONFIGURAÇÃO DE CARGOS
// ============================================================

function roleConfigEmbed() {
  return new EmbedBuilder()
    .setTitle(
      "🎭 Configuração de cargos"
    )
    .setDescription(
      [
        `🛡️ **Mediador:** ${
          config.roles?.mediator
            ? `<@&${config.roles.mediator}>`
            : "Não configurado"
        }`,
        `👑 **Administrador:** ${
          config.roles?.admin
            ? `<@&${config.roles.admin}>`
            : "Não configurado"
        }`,
      ].join("\n")
    )
    .setTimestamp();
}

function roleConfigButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "role_mediator"
          )
          .setLabel(
            "Cargo Mediador"
          )
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "role_admin"
          )
          .setLabel(
            "Cargo Administrador"
          )
          .setStyle(
            ButtonStyle.Primary
          )
      ),
  ];
}

function createRoleSelect(
  customId
) {
  return new ActionRowBuilder()
    .addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(
          customId
        )
        .setPlaceholder(
          "Selecione um cargo"
        )
        .setMinValues(1)
        .setMaxValues(1)
    );
}

async function handleConfigRoles(
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
          "❌ Apenas administradores podem configurar cargos.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        roleConfigEmbed(),
      ],
      components:
        roleConfigButtons(),
      ephemeral: true,
    }
  );
}

async function handleRoleSelect(
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
          "❌ Você não possui permissão.",
        ephemeral: true,
      }
    );
  }

  const roleId =
    interaction.values?.[0];

  const id =
    interaction.customId;

  if (
    !roleId
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Nenhum cargo selecionado.",
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "role_mediator"
  ) {
    config.roles.mediator =
      roleId;
  } else if (
    id ===
    "role_admin"
  ) {
    config.roles.admin =
      roleId;
  }

  saveConfig();

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Cargo configurado com sucesso.",
      ephemeral: true,
    }
  );
}
```
// ============================================================
// INICIAR BOT
// ============================================================

client.login(TOKEN)
  .then(() => {
    console.log("✅ Bot conectado ao Discord com sucesso!");
  })
  .catch((error) => {
    console.error("❌ Erro ao conectar o bot ao Discord:", error);
  });
