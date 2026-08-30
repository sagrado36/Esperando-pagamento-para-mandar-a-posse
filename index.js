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
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  AttachmentBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_TOKEN;
const DATA_FILE = path.join(__dirname, "data.json");

if (!TOKEN) {
  console.error("ERRO: coloque DISCORD_TOKEN no arquivo .env");
  process.exit(1);
}

const VALUES = [
  { cents: 3000, label: "R$ 30,00" },
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

const MODES = {
  mobile: { label: "Mobile", emoji: "📱" },
  emu: { label: "Emulador", emoji: "💻" },
  misto: { label: "Misto", emoji: "📱💻" }
};

const FORMATS = ["1x1", "2x2", "3x3", "4x4"];

function defaultData() {
  return {
    guilds: {},
    users: {},
    matches: {},
    counters: {}
  };
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const data = defaultData();
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      return data;
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");

    return Object.assign(
      defaultData(),
      JSON.parse(raw)
    );
  } catch (err) {
    console.error("Falha ao carregar data.json:", err);
    return defaultData();
  }
}

let db = loadData();

function saveData() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(db, null, 2)
  );
}

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

  if (!g.pix) g.pix = {};
  if (!g.queueChannels) g.queueChannels = {};
  if (!g.embedColor) g.embedColor = "#5865F2";

  return g;
}

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

function safeColor(value) {
  if (typeof value !== "string") {
    return "#5865F2";
  }

  const v = value.trim();

  return /^#[0-9A-Fa-f]{6}$/.test(v)
    ? v
    : "#5865F2";
}

function money(cents) {
  return `R$ ${(cents / 100)
    .toFixed(2)
    .replace(".", ",")}`;
}

