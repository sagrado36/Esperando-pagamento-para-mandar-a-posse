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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const fs = require("fs");
const path = require("path");

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    "ERRO: preencha DISCORD_TOKEN, CLIENT_ID e GUILD_ID no arquivo .env"
  );
  process.exit(1);
}

/* =========================================================
   BANCO DE DADOS
========================================================= */

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "data.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT = {
  settings: {
    roles: {
      admin: "",
      subowner: "",
      mediator: "",
      analyst: "",
      member: "",
      support: "",
      finance: "",
      privateAccess: ""
    },

    channels: {
      queueMobile: "",
      queueEmulator: "",
      queueMixed: "",
      privateCategory: "",
      mediatorCategory: "",
      mediatorQueue: "",
      analystNotify: "",
      analystChannel1: "",
      analystChannel2: "",
      feed: "",
      payments: "",
      events: "",
      community: "",
      support: ""
    },

    appearance: {
      color: "#000000",
      title: "🎮 FILA DE APOSTAS",
      description: "Entre na fila e encontre seu adversário.",
      footer: "Sistema de Apostas",
      thumbnail: "",
      banner: "",
      botStatus: "🎮 Sistema de Apostas"
    },

    fee: {
      type: "percent",
      value: 0
    },

    pix: {
      key: "",
      name: "",
      city: "",
      qr: ""
    },

    coins: {
      win: 1,
      wo: 1,
      entry: 0
    }
  },

  queueConfigs: [],
  queues: {},
  bets: {},
  coins: {},

  mediatorQueue: [],
  analystRequests: [],

  nextBet: 1,

  temp: {}
};

function loadDB() {
  if (!fs.existsSync(DATA_FILE)) {
    return structuredClone(DEFAULT);
  }

  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    return {
      ...structuredClone(DEFAULT),
      ...saved,

      settings: {
        ...DEFAULT.settings,
        ...(saved.settings || {}),

        roles: {
          ...DEFAULT.settings.roles,
          ...((saved.settings || {}).roles || {})
        },

        channels: {
          ...DEFAULT.settings.channels,
          ...((saved.settings || {}).channels || {})
        },

        appearance: {
          ...DEFAULT.settings.appearance,
          ...((saved.settings || {}).appearance || {})
        },

        fee: {
          ...DEFAULT.settings.fee,
          ...((saved.settings || {}).fee || {})
        },

        pix: {
          ...DEFAULT.settings.pix,
          ...((saved.settings || {}).pix || {})
        },

        coins: {
          ...DEFAULT.settings.coins,
          ...((saved.settings || {}).coins || {})
        }
      }
    };
  } catch (err) {
    console.error("Erro lendo banco:", err);
    return structuredClone(DEFAULT);
  }
}

let db = loadDB();

function save() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(db, null, 2),
    "utf8"
  );
}

/* =========================================================
   OPÇÕES
========================================================= */

const MODS = [
  ["mobile", "📱 Mobile"],
  ["emulador", "💻 Emulador"],
  ["misto", "🔄 Misto"]
];

const FORMATS = [
  ["1x1", "1x1"],
  ["2x2", "2x2"],
  ["3x3", "3x3"],
  ["4x4", "4x4"]
];

const MODES = [
  ["normal", "Normal"],
  ["infinite", "Infinite"],
  ["gelo_infinito", "Gelo Infinito"],
  ["gelo_normal", "Gelo Normal"]
];

const VALUES = [
  30,
  50,
  100,
  200,
  300,
  500,
  700,
  1000,
  2000,
  4000,
  5000,
  10000
];

const ROLE_KEYS = [
  ["admin", "👑 Administrador"],
  ["subowner", "🔑 Sub-Dono"],
  ["mediator", "🛡️ Mediador"],
  ["analyst", "📊 Analista"],
  ["member", "👤 Membro"],
  ["support", "🎧 Suporte"],
  ["finance", "💰 Financeiro"],
  ["privateAccess", "🔒 Acesso extra às apostas"]
];

const CHANNEL_KEYS = [
  ["queueMobile", "📱 Categoria das filas Mobile"],
  ["queueEmulator", "💻 Categoria das filas Emulador"],
  ["queueMixed", "🔄 Categoria das filas Misto"],
  ["privateCategory", "🔒 Categoria dos canais privados"],
  ["mediatorCategory", "🛡️ Categoria dos mediadores"],
  ["mediatorQueue", "🛡️ Canal da fila de mediadores"],
  ["analystNotify", "📊 Canal de notificações dos Analistas"],
  ["analystChannel1", "🔎 Canal 1 de análise"],
  ["analystChannel2", "🔎 Canal 2 de análise"],
  ["feed", "📰 Canal Feed"],
  ["payments", "💳 Canal de Pagamentos"],
  ["events", "🎟️ Categoria Eventos"],
  ["community", "🌐 Categoria Comunidade"],
  ["support", "🛠️ Categoria Atendimento"]
];

/* =========================================================
   ESTRUTURA
========================================================= */

const BASE_CHANNELS = {
  "ATENDIMENTO": [
    "🎟️・ticket",
    "🛠️・suporte",
    "💰・reembolso",
    "💵・receber-evento",
    "💼・vagas",
    "📢・divulgacao"
  ],

  "EVENTOS": [
    "💵・1-vitoria-15-no-px",
    "💲・pagamentos",
    "💵・5-convite-2-no-px",
    "💵・1-vitoria-2-no-px-08h",
    "💵・2-vitoria-3-no-px-12h",
    "💵・2-vitoria-4-no-pix-17h",
    "💵・1-vitoria-3-no-pix-20h",
    "💵・2-vitoria-10-no-px-22h",
    "💵・1-vitoria-1-no-px-infinito",
    "⛔・regras-eventos"
  ],

  "COMUNIDADE": [
    "🛒・lojinha",
    "⚡・roleta",
    "📒・regras",
    "📒・regras-x1",
    "📝・vagas",
    "👑・ranking",
    "🏆・ranking-diario",
    "💵・adm-lucrando"
  ],

  "ANÁLISES": [
    "🚫・blacklist",
    "🚫・exposed",
    "🔎・regras-analise"
  ],

  "CONVITE": [
    "✉️・convites"
  ]
};

/* =========================================================
   UTILITÁRIOS
========================================================= */

function money(cents) {
  return `R$ ${(Number(cents) / 100)
    .toFixed(2)
    .replace(".", ",")}`;
}

function fmt(array, key) {
  return (
    array.find(x => x[0] === key)?.[1] ||
    key
  );
}

function roleId(key) {
  return db.settings.roles[key] || null;
}

function channelId(key) {
  return db.settings.channels[key] || null;
}

function isAdmin(interaction) {
  return (
    interaction.memberPermissions?.has(
      PermissionsBitField.Flags.Administrator
    ) ||
    interaction.memberPermissions?.has(
      PermissionsBitField.Flags.ManageGuild
    )
  );
}

function requireAdmin(interaction) {
  if (!isAdmin(interaction)) {
    interaction.reply({
      content: "❌ Você não tem permissão para isso.",
      ephemeral: true
    }).catch(() => {});

    return false;
  }

  return true;
}

function hasRole(member, key) {
  const id = roleId(key);

  if (!id || !member?.roles?.cache) {
    return false;
  }

  return member.roles.cache.has(id);
}

function moneyOrNumber(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return n;
}

function getCoins(guildId, userId) {
  return db.coins[guildId]?.[userId] || 0;
}

function addCoins(guildId, userId, amount) {
  amount = Number(amount || 0);

  if (!amount) {
    return;
  }

  db.coins[guildId] ??= {};
  db.coins[guildId][userId] =
    (db.coins[guildId][userId] || 0) + amount;

  save();
}

