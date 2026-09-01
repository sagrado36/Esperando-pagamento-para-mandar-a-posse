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

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_DB = {
  guilds: {},
  users: {},
  queues: {},
  bets: {},
  analyses: {},
};

function cloneDefaultDB() {
  return JSON.parse(JSON.stringify(DEFAULT_DB));
}

let db = loadDatabase();

function loadDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return cloneDefaultDB();
    }

    const raw = fs.readFileSync(DB_FILE, "utf8");

    if (!raw.trim()) {
      return cloneDefaultDB();
    }

    const parsed = JSON.parse(raw);

    return {
      ...cloneDefaultDB(),
      ...parsed,
      guilds: parsed.guilds || {},
      users: parsed.users || {},
      queues: parsed.queues || {},
      bets: parsed.bets || {},
      analyses: parsed.analyses || {},
    };
  } catch (error) {
    console.error("Erro ao carregar database:", error);
    return cloneDefaultDB();
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(db, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Erro ao salvar database:", error);
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

function getGuildConfig(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      mediatorRoleId: null,
      analystRoleId: null,

      analysisChannelMobile: null,
      analysisChannelEmulator: null,

      betsCategoryId: null,

      mediatorQueueChannelId: null,

      embedColor: "#000000",
      botAvatar: null,

      admFee: 1,

      pixAdmins: [],

      mediatorQueue: [],
      mediatorRotationIndex: 0,

      queueMessages: {},
    };

    saveDatabase();
  }

  const config = db.guilds[guildId];

  if (!Array.isArray(config.pixAdmins)) {
    config.pixAdmins = [];
  }

  if (!Array.isArray(config.mediatorQueue)) {
    config.mediatorQueue = [];
  }

  if (!config.embedColor) {
    config.embedColor = "#000000";
  }

  if (!Number.isFinite(Number(config.admFee))) {
    config.admFee = 1;
  }

  return config;
}

function getUserData(userId) {
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

function generateId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function formatMoney(cents) {
  return `R$ ${(Number(cents) / 100)
    .toFixed(2)
    .replace(".", ",")}`;
}

function normalizeColor(color) {
  if (!color) {
    return "#000000";
  }

  const value = String(color).trim();

  if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
    return value;
  }

  if (/^[0-9A-Fa-f]{6}$/.test(value)) {
    return `#${value}`;
  }

  return "#000000";
}

function createEmbed(
  guildId,
  title,
  description
) {
  const config = getGuildConfig(guildId);

  return new EmbedBuilder()
    .setColor(
      normalizeColor(config.embedColor)
    )
    .setTitle(title)
    .setDescription(description)
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

function isAdministrator(member) {
  return Boolean(
    member &&
      member.permissions &&
      member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
  );
}

function hasMediatorRole(
  member,
  guildId
) {
  const config = getGuildConfig(guildId);

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
  const config = getGuildConfig(guildId);

  if (!config.analystRoleId) {
    return false;
  }

  return Boolean(
    member?.roles?.cache?.has(
      config.analystRoleId
    )
  );
}

function teamSize(format) {
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

function requiredPlayers(format) {
  return teamSize(format) * 2;
}

function makeQueueKey(
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
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
  const key = makeQueueKey(
    guildId,
    format,
    mode,
    value,
    type
  );

  if (!Array.isArray(db.queues[key])) {
    db.queues[key] = [];
  }

  return db.queues[key];
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
  const queue = getQueue(
    guildId,
    format,
    mode,
    value,
    type
  );

  const players =
    queue.length > 0
      ? queue
          .map(
            (id, index) =>
              `**${index + 1}.** <@${id}>`
          )
          .join("\n")
      : "Nenhum jogador na fila.";

  let title = `🎰 FILA ${format}`;

  if (format === "1x1") {
    if (type === "ice_infinite") {
      title += " ♾️ GELO INFINITO";
    } else {
      title += " 🧊 GELO NORMAL";
    }
  }

  return createEmbed(
    guildId,
    title,
    `📌 **Modalidade:** ${modeLabel(mode)}\n` +
      `💰 **Valor:** ${formatMoney(value)}\n\n` +
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
          .setLabel("🧊 Gelo Normal")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            `queue_join|${format}|${mode}|${value}|ice_infinite`
          )
          .setLabel("♾️ Gelo Infinito")
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            `queue_leave|${format}|${mode}|${value}|${type}`
          )
          .setLabel("🚪 Sair da Fila")
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
        .setLabel("➕ Entrar na Fila")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          `queue_leave|${format}|${mode}|${value}|normal`
        )
        .setLabel("🚪 Sair da Fila")
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
  return queue.includes(userId);
}

function mediatorQueueEmbed(
  guildId
) {
  const config =
    getGuildConfig(guildId);

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
        .setLabel("Entrar na fila")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "mediator_queue_leave"
        )
        .setLabel("Sair da fila")
        .setStyle(
          ButtonStyle.Danger
        )
    ),
  ];
}

function configMainEmbed(guild) {
  const config =
    getGuildConfig(guild.id);

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
        .setLabel("Cargos")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_pix"
        )
        .setLabel("Pix")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_channels"
        )
        .setLabel("Canais")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_bets"
        )
        .setLabel("Apostas")
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config_mediators"
        )
        .setLabel("Mediadores")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_appearance"
        )
        .setLabel("Aparência")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_fee"
        )
        .setLabel("Taxa")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_queue"
        )
        .setLabel("Filas")
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
      .setLabel("Voltar")
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
        .setLabel("Foto do bot")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "appearance_color"
        )
        .setLabel("Cor da embed")
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    backButton(),
  ];
}

