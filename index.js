require('dotenv').config();

const {
  Client,
  Events,
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
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PREFIX = '.';

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    'Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID nas variáveis de ambiente.'
  );
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

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

function cloneDefaultDB() {
  return JSON.parse(JSON.stringify(DEFAULT_DB));
}

function loadDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return cloneDefaultDB();
    }

    const raw = fs.readFileSync(DB_FILE, 'utf8');

    if (!raw.trim()) {
      return cloneDefaultDB();
    }

    const parsed = JSON.parse(raw);

    return {
      ...cloneDefaultDB(),
      ...parsed,
      guilds: parsed.guilds || {},
      users: parsed.users || {},
      queues: parsed.queues || {},
      bets: parsed.bets || {},
      analyses: parsed.analyses || {},
    };
  } catch (error) {
    console.error('Erro ao carregar database:', error);
    return cloneDefaultDB();
  }
}

let db = loadDatabase();

function saveDatabase() {
  try {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(db, null, 2),
      'utf8'
    );
  } catch (error) {
    console.error('Erro ao salvar database:', error);
  }
}

const VALUES = [
  10000,
  5000,
  2000,
  1000,
  700,
  500,
  300,
  200,
  100,
  75,
  50,
  30,
];

const FORMATS = [
  '1x1',
  '2x2',
  '3x3',
  '4x4',
];

const MODES = [
  'mobile',
  'emulador',
  'misto',
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],

  partials: [
    Partials.Channel,
    Partials.Message,
  ],
});

const pendingAdminIds = new Map();

function getGuildConfig(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      mediatorRoleId: null,
      analystRoleId: null,

      analysisChannelMobile: null,
      analysisChannelEmulator: null,

      betsCategoryId: null,

      mediatorQueueChannelId: null,
      mediatorQueueMessageId: null,

      embedColor: '#5865F2',
      botAvatar: null,

      admFee: 1,

      pixAdmins: [],

      mediatorQueue: [],
      mediatorRotationIndex: 0,

      queueMessages: {},
    };

    saveDatabase();
  }

  const config = db.guilds[guildId];

  if (!Array.isArray(config.pixAdmins)) {
    config.pixAdmins = [];
  }

  if (!Array.isArray(config.mediatorQueue)) {
    config.mediatorQueue = [];
  }

  if (
    !config.queueMessages ||
    typeof config.queueMessages !== 'object'
  ) {
    config.queueMessages = {};
  }

  if (!config.embedColor) {
    config.embedColor = '#5865F2';
  }

  if (
    !Number.isInteger(Number(config.admFee)) ||
    Number(config.admFee) < 0
  ) {
    config.admFee = 1;
  }

  return config;
}

function formatMoney(cents) {
  const value = Number(cents || 0) / 100;

  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function requiredPlayers(format) {
  const map = {
    '1x1': 2,
    '2x2': 4,
    '3x3': 6,
    '4x4': 8,
  };

  return map[format] || 2;
}

function formatLabel(format) {
  return format;
}

function modeLabel(mode) {
  const labels = {
    mobile: '📱 Mobile',
    emulador: '🖥️ Emulador',
    misto: '🔀 Misto',
  };

  return labels[mode] || mode;
}

function valueLabel(value) {
  return formatMoney(value);
}

function queueKey(guildId, format, mode, value) {
  return [
    guildId,
    format,
    mode,
    String(value),
  ].join(':');
}

function betKey(guildId, queueId) {
  return [
    guildId,
    queueId,
  ].join(':');
}

function isAdministrator(member) {
  return Boolean(
    member &&
    member.permissions &&
    member.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  );
}

function hasMediatorRole(member, guildId) {
  if (!member) {
    return false;
  }

  const config = getGuildConfig(guildId);

  if (!config.mediatorRoleId) {
    return false;
  }

  return member.roles.cache.has(
    config.mediatorRoleId
  );
}

function isRegisteredMediator(guildId, userId) {
  const config = getGuildConfig(guildId);

  return config.mediatorQueue.some(
    (id) => String(id) === String(userId)
  );
}

function canUseMediatorSystem(member, guildId) {
  return (
    isAdministrator(member) ||
    hasMediatorRole(member, guildId) ||
    isRegisteredMediator(guildId, member?.id)
  );
}

function createEmbed(
  guildId,
  title,
  description
) {
  const config = getGuildConfig(guildId);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description || '')
    .setColor(config.embedColor || '#5865F2')
    .setTimestamp();

  if (config.botAvatar) {
    embed.setThumbnail(config.botAvatar);
  }

  return embed;
}

function createSmallEmbed(
  guildId,
  title,
  description
) {
  return createEmbed(
    guildId,
    title,
    description
  );
}

function queueStatusText(queue) {
  const max = requiredPlayers(queue.format);
  const current = Array.isArray(queue.players)
    ? queue.players.length
    : 0;

  if (current >= max) {
    return '🔴 **Fila cheia!** Aguardando jogadores compatíveis.';
  }

  return `🟢 **Aguardando jogadores:** ${current}/${max}`;
}

function queueEmbed(queue, guildId) {
  const max = requiredPlayers(queue.format);

  const players = Array.isArray(queue.players)
    ? queue.players
    : [];

  const playerText = players.length
    ? players
        .map(
          (id, index) =>
            `**${index + 1}.** <@${id}>`
        )
        .join('\n')
    : 'Nenhum jogador na fila.';

  let iceText = '';

  if (queue.format === '1x1') {
    const choices = queue.choices || {};

    const choiceLines = players.map((id) => {
      const choice = choices[id];

      let label = 'Não escolhido';

      if (choice === 'ice_normal') {
        label = '🧊 Gelo Normal';
      }

      if (choice === 'ice_infinite') {
        label = '♾️ Gelo Infinito';
      }

      return `<@${id}> — ${label}`;
    });

    iceText = [
      '',
      '**🧊 Tipo de Gelo:**',
      choiceLines.length
        ? choiceLines.join('\n')
        : 'Nenhum jogador escolheu.',
    ].join('\n');
  }

  return createEmbed(
    guildId,
    `🎮 FILA ${formatLabel(queue.format)} • ${modeLabel(queue.mode)}`,
    [
      `💰 **Valor:** ${formatMoney(queue.value)}`,
      '',
      queueStatusText(queue),
      '',
      '**👥 Jogadores:**',
      playerText,
      iceText,
    ].join('\n')
  );
}

