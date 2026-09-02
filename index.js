// index.js
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    "Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID no arquivo .env"
  );
  process.exit(1);
}

const PREFIX = ".";

const DATA_DIR = path.join(
  __dirname,
  "data"
);

const DB_FILE = path.join(
  DATA_DIR,
  "database.json"
);

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true,
  });
}

const DEFAULT_DB = {
  guilds: {},
  users: {},
  queues: {},
  bets: {},
  analyses: {},
};

function cloneDefaultDB() {
  return JSON.parse(
    JSON.stringify(DEFAULT_DB)
  );
}

function loadDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return cloneDefaultDB();
    }

    const raw =
      fs.readFileSync(
        DB_FILE,
        "utf8"
      );

    if (!raw.trim()) {
      return cloneDefaultDB();
    }

    const parsed =
      JSON.parse(raw);

    return {
      ...cloneDefaultDB(),
      ...parsed,
      guilds:
        parsed.guilds || {},
      users:
        parsed.users || {},
      queues:
        parsed.queues || {},
      bets:
        parsed.bets || {},
      analyses:
        parsed.analyses || {},
    };
  } catch (error) {
    console.error(
      "Erro ao carregar database:",
      error
    );

    return cloneDefaultDB();
  }
}

let db = loadDatabase();

function saveDatabase() {
  try {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(
        db,
        null,
        2
      ),
      "utf8"
    );
  } catch (error) {
    console.error(
      "Erro ao salvar database:",
      error
    );
  }
}

/*
 * VALORES DAS FILAS
 *
 * Os valores ficam armazenados
 * em centavos.
 */
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

const FORMATS = [
  "1x1",
  "2x2",
  "3x3",
  "4x4",
];

const MODES = [
  "mobile",
  "emulador",
  "misto",
];

/*
 * CLIENT GLOBAL
 *
 * O client precisa ficar fora
 * de qualquer função.
 */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],

  partials: [
    Partials.Channel,
    Partials.Message,
  ],
});

function getGuildConfig(
  guildId
) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      mediatorRoleId: null,
      analystRoleId: null,

      analysisChannelMobile:
        null,

      analysisChannelEmulator:
        null,

      betsCategoryId:
        null,

      mediatorQueueChannelId:
        null,

      embedColor:
        "#000000",

      botAvatar:
        null,

      admFee:
        1,

      pixAdmins: [],

      mediatorQueue: [],

      mediatorRotationIndex:
        0,

      queueMessages: {},
    };

    saveDatabase();
  }

  const config =
    db.guilds[guildId];

  if (
    !Array.isArray(
      config.pixAdmins
    )
  ) {
    config.pixAdmins = [];
  }

  if (
    !Array.isArray(
      config.mediatorQueue
    )
  ) {
    config.mediatorQueue = [];
  }

  if (
    !Array.isArray(
      config.mediators
    )
  ) {
    config.mediators = [];
  }

  if (!config.embedColor) {
    config.embedColor =
      "#000000";
  }

  if (
    !Number.isFinite(
      Number(config.admFee)
    )
  ) {
    config.admFee = 1;
  }

  if (
    !config.queueMessages ||
    typeof config.queueMessages !==
      "object"
  ) {
    config.queueMessages = {};
  }

  return config;
}

function getUserData(
  userId
) {
  if (!db.users[userId]) {
    db.users[userId] = {
      wins: 0,
      losses: 0,
      coins: 0,
    };

    saveDatabase();
  }

  return db.users[userId];
}

function generateId(
  prefix = "id"
) {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function formatMoney(
  cents
) {
  return `R$ ${(Number(cents) / 100)
    .toFixed(2)
    .replace(".", ",")}`;
}

function normalizeColor(
  color
) {
  if (!color) {
    return "#000000";
  }

  const value =
    String(color).trim();

  if (
    /^#[0-9A-Fa-f]{6}$/.test(
      value
    )
  ) {
    return value;
  }

  if (
    /^[0-9A-Fa-f]{6}$/.test(
      value
    )
  ) {
    return `#${value}`;
  }

  return "#000000";
}

function createEmbed(
  guildId,
  title,
  description
) {
  const config =
    getGuildConfig(
      guildId
    );

  return new EmbedBuilder()
    .setColor(
      normalizeColor(
        config.embedColor
      )
    )
    .setTitle(title)
    .setDescription(
      description
    )
    .setTimestamp();
}

function createSmallEmbed(
  guildId,
  title,
  description
) {
  return createEmbed(
    guildId,
    title,
    description
  );
}

function isAdministrator(
  member
) {
  return Boolean(
    member &&
      member.permissions &&
      member.permissions.has(
        PermissionsBitField.Flags
          .Administrator
      )
  );
}

function isRegisteredMediator(
  member,
  guildId
) {
  const config = getGuildConfig(guildId);

  return Boolean(
    member?.id &&
      Array.isArray(config.mediators) &&
      config.mediators.some((item) =>
        String(item?.id || item) === String(member.id)
      )
  );
}

function hasMediatorRole(
  member,
  guildId
) {
  const config = getGuildConfig(guildId);

  if (isRegisteredMediator(member, guildId)) {
    return true;
  }

  if (!config.mediatorRoleId) {
    return false;
  }

  return Boolean(
    member?.roles?.cache?.has(
      config.mediatorRoleId
    )
  );
}

function hasAnalystRole(
  member,
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  if (!config.analystRoleId) {
    return false;
  }

  return Boolean(
    member?.roles?.cache?.has(
      config.analystRoleId
    )
  );
}

function teamSize(
  format
) {
  const value = Number(
    String(format).split("x")[0]
  );

  if (
    !Number.isFinite(value) ||
    value < 1
  ) {
    return 1;
  }

  return value;
}

function requiredPlayers(
  format
) {
  return teamSize(format) * 2;
}

/*
 * FILA NORMAL:
 * usada para 2x2, 3x3 e 4x4.
 *
 * FILA 1x1:
 * Normal e Infinito compartilham
 * a mesma fila.
 */
function makeQueueKey(
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  if (format === "1x1") {
    return [
      guildId,
      format,
      mode,
      Number(value),
    ].join("|");
  }

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
    !Array.isArray(
      db.queues[key]
    )
  ) {
    db.queues[key] = [];
  }

  return db.queues[key];
}

/*
 * Guarda a escolha do jogador
 * no 1x1:
 *
 * ice_normal
 * ice_infinite
 */
function getQueueChoiceKey(
  guildId,
  format,
  mode,
  value
) {
  return [
    guildId,
    format,
    mode,
    Number(value),
    "choices",
  ].join("|");
}

function getQueueChoices(
  guildId,
  format,
  mode,
  value
) {
  const key =
    getQueueChoiceKey(
      guildId,
      format,
      mode,
      value
    );

  if (
    !db.queues[key] ||
    typeof db.queues[key] !==
      "object" ||
    Array.isArray(
      db.queues[key]
    )
  ) {
    db.queues[key] = {};
  }

  return db.queues[key];
}

function clearQueueChoices(
  guildId,
  format,
  mode,
  value
) {
  const key =
    getQueueChoiceKey(
      guildId,
      format,
      mode,
      value
    );

  db.queues[key] = {};
}

function modeLabel(mode) {
  if (mode === "mobile") {
    return "📱 Mobile";
  }

  if (
    mode === "emulador" ||
    mode === "emulator"
  ) {
    return "🖥️ Emulador";
  }

  if (
    mode === "misto" ||
    mode === "mixed"
  ) {
    return "🔀 Misto";
  }

  return String(mode);
}

function queueEmbed(
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  const queue =
    getQueue(
      guildId,
      format,
      mode,
      value,
      type
    );

  const choices =
    format === "1x1"
      ? getQueueChoices(
          guildId,
          format,
          mode,
          value
        )
      : {};

  const players =
    queue.length > 0
      ? queue
          .map(
            (id, index) => {
              let extra = "";

              if (
                format === "1x1" &&
                choices[id]
              ) {
                extra =
                  choices[id] ===
                  "ice_infinite"
                    ? " ♾️"
                    : " 🧊";
              }

              return `**${index + 1}.** <@${id}>${extra}`;
            }
          )
          .join("\n")
      : "Nenhum jogador na fila.";

  const title =
    `🎰 FILA ${format}`;

  return createEmbed(
    guildId,
    title,
    `📌 **Modalidade:** ${modeLabel(
      mode
    )}\n` +
      `💰 **Valor:** ${formatMoney(
        value
      )}\n\n` +
      `👥 **Jogadores:** ${queue.length}/${requiredPlayers(
        format
      )}\n\n` +
      players
  );
}

/*
 * 1x1:
 * UMA mensagem por valor.
 *
 * Botões:
 * 🧊 Gelo Normal
 * ♾️ Gelo Infinito
 * 🚪 Sair da fila
 */
