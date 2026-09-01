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
  }  if (!config.embedColor) {
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

function removeFromQueue(
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
    queue.findIndex(
      (entry) =>
        entry.userId === userId
    );

  if (index !== -1) {
    queue.splice(index, 1);
    saveDatabase();
    return true;
  }

  return false;
}

function addToQueue(
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
    queue.some(
      (entry) =>
        entry.userId === userId
    )
  ) {
    return false;
  }

  queue.push({
    userId,
    joinedAt:
      Date.now(),
  });

  saveDatabase();

  return true;
}

function clearQueue(
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

  db.queues[key] = [];

  saveDatabase();
}

function getQueueCount(
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
  ).length;
}function queueEntry(
  userId,
  guildId
) {
  const user =
    getUserData(userId);

  return {
    userId,
    guildId,
    joinedAt:
      Date.now(),
    wins:
      Number(user.wins || 0),
    losses:
      Number(user.losses || 0),
  };
}

function findUserInAnyQueue(
  guildId,
  userId
) {
  for (const key of Object.keys(
    db.queues
  )) {
    if (
      !key.startsWith(
        `${guildId}|`
      )
    ) {
      continue;
    }

    const queue =
      db.queues[key];

    if (!Array.isArray(queue)) {
      continue;
    }

    const index =
      queue.findIndex(
        (entry) =>
          entry.userId === userId
      );

    if (index !== -1) {
      return {
        key,
        queue,
        index,
      };
    }
  }

  return null;
}

function removeUserFromAllQueues(
  guildId,
  userId
) {
  let removed = false;

  for (const key of Object.keys(
    db.queues
  )) {
    if (
      !key.startsWith(
        `${guildId}|`
      )
    ) {
      continue;
    }

    const queue =
      db.queues[key];

    if (!Array.isArray(queue)) {
      continue;
    }

    const filtered =
      queue.filter(
        (entry) =>
          entry.userId !== userId
      );

    if (
      filtered.length !==
      queue.length
    ) {
      db.queues[key] =
        filtered;
      removed = true;
    }
  }

  if (removed) {
    saveDatabase();
  }

  return removed;
}

function parseQueueKey(
  key
) {
  const parts =
    String(key).split("|");

  return {
    guildId:
      parts[0] || null,
    format:
      parts[1] || null,
    mode:
      parts[2] || null,
    value:
      Number(parts[3]),
    type:
      parts[4] || "normal",
  };
}

function queueLabel(
  format,
  mode,
  value,
  type = "normal"
) {
  const typeLabel =
    type === "infinite"
      ? "Infinito"
      : "Normal";

  return [
    format,
    String(mode)
      .charAt(0)
      .toUpperCase() +
      String(mode).slice(1),
    formatMoney(value),
    typeLabel,
  ].join(" • ");
}

function getQueueDisplay(
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

  if (!queue.length) {
    return "Nenhum jogador na fila.";
  }

  return queue
    .map(
      (entry, index) =>
        `${index + 1}. <@${entry.userId}>`
    )
    .join("\n");
}

function getQueueMessage(
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
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

  return config.queueMessages[
    key
  ] || null;
}

function setQueueMessage(
  guildId,
  format,
  mode,
  value,
  messageId,
  channelId,
  type = "normal"
) {
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
    messageId,
    channelId,
  };

  saveDatabase();
}

function deleteQueueMessageData(
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
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

  delete config.queueMessages[
    key
  ];

  saveDatabase();
}

/*
 * Cria uma nova partida
 * quando a fila atinge o número
 * necessário de jogadores.
 */
function createMatchFromQueue(
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

  const needed =
    requiredPlayers(format);

  if (queue.length < needed) {
    return null;
  }

  const players =
    queue.splice(
      0,
      needed
    );

  const matchId =
    generateId("match");

  const match = {
    id: matchId,
    guildId,
    format,
    mode,
    value: Number(value),
    type,
    players,
    createdAt:
      Date.now(),
    status: "waiting",
    mediatorId: null,
    winnerId: null,
    loserId: null,
  };

  if (!db.bets[matchId]) {
    db.bets[matchId] =
      match;
  }

  saveDatabase();

  return match;
}

/*
 * Divide os jogadores
 * em dois times.
 */
function splitTeams(
  players,
  format
) {
  const size =
    teamSize(format);

  return {
    teamA:
      players.slice(
        0,
        size
      ),
    teamB:
      players.slice(
        size,
        size * 2
      ),
  };
}

