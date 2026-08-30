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
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN;
const DATA_FILE = path.join(__dirname, 'data.json');

if (!TOKEN) {
  console.error('ERRO: coloque DISCORD_TOKEN no .env');
  process.exit(1);
}

const VALUES = [
  { cents: 30, label: 'R$ 0,30' },
  { cents: 50, label: 'R$ 0,50' },
  { cents: 100, label: 'R$ 1,00' },
  { cents: 200, label: 'R$ 2,00' },
  { cents: 300, label: 'R$ 3,00' },
  { cents: 500, label: 'R$ 5,00' },
  { cents: 700, label: 'R$ 7,00' },
  { cents: 1000, label: 'R$ 10,00' },
  { cents: 2000, label: 'R$ 20,00' },
  { cents: 3000, label: 'R$ 30,00' },
  { cents: 5000, label: 'R$ 50,00' },
  { cents: 10000, label: 'R$ 100,00' }
];

const MODES = {
  mobile: {
    label: 'Mobile',
    emoji: '📱'
  },
  emu: {
    label: 'Emulador',
    emoji: '💻'
  },
  misto: {
    label: 'Misto',
    emoji: '📱💻'
  }
};

const FORMATS = [
  '1x1',
  '2x2',
  '3x3',
  '4x4'
];

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

    const parsed = JSON.parse(
      fs.readFileSync(DATA_FILE, 'utf8')
    );

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
      'Erro lendo data.json:',
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
      'Erro salvando data.json:',
      error
    );
  }
}

function guildData(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      mediatorRoleId: null,
      analystRoleId: null,

      analystChannel1Id: null,
      analystChannel2Id: null,

      mediatorQueueChannelId: null,

      embedColor: '#5865F2',
      botAvatar: null,

      pix: {},

      queueChannels: {},
      queues: {},

      mediatorQueue: [],
      mediatorIndex: 0
    };
  }

  const g = db.guilds[guildId];

  if (
    !g.pix ||
    typeof g.pix !== 'object'
  ) {
    g.pix = {};
  }

  if (
    !g.queueChannels ||
    typeof g.queueChannels !== 'object'
  ) {
    g.queueChannels = {};
  }

  if (
    !g.queues ||
    typeof g.queues !== 'object'
  ) {
    g.queues = {};
  }

  if (!Array.isArray(g.mediatorQueue)) {
    g.mediatorQueue = [];
  }

  if (!Number.isInteger(g.mediatorIndex)) {
    g.mediatorIndex = 0;
  }

  if (!g.embedColor) {
    g.embedColor = '#5865F2';
  }

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
  if (
    typeof value === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(
      value.trim()
    )
  ) {
    return value.trim();
  }

  return '#5865F2';
}

function money(cents) {
  return `R$ ${(Number(cents) / 100)
    .toFixed(2)
    .replace('.', ',')}`;
}

function mention(userId) {
  return `<@${userId}>`;
}

function slug(value) {
  return String(value)
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      '-'
    )
    .replace(
      /^-+|-+$/g,
      ''
    )
    .slice(0, 55);
}

function isOwner(interaction) {
  return Boolean(
    interaction.guild &&
    interaction.guild.ownerId ===
      interaction.user.id
  );
}

function hasRole(
  interaction,
  roleId
) {
  return Boolean(
    roleId &&
    interaction.member?.roles?.cache?.has(
      roleId
    )
  );
}

function isMediator(interaction) {
  const g =
    guildData(
      interaction.guildId
    );

  return hasRole(
    interaction,
    g.mediatorRoleId
  );
}

function isAnalyst(interaction) {
  const g =
    guildData(
      interaction.guildId
    );

  return hasRole(
    interaction,
    g.analystRoleId
  );
}

function queueKey(
  mode,
  format,
  cents
) {
  return `${mode}|${format}|${cents}`;
}

function queueId(
  action,
  mode,
  format,
  cents,
  rule = 'all'
) {
  return `q:${action}:${mode}:${format}:${cents}:${rule}`;
}

function matchId(
  action,
  id,
  extra = ''
) {
  return `m:${action}:${id}${
    extra ? `:${extra}` : ''
  }`;
}

function analysisId(
  action,
  id
) {
  return `a:${action}:${id}`;
}

function configId(
  action,
  extra = ''
) {
  return `cfg:${action}${
    extra ? `:${extra}` : ''
  }`;
}

function makeMatchId(guildId) {
  const key =
    `match:${guildId}`;

  db.counters[key] =
    Number(
      db.counters[key] || 0
    ) + 1;

  saveData();

  return String(
    db.counters[key]
  );
}

function mediatorIds(guild) {
  const g =
    guildData(guild.id);

  g.mediatorQueue =
    g.mediatorQueue.filter(
      id =>
        guild.members.cache.has(id)
    );

  return g.mediatorQueue;
}

function nextMediator(guild) {
  const g =
    guildData(guild.id);

  g.mediatorQueue =
    mediatorIds(guild);

  if (
    !g.mediatorQueue.length
  ) {
    saveData();
    return null;
  }

  if (
    g.mediatorIndex >=
    g.mediatorQueue.length
  ) {
    g.mediatorIndex = 0;
  }

  const id =
    g.mediatorQueue[
      g.mediatorIndex
    ];

  g.mediatorIndex =
    (g.mediatorIndex + 1) %
    g.mediatorQueue.length;

  saveData();

  return id;
}

function queueEmbed(
  guild,
  mode,
  format,
  cents,
  rule,
  players = []
) {
  const g =
    guildData(guild.id);

  const m =
    MODES[mode];

  let modeText;

  if (format === '1x1') {
    if (rule === 'infinite') {
      modeText =
        '♾️ Gelo infinito';
    } else if (rule === 'normal') {
      modeText =
        '🧊 Gelo normal';
    } else {
      modeText =
        'Escolha uma opção nos botões';
    }
  } else {
    modeText =
      'Normal';
  }

  const playerText =
    players.length
      ? players
          .map(
            (id, index) =>
              `${index + 1}. ${mention(id)}`
          )
          .join('\n')
      : '🟢 Aguardando jogadores...';

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
      `⚙️ **Modo:** ${modeText}\n` +
      `💰 **Entrada:** ${money(cents)}\n\n` +
      `👥 **JOGADORES**\n` +
      `${playerText}\n\n` +
      `📊 **Vagas:** ${players.length}/2\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `⚡ **ENTRE NA FILA E AGUARDE O ADVERSÁRIO**\n` +
      `━━━━━━━━━━━━━━━━━━`
    )
    .setFooter({
      text:
        '🎮 Sistema de Apostas'
    });
}

function queueButtons(
  mode,
  format,
  cents
) {
  if (format === '1x1') {
    return new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            queueId(
              'join',
              mode,
              format,
              cents,
              'infinite'
            )
          )
          .setLabel(
            'Gelo infinito'
          )
          .setEmoji('♾️')
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            queueId(
              'join',
              mode,
              format,
              cents,
              'normal'
            )
          )
          .setLabel(
            'Gelo normal'
          )
          .setEmoji('🧊')
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            queueId(
              'leave',
              mode,
              format,
              cents
            )
          )
          .setLabel(
            'Sair da fila'
          )
          .setEmoji('🚪')
          .setStyle(
            ButtonStyle.Danger
          )
      );
  }

  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          queueId(
            'join',
            mode,
            format,
            cents,
            'normal'
          )
        )
        .setLabel(
          'Entrar na fila'
        )
        .setEmoji('🎮')
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          queueId(
            'leave',
            mode,
            format,
            cents
          )
        )
        .setLabel(
          'Sair da fila'
        )
        .setEmoji('🚪')
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
  rule,
  players
) {
  return {
    embeds: [
      queueEmbed(
        guild,
        mode,
        format,
        cents,
        rule,
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

function activeMatch(
  userId
) {
  return Object.values(
    db.matches
  ).find(
    m =>
      !m.finalized &&
      m.players.includes(
        userId
      )
  );
}

function getMatch(id) {
  return db.matches[id] || null;
}

function confirmEmbed(
  guild,
  m
) {
  return new EmbedBuilder()
    .setColor(
      safeColor(
        guildData(guild.id)
          .embedColor
      )
    )
    .setTitle(
      '🎮 Partida iniciada'
    )
    .setDescription(
      `**Partida:** ${m.id}\n` +
      `**Modo:** ${MODES[m.mode].emoji} ${MODES[m.mode].label}\n` +
      `**Formato:** ${m.format}\n` +
      `**Valor:** ${money(m.cents)} por jogador\n\n` +
      `👤 **Jogador 1:** ${mention(m.players[0])}\n` +
      `👤 **Jogador 2:** ${mention(m.players[1])}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `Confirme sua participação. ` +
      `Quando os dois confirmarem, ` +
      `o Pix do ADM responsável será exibido para o pagamento.`
    )
    .setFooter({
      text:
        '🎮 Sistema de Apostas'
    });
}

