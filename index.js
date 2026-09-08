/*
==========================================================
 BOT DE APOSTAS DISCORD — VERSÃO COMPLETA
==========================================================

REQUISITOS:
  Node.js 18.17+
  discord.js 14+

VARIÁVEIS DE AMBIENTE:
  DISCORD_TOKEN = token do bot
  CLIENT_ID     = ID da aplicação
  GUILD_ID      = opcional; registra comandos no servidor

COMANDOS:
  /config
  /fila
  /cadastro
  .ssmob
  .ssemu
  .med
  .p

REGRAS:
  - Embeds organizadas e autoexplicativas.
  - Taxa configurável entre R$0,01 e R$0,50.
  - Até 20 ADMs cadastrados.
  - Valores de fila: 0,30 / 0,50 / 0,75 / 1 / 2 / 3 / 5 / 7 / 10 / 20 / 50 / 100.
  - Fila: 1x1 / 2x2 / 3x3 / 4x4.
  - Modalidade: Mobile / Emulador / Misto.
  - 1x1: Gelo Normal / Gelo Infinito / Sair.
  - 2x2, 3x3, 4x4: Entrar / Sair.
  - Fila de Mediadores: somente cargo Mediador.
  - Rodízio de Mediadores.
  - Sem Mediador disponível, aposta não pode ser puxada.
  - .p mostra: Vitórias / Derrotas / Vitórias por W.O. / Coins.
  - NÃO existe "Vitórias normais" no .p.
==========================================================
*/

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
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
  ChannelType,
} = require("discord.js");

const fs = require("fs");
const path = require("path");

/* ========================================================
   AMBIENTE
======================================================== */

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || null;

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN não configurado.");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("❌ CLIENT_ID não configurado.");
  process.exit(1);
}

/* ========================================================
   BANCO LOCAL
======================================================== */

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const ALLOWED_VALUES = [
  0.30, 0.50, 0.75, 1.00, 2.00, 3.00,
  5.00, 7.00, 10.00, 20.00, 50.00, 100.00
];

const FORMATS = ["1x1", "2x2", "3x3", "4x4"];
const MODALITIES = ["mobile", "emulador", "misto"];

function createDefaultDatabase() {
  return {
    config: {
      mediatorRoleId: null,
      analystRoleId: null,
      admins: [],
      fee: 0.01,
      embedColor: "#5865F2",
      profileImage: null,
      ssmobChannelId: null,
      ssemuChannelId: null,
      mediatorQueueChannelId: null,
      betCategoryId: null,
      mediatorQueueMessageId: null
    },

    pix: {},

    users: {},

    queues: {},

    mediatorQueue: [],

    mediatorRotation: 0,

    bets: {},

    analyses: {},

    createdAt: Date.now()
  };
}

function loadDatabase() {
  if (!fs.existsSync(DATA_FILE)) {
    const fresh = createDefaultDatabase();
    fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return mergeDefaults(createDefaultDatabase(), parsed);
  } catch (error) {
    console.error("⚠️ Banco inválido. Criando novo banco.", error);
    const fresh = createDefaultDatabase();
    fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

function mergeDefaults(base, data) {
  for (const key of Object.keys(data || {})) {
    if (
      data[key] &&
      typeof data[key] === "object" &&
      !Array.isArray(data[key]) &&
      base[key] &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      mergeDefaults(base[key], data[key]);
    } else {
      base[key] = data[key];
    }
  }

  return base;
}

let db = loadDatabase();

// Configurações temporárias do comando /fila por usuário.
const filaSetup = new Map();

function saveDatabase() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

/* ========================================================
   FUNÇÕES UTILITÁRIAS
======================================================== */

function money(value) {
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
}

function parseMoney(value) {
  return Number(String(value).trim().replace(",", "."));
}

function valueId(value) {
  return Number(value).toFixed(2);
}

function validHex(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function validUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function modalityName(modality) {
  const names = {
    mobile: "Mobile",
    emulador: "Emulador",
    misto: "Misto"
  };

  return names[modality] || modality;
}

function formatName(format) {
  return format;
}

function requiredPlayers(format) {
  // Toda fila representa uma aposta entre exatamente 2 jogadores,
  // independentemente do formato da partida.
  return 2;
}

function userStats(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      wins: 0,
      losses: 0,
      woWins: 0,
      coins: 0
    };
  }

  return db.users[userId];
}

function configEmbed() {
  const c = db.config;

  return makeEmbed(
    "⚙️ CONFIGURAÇÃO DO BOT",
    [
      "Use os botões abaixo para configurar cada parte do sistema.",
      "",
      `👤 **Mediador:** ${c.mediatorRoleId ? `<@&${c.mediatorRoleId}>` : "Não configurado"}`,
      `🔎 **Analista:** ${c.analystRoleId ? `<@&${c.analystRoleId}>` : "Não configurado"}`,
      `👑 **ADMs:** ${c.admins.length}/20`,
      `💰 **Taxa:** ${money(c.fee)}`,
      `🎨 **Cor:** \`${c.embedColor}\``,
      `🖼️ **Foto:** ${c.profileImage ? "Configurada" : "Não configurada"}`,
      `📱 **Canal Mobile:** ${c.ssmobChannelId ? `<#${c.ssmobChannelId}>` : "Não configurado"}`,
      `🖥️ **Canal Emulador:** ${c.ssemuChannelId ? `<#${c.ssemuChannelId}>` : "Não configurado"}`,
      `👨‍⚖️ **Fila de Mediadores:** ${c.mediatorQueueChannelId ? `<#${c.mediatorQueueChannelId}>` : "Não configurada"}`,
      `📁 **Categoria das apostas:** ${c.betCategoryId ? `<#${c.betCategoryId}>` : "Não configurada"}`
    ].join("\n")
  );
}

function makeEmbed(title, description = "") {
  const result = new EmbedBuilder()
    .setColor(db.config.embedColor || "#5865F2")
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  if (db.config.profileImage && validUrl(db.config.profileImage)) {
    result.setThumbnail(db.config.profileImage);
  }

  return result;
}

function adminCheck(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    db.config.admins.includes(interaction.user.id)
  );
}

function mediatorCheck(interaction) {
  return Boolean(
    db.config.mediatorRoleId &&
    interaction.member?.roles?.cache?.has(db.config.mediatorRoleId)
  );
}

function analystCheck(interaction) {
  return Boolean(
    db.config.analystRoleId &&
    interaction.member?.roles?.cache?.has(db.config.analystRoleId)
  );
}

async function deny(interaction, text) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ content: text, ephemeral: true }).catch(() => {});
  }

  return interaction.reply({ content: text, ephemeral: true }).catch(() => {});
}

async function requireAdmin(interaction) {
  if (!adminCheck(interaction)) {
    await deny(interaction, "❌ Você precisa ser ADM para usar esta função.");
    return false;
  }
  return true;
}

async function requireMediator(interaction) {
  if (!mediatorCheck(interaction)) {
    await deny(interaction, "❌ Apenas Mediadores podem usar esta função.");
    return false;
  }
  return true;
}

