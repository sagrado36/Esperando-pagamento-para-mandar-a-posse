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

const TOKEN = process.env.DISCORD_TOKEN;
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
          "config_mediator"
        )
        .setLabel(
          "🛡️ Mediador"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_analyst"
        )
        .setLabel(
          "🔎 Analista"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_channels"
        )
        .setLabel(
          "📢 Canais"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_bets"
        )
        .setLabel(
          "🎲 Apostas"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config_appearance"
        )
        .setLabel(
          "🎨 Aparência"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_fee"
        )
        .setLabel(
          "💸 Taxa ADM"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_pix"
        )
        .setLabel(
          "💳 PIX"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),
    ),
  ];
}

function configMediatorEmbed(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  return createEmbed(
    guild.id,
    "🛡️ CONFIGURAÇÃO DE MEDIADORES",
    `Configure o sistema de mediadores.\n\n` +
      `🎭 **Cargo:** ${
        config.mediatorRoleId
          ? `<@&${config.mediatorRoleId}>`
          : "Não configurado"
      }\n` +
      `📢 **Canal da fila:** ${
        config.mediatorQueueChannelId
          ? `<#${config.mediatorQueueChannelId}>`
          : "Não configurado"
      }\n` +
      `👥 **Cadastrados:** ${config.mediators.length}/20\n` +
      `🔄 **Fila atual:** ${
        config.mediatorQueue.length
      }`
  );
}

function configMediatorButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "mediator_add"
        )
        .setLabel(
          "➕ Cadastrar mediador"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "mediator_list"
        )
        .setLabel(
          "📋 Ver mediadores"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "publish_mediator_queue"
        )
        .setLabel(
          "📢 Publicar fila"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_back"
        )
        .setLabel(
          "⬅️ Voltar"
        )
        .setStyle(
          ButtonStyle.Danger
        ),
    ),
  ];
}

function configMediatorComponents() {
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
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_mediator_channel"
        )
        .setPlaceholder(
          "Selecione o canal da fila de mediadores"
        )
        .setChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),
  ];
}

function configAnalystEmbed(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  return createEmbed(
    guild.id,
    "🔎 CONFIGURAÇÃO DE ANALISTA",
    `Configure o cargo responsável pelas análises.\n\n` +
      `🔎 **Cargo:** ${
        config.analystRoleId
          ? `<@&${config.analystRoleId}>`
          : "Não configurado"
      }`
  );
}

function configAnalystComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(
          "config_analyst_role"
        )
        .setPlaceholder(
          "Selecione o cargo de analista"
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),
  ];
}

function configChannelsEmbed(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  return createEmbed(
    guild.id,
    "📢 CONFIGURAÇÃO DE CANAIS",
    `Configure os canais utilizados pelos sistemas do bot.\n\n` +
      `📱 **Mobile:** ${
        config.analysisChannelMobile
          ? `<#${config.analysisChannelMobile}>`
          : "Não configurado"
      }\n` +
      `🖥️ **Emulador:** ${
        config.analysisChannelEmulator
          ? `<#${config.analysisChannelEmulator}>`
          : "Não configurado"
      }`
  );
}

function configChannelsComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_channel_mobile"
        )
        .setPlaceholder(
          "Selecione o canal Mobile"
        )
        .setChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_channel_emulator"
        )
        .setPlaceholder(
          "Selecione o canal Emulador"
        )
        .setChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),
  ];
}

function configBetsEmbed(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  return createEmbed(
    guild.id,
    "🎲 CONFIGURAÇÃO DE APOSTAS",
    `Configure a categoria onde as salas de apostas serão criadas.\n\n` +
      `🎲 **Categoria:** ${
        config.betsCategoryId
          ? `<#${config.betsCategoryId}>`
          : "Não configurada"
      }`
  );
}

function configBetsComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_bets_category"
        )
        .setPlaceholder(
          "Selecione a categoria das apostas"
        )
        .setChannelTypes(
          ChannelType.GuildCategory
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),
  ];
}

function configAppearanceEmbed(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  return createEmbed(
    guild.id,
    "🎨 APARÊNCIA DO BOT",
    `Configure a aparência das mensagens do bot.\n\n` +
      `🎨 **Cor:** ${config.embedColor}\n` +
      `🖼️ **Avatar:** ${
        config.botAvatar
          ? "Configurado"
          : "Padrão"
      }`
  );
}

function configAppearanceButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "appearance_color"
        )
        .setLabel(
          "🎨 Alterar cor"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "appearance_avatar"
        )
        .setLabel(
          "🖼️ Alterar avatar"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_back"
        )
        .setLabel(
          "⬅️ Voltar"
        )
        .setStyle(
          ButtonStyle.Danger
        ),
    ),
  ];
}

function configFeeEmbed(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  return createEmbed(
    guild.id,
    "💸 TAXA DO ADM",
    `Defina a porcentagem da taxa administrativa.\n\n` +
      `💸 **Taxa atual:** ${Number(
        config.admFee
      )}%`
  );
}

function configPixEmbed(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  const admins =
    Array.isArray(
      config.pixAdmins
    )
      ? config.pixAdmins
      : [];

  return createEmbed(
    guild.id,
    "💳 CONFIGURAÇÃO DO PIX",
    `Configure os administradores responsáveis pelo PIX.\n\n` +
      `👥 **Administradores cadastrados:** ${
        admins.length
      }\n\n` +
      `${
        admins.length
          ? admins
              .map(
                (id, index) =>
                  `${index + 1}. <@${id}>`
              )
              .join("\n")
          : "Nenhum administrador cadastrado."
      }`
  );
}

function configPixButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "pix_add"
        )
        .setLabel(
          "➕ Adicionar ADM PIX"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "pix_list"
        )
        .setLabel(
          "📋 Listar ADMs"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_back"
        )
        .setLabel(
          "⬅️ Voltar"
        )
        .setStyle(
          ButtonStyle.Danger
        ),
    ),
  ];
}

function createModal(
  customId,
  title,
  fields
) {
  const modal =
    new ModalBuilder()
      .setCustomId(
        customId
      )
      .setTitle(title);

  for (const field of fields) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            field.customId
          )
          .setLabel(
            field.label
          )
          .setStyle(
            field.style ||
              TextInputStyle.Short
          )
          .setRequired(
            field.required !== false
          )
          .setPlaceholder(
            field.placeholder ||
              ""
          )
          .setValue(
            field.value || ""
          )
          .setMinLength(
            field.minLength
          )
          .setMaxLength(
            field.maxLength
          )
      )
    );
  }

  return modal;
}

function safeJsonStringify(
  value
) {
  try {
    return JSON.stringify(
      value,
      null,
      2
    );
  } catch {
    return String(value);
  }
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
      return await interaction.editReply(
        payload
      );
    }

    return await interaction.reply(
      payload
    );
  } catch (error) {
    console.error(
      "Erro ao responder interação:",
      error
    );
  }
}

async function sendSafeFollowUp(
  interaction,
  payload
) {
  try {
    return await interaction.followUp(
      payload
    );
  } catch (error) {
    console.error(
      "Erro ao enviar followUp:",
      error
    );
  }
}

async function editMessageSafe(
  message,
  payload
) {
  try {
    return await message.edit(
      payload
    );
  } catch (error) {
    console.error(
      "Erro ao editar mensagem:",
      error
    );
    return null;
  }
}

async function fetchMember(
  guild,
  userId
) {
  try {
    return await guild.members.fetch(
      userId
    );
  } catch {
    return null;
  }
}

function mentionUser(
  userId
) {
  return `<@${userId}>`;
}

function mentionRole(
  roleId
) {
  return `<@&${roleId}>`;
}

function mentionChannel(
  channelId
) {
  return `<#${channelId}>`;
}

