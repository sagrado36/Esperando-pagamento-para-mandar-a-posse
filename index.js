// ================= PARTE 1/6 =================
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

  if (!config.queueChoices) {
    config.queueChoices = {};
  }

  delete config.queueChoices[key];

  saveConfig();
}

function getQueueCapacity(format) {
  return MAX_QUEUE_PLAYERS[format] || 0;
}

function isQueueFull(queue) {
  return (
    queue &&
    Array.isArray(queue.players) &&
    queue.players.length >= getQueueCapacity(queue.format)
  );
}

function userInQueue(queue, userId) {
  if (!queue || !Array.isArray(queue.players)) {
    return false;
  }

  return queue.players.some(
    (player) =>
      String(player.userId || player.id) === String(userId)
  );
}

function removeUserFromQueue(queue, userId) {
  if (!queue || !Array.isArray(queue.players)) {
    return false;
  }

  const before = queue.players.length;

  queue.players = queue.players.filter(
    (player) =>
      String(player.userId || player.id) !== String(userId)
  );

  if (queue.players.length !== before) {
    queue.updatedAt = Date.now();
    return true;
  }

  return false;
}

// ============================================================
// EMBEDS
// ============================================================

function createBaseEmbed(title, description = "") {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  return embed;
}

function configEmbed() {
  return new EmbedBuilder()
    .setTitle("⚙️ Configuração")
    .setDescription(
      "Utilize os botões abaixo para configurar o sistema."
    )
    .setTimestamp();
}

function cadastroEmbed() {
  return new EmbedBuilder()
    .setTitle("📋 Cadastro")
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

function queueEmbed(queue) {
  const capacity = getQueueCapacity(queue.format);
  const players = Array.isArray(queue.players)
    ? queue.players
    : [];

  const playerList =
    players.length > 0
      ? players
          .map(
            (player, index) =>
              `**${index + 1}.** <@${player.userId || player.id}>`
          )
          .join("\n")
      : "Nenhum jogador na fila.";

  const modeName =
    MODES[queue.mode] ||
    safeText(queue.mode);

  const typeName =
    queue.type === "misto"
      ? "Misto"
      : "Normal";

  return new EmbedBuilder()
    .setTitle(
      `🎮 Fila ${queue.format} • ${formatMoney(queue.value)}`
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

function betEmbed(bet) {
  return new EmbedBuilder()
    .setTitle("🎮 Aposta")
    .setDescription(
      [
        `💰 **Valor:** ${formatMoney(bet.value)}`,
        `🎯 **Modo:** ${safeText(MODES[bet.mode], bet.mode)}`,
        `🏷️ **Formato:** ${safeText(bet.format)}`,
        "",
        `👤 **Criador:** <@${bet.createdBy}>`,
        `👥 **Jogadores:** ${bet.players?.length || 0}`,
      ].join("\n")
    )
    .setTimestamp();
}

// ============================================================
// COMPONENTES DE CONFIGURAÇÃO
// ============================================================

function configButtons() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("config_channels")
      .setLabel("Canais")
      .setEmoji("📺")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("config_roles")
      .setLabel("Cargos")
      .setEmoji("🎭")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("config_queue")
      .setLabel("Filas")
      .setEmoji("🎮")
      .setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("config_general")
      .setLabel("Geral")
      .setEmoji("⚙️")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("config_reset")
      .setLabel("Resetar")
      .setEmoji("♻️")
      .setStyle(ButtonStyle.Danger)
  );

  return [row1, row2];
}

function mediatorConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mediator_add")
        .setLabel("Cadastrar Mediador")
        .setEmoji("👤")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("mediator_remove")
        .setLabel("Remover Mediador")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("mediator_list")
        .setLabel("Lista de Mediadores")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("pix_add")
        .setLabel("Cadastrar ADM/Pix")
        .setEmoji("💠")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("pix_list")
        .setLabel("Lista ADM/Pix")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("publish_mediator_queue")
        .setLabel("Publicar Fila")
        .setEmoji("📢")
        .setStyle(ButtonStyle.Primary)
    ),
  ];
}

function cadastroComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("cadastro_mediator_add")
        .setLabel("Cadastrar Mediador")
        .setEmoji("👤")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("cadastro_mediator_remove")
        .setLabel("Remover Mediador")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("cadastro_mediator_list")
        .setLabel("Lista de Mediadores")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("cadastro_pix_add")
        .setLabel("Cadastrar ADM/Pix")
        .setEmoji("💠")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("cadastro_pix_list")
        .setLabel("Lista ADM/Pix")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

// ============================================================
// MODAIS
// ============================================================

function createMediatorAddModal() {
  return new ModalBuilder()
    .setCustomId("mediator_add_modal")
    .setTitle("Cadastrar Mediador")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("mediator_id")
          .setLabel("ID do Discord")
          .setPlaceholder("Digite o ID do usuário")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

function createMediatorRemoveModal() {
  return new ModalBuilder()
    .setCustomId("mediator_remove_modal")
    .setTitle("Remover Mediador")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("mediator_id")
          .setLabel("ID do Discord")
          .setPlaceholder("Digite o ID do usuário")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

function createPixIdModal() {
  return new ModalBuilder()
    .setCustomId("pix_id_modal")
    .setTitle("Cadastrar ADM/Pix")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("pix_discord_id")
          .setLabel("ID do Discord")
          .setPlaceholder("Digite o ID do ADM")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

function createPixDataModal(userId) {
  return new ModalBuilder()
    .setCustomId(`pix_data_modal|${userId}`)
    .setTitle("Dados do ADM/Pix")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_name")
          .setLabel("Nome")
          .setPlaceholder("Nome do ADM")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_pix_key")
          .setLabel("Chave Pix")
          .setPlaceholder("Digite a chave Pix")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_pix_qr")
          .setLabel("QR Code")
          .setPlaceholder("URL da imagem do QR Code (opcional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );
}

// ============================================================
// LISTAS
// ============================================================

function getMediatorListText() {
  if (
    !Array.isArray(config.mediators) ||
    config.mediators.length === 0
  ) {
    return "Nenhum mediador cadastrado.";
  }

  return config.mediators
    .map(
      (id, index) =>
        `**${index + 1}.** <@${id}> — \`${id}\``
    )
    .join("\n");
}

function getPixAdminListText() {
  const admins = Object.values(config.pixAdmins || {});

  if (admins.length === 0) {
    return "Nenhum ADM/Pix cadastrado.";
  }

  return admins
    .map((admin, index) => {
      const name = safeText(admin.name);
      const id = safeText(admin.userId || admin.id);
      const key = safeText(admin.key);

      return [
        `**${index + 1}.** ${name}`,
        `👤 <@${id}>`,
        `💠 \`${key}\``,
      ].join("\n");
    })
    .join("\n\n");
}

// ============================================================
// FILA — COMPONENTES
// ============================================================

function queueButtons(queue) {
  const rows = [];

  const joinButton = new ButtonBuilder()
    .setCustomId(
      `queue_join|${queue.format}|${queue.mode}|${queue.value}|${queue.type}`
    )
    .setLabel("Entrar na fila")
    .setEmoji("🎮")
    .setStyle(ButtonStyle.Success);

  const leaveButton = new ButtonBuilder()
    .setCustomId(
      `queue_leave|${queue.format}|${queue.mode}|${queue.value}|${queue.type}`
    )
    .setLabel("Sair da fila")
    .setEmoji("🚪")
    .setStyle(ButtonStyle.Danger);

  rows.push(
    new ActionRowBuilder().addComponents(
      joinButton,
      leaveButton
    )
  );

  return rows;
}

function queueSetupFormatMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("queue_setup_format")
      .setPlaceholder("Selecione o formato")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        Object.values(FORMATS).map((format) => ({
          label: format,        }))
      )
  );
}

function queueSetupModeMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("queue_setup_mode")
      .setPlaceholder("Selecione o modo")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        {
          label: "Gelo Normal",
          value: "gelo_normal",
          emoji: "❄️",
        },
        {
          label: "Gelo Infinito",
          value: "gelo_infinito",
          emoji: "♾️",
        }
      )
  );
}

function queueSetupValueMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("queue_setup_value")
      .setPlaceholder("Selecione o valor")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        VALUES.map((value) => ({
          label: formatMoney(value),
          value: String(value),
          emoji: "💰",
        }))
      )
  );
}

function queueSetupTypeMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("queue_setup_type")
      .setPlaceholder("Selecione o tipo")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        {
          label: "Normal",
          value: "normal",
          emoji: "🎮",
        },
        {
          label: "Misto",
          value: "misto",
          emoji: "🔀",
        }
      )
  );
}

function queueSetupChannelMenu(guild) {
  const channels = guild.channels.cache
    .filter(
      (channel) =>
        channel.type === ChannelType.GuildText
    )
    .first(25);

  const options = channels.map((channel) => ({
    label: channel.name.slice(0, 100),
    value: channel.id,
    emoji: "📺",
  }));

  if (options.length === 0) {
    options.push({
      label: "Nenhum canal disponível",
      value: "none",
      emoji: "❌",
    });
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("queue_setup_channel")
      .setPlaceholder("Selecione o canal")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
  );
}

// ============================================================
// FILA — REFRESH
// ============================================================

async function refreshQueueMessage(message) {
  if (!message) {
    return null;
  }

  try {
    const parts = String(
      message?.customId ||
      message?.content ||
      ""
    );

    void parts;

    return message;
  } catch (error) {
    console.error("❌ Erro ao atualizar mensagem da fila:", error);
    return null;
  }
}

async function updateQueueMessageByKey(
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

  const queue = getQueue(
    guildId,
    format,
    mode,
    value,
    type
  );

  const messageId = config.queueMessages?.[key];

  if (!messageId) {
    saveConfig();
    return null;
  }

  const channelId =
    config.queueMessageChannels?.[key] ||
    config.channels?.queueCategory;

  if (!channelId) {
    saveConfig();
    return null;
  }

  try {
    const channel = await fetchChannel(channelId);

    if (!channel || !channel.isTextBased()) {
      return null;
    }

    const message = await channel.messages.fetch(messageId);

    await message.edit({
      embeds: [queueEmbed(queue)],
      components: queueButtons(queue),
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

async function registerQueueMessage(
  channel,
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  if (
    !channel ||
    channel.type !== ChannelType.GuildText
  ) {
    throw new Error(
      "O canal selecionado para a fila não é um canal de texto válido."
    );
  }

  const queue = getQueue(
    guildId,
    format,
    mode,
    value,
    type
  );

  const key = makeQueueKey(
    guildId,
    format,
    mode,
    value,
    type
  );

  if (!config.queueMessages) {
    config.queueMessages = {};
  }

  if (!config.queueMessageChannels) {
    config.queueMessageChannels = {};
  }

  const oldMessageId = config.queueMessages[key];

  if (oldMessageId) {
    try {
      const oldMessage = await channel.messages.fetch(
        oldMessageId
      );

      await oldMessage.edit({
        embeds: [queueEmbed(queue)],
        components: queueButtons(queue),
      });

      config.queueMessageChannels[key] = channel.id;
      saveConfig();

      return oldMessage;
    } catch {
      // Mensagem antiga não existe mais.
    }
  }

  const message = await channel.send({
    embeds: [queueEmbed(queue)],
    components: queueButtons(queue),
  });

  config.queueMessages[key] = message.id;
  config.queueMessageChannels[key] = channel.id;

  saveConfig();

  return message;
}

// ============================================================
// BET CHANNEL
// ============================================================

function sanitizeChannelName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);
}

async function createBetChannel(
  guild,
  queue,
  players
) {
  if (!guild) {
    throw new Error("Servidor não encontrado.");
  }

  const categoryId = config.channels?.betCategory;

  const channelName = sanitizeChannelName(
    `aposta-${queue.format}-${queue.value}-${Date.now()
      .toString()
      .slice(-5)}`
  );

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel,
      ],
    },
  ];

  for (const player of players) {
    const userId = player.userId || player.id;

    if (!isValidId(userId)) {
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
    options.parent = categoryId;
  }

  const channel = await guild.channels.create(options);

  const betId = `${guild.id}-${channel.id}`;

  const bet = {
    id: betId,
    channelId: channel.id,
    guildId: guild.id,
    format: queue.format,
    mode: queue.mode,
    value: Number(queue.value),
    type: queue.type,
    players: players.map((player) => ({
      userId: player.userId || player.id,
      joinedAt: player.joinedAt || Date.now(),
    })),
    createdBy:
      players[0]?.userId ||
      players[0]?.id ||
      null,
    createdAt: Date.now(),
    status: "waiting",
  };

  config.bets[betId] = bet;

  saveConfig();

  await channel.send({
    embeds: [betEmbed(bet)],
  });

  return {
    channel,
    bet,
  };
}

// ============================================================
// FILA — ENTRAR
// ============================================================

async function handleQueueJoin(interaction) {
  const parts = String(interaction.customId || "").split("|");

  if (parts.length < 5) {
    return sendSafeReply(interaction, {
      content: "❌ Dados da fila inválidos.",
      ephemeral: true,
    });
  }

  const [
    action,
    format,
    mode,
    rawValue,
    type = "normal",
  ] = parts;

  if (action !== "queue_join") {
    return;
  }

  const value = Number(rawValue);

  if (!Object.values(FORMATS).includes(format)) {
    return sendSafeReply(interaction, {
      content: "❌ Formato de fila inválido.",
      ephemeral: true,
    });
  }

  if (!Object.keys(MODES).includes(mode)) {
    return sendSafeReply(interaction, {
      content: "❌ Modo de fila inválido.",
      ephemeral: true,
    });
  }

  if (!VALUES.includes(value)) {
    return sendSafeReply(interaction, {
      content: "❌ Valor de fila inválido.",
      ephemeral: true,
    });
  }

  if (!Object.values(QUEUE_TYPES).includes(type)) {
    return sendSafeReply(interaction, {
      content: "❌ Tipo de fila inválido.",
      ephemeral: true,
    });
  }

  const guildId = getGuildId(interaction);

  if (!guildId) {
    return sendSafeReply(interaction, {
      content: "❌ Servidor não configurado.",
      ephemeral: true,
    });
  }

  const queueKey = makeQueueKey(
    guildId,
    format,
    mode,
    value,
    type
  );

  if (client.queueLocks.has(queueKey)) {
    return sendSafeReply(interaction, {
      content: "⏳ Aguarde, processando a fila...",
      ephemeral: true,
    });
  }

  client.queueLocks.add(queueKey);

  try {
    const queue = getQueue(
      guildId,
      format,
      mode,
      value,
      type
    );

    if (userInQueue(queue, interaction.user.id)) {
      return sendSafeReply(interaction, {
        content: "⚠️ Você já está nessa fila.",
        ephemeral: true,
      });
    }

    if (isQueueFull(queue)) {
      return sendSafeReply(interaction, {
        content: "❌ Essa fila já está cheia.",
        ephemeral: true,
      });
    }

    queue.players.push({
      userId: interaction.user.id,
      joinedAt: Date.now(),
    });

    queue.updatedAt = Date.now();

    saveConfig();

    try {
      await interaction.message.edit({
        embeds: [queueEmbed(queue)],
        components: queueButtons(queue),
      });
    } catch (error) {
      console.error(
        "❌ Erro ao atualizar fila após entrada:",
        error
      );
    }

    if (isQueueFull(queue)) {
      const players = [...queue.players];

      try {
        await createBetChannel(
          interaction.guild,
          queue,
          players
        );

        queue.players = [];
        queue.updatedAt = Date.now();

        saveConfig();

        try {
          await interaction.message.edit({
            embeds: [queueEmbed(queue)],
            components: queueButtons(queue),
          });
        } catch (error) {
          console.error(
            "❌ Erro ao limpar fila após criação da aposta:",
            error
          );
        }

        await sendSafeReply(interaction, {
          content:
            "✅ Fila completa! O canal da aposta foi criado.",
          ephemeral: true,
        });
      } catch (error) {
        console.error(
          "❌ Erro ao criar canal da aposta:",
          error
        );

        queue.players = players;
        saveConfig();

        await sendSafeReply(interaction, {
          content:
            "❌ Não foi possível criar o canal da aposta.",
          ephemeral: true,
        });
      }

      return;
    }

    await sendSafeReply(interaction, {
      content: "✅ Você entrou na fila!",
      ephemeral: true,
    });
  } finally {
    client.queueLocks.delete(queueKey);
  }
}

