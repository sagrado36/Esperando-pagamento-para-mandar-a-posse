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
          "config_admins"
        )
        .setLabel(
          "ADMs"
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
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_queue"
        )
        .setLabel(
          "Filas"
        )
        .setStyle(
          ButtonStyle.Primary
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
}function roleConfigComponents() {
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
        .setChannelTypes(
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
        .setChannelTypes(
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
        .setChannelTypes(
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
        .setChannelTypes(
          ChannelType.GuildText
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mediator_add")
        .setLabel("Adicionar Mediador")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("mediator_list")
        .setLabel("Ver Mediadores")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("publish_mediator_queue")
        .setLabel("Publicar Fila")
        .setStyle(ButtonStyle.Primary)
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
          "Foto do bot"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "appearance_color"
        )
        .setLabel(
          "Cor da embed"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    backButton(),
  ];
}

function feeComponents() {
  const options = [];

  for (
    let i = 1;
    i <= 50;
    i++
  ) {
    options.push({
      label:
        formatMoney(i),
      value:
        String(i),
    });
  }

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          "select_adm_fee"
        )
        .setPlaceholder(
          "Selecione a taxa do ADM"
        )
        .addOptions(
          options
        )
    ),

    backButton(),
  ];
}

function adminComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("admin_add")
        .setLabel("Cadastrar ADM")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("admin_list")
        .setLabel("Ver ADMs")
        .setStyle(ButtonStyle.Secondary)
    ),

    backButton(),
  ];
}

function createAdminIdModal() {
  return new ModalBuilder()
    .setCustomId("admin_id_modal")
    .setTitle("Cadastrar ADM — 1/2")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_user_id")
          .setLabel("ID do usuário Discord")
          .setPlaceholder("Ex.: 123456789012345678")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(17)
          .setMaxLength(20)
      )
    );
}

function createAdminPixModal() {
  return new ModalBuilder()
    .setCustomId("admin_pix_modal")
    .setTitle("Cadastrar ADM — 2/2")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_name")
          .setLabel("Nome do ADM")
          .setPlaceholder("Nome para identificação")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_pix_key")
          .setLabel("Chave Pix")
          .setPlaceholder("CPF, CNPJ, e-mail, telefone ou chave aleatória")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_pix_qr")
          .setLabel("URL do QR Code Pix (opcional)")
          .setPlaceholder("Cole a URL da imagem do QR Code")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(1000)
      )
    );
}

function createFeeModal() {
  return new ModalBuilder()
    .setCustomId("fee_modal")
    .setTitle("Configurar Taxa do ADM")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("adm_fee")
          .setLabel("Taxa em centavos")
          .setPlaceholder("Ex.: 1 = R$ 0,01 | 100 = R$ 1,00")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(6)
      )
    );
}

function createAvatarModal() {
  return new ModalBuilder()
    .setCustomId(
      "avatar_modal"
    )
    .setTitle(
      "Foto do bot"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "avatar_url"
          )
          .setLabel(
            "URL da imagem"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(
            true
          )
          .setMaxLength(
            1000
          )
      )
    );
}

function createColorModal() {
  return new ModalBuilder()
    .setCustomId(
      "color_modal"
    )
    .setTitle(
      "Cor das embeds"
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
            "#000000"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(
            true
          )
          .setMaxLength(
            7
          )
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
      "Erro ao responder interação:",
      error
    );
  }
}

