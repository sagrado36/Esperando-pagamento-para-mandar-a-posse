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
  ].join(" ");

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
      embeds: [
        createEmbed(
          bet.guildId,
          "❌ APOSTA CANCELADA",
          "Esta aposta foi cancelada."
        ),
      ],
    })
    .catch(() => {});

  setTimeout(() => {
    channel.delete().catch(() => {});
  }, 5000);
}

async function confirmBet(bet, userId, channel) {
  if (!playerBelongsToBet(bet, userId)) {
    return {
      ok: false,
      message: "Você não participa desta aposta.",
    };
  }

  if (!Array.isArray(bet.confirmed)) {
    bet.confirmed = [];
  }

  if (!bet.confirmed.includes(userId)) {
    bet.confirmed.push(userId);
  }

  saveDatabase();

  const totalPlayers = bet.players.length;

  if (bet.confirmed.length < totalPlayers) {
    return {
      ok: true,
      complete: false,
      message: `Confirmação registrada. ${bet.confirmed.length}/${totalPlayers} jogadores confirmaram.`,
    };
  }

  bet.roomCreated = true;
  saveDatabase();

  await channel
    .send({
      embeds: [
        createEmbed(
          bet.guildId,
          "✅ APOSTA CONFIRMADA",
          "Todos os jogadores confirmaram a aposta.\n\nA sala pode ser criada e a partida pode começar."
        ),
      ],
    })
    .catch(() => {});

  return {
    ok: true,
    complete: true,
    message: "Todos os jogadores confirmaram a aposta.",
  };
}

function resultButtons(betId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`result_win|${betId}|0`)
        .setLabel("Jogador 1 venceu")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`result_win|${betId}|1`)
        .setLabel("Jogador 2 venceu")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`result_draw|${betId}`)
        .setLabel("Empate")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

async function finishBet(bet, winnerIndex, channel) {
  if (bet.finished || bet.cancelled) {
    return false;
  }

  const winnerId = bet.players[winnerIndex];

  if (!winnerId) {
    return false;
  }

  const loserIndex = winnerIndex === 0 ? 1 : 0;
  const loserId = bet.players[loserIndex];

  const winnerData = getUserData(winnerId);
  const loserData = getUserData(loserId);

  winnerData.wins = Number(winnerData.wins || 0) + 1;
  loserData.losses = Number(loserData.losses || 0) + 1;

  bet.finished = true;
  bet.winner = winnerId;
  bet.loser = loserId;
  bet.finishedAt = Date.now();

  saveDatabase();

  await channel
    .send({
      embeds: [
        createEmbed(
          bet.guildId,
          "🏆 RESULTADO DA APOSTA",
          `🏆 **Vencedor:** <@${winnerId}>\n` +
            `❌ **Derrotado:** <@${loserId}>\n\n` +
            `A partida foi encerrada.`
        ),
      ],
    })
    .catch(() => {});

  return true;
}

async function finishDraw(bet, channel) {
  if (bet.finished || bet.cancelled) {
    return false;
  }

  for (const userId of bet.players) {
    const user = getUserData(userId);
    user.coins = Number(user.coins || 0);
  }

  bet.finished = true;
  bet.draw = true;
  bet.finishedAt = Date.now();

  saveDatabase();

  await channel
    .send({
      embeds: [
        createEmbed(
          bet.guildId,
          "🤝 EMPATE",
          "A partida terminou em empate."
        ),
      ],
    })
    .catch(() => {});

  return true;
}

function adminOnly(member) {
  return isAdministrator(member);
}

async function setupPanel(interaction) {
  if (!adminOnly(interaction.member)) {
    return sendSafeReply(interaction, {
      content: "❌ Apenas administradores podem usar este painel.",
      ephemeral: true,
    });
  }

  const guild = interaction.guild;

  return sendSafeReply(interaction, {
    embeds: [configMainEmbed(guild)],
    components: configButtons(),
    ephemeral: true,
  });
}

async function showRolesConfig(interaction) {
  return sendSafeReply(interaction, {
    embeds: [
      createEmbed(
        interaction.guild.id,
        "🎭 CARGOS",
        "Selecione os cargos que serão utilizados pelo sistema."
      ),
    ],
    components: roleConfigComponents(),
    ephemeral: true,
  });
}

async function showChannelsConfig(interaction) {
  return sendSafeReply(interaction, {
    embeds: [
      createEmbed(
        interaction.guild.id,
        "📢 CANAIS",
        "Configure os canais utilizados para análises."
      ),
    ],
    components: channelConfigComponents(),
    ephemeral: true,
  });
}

async function showBetsConfig(interaction) {
  return sendSafeReply(interaction, {
    embeds: [
      createEmbed(
        interaction.guild.id,
        "🎲 APOSTAS",
        "Selecione a categoria onde os canais privados das apostas serão criados."
      ),
    ],
    components: betConfigComponents(),
    ephemeral: true,
  });
}

