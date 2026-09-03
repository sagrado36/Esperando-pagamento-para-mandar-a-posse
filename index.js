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
      mediatorQueueMessageId: null,

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
          `queue_join|${format}|${mode}|${value}|${type}`
        )
        .setLabel(
          "🎮 Entrar na fila"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          `queue_leave|${format}|${mode}|${value}|${type}`
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

async function sendSafeReply(
  interaction,
  data
) {
  try {
    if (interaction.replied) {
      return await interaction.followUp(
        data
      );
    }

    if (interaction.deferred) {
      return await interaction.editReply(
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

async function refreshQueueMessage(
  message
) {
  try {
    if (!message) {
      return null;
    }

    const guild =
      message.guild;

    if (!guild) {
      return null;
    }

    const guildId =
      guild.id;

    const customId =
      message.components?.[0]
        ?.components?.[0]
        ?.customId;

    if (!customId) {
      return null;
    }

    const parts =
      customId.split("|");

    if (
      parts[0] !==
      "queue_join"
    ) {
      return null;
    }

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
      return null;
    }

    await message.edit({
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

    return message;
  } catch (error) {
    console.error(
      "Erro ao atualizar fila:",
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
  try {
    if (
      !channel ||
      !channel.isTextBased()
    ) {
      throw new Error(
        "Canal inválido."
      );
    }

    const config =
      getGuildConfig(
        guildId
      );

    if (
      !config.queueMessages ||
      typeof config.queueMessages !==
        "object"
    ) {
      config.queueMessages = {};
    }

    const queueKey =
      makeQueueKey(
        guildId,
        format,
        mode,
        value,
        type
      );

    const oldMessageId =
      config.queueMessages[
        queueKey
      ];

    if (oldMessageId) {
      try {
        const oldMessage =
          await channel.messages.fetch(
            oldMessageId
          );

        if (oldMessage) {
          await oldMessage.edit({
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

          return oldMessage;
        }
      } catch {
        delete config.queueMessages[
          queueKey
        ];
      }
    }

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

    config.queueMessages[
      queueKey
    ] = message.id;

    saveDatabase();

    return message;
  } catch (error) {
    console.error(
      "Erro ao publicar fila:",
      error
    );

    throw error;
  }
}

function getCurrentMediator(
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

  if (
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
    !Number.isInteger(index) ||
    index < 0 ||
    index >=
      config.mediatorQueue.length
  ) {
    index = 0;
    config.mediatorRotationIndex =
      0;
  }

  return (
    config.mediatorQueue[
      index
    ] || null
  );
}

function mediatorQueueEmbed(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  const list =
    Array.isArray(
      config.mediatorQueue
    )
      ? config.mediatorQueue
      : [];

  const current =
    getCurrentMediator(
      guildId
    );

  let description =
    "Nenhum mediador está na fila.";

  if (list.length > 0) {
    description =
      list
        .map(
          (id, index) => {
            const marker =
              current === id
                ? " 🟢 **ATENDENDO**"
                : "";

            return `${index + 1}. <@${id}>${marker}`;
          }
        )
        .join("\n");
  }

  return createEmbed(
    guildId,
    "🎯 FILA DE MEDIADORES",
    `**Mediador atual:** ${
      current
        ? `<@${current}>`
        : "Nenhum"
    }\n\n${description}`
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
          "➕ Entrar"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "mediator_leave"
        )
        .setLabel(
          "➖ Sair"
        )
        .setStyle(
          ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          "mediator_next"
        )
        .setLabel(
          "🔄 Próximo"
        )
        .setStyle(
          ButtonStyle.Primary
        ),
    ),
  ];
}

function ensureMediatorConfig(
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

  if (
    !Number.isInteger(
      config.mediatorRotationIndex
    )
  ) {
    config.mediatorRotationIndex =
      0;
  }

  return config;
}

function isRegisteredMediator(
  guildId,
  userId
) {
  const config =
    ensureMediatorConfig(
      guildId
    );

  const list =
    Array.isArray(
      config.mediators
    )
      ? config.mediators
      : [];

  return list.includes(
    userId
  );
}

function addMediator(
  guildId,
  userId
) {
  const config =
    ensureMediatorConfig(
      guildId
    );

  if (
    !Array.isArray(
      config.mediators
    )
  ) {
    config.mediators = [];
  }

  if (
    !config.mediators.includes(
      userId
    )
  ) {
    config.mediators.push(
      userId
    );

    saveDatabase();
  }

  return true;
}

function removeMediator(
  guildId,
  userId
) {
  const config =
    ensureMediatorConfig(
      guildId
    );

  if (
    !Array.isArray(
      config.mediators
    )
  ) {
    config.mediators = [];
  }

  config.mediators =
    config.mediators.filter(
      id =>
        id !== userId
    );

  config.mediatorQueue =
    config.mediatorQueue.filter(
      id =>
        id !== userId
    );

  if (
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
    ensureMediatorConfig(
      guildId
    );

  const list =
    Array.isArray(
      config.mediators
    )
      ? config.mediators
      : [];

  if (
    list.length === 0
  ) {
    return "Nenhum mediador cadastrado.";
  }

  return list
    .map(
      (id, index) =>
        `${index + 1}. <@${id}>`
    )
    .join("\n");
}

function getPixAdminListText(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  const admins =
    Array.isArray(
      config.pixAdmins
    )
      ? config.pixAdmins
      : [];

  if (
    admins.length === 0
  ) {
    return "Nenhum ADM/Pix cadastrado.";
  }

  return admins
    .map(
      (admin, index) => {
        const name =
          admin.name ||
          "Sem nome";

        const userId =
          admin.userId ||
          admin.id ||
          "não informado";

        const key =
          admin.key ||
          "não informada";

        return (
          `${index + 1}. **${name}**\n` +
          `👤 <@${userId}>\n` +
          `💠 Pix: \`${key}\``
        );
      }
    )
    .join("\n\n");
}

async function updateMediatorQueueMessage(
  guild
) {
  const config =
    ensureMediatorConfig(
      guild.id
    );

  if (
    !config.mediatorQueueChannelId
  ) {
    return null;
  }

  const channel =
    await guild.channels
      .fetch(
        config.mediatorQueueChannelId
      )
      .catch(
        () => null
      );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    return null;
  }

  const payload = {
    embeds: [
      mediatorQueueEmbed(
        guild.id
      ),
    ],
    components:
      mediatorQueueButtons(),
  };

  if (
    config.mediatorQueueMessageId
  ) {
    try {
      const message =
        await channel.messages.fetch(
          config.mediatorQueueMessageId
        );

      await message.edit(
        payload
      );

      return message;
    } catch {
      config.mediatorQueueMessageId =
        null;
    }
  }

  const message =
    await channel.send(
      payload
    );

  config.mediatorQueueMessageId =
    message.id;

  saveDatabase();

  return message;
}

async function publishMediatorQueue(
  guild
) {
  const config =
    ensureMediatorConfig(
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
    await guild.channels
      .fetch(
        config.mediatorQueueChannelId
      )
      .catch(
        () => null
      );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      "Canal da fila de mediadores inválido."
    );
  }

  return updateMediatorQueueMessage(
    guild
  );
}

async function publishQueues(
  guild,
  format,
  mode,
  value,
  channelOverride = null
) {
  let channel = null;

  /*
   * Quando o canal veio diretamente
   * do seletor do /fila, ele tem
   * prioridade absoluta.
   */
  if (channelOverride) {
    channel =
      await guild.channels
        .fetch(
          channelOverride
        )
        .catch(
          () => null
        );
  } else {
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

    if (channelId) {
      channel =
        await guild.channels
          .fetch(channelId)
          .catch(
            () => null
          );
    }
  }

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      "Canal da fila não configurado ou inválido."
    );
  }

  for (
    const valueItem of
    VALUES
  ) {
    if (
      Number(valueItem) !==
      Number(value)
    ) {
      continue;
    }

    await registerQueueMessage(
      channel,
      guild.id,
      format,
      mode,
      valueItem
    );
  }

  return channel;
}

async function createBetChannel(
  guild,
  value,
  format,
  mode,
  playerIds,
  mediatorId = null
) {
  const config =
    getGuildConfig(
      guild.id
    );

  const category =
    config.betsCategoryId
      ? await guild.channels
          .fetch(
            config.betsCategoryId
          )
          .catch(
            () => null
          )
      : null;

  const safePlayers =
    Array.from(
      new Set(
        playerIds
          .filter(Boolean)
          .map(
            id =>
              String(id)
          )
      )
    );

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionsBitField.Flags
          .ViewChannel,
      ],
    },
  ];

  for (
    const playerId of
    safePlayers
  ) {
    overwrites.push({
      id: playerId,
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

  if (mediatorId) {
    overwrites.push({
      id: mediatorId,
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

  overwrites.push({
    id: client.user.id,
    allow: [
      PermissionsBitField.Flags
        .ViewChannel,
      PermissionsBitField.Flags
        .SendMessages,
      PermissionsBitField.Flags
        .ReadMessageHistory,
      PermissionsBitField.Flags
        .ManageChannels,
    ],
  });

  const channelName =
    `aposta-${String(
      value
    ).replace(
      ".",
      "-"
    )}-${Date.now()
      .toString()
      .slice(-5)}`;

  const channel =
    await guild.channels.create(
      {
        name: channelName,
        type:
          ChannelType.GuildText,
        parent:
          category?.id ||
          undefined,
        permissionOverwrites:
          overwrites,
      }
    );

  const mediatorText =
    mediatorId
      ? `<@${mediatorId}>`
      : "Nenhum mediador definido";

  const embed =
    createEmbed(
      guild.id,
      "🎮 APOSTA CRIADA",
      `💰 **Valor:** ${formatMoney(
        value
      )}\n` +
        `📌 **Formato:** ${format}\n` +
        `🕹️ **Modalidade:** ${modeLabel(
          mode
        )}\n\n` +
        `👥 **Jogadores:**\n` +
        safePlayers
          .map(
            id => `<@${id}>`
          )
          .join("\n") +
        `\n\n` +
        `🎯 **Mediador:** ${mediatorText}`
    );

  const buttons =
    [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `bet_ready|${value}`
          )
          .setLabel(
            "✅ Confirmar aposta"
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            `bet_cancel|${value}`
          )
          .setLabel(
            "❌ Cancelar"
          )
          .setStyle(
            ButtonStyle.Danger
          )
      ),
    ];

  const message =
    await channel.send({
      content:
        safePlayers
          .map(
            id => `<@${id}>`
          )
          .join(" "),
      embeds: [embed],
      components: buttons,
    });

  db.bets[channel.id] = {
    channelId:
      channel.id,

    guildId:
      guild.id,

    playerIds:
      safePlayers,

    format,
    mode,
    value,

    mediatorId:
      mediatorId || null,

    messageId:
      message.id,

    status:
      "pending",

    createdAt:
      Date.now(),
  };

  saveDatabase();

  return channel;
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
            "ID do Discord do ADM"
          )
          .setPlaceholder(
            "Ex.: 123456789012345678"
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
            "Nome do ADM"
          )
          .setPlaceholder(
            "Nome para identificação"
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
            "CPF, telefone, e-mail ou chave aleatória"
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
            "QR Code do Pix (opcional)"
          )
          .setPlaceholder(
            "Link da imagem do QR Code"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(false)
          .setMaxLength(500)
      )
    );
}

function createFeeModal() {
  return new ModalBuilder()
    .setCustomId(
      "fee_modal"
    )
    .setTitle(
      "Configurar taxa do ADM"
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
          .setMinLength(1)
          .setMaxLength(6)
      )
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
        .setEmoji(
          "👥"
        )
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
        .setEmoji(
          "📺"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_bets"
        )
        .setLabel(
          "Apostas"
        )
        .setEmoji(
          "🎮"
        )
        .setStyle(
          ButtonStyle.Primary
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
        .setEmoji(
          "🎨"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_fee_set"
        )
        .setLabel(
          "Taxa"
        )
        .setEmoji(
          "💰"
        )
        .setStyle(
          ButtonStyle.Secondary
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
          "Adicionar mediador"
        )
        .setEmoji(
          "➕"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "mediator_remove"
        )
        .setLabel(
          "Remover mediador"
        )
        .setEmoji(
          "➖"
        )
        .setStyle(
          ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          "mediator_list"
        )
        .setLabel(
          "Listar"
        )
        .setEmoji(
          "📋"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    new ActionRowBuilder().addComponents(
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
          "Listar ADM/Pix"
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
          "Publicar fila"
        )
        .setEmoji(
          "📢"
        )
        .setStyle(
          ButtonStyle.Primary
        )
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "mediator_queue_channel"
        )
        .setPlaceholder(
          "Escolha o canal da fila de mediadores"
        )
        .addChannelTypes(
          ChannelType.GuildText
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),
  ];
}

function cadastroComponents() {
  return [
    new ActionRowBuilder().addComponents(
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

    new ActionRowBuilder().addComponents(
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
        )
    ),
  ];
}

function createCadastroEmbed(
  guildId
) {
  return createEmbed(
    guildId,
    "📋 CADASTROS",
    "Use os botões abaixo para gerenciar os cadastros de **Mediadores** e **ADM/Pix**."
  );
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
        .setEmoji(
          "💰"
        )
        .setStyle(
          ButtonStyle.Primary
        )
    ),
  ];
}function createConfigEmbed(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  return createEmbed(
    guildId,
    "⚙️ CONFIGURAÇÃO",
    "Use os botões abaixo para configurar o bot."
  );
}

function createRolesEmbed(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  return createEmbed(
    guildId,
    "👥 CONFIGURAÇÃO DE CARGOS",
    `🎯 **Mediador:** ${
      config.mediatorRoleId
        ? `<@&${config.mediatorRoleId}>`
        : "Não configurado"
    }\n\n` +
      `📊 **Analista:** ${
        config.analystRoleId
          ? `<@&${config.analystRoleId}>`
          : "Não configurado"
      }`
  );
}

function rolesComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(
          "config_mediator_role"
        )
        .setPlaceholder(
          "Selecione o cargo de Mediador"
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
          "Selecione o cargo de Analista"
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),
  ];
}

