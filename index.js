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
  );
}

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

function sendSafeReply(
  interaction,
  payload
) {
  if (
    interaction.replied ||
    interaction.deferred
  ) {
    return interaction.followUp(
      payload
    );
  }

  return interaction.reply(
    payload
  );
}function createFeeModal() {
  return new ModalBuilder()
    .setCustomId("fee_modal")
    .setTitle("Definir taxa do ADM")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("fee_cents")
          .setLabel("Taxa em centavos")
          .setPlaceholder("1 = R$0,01 | 100 = R$1,00")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

function createAdminIdModal() {
  return new ModalBuilder()
    .setCustomId("admin_id_modal")
    .setTitle("Cadastrar ADM")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_user_id")
          .setLabel("ID do Discord do ADM")
          .setPlaceholder("Exemplo: 123456789012345678")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

function createAdminDataModal() {
  return new ModalBuilder()
    .setCustomId("admin_data_modal")
    .setTitle("Dados do ADM / Pix")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_name")
          .setLabel("Nome do ADM")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_pix_key")
          .setLabel("Chave Pix")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_pix_qr")
          .setLabel("URL do QR Code (opcional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );
}

function getConfiguredQueueChannel(
  guild
) {
  const config =
    getGuildConfig(guild.id);

  /*
   * ATENÇÃO:
   *
   * O /fila NÃO deve depender
   * de mediatorQueueChannelId.
   *
   * O canal do /fila é escolhido
   * diretamente pelo administrador.
   *
   * Esta função existe apenas para
   * compatibilidade com chamadas
   * antigas que realmente precisam
   * de um canal configurado.
   */

  if (
    !config.queueChannelId
  ) {
    return null;
  }

  return guild.channels.fetch(
    config.queueChannelId
  ).catch(() => null);
}

async function publishQueues(
  guild,
  format,
  mode,
  channelOverride = null
) {
  if (!guild) {
    throw new Error(
      "Servidor não encontrado."
    );
  }

  if (
    !FORMATS.includes(format)
  ) {
    throw new Error(
      "Formato de fila inválido."
    );
  }

  if (
    !MODES.includes(mode)
  ) {
    throw new Error(
      "Modalidade de fila inválida."
    );
  }

  let channel = null;

  /*
   * CORREÇÃO PRINCIPAL:
   *
   * Quando o administrador escolhe
   * um canal no /fila, usamos
   * DIRETAMENTE esse canal.
   *
   * Não verificamos
   * mediatorQueueChannelId.
   */
  if (channelOverride) {
    channel =
      await guild.channels.fetch(
        channelOverride
      ).catch(() => null);
  }

  /*
   * Somente se a função for chamada
   * sem canal escolhido, tentamos
   * usar um canal previamente
   * configurado.
   */
  if (!channel) {
    channel =
      await getConfiguredQueueChannel(
        guild
      );
  }

  if (!channel) {
    throw new Error(
      "Canal não configurado ou não encontrado."
    );
  }

  if (
    channel.type !==
    ChannelType.GuildText
  ) {
    throw new Error(
      "O canal escolhido precisa ser um canal de texto."
    );
  }

  /*
   * Os valores são publicados
   * do maior para o menor.
   */
  const valuesDescending =
    [...VALUES].sort(
      (a, b) => b - a
    );

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !config.queueMessages ||
    typeof config.queueMessages !==
      "object"
  ) {
    config.queueMessages = {};
  }

  /*
   * Publica uma mensagem para
   * cada valor.
   */
  for (
    const value of valuesDescending
  ) {
    const key =
      makeQueueKey(
        guild.id,
        format,
        mode,
        value
      );

    /*
     * Cria a fila no banco antes
     * de publicar a mensagem.
     */
    getQueue(
      guild.id,
      format,
      mode,
      value
    );

    let oldMessage = null;

    if (
      config.queueMessages[key]
    ) {
      oldMessage =
        await channel.messages
          .fetch(
            config.queueMessages[
              key
            ]
          )
          .catch(() => null);
    }

    const payload = {
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
    };

    if (oldMessage) {
      await oldMessage.edit(
        payload
      );
    } else {
      const message =
        await channel.send(
          payload
        );

      config.queueMessages[
        key
      ] = message.id;
    }
  }

  saveDatabase();

  return channel;
}

function getQueueFromCustomId(
  customId
) {
  const parts =
    customId.split("|");

  if (
    parts.length < 4
  ) {
    return null;
  }

  return {
    action: parts[0],
    format: parts[1],
    mode: parts[2],
    value: Number(parts[3]),
    type:
      parts[4] ||
      "normal",
  };
}

async function createBet(
  interaction,
  format,
  mode,
  value,
  players
) {
  const guild =
    interaction.guild;

  const config =
    getGuildConfig(
      guild.id
    );

  const categoryId =
    config.betsCategoryId;

  let category = null;

  if (categoryId) {
    category =
      await guild.channels
        .fetch(categoryId)
        .catch(() => null);
  }

  const channelName =
    `aposta-${String(format)
      .replace("x", "-")}-${value}`;

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionsBitField.Flags
          .ViewChannel,
      ],
    },
  ];

  for (
    const userId of players
  ) {
    permissionOverwrites.push({
      id: userId,
      allow: [
        PermissionsBitField.Flags
          .ViewChannel,
        PermissionsBitField.Flags
          .SendMessages,
        PermissionsBitField.Flags
          .ReadMessageHistory,
      ],
    });
  }

  if (
    config.mediatorRoleId
  ) {
    permissionOverwrites.push({
      id: config.mediatorRoleId,
      allow: [
        PermissionsBitField.Flags
          .ViewChannel,
        PermissionsBitField.Flags
          .SendMessages,
        PermissionsBitField.Flags
          .ReadMessageHistory,
      ],
    });
  }

  const channel =
    await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,

      ...(category &&
      category.type ===
        ChannelType.GuildCategory
        ? {
            parent: category.id,
          }
        : {}),

      permissionOverwrites,
    });

  const betId =
    generateId("bet");

  db.bets[betId] = {
    id: betId,
    guildId: guild.id,
    channelId: channel.id,
    format,
    mode,
    value,
    players: [...players],
    createdAt: Date.now(),
    status: "waiting",
    mediatorId: null,
    pixAdminId: null,
  };

  saveDatabase();

  const configText =
    `🎮 **Formato:** ${format}\n` +
    `📌 **Modalidade:** ${modeLabel(
      mode
    )}\n` +
    `💰 **Valor:** ${formatMoney(
      value
    )}\n\n` +
    `👥 **Jogadores:**\n` +
    players
      .map(
        (id) => `<@${id}>`
      )
      .join("\n");

  await channel.send({
    embeds: [
      createEmbed(
        guild.id,
        "🎰 APOSTA CRIADA",
        configText
      ),
    ],
  });

  return channel;
}