function slug(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function isOwner(interaction) {
  return (
    interaction.guild &&
    interaction.guild.ownerId === interaction.user.id
  );
}

function hasRole(member, roleId) {
  return Boolean(
    roleId &&
    member?.roles?.cache?.has(roleId)
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

function mentionUser(id) {
  return `<@${id}>`;
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
  matchId,
  extra = ""
) {
  return `match:${action}:${matchId}${
    extra ? `:${extra}` : ""
  }`;
}

function analystCustomId(
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

  const role = guild.roles.cache.get(
    g.mediatorRoleId
  );

  if (!role) {
    return [];
  }

  return role.members.map(
    member => member.id
  );
}

function nextMediator(guild) {
  const ids = getMediatorIds(guild);

  if (!ids.length) {
    return null;
  }

  const key =
    `mediatorIndex:${guild.id}`;

  const current = Number(
    db.counters[key] || 0
  );

  const index =
    current % ids.length;

  db.counters[key] =
    (current + 1) % ids.length;

  saveData();

  return ids[index];
}

function queueEmbed(
  guild,
  mode,
  format,
  cents,
  players = []
) {
  const g = guildData(guild.id);
  const m = MODES[mode];

  const playerText = players.length
    ? players
        .map(
          (id, i) =>
            `${i + 1}. ${mentionUser(id)}`
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
      `👥 **JOGADORES**\n${playerText}\n\n` +
      `📊 **Vagas:** ${players.length}/2\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `⚡ **ENTRE NA FILA E AGUARDE O ADVERSÁRIO**\n` +
      `━━━━━━━━━━━━━━━━━━`
    )
    .setFooter({
      text: "🎮 Sistema de Apostas"
    });
}

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

function queueMessagePayload(
  guild,
  mode,
  format,
  cents,
  players = []
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

function findMatchById(matchId) {
  return db.matches[matchId] || null;
}

function makeMatchId(guildId) {
  const key =
    `matchNumber:${guildId}`;

  db.counters[key] =
    Number(db.counters[key] || 0) + 1;

  saveData();

  return String(
    db.counters[key]
  );
}

async function disableMessageButtons(
  message
) {
  if (!message) return;

  const components =
    message.components.map(row => {
      const newRow =
        new ActionRowBuilder();

      for (
        const component
        of row.components
      ) {
        newRow.addComponents(
          ButtonBuilder
            .from(component)
            .setDisabled(true)
        );
      }

      return newRow;
    });

  try {
    await message.edit({
      components
    });
  } catch (_) {}
}

function matchConfirmEmbed(
  guild,
  match
) {
  const g = guildData(guild.id);

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
      `Confirme sua participação. Depois que os dois confirmarem, ` +
      `o Pix do ADM responsável será exibido para o pagamento e início da aposta.`
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

function pixEmbed(guild, match) {
  const g = guildData(guild.id);
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
        `🔑 **Chave Pix:**\n\`${pix?.key || "Pix não cadastrado"}\`\n\n` +
        `📌 Após o pagamento, aguarde o Mediador/ADM criar a sala.`
      )
      .setFooter({
        text: "🎮 Sistema de Apostas"
      });

  return embed;
}

async function sendPix(
  guild,
  channel,
  match
) {
  const g = guildData(guild.id);
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
            `O ADM responsável ainda não possui nome, chave Pix e QR Code cadastrados.\n` +
            `O dono do servidor deve configurar isso em **/config → Pix**.`
          )
      ]
    });

    return;
  }

  await channel.send({
    embeds: [
      pixEmbed(
        guild,
        match
      )
    ]
  });

  if (pix.qrUrl) {
    await channel.send({
      content:
        "📷 **QR Code do Pix:**",
      files: [pix.qrUrl]
    }).catch(
      async () => {
        await channel.send(
          `📷 **QR Code:** ${pix.qrUrl}`
        );
      }
    );
  }
}

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
            (id, i) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(
                  `Jogador ${i + 1}`
                )
                .setDescription(
                  `Selecionar ${id}`
                )
                .setValue(id)
          )
        )
    );
}

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
      `📱 **Modalidade:** ${
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
      "⚠️ O canal de análise ainda não foi configurado no /config."
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
      "⚠️ O canal de análise configurado não foi encontrado."
    );

    return;
  }

  const requestId =
    `${Date.now()}-${message.author.id}`;

  const request = {
    id: requestId,
    guildId: guild.id,
    userId: message.author.id,
    mode,
    sourceChannelId:
      message.channel.id,
    createdAt: Date.now(),
    claimed: false,
    analystId: null
  };

  if (!db.analysis) {
    db.analysis = {};
  }

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
              analystCustomId(
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

async function createMatch(
  guild,
  queueChannel,
  mode,
  format,
  cents,
  players,
  message
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
    `partida-${slug(matchId)}-${slug(format)}-${slug(money(cents))}`;

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel
      ]
    },

    ...players.map(id => ({
      id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    })),

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
      `${mentions}\n👮 **Mediador:** ${mentionUser(mediatorId)}`,
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

async function handleQueueButton(
  interaction
) {
  const parts =
    interaction.customId
      .split(":");

  const action = parts[1];
  const mode = parts[2];
  const format = parts[3];
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

  if (!global.queueLocks) {
    global.queueLocks =
      new Set();
  }

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
    if (action === "leave") {
      await interaction.deferUpdate();

      const state =
        global.queues?.get(key);

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
        queueMessagePayload(
          interaction.guild,
          mode,
          format,
          cents,
          state.players
        )
      );

      return;
    }

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

    if (!global.queues) {
      global.queues =
        new Map();
    }

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

    if (
      state.players.length >= 2
    ) {
      await interaction.reply({
        content:
          "⚠️ Essa fila já está cheia.",
        ephemeral: true
      });

      return;
    }

    const otherActive =
      findActiveMatchForUser(
        interaction.user.id
      );

    if (otherActive) {
      await interaction.reply({
        content:
          "⚠️ Você já está em uma aposta ativa.",
        ephemeral: true
      });

      return;
    }

    state.players.push(
      interaction.user.id
    );

    await interaction.deferUpdate();

    if (
      state.players.length < 2
    ) {
      await interaction.message.edit(
        queueMessagePayload(
          interaction.guild,
          mode,
          format,
          cents,
          state.players
        )
      );

      return;
    }

    const players =
      [...state.players];

    state.players = [];

    const result =
      await createMatch(
        interaction.guild,
        interaction.channel,
        mode,
        format,
        cents,
        players,
        interaction.message
      );

    if (result.error) {
      state.players =
        players;

      await interaction.message.edit(
        queueMessagePayload(
          interaction.guild,
          mode,
          format,
          cents,
          state.players
        )
      );

      return;
    }

    await interaction.message.edit(
      queueMessagePayload(
        interaction.guild,
        mode,
        format,
        cents,
        []
      )
    );
  } catch (err) {
    console.error(
      "Erro na fila:",
      err
    );

    if (
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.reply({
        content:
          "❌ Ocorreu um erro ao processar a fila.",
        ephemeral: true
      }).catch(() => {});
    }
  } finally {
    global.queueLocks.delete(
      key
    );
  }
}

async function finishMatch(
  guild,
  match,
  message,
  resultType,
  winnerId = null
) {
  if (match.finalized) {
    return;
  }

  match.finalized = true;
  match.resultType =
    resultType;
  match.winnerId =
    winnerId;

  if (
    resultType === "normal" &&
    winnerId
  ) {
    const loserId =
      match.players.find(
        id => id !== winnerId
      );

    userData(
      winnerId
    ).wins += 1;

    userData(
      winnerId
    ).coins += 1;

    userData(
      loserId
    ).losses += 1;

    userData(
      winnerId
    ).normalMatches += 1;

    userData(
      loserId
    ).normalMatches += 1;
  }

  if (
    resultType === "wo" &&
    winnerId
  ) {
    userData(
      winnerId
    ).woWins += 1;
  }

  saveData();

  await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(
          safeColor(
            guildData(
              guild.id
            ).embedColor
          )
        )
        .setTitle(
          resultType === "wo"
            ? "⚡ Vitória por W.O."
            : "🏆 Aposta finalizada"
        )
        .setDescription(
          resultType === "wo"
            ? `🏆 Vencedor por W.O.: ${mentionUser(winnerId)}\n\n` +
              `Nenhuma vitória normal, derrota ou coin foi adicionada.`
            : `🏆 Vencedor: ${mentionUser(winnerId)}\n\n` +
              `✅ Vitória registrada para o vencedor.\n` +
              `❌ Derrota registrada para o adversário.\n` +
              `🪙 +1 coin para o vencedor.`
        )
    ]
  });

  await message.channel.send({
    content:
      "A aposta foi finalizada. O canal será deletado em cinco segundos."
  });

  setTimeout(() => {
    message.channel
      .delete()
      .catch(() => {});
  }, 5000);
}

function profileEmbed(
  guild,
  user
) {
  const d =
    userData(user.id);

  const total =
    d.wins + d.losses;

  const rate =
    total
      ? (
          (d.wins / total) *
          100
        ).toFixed(1)
      : "0.0";

  return new EmbedBuilder()
    .setColor(
      safeColor(
        guildData(
          guild.id
        ).embedColor
      )
    )
    .setTitle(
      `📊 PERFIL DE ${user.username.toUpperCase()}.`
    )
    .setThumbnail(
      user.displayAvatarURL({
        size: 256
      })
    )
    .setDescription(
      `🏆 **Vitórias:** ${d.wins}\n` +
      `❌ **Derrotas:** ${d.losses}\n` +
      `🚫 **Vitórias por W.O.:** ${d.woWins}\n` +
      `🪙 **Coins:** ${d.coins}\n\n` +
      `🎮 **Partidas normais:** ${d.normalMatches}\n` +
      `📈 **Aproveitamento:** ${rate}%\n\n` +
      `🎮 Sistema de Apostas`
    );
}

async function showConfig(
  interaction
) {
  const g =
    guildData(
      interaction.guildId
    );

  const embed =
    new EmbedBuilder()
      .setColor(
        safeColor(
          g.embedColor
        )
      )
      .setTitle(
        "⚙️ • CONFIGURAÇÃO"
      )
      .setDescription(
        `🎨 **Aparência**\n` +
        `Cor: \`${safeColor(g.embedColor)}\`\n\n` +
        `👥 **Cargos**\n` +
        `🛡️ Mediador: ${g.mediatorRoleId ? `<@&${g.mediatorRoleId}>` : "❌"}\n` +
        `📊 Analista: ${g.analystRoleId ? `<@&${g.analystRoleId}>` : "❌"}\n\n` +
        `📊 **Análises**\n` +
        `📱 SS Mob: ${g.analystChannel1Id ? `<#${g.analystChannel1Id}>` : "❌"}\n` +
        `💻 SS Emu: ${g.analystChannel2Id ? `<#${g.analystChannel2Id}>` : "❌"}\n\n` +
        `💳 **Pix**\n` +
        `${Object.keys(g.pix).length} ADM(s) cadastrado(s).`
      )
      .setFooter({
        text:
          "🎮 Sistema de Apostas"
      });

  await interaction.reply({
    embeds: [embed],
    components: [
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
              ButtonStyle.Secondary
            ),

          new ButtonBuilder()
            .setCustomId(
              "config:pix"
            )
            .setLabel("Pix")
            .setEmoji("💳")
            .setStyle(
              ButtonStyle.Success
            )
        )
    ],
    ephemeral: true
  });
}

