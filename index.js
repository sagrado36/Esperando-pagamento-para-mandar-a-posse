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
  10000,
  5000,
  2000,
  1000,
  700,
  500,
  300,
  200,
  100,
  75,
  50,
  30,
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
 * FILA:
 *
 * 1x1:
 * Normal e Infinito compartilham
 * a mesma fila.
 *
 * 2x2, 3x3 e 4x4:
 * possuem fila normal.
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
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_mediators"
        )
        .setLabel(
          "Mediadores"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    new ActionRowBuilder().addComponents(
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
}function channelConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("select_channel_mobile")
        .setPlaceholder("Selecione o Canal 1 — .ssmob")
        .addChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("select_channel_emulator")
        .setPlaceholder("Selecione o Canal 2 — .ssemu")
        .addChannelTypes(ChannelType.GuildText)
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
        .setCustomId("select_bets_category")
        .setPlaceholder("Selecione a categoria das apostas")
        .addChannelTypes(ChannelType.GuildCategory)
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
        .setCustomId("select_mediator_channel")
        .setPlaceholder("Selecione o canal da fila de mediadores")
        .addChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("pix_add")
        .setLabel("Cadastrar ADM")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("pix_list")
        .setLabel("Ver ADMs")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("publish_mediator_queue")
        .setLabel("Publicar fila de mediadores")
        .setStyle(ButtonStyle.Primary)
    ),

    backButton(),
  ];
}

function appearanceComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("appearance_avatar")
        .setLabel("Foto do bot")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("appearance_color")
        .setLabel("Cor da embed")
        .setStyle(ButtonStyle.Secondary)
    ),

    backButton(),
  ];
}

function feeComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_fee_set")
        .setLabel("Definir taxa do ADM")
        .setStyle(ButtonStyle.Primary)
    ),

    backButton(),
  ];
}

function pixComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("pix_add")
        .setLabel("Cadastrar ADM")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("pix_list")
        .setLabel("Ver ADMs")
        .setStyle(ButtonStyle.Secondary)
    ),

    backButton(),
  ];
}

function createPixModal() {
  return new ModalBuilder()
    .setCustomId("pix_modal")
    .setTitle("Cadastrar ADM / Pix")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("pix_name")
          .setLabel("Nome")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("pix_key")
          .setLabel("Chave Pix")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("pix_qr")
          .setLabel("URL do QR Code")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(1000)
      )
    );
}

function createAvatarModal() {
  return new ModalBuilder()
    .setCustomId("avatar_modal")
    .setTitle("Foto do bot")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("avatar_url")
          .setLabel("URL da imagem")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(1000)
      )
    );
}

function createColorModal() {
  return new ModalBuilder()
    .setCustomId("color_modal")
    .setTitle("Cor das embeds")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("embed_color")
          .setLabel("Cor hexadecimal")
          .setPlaceholder("#000000")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(7)
      )
    );
}

async function sendSafeReply(interaction, payload) {
  try {
    if (
      interaction.replied ||
      interaction.deferred
    ) {
      return await interaction.followUp(payload);
    }

    return await interaction.reply(payload);
  } catch (error) {
    console.error(
      "Erro ao responder interação:",
      error
    );
  }
}