function queueButtons(queue) {
  const rows = [];

  if (
    queue.format === '1x1' &&
    (!Array.isArray(queue.players) ||
      queue.players.length < requiredPlayers(queue.format))
  ) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `queue_join|${queue.id}|ice_normal`
          )
          .setLabel('🧊 Gelo Normal')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(
            `queue_join|${queue.id}|ice_infinite`
          )
          .setLabel('♾️ Gelo Infinito')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(
            `queue_leave|${queue.id}`
          )
          .setLabel('🚪 Sair')
          .setStyle(ButtonStyle.Danger)
      )
    );

    return rows;
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `queue_join|${queue.id}`
        )
        .setLabel('🎮 Entrar')
        .setStyle(ButtonStyle.Success)
        .setDisabled(
          Array.isArray(queue.players) &&
          queue.players.length >=
            requiredPlayers(queue.format)
        ),

      new ButtonBuilder()
        .setCustomId(
          `queue_leave|${queue.id}`
        )
        .setLabel('🚪 Sair')
        .setStyle(ButtonStyle.Danger)
    )
  );

  return rows;
}

function mediatorQueueEmbed(guildId) {
  const config = getGuildConfig(guildId);

  const ids = Array.isArray(config.mediatorQueue)
    ? config.mediatorQueue
    : [];

  const mentions = ids.length
    ? ids
        .map(
          (id, index) =>
            `**${index + 1}.** <@${id}>`
        )
        .join('\n')
    : 'Nenhum mediador na fila.';

  return createSmallEmbed(
    guildId,
    '🛡️ FILA DE MEDIADORES',
    [
      'Entre na fila para receber apostas de forma rotativa.',
      '',
      '**Mediadores na fila:**',
      mentions,
    ].join('\n')
  );
}

function mediatorQueueButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          'mediator_queue_join'
        )
        .setLabel('Entrar na fila')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          'mediator_queue_leave'
        )
        .setLabel('Sair da fila')
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function configMainEmbed(guild) {
  const config = getGuildConfig(
    guild.id
  );

  const mediatorCount =
    Array.isArray(config.mediatorQueue)
      ? config.mediatorQueue.length
      : 0;

  const adminCount =
    Array.isArray(config.pixAdmins)
      ? config.pixAdmins.length
      : 0;

  return createEmbed(
    guild.id,
    '⚙️ CONFIGURAÇÃO DO BOT',
    [
      'Configure todos os sistemas do bot por este painel.',
      '',
      `🎭 **Mediador:** ${
        config.mediatorRoleId
          ? `<@&${config.mediatorRoleId}>`
          : 'Não configurado'
      }`,

      `🔎 **Analista:** ${
        config.analystRoleId
          ? `<@&${config.analystRoleId}>`
          : 'Não configurado'
      }`,

      `📢 **Canal Mobile:** ${
        config.analysisChannelMobile
          ? `<#${config.analysisChannelMobile}>`
          : 'Não configurado'
      }`,

      `🖥️ **Canal Emulador:** ${
        config.analysisChannelEmulator
          ? `<#${config.analysisChannelEmulator}>`
          : 'Não configurado'
      }`,

      `🎲 **Categoria das apostas:** ${
        config.betsCategoryId
          ? `<#${config.betsCategoryId}>`
          : 'Não configurada'
      }`,

      `🛡️ **Mediadores cadastrados:** ${mediatorCount}`,

      `💳 **ADMs cadastrados:** ${adminCount}`,

      `💸 **Taxa do ADM:** ${formatMoney(
        config.admFee
      )}`,
    ].join('\n')
  );
}

function configButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          'config_roles'
        )
        .setLabel('Cargos')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          'config_channels'
        )
        .setLabel('Canais')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          'config_bets'
        )
        .setLabel('Apostas')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          'config_mediators'
        )
        .setLabel('Mediadores')
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          'config_appearance'
        )
        .setLabel('Aparência')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          'config_fee'
        )
        .setLabel('Taxa')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function backButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        'config_back'
      )
      .setLabel('Voltar')
      .setStyle(ButtonStyle.Secondary)
  );
}

function roleConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(
          'select_mediator_role'
        )
        .setPlaceholder(
          'Selecione o cargo Mediador'
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(
          'select_analyst_role'
        )
        .setPlaceholder(
          'Selecione o cargo Analista'
        )
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
        .setCustomId(
          'select_channel_mobile'
        )
        .setPlaceholder(
          'Selecione o Canal Mobile'
        )
        .setChannelTypes(
          ChannelType.GuildText
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          'select_channel_emulator'
        )
        .setPlaceholder(
          'Selecione o Canal Emulador'
        )
        .setChannelTypes(
          ChannelType.GuildText
        )
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
        .setCustomId(
          'select_bets_category'
        )
        .setPlaceholder(
          'Selecione a categoria das apostas'
        )
        .setChannelTypes(
          ChannelType.GuildCategory
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    backButton(),
  ];
}

function mediatorConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          'mediator_add'
        )
        .setLabel('Cadastrar Mediador')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          'mediator_list'
        )
        .setLabel('Ver Mediadores')
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          'admin_add'
        )
        .setLabel('Cadastrar ADM')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          'admin_list'
        )
        .setLabel('Ver ADMs')
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          'select_mediator_queue_channel'
        )
        .setPlaceholder(
          'Selecione o canal da fila de mediadores'
        )
        .setChannelTypes(
          ChannelType.GuildText
        )
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
        .setCustomId(
          'appearance_color'
        )
        .setLabel('Alterar cor')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(
          'appearance_avatar'
        )
        .setLabel('Alterar avatar')
        .setStyle(ButtonStyle.Secondary)
    ),

    backButton(),
  ];
}

function feeComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          'config_fee_set'
        )
        .setLabel('Configurar Taxa')
        .setStyle(ButtonStyle.Primary)
    ),

    backButton(),
  ];
}

function createAdminIdModal() {
  return new ModalBuilder()
    .setCustomId(
      'admin_id_modal'
    )
    .setTitle(
      'Cadastrar ADM'
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            'admin_user_id'
          )
          .setLabel(
            'ID do usuário Discord'
          )
          .setPlaceholder(
            'Exemplo: 123456789012345678'
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
      )
    );
}

function createAdminPixModal() {
  return new ModalBuilder()
    .setCustomId(
      'admin_pix_modal'
    )
    .setTitle(
      'Dados Pix do ADM'
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            'admin_name'
          )
          .setLabel(
            'Nome do ADM'
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            'admin_pix_key'
          )
          .setLabel(
            'Chave Pix'
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            'admin_pix_qr'
          )
          .setLabel(
            'QR Code URL (opcional)'
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(false)
      )
    );
}

function createMediatorModal() {
  return new ModalBuilder()
    .setCustomId(
      'mediator_add_modal'
    )
    .setTitle(
      'Cadastrar Mediador'
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            'mediator_user_id'
          )
          .setLabel(
            'ID do usuário Discord'
          )
          .setPlaceholder(
            'Exemplo: 123456789012345678'
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
      )
    );
}

function createFeeModal() {
  return new ModalBuilder()
    .setCustomId(
      'fee_modal'
    )
    .setTitle(
      'Configurar Taxa do ADM'
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            'adm_fee'
          )
          .setLabel(
            'Taxa em centavos'
          )
          .setPlaceholder(
            '1 = R$ 0,01 | 100 = R$ 1,00'
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
      )
    );
}

function createColorModal() {
  return new ModalBuilder()
    .setCustomId(
      'appearance_color_modal'
    )
    .setTitle(
      'Alterar cor'
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            'embed_color'
          )
          .setLabel(
            'Cor hexadecimal'
          )
          .setPlaceholder(
            '#5865F2'
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
      )
    );
}

function createAvatarModal() {
  return new ModalBuilder()
    .setCustomId(
      'appearance_avatar_modal'
    )
    .setTitle(
      'Alterar avatar'
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            'bot_avatar'
          )
          .setLabel(
            'URL da imagem'
          )
          .setPlaceholder(
            'https://exemplo.com/imagem.png'
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
      )
    );
}async function safeReply(interaction, data) {
  try {
    if (interaction.replied || interaction.deferred) return await interaction.followUp(data);
    return await interaction.reply(data);
  } catch (error) {
    console.error('Erro ao responder interação:', error);
  }
}

async function refreshQueueMessage(guildId, format, mode, value) {
  const c = getGuildConfig(guildId);
  const key = makeQueueKey(guildId, format, mode, value);
  const ref = c.queueMessages[key];
  if (!ref) return;

  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(ref.channelId);

    if (!channel?.isTextBased()) return;

    const message = await channel.messages.fetch(ref.messageId);

    await message.edit({
      embeds: [queueEmbed(guildId, format, mode, value)],
      components: queueButtons(format, mode, value)
    });
  } catch (error) {
    delete c.queueMessages[key];
    saveDatabase();
  }
}

async function refreshMediatorQueueMessage(guildId) {
  const c = getGuildConfig(guildId);

  if (!c.mediatorQueueChannelId || !c.mediatorQueueMessageId) return;

  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(c.mediatorQueueChannelId);

    const message = await channel.messages.fetch(c.mediatorQueueMessageId);

    await message.edit({
      embeds: [mediatorQueueEmbed(guildId)],
      components: mediatorQueueButtons()
    });
  } catch (error) {
    c.mediatorQueueMessageId = null;
    saveDatabase();
  }
}

async function publishQueues(guild, format, mode, channelId) {
  if (!FORMATS.includes(format)) {
    throw new Error('Formato inválido.');
  }

  if (!MODES.includes(mode)) {
    throw new Error('Modalidade inválida.');
  }

  if (!channelId) {
    throw new Error('Canal não informado.');
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null);

  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error('O canal selecionado não é um canal de texto válido.');
  }

  if (!channel.isSendable()) {
    throw new Error('Não tenho permissão para enviar mensagens nesse canal.');
  }

  const c = getGuildConfig(guild.id);
  const sent = [];

  // Valores do maior para o menor.
  for (const value of VALUES) {
    const key = makeQueueKey(guild.id, format, mode, value);

    let message = null;
    const old = c.queueMessages[key];

    if (old?.channelId === channel.id) {
      try {
        message = await channel.messages.fetch(old.messageId);
      } catch {
        message = null;
      }
    }

    if (message) {
      await message.edit({
        embeds: [queueEmbed(guild.id, format, mode, value)],
        components: queueButtons(format, mode, value)
      });
    } else {
      message = await channel.send({
        embeds: [queueEmbed(guild.id, format, mode, value)],
        components: queueButtons(format, mode, value)
      });
    }

    c.queueMessages[key] = {
      channelId: channel.id,
      messageId: message.id
    };

    sent.push(message);
  }

  saveDatabase();

  return sent;
}

async function joinQueue(interaction, format, mode, value, type = 'normal') {
  const guild = interaction.guild;

  if (!guild) return;

  const userId = interaction.user.id;
  const q = getQueue(guild.id, format, mode, value);

  if (q.includes(userId)) {
    return safeReply(interaction, {
      content: '❌ Você já está nessa fila.',
      ephemeral: true
    });
  }

  if (q.length >= requiredPlayers(format)) {
    return safeReply(interaction, {
      content: '❌ Essa fila já está cheia.',
      ephemeral: true
    });
  }

  // Sistema especial do 1x1:
  // cada jogador escolhe entre gelo normal e gelo infinito.
  if (format === '1x1') {
    if (!['ice_normal', 'ice_infinite'].includes(type)) {
      return safeReply(interaction, {
        content: '❌ Escolha um tipo de gelo válido.',
        ephemeral: true
      });
    }

    const choices = getQueueChoices(
      guild.id,
      format,
      mode,
      value
    );

    q.push(userId);
    choices[userId] = type;

    saveDatabase();

    // Quando existem dois jogadores, verifica o tipo de gelo.
    if (q.length === 2) {
      const a = q[0];
      const b = q[1];

      if (choices[a] === choices[b]) {
        try {
          await createPrivateBetChannel(
            guild,
            format,
            mode,
            value,
            [a, b]
          );

          q.splice(0, 2);

          delete choices[a];
          delete choices[b];

          saveDatabase();

          await refreshQueueMessage(
            guild.id,
            format,
            mode,
            value
          );

          return safeReply(interaction, {
            content: `✅ Aposta criada entre <@${a}> e <@${b}>.`,
            ephemeral: true
          });
        } catch (error) {
          q.splice(0, 2);
          q.push(a, b);

          saveDatabase();

          return safeReply(interaction, {
            content: `❌ Não foi possível criar a aposta: ${error.message}`,
            ephemeral: true
          });
        }
      }

      await refreshQueueMessage(
        guild.id,
        format,
        mode,
        value
      );

      return safeReply(interaction, {
        content:
          '⚠️ A fila está cheia, mas os tipos de gelo são diferentes. Aguarde uma combinação compatível ou saia da fila.',
        ephemeral: true
      });
    }

    await refreshQueueMessage(
      guild.id,
      format,
      mode,
      value
    );

    return safeReply(interaction, {
      content: '✅ Você entrou na fila.',
      ephemeral: true
    });
  }

  // 2x2, 3x3 e 4x4
  q.push(userId);

  saveDatabase();

  await refreshQueueMessage(
    guild.id,
    format,
    mode,
    value
  );

  if (q.length >= requiredPlayers(format)) {
    const players = q.splice(
      0,
      requiredPlayers(format)
    );

    saveDatabase();

    try {
      await createPrivateBetChannel(
        guild,
        format,
        mode,
        value,
        players
      );

      await refreshQueueMessage(
        guild.id,
        format,
        mode,
        value
      );

      return safeReply(interaction, {
        content: '✅ Fila completada! A aposta foi criada.',
        ephemeral: true
      });
    } catch (error) {
      q.unshift(...players);

      saveDatabase();

      await refreshQueueMessage(
        guild.id,
        format,
        mode,
        value
      );

      return safeReply(interaction, {
        content:
          `❌ Não foi possível criar a aposta: ${error.message}`,
        ephemeral: true
      });
    }
  }

  return safeReply(interaction, {
    content: '✅ Você entrou na fila.',
    ephemeral: true
  });
}

async function leaveQueue(interaction, format, mode, value) {
  const guild = interaction.guild;

  if (!guild) return;

  const q = getQueue(
    guild.id,
    format,
    mode,
    value
  );

  const i = q.indexOf(interaction.user.id);

  if (i === -1) {
    return safeReply(interaction, {
      content: '❌ Você não está nessa fila.',
      ephemeral: true
    });
  }

  q.splice(i, 1);

  if (format === '1x1') {
    delete getQueueChoices(
      guild.id,
      format,
      mode,
      value
    )[interaction.user.id];
  }

  saveDatabase();

  await refreshQueueMessage(
    guild.id,
    format,
    mode,
    value
  );

  return safeReply(interaction, {
    content: '✅ Você saiu da fila.',
    ephemeral: true
  });
}

function betEmbed(guildId, bet) {
  const status =
    bet.status === 'running'
      ? '🟢 Em andamento'
      : bet.status === 'cancelled'
        ? '🔴 Cancelada'
        : bet.status === 'finished'
          ? '⚫ Finalizada'
          : '🟡 Aguardando confirmação';

  return createEmbed(
    guildId,
    '🎮 APOSTA',
    `💰 **Valor:** ${formatMoney(bet.value)}
🎯 **Formato:** ${bet.format}
📱 **Modalidade:** ${modeLabel(bet.mode)}

👥 **Jogadores:**
${bet.players.map(id => `• <@${id}>`).join('\n')}

📌 **Status:** ${status}
🛡️ **Mediador:** ${bet.mediatorId ? `<@${bet.mediatorId}>` : 'Aguardando'}
🔎 **Analista:** ${bet.analystId ? `<@${bet.analystId}>` : 'Aguardando'}`
  );
}

function betButtons(bet) {
  if (!bet || bet.status !== 'waiting') {
    return [];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bet_confirm|${bet.id}`)
        .setLabel('✅ Confirmar')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`bet_cancel|${bet.id}`)
        .setLabel('❌ Cancelar')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function getNextMediator(guild) {
  const c = getGuildConfig(guild.id);

  if (!c.mediatorQueue.length) {
    return null;
  }

  c.mediatorQueue = [
    ...new Set(c.mediatorQueue)
  ];

  let i = Number(c.mediatorRotationIndex) || 0;

  if (i >= c.mediatorQueue.length) {
    i = 0;
  }

  const id = c.mediatorQueue[i];

  c.mediatorRotationIndex =
    (i + 1) % c.mediatorQueue.length;

  saveDatabase();

  return id;
}