async function refreshQueueMessage(
  message
) {
  try {
    if (!message) {
      return;
    }

    const row =
      message.components?.find(
        (component) =>
          component.type === 1
      );

    if (!row) {
      return;
    }

    const button =
      row.components?.find(
        (component) =>
          typeof component.customId ===
            "string" &&
          component.customId.startsWith(
            "queue_join|"
          )
      );

    if (!button) {
      return;
    }

    const parts =
      button.customId.split("|");

    const format =
      parts[1];

    const mode =
      parts[2];

    const value =
      Number(parts[3]);

    const type =
      parts[4] || "normal";

    if (
      !format ||
      !mode ||
      !Number.isFinite(value)
    ) {
      return;
    }

    await message.edit({
      embeds: [
        queueEmbed(
          message.guild.id,
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
  } catch (error) {
    console.error(
      "Erro ao atualizar mensagem da fila:",
      error
    );
  }
}

async function refreshMediatorQueueMessage(
  guildId
) {
  try {
    const config =
      getGuildConfig(
        guildId
      );

    if (
      !config.mediatorQueueChannelId
    ) {
      return;
    }

    const channel =
      await client.channels.fetch(
        config.mediatorQueueChannelId
      );

    if (!channel) {
      return;
    }

    const messages =
      await channel.messages.fetch({
        limit: 100,
      });

    const queueMessage =
      messages.find(
        (message) =>
          message.author?.id ===
            client.user?.id &&
          message.components?.some(
            (row) =>
              row.components?.some(
                (component) =>
                  component.customId ===
                    "mediator_queue_join"
              )
          )
      );

    if (!queueMessage) {
      return;
    }

    await queueMessage.edit({
      embeds: [
        mediatorQueueEmbed(
          guildId
        ),
      ],
      components:
        mediatorQueueButtons(),
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar fila de mediadores:",
      error
    );
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
  if (!channel) {
    return null;
  }

  try {
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
    ] = message.id;

    saveDatabase();

    return message;
  } catch (error) {
    console.error(
      "Erro ao registrar mensagem da fila:",
      error
    );

    return null;
  }
}

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

  if (!channelId && mode === "mobile") {
    channelId =
      config.analysisChannelMobile;
  } else if (!channelId && mode === "emulador") {
    channelId =
      config.analysisChannelEmulator;
  } else if (!channelId && mode === "misto") {
    channelId =
      config.analysisChannelMobile ||
      config.analysisChannelEmulator;
  }

  if (!channelId) {
    throw new Error(
      `Canal não configurado para a modalidade ${mode}.`
    );
  }

  const channel =
    await guild.channels.fetch(
      channelId
    );

  if (!channel) {
    throw new Error(
      "Não foi possível encontrar o canal configurado."
    );
  }

  /*
   * Discord coloca a mensagem
   * mais nova embaixo.
   *
   * Portanto enviamos do maior
   * valor para o menor:
   *
   * 100
   * 50
   * 20
   * ...
   * 0,30
   *
   * Assim, visualmente:
   *
   * MAIOR
   * ↓
   * MENOR
   */
  const orderedValues =
    [...VALUES].sort(
      (a, b) => b - a
    );

  const createdMessages = [];

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

async function joinQueue(
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

  /*
   * 1x1 usa uma única fila
   * para Gelo Normal e Gelo
   * Infinito.
   */
  if (format === "1x1") {
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
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Você já está nessa fila.",
          ephemeral: true,
        }
      );

      return;
    }

    /*
     * Mantemos o tipo escolhido
     * pelo jogador.
     */
    const selectedType =
      type === "ice_infinite"
        ? "ice_infinite"
        : "ice_normal";

    queue.push(
      userId
    );

    choices[userId] =
      selectedType;

    saveDatabase();

    if (
      queue.length <
      requiredPlayers(format)
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            selectedType ===
            "ice_infinite"
              ? "♾️ Você entrou na fila de Gelo Infinito!"
              : "🧊 Você entrou na fila de Gelo Normal!",
          ephemeral: true,
        }
      );

      await refreshQueueMessage(
        interaction.message
      );

      return;
    }

    /*
     * Quando a fila 1x1 completa,
     * verificamos o tipo escolhido.
     *
     * Para uma partida existir,
     * os dois jogadores precisam
     * estar no mesmo tipo de gelo.
     */
    const selectedTypes =
      queue.map(
        (id) =>
          choices[id]
      );

    const firstType =
      selectedTypes[0];

    const sameType =
      selectedTypes.every(
        (item) =>
          item === firstType
      );

    if (!sameType) {
      /*
       * A fila continua cheia,
       * mas não iniciamos uma
       * aposta incompatível.
       */
      await sendSafeReply(
        interaction,
        {
          content:
            "⚠️ Os jogadores escolheram tipos de gelo diferentes. Para iniciar a partida, todos os jogadores dessa fila precisam escolher o mesmo tipo de gelo.",
          ephemeral: true,
        }
      );

      await refreshQueueMessage(
        interaction.message
      );

      return;
    }

    try {
      const bet =
        await createPrivateBetChannel(
          guild,
          format,
          mode,
          value,
          firstType,
          queue
        );

      db.bets[bet.id] =
        bet;

      db.queues[
        makeQueueKey(
          guild.id,
          format,
          mode,
          value
        )
      ] = [];

      clearQueueChoices(
        guild.id,
        format,
        mode,
        value
      );

      saveDatabase();

      await refreshQueueMessage(
        interaction.message
      );

      await sendSafeReply(
        interaction,
        {
          content:
            `🎮 Fila completa! A aposta foi criada: <#${bet.channelId}>`,
          ephemeral: true,
        }
      );
    } catch (error) {
      /*
       * Se a criação da aposta
       * falhar, devolvemos os
       * jogadores para a fila.
       */
      console.error(
        "Erro ao criar aposta 1x1:",
        error
      );

      db.queues[
        makeQueueKey(
          guild.id,
          format,
          mode,
          value
        )
      ] = queue;

      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Não foi possível criar a partida. Os jogadores continuam na fila.",
          ephemeral: true,
        }
      );

      await refreshQueueMessage(
        interaction.message
      );
    }

    return;
  }

  /*
   * 2x2, 3x3 e 4x4 continuam
   * usando filas separadas.
   */
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

    return;
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

    return;
  }

  queue.push(
    userId
  );

  saveDatabase();

  if (
    queue.length <
    requiredPlayers(format)
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Você entrou na fila!",
        ephemeral: true,
      }
    );

    await refreshQueueMessage(
      interaction.message
    );

    return;
  }

  try {
    const bet =
      await createPrivateBetChannel(
        guild,
        format,
        mode,
        value,
        type,
        queue
      );

    db.bets[bet.id] =
      bet;

    db.queues[
      makeQueueKey(
        guild.id,
        format,
        mode,
        value,
        type
      )
    ] = [];

    saveDatabase();

    await refreshQueueMessage(
      interaction.message
    );

    await sendSafeReply(
      interaction,
      {
        content:
          `🎮 Fila completa! A aposta foi criada: <#${bet.channelId}>`,
        ephemeral: true,
      }
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
          "❌ Não foi possível criar a partida.",
        ephemeral: true,
      }
    );
  }
}async function handleMediatorQueueButton(
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
          "❌ Você não possui o cargo de mediador configurado.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    interaction.customId ===
    "mediator_join"
  ) {
    if (
      config.mediatorQueue.includes(
        interaction.user.id
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

      return;
    }

    config.mediatorQueue.push(
      interaction.user.id
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

    await refreshMediatorQueueMessage(
      interaction.message
    );

    return;
  }

  if (
    interaction.customId ===
    "mediator_leave"
  ) {
    const index =
      config.mediatorQueue.indexOf(
        interaction.user.id
      );

    if (index === -1) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Você não está na fila de mediadores.",
          ephemeral: true,
        }
      );

      return;
    }

    config.mediatorQueue.splice(
      index,
      1
    );

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          "🚪 Você saiu da fila de mediadores.",
        ephemeral: true,
      }
    );

    await refreshMediatorQueueMessage(
      interaction.message
    );

    return;
  }
}


