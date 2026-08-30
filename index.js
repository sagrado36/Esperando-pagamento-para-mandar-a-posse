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
  console.error("Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID no arquivo .env");
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

let db = loadDatabase();

function loadDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return structuredClone(DEFAULT_DB);
    }

    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return {
      ...structuredClone(DEFAULT_DB),
      ...parsed,
      guilds: parsed.guilds || {},
      users: parsed.users || {},
      queues: parsed.queues || {},
      bets: parsed.bets || {},
      analyses: parsed.analyses || {},
    };
  } catch (error) {
    console.error("Erro ao carregar database:", error);
    return structuredClone(DEFAULT_DB);
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
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

const FORMATS = ["1x1", "2x2", "3x3", "4x4"];
const MODES = ["mobile", "emulador", "misto"];

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

  return db.guilds[guildId];
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
  return `R$ ${(Number(cents) / 100).toFixed(2).replace(".", ",")}`;
}

function cleanChannelMoneyName(cents) {
  return `pagar-${String(Math.round(Number(cents) / 100)).replace(
    /\D/g,
    ""
  )}-reais`;
}

function normalizeColor(color) {
  if (!color) return "#000000";

  const value = String(color).trim();

  if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
    return value;
  }

  if (/^[0-9A-Fa-f]{6}$/.test(value)) {
    return `#${value}`;
  }

  return "#000000";
}

function createEmbed(guildId, title, description) {
  const config = getGuildConfig(guildId);

  return new EmbedBuilder()
    .setColor(normalizeColor(config.embedColor))
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function createSmallEmbed(guildId, title, description) {
  return createEmbed(guildId, title, description);
}

function isAdministrator(member) {
  return Boolean(
    member &&
      member.permissions &&
      member.permissions.has(PermissionsBitField.Flags.Administrator)
  );
}

function hasMediatorRole(member, guildId) {
  const config = getGuildConfig(guildId);

  if (!config.mediatorRoleId) return false;

  return Boolean(member?.roles?.cache?.has(config.mediatorRoleId));
}

function hasAnalystRole(member, guildId) {
  const config = getGuildConfig(guildId);

  if (!config.analystRoleId) return false;

  return Boolean(member?.roles?.cache?.has(config.analystRoleId));
}

function teamSize(format) {
  const value = Number(String(format).split("x")[0]);

  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }

  return value;
}

function requiredPlayers(format) {
  return teamSize(format) * 2;
}

function makeQueueKey(guildId, format, mode, value, type = "normal") {
  return [
    guildId,
    format,
    mode,
    Number(value),
    type,
  ].join("|");
}

function getQueue(guildId, format, mode, value, type = "normal") {
  const key = makeQueueKey(guildId, format, mode, value, type);

  if (!db.queues[key]) {
    db.queues[key] = [];
  }

  return db.queues[key];
}

function queueEmbed(guildId, format, mode, value, type = "normal") {
  const queue = getQueue(guildId, format, mode, value, type);

  const titleType =
    type === "infinite" ? "FILA INFINITO" : "FILA NORMAL";

  return createSmallEmbed(
    guildId,
    `🎮 ${format} • ${mode.toUpperCase()} • ${formatMoney(value)}`,
    `**${titleType}**\n\n` +
      `Entre na fila e aguarde os jogadores necessários.\n\n` +
      `👥 **Jogadores na fila:** ${queue.length}/${requiredPlayers(
        format
      )}\n\n` +
      `💰 **Valor por jogador:** ${formatMoney(value)}`
  );
}

function queueButtons(format, mode, value, type = "normal") {
  if (format === "1x1") {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `queue_join|${format}|${mode}|${value}|normal`
          )
          .setLabel("Normal")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(
            `queue_join|${format}|${mode}|${value}|infinite`
          )
          .setLabel("Fila Infinito")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(
            `queue_leave|${format}|${mode}|${value}|${type}`
          )
          .setLabel("Sair da fila")
          .setStyle(ButtonStyle.Danger)
      ),
    ];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `queue_join|${format}|${mode}|${value}|normal`
        )
        .setLabel("Entrar na fila")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          `queue_leave|${format}|${mode}|${value}|normal`
        )
        .setLabel("Sair da fila")
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function mediatorQueueEmbed(guildId) {
  const config = getGuildConfig(guildId);

  const queue = Array.isArray(config.mediatorQueue)
    ? config.mediatorQueue
    : [];

  const mentions =
    queue.length > 0
      ? queue.map((id, index) => `${index + 1}. <@${id}>`).join("\n")
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
        .setCustomId("mediator_queue_join")
        .setLabel("Entrar na fila")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("mediator_queue_leave")
        .setLabel("Sair da fila")
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function configMainEmbed(guild) {
  const config = getGuildConfig(guild.id);

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
      `💸 **Taxa do ADM:** ${formatMoney(config.admFee)}`
  );
}

function configButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_roles")
        .setLabel("Cargos")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_pix")
        .setLabel("Pix")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_channels")
        .setLabel("Canais")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_bets")
        .setLabel("Apostas")
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_mediators")
        .setLabel("Mediadores")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_appearance")
        .setLabel("Aparência")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_fee")
        .setLabel("Taxa")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_queue")
        .setLabel("Filas")
        .setStyle(ButtonStyle.Primary)
    ),
  ];
}

function backButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("config_back")
      .setLabel("Voltar")
      .setStyle(ButtonStyle.Secondary)
  );
}

function roleConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("select_mediator_role")
        .setPlaceholder("Selecione o cargo Mediador")
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("select_analyst_role")
        .setPlaceholder("Selecione o cargo Analista")
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
        .setCustomId("select_channel_mobile")
        .setPlaceholder("Selecione o Canal 1 — .ssmob")
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("select_channel_emulator")
        .setPlaceholder("Selecione o Canal 2 — .ssemu")
        .setChannelTypes(ChannelType.GuildText)
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
        .setChannelTypes(ChannelType.GuildCategory)
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
        .setChannelTypes(ChannelType.GuildText)
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
        .setCustomId("select_adm_fee")
        .setPlaceholder("Selecione a taxa do ADM")
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

function getAvailableMediatorIds(guild) {
  const config = getGuildConfig(guild.id);

  const currentQueue = Array.isArray(config.mediatorQueue)
    ? config.mediatorQueue
    : [];

  const valid = [];

  for (const userId of currentQueue) {
    const member = guild.members.cache.get(userId);

    if (
      member &&
      !member.user.bot &&
      hasMediatorRole(member, guild.id)
    ) {
      valid.push(userId);
    }
  }

  config.mediatorQueue = valid;

  return valid;
}

async function refreshMediatorQueueMessage(guild) {
  const config = getGuildConfig(guild.id);

  if (!config.mediatorQueueChannelId) return;

  const channel = guild.channels.cache.get(
    config.mediatorQueueChannelId
  );

  if (!channel || channel.type !== ChannelType.GuildText) {
    return;
  }

  const messages = await channel.messages
    .fetch({ limit: 50 })
    .catch(() => null);

  if (!messages) return;

  const message = messages.find(
    (m) =>
      m.author.id === client.user.id &&
      m.components.some((row) =>
        row.components.some(
          (component) =>
            component.customId === "mediator_queue_join"
        )
      )
  );

  if (!message) return;

  await message
    .edit({
      embeds: [mediatorQueueEmbed(guild.id)],
      components: mediatorQueueButtons(),
    })
    .catch(() => {});
}

async function refreshQueueMessage(message) {
  if (!message || !message.components?.length) return;

  const firstRow = message.components[0];

  const component = firstRow.components.find((x) =>
    String(x.customId || "").startsWith("queue_join|")
  );

  if (!component) return;

  const parts = component.customId.split("|");

  if (parts.length < 5) return;

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
      components: queueButtons(
        format,
        mode,
        value,
        type
      ),
    })
    .catch(() => {});
}

function getBetByChannel(channelId) {
  return Object.values(db.bets).find(
    (bet) =>
      bet.channelId === channelId &&
      !bet.finished &&
      !bet.cancelled
  );
}

function getBet(id) {
  return db.bets[id] || null;
}

function playerBelongsToBet(bet, userId) {
  return (
    bet.player1 === userId ||
    bet.player2 === userId
  );
}

function mediatorBelongsToBet(bet, userId) {
  return bet.mediator === userId;
}

async function sendSafeReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.followUp(payload);
    }

    return await interaction.reply(payload);
  } catch (error) {
    console.error("Erro ao responder interação:", error);
  }
}

async function sendPixData(channel, guildId, bet) {
  const config = getGuildConfig(guildId);

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
    `**Valor total:** ${formatMoney(bet.value * 2)}\n\n` +
    `Após o pagamento, aguarde a orientação do mediador.`;

  const paymentEmbed = createEmbed(
    guildId,
    "💳 PAGAMENTO DA APOSTA",
    description
  );

  if (adm.qr) {
    paymentEmbed.setImage(adm.qr);
  }

  await channel.send({
    embeds: [paymentEmbed],
  });
}

function confirmationButtons(betId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bet_confirm|${betId}`)
        .setLabel("Confirmar")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`bet_cancel|${betId}`)
        .setLabel("Cancelar")
        .setStyle(ButtonStyle.Danger)
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
  const config = getGuildConfig(guild.id);

  if (!config.betsCategoryId) {
    throw new Error(
      "A categoria das apostas ainda não foi configurada."
    );
  }

  const category = guild.channels.cache.get(
    config.betsCategoryId
  );

  if (
    !category ||
    category.type !== ChannelType.GuildCategory
  ) {
    throw new Error(
      "A categoria das apostas configurada não existe mais."
    );
  }

  const mediatorIds = getAvailableMediatorIds(guild);

  if (!mediatorIds.length) {
    throw new Error(
      "Não há nenhum mediador na fila. A aposta não pode ser puxada."
    );
  }

  if (players.length !== requiredPlayers(format)) {
    throw new Error(
      "Quantidade de jogadores inválida para este formato."
    );
  }

  let rotationIndex = Number(
    config.mediatorRotationIndex || 0
  );

  if (rotationIndex >= mediatorIds.length) {
    rotationIndex = 0;
  }

  const mediator =
    mediatorIds[rotationIndex];

  config.mediatorRotationIndex =
    (rotationIndex + 1) % mediatorIds.length;

  const betId = generateId("bet");

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
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
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
      ],
    });
  }

  const channel = await guild.channels.create({
    name: `aposta-${betId.slice(-6)}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
  });

  db.bets[betId] = {
    id: betId,
    guildId: guild.id,
    channelId: channel.id,
    format,
    mode,
    value: Number(value),
    players: players,
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
      ...players.map((id) => `<@${id}>`),
      `<@${mediator}>`,
    ]),
  ].join(" "));

  await channel.send({
    content: mentions,
    embeds: [
      createEmbed(
        guild.id,
        "🎲 CONFIRMAÇÃO DA APOSTA",
        `**Formato:** ${format}\n` +
          `**Modalidade:** ${mode.toUpperCase()}\n` +
          `**Valor por jogador:** ${formatMoney(value)}\n\n` +
          `Os jogadores devem confirmar a aposta abaixo.\n\n` +
          `O mediador responsável é <@${mediator}>.`
      ),
    ],
    components: confirmationButtons(betId),
  });

  return {
    channel,
    bet: db.bets[betId],
  };
}