function getQueueMessageKey(
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  return makeQueueKey(
    guildId,
    format,
    mode,
    value,
    type
  );
}

function getConfiguredQueueChannel(
  guild,
  mode
) {
  const config =
    getGuildConfig(
      guild.id
    );

  if (mode === "mobile") {
    return config.analysisChannelMobile;
  }

  if (
    mode === "emulador" ||
    mode === "emulator"
  ) {
    return config.analysisChannelEmulator;
  }

  if (
    mode === "misto" ||
    mode === "mixed"
  ) {
    return (
      config.analysisChannelMobile ||
      config.analysisChannelEmulator
    );
  }

  return null;
}

/*
 * PUBLICA AS 12 FILAS
 *
 * Ordem:
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
    channelId =
      getConfiguredQueueChannel(
        guild,
        mode
      );
  }

  if (!channelId) {
    throw new Error(
      "Nenhum canal foi selecionado ou configurado para esta modalidade."
    );
  }

  const channel =
    await guild.channels.fetch(
      channelId
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      "O canal selecionado não é um canal de texto válido."
    );
  }

  const sortedValues =
    [...VALUES].sort(
      (a, b) => b - a
    );

  for (
    const value of sortedValues
  ) {
    const type =
      format === "1x1"
        ? "normal"
        : "normal";

    const embed =
      queueEmbed(
        guild.id,
        format,
        mode,
        value,
        type
      );

    const components =
      queueButtons(
        format,
        mode,
        value,
        type
      );

    const message =
      await channel.send({
        embeds: [
          embed,
        ],
        components,
      });

    const key =
      getQueueMessageKey(
        guild.id,
        format,
        mode,
        value,
        type
      );

    config.queueMessages[
      key
    ] = message.id;

    saveDatabase();
  }

  return channel;
}

function findQueueByMessage(
  guildId,
  messageId
) {
  const config =
    getGuildConfig(
      guildId
    );

  for (
    const [
      key,
      storedMessageId,
    ] of Object.entries(
      config.queueMessages || {}
    )
  ) {
    if (
      String(storedMessageId) ===
      String(messageId)
    ) {
      const parts =
        key.split("|");

      if (parts.length < 4) {
        continue;
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

      return {
        key,
        format,
        mode,
        value,
        type,
      };
    }
  }

  return null;
}

function getQueueFromInteraction(
  interaction
) {
  const parts =
    String(
      interaction.customId
    ).split("|");

  if (
    parts.length < 4
  ) {
    return null;
  }

  const action =
    parts[0];

  if (
    action !==
      "queue_join" &&
    action !==
      "queue_leave"
  ) {
    return null;
  }

  return {
    action,
    format: parts[1],
    mode: parts[2],
    value: Number(parts[3]),
    type:
      parts[4] ||
      "normal",
    extra:
      parts[5] ||
      null,
  };
}

function removeUserFromQueue(
  guildId,
  format,
  mode,
  value,
  userId,
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

  const index =
    queue.indexOf(
      userId
    );

  if (index === -1) {
    return false;
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
        guildId,
        format,
        mode,
        value
      );

    delete choices[
      userId
    ];
  }

  saveDatabase();

  return true;
}

function addUserToQueue(
  guildId,
  format,
  mode,
  value,
  userId,
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

  if (
    queueAlreadyContains(
      queue,
      userId
    )
  ) {
    return {
      ok: false,
      reason:
        "already_in_queue",
    };
  }

  const max =
    requiredPlayers(
      format
    );

  if (
    queue.length >=
    max
  ) {
    return {
      ok: false,
      reason:
        "queue_full",
    };
  }

  queue.push(
    userId
  );

  saveDatabase();

  return {
    ok: true,
  };
}

function getCurrentQueuePlayers(
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  return getQueue(
    guildId,
    format,
    mode,
    value,
    type
  );
}

function clearQueue(
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

  queue.length = 0;

  if (
    format === "1x1"
  ) {
    clearQueueChoices(
      guildId,
      format,
      mode,
      value
    );
  }

  saveDatabase();
}

async function refreshQueueMessage(
  interaction,
  format,
  mode,
  value,
  type = "normal"
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return null;
  }

  const config =
    getGuildConfig(
      guild.id
    );

  const key =
    getQueueMessageKey(
      guild.id,
      format,
      mode,
      value,
      type
    );

  const messageId =
    config.queueMessages[
      key
    ];

  if (!messageId) {
    return null;
  }

  try {
    const channel =
      interaction.channel;

    if (!channel) {
      return null;
    }

    const message =
      await channel.messages.fetch(
        messageId
      );

    if (!message) {
      return null;
    }

    return await editMessageSafe(
      message,
      {
        embeds: [
          queueEmbed(
            guild.id,
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
      }
    );
  } catch (error) {
    console.error(
      "Erro ao atualizar fila:",
      error
    );
    return null;
  }
}

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
      "O canal da fila de mediadores não está configurado."
    );
  }

  const channel =
    await guild.channels.fetch(
      config.mediatorQueueChannelId
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      "O canal da fila de mediadores não é válido."
    );
  }

  const message =
    await channel.send({
      embeds: [
        mediatorQueueEmbed(
          guild.id
        ),
      ],
      components:
        mediatorQueueButtons(),
    });

  config.mediatorQueueMessageId =
    message.id;

  saveDatabase();

  return message;
}

async function refreshMediatorQueue(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !config.mediatorQueueChannelId ||
    !config.mediatorQueueMessageId
  ) {
    return null;
  }

  try {
    const channel =
      await guild.channels.fetch(
        config.mediatorQueueChannelId
      );

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      return null;
    }

    const message =
      await channel.messages.fetch(
        config.mediatorQueueMessageId
      );

    return await editMessageSafe(
      message,
      {
        embeds: [
          mediatorQueueEmbed(
            guild.id
          ),
        ],
        components:
          mediatorQueueButtons(),
      }
    );
  } catch (error) {
    console.error(
      "Erro ao atualizar fila de mediadores:",
      error
    );

    return null;
  }
}async function handleQueueButton(
  interaction
) {
  const queueData =
    getQueueFromInteraction(
      interaction
    );

  if (!queueData) {
    return false;
  }

  const {
    action,
    format,
    mode,
    value,
    type,
    extra,
  } = queueData;

  if (
    !FORMATS.includes(format)
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Formato de fila inválido.",
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    !MODES.includes(mode)
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Modalidade de fila inválida.",
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    !VALUES.includes(
      Number(value)
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Valor de fila inválido.",
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
          "❌ Esta ação só pode ser usada dentro de um servidor.",
        ephemeral: true,
      }
    );

    return true;
  }

  const userId =
    interaction.user.id;

  if (
    action === "queue_leave"
  ) {
    const removed =
      removeUserFromQueue(
        guild.id,
        format,
        mode,
        value,
        userId,
        type
      );

    if (!removed) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Você não está nessa fila.",
          ephemeral: true,
        }
      );

      return true;
    }

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Você saiu da fila.",
        ephemeral: true,
      }
    );

    await refreshQueueMessage(
      interaction,
      format,
      mode,
      value,
      type
    );

    return true;
  }

  /*
   * ENTRAR NA FILA
   */
  if (
    action === "queue_join"
  ) {
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
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Você já está nessa fila.",
          ephemeral: true,
        }
      );

      return true;
    }

    if (
      queue.length >=
      requiredPlayers(format)
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Essa fila já está cheia.",
          ephemeral: true,
        }
      );

      return true;
    }

    /*
     * NO 1X1 O JOGADOR PRECISA
     * ESCOLHER O TIPO DE GELO.
     */
    if (
      format === "1x1"
    ) {
      const choice =
        extra ===
        "ice_infinite"
          ? "ice_infinite"
          : "ice_normal";

      const result =
        addUserToQueue(
          guild.id,
          format,
          mode,
          value,
          userId,
          type
        );

      if (!result.ok) {
        if (
          result.reason ===
          "already_in_queue"
        ) {
          await sendSafeReply(
            interaction,
            {
              content:
                "❌ Você já está nessa fila.",
              ephemeral: true,
            }
          );
        } else if (
          result.reason ===
          "queue_full"
        ) {
          await sendSafeReply(
            interaction,
            {
              content:
                "❌ Essa fila já está cheia.",
              ephemeral: true,
            }
          );
        } else {
          await sendSafeReply(
            interaction,
            {
              content:
                "❌ Não foi possível entrar na fila.",
              ephemeral: true,
            }
          );
        }

        return true;
      }

      const choices =
        getQueueChoices(
          guild.id,
          format,
          mode,
          value
        );

      choices[userId] =
        choice;

      saveDatabase();

      await sendSafeReply(
        interaction,
        {
          content:
            choice ===
            "ice_infinite"
              ? "✅ Você entrou na fila com **Gelo Infinito**."
              : "✅ Você entrou na fila com **Gelo Normal**.",
          ephemeral: true,
        }
      );

      await refreshQueueMessage(
        interaction,
        format,
        mode,
        value,
        type
      );

      /*
       * QUANDO A FILA FICA COMPLETA,
       * INICIA O PROCESSO DA PARTIDA.
       */
      const updatedQueue =
        getQueue(
          guild.id,
          format,
          mode,
          value,
          type
        );

      if (
        updatedQueue.length >=
        requiredPlayers(format)
      ) {
        await handleQueueFull(
          interaction,
          format,
          mode,
          value,
          type
        );
      }

      return true;
    }

    /*
     * FORMATOS 2X2 / 3X3 / 4X4
     */
    const result =
      addUserToQueue(
        guild.id,
        format,
        mode,
        value,
        userId,
        type
      );

    if (!result.ok) {
      if (
        result.reason ===
        "already_in_queue"
      ) {
        await sendSafeReply(
          interaction,
          {
            content:
              "❌ Você já está nessa fila.",
            ephemeral: true,
          }
        );
      } else if (
        result.reason ===
        "queue_full"
      ) {
        await sendSafeReply(
          interaction,
          {
            content:
              "❌ Essa fila já está cheia.",
            ephemeral: true,
          }
        );
      } else {
        await sendSafeReply(
          interaction,
          {
            content:
              "❌ Não foi possível entrar na fila.",
            ephemeral: true,
          }
        );
      }

      return true;
    }

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Você entrou na fila!",
        ephemeral: true,
      }
    );

    await refreshQueueMessage(
      interaction,
      format,
      mode,
      value,
      type
    );

    const updatedQueue =
      getQueue(
        guild.id,
        format,
        mode,
        value,
        type
      );

    if (
      updatedQueue.length >=
      requiredPlayers(format)
    ) {
      await handleQueueFull(
        interaction,
        format,
        mode,
        value,
        type
      );
    }

    return true;
  }

  return false;
}

