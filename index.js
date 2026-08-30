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
  StringSelectMenuOptionBuilder,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const fs = require("fs");
const path = require("path");

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID no .env");
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, "data");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_CONFIG = {
  color: "#5865F2",
  botAvatar: null,

  roles: {
    mediator: null,
    analyst: null
  },

  channels: {
    mobile: null,
    emulator: null,
    mixed: null,
    mediators: null,
    ssmob: null,
    ssemu: null,
    privateCategory: null,
    rules: null
  },

  queues: {},

  mediatorQueue: [],

  stats: {},

  bets: {},

  nextBet: 1
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify(DEFAULT_CONFIG, null, 2)
    );

    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  try {
    const data = JSON.parse(
      fs.readFileSync(CONFIG_FILE, "utf8")
    );

    return {
      ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
      ...data,

      roles: {
        ...DEFAULT_CONFIG.roles,
        ...(data.roles || {})
      },

      channels: {
        ...DEFAULT_CONFIG.channels,
        ...(data.channels || {})
      }
    };
  } catch (error) {
    console.error("❌ Erro ao carregar configuração:", error);

    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

let config = loadConfig();

function saveConfig() {
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify(config, null, 2)
  );
}

/* =========================================================
   VALORES DAS FILAS
========================================================= */

const VALUES = [
  100,
  200,
  300,
  500,
  700,
  1000,
  2000,
  3000,
  5000,
  10000,
  20000,
  50000
];

const MODALITIES = [
  {
    id: "mobile",
    label: "📱 Mobile"
  },
  {
    id: "emulator",
    label: "💻 Emulador"
  },
  {
    id: "mixed",
    label: "🔄 Misto"
  }
];

const FORMATS = [
  "1x1",
  "2x2",
  "3x3",
  "4x4"
];

/* =========================================================
   FUNÇÕES AUXILIARES
========================================================= */

function money(value) {
  return `R$ ${(value / 100)
    .toFixed(2)
    .replace(".", ",")}`;
}

function getColor() {
  if (
    typeof config.color === "string" &&
    /^#[0-9A-F]{6}$/i.test(config.color)
  ) {
    return config.color;
  }

  return "#5865F2";
}

function createEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(getColor())
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: "🎮 Sistema de Apostas"
    });
}

function getModalityLabel(id) {
  const found = MODALITIES.find(
    modality => modality.id === id
  );

  return found ? found.label : id;
}

function queueKey(modality, format, value, mode) {
  return `${modality}:${format}:${value}:${mode}`;
}

function getStats(userId) {
  if (!config.stats[userId]) {
    config.stats[userId] = {
      wins: 0,
      losses: 0,
      woWins: 0,
      coins: 0
    };
  }

  return config.stats[userId];
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

  if (
    config.roles.mediator &&
    member.roles.cache.has(config.roles.mediator)
  ) {
    return true;
  }

  return false;
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

  if (
    config.roles.analyst &&
    member.roles.cache.has(config.roles.analyst)
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   CRIAÇÃO AUTOMÁTICA DA ESTRUTURA
========================================================= */

async function getOrCreateCategory(guild, name) {
  let category = guild.channels.cache.find(
    channel =>
      channel.type === ChannelType.GuildCategory &&
      channel.name === name
  );

  if (!category) {
    category = await guild.channels.create({
      name,
      type: ChannelType.GuildCategory
    });
  }

  return category;
}

async function getOrCreateTextChannel(
  guild,
  name,
  category
) {
  let channel = guild.channels.cache.find(
    channel =>
      channel.type === ChannelType.GuildText &&
      channel.name === name &&
      channel.parentId === category.id
  );

  if (!channel) {
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: category.id
    });
  }

  return channel;
}

async function createServerStructure(guild) {
  console.log("🏗️ Criando/verificando estrutura do servidor...");

  const filasCategory =
    await getOrCreateCategory(
      guild,
      "🎮・FILAS"
    );

  const equipeCategory =
    await getOrCreateCategory(
      guild,
      "🛡️・EQUIPE"
    );

  const analisesCategory =
    await getOrCreateCategory(
      guild,
      "📊・ANÁLISES"
    );

  const privateCategory =
    await getOrCreateCategory(
      guild,
      "🔒・APOSTAS PRIVADAS"
    );

  const mobile =
    await getOrCreateTextChannel(
      guild,
      "📱・fila-mobile",
      filasCategory
    );

  const emulator =
    await getOrCreateTextChannel(
      guild,
      "💻・fila-emulador",
      filasCategory
    );

  const mixed =
    await getOrCreateTextChannel(
      guild,
      "🔄・fila-misto",
      filasCategory
    );

  const mediators =
    await getOrCreateTextChannel(
      guild,
      "🛡️・fila-mediadores",
      equipeCategory
    );

  const ssmob =
    await getOrCreateTextChannel(
      guild,
      "📱・ssmob",
      analisesCategory
    );

  const ssemu =
    await getOrCreateTextChannel(
      guild,
      "💻・ssemu",
      analisesCategory
    );

  config.channels.mobile = mobile.id;
  config.channels.emulator = emulator.id;
  config.channels.mixed = mixed.id;
  config.channels.mediators = mediators.id;
  config.channels.ssmob = ssmob.id;
  config.channels.ssemu = ssemu.id;
  config.channels.privateCategory =
    privateCategory.id;

  saveConfig();

  console.log("✅ Estrutura verificada/criada.");
}

