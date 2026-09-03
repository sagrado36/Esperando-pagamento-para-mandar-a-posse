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
}async function sendSafeReply(
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

function addActiveMediator(
  guildId,
  userId
) {
  const config =
    ensureMediatorConfig(
      guildId
    );

  if (
    !isRegisteredMediator(
      guildId,
      userId
    )
  ) {
    return false;
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

  return true;
}

function removeActiveMediator(
  guildId,
  userId
) {
  const config =
    ensureMediatorConfig(
      guildId
    );

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
    config.mediatorRotationIndex >
    index
  ) {
    config.mediatorRotationIndex--;
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

function rotateMediator(
  guildId
) {
  const config =
    ensureMediatorConfig(
      guildId
    );

  if (
    config.mediatorQueue.length ===
    0
  ) {
    config.mediatorRotationIndex =
      0;

    saveDatabase();

    return null;
  }

  config.mediatorRotationIndex =
    (
      config.mediatorRotationIndex +
      1
    ) %
    config.mediatorQueue.length;

  saveDatabase();

  return getCurrentMediator(
    guildId
  );
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
        "Canal não configurado para esta publicação."
      );
    }

    channel =
      await guild.channels
        .fetch(channelId)
        .catch(
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

  const orderedValues =
    [...VALUES].sort(
      (a, b) => b - a
    );

  const createdMessages =
    [];

  for (
    const value of
      orderedValues
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

async function createPrivateBetChannel(
  guild,
  playerIds,
  format,
  mode,
  value,
  mediatorId
) {
  const config =
    getGuildConfig(
      guild.id
    );

  let category = null;

  if (
    config.betsCategoryId
  ) {
    category =
      await guild.channels
        .fetch(
          config.betsCategoryId
        )
        .catch(
          () => null
        );
  }

  const safePlayers =
    Array.from(
      new Set(
        playerIds.filter(Boolean)
      )
    );

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionsBitField.Flags.ViewChannel,
      ],
    },
  ];

  for (
    const userId of
      safePlayers
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

  if (mediatorId) {
    overwrites.push({
      id: mediatorId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  overwrites.push({
    id: client.user.id,
    allow: [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ReadMessageHistory,
      PermissionsBitField.Flags.ManageChannels,
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
          "config_mediators"
        )
        .setLabel(
          "Mediadores"
        )
        .setEmoji(
          "🎯"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

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
    getGuildConfig(guildId);

  return createEmbed(
    guildId,
    "⚙️ CONFIGURAÇÃO DO BOT",
    `Use os botões abaixo para configurar o sistema.\n\n` +
      `💰 **Taxa atual:** ${formatMoney(
        config.admFee
      )}`
  );
}

function rolesComponents(
  guildId
) {
  const config =
    getGuildConfig(guildId);

  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(
          "config_mediator_role"
        )
        .setPlaceholder(
          config.mediatorRoleId
            ? "Alterar cargo de mediador"
            : "Escolher cargo de mediador"
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
          config.analystRoleId
            ? "Alterar cargo de analista"
            : "Escolher cargo de analista"
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
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
    ),
  ];
}

function channelComponents(
  guildId
) {
  const config =
    getGuildConfig(guildId);

  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_mobile_channel"
        )
        .setPlaceholder(
          config.analysisChannelMobile
            ? "Alterar canal Mobile"
            : "Escolher canal Mobile"
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
          config.analysisChannelEmulator
            ? "Alterar canal Emulador"
            : "Escolher canal Emulador"
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
          "Escolher categoria das apostas"
        )
        .addChannelTypes(
          ChannelType.GuildCategory
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
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
    ),
  ];
}

function betsComponents(
  guildId
) {
  const config =
    getGuildConfig(guildId);

  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "config_bets_category"
        )
        .setPlaceholder(
          config.betsCategoryId
            ? "Alterar categoria das apostas"
            : "Escolher categoria das apostas"
        )
        .addChannelTypes(
          ChannelType.GuildCategory
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
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
    ),
  ];
}

function appearanceComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "appearance_black"
        )
        .setLabel(
          "Preto"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "appearance_white"
        )
        .setLabel(
          "Branco"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "appearance_blue"
        )
        .setLabel(
          "Azul"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "appearance_red"
        )
        .setLabel(
          "Vermelho"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    ),

    new ActionRowBuilder().addComponents(
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
    ),
  ];
}