async function cancelBet(bet, channel) {
  bet.cancelled = true;
  saveDatabase();

  await channel
    .send({
      content:
        "A aposta foi cancelada, o canal será deletado em 15 segundos.",
    })
    .catch(() => {});

  setTimeout(() => {
    channel.delete().catch(() => {});
  }, 15000);
}

function parseRoomCredentials(content) {
  const text = String(content || "").trim();

  const patterns = [
    /(?:id\s*(?:da\s*)?sala|id)\s*[:\-]?\s*([^\s\n]+)[\s\S]*?(?:senha|password)\s*[:\-]?\s*([^\s\n]+)/i,

    /(?:sala)\s*[:\-]?\s*([^\s\n]+)[\s\S]*?(?:senha)\s*[:\-]?\s*([^\s\n]+)/i,

    /(?:id)\s+([^\s\n]+)\s+(?:senha)\s+([^\s\n]+)/i,
  ];

  for (const regex of patterns) {
    const match = text.match(regex);

    if (match) {
      return {
        id: match[1],
        password: match[2],
      };
    }
  }

  return null;
}

async function handleRoomCredentials(
  message,
  bet
) {
  if (!bet || bet.roomCreated || bet.finished) {
    return;
  }

  if (message.author.id !== bet.mediator) {
    return;
  }

  const credentials = parseRoomCredentials(
    message.content
  );

  if (!credentials) {
    return;
  }

  bet.roomCreated = true;
  bet.roomId = credentials.id;
  bet.roomPassword = credentials.password;

  const total = Number(bet.value) * 2;

  saveDatabase();

  await message.channel
    .setName(cleanChannelMoneyName(total))
    .catch((error) => {
      console.error(
        "Erro alterando nome do canal:",
        error
      );
    });

  const roomEmbed = createEmbed(
    bet.guildId,
    "Sala criada",
    `A sala foi criada.\n\n` +
      `A sala será iniciada automaticamente em 3 a 5 minutos.\n\n` +
      `**ID da sala:** \`${credentials.id}\`\n` +
      `**Senha:** \`${credentials.password}\``
  );

  await message.channel.send({
    embeds: [roomEmbed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `room_copy_id|${bet.id}`
          )
          .setLabel("Copiar ID")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(
            `room_copy_password|${bet.id}`
          )
          .setLabel("Copiar senha")
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  });

  await message.channel.send({
    embeds: [
      createEmbed(
        bet.guildId,
        "💰 VALOR TOTAL",
        `O valor total da premiação é **${formatMoney(
          total
        )}**.`
      ),
    ],
  });
}

async function publishMediatorQueue(guild) {
  const config = getGuildConfig(guild.id);

  if (!config.mediatorQueueChannelId) {
    throw new Error(
      "Configure primeiro o canal da fila de mediadores."
    );
  }

  const channel = guild.channels.cache.get(
    config.mediatorQueueChannelId
  );

  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error(
      "O canal configurado para a fila de mediadores não existe."
    );
  }

  return channel.send({
    embeds: [mediatorQueueEmbed(guild.id)],
    components: mediatorQueueButtons(),
  });
}

async function publishQueues(
  guild,
  format,
  mode,
  channel
) {
  if (!FORMATS.includes(format)) {
    throw new Error("Formato inválido.");
  }

  if (!MODES.includes(mode)) {
    throw new Error("Modalidade inválida.");
  }

  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error(
      "O canal selecionado precisa ser um canal de texto."
    );
  }

  const config = getGuildConfig(guild.id);

  config.queueMessages[`${format}|${mode}`] = [];

  /*
   * Valores publicados em ordem crescente:
   * R$ 0,30
   * R$ 0,50
   * R$ 0,75
   * R$ 1,00
   * R$ 2,00
   * R$ 3,00
   * R$ 5,00
   * R$ 7,00
   * R$ 10,00
   * R$ 20,00
   * R$ 50,00
   * R$ 100,00
   */

  for (const value of VALUES) {
    const message = await channel.send({
      embeds: [
        queueEmbed(
          guild.id,
          format,
          mode,
          value,
          "normal"
        ),
      ],
      components: queueButtons(
        format,
        mode,
        value,
        "normal"
      ),
    });

    config.queueMessages[`${format}|${mode}`].push(
      message.id
    );
  }

  saveDatabase();
}