function confirmButtons(m) {
  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          matchId(
            'confirm',
            m.id
          )
        )
        .setLabel(
          'Confirmar'
        )
        .setEmoji('✅')
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          matchId(
            'cancel',
            m.id
          )
        )
        .setLabel(
          'Cancelar'
        )
        .setEmoji('❌')
        .setStyle(
          ButtonStyle.Danger
        )
    );
}

function pixEmbed(
  guild,
  m
) {
  const pix =
    guildData(guild.id)
      .pix[m.mediatorId];

  return new EmbedBuilder()
    .setColor(
      safeColor(
        guildData(guild.id)
          .embedColor
      )
    )
    .setTitle(
      '💳 PAGAMENTO PARA INICIAR'
    )
    .setDescription(
      `Os dois jogadores confirmaram a aposta.\n\n` +
      `👤 **ADM responsável:** ${pix?.name || mention(m.mediatorId)}\n` +
      `💰 **Valor por jogador:** ${money(m.cents)}\n` +
      `💵 **Total da aposta:** ${money(m.cents * 2)}\n\n` +
      `🔑 **Chave Pix:**\n` +
      `\`${pix?.key || 'Não cadastrada'}\`\n\n` +
      `📷 **QR Code:** ` +
      `${pix?.qrUrl ? 'enviado abaixo.' : 'não cadastrado.'}\n\n` +
      `📌 Após o pagamento, ` +
      `aguarde o Mediador/ADM criar a sala.`
    )
    .setFooter({
      text:
        '🎮 Sistema de Apostas'
    });
}

async function sendPix(
  guild,
  channel,
  m
) {
  const pix =
    guildData(guild.id)
      .pix[m.mediatorId];

  if (
    !pix?.name ||
    !pix?.key
  ) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#ED4245')
          .setTitle(
            '⚠️ Pix do ADM não cadastrado'
          )
          .setDescription(
            `O ADM responsável ainda não possui ` +
            `nome e chave Pix cadastrados.\n` +
            `Configure em **/config → Pix ADM**.`
          )
      ]
    });

    return;
  }

  await channel.send({
    embeds: [
      pixEmbed(
        guild,
        m
      )
    ]
  });

  if (pix.qrUrl) {
    await channel.send({
      content:
        '📷 **QR Code do Pix:**',
      files: [
        pix.qrUrl
      ]
    }).catch(
      async () => {
        await channel.send(
          `📷 **QR Code:** ${pix.qrUrl}`
        ).catch(() => {});
      }
    );
  }
}

function mediatorPanel(
  guild
) {
  const g =
    guildData(guild.id);

  const ids =
    mediatorIds(guild);

  const list =
    ids.length
      ? ids
          .map(
            (id, n) =>
              `${n + 1}. ${mention(id)}`
          )
          .join('\n')
      : '🔴 Nenhum mediador está na fila.';

  return new EmbedBuilder()
    .setColor(
      safeColor(g.embedColor)
    )
    .setTitle(
      '🛡️ FILA DE MEDIADORES'
    )
    .setDescription(
      `Somente membros com o cargo **Mediador** ` +
      `configurado podem entrar.\n\n` +
      `👥 **Mediadores na fila:**\n` +
      `${list}\n\n` +
      `📊 **Total:** ${ids.length}`
    )
    .setFooter({
      text:
        '🎮 Sistema de Apostas'
    });
}

function mediatorButtons() {
  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          'medq:join'
        )
        .setLabel(
          'Entrar na fila'
        )
        .setEmoji('🟢')
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          'medq:leave'
        )
        .setLabel(
          'Sair da fila'
        )
        .setEmoji('🔴')
        .setStyle(
          ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          'medq:refresh'
        )
        .setLabel(
          'Atualizar'
        )
        .setEmoji('🔄')
        .setStyle(
          ButtonStyle.Secondary
        )
    );
}

function resultButtons(m) {
  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          matchId(
            'winner',
            m.id
          )
        )
        .setLabel(
          'Escolher vencedor'
        )
        .setEmoji('🏆')
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          matchId(
            'wo',
            m.id
          )
        )
        .setLabel(
          'Vitória por W.O.'
        )
        .setEmoji('⚡')
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          matchId(
            'finish',
            m.id
          )
        )
        .setLabel(
          'Finalizar aposta'
        )
        .setEmoji('🔒')
        .setStyle(
          ButtonStyle.Danger
        )
    );
}

function playerSelect(
  m,
  action
) {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          matchId(
            action,
            m.id
          )
        )
        .setPlaceholder(
          'Selecione o jogador'
        )
        .addOptions(
          m.players.map(
            (id, n) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(
                  `Jogador ${n + 1}`
                )
                .setDescription(id)
                .setValue(id)
          )
        )
    );
}

