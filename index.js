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
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  SlashCommandBuilder,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;

if (!TOKEN) {
  console.error('❌ Falta DISCORD_TOKEN no .env');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bot.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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

// Menor valor embaixo e maior em cima.
const VALUES_ASC = [...VALUES].sort((a, b) => a - b);

const FORMATS = {
  '1x1': 2,
  '2x2': 4,
  '3x3': 6,
  '4x4': 8
};

const MODALITIES = [
  'Mobile',
  'Emulador',
  'Misto'
];

const db = loadDb();

const queues = new Map();
const matches = new Map();

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

function loadDb() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return {
        guilds: {},
        users: {}
      };
    }

    const data = JSON.parse(
      fs.readFileSync(DATA_FILE, 'utf8')
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
      JSON.stringify(db, null, 2),
      'utf8'
    );

  } catch (error) {

    console.error(
      '❌ Erro salvando banco:',
      error
    );
  }
}

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

function getGuildConfig(guildId) {

  if (!db.guilds[guildId]) {

    db.guilds[guildId] = {

      config: defaultGuildConfig(),

      mediatorQueue: []
    };

    saveDb();
  }

  if (!db.guilds[guildId].config) {

    db.guilds[guildId].config =
      defaultGuildConfig();
  }

  if (!Array.isArray(
    db.guilds[guildId].mediatorQueue
  )) {

    db.guilds[guildId].mediatorQueue = [];
  }

  return db.guilds[guildId];
}

function getUserStats(
  guildId,
  userId
) {

  if (!db.users[guildId]) {
    db.users[guildId] = {};
  }

  if (!db.users[guildId][userId]) {

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

function money(value) {

  return Number(value).toLocaleString(
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

  let value = text
    .trim()
    .replace(/^R\$\s*/i, '');

  if (value.includes(',')) {

    value = value
      .replace(/\./g, '')
      .replace(',', '.');
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

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
      member.guild?.ownerId === member.id
    )
  );
}

function hasRole(
  member,
  roleId
) {

  return Boolean(
    roleId &&
    member?.roles?.cache?.has(roleId)
  );
}

function isMediator(member) {

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
        validColor(cfg.embedColor)
          ? cfg.embedColor
          : '#5865F2'
      )
      .setTimestamp();

  if (cfg.profilePicture) {

    embed.setThumbnail(
      cfg.profilePicture
    );
  }

  return embed;
}

async function reply(
  interaction,
  payload
) {

  if (interaction.deferred) {

    return interaction.editReply(
      payload
    );
  }

  if (interaction.replied) {

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
   FILAS
========================================================= */

function queueKey(
  guildId,
  format,
  modality,
  value,
  gelo = ''
) {

  return [
    guildId,
    format,
    modality,
    value,
    gelo
  ].join('|');
}

function getQueue(
  guildId,
  format,
  modality,
  value,
  gelo = ''
) {

  const key = queueKey(
    guildId,
    format,
    modality,
    value,
    gelo
  );

  if (!queues.has(key)) {

    queues.set(
      key,
      {
        guildId,
        format,
        modality,
        value: Number(value),
        gelo,
        users: [],
        messageId: '',
        channelId: ''
      }
    );
  }

  return queues.get(key);
}

function queueLabel(q) {

  const gelo =
    q.gelo
      ? ` • ${q.gelo}`
      : '';

  return (
    `${q.format} • ` +
    `${q.modality}${gelo} • ` +
    `${money(q.value)}`
  );
}

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
            (id, index) =>
              `${index + 1}. <@${id}>`
          )
          .join('\n')

      : 'Ninguém na fila ainda.';

  return makeEmbed(

    guild,

    `🎮 Fila ${queueLabel(q)}`,

    [
      `**Vagas:** ${q.users.length}/${needed}`,

      '',

      users,

      '',

      q.format === '1x1'

        ? 'Escolha **Gelo Normal** ou **Gelo Infinito** para entrar.'

        : 'Clique em **Entrar na fila** para participar.',

      '',

      '**Valores:** do menor embaixo para o maior em cima.'
    ].join('\n')
  );
}

function queueButtons(q) {

  if (q.format === '1x1') {

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
              ButtonStyle.Primary
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
              q.value,
              ''
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

async function refreshQueueMessage(
  guild,
  q
) {

  if (
    !q.channelId ||
    !q.messageId
  ) {
    return;
  }

  try {

    const channel =
      await guild.channels.fetch(
        q.channelId
      );

    if (!channel?.isTextBased()) {
      return;
    }

    const message =
      await channel.messages.fetch(
        q.messageId
      );

    await message.edit({

      embeds: [
        queueEmbed(
          guild,
          q
        )
      ],

      components:
        queueButtons(q)
    });

  } catch (error) {

    console.error(
      '⚠️ Erro atualizando fila:',
      error.message
    );
  }
}

/* =========================================================
   FILA DE MEDIADORES
========================================================= */

function getMediatorQueue(
  guildId
) {

  return getGuildConfig(
    guildId
  ).mediatorQueue;
}

function mediatorQueueEmbed(
  guild
) {

  const list =
    getMediatorQueue(
      guild.id
    );

  return makeEmbed(

    guild,

    '🛡️ Fila de Mediadores',

    [
      'Somente usuários com o cargo **Mediador** podem entrar.',

      '',

      list.length

        ? list
            .map(
              (id, index) =>
                `**${index + 1}.** <@${id}>`
            )
            .join('\n')

        : 'Nenhum mediador disponível.',

      '',

      'A rotação dos mediadores é automática.'
    ].join('\n')
  );
}

function mediatorQueueButtons() {

  return [

    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            'medqueue_join'
          )
          .setLabel(
            'Entrar'
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            'medqueue_leave'
          )
          .setLabel(
            'Sair'
          )
          .setStyle(
            ButtonStyle.Danger
          )
      )
  ];
}

async function publishMediatorQueue(
  guild
) {

  const cfg =
    getGuildConfig(
      guild.id
    ).config;

  if (
    !cfg.mediatorQueueChannelId
  ) {
    return false;
  }

  const channel =
    await guild.channels.fetch(
      cfg.mediatorQueueChannelId
    ).catch(
      () => null
    );

  if (!channel?.isTextBased()) {
    return false;
  }

  const messages =
    await channel.messages.fetch(
      {
        limit: 20
      }
    ).catch(
      () => null
    );

  if (messages) {

    const old =
      messages.find(
        message =>
          message.author.id === client.user.id &&
          message.components.some(
            row =>
              row.components.some(
                component =>
                  component.customId ===
                  'medqueue_join'
              )
          )
      );

    if (old) {

      await old.edit({

        embeds: [
          mediatorQueueEmbed(
            guild
          )
        ],

        components:
          mediatorQueueButtons()
      });

      return true;
    }
  }

  await channel.send({

    embeds: [
      mediatorQueueEmbed(
        guild
      )
    ],

    components:
      mediatorQueueButtons()
  });

  return true;
}

function nextMediator(
  guildId
) {

  const config =
    getGuildConfig(
      guildId
    );

  const list =
    config.mediatorQueue;

  if (!list.length) {
    return null;
  }

  const mediatorId =
    list.shift();

  list.push(
    mediatorId
  );

  saveDb();

  return mediatorId;
}/* =========================================================
   CRIAÇÃO DAS APOSTAS
========================================================= */

function getMatchChannelName(value) {
  const total = Number(value) * 2;

  return `aposta-${total
    .toFixed(2)
    .replace('.', '-')}`;
}

async function createBetFromQueue(
  guild,
  q
) {

  const needed =
    FORMATS[q.format];

  if (q.users.length < needed) {
    return null;
  }

  const players =
    [...q.users];

  // Remove os jogadores utilizados da fila.
  q.users =
    q.users.filter(
      id => !players.includes(id)
    );

  await refreshQueueMessage(
    guild,
    q
  );

  let mediatorId = null;

  // Somente partidas de Emulador
  // entram na fila de mediadores.
  if (
    q.modality === 'Emulador'
  ) {

    mediatorId =
      nextMediator(
        guild.id
      );

    if (!mediatorId) {

      // Se não houver mediador,
      // devolve os jogadores à fila.
      q.users.unshift(
        ...players
      );

      await refreshQueueMessage(
        guild,
        q
      );

      return null;
    }

    await publishMediatorQueue(
      guild
    );
  }

  return createPrivateBetChannel(
    guild,
    {
      format: q.format,
      modality: q.modality,
      value: q.value,
      gelo: q.gelo || '',
      players,
      mediatorId
    }
  );
}

async function createPrivateBetChannel(
  guild,
  data
) {

  const cfg =
    getGuildConfig(
      guild.id
    ).config;

  if (!cfg.betsCategoryId) {

    console.error(
      `⚠️ Categoria de apostas não configurada em ${guild.id}`
    );

    return null;
  }

  const category =
    await guild.channels.fetch(
      cfg.betsCategoryId
    ).catch(
      () => null
    );

  if (!category) {
    return null;
  }

  const overwrites = [

    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionsBitField.Flags.ViewChannel
      ]
    },

    ...data.players.map(
      userId => ({
        id: userId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      })
    )
  ];

  if (data.mediatorId) {

    overwrites.push({

      id: data.mediatorId,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages
      ]
    });
  }

  const channel =
    await guild.channels.create({

      name: getMatchChannelName(
        data.value
      ),

      type: ChannelType.GuildText,

      parent: category.id,

      permissionOverwrites:
        overwrites
    });

  const matchId =
    `${guild.id}-${channel.id}`;

  const match = {

    id: matchId,

    guildId: guild.id,

    channelId: channel.id,

    format: data.format,

    modality: data.modality,

    value: Number(data.value),

    gelo: data.gelo || '',

    players: data.players,

    confirmed: [],

    mediatorId:
      data.mediatorId || null,

    roomId: null,

    roomPassword: null,

    roomStarted: false,

    status: 'waiting',

    createdAt:
      Date.now()
  };

  matches.set(
    matchId,
    match
  );

  await sendBetConfirmation(
    channel,
    match
  );

  return match;
}

