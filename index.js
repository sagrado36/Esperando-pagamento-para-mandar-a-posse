require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const TOKEN = process.env.TOKEN;

if (!TOKEN) {
  console.error("❌ TOKEN não encontrado no arquivo .env");
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "bot.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================
// BANCO DE DADOS
// ============================================================

const defaultDatabase = {
  guilds: {},
  queues: {},
  bets: {},
  analyses: {},
  stats: {}
};

let db;

function loadDatabase() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      db = structuredClone(defaultDatabase);
      saveDatabase();
      return;
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");

    if (!raw.trim()) {
      db = structuredClone(defaultDatabase);
      saveDatabase();
      return;
    }

    db = JSON.parse(raw);

    db.guilds ??= {};
    db.queues ??= {};
    db.bets ??= {};
    db.analyses ??= {};
    db.stats ??= {};
  } catch (error) {
    console.error("❌ Erro ao carregar banco de dados:", error);

    db = structuredClone(defaultDatabase);
    saveDatabase();
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("❌ Erro ao salvar banco de dados:", error);
  }
}

loadDatabase();

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],

  partials: [
    Partials.Channel,
    Partials.GuildMember,
    Partials.User
  ]
});

// ============================================================
// CONSTANTES
// ============================================================

const PREFIX = ".";

const VALUES = [
  100,
  50,
  20,
  10,
  7,
  5,
  3,
  2,
  1,
  0.75,
  0.5,
  0.3
];

const FORMATS = [
  "1x1",
  "2x2",
  "3x3",
  "4x4"
];

const MODALITIES = [
  "Mobile",
  "Emulador",
  "Misto"
];

const MAX_MEDIATORS = 20;

// ============================================================
// FUNÇÕES BÁSICAS
// ============================================================

function generateId(length = 10) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars.charAt(
      Math.floor(Math.random() * chars.length)
    );
  }

  return result;
}

function money(value) {
  return Number(value)
    .toFixed(2)
    .replace(".", ",");
}

function moneyBRL(value) {
  return `R$ ${money(value)}`;
}

function getGuildConfig(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      mobileChannelId: null,
      emulatorChannelId: null,
      betsCategoryId: null,
      mediatorRoleId: null,
      analystRoleId: null,
      mobileAnalysisChannelId: null,
      emulatorAnalysisChannelId: null,
      fee: 0,
      appearance: {
        color: null
      },
      mediators: []
    };

    saveDatabase();
  }

  const config = db.guilds[guildId];

  config.mediators ??= [];
  config.appearance ??= {};
  config.fee ??= 0;

  return config;
}

function getStats(guildId, userId) {
  db.stats[guildId] ??= {};

  db.stats[guildId][userId] ??= {
    bets: 0,
    wins: 0,
    losses: 0,
    woWins: 0,
    woLosses: 0,
    totalWon: 0,
    totalLost: 0
  };

  return db.stats[guildId][userId];
}

function isAdmin(member) {
  return Boolean(
    member?.permissions?.has(
      PermissionFlagsBits.Administrator
    )
  );
}

function isMediator(member, guildId) {
  if (!member) return false;

  const config = getGuildConfig(guildId);

  if (
    config.mediatorRoleId &&
    member.roles?.cache?.has(config.mediatorRoleId)
  ) {
    return true;
  }

  return config.mediators.some(
    mediator => mediator.id === member.id
  );
}

function isAnalyst(member, guildId) {
  if (!member) return false;

  const config = getGuildConfig(guildId);

  return Boolean(
    config.analystRoleId &&
    member.roles?.cache?.has(config.analystRoleId)
  );
}

function getMemberMention(userId) {
  return `<@${userId}>`;
}

// ============================================================
// FILAS
// ============================================================

function createQueueData({
  guildId,
  channelId,
  format,
  modality,
  value
}) {
  const id = generateId(12);

  const queue = {
    id,
    guildId,
    channelId,
    format,
    modality,
    value,
    players: [],
    messageId: null,
    createdAt: Date.now()
  };

  db.queues[id] = queue;

  saveDatabase();

  return queue;
}

function getQueue(queueId) {
  return db.queues[queueId] || null;
}

function deleteQueue(queueId) {
  if (db.queues[queueId]) {
    delete db.queues[queueId];
    saveDatabase();
  }
}

function queueCapacity() {
  return 2;
}

function queueEmbed(queue) {
  const players =
    queue.players.length > 0
      ? queue.players
          .map(userId => `👤 <@${userId}>`)
          .join("\n")
      : "👤 Nenhum jogador";

  return new EmbedBuilder()
    .setTitle("🎮 FILA")
    .setDescription(
      [
        `📌 Formato: ${queue.format}`,
        `📱 Modalidade: ${queue.modality}`,
        "",
        `💰 ${moneyBRL(queue.value)}`,
        `👥 ${queue.players.length}/2`,
        "",
        players
      ].join("\n")
    );
}

function queueButtons(queue) {
  const rows = [];

  if (queue.format === "1x1") {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`qg|${queue.id}|normal`)
          .setLabel("Gelo Normal")
          .setEmoji("🧊")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(`qg|${queue.id}|infinito`)
          .setLabel("Gelo Infinito")
          .setEmoji("♾️")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(`ql|${queue.id}`)
          .setLabel("Sair")
          .setEmoji("🚪")
          .setStyle(ButtonStyle.Secondary)
      )
    );

    return rows;
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`qe|${queue.id}`)
        .setLabel("Entrar")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`ql|${queue.id}`)
        .setLabel("Sair")
        .setEmoji("🚪")
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return rows;
}

// ============================================================
// APOSTAS
// ============================================================

function createBet({
  guildId,
  categoryId,
  format,
  modality,
  value,
  players
}) {
  const id = generateId(14);

  const bet = {
    id,
    guildId,
    categoryId,
    format,
    modality,
    value,
    players: [...players],
    channelId: null,
    mediatorId: null,
    analystId: null,
    roomId: null,
    roomPassword: null,
    winnerId: null,
    status: "aguardando_pagamento",
    payments: {},
    createdAt: Date.now(),
    finalizedAt: null
  };

  for (const userId of players) {
    bet.payments[userId] = false;
  }

  db.bets[id] = bet;

  saveDatabase();

  return bet;
}

function getBet(betId) {
  return db.bets[betId] || null;
}

function findBetByChannel(channelId) {
  return Object.values(db.bets).find(
    bet => bet.channelId === channelId
  ) || null;
}

function updateBet(betId, data) {
  const bet = getBet(betId);

  if (!bet) return null;

  Object.assign(bet, data);

  saveDatabase();

  return bet;
}

// ============================================================
// PERMISSÕES DO CANAL DA APOSTA
// ============================================================

async function createBetChannel(guild, bet) {
  const config = getGuildConfig(guild.id);

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel
      ]
    }
  ];

  for (const userId of bet.players) {
    overwrites.push({
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  if (config.mediatorRoleId) {
    overwrites.push({
      id: config.mediatorRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  const channelName =
    `aposta-${bet.players[0].slice(-4)}-${bet.players[1].slice(-4)}`;

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.betsCategoryId || undefined,
    permissionOverwrites: overwrites
  });

  bet.channelId = channel.id;

  saveDatabase();

  return channel;
}

// ============================================================
// PAINEL DA APOSTA
// ============================================================

function betEmbed(bet) {
  const statusMap = {
    aguardando_pagamento: "⏳ Aguardando pagamento",
    aguardando_sala: "⏳ Aguardando sala",
    em_andamento: "🎮 Em andamento",
    finalizada: "✅ Finalizada",
    wo: "⚠️ Vitória por W.O."
  };

  return new EmbedBuilder()
    .setTitle("🎮 APOSTA")
    .setDescription(
      [
        `👥 Jogadores`,
        `• <@${bet.players[0]}>`,
        `• <@${bet.players[1]}>`,
        "",
        `🎯 Formato: ${bet.format}`,
        `📱 Modalidade: ${bet.modality}`,
        `💰 Valor: ${moneyBRL(bet.value)}`,
        "",
        `Status: ${statusMap[bet.status] || "⏳ Aguardando"}`
      ].join("\n")
    );
}

function betPaymentButtons(bet) {
  const rows = [];

  for (const userId of bet.players) {
    const paid = Boolean(bet.payments[userId]);

    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`pay|${bet.id}|${userId}`)
          .setLabel(
            paid
              ? `${userId === bet.players[0] ? "Jogador 1" : "Jogador 2"}: Pago`
              : `${userId === bet.players[0] ? "Jogador 1" : "Jogador 2"}: Confirmar pagamento`
          )
          .setStyle(
            paid
              ? ButtonStyle.Success
              : ButtonStyle.Primary
          )
          .setDisabled(paid)
      )
    );
  }

  return rows;
}// ============================================================
// PAINEL DO MEDIADOR
// ============================================================