function createChannelsEmbed(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  return createEmbed(
    guildId,
    "📺 CONFIGURAÇÃO DE CANAIS",
    `📱 **Mobile:** ${
      config.analysisChannelMobile
        ? `<#${config.analysisChannelMobile}>`
        : "Não configurado"
    }\n\n` +
      `🖥️ **Emulador:** ${
        config.analysisChannelEmulator
          ? `<#${config.analysisChannelEmulator}>`
          : "Não configurado"
      }\n\n` +
      `🎮 **Categoria de apostas:** ${
        config.betsCategoryId
          ? `<#${config.betsCategoryId}>`
          : "Não configurada"
      }\n\n` +
      `🎯 **Fila de mediadores:** ${
        config.mediatorQueueChannelId
          ? `<#${config.mediatorQueueChannelId}>`
          : "Não configurada"
      }`
  );
}

function channelsComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_mobile_channel"
        )
        .setPlaceholder(
          "Selecione o canal Mobile"
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
          "config_emulator_channel"
        )
        .setPlaceholder(
          "Selecione o canal Emulador"
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
          "config_bets_category"
        )
        .setPlaceholder(
          "Selecione a categoria de apostas"
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
          "config_mediator_queue_channel"
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
  ];
}

function createBetsConfigEmbed(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  return createEmbed(
    guildId,
    "🎮 CONFIGURAÇÃO DE APOSTAS",
    `💰 **Taxa do ADM:** ${formatMoney(
      config.admFee || 0
    )}\n\n` +
      "Configure as opções relacionadas às apostas usando os controles abaixo."
  );
}

function betsComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config_fee_set"
        )
        .setLabel(
          "Configurar taxa"
        )
        .setEmoji(
          "💰"
        )
        .setStyle(
          ButtonStyle.Primary
        )
    ),
  ];
}

function createAppearanceEmbed(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  return createEmbed(
    guildId,
    "🎨 APARÊNCIA",
    `🎨 **Cor atual:** \`${config.embedColor}\`\n\n` +
      `🖼️ **Avatar do bot:** ${
        config.botAvatar
          ? "Configurado"
          : "Não configurado"
      }`
  );
}

function appearanceComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "appearance_color"
        )
        .setLabel(
          "Alterar cor"
        )
        .setEmoji(
          "🎨"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "appearance_avatar"
        )
        .setLabel(
          "Alterar avatar"
        )
        .setEmoji(
          "🖼️"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),
  ];
}

function createColorModal() {
  return new ModalBuilder()
    .setCustomId(
      "appearance_color_modal"
    )
    .setTitle(
      "Alterar cor"
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
          .setMinLength(6)
          .setMaxLength(7)
      )
    );
}

function createAvatarModal() {
  return new ModalBuilder()
    .setCustomId(
      "appearance_avatar_modal"
    )
    .setTitle(
      "Alterar avatar"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "bot_avatar"
          )
          .setLabel(
            "URL da imagem"
          )
          .setPlaceholder(
            "https://..."
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setMaxLength(500)
      )
    );
}

function createMediatorModal(
  action = "add"
) {
  const isRemove =
    action === "remove";

  return new ModalBuilder()
    .setCustomId(
      isRemove
        ? "cadastro_mediator_remove_modal"
        : "cadastro_mediator_add_modal"
    )
    .setTitle(
      isRemove
        ? "Remover Mediador"
        : "Cadastrar Mediador"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "mediator_discord_id"
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
          .setRequired(true)
          .setMinLength(17)
          .setMaxLength(20)
      )
    );
}

