// ============================================================
// INDEX.JS
// ============================================================

require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");

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
  StringSelectMenuOptionBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  REST,
  Routes,
} = require("discord.js");

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const TOKEN =
  process.env.DISCORD_TOKEN ||
  process.env.TOKEN;

const CLIENT_ID =
  process.env.CLIENT_ID ||
  process.env.CLIENTID;

const GUILD_ID =
  process.env.GUILD_ID ||
  process.env.GUILDID;

if (!TOKEN) {
  console.error(
    "❌ DISCORD_TOKEN/TOKEN não configurado no .env."
  );
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error(
    "❌ CLIENT_ID não configurado no .env."
  );
  process.exit(1);
}

if (!GUILD_ID) {
  console.error(
    "❌ GUILD_ID não configurado no .env."
  );
  process.exit(1);
}

// ============================================================
// BANCO DE DADOS
// ============================================================

const DATA_DIR = path.join(
  process.cwd(),
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
  matches: {},
  queues: {},
  mediatorQueue: [],
  mediatorCursor: 0,
  analysisRequests: [],
};

function cloneDefaultDB() {
  return JSON.parse(
    JSON.stringify(DEFAULT_DB)
  );
}

function loadDB() {
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

      matches:
        parsed.matches || {},

      queues:
        parsed.queues || {},

      mediatorQueue:
        Array.isArray(
          parsed.mediatorQueue
        )
          ? parsed.mediatorQueue
          : [],

      mediatorCursor:
        Number.isInteger(
          parsed.mediatorCursor
        )
          ? parsed.mediatorCursor
          : 0,

      analysisRequests:
        Array.isArray(
          parsed.analysisRequests
        )
          ? parsed.analysisRequests
          : [],
    };
  } catch (error) {
    console.error(
      "❌ Erro ao carregar database.json:",
      error
    );

    return cloneDefaultDB();
  }
}

let db = loadDB();

let saveTimer = null;

function saveDB() {
  clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    try {
      const tempFile =
        `${DB_FILE}.tmp`;

      fs.writeFileSync(
        tempFile,
        JSON.stringify(
          db,
          null,
          2
        ),
        "utf8"
      );

      fs.renameSync(
        tempFile,
        DB_FILE
      );
    } catch (error) {
      console.error(
        "❌ Erro ao salvar banco de dados:",
        error
      );
    }
  }, 150);
}

// ============================================================
// CONFIGURAÇÃO DO SERVIDOR
// ============================================================

function guildConfig(
  guildId
) {
  if (!guildId) {
    return null;
  }

  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      mediatorRoleId: null,
      analystRoleId: null,

      ssMobChannelId: null,
      ssEmuChannelId: null,

      betsCategoryId: null,

      mediatorQueueChannelId:
        null,

      mediatorQueueMessageId:
        null,

      mediatorQueue: [],

      mediatorRotationIndex: 0,

      embedColor:
        "#000000",

      botAvatar:
        null,

      admFeeCents: 1,

      pixAdmins: [],

      publishedQueueMessages: [],

      queueMessages: {},
    };

    saveDB();
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
    !Number.isInteger(
      config.mediatorRotationIndex
    )
  ) {
    config.mediatorRotationIndex = 0;
  }

  if (
    !config.embedColor
  ) {
    config.embedColor =
      "#000000";
  }

  if (
    !Number.isFinite(
      Number(
        config.admFeeCents
      )
    )
  ) {
    config.admFeeCents = 1;
  }

  if (
    !config.queueMessages ||
    typeof config.queueMessages !==
      "object"
  ) {
    config.queueMessages = {};
  }

  if (
    !Array.isArray(
      config.publishedQueueMessages
    )
  ) {
    config.publishedQueueMessages =
      [];
  }

  return config;
}

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

const FORMATS = [
  "1x1",
  "2x2",
  "3x3",
  "4x4",
];

const MODES = [
  "Mobile",
  "Emulador",
  "Misto",
];

const PREFIX = ".";

// ============================================================
// CLIENT DISCORD
// ============================================================

const client =
  new Client({
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

// ============================================================
// UTILITÁRIOS
// ============================================================

function money(
  cents
) {
  const value =
    Number(cents);

  if (
    !Number.isFinite(value)
  ) {
    return "R$ 0,00";
  }

  return `R$ ${(value / 100)
    .toFixed(2)
    .replace(".", ",")}`;
}

function formatMoney(
  cents
) {
  return money(cents);
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

function generateId(
  prefix = "id"
) {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
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

function colorOf(
  config,
  fallback = 0x000000
) {
  const raw =
    normalizeColor(
      config?.embedColor
    ).replace("#", "");

  const number =
    Number.parseInt(
      raw,
      16
    );

  return Number.isFinite(
    number
  )
    ? number
    : fallback;
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

// ============================================================
// USUÁRIOS
// ============================================================

function userData(
  userId
) {
  if (!db.users[userId]) {
    db.users[userId] = {
      wins: 0,
      losses: 0,
      woWins: 0,
      coins: 0,
      normalMatches: 0,
    };

    saveDB();
  }

  const user =
    db.users[userId];

  if (
    !Number.isFinite(
      Number(user.wins)
    )
  ) {
    user.wins = 0;
  }

  if (
    !Number.isFinite(
      Number(user.losses)
    )
  ) {
    user.losses = 0;
  }

  if (
    !Number.isFinite(
      Number(user.woWins)
    )
  ) {
    user.woWins = 0;
  }

  if (
    !Number.isFinite(
      Number(user.coins)
    )
  ) {
    user.coins = 0;
  }

  if (
    !Number.isFinite(
      Number(user.normalMatches)
    )
  ) {
    user.normalMatches = 0;
  }

  return user;
}

// ============================================================
// PERMISSÕES
// ============================================================

function isOwner(
  interaction
) {
  return Boolean(
    interaction.guild &&
    interaction.guild.ownerId ===
      interaction.user.id
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

function hasRole(
  interaction,
  roleId
) {
  return Boolean(
    roleId &&
      interaction.member?.roles?.cache?.has(
        roleId
      )
  );
}

function hasMediatorRole(
  member,
  guildId
) {
  const config =
    guildConfig(
      guildId
    );

  if (
    !config?.mediatorRoleId
  ) {
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
    guildConfig(
      guildId
    );

  if (
    !config?.analystRoleId
  ) {
    return false;
  }

  return Boolean(
    member?.roles?.cache?.has(
      config.analystRoleId
    )
  );
}

function isMediator(
  interaction
) {
  return hasMediatorRole(
    interaction.member,
    interaction.guildId
  );
}

function isAnalyst(
  interaction
) {
  return hasAnalystRole(
    interaction.member,
    interaction.guildId
  );
}

// ============================================================
// RESPOSTAS SEGURAS
// ============================================================

async function replySafe(
  interaction,
  payload
) {
  try {
    if (
      interaction.replied
    ) {
      return await interaction.followUp(
        payload
      );
    }

    if (
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
      "❌ Erro ao responder interação:",
      error
    );

    return null;
  }
}

async function ephemeral(
  interaction,
  content
) {
  return replySafe(
    interaction,
    {
      content,
      flags:
        MessageFlags.Ephemeral,
    }
  );
}

// ============================================================
// EMBEDS
// ============================================================

function createEmbed(
  guildId,
  title,
  description = ""
) {
  const config =
    guildConfig(
      guildId
    );

  return new EmbedBuilder()
    .setColor(
      colorOf(config)
    )
    .setTitle(
      title
    )
    .setDescription(
      description
    )
    .setTimestamp();
}

function createSmallEmbed(
  guildId,
  title,
  description = ""
) {
  return createEmbed(
    guildId,
    title,
    description
  );
}

// ============================================================
// TAMANHO DAS EQUIPES
// ============================================================

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
  return (
    teamSize(format) * 2
  );
}

// ============================================================
// CHAVES DAS FILAS
// ============================================================

function makeQueueKey(
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  /*
   * 1x1:
   * Gelo normal e gelo infinito
   * utilizam a mesma fila.
   */
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

  saveDB();
}

// ============================================================
// MODALIDADE
// ============================================================

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

  if (
    mode === "Mobile"
  ) {
    return "📱 Mobile";
  }

  if (
    mode === "Emulador"
  ) {
    return "🖥️ Emulador";
  }

  if (
    mode === "Misto"
  ) {
    return "🔀 Misto";
  }

  return String(mode);
}

// ============================================================
// EMBED DA FILA
// ============================================================

function queueEmbed(
  cfg,
  format,
  mode,
  cents,
  kind = "normal"
) {
  const guildId =
    cfg?.guildId ||
    null;

  const description =
    format === "1x1"
      ? (
          kind === "infinite"
            ? "Fila infinita: entre e aguarde seu adversário."
            : "Fila normal: entre e aguarde seu adversário."
        )
      : "Entre na fila e aguarde os jogadores necessários.";

  const queueGuildId =
    guildId ||
    cfg?.id ||
    null;

  const embed =
    new EmbedBuilder()
      .setColor(
        colorOf(cfg)
      )
      .setTitle(
        `🎮 ${format} • ${mode} • ${money(cents)}`
      )
      .setDescription(
        description
      )
      .setFooter({
        text:
          "Valor predefinido pelo sistema",
      });

  /*
   * Não depende de guildId para funcionar.
   * O contador é atualizado posteriormente.
   */
  return embed;
}

// ============================================================
// COMPONENTES DAS FILAS
// ============================================================

function queueComponents(
  format,
  mode,
  cents,
  kind = "normal"
) {
  if (
    format === "1x1"
  ) {
    return [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              `queue_join|${format}|${mode}|${cents}|ice_normal`
            )
            .setLabel(
              "Gelo normal"
            )
            .setEmoji("🧊")
            .setStyle(
              ButtonStyle.Primary
            ),

          new ButtonBuilder()
            .setCustomId(
              `queue_join|${format}|${mode}|${cents}|ice_infinite`
            )
            .setLabel(
              "Gelo infinito"
            )
            .setEmoji("♾️")
            .setStyle(
              ButtonStyle.Success
            ),

          new ButtonBuilder()
            .setCustomId(
              `queue_leave|${format}|${mode}|${cents}|all`
            )
            .setLabel(
              "Sair da fila"
            )
            .setEmoji("🚪")
            .setStyle(
              ButtonStyle.Danger
            )
        ),
    ];
  }

  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `queue_join|${format}|${mode}|${cents}|${kind}`
          )
          .setLabel(
            "Entrar na fila"
          )
          .setEmoji("🎮")
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            `queue_leave|${format}|${mode}|${cents}|${kind}`
          )
          .setLabel(
            "Sair da fila"
          )
          .setEmoji("🚪")
          .setStyle(
            ButtonStyle.Danger
          )
      ),
  ];
}