async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("conf")
      .setDescription(
        "Abre o painel de configuração do bot."
      ),

    new SlashCommandBuilder()
      .setName("fila")
      .setDescription(
        "Publica as filas de um formato e modalidade."
      )
      .addStringOption((option) =>
        option
          .setName("formato")
          .setDescription("Escolha o formato.")
          .setRequired(true)
          .addChoices(
            ...FORMATS.map((format) => ({
              name: format,
              value: format,
            }))
          )
      )
      .addStringOption((option) =>
        option
          .setName("modalidade")
          .setDescription("Escolha a modalidade.")
          .setRequired(true)
          .addChoices(
            ...MODES.map((mode) => ({
              name: mode.toUpperCase(),
              value: mode,
            }))
          )
      )
      .addChannelOption((option) =>
        option
          .setName("canal")
          .setDescription(
            "Canal onde as filas serão publicadas."
          )
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText)
      ),

    new SlashCommandBuilder()
      .setName("mediadores")
      .setDescription(
        "Publica a fila de mediadores."
      ),
  ];

  const rest = new REST({ version: "10" }).setToken(
    TOKEN
  );

  await rest.put(
    Routes.applicationGuildCommands(
      CLIENT_ID,
      GUILD_ID
    ),
    {
      body: commands.map((command) =>
        command.toJSON()
      ),
    }
  );

  console.log("Comandos slash registrados.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],

  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
  ],
});

client.once("ready", async () => {
  console.log(
    `Bot conectado como ${client.user.tag}`
  );

  await registerSlashCommands().catch((error) => {
    console.error(
      "Erro registrando comandos:",
      error
    );
  });

  const avatarConfig = Object.values(
    db.guilds
  ).find((config) => config.botAvatar);

  if (avatarConfig?.botAvatar) {
    await client.user
      .setAvatar(avatarConfig.botAvatar)
      .catch((error) => {
        console.error(
          "Não foi possível alterar avatar:",
          error
        );
      });
  }
});

client.on(
  "interactionCreate",
  async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction);
        return;
      }

      if (interaction.isButton()) {
        await handleButton(interaction);
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

      if (interaction.isStringSelectMenu()) {
        await handleStringSelect(interaction);
        return;
      }

      if (interaction.isModalSubmit()) {
        await handleModal(interaction);
        return;
      }
    } catch (error) {
      console.error(
        "Erro geral em interactionCreate:",
        error
      );

      await sendSafeReply(interaction, {
        content:
          "❌ Ocorreu um erro ao processar esta ação. Tente novamente.",
        ephemeral: true,
      });
    }
  }
);

