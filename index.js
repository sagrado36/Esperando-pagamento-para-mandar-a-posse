require("dotenv").config();

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
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const fs = require("fs");
const path = require("path");

/* =========================================================
   TOKEN / IDs
========================================================= */

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    "❌ Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID no .env"
  );
  process.exit(1);
}

/* =========================================================
   BANCO DE DADOS
========================================================= */

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "data.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });
}

const DEFAULT = {
  settings: {
    roles: {
      admin: null,
      subowner: null,
      mediator: null,
      analyst: null,
      member: null,
      support: null,
      finance: null,
      privateAccess: null
    },

    channels: {
      queueMobile: null,
      queueEmulator: null,
      queueMixed: null,
      privateCategory: null,
      mediatorCategory: null,
      mediatorQueue: null,
      analystNotify: null,
      ssmob: null,
      ssemu: null,
      feed: null,
      payments: null,
      events: null,
      community: null,
      support: null
    },

    appearance: {
      color: "#5865F2",
      title: "🎮 FILA DE APOSTAS",
      description:
        "Escolha sua modalidade, formato e entre na fila.",
      footer: "🎮 Sistema de Apostas",
      thumbnail: "",
      banner: "",
      botStatus: "🎮 Sistema de Apostas",
      botAvatar: ""
    },

    fee: {
      type: "percent",
      value: 0
    },

    pix: {
      key: "",
      name: "",
      city: "",
      qr: ""
    },

    coins: {
      win: 1,
      wo: 0,
      entry: 0
    }
  },

  /*
    As filas são criadas automaticamente.
    O administrador NÃO precisa cadastrar cada valor.
  */
  queueConfigs: [],

  queues: {},

  bets: {},

  coins: {},

  stats: {},

  mediatorQueue: [],

  analystRequests: [],

  nextBet: 1,

  temp: {}
};

function cloneDefault() {
  return JSON.parse(
    JSON.stringify(DEFAULT)
  );
}

function loadDB() {
  if (!fs.existsSync(DATA_FILE)) {
    return cloneDefault();
  }

  try {
    const data = JSON.parse(
      fs.readFileSync(
        DATA_FILE,
        "utf8"
      )
    );

    const base = cloneDefault();

    return {
      ...base,
      ...data,

      settings: {
        ...base.settings,
        ...(data.settings || {}),

        roles: {
          ...base.settings.roles,
          ...((data.settings || {}).roles || {})
        },

        channels: {
          ...base.settings.channels,
          ...((data.settings || {}).channels || {})
        },

        appearance: {
          ...base.settings.appearance,
          ...((data.settings || {}).appearance || {})
        },

        fee: {
          ...base.settings.fee,
          ...((data.settings || {}).fee || {})
        },

        pix: {
          ...base.settings.pix,
          ...((data.settings || {}).pix || {})
        },

        coins: {
          ...base.settings.coins,
          ...((data.settings || {}).coins || {})
        }
      }
    };
  } catch (error) {
    console.error(
      "❌ Erro lendo data.json:",
      error
    );

    return cloneDefault();
  }
}

let db = loadDB();

function save() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      db,
      null,
      2
    )
  );
}

/* =========================================================
   MODALIDADES / FORMATOS / VALORES
========================================================= */

const MODS = [
  ["mobile", "📱 Mobile"],
  ["emulador", "💻 Emulador"],
  ["misto", "🔄 Misto"]
];

const FORMATS = [
  ["1x1", "1x1"],
  ["2x2", "2x2"],
  ["3x3", "3x3"],
  ["4x4", "4x4"]
];

/*
  Valores predefinidos.
  Não precisa escolher um por um no /fila.
*/
const VALUES = [
  30,
  50,
  100,
  200,
  300,
  500,
  700,
  1000,
  2000,
  4000,
  5000,
  10000
];

/* =========================================================
   FUNÇÕES GERAIS
========================================================= */

const money = cents =>
  `R$ ${(Number(cents) / 100)
    .toFixed(2)
    .replace(".", ",")}`;

const fmt = (arr, key) =>
  arr.find(
    x => x[0] === key
  )?.[1] || key;

function qkey(
  modality,
  format,
  value,
  ice
) {
  return [
    modality,
    format,
    value,
    ice || "normal"
  ].join("|");
}

function roleId(key) {
  return (
    db.settings.roles[key] ||
    null
  );
}

function channelId(key) {
  return (
    db.settings.channels[key] ||
    null
  );
}

function isAdmin(member) {
  if (!member) return false;

  return (
    member.permissions.has(
      PermissionsBitField.Flags.Administrator
    ) ||
    member.permissions.has(
      PermissionsBitField.Flags.ManageGuild
    )
  );
}

function isMediator(member) {
  if (!member) return false;

  if (
    member.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  ) {
    return true;
  }

  const id =
    roleId("mediator");

  return (
    id &&
    member.roles.cache.has(id)
  );
}

function isAnalyst(member) {
  if (!member) return false;

  if (
    member.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  ) {
    return true;
  }

  const id =
    roleId("analyst");

  return (
    id &&
    member.roles.cache.has(id)
  );
}

function makeEmbed(
  title,
  description
) {
  const a =
    db.settings.appearance;

  const embed =
    new EmbedBuilder()
      .setTitle(title)
      .setDescription(
        description
      )
      .setColor(
        /^#[0-9A-F]{6}$/i.test(
          a.color || ""
        )
          ? a.color
          : "#5865F2"
      )
      .setFooter({
        text:
          a.footer ||
          "🎮 Sistema de Apostas"
      });

  if (a.thumbnail) {
    embed.setThumbnail(
      a.thumbnail
    );
  }

  if (a.banner) {
    embed.setImage(
      a.banner
    );
  }

  return embed;
}

/* =========================================================
   ESTATÍSTICAS
========================================================= */

function getStats(
  guildId,
  userId
) {
  db.stats[guildId] ??= {};

  db.stats[guildId][userId] ??= {
    wins: 0,
    losses: 0,
    woWins: 0
  };

  return db.stats[
    guildId
  ][userId];
}

function addNormalWin(
  guildId,
  winner,
  loser
) {
  const w =
    getStats(
      guildId,
      winner
    );

  const l =
    getStats(
      guildId,
      loser
    );

  w.wins++;
  l.losses++;

  addCoins(
    guildId,
    winner,
    Number(
      db.settings.coins.win || 1
    )
  );

  save();
}

function addWOWin(
  guildId,
  winner
) {
  const w =
    getStats(
      guildId,
      winner
    );

  /*
    W.O.:
    +1 vitória por W.O.
    +0 vitória normal
    +0 coins
    +0 derrota para o perdedor
  */

  w.woWins++;

  save();
}

function addCoins(
  guildId,
  userId,
  amount
) {
  if (!amount) return;

  db.coins[guildId] ??= {};

  db.coins[guildId][userId] =
    (
      db.coins[guildId][userId] ||
      0
    ) + amount;

  save();
}