async function assignMediator(guild, bet) {
  if (!bet.mediatorId) {
    return null;
  }

  try {
    const member = await guild.members.fetch(
      bet.mediatorId
    );

    const channel = await guild.channels.fetch(
      bet.channelId
    );

    if (!member || !channel) {
      return null;
    }

    await channel.permissionOverwrites.edit(
      member.id,
      {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      }
    );

    await channel.send({
      content: `🛡️ Mediador designado: ${member}`
    });

    return member;
  } catch (error) {
    console.error(
      'Erro ao atribuir mediador:',
      error
    );

    return null;
  }
}

async function assignAnalyst(guild, bet) {
  const c = getGuildConfig(guild.id);

  if (!c.analystRoleId) {
    return null;
  }

  try {
    await guild.members.fetch();

    const role = await guild.roles.fetch(
      c.analystRoleId
    );

    const analyst = role?.members?.first();

    if (!analyst) {
      return null;
    }

    bet.analystId = analyst.id;

    saveDatabase();

    const channel = await guild.channels.fetch(
      bet.channelId
    );

    if (channel) {
      await channel.permissionOverwrites.edit(
        analyst.id,
        {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        }
      );

      await channel.send({
        content: `🔎 Analista designado: ${analyst}`
      });
    }

    return analyst;
  } catch (error) {
    console.error(
      'Erro ao atribuir analista:',
      error
    );

    return null;
  }
}

async function createPrivateBetChannel(
  guild,
  format,
  mode,
  value,
  players
) {
  const c = getGuildConfig(guild.id);

  const betId = generateId('bet');

  const mediatorId = getNextMediator(guild);

  const channelName =
    `aposta-${format.toLowerCase()}-${betId.slice(-6)}`;

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel
      ]
    }
  ];

  for (const playerId of players) {
    overwrites.push({
      id: playerId,
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

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites: overwrites
  });

  const bet = {
    id: betId,
    guildId: guild.id,
    channelId: channel.id,
    format,
    mode,
    value,
    players,
    mediatorId,
    analystId: null,
    status: 'waiting',
    createdAt: Date.now()
  };

  client.db.bets[betId] = bet;

  saveDatabase();

  await channel.send({
    embeds: [
      betEmbed(
        guild.id,
        bet
      )
    ],
    components: betButtons(bet)
  });

  await assignMediator(
    guild,
    bet
  );

  await assignAnalyst(
    guild,
    bet
  );

  await refreshBetMessage(
    bet
  );

  return bet;
}async function refreshBetMessage(bet) {
  if (!bet?.channelId) return;

  try {
    const guild = await client.guilds.fetch(bet.guildId);
    const channel = await guild.channels.fetch(bet.channelId);

    if (!channel?.isTextBased()) return;

    const messages = await channel.messages.fetch({
      limit: 20
    });

    const botMessages = messages.filter(
      message =>
        message.author.id === client.user.id &&
        message.embeds.length > 0
    );

    const message = botMessages.first();

    if (!message) return;

    await message.edit({
      embeds: [
        betEmbed(
          bet.guildId,
          bet
        )
      ],
      components: betButtons(bet)
    });
  } catch (error) {
    console.error(
      'Erro ao atualizar mensagem da aposta:',
      error
    );
  }
}