async function handleSlashCommand(interaction) {
  if (interaction.commandName === "conf") {
    if (!isAdministrator(interaction.member)) {
      return interaction.reply({
        content:
          "❌ Apenas administradores podem usar `/conf`.",
        ephemeral: true,
      });
    }

    return interaction.reply({
      embeds: [
        configMainEmbed(interaction.guild),
      ],
      components: configButtons(),
      ephemeral: true,
    });
  }

  if (interaction.commandName === "fila") {
    if (!isAdministrator(interaction.member)) {
      return interaction.reply({
        content:
          "❌ Apenas administradores podem usar `/fila`.",
        ephemeral: true,
      });
    }

    const format =
      interaction.options.getString(
        "formato",
        true
      );

    const mode =
      interaction.options.getString(
        "modalidade",
        true
      );

    const channel =
      interaction.options.getChannel(
        "canal",
        true
      );

    await interaction.deferReply({
      ephemeral: true,
    });

    try {
      await publishQueues(
        interaction.guild,
        format,
        mode,
        channel
      );

      await interaction.editReply(
        `✅ Filas **${format} ${mode.toUpperCase()}** publicadas com todos os valores predefinidos.`
      );
    } catch (error) {
      await interaction.editReply(
        `❌ ${error.message}`
      );
    }

    return;
  }

  if (interaction.commandName === "mediadores") {
    if (!isAdministrator(interaction.member)) {
      return interaction.reply({
        content:
          "❌ Apenas administradores podem usar `/mediadores`.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({
      ephemeral: true,
    });

    try {
      await publishMediatorQueue(
        interaction.guild
      );

      await interaction.editReply(
        "✅ Fila de mediadores publicada."
      );
    } catch (error) {
      await interaction.editReply(
        `❌ ${error.message}`
      );
    }
  }
}

async function handleButton(interaction) {
  const id = interaction.customId;

  /*
   * CONFIGURAÇÃO
   */

  if (
    id.startsWith("config_") ||
    id.startsWith("appearance_") ||
    id === "pix_add" ||
    id === "pix_list"
  ) {
    if (!isAdministrator(interaction.member)) {
      return interaction.reply({
        content:
          "❌ Apenas administradores podem configurar o bot.",
        ephemeral: true,
      });
    }
  }

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
          "Selecione o cargo Mediador e o cargo Analista."
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
          "💰 PIX",
          "Cadastre os ADMs que receberão os pagamentos das apostas."
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
          "Configure os canais dos comandos `.ssmob` e `.ssemu`."
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
          "Selecione a categoria já existente onde os canais privados das apostas serão criados."
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
          "Selecione o canal já existente onde será publicada a fila de mediadores."
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
          "Escolha se deseja alterar a foto do bot ou a cor das embeds."
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
          "Escolha uma taxa entre R$ 0,01 e R$ 0,50. Esse valor será registrado como a taxa do ADM por atendimento."
        ),
      ],
      components: feeComponents(),
    });
  }

  if (id === "config_queue") {
    return interaction.reply({
      embeds: [
        createEmbed(
          interaction.guildId,
          "🎮 FILAS",
          "Use `/fila` para publicar uma fila.\n\n" +
            "**Formatos:** 1x1, 2x2, 3x3 e 4x4\n" +
            "**Modalidades:** Mobile, Emulador e Misto\n\n" +
            "**Valores predefinidos:**\n" +
            "R$ 0,30 • R$ 0,50 • R$ 0,75 • R$ 1,00 • R$ 2,00 • R$ 3,00 • R$ 5,00 • R$ 7,00 • R$ 10,00 • R$ 20,00 • R$ 50,00 • R$ 100,00"
        ),
      ],
      ephemeral: true,
    });
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

    if (!config.pixAdmins.length) {
      return interaction.reply({
        content:
          "❌ Nenhum ADM/Pix cadastrado.",
        ephemeral: true,
      });
    }

    const text = config.pixAdmins
      .map(
        (adm, index) =>
          `**${index + 1}. ${adm.name}**\nChave: \`${adm.key}\`\nQR Code: ${
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

  /*
   * FILA DE MEDIADORES
   */

  if (id === "mediator_queue_join") {
    if (
      !hasMediatorRole(
        interaction.member,
        interaction.guildId
      )
    ) {
      return interaction.reply({
        content:
          "❌ Você precisa ter o cargo Mediador configurado para entrar na fila.",
        ephemeral: true,
      });
    }

    const config = getGuildConfig(
      interaction.guildId
    );

    config.mediatorQueue =
      Array.isArray(config.mediatorQueue)
        ? config.mediatorQueue
        : [];

    if (
      config.mediatorQueue.includes(
        interaction.user.id
      )
    ) {
      return interaction.reply({
        content:
          "⚠️ Você já está na fila de mediadores.",
        ephemeral: true,
      });
    }

    config.mediatorQueue.push(
      interaction.user.id
    );

    saveDatabase();

    await interaction.update({
      embeds: [
        mediatorQueueEmbed(
          interaction.guildId
        ),
      ],
      components: mediatorQueueButtons(),
    });

    return;
  }

  if (id === "mediator_queue_leave") {
    const config = getGuildConfig(
      interaction.guildId
    );

    const queue =
      Array.isArray(config.mediatorQueue)
        ? config.mediatorQueue
        : [];

    const index = queue.indexOf(
      interaction.user.id
    );

    if (index === -1) {
      return interaction.reply({
        content:
          "⚠️ Você não está na fila de mediadores.",
        ephemeral: true,
      });
    }

    queue.splice(index, 1);

    saveDatabase();

    await interaction.update({
      embeds: [
        mediatorQueueEmbed(
          interaction.guildId
        ),
      ],
      components: mediatorQueueButtons(),
    });

    return;
  }

  /*
   * ENTRAR EM FILA
   */

  if (id.startsWith("queue_join|")) {
    const parts = id.split("|");

    if (parts.length !== 5) {
      return interaction.reply({
        content:
          "❌ Botão de fila inválido.",
        ephemeral: true,
      });
    }

    const format = parts[1];
    const mode = parts[2];
    const value = Number(parts[3]);
    const type = parts[4];

    if (
      !FORMATS.includes(format) ||
      !MODES.includes(mode) ||
      !VALUES.includes(value) ||
      !["normal", "infinite"].includes(type)
    ) {
      return interaction.reply({
        content:
          "❌ Configuração da fila inválida.",
        ephemeral: true,
      });
    }

    const queue = getQueue(
      interaction.guildId,
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
      return interaction.reply({
        content:
          "⚠️ Você já está nesta fila.",
        ephemeral: true,
      });
    }

    queue.push(
      interaction.user.id
    );

    saveDatabase();

    const needed =
      requiredPlayers(format);

    if (queue.length < needed) {
      await interaction.update({
        embeds: [
          queueEmbed(
            interaction.guildId,
            format,
            mode,
            value,
            type
          ),
        ],
        components: queueButtons(
          format,
          mode,
          value,
          type
        ),
      });

      return;
    }

    const players = queue.splice(
      0,
      needed
    );

    saveDatabase();

    await interaction.update({
      embeds: [
        queueEmbed(
          interaction.guildId,
          format,
          mode,
          value,
          type
        ),
      ],
      components: queueButtons(
        format,
        mode,
        value,
        type
      ),
    });

    try {
      const result =
        await createPrivateBetChannel(
          interaction.guild,
          format,
          mode,
          value,
          players
        );

      await interaction.followUp({
        content: `✅ Aposta criada: <#${result.channel.id}>`,
        ephemeral: true,
      });

      for (const playerId of players) {
        const member =
          await interaction.guild.members
            .fetch(playerId)
            .catch(() => null);

        if (member) {
          await member
            .send(
              `🎲 Sua aposta foi puxada!\nCanal privado: <#${result.channel.id}>`
            )
            .catch(() => {});
        }
      }
    } catch (error) {
      queue.unshift(...players);
      saveDatabase();

      await interaction.followUp({
        content: `❌ Não foi possível criar a aposta: ${error.message}`,
        ephemeral: true,
      });
    }

    return;
  }

  /*
   * SAIR DA FILA
   */

  if (id.startsWith("queue_leave|")) {
    const parts = id.split("|");

    if (parts.length !== 5) {
      return interaction.reply({
        content:
          "❌ Botão de fila inválido.",
        ephemeral: true,
      });
    }

    const format = parts[1];
    const mode = parts[2];
    const value = Number(parts[3]);
    const type = parts[4];

    const queue = getQueue(
      interaction.guildId,
      format,
      mode,
      value,
      type
    );

    const index = queue.indexOf(
      interaction.user.id
    );

    if (index === -1) {
      return interaction.reply({
        content:
          "⚠️ Você não está nesta fila.",
        ephemeral: true,
      });
    }

    queue.splice(index, 1);

    saveDatabase();

    return interaction.update({
      embeds: [
        queueEmbed(
          interaction.guildId,
          format,
          mode,
          value,
          type
        ),
      ],
      components: queueButtons(
        format,
        mode,
        value,
        type
      ),
    });
  }

  /*
   * CONFIRMAÇÃO DA APOSTA
   */

  if (id.startsWith("bet_confirm|")) {
    const betId = id.split("|")[1];
    const bet = getBet(betId);

    if (!bet || bet.cancelled) {
      return interaction.reply({
        content:
          "❌ Esta aposta não existe mais ou foi cancelada.",
        ephemeral: true,
      });
    }

    if (bet.finished) {
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
      bet.confirmed.includes(
        interaction.user.id
      )
    ) {
      return interaction.reply({
        content:
          "⚠️ Você já confirmou esta aposta.",
        ephemeral: true,
      });
    }

    bet.confirmed.push(
      interaction.user.id
    );

    saveDatabase();

    if (bet.confirmed.length < 2) {
      return interaction.reply({
        content:
          "✅ Sua confirmação foi registrada. Aguardando o outro jogador.",
        ephemeral: true,
      });
    }

    await interaction.update({
      embeds: [
        createEmbed(
          interaction.guildId,
          "✅ APOSTA CONFIRMADA",
          `Os dois jogadores confirmaram a aposta.\n\n` +
            `**Formato:** ${bet.format}\n` +
            `**Modalidade:** ${bet.mode.toUpperCase()}\n` +
            `**Valor por jogador:** ${formatMoney(
              bet.value
            )}\n` +
            `**Premiação total:** ${formatMoney(
              bet.value * 2
            )}`
        ),
      ],
      components: [],
    });

    const channel =
      interaction.channel;

    await sendPixData(
      channel,
      interaction.guildId,
      bet
    );

    return;
  }

  /*
   * CANCELAMENTO DA APOSTA
   */

  if (id.startsWith("bet_cancel|")) {
    const betId = id.split("|")[1];
    const bet = getBet(betId);

    if (!bet) {
      return interaction.reply({
        content:
          "❌ Esta aposta não existe.",
        ephemeral: true,
      });
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
      return interaction.reply({
        content:
          "❌ Você não participa desta aposta.",
        ephemeral: true,
      });
    }

    if (bet.cancelled) {
      return interaction.reply({
        content:
          "⚠️ Esta aposta já foi cancelada.",
        ephemeral: true,
      });
    }

    if (bet.finished) {
      return interaction.reply({
        content:
          "❌ Esta aposta já foi finalizada.",
        ephemeral: true,
      });
    }

    await interaction.update({
      embeds: [],
      components: [],
      content:
        "A aposta foi cancelada, o canal será deletado em 15 segundos.",
    });

    bet.cancelled = true;
    saveDatabase();

    setTimeout(() => {
      interaction.channel
        .delete()
        .catch(() => {});
    }, 15000);

    return;
  }

  /*
   * COPIAR ID / SENHA
   */

  if (
    id.startsWith("room_copy_id|")
  ) {
    const betId = id.split("|")[1];
    const bet = getBet(betId);

    if (!bet || !bet.roomCreated) {
      return interaction.reply({
        content:
          "❌ Os dados da sala não estão disponíveis.",
        ephemeral: true,
      });
    }

    return interaction.reply({
      content: `ID da sala: \`${bet.roomId}\``,
      ephemeral: true,
    });
  }

  if (
    id.startsWith("room_copy_password|")
  ) {
    const betId = id.split("|")[1];
    const bet = getBet(betId);

    if (!bet || !bet.roomCreated) {
      return interaction.reply({
        content:
          "❌ Os dados da sala não estão disponíveis.",
        ephemeral: true,
      });
    }

    return interaction.reply({
      content: `Senha da sala: \`${bet.roomPassword}\``,
      ephemeral: true,
    });
  }

  /*
   * ASSUMIR ANÁLISE
   */

  if (id.startsWith("analysis_claim|")) {
    if (
      !hasAnalystRole(
        interaction.member,
        interaction.guildId
      )
    ) {
      return interaction.reply({
        content:
          "❌ Apenas quem possui o cargo Analista pode assumir uma análise.",
        ephemeral: true,
      });
    }

    const analysisId =
      id.split("|")[1];

    const analysis =
      db.analyses[analysisId];

    if (!analysis) {
      return interaction.reply({
        content:
          "❌ Esta solicitação não existe mais.",
        ephemeral: true,
      });
    }

    if (analysis.claimedBy) {
      return interaction.reply({
        content:
          "⚠️ Esta análise já foi assumida por outro analista.",
        ephemeral: true,
      });
    }

    analysis.claimedBy =
      interaction.user.id;

    analysis.claimedAt =
      Date.now();

    saveDatabase();

    return interaction.reply({
      content:
        "✅ Análise assumida com sucesso.",
      ephemeral: true,
    });
  }

  /*
   * ESCOLHA DO VENCEDOR
   */

  if (id.startsWith("med_winner|")) {
    const parts = id.split("|");

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

    if (
      interaction.user.id !==
      bet.mediator
    ) {
      return interaction.reply({
        content:
          "❌ Apenas o mediador responsável pode finalizar esta aposta.",
        ephemeral: true,
      });
    }

    if (bet.finished) {
      return interaction.reply({
        content:
          "❌ Esta aposta já foi finalizada.",
        ephemeral: true,
      });
    }

    if (!bet.players.includes(winnerId)) {
      return interaction.reply({
        content:
          "❌ Jogador inválido.",
        ephemeral: true,
      });
    }

    const loserId =
      bet.players.find(
        (id) => id !== winnerId
      );

    const winner =
      getUserData(winnerId);

    const loser =
      getUserData(loserId);

    winner.wins += 1;

    loser.losses += 1;

    winner.coins +=
      Number(bet.value) * 2;

    bet.finished = true;
    bet.result = {
      type: "winner",
      winnerId,
      loserId,
      total: bet.value * 2,
    };

    saveDatabase();

    return interaction.update({
      embeds: [
        createEmbed(
          interaction.guildId,
          "🏆 APOSTA FINALIZADA",
          `🏆 Vencedor: <@${winnerId}>\n` +
            `❌ Perdedor: <@${loserId}>\n\n` +
            `💰 Premiação: **${formatMoney(
              bet.value * 2
            )}**\n\n` +
            `+1 vitória para o vencedor.\n` +
            `+1 derrota para o perdedor.`
        ),
      ],
      components: [],
    });
  }

  /*
   * FINALIZAÇÃO VIA MENU
   */

  if (id.startsWith("med_finish|")) {
    const betId = id.split("|")[1];
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
          "❌ Apenas o mediador responsável pode finalizar.",
        ephemeral: true,
      });
    }

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
          "A aposta foi finalizada pelo mediador."
        ),
      ],
      components: [],
    });
  }

  /*
   * W.O.
   */

  if (id.startsWith("med_wo|")) {
    const betId = id.split("|")[1];
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
          "❌ Apenas o mediador responsável pode registrar W.O.",
        ephemeral: true,
      });
    }

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
          "Vitória por W.O. registrada.\n\nNenhuma vitória ou derrota foi adicionada aos jogadores."
        ),
      ],
      components: [],
    });
  }

  /*
   * CASO O BOT RECEBA UM BOTÃO DESCONHECIDO
   */

  return interaction.reply({
    content:
      "❌ Este botão não está mais disponível ou é inválido.",
    ephemeral: true,
  });
}

