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
    'Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID no .env'
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
  15,
  35,
  50,
  75,
  100,
  200,
  300,
  500,
  700,
  1000,
  2000,
  5000,
  10000
];

/* =========================================================
   MODALIDADES
   ========================================================= */

const MODS = [
  ['mob', '📱 Mob'],
  ['emu', '💻 Emulador'],
  ['misto', '📱💻 Misto']
];

const FORMATS = [
  '1x1',
  '2x2',
  '3x3',
  '4x4'
];

/* =========================================================
   BANCO
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
      color: '#000000'
    },

    queueConfigs: []
  },

  queues: {},
  queueMessages: {},
  mediators: [],
  mediatorMessageId: null,

  bets: {},

  stats: {},

  nextBet: 1,

  analystRequests: {},

  _temp: {},

  rr: 0
};

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return structuredClone(DEFAULT);
    }

    const x = JSON.parse(
      fs.readFileSync(DATA_FILE, 'utf8')
    );

    return merge(DEFAULT, x);
  } catch (e) {
    console.error(
      'Erro ao carregar data.json:',
      e.message
    );

    return structuredClone(DEFAULT);
  }
}

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

let db = load();

function save() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (e) {
    console.error(
      'Erro ao salvar:',
      e.message
    );
  }
}

/* =========================================================
   FUNÇÕES BÁSICAS
   ========================================================= */

function money(cents) {
  return `R$ ${(Number(cents) / 100)
    .toFixed(2)
    .replace('.', ',')}`;
}

function qid(mod, format, value) {
  return `${mod}|${format}|${value}`;
}

function roleId(key) {
  return db.settings.roles[key] || null;
}

function isAdmin(member) {
  return (
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
   COR DAS EMBEDS
   ========================================================= */

function getEmbedColor() {
  let color =
    db.settings.appearance.color ||
    '#000000';

  color = String(color).trim();

  if (!color.startsWith('#')) {
    color = `#${color}`;
  }

  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return '#000000';
  }

  return color;
}

function embed(title, description) {
  return new EmbedBuilder()
    .setColor(getEmbedColor())
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: 'Sistema de Apostas • Free Fire'
    })
    .setTimestamp();
}

/* =========================================================
   ESTATÍSTICAS
   ========================================================= */

function playerStats(id) {
  return (
    db.stats[id] ||= {
      wins: 0,
      wo: 0,
      losses: 0
    }
  );
}

function statsEmbed(user) {
  const s =
    playerStats(user.id);

  return embed(
    `📊 ESTATÍSTICAS • ${user.username}`,
    [
      `🏆 **Vitórias:** ${s.wins}`,
      `⚠️ **Vitórias por W.O.:** ${s.wo}`,
      `❌ **Derrotas:** ${s.losses}`
    ].join('\n')
  );
}

/* =========================================================
   CONFIG
   ========================================================= */

function configEmbed() {
  const s =
    db.settings;

  return embed(
    '⚙️ CENTRAL DE CONFIGURAÇÃO',
    [
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      `🎮 **Filas:** ${s.queueConfigs.length}`,
      '',
      `🛡️ **Mediador:** ${
        s.roles.mediator
          ? `<@&${s.roles.mediator}>`
          : '❌ Não configurado'
      }`,
      '',
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
      `🎨 **Cor:** \`${getEmbedColor()}\``,
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '👥 Todas as filas possuem exatamente **2 jogadores**.',
      '💰 Os valores são criados automaticamente.'
    ].join('\n')
  );
}

function configRows() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            'cfg:queue'
          )
          .setLabel(
            '🎮 Filas'
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            'cfg:med'
          )
          .setLabel(
            '🛡️ Mediador'
          )
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            'cfg:analyst'
          )
          .setLabel(
            '🔎 Analista'
          )
          .setStyle(
            ButtonStyle.Primary
          )
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            'cfg:roles'
          )
          .setLabel(
            '🎭 Cargos'
          )
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            'cfg:pix'
          )
          .setLabel(
            '💳 PIX'
          )
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            'cfg:appearance'
          )
          .setLabel(
            '🎨 Aparência'
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      )
  ];
}