function formatConfigDescription(
  guildId
) {
  const config =
    getGuildConfig(guildId);

  return (
    `🎯 **Cargo Mediador:** ${
      config.mediatorRoleId
        ? `<@&${config.mediatorRoleId}>`
        : "Não configurado"
    }\n` +
    `🧑‍💼 **Cargo Analista:** ${
      config.analystRoleId
        ? `<@&${config.analystRoleId}>`
        : "Não configurado"
    }\n\n` +
    `📱 **Canal Mobile:** ${
      config.analysisChannelMobile
        ? `<#${config.analysisChannelMobile}>`
        : "Não configurado"
    }\n` +
    `🖥️ **Canal Emulador:** ${
      config.analysisChannelEmulator
        ? `<#${config.analysisChannelEmulator}>`
        : "Não configurado"
    }\n` +
    `🎮 **Categoria Apostas:** ${
      config.betsCategoryId
        ? `<#${config.betsCategoryId}>`
        : "Não configurado"
    }\n` +
    `🎯 **Fila de Mediadores:** ${
      config.mediatorQueueChannelId
        ? `<#${config.mediatorQueueChannelId}>`
        : "Não configurado"
    }\n\n` +
    `💰 **Taxa ADM:** ${formatMoney(
      config.admFee
    )}`
  );
}

async function handleSelectMenu(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id === "fila_format"
  ) {
    const format =
      interaction.values?.[0];

    if (
      !FORMATS.includes(format)
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
      );

    return sendSafeReply(
      interaction,
      {
        content:
          `📌 **Formato escolhido:** ${format}\n\n` +
          "Agora escolha a modalidade:",
        components: [row],
        ephemeral: true,
      }
    );
  }

  if (
    id.startsWith(
      "fila_mode|"
    )
  ) {
    const [, format] =
      id.split("|");

    const mode =
      interaction.values?.[0];

    if (
      !FORMATS.includes(format) ||
      !MODES.includes(mode)
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Formato ou modalidade inválidos.",
          ephemeral: true,
        }
      );
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

    return sendSafeReply(
      interaction,
      {
        content:
          `📌 **Formato:** ${format}\n` +
          `🕹️ **Modalidade:** ${modeLabel(
            mode
          )}\n\n` +
          "Agora escolha o canal onde as 12 filas serão publicadas:",
        components: [row],
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
            interaction.guild.id,
            "🎨 APARÊNCIA",
            "Escolha a cor dos painéis e mensagens do bot."
          ),
        ],
        components:
          appearanceComponents(),
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

  const channelId =
    interaction.values?.[0];

  if (!channelId) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Nenhum canal foi selecionado.",
        ephemeral: true,
      }
    );
  }

  const guild =
    interaction.guild;

  if (!guild) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Servidor não encontrado.",
        ephemeral: true,
      }
    );
  }

  if (
    id.startsWith(
      "fila_channel|"
    )
  ) {
    const [, format, mode] =
      id.split("|");

    try {
      /*
       * O channelId escolhido pelo
       * usuário é enviado diretamente
       * para publishQueues().
       *
       * Não depende de nenhum canal
       * previamente configurado.
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

      return sendSafeReply(
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

      return sendSafeReply(
        interaction,
        {
          content:
            `❌ Não foi possível publicar as filas: ${
              error.message
            }`,
          ephemeral: true,
        }
      );
    }
  }

  if (
    id ===
    "mediator_queue_channel"
  ) {
    const config =
      getGuildConfig(
        guild.id
      );

    config.mediatorQueueChannelId =
      channelId;

    saveDatabase();

    try {
      await updateMediatorQueueMessage(
        guild
      );
    } catch (
      error
    ) {
      console.error(
        "Erro ao publicar fila de mediadores:",
        error
      );
    }

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal da fila de mediadores definido: <#${channelId}>.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_mobile_channel"
  ) {
    const config =
      getGuildConfig(
        guild.id
      );

    config.analysisChannelMobile =
      channelId;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal Mobile configurado: <#${channelId}>.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_emulator_channel"
  ) {
    const config =
      getGuildConfig(
        guild.id
      );

    config.analysisChannelEmulator =
      channelId;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Canal Emulador configurado: <#${channelId}>.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "config_bets_category"
  ) {
    const config =
      getGuildConfig(
        guild.id
      );

    config.betsCategoryId =
      channelId;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Categoria de apostas configurada: <#${channelId}>.`,
        ephemeral: true,
      }
    );
  }
}

async function handleRoleSelect(
  interaction
) {
  const roleId =
    interaction.values?.[0];

  if (!roleId) {
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
    interaction.customId ===
    "config_mediator_role"
  ) {
    config.mediatorRoleId =
      roleId;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Cargo de mediador configurado: <@&${roleId}>.`,
        ephemeral: true,
      }
    );
  }

  if (
    interaction.customId ===
    "config_analyst_role"
  ) {
    config.analystRoleId =
      roleId;

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Cargo de analista configurado: <@&${roleId}>.`,
        ephemeral: true,
      }
    );
  }
}