// ============================================================
// FILA — SAIR
// ============================================================

async function handleQueueLeave(interaction) {
  const parts = String(interaction.customId || "").split("|");

  if (parts.length < 5) {
    return sendSafeReply(interaction, {
      content: "❌ Dados da fila inválidos.",
      ephemeral: true,
    });
  }

  const [
    action,
    format,
    mode,
    rawValue,
    type = "normal",
  ] = parts;

  if (action !== "queue_leave") {
    return;
  }

  const value = Number(rawValue);

  if (!Object.values(FORMATS).includes(format)) {
    return sendSafeReply(interaction, {
      content: "❌ Formato de fila inválido.",
      ephemeral: true,
    });
  }

  if (!Object.keys(MODES).includes(mode)) {
    return sendSafeReply(interaction, {
      content: "❌ Modo de fila inválido.",
      ephemeral: true,
    });
  }

  if (!VALUES.includes(value)) {
    return sendSafeReply(interaction, {
      content: "❌ Valor de fila inválido.",
      ephemeral: true,
    });
  }

  if (!Object.values(QUEUE_TYPES).includes(type)) {
    return sendSafeReply(interaction, {
      content: "❌ Tipo de fila inválido.",
      ephemeral: true,
    });
  }

  const guildId = getGuildId(interaction);

  if (!guildId) {
    return sendSafeReply(interaction, {
      content: "❌ Servidor não configurado.",
      ephemeral: true,
    });
  }

  const queue = getQueue(
    guildId,
    format,
    mode,
    value,
    type
  );

  const removed = removeUserFromQueue(
    queue,
    interaction.user.id
  );

  if (!removed) {
    return sendSafeReply(interaction, {
      content: "⚠️ Você não está nessa fila.",
      ephemeral: true,
    });
  }

  queue.updatedAt = Date.now();

  saveConfig();

  try {
    await interaction.message.edit({
      embeds: [queueEmbed(queue)],
      components: queueButtons(queue),
    });
  } catch (error) {
    console.error(
      "❌ Erro ao atualizar fila após saída:",
      error
    );
  }

  await sendSafeReply(interaction, {
    content: "✅ Você saiu da fila.",
    ephemeral: true,
  });
}

// ============================================================
// CONFIGURAÇÃO DE FILA
// ============================================================

async function handleQueueSetupChannel(interaction) {
  const setup = client.queueSetup[interaction.user.id];

  if (!setup) {
    return sendSafeReply(interaction, {
      content:
        "❌ Sua configuração de fila expirou. Comece novamente.",
      ephemeral: true,
    });
  }

  const channelId = interaction.values?.[0];

  if (!channelId || channelId === "none") {
    return sendSafeReply(interaction, {
      content: "❌ Canal inválido.",
      ephemeral: true,
    });
  }

  const targetChannel = interaction.guild.channels.cache.get(
    channelId
  );

  if (
    !targetChannel ||
    targetChannel.type !== ChannelType.GuildText
  ) {
    return sendSafeReply(interaction, {
      content:
        "❌ O canal selecionado não é um canal de texto válido.",
      ephemeral: true,
    });
  }

  const numericValue = Number(setup.value);

  if (
    !setup.format ||
    !setup.mode ||
    !Number.isFinite(numericValue) ||
    !VALUES.includes(numericValue)
  ) {
    return sendSafeReply(interaction, {
      content:
        "❌ A configuração da fila está incompleta ou possui um valor inválido.",
      ephemeral: true,
    });
  }

  const type = setup.type || "normal";

  if (!Object.values(QUEUE_TYPES).includes(type)) {
    return sendSafeReply(interaction, {
      content: "❌ Tipo de fila inválido.",
      ephemeral: true,
    });
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

    delete client.queueSetup[interaction.user.id];

    await sendSafeReply(interaction, {
      content:
        `✅ Fila publicada em ${targetChannel}.`,
      ephemeral: true,
    });
  } catch (error) {
    console.error(
      "❌ Erro ao publicar fila:",
      error
    );

    await sendSafeReply(interaction, {
      content:
        "❌ Não foi possível publicar a fila. Verifique as permissões do bot.",
      ephemeral: true,
    });
  }
}

// ============================================================
// MEDIADORES
// ============================================================

async function addMediator(interaction, userId) {
  const id = normalizeId(userId);

  if (!isValidId(id)) {
    return sendSafeReply(interaction, {
      content: "❌ ID do Discord inválido.",
      ephemeral: true,
    });
  }

  if (!Array.isArray(config.mediators)) {
    config.mediators = [];
  }

  if (config.mediators.includes(id)) {
    return sendSafeReply(interaction, {
      content: "⚠️ Esse usuário já é mediador.",
      ephemeral: true,
    });
  }

  config.mediators.push(id);

  saveConfig();

  await sendSafeReply(interaction, {
    content:
      `✅ <@${id}> foi cadastrado como mediador.`,
    ephemeral: true,
  });
}

async function removeMediator(interaction, userId) {
  const id = normalizeId(userId);

  if (!Array.isArray(config.mediators)) {
    config.mediators = [];
  }

  const before = config.mediators.length;

  config.mediators = config.mediators.filter(
    (mediatorId) => mediatorId !== id
  );

  if (before === config.mediators.length) {
    return sendSafeReply(interaction, {
      content: "⚠️ Esse usuário não está cadastrado como mediador.",
      ephemeral: true,
    });
  }

  saveConfig();

  await sendSafeReply(interaction, {
    content:
      `✅ <@${id}> foi removido dos mediadores.`,
    ephemeral: true,
  });
}

// ============================================================
// PIX / ADM
// ============================================================

