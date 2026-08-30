require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  RoleSelectMenuBuilder,
  UserSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_TOKEN;
const DATA_FILE = path.join(__dirname, "data.json");

if (!TOKEN) {
  console.error("ERRO: coloque DISCORD_TOKEN no arquivo .env");
  process.exit(1);
}

/* =========================================================
   VALORES DAS FILAS
   Ordem interna: maior -> menor.
   Na publicação: menor -> maior.
========================================================= */

const VALUES = [
  { cents: 10000, label: "R$ 100,00" },
  { cents: 5000, label: "R$ 50,00" },
  { cents: 2000, label: "R$ 20,00" },
  { cents: 1000, label: "R$ 10,00" },
  { cents: 700, label: "R$ 7,00" },
  { cents: 500, label: "R$ 5,00" },
  { cents: 300, label: "R$ 3,00" },
  { cents: 200, label: "R$ 2,00" },
  { cents: 100, label: "R$ 1,00" },
  { cents: 75, label: "R$ 0,75" },
  { cents: 50, label: "R$ 0,50" },
  { cents: 30, label: "R$ 0,30" }
];

/* =========================================================
   MODALIDADES
========================================================= */

const MODES = {
  mobile: {
    label: "Mobile",
    emoji: "📱"
  },
  emu: {
    label: "Emulador",
    emoji: "💻"
  },
  misto: {
    label: "Misto",
    emoji: "📱💻"
  }
};

/* =========================================================
   FORMATOS
========================================================= */

const FORMATS = [
  "1x1",
  "2x2",
  "3x3",
  "4x4"
];

/* =========================================================
   BANCO
========================================================= */

function defaultData() {
  return {
    guilds: {},
    users: {},
    matches: {},
    analysis: {},
    counters: {}
  };
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const data = defaultData();

      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(data, null, 2)
      );

      return data;
    }

    const raw = fs.readFileSync(
      DATA_FILE,
      "utf8"
    );

    const parsed = JSON.parse(raw);

    return {
      ...defaultData(),
      ...parsed,
      guilds: parsed.guilds || {},
      users: parsed.users || {},
      matches: parsed.matches || {},
      analysis: parsed.analysis || {},
      counters: parsed.counters || {}
    };
  } catch (error) {
    console.error(
      "Falha ao carregar data.json:",
      error
    );

    return defaultData();
  }
}

let db = loadData();

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (error) {
    console.error(
      "Erro ao salvar data.json:",
      error
    );
  }
}

/* =========================================================
   CONFIGURAÇÃO DA GUILD
========================================================= */

function guildData(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      mediatorRoleId: null,
      analystRoleId: null,

      analystChannel1Id: null,
      analystChannel2Id: null,

      embedColor: "#5865F2",
      botAvatar: null,

      pix: {},

      queueChannels: {}
    };
  }

  const g = db.guilds[guildId];

  if (!g.pix) {
    g.pix = {};
  }

  if (!g.queueChannels) {
    g.queueChannels = {};
  }

  if (!g.embedColor) {
    g.embedColor = "#5865F2";
  }

  return g;
}

/* =========================================================
   USUÁRIOS / ESTATÍSTICAS
========================================================= */

function userData(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      wins: 0,
      losses: 0,
      woWins: 0,
      coins: 0,
      normalMatches: 0
    };
  }

  return db.users[userId];
}

/* =========================================================
   UTILITÁRIOS
========================================================= */

function safeColor(value) {
  if (typeof value !== "string") {
    return "#5865F2";
  }

  const color = value.trim();

  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return color;
  }

  return "#5865F2";
}

function money(cents) {
  return `R$ ${(cents / 100)
    .toFixed(2)
    .replace(".", ",")}`;
}