async function sendBetConfirmation(
  channel,
  match
) {

  const guild =
    channel.guild;

  const mentions =
    match.players
      .map(
        id => `<@${id}>`
      )
      .join(', ');

  const embed =
    makeEmbed(

      guild,

      '🎮 NOVA APOSTA',

      [
        `**Formato:** ${match.format}`,
        `**Modalidade:** ${match.modality}`,
        `**Valor:** ${money(match.value)}`,

        match.gelo
          ? `**Gelo:** ${match.gelo}`
          : '',

        '',

        `**Jogadores:**`,
        mentions,

        '',

        'Todos os jogadores precisam confirmar.',

        'Se alguém cancelar, o canal será excluído em **5 segundos**.'
      ]
        .filter(Boolean)
        .join('\n')
    );

  const row =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            `bet_confirm:${match.id}`
          )
          .setLabel(
            'Confirmar'
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            `bet_cancel:${match.id}`
          )
          .setLabel(
            'Cancelar'
          )
          .setStyle(
            ButtonStyle.Danger
          )
      );

  await channel.send({

    content:
      mentions,

    embeds: [
      embed
    ],

    components: [
      row
    ]
  });
}

/* =========================================================
   CONFIRMAÇÃO DA APOSTA
========================================================= */

async function confirmBet(
  interaction,
  match
) {

  const userId =
    interaction.user.id;

  if (
    !match.players.includes(
      userId
    )
  ) {

    return ephemeral(
      interaction,
      '❌ Você não participa desta aposta.'
    );
  }

  if (
    match.confirmed.includes(
      userId
    )
  ) {

    return ephemeral(
      interaction,
      '⚠️ Você já confirmou esta aposta.'
    );
  }

  match.confirmed.push(
    userId
  );

  await interaction.deferUpdate();

  if (
    match.confirmed.length <
    match.players.length
  ) {

    await interaction.channel.send({

      embeds: [
        makeEmbed(
          ```js
/* =========================================================
   COMANDO /FILA
========================================================= */

async function commandFila(interaction) {
  const format = interaction.options.getString('formato');
  const modality = interaction.options.getString('modalidade');
  const channel = interaction.options.getChannel('canal');

  if (!channel || !channel.isTextBased()) {
    return ephemeral(interaction, '❌ O canal selecionado precisa ser um canal de texto.');
  }

  await interaction.deferReply({ ephemeral: true });

  // Valores do maior para o menor.
  // Como as mensagens novas ficam embaixo no Discord,
  // isso faz R$100,00 ficar no topo e R$0,30 no final.
  const values = [...VALUES].sort((a, b) => b - a);

  let total = 0;

  for (const value of values) {
    /*
      1x1:
      Uma única fila por valor.
      Os jogadores escolhem Gelo Normal ou Gelo Infinito
      através dos botões.
    */
    if (format === '1x1') {
      const q = getQueue(interaction.guild.id, format, modality, value, '');

      const message = await channel.send({
        embeds: [
          queueEmbed(q)
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                `queue_join_gelo|${format}|${modality}|${value}|Gelo Normal`
              )
              .setLabel('Gelo Normal')
              .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
              .setCustomId(
                `queue_join_gelo|${format}|${modality}|${value}|Gelo Infinito`
              )
              .setLabel('Gelo Infinito')
              .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
              .setCustomId(
                `queue_leave|${format}|${modality}|${value}|`
              )
              .setLabel('Sair da fila')
              .setStyle(ButtonStyle.Danger)
          )
        ]
      });

      q.messageId = message.id;
      q.channelId = channel.id;

      total++;
      continue;
    }

    /*
      2x2 / 3x3 / 4x4:
      Uma fila por valor.
    */
    const q = getQueue(
      interaction.guild.id,
      format,
      modality,
      value,
      ''
    );

    const message = await channel.send({
      embeds: [
        queueEmbed(q)
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `queue_join|${format}|${modality}|${value}`
            )
            .setLabel('Entrar na fila')
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId(
              `queue_leave|${format}|${modality}|${value}|`
            )
            .setLabel('Sair da fila')
            .setStyle(ButtonStyle.Danger)
        )
      ]
    });

    q.messageId = message.id;
    q.channelId = channel.id;

    total++;
  }

  await interaction.editReply({
    content:
      `✅ Painel de filas criado com sucesso!\n\n` +
      `🎮 Formato: **${format}**\n` +
      `📱 Modalidade: **${modality}**\n` +
      `📊 Filas criadas: **${total}**\n` +
      `📌 Canal: <#${channel.id}>`
  });
}
```


async function sendPix(
  channel,
  match
) {

  const cfg =
    getGuildConfig(
      channel.guild.id
    ).config;

  const pixLines = [

    `**Valor da aposta:** ${money(match.value)}`,

    cfg.pixName
      ? `**Nome:** ${cfg.pixName}`
      : '',

    cfg.pixKey
      ? `**Pix:** ${cfg.pixKey}`
      : '',

    '',

    'Após o pagamento, aguarde o mediador.'
  ]
    .filter(Boolean)
    .join('\n');

  const embed =
    makeEmbed(

      channel.guild,

      '💰 PAGAMENTO PIX',

      pixLines
    );

  if (cfg.pixQrUrl) {

    embed.setImage(
      cfg.pixQrUrl
    );
  }

  await channel.send({

    embeds: [
      embed
    ]
  });
}

/* =========================================================
   INÍCIO AUTOMÁTICO DA SALA
========================================================= */

function startRoomTimer(
  channel,
  match
) {

  if (
    match.roomTimerStarted
  ) {
    return;
  }

  match.roomTimerStarted =
    true;

  const delay =
    3 * 60 * 1000 +
    Math.floor(
      Math.random() *
      (2 * 60 * 1000)
    );

  setTimeout(
    async () => {

      const current =
        matches.get(
          match.id
        );

      if (!current) {
        return;
      }

      if (
        current.status ===
        'cancelled'
      ) {
        return;
      }

      current.roomStarted =
        true;

      current.status =
        'room_waiting';

      await channel.send({

        embeds: [
          makeEmbed(

            channel.guild,

            '🎮 SALA LIBERADA',

            'A sala está pronta para receber os dados enviados pelo mediador.\n\n' +
            'O mediador deve enviar o **ID** e a **senha** da sala.'
          )
        ]
      });

    },
    delay
  );
}

/* =========================================================
   IDENTIFICAÇÃO DE ID E SENHA DA SALA
========================================================= */

function extractRoomData(
  content
) {

  if (
    typeof content !== 'string'
  ) {
    return null;
  }

  const normalized =
    content
      .replace(/\r/g, '')
      .trim();

  let roomId = null;
  let password = null;

  const idMatch =
    normalized.match(
      /(?:id|sala|room)\s*[:#=\-]?\s*(\d{3,})/i
    );

  const passwordMatch =
    normalized.match(
      /(?:senha|pass|password)\s*[:#=\-]?\s*(\d{2,})/i
    );

  if (idMatch) {
    roomId =
      idMatch[1];
  }

  if (passwordMatch) {
    password =
      passwordMatch[1];
  }

  if (
    roomId &&
    password
  ) {

    return {
      roomId,
      password
    };
  }

  const numbers =
    normalized.match(
      /\d+/g
    );

  if (
    numbers &&
    numbers.length >= 2
  ) {

    return {

      roomId:
        numbers[0],

      password:
        numbers[1]
    };
  }

  return null;
}

async function publishRoomData(
  channel,
  match,
  room
) {

  match.roomId =
    room.roomId;

  match.roomPassword =
    room.password;

  match.status =
    'room_ready';

  const embed =
    makeEmbed(

      channel.guild,

      '🎮 SALA FREE FIRE',

      [
        `**ID da sala:** \`${room.roomId}\``,

        `**Senha:** \`${room.password}\``,

        '',

        'A sala foi identificada automaticamente pelo bot.'
      ].join('\n')
    );

  const row =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            `copy_room_id:${match.id}`
          )
          .setLabel(
            'Copiar ID'
          )
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            `copy_room_pass:${match.id}`
          )
          .setLabel(
            'Copiar Senha'
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      );

  await channel.send({

    embeds: [
      embed
    ],

    components: [
      row
    ]
  });
}

