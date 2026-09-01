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
 * IMPORTANTE:
 * O client fica fora de qualquer função.
 * Assim todas as funções e o login final
 * conseguem acessar a mesma instância.
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

      betsCategoryId: null,

      mediatorQueueChannelId:
        null,

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

  const players =
    queue.length > 0
      ? queue
          .map(
            (id, index) =>
              `**${index + 1}.** <@${id}>`
          )
          .join("\n")
      : "Nenhum jogador na fila.";

  let title =
    `🎰 FILA ${format}`;

  if (format === "1x1") {
    if (
      type ===
      "ice_infinite"
    ) {
      title +=
        " ♾️ GELO INFINITO";
    } else {
      title +=
        " 🧊 GELO NORMAL";
    }
  }

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
    const isInfinite =
      type === "ice_infinite";

    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `queue_join|${format}|${mode}|${value}|${type}`
          )
          .setLabel(
            isInfinite
              ? "♾️ Entrar — Gelo Infinito"
              : "🧊 Entrar — Gelo Normal"
          )
          .setStyle(
            isInfinite
              ? ButtonStyle.Success
              : ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            `queue_leave|${format}|${mode}|${value}|${type}`
          )
          .setLabel(
            "🚪 Sair da Fila"
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
          "➕ Entrar na Fila"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          `queue_leave|${format}|${mode}|${value}|normal`
        )
        .setLabel(
          "🚪 Sair da Fila"
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
          .setRequired(true)
          .setMaxLength(100)
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
          .setMaxLength(200)
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
          .setRequired(false)
          .setMaxLength(1000)
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
          .setRequired(true)
          .setMaxLength(1000)
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
}