async function handleQueueFull(
  interaction,
  format,
  mode,
  value,
  type = "normal"
) {
  const guild =
    interaction.guild;

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

  const required =
    requiredPlayers(format);

  if (
    queue.length <
    required
  ) {
    return;
  }

  const players =
    [...queue].slice(
      0,
      required
    );

  const config =
    getGuildConfig(
      guild.id
    );

  /*
   * Remove os jogadores da fila
   * para que a fila possa receber
   * uma nova partida.
   */
  for (
    const userId of players
  ) {
    const index =
      queue.indexOf(
        userId
      );

    if (index !== -1) {
      queue.splice(
        index,
        1
      );
    }
  }

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

    for (
      const userId of players
    ) {
      delete choices[
        userId
      ];
    }
  }

  saveDatabase();

  await refreshQueueMessage(
    interaction,
    format,
    mode,
    value,
    type
  );

  /*
   * Registra a partida.
   */
  const betId =
    generateId("bet");

  db.bets[betId] = {
    id: betId,
    guildId: guild.id,
    format,
    mode,
    value,
    type,
    players,
    status: "waiting",
    createdAt:
      new Date().toISOString(),
    mediatorId: null,
    winnerId: null,
    loserId: null,
  };

  saveDatabase();

  /*
   * Tenta obter um mediador
   * cadastrado na fila.
   */
  let mediatorId = null;

  if (
    Array.isArray(
      config.mediatorQueue
    ) &&
    config.mediatorQueue.length
  ) {
    const index =
      Number(
        config.mediatorRotationIndex ||
          0
      ) %
      config.mediatorQueue.length;

    mediatorId =
      config.mediatorQueue[
        index
      ];

    config.mediatorRotationIndex =
      (index + 1) %
      config.mediatorQueue.length;

    db.bets[
      betId
    ].mediatorId =
      mediatorId;

    saveDatabase();
  }

  /*
   * Cria sala da aposta quando
   * a categoria estiver configurada.
   */
  let betChannel = null;

  if (
    config.betsCategoryId
  ) {
    try {
      const channelName =
        `aposta-${format}-${String(
          value
        )}-${betId
          .replace(
            /[^a-zA-Z0-9-]/g,
            ""
          )
          .slice(-8)}`;

      betChannel =
        await guild.channels.create(
          {
            name:
              channelName.toLowerCase(),
            type:
              ChannelType.GuildText,
            parent:
              config.betsCategoryId,
            permissionOverwrites:
              [
                {
                  id:
                    guild.roles
                      .everyone.id,
                  deny: [
                    PermissionsBitField.Flags.ViewChannel,
                  ],
                },

                ...players.map(
                  (userId) => ({
                    id: userId,
                    allow: [
                      PermissionsBitField.Flags.ViewChannel,
                      PermissionsBitField.Flags.SendMessages,
                      PermissionsBitField.Flags.ReadMessageHistory,
                    ],
                  })
                ),

                ...(mediatorId
                  ? [
                      {
                        id: mediatorId,
                        allow: [
                          PermissionsBitField.Flags.ViewChannel,
                          PermissionsBitField.Flags.SendMessages,
                          PermissionsBitField.Flags.ReadMessageHistory,
                        ],
                      },
                    ]
                  : []),
              ],
          }
        );

      db.bets[
        betId
      ].channelId =
        betChannel.id;

      saveDatabase();
    } catch (error) {
      console.error(
        "Erro ao criar sala da aposta:",
        error
      );
    }
  }

  /*
   * Mensagem para os jogadores.
   */
  const playerMentions =
    players
      .map(
        (id) => `<@${id}>`
      )
      .join(" ");

  const mediatorMention =
    mediatorId
      ? `<@${mediatorId}>`
      : "Nenhum mediador disponível";

  const description =
    `🎮 **Formato:** ${format}\n` +
    `📌 **Modalidade:** ${modeLabel(
      mode
    )}\n` +
    `💰 **Valor:** ${formatMoney(
      value
    )}\n\n` +
    `👥 **Jogadores:**\n${playerMentions}\n\n` +
    `🛡️ **Mediador:** ${mediatorMention}`;

  if (betChannel) {
    try {
      await betChannel.send(
        {
          embeds: [
            createEmbed(
              guild.id,
              "🎮 PARTIDA ENCONTRADA!",
              description
            ),
          ],
        }
      );
    } catch (error) {
      console.error(
        "Erro ao enviar mensagem da partida:",
        error
      );
    }
  } else {
    try {
      await interaction.channel?.send(
        {
          embeds: [
            createEmbed(
              guild.id,
              "🎮 PARTIDA ENCONTRADA!",
              description
            ),
          ],
        }
      );
    } catch (error) {
      console.error(
        "Erro ao enviar aviso da partida:",
        error
      );
    }
  }
}

