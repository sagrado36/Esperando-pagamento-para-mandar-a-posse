require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionsBitField,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'database.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_DB = {
  guilds: {},
  queues: {},
  bets: {},
  mediators: {},
  counters: {}
};

function loadDB() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DB, null, 2));
    return structuredClone(DEFAULT_DB);
  }

  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

const db = loadDB();

function saveDB() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function getGuildConfig(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      mediatorRole: null,
      analystRole: null,

      pix: {
        name: '',
        key: '',
        qrCode: ''
      },

      channels: {
        channel1: null,
        channel2: null,
        bets: null,
        mediators: null
      },

      appearance: {
        avatar: null,
        embedColor: '#000000'
      },

      adminFee: 1
    };

    saveDB();
  }

  return db.guilds[guildId];
}

const BET_VALUES = [
  { cents: 30, label: 'R$ 0,30' },
  { cents: 50, label: 'R$ 0,50' },
  { cents: 75, label: 'R$ 0,75' },
  { cents: 100, label: 'R$ 1,00' },
  { cents: 200, label: 'R$ 2,00' },
  { cents: 300, label: 'R$ 3,00' },
  { cents: 500, label: 'R$ 5,00' },
  { cents: 700, label: 'R$ 7,00' },
  { cents: 1000, label: 'R$ 10,00' },
  { cents: 2000, label: 'R$ 20,00' },
  { cents: 5000, label: 'R$ 50,00' },
  { cents: 10000, label: 'R$ 100,00' }
];

const FORMATS = ['1x1', '2x2', '3x3', '4x4'];
const MODES = ['mobile', 'emulador', 'misto'];

function money(cents) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function sanitizeChannelName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 90);
}

function hasMediatorRole(member, guildConfig) {
  if (!member || !guildConfig.mediatorRole) return false;
  return member.roles.cache.has(guildConfig.mediatorRole);
}

function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function getQueueKey(guildId, format, mode, value, type = 'normal') {
  return `${guildId}:${format}:${mode}:${value}:${type}`;
}

function getBetId() {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return id;
}

function getEmbed(guildConfig, title, description = '') {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(guildConfig.appearance.embedColor || '#000000')
    .setTimestamp();
}

function queueEmbed(guildConfig, format, mode, value, type = 'normal') {
  const valueInfo = BET_VALUES.find(v => v.cents === value);

  let description =
    `**Formato:** ${format}\n` +
    `**Modalidade:** ${mode}\n` +
    `**Valor:** ${valueInfo ? valueInfo.label : money(value)}\n\n`;

  if (format === '1x1') {
    description += type === 'infinite'
      ? 'Entre na fila infinita para encontrar seu próximo adversário automaticamente.'
      : 'Entre na fila normal para encontrar um adversário.';
  } else {
    description += 'Entre na fila e aguarde outro jogador para formar a aposta.';
  }

  return getEmbed(
    guildConfig,
    `🎮 Fila ${format} • ${mode}`,
    description
  );
}

function queueButtons(format, mode, value) {
  const buttons = [];

  if (format === '1x1') {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`queue_normal:${format}:${mode}:${value}`)
        .setLabel('Normal')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`queue_infinite:${format}:${mode}:${value}`)
        .setLabel('Fila infinito')
        .setStyle(ButtonStyle.Secondary)
    );
  } else {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`queue_join:${format}:${mode}:${value}`)
        .setLabel('Entrar na fila')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(`queue_leave:${format}:${mode}:${value}`)
      .setLabel('Sair da fila')
      .setStyle(ButtonStyle.Danger)
  );

  return new ActionRowBuilder().addComponents(buttons);
}

function parseQueueId(customId) {
  const parts = customId.split(':');

  return {
    action: parts[0],
    format: parts[1],
    mode: parts[2],
    value: Number(parts[3])
  };
}

function parseAmountFromChannel(channelName) {
  const match = channelName.match(/(\d+(?:[.,]\d+)?)\s*(?:reais?|r\$)?/i);

  if (!match) return null;

  const value = Number(match[1].replace(',', '.'));

  if (!Number.isFinite(value)) return null;

  return Math.round(value * 100);
}

function getNextMediator(guildId) {
  const guildMediators = db.mediators[guildId];

  if (!guildMediators || guildMediators.length === 0) {
    return null;
  }

  if (!db.counters[guildId]) {
    db.counters[guildId] = {
      mediatorIndex: 0
    };
  }

  const index =
    db.counters[guildId].mediatorIndex % guildMediators.length;

  const mediatorId = guildMediators[index];

  db.counters[guildId].mediatorIndex =
    (index + 1) % guildMediators.length;

  saveDB();

  return mediatorId;
}

function ensureMediatorList(guildId) {
  if (!db.mediators[guildId]) {
    db.mediators[guildId] = [];
    saveDB();
  }

  return db.mediators[guildId];
}

async function refreshMediatorList(guild) {
  const config = getGuildConfig(guild.id);

  if (!config.mediatorRole || !config.channels.mediators) {
    return;
  }

  const role = guild.roles.cache.get(config.mediatorRole);
  const channel = guild.channels.cache.get(config.channels.mediators);

  if (!role || !channel) return;

  const members = role.members.map(member => member.id);

  db.mediators[guild.id] = members;
  saveDB();

  return members;
}

function mediatorQueueEmbed(guildConfig, guild) {
  const list = ensureMediatorList(guild.id);

  let description =
    'Entre na fila para receber apostas automaticamente.\n\n';

  if (list.length === 0) {
    description += '🔴 **Nenhum mediador disponível.**';
  } else {
    description += `🟢 **Mediadores na fila:** ${list.length}`;
  }

  return getEmbed(
    guildConfig,
    '👤 Fila de Mediadores',
    description
  );
}

function mediatorQueueButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mediator_queue_join')
      .setLabel('Entrar na fila')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('mediator_queue_leave')
      .setLabel('Sair da fila')
      .setStyle(ButtonStyle.Danger)
  );
}