function mentionPlayers(
  players
) {
  if (
    !Array.isArray(players) ||
    !players.length
  ) {
    return "Nenhum jogador.";
  }

  return players
    .map(
      (player) =>
        `<@${player.userId}>`
    )
    .join(", ");
}

function matchDescription(
  match
) {
  const teams =
    splitTeams(
      match.players,
      match.format
    );

  return [
    `**Formato:** ${match.format}`,
    `**Modo:** ${match.mode}`,
    `**Valor:** ${formatMoney(
      match.value
    )}`,
    "",
    `**Time A:**`,
    mentionPlayers(
      teams.teamA
    ),
    "",
    `**Time B:**`,
    mentionPlayers(
      teams.teamB
    ),
  ].join("\n");
}

function createMatchEmbed(
  guildId,
  match
) {
  return createEmbed(
    guildId,
    `🎮 Partida ${match.format}`,
    matchDescription(
      match
    )
  )
    .addFields(
      {
        name: "Status",
        value:
          match.status ===
          "waiting"
            ? "Aguardando confirmação"
            : match.status,
        inline: true,
      },
      {
        name: "Valor",
        value:
          formatMoney(
            match.value
          ),
        inline: true,
      }
    );
}

function matchButtons(
  matchId
) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          `match_accept|${matchId}`
        )
        .setLabel(
          "Confirmar"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          `match_cancel|${matchId}`
        )
        .setLabel(
          "Cancelar"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    );
}

function backButton() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          "menu_back"
        )
        .setLabel(
          "Voltar"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    );
}```js
        .setCustomId(
          "select_analyst_role"
        )
        .setPlaceholder(
          "Selecione o cargo Analista"
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),
  ];
}

function channelConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "select_mobile_channel"
        )
        .setPlaceholder(
          "Selecione o canal do .ssmob"
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
          "select_emulator_channel"
        )
        .setPlaceholder(
          "Selecione o canal do .ssemu"
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
  ];
}

function mediatorConfigEmbed(
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

  return createEmbed(
    guildId,
    "🛡️ CONFIGURAÇÃO DE MEDIADORES",
    `Cargo de mediador: ${
      config.mediatorRoleId
        ? `<@&${config.mediatorRoleId}>`
        : "Não configurado"
    }\n\n` +
      `**Mediadores atualmente na fila:** ${queue.length}`
  );
}

function mediatorConfigButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "mediator_publish_queue"
        )
        .setLabel(
          "Publicar fila"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "mediator_clear_queue"
        )
        .setLabel(
          "Limpar fila"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    ),

    backButton(),
  ];
}

function pixConfigEmbed(
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

  const mentions =
    admins.length
      ? admins
          .map(
            (id) =>
              `<@${id}>`
          )
          .join(", ")
      : "Nenhum administrador configurado.";

  return createEmbed(
    guildId,
    "💳 CONFIGURAÇÃO DO PIX",
    `Administradores responsáveis pelo Pix:\n\n${mentions}`
  );
}

function pixConfigButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "pix_add_admin"
        )
        .setLabel(
          "Adicionar ADM"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "pix_remove_admin"
        )
        .setLabel(
          "Remover ADM"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    ),

    backButton(),
  ];
}

function appearanceConfigEmbed(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  return createEmbed(
    guildId,
    "🎨 APARÊNCIA",
    `**Cor atual:** \`${config.embedColor}\`\n\n` +
      `**Avatar do bot:** ${
        config.botAvatar
          ? "Configurado"
          : "Padrão"
      }`
  );
}

function appearanceConfigButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "appearance_color"
        )
        .setLabel(
          "Alterar cor"
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
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    backButton(),
  ];
}

function feeConfigEmbed(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  return createEmbed(
    guildId,
    "💸 CONFIGURAÇÃO DA TAXA",
    `Taxa atual do ADM: **${formatMoney(
      config.admFee
    )}**`
  );
}

function feeConfigButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "fee_change"
        )
        .setLabel(
          "Alterar taxa"
        )
        .setStyle(
          ButtonStyle.Primary
        )
    ),

    backButton(),
  ];
}