function getAvailableMediatorIds(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  const currentQueue =
    Array.isArray(
      config.mediatorQueue
    )
      ? config.mediatorQueue
      : [];

  const valid = [];

  for (
    const userId of currentQueue
  ) {
    const member =
      guild.members.cache.get(
        userId
      );

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

  config.mediatorQueue =
    valid;

  return valid;
}

async function refreshMediatorQueueMessage(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

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
    channel.type !==
      ChannelType.GuildText
  ) {
    return;
  }

  const messages =
    await channel.messages
      .fetch({
        limit: 50,
      })
      .catch(() => null);

  if (!messages) {
    return;
  }

  const message =
    messages.find(
      (m) =>
        m.author.id ===
          client.user.id &&
        m.components.some(
          (row) =>
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

  let component = null;

  for (
    const row of message.components
  ) {
    const found =
      row.components.find(
        (x) =>
          String(
            x.customId || ""
          ).startsWith(
            "queue_join|"
          )
      );

    if (found) {
      component = found;
      break;
    }
  }

  if (!component) {
    return;
  }

  const parts =
    component.customId.split(
      "|"
    );

  if (parts.length < 5) {
    return;
  }

  const format =
    parts[1];

  const mode =
    parts[2];

  const value =
    Number(parts[3]);

  const type =
    parts[4];

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
      bet.channelId ===
        channelId &&
      !bet.finished &&
      !bet.cancelled
  );
}

function getBet(id) {
  return (
    db.bets[id] || null
  );
}

function playerBelongsToBet(
  bet,
  userId
) {
  if (
    Array.isArray(
      bet.players
    )
  ) {
    return bet.players.includes(
      userId
    );
  }

  return (
    bet.player1 === userId ||
    bet.player2 === userId
  );
}

function mediatorBelongsToBet(
  bet,
  userId
) {
  return (
    bet.mediator === userId
  );
}

async function sendPixData(
  channel,
  guildId,
  bet
) {
  const config =
    getGuildConfig(
      guildId
    );

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
      bet.value * bet.players.length
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
        .setLabel(
          "Confirmar"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          `bet_cancel|${betId}`
        )
        .setLabel(
          "Cancelar"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    ),
  ];
}async function joinQueue(
  interaction,
  format,
  mode,
  value,
  type = "normal"
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa fila só pode ser usada dentro de um servidor.",
        ephemeral: true,
      }
    );
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

  if (
    queueAlreadyContains(
      queue,
      userId
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

  const limit =
    requiredPlayers(format);

  if (
    queue.length >= limit
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

  queue.push(userId);

  saveDatabase();

  await refreshQueueMessage(
    interaction.message
  );

  if (
    queue.length < limit
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "✅ Você entrou na fila.",
        ephemeral: true,
      }
    );
  }

  const players =
    [...queue];

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

  try {
    const bet =
      await createPrivateBetChannel(
        guild,
        format,
        mode,
        value,
        type,
        players
      );

    if (!bet) {
      throw new Error(
        "A aposta não foi criada."
      );
    }

    return sendSafeReply(
      interaction,
      {
        content:
          "🎮 A fila fechou e a aposta foi criada!",
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
    ] = players;

    saveDatabase();

    await refreshQueueMessage(
      interaction.message
    );

    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Não foi possível criar a aposta. Os jogadores foram devolvidos para a fila.",
        ephemeral: true,
      }
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
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa fila só pode ser usada dentro de um servidor.",
        ephemeral: true,
      }
    );
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
    queue.indexOf(userId);

  if (index === -1) {
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

  if (
    !Array.isArray(players) ||
    players.length <
      requiredPlayers(format)
  ) {
    throw new Error(
      "Quantidade insuficiente de jogadores."
    );
  }

  const betId =
    generateId("bet");

  const mediatorIds =
    getAvailableMediatorIds(
      guild
    );

  let mediatorId =
    null;

  if (
    mediatorIds.length > 0
  ) {
    const index =
      Number(
        config.mediatorRotationIndex ||
          0
      ) % mediatorIds.length;

    mediatorId =
      mediatorIds[index];

    config.mediatorRotationIndex =
      (index + 1) %
      mediatorIds.length;
  }

  const playerNames =
    players
      .slice(0, 6)
      .map(
        (id) =>
          guild.members.cache.get(
            id
          )?.user.username ||
          id
      );

  let channelName =
    `bet-${format}-${value}`;

  if (type === "ice_infinite") {
    channelName +=
      "-infinito";
  } else if (
    format === "1x1"
  ) {
    channelName +=
      "-normal";
  }

  const channel =
    await guild.channels.create(
      {
        name: channelName
          .toLowerCase()
          .replace(
            /[^a-z0-9-]/g,
            "-"
          )
          .slice(0, 90),

        type:
          ChannelType.GuildText,

        parent:
          config.betsCategoryId,

        reason:
          `Aposta ${betId}`,

        permissionOverwrites:
          [
            {
              id:
                guild.roles.everyone.id,

              deny: [
                PermissionsBitField.Flags
                  .ViewChannel,
              ],
            },

            ...players.map(
              (userId) => ({
                id: userId,

                allow: [
                  PermissionsBitField.Flags
                    .ViewChannel,

                  PermissionsBitField.Flags
                    .SendMessages,

                  PermissionsBitField.Flags
                    .ReadMessageHistory,
                ],
              })
            ),

            ...(mediatorId
              ? [
                  {
                    id: mediatorId,

                    allow: [
                      PermissionsBitField.Flags
                        .ViewChannel,

                      PermissionsBitField.Flags
                        .SendMessages,

                      PermissionsBitField.Flags
                        .ReadMessageHistory,
                    ],
                  },
                ]
              : []),
          ],
      }
    );

  const bet = {
    id: betId,

    guildId:
      guild.id,

    channelId:
      channel.id,

    format,

    mode,

    value:
      Number(value),

    type,

    players: [
      ...players,
    ],

    player1:
      players[0] || null,

    player2:
      players[1] || null,

    mediator:
      mediatorId,

    confirmed: [],

    roomId: null,

    roomPassword: null,

    winner: null,

    loser: null,

    finished: false,

    cancelled: false,

    createdAt:
      Date.now(),
  };

  db.bets[betId] =
    bet;

  saveDatabase();

  const playerMentions =
    players
      .map(
        (id) =>
          `<@${id}>`
      )
      .join(" ");

  const mediatorMention =
    mediatorId
      ? `<@${mediatorId}>`
      : "Nenhum mediador disponível";

  const embed =
    createEmbed(
      guild.id,
      `🎮 APOSTA ${format}`,
      `👥 **Jogadores:**\n${playerMentions}\n\n` +
        `📱 **Modalidade:** ${modeLabel(
          mode
        )}\n` +
        `💰 **Valor:** ${formatMoney(
          value
        )}\n` +
        `🛡️ **Mediador:** ${mediatorMention}\n\n` +
        `Todos os jogadores devem confirmar a aposta abaixo.`
    );

  await channel.send({
    content:
      playerMentions,

    embeds: [
      embed,
    ],

    components:
      confirmationButtons(
        betId
      ),
  });

  await sendPixData(
    channel,
    guild.id,
    bet
  );

  return bet;
}