/* =========================================================
   CONFIGURAÇÃO DE FILAS
   ========================================================= */

function queueConfigRows() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(
            'qc:mod'
          )
          .setPlaceholder(
            '📱 Escolha a modalidade'
          )
          .addOptions(
            MODS.map(
              ([value, label]) => ({
                label:
                  label.replace(
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
              })
            )
          )
      ),

    new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(
            'qc:fmt'
          )
          .setPlaceholder(
            '🎯 Escolha o formato'
          )
          .addOptions(
            FORMATS.map(
              value => ({
                label: value,
                value,
                emoji: '🎯'
              })
            )
          )
      ),

    new ActionRowBuilder()
      .addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(
            'qc:channel'
          )
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
    new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(
            'role:key'
          )
          .setPlaceholder(
            '🎭 Escolha o cargo'
          )
          .addOptions([
            {
              label:
                'Mediador',
              value:
                'mediator',
              description:
                'Pode atender apostas e usar os comandos de Mediador',
              emoji:
                '🛡️'
            },

            {
              label:
                'Analista',
              value:
                'analyst',
              description:
                'Somente pode assumir análises',
              emoji:
                '🔎'
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
    new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(
            'ch:key'
          )
          .setPlaceholder(
            '📺 Escolha o canal'
          )
          .addOptions([
            {
              label:
                'Fila de Mediadores',
              value:
                'mediator',
              emoji:
                '🛡️'
            },

            {
              label:
                'Canal 1 — SSMob',
              value:
                'analystMob',
              emoji:
                '📱'
            },

            {
              label:
                'Canal 2 — SCCMu',
              value:
                'analystEmu',
              emoji:
                '💻'
            }
          ])
      )
  ];
}

/* =========================================================
   🎮 VISUAL DAS FILAS
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
        typeof x ===
        'string'
    );

  const med =
    availableMediator(
      guild
    );

  const mod =
    MODS.find(
      x =>
        x[0] ===
        c.mod
    );

  const jogadores =
    arr.length
      ? arr
          .map(
            (u, i) =>
              `**${i + 1}.** <@${u}>`
          )
          .join('\n')
      : '`Nenhum jogador entrou ainda.`';

  const vagas =
    arr.length === 0
      ? '⬜⬜'
      : arr.length === 1
        ? '🟩⬜'
        : '🟩🟩';

  return embed(
    `»» FILA ${mod?.[1] || '🎮'} • ${c.format}`,
    [
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '🎮 **JOGO**',
      '└─ Free Fire',
      '',
      '💰 **VALOR DA APOSTA**',
      `└─ **${money(c.value)} por jogador**`,
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      `👥 **JOGADORES (${arr.length}/2)**`,
      `${vagas}`,
      '',
      jogadores,
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      med
        ? '🟢 **Mediador disponível**'
        : '🔴 **Nenhum Mediador disponível**',
      '',
      med
        ? '⚡ A fila está liberada para entrada.'
        : '⏳ Aguarde um Mediador ficar disponível.',
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '🎯 **ENTRE NA FILA E AGUARDE O OPONENTE**',
      '',
      '⚠️ Cada fila possui exatamente **2 jogadores**.',
      '',
      '✨ Boa sorte! ✨'
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

  const buttons = [
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
  ];

  /*
   * No 1x1 aparecem os dois tipos de gelo
   * nos botões, sem criar duas filas diferentes.
   */

  if (
    c.format ===
    '1x1'
  ) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(
          `queue:ice_normal:${id}`
        )
        .setLabel(
          '🧊 GELO NORMAL'
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          `queue:ice_infinite:${id}`
        )
        .setLabel(
          '♾️ GELO INFINITO'
        )
        .setStyle(
          ButtonStyle.Primary
        )
    );
  }

  return [
    new ActionRowBuilder()
      .addComponents(
        buttons
      )
  ];
}

/* =========================================================
   🛡️ FILA DE MEDIADORES
   ========================================================= */

