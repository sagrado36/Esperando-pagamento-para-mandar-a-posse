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
  /*
   * No 1x1 cada mensagem representa uma fila específica.
   * Portanto, não colocamos os dois tipos de gelo na mesma mensagem.
   */
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
}async function createPrivateBetChannel(
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
    mediatorIds[
      rotationIndex
    ];

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

  for (
    const userId of uniqueUsers
  ) {
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

      type:
        ChannelType.GuildText,

      parent: category.id,

      permissionOverwrites:
        overwrites,
    });

  db.bets[betId] = {
    id: betId,

    guildId:
      guild.id,

    channelId:
      channel.id,

    format,

    mode,

    value:
      Number(value),

    players: [
      ...players,
    ],

    player1:
      players[0],

    player2:
      players[1],

    mediator,

    confirmed: [],

    cancelled: false,

    finished: false,

    roomCreated: false,

    roomId: null,

    roomPassword: null,

    createdAt:
      Date.now(),

    admFee:
      config.admFee,
  };

  saveDatabase();

  const mentions = [
    ...new Set([
      ...players.map(
        (id) =>
          `<@${id}>`
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

async function createQueueMessage(
  channel,
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
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

  if (
    !config.queueMessages
  ) {
    config.queueMessages = {};
  }

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
    requiredPlayers(
      format
    );

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

  /*
   * Remove o jogador de qualquer outra fila.
   * Isso evita que o mesmo jogador fique em duas filas.
   */
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

  /*
   * Se a fila ainda não estiver cheia,
   * apenas atualizamos a mensagem.
   */
  if (
    queue.length < needed
  ) {
    await refreshQueueMessage(
      interaction.message
    );

    return sendSafeReply(
      interaction,
      {
        content:
          "✅ Você entrou na fila.",
        ephemeral: true,
      }
    );
  }

  /*
   * A fila chegou ao limite.
   * Copiamos os jogadores antes de limpar a fila.
   */
  const players =
    [...queue];

  queue.length = 0;

  saveDatabase();

  /*
   * Agora a mensagem pública volta para 0/N.
   */
  await refreshQueueMessage(
    interaction.message
  );

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

    /*
     * Se a criação da aposta falhar,
     * devolvemos os jogadores à fila.
     */
    for (
      const id of players
    ) {
      queue.push(id);
    }

    saveDatabase();

    await refreshQueueMessage(
      interaction.message
    );

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
    );
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
      Number(bet.value) *
        Number(
          Array.isArray(bet.players)
            ? bet.players.length
            : 2
        )
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

  const playerCount =
    Array.isArray(
      bet.players
    )
      ? bet.players.length
      : 2;

  const total =
    Number(bet.value) *
    playerCount;

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
}async function handleConfigButton(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Este comando só pode ser usado em um servidor.",
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
          "❌ Apenas administradores podem usar esta configuração.",
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
    return sendSafeReply(
      interaction,
      {
        embeds: [
          configMainEmbed(
            guild
          ),
        ],
        components:
          configButtons(),
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
          createEmbed(
            guild.id,
            "🎭 CONFIGURAÇÃO DE CARGOS",
            "Selecione abaixo o cargo de **Mediador** e o cargo de **Analista**."
          ),
        ],
        components:
          roleConfigComponents(),
      }
    );
  }

  if (
    id ===
    "config_pix"
  ) {
    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "💳 CONFIGURAÇÃO DO PIX",
            "Cadastre os ADMs responsáveis pelo recebimento das apostas."
          ),
        ],
        components:
          pixComponents(),
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
            guild.id,
            "📢 CONFIGURAÇÃO DE CANAIS",
            "Selecione os canais usados pelos comandos `.ssmob` e `.ssemu`."
          ),
        ],
        components:
          channelConfigComponents(),
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
            guild.id,
            "🎲 CONFIGURAÇÃO DAS APOSTAS",
            "Selecione a categoria onde os canais privados das apostas serão criados."
          ),
        ],
        components:
          betConfigComponents(),
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
            guild.id,
            "🛡️ CONFIGURAÇÃO DOS MEDIADORES",
            "Selecione o canal onde ficará a fila de mediadores."
          ),
        ],
        components:
          mediatorConfigComponents(),
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
            guild.id,
            "🎨 APARÊNCIA",
            "Configure a foto do bot e a cor das embeds."
          ),
        ],
        components:
          appearanceComponents(),
      }
    );
  }

  if (
    id ===
    "config_fee"
  ) {
    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "💸 TAXA DO ADM",
            "Selecione o valor da taxa administrativa."
          ),
        ],
        components:
          feeComponents(),
      }
    );
  }

  if (
    id ===
    "config_queue"
  ) {
    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "🎰 CONFIGURAÇÃO DAS FILAS",
            "As filas são criadas pelos comandos `.ssmob` e `.ssemu` usando os formatos e valores configurados."
          ),
        ],
        components: [
          backButton(),
        ],
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      content:
        "❌ Opção de configuração desconhecida.",
      ephemeral: true,
    }
  );
}