/*
  IMPORTANTE:
  O modo agora faz parte da chave.
  Assim:
  Mobile 1x1 R$1 Normal
  e
  Mobile 1x1 R$1 Infinite
  são filas diferentes.
*/
function queueKey(modality, format, value, mode) {
  return [
    modality,
    format,
    value,
    mode
  ].join("|");
}

function queueConfigByKey(key) {
  return db.queueConfigs.find(
    q => queueKey(
      q.modality,
      q.format,
      q.value,
      q.mode
    ) === key
  );
}

function getQueue(key) {
  db.queues[key] ??= [];
  return db.queues[key];
}

function getBet(id) {
  return db.bets[String(id)] || null;
}

/* =========================================================
   EMBEDS
========================================================= */

function makeEmbed(title, description) {
  const appearance = db.settings.appearance;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(
      /^#[0-9A-Fa-f]{6}$/.test(appearance.color)
        ? appearance.color
        : "#000000"
    )
    .setFooter({
      text: appearance.footer || "Sistema de Apostas"
    });

  if (appearance.thumbnail) {
    embed.setThumbnail(appearance.thumbnail);
  }

  if (appearance.banner) {
    embed.setImage(appearance.banner);
  }

  return embed;
}

function configEmbed() {
  const s = db.settings;

  const fee =
    s.fee.type === "percent"
      ? `${s.fee.value}%`
      : money(s.fee.value);

  return makeEmbed(
    "⚙️ CENTRAL DE CONFIGURAÇÃO",

    `🎨 **Cor:** \`${s.appearance.color}\`
📝 **Título:** ${s.appearance.title}

💰 **Taxa:** ${fee}

💳 **Pix:** ${
      s.pix.key
        ? "configurado"
        : "não configurado"
    }

🎮 **Filas configuradas:** ${db.queueConfigs.length}

🛡️ **Mediador:** ${
      roleId("mediator")
        ? `<@&${roleId("mediator")}>`
        : "❌ não definido"
    }

📊 **Analista:** ${
      roleId("analyst")
        ? `<@&${roleId("analyst")}>`
        : "❌ não definido"
    }

📱 **Categoria Mobile:** ${
      channelId("queueMobile")
        ? `<#${channelId("queueMobile")}>`
        : "❌"
    }

💻 **Categoria Emulador:** ${
      channelId("queueEmulator")
        ? `<#${channelId("queueEmulator")}>`
        : "❌"
    }

🔄 **Categoria Misto:** ${
      channelId("queueMixed")
        ? `<#${channelId("queueMixed")}>`
        : "❌"
    }`
  );
}

/* =========================================================
   MENUS DE CONFIGURAÇÃO
========================================================= */

function configRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("cfg_roles")
        .setLabel("👥 Cargos")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("cfg_channels")
        .setLabel("📁 Canais")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("cfg_queue")
        .setLabel("🎮 Filas")
        .setStyle(ButtonStyle.Success)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("cfg_appearance")
        .setLabel("🎨 Aparência")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("cfg_banner")
        .setLabel("🖼️ Banner")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("cfg_fee")
        .setLabel("💰 Taxa")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("cfg_pix")
        .setLabel("💳 Pix")
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("cfg_coins")
        .setLabel("🪙 Coins")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("cfg_publish")
        .setLabel("📋 Publicar filas")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("cfg_structure")
        .setLabel("🏗️ Criar estrutura")
        .setStyle(ButtonStyle.Success)
    )
  ];
}

function roleRows() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("cfgrole:key")
        .setPlaceholder("👥 Escolha qual cargo configurar")
        .addOptions(
          ROLE_KEYS.map(([value, label]) => ({
            label: label.replace(/^[^ ]+ /, ""),
            value,
            description: label
          }))
        )
    )
  ];
}

function channelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("cfgchannel:key")
        .setPlaceholder("📁 Escolha qual canal configurar")
        .addOptions(
          CHANNEL_KEYS.map(([value, label]) => ({
            label: label.replace(/^[^ ]+ /, ""),
            value,
            description: label
          }))
        )
    )
  ];
}

function queueRows() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("queue:mod")
        .setPlaceholder("📱 Modalidade")
        .addOptions(
          MODS.map(([value, label]) => ({
            label: label.slice(2),
            value
          }))
        )
    ),

    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("queue:format")
        .setPlaceholder("🎯 Formato")
        .addOptions(
          FORMATS.map(([value, label]) => ({
            label,
            value
          }))
        )
    ),

    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("queue:value")
        .setPlaceholder("💰 Valor")
        .addOptions(
          VALUES.map(value => ({
            label: money(value),
            value: String(value)
          }))
        )
    ),

    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("queue:mode")
        .setPlaceholder("🎮 Modo")
        .addOptions(
          MODES.map(([value, label]) => ({
            label,
            value
          }))
        )
    )
  ];
}

/* =========================================================
   FILAS
========================================================= */

function availableMediator(guild) {
  const mediatorRoleId = roleId("mediator");

  if (!mediatorRoleId) {
    return null;
  }

  const role = guild.roles.cache.get(mediatorRoleId);

  if (!role) {
    return null;
  }

  const busyMediators = new Set(
    Object.values(db.bets)
      .filter(bet =>
        bet.status !== "closed" &&
        bet.status !== "finished"
      )
      .map(bet => bet.mediatorId)
  );

  for (const userId of db.mediatorQueue) {
    if (
      role.members.has(userId) &&
      !busyMediators.has(userId)
    ) {
      return userId;
    }
  }

  return null;
}

function queueEmbed(config, guild) {
  const key = queueKey(
    config.modality,
    config.format,
    config.value,
    config.mode
  );

  const queue = getQueue(key);

  const players =
    queue.length > 0
      ? queue
          .map(
            (id, index) =>
              `${index + 1}. <@${id}>`
          )
          .join("\n")
      : "Ninguém na fila.";

  const mediator = availableMediator(guild);

  return makeEmbed(
    `${db.settings.appearance.title} — ${fmt(
      MODS,
      config.modality
    )} • ${config.format}`,

    `${db.settings.appearance.description}

💰 **Valor:** ${money(config.value)}
🎮 **Modo:** ${fmt(MODES, config.mode)}

👥 **Jogadores:** ${queue.length}/2

${players}

${
  mediator
    ? "🟢 Mediador disponível."
    : "🔴 Sem mediador disponível."
}`
  );
}

function queueButtons(config) {
  const key = queueKey(
    config.modality,
    config.format,
    config.value,
    config.mode
  );

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`queuejoin:${key}`)
        .setLabel("🎮 Entrar na fila")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`queueleave:${key}`)
        .setLabel("🚪 Sair da fila")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

/* =========================================================
   APOSTAS PRIVADAS
========================================================= */

function privateOverwrites(guild, bet) {
  const visibleUsers = [
    bet.p1,
    bet.p2,
    bet.mediatorId
  ].filter(Boolean);

  const overwrites = visibleUsers.map(id => ({
    id,
    allow: [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ReadMessageHistory
    ]
  }));

  for (const key of [
    "admin",
    "subowner",
    "privateAccess"
  ]) {
    const id = roleId(key);

    if (id) {
      overwrites.push({
        id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      });
    }
  }

  overwrites.push({
    id: guild.roles.everyone.id,
    deny: [
      PermissionsBitField.Flags.ViewChannel
    ]
  });

  return overwrites;
}

async function createBet(
  guild,
  config,
  p1,
  p2
) {
  const mediator = availableMediator(guild);

  if (!mediator) {
    return null;
  }

  const id = String(db.nextBet++);

  const bet = {
    id,
    guildId: guild.id,

    p1,
    p2,

    mediatorId: mediator,

    modality: config.modality,
    format: config.format,
    value: Number(config.value),
    mode: config.mode,

    confirmations: {
      [p1]: false,
      [p2]: false
    },

    paid: {
      [p1]: false,
      [p2]: false
    },

    status: "confirm",

    result: null,
    winner: null,

    createdAt: Date.now(),
    finalizedAt: null
  };

  const parent =
    channelId("privateCategory");

  const channel =
    await guild.channels.create({
      name: `aposta-${id}`,
      type: ChannelType.GuildText,
      parent: parent || undefined,
      permissionOverwrites:
        privateOverwrites(guild, bet)
    });

  bet.channelId = channel.id;

  db.bets[id] = bet;

  save();

  await channel.send({
    content:
      `<@${p1}> <@${p2}> <@${mediator}>`,

    embeds: [
      makeEmbed(
        `🔒 APOSTA #${id}`,

        `👤 **Jogador 1:** <@${p1}>
👤 **Jogador 2:** <@${p2}>
🛡️ **Mediador:** <@${mediator}>

💰 **Valor:** ${money(config.value)}
📱 **Modalidade:** ${fmt(MODS, config.modality)}
🎯 **Formato:** ${config.format}
🎮 **Modo:** ${fmt(MODES, config.mode)}

━━━━━━━━━━━━━━━━━━

✅ **CONFIRMAÇÃO**

Os dois jogadores devem confirmar a aposta.

A aposta possui somente **2 jogadores**.`
      )
    ],

    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`betconfirm:${id}`)
          .setLabel("✅ Confirmar aposta")
          .setStyle(ButtonStyle.Success)
      )
    ]
  });

  return bet;
}