async function refreshQueueMessage(message) {
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
          typeof component.customId === "string" &&
          component.customId.startsWith("queue_join|")
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

async function refreshMediatorQueueMessage(guildId) {
  try {
    const config =
      getGuildConfig(guildId);

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
      getGuildConfig(guildId);

    const key =
      makeQueueKey(
        guildId,
        format,
        mode,
        value,
        type
      );

    config.queueMessages[key] =
      message.id;

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
  channelOverride = null
) {
  const config =
    getGuildConfig(guild.id);

  let channelId =
    null;

  if (channelOverride) {
    channelId =
      channelOverride.id;
  } else if (mode === "mobile") {
    channelId =
      config.analysisChannelMobile;
  } else if (mode === "emulador") {
    channelId =
      config.analysisChannelEmulator;
  } else if (mode === "misto") {
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

    db.queues[
      makeQueueKey(
        guild.id,
        format,
        mode,
        value,
        type
      )
    ] = queue;

    saveDatabase();

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
}async function leaveQueue(
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

  const key =
    format === "1x1"
      ? makeQueueKey(
          guild.id,
          format,
          mode,
          value
        )
      : makeQueueKey(
          guild.id,
          format,
          mode,
          value,
          type
        );

  const queue =
    db.queues[key] || [];

  const index =
    queue.indexOf(userId);

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
    clearUserQueueChoice(
      guild.id,
      format,
      mode,
      value,
      userId
    );
  }

  saveDatabase();

  await refreshQueueMessage(
    interaction.message
  );

  await sendSafeReply(
    interaction,
    {
      content:
        "✅ Você saiu da fila.",
      ephemeral: true,
    }
  );
}

function createIceTypeRow(
  format,
  mode,
  value
) {
  return new ActionRowBuilder()
    .addComponents(
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
        )
    );
}

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
      createIceTypeRow(
        format,
        mode,
        value
      ),

      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              `queue_leave|${format}|${mode}|${value}`
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

  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `queue_join|${format}|${mode}|${value}|${type}`
          )
          .setLabel(
            "Entrar na fila"
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            `queue_leave|${format}|${mode}|${value}|${type}`
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

  const required =
    requiredPlayers(
      format
    );

  const config =
    getGuildConfig(
      guildId
    );

  const color =
    config.embedColor ||
    "#5865F2";

  const names =
    queue.length
      ? queue.map(
          (userId) =>
            `<@${userId}>`
        ).join("\n")
      : "Nenhum jogador na fila.";

  let description =
    `💰 **Valor:** ${formatMoney(value)}\n` +
    `🎮 **Formato:** ${formatFormat(format)}\n` +
    `📱 **Modalidade:** ${formatMode(mode)}\n\n` +
    `👥 **Jogadores:** ${queue.length}/${required}\n\n` +
    `${names}`;

  if (
    format === "1x1"
  ) {
    description +=
      "\n\n🧊 **Escolha o tipo de gelo ao entrar:**\n" +
      "🧊 Gelo Normal\n" +
      "♾️ Gelo Infinito";

    if (
      queue.length > 0
    ) {
      const choices =
        getQueueChoices(
          guildId,
          format,
          mode,
          value
        );

      const choiceLines =
        queue.map(
          (userId) => {
            const choice =
              choices[userId];

            if (
              choice ===
              "ice_infinite"
            ) {
              return `<@${userId}> — ♾️ Gelo Infinito`;
            }

            if (
              choice ===
              "ice_normal"
            ) {
              return `<@${userId}> — 🧊 Gelo Normal`;
            }

            return `<@${userId}> — aguardando escolha`;
          }
        );

      description +=
        "\n\n**Escolhas:**\n" +
        choiceLines.join("\n");
    }
  }

  return new EmbedBuilder()
    .setColor(
      color
    )
    .setTitle(
      `🎮 FILA ${formatFormat(format)} — ${formatMoney(value)}`
    )
    .setDescription(
      description
    )
    .setFooter({
      text:
        "Entre somente se estiver disponível para jogar.",
    })
    .setTimestamp();
}

function mediatorQueueEmbed(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  const queue =
    getMediatorQueue(
      guildId
    );

  const active =
    getActiveMediator(
      guildId
    );

  const color =
    config.embedColor ||
    "#5865F2";

  let description =
    "👑 **Fila de Mediadores**\n\n" +
    "Entre na fila para ficar disponível como mediador.\n\n";

  if (
    active
  ) {
    description +=
      `🎯 **Mediador da vez:** <@${active}>\n\n`;
  } else {
    description +=
      "🎯 **Mediador da vez:** Nenhum\n\n";
  }

  if (
    queue.length
  ) {
    description +=
      "**Fila atual:**\n" +
      queue.map(
        (userId, index) =>
          `${index + 1}. <@${userId}>`
      ).join("\n");
  } else {
    description +=
      "A fila de mediadores está vazia.";
  }

  return new EmbedBuilder()
    .setColor(
      color
    )
    .setTitle(
      "👑 FILA DE MEDIADORES"
    )
    .setDescription(
      description
    )
    .setFooter({
      text:
        "A ordem da fila é rotativa.",
    })
    .setTimestamp();
}

function mediatorQueueButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
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
      "O canal da fila de mediadores ainda não foi configurado."
    );
  }

  const channel =
    await guild.channels.fetch(
      config.mediatorQueueChannelId
    );

  if (!channel) {
    throw new Error(
      "Não foi possível encontrar o canal da fila de mediadores."
    );
  }

  const embed =
    mediatorQueueEmbed(
      guild.id
    );

  const components =
    mediatorQueueButtons();

  let existingMessage =
    null;

  if (
    config.mediatorQueueMessageId
  ) {
    try {
      existingMessage =
        await channel.messages.fetch(
          config.mediatorQueueMessageId
        );
    } catch {
      existingMessage =
        null;
    }
  }

  if (
    existingMessage
  ) {
    await existingMessage.edit({
      embeds: [
        embed,
      ],
      components,
    });

    return existingMessage;
  }

  const messages =
    await channel.messages.fetch({
      limit: 100,
    });

  existingMessage =
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

  if (
    existingMessage
  ) {
    config.mediatorQueueMessageId =
      existingMessage.id;

    await existingMessage.edit({
      embeds: [
        embed,
      ],
      components,
    });

    saveDatabase();

    return existingMessage;
  }

  const message =
    await channel.send({
      embeds: [
        embed,
      ],
      components,
    });

  config.mediatorQueueMessageId =
    message.id;

  saveDatabase();

  return message;
}

function getMediatorQueue(
  guildId
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
    config.mediatorQueue = [];
  }

  return config.mediatorQueue;
}

function getActiveMediator(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  const queue =
    getMediatorQueue(
      guildId
    );

  if (
    !queue.length
  ) {
    config.activeMediatorId =
      null;

    return null;
  }

  if (
    !queue.includes(
      config.activeMediatorId
    )
  ) {
    config.activeMediatorId =
      queue[0];
  }

  return config.activeMediatorId;
}

function addMediatorToQueue(
  guildId,
  userId
) {
  const queue =
    getMediatorQueue(
      guildId
    );

  if (
    queue.includes(
      userId
    )
  ) {
    return false;
  }

  queue.push(
    userId
  );

  const config =
    getGuildConfig(
      guildId
    );

  if (
    !config.activeMediatorId
  ) {
    config.activeMediatorId =
      userId;
  }

  saveDatabase();

  return true;
}

function removeMediatorFromQueue(
  guildId,
  userId
) {
  const queue =
    getMediatorQueue(
      guildId
    );

  const index =
    queue.indexOf(
      userId
    );

  if (
    index === -1
  ) {
    return false;
  }

  queue.splice(
    index,
    1
  );

  const config =
    getGuildConfig(
      guildId
    );

  if (
    config.activeMediatorId ===
    userId
  ) {
    config.activeMediatorId =
      queue.length
        ? queue[0]
        : null;
  }

  saveDatabase();

  return true;
}

function rotateMediator(
  guildId
) {
  const queue =
    getMediatorQueue(
      guildId
    );

  const config =
    getGuildConfig(
      guildId
    );

  if (
    queue.length <= 1
  ) {
    config.activeMediatorId =
      queue[0] || null;

    saveDatabase();

    return config.activeMediatorId;
  }

  const currentIndex =
    queue.indexOf(
      config.activeMediatorId
    );

  const nextIndex =
    currentIndex === -1
      ? 0
      : (
          currentIndex + 1
        ) % queue.length;

  config.activeMediatorId =
    queue[nextIndex];

  saveDatabase();

  return config.activeMediatorId;
}async function leaveQueue(
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
        "🚪 Você saiu da fila.",
      ephemeral: true,
    }
  );

  await refreshQueueMessage(
    interaction.message
  );
}

