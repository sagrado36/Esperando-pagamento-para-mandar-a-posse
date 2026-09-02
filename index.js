// index.js
require("dotenv").config();

const {
  Client,
  Events,
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
const pendingAdminIds = new Map();

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
) {    if (
      queue.length >=
      requiredPlayers(format)
    ) {
      const firstPlayer =
        queue[0];

      const secondPlayer =
        queue[1];

      const firstType =
        choices[firstPlayer];

      const secondType =
        choices[secondPlayer];

      if (
        firstType ===
        secondType
      ) {
        /*
         * Os dois jogadores
         * escolheram o mesmo tipo.
         * Criamos a aposta.
         */
        try {
          const bet =
            await createPrivateBetChannel(
              guild,
              format,
              mode,
              value,
              [
                firstPlayer,
                secondPlayer,
              ]
            );

          queue.splice(
            0,
            2
          );

          delete choices[
            firstPlayer
          ];

          delete choices[
            secondPlayer
          ];

          saveDatabase();

          await sendSafeReply(
            interaction,
            {
              content:
                `✅ Aposta criada entre <@${firstPlayer}> e <@${secondPlayer}>.`,
              ephemeral: true,
            }
          );

          return bet;
        } catch (error) {
          console.error(
            "Erro ao criar aposta 1x1:",
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

          return null;
        }
      }

      /*
       * Os jogadores escolheram
       * tipos diferentes.
       *
       * A fila permanece cheia,
       * aguardando uma combinação
       * compatível.
       */
      await sendSafeReply(
        interaction,
        {
          content:
            "⚠️ A fila está cheia, mas os dois jogadores escolheram tipos de gelo diferentes. A fila permanecerá aguardando uma combinação compatível.",
          ephemeral: true,
        }
      );

      return null;
    }

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Você entrou na fila.",
        ephemeral: true,
      }
    );

    return null;
  }

  /*
   * FILAS 2x2 / 3x3 / 4x4
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

  /*
   * Quando a fila completa,
   * cria a aposta.
   */
  if (
    queue.length >=
    requiredPlayers(format)
  ) {
    const players =
      queue.splice(
        0,
        requiredPlayers(format)
      );

    saveDatabase();

    try {
      await createPrivateBetChannel(
        guild,
        format,
        mode,
        value,
        players
      );

      await sendSafeReply(
        interaction,
        {
          content:
            "✅ Fila completada! A aposta foi criada.",
          ephemeral: true,
        }
      );
    } catch (error) {
      console.error(
        "Erro ao criar aposta:",
        error
      );

      queue.unshift(
        ...players
      );

      saveDatabase();

      await sendSafeReply(
        interaction,
        {
          content:
            `❌ Não foi possível criar a aposta: ${error.message}`,
          ephemeral: true,
        }
      );
    }

    return;
  }

  await sendSafeReply(
    interaction,
    {
      content:
        "✅ Você entrou na fila.",
      ephemeral: true,
    }
  );
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
        "✅ Você saiu da fila.",
      ephemeral: true,
    }
  );
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
      : [];

  const status =
    bet.status || "waiting";

  let statusText =
    "🟡 Aguardando confirmação";

  if (
    status === "running"
  ) {
    statusText =
      "🟢 Aposta em andamento";
  }

  if (
    status === "cancelled"
  ) {
    statusText =
      "🔴 Aposta cancelada";
  }

  if (
    status === "finished"
  ) {
    statusText =
      "⚫ Aposta finalizada";
  }

  return createEmbed(
    guildId,
    "🎮 APOSTA CRIADA",
    `💰 **Valor:** ${formatMoney(
      bet.value
    )}\n` +
      `🎯 **Formato:** ${bet.format}\n` +
      `📱 **Modalidade:** ${modeLabel(
        bet.mode
      )}\n\n` +
      `👥 **Jogadores:**\n` +
      players
        .map(
          (id) =>
            `• <@${id}>`
        )
        .join("\n") +
      `\n\n` +
      `📌 **Status:** ${statusText}`
  );
}