async function handleConfigButton(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Esse painel só pode ser usado dentro de um servidor.",
        ephemeral: true,
      }
    );
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
          "❌ Você precisa ser administrador para usar essa configuração.",
        ephemeral: true,
      }
    );
  }

  const id =
    interaction.customId;

  if (
    id ===
    "config_back"
  ) {
    return interaction.update({
      embeds: [
        configMainEmbed(
          guild
        ),
      ],
      components:
        configButtons(),
    });
  }

  if (
    id ===
    "config_roles"
  ) {
    return interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🎭 CONFIGURAÇÃO DE CARGOS",
          "Selecione os cargos que serão utilizados pelo bot."
        ),
      ],
      components:
        roleConfigComponents(),
    });
  }

  if (
    id ===
    "config_channels"
  ) {
    return interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "📢 CONFIGURAÇÃO DE CANAIS",
          "Selecione os canais utilizados para as análises."
        ),
      ],
      components:
        channelConfigComponents(),
    });
  }

  if (
    id ===
    "config_bets"
  ) {
    return interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🎲 CONFIGURAÇÃO DAS APOSTAS",
          "Selecione a categoria onde os canais privados das apostas serão criados."
        ),
      ],
      components:
        betConfigComponents(),
    });
  }

  if (
    id ===
    "config_mediators"
  ) {
    return interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🛡️ CONFIGURAÇÃO DOS MEDIADORES",
          "Selecione o canal onde ficará a fila de mediadores."
        ),
      ],
      components:
        mediatorConfigComponents(),
    });
  }

  if (
    id ===
    "config_appearance"
  ) {
    return interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🎨 APARÊNCIA",
          "Escolha o que deseja alterar."
        ),
      ],
      components:
        appearanceComponents(),
    });
  }

  if (
    id ===
    "config_fee"
  ) {
    return interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "💸 TAXA DO ADM",
          "Selecione o valor da taxa administrativa."
        ),
      ],
      components:
        feeComponents(),
    });
  }

  if (
    id ===
    "config_pix"
  ) {
    return interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "💳 CONFIGURAÇÃO DO PIX",
          "Cadastre os ADMs responsáveis pelo recebimento das apostas."
        ),
      ],
      components:
        pixComponents(),
    });
  }

  if (
    id ===
    "config_queue"
  ) {
    return interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🛡️ FILA DE MEDIADORES",
          "Use o botão abaixo para publicar/atualizar a fila de mediadores neste canal."
        ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              "publish_mediator_queue"
            )
            .setLabel(
              "Publicar fila"
            )
            .setStyle(
              ButtonStyle.Primary
            )
        ),

        backButton(),
      ],
    });
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
    "appearance_color"
  ) {
    return interaction.showModal(
      createColorModal()
    );
  }

  if (
    id ===
    "pix_add"
  ) {
    return interaction.showModal(
      createPixModal()
    );
  }

  if (
    id ===
    "pix_list"
  ) {
    const config =
      getGuildConfig(
        guild.id
      );

    if (
      config.pixAdmins.length ===
      0
    ) {
      return interaction.reply({
        content:
          "ℹ️ Nenhum ADM Pix cadastrado.",
        ephemeral: true,
      });
    }

    const list =
      config.pixAdmins
        .map(
          (adm, index) =>
            `**${index + 1}. ${adm.name}**\n` +
            `🔑 \`${adm.key}\``
        )
        .join("\n\n");

    return interaction.reply({
      embeds: [
        createEmbed(
          guild.id,
          "💳 ADMs CADASTRADOS",
          list
        ),
      ],
      ephemeral: true,
    });
  }

  if (
    id ===
    "publish_mediator_queue"
  ) {
    config =
      getGuildConfig(
        guild.id
      );

    const channel =
      interaction.channel;

    if (
      !channel ||
      channel.type !==
        ChannelType.GuildText
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Este canal não pode receber a fila.",
          ephemeral: true,
        }
      );
    }

    config.mediatorQueueChannelId =
      channel.id;

    saveDatabase();

    await channel.send({
      embeds: [
        mediatorQueueEmbed(
          guild.id
        ),
      ],
      components:
        mediatorQueueButtons(),
    });

    return sendSafeReply(
      interaction,
      {
        content:
          "✅ Fila de mediadores publicada.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      content:
        "❌ Configuração desconhecida.",
      ephemeral: true,
    }
  );
}

