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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  ChannelType
} = require("discord.js");

require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const config = {
  token: process.env.TOKEN,
  prefix: "!",
  betsCategoryId: process.env.BETS_CATEGORY_ID || "",
  queueCategoryId: process.env.QUEUE_CATEGORY_ID || "",
  mediatorRoleId: process.env.MEDIATOR_ROLE_ID || "",
  adminRoleId: process.env.ADMIN_ROLE_ID || "",
  staffRoleId: process.env.STAFF_ROLE_ID || "",
  logChannelId: process.env.LOG_CHANNEL_ID || "",
  botName: "Bet Bot"
};

const queues = new Map();
const bets = new Map();
const activeMatches = new Map();
const mediatorQueues = new Map();
const userConfigurations = new Map();

client.once("ready", async () => {
  console.log(`Bot conectado como ${client.user.tag}`);

  try {
    await client.user.setPresence({
      activities: [
        {
          name: "gerenciando apostas",
          type: 0
        }
      ],
      status: "online"
    });
  } catch (error) {
    console.error("Erro ao configurar presença:", error);
  }
});

function getGuildMember(guild, userId) {
  return guild.members.cache.get(userId);
}

function isAdmin(member) {
  if (!member) return false;

  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    (config.adminRoleId && member.roles.cache.has(config.adminRoleId))
  );
}

function isStaff(member) {
  if (!member) return false;

  return (
    isAdmin(member) ||
    (config.staffRoleId && member.roles.cache.has(config.staffRoleId))
  );
}

function isMediator(member) {
  if (!member) return false;

  return (
    isStaff(member) ||
    (config.mediatorRoleId && member.roles.cache.has(config.mediatorRoleId))
  );
}

function formatMoney(value) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return "R$ 0,00";
  }

  return number.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function backButton(customId = "back_main") {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel("Voltar")
      .setEmoji("↩️")
      .setStyle(ButtonStyle.Secondary)
  );
}

function roleConfigComponents() {
  const firstRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("select_role_admin")
      .setPlaceholder("Selecione o cargo de administrador")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Administrador")
          .setDescription("Define o cargo responsável pela administração")
          .setValue("admin")
      )
  );

  const secondRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("select_role_mediator")
      .setPlaceholder("Selecione o cargo de mediador")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Mediador")
          .setDescription("Define o cargo responsável pelas mediações")
          .setValue("mediator")
      )
  );

  return [firstRow, secondRow, backButton()];
}

function mainEmbed() {
  return new EmbedBuilder()
    .setTitle("🎯 Sistema de Apostas")
    .setDescription(
      [
        "Bem-vindo ao sistema de apostas.",
        "",
        "Use os botões abaixo para configurar ou entrar nas filas.",
        "",
        "⚙️ **Configuração**",
        "Configure cargos, taxas, PIX e outros parâmetros.",
        "",
        "🎮 **Filas**",
        "Entre em uma fila disponível para encontrar um adversário."
      ].join("\n")
    )
    .setColor(0x5865f2);
}

function mainButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("open_config")
      .setLabel("Configuração")
      .setEmoji("⚙️")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("open_queue")
      .setLabel("Entrar na fila")
      .setEmoji("🎮")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("open_mediator")
      .setLabel("Mediador")
      .setEmoji("🛡️")
      .setStyle(ButtonStyle.Secondary)
  );
}

function configMainMenu() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("config_roles")
      .setLabel("Cargos")
      .setEmoji("👥")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("config_bet")
      .setLabel("Apostas")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("config_fee")
      .setLabel("Taxas")
      .setEmoji("💳")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("config_pix")
      .setLabel("PIX")
      .setEmoji("🔑")
      .setStyle(ButtonStyle.Primary)
  );
}

function queueMainMenu() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("select_channel_mobile")
      .setLabel("Celular")
      .setEmoji("📱")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("select_channel_emulator")
      .setLabel("Emulador")
      .setEmoji("💻")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("queue_mode")
      .setLabel("Modo")
      .setEmoji("🎮")
      .setStyle(ButtonStyle.Secondary)
  );
}

function getDefaultUserConfig(userId) {
  if (!userConfigurations.has(userId)) {
    userConfigurations.set(userId, {
      color: 0x5865f2,
      pix: "",
      fee: 0,
      mode: "mobile",
      channel: "mobile"
    });
  }

  return userConfigurations.get(userId);
}

function setUserConfig(userId, values = {}) {
  const current = getDefaultUserConfig(userId);

  userConfigurations.set(userId, {
    ...current,
    ...values
  });

  return userConfigurations.get(userId);
}

function getQueueKey(channel, mode = "mobile") {
  return `${channel}:${mode}`;
}

function getQueue(queueKey) {
  if (!queues.has(queueKey)) {
    queues.set(queueKey, {
      users: [],
      messageId: null,
      channelId: null,
      mode: "mobile",
      channelType: "mobile"
    });
  }

  return queues.get(queueKey);
}

function addUserToQueue(queueKey, userId) {
  const queue = getQueue(queueKey);

  if (!queue.users.includes(userId)) {
    queue.users.push(userId);
  }

  return queue;
}

function removeUserFromQueue(queueKey, userId) {
  const queue = getQueue(queueKey);

  queue.users = queue.users.filter((id) => id !== userId);

  return queue;
}

function findUserQueue(userId) {
  for (const [key, queue] of queues.entries()) {
    if (queue.users.includes(userId)) {
      return key;
    }
  }

  return null;
}

function createQueueEmbed(queueKey) {
  const queue = getQueue(queueKey);

  const players = queue.users.length
    ? queue.users.map((userId, index) => `${index + 1}. <@${userId}>`).join("\n")
    : "Nenhum jogador na fila.";

  return new EmbedBuilder()
    .setTitle("🎮 Fila de Apostas")
    .setDescription(
      [
        `**Modo:** ${queue.mode || "mobile"}`,
        "",
        "**Jogadores:**",
        players,
        "",
        `Total: **${queue.users.length}**`
      ].join("\n")
    )
    .setColor(0x57f287);
}

function queueButtons(queueKey) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`join_queue:${queueKey}`)
      .setLabel("Entrar na fila")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`leave_queue:${queueKey}`)
      .setLabel("Sair da fila")
      .setEmoji("➖")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`refresh_queue:${queueKey}`)
      .setLabel("Atualizar")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary)
  );
}

async function refreshQueueMessage(queueKey, clientInstance = client) {
  const queue = queues.get(queueKey);

  if (!queue || !queue.channelId || !queue.messageId) {
    return;
  }

  try {
    const channel = await clientInstance.channels.fetch(queue.channelId);

    if (!channel || !channel.isTextBased()) {
      return;
    }

    const message = await channel.messages.fetch(queue.messageId);

    await message.edit({
      embeds: [createQueueEmbed(queueKey)],
      components: [queueButtons(queueKey)]
    });
  } catch (error) {
    console.error(
      `Erro ao atualizar mensagem da fila ${queueKey}:`,
      error
    );
  }
}