async function requireAnalyst(interaction) {
  if (!analystCheck(interaction)) {
    await deny(interaction, "❌ Apenas Analistas podem usar esta função.");
    return false;
  }
  return true;
}

async function getChannel(guild, channelId) {
  if (!channelId) return null;
  return guild.channels.fetch(channelId).catch(() => null);
}

function queueId(format, modality, value, mode) {
  return `${format}:${modality}:${valueId(value)}:${mode}`;
}

function getQueue(format, modality, value, mode) {
  const id = queueId(format, modality, value, mode);

  if (!db.queues[id]) {
    db.queues[id] = {
      id,
      format,
      modality,
      value: Number(value),
      mode,
      players: [],
      messageId: null,
      channelId: null
    };
  }

  return db.queues[id];
}

function queueDescription(queue) {
  const players = queue.players.length
    ? queue.players.map((id, index) => `${index + 1}. <@${id}>`).join("\n")
    : "A fila está vazia.";

  const mode = queue.format === "1x1"
    ? queue.mode === "gelo_infinito"
      ? "Gelo Infinito"
      : "Gelo Normal"
    : "Partida padrão";

  return [
    `🎮 **Formato:** ${queue.format}`,
    `📱 **Modalidade:** ${modalityName(queue.modality)}`,
    `💰 **Valor:** ${money(queue.value)}`,
    `🧊 **Modo:** ${mode}`,
    "",
    "👥 **Jogadores:**",
    players,
    "",
    `📌 **Vagas preenchidas:** ${queue.players.length}/${requiredPlayers(queue.format)}`,
    "",
    "Escolha uma opção abaixo para entrar ou sair."
  ].join("\n");
}

function queueComponents(queue) {
  if (queue.format === "1x1") {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`queue_join|${queue.id}`)
          .setLabel("Entrar")
          .setEmoji("➕")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`queue_leave|${queue.id}`)
          .setLabel("Sair da fila")
          .setEmoji("🚪")
          .setStyle(ButtonStyle.Danger)
      )
    ];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`queue_join|${queue.id}`)
        .setLabel("Entrar na fila")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`queue_leave|${queue.id}`)
        .setLabel("Sair da fila")
        .setEmoji("🚪")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function queueOneVsOneModeComponents(format, modality, value, channelId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`publish_queue|${format}|${modality}|${value}|gelo_normal|${channelId}`)
        .setLabel("Gelo Normal")
        .setEmoji("🧊")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`publish_queue|${format}|${modality}|${value}|gelo_infinito|${channelId}`)
        .setLabel("Gelo Infinito")
        .setEmoji("♾️")
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

function mediatorQueueEmbed() {
  const list = db.mediatorQueue.length
    ? db.mediatorQueue.map((id, index) => `${index + 1}. <@${id}>`).join("\n")
    : "Nenhum Mediador está na fila.";

  const next =
    db.mediatorQueue.length > 0
      ? db.mediatorQueue[db.mediatorRotation % db.mediatorQueue.length]
      : null;

  return makeEmbed(
    "👨‍⚖️ FILA DE MEDIADORES",
    [
      "Somente usuários com o cargo **Mediador** podem participar.",
      "",
      "📋 **Ordem atual:**",
      list,
      "",
      next
        ? `🎯 **Próximo do rodízio:** <@${next}>`
        : "🎯 **Próximo do rodízio:** nenhum",
      "",
      "O sistema utiliza rodízio automático para distribuir as partidas."
    ].join("\n")
  );
}

function mediatorQueueComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mediator_join")
        .setLabel("Entrar")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("mediator_leave")
        .setLabel("Sair")
        .setEmoji("🚪")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

/* discord.js ButtonBuilder não possui .Emoji; corrigido dinamicamente abaixo. */
function safeMediatorQueueComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mediator_join")
        .setLabel("Entrar")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("mediator_leave")
        .setLabel("Sair")
        .setEmoji("🚪")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

async function updateMediatorQueueMessage(guild) {
  const channel = await getChannel(guild, db.config.mediatorQueueChannelId);

  if (!channel || !channel.isTextBased()) return;

  let message = null;

  if (db.config.mediatorQueueMessageId) {
    message = await channel.messages
      .fetch(db.config.mediatorQueueMessageId)
      .catch(() => null);
  }

  if (!message) {
    message = await channel.send({
      embeds: [mediatorQueueEmbed()],
      components: safeMediatorQueueComponents()
    });

    db.config.mediatorQueueMessageId = message.id;
  } else {
    await message.edit({
      embeds: [mediatorQueueEmbed()],
      components: safeMediatorQueueComponents()
    }).catch(() => {});
  }

  saveDatabase();
}

function betEmbed(bet) {
  return makeEmbed(
    "🎮 APOSTA",
    [
      `🎯 **Formato:** ${bet.format}`,
      `📱 **Modalidade:** ${modalityName(bet.modality)}`,
      `💰 **Valor:** ${money(bet.value)}`,
      `🧊 **Modo:** ${bet.mode === "gelo_infinito" ? "Gelo Infinito" : "Gelo Normal"}`,
      "",
      "👥 **Jogadores:**",
      bet.players.map(id => `• <@${id}>`).join("\n"),
      "",
      bet.mediatorId
        ? `👨‍⚖️ **Mediador:** <@${bet.mediatorId}>`
        : "👨‍⚖️ **Mediador:** aguardando distribuição",
      "",
      "Cada jogador deve confirmar a aposta.",
      "Se alguém cancelar, o canal será excluído em 5 segundos."
    ].join("\n")
  );
}

function betButtons(betId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bet_confirm|${betId}`)
        .setLabel("Confirmar")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`bet_cancel|${betId}`)
        .setLabel("Cancelar")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function mediatorControlButtons(betId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`med_winner|${betId}`)
        .setLabel("Escolher vencedor")
        .setEmoji("🏆")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`med_wo|${betId}`)
        .setLabel("Vitória por W.O.")
        .setEmoji("🚫")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`med_finish|${betId}`)
        .setLabel("Finalizar aposta")
        .setEmoji("🏁")
        .setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`room_credentials|${betId}`)
        .setLabel("Enviar ID e senha da sala")
        .setEmoji("🎮")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function paymentEmbed(bet) {
  const entries = Object.entries(db.pix);

  if (!entries.length) {
    return makeEmbed(
      "💳 PAGAMENTO",
      [
        `💰 **Valor da aposta:** ${money(bet.value)}`,
        `🏆 **Valor total:** ${money(bet.value * 2)}`,
        "",
        "⚠️ Nenhum cadastro Pix foi configurado ainda.",
        "Um ADM deve usar `/cadastro` para cadastrar os dados."
      ].join("\n")
    );
  }

  const [, pix] = entries[0];

  const result = makeEmbed(
    "💳 PAGAMENTO VIA PIX",
    [
      `💰 **Valor de cada jogador:** ${money(bet.value)}`,
      `🏆 **Total da aposta:** ${money(bet.value * 2)}`,
      "",
      `👤 **Nome:** ${pix.name}`,
      `🔑 **Chave Pix:** \`${pix.key}\``,
      "",
      "Após realizar o pagamento, aguarde o Mediador."
    ].join("\n")
  );

  if (pix.qr && validUrl(pix.qr)) {
    result.setImage(pix.qr);
  }

  return result;
}