function configMain(guild) {
  const g =
    guildData(guild.id);

  const pixCount =
    Object.keys(g.pix).length;

  return new EmbedBuilder()
    .setColor(
      safeColor(g.embedColor)
    )
    .setTitle(
      '⚙️ • CONFIGURAÇÃO'
    )
    .setDescription(
      `🎨 **Aparência**\n` +
      `Cor: \`${safeColor(g.embedColor)}\`\n` +
      `Foto do bot: ${
        g.botAvatar
          ? 'configurada'
          : 'padrão'
      }\n\n` +

      `👥 **Cargos**\n` +
      `Mediador: ${
        g.mediatorRoleId
          ? `<@&${g.mediatorRoleId}>`
          : '❌'
      }\n` +
      `Analista: ${
        g.analystRoleId
          ? `<@&${g.analystRoleId}>`
          : '❌'
      }\n\n` +

      `📊 **Análises**\n` +
      `Canal 1: ${
        g.analystChannel1Id
          ? `<#${g.analystChannel1Id}>`
          : '❌'
      }\n` +
      `Canal 2: ${
        g.analystChannel2Id
          ? `<#${g.analystChannel2Id}>`
          : '❌'
      }\n\n` +

      `🛡️ **Fila de Mediadores**\n` +
      `Canal: ${
        g.mediatorQueueChannelId
          ? `<#${g.mediatorQueueChannelId}>`
          : '❌'
      }\n\n` +

      `💳 **Pix ADM**\n` +
      `${pixCount} ADM(s) cadastrado(s).`
    )
    .setFooter({
      text:
        'Sistema de Apostas'
    });
}

function configButtons() {
  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          configId('roles')
        )
        .setLabel(
          'Cargos'
        )
        .setEmoji('👥')
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          configId('channels')
        )
        .setLabel(
          'Canais'
        )
        .setEmoji('📁')
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          configId('pix')
        )
        .setLabel(
          'Pix ADM'
        )
        .setEmoji('💳')
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          configId('appearance')
        )
        .setLabel(
          'Cor / Aparência'
        )
        .setEmoji('🎨')
        .setStyle(
          ButtonStyle.Secondary
        )
    );
}

function roleMenu() {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          configId('rolechoose')
        )
        .setPlaceholder(
          'Escolha o cargo para configurar'
        )
        .addOptions(

          new StringSelectMenuOptionBuilder()
            .setLabel(
              'Mediador'
            )
            .setValue(
              'mediator'
            )
            .setEmoji('🛡️'),

          new StringSelectMenuOptionBuilder()
            .setLabel(
              'Analista'
            )
            .setValue(
              'analyst'
            )
            .setEmoji('📊')
        )
    );
}

function channelMenu(
  action,
  placeholder
) {
  /*
   * IMPORTANTE:
   * Não existe setChannelTypes aqui.
   * Assim o seletor não fica limitado
   * a uma lista fixa de tipos.
   */
  return new ActionRowBuilder()
    .addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          configId(action)
        )
        .setPlaceholder(
          placeholder
        )
        .setMinValues(1)
        .setMaxValues(1)
    );
}

function pixButtons() {
  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          configId('pixadd')
        )
        .setLabel(
          'Cadastrar / Editar ADM'
        )
        .setEmoji('➕')
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          configId('pixlist')
        )
        .setLabel(
          'Listar ADMs'
        )
        .setEmoji('📋')
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          configId('pixremove')
        )
        .setLabel(
          'Remover ADM'
        )
        .setEmoji('🗑️')
        .setStyle(
          ButtonStyle.Danger
        )
    );
}

function appearanceButtons() {
  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          configId('colormodal')
        )
        .setLabel(
          'Mudar cor das embeds'
        )
        .setEmoji('🎨')
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          configId('avatarmodal')
        )
        .setLabel(
          'Mudar foto do bot'
        )
        .setEmoji('🖼️')
        .setStyle(
          ButtonStyle.Secondary
        )
    );
}

async function handleConfig(
  interaction
) {
  if (!isOwner(interaction)) {
    return interaction.reply({
      content:
        '❌ Somente o dono do servidor pode usar este painel.',
      ephemeral: true
    });
  }

  const parts =
    interaction.customId.split(':');

  const action =
    parts[1];

  const extra =
    parts[2];

  const g =
    guildData(
      interaction.guildId
    );

  if (action === 'roles') {
    return interaction.update({
      embeds: [
        configMain(
          interaction.guild
        )
      ],
      components: [
        roleMenu()
      ]
    });
  }

  if (action === 'channels') {
    return interaction.update({
      embeds: [
        configMain(
          interaction.guild
        )
      ],
      components: [
        channelMenu(
          'medchannel',
          'Escolha o canal da fila de Mediadores'
        ),

        channelMenu(
          'analyst1',
          'Escolha o Canal 1'
        ),

        channelMenu(
          'analyst2',
          'Escolha o Canal 2'
        )
      ]
    });
  }

  if (action === 'pix') {
    return interaction.update({
      embeds: [
        configMain(
          interaction.guild
        )
      ],
      components: [
        pixButtons()
      ]
    });
  }

  if (action === 'appearance') {
    return interaction.update({
      embeds: [
        configMain(
          interaction.guild
        )
      ],
      components: [
        appearanceButtons()
      ]
    });
  }

  if (action === 'rolechoose') {
    const type =
      interaction.values[0];

    const roles =
      [
        ...interaction.guild.roles.cache
          .filter(
            role =>
              role.id !==
              interaction.guild.id
          )
          .sort(
            (a, b) =>
              b.position -
              a.position
          )
          .values()
      ].slice(0, 25);

    const row =
      new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(
              configId(
                'roleset',
                type
              )
            )
            .setPlaceholder(
              'Escolha o cargo'
            )
            .addOptions(
              roles.map(
                role =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(
                      role.name.slice(
                        0,
                        100
                      )
                    )
                    .setValue(
                      role.id
                    )
              )
            )
        );

    return interaction.update({
      content:
        `👥 Escolha o cargo de **${
          type === 'mediator'
            ? 'Mediador'
            : 'Analista'
        }**.`,

      embeds: [],

      components: [
        row
      ]
    });
  }

  if (action === 'roleset') {
    const type =
      extra;

    const roleId =
      interaction.values[0];

    if (
      type === 'mediator'
    ) {
      g.mediatorRoleId =
        roleId;
    } else {
      g.analystRoleId =
        roleId;
    }

    saveData();

    return interaction.update({
      content:
        `✅ Cargo de ${
          type === 'mediator'
            ? 'Mediador'
            : 'Analista'
        } configurado.`,

      embeds: [
        configMain(
          interaction.guild
        )
      ],

      components: [
        configButtons()
      ]
    });
  }

  if (
    [
      'medchannel',
      'analyst1',
      'analyst2'
    ].includes(action)
  ) {
    const id =
      interaction.values[0];

    const channel =
      interaction.guild.channels.cache.get(
        id
      ) ||
      await interaction.guild.channels
        .fetch(id)
        .catch(() => null);

    if (
      !channel ||
      !channel.isTextBased() ||
      [
        ChannelType.GuildVoice,
        ChannelType.GuildCategory
      ].includes(channel.type)
    ) {
      return interaction.reply({
        content:
          '❌ Escolha um canal de texto.',
        ephemeral: true
      });
    }

    if (
      action ===
      'medchannel'
    ) {
      g.mediatorQueueChannelId =
        id;
    } else if (
      action ===
      'analyst1'
    ) {
      g.analystChannel1Id =
        id;
    } else {
      g.analystChannel2Id =
        id;
    }

    saveData();

    return interaction.update({
      content:
        `✅ Canal configurado: <#${id}>`,

      embeds: [
        configMain(
          interaction.guild
        )
      ],

      components: [
        configButtons()
      ]
    });
  }

  if (
    action === 'pixadd'
  ) {
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(
          'modal:pix'
        )
        .setTitle(
          'Cadastrar / Editar ADM'
        )
        .addComponents(

          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  'user'
                )
                .setLabel(
                  'ID do ADM'
                )
                .setPlaceholder(
                  'Ex.: 123456789012345678'
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setRequired(
                  true
                )
            ),

          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  'name'
                )
                .setLabel(
                  'Nome do Pix / ADM'
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setRequired(
                  true
                )
            ),

          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  'key'
                )
                .setLabel(
                  'Chave Pix'
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setRequired(
                  true
                )
            ),

          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  'qr'
                )
                .setLabel(
                  'URL do QR Code'
                )
                .setPlaceholder(
                  'https://...'
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setRequired(
                  false
                )
            )
        )
    );
  }

  if (
    action === 'pixlist'
  ) {
    const entries =
      Object.entries(
        g.pix
      );

    const text =
      entries.length
        ? entries
            .map(
              ([id, pix]) =>
                `👤 ${mention(id)} — **${pix.name}**\n` +
                `🔑 \`${pix.key}\`\n` +
                `📷 ${
                  pix.qrUrl ||
                  'sem QR Code'
                }`
            )
            .join('\n\n')
        : 'Nenhum ADM cadastrado.';

    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(
            safeColor(
              g.embedColor
            )
          )
          .setTitle(
            '💳 ADMs / PIX'
          )
          .setDescription(
            text
          )
      ],

      components: [
        pixButtons()
      ]
    });
  }

  if (
    action === 'pixremove'
  ) {
    return interaction.update({
      embeds: [
        configMain(
          interaction.guild
        )
      ],

      components: [
        new ActionRowBuilder()
          .addComponents(
            new UserSelectMenuBuilder()
              .setCustomId(
                configId(
                  'pixremoveuser'
                )
              )
              .setPlaceholder(
                'Selecione o ADM para remover'
              )
              .setMinValues(1)
              .setMaxValues(1)
          )
      ]
    });
  }

  if (
    action === 'pixremoveuser'
  ) {
    const id =
      interaction.values[0];

    delete g.pix[id];

    saveData();

    return interaction.update({
      content:
        `✅ ADM ${mention(id)} removido do Pix.`,

      embeds: [
        configMain(
          interaction.guild
        )
      ],

      components: [
        configButtons()
      ]
    });
  }

  if (
    action === 'colormodal'
  ) {
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(
          'modal:appearance'
        )
        .setTitle(
          'Cor das Embeds'
        )
        .addComponents(
          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  'color'
                )
                .setLabel(
                  'Cor HEX'
                )
                .setPlaceholder(
                  '#5865F2'
                )
                .setValue(
                  safeColor(
                    g.embedColor
                  )
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setRequired(
                  true
                )
            )
        )
    );
  }

  if (
    action === 'avatarmodal'
  ) {
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(
          'modal:avatar'
        )
        .setTitle(
          'Foto de perfil do bot'
        )
        .addComponents(
          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  'url'
                )
                .setLabel(
                  'URL direta da imagem'
                )
                .setPlaceholder(
                  'https://site.com/imagem.png'
                )
                .setStyle(
                  TextInputStyle.Short
                )
                .setRequired(
                  true
                )
            )
        )
    );
  }
}