function createMediatorListEmbed(
  guildId
) {
  return createEmbed(
    guildId,
    "🎯 MEDIADORES",
    getMediatorListText(
      guildId
    )
  );
}

function createPixListEmbed(
  guildId
) {
  return createEmbed(
    guildId,
    "💠 ADM/Pix",
    getPixAdminListText(
      guildId
    )
  );
}

function createFeeEmbed(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  return createEmbed(
    guildId,
    "💰 TAXA DO ADM",
    `A taxa configurada atualmente é de **${formatMoney(
      config.admFee || 0
    )}**.`
  );
}

async function handleRoleSelect(
  interaction
) {
  const id =
    interaction.customId;

  const value =
    interaction.values?.[0];

  if (!value) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Nenhum cargo foi selecionado.",
        ephemeral: true,
      }
    );
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  if (
    id ===
    "config_mediator_role"
  ) {
    config.mediatorRoleId =
      value;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Cargo de mediador definido como <@&${value}>.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_analyst_role"
  ) {
    config.analystRoleId =
      value;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Cargo de analista definido como <@&${value}>.`,
        ephemeral: true,
      }
    );
  }

  return null;
}

async function handleChannelSelect(
  interaction
) {
  const id =
    interaction.customId;

  const value =
    interaction.values?.[0];

  if (!value) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Nenhum canal foi selecionado.",
        ephemeral: true,
      }
    );
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  if (
    id ===
    "config_mobile_channel"
  ) {
    config.analysisChannelMobile =
      value;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal Mobile definido como <#${value}>.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_emulator_channel"
  ) {
    config.analysisChannelEmulator =
      value;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal Emulador definido como <#${value}>.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_bets_category"
  ) {
    config.betsCategoryId =
      value;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Categoria de apostas definida como <#${value}>.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_mediator_queue_channel"
  ) {
    config.mediatorQueueChannelId =
      value;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal da fila de mediadores definido como <#${value}>.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "mediator_queue_channel"
  ) {
    config.mediatorQueueChannelId =
      value;

    saveDatabase();

    await updateMediatorQueueMessage(
      interaction.guild
    );

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal da fila de mediadores definido como <#${value}>.`,
        ephemeral: true,
      }
    );
  }

  return null;
}

async function handleModalSubmit(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id ===
    "cadastro_mediator_add_modal"
  ) {
    const userId =
      interaction.fields
        .getTextInputValue(
          "mediator_discord_id"
        )
        .trim();

    if (
      !/^\d{17,20}$/.test(
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

    addMediator(
      interaction.guild.id,
      userId
    );

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ <@${userId}> foi cadastrado como mediador.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "cadastro_mediator_remove_modal"
  ) {
    const userId =
      interaction.fields
        .getTextInputValue(
          "mediator_discord_id"
        )
        .trim();

    if (
      !/^\d{17,20}$/.test(
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
      !isRegisteredMediator(
        interaction.guild.id,
        userId
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Este usuário não está cadastrado como mediador.",
          ephemeral: true,
        }
      );
    }

    removeMediator(
      interaction.guild.id,
      userId
    );

    await updateMediatorQueueMessage(
      interaction.guild
    );

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ <@${userId}> foi removido dos mediadores.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "pix_id_modal"
  ) {
    const userId =
      interaction.fields
        .getTextInputValue(
          "pix_discord_id"
        )
        .trim();

    if (
      !/^\d{17,20}$/.test(
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

  if (
    id.startsWith(
      "pix_data_modal|"
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

    const config =
      getGuildConfig(
        interaction.guild.id
      );

    if (
      !Array.isArray(
        config.pixAdmins
      )
    ) {
      config.pixAdmins = [];
    }

    const existingIndex =
      config.pixAdmins.findIndex(
        admin =>
          (
            admin.userId ||
            admin.id
          ) === userId
      );

    const adminData = {
      userId,
      name,
      key,
      qrCode:
        qr || null,
    };

    if (
      existingIndex >= 0
    ) {
      config.pixAdmins[
        existingIndex
      ] = adminData;
    } else {
      config.pixAdmins.push(
        adminData
      );
    }

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ ADM/Pix **${name}** cadastrado com sucesso para <@${userId}>.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "fee_modal"
  ) {
    const value =
      interaction.fields
        .getTextInputValue(
          "fee_cents"
        )
        .trim();

    const cents =
      Number(value);

    if (
      !Number.isInteger(
        cents
      ) ||
      cents < 0
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Informe uma quantidade válida de centavos.",
          ephemeral: true,
        }
      );
    }

    const config =
      getGuildConfig(
        interaction.guild.id
      );

    config.admFee =
      cents;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Taxa do ADM definida como **${formatMoney(
            cents
          )}**.`,
        ephemeral: true,
      }
    );
  }

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

    if (
      !/^#?[0-9A-Fa-f]{6}$/.test(
        color
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Cor hexadecimal inválida. Exemplo: `#5865F2`.",
          ephemeral: true,
        }
      );
    }

    const config =
      getGuildConfig(
        interaction.guild.id
      );

    config.embedColor =
      normalizeColor(
        color
      );

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Cor alterada para \`${config.embedColor}\`.`,
        ephemeral: true,
      }
    );
  }

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

    const config =
      getGuildConfig(
        interaction.guild.id
      );

    config.botAvatar =
      avatar;

    saveDatabase();

    try {
      await client.user.setAvatar(
        avatar
      );
    } catch (error) {
      console.error(
        "Erro ao alterar avatar:",
        error
      );

      return sendSafeReply(
        interaction,
        {
          content:
            "⚠️ O avatar foi salvo, mas não foi possível alterar o avatar do bot agora. Verifique se a URL é válida.",
          ephemeral: true,
        }
      );
    }

    return sendSafeReply(
      interaction,
      {
        content:
          "✅ Avatar do bot alterado com sucesso.",
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "queue_custom_modal"
  ) {
    return handleQueueCustomModal(
      interaction
    );
  }

  return null;
}

