const {
  Client,
  GatewayIntentBits,
  Partials,
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
  PermissionFlagsBits,
  ChannelType,
  REST,
  Routes,
  SlashCommandBuilder,
  Events
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    "ERRO: configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID nas Variables do Railway."
  );
  process.exit(1);
}

const DATA_FILE = path.join(__dirname, "data.json");

const MODALITIES = {
  mobile: {
    label: "Mobile",
    emoji: "📱"
  },
  emulador: {
    label: "Emulador",
    emoji: "🖥️"
  },
  misto: {
    label: "Misto",
    emoji: "🔀"
  }
};

const FORMATS = ["1x1", "2x2", "3x3", "4x4"];

/*
  VALORES PREDEFINIDOS.
  IMPORTANTE:
  A ordem é maior -> menor para que o maior fique em cima
  e o menor fique embaixo.
*/
const VALUES = [
  100,
  50,
  40,
  20,
  10,
  7,
  5,
  3,
  2,
  1,
  0.5,
  0.3
];

const DEFAULT_DATA = {
  config: {
    color: "#5865F2",
    botAvatar: "",
    mediatorRoleId: "",
    analystRoleId: "",

    mediatorPanelChannelId: "",
    mediatorPanelMessageId: "",

    queueChannelId: "",
    privateCategoryId: "",

    pixName: "",
    pixKey: "",
    pixQr: ""
  },

  queues: {},
  queueMessages: {},
  mediators: [],
  mediatorRotation: 0,

  stats: {},

  bets: {},
  nextBetId: 1,

  analystRequests: {}
};

function clone(object) {
  return JSON.parse(JSON.stringify(object));
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(DEFAULT_DATA, null, 2)
    );

    return clone(DEFAULT_DATA);
  }

  try {
    const saved = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return {
      ...clone(DEFAULT_DATA),
      ...saved,

      config: {
        ...clone(DEFAULT_DATA.config),
        ...(saved.config || {})
      },

      queues: saved.queues || {},
      queueMessages: saved.queueMessages || {},
      mediators: saved.mediators || [],
      stats: saved.stats || {},
      bets: saved.bets || {},
      analystRequests: saved.analystRequests || {}
    };
  } catch (error) {
    console.error(
      "Erro ao carregar data.json:",
      error.message
    );

    return clone(DEFAULT_DATA);
  }
}

let data = loadData();

function save() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2)
    );
  } catch (error) {
    console.error(
      "Erro ao salvar data.json:",
      error.message
    );
  }
}

function money(value) {
  return `R$ ${Number(value)
    .toFixed(2)
    .replace(".", ",")}`;
}

function validColor(value) {
  value = String(value || "").trim();

  if (!/^#?[0-9a-fA-F]{6}$/.test(value)) {
    return "#5865F2";
  }

  return value.startsWith("#")
    ? value
    : `#${value}`;
}

function colorNumber() {
  return parseInt(
    validColor(data.config.color).slice(1),
    16
  );
}

function makeEmbed(title, description) {
  const e = new EmbedBuilder()
    .setColor(colorNumber())
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  if (data.config.botAvatar) {
    e.setThumbnail(data.config.botAvatar);
  }

  return e;
}

function isAdmin(member) {
  return Boolean(
    member?.permissions?.has(
      PermissionFlagsBits.Administrator
    )
  );
}

function hasRole(member, roleId) {
  return Boolean(
    roleId &&
    member?.roles?.cache?.has(roleId)
  );
}

function isMediator(member) {
  return (
    isAdmin(member) ||
    hasRole(
      member,
      data.config.mediatorRoleId
    )
  );
}

function isAnalyst(member) {
  return (
    isAdmin(member) ||
    hasRole(
      member,
      data.config.analystRoleId
    )
  );
}

/* =========================================================
   FILAS
========================================================= */

function queueKey(modality, format, value) {
  return `${modality}|${format}|${value}`;
}

function getQueue(modality, format, value) {
  const key = queueKey(
    modality,
    format,
    value
  );

  if (!Array.isArray(data.queues[key])) {
    data.queues[key] = [];
  }

  return data.queues[key];
}

function initializeQueue(modality, format, value) {
  getQueue(
    modality,
    format,
    value
  );
}

function initializeAllQueues(modality, format) {
  for (const value of VALUES) {
    initializeQueue(
      modality,
      format,
      value
    );
  }

  save();
}

function queueEmbed(
  modality,
  format,
  value
) {
  const queue = getQueue(
    modality,
    format,
    value
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

  const status =
    queue.length >= 2
      ? "🔴 **FILA COMPLETA**"
      : "🟢 **FILA ABERTA**";

  return makeEmbed(
    `╔══ 🎮 FILA DE APOSTA ══╗`,
    [
      `> ${MODALITIES[modality].emoji} **Modalidade:** ${MODALITIES[modality].label}`,
      `> 🎯 **Formato:** ${format}`,
      `> 💰 **Valor:** ${money(value)}`,
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      `👥 **Jogadores — ${queue.length}/2**`,
      players,
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      status,
      "",
      "💡 Entre na fila usando o botão abaixo.",
      "⚠️ Cada fila possui exatamente **2 jogadores**."
    ].join("\n")
  );
}

function queueButtons(
  modality,
  format,
  value
) {
  const id = queueKey(
    modality,
    format,
    value
  );

  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          `queue:join:${id}`
        )
        .setLabel("Entrar na fila")
        .setEmoji("🎮")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          `queue:leave:${id}`
        )
        .setLabel("Sair da fila")
        .setEmoji("🚪")
        .setStyle(ButtonStyle.Secondary)
    );
}

