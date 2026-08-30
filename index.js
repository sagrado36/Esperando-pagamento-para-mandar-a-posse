require('dotenv').config();

const fs = require('fs');
const path = require('path');

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
  REST,
  Routes
} = require('discord.js');

const {
  DISCORD_TOKEN: TOKEN,
  CLIENT_ID,
  GUILD_ID
} = process.env;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  throw new Error(
    'Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID nas Variables.'
  );
}

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/* =========================================================
   VALORES DAS FILAS
   ========================================================= */

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
  0.50,
  0.30
];

/* =========================================================
   MODALIDADES
   ========================================================= */

const MODS = [
  ['mob', '📱 Mobile'],
  ['emu', '💻 Emulador'],
  ['misto', '🔄 Misto']
];

const FORMATS = [
  '1x1',
  '2x2',
  '3x3',
  '4x4'
];

/* =========================================================
   BANCO DE DADOS
   ========================================================= */

const DEFAULT = {
  settings: {
    roles: {
      mediator: null,
      analyst: null
    },

    channels: {
      queue: null,
      mediator: null,
      analystMob: null,
      analystEmu: null,
      privateCategory: null
    },

    pix: {
      name: '',
      key: '',
      qr: ''
    },

    appearance: {
      color: '#5865F2'
    },

    queueConfigs: []
  },

  queues: {},
  queueMessages: {},

  mediators: [],

  bets: {},

  stats: {},

  nextBet: 1,

  analystRequests: {},

  _temp: {}
};

function merge(a, b) {
  return {
    ...structuredClone(a),
    ...b,

    settings: {
      ...a.settings,
      ...(b.settings || {}),

      roles: {
        ...a.settings.roles,
        ...((b.settings || {}).roles || {})
      },

      channels: {
        ...a.settings.channels,
        ...((b.settings || {}).channels || {})
      },

      pix: {
        ...a.settings.pix,
        ...((b.settings || {}).pix || {})
      },

      appearance: {
        ...a.settings.appearance,
        ...((b.settings || {}).appearance || {})
      },

      queueConfigs:
        (b.settings || {}).queueConfigs || []
    }
  };
}

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return structuredClone(DEFAULT);
    }

    const x = JSON.parse(
      fs.readFileSync(DATA_FILE, 'utf8')
    );

    return merge(DEFAULT, x);
  } catch {
    return structuredClone(DEFAULT);
  }
}

let db = load();

function save() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(db, null, 2)
  );
}

/* =========================================================
   FUNÇÕES GERAIS
   ========================================================= */

function money(value) {
  return `R$ ${Number(value)
    .toFixed(2)
    .replace('.', ',')}`;
}

function qid(modality, format, value) {
  return `${modality}|${format}|${value}`;
}

function roleId(key) {
  return db.settings.roles[key];
}

function isAdmin(member) {
  return Boolean(
    member?.permissions?.has(
      PermissionsBitField.Flags.Administrator
    ) ||
    member?.permissions?.has(
      PermissionsBitField.Flags.ManageGuild
    )
  );
}

function hasRole(member, key) {
  const id = roleId(key);

  return Boolean(
    id &&
    member?.roles?.cache?.has(id)
  );
}

/* =========================================================
   COR DA EMBED
   ========================================================= */

function getEmbedColor() {
  let color =
    db.settings.appearance.color ||
    '#5865F2';

  color = String(color).trim();

  if (!color.startsWith('#')) {
    color = `#${color}`;
  }

  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return '#5865F2';
  }

  return color;
}

/* =========================================================
   EMBED PRINCIPAL
   ========================================================= */

function embed(title, description) {
  return new EmbedBuilder()
    .setColor(getEmbedColor())
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: '⚡ Sistema de Apostas • Segurança • Organização'
    })
    .setTimestamp();
}

/* =========================================================
   ESTATÍSTICAS
   ========================================================= */

function playerStats(id) {
  return db.stats[id] ||= {
    wins: 0,
    wo: 0,
    losses: 0
  };
}

function statsEmbed(user) {
  const s = playerStats(user.id);

  return embed(
    `📊 PERFIL DE JOGADOR`,
    [
      `👤 **Jogador:** ${user}`,
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      `🏆 **Vitórias:** \`${s.wins}\``,
      `⚠️ **Vitórias por W.O.:** \`${s.wo}\``,
      `❌ **Derrotas:** \`${s.losses}\``,
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '🎮 Continue jogando para aumentar suas estatísticas!'
    ].join('\n')
  );
}

/* =========================================================
   CONFIGURAÇÃO
   ========================================================= */

function configEmbed() {
  const s = db.settings;

  return embed(
    '⚙️ CENTRAL DE CONFIGURAÇÃO',
    [
      '╔════════════════════════════╗',
      '       🛠️ **PAINEL ADMINISTRATIVO**',
      '╚════════════════════════════╝',
      '',
      `🎮 **Filas configuradas:** \`${s.queueConfigs.length}\``,
      '',
      `🛡️ **Mediador:** ${
        s.roles.mediator
          ? `<@&${s.roles.mediator}>`
          : '❌ Não configurado'
      }`,
      `🔎 **Analista:** ${
        s.roles.analyst
          ? `<@&${s.roles.analyst}>`
          : '❌ Não configurado'
      }`,
      '',
      `💳 **PIX:** ${
        s.pix.key
          ? '🟢 Configurado'
          : '🔴 Não configurado'
      }`,
      '',
      `🎨 **Cor das Embeds:** \`${getEmbedColor()}\``,
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '💡 Use os botões abaixo para personalizar o sistema.'
    ].join('\n')
  );
}

function configRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('cfg:queue')
        .setLabel('🎮 Filas')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('cfg:med')
        .setLabel('🛡️ Mediador')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('cfg:analyst')
        .setLabel('🔎 Analista')
        .setStyle(ButtonStyle.Primary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('cfg:roles')
        .setLabel('🎭 Cargos')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('cfg:pix')
        .setLabel('💳 PIX')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('cfg:appearance')
        .setLabel('🎨 Aparência')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

/* =========================================================
   CONFIGURAÇÃO DE FILAS
   ========================================================= */

function queueConfigRows() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('qc:mod')
        .setPlaceholder(
          '📱 Escolha a modalidade'
        )
        .addOptions(
          MODS.map(([value, label]) => ({
            label: label.replace(
              /^\S+\s/,
              ''
            ),
            value,
            emoji:
              value === 'mob'
                ? '📱'
                : value === 'emu'
                  ? '💻'
                  : '🔄'
          }))
        )
    ),

    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('qc:fmt')
        .setPlaceholder(
          '🎯 Escolha o formato'
        )
        .addOptions(
          FORMATS.map(value => ({
            label: value,
            value,
            emoji: '🎯'
          }))
        )
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('qc:channel')
        .setPlaceholder(
          '📺 Escolha o canal das filas'
        )
        .addChannelTypes(
          ChannelType.GuildText
        )
    )
  ];
}