async function handleQueueCustomModal(
  interaction
) {
  const format =
    interaction.fields
      .getTextInputValue(
        "queue_format"
      )
      .trim()
      .toLowerCase();

  const mode =
    interaction.fields
      .getTextInputValue(
        "queue_mode"
      )
      .trim()
      .toLowerCase();

  const valueText =
    interaction.fields
      .getTextInputValue(
        "queue_value"
      )
      .trim();

  const value =
    Number(valueText);

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

  if (
    !MODES.includes(
      mode
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Modalidade inválida.",
        ephemeral: true,
      }
    );
  }

  if (
    !Number.isFinite(
      value
    ) ||
    value <= 0
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

  return sendSafeReply(
    interaction,
    {
      content:
        `✅ Fila configurada: **${format} ${mode} — ${formatMoney(
          value
        )}**.`,
      ephemeral: true,
    }
  );
}

async function handleButton(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id ===
    "cadastro_mediator_add"
  ) {
    return interaction.showModal(
      createMediatorModal(
        "add"
      )
    );
  }

  if (
    id ===
    "cadastro_mediator_remove"
  ) {
    return interaction.showModal(
      createMediatorModal(
        "remove"
      )
    );
  }

  if (
    id ===
    "cadastro_mediator_list"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          `📋 **Mediadores cadastrados**\n\n${getMediatorListText(
            interaction.guild.id
          )}`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "cadastro_pix_add"
  ) {
    return interaction.showModal(
      createPixIdModal()
    );
  }

  if (
    id ===
    "cadastro_pix_list"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          `💠 **ADM/Pix cadastrados**\n\n${getPixAdminListText(
            interaction.guild.id
          )}`,
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

  if (
    id ===
    "config_channels"
  ) {
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

  if (
    id ===
    "config_bets"
  ) {
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

  if (
    id ===
    "config_appearance"
  ) {
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

  if (
    id ===
    "config_fee_set"
  ) {
    return interaction.showModal(
      createFeeModal()
    );
  }

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

  if (
    id ===
    "mediator_add"
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
            "❌ Apenas administradores podem cadastrar mediadores.",
          ephemeral: true,
        }
      );
    }

    return interaction.showModal(
      createMediatorModal(
        "add"
      )
    );
  }

  if (
    id ===
    "mediator_remove"
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
            "❌ Apenas administradores podem remover mediadores.",
          ephemeral: true,
        }
      );
    }

    return interaction.showModal(
      createMediatorModal(
        "remove"
      )
    );
  }

  if (
    id ===
    "mediator_list"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          `📋 **Mediadores cadastrados**\n\n${getMediatorListText(
            interaction.guild.id
          )}`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "pix_add"
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
            "❌ Apenas administradores podem cadastrar ADM/Pix.",
          ephemeral: true,
        }
      );
    }

    return interaction.showModal(
      createPixIdModal()
    );
  }

  if (
    id ===
    "pix_list"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          `💠 **ADM/Pix cadastrados**\n\n${getPixAdminListText(
            interaction.guild.id
          )}`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "publish_mediator_queue"
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
            "❌ Apenas administradores podem publicar a fila.",
          ephemeral: true,
        }
      );
    }

    try {
      await publishMediatorQueue(
        interaction.guild
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

  if (
    id ===
    "mediator_join"
  ) {
    const userId =
      interaction.user.id;

    const config =
      ensureMediatorConfig(
        interaction.guild.id
      );

    if (
      !isRegisteredMediator(
        interaction.guild.id,
        userId
      )
    ) {
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
      !config.mediatorQueue.includes(
        userId
      )
    ) {
      config.mediatorQueue.push(
        userId
      );

      saveDatabase();
    }

    await updateMediatorQueueMessage(
      interaction.guild
    );

    return sendSafeReply(
      interaction,
      {
        content:
          "✅ Você entrou na fila de mediadores.",
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "mediator_leave"
  ) {
    const userId =
      interaction.user.id;

    const config =
      ensureMediatorConfig(
        interaction.guild.id
      );

    config.mediatorQueue =
      config.mediatorQueue.filter(
        id =>
          id !== userId
      );

    if (
      config.mediatorRotationIndex >=
      config.mediatorQueue.length
    ) {
      config.mediatorRotationIndex =
        0;
    }

    saveDatabase();

    await updateMediatorQueueMessage(
      interaction.guild
    );

    return sendSafeReply(
      interaction,
      {
        content:
          "✅ Você saiu da fila de mediadores.",
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "mediator_next"
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
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Você não possui permissão para avançar a fila.",
          ephemeral: true,
        }
      );
    }

    const config =
      ensureMediatorConfig(
        interaction.guild.id
      );

    if (
      config.mediatorQueue.length ===
      0
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Não há mediadores na fila.",
          ephemeral: true,
        }
      );
    }

    config.mediatorRotationIndex =
      (
        config.mediatorRotationIndex +
        1
      ) %
      config.mediatorQueue.length;

    saveDatabase();

    await updateMediatorQueueMessage(
      interaction.guild
    );

    return sendSafeReply(
      interaction,
      {
        content:
          `🔄 Próximo mediador: <@${getCurrentMediator(
            interaction.guild.id
          )}>`,
        ephemeral: true,
      }
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
      "bet_ready|"
    )
  ) {
    return handleBetReady(
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

  return null;
}async function handleQueueJoin(
  interaction
) {
  const parts =
    interaction.customId.split("|");

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
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Dados da fila inválidos.",
        ephemeral: true,
      }
    );
  }

  const queue =
    getQueue(
      interaction.guild.id,
      format,
      mode,
      value,
      type
    );

  const userId =
    interaction.user.id;

  if (
    queue.includes(userId)
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você já está nessa fila.",
        ephemeral: true,
      }
    );
  }

  const maxPlayers =
    requiredPlayers(
      format
    );

  if (
    queue.length >=
    maxPlayers
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa fila já está completa.",
        ephemeral: true,
      }
    );
  }

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
        interaction.guild.id,
        format,
        mode,
        value
      );

    choices[userId] =
      choice;
  }

  queue.push(
    userId
  );

  saveDatabase();

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  const queueKey =
    makeQueueKey(
      interaction.guild.id,
      format,
      mode,
      value,
      type
    );

  const messageId =
    config.queueMessages?.[
      queueKey
    ];

  if (messageId) {
    for (
      const channel of
      interaction.guild.channels.cache.values()
    ) {
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

        if (message) {
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

  /*
   * Quando a fila atingir a quantidade
   * necessária de jogadores, cria a aposta.
   */
  if (
    queue.length >=
    maxPlayers
  ) {
    const players =
      [...queue];

    clearQueueChoices(
      interaction.guild.id,
      format,
      mode,
      value
    );

    db.queues[
      makeQueueKey(
        interaction.guild.id,
        format,
        mode,
        value,
        type
      )
    ] = [];

    saveDatabase();

    let mediatorId =
      getCurrentMediator(
        interaction.guild.id
      );

    try {
      const channel =
        await createBetChannel(
          interaction.guild,
          value,
          format,
          mode,
          players,
          mediatorId
        );

      return sendSafeReply(
        interaction,
        {
          content:
            `🎮 A fila foi completada e a aposta foi criada em ${channel}.`,
          ephemeral: true,
        }
      );
    } catch (error) {
      /*
       * Se a criação da aposta falhar,
       * devolve os jogadores para a fila.
       */
      db.queues[
        makeQueueKey(
          interaction.guild.id,
          format,
          mode,
          value,
          type
        )
      ] = players;

      saveDatabase();

      console.error(
        "Erro ao criar aposta:",
        error
      );

      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Não foi possível criar a aposta. Os jogadores permaneceram na fila.",
          ephemeral: true,
        }
      );
    }
  }

  return sendSafeReply(
    interaction,
    {
      content:
        `✅ Você entrou na fila **${format} ${mode} — ${formatMoney(
          value
        )}**.`,
      ephemeral: true,
    }
  );
}