async function handleModal(
  interaction
) {
  if (
    !isOwner(interaction)
  ) {
    return interaction.reply({
      content:
        '❌ Somente o dono do servidor.',
      ephemeral: true
    });
  }

  if (
    interaction.customId ===
    'modal:pix'
  ) {
    const id =
      interaction.fields
        .getTextInputValue(
          'user'
        )
        .trim();

    const name =
      interaction.fields
        .getTextInputValue(
          'name'
        )
        .trim();

    const key =
      interaction.fields
        .getTextInputValue(
          'key'
        )
        .trim();

    const qr =
      interaction.fields
        .getTextInputValue(
          'qr'
        )
        .trim();

    if (
      !/^\d{17,20}$/.test(id)
    ) {
      return interaction.reply({
        content:
          '❌ ID de usuário inválido.',
        ephemeral: true
      });
    }

    const member =
      await interaction.guild.members
        .fetch(id)
        .catch(() => null);

    if (!member) {
      return interaction.reply({
        content:
          '❌ O ADM informado não está no servidor.',
        ephemeral: true
      });
    }

    if (!name || !key) {
      return interaction.reply({
        content:
          '❌ Nome e chave Pix são obrigatórios.',
        ephemeral: true
      });
    }

    if (qr) {
      try {
        const url =
          new URL(qr);

        if (
          ![
            'http:',
            'https:'
          ].includes(
            url.protocol
          )
        ) {
          throw new Error();
        }
      } catch {
        return interaction.reply({
          content:
            '❌ URL do QR Code inválida.',
          ephemeral: true
        });
      }
    }

    guildData(
      interaction.guildId
    ).pix[id] = {
      name,
      key,
      qrUrl:
        qr || null
    };

    saveData();

    return interaction.reply({
      content:
        `✅ Pix do ADM ${mention(id)} cadastrado/atualizado.`,
      ephemeral: true
    });
  }

  if (
    interaction.customId ===
    'modal:appearance'
  ) {
    const c =
      interaction.fields
        .getTextInputValue(
          'color'
        )
        .trim();

    if (
      !/^#[0-9a-fA-F]{6}$/.test(c)
    ) {
      return interaction.reply({
        content:
          '❌ Cor inválida. Use #5865F2.',
        ephemeral: true
      });
    }

    guildData(
      interaction.guildId
    ).embedColor = c;

    saveData();

    return interaction.reply({
      content:
        `✅ Cor das embeds alterada para ${c}.`,
      ephemeral: true
    });
  }

  if (
    interaction.customId ===
    'modal:avatar'
  ) {
    const url =
      interaction.fields
        .getTextInputValue(
          'url'
        )
        .trim();

    let parsed;

    try {
      parsed =
        new URL(url);

      if (
        ![
          'http:',
          'https:'
        ].includes(
          parsed.protocol
        )
      ) {
        throw new Error();
      }
    } catch {
      return interaction.reply({
        content:
          '❌ URL inválida.',
        ephemeral: true
      });
    }

    await interaction.deferReply({
      ephemeral: true
    });

    try {
      await interaction.client.user.setAvatar(
        parsed.href
      );

      guildData(
        interaction.guildId
      ).botAvatar =
        parsed.href;

      saveData();

      return interaction.editReply(
        '✅ Foto de perfil do bot alterada com sucesso.'
      );
    } catch (error) {
      console.error(
        'Erro avatar:',
        error
      );

      return interaction.editReply(
        '❌ Não consegui alterar a foto. Use uma URL pública direta de PNG, JPG ou WebP.'
      );
    }
  }
}

async function handleMediatorQueue(
  interaction
) {
  const [
    ,
    action
  ] =
    interaction.customId.split(':');

  const g =
    guildData(
      interaction.guildId
    );

  if (
    action === 'refresh'
  ) {
    return interaction.update({
      embeds: [
        mediatorPanel(
          interaction.guild
        )
      ],
      components: [
        mediatorButtons()
      ]
    });
  }

  if (
    !isMediator(interaction)
  ) {
    return interaction.reply({
      content:
        '❌ Você não possui o cargo de Mediador configurado.',
      ephemeral: true
    });
  }

  if (
    action === 'join'
  ) {
    if (
      g.mediatorQueue.includes(
        interaction.user.id
      )
    ) {
      return interaction.reply({
        content:
          '⚠️ Você já está na fila de Mediadores.',
        ephemeral: true
      });
    }

    g.mediatorQueue.push(
      interaction.user.id
    );

    saveData();

    return interaction.update({
      embeds: [
        mediatorPanel(
          interaction.guild
        )
      ],
      components: [
        mediatorButtons()
      ]
    });
  }

  if (
    action === 'leave'
  ) {
    const index =
      g.mediatorQueue.indexOf(
        interaction.user.id
      );

    if (index < 0) {
      return interaction.reply({
        content:
          '⚠️ Você não está na fila de Mediadores.',
        ephemeral: true
      });
    }

    g.mediatorQueue.splice(
      index,
      1
    );

    if (
      g.mediatorIndex >=
      g.mediatorQueue.length
    ) {
      g.mediatorIndex = 0;
    }

    saveData();

    return interaction.update({
      embeds: [
        mediatorPanel(
          interaction.guild
        )
      ],
      components: [
        mediatorButtons()
      ]
    });
  }
}