async function publishAllQueues(
  guild,
  modality,
  format,
  channelId
) {
  const channel =
    await guild.channels
      .fetch(channelId)
      .catch(() => null);

  if (!channel || !channel.isTextBased()) {
    throw new Error(
      "Canal de filas inválido."
    );
  }

  initializeAllQueues(
    modality,
    format
  );

  /*
    Uma mensagem por valor.
    Assim conseguimos deixar cada fila
    visualmente bonita e organizada.
  */

  for (const value of VALUES) {
    const key = queueKey(
      modality,
      format,
      value
    );

    const oldMessageId =
      data.queueMessages[key];

    let message = oldMessageId
      ? await channel.messages
          .fetch(oldMessageId)
          .catch(() => null)
      : null;

    const payload = {
      embeds: [
        queueEmbed(
          modality,
          format,
          value
        )
      ],
      components: [
        queueButtons(
          modality,
          format,
          value
        )
      ]
    };

    if (message) {
      await message
        .edit(payload)
        .catch(() => {});
    } else {
      message =
        await channel.send(payload);

      data.queueMessages[key] =
        message.id;
    }
  }

  data.config.queueChannelId =
    channelId;

  save();
}

/* =========================================================
   MEDIADORES
========================================================= */

function mediatorEmbed() {
  const role =
    data.config.mediatorRoleId;

  const list =
    data.mediators.length > 0
      ? data.mediators
          .map(
            (id, index) =>
              `**${index + 1}.** 🟢 <@${id}>`
          )
          .join("\n")
      : "Nenhum Mediador está na fila.";

  return makeEmbed(
    "🛡️ FILA DE MEDIADORES",
    [
      role
        ? `🛡️ **Cargo:** <@&${role}>`
        : "⚠️ Cargo Mediador não configurado.",
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      `👥 **Mediadores online na fila:** ${data.mediators.length}`,
      "",
      list,
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      "🟢 Entre para ficar disponível para atender apostas.",
      "🔴 Saia quando não estiver disponível."
    ].join("\n")
  );
}

function mediatorButtons() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          "mediator:join"
        )
        .setLabel("Entrar na fila")
        .setEmoji("🟢")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          "mediator:leave"
        )
        .setLabel("Sair da fila")
        .setEmoji("🔴")
        .setStyle(ButtonStyle.Danger)
    );
}

async function publishMediatorPanel(
  guild
) {
  const channelId =
    data.config.mediatorPanelChannelId;

  if (!channelId) return;

  const channel =
    await guild.channels
      .fetch(channelId)
      .catch(() => null);

  if (!channel?.isTextBased()) {
    return;
  }

  let message =
    data.config.mediatorPanelMessageId
      ? await channel.messages
          .fetch(
            data.config
              .mediatorPanelMessageId
          )
          .catch(() => null)
      : null;

  const payload = {
    embeds: [mediatorEmbed()],
    components: [mediatorButtons()]
  };

  if (message) {
    await message.edit(payload);
  } else {
    message =
      await channel.send(payload);

    data.config.mediatorPanelMessageId =
      message.id;

    save();
  }
}

function getAvailableMediator(guild) {
  const roleId =
    data.config.mediatorRoleId;

  if (!roleId) return null;

  const role =
    guild.roles.cache.get(roleId);

  if (!role) return null;

  const busy = new Set(
    Object.values(data.bets)
      .filter(
        bet =>
          bet.status !== "closed"
      )
      .map(
        bet =>
          bet.mediatorId
      )
      .filter(Boolean)
  );

  const available =
    data.mediators.filter(
      id =>
        role.members.has(id) &&
        !busy.has(id)
    );

  if (!available.length) {
    return null;
  }

  return available[
    data.mediatorRotation %
      available.length
  ];
}

function chooseMediator(guild) {
  const mediator =
    getAvailableMediator(guild);

  if (!mediator) {
    return null;
  }

  const roleId =
    data.config.mediatorRoleId;

  const role =
    guild.roles.cache.get(roleId);

  const available =
    data.mediators.filter(
      id =>
        role?.members.has(id)
    );

  if (available.length) {
    data.mediatorRotation =
      (data.mediatorRotation + 1) %
      available.length;
  }

  save();

  return mediator;
}

/* =========================================================
   ESTATÍSTICAS
========================================================= */

function getStats(userId) {
  if (!data.stats[userId]) {
    data.stats[userId] = {
      wins: 0,
      losses: 0,
      wo: 0,
      coins: 0
    };
  }

  return data.stats[userId];
}

/* =========================================================
   APOSTA
========================================================= */

