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
  Events,
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
 * ============================================
 * VALORES DAS FILAS
 * ============================================
 *
 * Armazenados em centavos.
 *
 * Publicação:
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
 * ============================================
 * CLIENT
 * ============================================
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

/*
 * ============================================
 * CONFIGURAÇÃO DO SERVIDOR
 * ============================================
 */

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

      mediatorQueueMessageId:
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

  if (
    !Object.prototype.hasOwnProperty.call(
      config,
      "mediatorQueueMessageId"
    )
  ) {
    config.mediatorQueueMessageId =
      null;
  }

  return config;
}

/*
 * ============================================
 * USUÁRIO
 * ============================================
 */

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

/*
 * ============================================
 * UTILITÁRIOS
 * ============================================
 */

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

function hasMediatorRole(
  member,
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

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

/*
 * ============================================
 * TAMANHO DA EQUIPE
 * ============================================
 */

function teamSize(
  format
) {
  const value =
    Number(
      String(format)
        .split("x")[0]
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
 * ============================================
 * CHAVES DAS FILAS
 * ============================================
 *
 * 1x1:
 *
 * Existe UMA fila por valor.
 * O gelo normal/infinito é salvo
 * separadamente para cada jogador.
 *
 * 2x2 / 3x3 / 4x4:
 *
 * A fila normal é usada diretamente.
 */

function makeQueueKey(
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  if (
    format === "1x1"
  ) {
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
 * ============================================
 * ESCOLHA DO GELO — 1x1
 * ============================================
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

/*
 * ============================================
 * LABEL DA MODALIDADE
 * ============================================
 */

function modeLabel(
  mode
) {
  if (
    mode === "mobile"
  ) {
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

/*
 * ============================================
 * EMBED DA FILA
 * ============================================
 */

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
            (
              id,
              index
            ) => {
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

              return `**${
                index + 1
              }.** <@${id}>${extra}`;
            }
          )
          .join("\n")
      : "Nenhum jogador na fila.";

  return createEmbed(
    guildId,
    `🎰 FILA ${format}`,
    `📌 **Modalidade:** ${modeLabel(
      mode
    )}\n` +
      `💰 **Valor:** ${formatMoney(
        value
      )}\n\n` +
      `👥 **Jogadores:** ${
        queue.length
      }/${requiredPlayers(
        format
      )}\n\n` +
      players
  );
}

/*
 * ============================================
 * BOTÕES DAS FILAS
 * ============================================
 */

function queueButtons(
  format,
  mode,
  value,
  type = "normal"
) {
  if (
    format === "1x1"
  ) {
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

/*
 * ============================================
 * FILA DE MEDIADORES
 * ============================================
 */

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
            (
              id,
              index
            ) =>
              `${
                index + 1
              }. <@${id}>`
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

/*
 * ============================================
 * PAINEL PRINCIPAL DE CONFIGURAÇÃO
 * ============================================
 */

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

      `💸 **Taxa do ADM:** ${formatMoney(
        config.admFee
      )}`
  );
}

/*
 * ============================================
 * BOTÕES DO /CONFIG
 * ============================================
 *
 * IMPORTANTE:
 *
 * O botão "Filas" NÃO existe mais aqui.
 */

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
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_channels"
        )
        .setLabel(
          "Canais"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_bets"
        )
        .setLabel(
          "Apostas"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config_mediators"
        )
        .setLabel(
          "Mediadores"
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
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_fee"
        )
        .setLabel(
          "Taxa"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),
  ];
}

function backButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        "config_back"
      )
      .setLabel(
        "Voltar"
      )
      .setStyle(
        ButtonStyle.Secondary
      )
  ];
}

/*
 * ============================================
 * CONFIGURAÇÃO DE CARGOS
 * ============================================
 */

function roleConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(
          "select_mediator_role"
        )
        .setPlaceholder(
          "Selecione o cargo Mediador"
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(
          "select_analyst_role"
        )
        .setPlaceholder(
          "Selecione o cargo Analista"
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    backButton(),
  ];
}

/*
 * ============================================
 * CONFIGURAÇÃO DE CANAIS
 * ============================================
 */

function channelConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "select_channel_mobile"
        )
        .setPlaceholder(
          "Selecione o Canal 1 — .ssmob"
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
          "select_channel_emulator"
        )
        .setPlaceholder(
          "Selecione o Canal 2 — .ssemu"
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
          "select_bets_category"
        )
        .setPlaceholder(
          "Selecione a categoria das apostas"
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
          "select_mediator_channel"
        )
        .setPlaceholder(
          "Canal da fila de mediadores"
        )
        .addChannelTypes(
          ChannelType.GuildText
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    backButton(),
  ];
}

function betConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "select_bets_category"
        )
        .setPlaceholder(
          "Selecione a categoria das apostas"
        )
        .addChannelTypes(
          ChannelType.GuildCategory
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    backButton(),
  ];
}

/*
 * ============================================
 * CONFIGURAÇÃO DE MEDIADORES
 * ============================================
 */

function mediatorConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "select_mediator_channel"
        )
        .setPlaceholder(
          "Selecione o canal da fila de mediadores"
        )
        .addChannelTypes(
          ChannelType.GuildText
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "pix_add"
        )
        .setLabel(
          "Cadastrar ADM/Pix"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "pix_list"
        )
        .setLabel(
          "Ver ADM/Pix"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "publish_mediator_queue"
        )
        .setLabel(
          "Publicar fila de mediadores"
        )
        .setStyle(
          ButtonStyle.Primary
        )
    ),

    backButton(),
  ];
}

/*
 * ============================================
 * APARÊNCIA
 * ============================================
 */

function appearanceComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "appearance_avatar"
        )
        .setLabel(
          "Foto do Bot"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "appearance_color"
        )
        .setLabel(
          "Cor"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    backButton(),
  ];
}

/*
 * ============================================
 * TAXA
 * ============================================
 */

function feeComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config_fee_set"
        )
        .setLabel(
          "Definir taxa"
        )
        .setStyle(
          ButtonStyle.Primary
        )
    ),

    backButton(),
  ];
}

/*
 * ============================================
 * PIX
 * ============================================
 */

function pixComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "pix_add"
        )
        .setLabel(
          "Cadastrar ADM/Pix"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "pix_list"
        )
        .setLabel(
          "Ver cadastrados"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    backButton(),
  ];
}