function mediatorPanelEmbed(bet) {
  return new EmbedBuilder()
    .setTitle("🎮 PAINEL DO MEDIADOR")
    .setDescription(
      [
        "👥 Jogadores",
        `• <@${bet.players[0]}>`,
        `• <@${bet.players[1]}>`,
        "",
        `🎯 Formato: ${bet.format}`,
        `📱 Modalidade: ${bet.modality}`,
        `💰 Valor: ${moneyBRL(bet.value)}`,
        "",
        `Status: ${
          bet.status === "aguardando_pagamento"
            ? "⏳ Aguardando"
            : bet.status === "aguardando_sala"
              ? "⏳ Aguardando sala"
              : bet.status === "em_andamento"
                ? "🎮 Em andamento"
                : bet.status === "wo"
                  ? "⚠️ Vitória por W.O."
                  : "✅ Finalizada"
        }`
      ].join("\n")
    );
}

function mediatorPanelButtons(bet) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`room|${bet.id}`)
        .setLabel("Abrir Sala")
        .setEmoji("🏠")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`winner|${bet.id}`)
        .setLabel("Escolher Vencedor")
        .setEmoji("🏆")
        .setStyle(ButtonStyle.Success)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`wo|${bet.id}`)
        .setLabel("Vitória por W.O.")
        .setEmoji("⚠️")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(`finish|${bet.id}`)
        .setLabel("Finalizar Aposta")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ============================================================
// MODAIS
// ============================================================

function roomModal(betId) {
  const modal = new ModalBuilder()
    .setCustomId(`room_modal|${betId}`)
    .setTitle("🏠 Abrir Sala");

  const roomId = new TextInputBuilder()
    .setCustomId("room_id")
    .setLabel("ID da sala")
    .setPlaceholder("Digite o ID da sala")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50);

  const password = new TextInputBuilder()
    .setCustomId("room_password")
    .setLabel("Senha da sala")
    .setPlaceholder("Digite a senha da sala")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50);

  modal.addComponents(
    new ActionRowBuilder().addComponents(roomId),
    new ActionRowBuilder().addComponents(password)
  );

  return modal;
}

function winnerModal(betId) {
  const modal = new ModalBuilder()
    .setCustomId(`winner_modal|${betId}`)
    .setTitle("🏆 Escolher Vencedor");

  const winner = new TextInputBuilder()
    .setCustomId("winner_id")
    .setLabel("ID do jogador vencedor")
    .setPlaceholder("Digite o ID do jogador")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(30);

  modal.addComponents(
    new ActionRowBuilder().addComponents(winner)
  );

  return modal;
}

function mediatorAddIdModal() {
  const modal = new ModalBuilder()
    .setCustomId("cfg_med_id")
    .setTitle("➕ Adicionar Mediador");

  const id = new TextInputBuilder()
    .setCustomId("mediator_id")
    .setLabel("Discord ID")
    .setPlaceholder("Digite o ID do Discord")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(30);

  modal.addComponents(
    new ActionRowBuilder().addComponents(id)
  );

  return modal;
}

function mediatorDataModal(userId) {
  const modal = new ModalBuilder()
    .setCustomId(`cfg_med_data|${userId}`)
    .setTitle("Dados do Mediador");

  const name = new TextInputBuilder()
    .setCustomId("mediator_name")
    .setLabel("Nome do mediador")
    .setPlaceholder("Nome")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const pix = new TextInputBuilder()
    .setCustomId("mediator_pix")
    .setLabel("Chave Pix")
    .setPlaceholder("Chave Pix")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(200);

  const qr = new TextInputBuilder()
    .setCustomId("mediator_qr")
    .setLabel("QR Code")
    .setPlaceholder("URL ou referência do QR Code")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(name),
    new ActionRowBuilder().addComponents(pix),
    new ActionRowBuilder().addComponents(qr)
  );

  return modal;
}

function feeModal() {
  const modal = new ModalBuilder()
    .setCustomId("cfg_fee")
    .setTitle("💰 Taxa");

  const fee = new TextInputBuilder()
    .setCustomId("fee")
    .setLabel("Taxa")
    .setPlaceholder("Ex: 10 ou 5,00")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20);

  modal.addComponents(
    new ActionRowBuilder().addComponents(fee)
  );

  return modal;
}

// ============================================================
// CONFIGURAÇÃO
// ============================================================

function configEmbed(guildId) {
  const config = getGuildConfig(guildId);

  const mobile =
    config.mobileChannelId
      ? `<#${config.mobileChannelId}>`
      : "❌ Não configurado";

  const emulator =
    config.emulatorChannelId
      ? `<#${config.emulatorChannelId}>`
      : "❌ Não configurado";

  const category =
    config.betsCategoryId
      ? `<#${config.betsCategoryId}>`
      : "❌ Não configurado";

  const mediatorRole =
    config.mediatorRoleId
      ? `<@&${config.mediatorRoleId}>`
      : "❌ Não configurado";

  const analystRole =
    config.analystRoleId
      ? `<@&${config.analystRoleId}>`
      : "❌ Não configurado";

  const mobileAnalysis =
    config.mobileAnalysisChannelId
      ? `<#${config.mobileAnalysisChannelId}>`
      : "❌ Não configurado";

  const emulatorAnalysis =
    config.emulatorAnalysisChannelId
      ? `<#${config.emulatorAnalysisChannelId}>`
      : "❌ Não configurado";

  return new EmbedBuilder()
    .setTitle("⚙️ CONFIGURAÇÃO")
    .setDescription(
      [
        `📱 Canal Mobile: ${mobile}`,
        `🖥️ Canal Emulador: ${emulator}`,
        `📁 Categoria das Apostas: ${category}`,
        `👮 Cargo Mediador: ${mediatorRole}`,
        `🔎 Cargo Analista: ${analystRole}`,
        `🔎 Análise Mobile: ${mobileAnalysis}`,
        `🔎 Análise Emulador: ${emulatorAnalysis}`,
        `💰 Taxa: ${config.fee}%`,
        "",
        `👥 Mediadores: ${config.mediators.length}/${MAX_MEDIATORS}`
      ].join("\n")
    );
}

function configButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("cfg_mobile")
        .setLabel("Canal Mobile")
        .setEmoji("📱")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("cfg_emulator")
        .setLabel("Canal Emulador")
        .setEmoji("🖥️")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("cfg_category")
        .setLabel("Categoria das Apostas")
        .setEmoji("📁")
        .setStyle(ButtonStyle.Primary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("cfg_mediator_role")
        .setLabel("Cargo Mediador")
        .setEmoji("👮")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("cfg_analyst_role")
        .setLabel("Cargo Analista")
        .setEmoji("🔎")
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("cfg_mobile_analysis")
        .setLabel("Análise Mobile")
        .setEmoji("📱")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("cfg_emulator_analysis")
        .setLabel("Análise Emulador")
        .setEmoji("🖥️")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("cfg_fee_button")
        .setLabel("Taxa")
        .setEmoji("💰")
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("cfg_mediators")
        .setLabel("Mediadores")
        .setEmoji("👥")
        .setStyle(ButtonStyle.Success)
    )
  ];
}

function mediatorConfigButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("cfg_add_mediator")
        .setLabel("Adicionar Mediador")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("cfg_remove_mediator")
        .setLabel("Remover Mediador")
        .setEmoji("➖")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("cfg_list_mediators")
        .setLabel("Listar Mediadores")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ============================================================
// SELECTS DE CONFIGURAÇÃO
// ============================================================

function channelSelect(customId, placeholder) {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
  );
}

function roleSelect(customId, placeholder) {
  return new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
  );
}

// ============================================================
// FILA — FLUXO /fila
// ============================================================

function filaFormatSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("fila_format")
      .setPlaceholder("🎯 Escolha o formato")
      .addOptions(
        FORMATS.map(format => ({
          label: format,
          value: format,
          emoji: "🎮"
        }))
      )
  );
}

function filaModalitySelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("fila_modality")
      .setPlaceholder("📱 Escolha a modalidade")
      .addOptions(
        MODALITIES.map(modality => ({
          label: modality,
          value: modality,
          emoji:
            modality === "Mobile"
              ? "📱"
              : modality === "Emulador"
                ? "🖥️"
                : "🎮"
        }))
      )
  );
}

function filaChannelSelect() {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("fila_channel")
      .setPlaceholder("📢 Escolha o canal")
      .setMinValues(1)
      .setMaxValues(1)
  );
}

// ============================================================
// ANÁLISE
// ============================================================

function analysisEmbed(type, bet) {
  const name =
    type === "mobile"
      ? "Mobile"
      : "Emulador";

  return new EmbedBuilder()
    .setTitle("🔎 ANÁLISE SOLICITADA")
    .setDescription(
      [
        `Uma análise ${name} foi solicitada.`,
        "",
        "Status: ⏳ Aguardando analista",
        "",
        "🔎 **Assumir Análise**"
      ].join("\n")
    )
    .setFooter({
      text: `Aposta: ${bet.id}`
    });
}

function analysisAssumedEmbed(type, bet, analystId) {
  const name =
    type === "mobile"
      ? "Mobile"
      : "Emulador";

  return new EmbedBuilder()
    .setTitle("🔎 ANÁLISE SOLICITADA")
    .setDescription(
      [
        `Uma análise ${name} foi solicitada.`,
        "",
        "Status: ✅ Análise assumida",
        `👤 Analista: <@${analystId}>`
      ].join("\n")
    )
    .setFooter({
      text: `Aposta: ${bet.id}`
    });
}

function analysisButton(analysisId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`analysis_claim|${analysisId}`)
      .setLabel("Assumir Análise")
      .setEmoji("🔎")
      .setStyle(ButtonStyle.Primary)
  );
}

// ============================================================
// ESTATÍSTICAS
// ============================================================

function registerBetResult(
  guildId,
  winnerId,
  loserId,
  value,
  wo = false
) {
  const winnerStats = getStats(guildId, winnerId);
  const loserStats = getStats(guildId, loserId);

  winnerStats.bets++;
  loserStats.bets++;

  winnerStats.wins++;
  loserStats.losses++;

  if (wo) {
    winnerStats.woWins++;
    loserStats.woLosses++;
  }

  winnerStats.totalWon += Number(value);
  loserStats.totalLost += Number(value);

  saveDatabase();
}

// ============================================================
// FINALIZAÇÃO
// ============================================================

async function finalizeBetChannel(channel, bet) {
  if (!channel) return;

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🔒 APOSTA FINALIZADA")
        .setDescription(
          [
            "A aposta foi finalizada.",
            "🗑️ Este canal será deletado em 5 segundos."
          ].join("\n")
        )
    ]
  });

  bet.status = "finalizada";
  bet.finalizedAt = Date.now();

  saveDatabase();

  setTimeout(async () => {
    try {
      await channel.delete();
    } catch (error) {
      console.error(
        "❌ Não foi possível deletar o canal da aposta:",
        error.message
      );
    }
  }, 5000);
}

// ============================================================
// COMANDO .P
// ============================================================

async function handlePlayerStats(message) {
  const stats = getStats(
    message.guild.id,
    message.author.id
  );

  const embed = new EmbedBuilder()
    .setTitle("📊 ESTATÍSTICAS DO JOGADOR")
    .setDescription(
      [
        `👤 Jogador: ${message.author}`,
        "",
        `🎮 Total de apostas: ${stats.bets}`,
        `🏆 Vitórias: ${stats.wins}`,
        `❌ Derrotas: ${stats.losses}`,
        `⚠️ W.O. ganhos: ${stats.woWins}`,
        `⚠️ W.O. perdidos: ${stats.woLosses}`,
        "",
        `💰 Total ganho: ${moneyBRL(stats.totalWon)}`,
        `💸 Total perdido: ${moneyBRL(stats.totalLost)}`
      ].join("\n")
    );

  await message.reply({
    embeds: [embed]
  });
}// ============================================================
// COMANDOS .SSMOB / .SSEMU
// ============================================================

async function requestAnalysis(message, type) {
  if (!message.guild) return;

  if (!isMediator(message.member, message.guild.id)) {
    await message.reply({
      content: "❌ Você não tem permissão para usar este comando.",
      ephemeral: true
    }).catch(() => {});
    return;
  }

  const bet = findBetByChannel(message.channel.id);

  if (!bet) {
    await message.reply(
      "❌ Este comando deve ser usado dentro do canal privado de uma aposta."
    );
    return;
  }

  const config = getGuildConfig(message.guild.id);

  const analysisChannelId =
    type === "mobile"
      ? config.mobileAnalysisChannelId
      : config.emulatorAnalysisChannelId;

  if (!analysisChannelId) {
    await message.reply(
      `❌ O canal de análise ${type === "mobile" ? "Mobile" : "Emulador"} não foi configurado.`
    );
    return;
  }

  const analysisChannel =
    await message.guild.channels.fetch(analysisChannelId).catch(() => null);

  if (!analysisChannel || !analysisChannel.isTextBased()) {
    await message.reply(
      "❌ O canal de análise configurado não está disponível."
    );
    return;
  }

  const analysisId = generateId(12);

  const analysis = {
    id: analysisId,
    betId: bet.id,
    guildId: message.guild.id,
    type,
    requesterId: message.author.id,
    analystId: null,
    channelId: analysisChannel.id,
    messageId: null,
    createdAt: Date.now(),
    status: "aguardando"
  };

  db.analyses[analysisId] = analysis;
  saveDatabase();

  const sent = await analysisChannel.send({
    embeds: [
      analysisEmbed(type, bet)
    ],
    components: [
      analysisButton(analysisId)
    ]
  });

  analysis.messageId = sent.id;

  saveDatabase();

  await message.reply(
    `🔎 Análise ${type === "mobile" ? "Mobile" : "Emulador"} solicitada com sucesso.`
  );
}

// ============================================================
// COMANDO .MED
// ============================================================

async function handleDotMed(message) {
  if (!message.guild) return;

  if (!isMediator(message.member, message.guild.id)) {
    await message.reply(
      "❌ Você não tem permissão para usar este comando."
    );
    return;
  }

  const bet = findBetByChannel(message.channel.id);

  if (!bet) {
    await message.reply(
      "❌ O comando `.med` deve ser usado dentro do canal privado de uma aposta."
    );
    return;
  }

  if (bet.mediatorId && bet.mediatorId !== message.author.id) {
    await message.reply(
      `❌ Esta aposta já possui o mediador <@${bet.mediatorId}>.`
    );
    return;
  }

  bet.mediatorId = message.author.id;

  saveDatabase();

  await message.channel.permissionOverwrites.edit(
    message.author.id,
    {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    }
  ).catch(() => {});

  await message.channel.send({
    embeds: [
      mediatorPanelEmbed(bet)
    ],
    components: mediatorPanelButtons(bet)
  });
}

// ============================================================
// /MED — FILA PÚBLICA DE MEDIADORES
// ============================================================

function mediatorQueueEmbed(guildId) {
  const config = getGuildConfig(guildId);

  const lines = [];

  if (config.mediators.length === 0) {
    lines.push("👥 Nenhum mediador cadastrado.");
  } else {
    for (const mediator of config.mediators) {
      lines.push(
        `👤 **${mediator.name}** — <@${mediator.id}>`
      );
    }
  }

  return new EmbedBuilder()
    .setTitle("👮 FILA DE MEDIADORES")
    .setDescription(lines.join("\n"));
}

async function publishMediatorQueue(interaction) {
  if (!interaction.guild) return;

  await interaction.reply({
    embeds: [
      mediatorQueueEmbed(interaction.guild.id)
    ]
  });
}

// ============================================================
// /FILA — INÍCIO
// ============================================================

async function startFila(interaction) {
  await interaction.reply({
    content: "🎯 Escolha o formato da fila:",
    components: [
      filaFormatSelect()
    ],
    ephemeral: true
  });
}

// ============================================================
// PUBLICAR AS 12 FILAS
// ============================================================