async function showMediatorConfig(interaction) {
  return sendSafeReply(interaction, {
    embeds: [
      createEmbed(
        interaction.guild.id,
        "🛡️ MEDIADORES",
        "Configure o canal da fila de mediadores."
      ),
    ],
    components: mediatorConfigComponents(),
    ephemeral: true,
  });
}

async function showAppearanceConfig(interaction) {
  const config = getGuildConfig(interaction.guild.id);

  return sendSafeReply(interaction, {
    embeds: [
      createEmbed(
        interaction.guild.id,
        "🎨 APARÊNCIA",
        `**Cor atual:** ${config.embedColor}\n` +
          `**Avatar:** ${
            config.botAvatar
              ? "Configurado"
              : "Não configurado"
          }`
      ),
    ],
    components: appearanceComponents(),
    ephemeral: true,
  });
}

async function showFeeConfig(interaction) {
  const config = getGuildConfig(interaction.guild.id);

  return sendSafeReply(interaction, {
    embeds: [
      createEmbed(
        interaction.guild.id,
        "💸 TAXA DO ADM",
        `Taxa atual: **${formatMoney(config.admFee)}**`
      ),
    ],
    components: feeComponents(),
    ephemeral: true,
  });
}

async function showPixConfig(interaction) {
  const config = getGuildConfig(interaction.guild.id);

  const admins =
    config.pixAdmins.length > 0
      ? config.pixAdmins
          .map(
            (adm, index) =>
              `**${index + 1}.** ${adm.name} — \`${adm.key}\``
          )
          .join("\n")
      : "Nenhum ADM cadastrado.";

  return sendSafeReply(interaction, {
    embeds: [
      createEmbed(
        interaction.guild.id,
        "💳 PIX",
        admins
      ),
    ],
    components: pixComponents(),
    ephemeral: true,
  });
}

async function showQueueConfig(interaction) {
  return sendSafeReply(interaction, {
    embeds: [
      createEmbed(
        interaction.guild.id,
        "🎮 CONFIGURAÇÃO DAS FILAS",
        "Use o comando `/painel` para publicar as filas de partidas."
      ),
    ],
    components: [backButton()],
    ephemeral: true,
  });
}