function betsConfigEmbed(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  return createEmbed(
    guildId,
    "🎲 CONFIGURAÇÃO DAS APOSTAS",
    `Categoria das apostas: ${
      config.betsCategoryId
        ? `<#${config.betsCategoryId}>`
        : "Não configurada"
    }\n\n` +
      `Taxa do ADM: **${formatMoney(
        config.admFee
      )}**`
  );
}

function betsConfigButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "bets_refresh"
        )
        .setLabel(
          "Atualizar"
        )
        .setStyle(
          ButtonStyle.Primary
        )
    ),

    backButton(),
  ];
}

function queueConfigEmbed(
  guildId
) {
  return createEmbed(
    guildId,
    "🎰 CONFIGURAÇÃO DAS FILAS",
    "Escolha abaixo o formato e a modalidade para publicar as filas."
  );
}

function queueConfigComponents() {
  return [
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
              description:
                `Fila ${format}`,
            })
          )
        )
    ),

    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          "fila_mode"
        )
        .setPlaceholder(
          "Selecione a modalidade"
        )
        .addOptions(
          MODES.map(
            (mode) => ({
              label:
                mode ===
                "emulador"
                  ? "Emulador"
                  : mode ===
                    "mobile"
                  ? "Mobile"
                  : "Misto",
              value: mode,
            })
          )
        )
    ),

    backButton(),
  ];
}
```
```js
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

    setQueueMessage(
      guildId,
      format,
      mode,
      value,
      message.id,
      channel.id,
      type
    );

    return message;
  } catch (error) {
    console.error(
      "Erro ao registrar mensagem da fila:",
      error
    );

    return null;
  }
}

async function getConfiguredQueueChannel(
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

  try {
    const channel =
      await guild.channels.fetch(
        config.mediatorQueueChannelId
      );

    if (
      !channel ||
      channel.type !==
        ChannelType.GuildText
    ) {
      return null;
    }

    return channel;
  } catch (error) {
    console.error(
      "Erro ao buscar canal das filas:",
      error
    );

    return null;
  }
}

async function publishQueues(
  guild,
  format,
  mode,
  type = "normal"
) {
  const channel =
    await getConfiguredQueueChannel(
      guild
    );

  if (!channel) {
    return {
      success: false,
      message:
        "O canal das filas não está configurado.",
    };
  }

  const published = [];

  for (
    const value of VALUES
  ) {
    const existing =
      getQueueMessage(
        guild.id,
        format,
        mode,
        value,
        type
      );

    if (existing) {
      try {
        const oldChannel =
          await guild.channels.fetch(
            existing.channelId
          );

        if (oldChannel) {
          const oldMessage =
            await oldChannel.messages.fetch(
              existing.messageId
            );

          if (oldMessage) {
            await oldMessage.edit({
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
            });

            published.push(
              value
            );

            continue;
          }
        }
      } catch {
        deleteQueueMessageData(
          guild.id,
          format,
          mode,
          value,
          type
        );
      }
    }

    const message =
      await registerQueueMessage(
        channel,
        guild.id,
        format,
        mode,
        value,
        type
      );

    if (message) {
      published.push(
        value
      );
    }
  }

  return {
    success: true,
    published,
  };
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
    return {
      success: false,
      message:
        "Configure primeiro o canal da fila de mediadores.",
    };
  }

  try {
    const channel =
      await guild.channels.fetch(
        config.mediatorQueueChannelId
      );

    if (!channel) {
      return {
        success: false,
        message:
          "Canal da fila de mediadores não encontrado.",
      };
    }

    let message = null;

    if (
      config.mediatorQueueMessageId
    ) {
      try {
        message =
          await channel.messages.fetch(
            config.mediatorQueueMessageId
          );
      } catch {
        message = null;
      }
    }

    if (message) {
      await message.edit({
        embeds: [
          mediatorQueueEmbed(
            guild.id
          ),
        ],
        components:
          mediatorQueueButtons(),
      });
    } else {
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
    }

    return {
      success: true,
      message,
    };
  } catch (error) {
    console.error(
      "Erro ao publicar fila de mediadores:",
      error
    );

    return {
      success: false,
      message:
        "Não foi possível publicar a fila de mediadores.",
    };
  }
}

async function updateAllQueueMessages(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  if (
    !config.queueMessages ||
    typeof config.queueMessages !==
      "object"
  ) {
    return;
  }

  for (
    const key of Object.keys(
      config.queueMessages
    )
  ) {
    const data =
      config.queueMessages[
        key
      ];

    if (
      !data ||
      !data.messageId ||
      !data.channelId
    ) {
      continue;
    }

    try {
      const channel =
        await client.channels.fetch(
          data.channelId
        );

      if (!channel) {
        continue;
      }

      const message =
        await channel.messages.fetch(
          data.messageId
        );

      if (!message) {
        continue;
      }

      await refreshQueueMessage(
        message
      );
    } catch (error) {
      console.error(
        "Erro ao atualizar fila:",
        error
      );
    }
  }
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
    config.mediatorQueue =
      [];
  }

  return config.mediatorQueue;
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

  if (index === -1) {
    return false;
  }

  queue.splice(
    index,
    1
  );

  saveDatabase();

  return true;
}

function clearMediatorQueue(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  config.mediatorQueue =
    [];

  config.mediatorRotationIndex =
    0;

  saveDatabase();
}

function getNextMediator(
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

  if (!queue.length) {
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

  if (
    config.mediatorRotationIndex >=
    queue.length
  ) {
    config.mediatorRotationIndex =
      0;
  }

  const mediatorId =
    queue[
      config.mediatorRotationIndex
    ];

  config.mediatorRotationIndex =
    (
      config.mediatorRotationIndex +
      1
    ) %
    queue.length;

  saveDatabase();

  return mediatorId;
}
```
```js
function createPixListEmbed(
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

  if (!admins.length) {
    return createEmbed(
      guildId,
      "💳 ADM'S DO PIX",
      "Nenhum ADM cadastrado."
    );
  }

  const list =
    admins
      .map(
        (adminId, index) =>
          `**${index + 1}.** <@${adminId}>`
      )
      .join("\n");

  return createEmbed(
    guildId,
    "💳 ADM'S DO PIX",
    list
  );
}

function findPixAdmin(
  guildId,
  userId
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

  return admins.includes(
    userId
  );
}

function addPixAdmin(
  guildId,
  userId
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
    config.pixAdmins = [];
  }

  if (
    config.pixAdmins.includes(
      userId
    )
  ) {
    return false;
  }

  config.pixAdmins.push(
    userId
  );

  saveDatabase();

  return true;
}

function removePixAdmin(
  guildId,
  userId
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
    return false;
  }

  const index =
    config.pixAdmins.indexOf(
      userId
    );

  if (index === -1) {
    return false;
  }

  config.pixAdmins.splice(
    index,
    1
  );

  saveDatabase();

  return true;
}

function validateImageUrl(
  value
) {
  try {
    const url =
      new URL(
        String(value).trim()
      );

    return (
      url.protocol ===
        "http:" ||
      url.protocol ===
        "https:"
    );
  } catch {
    return false;
  }
}

function updateBotAvatar(
  guildId,
  url
) {
  const config =
    getGuildConfig(
      guildId
    );

  if (
    !validateImageUrl(url)
  ) {
    return false;
  }

  config.botAvatar =
    String(url).trim();

  saveDatabase();

  return true;
}

function updateEmbedColor(
  guildId,
  color
) {
  const normalized =
    normalizeColor(
      color
    );

  if (
    normalized ===
      "#000000" &&
    String(color)
      .trim()
      .toLowerCase() !==
      "#000000"
  ) {
    return false;
  }

  const config =
    getGuildConfig(
      guildId
    );

  config.embedColor =
    normalized;

  saveDatabase();

  return true;
}

function setAdmFee(
  guildId,
  value
) {
  const numeric =
    Number(value);

  if (
    !Number.isFinite(
      numeric
    ) ||
    numeric < 0
  ) {
    return false;
  }

  const config =
    getGuildConfig(
      guildId
    );

  config.admFee =
    numeric;

  saveDatabase();

  return true;
}

function getMatch(
  matchId
) {
  return db.bets[
    matchId
  ] || null;
}

function saveMatch(
  match
) {
  if (!match?.id) {
    return false;
  }

  db.bets[
    match.id
  ] = match;

  saveDatabase();

  return true;
}

function matchHasPlayer(
  match,
  userId
) {
  return Boolean(
    match?.players?.some(
      (player) =>
        player.userId ===
        userId
    )
  );
}

function allPlayersConfirmed(
  match
) {
  if (
    !match ||
    !Array.isArray(
      match.players
    ) ||
    !match.players.length
  ) {
    return false;
  }

  return match.players.every(
    (player) =>
      player.confirmed ===
      true
  );
}

function confirmMatchPlayer(
  match,
  userId
) {
  if (
    !matchHasPlayer(
      match,
      userId
    )
  ) {
    return false;
  }

  const player =
    match.players.find(
      (entry) =>
        entry.userId ===
        userId
    );

  if (!player) {
    return false;
  }

  player.confirmed =
    true;

  return true;
}

function cancelMatch(
  match,
  userId
) {
  if (
    !matchHasPlayer(
      match,
      userId
    )
  ) {
    return false;
  }

  match.status =
    "cancelled";

  match.cancelledBy =
    userId;

  match.cancelledAt =
    Date.now();

  saveMatch(
    match
  );

  return true;
}

function calculateMatchTotal(
  match
) {
  if (!match) {
    return 0;
  }

  const players =
    Array.isArray(
      match.players
    )
      ? match.players.length
      : requiredPlayers(
          match.format
        );

  return (
    Number(match.value || 0) *
    players
  );
}

function calculateAdmFee(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  return Number(
    config.admFee || 0
  );
}

function calculatePrize(
  guildId,
  match
) {
  const total =
    calculateMatchTotal(
      match
    );

  const fee =
    calculateAdmFee(
      guildId
    );

  return Math.max(
    0,
    total - fee
  );
}

function addUserWin(
  userId
) {
  const user =
    getUserData(
      userId
    );

  user.wins =
    Number(
      user.wins || 0
    ) + 1;

  saveDatabase();
}

function addUserLoss(
  userId
) {
  const user =
    getUserData(
      userId
    );

  user.losses =
    Number(
      user.losses || 0
    ) + 1;

  saveDatabase();
}

function finishMatch(
  guildId,
  match,
  winnerIds = [],
  loserIds = []
) {
  if (!match) {
    return false;
  }

  match.status =
    "finished";

  match.finishedAt =
    Date.now();

  match.winnerIds =
    Array.isArray(
      winnerIds
    )
      ? winnerIds
      : [];

  match.loserIds =
    Array.isArray(
      loserIds
    )
      ? loserIds
      : [];

  for (
    const userId of
      match.winnerIds
  ) {
    addUserWin(
      userId
    );
  }

  for (
    const userId of
      match.loserIds
  ) {
    addUserLoss(
      userId
    );
  }

  match.prize =
    calculatePrize(
      guildId,
      match
    );

  saveMatch(
    match
  );

  return true;
}
```
```js
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

  if (format === "1x1") {
    const queue =
      getQueue(
        guild.id,
        format,
        mode,
        value
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

  const playerIds =
    Array.isArray(players)
      ? players
      : [];

  const mediatorId =
    getNextMediator(
      guild.id
    );

  const overwrites = [
    {
      id:
        guild.roles.everyone.id,
      deny: [
        PermissionsBitField.Flags.ViewChannel,
      ],
    },
  ];

  for (
    const userId of playerIds
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
        PermissionsBitField.Flags.ManageMessages,
      ],
    });
  }

  const channel =
    await guild.channels.create({
      name:
        `aposta-${format}-${value}`,
      type:
        ChannelType.GuildText,
      parent:
        category.id,
      permissionOverwrites:
        overwrites,
    });

  const matchId =
    generateId(
      "bet"
    );

  const bet = {
    id: matchId,
    guildId:
      guild.id,
    channelId:
      channel.id,
    format,
    mode,
    value:
      Number(value),
    type,
    players:
      playerIds.map(
        (userId) => ({
          userId,
          confirmed:
            false,
        })
      ),
    mediatorId:
      mediatorId || null,
    status:
      "waiting",
    createdAt:
      Date.now(),
  };

  const embed =
    createEmbed(
      guild.id,
      `🎮 NOVA APOSTA — ${format}`,
      [
        `**Modalidade:** ${modeLabel(
          mode
        )}`,
        `**Valor:** ${formatMoney(
          value
        )}`,
        `**Tipo:** ${type}`,
        "",
        `**Jogadores:**`,
        playerIds
          .map(
            (id) =>
              `<@${id}>`
          )
          .join("\n"),
        "",
        mediatorId
          ? `🛡️ **Mediador:** <@${mediatorId}>`
          : "⚠️ **Mediador:** Nenhum disponível.",
        "",
        "Todos os jogadores devem confirmar a partida.",
      ].join("\n")
    );

  await channel.send({
    embeds: [
      embed,
    ],
    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              `bet_confirm|${matchId}`
            )
            .setLabel(
              "Confirmar"
            )
            .setStyle(
              ButtonStyle.Success
            ),

          new ButtonBuilder()
            .setCustomId(
              `bet_cancel|${matchId}`
            )
            .setLabel(
              "Cancelar"
            )
            .setStyle(
              ButtonStyle.Danger
            )
        ),
    ],
  });

  return bet;
}
```
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
  }    );
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

  const categoryId =
    config.betCategoryId;

  if (!categoryId) {
    throw new Error(
      "Categoria de apostas não configurada."
    );
  }

  const category =
    await guild.channels.fetch(
      categoryId
    );

  if (!category) {
    throw new Error(
      "Categoria de apostas não encontrada."
    );
  }

  const channelName =
    `bet-${format}-${value}-${generateId()}`;

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
    const playerId of players
  ) {
    overwrites.push({
      id: playerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
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
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const channel =
    await guild.channels.create({
      name: channelName,
      type:
        ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites:
        overwrites,
    });

  const bet = {
    id: channel.id,
    channelId: channel.id,
    guildId: guild.id,
    format,
    mode,
    value,
    type,
    players: [...players],
    status: "waiting",
    createdAt:
      Date.now(),
  };

  const embed =
    createEmbed(
      guild.id,
      "🎮 APOSTA CRIADA",
      [
        `**Formato:** ${format}`,
        `**Modo:** ${mode}`,
        `**Valor:** ${formatMoney(
          value
        )}`,
        `**Tipo:** ${
          type === "ice_infinite"
            ? "♾️ Gelo Infinito"
            : "🧊 Gelo Normal"
        }`,
        "",
        "**Jogadores:**",
        players
          .map(
            (id) =>
              `• <@${id}>`
          )
          .join("\n"),
      ].join("\n")
    );

  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `bet_accept|${channel.id}`
        )
        .setLabel(
          "Aceitar aposta"
        )
        .setStyle(
          ButtonStyle.Success
        ),
      new ButtonBuilder()
        .setCustomId(
          `bet_cancel|${channel.id}`
        )
        .setLabel(
          "Cancelar"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    ),
  ];

  await channel.send({
    content:
      players
        .map(
          (id) =>
            `<@${id}>`
        )
        .join(" "),
    embeds: [
      embed,
    ],
    components,
  });

  return bet;
}