async function handleConfig(
  interaction
) {
  if (!isOwner(interaction)) {
    await interaction.reply({
      content:
        "❌ Apenas o dono do servidor pode usar esta configuração.",
      ephemeral: true
    });

    return;
  }

  const action =
    interaction.customId
      .split(":")[1];

  const g =
    guildData(
      interaction.guildId
    );

  if (action === "roles") {
    await interaction.reply({
      content:
        "Escolha os cargos responsáveis:",
      components: [
        new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(
                "config:role:mediator"
              )
              .setPlaceholder(
                "Escolher cargo Mediador"
              )
              .addOptions(
                interaction.guild.roles.cache
                  .filter(
                    r =>
                      r.id !==
                      interaction.guild.id
                  )
                  .sort(
                    (a, b) =>
                      b.position -
                      a.position
                  )
                  .first(25)
                  .map(r => ({
                    label:
                      r.name.slice(
                        0,
                        100
                      ),
                    value:
                      r.id
                  }))
              )
          ),

        new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(
                "config:role:analyst"
              )
              .setPlaceholder(
                "Escolher cargo Analista"
              )
              .addOptions(
                interaction.guild.roles.cache
                  .filter(
                    r =>
                      r.id !==
                      interaction.guild.id
                  )
                  .sort(
                    (a, b) =>
                      b.position -
                      a.position
                  )
                  .first(25)
                  .map(r => ({
                    label:
                      r.name.slice(
                        0,
                        100
                      ),
                    value:
                      r.id
                  }))
              )
          )
      ],
      ephemeral: true
    });

    return;
  }

  if (action === "channels") {
    const channels =
      interaction.guild.channels.cache
        .filter(
          c =>
            c.type ===
            ChannelType.GuildText
        )
        .first(25)
        .map(c => ({
          label:
            c.name.slice(
              0,
              100
            ),
          value:
            c.id
        }));

    await interaction.reply({
      content:
        "Escolha os dois canais que receberão as solicitações de análise:",
      components: [
        new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(
                "config:channel:1"
              )
              .setPlaceholder(
                "Canal 1 • SS Mob"
              )
              .addOptions(
                channels
              )
          ),

        new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(
                "config:channel:2"
              )
              .setPlaceholder(
                "Canal 2 • SS Emu"
              )
              .addOptions(
                channels
              )
          )
      ],
      ephemeral: true
    });

    return;
  }

  if (action === "appearance") {
    await interaction.reply({
      content:
        `Cor atual: \`${safeColor(g.embedColor)}\`\n\n` +
        `Use **/configcor** para definir uma nova cor HEX.\n` +
        `Use **/configavatar** para definir a foto de perfil do bot.`,
      ephemeral: true
    });

    return;
  }

  if (action === "pix") {
    await interaction.reply({
      content:
        `💳 **Pix dos ADMs**\n\n` +
        `Use **/pixadm** para cadastrar ou atualizar um ADM.\n` +
        `O cadastro aceita nome, chave Pix e QR Code.`,
      ephemeral: true
    });
  }
}

