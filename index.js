/**
 * index.js — Bot de filas/apostas Free Fire
 * Discord.js v14
 */

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

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
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  Events,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  SlashCommandBuilder
} = require('discord.js');

const TOKEN =
  process.env.DISCORD_TOKEN ||
  process.env.TOKEN;

if (!TOKEN) {
  console.error('❌ Falta DISCORD_TOKEN no .env');
  process.exit(1);
}

/* =========================================================
   BANCO DE DADOS
========================================================= */

const DATA_DIR =
  path.join(__dirname, 'data');

const DATA_FILE =
  path.join(DATA_DIR, 'bot.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });
}

function loadDb() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return {
        guilds: {},
        users: {}
      };
    }

    const data =
      JSON.parse(
        fs.readFileSync(
          DATA_FILE,
          'utf8'
        )
      );

    return {
      guilds: data.guilds || {},
      users: data.users || {}
    };

  } catch (error) {

    console.error(
      '❌ Erro lendo banco:',
      error
    );

    return {
      guilds: {},
      users: {}
    };
  }
}

function saveDb() {
  try {

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        db,
        null,
        2
      ),
      'utf8'
    );

  } catch (error) {

    console.error(
      '❌ Erro salvando banco:',
      error
    );
  }
}

const db = loadDb();

/* =========================================================
   VALORES DAS FILAS
========================================================= */

const VALUES = [
  0.30,
  0.50,
  0.75,
  1,
  2,
  3,
  5,
  7,
  10,
  20,
  50,
  100
];

const VALUES_ASC =
  [...VALUES].sort(
    (a, b) => a - b
  );

const VALUES_DESC =
  [...VALUES].sort(
    (a, b) => b - a
  );

/* =========================================================
   FORMATOS
========================================================= */

const FORMATS = {
  '1x1': 2,
  '2x2': 4,
  '3x3': 6,
  '4x4': 8
};

/* =========================================================
   MODALIDADES
========================================================= */

const MODALITIES = [
  'Mobile',
  'Emulador',
  'Misto'
];

/* =========================================================
   MEMÓRIA DAS FILAS E APOSTAS
========================================================= */

const queues = new Map();

const matches = new Map();

/* =========================================================
   CLIENT DISCORD
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
      Partials.Channel
    ]
  });

/* =========================================================
   CONFIGURAÇÃO PADRÃO DO SERVIDOR
========================================================= */

function defaultGuildConfig() {

  return {

    mediatorRoleId: '',

    analystRoleId: '',

    fee: 0.01,

    embedColor: '#5865F2',

    profilePicture: '',

    mobileRequestsChannelId: '',

    emulatorRequestsChannelId: '',

    mediatorQueueChannelId: '',

    betsCategoryId: '',

    pixName: '',

    pixKey: '',

    pixQrUrl: ''
  };
}

/* =========================================================
   CONFIGURAÇÃO DO SERVIDOR
========================================================= */

function getGuildConfig(
  guildId
) {

  if (!db.guilds[guildId]) {

    db.guilds[guildId] = {

      config:
        defaultGuildConfig(),

      mediatorQueue: []
    };

    saveDb();
  }

  if (
    !db.guilds[guildId].config
  ) {

    db.guilds[guildId].config =
      defaultGuildConfig();
  }

  if (
    !Array.isArray(
      db.guilds[guildId]
        .mediatorQueue
    )
  ) {

    db.guilds[guildId]
      .mediatorQueue = [];
  }

  return db.guilds[guildId];
}

/* =========================================================
   ESTATÍSTICAS DOS USUÁRIOS
========================================================= */

function getUserStats(
  guildId,
  userId
) {

  if (!db.users[guildId]) {
    db.users[guildId] = {};
  }

  if (
    !db.users[guildId][userId]
  ) {

    db.users[guildId][userId] = {

      victories: 0,

      defeats: 0,

      normalVictories: 0,

      woVictories: 0,

      coins: 0
    };
  }

  return db.users[guildId][userId];
}

/* =========================================================
   FORMATAÇÃO DE DINHEIRO
========================================================= */

function money(value) {

  return Number(value)
    .toLocaleString(
      'pt-BR',
      {
        style: 'currency',
        currency: 'BRL'
      }
    );
}

function parseMoney(text) {

  if (
    typeof text !== 'string'
  ) {

    return Number(text) || 0;
  }

  let value =
    text
      .trim()
      .replace(
        /^R\$\s*/i,
        ''
      );

  if (
    value.includes(',')
  ) {

    value =
      value
        .replace(/\./g, '')
        .replace(',', '.');
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

/* =========================================================
   UTILITÁRIOS
========================================================= */

function validColor(value) {

  return /^#[0-9a-fA-F]{6}$/.test(
    value
  );
}

function isAdmin(member) {

  return Boolean(

    member &&

    (
      member.permissions?.has(
        PermissionsBitField.Flags.Administrator
      ) ||

      member.guild?.ownerId ===
        member.id
    )
  );
}

function hasRole(
  member,
  roleId
) {

  return Boolean(

    roleId &&

    member?.roles?.cache?.has(
      roleId
    )
  );
}

function isMediator(member) {

  if (!member?.guild) {
    return false;
  }

  const cfg =
    getGuildConfig(
      member.guild.id
    ).config;

  return (

    isAdmin(member) ||

    hasRole(
      member,
      cfg.mediatorRoleId
    )
  );
}

function isAnalyst(member) {

  if (!member?.guild) {
    return false;
  }

  const cfg =
    getGuildConfig(
      member.guild.id
    ).config;

  return (

    isAdmin(member) ||

    hasRole(
      member,
      cfg.analystRoleId
    )
  );
}

/* =========================================================
   EMBEDS
========================================================= */

function makeEmbed(
  guild,
  title,
  description
) {

  const cfg =
    getGuildConfig(
      guild.id
    ).config;

  const embed =
    new EmbedBuilder()
      .setTitle(title)
      .setDescription(
        description || ''
      )
      .setColor(
        validColor(
          cfg.embedColor
        )
          ? cfg.embedColor
          : '#5865F2'
      )
      .setTimestamp();

  if (
    cfg.profilePicture
  ) {

    embed.setThumbnail(
      cfg.profilePicture
    );
  }

  return embed;
}

/* =========================================================
   RESPOSTAS DE INTERACTION
========================================================= */

async function reply(
  interaction,
  payload
) {

  if (
    interaction.deferred
  ) {

    return interaction.editReply(
      payload
    );
  }

  if (
    interaction.replied
  ) {

    return interaction.followUp(
      payload
    );
  }

  return interaction.reply(
    payload
  );
}

async function ephemeral(
  interaction,
  content
) {

  return reply(
    interaction,
    {
      content,
      ephemeral: true
    }
  );
}

/* =========================================================
   CUSTOM ID
========================================================= */

function customId(
  prefix,
  ...parts
) {

  return [
    prefix,
    ...parts
  ].join(':');
}

/* =========================================================
   DETECÇÃO DE CANAIS DO SERVIDOR
========================================================= */

function getServerChannels(
  guild
) {

  const channels =
    guild.channels.cache;

  const textChannels =
    channels.filter(
      channel =>
        channel.type ===
        ChannelType.GuildText
    );

  const categories =
    channels.filter(
      channel =>
        channel.type ===
        ChannelType.GuildCategory
    );

  return {
    all: channels,
    text: textChannels,
    categories
  };
}

function getTextChannelChoices(
  guild
) {

  const {
    text
  } =
    getServerChannels(
      guild
    );

  return [
    ...text.values()
  ];
}

function getCategoryChoices(
  guild
) {

  const {
    categories
  } =
    getServerChannels(
      guild
    );

  return [
    ...categories.values()
  ];
}

/* =========================================================
   FILAS
========================================================= */

function queueKey(
  guildId,
  format,
  modality,
  value
) {

  return [
    guildId,
    format,
    modality,
    value
  ].join('|');
}

function getQueue(
  guildId,
  format,
  modality,
  value
) {

  const key =
    queueKey(
      guildId,
      format,
      modality,
      value
    );

  if (
    !queues.has(key)
  ) {

    queues.set(
      key,
      {

        guildId,

        format,

        modality,

        value:
          Number(value),

        users: [],

        geloChoices: {},

        messageId: '',

        channelId: ''
      }
    );
  }

  return queues.get(
    key
  );
}

/* =========================================================
   LABEL DA FILA
========================================================= */

function queueLabel(q) {

  return (
    `${q.format} • ` +
    `${q.modality} • ` +
    `${money(q.value)}`
  );
}

/* =========================================================
   EMBED DA FILA
========================================================= */

function queueEmbed(
  guild,
  q
) {

  const needed =
    FORMATS[q.format];

  const users =
    q.users.length

      ? q.users
          .map(
            (id, index) => {

              let extra = '';

              if (
                q.format === '1x1' &&
                q.geloChoices[id]
              ) {

                extra =
                  ` — ${q.geloChoices[id]}`;
              }

              return (
                `${index + 1}. ` +
                `<@${id}>` +
                extra
              );
            }
          )
          .join('\n')

      : 'Ninguém na fila ainda.';

  return makeEmbed(

    guild,

    `🎮 FILA — ${queueLabel(q)}`,

    [

      `**Vagas:** ` +
      `${q.users.length}/${needed}`,

      '',

      users,

      '',

      q.format === '1x1'

        ? '🎯 Escolha **Gelo Normal** ou **Gelo Infinito** para entrar.'

        : '🎯 Clique em **Entrar na fila** para participar.',

      '',

      '💰 Valores: ' +
      '**R$0,30 embaixo → R$100,00 em cima**.'

    ].join('\n')
  );
}

/* =========================================================
   BOTÕES DAS FILAS
========================================================= */

function queueButtons(q) {

  if (
    q.format === '1x1'
  ) {

    return [

      new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(
              customId(
                'queue_join_gelo',
                q.guildId,
                q.format,
                q.modality,
                q.value,
                'Gelo Normal'
              )
            )
            .setLabel(
              'Gelo Normal'
            )
            .setStyle(
              ButtonStyle.Primary
            ),

          new ButtonBuilder()
            .setCustomId(
              customId(
                'queue_join_gelo',
                q.guildId,
                q.format,
                q.modality,
                q.value,
                'Gelo Infinito'
              )
            )
            .setLabel(
              'Gelo Infinito'
            )
            .setStyle(
              ButtonStyle.Success
            ),

          new ButtonBuilder()
            .setCustomId(
              customId(
                'queue_leave',
                q.guildId,
                q.format,
                q.modality,
                q.value,
                ''
              )
            )
            .setLabel(
              'Sair da fila'
            )
            .setStyle(
              ButtonStyle.Danger
            )
        )
    ];
  }

  return [

    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            customId(
              'queue_join',
              q.guildId,
              q.format,
              q.modality,
              q.value
            )
          )
          .setLabel(
            'Entrar na fila'
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            customId(
              'queue_leave',
              q.guildId,
              q.format,
              q.modality,
              q.value
            )
          )
          .setLabel(
            'Sair da fila'
          )
          .setStyle(
            ButtonStyle.Danger
          )
      )
  ];
}// ============================================================
// PARTE 2 — FILAS + MEDIADORES + CRIAÇÃO DA APOSTA
// ============================================================