// ============================================================
// EMBED DA CONFIGURAÇÃO
// ============================================================

function mainConfigEmbed(
  guild
) {
  const cfg =
    guildConfig(
      guild.id
    );

  const role = id =>
    id
      ? `<@&${id}>`
      : "Não configurado";

  const channel = id =>
    id
      ? `<#${id}>`
      : "Não configurado";

  const pix =
    cfg.pixAdmins.length
      ? cfg.pixAdmins
          .map(
            (item, index) =>
              `${index + 1}. ${
                item.name ||
                "ADM"
              }`
          )
          .join("\n")
      : "Nenhum ADM";

  return new EmbedBuilder()
    .setColor(
      colorOf(cfg)
    )
    .setTitle(
      "⚙️ Configuração do bot"
    )
    .setDescription(
      "Use os botões abaixo para configurar cada parte do sistema."
    )
    .addFields(
      {
        name: "🎭 Cargos",
        value:
          `Mediador: ${role(
            cfg.mediatorRoleId
          )}\n` +
          `Analista: ${role(
            cfg.analystRoleId
          )}`,
      },

      {
        name: "💰 Pix",
        value: pix,
      },

      {
        name: "📢 Canais",
        value:
          `Canal Mobile: ${channel(
            cfg.ssMobChannelId
          )}\n` +
          `Canal Emulador: ${channel(
            cfg.ssEmuChannelId
          )}`,
      },

      {
        name: "🎲 Apostas",
        value:
          channel(
            cfg.betsCategoryId
          ),
      },

      {
        name:
          "🛡️ Fila de Mediadores",
        value:
          channel(
            cfg.mediatorQueueChannelId
          ),
      },

      {
        name:
          "💸 Taxa ADM",
        value:
          money(
            cfg.admFeeCents
          ),
      },

      {
        name:
          "🎨 Aparência",
        value:
          `Cor: ${
            cfg.embedColor ||
            "#000000"
          }\n` +
          `Avatar: ${
            cfg.botAvatar
              ? "Configurado"
              : "Padrão"
          }`,
      }
    );
}

// ============================================================
// BOTÕES DE CONFIGURAÇÃO
// ============================================================

function configComponents() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "conf_roles"
          )
          .setLabel(
            "Cargos"
          )
          .setEmoji("🎭")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "conf_pix"
          )
          .setLabel(
            "Pix"
          )
          .setEmoji("💰")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "conf_channels"
          )
          .setLabel(
            "Canais"
          )
          .setEmoji("📢")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "conf_bets"
          )
          .setLabel(
            "Apostas"
          )
          .setEmoji("🎲")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "conf_mediators"
          )
          .setLabel(
            "Mediadores"
          )
          .setEmoji("🛡️")
          .setStyle(
            ButtonStyle.Secondary
          )
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "conf_appearance"
          )
          .setLabel(
            "Aparência"
          )
          .setEmoji("🎨")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "conf_fee"
          )
          .setLabel(
            "Taxa ADM"
          )
          .setEmoji("💸")
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];
}

// ============================================================
// CONFIGURAÇÃO DE CARGOS
// ============================================================

function rolesComponents() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(
            "conf_role_mediator"
          )
          .setPlaceholder(
            "Selecionar cargo Mediador"
          )
          .setMinValues(1)
          .setMaxValues(1)
      ),

    new ActionRowBuilder()
      .addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(
            "conf_role_analyst"
          )
          .setPlaceholder(
            "Selecionar cargo Analista"
          )
          .setMinValues(1)
          .setMaxValues(1)
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "conf_back"
          )
          .setLabel(
            "Voltar"
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

function channelsComponents() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(
            "conf_channel_ssmob"
          )
          .setPlaceholder(
            "Selecionar Canal Mobile"
          )
          .setChannelTypes(
            ChannelType.GuildText
          )
          .setMinValues(1)
          .setMaxValues(1)
      ),

    new ActionRowBuilder()
      .addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(
            "conf_channel_ssemu"
          )
          .setPlaceholder(
            "Selecionar Canal Emulador"
          )
          .setChannelTypes(
            ChannelType.GuildText
          )
          .setMinValues(1)
          .setMaxValues(1)
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "conf_back"
          )
          .setLabel(
            "Voltar"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];
}

// ============================================================
// CONFIGURAÇÃO DA CATEGORIA DE APOSTAS
// ============================================================

function betsComponents() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(
            "conf_bets_category"
          )
          .setPlaceholder(
            "Selecionar categoria das apostas"
          )
          .setChannelTypes(
            ChannelType.GuildCategory
          )
          .setMinValues(1)
          .setMaxValues(1)
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "conf_back"
          )
          .setLabel(
            "Voltar"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];
}

// ============================================================
// CONFIGURAÇÃO DA FILA DE MEDIADORES
// ============================================================

function mediatorConfigComponents() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(
            "conf_mediator_channel"
          )
          .setPlaceholder(
            "Selecionar canal da fila de mediadores"
          )
          .setChannelTypes(
            ChannelType.GuildText
          )
          .setMinValues(1)
          .setMaxValues(1)
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "conf_back"
          )
          .setLabel(
            "Voltar"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];
}

// ============================================================
// APARÊNCIA
// ============================================================

function appearanceComponents() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "conf_avatar"
          )
          .setLabel(
            "Foto do bot"
          )
          .setEmoji("🖼️")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "conf_color"
          )
          .setLabel(
            "Cor da embed"
          )
          .setEmoji("🎨")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "conf_back"
          )
          .setLabel(
            "Voltar"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];
}

// ============================================================
// TAXA ADM
// ============================================================