async function handleRoleSelect(
  interaction
) {
  const guild =
    interaction.guild;

  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem configurar os cargos.",
        ephemeral: true,
      }
    );
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

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ CARGO CONFIGURADO",
            `O cargo de mediador foi definido como <@&${config.mediatorRoleId}>.`
          ),
        ],
        components:
          backButton(),
      }
    );
  }

  if (
    interaction.customId ===
    "select_analyst_role"
  ) {
    config.analystRoleId =
      interaction.values[0];

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ CARGO CONFIGURADO",
            `O cargo de analista foi definido como <@&${config.analystRoleId}>.`
          ),
        ],
        components:
          backButton(),
      }
    );
  }
}

async function handleChannelSelect(
  interaction
) {
  const guild =
    interaction.guild;

  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem configurar os canais.",
        ephemeral: true,
      }
    );
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
      interaction.values[0];

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ CANAL CONFIGURADO",
            `O canal do \`.ssmob\` foi definido como <#${config.analysisChannelMobile}>.`
          ),
        ],
        components:
          backButton(),
      }
    );
  }

  if (
    interaction.customId ===
    "select_channel_emulator"
  ) {
    config.analysisChannelEmulator =
      interaction.values[0];

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ CANAL CONFIGURADO",
            `O canal do \`.ssemu\` foi definido como <#${config.analysisChannelEmulator}>.`
          ),
        ],
        components:
          backButton(),
      }
    );
  }

  if (
    interaction.customId ===
    "select_bets_category"
  ) {
    config.betsCategoryId =
      interaction.values[0];

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ CATEGORIA CONFIGURADA",
            `A categoria das apostas foi definida como <#${config.betsCategoryId}>.`
          ),
        ],
        components:
          backButton(),
      }
    );
  }

  if (
    interaction.customId ===
    "select_mediator_channel"
  ) {
    config.mediatorQueueChannelId =
      interaction.values[0];

    saveDatabase();

    await refreshMediatorQueueMessage(
      guild
    );

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ CANAL CONFIGURADO",
            `O canal da fila de mediadores foi definido como <#${config.mediatorQueueChannelId}>.`
          ),
        ],
        components:
          backButton(),
      }
    );
  }
}