async function handleMediatorQueueButton(
  interaction
) {
  const customId =
    interaction.customId;

  if (
    customId !==
      "mediator_queue_join" &&
    customId !==
      "mediator_queue_leave"
  ) {
    return false;
  }

  const guild =
    interaction.guild;

  if (!guild) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta ação só pode ser usada dentro de um servidor.",
        ephemeral: true,
      }
    );

    return true;
  }

  const member =
    interaction.member;

  /*
   * O mediador pode estar
   * cadastrado no painel mesmo
   * sem possuir o cargo.
   */
  if (
    !hasMediatorRole(
      member,
      guild.id
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não está cadastrado como mediador.",
        ephemeral: true,
      }
    );

    return true;
  }

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !Array.isArray(
      config.mediatorQueue
    )
  ) {
    config.mediatorQueue =
      [];
  }

  const userId =
    interaction.user.id;

  if (
    customId ===
    "mediator_queue_join"
  ) {
    if (
      config.mediatorQueue.includes(
        userId
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Você já está na fila de mediadores.",
          ephemeral: true,
        }
      );

      return true;
    }

    config.mediatorQueue.push(
      userId
    );

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Você entrou na fila de mediadores.",
        ephemeral: true,
      }
    );

    await refreshMediatorQueue(
      guild
    );

    return true;
  }

  if (
    customId ===
    "mediator_queue_leave"
  ) {
    const index =
      config.mediatorQueue.indexOf(
        userId
      );

    if (
      index === -1
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Você não está na fila de mediadores.",
          ephemeral: true,
        }
      );

      return true;
    }

    config.mediatorQueue.splice(
      index,
      1
    );

    if (
      config.mediatorQueue
        .length === 0
    ) {
      config.mediatorRotationIndex =
        0;
    } else if (
      config.mediatorRotationIndex >=
      config.mediatorQueue.length
    ) {
      config.mediatorRotationIndex =
        0;
    }

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Você saiu da fila de mediadores.",
        ephemeral: true,
      }
    );

    await refreshMediatorQueue(
      guild
    );

    return true;
  }

  return false;
}

/*
 * Cadastro temporário de mediadores.
 *
 * O ADM abre o modal e o ID
 * informado fica aguardando
 * confirmação.
 */
const pendingMediators =
  new Map();

function mediatorListText(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  if (
    !config.mediators.length
  ) {
    return "Nenhum mediador cadastrado.";
  }

  return config.mediators
    .map(
      (item, index) => {
        const id =
          typeof item ===
          "string"
            ? item
            : item.id;

        const data =
          typeof item ===
          "object"
            ? item.data
            : null;

        return (
          `${index + 1}. <@${id}>` +
          (data
            ? ` — ${data}`
            : "")
        );
      }
    )
    .join("\n");
}

async function handleMediatorConfigButton(
  interaction
) {
  const customId =
    interaction.customId;

  if (
    customId !==
      "mediator_add" &&
    customId !==
      "mediator_list" &&
    customId !==
      "publish_mediator_queue"
  ) {
    return false;
  }

  const guild =
    interaction.guild;

  if (!guild) {
    return true;
  }

  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem alterar esta configuração.",
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    customId ===
    "mediator_add"
  ) {
    const modal =
      createModal(
        "cfg_med_id",
        "Cadastrar mediador",
        [
          {
            customId:
              "mediator_id",
            label:
              "ID do usuário",
            placeholder:
              "Digite o ID do Discord",
            minLength: 5,
            maxLength: 30,
          },
        ]
      );

    await interaction.showModal(
      modal
    );

    return true;
  }

  if (
    customId ===
    "mediator_list"
  ) {
    const text =
      mediatorListText(
        guild.id
      );

    await sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "📋 MEDIADORES CADASTRADOS",
            text
          ),
        ],
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    customId ===
    "publish_mediator_queue"
  ) {
    try {
      await publishMediatorQueue(
        guild
      );

      await sendSafeReply(
        interaction,
        {
          content:
            "✅ Fila de mediadores publicada.",
          ephemeral: true,
        }
      );
    } catch (error) {
      await sendSafeReply(
        interaction,
        {
          content:
            `❌ ${error.message}`,
          ephemeral: true,
        }
      );
    }

    return true;
  }

  return false;
}async function handleSelectMenu(
  interaction
) {
  const customId =
    interaction.customId;

  const guild =
    interaction.guild;

  if (!guild) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta ação só pode ser usada dentro de um servidor.",
        ephemeral: true,
      }
    );

    return true;
  }

  /*
   * ============================================================
   * /FILA — ESCOLHA DO FORMATO
   * ============================================================
   */
  if (
    customId ===
    "fila_format"
  ) {
    const format =
      interaction.values[0];

    if (
      !FORMATS.includes(
        format
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Formato inválido.",
          ephemeral: true,
        }
      );

      return true;
    }

    const menu =
      new StringSelectMenuBuilder()
        .setCustomId(
          `fila_mode|${format}`
        )
        .setPlaceholder(
          "Selecione a modalidade"
        )
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          MODES.map(
            (mode) => ({
              label:
                mode ===
                "mobile"
                  ? "📱 Mobile"
                  : mode ===
                    "emulador"
                    ? "🖥️ Emulador"
                    : "🔀 Misto",
              value:
                mode,
              description:
                mode ===
                "mobile"
                  ? "Filas para jogadores Mobile"
                  : mode ===
                    "emulador"
                    ? "Filas para jogadores de Emulador"
                    : "Filas para Mobile e Emulador",
            })
          )
        );

    const row =
      new ActionRowBuilder().addComponents(
        menu
      );

    await sendSafeReply(
      interaction,
      {
        content:
          `🎯 Formato selecionado: **${format}**\n\nAgora selecione a modalidade.`,
        components: [
          row,
        ],
        ephemeral: true,
      }
    );

    return true;
  }

  /*
   * ============================================================
   * /FILA — ESCOLHA DA MODALIDADE
   * ============================================================
   */
  if (
    customId.startsWith(
      "fila_mode|"
    )
  ) {
    const [, format] =
      customId.split("|");

    const mode =
      interaction.values[0];

    if (
      !FORMATS.includes(
        format
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Formato inválido.",
          ephemeral: true,
        }
      );

      return true;
    }

    if (
      !MODES.includes(
        mode
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Modalidade inválida.",
          ephemeral: true,
        }
      );

      return true;
    }

    /*
     * IMPORTANTE:
     *
     * Aqui NÃO existe escolha
     * de valor.
     *
     * O próximo passo é
     * selecionar o canal.
     */
    const channelMenu =
      new ChannelSelectMenuBuilder()
        .setCustomId(
          `fila_channel|${format}|${mode}`
        )
        .setPlaceholder(
          "Selecione o canal onde as filas serão publicadas"
        )
        .setChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement
        )
        .setMinValues(1)
        .setMaxValues(1);

    const row =
      new ActionRowBuilder().addComponents(
        channelMenu
      );

    await sendSafeReply(
      interaction,
      {
        content:
          `🎯 **${format} / ${modeLabel(
            mode
          )}**\n\n` +
          `📢 Selecione o canal onde as **12 filas** serão publicadas.\n\n` +
          `💰 Os valores serão publicados automaticamente do maior para o menor, de **R$ 100,00 até R$ 0,30**.`,
        components: [
          row,
        ],
        ephemeral: true,
      }
    );

    return true;
  }

  /*
   * ============================================================
   * CONFIGURAÇÃO — CARGO DE MEDIADOR
   * ============================================================
   */
  if (
    customId ===
    "config_mediator_role"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem alterar essa configuração.",
          ephemeral: true,
        }
      );

      return true;
    }

    const roleId =
      interaction.values[0];

    const config =
      getGuildConfig(
        guild.id
      );

    config.mediatorRoleId =
      roleId;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Cargo de mediador definido como <@&${roleId}>.`,
        ephemeral: true,
      }
    );

    return true;
  }

  /*
   * ============================================================
   * CONFIGURAÇÃO — CARGO DE ANALISTA
   * ============================================================
   */
  if (
    customId ===
    "config_analyst_role"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem alterar essa configuração.",
          ephemeral: true,
        }
      );

      return true;
    }

    const roleId =
      interaction.values[0];

    const config =
      getGuildConfig(
        guild.id
      );

    config.analystRoleId =
      roleId;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Cargo de analista definido como <@&${roleId}>.`,
        ephemeral: true,
      }
    );

    return true;
  }

  /*
   * ============================================================
   * CONFIGURAÇÃO — CANAL MOBILE
   * ============================================================
   */
  if (
    customId ===
    "config_channel_mobile"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem alterar essa configuração.",
          ephemeral: true,
        }
      );

      return true;
    }

    const channelId =
      interaction.values[0];

    const config =
      getGuildConfig(
        guild.id
      );

    config.analysisChannelMobile =
      channelId;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal Mobile definido como <#${channelId}>.`,
        ephemeral: true,
      }
    );

    return true;
  }

  /*
   * ============================================================
   * CONFIGURAÇÃO — CANAL EMULADOR
   * ============================================================
   */
  if (
    customId ===
    "config_channel_emulator"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem alterar essa configuração.",
          ephemeral: true,
        }
      );

      return true;
    }

    const channelId =
      interaction.values[0];

    const config =
      getGuildConfig(
        guild.id
      );

    config.analysisChannelEmulator =
      channelId;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal Emulador definido como <#${channelId}>.`,
        ephemeral: true,
      }
    );

    return true;
  }

  /*
   * ============================================================
   * CONFIGURAÇÃO — CATEGORIA DAS APOSTAS
   * ============================================================
   */
  if (
    customId ===
    "config_bets_category"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem alterar essa configuração.",
          ephemeral: true,
        }
      );

      return true;
    }

    const categoryId =
      interaction.values[0];

    const config =
      getGuildConfig(
        guild.id
      );

    config.betsCategoryId =
      categoryId;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Categoria das apostas definida como <#${categoryId}>.`,
        ephemeral: true,
      }
    );

    return true;
  }

  /*
   * ============================================================
   * CONFIGURAÇÃO — CANAL DA FILA DE MEDIADORES
   * ============================================================
   */
  if (
    customId ===
    "config_mediator_channel"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem alterar essa configuração.",
          ephemeral: true,
        }
      );

      return true;
    }

    const channelId =
      interaction.values[0];

    const config =
      getGuildConfig(
        guild.id
      );

    config.mediatorQueueChannelId =
      channelId;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal da fila de mediadores definido como <#${channelId}>.`,
        ephemeral: true,
      }
    );

    return true;
  }

  return false;
}