async function createBet(
  guild,
  modality,
  format,
  value,
  player1,
  player2
) {
  const mediatorId =
    chooseMediator(guild);

  if (!mediatorId) {
    return null;
  }

  let category =
    data.config.privateCategoryId
      ? await guild.channels
          .fetch(
            data.config.privateCategoryId
          )
          .catch(() => null)
      : null;

  if (
    !category ||
    category.type !==
      ChannelType.GuildCategory
  ) {
    category =
      guild.channels.cache.find(
        c =>
          c.type ===
            ChannelType.GuildCategory &&
          c.name.toLowerCase() ===
            "apostas"
      );

    if (!category) {
      category =
        await guild.channels.create({
          name: "apostas",
          type: ChannelType.GuildCategory
        });
    }

    data.config.privateCategoryId =
      category.id;
  }

  const betId =
    String(data.nextBetId++);

  const channel =
    await guild.channels.create({
      name: `aposta-${betId}`,
      type: ChannelType.GuildText,
      parent: category.id,

      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [
            PermissionFlagsBits.ViewChannel
          ]
        },

        ...[
          player1,
          player2,
          mediatorId
        ].map(id => ({
          id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }))
      ]
    });

  data.bets[betId] = {
    id: betId,
    channelId: channel.id,

    modality,
    format,
    value: Number(value),

    player1,
    player2,
    mediatorId,

    status: "confirmation",

    confirmations: {
      [player1]: false,
      [player2]: false
    },

    createdAt: Date.now()
  };

  save();

  await channel.send({
    content:
      `<@${player1}> <@${player2}> <@${mediatorId}>`,

    embeds: [
      makeEmbed(
        `🔒 APOSTA #${betId}`,
        [
          `📱 **Modalidade:** ${MODALITIES[modality].label}`,
          `🎯 **Formato:** ${format}`,
          `💰 **Valor:** ${money(value)}`,
          "",
          "━━━━━━━━━━━━━━━━━━━━",
          "",
          `👤 **Jogador 1:** <@${player1}>`,
          `👤 **Jogador 2:** <@${player2}>`,
          `🛡️ **Mediador:** <@${mediatorId}>`,
          "",
          "━━━━━━━━━━━━━━━━━━━━",
          "",
          "✅ Os dois jogadores precisam confirmar a aposta.",
          "💳 Depois disso será iniciado o pagamento."
        ].join("\n")
      )
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              `bet:confirm:${betId}`
            )
            .setLabel(
              "Confirmar aposta"
            )
            .setEmoji("✅")
            .setStyle(
              ButtonStyle.Success
            )
        )
    ]
  });

  /*
    Envia os dados por DM.
  */

  for (const userId of [
    player1,
    player2
  ]) {
    const user =
      await client.users
        .fetch(userId)
        .catch(() => null);

    if (!user) continue;

    await user.send({
      embeds: [
        makeEmbed(
          "💳 PAGAMENTO DA APOSTA",
          [
            `🎮 **${MODALITIES[modality].label} • ${format}**`,
            `💰 **Valor:** ${money(value)}`,
            "",
            `🔒 Canal da aposta: <#${channel.id}>`,
            "",
            "Entre no canal para confirmar e continuar o pagamento."
          ].join("\n")
        )
      ]
    }).catch(() => {});
  }

  return data.bets[betId];
}

/* =========================================================
   FINALIZAR APOSTA
========================================================= */

async function finishBet(
  betId,
  winnerId,
  isWO = false
) {
  const bet =
    data.bets[betId];

  if (
    !bet ||
    bet.status === "closed"
  ) {
    return false;
  }

  if (
    winnerId !== bet.player1 &&
    winnerId !== bet.player2
  ) {
    return false;
  }

  const loserId =
    winnerId === bet.player1
      ? bet.player2
      : bet.player1;

  const winnerStats =
    getStats(winnerId);

  const loserStats =
    getStats(loserId);

  if (isWO) {
    winnerStats.wo++;
  } else {
    winnerStats.wins++;
    winnerStats.coins++;
  }

  loserStats.losses++;

  bet.status = "closed";
  bet.winnerId = winnerId;
  bet.loserId = loserId;
  bet.wo = isWO;
  bet.finishedAt = Date.now();

  save();

  const channel =
    await client.channels
      .fetch(bet.channelId)
      .catch(() => null);

  if (!channel) {
    return true;
  }

  await channel.send({
    embeds: [
      makeEmbed(
        "🏆 APOSTA FINALIZADA",
        [
          `🏆 **Vencedor:** <@${winnerId}>`,
          `❌ **Derrotado:** <@${loserId}>`,
          "",
          isWO
            ? "⚠️ **Resultado por W.O.**"
            : "✅ **Resultado normal**",
          "",
          !isWO
            ? "🪙 O vencedor recebeu **+1 Coin**."
            : "⚠️ Vitória registrada como W.O.",
          "",
          "🔒 Este canal será encerrado em **10 segundos**."
        ].join("\n")
      )
    ]
  });

  setTimeout(async () => {
    const ch =
      await client.channels
        .fetch(bet.channelId)
        .catch(() => null);

    if (ch) {
      await ch.delete()
        .catch(() => {});
    }

    delete data.bets[betId];
    save();
  }, 10000);

  return true;
}

/* =========================================================
   ANALISTA
========================================================= */

async function createAnalystRequest(
  guild,
  requester
) {
  const roleId =
    data.config.analystRoleId;

  if (!roleId) {
    return null;
  }

  const role =
    guild.roles.cache.get(roleId);

  if (!role) {
    return null;
  }

  let category =
    data.config.privateCategoryId
      ? await guild.channels
          .fetch(
            data.config.privateCategoryId
          )
          .catch(() => null)
      : null;

  if (
    !category ||
    category.type !==
      ChannelType.GuildCategory
  ) {
    category =
      guild.channels.cache.find(
        c =>
          c.type ===
            ChannelType.GuildCategory &&
          c.name.toLowerCase() ===
            "apostas"
      );

    if (!category) {
      category =
        await guild.channels.create({
          name: "apostas",
          type: ChannelType.GuildCategory
        });
    }

    data.config.privateCategoryId =
      category.id;
  }

  const channel =
    await guild.channels.create({
      name:
        `ss-mob-${requester.id.slice(-4)}`,

      type: ChannelType.GuildText,

      parent: category.id,

      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [
            PermissionFlagsBits.ViewChannel
          ]
        },

        {
          id: requester.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },

        {
          id: role.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }
      ]
    });

  data.analystRequests[
    channel.id
  ] = {
    channelId: channel.id,
    requesterId: requester.id,
    analystId: null,
    type: "mob",
    createdAt: Date.now()
  };

  save();

  await channel.send({
    content:
      `<@${requester.id}> <@&${role.id}>`,

    embeds: [
      makeEmbed(
        "🔎 SOLICITAÇÃO DE SS MOB",
        [
          `👤 **Solicitante:** <@${requester.id}>`,
          "",
          `🔎 **Analistas:** <@&${role.id}>`,
          "",
          "━━━━━━━━━━━━━━━━━━━━",
          "",
          "Um Analista pode assumir esta solicitação.",
          "",
          "⚠️ O cargo Analista é usado exclusivamente para atender solicitações de análise."
        ].join("\n")
      )
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              `analyst:assume:${channel.id}`
            )
            .setLabel(
              "Assumir análise"
            )
            .setEmoji("🔎")
            .setStyle(
              ButtonStyle.Success
            )
        )
    ]
  });

  return channel;
}