function statsEmbed(
  user
) {
  const guildId =
    GUILD_ID;

  const s =
    getStats(
      guildId,
      user.id
    );

  const total =
    Number(s.wins) +
    Number(s.losses);

  const rate =
    total > 0
      ? (
          (s.wins / total) *
          100
        ).toFixed(1)
      : "0.0";

  const coins =
    db.coins[guildId]?.[
      user.id
    ] || 0;

  return makeEmbed(
    `📊 PERFIL DE ${user.username}`,

    [
      `🏆 **Vitórias:** ${s.wins}`,
      `❌ **Derrotas:** ${s.losses}`,
      `🚫 **Vitórias por W.O.:** ${s.woWins}`,
      `🪙 **Coins:** ${coins}`,
      "",
      `🎮 **Partidas normais:** ${total}`,
      `📈 **Aproveitamento:** ${rate}%`
    ].join("\n")
  )
  .setThumbnail(
    user.displayAvatarURL({
      size: 256
    })
  );
}

/* =========================================================
   FILAS AUTOMÁTICAS
========================================================= */

function ensureQueues() {
  for (
    const [modality] of MODS
  ) {
    for (
      const [format] of FORMATS
    ) {
      for (
        const value of VALUES
      ) {
        /*
          TODOS os formatos possuem fila normal.
        */

        const normal =
          qkey(
            modality,
            format,
            value,
            "normal"
          );

        db.queues[normal] ??= [];

        /*
          SOMENTE 1x1:
          Gelo Normal
          Gelo Infinito
        */

        if (
          format === "1x1"
        ) {
          const infinite =
            qkey(
              modality,
              format,
              value,
              "infinite"
            );

          db.queues[
            infinite
          ] ??= [];
        }
      }
    }
  }

  save();
}

/* =========================================================
   DESIGN DAS FILAS
========================================================= */

function queueEmbed(
  modality,
  format,
  value,
  ice
) {
  const key =
    qkey(
      modality,
      format,
      value,
      ice
    );

  const players =
    db.queues[key] || [];

  const playerText =
    players.length
      ? players
          .map(
            (id, index) =>
              `${index + 1}. <@${id}>`
          )
          .join("\n")
      : "🟢 Aguardando jogadores...";

  const mode =
    format === "1x1"
      ? ice === "infinite"
        ? "♾️ Gelo Infinito"
        : "🧊 Gelo Normal"
      : "🎮 Normal";

  return makeEmbed(
    `💎 ${money(value)} • ${format}`,

    [
      `🎮 **${fmt(
        MODS,
        modality
      )}**`,
      "",
      `🎯 **Formato:** ${format}`,
      `🎮 **Modo:** ${mode}`,
      `💰 **Entrada:** ${money(
        value
      )}`,
      "",
      "👥 **JOGADORES**",
      playerText,
      "",
      `📊 **Vagas:** ${players.length}/2`,
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "⚡ **ENTRE NA FILA E AGUARDE O ADVERSÁRIO**",
      "━━━━━━━━━━━━━━━━━━━━"
    ].join("\n")
  );
}

function queueButtons(
  modality,
  format,
  value,
  ice
) {
  const key =
    qkey(
      modality,
      format,
      value,
      ice
    );

  const buttons = [];

  if (
    format === "1x1"
  ) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(
          `queuejoin:${key}`
        )
        .setLabel(
          ice === "infinite"
            ? "♾️ Gelo Infinito"
            : "🧊 Gelo Normal"
        )
        .setStyle(
          ButtonStyle.Success
        )
    );
  } else {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(
          `queuejoin:${key}`
        )
        .setLabel(
          "🎮 Entrar na fila"
        )
        .setStyle(
          ButtonStyle.Success
        )
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(
        `queueleave:${key}`
      )
      .setLabel(
        "🚪 Sair da fila"
      )
      .setStyle(
        ButtonStyle.Danger
      )
  );

  return [
    new ActionRowBuilder()
      .addComponents(buttons)
  ];
}

/* =========================================================
   PUBLICAR TODAS AS FILAS
========================================================= */

async function publishAllQueues(
  guild
) {
  ensureQueues();

  for (
    const [modality] of MODS
  ) {
    const categoryKey =
      modality === "mobile"
        ? "queueMobile"
        : modality === "emulador"
        ? "queueEmulator"
        : "queueMixed";

    let category =
      channelId(
        categoryKey
      )
        ? guild.channels.cache.get(
            channelId(
              categoryKey
            )
          )
        : null;

    if (!category) {
      category =
        await guild.channels.create({
          name:
            modality ===
            "mobile"
              ? "📱・MOBILE"
              : modality ===
                "emulador"
              ? "💻・EMULADOR"
              : "🔄・MISTO",

          type:
            ChannelType.GuildCategory
        });

      db.settings.channels[
        categoryKey
      ] = category.id;
    }

    for (
      const [format] of FORMATS
    ) {
      let channel =
        guild.channels.cache.find(
          c =>
            c.type ===
              ChannelType.GuildText &&
            c.parentId ===
              category.id &&
            c.name ===
              `🎮・fila-${format}`
        );

      if (!channel) {
        channel =
          await guild.channels.create({
            name:
              `🎮・fila-${format}`,
            type:
              ChannelType.GuildText,
            parent:
              category.id
          });
      }

      /*
        Uma mensagem por valor.
        Valores em ordem crescente.
        No Discord, os mais baixos ficam em cima
        quando as mensagens são publicadas nessa ordem.
      */

      for (
        const value of VALUES
      ) {
        const modes =
          format === "1x1"
            ? [
                "normal",
                "infinite"
              ]
            : ["normal"];

        for (
          const ice of modes
        ) {
          const embed =
            queueEmbed(
              modality,
              format,
              value,
              ice
            );

          const buttons =
            queueButtons(
              modality,
              format,
              value,
              ice
            );

          /*
            Identificação da mensagem
            para atualizar sem duplicar.
          */

          const messages =
            await channel.messages
              .fetch({
                limit: 100
              })
              .catch(
                () => null
              );

          const marker =
            `FILA:${qkey(
              modality,
              format,
              value,
              ice
            )}`;

          const existing =
            messages?.find(
              msg =>
                msg.author.id ===
                  guild.client.user
                    .id &&
                msg.content ===
                  marker
            );

          if (existing) {
            await existing.edit({
              content:
                marker,
              embeds: [embed],
              components:
                buttons
            });
          } else {
            await channel.send({
              content:
                marker,
              embeds: [embed],
              components:
                buttons
            });
          }
        }
      }
    }
  }

  save();
}

/* =========================================================
   MEDIADORES
========================================================= */

function mediatorEmbed() {
  const available =
    db.mediatorQueue
      .map(
        (id, index) =>
          `${index + 1}. 🟢 <@${id}>`
      )
      .join("\n");

  return makeEmbed(
    "🛡️・FILA DE MEDIADORES",

    [
      "⚔️ **CENTRAL DE MEDIADORES**",
      "",
      available ||
        "😴 Nenhum mediador disponível.",
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "🟢 Entre quando estiver disponível.",
      "🔴 Saia quando estiver ocupado.",
      "━━━━━━━━━━━━━━━━━━━━"
    ].join("\n")
  );
}

function mediatorButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "medq:join"
          )
          .setLabel(
            "🟢 Entrar"
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            "medq:leave"
          )
          .setLabel(
            "🔴 Sair"
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
  let category =
    channelId(
      "mediatorCategory"
    )
      ? guild.channels.cache.get(
          channelId(
            "mediatorCategory"
          )
        )
      : null;

  if (!category) {
    category =
      await guild.channels.create({
        name:
          "🛡️・MEDIADORES",
        type:
          ChannelType.GuildCategory
      });

    db.settings.channels.mediatorCategory =
      category.id;
  }

  let channel =
    channelId(
      "mediatorQueue"
    )
      ? guild.channels.cache.get(
          channelId(
            "mediatorQueue"
          )
        )
      : null;

  if (!channel) {
    channel =
      await guild.channels.create({
        name:
          "🛡️・fila-mediadores",
        type:
          ChannelType.GuildText,
        parent:
          category.id
      });

    db.settings.channels.mediatorQueue =
      channel.id;
  }

  const messages =
    await channel.messages
      .fetch({
        limit: 50
      })
      .catch(
        () => null
      );

  const old =
    messages?.find(
      m =>
        m.author.id ===
          guild.client.user.id &&
        m.embeds[0]?.title ===
          "🛡️・FILA DE MEDIADORES"
    );

  const payload = {
    embeds: [
      mediatorEmbed()
    ],
    components:
      mediatorButtons()
  };

  if (old) {
    await old.edit(
      payload
    );
  } else {
    await channel.send(
      payload
    );
  }

  save();
}

/* =========================================================
   ESTRUTURA AUTOMÁTICA
========================================================= */

const BASE_CHANNELS = {
  ATENDIMENTO: [
    "🎟️・ticket",
    "🛠️・suporte",
    "💰・reembolso",
    "💵・receber-evento",
    "💼・vagas",
    "📢・divulgacao"
  ],

  EVENTOS: [
    "💵・1-vitoria-15-no-px",
    "💲・pagamentos",
    "💵・5-convite-2-no-px",
    "💵・1-vitoria-2-no-px-08h",
    "💵・2-vitoria-3-no-px-12h",
    "💵・2-vitoria-4-no-pix-17h",
    "💵・1-vitoria-3-no-pix-20h",
    "💵・2-vitoria-10-no-px-22h",
    "💵・1-vitoria-1-no-px-infinito",
    "⛔・regras-eventos"
  ],

  COMUNIDADE: [
    "🛒・lojinha",
    "⚡・roleta",
    "📒・regras",
    "📒・regras-x1",
    "📝・vagas",
    "👑・ranking",
    "🏆・ranking-diario",
    "💵・adm-lucrando"
  ],

  ANÁLISES: [
    "🚫・blacklist",
    "🚫・exposed",
    "🔎・regras-analise"
  ],

  CONVITE: [
    "✉️・convites"
  ]
};

async function createStructure(
  guild
) {
  for (
    const [
      categoryName,
      channels
    ] of Object.entries(
      BASE_CHANNELS
    )
  ) {
    let category =
      guild.channels.cache.find(
        c =>
          c.type ===
            ChannelType.GuildCategory &&
          c.name.toLowerCase() ===
            categoryName.toLowerCase()
      );

    if (!category) {
      category =
        await guild.channels.create({
          name:
            categoryName,
          type:
            ChannelType.GuildCategory
        });
    }

    for (
      const channelName of channels
    ) {
      const exists =
        guild.channels.cache.find(
          c =>
            c.type ===
              ChannelType.GuildText &&
            c.parentId ===
              category.id &&
            c.name ===
              channelName
        );

      if (!exists) {
        await guild.channels.create({
          name:
            channelName,
          type:
            ChannelType.GuildText,
          parent:
            category.id
        });
      }
    }
  }

  /*
    Categorias das filas
  */

  const queueCategories = [
    [
      "queueMobile",
      "📱・MOBILE"
    ],
    [
      "queueEmulator",
      "💻・EMULADOR"
    ],
    [
      "queueMixed",
      "🔄・MISTO"
    ]
  ];

  for (
    const [
      key,
      name
    ] of queueCategories
  ) {
    let category =
      guild.channels.cache.find(
        c =>
          c.type ===
            ChannelType.GuildCategory &&
          c.name === name
      );

    if (!category) {
      category =
        await guild.channels.create({
          name,
          type:
            ChannelType.GuildCategory
        });
    }

    db.settings.channels[
      key
    ] = category.id;
  }

  /*
    Apostas privadas
  */

  let privateCategory =
    guild.channels.cache.find(
      c =>
        c.type ===
          ChannelType.GuildCategory &&
        c.name ===
          "🔒・APOSTAS PRIVADAS"
    );

  if (!privateCategory) {
    privateCategory =
      await guild.channels.create({
        name:
          "🔒・APOSTAS PRIVADAS",
        type:
          ChannelType.GuildCategory
      });
  }

  db.settings.channels.privateCategory =
    privateCategory.id;

  /*
    Mediadores
  */

  await publishMediatorQueue(
    guild
  );

  /*
    Canal 1 = SS Mob
    Canal 2 = SS Emu
  */

  let ssmob =
    guild.channels.cache.find(
      c =>
        c.type ===
          ChannelType.GuildText &&
        c.name ===
          "📱・ssmob"
    );

  if (!ssmob) {
    ssmob =
      await guild.channels.create({
        name:
          "📱・ssmob",
        type:
          ChannelType.GuildText
      });
  }

  let ssemu =
    guild.channels.cache.find(
      c =>
        c.type ===
          ChannelType.GuildText &&
        c.name ===
          "💻・ssemu"
    );

  if (!ssemu) {
    ssemu =
      await guild.channels.create({
        name:
          "💻・ssemu",
        type:
          ChannelType.GuildText
      });
  }

  db.settings.channels.ssmob =
    ssmob.id;

  db.settings.channels.ssemu =
    ssemu.id;

  /*
    NÃO criar:
    Full Capa
    regras Full Capa
    encontre-seu-ap
    canal antigo de análise
  */

  save();
}

/* =========================================================
   MEDIADOR DISPONÍVEL
========================================================= */

function availableMediator(
  guild
) {
  const rid =
    roleId("mediator");

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
            "closed"
        )
        .map(
          b =>
            b.mediatorId
        )
    );

  for (
    const id of
      db.mediatorQueue
  ) {
    if (
      role.members.has(id) &&
      !busy.has(id)
    ) {
      return id;
    }
  }

  return null;
}

/* =========================================================
   APOSTA
========================================================= */