async function handleRoleSelect(
  interaction
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
          "❌ Você precisa ser administrador.",
        ephemeral: true,
      }
    );
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  const roleId =
    interaction.values[0];

  if (
    interaction.customId ===
    "select_mediator_role"
  ) {
    config.mediatorRoleId =
      roleId;

    saveDatabase();

    return interaction.update({
      embeds: [
        configMainEmbed(
          interaction.guild
        ),
      ],
      components:
        configButtons(),
    });
  }

  if (
    interaction.customId ===
    "select_analyst_role"
  ) {
    config.analystRoleId =
      roleId;

    saveDatabase();

    return interaction.update({
      embeds: [
        configMainEmbed(
          interaction.guild
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
  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você precisa ser administrador.",
        ephemeral: true,
      }
    );
  }

  const config =
    getGuildConfig(
      interaction.guild.id
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

  return interaction.update({
    embeds: [
      configMainEmbed(
        interaction.guild
      ),
    ],
    components:
      configButtons(),
  });
}

async function handleStringSelect(
  interaction
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
          "❌ Você precisa ser administrador.",
        ephemeral: true,
      }
    );
  }

  if (
    interaction.customId !==
    "select_adm_fee"
  ) {
    return;
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  const fee =
    Number(
      interaction.values[0]
    );

  if (
    !Number.isFinite(fee) ||
    fee < 1 ||
    fee > 50
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Taxa inválida.",
        ephemeral: true,
      }
    );
  }

  config.admFee =
    fee;

  saveDatabase();

  return interaction.update({
    embeds: [
      configMainEmbed(
        interaction.guild
      ),
    ],
    components:
      configButtons(),
  });
}