/* =========================================================
   FINALIZAÇÃO / RESULTADOS
========================================================= */

function registerNormalVictory(
  guildId,
  winnerId,
  loserIds
) {

  const winner =
    getUserStats(
      guildId,
      winnerId
    );

  winner.victories += 1;
  winner.normalVictories += 1;
  winner.coins += 1;

  for (const loserId of loserIds) {

    if (
      loserId === winnerId
    ) {
      continue;
    }

    const loser =
      getUserStats(
        guildId,
        loserId
      );

    loser.defeats += 1;
  }

  saveDb();
}

function registerWOVictory(
  guildId,
  winnerId
) {

  const winner =
    getUserStats(
      guildId,
      winnerId
    );

  winner.woVictories += 1;

  saveDb();
}

async function showMediatorMenu(
  interaction
) {

  if (
    !isMediator(
      interaction.member
    )
  ) {

    return ephemeral(
      interaction,
      '❌ Apenas Mediadores podem usar este comando.'
    );
  }

  const match =
    findMatchByChannel(
      interaction.channel.id
    );

  if (!match) {

    return ephemeral(
      interaction,
      '❌ Este canal não é uma aposta ativa.'
    );
  }

  const embed =
    makeEmbed(

      interaction.guild,

      '🛡️ PAINEL DO MEDIADOR',

      [
        `**Formato:** ${match.format}`,
        `**Modalidade:** ${match.modality}`,
        `**Valor:** ${money(match.value)}`,

        '',

        '**Jogadores:**',

        match.players
          .map(
            (id, index) =>
              `${index + 1}. <@${id}>`
          )
          .join('\n'),

        '',

        'Escolha uma ação abaixo.'
      ].join('\n')
    );

  const row =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            `med_winner:${match.id}`
          )
          .setLabel(
            'Escolher vencedor'
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            `med_wo:${match.id}`
          )
          .setLabel(
            'Vitória por W.O.'
          )
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            `med_finish:${match.id}`
          )
          .setLabel(
            'Finalizar aposta'
          )
          .setStyle(
            ButtonStyle.Danger
          )
      );

  await interaction.reply({

    embeds: [
      embed
    ],

    components: [
      row
    ]
  });
}

function findMatchByChannel(
  channelId
) {

  for (
    const match of matches.values()
  ) {

    if (
      match.channelId ===
      channelId
    ) {
      return match;
    }
  }

  return null;
}

/* =========================================================
   MENUS DO MEDIADOR
========================================================= */

async function winnerMenu(
  interaction,
  match
) {

  if (
    !isMediator(
      interaction.member
    )
  ) {

    return ephemeral(
      interaction,
      '❌ Apenas Mediadores podem fazer isso.'
    );
  }

  const options =
    match.players
      .slice(0, 25)
      .map(
        (id, index) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(
              `Jogador ${index + 1}`
            )
            .setDescription(
              id
            )
            .setValue(
              id
            )
      );

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        `winner_select:${match.id}`
      )
      .setPlaceholder(
        'Selecione o vencedor'
      )
      .addOptions(
        options
      );

  await interaction.reply({

    embeds: [
      makeEmbed(

        interaction.guild,

        '🏆 ESCOLHER VENCEDOR',

        'Selecione o jogador que venceu normalmente.'
      )
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(menu)
    ],

    ephemeral: true
  });
}

async function woMenu(
  interaction,
  match
) {

  if (
    !isMediator(
      interaction.member
    )
  ) {

    return ephemeral(
      interaction,
      '❌ Apenas Mediadores podem fazer isso.'
    );
  }

  const options =
    match.players
      .slice(0, 25)
      .map(
        (id, index) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(
              `Jogador ${index + 1}`
            )
            .setDescription(
              id
            )
            .setValue(
              id
            )
      );

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        `wo_select:${match.id}`
      )
      .setPlaceholder(
        'Selecione quem venceu por W.O.'
      )
      .addOptions(
        options
      );

  await interaction.reply({

    embeds: [
      makeEmbed(

        interaction.guild,

        '⚠️ VITÓRIA POR W.O.',

        'Selecione o jogador que venceu por W.O.\n\n' +
        '**Importante:** W.O. não adiciona vitória normal, moeda ou derrota.'
      )
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(menu)
    ],

    ephemeral: true
  });
}