function privateOverwrites(
  guild,
  bet
) {
  const allow = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.ReadMessageHistory
  ];

  const overwrites = [
    {
      id:
        guild.roles.everyone.id,

      deny: [
        PermissionsBitField.Flags.ViewChannel
      ]
    }
  ];

  for (
    const id of [
      bet.p1,
      bet.p2,
      bet.mediatorId
    ]
  ) {
    if (id) {
      overwrites.push({
        id,
        allow
      });
    }
  }

  for (
    const key of [
      "admin",
      "subowner",
      "privateAccess"
    ]
  ) {
    const id =
      roleId(key);

    if (id) {
      overwrites.push({
        id,
        allow
      });
    }
  }

  return overwrites;
}

async function createBet(
  guild,
  modality,
  format,
  value,
  ice,
  p1,
  p2
) {
  const mediator =
    availableMediator(
      guild
    );

  if (!mediator) {
    return null;
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

    modality,
    format,
    value,
    ice,

    confirmations: {
      [p1]: false,
      [p2]: false
    },

    status:
      "confirm",

    roomCreated:
      false,

    createdAt:
      Date.now()
  };

  const channel =
    await guild.channels.create({
      name:
        `🎮・aposta-${id}`,

      type:
        ChannelType.GuildText,

      parent:
        db.settings.channels
          .privateCategory,

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
      makeEmbed(
        `🔒・APOSTA #${id}`,

        [
          "⚔️ **NOVA PARTIDA**",
          "",
          `👤 **Jogador 1:** <@${p1}>`,
          `👤 **Jogador 2:** <@${p2}>`,
          `🛡️ **Mediador:** <@${mediator}>`,
          "",
          `💰 **Valor:** ${money(
            value
          )}`,
          `💵 **Total:** ${money(
            value * 2
          )}`,
          "",
          `📱 **Modalidade:** ${fmt(
            MODS,
            modality
          )}`,
          `🎯 **Formato:** ${format}`,
          `🎮 **Modo:** ${
            format === "1x1"
              ? ice === "infinite"
                ? "♾️ Gelo Infinito"
                : "🧊 Gelo Normal"
              : "🎮 Normal"
          }`,
          "",
          "━━━━━━━━━━━━━━━━━━━━",
          "✅ Os dois jogadores devem confirmar.",
          "━━━━━━━━━━━━━━━━━━━━"
        ].join("\n")
      )
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              `betconfirm:${id}`
            )
            .setLabel(
              "✅ Confirmar aposta"
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
   FINALIZAÇÃO DA APOSTA
========================================================= */

async function finishBet(
  interaction,
  bet,
  winnerId,
  type
) {
  if (
    bet.status ===
    "closed"
  ) {
    return interaction.reply({
      content:
        "⚠️ Esta aposta já foi encerrada.",
      ephemeral: true
    });
  }

  const loserId =
    bet.p1 === winnerId
      ? bet.p2
      : bet.p1;

  if (type === "win") {
    addNormalWin(
      bet.guildId,
      winnerId,
      loserId
    );
  }

  if (type === "wo") {
    addWOWin(
      bet.guildId,
      winnerId
    );
  }

  bet.status =
    "closed";

  bet.result =
    type;

  bet.winner =
    winnerId;

  save();

  await interaction.reply({
    embeds: [
      makeEmbed(
        type === "wo"
          ? "🚫・VITÓRIA POR W.O."
          : "🏆・VITÓRIA NORMAL",

        type === "wo"
          ? [
              `🚫 <@${winnerId}> venceu por **W.O.**`,
              "",
              "🚫 **Vitória por W.O.: +1**",
              "🪙 **Coins: +0**",
              "❌ O adversário não recebe derrota."
            ].join("\n")
          : [
              `🏆 <@${winnerId}> venceu a partida!`,
              "",
              "🏆 **Vitória: +1**",
              "🪙 **Coins: +1**",
              "❌ O adversário recebeu +1 derrota."
            ].join("\n")
      )
    ]
  });

  /*
    Exclui o canal em 5 segundos.
  */

  setTimeout(
    async () => {
      const channel =
        interaction.guild.channels.cache.get(
          bet.channelId
        );

      if (channel) {
        await channel
          .delete()
          .catch(
            () => {}
          );
      }
    },
    5000
  );
}

/* =========================================================
   MENU .MED
========================================================= */

function medMenuRows(
  bet
) {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `result:win:${bet.id}:${bet.p1}`
          )
          .setLabel(
            "🏆 Vitória J1"
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            `result:win:${bet.id}:${bet.p2}`
          )
          .setLabel(
            "🏆 Vitória J2"
          )
          .setStyle(
            ButtonStyle.Success
          )
      ),

    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `result:wo:${bet.id}:${bet.p1}`
          )
          .setLabel(
            "🚫 W.O. J1"
          )
          .setStyle(
            ButtonStyle.Danger
          ),

        new ButtonBuilder()
          .setCustomId(
            `result:wo:${bet.id}:${bet.p2}`
          )
          .setLabel(
            "🚫 W.O. J2"
          )
          .setStyle(
            ButtonStyle.Danger
          )
      )
  ];
}

/* =========================================================
   ID + SENHA DA SALA
========================================================= */

function detectRoom(
  text
) {
  let match =
    text.match(
      /id\s*[:\-]?\s*(\d{4,})[\s\S]*?(?:senha|pass|password)\s*[:\-]?\s*([A-Za-z0-9]+)/i
    );

  if (match) {
    return {
      id:
        match[1],
      password:
        match[2]
    };
  }

  match =
    text.match(
      /(?:sala|id)\s*[:\-]?\s*(\d{4,})\s+(?:senha|pass|password)\s*[:\-]?\s*([A-Za-z0-9]+)/i
    );

  if (match) {
    return {
      id:
        match[1],
      password:
        match[2]
    };
  }

  return null;
}

async function sendRoomCreated(
  message,
  bet,
  room
) {
  bet.roomCreated =
    true;

  bet.roomId =
    room.id;

  bet.roomPassword =
    room.password;

  save();

  /*
    Embed branca.
  */

  const embed =
    new EmbedBuilder()
      .setColor(
        "#FFFFFF"
      )
      .setTitle(
        "🤍・SALA CRIADA"
      )
      .setDescription(
        [
          "🤍 **A sala foi criada!**",
          "",
          "⏱️ A partida será iniciada em **3 a 5 minutos**.",
          "",
          "🆔 **ID DA SALA**",
          `\`${room.id}\``,
          "",
          "🔐 **SENHA DA SALA**",
          `\`${room.password}\``
        ].join("\n")
      );

  const row =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `copyid:${room.id}`
          )
          .setLabel(
            "Copiar ID"
          )
          .setEmoji(
            "🆔"
          )
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            `copypass:${room.password}`
          )
          .setLabel(
            "Copiar Senha"
          )
          .setEmoji(
            "🔐"
          )
          .setStyle(
            ButtonStyle.Secondary
          )
      );

  await message.channel.send({
    embeds: [
      embed
    ],
    components: [
      row
    ]
  });

  /*
    O valor do canal passa para o TOTAL da aposta.
    Exemplo:
    R$1,00 + R$1,00 = pagar R$2,00
  */

  const total =
    bet.value * 2;

  const totalName =
    (total / 100)
      .toFixed(2)
      .replace(".", "-");

  await message.channel
    .setName(
      `💰・pagar-${totalName}`
    )
    .catch(
      () => {}
    );
}