async function publishQueue(
  interaction,
  format,
  mode,
  value,
  type = "normal"
) {
  const guild = interaction.guild;

  const message = await interaction.channel.send({
    embeds: [
      queueEmbed(
        guild.id,
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

  return message;
}

async function handleQueueJoin(
  interaction,
  format,
  mode,
  value,
  type
) {
  const guild = interaction.guild;

  const queue = getQueue(
    guild.id,
    format,
    mode,
    value,
    type
  );

  if (queue.includes(interaction.user.id)) {
    return sendSafeReply(interaction, {
      content: "❌ Você já está nessa fila.",
      ephemeral: true,
    });
  }

  if (
    type !== "infinite" &&
    queue.length >= requiredPlayers(format)
  ) {
    return sendSafeReply(interaction, {
      content: "❌ Essa fila já está cheia.",
      ephemeral: true,
    });
  }

  queue.push(interaction.user.id);

  saveDatabase();

  await interaction.message
    .edit({
      embeds: [
        queueEmbed(
          guild.id,
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

  if (
    type !== "infinite" &&
    queue.length >= requiredPlayers(format)
  ) {
    const players = queue.splice(
      0,
      requiredPlayers(format)
    );

    saveDatabase();

    try {
      const result = await createPrivateBetChannel(
        guild,
        format,
        mode,
        value,
        players
      );

      return sendSafeReply(interaction, {
        content: `✅ Aposta criada: ${result.channel}`,
        ephemeral: true,
      });
    } catch (error) {
      queue.unshift(...players);
      saveDatabase();

      console.error(
        "Erro ao criar aposta:",
        error
      );

      return sendSafeReply(interaction, {
        content: `❌ Não foi possível criar a aposta: ${error.message}`,
        ephemeral: true,
      });
    }
  }

  return sendSafeReply(interaction, {
    content: "✅ Você entrou na fila.",
    ephemeral: true,
  });
}

async function handleQueueLeave(
  interaction,
  format,
  mode,
  value,
  type
) {
  const queue = getQueue(
    interaction.guild.id,
    format,
    mode,
    value,
    type
  );

  const index = queue.indexOf(
    interaction.user.id
  );

  if (index === -1) {
    return sendSafeReply(interaction, {
      content: "❌ Você não está nessa fila.",
      ephemeral: true,
    });
  }

  queue.splice(index, 1);

  saveDatabase();

  await interaction.message
    .edit({
      embeds: [
        queueEmbed(
          interaction.guild.id,
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

  return sendSafeReply(interaction, {
    content: "✅ Você saiu da fila.",
    ephemeral: true,
  });
}

async function createQueuePanel(interaction) {
  const valueRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("queue_value_select")
      .setPlaceholder("Selecione o valor")
      .addOptions(
        VALUES.map((value) => ({
          label: formatMoney(value),
          value: String(value),
        }))
      )
  );

  return sendSafeReply(interaction, {
    embeds: [
      createEmbed(
        interaction.guild.id,
        "🎮 CRIAR FILA",
        "Selecione o valor da partida."
      ),
    ],
    components: [valueRow],
    ephemeral: true,
  });
}

async function handleQueueValueSelect(
  interaction
) {
  const value = Number(interaction.values[0]);

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`queue_format_select|${value}`)
      .setPlaceholder("Selecione o formato")
      .addOptions(
        FORMATS.map((format) => ({
          label: format,
          value: format,
        }))
      )
  );

  return sendSafeReply(interaction, {
    embeds: [
      createEmbed(
        interaction.guild.id,
        "🎮 FORMATO",
        `Valor selecionado: **${formatMoney(value)}**\n\nSelecione o formato.`
      ),
    ],
    components: [row],
    ephemeral: true,
  });
}

async function handleQueueFormatSelect(
  interaction
) {
  const parts =
    interaction.customId.split("|");

  const value = Number(parts[1]);
  const format = interaction.values[0];

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        `queue_mode_select|${value}|${format}`
      )
      .setPlaceholder("Selecione o modo")
      .addOptions(
        MODES.map((mode) => ({
          label: mode.toUpperCase(),
          value: mode,
        }))
      )
  );

  return sendSafeReply(interaction, {
    embeds: [
      createEmbed(
        interaction.guild.id,
        "📱 MODO",
        `Valor: **${formatMoney(value)}**\n` +
          `Formato: **${format}**\n\n` +
          `Selecione o modo da partida.`
      ),
    ],
    components: [row],
    ephemeral: true,
  });
}

async function handleQueueModeSelect(
  interaction
) {
  const parts =
    interaction.customId.split("|");

  const value = Number(parts[1]);
  const format = parts[2];
  const mode = interaction.values[0];

  await publishQueue(
    interaction,
    format,
    mode,
    value,
    "normal"
  );

  if (format === "1x1") {
    await publishQueue(
      interaction,
      format,
      mode,
      value,
      "infinite"
    );
  }

  return sendSafeReply(interaction, {
    content: "✅ Filas publicadas.",
    ephemeral: true,
  });
}

async function handleMediatorJoin(interaction) {
  const guild = interaction.guild;
  const config = getGuildConfig(guild.id);

  if (!hasMediatorRole(interaction.member, guild.id)) {
    return sendSafeReply(interaction, {
      content:
        "❌ Você precisa ter o cargo de mediador para entrar na fila.",
      ephemeral: true,
    });
  }

  const queue = getAvailableMediatorIds(guild);

  if (!queue.includes(interaction.user.id)) {
    queue.push(interaction.user.id);
  }

  config.mediatorQueue = queue;

  saveDatabase();

  await interaction.message
    .edit({
      embeds: [mediatorQueueEmbed(guild.id)],
      components: mediatorQueueButtons(),
    })
    .catch(() => {});

  return sendSafeReply(interaction, {
    content: "✅ Você entrou na fila de mediadores.",
    ephemeral: true,
  });
}

async function handleMediatorLeave(interaction) {
  const guild = interaction.guild;
  const config = getGuildConfig(guild.id);

  config.mediatorQueue =
    Array.isArray(config.mediatorQueue)
      ? config.mediatorQueue
      : [];

  config.mediatorQueue =
    config.mediatorQueue.filter(
      (id) => id !== interaction.user.id
    );

  saveDatabase();

  await interaction.message
    .edit({
      embeds: [mediatorQueueEmbed(guild.id)],
      components: mediatorQueueButtons(),
    })
    .catch(() => {});

  return sendSafeReply(interaction, {
    content: "✅ Você saiu da fila de mediadores.",
    ephemeral: true,
  });
}        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                `med_winner|${betId}|${bet.player1}`
              )
              .setLabel("Jogador 1")
              .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
              .setCustomId(
                `med_winner|${betId}|${bet.player2}`
              )
              .setLabel("Jogador 2")
              .setStyle(ButtonStyle.Success)
          ),

          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                `med_finish|${betId}`
              )
              .setLabel("Finalizar")
              .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
              .setCustomId(
                `med_wo|${betId}`
              )
              .setLabel("W.O.")
              .setStyle(ButtonStyle.Danger)
          ),
        ],
      });
    }

    if (action === "room") {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(
            `room_modal|${betId}`
          )
          .setTitle("Dados da sala")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("room_id")
                .setLabel("ID da sala")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("room_password")
                .setLabel("Senha da sala")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          )
      );
    }

    return interaction.reply({
      content:
        "❌ Opção inválida.",
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
  const id = interaction.customId;

  if (id === "pix_modal") {
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

    const name =
      interaction.fields.getTextInputValue(
        "pix_name"
      );

    const key =
      interaction.fields.getTextInputValue(
        "pix_key"
      );

    const qr =
      interaction.fields
        .getTextInputValue("pix_qr")
        .trim();

    config.pixAdmins.push({
      id: interaction.user.id,
      name,
      key,
      qr: qr || null,
    });

    saveDatabase();

    return interaction.reply({
      content:
        "✅ ADM/Pix cadastrado com sucesso.",
      ephemeral: true,
    });
  }

  if (id === "avatar_modal") {
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

    const url =
      interaction.fields.getTextInputValue(
        "avatar_url"
      );

    config.botAvatar = url;

    saveDatabase();

    try {
      await client.user.setAvatar(url);
    } catch (error) {
      console.error(
        "Erro ao alterar avatar:",
        error
      );
    }

    return interaction.reply({
      content:
        "✅ Foto do bot configurada.",
      ephemeral: true,
    });
  }

  if (id === "color_modal") {
    if (!isAdministrator(interaction.member)) {
      return interaction.reply({
        content:
          "❌ Apenas administradores.",
        ephemeral: true,
      });
    }

    const color =
      interaction.fields.getTextInputValue(
        "embed_color"
      );

    if (
      !/^#?[0-9A-Fa-f]{6}$/.test(color)
    ) {
      return interaction.reply({
        content:
          "❌ Cor inválida. Use o formato `#000000`.",
        ephemeral: true,
      });
    }

    const config = getGuildConfig(
      interaction.guildId
    );

    config.embedColor =
      normalizeColor(color);

    saveDatabase();

    return interaction.reply({
      content:
        `✅ Cor alterada para **${config.embedColor}**.`,
      ephemeral: true,
    });
  }

  if (
    id.startsWith("room_modal|")
  ) {
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
          "❌ Apenas o mediador responsável pode cadastrar a sala.",
        ephemeral: true,
      });
    }

    const roomId =
      interaction.fields.getTextInputValue(
        "room_id"
      );

    const roomPassword =
      interaction.fields.getTextInputValue(
        "room_password"
      );

    bet.roomId = roomId;
    bet.roomPassword = roomPassword;
    bet.roomCreated = true;

    saveDatabase();

    const row =
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `room_copy_id|${betId}`
          )
          .setLabel("Copiar ID")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(
            `room_copy_password|${betId}`
          )
          .setLabel("Copiar senha")
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.reply({
      embeds: [
        createEmbed(
          interaction.guildId,
          "🎮 SALA CRIADA",
          `**ID:** \`${roomId}\`\n` +
            `**Senha:** \`${roomPassword}\`\n\n` +
            `Os jogadores podem usar os botões abaixo para copiar os dados.`
        ),
      ],
      components: [row],
    });

    return;
  }

  return interaction.reply({
    content:
      "❌ Formulário inválido.",
    ephemeral: true,
  });
}