/*
 * ============================================================
 * CHANNEL SELECT
 * ============================================================
 */
async function handleChannelSelect(
  interaction
) {
  const customId =
    interaction.customId;

  const guild =
    interaction.guild;

  if (!guild) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta ação só pode ser usada dentro de um servidor.",
        ephemeral: true,
      }
    );

    return true;
  }

  /*
   * ============================================================
   * /FILA — CANAL
   *
   * FORMATO → MODALIDADE → CANAL
   *
   * Depois disso:
   * PUBLICA AUTOMATICAMENTE 12 FILAS.
   * ============================================================
   */
  if (
    customId.startsWith(
      "fila_channel|"
    )
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem usar o comando /fila.",
          ephemeral: true,
        }
      );

      return true;
    }

    const [
      ,
      format,
      mode,
    ] =
      customId.split("|");

    const channelId =
      interaction.values[0];

    if (
      !FORMATS.includes(
        format
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Formato inválido.",
          ephemeral: true,
        }
      );

      return true;
    }

    if (
      !MODES.includes(
        mode
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Modalidade inválida.",
          ephemeral: true,
        }
      );

      return true;
    }

    try {
      const channel =
        await guild.channels.fetch(
          channelId
        );

      if (
        !channel ||
        !channel.isTextBased()
      ) {
        throw new Error(
          "O canal selecionado não é um canal de texto válido."
        );
      }

      /*
       * PUBLICA AS 12 FILAS
       */
      await publishQueues(
        guild,
        format,
        mode,
        channelId
      );

      await sendSafeReply(
        interaction,
        {
          content:
            `✅ As **12 filas** de **${format} / ${modeLabel(
              mode
            )}** foram publicadas em <#${channelId}>.\n\n` +
            `💰 Valores: **R$ 100,00 → R$ 0,30**.`,
          ephemeral: true,
        }
      );
    } catch (error) {
      console.error(
        "Erro ao publicar filas pelo /fila:",
        error
      );

      await sendSafeReply(
        interaction,
        {
          content:
            `❌ Não foi possível publicar as filas: ${
              error.message ||
              "erro desconhecido"
            }.`,
          ephemeral: true,
        }
      );
    }

    return true;
  }

  /*
   * ============================================================
   * CONFIGURAÇÃO — OUTROS CANAIS
   * ============================================================
   */
  if (
    customId ===
      "config_channel_mobile" ||
    customId ===
      "config_channel_emulator" ||
    customId ===
      "config_bets_category" ||
    customId ===
      "config_mediator_channel"
  ) {
    return handleSelectMenu(
      interaction
    );
  }

  return false;
}

/*
 * ============================================================
 * MODAIS
 * ============================================================
 */