function memberIsInMediatorQueue(guildId, memberId) {
  return ensureMediatorList(guildId).includes(memberId);
}

function addMediatorToQueue(guildId, memberId) {
  const list = ensureMediatorList(guildId);

  if (!list.includes(memberId)) {
    list.push(memberId);
    saveDB();
  }

  return list;
}

function removeMediatorFromQueue(guildId, memberId) {
  const list = ensureMediatorList(guildId);

  const index = list.indexOf(memberId);

  if (index !== -1) {
    list.splice(index, 1);
    saveDB();
  }

  return list;
}

function getAvailableMediator(guildId) {
  const list = ensureMediatorList(guildId);

  if (list.length === 0) return null;

  return getNextMediator(guildId);
}

async function createPrivateBetChannel(guild, player1, player2, mediatorId, betData) {
  const config = getGuildConfig(guild.id);

  const parent =
    config.channels.bets
      ? guild.channels.cache.get(config.channels.bets)
      : null;

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: player1.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    },
    {
      id: player2.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    }
  ];

  if (mediatorId) {
    overwrites.push({
      id: mediatorId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels
      ]
    });
  }

  const channel = await guild.channels.create({
    name: sanitizeChannelName(
      `aposta-${money(betData.value).replace(/[^\d]/g, '')}`
    ),
    type: ChannelType.GuildText,
    parent: parent?.type === ChannelType.GuildCategory ? parent.id : undefined,
    permissionOverwrites: overwrites
  });

  return channel;
}

function confirmationButtons(betId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bet_confirm:${betId}`)
      .setLabel('Confirmar')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`bet_cancel:${betId}`)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Danger)
  );
}

function pixEmbed(config, bet) {
  const description =
    `**Valor da aposta:** ${money(bet.value)} por jogador\n\n` +
    `**Nome:** ${config.pix.name || 'Não configurado'}\n` +
    `**Chave Pix:** ${config.pix.key || 'Não configurada'}\n\n` +
    'Após o pagamento, aguarde a conferência do mediador.';

  const embed = getEmbed(
    config,
    '💠 Pagamento da aposta',
    description
  );

  if (config.pix.qrCode) {
    embed.setImage(config.pix.qrCode);
  }

  return embed;
}

function salaCriadaEmbed(id, senha) {
  return new EmbedBuilder()
    .setTitle('Sala criada')
    .setDescription(
      'A sala será iniciada automaticamente em **3 a 5 minutos**.'
    )
    .addFields(
      {
        name: 'ID da sala',
        value: `\`${id}\``,
        inline: true
      },
      {
        name: 'Senha da sala',
        value: `\`${senha}\``,
        inline: true
      }
    )
    .setColor('#000000');
}

function salaButtons(id, senha) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`copy_room_id:${Buffer.from(id).toString('base64')}`)
      .setLabel('Copiar ID')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`copy_room_pass:${Buffer.from(senha).toString('base64')}`)
      .setLabel('Copiar senha')
      .setStyle(ButtonStyle.Secondary)
  );
}

function medMenu(betId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`med_menu:${betId}`)
      .setPlaceholder('Selecione uma ação')
      .addOptions([
        {
          label: 'Escolher vencedor',
          description: 'Registra vitória para um jogador e derrota para o outro.',
          value: 'winner'
        },
        {
          label: 'Vitória por W.O',
          description: 'Finaliza sem adicionar vitória ou derrota.',
          value: 'wo'
        },
        {
          label: 'Finalizar a aposta',
          description: 'Finaliza a aposta sem alterar resultados.',
          value: 'finish'
        }
      ])
  );
}

function winnerButtons(betId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`winner:${betId}:player1`)
      .setLabel('Jogador 1')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`winner:${betId}:player2`)
      .setLabel('Jogador 2')
      .setStyle(ButtonStyle.Success)
  );
}

function registerBet(guildId, bet) {
  if (!db.bets[guildId]) {
    db.bets[guildId] = {};
  }

  db.bets[guildId][bet.id] = bet;
  saveDB();
}

function getBet(guildId, betId) {
  return db.bets[guildId]?.[betId] || null;
}

function updateBet(guildId, betId, data) {
  const bet = getBet(guildId, betId);

  if (!bet) return null;

  Object.assign(bet, data);
  saveDB();

  return bet;
}

function queueObject(guildId, format, mode, value, type) {
  const key = getQueueKey(guildId, format, mode, value, type);

  if (!db.queues[key]) {
    db.queues[key] = [];
  }

  return db.queues[key];
}

function removeFromAllQueues(guildId, userId) {
  for (const key of Object.keys(db.queues)) {
    if (!key.startsWith(`${guildId}:`)) continue;

    db.queues[key] = db.queues[key].filter(
      id => id !== userId
    );
  }

  saveDB();
}

function addToQueue(guildId, format, mode, value, type, userId) {
  const queue = queueObject(guildId, format, mode, value, type);

  if (!queue.includes(userId)) {
    queue.push(userId);
    saveDB();
  }

  return queue;
}

function removeFromQueue(guildId, format, mode, value, type, userId) {
  const queue = queueObject(guildId, format, mode, value, type);

  const index = queue.indexOf(userId);

  if (index !== -1) {
    queue.splice(index, 1);
    saveDB();
  }

  return queue;
}