async function publishQueues(
  interaction,
  channel,
  format,
  modality
) {
  if (!channel || !channel.isTextBased()) {
    throw new Error(
      "O canal escolhido não permite mensagens."
    );
  }

  const createdQueues = [];

  for (const value of VALUES) {
    const queue = createQueueData({
      guildId: interaction.guild.id,
      channelId: channel.id,
      format,
      modality,
      value
    });

    const message = await channel.send({
      embeds: [
        queueEmbed(queue)
      ],
      components: queueButtons(queue)
    });

    queue.messageId = message.id;

    createdQueues.push(queue);
  }

  saveDatabase();

  return createdQueues;
}

// ============================================================
// CRIAR APOSTA QUANDO A FILA CHEGAR A 2
// ============================================================

async function startBetFromQueue(queue) {
  if (!queue) return null;

  if (queue.players.length !== queueCapacity()) {
    return null;
  }

  const guild =
    client.guilds.cache.get(queue.guildId);

  if (!guild) return null;

  const categoryId =
    getGuildConfig(queue.guildId).betsCategoryId;

  const bet = createBet({
    guildId: queue.guildId,
    categoryId,
    format: queue.format,
    modality: queue.modality,
    value: queue.value,
    players: queue.players
  });

  const channel =
    await createBetChannel(guild, bet);

  await channel.send({
    content: queue.players
      .map(id => `<@${id}>`)
      .join(" "),
    embeds: [
      betEmbed(bet)
    ],
    components: betPaymentButtons(bet)
  });

  deleteQueue(queue.id);

  return bet;
}

// ============================================================
// ENTRAR NA FILA
// ============================================================

async function enterQueue(interaction, queue, gelo = null) {
  if (!queue) {
    await interaction.reply({
      content: "❌ Fila não encontrada.",
      ephemeral: true
    });
    return;
  }

  if (queue.players.includes(interaction.user.id)) {
    await interaction.reply({
      content: "❌ Você já está nesta fila.",
      ephemeral: true
    });
    return;
  }

  if (queue.players.length >= queueCapacity()) {
    await interaction.reply({
      content: "❌ Esta fila já está cheia.",
      ephemeral: true
    });
    return;
  }

  // ----------------------------------------------------------
  // 1x1 — Gelo
  // ----------------------------------------------------------

  if (queue.format === "1x1") {
    if (!gelo) {
      await interaction.reply({
        content: "❌ Escolha o tipo de gelo.",
        ephemeral: true
      });
      return;
    }

    if (queue.players.length === 1) {
      queue.gelo = gelo;
    } else if (queue.gelo !== gelo) {
      await interaction.reply({
        content: "❌ O segundo jogador precisa escolher o mesmo tipo de gelo.",
        ephemeral: true
      });
      return;
    }
  }

  queue.players.push(interaction.user.id);

  saveDatabase();

  await interaction.message.edit({
    embeds: [
      queueEmbed(queue)
    ],
    components: queueButtons(queue)
  }).catch(() => {});

  await interaction.reply({
    content: "✅ Você entrou na fila.",
    ephemeral: true
  });

  if (queue.players.length >= queueCapacity()) {
    await startBetFromQueue(queue);
  }
}

// ============================================================
// SAIR DA FILA
// ============================================================

async function leaveQueue(interaction, queue) {
  if (!queue) {
    await interaction.reply({
      content: "❌ Fila não encontrada.",
      ephemeral: true
    });
    return;
  }

  const index =
    queue.players.indexOf(interaction.user.id);

  if (index === -1) {
    await interaction.reply({
      content: "❌ Você não está nesta fila.",
      ephemeral: true
    });
    return;
  }

  queue.players.splice(index, 1);

  if (queue.format === "1x1") {
    if (queue.players.length === 0) {
      delete queue.gelo;
    }
  }

  saveDatabase();

  await interaction.message.edit({
    embeds: [
      queueEmbed(queue)
    ],
    components: queueButtons(queue)
  }).catch(() => {});

  await interaction.reply({
    content: "🚪 Você saiu da fila.",
    ephemeral: true
  });
}

// ============================================================
// PAGAMENTO
// ============================================================

async function confirmPayment(interaction, bet, targetUserId) {
  if (!bet) {
    await interaction.reply({
      content: "❌ Aposta não encontrada.",
      ephemeral: true
    });
    return;
  }

  if (interaction.user.id !== targetUserId) {
    await interaction.reply({
      content: "❌ Esse botão pertence ao outro jogador.",
      ephemeral: true
    });
    return;
  }

  if (!bet.players.includes(interaction.user.id)) {
    await interaction.reply({
      content: "❌ Você não participa desta aposta.",
      ephemeral: true
    });
    return;
  }

  if (bet.payments[targetUserId]) {
    await interaction.reply({
      content: "✅ Seu pagamento já foi confirmado.",
      ephemeral: true
    });
    return;
  }

  bet.payments[targetUserId] = true;

  const allPaid =
    bet.players.every(
      userId => bet.payments[userId] === true
    );

  if (allPaid) {
    bet.status = "aguardando_sala";
  }

  saveDatabase();

  await interaction.message.edit({
    embeds: [
      betEmbed(bet)
    ],
    components: allPaid
      ? []
      : betPaymentButtons(bet)
  }).catch(() => {});

  await interaction.reply({
    content: allPaid
      ? "✅ Pagamento confirmado. Os dois jogadores confirmaram o pagamento."
      : "✅ Pagamento confirmado.",
    ephemeral: true
  });

  if (allPaid) {
    await interaction.channel.send(
      "💰 Os dois jogadores confirmaram o pagamento. Aguardando o mediador abrir a sala."
    );
  }
}

// ============================================================
// ABRIR SALA
// ============================================================

async function openRoom(interaction, bet) {
  if (!isMediator(interaction.member, interaction.guild.id)) {
    await interaction.reply({
      content: "❌ Apenas mediadores podem abrir a sala.",
      ephemeral: true
    });
    return;
  }

  if (
    bet.mediatorId &&
    bet.mediatorId !== interaction.user.id
  ) {
    await interaction.reply({
      content: `❌ O mediador desta aposta é <@${bet.mediatorId}>.`,
      ephemeral: true
    });
    return;
  }

  bet.mediatorId = interaction.user.id;

  saveDatabase();

  await interaction.showModal(
    roomModal(bet.id)
  );
}

// ============================================================
// PROCESSAR SALA
// ============================================================

async function processRoomModal(interaction, bet) {
  const roomId =
    interaction.fields.getTextInputValue("room_id");

  const password =
    interaction.fields.getTextInputValue("room_password");

  bet.roomId = roomId;
  bet.roomPassword = password;
  bet.status = "em_andamento";
  bet.mediatorId = interaction.user.id;

  saveDatabase();

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("🏠 SALA ABERTA")
        .setDescription(
          [
            `🆔 ID da sala: **${roomId}**`,
            `🔑 Senha: **${password}**`,
            "",
            `👥 <@${bet.players[0]}>`,
            `👥 <@${bet.players[1]}>`
          ].join("\n")
        )
    ]
  });
}

// ============================================================
// ESCOLHER VENCEDOR
// ============================================================

async function chooseWinner(interaction, bet) {
  if (!isMediator(interaction.member, interaction.guild.id)) {
    await interaction.reply({
      content: "❌ Apenas mediadores podem escolher o vencedor.",
      ephemeral: true
    });
    return;
  }

  if (
    bet.mediatorId &&
    bet.mediatorId !== interaction.user.id
  ) {
    await interaction.reply({
      content: `❌ O mediador desta aposta é <@${bet.mediatorId}>.`,
      ephemeral: true
    });
    return;
  }

  bet.mediatorId = interaction.user.id;

  await interaction.showModal(
    winnerModal(bet.id)
  );
}

// ============================================================
// PROCESSAR VENCEDOR
// ============================================================

async function processWinnerModal(interaction, bet) {
  const winnerId =
    interaction.fields.getTextInputValue("winner_id").trim();

  if (!bet.players.includes(winnerId)) {
    await interaction.reply({
      content: "❌ O ID informado não pertence a nenhum dos jogadores.",
      ephemeral: true
    });
    return;
  }

  const loserId =
    bet.players.find(id => id !== winnerId);

  if (!loserId) {
    await interaction.reply({
      content: "❌ Não foi possível identificar o perdedor.",
      ephemeral: true
    });
    return;
  }

  bet.winnerId = winnerId;
  bet.status = "finalizada";
  bet.mediatorId = interaction.user.id;

  registerBetResult(
    interaction.guild.id,
    winnerId,
    loserId,
    bet.value,
    false
  );

  saveDatabase();

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("🏆 RESULTADO")
        .setDescription(
          [
            `🏆 Vencedor: <@${winnerId}>`,
            `❌ Perdedor: <@${loserId}>`,
            "",
            `💰 Valor: ${moneyBRL(bet.value)}`
          ].join("\n")
        )
    ]
  });
}