async function handleIceChoice(
  interaction
) {
  const parts =
    interaction.customId.split(
      "|"
    );

  if (
    parts[0] !==
    "queue_join"
  ) {
    return;
  }

  const format =
    parts[1];

  const mode =
    parts[2];

  const value =
    Number(parts[3]);

  const choice =
    parts[4];

  if (
    format !== "1x1"
  ) {
    return handleQueueJoin(
      interaction
    );
  }

  if (
    choice !==
      "ice_normal" &&
    choice !==
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
      interaction.guild.id,
      format,
      mode,
      value,
      "normal"
    );

  if (
    queue.includes(
      interaction.user.id
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

  if (
    queue.length >=
    requiredPlayers(format)
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa fila já está cheia.",
        ephemeral: true,
      }
    );
  }

  queue.push(
    interaction.user.id
  );

  const choices =
    getQueueChoices(
      interaction.guild.id,
      format,
      mode,
      value
    );

  choices[
    interaction.user.id
  ] = choice;

  saveDatabase();

  await refreshQueueMessage(
    interaction.message
  );

  if (
    queue.length >= 2
  ) {
    const ids = [
      queue[0],
      queue[1],
    ];

    if (
      choices[ids[0]] ===
      choices[ids[1]]
    ) {
      const mediator =
        getCurrentMediator(
          interaction.guild.id
        );

      try {
        await createPrivateBetChannel(
          interaction.guild,
          ids,
          format,
          mode,
          value,
          mediator
        );

        db.queues[
          makeQueueKey(
            interaction.guild.id,
            format,
            mode,
            value,
            "normal"
          )
        ] = [];

        clearQueueChoices(
          interaction.guild.id,
          format,
          mode,
          value
        );

        saveDatabase();

        await refreshQueueMessage(
          interaction.message
        );

        return sendSafeReply(
          interaction,
          {
            content:
              "✅ Aposta criada! O canal privado foi aberto.",
            ephemeral: true,
          }
        );
      } catch (
        error
      ) {
        console.error(
          "Erro ao criar aposta:",
          error
        );
      }
    }
  }

  return sendSafeReply(
    interaction,
    {
      content:
        `✅ Você entrou na fila com **${
          choice ===
          "ice_infinite"
            ? "Gelo Infinito ♾️"
            : "Gelo Normal 🧊"
        }**.`,
      ephemeral: true,
    }
  );
}

async function handleQueueJoin(
  interaction
) {
  const parts =
    interaction.customId.split(
      "|"
    );

  if (
    parts[0] !==
    "queue_join"
  ) {
    return;
  }

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

  if (
    queue.includes(
      interaction.user.id
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

  if (
    queue.length >=
    requiredPlayers(format)
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa fila já está cheia.",
        ephemeral: true,
      }
    );
  }

  queue.push(
    interaction.user.id
  );

  saveDatabase();

  await refreshQueueMessage(
    interaction.message
  );

  if (
    queue.length >=
    requiredPlayers(format)
  ) {
    const mediator =
      getCurrentMediator(
        interaction.guild.id
      );

    try {
      await createPrivateBetChannel(
        interaction.guild,
        [...queue],
        format,
        mode,
        value,
        mediator
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

      await refreshQueueMessage(
        interaction.message
      );
    } catch (
      error
    ) {
      console.error(
        "Erro ao criar canal privado:",
        error
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

async function handleQueueLeave(
  interaction
) {
  const parts =
    interaction.customId.split(
      "|"
    );

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

  const index =
    queue.indexOf(
      interaction.user.id
    );

  if (
    index === -1
  ) {
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
        interaction.guild.id,
        format,
        mode,
        value
      );

    delete choices[
      interaction.user.id
    ];
  }

  saveDatabase();

  await refreshQueueMessage(
    interaction.message
  );

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Você saiu da fila.",
      ephemeral: true,
    }
  );
}

async function handleQueueConfirm(
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
          "❌ Aposta não encontrada.",
        ephemeral: true,
      }
    );
  }

  if (
    !bet.playerIds.includes(
      interaction.user.id
    ) &&
    bet.mediatorId !==
      interaction.user.id
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

  bet.status =
    "confirmed";

  bet.confirmedAt =
    Date.now();

  saveDatabase();

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Aposta confirmada.",
      ephemeral: true,
    }
  );
}