/* =========================================================
   CARGOS
   ========================================================= */

function roleRows() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('role:key')
        .setPlaceholder(
          '🎭 Escolha o cargo para configurar'
        )
        .addOptions([
          {
            label: 'Mediador',
            value: 'mediator',
            description:
              '🛡️ Atende e gerencia apostas'
          },
          {
            label: 'Analista',
            value: 'analyst',
            description:
              '🔎 Somente assume análises'
          }
        ])
    )
  ];
}

/* =========================================================
   CANAIS
   ========================================================= */

function channelPickRows() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ch:key')
        .setPlaceholder(
          '📺 Escolha o canal para configurar'
        )
        .addOptions([
          {
            label:
              'Fila de Mediadores',
            value: 'mediator',
            emoji: '🛡️'
          },
          {
            label:
              'Análises Mobile',
            value: 'analystMob',
            emoji: '📱'
          },
          {
            label:
              'Análises Emulador',
            value: 'analystEmu',
            emoji: '💻'
          }
        ])
    )
  ];
}

/* =========================================================
   🎮 DESIGN NOVO DAS FILAS
   ========================================================= */

function queueEmbed(c, guild) {
  const arr =
    (
      db.queues[
        qid(
          c.mod,
          c.format,
          c.value
        )
      ] || []
    ).filter(
      x =>
        typeof x === 'string'
    );

  const mediator =
    availableMediator(guild);

  const modality =
    MODS.find(
      x =>
        x[0] === c.mod
    )?.[1] ||
    '🎮 Desconhecida';

  const slots = [
    arr[0]
      ? `🟢 **JOGADOR 01**\n└─ 👤 ${`<@${arr[0]}>`}`
      : '⚪ **JOGADOR 01**\n└─ `VAGA DISPONÍVEL`',

    arr[1]
      ? `🟢 **JOGADOR 02**\n└─ 👤 ${`<@${arr[1]}>`}`
      : '⚪ **JOGADOR 02**\n└─ `VAGA DISPONÍVEL`'
  ];

  const progress =
    arr.length === 0
      ? '⬜⬜'
      : arr.length === 1
        ? '🟩⬜'
        : '🟩🟩';

  const status =
    arr.length >= 2
      ? '🔴 **FILA COMPLETA**'
      : '🟢 **FILA ABERTA**';

  return embed(
    `╔═══ 🎮 FILA DE APOSTA ═══╗`,
    [
      `╭─────────────── 💰 **${money(c.value)}**`,
      `│ ${modality}`,
      `│ 🎯 **Formato:** ${c.format}`,
      `╰───────────────`,
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      `👥 **JOGADORES • ${arr.length}/2**`,
      '',
      slots[0],
      '',
      slots[1],
      '',
      `📊 **Ocupação:** ${progress}`,
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      `🛡️ **MEDIADOR**`,
      mediator
        ? `└─ 🟢 Disponível`
        : '└─ 🔴 Nenhum disponível',
      '',
      `📡 **STATUS:** ${status}`,
      '',
      '💡 **COMO PARTICIPAR**',
      '🎮 Clique em **Entrar na fila**',
      '🚪 Use **Sair da fila** para cancelar sua entrada',
      '',
      '⚠️ Cada fila possui exatamente **2 jogadores**.',
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '✨ Boa sorte e bom jogo! ✨'
    ].join('\n')
  );
}

function queueButtons(c) {
  const id =
    qid(
      c.mod,
      c.format,
      c.value
    );

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `queue:join:${id}`
        )
        .setLabel(
          '🎮 ENTRAR NA FILA'
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          `queue:leave:${id}`
        )
        .setLabel(
          '🚪 SAIR DA FILA'
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    )
  ];
}

/* =========================================================
   🛡️ DESIGN NOVO DA FILA DE MEDIADORES
   ========================================================= */

function mediatorEmbed() {
  const total =
    db.mediators.length;

  const list =
    total > 0
      ? db.mediators
          .map(
            (id, index) =>
              `**${String(
                index + 1
              ).padStart(
                2,
                '0'
              )}.** 🟢 <@${id}>`
          )
          .join('\n')
      : '╰─ ⚪ Nenhum Mediador disponível no momento.';

  return embed(
    '╔═══ 🛡️ CENTRAL DE MEDIADORES ═══╗',
    [
      '```',
      '       MEDIADOR • ONLINE',
      '```',
      '',
      '╭────────────────────────╮',
      `│ 🟢 **DISPONÍVEIS:** \`${total}\``,
      '│ ⚡ Sistema de distribuição automática',
      '╰────────────────────────╯',
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '👥 **MEDIADORES ONLINE**',
      '',
      list,
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '🛡️ **COMO FUNCIONA**',
      '',
      '🟢 **Entrar** → você fica disponível',
      '🔴 **Sair** → você fica indisponível',
      '⚡ O sistema seleciona automaticamente',
      '   um Mediador disponível para a aposta.',
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '📌 **STATUS DO SISTEMA**',
      '',
      total > 0
        ? '🟢 Há Mediador disponível para novas apostas.'
        : '🔴 Nenhum Mediador disponível agora.',
      '',
      '✨ Obrigado por fazer parte da equipe! ✨'
    ].join('\n')
  );
}

function mediatorButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          'medq:join'
        )
        .setLabel(
          '🟢 FICAR DISPONÍVEL'
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          'medq:leave'
        )
        .setLabel(
          '🔴 FICAR INDISPONÍVEL'
        )
        .setStyle(
          ButtonStyle.Danger
        )
    )
  ];
}

/* =========================================================
   MEDIADOR DISPONÍVEL
   ========================================================= */