function feeComponents() {
  const options = [];

  for (let i = 1; i <= 50; i++) {
    options.push({
      label: formatMoney(i),
      value: String(i),
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
        .addOptions(options)
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
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId("pix_list")
        .setLabel("Ver ADMs")
        .setStyle(
          ButtonStyle.Secondary
        )
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
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setMaxLength(100)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("pix_key")
          .setLabel("Chave Pix")
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setMaxLength(200)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("pix_qr")
          .setLabel("URL do QR Code")
          .setStyle(
            TextInputStyle.Short
          )
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
          .setStyle(
            TextInputStyle.Short
          )
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
          .setRequired(true)
          .setMaxLength(7)
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
}function getAvailableMediatorIds(guild) {
  const config = getGuildConfig(guild.id);

  const currentQueue = Array.isArray(
    config.mediatorQueue
  )
    ? config.mediatorQueue
    : [];

  const valid = [];

  for (const userId of currentQueue) {
    const member =
      guild.members.cache.get(userId);

    if (
      member &&
      !member.user.bot &&
      hasMediatorRole(
        member,
        guild.id
      )
    ) {
      valid.push(userId);
    }
  }

  config.mediatorQueue = valid;

  return valid;
}

async function refreshMediatorQueueMessage(
  guild
) {
  const config =
    getGuildConfig(guild.id);

  if (
    !config.mediatorQueueChannelId
  ) {
    return;
  }

  const channel =
    guild.channels.cache.get(
      config.mediatorQueueChannelId
    );

  if (
    !channel ||
    channel.type !== ChannelType.GuildText
  ) {
    return;
  }

  const messages =
    await channel.messages
      .fetch({ limit: 50 })
      .catch(() => null);

  if (!messages) {
    return;
  }

  const message =
    messages.find((m) =>
      m.author.id === client.user.id &&
      m.components.some((row) =>
        row.components.some(
          (component) =>
            component.customId ===
            "mediator_queue_join"
        )
      )
    );

  if (!message) {
    return;
  }

  await message
    .edit({
      embeds: [
        mediatorQueueEmbed(
          guild.id
        ),
      ],
      components:
        mediatorQueueButtons(),
    })
    .catch(() => {});
}

async function refreshQueueMessage(
  message
) {
  if (
    !message ||
    !message.components?.length
  ) {
    return;
  }

  const firstRow =
    message.components[0];

  const component =
    firstRow.components.find(
      (x) =>
        String(
          x.customId || ""
        ).startsWith(
          "queue_join|"
        )
    );

  if (!component) {
    return;
  }

  const parts =
    component.customId.split("|");

  if (parts.length < 5) {
    return;
  }

  const format = parts[1];
  const mode = parts[2];
  const value = Number(parts[3]);
  const type = parts[4];

  await message
    .edit({
      embeds: [
        queueEmbed(
          message.guildId,
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
    })
    .catch(() => {});
}

function getBetByChannel(
  channelId
) {
  return Object.values(
    db.bets
  ).find(
    (bet) =>
      bet.channelId === channelId &&
      !bet.finished &&
      !bet.cancelled
  );
}

function getBet(id) {
  return db.bets[id] || null;
}

function playerBelongsToBet(
  bet,
  userId
) {
  return (
    bet.player1 === userId ||
    bet.player2 === userId
  );
}

function mediatorBelongsToBet(
  bet,
  userId
) {
  return bet.mediator === userId;
}

async function sendPixData(
  channel,
  guildId,
  bet
) {
  const config =
    getGuildConfig(guildId);

  const adm =
    config.pixAdmins.length > 0
      ? config.pixAdmins[0]
      : null;

  if (!adm) {
    await channel.send({
      embeds: [
        createEmbed(
          guildId,
          "💳 PAGAMENTO",
          "Nenhum ADM com Pix foi cadastrado ainda.\n\nConfigure um ADM em `/conf` → **Pix**."
        ),
      ],
    });

    return;
  }

  const description =
    `**Nome:** ${adm.name}\n` +
    `**Chave Pix:** \`${adm.key}\`\n` +
    `**Valor da aposta por jogador:** ${formatMoney(
      bet.value
    )}\n` +
    `**Valor total:** ${formatMoney(
      bet.value * 2
    )}\n\n` +
    `Após o pagamento, aguarde a orientação do mediador.`;

  const paymentEmbed =
    createEmbed(
      guildId,
      "💳 PAGAMENTO DA APOSTA",
      description
    );

  if (adm.qr) {
    paymentEmbed.setImage(
      adm.qr
    );
  }

  await channel.send({
    embeds: [
      paymentEmbed,
    ],
  });
}

function confirmationButtons(
  betId
) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `bet_confirm|${betId}`
        )
        .setLabel("Confirmar")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          `bet_cancel|${betId}`
        )
        .setLabel("Cancelar")
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
    getGuildConfig(guild.id);

  if (!config.betsCategoryId) {
    throw new Error(
      "A categoria das apostas ainda não foi configurada."
    );
  }

  const category =
    guild.channels.cache.get(
      config.betsCategoryId
    );

  if (
    !category ||
    category.type !==
      ChannelType.GuildCategory
  ) {
    throw new Error(
      "A categoria das apostas configurada não existe mais."
    );
  }

  const mediatorIds =
    getAvailableMediatorIds(
      guild
    );

  if (!mediatorIds.length) {
    throw new Error(
      "Não há nenhum mediador na fila. A aposta não pode ser puxada."
    );
  }

  if (
    players.length !==
    requiredPlayers(format)
  ) {
    throw new Error(
      "Quantidade de jogadores inválida para este formato."
    );
  }

  let rotationIndex =
    Number(
      config.mediatorRotationIndex ||
        0
    );

  if (
    rotationIndex >=
    mediatorIds.length
  ) {
    rotationIndex = 0;
  }

  const mediator =
    mediatorIds[rotationIndex];

  config.mediatorRotationIndex =
    (rotationIndex + 1) %
    mediatorIds.length;

  const betId =
    generateId("bet");

  const overwrites = [
    {
      id:
        guild.roles.everyone.id,

      deny: [
        PermissionsBitField.Flags
          .ViewChannel,
      ],
    },
  ];

  const uniqueUsers = [
    ...new Set([
      ...players,
      mediator,
    ]),
  ];

  for (const userId of uniqueUsers) {
    overwrites.push({
      id: userId,

      allow: [
        PermissionsBitField.Flags
          .ViewChannel,

        PermissionsBitField.Flags
          .SendMessages,

        PermissionsBitField.Flags
          .ReadMessageHistory,

        PermissionsBitField.Flags
          .AttachFiles,

        PermissionsBitField.Flags
          .EmbedLinks,
      ],
    });
  }

  const channel =
    await guild.channels.create({
      name: `aposta-${betId.slice(
        -6
      )}`,

      type: ChannelType.GuildText,

      parent: category.id,

      permissionOverwrites:
        overwrites,
    });

  db.bets[betId] = {
    id: betId,

    guildId: guild.id,

    channelId: channel.id,

    format,

    mode,

    value: Number(value),

    players,

    player1: players[0],

    player2: players[1],

    mediator,

    confirmed: [],

    cancelled: false,

    finished: false,

    roomCreated: false,

    createdAt: Date.now(),

    admFee: config.admFee,
  };

  saveDatabase();

  const mentions = [
    ...new Set([
      ...players.map(
        (id) => `<@${id}>`
      ),

      `<@${mediator}>`,
    ]),
  ].join(" ");

  await channel.send({
    content: mentions,

    embeds: [
      createEmbed(
        guild.id,
        "🎲 CONFIRMAÇÃO DA APOSTA",

        `**Formato:** ${format}\n` +
          `**Modalidade:** ${modeLabel(
            mode
          )}\n` +
          `**Valor por jogador:** ${formatMoney(
            value
          )}\n\n` +
          `Os jogadores devem confirmar a aposta abaixo.\n\n` +
          `O mediador responsável é <@${mediator}>.`
      ),
    ],

    components:
      confirmationButtons(
        betId
      ),
  });

  await sendPixData(
    channel,
    guild.id,
    db.bets[betId]
  );

  return {
    channel,

    bet:
      db.bets[betId],
  };
}

async function joinQueue(
  interaction,
  format,
  mode,
  value,
  type
) {
  const guildId =
    interaction.guild.id;

  const queue =
    getQueue(
      guildId,
      format,
      mode,
      value,
      type
    );

  if (
    queueAlreadyContains(
      queue,
      interaction.user.id
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você já está nesta fila.",
        ephemeral: true,
      }
    );
  }

  if (queue.length >= 2) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta fila já está cheia.",
        ephemeral: true,
      }
    );
  }

  for (
    const key of Object.keys(
      db.queues
    )
  ) {
    if (
      Array.isArray(
        db.queues[key]
      )
    ) {
      db.queues[key] =
        db.queues[key].filter(
          id =>
            id !==
            interaction.user.id
        );
    }
  }

  queue.push(
    interaction.user.id
  );

  saveDatabase();

  await refreshQueueMessage(
    interaction.message
  );

  if (queue.length === 2) {
    const players = [
      ...queue
    ];

    queue.length = 0;

    saveDatabase();

    try {
      const result =
        await createPrivateBetChannel(
          interaction.guild,
          format,
          mode,
          Number(value),
          players
        );

      return sendSafeReply(
        interaction,
        {
          content:
            `🎰 Aposta criada em ${result.channel}.`,
          ephemeral: true,
        }
      );
    } catch (error) {
      console.error(
        "Erro ao criar aposta:",
        error
      );

      for (
        const id of players
      ) {
        queue.push(id);
      }

      saveDatabase();

      return sendSafeReply(
        interaction,
        {
          content:
            `❌ Não foi possível criar a aposta: ${error.message}`,
          ephemeral: true,
        }
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

  saveDatabase();

  return sendSafeReply(
    interaction,
    async function handleWO(
  interaction,
  bet
) {
  if (
    bet.finished ||
    bet.cancelled
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta aposta já foi finalizada ou cancelada.",
        ephemeral: true,
      }
    );
  }

  if (
    !mediatorBelongsToBet(
      bet,
      interaction.user.id
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não é o mediador responsável por esta aposta.",
        ephemeral: true,
      }
      
      }
    );
  }
      }
    );
  }
  }

  bet.finished = true;

  bet.wo = true;

  saveDatabase();

  return sendSafeReply(
    interaction,
    {
      embeds: [
        createEmbed(
          bet.guildId,
          "⚠️ VITÓRIA POR W.O.",
          "A aposta foi encerrada por W.O.\n\nNenhuma vitória ou derrota foi adicionada."
        ),
      ],
    }
  );
}