async function refreshQueueMessage(
  message
) {
  if (!message) {
    return;
  }

  try {
    const guild =
      message.guild;

    if (!guild) {
      return;
    }

    const config =
      getGuildConfig(
        guild.id
      );

    const entry =
      Object.entries(
        config.queueMessages || {}
      ).find(
        ([, messageId]) =>
          messageId ===
          message.id
      );

    if (!entry) {
      return;
    }

    const key =
      entry[0];

    const parts =
      key.split("|");

    if (
      parts.length < 4
    ) {
      return;
    }

    const format =
      parts[1];

    const mode =
      parts[2];

    const value =
      Number(parts[3]);

    const queue =
      getQueue(
        guild.id,
        format,
        mode,
        value
      );

    const embed =
      queueEmbed(
        guild,
        format,
        mode,
        value,
        queue
      );

    const components =
      queueComponents(
        format,
        mode,
        value
      );

    await message.edit({
      embeds: [
        embed,
      ],
      components,
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar mensagem da fila:",
      error
    );
  }
}

async function handleQueueButton(
  interaction
) {
  const parts =
    interaction.customId.split(
      "|"
    );

  const action =
    parts[0];

  const format =
    parts[1];

  const mode =
    parts[2];

  const value =
    Number(parts[3]);

  const type =
    parts[4] ||
    "normal";

  if (
    action === "queue_join"
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
    action === "queue_leave"
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
}async function handleChannelSelect(
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
}  if (
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
    id === "publish_mediator_queue"
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
            "✅ Fila de mediadores publicada/atualizada com sucesso.",
          ephemeral: true,
        }
      );
    } catch (error) {
      console.error(
        "Erro ao publicar fila de mediadores:",
        error
      );

      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Não foi possível publicar a fila de mediadores.",
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

    return;
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
}      name:
        channelName,
      type:
        ChannelType.GuildText,
      parent:
        category.id,
      permissionOverwrites:
        overwrites,
    });

  return channel;
}