function availableMediator(guild) {
  const rid =
    roleId('mediator');

  if (!rid) {
    return null;
  }

  const role =
    guild.roles.cache.get(
      rid
    );

  if (!role) {
    return null;
  }

  const busy =
    new Set(
      Object.values(
        db.bets
      )
        .filter(
          b =>
            b.status !==
            'closed'
        )
        .map(
          b =>
            b.mediatorId
        )
    );

  const list =
    db.mediators.filter(
      id =>
        role.members.has(id) &&
        !busy.has(id)
    );

  if (!list.length) {
    return null;
  }

  const index =
    Number(db.rr || 0) %
    list.length;

  return list[index];
}

function mediatorNext(guild) {
  const rid =
    roleId('mediator');

  if (!rid) {
    return null;
  }

  const role =
    guild.roles.cache.get(
      rid
    );

  if (!role) {
    return null;
  }

  const busy =
    new Set(
      Object.values(
        db.bets
      )
        .filter(
          b =>
            b.status !==
            'closed'
        )
        .map(
          b =>
            b.mediatorId
        )
    );

  const list =
    db.mediators.filter(
      id =>
        role.members.has(id) &&
        !busy.has(id)
    );

  if (!list.length) {
    return null;
  }

  const index =
    Number(db.rr || 0) %
    list.length;

  const id =
    list[index];

  db.rr =
    Number(db.rr || 0) + 1;

  save();

  return id;
}

/* =========================================================
   CANAL PRIVADO DA APOSTA
   ========================================================= */

function privateOverwrites(guild, bet) {
  return [
    {
      id:
        guild.roles.everyone.id,

      deny: [
        PermissionsBitField.Flags.ViewChannel
      ]
    },

    ...[
      bet.p1,
      bet.p2,
      bet.mediatorId
    ].map(id => ({
      id,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    }))
  ];
}

/* =========================================================
   CRIAR APOSTA
   ========================================================= */

async function createBet(
  guild,
  c,
  p1,
  p2
) {
  const mediator =
    mediatorNext(guild);

  if (!mediator) {
    return null;
  }

  let category =
    guild.channels.cache.get(
      db.settings.channels.privateCategory
    );

  if (!category) {
    category =
      guild.channels.cache.find(
        x =>
          x.type ===
            ChannelType.GuildCategory &&
          x.name ===
            'FILAS'
      );

    if (!category) {
      category =
        await guild.channels.create({
          name: 'FILAS',
          type: ChannelType.GuildCategory
        });
    }

    db.settings.channels.privateCategory =
      category.id;
  }

  const id =
    String(db.nextBet++);

  const bet = {
    id,
    guildId: guild.id,

    p1,
    p2,

    mediatorId:
      mediator,

    mod: c.mod,

    format:
      c.format,

    value:
      c.value,

    confirm: {
      [p1]: false,
      [p2]: false
    },

    status:
      'confirm',

    channelId:
      null
  };

  const channel =
    await guild.channels.create({
      name:
        `🔒・aposta-${id}`,

      type:
        ChannelType.GuildText,

      parent:
        category.id,

      permissionOverwrites:
        privateOverwrites(
          guild,
          bet
        )
    });

  bet.channelId =
    channel.id;

  db.bets[id] =
    bet;

  save();

  await channel.send({
    content:
      `<@${p1}> <@${p2}> <@${mediator}>`,

    embeds: [
      embed(
        `╔═══ 🔒 APOSTA #${id} ═══╗`,
        [
          `👤 **JOGADOR 01:** <@${p1}>`,
          `👤 **JOGADOR 02:** <@${p2}>`,
          '',
          '━━━━━━━━━━━━━━━━━━━━',
          '',
          `💰 **VALOR:** ${money(c.value)}`,
          `🎮 **MODALIDADE:** ${
            MODS.find(
              x =>
                x[0] === c.mod
            )?.[1] ||
            '🎮 Desconhecida'
          }`,
          `🎯 **FORMATO:** ${c.format}`,
          '',
          `🛡️ **MEDIADOR:** <@${mediator}>`,
          '',
          '━━━━━━━━━━━━━━━━━━━━',
          '',
          '🔐 **ETAPA DE CONFIRMAÇÃO**',
          '',
          '✅ Os dois jogadores precisam',
          '   confirmar a aposta.',
          '',
          '⚠️ Não envie o pagamento antes',
          '   da confirmação dos dois jogadores.',
          '',
          '✨ Boa sorte! ✨'
        ].join('\n')
      )
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              `bet:confirm:${id}`
            )
            .setLabel(
              '✅ CONFIRMAR APOSTA'
            )
            .setStyle(
              ButtonStyle.Success
            )
        )
    ]
  });

  return bet;
}

/* =========================================================
   PUBLICAR FILAS
   ========================================================= */

async function publishQueues(guild) {
  const channel =
    guild.channels.cache.get(
      db.settings.channels.queue
    );

  if (!channel) {
    throw new Error(
      'Canal único de filas não configurado.'
    );
  }

  let count = 0;

  for (
    const c of
    db.settings.queueConfigs
  ) {
    /*
      IMPORTANTE:
      os valores são automáticos.
      Não existe escolha manual de valor.
    */

    for (
      const value of
      VALUES
    ) {
      const q = {
        mod:
          c.mod,

        format:
          c.format,

        value
      };

      const id =
        qid(
          q.mod,
          q.format,
          q.value
        );

      db.queues[id] ??= [];

      let message =
        db.queueMessages[id]
          ? await channel.messages
              .fetch(
                db.queueMessages[id]
              )
              .catch(
                () => null
              )
          : null;

      const payload = {
        embeds: [
          queueEmbed(
            q,
            guild
          )
        ],

        components:
          queueButtons(q)
      };

      if (message) {
        await message.edit(
          payload
        );
      } else {
        message =
          await channel.send(
            payload
          );

        db.queueMessages[id] =
          message.id;
      }

      count++;
    }
  }

  save();

  return count;
}

/* =========================================================
   ESTRUTURA
   ========================================================= */