async function handleConfigSelect(
  interaction
) {
  if (!isOwner(interaction)) {
    await interaction.reply({
      content:
        "❌ Apenas o dono.",
      ephemeral: true
    });

    return;
  }

  const parts =
    interaction.customId
      .split(":");

  const type =
    parts[1];

  const value =
    interaction.values[0];

  const g =
    guildData(
      interaction.guildId
    );

  if (type === "role") {
    if (
      parts[2] ===
      "mediator"
    ) {
      g.mediatorRoleId =
        value;
    }

    if (
      parts[2] ===
      "analyst"
    ) {
      g.analystRoleId =
        value;
    }

    saveData();

    await interaction.update({
      content:
        "✅ Configuração salva.",
      components: []
    });

    return;
  }

  if (type === "channel") {
    if (
      parts[2] === "1"
    ) {
      g.analystChannel1Id =
        value;
    }

    if (
      parts[2] === "2"
    ) {
      g.analystChannel2Id =
        value;
    }

    saveData();

    await interaction.update({
      content:
        "✅ Canal salvo.",
      components: []
    });
  }
}

async function configureQueues(
  interaction
) {
  if (!isOwner(interaction)) {
    await interaction.reply({
      content:
        "❌ Apenas o dono do servidor pode configurar filas.",
      ephemeral: true
    });

    return;
  }

  const modeMenu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "queueconfig:mode"
      )
      .setPlaceholder(
        "Escolha a modalidade"
      )
      .addOptions(
        Object.entries(
          MODES
        ).map(
          ([value, data]) => ({
            label:
              data.label,
            value,
            emoji:
              data.emoji
          })
        )
      );

  const formatMenu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "queueconfig:format"
      )
      .setPlaceholder(
        "Escolha o formato"
      )
      .addOptions(
        FORMATS.map(
          f => ({
            label: f,
            value: f
          })
        )
      );

  const channelOptions =
    interaction.guild.channels.cache
      .filter(
        c =>
          c.type ===
          ChannelType.GuildText
      )
      .first(25)
      .map(c => ({
        label:
          c.name.slice(
            0,
            100
          ),
        value:
          c.id
      }));

  await interaction.reply({
    content:
      "🎮 **Configuração de filas**\nEscolha modalidade, formato e canal.",
    components: [
      new ActionRowBuilder()
        .addComponents(
          modeMenu
        ),

      new ActionRowBuilder()
        .addComponents(
          formatMenu
        ),

      new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(
              "queueconfig:channel"
            )
            .setPlaceholder(
              "Escolha o canal das filas"
            )
            .addOptions(
              channelOptions
            )
        ),

      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              "queueconfig:create"
            )
            .setLabel(
              "Criar / atualizar filas"
            )
            .setEmoji("🎮")
            .setStyle(
              ButtonStyle.Success
            )
        )
    ],
    ephemeral: true
  });
}