function feeComponents() {
  const options =
    Array.from(
      {
        length: 50,
      },
      (_, index) => {
        const cents =
          index + 1;

        return {
          label:
            money(cents),
          value:
            String(cents),
          description:
            `Taxa do ADM: ${money(
              cents
            )}`,
        };
      }
    );

  return [
    new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(
            "conf_fee_select"
          )
          .setPlaceholder(
            "Selecionar taxa do ADM"
          )
          .addOptions(
            options
          )
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "conf_back"
          )
          .setLabel(
            "Voltar"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];
}

// ============================================================
// PIX
// ============================================================

function pixComponents() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "pix_add"
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
            "pix_list"
          )
          .setLabel(
            "Ver ADMs"
          )
          .setEmoji("📋")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "pix_back"
          )
          .setLabel(
            "Voltar"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];
}

// ============================================================
// FIM DA PARTE 1
// ============================================================```js
function queueEmbed(guild, mode, format, cents, rule, players = []) {
  const g = guildData(guild.id);
  const m = MODES[mode];

  const ruleText =
    format === '1x1'
      ? (
          rule === 'infinite'
            ? '♾️ Gelo infinito'
            : rule === 'normal'
              ? '🧊 Gelo normal'
              : '🎮 Escolha o modo nos botões abaixo'
        )
      : '🎮 Normal';

  const p = players.length
    ? players
        .map((x, i) => `${i + 1}. ${mention(x)}`)
        .join('\n')
    : '🟢 Aguardando jogadores...';

  return new EmbedBuilder()
    .setColor(safeColor(g.embedColor))
    .setTitle(`💎 ${money(cents)} • ${format}`)
    .setDescription(
      `${m.emoji} **${m.label}**

🎯 **Formato:** ${format}
⚙️ **Modo:** ${ruleText}
💰 **Entrada:** ${money(cents)}

👥 **JOGADORES**
${p}

📊 **Vagas:** ${players.length}/2

━━━━━━━━━━━━━━━━━━
⚡ **ENTRE NA FILA E AGUARDE O ADVERSÁRIO**
━━━━━━━━━━━━━━━━━━`
    )
    .setFooter({
      text: '🎮 Sistema de Apostas'
    });
}

function queueButtons(
  mode,
  format,
  cents,
  rule = 'normal'
) {
  if (format === '1x1') {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          qid(
            'join',
            mode,
            format,
            cents,
            'infinite'
          )
        )
        .setLabel('Gelo infinito')
        .setEmoji('♾️')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(
          qid(
            'join',
            mode,
            format,
            cents,
            'normal'
          )
        )
        .setLabel('Gelo normal')
        .setEmoji('🧊')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          qid(
            'leave',
            mode,
            format,
            cents,
            'all'
          )
        )
        .setLabel('Sair da fila')
        .setEmoji('🚪')
        .setStyle(ButtonStyle.Danger)
    );
  }

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        qid(
          'join',
          mode,
          format,
          cents,
          'normal'
        )
      )
      .setLabel('Entrar na fila')
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(
        qid(
          'leave',
          mode,
          format,
          cents,
          'normal'
        )
      )
      .setLabel('Sair da fila')
      .setEmoji('🚪')
      .setStyle(ButtonStyle.Danger)
  );
}

function queuePayload(
  guild,
  mode,
  format,
  cents,
  rule,
  players
) {
  return {
    embeds: [
      queueEmbed(
        guild,
        mode,
        format,
        cents,
        rule,
        players
      )
    ],
    components: [
      queueButtons(
        mode,
        format,
        cents,
        rule
      )
    ]
  };
}

function matchByChannel(channelId) {
  return Object.values(db.matches).find(
    (m) =>
      m.channelId === channelId &&
      !m.finalized
  );
}

function activeMatchForUser(userId) {
  return Object.values(db.matches).find(
    (m) =>
      !m.finalized &&
      Array.isArray(m.players) &&
      m.players.includes(userId)
  );
}

function matchById(id) {
  return db.matches[id] || null;
}

function confirmEmbed(guild, m) {
  const g = guildData(guild.id);
  const mode = MODES[m.mode];

  return new EmbedBuilder()
    .setColor(
      safeColor(g.embedColor)
    )
    .setTitle(
      '🎮 Partida iniciada ✅'
    )
    .setDescription(
      `**Partida:** ${m.id}
**Modo:** ${mode.emoji} ${mode.label}
**Formato:** ${m.format}
**Valor:** ${money(m.cents)} por jogador

👤 **Jogador 1:** ${mention(m.players[0])}
👤 **Jogador 2:** ${mention(m.players[1])}

━━━━━━━━━━━━━━━━━━
Confirme sua participação. Quando os dois confirmarem, o Pix do ADM responsável será exibido para o pagamento.

⚠️ Se alguém cancelar, a aposta será encerrada.`
    )
    .setFooter({
      text: '🎮 Sistema de Apostas'
    });
}

function confirmButtons(m) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        mid('confirm', m.id)
      )
      .setLabel('Confirmar')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(
        mid('cancel', m.id)
      )
      .setLabel('Cancelar')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
  );
}

function pixEmbed(guild, m) {
  const g = guildData(guild.id);
  const p = g.pix[m.mediatorId];

  return new EmbedBuilder()
    .setColor(
      safeColor(g.embedColor)
    )
    .setTitle(
      '💳 PAGAMENTO PARA INICIAR'
    )
    .setDescription(
      `Os dois jogadores confirmaram a aposta.

👤 **ADM responsável:** ${
        p?.name ||
        mention(m.mediatorId)
      }
💰 **Valor por jogador:** ${money(m.cents)}
💵 **Total da aposta:** ${money(m.cents * 2)}

🔑 **Chave Pix:**
\`${p?.key || 'Não cadastrada'}\`

📷 **QR Code:** ${
        p?.qrUrl
          ? 'enviado abaixo.'
          : 'não cadastrado.'
      }

📌 Após o pagamento, aguarde o Mediador/ADM criar a sala.`
    )
    .setFooter({
      text: '🎮 Sistema de Apostas'
    });
}

async function sendPix(
  guild,
  channel,
  m
) {
  const g = guildData(guild.id);
  const p = g.pix[m.mediatorId];

  if (
    !p ||
    !p.name ||
    !p.key
  ) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#ED4245')
          .setTitle(
            '⚠️ Pix do ADM não cadastrado'
          )
          .setDescription(
            'O ADM responsável ainda não possui nome e chave Pix cadastrados. Configure em **/config → Pix ADM**.'
          )
      ]
    });

    return;
  }

  await channel.send({
    embeds: [
      pixEmbed(guild, m)
    ]
  });

  if (p.qrUrl) {
    await channel
      .send({
        content:
          '📷 **QR Code do Pix:**',
        files: [
          p.qrUrl
        ]
      })
      .catch(() =>
        channel.send(
          `📷 **QR Code:** ${p.qrUrl}`
        )
      );
  }
}

function mediatorPanel(guild) {
  const g = guildData(guild.id);
  const ids =
    activeMediatorIds(guild);

  const list = ids.length
    ? ids
        .map(
          (id, i) =>
            `${i + 1}. ${mention(id)}`
        )
        .join('\n')
    : '🔴 Nenhum mediador está na fila.';

  return new EmbedBuilder()
    .setColor(
      safeColor(g.embedColor)
    )
    .setTitle(
      '🛡️ FILA DE MEDIADORES'
    )
    .setDescription(
      `Somente membros com o cargo **Mediador** configurado podem entrar. A distribuição das apostas é feita em **loop**, seguindo a ordem da fila.

👥 **Mediadores na fila:**
${list}

📊 **Total:** ${ids.length}`
    )
    .setFooter({
      text: '🎮 Sistema de Apostas'
    });
}

function mediatorPanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('medq:join')
      .setLabel('Entrar na fila')
      .setEmoji('🟢')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('medq:leave')
      .setLabel('Sair da fila')
      .setEmoji('🔴')
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId('medq:refresh')
      .setLabel('Atualizar')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
  );
}

function resultButtons(m) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        mid('winner', m.id)
      )
      .setLabel('Escolher vencedor')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(
        mid('wo', m.id)
      )
      .setLabel('Vitória por W.O.')
      .setEmoji('⚡')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(
        mid('finish', m.id)
      )
      .setLabel('Finalizar aposta')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );
}