async function checkQueueFull(
  interaction,
  format,
  mode,
  value
) {
  const guild =
    interaction.guild;

  const queue =
    getQueue(
      guild.id,
      format,
      mode,
      value
    );

  const needed =
    requiredPlayers(format);

  if (
    queue.length !== needed
  ) {
    return false;
  }

  /*
   * 1x1 precisa conferir se os
   * dois jogadores escolheram o
   * mesmo tipo de gelo.
   */
  if (format === "1x1") {
    const choices =
      getQueueChoices(
        guild.id,
        format,
        mode,
        value
      );

    const first =
      choices[queue[0]];

    const second =
      choices[queue[1]];

    if (
      !first ||
      !second
    ) {
      return false;
    }

    if (first !== second) {
      return false;
    }
  }

  const players =
    [...queue];

  await createBet(
    interaction,
    format,
    mode,
    value,
    players
  );

  /*
   * Depois de criar a aposta,
   * limpa a fila.
   */
  db.queues[
    makeQueueKey(
      guild.id,
      format,
      mode,
      value
    )
  ] = [];

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

  return true;
}

async function updateQueueMessage(
  guild,
  format,
  mode,
  value,
  messageId
) {
  const channel =
    await guild.channels
      .fetch(
        guild.systemChannelId
      )
      .catch(() => null);

  if (!channel) {
    return;
  }

  const message =
    await channel.messages
      .fetch(messageId)
      .catch(() => null);

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
}

async function handleQueueJoin(
  interaction,
  data
) {
  const {
    format,
    mode,
    value,
    type,
  } = data;

  const guild =
    interaction.guild;

  const userId =
    interaction.user.id;

  const queue =
    getQueue(
      guild.id,
      format,
      mode,
      value
    );

  const needed =
    requiredPlayers(
      format
    );

  if (
    queue.includes(userId)
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Você já está nesta fila.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    queue.length >= needed
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta fila já está cheia.",
        ephemeral: true,
      }
    );

    return;
  }

  /*
   * Para 1x1, type é a escolha
   * do gelo.
   */
  if (
    format === "1x1"
  ) {
    const choice =
      type ===
      "ice_infinite"
        ? "ice_infinite"
        : "ice_normal";

    const choices =
      getQueueChoices(
        guild.id,
        format,
        mode,
        value
      );

    choices[userId] =
      choice;
  }

  queue.push(userId);

  saveDatabase();

  /*
   * Atualiza a mensagem da fila
   * onde o botão foi clicado.
   */
  try {
    await interaction.message.edit(
      {
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
      }
    );
  } catch (error) {
    console.error(
      "Erro ao atualizar fila:",
      error
    );
  }

  const full =
    await checkQueueFull(
      interaction,
      format,
      mode,
      value
    );

  if (full) {
    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Fila completa! A aposta foi criada.",
        ephemeral: true,
      }
    );

    return;
  }

  await sendSafeReply(
    interaction,
    {
      content:
        `✅ Você entrou na fila de ${formatMoney(
          value
        )}.`,
      ephemeral: true,
    }
  );
}