async function tryMatchQueue(guild, format, mode, value, type) {
  const queue = queueObject(
    guild.id,
    format,
    mode,
    value,
    type
  );

  if (queue.length < 2) {
    return null;
  }

  const player1Id = queue.shift();
  const player2Id = queue.shift();

  saveDB();

  const player1 =
    await guild.members.fetch(player1Id).catch(() => null);

  const player2 =
    await guild.members.fetch(player2Id).catch(() => null);

  if (!player1 || !player2) {
    return null;
  }

  const mediatorId = getAvailableMediator(guild.id);

  if (!mediatorId) {
    queue.unshift(player2Id, player1Id);
    saveDB();
    return {
      error: 'Não há mediadores disponíveis.'
    };
  }

  const betId = getBetId();

  const bet = {
    id: betId,
    guildId: guild.id,
    format,
    mode,
    value,
    type,
    player1: player1.id,
    player2: player2.id,
    mediator: mediatorId,
    channelId: null,
    confirmed: [],
    roomCreated: false,
    roomId: null,
    roomPassword: null,
    result: null,
    finished: false,
    createdAt: Date.now()
  };

  const channel =
    await createPrivateBetChannel(
      guild,
      player1,
      player2,
      mediatorId,
      bet
    );

  bet.channelId = channel.id;

  registerBet(guild.id, bet);

  const config = getGuildConfig(guild.id);

  const embed = getEmbed(
    config,
    '🎮 Aposta encontrada!',
    `**${player1.user.username}** x **${player2.user.username}**\n\n` +
    `**Formato:** ${format}\n` +
    `**Modalidade:** ${mode}\n` +
    `**Valor:** ${money(value)}\n\n` +
    'Conversem sobre as regras e, quando estiverem de acordo, os dois jogadores devem clicar em **Confirmar**.'
  );

  await channel.send({
    content: `<@${player1.id}> <@${player2.id}> <@${mediatorId}>`,
    embeds: [embed],
    components: [confirmationButtons(betId)]
  });

  return bet;
}

async function handleQueueButton(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);

  if (!hasMediatorRole(interaction.member, guildConfig)) {
    return interaction.reply({
      content: '❌ Você precisa ter o cargo de mediador para usar este comando.',
      ephemeral: true
    });
  }

  const parsed = parseQueueId(interaction.customId);

  let type = 'normal';

  if (parsed.action === 'queue_infinite') {
    type = 'infinite';
  }

  if (parsed.action === 'queue_join') {
    type = 'normal';
  }

  if (parsed.action === 'queue_leave') {
    removeFromAllQueues(
      interaction.guildId,
      interaction.user.id
    );

    return interaction.reply({
      content: '✅ Você saiu da fila.',
      ephemeral: true
    });
  }

  removeFromAllQueues(
    interaction.guildId,
    interaction.user.id
  );

  addToQueue(
    interaction.guildId,
    parsed.format,
    parsed.mode,
    parsed.value,
    type,
    interaction.user.id
  );

  await interaction.reply({
    content: '✅ Você entrou na fila. Aguarde um adversário.',
    ephemeral: true
  });

  await tryMatchQueue(
    interaction.guild,
    parsed.format,
    parsed.mode,
    parsed.value,
    type
  );
}