async function handleStringSelect(
  interaction
) {
  const guild =
    interaction.guild;

  if (
    interaction.customId ===
    "select_adm_fee"
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
            "❌ Apenas administradores podem configurar a taxa.",
          ephemeral: true,
        }
      );
    }

    const config =
      getGuildConfig(
        guild.id
      );

    config.admFee =
      Number(
        interaction.values[0]
      );

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ TAXA ATUALIZADA",
            `A taxa do ADM foi definida para **${formatMoney(
              config.admFee
            )}**.`
          ),
        ],
        components:
          backButton(),
      }
    );
  }

  if (
    interaction.customId.startsWith(
      "med_menu|"
    )
  ) {
    const betId =
      interaction.customId.split(
        "|"
      )[1];

    const bet =
      getBet(
        betId
      );

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
      !mediatorBelongsToBet(
        bet,
        interaction.user.id
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Você não é o mediador desta aposta.",
          ephemeral: true,
        }
      );
    }

    const action =
      interaction.values[0];

    if (
      action ===
      "winner"
    ) {
      return sendSafeReply(
        interaction,
        {
          embeds: [
            createEmbed(
              bet.guildId,
              "🏆 ESCOLHER VENCEDOR",
              "Selecione qual jogador venceu a partida."
            ),
          ],
          components:
            winnerButtons(
              betId,
              bet
            ),
        }
      );
    }

    if (
      action ===
      "wo"
    ) {
      return handleWO(
        interaction,
        bet
      );
    }

    if (
      action ===
      "finish"
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

      bet.finished =
        true;

      saveDatabase();

      return sendSafeReply(
        interaction,
        {
          embeds: [
            createEmbed(
              bet.guildId,
              "✅ APOSTA FINALIZADA",
              "A aposta foi finalizada pelo mediador."
            ),
          ],
        }
      );
    }
  }
}

async function handleModalSubmit(
  interaction
) {
  const guild =
    interaction.guild;

  if (
    interaction.customId ===
    "pix_modal"
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
            "❌ Apenas administradores podem cadastrar Pix.",
          ephemeral: true,
        }
      );
    }

    const config =
      getGuildConfig(
        guild.id
      );

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
        generateId(
          "pix"
        ),
      name,
      key,
      qr:
        qr || null,
    });

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ PIX CADASTRADO",
            `O ADM **${name}** foi cadastrado com sucesso.`
          ),
        ],
      }
    );
  }

  if (
    interaction.customId ===
    "avatar_modal"
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
            "❌ Apenas administradores podem alterar a foto.",
          ephemeral: true,
        }
      );
    }

    const url =
      interaction.fields.getTextInputValue(
        "avatar_url"
      );

    const config =
      getGuildConfig(
        guild.id
      );

    config.botAvatar =
      url;

    saveDatabase();

    try {
      await guild.members.me?.setAvatar(
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
        embeds: [
          createEmbed(
            guild.id,
            "✅ FOTO ATUALIZADA",
            "A foto do bot foi atualizada."
          ),
        ],
      }
    );
  }

  if (
    interaction.customId ===
    "color_modal"
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
            "❌ Apenas administradores podem alterar a cor.",
          ephemeral: true,
        }
      );
    }

    const color =
      interaction.fields.getTextInputValue(
        "embed_color"
      );

    if (
      !/^#?[0-9A-Fa-f]{6}$/.test(
        color
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Cor inválida. Use um hexadecimal como `#5865F2`.",
          ephemeral: true,
        }
      );
    }

    const config =
      getGuildConfig(
        guild.id
      );

    config.embedColor =
      normalizeColor(
        color
      );

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ COR ATUALIZADA",
            `A cor das embeds foi definida para \`${config.embedColor}\`.`
          ),
        ],
      }
    );
  }
}