function mediatorQueueEmbed(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  const queue =
    config.mediatorQueue || [];

  const members =
    queue.length
      ? queue
          .map(
            (id, index) =>
              `**${index + 1}.** <@${id}>`
          )
          .join("\n")
      : "Nenhum mediador na fila.";

  return createEmbed(
    guildId,
    "🛡️ FILA DE MEDIADORES",
    [
      "Entre na fila para receber partidas.",
      "",
      `👥 **Na fila:** ${queue.length}`,
      "",
      members,
    ].join("\n")
  );
}


function mediatorQueueButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "mediator_join"
        )
        .setLabel(
          "Entrar na fila"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "mediator_leave"
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


async function refreshMediatorQueueMessage(
  message
) {
  if (!message) {
    return;
  }

  const guild =
    message.guild;

  if (!guild) {
    return;
  }

  try {
    await message.edit({
      embeds: [
        mediatorQueueEmbed(
          guild.id
        ),
      ],
      components:
        mediatorQueueButtons(),
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar fila de mediadores:",
      error
    );
  }
}


async function createPrivateBetChannel(
  guild,
  bet
) {
  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !config.betsCategoryId
  ) {
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
      "A categoria das apostas não foi encontrada."
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

  const overwrites = [
    {
      id:
        guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel,
      ],
    },
  ];

  for (
    const playerId of bet.players
  ) {
    overwrites.push({
      id: playerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  if (
    config.mediatorRoleId
  ) {
    overwrites.push({
      id:
        config.mediatorRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  if (
    config.analystRoleId
  ) {
    overwrites.push({
      id:
        config.analystRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  const channel =
    await guild.channels.create({
      name:
        `aposta-${bet.id}`,
      type:
        ChannelType.GuildText,
      parent:
        category.id,
      permissionOverwrites:
        overwrites,
    });

  const embed =
    betEmbed(
      guild.id,
      bet
    );

  const message =
    await channel.send({
      embeds: [
        embed,
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

  return bet;
}


function getNextMediator(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  const queue =
    config.mediatorQueue || [];

  if (!queue.length) {
    return null;
  }

  return queue[0];
}


async function assignMediator(
  guild,
  bet
) {
  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !config.mediatorRoleId
  ) {
    return null;
  }

  if (
    config.mediatorQueue &&
    config.mediatorQueue.length
  ) {
    const mediatorId =
      config.mediatorQueue.shift();

    saveDatabase();

    bet.mediatorId =
      mediatorId;

    return mediatorId;
  }

  const role =
    guild.roles.cache.get(
      config.mediatorRoleId
    );

  if (!role) {
    return null;
  }

  const mediator =
    role.members.first();

  if (!mediator) {
    return null;
  }

  bet.mediatorId =
    mediator.id;

  return mediator.id;
}


async function assignAnalyst(
  guild,
  bet
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

  const role =
    guild.roles.cache.get(
      config.analystRoleId
    );

  if (!role) {
    return null;
  }

  const analyst =
    role.members.first();

  if (!analyst) {
    return null;
  }

  bet.analystId =
    analyst.id;

  return analyst.id;
}


function betEmbed(
  guildId,
  bet
) {
  const statusText =
    bet.status ===
    "waiting"
      ? "🟡 Aguardando confirmação"
      : bet.status ===
        "running"
        ? "🟢 Partida em andamento"
        : bet.status ===
          "finished"
          ? "🏁 Partida finalizada"
          : "🔴 Partida cancelada";

  const players =
    bet.players &&
    bet.players.length
      ? bet.players
          .map(
            (id) =>
              `<@${id}>`
          )
          .join("\n")
      : "Nenhum jogador";

  return createEmbed(
    guildId,
    "🎮 APOSTA CRIADA",
    [
      `💰 **Valor:** ${formatMoney(
        bet.value
      )}`,
      `🎯 **Formato:** ${bet.format}`,
      `🎮 **Modalidade:** ${modeLabel(
        bet.mode
      )}`,
      "",
      `📊 **Status:** ${statusText}`,
      "",
      "👥 **Jogadores:**",
      players,
      "",
      bet.mediatorId
        ? `🛡️ **Mediador:** <@${bet.mediatorId}>`
        : "🛡️ **Mediador:** aguardando",
      bet.analystId
        ? `🔎 **Analista:** <@${bet.analystId}>`
        : "🔎 **Analista:** aguardando",
    ].join("\n")
  );
}


function betButtons(
  bet
) {
  if (
    bet.status !==
    "waiting"
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
        .setStyle(
          ButtonStyle.Danger
        )
    ),
  ];
}


async function refreshBetMessage(
  bet
) {
  if (
    !bet ||
    !bet.channelId
  ) {
    return;
  }

  try {
    const channel =
      await client.channels.fetch(
        bet.channelId
      );

    if (!channel) {
      return;
    }

    if (
      bet.betMessageId
    ) {
      try {
        const message =
          await channel.messages.fetch(
            bet.betMessageId
          );

        await message.edit({
          embeds: [
            betEmbed(
              channel.guild.id,
              bet
            ),
          ],
          components:
            betButtons(
              bet
            ),
        });

        return;
      } catch (error) {
        console.error(
          "Mensagem da aposta não encontrada pelo ID:",
          error
        );
      }
    }

    const messages =
      await channel.messages.fetch({
        limit: 100,
      });

    const message =
      messages.find(
        (msg) =>
          msg.author.id ===
            client.user.id &&
          msg.embeds[0] &&
          (
            msg.embeds[0].title ===
              "🎮 APOSTA CRIADA" ||
            msg.embeds[0].title ===
              "🎮 APOSTA"
          )
      );

    if (!message) {
      return;
    }

    bet.betMessageId =
      message.id;

    await message.edit({
      embeds: [
        betEmbed(
          channel.guild.id,
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
      "Erro ao atualizar mensagem da aposta:",
      error
    );
  }
}async function handleCommand(message) {
  if (!message.guild) {
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
    "config"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      await message.reply(
        "❌ Apenas administradores podem usar este comando."
      );

      return;
    }

    await message.reply({
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
        "❌ Apenas administradores podem criar filas."
      );

      return;
    }

    const row =
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(
            "fila_format"
          )
          .setPlaceholder(
            "Selecione o formato"
          )
          .addOptions(
            [
              "1x1",
              "2x2",
              "3x3",
              "4x4",
            ].map(
              (format) => ({
                label:
                  format,
                value:
                  format,
              })
            )
          )
      );

    await message.reply({
      content:
        "🎮 **CRIAR FILAS**\n\nSelecione o formato:",
      components: [
        row,
      ],
    });

    return;
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
      await message.reply(
        "❌ Apenas administradores podem publicar a fila de mediadores."
      );

      return;
    }

    const config =
      getGuildConfig(
        message.guild.id
      );

    if (
      !config.mediatorQueueChannelId
    ) {
      await message.reply(
        "❌ Configure primeiro o canal da fila de mediadores em `/config`."
      );

      return;
    }

    try {
      const channel =
        await message.guild.channels.fetch(
          config.mediatorQueueChannelId
        );

      if (
        !channel ||
        !channel.isTextBased()
      ) {
        throw new Error(
          "Canal da fila de mediadores inválido."
        );
      }

      await channel.send({
        embeds: [
          mediatorQueueEmbed(
            message.guild.id
          ),
        ],
        components:
          mediatorQueueButtons(),
      });

      await message.reply(
        `✅ Fila de mediadores publicada em <#${channel.id}>.`
      );
    } catch (error) {
      console.error(
        "Erro ao publicar fila de mediadores:",
        error
      );

      await message.reply(
        `❌ Não foi possível publicar a fila de mediadores: ${
          error.message ||
          "erro desconhecido"
        }`
      );
    }

    return;
  }

  if (
    command ===
    "ajuda"
  ) {
    await message.reply({
      embeds: [
        createEmbed(
          message.guild.id,
          "📚 COMANDOS",
          [
            "`/fila` — criar as 12 filas",
            "`/config` — configurar o bot",
            "`/med` — publicar a fila de mediadores",
            "",
            `Prefixo atual: \`${PREFIX}\``,
          ].join("\n")
        ),
      ],
    });

    return;
  }
}


function publishMediatorQueue(
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

  return guild.channels.fetch(
    config.mediatorQueueChannelId
  );
}


client.once(
  "ready",
  async () => {
    console.log(
      `✅ Bot conectado como ${client.user.tag}`
    );

    try {
      const guild =
        await client.guilds.fetch(
          GUILD_ID
        );

      if (!guild) {
        console.error(
          "❌ Servidor configurado não encontrado."
        );

        return;
      }

      await guild.commands.set([
        new SlashCommandBuilder()
          .setName(
            "fila"
          )
          .setDescription(
            "Cria as filas de apostas"
          )
          .toJSON(),
      ]);

      console.log(
        "✅ Comando /fila registrado com sucesso."
      );
    } catch (error) {
      console.error(
        "❌ Erro ao registrar /fila:",
        error
      );
    }
  }
);


client.on(
  "interactionCreate",
  async (
    interaction
  ) => {
    try {
      if (
        interaction.isButton()
      ) {
        await handleButton(
          interaction
        );

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
        await handleChannelSelect(
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
        interaction.isChatInputCommand()
      ) {
        if (
          interaction.commandName ===
          "fila"
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
                  "❌ Apenas administradores podem criar filas.",
                ephemeral: true,
              }
            );

            return;
          }

          const row =
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(
                  "fila_format"
                )
                .setPlaceholder(
                  "Selecione o formato"
                )
                .addOptions(
                  [
                    "1x1",
                    "2x2",
                    "3x3",
                    "4x4",
                  ].map(
                    (format) => ({
                      label:
                        format,
                      value:
                        format,
                    })
                  )
                )
            );

          await sendSafeReply(
            interaction,
            {
              content:
                "🎮 **CRIAR FILAS**\n\nSelecione o formato:",
              components: [
                row,
              ],
              ephemeral: true,
            }
          );
        }
      }
    } catch (error) {
      console.error(
        "Erro em interactionCreate:",
        error
      );

      try {
        await sendSafeReply(
          interaction,
          {
            content:
              "❌ Ocorreu um erro ao processar esta ação.",
            ephemeral: true,
          }
        );
      } catch {}
    }
  }
);


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
        "Erro em messageCreate:",
        error
      );
    }
  }
);


process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "Unhandled Rejection:",
      error
    );
  }
);


process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "Uncaught Exception:",
      error
    );
  }
);