/* =========================================================
   CONFIG
========================================================= */

function configEmbed() {
  return makeEmbed(
    "⚙️ CONFIGURAÇÃO DO BOT",
    [
      "Configure todas as funções do seu servidor por aqui.",
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      `🛡️ **Mediador:** ${
        data.config.mediatorRoleId
          ? `<@&${data.config.mediatorRoleId}>`
          : "❌ Não configurado"
      }`,
      "",
      `🔎 **Analista:** ${
        data.config.analystRoleId
          ? `<@&${data.config.analystRoleId}>`
          : "❌ Não configurado"
      }`,
      "",
      `📺 **Canal das filas:** ${
        data.config.queueChannelId
          ? `<#${data.config.queueChannelId}>`
          : "❌ Não configurado"
      }`,
      "",
      `🤖 **Foto do bot:** ${
        data.config.botAvatar
          ? "✅ Configurada"
          : "❌ Não configurada"
      }`,
      "",
      "━━━━━━━━━━━━━━━━━━━━"
    ].join("\n")
  );
}

function configRows() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "config:roles"
          )
          .setLabel("Cargos")
          .setEmoji("👥")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "config:channels"
          )
          .setLabel("Canais")
          .setEmoji("📺")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "config:pix"
          )
          .setLabel("PIX")
          .setEmoji("💳")
          .setStyle(
            ButtonStyle.Secondary
          )
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "config:visual"
          )
          .setLabel(
            "Visual / Foto do Bot"
          )
          .setEmoji("🎨")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "config:mediator"
          )
          .setLabel(
            "Fila de Mediadores"
          )
          .setEmoji("🛡️")
          .setStyle(
            ButtonStyle.Success
          )
      )
  ];
}

/* =========================================================
   MODAIS DE CONFIG
========================================================= */

function rolesModal() {
  return new ModalBuilder()
    .setCustomId(
      "config:rolesModal"
    )
    .setTitle(
      "👥 Configurar Cargos"
    )
    .addComponents(
      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "mediatorRoleId"
            )
            .setLabel(
              "ID do cargo Mediador"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(false)
            .setValue(
              data.config
                .mediatorRoleId || ""
            )
        ),

      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "analystRoleId"
            )
            .setLabel(
              "ID do cargo Analista"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(false)
            .setValue(
              data.config
                .analystRoleId || ""
            )
        )
    );
}

function channelsModal() {
  return new ModalBuilder()
    .setCustomId(
      "config:channelsModal"
    )
    .setTitle(
      "📺 Configurar Canais"
    )
    .addComponents(
      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "queueChannelId"
            )
            .setLabel(
              "ID do canal das filas"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(false)
            .setValue(
              data.config
                .queueChannelId || ""
            )
        ),

      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "mediatorPanelChannelId"
            )
            .setLabel(
              "ID do canal dos Mediadores"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(false)
            .setValue(
              data.config
                .mediatorPanelChannelId ||
              ""
            )
        ),

      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "privateCategoryId"
            )
            .setLabel(
              "ID da categoria privada"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(false)
            .setValue(
              data.config
                .privateCategoryId || ""
            )
        )
    );
}

function pixModal() {
  return new ModalBuilder()
    .setCustomId(
      "config:pixModal"
    )
    .setTitle(
      "💳 Configurar PIX"
    )
    .addComponents(
      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "pixName"
            )
            .setLabel(
              "Nome do PIX"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(false)
            .setValue(
              data.config.pixName ||
              ""
            )
        ),

      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "pixKey"
            )
            .setLabel(
              "Chave PIX"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(false)
            .setValue(
              data.config.pixKey ||
              ""
            )
        ),

      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "pixQr"
            )
            .setLabel(
              "URL do QR Code"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(false)
            .setValue(
              data.config.pixQr ||
              ""
            )
        )
    );
}

function visualModal() {
  return new ModalBuilder()
    .setCustomId(
      "config:visualModal"
    )
    .setTitle(
      "🎨 Visual do Bot"
    )
    .addComponents(
      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "color"
            )
            .setLabel(
              "Cor HEX dos embeds"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(false)
            .setValue(
              data.config.color ||
              "#5865F2"
            )
        ),

      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "avatar"
            )
            .setLabel(
              "URL da nova foto de perfil"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(false)
            .setValue(
              data.config.botAvatar ||
              ""
            )
        )
    );
}

/* =========================================================
   FILA /FILA
========================================================= */

function filaComponents() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(
            "fila:modality"
          )
          .setPlaceholder(
            "📱 Escolha a modalidade"
          )
          .addOptions(
            Object.entries(
              MODALITIES
            ).map(
              ([value, item]) => ({
                label: item.label,
                value,
                emoji: item.emoji
              })
            )
          )
      ),

    new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(
            "fila:format"
          )
          .setPlaceholder(
            "🎯 Escolha o formato"
          )
          .addOptions(
            FORMATS.map(
              format => ({
                label: format,
                value: format
              })
            )
          )
      ),

    new ActionRowBuilder()
      .addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(
            "fila:channel"
          )
          .setPlaceholder(
            "📺 Escolha o canal"
          )
          .addChannelTypes(
            ChannelType.GuildText
          )
      )
  ];
}

/* =========================================================
   COMANDOS
========================================================= */

const commands = [
  new SlashCommandBuilder()
    .setName("config")
    .setDescription(
      "Abre a configuração do bot"
    ),

  new SlashCommandBuilder()
    .setName("fila")
    .setDescription(
      "Cria automaticamente todas as filas"
    ),

  new SlashCommandBuilder()
    .setName("med")
    .setDescription(
      "Abre a fila de Mediadores"
    ),

  new SlashCommandBuilder()
    .setName("p")
    .setDescription(
      "Mostra suas estatísticas"
    ),

  new SlashCommandBuilder()
    .setName("ss")
    .setDescription(
      "Solicita um Analista"
    )
    .addStringOption(
      option =>
        option
          .setName("tipo")
          .setDescription(
            "Tipo de análise"
          )
          .setRequired(true)
          .addChoices({
            name: "SS Mob",
            value: "mob"
          })
    )
].map(
  command =>
    command.toJSON()
);

/* =========================================================
   CLIENT
========================================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Channel
  ]
});

/* =========================================================
   REGISTRAR COMANDOS
========================================================= */

async function registerCommands() {
  const rest =
    new REST({
      version: "10"
    }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      CLIENT_ID,
      GUILD_ID
    ),
    {
      body: commands
    }
  );

  console.log(
    "✅ Comandos registrados."
  );
}

/* =========================================================
   ONLINE
========================================================= */

client.once(
  Events.ClientReady,
  async () => {
    console.log(
      `✅ BOT ONLINE: ${client.user.tag}`
    );

    try {
      const guild =
        await client.guilds.fetch(
          GUILD_ID
        );

      await guild.channels.fetch();
      await guild.roles.fetch();

      /*
        Se houver foto configurada,
        tenta atualizar automaticamente.
      */

      if (data.config.botAvatar) {
        try {
          await client.user.setAvatar(
            data.config.botAvatar
          );

          console.log(
            "✅ Foto do bot atualizada."
          );
        } catch (error) {
          console.error(
            "⚠️ Não foi possível atualizar a foto:",
            error.message
          );
        }
      }

      await registerCommands();

      await publishMediatorPanel(
        guild
      );

      console.log(
        "✅ Inicialização concluída."
      );
    } catch (error) {
      console.error(
        "❌ Erro ao iniciar:",
        error
      );
    }
  }
);

/* =========================================================
   MENSAGENS
========================================================= */

client.on(
  Events.MessageCreate,
  async message => {
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

    if (content === ".p") {
      const stats =
        getStats(
          message.author.id
        );

      return message.reply({
        embeds: [
          makeEmbed(
            `📊 PERFIL • ${message.author.username}`,
            [
              `🏆 **Vitórias:** ${stats.wins}`,
              `❌ **Derrotas:** ${stats.losses}`,
              `⚠️ **W.O.:** ${stats.wo}`,
              `🪙 **Coins:** ${stats.coins}`
            ].join("\n")
          )
        ]
      });
    }

    if (content === ".med") {
      return message.reply({
        embeds: [
          mediatorEmbed()
        ],
        components: [
          mediatorButtons()
        ]
      });
    }

    if (content === ".ss mob") {
      const channel =
        await createAnalystRequest(
          message.guild,
          message.author
        );

      if (!channel) {
        return message.reply(
          "❌ Configure primeiro o cargo de Analista usando `/config`."
        );
      }

      return message.reply(
        `✅ Solicitação de SS Mob criada em ${channel}.`
      );
    }
  }
);

/* =========================================================
   INTERAÇÕES
========================================================= */

client.on(
  Events.InteractionCreate,
  async interaction => {
    try {
      /* =========================================
         SLASH COMMANDS
      ========================================= */

      if (
        interaction.isChatInputCommand()
      ) {
        if (
          interaction.commandName ===
          "config"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores podem usar este comando.",
              ephemeral: true
            });
          }

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
          "fila"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores podem criar filas.",
              ephemeral: true
            });
          }

          return interaction.reply({
            content: [
              "🎮 **CRIAR FILAS**",
              "",
              "Você só precisa escolher:",
              "1️⃣ Modalidade",
              "2️⃣ Formato",
              "3️⃣ Canal",
              "",
              "💰 **Os valores são automáticos.**",
              "",
              "⬆️ R$ 100,00",
              "⬆️ R$ 50,00",
              "⬆️ R$ 40,00",
              "⬆️ R$ 20,00",
              "⬆️ R$ 10,00",
              "⬆️ R$ 7,00",
              "⬆️ R$ 5,00",
              "⬆️ R$ 3,00",
              "⬆️ R$ 2,00",
              "⬆️ R$ 1,00",
              "⬇️ R$ 0,50",
              "⬇️ R$ 0,30",
              "",
              "👥 Cada fila possui exatamente **2 jogadores**."
            ].join("\n"),
            components:
              filaComponents(),
            ephemeral: true
          });
        }

        if (
          interaction.commandName ===
          "med"
        ) {
          return interaction.reply({
            embeds: [
              mediatorEmbed()
            ],
            components: [
              mediatorButtons()
            ]
          });
        }

        if (
          interaction.commandName ===
          "p"
        ) {
          const stats =
            getStats(
              interaction.user.id
            );

          return interaction.reply({
            embeds: [
              makeEmbed(
                "📊 SUAS ESTATÍSTICAS",
                [
                  `🏆 **Vitórias:** ${stats.wins}`,
                  `❌ **Derrotas:** ${stats.losses}`,
                  `⚠️ **W.O.:** ${stats.wo}`,
                  `🪙 **Coins:** ${stats.coins}`
                ].join("\n")
              )
            ],
            ephemeral: true
          });
        }

        if (
          interaction.commandName ===
          "ss"
        ) {
          const type =
            interaction.options.getString(
              "tipo"
            );

          if (type !== "mob") {
            return interaction.reply({
              content:
                "❌ Tipo de análise inválido.",
              ephemeral: true
            });
          }

          const channel =
            await createAnalystRequest(
              interaction.guild,
              interaction.user
            );

          if (!channel) {
            return interaction.reply({
              content:
                "❌ Configure primeiro o cargo de Analista usando `/config`.",
              ephemeral: true
            });
          }

          return interaction.reply({
            content:
              `✅ Solicitação criada: ${channel}`,
            ephemeral: true
          });
        }
      }

      /* =========================================
         SELECT DE /FILA
      ========================================= */

      if (
        interaction.isStringSelectMenu()
      ) {
        if (
          interaction.customId ===
          "fila:modality"
        ) {
          const selected =
            interaction.values[0];

          await interaction.update({
            content: [
              "🎮 **CRIAR FILAS**",
              "",
              `📱 Modalidade escolhida: **${MODALITIES[selected].label}**`,
              "",
              "Agora escolha o formato e o canal.",
              "",
              "💰 Os valores continuam automáticos."
            ].join("\n"),
            components:
              filaComponents()
          });

          interaction.client.filaSelection =
            interaction.client.filaSelection ||
            new Map();

          const old =
            interaction.client
              .filaSelection
              .get(
                interaction.user.id
              ) || {};

          old.modality =
            selected;

          interaction.client
            .filaSelection
            .set(
              interaction.user.id,
              old
            );

          return;
        }

        if (
          interaction.customId ===
          "fila:format"
        ) {
          const selected =
            interaction.values[0];

          await interaction.update({
            content: [
              "🎮 **CRIAR FILAS**",
              "",
              `🎯 Formato escolhido: **${selected}**`,
              "",
              "Escolha a modalidade e o canal.",
              "",
              "💰 Os valores continuam automáticos."
            ].join("\n"),
            components:
              filaComponents()
          });

          interaction.client.filaSelection =
            interaction.client.filaSelection ||
            new Map();

          const old =
            interaction.client
              .filaSelection
              .get(
                interaction.user.id
              ) || {};

          old.format =
            selected;

          interaction.client
            .filaSelection
            .set(
              interaction.user.id,
              old
            );

          return;
        }
      }

      /* =========================================
         CHANNEL SELECT DO /FILA
      ========================================= */

      if (
        interaction.isChannelSelectMenu()
      ) {
        if (
          interaction.customId ===
          "fila:channel"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores.",
              ephemeral: true
            });
          }

          const channelId =
            interaction.values[0];

          const selections =
            interaction.client
              .filaSelection;

          const selected =
            selections?.get(
              interaction.user.id
            );

          if (
            !selected?.modality ||
            !selected?.format
          ) {
            return interaction.reply({
              content:
                "❌ Escolha primeiro a modalidade e o formato.",
              ephemeral: true
            });
          }

          /*
            Confirma imediatamente a interação
            para evitar o erro:
            'Bot não respondeu a tempo'.
          */

          await interaction.deferUpdate();

          try {
            await publishAllQueues(
              interaction.guild,
              selected.modality,
              selected.format,
              channelId
            );

            selections.delete(
              interaction.user.id
            );

            return interaction.editReply({
              content: [
                "╔════════════════════╗",
                "     ✅ **FILAS CRIADAS**",
                "╚════════════════════╝",
                "",
                `📱 **Modalidade:** ${MODALITIES[selected.modality].label}`,
                `🎯 **Formato:** ${selected.format}`,
                `📺 **Canal:** <#${channelId}>`,
                "",
                "💰 **12 valores foram criados automaticamente:**",
                "",
                "R$ 100,00",
                "R$ 50,00",
                "R$ 40,00",
                "R$ 20,00",
                "R$ 10,00",
                "R$ 7,00",
                "R$ 5,00",
                "R$ 3,00",
                "R$ 2,00",
                "R$ 1,00",
                "R$ 0,50",
                "R$ 0,30",
                "",
                "⬆️ Maior valor em cima.",
                "⬇️ Menor valor embaixo.",
                "",
                "👥 Cada fila possui exatamente **2 jogadores**."
              ].join("\n"),
              components: []
            });
          } catch (error) {
            console.error(
              "Erro ao criar filas:",
              error
            );

            return interaction.editReply({
              content:
                "❌ Não consegui criar as filas. Verifique as permissões do bot no canal.",
              components: []
            });
          }
        }
      }

      /* =========================================
         BUTTONS DE CONFIG
      ========================================= */

      if (
        interaction.isButton()
      ) {
        if (
          interaction.customId.startsWith(
            "config:"
          )
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores.",
              ephemeral: true
            });
          }
        }

        if (
          interaction.customId ===
          "config:roles"
        ) {
          return interaction.showModal(
            rolesModal()
          );
        }

        if (
          interaction.customId ===
          "config:channels"
        ) {
          return interaction.showModal(
            channelsModal()
          );
        }

        if (
          interaction.customId ===
          "config:pix"
        ) {
          return interaction.showModal(
            pixModal()
          );
        }

        if (
          interaction.customId ===
          "config:visual"
        ) {
          return interaction.showModal(
            visualModal()
          );
        }

        if (
          interaction.customId ===
          "config:mediator"
        ) {
          return interaction.reply({
            embeds: [
              mediatorEmbed()
            ],
            components: [
              mediatorButtons()
            ],
            ephemeral: true
          });
        }

        /* =====================================
           FILA DE MEDIADORES
        ===================================== */

        if (
          interaction.customId ===
            "mediator:join" ||
          interaction.customId ===
            "mediator:leave"
        ) {
          if (
            !isMediator(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Você não possui o cargo Mediador configurado.",
              ephemeral: true
            });
          }

          await interaction.deferUpdate();

          if (
            interaction.customId ===
            "mediator:join"
          ) {
            if (
              !data.mediators.includes(
                interaction.user.id
              )
            ) {
              data.mediators.push(
                interaction.user.id
              );
            }
          } else {
            data.mediators =
              data.mediators.filter(
                id =>
                  id !==
                  interaction.user.id
              );
          }

          save();

          await publishMediatorPanel(
            interaction.guild
          );

          return interaction.editReply({
            embeds: [
              mediatorEmbed()
            ],
            components: [
              mediatorButtons()
            ]
          });
        }

        /* =====================================
           ENTRAR / SAIR DA FILA
        ===================================== */

        if (
          interaction.customId.startsWith(
            "queue:"
          )
        ) {
          const parts =
            interaction.customId.split(
              ":"
            );

          const action =
            parts[1];

          const id =
            parts.slice(2).join(":");

          const [
            modality,
            format,
            valueText
          ] = id.split("|");

          const value =
            Number(valueText);

          const queue =
            getQueue(
              modality,
              format,
              value
            );

          if (
            action === "join"
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

            if (
              queue.length >= 2
            ) {
              return interaction.reply({
                content:
                  "❌ Esta fila já está completa.",
                ephemeral: true
              });
            }

            if (
              !getAvailableMediator(
                interaction.guild
              )
            ) {
              return interaction.reply({
                content:
                  "🔴 Não há Mediador disponível no momento.",
                ephemeral: true
              });
            }

            queue.push(
              interaction.user.id
            );

            save();

            await interaction.update({
              embeds: [
                queueEmbed(
                  modality,
                  format,
                  value
                )
              ],
              components: [
                queueButtons(
                  modality,
                  format,
                  value
                )
              ]
            });

            if (
              queue.length === 2
            ) {
              const players = [
                ...queue
              ];

              data.queues[
                queueKey(
                  modality,
                  format,
                  value
                )
              ] = [];

              save();

              const bet =
                await createBet(
                  interaction.guild,
                  modality,
                  format,
                  value,
                  players[0],
                  players[1]
                );

              if (!bet) {
                data.queues[
                  queueKey(
                    modality,
                    format,
                    value
                  )
                ] = players;

                save();

                await interaction.followUp({
                  content:
                    "❌ Não foi possível iniciar a aposta porque não há Mediador disponível.",
                  ephemeral: true
                });
              }
            }

            return;
          }

          if (
            action === "leave"
          ) {
            const index =
              queue.indexOf(
                interaction.user.id
              );

            if (index === -1) {
              return interaction.reply({
                content:
                  "⚠️ Você não está nesta fila.",
                ephemeral: true
              });
            }

            queue.splice(
              index,
              1
            );

            save();

            return interaction.update({
              embeds: [
                queueEmbed(
                  modality,
                  format,
                  value
                )
              ],
              components: [
                queueButtons(
                  modality,
                  format,
                  value
                )
              ]
            });
          }
        }

        /* =====================================
           CONFIRMAR APOSTA
        ===================================== */

        if (
          interaction.customId.startsWith(
            "bet:confirm:"
          )
        ) {
          const betId =
            interaction.customId.split(
              ":"
            )[2];

          const bet =
            data.bets[betId];

          if (
            !bet ||
            (
              interaction.user.id !==
                bet.player1 &&
              interaction.user.id !==
                bet.player2
            )
          ) {
            return interaction.reply({
              content:
                "❌ Você não participa desta aposta.",
              ephemeral: true
            });
          }

          if (
            bet.status ===
            "closed"
          ) {
            return interaction.reply({
              content:
                "❌ Esta aposta já foi encerrada.",
              ephemeral: true
            });
          }

          bet.confirmations[
            interaction.user.id
          ] = true;

          const confirmed =
            Object.values(
              bet.confirmations
            ).filter(Boolean)
              .length;

          if (
            confirmed < 2
          ) {
            save();

            return interaction.reply({
              content:
                `✅ Confirmação registrada: **${confirmed}/2**.\n⏳ Aguardando o outro jogador.`,
              ephemeral: true
            });
          }

          bet.status =
            "payment";

          save();

          return interaction.update({
            embeds: [
              makeEmbed(
                `💳 PAGAMENTO • APOSTA #${betId}`,
                [
                  "✅ Os dois jogadores confirmaram.",
                  "",
                  `💰 **Valor:** ${money(bet.value)}`,
                  "",
                  `👤 **PIX:** ${data.config.pixName || "Não configurado"}`,
                  `🔑 **Chave:** ${data.config.pixKey || "Não configurada"}`,
                  "",
                  "📸 Envie o comprovante no atendimento para o Mediador.",
                  "",
                  "━━━━━━━━━━━━━━━━━━━━",
                  "",
                  "🛡️ Aguarde a confirmação do Mediador."
                ].join("\n")
              )
            ],
            components: []
          });
        }

        /* =====================================
           ASSUMIR ANÁLISE
        ===================================== */

        if (
          interaction.customId.startsWith(
            "analyst:assume:"
          )
        ) {
          const channelId =
            interaction.customId.split(
              ":"
            )[2];

          const request =
            data.analystRequests[
              channelId
            ];

          if (!request) {
            return interaction.reply({
              content:
                "❌ Solicitação não encontrada.",
              ephemeral: true
            });
          }

          if (
            !isAnalyst(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Você não possui o cargo Analista configurado.",
              ephemeral: true
            });
          }

          if (
            request.analystId
          ) {
            return interaction.reply({
              content:
                "⚠️ Esta análise já foi assumida.",
              ephemeral: true
            });
          }

          await interaction.deferUpdate();

          request.analystId =
            interaction.user.id;

          save();

          const channel =
            await interaction.guild.channels
              .fetch(channelId)
              .catch(() => null);

          if (channel) {
            await channel.permissionOverwrites
              .edit(
                interaction.user.id,
                {
                  ViewChannel: true,
                  SendMessages: true,
                  ReadMessageHistory: true
                }
              )
              .catch(() => {});

            await channel.send(
              `🔎 <@${interaction.user.id}> assumiu esta análise.`
            );
          }

          return interaction.editReply({
            content:
              `✅ Análise assumida por <@${interaction.user.id}>.`,
            embeds: [],
            components: []
          });
        }

        /* =====================================
           MENU DO MEDIADOR
        ===================================== */

        if (
          interaction.customId.startsWith(
            "med:"
          )
        ) {
          const parts =
            interaction.customId.split(
              ":"
            );

          const action =
            parts[1];

          const betId =
            parts[2];

          const bet =
            data.bets[betId];

          if (
            !bet ||
            interaction.user.id !==
              bet.mediatorId
          ) {
            return interaction.reply({
              content:
                "❌ Somente o Mediador responsável pode fazer isso.",
              ephemeral: true
            });
          }

          if (
            action === "finish"
          ) {
            bet.status =
              "closed";

            save();

            await interaction.reply({
              content:
                "✅ Aposta finalizada. O canal será apagado em 10 segundos."
            });

            setTimeout(
              async () => {
                const ch =
                  await interaction.guild.channels
                    .fetch(
                      bet.channelId
                    )
                    .catch(() => null);

                if (ch) {
                  await ch.delete()
                    .catch(
                      () => {}
                    );
                }

                delete data.bets[
                  betId
                ];

                save();
              },
              10000
            );

            return;
          }

          return interaction.reply({
            content:
              action === "wo"
                ? "⚠️ Escolha o vencedor por W.O."
                : "🏆 Escolha o vencedor.",
            ephemeral: true,
            components: [
              new ActionRowBuilder()
                .addComponents(
                  new StringSelectMenuBuilder()
                    .setCustomId(
                      `result:${action}:${betId}`
                    )
                    .setPlaceholder(
                      "🏆 Escolha o jogador"
                    )
                    .addOptions([
                      {
                        label:
                          "Jogador 1",
                        value:
                          bet.player1
                      },
                      {
                        label:
                          "Jogador 2",
                        value:
                          bet.player2
                      }
                    ])
                )
            ]
          });
        }
      }

      /* =========================================
         RESULTADO DO MEDIADOR
      ========================================= */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId.startsWith(
          "result:"
        )
      ) {
        const parts =
          interaction.customId.split(
            ":"
          );

        const action =
          parts[1];

        const betId =
          parts[2];

        const bet =
          data.bets[betId];

        if (
          !bet ||
          interaction.user.id !==
            bet.mediatorId
        ) {
          return interaction.reply({
            content:
              "❌ Você não é o Mediador responsável.",
            ephemeral: true
          });
        }

        const winnerId =
          interaction.values[0];

        await interaction.deferUpdate();

        await finishBet(
          betId,
          winnerId,
          action === "wo"
        );

        return interaction.editReply({
          content:
            "✅ Resultado registrado.",
          components: []
        });
      }

      /* =========================================
         MODAIS
      ========================================= */

      if (
        interaction.isModalSubmit()
      ) {
        if (
          interaction.customId ===
          "config:rolesModal"
        ) {
          data.config.mediatorRoleId =
            interaction.fields
              .getTextInputValue(
                "mediatorRoleId"
              )
              .trim();

          data.config.analystRoleId =
            interaction.fields
              .getTextInputValue(
                "analystRoleId"
              )
              .trim();

          save();

          return interaction.reply({
            content:
              "✅ Cargos configurados com sucesso.",
            ephemeral: true
          });
        }

        if (
          interaction.customId ===
          "config:channelsModal"
        ) {
          data.config.queueChannelId =
            interaction.fields
              .getTextInputValue(
                "queueChannelId"
              )
              .trim();

          data.config.mediatorPanelChannelId =
            interaction.fields
              .getTextInputValue(
                "mediatorPanelChannelId"
              )
              .trim();

          data.config.privateCategoryId =
            interaction.fields
              .getTextInputValue(
                "privateCategoryId"
              )
              .trim();

          save();

          if (
            data.config
              .mediatorPanelChannelId
          ) {
            await publishMediatorPanel(
              interaction.guild
            );
          }

          return interaction.reply({
            content:
              "✅ Canais configurados com sucesso.",
            ephemeral: true
          });
        }

        if (
          interaction.customId ===
          "config:pixModal"
        ) {
          data.config.pixName =
            interaction.fields
              .getTextInputValue(
                "pixName"
              )
              .trim();

          data.config.pixKey =
            interaction.fields
              .getTextInputValue(
                "pixKey"
              )
              .trim();

          data.config.pixQr =
            interaction.fields
              .getTextInputValue(
                "pixQr"
              )
              .trim();

          save();

          return interaction.reply({
            content:
              "✅ Dados do PIX atualizados.",
            ephemeral: true
          });
        }

        if (
          interaction.customId ===
          "config:visualModal"
        ) {
          const newColor =
            interaction.fields
              .getTextInputValue(
                "color"
              )
              .trim();

          const avatar =
            interaction.fields
              .getTextInputValue(
                "avatar"
              )
              .trim();

          data.config.color =
            validColor(
              newColor
            );

          if (avatar) {
            data.config.botAvatar =
              avatar;
          }

          save();

          /*
            Atualiza a foto do usuário do bot.
          */

          if (avatar) {
            try {
              await client.user.setAvatar(
                avatar
              );
            } catch (error) {
              console.error(
                "Erro ao mudar foto do bot:",
                error.message
              );

              return interaction.reply({
                content:
                  "⚠️ A cor foi alterada, mas não consegui alterar a foto. Verifique se a URL da imagem é pública e válida.",
                ephemeral: true
              });
            }
          }

          return interaction.reply({
            content:
              "✅ Visual atualizado e foto do bot alterada.",
            ephemeral: true
          });
        }
      }
    } catch (error) {
      console.error(
        "❌ ERRO NA INTERAÇÃO:",
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction.reply({
          content:
            "❌ Ocorreu um erro interno. Verifique o console do Railway.",
          ephemeral: true
        }).catch(
          () => {}
        );
      }
    }
  }
);

/* =========================================================
   LIMPEZA DE MEDIADORES
========================================================= */

client.on(
  Events.GuildMemberRemove,
  member => {
    if (
      data.mediators.includes(
        member.id
      )
    ) {
      data.mediators =
        data.mediators.filter(
          id =>
            id !== member.id
        );

      save();
    }
  }
);

/* =========================================================
   LOGIN
========================================================= */

client.login(TOKEN);