function mediatorEmbed() {
  const total =
    db.mediators.length;

  const lista =
    total
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
      : '`Nenhum Mediador disponível no momento.`';

  return embed(
    '🛡️ CENTRAL DE MEDIADORES',
    [
      '╔════════════════════════╗',
      '      🛡️ **MEDIADORES ONLINE**',
      '╚════════════════════════╝',
      '',
      `🟢 **Disponíveis:** ${total}`,
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '👥 **EQUIPE DISPONÍVEL**',
      '',
      lista,
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      '⚡ **SISTEMA DE ATENDIMENTO**',
      '',
      '🟢 **Ficar disponível**',
      '└─ Você entra na fila de atendimento.',
      '',
      '🔴 **Ficar indisponível**',
      '└─ Você sai da fila de atendimento.',
      '',
      '🎯 Quando uma aposta estiver pronta,',
      'o sistema poderá selecionar um Mediador.',
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '',
      total
        ? '🟢 **STATUS:** Atendimento disponível.'
        : '🔴 **STATUS:** Aguardando Mediador.',
      '',
      '✨ Obrigado por fazer parte da equipe! ✨'
    ].join('\n')
  );
}

function mediatorButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
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
        role.members.has(
          id
        ) &&
        !busy.has(
          id
        )
    );

  if (!list.length) {
    return null;
  }

  return list[
    Number(
      db.rr || 0
    ) %
      list.length
  ];
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
        role.members.has(
          id
        ) &&
        !busy.has(
          id
        )
    );

  if (!list.length) {
    return null;
  }

  const id =
    list[
      Number(
        db.rr || 0
      ) %
        list.length
    ];

  db.rr =
    Number(
      db.rr || 0
    ) + 1;

  save();

  return id;
}

/* =========================================================
   PERMISSÕES DO CANAL PRIVADO
   ========================================================= */