function slug(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function mentionUser(id) {
  return `<@${id}>`;
}

function hasRole(member, roleId) {
  return Boolean(
    roleId &&
    member?.roles?.cache?.has(roleId)
  );
}

function isOwner(interaction) {
  return Boolean(
    interaction.guild &&
    interaction.guild.ownerId === interaction.user.id
  );
}

function isMediator(interaction) {
  const g = guildData(interaction.guildId);

  return hasRole(
    interaction.member,
    g.mediatorRoleId
  );
}

function isAnalyst(interaction) {
  const g = guildData(interaction.guildId);

  return hasRole(
    interaction.member,
    g.analystRoleId
  );
}

function queueKey(mode, format, cents) {
  return `${mode}|${format}|${cents}`;
}

function queueCustomId(
  action,
  mode,
  format,
  cents
) {
  return `queue:${action}:${mode}:${format}:${cents}`;
}

function matchCustomId(
  action,
  matchId
) {
  return `match:${action}:${matchId}`;
}

function analysisCustomId(
  action,
  requestId
) {
  return `analysis:${action}:${requestId}`;
}

function getMediatorIds(guild) {
  const g = guildData(guild.id);

  if (!g.mediatorRoleId) {
    return [];
  }

  const role =
    guild.roles.cache.get(
      g.mediatorRoleId
    );

  if (!role) {
    return [];
  }

  return role.members.map(
    member => member.id
  );
}

/* =========================================================
   DISTRIBUIÇÃO DINÂMICA EM LOOP
========================================================= */

function nextMediator(guild) {
  const ids = getMediatorIds(guild);

  if (!ids.length) {
    return null;
  }

  const key =
    `mediatorIndex:${guild.id}`;

  const current =
    Number(db.counters[key] || 0);

  const index =
    current % ids.length;

  db.counters[key] =
    (current + 1) % ids.length;

  saveData();

  return ids[index];
}

/* =========================================================
   FILA
========================================================= */

function queueEmbed(
  guild,
  mode,
  format,
  cents,
  players = []
) {
  const g = guildData(guild.id);
  const m = MODES[mode];

  const playerText =
    players.length
      ? players
          .map(
            (id, index) =>
              `${index + 1}. ${mentionUser(id)}`
          )
          .join("\n")
      : "🟢 Aguardando jogadores...";

  return new EmbedBuilder()
    .setColor(
      safeColor(g.embedColor)
    )
    .setTitle(
      `💎 ${money(cents)} • ${format}`
    )
    .setDescription(
      `${m.emoji} **${m.label}**\n\n` +
      `🎯 **Formato:** ${format}\n` +
      `💰 **Entrada:** ${money(cents)}\n\n` +
      `👥 **JOGADORES**\n` +
      `${playerText}\n\n` +
      `📊 **Vagas:** ${players.length}/2\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `⚡ **ENTRE NA FILA E AGUARDE O ADVERSÁRIO**\n` +
      `━━━━━━━━━━━━━━━━━━`
    )
    .setFooter({
      text: "🎮 Sistema de Apostas"
    });
}

/* =========================================================
   BOTÕES DA FILA
   1x1 = 3 botões
   Demais = 2 botões
========================================================= */

function queueButtons(
  mode,
  format,
  cents
) {
  if (format === "1x1") {
    return new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            queueCustomId(
              "join-infinite",
              mode,
              format,
              cents
            )
          )
          .setLabel("Gelo infinito")
          .setEmoji("♾️")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            queueCustomId(
              "join-normal",
              mode,
              format,
              cents
            )
          )
          .setLabel("Gelo normal")
          .setEmoji("🧊")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            queueCustomId(
              "leave",
              mode,
              format,
              cents
            )
          )
          .setLabel("Sair da fila")
          .setEmoji("🚪")
          .setStyle(
            ButtonStyle.Danger
          )
      );
  }

  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          queueCustomId(
            "join",
            mode,
            format,
            cents
          )
        )
        .setLabel("Entrar na fila")
        .setEmoji("🎮")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          queueCustomId(
            "leave",
            mode,
            format,
            cents
          )
        )
        .setLabel("Sair da fila")
        .setEmoji("🚪")
        .setStyle(
          ButtonStyle.Danger
        )
    );
}

function queuePayload(
  guild,
  mode,
  format,
  cents,
  players
) {
  return {
    embeds: [
      queueEmbed(
        guild,
        mode,
        format,
        cents,
        players
      )
    ],
    components: [
      queueButtons(
        mode,
        format,
        cents
      )
    ]
  };
}

/* =========================================================
   DESABILITAR BOTÕES
========================================================= */

async function disableMessageButtons(
  message
) {
  if (!message) {
    return;
  }

  try {
    const rows =
      message.components.map(
        row => {
          const newRow =
            new ActionRowBuilder();

          for (
            const component
            of row.components
          ) {
            if (
              component.data?.type === 2 ||
              component.type === 2
            ) {
              newRow.addComponents(
                ButtonBuilder
                  .from(component)
                  .setDisabled(true)
              );
            }
          }

          return newRow;
        }
      );

    await message.edit({
      components: rows
    });
  } catch (_) {}
}

/* =========================================================
   PARTIDA
========================================================= */

function findMatchByChannel(
  channelId
) {
  return Object.values(
    db.matches
  ).find(
    match =>
      match.channelId === channelId &&
      !match.finalized
  );
}

function findActiveMatchForUser(
  userId
) {
  return Object.values(
    db.matches
  ).find(
    match =>
      !match.finalized &&
      match.players.includes(userId)
  );
}

function findMatchById(
  matchId
) {
  return db.matches[matchId] || null;
}

function makeMatchId(
  guildId
) {
  const key =
    `matchNumber:${guildId}`;

  db.counters[key] =
    Number(db.counters[key] || 0) + 1;

  saveData();

  return String(
    db.counters[key]
  );
}

/* =========================================================
   EMBED DE CONFIRMAÇÃO
========================================================= */

function matchConfirmEmbed(
  guild,
  match
) {
  const g =
    guildData(guild.id);

  return new EmbedBuilder()
    .setColor(
      safeColor(g.embedColor)
    )
    .setTitle(
      "🎮 Partida iniciada"
    )
    .setDescription(
      `**Partida:** ${match.id}\n` +
      `**Modo:** ${MODES[match.mode].emoji} ${MODES[match.mode].label}\n` +
      `**Formato:** ${match.format}\n` +
      `**Valor:** ${money(match.cents)} por jogador\n\n` +
      `👤 **Jogador 1:** ${mentionUser(match.players[0])}\n` +
      `👤 **Jogador 2:** ${mentionUser(match.players[1])}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🤝 Os dois jogadores devem confirmar a aposta.\n\n` +
      `💳 Após as duas confirmações, serão exibidos ` +
      `o nome do ADM, a chave Pix e o QR Code para pagamento.`
    )
    .setFooter({
      text: "🎮 Sistema de Apostas"
    });
}

function confirmButtons(match) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          matchCustomId(
            "confirm",
            match.id
          )
        )
        .setLabel("Confirmar")
        .setEmoji("✅")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          matchCustomId(
            "cancel",
            match.id
          )
        )
        .setLabel("Cancelar")
        .setEmoji("❌")
        .setStyle(
          ButtonStyle.Danger
        )
    );
}

/* =========================================================
   PIX
========================================================= */

function pixEmbed(
  guild,
  match
) {
  const g =
    guildData(guild.id);

  const pix =
    g.pix[match.mediatorId];

  const embed =
    new EmbedBuilder()
      .setColor(
        safeColor(g.embedColor)
      )
      .setTitle(
        "💳 PAGAMENTO PARA INICIAR"
      )
      .setDescription(
        `Os dois jogadores confirmaram a aposta.\n\n` +
        `👤 **ADM responsável:** ${pix?.name || mentionUser(match.mediatorId)}\n` +
        `💰 **Valor por jogador:** ${money(match.cents)}\n` +
        `💵 **Total da aposta:** ${money(match.cents * 2)}\n\n` +
        `🔑 **Chave Pix:**\n` +
        `\`${pix?.key || "Não cadastrada"}\`\n\n` +
        `📌 Efetue o pagamento e aguarde o Mediador/ADM iniciar a sala.`
      )
      .setFooter({
        text: "🎮 Sistema de Apostas"
      });

  if (
    pix?.qrUrl &&
    /^https?:\/\//i.test(pix.qrUrl)
  ) {
    embed.setImage(pix.qrUrl);
  }

  return embed;
}

async function sendPix(
  guild,
  channel,
  match
) {
  const g =
    guildData(guild.id);

  const pix =
    g.pix[match.mediatorId];

  if (!pix) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#ED4245")
          .setTitle(
            "⚠️ Pix do ADM não cadastrado"
          )
          .setDescription(
            `O ADM responsável ainda não possui os dados Pix cadastrados.\n\n` +
            `O dono do servidor deve configurar em **/config → Pix ADM**.`
          )
      ]
    });

    return false;
  }

  await channel.send({
    embeds: [
      pixEmbed(
        guild,
        match
      )
    ]
  });

  return true;
}

/* =========================================================
   MENU DO MEDIADOR
========================================================= */

function mediatorMenu(match) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          matchCustomId(
            "winner-menu",
            match.id
          )
        )
        .setLabel(
          "Escolher vencedor"
        )
        .setEmoji("🏆")
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          matchCustomId(
            "wo-menu",
            match.id
          )
        )
        .setLabel(
          "Vitória por W.O."
        )
        .setEmoji("⚡")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          matchCustomId(
            "finalize",
            match.id
          )
        )
        .setLabel(
          "Finalizar aposta"
        )
        .setEmoji("🔒")
        .setStyle(
          ButtonStyle.Danger
        )
    );
}

function winnerSelect(
  match,
  action
) {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          matchCustomId(
            action,
            match.id
          )
        )
        .setPlaceholder(
          "Selecione o jogador"
        )
        .addOptions(
          match.players.map(
            (id, index) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(
                  `Jogador ${index + 1}`
                )
                .setDescription(
                  `Selecionar ${id}`
                )
                .setValue(id)
          )
        )
    );
}

/* =========================================================
   ANÁLISES
========================================================= */

function analystEmbed(
  guild,
  request
) {
  const g =
    guildData(guild.id);

  return new EmbedBuilder()
    .setColor(
      safeColor(g.embedColor)
    )
    .setTitle(
      "📊 Uma análise foi solicitada"
    )
    .setDescription(
      `👤 **Solicitante:** ${mentionUser(request.userId)}\n` +
      `${request.mode === "mobile" ? "📱" : "💻"} **Modalidade:** ${
        request.mode === "mobile"
          ? "Mobile"
          : "Emulador"
      }\n\n` +
      `Um Analista disponível pode assumir esta análise pelo botão abaixo.`
    )
    .setFooter({
      text: "🎮 Sistema de Análises"
    });
}

async function requestAnalysis(
  message,
  mode
) {
  const guild =
    message.guild;

  const g =
    guildData(guild.id);

  const channelId =
    mode === "mobile"
      ? g.analystChannel1Id
      : g.analystChannel2Id;

  if (!channelId) {
    await message.reply(
      "⚠️ O canal correspondente à análise ainda não foi configurado no /config."
    );

    return;
  }

  const channel =
    guild.channels.cache.get(
      channelId
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    await message.reply(
      "⚠️ O canal configurado para análise não foi encontrado."
    );

    return;
  }

  const match =
    findMatchByChannel(
      message.channel.id
    );

  const requestId =
    `${Date.now()}-${message.author.id}`;

  const request = {
    id: requestId,
    guildId: guild.id,
    userId: message.author.id,
    mode,
    sourceChannelId:
      message.channel.id,
    matchId:
      match?.id || null,
    createdAt: Date.now(),
    claimed: false,
    analystId: null
  };

  db.analysis[requestId] =
    request;

  saveData();

  await channel.send({
    embeds: [
      analystEmbed(
        guild,
        request
      )
    ],
    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              analysisCustomId(
                "claim",
                requestId
              )
            )
            .setLabel(
              "Assumir análise"
            )
            .setEmoji("📊")
            .setStyle(
              ButtonStyle.Primary
            )
        )
    ]
  });

  await message.reply(
    "📊 Sua solicitação de análise foi enviada."
  );
}