// ============================================================
// VITÓRIA POR W.O.
// ============================================================

async function handleWO(interaction, bet) {
  if (!isMediator(interaction.member, interaction.guild.id)) {
    await interaction.reply({
      content: "❌ Apenas mediadores podem registrar W.O.",
      ephemeral: true
    });
    return;
  }

  if (
    bet.mediatorId &&
    bet.mediatorId !== interaction.user.id
  ) {
    await interaction.reply({
      content: `❌ O mediador desta aposta é <@${bet.mediatorId}>.`,
      ephemeral: true
    });
    return;
  }

  bet.mediatorId = interaction.user.id;

  const availablePlayer =
    bet.players.find(
      userId => userId !== interaction.user.id
    );

  if (!availablePlayer) {
    await interaction.reply({
      content: "❌ Não foi possível identificar o vencedor por W.O.",
      ephemeral: true
    });
    return;
  }

  await interaction.channel.send({
    content:
      "⚠️ Para registrar W.O., informe no comando abaixo o ID do jogador vencedor:\n" +
      "`.wo <ID>`"
  });

  await interaction.reply({
    content: "⚠️ Solicitação de W.O. iniciada.",
    ephemeral: true
  });
}// ============================================================
// CONFIGURAÇÃO — SELEÇÃO DE CANAIS
// ============================================================

async function handleConfigChannelSelect(interaction) {
  const selectedId = interaction.values[0];
  const config = getGuildConfig(interaction.guild.id);

  switch (interaction.customId) {
    case "cfg_mobile_select": {
      const channel =
        interaction.guild.channels.cache.get(selectedId);

      if (!channel) {
        await interaction.reply({
          content: "❌ Canal não encontrado.",
          ephemeral: true
        });
        return;
      }

      config.mobileChannelId = selectedId;
      saveDatabase();

      await interaction.update({
        embeds: [
          configEmbed(interaction.guild.id)
        ],
        components: configButtons()
      });

      return;
    }

    case "cfg_emulator_select": {
      const channel =
        interaction.guild.channels.cache.get(selectedId);

      if (!channel) {
        await interaction.reply({
          content: "❌ Canal não encontrado.",
          ephemeral: true
        });
        return;
      }

      config.emulatorChannelId = selectedId;
      saveDatabase();

      await interaction.update({
        embeds: [
          configEmbed(interaction.guild.id)
        ],
        components: configButtons()
      });

      return;
    }

    case "cfg_category_select": {
      const channel =
        interaction.guild.channels.cache.get(selectedId);

      if (!channel || channel.type !== ChannelType.GuildCategory) {
        await interaction.reply({
          content: "❌ Você precisa selecionar uma categoria.",
          ephemeral: true
        });
        return;
      }

      config.betsCategoryId = selectedId;
      saveDatabase();

      await interaction.update({
        embeds: [
          configEmbed(interaction.guild.id)
        ],
        components: configButtons()
      });

      return;
    }

    case "cfg_mobile_analysis_select": {
      const channel =
        interaction.guild.channels.cache.get(selectedId);

      if (!channel || !channel.isTextBased()) {
        await interaction.reply({
          content: "❌ Selecione um canal de texto.",
          ephemeral: true
        });
        return;
      }

      config.mobileAnalysisChannelId = selectedId;
      saveDatabase();

      await interaction.update({
        embeds: [
          configEmbed(interaction.guild.id)
        ],
        components: configButtons()
      });

      return;
    }

    case "cfg_emulator_analysis_select": {
      const channel =
        interaction.guild.channels.cache.get(selectedId);

      if (!channel || !channel.isTextBased()) {
        await interaction.reply({
          content: "❌ Selecione um canal de texto.",
          ephemeral: true
        });
        return;
      }

      config.emulatorAnalysisChannelId = selectedId;
      saveDatabase();

      await interaction.update({
        embeds: [
          configEmbed(interaction.guild.id)
        ],
        components: configButtons()
      });

      return;
    }

    default:
      return;
  }
}

// ============================================================
// CONFIGURAÇÃO — CARGOS
// ============================================================

async function handleConfigRoleSelect(interaction) {
  const roleId = interaction.values[0];
  const config = getGuildConfig(interaction.guild.id);

  if (interaction.customId === "cfg_mediator_role_select") {
    config.mediatorRoleId = roleId;
  }

  if (interaction.customId === "cfg_analyst_role_select") {
    config.analystRoleId = roleId;
  }

  saveDatabase();

  await interaction.update({
    embeds: [
      configEmbed(interaction.guild.id)
    ],
    components: configButtons()
  });
}

// ============================================================
// CONFIGURAÇÃO — MEDIADORES
// ============================================================

function mediatorsListEmbed(guildId) {
  const config = getGuildConfig(guildId);

  if (config.mediators.length === 0) {
    return new EmbedBuilder()
      .setTitle("👥 MEDIADORES")
      .setDescription(
        "Nenhum mediador cadastrado."
      );
  }

  const lines = config.mediators.map(
    (mediator, index) => {
      return [
        `**${index + 1}. ${mediator.name}**`,
        `👤 <@${mediator.id}>`,
        `💳 Pix: \`${mediator.pix}\``,
        mediator.qr
          ? `📷 QR Code: ${mediator.qr}`
          : "📷 QR Code: não informado"
      ].join("\n");
    }
  );

  return new EmbedBuilder()
    .setTitle("👥 MEDIADORES")
    .setDescription(
      lines.join("\n\n")
    )
    .setFooter({
      text: `${config.mediators.length}/${MAX_MEDIATORS} mediadores`
    });
}

function mediatorRemoveSelect(guildId) {
  const config = getGuildConfig(guildId);

  if (config.mediators.length === 0) {
    return null;
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("cfg_remove_mediator_select")
      .setPlaceholder("➖ Escolha o mediador")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        config.mediators.map(mediator => ({
          label: mediator.name.slice(0, 100),
          description: mediator.id,
          value: mediator.id,
          emoji: "👤"
        }))
      )
  );
}

// ============================================================
// CONFIGURAÇÃO — ADICIONAR MEDIADOR
// ============================================================

async function addMediatorId(interaction) {
  const config = getGuildConfig(interaction.guild.id);

  if (config.mediators.length >= MAX_MEDIATORS) {
    await interaction.reply({
      content:
        `❌ Limite máximo atingido: ${MAX_MEDIATORS}/${MAX_MEDIATORS} mediadores.`,
      ephemeral: true
    });
    return;
  }

  await interaction.showModal(
    mediatorAddIdModal()
  );
}

async function processMediatorId(interaction) {
  const userId =
    interaction.fields
      .getTextInputValue("mediator_id")
      .trim();

  if (!/^\d{17,20}$/.test(userId)) {
    await interaction.reply({
      content: "❌ O ID do Discord informado é inválido.",
      ephemeral: true
    });
    return;
  }

  const config = getGuildConfig(interaction.guild.id);

  if (
    config.mediators.some(
      mediator => mediator.id === userId
    )
  ) {
    await interaction.reply({
      content: "❌ Este usuário já está cadastrado como mediador.",
      ephemeral: true
    });
    return;
  }

  if (config.mediators.length >= MAX_MEDIATORS) {
    await interaction.reply({
      content:
        `❌ Limite máximo atingido: ${MAX_MEDIATORS}/${MAX_MEDIATORS}.`,
      ephemeral: true
    });
    return;
  }

  const member =
    await interaction.guild.members
      .fetch(userId)
      .catch(() => null);

  if (!member) {
    await interaction.reply({
      content:
        "❌ Não encontrei esse usuário neste servidor.",
      ephemeral: true
    });
    return;
  }

  await interaction.showModal(
    mediatorDataModal(userId)
  );
}

// ============================================================
// CONFIGURAÇÃO — SALVAR MEDIADOR
// ============================================================