function queueButtons(
  format,
  mode,
  value,
  type = "normal"
) {
  if (format === "1x1") {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `queue_join|${format}|${mode}|${value}|ice_normal`
          )
          .setLabel(
            "🧊 Gelo Normal"
          )
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            `queue_join|${format}|${mode}|${value}|ice_infinite`
          )
          .setLabel(
            "♾️ Gelo Infinito"
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            `queue_leave|${format}|${mode}|${value}`
          )
          .setLabel(
            "🚪 Sair da fila"
          )
          .setStyle(
            ButtonStyle.Danger
          )
      ),
    ];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `queue_join|${format}|${mode}|${value}|normal`
        )
        .setLabel(
          "➕ Entrar na fila"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          `queue_leave|${format}|${mode}|${value}|normal`
        )
        .setLabel(
          "🚪 Sair da fila"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    ),
  ];
}

function queueAlreadyContains(
  queue,
  userId
) {
  return queue.includes(
    userId
  );
}

function mediatorQueueEmbed(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  const queue =
    Array.isArray(
      config.mediatorQueue
    )
      ? config.mediatorQueue
      : [];

  const mentions =
    queue.length > 0
      ? queue
          .map(
            (id, index) =>
              `${index + 1}. <@${id}>`
          )
          .join("\n")
      : "Nenhum mediador na fila.";

  return createSmallEmbed(
    guildId,
    "🛡️ FILA DE MEDIADORES",
    `Entre na fila para receber apostas de forma rotativa.\n\n` +
      `**Mediadores na fila:**\n${mentions}`
  );
}

function mediatorQueueButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "mediator_queue_join"
        )
        .setLabel(
          "Entrar na fila"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "mediator_queue_leave"
        )
        .setLabel(
          "Sair da fila"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    ),
  ];
}