/* =========================================================
   FILAS
========================================================= */

function createQueueEmbed(modality, format) {
  let lines = [];

  for (const value of VALUES) {
    const normalKey = queueKey(
      modality,
      format,
      value,
      "normal"
    );

    const normal =
      config.queues[normalKey]?.length || 0;

    if (format === "1x1") {
      const infiniteKey = queueKey(
        modality,
        format,
        value,
        "infinite"
      );

      const infinite =
        config.queues[infiniteKey]?.length || 0;

      lines.push(
        `💰 **${money(value)}**  •  🧊 ${normal}/2  •  ♾️ ${infinite}/2`
      );
    } else {
      lines.push(
        `💰 **${money(value)}**  •  👥 ${normal}/2`
      );
    }
  }

  return createEmbed(
    `🎮 ${getModalityLabel(modality)} • ${format}`,
    [
      "✨ **ESCOLHA SUA FILA**",
      "",
      lines.join("\n"),
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "👥 Cada fila possui exatamente **2 vagas**.",
      "💰 Os valores são predefinidos.",
      "📈 Os valores aparecem em ordem crescente.",
      "━━━━━━━━━━━━━━━━━━━━"
    ].join("\n")
  );
}

function createQueueComponents(
  modality,
  format
) {
  const valueSelect =
    new StringSelectMenuBuilder()
      .setCustomId(
        `queue_value:${modality}:${format}`
      )
      .setPlaceholder(
        "💰 Escolha o valor da aposta"
      )
      .addOptions(
        VALUES.map(value =>
          new StringSelectMenuOptionBuilder()
            .setLabel(money(value))
            .setDescription(
              `Entrar na fila de ${money(value)}`
            )
            .setValue(String(value))
            .setEmoji("💰")
        )
      );

  const buttons = [];

  if (format === "1x1") {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(
          `queue_join:${modality}:${format}:normal`
        )
        .setLabel("Gelo Normal")
        .setEmoji("🧊")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          `queue_join:${modality}:${format}:infinite`
        )
        .setLabel("Gelo Infinito")
        .setEmoji("♾️")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(
          `queue_leave:${modality}:${format}`
        )
        .setLabel("Sair da Fila")
        .setEmoji("🚪")
        .setStyle(ButtonStyle.Danger)
    );
  } else {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(
          `queue_join:${modality}:${format}:normal`
        )
        .setLabel("Entrar na Fila")
        .setEmoji("🎮")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(
          `queue_leave:${modality}:${format}`
        )
        .setLabel("Sair da Fila")
        .setEmoji("🚪")
        .setStyle(ButtonStyle.Danger)
    );
  }

  return [
    new ActionRowBuilder().addComponents(
      valueSelect
    ),

    new ActionRowBuilder().addComponents(
      buttons
    )
  ];
}

async function publishQueue(
  guild,
  modality,
  format
) {
  const channelId =
    config.channels[modality];

  const channel =
    guild.channels.cache.get(channelId);

  if (!channel) return;

  const title =
    `🎮 ${getModalityLabel(modality)} • ${format}`;

  const messages =
    await channel.messages
      .fetch({ limit: 50 })
      .catch(() => null);

  const oldMessage =
    messages?.find(
      message =>
        message.author.id === client.user.id &&
        message.embeds[0]?.title === title
    );

  const payload = {
    embeds: [
      createQueueEmbed(
        modality,
        format
      )
    ],
    components:
      createQueueComponents(
        modality,
        format
      )
  };

  if (oldMessage) {
    await oldMessage.edit(payload);
  } else {
    await channel.send(payload);
  }
}

async function initializeQueues(guild) {
  for (const modality of MODALITIES) {
    for (const format of FORMATS) {
      for (const value of VALUES) {
        const normalKey =
          queueKey(
            modality.id,
            format,
            value,
            "normal"
          );

        if (!config.queues[normalKey]) {
          config.queues[normalKey] = [];
        }

        if (format === "1x1") {
          const infiniteKey =
            queueKey(
              modality.id,
              format,
              value,
              "infinite"
            );

          if (!config.queues[infiniteKey]) {
            config.queues[infiniteKey] = [];
          }
        }
      }

      await publishQueue(
        guild,
        modality.id,
        format
      );
    }
  }

  saveConfig();
}