/*
 * ============================================
 * MODAL — FOTO DO BOT
 * ============================================
 */

function createAvatarModal() {
  return new ModalBuilder()
    .setCustomId(
      "avatar_modal"
    )
    .setTitle(
      "Foto do Bot"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "avatar_url"
          )
          .setLabel(
            "URL da foto"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
      )
    );
}

/*
 * ============================================
 * MODAL — COR
 * ============================================
 */

function createColorModal() {
  return new ModalBuilder()
    .setCustomId(
      "color_modal"
    )
    .setTitle(
      "Cor do Bot"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
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
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
      )
    );
}

/*
 * ============================================
 * MODAL PIX
 * ============================================
 */

function createPixModal() {
  return new ModalBuilder()
    .setCustomId(
      "pix_modal"
    )
    .setTitle(
      "Cadastrar ADM / Pix"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "pix_name"
          )
          .setLabel(
            "Nome do ADM"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "pix_key"
          )
          .setLabel(
            "Chave Pix"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "pix_qr"
          )
          .setLabel(
            "URL do QR Code (opcional)"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(false)
      )
    );
}

/*
 * ============================================
 * MODAL — TAXA
 * ============================================
 */

function createFeeModal() {
  return new ModalBuilder()
    .setCustomId(
      "fee_modal"
    )
    .setTitle(
      "Definir taxa do ADM"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "fee_cents"
          )
          .setLabel(
            "Taxa em centavos"
          )
          .setPlaceholder(
            "1 = R$0,01 | 100 = R$1,00"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
      )
    );
}

/*
 * ============================================
 * FIM DA PARTE 1
 * ============================================
 */    await refreshQueueMessage(
      interaction.message
    );
  }
}

/*
 * ============================================
 * SAIR DA FILA
 * ============================================
 */

async function leaveQueue(
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

  const userId =
    interaction.user.id;

  const queue =
    getQueue(
      guild.id,
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
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não está nessa fila.",
        ephemeral: true,
      }
    );

    return;
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

    delete choices[
      userId
    ];
  }

  saveDatabase();

  await sendSafeReply(
    interaction,
    {
      content:
        "✅ Você saiu da fila.",
      ephemeral: true,
    }
  );

  await refreshQueueMessage(
    interaction.message
  );
}

/*
 * ============================================
 * CRIAÇÃO DA APOSTA PRIVADA
 * ============================================
 */

async function createPrivateBetChannel(
  guild,
  format,
  mode,
  value,
  type,
  players
) {
  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !config.betsCategoryId
  ) {
    throw new Error(
      "Categoria das apostas não configurada."
    );
  }

  const category =
    await guild.channels.fetch(
      config.betsCategoryId
    );

  if (
    !category ||
    category.type !==
      ChannelType.GuildCategory
  ) {
    throw new Error(
      "A categoria das apostas não foi encontrada."
    );
  }

  const uniquePlayers =
    [...new Set(players)];

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionsBitField.Flags.ViewChannel,
      ],
    },
  ];

  for (
    const userId of uniquePlayers
  ) {
    overwrites.push({
      id: userId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  if (
    config.mediatorRoleId
  ) {
    overwrites.push({
      id: config.mediatorRoleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  if (
    config.analystRoleId
  ) {
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
        `aposta-${format}-${value}-${Date.now()
          .toString()
          .slice(-4)}`,
      type:
        ChannelType.GuildText,
      parent:
        category.id,
      permissionOverwrites:
        overwrites,
    });

  const mediator =
    getCurrentMediator(
      guild.id
    );

  const embed =
    createEmbed(
      guild.id,
      "🎮 APOSTA CRIADA",
      `👥 **Formato:** ${format}\n` +
        `📌 **Modalidade:** ${modeLabel(
          mode
        )}\n` +
        `💰 **Valor:** ${formatMoney(
          value
        )}\n` +
        `🎯 **Tipo:** ${
          type === "ice_infinite"
            ? "♾️ Gelo Infinito"
            : type === "ice_normal"
              ? "🧊 Gelo Normal"
              : "Normal"
        }\n\n` +
        `👤 **Jogadores:**\n` +
        uniquePlayers
          .map(
            (
              id,
              index
            ) =>
              `${index + 1}. <@${id}>`
          )
          .join("\n") +
        `\n\n` +
        `🛡️ **Mediador:** ${
          mediator
            ? `<@${mediator}>`
            : "Aguardando mediador"
        }`
    );

  const components =
    betChannelButtons(
      guild.id,
      format,
      mode,
      value,
      uniquePlayers
    );

  const message =
    await channel.send({
      embeds: [
        embed,
      ],
      components,
    });

  return {
    id:
      generateId("bet"),
    channelId:
      channel.id,
    messageId:
      message.id,
    guildId:
      guild.id,
    format,
    mode,
    value:
      Number(value),
    type,
    players:
      uniquePlayers,
    mediatorId:
      mediator || null,
    status:
      "open",
    createdAt:
      Date.now(),
  };
}

/*
 * ============================================
 * BOTÕES DA APOSTA
 * ============================================
 */

function betChannelButtons(
  guildId,
  format,
  mode,
  value,
  players
) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `bet_mediator|${format}|${mode}|${value}`
        )
        .setLabel(
          "🛡️ Solicitar mediador"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          `bet_finish|${format}|${mode}|${value}`
        )
        .setLabel(
          "✅ Finalizar aposta"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          `bet_cancel|${format}|${mode}|${value}`
        )
        .setLabel(
          "❌ Cancelar"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    ),
  ];
}

/*
 * ============================================
 * MEDIADOR ATUAL
 * ============================================
 */

function getCurrentMediator(
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

  if (
    queue.length === 0
  ) {
    return null;
  }

  let index =
    Number(
      config.mediatorRotationIndex
    );

  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= queue.length
  ) {
    index = 0;
    config.mediatorRotationIndex =
      0;
  }

  return queue[index];
}

function rotateMediator(
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
    config.mediatorRotationIndex =
      0;

    saveDatabase();

    return null;
  }

  config.mediatorRotationIndex =
    (
      Number(
        config.mediatorRotationIndex
      ) + 1
    ) %
    config.mediatorQueue.length;

  saveDatabase();

  return getCurrentMediator(
    guildId
  );
}

/*
 * ============================================
 * MEDIADORES CADASTRADOS
 * ============================================
 */