async function createQueueMessage(channel, queueKey) {
  const queue = getQueue(queueKey);

  const message = await channel.send({
    embeds: [createQueueEmbed(queueKey)],
    components: [queueButtons(queueKey)]
  });

  queue.messageId = message.id;
  queue.channelId = channel.id;

  return message;
}

function createBetId() {
  return createId("bet");
}

function createBetEmbed(bet) {
  return new EmbedBuilder()
    .setTitle("💰 Aposta")
    .setDescription(
      [
        `**ID:** ${bet.id}`,
        `**Valor:** ${formatMoney(bet.amount)}`,
        `**Jogador 1:** <@${bet.player1}>`,
        `**Jogador 2:** <@${bet.player2}>`,
        "",
        `**Status:** ${bet.status || "aguardando"}`
      ].join("\n")
    )
    .setColor(0xf1c40f);
}

function betButtons(betId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bet_confirm:${betId}`)
      .setLabel("Confirmar")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`bet_cancel:${betId}`)
      .setLabel("Cancelar")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
  );
}

async function createBet(player1, player2, amount, guild) {
  const id = createBetId();

  const bet = {
    id,
    player1,
    player2,
    amount: Number(amount) || 0,
    guildId: guild.id,
    status: "aguardando",
    createdAt: Date.now(),
    channelId: null,
    messageId: null
  };

  bets.set(id, bet);

  return bet;
}

async function finishMatch(betId, winnerId = null) {
  const bet = bets.get(betId);

  if (!bet) {
    return false;
  }

  bet.status = winnerId ? "finalizada" : "cancelada";
  bet.winnerId = winnerId;
  bet.finishedAt = Date.now();

  activeMatches.delete(betId);

  return true;
}function getBet(betId) {
  return bets.get(betId) || null;
}

function setBet(betId, values = {}) {
  const bet = bets.get(betId);

  if (!bet) {
    return null;
  }

  Object.assign(bet, values);

  bets.set(betId, bet);

  return bet;
}

function removeBet(betId) {
  bets.delete(betId);
  activeMatches.delete(betId);
}

function getActiveMatch(userId) {
  for (const [betId, match] of activeMatches.entries()) {
    if (
      match.player1 === userId ||
      match.player2 === userId
    ) {
      return {
        betId,
        ...match
      };
    }
  }

  return null;
}

function createMatch(player1, player2, betId) {
  const match = {
    player1,
    player2,
    betId,
    createdAt: Date.now(),
    status: "active"
  };

  activeMatches.set(betId, match);

  return match;
}

function mediatorQueueKey(guildId) {
  return `mediator:${guildId}`;
}

function getMediatorQueue(guildId) {
  const key = mediatorQueueKey(guildId);

  if (!mediatorQueues.has(key)) {
    mediatorQueues.set(key, {
      users: [],
      messageId: null,
      channelId: null
    });
  }

  return mediatorQueues.get(key);
}

function addMediatorToQueue(guildId, userId) {
  const queue = getMediatorQueue(guildId);

  if (!queue.users.includes(userId)) {
    queue.users.push(userId);
  }

  return queue;
}

function removeMediatorFromQueue(guildId, userId) {
  const queue = getMediatorQueue(guildId);

  queue.users = queue.users.filter(
    (id) => id !== userId
  );

  return queue;
}

function isUserInMediatorQueue(guildId, userId) {
  const queue = getMediatorQueue(guildId);

  return queue.users.includes(userId);
}

function mediatorQueueEmbed(guildId) {
  const queue = getMediatorQueue(guildId);

  const users = queue.users.length
    ? queue.users
        .map((userId, index) => `${index + 1}. <@${userId}>`)
        .join("\n")
    : "Nenhum mediador na fila.";

  return new EmbedBuilder()
    .setTitle("🛡️ Fila de Mediadores")
    .setDescription(
      [
        "**Mediadores disponíveis:**",
        users,
        "",
        `Total: **${queue.users.length}**`
      ].join("\n")
    )
    .setColor(0x3498db);
}

function mediatorQueueButtons(guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mediator_join:${guildId}`)
      .setLabel("Entrar")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`mediator_leave:${guildId}`)
      .setLabel("Sair")
      .setEmoji("➖")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`mediator_refresh:${guildId}`)
      .setLabel("Atualizar")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary)
  );
}

function modeLabel(mode) {
  const modes = {
    mobile: "📱 Celular",
    emulator: "💻 Emulador",
    pc: "🖥️ PC",
    console: "🎮 Console"
  };

  return modes[mode] || mode || "Não definido";
}

function getQueueChoices() {
  return [
    {
      label: "Celular",
      description: "Fila para jogadores de celular",
      value: "mobile",
      emoji: "📱"
    },
    {
      label: "Emulador",
      description: "Fila para jogadores de emulador",
      value: "emulator",
      emoji: "💻"
    }
  ];
}

function queueComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("select_queue_mode")
        .setPlaceholder("Selecione o modo da fila")
        .addOptions(
          getQueueChoices().map((choice) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(choice.label)
              .setDescription(choice.description)
              .setValue(choice.value)
              .setEmoji(choice.emoji)
          )
        )
    ),
    backButton()
  ];
}

function queueEmbed() {
  return new EmbedBuilder()
    .setTitle("🎮 Escolha sua fila")
    .setDescription(
      [
        "Selecione abaixo o tipo de partida que deseja procurar.",
        "",
        "📱 **Celular**",
        "Jogadores utilizando dispositivos móveis.",
        "",
        "💻 **Emulador**",
        "Jogadores utilizando emuladores."
      ].join("\n")
    )
    .setColor(0x5865f2);
}

function filaModeComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("select_fila_mode")
        .setPlaceholder("Escolha o modo")
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("Celular")
            .setDescription("Criar/entrar em fila de celular")
            .setValue("mobile")
            .setEmoji("📱"),

          new StringSelectMenuOptionBuilder()
            .setLabel("Emulador")
            .setDescription("Criar/entrar em fila de emulador")
            .setValue("emulator")
            .setEmoji("💻")
        )
    )
  ];
}

function appearanceComponents(userId) {
  const userConfig = getDefaultUserConfig(userId);

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("appearance_color")
        .setLabel("Alterar cor")
        .setEmoji("🎨")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("appearance_reset")
        .setLabel("Restaurar")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary)
    ),
    backButton()
  ];
}

function betConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("bet_amount")
        .setLabel("Valor da aposta")
        .setEmoji("💰")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("bet_category")
        .setLabel("Categoria")
        .setEmoji("📁")
        .setStyle(ButtonStyle.Secondary)
    ),
    backButton()
  ];
}

function feeComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("fee_config")
        .setLabel("Configurar taxa")
        .setEmoji("💳")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("fee_reset")
        .setLabel("Zerar taxa")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary)
    ),
    backButton()
  ];
}

function pixComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("pix_config")
        .setLabel("Configurar PIX")
        .setEmoji("🔑")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("pix_remove")
        .setLabel("Remover PIX")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger)
    ),
    backButton()
  ];
}

function mediatorConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mediator_join_queue")
        .setLabel("Entrar na fila")
        .setEmoji("🛡️")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("mediator_leave_queue")
        .setLabel("Sair da fila")
        .setEmoji("🚪")
        .setStyle(ButtonStyle.Danger)
    ),
    backButton()
  ];
}

function configButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_roles")
        .setLabel("Cargos")
        .setEmoji("👥")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_bet")
        .setLabel("Apostas")
        .setEmoji("💰")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_fee")
        .setLabel("Taxas")
        .setEmoji("💳")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_pix")
        .setLabel("PIX")
        .setEmoji("🔑")
        .setStyle(ButtonStyle.Primary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_appearance")
        .setLabel("Aparência")
        .setEmoji("🎨")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_channel")
        .setLabel("Canal")
        .setEmoji("📢")
        .setStyle(ButtonStyle.Secondary)
    ),

    backButton()
  ];
}

function createConfigEmbed(userId) {
  const userConfig = getDefaultUserConfig(userId);

  return new EmbedBuilder()
    .setTitle("⚙️ Configuração")
    .setDescription(
      [
        "Configure as opções do sistema.",
        "",
        `🎨 **Cor:** #${Number(userConfig.color)
          .toString(16)
          .padStart(6, "0")}`,
        `💳 **Taxa:** ${userConfig.fee}%`,
        `🔑 **PIX:** ${
          userConfig.pix ? "Configurado" : "Não configurado"
        }`,
        `🎮 **Modo:** ${modeLabel(userConfig.mode)}`
      ].join("\n")
    )
    .setColor(userConfig.color || 0x5865f2);
}

function createAvatarModal() {
  return new ModalBuilder()
    .setCustomId("avatar_modal")
    .setTitle("Alterar avatar");
}

function createColorModal() {
  const modal = new ModalBuilder()
    .setCustomId("color_modal")
    .setTitle("Alterar cor");

  const input = new TextInputBuilder()
    .setCustomId("color")
    .setLabel("Cor hexadecimal")
    .setPlaceholder("#5865F2")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(7);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  return modal;
}

function createPixModal() {
  const modal = new ModalBuilder()
    .setCustomId("pix_modal")
    .setTitle("Configurar PIX");

  const input = new TextInputBuilder()
    .setCustomId("pix")
    .setLabel("Chave PIX")
    .setPlaceholder("Digite sua chave PIX")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(200);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  return modal;
}

function createFeeModal() {
  const modal = new ModalBuilder()
    .setCustomId("fee_modal")
    .setTitle("Configurar taxa");

  const input = new TextInputBuilder()
    .setCustomId("fee")
    .setLabel("Taxa em porcentagem")
    .setPlaceholder("Exemplo: 5")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(5);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  return modal;
}

function createBetAmountModal() {
  const modal = new ModalBuilder()
    .setCustomId("bet_amount_modal")
    .setTitle("Valor da aposta");

  const input = new TextInputBuilder()
    .setCustomId("amount")
    .setLabel("Valor")
    .setPlaceholder("Exemplo: 10,00")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  return modal;
}

function parseMoney(value) {
  if (typeof value !== "string") {
    return Number(value) || 0;
  }

  let normalized = value
    .replace(/\s/g, "")
    .replace("R$", "")
    .trim();

  if (normalized.includes(",")) {
    normalized = normalized
      .replace(/\./g, "")
      .replace(",", ".");
  }

  const result = Number(normalized);

  return Number.isFinite(result) ? result : 0;
}

function sanitizeChannelName(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

async function createPrivateBetChannel(guild, bet) {
  if (!guild || !bet) {
    return null;
  }

  const category = config.betsCategoryId
    ? guild.channels.cache.get(config.betsCategoryId)
    : null;

  const channelName = sanitizeChannelName(
    `aposta-${bet.player1}-${bet.player2}`
  ) || `aposta-${bet.id}`;

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: bet.player1,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    },
    {
      id: bet.player2,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    }
  ];

  if (config.mediatorRoleId) {
    overwrites.push({
      id: config.mediatorRoleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    });
  }

  if (config.staffRoleId) {
    overwrites.push({
      id: config.staffRoleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    });
  }

  try {
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category?.id || undefined,
      permissionOverwrites: overwrites
    });

    bet.channelId = channel.id;

    bets.set(bet.id, bet);

    return channel;
  } catch (error) {
    console.error("Erro ao criar canal privado da aposta:", error);
    return null;
  }
}async function sendSafeReply(interaction, content, options = {}) {
  if (!interaction) {
    return null;
  }

  const payload =
    typeof content === "string"
      ? {
          content,
          ...options
        }
      : {
          ...content,
          ...options
        };

  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.followUp({
        ...payload,
        ephemeral: payload.ephemeral ?? true
      });
    }

    return await interaction.reply({
      ...payload,
      ephemeral: payload.ephemeral ?? true
    });
  } catch (error) {
    console.error("Erro ao responder interação:", error);
    return null;
  }
}

async function sendLog(guild, message) {
  if (!guild || !config.logChannelId) {
    return;
  }

  try {
    const channel = await guild.channels.fetch(config.logChannelId);

    if (!channel || !channel.isTextBased()) {
      return;
    }

    await channel.send({
      content: String(message).slice(0, 1900)
    });
  } catch (error) {
    console.error("Erro ao enviar log:", error);
  }
}

async function joinQueue(interaction, queueKey) {
  const userId = interaction.user.id;

  const existingQueue = findUserQueue(userId);

  if (existingQueue && existingQueue !== queueKey) {
    await sendSafeReply(
      interaction,
      "❌ Você já está em outra fila. Saia dela antes de entrar nesta."
    );

    return false;
  }

  const queue = addUserToQueue(queueKey, userId);

  await refreshQueueMessage(queueKey);

  await sendSafeReply(
    interaction,
    `✅ Você entrou na fila **${modeLabel(queue.mode)}**.`
  );

  if (queue.users.length >= 2) {
    await createMatchFromQueue(interaction.guild, queueKey);
  }

  return true;
}

async function leaveQueue(interaction, queueKey) {
  const userId = interaction.user.id;
  const queue = queues.get(queueKey);

  if (!queue || !queue.users.includes(userId)) {
    await sendSafeReply(
      interaction,
      "❌ Você não está nessa fila."
    );

    return false;
  }

  removeUserFromQueue(queueKey, userId);

  await refreshQueueMessage(queueKey);

  await sendSafeReply(
    interaction,
    "✅ Você saiu da fila."
  );

  return true;
}

async function createMatchFromQueue(guild, queueKey) {
  const queue = queues.get(queueKey);

  if (!queue || queue.users.length < 2) {
    return null;
  }

  const player1 = queue.users.shift();
  const player2 = queue.users.shift();

  const bet = await createBet(
    player1,
    player2,
    0,
    guild
  );

  bet.mode = queue.mode;
  bet.channelType = queue.channelType;

  const match = createMatch(
    player1,
    player2,
    bet.id
  );

  match.mode = queue.mode;

  const channel = await createPrivateBetChannel(
    guild,
    bet
  );

  if (channel) {
    await sendMatchMessage(channel, bet);
  }

  await refreshQueueMessage(queueKey);

  await sendLog(
    guild,
    `🎮 Nova partida criada: ${bet.id} | <@${player1}> x <@${player2}>`
  );

  return bet;
}