/* =========================================================
   PIX
========================================================= */

function pixEmbed(bet) {
  const pix = db.settings.pix;
  const fee = db.settings.fee;

  const feeText =
    fee.type === "percent"
      ? `${fee.value}%`
      : money(fee.value);

  return makeEmbed(
    "💳 PIX DA APOSTA",

    `💰 **Valor:** ${money(bet.value)}

💼 **Taxa:** ${feeText}

🔑 **Chave Pix:** \`${pix.key || "Não configurada"}\`

👤 **Nome:** ${
      pix.name || "Não configurado"
    }

📍 **Cidade:** ${
      pix.city || "Não configurada"
    }

${
  pix.qr
    ? "📷 QR Code configurado."
    : "📷 QR Code não configurado."
}

⚠️ O bot não confirma automaticamente que um Pix foi pago.`
  );
}

/* =========================================================
   MEDIADOR
   EXATAMENTE 3 OPÇÕES
========================================================= */

function mediatorPanel(bet) {
  return {
    embeds: [
      makeEmbed(
        "🛡️ PAINEL DO MEDIADOR",

        `Aposta **#${bet.id}**

👤 Jogador 1: <@${bet.p1}>
👤 Jogador 2: <@${bet.p2}>

Escolha uma ação abaixo.`
      )
    ],

    components: [
      new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId(`med:win:${bet.id}`)
          .setLabel("🏆 Escolher vencedor")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`med:wo:${bet.id}`)
          .setLabel("⚠️ Vitória por W.O.")
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId(`med:finish:${bet.id}`)
          .setLabel("🗑️ Finalizar aposta")
          .setStyle(ButtonStyle.Secondary)

      )
    ]
  };
}

/* =========================================================
   FINALIZAÇÃO
========================================================= */

async function finishBet(
  interaction,
  bet
) {
  if (bet.status === "closed") {
    return interaction.reply({
      content: "⚠️ Esta aposta já foi finalizada.",
      ephemeral: true
    });
  }

  bet.status = "finished";
  bet.finalizedAt = Date.now();

  save();

  const channel =
    interaction.guild.channels.cache.get(
      bet.channelId
    );

  if (!channel) {
    return interaction.reply({
      content: "❌ Canal da aposta não encontrado.",
      ephemeral: true
    });
  }

  await interaction.reply({
    content:
      "A aposta foi finalizada. O canal será habilitado em cinco segundos."
  });

  await channel.send({
    content:
      "🔒 **A aposta foi finalizada.**\n\nO canal será habilitado em cinco segundos."
  });

  setTimeout(async () => {
    try {
      await channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone.id,
        {
          ViewChannel: null
        }
      );

      await channel.send(
        "🔓 **Canal habilitado novamente.**"
      );
    } catch (err) {
      console.error(
        "Erro habilitando canal:",
        err
      );
    }
  }, 5000);
}

/* =========================================================
   RESULTADO
========================================================= */

async function chooseWinner(
  interaction,
  bet
) {
  const row =
    new ActionRowBuilder().addComponents(

      new ButtonBuilder()
        .setCustomId(`winner:${bet.id}:${bet.p1}`)
        .setLabel("🏆 Jogador 1")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`winner:${bet.id}:${bet.p2}`)
        .setLabel("🏆 Jogador 2")
        .setStyle(ButtonStyle.Success)

    );

  return interaction.reply({
    content:
      "🏆 Escolha qual jogador venceu:",
    components: [row],
    ephemeral: true
  });
}

async function chooseWO(
  interaction,
  bet
) {
  const row =
    new ActionRowBuilder().addComponents(

      new ButtonBuilder()
        .setCustomId(`wowinner:${bet.id}:${bet.p1}`)
        .setLabel("🏆 Jogador 1")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(`wowinner:${bet.id}:${bet.p2}`)
        .setLabel("🏆 Jogador 2")
        .setStyle(ButtonStyle.Danger)

    );

  return interaction.reply({
    content:
      "⚠️ Escolha quem venceu por W.O.:",
    components: [row],
    ephemeral: true
  });
}

async function registerResult(
  interaction,
  bet,
  winner,
  type
) {
  if (
    bet.status === "closed" ||
    bet.status === "finished"
  ) {
    return interaction.reply({
      content:
        "⚠️ Esta aposta já foi finalizada.",
      ephemeral: true
    });
  }

  if (
    winner !== bet.p1 &&
    winner !== bet.p2
  ) {
    return interaction.reply({
      content:
        "❌ Jogador inválido.",
      ephemeral: true
    });
  }

  bet.status = "closed";
  bet.result = type;
  bet.winner = winner;
  bet.finalizedAt = Date.now();

  const reward =
    type === "wo"
      ? Number(db.settings.coins.wo || 0)
      : Number(db.settings.coins.win || 0);

  addCoins(
    bet.guildId,
    winner,
    reward
  );

  save();

  const channel =
    interaction.guild.channels.cache.get(
      bet.channelId
    );

  if (channel) {
    await channel.send(
      `🏆 **Resultado da aposta #${bet.id}**

${
  type === "wo"
    ? "⚠️ Vitória por W.O."
    : "🏆 Vitória normal"
}

👑 **Vencedor:** <@${winner}>

🪙 **Coins recebidos:** ${reward}`
    );
  }

  return interaction.update({
    content:
      `✅ Resultado registrado.\n\n🏆 Vencedor: <@${winner}>`,
    components: []
  });
}

/* =========================================================
   PUBLICAÇÃO DAS FILAS
========================================================= */

async function publishQueues(guild) {
  let count = 0;

  for (const config of db.queueConfigs) {
    const categoryKey =
      config.modality === "mobile"
        ? "queueMobile"
        : config.modality === "emulador"
          ? "queueEmulator"
          : "queueMixed";

    const categoryId =
      channelId(categoryKey);

    if (!categoryId) {
      continue;
    }

    const category =
      guild.channels.cache.get(
        categoryId
      );

    if (!category) {
      continue;
    }

    const channelName =
      `fila-${config.modality}-${config.format}-${config.value}-${config.mode}`;

    let channel =
      guild.channels.cache.find(
        c =>
          c.parentId === category.id &&
          c.name === channelName
      );

    if (!channel) {
      channel =
        await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: category.id
        });
    }

    let message = null;

    if (config.messageId) {
      message =
        await channel.messages
          .fetch(config.messageId)
          .catch(() => null);
    }

    if (message) {
      await message.edit({
        embeds: [
          queueEmbed(
            config,
            guild
          )
        ],
        components:
          queueButtons(config)
      });
    } else {
      message =
        await channel.send({
          embeds: [
            queueEmbed(
              config,
              guild
            )
          ],
          components:
            queueButtons(config)
        });

      config.messageId =
        message.id;
    }

    config.channelId =
      channel.id;

    count++;
  }

  save();

  return count;
}