async function processMediatorData(interaction) {
  const userId =
    interaction.customId.split("|")[1];

  const name =
    interaction.fields
      .getTextInputValue("mediator_name")
      .trim();

  const pix =
    interaction.fields
      .getTextInputValue("mediator_pix")
      .trim();

  const qr =
    interaction.fields
      .getTextInputValue("mediator_qr")
      .trim();

  const config = getGuildConfig(interaction.guild.id);

  if (config.mediators.length >= MAX_MEDIATORS) {
    await interaction.reply({
      content:
        `❌ Limite máximo atingido: ${MAX_MEDIATORS}/${MAX_MEDIATORS}.`,
      ephemeral: true
    });
    return;
  }

  if (
    config.mediators.some(
      mediator => mediator.id === userId
    )
  ) {
    await interaction.reply({
      content:
        "❌ Este usuário já está cadastrado como mediador.",
      ephemeral: true
    });
    return;
  }

  config.mediators.push({
    id: userId,
    name,
    pix,
    qr
  });

  saveDatabase();

  await interaction.reply({
    content:
      `✅ Mediador **${name}** adicionado. (${config.mediators.length}/${MAX_MEDIATORS})`,
    ephemeral: true
  });
}

// ============================================================
// CONFIGURAÇÃO — REMOVER MEDIADOR
// ============================================================

async function removeMediator(interaction) {
  const config = getGuildConfig(interaction.guild.id);

  if (config.mediators.length === 0) {
    await interaction.reply({
      content: "❌ Não existem mediadores cadastrados.",
      ephemeral: true
    });
    return;
  }

  const select = mediatorRemoveSelect(
    interaction.guild.id
  );

  await interaction.reply({
    content: "➖ Escolha o mediador que deseja remover:",
    components: select ? [select] : [],
    ephemeral: true
  });
}

async function processRemoveMediator(interaction) {
  const userId = interaction.values[0];

  const config = getGuildConfig(interaction.guild.id);

  const index =
    config.mediators.findIndex(
      mediator => mediator.id === userId
    );

  if (index === -1) {
    await interaction.reply({
      content: "❌ Mediador não encontrado.",
      ephemeral: true
    });
    return;
  }

  const removed =
    config.mediators.splice(index, 1)[0];

  saveDatabase();

  await interaction.update({
    content:
      `✅ Mediador **${removed.name}** removido.`,
    components: []
  });
}

// ============================================================
// CONFIGURAÇÃO — TAXA
// ============================================================

async function processFee(interaction) {
  const raw =
    interaction.fields
      .getTextInputValue("fee")
      .trim()
      .replace(",", ".");

  const fee = Number(raw);

  if (!Number.isFinite(fee) || fee < 0) {
    await interaction.reply({
      content: "❌ Informe uma taxa válida.",
      ephemeral: true
    });
    return;
  }

  const config =
    getGuildConfig(interaction.guild.id);

  config.fee = fee;

  saveDatabase();

  await interaction.reply({
    content:
      `✅ Taxa configurada para **${fee}%**.`,
    ephemeral: true
  });
}

// ============================================================
// ANÁLISE — ASSUMIR
// ============================================================

async function claimAnalysis(interaction, analysis) {
  if (!analysis) {
    await interaction.reply({
      content: "❌ Análise não encontrada.",
      ephemeral: true
    });
    return;
  }

  if (!isAnalyst(
    interaction.member,
    interaction.guild.id
  )) {
    await interaction.reply({
      content:
        "❌ Apenas usuários com o cargo de Analista podem assumir esta análise.",
      ephemeral: true
    });
    return;
  }

  if (analysis.status !== "aguardando") {
    await interaction.reply({
      content:
        `❌ Esta análise já foi assumida por <@${analysis.analystId}>.`,
      ephemeral: true
    });
    return;
  }

  const bet = getBet(analysis.betId);

  if (!bet) {
    await interaction.reply({
      content: "❌ Aposta vinculada à análise não encontrada.",
      ephemeral: true
    });
    return;
  }

  analysis.status = "assumida";
  analysis.analystId = interaction.user.id;

  bet.analystId = interaction.user.id;

  saveDatabase();

  if (bet.channelId) {
    const betChannel =
      await interaction.guild.channels
        .fetch(bet.channelId)
        .catch(() => null);

    if (betChannel) {
      await betChannel.permissionOverwrites.edit(
        interaction.user.id,
        {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        }
      ).catch(() => {});
    }
  }

  await interaction.update({
    embeds: [
      analysisAssumedEmbed(
        analysis.type,
        bet,
        interaction.user.id
      )
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("analysis_claimed")
          .setLabel("Análise Assumida")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true)
      )
    ]
  });
}

// ============================================================
// /FILA — PUBLICAÇÃO
// ============================================================

async function handleFilaFormat(interaction) {
  const format = interaction.values[0];

  await interaction.update({
    content:
      `🎯 Formato escolhido: **${format}**\n\n📱 Agora escolha a modalidade:`,
    components: [
      filaModalitySelect()
    ]
  });

  interaction.client.filaSelections ??= {};

  interaction.client.filaSelections[interaction.user.id] = {
    format
  };
}

async function handleFilaModality(interaction) {
  const modality = interaction.values[0];

  interaction.client.filaSelections ??= {};

  const selection =
    interaction.client.filaSelections[
      interaction.user.id
    ];

  if (!selection?.format) {
    await interaction.reply({
      content:
        "❌ A sessão da fila expirou. Use `/fila` novamente.",
      ephemeral: true
    });
    return;
  }

  selection.modality = modality;

  await interaction.update({
    content:
      `🎯 Formato: **${selection.format}**\n` +
      `📱 Modalidade: **${modality}**\n\n` +
      "📢 Agora escolha o canal onde as filas serão publicadas:",
    components: [
      filaChannelSelect()
    ]
  });
}

async function handleFilaChannel(interaction) {
  const channelId = interaction.values[0];

  interaction.client.filaSelections ??= {};

  const selection =
    interaction.client.filaSelections[
      interaction.user.id
    ];

  if (!selection?.format || !selection?.modality) {
    await interaction.reply({
      content:
        "❌ A sessão da fila expirou. Use `/fila` novamente.",
      ephemeral: true
    });
    return;
  }

  const channel =
    interaction.guild.channels.cache.get(channelId);

  if (!channel || !channel.isTextBased()) {
    await interaction.reply({
      content:
        "❌ O canal selecionado não permite publicação de mensagens.",
      ephemeral: true
    });
    return;
  }

  await interaction.update({
    content:
      "⏳ Publicando as 12 filas...",
    components: []
  });

  try {
    const queues = await publishQueues(
      interaction,
      channel,
      selection.format,
      selection.modality
    );

    delete interaction.client.filaSelections[
      interaction.user.id
    ];

    await interaction.editReply({
      content:
        `✅ **12 filas publicadas com sucesso!**\n\n` +
        `🎯 Formato: **${selection.format}**\n` +
        `📱 Modalidade: **${selection.modality}**\n` +
        `📢 Canal: ${channel}\n\n` +
        `💰 De ${moneyBRL(VALUES[0])} até ${moneyBRL(VALUES[VALUES.length - 1])}.`,
      components: []
    });

    return queues;
  } catch (error) {
    console.error(
      "❌ Erro ao publicar filas:",
      error
    );

    await interaction.editReply({
      content:
        "❌ Ocorreu um erro ao publicar as filas.",
      components: []
    });
  }
}

// ============================================================
// CONFIGURAÇÃO — ATUALIZAR PAINEL
// ============================================================

async function updateConfigPanel(interaction) {
  await interaction.reply({
    embeds: [
      configEmbed(interaction.guild.id)
    ],
    components: configButtons(),
    ephemeral: true
  });
}

// ============================================================
// COMANDOS SLASH
// ============================================================

const slashCommands = [
  {
    name: "fila",
    description: "Publica as filas de apostas"
  },
  {
    name: "med",
    description: "Publica a fila pública de mediadores"
  },
  {
    name: "config",
    description: "Configura o bot neste servidor"
  }
];

// ============================================================
// REGISTRO DOS SLASH COMMANDS
// ============================================================

async function registerCommands() {
  try {
    if (!client.application) {
      console.log(
        "⚠️ Aplicação ainda não disponível para registrar comandos."
      );
      return;
    }

    const guildId = process.env.GUILD_ID;

    if (guildId) {
      const guild =
        client.guilds.cache.get(guildId);

      if (guild) {
        await guild.commands.set(
          slashCommands
        );

        console.log(
          `✅ Comandos registrados no servidor ${guild.name}.`
        );

        return;
      }
    }

    await client.application.commands.set(
      slashCommands
    );

    console.log(
      "✅ Comandos slash registrados globalmente."
    );
  } catch (error) {
    console.error(
      "❌ Erro ao registrar comandos:",
      error
    );
  }
}// ============================================================
// INTERAÇÕES
// ============================================================