function configMainEmbed(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  return createEmbed(
    guild.id,
    "⚙️ CONFIGURAÇÃO DO BOT",
    `Configure todos os sistemas do bot por este painel.\n\n` +

      `🎭 **Mediador:** ${
        config.mediatorRoleId
          ? `<@&${config.mediatorRoleId}>`
          : "Não configurado"
      }\n` +

      `🔎 **Analista:** ${
        config.analystRoleId
          ? `<@&${config.analystRoleId}>`
          : "Não configurado"
      }\n` +

      `📢 **Canal .ssmob:** ${
        config.analysisChannelMobile
          ? `<#${config.analysisChannelMobile}>`
          : "Não configurado"
      }\n` +

      `🖥️ **Canal .ssemu:** ${
        config.analysisChannelEmulator
          ? `<#${config.analysisChannelEmulator}>`
          : "Não configurado"
      }\n` +

      `🎲 **Categoria das apostas:** ${
        config.betsCategoryId
          ? `<#${config.betsCategoryId}>`
          : "Não configurada"
      }\n` +

      `🛡️ **Fila de mediadores:** ${
        config.mediatorQueueChannelId
          ? `<#${config.mediatorQueueChannelId}>`
          : "Não configurada"
      }\n` +

      `👥 **Mediadores cadastrados:** ${config.mediators.length}/20\n` +

      `💸 **Taxa do ADM:** ${formatMoney(
        config.admFee
      )}`
  );
}

function configButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config_roles"
        )
        .setLabel(
          "Cargos"
        )
        .setEmoji("🎭")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_admins"
        )
        .setLabel(
          "ADMs"
        )
        .setEmoji("👑")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_channels"
        )
        .setLabel(
          "Canais"
        )
        .setEmoji("📢")
        .setStyle(
          ButtonStyle.Primary
        )
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config_bets"
        )
        .setLabel(
          "Categoria das Apostas"
        )
        .setEmoji("🎲")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_mediators"
        )
        .setLabel(
          "Mediadores"
        )
        .setEmoji("🛡️")
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
        .setEmoji("🎨")
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config_fee"
        )
        .setLabel(
          "Configurar Taxa"
        )
        .setEmoji("💰")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_queue"
        )
        .setLabel(
          "Fila de Mediadores"
        )
        .setEmoji("📋")
        .setStyle(
          ButtonStyle.Secondary
        )
    ),
  ];
}

function rolesComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(
          "config_mediator_role"
        )
        .setPlaceholder(
          "Selecionar cargo de Mediador"
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(
          "config_analyst_role"
        )
        .setPlaceholder(
          "Selecionar cargo de Analista"
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),
  ];
}

function adminComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "admin_add"
        )
        .setLabel(
          "Cadastrar ADM"
        )
        .setEmoji("➕")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "admin_list"
        )
        .setLabel(
          "Ver ADMs"
        )
        .setEmoji("📋")
        .setStyle(
          ButtonStyle.Secondary
        )
    ),
  ];
}

function channelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_mobile_channel"
        )
        .setPlaceholder(
          "Canal do .ssmob"
        )
        .setChannelTypes(
          ChannelType.GuildText
        )
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_emulator_channel"
        )
        .setPlaceholder(
          "Canal do .ssemu"
        )
        .setChannelTypes(
          ChannelType.GuildText
        )
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_bets_category"
        )
        .setPlaceholder(
          "Categoria das apostas"
        )
        .setChannelTypes(
          ChannelType.GuildCategory
        )
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_mediator_channel"
        )
        .setPlaceholder(
          "Canal da fila de mediadores"
        )
        .setChannelTypes(
          ChannelType.GuildText
        )
    ),
  ];
}

function mediatorConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "mediator_add"
        )
        .setLabel(
          "Cadastrar Mediador"
        )
        .setEmoji("➕")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "mediator_list"
        )
        .setLabel(
          "Ver Mediadores"
        )
        .setEmoji("📋")
        .setStyle(
          ButtonStyle.Secondary
        )
    ),
  ];
}

function appearanceComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "appearance_color"
        )
        .setLabel(
          "Cor do Embed"
        )
        .setEmoji("🎨")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "appearance_avatar"
        )
        .setLabel(
          "Avatar do Bot"
        )
        .setEmoji("🖼️")
        .setStyle(
          ButtonStyle.Secondary
        )
    ),
  ];
}

function feeComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config_fee"
        )
        .setLabel(
          "Configurar Taxa"
        )
        .setEmoji("💰")
        .setStyle(
          ButtonStyle.Success
        )
    ),
  ];
}

function queueConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "queue_publish_mediator"
        )
        .setLabel(
          "Publicar Fila de Mediadores"
        )
        .setEmoji("🛡️")
        .setStyle(
          ButtonStyle.Primary
        )
    ),
  ];
}

function createFeeModal() {
  const modal =
    new ModalBuilder()
      .setCustomId(
        "fee_modal"
      )
      .setTitle(
        "Configurar Taxa"
      );

  const input =
    new TextInputBuilder()
      .setCustomId(
        "fee_value"
      )
      .setLabel(
        "Taxa em centavos"
      )
      .setPlaceholder(
        "1 = R$ 0,01 | 100 = R$ 1,00"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true)
      .setMaxLength(6);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      input
    )
  );

  return modal;
}

function createAdminIdModal() {
  const modal =
    new ModalBuilder()
      .setCustomId(
        "admin_id_modal"
      )
      .setTitle(
        "Cadastrar ADM"
      );

  const input =
    new TextInputBuilder()
      .setCustomId(
        "admin_id"
      )
      .setLabel(
        "Discord ID do ADM"
      )
      .setPlaceholder(
        "Ex: 123456789012345678"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true)
      .setMinLength(17)
      .setMaxLength(20);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      input
    )
  );

  return modal;
}

function createAdminPixModal(
  userId
) {
  const modal =
    new ModalBuilder()
      .setCustomId(
        `admin_pix_modal|${userId}`
      )
      .setTitle(
        "Dados PIX do ADM"
      );

  const nameInput =
    new TextInputBuilder()
      .setCustomId(
        "admin_name"
      )
      .setLabel(
        "Nome do ADM"
      )
      .setPlaceholder(
        "Nome que será exibido"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true)
      .setMaxLength(100);

  const keyInput =
    new TextInputBuilder()
      .setCustomId(
        "admin_pix_key"
      )
      .setLabel(
        "Chave Pix"
      )
      .setPlaceholder(
        "CPF, telefone, e-mail ou chave aleatória"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true)
      .setMaxLength(200);

  const qrInput =
    new TextInputBuilder()
      .setCustomId(
        "admin_pix_qr"
      )
      .setLabel(
        "QR Code URL (opcional)"
      )
      .setPlaceholder(
        "https://..."
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(false)
      .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      nameInput
    ),
    new ActionRowBuilder().addComponents(
      keyInput
    ),
    new ActionRowBuilder().addComponents(
      qrInput
    )
  );

  return modal;
}

function createMediatorModal() {
  const modal =
    new ModalBuilder()
      .setCustomId(
        "mediator_modal"
      )
      .setTitle(
        "Cadastrar Mediador"
      );

  const input =
    new TextInputBuilder()
      .setCustomId(
        "mediator_id"
      )
      .setLabel(
        "Discord ID do Mediador"
      )
      .setPlaceholder(
        "Ex: 123456789012345678"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true)
      .setMinLength(17)
      .setMaxLength(20);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      input
    )
  );

  return modal;
}

function createColorModal() {
  const modal =
    new ModalBuilder()
      .setCustomId(
        "appearance_color_modal"
      )
      .setTitle(
        "Cor do Embed"
      );

  const input =
    new TextInputBuilder()
      .setCustomId(
        "embed_color"
      )
      .setLabel(
        "Cor HEX"
      )
      .setPlaceholder(
        "#000000"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(true)
      .setMaxLength(7);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      input
    )
  );

  return modal;
}

function createAvatarModal() {
  const modal =
    new ModalBuilder()
      .setCustomId(
        "appearance_avatar_modal"
      )
      .setTitle(
        "Avatar do Bot"
      );

  const input =
    new TextInputBuilder()
      .setCustomId(
        "bot_avatar"
      )
      .setLabel(
        "URL do avatar"
      )
      .setPlaceholder(
        "https://..."
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(false)
      .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      input
    )
  );

  return modal;
}

/*
 * Responde de forma segura.
 *
 * Isso evita o erro:
 * "Interaction has already been acknowledged"
 */
async function sendSafeReply(
  interaction,
  payload
) {
  try {
    if (interaction.deferred) {
      return await interaction.editReply(
        payload
      );
    }

    if (interaction.replied) {
      return await interaction.followUp(
        payload
      );
    }

    return await interaction.reply(
      payload
    );
  } catch (error) {
    console.error(
      "Erro em sendSafeReply:",
      error
    );
  }
}

/*
 * Edita uma resposta de forma segura.
 */
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
      "Erro em editSafeReply:",
      error
    );
  }
}

/*
 * Registra uma mensagem de fila
 * no banco para poder atualizar
 * depois.
 */
function registerQueueMessage(
  guildId,
  format,
  mode,
  value,
  channelId,
  messageId
) {
  const config =
    getGuildConfig(
      guildId
    );

  const key = [
    format,
    mode,
    Number(value),
  ].join("|");

  config.queueMessages[key] = {
    channelId,
    messageId,
    format,
    mode,
    value: Number(value),
  };

  saveDatabase();
}

function getRegisteredQueueMessage(
  guildId,
  format,
  mode,
  value
) {
  const config =
    getGuildConfig(
      guildId
    );

  const key = [
    format,
    mode,
    Number(value),
  ].join("|");

  return (
    config.queueMessages[key] ||
    null
  );
}

async function updateQueueMessage(
  guild,
  format,
  mode,
  value
) {
  try {
    const registered =
      getRegisteredQueueMessage(
        guild.id,
        format,
        mode,
        value
      );

    if (!registered) {
      return;
    }

    const channel =
      await guild.channels.fetch(
        registered.channelId
      );

    if (!channel) {
      return;
    }

    const message =
      await channel.messages.fetch(
        registered.messageId
      );

    if (!message) {
      return;
    }

    await message.edit({
      embeds: [
        queueEmbed(
          guild.id,
          format,
          mode,
          value
        ),
      ],
      components:
        queueButtons(
          format,
          mode,
          value
        ),
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar mensagem da fila:",
      error
    );
  }
}

/*
 * Publica as 12 filas.
 *
 * Valores:
 *
 * R$ 100,00
 * R$ 50,00
 * R$ 20,00
 * R$ 10,00
 * R$ 7,00
 * R$ 5,00
 * R$ 3,00
 * R$ 2,00
 * R$ 1,00
 * R$ 0,75
 * R$ 0,50
 * R$ 0,30
 *
 * Sempre do maior para o menor.
 */
async function publishQueues(
  guild,
  format,
  mode,
  selectedChannelId = null
) {
  const config =
    getGuildConfig(
      guild.id
    );

  let channelId =
    selectedChannelId;

  if (!channelId) {
    if (mode === "mobile") {
      channelId =
        config.analysisChannelMobile;
    } else if (
      mode === "emulador"
    ) {
      channelId =
        config.analysisChannelEmulator;
    } else {
      channelId =
        config.analysisChannelMobile ||
        config.analysisChannelEmulator;
    }
  }

  if (!channelId) {
    throw new Error(
      "Nenhum canal foi configurado para publicar as filas."
    );
  }

  const channel =
    await guild.channels.fetch(
      channelId
    );

  if (!channel) {
    throw new Error(
      "Canal da fila não encontrado."
    );
  }

  if (
    !channel.isTextBased() ||
    !channel.isSendable()
  ) {
    throw new Error(
      "O canal selecionado não pode receber mensagens."
    );
  }

  /*
   * Maior valor primeiro.
   */
  const sortedValues =
    [...VALUES].sort(
      (a, b) => b - a
    );

  const created = [];

  for (const value of sortedValues) {
    /*
     * Garante que a fila exista
     * antes de publicar.
     */
    getQueue(
      guild.id,
      format,
      mode,
      value
    );

    const message =
      await channel.send({
        embeds: [
          queueEmbed(
            guild.id,
            format,
            mode,
            value
          ),
        ],
        components:
          queueButtons(
            format,
            mode,
            value
          ),
      });

    registerQueueMessage(
      guild.id,
      format,
      mode,
      value,
      channel.id,
      message.id
    );

    created.push({
      value,
      messageId:
        message.id,
    });
  }

  return {
    channel,
    created,
  };
}

/*
 * Cria um canal privado para a
 * aposta.
 */
async function createPrivateBetChannel(
  guild,
  bet
) {
  const config =
    getGuildConfig(
      guild.id
    );

  if (!config.betsCategoryId) {
    throw new Error(
      "A categoria das apostas ainda não foi configurada."
    );
  }

  const category =
    await guild.channels.fetch(
      config.betsCategoryId
    );

  if (!category) {
    throw new Error(
      "Categoria das apostas não encontrada."
    );
  }

  if (
    category.type !==
    ChannelType.GuildCategory
  ) {
    throw new Error(
      "O canal configurado para apostas não é uma categoria."
    );
  }

  const playerIds =
    getPlayerIdsFromBet(
      bet
    );

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionsBitField.Flags.ViewChannel,
      ],
    },
  ];

  for (const playerId of playerIds) {
    overwrites.push({
      id: playerId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  if (config.mediatorRoleId) {
    overwrites.push({
      id: config.mediatorRoleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  if (config.analystRoleId) {
    overwrites.push({
      id: config.analystRoleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  const channel =
    await guild.channels.create({
      name:
        `aposta-${String(bet.id).slice(-8)}`,
      type:
        ChannelType.GuildText,
      parent:
        category.id,
      permissionOverwrites:
        overwrites,
    });

  const message =
    await channel.send({
      embeds: [
        betEmbed(
          guild.id,
          bet
        ),
      ],
      components:
        betButtons(
          bet
        ),
    });

  bet.channelId =
    channel.id;

  bet.betMessageId =
    message.id;

  saveBet(bet);

  return channel;
}

/*
 * Embed da aposta.
 */
function betEmbed(
  guildId,
  bet
) {
  const playerIds =
    getPlayerIdsFromBet(
      bet
    );

  let statusText =
    "⏳ Aguardando confirmação dos jogadores.";

  if (bet.status === "confirmed") {
    statusText =
      "🟢 Aposta confirmada.";
  }

  if (bet.status === "cancelled") {
    statusText =
      "🔴 Aposta cancelada.";
  }

  if (bet.status === "finished") {
    statusText =
      "🏁 Aposta finalizada.";
  }

  const mediator =
    bet.mediatorId
      ? `<@${bet.mediatorId}>`
      : "Aguardando mediador";

  const analyst =
    bet.analystId
      ? `<@${bet.analystId}>`
      : "Aguardando analista";

  return createEmbed(
    guildId,
    "🎮 APOSTA",
    `💰 **Valor:** ${formatMoney(
      bet.value
    )}\n` +
      `🎯 **Formato:** ${bet.format}\n` +
      `📱 **Modalidade:** ${modeLabel(
        bet.mode
      )}\n\n` +
      `👥 **Jogadores:**\n` +
      playerIds
        .map(
          (id) => `• <@${id}>`
        )
        .join("\n") +
      `\n\n` +
      `🛡️ **Mediador:** ${mediator}\n` +
      `🔎 **Analista:** ${analyst}\n\n` +
      `${statusText}`
  );
}

/*
 * Botões da aposta.
 *
 * Só mostra os botões quando
 * a aposta está aguardando.
 */
function betButtons(
  bet
) {
  if (
    !bet ||
    bet.status !== "waiting"
  ) {
    return [];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `bet_confirm|${bet.id}`
        )
        .setLabel(
          "Confirmar aposta"
        )
        .setEmoji("✅")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          `bet_cancel|${bet.id}`
        )
        .setLabel(
          "Cancelar aposta"
        )
        .setEmoji("❌")
        .setStyle(
          ButtonStyle.Danger
        )
    ),
  ];
}

async function refreshBetMessage(
  guild,
  bet
) {
  try {
    if (!bet?.channelId) {
      return;
    }

    const channel =
      await guild.channels.fetch(
        bet.channelId
      );

    if (!channel?.isTextBased()) {
      return;
    }

    let message = null;

    if (bet.betMessageId) {
      try {
        message =
          await channel.messages.fetch(
            bet.betMessageId
          );
      } catch {
        message = null;
      }
    }

    /*
     * Fallback para mensagens antigas
     * que não tinham betMessageId.
     */
    if (!message) {
      const messages =
        await channel.messages.fetch({
          limit: 100,
        });

      message =
        messages.find(
          (item) =>
            item.embeds?.[0]?.title ===
              "🎮 APOSTA" ||
            item.embeds?.[0]?.title ===
              "🎮 APOSTA CRIADA"
        );
    }

    if (!message) {
      return;
    }

    await message.edit({
      embeds: [
        betEmbed(
          guild.id,
          bet
        ),
      ],
      components:
        betButtons(
          bet
        ),
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar aposta:",
      error
    );
  }
}

/*
 * Procura o próximo mediador.
 */
function getNextMediator(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  if (
    !Array.isArray(
      config.mediatorQueue
    ) ||
    config.mediatorQueue.length === 0
  ) {
    return null;
  }

  if (
    !Number.isInteger(
      config.mediatorRotationIndex
    ) ||
    config.mediatorRotationIndex < 0
  ) {
    config.mediatorRotationIndex = 0;
  }

  if (
    config.mediatorRotationIndex >=
    config.mediatorQueue.length
  ) {
    config.mediatorRotationIndex = 0;
  }

  const mediatorId =
    config.mediatorQueue[
      config.mediatorRotationIndex
    ];

  config.mediatorRotationIndex =
    (
      config.mediatorRotationIndex +
      1
    ) %
    config.mediatorQueue.length;

  saveDatabase();

  return mediatorId;
}

/*
 * Atribui mediador à aposta.
 */
function assignMediator(
  guildId,
  bet
) {
  if (!bet) {
    return null;
  }

  if (bet.mediatorId) {
    return bet.mediatorId;
  }

  const mediatorId =
    getNextMediator(
      guildId
    );

  if (!mediatorId) {
    return null;
  }

  bet.mediatorId =
    mediatorId;

  saveBet(bet);

  return mediatorId;
}

/*
 * Publica/atualiza a fila de
 * mediadores no canal configurado.
 */
async function publishMediatorQueue(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !config.mediatorQueueChannelId
  ) {
    throw new Error(
      "O canal da fila de mediadores não foi configurado."
    );
  }

  const channel =
    await guild.channels.fetch(
      config.mediatorQueueChannelId
    );

  if (!channel) {
    throw new Error(
      "Canal da fila de mediadores não encontrado."
    );
  }

  if (
    !channel.isTextBased() ||
    !channel.isSendable()
  ) {
    throw new Error(
      "O canal da fila de mediadores não pode receber mensagens."
    );
  }

  const messages =
    await channel.messages.fetch({
      limit: 100,
    });

  const existing =
    messages.find(
      (message) =>
        message.author?.id ===
          client.user?.id &&
        message.embeds?.[0]?.title ===
          "🛡️ FILA DE MEDIADORES"
    );

  if (existing) {
    await existing.edit({
      embeds: [
        mediatorQueueEmbed(
          guild.id
        ),
      ],
      components:
        mediatorQueueButtons(),
    });

    return existing;
  }

  return await channel.send({
    embeds: [
      mediatorQueueEmbed(
        guild.id
      ),
    ],
    components:
      mediatorQueueButtons(),
  });
}

/*
 * Cria uma aposta depois que
 * uma fila ficou completa.
 */
async function createBetFromQueue(
  guild,
  format,
  mode,
  value,
  queue,
  choices = {}
) {
  if (
    !Array.isArray(queue) ||
    queue.length <
      requiredPlayers(format)
  ) {
    return null;
  }

  const players =
    queue.slice(
      0,
      requiredPlayers(format)
    );

  const bet = {
    id: generateId("bet"),
    guildId: guild.id,
    format,
    mode,
    value: Number(value),
    players,
    choices:
      format === "1x1"
        ? {
            ...choices,
          }
        : {},
    status: "waiting",
    mediatorId: null,
    analystId: null,
    channelId: null,
    betMessageId: null,
    createdAt: Date.now(),
  };

  saveBet(bet);

  /*
   * Limpa a fila depois de criar
   * a aposta.
   */
  queue.splice(
    0,
    players.length
  );

  if (format === "1x1") {
    clearQueueChoices(
      guild.id,
      format,
      mode,
      value
    );
  }

  saveDatabase();

  /*
   * Atualiza a mensagem da fila
   * imediatamente.
   */
  await updateQueueMessage(
    guild,
    format,
    mode,
    value
  );

  /*
   * Tenta atribuir mediador.
   */
  assignMediator(
    guild.id,
    bet
  );

  /*
   * Cria canal privado.
   */
  const channel =
    await createPrivateBetChannel(
      guild,
      bet
    );

  /*
   * Atualiza mensagem da aposta
   * com eventual mediador.
   */
  await refreshBetMessage(
    guild,
    bet
  );

  return {
    bet,
    channel,
  };
}

/*
 * Verifica se dois jogadores
 * do 1x1 escolheram o mesmo gelo.
 */
function compatibleIceChoices(
  choiceA,
  choiceB
) {
  if (!choiceA || !choiceB) {
    return false;
  }

  return (
    String(choiceA) ===
    String(choiceB)
  );
}

/*
 * Retorna se uma fila 1x1
 * pode completar a partida.
 */
function canComplete1x1(
  guildId,
  format,
  mode,
  value,
  queue
) {
  if (
    format !== "1x1" ||
    queue.length < 2
  ) {
    return false;
  }

  const choices =
    getQueueChoices(
      guildId,
      format,
      mode,
      value
    );

  const first =
    choices[queue[0]];

  const second =
    choices[queue[1]];

  return compatibleIceChoices(
    first,
    second
  );
}

/*
 * Adiciona jogador em fila 1x1.
 */
async function join1x1Queue(
  interaction,
  format,
  mode,
  value,
  iceType
) {
  const guild =
    interaction.guild;

  const userId =
    interaction.user.id;

  if (
    !guild ||
    !guild.id
  ) {
    return;
  }

  if (
    iceType !==
      "ice_normal" &&
    iceType !==
      "ice_infinite"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Tipo de gelo inválido.",
        ephemeral: true,
      }
    );
  }

  const queue =
    getQueue(
      guild.id,
      format,
      mode,
      value
    );

  const choices =
    getQueueChoices(
      guild.id,
      format,
      mode,
      value
    );

  if (
    queueAlreadyContains(
      queue,
      userId
    )
  ) {
    /*
     * Se já estiver na fila,
     * apenas atualiza a escolha.
     */
    choices[userId] =
      iceType;

    saveDatabase();

    await updateQueueMessage(
      guild,
      format,
      mode,
      value
    );

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Sua escolha foi atualizada para **${
            iceType === "ice_infinite"
              ? "♾️ Gelo Infinito"
              : "🧊 Gelo Normal"
          }**.`,
        ephemeral: true,
      }
    );
  }

  if (
    queue.length >= 2
  ) {
    /*
     * A fila está cheia.
     *
     * Não adiciona mais ninguém.
     */
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa fila já está cheia e aguardando uma partida compatível.",
        ephemeral: true,
      }
    );
  }

  queue.push(userId);
  choices[userId] =
    iceType;

  saveDatabase();

  await updateQueueMessage(
    guild,
    format,
    mode,
    value
  );

  /*
   * Se os dois escolheram
   * o mesmo gelo, cria a aposta.
   */
  if (
    canComplete1x1(
      guild.id,
      format,
      mode,
      value,
      queue
    )
  ) {
    const result =
      await createBetFromQueue(
        guild,
        format,
        mode,
        value,
        queue,
        choices
      );

    if (result) {
      return sendSafeReply(
        interaction,
        {
          content:
            "🎮 **Aposta criada!** Os jogadores foram enviados para o canal privado.",
          ephemeral: true,
        }
      );
    }
  }

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Você entrou na fila.",
      ephemeral: true,
    }
  );
}