async function handleQueueLeave(
  interaction
) {
  const parts =
    interaction.customId.split("|");

  const format =
    parts[1];

  const mode =
    parts[2];

  const value =
    Number(parts[3]);

  const type =
    parts[4] || "normal";

  const queue =
    getQueue(
      interaction.guild.id,
      format,
      mode,
      value,
      type
    );

  const userId =
    interaction.user.id;

  const index =
    queue.indexOf(
      userId
    );

  if (
    index === -1
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não está nessa fila.",
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
        interaction.guild.id,
        format,
        mode,
        value
      );

    delete choices[
      userId
    ];
  }

  saveDatabase();

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  const queueKey =
    makeQueueKey(
      interaction.guild.id,
      format,
      mode,
      value,
      type
    );

  const messageId =
    config.queueMessages?.[
      queueKey
    ];

  if (messageId) {
    for (
      const channel of
      interaction.guild.channels.cache.values()
    ) {
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

        if (message) {
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
        // Continua procurando.
      }
    }
  }

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Você saiu da fila.",
      ephemeral: true,
    }
  );
}

async function handleBetReady(
  interaction
) {
  const parts =
    interaction.customId.split("|");

  const value =
    Number(parts[1]);

  const bet =
    db.bets[
      interaction.channel.id
    ];

  if (!bet) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta aposta não foi encontrada.",
        ephemeral: true,
      }
    );
  }

  if (
    bet.status !==
    "pending"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta aposta já foi processada.",
        ephemeral: true,
      }
    );
  }

  const isPlayer =
    bet.playerIds.includes(
      interaction.user.id
    );

  const isMediator =
    bet.mediatorId ===
      interaction.user.id ||
    hasMediatorRole(
      interaction.member,
      interaction.guild.id
    );

  const isAdmin =
    isAdministrator(
      interaction.member
    );

  if (
    !isPlayer &&
    !isMediator &&
    !isAdmin
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não participa desta aposta.",
        ephemeral: true,
      }
    );
  }

  if (
    !Array.isArray(
      bet.confirmedPlayers
    )
  ) {
    bet.confirmedPlayers =
      [];
  }

  if (
    isPlayer &&
    !bet.confirmedPlayers.includes(
      interaction.user.id
    )
  ) {
    bet.confirmedPlayers.push(
      interaction.user.id
    );
  }

  const required =
    bet.playerIds.length;

  if (
    bet.confirmedPlayers.length >=
    required
  ) {
    bet.status =
      "confirmed";

    bet.confirmedAt =
      Date.now();

    saveDatabase();

    const embed =
      createEmbed(
        interaction.guild.id,
        "✅ APOSTA CONFIRMADA",
        `💰 **Valor:** ${formatMoney(
          value
        )}\n` +
          `📌 **Formato:** ${bet.format}\n` +
          `🕹️ **Modalidade:** ${modeLabel(
            bet.mode
          )}\n\n` +
          `Todos os jogadores confirmaram a aposta.`
      );

    try {
      await interaction.message.edit(
        {
          embeds: [embed],
          components: [],
        }
      );
    } catch {
      // Ignora falha de edição.
    }

    return sendSafeReply(
      interaction,
      {
        content:
          "✅ Aposta confirmada com sucesso.",
        ephemeral: true,
      }
    );
  }

  saveDatabase();

  return sendSafeReply(
    interaction,
    {
      content:
        `✅ Sua confirmação foi registrada. ${bet.confirmedPlayers.length}/${required} jogadores confirmaram.`,
      ephemeral: true,
    }
  );
}

