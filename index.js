const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN) {
  console.error("ERRO: DISCORD_TOKEN não foi configurado.");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("ERRO: CLIENT_ID não foi configurado.");
  process.exit(1);
}

if (!GUILD_ID) {
  console.error("ERRO: GUILD_ID não foi configurado.");
  process.exit(1);
}

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ============================================================
// BANCO TEMPORÁRIO EM MEMÓRIA
// ============================================================

const config = new Map();

const queues = new Map();
const matches = new Map();
const analystRequests = new Map();
const coins = new Map();

// ============================================================
// MODALIDADES
// ============================================================

const MODES = {
  mobile: "Mobile",
  emulador: "Emulador",
  misto: "Misto"
};

const FORMATS = {
  "1x1": "1x1",
  "2x2": "2x2",
  "3x3": "3x3",
  "4x4": "4x4"
};

// IMPORTANTE:
// TODA FILA POSSUI EXATAMENTE 2 JOGADORES.
// O formato 2x2/3x3/4x4 é apenas a modalidade/formato
// informado na aposta. A fila do bot nunca terá 4, 6 ou 8
// usuários.

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function getGuildConfig(guildId) {
  if (!config.has(guildId)) {
    config.set(guildId, {
      mediatorRoleId: null,
      analystRoleId: null,
      mediatorCategoryId: null,
      analystChannelId: null,
      queueChannelId: null,
      configured: false
    });
  }

  return config.get(guildId);
}

function getUserCoins(userId) {
  if (!coins.has(userId)) {
    coins.set(userId, 0);
  }

  return coins.get(userId);
}

function addCoins(userId, amount) {
  coins.set(userId, getUserCoins(userId) + amount);
}

function removeCoins(userId, amount) {
  const current = getUserCoins(userId);

  if (current < amount) {
    return false;
  }

  coins.set(userId, current - amount);
  return true;
}

function normalizeAmount(value) {
  if (typeof value !== "string") return null;

  const clean = value
    .replace("R$", "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const amount = Number(clean);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.round(amount * 100) / 100;
}

function isValidAmount(amount) {
  return amount >= 0.30 && amount <= 100;
}

function formatMoney(amount) {
  return amount.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function isMediator(member, guildConfig) {
  if (!guildConfig.mediatorRoleId) {
    return false;
  }

  return member.roles.cache.has(guildConfig.mediatorRoleId);
}

function isAnalyst(member, guildConfig) {
  if (!guildConfig.analystRoleId) {
    return false;
  }

  return member.roles.cache.has(guildConfig.analystRoleId);
}

function isStaff(member, guildConfig) {
  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    isMediator(member, guildConfig) ||
    isAnalyst(member, guildConfig)
  );
}

// ============================================================
// FILAS
// ============================================================

function queueKey(mode, format, amount) {
  return `${mode}:${format}:${amount.toFixed(2)}`;
}

function getQueue(mode, format, amount) {
  const key = queueKey(mode, format, amount);

  if (!queues.has(key)) {
    queues.set(key, {
      key,
      mode,
      format,
      amount,
      players: [],
      createdAt: Date.now()
    });
  }

  return queues.get(key);
}

function removePlayerFromQueue(userId) {
  for (const [key, queue] of queues.entries()) {
    const index = queue.players.indexOf(userId);

    if (index !== -1) {
      queue.players.splice(index, 1);

      if (queue.players.length === 0) {
        queues.delete(key);
      }

      return true;
    }
  }

  return false;
}

// ============================================================
// EMBEDS
// ============================================================

function queueEmbed(queue) {
  const playersText =
    queue.players.length === 0
      ? "Nenhum jogador"
      : queue.players.map((id, index) => `${index + 1}. <@${id}>`).join("\n");

  return new EmbedBuilder()
    .setTitle("🎮 Fila de Apostas")
    .setDescription(
      [
        `**Modalidade:** ${MODES[queue.mode] || queue.mode}`,
        `**Formato:** ${FORMATS[queue.format] || queue.format}`,
        `**Valor:** ${formatMoney(queue.amount)}`,
        "",
        "**Jogadores:**",
        playersText,
        "",
        `**Vagas:** ${queue.players.length}/2`
      ].join("\n")
    );
}

function queueButtons(queue) {
  const join = new ButtonBuilder()
    .setCustomId(`queue_join:${queue.key}`)
    .setLabel("Entrar na fila")
    .setStyle(ButtonStyle.Success);

  const leave = new ButtonBuilder()
    .setCustomId(`queue_leave:${queue.key}`)
    .setLabel("Sair da fila")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(join, leave);
}

// ============================================================
// PARTIDA
// ============================================================

function matchEmbed(match) {
  return new EmbedBuilder()
    .setTitle("⚔️ Aposta iniciada")
    .setDescription(
      [
        `**Jogador 1:** <@${match.players[0]}>`,
        `**Jogador 2:** <@${match.players[1]}>`,
        "",
        `**Modalidade:** ${MODES[match.mode] || match.mode}`,
        `**Formato:** ${FORMATS[match.format] || match.format}`,
        `**Valor:** ${formatMoney(match.amount)}`,
        "",
        match.mediatorId
          ? `**Mediador:** <@${match.mediatorId}>`
          : "**Mediador:** aguardando mediador",
        "",
        `**Confirmações:** ${match.confirmed.size}/2`
      ].join("\n")
    );
}

function matchButtons(match) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`match_confirm:${match.id}`)
      .setLabel("Confirmar aposta")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`match_leave:${match.id}`)
      .setLabel("Cancelar")
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`match_win:${match.id}`)
      .setLabel("Declarar vencedor")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`match_wo:${match.id}`)
      .setLabel("W.O.")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`match_close:${match.id}`)
      .setLabel("Encerrar")
      .setStyle(ButtonStyle.Danger)
  );

  return [row1, row2];
}