async function handleModalSubmit(
  interaction
) {
  const customId =
    interaction.customId;

  const guild =
    interaction.guild;

  if (!guild) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta ação só pode ser usada dentro de um servidor.",
        ephemeral: true,
      }
    );

    return true;
  }

  /*
   * ============================================================
   * CADASTRO DE MEDIADOR — ID
   * ============================================================
   */
  if (
    customId ===
    "cfg_med_id"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem cadastrar mediadores.",
          ephemeral: true,
        }
      );

      return true;
    }

    const userId =
      interaction.fields
        .getTextInputValue(
          "mediator_id"
        )
        .trim();

    if (
      !/^\d{5,30}$/.test(
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

    const config =
      getGuildConfig(
        guild.id
      );

    if (
      config.mediators.length >=
      20
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ O limite de 20 mediadores cadastrados foi atingido.",
          ephemeral: true,
        }
      );

      return true;
    }

    const already =
      config.mediators.some(
        (item) => {
          const id =
            typeof item ===
            "string"
              ? item
              : item.id;

          return (
            String(id) ===
            String(userId)
          );
        }
      );

    if (already) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Esse usuário já está cadastrado como mediador.",
          ephemeral: true,
        }
      );

      return true;
    }

    pendingMediators.set(
      interaction.user.id,
      {
        guildId:
          guild.id,
        userId,
      }
    );

    const modal =
      createModal(
        "cfg_med_data",
        "Dados do mediador",
        [
          {
            customId:
              "mediator_data",
            label:
              "Informação do mediador",
            placeholder:
              "Digite uma informação opcional",
            required: false,
            maxLength: 200,
          },
        ]
      );

    await interaction.showModal(
      modal
    );

    return true;
  }

  /*
   * ============================================================
   * CADASTRO DE MEDIADOR — DADOS
   * ============================================================
   */
  if (
    customId ===
    "cfg_med_data"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem cadastrar mediadores.",
          ephemeral: true,
        }
      );

      return true;
    }

    const pending =
      pendingMediators.get(
        interaction.user.id
      );

    if (!pending) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Cadastro de mediador expirado. Tente novamente.",
          ephemeral: true,
        }
      );

      return true;
    }

    if (
      pending.guildId !==
      guild.id
    ) {
      pendingMediators.delete(
        interaction.user.id
      );

      await sendSafeReply(
        interaction,
        {
          content:
            "❌ O cadastro pertence a outro servidor.",
          ephemeral: true,
        }
      );

      return true;
    }

    const data =
      interaction.fields
        .getTextInputValue(
          "mediator_data"
        )
        .trim();

    const config =
      getGuildConfig(
        guild.id
      );

    const already =
      config.mediators.some(
        (item) => {
          const id =
            typeof item ===
            "string"
              ? item
              : item.id;

          return (
            String(id) ===
            String(
              pending.userId
            )
          );
        }
      );

    if (!already) {
      config.mediators.push(
        {
          id:
            pending.userId,
          data:
            data || null,
          registeredAt:
            new Date().toISOString(),
          registeredBy:
            interaction.user.id,
        }
      );
    }

    pendingMediators.delete(
      interaction.user.id
    );

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ <@${pending.userId}> foi cadastrado como mediador com sucesso.`,
        ephemeral: true,
      }
    );

    return true;
  }

  /*
   * ============================================================
   * TAXA ADM
   * ============================================================
   */
  if (
    customId ===
    "config_fee_modal"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem alterar a taxa.",
          ephemeral: true,
        }
      );

      return true;
    }

    const value =
      interaction.fields
        .getTextInputValue(
          "fee"
        )
        .trim()
        .replace(",", ".");

    const fee =
      Number(value);

    if (
      !Number.isFinite(
        fee
      ) ||
      fee < 0 ||
      fee > 100
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Informe uma porcentagem válida entre 0 e 100.",
          ephemeral: true,
        }
      );

      return true;
    }

    const config =
      getGuildConfig(
        guild.id
      );

    config.admFee =
      fee;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Taxa do ADM definida para **${fee}%**.`,
        ephemeral: true,
      }
    );

    return true;
  }

  /*
   * ============================================================
   * COR DA EMBED
   * ============================================================
   */
  if (
    customId ===
    "appearance_color_modal"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem alterar a aparência.",
          ephemeral: true,
        }
      );

      return true;
    }

    const color =
      interaction.fields
        .getTextInputValue(
          "color"
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
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Cor inválida. Use o formato `#RRGGBB`.",
          ephemeral: true,
        }
      );

      return true;
    }

    const config =
      getGuildConfig(
        guild.id
      );

    config.embedColor =
      normalized;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Cor alterada para **${normalized}**.`,
        ephemeral: true,
      }
    );

    return true;
  }

  /*
   * ============================================================
   * PIX ADM
   * ============================================================
   */
  if (
    customId ===
    "pix_add_modal"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem configurar o PIX.",
          ephemeral: true,
        }
      );

      return true;
    }

    const userId =
      interaction.fields
        .getTextInputValue(
          "pix_user_id"
        )
        .trim();

    if (
      !/^\d{5,30}$/.test(
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

    const config =
      getGuildConfig(
        guild.id
      );

    if (
      !Array.isArray(
        config.pixAdmins
      )
    ) {
      config.pixAdmins =
        [];
    }

    if (
      config.pixAdmins.includes(
        userId
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Esse usuário já está cadastrado como ADM PIX.",
          ephemeral: true,
        }
      );

      return true;
    }

    config.pixAdmins.push(
      userId
    );

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ <@${userId}> foi cadastrado como ADM PIX.`,
        ephemeral: true,
      }
    );

    return true;
  }

  return false;
}async function handleButton(
  interaction
) {
  const customId =
    interaction.customId;

  /*
   * ============================================================
   * BOTÕES DAS FILAS
   * ============================================================
   */
  if (
    customId.startsWith(
      "queue_join|"
    ) ||
    customId.startsWith(
      "queue_leave|"
    )
  ) {
    return handleQueueButton(
      interaction
    );
  }

  /*
   * ============================================================
   * BOTÕES DA FILA DE MEDIADORES
   * ============================================================
   */
  if (
    customId ===
      "mediator_queue_join" ||
    customId ===
      "mediator_queue_leave"
  ) {
    return handleMediatorQueueButton(
      interaction
    );
  }

  /*
   * ============================================================
   * CONFIGURAÇÃO PRINCIPAL
   * ============================================================
   */
  if (
    customId ===
    "config_mediator"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem acessar a configuração.",
          ephemeral: true,
        }
      );

      return true;
    }

    await sendSafeReply(
      interaction,
      {
        embeds: [
          configMediatorEmbed(
            interaction.guild
          ),
        ],
        components: [
          ...configMediatorButtons(),
          ...configMediatorComponents(),
        ],
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    customId ===
    "config_analyst"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem acessar a configuração.",
          ephemeral: true,
        }
      );

      return true;
    }

    await sendSafeReply(
      interaction,
      {
        embeds: [
          configAnalystEmbed(
            interaction.guild
          ),
        ],
        components:
          configAnalystComponents(),
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    customId ===
    "config_channels"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem acessar a configuração.",
          ephemeral: true,
        }
      );

      return true;
    }

    await sendSafeReply(
      interaction,
      {
        embeds: [
          configChannelsEmbed(
            interaction.guild
          ),
        ],
        components:
          configChannelsComponents(),
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    customId ===
    "config_bets"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem acessar a configuração.",
          ephemeral: true,
        }
      );

      return true;
    }

    await sendSafeReply(
      interaction,
      {
        embeds: [
          configBetsEmbed(
            interaction.guild
          ),
        ],
        components:
          configBetsComponents(),
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    customId ===
    "config_appearance"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem acessar a configuração.",
          ephemeral: true,
        }
      );

      return true;
    }

    await sendSafeReply(
      interaction,
      {
        embeds: [
          configAppearanceEmbed(
            interaction.guild
          ),
        ],
        components:
          configAppearanceButtons(),
        ephemeral: true,
      }
    );

    return true;
  }

  if (
    customId ===
    "config_fee"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem acessar a configuração.",
          ephemeral: true,
        }
      );

      return true;
    }

    const config =
      getGuildConfig(
        interaction.guild.id
      );

    const modal =
      createModal(
        "config_fee_modal",
        "Taxa do ADM",
        [
          {
            customId:
              "fee",
            label:
              "Porcentagem da taxa",
            placeholder:
              "Exemplo: 1",
            value:
              String(
                config.admFee
              ),
            maxLength: 10,
          },
        ]
      );

    await interaction.showModal(
      modal
    );

    return true;
  }

  if (
    customId ===
    "config_pix"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem acessar a configuração.",
          ephemeral: true,
        }
      );

      return true;
    }

    await sendSafeReply(
      interaction,
      {
        embeds: [
          configPixEmbed(
            interaction.guild
          ),
        ],
        components:
          configPixButtons(),
        ephemeral: true,
      }
    );

    return true;
  }

  /*
   * ============================================================
   * VOLTAR PARA O MENU PRINCIPAL
   * ============================================================
   */
  if (
    customId ===
    "config_back"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem acessar a configuração.",
          ephemeral: true,
        }
      );

      return true;
    }

    await sendSafeReply(
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

    return true;
  }

  /*
   * ============================================================
   * APARÊNCIA — COR
   * ============================================================
   */
  if (
    customId ===
    "appearance_color"
  ) {
    const modal =
      createModal(
        "appearance_color_modal",
        "Alterar cor",
        [
          {
            customId:
              "color",
            label:
              "Cor hexadecimal",
            placeholder:
              "#000000",
            maxLength: 7,
          },
        ]
      );

    await interaction.showModal(
      modal
    );

    return true;
  }

  /*
   * ============================================================
   * APARÊNCIA — AVATAR
   * ============================================================
   */
  if (
    customId ===
    "appearance_avatar"
  ) {
    const modal =
      createModal(
        "appearance_avatar_modal",
        "Alterar avatar",
        [
          {
            customId:
              "avatar",
            label:
              "URL da imagem",
            placeholder:
              "https://...",
            maxLength: 500,
          },
        ]
      );

    await interaction.showModal(
      modal
    );

    return true;
  }

  /*
   * ============================================================
   * PIX — ADICIONAR
   * ============================================================
   */
  if (
    customId ===
    "pix_add"
  ) {
    const modal =
      createModal(
        "pix_add_modal",
        "Adicionar ADM PIX",
        [
          {
            customId:
              "pix_user_id",
            label:
              "ID do usuário",
            placeholder:
              "Digite o ID do Discord",
            maxLength: 30,
          },
        ]
      );

    await interaction.showModal(
      modal
    );

    return true;
  }

  /*
   * ============================================================
   * PIX — LISTA
   * ============================================================
   */
  if (
    customId ===
    "pix_list"
  ) {
    const config =
      getGuildConfig(
        interaction.guild.id
      );

    const admins =
      Array.isArray(
        config.pixAdmins
      )
        ? config.pixAdmins
        : [];

    await sendSafeReply(
      interaction,
      {
        content:
          admins.length
            ? admins
                .map(
                  (id, index) =>
                    `${index + 1}. <@${id}>`
                )
                .join("\n")
            : "Nenhum ADM PIX cadastrado.",
        ephemeral: true,
      }
    );

    return true;
  }

  /*
   * ============================================================
   * CONFIGURAÇÃO DE MEDIADORES
   * ============================================================
   */
  if (
    customId ===
      "mediator_add" ||
    customId ===
      "mediator_list" ||
    customId ===
      "publish_mediator_queue"
  ) {
    return handleMediatorConfigButton(
      interaction
    );
  }

  return false;
}