function privateOverwrites(
  guild,
  bet
) {
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
    ].map(
      id => ({
        id,

        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      })
    )
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
    mediatorNext(
      guild
    );

  if (!mediator) {
    return null;
  }

  let category =
    guild.channels.cache.get(
      db.settings.channels
        .privateCategory
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
          name:
            'FILAS',
          type:
            ChannelType.GuildCategory
        });
    }

    db.settings.channels
      .privateCategory =
      category.id;
  }

  const id =
    String(
      db.nextBet++
    );

  const bet = {
    id,

    guildId:
      guild.id,

    p1,
    p2,

    mediatorId:
      mediator,

    mod:
      c.mod,

    format:
      c.format,

    value:
      c.value,

    iceMode:
      null,

    confirm: {
      [p1]: false,
      [p2]: false
    },

    status:
      'confirm',

    channelId:
      null,

    roomId:
      null,

    roomPassword:
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
        `🔒 APOSTA #${id}`,
        [
          '╔════════════════════╗',
          '      🎮 **NOVA APOSTA**',
          '╚════════════════════╝',
          '',
          `👤 **Jogador 1:** <@${p1}>`,
          `👤 **Jogador 2:** <@${p2}>`,
          '',
          `🛡️ **Mediador:** <@${mediator}>`,
          '',
          '━━━━━━━━━━━━━━━━━━━━',
          '',
          `💰 **Valor:** ${money(
            c.value
          )}`,
          `🎮 **Modalidade:** ${
            MODS.find(
              x =>
                x[0] ===
                c.mod
            )?.[1] ||
            c.mod
          }`,
          `🎯 **Formato:** ${c.format}`,
          '',
          '━━━━━━━━━━━━━━━━━━━━',
          '',
          '✅ **CONFIRMAÇÃO DA APOSTA**',
          '',
          'Os dois jogadores precisam',
          'confirmar antes de continuar.',
          '',
          '⚠️ Aguarde as instruções do Mediador.',
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

async function publishQueues(
  guild
) {
  const channel =
    guild.channels.cache.get(
      db.settings.channels
        .queue
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

async function createStructure(
  guild
) {
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
        name:
          'FILAS',

        type:
          ChannelType.GuildCategory
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
        name:
          'filas',

        type:
          ChannelType.GuildText,

        parent:
          category.id
      });
  }

  db.settings.channels.queue =
    queue.id;

  db.settings.channels
    .privateCategory =
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

  db.settings.channels
    .analystMob =
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

  db.settings.channels
    .analystEmu =
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
   PUBLICAR MEDIADORES
   ========================================================= */

async function publishMediatorQueue(
  guild
) {
  const channel =
    guild.channels.cache.get(
      db.settings.channels
        .mediator
    );

  if (!channel) {
    return;
  }

  const payload = {
    embeds: [
      mediatorEmbed()
    ],

    components:
      mediatorButtons()
  };

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
    await message.edit(
      payload
    );
  } else {
    message =
      await channel.send(
        payload
      );

    db.mediatorMessageId =
      message.id;
  }

  save();
}

/* =========================================================
   🎮 IDENTIFICAR ID + SENHA DA SALA
   ========================================================= */

function extractRoomCredentials(
  content
) {
  const text =
    String(
      content || ''
    ).trim();

  /*
   * Aceita formatos como:
   *
   * ID: 123456
   * Senha: 9876
   *
   * ID 123456
   * SENHA 9876
   *
   * id = 123456
   * senha = 9876
   */

  const idMatch =
    text.match(
      /(?:id\s*(?:da\s*sala)?\s*[:=;-]?\s*)(\d{4,20})/i
    );

  const passwordMatch =
    text.match(
      /(?:senha|password|pass)\s*[:=;-]?\s*([A-Za-z0-9_-]{3,30})/i
    );

  if (
    !idMatch ||
    !passwordMatch
  ) {
    return null;
  }

  return {
    id:
      idMatch[1],

    password:
      passwordMatch[1]
  };
}

/* =========================================================
   🎮 EMBED DA SALA CRIADA
   ========================================================= */

function roomEmbed(
  bet,
  roomId,
  password
) {
  return new EmbedBuilder()
    .setColor(
      '#FFFFFF'
    )
    .setTitle(
      '🎮 SALA CRIADA'
    )
    .setDescription(
      [
        '╔════════════════════╗',
        '      🎮 **SALA FREE FIRE**',
        '╚════════════════════╝',
        '',
        '✅ **A sala foi criada com sucesso!**',
        '',
        '⏱️ A partida será iniciada em',
        '**3 a 5 minutos**.',
        '',
        '━━━━━━━━━━━━━━━━━━━━',
        '',
        `🆔 **ID DA SALA**`,
        `\`${roomId}\``,
        '',
        `🔐 **SENHA DA SALA**`,
        `\`${password}\``,
        '',
        '━━━━━━━━━━━━━━━━━━━━',
        '',
        `💰 **Aposta:** ${money(
          bet.value
        )} por jogador`,
        `🎯 **Formato:** ${bet.format}`,
        '',
        '⚠️ Entre na sala somente quando',
        'o Mediador liberar.',
        '',
        '✨ Boa partida! ✨'
      ].join('\n')
    )
    .setFooter({
      text:
        'Free Fire • Sala privada'
    })
    .setTimestamp();
}

function roomButtons(
  bet
) {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `room:copyid:${bet.id}`
          )
          .setLabel(
            '📋 COPIAR ID'
          )
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            `room:copypass:${bet.id}`
          )
          .setLabel(
            '📋 COPIAR SENHA'
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      )
  ];
}

/* =========================================================
   🔄 ATUALIZAR CANAL PARA PAGAMENTO
   ========================================================= */

async function renamePaymentChannel(
  channel,
  bet
) {
  const total =
    Number(
      bet.value
    ) * 2;

  const totalText =
    (total / 100)
      .toFixed(2)
      .replace(
        '.',
        '-'
      );

  const newName =
    `💰・pagar-${totalText}`;

  try {
    await channel.setName(
      newName
    );
  } catch (e) {
    console.error(
      'Não foi possível alterar o nome do canal:',
      e.message
    );
  }
}

/* =========================================================
   🎮 PROCESSAR ID + SENHA
   ========================================================= */