async function refreshQueueMessage(q) {
  if (!q?.messageId || !q?.channelId) return;

  try {
    const channel = await client.channels.fetch(q.channelId);
    if (!channel || !channel.isTextBased()) return;

    const message = await channel.messages.fetch(q.messageId);
    if (!message) return;

    await message.edit({
      embeds: [queueEmbed(q)],
      components: queueButtons(q)
    });
  } catch (err) {
    console.log(
      `[FILA] Não foi possível atualizar a fila ${q.key}:`,
      err.message
    );
  }
}


// ============================================================
// FILA DE MEDIADORES
// ============================================================

function getMediatorQueue(guildId) {
  if (!queues.has(`mediators:${guildId}`)) {
    queues.set(`mediators:${guildId}`, {
      key: `mediators:${guildId}`,
      guildId,
      users: [],
      messageId: null,
      channelId: null
    });
  }

  return queues.get(`mediators:${guildId}`);
}


function mediatorQueueEmbed(guildId) {
  const cfg = getGuildConfig(guildId);
  const q = getMediatorQueue(guildId);

  const names = q.users.length
    ? q.users.map((id, index) => `${index + 1}. <@${id}>`).join("\n")
    : "Nenhum mediador disponível no momento.";

  return makeEmbed(
    cfg,
    "⚖️ FILA DE MEDIADORES",
    [
      "Somente usuários com o cargo **Mediador** podem entrar nesta fila.",
      "",
      "**Mediadores disponíveis:**",
      names,
      "",
      "A distribuição das apostas é feita automaticamente em sistema de rodízio."
    ].join("\n")
  );
}


function mediatorQueueButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mediator_join")
        .setLabel("Entrar")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("mediator_leave")
        .setLabel("Sair")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}


async function publishMediatorQueue(guild) {
  const cfg = getGuildConfig(guild.id);

  if (!cfg.mediatorChannelId) {
    console.log(
      `[MEDIADORES] Canal de mediadores não configurado no servidor ${guild.name}`
    );
    return;
  }

  let channel;

  try {
    channel = await guild.channels.fetch(cfg.mediatorChannelId);
  } catch {
    channel = null;
  }

  if (!channel || !channel.isTextBased()) {
    console.log(
      `[MEDIADORES] Canal configurado não foi encontrado no servidor ${guild.name}`
    );
    return;
  }

  const q = getMediatorQueue(guild.id);

  try {
    if (q.messageId && q.channelId === channel.id) {
      const oldMessage = await channel.messages
        .fetch(q.messageId)
        .catch(() => null);

      if (oldMessage) {
        await oldMessage.edit({
          embeds: [mediatorQueueEmbed(guild.id)],
          components: mediatorQueueButtons()
        });

        return oldMessage;
      }
    }
  } catch {}

  const message = await channel.send({
    embeds: [mediatorQueueEmbed(guild.id)],
    components: mediatorQueueButtons()
  });

  q.messageId = message.id;
  q.channelId = channel.id;

  return message;
}


// ============================================================
// RODÍZIO DOS MEDIADORES
// ============================================================

function nextMediator(guildId) {
  const q = getMediatorQueue(guildId);

  if (!q.users.length) {
    return null;
  }

  const mediatorId = q.users.shift();

  q.users.push(mediatorId);

  return mediatorId;
}


// ============================================================
// CRIAÇÃO DA APOSTA A PARTIR DA FILA
// ============================================================

async function createBetFromQueue(q) {
  if (!q || !q.players) return false;

  const neededPlayers = FORMATS[q.format];

  if (!neededPlayers) return false;

  if (q.players.length < neededPlayers) {
    return false;
  }

  // ----------------------------------------------------------
  // 1x1
  // ----------------------------------------------------------
  //
  // Existe uma única fila visual para cada valor.
  // Cada jogador escolhe Gelo Normal ou Gelo Infinito.
  //
  // Para evitar inventar uma regra de combinação, só iniciamos
  // uma partida quando os jogadores disponíveis possuem a mesma
  // escolha de gelo.
  //
  // ----------------------------------------------------------

  let selectedPlayers = null;
  let selectedGelo = null;

  if (q.format === "1x1") {
    const normalPlayers = q.players.filter(
      id => q.geloChoices?.[id] === "Gelo Normal"
    );

    const infinitoPlayers = q.players.filter(
      id => q.geloChoices?.[id] === "Gelo Infinito"
    );

    if (normalPlayers.length >= 2) {
      selectedPlayers = normalPlayers.slice(0, 2);
      selectedGelo = "Gelo Normal";
    } else if (infinitoPlayers.length >= 2) {
      selectedPlayers = infinitoPlayers.slice(0, 2);
      selectedGelo = "Gelo Infinito";
    } else {
      return false;
    }
  } else {
    selectedPlayers = q.players.slice(0, neededPlayers);
    selectedGelo = null;
  }

  // ----------------------------------------------------------
  // MODALIDADE
  // ----------------------------------------------------------

  let mediatorId = null;

  if (q.modality === "Emulador") {
    mediatorId = nextMediator(q.guildId);

    if (!mediatorId) {
      return false;
    }
  }

  // ----------------------------------------------------------
  // REMOVE OS JOGADORES DA FILA
  // ----------------------------------------------------------

  for (const userId of selectedPlayers) {
    const index = q.players.indexOf(userId);

    if (index !== -1) {
      q.players.splice(index, 1);
    }

    if (q.geloChoices) {
      delete q.geloChoices[userId];
    }
  }

  await refreshQueueMessage(q);

  // ----------------------------------------------------------
  // CRIA CANAL PRIVADO
  // ----------------------------------------------------------

  try {
    await createPrivateBetChannel({
      guildId: q.guildId,
      format: q.format,
      modality: q.modality,
      value: q.value,
      gelo: selectedGelo,
      players: selectedPlayers,
      mediatorId
    });

    return true;
  } catch (err) {
    console.error(
      "[APOSTA] Erro ao criar aposta:",
      err
    );

    // Devolve os jogadores à fila caso ocorra erro.
    for (const userId of selectedPlayers) {
      if (!q.players.includes(userId)) {
        q.players.push(userId);
      }

      if (q.format === "1x1") {
        q.geloChoices[userId] = selectedGelo;
      }
    }

    if (mediatorId) {
      const mediatorQueue = getMediatorQueue(q.guildId);

      const index = mediatorQueue.users.indexOf(mediatorId);

      if (index !== -1) {
        mediatorQueue.users.splice(index, 1);
        mediatorQueue.users.unshift(mediatorId);
      }
    }

    await refreshQueueMessage(q);

    return false;
  }
}


// ============================================================
// BOTÃO DA FILA
// ============================================================

async function handleQueueButton(interaction) {
  const parts = interaction.customId.split(":");

  if (parts.length < 3) {
    return;
  }

  const action = parts[0];
  const format = parts[1];
  const value = Number(parts[2]);

  const guildId = interaction.guildId;

  if (!guildId) {
    return interaction.reply({
      content: "❌ Essa fila só pode ser usada dentro de um servidor.",
      ephemeral: true
    });
  }

  const q = getQueue(
    guildId,
    format,
    interaction.message?.embeds?.[0]?.fields
      ?.find(f => f.name === "Modalidade")
      ?.value
      ?.replace(/\*/g, "") || "Mobile",
    value
  );

  // ----------------------------------------------------------
  // ENTRAR 1x1 — GELO NORMAL
  // ----------------------------------------------------------

  if (action === "queue_gelo_normal") {
    if (format !== "1x1") {
      return interaction.reply({
        content: "❌ Essa opção só existe para a fila 1x1.",
        ephemeral: true
      });
    }

    if (q.players.includes(interaction.user.id)) {
      q.geloChoices[interaction.user.id] = "Gelo Normal";

      await interaction.reply({
        content: "✅ Sua escolha foi alterada para **Gelo Normal**.",
        ephemeral: true
      });

      await refreshQueueMessage(q);
      await createBetFromQueue(q);
      return;
    }

    q.players.push(interaction.user.id);
    q.geloChoices[interaction.user.id] = "Gelo Normal";

    await interaction.reply({
      content: "✅ Você entrou na fila **1x1 — Gelo Normal**.",
      ephemeral: true
    });

    await refreshQueueMessage(q);
    await createBetFromQueue(q);
    return;
  }


  // ----------------------------------------------------------
  // ENTRAR 1x1 — GELO INFINITO
  // ----------------------------------------------------------

  if (action === "queue_gelo_infinito") {
    if (format !== "1x1") {
      return interaction.reply({
        content: "❌ Essa opção só existe para a fila 1x1.",
        ephemeral: true
      });
    }

    if (q.players.includes(interaction.user.id)) {
      q.geloChoices[interaction.user.id] = "Gelo Infinito";

      await interaction.reply({
        content: "✅ Sua escolha foi alterada para **Gelo Infinito**.",
        ephemeral: true
      });

      await refreshQueueMessage(q);
      await createBetFromQueue(q);
      return;
    }

    q.players.push(interaction.user.id);
    q.geloChoices[interaction.user.id] = "Gelo Infinito";

    await interaction.reply({
      content: "✅ Você entrou na fila **1x1 — Gelo Infinito**.",
      ephemeral: true
    });

    await refreshQueueMessage(q);
    await createBetFromQueue(q);
    return;
  }


  // ----------------------------------------------------------
  // ENTRAR NAS FILAS 2x2 / 3x3 / 4x4
  // ----------------------------------------------------------

  if (action === "queue_join") {
    if (format === "1x1") {
      return interaction.reply({
        content: "❌ No 1x1 escolha **Gelo Normal** ou **Gelo Infinito**.",
        ephemeral: true
      });
    }

    if (q.players.includes(interaction.user.id)) {
      return interaction.reply({
        content: "⚠️ Você já está nessa fila.",
        ephemeral: true
      });
    }

    q.players.push(interaction.user.id);

    await interaction.reply({
      content: `✅ Você entrou na fila **${format}**.`,
      ephemeral: true
    });

    await refreshQueueMessage(q);
    await createBetFromQueue(q);
    return;
  }


  // ----------------------------------------------------------
  // SAIR DA FILA
  // ----------------------------------------------------------

  if (action === "queue_leave") {
    const index = q.players.indexOf(interaction.user.id);

    if (index === -1) {
      return interaction.reply({
        content: "⚠️ Você não está nessa fila.",
        ephemeral: true
      });
    }

    q.players.splice(index, 1);

    if (q.geloChoices) {
      delete q.geloChoices[interaction.user.id];
    }

    await interaction.reply({
      content: "✅ Você saiu da fila.",
      ephemeral: true
    });

    await refreshQueueMessage(q);
    return;
  }
}