/* =========================================================
   ESTRUTURA DO SERVIDOR
========================================================= */

async function createStructure(guild) {
  const created = [];

  for (
    const [categoryName, channels]
    of Object.entries(BASE_CHANNELS)
  ) {
    let category =
      guild.channels.cache.find(
        channel =>
          channel.type === ChannelType.GuildCategory &&
          channel.name.toLowerCase() ===
            categoryName.toLowerCase()
      );

    if (!category) {
      category =
        await guild.channels.create({
          name: categoryName,
          type: ChannelType.GuildCategory
        });
    }

    created.push(category.name);

    for (const name of channels) {
      const clean =
        name
          .toLowerCase()
          .replace(
            /[^a-z0-9\-\u00c0-\u017f・]/gi,
            "-"
          )
          .replace(/-+/g, "-")
          .slice(0, 95);

      const exists =
        guild.channels.cache.find(
          channel =>
            channel.parentId === category.id &&
            channel.name === clean
        );

      if (!exists) {
        await guild.channels.create({
          name: clean,
          type: ChannelType.GuildText,
          parent: category.id
        });
      }
    }
  }

  /* FILAS */

  for (
    const [key, name] of [
      ["queueMobile", "📱・MOBILE"],
      ["queueEmulator", "💻・EMULADOR"],
      ["queueMixed", "🔄・MISTO"]
    ]
  ) {
    let category =
      guild.channels.cache.find(
        channel =>
          channel.type === ChannelType.GuildCategory &&
          channel.name === name
      );

    if (!category) {
      category =
        await guild.channels.create({
          name,
          type: ChannelType.GuildCategory
        });
    }

    db.settings.channels[key] =
      category.id;
  }

  /* APOSTAS PRIVADAS */

  let privateCategory =
    guild.channels.cache.find(
      channel =>
        channel.type === ChannelType.GuildCategory &&
        channel.name ===
          "🔒・APOSTAS PRIVADAS"
    );

  if (!privateCategory) {
    privateCategory =
      await guild.channels.create({
        name: "🔒・APOSTAS PRIVADAS",
        type: ChannelType.GuildCategory
      });
  }

  db.settings.channels.privateCategory =
    privateCategory.id;

  /* MEDIADORES */

  let mediatorCategory =
    guild.channels.cache.find(
      channel =>
        channel.type === ChannelType.GuildCategory &&
        channel.name ===
          "🛡️・MEDIADORES"
    );

  if (!mediatorCategory) {
    mediatorCategory =
      await guild.channels.create({
        name: "🛡️・MEDIADORES",
        type: ChannelType.GuildCategory
      });
  }

  db.settings.channels.mediatorCategory =
    mediatorCategory.id;

  let mediatorChannel =
    guild.channels.cache.find(
      channel =>
        channel.parentId ===
          mediatorCategory.id &&
        channel.name ===
          "🛡️・fila-mediadores"
    );

  if (!mediatorChannel) {
    mediatorChannel =
      await guild.channels.create({
        name: "🛡️・fila-mediadores",
        type: ChannelType.GuildText,
        parent: mediatorCategory.id
      });
  }

  db.settings.channels.mediatorQueue =
    mediatorChannel.id;

  /* ANALISTAS */

  let analystChannel =
    guild.channels.cache.find(
      channel =>
        channel.parentId ===
          mediatorCategory.id &&
        channel.name ===
          "📊・notificacoes-analistas"
    );

  if (!analystChannel) {
    analystChannel =
      await guild.channels.create({
        name:
          "📊・notificacoes-analistas",
        type: ChannelType.GuildText,
        parent: mediatorCategory.id
      });
  }

  db.settings.channels.analystNotify =
    analystChannel.id;

  /* FEED */

  let feed =
    guild.channels.cache.find(
      channel =>
        channel.name ===
        "📰・feed"
    );

  if (!feed) {
    feed =
      await guild.channels.create({
        name: "📰・feed",
        type: ChannelType.GuildText
      });
  }

  db.settings.channels.feed =
    feed.id;

  save();

  return created;
}

/* =========================================================
   SLASH COMMANDS
========================================================= */

const slash = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription(
      "Abre o painel completo de configuração"
    ),

  new SlashCommandBuilder()
    .setName("config")
    .setDescription(
      "Configura uma fila"
    ),

  new SlashCommandBuilder()
    .setName("estrutura")
    .setDescription(
      "Cria a estrutura do servidor"
    ),

  new SlashCommandBuilder()
    .setName("cargos")
    .setDescription(
      "Configura os cargos"
    ),

  new SlashCommandBuilder()
    .setName("canais")
    .setDescription(
      "Configura os canais"
    ),

  new SlashCommandBuilder()
    .setName("mediadores")
    .setDescription(
      "Abre a fila de mediadores"
    ),

  new SlashCommandBuilder()
    .setName("analistas")
    .setDescription(
      "Mostra solicitações de análise"
    ),

  new SlashCommandBuilder()
    .setName("painel")
    .setDescription(
      "Publica as filas"
    ),

  new SlashCommandBuilder()
    .setName("coins")
    .setDescription(
      "Mostra seus Coins"
    ),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription(
      "Mostra os comandos"
    )
].map(command => command.toJSON());

/* =========================================================
   CLIENT
========================================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],

  partials: [
    Partials.Channel,
    Partials.Message
  ]
});

/* =========================================================
   READY
========================================================= */

client.once("ready", async () => {
  console.log(
    `ONLINE: ${client.user.tag}`
  );

  client.user.setPresence({
    activities: [
      {
        name:
          db.settings.appearance.botStatus ||
          "🎮 Sistema de Apostas"
      }
    ],
    status: "online"
  });

  const rest =
    new REST({
      version: "10"
    }).setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,
        GUILD_ID
      ),
      {
        body: slash
      }
    );

    console.log(
      "Slash commands registrados."
    );
  } catch (error) {
    console.error(
      "Erro registrando comandos:",
      error
    );
  }
});

/* =========================================================
   SAÍDA DO SERVIDOR
========================================================= */

client.on(
  "guildMemberRemove",
  member => {
    if (
      db.mediatorQueue.includes(
        member.id
      )
    ) {
      db.mediatorQueue =
        db.mediatorQueue.filter(
          id => id !== member.id
        );

      save();
    }
  }
);

/* =========================================================
   COMANDOS DE TEXTO
========================================================= */