async function createPrivateBetChannel(guild, bet) {
  const category = db.config.betCategoryId
    ? await guild.channels.fetch(db.config.betCategoryId).catch(() => null)
    : null;

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
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

  if (bet.mediatorId) {
    overwrites.push({
      id: bet.mediatorId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels
      ]
    });
  }

  const channel = await guild.channels.create({
    name: `aposta-${bet.format}-${valueId(bet.value).replace(".", "-")}`,
    type: ChannelType.GuildText,
    parent:
      category?.type === ChannelType.GuildCategory
        ? category.id
        : undefined,
    permissionOverwrites: overwrites
  });

  return channel;
}

function getNextMediator() {
  if (!db.mediatorQueue.length) return null;

  // Remove duplicados.
  db.mediatorQueue = [...new Set(db.mediatorQueue)];

  if (!db.mediatorQueue.length) return null;

  const index = db.mediatorRotation % db.mediatorQueue.length;
  const mediatorId = db.mediatorQueue[index];

  db.mediatorRotation =
    (index + 1) % db.mediatorQueue.length;

  return mediatorId;
}

async function distributeMediator(bet, guild) {
  const mediatorId = getNextMediator();

  if (!mediatorId) {
    return false;
  }

  bet.mediatorId = mediatorId;

  if (bet.channelId) {
    const channel = await guild.channels.fetch(bet.channelId).catch(() => null);

    if (channel) {
      await channel.permissionOverwrites.edit(mediatorId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        ManageChannels: true
      }).catch(() => {});
    }
  }

  saveDatabase();
  return true;
}

async function createBetFromQueue(interaction, queue) {
  const needed = requiredPlayers(queue.format);

  if (queue.players.length < needed) {
    return null;
  }

  const players = queue.players.splice(0, needed);

  const id =
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const bet = {
    id,
    guildId: interaction.guild.id,
    channelId: null,
    format: queue.format,
    modality: queue.modality,
    value: queue.value,
    mode: queue.mode,
    players,
    mediatorId: null,
    confirmedBy: [],
    status: "waiting_confirmation",
    winnerId: null,
    resultType: null,
    roomId: null,
    roomPassword: null,
    createdAt: Date.now()
  };

  db.bets[id] = bet;

  const hasMediator = await distributeMediator(bet, interaction.guild);

  if (!hasMediator) {
    // Regra: sem Mediador não pode puxar aposta.
    // A aposta pode existir na fila aguardando Mediador, mas nenhum
    // Mediador é automaticamente criado/inventado.
    bet.status = "waiting_mediator";
  }

  const channel = await createPrivateBetChannel(interaction.guild, bet);

  bet.channelId = channel.id;

  await channel.send({
    content: players.map(id => `<@${id}>`).join(" "),
    embeds: [betEmbed(bet)],
    components: betButtons(id)
  });

  if (bet.mediatorId) {
    await channel.send({
      embeds: [
        makeEmbed(
          "👨‍⚖️ MEDIADOR ATRIBUÍDO",
          `O sistema atribuiu <@${bet.mediatorId}> pelo rodízio automático.`
        )
      ],
      components: mediatorControlButtons(id)
    });
  } else {
    await channel.send({
      embeds: [
        makeEmbed(
          "⏳ AGUARDANDO MEDIADOR",
          "A aposta foi criada, mas ainda não há Mediador disponível. Um Mediador poderá assumir quando estiver disponível."
        )
      ]
    });
  }

  saveDatabase();

  return bet;
}

/* ========================================================
   CONFIGURAÇÃO
======================================================== */

function configButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_roles")
        .setLabel("Cargos")
        .setEmoji("👥")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_admins")
        .setLabel("Administradores")
        .setEmoji("👑")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_fee")
        .setLabel("Taxa")
        .setEmoji("💰")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_appearance")
        .setLabel("Aparência")
        .setEmoji("🎨")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_channels")
        .setLabel("Canais")
        .setEmoji("📢")
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_category")
        .setLabel("Categoria")
        .setEmoji("📁")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_mediator_queue")
        .setLabel("Publicar fila de Mediadores")
        .setEmoji("👨‍⚖️")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_view")
        .setLabel("Ver configuração")
        .setEmoji("🔎")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_save")
        .setLabel("Salvar")
        .setEmoji("💾")
        .setStyle(ButtonStyle.Success)
    )
  ];
}

/* ========================================================
   COMANDOS SLASH
======================================================== */

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("config")
      .setDescription("Configura o sistema do bot.")
      .setDefaultMemberPermissions(null),

    new SlashCommandBuilder()
      .setName("fila")
      .setDescription("Cria e publica as filas de apostas.")
      .setDefaultMemberPermissions(null),

    new SlashCommandBuilder()
      .setName("cadastro")
      .setDescription("Cadastra os dados Pix de um usuário.")
      .setDefaultMemberPermissions(null)
      .addUserOption(option =>
        option
          .setName("usuario")
          .setDescription("Usuário que receberá o cadastro Pix.")
          .setRequired(true)
      )
  ].map(command => command.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);

  await rest.put(route, { body: commands });
}

/* ========================================================
   CLIENT
======================================================== */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Channel,
    Partials.Message
  ]
});

/* ========================================================
   READY
======================================================== */

client.once("ready", async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);

  try {
    await registerCommands();
    console.log("✅ Comandos registrados.");
  } catch (error) {
    console.error("❌ Falha ao registrar comandos:", error);
  }
});

/* ========================================================
   PREFIXADOS
======================================================== */

async function processAnalysis(message, type) {
  const channelId =
    type === "Mobile"
      ? db.config.ssmobChannelId
      : db.config.ssemuChannelId;

  if (!channelId) {
    await message.reply(
      "❌ O canal desta análise ainda não foi configurado no `/config`."
    ).catch(() => {});
    return;
  }

  const channel = await getChannel(message.guild, channelId);

  if (!channel || !channel.isTextBased()) {
    await message.reply("❌ O canal configurado é inválido.").catch(() => {});
    return;
  }

  const id =
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  db.analyses[id] = {
    id,
    guildId: message.guild.id,
    requesterId: message.author.id,
    type,
    analystId: null,
    status: "pending",
    createdAt: Date.now()
  };

  await channel.send({
    embeds: [
      makeEmbed(
        "🔎 SOLICITAÇÃO DE ANÁLISE",
        [
          `📱 **Modalidade:** ${type}`,
          `👤 **Solicitante:** <@${message.author.id}>`,
          "",
          "⏳ A solicitação está aguardando um Analista.",
          "Um Analista pode assumir pelo botão abaixo."
        ].join("\n")
      )
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`analysis_take|${id}`)
          .setLabel("Assumir análise")
          .setEmoji("🔎")
          .setStyle(ButtonStyle.Success)
      )
    ]
  });

  saveDatabase();

  await message.reply(
    `✅ Sua solicitação de análise **${type}** foi enviada.`
  ).catch(() => {});
}