async function handleCommand(
  message
) {
  if (
    !message.guild ||
    message.author.bot
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

  const guild =
    message.guild;

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    command === "conf"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    return message.reply({
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
    command === "fila"
  ) {
    if (
      !hasMediatorRole(
        message.member,
        guild.id
      )
    ) {
      return message.reply(
        "❌ Apenas mediadores podem usar este comando."
      );
    }

    const mediatorQueue =
      getAvailableMediatorIds(
        guild
      );

    if (
      mediatorQueue.includes(
        message.author.id
      )
    ) {
      return message.reply(
        "❌ Você já está na fila de mediadores."
      );
    }

    mediatorQueue.push(
      message.author.id
    );

    config.mediatorQueue =
      mediatorQueue;

    saveDatabase();

    await refreshMediatorQueueMessage(
      guild
    );

    return message.reply(
      "✅ Você entrou na fila de mediadores."
    );
  }

  if (
    command === "sairfila"
  ) {
    const index =
      config.mediatorQueue.indexOf(
        message.author.id
      );

    if (
      index === -1
    ) {
      return message.reply(
        "❌ Você não está na fila de mediadores."
      );
    }

    config.mediatorQueue.splice(
      index,
      1
    );

    saveDatabase();

    await refreshMediatorQueueMessage(
      guild
    );

    return message.reply(
      "✅ Você saiu da fila de mediadores."
    );
  }

  if (
    command === "ssmob" ||
    command === "ssemu"
  ) {
    const mode =
      command === "ssmob"
        ? "mobile"
        : "emulador";

    if (
      !config.analysisChannelMobile &&
      mode === "mobile"
    ) {
      return message.reply(
        "❌ O canal do `.ssmob` ainda não foi configurado."
      );
    }

    if (
      !config.analysisChannelEmulator &&
      mode === "emulador"
    ) {
      return message.reply(
        "❌ O canal do `.ssemu` ainda não foi configurado."
      );
    }

    const targetChannelId =
      mode === "mobile"
        ? config.analysisChannelMobile
        : config.analysisChannelEmulator;

    if (
      message.channel.id !==
      targetChannelId
    ) {
      return message.reply(
        `❌ Este comando só pode ser usado em <#${targetChannelId}>.`
      );
    }

    const formats =
      [
        "1x1",
        "2x2",
        "3x3",
        "4x4",
      ];

    for (
      const format of formats
    ) {
      for (
        const value of VALUES
      ) {
        if (
          format === "1x1"
        ) {
          await createQueueMessage(
            message.channel,
            guild.id,
            format,
            mode,
            value,
            "ice_normal"
          );

          await createQueueMessage(
            message.channel,
            guild.id,
            format,
            mode,
            value,
            "ice_infinite"
          );

          continue;
        }

        await createQueueMessage(
          message.channel,
          guild.id,
          format,
          mode,
          value,
          "normal"
        );
      }
    }

    return;
  }

  if (
    command === "filaadm"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    if (
      !config.mediatorQueueChannelId
    ) {
      return message.reply(
        "❌ Configure primeiro o canal da fila de mediadores em `/conf`."
      );
    }

    const channel =
      guild.channels.cache.get(
        config.mediatorQueueChannelId
      );

    if (
      !channel
    ) {
      return message.reply(
        "❌ O canal configurado para a fila de mediadores não existe mais."
      );
    }

    return channel.send({
      embeds: [
        mediatorQueueEmbed(
          guild.id
        ),
      ],
      components:
        mediatorQueueButtons(),
    });
  }

  if (
    command === "status"
  ) {
    const user =
      getUserData(
        message.author.id
      );

    return message.reply({
      embeds: [
        createEmbed(
          guild.id,
          "📊 SEU STATUS",
          `👤 **Jogador:** ${message.author}\n\n` +
            `🏆 **Vitórias:** ${user.wins}\n` +
            `💀 **Derrotas:** ${user.losses}\n` +
            `🪙 **Moedas:** ${user.coins}`
        ),
      ],
    });
  }

  if (
    command === "ranking"
  ) {
    const users =
      Object.entries(
        db.users
      )
        .map(
          ([id, data]) => ({
            id,
            wins:
              Number(
                data.wins || 0
              ),
            losses:
              Number(
                data.losses || 0
              ),
            coins:
              Number(
                data.coins || 0
              ),
          })
        )
        .sort(
          (a, b) =>
            b.wins -
            a.wins
        )
        .slice(
          0,
          10
        );

    const ranking =
      users.length
        ? users
            .map(
              (user, index) =>
                `**${index + 1}.** <@${user.id}> — 🏆 ${user.wins} vitórias`
            )
            .join("\n")
        : "Nenhum jogador possui estatísticas ainda.";

    return message.reply({
      embeds: [
        createEmbed(
          guild.id,
          "🏆 RANKING",
          ranking
        ),
      ],
    });
  }

  if (
    command === "ajuda" ||
    command === "help"
  ) {
    return message.reply({
      embeds: [
        createEmbed(
          guild.id,
          "📖 COMANDOS",
          `**${PREFIX}conf** — Configuração do bot\n` +
            `**${PREFIX}ssmob** — Criar filas Mobile\n` +
            `**${PREFIX}ssemu** — Criar filas Emulador\n` +
            `**${PREFIX}filaadm** — Criar fila de mediadores\n` +
            `**${PREFIX}fila** — Entrar na fila de mediadores\n` +
            `**${PREFIX}sairfila** — Sair da fila de mediadores\n` +
            `**${PREFIX}status** — Ver suas estatísticas\n` +
            `**${PREFIX}ranking** — Ver ranking dos jogadores`
        ),
      ],
    });
  }
}async function handleConfigButton(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Este comando só pode ser usado em um servidor.",
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
          "❌ Apenas administradores podem usar esta configuração.",
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
    return sendSafeReply(
      interaction,
      {
        embeds: [
          configMainEmbed(
            guild
          ),
        ],
        components:
          configButtons(),
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
          createEmbed(
            guild.id,
            "🎭 CONFIGURAÇÃO DE CARGOS",
            "Selecione abaixo o cargo de **Mediador** e o cargo de **Analista**."
          ),
        ],
        components:
          roleConfigComponents(),
      }
    );
  }

  if (
    id ===
    "config_pix"
  ) {
    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "💳 CONFIGURAÇÃO DO PIX",
            "Cadastre os ADMs responsáveis pelo recebimento das apostas."
          ),
        ],
        components:
          pixComponents(),
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
            guild.id,
            "📢 CONFIGURAÇÃO DE CANAIS",
            "Selecione os canais usados pelos comandos `.ssmob` e `.ssemu`."
          ),
        ],
        components:
          channelConfigComponents(),
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
            guild.id,
            "🎲 CONFIGURAÇÃO DAS APOSTAS",
            "Selecione a categoria onde os canais privados das apostas serão criados."
          ),
        ],
        components:
          betConfigComponents(),
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
            guild.id,
            "🛡️ CONFIGURAÇÃO DOS MEDIADORES",
            "Selecione o canal onde ficará a fila de mediadores."
          ),
        ],
        components:
          mediatorConfigComponents(),
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
            guild.id,
            "🎨 APARÊNCIA",
            "Configure a foto do bot e a cor das embeds."
          ),
        ],
        components:
          appearanceComponents(),
      }
    );
  }

  if (
    id ===
    "config_fee"
  ) {
    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "💸 TAXA DO ADM",
            "Selecione o valor da taxa administrativa."
          ),
        ],
        components:
          feeComponents(),
      }
    );
  }

  if (
    id ===
    "config_queue"
  ) {
    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "🎰 CONFIGURAÇÃO DAS FILAS",
            "As filas são criadas pelos comandos `.ssmob` e `.ssemu` usando os formatos e valores configurados."
          ),
        ],
        components: [
          backButton(),
        ],
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      content:
        "❌ Opção de configuração desconhecida.",
      ephemeral: true,
    }
  );
}