async function savePixAdmin(
  interaction,
  userId,
  name,
  key,
  qr
) {
  const id = normalizeId(userId);

  if (!isValidId(id)) {
    return sendSafeReply(interaction, {
      content: "❌ ID do Discord inválido.",
      ephemeral: true,
    });
  }

  const data = {
    id: userId,
    userId,
    name,
    key,
    qr: qr || null,
    addedBy: interaction.user.id,
    addedAt: Date.now(),
  };

  if (!config.pixAdmins) {
    config.pixAdmins = {};
  }

  config.pixAdmins[id] = data;

  saveConfig();

  await sendSafeReply(interaction, {
    content:
      `✅ ADM/Pix de <@${id}> cadastrado com sucesso.`,
    ephemeral: true,
  });
}

// ============================================================
// COMANDO /CONFIG
// ============================================================

async function handleConfigCommand(interaction) {
  if (!canManage(interaction)) {
    return sendSafeReply(interaction, {
      content:
        "❌ Você não tem permissão para usar este comando.",
      ephemeral: true,
    });
  }

  await sendSafeReply(interaction, {
    embeds: [configEmbed()],
    components: configButtons(),
    ephemeral: true,
  });
}

// ============================================================
// COMANDO /CADASTRO
// ============================================================

async function handleCadastroCommand(interaction) {
  if (!canManage(interaction)) {
    return sendSafeReply(interaction, {
      content:
        "❌ Você não tem permissão para usar este comando.",
      ephemeral: true,
    });
  }

  await sendSafeReply(interaction, {
    embeds: [cadastroEmbed()],
    components: cadastroComponents(),
    ephemeral: true,
  });
}

// ============================================================
// COMANDO /FILA
// ============================================================

async function handleFilaCommand(interaction) {
  if (!canManage(interaction)) {
    return sendSafeReply(interaction, {
      content:
        "❌ Você não tem permissão para usar este comando.",
      ephemeral: true,
    });
  }

  client.queueSetup[interaction.user.id] = {
    guildId: interaction.guildId,
    format: null,
    mode: null,
    value: null,
    type: "normal",
    createdAt: Date.now(),
  };

  await sendSafeReply(interaction, {
    content:
      "🎮 **Configuração da fila**\n\nSelecione o formato:",
    components: [
      queueSetupFormatMenu(),
    ],
    ephemeral: true,
  });
}

// ============================================================
// EVENTOS DE SELECT MENU
// ============================================================

async function handleStringSelect(interaction) {
  const customId = interaction.customId;

  if (customId === "queue_setup_format") {
    const setup = client.queueSetup[interaction.user.id];

    if (!setup) {
      return sendSafeReply(interaction, {
        content:
          "❌ Sua configuração de fila expirou.",
        ephemeral: true,
      });
    }

    const format = interaction.values?.[0];

    if (!Object.values(FORMATS).includes(format)) {
      return sendSafeReply(interaction, {
        content: "❌ Formato inválido.",
        ephemeral: true,
      });
    }

    setup.format = format;

    return editSafeReply(interaction, {
      content:
        `🎮 Formato selecionado: **${format}**\n\nSelecione o modo:`,
      components: [
        queueSetupModeMenu(),
      ],// ================= PARTE 3/6 =================

  if (customId === "queue_setup_mode") {
    const setup = client.queueSetup[interaction.user.id];

    if (!setup) {
      return sendSafeReply(interaction, {
        content:
          "❌ Sua configuração de fila expirou.",
        ephemeral: true,
      });
    }

    const mode = interaction.values?.[0];

    if (!Object.keys(MODES).includes(mode)) {
      return sendSafeReply(interaction, {
        content: "❌ Modo inválido.",
        ephemeral: true,
      });
    }

    setup.mode = mode;

    return editSafeReply(interaction, {
      content:
        `🎯 Modo selecionado: **${MODES[mode]}**\n\nSelecione o valor:`,
      components: [
        queueSetupValueMenu(),
      ],
    });
  }

  if (customId === "queue_setup_value") {
    const setup = client.queueSetup[interaction.user.id];

    if (!setup) {
      return sendSafeReply(interaction, {
        content:
          "❌ Sua configuração de fila expirou.",
        ephemeral: true,
      });
    }

    const rawValue = interaction.values?.[0];
    const selectedValue = Number(rawValue);

    if (
      !Number.isFinite(selectedValue) ||
      !VALUES.includes(selectedValue)
    ) {
      return sendSafeReply(interaction, {
        content:
          "❌ O valor selecionado não é válido. Escolha um valor da lista.",
        ephemeral: true,
      });
    }

    setup.value = selectedValue;

    return editSafeReply(interaction, {
      content:
        `💰 Valor selecionado: **${formatMoney(selectedValue)}**\n\nSelecione o tipo da fila:`,
      components: [
        queueSetupTypeMenu(),
      ],
    });
  }

  if (customId === "queue_setup_type") {
    const setup = client.queueSetup[interaction.user.id];

    if (!setup) {
      return sendSafeReply(interaction, {
        content:
          "❌ Sua configuração de fila expirou.",
        ephemeral: true,
      });
    }

    const type = interaction.values?.[0];

    if (!Object.values(QUEUE_TYPES).includes(type)) {
      return sendSafeReply(interaction, {
        content: "❌ Tipo inválido.",
        ephemeral: true,
      });
    }

    setup.type = type;

    const guild = interaction.guild;

    if (!guild) {
      return sendSafeReply(interaction, {
        content:
          "❌ Servidor não encontrado.",
        ephemeral: true,
      });
    }

    return editSafeReply(interaction, {
      content:
        `🏷️ Tipo selecionado: **${type === "misto" ? "Misto" : "Normal"}**\n\nSelecione o canal onde a fila será publicada:`,
      components: [
        queueSetupChannelMenu(guild),
      ],
    });
  }

  if (customId === "queue_setup_channel") {
    return handleQueueSetupChannel(interaction);
  }
}

// ============================================================
// COMANDOS SLASH
// ============================================================

const slashCommands = [
  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Abrir o painel de configuração."),

  new SlashCommandBuilder()
    .setName("cadastro")
    .setDescription("Abrir o painel de cadastros."),

  new SlashCommandBuilder()
    .setName("fila")
    .setDescription("Configurar e publicar uma fila."),

  new SlashCommandBuilder()
    .setName("med")
    .setDescription("Abrir painel de mediador."),
].map((command) => command.toJSON());

// ============================================================
// REGISTRO DOS COMANDOS
// ============================================================

async function registerSlashCommands() {
  try {
    const rest = new REST({
      version: "10",
    }).setToken(TOKEN);

    if (GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(
          CLIENT_ID,
          GUILD_ID
        ),
        {
          body: slashCommands,
        }
      );

      console.log(
        "✅ Comandos slash registrados no servidor."
      );
    } else {
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        {
          body: slashCommands,
        }
      );

      console.log(
        "✅ Comandos slash registrados globalmente."
      );
    }
  } catch (error) {
    console.error(
      "❌ Erro ao registrar comandos:",
      error
    );
  }
}

// ============================================================
// INTERAÇÕES
// ============================================================

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "config") {
        return handleConfigCommand(interaction);
      }

      if (interaction.commandName === "cadastro") {
        return handleCadastroCommand(interaction);
      }

      if (interaction.commandName === "fila") {
        return handleFilaCommand(interaction);
      }

      if (interaction.commandName === "med") {
        return handleMediatorCommand(interaction);
      }

      return;
    }

    if (interaction.isStringSelectMenu()) {
      return handleStringSelect(interaction);
    }

    if (interaction.isButton()) {
      return handleButtonInteraction(interaction);
    }

    if (interaction.isModalSubmit()) {
      return handleModalSubmit(interaction);
    }
  } catch (error) {
    console.error(
      "❌ Erro em interactionCreate:",
      error
    );

    try {
      await sendSafeReply(interaction, {
        content:
          "❌ Ocorreu um erro ao processar essa interação.",
        ephemeral: true,
      });
    } catch {
      // Ignora erro de resposta secundária.
    }
  }
});