async function handleCommands(interaction) {
  const command =
    interaction.commandName;

  if (command === "conf") {
    return setupPanel(interaction);
  }

  if (command === "fila") {
    if (!isAdministrator(interaction.member)) {
      return interaction.reply({
        content:
          "❌ Apenas administradores podem criar filas.",
        ephemeral: true,
      });
    }

    return createQueuePanel(
      interaction
    );
  }

  if (command === "filamediador") {
    const config = getGuildConfig(
      interaction.guildId
    );

    if (!config.mediatorQueueChannelId) {
      return interaction.reply({
        content:
          "❌ Configure primeiro o canal da fila de mediadores em `/conf`.",
        ephemeral: true,
      });
    }

    const channel =
      interaction.guild.channels.cache.get(
        config.mediatorQueueChannelId
      );

    if (!channel) {
      return interaction.reply({
        content:
          "❌ O canal configurado não existe mais.",
        ephemeral: true,
      });
    }

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
        `✅ Fila publicada em ${channel}.`,
      ephemeral: true,
    });
  }

  if (command === "ssmob") {
    return createAnalysisRequest(
      interaction,
      "mobile"
    );
  }

  if (command === "ssemu") {
    return createAnalysisRequest(
      interaction,
      "emulator"
    );
  }

  if (command === "fila1x1") {
    return publishQuickQueue(
      interaction,
      "1x1"
    );
  }

  if (command === "fila2x2") {
    return publishQuickQueue(
      interaction,
      "2x2"
    );
  }

  if (command === "fila3x3") {
    return publishQuickQueue(
      interaction,
      "3x3"
    );
  }

  if (command === "fila4x4") {
    return publishQuickQueue(
      interaction,
      "4x4"
    );
  }

  if (command === "perfil") {
    const user =
      interaction.options.getUser(
        "usuario"
      ) || interaction.user;

    const data = getUserData(
      user.id
    );

    const total =
      Number(data.wins || 0) +
      Number(data.losses || 0);

    const winRate =
      total > 0
        ? (
            (Number(data.wins || 0) /
              total) *
            100
          ).toFixed(1)
        : "0.0";

    return interaction.reply({
      embeds: [
        createEmbed(
          interaction.guildId,
          `👤 PERFIL — ${user.username}`,
          `🏆 **Vitórias:** ${
            data.wins || 0
          }\n` +
            `❌ **Derrotas:** ${
              data.losses || 0
            }\n` +
            `📊 **Partidas:** ${total}\n` +
            `📈 **Winrate:** ${winRate}%\n` +
            `🪙 **Moedas:** ${
              data.coins || 0
            }`
        ),
      ],
    });
  }

  if (command === "ranking") {
    const guildUsers =
      Object.entries(db.users);

    guildUsers.sort(
      (a, b) =>
        Number(b[1].wins || 0) -
        Number(a[1].wins || 0)
    );

    const top =
      guildUsers.slice(0, 10);

    const description =
      top.length > 0
        ? top
            .map(
              ([id, data], index) =>
                `**${index + 1}.** <@${id}> — 🏆 ${
                  data.wins || 0
                } vitórias`
            )
            .join("\n")
        : "Nenhum jogador possui partidas registradas.";

    return interaction.reply({
      embeds: [
        createEmbed(
          interaction.guildId,
          "🏆 RANKING",
          description
        ),
      ],
    });
  }

  if (command === "cancelar") {
    const bet =
      getBetByChannel(
        interaction.channelId
      );

    if (!bet) {
      return interaction.reply({
        content:
          "❌ Este canal não possui uma aposta ativa.",
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
      ) &&
      !isAdministrator(
        interaction.member
      )
    ) {
      return interaction.reply({
        content:
          "❌ Você não pode cancelar esta aposta.",
        ephemeral: true,
      });
    }

    await cancelBet(
      bet,
      interaction.channel
    );

    return interaction.reply({
      content:
        "✅ Aposta cancelada.",
      ephemeral: true,
    });
  }

  return interaction.reply({
    content:
      "❌ Comando desconhecido.",
    ephemeral: true,
  });
}