client.once('ready', async () => {
  console.log(`Bot conectado como ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    await refreshMediatorList(guild).catch(() => {});
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const config = getGuildConfig(message.guild.id);

  if (!hasMediatorRole(message.member, config)) {
    return;
  }

  const command = message.content.trim().toLowerCase();

  if (command === '.ssmob') {
    if (!config.channels.channel1) {
      return message.reply(
        '❌ O canal do `.ssmob` ainda não foi configurado.'
      );
    }

    const channel =
      message.guild.channels.cache.get(config.channels.channel1);

    if (!channel) {
      return message.reply(
        '❌ O canal configurado para o `.ssmob` não existe mais.'
      );
    }

    const embed = getEmbed(
      config,
      '🔎 Análise solicitada',
      'Uma análise foi solicitada.\n\n' +
      'Um analista disponível pode assumir esta análise pelo botão abaixo.'
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('analyst_take_mob')
        .setLabel('Assumir análise')
        .setStyle(ButtonStyle.Primary)
    );

    await channel.send({
      embeds: [embed],
      components: [row]
    });

    return message.reply({
      content: '✅ Solicitação de análise enviada.',
      ephemeral: true
    }).catch(() => {});
  }

  if (command === '.ssemu') {
    if (!config.channels.channel2) {
      return message.reply(
        '❌ O canal do `.ssemu` ainda não foi configurado.'
      );
    }

    const channel =
      message.guild.channels.cache.get(config.channels.channel2);

    if (!channel) {
      return message.reply(
        '❌ O canal configurado para o `.ssemu` não existe mais.'
      );
    }

    const embed = getEmbed(
      config,
      '🔎 Análise solicitada',
      'Uma análise para PC/emulador foi solicitada.\n\n' +
      'Um analista disponível pode assumir esta análise pelo botão abaixo.'
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('analyst_take_emu')
        .setLabel('Assumir análise')
        .setStyle(ButtonStyle.Primary)
    );

    await channel.send({
      embeds: [embed],
      components: [row]
    });

    return message.reply({
      content: '✅ Solicitação de análise enviada.',
      ephemeral: true
    }).catch(() => {});
  }

  if (command === '.med') {
    const embed = getEmbed(
      config,
      '⚖️ Controle da aposta',
      'Use o menu abaixo para administrar a aposta.'
    );

    await message.channel.send({
      embeds: [embed],
      components: [medMenu('manual')]
    });
  }
});

async function handleAnalystButton(interaction) {
  const config = getGuildConfig(interaction.guildId);

  if (!config.analystRole) {
    return interaction.reply({
      content: '❌ O cargo de analista ainda não foi configurado.',
      ephemeral: true
    });
  }

  if (!interaction.member.roles.cache.has(config.analystRole)) {
    return interaction.reply({
      content: '❌ Você precisa ter o cargo de analista para assumir uma análise.',
      ephemeral: true
    });
  }

  await interaction.reply({
    content: '✅ Você assumiu esta análise.',
    ephemeral: true
  });

  const channel =
    interaction.channel;

  await channel.send(
    `🔎 Análise assumida por <@${interaction.user.id}>.`
  );
}

async function handleBetConfirmation(interaction, betId) {
  const bet = getBet(interaction.guildId, betId);

  if (!bet) {
    return interaction.reply({
      content: '❌ Esta aposta não existe mais.',
      ephemeral: true
    });
  }

  if (
    interaction.user.id !== bet.player1 &&
    interaction.user.id !== bet.player2
  ) {
    return interaction.reply({
      content: '❌ Apenas os jogadores desta aposta podem confirmar.',
      ephemeral: true
    });
  }

  if (!bet.confirmed.includes(interaction.user.id)) {
    bet.confirmed.push(interaction.user.id);
    saveDB();
  }

  if (bet.confirmed.length < 2) {
    return interaction.reply({
      content: '✅ Sua confirmação foi registrada. Aguardando o outro jogador.',
      ephemeral: true
    });
  }

  const config = getGuildConfig(interaction.guildId);

  await interaction.reply({
    content: '✅ Os dois jogadores confirmaram a aposta.',
    ephemeral: true
  });

  await interaction.channel.send({
    embeds: [pixEmbed(config, bet)]
  });

  const med = interaction.guild.members.cache.get(
    bet.mediator
  );

  if (med) {
    await interaction.channel.send(
      `⚖️ Mediador responsável: <@${bet.mediator}>`
    );
  }
}

async function handleBetCancel(interaction, betId) {
  const bet = getBet(interaction.guildId, betId);

  if (!bet) {
    return interaction.reply({
      content: '❌ Esta aposta não existe mais.',
      ephemeral: true
    });
  }

  if (
    interaction.user.id !== bet.player1 &&
    interaction.user.id !== bet.player2 &&
    interaction.user.id !== bet.mediator
  ) {
    return interaction.reply({
      content: '❌ Você não pode cancelar esta aposta.',
      ephemeral: true
    });
  }

  await interaction.reply({
    content: 'A aposta foi cancelada, o canal será deletado em 15 segundos.'
  });

  bet.finished = true;
  bet.result = 'cancelled';
  saveDB();

  setTimeout(async () => {
    const channel = interaction.guild.channels.cache.get(
      bet.channelId
    );

    if (channel) {
      await channel.delete('Aposta cancelada').catch(() => {});
    }
  }, 15000);
}async function handleMedMenu(interaction, betId, action) {
  const bet = getBet(interaction.guildId, betId);

  if (!bet) {
    return interaction.reply({
      content: '❌ Esta aposta não existe mais.',
      ephemeral: true
    });
  }

  if (interaction.user.id !== bet.mediator) {
    return interaction.reply({
      content: '❌ Apenas o mediador responsável pode usar este menu.',
      ephemeral: true
    });
  }

  if (bet.finished) {
    return interaction.reply({
      content: '❌ Esta aposta já foi finalizada.',
      ephemeral: true
    });
  }

  if (action === 'winner') {
    const embed = getEmbed(
      getGuildConfig(interaction.guildId),
      '🏆 Escolher vencedor',
      'Selecione abaixo qual jogador venceu a aposta.'
    );

    return interaction.reply({
      embeds: [embed],
      components: [winnerButtons(betId)],
      ephemeral: true
    });
  }

  if (action === 'wo') {
    bet.finished = true;
    bet.result = 'wo';
    saveDB();

    await interaction.reply({
      content: '✅ Vitória por W.O registrada. Nenhuma vitória ou derrota foi adicionada.'
    });

    return;
  }

  if (action === 'finish') {
    bet.finished = true;
    bet.result = 'finished';
    saveDB();

    await interaction.reply({
      content: '✅ Aposta finalizada.'
    });

    return;
  }

  return interaction.reply({
    content: '❌ Ação inválida.',
    ephemeral: true
  });
}

async function handleWinner(interaction, betId, winner) {
  const bet = getBet(interaction.guildId, betId);

  if (!bet) {
    return interaction.reply({
      content: '❌ Esta aposta não existe mais.',
      ephemeral: true
    });
  }

  if (interaction.user.id !== bet.mediator) {
    return interaction.reply({
      content: '❌ Apenas o mediador responsável pode escolher o vencedor.',
      ephemeral: true
    });
  }

  if (bet.finished) {
    return interaction.reply({
      content: '❌ Esta aposta já foi finalizada.',
      ephemeral: true
    });
  }

  const winnerId =
    winner === 'player1'
      ? bet.player1
      : bet.player2;

  const loserId =
    winner === 'player1'
      ? bet.player2
      : bet.player1;

  bet.result = {
    type: 'winner',
    winner: winnerId,
    loser: loserId
  };

  bet.finished = true;

  saveDB();

  await interaction.reply(
    `🏆 <@${winnerId}> venceu a aposta!\n` +
    `❌ <@${loserId}> recebeu uma derrota.\n\n` +
    `💰 Prêmio: **${money(bet.value * 2)}**`
  );
}

async function handleRoomButton(interaction, encodedValue, type) {
  let value;

  try {
    value = Buffer.from(encodedValue, 'base64').toString('utf8');
  } catch {
    return interaction.reply({
      content: '❌ Não foi possível recuperar essa informação.',
      ephemeral: true
    });
  }

  if (!value) {
    return interaction.reply({
      content: '❌ Informação inválida.',
      ephemeral: true
    });
  }

  return interaction.reply({
    content: type === 'id'
      ? `ID da sala: \`${value}\``
      : `Senha da sala: \`${value}\``,
    ephemeral: true
  });
}

function findBetByChannel(guildId, channelId) {
  const guildBets = db.bets[guildId];

  if (!guildBets) return null;

  for (const bet of Object.values(guildBets)) {
    if (bet.channelId === channelId) {
      return bet;
    }
  }

  return null;
}