// ============================================================
// BOTÕES
// ============================================================

async function handleButtonInteraction(interaction) {
  const customId = interaction.customId;

  if (
    customId === "queue_join" ||
    customId.startsWith("queue_join|")
  ) {
    return handleQueueJoin(interaction);
  }

  if (
    customId === "queue_leave" ||
    customId.startsWith("queue_leave|")
  ) {
    return handleQueueLeave(interaction);
  }

  if (customId === "cadastro_mediator_add") {
    if (!canManage(interaction)) {
      return sendSafeReply(interaction, {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      });
    }

    return interaction.showModal(
      createMediatorAddModal()
    );
  }

  if (customId === "cadastro_mediator_remove") {
    if (!canManage(interaction)) {
      return sendSafeReply(interaction, {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      });
    }

    return interaction.showModal(
      createMediatorRemoveModal()
    );
  }

  if (customId === "cadastro_mediator_list") {
    if (!canManage(interaction)) {
      return sendSafeReply(interaction, {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("📋 Mediadores")
      .setDescription(getMediatorListText())
      .setTimestamp();

    return sendSafeReply(interaction, {
      embeds: [embed],
      ephemeral: true,
    });
  }

  if (customId === "cadastro_pix_add") {
    if (!canManage(interaction)) {
      return sendSafeReply(interaction, {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      });
    }

    return interaction.showModal(
      createPixIdModal()
    );
  }

  if (customId === "cadastro_pix_list") {
    if (!canManage(interaction)) {
      return sendSafeReply(interaction, {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("💠 ADM/Pix")
      .setDescription(getPixAdminListText())
      .setTimestamp();

    return sendSafeReply(interaction, {
      embeds: [embed],
      ephemeral: true,
    });
  }

  if (customId === "mediator_add") {
    if (!canManage(interaction)) {
      return sendSafeReply(interaction, {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      });
    }

    return interaction.showModal(
      createMediatorAddModal()
    );
  }

  if (customId === "mediator_remove") {
    if (!canManage(interaction)) {
      return sendSafeReply(interaction, {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      });
    }

    return interaction.showModal(
      createMediatorRemoveModal()
    );
  }

  if (customId === "mediator_list") {
    if (!canManage(interaction)) {
      return sendSafeReply(interaction, {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("📋 Mediadores")
      .setDescription(getMediatorListText())
      .setTimestamp();

    return sendSafeReply(interaction, {
      embeds: [embed],
      ephemeral: true,
    });
  }

  if (customId === "pix_add") {
    if (!canManage(interaction)) {
      return sendSafeReply(interaction, {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      });
    }

    return interaction.showModal(
      createPixIdModal()
    );
  }

  if (customId === "pix_list") {
    if (!canManage(interaction)) {
      return sendSafeReply(interaction, {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("💠 ADM/Pix")
      .setDescription(getPixAdminListText())
      .setTimestamp();

    return sendSafeReply(interaction, {
      embeds: [embed],
      ephemeral: true,
    });
  }

  if (customId === "publish_mediator_queue") {
    if (!canManage(interaction)) {
      return sendSafeReply(interaction, {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      });
    }

    return handleFilaCommand(interaction);
  }

  if (customId === "config_channels") {
    return handleConfigChannels(interaction);
  }

  if (customId === "config_roles") {
    return handleConfigRoles(interaction);
  }

  if (customId === "config_queue") {
    return handleConfigQueue(interaction);
  }

  if (customId === "config_general") {
    return handleConfigGeneral(interaction);
  }

  if (customId === "config_reset") {
    return handleConfigReset(interaction);
  }
}

// ============================================================
// MODAIS
// ============================================================

async function handleModalSubmit(interaction) {
  const customId = interaction.customId;

  if (customId === "mediator_add_modal") {
    if (!canManage(interaction)) {
      return sendSafeReply(interaction, {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      });
    }

    const userId =
      interaction.fields.getTextInputValue(
        "mediator_id"
      );

    return addMediator(interaction, userId);
  }

  if (customId === "mediator_remove_modal") {
    if (!canManage(interaction)) {
      return sendSafeReply(interaction, {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      });
    }

    const userId =
      interaction.fields.getTextInputValue(
        "mediator_id"
      );

    return removeMediator(interaction, userId);
  }

  if (customId === "pix_id_modal") {
    if (!canManage(interaction)) {
      return sendSafeReply(interaction, {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      });
    }

    const userId =
      interaction.fields.getTextInputValue(
        "pix_discord_id"
      );

    if (!isValidId(userId)) {
      return sendSafeReply(interaction, {
        content:
          "❌ ID do Discord inválido.",
        ephemeral: true,
      });
    }

    return interaction.showModal(
      createPixDataModal(userId)
    );
  }

  if (customId.startsWith("pix_data_modal|")) {
    if (!canManage(interaction)) {
      return sendSafeReply(interaction, {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      });
    }

    const [, userId] = customId.split("|");

    const name =
      interaction.fields.getTextInputValue(
        "admin_name"
      );

    const key =
      interaction.fields.getTextInputValue(
        "admin_pix_key"
      );

    let qr = "";

    try {
      qr =
        interaction.fields.getTextInputValue(
          "admin_pix_qr"
        );
    } catch {
      qr = "";
    }

    return savePixAdmin(
      interaction,
      userId,
      name,
      key,
      qr
    );
  }
}

// ============================================================
// CONFIGURAÇÕES DE CANAIS
// ============================================================

function channelConfigEmbed() {
  return new EmbedBuilder()
    .setTitle("📺 Canais")
    .setDescription(
      [
        `📂 Categoria de filas: ${
          config.channels.queueCategory
            ? `<#${config.channels.queueCategory}>`
            : "Não configurada"
        }`,
        `📂 Categoria de apostas: ${
          config.channels.betCategory
            ? `<#${config.channels.betCategory}>`
            : "Não configurada"
        }`,
        `📝 Logs: ${
          config.channels.logs
            ? `<#${config.channels.logs}>`
            : "Não configurado"
        }`,
        `💰 Pagamentos: ${
          config.channels.payments
            ? `<#${config.channels.payments}>`
            : "Não configurado"
        }`,
        `🏆 Resultados: ${
          config.channels.results
            ? `<#${config.channels.results}>`
            : "Não configurado"
        }`,
      ].join("\n")
    )
    .setTimestamp();
}

function channelConfigComponents(guild) {
  const channels = guild.channels.cache
    .filter(
      (channel) =>
        channel.type === ChannelType.GuildCategory ||
        channel.type === ChannelType.GuildText
    )
    .first(25);

  const options = channels.map((channel) => ({
    label: channel.name.slice(0, 100),
    value: channel.id,
    emoji:
      channel.type === ChannelType.GuildCategory
        ? "📂"
        : "📺",
  }));

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("channel_set_queue_category")
        .setLabel("Categoria de Filas")
        .setEmoji("🎮")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("channel_set_bet_category")
        .setLabel("Categoria de Apostas")
        .setEmoji("🎯")
        .setStyle(ButtonStyle.Primary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("channel_set_logs")
        .setLabel("Logs")
        .setEmoji("📝")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("channel_set_payments")
        .setLabel("Pagamentos")
        .setEmoji("💰")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("channel_set_results")
        .setLabel("Resultados")
        .setEmoji("🏆")
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("channel_select")
        .setPlaceholder("Selecione um canal/categoria")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          options.length
            ? options
            : [
                {
                  label: "Nenhum canal disponível",
                  value: "none",
                },
              ]
        )
    ),
  ];
}

async function handleConfigChannels(interaction) {
  if (!canManage(interaction)) {
    return sendSafeReply(interaction, {
      content:
        "❌ Você não tem permissão.",
      ephemeral: true,
    });
  }

  const guild = interaction.guild;

  if (!guild) {
    return sendSafeReply(interaction, {
      content:
        "❌ Servidor não encontrado.",
      ephemeral: true,
    });
  }

  return sendSafeReply(interaction, {
    embeds: [channelConfigEmbed()],
    components: channelConfigComponents(guild),
    ephemeral: true,
  });
}

// ============================================================
// CONFIGURAÇÕES DE CARGOS
// ============================================================

function roleConfigEmbed() {
  return new EmbedBuilder()
    .setTitle("🎭 Cargos")
    .setDescription(
      [
        `👤 Mediador: ${
          config.roles.mediator
            ? `<@&${config.roles.mediator}>`
            : "Não configurado"
        }`,
        `🛡️ Admin: ${
          config.roles.admin
            ? `<@&${config.roles.admin}>`
            : "Não configurado"
        }`,
      ].join("\n")
    )
    .setTimestamp();
}

async function handleConfigRoles(interaction) {
  if (!canManage(interaction)) {
    return sendSafeReply(interaction, {
      content:
        "❌ Você não tem permissão.",
      ephemeral: true,
    });
  }

  return sendSafeReply(interaction, {
    embeds: [roleConfigEmbed()],
    ephemeral: true,
  });
}// ================= PARTE 4/6 =================

      if (
        !channel.isTextBased()
      ) {
        continue;
      }

      try {
        const message =
          await channel.messages.fetch(
            messageId
          );

        if (
          message
        ) {
          await message.edit({
            embeds: [
              queueEmbed(
                interaction.guild.id,
                format,
                mode,
                value,
                type
              ),
            ],
            components:
              queueButtons(
                format,
                mode,
                value,
                type
              ),
          });

          break;
        }
      } catch {
        // Continua procurando o canal.
      }
    }
  }

  return sendSafeReply(
    interaction,
    {
      content:
        `🚪 Você saiu da fila **${format} ${mode} — ${formatMoney(
          value
        )}**.`,
      ephemeral: true,
    }
  );
}

// ============================================================
// CONFIGURAÇÃO DE CARGOS
// ============================================================

async function handleConfigRoles(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para configurar os cargos.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        createRolesEmbed(
          interaction.guild.id
        ),
      ],
      components:
        rolesComponents(),
      ephemeral: true,
    }
  );
}

// ============================================================
// CONFIGURAÇÃO DE CANAIS
// ============================================================

async function handleConfigChannels(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para configurar os canais.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        createChannelsEmbed(
          interaction.guild.id
        ),
      ],
      components:
        channelsComponents(),
      ephemeral: true,
    }
  );
}

// ============================================================
// CONFIGURAÇÃO DE APOSTAS
// ============================================================

async function handleConfigBets(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para configurar as apostas.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        createBetsConfigEmbed(
          interaction.guild.id
        ),
      ],
      components:
        betsComponents(),
      ephemeral: true,
    }
  );
}

// ============================================================
// CONFIGURAÇÃO DE APARÊNCIA
// ============================================================

async function handleConfigAppearance(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para configurar a aparência.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        createAppearanceEmbed(
          interaction.guild.id
        ),
      ],
      components:
        appearanceComponents(),
      ephemeral: true,
    }
  );
}

// ============================================================
// CONFIGURAÇÃO GERAL
// ============================================================

async function handleConfigGeneral(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para configurar o bot.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        createConfigEmbed(
          interaction.guild.id
        ),
      ],
      ephemeral: true,
    }
  );
}

// ============================================================
// TAXA
// ============================================================

async function handleConfigFee(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para configurar a taxa.",
        ephemeral: true,
      }
    );
  }

  return interaction.showModal(
    createFeeModal()
  );
}

// ============================================================
// RESET
// ============================================================

async function handleConfigReset(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para resetar a configuração.",
        ephemeral: true,
      }
    );
  }

  const guildId =
    interaction.guild.id;

  if (
    !db.guilds ||
    !db.guilds[guildId]
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "ℹ️ Não há configuração para resetar.",
        ephemeral: true,
      }
    );
  }

  db.guilds[guildId] = {
    ...createDefaultGuildConfig(),
    guildId,
  };

  saveDatabase();

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ A configuração do servidor foi resetada.",
      ephemeral: true,
    }
  );
}

// ============================================================
// MEDIADOR
// ============================================================

async function handleMediatorCommand(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para usar o painel de mediador.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        createCadastroEmbed(
          interaction.guild.id
        ),
      ],
      components:
        mediatorConfigComponents(),
      ephemeral: true,
    }
  );
}

// ============================================================
// BOTÕES — PAINEL PRINCIPAL
// ============================================================

async function handleMainConfigButton(
  interaction
) {
  const customId =
    interaction.customId;

  switch (
    customId
  ) {
    case "config_roles":
      return handleConfigRoles(
        interaction
      );

    case "config_channels":
      return handleConfigChannels(
        interaction
      );

    case "config_bets":
      return handleConfigBets(
        interaction
      );

    case "config_appearance":
      return handleConfigAppearance(
        interaction
      );

    case "config_fee_set":
      return handleConfigFee(
        interaction
      );

    default:
      return null;
  }
}

// ============================================================
// CADASTRO DE MEDIADOR
// ============================================================

async function handleMediatorAdd(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      }
    );
  }

  return interaction.showModal(
    createMediatorAddModal()
  );
}

async function handleMediatorRemove(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      }
    );
  }

  return interaction.showModal(
    createMediatorRemoveModal()
  );
}

async function handleMediatorList(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      }
    );
  }

  const guildId =
    interaction.guild.id;

  const guildConfig =
    getGuildConfig(
      guildId
    );

  const mediators =
    Array.isArray(
      guildConfig.mediators
    )
      ? guildConfig.mediators
      : [];

  const description =
    mediators.length
      ? mediators
          .map(
            (
              id,
              index
            ) =>
              `**${index + 1}.** <@${id}> — \`${id}\``
          )
          .join("\n")
      : "Nenhum mediador cadastrado.";

  return sendSafeReply(
    interaction,
    {
      embeds: [
        createEmbed(
          guildId,
          "📋 MEDIADORES",
          description
        ),
      ],
      ephemeral: true,
    }
  );
}

// ============================================================
// CADASTRO PIX
// ============================================================

async function handlePixAdd(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      }
    );
  }

  return interaction.showModal(
    createPixIdModal()
  );
}

async function handlePixList(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      }
    );
  }

  const guildId =
    interaction.guild.id;

  const guildConfig =
    getGuildConfig(
      guildId
    );

  const admins =
    guildConfig.pixAdmins || {};

  const entries =
    Object.values(
      admins
    );

  const description =
    entries.length
      ? entries
          .map(
            (
              admin,
              index
            ) =>
              [
                `**${index + 1}.** ${safeText(admin.name)}`,
                `👤 <@${admin.userId}>`,
                `💠 \`${safeText(admin.key)}\``,
              ].join("\n")
          )
          .join("\n\n")
      : "Nenhum ADM/Pix cadastrado.";

  return sendSafeReply(
    interaction,
    {
      embeds: [
        createEmbed(
          guildId,
          "💠 ADM / PIX",
          description
        ),
      ],
      ephemeral: true,
    }
  );
}

// ============================================================
// PUBLICAR FILA
// ============================================================

async function handlePublishMediatorQueue(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      content:
        "🎮 Selecione o canal onde deseja publicar a fila.",
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(
              "mediator_queue_channel"
            )
            .setPlaceholder(
              "Escolha o canal da fila"
            )
            .addChannelTypes(
              ChannelType.GuildText
            )
            .setMinValues(1)
            .setMaxValues(1)
        ),
      ],
      ephemeral: true,
    }
  );
}

// ============================================================
// INTERAÇÃO DOS BOTÕES
// ============================================================

async function handleButtonInteraction(
  interaction
) {
  const customId =
    interaction.customId;

  if (
    customId.startsWith(
      "queue_join|"
    )
  ) {
    return handleQueueJoin(
      interaction
    );
  }

  if (
    customId.startsWith(
      "queue_leave|"
    )
  ) {
    return handleQueueLeave(
      interaction
    );
  }

  switch (
    customId
  ) {
    case "config_roles":
    case "config_channels":
    case "config_bets":
    case "config_appearance":
    case "config_fee_set":
      return handleMainConfigButton(
        interaction
      );

    case "config_reset":
      return handleConfigReset(
        interaction
      );

    case "mediator_add":
    case "cadastro_mediator_add":
      return handleMediatorAdd(
        interaction
      );

    case "mediator_remove":
    case "cadastro_mediator_remove":
      return handleMediatorRemove(
        interaction
      );

    case "mediator_list":
    case "cadastro_mediator_list":
      return handleMediatorList(
        interaction
      );

    case "pix_add":
    case "cadastro_pix_add":
      return handlePixAdd(
        interaction
      );

    case "pix_list":
    case "cadastro_pix_list":
      return handlePixList(
        interaction
      );

    case "publish_mediator_queue":
      return handlePublishMediatorQueue(
        interaction
      );

    default:
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Essa interação não está disponível ou expirou.",
          ephemeral: true,
        }
      );
  }
}// ================= PARTE 5/6 =================

      if (
        !channel.isTextBased()
      ) {
        continue;
      }

      try {
        const message =
          await channel.messages.fetch(
            messageId
          );

        if (
          message
        ) {
          await message.edit({
            embeds: [
              queueEmbed(
                interaction.guild.id,
                format,
                mode,
                value,
                type
              ),
            ],
            components:
              queueButtons(
                format,
                mode,
                value,
                type
              ),
          });

          break;
        }
      } catch {
        // Continua procurando o canal.
      }
    }
  }

  return sendSafeReply(
    interaction,
    {
      content:
        `🚪 Você saiu da fila **${format} ${mode} — ${formatMoney(
          value
        )}**.`,
      ephemeral: true,
    }
  );
}