async function createAnalysisRequest(
  interaction,
  platform
) {
  const config = getGuildConfig(
    interaction.guildId
  );

  const targetChannelId =
    platform === "mobile"
      ? config.analysisChannelMobile
      : config.analysisChannelEmulator;

  if (!targetChannelId) {
    return interaction.reply({
      content:
        "❌ O canal de análise ainda não foi configurado.",
      ephemeral: true,
    });
  }

  const channel =
    interaction.guild.channels.cache.get(
      targetChannelId
    );

  if (!channel) {
    return interaction.reply({
      content:
        "❌ O canal configurado não existe mais.",
      ephemeral: true,
    });
  }

  const analysisId =
    generateId("analysis");

  db.analyses[analysisId] = {
    id: analysisId,
    guildId: interaction.guildId,
    userId: interaction.user.id,
    platform,
    claimedBy: null,
    claimedAt: null,
    createdAt: Date.now(),
  };

  saveDatabase();

  const embed =
    createEmbed(
      interaction.guildId,
      "🔎 NOVA ANÁLISE",
      `👤 **Solicitante:** <@${interaction.user.id}>\n` +
        `📱 **Plataforma:** ${
          platform === "mobile"
            ? "Mobile"
            : "Emulador"
        }\n\n` +
        `Um analista pode assumir esta solicitação.`
    );

  const row =
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `analysis_claim|${analysisId}`
        )
        .setLabel("Assumir análise")
        .setStyle(ButtonStyle.Primary)
    );

  await channel.send({
    embeds: [embed],
    components: [row],
  });

  return interaction.reply({
    content:
      `✅ Solicitação enviada para ${channel}.`,
    ephemeral: true,
  });
}

async function publishQuickQueue(
  interaction,
  format
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

  const row =
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          `quick_queue_value|${format}`
        )
        .setPlaceholder(
          `Valor da ${format}`
        )
        .addOptions(
          VALUES.map((value) => ({
            label: formatMoney(value),
            value: String(value),
          }))
        )
    );

  return interaction.reply({
    embeds: [
      createEmbed(
        interaction.guildId,
        `🎮 FILA ${format}`,
        "Selecione o valor da partida."
      ),
    ],
    components: [row],
    ephemeral: true,
  });
}

async function handleQuickQueueValue(
  interaction
) {
  const format =
    interaction.customId.split("|")[1];

  const value = Number(
    interaction.values[0]
  );

  const row =
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          `quick_queue_mode|${format}|${value}`
        )
        .setPlaceholder(
          "Selecione a modalidade"
        )
        .addOptions(
          MODES.map((mode) => ({
            label:
              mode.toUpperCase(),
            value: mode,
          }))
        )
    );

  return interaction.update({
    embeds: [
      createEmbed(
        interaction.guildId,
        `🎮 ${format}`,
        `Valor: **${formatMoney(
          value
        )}**\n\nSelecione a modalidade.`
      ),
    ],
    components: [row],
  });
}