async function handleBetConfirm(interaction, betId) {
  const bet = client.db.bets[betId];

  if (!bet) {
    return safeReply(interaction, {
      content: '❌ Aposta não encontrada.',
      ephemeral: true
    });
  }

  if (!bet.players.includes(interaction.user.id)) {
    return safeReply(interaction, {
      content: '❌ Você não participa dessa aposta.',
      ephemeral: true
    });
  }

  if (bet.status !== 'waiting') {
    return safeReply(interaction, {
      content: '⚠️ Essa aposta não está aguardando confirmação.',
      ephemeral: true
    });
  }

  if (!bet.confirmations) {
    bet.confirmations = [];
  }

  if (bet.confirmations.includes(interaction.user.id)) {
    return safeReply(interaction, {
      content: '⚠️ Você já confirmou essa aposta.',
      ephemeral: true
    });
  }

  bet.confirmations.push(
    interaction.user.id
  );

  if (
    bet.confirmations.length >=
    bet.players.length
  ) {
    bet.status = 'running';
    bet.startedAt = Date.now();
  }

  saveDatabase();

  await refreshBetMessage(
    bet
  );

  if (bet.status === 'running') {
    await interaction.channel.send({
      content:
        '🟢 **Aposta iniciada!** Todos os jogadores confirmaram.'
    });
  }

  return safeReply(interaction, {
    content: '✅ Sua confirmação foi registrada.',
    ephemeral: true
  });
}

async function handleBetCancel(interaction, betId) {
  const bet = client.db.bets[betId];

  if (!bet) {
    return safeReply(interaction, {
      content: '❌ Aposta não encontrada.',
      ephemeral: true
    });
  }

  const isPlayer =
    bet.players.includes(
      interaction.user.id
    );

  const isMediator =
    bet.mediatorId ===
    interaction.user.id;

  if (!isPlayer && !isMediator) {
    return safeReply(interaction, {
      content:
        '❌ Você não tem permissão para cancelar essa aposta.',
      ephemeral: true
    });
  }

  if (bet.status === 'finished') {
    return safeReply(interaction, {
      content: '❌ Essa aposta já foi finalizada.',
      ephemeral: true
    });
  }

  if (bet.status === 'cancelled') {
    return safeReply(interaction, {
      content: '⚠️ Essa aposta já foi cancelada.',
      ephemeral: true
    });
  }

  bet.status = 'cancelled';
  bet.cancelledBy = interaction.user.id;
  bet.cancelledAt = Date.now();

  saveDatabase();

  await refreshBetMessage(
    bet
  );

  try {
    await interaction.channel.send({
      content:
        `🔴 **Aposta cancelada** por <@${interaction.user.id}>.`
    });
  } catch {}

  return safeReply(interaction, {
    content: '✅ Aposta cancelada.',
    ephemeral: true
  });
}

async function handleQueueButton(
  interaction,
  action,
  format,
  mode,
  value
) {
  if (!FORMATS.includes(format)) {
    return safeReply(interaction, {
      content: '❌ Formato de fila inválido.',
      ephemeral: true
    });
  }

  if (!MODES.includes(mode)) {
    return safeReply(interaction, {
      content: '❌ Modalidade inválida.',
      ephemeral: true
    });
  }

  if (!VALUES.includes(value)) {
    return safeReply(interaction, {
      content: '❌ Valor de fila inválido.',
      ephemeral: true
    });
  }

  if (action === 'join') {
    return joinQueue(
      interaction,
      format,
      mode,
      value,
      'normal'
    );
  }

  if (action === 'leave') {
    return leaveQueue(
      interaction,
      format,
      mode,
      value
    );
  }

  if (action === 'ice_normal') {
    return joinQueue(
      interaction,
      format,
      mode,
      value,
      'ice_normal'
    );
  }

  if (action === 'ice_infinite') {
    return joinQueue(
      interaction,
      format,
      mode,
      value,
      'ice_infinite'
    );
  }

  return safeReply(interaction, {
    content: '❌ Ação de fila desconhecida.',
    ephemeral: true
  });
}

async function handleMediatorQueueButton(
  interaction,
  action
) {
  const guild = interaction.guild;

  if (!guild) {
    return safeReply(interaction, {
      content: '❌ Servidor não encontrado.',
      ephemeral: true
    });
  }

  const c = getGuildConfig(
    guild.id
  );

  const userId =
    interaction.user.id;

  if (action === 'join') {
    if (!c.mediatorQueue.includes(userId)) {
      c.mediatorQueue.push(userId);
      saveDatabase();
    }

    await refreshMediatorQueueMessage(
      guild.id
    );

    return safeReply(interaction, {
      content:
        '🛡️ Você entrou na fila de mediadores.',
      ephemeral: true
    });
  }

  if (action === 'leave') {
    const index =
      c.mediatorQueue.indexOf(userId);

    if (index === -1) {
      return safeReply(interaction, {
        content:
          '❌ Você não está na fila de mediadores.',
        ephemeral: true
      });
    }

    c.mediatorQueue.splice(
      index,
      1
    );

    if (
      c.mediatorRotationIndex >=
      c.mediatorQueue.length
    ) {
      c.mediatorRotationIndex = 0;
    }

    saveDatabase();

    await refreshMediatorQueueMessage(
      guild.id
    );

    return safeReply(interaction, {
      content:
        '✅ Você saiu da fila de mediadores.',
      ephemeral: true
    });
  }

  return safeReply(interaction, {
    content:
      '❌ Ação de mediador inválida.',
    ephemeral: true
  });
}