/*
 * ============================================================
 * COMANDOS SLASH
 * ============================================================
 */
const slashCommands = [
  new SlashCommandBuilder()
    .setName("fila")
    .setDescription(
      "Publica as filas de um formato e modalidade"
    ),

  new SlashCommandBuilder()
    .setName("med")
    .setDescription(
      "Publica a fila de mediadores"
    ),

  new SlashCommandBuilder()
    .setName("config")
    .setDescription(
      "Abre o painel de configuração"
    ),
].map(
  (command) =>
    command.toJSON()
);

/*
 * ============================================================
 * COMANDO /FILA
 * ============================================================
 */
async function commandFila(
  interaction
) {
  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem usar o comando /fila.",
        ephemeral: true,
      }
    );

    return;
  }

  const formatMenu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "fila_format"
      )
      .setPlaceholder(
        "Selecione o formato"
      )
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        FORMATS.map(
          (format) => ({
            label:
              format,
            value:
              format,
            description:
              `Fila ${format}`,
          })
        )
      );

  const row =
    new ActionRowBuilder().addComponents(
      formatMenu
    );

  await sendSafeReply(
    interaction,
    {
      content:
        "🎯 **Criar filas**\n\nPrimeiro, selecione o formato:",
      components: [
        row,
      ],
      ephemeral: true,
    }
  );
}

/*
 * ============================================================
 * COMANDO /MED
 * ============================================================
 */
async function commandMed(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Este comando só pode ser usado em um servidor.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem publicar a fila de mediadores.",
        ephemeral: true,
      }
    );

    return;
  }

  try {
    await publishMediatorQueue(
      guild
    );

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Fila de mediadores publicada com sucesso.",
        ephemeral: true,
      }
    );
  } catch (error) {
    console.error(
      "Erro no comando /med:",
      error
    );

    await sendSafeReply(
      interaction,
      {
        content:
          `❌ Não foi possível publicar a fila de mediadores: ${
            error.message ||
            "erro desconhecido"
          }`,
        ephemeral: true,
      }
    );
  }
}

/*
 * ============================================================
 * COMANDO /CONFIG
 * ============================================================
 */
async function commandConfig(
  interaction
) {
  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem acessar o painel.",
        ephemeral: true,
      }
    );

    return;
  }

  await sendSafeReply(
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

/*
 * ============================================================
 * COMANDOS POR PREFIXO
 * ============================================================
 */
async function handleCommand(
  message
) {
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
    (
      args.shift() ||
      ""
    ).toLowerCase();

  /*
   * ============================================================
   * .fila
   * ============================================================
   */
  if (
    command ===
    "fila"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      await message.reply(
        "❌ Apenas administradores podem usar `.fila`."
      );

      return;
    }

    const formatMenu =
      new StringSelectMenuBuilder()
        .setCustomId(
          "fila_format"
        )
        .setPlaceholder(
          "Selecione o formato"
        )
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          FORMATS.map(
            (format) => ({
              label:
                format,
              value:
                format,
              description:
                `Fila ${format}`,
            })
          )
        );

    await message.reply(
      {
        content:
          "🎯 **Criar filas**\n\nPrimeiro, selecione o formato:",
        components: [
          new ActionRowBuilder().addComponents(
            formatMenu
          ),
        ],
      }
    );

    return;
  }

  /*
   * ============================================================
   * .med
   * ============================================================
   */
  if (
    command ===
    "med"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      await message.reply(
        "❌ Apenas administradores podem usar `.med`."
      );

      return;
    }

    try {
      await publishMediatorQueue(
        message.guild
      );

      await message.reply(
        "✅ Fila de mediadores publicada."
      );
    } catch (error) {
      console.error(
        "Erro no .med:",
        error
      );

      await message.reply(
        `❌ Erro ao publicar fila de mediadores: ${
          error.message ||
          "erro desconhecido"
        }`
      );
    }

    return;
  }

  /*
   * ============================================================
   * .config
   * ============================================================
   */
  if (
    command ===
    "config"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      await message.reply(
        "❌ Apenas administradores podem usar `.config`."
      );

      return;
    }

    await message.reply(
      {
        embeds: [
          configMainEmbed(
            message.guild
          ),
        ],
        components:
          configButtons(),
      }
    );

    return;
  }

  /*
   * ============================================================
   * .ssmob
   * ============================================================
   */
  if (
    command ===
    "ssmob"
  ) {
    await createAnalysisRequest(
      message,
      "mobile"
    );

    return;
  }

  /*
   * ============================================================
   * .ssemu
   * ============================================================
   */
  if (
    command ===
    "ssemu"
  ) {
    await createAnalysisRequest(
      message,
      "emulador"
    );

    return;
  }

  /*
   * ============================================================
   * .fila1
   * ============================================================
   */
  if (
    command ===
    "fila1"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      await message.reply(
        "❌ Apenas administradores podem usar esse comando."
      );

      return;
    }

    await publishQueues(
      message.guild,
      "1x1",
      "mobile"
    );

    await message.reply(
      "✅ Filas 1x1 Mobile publicadas."
    );

    return;
  }

  /*
   * ============================================================
   * .fila2
   * ============================================================
   */
  if (
    command ===
    "fila2"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      await message.reply(
        "❌ Apenas administradores podem usar esse comando."
      );

      return;
    }

    await publishQueues(
      message.guild,
      "2x2",
      "mobile"
    );

    await message.reply(
      "✅ Filas 2x2 Mobile publicadas."
    );

    return;
  }

  /*
   * ============================================================
   * .fila3
   * ============================================================
   */
  if (
    command ===
    "fila3"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      await message.reply(
        "❌ Apenas administradores podem usar esse comando."
      );

      return;
    }

    await publishQueues(
      message.guild,
      "3x3",
      "mobile"
    );

    await message.reply(
      "✅ Filas 3x3 Mobile publicadas."
    );

    return;
  }

  /*
   * ============================================================
   * .fila4
   * ============================================================
   */
  if (
    command ===
    "fila4"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      await message.reply(
        "❌ Apenas administradores podem usar esse comando."
      );

      return;
    }

    await publishQueues(
      message.guild,
      "4x4",
      "mobile"
    );

    await message.reply(
      "✅ Filas 4x4 Mobile publicadas."
    );

    return;
  }
}