function betButtons(
  bet
) {
  if (
    !bet ||
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
          "✅ Confirmar"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          `bet_cancel|${bet.id}`
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

async function createPrivateBetChannel(
  guild,
  format,
  mode,
  value,
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
      "O canal configurado para as apostas não é uma categoria."
    );
  }

  if (
    !Array.isArray(players) ||
    players.length < 2
  ) {
    throw new Error(
      "Jogadores insuficientes para criar a aposta."
    );
  }

  const betId =
    generateId(
      "bet"
    );

  const overwrites = [
    {
      id:
        guild.roles.everyone.id,
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
  ];

  if (
    config.mediatorRoleId
  ) {
    overwrites.push({
      id:
        config.mediatorRoleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  const channel =
    await guild.channels.create({
      name: `aposta-${String(
        value
      ).padStart(4, "0")}-${betId
        .slice(-6)
        .toLowerCase()}`,

      type:
        ChannelType.GuildText,

      parent:
        category.id,

      permissionOverwrites:
        overwrites,
    });

  const bet = {
    id: betId,
    guildId: guild.id,
    channelId: channel.id,
    format,
    mode,
    value: Number(value),
    players: [...players],
    status: "waiting",
    createdAt:
      new Date().toISOString(),
    confirmed: [],
    mediatorId: null,
    analystId: null,
    result: null,
  };

  db.bets[betId] =
    bet;

  saveDatabase();

  const message =
    await channel.send({
      embeds: [
        betEmbed(
          guild.id,
          bet
        ),
      ],
      components:
        betButtons(bet),
    });

  bet.betMessageId =
    message.id;

  saveDatabase();

  /*
   * Escolhe o próximo mediador
   * da rotação.
   */
  const mediator =
    getNextMediator(
      guild
    );

  if (mediator) {
    bet.mediatorId =
      mediator;

    saveDatabase();

    await assignMediator(
      guild,
      bet
    );
  }

  return bet;
}

function getNextMediator(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
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

  /*
   * Remove IDs repetidos.
   */
  config.mediatorQueue =
    [
      ...new Set(
        config.mediatorQueue
      ),
    ];

  if (
    config.mediatorQueue.length ===
      0
  ) {
    return null;
  }

  let index =
    Number(
      config.mediatorRotationIndex
    ) || 0;

  if (
    index >=
    config.mediatorQueue.length
  ) {
    index = 0;
  }

  const mediator =
    config.mediatorQueue[
      index
    ];

  config.mediatorRotationIndex =
    (index + 1) %
    config.mediatorQueue.length;

  saveDatabase();

  return mediator;
}

async function assignMediator(
  guild,
  bet
) {
  if (
    !bet ||
    !bet.mediatorId
  ) {
    return null;
  }

  try {
    const member =
      await guild.members.fetch(
        bet.mediatorId
      );

    if (!member) {
      return null;
    }

    const channel =
      await guild.channels.fetch(
        bet.channelId
      );

    if (!channel) {
      return null;
    }

    await channel.permissionOverwrites.edit(
      member.id,
      {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      }
    );

    await channel.send({
      content:
        `🛡️ Mediador designado: ${member}`,
    });

    return member;
  } catch (error) {
    console.error(
      "Erro ao atribuir mediador:",
      error
    );

    return null;
  }
}

async function refreshBetMessage(
  bet
) {
  if (!bet) {
    return;
  }

  try {
    const guild =
      await client.guilds.fetch(
        bet.guildId
      );

    if (!guild) {
      return;
    }

    const channel =
      await guild.channels.fetch(
        bet.channelId
      );

    if (!channel) {
      return;
    }

    let message = null;

    if (
      bet.betMessageId
    ) {
      try {
        message =
          await channel.messages.fetch(
            bet.betMessageId
          );
      } catch {
        message = null;
      }
    }

    if (!message) {
      const messages =
        await channel.messages.fetch({
          limit: 100,
        });

      message =
        messages.find(
          (item) => {
            if (
              item.author?.id !==
              client.user?.id
            ) {
              return false;
            }

            const title =
              item.embeds?.[0]?.title ||
              "";

            return (
              title ===
                "🎮 APOSTA" ||
              title ===
                "🎮 APOSTA CRIADA"
            );
          }
        );
    }

    if (!message) {
      return;
    }

    await message.edit({
      embeds: [
        betEmbed(
          bet.guildId,
          bet
        ),
      ],
      components:
        betButtons(bet),
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar mensagem da aposta:",
      error
    );
  }
}

async function handleBetConfirm(
  interaction,
  betId
) {
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
    bet.status !==
    "waiting"
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta aposta não está mais aguardando confirmação.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    !bet.players.includes(
      interaction.user.id
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não participa desta aposta.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    !Array.isArray(
      bet.confirmed
    )
  ) {
    bet.confirmed = [];
  }

  if (
    !bet.confirmed.includes(
      interaction.user.id
    )
  ) {
    bet.confirmed.push(
      interaction.user.id
    );
  }

  if (
    bet.confirmed.length >=
    bet.players.length
  ) {
    bet.status =
      "running";
  }

  saveDatabase();

  await refreshBetMessage(
    bet
  );

  await sendSafeReply(
    interaction,
    {
      content:
        bet.status ===
        "running"
          ? "🟢 Todos confirmaram. A aposta está em andamento!"
          : "✅ Sua confirmação foi registrada.",
      ephemeral: true,
    }
  );
}

async function handleBetCancel(
  interaction,
  betId
) {
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
    bet.status !==
    "waiting"
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta aposta não pode mais ser cancelada.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    !bet.players.includes(
      interaction.user.id
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não participa desta aposta.",
        ephemeral: true,
      }
    );

    return;
  }

  bet.status =
    "cancelled";

  bet.cancelledBy =
    interaction.user.id;

  bet.cancelledAt =
    new Date().toISOString();

  saveDatabase();

  await refreshBetMessage(
    bet
  );

  await sendSafeReply(
    interaction,
    {
      content:
        "❌ Aposta cancelada.",
      ephemeral: true,
    }
  );
}

async function handleMediatorQueueButton(
  interaction,
  action
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
          "❌ Você precisa ter o cargo de Mediador para usar a fila de mediadores.",
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
    !Array.isArray(
      config.mediatorQueue
    )
  ) {
    config.mediatorQueue = [];
  }

  const userId =
    interaction.user.id;

  if (
    action === "join"
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

      return;
    }

    config.mediatorQueue.push(
      userId
    );

    saveDatabase();

    await refreshMediatorQueueMessage(
      guild.id
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
    action === "leave"
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

      return;
    }

    config.mediatorQueue.splice(
      index,
      1
    );

    saveDatabase();

    await refreshMediatorQueueMessage(
      guild.id
    );

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Você saiu da fila de mediadores.",
        ephemeral: true,
      }
    );
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

  const messages =
    await channel.messages.fetch({
      limit: 100,
    });

  const existing =
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
    await guild.members.fetch();

    const role =
      await guild.roles.fetch(
        config.analystRoleId
      );

    if (!role) {
      return null;
    }

    const members =
      [...role.members.values()];

    if (
      members.length === 0
    ) {
      return null;
    }

    const analyst =
      members[0];

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
          `🔎 Analista designado: ${analyst}`,
      });
    }

    return analyst;
  } catch (error) {
    console.error(
      "Erro ao atribuir analista:",
      error
    );

    return null;
  }
}async function handleQueueButton(
  interaction
) {
  const customId =
    interaction.customId;

  const parts =
    customId.split("|");

  const action =
    parts[0];

  const format =
    parts[1];

  const mode =
    parts[2];

  const value =
    Number(parts[3]);

  const type =
    parts[4] || "normal";

  if (
    !FORMATS.includes(
      format
    ) ||
    !MODES.includes(
      mode
    ) ||
    !Number.isFinite(value)
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Fila inválida ou não encontrada.",
        ephemeral: true,
      }
    );

    return;
  }

  /*
   * Confirma que a fila realmente
   * existe antes de tentar entrar.
   */
  const queue =
    getQueue(
      interaction.guild.id,
      format,
      mode,
      value,
      type
    );

  if (!queue) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Fila não encontrada.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    action ===
    "queue_join"
  ) {
    await joinQueue(
      interaction,
      format,
      mode,
      value,
      type
    );

    return;
  }

  if (
    action ===
    "queue_leave"
  ) {
    await leaveQueue(
      interaction,
      format,
      mode,
      value,
      type
    );

    return;
  }

  await sendSafeReply(
    interaction,
    {
      content:
        "❌ Ação da fila inválida.",
      ephemeral: true,
    }
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

  const config =
    getGuildConfig(
      guild.id
    );

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
          "🎭 CONFIGURAR CARGOS",
          "Selecione os cargos que serão usados pelo bot."
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
          "📢 CONFIGURAR CANAIS",
          "Selecione os canais utilizados pelos comandos de análise."
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
          "🎲 CONFIGURAR APOSTAS",
          "Selecione a categoria onde os canais privados das apostas serão criados."
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
          "🛡️ MEDIADORES E ADMs",
          `Configure os mediadores, a fila de mediadores e os ADMs responsáveis pelo Pix.\n\n` +
            `**Mediadores cadastrados na fila:** ${config.mediatorQueue.length}\n` +
            `**ADMs cadastrados:** ${config.pixAdmins.length}`
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
          `Configure a aparência do bot.\n\n` +
            `**Cor atual:** ${config.embedColor}\n` +
            `**Avatar:** ${
              config.botAvatar
                ? config.botAvatar
                : "Não configurado"
            }`
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
          "💸 TAXA DO ADM",
          `Taxa atual: **${formatMoney(
            config.admFee
          )}**\n\nClique abaixo para configurar uma nova taxa.`
        ),
      ],
      components:
        feeComponents(),
    });

    return;
  }

  if (
    id ===
    "config_queue"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🎰 CONFIGURAÇÃO DAS FILAS",
          "Use o comando `/fila` para criar as 12 filas automaticamente."
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
    "config_fee_set"
  ) {
    await interaction.showModal(
      createFeeModal()
    );

    return;
  }

  if (
    id ===
    "admin_add"
  ) {
    await interaction.showModal(
      createAdminIdModal()
    );

    return;
  }

  if (
    id ===
    "admin_list"
  ) {
    const admins =
      Array.isArray(
        config.pixAdmins
      )
        ? config.pixAdmins
        : [];

    const description =
      admins.length
        ? admins
            .map(
              (admin, index) =>
                `**${index + 1}. ${admin.name}**\n` +
                `👤 <@${admin.userId}>\n` +
                `💠 Pix: \`${admin.key}\``
            )
            .join("\n\n")
        : "Nenhum ADM cadastrado.";

    await interaction.reply({
      embeds: [
        createEmbed(
          guild.id,
          "💳 ADMs CADASTRADOS",
          description
        ),
      ],
      ephemeral: true,
    });

    return;
  }

  if (
    id ===
    "mediator_add"
  ) {
    await interaction.showModal(
      createMediatorModal()
    );

    return;
  }

  if (
    id ===
    "mediator_list"
  ) {
    const mediators =
      Array.isArray(
        config.mediatorQueue
      )
        ? config.mediatorQueue
        : [];

    const description =
      mediators.length
        ? mediators
            .map(
              (userId, index) =>
                `**${index + 1}.** <@${userId}>`
            )
            .join("\n")
        : "Nenhum mediador cadastrado.";

    await interaction.reply({
      embeds: [
        createEmbed(
          guild.id,
          "🛡️ MEDIADORES",
          description
        ),
      ],
      ephemeral: true,
    });

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

  if (
    id ===
    "mediator_queue_join"
  ) {
    await handleMediatorQueueButton(
      interaction,
      "join"
    );

    return;
  }

  if (
    id ===
    "mediator_queue_leave"
  ) {
    await handleMediatorQueueButton(
      interaction,
      "leave"
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
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem configurar o bot.",
        ephemeral: true,
      }
    );

    return;
  }

  const roleId =
    interaction.values?.[0];

  if (!roleId) {
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
          "✅ Cargo de Mediador configurado.",
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
          "✅ Cargo de Analista configurado.",
        ephemeral: true,
      }
    );
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
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem configurar o bot.",
        ephemeral: true,
      }
    );

    return;
  }

  const channelId =
    interaction.values?.[0];

  if (!channelId) {
    return;
  }

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    interaction.customId ===
    "select_channel_mobile"
  ) {
    config.analysisChannelMobile =
      channelId;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Canal do `.ssmob` configurado.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    interaction.customId ===
    "select_channel_emulator"
  ) {
    config.analysisChannelEmulator =
      channelId;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Canal do `.ssemu` configurado.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    interaction.customId ===
    "select_bets_category"
  ) {
    const channel =
      await guild.channels.fetch(
        channelId
      );

    if (
      !channel ||
      channel.type !==
        ChannelType.GuildCategory
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Selecione uma categoria válida.",
          ephemeral: true,
        }
      );

      return;
    }

    config.betsCategoryId =
      channelId;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Categoria das apostas configurada.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    interaction.customId ===
    "select_mediator_channel"
  ) {
    const channel =
      await guild.channels.fetch(
        channelId
      );

    if (
      !channel ||
      channel.type !==
        ChannelType.GuildText
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Selecione um canal de texto válido.",
          ephemeral: true,
        }
      );

      return;
    }

    config.mediatorQueueChannelId =
      channelId;

    saveDatabase();

    try {
      await publishMediatorQueue(
        guild
      );
    } catch (error) {
      console.error(
        "Erro ao publicar fila de mediadores:",
        error
      );
    }

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Canal da fila de mediadores configurado.",
        ephemeral: true,
      }
    );
  }
}