function playerSelect(
  m,
  action
) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        mid(action, m.id)
      )
      .setPlaceholder(
        'Selecione o jogador'
      )
      .addOptions(
        m.players.map(
          (id, i) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(
                `Jogador ${i + 1}`
              )
              .setDescription(id)
              .setValue(id)
        )
      )
  );
}

async function createMatch(
  guild,
  queueChannel,
  mode,
  format,
  cents,
  rule,
  players
) {
  const mediatorId =
    nextMediator(guild);

  if (!mediatorId) {
    return {
      error:
        'Sem mediadores disponíveis no momento.'
    };
  }

  const mediator =
    await guild.members
      .fetch(mediatorId)
      .catch(() => null);

  if (!mediator) {
    return {
      error:
        'Sem mediadores disponíveis no momento.'
    };
  }

  const id =
    makeMatchId(guild.id);

  const overwrites = [
    {
      id:
        guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel
      ]
    },

    ...players.map(
      (uid) => ({
        id: uid,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      })
    ),

    {
      id: mediator.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    }
  ];

  const ch =
    await guild.channels.create({
      name: `partida-${id}`,
      type: ChannelType.GuildText,
      parent:
        queueChannel.parentId ||
        undefined,
      permissionOverwrites:
        overwrites,
      topic:
        `Partida ${id} | ${format} | ${MODES[mode].label} | ${money(cents)}`
    });

  const m = {
    id,
    guildId: guild.id,
    channelId: ch.id,
    queueChannelId:
      queueChannel.id,
    mode,
    format,
    cents,
    rule,
    players,
    mediatorId,
    confirmed: [],
    finalized: false,
    resultType: null,
    winnerId: null,
    roomCreated: false,
    roomId: null,
    roomPassword: null,
    createdAt: Date.now()
  };

  db.matches[id] = m;
  saveData();

  await ch.send({
    content:
      `${players.map(mention).join(' • ')}
🛡️ **Mediador:** ${mention(mediatorId)}`,
    embeds: [
      confirmEmbed(
        guild,
        m
      )
    ],
    components: [
      confirmButtons(m)
    ]
  });

  return {
    match: m,
    channel: ch
  };
}

async function updateQueueMessage(
  guild,
  state,
  mode,
  format,
  cents,
  rule
) {
  const ch =
    guild.channels.cache.get(
      state.channelId
    );

  if (!ch) {
    return;
  }

  const msg =
    await ch.messages
      .fetch(state.messageId)
      .catch(() => null);

  if (msg) {
    await msg.edit(
      queuePayload(
        guild,
        mode,
        format,
        cents,
        rule,
        state.players
      )
    );
  }
}

async function handleQueue(
  interaction
) {
  const [
    ,
    action,
    mode,
    format,
    centsRaw,
    rule
  ] =
    interaction.customId.split(':');

  const cents =
    Number(centsRaw);

  if (
    !MODES[mode] ||
    !FORMATS.includes(format) ||
    !Number.isFinite(cents)
  ) {
    return interaction.reply({
      content:
        '⚠️ Fila inválida.',
      ephemeral: true
    });
  }

  const g =
    guildData(
      interaction.guildId
    );

  const key =
    queueKey(
      mode,
      format,
      cents,
      format === '1x1'
        ? 'all'
        : 'normal'
    );

  if (!g.queues[key]) {
    g.queues[key] = {
      players: [],
      rule: null,
      channelId:
        interaction.channelId,
      messageId:
        interaction.message.id
    };
  }

  const state =
    g.queues[key];

  state.channelId =
    interaction.channelId;

  state.messageId =
    interaction.message.id;

  if (
    !Array.isArray(
      state.players
    )
  ) {
    state.players = [];
  }

  if (
    format === '1x1' &&
    !state.rule
  ) {
    state.rule = null;
  }

  if (action === 'leave') {
    await interaction.deferUpdate();

    const idx =
      state.players.indexOf(
        interaction.user.id
      );

    if (idx >= 0) {
      state.players.splice(
        idx,
        1
      );
    }

    if (
      format === '1x1' &&
      state.players.length === 0
    ) {
      state.rule = null;
    }

    saveData();

    return updateQueueMessage(
      interaction.guild,
      state,
      mode,
      format,
      cents,
      format === '1x1'
        ? (
            state.rule ||
            'choice'
          )
        : 'normal'
    );
  }

  if (
    !activeMediatorIds(
      interaction.guild
    ).length
  ) {
    return interaction.reply({
      content:
        '⚠️ **Sem mediadores disponíveis no momento.**',
      ephemeral: true
    });
  }

  if (
    state.players.includes(
      interaction.user.id
    )
  ) {
    return interaction.reply({
      content:
        '⚠️ Você já está nesta fila.',
      ephemeral: true
    });
  }

  if (
    format === '1x1' &&
    state.rule &&
    state.rule !== rule
  ) {
    const nome =
      state.rule === 'infinite'
        ? 'Gelo infinito'
        : 'Gelo normal';

    return interaction.reply({
      content:
        `⚠️ Esta fila já foi iniciada em **${nome}**. Entre pelo mesmo botão para enfrentar o adversário.`,
      ephemeral: true
    });
  }

  const other =
    activeMatchForUser(
      interaction.user.id
    );

  if (other) {
    return interaction.reply({
      content:
        '⚠️ Você já está em uma aposta ativa.',
      ephemeral: true
    });
  }

  if (
    state.players.length >= 2
  ) {
    return interaction.reply({
      content:
        '⚠️ Esta fila já está cheia.',
      ephemeral: true
    });
  }

  if (
    format === '1x1' &&
    !state.rule
  ) {
    state.rule = rule;
  }

  state.players.push(
    interaction.user.id
  );

  saveData();

  if (
    state.players.length < 2
  ) {
    await interaction.update(
      queuePayload(
        interaction.guild,
        mode,
        format,
        cents,
        format === '1x1'
          ? (
              state.rule ||
              'choice'
            )
          : 'normal',
        state.players
      )
    );

    return;
  }

  const players =
    [...state.players];

  // Guarda a regra ANTES de limpar o estado.
  const matchRule =
    format === '1x1'
      ? (
          state.rule ||
          rule
        )
      : 'normal';

  state.players = [];
  state.rule = null;

  saveData();

  const result =
    await createMatch(
      interaction.guild,
      interaction.channel,
      mode,
      format,
      cents,
      matchRule,
      players
    );

  if (result.error) {
    state.players = players;

    if (
      format === '1x1'
    ) {
      state.rule =
        matchRule;
    }

    saveData();

    await interaction.update(
      queuePayload(
        interaction.guild,
        mode,
        format,
        cents,
        format === '1x1'
          ? (
              state.rule ||
              'choice'
            )
          : 'normal',
        state.players
      )
    );

    return;
  }

  await interaction.update(
    queuePayload(
      interaction.guild,
      mode,
      format,
      cents,
      format === '1x1'
        ? 'choice'
        : 'normal',
      state.players
    )
  );
}

async function cancelMatch(
  guild,
  m
) {
  if (m.finalized) {
    return;
  }

  m.finalized = true;

  saveData();

  const ch =
    guild.channels.cache.get(
      m.channelId
    );

  if (ch) {
    await ch.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#ED4245')
          .setTitle(
            '❌ Aposta cancelada'
          )
          .setDescription(
            'A aposta foi cancelada. O canal será deletado em **15 segundos**.'
          )
      ]
    }).catch(() => {});

    setTimeout(
      () =>
        ch.delete().catch(
          () => {}
        ),
      15000
    );
  }
}
```
```js
// ============================================================
// CONFIRMAÇÃO DA APOSTA
// ============================================================