async function handleConfigButton(
  interaction
) {
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
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem usar esta configuração.",
        ephemeral: true,
      }
    );

    return;
  }

  const id =
    interaction.customId;

  if (
    id === "config_back"
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
    id === "config_roles"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🎭 CONFIGURAÇÃO DE CARGOS",
          "Selecione os cargos abaixo."
        ),
      ],
      components:
        roleConfigComponents(),
    });

    return;
  }

  if (
    id === "config_channels"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "📢 CONFIGURAÇÃO DE CANAIS",
          "Selecione os canais utilizados pelo bot."
        ),
      ],
      components:
        channelConfigComponents(),
    });

    return;
  }

  if (
    id === "config_bets"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🎲 CONFIGURAÇÃO DAS APOSTAS",
          "Selecione a categoria onde as salas de aposta serão criadas."
        ),
      ],
      components:
        betConfigComponents(),
    });

    return;
  }

  if (
    id === "config_mediators"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🛡️ CONFIGURAÇÃO DE MEDIADORES",
          "Selecione o canal onde a fila de mediadores será publicada."
        ),
      ],
      components:
        mediatorConfigComponents(),
    });

    return;
  }

  if (
    id === "config_appearance"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🎨 APARÊNCIA",
          "Escolha o que deseja configurar."
        ),
      ],
      components:
        appearanceComponents(),
    });

    return;
  }

  if (
    id === "config_fee_set"
  ) {
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(
          "fee_modal"
        )
        .setTitle(
          "Taxa do ADM"
        )
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(
                "fee_cents"
              )
              .setLabel(
                "Valor em centavos"
              )
              .setPlaceholder(
                "1 = R$0,01 | 100 = R$1,00"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(
                true
              )
          )
        )
    );

    return;
  }

  if (
    id === "config_fee"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "💸 TAXA DO ADM",
          "Configure o valor da taxa em centavos."
        ),
      ],
      components:
        feeComponents(),
    });

    return;
  }

  if (
    id === "config_queue"
  ) {
    const config =
      getGuildConfig(
        guild.id
      );

    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🎰 CONFIGURAÇÃO DAS FILAS",
          `Os valores disponíveis são:\n\n${VALUES
            .slice()
            .sort(
              (a, b) =>
                b - a
            )
            .map(
              (value) =>
                `💰 ${formatMoney(
                  value
                )}`
            )
            .join("\n")}\n\n` +
            `📱 Mobile: ${
              config.analysisChannelMobile
                ? `<#${config.analysisChannelMobile}>`
                : "não configurado"
            }\n` +
            `🖥️ Emulador: ${
              config.analysisChannelEmulator
                ? `<#${config.analysisChannelEmulator}>`
                : "não configurado"
            }`,
        ),
      ],
      components: [
        backButton(),
      ],
    });

    return;
  }

  if (
    id === "appearance_avatar"
  ) {
    await interaction.showModal(
      createAvatarModal()
    );

    return;
  }

  if (
    id === "appearance_color"
  ) {
    await interaction.showModal(
      createColorModal()
    );

    return;
  }

  if (
    id === "pix_add"
  ) {
    await interaction.showModal(
      createPixModal()
    );

    return;
  }

  if (
    id === "pix_list"
  ) {
    const config =
      getGuildConfig(
        guild.id
      );

    const list =
      config.pixAdmins.length
        ? config.pixAdmins
            .map(
              (item, index) =>
                `**${index + 1}.** ${item.name} — \`${item.key}\``
            )
            .join("\n")
        : "Nenhum ADM cadastrado.";

    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "💳 ADM / PIX CADASTRADOS",
          list
        ),
      ],
      components: [
        backButton(),
      ],
    });

    return;
  }

  if (
    id ===
    "publish_mediator_queue"
  ) {
    const config =
      getGuildConfig(
        guild.id
      );

    if (
      !config.mediatorQueueChannelId
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Configure primeiro o canal da fila de mediadores.",
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
            `✅ Fila de mediadores publicada/atualizada em <#${config.mediatorQueueChannelId}>.`,
          ephemeral: true,
        }
      );
    } catch (error) {
      await sendSafeReply(
        interaction,
        {
          content:
            `❌ Não foi possível publicar a fila: ${error.message}`,
          ephemeral: true,
        }
      );
    }

    return;
  }
}

async function handleRoleSelect(
  interaction
) {
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
      interaction.values[0];

    saveDatabase();

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
    interaction.customId ===
    "select_analyst_role"
  ) {
    config.analystRoleId =
      interaction.values[0];

    saveDatabase();

    await interaction.update({
      embeds: [
        configMainEmbed(
          guild
        ),
      ],
      components:
        configButtons(),
    });
  }
}

async function handleChannelSelect(
  interaction
) {
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
    return;
  }

  const config =
    getGuildConfig(
      guild.id
    );

  const channelId =
    interaction.values[0];

  if (
    interaction.customId.startsWith(
      "fila_channel|"
    )
  ) {
    const [
      ,
      format,
      mode,
    ] =
      interaction.customId.split(
        "|"
      );

    try {
      await publishQueues(
        guild,
        format,
        mode,
        channelId
      );

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

  if (
    interaction.customId ===
    "select_channel_mobile"
  ) {
    config.analysisChannelMobile =
      channelId;
  }

  if (
    interaction.customId ===
    "select_channel_emulator"
  ) {
    config.analysisChannelEmulator =
      channelId;
  }

  if (
    interaction.customId ===
    "select_bets_category"
  ) {
    config.betsCategoryId =
      channelId;
  }

  if (
    interaction.customId ===
    "select_mediator_channel"
  ) {
    config.mediatorQueueChannelId =
      channelId;
  }

  saveDatabase();

  await interaction.update({
    embeds: [
      configMainEmbed(
        guild
      ),
    ],
    components:
      configButtons(),
  });
}

async function handleStringSelect(
  interaction
) {
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
    return;
  }

  const id =
    interaction.customId;

  if (
    id === "select_adm_fee"
  ) {
    const config =
      getGuildConfig(
        guild.id
      );

    config.admFee =
      Number(
        interaction.values[0]
      );

    saveDatabase();

    await interaction.update({
      embeds: [
        configMainEmbed(
          guild
        ),
      ],
      components:
        configButtons(),
    });
  }
}