/*
 * Adiciona jogador nas filas
 * 2x2, 3x3 e 4x4.
 */
async function joinNormalQueue(
  interaction,
  format,
  mode,
  value,
  type = "normal"
) {
  const guild =
    interaction.guild;

  const userId =
    interaction.user.id;

  if (!guild) {
    return;
  }

  const queue =
    getQueue(
      guild.id,
      format,
      mode,
      value,
      type
    );

  if (
    queueAlreadyContains(
      queue,
      userId
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

  /*
   * Impede entrar em uma fila
   * já completa.
   */
  if (
    queue.length >=
    requiredPlayers(format)
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa fila está cheia.",
        ephemeral: true,
      }
    );
  }

  queue.push(userId);

  saveDatabase();

  await updateQueueMessage(
    guild,
    format,
    mode,
    value
  );

  if (
    queue.length >=
    requiredPlayers(format)
  ) {
    const result =
      await createBetFromQueue(
        guild,
        format,
        mode,
        value,
        queue
      );

    if (result) {
      return sendSafeReply(
        interaction,
        {
          content:
            "🎮 **Aposta criada!** Os jogadores foram enviados para o canal privado.",
          ephemeral: true,
        }
      );
    }
  }

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Você entrou na fila.",
      ephemeral: true,
    }
  );
}