async function handleMatchConfirm(
  interaction
) {
  const parts =
    String(
      interaction.customId || ""
    ).split(":");

  const matchId =
    parts[2];

  const match =
    matchById(matchId);

  if (!match) {
    return interaction.reply({
      content:
        "⚠️ Essa aposta não existe mais.",
      ephemeral: true
    });
  }

  if (match.finalized) {
    return interaction.reply({
      content:
        "⚠️ Essa aposta já foi finalizada.",
      ephemeral: true
    });
  }

  if (
    !Array.isArray(
      match.players
    ) ||
    !match.players.includes(
      interaction.user.id
    )
  ) {
    return interaction.reply({
      content:
        "❌ Você não participa desta aposta.",
      ephemeral: true
    });
  }

  if (
    match.confirmed.includes(
      interaction.user.id
    )
  ) {
    return interaction.reply({
      content:
        "⚠️ Você já confirmou sua participação.",
      ephemeral: true
    });
  }

  match.confirmed.push(
    interaction.user.id
  );

  saveData();

  await interaction.reply({
    content:
      "✅ Sua participação foi confirmada.",
    ephemeral: true
  });

  if (
    match.confirmed.length <
    match.players.length
  ) {
    return;
  }

  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  const channel =
    guild.channels.cache.get(
      match.channelId
    );

  if (!channel) {
    return;
  }

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle(
          "✅ Todos confirmaram!"
        )
        .setDescription(
          "Os dois jogadores confirmaram a participação. O Pix do ADM responsável será enviado abaixo."
        )
        .setTimestamp()
    ]
  });

  await sendPix(
    guild,
    channel,
    match
  );
}

// ============================================================
// CANCELAR APOSTA
// ============================================================

async function handleMatchCancel(
  interaction
) {
  const parts =
    String(
      interaction.customId || ""
    ).split(":");

  const matchId =
    parts[2];

  const match =
    matchById(matchId);

  if (!match) {
    return interaction.reply({
      content:
        "⚠️ Essa aposta não existe mais.",
      ephemeral: true
    });
  }

  if (match.finalized) {
    return interaction.reply({
      content:
        "⚠️ Essa aposta já foi finalizada.",
      ephemeral: true
    });
  }

  if (
    !match.players.includes(
      interaction.user.id
    ) &&
    interaction.user.id !==
      match.mediatorId
  ) {
    return interaction.reply({
      content:
        "❌ Você não pode cancelar esta aposta.",
      ephemeral: true
    });
  }

  await interaction.deferReply({
    ephemeral: true
  });

  await cancelMatch(
    interaction.guild,
    match
  );

  await interaction.editReply({
    content:
      "✅ Aposta cancelada."
  });
}

// ============================================================
// RESULTADO — ESCOLHER VENCEDOR
// ============================================================

async function handleWinnerButton(
  interaction
) {
  const parts =
    String(
      interaction.customId || ""
    ).split(":");

  const matchId =
    parts[2];

  const match =
    matchById(matchId);

  if (!match) {
    return interaction.reply({
      content:
        "⚠️ Aposta não encontrada.",
      ephemeral: true
    });
  }

  if (match.finalized) {
    return interaction.reply({
      content:
        "⚠️ Esta aposta já foi finalizada.",
      ephemeral: true
    });
  }

  if (
    interaction.user.id !==
    match.mediatorId
  ) {
    return interaction.reply({
      content:
        "❌ Apenas o mediador responsável pode definir o vencedor.",
      ephemeral: true
    });
  }

  if (
    !match.confirmed ||
    match.confirmed.length <
      match.players.length
  ) {
    return interaction.reply({
      content:
        "⚠️ Os jogadores ainda não confirmaram a aposta.",
      ephemeral: true
    });
  }

  return interaction.reply({
    content:
      "🏆 Selecione o jogador vencedor:",
    components: [
      playerSelect(
        match,
        "winner_select"
      )
    ],
    ephemeral: true
  });
}

// ============================================================
// RESULTADO — W.O.
// ============================================================

async function handleWOButton(
  interaction
) {
  const parts =
    String(
      interaction.customId || ""
    ).split(":");

  const matchId =
    parts[2];

  const match =
    matchById(matchId);

  if (!match) {
    return interaction.reply({
      content:
        "⚠️ Aposta não encontrada.",
      ephemeral: true
    });
  }

  if (match.finalized) {
    return interaction.reply({
      content:
        "⚠️ Esta aposta já foi finalizada.",
      ephemeral: true
    });
  }

  if (
    interaction.user.id !==
    match.mediatorId
  ) {
    return interaction.reply({
      content:
        "❌ Apenas o mediador responsável pode registrar W.O.",
      ephemeral: true
    });
  }

  return interaction.reply({
    content:
      "🏆 Selecione o jogador que venceu por W.O.:",
    components: [
      playerSelect(
        match,
        "wo_select"
      )
    ],
    ephemeral: true
  });
}

// ============================================================
// RESULTADO — SELEÇÃO
// ============================================================

async function handleWinnerSelect(
  interaction
) {
  const parts =
    String(
      interaction.customId || ""
    ).split(":");

  const action =
    parts[1];

  const matchId =
    parts[2];

  const match =
    matchById(matchId);

  if (!match) {
    return interaction.update({
      content:
        "⚠️ Aposta não encontrada.",
      components: []
    });
  }

  if (match.finalized) {
    return interaction.update({
      content:
        "⚠️ Esta aposta já foi finalizada.",
      components: []
    });
  }

  if (
    interaction.user.id !==
    match.mediatorId
  ) {
    return interaction.update({
      content:
        "❌ Apenas o mediador pode definir o resultado.",
      components: []
    });
  }

  const winnerId =
    interaction.values?.[0];

  if (
    !winnerId ||
    !match.players.includes(
      winnerId
    )
  ) {
    return interaction.update({
      content:
        "❌ Jogador inválido.",
      components: []
    });
  }

  match.winnerId =
    winnerId;

  match.resultType =
    action === "wo_select"
      ? "wo"
      : "normal";

  match.finalized = true;

  match.finishedAt =
    Date.now();

  saveData();

  const guild =
    interaction.guild;

  const channel =
    guild?.channels.cache.get(
      match.channelId
    );

  if (channel) {
    const winner =
      await guild.members
        .fetch(winnerId)
        .catch(() => null);

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            action === "wo_select"
              ? "🏆 Vitória por W.O."
              : "🏆 Resultado da partida"
          )
          .setDescription(
            [
              `👑 **Vencedor:** ${mention(
                winnerId
              )}`,
              "",
              `💰 **Valor da aposta:** ${money(
                match.cents
              )}`,
              "",
              "A aposta foi finalizada pelo mediador."
            ].join("\n")
          )
          .setTimestamp()
      ]
    });
  }

  return interaction.update({
    content:
      "✅ Resultado registrado com sucesso.",
    components: []
  });
}

// ============================================================
// FINALIZAR APOSTA
// ============================================================

async function handleFinishButton(
  interaction
) {
  const parts =
    String(
      interaction.customId || ""
    ).split(":");

  const matchId =
    parts[2];

  const match =
    matchById(matchId);

  if (!match) {
    return interaction.reply({
      content:
        "⚠️ Aposta não encontrada.",
      ephemeral: true
    });
  }

  if (match.finalized) {
    return interaction.reply({
      content:
        "⚠️ Esta aposta já foi finalizada.",
      ephemeral: true
    });
  }

  if (
    interaction.user.id !==
    match.mediatorId
  ) {
    return interaction.reply({
      content:
        "❌ Apenas o mediador responsável pode finalizar a aposta.",
      ephemeral: true
    });
  }

  match.finalized = true;
  match.finishedAt =
    Date.now();

  match.resultType =
    "manual";

  saveData();

  const channel =
    interaction.guild?.channels.cache.get(
      match.channelId
    );

  if (channel) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            "🔒 Aposta finalizada"
          )
          .setDescription(
            "O mediador finalizou esta aposta manualmente."
          )
          .setTimestamp()
      ]
    });
  }

  return interaction.reply({
    content:
      "✅ Aposta finalizada.",
    ephemeral: true
  });
}

// ============================================================
// SALA — MEDIADOR ENVIA ID E SENHA
// ============================================================