async function handleModalSubmit(
  interaction
) {
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
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem usar esta configuração.",
        ephemeral: true,
      }
    );

    return;
  }

  const id =
    interaction.customId;

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    id === "fee_modal"
  ) {
    const cents =
      Number(
        interaction.fields
          .getTextInputValue(
            "fee_cents"
          )
          .trim()
      );

    if (
      !Number.isInteger(
        cents
      ) ||
      cents < 0 ||
      cents > 100000
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Informe um número inteiro entre 0 e 100000 centavos.",
          ephemeral: true,
        }
      );

      return;
    }

    config.admFee =
      cents;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Taxa salva: **${formatMoney(
            cents
          )}**.`,
        ephemeral: true,
      }
    );

    return;
  }

  if (
    id === "pix_modal"
  ) {
    const name =
      interaction.fields.getTextInputValue(
        "pix_name"
      );

    const key =
      interaction.fields.getTextInputValue(
        "pix_key"
      );

    const qr =
      interaction.fields.getTextInputValue(
        "pix_qr"
      );

    config.pixAdmins.push({
      id:
        interaction.user.id,
      name,
      key,
      qr,
    });

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ ADM/Pix cadastrado com sucesso.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    id === "avatar_modal"
  ) {
    const avatarUrl =
      interaction.fields.getTextInputValue(
        "avatar_url"
      );

    config.botAvatar =
      avatarUrl;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Foto do bot salva com sucesso.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    id === "color_modal"
  ) {
    const color =
      interaction.fields.getTextInputValue(
        "embed_color"
      );

    if (
      !/^#?[0-9A-Fa-f]{6}$/.test(
        color.trim()
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Cor inválida. Use, por exemplo, `#5865F2`.",
          ephemeral: true,
        }
      );

      return;
    }

    config.embedColor =
      normalizeColor(
        color
      );

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Cor alterada para ${config.embedColor}.`,
        ephemeral: true,
      }
    );

    return;
  }
}

async function handleMediatorQueueButton(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  const member =
    interaction.member;

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !config.mediatorRoleId
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ O cargo de Mediador ainda não foi configurado.",
        ephemeral: true,
      }
    );

    return;
  }

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

    await interaction.message.edit({
      embeds: [
        mediatorQueueEmbed(
          guild.id
        ),
      ],
      components:
        mediatorQueueButtons(),
    });

    return;
  }

  if (
    interaction.customId ===
    "mediator_queue_leave"
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

    await interaction.message.edit({
      embeds: [
        mediatorQueueEmbed(
          guild.id
        ),
      ],
      components:
        mediatorQueueButtons(),
    });
  }
}

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

  if (!category) {
    throw new Error(
      "Categoria das apostas não encontrada."
    );
  }

  const validPlayers =
    Array.isArray(players)
      ? [...players]
      : [];

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionsBitField.Flags.ViewChannel,
      ],
    },
  ];

  for (
    const userId of validPlayers
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

  const suffix =
    format === "1x1"
      ? type === "ice_infinite"
        ? "-infinito"
        : "-normal"
      : "";

  const channelName =
    `aposta-${format}-${mode}-${value}${suffix}`
      .toLowerCase()
      .replace(
        /[^a-z0-9-]/g,
        ""
      );

  const channel =
    await guild.channels.create({
      name:
        channelName.slice(
          0,
          100
        ),
      type:
        ChannelType.GuildText,
      parent:
        config.betsCategoryId,
      permissionOverwrites:
        overwrites,
    });

  const betId =
    generateId(
      "bet"
    );

  const bet = {
    id: betId,
    channelId:
      channel.id,
    guildId:
      guild.id,
    format,
    mode,
    value:
      Number(value),
    type,
    players:
      validPlayers,
    status:
      "waiting",
    createdAt:
      Date.now(),
    mediatorId:
      null,
    analystId:
      null,
    winnerId:
      null,
  };

  const description =
    format === "1x1"
      ? type === "ice_infinite"
        ? "♾️ **Gelo Infinito**"
        : "🧊 **Gelo Normal**"
      : "🎮 Partida";

  await channel.send({
    embeds: [
      createEmbed(
        guild.id,
        "🎮 APOSTA CRIADA",
        `💰 **Valor:** ${formatMoney(
          value
        )}\n` +
          `🎯 **Formato:** ${format}\n` +
          `📌 **Modalidade:** ${modeLabel(
            mode
          )}\n` +
          `❄️ **Tipo:** ${description}\n\n` +
          `👥 **Jogadores:** ${validPlayers
            .map(
              (id) =>
                `<@${id}>`
            )
            .join(", ")}\n\n` +
          `⏳ Aguardando configuração da partida.`
      ),
    ],
  });

  return bet;
}async function getNextMediator(guildId) {
  const config = getGuildConfig(guildId);

  if (
    !Array.isArray(config.mediatorQueue) ||
    config.mediatorQueue.length === 0
  ) {
    return null;
  }

  let index = Number(config.mediatorRotationIndex);

  if (!Number.isFinite(index) || index < 0) {
    index = 0;
  }

  if (index >= config.mediatorQueue.length) {
    index = 0;
  }

  const mediatorId = config.mediatorQueue[index];

  config.mediatorRotationIndex =
    (index + 1) % config.mediatorQueue.length;

  saveDatabase();

  return mediatorId;
}

async function assignMediator(guild, bet) {
  const mediatorId = await getNextMediator(guild.id);

  if (!mediatorId) {
    return null;
  }

  bet.mediatorId = mediatorId;

  saveDatabase();

  try {
    const channel = await guild.channels.fetch(bet.channelId);

    if (channel) {
      await channel.permissionOverwrites.edit(
        mediatorId,
        {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        }
      );

      await channel.send({
        content:
          `🛡️ Mediador selecionado: <@${mediatorId}>`,
      });
    }
  } catch (error) {
    console.error(
      "Erro ao atribuir mediador:",
      error
    );
  }

  return mediatorId;
}

async function assignAnalyst(guild, bet) {
  const config = getGuildConfig(guild.id);

  if (!config.analystRoleId) {
    return null;
  }

  try {
    const role = await guild.roles.fetch(
      config.analystRoleId
    );

    if (!role) {
      return null;
    }

    const members = role.members;

    if (!members || members.size === 0) {
      return null;
    }

    const analyst = members.first();

    if (!analyst) {
      return null;
    }

    bet.analystId = analyst.id;

    saveDatabase();

    const channel =
      await guild.channels.fetch(
        bet.channelId
      );

    if (channel) {
      await channel.permissionOverwrites.edit(
        analyst.id,
        {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        }
      );

      await channel.send({
        content:
          `🔎 Analista selecionado: <@${analyst.id}>`,
      });
    }

    return analyst.id;
  } catch (error) {
    console.error(
      "Erro ao atribuir analista:",
      error
    );

    return null;
  }
}

function betEmbed(guildId, bet) {
  const players =
    Array.isArray(bet.players)
      ? bet.players
          .map(
            (id, index) =>
              `**${index + 1}.** <@${id}>`
          )
          .join("\n")
      : "Nenhum";

  const status =
    bet.status === "waiting"
      ? "⏳ Aguardando"
      : bet.status === "running"
      ? "🟢 Em andamento"
      : bet.status === "finished"
      ? "🏆 Finalizada"
      : bet.status;

  return createEmbed(
    guildId,
    "🎮 APOSTA",
    `💰 **Valor:** ${formatMoney(bet.value)}\n` +
      `🎯 **Formato:** ${bet.format}\n` +
      `📌 **Modalidade:** ${modeLabel(bet.mode)}\n` +
      `❄️ **Tipo:** ${
        bet.type === "ice_infinite"
          ? "♾️ Gelo Infinito"
          : "🧊 Gelo Normal"
      }\n` +
      `📊 **Status:** ${status}\n\n` +
      `👥 **Jogadores:**\n${players}`
  );
}

function betButtons(bet) {
  const buttons = [];

  if (bet.status !== "finished") {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(
          `bet_confirm|${bet.id}`
        )
        .setLabel("Confirmar")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          `bet_cancel|${bet.id}`
        )
        .setLabel("Cancelar")
        .setStyle(ButtonStyle.Danger)
    );
  }

  return [
    new ActionRowBuilder().addComponents(
      buttons
    ),
  ];
}

async function refreshBetMessage(guild, bet) {
  try {
    const channel =
      await guild.channels.fetch(
        bet.channelId
      );

    if (!channel) {
      return;
    }

    const messages =
      await channel.messages.fetch({
        limit: 100,
      });

    const botMessage =
      messages.find(
        (message) =>
          message.author?.id === client.user?.id &&
          message.embeds?.some(
            (embed) =>
              embed.title === "🎮 APOSTA"
          )
      );

    if (!botMessage) {
      return;
    }

    await botMessage.edit({
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

async function handleBetConfirm(interaction) {
  const parts =
    interaction.customId.split("|");

  const betId = parts[1];

  const bet = db.bets[betId];

  if (!bet) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Aposta não encontrada.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    !bet.players.includes(
      interaction.user.id
    ) &&
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
          "❌ Você não participa dessa aposta.",
        ephemeral: true,
      }
    );

    return;
  }

  if (bet.status === "finished") {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa aposta já foi finalizada.",
        ephemeral: true,
      }
    );

    return;
  }

  bet.status = "running";

  saveDatabase();

  await assignMediator(
    interaction.guild,
    bet
  );

  await assignAnalyst(
    interaction.guild,
    bet
  );

  await refreshBetMessage(
    interaction.guild,
    bet
  );

  await sendSafeReply(
    interaction,
    {
      content:
        "✅ Aposta confirmada e iniciada.",
      ephemeral: true,
    }
  );
}

async function handleBetCancel(interaction) {
  const parts =
    interaction.customId.split("|");

  const betId = parts[1];

  const bet = db.bets[betId];

  if (!bet) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Aposta não encontrada.",
        ephemeral: true,
      }
    );

    return;
  }

  const allowed =
    isAdministrator(
      interaction.member
    ) ||
    hasMediatorRole(
      interaction.member,
      interaction.guild.id
    ) ||
    bet.players.includes(
      interaction.user.id
    );

  if (!allowed) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para cancelar essa aposta.",
        ephemeral: true,
      }
    );

    return;
  }

  bet.status = "cancelled";

  saveDatabase();

  await sendSafeReply(
    interaction,
    {
      content:
        "❌ Aposta cancelada.",
      ephemeral: true,
    }
  );

  try {
    const channel =
      await interaction.guild.channels.fetch(
        bet.channelId
      );

    if (channel) {
      await channel.send({
        content:
          "❌ Esta aposta foi cancelada.",
      });
    }
  } catch (error) {
    console.error(
      "Erro ao avisar cancelamento:",
      error
    );
  }
}

async function handleButton(interaction) {
  const id =
    interaction.customId;

  if (id.startsWith("queue_join|")) {
    const parts =
      id.split("|");

    await joinQueue(
      interaction,
      parts[1],
      parts[2],
      Number(parts[3]),
      parts[4] || "normal"
    );

    return;
  }

  if (id.startsWith("queue_leave|")) {
    const parts =
      id.split("|");

    await leaveQueue(
      interaction,
      parts[1],
      parts[2],
      Number(parts[3]),
      parts[4] || "normal"
    );

    return;
  }

  if (
    id === "mediator_queue_join" ||
    id === "mediator_queue_leave"
  ) {
    await handleMediatorQueueButton(
      interaction
    );

    return;
  }

  if (id.startsWith("bet_confirm|")) {
    await handleBetConfirm(
      interaction
    );

    return;
  }

  if (id.startsWith("bet_cancel|")) {
    await handleBetCancel(
      interaction
    );

    return;
  }

  if (
    id.startsWith("config_") ||
    id === "publish_mediator_queue" ||
    id.startsWith("appearance_") ||
    id.startsWith("pix_")
  ) {
    await handleConfigButton(
      interaction
    );

    return;
  }
}

async function handleSelectMenu(interaction) {
  const id =
    interaction.customId;

  if (
    id === "select_mediator_role" ||
    id === "select_analyst_role"
  ) {
    await handleRoleSelect(
      interaction
    );

    return;
  }

  if (id === "fila_format") {
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

    const format =
      interaction.values[0];

    const row =
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(
            `fila_mode|${format}`
          )
          .setPlaceholder(
            "2️⃣ Selecione a modalidade"
          )
          .addOptions(
            MODES.map(
              (mode) => ({
                label:
                  modeLabel(
                    mode
                  ).replace(
                    /^\S+\s*/,
                    ""
                  ),
                value: mode,
              })
            )
          )
      );

    await sendSafeReply(
      interaction,
      {
        content:
          `🎮 **Formato:** ${format}\n\n` +
          `2️⃣ Escolha a modalidade:`,
        components: [row],
        ephemeral: true,
      }
    );

    return;
  }

  if (
    id.startsWith(
      "fila_mode|"
    )
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
            "❌ Apenas administradores podem criar filas.",
          ephemeral: true,
        }
      );
    }

    const [, format] =
      id.split("|");

    const mode =
      interaction.values[0];

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

    await sendSafeReply(
      interaction,
      {
        content:
          `🎮 **Formato:** ${format}\n` +
          `📌 **Modalidade:** ${modeLabel(
            mode
          )}\n\n` +
          `3️⃣ Escolha o canal onde as 12 filas serão publicadas:`,
        components: [row],
        ephemeral: true,
      }
    );

    return;
  }

  if (
    id === "select_channel_mobile" ||
    id === "select_channel_emulator" ||
    id === "select_bets_category" ||
    id === "select_mediator_channel"
  ) {
    await handleChannelSelect(
      interaction
    );

    return;
  }

  await handleStringSelect(
    interaction
  );
}

async function handleCommand(message) {
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
      .slice(
        PREFIX.length
      )
      .trim()
      .split(/\s+/);

  const command =
    (
      args.shift() || ""
    ).toLowerCase();

  if (!command) {
    return;
  }

  const guild =
    message.guild;

  const config =
    getGuildConfig(
      guild.id
    );

  if (command === "fila") {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Apenas administradores podem criar filas."
      );
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
                label: format,
                value: format,
              })
            )
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
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    await message.reply({
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

  if (command === "filaadm") {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    await publishMediatorQueue(
      guild
    );

    return;
  }

  if (command === "ssmob") {
    if (
      !isAdministrator(
        message.member
      )
    ) {
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
    if (
      !isAdministrator(
        message.member
      )
    ) {
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
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    const keys =
      Object.keys(
        db.queues || {}
      );

    for (
      const key of keys
    ) {
      delete db.queues[key];
    }

    saveDatabase();

    await message.reply(
      "✅ Todas as filas foram limpas."
    );

    return;
  }

  if (command === "limparapostas") {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    const bets =
      Object.values(
        db.bets || {}
      );

    for (
      const bet of bets
    ) {
      try {
        const channel =
          await guild.channels.fetch(
            bet.channelId
          );

        if (channel) {
          await channel.delete()
            .catch(() => {});
        }
      } catch {}

      delete db.bets[
        bet.id
      ];
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

async function publishMediatorQueue(guild) {
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

  const channel =
    await guild.channels.fetch(
      config.mediatorQueueChannelId
    );

  if (!channel) {
    throw new Error(
      "Canal da fila de mediadores não encontrado."
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

client.once(
  "ready",
  async () => {
    console.log(
      `✅ Bot conectado como ${client.user.tag}`
    );

    console.log(
      `📡 Servindo ${client.guilds.cache.size} servidor(es).`
    );

    const rest =
      new REST({
        version: "10",
      }).setToken(
        TOKEN
      );

    const commands = [
      new SlashCommandBuilder()
        .setName("config")
        .setDescription(
          "Abrir configurações do bot"
        )
        .toJSON(),

      new SlashCommandBuilder()
        .setName("fila")
        .setDescription(
          "Publicar as 12 filas"
        )
        .toJSON(),

      new SlashCommandBuilder()
        .setName("med")
        .setDescription(
          "Publicar a fila de mediadores"
        )
        .toJSON(),
    ];

    try {
      await rest.put(
        Routes.applicationCommands(
          CLIENT_ID
        ),
        {
          body: [],
        }
      );

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
        "Erro ao registrar slash commands:",
        error
      );
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
          !isAdministrator(
            interaction.member
          )
        ) {
          return sendSafeReply(
            interaction,
            {
              content:
                "❌ Apenas administradores podem usar este comando.",
              ephemeral: true,
            }
          );
        }

        if (
          interaction.commandName ===
          "config"
        ) {
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

        if (
          interaction.commandName ===
          "fila"
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
                    })
                  )
                )
            );

          return sendSafeReply(
            interaction,
            {
              content:
                "🎮 **Configuração da fila**\n\n" +
                "1️⃣ Escolha o formato:",
              components: [row],
              ephemeral: true,
            }
          );
        }

        if (
          interaction.commandName ===
          "med"
        ) {
          const config =
            getGuildConfig(
              interaction.guild.id
            );

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

            return sendSafeReply(
              interaction,
              {
                content:
                  "📺 Escolha o canal da fila de mediadores:",
                components: [row],
                ephemeral: true,
              }
            );
          }

          await publishMediatorQueue(
            interaction.guild
          );

          return sendSafeReply(
            interaction,
            {
              content:
                "✅ Fila de mediadores publicada.",
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

client.login(
  TOKEN
).catch(
  (error) => {
    console.error(
      "Erro ao fazer login:",
      error
    );
  }
);