async function handleStringSelect(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id ===
    "select_fila_format"
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

    await interaction.update({
      embeds: [
        createEmbed(
          interaction.guild.id,
          "🎰 CRIAR FILA",
          `Formato selecionado: **${format}**\n\nAgora escolha a modalidade.`
        ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(
              `select_fila_mode|${format}`
            )
            .setPlaceholder(
              "Selecione a modalidade"
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
        ),
      ],
    });

    return;
  }

  if (
    id.startsWith(
      "select_fila_mode|"
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

    await interaction.update({
      embeds: [
        createEmbed(
          interaction.guild.id,
          "📢 ESCOLHER CANAL",
          `**Formato:** ${format}\n` +
            `**Modalidade:** ${modeLabel(
              mode
            )}\n\n` +
            "Agora selecione o canal onde as 12 filas serão publicadas."
        ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(
              `select_fila_channel|${format}|${mode}`
            )
            .setPlaceholder(
              "Selecione o canal das filas"
            )
            .setChannelTypes(
              ChannelType.GuildText
            )
            .setMinValues(1)
            .setMaxValues(1)
        ),
      ],
    });

    return;
  }

  if (
    id.startsWith(
      "select_fila_channel|"
    )
  ) {
    const parts =
      id.split("|");

    const format =
      parts[1];

    const mode =
      parts[2];

    const channelId =
      interaction.values?.[0];

    if (
      !FORMATS.includes(
        format
      ) ||
      !MODES.includes(
        mode
      ) ||
      !channelId
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Dados da fila inválidos.",
          ephemeral: true,
        }
      );

      return;
    }

    try {
      await interaction.deferUpdate();

      const messages =
        await publishQueues(
          interaction.guild,
          format,
          mode,
          channelId
        );

      await interaction.followUp({
        content:
          `✅ Foram criadas **${messages.length} filas** de ${format} em ${modeLabel(
            mode
          )}.`,
        ephemeral: true,
      });
    } catch (error) {
      console.error(
        "Erro ao publicar filas:",
        error
      );

      await interaction.followUp({
        content:
          `❌ Erro ao criar as filas: ${error.message}`,
        ephemeral: true,
      });
    }

    return;
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
          "❌ Apenas administradores podem usar esta função.",
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
    id ===
    "admin_id_modal"
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
            "❌ Informe um ID de Discord válido.",
          ephemeral: true,
        }
      );

      return;
    }

    let member = null;

    try {
      member =
        await guild.members.fetch(
          userId
        );
    } catch {
      member = null;
    }

    if (!member) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Esse usuário não foi encontrado neste servidor.",
          ephemeral: true,
        }
      );

      return;
    }

    if (
      config.pixAdmins.some(
        (admin) =>
          admin.userId ===
          userId
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Este usuário já está cadastrado como ADM.",
          ephemeral: true,
        }
      );

      return;
    }

    pendingAdminIds.set(
      interaction.user.id,
      userId
    );

    await interaction.showModal(
      createAdminPixModal()
    );

    return;
  }

  if (
    id ===
    "admin_pix_modal"
  ) {
    const userId =
      pendingAdminIds.get(
        interaction.user.id
      );

    if (!userId) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ O cadastro do ADM expirou. Comece novamente.",
          ephemeral: true,
        }
      );

      return;
    }

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

    if (!name || !key) {
      pendingAdminIds.delete(
        interaction.user.id
      );

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

    config.pixAdmins.push({
      id: generateId(
        "adm"
      ),
      userId,
      name,
      key,
      qr:
        qr || null,
      addedBy:
        interaction.user.id,
      addedAt:
        new Date().toISOString(),
    });

    pendingAdminIds.delete(
      interaction.user.id
    );

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ ADM **${name}** cadastrado com sucesso, incluindo os dados Pix.`,
        ephemeral: true,
      }
    );

    return;
  }

  if (
    id ===
    "mediator_add_modal"
  ) {
    const userId =
      interaction.fields
        .getTextInputValue(
          "mediator_user_id"
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
            "❌ Informe um ID de Discord válido.",
          ephemeral: true,
        }
      );

      return;
    }

    let member = null;

    try {
      member =
        await guild.members.fetch(
          userId
        );
    } catch {
      member = null;
    }

    if (!member) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Esse usuário não foi encontrado neste servidor.",
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
        userId
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Este usuário já está cadastrado como mediador.",
          ephemeral: true,
        }
      );

      return;
    }

    config.mediatorQueue.push(
      userId
    );

    saveDatabase();

    await refreshMediatorQueueMessage(
      guild.id
    );

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ <@${userId}> foi cadastrado como mediador.`,
        ephemeral: true,
      }
    );

    return;
  }

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
            "❌ Informe a taxa somente em números inteiros de centavos.",
          ephemeral: true,
        }
      );

      return;
    }

    const cents =
      Number(raw);

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
            "❌ A taxa deve estar entre 0 e 100000 centavos.",
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
          `✅ Taxa configurada para **${formatMoney(
            cents
          )}**.`,
        ephemeral: true,
      }
    );

    return;
  }

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

    if (
      !/^https?:\/\//i.test(
        url
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Informe uma URL válida começando com http:// ou https://.",
          ephemeral: true,
        }
      );

      return;
    }

    config.botAvatar =
      url;

    saveDatabase();

    try {
      await client.user.setAvatar(
        url
      );
    } catch (error) {
      console.error(
        "Erro ao alterar avatar:",
        error
      );

      await sendSafeReply(
        interaction,
        {
          content:
            "⚠️ URL salva, mas não foi possível alterar o avatar do bot agora.",
          ephemeral: true,
        }
      );

      return;
    }

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Foto do bot configurada.",
        ephemeral: true,
      }
    );

    return;
  }

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
            "❌ Informe uma cor hexadecimal válida, por exemplo `#5865F2`.",
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
          `✅ Cor das embeds configurada para **${config.embedColor}**.`,
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
    ) ||
    id.startsWith(
      "queue_leave|"
    )
  ) {
    await handleQueueButton(
      interaction
    );

    return;
  }

  if (
    id.startsWith(
      "bet_confirm|"
    )
  ) {
    const betId =
      id.split("|")[1];

    await handleBetConfirm(
      interaction,
      betId
    );

    return;
  }

  if (
    id.startsWith(
      "bet_cancel|"
    )
  ) {
    const betId =
      id.split("|")[1];

    await handleBetCancel(
      interaction,
      betId
    );

    return;
  }

  if (
    id ===
      "mediator_queue_join"
  ) {
    await handleMediatorQueueButton(
      interaction,
      "join"
    );

    return;
  }

  if (
    id ===
      "mediator_queue_leave"
  ) {
    await handleMediatorQueueButton(
      interaction,
      "leave"
    );

    return;
  }

  if (
    id.startsWith(
      "config_"
    ) ||
    id.startsWith(
      "appearance_"
    ) ||
    id.startsWith(
      "admin_"
    ) ||
    id.startsWith(
      "mediator_"
    ) ||
    id ===
      "publish_mediator_queue"
  ) {
    await handleConfigButton(
      interaction
    );

    return;
  }

  await sendSafeReply(
    interaction,
    {
      content:
        "❌ Botão não reconhecido.",
      ephemeral: true,
    }
  );
}