async function handleBetCancel(
  interaction
) {
  const bet =
    db.bets[
      interaction.channel.id
    ];

  if (!bet) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta aposta não foi encontrada.",
        ephemeral: true,
      }
    );
  }

  const isPlayer =
    bet.playerIds.includes(
      interaction.user.id
    );

  const isMediator =
    bet.mediatorId ===
      interaction.user.id ||
    hasMediatorRole(
      interaction.member,
      interaction.guild.id
    );

  const isAdmin =
    isAdministrator(
      interaction.member
    );

  if (
    !isPlayer &&
    !isMediator &&
    !isAdmin
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não possui permissão para cancelar esta aposta.",
        ephemeral: true,
      }
    );
  }

  bet.status =
    "cancelled";

  bet.cancelledAt =
    Date.now();

  bet.cancelledBy =
    interaction.user.id;

  saveDatabase();

  const embed =
    createEmbed(
      interaction.guild.id,
      "❌ APOSTA CANCELADA",
      `A aposta de **${formatMoney(
        bet.value
      )}** foi cancelada por <@${interaction.user.id}>.`
    );

  try {
    await interaction.message.edit(
      {
        embeds: [embed],
        components: [],
      }
    );
  } catch {
    // Ignora falha de edição.
  }

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Aposta cancelada.",
      ephemeral: true,
    }
  );
}

function createQueueSetupEmbed(
  guildId
) {
  return createEmbed(
    guildId,
    "🎰 CONFIGURAR FILAS",
    "Selecione abaixo o formato, a modalidade e o valor da fila que deseja publicar."
  );
}

function queueSetupComponents() {
  const rows = [];

  rows.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          "queue_setup_format"
        )
        .setPlaceholder(
          "Selecione o formato"
        )
        .addOptions(
          FORMATS.map(
            format => ({
              label:
                format,
              value:
                format,
              emoji:
                "🎮",
            })
          )
        )
    )
  );

  rows.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          "queue_setup_mode"
        )
        .setPlaceholder(
          "Selecione a modalidade"
        )
        .addOptions(
          MODES.map(
            mode => ({
              label:
                modeLabel(
                  mode
                )
                  .replace(
                    /📱|🖥️|🔀/g,
                    ""
                  )
                  .trim(),
              value:
                mode,
              emoji:
                mode ===
                "mobile"
                  ? "📱"
                  : mode ===
                    "emulador"
                  ? "🖥️"
                  : "🔀",
            })
          )
        )
    )
  );

  rows.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          "queue_setup_value"
        )
        .setPlaceholder(
          "Selecione o valor"
        )
        .addOptions(
          VALUES.map(
            value => ({
              label:
                formatMoney(
                  value
                ),
              value:
                String(value),
              emoji:
                "💰",
            })
          )
        )
    )
  );

  rows.push(
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "queue_setup_channel"
        )
        .setPlaceholder(
          "Selecione o canal"
        )
        .addChannelTypes(
          ChannelType.GuildText
        )
        .setMinValues(1)
        .setMaxValues(1)
    )
  );

  return rows;
}