/* =========================================================
   ANÁLISES
========================================================= */

async function requestAnalysis(
  message,
  type
) {
  if (
    !isMediator(
      message.member
    )
  ) {
    return message.reply(
      "❌ Somente Mediadores podem solicitar análise."
    );
  }

  const targetKey =
    type === "mob"
      ? "ssmob"
      : "ssemu";

  const channel =
    message.guild.channels.cache.get(
      channelId(
        targetKey
      )
    );

  if (!channel) {
    return message.reply(
      "❌ O canal de análise não foi criado/configurado."
    );
  }

  const requestId =
    `${message.id}`;

  db.analystRequests.push({
    id:
      requestId,

    type,

    guildId:
      message.guild.id,

    requester:
      message.author.id,

    sourceChannel:
      message.channel.id,

    createdAt:
      Date.now(),

    taken:
      false
  });

  save();

  const analystRole =
    roleId(
      "analyst"
    );

  await channel.send({
    content:
      analystRole
        ? `<@&${analystRole}>`
        : "",

    embeds: [
      makeEmbed(
        "📊・ANÁLISE FOI SOLICITADA",

        [
          `👤 **Solicitado por:** ${message.author}`,
          "",
          `📱 **Tipo:** ${
            type === "mob"
              ? "SS Mob"
              : "SS Emu"
          }`,
          "",
          "⏳ Um Analista configurado pode assumir esta análise.",
          "",
          "━━━━━━━━━━━━━━━━━━━━"
        ].join("\n")
      )
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              `analysis:${requestId}`
            )
            .setLabel(
              "📊 Assumir análise"
            )
            .setStyle(
              ButtonStyle.Primary
            )
        )
    ]
  });

  return message.reply(
    `✅ Solicitação de **${
      type === "mob"
        ? "SS Mob"
        : "SS Emu"
    }** enviada.`
  );
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
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages
    ],

    partials: [
      Partials.Channel,
      Partials.Message
    ]
  });

/* =========================================================
   COMANDOS SLASH
========================================================= */

const slashCommands = [
  new SlashCommandBuilder()
    .setName(
      "fila"
    )
    .setDescription(
      "Publica as filas predefinidas."
    )
    .addStringOption(
      option =>
        option
          .setName(
            "modalidade"
          )
          .setDescription(
            "Escolha a modalidade."
          )
          .setRequired(
            true
          )
          .addChoices(
            ...MODS.map(
              ([value, name]) => ({
                name,
                value
              })
            )
          )
    )
    .addStringOption(
      option =>
        option
          .setName(
            "formato"
          )
          .setDescription(
            "Escolha o formato."
          )
          .setRequired(
            true
          )
          .addChoices(
            ...FORMATS.map(
              ([value, name]) => ({
                name,
                value
              })
            )
          )
    ),

  new SlashCommandBuilder()
    .setName(
      "config"
    )
    .setDescription(
      "Abre a configuração."
    ),

  new SlashCommandBuilder()
    .setName(
      "estrutura"
    )
    .setDescription(
      "Cria todos os canais automaticamente."
    ),

  new SlashCommandBuilder()
    .setName(
      "painel"
    )
    .setDescription(
      "Atualiza todas as filas."
    ),

  new SlashCommandBuilder()
    .setName(
      "mediadores"
    )
    .setDescription(
      "Abre a fila de Mediadores."
    ),

  new SlashCommandBuilder()
    .setName(
      "cargos"
    )
    .setDescription(
      "Configura cargos."
    ),

  new SlashCommandBuilder()
    .setName(
      "canais"
    )
    .setDescription(
      "Configura canais."
    ),

  new SlashCommandBuilder()
    .setName(
      "coins"
    )
    .setDescription(
      "Mostra seus Coins."
    ),

  new SlashCommandBuilder()
    .setName(
      "help"
    )
    .setDescription(
      "Mostra os comandos."
    )
].map(
  command =>
    command.toJSON()
);

/* =========================================================
   ONLINE
========================================================= */

client.once(
  "ready",
  async () => {
    console.log(
      `✅ ${client.user.tag} está online.`
    );

    client.user.setPresence({
      activities: [
        {
          name:
            db.settings
              .appearance
              .botStatus ||
            "🎮 Sistema de Apostas"
        }
      ],
      status:
        "online"
    });

    try {
      const rest =
        new REST({
          version:
            "10"
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
            slashCommands
        }
      );

      console.log(
        "✅ Comandos registrados."
      );

      const guild =
        await client.guilds.fetch(
          GUILD_ID
        );

      await guild.channels.fetch();
      await guild.roles.fetch();

      /*
        IMPORTANTE:
        Quando o bot fica online,
        ele cria/verifica tudo automaticamente.
      */

      await createStructure(
        guild
      );

      ensureQueues();

      await publishAllQueues(
        guild
      );

      await publishMediatorQueue(
        guild
      );

      console.log(
        "✅ Canais, categorias e filas criados/verificados automaticamente."
      );
    } catch (error) {
      console.error(
        "❌ Erro no startup:",
        error
      );
    }
  }
);

/* =========================================================
   MEMBRO SAIU
========================================================= */

client.on(
  "guildMemberRemove",
  member => {
    db.mediatorQueue =
      db.mediatorQueue.filter(
        id =>
          id !==
          member.id
      );

    save();
  }
);

/* =========================================================
   MESSAGE CREATE
========================================================= */