async function handleQueueLeave(
  interaction,
  data
) {
  const {
    format,
    mode,
    value,
  } = data;

  const guild =
    interaction.guild;

  const userId =
    interaction.user.id;

  const queue =
    getQueue(
      guild.id,
      format,
      mode,
      value
    );

  const index =
    queue.indexOf(userId);

  if (index === -1) {
    await sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Você não está nesta fila.",
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

  try {
    await interaction.message.edit(
      {
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
      }
    );
  } catch (error) {
    console.error(
      "Erro ao atualizar fila após saída:",
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

async function handleMediatorQueueJoin(
  interaction
) {
  const guild =
    interaction.guild;

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !hasMediatorRole(
      interaction.member,
      guild.id
    ) &&
    !isAdministrator(
      interaction.member
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não possui o cargo de mediador.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    !Array.isArray(
      config.mediatorQueue
    )
  ) {
    config.mediatorQueue =
      [];
  }

  if (
    config.mediatorQueue.includes(
      interaction.user.id
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Você já está na fila de mediadores.",
        ephemeral: true,
      }
    );

    return;
  }

  config.mediatorQueue.push(
    interaction.user.id
  );

  saveDatabase();

  try {
    await interaction.message.edit(
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
  }

  await sendSafeReply(
    interaction,
    {
      content:
        "✅ Você entrou na fila de mediadores.",
      ephemeral: true,
    }
  );
}

async function handleMediatorQueueLeave(
  interaction
) {
  const guild =
    interaction.guild;

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

  const index =
    config.mediatorQueue.indexOf(
      interaction.user.id
    );

  if (index === -1) {
    await sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Você não está na fila de mediadores.",
        ephemeral: true,
      }
    );

    return;
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
    await interaction.message.edit(
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
  }

  await sendSafeReply(
    interaction,
    {
      content:
        "✅ Você saiu da fila de mediadores.",
      ephemeral: true,
    }
  );
}

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
    config.mediatorQueue.length ===
      0
  ) {
    return null;
  }

  if (
    !Number.isInteger(
      config.mediatorRotationIndex
    )
  ) {
    config.mediatorRotationIndex =
      0;
  }

  const index =
    config.mediatorRotationIndex %
    config.mediatorQueue.length;

  const mediatorId =
    config.mediatorQueue[
      index
    ];

  config.mediatorRotationIndex =
    (index + 1) %
    config.mediatorQueue.length;

  saveDatabase();

  return mediatorId;
}// ============================================================
// MEDIADORES
// ============================================================

async function publishMediatorQueue(guild) {
  const config = getGuildConfig(guild.id);

  if (!config.mediatorQueueChannelId) {
    throw new Error("O canal da fila de mediadores ainda não foi configurado.");
  }

  const channel = await guild.channels.fetch(config.mediatorQueueChannelId).catch(() => null);

  if (!channel || !channel.isTextBased()) {
    throw new Error("O canal da fila de mediadores não foi encontrado ou é inválido.");
  }

  const embed = mediatorQueueEmbed(guild.id);
  const components = mediatorQueueButtons();

  // Se já existe uma mensagem publicada, atualiza ela.
  if (config.mediatorQueueMessageId) {
    const oldMessage = await channel.messages
      .fetch(config.mediatorQueueMessageId)
      .catch(() => null);

    if (oldMessage) {
      await oldMessage.edit({
        embeds: [embed],
        components
      });

      return oldMessage;
    }
  }

  // Caso não exista mensagem, cria uma nova.
  const message = await channel.send({
    embeds: [embed],
    components
  });

  config.mediatorQueueMessageId = message.id;
  saveDatabase();

  return message;
}


// ============================================================
// EMBED DA FILA DE MEDIADORES
// ============================================================

function mediatorQueueEmbed(guildId) {
  const config = getGuildConfig(guildId);

  const active = Array.isArray(config.activeMediators)
    ? config.activeMediators
    : [];

  let description = "";

  if (!active.length) {
    description =
      "Nenhum mediador está na fila no momento.\n\n" +
      "Clique em **Entrar na fila** para ficar disponível como mediador.";
  } else {
    description =
      active
        .map((userId, index) => {
          return `**${index + 1}.** <@${userId}>`;
        })
        .join("\n") +
      "\n\n" +
      "O primeiro mediador da fila será chamado primeiro.";
  }

  return new EmbedBuilder()
    .setTitle("🛡️ FILA DE MEDIADORES")
    .setDescription(description)
    .setColor(0x2b2d31)
    .setFooter({
      text: "Sistema de mediadores"
    });
}


// ============================================================
// BOTÕES DA FILA DE MEDIADORES
// ============================================================

function mediatorQueueButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mediator_join")
        .setLabel("Entrar na fila")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("mediator_leave")
        .setLabel("Sair da fila")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("mediator_list")
        .setLabel("Ver mediadores")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}