/*
 * Remove jogador de uma fila.
 */
async function leaveQueue(
  interaction,
  format,
  mode,
  value
) {
  const guild =
    interaction.guild;

  const userId =
    interaction.user.id;

  if (!guild) {
    return;
  }

  const queue =
    getQueue(
      guild.id,
      format,
      mode,
      value
    );

  const index =
    queue.indexOf(
      userId
    );

  if (index === -1) {
    return sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Você não está nessa fila.",
        ephemeral: true,
      }
    );
  }

  queue.splice(
    index,
    1
  );

  if (
    format === "1x1"
  ) {
    const choices =
      getQueueChoices(
        guild.id,
        format,
        mode,
        value
      );

    delete choices[userId];
  }

  saveDatabase();

  await updateQueueMessage(
    guild,
    format,
    mode,
    value
  );

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Você saiu da fila.",
      ephemeral: true,
    }
  );
}// ============================================================
// CONTINUAÇÃO
// ============================================================

async function handleQueueJoin(
  interaction,
  format,
  mode,
  value,
  type
) {
  if (!interaction.guild) {
    return;
  }

  if (!FORMATS.includes(format)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Formato de fila inválido.",
        ephemeral: true,
      }
    );
  }

  if (!MODES.includes(mode)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Modalidade inválida.",
        ephemeral: true,
      }
    );
  }

  const numericValue =
    Number(value);

  if (
    !VALUES.includes(
      numericValue
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

  if (format === "1x1") {
    return join1x1Queue(
      interaction,
      format,
      mode,
      numericValue,
      type
    );
  }

  return joinNormalQueue(
    interaction,
    format,
    mode,
    numericValue,
    type
  );
}

// ============================================================
// APOSTAS
// ============================================================

async function handleBetConfirm(
  interaction,
  betId
) {
  const bet =
    getBet(betId);

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
    "waiting"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa aposta não está mais aguardando confirmação.",
        ephemeral: true,
      }
    );
  }

  if (
    !isPlayerInBet(
      bet,
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

  if (!Array.isArray(
    bet.confirmations
  )) {
    bet.confirmations = [];
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

  const playerIds =
    getPlayerIdsFromBet(
      bet
    );

  const allConfirmed =
    playerIds.length > 0 &&
    playerIds.every(
      (id) =>
        bet.confirmations.includes(
          id
        )
    );

  if (allConfirmed) {
    bet.status =
      "confirmed";

    assignMediator(
      bet.guildId,
      bet
    );

    saveBet(bet);

    await refreshBetMessage(
      interaction.guild,
      bet
    );

    return sendSafeReply(
      interaction,
      {
        content:
          "✅ Todos os jogadores confirmaram. A aposta foi confirmada!",
        ephemeral: true,
      }
    );
  }

  saveBet(bet);

  await refreshBetMessage(
    interaction.guild,
    bet
  );

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Sua confirmação foi registrada.",
      ephemeral: true,
    }
  );
}

async function handleBetCancel(
  interaction,
  betId
) {
  const bet =
    getBet(betId);

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
    "waiting"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa aposta não pode mais ser cancelada.",
        ephemeral: true,
      }
    );
  }

  if (
    !isPlayerInBet(
      bet,
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

  bet.status =
    "cancelled";

  bet.cancelledBy =
    interaction.user.id;

  bet.cancelledAt =
    Date.now();

  saveBet(bet);

  await refreshBetMessage(
    interaction.guild,
    bet
  );

  return sendSafeReply(
    interaction,
    {
      content:
        "❌ Aposta cancelada.",
      ephemeral: true,
    }
  );
}

// ============================================================
// MEDIADORES
// ============================================================

async function mediatorQueueJoin(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  const config =
    getGuildConfig(
      guild.id
    );

  const userId =
    interaction.user.id;

  /*
   * Não exige cargo de mediador
   * aqui. O sistema usa o cadastro
   * de mediadores.
   */
  const registered =
    isRegisteredMediator(
      interaction.member,
      guild.id
    );

  if (!registered) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não está cadastrado como mediador.",
        ephemeral: true,
      }
    );
  }

  if (
    !Array.isArray(
      config.mediatorQueue
    )
  ) {
    config.mediatorQueue = [];
  }

  if (
    config.mediatorQueue.includes(
      userId
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Você já está na fila de mediadores.",
        ephemeral: true,
      }
    );
  }

  config.mediatorQueue.push(
    userId
  );

  saveDatabase();

  try {
    await publishMediatorQueue(
      guild
    );
  } catch (error) {
    console.error(
      "Erro ao atualizar fila de mediadores:",
      error
    );
  }

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Você entrou na fila de mediadores.",
      ephemeral: true,
    }
  );
}

async function mediatorQueueLeave(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  const config =
    getGuildConfig(
      guild.id
    );

  const userId =
    interaction.user.id;

  const index =
    config.mediatorQueue.indexOf(
      userId
    );

  if (index === -1) {
    return sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Você não está na fila de mediadores.",
        ephemeral: true,
      }
    );
  }

  config.mediatorQueue.splice(
    index,
    1
  );

  if (
    config.mediatorRotationIndex >=
    config.mediatorQueue.length
  ) {
    config.mediatorRotationIndex = 0;
  }

  saveDatabase();

  try {
    await publishMediatorQueue(
      guild
    );
  } catch (error) {
    console.error(
      "Erro ao atualizar fila de mediadores:",
      error
    );
  }

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Você saiu da fila de mediadores.",
      ephemeral: true,
    }
  );
}

// ============================================================
// CONFIGURAÇÃO
// ============================================================

async function handleConfigButton(
  interaction
) {
  const id =
    interaction.customId;

  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  if (!isAdministrator(
    interaction.member
  )) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você precisa ser administrador para configurar o bot.",
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_roles"
  ) {
    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "🎭 CONFIGURAÇÃO DE CARGOS",
            "Selecione os cargos abaixo."
          ),
        ],
        components:
          rolesComponents(),
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_admins"
  ) {
    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "👑 ADMs",
            "Cadastre os ADMs e seus dados PIX."
          ),
        ],
        components:
          adminComponents(),
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_channels"
  ) {
    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "📢 CONFIGURAÇÃO DE CANAIS",
            "Escolha os canais correspondentes."
          ),
        ],
        components:
          channelComponents(),
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_bets"
  ) {
    const menu =
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_bets_category"
        )
        .setPlaceholder(
          "Escolha a categoria das apostas"
        )
        .setChannelTypes(
          ChannelType.GuildCategory
        );

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "🎲 CATEGORIA DAS APOSTAS",
            "Selecione a categoria onde os canais privados das apostas serão criados."
          ),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            menu
          ),
        ],
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_mediators"
  ) {
    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "🛡️ MEDIADORES",
            "Gerencie os mediadores cadastrados."
          ),
        ],
        components:
          mediatorConfigComponents(),
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_appearance"
  ) {
    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "🎨 APARÊNCIA",
            "Configure a aparência das mensagens do bot."
          ),
        ],
        components:
          appearanceComponents(),
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_fee"
  ) {
    return interaction.showModal(
      createFeeModal()
    );
  }

  if (
    id ===
    "config_queue"
  ) {
    return sendSafeReply(
      interaction,
      {
        embeds: [
          mediatorQueueEmbed(
            guild.id
          ),
        ],
        components:
          queueConfigComponents(),
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "queue_publish_mediator"
  ) {
    try {
      await publishMediatorQueue(
        guild
      );

      return sendSafeReply(
        interaction,
        {
          content:
            "✅ Fila de mediadores publicada/atualizada.",
          ephemeral: true,
        }
      );
    } catch (error) {
      return sendSafeReply(
        interaction,
        {
          content:
            `❌ ${error.message}`,
          ephemeral: true,
        }
      );
    }
  }
}

async function handleAdminButton(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id ===
    "admin_add"
  ) {
    return interaction.showModal(
      createAdminIdModal()
    );
  }

  if (
    id ===
    "admin_list"
  ) {
    const config =
      getGuildConfig(
        interaction.guild.id
      );

    if (
      !config.pixAdmins.length
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "📋 Nenhum ADM cadastrado.",
          ephemeral: true,
        }
      );
    }

    const text =
      config.pixAdmins
        .map(
          (adm, index) => {
            const qr =
              adm.qr
                ? `\n   QR: ${adm.qr}`
                : "";

            return (
              `**${index + 1}. ${adm.name}**\n` +
              `ID: \`${adm.id}\`\n` +
              `PIX: \`${adm.key}\`${qr}`
            );
          }
        )
        .join("\n\n");

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            interaction.guild.id,
            "👑 ADMs CADASTRADOS",
            text
          ),
        ],
        ephemeral: true,
      }
    );
  }
}