function parseRoomMessage(content) {
  const normalized = content.trim();

  const patterns = [
    /id\s*(?:da\s*)?sala\s*[:\-]?\s*(\S+).*senha\s*[:\-]?\s*(\S+)/i,
    /id\s*[:\-]?\s*(\S+).*senha\s*[:\-]?\s*(\S+)/i,
    /sala\s*[:\-]?\s*(\S+)\s+(\S+)/i
  ];

  for (const regex of patterns) {
    const match = normalized.match(regex);

    if (match) {
      return {
        id: match[1],
        password: match[2]
      };
    }
  }

  return null;
}

async function handleRoomCreated(message) {
  const bet = findBetByChannel(
    message.guild.id,
    message.channel.id
  );

  if (!bet) return;

  if (bet.mediator !== message.author.id) {
    return;
  }

  const room = parseRoomMessage(message.content);

  if (!room) return;

  bet.roomCreated = true;
  bet.roomId = room.id;
  bet.roomPassword = room.password;

  saveDB();

  const config = getGuildConfig(message.guild.id);

  const embed = salaCriadaEmbed(
    room.id,
    room.password
  );

  await message.channel.send({
    embeds: [embed],
    components: [salaButtons(room.id, room.password)]
  });

  const total = bet.value * 2;

  const newName = sanitizeChannelName(
    `pagar-${money(total)}`
  );

  await message.channel.setName(newName).catch(() => {});

  await message.channel.send(
    `💰 **Valor total a pagar: ${money(total)}**`
  );
}

async function configureRole(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);

  const modal = new ModalBuilder()
    .setCustomId('config_roles_modal')
    .setTitle('Configurar cargos');

  const mediatorInput = new TextInputBuilder()
    .setCustomId('mediator_role')
    .setLabel('ID do cargo Mediador')
    .setPlaceholder('Ex.: 123456789012345678')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const analystInput = new TextInputBuilder()
    .setCustomId('analyst_role')
    .setLabel('ID do cargo Analista')
    .setPlaceholder('Ex.: 123456789012345678')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(mediatorInput),
    new ActionRowBuilder().addComponents(analystInput)
  );

  await interaction.showModal(modal);
}

async function configurePix(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('config_pix_modal')
    .setTitle('Configurar Pix');

  const nameInput = new TextInputBuilder()
    .setCustomId('pix_name')
    .setLabel('Nome do ADM')
    .setPlaceholder('Nome que aparecerá no pagamento')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const keyInput = new TextInputBuilder()
    .setCustomId('pix_key')
    .setLabel('Chave Pix')
    .setPlaceholder('CPF, telefone, e-mail ou chave aleatória')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const qrInput = new TextInputBuilder()
    .setCustomId('pix_qr')
    .setLabel('URL da imagem do QR Code')
    .setPlaceholder('https://...')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(keyInput),
    new ActionRowBuilder().addComponents(qrInput)
  );

  await interaction.showModal(modal);
}

function channelSelect(customId, placeholder) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1)
  );
}

async function configureChannels(interaction) {
  const embed = getEmbed(
    getGuildConfig(interaction.guildId),
    '📺 Configurar canais',
    'Selecione qual canal deseja configurar.'
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('config_channel1')
      .setLabel('Canal 1 — ssMOB')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('config_channel2')
      .setLabel('Canal 2 — ssEMU')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });
}

async function configureBetChannel(interaction) {
  await interaction.reply({
    content: 'Selecione o canal onde ficarão os canais privados das apostas.',
    components: [
      channelSelect(
        'select_bet_channel',
        'Selecione o canal de apostas'
      )
    ],
    ephemeral: true
  });
}

async function configureMediatorChannel(interaction) {
  await interaction.reply({
    content: 'Selecione o canal onde a fila de mediadores será publicada.',
    components: [
      channelSelect(
        'select_mediator_channel',
        'Selecione o canal da fila de mediadores'
      )
    ],
    ephemeral: true
  });
}

async function configureAppearance(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('config_appearance_modal')
    .setTitle('Aparência do bot');

  const avatarInput = new TextInputBuilder()
    .setCustomId('avatar')
    .setLabel('Foto do perfil do bot — URL')
    .setPlaceholder('https://...')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const colorInput = new TextInputBuilder()
    .setCustomId('embed_color')
    .setLabel('Cor da embed')
    .setPlaceholder('#000000')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(avatarInput),
    new ActionRowBuilder().addComponents(colorInput)
  );

  await interaction.showModal(modal);
}

async function configureFee(interaction) {
  const options = [];

  for (let i = 1; i <= 50; i++) {
    options.push({
      label: `${money(i)} por atendimento`,
      value: String(i)
    });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('config_fee_select')
    .setPlaceholder('Selecione a taxa do ADM')
    .addOptions(options);

  await interaction.reply({
    content: 'Selecione a taxa que o ADM receberá por atender uma fila.',
    components: [
      new ActionRowBuilder().addComponents(menu)
    ],
    ephemeral: true
  });
}

async function configureQueue(interaction) {
  const embed = getEmbed(
    getGuildConfig(interaction.guildId),
    '🎮 Publicar filas',
    'Selecione o formato, a modalidade e o canal onde as filas serão publicadas.'
  );

  const formatMenu = new StringSelectMenuBuilder()
    .setCustomId('queue_format')
    .setPlaceholder('Selecione o formato')
    .addOptions(
      FORMATS.map(format => ({
        label: format,
        value: format
      }))
    );

  const modeMenu = new StringSelectMenuBuilder()
    .setCustomId('queue_mode')
    .setPlaceholder('Selecione a modalidade')
    .addOptions(
      MODES.map(mode => ({
        label: mode.charAt(0).toUpperCase() + mode.slice(1),
        value: mode
      }))
    );

  await interaction.reply({
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(formatMenu),
      new ActionRowBuilder().addComponents(modeMenu),
      channelSelect(
        'queue_channel',
        'Selecione o canal das filas'
      )
    ],
    ephemeral: true
  });
}