async function handleModalSubmit(
  interaction
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
          "❌ Você precisa ser administrador.",
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
    "pix_modal"
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

    if (
      !Array.isArray(
        config.pixAdmins
      )
    ) {
      config.pixAdmins = [];
    }

    config.pixAdmins.push({
      id: generateId("pix"),

      name,

      key,

      qr:
        qr.trim() ||
        null,
    });

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          "✅ ADM Pix cadastrado com sucesso.",
        ephemeral: true,
      }
    );
  }

  if (
    interaction.customId ===
    "avatar_modal"
  ) {
    const url =
      interaction.fields.getTextInputValue(
        "avatar_url"
      ).trim();

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
    }

    return sendSafeReply(
      interaction,
      {
        content:
          "✅ Foto do bot atualizada.",
        ephemeral: true,
      }
    );
  }

  if (
    interaction.customId ===
    "color_modal"
  ) {
    const color =
      interaction.fields.getTextInputValue(
        "embed_color"
      ).trim();

    if (
      !/^#?[0-9A-Fa-f]{6}$/.test(
        color
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Cor inválida. Use, por exemplo, `#5865F2`.",
          ephemeral: true,
        }
      );
    }

    config.embedColor =
      normalizeColor(
        color
      );

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        content:
          "✅ Cor das embeds atualizada.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      content:
        "❌ Modal desconhecido.",
      ephemeral: true,
    }
  );
}async function handleMediatorQueueButton(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa ação só pode ser usada dentro de um servidor.",
        ephemeral: true,
      }
    );
  }

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !hasMediatorRole(
      interaction.member,
      guild.id
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você precisa ter o cargo de mediador.",
        ephemeral: true,
      }
    );
  }

  if (
    interaction.customId ===
    "mediator_queue_join"
  ) {
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
      return sendSafeReply(
        interaction,
        {
          content:
            "⚠️ Você já está na fila de mediadores.",
          ephemeral: true,
        }
      );
    }

    config.mediatorQueue.push(
      interaction.user.id
    );

    saveDatabase();

    await interaction.update({
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
      return sendSafeReply(
        interaction,
        {
          content:
            "⚠️ Você não está na fila de mediadores.",
          ephemeral: true,
        }
      );
    }

    config.mediatorQueue.splice(
      index,
      1
    );

    saveDatabase();

    await interaction.update({
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
}

async function handleBetConfirm(
  interaction,
  betId
) {
  const bet =
    getBet(betId);

  if (!bet) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa aposta não existe mais.",
        ephemeral: true,
      }
    );
  }

  if (
    bet.finished ||
    bet.cancelled
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa aposta já foi encerrada.",
        ephemeral: true,
      }
    );
  }

  if (
    !playerBelongsToBet(
      bet,
      interaction.user.id
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não faz parte dessa aposta.",
        ephemeral: true,
      }
    );
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

  saveDatabase();

  const required =
    requiredPlayers(
      bet.format
    );

  if (
    bet.confirmed.length >=
    required
  ) {
    const channel =
      interaction.channel;

    if (channel) {
      await channel.send({
        embeds: [
          createEmbed(
            bet.guildId,
            "✅ APOSTA CONFIRMADA",
            `Todos os ${required} jogadores confirmaram a aposta.\n\n` +
              `🛡️ O mediador já pode iniciar o atendimento.`
          ),
        ],
      });
    }
  }

  return sendSafeReply(
    interaction,
    {
      content:
        `✅ Confirmação registrada. ${bet.confirmed.length}/${required} jogadores confirmaram.`,
      ephemeral: true,
    }
  );
}

async function handleBetCancel(
  interaction,
  betId
) {
  const bet =
    getBet(betId);

  if (!bet) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa aposta não existe mais.",
        ephemeral: true,
      }
    );
  }

  if (
    bet.finished ||
    bet.cancelled
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa aposta já foi encerrada.",
        ephemeral: true,
      }
    );
  }

  if (
    !playerBelongsToBet(
      bet,
      interaction.user.id
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não faz parte dessa aposta.",
        ephemeral: true,
      }
    );
  }

  bet.cancelled =
    true;

  saveDatabase();

  if (
    interaction.channel
  ) {
    await interaction.channel.send({
      embeds: [
        createEmbed(
          bet.guildId,
          "❌ APOSTA CANCELADA",
          `A aposta foi cancelada por <@${interaction.user.id}>.`
        ),
      ],
    });
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

async function handleCopyRoomData(
  interaction,
  betId,
  field
) {
  const bet =
    getBet(betId);

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
    !playerBelongsToBet(
      bet,
      interaction.user.id
    ) &&
    !mediatorBelongsToBet(
      bet,
      interaction.user.id
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não participa dessa aposta.",
        ephemeral: true,
      }
    );
  }

  const value =
    field === "room_id"
      ? bet.roomId
      : bet.roomPassword;

  if (!value) {
    return sendSafeReply(
      interaction,
      {
        content:
          field === "room_id"
            ? "❌ O ID da sala ainda não foi informado."
            : "❌ A senha da sala ainda não foi informada.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      content:
        field === "room_id"
          ? `🎮 **ID da sala:** \`${value}\``
          : `🔐 **Senha da sala:** \`${value}\``,
      ephemeral: true,
    }
  );
}

function roomButtons(
  betId
) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `copy_room_id|${betId}`
        )
        .setLabel(
          "📋 Copiar ID"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          `copy_room_password|${betId}`
        )
        .setLabel(
          "📋 Copiar Senha"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),
  ];
}