// ============================================================
// CONFIGURAÇÃO DOS SELECT MENUS
// ============================================================

async function handleRoleSelect(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para configurar cargos.",
        ephemeral: true,
      }
    );
  }

  const roleId =
    interaction.values?.[0];

  if (
    !roleId ||
    !interaction.guild.roles.cache.has(
      roleId
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Cargo inválido.",
        ephemeral: true,
      }
    );
  }

  const guildConfig =
    getGuildConfig(
      interaction.guild.id
    );

  if (
    interaction.customId ===
    "config_mediator_role"
  ) {
    guildConfig.mediatorRoleId =
      roleId;
  }

  if (
    interaction.customId ===
    "config_analyst_role"
  ) {
    guildConfig.analystRoleId =
      roleId;
  }

  saveDatabase();

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Cargo configurado com sucesso.",
      ephemeral: true,
    }
  );
}

async function handleChannelSelect(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para configurar canais.",
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

  const channel =
    interaction.guild.channels.cache.get(
      channelId
    );

  if (
    !channel
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Canal não encontrado.",
        ephemeral: true,
      }
    );
  }

  const guildConfig =
    getGuildConfig(
      interaction.guild.id
    );

  switch (
    interaction.customId
  ) {
    case "config_mobile_channel":
      guildConfig.analysisChannelMobile =
        channelId;
      break;

    case "config_emulator_channel":
      guildConfig.analysisChannelEmulator =
        channelId;
      break;

    case "config_bets_category":
      if (
        channel.type !==
        ChannelType.GuildCategory
      ) {
        return sendSafeReply(
          interaction,
          {
            content:
              "❌ Selecione uma categoria de servidor.",
            ephemeral: true,
          }
        );
      }

      guildConfig.betsCategoryId =
        channelId;
      break;

    case "config_mediator_queue_channel":
      guildConfig.mediatorQueueChannelId =
        channelId;
      break;

    case "mediator_queue_channel":
      guildConfig.mediatorQueueChannelId =
        channelId;
      break;

    default:
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Tipo de canal não reconhecido.",
          ephemeral: true,
        }
      );
  }

  saveDatabase();

  return sendSafeReply(
    interaction,
    {
      content:
        `✅ Canal ${channel} configurado com sucesso.`,
      ephemeral: true,
    }
  );
}