async function publishQueues(
  guild,
  format,
  mode,
  channelId
) {
  const config = getGuildConfig(guild.id);

  const channel = guild.channels.cache.get(channelId);

  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error('Canal inválido.');
  }

  const messages = [];

  for (const value of BET_VALUES) {
    const embed = queueEmbed(
      config,
      format,
      mode,
      value.cents,
      'normal'
    );

    const row = queueButtons(
      format,
      mode,
      value.cents
    );

    const msg = await channel.send({
      embeds: [embed],
      components: [row]
    });

    const normalKey = getQueueKey(
      guild.id,
      format,
      mode,
      value.cents,
      'normal'
    );

    const infiniteKey = getQueueKey(
      guild.id,
      format,
      mode,
      value.cents,
      'infinite'
    );

    if (!db.queues[normalKey]) {
      db.queues[normalKey] = [];
    }

    if (!db.queues[infiniteKey]) {
      db.queues[infiniteKey] = [];
    }

    messages.push(msg.id);
  }

  saveDB();

  return messages;
}

async function publishMediatorQueue(guild) {
  const config = getGuildConfig(guild.id);

  if (!config.channels.mediators) {
    throw new Error(
      'O canal da fila de mediadores ainda não foi configurado.'
    );
  }

  const channel =
    guild.channels.cache.get(
      config.channels.mediators
    );

  if (!channel) {
    throw new Error(
      'O canal configurado para mediadores não existe.'
    );
  }

  await refreshMediatorList(guild);

  const embed = mediatorQueueEmbed(
    config,
    guild
  );

  await channel.send({
    embeds: [embed],
    components: [mediatorQueueButtons()]
  });
}

function configMainComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('conf_roles')
        .setLabel('Cargos')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('conf_pix')
        .setLabel('Pix')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('conf_channels')
        .setLabel('Canais')
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('conf_bets')
        .setLabel('Apostas')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('conf_mediators')
        .setLabel('Mediadores')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('conf_appearance')
        .setLabel('Aparência')
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('conf_fee')
        .setLabel('Taxa ADM')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('conf_queue')
        .setLabel('Filas')
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

async function showConfig(interaction) {
  const config = getGuildConfig(interaction.guildId);

  const embed = getEmbed(
    config,
    '⚙️ Configuração do bot',
    'Use os botões abaixo para configurar o sistema.'
  );

  await interaction.reply({
    embeds: [embed],
    components: configMainComponents(),
    ephemeral: true
  });
}async function handleConfigButton(interaction) {
  const config = getGuildConfig(interaction.guildId);

  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: '❌ Você precisa ser administrador para configurar o bot.',
      ephemeral: true
    });
  }

  switch (interaction.customId) {
    case 'conf_roles':
      return configureRole(interaction);

    case 'conf_pix':
      return configurePix(interaction);

    case 'conf_channels':
      return configureChannels(interaction);

    case 'conf_bets':
      return configureBetChannel(interaction);

    case 'conf_mediators':
      return configureMediatorChannel(interaction);

    case 'conf_appearance':
      return configureAppearance(interaction);

    case 'conf_fee':
      return configureFee(interaction);

    case 'conf_queue':
      return configureQueue(interaction);

    case 'config_channel1':
      return interaction.update({
        content: 'Selecione o canal onde o `.ssmob` irá enviar as solicitações:',
        components: [
          channelSelect(
            'select_channel1',
            'Selecione o canal 1'
          )
        ]
      });

    case 'config_channel2':
      return interaction.update({
        content: 'Selecione o canal onde o `.ssemu` irá enviar as solicitações:',
        components: [
          channelSelect(
            'select_channel2',
            'Selecione o canal 2'
          )
        ]
      });

    default:
      return interaction.reply({
        content: '❌ Configuração desconhecida.',
        ephemeral: true
      });
  }
}

async function handleChannelSelect(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: '❌ Você precisa ser administrador.',
      ephemeral: true
    });
  }

  const channelId = interaction.values[0];
  const config = getGuildConfig(interaction.guildId);

  switch (interaction.customId) {
    case 'select_channel1':
      config.channels.channel1 = channelId;
      saveDB();

      return interaction.update({
        content: `✅ Canal 1 configurado: <#${channelId}>`,
        components: []
      });

    case 'select_channel2':
      config.channels.channel2 = channelId;
      saveDB();

      return interaction.update({
        content: `✅ Canal 2 configurado: <#${channelId}>`,
        components: []
      });

    case 'select_bet_channel':
      config.channels.bets = channelId;
      saveDB();

      return interaction.update({
        content: `✅ Canal das apostas configurado: <#${channelId}>`,
        components: []
      });

    case 'select_mediator_channel':
      config.channels.mediators = channelId;
      saveDB();

      await publishMediatorQueue(
        interaction.guild
      ).catch(() => {});

      return interaction.update({
        content: `✅ Canal da fila de mediadores configurado: <#${channelId}>`,
        components: []
      });

    case 'queue_channel': {
      const format =
        interaction.message.components
          .find(row =>
            row.components.some(
              component =>
                component.customId === 'queue_format'
            )
          )
          ?.components
          ?.find(
            component =>
              component.customId === 'queue_format'
          );

      if (!format) {
        return interaction.update({
          content: '❌ Selecione o formato e a modalidade antes do canal.',
          components: []
        });
      }

      return interaction.update({
        content:
          '❌ Para publicar as filas, selecione primeiro o formato e a modalidade e execute `/fila` novamente.',
        components: []
      });
    }

    default:
      return interaction.reply({
        content: '❌ Canal desconhecido.',
        ephemeral: true
      });
  }
}