async function handleQueueCancel(
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
          "❌ Aposta não encontrada.",
        ephemeral: true,
      }
    );
  }

  bet.status =
    "cancelled";

  bet.cancelledAt =
    Date.now();

  saveDatabase();

  return sendSafeReply(
    interaction,
    {
      content:
        "❌ Aposta cancelada.",
        ephemeral: true,
    }
  );
}

async function handleBetButton(
  interaction
) {
  if (
    interaction.customId.startsWith(
      "bet_ready|"
    )
  ) {
    return handleQueueConfirm(
      interaction
    );
  }

  if (
    interaction.customId.startsWith(
      "bet_cancel|"
    )
  ) {
    return handleQueueCancel(
      interaction
    );
  }
}

async function handleModalSubmit(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id ===
    "fee_modal"
  ) {
    const raw =
      interaction.fields.getTextInputValue(
        "fee_cents"
      );

    const cents =
      Number(
        String(raw).trim()
      );

    if (
      !Number.isInteger(
        cents
      ) ||
      cents < 0 ||
      cents > 100000
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Informe um valor inteiro entre 0 e 100000 centavos.",
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
          `✅ Taxa configurada para **${formatMoney(
            cents
          )}**.`,
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "pix_id_modal"
  ) {
    const userId =
      interaction.fields.getTextInputValue(
        "pix_discord_id"
      ).trim();

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
    const [, userId] =
      id.split("|");

    const name =
      interaction.fields.getTextInputValue(
        "admin_name"
      ).trim();

    const key =
      interaction.fields.getTextInputValue(
        "admin_pix_key"
      ).trim();

    const qr =
      interaction.fields.getTextInputValue(
        "admin_pix_qr"
      ).trim();

    if (
      !name ||
      !key
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Nome e chave Pix são obrigatórios.",
          ephemeral: true,
        }
      );
    }

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

    const data = {
      id: userId,
      userId,
      name,
      key,
      qr:
        qr || null,
      addedBy:
        interaction.user.id,
      addedAt:
        Date.now(),
    };

    if (
      existingIndex >= 0
    ) {
      config.pixAdmins[
        existingIndex
      ] = data;
    } else {
      config.pixAdmins.push(
        data
      );
    }

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ ADM/Pix **${name}** cadastrado com sucesso.`,
        ephemeral: true,
      }
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

    if (
      parts[1] ===
      "1x1"
    ) {
      return handleIceChoice(
        interaction
      );
    }

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
    ) ||
    id.startsWith(
      "bet_cancel|"
    )
  ) {
    return handleBetButton(
      interaction
    );
  }

  if (
    id ===
    "mediator_join"
  ) {
    const guildId =
      interaction.guild.id;

    if (
      !isRegisteredMediator(
        guildId,
        interaction.user.id
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

    addActiveMediator(
      guildId,
      interaction.user.id
    );

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
    removeActiveMediator(
      interaction.guild.id,
      interaction.user.id
    );

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
            "❌ Você não tem permissão para avançar a fila.",
          ephemeral: true,
        }
      );
    }

    const next =
      rotateMediator(
        interaction.guild.id
      );

    await updateMediatorQueueMessage(
      interaction.guild
    );

    return sendSafeReply(
      interaction,
      {
        content:
          next
            ? `🔄 Próximo mediador: <@${next}>`
            : "⚠️ Não há mediadores na fila.",
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "mediator_add"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "Use a configuração de mediadores para cadastrar o usuário.",
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "mediator_remove"
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "Use a lista de mediadores para remover o usuário.",
        ephemeral: true,
      }
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
    } catch (
      error
    ) {
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
    "config_roles"
  ) {
    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            interaction.guild.id,
            "👥 CARGOS",
            formatConfigDescription(
              interaction.guild.id
            )
          ),
        ],
        components:
          rolesComponents(
            interaction.guild.id
          ),
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
            interaction.guild.id,
            "📺 CANAIS",
            formatConfigDescription(
              interaction.guild.id
            )
          ),
        ],
        components:
          channelComponents(
            interaction.guild.id
          ),
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
          createEmbed(
            interaction.guild.id,
            "🎮 APOSTAS",
            formatConfigDescription(
              interaction.guild.id
            )
          ),
        ],
        components:
          betsComponents(
            interaction.guild.id
          ),
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
            interaction.guild.id,
            "🎯 MEDIADORES",
            `Cadastros e fila de mediadores.\n\n${getMediatorListText(
              interaction.guild.id
            )}`
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
    "config_fee_set"
  ) {
    return interaction.showModal(
      createFeeModal()
    );
  }

  if (
    id ===
    "config_back"
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
        ephemeral: true,
      }
    );
  }

  if (
    id ===
    "appearance_black" ||
    id ===
    "appearance_white" ||
    id ===
    "appearance_blue" ||
    id ===
    "appearance_red"
  ) {
    const config =
      getGuildConfig(
        interaction.guild.id
      );

    const colors = {
      appearance_black:
        "#000000",

      appearance_white:
        "#FFFFFF",

      appearance_blue:
        "#3498DB",

      appearance_red:
        "#E74C3C",
    };

    config.embedColor =
      colors[id];

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          "✅ Aparência atualizada.",
        ephemeral: true,
      }
    );
  }
}

client.on(
  Events.InteractionCreate,
  async interaction => {
    try {
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
                createConfigEmbed(
                  interaction.guild.id
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
                  {
                    label:
                      "1x1",
                    value:
                      "1x1",
                    emoji:
                      "👤",
                  },
                  {
                    label:
                      "2x2",
                    value:
                      "2x2",
                    emoji:
                      "👥",
                  },
                  {
                    label:
                      "3x3",
                    value:
                      "3x3",
                    emoji:
                      "👥",
                  },
                  {
                    label:
                      "4x4",
                    value:
                      "4x4",
                    emoji:
                      "👥",
                  }
                )
            );

          return sendSafeReply(
            interaction,
            {
              content:
                "🎮 **CRIAR FILAS**\n\n" +
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
            return sendSafeReply(
              interaction,
              {
                content:
                  "🎯 **CONFIGURAR FILA DE MEDIADORES**\n\nEscolha o canal onde a fila de mediadores será publicada.",
                components: [
                  new ActionRowBuilder().addComponents(
                    new ChannelSelectMenuBuilder()
                      .setCustomId(
                        "mediator_queue_channel"
                      )
                      .setPlaceholder(
                        "Escolha o canal"
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
          } catch (
            error
          ) {
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

      if (
        interaction.isStringSelectMenu()
      ) {
        return handleSelectMenu(
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
        interaction.isRoleSelectMenu()
      ) {
        return handleRoleSelect(
          interaction
        );
      }

      if (
        interaction.isButton()
      ) {
        return handleButton(
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
        "Erro na interação:",
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

const commands = [
  new SlashCommandBuilder()
    .setName("config")
    .setDescription(
      "Abrir painel de configuração"
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("fila")
    .setDescription(
      "Criar as filas de valores"
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("med")
    .setDescription(
      "Publicar a fila de mediadores"
    )
    .toJSON(),
];

client.once(
  Events.ClientReady,
  async readyClient => {
    console.log(
      `✅ Bot online como ${readyClient.user.tag}`
    );

    const rest =
      new REST({
        version: "10",
      }).setToken(TOKEN);

    try {
      /*
       * Remove comandos globais antigos.
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
       * Sobrescreve os comandos do
       * servidor deixando somente:
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
    } catch (
      error
    ) {
      console.error(
        "❌ Erro ao registrar comandos:",
        error
      );
    }
  }
);

client.on(
  Events.MessageCreate,
  async message => {
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
        .slice(
          PREFIX.length
        )
        .trim()
        .split(/\s+/);

    const command =
      (
        args.shift() || ""
      ).toLowerCase();

    try {
      if (
        command ===
        "ping"
      ) {
        return message.reply(
          "🏓 Pong!"
        );
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
            "❌ Apenas administradores."
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
            "❌ Apenas administradores."
          );
        }

        const row =
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(
                "fila_format"
              )
              .setPlaceholder(
                "Escolha o formato"
              )
              .addOptions(
                FORMATS.map(
                  format => ({
                    label:
                      format,
                    value:
                      format,
                  })
                )
              )
          );

        return message.reply({
          content:
            "🎮 Escolha o formato:",
          components: [
            row,
          ],
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
            "❌ Apenas administradores."
          );
        }

        const config =
          getGuildConfig(
            message.guild.id
          );

        if (
          !config.mediatorQueueChannelId
        ) {
          return message.reply(
            "❌ Configure primeiro o canal da fila de mediadores."
          );
        }

        await publishMediatorQueue(
          message.guild
        );

        return message.reply(
          "✅ Fila de mediadores publicada/atualizada."
        );
      }

      if (
        command ===
        "ajuda"
      ) {
        return message.reply({
          content:
            "**Comandos disponíveis:**\n\n" +
            "`.config` — painel de configuração\n" +
            "`.fila` — criar filas\n" +
            "`.med` — publicar fila de mediadores\n" +
            "`.ping` — testar o bot",
        });
      }
    } catch (
      error
    ) {
      console.error(
        "Erro no comando:",
        error
      );

      try {
        await message.reply(
          "❌ Ocorreu um erro ao executar o comando."
        );
      } catch {}
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

client.login(TOKEN);