async function handleSelectMenu(
  interaction
) {
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

    if (
      interaction.customId.startsWith(
        "select_fila_channel|"
      )
    ) {
      /*
       * O menu de canal das filas
       * é tratado aqui separadamente.
       */
      await handleStringSelect(
        interaction
      );
    }

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

  await sendSafeReply(
    interaction,
    {
      content:
        "❌ Menu não reconhecido.",
      ephemeral: true,
    }
  );
}

async function handleInteraction(
  interaction
) {
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
      interaction.isAnySelectMenu()
    ) {
      await handleSelectMenu(
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
      await handleSlashCommand(
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

async function handleSlashCommand(
  interaction
) {
  const command =
    interaction.commandName;

  if (
    command ===
    "config"
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
            "❌ Apenas administradores podem usar o painel de configuração.",
          ephemeral: true,
        }
      );

      return;
    }

    await interaction.reply({
      embeds: [
        configMainEmbed(
          interaction.guild
        ),
      ],
      components:
        configButtons(),
      ephemeral: true,
    });

    return;
  }

  if (
    command ===
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

    await interaction.reply({
      embeds: [
        createEmbed(
          interaction.guild.id,
          "🎰 CRIAR FILAS",
          "Primeiro escolha o formato."
        ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(
              "select_fila_format"
            )
            .setPlaceholder(
              "Selecione o formato"
            )
            .addOptions(
              {
                label:
                  "1x1",
                value:
                  "1x1",
                emoji:
                  "1️⃣",
              },
              {
                label:
                  "2x2",
                value:
                  "2x2",
                emoji:
                  "2️⃣",
              },
              {
                label:
                  "3x3",
                value:
                  "3x3",
                emoji:
                  "3️⃣",
              },
              {
                label:
                  "4x4",
                value:
                  "4x4",
                emoji:
                  "4️⃣",
              }
            )
        ),
      ],
      ephemeral: true,
    });

    return;
  }

  if (
    command ===
    "med"
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
            "❌ Apenas administradores podem publicar a fila de mediadores.",
          ephemeral: true,
        }
      );

      return;
    }

    try {
      await publishMediatorQueue(
        interaction.guild
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
}

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
    args.shift()
      ?.toLowerCase();

  if (!command) {
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
            "select_fila_format"
          )
          .setPlaceholder(
            "Selecione o formato"
          )
          .addOptions(
            {
              label:
                "1x1",
              value:
                "1x1",
              emoji:
                "1️⃣",
            },
            {
              label:
                "2x2",
              value:
                "2x2",
              emoji:
                "2️⃣",
            },
            {
              label:
                "3x3",
              value:
                "3x3",
              emoji:
                "3️⃣",
            },
            {
              label:
                "4x4",
              value:
                "4x4",
              emoji:
                "4️⃣",
            }
          )
      );

    await message.reply({
      embeds: [
        createEmbed(
          message.guild.id,
          "🎰 CRIAR FILAS",
          "Primeiro escolha o formato."
        ),
      ],
      components: [
        row,
      ],
    });

    return;
  }

  if (
    command ===
    "ssmob"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      await message.reply(
        "❌ Apenas administradores podem publicar filas."
      );

      return;
    }

    const config =
      getGuildConfig(
        message.guild.id
      );

    if (
      !config.analysisChannelMobile
    ) {
      await message.reply(
        "❌ Canal do `.ssmob` não configurado."
      );

      return;
    }

    try {
      const messages =
        await publishQueues(
          message.guild,
          "1x1",
          "mobile",
          config.analysisChannelMobile
        );

      await message.reply(
        `✅ ${messages.length} filas publicadas no canal mobile.`
      );
    } catch (error) {
      await message.reply(
        `❌ Erro: ${error.message}`
      );
    }

    return;
  }

  if (
    command ===
    "ssemu"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      await message.reply(
        "❌ Apenas administradores podem publicar filas."
      );

      return;
    }

    const config =
      getGuildConfig(
        message.guild.id
      );

    if (
      !config.analysisChannelEmulator
    ) {
      await message.reply(
        "❌ Canal do `.ssemu` não configurado."
      );

      return;
    }

    try {
      const messages =
        await publishQueues(
          message.guild,
          "1x1",
          "emulador",
          config.analysisChannelEmulator
        );

      await message.reply(
        `✅ ${messages.length} filas publicadas no canal emulador.`
      );
    } catch (error) {
      await message.reply(
        `❌ Erro: ${error.message}`
      );
    }

    return;
  }
}async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("config")
      .setDescription(
        "Abrir o painel de configuração do bot"
      ),

    new SlashCommandBuilder()
      .setName("fila")
      .setDescription(
        "Criar as 12 filas de um formato e modalidade"
      ),

    new SlashCommandBuilder()
      .setName("med")
      .setDescription(
        "Publicar ou atualizar a fila de mediadores"
      ),
  ].map(
    (command) =>
      command.toJSON()
  );

  const rest =
    new REST({
      version: "10",
    }).setToken(
      TOKEN
    );

  try {
    console.log(
      "🔄 Registrando comandos slash..."
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
      "✅ Comandos slash registrados com sucesso."
    );
  } catch (error) {
    console.error(
      "❌ Erro ao registrar comandos slash:",
      error
    );
  }
}