async function createBetMessage(
  channel,
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

  const playerList =
    players
      .map(
        (id) =>
          `<@${id}>`
      )
      .join("\n");

  const embed =
    createEmbed(
      guild.id,
      "🎮 APOSTA",
      [
        `**Formato:** ${format}`,
        `**Modo:** ${mode}`,
        `**Valor:** ${formatMoney(
          value
        )}`,
        `**Tipo:** ${
          type === "ice_infinite"
            ? "♾️ Gelo Infinito"
            : "🧊 Gelo Normal"
        }`,
        "",
        "**Jogadores:**",
        playerList,
        "",
        "Aguardando confirmação dos jogadores.",
      ].join("\n")
    );

  const row =
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `bet_confirm|${channel.id}`
        )
        .setLabel(
          "Confirmar"
        )
        .setStyle(
          ButtonStyle.Success
        ),
      new ButtonBuilder()
        .setCustomId(
          `bet_cancel|${channel.id}`
        )
        .setLabel(
          "Cancelar"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    );

  return channel.send({
    embeds: [
      embed,
    ],
    components: [
      row,
    ],
  });
}

async function closeBetChannel(
  channel,
  reason = "Aposta encerrada."
) {
  if (!channel) {
    return;
  }

  try {
    await channel.send({
      embeds: [
        createEmbed(
          channel.guild.id,
          "🔒 APOSTA ENCERRADA",
          reason
        ),
      ],
    });

    setTimeout(
      async () => {
        try {
          await channel.delete(
            "Aposta encerrada"
          );
        } catch (
          error
        ) {
          console.error(
            "Erro ao excluir canal da aposta:",
            error
          );
        }
      },
      5000
    );
  } catch (
    error
  ) {
    console.error(
      "Erro ao encerrar aposta:",
      error
    );
  }
}