async function handleQuickQueueMode(
  interaction
) {
  const parts =
    interaction.customId.split("|");

  const format = parts[1];
  const value = Number(parts[2]);
  const mode =
    interaction.values[0];

  await interaction.channel.send({
    embeds: [
      queueEmbed(
        interaction.guildId,
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

  if (format === "1x1") {
    await interaction.channel.send({
      embeds: [
        queueEmbed(
          interaction.guildId,
          format,
          mode,
          value,
          "infinite"
        ),
      ],
      components: queueButtons(
        format,
        mode,
        value,
        "infinite"
      ),
    });
  }

  return interaction.update({
    embeds: [
      createEmbed(
        interaction.guildId,
        "✅ FILA CRIADA",
        `Fila **${format} ${mode}** criada com valor **${formatMoney(
          value
        )}**.`
      ),
    ],
    components: [],
  });
}

async function handleInteraction(
  interaction
) {
  try {
    if (interaction.isChatInputCommand()) {
      return handleCommands(
        interaction
      );
    }

    if (interaction.isButton()) {
      return handleButton(
        interaction
      );
    }

    if (interaction.isRoleSelectMenu()) {
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
      if (
        interaction.customId ===
        "queue_value_select"
      ) {
        return handleQueueValueSelect(
          interaction
        );
      }

      if (
        interaction.customId.startsWith(
          "queue_format_select|"
        )
      ) {
        return handleQueueFormatSelect(
          interaction
        );
      }

      if (
        interaction.customId.startsWith(
          "queue_mode_select|"
        )
      ) {
        return handleQueueModeSelect(
          interaction
        );
      }

      if (
        interaction.customId.startsWith(
          "quick_queue_value|"
        )
      ) {
        return handleQuickQueueValue(
          interaction
        );
      }

      if (
        interaction.customId.startsWith(
          "quick_queue_mode|"
        )
      ) {
        return handleQuickQueueMode(
          interaction
        );
      }

      return handleStringSelect(
        interaction
      );
    }

    if (interaction.isModalSubmit()) {
      return handleModal(
        interaction
      );
    }
  } catch (error) {
    console.error(
      "Erro ao processar interação:",
      error
    );

    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction
        .reply({
          content:
            "❌ Ocorreu um erro ao processar esta ação.",
          ephemeral: true,
        })
        .catch(() => {});
    }
  }
}          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                `med_winner|${betId}|${bet.player1}`
              )
              .setLabel("Jogador 1")
              .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
              .setCustomId(
                `med_winner|${betId}|${bet.player2}`
              )
              .setLabel("Jogador 2")
              .setStyle(ButtonStyle.Success)
          ),
        ],
      });
    }

    if (action === "room") {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(`room_modal|${betId}`)
          .setTitle("Dados da sala")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("room_id")
                .setLabel("ID da sala")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("room_password")
                .setLabel("Senha da sala")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          )
      );
    }

    return interaction.reply({
      content: "❌ Opção inválida.",
      ephemeral: true,
    });
  }

  return interaction.reply({
    content: "❌ Menu inválido.",
    ephemeral: true,
  });
}

async function handleModal(interaction) {
  const id = interaction.customId;

  if (id === "pix_modal") {
    if (!isAdministrator(interaction.member)) {
      return interaction.reply({
        content: "❌ Apenas administradores.",
        ephemeral: true,
      });
    }

    const config = getGuildConfig(interaction.guildId);

    const name = interaction.fields.getTextInputValue("pix_name");
    const key = interaction.fields.getTextInputValue("pix_key");
    const qr = interaction.fields.getTextInputValue("pix_qr").trim();

    config.pixAdmins.push({
      id: interaction.user.id,
      name,
      key,
      qr: qr || null,
    });

    saveDatabase();

    return interaction.reply({
      content: "✅ ADM/Pix cadastrado com sucesso.",
      ephemeral: true,
    });
  }

  if (id === "avatar_modal") {
    if (!isAdministrator(interaction.member)) {
      return interaction.reply({
        content: "❌ Apenas administradores.",
        ephemeral: true,
      });
    }

    const config = getGuildConfig(interaction.guildId);
    const url = interaction.fields.getTextInputValue("avatar_url");

    config.botAvatar = url;
    saveDatabase();

    try {
      await client.user.setAvatar(url);
    } catch (error) {
      console.error("Erro ao alterar avatar:", error);
    }

    return interaction.reply({
      content: "✅ Foto do bot configurada.",
      ephemeral: true,
    });
  }

  if (id === "color_modal") {
    if (!isAdministrator(interaction.member)) {
      return interaction.reply({
        content: "❌ Apenas administradores.",
        ephemeral: true,
      });
    }

    const color = interaction.fields.getTextInputValue("embed_color");

    if (!/^#?[0-9A-Fa-f]{6}$/.test(color)) {
      return interaction.reply({
        content: "❌ Cor inválida. Use o formato `#000000`.",
        ephemeral: true,
      });
    }

    const config = getGuildConfig(interaction.guildId);
    config.embedColor = normalizeColor(color);

    saveDatabase();

    return interaction.reply({
      content: `✅ Cor alterada para **${config.embedColor}**.`,
      ephemeral: true,
    });
  }

  if (id.startsWith("room_modal|")) {
    const betId = id.split("|")[1];
    const bet = getBet(betId);

    if (!bet) {
      return interaction.reply({
        content: "❌ Aposta não encontrada.",
        ephemeral: true,
      });
    }

    if (interaction.user.id !== bet.mediator) {
      return interaction.reply({
        content:
          "❌ Apenas o mediador responsável pode cadastrar a sala.",
        ephemeral: true,
      });
    }

    const roomId = interaction.fields.getTextInputValue("room_id");
    const roomPassword =
      interaction.fields.getTextInputValue("room_password");

    bet.roomId = roomId;
    bet.roomPassword = roomPassword;
    bet.roomCreated = true;

    saveDatabase();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`room_copy_id|${betId}`)
        .setLabel("Copiar ID")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`room_copy_password|${betId}`)
        .setLabel("Copiar senha")
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({
      embeds: [
        createEmbed(
          interaction.guildId,
          "🎮 SALA CRIADA",
          `**ID:** \`${roomId}\`\n` +
            `**Senha:** \`${roomPassword}\`\n\n` +
            `Os jogadores podem usar os botões abaixo para copiar os dados.`
        ),
      ],
      components: [row],
    });

    return;
  }

  return interaction.reply({
    content: "❌ Formulário inválido.",
    ephemeral: true,
  });
}