async function cleanupOldQueueMessages(
  guild
) {
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
    saveDatabase();
    return;
  }

  /*
   * Não apagamos mensagens automaticamente.
   *
   * O objetivo deste método é apenas
   * limpar referências de mensagens
   * que já não existem.
   */
  let changed = false;

  for (
    const [
      key,
      messageId,
    ] of Object.entries(
      config.queueMessages
    )
  ) {
    try {
      const parts =
        key.split("|");

      const channelId =
        parts[0];

      if (
        !channelId ||
        !messageId
      ) {
        delete config.queueMessages[
          key
        ];

        changed = true;
        continue;
      }
    } catch {
      delete config.queueMessages[
        key
      ];

      changed = true;
    }
  }

  if (changed) {
    saveDatabase();
  }
}

async function startupChecks() {
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

    console.log(
      `🏠 Servidor conectado: ${guild.name} (${guild.id})`
    );

    getGuildConfig(
      guild.id
    );

    await cleanupOldQueueMessages(
      guild
    );
  } catch (error) {
    console.error(
      "Erro nas verificações iniciais:",
      error
    );
  }
}

/*
 * EVENTO: BOT ONLINE
 */
client.once(
  Events.ClientReady,
  async (
    readyClient
  ) => {
    console.log(
      `🤖 Bot online como ${readyClient.user.tag}`
    );

    console.log(
      `🆔 Client ID: ${CLIENT_ID}`
    );

    console.log(
      `🏠 Guild ID: ${GUILD_ID}`
    );

    await registerSlashCommands();

    await startupChecks();
  }
);