async function sendMatchMessage(channel, bet) {
  if (!channel || !bet) {
    return null;
  }

  const message = await channel.send({
    embeds: [createBetEmbed(bet)],
    components: [betButtons(bet.id)]
  });

  bet.messageId = message.id;

  bets.set(bet.id, bet);

  return message;
}

async function refreshBetMessage(betId) {
  const bet = bets.get(betId);

  if (!bet || !bet.channelId || !bet.messageId) {
    return;
  }

  try {
    const channel = await client.channels.fetch(
      bet.channelId
    );

    if (!channel || !channel.isTextBased()) {
      return;
    }

    const message = await channel.messages.fetch(
      bet.messageId
    );

    await message.edit({
      embeds: [createBetEmbed(bet)],
      components: [betButtons(bet.id)]
    });
  } catch (error) {
    console.error(
      `Erro ao atualizar aposta ${betId}:`,
      error
    );
  }
}

async function handleBetConfirm(interaction, betId) {
  const bet = bets.get(betId);

  if (!bet) {
    await sendSafeReply(
      interaction,
      "❌ Essa aposta não existe ou já foi encerrada."
    );

    return;
  }

  const userId = interaction.user.id;

  if (
    userId !== bet.player1 &&
    userId !== bet.player2 &&
    !isMediator(interaction.member)
  ) {
    await sendSafeReply(
      interaction,
      "❌ Você não participa desta aposta."
    );

    return;
  }

  if (bet.status === "finalizada") {
    await sendSafeReply(
      interaction,
      "⚠️ Esta aposta já foi finalizada."
    );

    return;
  }

  if (bet.status === "cancelada") {
    await sendSafeReply(
      interaction,
      "⚠️ Esta aposta foi cancelada."
    );

    return;
  }

  if (!bet.confirmations) {
    bet.confirmations = [];
  }

  if (!bet.confirmations.includes(userId)) {
    bet.confirmations.push(userId);
  }

  if (
    bet.confirmations.includes(bet.player1) &&
    bet.confirmations.includes(bet.player2)
  ) {
    bet.status = "confirmada";
  }

  bets.set(bet.id, bet);

  await refreshBetMessage(bet.id);

  await sendSafeReply(
    interaction,
    bet.status === "confirmada"
      ? "✅ Os dois jogadores confirmaram a aposta."
      : "✅ Sua confirmação foi registrada."
  );
}

async function handleBetCancel(interaction, betId) {
  const bet = bets.get(betId);

  if (!bet) {
    await sendSafeReply(
      interaction,
      "❌ Essa aposta não existe."
    );

    return;
  }

  const userId = interaction.user.id;

  if (
    userId !== bet.player1 &&
    userId !== bet.player2 &&
    !isMediator(interaction.member)
  ) {
    await sendSafeReply(
      interaction,
      "❌ Você não pode cancelar esta aposta."
    );

    return;
  }

  await finishMatch(bet.id);

  await refreshBetMessage(bet.id);

  await sendSafeReply(
    interaction,
    "✅ A aposta foi cancelada."
  );

  await sendLog(
    interaction.guild,
    `❌ Aposta cancelada: ${bet.id} por <@${userId}>`
  );
}

async function handleMatchWinner(interaction, betId) {
  const bet = bets.get(betId);

  if (!bet) {
    await sendSafeReply(
      interaction,
      "❌ Aposta não encontrada."
    );

    return;
  }

  const userId = interaction.user.id;

  if (!isMediator(interaction.member)) {
    await sendSafeReply(
      interaction,
      "❌ Apenas um mediador pode definir o vencedor."
    );

    return;
  }

  if (
    userId !== bet.player1 &&
    userId !== bet.player2
  ) {
    await sendSafeReply(
      interaction,
      "❌ Jogador inválido."
    );

    return;
  }

  await finishMatch(
    bet.id,
    userId
  );

  await refreshBetMessage(bet.id);

  await sendSafeReply(
    interaction,
    `🏆 Vencedor definido: <@${userId}>`
  );
}

function createMediatorEmbed(guildId) {
  const queue = getMediatorQueue(guildId);

  return new EmbedBuilder()
    .setTitle("🛡️ Central de Mediação")
    .setDescription(
      [
        "Sistema de gerenciamento de mediadores.",
        "",
        `Mediadores na fila: **${queue.users.length}**`,
        "",
        queue.users.length
          ? queue.users
              .map(
                (userId, index) =>
                  `${index + 1}. <@${userId}>`
              )
              .join("\n")
          : "Nenhum mediador disponível."
      ].join("\n")
    )
    .setColor(0x3498db);
}

async function handleMediatorQueueButton(
  interaction,
  action
) {
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  if (!isMediator(interaction.member)) {
    await sendSafeReply(
      interaction,
      "❌ Você não possui permissão de mediador."
    );

    return;
  }

  if (action === "join") {
    addMediatorToQueue(
      guildId,
      userId
    );

    await sendSafeReply(
      interaction,
      "✅ Você entrou na fila de mediadores."
    );
  }

  if (action === "leave") {
    removeMediatorFromQueue(
      guildId,
      userId
    );

    await sendSafeReply(
      interaction,
      "✅ Você saiu da fila de mediadores."
    );
  }

  if (action === "refresh") {
    await sendSafeReply(
      interaction,
      "🔄 Fila atualizada."
    );
  }

  await refreshMediatorQueueMessage(
    guildId
  );
}

async function refreshMediatorQueueMessage(
  guildId
) {
  const queue = getMediatorQueue(guildId);

  if (
    !queue.channelId ||
    !queue.messageId
  ) {
    return;
  }

  try {
    const channel =
      await client.channels.fetch(
        queue.channelId
      );

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      return;
    }

    const message =
      await channel.messages.fetch(
        queue.messageId
      );

    await message.edit({
      embeds: [
        mediatorQueueEmbed(guildId)
      ],
      components: [
        mediatorQueueButtons(guildId)
      ]
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar fila de mediadores:",
      error
    );
  }
}

async function createMediatorQueueMessage(
  channel
) {
  if (!channel) {
    return null;
  }

  const guildId = channel.guild.id;
  const queue = getMediatorQueue(
    guildId
  );

  const message =
    await channel.send({
      embeds: [
        mediatorQueueEmbed(guildId)
      ],
      components: [
        mediatorQueueButtons(guildId)
      ]
    });

  queue.channelId = channel.id;
  queue.messageId = message.id;

  return message;
}

async function assignMediatorToBet(
  interaction,
  betId
) {
  const bet = bets.get(betId);

  if (!bet) {
    await sendSafeReply(
      interaction,
      "❌ Aposta não encontrada."
    );

    return;
  }

  if (!isMediator(interaction.member)) {
    await sendSafeReply(
      interaction,
      "❌ Você não possui permissão de mediador."
    );

    return;
  }

  bet.mediatorId =
    interaction.user.id;

  bet.status =
    bet.status === "aguardando"
      ? "em_mediacao"
      : bet.status;

  bets.set(bet.id, bet);

  await refreshBetMessage(
    bet.id
  );

  await sendSafeReply(
    interaction,
    "🛡️ Você foi definido como mediador desta aposta."
  );

  await sendLog(
    interaction.guild,
    `🛡️ Mediador <@${interaction.user.id}> assumiu a aposta ${bet.id}.`
  );
}