// ============================================================
// BOTÕES DA FILA DE MEDIADORES
// ============================================================

async function handleMediatorQueueButton(interaction) {
  const guildId = interaction.guildId;

  if (!guildId) {
    return interaction.reply({
      content: "❌ Essa fila só pode ser usada dentro de um servidor.",
      ephemeral: true
    });
  }

  const cfg = getGuildConfig(guildId);

  // SOMENTE quem possui o cargo Mediador.
  if (
    !cfg.mediatorRoleId ||
    !interaction.member.roles.cache.has(cfg.mediatorRoleId)
  ) {
    return interaction.reply({
      content: "❌ Somente usuários com o cargo **Mediador** podem usar essa fila.",
      ephemeral: true
    });
  }

  const q = getMediatorQueue(guildId);
  const userId = interaction.user.id;

  if (interaction.customId === "mediator_join") {
    if (q.users.includes(userId)) {
      return interaction.reply({
        content: "⚠️ Você já está na fila de mediadores.",
        ephemeral: true
      });
    }

    q.users.push(userId);

    await interaction.reply({
      content: "✅ Você entrou na fila de mediadores.",
      ephemeral: true
    });

    try {
      await interaction.message.edit({
        embeds: [mediatorQueueEmbed(guildId)],
        components: mediatorQueueButtons()
      });
    } catch {}

    return;
  }

  if (interaction.customId === "mediator_leave") {
    const index = q.users.indexOf(userId);

    if (index === -1) {
      return interaction.reply({
        content: "⚠️ Você não está na fila de mediadores.",
        ephemeral: true
      });
    }

    q.users.splice(index, 1);

    await interaction.reply({
      content: "✅ Você saiu da fila de mediadores.",
      ephemeral: true
    });

    try {
      await interaction.message.edit({
        embeds: [mediatorQueueEmbed(guildId)],
        components: mediatorQueueButtons()
      });
    } catch {}

    return;
  }
}


// ============================================================
// NOME DO CANAL DA APOSTA
// ============================================================

function getMatchChannelName(value) {
  const total = Number(value) * 2;

  return `aposta-${money(total)
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", "-")}`;
}


// ============================================================
// CRIAÇÃO DO CANAL PRIVADO
// ============================================================