async function handleConfigButton(
  interaction,
  id
) {
  const guild = interaction.guild;

  if (!guild) {
    return safeReply(interaction, {
      content: '❌ Servidor não encontrado.',
      ephemeral: true
    });
  }

  if (
    !hasAdminPermission(
      interaction.member
    )
  ) {
    return safeReply(interaction, {
      content:
        '❌ Você não tem permissão para usar essa configuração.',
      ephemeral: true
    });
  }

  const c =
    getGuildConfig(guild.id);

  if (id === 'config_main') {
    return safeReply(interaction, {
      embeds: [
        configMainEmbed(guild.id)
      ],
      components:
        configMainComponents()
    });
  }

  if (id === 'config_roles') {
    return safeReply(interaction, {
      embeds: [
        createEmbed(
          guild.id,
          '👥 CONFIGURAÇÃO DE CARGOS',
          'Selecione abaixo o cargo que deseja configurar.'
        )
      ],
      components:
        roleConfigComponents()
    });
  }

  if (id === 'config_channels') {
    return safeReply(interaction, {
      embeds: [
        createEmbed(
          guild.id,
          '📺 CONFIGURAÇÃO DE CANAIS',
          'Selecione abaixo o canal correspondente a cada função.'
        )
      ],
      components:
        channelConfigComponents()
    });
  }

  if (id === 'config_bet') {
    return safeReply(interaction, {
      embeds: [
        createEmbed(
          guild.id,
          '🎮 CONFIGURAÇÃO DAS APOSTAS',
          `Formato atual das apostas:

💰 Valores: **${VALUES.length} filas**
📌 Primeiro valor: **${formatMoney(VALUES[0])}**
📌 Último valor: **${formatMoney(VALUES[VALUES.length - 1])}**

Taxa ADM atual:
**${formatMoney(c.admFee)}**`
        )
      ],
      components:
        betConfigComponents()
    });
  }

  if (id === 'config_mediators') {
    return safeReply(interaction, {
      embeds: [
        createEmbed(
          guild.id,
          '🛡️ MEDIADORES',
          `Mediadores cadastrados: **${c.mediatorQueue.length}**

${c.mediatorQueue.length
  ? c.mediatorQueue
      .map((userId, i) =>
        `${i + 1}. <@${userId}>`
      )
      .join('\n')
  : 'Nenhum mediador cadastrado.'}`
        )
      ],
      components:
        mediatorConfigComponents()
    });
  }

  if (id === 'config_appearance') {
    return safeReply(interaction, {
      embeds: [
        createEmbed(
          guild.id,
          '🎨 APARÊNCIA',
          `Cor atual: **${c.embedColor}**

Avatar personalizado:
${
  c.embedAvatar
    ? '✅ Configurado'
    : '❌ Não configurado'
}`
        )
      ],
      components:
        appearanceConfigComponents()
    });
  }

  if (id === 'config_fee') {
    return safeReply(
      interaction,
      {
        content:
          'Digite a taxa em centavos no formulário.',
        ephemeral: true,
        components: []
      }
    );
  }

  if (id === 'admin_add') {
    return interaction.showModal(
      createAdminIdModal()
    );
  }

  if (id === 'admin_list') {
    const admins =
      c.pixAdmins || [];

    const text =
      admins.length
        ? admins
            .map(
              (admin, i) =>
                `**${i + 1}. ${admin.name || 'Sem nome'}**\n` +
                `👤 <@${admin.userId || admin.id}>\n` +
                `💳 ${admin.key || 'Sem chave'}`
            )
            .join('\n\n')
        : 'Nenhum ADM cadastrado.';

    return safeReply(interaction, {
      embeds: [
        createEmbed(
          guild.id,
          '💳 ADMs CADASTRADOS',
          text
        )
      ],
      ephemeral: true
    });
  }

  return safeReply(interaction, {
    content:
      '❌ Configuração não encontrada.',
    ephemeral: true
  });
}

async function handleAdminIdModal(interaction) {
  const guild =
    interaction.guild;

  if (!guild) {
    return safeReply(interaction, {
      content: '❌ Servidor não encontrado.',
      ephemeral: true
    });
  }

  if (
    !hasAdminPermission(
      interaction.member
    )
  ) {
    return safeReply(interaction, {
      content:
        '❌ Você não tem permissão para cadastrar ADM.',
      ephemeral: true
    });
  }

  const userId =
    interaction.fields
      .getTextInputValue(
        'admin_user_id'
      )
      .trim();

  if (!/^\d{17,20}$/.test(userId)) {
    return safeReply(interaction, {
      content:
        '❌ ID do Discord inválido.',
      ephemeral: true
    });
  }

  const member =
    await guild.members
      .fetch(userId)
      .catch(() => null);

  if (!member) {
    return safeReply(interaction, {
      content:
        '❌ Não encontrei esse usuário neste servidor.',
      ephemeral: true
    });
  }

  pendingAdminIds.set(
    interaction.user.id,
    userId
  );

  return interaction.showModal(
    createAdminDataModal()
  );
}

async function handleAdminDataModal(interaction) {
  const guild =
    interaction.guild;

  if (!guild) {
    return safeReply(interaction, {
      content: '❌ Servidor não encontrado.',
      ephemeral: true
    });
  }

  const userId =
    pendingAdminIds.get(
      interaction.user.id
    );

  if (!userId) {
    return safeReply(interaction, {
      content:
        '❌ Não encontrei o ID do ADM. Faça o cadastro novamente.',
      ephemeral: true
    });
  }

  pendingAdminIds.delete(
    interaction.user.id
  );

  const name =
    interaction.fields
      .getTextInputValue(
        'admin_name'
      )
      .trim();

  const key =
    interaction.fields
      .getTextInputValue(
        'admin_pix_key'
      )
      .trim();

  const qr =
    interaction.fields
      .getTextInputValue(
        'admin_pix_qr'
      )
      .trim();

  const c =
    getGuildConfig(
      guild.id
    );

  if (!c.pixAdmins) {
    c.pixAdmins = [];
  }

  const existing =
    c.pixAdmins.find(
      admin =>
        admin.userId === userId
    );

  const data = {
    id: existing?.id || generateId('adm'),
    userId,
    name,
    key,
    qr,
    addedBy:
      interaction.user.id,
    addedAt:
      existing?.addedAt ||
      Date.now()
  };

  if (existing) {
    Object.assign(
      existing,
      data
    );
  } else {
    c.pixAdmins.push(
      data
    );
  }

  saveDatabase();

  return safeReply(interaction, {
    content:
      `✅ ADM <@${userId}> cadastrado com sucesso.`,
    ephemeral: true
  });
}