async function handleRoleSelect(
  interaction
) {
  const guild =
    interaction.guild;

  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem configurar os cargos.",
        ephemeral: true,
      }
    );
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

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ CARGO CONFIGURADO",
            `O cargo de mediador foi definido como <@&${config.mediatorRoleId}>.`
          ),
        ],
        components:
          backButton(),
      }
    );
  }

  if (
    interaction.customId ===
    "select_analyst_role"
  ) {
    config.analystRoleId =
      interaction.values[0];

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ CARGO CONFIGURADO",
            `O cargo de analista foi definido como <@&${config.analystRoleId}>.`
          ),
        ],
        components:
          backButton(),
      }
    );
  }
}

async function handleChannelSelect(
  interaction
) {
  const guild =
    interaction.guild;

  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem configurar os canais.",
        ephemeral: true,
      }
    );
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
      interaction.values[0];

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ CANAL CONFIGURADO",
            `O canal do \`.ssmob\` foi definido como <#${config.analysisChannelMobile}>.`
          ),
        ],
        components:
          backButton(),
      }
    );
  }

  if (
    interaction.customId ===
    "select_channel_emulator"
  ) {
    config.analysisChannelEmulator =
      interaction.values[0];

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ CANAL CONFIGURADO",
            `O canal do \`.ssemu\` foi definido como <#${config.analysisChannelEmulator}>.`
          ),
        ],
        components:
          backButton(),
      }
    );
  }

  if (
    interaction.customId ===
    "select_bets_category"
  ) {
    config.betsCategoryId =
      interaction.values[0];

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ CATEGORIA CONFIGURADA",
            `A categoria das apostas foi definida como <#${config.betsCategoryId}>.`
          ),
        ],
        components:
          backButton(),
      }
    );
  }

  if (
    interaction.customId ===
    "select_mediator_channel"
  ) {
    config.mediatorQueueChannelId =
      interaction.values[0];

    saveDatabase();

    await refreshMediatorQueueMessage(
      guild
    );

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ CANAL CONFIGURADO",
            `O canal da fila de mediadores foi definido como <#${config.mediatorQueueChannelId}>.`
          ),
        ],
        components:
          backButton(),
      }
    );
  }
}