async function createStructure(guild) {
  let category =
    guild.channels.cache.find(
      x =>
        x.type ===
          ChannelType.GuildCategory &&
        x.name ===
          'FILAS'
    );

  if (!category) {
    category =
      await guild.channels.create({
        name: 'FILAS',
        type: ChannelType.GuildCategory
      });
  }

  let queue =
    guild.channels.cache.find(
      x =>
        x.type ===
          ChannelType.GuildText &&
        x.parentId ===
          category.id &&
        x.name ===
          'filas'
    );

  if (!queue) {
    queue =
      await guild.channels.create({
        name: 'filas',
        type: ChannelType.GuildText,
        parent: category.id
      });
  }

  db.settings.channels.queue =
    queue.id;

  db.settings.channels.privateCategory =
    category.id;

  let mediator =
    guild.channels.cache.find(
      x =>
        x.type ===
          ChannelType.GuildText &&
        x.parentId ===
          category.id &&
        x.name ===
          'fila-mediadores'
    );

  if (!mediator) {
    mediator =
      await guild.channels.create({
        name:
          'fila-mediadores',

        type:
          ChannelType.GuildText,

        parent:
          category.id
      });
  }

  db.settings.channels.mediator =
    mediator.id;

  let analystMob =
    guild.channels.cache.find(
      x =>
        x.type ===
          ChannelType.GuildText &&
        x.name ===
          'analistas-mobile'
    );

  if (!analystMob) {
    analystMob =
      await guild.channels.create({
        name:
          'analistas-mobile',

        type:
          ChannelType.GuildText
      });
  }

  db.settings.channels.analystMob =
    analystMob.id;

  let analystEmu =
    guild.channels.cache.find(
      x =>
        x.type ===
          ChannelType.GuildText &&
        x.name ===
          'analistas-emulador'
    );

  if (!analystEmu) {
    analystEmu =
      await guild.channels.create({
        name:
          'analistas-emulador',

        type:
          ChannelType.GuildText
      });
  }

  db.settings.channels.analystEmu =
    analystEmu.id;

  save();

  return {
    category,
    queue,
    mediator,
    analystMob,
    analystEmu
  };
}

/* =========================================================
   PUBLICAR FILA DE MEDIADORES
   ========================================================= */

async function publishMediatorQueue(
  guild
) {
  const channel =
    guild.channels.cache.get(
      db.settings.channels.mediator
    );

  if (!channel) {
    return;
  }

  const e =
    mediatorEmbed();

  const components =
    mediatorButtons();

  let message =
    db.mediatorMessageId
      ? await channel.messages
          .fetch(
            db.mediatorMessageId
          )
          .catch(
            () => null
          )
      : null;

  if (message) {
    await message.edit({
      embeds: [e],
      components
    });
  } else {
    message =
      await channel.send({
        embeds: [e],
        components
      });

    db.mediatorMessageId =
      message.id;
  }

  save();
}

/* =========================================================
   COMANDOS
   ========================================================= */

const slash = [
  {
    name:
      'config',

    description:
      '⚙️ Abre a central de configuração'
  },

  {
    name:
      'p',

    description:
      '📊 Mostra as estatísticas de um jogador'
  }
];

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
      Partials.Channel
    ]
  });

/* =========================================================
   READY
   ========================================================= */

client.once(
  'ready',
  async () => {
    try {
      const guild =
        client.guilds.cache.get(
          GUILD_ID
        );

      if (guild) {
        await createStructure(
          guild
        );

        await publishMediatorQueue(
          guild
        );

        if (
          db.settings.queueConfigs.length &&
          db.settings.channels.queue
        ) {
          await publishQueues(
            guild
          );
        }
      }

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
          body: slash
        }
      );

      console.log(
        `✅ ${client.user.tag} online.`
      );

      console.log(
        '🎨 Sistema visual carregado.'
      );
    } catch (e) {
      console.error(
        'START:',
        e
      );
    }
  }
);

/* =========================================================
   MEMBER REMOVE
   ========================================================= */

client.on(
  'guildMemberRemove',
  member => {
    if (
      db.mediators.includes(
        member.id
      )
    ) {
      db.mediators =
        db.mediators.filter(
          x =>
            x !==
            member.id
        );

      save();
    }
  }
);

/* =========================================================
   MENSAGENS
   ========================================================= */

client.on(
  'messageCreate',
  async message => {
    if (
      message.author.bot ||
      !message.guild
    ) {
      return;
    }

    const cmd =
      message.content
        .trim()
        .toLowerCase();

    const bet =
      Object.values(
        db.bets
      ).find(
        b =>
          b.channelId ===
            message.channel.id &&
          b.status !==
            'closed'
      );

    /* =========================
       .med
       ========================= */

    if (
      cmd === '.med'
    ) {
      if (!bet) {
        return message.reply(
          '❌ Este canal não possui aposta ativa.'
        );
      }

      if (
        message.author.id !==
          bet.mediatorId ||
        !hasRole(
          message.member,
          'mediator'
        )
      ) {
        return message.reply(
          '❌ Somente o Mediador responsável pode usar `.med`.'
        );
      }

      return message.reply({
        content:
          [
            '╔══════════════════════╗',
            '      🛡️ **PAINEL DO MEDIADOR**',
            '╚══════════════════════╝',
            '',
            '🎯 Escolha uma ação para esta aposta:',
            '',
            '🏆 Definir vencedor',
            '⚠️ Registrar W.O.',
            '🗑️ Encerrar aposta'
          ].join('\n'),

        components: [
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `med:win:${bet.id}`
                )
                .setLabel(
                  '🏆 Vencedor'
                )
                .setStyle(
                  ButtonStyle.Success
                ),

              new ButtonBuilder()
                .setCustomId(
                  `med:wo:${bet.id}`
                )
                .setLabel(
                  '⚠️ W.O.'
                )
                .setStyle(
                  ButtonStyle.Danger
                ),

              new ButtonBuilder()
                .setCustomId(
                  `med:finish:${bet.id}`
                )
                .setLabel(
                  '🗑️ Encerrar'
                )
                .setStyle(
                  ButtonStyle.Secondary
                )
            )
        ]
      });
    }

    /* =========================
       .sccmob / .sccmu
       ========================= */

    if (
      cmd === '.sccmob' ||
      cmd === '.sccmu'
    ) {
      if (!bet) {
        return message.reply(
          '❌ Use este comando no canal privado da aposta.'
        );
      }

      if (
        message.author.id !==
          bet.mediatorId ||
        !hasRole(
          message.member,
          'mediator'
        )
      ) {
        return message.reply(
          '❌ Somente o Mediador responsável pode usar este comando.'
        );
      }

      const mob =
        cmd ===
        '.sccmob';

      const channelId =
        mob
          ? db.settings.channels
              .analystMob
          : db.settings.channels
              .analystEmu;

      if (!channelId) {
        return message.reply(
          '❌ Canal de analistas não configurado.'
        );
      }

      db.analystRequests[
        bet.id
      ] = {
        betId:
          bet.id,

        type:
          mob
            ? 'mob'
            : 'emu',

        analystId:
          null,

        requestedBy:
          message.author.id
      };

      save();

      const channel =
        message.guild.channels.cache.get(
          channelId
        );

      if (!channel) {
        return message.reply(
          '❌ Canal de análise não encontrado.'
        );
      }

      await channel.send({
        embeds: [
          embed(
            '╔═══ 🔎 ANÁLISE DISPONÍVEL ═══╗',
            [
              mob
                ? '📱 **TIPO:** Análise Mobile'
                : '💻 **TIPO:** Análise Emulador / PC',
              '',
              '━━━━━━━━━━━━━━━━━━━━',
              '',
              `🔒 **Aposta:** #${bet.id}`,
              `🛡️ **Mediador:** <@${bet.mediatorId}>`,
              '',
              '🔎 Um Analista disponível pode assumir esta análise.',
              '',
              '⚡ Ao assumir, o Analista recebe acesso ao canal privado.',
              '',
              '━━━━━━━━━━━━━━━━━━━━'
            ].join('\n')
          )
        ],

        components: [
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `analyst:assume:${bet.id}`
                )
                .setLabel(
                  '🔎 ASSUMIR ANÁLISE'
                )
                .setStyle(
                  ButtonStyle.Success
                )
            )
        ]
      });

      return message.reply(
        '✅ Solicitação enviada para a fila de Analistas.'
      );
    }
  }
);