async function handleFeeModal(interaction) {
  const guild =
    interaction.guild;

  if (!guild) {
    return safeReply(interaction, {
      content: '❌ Servidor não encontrado.',
      ephemeral: true
    });
  }

  if (
    !hasAdminPermission(
      interaction.member
    )
  ) {
    return safeReply(interaction, {
      content:
        '❌ Você não tem permissão para alterar a taxa.',
      ephemeral: true
    });
  }

  const raw =
    interaction.fields
      .getTextInputValue(
        'fee_cents'
      )
      .trim();

  if (!/^\d+$/.test(raw)) {
    return safeReply(interaction, {
      content:
        '❌ Digite somente um número inteiro em centavos.',
      ephemeral: true
    });
  }

  const cents =
    Number(raw);

  if (
    !Number.isInteger(cents) ||
    cents < 0 ||
    cents > 100000
  ) {
    return safeReply(interaction, {
      content:
        '❌ A taxa deve estar entre 0 e 100000 centavos.',
      ephemeral: true
    });
  }

  const c =
    getGuildConfig(
      guild.id
    );

  c.admFee = cents;

  saveDatabase();

  return safeReply(interaction, {
    content:
      `✅ Taxa ADM definida para **${formatMoney(cents)}**.`,
    ephemeral: true
  });
}async function handleModalSubmit(interaction) {
  const guild = interaction.guild;

  if (!guild) return;

  if (!isAdministrator(interaction.member)) {
    return safeReply(interaction, {
      content: '❌ Apenas administradores podem usar esta função.',
      ephemeral: true
    });
  }

  const c = getGuildConfig(guild.id);
  const id = interaction.customId;

  if (id === 'admin_id_modal') {
    const userId = interaction.fields
      .getTextInputValue('admin_user_id')
      .trim();

    if (!/^\d{17,20}$/.test(userId)) {
      return safeReply(interaction, {
        content: '❌ Informe um ID de Discord válido.',
        ephemeral: true
      });
    }

    const member = await guild.members
      .fetch(userId)
      .catch(() => null);

    if (!member) {
      return safeReply(interaction, {
        content:
          '❌ Esse usuário não foi encontrado neste servidor.',
        ephemeral: true
      });
    }

    if (
      c.pixAdmins.some(
        a => String(a.userId) === userId
      )
    ) {
      return safeReply(interaction, {
        content:
          '❌ Este usuário já está cadastrado como ADM.',
        ephemeral: true
      });
    }

    pendingAdminIds.set(
      `${guild.id}:${interaction.user.id}`,
      userId
    );

    return interaction.showModal(
      createAdminPixModal()
    );
  }

  if (id === 'admin_pix_modal') {
    const keyPending =
      `${guild.id}:${interaction.user.id}`;

    const userId =
      pendingAdminIds.get(keyPending);

    pendingAdminIds.delete(keyPending);

    if (!userId) {
      return safeReply(interaction, {
        content:
          '❌ O cadastro expirou. Comece novamente.',
        ephemeral: true
      });
    }

    const name =
      interaction.fields
        .getTextInputValue('admin_name')
        .trim();

    const key =
      interaction.fields
        .getTextInputValue('admin_pix_key')
        .trim();

    const qr =
      interaction.fields
        .getTextInputValue('admin_pix_qr')
        .trim();

    if (!name || !key) {
      return safeReply(interaction, {
        content:
          '❌ Nome e chave Pix são obrigatórios.',
        ephemeral: true
      });
    }

    c.pixAdmins.push({
      id: userId,
      userId,
      name,
      key,
      qr: qr || null,
      addedBy: interaction.user.id,
      addedAt: new Date().toISOString()
    });

    saveDatabase();

    return safeReply(interaction, {
      content:
        `✅ ADM **${name}** cadastrado com sucesso, incluindo os dados Pix.`,
      ephemeral: true
    });
  }

  if (id === 'mediator_add_modal') {
    const userId =
      interaction.fields
        .getTextInputValue('mediator_user_id')
        .trim();

    if (!/^\d{17,20}$/.test(userId)) {
      return safeReply(interaction, {
        content:
          '❌ Informe um ID de Discord válido.',
        ephemeral: true
      });
    }

    const member =
      await guild.members
        .fetch(userId)
        .catch(() => null);

    if (!member) {
      return safeReply(interaction, {
        content:
          '❌ Esse usuário não foi encontrado neste servidor.',
        ephemeral: true
      });
    }

    if (c.mediatorQueue.includes(userId)) {
      return safeReply(interaction, {
        content:
          '❌ Este usuário já está cadastrado como mediador.',
        ephemeral: true
      });
    }

    if (c.mediatorQueue.length >= 20) {
      return safeReply(interaction, {
        content:
          '❌ Limite de 20 mediadores atingido.',
        ephemeral: true
      });
    }

    c.mediatorQueue.push(userId);

    saveDatabase();

    await refreshMediatorQueueMessage(
      guild.id
    );

    return safeReply(interaction, {
      content:
        `✅ <@${userId}> foi cadastrado como mediador.`,
      ephemeral: true
    });
  }

  if (id === 'fee_modal') {
    const raw =
      interaction.fields
        .getTextInputValue('fee_cents')
        .trim();

    if (!/^\d+$/.test(raw)) {
      return safeReply(interaction, {
        content:
          '❌ Informe somente números inteiros em centavos.',
        ephemeral: true
      });
    }

    const fee = Number(raw);

    if (
      !Number.isInteger(fee) ||
      fee < 0 ||
      fee > 100000
    ) {
      return safeReply(interaction, {
        content:
          '❌ A taxa deve estar entre 0 e 100000 centavos.',
        ephemeral: true
      });
    }

    c.admFee = fee;

    saveDatabase();

    return safeReply(interaction, {
      content:
        `✅ Taxa configurada para **${formatMoney(fee)}**.`,
      ephemeral: true
    });
  }

  if (id === 'color_modal') {
    const color =
      interaction.fields
        .getTextInputValue('embed_color')
        .trim();

    if (!/^#?[0-9a-fA-F]{6}$/.test(color)) {
      return safeReply(interaction, {
        content:
          '❌ Cor hexadecimal inválida. Ex.: `#5865F2`.',
        ephemeral: true
      });
    }

    c.embedColor =
      normalizeColor(color);

    saveDatabase();

    return safeReply(interaction, {
      content:
        `✅ Cor configurada para **${c.embedColor}**.`,
      ephemeral: true
    });
  }

  if (id === 'avatar_modal') {
    const url =
      interaction.fields
        .getTextInputValue('avatar_url')
        .trim();

    if (!/^https?:\/\//i.test(url)) {
      return safeReply(interaction, {
        content:
          '❌ Informe uma URL válida começando com http:// ou https://.',
        ephemeral: true
      });
    }

    c.botAvatar = url;

    saveDatabase();

    try {
      await client.user.setAvatar(url);

      return safeReply(interaction, {
        content:
          '✅ Avatar do bot configurado.',
        ephemeral: true
      });
    } catch (error) {
      console.error(
        'Erro ao alterar avatar:',
        error
      );

      return safeReply(interaction, {
        content:
          '⚠️ URL salva, mas não foi possível alterar o avatar agora.',
        ephemeral: true
      });
    }
  }
}

async function handleButton(interaction) {
  const id =
    interaction.customId || '';

  if (
    id.startsWith('queue_join|') ||
    id.startsWith('queue_leave|')
  ) {
    return handleQueueButton(
      interaction
    );
  }

  if (
    id.startsWith('bet_confirm|')
  ) {
    return handleBetConfirm(
      interaction,
      id.split('|')[1]
    );
  }

  if (
    id.startsWith('bet_cancel|')
  ) {
    return handleBetCancel(
      interaction,
      id.split('|')[1]
    );
  }

  if (
    id === 'mediator_queue_join'
  ) {
    return handleMediatorQueueButton(
      interaction,
      'join'
    );
  }

  if (
    id === 'mediator_queue_leave'
  ) {
    return handleMediatorQueueButton(
      interaction,
      'leave'
    );
  }

  if (
    id.startsWith('config_') ||
    id.startsWith('appearance_') ||
    id.startsWith('admin_') ||
    id.startsWith('mediator_') ||
    id === 'publish_mediator_queue'
  ) {
    return handleConfigButton(
      interaction
    );
  }

  return safeReply(interaction, {
    content:
      '❌ Botão não reconhecido.',
    ephemeral: true
  });
}