function mediatorMenu(
  betId
) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          `med_menu|${betId}`
        )
        .setPlaceholder(
          "🛡️ Escolha uma ação"
        )
        .addOptions(
          {
            label:
              "🏆 Escolher vencedor",

            value:
              "winner",

            description:
              "Escolher o vencedor da aposta.",
          },

          {
            label:
              "⚠️ Vitória por W.O.",

            value:
              "wo",

            description:
              "Encerrar por W.O.",
          },

          {
            label:
              "✅ Finalizar aposta",

            value:
              "finish",

            description:
              "Finalizar sem registrar resultado.",
          }
        )
    ),
  ];
}

function winnerButtons(
  betId,
  bet
) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `med_winner|${betId}|${bet.player1}`
        )
        .setLabel(
          "🏆 Jogador 1"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          `med_winner|${betId}|${bet.player2}`
        )
        .setLabel(
          "🏆 Jogador 2"
        )
        .setStyle(
          ButtonStyle.Success
        )
    ),
  ];
}

async function showRoomCredentials(
  interaction,
  bet
) {
  const description =
    `🆔 **ID da sala:** \`${bet.roomId || "Não informado"}\`\n` +
    `🔐 **Senha:** \`${bet.roomPassword || "Não informada"}\`\n\n` +
    `💰 **Premiação:** ${formatMoney(
      Number(bet.value) * 2
    )}`;

  const buttons = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `copy_room_id|${bet.id}`
        )
        .setLabel(
          "📋 Copiar ID"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          `copy_room_password|${bet.id}`
        )
        .setLabel(
          "🔑 Copiar senha"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),
  ];

  return sendSafeReply(
    interaction,
    {
      embeds: [
        createEmbed(
          bet.guildId,
          "🎮 SALA DA APOSTA",
          description
        ),
      ],

      components: buttons,
    }
  );
}

async function handleRoomCredentials(
  message,
  bet
) {
  const content =
    message.content.trim();

  const match =
    content.match(
      /(?:id|sala)\s*[:=-]?\s*(\d+)[\s\S]*?(?:senha|pass|password)\s*[:=-]?\s*(\S+)/i
    );

  if (!match) {
    return false;
  }

  const roomId =
    match[1];

  const password =
    match[2];

  bet.roomId =
    roomId;

  bet.roomPassword =
    password;

  bet.roomCreated =
    true;

  saveDatabase();

  const total =
    Number(bet.value) * 2;

  await message.channel.send({
    embeds: [
      createEmbed(
        bet.guildId,
        "🎮 SALA CRIADA",

        `🆔 **ID:** \`${roomId}\`\n` +
          `🔐 **Senha:** \`${password}\`\n\n` +
          `💰 **Premiação:** ${formatMoney(
            total
          )}`
      ),
    ],

    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `copy_room_id|${bet.id}`
          )
          .setLabel(
            "📋 Copiar ID"
          )
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            `copy_room_password|${bet.id}`
          )
          .setLabel(
            "🔑 Copiar senha"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
    ],
  });

  return true;
}