async function handleConfigModal(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: '❌ Você precisa ser administrador.',
      ephemeral: true
    });
  }

  const config = getGuildConfig(interaction.guildId);

  if (interaction.customId === 'config_roles_modal') {
    const mediatorRole =
      interaction.fields.getTextInputValue(
        'mediator_role'
      ).trim();

    const analystRole =
      interaction.fields.getTextInputValue(
        'analyst_role'
      ).trim();

    const mediator =
      interaction.guild.roles.cache.get(mediatorRole);

    const analyst =
      interaction.guild.roles.cache.get(analystRole);

    if (!mediator || !analyst) {
      return interaction.reply({
        content:
          '❌ Um ou mais IDs de cargos são inválidos.',
        ephemeral: true
      });
    }

    config.mediatorRole = mediatorRole;
    config.analystRole = analystRole;

    await refreshMediatorList(
      interaction.guild
    );

    saveDB();

    return interaction.reply({
      content:
        `✅ Cargos configurados.\n\n` +
        `Mediador: <@&${mediatorRole}>\n` +
        `Analista: <@&${analystRole}>`,
      ephemeral: true
    });
  }

  if (interaction.customId === 'config_pix_modal') {
    const name =
      interaction.fields
        .getTextInputValue('pix_name')
        .trim();

    const key =
      interaction.fields
        .getTextInputValue('pix_key')
        .trim();

    const qr =
      interaction.fields
        .getTextInputValue('pix_qr')
        .trim();

    config.pix.name = name;
    config.pix.key = key;
    config.pix.qrCode = qr;

    saveDB();

    return interaction.reply({
      content: '✅ Dados Pix cadastrados com sucesso.',
      ephemeral: true
    });
  }

  if (interaction.customId === 'config_appearance_modal') {
    const avatar =
      interaction.fields
        .getTextInputValue('avatar')
        .trim();

    const color =
      interaction.fields
        .getTextInputValue('embed_color')
        .trim();

    if (
      color &&
      !/^#[0-9A-F]{6}$/i.test(color)
    ) {
      return interaction.reply({
        content:
          '❌ A cor precisa estar no formato hexadecimal, por exemplo `#000000`.',
        ephemeral: true
      });
    }

    if (avatar) {
      config.appearance.avatar = avatar;
    }

    if (color) {
      config.appearance.embedColor = color;
    }

    saveDB();

    if (avatar) {
      await client.user
        .setAvatar(avatar)
        .catch(() => {});
    }

    return interaction.reply({
      content: '✅ Aparência atualizada.',
      ephemeral: true
    });
  }

  return interaction.reply({
    content: '❌ Modal desconhecido.',
    ephemeral: true
  });
}

async function handleFeeSelect(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content:
        '❌ Você precisa ser administrador.',
      ephemeral: true
    });
  }

  const value = Number(
    interaction.values[0]
  );

  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > 50
  ) {
    return interaction.reply({
      content: '❌ Taxa inválida.',
      ephemeral: true
    });
  }

  const config =
    getGuildConfig(interaction.guildId);

  config.adminFee = value;

  saveDB();

  return interaction.update({
    content:
      `✅ Taxa do ADM definida para **${money(value)}** por atendimento.`,
    components: []
  });
}

async function handleQueueSetupMenu(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content:
        '❌ Você precisa ser administrador.',
      ephemeral: true
    });
  }

  if (interaction.customId === 'queue_format') {
    const format = interaction.values[0];

    const current = interaction.message.content || '';

    return interaction.update({
      content:
        `${current}\n\n✅ Formato selecionado: **${format}**`,
      components:
        interaction.message.components
          .map(row => row)
    });
  }

  if (interaction.customId === 'queue_mode') {
    const mode = interaction.values[0];

    return interaction.update({
      content:
        `✅ Modalidade selecionada: **${mode}**\n\n` +
        'Agora selecione o canal onde as filas serão publicadas.',
      components: [
        channelSelect(
          'queue_channel',
          'Selecione o canal das filas'
        )
      ]
    });
  }

  return interaction.reply({
    content:
      '❌ Opção desconhecida.',
    ephemeral: true
  });
}

async function handleMediatorQueueButton(interaction) {
  const config =
    getGuildConfig(interaction.guildId);

  if (
    !hasMediatorRole(
      interaction.member,
      config
    )
  ) {
    return interaction.reply({
      content:
        '❌ Apenas pessoas com o cargo Mediador podem entrar nesta fila.',
      ephemeral: true
    });
  }

  if (
    interaction.customId ===
    'mediator_queue_join'
  ) {
    if (
      memberIsInMediatorQueue(
        interaction.guildId,
        interaction.user.id
      )
    ) {
      return interaction.reply({
        content:
          '⚠️ Você já está na fila de mediadores.',
        ephemeral: true
      });
    }

    addMediatorToQueue(
      interaction.guildId,
      interaction.user.id
    );

    return interaction.reply({
      content:
        '✅ Você entrou na fila de mediadores.',
      ephemeral: true
    });
  }

  if (
    interaction.customId ===
    'mediator_queue_leave'
  ) {
    if (
      !memberIsInMediatorQueue(
        interaction.guildId,
        interaction.user.id
      )
    ) {
      return interaction.reply({
        content:
          '⚠️ Você não está na fila de mediadores.',
        ephemeral: true
      });
    }

    removeMediatorFromQueue(
      interaction.guildId,
      interaction.user.id
    );

    return interaction.reply({
      content:
        '✅ Você saiu da fila de mediadores.',
      ephemeral: true
    });
  }

  return interaction.reply({
    content:
      '❌ Ação inválida.',
    ephemeral: true
  });
}