/* =========================================================
   CRIAR PARTIDA
========================================================= */

async function createMatch(
  guild,
  queueChannel,
  mode,
  format,
  cents,
  players
) {
  const mediatorId =
    nextMediator(guild);

  if (!mediatorId) {
    return {
      error:
        "Sem mediadores disponíveis no momento."
    };
  }

  const mediator =
    await guild.members
      .fetch(mediatorId)
      .catch(() => null);

  if (!mediator) {
    return {
      error:
        "Sem mediadores disponíveis no momento."
    };
  }

  const matchId =
    makeMatchId(guild.id);

  const channelName =
    `partida-${slug(matchId)}`;

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel
      ]
    },

    ...players.map(
      id => ({
        id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      })
    ),

    {
      id: mediator.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    }
  ];

  const privateChannel =
    await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent:
        queueChannel.parentId ||
        undefined,
      permissionOverwrites:
        overwrites,
      topic:
        `Partida ${matchId} | ${format} | ${MODES[mode].label} | ${money(cents)}`
    });

  const match = {
    id: matchId,
    guildId: guild.id,
    channelId:
      privateChannel.id,
    queueChannelId:
      queueChannel.id,
    mode,
    format,
    cents,
    players,
    mediatorId,
    confirmed: [],
    finalized: false,
    resultType: null,
    winnerId: null,
    roomCreated: false,
    roomId: null,
    roomPassword: null,
    createdAt: Date.now()
  };

  db.matches[matchId] =
    match;

  saveData();

  const mentions =
    players
      .map(mentionUser)
      .join(" • ");

  await privateChannel.send({
    content:
      `${mentions}\n` +
      `👮 **Mediador:** ${mentionUser(mediatorId)}`,
    embeds: [
      matchConfirmEmbed(
        guild,
        match
      )
    ],
    components: [
      confirmButtons(match)
    ]
  });

  return {
    match,
    channel:
      privateChannel
  };
}

/* =========================================================
   FILAS EM MEMÓRIA
========================================================= */

global.queues =
  global.queues || new Map();

global.queueLocks =
  global.queueLocks || new Set();

/* =========================================================
   BOTÃO DA FILA
========================================================= */

async function handleQueueButton(
  interaction
) {
  const parts =
    interaction.customId.split(":");

  const action =
    parts[1];

  const mode =
    parts[2];

  const format =
    parts[3];

  const cents =
    Number(parts[4]);

  if (
    !MODES[mode] ||
    !FORMATS.includes(format) ||
    !Number.isFinite(cents)
  ) {
    await interaction.reply({
      content:
        "⚠️ Fila inválida.",
      ephemeral: true
    });

    return;
  }

  const key =
    queueKey(
      mode,
      format,
      cents
    );

  if (
    global.queueLocks.has(key)
  ) {
    await interaction.reply({
      content:
        "⏳ Aguarde um instante e tente novamente.",
      ephemeral: true
    });

    return;
  }

  global.queueLocks.add(key);

  try {
    /* ================================================
       SAIR DA FILA
    ================================================ */

    if (action === "leave") {
      await interaction.deferUpdate();

      const state =
        global.queues.get(key);

      if (!state) {
        return;
      }

      const index =
        state.players.indexOf(
          interaction.user.id
        );

      if (index !== -1) {
        state.players.splice(
          index,
          1
        );
      }

      await interaction.message.edit(
        queuePayload(
          interaction.guild,
          mode,
          format,
          cents,
          state.players
        )
      );

      return;
    }

    /* ================================================
       VERIFICAR MEDIADORES
    ================================================ */

    const mediatorIds =
      getMediatorIds(
        interaction.guild
      );

    if (!mediatorIds.length) {
      await interaction.reply({
        content:
          "⚠️ **Sem mediadores disponíveis no momento.**",
        ephemeral: true
      });

      return;
    }

    /* ================================================
       CRIAR ESTADO DA FILA
    ================================================ */

    if (
      !global.queues.has(key)
    ) {
      global.queues.set(
        key,
        {
          players: []
        }
      );
    }

    const state =
      global.queues.get(key);

    /* ================================================
       IMPEDIR USUÁRIO DE ENTRAR DUAS VEZES
    ================================================ */

    if (
      state.players.includes(
        interaction.user.id
      )
    ) {
      await interaction.reply({
        content:
          "⚠️ Você já está nessa fila.",
        ephemeral: true
      });

      return;
    }

    /* ================================================
       TODA FILA TEM SOMENTE 2 VAGAS
    ================================================ */

    if (
      state.players.length >= 2
    ) {
      await interaction.reply({
        content:
          "⚠️ Essa fila já está completa.",
        ephemeral: true
      });

      return;
    }

    /* ================================================
       ADICIONAR JOGADOR
    ================================================ */

    state.players.push(
      interaction.user.id
    );

    /* ================================================
       PRIMEIRO JOGADOR
    ================================================ */

    if (
      state.players.length === 1
    ) {
      await interaction.update(
        queuePayload(
          interaction.guild,
          mode,
          format,
          cents,
          state.players
        )
      );

      return;
    }

    /* ================================================
       SEGUNDO JOGADOR
       CRIAR PARTIDA PRIVADA
    ================================================ */

    const players =
      [...state.players];

    state.players = [];

    await interaction.update(
      queuePayload(
        interaction.guild,
        mode,
        format,
        cents,
        []
      )
    );

    const result =
      await createMatch(
        interaction.guild,
        interaction.channel,
        mode,
        format,
        cents,
        players
      );

    if (result.error) {
      global.queues.set(
        key,
        {
          players: []
        }
      );

      await interaction.followUp({
        content:
          `⚠️ ${result.error}`,
        ephemeral: true
      });

      return;
    }
  } catch (error) {
    console.error(
      "Erro no botão da fila:",
      error
    );

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          "❌ Ocorreu um erro ao processar a fila.",
        ephemeral: true
      }).catch(() => {});
    }
  } finally {
    global.queueLocks.delete(key);
  }
}

/* =========================================================
   CANCELAMENTO
========================================================= */

async function cancelMatch(
  interaction,
  match
) {
  if (match.finalized) {
    await interaction.reply({
      content:
        "⚠️ Essa aposta já foi finalizada.",
      ephemeral: true
    });

    return;
  }

  match.finalized = true;
  match.resultType =
    "cancelled";

  saveData();

  await interaction.reply({
    content:
      "❌ **A aposta foi cancelada. O canal será deletado em 15 segundos.**"
  });

  await disableMessageButtons(
    interaction.message
  );

  setTimeout(
    async () => {
      const channel =
        interaction.channel;

      if (channel) {
        await channel.delete()
          .catch(() => {});
      }
    },
    15000
  );
}

/* =========================================================
   CONFIRMAR PARTIDA
========================================================= */