/* =========================================================
   FILA DE MEDIADORES
========================================================= */

function createMediatorEmbed() {
  if (!config.mediatorQueue) {
    config.mediatorQueue = [];
  }

  let description =
    "🛡️ **FILA DE MEDIADORES**\n\n";

  if (config.mediatorQueue.length === 0) {
    description +=
      "😴 Nenhum mediador disponível no momento.";
  } else {
    description +=
      `👥 **Mediadores disponíveis:** ${config.mediatorQueue.length}\n\n`;

    config.mediatorQueue.forEach(
      (userId, index) => {
        description +=
          `${index + 1}. 🟢 <@${userId}>\n`;
      }
    );
  }

  description +=
    "\n\n━━━━━━━━━━━━━━━━━━━━\n";
  description +=
    "🟢 Entre quando estiver disponível.\n";
  description +=
    "🔴 Saia quando estiver ocupado.\n";
  description +=
    "━━━━━━━━━━━━━━━━━━━━";

  return createEmbed(
    "🛡️・MEDIADORES",
    description
  );
}

async function publishMediatorQueue(
  guild
) {
  const channel =
    guild.channels.cache.get(
      config.channels.mediators
    );

  if (!channel) return;

  const messages =
    await channel.messages
      .fetch({ limit: 20 })
      .catch(() => null);

  const oldMessage =
    messages?.find(
      message =>
        message.author.id === client.user.id &&
        message.embeds[0]?.title ===
          "🛡️・MEDIADORES"
    );

  const row =
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mediator_join")
        .setLabel("Entrar")
        .setEmoji("🟢")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("mediator_leave")
        .setLabel("Sair")
        .setEmoji("🔴")
        .setStyle(ButtonStyle.Danger)
    );

  const payload = {
    embeds: [
      createMediatorEmbed()
    ],
    components: [row]
  };

  if (oldMessage) {
    await oldMessage.edit(payload);
  } else {
    await channel.send(payload);
  }
}

/* =========================================================
   REMOVER USUÁRIO DE TODAS AS FILAS
========================================================= */

function removeFromAllQueues(userId) {
  for (
    const key of Object.keys(
      config.queues
    )
  ) {
    config.queues[key] =
      (config.queues[key] || [])
        .filter(
          id => id !== userId
        );
  }
}

/* =========================================================
   CRIAÇÃO DA APOSTA
========================================================= */

async function createBet(
  guild,
  modality,
  format,
  value,
  mode,
  player1,
  player2
) {
  const availableMediator =
    config.mediatorQueue.find(
      mediatorId => {
        const member =
          guild.members.cache.get(
            mediatorId
          );

        if (!member) return false;

        if (!isMediator(member)) {
          return false;
        }

        return !Object.values(
          config.bets
        ).some(
          bet =>
            bet.mediatorId ===
              mediatorId &&
            bet.status === "open"
        );
      }
    );

  if (!availableMediator) {
    return null;
  }

  const betId =
    String(config.nextBet++);

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionsBitField.Flags.ViewChannel
      ]
    },

    {
      id: player1,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    },

    {
      id: player2,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    },

    {
      id: availableMediator,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    }
  ];

  const channel =
    await guild.channels.create({
      name: `💰・aposta-${betId}`,
      type: ChannelType.GuildText,
      parent:
        config.channels.privateCategory,
      permissionOverwrites
    });

  config.bets[betId] = {
    id: betId,
    channelId: channel.id,
    players: [
      player1,
      player2
    ],
    mediatorId:
      availableMediator,
    modality,
    format,
    value,
    mode,
    status: "open",
    roomCreated: false
  };

  saveConfig();

  const total =
    value * 2;

  await channel.send({
    content:
      `<@${player1}> <@${player2}> <@${availableMediator}>`,

    embeds: [
      createEmbed(
        `🔒・APOSTA #${betId}`,
        [
          "🎮 **NOVA PARTIDA**",
          "",
          `👤 **Jogador 1:** <@${player1}>`,
          `👤 **Jogador 2:** <@${player2}>`,
          `🛡️ **Mediador:** <@${availableMediator}>`,
          "",
          `💰 **Aposta por jogador:** ${money(value)}`,
          `💵 **Valor total:** ${money(total)}`,
          "",
          `📱 **Modalidade:** ${getModalityLabel(modality)}`,
          `🎯 **Formato:** ${format}`,
          `🎮 **Modo:** ${
            mode === "infinite"
              ? "♾️ Gelo Infinito"
              : "🧊 Gelo Normal"
          }`,
          "",
          "🛡️ Aguardando o mediador iniciar a partida."
        ].join("\n")
      )
    ]
  });

  return config.bets[betId];
}

/* =========================================================
   DETECTAR ID E SENHA DA SALA
========================================================= */