async function createPrivateBetChannel(data) {
  const {
    guildId,
    format,
    modality,
    value,
    gelo,
    players,
    mediatorId
  } = data;

  const guild = await client.guilds.fetch(guildId);
  const cfg = getGuildConfig(guildId);

  if (!cfg.betsCategoryId) {
    throw new Error("Categoria das apostas não configurada.");
  }

  const category = await guild.channels
    .fetch(cfg.betsCategoryId)
    .catch(() => null);

  if (!category) {
    throw new Error("Categoria das apostas não encontrada.");
  }

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    }
  ];

  for (const userId of players) {
    overwrites.push({
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  if (mediatorId) {
    overwrites.push({
      id: mediatorId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  if (cfg.adminRoleId) {
    overwrites.push({
      id: cfg.adminRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  const channel = await guild.channels.create({
    name: getMatchChannelName(value),
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites
  });

  const matchId = `${guildId}-${channel.id}`;

  const match = {
    id: matchId,
    guildId,
    channelId: channel.id,
    format,
    modality,
    value: Number(value),
    gelo: gelo || null,
    players: [...players],
    confirmed: [],
    mediatorId: mediatorId || null,
    roomId: null,
    roomPassword: null,
    roomStarted: false,
    roomTimerStarted: false,
    status: "waiting_confirmation",
    createdAt: Date.now()
  };

  matches.set(matchId, match);

  await sendBetConfirmation(channel, match);

  return match;
}


// ============================================================
// EMBED DE CONFIRMAÇÃO
// ============================================================

function betConfirmationEmbed(match) {
  const cfg = getGuildConfig(match.guildId);

  const lines = [
    `**Formato:** ${match.format}`,
    `**Modalidade:** ${match.modality}`,
    `**Valor:** ${money(match.value)}`
  ];

  if (match.gelo) {
    lines.push(`**Gelo:** ${match.gelo}`);
  }

  lines.push(
    "",
    "**Jogadores:**",
    match.players.map(id => `• <@${id}>`).join("\n"),
    "",
    "Cada jogador deve confirmar a aposta.",
    "Após todos confirmarem, o pagamento via Pix será liberado."
  );

  return makeEmbed(
    cfg,
    "🎮 NOVA APOSTA",
    lines.join("\n")
  );
}


function confirmationButtons(match) {
  const confirmed = match.confirmed || [];

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bet_confirm:${match.id}`)
        .setLabel(
          confirmed.includes(match.players[0])
            ? "Confirmado"
            : "Confirmar"
        )
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`bet_cancel:${match.id}`)
        .setLabel("Cancelar")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}


// ============================================================
// ENVIA CONFIRMAÇÃO
// ============================================================

async function sendBetConfirmation(channel, match) {
  await channel.send({
    embeds: [betConfirmationEmbed(match)],
    components: confirmationButtons(match)
  });
}


// ============================================================
// CONFIRMAR APOSTA
// ============================================================

async function confirmBet(interaction, matchId) {
  const match = matches.get(matchId);

  if (!match) {
    return interaction.reply({
      content: "❌ Essa aposta não existe mais.",
      ephemeral: true
    });
  }

  if (!match.players.includes(interaction.user.id)) {
    return interaction.reply({
      content: "❌ Você não participa dessa aposta.",
      ephemeral: true
    });
  }

  if (match.status !== "waiting_confirmation") {
    return interaction.reply({
      content: "⚠️ Essa aposta não está aguardando confirmação.",
      ephemeral: true
    });
  }

  if (!match.confirmed.includes(interaction.user.id)) {
    match.confirmed.push(interaction.user.id);
  }

  await interaction.reply({
    content: "✅ Sua participação foi confirmada.",
    ephemeral: true
  });

  const channel = interaction.channel;

  // Atualiza o botão para mostrar confirmação.
  try {
    const messages = await channel.messages.fetch({ limit: 20 });

    const confirmationMessage = messages.find(msg =>
      msg.components?.some(row =>
        row.components?.some(component =>
          component.customId === `bet_confirm:${match.id}`
        )
      )
    );

    if (confirmationMessage) {
      await confirmationMessage.edit({
        embeds: [betConfirmationEmbed(match)],
        components: confirmationButtons(match)
      });
    }
  } catch {}

  // Ainda falta alguém confirmar.
  if (match.confirmed.length < match.players.length) {
    return;
  }

  // Todos confirmaram.
  match.status = "waiting_payment";

  await channel.send({
    embeds: [
      makeEmbed(
        getGuildConfig(match.guildId),
        "💰 APOSTA CONFIRMADA",
        [
          "Todos os jogadores confirmaram.",
          "",
          "Agora realize o pagamento utilizando os dados Pix abaixo."
        ].join("\n")
      )
    ]
  });

  await sendPix(channel, match);

  startRoomTimer(match);
}


// ============================================================
// CANCELAR APOSTA
// ============================================================

async function cancelBet(interaction, matchId) {
  const match = matches.get(matchId);

  if (!match) {
    return interaction.reply({
      content: "❌ Essa aposta não existe mais.",
      ephemeral: true
    });
  }

  if (!match.players.includes(interaction.user.id)) {
    return interaction.reply({
      content: "❌ Você não participa dessa aposta.",
      ephemeral: true
    });
  }

  if (
    match.status === "finished" ||
    match.status === "cancelled"
  ) {
    return interaction.reply({
      content: "⚠️ Essa aposta já foi encerrada.",
      ephemeral: true
    });
  }

  match.status = "cancelled";

  await interaction.reply({
    content: "🗑️ A aposta foi cancelada. Este canal será excluído em 5 segundos.",
    ephemeral: true
  });

  setTimeout(async () => {
    matches.delete(matchId);

    try {
      const channel = await client.channels
        .fetch(match.channelId)
        .catch(() => null);

      if (channel) {
        await channel.delete("Aposta cancelada");
      }
    } catch (err) {
      console.log(
        "[APOSTA] Erro ao excluir canal:",
        err.message
      );
    }
  }, 5000);
}


// ============================================================
// PIX
// ============================================================

async function sendPix(channel, match) {
  const cfg = getGuildConfig(match.guildId);

  const lines = [
    `**Nome:** ${cfg.pixName || "Não configurado"}`,
    `**Chave Pix:** ${cfg.pixKey || "Não configurada"}`,
    "",
    `**Valor por jogador:** ${money(match.value)}`,
    `**Total da aposta:** ${money(match.value * match.players.length)}`
  ];

  const embed = makeEmbed(
    cfg,
    "💠 PAGAMENTO VIA PIX",
    lines.join("\n")
  );

  if (cfg.pixQrCode) {
    embed.setImage(cfg.pixQrCode);
  }

  await channel.send({
    embeds: [embed]
  });
}


// ============================================================
// TIMER DA SALA
// ============================================================

function startRoomTimer(match) {
  if (match.roomTimerStarted) return;

  match.roomTimerStarted = true;

  const delay =
    Math.floor(
      Math.random() * (5 * 60 * 1000 - 3 * 60 * 1000 + 1)
    ) +
    3 * 60 * 1000;

  match.roomStartAt = Date.now() + delay;

  setTimeout(async () => {
    const current = matches.get(match.id);

    if (!current) return;

    if (
      current.status === "cancelled" ||
      current.status === "finished"
    ) {
      return;
    }

    current.roomStarted = true;
    current.status = "room_waiting";

    try {
      const channel = await client.channels
        .fetch(current.channelId)
        .catch(() => null);

      if (!channel) return;

      await channel.send({
        embeds: [
          makeEmbed(
            getGuildConfig(current.guildId),
            "🎮 SALA PRONTA",
            [
              "A sala está pronta.",
              "",
              "O mediador deve enviar o **ID** e a **senha** da sala neste canal."
            ].join("\n")
          )
        ]
      });
    } catch (err) {
      console.log(
        "[SALA] Erro ao avisar sala:",
        err.message
      );
    }
  }, delay);
}// ============================================================
// PARTE 3 — SALA + MEDIADOR + RESULTADO + ESTATÍSTICAS
// ============================================================


// ============================================================
// IDENTIFICAR ID E SENHA DA SALA
// ============================================================

function extractRoomData(content) {
  if (!content) return null;

  const text = content.trim();

  let roomId = null;
  let roomPassword = null;

  // ID / ID da sala / Sala
  const idMatch = text.match(
    /(?:id\s*(?:da\s*)?sala|id|sala)\s*[:=-]?\s*(\d{4,15})/i
  );

  if (idMatch) {
    roomId = idMatch[1];
  }

  // Senha / senha da sala / password
  const passwordMatch = text.match(
    /(?:senha\s*(?:da\s*)?sala|senha|password|pass)\s*[:=-]?\s*([A-Za-z0-9_-]{2,30})/i
  );

  if (passwordMatch) {
    roomPassword = passwordMatch[1];
  }

  // Caso o mediador envie somente dois valores:
  // 12345678 1234
  if (!roomId && !roomPassword) {
    const numbers = text.match(/\b\d+\b/g);

    if (numbers && numbers.length >= 2) {
      roomId = numbers[0];
      roomPassword = numbers[1];
    }
  }

  if (!roomId || !roomPassword) {
    return null;
  }

  return {
    roomId,
    roomPassword
  };
}


// ============================================================
// BOTÕES PARA COPIAR ID E SENHA
// ============================================================

function roomCopyButtons(match) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`room_copy_id:${match.id}`)
        .setLabel("Copiar ID")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`room_copy_password:${match.id}`)
        .setLabel("Copiar Senha")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}


// ============================================================
// PUBLICAR DADOS DA SALA
// ============================================================

async function publishRoomData(match, roomData) {
  const cfg = getGuildConfig(match.guildId);

  match.roomId = roomData.roomId;
  match.roomPassword = roomData.roomPassword;
  match.status = "room_ready";

  const embed = makeEmbed(
    cfg,
    "🎮 SALA DA PARTIDA",
    [
      `**ID da sala:** \`${match.roomId}\``,
      `**Senha:** \`${match.roomPassword}\``,
      "",
      `**Formato:** ${match.format}`,
      `**Modalidade:** ${match.modality}`,
      `**Valor:** ${money(match.value)}`,
      "",
      "Utilize os botões abaixo para copiar os dados da sala."
    ].join("\n")
  );

  const channel = await client.channels
    .fetch(match.channelId)
    .catch(() => null);

  if (!channel) return;

  await channel.send({
    embeds: [embed],
    components: roomCopyButtons(match)
  });
}


// ============================================================
// MENU DO MEDIADOR
// ============================================================

function mediatorMenuEmbed(match) {
  const cfg = getGuildConfig(match.guildId);

  return makeEmbed(
    cfg,
    "⚖️ PAINEL DO MEDIADOR",
    [
      `**Aposta:** ${money(match.value)}`,
      `**Formato:** ${match.format}`,
      `**Modalidade:** ${match.modality}`,
      "",
      "**Jogadores:**",
      match.players.map(id => `• <@${id}>`).join("\n"),
      "",
      "Escolha uma das opções abaixo para administrar o resultado da partida."
    ].join("\n")
  );
}


function mediatorMenuButtons(match) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`med_winner:${match.id}`)
        .setLabel("Escolher vencedor")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`med_wo:${match.id}`)
        .setLabel("Vitória por W.O.")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`med_finish:${match.id}`)
        .setLabel("Finalizar aposta")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}


async function sendMediatorMenu(channel, match) {
  await channel.send({
    embeds: [mediatorMenuEmbed(match)],
    components: mediatorMenuButtons(match)
  });
}


// ============================================================
// .MED
// ============================================================

async function commandMed(message) {
  const guildId = message.guildId;

  if (!guildId) {
    return;
  }

  const cfg = getGuildConfig(guildId);

  // Somente quem possui o cargo Mediador.
  if (
    !cfg.mediatorRoleId ||
    !message.member.roles.cache.has(cfg.mediatorRoleId)
  ) {
    return message.reply({
      content: "❌ Somente usuários com o cargo **Mediador** podem usar `.med`."
    });
  }

  const match = [...matches.values()].find(
    m =>
      m.guildId === guildId &&
      m.channelId === message.channel.id &&
      m.status !== "cancelled" &&
      m.status !== "finished"
  );

  if (!match) {
    return message.reply({
      content: "❌ Não existe uma aposta ativa neste canal."
    });
  }

  if (match.mediatorId && match.mediatorId !== message.author.id) {
    return message.reply({
      content: "❌ Você não é o mediador responsável por esta aposta."
    });
  }

  await sendMediatorMenu(message.channel, match);
}


// ============================================================
// MENU DE ESCOLHA DO VENCEDOR
// ============================================================

function winnerMenu(match) {
  const cfg = getGuildConfig(match.guildId);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`med_winner_select:${match.id}`)
    .setPlaceholder("Selecione o vencedor");

  for (const playerId of match.players) {
    menu.addOptions({
      label: `Jogador ${playerId}`,
      description: `Selecionar <@${playerId}> como vencedor`,
      value: playerId
    });
  }

  return {
    embeds: [
      makeEmbed(
        cfg,
        "🏆 ESCOLHER VENCEDOR",
        "Selecione abaixo o jogador que venceu a partida."
      )
    ],
    components: [
      new ActionRowBuilder().addComponents(menu)
    ]
  };
}


// ============================================================
// MENU DE W.O.
// ============================================================

function woMenu(match) {
  const cfg = getGuildConfig(match.guildId);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`med_wo_select:${match.id}`)
    .setPlaceholder("Selecione quem venceu por W.O.");

  for (const playerId of match.players) {
    menu.addOptions({
      label: `Jogador ${playerId}`,
      description: `Dar vitória por W.O. para <@${playerId}>`,
      value: playerId
    });
  }

  return {
    embeds: [
      makeEmbed(
        cfg,
        "🚫 VITÓRIA POR W.O.",
        "Selecione o jogador que venceu por W.O."
      )
    ],
    components: [
      new ActionRowBuilder().addComponents(menu)
    ]
  };
}


// ============================================================
// REGISTRAR VITÓRIA NORMAL
// ============================================================

function registerNormalVictory(match, winnerId) {
  const loserId = match.players.find(
    id => id !== winnerId
  );

  if (!loserId) {
    return false;
  }

  const winnerStats = getUserStats(
    match.guildId,
    winnerId
  );

  const loserStats = getUserStats(
    match.guildId,
    loserId
  );

  // Vencedor:
  // +1 vitória
  // +1 vitória normal
  // +1 moeda
  winnerStats.victories += 1;
  winnerStats.normalVictories += 1;
  winnerStats.coins += 1;

  // Perdedor:
  // +1 derrota
  loserStats.defeats += 1;

  saveDb();

  return true;
}


// ============================================================
// REGISTRAR W.O.
// ============================================================

function registerWOVictory(match, winnerId) {
  const winnerStats = getUserStats(
    match.guildId,
    winnerId
  );

  // IMPORTANTE:
  // W.O. NÃO soma vitória normal.
  // W.O. NÃO soma moeda.
  // W.O. NÃO soma derrota para o adversário.
  //
  // Apenas:
  // +1 vitória por W.O.

  winnerStats.woVictories += 1;

  saveDb();

  return true;
}


// ============================================================
// ESCOLHA DO VENCEDOR
// ============================================================

async function handleWinnerSelect(interaction) {
  const matchId = interaction.customId.split(":")[1];
  const match = matches.get(matchId);

  if (!match) {
    return interaction.reply({
      content: "❌ Essa aposta não existe mais.",
      ephemeral: true
    });
  }

  if (!match.mediatorId || match.mediatorId !== interaction.user.id) {
    return interaction.reply({
      content: "❌ Você não é o mediador desta aposta.",
      ephemeral: true
    });
  }

  const winnerId = interaction.values[0];

  if (!match.players.includes(winnerId)) {
    return interaction.reply({
      content: "❌ Jogador inválido.",
      ephemeral: true
    });
  }

  if (match.status === "finished") {
    return interaction.reply({
      content: "⚠️ Essa aposta já foi finalizada.",
      ephemeral: true
    });
  }

  match.resultType = "normal";
  match.winnerId = winnerId;
  match.status = "result_registered";

  registerNormalVictory(match, winnerId);

  await interaction.reply({
    embeds: [
      makeEmbed(
        getGuildConfig(match.guildId),
        "🏆 VITÓRIA REGISTRADA",
        [
          `Vencedor: <@${winnerId}>`,
          "",
          "Foi registrada uma **vitória normal**.",
          "",
          "• +1 Vitória",
          "• +1 Vitória Normal",
          "• +1 Moeda",
          "",
          "O adversário recebeu +1 derrota."
        ].join("\n")
      )
    ]
  });
}