async function handleCommands(interaction) {
  const command = interaction.commandName;

  if (command === "conf") {
    return setupPanel(interaction);
  }

  if (command === "fila") {
    if (!isAdministrator(interaction.member)) {
      return interaction.reply({
        content: "❌ Apenas administradores podem criar filas.",
        ephemeral: true,
      });
    }

    return createQueuePanel(interaction);
  }

  if (command === "filamediador") {
    const config = getGuildConfig(interaction.guildId);

    if (!config.mediatorQueueChannelId) {
      return interaction.reply({
        content:
          "❌ Configure primeiro o canal da fila de mediadores em `/conf`.",
        ephemeral: true,
      });
    }

    const channel = interaction.guild.channels.cache.get(
      config.mediatorQueueChannelId
    );

    if (!channel) {
      return interaction.reply({
        content: "❌ O canal configurado não existe mais.",
        ephemeral: true,
      });
    }

    await channel.send({
      embeds: [mediatorQueueEmbed(interaction.guildId)],
      components: mediatorQueueButtons(),
    });

    return interaction.reply({
      content: `✅ Fila publicada em ${channel}.`,
      ephemeral: true,
    });
  }

  if (command === "ssmob") {
    return createAnalysisRequest(interaction, "mobile");
  }

  if (command === "ssemu") {
    return createAnalysisRequest(interaction, "emulator");
  }

  if (command === "fila1x1") {
    return publishQuickQueue(interaction, "1x1");
  }

  if (command === "fila2x2") {
    return publishQuickQueue(interaction, "2x2");
  }

  if (command === "fila3x3") {
    return publishQuickQueue(interaction, "3x3");
  }

  if (command === "fila4x4") {
    return publishQuickQueue(interaction, "4x4");
  }

  if (command === "perfil") {
    const user =
      interaction.options.getUser("usuario") || interaction.user;

    const data = getUserData(user.id);

    const total =
      Number(data.wins || 0) + Number(data.losses || 0);

    const winRate =
      total > 0
        ? ((Number(data.wins || 0) / total) * 100).toFixed(1)
        : "0.0";

    return interaction.reply({
      embeds: [
        createEmbed(
          interaction.guildId,
          `👤 PERFIL — ${user.username}`,
          `🏆 **Vitórias:** ${data.wins || 0}\n` +
            `❌ **Derrotas:** ${data.losses || 0}\n` +
            `📊 **Partidas:** ${total}\n` +
            `📈 **Winrate:** ${winRate}%\n` +
            `🪙 **Moedas:** ${data.coins || 0}`
        ),
      ],
    });
  }

  if (command === "ranking") {
    const guildUsers = Object.entries(db.users);

    guildUsers.sort(
      (a, b) => Number(b[1].wins || 0) - Number(a[1].wins || 0)
    );

    const top = guildUsers.slice(0, 10);

    const description =
      top.length > 0
        ? top
            .map(
              ([id, data], index) =>
                `**${index + 1}.** <@${id}> — 🏆 ${
                  data.wins || 0
                } vitórias`
            )
            .join("\n")
        : "Nenhum jogador possui partidas registradas.";

    return interaction.reply({
      embeds: [
        createEmbed(
          interaction.guildId,
          "🏆 RANKING",
          description
        ),
      ],
    });
  }

  if (command === "cancelar") {
    const bet = getBetByChannel(interaction.channelId);

    if (!bet) {
      return interaction.reply({
        content:
          "❌ Este canal não possui uma aposta ativa.",
        ephemeral: true,
      });
    }

    if (
      !playerBelongsToBet(bet, interaction.user.id) &&
      !mediatorBelongsToBet(bet, interaction.user.id) &&
      !isAdministrator(interaction.member)
    ) {
      return interaction.reply({
        content: "❌ Você não pode cancelar esta aposta.",
        ephemeral: true,
      });
    }

    await cancelBet(bet, interaction.channel);

    return interaction.reply({
      content: "✅ Aposta cancelada.",
      ephemeral: true,
    });
  }

  return interaction.reply({
    content: "❌ Comando desconhecido.",
    ephemeral: true,
  });
}

