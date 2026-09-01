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
          "config_pix"
        )
        .setLabel(
          "Pix"
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
  ];
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

function pixComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "pix_add"
        )
        .setLabel(
          "Cadastrar ADM"
        )
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
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    backButton(),
  ];
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
            "Nome"
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
            "pix_key"
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
            "pix_qr"
          )
          .setLabel(
            "URL do QR Code"
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
}async function refreshQueueMessage(
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
  mode
) {
  const config =
    getGuildConfig(
      guild.id
    );

  let channelId =
    null;

  if (mode === "mobile") {
    channelId =
      config.analysisChannelMobile;
  } else if (
    mode === "emulador"
  ) {
    channelId =
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
}

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
    id === "config_fee"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "💸 TAXA DO ADM",
          "Selecione o valor da taxa."
        ),
      ],
      components:
        feeComponents(),
    });

    return;
  }

  if (
    id === "config_pix"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "💳 PIX",
          "Gerencie os administradores responsáveis pelo recebimento."
        ),
      ],
      components:
        pixComponents(),
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
            }`
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

    const channel =
      await guild.channels.fetch(
        config.mediatorQueueChannelId
      );

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

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Fila de mediadores publicada em <#${channel.id}>.`,
        ephemeral: true,
      }
    );

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
}async function handleModalSubmit(
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
      id: interaction.user.id,
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
}

async function getNextMediator(
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

  let index =
    Number(
      config.mediatorRotationIndex
    );

  if (
    !Number.isFinite(index) ||
    index < 0
  ) {
    index = 0;
  }

  if (
    index >=
    config.mediatorQueue.length
  ) {
    index = 0;
  }

  const mediatorId =
    config.mediatorQueue[
      index
    ];

  config.mediatorRotationIndex =
    (index + 1) %
    config.mediatorQueue.length;

  saveDatabase();

  return mediatorId;
}

async function assignMediator(
  guild,
  bet
) {
  const mediatorId =
    await getNextMediator(
      guild.id
    );

  if (!mediatorId) {
    return null;
  }

  bet.mediatorId =
    mediatorId;

  saveDatabase();

  try {
    const channel =
      await guild.channels.fetch(
        bet.channelId
      );

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

  try {
    const role =
      await guild.roles.fetch(
        config.analystRoleId
      );

    if (!role) {
      return null;
    }

    const members =
      role.members;

    if (
      !members ||
      members.size === 0
    ) {
      return null;
    }

    const analyst =
      members.first();

    if (!analyst) {
      return null;
    }

    bet.analystId =
      analyst.id;

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

function betEmbed(
  guildId,
  bet
) {
  const players =
    Array.isArray(
      bet.players
    )
      ? bet.players
          .map(
            (id, index) =>
              `**${index + 1}.** <@${id}>`
          )
          .join("\n")
      : "Nenhum";

  const status =
    bet.status ===
    "waiting"
      ? "⏳ Aguardando"
      : bet.status ===
        "running"
      ? "🟢 Em andamento"
      : bet.status ===
        "finished"
      ? "🏆 Finalizada"
      : bet.status;

  return createEmbed(
    guildId,
    "🎮 APOSTA",
    `💰 **Valor:** ${formatMoney(
      bet.value
    )}\n` +
      `🎯 **Formato:** ${bet.format}\n` +
      `📌 **Modalidade:** ${modeLabel(
        bet.mode
      )}\n` +
      `❄️ **Tipo:** ${
        bet.type ===
        "ice_infinite"
          ? "♾️ Gelo Infinito"
          : "🧊 Gelo Normal"
      }\n` +
      `📊 **Status:** ${status}\n\n` +
      `👥 **Jogadores:**\n${players}`
  );
}

function betButtons(
  bet
) {
  const buttons = [];

  if (
    bet.status !==
    "finished"
  ) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(
          `bet_confirm|${bet.id}`
        )
        .setLabel(
          "Confirmar"
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
        .setStyle(
          ButtonStyle.Danger
        )
    );
  }

  return [
    new ActionRowBuilder().addComponents(
      buttons
    ),
  ];
}

async function refreshBetMessage(
  guild,
  bet
) {
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
          message.author?.id ===
          client.user?.id &&
          message.embeds?.some(
            (embed) =>
              embed.title ===
              "🎮 APOSTA"
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

async function handleBetConfirm(
  interaction
) {
  const parts =
    interaction.customId.split(
      "|"
    );

  const betId =
    parts[1];

  const bet =
    db.bets[betId];

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

  if (
    bet.status ===
    "finished"
  ) {
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

  bet.status =
    "running";

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

async function handleBetCancel(
  interaction
) {
  const parts =
    interaction.customId.split(
      "|"
    );

  const betId =
    parts[1];

  const bet =
    db.bets[betId];

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

  bet.status =
    "cancelled";

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

    await joinQueue(
      interaction,
      parts[1],
      parts[2],
      Number(parts[3]),
      parts[4] || "normal"
    );

    return;
  }

  if (
    id.startsWith(
      "queue_leave|"
    )
  ) {
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
    id ===
      "mediator_queue_join" ||
    id ===
      "mediator_queue_leave"
  ) {
    await handleMediatorQueueButton(
      interaction
    );

    return;
  }

  if (
    id.startsWith(
      "bet_confirm|"
    )
  ) {
    await handleBetConfirm(
      interaction
    );

    return;
  }

  if (
    id.startsWith(
      "bet_cancel|"
    )
  ) {
    await handleBetCancel(
      interaction
    );

    return;
  }

  if (
    id.startsWith(
      "config_"
    ) ||
    id ===
      "publish_mediator_queue" ||
    id.startsWith(
      "appearance_"
    ) ||
    id.startsWith(
      "pix_"
    )
  ) {
    await handleConfigButton(
      interaction
    );

    return;
  }
}

async function handleSelectMenu(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id ===
      "select_mediator_role" ||
    id ===
      "select_analyst_role"
  ) {
    await handleRoleSelect(
      interaction
    );

    return;
  }

  if (
    id ===
      "select_channel_mobile" ||
    id ===
      "select_channel_emulator" ||
    id ===
      "select_bets_category" ||
    id ===
      "select_mediator_channel"
  ) {
    await handleChannelSelect(
      interaction
    );

    return;
  }

  await handleStringSelect(
    interaction
  );
}async function handleCommand(message) {
  if (!message.guild) return;

  const content = message.content.trim();

  if (!content.startsWith(PREFIX)) return;

  const args = content
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
        configEmbed(guild.id),
      ],
      components:
        configComponents(),
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
  const config =
    getGuildConfig(
      guild.id
    );

  if (!config.mediatorChannelId) {
    throw new Error(
      "Canal de mediadores não configurado."
    );
  }

  const channel =
    await guild.channels.fetch(
      config.mediatorChannelId
    );

  if (!channel) {
    throw new Error(
      "Canal de mediadores não encontrado."
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