// ============================================================
// CONFIGURAÇÃO DE MEDIADORES
// ============================================================

function mediatorConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mediator_register")
        .setLabel("Cadastrar mediador")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("mediator_list")
        .setLabel("Listar mediadores")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("publish_mediator_queue")
        .setLabel("Publicar fila de mediadores")
        .setStyle(ButtonStyle.Primary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("pix_add")
        .setLabel("Cadastrar ADM/Pix")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("pix_list")
        .setLabel("Listar ADM/Pix")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}


// ============================================================
// CADASTRO DE MEDIADOR
// ============================================================

function createMediatorModal() {
  return new ModalBuilder()
    .setCustomId("mediator_modal")
    .setTitle("Cadastrar mediador")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("mediator_id")
          .setLabel("ID do Discord")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Digite o ID do usuário")
          .setRequired(true)
      )
    );
}


// ============================================================
// MODAL PARA CADASTRAR ADM/PIX — ETAPA 1
// ============================================================

function createPixIdModal() {
  return new ModalBuilder()
    .setCustomId("pix_id_modal")
    .setTitle("Cadastrar ADM/Pix")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("pix_user_id")
          .setLabel("ID do Discord do ADM")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Ex.: 123456789012345678")
          .setRequired(true)
      )
    );
}


// ============================================================
// MODAL PARA CADASTRAR ADM/PIX — ETAPA 2
// ============================================================

function createPixDataModal(userId) {
  return new ModalBuilder()
    .setCustomId(`pix_data_modal|${userId}`)
    .setTitle("Dados do ADM/Pix")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_name")
          .setLabel("Nome do ADM")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Nome que aparecerá para os jogadores")
          .setRequired(true)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_pix_key")
          .setLabel("Chave Pix")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("CPF, CNPJ, telefone, e-mail ou chave aleatória")
          .setRequired(true)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_pix_qr")
          .setLabel("QR Code / URL — opcional")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Cole a URL do QR Code, se houver")
          .setRequired(false)
      )
    );
}


// ============================================================
// NORMALIZAÇÃO DA LISTA DE MEDIADORES
// ============================================================

function ensureMediatorConfig(config) {
  if (!Array.isArray(config.mediators)) {
    config.mediators = [];
  }

  if (!Array.isArray(config.activeMediators)) {
    config.activeMediators = [];
  }

  if (typeof config.mediatorQueueMessageId !== "string") {
    config.mediatorQueueMessageId = null;
  }

  if (typeof config.mediatorQueueChannelId !== "string") {
    config.mediatorQueueChannelId = null;
  }

  if (!Array.isArray(config.pixAdmins)) {
    config.pixAdmins = [];
  }

  return config;
}


// ============================================================
// VERIFICAR SE É MEDIADOR
// ============================================================

function isRegisteredMediator(guildId, userId) {
  const config = ensureMediatorConfig(getGuildConfig(guildId));

  return config.mediators.some(mediator => {
    if (typeof mediator === "string") {
      return mediator === userId;
    }

    return mediator?.id === userId ||
           mediator?.userId === userId;
  });
}


// ============================================================
// ADICIONAR MEDIADOR
// ============================================================

function addMediator(guildId, userId, addedBy = null) {
  const config = ensureMediatorConfig(getGuildConfig(guildId));

  if (isRegisteredMediator(guildId, userId)) {
    return false;
  }

  config.mediators.push({
    id: userId,
    userId,
    addedBy,
    addedAt: new Date().toISOString()
  });

  saveDatabase();

  return true;
}


// ============================================================
// REMOVER MEDIADOR DA FILA ATIVA
// ============================================================