async function createMatch(
  guild,
  queueChannel,
  mode,
  format,
  cents,
  rule,
  players
) {
  const mediatorId =
    nextMediator(guild);

  if (!mediatorId) {
    return {
      error:
        'Sem mediadores disponíveis no momento.'
    };
  }

  const mediator =
    await guild.members
      .fetch(mediatorId)
      .catch(() => null);

  if (!mediator) {
    return {
      error:
        'O Mediador selecionado não está mais no servidor.'
    };
  }

  const id =
    makeMatchId(
      guild.id
    );

  const permissionOverwrites = [
    {
      id:
        guild.roles.everyone.id,

      deny: [
        PermissionFlagsBits.ViewChannel
      ]
    },

    ...players.map(
      userId => ({
        id: userId,

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

  let privateChannel;

  try {
    privateChannel =
      await guild.channels.create({
        name:
          `partida-${slug(id)}`,

        type:
          ChannelType.GuildText,

        parent:
          queueChannel.parentId ||
          undefined,

        permissionOverwrites,

        topic:
          `Partida ${id} | ${format} | ${MODES[mode].label} | ${money(cents)}`
      });
  } catch (error) {
    console.error(
      'Erro criando canal:',
      error
    );

    return {
      error:
        'Não consegui criar o canal privado. Verifique as permissões do bot.'
    };
  }

  const m = {
    id,

    guildId:
      guild.id,

    channelId:
      privateChannel.id,

    queueChannelId:
      queueChannel.id,

    mode,
    format,
    cents,
    rule,
    players,

    mediatorId,

    confirmed: [],

    finalized:
      false,

    resultType:
      null,

    winnerId:
      null,

    roomCreated:
      false,

    roomId:
      null,

    roomPassword:
      null,

    createdAt:
      Date.now()
  };

  db.matches[id] =
    m;

  saveData();

  await privateChannel.send({
    content:
      `${players
        .map(mention)
        .join(' • ')}\n` +
      `🛡️ **Mediador:** ${mention(mediatorId)}`,

    embeds: [
      confirmEmbed(
        guild,
        m
      )
    ],

    components: [
      confirmButtons(m)
    ]
  }).catch(
    error =>
      console.error(
        'Erro enviando partida:',
        error
      )
  );

  return {
    match: m,
    channel:
      privateChannel
  };
}

async function updateQueue(
  guild,
  state,
  mode,
  format,
  cents
) {
  const channel =
    guild.channels.cache.get(
      state.channelId
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    return;
  }

  const message =
    await channel.messages
      .fetch(
        state.messageId
      )
      .catch(
        () => null
      );

  if (!message) {
    return;
  }

  const rule =
    format === '1x1'
      ? state.rule
      : 'normal';

  await message.edit(
    queuePayload(
      guild,
      mode,
      format,
      cents,
      rule,
      state.players
    )
  ).catch(
    error =>
      console.error(
        'Erro atualizando fila:',
        error
      )
  );
}

async function handleQueue(
  interaction
) {
  const [
    ,
    action,
    mode,
    format,
    centsRaw,
    rule
  ] =
    interaction.customId.split(':');

  const cents =
    Number(centsRaw);

  if (
    !MODES[mode] ||
    !FORMATS.includes(
      format
    ) ||
    !Number.isFinite(
      cents
    )
  ) {
    return interaction.reply({
      content:
        '⚠️ Fila inválida.',
      ephemeral: true
    });
  }

  const g =
    guildData(
      interaction.guildId
    );

  const key =
    queueKey(
      mode,
      format,
      cents
    );

  if (!g.queues[key]) {
    g.queues[key] = {
      players: [],
      rule: null,
      channelId:
        interaction.channelId,
      messageId:
        interaction.message.id
    };
  }

  const state =
    g.queues[key];

  state.channelId =
    interaction.channelId;

  state.messageId =
    interaction.message.id;

  if (
    !Array.isArray(
      state.players
    )
  ) {
    state.players = [];
  }

  if (
    action === 'leave'
  ) {
    await interaction.deferUpdate();

    const index =
      state.players.indexOf(
        interaction.user.id
      );

    if (index >= 0) {
      state.players.splice(
        index,
        1
      );
    }

    if (
      format === '1x1' &&
      state.players.length === 0
    ) {
      state.rule = null;
    }

    saveData();

    return updateQueue(
      interaction.guild,
      state,
      mode,
      format,
      cents
    );
  }

  if (
    !mediatorIds(
      interaction.guild
    ).length
  ) {
    return interaction.reply({
      content:
        '⚠️ **Sem mediadores disponíveis no momento.**',
      ephemeral: true
    });
  }

  if (
    state.players.includes(
      interaction.user.id
    )
  ) {
    return interaction.reply({
      content:
        '⚠️ Você já está nesta fila.',
      ephemeral: true
    });
  }

  if (
    activeMatch(
      interaction.user.id
    )
  ) {
    return interaction.reply({
      content:
        '⚠️ Você já está em uma aposta ativa.',
      ephemeral: true
    });
  }

  if (
    state.players.length >= 2
  ) {
    return interaction.reply({
      content:
        '⚠️ Esta fila já está cheia.',
      ephemeral: true
    });
  }

  if (
    format === '1x1' &&
    state.rule &&
    state.rule !== rule
  ) {
    return interaction.reply({
      content:
        `⚠️ Esta fila já foi iniciada em **${
          state.rule === 'infinite'
            ? 'Gelo infinito'
            : 'Gelo normal'
        }**.`,
      ephemeral: true
    });
  }

  if (
    format === '1x1' &&
    !state.rule
  ) {
    state.rule =
      rule;
  }

  state.players.push(
    interaction.user.id
  );

  await interaction.update(
    queuePayload(
      interaction.guild,
      mode,
      format,
      cents,
      format === '1x1'
        ? state.rule
        : 'normal',
      state.players
    )
  );

  if (
    state.players.length < 2
  ) {
    saveData();
    return;
  }

  const players =
    [...state.players];

  const matchRule =
    format === '1x1'
      ? state.rule
      : 'normal';

  state.players = [];
  state.rule = null;

  saveData();

  const result =
    await createMatch(
      interaction.guild,
      interaction.channel,
      mode,
      format,
      cents,
      matchRule,
      players
    );

  if (result.error) {
    state.players =
      players;

    state.rule =
      format === '1x1'
        ? matchRule
        : null;

    saveData();

    await updateQueue(
      interaction.guild,
      state,
      mode,
      format,
      cents
    );

    await interaction.channel
      .send(
        `⚠️ ${result.error}`
      )
      .catch(
        () => {}
      );

    return;
  }

  await updateQueue(
    interaction.guild,
    state,
    mode,
    format,
    cents
  );
}

async function cancelMatch(
  guild,
  m
) {
  if (m.finalized) {
    return;
  }

  m.finalized =
    true;

  saveData();

  const channel =
    guild.channels.cache.get(
      m.channelId
    );

  if (!channel) {
    return;
  }

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(
          '#ED4245'
        )
        .setTitle(
          '❌ Aposta cancelada'
        )
        .setDescription(
          'A aposta foi cancelada. O canal será deletado em **15 segundos**.'
        )
    ]
  }).catch(
    () => {}
  );

  setTimeout(
    () =>
      channel
        .delete()
        .catch(
          () => {}
        ),
    15000
  );
}

function statsEmbed(
  guild,
  user
) {
  const stats =
    userData(
      user.id
    );

  const total =
    stats.wins +
    stats.losses;

  const rate =
    total
      ? (
          (stats.wins /
            total) *
          100
        ).toFixed(1)
      : '0.0';

  return new EmbedBuilder()
    .setColor(
      safeColor(
        guildData(guild.id)
          .embedColor
      )
    )
    .setTitle(
      `📊 PERFIL DE ${user.username}`
    )
    .setThumbnail(
      user.displayAvatarURL({
        size: 256
      })
    )
    .setDescription(
      `🏆 **Vitórias:** ${stats.wins}\n` +
      `❌ **Derrotas:** ${stats.losses}\n` +
      `⚡ **Vitórias por W.O.:** ${stats.woWins}\n` +
      `🪙 **Coins:** ${stats.coins}\n\n` +
      `🎮 **Partidas normais:** ${stats.normalMatches}\n` +
      `📈 **Aproveitamento:** ${rate}%`
    );
}

function analysisEmbed(
  guild,
  request
) {
  return new EmbedBuilder()
    .setColor(
      safeColor(
        guildData(guild.id)
          .embedColor
      )
    )
    .setTitle(
      '📊 ANÁLISE DISPONÍVEL'
    )
    .setDescription(
      `👤 **Solicitante:** ${mention(request.userId)}\n` +
      `${
        request.mode === 'mobile'
          ? '📱 Mobile'
          : '💻 Emulador'
      }\n\n` +
      `Um Analista com o cargo configurado pode assumir esta análise.`
    )
    .setFooter({
      text:
        '🎮 Sistema de Análises'
    });
}

async function requestAnalysis(
  message,
  mode
) {
  const g =
    guildData(
      message.guild.id
    );

  const channelId =
    mode === 'mobile'
      ? g.analystChannel1Id
      : g.analystChannel2Id;

  if (!channelId) {
    return message.reply(
      '⚠️ O canal de análise ainda não foi configurado no /config.'
    );
  }

  const channel =
    message.guild.channels.cache.get(
      channelId
    ) ||
    await message.guild.channels
      .fetch(channelId)
      .catch(
        () => null
      );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    return message.reply(
      '⚠️ O canal de análise configurado não foi encontrado.'
    );
  }

  const id =
    `${Date.now()}-${message.author.id}`;

  const request = {
    id,

    guildId:
      message.guild.id,

    userId:
      message.author.id,

    mode,

    sourceChannelId:
      message.channel.id,

    createdAt:
      Date.now(),

    claimed:
      false,

    analystId:
      null
  };

  db.analysis[id] =
    request;

  saveData();

  await channel.send({
    embeds: [
      analysisEmbed(
        message.guild,
        request
      )
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              analysisId(
                'claim',
                id
              )
            )
            .setLabel(
              'ASSUMIR ANÁLISE'
            )
            .setEmoji('📊')
            .setStyle(
              ButtonStyle.Primary
            )
        )
    ]
  });

  await message.reply(
    '📊 Sua solicitação de análise foi enviada.'
  );
}