async function handleQueueConfig(
  interaction
) {
  if (!isOwner(interaction)) {
    await interaction.reply({
      content:
        "❌ Apenas o dono.",
      ephemeral: true
    });

    return;
  }

  if (!global.queueConfig) {
    global.queueConfig =
      new Map();
  }

  const key =
    interaction.user.id;

  if (
    !global.queueConfig.has(
      key
    )
  ) {
    global.queueConfig.set(
      key,
      {}
    );
  }

  const state =
    global.queueConfig.get(
      key
    );

  if (
    interaction.isStringSelectMenu()
  ) {
    const type =
      interaction.customId
        .split(":")[1];

    state[type] =
      interaction.values[0];

    await interaction.update({
      content:
        `🎮 **Configuração de filas**\n` +
        `Modalidade: ${
          state.mode
            ? MODES[state.mode].label
            : "❌"
        }\n` +
        `Formato: ${
          state.format ||
          "❌"
        }\n` +
        `Canal: ${
          state.channel
            ? `<#${state.channel}>`
            : "❌"
        }`,
      components:
        interaction.message
          .components
    });

    return;
  }

  if (
    interaction.customId ===
    "queueconfig:create"
  ) {
    if (
      !state.mode ||
      !state.format ||
      !state.channel
    ) {
      await interaction.reply({
        content:
          "⚠️ Escolha modalidade, formato e canal antes de criar.",
        ephemeral: true
      });

      return;
    }

    const channel =
      interaction.guild.channels.cache.get(
        state.channel
      );

    if (
      !channel ||
      channel.type !==
        ChannelType.GuildText
    ) {
      await interaction.reply({
        content:
          "⚠️ Canal inválido.",
        ephemeral: true
      });

      return;
    }

    const g =
      guildData(
        interaction.guildId
      );

    g.queueChannels[
      `${state.mode}|${state.format}`
    ] =
      channel.id;

    saveData();

    if (!global.queues) {
      global.queues =
        new Map();
    }

    await interaction.deferUpdate();

    for (
      const v of VALUES
    ) {
      const keyQueue =
        queueKey(
          state.mode,
          state.format,
          v.cents
        );

      if (
        !global.queues.has(
          keyQueue
        )
      ) {
        global.queues.set(
          keyQueue,
          {
            players: []
          }
        );
      }

      const sent =
        await channel.send(
          queueMessagePayload(
            interaction.guild,
            state.mode,
            state.format,
            v.cents,
            global.queues.get(
              keyQueue
            ).players
          )
        );

      global.queueMessages =
        global.queueMessages ||
        new Map();

      global.queueMessages.set(
        keyQueue,
        sent.id
      );
    }

    await interaction.editReply({
      content:
        `✅ **Filas criadas com sucesso!**\n` +
        `📱 Modalidade: **${MODES[state.mode].label}**\n` +
        `🎯 Formato: **${state.format}**\n` +
        `📌 Canal: <#${state.channel}>\n` +
        `💰 ${VALUES.length} valores configurados.`,
      components: []
    });

    return;
  }
}