/*
 * ============================================================
 * SISTEMA DE ANÁLISE
 * ============================================================
 */
async function createAnalysisRequest(
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

  const analystRoleId =
    config.analystRoleId;

  if (
    analystRoleId &&
    !message.member.roles.cache.has(
      analystRoleId
    ) &&
    !isAdministrator(
      message.member
    )
  ) {
    await message.reply(
      {
        content:
          `❌ Você precisa do cargo <@&${analystRoleId}> para solicitar uma análise.`,
        allowedMentions: {
          roles: [
            analystRoleId,
          ],
        },
      }
    );

    return;
  }

  const analysisId =
    generateId(
      "analysis"
    );

  db.analyses[
    analysisId
  ] = {
    id:
      analysisId,
    guildId:
      guild.id,
    userId:
      message.author.id,
    type,
    status:
      "pending",
    createdAt:
      new Date().toISOString(),
  };

  saveDatabase();

  const channelId =
    type === "mobile"
      ? config.analysisChannelMobile
      : config.analysisChannelEmulator;

  if (!channelId) {
    await message.reply(
      {
        content:
          "❌ O canal de análise ainda não foi configurado.",
      }
    );

    return;
  }

  try {
    const channel =
      await guild.channels.fetch(
        channelId
      );

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      throw new Error(
        "Canal inválido."
      );
    }

    await channel.send(
      {
        embeds: [
          createEmbed(
            guild.id,
            "🔎 NOVA ANÁLISE",
            `👤 **Usuário:** <@${message.author.id}>\n` +
              `📱 **Tipo:** ${modeLabel(
                type
              )}\n` +
              `🆔 **ID:** \`${analysisId}\`\n\n` +
              `A análise está aguardando atendimento.`
          ),
        ],
      }
    );

    await message.reply(
      {
        content:
          `✅ Sua solicitação de análise foi enviada.\n🆔 ID: \`${analysisId}\``,
      }
    );
  } catch (error) {
    console.error(
      "Erro ao criar análise:",
      error
    );

    await message.reply(
      {
        content:
          "❌ Não foi possível enviar a solicitação de análise.",
      }
    );
  }
}/*
 * ============================================================
 * REGISTRO DOS COMANDOS SLASH
 * ============================================================
 */
async function registerSlashCommands() {
  try {
    const rest =
      new REST({
        version: "10",
      }).setToken(
        TOKEN
      );

    console.log(
      "Registrando comandos slash..."
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
      "✅ Comandos slash registrados com sucesso."
    );
  } catch (error) {
    console.error(
      "❌ Erro ao registrar comandos slash:",
      error
    );
  }
}

/*
 * ============================================================
 * EVENTO READY
 * ============================================================
 */
client.once(
  "ready",
  async () => {
    console.log(
      `✅ Bot conectado como ${client.user.tag}`
    );

    console.log(
      `🆔 ID do bot: ${client.user.id}`
    );

    console.log(
      `🌐 Servidores: ${client.guilds.cache.size}`
    );

    await registerSlashCommands();

    /*
     * Garante que a configuração
     * de cada servidor esteja
     * inicializada.
     */
    for (
      const guild of client.guilds.cache.values()
    ) {
      getGuildConfig(
        guild.id
      );
    }

    saveDatabase();

    console.log(
      "✅ Banco de dados carregado."
    );
  }
);

/*
 * ============================================================
 * INTERACTIONS
 * ============================================================
 */
client.on(
  "interactionCreate",
  async (
    interaction
  ) => {
    try {
      /*
       * ========================================================
       * SLASH COMMAND
       * ========================================================
       */
      if (
        interaction.isChatInputCommand()
      ) {
        if (
          interaction.commandName ===
          "fila"
        ) {
          await commandFila(
            interaction
          );

          return;
        }

        if (
          interaction.commandName ===
          "med"
        ) {
          await commandMed(
            interaction
          );

          return;
        }

        if (
          interaction.commandName ===
          "config"
        ) {
          await commandConfig(
            interaction
          );

          return;
        }

        return;
      }

      /*
       * ========================================================
       * BOTÃO
       * ========================================================
       */
      if (
        interaction.isButton()
      ) {
        await handleButton(
          interaction
        );

        return;
      }

      /*
       * ========================================================
       * SELECT MENU
       * ========================================================
       */
      if (
        interaction.isStringSelectMenu()
      ) {
        await handleSelectMenu(
          interaction
        );

        return;
      }

      /*
       * ========================================================
       * CHANNEL SELECT
       * ========================================================
       */
      if (
        interaction.isChannelSelectMenu()
      ) {
        await handleChannelSelect(
          interaction
        );

        return;
      }

      /*
       * ========================================================
       * ROLE SELECT
       * ========================================================
       */
      if (
        interaction.isRoleSelectMenu()
      ) {
        await handleSelectMenu(
          interaction
        );

        return;
      }

      /*
       * ========================================================
       * MODAL
       * ========================================================
       */
      if (
        interaction.isModalSubmit()
      ) {
        await handleModalSubmit(
          interaction
        );

        return;
      }
    } catch (error) {
      console.error(
        "❌ Erro no interactionCreate:",
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
      } catch (replyError) {
        console.error(
          "Erro ao enviar mensagem de erro:",
          replyError
        );
      }
    }
  }
);

/*
 * ============================================================
 * MESSAGE CREATE
 * ============================================================
 */
client.on(
  "messageCreate",
  async (
    message
  ) => {
    try {
      await handleCommand(
        message
      );
    } catch (error) {
      console.error(
        "❌ Erro no messageCreate:",
        error
      );

      try {
        await message.reply(
          "❌ Ocorreu um erro ao processar o comando."
        );
      } catch (replyError) {
        console.error(
          "Erro ao responder mensagem:",
          replyError
        );
      }
    }
  }
);

/*
 * ============================================================
 * TRATAMENTO DE PROMISES NÃO TRATADAS
 * ============================================================
 */
process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "❌ Unhandled Rejection:",
      error
    );
  }
);

/*
 * ============================================================
 * TRATAMENTO DE EXCEÇÕES NÃO CAPTURADAS
 * ============================================================
 */
process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "❌ Uncaught Exception:",
      error
    );
  }
);

/*
 * ============================================================
 * LOGIN
 * ============================================================
 */
client
  .login(TOKEN)
  .then(() => {
    console.log(
      "🔐 Login realizado."
    );
  })
  .catch(
    (error) => {
      console.error(
        "❌ Erro ao fazer login:",
        error
      );
    }
  );