// ============================================================
// ESCOLHA DO W.O.
// ============================================================

async function handleWOSelect(interaction) {
  const matchId = interaction.customId.split(":")[1];
  const match = matches.get(matchId);

  if (!match) {
    return interaction.reply({
      content: "❌ Essa aposta não existe mais.",
      ephemeral: true
    });
  }

  if (!match.mediatorId || match.mediatorId !== interaction.user.id) {
    return interaction.reply({
      content: "❌ Você não é o mediador desta aposta.",
      ephemeral: true
    });
  }

  const winnerId = interaction.values[0];

  if (!match.players.includes(winnerId)) {
    return interaction.reply({
      content: "❌ Jogador inválido.",
      ephemeral: true
    });
  }

  if (match.status === "finished") {
    return interaction.reply({
      content: "⚠️ Essa aposta já foi finalizada.",
      ephemeral: true
    });
  }

  match.resultType = "wo";
  match.winnerId = winnerId;
  match.status = "result_registered";

  registerWOVictory(match, winnerId);

  await interaction.reply({
    embeds: [
      makeEmbed(
        getGuildConfig(match.guildId),
        "🚫 W.O. REGISTRADO",
        [
          `Vencedor por W.O.: <@${winnerId}>`,
          "",
          "Foi registrada apenas uma **Vitória por W.O.**.",
          "",
          "Nenhuma vitória normal, moeda ou derrota foi adicionada."
        ].join("\n")
      )
    ]
  });
}


// ============================================================
// FINALIZAR APOSTA
// ============================================================

async function finalizeBet(interaction, matchId) {
  const match = matches.get(matchId);

  if (!match) {
    return interaction.reply({
      content: "❌ Essa aposta não existe mais.",
      ephemeral: true
    });
  }

  if (!match.mediatorId || match.mediatorId !== interaction.user.id) {
    return interaction.reply({
      content: "❌ Você não é o mediador desta aposta.",
      ephemeral: true
    });
  }

  if (match.status === "finished") {
    return interaction.reply({
      content: "⚠️ Essa aposta já foi finalizada.",
      ephemeral: true
    });
  }

  if (!match.resultType || !match.winnerId) {
    return interaction.reply({
      content: "❌ Primeiro registre o vencedor ou o W.O.",
      ephemeral: true
    });
  }

  match.status = "finished";
  match.finishedAt = Date.now();

  const cfg = getGuildConfig(match.guildId);

  await interaction.reply({
    embeds: [
      makeEmbed(
        cfg,
        "✅ APOSTA FINALIZADA",
        [
          `**Vencedor:** <@${match.winnerId}>`,
          `**Resultado:** ${
            match.resultType === "wo"
              ? "Vitória por W.O."
              : "Vitória normal"
          }`,
          "",
          "A aposta foi finalizada com sucesso."
        ].join("\n")
      )
    ]
  });
}


// ============================================================
// ESTATÍSTICAS PÚBLICAS
// ============================================================

function publicStatsEmbed(guildId, user) {
  const stats = getUserStats(
    guildId,
    user.id
  );

  const cfg = getGuildConfig(guildId);

  return makeEmbed(
    cfg,
    `📊 ESTATÍSTICAS — ${user.username}`,
    [
      `**Vitórias:** ${stats.victories}`,
      `**Derrotas:** ${stats.defeats}`,
      `**Vitórias normais:** ${stats.normalVictories}`,
      `**Vitórias por W.O.:** ${stats.woVictories}`,
      `**Moedas:** ${stats.coins}`
    ].join("\n")
  );
}


async function commandPublicStats(message) {
  const user = message.mentions.users.first() || message.author;

  await message.reply({
    embeds: [
      publicStatsEmbed(
        message.guild.id,
        user
      )
    ]
  });
}


// ============================================================
// BOTÃO "ESCOLHER VENCEDOR"
// ============================================================

async function handleMediatorButton(interaction) {
  const [action, matchId] = interaction.customId.split(":");

  const match = matches.get(matchId);

  if (!match) {
    return interaction.reply({
      content: "❌ Essa aposta não existe mais.",
      ephemeral: true
    });
  }

  if (
    !match.mediatorId ||
    match.mediatorId !== interaction.user.id
  ) {
    return interaction.reply({
      content: "❌ Você não é o mediador desta aposta.",
      ephemeral: true
    });
  }

  if (action === "med_winner") {
    return interaction.reply(winnerMenu(match));
  }

  if (action === "med_wo") {
    return interaction.reply(woMenu(match));
  }

  if (action === "med_finish") {
    return finalizeBet(
      interaction,
      matchId
    );
  }
}


// ============================================================
// BOTÕES DE COPIAR ID / SENHA
// ============================================================

async function handleRoomCopyButton(interaction) {
  const [action, matchId] = interaction.customId.split(":");

  const match = matches.get(matchId);

  if (!match) {
    return interaction.reply({
      content: "❌ Essa aposta não existe mais.",
      ephemeral: true
    });
  }

  if (action === "room_copy_id") {
    return interaction.reply({
      content: `📋 ID da sala: \`${match.roomId}\``,
      ephemeral: true
    });
  }

  if (action === "room_copy_password") {
    return interaction.reply({
      content: `📋 Senha da sala: \`${match.roomPassword}\``,
      ephemeral: true
    });
  }
}// ============================================================
// PARTE 4 — CONFIGURAÇÃO DO BOT
// ============================================================


// ============================================================
// EMBED PRINCIPAL DO /CONFIG
// ============================================================

function configMainEmbed(guildId) {
  const cfg = getGuildConfig(guildId);

  const mediatorRole =
    cfg.mediatorRoleId
      ? `<@&${cfg.mediatorRoleId}>`
      : "Não configurado";

  const analystRole =
    cfg.analystRoleId
      ? `<@&${cfg.analystRoleId}>`
      : "Não configurado";

  const mobileChannel =
    cfg.mobileChannelId
      ? `<#${cfg.mobileChannelId}>`
      : "Não configurado";

  const emulatorChannel =
    cfg.emulatorChannelId
      ? `<#${cfg.emulatorChannelId}>`
      : "Não configurado";

  const mediatorChannel =
    cfg.mediatorChannelId
      ? `<#${cfg.mediatorChannelId}>`
      : "Não configurado";

  const category =
    cfg.betsCategoryId
      ? `<#${cfg.betsCategoryId}>`
      : "Não configurada";

  return makeEmbed(
    cfg,
    "⚙️ CONFIGURAÇÃO DO BOT",
    [
      "**Cargos**",
      `• Mediador: ${mediatorRole}`,
      `• Analista: ${analystRole}`,
      "",
      "**Taxa**",
      `• Taxa: ${money(cfg.fee || 0)}`,
      "",
      "**Canais**",
      `• Solicitações Mobile: ${mobileChannel}`,
      `• Solicitações Emulador: ${emulatorChannel}`,
      `• Fila de Mediadores: ${mediatorChannel}`,
      "",
      "**Categoria das apostas**",
      `• ${category}`,
      "",
      "**Pix ADM**",
      `• Nome: ${cfg.pixName || "Não configurado"}`,
      `• Chave: ${cfg.pixKey || "Não configurada"}`,
      `• QR Code: ${cfg.pixQrCode ? "Configurado" : "Não configurado"}`,
      "",
      "**Aparência**",
      `• Cor: ${cfg.embedColor || "#5865F2"}`,
      `• Foto: ${cfg.profilePicture ? "Configurada" : "Não configurada"}`
    ].join("\n")
  );
}


// ============================================================
// BOTÕES PRINCIPAIS DO /CONFIG
// ============================================================

function configMainButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_roles")
        .setLabel("Cargos")
        .setEmoji("👥")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_channels")
        .setLabel("Canais")
        .setEmoji("📺")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_category")
        .setLabel("Categoria")
        .setEmoji("📁")
        .setStyle(ButtonStyle.Primary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_fee")
        .setLabel("Taxa")
        .setEmoji("💰")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_pix")
        .setLabel("Pix ADM")
        .setEmoji("💠")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_appearance")
        .setLabel("Aparência")
        .setEmoji("🎨")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}


// ============================================================
// ABRIR /CONFIG
// ============================================================

async function openConfig(interaction) {
  if (!interaction.guild) {
    return interaction.reply({
      content: "❌ Este comando só pode ser usado dentro de um servidor.",
      ephemeral: true
    });
  }

  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Você precisa ter permissão de administrador para configurar o bot.",
      ephemeral: true
    });
  }

  await interaction.reply({
    embeds: [
      configMainEmbed(interaction.guild.id)
    ],
    components: configMainButtons(),
    ephemeral: true
  });
}


// ============================================================
// CONFIGURAÇÃO DE CARGOS
// ============================================================

function configRolesEmbed(guildId) {
  const cfg = getGuildConfig(guildId);

  return makeEmbed(
    cfg,
    "👥 CONFIGURAÇÃO DE CARGOS",
    [
      "Selecione os cargos utilizados pelo bot.",
      "",
      `**Mediador atual:** ${
        cfg.mediatorRoleId
          ? `<@&${cfg.mediatorRoleId}>`
          : "Não configurado"
      }`,
      `**Analista atual:** ${
        cfg.analystRoleId
          ? `<@&${cfg.analystRoleId}>`
          : "Não configurado"
      }`
    ].join("\n")
  );
}


function configRolesComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("config_select_mediator_role")
        .setPlaceholder("Selecionar cargo de Mediador")
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("config_select_analyst_role")
        .setPlaceholder("Selecionar cargo de Analista")
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_back")
        .setLabel("Voltar")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}


async function configRoles(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Você precisa ser administrador.",
      ephemeral: true
    });
  }

  await interaction.update({
    embeds: [
      configRolesEmbed(interaction.guild.id)
    ],
    components: configRolesComponents()
  });
}


// ============================================================
// CONFIGURAÇÃO DE CANAIS
// ============================================================