client.on(
  "messageCreate",
  async message => {
    try {
      if (
        message.author.bot ||
        !message.guild
      ) {
        return;
      }

      const content =
        message.content
          .trim()
          .toLowerCase();

      const bet =
        Object.values(db.bets).find(
          b =>
            b.channelId ===
              message.channel.id &&
            b.status !== "closed"
        );

      /* ============================================
         .SS MOB
      ============================================ */

      if (
        content === ".ss mob"
      ) {
        if (!bet) {
          return message.reply(
            "❌ Use `.SS Mob` dentro do canal privado de uma aposta."
          );
        }

        const analystRole =
          roleId("analyst");

        if (!analystRole) {
          return message.reply(
            "❌ O cargo de Analista ainda não foi configurado."
          );
        }

        const already =
          db.analystRequests.find(
            request =>
              request.betId ===
              bet.id
          );

        if (!already) {
          db.analystRequests.push({
            betId: bet.id,
            userId:
              message.author.id,
            type: "mob",
            analystId: null,
            createdAt: Date.now()
          });

          save();
        }

        await message.channel.send({
          embeds: [
            makeEmbed(
              "📱 SOLICITAÇÃO DE ANALISTA MOBILE",

              `<@&${analystRole}>

📌 **Aposta:** #${bet.id}
👤 **Solicitado por:** <@${message.author.id}>

📱 **Tipo:** Mobile

Um Analista configurado pode assumir esta análise.`
            )
          ]
        });

        const notifyId =
          channelId("analystNotify");

        const notify =
          notifyId
            ? message.guild.channels.cache.get(
                notifyId
              )
            : null;

        if (notify) {
          await notify.send({
            content:
              `<@&${analystRole}> 📱 **Nova análise Mobile**\nAposta #${bet.id}\nCanal: <#${bet.channelId}>`,

            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    `analyst:assume:${bet.id}`
                  )
                  .setLabel(
                    "🔎 Assumir análise"
                  )
                  .setStyle(
                    ButtonStyle.Success
                  )
              )
            ]
          });
        }

        return;
      }

      /* ============================================
         .MED
      ============================================ */

      if (
        content === ".med" ||
        content === ".MED".toLowerCase()
      ) {
        if (!bet) {
          return message.reply(
            "❌ Este canal não possui aposta ativa."
          );
        }

        if (
          message.author.id !==
          bet.mediatorId
        ) {
          return message.reply(
            "❌ Somente o Mediador responsável pode usar `.MED`."
          );
        }

        /*
          EXATAMENTE 3 OPÇÕES:
          1 - Escolher vencedor
          2 - Vitória por W.O.
          3 - Finalizar aposta
        */

        return message.reply(
          mediatorPanel(bet)
        );
      }

    } catch (error) {
      console.error(
        "messageCreate:",
        error
      );
    }
  }
);

/* =========================================================
   INTERAÇÕES
========================================================= */