async function handleMatchButton(
  interaction
) {
  const parts =
    interaction.customId
      .split(":");

  const action =
    parts[1];

  const matchId =
    parts[2];

  const match =
    findMatchById(
      matchId
    );

  if (
    !match ||
    match.finalized
  ) {
    await interaction.reply({
      content:
        "⚠️ Essa aposta não está mais ativa.",
      ephemeral: true
    });

    return;
  }

  if (
    !match.players.includes(
      interaction.user.id
    ) &&
    interaction.user.id !==
      match.mediatorId
  ) {
    await interaction.reply({
      content:
        "❌ Você não participa desta aposta.",
      ephemeral: true
    });

    return;
  }

  if (
    action === "confirm"
  ) {
    if (
      match.confirmed.includes(
        interaction.user.id
      )
    ) {
      await interaction.reply({
        content:
          "✅ Você já confirmou.",
        ephemeral: true
      });

      return;
    }

    match.confirmed.push(
      interaction.user.id
    );

    saveData();

    await interaction.deferUpdate();

    const confirmText =
      match.confirmed.length ===
      2
        ? "✅ **Os dois jogadores confirmaram!**\n\n💳 O pagamento do ADM será exibido abaixo."
        : `✅ ${mentionUser(interaction.user.id)} confirmou.\n\n⏳ Aguardando o outro jogador.`;

    await interaction.message.edit({
      embeds: [
        matchConfirmEmbed(
          interaction.guild,
          match
        ).setDescription(
          matchConfirmEmbed(
            interaction.guild,
            match
          ).data.description +
          `\n\n${confirmText}`
        )
      ],
      components: [
        confirmButtons(match)
      ]
    });

    if (
      match.confirmed.length ===
      2
    ) {
      await sendPix(
        interaction.guild,
        interaction.channel,
        match
      );
    }

    return;
  }

  if (
    action === "cancel"
  ) {
    match.finalized =
      true;

    match.resultType =
      "cancelled";

    saveData();

    await interaction.deferUpdate();

    await interaction.message.edit({
      components: [
        new ActionRowBuilder()
          .addComponents(
            ButtonBuilder
              .from(
                interaction.message
                  .components[0]
                  .components[0]
              )
              .setDisabled(true),

            ButtonBuilder
              .from(
                interaction.message
                  .components[0]
                  .components[1]
              )
              .setDisabled(true)
          )
      ]
    });

    await interaction.channel.send(
      "A aposta foi cancelada. O canal será deletado em 15 segundos."
    );

    setTimeout(() => {
      interaction.channel
        .delete()
        .catch(() => {});
    }, 15000);

    return;
  }

  if (
    interaction.user.id !==
    match.mediatorId
  ) {
    await interaction.reply({
      content:
        "❌ Apenas o Mediador responsável pode usar este menu.",
      ephemeral: true
    });

    return;
  }

  if (
    action ===
    "winner-menu"
  ) {
    await interaction.reply({
      content:
        "🏆 Escolha o vencedor:",
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
    action ===
    "wo-menu"
  ) {
    await interaction.reply({
      content:
        "⚡ Escolha quem venceu por W.O.:",
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
    action ===
    "finalize"
  ) {
    await interaction.reply({
      content:
        "🔒 Finalizando a aposta...",
      ephemeral: true
    });

    await finishMatch(
      interaction.guild,
      match,
      interaction,
      "normal",
      match.winnerId ||
        match.players[0]
    );
  }
}

async function handleMatchSelect(
  interaction
) {
  const parts =
    interaction.customId
      .split(":");

  const action =
    parts[1];

  const matchId =
    parts[2];

  const match =
    findMatchById(
      matchId
    );

  if (
    !match ||
    match.finalized
  ) {
    await interaction.reply({
      content:
        "⚠️ Aposta encerrada.",
      ephemeral: true
    });

    return;
  }

  if (
    interaction.user.id !==
    match.mediatorId
  ) {
    await interaction.reply({
      content:
        "❌ Apenas o Mediador responsável.",
      ephemeral: true
    });

    return;
  }

  const winnerId =
    interaction.values[0];

  if (
    action ===
    "winner-select"
  ) {
    await interaction.update({
      content:
        `🏆 Vencedor selecionado: ${mentionUser(winnerId)}`,
      components: []
    });

    await finishMatch(
      interaction.guild,
      match,
      interaction,
      "normal",
      winnerId
    );

    return;
  }

  if (
    action ===
    "wo-select"
  ) {
    await interaction.update({
      content:
        `⚡ W.O. registrado para ${mentionUser(winnerId)}.`,
      components: []
    });

    await finishMatch(
      interaction.guild,
      match,
      interaction,
      "wo",
      winnerId
    );
  }
}

async function handleAnalysis(
  interaction
) {
  if (
    !isAnalyst(interaction)
  ) {
    await interaction.reply({
      content:
        "❌ Você não possui o cargo Analista configurado.",
      ephemeral: true
    });

    return;
  }

  const parts =
    interaction.customId
      .split(":");

  const action =
    parts[1];

  const requestId =
    parts
      .slice(2)
      .join(":");

  const request =
    db.analysis?.[
      requestId
    ];

  if (!request) {
    await interaction.reply({
      content:
        "⚠️ Solicitação não encontrada.",
      ephemeral: true
    });

    return;
  }

  if (
    action !== "claim"
  ) {
    return;
  }

  if (
    request.claimed
  ) {
    await interaction.reply({
      content:
        "⚠️ Essa análise já foi assumida.",
      ephemeral: true
    });

    return;
  }

  request.claimed =
    true;

  request.analystId =
    interaction.user.id;

  saveData();

  const guild =
    interaction.guild;

  const source =
    guild.channels.cache.get(
      request.sourceChannelId
    );

  const overwrites = [
    {
      id:
        guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel
      ]
    },

    {
      id:
        request.userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    },

    {
      id:
        interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];

  const match =
    findActiveMatchForUser(
      request.userId
    );

  if (match) {
    const playerOverwrites =
      match.players.map(
        id => ({
          id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        })
      );

    const existing =
      playerOverwrites.find(
        o =>
          o.id ===
          interaction.user.id
      );

    if (!existing) {
      playerOverwrites.push({
        id:
          interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      });
    }

    await interaction.reply({
      content:
        `✅ Análise assumida. Você será enviado para ${
          match.channelId
            ? `<#${match.channelId}>`
            : "a aposta"
        }.`,
      ephemeral: true
    });

    await guild.channels
      .fetch(
        match.channelId
      )
      .then(
        async ch => {
          await ch.permissionOverwrites.edit(
            interaction.user.id,
            {
              ViewChannel:
                true,
              SendMessages:
                true,
              ReadMessageHistory:
                true
            }
          );

          await ch.send(
            `${mentionUser(interaction.user.id)} assumiu a análise de ${mentionUser(request.userId)}.`
          );
        }
      )
      .catch(
        () => {}
      );

    await interaction.message.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(
            "#57F287"
          )
          .setTitle(
            "✅ Análise assumida"
          )
          .setDescription(
            `📊 Analista: ${mentionUser(interaction.user.id)}\n` +
            `👤 Solicitante: ${mentionUser(request.userId)}`
          )
      ],
      components: []
    });

    return;
  }

  const privateChannel =
    await guild.channels.create({
      name:
        `analise-${slug(request.userId)}`,
      type:
        ChannelType.GuildText,
      parent:
        source?.parentId ||
        undefined,
      permissionOverwrites:
        overwrites
    });

  await privateChannel.send(
    `${mentionUser(request.userId)} ${mentionUser(interaction.user.id)}\n📊 **Análise assumida.**`
  );

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(
          "#57F287"
        )
        .setTitle(
          "✅ Análise assumida"
        )
        .setDescription(
          `📊 Analista: ${mentionUser(interaction.user.id)}\n` +
          `👤 Solicitante: ${mentionUser(request.userId)}\n` +
          `🔒 Canal privado: ${privateChannel}`
        )
    ],
    components: []
  });
}

async function handlePrefix(
  message
) {
  if (
    message.author.bot ||
    !message.guild
  ) {
    return;
  }

  const content =
    message.content.trim();

  const lower =
    content.toLowerCase();

  if (
    lower === ".p" ||
    lower.startsWith(".p ")
  ) {
    if (
      !message.member.roles.cache.some(
        r =>
          r.name
            .toLowerCase() ===
          "membro"
      )
    ) {
      await message.reply(
        "❌ Você precisa ter o cargo **Membro** para usar este comando."
      );

      return;
    }

    const target =
      message.mentions.users.first() ||
      message.author;

    await message.reply({
      embeds: [
        profileEmbed(
          message.guild,
          target
        )
      ]
    });

    return;
  }

  if (
    lower === ".med"
  ) {
    if (
      !isMediator({
        guildId:
          message.guildId,
        member:
          message.member
      })
    ) {
      await message.reply(
        "❌ Você não possui o cargo Mediador."
      );

      return;
    }

    const match =
      findMatchByChannel(
        message.channel.id
      );

    if (!match) {
      await message.reply(
        "⚠️ Este canal não está vinculado a uma aposta ativa."
      );

      return;
    }

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(
            safeColor(
              guildData(
                message.guildId
              ).embedColor
            )
          )
          .setTitle(
            "👮 PAINEL DO MEDIADOR"
          )
          .setDescription(
            `Partida: **${match.id}**\n` +
            `Formato: **${match.format}**\n` +
            `Modo: **${MODES[match.mode].label}**\n` +
            `Valor: **${money(match.cents)} por jogador**`
          )
      ],
      components: [
        mediatorMenu(match)
      ]
    });

    return;
  }

  if (
    lower === ".ssmob"
  ) {
    await requestAnalysis(
      message,
      "mobile"
    );

    return;
  }

  if (
    lower === ".ssemu"
  ) {
    await requestAnalysis(
      message,
      "emu"
    );

    return;
  }
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("config")
      .setDescription(
        "Configura cargos, canais, Pix e aparência."
      ),

    new SlashCommandBuilder()
      .setName("filas")
      .setDescription(
        "Configura e publica as filas."
      ),

    new SlashCommandBuilder()
      .setName("pixadm")
      .setDescription(
        "Cadastra ou atualiza o Pix de um ADM."
      )
      .addUserOption(
        o =>
          o
            .setName("adm")
            .setDescription(
              "ADM responsável"
            )
            .setRequired(true)
      )
      .addStringOption(
        o =>
          o
            .setName("nome")
            .setDescription(
              "Nome que aparecerá no Pix"
            )
            .setRequired(true)
      )
      .addStringOption(
        o =>
          o
            .setName("chave")
            .setDescription(
              "Chave Pix"
            )
            .setRequired(true)
      )
      .addAttachmentOption(
        o =>
          o
            .setName("qrcode")
            .setDescription(
              "Imagem do QR Code"
            )
            .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("configcor")
      .setDescription(
        "Altera a cor das embeds."
      )
      .addStringOption(
        o =>
          o
            .setName("hex")
            .setDescription(
              "Cor HEX, exemplo #5865F2"
            )
            .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("configavatar")
      .setDescription(
        "Altera a foto de perfil do bot."
      )
      .addAttachmentOption(
        o =>
          o
            .setName("foto")
            .setDescription(
              "Nova foto do bot"
            )
            .setRequired(true)
      )
  ];

  await client.application.commands.set(
    commands.map(
      c => c.toJSON()
    )
  );
}

const client =
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [
      Partials.Channel
    ]
  });

client.once(
  "ready",
  async () => {
    console.log(
      `✅ Bot online como ${client.user.tag}`
    );

    try {
      await registerCommands();

      console.log(
        "✅ Comandos slash registrados."
      );
    } catch (err) {
      console.error(
        "Erro ao registrar comandos:",
        err
      );
    }
  }
);

client.on(
  "messageCreate",
  handlePrefix
);

client.on(
  "interactionCreate",
  async interaction => {
    try {
      if (
        interaction.isChatInputCommand()
      ) {
        if (
          interaction.commandName ===
          "config"
        ) {
          await showConfig(
            interaction
          );

          return;
        }

        if (
          interaction.commandName ===
          "filas"
        ) {
          await configureQueues(
            interaction
          );

          return;
        }

        if (
          interaction.commandName ===
          "pixadm"
        ) {
          if (
            !isOwner(
              interaction
            )
          ) {
            await interaction.reply({
              content:
                "❌ Apenas o dono.",
              ephemeral: true
            });

            return;
          }

          const adm =
            interaction.options.getUser(
              "adm",
              true
            );

          const name =
            interaction.options.getString(
              "nome",
              true
            );

          const key =
            interaction.options.getString(
              "chave",
              true
            );

          const attachment =
            interaction.options.getAttachment(
              "qrcode",
              false
            );

          const g =
            guildData(
              interaction.guildId
            );

          g.pix[adm.id] = {
            name,
            key,
            qrUrl:
              attachment?.url ||
              null
          };

          saveData();

          await interaction.reply({
            content:
              `✅ Pix de ${mentionUser(adm.id)} cadastrado com sucesso.`,
            ephemeral: true
          });

          return;
        }

        if (
          interaction.commandName ===
          "configcor"
        ) {
          if (
            !isOwner(
              interaction
            )
          ) {
            await interaction.reply({
              content:
                "❌ Apenas o dono.",
              ephemeral: true
            });

            return;
          }

          const hex =
            interaction.options.getString(
              "hex",
              true
            );

          if (
            !/^#[0-9A-Fa-f]{6}$/.test(
              hex
            )
          ) {
            await interaction.reply({
              content:
                "❌ Use uma cor HEX válida, exemplo: `#5865F2`.",
              ephemeral: true
            });

            return;
          }

          guildData(
            interaction.guildId
          ).embedColor =
            hex;

          saveData();

          await interaction.reply({
            content:
              `✅ Cor das embeds alterada para \`${hex}\`.`,
            ephemeral: true
          });

          return;
        }

        if (
          interaction.commandName ===
          "configavatar"
        ) {
          if (
            !isOwner(
              interaction
            )
          ) {
            await interaction.reply({
              content:
                "❌ Apenas o dono.",
              ephemeral: true
            });

            return;
          }

          const attachment =
            interaction.options.getAttachment(
              "foto",
              true
            );

          if (
            !attachment.contentType?.startsWith(
              "image/"
            )
          ) {
            await interaction.reply({
              content:
                "❌ O arquivo precisa ser uma imagem.",
              ephemeral: true
            });

            return;
          }

          await client.user.setAvatar(
            attachment.url
          );

          guildData(
            interaction.guildId
          ).botAvatar =
            attachment.url;

          saveData();

          await interaction.reply({
            content:
              "✅ Foto de perfil do bot alterada.",
            ephemeral: true
          });

          return;
        }
      }

      if (
        interaction.isButton()
      ) {
        if (
          interaction.customId.startsWith(
            "queue:"
          )
        ) {
          await handleQueueButton(
            interaction
          );

          return;
        }

        if (
          interaction.customId.startsWith(
            "match:"
          )
        ) {
          await handleMatchButton(
            interaction
          );

          return;
        }

        if (
          interaction.customId.startsWith(
            "analysis:"
          )
        ) {
          await handleAnalysis(
            interaction
          );

          return;
        }

        if (
          interaction.customId.startsWith(
            "config:"
          )
        ) {
          await handleConfig(
            interaction
          );

          return;
        }

        if (
          interaction.customId.startsWith(
            "queueconfig:"
          )
        ) {
          await handleQueueConfig(
            interaction
          );

          return;
        }
      }

      if (
        interaction.isStringSelectMenu()
      ) {
        if (
          interaction.customId.startsWith(
            "config:"
          )
        ) {
          await handleConfigSelect(
            interaction
          );

          return;
        }

        if (
          interaction.customId.startsWith(
            "queueconfig:"
          )
        ) {
          await handleQueueConfig(
            interaction
          );

          return;
        }

        if (
          interaction.customId.startsWith(
            "match:"
          )
        ) {
          await handleMatchSelect(
            interaction
          );

          return;
        }
      }
    } catch (err) {
      console.error(
        "Erro em interactionCreate:",
        err
      );

      if (
        interaction.deferred ||
        interaction.replied
      ) {
        await interaction.followUp({
          content:
            "❌ Ocorreu um erro ao processar esta ação.",
          ephemeral: true
        }).catch(
          () => {}
        );
      } else {
        await interaction.reply({
          content:
            "❌ Ocorreu um erro ao processar esta ação.",
          ephemeral: true
        }).catch(
          () => {}
        );
      }
    }
  }
);

process.on(
  "unhandledRejection",
  err =>
    console.error(
      "Unhandled rejection:",
      err
    )
);

process.on(
  "uncaughtException",
  err =>
    console.error(
      "Uncaught exception:",
      err
    )
);

client.login(TOKEN);