/* =========================================================
   INTERAÇÕES
   ========================================================= */

client.on(
  'interactionCreate',
  async i => {
    try {

      /* =========================
         SLASH
         ========================= */

      if (
        i.isChatInputCommand()
      ) {

        if (
          i.commandName ===
          'p'
        ) {
          const user =
            i.options.getUser(
              'jogador'
            ) ||
            i.user;

          return i.reply({
            embeds: [
              statsEmbed(
                user
              )
            ],

            ephemeral:
              true
          });
        }

        if (
          i.commandName ===
          'config'
        ) {
          if (
            !isAdmin(
              i.member
            )
          ) {
            return i.reply({
              content:
                '❌ Apenas administradores.',

              ephemeral:
                true
            });
          }

          return i.reply({
            embeds: [
              configEmbed()
            ],

            components:
              configRows(),

            ephemeral:
              true
          });
        }
      }

      /* =========================
         SELECTS
         ========================= */

      if (
        i.isStringSelectMenu()
      ) {

        /* FILA - MODALIDADE */

        if (
          i.customId ===
          'qc:mod'
        ) {
          if (
            !isAdmin(
              i.member
            )
          ) {
            return i.reply({
              content:
                '❌ Apenas administradores.',
              ephemeral:
                true
            });
          }

          db._temp ??= {};
          db._temp[i.user.id] ??= {};

          db._temp[
            i.user.id
          ].mod =
            i.values[0];

          save();

          return i.update({
            content:
              [
                '╔═══ 🎮 CRIAR FILAS ═══╗',
                '',
                `📱 **Modalidade:** ${
                  MODS.find(
                    x =>
                      x[0] ===
                      i.values[0]
                  )?.[1]
                }`,
                '',
                '🎯 Agora escolha o formato.',
                '',
                '💰 Os valores serão criados automaticamente.',
                '👥 Cada fila terá exatamente 2 vagas.'
              ].join('\n'),

            components:
              queueConfigRows()
          });
        }

        /* FILA - FORMATO */

        if (
          i.customId ===
          'qc:fmt'
        ) {
          if (
            !isAdmin(
              i.member
            )
          ) {
            return i.reply({
              content:
                '❌ Apenas administradores.',
              ephemeral:
                true
            });
          }

          db._temp ??= {};
          db._temp[i.user.id] ??= {};

          db._temp[
            i.user.id
          ].format =
            i.values[0];

          save();

          return i.update({
            content:
              [
                '╔═══ 🎮 CRIAR FILAS ═══╗',
                '',
                `🎯 **Formato:** ${i.values[0]}`,
                '',
                '📺 Agora escolha o canal.',
                '',
                '💰 Os valores serão criados automaticamente.',
                '👥 Cada fila terá exatamente 2 vagas.'
              ].join('\n'),

            components:
              queueConfigRows()
          });
        }

        /* CARGO */

        if (
          i.customId ===
          'role:key'
        ) {
          if (
            !isAdmin(
              i.member
            )
          ) {
            return i.reply({
              content:
                '❌ Apenas administradores.',
              ephemeral:
                true
            });
          }

          return i.reply({
            content:
              '🎭 **Selecione o cargo existente no servidor:**',

            components: [
              new ActionRowBuilder()
                .addComponents(
                  new RoleSelectMenuBuilder()
                    .setCustomId(
                      `role:value:${i.values[0]}`
                    )
                    .setPlaceholder(
                      '🎭 Selecionar cargo'
                    )
                )
            ],

            ephemeral:
              true
          });
        }

        /* CANAL */

        if (
          i.customId ===
          'ch:key'
        ) {
          if (
            !isAdmin(
              i.member
            )
          ) {
            return i.reply({
              content:
                '❌ Apenas administradores.',
              ephemeral:
                true
            });
          }

          return i.reply({
            content:
              '📺 **Selecione o canal existente:**',

            components: [
              new ActionRowBuilder()
                .addComponents(
                  new ChannelSelectMenuBuilder()
                    .setCustomId(
                      `ch:value:${i.values[0]}`
                    )
                    .setPlaceholder(
                      '📺 Selecionar canal'
                    )
                    .addChannelTypes(
                      ChannelType.GuildText
                    )
                )
            ],

            ephemeral:
              true
          });
        }

        /* RESULTADO MEDIADOR */

        if (
          i.customId.startsWith(
            'medwinpick:'
          ) ||
          i.customId.startsWith(
            'medwopick:'
          )
        ) {
          const [
            prefix,
            id
          ] =
            i.customId.split(
              ':'
            );

          const bet =
            db.bets[id];

          if (
            !bet ||
            i.user.id !==
              bet.mediatorId ||
            !hasRole(
              i.member,
              'mediator'
            )
          ) {
            return i.reply({
              content:
                '❌ Sem permissão.',
              ephemeral:
                true
            });
          }

          const winner =
            i.values[0];

          const loser =
            winner ===
            bet.p1
              ? bet.p2
              : bet.p1;

          const winnerStats =
            playerStats(
              winner
            );

          const loserStats =
            playerStats(
              loser
            );

          if (
            prefix ===
            'medwinpick'
          ) {
            winnerStats.wins++;
          } else {
            winnerStats.wo++;
          }

          loserStats.losses++;

          bet.status =
            'closed';

          save();

          await i.reply({
            content:
              [
                '╔════════════════════╗',
                '     🏆 **RESULTADO REGISTRADO**',
                '╚════════════════════╝',
                '',
                `🏆 **Vencedor:** <@${winner}>`,
                `❌ **Derrotado:** <@${loser}>`,
                '',
                prefix ===
                'medwinpick'
                  ? '✅ Vitória normal registrada.'
                  : '⚠️ Vitória por W.O. registrada.',
                '',
                '🗑️ O canal será deletado em **15 segundos**.'
              ].join('\n')
          });

          return setTimeout(
            () =>
              i.guild.channels.cache
                .get(
                  bet.channelId
                )
                ?.delete()
                .catch(
                  () => {}
                ),
            15000
          );
        }
      }

      /* =========================
         ROLE SELECT
         ========================= */

      if (
        i.isRoleSelectMenu()
      ) {
        if (
          !isAdmin(
            i.member
          )
        ) {
          return i.reply({
            content:
              '❌ Apenas administradores.',
            ephemeral:
              true
          });
        }

        const [
          ,
          ,
          key
        ] =
          i.customId.split(
            ':'
          );

        db.settings.roles[
          key
        ] =
          i.values[0];

        save();

        return i.update({
          content:
            `✅ **${
              key ===
              'mediator'
                ? 'Mediador'
                : 'Analista'
            }** configurado: <@&${i.values[0]}>`,

          components:
            roleRows()
        });
      }

      /* =========================
         CHANNEL SELECT
         ========================= */

      if (
        i.isChannelSelectMenu()
      ) {
        if (
          !isAdmin(
            i.member
          )
        ) {
          return i.reply({
            content:
              '❌ Apenas administradores.',
            ephemeral:
              true
          });
        }

        if (
          i.customId ===
          'qc:channel'
        ) {
          db._temp ??= {};
          db._temp[i.user.id] ??= {};

          db._temp[
            i.user.id
          ].channel =
            i.values[0];

          const temp =
            db._temp[
              i.user.id
            ];

          if (
            !temp.mod ||
            !temp.format
          ) {
            return i.update({
              content:
                '❌ Escolha primeiro a modalidade e o formato.',

              components:
                queueConfigRows()
            });
          }

          const exists =
            db.settings.queueConfigs.some(
              c =>
                c.mod ===
                  temp.mod &&
                c.format ===
                  temp.format
            );

          if (!exists) {
            db.settings.queueConfigs.push({
              mod:
                temp.mod,

              format:
                temp.format
            });
          }

          db.settings.channels.queue =
            temp.channel;

          delete db._temp[
            i.user.id
          ];

          save();

          await i.update({
            content:
              [
                '╔═══ ✅ FILAS CRIADAS ═══╗',
                '',
                `🎮 **Modalidade:** ${
                  MODS.find(
                    x =>
                      x[0] ===
                      temp.mod
                  )?.[1]
                }`,
                `🎯 **Formato:** ${temp.format}`,
                `📺 **Canal:** <#${temp.channel}>`,
                '',
                '━━━━━━━━━━━━━━━━━━━━',
                '',
                '💰 **VALORES AUTOMÁTICOS**',
                '',
                '💵 R$ 100,00',
                '💵 R$ 50,00',
                '💵 R$ 40,00',
                '💵 R$ 20,00',
                '💵 R$ 10,00',
                '💵 R$ 7,00',
                '💵 R$ 5,00',
                '💵 R$ 3,00',
                '💵 R$ 2,00',
                '💵 R$ 1,00',
                '💵 R$ 0,50',
                '💵 R$ 0,30',
                '',
                '⬆️ Maior valor em cima.',
                '⬇️ Menor valor embaixo.',
                '',
                '👥 Cada fila possui exatamente **2 vagas**.',
                '',
                '✨ Tudo pronto!'
              ].join('\n'),

            components: []
          });

          await publishQueues(
            i.guild
          );

          return;
        }

        const [
          ,
          ,
          key
        ] =
          i.customId.split(
            ':'
          );

        db.settings.channels[
          key
        ] =
          i.values[0];

        save();

        return i.update({
          content:
            `✅ Canal configurado: <#${i.values[0]}>`,

          components:
            channelPickRows()
        });
      }

      /* =========================
         BOTÕES
         ========================= */

      if (
        i.isButton()
      ) {

        /* CONFIG FILAS */

        if (
          i.customId ===
          'cfg:queue'
        ) {
          return i.reply({
            content:
              [
                '╔═══ 🎮 CONFIGURAR FILAS ═══╗',
                '',
                'Escolha somente:',
                '',
                '1️⃣ Modalidade',
                '2️⃣ Formato',
                '3️⃣ Canal',
                '',
                '💰 **O valor NÃO é escolhido manualmente.**',
                '',
                '⚡ O sistema cria automaticamente todos os valores.',
                '👥 Cada fila terá exatamente 2 jogadores.'
              ].join('\n'),

            components:
              queueConfigRows(),

            ephemeral:
              true
          });
        }

        /* CONFIG MEDIADOR */

        if (
          i.customId ===
          'cfg:med'
        ) {
          return i.reply({
            content:
              '🛡️ **Escolha o canal onde ficará a Central de Mediadores:**',

            components: [
              new ActionRowBuilder()
                .addComponents(
                  new ChannelSelectMenuBuilder()
                    .setCustomId(
                      'ch:value:mediator'
                    )
                    .setPlaceholder(
                      '🛡️ Selecionar canal'
                    )
                    .addChannelTypes(
                      ChannelType.GuildText
                    )
                )
            ],

            ephemeral:
              true
          });
        }

        /* CONFIG ANALISTA */

        if (
          i.customId ===
          'cfg:analyst'
        ) {
          return i.reply({
            content:
              [
                '🔎 **CONFIGURAÇÃO DE ANALISTAS**',
                '',
                '📱 Canal 1 → `.SCCMob`',
                '💻 Canal 2 → `.SCCMu`',
                '',
                '⚠️ O cargo Analista possui somente permissão para assumir análises.'
              ].join('\n'),

            components:
              channelPickRows(),

            ephemeral:
              true
          });
        }

        /* CONFIG CARGOS */

        if (
          i.customId ===
          'cfg:roles'
        ) {
          return i.reply({
            content:
              [
                '╔═══ 🎭 CARGOS ═══╗',
                '',
                'Escolha qual cargo deseja configurar.',
                '',
                '🛡️ **Mediador**',
                '🔎 **Analista**',
                '',
                '⚠️ Analista não recebe permissões de Mediador.'
              ].join('\n'),

            components:
              roleRows(),

            ephemeral:
              true
          });
        }

        /* =====================================================
           🎨 NOVA CONFIGURAÇÃO DE APARÊNCIA
           ===================================================== */

        if (
          i.customId ===
          'cfg:appearance'
        ) {
          const modal =
            new ModalBuilder()
              .setCustomId(
                'modal:appearance'
              )
              .setTitle(
                '🎨 PERSONALIZAÇÃO DO BOT'
              );

          const colorInput =
            new TextInputBuilder()
              .setCustomId(
                'color'
              )
              .setLabel(
                '🎨 Cor das Embeds'
              )
              .setPlaceholder(
                '#5865F2'
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(
                true
              )
              .setValue(
                getEmbedColor()
              );

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(
                colorInput
              )
          );

          return i.showModal(
            modal
          );
        }

        /* PIX */

        if (
          i.customId ===
          'cfg:pix'
        ) {
          const modal =
            new ModalBuilder()
              .setCustomId(
                'modal:pix'
              )
              .setTitle(
                '💳 CONFIGURAÇÃO DO PIX'
              );

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId(
                    'name'
                  )
                  .setLabel(
                    '👤 Nome'
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
                    '🔑 Chave PIX'
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
                    '📷 URL do QR Code'
                  )
                  .setStyle(
                    TextInputStyle.Short
                  )
                  .setRequired(
                    false
                  )
              )
          );

          return i.showModal(
            modal
          );
        }

        /* =====================================================
           FILA DE MEDIADORES
           ===================================================== */

        if (
          i.customId ===
            'medq:join' ||
          i.customId ===
            'medq:leave'
        ) {
          if (
            !hasRole(
              i.member,
              'mediator'
            )
          ) {
            return i.reply({
              content:
                '❌ Você não possui o cargo Mediador configurado.',
              ephemeral:
                true
            });
          }

          if (
            i.customId.endsWith(
              'join'
            )
          ) {
            if (
              !db.mediators.includes(
                i.user.id
              )
            ) {
              db.mediators.push(
                i.user.id
              );
            }
          }

          if (
            i.customId.endsWith(
              'leave'
            )
          ) {
            db.mediators =
              db.mediators.filter(
                x =>
                  x !==
                  i.user.id
              );
          }

          save();

          await publishMediatorQueue(
            i.guild
          );

          return i.deferUpdate();
        }

        /* =====================================================
           FILAS
           ===================================================== */

        const parts =
          i.customId.split(
            ':'
          );

        if (
          parts[0] ===
          'queue'
        ) {
          const action =
            parts[1];

          const id =
            parts
              .slice(2)
              .join(':');

          const [
            mod,
            format,
            valueText
          ] =
            id.split('|');

          const c = {
            mod,
            format,
            value:
              Number(
                valueText
              )
          };

          db.queues[id] ??= [];

          if (
            action ===
            'join'
          ) {
            if (
              !availableMediator(
                i.guild
              )
            ) {
              return i.reply({
                content:
                  '🔴 Não há Mediador disponível no momento. Aguarde um Mediador entrar na fila.',
                ephemeral:
                  true
              });
            }

            if (
              db.queues[id].includes(
                i.user.id
              )
            ) {
              return i.reply({
                content:
                  '⚠️ Você já está nessa fila.',
                ephemeral:
                  true
              });
            }

            if (
              db.queues[id].length >=
              2
            ) {
              return i.reply({
                content:
                  '🔴 Essa fila já está completa.',
                ephemeral:
                  true
              });
            }

            db.queues[id].push(
              i.user.id
            );
          }

          if (
            action ===
            'leave'
          ) {
            db.queues[id] =
              db.queues[id].filter(
                x =>
                  x !==
                  i.user.id
              );
          }

          save();

          await i.update({
            embeds: [
              queueEmbed(
                c,
                i.guild
              )
            ],
            components:
              queueButtons(c)
          });

          if (
            action ===
              'join' &&
            db.queues[id].length ===
              2
          ) {
            const [
              p1,
              p2
            ] =
              db.queues[id];

            db.queues[id] =
              [];

            save();

            await createBet(
              i.guild,
              c,
              p1,
              p2
            );
          }

          return;
        }

        /* =====================================================
           CONFIRMAR APOSTA
           ===================================================== */

        if (
          parts[0] ===
            'bet' &&
          parts[1] ===
            'confirm'
        ) {
          const bet =
            db.bets[
              parts[2]
            ];

          if (
            !bet ||
            ![
              bet.p1,
              bet.p2
            ].includes(
              i.user.id
            )
          ) {
            return i.reply({
              content:
                '❌ Você não participa desta aposta.',
              ephemeral:
                true
            });
          }

          bet.confirm[
            i.user.id
          ] =
            true;

          const count =
            Object.values(
              bet.confirm
            ).filter(
              Boolean
            ).length;

          if (
            count <
            2
          ) {
            save();

            return i.reply({
              content:
                [
                  '✅ **CONFIRMAÇÃO REGISTRADA**',
                  '',
                  `👥 Jogadores confirmados: **${count}/2**`,
                  '',
                  '⏳ Aguardando o outro jogador confirmar.'
                ].join('\n'),

              ephemeral:
                true
            });
          }

          bet.status =
            'payment';

          save();

          const pix =
            db.settings.pix;

          return i.update({
            embeds: [
              embed(
                `🔒 APOSTA #${bet.id}`,
                [
                  '╔════════════════════╗',
                  '    ✅ **APOSTA CONFIRMADA**',
                  '╚════════════════════╝',
                  '',
                  '👥 Os dois jogadores confirmaram.',
                  '',
                  `💰 **Valor:** ${money(
                    bet.value
                  )}`,
                  '',
                  '━━━━━━━━━━━━━━━━━━━━',
                  '',
                  '💳 **PAGAMENTO VIA PIX**',
                  '',
                  `👤 **Nome:** ${
                    pix.name ||
                    'Não configurado'
                  }`,
                  `🔑 **Chave:** ${
                    pix.key ||
                    'Não configurada'
                  }`,
                  '',
                  pix.qr
                    ? '📷 **QR Code:** configurado.'
                    : '📷 **QR Code:** não configurado.',
                  '',
                  '⚠️ Aguarde a orientação do Mediador.',
                  '',
                  '━━━━━━━━━━━━━━━━━━━━'
                ].join('\n')
              )
            ],

            components: []
          });
        }

        /* =====================================================
           ANALISTA ASSUMIR
           ===================================================== */

        if (
          parts[0] ===
            'analyst' &&
          parts[1] ===
            'assume'
        ) {
          const request =
            db.analystRequests[
              parts[2]
            ];

          const bet =
            db.bets[
              parts[2]
            ];

          if (
            !request ||
            !bet
          ) {
            return i.reply({
              content:
                '❌ Solicitação não encontrada.',
              ephemeral:
                true
            });
          }

          if (
            !hasRole(
              i.member,
              'analyst'
            )
          ) {
            return i.reply({
              content:
                '❌ Você não possui o cargo Analista.',
              ephemeral:
                true
            });
          }

          if (
            request.analystId
          ) {
            return i.reply({
              content:
                '⚠️ Essa análise já foi assumida.',
              ephemeral:
                true
            });
          }

          request.analystId =
            i.user.id;

          save();

          const channel =
            i.guild.channels.cache.get(
              bet.channelId
            );

          if (channel) {
            await channel.permissionOverwrites.edit(
              i.user.id,
              {
                ViewChannel:
                  true,

                SendMessages:
                  true,

                ReadMessageHistory:
                  true
              }
            );
          }

          return i.reply({
            content:
              `🔎 **ANÁLISE ASSUMIDA!**\n\nVocê foi adicionado ao canal privado ${channel}.`,
            ephemeral:
              true
          });
        }

        /* =====================================================
           MENU DO MEDIADOR
           ===================================================== */

        if (
          parts[0] ===
          'med'
        ) {
          const bet =
            db.bets[
              parts[2]
            ];

          const action =
            parts[1];

          if (
            !bet ||
            i.user.id !==
              bet.mediatorId ||
            !hasRole(
              i.member,
              'mediator'
            )
          ) {
            return i.reply({
              content:
                '❌ Somente o Mediador responsável.',
              ephemeral:
                true
            });
          }

          if (
            action ===
            'finish'
          ) {
            await i.reply({
              content:
                [
                  '🛡️ **APOSTA FINALIZADA**',
                  '',
                  '🗑️ O canal será deletado em **15 segundos**.'
                ].join('\n')
            });

            bet.status =
              'closed';

            save();

            return setTimeout(
              () =>
                i.guild.channels.cache
                  .get(
                    bet.channelId
                  )
                  ?.delete()
                  .catch(
                    () => {}
                  ),
              15000
            );
          }

          const menu =
            new StringSelectMenuBuilder()
              .setCustomId(
                `med${
                  action
                }pick:${bet.id}`
              )
              .setPlaceholder(
                '🏆 Escolha o jogador'
              )
              .addOptions([
                {
                  label:
                    'Jogador 1',
                  value:
                    bet.p1,
                  emoji:
                    '👤'
                },

                {
                  label:
                    'Jogador 2',
                  value:
                    bet.p2,
                  emoji:
                    '👤'
                }
              ]);

          return i.reply({
            content:
              action ===
              'wo'
                ? '⚠️ **W.O.** — escolha o vencedor:'
                : '🏆 **RESULTADO** — escolha o vencedor:',

            components: [
              new ActionRowBuilder()
                .addComponents(
                  menu
                )
            ],

            ephemeral:
              true
          });
        }
      }

      /* =====================================================
         MODAIS
         ===================================================== */

      if (
        i.isModalSubmit()
      ) {

        /* PIX */

        if (
          i.customId ===
          'modal:pix'
        ) {
          db.settings.pix.name =
            i.fields
              .getTextInputValue(
                'name'
              )
              .trim();

          db.settings.pix.key =
            i.fields
              .getTextInputValue(
                'key'
              )
              .trim();

          db.settings.pix.qr =
            i.fields
              .getTextInputValue(
                'qr'
              )
              .trim();

          save();

          return i.reply({
            content:
              '✅ **PIX atualizado com sucesso!**',
            ephemeral:
              true
          });
        }

        /* =====================================================
           🎨 COR DAS EMBEDS
           ===================================================== */

        if (
          i.customId ===
          'modal:appearance'
        ) {
          let color =
            i.fields
              .getTextInputValue(
                'color'
              )
              .trim();

          if (
            !color.startsWith(
              '#'
            )
          ) {
            color =
              `#${color}`;
          }

          if (
            !/^#[0-9A-Fa-f]{6}$/.test(
              color
            )
          ) {
            return i.reply({
              content:
                [
                  '❌ **COR INVÁLIDA**',
                  '',
                  'Use uma cor HEX válida.',
                  '',
                  'Exemplo:',
                  '`#5865F2`',
                  '`#FF0000`',
                  '`#00FF00`',
                  '`#8000FF`'
                ].join('\n'),

              ephemeral:
                true
            });
          }

          db.settings.appearance.color =
            color;

          save();

          return i.reply({
            embeds: [
              embed(
                '🎨 PERSONALIZAÇÃO ATUALIZADA',
                [
                  '╔════════════════════╗',
                  '       ✨ **NOVO VISUAL**',
                  '╚════════════════════╝',
                  '',
                  `🎨 **Cor escolhida:** \`${color}\``,
                  '',
                  '✅ A nova cor será usada nas próximas Embeds do bot.',
                  '',
                  '💡 Use `/config` → **🎨 Aparência** sempre que quiser trocar novamente.'
                ].join('\n')
              )
            ],

            ephemeral:
              true
          });
        }
      }

    } catch (e) {
      console.error(
        'INTERACTION ERROR:',
        e
      );

      if (
        !i.replied &&
        !i.deferred
      ) {
        await i.reply({
          content:
            '❌ Ocorreu um erro interno. Verifique o console da hospedagem.',
          ephemeral:
            true
        }).catch(
          () => {}
        );
      }
    }
  }
);

/* =========================================================
   LOGIN
   ========================================================= */

client.login(
  TOKEN
);