async function handleAnalysis(
  interaction
) {
  const [
    ,
    action,
    id
  ] =
    interaction.customId.split(':');

  const request =
    db.analysis[id];

  if (!request) {
    return interaction.reply({
      content:
        '⚠️ Esta análise não existe mais.',
      ephemeral: true
    });
  }

  if (
    action !== 'claim'
  ) {
    return;
  }

  if (
    !isAnalyst(
      interaction
    )
  ) {
    return interaction.reply({
      content:
        '❌ Você não possui o cargo de Analista configurado.',
      ephemeral: true
    });
  }

  if (
    request.claimed
  ) {
    return interaction.reply({
      content:
        '⚠️ Esta análise já foi assumida.',
      ephemeral: true
    });
  }

  request.claimed =
    true;

  request.analystId =
    interaction.user.id;

  request.claimedAt =
    Date.now();

  saveData();

  await interaction.update({
    embeds: [
      analysisEmbed(
        interaction.guild,
        request
      )
        .setTitle(
          '📊 ANÁLISE ASSUMIDA'
        )
        .setDescription(
          `👤 **Solicitante:** ${mention(request.userId)}\n` +
          `👨‍💻 **Analista:** ${mention(request.analystId)}\n\n` +
          `O Analista assumiu esta solicitação.`
        )
    ],

    components: []
  });

  const channel =
    interaction.guild.channels.cache.get(
      request.sourceChannelId
    );

  if (
    channel &&
    channel.isTextBased()
  ) {
    await channel.send(
      `📊 ${mention(request.userId)} sua análise foi assumida por ${mention(interaction.user.id)}.`
    ).catch(
      () => {}
    );
  }
}

function parseRoom(
  text
) {
  const idMatch =
    text.match(
      /(?:ID\s*(?:DA)?\s*SALA|SALA\s*ID|ID)\s*[:#-]?\s*([A-Za-z0-9_-]{3,})/i
    );

  const passMatch =
    text.match(
      /(?:SENHA|PASSWORD|PASS)\s*[:#-]?\s*([A-Za-z0-9_-]{2,})/i
    );

  if (
    !idMatch ||
    !passMatch
  ) {
    return null;
  }

  return {
    id:
      idMatch[1],

    password:
      passMatch[1]
  };
}

async function detectRoom(
  message
) {
  if (
    !message.guild ||
    message.author.bot
  ) {
    return;
  }

  const m =
    Object.values(
      db.matches
    ).find(
      item =>
        item.channelId ===
          message.channel.id &&
        !item.finalized
    );

  if (
    !m ||
    message.author.id !==
      m.mediatorId
  ) {
    return;
  }

  const room =
    parseRoom(
      message.content || ''
    );

  if (!room) {
    return;
  }

  m.roomId =
    room.id;

  m.roomPassword =
    room.password;

  m.roomCreated =
    true;

  saveData();

  await message.channel
    .setName(
      `pagar-${slug(
        money(
          m.cents * 2
        )
      )}`
    )
    .catch(
      () => {}
    );

  const embed =
    new EmbedBuilder()
      .setColor(
        safeColor(
          guildData(
            message.guild.id
          ).embedColor
        )
      )
      .setTitle(
        '🤍 SALA CRIADA'
      )
      .setDescription(
        `⏱️ **A sala será iniciada em 3 a 5 minutos**\n\n` +
        `🆔 **ID da Sala**\n` +
        `${room.id}\n\n` +
        `🔐 **Senha**\n` +
        `${room.password}\n\n` +
        `Com:\n` +
        `• 🆔 Copiar ID\n` +
        `• 🔐 Copiar Senha`
      );

  const row =
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            matchId(
              'copyroom',
              m.id,
              'id'
            )
          )
          .setLabel(
            'Copiar ID'
          )
          .setEmoji('🆔')
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            matchId(
              'copyroom',
              m.id,
              'pass'
            )
          )
          .setLabel(
            'Copiar Senha'
          )
          .setEmoji('🔐')
          .setStyle(
            ButtonStyle.Secondary
          )
      );

  await message.channel.send({
    embeds: [
      embed
    ],

    components: [
      row,
      resultButtons(m)
    ]
  });
}