if (!TOKEN) {
  console.error(
    "❌ TOKEN não configurado. Use DISCORD_TOKEN ou TOKEN nas variáveis de ambiente."
  );

  process.exit(
    1
  );
}


client
  .login(TOKEN)
  .then(() => {
    console.log(
      "🔄 Login do Discord iniciado..."
    );
  })
  .catch(
    (error) => {
      console.error(
        "❌ Erro ao fazer login no Discord:",
        error
      );
    }
  );  const args = content
    .slice(PREFIX.length)
    .trim()
    .split(/\s+/);

  const command = (args.shift() || "").toLowerCase();

  if (!command) return;

  const guild = message.guild;
  const config = getGuildConfig(guild.id);

  if (command === "fila") {
    if (!isAdministrator(message.member)) {
      return message.reply(
        "❌ Apenas administradores podem criar filas."
      );
    }

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("fila_format")
        .setPlaceholder("Selecione o formato")
        .addOptions(
          FORMATS.map((format) => ({
            label: format,
            value: format,
          }))
        )
    );

    await message.reply({
      content:
        "🎮 **Configuração da fila**\n\n" +
        "Primeiro, selecione o formato:",
      components: [row],
    });

    return;
  }

  if (command === "config") {
    if (!isAdministrator(message.member)) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    await message.reply({
      embeds: [
        configMainEmbed(guild),
      ],
      components:
        configButtons(),
    });

    return;
  }

  if (command === "filaadm") {
    if (!isAdministrator(message.member)) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    await publishMediatorQueue(guild);

    return;
  }

  if (command === "ssmob") {
    if (!isAdministrator(message.member)) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    try {
      await publishQueues(
        guild,
        "1x1",
        "mobile"
      );

      await message.reply(
        "✅ Filas Mobile publicadas."
      );
    } catch (error) {
      console.error(error);

      await message.reply(
        "❌ Não foi possível publicar as filas Mobile."
      );
    }

    return;
  }

  if (command === "ssemu") {
    if (!isAdministrator(message.member)) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    try {
      await publishQueues(
        guild,
        "1x1",
        "emulador"
      );

      await message.reply(
        "✅ Filas Emulador publicadas."
      );
    } catch (error) {
      console.error(error);

      await message.reply(
        "❌ Não foi possível publicar as filas Emulador."
      );
    }

    return;
  }

  if (command === "limparfila") {
    if (!isAdministrator(message.member)) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    const keys = Object.keys(
      db.queues || {}
    );

    for (const key of keys) {
      delete db.queues[key];
    }

    saveDatabase();

    await message.reply(
      "✅ Todas as filas foram limpas."
    );

    return;
  }

  if (command === "limparapostas") {
    if (!isAdministrator(message.member)) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    const bets = Object.values(
      db.bets || {}
    );

    for (const bet of bets) {
      try {
        const channel =
          await guild.channels.fetch(
            bet.channelId
          );

        if (channel) {
          await channel.delete().catch(() => {});
        }
      } catch {}

      delete db.bets[bet.id];
    }

    saveDatabase();

    await message.reply(
      "✅ Todas as apostas foram limpas."
    );

    return;
  }

  if (command === "ping") {
    await message.reply(
      `🏓 Pong! ${client.ws.ping}ms`
    );

    return;
  }

  if (command === "ajuda") {
    await message.reply({
      embeds: [
        createEmbed(
          guild.id,
          "📚 COMANDOS",
          `**${PREFIX}fila** — Criar filas\n` +
            `**${PREFIX}config** — Configurações\n` +
            `**${PREFIX}filaadm** — Publicar fila de mediadores\n` +
            `**${PREFIX}limparfila** — Limpar filas\n` +
            `**${PREFIX}limparapostas** — Limpar apostas\n` +
            `**${PREFIX}ping** — Ver ping do bot`
        ),
      ],
    });

    return;
  }
}