async function handleBetButton(
  interaction
) {
  const parts =
    interaction.customId.split(
      "|"
    );

  const action =
    parts[0];

  const channelId =
    parts[1];

  if (
    !channelId
  ) {
    return;
  }

  const channel =
    interaction.guild.channels.cache.get(
      channelId
    );

  if (!channel) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Canal da aposta não encontrado.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    action === "bet_cancel"
  ) {
    const member =
      interaction.member;

    if (
      !isAdministrator(
        member
      ) &&
      !hasMediatorRole(
        member,
        interaction.guild.id
      ) &&
      !channel.permissionOverwrites.cache.has(
        interaction.user.id
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Você não pode cancelar esta aposta.",
          ephemeral: true,
        }
      );

      return;
    }

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Aposta cancelada.",
        ephemeral: true,
      }
    );

    await closeBetChannel(
      channel,
      `A aposta foi cancelada por <@${interaction.user.id}>.`
    );

    return;
  }

  if (
    action === "bet_confirm"
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Sua aposta foi confirmada.",
        ephemeral: true,
      }
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
    id.startsWith(
      "fila_format|"
    )
  ) {
    const format =
      id.split("|")[1];

    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem publicar filas.",
          ephemeral: true,
        }
      );

      return;
    }

    await interaction.update({
      embeds: [
        createEmbed(
          interaction.guild.id,
          "🎮 MODO DA FILA",
          `Formato selecionado: **${format}**\n\nEscolha o modo que deseja publicar.`
        ),
      ],
      components: [
        filaModeComponents(
          format
        ),
      ],
    });

    return;
  }

  if (
    id.startsWith(
      "fila_mode|"
    )
  ) {
    const [
      ,
      format,
      mode,
    ] =
      id.split("|");

    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Apenas administradores podem publicar filas.",
          ephemeral: true,
        }
      );

      return;
    }

    try {
      await publishQueues(
        interaction.guild,
        format,
        mode
      );

      await sendSafeReply(
        interaction,
        {
          content:
            `✅ Filas **${format}** no modo **${mode}** publicadas com sucesso.`,
          ephemeral: true,
        }
      );
    } catch (
      error
    ) {
      console.error(
        "Erro ao publicar filas:",
        error
      );

      await sendSafeReply(
        interaction,
        {
          content:
            `❌ Erro ao publicar as filas: ${error.message}`,
          ephemeral: true,
        }
      );
    }

    return;
  }

  if (
    id.startsWith(
      "queue_"
    )
  ) {
    await handleQueueButton(
      interaction
    );

    return;
  }

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

  if (
    id.startsWith(
      "mediator_queue_"
    )
  ) {
    await handleMediatorQueueButton(
      interaction
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
      "pix_"
    ) ||
    id === "publish_mediator_queue"
  ) {
    await handleConfigButton(
      interaction
    );

    return;
  }

  if (
    id.startsWith(
      "select_"
    )
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
  }
}async function handleBetCancel(
  interaction
) {
  const parts =
    interaction.customId.split("|");

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

  const canCancel =
    bet.players.includes(
      interaction.user.id
    ) ||
    isAdministrator(
      interaction.member
    ) ||
    hasMediatorRole(
      interaction.member,
      interaction.guild.id
    );

  if (!canCancel) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não pode cancelar essa aposta.",
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
    "finished";

  saveDatabase();

  await refreshBetMessage(
    interaction.guild,
    bet
  );

  try {
    const channel =
      await interaction.guild.channels.fetch(
        bet.channelId
      );

    if (channel) {
      await channel.send({
        content:
          `❌ Aposta cancelada por <@${interaction.user.id}>.`,
      });
    }
  } catch (error) {
    console.error(
      "Erro ao enviar cancelamento:",
      error
    );
  }

  await sendSafeReply(
    interaction,
    {
      content:
        "✅ Aposta cancelada.",
      ephemeral: true,
    }
  );
}