// ============================================================
// MODAIS DE CONFIGURAÇÃO
// ============================================================

function createFeeModal() {
  return new ModalBuilder()
    .setCustomId(
      "config_fee_modal"
    )
    .setTitle(
      "Configurar taxa"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "fee_value"
          )
          .setLabel(
            "Valor da taxa"
          )
          .setPlaceholder(
            "Ex.: 5"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(10)
      )
    );
}

function createMediatorAddModal() {
  return new ModalBuilder()
    .setCustomId(
      "mediator_add_modal"
    )
    .setTitle(
      "Cadastrar mediador"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "mediator_id"
          )
          .setLabel(
            "ID do usuário"
          )
          .setPlaceholder(
            "Cole o ID do Discord"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setMinLength(17)
          .setMaxLength(20)
      )
    );
}

function createMediatorRemoveModal() {
  return new ModalBuilder()
    .setCustomId(
      "mediator_remove_modal"
    )
    .setTitle(
      "Remover mediador"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "mediator_id"
          )
          .setLabel(
            "ID do usuário"
          )
          .setPlaceholder(
            "Cole o ID do Discord"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setMinLength(17)
          .setMaxLength(20)
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
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "pix_discord_id"
          )
          .setLabel(
            "ID do ADM"
          )
          .setPlaceholder(
            "Cole o ID do Discord"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setMinLength(17)
          .setMaxLength(20)
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
      new ActionRowBuilder().addComponents(
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
          .setRequired(true)
          .setMaxLength(100)
      ),

      new ActionRowBuilder().addComponents(
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
          .setRequired(true)
          .setMaxLength(200)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "admin_pix_qr"
          )
          .setLabel(
            "QR Code"
          )
          .setPlaceholder(
            "URL da imagem do QR Code"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(false)
          .setMaxLength(500)
      )
    );
}