function configChannelsEmbed(guildId) {
  const cfg = getGuildConfig(guildId);

  return makeEmbed(
    cfg,
    "📺 CONFIGURAÇÃO DE CANAIS",
    [
      "O servidor possui seleção automática dos canais existentes.",
      "",
      `**Canal Mobile:** ${
        cfg.mobileChannelId
          ? `<#${cfg.mobileChannelId}>`
          : "Não configurado"
      }`,
      "",
      `**Canal Emulador:** ${
        cfg.emulatorChannelId
          ? `<#${cfg.emulatorChannelId}>`
          : "Não configurado"
      }`,
      "",
      `**Canal de Mediadores:** ${
        cfg.mediatorChannelId
          ? `<#${cfg.mediatorChannelId}>`
          : "Não configurado"
      }`
    ].join("\n")
  );
}


function configChannelsComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("config_select_mobile_channel")
        .setPlaceholder("Selecionar canal das solicitações Mobile")
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("config_select_emulator_channel")
        .setPlaceholder("Selecionar canal das solicitações Emulador")
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("config_select_mediator_channel")
        .setPlaceholder("Selecionar canal da fila de Mediadores")
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_back")
        .setLabel("Voltar")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}


async function configChannels(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Você precisa ser administrador.",
      ephemeral: true
    });
  }

  // Detecta os canais atuais do servidor.
  const channels = getServerChannels(interaction.guild);

  console.log(
    `[CONFIG] ${interaction.guild.name}: ${channels.length} canais detectados.`
  );

  await interaction.update({
    embeds: [
      configChannelsEmbed(interaction.guild.id)
    ],
    components: configChannelsComponents()
  });
}


// ============================================================
// CONFIGURAÇÃO DA CATEGORIA
// ============================================================

function configCategoryEmbed(guildId) {
  const cfg = getGuildConfig(guildId);

  return makeEmbed(
    cfg,
    "📁 CATEGORIA DAS APOSTAS",
    [
      "Selecione a categoria onde os canais privados das apostas serão criados.",
      "",
      `**Categoria atual:** ${
        cfg.betsCategoryId
          ? `<#${cfg.betsCategoryId}>`
          : "Não configurada"
      }`
    ].join("\n")
  );
}


function configCategoryComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("config_select_category")
        .setPlaceholder("Selecionar categoria das apostas")
        .setChannelTypes(ChannelType.GuildCategory)
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_back")
        .setLabel("Voltar")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}


async function configCategory(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Você precisa ser administrador.",
      ephemeral: true
    });
  }

  await interaction.update({
    embeds: [
      configCategoryEmbed(interaction.guild.id)
    ],
    components: configCategoryComponents()
  });
}


// ============================================================
// MODAL DA TAXA
// ============================================================

function configFeeModal(guildId) {
  const cfg = getGuildConfig(guildId);

  const modal = new ModalBuilder()
    .setCustomId("config_fee_modal")
    .setTitle("Configurar taxa");

  const input = new TextInputBuilder()
    .setCustomId("fee")
    .setLabel("Taxa do bot")
    .setPlaceholder("Digite um valor entre R$0,01 e R$0,50")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(
      Number(cfg.fee || 0.01)
        .toFixed(2)
        .replace(".", ",")
    );

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  return modal;
}


async function configFee(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Você precisa ser administrador.",
      ephemeral: true
    });
  }

  await interaction.showModal(
    configFeeModal(interaction.guild.id)
  );
}


// ============================================================
// MODAL DO PIX
// ============================================================

function configPixModal(guildId) {
  const cfg = getGuildConfig(guildId);

  const modal = new ModalBuilder()
    .setCustomId("config_pix_modal")
    .setTitle("Configurar Pix ADM");

  const nameInput = new TextInputBuilder()
    .setCustomId("pix_name")
    .setLabel("Nome do recebedor")
    .setPlaceholder("Nome exibido no pagamento")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(cfg.pixName || "");

  const keyInput = new TextInputBuilder()
    .setCustomId("pix_key")
    .setLabel("Chave Pix")
    .setPlaceholder("CPF, CNPJ, telefone, e-mail ou chave aleatória")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(cfg.pixKey || "");

  const qrInput = new TextInputBuilder()
    .setCustomId("pix_qr")
    .setLabel("URL da imagem do QR Code")
    .setPlaceholder("https://...")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(cfg.pixQrCode || "");

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(keyInput),
    new ActionRowBuilder().addComponents(qrInput)
  );

  return modal;
}


async function configPix(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Você precisa ser administrador.",
      ephemeral: true
    });
  }

  await interaction.showModal(
    configPixModal(interaction.guild.id)
  );
}


// ============================================================
// MODAL DA APARÊNCIA
// ============================================================

function configAppearanceModal(guildId) {
  const cfg = getGuildConfig(guildId);

  const modal = new ModalBuilder()
    .setCustomId("config_appearance_modal")
    .setTitle("Configurar aparência");

  const colorInput = new TextInputBuilder()
    .setCustomId("embed_color")
    .setLabel("Cor dos embeds")
    .setPlaceholder("#5865F2")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(cfg.embedColor || "#5865F2");

  const pictureInput = new TextInputBuilder()
    .setCustomId("profile_picture")
    .setLabel("URL da foto do perfil")
    .setPlaceholder("https://...")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(cfg.profilePicture || "");

  modal.addComponents(
    new ActionRowBuilder().addComponents(colorInput),
    new ActionRowBuilder().addComponents(pictureInput)
  );

  return modal;
}


async function configAppearance(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Você precisa ser administrador.",
      ephemeral: true
    });
  }

  await interaction.showModal(
    configAppearanceModal(interaction.guild.id)
  );
}


// ============================================================
// TRATAMENTO DOS MODAIS
// ============================================================

async function handleModal(interaction) {
  if (!interaction.guild) {
    return interaction.reply({
      content: "❌ Essa configuração só pode ser usada dentro de um servidor.",
      ephemeral: true
    });
  }

  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Você precisa ser administrador.",
      ephemeral: true
    });
  }

  const guildId = interaction.guild.id;
  const cfg = getGuildConfig(guildId);

  // ----------------------------------------------------------
  // TAXA
  // ----------------------------------------------------------

  if (interaction.customId === "config_fee_modal") {
    const raw = interaction.fields.getTextInputValue("fee");

    const value = parseMoney(raw);

    if (value === null) {
      return interaction.reply({
        content: "❌ Digite um valor válido.",
        ephemeral: true
      });
    }

    if (value < 0.01 || value > 0.50) {
      return interaction.reply({
        content: "❌ A taxa deve ficar entre **R$0,01 e R$0,50**.",
        ephemeral: true
      });
    }

    cfg.fee = Number(value.toFixed(2));

    saveDb();

    return interaction.reply({
      content: `✅ Taxa configurada para **${money(cfg.fee)}**.`,
      ephemeral: true
    });
  }


  // ----------------------------------------------------------
  // PIX
  // ----------------------------------------------------------

  if (interaction.customId === "config_pix_modal") {
    cfg.pixName =
      interaction.fields.getTextInputValue("pix_name").trim();

    cfg.pixKey =
      interaction.fields.getTextInputValue("pix_key").trim();

    cfg.pixQrCode =
      interaction.fields.getTextInputValue("pix_qr").trim();

    saveDb();

    return interaction.reply({
      content: "✅ Dados do Pix ADM salvos com sucesso.",
      ephemeral: true
    });
  }


  // ----------------------------------------------------------
  // APARÊNCIA
  // ----------------------------------------------------------

  if (interaction.customId === "config_appearance_modal") {
    const color =
      interaction.fields
        .getTextInputValue("embed_color")
        .trim();

    const picture =
      interaction.fields
        .getTextInputValue("profile_picture")
        .trim();

    if (!validColor(color)) {
      return interaction.reply({
        content: "❌ Cor inválida. Use o formato `#5865F2`.",
        ephemeral: true
      });
    }

    cfg.embedColor = color;

    if (picture) {
      cfg.profilePicture = picture;
    } else {
      cfg.profilePicture = null;
    }

    saveDb();

    // Tenta alterar a foto do bot.
    if (picture) {
      try {
        await client.user.setAvatar(picture);
      } catch (err) {
        console.log(
          "[CONFIG] Não foi possível alterar a foto do bot:",
          err.message
        );
      }
    }

    return interaction.reply({
      content: "✅ Aparência salva com sucesso.",
      ephemeral: true
    });
  }
}


// ============================================================
// TRATAMENTO DOS SELECT MENUS E BOTÕES DO CONFIG
// ============================================================