async function handleStringSelect(
  interaction
) {
  const guild =
    interaction.guild;

  if (
    interaction.customId ===
    "select_adm_fee"
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
            "❌ Apenas administradores podem configurar a taxa.",
          ephemeral: true,
        }
      );
    }

    const config =
      getGuildConfig(
        guild.id
      );

    config.admFee =
      Number(
        interaction.values[0]
      );

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ TAXA ATUALIZADA",
            `A taxa do ADM foi definida para **${formatMoney(
              config.admFee
            )}**.`
          ),
        ],
        components:
          backButton(),
      }
    );
  }

  if (
    interaction.customId.startsWith(
      "med_menu|"
    )
  ) {
    const betId =
      interaction.customId.split(
        "|"
      )[1];

    const bet =
      getBet(
        betId
      );

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
      !mediatorBelongsToBet(
        bet,
        interaction.user.id
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Você não é o mediador desta aposta.",
          ephemeral: true,
        }
      );
    }

    const action =
      interaction.values[0];

    if (
      action ===
      "winner"
    ) {
      return sendSafeReply(
        interaction,
        {
          embeds: [
            createEmbed(
              bet.guildId,
              "🏆 ESCOLHER VENCEDOR",
              "Selecione qual jogador venceu a partida."
            ),
          ],
          components:
            winnerButtons(
              betId,
              bet
            ),
        }
      );
    }

    if (
      action ===
      "wo"
    ) {
      return handleWO(
        interaction,
        bet
      );
    }

    if (
      action ===
      "finish"
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

      bet.finished =
        true;

      saveDatabase();

      return sendSafeReply(
        interaction,
        {
          embeds: [
            createEmbed(
              bet.guildId,
              "✅ APOSTA FINALIZADA",
              "A aposta foi finalizada pelo mediador."
            ),
          ],
        }
      );
    }
  }
}