async function handleRoleSelect(interaction) {
  if (!isAdministrator(interaction.member)) {
    return interaction.reply({
      content:
        "❌ Apenas administradores.",
      ephemeral: true,
    });
  }

  const config = getGuildConfig(
    interaction.guildId
  );

  if (
    interaction.customId ===
    "select_mediator_role"
  ) {
    config.mediatorRoleId =
      interaction.values[0];

    saveDatabase();

    return interaction.reply({
      content:
        "✅ Cargo Mediador configurado.",
      ephemeral: true,
    });
  }

  if (
    interaction.customId ===
    "select_analyst_role"
  ) {
    config.analystRoleId =
      interaction.values[0];

    saveDatabase();

    return interaction.reply({
      content:
        "✅ Cargo Analista configurado.",
      ephemeral: true,
    });
  }

  return interaction.reply({
    content:
      "❌ Seleção de cargo inválida.",
    ephemeral: true,
  });
}

async function handleChannelSelect(
  interaction
) {
  if (!isAdministrator(interaction.member)) {
    return interaction.reply({
      content:
        "❌ Apenas administradores.",
      ephemeral: true,
    });
  }

  const config = getGuildConfig(
    interaction.guildId
  );

  const selected =
    interaction.values[0];

  if (
    interaction.customId ===
    "select_channel_mobile"
  ) {
    config.analysisChannelMobile =
      selected;

    saveDatabase();

    return interaction.reply({
      content:
        "✅ Canal 1 do `.ssmob` configurado.",
      ephemeral: true,
    });
  }

  if (
    interaction.customId ===
    "select_channel_emulator"
  ) {
    config.analysisChannelEmulator =
      selected;

    saveDatabase();

    return interaction.reply({
      content:
        "✅ Canal 2 do `.ssemu` configurado.",
      ephemeral: true,
    });
  }

  if (
    interaction.customId ===
    "select_bets_category"
  ) {
    const channel =
      interaction.guild.channels.cache.get(
        selected
      );

    if (
      !channel ||
      channel.type !==
        ChannelType.GuildCategory
    ) {
      return interaction.reply({
        content:
          "❌ Selecione uma categoria válida.",
        ephemeral: true,
      });
    }

    config.betsCategoryId =
      selected;

    saveDatabase();

    return interaction.reply({
      content:
        "✅ Categoria das apostas configurada.",
      ephemeral: true,
    });
  }

  if (
    interaction.customId ===
    "select_mediator_channel"
  ) {
    config.mediatorQueueChannelId =
      selected;

    saveDatabase();

    return interaction.reply({
      content:
        "✅ Canal da fila de mediadores configurado.",
      ephemeral: true,
    });
  }

  return interaction.reply({
    content:
      "❌ Seleção de canal inválida.",
    ephemeral: true,
  });
}