function mediatorButtons(betId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `mediator_assign:${betId}`
      )
      .setLabel("Assumir mediação")
      .setEmoji("🛡️")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(
        `mediator_finish:${betId}`
      )
      .setLabel("Finalizar")
      .setEmoji("🏁")
      .setStyle(ButtonStyle.Success)
  );
}

async function showMediatorPanel(interaction) {
  if (!isMediator(interaction.member)) {
    await sendSafeReply(
      interaction,
      "❌ Você não possui permissão de mediador."
    );

    return;
  }

  const embed =
    createMediatorEmbed(
      interaction.guild.id
    );

  await sendSafeReply(
    interaction,
    {
      embeds: [embed],
      components: [
        ...mediatorConfigComponents()
      ]
    }
  );
}

async function openConfig(interaction) {
  if (!isAdmin(interaction.member)) {
    await sendSafeReply(
      interaction,
      "❌ Apenas administradores podem acessar a configuração."
    );

    return;
  }

  await sendSafeReply(
    interaction,
    {
      embeds: [
        createConfigEmbed(
          interaction.user.id
        )
      ],
      components: configButtons()
    }
  );
}

async function showRoleConfig(interaction) {
  if (!isAdmin(interaction.member)) {
    await sendSafeReply(
      interaction,
      "❌ Você não possui permissão para configurar cargos."
    );

    return;
  }

  await sendSafeReply(
    interaction,
    {
      embeds: [
        new EmbedBuilder()
          .setTitle("👥 Configuração de cargos")
          .setDescription(
            "Selecione abaixo o tipo de cargo que deseja configurar."
          )
          .setColor(0x5865f2)
      ],
      components: roleConfigComponents()
    }
  );
}

async function showBetConfig(interaction) {
  if (!isAdmin(interaction.member)) {
    await sendSafeReply(
      interaction,
      "❌ Sem permissão."
    );

    return;
  }

  const userConfig =
    getDefaultUserConfig(
      interaction.user.id
    );

  await sendSafeReply(
    interaction,
    {
      embeds: [
        new EmbedBuilder()
          .setTitle("💰 Configuração das apostas")
          .setDescription(
            [
              `Valor atual: **${formatMoney(
                userConfig.betAmount || 0
              )}**`,
              "",
              "Configure o valor padrão e a categoria das apostas."
            ].join("\n")
          )
          .setColor(
            userConfig.color
          )
      ],
      components:
        betConfigComponents()
    }
  );
}

async function showFeeConfig(interaction) {
  if (!isAdmin(interaction.member)) {
    await sendSafeReply(
      interaction,
      "❌ Sem permissão."
    );

    return;
  }

  const userConfig =
    getDefaultUserConfig(
      interaction.user.id
    );

  await sendSafeReply(
    interaction,
    {
      embeds: [
        new EmbedBuilder()
          .setTitle("💳 Configuração de taxas")
          .setDescription(
            `Taxa atual: **${userConfig.fee}%**`
          )
          .setColor(
            userConfig.color
          )
      ],
      components:
        feeComponents()
    }
  );
}

async function showPixConfig(interaction) {
  if (!isAdmin(interaction.member)) {
    await sendSafeReply(
      interaction,
      "❌ Sem permissão."
    );

    return;
  }

  const userConfig =
    getDefaultUserConfig(
      interaction.user.id
    );

  await sendSafeReply(
    interaction,
    {
      embeds: [
        new EmbedBuilder()
          .setTitle("🔑 Configuração do PIX")
          .setDescription(
            userConfig.pix
              ? `Chave atual: \`${userConfig.pix}\``
              : "Nenhuma chave PIX configurada."
          )
          .setColor(
            userConfig.color
          )
      ],
      components:
        pixComponents()
    }
  );
}async function handleRoleSelect(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    return;
  }

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    interaction.customId ===
    "select_mediator_role"
  ) {
    config.mediatorRoleId =
      interaction.values[0];

    saveDatabase();

    await interaction.update({
      embeds: [
        configMainEmbed(
          guild
        ),
      ],
      components:
        configButtons(),
    });

    return;
  }

  if (
    interaction.customId ===
    "select_analyst_role"
  ) {
    config.analystRoleId =
      interaction.values[0];

    saveDatabase();

    await interaction.update({
      embeds: [
        configMainEmbed(
          guild
        ),
      ],
      components:
        configButtons(),
    });

    return;
  }
}

async function handleChannelSelect(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    return;
  }

  const config =
    getGuildConfig(
      guild.id
    );

  const channelId =
    interaction.values[0];

  if (
    interaction.customId ===
    "select_channel_mobile"
  ) {
    config.analysisChannelMobile =
      channelId;
  }

  if (
    interaction.customId ===
    "select_channel_emulator"
  ) {
    config.analysisChannelEmulator =
      channelId;
  }

  if (
    interaction.customId ===
    "select_mediator_channel"
  ) {
    config.mediatorQueueChannelId =
      channelId;
  }

  saveDatabase();

  await interaction.update({
    embeds: [
      configMainEmbed(
        guild
      ),
    ],
    components:
      configButtons(),
  });
}

async function createBetMessage(
  channel,
  guild,
  format,
  mode,
  value,
  type,
  players
) {
  const config =
    getGuildConfig(
      guild.id
    );

  const playerList =
    players
      .map(
        (id) =>
          `<@${id}>`
      )
      .join("\n");

  const embed =
    createEmbed(
      guild.id,
      "🎮 APOSTA",
      [
        `**Formato:** ${format}`,
        `**Modo:** ${mode}`,
        `**Valor:** ${formatMoney(
          value
        )}`,
        `**Tipo:** ${
          type === "ice_infinite"
            ? "♾️ Gelo Infinito"
            : "🧊 Gelo Normal"
        }`,
        "",
        "**Jogadores:**",
        playerList,
        "",
        "Aguardando confirmação dos jogadores.",
      ].join("\n")
    );

  const row =
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `bet_confirm|${channel.id}`
        )
        .setLabel(
          "Confirmar"
        )
        .setStyle(
          ButtonStyle.Success
        ),
      new ButtonBuilder()
        .setCustomId(
          `bet_cancel|${channel.id}`
        )
        .setLabel(
          "Cancelar"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    );

  return channel.send({
    embeds: [
      embed,
    ],
    components: [
      row,
    ],
  });
}

async function closeBetChannel(
  channel,
  reason = "Aposta encerrada."
) {
  if (!channel) {
    return;
  }

  try {
    await channel.send({
      embeds: [
        createEmbed(
          channel.guild.id,
          "🔒 APOSTA ENCERRADA",
          reason
        ),
      ],
    });

    setTimeout(
      async () => {
        try {
          await channel.delete(
            "Aposta encerrada"
          );
        } catch (
          error
        ) {
          console.error(
            "Erro ao excluir canal da aposta:",
            error
          );
        }
      },
      5000
    );
  } catch (
    error
  ) {
    console.error(
      "Erro ao encerrar aposta:",
      error
    );
  }
}