async function handleInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      return handleSlashCommand(
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

    if (interaction.isChannelSelectMenu()) {
      if (
        interaction.customId
          .startsWith('select_fila_channel|')
      ) {
        return handleFilaChannel(
          interaction
        );
      }

      return handleChannelSelect(
        interaction
      );
    }

    if (interaction.isStringSelectMenu()) {
      return handleStringSelect(
        interaction
      );
    }

    if (interaction.isModalSubmit()) {
      return handleModalSubmit(
        interaction
      );
    }
  } catch (error) {
    console.error(
      '❌ Erro na interação:',
      error
    );

    await safeReply(interaction, {
      content:
        '❌ Ocorreu um erro ao processar esta ação.',
      ephemeral: true
    });
  }
}

async function handleSlashCommand(interaction) {
  if (
    interaction.commandName === 'config'
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      return safeReply(interaction, {
        content:
          '❌ Apenas administradores podem usar o painel.',
        ephemeral: true
      });
    }

    return interaction.reply({
      embeds: [
        configMainEmbed(
          interaction.guild
        )
      ],
      components:
        configButtons(),
      ephemeral: true
    });
  }

  if (
    interaction.commandName === 'fila'
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      return safeReply(interaction, {
        content:
          '❌ Apenas administradores podem criar filas.',
        ephemeral: true
      });
    }

    return interaction.reply({
      embeds: [
        createEmbed(
          interaction.guild.id,
          '🎰 CRIAR FILAS',
          'Primeiro escolha o formato.'
        )
      ],
      components:
        filaFormatRow(),
      ephemeral: true
    });
  }

  if (
    interaction.commandName === 'med'
  ) {
    if (
      !isAdministrator(
        interaction.member
      )
    ) {
      return safeReply(interaction, {
        content:
          '❌ Apenas administradores podem publicar a fila de mediadores.',
        ephemeral: true
      });
    }

    try {
      await publishMediatorQueue(
        interaction.guild
      );

      return safeReply(interaction, {
        content:
          '✅ Fila de mediadores publicada/atualizada.',
        ephemeral: true
      });
    } catch (e) {
      return safeReply(interaction, {
        content:
          `❌ ${e.message}`,
        ephemeral: true
      });
    }
  }
}async function handlePrefixCommand(message) {
  if (
    message.author.bot ||
    !message.guild ||
    !message.content.startsWith(PREFIX)
  ) {
    return;
  }

  const args = message.content
    .slice(PREFIX.length)
    .trim()
    .split(/\s+/);

  const command =
    args.shift()?.toLowerCase();

  if (!command) return;

  if (command === 'fila') {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        '❌ Apenas administradores podem criar filas.'
      );
    }

    return message.reply({
      embeds: [
        createEmbed(
          message.guild.id,
          '🎰 CRIAR FILAS',
          'Use o menu abaixo.'
        )
      ],
      components:
        filaFormatRow()
    });
  }

  if (command === 'med') {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        '❌ Apenas administradores podem publicar a fila de mediadores.'
      );
    }

    try {
      await publishMediatorQueue(
        message.guild
      );

      return message.reply(
        '✅ Fila de mediadores publicada/atualizada.'
      );
    } catch (error) {
      return message.reply(
        `❌ ${error.message}`
      );
    }
  }

  if (command === 'config') {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        '❌ Apenas administradores podem abrir a configuração.'
      );
    }

    return message.reply({
      embeds: [
        configMainEmbed(
          message.guild
        )
      ],
      components:
        configButtons()
    });
  }

  if (
    command === 'ssmob' ||
    command === 'ssemu'
  ) {
    if (
      !isAdministrator(
        message.member
      )
    ) {
      return message.reply(
        '❌ Apenas administradores podem publicar filas.'
      );
    }

    const c =
      getGuildConfig(
        message.guild.id
      );

    const channelId =
      command === 'ssmob'
        ? c.analysisChannelMobile
        : c.analysisChannelEmulator;

    const mode =
      command === 'ssmob'
        ? 'mobile'
        : 'emulador';

    if (!channelId) {
      return message.reply(
        `❌ Canal do .${command} não configurado.`
      );
    }

    try {
      const sent =
        await publishQueues(
          message.guild,
          '1x1',
          mode,
          channelId
        );

      return message.reply(
        `✅ ${sent.length} filas publicadas.`
      );
    } catch (error) {
      return message.reply(
        `❌ Erro: ${error.message}`
      );
    }
  }
}

async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('config')
      .setDescription(
        'Abrir o painel de configuração do bot'
      ),

    new SlashCommandBuilder()
      .setName('fila')
      .setDescription(
        'Criar as 12 filas de um formato e modalidade'
      ),

    new SlashCommandBuilder()
      .setName('med')
      .setDescription(
        'Publicar ou atualizar a fila de mediadores'
      )
  ].map(command =>
    command.toJSON()
  );

  const rest =
    new REST({
      version: '10'
    }).setToken(
      TOKEN
    );

  await rest.put(
    Routes.applicationGuildCommands(
      CLIENT_ID,
      GUILD_ID
    ),
    {
      body: commands
    }
  );
}

async function startupChecks() {
  try {
    const guild =
      await client.guilds.fetch(
        GUILD_ID
      );

    if (!guild) {
      return console.error(
        '❌ Servidor configurado não encontrado.'
      );
    }

    getGuildConfig(
      guild.id
    );

    console.log(
      `🏠 Servidor conectado: ${guild.name} (${guild.id})`
    );
  } catch (error) {
    console.error(
      'Erro nas verificações iniciais:',
      error
    );
  }
}

client.once(
  Events.ClientReady,
  async readyClient => {
    console.log(
      `🤖 Bot online como ${readyClient.user.tag}`
    );

    console.log(
      `🆔 Client ID: ${CLIENT_ID}`
    );

    console.log(
      `🏠 Guild ID: ${GUILD_ID}`
    );

    try {
      await registerSlashCommands();

      console.log(
        '✅ Comandos slash registrados.'
      );
    } catch (error) {
      console.error(
        '❌ Erro ao registrar comandos slash:',
        error
      );
    }

    await startupChecks();
  }
);

client.on(
  Events.InteractionCreate,
  handleInteraction
);

client.on(
  Events.MessageCreate,
  message => {
    handlePrefixCommand(
      message
    ).catch(error => {
      console.error(
        '❌ Erro no comando:',
        error
      );
    });
  }
);

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
)
  .then(() => {
    console.log(
      '🔐 Login realizado.'
    );
  })
  .catch(error => {
    console.error(
      '❌ Erro ao fazer login:',
      error
    );
  });