client.on(Events.InteractionCreate, async interaction => {
  try {
    // ========================================================
    // SLASH COMMANDS
    // ========================================================

    if (interaction.isChatInputCommand()) {
      if (!interaction.guild) {
        await interaction.reply({
          content: "❌ Este comando só pode ser usado em um servidor.",
          ephemeral: true
        });
        return;
      }

      // ------------------------------------------------------
      // /fila
      // ------------------------------------------------------

      if (interaction.commandName === "fila") {
        if (!isAdmin(interaction.member)) {
          await interaction.reply({
            content:
              "❌ Apenas administradores podem usar `/fila`.",
            ephemeral: true
          });
          return;
        }

        await startFila(interaction);
        return;
      }

      // ------------------------------------------------------
      // /med
      // ------------------------------------------------------

      if (interaction.commandName === "med") {
        if (!isAdmin(interaction.member)) {
          await interaction.reply({
            content:
              "❌ Apenas administradores podem usar `/med`.",
            ephemeral: true
          });
          return;
        }

        await publishMediatorQueue(interaction);
        return;
      }

      // ------------------------------------------------------
      // /config
      // ------------------------------------------------------

      if (interaction.commandName === "config") {
        if (!isAdmin(interaction.member)) {
          await interaction.reply({
            content:
              "❌ Apenas administradores podem usar `/config`.",
            ephemeral: true
          });
          return;
        }

        await updateConfigPanel(interaction);
        return;
      }
    }

    // ========================================================
    // BOTÕES
    // ========================================================

    if (interaction.isButton()) {
      const id = interaction.customId;

      // ------------------------------------------------------
      // FILA — ENTRAR
      // ------------------------------------------------------

      if (id.startsWith("qe|")) {
        const queueId = id.split("|")[1];
        const queue = getQueue(queueId);

        await enterQueue(
          interaction,
          queue
        );

        return;
      }

      // ------------------------------------------------------
      // FILA — SAIR
      // ------------------------------------------------------

      if (id.startsWith("ql|")) {
        const queueId = id.split("|")[1];
        const queue = getQueue(queueId);

        await leaveQueue(
          interaction,
          queue
        );

        return;
      }

      // ------------------------------------------------------
      // FILA 1X1 — GELO
      // ------------------------------------------------------

      if (id.startsWith("qg|")) {
        const parts = id.split("|");

        const queueId = parts[1];
        const gelo = parts[2];

        const queue = getQueue(queueId);

        await enterQueue(
          interaction,
          queue,
          gelo
        );

        return;
      }

      // ------------------------------------------------------
      // PAGAMENTO
      // ------------------------------------------------------

      if (id.startsWith("pay|")) {
        const parts = id.split("|");

        const betId = parts[1];
        const targetUserId = parts[2];

        const bet = getBet(betId);

        await confirmPayment(
          interaction,
          bet,
          targetUserId
        );

        return;
      }

      // ------------------------------------------------------
      // ABRIR SALA
      // ------------------------------------------------------

      if (id.startsWith("room|")) {
        const betId = id.split("|")[1];
        const bet = getBet(betId);

        if (!bet) {
          await interaction.reply({
            content: "❌ Aposta não encontrada.",
            ephemeral: true
          });
          return;
        }

        await openRoom(
          interaction,
          bet
        );

        return;
      }

      // ------------------------------------------------------
      // ESCOLHER VENCEDOR
      // ------------------------------------------------------

      if (id.startsWith("winner|")) {
        const betId = id.split("|")[1];
        const bet = getBet(betId);

        if (!bet) {
          await interaction.reply({
            content: "❌ Aposta não encontrada.",
            ephemeral: true
          });
          return;
        }

        await chooseWinner(
          interaction,
          bet
        );

        return;
      }

      // ------------------------------------------------------
      // W.O.
      // ------------------------------------------------------

      if (id.startsWith("wo|")) {
        const betId = id.split("|")[1];
        const bet = getBet(betId);

        if (!bet) {
          await interaction.reply({
            content: "❌ Aposta não encontrada.",
            ephemeral: true
          });
          return;
        }

        await handleWO(
          interaction,
          bet
        );

        return;
      }

      // ------------------------------------------------------
      // FINALIZAR APOSTA
      // ------------------------------------------------------

      if (id.startsWith("finish|")) {
        const betId = id.split("|")[1];
        const bet = getBet(betId);

        if (!bet) {
          await interaction.reply({
            content: "❌ Aposta não encontrada.",
            ephemeral: true
          });
          return;
        }

        if (
          !isMediator(
            interaction.member,
            interaction.guild.id
          )
        ) {
          await interaction.reply({
            content:
              "❌ Apenas mediadores podem finalizar a aposta.",
            ephemeral: true
          });
          return;
        }

        if (
          bet.mediatorId &&
          bet.mediatorId !== interaction.user.id
        ) {
          await interaction.reply({
            content:
              `❌ O mediador desta aposta é <@${bet.mediatorId}>.`,
            ephemeral: true
          });
          return;
        }

        bet.mediatorId = interaction.user.id;

        saveDatabase();

        await interaction.deferUpdate();

        await finalizeBetChannel(
          interaction.channel,
          bet
        );

        return;
      }

      // ------------------------------------------------------
      // ANÁLISE — ASSUMIR
      // ------------------------------------------------------

      if (id.startsWith("analysis_claim|")) {
        const analysisId =
          id.split("|")[1];

        const analysis =
          db.analyses[analysisId];

        await claimAnalysis(
          interaction,
          analysis
        );

        return;
      }

      // ------------------------------------------------------
      // CONFIGURAÇÃO — CANAL MOBILE
      // ------------------------------------------------------

      if (id === "cfg_mobile") {
        await interaction.reply({
          content:
            "📱 Escolha o canal Mobile:",
          components: [
            channelSelect(
              "cfg_mobile_select",
              "📱 Selecionar canal Mobile"
            )
          ],
          ephemeral: true
        });

        return;
      }

      // ------------------------------------------------------
      // CONFIGURAÇÃO — CANAL EMULADOR
      // ------------------------------------------------------

      if (id === "cfg_emulator") {
        await interaction.reply({
          content:
            "🖥️ Escolha o canal Emulador:",
          components: [
            channelSelect(
              "cfg_emulator_select",
              "🖥️ Selecionar canal Emulador"
            )
          ],
          ephemeral: true
        });

        return;
      }

      // ------------------------------------------------------
      // CONFIGURAÇÃO — CATEGORIA
      // ------------------------------------------------------

      if (id === "cfg_category") {
        await interaction.reply({
          content:
            "📁 Escolha a categoria das apostas:",
          components: [
            channelSelect(
              "cfg_category_select",
              "📁 Selecionar categoria"
            )
          ],
          ephemeral: true
        });

        return;
      }

      // ------------------------------------------------------
      // CONFIGURAÇÃO — CARGO MEDIADOR
      // ------------------------------------------------------

      if (id === "cfg_mediator_role") {
        await interaction.reply({
          content:
            "👮 Escolha o cargo de Mediador:",
          components: [
            roleSelect(
              "cfg_mediator_role_select",
              "👮 Selecionar cargo de Mediador"
            )
          ],
          ephemeral: true
        });

        return;
      }

      // ------------------------------------------------------
      // CONFIGURAÇÃO — CARGO ANALISTA
      // ------------------------------------------------------

      if (id === "cfg_analyst_role") {
        await interaction.reply({
          content:
            "🔎 Escolha o cargo de Analista:",
          components: [
            roleSelect(
              "cfg_analyst_role_select",
              "🔎 Selecionar cargo de Analista"
            )
          ],
          ephemeral: true
        });

        return;
      }

      // ------------------------------------------------------
      // CONFIGURAÇÃO — ANÁLISE MOBILE
      // ------------------------------------------------------

      if (id === "cfg_mobile_analysis") {
        await interaction.reply({
          content:
            "📱 Escolha o canal de análise Mobile:",
          components: [
            channelSelect(
              "cfg_mobile_analysis_select",
              "📱 Selecionar canal"
            )
          ],
          ephemeral: true
        });

        return;
      }

      // ------------------------------------------------------
      // CONFIGURAÇÃO — ANÁLISE EMULADOR
      // ------------------------------------------------------

      if (id === "cfg_emulator_analysis") {
        await interaction.reply({
          content:
            "🖥️ Escolha o canal de análise Emulador:",
          components: [
            channelSelect(
              "cfg_emulator_analysis_select",
              "🖥️ Selecionar canal"
            )
          ],
          ephemeral: true
        });

        return;
      }

      // ------------------------------------------------------
      // CONFIGURAÇÃO — TAXA
      // ------------------------------------------------------

      if (id === "cfg_fee_button") {
        await interaction.showModal(
          feeModal()
        );

        return;
      }

      // ------------------------------------------------------
      // CONFIGURAÇÃO — MEDIADORES
      // ------------------------------------------------------

      if (id === "cfg_mediators") {
        await interaction.reply({
          embeds: [
            mediatorsListEmbed(
              interaction.guild.id
            )
          ],
          components: mediatorConfigButtons(),
          ephemeral: true
        });

        return;
      }

      // ------------------------------------------------------
      // ADICIONAR MEDIADOR
      // ------------------------------------------------------

      if (id === "cfg_add_mediator") {
        await addMediatorId(
          interaction
        );

        return;
      }

      // ------------------------------------------------------
      // REMOVER MEDIADOR
      // ------------------------------------------------------

      if (id === "cfg_remove_mediator") {
        await removeMediator(
          interaction
        );

        return;
      }

      // ------------------------------------------------------
      // LISTAR MEDIADORES
      // ------------------------------------------------------

      if (id === "cfg_list_mediators") {
        await interaction.reply({
          embeds: [
            mediatorsListEmbed(
              interaction.guild.id
            )
          ],
          ephemeral: true
        });

        return;
      }

      return;
    }

    // ========================================================
    // SELECT MENUS
    // ========================================================

    if (
      interaction.isStringSelectMenu() ||
      interaction.isChannelSelectMenu() ||
      interaction.isRoleSelectMenu()
    ) {
      const id = interaction.customId;

      // ------------------------------------------------------
      // /FILA — FORMATO
      // ------------------------------------------------------

      if (id === "fila_format") {
        await handleFilaFormat(
          interaction
        );

        return;
      }

      // ------------------------------------------------------
      // /FILA — MODALIDADE
      // ------------------------------------------------------

      if (id === "fila_modality") {
        await handleFilaModality(
          interaction
        );

        return;
      }

      // ------------------------------------------------------
      // /FILA — CANAL
      // ------------------------------------------------------

      if (id === "fila_channel") {
        await handleFilaChannel(
          interaction
        );

        return;
      }

      // ------------------------------------------------------
      // CONFIGURAÇÃO — CANAIS
      // ------------------------------------------------------

      if (
        id === "cfg_mobile_select" ||
        id === "cfg_emulator_select" ||
        id === "cfg_category_select" ||
        id === "cfg_mobile_analysis_select" ||
        id === "cfg_emulator_analysis_select"
      ) {
        await handleConfigChannelSelect(
          interaction
        );

        return;
      }

      // ------------------------------------------------------
      // CONFIGURAÇÃO — CARGOS
      // ------------------------------------------------------

      if (
        id === "cfg_mediator_role_select" ||
        id === "cfg_analyst_role_select"
      ) {
        await handleConfigRoleSelect(
          interaction
        );

        return;
      }

      // ------------------------------------------------------
      // REMOVER MEDIADOR
      // ------------------------------------------------------

      if (id === "cfg_remove_mediator_select") {
        await processRemoveMediator(
          interaction
        );

        return;
      }

      return;
    }

    // ========================================================
    // MODAIS
    // ========================================================

    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      // ------------------------------------------------------
      // ID DO MEDIADOR
      // ------------------------------------------------------

      if (id === "cfg_med_id") {
        await processMediatorId(
          interaction
        );

        return;
      }

      // ------------------------------------------------------
      // DADOS DO MEDIADOR
      // ------------------------------------------------------

      if (id.startsWith("cfg_med_data|")) {
        await processMediatorData(
          interaction
        );

        return;
      }

      // ------------------------------------------------------
      // TAXA
      // ------------------------------------------------------

      if (id === "cfg_fee") {
        await processFee(
          interaction
        );

        return;
      }

      // ------------------------------------------------------
      // SALA
      // ------------------------------------------------------

      if (id.startsWith("room_modal|")) {
        const betId =
          id.split("|")[1];

        const bet = getBet(betId);

        if (!bet) {
          await interaction.reply({
            content:
              "❌ Aposta não encontrada.",
            ephemeral: true
          });
          return;
        }

        await processRoomModal(
          interaction,
          bet
        );

        return;
      }

      // ------------------------------------------------------
      // VENCEDOR
      // ------------------------------------------------------

      if (id.startsWith("winner_modal|")) {
        const betId =
          id.split("|")[1];

        const bet = getBet(betId);

        if (!bet) {
          await interaction.reply({
            content:
              "❌ Aposta não encontrada.",
            ephemeral: true
          });
          return;
        }

        await processWinnerModal(
          interaction,
          bet
        );

        return;
      }
    }
  } catch (error) {
    console.error(
      "❌ Erro ao processar interação:",
      error
    );

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content:
            "❌ Ocorreu um erro ao processar essa ação.",
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content:
            "❌ Ocorreu um erro ao processar essa ação.",
          ephemeral: true
        });
      }
    } catch {}
  }
});