async function handleBetButton(
  interaction
) {
  const parts =
    interaction.customId.split(
      "|"
    );

  const action =
    parts[0];

  const channelId =
    parts[1];

  if (
    !channelId
  ) {
    return;
  }

  const channel =
    interaction.guild.channels.cache.get(
      channelId
    );

  if (!channel) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Canal da aposta não encontrado.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    action === "bet_cancel"
  ) {
    const member =
      interaction.member;

    if (
      !isAdministrator(
        member
      ) &&
      !hasMediatorRole(
        member,
        interaction.guild.id
      ) &&
      !channel.permissionOverwrites.cache.has(
        interaction.user.id
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Você não pode cancelar esta aposta.",
          ephemeral: true,
        }
      );

      return;
    }

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Aposta cancelada.",
        ephemeral: true,
      }
    );

    await closeBetChannel(
      channel,
      `A aposta foi cancelada por <@${interaction.user.id}>.`
    );

    return;
  }

  if (
    action === "bet_confirm"
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Sua aposta foi confirmada.",
        ephemeral: true,
      }
    );

    return;
  }
}async function handleMatchButton(
  interaction
) {
  const parts =
    interaction.customId.split(
      "|"
    );

  const action =
    parts[0];

  const matchId =
    parts[1];

  if (!matchId) {
    return;
  }

  const match =
    getActiveMatch(
      matchId
    );

  if (!match) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa partida não existe mais.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    action ===
    "match_winner"
  ) {
    const winnerId =
      parts[2];

    if (
      !winnerId
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Vencedor não informado.",
          ephemeral: true,
        }
      );

      return;
    }

    await handleMatchWinner(
      interaction,
      matchId,
      winnerId
    );

    return;
  }

  if (
    action ===
    "match_cancel"
  ) {
    const member =
      interaction.member;

    if (
      !isAdministrator(
        member
      ) &&
      !isMediator(
        member
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Você não tem permissão para cancelar esta partida.",
          ephemeral: true,
        }
      );

      return;
    }

    match.status =
      "cancelled";

    setBet(
      match.betId,
      {
        status:
          "cancelled",
      }
    );

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Partida cancelada.",
        ephemeral: true,
      }
    );

    if (
      interaction.channel
    ) {
      await closeBetChannel(
        interaction.channel,
        `A partida foi cancelada por <@${interaction.user.id}>.`
      );
    }

    return;
  }
}

async function handleConfigButton(
  interaction
) {
  const action =
    interaction.customId;

  switch (
    action
  ) {
    case "config_main":
      await openConfig(
        interaction
      );
      break;

    case "config_roles":
      await showRoleConfig(
        interaction
      );
      break;

    case "config_bets":
      await showBetConfig(
        interaction
      );
      break;

    case "config_fee":
      await showFeeConfig(
        interaction
      );
      break;

    case "config_pix":
      await showPixConfig(
        interaction
      );
      break;

    case "config_mediator":
      await showMediatorConfig(
        interaction
      );
      break;

    case "config_back":
      await openConfig(
        interaction
      );
      break;

    default:
      break;
  }
}

async function handleQueueButton(
  interaction
) {
  const action =
    interaction.customId;

  if (
    action ===
    "queue_join"
  ) {
    await joinQueue(
      interaction
    );

    return;
  }

  if (
    action ===
    "queue_leave"
  ) {
    await leaveQueue(
      interaction
    );

    return;
  }

  if (
    action ===
    "queue_refresh"
  ) {
    await interaction.deferUpdate();

    await refreshQueueMessage(
      interaction.guild
    );

    return;
  }
}

async function handleMainButton(
  interaction
) {
  const action =
    interaction.customId;

  switch (
    action
  ) {
    case "main_queue":
      await showQueuePanel(
        interaction
      );
      break;

    case "main_bets":
      await showBetPanel(
        interaction
      );
      break;

    case "main_config":
      await openConfig(
        interaction
      );
      break;

    case "main_mediator":
      await showMediatorPanel(
        interaction
      );
      break;

    case "main_back":
      await interaction.update({
        embeds: [
          mainEmbed(
            interaction.guild
          ),
        ],
        components:
          mainButtons(),
      });
      break;

    default:
      break;
  }
}

async function showQueuePanel(
  interaction
) {
  await sendSafeReply(
    interaction,
    {
      embeds: [
        queueEmbed(
          interaction.guild
        ),
      ],
      components:
        queueButtons(),
      ephemeral: true,
    }
  );
}

async function showBetPanel(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  const bets =
    Array.from(
      betsMap.values()
    ).filter(
      (bet) =>
        bet.guildId ===
          guild.id &&
        bet.status ===
          "pending"
    );

  if (
    bets.length === 0
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "📭 Não existem apostas pendentes no momento.",
        ephemeral: true,
      }
    );

    return;
  }

  const description =
    bets
      .slice(
        0,
        10
      )
      .map(
        (bet) =>
          `🎮 **${bet.id}** — ${formatMoney(
            bet.amount
          )} — ${
            bet.status
          }`
      )
      .join("\n");

  await sendSafeReply(
    interaction,
    {
      embeds: [
        createEmbed(
          guild.id,
          "🎮 Apostas",
          description
        ),
      ],
      ephemeral: true,
    }
  );
}

async function handleInteraction(
  interaction
) {
  try {
    if (
      interaction.isButton()
    ) {
      const id =
        interaction.customId;

      if (
        id.startsWith(
          "queue_"
        )
      ) {
        await handleQueueButton(
          interaction
        );

        return;
      }

      if (
        id.startsWith(
          "bet_"
        )
      ) {
        await handleBetButton(
          interaction
        );

        return;
      }

      if (
        id.startsWith(
          "match_"
        )
      ) {
        await handleMatchButton(
          interaction
        );

        return;
      }

      if (
        id.startsWith(
          "config_"
        )
      ) {
        await handleConfigButton(
          interaction
        );

        return;
      }

      if (
        id.startsWith(
          "main_"
        )
      ) {
        await handleMainButton(
          interaction
        );

        return;
      }

      if (
        id.startsWith(
          "mediator_"
        )
      ) {
        await handleMediatorQueueButton(
          interaction
        );

        return;
      }
    }

    if (
      interaction.isStringSelectMenu()
    ) {
      if (
        interaction.customId.startsWith(
          "select_"
        )
      ) {
        await handleChannelSelect(
          interaction
        );

        return;
      }

      if (
        interaction.customId ===
          "select_mediator_role" ||
        interaction.customId ===
          "select_analyst_role"
      ) {
        await handleRoleSelect(
          interaction
        );

        return;
      }

      if (
        interaction.customId.startsWith(
          "queue_select"
        )
      ) {
        await handleQueueSelect(
          interaction
        );

        return;
      }
    }

    if (
      interaction.isModalSubmit()
    ) {
      await handleModalSubmit(
        interaction
      );

      return;
    }
  } catch (
    error
  ) {
    console.error(
      "Erro ao processar interação:",
      error
    );

    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Ocorreu um erro ao processar esta ação.",
        ephemeral: true,
      }
    );
  }
}async function handleQueueSelect(
  interaction
) {
  const value =
    interaction.values[0];

  if (!value) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Fila inválida.",
        ephemeral: true,
      }
    );

    return;
  }

  const parts =
    value.split("|");

  const mode =
    parts[0];

  const format =
    parts[1];

  if (
    !mode ||
    !format
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Não foi possível identificar a fila.",
        ephemeral: true,
      }
    );

    return;
  }

  await joinQueue(
    interaction,
    {
      mode,
      format,
    }
  );
}