async function handleRoomCredentials(
  message,
  bet
) {
  if (!message || !bet) {
    return false;
  }

  if (
    message.author.bot
  ) {
    return false;
  }

  if (
    !message.guild
  ) {
    return false;
  }

  if (
    !hasMediatorRole(
      message.member,
      message.guild.id
    )
  ) {
    return false;
  }

  const content =
    message.content.trim();

  if (!content) {
    return false;
  }

  let changed =
    false;

  const roomIdMatch =
    content.match(
      /(?:id|sala|room)[^\d]*(\d{3,})/i
    );

  const passwordMatch =
    content.match(
      /(?:senha|password|pass)[^\s:=-]*[:=\-\s]+([^\s]+)/i
    );

  if (
    roomIdMatch &&
    roomIdMatch[1]
  ) {
    bet.roomId =
      roomIdMatch[1];

    changed = true;
  }

  if (
    passwordMatch &&
    passwordMatch[1]
  ) {
    bet.roomPassword =
      passwordMatch[1];

    changed = true;
  }

  if (!changed) {
    return false;
  }

  saveDatabase();

  await message.channel.send({
    embeds: [
      createEmbed(
        bet.guildId,
        "🎮 DADOS DA SALA",
        `🆔 **ID:** ${
          bet.roomId
            ? `\`${bet.roomId}\``
            : "Não informado"
        }\n\n` +
          `🔐 **Senha:** ${
            bet.roomPassword
              ? `\`${bet.roomPassword}\``
              : "Não informada"
          }`
      ),
    ],
    components:
      roomButtons(
        bet.id
      ),
  });

  return true;
}

async function handleMediatorWinner(
  interaction,
  betId,
  winnerId
) {
  const bet =
    getBet(betId);

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
    bet.finished ||
    bet.cancelled
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa aposta já foi encerrada.",
        ephemeral: true,
      }
    );
  }

  if (
    !hasMediatorRole(
      interaction.member,
      interaction.guild.id
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você precisa ser mediador.",
        ephemeral: true,
      }
    );
  }

  if (
    !playerBelongsToBet(
      bet,
      winnerId
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Jogador vencedor inválido.",
        ephemeral: true,
      }
    );
  }

  const loserId =
    Array.isArray(
      bet.players
    )
      ? bet.players.find(
          (id) =>
            id !== winnerId
        )
      : bet.player1 === winnerId
        ? bet.player2
        : bet.player1;

  bet.winner =
    winnerId;

  bet.loser =
    loserId || null;

  bet.finished =
    true;

  const winnerData =
    getUserData(
      winnerId
    );

  winnerData.wins =
    Number(
      winnerData.wins || 0
    ) + 1;

  if (loserId) {
    const loserData =
      getUserData(
        loserId
      );

    loserData.losses =
      Number(
        loserData.losses || 0
      ) + 1;
  }

  saveDatabase();

  if (
    interaction.channel
  ) {
    await interaction.channel.send({
      embeds: [
        createEmbed(
          bet.guildId,
          "🏆 RESULTADO DA APOSTA",
          `🏆 **Vencedor:** <@${winnerId}>\n` +
            `💀 **Derrotado:** ${
              loserId
                ? `<@${loserId}>`
                : "Não informado"
            }\n\n` +
            `A aposta foi encerrada pelo mediador.`
        ),
      ],
    });
  }

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Resultado registrado.",
      ephemeral: true,
    }
  );
}

function winnerButtons(
  betId,
  bet
) {
  const buttons = [];

  const players =
    Array.isArray(
      bet.players
    )
      ? bet.players
      : [
          bet.player1,
          bet.player2,
        ].filter(Boolean);

  for (
    const playerId of players.slice(
      0,
      2
    )
  ) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(
          `med_winner|${betId}|${playerId}`
        )
        .setLabel(
          `🏆 ${String(
            playerId
          ).slice(0, 8)}`
        )
        .setStyle(
          ButtonStyle.Success
        )
    );
  }

  if (
    buttons.length === 0
  ) {
    return [];
  }

  return [
    new ActionRowBuilder().addComponents(
      buttons
    ),
  ];
}

async function sendMediatorMenu(
  channel,
  bet
) {
  const rows =
    winnerButtons(
      bet.id,
      bet
    );

  if (
    rows.length === 0
  ) {
    return;
  }

  await channel.send({
    embeds: [
      createEmbed(
        bet.guildId,
        "🛡️ MENU DO MEDIADOR",
        "Todos os jogadores confirmaram.\n\nSelecione o vencedor da partida:"
      ),
    ],
    components: rows,
  });
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

    return joinQueue(
      interaction,
      parts[1],
      parts[2],
      Number(parts[3]),
      parts[4] ||
        "normal"
    );
  }

  if (
    id.startsWith(
      "queue_leave|"
    )
  ) {
    const parts =
      id.split("|");

    return leaveQueue(
      interaction,
      parts[1],
      parts[2],
      Number(parts[3]),
      parts[4] ||
        "normal"
    );
  }

  if (
    id ===
      "mediator_queue_join" ||
    id ===
      "mediator_queue_leave"
  ) {
    return handleMediatorQueueButton(
      interaction
    );
  }

  if (
    id.startsWith(
      "bet_confirm|"
    )
  ) {
    const parts =
      id.split("|");

    return handleBetConfirm(
      interaction,
      parts[1]
    );
  }

  if (
    id.startsWith(
      "bet_cancel|"
    )
  ) {
    const parts =
      id.split("|");

    return handleBetCancel(
      interaction,
      parts[1]
    );
  }

  if (
    id.startsWith(
      "copy_room_id|"
    )
  ) {
    const parts =
      id.split("|");

    return handleCopyRoomData(
      interaction,
      parts[1],
      "room_id"
    );
  }

  if (
    id.startsWith(
      "copy_room_password|"
    )
  ) {
    const parts =
      id.split("|");

    return handleCopyRoomData(
      interaction,
      parts[1],
      "room_password"
    );
  }

  if (
    id.startsWith(
      "med_winner|"
    )
  ) {
    const parts =
      id.split("|");

    return handleMediatorWinner(
      interaction,
      parts[1],
      parts[2]
    );
  }

  if (
    id.startsWith(
      "config_"
    ) ||
    id ===
      "appearance_avatar" ||
    id ===
      "appearance_color" ||
    id ===
      "pix_add" ||
    id ===
      "pix_list" ||
    id ===
      "publish_mediator_queue"
  ) {
    return handleConfigButton(
      interaction
    );
  }

  return sendSafeReply(
    interaction,
    {
      content:
        "❌ Botão desconhecido.",
      ephemeral: true,
    }
  );
}async function handleSelectMenu(
  interaction
) {
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

  return sendSafeReply(
    interaction,
    {
      content:
        "❌ Menu desconhecido.",
      ephemeral: true,
    }
  );
}

async function handleCommand(
  message
) {
  if (
    !message ||
    message.author?.bot
  ) {
    return;
  }

  const content =
    message.content.trim();

  if (!content) {
    return;
  }

  if (
    content.toLowerCase() ===
    ".conf"
  ) {
    if (
      !message.guild
    ) {
      return;
    }

    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Você precisa ser administrador para usar este comando."
      );
    }

    return message.reply({
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
    content.toLowerCase() ===
    ".ssmob"
  ) {
    if (
      !message.guild
    ) {
      return;
    }

    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Você precisa ser administrador."
      );
    }

    await message.reply(
      "⏳ Criando as filas mobile..."
    );

    const modes = [
      "mobile",
    ];

    for (
      const mode of modes
    ) {
      for (
        const value of VALUES
      ) {
        const normalMessage =
          await message.channel.send({
            embeds: [
              queueEmbed(
                message.guild.id,
                "1x1",
                mode,
                value,
                "normal"
              ),
            ],
            components:
              queueButtons(
                "1x1",
                mode,
                value,
                "normal"
              ),
          });

        registerQueueMessage(
          message.guild.id,
          "1x1",
          mode,
          value,
          "normal",
          normalMessage.id,
          normalMessage.channel.id
        );

        const infiniteMessage =
          await message.channel.send({
            embeds: [
              queueEmbed(
                message.guild.id,
                "1x1",
                mode,
                value,
                "ice_infinite"
              ),
            ],
            components:
              queueButtons(
                "1x1",
                mode,
                value,
                "ice_infinite"
              ),
          });

        registerQueueMessage(
          message.guild.id,
          "1x1",
          mode,
          value,
          "ice_infinite",
          infiniteMessage.id,
          infiniteMessage.channel.id
        );
      }
    }

    saveDatabase();

    return;
  }

  if (
    content.toLowerCase() ===
    ".ssemu"
  ) {
    if (
      !message.guild
    ) {
      return;
    }

    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Você precisa ser administrador."
      );
    }

    await message.reply(
      "⏳ Criando as filas de emulador..."
    );

    const mode =
      "emulator";

    const formats = [
      "1x1",
      "2x2",
      "3x3",
      "4x4",
      "misto",
    ];

    for (
      const format of formats
    ) {
      for (
        const value of VALUES
      ) {
        const types =
          format === "1x1"
            ? [
                "normal",
                "ice_infinite",
              ]
            : [
                "normal",
              ];

        for (
          const type of types
        ) {
          const queueMessage =
            await message.channel.send({
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

          registerQueueMessage(
            message.guild.id,
            format,
            mode,
            value,
            type,
            queueMessage.id,
            queueMessage.channel.id
          );
        }
      }
    }

    saveDatabase();

    return;
  }
}

client.once(
  "ready",
  async () => {
    console.log(
      `🤖 Bot online como ${client.user.tag}`
    );

    try {
      const rest =
        new REST({
          version:
            "10",
        }).setToken(
          TOKEN
        );

      const commands = [
        new SlashCommandBuilder()
          .setName(
            "conf"
          )
          .setDescription(
            "Abrir painel de configuração do bot"
          )
          .toJSON(),
      ];

      await rest.put(
        Routes.applicationGuildCommands(
          CLIENT_ID,
          GUILD_ID
        ),
        {
          body:
            commands,
        }
      );

      console.log(
        "✅ Comandos slash registrados."
      );
    } catch (error) {
      console.error(
        "❌ Erro ao registrar comandos slash:",
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
        return await handleButton(
          interaction
        );
      }

      if (
        interaction.isAnySelectMenu()
      ) {
        return await handleSelectMenu(
          interaction
        );
      }

      if (
        interaction.isModalSubmit()
      ) {
        return await handleModalSubmit(
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
            !interaction.guild
          ) {
            return interaction.reply({
              content:
                "❌ Esse comando só pode ser usado em um servidor.",
              ephemeral: true,
            });
          }

          if (
            !isAdministrator(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Você precisa ser administrador.",
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
          });
        }
      }
    } catch (error) {
      console.error(
        "❌ Erro em interactionCreate:",
        error
      );

      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Ocorreu um erro ao processar essa interação.",
          ephemeral: true,
        }
      );
    }
  }
);

client.on(
  "messageCreate",
  async (
    message
  ) => {
    try {
      if (
        !message ||
        message.author?.bot
      ) {
        return;
      }

      if (
        message.guild
      ) {
        const bet =
          Object.values(
            db.bets || {}
          ).find(
            (item) =>
              item &&
              item.guildId ===
                message.guild.id &&
              item.channelId ===
                message.channel.id &&
              !item.finished &&
              !item.cancelled
          );

        if (bet) {
          const handled =
            await handleRoomCredentials(
              message,
              bet
            );

          if (
            handled
          ) {
            return;
          }
        }
      }

      await handleCommand(
        message
      );
    } catch (error) {
      console.error(
        "❌ Erro em messageCreate:",
        error
      );
    }
  }
);

client.on(
  "error",
  (error) => {
    console.error(
      "❌ Erro do cliente Discord:",
      error
    );
  }
);

process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "❌ Unhandled Promise Rejection:",
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

client.login(
  TOKEN
)
  .then(
    () => {
      console.log(
        "✅ Login no Discord realizado."
      );
    }
  )
  .catch(
    (error) => {
      console.error(
        "❌ Erro ao fazer login no Discord:",
        error
      );
    }
  );