// ============================================================
// PROCESSAMENTO DE MODAIS
// ============================================================

async function handleModalSubmit(
  interaction
) {
  if (
    interaction.customId ===
    "config_fee_modal"
  ) {
    if (
      !isAdmin(
        interaction.member
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Você não tem permissão.",
          ephemeral: true,
        }
      );
    }

    const rawFee =
      interaction.fields.getTextInputValue(
        "fee_value"
      );

    const fee =
      Number(
        String(rawFee)
          .replace(",", ".")
          .replace(/[^\d.-]/g, "")
      );

    if (
      !Number.isFinite(fee) ||
      fee < 0
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Informe um valor de taxa válido.",
          ephemeral: true,
        }
      );
    }

    const guildConfig =
      getGuildConfig(
        interaction.guild.id
      );

    guildConfig.admFee =
      fee;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Taxa atualizada para **${formatMoney(
            fee
          )}**.`,
        ephemeral: true,
      }
    );
  }

  if (
    interaction.customId ===
    "mediator_add_modal"
  ) {
    const userId =
      interaction.fields.getTextInputValue(
        "mediator_id"
      );

    return addMediator(
      interaction,
      userId
    );
  }

  if (
    interaction.customId ===
    "mediator_remove_modal"
  ) {
    const userId =
      interaction.fields.getTextInputValue(
        "mediator_id"
      );

    return removeMediator(
      interaction,
      userId
    );
  }

  if (
    interaction.customId ===
    "pix_id_modal"
  ) {
    const userId =
      interaction.fields.getTextInputValue(
        "pix_discord_id"
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
        normalizeId(
          userId
        )
      )
    );
  }

  if (
    interaction.customId.startsWith(
      "pix_data_modal|"
    )
  ) {
    const parts =
      interaction.customId.split("|");

    const userId =
      normalizeId(
        parts[1]
      );

    const name =
      interaction.fields.getTextInputValue(
        "admin_name"
      );

    const key =
      interaction.fields.getTextInputValue(
        "admin_pix_key"
      );

    let qr = "";

    try {
      qr =
        interaction.fields.getTextInputValue(
          "admin_pix_qr"
        );
    } catch {
      qr = "";
    }

    return savePixAdmin(
      interaction,
      userId,
      name,
      key,
      qr
    );
  }
}

// ============================================================
// EVENTO PRINCIPAL DE INTERAÇÃO
// ============================================================

client.on(
  "interactionCreate",
  async (
    interaction
  ) => {
    try {
      if (
        interaction.isChatInputCommand()
      ) {
        switch (
          interaction.commandName
        ) {
          case "config":
            return handleConfigCommand(
              interaction
            );

          case "cadastro":
            return handleCadastroCommand(
              interaction
            );

          case "fila":
            return handleFilaCommand(
              interaction
            );

          case "med":
            return handleMediatorCommand(
              interaction
            );

          default:
            return;
        }
      }

      if (
        interaction.isButton()
      ) {
        return handleButtonInteraction(
          interaction
        );
      }

      if (
        interaction.isStringSelectMenu()
      ) {
        return handleStringSelect(
          interaction
        );
      }

      if (
        interaction.isRoleSelectMenu()
      ) {
        return handleRoleSelect(
          interaction
        );
      }

      if (
        interaction.isChannelSelectMenu()
      ) {
        return handleChannelSelect(
          interaction
        );
      }

      if (
        interaction.isModalSubmit()
      ) {
        return handleModalSubmit(
          interaction
        );
      }
    } catch (
      error
    ) {
      console.error(
        "❌ Erro ao processar interação:",
        error
      );

      try {
        await sendSafeReply(
          interaction,
          {
            content:
              "❌ Ocorreu um erro ao processar essa interação.",
            ephemeral: true,
          }
        );
      } catch {
        // A interação pode já ter sido respondida.
      }
    }
  }
);        guild
      ) {
        await updateMediatorQueueMessage(
          guild
        );
      }
    } catch (
      error
    ) {
      console.error(
        "Erro ao restaurar fila de mediadores:",
        error
      );
    }
  }
);

client.on(
  Events.InteractionCreate,
  async interaction => {
    try {
      if (
        interaction.isChatInputCommand()
      ) {
        await handleSlashCommand(
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
        interaction.isModalSubmit()
      ) {
        await handleModalSubmit(
          interaction
        );

        return;
      }

      if (
        interaction.isRoleSelectMenu()
      ) {
        await handleRoleSelect(
          interaction
        );

        return;
      }

      if (
        interaction.isChannelSelectMenu()
      ) {
        if (
          interaction.customId ===
          "queue_setup_channel"
        ) {
          await handleQueueSetupChannel(
            interaction
          );

          return;
        }

        await handleChannelSelect(
          interaction
        );

        return;
      }

      if (
        interaction.isStringSelectMenu()
      ) {
        await handleStringSelect(
          interaction
        );

        return;
      }
    } catch (
      error
    ) {
      console.error(
        "Erro ao processar interação:",
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

client.on(
  Events.MessageCreate,
  async message => {
    try {
      if (
        message.author.bot
      ) {
        return;
      }

      if (
        !message.guild
      ) {
        return;
      }

      /*
       * Comandos com prefixo.
       */
      if (
        !message.content.startsWith(
          PREFIX
        )
      ) {
        return;
      }

      const args =
        message.content
          .slice(
            PREFIX.length
          )
          .trim()
          .split(/\s+/);

      const command =
        args
          .shift()
          ?.toLowerCase();

      if (
        command ===
        "cadastro"
      ) {
        if (
          !isAdministrator(
            message.member
          )
        ) {
          return message.reply(
            "❌ Apenas administradores podem utilizar este comando."
          );
        }

        return message.reply({
          embeds: [
            createCadastroEmbed(
              message.guild.id
            ),
          ],
          components:
            cadastroComponents(),
        });
      }

      if (
        command ===
        "config"
      ) {
        if (
          !isAdministrator(
            message.member
          )
        ) {
          return message.reply(
            "❌ Apenas administradores podem utilizar este comando."
          );
        }

        return message.reply({
          embeds: [
            createConfigEmbed(
              message.guild.id
            ),
          ],
          components:
            configButtons(),
        });
      }

      if (
        command ===
        "fila"
      ) {
        if (
          !isAdministrator(
            message.member
          )
        ) {
          return message.reply(
            "❌ Apenas administradores podem utilizar este comando."
          );
        }

        return message.reply({
          embeds: [
            createQueueSetupEmbed(
              message.guild.id
            ),
          ],
          components:
            queueSetupComponents(),
        });
      }

      if (
        command ===
        "med"
      ) {
        if (
          !isAdministrator(
            message.member
          )
        ) {
          return message.reply(
            "❌ Apenas administradores podem utilizar este comando."
          );
        }

        return message.reply({
          embeds: [
            createEmbed(
              message.guild.id,
              "🎯 MEDIADORES",
              "Gerencie a fila de mediadores usando os botões abaixo."
            ),
          ],
          components:
            mediatorConfigComponents(),
        });
      }
    } catch (
      error
    ) {
      console.error(
        "Erro ao processar mensagem:",
        error
      );
    }
  }
);

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "Unhandled Promise Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "Uncaught Exception:",
      error
    );
  }
);

client.login(
  TOKEN
);