async function finalizeBet(
  interaction,
  match
) {

  if (
    !isMediator(
      interaction.member
    )
  ) {

    return ephemeral(
      interaction,
      '❌ Apenas Mediadores podem finalizar a aposta.'
    );
  }

  match.status =
    'finished';

  await interaction.reply({

    embeds: [
      makeEmbed(

        interaction.guild,

        '✅ APOSTA FINALIZADA',

        'A aposta foi marcada como finalizada.'
      )
    ]
  });

  setTimeout(
    async () => {

      matches.delete(
        match.id
      );

      await interaction.channel
        .delete()
        .catch(
          () => {}
        );

    },
    5000
  );
}

/* =========================================================
   ESTATÍSTICAS PÚBLICAS
========================================================= */

async function publicStats(
  interaction
) {

  const stats =
    getUserStats(
      interaction.guild.id,
      interaction.user.id
    );

  const embed =
    makeEmbed(

      interaction.guild,

      `📊 ESTATÍSTICAS — ${interaction.user.username}`,

      [
        `🏆 **Vitórias:** ${stats.victories}`,

        `❌ **Derrotas:** ${stats.defeats}`,

        `🥇 **Vitórias normais:** ${stats.normalVictories}`,

        `⚠️ **Vitórias por W.O.:** ${stats.woVictories}`,

        `🪙 **Moedas:** ${stats.coins}`
      ].join('\n')
    );

  await interaction.reply({

    embeds: [
      embed
    ]
  });
}

/* =========================================================
   SOLICITAÇÕES DE ANÁLISE
========================================================= */

async function createAnalysisRequest(
  message,
  modality
) {

  const cfg =
    getGuildConfig(
      message.guild.id
    ).config;

  const channelId =
    modality === 'Mobile'

      ? cfg.mobileRequestsChannelId

      : cfg.emulatorRequestsChannelId;

  if (!channelId) {

    await message.reply({

      embeds: [
        makeEmbed(

          message.guild,

          '❌ CANAL NÃO CONFIGURADO',

          `O canal de solicitações de **${modality}** ainda não foi configurado em \`/config\`.`
        )
      ]
    });

    return;
  }

  const channel =
    await message.guild.channels.fetch(
      channelId
    ).catch(
      () => null
    );

  if (!channel?.isTextBased()) {

    await message.reply({

      embeds: [
        makeEmbed(

          message.guild,

          '❌ ERRO',

          'O canal configurado não foi encontrado.'
        )
      ]
    });

    return;
  }

  const embed =
    makeEmbed(

      message.guild,

      `🔎 SOLICITAÇÃO — ${modality.toUpperCase()}`,

      [
        `**Solicitante:** <@${message.author.id}>`,

        '',

        'Um Analista pode assumir esta solicitação pelo botão abaixo.'
      ].join('\n')
    );

  const row =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            `analysis_take:${message.id}:${modality}`
          )
          .setLabel(
            'Pegar análise'
          )
          .setStyle(
            ButtonStyle.Success
          )
      );

  await channel.send({

    embeds: [
      embed
    ],

    components: [
      row
    ]
  });

  await message.reply({

    embeds: [
      makeEmbed(

        message.guild,

        '✅ SOLICITAÇÃO ENVIADA',

        `Sua solicitação de análise de **${modality}** foi enviada para os Analistas.`
      )
    ]
  });
}/* =========================================================
   CONFIGURAÇÃO — /config
========================================================= */

function configMainEmbed(guild) {

  const cfg =
    getGuildConfig(guild.id).config;

  const roleMediator =
    cfg.mediatorRoleId
      ? `<@&${cfg.mediatorRoleId}>`
      : 'Não configurado';

  const roleAnalyst =
    cfg.analystRoleId
      ? `<@&${cfg.analystRoleId}>`
      : 'Não configurado';

  const mobileChannel =
    cfg.mobileRequestsChannelId
      ? `<#${cfg.mobileRequestsChannelId}>`
      : 'Não configurado';

  const emulatorChannel =
    cfg.emulatorRequestsChannelId
      ? `<#${cfg.emulatorRequestsChannelId}>`
      : 'Não configurado';

  const mediatorChannel =
    cfg.mediatorQueueChannelId
      ? `<#${cfg.mediatorQueueChannelId}>`
      : 'Não configurado';

  const category =
    cfg.betsCategoryId
      ? `<#${cfg.betsCategoryId}>`
      : 'Não configurado';

  return makeEmbed(

    guild,

    '⚙️ CONFIGURAÇÃO DO BOT',

    [
      '**Cargos**',
      `🛡️ Mediador: ${roleMediator}`,
      `🔎 Analista: ${roleAnalyst}`,

      '',

      '**Taxa**',
      `💰 ${money(cfg.fee)}`,

      '',

      '**Canais**',
      `📱 Mobile: ${mobileChannel}`,
      `🖥️ Emulador: ${emulatorChannel}`,
      `🛡️ Fila de Mediadores: ${mediatorChannel}`,

      '',

      '**Categoria das apostas**',
      `📁 ${category}`,

      '',

      '**Pix ADM**',
      `👤 Nome: ${cfg.pixName || 'Não configurado'}`,
      `🔑 Chave: ${cfg.pixKey || 'Não configurado'}`,
      `🖼️ QR Code: ${cfg.pixQrUrl ? 'Configurado' : 'Não configurado'}`,

      '',

      '**Aparência**',
      `🎨 Cor: ${cfg.embedColor}`,
      `🖼️ Foto: ${cfg.profilePicture ? 'Configurada' : 'Não configurada'}`
    ].join('\n')
  );
}

function configRows() {

  return [

    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId('config_roles')
          .setLabel('Cargos')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId('config_channels')
          .setLabel('Canais')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId('config_category')
          .setLabel('Categoria')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId('config_fee')
          .setLabel('Taxa')
          .setStyle(ButtonStyle.Secondary)
      ),

    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId('config_pix')
          .setLabel('Pix ADM')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId('config_appearance')
          .setLabel('Aparência')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId('config_refresh')
          .setLabel('Atualizar')
          .setStyle(ButtonStyle.Secondary)
      )
  ];
}

async function openConfig(
  interaction
) {

  if (!isAdmin(interaction.member)) {

    return ephemeral(
      interaction,
      '❌ Apenas administradores podem configurar o bot.'
    );
  }

  await interaction.reply({

    embeds: [
      configMainEmbed(
        interaction.guild
      )
    ],

    components:
      configRows(),

    ephemeral: true
  });
}

/* =========================================================
   CONFIGURAÇÃO DE CARGOS
========================================================= */