function isRegisteredMediator(
  guildId,
  userId
) {
  const config =
    getGuildConfig(
      guildId
    );

  if (
    !Array.isArray(
      config.mediatorQueue
    )
  ) {
    config.mediatorQueue =
      [];
  }

  return config.mediatorQueue.includes(
    userId
  );
}

function addActiveMediator(
  guildId,
  userId
) {
  const config =
    getGuildConfig(
      guildId
    );

  if (
    !Array.isArray(
      config.mediatorQueue
    )
  ) {
    config.mediatorQueue =
      [];
  }

  if (
    !config.mediatorQueue.includes(
      userId
    )
  ) {
    config.mediatorQueue.push(
      userId
    );
  }

  if (
    config.mediatorRotationIndex >=
    config.mediatorQueue.length
  ) {
    config.mediatorRotationIndex =
      0;
  }

  saveDatabase();
}

function removeActiveMediator(
  guildId,
  userId
) {
  const config =
    getGuildConfig(
      guildId
    );

  if (
    !Array.isArray(
      config.mediatorQueue
    )
  ) {
    config.mediatorQueue =
      [];
  }

  const index =
    config.mediatorQueue.indexOf(
      userId
    );

  if (index === -1) {
    return false;
  }

  config.mediatorQueue.splice(
    index,
    1
  );

  if (
    config.mediatorQueue.length ===
      0
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

  return true;
}

function getMediatorListText(
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

  if (
    queue.length === 0
  ) {
    return "Nenhum mediador está na fila.";
  }

  return queue
    .map(
      (
        id,
        index
      ) =>
        `**${index + 1}.** <@${id}>`
    )
    .join("\n");
}

/*
 * ============================================
 * ATUALIZAR FILA DE MEDIADORES
 * ============================================
 */

async function updateMediatorQueueMessage(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !config.mediatorQueueChannelId
  ) {
    return null;
  }

  const channel =
    await guild.channels.fetch(
      config.mediatorQueueChannelId
    ).catch(
      () => null
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    return null;
  }

  let message =
    null;

  if (
    config.mediatorQueueMessageId
  ) {
    message =
      await channel.messages
        .fetch(
          config.mediatorQueueMessageId
        )
        .catch(
          () => null
        );
  }

  if (!message) {
    const messages =
      await channel.messages
        .fetch({
          limit: 100,
        })
        .catch(
          () => null
        );

    if (messages) {
      message =
        messages.find(
          (item) =>
            item.author?.id ===
              client.user?.id &&
            item.components?.some(
              (row) =>
                row.components?.some(
                  (component) =>
                    component.customId ===
                    "mediator_queue_join"
                )
            )
        );
    }
  }

  if (!message) {
    message =
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

  await message.edit({
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
      "Canal da fila de mediadores não configurado."
    );
  }

  return updateMediatorQueueMessage(
    guild
  );
}

/*
 * ============================================
 * PIX / ADM
 * ============================================
 */

function getPixAdminListText(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  if (
    !Array.isArray(
      config.pixAdmins
    ) ||
    config.pixAdmins.length === 0
  ) {
    return "Nenhum ADM/Pix cadastrado.";
  }

  return config.pixAdmins
    .map(
      (
        adm,
        index
      ) =>
        `**${index + 1}. ${adm.name || "Sem nome"}**\n` +
        `👤 Discord: <@${adm.userId || adm.id}>\n` +
        `💳 Pix: \`${adm.key || "Não informado"}\`\n` +
        (
          adm.qr
            ? `📷 QR: ${adm.qr}\n`
            : ""
        )
    )
    .join("\n");
}

/*
 * ============================================
 * MODAL DE CADASTRO DO ADM
 * ============================================
 */

function createPixIdModal() {
  return new ModalBuilder()
    .setCustomId(
      "pix_id_modal"
    )
    .setTitle(
      "Cadastrar ADM"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "admin_user_id"
          )
          .setLabel(
            "ID do Discord do ADM"
          )
          .setPlaceholder(
            "Ex: 123456789012345678"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(
            true
          )
          .setMinLength(
            17
          )
          .setMaxLength(
            20
          )
      )
    );
}

function createPixDataModal(
  userId
) {
  return new ModalBuilder()
    .setCustomId(
      `admin_data_modal|${userId}`
    )
    .setTitle(
      "Dados do ADM / Pix"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "admin_name"
          )
          .setLabel(
            "Nome do ADM"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(
            true
          )
          .setMaxLength(
            100
          )
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "admin_pix_key"
          )
          .setLabel(
            "Chave Pix"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(
            true
          )
          .setMaxLength(
            200
          )
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "admin_pix_qr"
          )
          .setLabel(
            "URL do QR Code (opcional)"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(
            false
          )
          .setMaxLength(
            1000
          )
      )
    );
}

/*
 * ============================================
 * ADICIONAR ADM
 * ============================================
 */

function addPixAdmin(
  guildId,
  data
) {
  const config =
    getGuildConfig(
      guildId
    );

  if (
    !Array.isArray(
      config.pixAdmins
    )
  ) {
    config.pixAdmins =
      [];
  }

  const existingIndex =
    config.pixAdmins.findIndex(
      (item) =>
        (
          item.userId ||
          item.id
        ) ===
        data.userId
    );

  const entry = {
    id:
      data.userId,
    userId:
      data.userId,
    name:
      data.name,
    key:
      data.key,
    qr:
      data.qr || null,
    addedBy:
      data.addedBy,
    addedAt:
      Date.now(),
  };

  if (
    existingIndex !== -1
  ) {
    config.pixAdmins[
      existingIndex
    ] = {
      ...config.pixAdmins[
        existingIndex
      ],
      ...entry,
    };
  } else {
    config.pixAdmins.push(
      entry
    );
  }

  saveDatabase();

  return entry;
}

/*
 * ============================================
 * CONFIGURAÇÃO DE CANAL DA FILA
 * ============================================
 *
 * IMPORTANTE:
 *
 * /fila escolhe o canal diretamente.
 * O canal escolhido NÃO depende de
 * analysisChannelMobile/analysisChannelEmulator.
 */