async function handleMediatorButton(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id ===
    "mediator_add"
  ) {
    return interaction.showModal(
      createMediatorModal()
    );
  }

  if (
    id ===
    "mediator_list"
  ) {
    const config =
      getGuildConfig(
        interaction.guild.id
      );

    if (
      !config.mediators.length
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "📋 Nenhum mediador cadastrado.",
          ephemeral: true,
        }
      );
    }

    const text =
      config.mediators
        .map(
          (item, index) => {
            const id =
              item?.id || item;

            return `${index + 1}. <@${id}> — \`${id}\``;
          }
        )
        .join("\n");

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            interaction.guild.id,
            "🛡️ MEDIADORES CADASTRADOS",
            text
          ),
        ],
        ephemeral: true,
      }
    );
  }
}

async function handleAppearanceButton(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id ===
    "appearance_color"
  ) {
    return interaction.showModal(
      createColorModal()
    );
  }

  if (
    id ===
    "appearance_avatar"
  ) {
    return interaction.showModal(
      createAvatarModal()
    );
  }
}

// ============================================================
// BOTÕES
// ============================================================

async function handleButton(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id.startsWith(
      "queue_join|"
    )
  ) {
    const parts =
      id.split("|");

    const format =
      parts[1];

    const mode =
      parts[2];

    const value =
      Number(parts[3]);

    const type =
      parts[4] ||
      "normal";

    return handleQueueJoin(
      interaction,
      format,
      mode,
      value,
      type
    );
  }

  if (
    id.startsWith(
      "queue_leave|"
    )
  ) {
    const parts =
      id.split("|");

    const format =
      parts[1];

    const mode =
      parts[2];

    const value =
      Number(parts[3]);

    return leaveQueue(
      interaction,
      format,
      mode,
      value
    );
  }

  if (
    id.startsWith(
      "bet_confirm|"
    )
  ) {
    const betId =
      id.split("|")[1];

    return handleBetConfirm(
      interaction,
      betId
    );
  }

  if (
    id.startsWith(
      "bet_cancel|"
    )
  ) {
    const betId =
      id.split("|")[1];

    return handleBetCancel(
      interaction,
      betId
    );
  }

  if (
    id ===
    "mediator_queue_join"
  ) {
    return mediatorQueueJoin(
      interaction
    );
  }

  if (
    id ===
    "mediator_queue_leave"
  ) {
    return mediatorQueueLeave(
      interaction
    );
  }

  if (
    id.startsWith(
      "config_"
    ) ||
    id ===
    "queue_publish_mediator"
  ) {
    if (
      id ===
      "config_admins"
    ) {
      return handleConfigButton(
        interaction
      );
    }

    if (
      id ===
      "config_mediators"
    ) {
      return handleConfigButton(
        interaction
      );
    }

    if (
      id ===
      "config_appearance"
    ) {
      return handleConfigButton(
        interaction
      );
    }

    return handleConfigButton(
      interaction
    );
  }

  if (
    id.startsWith(
      "admin_"
    )
  ) {
    return handleAdminButton(
      interaction
    );
  }

  if (
    id.startsWith(
      "mediator_"
    )
  ) {
    return handleMediatorButton(
      interaction
    );
  }

  if (
    id.startsWith(
      "appearance_"
    )
  ) {
    return handleAppearanceButton(
      interaction
    );
  }
}

// ============================================================
// SELECT MENUS
// ============================================================

async function handleSelectMenu(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id ===
    "fila_format"
  ) {
    const format =
      interaction.values[0];

    if (
      !FORMATS.includes(
        format
      )
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

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            interaction.guild.id,
            "🎮 ESCOLHA A MODALIDADE",
            `Formato selecionado: **${format}**\n\nAgora escolha a modalidade.`
          ),
        ],
        components: [
          modeSelect(
            format
          ),
        ],
        ephemeral: true,
      }
    );
  }

  if (
    id.startsWith(
      "fila_mode|"
    )
  ) {
    const format =
      id.split("|")[1];

    const mode =
      interaction.values[0];

    if (
      !FORMATS.includes(
        format
      ) ||
      !MODES.includes(
        mode
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Configuração de fila inválida.",
          ephemeral: true,
        }
      );
    }

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            interaction.guild.id,
            "📢 ESCOLHA O CANAL",
            `**Formato:** ${format}\n` +
              `**Modalidade:** ${modeLabel(
                mode
              )}\n\n` +
              "Agora escolha o canal onde as 12 filas serão publicadas."
          ),
        ],
        components: [
          channelSelect(
            format,
            mode
          ),
        ],
        ephemeral: true,
      }
    );
  }

  if (
    id.startsWith(
      "fila_channel|"
    )
  ) {
    const parts =
      id.split("|");

    const format =
      parts[1];

    const mode =
      parts[2];

    const channelId =
      interaction.values[0];

    return handleChannelSelect(
      interaction,
      format,
      mode,
      channelId
    );
  }
}

// ============================================================
// SELECT DE CARGOS
// ============================================================

async function handleRoleSelect(
  interaction
) {
  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você precisa ser administrador.",
        ephemeral: true,
      }
    );
  }

  const id =
    interaction.customId;

  const roleId =
    interaction.values[0];

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  if (
    id ===
    "config_mediator_role"
  ) {
    config.mediatorRoleId =
      roleId;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Cargo de mediador definido como <@&${roleId}>.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_analyst_role"
  ) {
    config.analystRoleId =
      roleId;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Cargo de analista definido como <@&${roleId}>.`,
        ephemeral: true,
      }
    );
  }
}

// ============================================================
// SELECT DE CANAIS
// ============================================================

async function handleChannelSelect(
  interaction,
  format = null,
  mode = null,
  channelId = null
) {
  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você precisa ser administrador.",
        ephemeral: true,
      }
    );
  }

  const id =
    interaction.customId;

  const selectedId =
    channelId ||
    interaction.values?.[0];

  const guild =
    interaction.guild;

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    id.startsWith(
      "fila_channel|"
    )
  ) {
    try {
      await publishQueues(
        guild,
        format,
        mode,
        selectedId
      );

      return sendSafeReply(
        interaction,
        {
          content:
            "✅ As **12 filas** foram publicadas com sucesso, do maior valor para o menor.",
          ephemeral: true,
        }
      );
    } catch (error) {
      console.error(
        "Erro ao publicar filas:",
        error
      );

      return sendSafeReply(
        interaction,
        {
          content:
            `❌ Erro ao publicar as filas: ${error.message}`,
          ephemeral: true,
        }
      );
    }
  }

  if (
    id ===
    "config_mobile_channel"
  ) {
    config.analysisChannelMobile =
      selectedId;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal do **.ssmob** definido como <#${selectedId}>.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_emulator_channel"
  ) {
    config.analysisChannelEmulator =
      selectedId;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal do **.ssemu** definido como <#${selectedId}>.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_bets_category"
  ) {
    const channel =
      await guild.channels.fetch(
        selectedId
      );

    if (
      !channel ||
      channel.type !==
        ChannelType.GuildCategory
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Selecione uma categoria válida.",
          ephemeral: true,
        }
      );
    }

    config.betsCategoryId =
      selectedId;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Categoria das apostas definida como <#${selectedId}>.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_mediator_channel"
  ) {
    config.mediatorQueueChannelId =
      selectedId;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal da fila de mediadores definido como <#${selectedId}>.`,
        ephemeral: true,
      }
    );
  }
}