async function confirmMatch(
  interaction,
  match
) {
  if (
    !match.players.includes(
      interaction.user.id
    )
  ) {
    await interaction.reply({
      content:
        "⚠️ Você não participa dessa aposta.",
      ephemeral: true
    });

    return;
  }

  if (match.confirmed.includes(
    interaction.user.id
  )) {
    await interaction.reply({
      content:
        "⚠️ Você já confirmou essa aposta.",
      ephemeral: true
    });

    return;
  }

  match.confirmed.push(
    interaction.user.id
  );

  saveData();

  if (
    match.confirmed.length < 2
  ) {
    await interaction.update({
      embeds: [
        matchConfirmEmbed(
          interaction.guild,
          match
        )
      ],
      components: [
        confirmButtons(match)
      ]
    });

    await interaction.followUp({
      content:
        "✅ Sua confirmação foi registrada. Aguardando o outro jogador.",
      ephemeral: true
    });

    return;
  }

  await interaction.update({
    embeds: [
      matchConfirmEmbed(
        interaction.guild,
        match
      )
    ],
    components: []
  });

  await interaction.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(
          safeColor(
            guildData(
              interaction.guildId
            ).embedColor
          )
        )
        .setTitle(
          "✅ APOSTA CONFIRMADA"
        )
        .setDescription(
          `Os dois jogadores confirmaram a aposta.\n\n` +
          `💳 Aguarde abaixo os dados Pix do ADM responsável.`
        )
    ]
  });

  await sendPix(
    interaction.guild,
    interaction.channel,
    match
  );

  await interaction.channel.send({
    content:
      `👮 ${mentionUser(match.mediatorId)}\n\n` +
      `Após identificar o pagamento, crie a sala e envie o **ID + senha** neste canal.`
  });
}

/* =========================================================
   RESULTADO NORMAL
========================================================= */

async function registerNormalWinner(
  interaction,
  match,
  winnerId
) {
  if (match.finalized) {
    await interaction.reply({
      content:
        "⚠️ Essa aposta já foi finalizada.",
      ephemeral: true
    });

    return;
  }

  if (
    !match.players.includes(
      winnerId
    )
  ) {
    await interaction.reply({
      content:
        "⚠️ Jogador inválido.",
      ephemeral: true
    });

    return;
  }

  const loserId =
    match.players.find(
      id => id !== winnerId
    );

  const winner =
    userData(winnerId);

  const loser =
    userData(loserId);

  winner.wins += 1;
  winner.coins += 1;
  winner.normalMatches += 1;

  loser.losses += 1;
  loser.normalMatches += 1;

  match.finalized = true;
  match.resultType =
    "normal";
  match.winnerId =
    winnerId;

  saveData();

  await interaction.update({
    content:
      `🏆 **Resultado registrado!**\n\n` +
      `🥇 Vencedor: ${mentionUser(winnerId)}\n` +
      `❌ Derrota: ${mentionUser(loserId)}\n\n` +
      `🪙 O vencedor recebeu **+1 Coin**.`,
    embeds: [],
    components: []
  });

  await interaction.channel.send({
    content:
      `🔒 A aposta foi finalizada. O canal será deletado em cinco segundos.`
  });

  setTimeout(
    async () => {
      await interaction.channel
        .delete()
        .catch(() => {});
    },
    5000
  );
}

/* =========================================================
   RESULTADO W.O.
========================================================= */

async function registerWoWinner(
  interaction,
  match,
  winnerId
) {
  if (match.finalized) {
    await interaction.reply({
      content:
        "⚠️ Essa aposta já foi finalizada.",
      ephemeral: true
    });

    return;
  }

  if (
    !match.players.includes(
      winnerId
    )
  ) {
    await interaction.reply({
      content:
        "⚠️ Jogador inválido.",
      ephemeral: true
    });

    return;
  }

  const winner =
    userData(winnerId);

  /*
    W.O.:
    - NÃO adiciona vitória normal
    - NÃO adiciona derrota
    - registra apenas vitória por W.O.
    - NÃO adiciona Coin
  */

  winner.woWins += 1;

  match.finalized = true;
  match.resultType =
    "wo";
  match.winnerId =
    winnerId;

  saveData();

  await interaction.update({
    content:
      `⚡ **Vitória por W.O. registrada!**\n\n` +
      `🏆 Jogador: ${mentionUser(winnerId)}\n\n` +
      `🚫 Nenhuma vitória ou derrota normal foi adicionada.\n` +
      `🪙 Nenhum Coin foi adicionado.`,
    embeds: [],
    components: []
  });

  await interaction.channel.send({
    content:
      `🔒 A aposta foi finalizada. O canal será deletado em cinco segundos.`
  });

  setTimeout(
    async () => {
      await interaction.channel
        .delete()
        .catch(() => {});
    },
    5000
  );
}

/* =========================================================
   FINALIZAR MANUALMENTE
========================================================= */

async function finalizeMatch(
  interaction,
  match
) {
  if (match.finalized) {
    await interaction.reply({
      content:
        "⚠️ Essa aposta já foi finalizada.",
      ephemeral: true
    });

    return;
  }

  match.finalized = true;
  match.resultType =
    "finalized";

  saveData();

  await interaction.reply({
    content:
      "🔒 **A aposta foi finalizada. O canal será deletado em cinco segundos.**"
  });

  await disableMessageButtons(
    interaction.message
  );

  setTimeout(
    async () => {
      await interaction.channel
        .delete()
        .catch(() => {});
    },
    5000
  );
}

/* =========================================================
   ID + SENHA DA SALA
========================================================= */

function detectRoomCredentials(
  content
) {
  if (!content) {
    return null;
  }

  const normalized =
    content
      .replace(/\r/g, " ")
      .replace(/\n/g, " ");

  let id = null;
  let password = null;

  const idPatterns = [
    /(?:id\s*(?:da\s*sala)?|sala)\s*[:=\-]?\s*(\d{3,20})/i,
    /\bid\s*[:=]\s*(\d{3,20})/i
  ];

  const passwordPatterns = [
    /(?:senha|password|pass)\s*[:=\-]?\s*([A-Za-z0-9_-]{2,30})/i
  ];

  for (const pattern of idPatterns) {
    const match =
      normalized.match(pattern);

    if (match) {
      id = match[1];
      break;
    }
  }

  for (const pattern of passwordPatterns) {
    const match =
      normalized.match(pattern);

    if (match) {
      password = match[1];
      break;
    }
  }

  if (!id || !password) {
    return null;
  }

  return {
    id,
    password
  };
}

async function handleRoomMessage(
  message
) {
  if (
    !message.guild ||
    message.author.bot
  ) {
    return;
  }

  const match =
    findMatchByChannel(
      message.channel.id
    );

  if (!match) {
    return;
  }

  if (
    message.author.id !==
    match.mediatorId
  ) {
    return;
  }

  if (
    !match.confirmed ||
    match.confirmed.length < 2
  ) {
    return;
  }

  const room =
    detectRoomCredentials(
      message.content
    );

  if (!room) {
    return;
  }

  if (match.roomCreated) {
    return;
  }

  match.roomCreated = true;
  match.roomId =
    room.id;
  match.roomPassword =
    room.password;

  saveData();

  const total =
    money(match.cents * 2);

  await message.channel
    .setName(
      `pagar-${slug(total)}`
    )
    .catch(() => {});

  const g =
    guildData(
      message.guild.id
    );

  const embed =
    new EmbedBuilder()
      .setColor(
        safeColor(g.embedColor)
      )
      .setTitle(
        "🤍 SALA CRIADA"
      )
      .setDescription(
        `⏱️ **A sala será iniciada em 3 a 5 minutos**\n\n` +
        `🆔 **ID da Sala**\n` +
        `\`${room.id}\`\n\n` +
        `🔐 **Senha**\n` +
        `\`${room.password}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💰 **Valor total da aposta:** ${total}`
      )
      .setFooter({
        text:
          "🎮 Sistema de Apostas"
      });

  await message.channel.send({
    embeds: [
      embed
    ]
  });
}

/* =========================================================
   /CONFIG
========================================================= */