async function handleConfigInteraction(interaction) {
  if (!interaction.guild) {
    return;
  }

  if (!isAdmin(interaction.member)) {
    if (
      interaction.isButton() ||
      interaction.isAnySelectMenu()
    ) {
      return interaction.reply({
        content: "❌ Você precisa ser administrador.",
        ephemeral: true
      });
    }

    return;
  }

  const guildId = interaction.guild.id;
  const cfg = getGuildConfig(guildId);


  // ==========================================================
  // VOLTAR
  // ==========================================================

  if (
    interaction.isButton() &&
    interaction.customId === "config_back"
  ) {
    return interaction.update({
      embeds: [
        configMainEmbed(guildId)
      ],
      components: configMainButtons()
    });
  }


  // ==========================================================
  // BOTÕES PRINCIPAIS
  // ==========================================================

  if (
    interaction.isButton() &&
    interaction.customId === "config_roles"
  ) {
    return configRoles(interaction);
  }

  if (
    interaction.isButton() &&
    interaction.customId === "config_channels"
  ) {
    return configChannels(interaction);
  }

  if (
    interaction.isButton() &&
    interaction.customId === "config_category"
  ) {
    return configCategory(interaction);
  }

  if (
    interaction.isButton() &&
    interaction.customId === "config_fee"
  ) {
    return configFee(interaction);
  }

  if (
    interaction.isButton() &&
    interaction.customId === "config_pix"
  ) {
    return configPix(interaction);
  }

  if (
    interaction.isButton() &&
    interaction.customId === "config_appearance"
  ) {
    return configAppearance(interaction);
  }


  // ==========================================================
  // CARGO MEDIADOR
  // ==========================================================

  if (
    interaction.isRoleSelectMenu() &&
    interaction.customId === "config_select_mediator_role"
  ) {
    cfg.mediatorRoleId = interaction.values[0];

    saveDb();

    return interaction.update({
      embeds: [
        configRolesEmbed(guildId)
      ],
      components: configRolesComponents()
    });
  }


  // ==========================================================
  // CARGO ANALISTA
  // ==========================================================

  if (
    interaction.isRoleSelectMenu() &&
    interaction.customId === "config_select_analyst_role"
  ) {
    cfg.analystRoleId = interaction.values[0];

    saveDb();

    return interaction.update({
      embeds: [
        configRolesEmbed(guildId)
      ],
      components: configRolesComponents()
    });
  }


  // ==========================================================
  // CANAL MOBILE
  // ==========================================================

  if (
    interaction.isChannelSelectMenu() &&
    interaction.customId === "config_select_mobile_channel"
  ) {
    cfg.mobileChannelId = interaction.values[0];

    saveDb();

    return interaction.update({
      embeds: [
        configChannelsEmbed(guildId)
      ],
      components: configChannelsComponents()
    });
  }


  // ==========================================================
  // CANAL EMULADOR
  // ==========================================================

  if (
    interaction.isChannelSelectMenu() &&
    interaction.customId === "config_select_emulator_channel"
  ) {
    cfg.emulatorChannelId = interaction.values[0];

    saveDb();

    return interaction.update({
      embeds: [
        configChannelsEmbed(guildId)
      ],
      components: configChannelsComponents()
    });
  }


  // ==========================================================
  // CANAL DE MEDIADORES
  // ==========================================================

  if (
    interaction.isChannelSelectMenu() &&
    interaction.customId === "config_select_mediator_channel"
  ) {
    cfg.mediatorChannelId = interaction.values[0];

    saveDb();

    await publishMediatorQueue(interaction.guild);

    return interaction.update({
      embeds: [
        configChannelsEmbed(guildId)
      ],
      components: configChannelsComponents()
    });
  }


  // ==========================================================
  // CATEGORIA
  // ==========================================================

  if (
    interaction.isChannelSelectMenu() &&
    interaction.customId === "config_select_category"
  ) {
    cfg.betsCategoryId = interaction.values[0];

    saveDb();

    return interaction.update({
      embeds: [
        configCategoryEmbed(guildId)
      ],
      components: configCategoryComponents()
    });
  }
}


// ============================================================
// DETECÇÃO / VALIDAÇÃO DOS CANAIS DO SERVIDOR
// ============================================================

async function refreshGuildChannels(guild) {
  try {
    await guild.channels.fetch();

    const channels = getServerChannels(guild);

    const textChannels = channels.filter(
      channel =>
        channel.type === ChannelType.GuildText
    );

    const categories = channels.filter(
      channel =>
        channel.type === ChannelType.GuildCategory
    );

    console.log(
      `[CANAIS] Servidor: ${guild.name}`
    );

    console.log(
      `[CANAIS] Total detectado: ${channels.length}`
    );

    console.log(
      `[CANAIS] Canais de texto: ${textChannels.length}`
    );

    console.log(
      `[CANAIS] Categorias: ${categories.length}`
    );

    return channels;
  } catch (err) {
    console.log(
      `[CANAIS] Erro ao detectar canais de ${guild.name}:`,
      err.message
    );

    return [];
  }
}


// ============================================================
// VALIDAR CONFIGURAÇÃO DO SERVIDOR
// ============================================================

async function validateGuildConfig(guild) {
  const cfg = getGuildConfig(guild.id);

  const result = {
    mediatorRole: false,
    analystRole: false,
    mobileChannel: false,
    emulatorChannel: false,
    mediatorChannel: false,
    betsCategory: false
  };

  if (cfg.mediatorRoleId) {
    result.mediatorRole =
      !!guild.roles.cache.get(cfg.mediatorRoleId);
  }

  if (cfg.analystRoleId) {
    result.analystRole =
      !!guild.roles.cache.get(cfg.analystRoleId);
  }

  if (cfg.mobileChannelId) {
    const channel =
      guild.channels.cache.get(cfg.mobileChannelId);

    result.mobileChannel =
      !!channel &&
      channel.type === ChannelType.GuildText;
  }

  if (cfg.emulatorChannelId) {
    const channel =
      guild.channels.cache.get(cfg.emulatorChannelId);

    result.emulatorChannel =
      !!channel &&
      channel.type === ChannelType.GuildText;
  }

  if (cfg.mediatorChannelId) {
    const channel =
      guild.channels.cache.get(cfg.mediatorChannelId);

    result.mediatorChannel =
      !!channel &&
      channel.type === ChannelType.GuildText;
  }

  if (cfg.betsCategoryId) {
    const channel =
      guild.channels.cache.get(cfg.betsCategoryId);

    result.betsCategory =
      !!channel &&
      channel.type === ChannelType.GuildCategory;
  }

  return result;
}// ============================================================
// PARTE 5 — COMANDOS + EVENTOS + INICIALIZAÇÃO
// ============================================================


// ============================================================
// /FILA
// ============================================================

async function commandFila(interaction) {
  if (!interaction.guild) {
    return interaction.reply({
      content: "❌ Este comando só pode ser usado dentro de um servidor.",
      ephemeral: true
    });
  }

  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Você precisa ser administrador para criar as filas.",
      ephemeral: true
    });
  }

  const format = interaction.options.getString("formato");
  const modality = interaction.options.getString("modalidade");
  const channelId = interaction.options.getChannel("canal").id;

  if (!FORMATS[format]) {
    return interaction.reply({
      content: "❌ Formato inválido.",
      ephemeral: true
    });
  }

  if (!MODALITIES.includes(modality)) {
    return interaction.reply({
      content: "❌ Modalidade inválida.",
      ephemeral: true
    });
  }

  const channel = await interaction.guild.channels
    .fetch(channelId)
    .catch(() => null);

  if (!channel || channel.type !== ChannelType.GuildText) {
    return interaction.reply({
      content: "❌ O canal selecionado não é um canal de texto.",
      ephemeral: true
    });
  }

  await interaction.reply({
    content: "⏳ Criando as filas...",
    ephemeral: true
  });

  /*
   * VALUES_DESC:
   * R$100,00
   * R$50,00
   * ...
   * R$0,30
   *
   * Como o Discord mostra as mensagens mais novas embaixo,
   * criamos do maior para o menor para que:
   *
   * R$100,00 fique em cima
   * R$0,30 fique embaixo
   */

  let created = 0;

  for (const value of VALUES_DESC) {
    const q = getQueue(
      interaction.guild.id,
      format,
      modality,
      value
    );

    const message = await channel.send({
      embeds: [queueEmbed(q)],
      components: queueButtons(q)
    });

    q.channelId = channel.id;
    q.messageId = message.id;

    created++;
  }

  await interaction.editReply({
    content:
      `✅ Foram criadas **${created} filas** de ` +
      `**${format} ${modality}** em ${channel}.`
  });
}


// ============================================================
// .SSMOB / .SSEMU
// ============================================================

async function createAnalysisRequest(message, type) {
  const guildId = message.guildId;

  if (!guildId) {
    return;
  }

  const cfg = getGuildConfig(guildId);

  const channelId =
    type === "Mobile"
      ? cfg.mobileChannelId
      : cfg.emulatorChannelId;

  if (!channelId) {
    return message.reply({
      content:
        `❌ O canal de solicitações **${type}** ainda não foi configurado no \`/config\`.`
    });
  }

  const channel = await message.guild.channels
    .fetch(channelId)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) {
    return message.reply({
      content:
        `❌ O canal configurado para **${type}** não foi encontrado.`
    });
  }

  const embed = makeEmbed(
    cfg,
    `📋 SOLICITAÇÃO DE ANÁLISE — ${type.toUpperCase()}`,
    [
      `**Solicitante:** ${message.author}`,
      "",
      "A solicitação está aguardando um Analista.",
      "",
      "Um analista com o cargo configurado poderá assumir esta solicitação."
    ].join("\n")
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `analysis_take:${type}:${message.author.id}:${Date.now()}`
      )
      .setLabel("Assumir análise")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({
    embeds: [embed],
    components: [row]
  });

  await message.reply({
    content:
      `✅ Sua solicitação de análise **${type}** foi enviada para ${channel}.`
  });
}


// ============================================================
// PEGAR SOLICITAÇÃO DE ANÁLISE
// ============================================================

async function takeAnalysis(interaction) {
  const parts = interaction.customId.split(":");

  const type = parts[1];
  const requesterId = parts[2];

  const cfg = getGuildConfig(interaction.guildId);

  if (
    !cfg.analystRoleId ||
    !interaction.member.roles.cache.has(cfg.analystRoleId)
  ) {
    return interaction.reply({
      content:
        "❌ Somente usuários com o cargo **Analista** podem assumir solicitações.",
      ephemeral: true
    });
  }

  const embed = makeEmbed(
    cfg,
    `🔎 ANÁLISE ASSUMIDA — ${type.toUpperCase()}`,
    [
      `**Solicitante:** <@${requesterId}>`,
      `**Analista:** ${interaction.user}`,
      "",
      "Esta solicitação foi assumida."
    ].join("\n")
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("analysis_taken")
      .setLabel("Análise assumida")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true)
  );

  await interaction.update({
    embeds: [embed],
    components: [row]
  });
}


// ============================================================
// DEFINIÇÃO DOS SLASH COMMANDS
// ============================================================