async function handleStringSelect(
  interaction
) {
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
      components: [backButton()],
    });
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

    if (bet.finished) {
      return interaction.reply({
        content:
          "❌ Esta aposta já foi finalizada.",
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
              .setLabel("Jogador 1")
              .setStyle(
                ButtonStyle.Success
              ),

            new ButtonBuilder()
              .setCustomId(
                `med_winner|${bet.id}|${bet.player2}`
              )
              .setLabel("Jogador 2")
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
            "Vitória por W.O. registrada.\n\nNenhuma vitória ou derrota foi adicionada."
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

async function handleModal(interaction) {
  if (!isAdministrator(interaction.member)) {
    return interaction.reply({
      content:
        "❌ Apenas administradores.",
      ephemeral: true,
    });
  }

  if (
    interaction.customId ===
    "pix_modal"
  ) {
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

  if (
    interaction.customId ===
    "avatar_modal"
  ) {
    const url =
      interaction.fields
        .getTextInputValue(
          "avatar_url"
        )
        .trim();

    if (!/^https?:\/\//i.test(url)) {
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

  if (
    interaction.customId ===
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

client.on(
  "messageCreate",
  async (message) => {
    if (
      message.author.bot ||
      !message.guild
    ) {
      return;
    }

    /*
     * COMANDOS SEM BARRA
     */

    const content =
      message.content.trim();

    if (
      content.startsWith(PREFIX)
    ) {
      const pieces =
        content
          .slice(PREFIX.length)
          .trim()
          .split(/\s+/);

      const command =
        (
          pieces.shift() || ""
        ).toLowerCase();

      if (
        ["ssmob", "ssemu", "med"].includes(
          command
        )
      ) {
        await handlePrefixCommand(
          message,
          command
        );

        return;
      }
    }

    /*
     * ID E SENHA DA SALA
     */

    const bet =
      getBetByChannel(
        message.channel.id
      );

    if (bet) {
      await handleRoomCredentials(
        message,
        bet
      );
    }
  }
);

async function handlePrefixCommand(
  message,
  command
) {
  if (
    !hasMediatorRole(
      message.member,
      message.guild.id
    )
  ) {
    await message.reply(
      "❌ Você precisa ter o cargo Mediador configurado para usar este comando."
    );

    return;
  }

  const config =
    getGuildConfig(
      message.guild.id
    );

  if (
    command === "ssmob" ||
    command === "ssemu"
  ) {
    const channelId =
      command === "ssmob"
        ? config.analysisChannelMobile
        : config.analysisChannelEmulator;

    if (!channelId) {
      await message.reply(
        "❌ O canal deste comando ainda não foi configurado em `/conf`."
      );

      return;
    }

    const channel =
      message.guild.channels.cache.get(
        channelId
      );

    if (
      !channel ||
      channel.type !==
        ChannelType.GuildText
    ) {
      await message.reply(
        "❌ O canal configurado não existe mais."
      );

      return;
    }

    const analysisId =
      generateId("analysis");

    db.analyses[analysisId] = {
      id: analysisId,
      guildId: message.guild.id,
      mediatorId: message.author.id,
      type: command,
      channelId: channel.id,
      claimedBy: null,
      createdAt: Date.now(),
    };

    saveDatabase();

    await channel.send({
      embeds: [
        createSmallEmbed(
          message.guild.id,
          "🔎 ANÁLISE SOLICITADA",
          `Uma análise foi solicitada.\n\n` +
            `Um analista disponível pode assumir esta análise pelo botão abaixo.`
        ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `analysis_claim|${analysisId}`
            )
            .setLabel("Assumir análise")
            .setStyle(
              ButtonStyle.Success
            )
        ),
      ],
    });

    await message.reply({
      content: `✅ Solicitação enviada para <#${channel.id}>.`,
      allowedMentions: {
        repliedUser: false,
      },
    });

    return;
  }

  if (command === "med") {
    const bet =
      getBetByChannel(
        message.channel.id
      );

    if (!bet) {
      await message.reply(
        "❌ Este canal não possui uma aposta ativa."
      );

      return;
    }

    if (
      message.author.id !==
      bet.mediator
    ) {
      await message.reply(
        "❌ Você não é o mediador responsável por esta aposta."
      );

      return;
    }

    const menu =
      new StringSelectMenuBuilder()
        .setCustomId(
          `med_menu|${bet.id}`
        )
        .setPlaceholder(
          "Escolha uma ação"
        )
        .addOptions(
          {
            label:
              "Escolher vencedor",
            value: "winner",
            description:
              "Adicionar vitória ao ganhador e derrota ao perdedor.",
          },
          {
            label:
              "Vitória por W.O",
            value: "wo",
            description:
              "Não adicionar vitória nem derrota.",
          },
          {
            label:
              "Finalizar aposta",
            value: "finish",
            description:
              "Finalizar a aposta.",
          }
        );

    await message.reply({
      embeds: [
        createEmbed(
          message.guild.id,
          "🛡️ PAINEL DO MEDIADOR",
          "Escolha uma das opções abaixo."
        ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          menu
        ),
      ],
    });

    return;
  }
}

client.on(
  "guildMemberRemove",
  async (member) => {
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

client.login(TOKEN);