async function createAnalysisRequest(interaction, platform) {
  const config = getGuildConfig(interaction.guildId);

  const targetChannelId =
    platform === "mobile"
      ? config.analysisChannelMobile
      : config.analysisChannelEmulator;

  if (!targetChannelId) {
    return interaction.reply({
      content:
        "❌ O canal de análise ainda não foi configurado.",
      ephemeral: true,
    });
  }

  const channel = interaction.guild.channels.cache.get(
    targetChannelId
  );

  if (!channel) {
    return interaction.reply({
      content:
        "❌ O canal configurado não existe mais.",
      ephemeral: true,
    });
  }

  const analysisId = generateId("analysis");

  db.analyses[analysisId] = {
    id: analysisId,
    guildId: interaction.guildId,
    userId: interaction.user.id,
    platform,
    claimedBy: null,
    claimedAt: null,
    createdAt: Date.now(),
  };

  saveDatabase();

  const embed = createEmbed(
    interaction.guildId,
    "🔎 NOVA ANÁLISE",
    `👤 **Solicitante:** <@${interaction.user.id}>\n` +
      `📱 **Plataforma:** ${
        platform === "mobile" ? "Mobile" : "Emulador"
      }\n\n` +
      `Um analista pode assumir esta solicitação.`
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`analysis_claim|${analysisId}`)
      .setLabel("Assumir análise")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({
    embeds: [embed],
    components: [row],
  });

  return interaction.reply({
    content: `✅ Solicitação enviada para ${channel}.`,
    ephemeral: true,
  });
}

async function publishQuickQueue(interaction, format) {
  if (!isAdministrator(interaction.member)) {
    return interaction.reply({
      content: "❌ Apenas administradores.",
      ephemeral: true,
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`quick_queue_value|${format}`)
      .setPlaceholder(`Valor da ${format}`)
      .addOptions(
        VALUES.map((value) => ({
          label: formatMoney(value),
          value: String(value),
        }))
      )
  );

  return interaction.reply({
    embeds: [
      createEmbed(
        interaction.guildId,
        `🎮 FILA ${format}`,
        "Selecione o valor da partida."
      ),
    ],
    components: [row],
    ephemeral: true,
  });
}

async function handleQuickQueueValue(interaction) {
  const format = interaction.customId.split("|")[1];
  const value = Number(interaction.values[0]);

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`quick_queue_mode|${format}|${value}`)
      .setPlaceholder("Selecione a modalidade")
      .addOptions(
        MODES.map((mode) => ({
          label: mode.toUpperCase(),
          value: mode,
        }))
      )
  );

  return interaction.update({
    embeds: [
      createEmbed(
        interaction.guildId,
        `🎮 ${format}`,
        `Valor: **${formatMoney(value)}**\n\nSelecione a modalidade.`
      ),
    ],
    components: [row],
  });
}

async function handleQuickQueueMode(interaction) {
  const parts = interaction.customId.split("|");

  const format = parts[1];
  const value = Number(parts[2]);
  const mode = interaction.values[0];

  await interaction.channel.send({
    embeds: [
      queueEmbed(
        interaction.guildId,
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

  if (format === "1x1") {
    await interaction.channel.send({
      embeds: [
        queueEmbed(
          interaction.guildId,
          format,
          mode,
          value,
          "infinite"
        ),
      ],
      components: queueButtons(
        format,
        mode,
        value,
        "infinite"
      ),
    });
  }

  return interaction.update({
    embeds: [
      createEmbed(
        interaction.guildId,
        "✅ FILA CRIADA",
        `Fila **${format} ${mode}** criada com valor **${formatMoney(
          value
        )}**.`
      ),
    ],
    components: [],
  });
}

async function handleInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      return handleCommands(interaction);
    }

    if (interaction.isButton()) {
      return handleButton(interaction);
    }

    if (interaction.isRoleSelectMenu()) {
      return handleRoleSelect(interaction);
    }

    if (interaction.isChannelSelectMenu()) {
      return handleChannelSelect(interaction);
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "queue_value_select") {
        return handleQueueValueSelect(interaction);
      }

      if (interaction.customId.startsWith("queue_format_select|")) {
        return handleQueueFormatSelect(interaction);
      }

      if (interaction.customId.startsWith("queue_mode_select|")) {
        return handleQueueModeSelect(interaction);
      }

      if (interaction.customId.startsWith("quick_queue_value|")) {
        return handleQuickQueueValue(interaction);
      }

      if (interaction.customId.startsWith("quick_queue_mode|")) {
        return handleQuickQueueMode(interaction);
      }

      return handleStringSelect(interaction);
    }

    if (interaction.isModalSubmit()) {
      return handleModal(interaction);
    }
  } catch (error) {
    console.error(
      "Erro ao processar interação:",
      error
    );

    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction
        .reply({
          content:
            "❌ Ocorreu um erro ao processar esta ação.",
          ephemeral: true,
        })
        .catch(() => {});
    }
  }
}        saveDatabase();

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

console.log("Deploy Railway");