async function handleMatch(
  interaction
) {
  const [
    ,
    action,
    id,
    extra
  ] =
    interaction.customId.split(':');

  const m =
    getMatch(id);

  if (
    !m ||
    m.finalized
  ) {
    return interaction.reply({
      content:
        '⚠️ Esta aposta não está mais ativa.',
      ephemeral: true
    });
  }

  if (
    action === 'copyroom'
  ) {
    if (
      !m.roomCreated
    ) {
      return interaction.reply({
        content:
          '⚠️ A sala ainda não foi criada.',
        ephemeral: true
      });
    }

    return interaction.reply({
      content:
        extra === 'id'
          ? `🆔 ID: \`${m.roomId}\``
          : `🔐 Senha: \`${m.roomPassword}\``,

      ephemeral:
        true
    });
  }

  if (
    action === 'confirm'
  ) {
    if (
      !m.players.includes(
        interaction.user.id
      )
    ) {
      return interaction.reply({
        content:
          '❌ Você não participa desta aposta.',
        ephemeral: true
      });
    }

    if (
      !m.confirmed.includes(
        interaction.user.id
      )
    ) {
      m.confirmed.push(
        interaction.user.id
      );
    }

    saveData();

    await interaction.update({
      embeds: [
        confirmEmbed(
          interaction.guild,
          m
        )
      ],
      components: [
        confirmButtons(m)
      ]
    });

    if (
      m.confirmed.length ===
      2
    ) {
      await interaction.message
        .edit({
          components: []
        })
        .catch(
          () => {}
        );

      await sendPix(
        interaction.guild,
        interaction.channel,
        m
      );
    }

    return;
  }

  if (
    action === 'cancel'
  ) {
    if (
      !m.players.includes(
        interaction.user.id
      ) &&
      interaction.user.id !==
        m.mediatorId
    ) {
      return interaction.reply({
        content:
          '❌ Você não pode cancelar esta aposta.',
        ephemeral: true
      });
    }

    await interaction.reply({
      content:
        '✅ Aposta cancelada.',
      ephemeral: true
    });

    return cancelMatch(
      interaction.guild,
      m
    );
  }

  if (
    action === 'winner' ||
    action === 'wo'
  ) {
    if (
      interaction.user.id !==
      m.mediatorId
    ) {
      return interaction.reply({
        content:
          '❌ Somente o Mediador responsável pode registrar o resultado.',
        ephemeral: true
      });
    }

    return interaction.reply({
      content:
        action === 'winner'
          ? '🏆 Escolha o vencedor:'
          : '⚡ Escolha quem venceu por W.O.',

      components: [
        playerSelect(
          m,
          action === 'winner'
            ? 'winnerselect'
            : 'woselect'
        )
      ],

      ephemeral:
        true
    });
  }

  if (
    action === 'finish'
  ) {
    if (
      interaction.user.id !==
      m.mediatorId
    ) {
      return interaction.reply({
        content:
          '❌ Somente o Mediador responsável pode finalizar.',
        ephemeral: true
      });
    }

    if (
      !m.resultType
    ) {
      return interaction.reply({
        content:
          '⚠️ Registre primeiro o vencedor ou o W.O.',
        ephemeral: true
      });
    }

    m.finalized =
      true;

    saveData();

    await interaction.reply({
      content:
        '✅ Aposta finalizada. O canal será deletado em 15 segundos.',
      ephemeral: true
    });

    setTimeout(
      () =>
        interaction.channel
          .delete()
          .catch(
            () => {}
          ),
      15000
    );
  }
}

async function handleResultSelect(
  interaction
) {
  const [
    ,
    action,
    id
  ] =
    interaction.customId.split(':');

  const m =
    getMatch(id);

  if (
    !m ||
    m.finalized
  ) {
    return interaction.reply({
      content:
        '⚠️ Aposta encerrada.',
      ephemeral: true
    });
  }

  if (
    interaction.user.id !==
    m.mediatorId
  ) {
    return interaction.reply({
      content:
        '❌ Somente o Mediador responsável.',
      ephemeral: true
    });
  }

  const winner =
    interaction.values[0];

  if (
    !m.players.includes(
      winner
    )
  ) {
    return interaction.reply({
      content:
        '⚠️ Jogador inválido.',
      ephemeral: true
    });
  }

  if (
    action ===
    'winnerselect'
  ) {
    const loser =
      m.players.find(
        id2 =>
          id2 !== winner
      );

    const winnerStats =
      userData(
        winner
      );

    const loserStats =
      userData(
        loser
      );

    winnerStats.wins++;
    winnerStats.coins++;
    winnerStats.normalMatches++;

    loserStats.losses++;
    loserStats.normalMatches++;

    m.resultType =
      'normal';

    m.winnerId =
      winner;

    saveData();

    return interaction.update({
      content:
        `🏆 Vencedor: ${mention(winner)}\n` +
        `🪙 +1 Coin para o vencedor.`,

      components: []
    });
  }

  if (
    action ===
    'woselect'
  ) {
    const winnerStats =
      userData(
        winner
      );

    winnerStats.woWins++;

    m.resultType =
      'wo';

    m.winnerId =
      winner;

    saveData();

    return interaction.update({
      content:
        `⚡ Vitória por W.O.: ${mention(winner)}\n` +
        `ℹ️ W.O. registra somente a estatística de W.O.`,

      components: []
    });
  }
}

/*
 * COMANDOS DE PONTO
 *
 * ATIVOS:
 * .med
 * .ssmob
 * .ssemu
 *
 * REMOVIDOS:
 * .excel
 * .cc
 * .p
 */

async function handlePrefixCommand(
  message
) {
  if (
    !message.guild ||
    message.author.bot
  ) {
    return false;
  }

  const raw =
    message.content.trim();

  if (
    !raw.startsWith('.')
  ) {
    return false;
  }

  const [
    command
  ] =
    raw
      .slice(1)
      .trim()
      .split(/\s+/);

  const cmd =
    (
      command || ''
    ).toLowerCase();

  if (
    cmd === 'med'
  ) {
    const g =
      guildData(
        message.guild.id
      );

    const channel =
      g.mediatorQueueChannelId
        ? (
            message.guild.channels.cache.get(
              g.mediatorQueueChannelId
            ) ||
            await message.guild.channels
              .fetch(
                g.mediatorQueueChannelId
              )
              .catch(
                () => null
              )
          )
        : message.channel;

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      return message.reply(
        '❌ Configure o canal da fila de Mediadores em /config → Canais.'
      );
    }

    await channel.send({
      embeds: [
        mediatorPanel(
          message.guild
        )
      ],
      components: [
        mediatorButtons()
      ]
    });

    if (
      channel.id !==
      message.channel.id
    ) {
      await message.reply(
        `✅ Painel da fila de Mediadores enviado em ${channel}.`
      );
    }

    return true;
  }

  if (
    cmd === 'ssmob'
  ) {
    await requestAnalysis(
      message,
      'mobile'
    );

    return true;
  }

  if (
    cmd === 'ssemu'
  ) {
    await requestAnalysis(
      message,
      'emu'
    );

    return true;
  }

  return false;
}

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

client.once(
  'ready',
  () => {
    console.log(
      `✅ ${client.user.tag} online.`
    );

    console.log(
      'Slash: /config /fila /mediadores /perfil'
    );

    console.log(
      'Ponto: .med .ssmob .ssemu'
    );

    console.log(
      'Removidos: .excel .cc .p'
    );
  }
);