function configEmbed(
  guild
) {
  const g =
    guildData(guild.id);

  const mediator =
    g.mediatorRoleId
      ? `<@&${g.mediatorRoleId}>`
      : "❌ Não configurado";

  const analyst =
    g.analystRoleId
      ? `<@&${g.analystRoleId}>`
      : "❌ Não configurado";

  const channel1 =
    g.analystChannel1Id
      ? `<#${g.analystChannel1Id}>`
      : "❌ Não configurado";

  const channel2 =
    g.analystChannel2Id
      ? `<#${g.analystChannel2Id}>`
      : "❌ Não configurado";

  const pixCount =
    Object.keys(g.pix || {}).length;

  return new EmbedBuilder()
    .setColor(
      safeColor(g.embedColor)
    )
    .setTitle(
      "⚙️ • CONFIGURAÇÃO"
    )
    .setDescription(
      `🎨 **Aparência**\n` +
      `Cor: \`${g.embedColor}\`\n` +
      `Foto de perfil: ${
        g.botAvatar
          ? "Configurada"
          : "Padrão"
      }\n\n` +

      `👥 **Cargos**\n` +
      `🛡️ Mediador: ${mediator}\n` +
      `📊 Analista: ${analyst}\n\n` +

      `📊 **Análises**\n` +
      `📱 Canal 1: ${channel1}\n` +
      `💻 Canal 2: ${channel2}\n\n` +

      `💳 **Pix ADM**\n` +
      `ADMs cadastrados: **${pixCount}**`
    )
    .setFooter({
      text:
        "🎮 Sistema de Apostas"
    });
}

function configMainButtons() {
  return new ActionRowBuilder()
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
        .setEmoji("📁")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config:appearance"
        )
        .setLabel(
          "Cor / Aparência"
        )
        .setEmoji("🎨")
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config:pix"
        )
        .setLabel("Pix ADM")
        .setEmoji("💳")
        .setStyle(
          ButtonStyle.Success
        )
    );
}

/* =========================================================
   CONFIGURAÇÃO DE CARGOS
========================================================= */

function rolesConfigRows() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(
            "config:set-mediator-role"
          )
          .setPlaceholder(
            "Selecionar cargo de Mediador"
          )
          .setMinValues(1)
          .setMaxValues(1)
      ),

    new ActionRowBuilder()
      .addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(
            "config:set-analyst-role"
          )
          .setPlaceholder(
            "Selecionar cargo de Analista"
          )
          .setMinValues(1)
          .setMaxValues(1)
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "config:back"
          )
          .setLabel("Voltar")
          .setEmoji("↩️")
          .setStyle(
            ButtonStyle.Secondary
          )
      )
  ];
}

/* =========================================================
   CONFIGURAÇÃO DE CANAIS
========================================================= */

function channelsConfigRows() {
  /*
    ChannelSelectMenuBuilder é utilizado para o Discord
    mostrar os canais reais do servidor.

    Não existe lista fixa inventada.
    O Discord carrega os canais disponíveis.
  */

  return [
    new ActionRowBuilder()
      .addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(
            "config:set-channel1"
          )
          .setPlaceholder(
            "Selecionar Canal 1"
          )
          .setMinValues(1)
          .setMaxValues(1)
      ),

    new ActionRowBuilder()
      .addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(
            "config:set-channel2"
          )
          .setPlaceholder(
            "Selecionar Canal 2"
          )
          .setMinValues(1)
          .setMaxValues(1)
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "config:back"
          )
          .setLabel("Voltar")
          .setEmoji("↩️")
          .setStyle(
            ButtonStyle.Secondary
          )
      )
  ];
}

/* =========================================================
   CONFIGURAÇÃO DE APARÊNCIA
========================================================= */

function appearanceButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "config:color"
          )
          .setLabel(
            "Alterar cor das embeds"
          )
          .setEmoji("🎨")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "config:avatar"
          )
          .setLabel(
            "Alterar foto de perfil"
          )
          .setEmoji("🖼️")
          .setStyle(
            ButtonStyle.Primary
          )
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "config:back"
          )
          .setLabel("Voltar")
          .setEmoji("↩️")
          .setStyle(
            ButtonStyle.Secondary
          )
      )
  ];
}

/* =========================================================
   CONFIGURAÇÃO PIX
========================================================= */

function pixConfigRows() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(
            "config:pix-user"
          )
          .setPlaceholder(
            "Selecionar ADM para cadastrar"
          )
          .setMinValues(1)
          .setMaxValues(1)
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "config:back"
          )
          .setLabel("Voltar")
          .setEmoji("↩️")
          .setStyle(
            ButtonStyle.Secondary
          )
      )
  ];
}

/* =========================================================
   MODAL PIX
========================================================= */

function pixModal(userId) {
  const modal =
    new ModalBuilder()
      .setCustomId(
        `config:pix-modal:${userId}`
      )
      .setTitle(
        "Cadastrar Pix do ADM"
      );

  const name =
    new TextInputBuilder()
      .setCustomId("name")
      .setLabel("Nome do ADM")
      .setStyle(
        TextInputStyle.Short
      )
      .setPlaceholder(
        "Ex.: João"
      )
      .setRequired(true)
      .setMaxLength(100);

  const key =
    new TextInputBuilder()
      .setCustomId("key")
      .setLabel("Chave Pix")
      .setStyle(
        TextInputStyle.Short
      )
      .setPlaceholder(
        "CPF, telefone, e-mail ou chave aleatória"
      )
      .setRequired(true)
      .setMaxLength(200);

  const qr =
    new TextInputBuilder()
      .setCustomId("qr")
      .setLabel(
        "URL do QR Code"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setPlaceholder(
        "https://..."
      )
      .setRequired(false)
      .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(name),

    new ActionRowBuilder()
      .addComponents(key),

    new ActionRowBuilder()
      .addComponents(qr)
  );

  return modal;
}

/* =========================================================
   MODAL COR
========================================================= */

function colorModal() {
  const modal =
    new ModalBuilder()
      .setCustomId(
        "config:color-modal"
      )
      .setTitle(
        "Alterar cor das embeds"
      );

  const color =
    new TextInputBuilder()
      .setCustomId("color")
      .setLabel(
        "Cor em HEX"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setPlaceholder(
        "#5865F2"
      )
      .setRequired(true)
      .setMaxLength(7);

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(color)
  );

  return modal;
}

/* =========================================================
   MODAL FOTO
========================================================= */

function avatarModal() {
  const modal =
    new ModalBuilder()
      .setCustomId(
        "config:avatar-modal"
      )
      .setTitle(
        "Alterar foto de perfil"
      );

  const url =
    new TextInputBuilder()
      .setCustomId("url")
      .setLabel(
        "URL da imagem"
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setPlaceholder(
        "https://..."
      )
      .setRequired(true)
      .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(url)
  );

  return modal;
}

/* =========================================================
   PUBLICAÇÃO DAS FILAS
========================================================= */

function filaConfigFormatSelect() {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          "fila:format"
        )
        .setPlaceholder(
          "Escolha o formato"
        )
        .addOptions(
          FORMATS.map(
            format =>
              new StringSelectMenuOptionBuilder()
                .setLabel(format)
                .setValue(format)
                .setEmoji("🎮")
          )
        )
    );
}

function filaConfigModeSelect() {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          "fila:mode"
        )
        .setPlaceholder(
          "Escolha a modalidade"
        )
        .addOptions(
          Object.entries(MODES)
            .map(
              ([key, value]) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(
                    value.label
                  )
                  .setValue(key)
                  .setEmoji(
                    value.emoji
                  )
            )
        )
    );
}

function filaConfigChannelSelect() {
  return new ActionRowBuilder()
    .addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "fila:channel"
        )
        .setPlaceholder(
          "Escolha o canal onde as filas serão enviadas"
        )
        .setMinValues(1)
        .setMaxValues(1)
    );
}

/* =========================================================
   PUBLICAR TODAS AS FILAS
   Valores de baixo para cima em ordem crescente.
========================================================= */