client.on(
  "messageCreate",
  async message => {
    try {
      if (
        message.author.bot ||
        !message.guild
      ) {
        return;
      }

      const text =
        message.content.trim();

      const lower =
        text.toLowerCase();

      /* =========================================
         .P
      ========================================= */

      if (
        lower ===
        ".p"
      ) {
        return message.reply({
          embeds: [
            statsEmbed(
              message.author
            )
          ]
        });
      }

      /* =========================================
         .SSMOB
      ========================================= */

      if (
        lower ===
        ".ssmob"
      ) {
        return requestAnalysis(
          message,
          "mob"
        );
      }

      /* =========================================
         .SSEMU
      ========================================= */

      if (
        lower ===
        ".ssemu"
      ) {
        return requestAnalysis(
          message,
          "emu"
        );
      }

      /* =========================================
         .MED
      ========================================= */

      if (
        lower ===
        ".med"
      ) {
        const bet =
          Object.values(
            db.bets
          ).find(
            b =>
              b.channelId ===
                message.channel.id &&
              b.status !==
                "closed"
          );

        /*
          .med dentro de aposta:
          somente Mediador responsável.
        */

        if (bet) {
          if (
            message.author.id !==
            bet.mediatorId
          ) {
            return message.reply(
              "❌ Somente o Mediador responsável por esta aposta pode usar `.med`."
            );
          }

          return message.reply({
            embeds: [
              makeEmbed(
                `🛡️・CONTROLE DA APOSTA #${bet.id}`,

                [
                  `👤 <@${bet.p1}>`,
                  "⚔️",
                  `👤 <@${bet.p2}>`,
                  "",
                  `💰 **Aposta:** ${money(
                    bet.value
                  )}`,
                  "",
                  "🏆 Escolha o vencedor.",
                  "",
                  "🏆 Vitória normal → +1 vitória +1 coin",
                  "🚫 W.O. → +1 vitória por W.O. +0 coins"
                ].join("\n")
              )
            ],

            components:
              medMenuRows(
                bet
              )
          });
        }

        /*
          .med fora de aposta:
          mostra a fila/menu de Mediadores.
        */

        if (
          !isMediator(
            message.member
          )
        ) {
          return message.reply(
            "❌ Você não possui o cargo Mediador."
          );
        }

        return message.reply({
          embeds: [
            mediatorEmbed()
          ],
          components:
            mediatorButtons()
        });
      }

      /* =========================================
         ID + SENHA
      ========================================= */

      const bet =
        Object.values(
          db.bets
        ).find(
          b =>
            b.channelId ===
              message.channel.id &&
            b.status !==
              "closed"
        );

      if (
        bet &&
        message.author.id ===
          bet.mediatorId &&
        !bet.roomCreated
      ) {
        const room =
          detectRoom(
            text
          );

        if (room) {
          await sendRoomCreated(
            message,
            bet,
            room
          );
        }
      }
    } catch (error) {
      console.error(
        "❌ messageCreate:",
        error
      );
    }
  }
);

/* =========================================================
   INTERACTIONS
========================================================= */