async function publishQueues(
  guild,
  format,
  mode,
  channelOverride = null
) {
  let channel = null;

  /*
   * Se o /fila enviou um canal escolhido
   * pelo usuário, usamos ESSE canal.
   *
   * Não fazemos nenhuma verificação de
   * canal configurado nesse caso.
   */
  if (channelOverride) {
    channel =
      await guild.channels.fetch(
        channelOverride
      ).catch(
        () => null
      );
  } else {
    const config =
      getGuildConfig(
        guild.id
      );

    let channelId =
      null;

    if (
      mode === "mobile"
    ) {
      channelId =
        config.analysisChannelMobile;
    } else if (
      mode === "emulador"
    ) {
      channelId =
        config.analysisChannelEmulator;
    } else if (
      mode === "misto"
    ) {
      channelId =
        config.analysisChannelMobile ||
        config.analysisChannelEmulator;
    }

    if (!channelId) {
      throw new Error(
        `Canal não configurado para a modalidade ${mode}.`
      );
    }

    channel =
      await guild.channels.fetch(
        channelId
      ).catch(
        () => null
      );
  }

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      "Canal não encontrado ou inválido."
    );
  }

  /*
   * Maior valor primeiro.
   *
   * Como o Discord mostra as mensagens
   * mais novas embaixo, publicamos:
   *
   * 100
   * 50
   * 20
   * 10
   * 7
   * 5
   * 3
   * 2
   * 1
   * 0,75
   * 0,50
   * 0,30
   */

  const orderedValues =
    [...VALUES].sort(
      (a, b) => b - a
    );

  const createdMessages =
    [];

  for (
    const value of orderedValues
  ) {
    const message =
      await registerQueueMessage(
        channel,
        guild.id,
        format,
        mode,
        value,
        "normal"
      );

    if (message) {
      createdMessages.push(
        message
      );
    }
  }

  return createdMessages;
}

/*
 * ============================================
 * CONFIGURAÇÃO DE CANAIS
 * ============================================
 */

async function handleChannelConfig(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  const id =
    interaction.customId;

  const channelId =
    interaction.values?.[0];

  if (!channelId) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Nenhum canal foi selecionado.",
        ephemeral: true,
      }
    );

    return;
  }

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    id ===
    "select_channel_mobile"
  ) {
    config.analysisChannelMobile =
      channelId;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal do **.ssmob** configurado: <#${channelId}>`,
        ephemeral: true,
      }
    );

    return;
  }

  if (
    id ===
    "select_channel_emulator"
  ) {
    config.analysisChannelEmulator =
      channelId;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal do **.ssemu** configurado: <#${channelId}>`,
        ephemeral: true,
      }
    );

    return;
  }

  if (
    id ===
    "select_bets_category"
  ) {
    config.betsCategoryId =
      channelId;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Categoria das apostas configurada: <#${channelId}>`,
        ephemeral: true,
      }
    );

    return;
  }

  if (
    id ===
    "select_mediator_channel"
  ) {
    config.mediatorQueueChannelId =
      channelId;

    config.mediatorQueueMessageId =
      null;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal da fila de mediadores configurado: <#${channelId}>`,
        ephemeral: true,
      }
    );

    return;
  }
}

/*
 * ============================================
 * FIM DA PARTE 2
 * ============================================
 *//*
 * ============================================
 * UTILITÁRIO DE RESPOSTA SEGURA
 * ============================================
 */

async function sendSafeReply(
  interaction,
  data
) {
  try {
    if (
      interaction.replied ||
      interaction.deferred
    ) {
      return await interaction.followUp(
        data
      );
    }

    return await interaction.reply(
      data
    );
  } catch (error) {
    console.error(
      "Erro ao responder interação:",
      error
    );
  }
}

/*
 * ============================================
 * ATUALIZAÇÃO DAS MENSAGENS DAS FILAS
 * ============================================
 */

async function refreshQueueMessage(
  message
) {
  if (!message) {
    return;
  }

  try {
    const customIds =
      [];

    for (
      const row of
        message.components || []
    ) {
      for (
        const component of
          row.components || []
      ) {
        if (
          component.customId
        ) {
          customIds.push(
            component.customId
          );
        }
      }
    }

    const queueButton =
      customIds.find(
        (id) =>
          id.startsWith(
            "queue_join|"
          )
      );

    if (!queueButton) {
      return;
    }

    const parts =
      queueButton.split("|");

    const format =
      parts[1];

    const mode =
      parts[2];

    const value =
      Number(parts[3]);

    if (
      !format ||
      !mode ||
      !Number.isFinite(
        value
      )
    ) {
      return;
    }

    const embed =
      queueEmbed(
        message.guild.id,
        format,
        mode,
        value,
        "normal"
      );

    await message.edit({
      embeds: [
        embed,
      ],
      components:
        queueButtons(
          format,
          mode,
          value,
          "normal"
        ),
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar fila:",
      error
    );
  }
}

/*
 * ============================================
 * REGISTRAR MENSAGEM DE FILA
 * ============================================
 */

async function registerQueueMessage(
  channel,
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  const message =
    await channel.send({
      embeds: [
        queueEmbed(
          guildId,
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

  const config =
    getGuildConfig(
      guildId
    );

  const key =
    makeQueueKey(
      guildId,
      format,
      mode,
      value,
      type
    );

  config.queueMessages[
    key
  ] = {
    channelId:
      channel.id,
    messageId:
      message.id,
    format,
    mode,
    value:
      Number(value),
    type,
  };

  saveDatabase();

  return message;
}

/*
 * ============================================
 * ENTRAR NA FILA
 * ============================================
 */

async function joinQueue(
  interaction,
  format,
  mode,
  value,
  type = "normal",
  iceChoice = null
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  const userId =
    interaction.user.id;

  const queue =
    getQueue(
      guild.id,
      format,
      mode,
      value,
      type
    );

  const maxPlayers =
    requiredPlayers(
      format
    );

  if (
    queue.includes(
      userId
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Você já está nessa fila.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    queue.length >=
    maxPlayers
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa fila já está cheia.",
        ephemeral: true,
      }
    );

    return;
  }

  queue.push(
    userId
  );

  if (
    format === "1x1"
  ) {
    if (
      iceChoice !==
      "ice_normal" &&
      iceChoice !==
      "ice_infinite"
    ) {
      queue.pop();

      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Escolha o tipo de gelo antes de entrar.",
          ephemeral: true,
        }
      );

      return;
    }

    const choices =
      getQueueChoices(
        guild.id,
        format,
        mode,
        value
      );

    choices[userId] =
      iceChoice;
  }

  saveDatabase();

  await sendSafeReply(
    interaction,
    {
      content:
        `✅ Você entrou na fila de **${formatMoney(
          value
        )}**.`,
      ephemeral: true,
    }
  );

  await refreshQueueMessage(
    interaction.message
  );

  /*
   * ==========================================
   * VERIFICAR SE A FILA FICOU COMPLETA
   * ==========================================
   */

  if (
    queue.length <
    maxPlayers
  ) {
    return;
  }

  /*
   * 1x1:
   * só cria aposta quando os dois
   * escolheram o mesmo gelo.
   */

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

    const first =
      choices[
        queue[0]
      ];

    const second =
      choices[
        queue[1]
      ];

    if (
      !first ||
      !second
    ) {
      return;
    }

    if (
      first !== second
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "⚠️ A fila está cheia, mas os tipos de gelo são diferentes. Os jogadores precisam sair e entrar novamente escolhendo o mesmo tipo.",
          ephemeral: true,
        }
      );

      return;
    }

    type = first;
  }

  /*
   * ==========================================
   * CRIAR A APOSTA
   * ==========================================
   */

  try {
    const players =
      [...queue];

    const bet =
      await createPrivateBetChannel(
        guild,
        format,
        mode,
        value,
        type,
        players
      );

    db.bets[
      bet.id
    ] = bet;

    /*
     * Limpa a fila.
     */

    queue.splice(
      0,
      queue.length
    );

    if (
      format === "1x1"
    ) {
      clearQueueChoices(
        guild.id,
        format,
        mode,
        value
      );
    }

    saveDatabase();

    await refreshQueueMessage(
      interaction.message
    );
  } catch (error) {
    console.error(
      "Erro ao criar aposta:",
      error
    );

    await sendSafeReply(
      interaction,
      {
        content:
          `❌ Não foi possível criar a aposta: ${error.message}`,
        ephemeral: true,
      }
    );
  }
}