async function configRoles(
  interaction
) {

  const cfg =
    getGuildConfig(
      interaction.guild.id
    ).config;

  const mediatorSelect =
    new RoleSelectMenuBuilder()
      .setCustomId(
        'config_select_mediator'
      )
      .setPlaceholder(
        'Selecione o cargo de Mediador'
      )
      .setMinValues(1)
      .setMaxValues(1);

  const analystSelect =
    new RoleSelectMenuBuilder()
      .setCustomId(
        'config_select_analyst'
      )
      .setPlaceholder(
        'Selecione o cargo de Analista'
      )
      .setMinValues(1)
      .setMaxValues(1);

  const embed =
    makeEmbed(

      interaction.guild,

      '👥 CONFIGURAR CARGOS',

      [
        `Mediador atual: ${
          cfg.mediatorRoleId
            ? `<@&${cfg.mediatorRoleId}>`
            : 'Não configurado'
        }`,

        `Analista atual: ${
          cfg.analystRoleId
            ? `<@&${cfg.analystRoleId}>`
            : 'Não configurado'
        }`
      ].join('\n')
    );

  await interaction.update({

    embeds: [
      embed
    ],

    components: [

      new ActionRowBuilder()
        .addComponents(
          mediatorSelect
        ),

      new ActionRowBuilder()
        .addComponents(
          analystSelect
        ),

      new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(
              'config_back'
            )
            .setLabel('Voltar')
            .setStyle(
              ButtonStyle.Secondary
            )
        )
    ]
  });
}

/* =========================================================
   CONFIGURAÇÃO DE CANAIS
========================================================= */

async function configChannels(
  interaction
) {

  const channelSelect =
    new ChannelSelectMenuBuilder()
      .setCustomId(
        'config_select_channels'
      )
      .setPlaceholder(
        'Selecione os canais'
      )
      .setMinValues(1)
      .setMaxValues(3)
      .setChannelTypes(
        ChannelType.GuildText
      );

  const embed =
    makeEmbed(

      interaction.guild,

      '📺 CONFIGURAR CANAIS',

      [
        'Selecione até 3 canais.',

        '',

        'A ordem será:',

        '**1º** — Solicitações Mobile',
        '**2º** — Solicitações Emulador',
        '**3º** — Fila de Mediadores'
      ].join('\n')
    );

  await interaction.update({

    embeds: [
      embed
    ],

    components: [

      new ActionRowBuilder()
        .addComponents(
          channelSelect
        ),

      new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(
              'config_back'
            )
            .setLabel('Voltar')
            .setStyle(
              ButtonStyle.Secondary
            )
        )
    ]
  });
}

/* =========================================================
   CONFIGURAÇÃO DA CATEGORIA
========================================================= */

async function configCategory(
  interaction
) {

  const select =
    new ChannelSelectMenuBuilder()
      .setCustomId(
        'config_select_category'
      )
      .setPlaceholder(
        'Selecione a categoria das apostas'
      )
      .setMinValues(1)
      .setMaxValues(1)
      .setChannelTypes(
        ChannelType.GuildCategory
      );

  await interaction.update({

    embeds: [

      makeEmbed(

        interaction.guild,

        '📁 CATEGORIA DAS APOSTAS',

        'Selecione a categoria onde os canais privados das apostas serão criados.'
      )
    ],

    components: [

      new ActionRowBuilder()
        .addComponents(
          select
        ),

      new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(
              'config_back'
            )
            .setLabel('Voltar')
            .setStyle(
              ButtonStyle.Secondary
            )
        )
    ]
  });
}

/* =========================================================
   CONFIGURAÇÃO DA TAXA
========================================================= */

async function configFee(
  interaction
) {

  const modal =
    new ModalBuilder()
      .setCustomId(
        'config_fee_modal'
      )
      .setTitle(
        'Configurar taxa'
      );

  const input =
    new TextInputBuilder()
      .setCustomId(
        'fee'
      )
      .setLabel(
        'Taxa entre R$0,01 e R$0,50'
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setPlaceholder(
        'Ex: 0,10'
      )
      .setRequired(true)
      .setMaxLength(10);

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(input)
  );

  await interaction.showModal(
    modal
  );
}

/* =========================================================
   CONFIGURAÇÃO DO PIX
========================================================= */