function createRoomModal(
  matchId
) {
  return new ModalBuilder()
    .setCustomId(
      `room_modal:${matchId}`
    )
    .setTitle(
      "🎮 Criar sala"
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

async function handleRoomCreate(
  interaction
) {
  const parts =
    String(
      interaction.customId || ""
    ).split(":");

  const matchId =
    parts[1];

  const match =
    matchById(matchId);

  if (!match) {
    return interaction.reply({
      content:
        "⚠️ Aposta não encontrada.",
      ephemeral: true
    });
  }

  if (
    interaction.user.id !==
    match.mediatorId
  ) {
    return interaction.reply({
      content:
        "❌ Apenas o mediador responsável pode criar a sala.",
      ephemeral: true
    });
  }

  if (match.finalized) {
    return interaction.reply({
      content:
        "⚠️ Esta aposta já foi finalizada.",
      ephemeral: true
    });
  }

  return interaction.showModal(
    createRoomModal(
      match.id
    )
  );
}

async function handleRoomModal(
  interaction
) {
  const parts =
    String(
      interaction.customId || ""
    ).split(":");

  const matchId =
    parts[1];

  const match =
    matchById(matchId);

  if (!match) {
    return interaction.reply({
      content:
        "⚠️ Aposta não encontrada.",
      ephemeral: true
    });
  }

  if (
    interaction.user.id !==
    match.mediatorId
  ) {
    return interaction.reply({
      content:
        "❌ Apenas o mediador responsável pode enviar os dados da sala.",
      ephemeral: true
    });
  }

  const roomId =
    interaction.fields.getTextInputValue(
      "room_id"
    );

  const roomPassword =
    interaction.fields.getTextInputValue(
      "room_password"
    );

  match.roomId =
    roomId.trim();

  match.roomPassword =
    roomPassword.trim();

  match.roomCreated =
    true;

  match.roomCreatedAt =
    Date.now();

  saveData();

  const channel =
    interaction.guild?.channels.cache.get(
      match.channelId
    );

  if (channel) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            "🎮 SALA CRIADA"
          )
          .setDescription(
            [
              `🆔 **ID da sala:** \`${match.roomId}\``,
              `🔐 **Senha:** \`${match.roomPassword}\``,
              "",
              "👥 Jogadores:",
              match.players
                .map(
                  mention
                )
                .join(" • "),
              "",
              "🛡️ Sala enviada pelo mediador responsável."
            ].join("\n")
          )
          .setTimestamp()
      ]
    });
  }

  return interaction.reply({
    content:
      "✅ ID e senha da sala enviados com sucesso.",
    ephemeral: true
  });
}

// ============================================================
// PAINEL DO MEDIADOR
// ============================================================

async function handleMediatorQueue(
  interaction
) {
  const action =
    String(
      interaction.customId || ""
    ).split(":")[1];

  if (
    !isMediator(
      interaction.member
    )
  ) {
    return interaction.reply({
      content:
        "❌ Você não possui o cargo/permissão de mediador.",
      ephemeral: true
    });
  }

  const guild =
    interaction.guild;

  if (!guild) {
    return interaction.reply({
      content:
        "❌ Servidor não encontrado.",
      ephemeral: true
    });
  }

  const g =
    guildData(
      guild.id
    );

  if (
    !Array.isArray(
      g.mediatorQueue
    )
  ) {
    g.mediatorQueue = [];
  }

  if (action === "join") {
    if (
      g.mediatorQueue.includes(
        interaction.user.id
      )
    ) {
      return interaction.reply({
        content:
          "⚠️ Você já está na fila de mediadores.",
        ephemeral: true
      });
    }

    g.mediatorQueue.push(
      interaction.user.id
    );

    saveData();

    await interaction.update({
      embeds: [
        mediatorPanel(
          guild
        )
      ],
      components: [
        mediatorPanelButtons()
      ]
    });

    return;
  }

  if (action === "leave") {
    const index =
      g.mediatorQueue.indexOf(
        interaction.user.id
      );

    if (index >= 0) {
      g.mediatorQueue.splice(
        index,
        1
      );
    }

    saveData();

    await interaction.update({
      embeds: [
        mediatorPanel(
          guild
        )
      ],
      components: [
        mediatorPanelButtons()
      ]
    });

    return;
  }

  if (action === "refresh") {
    return interaction.update({
      embeds: [
        mediatorPanel(
          guild
        )
      ],
      components: [
        mediatorPanelButtons()
      ]
    });
  }

  return interaction.reply({
    content:
      "⚠️ Ação inválida.",
    ephemeral: true
  });
}

// ============================================================
// CONFIGURAÇÃO — PERMISSÃO
// ============================================================

function requireAdmin(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return interaction.reply({
      content:
        "❌ Você precisa ser administrador para usar esta função.",
      ephemeral: true
    });
  }

  return true;
}

// ============================================================
// CONFIGURAÇÃO — EMBED
// ============================================================