// ============================================================
// MODAIS
// ============================================================

async function handleModalSubmit(
  interaction
) {
  const id =
    interaction.customId;

  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você precisa ser administrador.",
        ephemeral: true,
      }
    );
  }

  const config =
    getGuildConfig(
      guild.id
    );

  // ----------------------------------------------------------
  // CADASTRO DO ID DO ADM
  // ----------------------------------------------------------

  if (
    id ===
    "admin_id_modal"
  ) {
    const adminId =
      interaction.fields
        .getTextInputValue(
          "admin_id"
        )
        .trim();

    if (
      !/^\d{17,20}$/.test(
        adminId
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ O ID do Discord informado é inválido.",
          ephemeral: true,
        }
      );
    }

    const existing =
      config.pixAdmins.find(
        (adm) =>
          String(
            adm.id
          ) ===
          String(
            adminId
          )
      );

    if (existing) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Esse ADM já está cadastrado.",
          ephemeral: true,
        }
      );
    }

    return interaction.showModal(
      createAdminPixModal(
        adminId
      )
    );
  }

  // ----------------------------------------------------------
  // DADOS PIX DO ADM
  // ----------------------------------------------------------

  if (
    id.startsWith(
      "admin_pix_modal|"
    )
  ) {
    const adminId =
      id.split("|")[1];

    const name =
      interaction.fields
        .getTextInputValue(
          "admin_name"
        )
        .trim();

    const key =
      interaction.fields
        .getTextInputValue(
          "admin_pix_key"
        )
        .trim();

    const qr =
      interaction.fields
        .getTextInputValue(
          "admin_pix_qr"
        )
        .trim();

    if (!name) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Informe o nome do ADM.",
          ephemeral: true,
        }
      );
    }

    if (!key) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Informe a chave Pix.",
          ephemeral: true,
        }
      );
    }

    const already =
      config.pixAdmins.find(
        (adm) =>
          String(
            adm.id
          ) ===
          String(
            adminId
          )
      );

    if (already) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Esse ADM já está cadastrado.",
          ephemeral: true,
        }
      );
    }

    config.pixAdmins.push({
      id: adminId,
      name,
      key,
      qr:
        qr || null,
      addedBy:
        interaction.user.id,
      addedAt:
        Date.now(),
    });

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ ADM **${name}** cadastrado com sucesso!\n\n` +
          `🆔 ID: \`${adminId}\`\n` +
          `💳 PIX: \`${key}\`` +
          (qr
            ? `\n🖼️ QR Code: ${qr}`
            : ""),
        ephemeral: true,
      }
    );
  }

  // ----------------------------------------------------------
  // CADASTRO DE MEDIADOR
  // ----------------------------------------------------------

  if (
    id ===
    "mediator_modal"
  ) {
    const mediatorId =
      interaction.fields
        .getTextInputValue(
          "mediator_id"
        )
        .trim();

    if (
      !/^\d{17,20}$/.test(
        mediatorId
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ O ID do Discord informado é inválido.",
          ephemeral: true,
        }
      );
    }

    if (
      config.mediators.some(
        (item) =>
          String(
            item?.id || item
          ) ===
          String(
            mediatorId
          )
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Esse mediador já está cadastrado.",
          ephemeral: true,
        }
      );
    }

    if (
      config.mediators.length >=
      20
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ O limite de 20 mediadores cadastrados foi atingido.",
          ephemeral: true,
        }
      );
    }

    config.mediators.push({
      id: mediatorId,
      addedBy:
        interaction.user.id,
      addedAt:
        Date.now(),
    });

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ <@${mediatorId}> foi cadastrado como mediador.`,
        ephemeral: true,
      }
    );
  }

  // ----------------------------------------------------------
  // TAXA
  // ----------------------------------------------------------

  if (
    id ===
    "fee_modal"
  ) {
    const raw =
      interaction.fields
        .getTextInputValue(
          "fee_value"
        )
        .trim();

    if (
      !/^\d+$/.test(
        raw
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ A taxa deve ser informada em centavos usando apenas números.",
          ephemeral: true,
        }
      );
    }

    const fee =
      Number(raw);

    if (
      !Number.isInteger(
        fee
      ) ||
      fee < 0 ||
      fee > 100000
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ A taxa deve estar entre 0 e 100000 centavos.",
          ephemeral: true,
        }
      );
    }

    config.admFee =
      fee;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Taxa configurada para **${formatMoney(
            fee
          )}**.`,
        ephemeral: true,
      }
    );
  }

  // ----------------------------------------------------------
  // COR DO EMBED
  // ----------------------------------------------------------

  if (
    id ===
    "appearance_color_modal"
  ) {
    const color =
      interaction.fields
        .getTextInputValue(
          "embed_color"
        )
        .trim();

    const normalized =
      normalizeColor(
        color
      );

    if (
      normalized ===
        "#000000" &&
      color.toLowerCase() !==
        "#000000" &&
      color.toLowerCase() !==
        "000000"
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Cor inválida. Use um HEX como `#FF0000`.",
          ephemeral: true,
        }
      );
    }

    config.embedColor =
      normalized;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Cor dos embeds alterada para **${normalized}**.`,
        ephemeral: true,
      }
    );
  }

  // ----------------------------------------------------------
  // AVATAR
  // ----------------------------------------------------------

  if (
    id ===
    "appearance_avatar_modal"
  ) {
    const avatar =
      interaction.fields
        .getTextInputValue(
          "bot_avatar"
        )
        .trim();

    config.botAvatar =
      avatar || null;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          avatar
            ? "✅ URL do avatar salva."
            : "✅ Avatar personalizado removido.",
        ephemeral: true,
      }
    );
  }
}

// ============================================================
// COMANDO /FILA
// ============================================================

async function handleFilaCommand(
  interaction
) {
  if (
    !interaction.guild
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Esse comando só pode ser usado em um servidor.",
        ephemeral: true,
      }
    );
  }

  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem criar filas.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        createEmbed(
          interaction.guild.id,
          "🎮 CRIAR FILAS",
          "Escolha o **formato** da fila.\n\nDepois você escolherá a modalidade e o canal.\n\nAs **12 filas de valores** serão publicadas automaticamente."
        ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(
              "fila_format"
            )
            .setPlaceholder(
              "Escolha o formato"
            )
            .addOptions(
              {
                label:
                  "1x1",
                description:
                  "Fila individual",
                value:
                  "1x1",
                emoji:
                  "👤",
              },
              {
                label:
                  "2x2",
                description:
                  "Dupla contra dupla",
                value:
                  "2x2",
                emoji:
                  "👥",
              },
              {
                label:
                  "3x3",
                description:
                  "Trio contra trio",
                value:
                  "3x3",
                emoji:
                  "👥",
              },
              {
                label:
                  "4x4",
                description:
                  "Squad contra squad",
                value:
                  "4x4",
                emoji:
                  "👥",
              }
            )
        ),
      ],
      ephemeral: true,
    }
  );
}

// ============================================================
// COMANDOS PREFIXADOS
// ============================================================

async function handlePrefixCommand(
  message
) {
  if (
    message.author.bot ||
    !message.guild
  ) {
    return;
  }

  const content =
    message.content.trim();

  if (
    !content.startsWith(
      PREFIX
    )
  ) {
    return;
  }

  const args =
    content
      .slice(PREFIX.length)
      .trim()
      .split(/\s+/);

  const command =
    args.shift()?.toLowerCase();

  if (!command) {
    return;
  }

  // ----------------------------------------------------------
  // .filaadm
  // ----------------------------------------------------------

  if (
    command ===
    "filaadm"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Apenas administradores podem publicar a fila de mediadores."
      );
    }

    try {
      await publishMediatorQueue(
        message.guild
      );

      return message.reply(
        "✅ Fila de mediadores publicada/atualizada."
      );
    } catch (error) {
      console.error(
        error
      );

      return message.reply(
        `❌ ${error.message}`
      );
    }
  }

  // ----------------------------------------------------------
  // .med
  // ----------------------------------------------------------

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
        "❌ Apenas administradores podem publicar a fila de mediadores."
      );
    }

    try {
      await publishMediatorQueue(
        message.guild
      );

      return message.reply(
        "✅ Fila de mediadores publicada/atualizada."
      );
    } catch (error) {
      console.error(
        error
      );

      return message.reply(
        `❌ ${error.message}`
      );
    }
  }

  // ----------------------------------------------------------
  // .config
  // ----------------------------------------------------------

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
        "❌ Apenas administradores podem abrir a configuração."
      );
    }

    return message.channel.send({
      embeds: [
        configMainEmbed(
          message.guild
        ),
      ],
      components:
        configButtons(),
    });
  }

  // ----------------------------------------------------------
  // .ssmob
  // ----------------------------------------------------------

  if (
    command ===
    "ssmob"
  ) {
    const config =
      getGuildConfig(
        message.guild.id
      );

    if (
      config.analysisChannelMobile &&
      message.channel.id !==
        config.analysisChannelMobile
    ) {
      return;
    }

    return handleAnalysisCommand(
      message,
      "mobile"
    );
  }

  // ----------------------------------------------------------
  // .ssemu
  // ----------------------------------------------------------

  if (
    command ===
    "ssemu"
  ) {
    const config =
      getGuildConfig(
        message.guild.id
      );

    if (
      config.analysisChannelEmulator &&
      message.channel.id !==
        config.analysisChannelEmulator
    ) {
      return;
    }

    return handleAnalysisCommand(
      message,
      "emulador"
    );
  }
}

// ============================================================
// SISTEMA DE ANÁLISE
// ============================================================

async function handleAnalysisCommand(
  message,
  type
) {
  const guild =
    message.guild;

  if (!guild) {
    return;
  }

  const config =
    getGuildConfig(
      guild.id
    );

  let channelId =
    null;

  if (
    type ===
    "mobile"
  ) {
    channelId =
      config.analysisChannelMobile;
  } else {
    channelId =
      config.analysisChannelEmulator;
  }

  if (
    channelId &&
    message.channel.id !==
      channelId
  ) {
    return;
  }

  const analysisId =
    generateId(
      "analysis"
    );

  db.analyses[
    analysisId
  ] = {
    id: analysisId,
    guildId:
      guild.id,
    userId:
      message.author.id,
    type,
    status:
      "waiting",
    createdAt:
      Date.now(),
  };

  saveDatabase();

  const embed =
    createEmbed(
      guild.id,
      "🔎 ANÁLISE SOLICITADA",
      `👤 **Jogador:** <@${message.author.id}>\n` +
        `📱 **Tipo:** ${modeLabel(
          type
        )}\n\n` +
        "A análise foi registrada e será encaminhada para um analista."
    );

  return message.channel.send({
    embeds: [
      embed,
    ],
  });
}

// ============================================================
// ANALISTAS
// ============================================================

async function getAvailableAnalyst(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !config.analystRoleId
  ) {
    return null;
  }

  try {
    await guild.members.fetch();
  } catch (error) {
    console.error(
      "Erro ao buscar membros:",
      error
    );
  }

  const members =
    guild.members.cache.filter(
      (member) =>
        member.roles.cache.has(
          config.analystRoleId
        ) &&
        !member.user.bot
    );

  if (
    members.size === 0
  ) {
    return null;
  }

  return (
    members.first() ||
    null
  );
}

async function assignAnalyst(
  guild,
  bet
) {
  if (!guild || !bet) {
    return null;
  }

  if (bet.analystId) {
    return bet.analystId;
  }

  const analyst =
    await getAvailableAnalyst(
      guild
    );

  if (!analyst) {
    return null;
  }

  bet.analystId =
    analyst.id;

  saveBet(bet);

  return analyst.id;
}

// ============================================================
// FINALIZAÇÃO DE APOSTA
// ============================================================

async function finishBet(
  guild,
  bet,
  winnerId = null
) {
  if (!bet) {
    return false;
  }

  if (
    bet.status ===
      "finished" ||
    bet.status ===
      "cancelled"
  ) {
    return false;
  }

  bet.status =
    "finished";

  bet.winnerId =
    winnerId;

  bet.finishedAt =
    Date.now();

  if (winnerId) {
    const winner =
      getUserData(
        winnerId
      );

    winner.wins =
      Number(
        winner.wins || 0
      ) + 1;

    const players =
      getPlayerIdsFromBet(
        bet
      );

    for (const playerId of players) {
      if (
        playerId ===
        winnerId
      ) {
        continue;
      }

      const loser =
        getUserData(
          playerId
        );

      loser.losses =
        Number(
          loser.losses || 0
        ) + 1;
    }
  }

  saveBet(bet);

  await refreshBetMessage(
    guild,
    bet
  );

  return true;
}

// ============================================================
// COMANDO DE STATUS
// ============================================================

async function handleStatusCommand(
  message
) {
  const user =
    getUserData(
      message.author.id
    );

  const embed =
    createEmbed(
      message.guild.id,
      "📊 SEU STATUS",
      `👤 **Jogador:** <@${message.author.id}>\n\n` +
        `🏆 **Vitórias:** ${user.wins || 0}\n` +
        `💀 **Derrotas:** ${user.losses || 0}\n` +
        `💰 **Saldo:** ${formatMoney(
          user.coins || 0
        )}`
    );

  return message.reply({
    embeds: [
      embed,
    ],
  });
}

// ============================================================
// MAIS COMANDOS PREFIXADOS
// ============================================================

async function handleAdditionalPrefixCommands(
  message
) {
  if (
    message.author.bot ||
    !message.guild
  ) {
    return;
  }

  const content =
    message.content.trim();

  if (
    !content.startsWith(
      PREFIX
    )
  ) {
    return;
  }

  const args =
    content
      .slice(PREFIX.length)
      .trim()
      .split(/\s+/);

  const command =
    args.shift()?.toLowerCase();

  if (
    command ===
    "status"
  ) {
    return handleStatusCommand(
      message
    );
  }

  if (
    command ===
    "ping"
  ) {
    return message.reply(
      `🏓 Pong! ${client.ws.ping}ms`
    );
  }
}

// ============================================================
// COMANDOS SLASH
// ============================================================

const slashCommands = [
  new SlashCommandBuilder()
    .setName(
      "fila"
    )
    .setDescription(
      "Cria as filas de apostas"
    )
    .setDefaultMemberPermissions(
      PermissionsBitField.Flags
        .Administrator.toString()
    ),

  new SlashCommandBuilder()
    .setName(
      "config"
    )
    .setDescription(
      "Abre o painel de configuração"
    )
    .setDefaultMemberPermissions(
      PermissionsBitField.Flags
        .Administrator.toString()
    ),
].map(
  (command) =>
    command.toJSON()
);

// ============================================================
// REGISTRO DOS COMANDOS
// ============================================================

async function registerCommands() {
  try {
    const rest =
      new REST({
        version: "10",
      }).setToken(
        TOKEN
      );

    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,
        GUILD_ID
      ),
      {
        body:
          slashCommands,
      }
    );

    console.log(
      "✅ Comandos slash registrados."
    );
  } catch (error) {
    console.error(
      "❌ Erro ao registrar comandos slash:",
      error
    );
  }
}

// ============================================================
// INTERAÇÕES
// ============================================================

client.on(
  Events.InteractionCreate,
  async (
    interaction
  ) => {
    try {
      if (
        interaction.isChatInputCommand()
      ) {
        if (
          interaction.commandName ===
          "fila"
        ) {
          return handleFilaCommand(
            interaction
          );
        }

        if (
          interaction.commandName ===
          "config"
        ) {
          if (
            !isAdministrator(
              interaction.member
            )
          ) {
            return sendSafeReply(
              interaction,
              {
                content:
                  "❌ Apenas administradores podem usar esse comando.",
                ephemeral: true,
              }
            );
          }

          return sendSafeReply(
            interaction,
            {
              embeds: [
                configMainEmbed(
                  interaction.guild
                ),
              ],
              components:
                configButtons(),
              ephemeral: true,
            }
          );
        }

        return;
      }

      if (
        interaction.isButton()
      ) {
        return handleButton(
          interaction
        );
      }

      if (
        interaction.isStringSelectMenu()
      ) {
        return handleSelectMenu(
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
    } catch (error) {
      console.error(
        "❌ Erro na interação:",
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
// MENSAGENS
// ============================================================

client.on(
  Events.MessageCreate,
  async (
    message
  ) => {
    try {
      await handlePrefixCommand(
        message
      );

      await handleAdditionalPrefixCommands(
        message
      );
    } catch (error) {
      console.error(
        "❌ Erro no messageCreate:",
        error
      );
    }
  }
);

// ============================================================
// READY
// ============================================================

client.once(
  Events.ClientReady,
  async (
    readyClient
  ) => {
    console.log(
      `✅ Bot conectado como ${readyClient.user.tag}`
    );

    console.log(
      `📡 Servidores: ${readyClient.guilds.cache.size}`
    );

    await registerCommands();

    console.log(
      "✅ Sistema iniciado com sucesso."
    );
  }
);

// ============================================================
// LOGIN
// ============================================================

client.login(
  TOKEN
).catch(
  (error) => {
    console.error(
      "❌ Erro ao fazer login:",
      error
    );
  }
);