async function handleModalSubmit(
  interaction
) {
  const guild =
    interaction.guild;

  if (
    interaction.customId ===
    "pix_modal"
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
            "❌ Apenas administradores podem cadastrar Pix.",
          ephemeral: true,
        }
      );
    }

    const config =
      getGuildConfig(
        guild.id
      );

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
        generateId(
          "pix"
        ),
      name,
      key,
      qr:
        qr || null,
    });

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ PIX CADASTRADO",
            `O ADM **${name}** foi cadastrado com sucesso.`
          ),
        ],
      }
    );
  }

  if (
    interaction.customId ===
    "avatar_modal"
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
            "❌ Apenas administradores podem alterar a foto.",
          ephemeral: true,
        }
      );
    }

    const url =
      interaction.fields.getTextInputValue(
        "avatar_url"
      );

    const config =
      getGuildConfig(
        guild.id
      );

    config.botAvatar =
      url;

    saveDatabase();

    try {
      await guild.members.me?.setAvatar(
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
        embeds: [
          createEmbed(
            guild.id,
            "✅ FOTO ATUALIZADA",
            "A foto do bot foi atualizada."
          ),
        ],
      }
    );
  }

  if (
    interaction.customId ===
    "color_modal"
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
            "❌ Apenas administradores podem alterar a cor.",
          ephemeral: true,
        }
      );
    }

    const color =
      interaction.fields.getTextInputValue(
        "embed_color"
      );

    if (
      !/^#?[0-9A-Fa-f]{6}$/.test(
        color
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Cor inválida. Use um hexadecimal como `#5865F2`.",
          ephemeral: true,
        }
      );
    }

    const config =
      getGuildConfig(
        guild.id
      );

    config.embedColor =
      normalizeColor(
        color
      );

    saveDatabase();

    return sendSafeReply(
      interaction,
      {
        embeds: [
          createEmbed(
            guild.id,
            "✅ COR ATUALIZADA",
            `A cor das embeds foi definida para \`${config.embedColor}\`.`
          ),
        ],
      }
    );
  }
}