/*
 * EVENTO: INTERAÇÕES
 */
client.on(
  Events.InteractionCreate,
  async (
    interaction
  ) => {
    await handleInteraction(
      interaction
    );
  }
);

/*
 * EVENTO: MENSAGENS
 *
 * Mantém os comandos com prefixo.
 */
client.on(
  Events.MessageCreate,
  async (
    message
  ) => {
    await handleCommand(
      message
    );
  }
);

/*
 * Tratamento de erros globais.
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
 * LOGIN
 */
client
  .login(TOKEN)
  .then(() => {
    console.log(
      "🔐 Login realizado."
    );
  })
  .catch((error) => {
    console.error(
      "❌ Erro ao fazer login:",
      error
    );
  });    return;
  }

  const bet = db.bets.find((b) => b.id === betId);

  if (!bet) {
    await sendSafeReply(interaction, {
      content: "❌ Aposta não encontrada.",
      ephemeral: true,
    });
    return;
  }

  if (bet.status !== "waiting") {
    await sendSafeReply(interaction, {
      content: "❌ Essa aposta não está mais aguardando confirmação.",
      ephemeral: true,
    });
    return;
  }

  const isPlayer =
    bet.player1Id === interaction.user.id ||
    bet.player2Id === interaction.user.id;

  if (!isPlayer) {
    await sendSafeReply(interaction, {
      content: "❌ Você não participa dessa aposta.",
      ephemeral: true,
    });
    return;
  }

  if (bet.confirmations.includes(interaction.user.id)) {
    await sendSafeReply(interaction, {
      content: "⚠️ Você já confirmou essa aposta.",
      ephemeral: true,
    });
    return;
  }

  bet.confirmations.push(interaction.user.id);

  if (bet.confirmations.length >= 2) {
    bet.status = "running";

    const guild = interaction.guild;

    if (guild) {
      try {
        await assignMediator(guild, bet);
        await assignAnalyst(guild, bet);
      } catch (error) {
        console.error("Erro ao atribuir equipe da aposta:", error);
      }
    }

    saveDb();

    await refreshBetMessage(interaction, bet);

    await sendSafeReply(interaction, {
      content:
        "✅ Ambos os jogadores confirmaram. A aposta foi iniciada!",
      ephemeral: true,
    });

    return;
  }

  saveDb();

  await refreshBetMessage(interaction, bet);

  await sendSafeReply(interaction, {
    content:
      "✅ Sua confirmação foi registrada. Aguardando o outro jogador.",
    ephemeral: true,
  });
}