async function configPix(
  interaction
) {

  const modal =
    new ModalBuilder()
      .setCustomId(
        'config_pix_modal'
      )
      .setTitle(
        'Pix ADM'
      );

  const name =
    new TextInputBuilder()
      .setCustomId(
        'pix_name'
      )
      .setLabel(
        'Nome'
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(false);

  const key =
    new TextInputBuilder()
      .setCustomId(
        'pix_key'
      )
      .setLabel(
        'Chave Pix'
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(false);

  const qr =
    new TextInputBuilder()
      .setCustomId(
        'pix_qr'
      )
      .setLabel(
        'URL da imagem do QR Code'
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(false);

  modal.addComponents(

    new ActionRowBuilder()
      .addComponents(name),

    new ActionRowBuilder()
      .addComponents(key),

    new ActionRowBuilder()
      .addComponents(qr)
  );

  await interaction.showModal(
    modal
  );
}

/* =========================================================
   CONFIGURAÇÃO DA APARÊNCIA
========================================================= */

async function configAppearance(
  interaction
) {

  const modal =
    new ModalBuilder()
      .setCustomId(
        'config_appearance_modal'
      )
      .setTitle(
        'Aparência dos Embeds'
      );

  const color =
    new TextInputBuilder()
      .setCustomId(
        'embed_color'
      )
      .setLabel(
        'Cor do Embed — HEX'
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setPlaceholder(
        '#5865F2'
      )
      .setRequired(false);

  const avatar =
    new TextInputBuilder()
      .setCustomId(
        'profile_picture'
      )
      .setLabel(
        'URL da foto do bot'
      )
      .setStyle(
        TextInputStyle.Short
      )
      .setRequired(false);

  modal.addComponents(

    new ActionRowBuilder()
      .addComponents(color),

    new ActionRowBuilder()
      .addComponents(avatar)
  );

  await interaction.showModal(
    modal
  );
}

/* =========================================================
   MODAL HANDLERS
========================================================= */

async function handleModal(
  interaction
) {

  if (
    !isAdmin(
      interaction.member
    )
  ) {

    return ephemeral(
      interaction,
      '❌ Apenas administradores podem fazer isso.'
    );
  }

  const cfg =
    getGuildConfig(
      interaction.guild.id
    ).config;

  if (
    interaction.customId ===
    'config_fee_modal'
  ) {

    const value =
      parseMoney(
        interaction.fields.getTextInputValue(
          'fee'
        )
      );

    if (
      value < 0.01 ||
      value > 0.50
    ) {

      return ephemeral(
        interaction,
        '❌ A taxa precisa estar entre **R$0,01 e R$0,50**.'
      );
    }

    cfg.fee =
      Number(
        value.toFixed(2)
      );

    saveDb();

    return ephemeral(
      interaction,
      `✅ Taxa configurada para **${money(cfg.fee)}**.`
    );
  }

  if (
    interaction.customId ===
    'config_pix_modal'
  ) {

    cfg.pixName =
      interaction.fields
        .getTextInputValue(
          'pix_name'
        )
        .trim();

    cfg.pixKey =
      interaction.fields
        .getTextInputValue(
          'pix_key'
        )
        .trim();

    cfg.pixQrUrl =
      interaction.fields
        .getTextInputValue(
          'pix_qr'
        )
        .trim();

    saveDb();

    return ephemeral(
      interaction,
      '✅ Dados do Pix atualizados.'
    );
  }

  if (
    interaction.customId ===
    'config_appearance_modal'
  ) {

    const color =
      interaction.fields
        .getTextInputValue(
          'embed_color'
        )
        .trim();

    const avatar =
      interaction.fields
        .getTextInputValue(
          'profile_picture'
        )
        .trim();

    if (
      color &&
      !validColor(color)
    ) {

      return ephemeral(
        interaction,
        '❌ A cor precisa estar no formato HEX, por exemplo `#5865F2`.'
      );
    }

    if (color) {

      cfg.embedColor =
        color;
    }

    if (avatar) {

      cfg.profilePicture =
        avatar;

      await client.user
        .setAvatar(avatar)
        .catch(
          () => {}
        );
    }

    saveDb();

    return ephemeral(
      interaction,
      '✅ Aparência atualizada.'
    );
  }
}

/* =========================================================
   INTERAÇÕES DE CONFIGURAÇÃO
========================================================= */

async function handleConfigInteraction(
  interaction
) {

  if (
    !isAdmin(
      interaction.member
    )
  ) {

    return ephemeral(
      interaction,
      '❌ Apenas administradores podem configurar o bot.'
    );
  }

  const id =
    interaction.customId;

  if (
    id === 'config_back' ||
    id === 'config_refresh'
  ) {

    return interaction.update({

      embeds: [
        configMainEmbed(
          interaction.guild
        )
      ],

      components:
        configRows()
    });
  }

  if (
    id === 'config_roles'
  ) {

    return configRoles(
      interaction
    );
  }

  if (
    id === 'config_channels'
  ) {

    return configChannels(
      interaction
    );
  }

  if (
    id === 'config_category'
  ) {

    return configCategory(
      interaction
    );
  }

  if (
    id === 'config_fee'
  ) {

    return configFee(
      interaction
    );
  }

  if (
    id === 'config_pix'
  ) {

    return configPix(
      interaction
    );
  }

  if (
    id === 'config_appearance'
  ) {

    return configAppearance(
      interaction
    );
  }

  if (
    id === 'config_select_mediator'
  ) {

    const roleId =
      interaction.values[0];

    getGuildConfig(
      interaction.guild.id
    ).config.mediatorRoleId =
      roleId;

    saveDb();

    return ephemeral(
      interaction,
      '✅ Cargo de Mediador configurado.'
    );
  }

  if (
    id === 'config_select_analyst'
  ) {

    const roleId =
      interaction.values[0];

    getGuildConfig(
      interaction.guild.id
    ).config.analystRoleId =
      roleId;

    saveDb();

    return ephemeral(
      interaction,
      '✅ Cargo de Analista configurado.'
    );
  }

  if (
    id === 'config_select_channels'
  ) {

    const values =
      interaction.values;

    const cfg =
      getGuildConfig(
        interaction.guild.id
      ).config;

    cfg.mobileRequestsChannelId =
      values[0] || '';

    cfg.emulatorRequestsChannelId =
      values[1] || '';

    cfg.mediatorQueueChannelId =
      values[2] || '';

    saveDb();

    await publishMediatorQueue(
      interaction.guild
    );

    return ephemeral(
      interaction,
      '✅ Canais configurados.'
    );
  }

  if (
    id === 'config_select_category'
  ) {

    getGuildConfig(
      interaction.guild.id
    ).config.betsCategoryId =
      interaction.values[0];

    saveDb();

    return ephemeral(
      interaction,
      '✅ Categoria das apostas configurada.'
    );
  }
}

/* =========================================================
   BOTÕES DE FILA
========================================================= */

async function handleQueueButton(
  interaction
) {

  const parts =
    interaction.customId.split(':');

  const action =
    parts[0];

  const guildId =
    parts[1];

  const format =
    parts[2];

  const modality =
    parts[3];

  const value =
    Number(parts[4]);

  const gelo =
    parts[5] || '';

  if (
    guildId !==
    interaction.guild.id
  ) {
    return;
  }

  const q =
    getQueue(
      guildId,
      format,
      modality,
      value,
      gelo
    );

  if (
    action ===
    'queue_leave'
  ) {

    const index =
      q.users.indexOf(
        interaction.user.id
      );

    if (index === -1) {

      return ephemeral(
        interaction,
        '⚠️ Você não está nesta fila.'
      );
    }

    q.users.splice(
      index,
      1
    );

    await interaction.update({

      embeds: [
        queueEmbed(
          interaction.guild,
          q
        )
      ],

      components:
        queueButtons(q)
    });

    return;
  }

  if (
    action ===
    'queue_join' ||
    action ===
    'queue_join_gelo'
  ) {

    if (
      q.users.includes(
        interaction.user.id
      )
    ) {

      return ephemeral(
        interaction,
        '⚠️ Você já está nesta fila.'
      );
    }

    const needed =
      FORMATS[q.format];

    if (
      q.users.length >=
      needed
    ) {

      return ephemeral(
        interaction,
        '❌ Esta fila já está cheia.'
      );
    }

    q.users.push(
      interaction.user.id
    );

    await interaction.update({

      embeds: [
        queueEmbed(
          interaction.guild,
          q
        )
      ],

      components:
        queueButtons(q)
    });

    if (
      q.users.length >=
      needed
    ) {

      const match =
        await createBetFromQueue(
          interaction.guild,
          q
        );

      if (!match) {

        return;
      }
    }
  }
}

/* =========================================================
   BOTÕES DA FILA DE MEDIADORES
========================================================= */

async function handleMediatorQueueButton(
  interaction
) {

  if (
    !isMediator(
      interaction.member
    )
  ) {

    return ephemeral(
      interaction,
      '❌ Somente usuários com o cargo **Mediador** podem entrar na fila.'
    );
  }

  const list =
    getMediatorQueue(
      interaction.guild.id
    );

  if (
    interaction.customId ===
    'medqueue_join'
  ) {

    if (
      list.includes(
        interaction.user.id
      )
    ) {

      return ephemeral(
        interaction,
        '⚠️ Você já está na fila de mediadores.'
      );
    }

    list.push(
      interaction.user.id
    );

    saveDb();

    await interaction.update({

      embeds: [
        mediatorQueueEmbed(
          interaction.guild
        )
      ],

      components:
        mediatorQueueButtons()
    });

    return;
  }

  if (
    interaction.customId ===
    'medqueue_leave'
  ) {

    const index =
      list.indexOf(
        interaction.user.id
      );

    if (index === -1) {

      return ephemeral(
        interaction,
        '⚠️ Você não está na fila de mediadores.'
      );
    }

    list.splice(
      index,
      1
    );

    saveDb();

    await interaction.update({

      embeds: [
        mediatorQueueEmbed(
          interaction.guild
        )
      ],

      components:
        mediatorQueueButtons()
    });
  }
}

/* =========================================================
   BOTÕES DE APOSTA
========================================================= */

async function handleBetButton(
  interaction
) {

  const parts =
    interaction.customId.split(':');

  const action =
    parts[0];

  const matchId =
    parts.slice(1).join(':');

  const match =
    matches.get(
      matchId
    );

  if (!match) {

    return ephemeral(
      interaction,
      '❌ Esta aposta não está mais ativa.'
    );
  }

  if (
    action ===
    'bet_confirm'
  ) {

    return confirmBet(
      interaction,
      match
    );
  }

  if (
    action ===
    'bet_cancel'
  ) {

    return cancelBet(
      interaction,
      match
    );
  }
}

/* =========================================================
   BOTÕES DO MEDIADOR
========================================================= */

async function handleMediatorButton(
  interaction
) {

  const parts =
    interaction.customId.split(':');

  const action =
    parts[0];

  const matchId =
    parts.slice(1).join(':');

  const match =
    matches.get(
      matchId
    );

  if (!match) {

    return ephemeral(
      interaction,
      '❌ Aposta não encontrada.'
    );
  }

  if (
    !isMediator(
      interaction.member
    )
  ) {

    return ephemeral(
      interaction,
      '❌ Apenas Mediadores podem usar este painel.'
    );
  }

  if (
    action ===
    'med_winner'
  ) {

    return winnerMenu(
      interaction,
      match
    );
  }

  if (
    action ===
    'med_wo'
  ) {

    return woMenu(
      interaction,
      match
    );
  }

  if (
    action ===
    'med_finish'
  ) {

    return finalizeBet(
      interaction,
      match
    );
  }
}

/* =========================================================
   SELEÇÃO DE RESULTADO
========================================================= */

async function handleResultSelect(
  interaction
) {

  const parts =
    interaction.customId.split(':');

  const action =
    parts[0];

  const matchId =
    parts.slice(1).join(':');

  const match =
    matches.get(
      matchId
    );

  if (!match) {

    return ephemeral(
      interaction,
      '❌ Aposta não encontrada.'
    );
  }

  if (
    !isMediator(
      interaction.member
    )
  ) {

    return ephemeral(
      interaction,
      '❌ Apenas Mediadores podem registrar resultados.'
    );
  }

  const selectedId =
    interaction.values[0];

  if (
    action ===
    'winner_select'
  ) {

    const loserIds =
      match.players.filter(
        id =>
          id !== selectedId
      );

    registerNormalVictory(

      interaction.guild.id,

      selectedId,

      loserIds
    );

    match.status =
      'result_registered';

    await interaction.update({

      embeds: [
        makeEmbed(

          interaction.guild,

          '🏆 VITÓRIA REGISTRADA',

          [
            `🏆 Vencedor: <@${selectedId}>`,

            '',

            `**+1 vitória**`,
            `**+1 vitória normal**`,
            `**+1 moeda**`,

            '',

            'As derrotas dos demais jogadores também foram registradas.'
          ].join('\n')
        )
      ],

      components: []
    });

    return;
  }

  if (
    action ===
    'wo_select'
  ) {

    registerWOVictory(

      interaction.guild.id,

      selectedId
    );

    match.status =
      'wo_registered';

    await interaction.update({

      embeds: [
        makeEmbed(

          interaction.guild,

          '⚠️ W.O. REGISTRADO',

          [
            `Jogador: <@${selectedId}>`,

            '',

            '**+1 vitória por W.O.**',

            '',

            'Nenhuma vitória normal, moeda ou derrota foi adicionada.'
          ].join('\n')
        )
      ],

      components: []
    });
  }
}

/* =========================================================
   BOTÕES DA SALA
========================================================= */

async function handleRoomButton(
  interaction
) {

  const parts =
    interaction.customId.split(':');

  const action =
    parts[0];

  const matchId =
    parts.slice(1).join(':');

  const match =
    matches.get(
      matchId
    );

  if (!match) {

    return ephemeral(
      interaction,
      '❌ Aposta não encontrada.'
    );
  }

  if (
    action ===
    'copy_room_id'
  ) {

    return ephemeral(

      interaction,

      `📋 ID da sala: \`${match.roomId}\`\n\nToque/copie o número acima.`
    );
  }

  if (
    action ===
    'copy_room_pass'
  ) {

    return ephemeral(

      interaction,

      `📋 Senha da sala: \`${match.roomPassword}\`\n\nToque/copie o número acima.`
    );
  }
}

/* =========================================================
   ANALISTA — PEGAR SOLICITAÇÃO
========================================================= */

async function takeAnalysis(
  interaction
) {

  if (
    !isAnalyst(
      interaction.member
    )
  ) {

    return ephemeral(
      interaction,
      '❌ Apenas usuários com o cargo **Analista** podem pegar análises.'
    );
  }

  const parts =
    interaction.customId.split(':');

  const originalMessageId =
    parts[1];

  const modality =
    parts.slice(2).join(':');

  await interaction.update({

    embeds: [
      makeEmbed(

        interaction.guild,

        `🔎 ANÁLISE ${modality.toUpperCase()}`,

        [
          `**Analista:** <@${interaction.user.id}>`,

          '',

          'Esta solicitação foi assumida por um Analista.'
        ].join('\n')
      )
    ],

    components: []
  });

  console.log(
    `Análise ${modality} assumida. Solicitação original: ${originalMessageId}`
  );
}

/* =========================================================
   COMANDO /FILA
========================================================= */

async function commandFila(
  interaction
) {

  if (!isAdmin(interaction.member)) {

    return ephemeral(
      interaction,
      '❌ Apenas administradores podem criar o painel de filas.'
    );
  }

  const format =
    interaction.options.getString(
      'formato'
    );

  const modality =
    interaction.options.getString(
      'modalidade'
    );

  const channel =
    interaction.options.getChannel(
      'canal'
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {

    return ephemeral(
      interaction,
      '❌ Escolha um canal de texto válido.'
    );
  }

  await interaction.deferReply({
    ephemeral: true
  });

  /*
   * Valores em ordem crescente.
   * O primeiro é enviado primeiro e o último por último,
   * fazendo o maior valor ficar visualmente acima do menor
   * no canal.
   */

  for (
    const value of VALUES_ASC
  ) {

    const geloOptions =
      format === '1x1'

        ? ['', 'Gelo Normal', 'Gelo Infinito']

        : [''];

    for (
      const gelo of geloOptions
    ) {

      const q =
        getQueue(
          interaction.guild.id,
          format,
          modality,
          value,
          gelo
        );

      const message =
        await channel.send({

          embeds: [
            queueEmbed(
              interaction.guild,
              q
            )
          ],

          components:
            queueButtons(q)
        });

      q.messageId =
        message.id;

      q.channelId =
        channel.id;
    }
  }

  await interaction.editReply({

    embeds: [
      makeEmbed(

        interaction.guild,

        '✅ FILAS CRIADAS',

        [
          `**Formato:** ${format}`,
          `**Modalidade:** ${modality}`,
          `**Canal:** <#${channel.id}>`,

          '',

          'Os valores foram publicados em ordem crescente.'
        ].join('\n')
      )
    ]
  });
}

/* =========================================================
   REGISTRO DOS COMANDOS
========================================================= */

const commands = [

  new SlashCommandBuilder()
    .setName('config')
    .setDescription(
      'Configura o bot'
    ),

  new SlashCommandBuilder()
    .setName('fila')
    .setDescription(
      'Cria as filas de apostas'
    )
    .addStringOption(
      option =>
        option
          .setName('formato')
          .setDescription(
            'Formato da partida'
          )
          .setRequired(true)
          .addChoices(

            {
              name: '1x1',
              value: '1x1'
            },

            {
              name: '2x2',
              value: '2x2'
            },

            {
              name: '3x3',
              value: '3x3'
            },

            {
              name: '4x4',
              value: '4x4'
            }
          )
    )
    .addStringOption(
      option =>
        option
          .setName('modalidade')
          .setDescription(
            'Modalidade da partida'
          )
          .setRequired(true)
          .addChoices(

            {
              name: 'Mobile',
              value: 'Mobile'
            },

            {
              name: 'Emulador',
              value: 'Emulador'
            },

            {
              name: 'Misto',
              value: 'Misto'
            }
          )
    )
    .addChannelOption(
      option =>
        option
          .setName('canal')
          .setDescription(
            'Canal onde as filas serão publicadas'
          )
          .setRequired(true)
          .addChannelTypes(
            ChannelType.GuildText
          )
    ),

  new SlashCommandBuilder()
    .setName('p')
    .setDescription(
      'Mostra suas estatísticas públicas'
    ),

  new SlashCommandBuilder()
    .setName('med')
    .setDescription(
      'Abre o painel do mediador nesta aposta'
    )
].map(
  command =>
    command.toJSON()
);

/* =========================================================
   EVENTO READY
========================================================= */

client.once(
  'ready',
  async () => {

    console.log('');
    console.log(
      '========================================'
    );

    console.log(
      `🤖 Bot online: ${client.user.tag}`
    );

    console.log(
      `🆔 ID: ${client.user.id}`
    );

    console.log(
      `🌐 Servidores: ${client.guilds.cache.size}`
    );

    console.log(
      '========================================'
    );

    for (
      const guild of client.guilds.cache.values()
    ) {

      try {

        await guild.commands.set(
          commands
        );

        getGuildConfig(
          guild.id
        );

        console.log(
          `✅ Comandos registrados em: ${guild.name}`
        );

      } catch (error) {

        console.error(
          `❌ Erro registrando comandos em ${guild.name}:`,
          error
        );
      }
    }

    for (
      const guild of client.guilds.cache.values()
    ) {

      await publishMediatorQueue(
        guild
      ).catch(
        () => {}
      );
    }
  }
);

/* =========================================================
   INTERACTIONS
========================================================= */

client.on(
  'interactionCreate',
  async interaction => {

    try {

      if (
        interaction.isChatInputCommand()
      ) {

        if (
          interaction.commandName ===
          'config'
        ) {

          return openConfig(
            interaction
          );
        }

        if (
          interaction.commandName ===
          'fila'
        ) {

          return commandFila(
            interaction
          );
        }

        if (
          interaction.commandName ===
          'p'
        ) {

          return publicStats(
            interaction
          );
        }

        if (
          interaction.commandName ===
          'med'
        ) {

          return showMediatorMenu(
            interaction
          );
        }
      }

      if (
        interaction.isModalSubmit()
      ) {

        return handleModal(
          interaction
        );
      }

      if (
        interaction.isRoleSelectMenu() ||
        interaction.isChannelSelectMenu()
      ) {

        return handleConfigInteraction(
          interaction
        );
      }

      if (
        interaction.isStringSelectMenu()
      ) {

        if (
          interaction.customId
            .startsWith(
              'winner_select:'
            ) ||
          interaction.customId
            .startsWith(
              'wo_select:'
            )
        ) {

          return handleResultSelect(
            interaction
          );
        }
      }

      if (
        interaction.isButton()
      ) {

        const id =
          interaction.customId;

        if (
          id.startsWith(
            'config_'
          )
        ) {

          return handleConfigInteraction(
            interaction
          );
        }

        if (
          id ===
          'medqueue_join' ||
          id ===
          'medqueue_leave'
        ) {

          return handleMediatorQueueButton(
            interaction
          );
        }

        if (
          id.startsWith(
            'queue_'
          )
        ) {

          return handleQueueButton(
            interaction
          );
        }

        if (
          id.startsWith(
            'bet_'
          )
        ) {

          return handleBetButton(
            interaction
          );
        }

        if (
          id.startsWith(
            'med_'
          )
        ) {

          return handleMediatorButton(
            interaction
          );
        }

        if (
          id.startsWith(
            'copy_room_'
          )
        ) {

          return handleRoomButton(
            interaction
          );
        }

        if (
          id.startsWith(
            'analysis_take:'
          )
        ) {

          return takeAnalysis(
            interaction
          );
        }
      }

    } catch (error) {

      console.error(
        '❌ Erro na interação:',
        error
      );

      if (
        interaction.replied ||
        interaction.deferred
      ) {

        await interaction
          .followUp({
            content:
              '❌ Ocorreu um erro ao processar esta ação.',
            ephemeral: true
          })
          .catch(
            () => {}
          );

      } else {

        await interaction
          .reply({
            content:
              '❌ Ocorreu um erro ao processar esta ação.',
            ephemeral: true
          })
          .catch(
            () => {}
          );
      }
    }
  }
);

/* =========================================================
   PREFIX COMMANDS
========================================================= */

client.on(
  'messageCreate',
  async message => {

    try {

      if (
        message.author.bot ||
        !message.guild
      ) {
        return;
      }

      const content =
        message.content.trim();

      /*
       * .ssmob
       */
      if (
        content.toLowerCase() ===
        '.ssmob'
      ) {

        return createAnalysisRequest(
          message,
          'Mobile'
        );
      }

      /*
       * .ssemu
       */
      if (
        content.toLowerCase() ===
        '.ssemu'
      ) {

        return createAnalysisRequest(
          message,
          'Emulador'
        );
      }

      /*
       * .med
       */
      if (
        content.toLowerCase() ===
        '.med'
      ) {

        if (
          !isMediator(
            message.member
          )
        ) {

          return message.reply({

            embeds: [
              makeEmbed(

                message.guild,

                '❌ SEM PERMISSÃO',

                'Apenas usuários com o cargo **Mediador** podem usar `.med`.'
              )
            ]
          });
        }

        const match =
          findMatchByChannel(
            message.channel.id
          );

        if (!match) {

          return message.reply({

            embeds: [
              makeEmbed(

                message.guild,

                '❌ APOSTA NÃO ENCONTRADA',

                'Este canal não possui uma aposta ativa.'
              )
            ]
          });
        }

        const embed =
          makeEmbed(

            message.guild,

            '🛡️ PAINEL DO MEDIADOR',

            [
              `**Formato:** ${match.format}`,
              `**Modalidade:** ${match.modality}`,
              `**Valor:** ${money(match.value)}`,

              '',

              '**Jogadores:**',

              match.players
                .map(
                  (id, index) =>
                    `${index + 1}. <@${id}>`
                )
                .join('\n')
            ].join('\n')
          );

        const row =
          new ActionRowBuilder()
            .addComponents(

              new ButtonBuilder()
                .setCustomId(
                  `med_winner:${match.id}`
                )
                .setLabel(
                  'Escolher vencedor'
                )
                .setStyle(
                  ButtonStyle.Success
                ),

              new ButtonBuilder()
                .setCustomId(
                  `med_wo:${match.id}`
                )
                .setLabel(
                  'Vitória por W.O.'
                )
                .setStyle(
                  ButtonStyle.Primary
                ),

              new ButtonBuilder()
                .setCustomId(
                  `med_finish:${match.id}`
                )
                .setLabel(
                  'Finalizar aposta'
                )
                .setStyle(
                  ButtonStyle.Danger
                )
            );

        return message.channel.send({

          embeds: [
            embed
          ],

          components: [
            row
          ]
        });
      }

      /*
       * ID + SENHA DA SALA
       *
       * Só processa em canais
       * que possuem uma aposta ativa.
       */
      const match =
        findMatchByChannel(
          message.channel.id
        );

      if (
        !match ||
        !match.roomStarted
      ) {
        return;
      }

      if (
        !isMediator(
          message.member
        )
      ) {
        return;
      }

      const room =
        extractRoomData(
          message.content
        );

      if (!room) {
        return;
      }

      await publishRoomData(
        message.channel,
        match,
        room
      );

    } catch (error) {

      console.error(
        '❌ Erro no messageCreate:',
        error
      );
    }
  }
);

/* =========================================================
   ENTRADA DO BOT
========================================================= */

process.on(
  'unhandledRejection',
  error => {

    console.error(
      '❌ Unhandled Rejection:',
      error
    );
  }
);

process.on(
  'uncaughtException',
  error => {

    console.error(
      '❌ Uncaught Exception:',
      error
    );
  }
);

client.login(
  TOKEN
);