client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  try {
    const command = message.content.trim().toLowerCase();

    if (command === ".ssmob") {
      await processAnalysis(message, "Mobile");
    }

    if (command === ".ssemu") {
      await processAnalysis(message, "Emulador");
    }

    if (command === ".med") {
      const bet = Object.values(db.bets).find(
        item =>
          item.guildId === message.guild.id &&
          item.channelId === message.channel.id &&
          item.status !== "finished"
      );

      if (!bet) {
        return message.reply("❌ Este comando só pode ser usado no canal privado de uma aposta.");
      }

      if (!(await requireMediator({
        member: message.member,
        user: message.author,
        guild: message.guild,
        reply: options => message.reply(options)
      }))) {
        return;
      }

      if (bet.mediatorId && bet.mediatorId !== message.author.id) {
        return message.reply("❌ Você não é o Mediador responsável por esta aposta.");
      }

      return message.reply({
        embeds: [
          makeEmbed(
            "👨‍⚖️ PAINEL DO MEDIADOR",
            [
              `🎮 **Formato:** ${bet.format}`,
              `📱 **Modalidade:** ${modalityName(bet.modality)}`,
              `💰 **Valor:** ${money(bet.value)}`,
              `💵 **Pagamento ao vencedor:** ${money(bet.value * 2)}`,
              "",
              "Use os botões abaixo para administrar a aposta."
            ].join("\n")
          )
        ],
        components: mediatorControlButtons(bet.id)
      });
    }
    if (command === ".p") {
      const stats = userStats(message.author.id);

      return message.reply({
        embeds: [
          makeEmbed(
            `📊 ESTATÍSTICAS — ${message.author.username}`,
            [
              `🏆 **Vitórias:** ${stats.wins}`,
              `💔 **Derrotas:** ${stats.losses}`,
              `⚡ **Vitórias por W.O.:** ${stats.woWins}`,
              `🪙 **Coins:** ${stats.coins}`
            ].join("\n")
          )
        ]
      });
    }

  } catch (error) {
    console.error("❌ Erro no comando prefixado:", error);
  }
});

/* ========================================================
   INTERAÇÕES
======================================================== */