async function processRoomMessage(
  message,
  bet
) {
  const room =
    extractRoomCredentials(
      message.content
    );

  if (!room) {
    return false;
  }

  /*
   * Somente ADM ou o Mediador responsável.
   */

  const authorized =
    isAdmin(
      message.member
    ) ||
    (
      hasRole(
        message.member,
        'mediator'
      ) &&
      message.author.id ===
        bet.mediatorId
    );

  if (!authorized) {
    return false;
  }

  bet.roomId =
    room.id;

  bet.roomPassword =
    room.password;

  bet.status =
    'room_created';

  save();

  await message.channel.send({
    embeds: [
      roomEmbed(
        bet,
        room.id,
        room.password
      )
    ],

    components:
      roomButtons(
        bet
      )
  });

  /*
   * Valor total:
   *
   * R$ 1,00 + R$ 1,00
   * = R$ 2,00
   */

  await renamePaymentChannel(
    message.channel,
    bet
  );

  return true;
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
      '📊 Mostra as estatísticas'
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
          db.settings.queueConfigs
            .length &&
          db.settings.channels.queue
        ) {
          await publishQueues(
            guild
          );
        }
      }

      const rest =
        new REST({
          version:
            '10'
        }).setToken(
          TOKEN
        );

      await rest.put(
        Routes.applicationGuildCommands(
          CLIENT_ID,
          GUILD_ID
        ),
        {
          body:
            slash
        }
      );

      console.log(
        `✅ ${client.user.tag} online.`
      );

      console.log(
        '🎮 Sistema de salas carregado.'
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
    try {
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

      /*
       * Procura a aposta ativa
       * neste canal.
       */

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

      /*
       * PRIMEIRO:
       * tenta detectar ID + senha.
       */

      if (
        bet &&
        (
          bet.status ===
            'confirm' ||
          bet.status ===
            'payment' ||
          bet.status ===
            'room_created'
        )
      ) {
        const room =
          extractRoomCredentials(
            message.content
          );

        if (room) {
          await processRoomMessage(
            message,
            bet
          );

          return;
        }
      }

      /* =====================================================
         .MED
         ===================================================== */

      if (
        cmd ===
        '.med'
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
              '╔════════════════════╗',
              '      🛡️ **PAINEL DO MEDIADOR**',
              '╚════════════════════╝',
              '',
              '🏆 Escolha uma ação:',
              '',
              '🎮 O Mediador também pode enviar',
              '**ID e senha da sala diretamente aqui.**'
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
                    '🗑️ Finalizar'
                  )
                  .setStyle(
                    ButtonStyle.Secondary
                  )
              )
          ]
        });
      }

      /* =====================================================
         .SCCMOB / .SCCMU
         ===================================================== */

      if (
        cmd ===
          '.sccmob' ||
        cmd ===
          '.sccmu'
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
            '❌ Somente o Mediador responsável.'
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
              '🔎 ANÁLISE DISPONÍVEL',
              [
                mob
                  ? '📱 **Tipo:** Análise Mobile'
                  : '💻 **Tipo:** Análise Emulador/PC',

                '',

                `🔒 **Aposta:** #${bet.id}`,

                `🛡️ **Mediador:** <@${bet.mediatorId}>`,

                '',

                '🔎 Um Analista disponível pode assumir esta análise.'
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
          '✅ Solicitação enviada para os Analistas.'
        );
      }

    } catch (e) {
      console.error(
        'MESSAGE ERROR:',
        e
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

      /* =====================================================
         SLASH
         ===================================================== */

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

      /* =====================================================
         SELECT MENUS
         ===================================================== */

      if (
        i.isStringSelectMenu()
      ) {

        if (
          i.customId ===
            'qc:mod' ||
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

          db._temp[
            i.user.id
          ] ??= {};

          if (
            i.customId ===
            'qc:mod'
          ) {
            db._temp[
              i.user.id
            ].mod =
              i.values[0];
          } else {
            db._temp[
              i.user.id
            ].format =
              i.values[0];
          }

          save();

          return i.update({
            content:
              [
                '╔════════════════════╗',
                '      🎮 **CRIAR FILAS**',
                '╚════════════════════╝',
                '',
                '💰 Os valores serão criados automaticamente.',
                '👥 Cada fila terá exatamente 2 vagas.',
                '',
                '⬆️ Os maiores valores ficam acima.',
                '⬇️ Os menores valores ficam abaixo.'
              ].join('\n'),

            components:
              queueConfigRows()
          });
        }

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
              '🎭 **Agora selecione o cargo:**',

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
              '📺 **Agora selecione o canal:**',

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

          const b =
            db.bets[id];

          if (
            !b ||
            i.user.id !==
              b.mediatorId ||
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
            b.p1
              ? b.p2
              : b.p1;

          const ws =
            playerStats(
              winner
            );

          const ls =
            playerStats(
              loser
            );

          if (
            prefix ===
            'medwinpick'
          ) {
            ws.wins++;
          } else {
            ws.wo++;
          }

          ls.losses++;

          b.status =
            'closed';

          save();

          await i.reply({
            content:
              [
                '🏆 **RESULTADO REGISTRADO**',
                '',
                `🏆 Vencedor: <@${winner}>`,
                `❌ Perdedor: <@${loser}>`,
                '',
                '🗑️ O canal será deletado em 15 segundos.'
              ].join('\n')
          });

          return setTimeout(
            () =>
              i.guild.channels.cache
                .get(
                  b.channelId
                )
                ?.delete()
                .catch(
                  () => {}
                ),
            15000
          );
        }
      }

      /* =====================================================
         ROLE SELECT
         ===================================================== */

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
            `✅ Cargo **${
              key ===
              'mediator'
                ? 'Mediador'
                : 'Analista'
            }** configurado: <@&${i.values[0]}>`,

          components:
            roleRows()
        });
      }

      /* =====================================================
         CHANNEL SELECT
         ===================================================== */

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

          db._temp[
            i.user.id
          ] ??= {};

          db._temp[
            i.user.id
          ].channel =
            i.values[0];

          const t =
            db._temp[
              i.user.id
            ];

          if (
            !t.mod ||
            !t.format
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
                  t.mod &&
                c.format ===
                  t.format
            );

          if (!exists) {
            db.settings.queueConfigs.push({
              mod:
                t.mod,

              format:
                t.format
            });
          }

          db.settings.channels.queue =
            t.channel;

          delete db._temp[
            i.user.id
          ];

          save();

          await i.update({
            content:
              [
                '╔════════════════════╗',
                '       ✅ **FILAS CONFIGURADAS**',
                '╚════════════════════╝',
                '',
                `🎮 Modalidade: **${
                  MODS.find(
                    x =>
                      x[0] ===
                      t.mod
                  )?.[1]
                }**`,
                `🎯 Formato: **${t.format}**`,
                `📺 Canal: <#${t.channel}>`,
                '',
                '💰 Todos os valores foram criados automaticamente.',
                '👥 Cada fila possui 2 vagas.',
                '',
                '✨ Sistema pronto!'
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

      /* =====================================================
         BOTÕES
         ===================================================== */

      if (
        i.isButton()
      ) {

        /* ===================================================
           CONFIG FILAS
           =================================================== */

        if (
          i.customId ===
          'cfg:queue'
        ) {
          return i.reply({
            content:
              [
                '╔════════════════════╗',
                '       🎮 **CONFIGURAR FILAS**',
                '╚════════════════════╝',
                '',
                'Você escolhe somente:',
                '',
                '1️⃣ Modalidade',
                '2️⃣ Formato',
                '3️⃣ Canal',
                '',
                '💰 **Os valores são automáticos.**',
                '👥 **Cada fila possui exatamente 2 vagas.**',
                '',
                '🧊 Nos formatos **1x1**, aparecerão também:',
                '🧊 Gelo Normal',
                '♾️ Gelo Infinito'
              ].join('\n'),

            components:
              queueConfigRows(),

            ephemeral:
              true
          });
        }

        /* ===================================================
           CONFIG MEDIADOR
           =================================================== */

        if (
          i.customId ===
          'cfg:med'
        ) {
          return i.reply({
            content:
              '🛡️ **Selecione o canal da Central de Mediadores:**',

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

        /* ===================================================
           CONFIG ANALISTA
           =================================================== */

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
                '⚠️ O cargo Analista serve somente para assumir análises.'
              ].join('\n'),

            components:
              channelPickRows(),

            ephemeral:
              true
          });
        }

        /* ===================================================
           CONFIG CARGOS
           =================================================== */

        if (
          i.customId ===
          'cfg:roles'
        ) {
          return i.reply({
            content:
              [
                '🎭 **CONFIGURAÇÃO DE CARGOS**',
                '',
                '🛡️ Mediador',
                '🔎 Analista',
                '',
                '⚠️ Analista não recebe permissões de Mediador.'
              ].join('\n'),

            components:
              roleRows(),

            ephemeral:
              true
          });
        }

        /* ===================================================
           🎨 CONFIG APARÊNCIA
           =================================================== */

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
                '🎨 COR DAS EMBEDS'
              );

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId(
                    'color'
                  )
                  .setLabel(
                    '🎨 Cor HEX'
                  )
                  .setPlaceholder(
                    '#FFFFFF'
                  )
                  .setStyle(
                    TextInputStyle.Short
                  )
                  .setRequired(
                    true
                  )
                  .setValue(
                    getEmbedColor()
                  )
              )
          );

          return i.showModal(
            modal
          );
        }

        /* ===================================================
           PIX
           =================================================== */

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

        /* ===================================================
           FILA MEDIADORES
           =================================================== */

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
            i.customId ===
            'medq:join'
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
          } else {
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

        /* ===================================================
           FILA DE APOSTAS
           =================================================== */

        const p =
          i.customId.split(
            ':'
          );

        if (
          p[0] ===
          'queue'
        ) {
          const action =
            p[1];

          const id =
            p.slice(
              2
            ).join(
              ':'
            );

          const [
            mod,
            format,
            value
          ] =
            id.split(
              '|'
            );

          const c = {
            mod,
            format,
            value:
              Number(
                value
              )
          };

          db.queues[id] ??= [];

          /* ===============================================
             ENTRAR
             =============================================== */

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
                  '🔴 Não há Mediador disponível no momento.',
                ephemeral:
                  true
              });
            }

            if (
              db.queues[id]
                .includes(
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
              db.queues[id]
                .length >=
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

          /* ===============================================
             SAIR
             =============================================== */

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

          /* ===============================================
             GELO NORMAL
             =============================================== */

          if (
            action ===
            'ice_normal'
          ) {
            return i.reply({
              content:
                [
                  '🧊 **GELO NORMAL**',
                  '',
                  'Esta opção será usada para a partida com gelo normal.',
                  '',
                  '🎮 Entre na fila normalmente pelo botão **ENTRAR NA FILA**.',
                  '',
                  '⚠️ O tipo escolhido ficará registrado para a partida 1x1.'
                ].join('\n'),

              ephemeral:
                true
            });
          }

          /* ===============================================
             GELO INFINITO
             =============================================== */

          if (
            action ===
            'ice_infinite'
          ) {
            return i.reply({
              content:
                [
                  '♾️ **GELO INFINITO**',
                  '',
                  'Esta opção será usada para a partida com gelo infinito.',
                  '',
                  '🎮 Entre na fila normalmente pelo botão **ENTRAR NA FILA**.',
                  '',
                  '⚠️ O tipo escolhido ficará registrado para a partida 1x1.'
                ].join('\n'),

              ephemeral:
                true
            });
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

          /* ===============================================
             COMPLETO
             =============================================== */

          if (
            action ===
              'join' &&
            db.queues[id]
              .length ===
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

        /* ===================================================
           COPIAR ID
           =================================================== */

        if (
          p[0] ===
            'room' &&
          p[1] ===
            'copyid'
        ) {
          const bet =
            db.bets[
              p[2]
            ];

          if (
            !bet ||
            !bet.roomId
          ) {
            return i.reply({
              content:
                '❌ O ID da sala ainda não foi registrado.',
              ephemeral:
                true
            });
          }

          return i.reply({
            content:
              `🆔 **ID DA SALA**\n\n\`${bet.roomId}\`\n\n📋 Toque e segure o código para copiar.`,

            ephemeral:
              true
          });
        }

        /* ===================================================
           COPIAR SENHA
           =================================================== */

        if (
          p[0] ===
            'room' &&
          p[1] ===
            'copypass'
        ) {
          const bet =
            db.bets[
              p[2]
            ];

          if (
            !bet ||
            !bet.roomPassword
          ) {
            return i.reply({
              content:
                '❌ A senha da sala ainda não foi registrada.',
              ephemeral:
                true
            });
          }

          return i.reply({
            content:
              `🔐 **SENHA DA SALA**\n\n\`${bet.roomPassword}\`\n\n📋 Toque e segure o código para copiar.`,

            ephemeral:
              true
          });
        }

        /* ===================================================
           CONFIRMAR APOSTA
           =================================================== */

        if (
          p[0] ===
            'bet' &&
          p[1] ===
            'confirm'
        ) {
          const b =
            db.bets[
              p[2]
            ];

          if (
            !b ||
            ![
              b.p1,
              b.p2
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

          b.confirm[
            i.user.id
          ] =
            true;

          const count =
            Object.values(
              b.confirm
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
                  `👥 Confirmados: **${count}/2**`,
                  '',
                  '⏳ Aguardando o outro jogador.'
                ].join('\n'),

              ephemeral:
                true
            });
          }

          b.status =
            'payment';

          save();

          const pix =
            db.settings.pix;

          return i.update({
            embeds: [
              embed(
                `🔒 APOSTA #${b.id}`,
                [
                  '╔════════════════════╗',
                  '       ✅ **APOSTA CONFIRMADA**',
                  '╚════════════════════╝',
                  '',
                  '👥 Os dois jogadores confirmaram.',
                  '',
                  `💰 **Valor por jogador:** ${money(
                    b.value
                  )}`,
                  `💰 **Total da aposta:** ${money(
                    Number(
                      b.value
                    ) * 2
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
                    ? '📷 QR Code configurado.'
                    : '📷 QR Code não configurado.',
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

        /* ===================================================
           ANALISTA ASSUMIR
           =================================================== */

        if (
          p[0] ===
            'analyst' &&
          p[1] ===
            'assume'
        ) {
          const r =
            db.analystRequests[
              p[2]
            ];

          const b =
            db.bets[
              p[2]
            ];

          if (
            !r ||
            !b
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
            r.analystId
          ) {
            return i.reply({
              content:
                '⚠️ Essa análise já foi assumida.',
              ephemeral:
                true
            });
          }

          r.analystId =
            i.user.id;

          save();

          const ch =
            i.guild.channels.cache.get(
              b.channelId
            );

          if (ch) {
            await ch.permissionOverwrites.edit(
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
              `✅ **Análise assumida!**\n\nVocê foi adicionado ao canal privado ${ch}.`,
            ephemeral:
              true
          });
        }

        /* ===================================================
           MEDIADOR
           =================================================== */

        if (
          p[0] ===
          'med'
        ) {
          const b =
            db.bets[
              p[2]
            ];

          const action =
            p[1];

          if (
            !b ||
            i.user.id !==
              b.mediatorId ||
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
                  '🗑️ **APOSTA FINALIZADA**',
                  '',
                  'O canal será deletado em 15 segundos.'
                ].join('\n')
            });

            b.status =
              'closed';

            save();

            return setTimeout(
              () =>
                i.guild.channels.cache
                  .get(
                    b.channelId
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
                `med${action}pick:${b.id}`
              )
              .setPlaceholder(
                '🏆 Escolha o jogador'
              )
              .addOptions([
                {
                  label:
                    'Jogador 1',
                  value:
                    b.p1,
                  emoji:
                    '👤'
                },

                {
                  label:
                    'Jogador 2',
                  value:
                    b.p2,
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
              '✅ **PIX configurado com sucesso!**',
            ephemeral:
              true
          });
        }

        /* COR */

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
                  '`#FFFFFF`',
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
                '🎨 COR ATUALIZADA',
                [
                  `🎨 **Nova cor:** \`${color}\``,
                  '',
                  '✅ A nova cor será usada nas próximas embeds.'
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
            '❌ Ocorreu um erro interno. Veja o console da hospedagem.',
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