async function handleModalSubmit(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id ===
    "modal_avatar"
  ) {
    await handleAvatarModal(
      interaction
    );

    return;
  }

  if (
    id ===
    "modal_color"
  ) {
    await handleColorModal(
      interaction
    );

    return;
  }

  if (
    id ===
    "modal_pix"
  ) {
    await handlePixModal(
      interaction
    );

    return;
  }

  if (
    id ===
    "modal_fee"
  ) {
    await handleFeeModal(
      interaction
    );

    return;
  }

  if (
    id ===
    "modal_bet_amount"
  ) {
    await handleBetAmountModal(
      interaction
    );

    return;
  }
}

async function handleAvatarModal(
  interaction
) {
  const avatar =
    interaction.fields.getTextInputValue(
      "avatar_url"
    );

  if (
    !avatar.startsWith(
      "http"
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Informe uma URL válida.",
        ephemeral: true,
      }
    );

    return;
  }

  const userConfig =
    getDefaultUserConfig(
      interaction.user.id
    );

  userConfig.avatar =
    avatar;

  saveDatabase();

  await sendSafeReply(
    interaction,
    {
      content:
        "✅ Avatar atualizado com sucesso.",
      ephemeral: true,
    }
  );
}

async function handleColorModal(
  interaction
) {
  const color =
    interaction.fields.getTextInputValue(
      "embed_color"
    );

  if (
    !/^#?[0-9A-Fa-f]{6}$/.test(
      color
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Cor inválida. Use o formato `#FFFFFF`.",
        ephemeral: true,
      }
    );

    return;
  }

  const normalizedColor =
    color.startsWith("#")
      ? color
      : `#${color}`;

  const userConfig =
    getDefaultUserConfig(
      interaction.user.id
    );

  userConfig.color =
    normalizedColor;

  saveDatabase();

  await sendSafeReply(
    interaction,
    {
      content:
        "✅ Cor atualizada com sucesso.",
      ephemeral: true,
    }
  );
}

async function handlePixModal(
  interaction
) {
  const pix =
    interaction.fields.getTextInputValue(
      "pix_key"
    );

  if (
    !pix ||
    !pix.trim()
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Informe uma chave PIX.",
        ephemeral: true,
      }
    );

    return;
  }

  const userConfig =
    getDefaultUserConfig(
      interaction.user.id
    );

  userConfig.pix =
    pix.trim();

  saveDatabase();

  await sendSafeReply(
    interaction,
    {
      content:
        "✅ Chave PIX atualizada com sucesso.",
      ephemeral: true,
    }
  );
}

async function handleFeeModal(
  interaction
) {
  const value =
    interaction.fields.getTextInputValue(
      "fee_value"
    );

  const fee =
    parseMoney(
      value
    );

  if (
    Number.isNaN(fee) ||
    fee < 0
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Valor de taxa inválido.",
        ephemeral: true,
      }
    );

    return;
  }

  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  const config =
    getGuildConfig(
      guild.id
    );

  config.fee =
    fee;

  saveDatabase();

  await sendSafeReply(
    interaction,
    {
      content:
        `✅ Taxa atualizada para ${formatMoney(
          fee
        )}.`,
      ephemeral: true,
    }
  );
}

async function handleBetAmountModal(
  interaction
) {
  const value =
    interaction.fields.getTextInputValue(
      "bet_amount"
    );

  const amount =
    parseMoney(
      value
    );

  if (
    Number.isNaN(amount) ||
    amount <= 0
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Valor da aposta inválido.",
        ephemeral: true,
      }
    );

    return;
  }

  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  const userId =
    interaction.user.id;

  const pending =
    pendingBetConfigurations.get(
      userId
    );

  if (!pending) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Nenhuma configuração de aposta pendente.",
        ephemeral: true,
      }
    );

    return;
  }

  pending.amount =
    amount;

  pendingBetConfigurations.set(
    userId,
    pending
  );

  await createBet(
    interaction,
    pending
  );
}

async function showMediatorConfig(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Sem permissão.",
        ephemeral: true,
      }
    );

    return;
  }

  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  const config =
    getGuildConfig(
      guild.id
    );

  const channel =
    config.mediatorQueueChannelId
      ? `<#${config.mediatorQueueChannelId}>`
      : "Não configurado";

  const role =
    config.mediatorRoleId
      ? `<@&${config.mediatorRoleId}>`
      : "Não configurado";

  await sendSafeReply(
    interaction,
    {
      embeds: [
        createEmbed(
          guild.id,
          "🧑‍⚖️ Configuração dos Mediadores",
          [
            `**Cargo:** ${role}`,
            `**Canal da fila:** ${channel}`,
            "",
            "Configure o cargo e o canal utilizados pelos mediadores."
          ].join("\n")
        ),
      ],
      components:
        mediatorConfigComponents(),
      ephemeral: true,
    }
  );
}

async function handleMediatorConfigButton(
  interaction
) {
  const id =
    interaction.customId;

  if (
    !isAdmin(
      interaction.member
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Sem permissão.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    id ===
    "mediator_config_back"
  ) {
    await openConfig(
      interaction
    );

    return;
  }

  if (
    id ===
    "mediator_config_refresh"
  ) {
    await showMediatorConfig(
      interaction
    );

    return;
  }
}

async function handleMediatorButton(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id ===
    "mediator_queue"
  ) {
    await showMediatorPanel(
      interaction
    );

    return;
  }

  if (
    id.startsWith(
      "mediator_accept|"
    )
  ) {
    await assignMediatorToBet(
      interaction
    );

    return;
  }

  if (
    id ===
    "mediator_back"
  ) {
    await interaction.update({
      embeds: [
        mainEmbed(
          interaction.guild
        ),
      ],
      components:
        mainButtons(),
    });

    return;
  }
}

client.on(
  "interactionCreate",
  async (
    interaction
  ) => {
    try {
      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "mediator_config_"
        )
      ) {
        await handleMediatorConfigButton(
          interaction
        );

        return;
      }

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "mediator_"
        )
      ) {
        await handleMediatorButton(
          interaction
        );

        return;
      }

      await handleInteraction(
        interaction
      );
    } catch (
      error
    ) {
      console.error(
        "Erro geral na interação:",
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction.reply({
          content:
            "❌ Ocorreu um erro inesperado.",
          ephemeral: true,
        });
      }
    }
  }
);async function initializeGuild(
  guild
) {
  if (!guild) {
    return;
  }

  getGuildConfig(
    guild.id
  );

  try {
    const me =
      guild.members.me ||
      await guild.members.fetch(
        client.user.id
      );

    if (
      !me.permissions.has(
        PermissionsBitField.Flags.ManageChannels
      )
    ) {
      console.warn(
        `⚠️ Sem permissão para gerenciar canais em ${guild.name}.`
      );
    }
  } catch (
    error
  ) {
    console.error(
      `Erro ao inicializar servidor ${guild.id}:`,
      error
    );
  }
}