function createCustomQueueModal() {
  return new ModalBuilder()
    .setCustomId(
      "queue_custom_modal"
    )
    .setTitle(
      "Criar fila personalizada"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "queue_format"
          )
          .setLabel(
            "Formato"
          )
          .setPlaceholder(
            "1x1, 2x2, 3x3 ou 4x4"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "queue_mode"
          )
          .setLabel(
            "Modalidade"
          )
          .setPlaceholder(
            "mobile, emulador ou misto"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "queue_value"
          )
          .setLabel(
            "Valor"
          )
          .setPlaceholder(
            "Ex.: 50"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
      )
    );
}

async function handleStringSelect(
  interaction
) {
  const id =
    interaction.customId;

  const value =
    interaction.values?.[0];

  if (!value) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Nenhuma opção foi selecionada.",
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "queue_setup_format"
  ) {
    interaction.client.queueSetup =
      interaction.client.queueSetup ||
      {};

    interaction.client.queueSetup[
      interaction.user.id
    ] =
      interaction.client.queueSetup[
        interaction.user.id
      ] || {};

    interaction.client.queueSetup[
      interaction.user.id
    ].format =
      value;

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Formato selecionado: **${value}**.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "queue_setup_mode"
  ) {
    interaction.client.queueSetup =
      interaction.client.queueSetup ||
      {};

    interaction.client.queueSetup[
      interaction.user.id
    ] =
      interaction.client.queueSetup[
        interaction.user.id
      ] || {};

    interaction.client.queueSetup[
      interaction.user.id
    ].mode =
      value;

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Modalidade selecionada: **${modeLabel(
            value
          )}**.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "queue_setup_value"
  ) {
    interaction.client.queueSetup =
      interaction.client.queueSetup ||
      {};

    interaction.client.queueSetup[
      interaction.user.id
    ] =
      interaction.client.queueSetup[
        interaction.user.id
      ] || {};

    interaction.client.queueSetup[
      interaction.user.id
    ].value =
      Number(value);

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Valor selecionado: **${formatMoney(
            Number(value)
          )}**.`,
        ephemeral: true,
      }
    );
  }

  return null;
}

async function handleQueueSetupChannel(
  interaction
) {
  const channelId =
    interaction.values?.[0];

  if (!channelId) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Canal inválido.",
        ephemeral: true,
      }
    );
  }

  const setup =
    interaction.client.queueSetup?.[
      interaction.user.id
    ];

  if (
    !setup?.format ||
    !setup?.mode ||
    !Number.isFinite(
      setup?.value
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Primeiro selecione formato, modalidade e valor.",
        ephemeral: true,
      }
    );
  }

  try {
    await registerQueueMessage(
      interaction.guild.channels.cache.get(
        channelId
      ),
      interaction.guild.id,
      setup.format,
      setup.mode,
      setup.value
    );

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Fila **${setup.format} ${setup.mode} — ${formatMoney(
            setup.value
          )}** publicada em <#${channelId}>.`,
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

async function handleSlashCommand(
  interaction
) {
  if (
    !interaction.isChatInputCommand()
  ) {
    return null;
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
          "❌ Apenas administradores podem utilizar este comando.",
        ephemeral: true,
      }
    );
  }

  if (
    interaction.commandName ===
    "cadastro"
  ) {
    return sendSafeReply(
      interaction,
      {
        embeds: [
          createCadastroEmbed(
            interaction.guild.id
          ),
        ],
        components:
          cadastroComponents(),
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
          createConfigEmbed(
            interaction.guild.id
          ),
        ],
        components:
          configButtons(),
      }
    );
  }

  if (
    interaction.commandName ===
    "fila"
  ) {
    return sendSafeReply(
      interaction,
      {
        embeds: [
          createQueueSetupEmbed(
            interaction.guild.id
          ),
        ],
        components:
          queueSetupComponents(),
        ephemeral: true,
      }
    );
  }

  if (
    interaction.commandName ===
    "med"
  ) {
    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            interaction.guild.id,
            "🎯 MEDIADORES",
            "Gerencie a fila de mediadores usando os botões abaixo."
          ),
        ],
        components:
          mediatorConfigComponents(),
      }
    );
  }

  return null;
}

const commands = [
  new SlashCommandBuilder()
    .setName(
      "config"
    )
    .setDescription(
      "Configurar o bot"
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName(
      "cadastro"
    )
    .setDescription(
      "Gerenciar mediadores e ADM/Pix"
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName(
      "fila"
    )
    .setDescription(
      "Configurar filas"
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName(
      "med"
    )
    .setDescription(
      "Gerenciar mediadores"
    )
    .toJSON(),
];

const rest =
  new REST({
    version: "10",
  }).setToken(
    TOKEN
  );

async function registerCommands() {
  try {
    console.log(
      "Registrando comandos slash..."
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
      "Comandos registrados com sucesso."
    );
  } catch (error) {
    console.error(
      "Erro ao registrar comandos:",
      error
    );
  }
}

client.once(
  Events.ClientReady,
  async ready => {
    console.log(
      `🤖 Bot conectado como ${ready.user.tag}`
    );

    await registerCommands();

    /*
     * Restaura o avatar configurado,
     * caso exista no banco.
     */
    try {
      const config =
        getGuildConfig(
          GUILD_ID
        );

      if (
        config.botAvatar
      ) {
        await client.user.setAvatar(
          config.botAvatar
        );
      }
    } catch (error) {
      console.error(
        "Não foi possível restaurar o avatar:",
        error
      );
    }

    /*
     * Atualiza a fila de mediadores
     * após o bot entrar.
     */
    try {
      const guild =
        await client.guilds.fetch(
          GUILD_ID
        );

      if (guild) {
        await updateMediatorQueueMessage(
          guild
        );
      }
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