function removeActiveMediator(guildId, userId) {
  const config = ensureMediatorConfig(getGuildConfig(guildId));

  const index = config.activeMediators.indexOf(userId);

  if (index === -1) {
    return false;
  }

  config.activeMediators.splice(index, 1);

  saveDatabase();

  return true;
}


// ============================================================
// ADICIONAR MEDIADOR À FILA ATIVA
// ============================================================

function addActiveMediator(guildId, userId) {
  const config = ensureMediatorConfig(getGuildConfig(guildId));

  if (!isRegisteredMediator(guildId, userId)) {
    return {
      ok: false,
      reason: "not_registered"
    };
  }

  if (config.activeMediators.includes(userId)) {
    return {
      ok: false,
      reason: "already_in_queue"
    };
  }

  config.activeMediators.push(userId);

  saveDatabase();

  return {
    ok: true
  };
}


// ============================================================
// PEGAR PRIMEIRO MEDIADOR
// ============================================================

function getNextMediator(guildId) {
  const config = ensureMediatorConfig(getGuildConfig(guildId));

  if (!config.activeMediators.length) {
    return null;
  }

  return config.activeMediators[0];
}


// ============================================================
// RODÍZIO DE MEDIADORES
// ============================================================

function rotateMediator(guildId) {
  const config = ensureMediatorConfig(getGuildConfig(guildId));

  if (config.activeMediators.length <= 1) {
    return getNextMediator(guildId);
  }

  const first = config.activeMediators.shift();

  config.activeMediators.push(first);

  saveDatabase();

  return config.activeMediators[0];
}


// ============================================================
// LISTA DE MEDIADORES
// ============================================================

function getMediatorListText(guildId) {
  const config = ensureMediatorConfig(getGuildConfig(guildId));

  if (!config.mediators.length) {
    return "Nenhum mediador cadastrado.";
  }

  return config.mediators
    .map((mediator, index) => {
      const userId =
        typeof mediator === "string"
          ? mediator
          : mediator.userId || mediator.id;

      return `**${index + 1}.** <@${userId}>`;
    })
    .join("\n");
}


// ============================================================
// LISTA DE ADMS/PIX
// ============================================================

function getPixAdminListText(guildId) {
  const config = ensureMediatorConfig(getGuildConfig(guildId));

  if (!config.pixAdmins.length) {
    return "Nenhum ADM/Pix cadastrado.";
  }

  return config.pixAdmins
    .map((admin, index) => {
      const userId = admin.userId || admin.id || "não informado";
      const name = admin.name || "Sem nome";
      const key = admin.key || "Sem chave Pix";

      return (
        `**${index + 1}. ${name}**\n` +
        `👤 <@${userId}>\n` +
        `💠 Pix: \`${key}\``
      );
    })
    .join("\n\n");
}


// ============================================================
// ATUALIZAR MENSAGEM DA FILA DE MEDIADORES
// ============================================================

async function updateMediatorQueueMessage(guild) {
  const config = ensureMediatorConfig(getGuildConfig(guild.id));

  if (!config.mediatorQueueChannelId) {
    return null;
  }

  const channel = await guild.channels
    .fetch(config.mediatorQueueChannelId)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) {
    return null;
  }

  let message = null;

  if (config.mediatorQueueMessageId) {
    message = await channel.messages
      .fetch(config.mediatorQueueMessageId)
      .catch(() => null);
  }

  if (!message) {
    message = await channel.send({
      embeds: [mediatorQueueEmbed(guild.id)],
      components: mediatorQueueButtons()
    });

    config.mediatorQueueMessageId = message.id;
    saveDatabase();

    return message;
  }

  await message.edit({
    embeds: [mediatorQueueEmbed(guild.id)],
    components: mediatorQueueButtons()
  });

  return message;
}


// ============================================================
// FIM DA PARTE 3
// ============================================================// ============================================================
// INTERAÇÕES
// ============================================================