// ============================================================
// CANAL PRIVADO DA PARTIDA
// ============================================================

async function createMatchChannel(guild, match) {
  const guildConfig = getGuildConfig(guild.id);

  if (!guildConfig.mediatorCategoryId) {
    return null;
  }

  const category = guild.channels.cache.get(guildConfig.mediatorCategoryId);

  if (!category || category.type !== ChannelType.GuildCategory) {
    return null;
  }

  const overwrites = [
    {
      id: guild.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: match.players[0],
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    },
    {
      id: match.players[1],
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    }
  ];

  if (match.mediatorId) {
    overwrites.push({
      id: match.mediatorId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    });
  }

  if (guildConfig.analystRoleId) {
    overwrites.push({
      id: guildConfig.analystRoleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    });
  }

  const everyoneRole = guild.roles.everyone;

  overwrites.push({
    id: everyoneRole.id,
    deny: [PermissionsBitField.Flags.ViewChannel]
  });

  const channel = await guild.channels.create({
    name: `aposta-${match.players[0].slice(-4)}-${match.players[1].slice(-4)}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
    reason: "Canal privado de aposta"
  });

  return channel;
}

// ============================================================
// ENCONTRAR MEDIADOR
// ============================================================

async function findMediator(guild) {
  const guildConfig = getGuildConfig(guild.id);

  if (!guildConfig.mediatorRoleId) {
    return null;
  }

  const role = guild.roles.cache.get(guildConfig.mediatorRoleId);

  if (!role) {
    return null;
  }

  const candidates = role.members.filter(member => !member.user.bot);

  if (candidates.size === 0) {
    return null;
  }

  return candidates.first();
}

// ============================================================
// FINALIZAÇÃO DA PARTIDA
// ============================================================

async function finishMatch(match, winnerId, reason) {
  if (match.finished) {
    return false;
  }

  if (!match.players.includes(winnerId)) {
    return false;
  }

  match.finished = true;
  match.winnerId = winnerId;
  match.finishReason = reason;
  match.finishedAt = Date.now();

  // Exemplo de recompensa em Coins.
  // O valor da aposta em centavos é convertido em uma quantidade
  // inteira de Coins.
  const reward = Math.max(1, Math.round(match.amount * 100));

  addCoins(winnerId, reward);

  if (match.channelId) {
    const channel = await client.channels.fetch(match.channelId).catch(() => null);

    if (channel) {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🏆 Aposta encerrada")
            .setDescription(
              [
                `**Vencedor:** <@${winnerId}>`,
                `**Motivo:** ${reason}`,
                "",
                `**Coins recebidas:** ${reward}`,
                "",
                `Saldo atual: **${getUserCoins(winnerId)} Coins**`
              ].join("\n")
            )
        ]
      }).catch(() => {});
    }
  }

  return true;
}

// ============================================================
// ANALISTAS
// ============================================================

async function notifyAnalysts(guild, request) {
  const guildConfig = getGuildConfig(guild.id);

  if (!guildConfig.analystRoleId) {
    return false;
  }

  let channel = null;

  if (guildConfig.analystChannelId) {
    channel = guild.channels.cache.get(guildConfig.analystChannelId);
  }

  if (!channel) {
    return false;
  }

  const embed = new EmbedBuilder()
    .setTitle("🔎 Nova solicitação de análise")
    .setDescription(
      [
        `**Usuário:** <@${request.userId}>`,
        `**Solicitação:** ${request.type}`,
        "",
        "Um Analista pode assumir esta solicitação."
      ].join("\n")
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`analyst_take:${request.id}`)
      .setLabel("Assumir análise")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({
    content: `<@&${guildConfig.analystRoleId}>`,
    embeds: [embed],
    components: [row]
  });

  return true;
}

// ============================================================
// COMANDOS
// ============================================================

const commands = [
  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configura o bot"),

  new SlashCommandBuilder()
    .setName("fila")
    .setDescription("Cria uma fila de aposta")
    .addStringOption(option =>
      option
        .setName("modalidade")
        .setDescription("Mobile, Emulador ou Misto")
        .setRequired(true)
        .addChoices(
          { name: "Mobile", value: "mobile" },
          { name: "Emulador", value: "emulador" },
          { name: "Misto", value: "misto" }
        )
    )
    .addStringOption(option =>
      option
        .setName("formato")
        .setDescription("Formato da aposta")
        .setRequired(true)
        .addChoices(
          { name: "1x1", value: "1x1" },
          { name: "2x2", value: "2x2" },
          { name: "3x3", value: "3x3" },
          { name: "4x4", value: "4x4" }
        )
    )
    .addStringOption(option =>
      option
        .setName("valor")
        .setDescription("Valor entre R$0,30 e R$100")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("coins")
    .setDescription("Mostra seu saldo de Coins"),

  new SlashCommandBuilder()
    .setName("med")
    .setDescription("Solicita um Mediador"),

  new SlashCommandBuilder()
    .setName("ss")
    .setDescription("Solicita uma análise")
    .addStringOption(option =>
      option
        .setName("tipo")
        .setDescription("Tipo da análise")
        .setRequired(true)
    )
].map(command => command.toJSON());

// ============================================================
// REGISTRO DOS SLASH COMMANDS
// ============================================================

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    {
      body: commands
    }
  );

  console.log("Slash commands registrados.");
}

// ============================================================
// READY
// ============================================================

client.once("ready", async () => {
  console.log("========================================");
  console.log(`Bot online como ${client.user.tag}`);
  console.log(`ID: ${client.user.id}`);
  console.log("========================================");

  try {
    await registerCommands();
  } catch (error) {
    console.error("Erro ao registrar comandos:", error);
  }

  client.user.setPresence({
    activities: [
      {
        name: "filas e apostas",
        type: 0
      }
    ],
    status: "online"
  });
});

// ============================================================
// INTERAÇÕES
// ============================================================

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
      return;
    }
  } catch (error) {
    console.error("Erro na interação:", error);

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: "❌ Ocorreu um erro ao processar essa ação.",
        ephemeral: true
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: "❌ Ocorreu um erro ao processar essa ação.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ============================================================
// SLASH COMMANDS
// ============================================================

async function handleSlashCommand(interaction) {
  const guild = interaction.guild;

  if (!guild) {
    return interaction.reply({
      content: "❌ Este comando só pode ser usado em um servidor.",
      ephemeral: true
    });
  }

  const guildConfig = getGuildConfig(guild.id);

  // ----------------------------------------------------------
  // /coins
  // ----------------------------------------------------------

  if (interaction.commandName === "coins") {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🪙 Coins")
          .setDescription(
            `Você possui **${getUserCoins(interaction.user.id)} Coins**.`
          )
      ],
      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // /config
  // ----------------------------------------------------------

  if (interaction.commandName === "config") {
    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      return interaction.reply({
        content: "❌ Você precisa ser administrador para usar `/config`.",
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("⚙️ Configuração")
      .setDescription(
        [
          "**Mediador:**",
          guildConfig.mediatorRoleId
            ? `<@&${guildConfig.mediatorRoleId}>`
            : "Não configurado",
          "",
          "**Analista:**",
          guildConfig.analystRoleId
            ? `<@&${guildConfig.analystRoleId}>`
            : "Não configurado",
          "",
          "**Categoria das apostas:**",
          guildConfig.mediatorCategoryId
            ? `<#${guildConfig.mediatorCategoryId}>`
            : "Não configurada",
          "",
          "**Canal dos Analistas:**",
          guildConfig.analystChannelId
            ? `<#${guildConfig.analystChannelId}>`
            : "Não configurado"
        ].join("\n")
      );

    const select = new StringSelectMenuBuilder()
      .setCustomId("config_select")
      .setPlaceholder("Escolha o que deseja configurar")
      .addOptions(
        {
          label: "Cargo Mediador",
          value: "mediator_role",
          description: "Define quem pode atuar como Mediador"
        },
        {
          label: "Cargo Analista",
          value: "analyst_role",
          description: "Define quem pode assumir análises"
        },
        {
          label: "Categoria das apostas",
          value: "mediator_category",
          description: "Define onde os canais privados serão criados"
        },
        {
          label: "Canal dos Analistas",
          value: "analyst_channel",
          description: "Define onde análises serão solicitadas"
        }
      );

    return interaction.reply({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(select)
      ],
      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // /fila
  // ----------------------------------------------------------

  if (interaction.commandName === "fila") {
    const mode = interaction.options.getString("modalidade");
    const format = interaction.options.getString("formato");
    const valueText = interaction.options.getString("valor");

    const amount = normalizeAmount(valueText);

    if (amount === null || !isValidAmount(amount)) {
      return interaction.reply({
        content: "❌ O valor precisa estar entre **R$0,30 e R$100,00**.",
        ephemeral: true
      });
    }

    const queue = getQueue(mode, format, amount);

    if (queue.players.includes(interaction.user.id)) {
      return interaction.reply({
        content: "❌ Você já está nessa fila.",
        ephemeral: true
      });
    }

    if (queue.players.length >= 2) {
      return interaction.reply({
        content: "❌ Essa fila já possui 2 jogadores.",
        ephemeral: true
      });
    }

    queue.players.push(interaction.user.id);

    if (queue.players.length === 2) {
      const players = [...queue.players];

      queues.delete(queue.key);

      const mediator = await findMediator(guild);

      const match = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        players,
        mode,
        format,
        amount,
        mediatorId: mediator ? mediator.id : null,
        confirmed: new Set(),
        channelId: null,
        finished: false
      };

      matches.set(match.id, match);

      const channel = await createMatchChannel(guild, match);

      if (channel) {
        match.channelId = channel.id;

        await channel.send({
          content: mediator
            ? `<@${players[0]}> <@${players[1]}> <@${mediator.id}>`
            : `<@${players[0]}> <@${players[1]}>`,
          embeds: [matchEmbed(match)],
          components: matchButtons(match)
        });
      }

      return interaction.reply({
        content: channel
          ? `✅ A fila fechou! O canal privado da aposta foi criado: ${channel}`
          : "✅ A fila fechou! Os dois jogadores foram encontrados, mas a categoria privada ainda não está configurada.",
        ephemeral: true
      });
    }

    return interaction.reply({
      embeds: [queueEmbed(queue)],
      components: [queueButtons(queue)]
    });
  }

  // ----------------------------------------------------------
  // /med
  // ----------------------------------------------------------

  if (interaction.commandName === "med") {
    if (!guildConfig.mediatorRoleId) {
      return interaction.reply({
        content: "❌ O cargo de Mediador ainda não foi configurado em `/config`.",
        ephemeral: true
      });
    }

    const request = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId: interaction.user.id,
      guildId: guild.id,
      createdAt: Date.now(),
      mediatorId: null
    };

    analystRequests.set(`med:${request.id}`, request);

    const mediator = await findMediator(guild);

    if (mediator) {
      request.mediatorId = mediator.id;

      return interaction.reply({
        content: `✅ Mediador disponível: <@${mediator.id}>. Ele foi chamado para atender você.`,
        ephemeral: true
      });
    }

    return interaction.reply({
      content: "⏳ Não há Mediador disponível no momento. Sua solicitação ficou aguardando.",
      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // /ss
  // ----------------------------------------------------------

  if (interaction.commandName === "ss") {
    const type = interaction.options.getString("tipo");

    const request = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId: interaction.user.id,
      guildId: guild.id,
      type,
      createdAt: Date.now(),
      analystId: null
    };

    analystRequests.set(`ss:${request.id}`, request);

    const notified = await notifyAnalysts(guild, request);

    if (!notified) {
      return interaction.reply({
        content:
          "⚠️ Solicitação criada, mas o cargo/canal de Analistas ainda não está configurado corretamente.",
        ephemeral: true
      });
    }

    return interaction.reply({
      content: `✅ Solicitação de análise **${type}** enviada aos Analistas.`,
      ephemeral: true
    });
  }
}

// ============================================================
// SELECT CONFIG
// ============================================================

async function handleSelect(interaction) {
  if (interaction.customId !== "config_select") {
    return;
  }

  if (
    !interaction.member.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  ) {
    return interaction.reply({
      content: "❌ Apenas administradores podem alterar a configuração.",
      ephemeral: true
    });
  }

  const choice = interaction.values[0];

  if (choice === "mediator_role") {
    const roles = interaction.guild.roles.cache
      .filter(role => role.id !== interaction.guild.id)
      .first(25);

    const select = new StringSelectMenuBuilder()
      .setCustomId("select_mediator_role")
      .setPlaceholder("Escolha o cargo de Mediador");

    for (const role of roles.values()) {
      select.addOptions({
        label: role.name.slice(0, 100),
        value: role.id
      });
    }

    return interaction.reply({
      content: "Escolha o cargo que será usado como **Mediador**.",
      components: [
        new ActionRowBuilder().addComponents(select)
      ],
      ephemeral: true
    });
  }

  if (choice === "analyst_role") {
    const roles = interaction.guild.roles.cache
      .filter(role => role.id !== interaction.guild.id)
      .first(25);

    const select = new StringSelectMenuBuilder()
      .setCustomId("select_analyst_role")
      .setPlaceholder("Escolha o cargo de Analista");

    for (const role of roles.values()) {
      select.addOptions({
        label: role.name.slice(0, 100),
        value: role.id
      });
    }

    return interaction.reply({
      content:
        "Escolha o cargo de **Analista**. Esse cargo serve exclusivamente para assumir solicitações de análise.",
      components: [
        new ActionRowBuilder().addComponents(select)
      ],
      ephemeral: true
    });
  }

  if (choice === "mediator_category") {
    const categories = interaction.guild.channels.cache
      .filter(channel => channel.type === ChannelType.GuildCategory)
      .first(25);

    const select = new StringSelectMenuBuilder()
      .setCustomId("select_mediator_category")
      .setPlaceholder("Escolha a categoria");

    for (const category of categories.values()) {
      select.addOptions({
        label: category.name.slice(0, 100),
        value: category.id
      });
    }

    return interaction.reply({
      content: "Escolha a categoria onde os canais privados serão criados.",
      components: [
        new ActionRowBuilder().addComponents(select)
      ],
      ephemeral: true
    });
  }

  if (choice === "analyst_channel") {
    const channels = interaction.guild.channels.cache
      .filter(channel => channel.type === ChannelType.GuildText)
      .first(25);

    const select = new StringSelectMenuBuilder()
      .setCustomId("select_analyst_channel")
      .setPlaceholder("Escolha o canal dos Analistas");

    for (const channel of channels.values()) {
      select.addOptions({
        label: channel.name.slice(0, 100),
        value: channel.id
      });
    }

    return interaction.reply({
      content: "Escolha o canal privado/fila dos Analistas.",
      components: [
        new ActionRowBuilder().addComponents(select)
      ],
      ephemeral: true
    });
  }

  if (interaction.customId === "select_mediator_role") {
    const guildConfig = getGuildConfig(interaction.guild.id);

    guildConfig.mediatorRoleId = interaction.values[0];
    guildConfig.configured = true;

    return interaction.update({
      content: `✅ Cargo de Mediador configurado: <@&${guildConfig.mediatorRoleId}>`,
      embeds: [],
      components: []
    });
  }

  if (interaction.customId === "select_analyst_role") {
    const guildConfig = getGuildConfig(interaction.guild.id);

    guildConfig.analystRoleId = interaction.values[0];
    guildConfig.configured = true;

    return interaction.update({
      content:
        `✅ Cargo de Analista configurado: <@&${guildConfig.analystRoleId}>\n\n` +
        "Esse cargo possui somente a permissão de assumir solicitações de análise.",
      embeds: [],
      components: []
    });
  }

  if (interaction.customId === "select_mediator_category") {
    const guildConfig = getGuildConfig(interaction.guild.id);

    guildConfig.mediatorCategoryId = interaction.values[0];
    guildConfig.configured = true;

    return interaction.update({
      content: `✅ Categoria das apostas configurada: <#${guildConfig.mediatorCategoryId}>`,
      embeds: [],
      components: []
    });
  }

  if (interaction.customId === "select_analyst_channel") {
    const guildConfig = getGuildConfig(interaction.guild.id);

    guildConfig.analystChannelId = interaction.values[0];
    guildConfig.configured = true;

    return interaction.update({
      content: `✅ Canal dos Analistas configurado: <#${guildConfig.analystChannelId}>`,
      embeds: [],
      components: []
    });
  }
}

// ============================================================
// BOTÕES
// ============================================================

async function handleButton(interaction) {
  const [action, id] = interaction.customId.split(":");

  // ----------------------------------------------------------
  // ENTRAR NA FILA
  // ----------------------------------------------------------

  if (action === "queue_join") {
    const queue = queues.get(id);

    if (!queue) {
      return interaction.reply({
        content: "❌ Essa fila não existe mais.",
        ephemeral: true
      });
    }

    if (queue.players.includes(interaction.user.id)) {
      return interaction.reply({
        content: "❌ Você já está nessa fila.",
        ephemeral: true
      });
    }

    if (queue.players.length >= 2) {
      return interaction.reply({
        content: "❌ Essa fila já está cheia.",
        ephemeral: true
      });
    }

    queue.players.push(interaction.user.id);

    if (queue.players.length === 2) {
      const players = [...queue.players];

      queues.delete(queue.key);

      const mediator = await findMediator(interaction.guild);

      const match = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        players,
        mode: queue.mode,
        format: queue.format,
        amount: queue.amount,
        mediatorId: mediator ? mediator.id : null,
        confirmed: new Set(),
        channelId: null,
        finished: false
      };

      matches.set(match.id, match);

      const channel = await createMatchChannel(
        interaction.guild,
        match
      );

      if (channel) {
        match.channelId = channel.id;

        await channel.send({
          content: mediator
            ? `<@${players[0]}> <@${players[1]}> <@${mediator.id}>`
            : `<@${players[0]}> <@${players[1]}>`,
          embeds: [matchEmbed(match)],
          components: matchButtons(match)
        });
      }

      return interaction.update({
        content: channel
          ? `✅ Aposta formada! ${channel}`
          : "✅ Aposta formada! Configure uma categoria em `/config` para criar canais privados.",
        embeds: [],
        components: []
      });
    }

    return interaction.update({
      embeds: [queueEmbed(queue)],
      components: [queueButtons(queue)]
    });
  }

  // ----------------------------------------------------------
  // SAIR DA FILA
  // ----------------------------------------------------------

  if (action === "queue_leave") {
    const queue = queues.get(id);

    if (!queue) {
      return interaction.reply({
        content: "❌ Essa fila não existe mais.",
        ephemeral: true
      });
    }

    const index = queue.players.indexOf(interaction.user.id);

    if (index === -1) {
      return interaction.reply({
        content: "❌ Você não está nessa fila.",
        ephemeral: true
      });
    }

    queue.players.splice(index, 1);

    if (queue.players.length === 0) {
      queues.delete(queue.key);

      return interaction.update({
        content: "A fila foi encerrada porque ficou vazia.",
        embeds: [],
        components: []
      });
    }

    return interaction.update({
      embeds: [queueEmbed(queue)],
      components: [queueButtons(queue)]
    });
  }

  // ----------------------------------------------------------
  // CONFIRMAR
  // ----------------------------------------------------------

  if (action === "match_confirm") {
    const match = matches.get(id);

    if (!match) {
      return interaction.reply({
        content: "❌ Essa aposta não existe.",
        ephemeral: true
      });
    }

    if (!match.players.includes(interaction.user.id)) {
      return interaction.reply({
        content: "❌ Apenas os jogadores podem confirmar.",
        ephemeral: true
      });
    }

    if (match.finished) {
      return interaction.reply({
        content: "❌ Essa aposta já foi encerrada.",
        ephemeral: true
      });
    }

    match.confirmed.add(interaction.user.id);

    if (match.confirmed.size < 2) {
      return interaction.update({
        embeds: [matchEmbed(match)],
        components: matchButtons(match)
      });
    }

    // Os dois confirmaram.
    // Aqui o fluxo de pagamento pode prosseguir.
    // O bot NÃO solicita pagamento antes das duas confirmações.

    const channel = match.channelId
      ? await client.channels.fetch(match.channelId).catch(() => null)
      : null;

    if (channel) {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Os dois jogadores confirmaram")
            .setDescription(
              [
                "A aposta foi confirmada pelos dois jogadores.",
                "",
                `Valor: **${formatMoney(match.amount)}**`,
                "",
                "O Mediador pode prosseguir com o fluxo de pagamento."
              ].join("\n")
            )
        ]
      });
    }

    return interaction.update({
      embeds: [matchEmbed(match)],
      components: matchButtons(match)
    });
  }

  // ----------------------------------------------------------
  // CANCELAR PARTIDA
  // ----------------------------------------------------------

  if (action === "match_leave") {
    const match = matches.get(id);

    if (!match) {
      return interaction.reply({
        content: "❌ Essa aposta não existe.",
        ephemeral: true
      });
    }

    if (!match.players.includes(interaction.user.id)) {
      return interaction.reply({
        content: "❌ Você não participa dessa aposta.",
        ephemeral: true
      });
    }

    if (match.finished) {
      return interaction.reply({
        content: "❌ Essa aposta já foi encerrada.",
        ephemeral: true
      });
    }

    match.finished = true;
    match.finishReason = "Cancelada";

    const channel = match.channelId
      ? await client.channels.fetch(match.channelId).catch(() => null)
      : null;

    if (channel) {
      await channel.send("❌ A aposta foi cancelada.");
    }

    return interaction.reply({
      content: "✅ Aposta cancelada.",
      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // VENCEDOR
  // ----------------------------------------------------------

  if (action === "match_win") {
    const match = matches.get(id);

    if (!match) {
      return interaction.reply({
        content: "❌ Aposta não encontrada.",
        ephemeral: true
      });
    }

    const guildConfig = getGuildConfig(interaction.guild.id);

    if (
      !isMediator(interaction.member, guildConfig) &&
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      return interaction.reply({
        content: "❌ Apenas o Mediador responsável ou administrador pode declarar o vencedor.",
        ephemeral: true
      });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(`winner_select:${id}`)
      .setPlaceholder("Escolha o vencedor")
      .addOptions(
        match.players.map(playerId => ({
          label: interaction.guild.members.cache.get(playerId)?.user.username || playerId,
          value: playerId
        }))
      );

    return interaction.reply({
      content: "Selecione o vencedor:",
      components: [
        new ActionRowBuilder().addComponents(select)
      ],
      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // W.O.
  // ----------------------------------------------------------

  if (action === "match_wo") {
    const match = matches.get(id);

    if (!match) {
      return interaction.reply({
        content: "❌ Aposta não encontrada.",
        ephemeral: true
      });
    }

    const guildConfig = getGuildConfig(interaction.guild.id);

    if (
      !isMediator(interaction.member, guildConfig) &&
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      return interaction.reply({
        content: "❌ Apenas o Mediador responsável ou administrador pode registrar W.O.",
        ephemeral: true
      });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(`wo_select:${id}`)
      .setPlaceholder("Escolha o vencedor por W.O.")
      .addOptions(
        match.players.map(playerId => ({
          label: interaction.guild.members.cache.get(playerId)?.user.username || playerId,
          value: playerId
        }))
      );

    return interaction.reply({
      content: "Selecione quem venceu por W.O.:",
      components: [
        new ActionRowBuilder().addComponents(select)
      ],
      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // ENCERRAR
  // ----------------------------------------------------------

  if (action === "match_close") {
    const match = matches.get(id);

    if (!match) {
      return interaction.reply({
        content: "❌ Aposta não encontrada.",
        ephemeral: true
      });
    }

    const guildConfig = getGuildConfig(interaction.guild.id);

    if (
      !isMediator(interaction.member, guildConfig) &&
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      return interaction.reply({
        content: "❌ Apenas o Mediador responsável ou administrador pode encerrar.",
        ephemeral: true
      });
    }

    match.finished = true;
    match.finishReason = "Encerrada manualmente";

    return interaction.reply({
      content: "✅ Aposta encerrada.",
      ephemeral: true
    });
  }

  // ----------------------------------------------------------
  // ASSUMIR ANÁLISE
  // ----------------------------------------------------------

  if (action === "analyst_take") {
    const request = analystRequests.get(`ss:${id}`);

    if (!request) {
      return interaction.reply({
        content: "❌ Essa solicitação não existe mais.",
        ephemeral: true
      });
    }

    const guildConfig = getGuildConfig(interaction.guild.id);

    if (!isAnalyst(interaction.member, guildConfig)) {
      return interaction.reply({
        content: "❌ Você não possui o cargo de Analista configurado.",
        ephemeral: true
      });
    }

    if (request.analystId) {
      return interaction.reply({
        content: "❌ Essa análise já foi assumida por outro Analista.",
        ephemeral: true
      });
    }

    request.analystId = interaction.user.id;

    return interaction.update({
      content:
        `🔎 Análise assumida por <@${interaction.user.id}>.\n` +
        `Usuário: <@${request.userId}>\n` +
        `Tipo: **${request.type}**`,
      embeds: [],
      components: []
    });
  }
}

// ============================================================
// SELECTS DE VENCEDOR / W.O.
// ============================================================

async function handleSelectWinner(interaction) {
  const [action, id] = interaction.customId.split(":");

  const match = matches.get(id);

  if (!match) {
    return interaction.reply({
      content: "❌ Aposta não encontrada.",
      ephemeral: true
    });
  }

  if (action === "winner_select") {
    const winnerId = interaction.values[0];

    await finishMatch(match, winnerId, "Vitória");

    return interaction.update({
      content: `🏆 Vencedor definido: <@${winnerId}>`,
      components: []
    });
  }

  if (action === "wo_select") {
    const winnerId = interaction.values[0];

    await finishMatch(match, winnerId, "W.O.");

    return interaction.update({
      content: `🏆 W.O. registrado. Vencedor: <@${winnerId}>`,
      components: []
    });
  }
}

// ============================================================
// MODAIS
// ============================================================

async function handleModal(interaction) {
  return interaction.reply({
    content: "✅ Solicitação recebida.",
    ephemeral: true
  });
}

// ============================================================
// PREFIXO .ss
// ============================================================

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) {
    return;
  }

  const content = message.content.trim();

  if (!content.toLowerCase().startsWith(".ss")) {
    return;
  }

  const parts = content.split(/\s+/);

  const type = parts[1] || "mob";

  const guildConfig = getGuildConfig(message.guild.id);

  const request = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    userId: message.author.id,
    guildId: message.guild.id,
    type,
    createdAt: Date.now(),
    analystId: null
  };

  analystRequests.set(`ss:${request.id}`, request);

  const notified = await notifyAnalysts(
    message.guild,
    request
  );

  if (!notified) {
    await message.reply(
      "⚠️ O sistema de Analistas ainda não está configurado em `/config`."
    );
    return;
  }

  await message.reply(
    `✅ Solicitação **.ss ${type}** enviada aos Analistas.`
  );
});

// ============================================================
// SELEÇÃO GLOBAL
// ============================================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isStringSelectMenu()) {
    return;
  }

  if (
    interaction.customId.startsWith("winner_select:") ||
    interaction.customId.startsWith("wo_select:")
  ) {
    await handleSelectWinner(interaction).catch(console.error);
  }
});

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN);