async function handleBetWinner(
  interaction
) {
  const parts =
    interaction.customId.split("|");

  const betId =
    parts[1];

  const winnerId =
    parts[2];

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
    (
      bet.mediatorId ===
      interaction.user.id
    );

  if (!allowed) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores ou mediadores podem definir o vencedor.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    !bet.players.includes(
      winnerId
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Jogador inválido.",
        ephemeral: true,
      }
    );

    return;
  }

  bet.winnerId =
    winnerId;

  bet.status =
    "finished";

  saveDatabase();

  await refreshBetMessage(
    interaction.guild,
    bet
  );

  try {
    const channel =
      await interaction.guild.channels.fetch(
        bet.channelId
      );

    if (channel) {
      await channel.send({
        content:
          `🏆 Vencedor definido: <@${winnerId}>`,
      });
    }
  } catch (error) {
    console.error(
      "Erro ao anunciar vencedor:",
      error
    );
  }

  await sendSafeReply(
    interaction,
    {
      content:
        "✅ Vencedor registrado com sucesso.",
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
      const id =
        interaction.customId;

      if (
        id.startsWith(
          "queue_join|"
        )
      ) {
        await joinQueue(
          interaction
        );
        return;
      }

      if (
        id.startsWith(
          "queue_leave|"
        )
      ) {
        await leaveQueue(
          interaction
        );
        return;
      }

      if (
        id.startsWith(
          "config_"
        )
      ) {
        await handleConfigButton(
          interaction
        );
        return;
      }

      if (
        id.startsWith(
          "mediator_"
        )
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
          "bet_winner|"
        )
      ) {
        await handleBetWinner(
          interaction
        );
        return;
      }

      if (
        id === "back"
      ) {
        await interaction.update({
          embeds: [
            configMainEmbed(
              interaction.guild
            ),
          ],
          components:
            configButtons(),
        });

        return;
      }
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
  } catch (error) {
    console.error(
      "Erro ao processar interação:",
      error
    );

    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Ocorreu um erro ao processar essa ação.",
        ephemeral: true,
      }
    );
  }
}  client.once(
    "ready",
    async () => {
      console.log(
        `✅ Bot conectado como ${client.user.tag}`
      );

      console.log(
        `📡 Servindo ${client.guilds.cache.size} servidor(es).`
      );

      for (const guild of client.guilds.cache.values()) {
        try {
          getGuildConfig(guild.id);

          console.log(
            `🔄 Inicializando servidor: ${guild.name}`
          );
        } catch (error) {
          console.error(
            `❌ Erro ao inicializar ${guild.name}:`,
            error
          );
        }
      }
    }
  );

  client.on(
    "messageCreate",
    async (message) => {
      if (message.author.bot) return;

      try {
        await handleCommand(
          message
        );
      } catch (error) {
        console.error(
          "Erro ao processar comando:",
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
      } catch (error) {
        console.error(
          "Erro na interação:",
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

  if (!TOKEN) {
    console.error(
      "❌ TOKEN não encontrado no arquivo .env"
    );

    process.exit(1);
  }

  client.login(
    TOKEN
  );