client.on(Events.InteractionCreate, async interaction => {
  try {
    const guild = interaction.guild;

    if (!guild) {
      return;
    }

    // ========================================================
    // BOTÕES
    // ========================================================

    if (interaction.isButton()) {
      const id = interaction.customId;

      // ------------------------------------------------------
      // CONFIGURAÇÃO
      // ------------------------------------------------------

      if (id === "config_roles") {
        await sendSafeReply(interaction, {
          content: "⚙️ Configuração de cargos.",
          components: roleConfigComponents(),
          ephemeral: true
        });
        return;
      }

      if (id === "config_channels") {
        await sendSafeReply(interaction, {
          content: "⚙️ Configuração de canais.",
          components: channelConfigComponents(),
          ephemeral: true
        });
        return;
      }

      if (id === "config_bets") {
        await sendSafeReply(interaction, {
          content: "⚙️ Configuração das apostas.",
          components: betConfigComponents(),
          ephemeral: true
        });
        return;
      }

      if (id === "config_mediators") {
        await sendSafeReply(interaction, {
          content: "🛡️ Configuração dos mediadores.",
          components: mediatorConfigComponents(),
          ephemeral: true
        });
        return;
      }

      if (id === "config_appearance") {
        await sendSafeReply(interaction, {
          content: "🎨 Configuração de aparência.",
          components: appearanceConfigComponents(),
          ephemeral: true
        });
        return;
      }

      if (id === "config_fee_set") {
        await interaction.showModal(createFeeModal());
        return;
      }

      // ------------------------------------------------------
      // MEDIADORES
      // ------------------------------------------------------

      if (id === "mediator_register") {
        await interaction.showModal(createMediatorModal());
        return;
      }

      if (id === "mediator_join") {
        const result = addActiveMediator(
          guild.id,
          interaction.user.id
        );

        if (!result.ok) {
          if (result.reason === "not_registered") {
            await sendSafeReply(interaction, {
              content:
                "❌ Você ainda não está cadastrado como mediador.",
              ephemeral: true
            });
          } else if (result.reason === "already_in_queue") {
            await sendSafeReply(interaction, {
              content:
                "⚠️ Você já está na fila de mediadores.",
              ephemeral: true
            });
          }

          return;
        }

        await updateMediatorQueueMessage(guild);

        await sendSafeReply(interaction, {
          content:
            "✅ Você entrou na fila de mediadores.",
          ephemeral: true
        });

        return;
      }

      if (id === "mediator_leave") {
        const removed = removeActiveMediator(
          guild.id,
          interaction.user.id
        );

        if (!removed) {
          await sendSafeReply(interaction, {
            content:
              "⚠️ Você não está na fila de mediadores.",
            ephemeral: true
          });
          return;
        }

        await updateMediatorQueueMessage(guild);

        await sendSafeReply(interaction, {
          content:
            "✅ Você saiu da fila de mediadores.",
          ephemeral: true
        });

        return;
      }

      if (id === "mediator_list") {
        const config = ensureMediatorConfig(
          getGuildConfig(guild.id)
        );

        const registered = getMediatorListText(guild.id);

        const active =
          config.activeMediators.length
            ? config.activeMediators
                .map((userId, index) =>
                  `**${index + 1}.** <@${userId}>`
                )
                .join("\n")
            : "Nenhum mediador está na fila.";

        await sendSafeReply(interaction, {
          content:
            `🛡️ **Mediadores cadastrados**\n\n` +
            `${registered}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `🟢 **Na fila agora**\n\n` +
            `${active}`,
          ephemeral: true
        });

        return;
      }

      if (id === "publish_mediator_queue") {
        const config = ensureMediatorConfig(
          getGuildConfig(guild.id)
        );

        if (!config.mediatorQueueChannelId) {
          const row = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId("mediator_queue_channel")
              .setPlaceholder(
                "Escolha o canal da fila de mediadores"
              )
              .addChannelTypes(ChannelType.GuildText)
              .setMinValues(1)
              .setMaxValues(1)
          );

          await sendSafeReply(interaction, {
            content:
              "📢 Escolha o canal onde a fila de mediadores será publicada:",
            components: [row],
            ephemeral: true
          });

          return;
        }

        try {
          await publishMediatorQueue(guild);

          await sendSafeReply(interaction, {
            content:
              "✅ Fila de mediadores publicada/atualizada.",
            ephemeral: true
          });
        } catch (error) {
          await sendSafeReply(interaction, {
            content:
              `❌ Não foi possível publicar a fila: ${error.message}`,
            ephemeral: true
          });
        }

        return;
      }

      // ------------------------------------------------------
      // ADM / PIX
      // ------------------------------------------------------

      if (id === "pix_add") {
        await interaction.showModal(createPixIdModal());
        return;
      }

      if (id === "pix_list") {
        await sendSafeReply(interaction, {
          content:
            `💠 **ADMs / Pix cadastrados**\n\n` +
            getPixAdminListText(guild.id),
          ephemeral: true
        });

        return;
      }

      // ------------------------------------------------------
      // FILAS
      // ------------------------------------------------------

      if (id === "queue_leave") {
        await handleQueueLeave(interaction);
        return;
      }

      if (id === "queue_cancel") {
        await handleQueueCancel(interaction);
        return;
      }

      if (id === "queue_confirm") {
        await handleQueueConfirm(interaction);
        return;
      }

      if (id === "queue_ice_normal") {
        await handleIceChoice(interaction, "ice_normal");
        return;
      }

      if (id === "queue_ice_infinite") {
        await handleIceChoice(interaction, "ice_infinite");
        return;
      }

      // ------------------------------------------------------
      // APOSTA
      // ------------------------------------------------------

      if (id.startsWith("bet_")) {
        await handleBetButton(interaction);
        return;
      }
    }

    // ========================================================
    // SELECT MENUS
    // ========================================================

    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
      return;
    }

    if (interaction.isChannelSelectMenu()) {
      await handleChannelSelect(interaction);
      return;
    }

    // ========================================================
    // MODAIS
    // ========================================================

    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      // ------------------------------------------------------
      // TAXA
      // ------------------------------------------------------

      if (id === "fee_modal") {
        const raw = interaction.fields
          .getTextInputValue("fee_cents")
          .trim();

        if (!/^\d+$/.test(raw)) {
          await sendSafeReply(interaction, {
            content:
              "❌ Digite somente números inteiros em centavos.",
            ephemeral: true
          });

          return;
        }

        const cents = Number(raw);

        if (!Number.isInteger(cents) ||
            cents < 0 ||
            cents > 100000) {
          await sendSafeReply(interaction, {
            content:
              "❌ A taxa deve estar entre 0 e 100000 centavos.",
            ephemeral: true
          });

          return;
        }

        const config = getGuildConfig(guild.id);

        config.admFee = cents;

        saveDatabase();

        await sendSafeReply(interaction, {
          content:
            `✅ Taxa definida para **R$ ${(cents / 100)
              .toFixed(2)
              .replace(".", ",")}**.`,
          ephemeral: true
        });

        return;
      }

      // ------------------------------------------------------
      // MEDIADOR
      // ------------------------------------------------------

      if (id === "mediator_modal") {
        const userId = interaction.fields
          .getTextInputValue("mediator_id")
          .trim();

        if (!/^\d{17,20}$/.test(userId)) {
          await sendSafeReply(interaction, {
            content:
              "❌ ID do Discord inválido.",
            ephemeral: true
          });

          return;
        }

        let user = null;

        try {
          user = await client.users.fetch(userId);
        } catch {
          await sendSafeReply(interaction, {
            content:
              "❌ Não encontrei esse usuário no Discord.",
            ephemeral: true
          });

          return;
        }

        const added = addMediator(
          guild.id,
          user.id,
          interaction.user.id
        );

        if (!added) {
          await sendSafeReply(interaction, {
            content:
              `⚠️ <@${user.id}> já está cadastrado como mediador.`,
            ephemeral: true
          });

          return;
        }

        await sendSafeReply(interaction, {
          content:
            `✅ <@${user.id}> foi cadastrado como mediador.`,
          ephemeral: true
        });

        return;
      }

      // ------------------------------------------------------
      // PIX — ETAPA 1
      // ------------------------------------------------------

      if (id === "pix_id_modal") {
        const userId = interaction.fields
          .getTextInputValue("pix_user_id")
          .trim();

        if (!/^\d{17,20}$/.test(userId)) {
          await sendSafeReply(interaction, {
            content:
              "❌ ID do Discord inválido.",
            ephemeral: true
          });

          return;
        }

        let user = null;

        try {
          user = await client.users.fetch(userId);
        } catch {
          await sendSafeReply(interaction, {
            content:
              "❌ Não encontrei esse usuário no Discord.",
            ephemeral: true
          });

          return;
        }

        await interaction.showModal(
          createPixDataModal(user.id)
        );

        return;
      }

      // ------------------------------------------------------
      // PIX — ETAPA 2
      // ------------------------------------------------------

      if (id.startsWith("pix_data_modal|")) {
        const [, userId] = id.split("|");

        const name = interaction.fields
          .getTextInputValue("admin_name")
          .trim();

        const key = interaction.fields
          .getTextInputValue("admin_pix_key")
          .trim();

        const qr = interaction.fields
          .getTextInputValue("admin_pix_qr")
          .trim();

        const config = ensureMediatorConfig(
          getGuildConfig(guild.id)
        );

        const existingIndex = config.pixAdmins.findIndex(
          admin =>
            (admin.userId || admin.id) === userId
        );

        const adminData = {
          id: userId,
          userId,
          name,
          key,
          qr: qr || null,
          addedBy: interaction.user.id,
          addedAt: new Date().toISOString()
        };

        if (existingIndex >= 0) {
          config.pixAdmins[existingIndex] = adminData;
        } else {
          config.pixAdmins.push(adminData);
        }

        saveDatabase();

        await sendSafeReply(interaction, {
          content:
            `✅ ADM/Pix configurado para <@${userId}>.\n\n` +
            `👤 Nome: **${name}**\n` +
            `💠 Pix: \`${key}\``,
          ephemeral: true
        });

        return;
      }

      // ------------------------------------------------------
      // OUTROS MODAIS DO SISTEMA
      // ------------------------------------------------------

      await handleModalSubmit(interaction);

      return;
    }

    // ========================================================
    // COMANDOS SLASH
    // ========================================================

    if (interaction.isChatInputCommand()) {
      if (!isAdministrator(interaction.member)) {
        await sendSafeReply(interaction, {
          content:
            "❌ Você precisa ser administrador para usar este comando.",
          ephemeral: true
        });

        return;
      }

      // ------------------------------------------------------
      // /CONFIG
      // ------------------------------------------------------

      if (interaction.commandName === "config") {
        await sendSafeReply(interaction, {
          content:
            "⚙️ **PAINEL DE CONFIGURAÇÃO**\n\n" +
            "Escolha uma categoria abaixo:",
          components: configButtons(),
          ephemeral: true
        });

        return;
      }

      // ------------------------------------------------------
      // /FILA
      // ------------------------------------------------------

      if (interaction.commandName === "fila") {
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("fila_format")
            .setPlaceholder("1️⃣ Escolha o formato")
            .addOptions(
              {
                label: "1x1",
                value: "1x1",
                description: "Fila para 1 jogador contra 1 jogador"
              },
              {
                label: "2x2",
                value: "2x2",
                description: "Fila para 2 jogadores contra 2 jogadores"
              },
              {
                label: "3x3",
                value: "3x3",
                description: "Fila para 3 jogadores contra 3 jogadores"
              },
              {
                label: "4x4",
                value: "4x4",
                description: "Fila para 4 jogadores contra 4 jogadores"
              }
            )
            .setMinValues(1)
            .setMaxValues(1)
        );

        await sendSafeReply(interaction, {
          content:
            "🎮 **CRIAR FILAS**\n\n" +
            "Primeiro escolha o formato:",
          components: [row],
          ephemeral: true
        });

        return;
      }

      // ------------------------------------------------------
      // /MED
      // ------------------------------------------------------

      if (interaction.commandName === "med") {
        const config = ensureMediatorConfig(
          getGuildConfig(guild.id)
        );

        if (!config.mediatorQueueChannelId) {
          const row = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId("mediator_queue_channel")
              .setPlaceholder(
                "Escolha o canal da fila de mediadores"
              )
              .addChannelTypes(ChannelType.GuildText)
              .setMinValues(1)
              .setMaxValues(1)
          );

          await sendSafeReply(interaction, {
            content:
              "🛡️ Escolha o canal onde a fila de mediadores será publicada:",
            components: [row],
            ephemeral: true
          });

          return;
        }

        try {
          await publishMediatorQueue(guild);

          await sendSafeReply(interaction, {
            content:
              "✅ Fila de mediadores publicada/atualizada.",
            ephemeral: true
          });
        } catch (error) {
          await sendSafeReply(interaction, {
            content:
              `❌ Não foi possível publicar a fila: ${error.message}`,
            ephemeral: true
          });
        }

        return;
      }
    }

  } catch (error) {
    console.error("Erro em InteractionCreate:", error);

    if (!interaction.replied && !interaction.deferred) {
      await sendSafeReply(interaction, {
        content:
          "❌ Ocorreu um erro ao processar essa interação.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});


// ============================================================
// REGISTRO DOS COMANDOS SLASH
// SOMENTE: /config /fila /med
// ============================================================

client.once(Events.ClientReady, async readyClient => {
  console.log(`✅ Bot conectado como ${readyClient.user.tag}`);

  try {
    const rest = new REST({
      version: "10"
    }).setToken(TOKEN);

    const commands = [
      new SlashCommandBuilder()
        .setName("config")
        .setDescription("Abrir o painel de configuração")
        .toJSON(),

      new SlashCommandBuilder()
        .setName("fila")
        .setDescription("Criar as filas de valores")
        .toJSON(),

      new SlashCommandBuilder()
        .setName("med")
        .setDescription("Publicar a fila de mediadores")
        .toJSON()
    ];

    // Limpa comandos globais antigos.
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      {
        body: []
      }
    );

    // Sobrescreve os comandos do servidor.
    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,
        GUILD_ID
      ),
      {
        body: commands
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
});


// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN);