async function joinQueue(
  interaction,
  format,
  mode,
  value,
  type
) {
  const guildId =
    interaction.guild.id;

  const queue =
    getQueue(
      guildId,
      format,
      mode,
      value,
      type
    );

  if (
    queueAlreadyContains(
      queue,
      interaction.user.id
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você já está nesta fila.",

        ephemeral: true,
      }
    );
  }

  const needed =
    requiredPlayers(format);

  if (
    queue.length >= needed
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta fila já está cheia.",

        ephemeral: true,
      }
    );
  }

  for (
    const key of Object.keys(
      db.queues
    )
  ) {
    if (
      Array.isArray(
        db.queues[key]
      )
    ) {
      db.queues[key] =
        db.queues[key].filter(
          (id) =>
            id !==
            interaction.user.id
        );
    }
  }

  queue.push(
    interaction.user.id
  );

  saveDatabase();

  await refreshQueueMessage(
    interaction.message
  );

  if (
    queue.length >= needed
  ) {
    const players =
      [...queue];

    queue.length = 0;

    saveDatabase();

    try {
      const result =
        async function joinQueue(
  interaction,
  format,
  mode,
  value,
  type
) {
  const guildId =
    interaction.guild.id;

  const queue =
    getQueue(
      guildId,
      format,
      mode,
      value,
      async function handleCommand(
  message
) {
  const content =
    message.content.trim();

  if (!content.startsWith(PREFIX)) {
    return;
  }

  const args =
    content
      .slice(PREFIX.length)
      .trim()
      .split(/\s+/);

  const command =
    args.shift()?.toLowerCase();

  if (!command) {
    return;
  }

  if (command === "conf") {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    return message.channel.send({
      embeds: [
        configMainEmbed(
          message.guild
        ),
      ],
      components:
        configButtons(),
    });
  }

  if (
    command === "fila"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Apenas administradores podem criar painéis de fila."
      );
    }

    const format =
      args[0] || "1x1";

    const mode =
      args[1] || "mobile";

    const value =
      Number(args[2]) || 100;

    if (
      !FORMATS.includes(
        format
      )
    ) {
      return message.reply(
        "❌ Formato inválido."
      );
    }

    if (
      !MODES.includes(
        mode
      )
    ) {
      return message.reply(
        "❌ Modalidade inválida."
      );
    }

    if (
      !VALUES.includes(
        value
      )
    ) {
      return message.reply(
        "❌ Valor inválido."
      );
    }

    const type =
      format === "1x1"
        ? "normal"
        : "normal";

    return createQueueMessage(
      message.channel,
      message.guild.id,
      format,
      mode,
      value,
      type
    );
  }

  if (
    command === "medfila"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Apenas administradores podem criar a fila de mediadores."
      );
    }

    return message.channel.send({
      embeds: [
        mediatorQueueEmbed(
          message.guild.id
        ),
      ],
      components:
        mediatorQueueButtons(),
    });
  }
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
  type
) {
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

  if (index === -1) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não está nesta fila.",

        ephemeral: true,
      }
    );
  }

  queue.splice(
    index,
    1
  );

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
  async function handleConfigButton(interaction) {
  if (!isAdministrator(interaction.member)) {
    return interaction.reply({
      content: "❌ Apenas administradores.",
      ephemeral: true,
    });
  }

  const id = interaction.customId;

  if (id === "config_back") {
    return interaction.update({
      embeds: [
        configMainEmbed(interaction.guild),
      ],
      components: configButtons(),
    });
  }

  if (id === "config_roles") {
    return interaction.update({
      embeds: [
        createEmbed(
          interaction.guildId,
          "🎭 CARGOS",
          "Configure os cargos de **Mediador** e **Analista**."
        ),
      ],
      components: roleConfigComponents(),
    });
  }

  if (id === "config_pix") {
    return interaction.update({
      embeds: [
        createEmbed(
          interaction.guildId,
          "💳 PIX",
          "Cadastre e consulte os ADMs responsáveis pelos pagamentos."
        ),
      ],
      components: pixComponents(),
    });
  }

  if (id === "config_channels") {
    return interaction.update({
      embeds: [
        createEmbed(
          interaction.guildId,
          "📢 CANAIS",
          "Configure os canais usados pelo sistema de análise."
        ),
      ],
      components: channelConfigComponents(),
    });
  }

  if (id === "config_bets") {
    return interaction.update({
      embeds: [
        createEmbed(
          interaction.guildId,
          "🎲 APOSTAS",
          "Configure a categoria onde os canais privados das apostas serão criados."
        ),
      ],
      components: betConfigComponents(),
    });
  }

  if (id === "config_mediators") {
    return interaction.update({
      embeds: [
        createEmbed(
          interaction.guildId,
          "🛡️ MEDIADORES",
          "Configure o canal da fila de mediadores."
        ),
      ],
      components: mediatorConfigComponents(),
    });
  }

  if (id === "config_appearance") {
    return interaction.update({
      embeds: [
        createEmbed(
          interaction.guildId,
          "🎨 APARÊNCIA",
          "Configure a foto e a cor utilizadas pelo bot."
        ),
      ],
      components: appearanceComponents(),
    });
  }

  if (id === "config_fee") {
    return interaction.update({
      embeds: [
        createEmbed(
          interaction.guildId,
          "💸 TAXA DO ADM",
          `Taxa atual: **${formatMoney(
            getGuildConfig(interaction.guildId).admFee
          )}**\n\nSelecione abaixo o valor da taxa.`,
        ),
      ],
      components: feeComponents(),
    });
  }

  if (id === "config_queue") {
    return interaction.update({
      embeds: [
        createEmbed(
          interaction.guildId,
          "🎰 FILAS",
          "Configure e crie os painéis de fila."
        ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("queue_panel")
            .setLabel("Configurar filas")
            .setStyle(ButtonStyle.Primary)
        ),
        backButton(),
      ],
    });
  }

  if (id === "queue_panel") {
    return interaction.reply({
      content:
        "Use o comando `.fila FORMATO MODALIDADE VALOR` para criar um painel de fila.\n\n" +
        "Exemplo:\n" +
        "`.fila 1x1 mobile 100`",
      ephemeral: true,
    });
  }

  if (id === "appearance_avatar") {
    return interaction.showModal(
      createAvatarModal()
    );
  }

  if (id === "appearance_color") {
    return interaction.showModal(
      createColorModal()
    );
  }

  if (id === "pix_add") {
    return interaction.showModal(
      createPixModal()
    );
  }

  if (id === "pix_list") {
    const config = getGuildConfig(
      interaction.guildId
    );

    const admins = Array.isArray(
      config.pixAdmins
    )
      ? config.pixAdmins
      : [];

    if (!admins.length) {
      return interaction.reply({
        content:
          "❌ Nenhum ADM/Pix cadastrado.",
        ephemeral: true,
      });
    }

    const text = admins
      .map(
        (adm, index) =>
          `**${index + 1}. ${adm.name}**\n` +
          `Chave Pix: \`${adm.key}\`\n` +
          `QR Code: ${
            adm.qr || "Não cadastrado"
          }`
      )
      .join("\n\n");

    return interaction.reply({
      embeds: [
        createEmbed(
          interaction.guildId,
          "💰 ADMs CADASTRADOS",
          text
        ),
      ],
      ephemeral: true,
    });
  }

  return interaction.reply({
    content: "❌ Configuração inválida.",
    ephemeral: true,
  });
}