function configEmbed(
  guild
) {
  const g =
    guildData(
      guild.id
    );

  return new EmbedBuilder()
    .setColor(
      safeColor(g.embedColor)
    )
    .setTitle(
      "⚙️ CONFIGURAÇÃO DO BOT"
    )
    .setDescription(
      [
        "Configure os principais recursos do sistema abaixo.",
        "",
        `📁 **Categoria das filas:** ${
          g.queueCategory
            ? `<#${g.queueCategory}>`
            : "Não configurada"
        }`,
        `📁 **Categoria das partidas:** ${
          g.matchCategory
            ? `<#${g.matchCategory}>`
            : "Não configurada"
        }`,
        `📋 **Canal de logs:** ${
          g.logChannel
            ? `<#${g.logChannel}>`
            : "Não configurado"
        }`,
        `🛡️ **Cargo Mediador:** ${
          g.mediatorRole
            ? `<@&${g.mediatorRole}>`
            : "Não configurado"
        }`,
        `👑 **Cargo ADM:** ${
          g.adminRole
            ? `<@&${g.adminRole}>`
            : "Não configurado"
        }`,
        `💠 **ADMs/Pix cadastrados:** ${
          Object.keys(
            g.pix || {}
          ).length
        }`
      ].join("\n")
    )
    .setTimestamp();
}

function configButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config:channels"
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
          "config:roles"
        )
        .setLabel(
          "Cargos"
        )
        .setEmoji(
          "🛡️"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config:pix"
        )
        .setLabel(
          "Pix ADM"
        )
        .setEmoji(
          "💠"
        )
        .setStyle(
          ButtonStyle.Success
        )
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config:queues"
        )
        .setLabel(
          "Filas"
        )
        .setEmoji(
          "🎮"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config:mediators"
        )
        .setLabel(
          "Mediadores"
        )
        .setEmoji(
          "👥"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    )
  ];
}

// ============================================================
// CONFIGURAÇÃO — CANAIS
// ============================================================

function channelConfigModal() {
  return new ModalBuilder()
    .setCustomId(
      "config_channels_modal"
    )
    .setTitle(
      "Configurar canais"
    )
    .addComponents(
      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "queue_category"
            )
            .setLabel(
              "ID da categoria das filas"
            )
            .setPlaceholder(
              "Cole o ID da categoria"
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
              "match_category"
            )
            .setLabel(
              "ID da categoria das partidas"
            )
            .setPlaceholder(
              "Cole o ID da categoria"
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
              "log_channel"
            )
            .setLabel(
              "ID do canal de logs"
            )
            .setPlaceholder(
              "Cole o ID do canal"
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

async function handleConfigChannels(
  interaction
) {
  if (!requireAdmin(
    interaction
  )) {
    return;
  }

  return interaction.showModal(
    channelConfigModal()
  );
}

async function handleConfigChannelsModal(
  interaction
) {
  if (!isAdmin(
    interaction.member
  )) {
    return interaction.reply({
      content:
        "❌ Sem permissão.",
      ephemeral: true
    });
  }

  const queueCategory =
    interaction.fields.getTextInputValue(
      "queue_category"
    ).trim();

  const matchCategory =
    interaction.fields.getTextInputValue(
      "match_category"
    ).trim();

  const logChannel =
    interaction.fields.getTextInputValue(
      "log_channel"
    ).trim();

  const guild =
    interaction.guild;

  const g =
    guildData(
      guild.id
    );

  g.queueCategory =
    queueCategory;

  g.matchCategory =
    matchCategory;

  g.logChannel =
    logChannel;

  saveData();

  return interaction.reply({
    content:
      "✅ Canais configurados com sucesso.",
    ephemeral: true
  });
}

// ============================================================
// CONFIGURAÇÃO — CARGOS
// ============================================================

function roleConfigModal() {
  return new ModalBuilder()
    .setCustomId(
      "config_roles_modal"
    )
    .setTitle(
      "Configurar cargos"
    )
    .addComponents(
      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "mediator_role"
            )
            .setLabel(
              "ID do cargo Mediador"
            )
            .setPlaceholder(
              "Cole o ID do cargo"
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
              "admin_role"
            )
            .setLabel(
              "ID do cargo ADM"
            )
            .setPlaceholder(
              "Cole o ID do cargo"
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

async function handleConfigRoles(
  interaction
) {
  if (!requireAdmin(
    interaction
  )) {
    return;
  }

  return interaction.showModal(
    roleConfigModal()
  );
}

async function handleConfigRolesModal(
  interaction
) {
  if (!isAdmin(
    interaction.member
  )) {
    return interaction.reply({
      content:
        "❌ Sem permissão.",
      ephemeral: true
    });
  }

  const mediatorRole =
    interaction.fields.getTextInputValue(
      "mediator_role"
    ).trim();

  const adminRole =
    interaction.fields.getTextInputValue(
      "admin_role"
    ).trim();

  const g =
    guildData(
      interaction.guild.id
    );

  g.mediatorRole =
    mediatorRole;

  g.adminRole =
    adminRole;

  saveData();

  return interaction.reply({
    content:
      "✅ Cargos configurados com sucesso.",
    ephemeral: true
  });
}
```
```js
// ============================================================
// FILA DE MEDIADORES
// ============================================================

async function handleMediatorQueue(interaction) {
  const [, action] = interaction.customId.split(':');
  const g = guildData(interaction.guildId);

  if (action === 'refresh') {
    return interaction.update({
      embeds: [
        mediatorPanel(interaction.guild)
      ],
      components: [
        mediatorPanelButtons()
      ]
    });
  }

  if (!isMediator(interaction)) {
    return interaction.reply({
      content:
        '❌ Você não possui o cargo de Mediador configurado.',
      ephemeral: true
    });
  }

  const ids = g.mediatorQueue;

  if (action === 'join') {
    if (!ids.includes(interaction.user.id)) {
      ids.push(interaction.user.id);
    }

    saveData();

    return interaction.update({
      embeds: [
        mediatorPanel(interaction.guild)
      ],
      components: [
        mediatorPanelButtons()
      ]
    });
  }

  if (action === 'leave') {
    const index =
      ids.indexOf(interaction.user.id);

    if (index >= 0) {
      ids.splice(index, 1);
    }

    if (
      g.mediatorIndex >= ids.length
    ) {
      g.mediatorIndex = 0;
    }

    saveData();

    return interaction.update({
      embeds: [
        mediatorPanel(interaction.guild)
      ],
      components: [
        mediatorPanelButtons()
      ]
    });
  }
}

// ============================================================
// BOTÕES DA APOSTA
// ============================================================

async function handleMatchButton(interaction) {
  const [
    ,
    action,
    id
  ] = interaction.customId.split(':');

  const m = matchById(id);

  if (!m || m.finalized) {
    return interaction.reply({
      content:
        '⚠️ Esta aposta não está mais ativa.',
      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // CONFIRMAR
  // ----------------------------------------------------------

  if (action === 'confirm') {
    if (!m.players.includes(interaction.user.id)) {
      return interaction.reply({
        content:
          '❌ Você não participa desta aposta.',
        ephemeral: true
      });
    }

    if (
      !m.confirmed.includes(
        interaction.user.id
      )
    ) {
      m.confirmed.push(
        interaction.user.id
      );
    }

    saveData();

    await interaction.update({
      embeds: [
        confirmEmbed(
          interaction.guild,
          m
        )
      ],
      components: [
        confirmButtons(m)
      ]
    });

    if (m.confirmed.length === 2) {
      await interaction.message
        .edit({
          components: []
        })
        .catch(() => {});

      await sendPix(
        interaction.guild,
        interaction.channel,
        m
      );
    }

    return;
  }

  // ----------------------------------------------------------
  // CANCELAR
  // ----------------------------------------------------------

  if (action === 'cancel') {
    if (
      !m.players.includes(
        interaction.user.id
      ) &&
      interaction.user.id !==
        m.mediatorId
    ) {
      return interaction.reply({
        content:
          '❌ Você não pode cancelar esta aposta.',
        ephemeral: true
      });
    }

    await interaction.reply({
      content:
        '✅ Aposta cancelada.',
      ephemeral: true
    });

    return cancelMatch(
      interaction.guild,
      m
    );
  }

  // ----------------------------------------------------------
  // ESCOLHER VENCEDOR / W.O.
  // ----------------------------------------------------------

  if (
    action === 'winner' ||
    action === 'wo'
  ) {
    if (
      interaction.user.id !==
      m.mediatorId
    ) {
      return interaction.reply({
        content:
          '❌ Somente o Mediador responsável pode registrar o resultado.',
        ephemeral: true
      });
    }

    return interaction.reply({
      content:
        action === 'winner'
          ? '🏆 Escolha o vencedor:'
          : '⚡ Escolha quem venceu por W.O.:',

      components: [
        playerSelect(
          m,
          action === 'winner'
            ? 'winnerselect'
            : 'woselect'
        )
      ],

      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // FINALIZAR
  // ----------------------------------------------------------

  if (action === 'finish') {
    if (
      interaction.user.id !==
      m.mediatorId
    ) {
      return interaction.reply({
        content:
          '❌ Somente o Mediador responsável pode finalizar.',
        ephemeral: true
      });
    }

    if (!m.resultType) {
      return interaction.reply({
        content:
          '⚠️ Registre primeiro o vencedor ou o W.O.',
        ephemeral: true
      });
    }

    m.finalized = true;

    saveData();

    return interaction
      .reply({
        content:
          '✅ Aposta finalizada. O canal será deletado em 15 segundos.',
        ephemeral: true
      })
      .then(() => {
        setTimeout(() => {
          interaction.channel
            .delete()
            .catch(() => {});
        }, 15000);
      });
  }
}

// ============================================================
// RESULTADO DA APOSTA
// ============================================================

async function handleResultSelect(interaction) {
  const [
    ,
    action,
    id
  ] = interaction.customId.split(':');

  const m = matchById(id);

  if (!m || m.finalized) {
    return interaction.reply({
      content:
        '⚠️ Aposta encerrada.',
      ephemeral: true
    });
  }

  if (
    interaction.user.id !==
    m.mediatorId
  ) {
    return interaction.reply({
      content:
        '❌ Somente o Mediador.',
      ephemeral: true
    });
  }

  const winner =
    interaction.values[0];

  // ----------------------------------------------------------
  // VITÓRIA NORMAL
  // ----------------------------------------------------------

  if (action === 'winnerselect') {
    const loser =
      m.players.find(
        (x) => x !== winner
      );

    const w =
      userData(winner);

    const l =
      userData(loser);

    w.wins++;
    w.coins++;
    w.normalMatches++;

    l.losses++;
    l.normalMatches++;

    m.resultType = 'normal';
    m.winnerId = winner;

    saveData();

    return interaction.update({
      content:
        `🏆 Vencedor: ${mention(winner)}\n🪙 +1 Coin para o vencedor.`,
      components: []
    });
  }

  // ----------------------------------------------------------
  // W.O.
  // ----------------------------------------------------------

  const w =
    userData(winner);

  w.woWins++;

  m.resultType = 'wo';
  m.winnerId = winner;

  saveData();

  return interaction.update({
    content:
      `⚡ Vitória por W.O.: ${mention(winner)}\nℹ️ W.O. não adiciona vitória, derrota ou Coin; somente a estatística de W.O. é registrada.`,
    components: []
  });
}

// ============================================================
// DETECTAR ID E SENHA DA SALA
// ============================================================

async function detectRoom(message) {
  if (
    !message.guild ||
    message.author.bot
  ) {
    return;
  }

  const m =
    matchByChannel(
      message.channel.id
    );

  if (
    !m ||
    m.finalized ||
    message.author.id !==
      m.mediatorId
  ) {
    return;
  }

  const text =
    message.content;

  const idMatch =
    text.match(
      /(?:ID(?:\s+DA\s+SALA)?|SALA)\s*[:#-]?\s*([A-Za-z0-9_-]{3,})/i
    );

  const passMatch =
    text.match(
      /(?:SENHA|PASS(?:WORD)?)\s*[:#-]?\s*([A-Za-z0-9_-]{2,})/i
    );

  if (
    !idMatch ||
    !passMatch
  ) {
    return;
  }

  m.roomId =
    idMatch[1];

  m.roomPassword =
    passMatch[1];

  m.roomCreated =
    true;

  saveData();

  await message.channel
    .setName(
      `pagar-${slug(
        money(
          m.cents * 2
        ).replace(',', '-')
      )}`
    )
    .catch(() => {});

  const e =
    new EmbedBuilder()
      .setColor(
        safeColor(
          guildData(
            message.guild.id
          ).embedColor
        )
      )
      .setTitle(
        '🤍 SALA CRIADA'
      )
      .setDescription(
        `⏱️ **A sala será iniciada em 3 a 5 minutos**\n\n🆔 **ID da Sala**\n${m.roomId}\n\n🔐 **Senha**\n${m.roomPassword}\n\nCom:\n• 🆔 Copiar ID\n• 🔐 Copiar Senha`
      );

  const row =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            mid(
              'copyroom',
              m.id,
              'id'
            )
          )
          .setLabel(
            'Copiar ID'
          )
          .setEmoji(
            '🆔'
          )
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            mid(
              'copyroom',
              m.id,
              'pass'
            )
          )
          .setLabel(
            'Copiar Senha'
          )
          .setEmoji(
            '🔐'
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      );

  await message.channel.send({
    embeds: [e],
    components: [
      row,
      resultButtons(m)
    ]
  });
}

// ============================================================
// CLIENT DISCORD
// ============================================================

const client =
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],

    partials: [
      Partials.Channel
    ]
  });

// ============================================================
// BOT ONLINE
// ============================================================

client.once(
  'ready',
  () => {
    console.log(
      `✅ ${client.user.tag} online.`
    );
  }
);

// ============================================================
// MENSAGENS
// ============================================================

client.on(
  'messageCreate',
  detectRoom
);

// ============================================================
// INTERAÇÕES
// ============================================================

client.on(
  'interactionCreate',
  async interaction => {
    try {

      // ------------------------------------------------------
      // SLASH COMMANDS
      // ------------------------------------------------------

      if (
        interaction.isChatInputCommand()
      ) {

        // /config
        if (
          interaction.commandName ===
          'config'
        ) {
          return interaction.reply({
            embeds: [
              configMain(
                interaction.guild
              )
            ],
            components: [
              configButtons()
            ],
            ephemeral: true
          });
        }

        // /fila
        if (
          interaction.commandName ===
          'fila'
        ) {
          if (
            !isOwner(
              interaction
            )
          ) {
            return interaction.reply({
              content:
                '❌ Somente o dono do servidor pode publicar filas.',
              ephemeral: true
            });
          }

          const format =
            interaction.options.getString(
              'formato',
              true
            );

          const mode =
            interaction.options.getString(
              'modalidade',
              true
            );

          const channel =
            interaction.options.getChannel(
              'canal',
              true
            );

          if (
            !channel.isTextBased() ||
            channel.type ===
              ChannelType.GuildVoice ||
            channel.type ===
              ChannelType.GuildCategory
          ) {
            return interaction.reply({
              content:
                '❌ Escolha um canal de texto.',
              ephemeral: true
            });
          }

          if (
            format === '1x1'
          ) {
            for (
              const v of VALUES
            ) {
              const msg =
                await channel.send(
                  queuePayload(
                    interaction.guild,
                    mode,
                    format,
                    v.cents,
                    'choice',
                    []
                  )
                );

              guildData(
                interaction.guildId
              ).queues[
                queueKey(
                  mode,
                  format,
                  v.cents,
                  'all'
                )
              ] = {
                players: [],
                rule: null,
                channelId:
                  channel.id,
                messageId:
                  msg.id
              };
            }
          } else {
            for (
              const v of VALUES
            ) {
              const msg =
                await channel.send(
                  queuePayload(
                    interaction.guild,
                    mode,
                    format,
                    v.cents,
                    'normal',
                    []
                  )
                );

              guildData(
                interaction.guildId
              ).queues[
                queueKey(
                  mode,
                  format,
                  v.cents,
                  'normal'
                )
              ] = {
                players: [],
                rule: null,
                channelId:
                  channel.id,
                messageId:
                  msg.id
              };
            }
          }

          guildData(
            interaction.guildId
          ).queueChannels[
            `${mode}|${format}`
          ] = channel.id;

          saveData();

          return interaction.reply({
            content:
              `✅ Todas as filas de **${format} • ${MODES[mode].label}** foram publicadas em ${channel}.`,
            ephemeral: true
          });
        }

        // /mediadores
        if (
          interaction.commandName ===
          'mediadores'
        ) {
          const g =
            guildData(
              interaction.guildId
            );

          const channel =
            g.mediatorQueueChannelId
              ? interaction.guild.channels.cache.get(
                  g.mediatorQueueChannelId
                )
              : interaction.channel;

          if (
            !channel?.isTextBased()
          ) {
            return interaction.reply({
              content:
                '❌ Configure o canal da fila de mediadores em /config → Canais.',
              ephemeral: true
            });
          }

          await channel.send({
            embeds: [
              mediatorPanel(
                interaction.guild
              )
            ],
            components: [
              mediatorPanelButtons()
            ]
          });

          return interaction.reply({
            content:
              `✅ Painel da fila de mediadores enviado em ${channel}.`,
            ephemeral: true
          });
        }

        // /perfil
        if (
          interaction.commandName ===
          'perfil'
        ) {
          const user =
            interaction.options.getUser(
              'usuario'
            ) ||
            interaction.user;

          return interaction.reply({
            embeds: [
              statsEmbed(
                interaction.guild,
                user
              )
            ]
          });
        }

        return;
      }

      // ------------------------------------------------------
      // BOTÕES
      // ------------------------------------------------------

      if (
        interaction.isButton()
      ) {

        if (
          interaction.customId.startsWith(
            'q:'
          )
        ) {
          return handleQueue(
            interaction
          );
        }

        if (
          interaction.customId.startsWith(
            'm:'
          )
        ) {

          if (
            interaction.customId.includes(
              ':copyroom:'
            )
          ) {
            const [
              ,
              ,
              id,
              what
            ] =
              interaction.customId.split(
                ':'
              );

            const m =
              matchById(id);

            if (!m) {
              return interaction.reply({
                content:
                  '⚠️ Aposta encerrada.',
                ephemeral: true
              });
            }

            return interaction.reply({
              content:
                what === 'id'
                  ? `🆔 ID: \`${m.roomId}\``
                  : `🔐 Senha: \`${m.roomPassword}\``,
              ephemeral: true
            });
          }

          return handleMatchButton(
            interaction
          );
        }

        if (
          interaction.customId.startsWith(
            'medq:'
          )
        ) {
          return handleMediatorQueue(
            interaction
          );
        }

        if (
          interaction.customId.startsWith(
            'cfg:'
          )
        ) {
          return handleConfig(
            interaction
          );
        }
      }

      // ------------------------------------------------------
      // SELECT MENUS
      // ------------------------------------------------------

      if (
        interaction.isStringSelectMenu()
      ) {

        if (
          interaction.customId.startsWith(
            'm:'
          )
        ) {
          return handleResultSelect(
            interaction
          );
        }

        if (
          interaction.customId.startsWith(
            'cfg:'
          )
        ) {
          return handleConfig(
            interaction
          );
        }
      }

      // ------------------------------------------------------
      // CHANNEL / USER SELECT
      // ------------------------------------------------------

      if (
        interaction.isChannelSelectMenu() ||
        interaction.isUserSelectMenu()
      ) {
        if (
          interaction.customId.startsWith(
            'cfg:'
          )
        ) {
          return handleConfig(
            interaction
          );
        }
      }

      // ------------------------------------------------------
      // MODAIS
      // ------------------------------------------------------

      if (
        interaction.isModalSubmit()
      ) {
        return handleModal(
          interaction
        );
      }

    } catch (e) {

      console.error(
        'INTERACTION ERROR:',
        e
      );

      if (
        interaction.replied ||
        interaction.deferred
      ) {
        await interaction
          .followUp({
            content:
              '❌ Ocorreu um erro ao processar essa ação.',
            ephemeral: true
          })
          .catch(() => {});
      } else {
        await interaction
          .reply({
            content:
              '❌ Ocorreu um erro ao processar essa ação.',
            ephemeral: true
          })
          .catch(() => {});
      }
    }
  }
);

// ============================================================
// INICIAR BOT
// ============================================================

client.login(TOKEN);
```