async function handleCommand(
  message
) {
  if (
    !message.guild ||
    message.author.bot
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

  const guild =
    message.guild;

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    command === "conf"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    return message.reply({
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
    command === "fila"
  ) {
    if (
      !hasMediatorRole(
        message.member,
        guild.id
      )
    ) {
      return message.reply(
        "❌ Apenas mediadores podem usar este comando."
      );
    }

    const mediatorQueue =
      getAvailableMediatorIds(
        guild
      );

    if (
      mediatorQueue.includes(
        message.author.id
      )
    ) {
      return message.reply(
        "❌ Você já está na fila de mediadores."
      );
    }

    mediatorQueue.push(
      message.author.id
    );

    config.mediatorQueue =
      mediatorQueue;

    saveDatabase();

    await refreshMediatorQueueMessage(
      guild
    );

    return message.reply(
      "✅ Você entrou na fila de mediadores."
    );
  }

  if (
    command === "sairfila"
  ) {
    const index =
      config.mediatorQueue.indexOf(
        message.author.id
      );

    if (
      index === -1
    ) {
      return message.reply(
        "❌ Você não está na fila de mediadores."
      );
    }

    config.mediatorQueue.splice(
      index,
      1
    );

    saveDatabase();

    await refreshMediatorQueueMessage(
      guild
    );

    return message.reply(
      "✅ Você saiu da fila de mediadores."
    );
  }

  if (
    command === "ssmob" ||
    command === "ssemu"
  ) {
    const mode =
      command === "ssmob"
        ? "mobile"
        : "emulador";

    if (
      !config.analysisChannelMobile &&
      mode === "mobile"
    ) {
      return message.reply(
        "❌ O canal do `.ssmob` ainda não foi configurado."
      );
    }

    if (
      !config.analysisChannelEmulator &&
      mode === "emulador"
    ) {
      return message.reply(
        "❌ O canal do `.ssemu` ainda não foi configurado."
      );
    }

    const targetChannelId =
      mode === "mobile"
        ? config.analysisChannelMobile
        : config.analysisChannelEmulator;

    if (
      message.channel.id !==
      targetChannelId
    ) {
      return message.reply(
        `❌ Este comando só pode ser usado em <#${targetChannelId}>.`
      );
    }

    const formats =
      [
        "1x1",
        "2x2",
        "3x3",
        "4x4",
      ];

    for (
      const format of formats
    ) {
      for (
        const value of VALUES
      ) {
        if (
          format === "1x1"
        ) {
          await createQueueMessage(
            message.channel,
            guild.id,
            format,
            mode,
            value,
            "ice_normal"
          );

          await createQueueMessage(
            message.channel,
            guild.id,
            format,
            mode,
            value,
            "ice_infinite"
          );

          continue;
        }

        await createQueueMessage(
          message.channel,
          guild.id,
          format,
          mode,
          value,
          "normal"
        );
      }
    }

    return;
  }

  if (
    command === "filaadm"
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    if (
      !config.mediatorQueueChannelId
    ) {
      return message.reply(
        "❌ Configure primeiro o canal da fila de mediadores em `/conf`."
      );
    }

    const channel =
      guild.channels.cache.get(
        config.mediatorQueueChannelId
      );

    if (
      !channel
    ) {
      return message.reply(
        "❌ O canal configurado para a fila de mediadores não existe mais."
      );
    }

    return channel.send({
      embeds: [
        mediatorQueueEmbed(
          guild.id
        ),
      ],
      components:
        mediatorQueueButtons(),
    });
  }

  if (
    command === "status"
  ) {
    const user =
      getUserData(
        message.author.id
      );

    return message.reply({
      embeds: [
        createEmbed(
          guild.id,
          "📊 SEU STATUS",
          `👤 **Jogador:** ${message.author}\n\n` +
            `🏆 **Vitórias:** ${user.wins}\n` +
            `💀 **Derrotas:** ${user.losses}\n` +
            `🪙 **Moedas:** ${user.coins}`
        ),
      ],
    });
  }

  if (
    command === "ranking"
  ) {
    const users =
      Object.entries(
        db.users
      )
        .map(
          ([id, data]) => ({
            id,
            wins:
              Number(
                data.wins || 0
              ),
            losses:
              Number(
                data.losses || 0
              ),
            coins:
              Number(
                data.coins || 0
              ),
          })
        )
        .sort(
          (a, b) =>
            b.wins -
            a.wins
        )
        .slice(
          0,
          10
        );

    const ranking =
      users.length
        ? users
            .map(
              (user, index) =>
                `**${index + 1}.** <@${user.id}> — 🏆 ${user.wins} vitórias`
            )
            .join("\n")
        : "Nenhum jogador possui estatísticas ainda.";

    return message.reply({
      embeds: [
        createEmbed(
          guild.id,
          "🏆 RANKING",
          ranking
        ),
      ],
    });
  }

  if (
    command === "ajuda" ||
    command === "help"
  ) {
    return message.reply({
      embeds: [
        createEmbed(
          guild.id,
          "📖 COMANDOS",
          `**${PREFIX}conf** — Configuração do bot\n` +
            `**${PREFIX}ssmob** — Criar filas Mobile\n` +
            `**${PREFIX}ssemu** — Criar filas Emulador\n` +
            `**${PREFIX}filaadm** — Criar fila de mediadores\n` +
            `**${PREFIX}fila** — Entrar na fila de mediadores\n` +
            `**${PREFIX}sairfila** — Sair da fila de mediadores\n` +
            `**${PREFIX}status** — Ver suas estatísticas\n` +
            `**${PREFIX}ranking** — Ver ranking dos jogadores`
        ),
      ],
    });
  }
}
client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    console.log(`🤖 Bot online como ${client.user.tag}`);
  })
  .catch((error) => {
    console.error("❌ Erro ao fazer login:", error);
  });