async function handleRoleSelect(interaction) {
  if (!isAdministrator(interaction.member)) {
    return interaction.reply({
      content: "❌ Apenas administradores.",
      ephemeral: true,
    });
  }

  const config = getGuildConfig(
    interaction.guildId
  );

  const roleId = interaction.values[0];

  if (
    interaction.customId ===
    "select_mediator_role"
  ) {
    config.mediatorRoleId = roleId;

    saveDatabase();

    return interaction.reply({
      content:
        `✅ Cargo de Mediador configurado: <@&${roleId}>`,
      ephemeral: true,
    });
  }

  if (
    interaction.customId ===
    "select_analyst_role"
  ) {
    config.analystRoleId = roleId;

    saveDatabase();

    return interaction.reply({
      content:
        `✅ Cargo de Analista configurado: <@&${roleId}>`,
      ephemeral: true,
    });
  }

  return interaction.reply({
    content: "❌ Seleção de cargo inválida.",
    ephemeral: true,
  });
}


async function handleChannelSelect(interaction) {
  if (!isAdministrator(interaction.member)) {
    return interaction.reply({
      content: "❌ Apenas administradores.",
      ephemeral: true,
    });
  }

  const config = getGuildConfig(
    interaction.guildId
  );

  const channelId =
    interaction.values[0];

  if (
    interaction.customId ===
    "select_channel_mobile"
  ) {
    config.analysisChannelMobile =
      channelId;

    saveDatabase();

    return interaction.reply({
      content:
        `✅ Canal do \`.ssmob\` configurado: <#${channelId}>`,
      ephemeral: true,
    });
  }

  if (
    interaction.customId ===
    "select_channel_emulator"
  ) {
    config.analysisChannelEmulator =
      channelId;

    saveDatabase();

    return interaction.reply({
      content:
        `✅ Canal do \`.ssemu\` configurado: <#${channelId}>`,
      ephemeral: true,
    });
  }

  if (
    interaction.customId ===
    "select_bets_category"
  ) {
    const channel =
      interaction.guild.channels.cache.get(
        channelId
      );

    if (
      !channel ||
      channel.type !==
        ChannelType.GuildCategory
    ) {
      return interaction.reply({
        content:
          "❌ O canal selecionado não é uma categoria.",
        ephemeral: true,
      });
    }

    config.betsCategoryId =
      channelId;

    saveDatabase();

    return interaction.reply({
      content:
        `✅ Categoria das apostas configurada: <#${channelId}>`,
      ephemeral: true,
    });
  }

  if (
    interaction.customId ===
    "select_mediator_channel"
  ) {
    const channel =
      interaction.guild.channels.cache.get(
        channelId
      );

    if (
      !channel ||
      channel.type !==
        ChannelType.GuildText
    ) {
      return interaction.reply({
        content:
          "❌ O canal selecionado não é um canal de texto.",
        ephemeral: true,
      });
    }

    config.mediatorQueueChannelId =
      channelId;

    saveDatabase();

    await channel.send({
      embeds: [
        mediatorQueueEmbed(
          interaction.guildId
        ),
      ],
      components:
        mediatorQueueButtons(),
    });

    return interaction.reply({
      content:
        `✅ Canal da fila de mediadores configurado: <#${channelId}>`,
      ephemeral: true,
    });
  }

  return interaction.reply({
    content:
      "❌ Seleção de canal inválida.",
    ephemeral: true,
  });
}


async function handleStringSelect(interaction) {
  if (
    interaction.customId ===
    "select_adm_fee"
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      return interaction.reply({
        content:
          "❌ Apenas administradores.",
        ephemeral: true,
      });
    }

    const fee = Number(
      interaction.values[0]
    );

    if (
      !Number.isInteger(fee) ||
      fee < 1 ||
      fee > 50
    ) {
      return interaction.reply({
        content:
          "❌ Taxa inválida.",
        ephemeral: true,
      });
    }

    const config =
      getGuildConfig(
        interaction.guildId
      );

    config.admFee = fee;

    saveDatabase();

    return interaction.update({
      embeds: [
        createEmbed(
          interaction.guildId,
          "💸 TAXA CONFIGURADA",
          `A taxa do ADM foi definida para **${formatMoney(
            fee
          )}** por atendimento.`
        ),
      ],
      components: [
        backButton(),
      ],
    });
  }

  if (
    interaction.customId.startsWith(
      "med_menu|"
    )
  ) {
    const betId =
      interaction.customId.split("|")[1];

    const action =
      interaction.values[0];

    const bet = getBet(betId);

    if (!bet) {
      return interaction.reply({
        content:
          "❌ Aposta não encontrada.",
        ephemeral: true,
      });
    }

    if (
      interaction.user.id !==
      bet.mediator
    ) {
      return interaction.reply({
        content:
          "❌ Apenas o mediador responsável pode usar este menu.",
        ephemeral: true,
      });
    }

    if (
      bet.finished ||
      bet.cancelled
    ) {
      return interaction.reply({
        content:
          "❌ Esta aposta já foi finalizada ou cancelada.",
        ephemeral: true,
      });
    }

    if (action === "winner") {
      return interaction.update({
        embeds: [
          createEmbed(
            interaction.guildId,
            "🏆 ESCOLHER VENCEDOR",
            "Selecione o jogador vencedor."
          ),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                `med_winner|${bet.id}|${bet.player1}`
              )
              .setLabel("🏆 Jogador 1")
              .setStyle(
                ButtonStyle.Success
              ),

            new ButtonBuilder()
              .setCustomId(
                `med_winner|${bet.id}|${bet.player2}`
              )
              .setLabel("🏆 Jogador 2")
              .setStyle(
                ButtonStyle.Success
              )
          ),
        ],
      });
    }

    if (action === "wo") {
      bet.finished = true;

      bet.result = {
        type: "wo",
      };

      saveDatabase();

      return interaction.update({
        embeds: [
          createEmbed(
            interaction.guildId,
            "⚠️ VITÓRIA POR W.O.",
            "Vitória por W.O. registrada.\n\n" +
              "Nenhuma vitória ou derrota foi adicionada."
          ),
        ],
        components: [],
      });
    }

    if (action === "finish") {
      bet.finished = true;

      bet.result = {
        type: "finished",
      };

      saveDatabase();

      return interaction.update({
        embeds: [
          createEmbed(
            interaction.guildId,
            "✅ APOSTA FINALIZADA",
            "A aposta foi finalizada sem alterar vitória ou derrota."
          ),
        ],
        components: [],
      });
    }

    return interaction.reply({
      content:
        "❌ Ação inválida.",
      ephemeral: true,
    });
  }

  return interaction.reply({
    content:
      "❌ Menu inválido.",
    ephemeral: true,
  });
}