/*
 * ============================================
 * BOTÕES DE MEDIADOR
 * ============================================
 */

async function handleMediatorButton(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  const member =
    interaction.member;

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
          "❌ Você não possui o cargo de Mediador.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    interaction.customId ===
    "mediator_queue_join"
  ) {
    addActiveMediator(
      guild.id,
      interaction.user.id
    );

    await updateMediatorQueueMessage(
      guild
    );

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Você entrou na fila de mediadores.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    interaction.customId ===
    "mediator_queue_leave"
  ) {
    const removed =
      removeActiveMediator(
        guild.id,
        interaction.user.id
      );

    await updateMediatorQueueMessage(
      guild
    );

    await sendSafeReply(
      interaction,
      {
        content:
          removed
            ? "✅ Você saiu da fila de mediadores."
            : "⚠️ Você não estava na fila de mediadores.",
        ephemeral: true,
      }
    );

    return;
  }
}

/*
 * ============================================
 * BOTÕES DA APOSTA
 * ============================================
 */

async function handleBetButton(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id.startsWith(
      "bet_mediator|"
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

    const guild =
      interaction.guild;

    if (!guild) {
      return;
    }

    const mediator =
      getCurrentMediator(
        guild.id
      );

    if (!mediator) {
      await sendSafeReply(
        interaction,
        {
          content:
            "⚠️ Não há mediador ativo na fila.",
          ephemeral: true,
        }
      );

      return;
    }

    await sendSafeReply(
      interaction,
      {
        content:
          `🛡️ Mediador selecionado: <@${mediator}>`,
        ephemeral: false,
      }
    );

    return;
  }

  if (
    id.startsWith(
      "bet_finish|"
    )
  ) {
    if (
      !isAdministrator(
        interaction.member
      ) &&
      !hasMediatorRole(
        interaction.member,
        interaction.guild.id
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas ADM ou Mediador pode finalizar a aposta.",
          ephemeral: true,
        }
      );

      return;
    }

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Aposta marcada como finalizada.",
        ephemeral: false,
      }
    );

    return;
  }

  if (
    id.startsWith(
      "bet_cancel|"
    )
  ) {
    if (
      !isAdministrator(
        interaction.member
      ) &&
      !hasMediatorRole(
        interaction.member,
        interaction.guild.id
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas ADM ou Mediador pode cancelar a aposta.",
          ephemeral: true,
        }
      );

      return;
    }

    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Aposta cancelada.",
        ephemeral: false,
      }
    );

    return;
  }
}

/*
 * ============================================
 * SELECT /fila
 * ============================================
 */

async function handleSelectMenu(
  interaction
) {
  const id =
    interaction.customId;

  /*
   * 1 — FORMATO
   */

  if (
    id ===
    "fila_format"
  ) {
    const format =
      interaction.values?.[0];

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

      return;
    }

    const row =
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(
            `fila_mode|${format}`
          )
          .setPlaceholder(
            "2️⃣ Escolha a modalidade"
          )
          .addOptions(
            {
              label:
                "Mobile",
              value:
                "mobile",
              emoji:
                "📱",
            },
            {
              label:
                "Emulador",
              value:
                "emulador",
              emoji:
                "🖥️",
            },
            {
              label:
                "Misto",
              value:
                "misto",
              emoji:
                "🔀",
            }
          )
          .setMinValues(1)
          .setMaxValues(1)
      );

    await interaction.update({
      content:
        "### 🎮 Criar filas\n\n**1️⃣ Formato selecionado:** `" +
        format +
        "`\n\n**2️⃣ Escolha a modalidade:**",
      components: [
        row,
      ],
    });

    return;
  }

  /*
   * 2 — MODALIDADE
   */

  if (
    id.startsWith(
      "fila_mode|"
    )
  ) {
    const format =
      id.split("|")[1];

    const mode =
      interaction.values?.[0];

    if (
      !FORMATS.includes(
        format
      ) ||
      !MODES.includes(
        mode
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Formato ou modalidade inválida.",
          ephemeral: true,
        }
      );

      return;
    }

    const row =
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(
            `fila_channel|${format}|${mode}`
          )
          .setPlaceholder(
            "3️⃣ Escolha o canal das 12 filas"
          )
          .addChannelTypes(
            ChannelType.GuildText
          )
          .setMinValues(1)
          .setMaxValues(1)
      );

    await interaction.update({
      content:
        `### 🎮 Criar filas\n\n` +
        `**1️⃣ Formato:** \`${format}\`\n` +
        `**2️⃣ Modalidade:** ${modeLabel(
          mode
        )}\n\n` +
        `**3️⃣ Escolha o canal onde as 12 filas serão publicadas:**`,
      components: [
        row,
      ],
    });

    return;
  }
}