function parseRoomCredentials(content) {
  const patterns = [
    /ID\s*[:\-]?\s*(\d{4,})[\s\S]*?(?:SENHA|PASSWORD|PASS)\s*[:\-]?\s*([A-Za-z0-9]+)/i,

    /(?:ID|SALA)\s*[:\-]?\s*(\d{4,})[\s\S]*?([A-Za-z0-9]{3,})/i,

    /(\d{4,})\s+([A-Za-z0-9]{3,})/
  ];

  for (const pattern of patterns) {
    const match =
      content.match(pattern);

    if (match) {
      return {
        id: match[1],
        password: match[2]
      };
    }
  }

  return null;
}

/* =========================================================
   SALA CRIADA
========================================================= */

async function sendRoomMessage(
  message,
  bet,
  room
) {
  const embed =
    new EmbedBuilder()
      .setColor("#FFFFFF")
      .setTitle("🤍・SALA CRIADA")
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
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `copy_id:${room.id}`
        )
        .setLabel("Copiar ID")
        .setEmoji("🆔")
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          `copy_password:${room.password}`
        )
        .setLabel("Copiar Senha")
        .setEmoji("🔐")
        .setStyle(
          ButtonStyle.Secondary
        )
    );

  await message.channel.send({
    embeds: [embed],
    components: [row]
  });

  bet.roomCreated = true;
  bet.roomId = room.id;
  bet.password = room.password;

  const total =
    bet.value * 2;

  const channelName =
    `💰・pagar-${(total / 100)
      .toFixed(2)
      .replace(".", "-")}`;

  await message.channel
    .setName(channelName)
    .catch(() => {});

  saveConfig();
}

/* =========================================================
   FINALIZAR PARTIDA
========================================================= */