async function handleBetCancel(interaction, betId) {
  const bet = db.bets.find((b) => b.id === betId);

  if (!bet) {
    await sendSafeReply(interaction, {
      content: "❌ Aposta não encontrada.",
      ephemeral: true,
    });
    return;
  }

  if (bet.status !== "waiting") {
    await sendSafeReply(interaction, {
      content: "❌ Essa aposta não pode mais ser cancelada.",
      ephemeral: true,
    });
    return;
  }

  const isPlayer =
    bet.player1Id === interaction.user.id ||
    bet.player2Id === interaction.user.id;

  if (!isPlayer) {
    await sendSafeReply(interaction, {
      content: "❌ Você não participa dessa aposta.",
      ephemeral: true,
    });
    return;
  }

  bet.status = "cancelled";
  bet.cancelledBy = interaction.user.id;
  bet.cancelledAt = Date.now();

  saveDb();

  await refreshBetMessage(interaction, bet);

  await sendSafeReply(interaction, {
    content: "✅ Aposta cancelada com sucesso.",
    ephemeral: true,
  });
}

async function handleButton(interaction) {
  const id = interaction.customId || "";

  if (id === "config_back") {
    await interaction.update({
      embeds: [configMainEmbed(interaction.guild)],
      components: configMainComponents(),
    });
    return;
  }

  if (id === "config_mediators") {
    await interaction.update({
      embeds: [mediatorConfigEmbed(interaction.guild)],
      components: mediatorConfigComponents(interaction.guild),
    });
    return;
  }

  if (id === "config_roles") {
    await interaction.update({
      embeds: [configRolesEmbed(interaction.guild)],
      components: configRolesComponents(interaction.guild),
    });
    return;
  }

  if (id === "config_channels") {
    await interaction.update({
      embeds: [configChannelsEmbed(interaction.guild)],
      components: configChannelsComponents(interaction.guild),
    });
    return;
  }

  if (id === "config_bets") {
    await interaction.update({
      embeds: [configBetsEmbed(interaction.guild)],
      components: configBetsComponents(interaction.guild),
    });
    return;
  }

  if (id === "config_fee_set") {
    await interaction.showModal(createFeeModal());
    return;
  }

  if (id === "admin_add") {
    await interaction.showModal(createAdminIdModal());
    return;
  }

  if (id === "admin_list") {
    const config = getGuildConfig(interaction.guild.id);

    const admins = Array.isArray(config.pixAdmins)
      ? config.pixAdmins
      : [];

    if (!admins.length) {
      await sendSafeReply(interaction, {
        content: "ℹ️ Nenhum ADM cadastrado.",
        ephemeral: true,
      });
      return;
    }

    const text = admins
      .map((admin, index) => {
        return (
          `**${index + 1}. ${admin.name || "Sem nome"}**\n` +
          `👤 Discord: <@${admin.userId}>\n` +
          `💠 Pix: \`${admin.key || "Não informado"}\``
        );
      })
      .join("\n\n");

    await sendSafeReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setTitle("👑 ADMs cadastrados")
          .setDescription(text)
          .setColor(0x5865f2),
      ],
      ephemeral: true,
    });

    return;
  }

  if (id === "mediator_add") {
    await interaction.showModal(createMediatorModal());
    return;
  }

  if (id === "mediator_list") {
    const config = getGuildConfig(interaction.guild.id);

    const mediators = Array.isArray(config.mediatorQueue)
      ? config.mediatorQueue
      : [];

    if (!mediators.length) {
      await sendSafeReply(interaction, {
        content: "ℹ️ Nenhum mediador cadastrado.",
        ephemeral: true,
      });
      return;
    }

    const text = mediators
      .map((userId, index) => `${index + 1}. <@${userId}>`)
      .join("\n");

    await sendSafeReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setTitle("🛡️ Mediadores cadastrados")
          .setDescription(text)
          .setColor(0x5865f2),
      ],
      ephemeral: true,
    });

    return;
  }

  if (id === "mediator_queue_join") {
    await handleMediatorQueueButton(interaction, "join");
    return;
  }

  if (id === "mediator_queue_leave") {
    await handleMediatorQueueButton(interaction, "leave");
    return;
  }

  if (id === "queue_join") {
    const [, queueId] = id.split(":");

    await joinQueue(interaction, queueId);
    return;
  }

  if (id.startsWith("queue_join:")) {
    const queueId = id.slice("queue_join:".length);
    await joinQueue(interaction, queueId);
    return;
  }

  if (id.startsWith("queue_leave:")) {
    const queueId = id.slice("queue_leave:".length);
    await leaveQueue(interaction, queueId);
    return;
  }

  if (id.startsWith("queue_ice:")) {
    const [, queueId, iceType] = id.split(":");

    await joinQueue(interaction, queueId, iceType);
    return;
  }

  if (id.startsWith("bet_confirm:")) {
    const betId = id.slice("bet_confirm:".length);
    await handleBetConfirm(interaction, betId);
    return;
  }

  if (id.startsWith("bet_cancel:")) {
    const betId = id.slice("bet_cancel:".length);
    await handleBetCancel(interaction, betId);
    return;
  }

  if (id === "config_avatar") {
    await interaction.showModal(createAvatarModal());
    return;
  }

  if (id === "config_color") {
    await interaction.showModal(createColorModal());
    return;
  }

  if (id === "config_refresh") {
    await interaction.update({
      embeds: [configMainEmbed(interaction.guild)],
      components: configMainComponents(),
    });
    return;
  }
}