async function publishQueues(
  guild,
  channel,
  mode,
  format
) {
  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      "Canal inválido."
    );
  }

  const sortedValues =
    [...VALUES].sort(
      (a, b) =>
        a.cents - b.cents
    );

  for (
    const value of sortedValues
  ) {
    await channel.send(
      queuePayload(
        guild,
        mode,
        format,
        value.cents,
        []
      )
    );
  }

  const g =
    guildData(guild.id);

  if (!g.queueChannels[mode]) {
    g.queueChannels[mode] = {};
  }

  g.queueChannels[mode][format] =
    channel.id;

  saveData();
}

/* =========================================================
   CLIENT
========================================================= */

const client =
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.GuildMember
    ]
  });

/* =========================================================
   READY
========================================================= */

client.once(
  "ready",
  async () => {
    console.log(
      `✅ Bot conectado como ${client.user.tag}`
    );

    try {
      const commands = [
        new SlashCommandBuilder()
          .setName("config")
          .setDescription(
            "Configurar o sistema de apostas"
          ),

        new SlashCommandBuilder()
          .setName("fila")
          .setDescription(
            "Configurar e publicar uma fila"
          )
      ].map(
        command =>
          command.toJSON()
      );

      await client.application.commands.set(
        commands
      );

      console.log(
        "✅ Comandos registrados: /config e /fila"
      );
    } catch (error) {
      console.error(
        "Erro ao registrar comandos:",
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
      /* ==============================================
         SLASH COMMANDS
      ============================================== */

      if (
        interaction.isChatInputCommand()
      ) {
        /* ==========================================
           /CONFIG
        ========================================== */

        if (
          interaction.commandName ===
          "config"
        ) {
          if (!isOwner(interaction)) {
            await interaction.reply({
              content:
                "❌ Apenas o dono do servidor pode usar este comando.",
              ephemeral: true
            });

            return;
          }

          await interaction.reply({
            embeds: [
              configEmbed(
                interaction.guild
              )
            ],
            components: [
              configMainButtons()
            ],
            ephemeral: true
          });

          return;
        }

        /* ==========================================
           /FILA
        ========================================== */

        if (
          interaction.commandName ===
          "fila"
        ) {
          if (!isOwner(interaction)) {
            await interaction.reply({
              content:
                "❌ Apenas o dono do servidor pode configurar as filas.",
              ephemeral: true
            });

            return;
          }

          await interaction.reply({
            content:
              "🎮 **CONFIGURAÇÃO DE FILA**\n\n" +
              "Escolha o formato, depois a modalidade e depois o canal onde todas as filas serão publicadas.\n\n" +
              "💰 Os valores são automáticos e pré-definidos.",
            components: [
              filaConfigFormatSelect()
            ],
            ephemeral: true
          });

          return;
        }
      }

      /* ==============================================
         SELECT DE FORMATO
      ============================================== */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "fila:format"
      ) {
        if (!isOwner(interaction)) {
          await interaction.reply({
            content:
              "❌ Apenas o dono pode configurar filas.",
            ephemeral: true
          });

          return;
        }

        const format =
          interaction.values[0];

        interaction.client.filaDrafts =
          interaction.client.filaDrafts ||
          new Map();

        interaction.client.filaDrafts.set(
          interaction.user.id,
          {
            format
          }
        );

        await interaction.update({
          content:
            `🎮 **Formato selecionado:** ${format}\n\n` +
            `Agora escolha a modalidade:`,
          components: [
            filaConfigModeSelect()
          ]
        });

        return;
      }

      /* ==============================================
         SELECT DE MODALIDADE
      ============================================== */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "fila:mode"
      ) {
        if (!isOwner(interaction)) {
          await interaction.reply({
            content:
              "❌ Apenas o dono pode configurar filas.",
            ephemeral: true
          });

          return;
        }

        const draft =
          interaction.client.filaDrafts?.get(
            interaction.user.id
          );

        if (!draft?.format) {
          await interaction.reply({
            content:
              "⚠️ Primeiro escolha o formato.",
            ephemeral: true
          });

          return;
        }

        const mode =
          interaction.values[0];

        interaction.client.filaDrafts.set(
          interaction.user.id,
          {
            ...draft,
            mode
          }
        );

        await interaction.update({
          content:
            `🎮 **Formato:** ${draft.format}\n` +
            `${MODES[mode].emoji} **Modalidade:** ${MODES[mode].label}\n\n` +
            `Agora escolha o canal onde as filas serão enviadas:`,
          components: [
            filaConfigChannelSelect()
          ]
        });

        return;
      }

      /* ==============================================
         SELECT DE CANAL DA FILA
      ============================================== */

      if (
        interaction.isChannelSelectMenu() &&
        interaction.customId ===
          "fila:channel"
      ) {
        if (!isOwner(interaction)) {
          await interaction.reply({
            content:
              "❌ Apenas o dono pode configurar filas.",
            ephemeral: true
          });

          return;
        }

        const draft =
          interaction.client.filaDrafts?.get(
            interaction.user.id
          );

        if (
          !draft?.format ||
          !draft?.mode
        ) {
          await interaction.reply({
            content:
              "⚠️ Configuração incompleta.",
            ephemeral: true
          });

          return;
        }

        const channel =
          interaction.guild.channels.cache.get(
            interaction.values[0]
          );

        if (
          !channel ||
          !channel.isTextBased()
        ) {
          await interaction.reply({
            content:
              "⚠️ Selecione um canal de texto válido.",
            ephemeral: true
          });

          return;
        }

        await interaction.deferUpdate();

        await publishQueues(
          interaction.guild,
          channel,
          draft.mode,
          draft.format
        );

        interaction.client.filaDrafts.delete(
          interaction.user.id
        );

        await interaction.editReply({
          content:
            `✅ **Filas publicadas com sucesso!**\n\n` +
            `${MODES[draft.mode].emoji} Modalidade: **${MODES[draft.mode].label}**\n` +
            `🎮 Formato: **${draft.format}**\n` +
            `📁 Canal: ${channel}\n\n` +
            `💰 Todos os valores pré-definidos foram publicados em ordem crescente.`,
          components: []
        });

        return;
      }

      /* ==============================================
         CONFIG - BOTÕES
      ============================================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "config:"
        )
      ) {
        if (!isOwner(interaction)) {
          await interaction.reply({
            content:
              "❌ Apenas o dono do servidor pode alterar essas configurações.",
            ephemeral: true
          });

          return;
        }

        const action =
          interaction.customId
            .split(":")[1];

        /* ==========================================
           VOLTAR
        ========================================== */

        if (action === "back") {
          await interaction.update({
            embeds: [
              configEmbed(
                interaction.guild
              )
            ],
            components: [
              configMainButtons()
            ]
          });

          return;
        }

        /* ==========================================
           CARGOS
        ========================================== */

        if (action === "roles") {
          await interaction.update({
            content:
              "👥 **CONFIGURAÇÃO DE CARGOS**\n\n" +
              "Escolha o cargo responsável pelos Mediadores e o cargo responsável pelos Analistas.",
            embeds: [],
            components:
              rolesConfigRows()
          });

          return;
        }

        /* ==========================================
           CANAIS
        ========================================== */

        if (action === "channels") {
          await interaction.update({
            content:
              "📁 **CONFIGURAÇÃO DE CANAIS DE ANÁLISE**\n\n" +
              "Selecione o **Canal 1** para solicitações Mobile e o **Canal 2** para solicitações Emulador.\n\n" +
              "Os seletores abaixo carregam os canais do próprio servidor.",
            embeds: [],
            components:
              channelsConfigRows()
          });

          return;
        }

        /* ==========================================
           APARÊNCIA
        ========================================== */

        if (
          action === "appearance"
        ) {
          await interaction.update({
            content:
              "🎨 **COR / APARÊNCIA**\n\n" +
              "Altere a cor das embeds ou a foto de perfil do bot.",
            embeds: [],
            components:
              appearanceButtons()
          });

          return;
        }

        /* ==========================================
           PIX
        ========================================== */

        if (action === "pix") {
          await interaction.update({
            content:
              "💳 **PIX ADM**\n\n" +
              "Selecione o ADM que deseja cadastrar.\n\n" +
              "Depois será possível informar nome, chave Pix e URL do QR Code.",
            embeds: [],
            components:
              pixConfigRows()
          });

          return;
        }

        /* ==========================================
           COR
        ========================================== */

        if (action === "color") {
          await interaction.showModal(
            colorModal()
          );

          return;
        }

        /* ==========================================
           AVATAR
        ========================================== */

        if (action === "avatar") {
          await interaction.showModal(
            avatarModal()
          );

          return;
        }
      }

      /* ==============================================
         ROLE SELECT
      ============================================== */

      if (
        interaction.isRoleSelectMenu()
      ) {
        if (!isOwner(interaction)) {
          await interaction.reply({
            content:
              "❌ Apenas o dono pode alterar os cargos.",
            ephemeral: true
          });

          return;
        }

        const roleId =
          interaction.values[0];

        const g =
          guildData(
            interaction.guildId
          );

        if (
          interaction.customId ===
          "config:set-mediator-role"
        ) {
          g.mediatorRoleId =
            roleId;

          saveData();

          await interaction.update({
            content:
              `✅ **Cargo Mediador definido:** <@&${roleId}>`,
            components:
              rolesConfigRows()
          });

          return;
        }

        if (
          interaction.customId ===
          "config:set-analyst-role"
        ) {
          g.analystRoleId =
            roleId;

          saveData();

          await interaction.update({
            content:
              `✅ **Cargo Analista definido:** <@&${roleId}>`,
            components:
              rolesConfigRows()
          });

          return;
        }
      }

      /* ==============================================
         CHANNEL SELECT DO CONFIG
      ============================================== */

      if (
        interaction.isChannelSelectMenu()
      ) {
        if (!isOwner(interaction)) {
          await interaction.reply({
            content:
              "❌ Apenas o dono pode alterar os canais.",
            ephemeral: true
          });

          return;
        }

        if (
          interaction.customId !==
            "config:set-channel1" &&
          interaction.customId !==
            "config:set-channel2"
        ) {
          return;
        }

        const channel =
          interaction.guild.channels.cache.get(
            interaction.values[0]
          );

        if (
          !channel ||
          !channel.isTextBased()
        ) {
          await interaction.reply({
            content:
              "⚠️ O canal selecionado precisa ser um canal de texto.",
            ephemeral: true
          });

          return;
        }

        const g =
          guildData(
            interaction.guildId
          );

        if (
          interaction.customId ===
          "config:set-channel1"
        ) {
          g.analystChannel1Id =
            channel.id;

          saveData();

          await interaction.update({
            content:
              `✅ **Canal 1 configurado:** ${channel}\n\n` +
              `📱 Solicitações **Mobile** serão enviadas para este canal.`,
            components:
              channelsConfigRows()
          });

          return;
        }

        if (
          interaction.customId ===
          "config:set-channel2"
        ) {
          g.analystChannel2Id =
            channel.id;

          saveData();

          await interaction.update({
            content:
              `✅ **Canal 2 configurado:** ${channel}\n\n` +
              `💻 Solicitações **Emulador** serão enviadas para este canal.`,
            components:
              channelsConfigRows()
          });

          return;
        }
      }

      /* ==============================================
         USER SELECT PIX
      ============================================== */

      if (
        interaction.isUserSelectMenu() &&
        interaction.customId ===
          "config:pix-user"
      ) {
        if (!isOwner(interaction)) {
          await interaction.reply({
            content:
              "❌ Apenas o dono pode cadastrar Pix.",
            ephemeral: true
          });

          return;
        }

        const userId =
          interaction.values[0];

        await interaction.showModal(
          pixModal(userId)
        );

        return;
      }

      /* ==============================================
         MODAL PIX
      ============================================== */

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith(
          "config:pix-modal:"
        )
      ) {
        if (!isOwner(interaction)) {
          await interaction.reply({
            content:
              "❌ Apenas o dono pode cadastrar Pix.",
            ephemeral: true
          });

          return;
        }

        const userId =
          interaction.customId.split(":")[2];

        const name =
          interaction.fields.getTextInputValue(
            "name"
          );

        const key =
          interaction.fields.getTextInputValue(
            "key"
          );

        const qrUrl =
          interaction.fields.getTextInputValue(
            "qr"
          ).trim();

        const g =
          guildData(
            interaction.guildId
          );

        g.pix[userId] = {
          name,
          key,
          qrUrl
        };

        saveData();

        await interaction.reply({
          content:
            `✅ **Pix cadastrado com sucesso!**\n\n` +
            `👤 ADM: <@${userId}>\n` +
            `📝 Nome: **${name}**\n` +
            `🔑 Chave Pix: \`${key}\`\n` +
            `📷 QR Code: ${
              qrUrl
                ? "Configurado"
                : "Não informado"
            }`,
          ephemeral: true
        });

        return;
      }

      /* ==============================================
         MODAL COR
      ============================================== */

      if (
        interaction.isModalSubmit() &&
        interaction.customId ===
          "config:color-modal"
      ) {
        if (!isOwner(interaction)) {
          await interaction.reply({
            content:
              "❌ Apenas o dono pode alterar a aparência.",
            ephemeral: true
          });

          return;
        }

        const color =
          interaction.fields.getTextInputValue(
            "color"
          ).trim();

        if (
          !/^#[0-9A-Fa-f]{6}$/.test(
            color
          )
        ) {
          await interaction.reply({
            content:
              "❌ Cor inválida. Use o formato `#5865F2`.",
            ephemeral: true
          });

          return;
        }

        const g =
          guildData(
            interaction.guildId
          );

        g.embedColor =
          color;

        saveData();

        await interaction.reply({
          content:
            `✅ Cor das embeds alterada para **${color}**.`,
          ephemeral: true
        });

        return;
      }

      /* ==============================================
         MODAL AVATAR
      ============================================== */

      if (
        interaction.isModalSubmit() &&
        interaction.customId ===
          "config:avatar-modal"
      ) {
        if (!isOwner(interaction)) {
          await interaction.reply({
            content:
              "❌ Apenas o dono pode alterar a foto do bot.",
            ephemeral: true
          });

          return;
        }

        const url =
          interaction.fields.getTextInputValue(
            "url"
          ).trim();

        if (
          !/^https?:\/\//i.test(url)
        ) {
          await interaction.reply({
            content:
              "❌ Informe uma URL válida de imagem.",
            ephemeral: true
          });

          return;
        }

        try {
          await client.user.setAvatar(
            url
          );

          const g =
            guildData(
              interaction.guildId
            );

          g.botAvatar =
            url;

          saveData();

          await interaction.reply({
            content:
              "✅ **Foto de perfil do bot alterada com sucesso.**",
            ephemeral: true
          });
        } catch (error) {
          console.error(
            "Erro ao alterar avatar:",
            error
          );

          await interaction.reply({
            content:
              "❌ Não foi possível alterar a foto de perfil. Verifique se a URL é uma imagem válida.",
            ephemeral: true
          });
        }

        return;
      }

      /* ==============================================
         BOTÕES DAS FILAS
      ============================================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "queue:"
        )
      ) {
        await handleQueueButton(
          interaction
        );

        return;
      }

      /* ==============================================
         BOTÕES DA PARTIDA
      ============================================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "match:"
        )
      ) {
        const parts =
          interaction.customId.split(":");

        const action =
          parts[1];

        const matchId =
          parts[2];

        const match =
          findMatchById(
            matchId
          );

        if (!match) {
          await interaction.reply({
            content:
              "⚠️ Partida não encontrada.",
            ephemeral: true
          });

          return;
        }

        if (
          action === "confirm"
        ) {
          await confirmMatch(
            interaction,
            match
          );

          return;
        }

        if (
          action === "cancel"
        ) {
          if (
            !match.players.includes(
              interaction.user.id
            )
          ) {
            await interaction.reply({
              content:
                "⚠️ Apenas os jogadores podem cancelar a aposta.",
              ephemeral: true
            });

            return;
          }

          await cancelMatch(
            interaction,
            match
          );

          return;
        }

        if (
          action === "winner-menu"
        ) {
          if (
            interaction.user.id !==
            match.mediatorId ||
            !isMediator(interaction)
          ) {
            await interaction.reply({
              content:
                "❌ Apenas o Mediador responsável pode escolher o vencedor.",
              ephemeral: true
            });

            return;
          }

          await interaction.reply({
            content:
              "🏆 Selecione o vencedor:",
            components: [
              winnerSelect(
                match,
                "winner-select"
              )
            ],
            ephemeral: true
          });

          return;
        }

        if (
          action === "wo-menu"
        ) {
          if (
            interaction.user.id !==
            match.mediatorId ||
            !isMediator(interaction)
          ) {
            await interaction.reply({
              content:
                "❌ Apenas o Mediador responsável pode registrar W.O.",
              ephemeral: true
            });

            return;
          }

          await interaction.reply({
            content:
              "⚡ Selecione o jogador que venceu por W.O.:",
            components: [
              winnerSelect(
                match,
                "wo-select"
              )
            ],
            ephemeral: true
          });

          return;
        }

        if (
          action === "finalize"
        ) {
          if (
            interaction.user.id !==
            match.mediatorId ||
            !isMediator(interaction)
          ) {
            await interaction.reply({
              content:
                "❌ Apenas o Mediador responsável pode finalizar a aposta.",
              ephemeral: true
            });

            return;
          }

          await finalizeMatch(
            interaction,
            match
          );

          return;
        }
      }

      /* ==============================================
         SELECT DE VENCEDOR / W.O.
      ============================================== */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId.startsWith(
          "match:"
        )
      ) {
        const parts =
          interaction.customId.split(":");

        const action =
          parts[1];

        const matchId =
          parts[2];

        const match =
          findMatchById(
            matchId
          );

        if (!match) {
          await interaction.reply({
            content:
              "⚠️ Partida não encontrada.",
            ephemeral: true
          });

          return;
        }

        if (
          interaction.user.id !==
            match.mediatorId ||
          !isMediator(interaction)
        ) {
          await interaction.reply({
            content:
              "❌ Apenas o Mediador responsável pode realizar essa ação.",
            ephemeral: true
          });

          return;
        }

        const selected =
          interaction.values[0];

        if (
          action === "winner-select"
        ) {
          await registerNormalWinner(
            interaction,
            match,
            selected
          );

          return;
        }

        if (
          action === "wo-select"
        ) {
          await registerWoWinner(
            interaction,
            match,
            selected
          );

          return;
        }
      }

      /* ==============================================
         ASSUMIR ANÁLISE
      ============================================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "analysis:"
        )
      ) {
        const parts =
          interaction.customId.split(":");

        const action =
          parts[1];

        const requestId =
          parts.slice(2).join(":");

        if (
          action !== "claim"
        ) {
          return;
        }

        if (
          !isAnalyst(interaction)
        ) {
          await interaction.reply({
            content:
              "❌ Você não possui o cargo de Analista configurado.",
            ephemeral: true
          });

          return;
        }

        const request =
          db.analysis[requestId];

        if (!request) {
          await interaction.reply({
            content:
              "⚠️ Solicitação de análise não encontrada.",
            ephemeral: true
          });

          return;
        }

        if (request.claimed) {
          await interaction.reply({
            content:
              "⚠️ Essa análise já foi assumida por outro Analista.",
            ephemeral: true
          });

          return;
        }

        request.claimed =
          true;

        request.analystId =
          interaction.user.id;

        saveData();

        let targetChannel = null;

        if (request.matchId) {
          const match =
            findMatchById(
              request.matchId
            );

          if (match) {
            targetChannel =
              interaction.guild.channels.cache.get(
                match.channelId
              );

            if (targetChannel) {
              await targetChannel.permissionOverwrites
                .edit(
                  interaction.user.id,
                  {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                  }
                )
                .catch(() => {});
            }
          }
        }

        await interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(
                safeColor(
                  guildData(
                    interaction.guildId
                  ).embedColor
                )
              )
              .setTitle(
                "📊 Análise assumida"
              )
              .setDescription(
                `👤 **Solicitante:** ${mentionUser(request.userId)}\n` +
                `📊 **Analista:** ${mentionUser(interaction.user.id)}\n\n` +
                `A análise foi assumida com sucesso.`
              )
          ],
          components: []
        });

        if (targetChannel) {
          await targetChannel.send({
            content:
              `📊 ${mentionUser(interaction.user.id)} **assumiu a análise desta aposta.**`
          });
        } else {
          await interaction.followUp({
            content:
              "⚠️ A análise foi assumida, mas o canal privado da aposta não foi encontrado.",
            ephemeral: true
          });
        }

        return;
      }
    } catch (error) {
      console.error(
        "ERRO interactionCreate:",
        error
      );

      if (
        interaction.isRepliable() &&
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction.reply({
          content:
            "❌ Ocorreu um erro ao processar essa ação.",
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
);

/* =========================================================
   COMANDOS SEM BARRA
========================================================= */