/*
 * ============================================
 * SELECT DE CANAL
 * ============================================
 */

async function handleChannelSelect(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  const id =
    interaction.customId;

  const channelId =
    interaction.values?.[0];

  if (!channelId) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Nenhum canal selecionado.",
        ephemeral: true,
      }
    );

    return;
  }

  /*
   * FLUXO DO /fila
   *
   * O canal escolhido passa diretamente
   * para publishQueues().
   */

  if (
    id.startsWith(
      "fila_channel|"
    )
  ) {
    const [
      ,
      format,
      mode,
    ] =
      id.split("|");

    try {
      /*
       * IMPORTANTE:
       * channelId é passado diretamente.
       *
       * Portanto não depende de:
       * analysisChannelMobile
       * analysisChannelEmulator
       * queueChannelId
       * mediatorQueueChannelId
       */

      await publishQueues(
        guild,
        format,
        mode,
        channelId
      );

      const config =
        getGuildConfig(
          guild.id
        );

      /*
       * Mantém também o canal configurado
       * para a modalidade correspondente.
       */

      if (
        mode === "mobile"
      ) {
        config.analysisChannelMobile =
          channelId;
      }

      if (
        mode === "emulador"
      ) {
        config.analysisChannelEmulator =
          channelId;
      }

      if (
        mode === "misto"
      ) {
        config.analysisChannelMobile =
          channelId;
        config.analysisChannelEmulator =
          channelId;
      }

      saveDatabase();

      await sendSafeReply(
        interaction,
        {
          content:
            `✅ **12 filas publicadas** em <#${channelId}>.`,
          ephemeral: true,
        }
      );
    } catch (error) {
      console.error(
        "Erro no /fila:",
        error
      );

      await sendSafeReply(
        interaction,
        {
          content:
            `❌ Não foi possível publicar as filas: ${error.message}`,
          ephemeral: true,
        }
      );
    }

    return;
  }

  await handleChannelConfig(
    interaction
  );
}

/*
 * ============================================
 * SELECT DE CARGO
 * ============================================
 */

async function handleRoleSelect(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  const roleId =
    interaction.values?.[0];

  if (!roleId) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Nenhum cargo selecionado.",
        ephemeral: true,
      }
    );

    return;
  }

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    interaction.customId ===
    "select_mediator_role"
  ) {
    config.mediatorRoleId =
      roleId;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Cargo Mediador configurado: <@&${roleId}>`,
        ephemeral: true,
      }
    );

    return;
  }

  if (
    interaction.customId ===
    "select_analyst_role"
  ) {
    config.analystRoleId =
      roleId;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Cargo Analista configurado: <@&${roleId}>`,
        ephemeral: true,
      }
    );

    return;
  }
}

/*
 * ============================================
 * ESCOLHA DE GELO
 * ============================================
 */

async function handleIceChoice(
  interaction
) {
  const parts =
    interaction.customId.split("|");

  /*
   * queue_join|1x1|mobile|100|ice_normal
   */

  const format =
    parts[1];

  const mode =
    parts[2];

  const value =
    Number(parts[3]);

  const iceChoice =
    parts[4];

  await joinQueue(
    interaction,
    format,
    mode,
    value,
    "normal",
    iceChoice
  );
}

/*
 * ============================================
 * CONFIRMAÇÃO/CANCELAMENTO LEGADOS
 * ============================================
 */

async function handleQueueConfirm(
  interaction
) {
  await sendSafeReply(
    interaction,
    {
      content:
        "✅ Operação confirmada.",
      ephemeral: true,
    }
  );
}

async function handleQueueCancel(
  interaction
) {
  await sendSafeReply(
    interaction,
    {
      content:
        "❌ Operação cancelada.",
      ephemeral: true,
    }
  );
}

/*
 * ============================================
 * MODAIS
 * ============================================
 */