async function handleInteraction(interaction) {
  try {
    if (interaction.isButton()) {
      if (
        interaction.customId.startsWith(
          'queue_'
        )
      ) {
        return handleQueueButton(
          interaction
        );
      }

      if (
        interaction.customId.startsWith(
          'analyst_take_'
        )
      ) {
        return handleAnalystButton(
          interaction
        );
      }

      if (
        interaction.customId.startsWith(
          'bet_confirm:'
        )
      ) {
        const betId =
          interaction.customId.split(':')[1];

        return handleBetConfirmation(
          interaction,
          betId
        );
      }

      if (
        interaction.customId.startsWith(
          'bet_cancel:'
        )
      ) {
        const betId =
          interaction.customId.split(':')[1];

        return handleBetCancel(
          interaction,
          betId
        );
      }

      if (
        interaction.customId.startsWith(
          'winner:'
        )
      ) {
        const parts =
          interaction.customId.split(':');

        return handleWinner(
          interaction,
          parts[1],
          parts[2]
        );
      }

      if (
        interaction.customId.startsWith(
          'copy_room_id:'
        )
      ) {
        return handleRoomButton(
          interaction,
          interaction.customId.split(':')[1],
          'id'
        );
      }

      if (
        interaction.customId.startsWith(
          'copy_room_pass:'
        )
      ) {
        return handleRoomButton(
          interaction,
          interaction.customId.split(':')[1],
          'password'
        );
      }

      if (
        interaction.customId ===
        'mediator_queue_join' ||
        interaction.customId ===
        'mediator_queue_leave'
      ) {
        return handleMediatorQueueButton(
          interaction
        );
      }

      if (
        interaction.customId.startsWith(
          'conf_'
        ) ||
        interaction.customId.startsWith(
          'config_'
        )
      ) {
        return handleConfigButton(
          interaction
        );
      }
    }

    if (
      interaction.isStringSelectMenu()
    ) {
      if (
        interaction.customId.startsWith(
          'select_'
        ) ||
        interaction.customId ===
          'queue_channel'
      ) {
        return handleChannelSelect(
          interaction
        );
      }

      if (
        interaction.customId ===
        'config_fee_select'
      ) {
        return handleFeeSelect(
          interaction
        );
      }

      if (
        interaction.customId ===
          'queue_format' ||
        interaction.customId ===
          'queue_mode'
      ) {
        return handleQueueSetupMenu(
          interaction
        );
      }

      if (
        interaction.customId.startsWith(
          'med_menu:'
        )
      ) {
        const betId =
          interaction.customId.split(':')[1];

        return handleMedMenu(
          interaction,
          betId,
          interaction.values[0]
        );
      }
    }

    if (interaction.isModalSubmit()) {
      return handleConfigModal(
        interaction
      );
    }

    if (interaction.isChatInputCommand()) {
      if (
        interaction.commandName ===
        'conf'
      ) {
        if (
          !isAdmin(interaction.member)
        ) {
          return interaction.reply({
            content:
              '❌ Você precisa ser administrador para usar `/conf`.',
            ephemeral: true
          });
        }

        return showConfig(
          interaction
        );
      }

      if (
        interaction.commandName ===
        'mediadores'
      ) {
        if (
          !isAdmin(interaction.member)
        ) {
          return interaction.reply({
            content:
              '❌ Você precisa ser administrador para usar `/mediadores`.',
            ephemeral: true
          });
        }

        try {
          await publishMediatorQueue(
            interaction.guild
          );

          return interaction.reply({
            content:
              '✅ Fila de mediadores publicada.',
            ephemeral: true
          });
        } catch (error) {
          return interaction.reply({
            content:
              `❌ ${error.message}`,
            ephemeral: true
          });
        }
      }

      if (
        interaction.commandName ===
        'fila'
      ) {
        if (
          !isAdmin(interaction.member)
        ) {
          return interaction.reply({
            content:
              '❌ Você precisa ser administrador para usar `/fila`.',
            ephemeral: true
          });
        }

        const format =
          interaction.options.getString(
            'formato',
            true
          );

        const mode =
          interaction.options.getString(
            'modalidade',
            true
          );

        const channel =
          interaction.options.getChannel(
            'canal',
            true
          );

        try {
          await publishQueues(
            interaction.guild,
            format,
            mode,
            channel.id
          );

          return interaction.reply({
            content:
              `✅ Filas **${format} ${mode}** publicadas no canal ${channel}.`,
            ephemeral: true
          });
        } catch (error) {
          return interaction.reply({
            content:
              `❌ Erro ao publicar as filas: ${error.message}`,
            ephemeral: true
          });
        }
      }
    }
  } catch (error) {
    console.error(
      'Erro em interação:',
      error
    );

    if (
      interaction.replied ||
      interaction.deferred
    ) {
      await interaction.followUp({
        content:
          '❌ Ocorreu um erro ao processar esta ação.',
        ephemeral: true
      }).catch(() => {});
    } else {
      await interaction.reply({
        content:
          '❌ Ocorreu um erro ao processar esta ação.',
        ephemeral: true
      }).catch(() => {});
    }
  }
}

client.on(
  'interactionCreate',
  handleInteraction
);

client.on(
  'messageCreate',
  async message => {
    if (
      message.author.bot ||
      !message.guild
    ) {
      return;
    }

    if (
      !message.content ||
      message.content.startsWith('/')
    ) {
      return;
    }

    await handleRoomCreated(
      message
    ).catch(error => {
      console.error(
        'Erro ao processar sala:',
        error
      );
    });
  }
);

process.on(
  'unhandledRejection',
  error => {
    console.error(
      'Unhandled rejection:',
      error
    );
  }
);

process.on(
  'uncaughtException',
  error => {
    console.error(
      'Uncaught exception:',
      error
    );
  }
);

if (!process.env.DISCORD_TOKEN) {
  console.error(
    '❌ DISCORD_TOKEN não configurado no arquivo .env'
  );
  process.exit(1);
}

client.login(
  process.env.DISCORD_TOKEN
);process.on(
  'unhandledRejection',
  error => {
    console.error(
      'Unhandled rejection:',
      error
    );
  }
);

process.on(
  'uncaughtException',
  error => {
    console.error(
      'Uncaught exception:',
      error
    );
  }
);

if (!process.env.DISCORD_TOKEN) {
  console.error(
    '❌ DISCORD_TOKEN não configurado no arquivo .env'
  );
  process.exit(1);
}

client.login(
  process.env.DISCORD_TOKEN
)