function getSlashCommands() {
  return [

    // --------------------------------------------------------
    // /config
    // --------------------------------------------------------

    new SlashCommandBuilder()
      .setName("config")
      .setDescription("Configurar o sistema do bot"),


    // --------------------------------------------------------
    // /fila
    // --------------------------------------------------------

    new SlashCommandBuilder()
      .setName("fila")
      .setDescription("Criar uma fila de apostas")
      .addStringOption(option =>
        option
          .setName("formato")
          .setDescription("Escolha o formato")
          .setRequired(true)
          .addChoices(
            {
              name: "1x1",
              value: "1x1"
            },
            {
              name: "2x2",
              value: "2x2"
            },
            {
              name: "3x3",
              value: "3x3"
            },
            {
              name: "4x4",
              value: "4x4"
            }
          )
      )
      .addStringOption(option =>
        option
          .setName("modalidade")
          .setDescription("Escolha a modalidade")
          .setRequired(true)
          .addChoices(
            {
              name: "Mobile",
              value: "Mobile"
            },
            {
              name: "Emulador",
              value: "Emulador"
            },
            {
              name: "Misto",
              value: "Misto"
            }
          )
      )
      .addChannelOption(option =>
        option
          .setName("canal")
          .setDescription("Canal onde a fila será publicada")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText)
      ),


    // --------------------------------------------------------
    // /p
    // --------------------------------------------------------

    new SlashCommandBuilder()
      .setName("p")
      .setDescription("Ver estatísticas públicas"),


    // --------------------------------------------------------
    // /med
    // --------------------------------------------------------

    new SlashCommandBuilder()
      .setName("med")
      .setDescription("Abrir o painel do mediador")
  ];
}


// ============================================================
// REGISTRAR SLASH COMMANDS
// ============================================================

async function registerCommands(guild) {
  try {
    const commands = getSlashCommands();

    await guild.commands.set(
      commands.map(command => command.toJSON())
    );

    console.log(
      `[COMANDOS] Comandos registrados em ${guild.name}`
    );
  } catch (err) {
    console.error(
      `[COMANDOS] Erro ao registrar comandos em ${guild.name}:`,
      err
    );
  }
}


// ============================================================
// EVENTO READY
// ============================================================

client.once(Events.ClientReady, async readyClient => {
  console.log("============================================");
  console.log(`🤖 Bot online: ${readyClient.user.tag}`);
  console.log(`🆔 ID: ${readyClient.user.id}`);
  console.log("============================================");

  for (const guild of readyClient.guilds.cache.values()) {
    // Garante configuração inicial.
    getGuildConfig(guild.id);

    // Detecta canais existentes.
    await refreshGuildChannels(guild);

    // Registra os slash commands.
    await registerCommands(guild);

    // Publica / atualiza fila de mediadores,
    // se o canal já estiver configurado.
    await publishMediatorQueue(guild);

    const validation =
      await validateGuildConfig(guild);

    console.log(
      `[CONFIG] ${guild.name}:`,
      validation
    );
  }

  saveDb();

  console.log("✅ Inicialização concluída.");
});


// ============================================================
// EVENTO DE NOVO SERVIDOR
// ============================================================

client.on(Events.GuildCreate, async guild => {
  console.log(
    `[SERVIDOR] Bot adicionado em: ${guild.name}`
  );

  getGuildConfig(guild.id);

  await refreshGuildChannels(guild);

  await registerCommands(guild);

  await publishMediatorQueue(guild);

  saveDb();
});


// ============================================================
// INTERAÇÕES
// ============================================================

client.on(Events.InteractionCreate, async interaction => {
  try {

    // ========================================================
    // SLASH COMMAND
    // ========================================================

    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === "config") {
        return openConfig(interaction);
      }

      if (interaction.commandName === "fila") {
        return commandFila(interaction);
      }

      if (interaction.commandName === "p") {
        const user =
          interaction.options.getUser("usuario") ||
          interaction.user;

        return interaction.reply({
          embeds: [
            publicStatsEmbed(
              interaction.guild.id,
              user
            )
          ]
        });
      }

      if (interaction.commandName === "med") {
        const cfg =
          getGuildConfig(interaction.guild.id);

        if (
          !cfg.mediatorRoleId ||
          !interaction.member.roles.cache.has(
            cfg.mediatorRoleId
          )
        ) {
          return interaction.reply({
            content:
              "❌ Somente usuários com o cargo **Mediador** podem usar `/med`.",
            ephemeral: true
          });
        }

        const match =
          [...matches.values()].find(
            m =>
              m.guildId === interaction.guild.id &&
              m.channelId === interaction.channel.id &&
              m.status !== "cancelled" &&
              m.status !== "finished"
          );

        if (!match) {
          return interaction.reply({
            content:
              "❌ Não existe uma aposta ativa neste canal.",
            ephemeral: true
          });
        }

        if (
          match.mediatorId &&
          match.mediatorId !== interaction.user.id
        ) {
          return interaction.reply({
            content:
              "❌ Você não é o mediador responsável por esta aposta.",
            ephemeral: true
          });
        }

        return sendMediatorMenu(
          interaction.channel,
          match
        );
      }
    }


    // ========================================================
    // BOTÕES
    // ========================================================

    if (interaction.isButton()) {

      // ------------------------------------------------------
      // CONFIG
      // ------------------------------------------------------

      if (
        interaction.customId.startsWith("config_")
      ) {
        return handleConfigInteraction(
          interaction
        );
      }


      // ------------------------------------------------------
      // FILA DE MEDIADORES
      // ------------------------------------------------------

      if (
        interaction.customId === "mediator_join" ||
        interaction.customId === "mediator_leave"
      ) {
        return handleMediatorQueueButton(
          interaction
        );
      }


      // ------------------------------------------------------
      // FILAS
      // ------------------------------------------------------

      if (
        interaction.customId.startsWith("queue_gelo_normal:") ||
        interaction.customId.startsWith("queue_gelo_infinito:") ||
        interaction.customId.startsWith("queue_join:") ||
        interaction.customId.startsWith("queue_leave:")
      ) {
        return handleQueueButton(
          interaction
        );
      }


      // ------------------------------------------------------
      // CONFIRMAR APOSTA
      // ------------------------------------------------------

      if (
        interaction.customId.startsWith("bet_confirm:")
      ) {
        const matchId =
          interaction.customId.split(":")[1];

        return confirmBet(
          interaction,
          matchId
        );
      }


      // ------------------------------------------------------
      // CANCELAR APOSTA
      // ------------------------------------------------------

      if (
        interaction.customId.startsWith("bet_cancel:")
      ) {
        const matchId =
          interaction.customId.split(":")[1];

        return cancelBet(
          interaction,
          matchId
        );
      }


      // ------------------------------------------------------
      // MENU MEDIADOR
      // ------------------------------------------------------

      if (
        interaction.customId.startsWith("med_winner:") ||
        interaction.customId.startsWith("med_wo:") ||
        interaction.customId.startsWith("med_finish:")
      ) {
        return handleMediatorButton(
          interaction
        );
      }


      // ------------------------------------------------------
      // COPIAR ID / SENHA
      // ------------------------------------------------------

      if (
        interaction.customId.startsWith("room_copy_id:") ||
        interaction.customId.startsWith("room_copy_password:")
      ) {
        return handleRoomCopyButton(
          interaction
        );
      }


      // ------------------------------------------------------
      // ANÁLISE
      // ------------------------------------------------------

      if (
        interaction.customId.startsWith("analysis_take:")
      ) {
        return takeAnalysis(
          interaction
        );
      }
    }


    // ========================================================
    // SELECT MENUS
    // ========================================================

    if (interaction.isAnySelectMenu()) {

      // ------------------------------------------------------
      // CONFIG
      // ------------------------------------------------------

      if (
        interaction.customId.startsWith("config_")
      ) {
        return handleConfigInteraction(
          interaction
        );
      }


      // ------------------------------------------------------
      // VENCEDOR
      // ------------------------------------------------------

      if (
        interaction.customId.startsWith("med_winner_select:")
      ) {
        return handleWinnerSelect(
          interaction
        );
      }


      // ------------------------------------------------------
      // W.O.
      // ------------------------------------------------------

      if (
        interaction.customId.startsWith("med_wo_select:")
      ) {
        return handleWOSelect(
          interaction
        );
      }
    }


    // ========================================================
    // MODAIS
    // ========================================================

    if (interaction.isModalSubmit()) {

      if (
        interaction.customId.startsWith("config_")
      ) {
        return handleModal(
          interaction
        );
      }
    }

  } catch (err) {
    console.error(
      "[INTERACTION ERROR]",
      err
    );

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content:
            "❌ Ocorreu um erro ao processar essa interação.",
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content:
            "❌ Ocorreu um erro ao processar essa interação.",
          ephemeral: true
        });
      }
    } catch {}
  }
});


// ============================================================
// MESSAGE CREATE
// ============================================================

client.on(Events.MessageCreate, async message => {
  try {
    if (message.author.bot) {
      return;
    }

    if (!message.guild) {
      return;
    }

    const content =
      message.content.trim();

    const lower =
      content.toLowerCase();


    // ========================================================
    // .SSMOB
    // ========================================================

    if (lower === ".ssmob") {
      return createAnalysisRequest(
        message,
        "Mobile"
      );
    }


    // ========================================================
    // .SSEMU
    // ========================================================

    if (lower === ".ssemu") {
      return createAnalysisRequest(
        message,
        "Emulador"
      );
    }


    // ========================================================
    // .MED
    // ========================================================

    if (lower === ".med") {
      return commandMed(message);
    }


    // ========================================================
    // .P
    // ========================================================

    if (lower === ".p") {
      return commandPublicStats(message);
    }


    // ========================================================
    // ID / SENHA DA SALA
    // ========================================================

    const match =
      [...matches.values()].find(
        m =>
          m.guildId === message.guild.id &&
          m.channelId === message.channel.id &&
          m.status !== "cancelled" &&
          m.status !== "finished"
      );

    if (!match) {
      return;
    }

    // Somente o mediador responsável pode enviar
    // os dados da sala.
    if (
      match.mediatorId &&
      message.author.id !== match.mediatorId
    ) {
      return;
    }

    const roomData =
      extractRoomData(message.content);

    if (!roomData) {
      return;
    }

    await publishRoomData(
      match,
      roomData
    );

  } catch (err) {
    console.error(
      "[MESSAGE ERROR]",
      err
    );
  }
});


// ============================================================
// ERROS DO CLIENT
// ============================================================

client.on(Events.Error, error => {
  console.error(
    "[DISCORD CLIENT ERROR]",
    error
  );
});

client.on(Events.Warn, warning => {
  console.warn(
    "[DISCORD WARN]",
    warning
  );
});


// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN).catch(err => {
  console.error(
    "❌ Não foi possível conectar o bot ao Discord."
  );

  console.error(err);
});