async function handleButton(interaction) {
  const id = interaction.customId;

  if (id.startsWith("queue_join|")) {
    const parts = id.split("|");

    const format = parts[1];
    const mode = parts[2];
    const value = Number(parts[3]);
    const type = parts[4];

    return joinQueue(
      interaction,
      format,
      mode,
      value,
      type
    );
  }

  if (id.startsWith("queue_leave|")) {
    const parts = id.split("|");

    const format = parts[1];
    const mode = parts[2];
    const value = Number(parts[3]);
    const type = parts[4];

    return leaveQueue(
      interaction,
      format,
      mode,
      value,
      type
    );
  }

  if (
    id ===
    "mediator_queue_join"
  ) {
    if (
      !hasMediatorRole(
        interaction.member,
        interaction.guildId
      )
    ) {
      return interaction.reply({
        content:
          "❌ Você precisa possuir o cargo de Mediador.",
        ephemeral: true,
      });
    }

    const config =
      getGuildConfig(
        interaction.guildId
      );

    if (
      !Array.isArray(
        config.mediatorQueue
      )
    ) {
      config.mediatorQueue = [];
    }

    if (
      config.mediatorQueue.includes(
        interaction.user.id
      )
    ) {
      return interaction.reply({
        content:
          "❌ Você já está na fila de mediadores.",
        ephemeral: true,
      });
    }

    config.mediatorQueue.push(
      interaction.user.id
    );

    saveDatabase();

    await interaction.message.edit({
      embeds: [
        mediatorQueueEmbed(
          interaction.guildId
        ),
      ],
      components:
        mediatorQueueButtons(),
    }).catch(() => {});

    return interaction.reply({
      content:
        "✅ Você entrou na fila de mediadores.",
      ephemeral: true,
    });
  }

  if (
    id ===
    "mediator_queue_leave"
  ) {
    const config =
      getGuildConfig(
        interaction.guildId
      );

    if (
      !Array.isArray(
        config.mediatorQueue
      )
    ) {
      config.mediatorQueue = [];
    }

    const index =
      config.mediatorQueue.indexOf(
        interaction.user.id
      );

    if (index === -1) {
      return interaction.reply({
        content:
          "❌ Você não está na fila de mediadores.",
        ephemeral: true,
      });
    }

    config.mediatorQueue.splice(
      index,
      1
    );

    saveDatabase();

    await interaction.message.edit({
      embeds: [
        mediatorQueueEmbed(
          interaction.guildId
        ),
      ],
      components:
        mediatorQueueButtons(),
    }).catch(() => {});

    return interaction.reply({
      content:
        "✅ Você saiu da fila de mediadores.",
      ephemeral: true,
    });
  }

  if (
    id.startsWith(
      "bet_confirm|"
    )
  ) {
    const betId =
      id.split("|")[1];

    const bet = getBet(betId);

    if (!bet) {
      return interaction.reply({
        content:
          "❌ Aposta não encontrada.",
        ephemeral: true,
      });
    }

    if (
      bet.finished ||
      bet.cancelled
    ) {
      return interaction.reply({
        content:
          "❌ Esta aposta já foi finalizada.",
        ephemeral: true,
      });
    }

    if (
      !playerBelongsToBet(
        bet,
        interaction.user.id
      )
    ) {
      return interaction.reply({
        content:
          "❌ Você não participa desta aposta.",
        ephemeral: true,
      });
    }

    if (
      !Array.isArray(
        bet.confirmed
      )
    ) {
      bet.confirmed = [];
    }

    if (
      bet.confirmed.includes(
        interaction.user.id
      )
    ) {
      return interaction.reply({
        content:
          "❌ Você já confirmou esta aposta.",
        ephemeral: true,
      });
    }

    bet.confirmed.push(
      interaction.user.id
    );

    saveDatabase();

    await interaction.reply({
      content:
        "✅ Sua confirmação foi registrada.",
      ephemeral: true,
    });

    if (
      bet.confirmed.length >=
      bet.players.length
    ) {
      await sendPixData(
        interaction.channel,
        bet.guildId,
        bet
      );
    }

    return;
  }

  if (
    id.startsWith(
      "bet_cancel|"
    )
  ) {
    const betId =
      id.split("|")[1];

    const bet = getBet(betId);

    if (!bet) {
      return interaction.reply({
        content:
          "❌ Aposta não encontrada.",
        ephemeral: true,
      });
    }

    if (
      !playerBelongsToBet(
        bet,
        interaction.user.id
      ) &&
      interaction.user.id !==
        bet.mediator
    ) {
      return interaction.reply({
        content:
          "❌ Você não participa desta aposta.",
        ephemeral: true,
      });
    }

    await interaction.reply({
      content:
        "❌ Aposta cancelada.",
      ephemeral: true,
    });

    return cancelBet(
      bet,
      interaction.channel
    );
  }

  if (
    id.startsWith(
      "med_winner|"
    )
  ) {
    const parts =
      id.split("|");

    const betId = parts[1];
    const winnerId = parts[2];

    const bet = getBet(betId);

    if (!bet) {
      return interaction.reply({
        content:
          "❌ Aposta não encontrada.",
        ephemeral: true,
      });
    }

    return chooseWinner(
      interaction,
      bet,
      winnerId
    );
  }

  if (
    id.startsWith(
      "copy_room_id|"
    )
  ) {
    const betId =
      id.split("|")[1];

    const bet = getBet(betId);

    if (!bet) {
      return interaction.reply({
        content:
          "❌ Aposta não encontrada.",
        ephemeral: true,
      });
    }

    return interaction.reply({
      content:
        `🆔 ID da sala: \`${bet.roomId || "Não informado"}\``,
      ephemeral: true,
    });
  }

  if (
    id.startsWith(
      "copy_room_password|"
    )
  ) {
    const betId =
      id.split("|")[1];

    const bet = getBet(betId);

    if (!bet) {
      return interaction.reply({
        content:
          "❌ Aposta não encontrada.",
        ephemeral: true,
      });
    }

    return interaction.reply({
      content:
        `🔐 Senha da sala: \`${bet.roomPassword || "Não informada"}\``,
      ephemeral: true,
    });
  }

  if (
    id.startsWith(
      "analysis_claim|"
    )
  ) {
    const analysisId =
      id.split("|")[1];

    const analysis =
      db.analyses[analysisId];

    if (!analysis) {
      return interaction.reply({
        content:
          "❌ Análise não encontrada.",
        ephemeral: true,
      });
    }

    if (
      analysis.claimedBy
    ) {
      return interaction.reply({
        content:
          "❌ Esta análise já foi assumida por outro analista.",
        ephemeral: true,
      });
    }

    if (
      !hasAnalystRole(
        interaction.member,
        interaction.guildId
      )
    ) {
      return interaction.reply({
        content:
          "❌ Você precisa possuir o cargo de Analista.",
        ephemeral: true,
      });
    }

    analysis.claimedBy =
      interaction.user.id;

    saveDatabase();

    return interaction.update({
      embeds: [
        createEmbed(
          interaction.guildId,
          "🔎 ANÁLISE ASSUMIDA",
          `👤 **Analista:** <@${interaction.user.id}>\n\n` +
            "Esta análise foi assumida e será atendida pelo analista responsável."
        ),
      ],
      components: [],
    });
  }

  return interaction.reply({
    content:
      "❌ Botão inválido ou expirado.",
    ephemeral: true,
  });
}