async function handleModalSubmit(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  const id =
    interaction.customId;

  /*
   * ==========================================
   * TAXA
   * ==========================================
   */

  if (
    id ===
    "fee_modal"
  ) {
    const raw =
      interaction.fields
        .getTextInputValue(
          "fee_cents"
        )
        .trim();

    if (
      !/^\d+$/.test(
        raw
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Digite somente números inteiros em centavos.",
          ephemeral: true,
        }
      );

      return;
    }

    const cents =
      Number(raw);

    if (
      cents < 0 ||
      cents > 100000
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ A taxa deve estar entre 0 e 100000 centavos.",
          ephemeral: true,
        }
      );

      return;
    }

    const config =
      getGuildConfig(
        guild.id
      );

    config.admFee =
      cents;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Taxa do ADM definida para **${formatMoney(
            cents
          )}**.`,
        ephemeral: true,
      }
    );

    return;
  }

  /*
   * ==========================================
   * PIX — PRIMEIRO MODAL
   * ==========================================
   */

  if (
    id ===
    "pix_id_modal"
  ) {
    const userId =
      interaction.fields
        .getTextInputValue(
          "admin_user_id"
        )
        .trim();

    if (
      !/^\d{17,20}$/.test(
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

      return;
    }

    await interaction.showModal(
      createPixDataModal(
        userId
      )
    );

    return;
  }

  /*
   * ==========================================
   * PIX — SEGUNDO MODAL
   * ==========================================
   */

  if (
    id.startsWith(
      "admin_data_modal|"
    )
  ) {
    const userId =
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

    if (
      !name ||
      !key
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Nome e chave Pix são obrigatórios.",
          ephemeral: true,
        }
      );

      return;
    }

    addPixAdmin(
      guild.id,
      {
        userId,
        name,
        key,
        qr,
        addedBy:
          interaction.user.id,
      }
    );

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ ADM <@${userId}> cadastrado com sucesso.`,
        ephemeral: true,
      }
    );

    return;
  }

  /*
   * ==========================================
   * AVATAR
   * ==========================================
   */

  if (
    id ===
    "avatar_modal"
  ) {
    const url =
      interaction.fields
        .getTextInputValue(
          "avatar_url"
        )
        .trim();

    const config =
      getGuildConfig(
        guild.id
      );

    config.botAvatar =
      url;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ URL da foto do bot salva.",
        ephemeral: true,
      }
    );

    return;
  }

  /*
   * ==========================================
   * COR
   * ==========================================
   */

  if (
    id ===
    "color_modal"
  ) {
    const color =
      interaction.fields
        .getTextInputValue(
          "embed_color"
        )
        .trim();

    if (
      !/^#?[0-9A-Fa-f]{6}$/.test(
        color
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Cor inválida. Use, por exemplo, #5865F2.",
          ephemeral: true,
        }
      );

      return;
    }

    const config =
      getGuildConfig(
        guild.id
      );

    config.embedColor =
      normalizeColor(
        color
      );

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Cor definida para **${config.embedColor}**.`,
        ephemeral: true,
      }
    );

    return;
  }

  /*
   * ==========================================
   * MODAL PIX ANTIGO
   * ==========================================
   */

  if (
    id ===
    "pix_modal"
  ) {
    const name =
      interaction.fields
        .getTextInputValue(
          "pix_name"
        )
        .trim();

    const key =
      interaction.fields
        .getTextInputValue(
          "pix_key"
        )
        .trim();

    const qr =
      interaction.fields
        .getTextInputValue(
          "pix_qr"
        )
        .trim();

    addPixAdmin(
      guild.id,
      {
        userId:
          interaction.user.id,
        name,
        key,
        qr,
        addedBy:
          interaction.user.id,
      }
    );

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ ADM/Pix cadastrado.",
        ephemeral: true,
      }
    );

    return;
  }
}

/*
 * ============================================
 * BOTÃO PRINCIPAL DE CONFIGURAÇÃO
 * ============================================
 */

async function handleConfigButton(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  const id =
    interaction.customId;

  if (
    id ===
    "config_back"
  ) {
    await interaction.update({
      embeds: [
        configMainEmbed(
          guild
        ),
      ],
      components:
        configButtons(),
    });

    return;
  }

  if (
    id ===
    "config_roles"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🎭 CARGOS",
          "Configure os cargos utilizados pelo bot."
        ),
      ],
      components:
        roleConfigComponents(),
    });

    return;
  }

  if (
    id ===
    "config_channels"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "📢 CANAIS",
          "Configure os canais utilizados pelos sistemas do bot."
        ),
      ],
      components:
        channelConfigComponents(),
    });

    return;
  }

  if (
    id ===
    "config_bets"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🎲 APOSTAS",
          "Configure a categoria onde as apostas privadas serão criadas."
        ),
      ],
      components:
        betConfigComponents(),
    });

    return;
  }

  if (
    id ===
    "config_mediators"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🛡️ MEDIADORES",
          "Configure a fila de mediadores e os ADM/Pix."
        ),
      ],
      components:
        mediatorConfigComponents(),
    });

    return;
  }

  if (
    id ===
    "config_appearance"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🎨 APARÊNCIA",
          "Configure a aparência das mensagens."
        ),
      ],
      components:
        appearanceComponents(),
    });

    return;
  }

  if (
    id ===
    "config_fee"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "💸 TAXA",
          "Defina a taxa cobrada pelo ADM em centavos."
        ),
      ],
      components:
        feeComponents(),
    });

    return;
  }

  if (
    id ===
    "config_fee_set"
  ) {
    await interaction.showModal(
      createFeeModal()
    );

    return;
  }

  if (
    id ===
    "appearance_avatar"
  ) {
    await interaction.showModal(
      createAvatarModal()
    );

    return;
  }

  if (
    id ===
    "appearance_color"
  ) {
    await interaction.showModal(
      createColorModal()
    );

    return;
  }

  if (
    id ===
    "pix_add"
  ) {
    await interaction.showModal(
      createPixIdModal()
    );

    return;
  }

  if (
    id ===
    "pix_list"
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          `### 💳 ADM / PIX\n\n${getPixAdminListText(
            guild.id
          )}`,
        ephemeral: true,
      }
    );

    return;
  }

  if (
    id ===
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
            "✅ Fila de mediadores publicada/atualizada.",
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

    return;
  }

  /*
   * O botão config_queue NÃO EXISTE MAIS.
   *
   * Mesmo que alguma mensagem antiga ainda
   * possua esse customId, ele não abre nenhuma
   * configuração nova.
   */
}

/*
 * ============================================
 * /config
 * ============================================
 */

async function openConfig(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  await interaction.reply({
    embeds: [
      configMainEmbed(
        guild
      ),
    ],
    components:
      configButtons(),
    ephemeral: false,
  });
}

/*
 * ============================================
 * /fila
 * ============================================
 */

async function openFila(
  interaction
) {
  const row =
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          "fila_format"
        )
        .setPlaceholder(
          "1️⃣ Escolha o formato"
        )
        .addOptions(
          FORMATS.map(
            (format) => ({
              label:
                format,
              value:
                format,
              emoji:
                "🎮",
            })
          )
        )
        .setMinValues(1)
        .setMaxValues(1)
    );

  await interaction.reply({
    content:
      "### 🎮 CRIAR FILAS\n\n**1️⃣ Escolha o formato:**",
    components: [
      row,
    ],
    ephemeral: true,
  });
}

/*
 * ============================================
 * /med
 * ============================================
 */

async function openMed(
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

  /*
   * Se o canal ainda não estiver configurado,
   * o /med pede o canal.
   */

  if (
    !config.mediatorQueueChannelId
  ) {
    const row =
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(
            "select_mediator_channel"
          )
          .setPlaceholder(
            "Escolha o canal da fila de mediadores"
          )
          .addChannelTypes(
            ChannelType.GuildText
          )
          .setMinValues(1)
          .setMaxValues(1)
      );

    await interaction.reply({
      content:
        "### 🛡️ FILA DE MEDIADORES\n\nEscolha o canal onde a fila de mediadores será publicada.",
      components: [
        row,
      ],
      ephemeral: true,
    });

    return;
  }

  try {
    await publishMediatorQueue(
      guild
    );

    await interaction.reply({
      content:
        "✅ Fila de mediadores publicada/atualizada.",
      ephemeral: true,
    });
  } catch (error) {
    await interaction.reply({
      content:
        `❌ ${error.message}`,
      ephemeral: true,
    });
  }
}

/*
 * ============================================
 * COMANDOS SLASH
 * ============================================
 */

const commands = [
  new SlashCommandBuilder()
    .setName(
      "config"
    )
    .setDescription(
      "Abrir configuração do bot"
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName(
      "fila"
    )
    .setDescription(
      "Criar as 12 filas"
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName(
      "med"
    )
    .setDescription(
      "Publicar fila de mediadores"
    )
    .toJSON(),
];

/*
 * ============================================
 * PREFIXOS
 * ============================================
 */

async function handlePrefixCommand(
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
    (
      args.shift() ||
      ""
    ).toLowerCase();

  /*
   * .ping
   */

  if (
    command ===
    "ping"
  ) {
    await message.reply(
      `🏓 Pong! ${client.ws.ping}ms`
    );

    return;
  }

  /*
   * .config
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
      return;
    }

    await message.channel.send({
      embeds: [
        configMainEmbed(
          message.guild
        ),
      ],
      components:
        configButtons(),
    });

    return;
  }

  /*
   * .fila
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
      return;
    }

    await message.channel.send({
      content:
        "Use o comando **/fila** para criar as 12 filas.",
    });

    return;
  }

  /*
   * .ajuda
   */

  if (
    command ===
    "ajuda"
  ) {
    await message.reply({
      content:
        "### 📚 COMANDOS\n\n" +
        "`/config` — Configuração\n" +
        "`/fila` — Criar as 12 filas\n" +
        "`/med` — Publicar fila de mediadores",
    });

    return;
  }

  /*
   * Os demais comandos prefixados antigos
   * podem continuar sendo tratados aqui.
   */
}

/*
 * ============================================
 * INTERAÇÕES
 * ============================================
 */

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
          !isAdministrator(
            interaction.member
          )
        ) {
          await sendSafeReply(
            interaction,
            {
              content:
                "❌ Você precisa ser administrador para usar este comando.",
              ephemeral: true,
            }
          );

          return;
        }

        if (
          interaction.commandName ===
          "config"
        ) {
          await openConfig(
            interaction
          );

          return;
        }

        if (
          interaction.commandName ===
          "fila"
        ) {
          await openFila(
            interaction
          );

          return;
        }

        if (
          interaction.commandName ===
          "med"
        ) {
          await openMed(
            interaction
          );

          return;
        }

        return;
      }

      if (
        interaction.isStringSelectMenu()
      ) {
        await handleSelectMenu(
          interaction
        );

        return;
      }

      if (
        interaction.isChannelSelectMenu()
      ) {
        await handleChannelSelect(
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
        interaction.isModalSubmit()
      ) {
        await handleModalSubmit(
          interaction
        );

        return;
      }

      if (
        interaction.isButton()
      ) {
        const id =
          interaction.customId;

        /*
         * Fila de mediadores
         */

        if (
          id ===
            "mediator_queue_join" ||
          id ===
            "mediator_queue_leave"
        ) {
          await handleMediatorButton(
            interaction
          );

          return;
        }

        /*
         * Configuração
         */

        if (
          id.startsWith(
            "config_"
          ) ||
          id ===
            "pix_add" ||
          id ===
            "pix_list" ||
          id ===
            "publish_mediator_queue" ||
          id ===
            "appearance_avatar" ||
          id ===
            "appearance_color"
        ) {
          await handleConfigButton(
            interaction
          );

          return;
        }

        /*
         * Entrar em fila
         */

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

          const choice =
            parts[4] ||
            null;

          if (
            format ===
            "1x1"
          ) {
            if (
              choice ===
              "ice_normal" ||
              choice ===
              "ice_infinite"
            ) {
              await joinQueue(
                interaction,
                format,
                mode,
                value,
                "normal",
                choice
              );

              return;
            }
          }

          await joinQueue(
            interaction,
            format,
            mode,
            value,
            "normal",
            null
          );

          return;
        }

        /*
         * Sair da fila
         */

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

          const type =
            parts[4] ||
            "normal";

          await leaveQueue(
            interaction,
            format,
            mode,
            value,
            type
          );

          return;
        }

        /*
         * Botões de aposta
         */

        if (
          id.startsWith(
            "bet_"
          )
        ) {
          await handleBetButton(
            interaction
          );

          return;
        }

        /*
         * Confirmações antigas
         */

        if (
          id ===
          "queue_confirm"
        ) {
          await handleQueueConfirm(
            interaction
          );

          return;
        }

        if (
          id ===
          "queue_cancel"
        ) {
          await handleQueueCancel(
            interaction
          );

          return;
        }

        /*
         * Escolha direta de gelo,
         * caso alguma mensagem antiga
         * ainda tenha esse customId.
         */

        if (
          id ===
            "queue_ice_normal" ||
          id ===
            "queue_ice_infinite"
        ) {
          const choice =
            id ===
            "queue_ice_infinite"
              ? "ice_infinite"
              : "ice_normal";

          await sendSafeReply(
            interaction,
            {
              content:
                `🧊 Você selecionou **${
                  choice ===
                  "ice_infinite"
                    ? "Gelo Infinito"
                    : "Gelo Normal"
                }**.`,
              ephemeral: true,
            }
          );

          return;
        }
      }
    } catch (error) {
      console.error(
        "Erro na interação:",
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

/*
 * ============================================
 * MENSAGENS
 * ============================================
 */

client.on(
  Events.MessageCreate,
  async (
    message
  ) => {
    try {
      await handlePrefixCommand(
        message
      );
    } catch (error) {
      console.error(
        "Erro no comando prefixado:",
        error
      );
    }
  }
);

/*
 * ============================================
 * READY
 * ============================================
 */

client.once(
  Events.ClientReady,
  async (
    readyClient
  ) => {
    console.log(
      `✅ Bot conectado como ${readyClient.user.tag}`
    );

    const rest =
      new REST({
        version: "10",
      }).setToken(
        TOKEN
      );

    try {
      /*
       * Remove comandos globais antigos.
       *
       * Isso evita que comandos antigos
       * continuem aparecendo.
       */

      await rest.put(
        Routes.applicationCommands(
          CLIENT_ID
        ),
        {
          body: [],
        }
      );

      /*
       * Sobrescreve os comandos do servidor.
       *
       * SOMENTE:
       *
       * /config
       * /fila
       * /med
       */

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
        "✅ Comandos registrados: /config /fila /med"
      );
    } catch (error) {
      console.error(
        "❌ Erro ao registrar comandos:",
        error
      );
    }
  }
);

/*
 * ============================================
 * LOGIN
 * ============================================
 */

client.login(
  TOKEN
);