async function initializeAllGuilds() {
  for (
    const guild of client.guilds.cache.values()
  ) {
    await initializeGuild(
      guild
    );
  }
}

async function createMainMessage(
  guild
) {
  if (!guild) {
    return null;
  }

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !config.mainChannelId
  ) {
    return null;
  }

  const channel =
    guild.channels.cache.get(
      config.mainChannelId
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    return null;
  }

  try {
    const message =
      await channel.send({
        embeds: [
          mainEmbed(
            guild
          ),
        ],
        components:
          mainButtons(),
      });

    config.mainMessageId =
      message.id;

    saveDatabase();

    return message;
  } catch (
    error
  ) {
    console.error(
      "Erro ao criar mensagem principal:",
      error
    );

    return null;
  }
}

async function refreshMainMessage(
  guild
) {
  if (!guild) {
    return;
  }

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !config.mainChannelId ||
    !config.mainMessageId
  ) {
    return;
  }

  const channel =
    guild.channels.cache.get(
      config.mainChannelId
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    return;
  }

  try {
    const message =
      await channel.messages.fetch(
        config.mainMessageId
      );

    await message.edit({
      embeds: [
        mainEmbed(
          guild
        ),
      ],
      components:
        mainButtons(),
    });
  } catch (
    error
  ) {
    console.error(
      "Erro ao atualizar mensagem principal:",
      error
    );
  }
}

async function ensureMainMessage(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  if (
    config.mainChannelId &&
    config.mainMessageId
  ) {
    try {
      const channel =
        guild.channels.cache.get(
          config.mainChannelId
        );

      if (
        channel &&
        channel.isTextBased()
      ) {
        const message =
          await channel.messages.fetch(
            config.mainMessageId
          );

        if (message) {
          await message.edit({
            embeds: [
              mainEmbed(
                guild
              ),
            ],
            components:
              mainButtons(),
          });

          return message;
        }
      }
    } catch {
      // A mensagem não existe mais.
    }
  }

  return createMainMessage(
    guild
  );
}

async function setupGuild(
  guild
) {
  await initializeGuild(
    guild
  );

  await ensureMainMessage(
    guild
  );
}

client.once(
  "ready",
  async () => {
    console.log(
      `🤖 ${client.user.tag} está online.`
    );

    await initializeAllGuilds();

    for (
      const guild of client.guilds.cache.values()
    ) {
      try {
        await setupGuild(
          guild
        );
      } catch (
        error
      ) {
        console.error(
          `Erro ao configurar ${guild.name}:`,
          error
        );
      }
    }

    console.log(
      "✅ Inicialização concluída."
    );
  }
);

client.on(
  "guildCreate",
  async (
    guild
  ) => {
    try {
      await setupGuild(
        guild
      );

      console.log(
        `➕ Bot adicionado ao servidor: ${guild.name}`
      );
    } catch (
      error
    ) {
      console.error(
        "Erro ao configurar novo servidor:",
        error
      );
    }
  }
);

process.on(
  "unhandledRejection",
  (
    error
  ) => {
    console.error(
      "Unhandled Promise Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  (
    error
  ) => {
    console.error(
      "Uncaught Exception:",
      error
    );
  }
);

const token =
  process.env.DISCORD_TOKEN ||
  process.env.TOKEN;

if (!token) {
  console.error(
    "❌ Token do Discord não encontrado."
  );

  process.exit(
    1
  );
}

client.login(
  token
).catch(
  (
    error
  ) => {
    console.error(
      "❌ Falha ao conectar ao Discord:",
      error
    );

    process.exit(
      1
    );
  }
);// ======================================================
// COMANDOS SLASH
// ======================================================

const commands = [
  new SlashCommandBuilder()
    .setName("painel")
    .setDescription(
      "Abre o painel principal do bot."
    ),

  new SlashCommandBuilder()
    .setName("fila")
    .setDescription(
      "Abre o painel de filas."
    ),

  new SlashCommandBuilder()
    .setName("config")
    .setDescription(
      "Abre o painel de configuração."
    ),

  new SlashCommandBuilder()
    .setName("mediador")
    .setDescription(
      "Abre o painel dos mediadores."
    ),
];

async function registerCommands() {
  try {
    await client.application.commands.set(
      commands.map(
        (command) =>
          command.toJSON()
      )
    );

    console.log(
      "✅ Comandos slash registrados."
    );
  } catch (
    error
  ) {
    console.error(
      "❌ Erro ao registrar comandos:",
      error
    );
  }
}

// ======================================================
// TRATAMENTO DOS COMANDOS
// ======================================================

async function handleSlashCommand(
  interaction
) {
  switch (
    interaction.commandName
  ) {
    case "painel":
      await sendSafeReply(
        interaction,
        {
          embeds: [
            mainEmbed(
              interaction.guild
            ),
          ],
          components:
            mainButtons(),
        }
      );
      break;

    case "fila":
      await showQueuePanel(
        interaction
      );
      break;

    case "config":
      await openConfig(
        interaction
      );
      break;

    case "mediador":
      await showMediatorPanel(
        interaction
      );
      break;

    default:
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Comando desconhecido.",
          ephemeral: true,
        }
      );
      break;
  }
}

// ======================================================
// EVENTO DE INTERAÇÃO — COMANDOS
// ======================================================

client.on(
  "interactionCreate",
  async (
    interaction
  ) => {
    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    try {
      await handleSlashCommand(
        interaction
      );
    } catch (
      error
    ) {
      console.error(
        "Erro ao executar comando:",
        error
      );

      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Não foi possível executar este comando.",
          ephemeral: true,
        }
      );
    }
  }
);

// ======================================================
// REGISTRO DOS COMANDOS APÓS LOGIN
// ======================================================

client.once(
  "ready",
  async () => {
    await registerCommands();
  }
);

// ======================================================
// LIMPEZA AUTOMÁTICA
// ======================================================

setInterval(
  () => {
    const now =
      Date.now();

    for (
      const [queueKey, queue] of queues.entries()
    ) {
      if (
        !queue ||
        !queue.users
      ) {
        queues.delete(
          queueKey
        );

        continue;
      }

      if (
        queue.lastActivity &&
        now -
          queue.lastActivity >
          30 * 60 * 1000
      ) {
        queues.delete(
          queueKey
        );
      }
    }

    for (
      const [matchId, match] of activeMatches.entries()
    ) {
      if (
        !match
      ) {
        activeMatches.delete(
          matchId
        );

        continue;
      }

      if (
        match.createdAt &&
        now -
          match.createdAt >
          24 * 60 * 60 * 1000 &&
        match.status !==
          "finished"
      ) {
        match.status =
          "expired";

        activeMatches.delete(
          matchId
        );
      }
    }
  },
  5 * 60 * 1000
);

// ======================================================
// FINALIZAÇÃO
// ======================================================

console.log(
  "🚀 Inicializando aplicação..."
);