async function handleModalSubmit(interaction) {
  if (!isAdministrator(interaction.member)) {
    return interaction.reply({
      content:
        "❌ Apenas administradores.",
      ephemeral: true,
    });
  }

  const id =
    interaction.customId;

  if (id === "pix_modal") {
    const config =
      getGuildConfig(
        interaction.guildId
      );

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

    if (!name || !key) {
      return interaction.reply({
        content:
          "❌ Nome e chave Pix são obrigatórios.",
        ephemeral: true,
      });
    }

    if (
      !Array.isArray(
        config.pixAdmins
      )
    ) {
      config.pixAdmins = [];
    }

    config.pixAdmins.push({
      id: generateId("adm"),
      name,
      key,
      qr: qr || null,
      createdAt: Date.now(),
    });

    saveDatabase();

    return interaction.reply({
      content:
        "✅ ADM/Pix cadastrado com sucesso.",
      ephemeral: true,
    });
  }

  if (id === "avatar_modal") {
    const url =
      interaction.fields
        .getTextInputValue(
          "avatar_url"
        )
        .trim();

    if (
      !/^https?:\/\//i.test(url)
    ) {
      return interaction.reply({
        content:
          "❌ Informe uma URL válida.",
        ephemeral: true,
      });
    }

    const config =
      getGuildConfig(
        interaction.guildId
      );

    config.botAvatar = url;

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

      return interaction.reply({
        content:
          "❌ Não foi possível alterar a foto. Verifique se a URL aponta para uma imagem válida.",
        ephemeral: true,
      });
    }

    return interaction.reply({
      content:
        "✅ Foto de perfil do bot atualizada.",
      ephemeral: true,
    });
  }

  if (id === "color_modal") {
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
      return interaction.reply({
        content:
          "❌ Cor inválida. Use, por exemplo, `#000000`.",
        ephemeral: true,
      });
    }

    const config =
      getGuildConfig(
        interaction.guildId
      );

    config.embedColor =
      normalizeColor(color);

    saveDatabase();

    return interaction.reply({
      content:
        `✅ Cor das embeds alterada para **${config.embedColor}**.`,
      ephemeral: true,
    });
  }

  return interaction.reply({
    content:
      "❌ Formulário inválido.",
    ephemeral: true,
  });
}


async function handleCommand(message) {
  const content =
    message.content.trim();

  if (
    !content.startsWith(PREFIX)
  ) {
    return;
  }

  const args =
    content
      .slice(PREFIX.length)
      .trim()
      .split(/\s+/);

  const command =
    (
      args.shift() || ""
    ).toLowerCase();

  if (!command) {
    return;
  }

  if (command === "conf") {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    return message.channel.send({
      embeds: [
        configMainEmbed(
          message.guild
        ),
      ],
      components:
        configButtons(),
    });
  }

  if (command === "fila") {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Apenas administradores podem criar painéis de fila."
      );
    }

    const format =
      args[0] || "1x1";

    const mode =
      args[1] || "mobile";

    const value =
      Number(args[2]) || 100;

    if (
      !FORMATS.includes(format)
    ) {
      return message.reply(
        "❌ Formato inválido. Use: 1x1, 2x2, 3x3 ou 4x4."
      );
    }

    if (
      !MODES.includes(mode)
    ) {
      return message.reply(
        "❌ Modalidade inválida. Use: mobile, emulador ou misto."
      );
    }

    if (
      !VALUES.includes(value)
    ) {
      return message.reply(
        "❌ Valor inválido."
      );
    }

    const type =
      format === "1x1"
        ? "ice_normal"
        : "normal";

    return createQueueMessage(
      message.channel,
      message.guild.id,
      format,
      mode,
      value,
      type
    );
  }

  if (command === "medfila") {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Apenas administradores podem criar a fila de mediadores."
      );
    }

    return message.channel.send({
      embeds: [
        mediatorQueueEmbed(
          message.guild.id
        ),
      ],
      components:
        mediatorQueueButtons(),
    });
  }

  if (command === "perfil") {
    const user =
      getUserData(
        message.author.id
      );

    return message.reply({
      embeds: [
        createEmbed(
          message.guild.id,
          `👤 PERFIL DE ${message.author.username}`,
          `🏆 **Vitórias:** ${user.wins}\n` +
            `❌ **Derrotas:** ${user.losses}\n` +
            `🪙 **Saldo:** ${formatMoney(
              user.coins
            )}`
        ),
      ],
    });
  }

  if (command === "ajuda") {
    return message.reply({
      embeds: [
        createEmbed(
          message.guild.id,
          "📚 COMANDOS",
          "`.conf` — Configuração do bot\n" +
            "`.fila` — Criar painel de fila\n" +
            "`.medfila` — Criar fila de mediadores\n" +
            "`.perfil` — Ver perfil\n" +
            "`.ajuda` — Mostrar esta ajuda"
        ),
      ],
    });
  }
}


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