async function finishBet(
  interaction,
  betId,
  winnerId,
  isWO
) {
  const bet =
    config.bets[betId];

  if (!bet) {
    return interaction.reply({
      content:
        "❌ Aposta não encontrada.",
      ephemeral: true
    });
  }

  if (bet.status === "closed") {
    return interaction.reply({
      content:
        "⚠️ Esta aposta já foi finalizada.",
      ephemeral: true
    });
  }

  const loserId =
    bet.players.find(
      id => id !== winnerId
    );

  const winnerStats =
    getStats(winnerId);

  const loserStats =
    getStats(loserId);

  if (isWO) {
    /*
      VITÓRIA POR W.O.

      +1 vitória por W.O.
      +0 coins
      +0 vitória normal
      +0 derrota para o adversário
    */

    winnerStats.woWins++;

  } else {
    /*
      VITÓRIA NORMAL

      +1 vitória
      +1 coin
      adversário +1 derrota
    */

    winnerStats.wins++;
    winnerStats.coins++;

    loserStats.losses++;
  }

  bet.status = "closed";
  bet.result =
    isWO ? "wo" : "normal";
  bet.winnerId =
    winnerId;

  saveConfig();

  await interaction.reply({
    embeds: [
      createEmbed(
        isWO
          ? "🚫・VITÓRIA POR W.O."
          : "🏆・PARTIDA FINALIZADA",

        isWO
          ? [
              `🚫 <@${winnerId}> venceu por **W.O.**`,
              "",
              "🚫 **Vitória por W.O.: +1**",
              "🪙 **Coins: +0**",
              "❌ O adversário não recebe derrota."
            ].join("\n")
          : [
              `🏆 <@${winnerId}> venceu normalmente!`,
              "",
              "🏆 **Vitória: +1**",
              "🪙 **Coins: +1**",
              "❌ O adversário recebeu **+1 derrota**."
            ].join("\n")
      )
    ]
  });

  /*
    O canal é excluído 5 segundos
    depois da finalização.
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
          .catch(() => {});
      }
    },
    5000
  );
}

/* =========================================================
   ANÁLISES
========================================================= */

async function requestAnalysis(
  message,
  type
) {
  if (!isMediator(message.member)) {
    return message.reply(
      "❌ Somente pessoas com cargo **Mediador** podem solicitar análise."
    );
  }

  const channelId =
    type === "mob"
      ? config.channels.ssmob
      : config.channels.ssemu;

  const channel =
    message.guild.channels.cache.get(
      channelId
    );

  if (!channel) {
    return message.reply(
      "❌ O canal de análise ainda não foi configurado."
    );
  }

  await channel.send({
    embeds: [
      createEmbed(
        "📋・ANÁLISE FOI SOLICITADA",
        [
          `👤 **Solicitado por:** ${message.author}`,
          "",
          `📊 **Tipo:** ${
            type === "mob"
              ? "SS Mob"
              : "SS Emu"
          }`,
          "",
          "⏳ Aguardando um Analista assumir."
        ].join("\n")
      )
    ],

    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `analysis_assume:${type}:${message.author.id}`
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

  return message.reply(
    `✅ Solicitação de **${
      type === "mob"
        ? "SS Mob"
        : "SS Emu"
    }** enviada para o canal correto.`
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
      GatewayIntentBits.MessageContent
    ],

    partials: [
      Partials.Channel
    ]
  });

/* =========================================================
   BOT ONLINE
========================================================= */

client.once(
  "ready",
  async () => {
    console.log(
      `✅ Bot online: ${client.user.tag}`
    );

    try {
      const rest =
        new REST({
          version: "10"
        }).setToken(TOKEN);

      const commands = [
        new SlashCommandBuilder()
          .setName("fila")
          .setDescription(
            "Publica uma fila com todos os valores predefinidos."
          )

          .addStringOption(
            option =>
              option
                .setName("modalidade")
                .setDescription(
                  "Escolha a modalidade."
                )
                .setRequired(true)
                .addChoices(
                  ...MODALITIES.map(
                    modality => ({
                      name:
                        modality.label,
                      value:
                        modality.id
                    })
                  )
                )
          )

          .addStringOption(
            option =>
              option
                .setName("formato")
                .setDescription(
                  "Escolha o formato."
                )
                .setRequired(true)
                .addChoices(
                  ...FORMATS.map(
                    format => ({
                      name: format,
                      value: format
                    })
                  )
                )
          )

          .toJSON(),

        new SlashCommandBuilder()
          .setName("config")
          .setDescription(
            "Abre o painel de configuração."
          )
          .toJSON()
      ];

      await rest.put(
        Routes.applicationGuildCommands(
          CLIENT_ID,
          GUILD_ID
        ),
        {
          body: commands
        }
      );

      const guild =
        await client.guilds.fetch(
          GUILD_ID
        );

      await guild.members.fetch();

      /*
        AO FICAR ONLINE:

        1. Cria categorias.
        2. Cria canais.
        3. Cria/verifica todas as filas.
        4. Publica a fila de mediadores.
      */

      await createServerStructure(
        guild
      );

      await initializeQueues(
        guild
      );

      await publishMediatorQueue(
        guild
      );

      if (config.botAvatar) {
        await client.user
          .setAvatar(
            config.botAvatar
          )
          .catch(() => {});
      }

      console.log(
        "✅ Tudo configurado automaticamente."
      );
    } catch (error) {
      console.error(
        "❌ Erro durante inicialização:",
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
      /* =====================================================
         SLASH COMMANDS
      ===================================================== */

      if (
        interaction.isChatInputCommand()
      ) {
        /* =========================
           /CONFIG
        ========================= */

        if (
          interaction.commandName ===
          "config"
        ) {
          if (
            !interaction.memberPermissions.has(
              PermissionsBitField.Flags.Administrator
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores podem usar o /config.",
              ephemeral: true
            });
          }

          const embed =
            createEmbed(
              "⚙️・CONFIGURAÇÃO DO BOT",

              [
                "🎨 **Personalização**",
                `Cor da Embed: \`${config.color}\``,
                `Foto do Bot: ${
                  config.botAvatar
                    ? "✅ Configurada"
                    : "❌ Padrão"
                }`,
                "",
                "🛡️ **Cargos**",
                `Mediador: ${
                  config.roles.mediator
                    ? `<@&${config.roles.mediator}>`
                    : "❌ Não configurado"
                }`,
                `Analista: ${
                  config.roles.analyst
                    ? `<@&${config.roles.analyst}>`
                    : "❌ Não configurado"
                }`,
                "",
                "📋 **Análises**",
                `Canal 1 — SS Mob: ${
                  config.channels.ssmob
                    ? `<#${config.channels.ssmob}>`
                    : "❌"
                }`,
                `Canal 2 — SS Emu: ${
                  config.channels.ssemu
                    ? `<#${config.channels.ssemu}>`
                    : "❌"
                }`,
                "",
                "🤖 A estrutura é criada automaticamente quando o bot fica online."
              ].join("\n")
            );

          const row =
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(
                  "config_structure"
                )
                .setLabel(
                  "Criar Estrutura"
                )
                .setEmoji("🏗️")
                .setStyle(
                  ButtonStyle.Success
                ),

              new ButtonBuilder()
                .setCustomId(
                  "config_queues"
                )
                .setLabel(
                  "Atualizar Filas"
                )
                .setEmoji("🎮")
                .setStyle(
                  ButtonStyle.Primary
                )
            );

          return interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
          });
        }

        /* =========================
           /FILA
        ========================= */

        if (
          interaction.commandName ===
          "fila"
        ) {
          if (
            !interaction.memberPermissions.has(
              PermissionsBitField.Flags.Administrator
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores podem usar esse comando.",
              ephemeral: true
            });
          }

          const modality =
            interaction.options.getString(
              "modalidade"
            );

          const format =
            interaction.options.getString(
              "formato"
            );

          await publishQueue(
            interaction.guild,
            modality,
            format
          );

          return interaction.reply({
            content:
              `✅ Fila **${getModalityLabel(
                modality
              )} ${format}** publicada com **todos os valores predefinidos**.`,
            ephemeral: true
          });
        }
      }

      /* =====================================================
         SELECT MENU
      ===================================================== */

      if (
        interaction.isStringSelectMenu()
      ) {
        if (
          interaction.customId.startsWith(
            "queue_value:"
          )
        ) {
          const parts =
            interaction.customId.split(
              ":"
            );

          const modality =
            parts[1];

          const format =
            parts[2];

          const value =
            Number(
              interaction.values[0]
            );

          /*
            Guardamos temporariamente a escolha
            da pessoa na própria mensagem.
          */

          if (!interaction.message.queueSelections) {
            interaction.message.queueSelections = {};
          }

          interaction.message.queueSelections[
            interaction.user.id
          ] = value;

          return interaction.reply({
            content:
              `💰 Valor escolhido: **${money(
                value
              )}**\n\nAgora clique no botão correspondente para entrar na fila.`,
            ephemeral: true
          });
        }
      }

      /* =====================================================
         BOTÕES
      ===================================================== */

      if (
        interaction.isButton()
      ) {
        const customId =
          interaction.customId;

        /* =========================
           MEDIADOR — ENTRAR
        ========================= */

        if (
          customId ===
          "mediator_join"
        ) {
          if (
            !isMediator(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Você não possui o cargo Mediador.",
              ephemeral: true
            });
          }

          if (
            !config.mediatorQueue.includes(
              interaction.user.id
            )
          ) {
            config.mediatorQueue.push(
              interaction.user.id
            );
          }

          saveConfig();

          await publishMediatorQueue(
            interaction.guild
          );

          return interaction.reply({
            content:
              "🟢 Você entrou na fila de Mediadores.",
            ephemeral: true
          });
        }

        /* =========================
           MEDIADOR — SAIR
        ========================= */

        if (
          customId ===
          "mediator_leave"
        ) {
          config.mediatorQueue =
            config.mediatorQueue.filter(
              id =>
                id !==
                interaction.user.id
            );

          saveConfig();

          await publishMediatorQueue(
            interaction.guild
          );

          return interaction.reply({
            content:
              "🔴 Você saiu da fila de Mediadores.",
            ephemeral: true
          });
        }

        /* =========================
           ENTRAR NA FILA
        ========================= */

        if (
          customId.startsWith(
            "queue_join:"
          )
        ) {
          const parts =
            customId.split(
              ":"
            );

          const modality =
            parts[1];

          const format =
            parts[2];

          const mode =
            parts[3];

          const selections =
            interaction.message.queueSelections ||
            {};

          const value =
            selections[
              interaction.user.id
            ];

          if (!value) {
            return interaction.reply({
              content:
                "💰 Primeiro selecione o valor da aposta no menu acima.",
              ephemeral: true
            });
          }

          const key =
            queueKey(
              modality,
              format,
              value,
              mode
            );

          if (!config.queues[key]) {
            config.queues[key] = [];
          }

          if (
            config.queues[key].includes(
              interaction.user.id
            )
          ) {
            return interaction.reply({
              content:
                "⚠️ Você já está nessa fila.",
              ephemeral: true
            });
          }

          /*
            A pessoa só pode estar em uma fila
            por vez.
          */

          removeFromAllQueues(
            interaction.user.id
          );

          config.queues[key].push(
            interaction.user.id
          );

          saveConfig();

          /*
            EXATAMENTE 2 JOGADORES.
          */

          if (
            config.queues[key].length >=
            2
          ) {
            const player1 =
              config.queues[key][0];

            const player2 =
              config.queues[key][1];

            config.queues[key] = [];

            const bet =
              await createBet(
                interaction.guild,
                modality,
                format,
                value,
                mode,
                player1,
                player2
              );

            if (!bet) {
              config.queues[key] = [
                player1,
                player2
              ];

              saveConfig();

              return interaction.reply({
                content:
                  "⚠️ Não existe Mediador disponível no momento.",
                ephemeral: true
              });
            }

            await publishQueue(
              interaction.guild,
              modality,
              format
            );

            return interaction.reply({
              content:
                `🎮 **Aposta #${bet.id} criada!**\n\n👥 Os dois jogadores foram direcionados para o canal privado.`,
              ephemeral: true
            });
          }

          await publishQueue(
            interaction.guild,
            modality,
            format
          );

          return interaction.reply({
            content:
              `✅ Você entrou na fila de **${money(
                value
              )}**.`,
            ephemeral: true
          });
        }

        /* =========================
           SAIR DA FILA
        ========================= */

        if (
          customId.startsWith(
            "queue_leave:"
          )
        ) {
          removeFromAllQueues(
            interaction.user.id
          );

          saveConfig();

          for (
            const modality of MODALITIES
          ) {
            for (
              const format of FORMATS
            ) {
              await publishQueue(
                interaction.guild,
                modality.id,
                format
              );
            }
          }

          return interaction.reply({
            content:
              "🚪 Você saiu da fila.",
            ephemeral: true
          });
        }

        /* =========================
           COPIAR ID
        ========================= */

        if (
          customId.startsWith(
            "copy_id:"
          )
        ) {
          const roomId =
            customId.split(
              ":"
            ).slice(1).join(":");

          return interaction.reply({
            content:
              `🆔 ID da sala: \`${roomId}\``,
            ephemeral: true
          });
        }

        /* =========================
           COPIAR SENHA
        ========================= */

        if (
          customId.startsWith(
            "copy_password:"
          )
        ) {
          const password =
            customId.split(
              ":"
            ).slice(1).join(":");

          return interaction.reply({
            content:
              `🔐 Senha da sala: \`${password}\``,
            ephemeral: true
          });
        }

        /* =========================
           VITÓRIA NORMAL
        ========================= */

        if (
          customId.startsWith(
            "bet_win:"
          )
        ) {
          if (
            !isMediator(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas Mediadores podem finalizar a partida.",
              ephemeral: true
            });
          }

          const parts =
            customId.split(
              ":"
            );

          const betId =
            parts[1];

          const winnerId =
            parts[2];

          return finishBet(
            interaction,
            betId,
            winnerId,
            false
          );
        }

        /* =========================
           VITÓRIA W.O.
        ========================= */

        if (
          customId.startsWith(
            "bet_wo:"
          )
        ) {
          if (
            !isMediator(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas Mediadores podem finalizar a partida.",
              ephemeral: true
            });
          }

          const parts =
            customId.split(
              ":"
            );

          const betId =
            parts[1];

          const winnerId =
            parts[2];

          return finishBet(
            interaction,
            betId,
            winnerId,
            true
          );
        }

        /* =========================
           ASSUMIR ANÁLISE
        ========================= */

        if (
          customId.startsWith(
            "analysis_assume:"
          )
        ) {
          if (
            !isAnalyst(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas pessoas com cargo Analista podem assumir análises.",
              ephemeral: true
            });
          }

          const parts =
            customId.split(
              ":"
            );

          const type =
            parts[1];

          const requesterId =
            parts[2];

          const category =
            await getOrCreateCategory(
              interaction.guild,
              "🔒・ANÁLISES PRIVADAS"
            );

          const channel =
            await interaction.guild.channels.create(
              {
                name:
                  `📊・${type}-${interaction.user.username}`
                    .slice(0, 100),

                type:
                  ChannelType.GuildText,

                parent:
                  category.id,

                permissionOverwrites: [
                  {
                    id:
                      interaction.guild
                        .roles
                        .everyone.id,

                    deny: [
                      PermissionsBitField
                        .Flags
                        .ViewChannel
                    ]
                  },

                  {
                    id:
                      interaction.user.id,

                    allow: [
                      PermissionsBitField
                        .Flags
                        .ViewChannel,

                      PermissionsBitField
                        .Flags
                        .SendMessages,

                      PermissionsBitField
                        .Flags
                        .ReadMessageHistory
                    ]
                  },

                  {
                    id:
                      requesterId,

                    allow: [
                      PermissionsBitField
                        .Flags
                        .ViewChannel,

                      PermissionsBitField
                        .Flags
                        .SendMessages,

                      PermissionsBitField
                        .Flags
                        .ReadMessageHistory
                    ]
                  }
                ]
              }
            );

          await channel.send({
            embeds: [
              createEmbed(
                "📊・ANÁLISE ASSUMIDA",
                [
                  `👤 **Solicitante:** <@${requesterId}>`,
                  `📊 **Analista:** ${interaction.user}`,
                  "",
                  `📋 **Tipo:** ${
                    type === "mob"
                      ? "SS Mob"
                      : "SS Emu"
                  }`,
                  "",
                  "🔒 Canal privado criado para a análise."
                ].join("\n")
              )
            ]
          });

          return interaction.reply({
            content:
              `✅ **Análise assumida.**\n📊 Canal privado: ${channel}`,
            ephemeral: true
          });
        }

        /* =========================
           CONFIG — ESTRUTURA
        ========================= */

        if (
          customId ===
          "config_structure"
        ) {
          if (
            !interaction.memberPermissions.has(
              PermissionsBitField.Flags.Administrator
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores.",
              ephemeral: true
            });
          }

          await createServerStructure(
            interaction.guild
          );

          await initializeQueues(
            interaction.guild
          );

          await publishMediatorQueue(
            interaction.guild
          );

          return interaction.reply({
            content:
              "🏗️ Estrutura, canais e filas atualizados.",
            ephemeral: true
          });
        }

        /* =========================
           CONFIG — FILAS
        ========================= */

        if (
          customId ===
          "config_queues"
        ) {
          if (
            !interaction.memberPermissions.has(
              PermissionsBitField.Flags.Administrator
            )
          ) {
            return interaction.reply({
              content:
                "❌ Apenas administradores.",
              ephemeral: true
            });
          }

          await initializeQueues(
            interaction.guild
          );

          return interaction.reply({
            content:
              "🎮 Todas as filas foram atualizadas.",
            ephemeral: true
          });
        }
      }
    } catch (error) {
      console.error(
        "❌ Erro interactionCreate:",
        error
      );

      if (
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
   MENSAGENS / COMANDOS COM PONTO
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

      const content =
        message.content.trim();

      const lower =
        content.toLowerCase();

      /* =========================
         .P
      ========================= */

      if (lower === ".p") {
        const stats =
          getStats(
            message.author.id
          );

        return message.reply({
          embeds: [
            createEmbed(
              `📊・ESTATÍSTICAS DE ${message.author.username}`,

              [
                "🏆 **Vitórias:**",
                `\`${stats.wins}\``,
                "",
                "❌ **Derrotas:**",
                `\`${stats.losses}\``,
                "",
                "🚫 **Vitórias por W.O.:**",
                `\`${stats.woWins}\``,
                "",
                "🪙 **Coins:**",
                `\`${stats.coins}\``
              ].join("\n")
            )
          ]
        });
      }

      /* =========================
         .SSMOB
      ========================= */

      if (
        lower === ".ssmob"
      ) {
        return requestAnalysis(
          message,
          "mob"
        );
      }

      /* =========================
         .SSEMU
      ========================= */

      if (
        lower === ".ssemu"
      ) {
        return requestAnalysis(
          message,
          "emu"
        );
      }

      /* =========================
         .MED
      ========================= */

      if (
        lower === ".med"
      ) {
        if (
          !isMediator(
            message.member
          )
        ) {
          return message.reply(
            "❌ Somente Mediadores podem usar o `.med`."
          );
        }

        const bet =
          Object.values(
            config.bets
          ).find(
            item =>
              item.channelId ===
                message.channel.id &&
              item.status ===
                "open"
          );

        if (!bet) {
          return message.reply(
            "❌ Este canal não possui uma aposta ativa."
          );
        }

        const row1 =
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                `bet_win:${bet.id}:${bet.players[0]}`
              )
              .setLabel(
                "Vitória Jogador 1"
              )
              .setEmoji("🏆")
              .setStyle(
                ButtonStyle.Success
              ),

            new ButtonBuilder()
              .setCustomId(
                `bet_win:${bet.id}:${bet.players[1]}`
              )
              .setLabel(
                "Vitória Jogador 2"
              )
              .setEmoji("🏆")
              .setStyle(
                ButtonStyle.Success
              )
          );

        const row2 =
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                `bet_wo:${bet.id}:${bet.players[0]}`
              )
              .setLabel(
                "W.O. Jogador 1"
              )
              .setEmoji("🚫")
              .setStyle(
                ButtonStyle.Danger
              ),

            new ButtonBuilder()
              .setCustomId(
                `bet_wo:${bet.id}:${bet.players[1]}`
              )
              .setLabel(
                "W.O. Jogador 2"
              )
              .setEmoji("🚫")
              .setStyle(
                ButtonStyle.Danger
              )
          );

        return message.reply({
          embeds: [
            createEmbed(
              `🛡️・CONTROLE DA APOSTA #${bet.id}`,

              [
                `👤 <@${bet.players[0]}>`,
                "          ⚔️",
                `👤 <@${bet.players[1]}>`,
                "",
                `💰 **Aposta:** ${money(
                  bet.value
                )} por jogador`,
                "",
                "🏆 Escolha o vencedor:",
                "",
                "🟢 Vitória normal = +1 vitória +1 coin",
                "🚫 W.O. = +1 vitória por W.O. e +0 coins"
              ].join("\n")
            )
          ],
          components: [
            row1,
            row2
          ]
        });
      }

      /* =====================================================
         DETECTAR ID + SENHA AUTOMATICAMENTE
      ===================================================== */

      const activeBet =
        Object.values(
          config.bets
        ).find(
          item =>
            item.channelId ===
              message.channel.id &&
            item.status ===
              "open"
        );

      if (
        activeBet &&
        isMediator(
          message.member
        ) &&
        !activeBet.roomCreated
      ) {
        const room =
          parseRoomCredentials(
            content
          );

        if (room) {
          await sendRoomMessage(
            message,
            activeBet,
            room
          );
        }
      }
    } catch (error) {
      console.error(
        "❌ Erro messageCreate:",
        error
      );
    }
  }
);

/* =========================================================
   LOGIN
========================================================= */

client.login(TOKEN);