async function handleSelectMenu(interaction) {
  const id = interaction.customId || "";

  if (id === "select_fila_format") {
    const format = interaction.values[0];

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎮 Criar filas")
          .setDescription(
            `Formato selecionado: **${format}**\n\nAgora escolha a modalidade.`
          )
          .setColor(0x5865f2),
      ],
      components: [modeSelectRow()],
    });

    return;
  }

  if (id === "select_fila_mode") {
    const format = interaction.message?.embeds?.[0]?.description
      ?.match(/\*\*(.*?)\*\*/)?.[1];

    const mode = interaction.values[0];

    if (!format || !FORMATS.includes(format)) {
      await sendSafeReply(interaction, {
        content: "❌ Formato inválido. Execute `/fila` novamente.",
        ephemeral: true,
      });
      return;
    }

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎮 Criar filas")
          .setDescription(
            `Formato: **${format}**\n` +
            `Modalidade: **${mode}**\n\n` +
            `Agora escolha o canal onde as filas serão publicadas.`
          )
          .setColor(0x5865f2),
      ],
      components: [filaChannelSelectRow(interaction.guild)],
    });

    return;
  }

  if (id === "select_fila_channel") {
    const channelId = interaction.values[0];

    const description =
      interaction.message?.embeds?.[0]?.description || "";

    const formatMatch = description.match(/Formato:\s*\*\*(.*?)\*\*/);
    const modeMatch = description.match(/Modalidade:\s*\*\*(.*?)\*\*/);

    const format = formatMatch?.[1];
    const mode = modeMatch?.[1];

    if (!format || !FORMATS.includes(format)) {
      await sendSafeReply(interaction, {
        content: "❌ Formato inválido. Execute `/fila` novamente.",
        ephemeral: true,
      });
      return;
    }

    if (!mode || !MODES.includes(mode)) {
      await sendSafeReply(interaction, {
        content: "❌ Modalidade inválida. Execute `/fila` novamente.",
        ephemeral: true,
      });
      return;
    }

    await sendSafeReply(interaction, {
      content: "⏳ Publicando as 12 filas...",
      ephemeral: true,
    });

    try {
      const result = await publishQueues(
        interaction.guild,
        format,
        mode,
        channelId
      );

      await interaction.editReply({
        content:
          `✅ **${result.length} filas publicadas com sucesso!**\n` +
          `Formato: **${format}**\n` +
          `Modalidade: **${mode}**`,
      });
    } catch (error) {
      console.error("Erro ao publicar filas:", error);

      await interaction.editReply({
        content:
          `❌ Não foi possível publicar as filas.\n` +
          `\`${error.message || "Erro desconhecido"}\``,
      });
    }

    return;
  }
}

async function handleCommand(interaction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName === "fila") {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎮 Criar filas")
          .setDescription(
            "Escolha o **formato** das filas que deseja criar."
          )
          .setColor(0x5865f2),
      ],
      components: [formatSelectRow()],
      ephemeral: true,
    });

    return;
  }

  if (interaction.commandName === "config") {
    await interaction.reply({
      embeds: [configMainEmbed(interaction.guild)],
      components: configMainComponents(),
      ephemeral: true,
    });

    return;
  }

  if (interaction.commandName === "med") {
    await publishMediatorQueue(interaction.guild);
    return;
  }
}

async function handlePrefixCommand(message) {
  if (message.author.bot) {
    return;
  }

  if (!message.content.startsWith(PREFIX)) {
    return;
  }

  const args = message.content
    .slice(PREFIX.length)
    .trim()
    .split(/\s+/);

  const command = args.shift()?.toLowerCase();

  if (command === "fila") {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎮 Criar filas")
          .setDescription(
            "Use o comando **/fila** para criar as filas."
          )
          .setColor(0x5865f2),
      ],
    });

    return;
  }

  if (command === "med") {
    await publishMediatorQueue(message.guild);
    return;
  }

  if (command === "config") {
    await message.reply({
      embeds: [configMainEmbed(message.guild)],
      components: configMainComponents(),
    });

    return;
  }
}

async function publishMediatorQueue(guild) {
  const config = getGuildConfig(guild.id);

  if (!config.mediatorChannelId) {
    throw new Error(
      "O canal da fila de mediadores ainda não foi configurado."
    );
  }

  const channel = await guild.channels
    .fetch(config.mediatorChannelId)
    .catch(() => null);

  if (!channel) {
    throw new Error("Canal da fila de mediadores não encontrado.");
  }

  if (!channel.isTextBased()) {
    throw new Error("O canal configurado não é um canal de texto.");
  }

  if (!channel.isSendable()) {
    throw new Error(
      "Não tenho permissão para enviar mensagens nesse canal."
    );
  }

  const message = await channel.send({
    embeds: [mediatorQueueEmbed(guild)],
    components: mediatorQueueButtons(),
  });

  config.mediatorQueueMessageId = message.id;

  saveDb();

  return message;
}

cliente.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ Bot conectado como ${readyClient.user.tag}`);

  try {
    await registerCommands();

    console.log("✅ Comandos registrados com sucesso.");
  } catch (error) {
    console.error("❌ Erro ao registrar comandos:", error);
  }
});

cliente.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
      return;
    }

    if (interaction.isRoleSelectMenu()) {
      await handleRoleSelect(interaction);
      return;
    }

    if (interaction.isChannelSelectMenu()) {
      await handleChannelSelect(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
      return;
    }
  } catch (error) {
    console.error("❌ Erro ao processar interação:", error);

    try {
      await sendSafeReply(interaction, {
        content:
          "❌ Ocorreu um erro ao processar essa ação. Verifique o console do bot.",
        ephemeral: true,
      });
    } catch {}
  }
});

cliente.on(Events.MessageCreate, async (message) => {
  try {
    await handlePrefixCommand(message);
  } catch (error) {
    console.error("❌ Erro no comando prefixado:", error);
  }
});

cliente.login(TOKEN);