// ============================================================
// COMANDOS COM PREFIXO "."
// ============================================================

client.on(
  Events.MessageCreate,
  async message => {
    try {
      if (
        message.author.bot ||
        !message.guild ||
        !message.content.startsWith(PREFIX)
      ) {
        return;
      }

      const args =
        message.content
          .slice(PREFIX.length)
          .trim()
          .split(/\s+/);

      const command =
        (args.shift() || "").toLowerCase();

      if (!command) return;

      // ------------------------------------------------------
      // .P
      // ------------------------------------------------------

      if (command === "p") {
        await handlePlayerStats(
          message
        );

        return;
      }

      // ------------------------------------------------------
      // .MED
      // ------------------------------------------------------

      if (command === "med") {
        await handleDotMed(
          message
        );

        return;
      }

      // ------------------------------------------------------
      // .SSMOB
      // ------------------------------------------------------

      if (command === "ssmob") {
        await requestAnalysis(
          message,
          "mobile"
        );

        return;
      }

      // ------------------------------------------------------
      // .SSEMU
      // ------------------------------------------------------

      if (command === "ssemu") {
        await requestAnalysis(
          message,
          "emulador"
        );

        return;
      }

      // ------------------------------------------------------
      // .WO
      // ------------------------------------------------------
      // Usado somente quando o painel de W.O. solicitar.
      // Não é um comando público/documentado do bot.

      if (command === "wo") {
        const bet =
          findBetByChannel(
            message.channel.id
          );

        if (!bet) {
          await message.reply(
            "❌ Este comando precisa ser usado dentro de uma aposta."
          );
          return;
        }

        if (
          !isMediator(
            message.member,
            message.guild.id
          )
        ) {
          await message.reply(
            "❌ Apenas mediadores podem registrar W.O."
          );
          return;
        }

        const winnerId =
          args[0];

        if (
          !winnerId ||
          !bet.players.includes(winnerId)
        ) {
          await message.reply(
            "❌ Informe o ID de um dos jogadores da aposta."
          );
          return;
        }

        const loserId =
          bet.players.find(
            id => id !== winnerId
          );

        bet.winnerId = winnerId;
        bet.mediatorId = message.author.id;
        bet.status = "wo";

        registerBetResult(
          message.guild.id,
          winnerId,
          loserId,
          bet.value,
          true
        );

        saveDatabase();

        await message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("⚠️ VITÓRIA POR W.O.")
              .setDescription(
                [
                  `🏆 Vencedor: <@${winnerId}>`,
                  `❌ Perdedor: <@${loserId}>`,
                  "",
                  `💰 Valor: ${moneyBRL(bet.value)}`
                ].join("\n")
              )
          ]
        });

        return;
      }
    } catch (error) {
      console.error(
        "❌ Erro no comando de prefixo:",
        error
      );
    }
  }
);

// ============================================================
// READY
// ============================================================

client.once(
  Events.ClientReady,
  async readyClient => {
    console.log(
      `✅ Bot conectado como ${readyClient.user.tag}`
    );

    console.log(
      `🌐 Servidores: ${readyClient.guilds.cache.size}`
    );

    await registerCommands();
  }
);

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN);