client.on("interactionCreate", async interaction => {
  try {
    /* ----------------------------------------------------
       CHAT INPUT
    ---------------------------------------------------- */

    if (interaction.isChatInputCommand()) {
      /* /config */
      if (interaction.commandName === "config") {
        return interaction.reply({
          embeds: [configEmbed()],
          components: configButtons(),
          ephemeral: true
        });
      }

      /* /cadastro */
      if (interaction.commandName === "cadastro") {
        const user = interaction.options.getUser("usuario");

        const modal = new ModalBuilder()
          .setCustomId(`pix_register|${user.id}`)
          .setTitle("Cadastro Pix");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pix_name")
              .setLabel("Nome")
              .setPlaceholder("Nome do titular do Pix")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pix_key")
              .setLabel("Chave Pix")
              .setPlaceholder("Digite a chave Pix")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(200)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("pix_qr")
              .setLabel("QR Code")
              .setPlaceholder("URL da imagem do QR Code")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(500)
          )
        );

        return interaction.showModal(modal);
      }

      /* /fila */
      if (interaction.commandName === "fila") {
        filaSetup.set(interaction.user.id, {
          format: null,
          modality: null,
          channelId: null
        });

        return interaction.reply({
          content: "🎯 **Configuração da fila**\n\nEscolha somente o **formato**, a **modalidade** e o **canal onde todas as filas serão publicadas**.",
          components: [
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId("fila_setup_format")
                .setPlaceholder("1️⃣ Escolha o formato")
                .addOptions(FORMATS.map(format => ({
                  label: format,
                  value: format,
                  description: "Fila para 2 jogadores"
                })))
            ),
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId("fila_setup_modality")
                .setPlaceholder("2️⃣ Escolha a modalidade")
                .addOptions(MODALITIES.map(modality => ({
                  label: modalityName(modality),
                  value: modality
                })))
            ),
            new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId("fila_setup_channel")
                .setPlaceholder("3️⃣ Escolha o canal de publicação")
                .setChannelTypes(ChannelType.GuildText)
            )
          ],
          ephemeral: true
        });
      }




    }

    /* ----------------------------------------------------
       BOTÕES
    ---------------------------------------------------- */

    if (interaction.isButton()) {
      const [action, ...parts] = interaction.customId.split("|");

      /* CONFIG */
      if (action === "config_roles") {
        if (!(await requireAdmin(interaction))) return;

        return interaction.reply({
          content: "👥 Selecione os cargos que serão usados pelo bot:",
          components: [
            new ActionRowBuilder().addComponents(
              new RoleSelectMenuBuilder()
                .setCustomId("set_mediator_role")
                .setPlaceholder("Selecionar cargo Mediador")
            ),
            new ActionRowBuilder().addComponents(
              new RoleSelectMenuBuilder()
                .setCustomId("set_analyst_role")
                .setPlaceholder("Selecionar cargo Analista")
            )
          ],
          ephemeral: true
        });
      }

      if (action === "config_admins") {
        if (!(await requireAdmin(interaction))) return;

        return interaction.reply({
          embeds: [
            makeEmbed(
              "👑 ADMINISTRADORES",
              [
                `Cadastrados: **${db.config.admins.length}/20**`,
                "",
                db.config.admins.length
                  ? db.config.admins
                      .map((id, i) => `${i + 1}. <@${id}>`)
                      .join("\n")
                  : "Nenhum ADM cadastrado."
              ].join("\n")
            )
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("admin_add")
                .setLabel("Cadastrar ADM")
                .setEmoji("➕")
                .setStyle(ButtonStyle.Success),

              new ButtonBuilder()
                .setCustomId("admin_remove")
                .setLabel("Remover ADM")
                .setEmoji("➖")
                .setStyle(ButtonStyle.Danger)
            )
          ],
          ephemeral: true
        });
      }

      if (action === "config_fee") {
        if (!(await requireAdmin(interaction))) return;

        const modal = new ModalBuilder()
          .setCustomId("fee_modal")
          .setTitle("Configurar taxa");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("fee")
              .setLabel("Taxa de R$0,01 até R$0,50")
              .setPlaceholder("Ex.: 0,25")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      if (action === "config_appearance") {
        if (!(await requireAdmin(interaction))) return;

        const modal = new ModalBuilder()
          .setCustomId("appearance_modal")
          .setTitle("Aparência das embeds");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("color")
              .setLabel("Cor HEX")
              .setPlaceholder("#5865F2")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("image")
              .setLabel("Foto de perfil — URL")
              .setPlaceholder("https://...")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        );

        return interaction.showModal(modal);
      }

      if (action === "config_channels") {
        if (!(await requireAdmin(interaction))) return;

        return interaction.reply({
          content: "📢 Configure os canais individualmente:",
          components: [
            new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId("channel_ssmob")
                .setPlaceholder("Canal das solicitações .ssmob")
                .setChannelTypes(ChannelType.GuildText)
            ),
            new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId("channel_ssemu")
                .setPlaceholder("Canal das solicitações .ssemu")
                .setChannelTypes(ChannelType.GuildText)
            ),
            new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId("channel_mediator_queue")
                .setPlaceholder("Canal da fila de Mediadores")
                .setChannelTypes(ChannelType.GuildText)
            )
          ],
          ephemeral: true
        });
      }

      if (action === "config_category") {
        if (!(await requireAdmin(interaction))) return;

        return interaction.reply({
          content: "📁 Selecione a categoria das apostas:",
          components: [
            new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId("bet_category")
                .setPlaceholder("Selecionar categoria")
                .setChannelTypes(ChannelType.GuildCategory)
            )
          ],
          ephemeral: true
        });
      }

      if (action === "config_mediator_queue") {
        if (!(await requireAdmin(interaction))) return;

        if (!db.config.mediatorQueueChannelId) {
          return deny(
            interaction,
            "❌ Primeiro configure o canal da fila de Mediadores."
          );
        }

        await updateMediatorQueueMessage(interaction.guild);

        return interaction.reply({
          content: "✅ Fila de Mediadores publicada/atualizada.",
          ephemeral: true
        });
      }

      if (action === "config_view") {
        if (!(await requireAdmin(interaction))) return;

        return interaction.reply({
          embeds: [configEmbed()],
          ephemeral: true
        });
      }

      if (action === "config_save") {
        if (!(await requireAdmin(interaction))) return;

        saveDatabase();

        return interaction.reply({
          content: "✅ Configuração salva.",
          ephemeral: true
        });
      }

      /* ADMIN */
      if (action === "admin_add") {
        if (!(await requireAdmin(interaction))) return;

        if (db.config.admins.length >= 20) {
          return deny(
            interaction,
            "❌ Limite atingido: no máximo 20 ADMs."
          );
        }

        const modal = new ModalBuilder()
          .setCustomId("admin_add_modal")
          .setTitle("Cadastrar ADM");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("user_id")
              .setLabel("ID do usuário")
              .setPlaceholder("Ex.: 123456789012345678")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      if (action === "admin_remove") {
        if (!(await requireAdmin(interaction))) return;

        const modal = new ModalBuilder()
          .setCustomId("admin_remove_modal")
          .setTitle("Remover ADM");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("user_id")
              .setLabel("ID do usuário")
              .setPlaceholder("ID Discord")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      /* FILA */
      if (action === "queue_join") {
        const queue = db.queues[parts[0]];

        if (!queue) {
          return deny(interaction, "❌ Esta fila não existe mais.");
        }

        if (queue.players.includes(interaction.user.id)) {
          return deny(interaction, "❌ Você já está nessa fila.");
        }

        const occupiedElsewhere = Object.values(db.queues).some(
          q =>
            q.guildId === interaction.guild.id &&
            q.players?.includes(interaction.user.id) &&
            q.id !== queue.id
        );

        if (occupiedElsewhere) {
          return deny(
            interaction,
            "❌ Você já está em outra fila. Saia dela primeiro."
          );
        }

        queue.players.push(interaction.user.id);

        const bet =
          queue.players.length >= requiredPlayers(queue.format)
            ? await createBetFromQueue(interaction, queue)
            : null;

        saveDatabase();

        if (bet) {
          return interaction.reply({
            content:
              `🎮 Aposta criada em ${bet.channelId ? `<#${bet.channelId}>` : "canal privado"}.`,
            ephemeral: true
          });
        }

        await interaction.reply({
          content:
            `✅ Você entrou na fila **${queue.format} ${modalityName(queue.modality)}** por **${money(queue.value)}**.`,
          ephemeral: true
        });

        return;
      }

      if (action === "queue_leave") {
        const queue = db.queues[parts[0]];

        if (!queue) {
          return deny(interaction, "❌ Esta fila não existe.");
        }

        const oldLength = queue.players.length;

        queue.players = queue.players.filter(
          id => id !== interaction.user.id
        );

        saveDatabase();

        return interaction.reply({
          content:
            queue.players.length < oldLength
              ? "✅ Você saiu da fila."
              : "❌ Você não estava nessa fila.",
          ephemeral: true
        });
      }

      /* FILA MEDIADORES */
      if (action === "mediator_join") {
        if (!(await requireMediator(interaction))) return;

        if (!db.mediatorQueue.includes(interaction.user.id)) {
          db.mediatorQueue.push(interaction.user.id);
        }

        saveDatabase();
        await updateMediatorQueueMessage(interaction.guild);

        return interaction.reply({
          content: "✅ Você entrou na fila de Mediadores.",
          ephemeral: true
        });
      }

      if (action === "mediator_leave") {
        if (!(await requireMediator(interaction))) return;

        db.mediatorQueue = db.mediatorQueue.filter(
          id => id !== interaction.user.id
        );

        if (db.mediatorQueue.length === 0) {
          db.mediatorRotation = 0;
        } else {
          db.mediatorRotation %= db.mediatorQueue.length;
        }

        saveDatabase();
        await updateMediatorQueueMessage(interaction.guild);

        return interaction.reply({
          content: "✅ Você saiu da fila de Mediadores.",
          ephemeral: true
        });
      }

      /* ANÁLISE */
      if (action === "analysis_take") {
        if (!(await requireAnalyst(interaction))) return;

        const analysis = db.analyses[parts[0]];

        if (!analysis) {
          return deny(interaction, "❌ Solicitação não encontrada.");
        }

        if (analysis.status !== "pending") {
          return deny(
            interaction,
            "❌ Essa solicitação já foi assumida."
          );
        }

        analysis.status = "assigned";
        analysis.analystId = interaction.user.id;

        saveDatabase();

        return interaction.update({
          embeds: [
            makeEmbed(
              "🔎 ANÁLISE ASSUMIDA",
              [
                `📱 **Modalidade:** ${analysis.type}`,
                `👤 **Solicitante:** <@${analysis.requesterId}>`,
                `🔎 **Analista:** <@${interaction.user.id}>`,
                "",
                "✅ Esta solicitação já possui Analista responsável."
              ].join("\n")
            )
          ],
          components: []
        });
      }

      /* APOSTA */
      if (action === "bet_confirm") {
        const bet = db.bets[parts[0]];

        if (!bet) {
          return deny(interaction, "❌ Aposta não encontrada.");
        }

        if (!bet.players.includes(interaction.user.id)) {
          return deny(
            interaction,
            "❌ Você não participa desta aposta."
          );
        }

        if (!bet.confirmedBy.includes(interaction.user.id)) {
          bet.confirmedBy.push(interaction.user.id);
        }

        saveDatabase();

        if (bet.confirmedBy.length < bet.players.length) {
          return interaction.reply({
            content:
              `✅ Confirmação registrada: ${bet.confirmedBy.length}/${bet.players.length}.`,
            ephemeral: true
          });
        }

        bet.status = "payment";

        await interaction.message.edit({
          embeds: [paymentEmbed(bet)],
          components: []
        }).catch(() => {});

        if (bet.mediatorId) {
          await interaction.channel.send({
            embeds: [
              makeEmbed(
                "👨‍⚖️ CONTROLE DO MEDIADOR",
                "A aposta foi confirmada. O Mediador pode controlar o resultado pelos botões abaixo."
              )
            ],
            components: mediatorControlButtons(bet.id)
          }).catch(() => {});
        }

        saveDatabase();

        return interaction.reply({
          content: "✅ Todos os jogadores confirmaram. Pagamento liberado.",
          ephemeral: true
        });
      }

      if (action === "bet_cancel") {
        const bet = db.bets[parts[0]];

        if (!bet) {
          return deny(interaction, "❌ Aposta não encontrada.");
        }

        const allowed =
          bet.players.includes(interaction.user.id) ||
          mediatorCheck(interaction);

        if (!allowed) {
          return deny(
            interaction,
            "❌ Você não pode cancelar esta aposta."
          );
        }

        bet.status = "cancelled";
        saveDatabase();

        await interaction.reply(
          "❌ Aposta cancelada. Este canal será excluído em 5 segundos."
        );

        setTimeout(() => {
          interaction.channel?.delete("Aposta cancelada").catch(() => {});
        }, 5000);

        return;
      }

      /* MEDIADOR */
      if (action === "med_winner") {
        if (!(await requireMediator(interaction))) return;

        const bet = db.bets[parts[0]];

        if (!bet) {
          return deny(interaction, "❌ Aposta não encontrada.");
        }

        if (bet.mediatorId && bet.mediatorId !== interaction.user.id) {
          return deny(
            interaction,
            "❌ Você não é o Mediador responsável por esta aposta."
          );
        }

        const modal = new ModalBuilder()
          .setCustomId(`result_normal|${bet.id}`)
          .setTitle("Escolher vencedor");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("winner_id")
              .setLabel("ID do vencedor")
              .setPlaceholder("ID Discord de um jogador da aposta")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      if (action === "med_wo") {
        if (!(await requireMediator(interaction))) return;

        const bet = db.bets[parts[0]];

        if (!bet) {
          return deny(interaction, "❌ Aposta não encontrada.");
        }

        if (bet.mediatorId && bet.mediatorId !== interaction.user.id) {
          return deny(
            interaction,
            "❌ Você não é o Mediador responsável por esta aposta."
          );
        }

        const modal = new ModalBuilder()
          .setCustomId(`result_wo|${bet.id}`)
          .setTitle("Vitória por W.O.");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("winner_id")
              .setLabel("ID do vencedor")
              .setPlaceholder("ID Discord do jogador vencedor")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      if (action === "med_finish") {
        if (!(await requireMediator(interaction))) return;

        const bet = db.bets[parts[0]];

        if (!bet) {
          return deny(interaction, "❌ Aposta não encontrada.");
        }

        if (bet.mediatorId && bet.mediatorId !== interaction.user.id) {
          return deny(
            interaction,
            "❌ Você não é o Mediador responsável."
          );
        }

        bet.status = "finished";
        saveDatabase();

        await interaction.reply({
          embeds: [
            makeEmbed(
              "🏁 APOSTA FINALIZADA",
              "A aposta foi finalizada pelo Mediador."
            )
          ]
        });

        setTimeout(() => {
          interaction.channel?.delete("Aposta finalizada").catch(() => {});
        }, 5000);

        return;
      }

      if (action === "room_credentials") {
        if (!(await requireMediator(interaction))) return;

        const bet = db.bets[parts[0]];

        if (!bet) {
          return deny(interaction, "❌ Aposta não encontrada.");
        }

        if (bet.mediatorId && bet.mediatorId !== interaction.user.id) {
          return deny(
            interaction,
            "❌ Você não é o Mediador responsável."
          );
        }

        const modal = new ModalBuilder()
          .setCustomId(`room_modal|${bet.id}`)
          .setTitle("Sala Free Fire");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("room_id")
              .setLabel("ID da sala")
              .setPlaceholder("ID")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("room_password")
              .setLabel("Senha da sala")
              .setPlaceholder("Senha")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      if (action === "room_copy_id" || action === "room_copy_password") {
        const bet = db.bets[parts[0]];

        if (!bet) {
          return deny(interaction, "❌ Aposta não encontrada.");
        }

        const value =
          action === "room_copy_id"
            ? bet.roomId
            : bet.roomPassword;

        if (!value) {
          return deny(
            interaction,
            "❌ Esse dado ainda não foi enviado."
          );
        }

        return interaction.reply({
          content: `\`${value}\``,
          ephemeral: true
        });
      }

      return;
    }

    /* ----------------------------------------------------
       MENUS DE CARGOS
    ---------------------------------------------------- */

    if (interaction.isRoleSelectMenu()) {
      if (!(await requireAdmin(interaction))) return;

      const roleId = interaction.values[0];

      if (interaction.customId === "set_mediator_role") {
        db.config.mediatorRoleId = roleId;
      }

      if (interaction.customId === "set_analyst_role") {
        db.config.analystRoleId = roleId;
      }

      saveDatabase();

      return interaction.update({
        content: "✅ Cargo configurado.",
        components: []
      });
    }

    /* ----------------------------------------------------
       MENUS DE CANAIS
    ---------------------------------------------------- */

    if (interaction.isChannelSelectMenu()) {
      if (!(await requireAdmin(interaction))) return;

      const channelId = interaction.values[0];

      if (interaction.customId === "channel_ssmob") {
        db.config.ssmobChannelId = channelId;
      }

      if (interaction.customId === "channel_ssemu") {
        db.config.ssemuChannelId = channelId;
      }

      if (interaction.customId === "channel_mediator_queue") {
        db.config.mediatorQueueChannelId = channelId;
      }

      if (interaction.customId === "bet_category") {
        db.config.betCategoryId = channelId;
      }

      saveDatabase();

      return interaction.update({
        content: "✅ Configuração de canal salva.",
        components: []
      });
    }

    /* ----------------------------------------------------
       MODAIS
    ---------------------------------------------------- */

    if (interaction.isModalSubmit()) {
      /* PIX */
      if (interaction.customId.startsWith("pix_register|")) {
        if (!(await requireAdmin(interaction))) return;

        const userId =
          interaction.customId.split("|")[1];

        const name =
          interaction.fields.getTextInputValue("pix_name").trim();

        const key =
          interaction.fields.getTextInputValue("pix_key").trim();

        const qr =
          interaction.fields.getTextInputValue("pix_qr").trim();

        if (!validUrl(qr)) {
          return deny(
            interaction,
            "❌ A URL do QR Code não é válida."
          );
        }

        db.pix[userId] = {
          name,
          key,
          qr,
          updatedAt: Date.now()
        };

        saveDatabase();

        const e = makeEmbed(
          "💳 CADASTRO PIX",
          [
            `👤 **Usuário:** <@${userId}>`,
            `📝 **Nome:** ${name}`,
            `🔑 **Chave Pix:** \`${key}\``,
            "",
            "✅ Cadastro salvo com sucesso."
          ].join("\n")
        );

        e.setImage(qr);

        return interaction.reply({
          embeds: [e],
          ephemeral: true
        });
      }

      /* TAXA */
      if (interaction.customId === "fee_modal") {
        if (!(await requireAdmin(interaction))) return;

        const fee =
          parseMoney(
            interaction.fields.getTextInputValue("fee")
          );

        if (!Number.isFinite(fee) || fee < 0.01 || fee > 0.50) {
          return deny(
            interaction,
            "❌ A taxa deve ficar entre R$0,01 e R$0,50."
          );
        }

        db.config.fee = fee;
        saveDatabase();

        return interaction.reply({
          content: `✅ Taxa configurada: ${money(fee)}.`,
          ephemeral: true
        });
      }

      /* APARÊNCIA */
      if (interaction.customId === "appearance_modal") {
        if (!(await requireAdmin(interaction))) return;

        const color =
          interaction.fields.getTextInputValue("color").trim();

        const image =
          interaction.fields.getTextInputValue("image").trim();

        if (!validHex(color)) {
          return deny(
            interaction,
            "❌ Cor HEX inválida. Exemplo: #5865F2."
          );
        }

        if (image && !validUrl(image)) {
          return deny(
            interaction,
            "❌ A URL da foto é inválida."
          );
        }

        db.config.embedColor = color;
        db.config.profileImage = image || null;

        saveDatabase();

        return interaction.reply({
          content: "✅ Aparência atualizada.",
          ephemeral: true
        });
      }

      /* SALA FREE FIRE */
      if (interaction.customId.startsWith("room_modal|")) {
        if (!(await requireMediator(interaction))) return;

        const betId = interaction.customId.split("|")[1];
        const bet = db.bets[betId];

        if (!bet) {
          return deny(interaction, "❌ Aposta não encontrada.");
        }

        if (bet.mediatorId && bet.mediatorId !== interaction.user.id) {
          return deny(interaction, "❌ Você não é o Mediador responsável.");
        }

        const roomId =
          interaction.fields.getTextInputValue("room_id").trim();

        const roomPassword =
          interaction.fields.getTextInputValue("room_password").trim();

        if (!roomId || !roomPassword) {
          return deny(interaction, "❌ Informe o ID e a senha da sala.");
        }

        bet.roomId = roomId;
        bet.roomPassword = roomPassword;

        const paymentValue = Number((bet.value * 2).toFixed(2));
        const paymentLabel = paymentValue.toFixed(2).replace(".", "-");

        const channel = interaction.channel;

        if (channel && channel.isTextBased() && "setName" in channel) {
          await channel.setName(`pagamento-${paymentLabel}`).catch(error => {
            console.error("❌ Não foi possível renomear o canal:", error);
          });
        }

        saveDatabase();

        const embed = makeEmbed(
          "🎮 SALA FREE FIRE",
          [
            `💰 **Valor da aposta:** ${money(bet.value)}`,
            `💵 **Valor a pagar ao vencedor:** ${money(paymentValue)}`,
            "",
            `🆔 **ID da sala:** \`${roomId}\``,
            `🔐 **Senha:** \`${roomPassword}\``,
            "",
            `📌 **Canal:** \`pagamento-${paymentLabel}\``
          ].join("\n")
        );

        return interaction.reply({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`room_copy_id|${bet.id}`)
                .setLabel("Copiar ID")
                .setEmoji("🆔")
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`room_copy_password|${bet.id}`)
                .setLabel("Copiar senha")
                .setEmoji("🔐")
                .setStyle(ButtonStyle.Secondary)
            )
          ]
        });
      }

      /* ADM ADD */
      if (interaction.customId === "admin_add_modal") {
        if (!(await requireAdmin(interaction))) return;

        if (db.config.admins.length >= 20) {
          return deny(
            interaction,
            "❌ O limite máximo de 20 ADMs já foi atingido."
          );
        }

        const userId =
          interaction.fields.getTextInputValue("user_id").trim();

        if (!/^\d{17,20}$/.test(userId)) {
          return deny(
            interaction,
            "❌ ID Discord inválido."
          );
        }

        if (!db.config.admins.includes(userId)) {
          db.config.admins.push(userId);
        }

        saveDatabase();

        return interaction.reply({
          content: `✅ <@${userId}> foi cadastrado como ADM.`,
          ephemeral: true
        });
      }

      /* ADM REMOVE */
      if (interaction.customId === "admin_remove_modal") {
        if (!(await requireAdmin(interaction))) return;

        const userId =
          interaction.fields.getTextInputValue("user_id").trim();

        if (!db.config.admins.includes(userId)) {
          return deny(
            interaction,
            "❌ Esse usuário não está cadastrado como ADM."
          );
        }

        db.config.admins =
          db.config.admins.filter(id => id !== userId);

        saveDatabase();

        return interaction.reply({
          content: `✅ <@${userId}> foi removido dos ADMs.`,
          ephemeral: true
        });
      }

      /* INÍCIO FILA */
      // O /fila utiliza os seletores abaixo para formato, modalidade e canal.

    }

    /* ----------------------------------------------------
       SELECTS
    ---------------------------------------------------- */

    if (interaction.isChannelSelectMenu() && interaction.customId === "fila_setup_channel") {
      if (!(await requireAdmin(interaction))) return;
      const setup = filaSetup.get(interaction.user.id) || { format: null, modality: null, channelId: null };
      setup.channelId = interaction.values[0];
      filaSetup.set(interaction.user.id, setup);

      if (!setup.format || !setup.modality || !setup.channelId) {
        return interaction.deferUpdate();
      }

      const channel = await getChannel(interaction.guild, setup.channelId);
      if (!channel || !channel.isTextBased()) {
        filaSetup.delete(interaction.user.id);
        return interaction.update({ content: "❌ O canal selecionado é inválido.", components: [] });
      }

      const values = ALLOWED_VALUES.slice().sort((a, b) => b - a);
      const published = [];

      try {
        for (const value of values) {
          const modes = setup.format === "1x1" ? ["gelo_normal", "gelo_infinito"] : ["normal"];
          for (const mode of modes) {
            const queue = getQueue(setup.format, setup.modality, value, mode);
            queue.channelId = channel.id;
            queue.guildId = interaction.guild.id;
            let msg = queue.messageId ? await channel.messages.fetch(queue.messageId).catch(() => null) : null;
            const payload = { embeds: [makeEmbed(`🎮 FILA ${setup.format}`, queueDescription(queue))], components: queueComponents(queue) };
            if (msg) await msg.edit(payload);
            else { msg = await channel.send(payload); queue.messageId = msg.id; }
            published.push(money(value));
          }
        }
      } catch (error) {
        console.error("❌ Erro ao publicar as filas:", error);
        filaSetup.delete(interaction.user.id);
        return interaction.update({ content: `❌ Não foi possível publicar as filas no canal selecionado. Verifique as permissões do bot.\n\nDetalhe: ${error.message || "erro desconhecido"}`, components: [] });
      }

      saveDatabase();
      filaSetup.delete(interaction.user.id);
      return interaction.update({ content: `✅ **Todas as filas foram publicadas!**\n\n📌 **Canal:** ${channel}\n🎮 **Formato:** ${setup.format}\n📱 **Modalidade:** ${modalityName(setup.modality)}\n💰 **Valores:** ${values.map(money).join(", ")}\n👥 **Limite por fila:** 2 jogadores`, components: [] });
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "fila_setup_format") {
        if (!(await requireAdmin(interaction))) return;
        const setup = filaSetup.get(interaction.user.id) || { format: null, modality: null, channelId: null };
        setup.format = interaction.values[0];
        filaSetup.set(interaction.user.id, setup);
        return interaction.deferUpdate();
      }

      if (interaction.customId === "fila_setup_modality") {
        if (!(await requireAdmin(interaction))) return;
        const setup = filaSetup.get(interaction.user.id) || { format: null, modality: null, channelId: null };
        setup.modality = interaction.values[0];
        filaSetup.set(interaction.user.id, setup);
        return interaction.deferUpdate();
      }

      if (interaction.customId === "fila_setup_channel") {
        if (!(await requireAdmin(interaction))) return;
        const setup = filaSetup.get(interaction.user.id) || { format: null, modality: null, channelId: null };
        setup.channelId = interaction.values[0];
        filaSetup.set(interaction.user.id, setup);

        if (!setup.format || !setup.modality || !setup.channelId) {
          return interaction.deferUpdate();
        }

        const channel = await getChannel(interaction.guild, setup.channelId);
        if (!channel || !channel.isTextBased()) {
          filaSetup.delete(interaction.user.id);
          return interaction.update({ content: "❌ O canal selecionado é inválido.", components: [] });
        }

        // Publica AUTOMATICAMENTE todas as filas pré-definidas.
        // O ADM escolhe apenas formato, modalidade e canal.
        const values = ALLOWED_VALUES.slice().sort((a, b) => b - a);
        const published = [];

        try {
          for (const value of values) {
            const modes = setup.format === "1x1"
              ? ["gelo_normal", "gelo_infinito"]
              : ["normal"];

            for (const mode of modes) {
              const queue = getQueue(setup.format, setup.modality, value, mode);
              queue.channelId = channel.id;
              queue.guildId = interaction.guild.id;

              let sentMessage = null;
              if (queue.messageId) {
                sentMessage = await channel.messages.fetch(queue.messageId).catch(() => null);
              }

              if (sentMessage) {
                await sentMessage.edit({
                  embeds: [makeEmbed(`🎮 FILA ${setup.format}`, queueDescription(queue))],
                  components: queueComponents(queue)
                });
              } else {
                sentMessage = await channel.send({
                  embeds: [makeEmbed(`🎮 FILA ${setup.format}`, queueDescription(queue))],
                  components: queueComponents(queue)
                });
                queue.messageId = sentMessage.id;
              }

              published.push(`${money(value)}${setup.format === "1x1" ? ` — ${mode === "gelo_infinito" ? "Gelo Infinito" : "Gelo Normal"}` : ""}`);
            }
          }
        } catch (error) {
          console.error("❌ Erro ao publicar as filas:", error);
          filaSetup.delete(interaction.user.id);
          return interaction.update({
            content: `❌ Não foi possível publicar as filas no canal selecionado. Verifique se o bot tem permissão para **Ver Canal**, **Enviar Mensagens** e **Incorporar Links**.\n\nDetalhe: ${error.message || "erro desconhecido"}`,
            components: []
          });
        }

        saveDatabase();
        filaSetup.delete(interaction.user.id);

        return interaction.update({
          content: `✅ **Todas as filas foram publicadas!**\n\n📌 **Canal:** ${channel}\n🎮 **Formato:** ${setup.format}\n📱 **Modalidade:** ${modalityName(setup.modality)}\n💰 **Valores:** ${values.map(money).join(", ")}\n👥 **Limite por fila:** 2 jogadores`,
          components: []
        });
      }
    }

    /* ----------------------------------------------------
       BOTÕES DE PUBLICAÇÃO 1X1
    ---------------------------------------------------- */

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("publish_queue|")
    ) {
      if (!(await requireAdmin(interaction))) return;

      const [, format, modality, valueRaw, mode, channelId] =
        interaction.customId.split("|");

      const value = parseMoney(valueRaw);

      const channel =
        await getChannel(interaction.guild, channelId);

      if (!channel || !channel.isTextBased()) {
        return interaction.update({
          content: "❌ Canal inválido.",
          components: []
        });
      }

      const queue =
        getQueue(
          format,
          modality,
          value,
          mode
        );

      queue.channelId = channel.id;

      const message =
        await channel.send({
          embeds: [
            makeEmbed(
              `🎮 FILA ${format}`,
              queueDescription(queue)
            )
          ],
          components: queueComponents(queue)
        });

      queue.messageId = message.id;

      saveDatabase();

      return interaction.update({
        content:
          `✅ Fila ${format} — ${modalityName(modality)} — ${money(value)} publicada.`,
        components: []
      });
    }

  } catch (error) {
    console.error("❌ ERRO NA INTERAÇÃO:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          "❌ Ocorreu um erro ao processar esta interação.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

/* ========================================================
   MANUTENÇÃO DAS FILAS
======================================================== */

async function refreshQueueMessage(queue, guild) {
  if (!queue.channelId || !queue.messageId) return;

  const channel =
    await guild.channels
      .fetch(queue.channelId)
      .catch(() => null);

  if (!channel || !channel.isTextBased()) return;

  const message =
    await channel.messages
      .fetch(queue.messageId)
      .catch(() => null);

  if (!message) return;

  await message.edit({
    embeds: [
      makeEmbed(
        `🎮 FILA ${queue.format}`,
        queueDescription(queue)
      )
    ],
    components: queueComponents(queue)
  }).catch(() => {});
}

setInterval(async () => {
  try {
    for (const guild of client.guilds.cache.values()) {
      for (const queue of Object.values(db.queues)) {
        if (queue.channelId) {
          await refreshQueueMessage(queue, guild);
        }
      }

      if (db.config.mediatorQueueChannelId) {
        await updateMediatorQueueMessage(guild);
      }
    }
  } catch (error) {
    console.error("❌ Erro na manutenção:", error);
  }
}, 60000);

/* ========================================================
   SALVAMENTO E ERROS
======================================================== */

process.on("unhandledRejection", error => {
  console.error("❌ Unhandled Promise Rejection:", error);
});

process.on("uncaughtException", error => {
  console.error("❌ Uncaught Exception:", error);
});

process.on("SIGINT", () => {
  saveDatabase();
  process.exit(0);
});

process.on("SIGTERM", () => {
  saveDatabase();
  process.exit(0);
});

/* ========================================================
   LOGIN
======================================================== */

client.login(TOKEN).catch(error => {
  console.error("❌ Não foi possível iniciar o bot:", error);
  process.exit(1);
});