client.once("ready", async () => {
  console.log(
    `✅ Bot conectado como ${client.user.tag}`
  );

  const commands = [
    new SlashCommandBuilder()
      .setName("conf")
      .setDescription(
        "Abrir configuração do bot"
      ),

    new SlashCommandBuilder()
      .setName("fila")
      .setDescription(
        "Criar painel de fila"
      ),

    new SlashCommandBuilder()
      .setName("perfil")
      .setDescription(
        "Ver seu perfil"
      ),
  ].map(
    command =>
      command.toJSON()
  );

  const rest =
    new REST({
      version: "10",
    }).setToken(TOKEN);

  try {
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
      "✅ Comandos registrados."
    );
  } catch (error) {
    console.error(
      "Erro ao registrar comandos:",
      error
    );
  }

  const guild =
    client.guilds.cache.get(
      GUILD_ID
    );

  if (guild) {
    const config =
      getGuildConfig(
        guild.id
      );

    if (config.botAvatar) {
      try {
        await client.user.setAvatar(
          config.botAvatar
        );
      } catch (error) {
        console.error(
          "Erro ao restaurar avatar:",
          error
        );
      }
    }
  }
});


client.on(
  "messageCreate",
  async message => {
    if (
      message.author.bot ||
      !message.guild
    ) {
      return;
    }

    try {
      const bet =
        getBetByChannel(
          message.channel.id
        );

      if (
        bet &&
        message.author.id ===
          bet.mediator
      ) {
        await handleRoomCredentials(
          message,
          bet
        );
      }

      await handleCommand(
        message
      );
    } catch (error) {
      console.error(
        "Erro no messageCreate:",
        error
      );
    }
  }
);


client.on(
  "interactionCreate",
  async interaction => {
    try {
      if (
        interaction.isButton()
      ) {
        const id =
          interaction.customId;

        if (
          id === "config_back" ||
          id.startsWith("config_") ||
          id === "appearance_avatar" ||
          id === "appearance_color" ||
          id === "pix_add" ||
          id === "pix_list" ||
          id === "queue_panel"
        ) {
          return handleConfigButton(
            interaction
          );
        }

        return handleButton(
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
        interaction.isChannelSelectMenu()
      ) {
        return handleChannelSelect(
          interaction
        );
      }

      if (
        interaction.isStringSelectMenu()
      ) {
        return handleStringSelect(
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

      if (
        interaction.isChatInputCommand()
      ) {
        if (
          interaction.commandName ===
          "conf"
        ) {
          if (
            !isAdministrator(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores.",
              ephemeral: true,
            });
          }

          return interaction.reply({
            embeds: [
              configMainEmbed(
                interaction.guild
              ),
            ],
            components:
              configButtons(),
            ephemeral: true,
          });
        }

        if (
          interaction.commandName ===
          "perfil"
        ) {
          const user =
            getUserData(
              interaction.user.id
            );

          return interaction.reply({
            embeds: [
              createEmbed(
                interaction.guildId,
                "👤 SEU PERFIL",
                `🏆 Vitórias: ${user.wins}\n` +
                  `❌ Derrotas: ${user.losses}\n` +
                  `🪙 Saldo: ${formatMoney(
                    user.coins
                  )}`
              ),
            ],
            ephemeral: true,
          });
        }

        if (
          interaction.commandName ===
          "fila"
        ) {
          if (
            !isAdministrator(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores.",
              ephemeral: true,
            });
          }

          return interaction.reply({
            content:
              "Use `.fila FORMATO MODALIDADE VALOR` para criar uma fila.",
            ephemeral: true,
          });
        }
      }
    } catch (error) {
      console.error(
        "Erro no interactionCreate:",
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction.reply({
          content:
            "❌ Ocorreu um erro ao processar esta interação.",
          ephemeral: true,
        }).catch(() => {});
      }
    }
  }
);


client.on(
  "guildMemberRemove",
  async member => {
    const config =
      getGuildConfig(
        member.guild.id
      );

    if (
      Array.isArray(
        config.mediatorQueue
      )
    ) {
      const index =
        config.mediatorQueue.indexOf(
          member.id
        );

      if (index !== -1) {
        config.mediatorQueue.splice(
          index,
          1
        );

        saveDatabase();

        await refreshMediatorQueueMessage(
          member.guild
        );
      }
    }
  }
);


client.on(
  "guildMemberUpdate",
  async (
    oldMember,
    newMember
  ) => {
    const config =
      getGuildConfig(
        newMember.guild.id
      );

    if (
      !config.mediatorRoleId
    ) {
      return;
    }

    const hadRole =
      oldMember.roles.cache.has(
        config.mediatorRoleId
      );

    const hasRole =
      newMember.roles.cache.has(
        config.mediatorRoleId
      );

    if (
      hadRole &&
      !hasRole &&
      Array.isArray(
        config.mediatorQueue
      )
    ) {
      const index =
        config.mediatorQueue.indexOf(
          newMember.id
        );

      if (index !== -1) {
        config.mediatorQueue.splice(
          index,
          1
        );

        saveDatabase();

        await refreshMediatorQueueMessage(
          newMember.guild
        );
      }
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


saveDatabase();

client.login(TOKEN);

console.log(
  "Deploy Railway"
);