client.on(
  "interactionCreate",
  async interaction => {
    try {

      /* ==========================================
         SLASH
      ========================================== */

      if (
        interaction.isChatInputCommand()
      ) {

        if (
          interaction.commandName ===
          "help"
        ) {
          return interaction.reply({
            content:
              "`/setup` configuração\n" +
              "`/config` configurar fila\n" +
              "`/estrutura` criar estrutura\n" +
              "`/cargos` configurar cargos\n" +
              "`/canais` configurar canais\n" +
              "`/mediadores` fila de mediadores\n" +
              "`/analistas` solicitações\n" +
              "`/painel` publicar filas\n" +
              "`/coins` consultar Coins\n" +
              "`.MED` painel do mediador\n" +
              "`.SS Mob` solicitar análise Mobile",

            ephemeral: true
          });
        }

        if (
          interaction.commandName ===
          "coins"
        ) {
          return interaction.reply({
            content:
              `🪙 Você possui **${getCoins(
                interaction.guild.id,
                interaction.user.id
              )} Coins**.`,

            ephemeral: true
          });
        }

        if (
          [
            "setup",
            "config",
            "estrutura",
            "cargos",
            "canais",
            "painel"
          ].includes(
            interaction.commandName
          )
        ) {
          if (
            !requireAdmin(
              interaction
            )
          ) {
            return;
          }
        }

        if (
          interaction.commandName ===
          "setup"
        ) {
          return interaction.reply({
            embeds: [
              configEmbed()
            ],
            components:
              configRows(),
            ephemeral: true
          });
        }

        if (
          interaction.commandName ===
          "estrutura"
        ) {
          const categories =
            await createStructure(
              interaction.guild
            );

          return interaction.reply({
            content:
              `✅ Estrutura criada/atualizada.\n\n` +
              categories
                .map(
                  x => `📁 ${x}`
                )
                .join("\n") +
              `\n\n❌ Sem Full Capa, regras-full-capa, encontre-seu-ap e sem canal geral de análise.`,

            ephemeral: true
          });
        }

        if (
          interaction.commandName ===
          "cargos"
        ) {
          return interaction.reply({
            content:
              "👥 Selecione primeiro qual cargo deseja configurar.",

            components:
              roleRows(),

            ephemeral: true
          });
        }

        if (
          interaction.commandName ===
          "canais"
        ) {
          return interaction.reply({
            content:
              "📁 Selecione primeiro qual canal/categoria deseja configurar.",

            components:
              channelRows(),

            ephemeral: true
          });
        }

        if (
          interaction.commandName ===
          "config"
        ) {
          db.temp[
            interaction.user.id
          ] = {};

          return interaction.reply({
            content:
              "🎮 Configure a fila.\n\n" +
              "Cada fila possui **exatamente 2 vagas**, independentemente de ser 1x1, 2x2, 3x3 ou 4x4.",

            components:
              queueRows(),

            ephemeral: true
          });
        }

        if (
          interaction.commandName ===
          "painel"
        ) {
          const total =
            await publishQueues(
              interaction.guild
            );

          return interaction.reply({
            content:
              `✅ ${total} fila(s) publicada(s)/atualizada(s).`,

            ephemeral: true
          });
        }

        if (
          interaction.commandName ===
          "mediadores"
        ) {
          const role =
            roleId("mediator");

          const valid =
            db.mediatorQueue.filter(
              id => {
                const member =
                  interaction.guild.members.cache.get(
                    id
                  );

                return (
                  member &&
                  hasRole(
                    member,
                    "mediator"
                  )
                );
              }
            );

          db.mediatorQueue =
            valid;

          save();

          const text =
            valid.length
              ? valid
                  .map(
                    (id, index) =>
                      `${index + 1}. 🟢 <@${id}>`
                  )
                  .join("\n")
              : "Nenhum mediador na fila.";

          return interaction.reply({
            embeds: [
              makeEmbed(
                "🛡️ FILA DE MEDIADORES",

                `Disponíveis agora: **${valid.length}**

${text}

⚠️ Um mediador ocupado não será selecionado para uma nova aposta.`
              )
            ],

            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    "medq:join"
                  )
                  .setLabel(
                    "🛡️ Entrar"
                  )
                  .setStyle(
                    ButtonStyle.Success
                  ),

                new ButtonBuilder()
                  .setCustomId(
                    "medq:leave"
                  )
                  .setLabel(
                    "🚪 Sair"
                  )
                  .setStyle(
                    ButtonStyle.Secondary
                  )
              )
            ]
          });
        }

        if (
          interaction.commandName ===
          "analistas"
        ) {
          if (
            !hasRole(
              interaction.member,
              "analyst"
            ) &&
            !isAdmin(interaction)
          ) {
            return interaction.reply({
              content:
                "❌ Você não possui o cargo de Analista configurado.",

              ephemeral: true
            });
          }

          const requests =
            db.analystRequests.filter(
              x => !x.analystId
            );

          const text =
            requests.length
              ? requests
                  .map(
                    x =>
                      `📱 Aposta #${x.betId} — <@${x.userId}>`
                  )
                  .join("\n")
              : "Nenhuma solicitação pendente.";

          return interaction.reply({
            content: text,
            ephemeral: true
          });
        }
      }

      /* ==========================================
         SELEÇÃO DO CARGO
      ========================================== */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "cfgrole:key"
      ) {
        if (
          !requireAdmin(
            interaction
          )
        ) {
          return;
        }

        const key =
          interaction.values[0];

        const label =
          ROLE_KEYS.find(
            x => x[0] === key
          )?.[1] || key;

        return interaction.update({
          content:
            `👥 Configurando **${label}**.\n\nAgora selecione o cargo:`,

          components: [
            new ActionRowBuilder().addComponents(
              new RoleSelectMenuBuilder()
                .setCustomId(
                  `role:${key}`
                )
                .setPlaceholder(
                  "Selecione o cargo do servidor"
                )
            )
          ]
        });
      }

      /* ==========================================
         SELEÇÃO DO CANAL
      ========================================== */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "cfgchannel:key"
      ) {
        if (
          !requireAdmin(
            interaction
          )
        ) {
          return;
        }

        const key =
          interaction.values[0];

        const label =
          CHANNEL_KEYS.find(
            x => x[0] === key
          )?.[1] || key;

        return interaction.update({
          content:
            `📁 Configurando **${label}**.\n\nAgora selecione o canal/categoria:`,

          components: [
            new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId(
                  `channel:${key}`
                )
                .setPlaceholder(
                  "Selecione o canal/categoria"
                )
                .addChannelTypes(
                  ChannelType.GuildCategory,
                  ChannelType.GuildText
                )
            )
          ]
        });
      }

      /* ==========================================
         ROLE SELECT
      ========================================== */

      if (
        interaction.isRoleSelectMenu()
      ) {
        if (
          !requireAdmin(
            interaction
          )
        ) {
          return;
        }

        const key =
          interaction.customId
            .split(":")[1];

        db.settings.roles[key] =
          interaction.values[0];

        save();

        return interaction.update({
          content:
            `✅ Cargo configurado: <@&${interaction.values[0]}>`,

          components:
            roleRows()
        });
      }

      /* ==========================================
         CHANNEL SELECT
      ========================================== */

      if (
        interaction.isChannelSelectMenu()
      ) {
        if (
          !requireAdmin(
            interaction
          )
        ) {
          return;
        }

        const key =
          interaction.customId
            .split(":")[1];

        db.settings.channels[key] =
          interaction.values[0];

        save();

        return interaction.update({
          content:
            `✅ Canal/categoria configurado: <#${interaction.values[0]}>`,

          components:
            channelRows()
        });
      }

      /* ==========================================
         CONFIGURAÇÃO DA FILA
      ========================================== */

      if (
        interaction.isStringSelectMenu()
      ) {
        const [
          kind,
          field
        ] =
          interaction.customId
            .split(":");

        if (
          kind === "queue"
        ) {
          if (
            !requireAdmin(
              interaction
            )
          ) {
            return;
          }

          db.temp[
            interaction.user.id
          ] ??= {};

          db.temp[
            interaction.user.id
          ][field] =
            field === "value"
              ? Number(
                  interaction.values[0]
                )
              : interaction.values[0];

          const temp =
            db.temp[
              interaction.user.id
            ];

          if (
            temp.mod &&
            temp.format &&
            temp.value &&
            temp.mode
          ) {
            const config = {
              modality: temp.mod,
              format: temp.format,
              value: temp.value,
              mode: temp.mode
            };

            const key =
              queueKey(
                config.modality,
                config.format,
                config.value,
                config.mode
              );

            const index =
              db.queueConfigs.findIndex(
                q =>
                  queueKey(
                    q.modality,
                    q.format,
                    q.value,
                    q.mode
                  ) === key
              );

            if (index >= 0) {
              db.queueConfigs[index] = {
                ...db.queueConfigs[index],
                ...config
              };
            } else {
              db.queueConfigs.push(
                config
              );
            }

            delete db.temp[
              interaction.user.id
            ];

            save();

            return interaction.update({
              content:
                `✅ **Fila salva!**\n\n` +
                `${fmt(MODS, config.modality)} • ` +
                `${config.format} • ` +
                `${money(config.value)} • ` +
                `${fmt(MODES, config.mode)}\n\n` +
                `👥 A fila possui exatamente **2 vagas**.\n\n` +
                `Use \`/painel\` para publicar.`,

              components: []
            });
          }

          return interaction.deferUpdate();
        }
      }

      /* ==========================================
         BOTÕES
      ========================================== */

      if (
        interaction.isButton()
      ) {
        const [
          action,
          ...args
        ] =
          interaction.customId
            .split(":");

        /* ========================================
           CONFIG
        ======================================== */

        if (
          action ===
          "cfg_roles"
        ) {
          if (
            !requireAdmin(
              interaction
            )
          ) {
            return;
          }

          return interaction.reply({
            content:
              "👥 Escolha o cargo que deseja configurar:",

            components:
              roleRows(),

            ephemeral: true
          });
        }

        if (
          action ===
          "cfg_channels"
        ) {
          if (
            !requireAdmin(
              interaction
            )
          ) {
            return;
          }

          return interaction.reply({
            content:
              "📁 Escolha o canal/categoria que deseja configurar:",

            components:
              channelRows(),

            ephemeral: true
          });
        }

        if (
          action ===
          "cfg_queue"
        ) {
          if (
            !requireAdmin(
              interaction
            )
          ) {
            return;
          }

          db.temp[
            interaction.user.id
          ] = {};

          return interaction.reply({
            content:
              "🎮 Escolha modalidade, formato, valor e modo:",

            components:
              queueRows(),

            ephemeral: true
          });
        }

        if (
          action ===
          "cfg_publish"
        ) {
          if (
            !requireAdmin(
              interaction
            )
          ) {
            return;
          }

          const total =
            await publishQueues(
              interaction.guild
            );

          return interaction.reply({
            content:
              `✅ ${total} fila(s) publicadas/atualizadas.`,

            ephemeral: true
          });
        }

        if (
          action ===
          "cfg_structure"
        ) {
          if (
            !requireAdmin(
              interaction
            )
          ) {
            return;
          }

          await createStructure(
            interaction.guild
          );

          return interaction.reply({
            content:
              "✅ Estrutura criada/atualizada sem os itens removidos.",

            ephemeral: true
          });
        }

        /* ========================================
           APARÊNCIA
        ======================================== */

        if (
          action ===
          "cfg_appearance"
        ) {
          if (
            !requireAdmin(
              interaction
            )
          ) {
            return;
          }

          const modal =
            new ModalBuilder()
              .setCustomId(
                "modal:appearance"
              )
              .setTitle(
                "🎨 Aparência"
              );

          const fields = [
            [
              "color",
              "Cor HEX",
              "#000000",
              TextInputStyle.Short
            ],

            [
              "title",
              "Título",
              "🎮 FILA DE APOSTAS",
              TextInputStyle.Short
            ],

            [
              "description",
              "Descrição",
              "Entre na fila.",
              TextInputStyle.Paragraph
            ],

            [
              "footer",
              "Rodapé",
              "Sistema de Apostas",
              TextInputStyle.Short
            ],

            [
              "thumbnail",
              "URL da thumbnail",
              "https://...",
              TextInputStyle.Short
            ]
          ];

          for (
            const [
              id,
              label,
              placeholder,
              style
            ] of fields
          ) {
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId(id)
                  .setLabel(label)
                  .setPlaceholder(
                    placeholder
                  )
                  .setStyle(style)
                  .setRequired(false)
              )
            );
          }

          return interaction.showModal(
            modal
          );
        }

        /* ========================================
           BANNER
        ======================================== */

        if (
          action ===
          "cfg_banner"
        ) {
          if (
            !requireAdmin(
              interaction
            )
          ) {
            return;
          }

          const modal =
            new ModalBuilder()
              .setCustomId(
                "modal:banner"
              )
              .setTitle(
                "🖼️ Banner"
              );

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(
                  "banner"
                )
                .setLabel(
                  "URL do banner"
                )
                .setPlaceholder(
                  "https://..."
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setRequired(false)
            )
          );

          return interaction.showModal(
            modal
          );
        }

        /* ========================================
           TAXA
        ======================================== */

        if (
          action ===
          "cfg_fee"
        ) {
          if (
            !requireAdmin(
              interaction
            )
          ) {
            return;
          }

          const modal =
            new ModalBuilder()
              .setCustomId(
                "modal:fee"
              )
              .setTitle(
                "💰 Taxa"
              );

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(
                  "type"
                )
                .setLabel(
                  "Tipo: percent ou fixed"
                )
                .setPlaceholder(
                  "percent"
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setRequired(true)
            ),

            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(
                  "value"
                )
                .setLabel(
                  "Valor"
                )
                .setPlaceholder(
                  "10"
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setRequired(true)
            )
          );

          return interaction.showModal(
            modal
          );
        }

        /* ========================================
           PIX
        ======================================== */

        if (
          action ===
          "cfg_pix"
        ) {
          if (
            !requireAdmin(
              interaction
            )
          ) {
            return;
          }

          const modal =
            new ModalBuilder()
              .setCustomId(
                "modal:pix"
              )
              .setTitle(
                "💳 Pix"
              );

          for (
            const [
              id,
              label,
              placeholder
            ] of [
              [
                "key",
                "Chave Pix",
                "sua chave"
              ],

              [
                "name",
                "Nome",
                "Nome do recebedor"
              ],

              [
                "city",
                "Cidade",
                "Cidade"
              ],

              [
                "qr",
                "URL do QR Code",
                "https://..."
              ]
            ]
          ) {
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId(id)
                  .setLabel(label)
                  .setPlaceholder(
                    placeholder
                  )
                  .setStyle(
                    TextInputStyle.Short
                  )
                  .setRequired(false)
              )
            );
          }

          return interaction.showModal(
            modal
          );
        }

        /* ========================================
           COINS
        ======================================== */

        if (
          action ===
          "cfg_coins"
        ) {
          if (
            !requireAdmin(
              interaction
            )
          ) {
            return;
          }

          const modal =
            new ModalBuilder()
              .setCustomId(
                "modal:coins"
              )
              .setTitle(
                "🪙 Coins"
              );

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(
                  "win"
                )
                .setLabel(
                  "Coins por vitória"
                )
                .setPlaceholder(
                  "1"
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setRequired(true)
            ),

            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(
                  "wo"
                )
                .setLabel(
                  "Coins por W.O."
                )
                .setPlaceholder(
                  "1"
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setRequired(true)
            ),

            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(
                  "entry"
                )
                .setLabel(
                  "Coins por entrada"
                )
                .setPlaceholder(
                  "0"
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setRequired(false)
            )
          );

          return interaction.showModal(
            modal
          );
        }

        /* ========================================
           FILA DE MEDIADORES
        ======================================== */

        if (
          action ===
          "medq"
        ) {
          if (
            !hasRole(
              interaction.member,
              "mediator"
            )
          ) {
            return interaction.reply({
              content:
                "❌ Você não possui o cargo de Mediador configurado.",

              ephemeral: true
            });
          }

          if (
            args[0] ===
            "join"
          ) {
            if (
              !db.mediatorQueue.includes(
                interaction.user.id
              )
            ) {
              db.mediatorQueue.push(
                interaction.user.id
              );
            }
          }

          if (
            args[0] ===
            "leave"
          ) {
            db.mediatorQueue =
              db.mediatorQueue.filter(
                id =>
                  id !==
                  interaction.user.id
              );
          }

          save();

          const text =
            db.mediatorQueue.length
              ? db.mediatorQueue
                  .map(
                    (id, index) =>
                      `${index + 1}. 🟢 <@${id}>`
                  )
                  .join("\n")
              : "Nenhum mediador na fila.";

          return interaction.update({
            embeds: [
              makeEmbed(
                "🛡️ FILA DE MEDIADORES",

                `Disponíveis: **${db.mediatorQueue.length}**

${text}`
              )
            ],

            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    "medq:join"
                  )
                  .setLabel(
                    "🛡️ Entrar"
                  )
                  .setStyle(
                    ButtonStyle.Success
                  ),

                new ButtonBuilder()
                  .setCustomId(
                    "medq:leave"
                  )
                  .setLabel(
                    "🚪 Sair"
                  )
                  .setStyle(
                    ButtonStyle.Secondary
                  )
              )
            ]
          });
        }

        /* ========================================
           ENTRAR / SAIR DA FILA
        ======================================== */

        if (
          action ===
            "queuejoin" ||
          action ===
            "queueleave"
        ) {
          const key =
            args.join(":");

          const config =
            queueConfigByKey(
              key
            );

          if (!config) {
            return interaction.reply({
              content:
                "❌ Configuração da fila não encontrada.",

              ephemeral: true
            });
          }

          const queue =
            getQueue(key);

          if (
            action ===
            "queueleave"
          ) {
            db.queues[key] =
              queue.filter(
                id =>
                  id !==
                  interaction.user.id
              );
          }

          if (
            action ===
            "queuejoin"
          ) {
            if (
              queue.includes(
                interaction.user.id
              )
            ) {
              return interaction.reply({
                content:
                  "⚠️ Você já está nesta fila.",

                ephemeral: true
              });
            }

            /*
              TODA fila tem somente 2 vagas.
            */

            if (
              queue.length >= 2
            ) {
              return interaction.reply({
                content:
                  "❌ Esta fila já está cheia. Máximo: 2 jogadores.",

                ephemeral: true
              });
            }

            queue.push(
              interaction.user.id
            );
          }

          save();

          await interaction.update({
            embeds: [
              queueEmbed(
                config,
                interaction.guild
              )
            ],

            components:
              queueButtons(config)
          });

          /*
            Quando chegar exatamente em 2,
            procura um mediador.
          */

          if (
            action ===
              "queuejoin" &&
            queue.length === 2
          ) {
            const mediator =
              availableMediator(
                interaction.guild
              );

            if (!mediator) {
              await interaction.followUp({
                content:
                  "⚠️ A fila chegou a 2 jogadores, mas não há Mediador disponível. Os jogadores permanecerão na fila.",

                ephemeral: true
              });

              return;
            }

            const [
              p1,
              p2
            ] = [
              queue[0],
              queue[1]
            ];

            db.queues[key] =
              [];

            save();

            const bet =
              await createBet(
                interaction.guild,
                config,
                p1,
                p2
              );

            if (!bet) {
              db.queues[key] = [
                p1,
                p2
              ];

              save();
            }
          }

          return;
        }

        /* ========================================
           CONFIRMAR APOSTA
        ======================================== */

        if (
          action ===
          "betconfirm"
        ) {
          const bet =
            getBet(args[0]);

          if (!bet) {
            return interaction.reply({
              content:
                "❌ Aposta não encontrada.",

              ephemeral: true
            });
          }

          if (
            ![
              bet.p1,
              bet.p2
            ].includes(
              interaction.user.id
            )
          ) {
            return interaction.reply({
              content:
                "❌ Você não participa desta aposta.",

              ephemeral: true
            });
          }

          bet.confirmations[
            interaction.user.id
          ] = true;

          save();

          const total =
            Object.values(
              bet.confirmations
            ).filter(Boolean).length;

          if (
            total < 2
          ) {
            return interaction.update({
              embeds: [
                makeEmbed(
                  `🔒 APOSTA #${bet.id}`,

                  `👤 <@${bet.p1}>
👤 <@${bet.p2}>

✅ Confirmações: **${total}/2**

⏳ Aguardando o outro jogador.`
                )
              ],

              components: [
                new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId(
                      `betconfirm:${bet.id}`
                    )
                    .setLabel(
                      "✅ Confirmar aposta"
                    )
                    .setStyle(
                      ButtonStyle.Success
                    )
                )
              ]
            });
          }

          bet.status =
            "payment";

          save();

          return interaction.update({
            embeds: [
              makeEmbed(
                `🔒 APOSTA #${bet.id}`,

                "✅ Os dois jogadores confirmaram a aposta."
              ),

              pixEmbed(bet)
            ],

            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    `paid:${bet.id}`
                  )
                  .setLabel(
                    "✅ Informar pagamento"
                  )
                  .setStyle(
                    ButtonStyle.Success
                  )
              )
            ]
          });
        }

        /* ========================================
           INFORMAR PAGAMENTO
        ======================================== */

        if (
          action ===
          "paid"
        ) {
          const bet =
            getBet(args[0]);

          if (!bet) {
            return interaction.reply({
              content:
                "❌ Aposta não encontrada.",

              ephemeral: true
            });
          }

          if (
            ![
              bet.p1,
              bet.p2
            ].includes(
              interaction.user.id
            )
          ) {
            return interaction.reply({
              content:
                "❌ Você não participa.",

              ephemeral: true
            });
          }

          bet.paid[
            interaction.user.id
          ] = true;

          save();

          return interaction.reply({
            content:
              "✅ Pagamento informado ao sistema.",

            ephemeral: true
          });
        }

        /* ========================================
           MED: ESCOLHER VENCEDOR
        ======================================== */

        if (
          action ===
          "med"
        ) {
          const type =
            args[0];

          const bet =
            getBet(args[1]);

          if (!bet) {
            return interaction.reply({
              content:
                "❌ Aposta não encontrada.",

              ephemeral: true
            });
          }

          if (
            interaction.user.id !==
            bet.mediatorId
          ) {
            return interaction.reply({
              content:
                "❌ Somente o Mediador responsável pode usar este menu.",

              ephemeral: true
            });
          }

          if (
            bet.status ===
              "closed" ||
            bet.status ===
              "finished"
          ) {
            return interaction.reply({
              content:
                "⚠️ Esta aposta já foi finalizada.",

              ephemeral: true
            });
          }

          if (
            type ===
            "win"
          ) {
            return chooseWinner(
              interaction,
              bet
            );
          }

          if (
            type ===
            "wo"
          ) {
            return chooseWO(
              interaction,
              bet
            );
          }

          if (
            type ===
            "finish"
          ) {
            return finishBet(
              interaction,
              bet
            );
          }
        }

        /* ========================================
           VENCEDOR NORMAL
        ======================================== */

        if (
          action ===
          "winner"
        ) {
          const bet =
            getBet(args[0]);

          const winner =
            args[1];

          if (!bet) {
            return interaction.reply({
              content:
                "❌ Aposta não encontrada.",

              ephemeral: true
            });
          }

          if (
            interaction.user.id !==
            bet.mediatorId
          ) {
            return interaction.reply({
              content:
                "❌ Somente o Mediador responsável.",

              ephemeral: true
            });
          }

          return registerResult(
            interaction,
            bet,
            winner,
            "win"
          );
        }

        /* ========================================
           W.O.
        ======================================== */

        if (
          action ===
          "wowinner"
        ) {
          const bet =
            getBet(args[0]);

          const winner =
            args[1];

          if (!bet) {
            return interaction.reply({
              content:
                "❌ Aposta não encontrada.",

              ephemeral: true
            });
          }

          if (
            interaction.user.id !==
            bet.mediatorId
          ) {
            return interaction.reply({
              content:
                "❌ Somente o Mediador responsável.",

              ephemeral: true
            });
          }

          return registerResult(
            interaction,
            bet,
            winner,
            "wo"
          );
        }

        /* ========================================
           ANALISTA ASSUMIR
        ======================================== */

        if (
          action ===
          "analyst"
        ) {
          if (
            args[0] !==
            "assume"
          ) {
            return;
          }

          if (
            !hasRole(
              interaction.member,
              "analyst"
            )
          ) {
            return interaction.reply({
              content:
                "❌ Você não possui o cargo de Analista configurado.",

              ephemeral: true
            });
          }

          const betId =
            args[1];

          const request =
            db.analystRequests.find(
              x =>
                String(
                  x.betId
                ) ===
                String(
                  betId
                ) &&
                !x.analystId
            );

          if (!request) {
            return interaction.reply({
              content:
                "❌ Esta solicitação já foi assumida ou não existe.",

              ephemeral: true
            });
          }

          request.analystId =
            interaction.user.id;

          save();

          const bet =
            getBet(betId);

          if (bet) {
            const channel =
              interaction.guild.channels.cache.get(
                bet.channelId
              );

            if (channel) {
              await channel.permissionOverwrites.edit(
                interaction.user.id,
                {
                  ViewChannel: true,
                  SendMessages: true,
                  ReadMessageHistory: true
                }
              );

              await channel.send(
                `🔎 <@${interaction.user.id}> **assumiu a análise Mobile desta aposta.**`
              );
            }
          }

          return interaction.update({
            content:
              `✅ Análise da aposta #${betId} assumida por <@${interaction.user.id}>.`,

            components: []
          });
        }
      }

      /* ==========================================
         MODAIS
      ========================================== */

      if (
        interaction.isModalSubmit()
      ) {
        if (
          !isAdmin(interaction)
        ) {
          return interaction.reply({
            content:
              "❌ Sem permissão.",

            ephemeral: true
          });
        }

        const id =
          interaction.customId;

        /* APARÊNCIA */

        if (
          id ===
          "modal:appearance"
        ) {
          const get =
            key =>
              interaction.fields
                .getTextInputValue(
                  key
                )
                .trim();

          for (
            const key of [
              "color",
              "title",
              "description",
              "footer",
              "thumbnail"
            ]
          ) {
            const value =
              get(key);

            if (value) {
              db.settings.appearance[
                key
              ] = value;
            }
          }

          if (
            !/^#[0-9A-Fa-f]{6}$/.test(
              db.settings
                .appearance
                .color
            )
          ) {
            db.settings
              .appearance
              .color =
              "#000000";
          }

          save();

          client.user.setPresence({
            activities: [
              {
                name:
                  db.settings
                    .appearance
                    .botStatus
              }
            ],
            status: "online"
          });

          return interaction.reply({
            content:
              "✅ Aparência salva.",

            ephemeral: true
          });
        }

        /* BANNER */

        if (
          id ===
          "modal:banner"
        ) {
          db.settings
            .appearance
            .banner =
            interaction.fields
              .getTextInputValue(
                "banner"
              )
              .trim();

          save();

          return interaction.reply({
            content:
              "✅ Banner salvo.",

            ephemeral: true
          });
        }

        /* TAXA */

        if (
          id ===
          "modal:fee"
        ) {
          const type =
            interaction.fields
              .getTextInputValue(
                "type"
              )
              .trim()
              .toLowerCase();

          const value =
            Number(
              interaction.fields
                .getTextInputValue(
                  "value"
                )
                .replace(",", ".")
            );

          if (
            ![
              "percent",
              "fixed"
            ].includes(type) ||
            !Number.isFinite(
              value
            )
          ) {
            return interaction.reply({
              content:
                "❌ Use `percent` ou `fixed` e informe um número válido.",

              ephemeral: true
            });
          }

          db.settings.fee = {
            type,
            value:
              type ===
              "fixed"
                ? Math.round(
                    value
                  )
                : value
          };

          save();

          return interaction.reply({
            content:
              `✅ Taxa salva: ${
                type === "percent"
                  ? `${value}%`
                  : money(value)
              }`,

            ephemeral: true
          });
        }

        /* PIX */

        if (
          id ===
          "modal:pix"
        ) {
          for (
            const key of [
              "key",
              "name",
              "city",
              "qr"
            ]
          ) {
            db.settings.pix[
              key
            ] =
              interaction.fields
                .getTextInputValue(
                  key
                )
                .trim();
          }

          save();

          return interaction.reply({
            content:
              "✅ Pix salvo.",

            ephemeral: true
          });
        }

        /* COINS */

        if (
          id ===
          "modal:coins"
        ) {
          db.settings.coins.win =
            moneyOrNumber(
              interaction.fields
                .getTextInputValue(
                  "win"
                )
            );

          db.settings.coins.wo =
            moneyOrNumber(
              interaction.fields
                .getTextInputValue(
                  "wo"
                )
            );

          db.settings.coins.entry =
            moneyOrNumber(
              interaction.fields
                .getTextInputValue(
                  "entry"
                )
            );

          save();

          return interaction.reply({
            content:
              "✅ Configuração de Coins salva.",

            ephemeral: true
          });
        }
      }

    } catch (error) {
      console.error(
        "interactionCreate:",
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction.reply({
          content:
            "❌ Ocorreu um erro interno. Confira o terminal.",

          ephemeral: true
        }).catch(() => {});
      }
    }
  }
);

/* =========================================================
   LOGIN
========================================================= */

client.login(TOKEN);