client.on(
  "messageCreate",
  async message => {
    try {
      if (
        !message.guild ||
        message.author.bot
      ) {
        return;
      }

      const content =
        message.content
          .trim();

      /* ==============================================
         .MED
      ============================================== */

      if (
        content.toLowerCase() ===
        ".med"
      ) {
        if (
          !isMediator({
            guildId: message.guild.id,
            member: message.member
          })
        ) {
          return;
        }

        const match =
          findMatchByChannel(
            message.channel.id
          );

        if (!match) {
          await message.reply(
            "⚠️ Este canal não é uma aposta ativa."
          );

          return;
        }

        if (
          message.author.id !==
          match.mediatorId
        ) {
          await message.reply(
            "⚠️ Você não é o Mediador responsável por esta aposta."
          );

          return;
        }

        await message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(
                safeColor(
                  guildData(
                    message.guild.id
                  ).embedColor
                )
              )
              .setTitle(
                "🛡️ ÁREA DO MEDIADOR"
              )
              .setDescription(
                `Use as opções abaixo para controlar a aposta.\n\n` +
                `🏆 **Escolher vencedor:** registra uma vitória normal.\n` +
                `⚡ **Vitória por W.O.:** registra somente a vitória por W.O.\n` +
                `🔒 **Finalizar aposta:** encerra a aposta e remove o canal.`
              )
          ],
          components: [
            mediatorMenu(match)
          ]
        });

        return;
      }

      /* ==============================================
         .SSMOB
      ============================================== */

      if (
        content.toLowerCase() ===
        ".ssmob"
      ) {
        if (
          !isMediator({
            guildId: message.guild.id,
            member: message.member
          })
        ) {
          return;
        }

        await requestAnalysis(
          message,
          "mobile"
        );

        return;
      }

      /* ==============================================
         .SSEMU
      ============================================== */

      if (
        content.toLowerCase() ===
        ".ssemu"
      ) {
        if (
          !isMediator({
            guildId: message.guild.id,
            member: message.member
          })
        ) {
          return;
        }

        await requestAnalysis(
          message,
          "emu"
        );

        return;
      }

      /* ==============================================
         DETECTAR ID + SENHA
      ============================================== */

      await handleRoomMessage(
        message
      );
    } catch (error) {
      console.error(
        "Erro messageCreate:",
        error
      );
    }
  }
);

/* =========================================================
   LOGIN
========================================================= */

client.login(
  TOKEN
);