client.on(
  'messageCreate',
  async message => {
    try {
      if (
        message.content
          .trim()
          .startsWith('.')
      ) {
        await handlePrefixCommand(
          message
        );
      }

      await detectRoom(
        message
      );
    } catch (error) {
      console.error(
        'MESSAGE ERROR:',
        error
      );
    }
  }
);

client.on(
  'interactionCreate',
  async interaction => {
    try {

      /*
       * SLASH COMMANDS
       */

      if (
        interaction.isChatInputCommand()
      ) {

        if (
          interaction.commandName ===
          'config'
        ) {
          if (
            !isOwner(
              interaction
            )
          ) {
            return interaction.reply({
              content:
                '❌ Somente o dono do servidor.',
              ephemeral: true
            });
          }

          return interaction.reply({
            embeds: [
              configMain(
                interaction.guild
              )
            ],

            components: [
              configButtons()
            ],

            ephemeral:
              true
          });
        }

        if (
          interaction.commandName ===
          'fila'
        ) {
          if (
            !isOwner(
              interaction
            )
          ) {
            return interaction.reply({
              content:
                '❌ Somente o dono do servidor.',
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

          if (
            !channel.isTextBased() ||
            [
              ChannelType.GuildVoice,
              ChannelType.GuildCategory
            ].includes(
              channel.type
            )
          ) {
            return interaction.reply({
              content:
                '❌ Escolha um canal de texto.',
              ephemeral: true
            });
          }

          /*
           * IMPORTANTE:
           * deferReply acontece antes
           * de publicar as 12 filas.
           */
          await interaction.deferReply({
            ephemeral:
              true
          });

          const g =
            guildData(
              interaction.guildId
            );

          const channelKey =
            `${mode}|${format}`;

          g.queueChannels[
            channelKey
          ] =
            channel.id;

          /*
           * MAIOR PARA MENOR.
           *
           * Discord mostra as mensagens
           * na ordem enviada.
           *
           * Portanto:
           *
           * R$100
           * R$50
           * ...
           * R$0,30
           *
           * fica de cima para baixo.
           */

          const values =
            [
              ...VALUES
            ].sort(
              (a, b) =>
                b.cents -
                a.cents
            );

          for (
            const value of values
          ) {
            const key =
              queueKey(
                mode,
                format,
                value.cents
              );

            const old =
              g.queues[key];

            let msg =
              null;

            if (
              old &&
              old.channelId ===
                channel.id &&
              old.messageId
            ) {
              msg =
                await channel.messages
                  .fetch(
                    old.messageId
                  )
                  .catch(
                    () => null
                  );
            }

            const payload =
              queuePayload(
                interaction.guild,
                mode,
                format,
                value.cents,
                format === '1x1'
                  ? (
                      old?.rule ||
                      null
                    )
                  : 'normal',
                old?.players ||
                  []
              );

            if (msg) {
              await msg.edit(
                payload
              ).catch(
                () => {}
              );
            } else {
              msg =
                await channel.send(
                  payload
                ).catch(
                  error => {
                    console.error(
                      'Erro publicando fila:',
                      error
                    );

                    return null;
                  }
                );
            }

            if (msg) {
              g.queues[key] = {
                players:
                  old?.players ||
                  [],

                rule:
                  format === '1x1'
                    ? (
                        old?.rule ||
                        null
                      )
                    : 'normal',

                channelId:
                  channel.id,

                messageId:
                  msg.id
              };
            }
          }

          saveData();

          return interaction.editReply(
            `✅ Todas as filas de **${format} • ${MODES[mode].label}** foram publicadas em ${channel}.\n` +
            `📌 Ordem: **R$ 100,00 no topo → R$ 0,30 embaixo**.`
          );
        }

        if (
          interaction.commandName ===
          'mediadores'
        ) {
          if (
            !isOwner(
              interaction
            )
          ) {
            return interaction.reply({
              content:
                '❌ Somente o dono do servidor.',
              ephemeral: true
            });
          }

          /*
           * DEFER IMEDIATAMENTE.
           * Isso corrige o "O aplicativo não respondeu".
           */

          await interaction.deferReply({
            ephemeral:
              true
          });

          const g =
            guildData(
              interaction.guildId
            );

          const channel =
            g.mediatorQueueChannelId
              ? (
                  interaction.guild.channels.cache.get(
                    g.mediatorQueueChannelId
                  ) ||
                  await interaction.guild.channels
                    .fetch(
                      g.mediatorQueueChannelId
                    )
                    .catch(
                      () => null
                    )
                )
              : interaction.channel;

          if (
            !channel ||
            !channel.isTextBased()
          ) {
            return interaction.editReply(
              '❌ Configure o canal da fila de Mediadores em /config → Canais.'
            );
          }

          await channel.send({
            embeds: [
              mediatorPanel(
                interaction.guild
              )
            ],

            components: [
              mediatorButtons()
            ]
          });

          return interaction.editReply(
            `✅ Painel da fila de Mediadores enviado em ${channel}.`
          );
        }

        if (
          interaction.commandName ===
          'perfil'
        ) {
          const user =
            interaction.options.getUser(
              'usuario'
            ) ||
            interaction.user;

          return interaction.reply({
            embeds: [
              statsEmbed(
                interaction.guild,
                user
              )
            ]
          });
        }
      }

      /*
       * BOTÕES
       */

      if (
        interaction.isButton()
      ) {
        if (
          interaction.customId
            .startsWith('q:')
        ) {
          return handleQueue(
            interaction
          );
        }

        if (
          interaction.customId
            .startsWith('m:')
        ) {
          return handleMatch(
            interaction
          );
        }

        if (
          interaction.customId
            .startsWith('medq:')
        ) {
          return handleMediatorQueue(
            interaction
          );
        }

        if (
          interaction.customId
            .startsWith('cfg:')
        ) {
          return handleConfig(
            interaction
          );
        }

        if (
          interaction.customId
            .startsWith('a:')
        ) {
          return handleAnalysis(
            interaction
          );
        }
      }

      /*
       * SELECT MENUS
       */

      if (
        interaction.isStringSelectMenu()
      ) {
        if (
          interaction.customId
            .startsWith('m:')
        ) {
          return handleResultSelect(
            interaction
          );
        }

        if (
          interaction.customId
            .startsWith('cfg:')
        ) {
          return handleConfig(
            interaction
          );
        }
      }

      /*
       * CHANNEL SELECT / USER SELECT
       */

      if (
        interaction.isChannelSelectMenu() ||
        interaction.isUserSelectMenu()
      ) {
        if (
          interaction.customId
            .startsWith('cfg:')
        ) {
          return handleConfig(
            interaction
          );
        }
      }

      /*
       * MODAIS
       */

      if (
        interaction.isModalSubmit()
      ) {
        return handleModal(
          interaction
        );
      }

    } catch (error) {
      console.error(
        'INTERACTION ERROR:',
        error
      );

      const response = {
        content:
          '❌ Ocorreu um erro ao processar essa ação. Veja o console do bot.',
        ephemeral:
          true
      };

      if (
        interaction.replied ||
        interaction.deferred
      ) {
        await interaction
          .followUp(
            response
          )
          .catch(
            () => {}
          );
      } else {
        await interaction
          .reply(
            response
          )
          .catch(
            () => {}
          );
      }
    }
  }
);

client.on(
  'error',
  error =>
    console.error(
      'DISCORD CLIENT ERROR:',
      error
    )
);

client.login(
  TOKEN
).catch(
  error => {
    console.error(
      'ERRO ao fazer login:',
      error
    );

    process.exit(1);
  }
);