async function publishMediatorQueue(
  guild
) {
  const config = getGuildConfig(guild.id);

  if (!config.mediatorQueueChannelId) {
    throw new Error(
      "Canal da fila de mediadores não configurado."
    );
  }

  const channel = await guild.channels.fetch(
    config.mediatorQueueChannelId
  );

  if (!channel) {
    throw new Error(
      "Canal da fila de mediadores não encontrado."
    );
  }

  const message = await channel.send({
    embeds: [mediatorQueueEmbed(guild.id)],
    components: mediatorQueueButtons(),
  });

  config.mediatorQueueMessageId = message.id;
  saveDatabase();

  return message;
}


client.once(
  "ready",
  async () => {
    console.log(
      `✅ Bot conectado como ${client.user.tag}`
    );

    console.log(
      `📡 Servindo ${client.guilds.cache.size} servidor(es).`
    );

    for (
      const guild of client.guilds.cache.values()
    ) {
      try {
        await guild.commands.set([
          new SlashCommandBuilder()
            .setName("fila")
            .setDescription(
              "Cria as filas de apostas"
            )
            .toJSON(),
        ]);
      } catch (error) {
        console.error(
          `Erro ao registrar comandos em ${guild.id}:`,
          error
        );
      }
    }
  }
);

client.on(
  "interactionCreate",
  async (interaction) => {
    try {
      if (
        interaction.isButton()
      ) {
        await handleButton(
          interaction
        );

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
        await handleChannelSelect(
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
        interaction.isChatInputCommand()
      ) {
        if (
          interaction.commandName ===
          "fila"
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
                  "❌ Apenas administradores podem criar filas.",
                ephemeral: true,
              }
            );

            return;
          }

          const row =
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(
                  "fila_format"
                )
                .setPlaceholder(
                  "Selecione o formato"
                )
                .addOptions(
                  FORMATS.map(
                    (format) => ({
                      label:
                        format,
                      value:
                        format,
                    })
                  )
                )
            );

          await sendSafeReply(
            interaction,
            {
              content:
                "🎮 **Configuração da fila**\n\n" +
                "Selecione o formato:",
              components: [
                row,
              ],
              ephemeral: true,
            }
          );

          return;
        }
      }
    } catch (error) {
      console.error(
        "Erro em interactionCreate:",
        error
      );

      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Ocorreu um erro ao processar esta interação.",
          ephemeral: true,
        }
      );
    }
  }
);

client.on(
  "messageCreate",
  async (message) => {
    try {
      if (
        message.author.bot
      ) {
        return;
      }

      await handleCommand(
        message
      );
    } catch (error) {
      console.error(
        "Erro em messageCreate:",
        error
      );
    }
  }
);

process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "Unhandled Promise Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "Uncaught Exception:",
      error
    );
  }
);

client.login(TOKEN).catch(
  (error) => {
    console.error(
      "Erro ao fazer login:",
      error
    );
  }
);