client.on(
  "interactionCreate",
  async interaction => {
    try {
      /* =========================================
         SLASH
      ========================================= */

      if (
        interaction.isChatInputCommand()
      ) {
        const command =
          interaction.commandName;

        if (
          command ===
          "help"
        ) {
          return interaction.reply({
            content:
              [
                "🎮 **COMANDOS**",
                "",
                "`.med` → Menu de Mediador",
                "`.p` → Estatísticas",
                "`.ssmob` → Solicitar SS Mob",
                "`.ssemu` → Solicitar SS Emu",
                "",
                "`/fila` → Publicar filas",
                "`/config` → Configuração",
                "`/estrutura` → Criar estrutura",
                "`/painel` → Atualizar filas",
                "`/mediadores` → Fila de Mediadores",
                "`/cargos` → Configurar cargos",
                "`/canais` → Configurar canais",
                "`/coins` → Coins"
              ].join(
                "\n"
              ),
            ephemeral:
              true
          });
        }

        if (
          command ===
          "coins"
        ) {
          const coins =
            db.coins[
              interaction.guild.id
            ]?.[
              interaction.user.id
            ] || 0;

          return interaction.reply({
            content:
              `🪙 Você possui **${coins} Coins**.`,
            ephemeral:
              true
          });
        }

        if (
          command ===
          "mediadores"
        ) {
          return interaction.reply({
            embeds: [
              mediatorEmbed()
            ],
            components:
              mediatorButtons()
          });
        }

        if (
          command ===
          "estrutura"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores.",
              ephemeral:
                true
            });
          }

          await createStructure(
            interaction.guild
          );

          return interaction.reply({
            content:
              "✅ Toda a estrutura foi criada/verificada automaticamente.",
            ephemeral:
              true
          });
        }

        if (
          command ===
          "painel"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores.",
              ephemeral:
                true
            });
          }

          await publishAllQueues(
            interaction.guild
          );

          return interaction.reply({
            content:
              "✅ Todas as filas foram atualizadas.",
            ephemeral:
              true
          });
        }

        if (
          command ===
          "fila"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores.",
              ephemeral:
                true
            });
          }

          /*
            O administrador escolhe SOMENTE:
            modalidade + formato.

            Os valores são automáticos.
          */

          await publishAllQueues(
            interaction.guild
          );

          return interaction.reply({
            content:
              "✅ Fila publicada com todos os valores predefinidos.",
            ephemeral:
              true
          });
        }

        if (
          command ===
          "config"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores.",
              ephemeral:
                true
            });
          }

          return interaction.reply({
            embeds: [
              makeEmbed(
                "⚙️・CONFIGURAÇÃO",

                [
                  "🎨 **Aparência**",
                  `Cor: \`${db.settings.appearance.color}\``,
                  "",
                  "👥 **Cargos**",
                  `🛡️ Mediador: ${
                    roleId(
                      "mediator"
                    )
                      ? `<@&${roleId(
                          "mediator"
                        )}>`
                      : "❌"
                  }`,
                  `📊 Analista: ${
                    roleId(
                      "analyst"
                    )
                      ? `<@&${roleId(
                          "analyst"
                        )}>`
                      : "❌"
                  }`,
                  "",
                  "📊 **Análises**",
                  `📱 SS Mob: ${
                    channelId(
                      "ssmob"
                    )
                      ? `<#${channelId(
                          "ssmob"
                        )}>`
                      : "❌"
                  }`,
                  `💻 SS Emu: ${
                    channelId(
                      "ssemu"
                    )
                      ? `<#${channelId(
                          "ssemu"
                        )}>`
                      : "❌"
                  }`
                ].join("\n")
              )
            ],

            components: [
              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setCustomId(
                      "cfg_roles"
                    )
                    .setLabel(
                      "👥 Cargos"
                    )
                    .setStyle(
                      ButtonStyle.Primary
                    ),

                  new ButtonBuilder()
                    .setCustomId(
                      "cfg_channels"
                    )
                    .setLabel(
                      "📁 Canais"
                    )
                    .setStyle(
                      ButtonStyle.Primary
                    ),

                  new ButtonBuilder()
                    .setCustomId(
                      "cfg_appearance"
                    )
                    .setLabel(
                      "🎨 Cor / Aparência"
                    )
                    .setStyle(
                      ButtonStyle.Secondary
                    )
                ),

              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setCustomId(
                      "cfg_structure"
                    )
                    .setLabel(
                      "🏗️ Criar estrutura"
                    )
                    .setStyle(
                      ButtonStyle.Success
                    ),

                  new ButtonBuilder()
                    .setCustomId(
                      "cfg_publish"
                    )
                    .setLabel(
                      "🎮 Atualizar filas"
                    )
                    .setStyle(
                      ButtonStyle.Success
                    )
                )
            ],

            ephemeral:
              true
          });
        }

        if (
          command ===
          "cargos"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores.",
              ephemeral:
                true
            });
          }

          return interaction.reply({
            content:
              "👥 Selecione o cargo que deseja configurar.",
            components: [
              new ActionRowBuilder()
                .addComponents(
                  new StringSelectMenuBuilder()
                    .setCustomId(
                      "role:key"
                    )
                    .setPlaceholder(
                      "👥 Escolha o cargo/função"
                    )
                    .addOptions(
                      [
                        [
                          "mediator",
                          "🛡️ Mediador"
                        ],
                        [
                          "analyst",
                          "📊 Analista"
                        ],
                        [
                          "admin",
                          "👑 Administrador"
                        ],
                        [
                          "subowner",
                          "🔑 Sub-Dono"
                        ]
                      ].map(
                        ([value, label]) => ({
                          label:
                            label.slice(
                              2
                            ),
                          value,
                          emoji:
                            label.slice(
                              0,
                              2
                            )
                        })
                      )
                    )
                )
            ],
            ephemeral:
              true
          });
        }

        if (
          command ===
          "canais"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores.",
              ephemeral:
                true
            });
          }

          return interaction.reply({
            content:
              "📁 A estrutura já é criada automaticamente quando o bot entra online.",
            ephemeral:
              true
          });
        }
      }

      /* =========================================
         SELECT ROLE
      ========================================= */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "role:key"
      ) {
        const key =
          interaction.values[0];

        return interaction.update({
          content:
            "👥 Agora selecione o cargo do servidor:",
          components: [
            new ActionRowBuilder()
              .addComponents(
                new RoleSelectMenuBuilder()
                  .setCustomId(
                    `role:value:${key}`
                  )
                  .setPlaceholder(
                    "Selecione o cargo"
                  )
              )
          ]
        });
      }

      /* =========================================
         ROLE SELECT
      ========================================= */

      if (
        interaction.isRoleSelectMenu()
      ) {
        if (
          !isAdmin(
            interaction.member
          )
        ) {
          return interaction.reply({
            content:
              "❌ Apenas administradores.",
            ephemeral:
              true
          });
        }

        const parts =
          interaction.customId.split(
            ":"
          );

        const key =
          parts[2];

        db.settings.roles[
          key
        ] =
          interaction.values[0];

        save();

        return interaction.update({
          content:
            `✅ Cargo configurado: <@&${interaction.values[0]}>`,
          components: []
        });
      }

      /* =========================================
         BOTÕES
      ========================================= */

      if (
        interaction.isButton()
      ) {
        const [
          action,
          ...args
        ] =
          interaction.customId.split(
            ":"
          );

        /* -----------------------------------------
           MEDIADOR ENTRAR
        ----------------------------------------- */

        if (
          action ===
          "medq"
        ) {
          if (
            !isMediator(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Você não possui o cargo Mediador configurado.",
              ephemeral:
                true
            });
          }

          if (
            args[0] ===
              "join" &&
            !db.mediatorQueue.includes(
              interaction.user.id
            )
          ) {
            db.mediatorQueue.push(
              interaction.user.id
            );
          }

          if (
            args[0] ===
            "leave"
          ) {
            db.mediatorQueue =
              db.mediatorQueue.filter(
                id =>
                  id !==
                  interaction.user.id
              );
          }

          save();

          await publishMediatorQueue(
            interaction.guild
          );

          return interaction.reply({
            content:
              args[0] ===
              "join"
                ? "🟢 Você entrou na fila de Mediadores."
                : "🔴 Você saiu da fila de Mediadores.",
            ephemeral:
              true
          });
        }

        /* -----------------------------------------
           ENTRAR FILA
        ----------------------------------------- */

        if (
          action ===
          "queuejoin"
        ) {
          const key =
            args.join(
              ":"
            );

          /*
            key usa |, então args continua
            funcionando.
          */

          const [
            modality,
            format,
            valueString,
            ice
          ] =
            key.split(
              "|"
            );

          const value =
            Number(
              valueString
            );

          db.queues[key] ??= [];

          if (
            db.queues[key].includes(
              interaction.user.id
            )
          ) {
            return interaction.reply({
              content:
                "⚠️ Você já está nesta fila.",
              ephemeral:
                true
            });
          }

          if (
            db.queues[key].length >=
            2
          ) {
            return interaction.reply({
              content:
                "❌ Esta fila já está cheia.",
              ephemeral:
                true
            });
          }

          /*
            Remove o jogador das outras filas.
          */

          for (
            const queueKey of Object.keys(
              db.queues
            )
          ) {
            db.queues[
              queueKey
            ] =
              db.queues[
                queueKey
              ].filter(
                id =>
                  id !==
                  interaction.user.id
              );
          }

          db.queues[key].push(
            interaction.user.id
          );

          save();

          /*
            Atualiza as mensagens.
          */

          await publishAllQueues(
            interaction.guild
          );

          /*
            EXATAMENTE 2 jogadores.
          */

          if (
            db.queues[key]
              .length ===
            2
          ) {
            const [
              p1,
              p2
            ] =
              db.queues[key];

            const bet =
              await createBet(
                interaction.guild,
                modality,
                format,
                value,
                ice,
                p1,
                p2
              );

            if (bet) {
              db.queues[key] =
                [];

              save();

              await publishAllQueues(
                interaction.guild
              );
            }
          }

          return interaction.reply({
            content:
              `✅ Você entrou na fila de **${money(
                value
              )}**.`,
            ephemeral:
              true
          });
        }

        /* -----------------------------------------
           SAIR FILA
        ----------------------------------------- */

        if (
          action ===
          "queueleave"
        ) {
          const key =
            args.join(
              ":"
            );

          db.queues[key] ??= [];

          db.queues[key] =
            db.queues[
              key
            ].filter(
              id =>
                id !==
                interaction.user.id
            );

          save();

          await publishAllQueues(
            interaction.guild
          );

          return interaction.reply({
            content:
              "🚪 Você saiu da fila.",
            ephemeral:
              true
          });
        }

        /* -----------------------------------------
           CONFIRMAR APOSTA
        ----------------------------------------- */

        if (
          action ===
          "betconfirm"
        ) {
          const bet =
            db.bets[
              args[0]
            ];

          if (
            !bet ||
            ![
              bet.p1,
              bet.p2
            ].includes(
              interaction.user.id
            )
          ) {
            return interaction.reply({
              content:
                "❌ Você não participa desta aposta.",
              ephemeral:
                true
            });
          }

          bet.confirmations[
            interaction.user.id
          ] = true;

          save();

          const count =
            Object.values(
              bet.confirmations
            ).filter(
              Boolean
            ).length;

          if (
            count < 2
          ) {
            return interaction.reply({
              content:
                `✅ Confirmação registrada. **${count}/2** jogadores confirmaram.`,
              ephemeral:
                true
            });
          }

          bet.status =
            "playing";

          save();

          return interaction.reply({
            content:
              "✅ Os dois jogadores confirmaram. O Mediador já pode iniciar a partida.",
            ephemeral:
              true
          });
        }

        /* -----------------------------------------
           RESULTADO
        ----------------------------------------- */

        if (
          action ===
          "result"
        ) {
          const [
            type,
            betId,
            winner
          ] =
            args;

          const bet =
            db.bets[
              betId
            ];

          if (!bet) {
            return interaction.reply({
              content:
                "❌ Aposta não encontrada.",
              ephemeral:
                true
            });
          }

          if (
            interaction.user.id !==
            bet.mediatorId
          ) {
            return interaction.reply({
              content:
                "❌ Somente o Mediador responsável pode usar este menu.",
              ephemeral:
                true
            });
          }

          return finishBet(
            interaction,
            bet,
            winner,
            type
          );
        }

        /* -----------------------------------------
           COPIAR ID
        ----------------------------------------- */

        if (
          action ===
          "copyid"
        ) {
          return interaction.reply({
            content:
              `🆔 ID da sala: \`${args.join(
                ":"
              )}\``,
            ephemeral:
              true
          });
        }

        /* -----------------------------------------
           COPIAR SENHA
        ----------------------------------------- */

        if (
          action ===
          "copypass"
        ) {
          return interaction.reply({
            content:
              `🔐 Senha da sala: \`${args.join(
                ":"
              )}\``,
            ephemeral:
              true
          });
        }

        /* -----------------------------------------
           ASSUMIR ANÁLISE
        ----------------------------------------- */

        if (
          action ===
          "analysis"
        ) {
          if (
            !isAnalyst(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas o cargo Analista pode assumir uma análise.",
              ephemeral:
                true
            });
          }

          const request =
            db.analystRequests.find(
              r =>
                r.id ===
                args[0]
            );

          if (!request) {
            return interaction.reply({
              content:
                "❌ Solicitação não encontrada.",
              ephemeral:
                true
            });
          }

          if (
            request.taken
          ) {
            return interaction.reply({
              content:
                "⚠️ Esta análise já foi assumida.",
              ephemeral:
                true
            });
          }

          request.taken =
            true;

          request.analyst =
            interaction.user.id;

          save();

          /*
            Direciona para canal privado
            da aposta/origem.
          */

          const source =
            interaction.guild.channels.cache.get(
              request.sourceChannel
            );

          let privateChannel =
            source;

          const bet =
            db.bets[
              request.betId
            ];

          if (
            bet &&
            bet.channelId
          ) {
            privateChannel =
              interaction.guild.channels.cache.get(
                bet.channelId
              );
          }

          if (
            privateChannel
          ) {
            await privateChannel
              .send(
                `📊 **Análise assumida por ${interaction.user}.**`
              )
              .catch(
                () => {}
              );
          }

          return interaction.reply({
            content:
              privateChannel
                ? `✅ Análise assumida. Você foi direcionado para ${privateChannel}.`
                : "✅ Análise assumida.",
            ephemeral:
              true
          });
        }

        /* -----------------------------------------
           CONFIG ESTRUTURA
        ----------------------------------------- */

        if (
          action ===
          "cfg_structure"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores.",
              ephemeral:
                true
            });
          }

          await createStructure(
            interaction.guild
          );

          await publishAllQueues(
            interaction.guild
          );

          return interaction.reply({
            content:
              "✅ Estrutura e filas atualizadas.",
            ephemeral:
              true
          });
        }

        /* -----------------------------------------
           CONFIG PUBLICAR
        ----------------------------------------- */

        if (
          action ===
          "cfg_publish"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores.",
              ephemeral:
                true
            });
          }

          await publishAllQueues(
            interaction.guild
          );

          return interaction.reply({
            content:
              "✅ Filas atualizadas.",
            ephemeral:
              true
          });
        }

        /* -----------------------------------------
           CONFIG APARÊNCIA
        ----------------------------------------- */

        if (
          action ===
          "cfg_appearance"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores.",
              ephemeral:
                true
            });
          }

          const modal =
            new ModalBuilder()
              .setCustomId(
                "modal:appearance"
              )
              .setTitle(
                "🎨 Aparência"
              );

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId(
                    "color"
                  )
                  .setLabel(
                    "Cor da Embed HEX"
                  )
                  .setPlaceholder(
                    "#5865F2"
                  )
                  .setRequired(
                    false
                  )
                  .setStyle(
                    TextInputStyle.Short
                  )
              ),

            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId(
                    "title"
                  )
                  .setLabel(
                    "Título"
                  )
                  .setRequired(
                    false
                  )
                  .setStyle(
                    TextInputStyle.Short
                  )
              ),

            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId(
                    "description"
                  )
                  .setLabel(
                    "Descrição"
                  )
                  .setRequired(
                    false
                  )
                  .setStyle(
                    TextInputStyle.Paragraph
                  )
              ),

            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId(
                    "footer"
                  )
                  .setLabel(
                    "Rodapé"
                  )
                  .setRequired(
                    false
                  )
                  .setStyle(
                    TextInputStyle.Short
                  )
              ),

            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId(
                    "avatar"
                  )
                  .setLabel(
                    "URL da foto do bot"
                  )
                  .setPlaceholder(
                    "https://..."
                  )
                  .setRequired(
                    false
                  )
                  .setStyle(
                    TextInputStyle.Short
                  )
              )
          );

          return interaction.showModal(
            modal
          );
        }
      }

      /* =========================================
         MODAL
      ========================================= */

      if (
        interaction.isModalSubmit()
      ) {
        if (
          !isAdmin(
            interaction.member
          )
        ) {
          return interaction.reply({
            content:
              "❌ Apenas administradores.",
            ephemeral:
              true
          });
        }

        if (
          interaction.customId ===
          "modal:appearance"
        ) {
          const get =
            id =>
              interaction.fields
                .getTextInputValue(
                  id
                )
                .trim();

          const color =
            get("color");

          if (
            color &&
            !/^#[0-9A-F]{6}$/i.test(
              color
            )
          ) {
            return interaction.reply({
              content:
                "❌ Cor inválida. Use o formato `#5865F2`.",
              ephemeral:
                true
            });
          }

          if (color) {
            db.settings.appearance.color =
              color;
          }

          const title =
            get("title");

          const description =
            get(
              "description"
            );

          const footer =
            get("footer");

          const avatar =
            get("avatar");

          if (title) {
            db.settings.appearance.title =
              title;
          }

          if (description) {
            db.settings.appearance.description =
              description;
          }

          if (footer) {
            db.settings.appearance.footer =
              footer;
          }

          if (avatar) {
            db.settings.appearance.botAvatar =
              avatar;

            await client.user
              .setAvatar(
                avatar
              )
              .catch(
                () => {}
              );
          }

          save();

          return interaction.reply({
            content:
              "✅ Aparência, cor da Embed e configurações do bot atualizadas.",
            ephemeral:
              true
          });
        }
      }
    } catch (error) {
      console.error(
        "❌ interactionCreate:",
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction.reply({
          content:
            "❌ Ocorreu um erro. Confira o terminal.",
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
