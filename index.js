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

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    "ERRO: preencha DISCORD_TOKEN, CLIENT_ID e GUILD_ID no arquivo .env"
  );
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DATA_FILE = path.join(DATA_DIR, "bot-data.json");

const defaultData = {
  config: {
    categories: {},
    channels: {},
    roles: {},
    values: {
      min: 1,
      max: 100000
    },
    pix: {
      key: "",
      name: "",
      bank: ""
    }
  },
  bets: {},
  users: {},
  queues: {
    normal: [],
    ranked: []
  },
  analysts: {},
  mediators: {}
};

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(defaultData, null, 2)
      );
      return JSON.parse(JSON.stringify(defaultData));
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");

    if (!raw.trim()) {
      return JSON.parse(JSON.stringify(defaultData));
    }

    const parsed = JSON.parse(raw);

    return {
      ...JSON.parse(JSON.stringify(defaultData)),
      ...parsed,
      config: {
        ...JSON.parse(JSON.stringify(defaultData.config)),
        ...(parsed.config || {}),
        categories: {
          ...(parsed.config?.categories || {})
        },
        channels: {
          ...(parsed.config?.channels || {})
        },
        roles: {
          ...(parsed.config?.roles || {})
        },
        values: {
          ...JSON.parse(JSON.stringify(defaultData.config.values)),
          ...(parsed.config?.values || {})
        },
        pix: {
          ...JSON.parse(JSON.stringify(defaultData.config.pix)),
          ...(parsed.config?.pix || {})
        }
      },
      bets: parsed.bets || {},
      users: parsed.users || {},
      queues: {
        ...JSON.parse(JSON.stringify(defaultData.queues)),
        ...(parsed.queues || {})
      },
      analysts: parsed.analysts || {},
      mediators: parsed.mediators || {}
    };
  } catch (err) {
    console.error("Erro ao carregar dados:", err);

    return JSON.parse(JSON.stringify(defaultData));
  }
}

let db = loadData();

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (err) {
    console.error("Erro ao salvar dados:", err);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User
  ]
});

function getGuild() {
  return client.guilds.cache.get(GUILD_ID);
}

function roleId(name) {
  return db.config.roles?.[name] || null;
}

function channelId(name) {
  return db.config.channels?.[name] || null;
}

function categoryId(name) {
  return db.config.categories?.[name] || null;
}

function hasRole(member, roleName) {
  const id = roleId(roleName);

  if (!id || !member) return false;

  return member.roles.cache.has(id);
}

function isAdmin(member) {
  if (!member) return false;

  return member.permissions.has(
    PermissionsBitField.Flags.Administrator
  );
}

function isMediator(member) {
  return hasRole(member, "mediator");
}

function isAnalyst(member) {
  return hasRole(member, "analyst");
}

function money(value) {
  const number = Number(value || 0);

  return number.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function getUserData(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      coins: 0,
      wins: 0,
      losses: 0,
      bets: 0
    };

    saveData();
  }

  return db.users[userId];
}

function getBetByChannel(channelIdValue) {
  return Object.values(db.bets).find(
    bet => bet.channelId === channelIdValue
  );
}

function getOpenBetByUser(userId) {
  return Object.values(db.bets).find(
    bet =>
      bet.status !== "finished" &&
      (
        bet.player1 === userId ||
        bet.player2 === userId
      )
  );
}

function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function getConfiguredCategory() {
  return (
    categoryId("bets") ||
    categoryId("apostas") ||
    null
  );
}

async function sendPixDM(user, amount, reason = "pagamento") {
  try {
    const pix = db.config.pix || {};

    const text =
      `💰 **INSTRUÇÕES DE PAGAMENTO**\n\n` +
      `Valor: **${money(amount)}**\n` +
      `Motivo: **${reason}**\n\n` +
      `🔑 **Chave Pix:** ${pix.key || "não configurada"}\n` +
      `👤 **Nome:** ${pix.name || "não configurado"}\n` +
      `🏦 **Banco:** ${pix.bank || "não configurado"}\n\n` +
      `Após realizar o pagamento, envie o comprovante conforme solicitado no canal da aposta.`;

    await user.send(text);

    return true;
  } catch (err) {
    console.error(
      `Não foi possível enviar DM para ${user.id}:`,
      err.message
    );

    return false;
  }
}

function getBetEmbed(bet) {
  const players = [];

  if (bet.player1) {
    players.push(`👤 Jogador 1: <@${bet.player1}>`);
  } else {
    players.push("👤 Jogador 1: aguardando...");
  }

  if (bet.player2) {
    players.push(`👤 Jogador 2: <@${bet.player2}>`);
  } else {
    players.push("👤 Jogador 2: aguardando...");
  }

  const mediatorText = bet.mediator
    ? `<@${bet.mediator}>`
    : "Nenhum mediador assumiu";

  const analystText = bet.analyst
    ? `<@${bet.analyst}>`
    : "Nenhum analista";

  const statusMap = {
    waiting: "🟡 Aguardando jogador",
    ready: "🟢 Pronta para começar",
    payment: "💰 Aguardando pagamento",
    playing: "🎮 Em andamento",
    analysis: "📊 Em análise",
    finished: "🏁 Finalizada",
    cancelled: "❌ Cancelada"
  };

  const status =
    statusMap[bet.status] ||
    "🟡 Aguardando";

  return new EmbedBuilder()
    .setTitle("🎯 APOSTA")
    .setDescription(
      `${players.join("\n")}\n\n` +
      `💵 Valor: **${money(bet.amount)}**\n` +
      `📦 Modalidade: **${bet.mode || "Não definida"}**\n` +
      `🔢 Formato: **${bet.format || "1x1"}**\n\n` +
      `🛡️ Mediador: ${mediatorText}\n` +
      `📊 Analista: ${analystText}\n\n` +
      `📌 Status: **${status}**`
    )
    .setTimestamp();
}

function betButtons(bet) {
  const row1 = new ActionRowBuilder();

  if (!bet.player2 && bet.status === "waiting") {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`bet_join_${bet.id}`)
        .setLabel("Entrar na aposta")
        .setStyle(ButtonStyle.Success)
    );
  }

  if (
    bet.status !== "finished" &&
    bet.status !== "cancelled"
  ) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`bet_cancel_${bet.id}`)
        .setLabel("Cancelar")
        .setStyle(ButtonStyle.Danger)
    );
  }

  if (
    bet.status !== "finished" &&
    bet.status !== "cancelled"
  ) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`bet_med_${bet.id}`)
        .setLabel("Puxar Mediador")
        .setStyle(ButtonStyle.Primary)
    );
  }

  if (
    bet.status !== "finished" &&
    bet.status !== "cancelled"
  ) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`bet_analysis_${bet.id}`)
        .setLabel("Solicitar Análise")
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return [row1];
}

async function updateBetMessage(bet) {
  if (!bet.channelId || !bet.messageId) return;

  try {
    const channel =
      await client.channels.fetch(bet.channelId);

    if (!channel) return;

    const message =
      await channel.messages.fetch(bet.messageId);

    if (!message) return;

    await message.edit({
      embeds: [getBetEmbed(bet)],
      components: betButtons(bet)
    });
  } catch (err) {
    console.error(
      "Erro ao atualizar mensagem da aposta:",
      err.message
    );
  }
}

async function createBetChannel(guild, user, options = {}) {
  const category = getConfiguredCategory();

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionsBitField.Flags.ViewChannel
      ]
    },
    {
      id: user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    }
  ];

  const channel = await guild.channels.create({
    name: `aposta-${user.username}`.toLowerCase().slice(0, 90),
    type: ChannelType.GuildText,
    parent: category || undefined,
    permissionOverwrites: overwrites
  });

  const bet = {
    id: createId("bet"),
    channelId: channel.id,
    messageId: null,
    player1: user.id,
    player2: null,
    mediator: null,
    analyst: null,
    amount: Number(options.amount || 0),
    mode: options.mode || "Não definida",
    format: options.format || "1x1",
    status: "waiting",
    createdAt: Date.now()
  };

  db.bets[bet.id] = bet;
  saveData();

  const message = await channel.send({
    content:
      `🎯 **Nova aposta criada por <@${user.id}>!**\n\n` +
      `A fila possui **EXATAMENTE 2 jogadores**.\n` +
      `Quando o segundo jogador entrar, a aposta estará completa.`,
    embeds: [getBetEmbed(bet)],
    components: betButtons(bet)
  });

  bet.messageId = message.id;

  await channel.permissionOverwrites.edit(
    user.id,
    {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    }
  );

  saveData();

  return bet;
}

async function addPlayerToBet(
  interaction,
  bet
) {
  const userId = interaction.user.id;

  if (bet.player1 === userId) {
    return interaction.reply({
      content: "❌ Você já está nesta aposta.",
      ephemeral: true
    });
  }

  if (bet.player2) {
    return interaction.reply({
      content:
        "❌ Esta aposta já possui 2 jogadores.",
      ephemeral: true
    });
  }

  if (
    bet.status !== "waiting"
  ) {
    return interaction.reply({
      content:
        "❌ Esta aposta não está mais aguardando jogador.",
      ephemeral: true
    });
  }

  bet.player2 = userId;
  bet.status = "ready";

  const channel =
    await client.channels.fetch(bet.channelId);

  if (channel) {
    await channel.permissionOverwrites.edit(
      userId,
      {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      }
    );

    await channel.send(
      `👥 <@${userId}> entrou na aposta.\n\n` +
      `✅ **Os 2 jogadores já estão na fila.**`
    );
  }

  saveData();

  await updateBetMessage(bet);

  return interaction.reply({
    content:
      "✅ Você entrou na aposta com sucesso.",
    ephemeral: true
  });
}

async function cancelBet(interaction, bet) {
  const userId = interaction.user.id;

  const allowed =
    bet.player1 === userId ||
    bet.player2 === userId ||
    isAdmin(interaction.member) ||
    (
      bet.mediator &&
      bet.mediator === userId
    );

  if (!allowed) {
    return interaction.reply({
      content:
        "❌ Você não pode cancelar esta aposta.",
      ephemeral: true
    });
  }

  bet.status = "cancelled";

  saveData();

  await updateBetMessage(bet);

  try {
    const channel =
      await client.channels.fetch(bet.channelId);

    if (channel) {
      await channel.send(
        "❌ **Aposta cancelada.**"
      );
    }
  } catch {}

  return interaction.reply({
    content:
      "✅ Aposta cancelada.",
    ephemeral: true
  });
}

async function pullMediator(
  interaction,
  bet
) {
  if (!isMediator(interaction.member)) {
    return interaction.reply({
      content:
        "❌ Você não possui o cargo de Mediador configurado.",
      ephemeral: true
    });
  }

  if (
    bet.status === "finished" ||
    bet.status === "cancelled"
  ) {
    return interaction.reply({
      content:
        "❌ Esta aposta já foi encerrada.",
      ephemeral: true
    });
  }

  if (bet.mediator) {
    return interaction.reply({
      content:
        `❌ Esta aposta já possui um mediador: <@${bet.mediator}>.`,
      ephemeral: true
    });
  }

  bet.mediator = interaction.user.id;

  if (bet.status === "ready") {
    bet.status = "payment";
  }

  const channel =
    await client.channels.fetch(bet.channelId);

  if (channel) {
    await channel.permissionOverwrites.edit(
      interaction.user.id,
      {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      }
    );

    await channel.send(
      `🛡️ **Mediador assumiu esta aposta.**\n` +
      `Responsável: <@${interaction.user.id}>`
    );
  }

  saveData();

  await updateBetMessage(bet);

  if (bet.amount > 0) {
    const guild =
      interaction.guild;

    if (guild) {
      try {
        const p1 =
          await guild.members.fetch(bet.player1);

        const p2 =
          await guild.members.fetch(bet.player2);

        await sendPixDM(
          p1.user,
          bet.amount,
          "entrada da aposta"
        );

        await sendPixDM(
          p2.user,
          bet.amount,
          "entrada da aposta"
        );
      } catch (err) {
        console.error(
          "Erro ao enviar Pix por DM:",
          err.message
        );
      }
    }
  }

  return interaction.reply({
    content:
      "🛡️ Você assumiu a aposta como Mediador.",
    ephemeral: true
  });
}

async function requestAnalysis(
  interaction,
  bet
) {
  const analystRoleId =
    roleId("analyst");

  if (!analystRoleId) {
    return interaction.reply({
      content:
        "❌ O cargo de Analista ainda não foi configurado.",
      ephemeral: true
    });
  }

  if (
    bet.status === "finished" ||
    bet.status === "cancelled"
  ) {
    return interaction.reply({
      content:
        "❌ Esta aposta já foi encerrada.",
      ephemeral: true
    });
  }

  bet.status = "analysis";

  saveData();

  const guild =
    interaction.guild;

  const notifyChannelId =
    channelId("analystNotify");

  let notifyChannel = null;

  if (notifyChannelId) {
    notifyChannel =
      guild.channels.cache.get(
        notifyChannelId
      );
  }

  if (!notifyChannel) {
    notifyChannel =
      guild.channels.cache.find(
        channel =>
          channel.type === ChannelType.GuildText &&
          (
            channel.name.includes("analista") ||
            channel.name.includes("analise")
          )
      );
  }

  if (notifyChannel) {
    const row =
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `analysis_take_${bet.id}`
          )
          .setLabel("Assumir análise")
          .setStyle(ButtonStyle.Primary)
      );

    await notifyChannel.send({
      content:
        `<@&${analystRoleId}>`,
      embeds: [
        new EmbedBuilder()
          .setTitle("📊 NOVA SOLICITAÇÃO DE ANÁLISE")
          .setDescription(
            `📌 Aposta: <#${bet.channelId}>\n` +
            `👤 Solicitada por: <@${interaction.user.id}>\n` +
            `💵 Valor: **${money(bet.amount)}**\n\n` +
            `Um membro com o cargo de **Analista** pode assumir esta solicitação.`
          )
          .setTimestamp()
      ],
      components: [row]
    });
  }

  const channel =
    await client.channels.fetch(bet.channelId);

  if (channel) {
    await channel.send(
      `📊 **Análise solicitada.**\n` +
      `<@&${analystRoleId}> foi notificado.`
    );
  }

  await updateBetMessage(bet);

  return interaction.reply({
    content:
      "📊 Solicitação de análise enviada aos Analistas.",
    ephemeral: true
  });
}

async function takeAnalysis(
  interaction,
  bet
) {
  if (!isAnalyst(interaction.member)) {
    return interaction.reply({
      content:
        "❌ Somente membros com o cargo de Analista configurado podem atender solicitações.",
      ephemeral: true
    });
  }

  if (
    bet.analyst &&
    bet.analyst !== interaction.user.id
  ) {
    return interaction.reply({
      content:
        `❌ Esta análise já foi assumida por <@${bet.analyst}>.`,
      ephemeral: true
    });
  }

  if (
    bet.status === "finished" ||
    bet.status === "cancelled"
  ) {
    return interaction.reply({
      content:
        "❌ Esta aposta já foi encerrada.",
      ephemeral: true
    });
  }

  bet.analyst =
    interaction.user.id;

  bet.status = "analysis";

  saveData();

  const channel =
    await client.channels.fetch(bet.channelId);

  if (channel) {
    await channel.permissionOverwrites.edit(
      interaction.user.id,
      {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      }
    );

    await channel.send(
      `📊 **Análise assumida.**\n` +
      `Analista responsável: <@${interaction.user.id}>.`
    );
  }

  await updateBetMessage(bet);

  return interaction.reply({
    content:
      "✅ Você assumiu esta solicitação de análise.",
    ephemeral: true
  });
}

async function finishBet(
  interaction,
  bet,
  winnerId
) {
  if (
    !isAdmin(interaction.member) &&
    bet.mediator !== interaction.user.id
  ) {
    return interaction.reply({
      content:
        "❌ Somente o administrador ou o Mediador responsável pode finalizar a aposta.",
      ephemeral: true
    });
  }

  if (
    winnerId !== bet.player1 &&
    winnerId !== bet.player2
  ) {
    return interaction.reply({
      content:
        "❌ O vencedor precisa ser um dos 2 jogadores da aposta.",
      ephemeral: true
    });
  }

  const loserId =
    winnerId === bet.player1
      ? bet.player2
      : bet.player1;

  bet.status = "finished";
  bet.winner = winnerId;
  bet.loser = loserId;
  bet.finishedAt = Date.now();

  const winner =
    getUserData(winnerId);

  const loser =
    getUserData(loserId);

  winner.wins += 1;
  winner.bets += 1;

  loser.losses += 1;
  loser.bets += 1;

  saveData();

  await updateBetMessage(bet);

  const channel =
    await client.channels.fetch(
      bet.channelId
    );

  if (channel) {
    await channel.send(
      `🏆 **APOSTA FINALIZADA!**\n\n` +
      `🏆 Vencedor: <@${winnerId}>\n` +
      `❌ Perdedor: <@${loserId}>\n\n` +
      `💰 Valor: **${money(bet.amount)}**`
    );
  }

  return interaction.reply({
    content:
      `🏆 Aposta finalizada. Vencedor: <@${winnerId}>.`,
    ephemeral: true
  });
}

async function configureRole(
  interaction,
  roleName,
  selectedRole
) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content:
        "❌ Você precisa ser administrador.",
      ephemeral: true
    });
  }

  db.config.roles[roleName] =
    selectedRole;

  saveData();

  return interaction.reply({
    content:
      `✅ Cargo **${roleName}** configurado com sucesso.`,
    ephemeral: true
  });
}

async function configureChannel(
  interaction,
  channelName,
  selectedChannel
) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content:
        "❌ Você precisa ser administrador.",
      ephemeral: true
    });
  }

  db.config.channels[channelName] =
    selectedChannel;

  saveData();

  return interaction.reply({
    content:
      `✅ Canal **${channelName}** configurado com sucesso.`,
    ephemeral: true
  });
}

async function configureCategory(
  interaction,
  categoryName,
  selectedCategory
) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content:
        "❌ Você precisa ser administrador.",
      ephemeral: true
    });
  }

  db.config.categories[categoryName] =
    selectedCategory;

  saveData();

  return interaction.reply({
    content:
      `✅ Categoria **${categoryName}** configurada com sucesso.`,
    ephemeral: true
  });
}

function configEmbed() {
  return new EmbedBuilder()
    .setTitle("⚙️ CONFIGURAÇÃO DO BOT")
    .setDescription(
      `**Cargos configurados**\n\n` +
      `🛡️ Mediador: ${
        roleId("mediator")
          ? `<@&${roleId("mediator")}>`
          : "não definido"
      }\n` +
      `📊 Analista: ${
        roleId("analyst")
          ? `<@&${roleId("analyst")}>`
          : "não definido"
      }\n\n` +

      `**Canais configurados**\n\n` +
      `📊 Notificações de Analistas: ${
        channelId("analystNotify")
          ? `<#${channelId("analystNotify")}>`
          : "não definido"
      }\n\n` +

      `**Categorias**\n\n` +
      `🎯 Apostas: ${
        categoryId("bets")
          ? `<#${categoryId("bets")}>`
          : "não definida"
      }\n\n` +

      `**Pix**\n\n` +
      `🔑 Chave: ${
        db.config.pix.key || "não configurada"
      }\n` +
      `👤 Nome: ${
        db.config.pix.name || "não configurado"
      }\n` +
      `🏦 Banco: ${
        db.config.pix.bank || "não configurado"
      }`
    );
}

function configButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_mediator")
        .setLabel("Configurar Mediador")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_analyst")
        .setLabel("Configurar Analista")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_analyst_channel")
        .setLabel("Canal de Analistas")
        .setStyle(ButtonStyle.Secondary)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_bet_category")
        .setLabel("Categoria das Apostas")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_pix")
        .setLabel("Configurar Pix")
        .setStyle(ButtonStyle.Success)
    )
  ];
}

async function showRoleSelect(
  interaction,
  roleName,
  title
) {
  const select =
    new RoleSelectMenuBuilder()
      .setCustomId(
        `role_select_${roleName}`
      )
      .setPlaceholder(
        "Selecione o cargo"
      );

  const row =
    new ActionRowBuilder().addComponents(
      select
    );

  return interaction.reply({
    content: title,
    components: [row],
    ephemeral: true
  });
}

async function showChannelSelect(
  interaction,
  channelName,
  title
) {
  const select =
    new ChannelSelectMenuBuilder()
      .setCustomId(
        `channel_select_${channelName}`
      )
      .setPlaceholder(
        "Selecione o canal"
      )
      .setChannelTypes(
        ChannelType.GuildText
      );

  const row =
    new ActionRowBuilder().addComponents(
      select
    );

  return interaction.reply({
    content: title,
    components: [row],
    ephemeral: true
  });
}

async function showCategorySelect(
  interaction,
  categoryName,
  title
) {
  const select =
    new ChannelSelectMenuBuilder()
      .setCustomId(
        `category_select_${categoryName}`
      )
      .setPlaceholder(
        "Selecione a categoria"
      )
      .setChannelTypes(
        ChannelType.GuildCategory
      );

  const row =
    new ActionRowBuilder().addComponents(
      select
    );

  return interaction.reply({
    content: title,
    components: [row],
    ephemeral: true
  });
}

async function showPixModal(
  interaction
) {
  const modal =
    new ModalBuilder()
      .setCustomId("pix_modal")
      .setTitle("Configurar Pix");

  const key =
    new TextInputBuilder()
      .setCustomId("pix_key")
      .setLabel("Chave Pix")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(
        db.config.pix.key || ""
      );

  const name =
    new TextInputBuilder()
      .setCustomId("pix_name")
      .setLabel("Nome do titular")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(
        db.config.pix.name || ""
      );

  const bank =
    new TextInputBuilder()
      .setCustomId("pix_bank")
      .setLabel("Banco")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(
        db.config.pix.bank || ""
      );

  modal.addComponents(
    new ActionRowBuilder().addComponents(key),
    new ActionRowBuilder().addComponents(name),
    new ActionRowBuilder().addComponents(bank)
  );

  return interaction.showModal(modal);
}

const commands = [
  new SlashCommandBuilder()
    .setName("config")
    .setDescription(
      "Abrir painel de configuração"
    ),

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription(
      "Abrir configuração inicial"
    ),

  new SlashCommandBuilder()
    .setName("estrutura")
    .setDescription(
      "Ver estrutura configurada"
    ),

  new SlashCommandBuilder()
    .setName("cargos")
    .setDescription(
      "Ver cargos configurados"
    ),

  new SlashCommandBuilder()
    .setName("canais")
    .setDescription(
      "Ver canais configurados"
    ),

  new SlashCommandBuilder()
    .setName("mediadores")
    .setDescription(
      "Ver mediadores configurados"
    ),

  new SlashCommandBuilder()
    .setName("analistas")
    .setDescription(
      "Ver analistas configurados"
    ),

  new SlashCommandBuilder()
    .setName("painel")
    .setDescription(
      "Publicar painel de apostas"
    ),

  new SlashCommandBuilder()
    .setName("coins")
    .setDescription(
      "Ver seus Coins"
    )
];

async function registerCommands() {
  const rest =
    new REST({ version: "10" })
      .setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      CLIENT_ID,
      GUILD_ID
    ),
    {
      body: commands.map(
        command => command.toJSON()
      )
    }
  );

  console.log(
    "Comandos registrados com sucesso."
  );
}

async function publishPanel(
  interaction
) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content:
        "❌ Você precisa ser administrador.",
      ephemeral: true
    });
  }

  const row =
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("create_bet")
        .setLabel("Criar aposta")
        .setStyle(ButtonStyle.Success)
    );

  await interaction.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🎯 SISTEMA DE APOSTAS")
        .setDescription(
          `Crie sua aposta através do botão abaixo.\n\n` +
          `👥 Cada fila possui **EXATAMENTE 2 jogadores**.\n` +
          `🏆 Existe apenas **1 vencedor**.\n` +
          `🛡️ Mediadores podem assumir apostas.\n` +
          `📊 Analistas podem assumir solicitações de análise.`
        )
    ],
    components: [row]
  });

  return interaction.reply({
    content:
      "✅ Painel publicado.",
    ephemeral: true
  });
}

async function createBetModal(
  interaction
) {
  const modal =
    new ModalBuilder()
      .setCustomId("create_bet_modal")
      .setTitle("Criar aposta");

  const amount =
    new TextInputBuilder()
      .setCustomId("amount")
      .setLabel("Valor da aposta")
      .setPlaceholder("Ex: 10")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

  const mode =
    new TextInputBuilder()
      .setCustomId("mode")
      .setLabel("Modalidade")
      .setPlaceholder("Ex: Mobile")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

  const format =
    new TextInputBuilder()
      .setCustomId("format")
      .setLabel("Formato")
      .setPlaceholder("Ex: 1x1")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      amount
    ),
    new ActionRowBuilder().addComponents(
      mode
    ),
    new ActionRowBuilder().addComponents(
      format
    )
  );

  return interaction.showModal(modal);
}

client.once(
  "ready",
  async () => {
    console.log(
      `Bot conectado como ${client.user.tag}`
    );

    try {
      await registerCommands();
    } catch (err) {
      console.error(
        "Erro ao registrar comandos:",
        err
      );
    }
  }
);

client.on(
  "messageCreate",
  async message => {
    if (message.author.bot) return;

    const content =
      message.content
        .trim()
        .toLowerCase();

    const bet =
      getBetByChannel(
        message.channel.id
      );

    if (
      content === ".med"
    ) {
      if (!bet) {
        return message.reply(
          "❌ Use `.med` dentro do canal privado de uma aposta."
        );
      }

      if (!isMediator(message.member)) {
        return message.reply(
          "❌ Você não possui o cargo de Mediador configurado."
        );
      }

      if (bet.mediator) {
        return message.reply(
          `❌ Esta aposta já possui um mediador: <@${bet.mediator}>.`
        );
      }

      bet.mediator =
        message.author.id;

      if (bet.status === "ready") {
        bet.status = "payment";
      }

      saveData();

      try {
        await message.channel.permissionOverwrites.edit(
          message.author.id,
          {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          }
        );
      } catch {}

      await message.channel.send(
        `🛡️ **Mediador assumiu a aposta.**\n` +
        `Responsável: <@${message.author.id}>`
      );

      await updateBetMessage(bet);

      if (
        bet.amount > 0 &&
        bet.player1 &&
        bet.player2
      ) {
        try {
          const guild =
            message.guild;

          const p1 =
            await guild.members.fetch(
              bet.player1
            );

          const p2 =
            await guild.members.fetch(
              bet.player2
            );

          await sendPixDM(
            p1.user,
            bet.amount,
            "entrada da aposta"
          );

          await sendPixDM(
            p2.user,
            bet.amount,
            "entrada da aposta"
          );
        } catch (err) {
          console.error(
            "Erro no envio do Pix:",
            err.message
          );
        }
      }

      return;
    }

    if (
      content === ".ss mob"
    ) {
      if (!bet) {
        return message.reply(
          "❌ Use `.SS Mob` dentro do canal privado de uma aposta."
        );
      }

      const analystRole =
        roleId("analyst");

      if (!analystRole) {
        return message.reply(
          "❌ O cargo de Analista ainda não foi configurado."
        );
      }

      bet.status =
        "analysis";

      saveData();

      const notifyId =
        channelId(
          "analystNotify"
        );

      let notify =
        notifyId
          ? message.guild.channels.cache.get(
              notifyId
            )
          : null;

      if (!notify) {
        notify =
          message.guild.channels.cache.find(
            channel =>
              channel.type === ChannelType.GuildText &&
              (
                channel.name.includes(
                  "analista"
                ) ||
                channel.name.includes(
                  "analise"
                )
              )
          );
      }

      if (notify) {
        const row =
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                `analysis_take_${bet.id}`
              )
              .setLabel(
                "Assumir análise"
              )
              .setStyle(
                ButtonStyle.Primary
              )
          );

        await notify.send({
          content:
            `<@&${analystRole}>`,
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "📊 SOLICITAÇÃO DE SS MOB"
              )
              .setDescription(
                `📌 Aposta: <#${bet.channelId}>\n` +
                `👤 Solicitado por: <@${message.author.id}>\n` +
                `💵 Valor: **${money(bet.amount)}**\n\n` +
                `Um membro com o cargo de **Analista** pode assumir esta solicitação.`
              )
          ],
          components: [row]
        });
      }

      await message.channel.send(
        `📊 **SS Mob solicitada!**\n` +
        `<@&${analystRole}> foi notificado.`
      );

      await updateBetMessage(bet);

      return;
    }
  }
);

client.on(
  "interactionCreate",
  async interaction => {
    try {
      if (
        interaction.isChatInputCommand()
      ) {
        if (
          interaction.commandName ===
          "help"
        ) {
          return interaction.reply({
            content:
              "`/setup` configuração • `/config` fila • `/estrutura` canais • `/cargos` cargos • `/canais` canais • `/mediadores` mediadores • `/analistas` analistas • `/painel` publicar • `/coins` Coins • `.med` mediador • `.SS Mob` analista.",
            ephemeral: true
          });
        }

        if (
          interaction.commandName ===
          "config" ||
          interaction.commandName ===
          "setup"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Você precisa ser administrador.",
              ephemeral: true
            });
          }

          return interaction.reply({
            embeds: [
              configEmbed()
            ],
            components:
              configButtons(),
            ephemeral: true
          });
        }

        if (
          interaction.commandName ===
          "estrutura"
        ) {
          return interaction.reply({
            embeds: [
              configEmbed()
            ],
            ephemeral: true
          });
        }

        if (
          interaction.commandName ===
          "cargos"
        ) {
          return interaction.reply({
            content:
              `🛡️ Mediador: ${
                roleId("mediator")
                  ? `<@&${roleId("mediator")}>`
                  : "não configurado"
              }\n` +
              `📊 Analista: ${
                roleId("analyst")
                  ? `<@&${roleId("analyst")}>`
                  : "não configurado"
              }`,
            ephemeral: true
          });
        }

        if (
          interaction.commandName ===
          "canais"
        ) {
          return interaction.reply({
            content:
              `📊 Canal de Analistas: ${
                channelId(
                  "analystNotify"
                )
                  ? `<#${channelId(
                      "analystNotify"
                    )}>`
                  : "não configurado"
              }`,
            ephemeral: true
          });
        }

        if (
          interaction.commandName ===
          "mediadores"
        ) {
          const role =
            roleId("mediator");

          if (!role) {
            return interaction.reply({
              content:
                "❌ Cargo de Mediador não configurado.",
              ephemeral: true
            });
          }

          const members =
            interaction.guild.members.cache.filter(
              member =>
                member.roles.cache.has(
                  role
                )
            );

          return interaction.reply({
            content:
              `🛡️ **Mediadores configurados:** ${members.size}`,
            ephemeral: true
          });
        }

        if (
          interaction.commandName ===
          "analistas"
        ) {
          const role =
            roleId("analyst");

          if (!role) {
            return interaction.reply({
              content:
                "❌ Cargo de Analista não configurado.",
              ephemeral: true
            });
          }

          const members =
            interaction.guild.members.cache.filter(
              member =>
                member.roles.cache.has(
                  role
                )
            );

          return interaction.reply({
            content:
              `📊 **Analistas configurados:** ${members.size}`,
            ephemeral: true
          });
        }

        if (
          interaction.commandName ===
          "painel"
        ) {
          return publishPanel(
            interaction
          );
        }

        if (
          interaction.commandName ===
          "coins"
        ) {
          const user =
            getUserData(
              interaction.user.id
            );

          return interaction.reply({
            content:
              `🪙 **Seus Coins:** ${user.coins}\n\n` +
              `🏆 Vitórias: ${user.wins}\n` +
              `❌ Derrotas: ${user.losses}\n` +
              `🎯 Apostas: ${user.bets}`,
            ephemeral: true
          });
        }
      }

      if (
        interaction.isButton()
      ) {
        const id =
          interaction.customId;

        if (
          id === "create_bet"
        ) {
          return createBetModal(
            interaction
          );
        }

        if (
          id ===
          "config_mediator"
        ) {
          return showRoleSelect(
            interaction,
            "mediator",
            "🛡️ Selecione o cargo que será usado exclusivamente como **Mediador**."
          );
        }

        if (
          id ===
          "config_analyst"
        ) {
          return showRoleSelect(
            interaction,
            "analyst",
            "📊 Selecione o cargo que será usado exclusivamente como **Analista**."
          );
        }

        if (
          id ===
          "config_analyst_channel"
        ) {
          return showChannelSelect(
            interaction,
            "analystNotify",
            "📊 Selecione o canal privado onde os Analistas receberão as solicitações."
          );
        }

        if (
          id ===
          "config_bet_category"
        ) {
          return showCategorySelect(
            interaction,
            "bets",
            "🎯 Selecione a categoria onde os canais privados das apostas serão criados."
          );
        }

        if (
          id ===
          "config_pix"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Você precisa ser administrador.",
              ephemeral: true
            });
          }

          return showPixModal(
            interaction
          );
        }

        if (
          id.startsWith(
            "bet_join_"
          )
        ) {
          const betId =
            id.replace(
              "bet_join_",
              ""
            );

          const bet =
            db.bets[betId];

          if (!bet) {
            return interaction.reply({
              content:
                "❌ Aposta não encontrada.",
              ephemeral: true
            });
          }

          return addPlayerToBet(
            interaction,
            bet
          );
        }

        if (
          id.startsWith(
            "bet_cancel_"
          )
        ) {
          const betId =
            id.replace(
              "bet_cancel_",
              ""
            );

          const bet =
            db.bets[betId];

          if (!bet) {
            return interaction.reply({
              content:
                "❌ Aposta não encontrada.",
              ephemeral: true
            });
          }

          return cancelBet(
            interaction,
            bet
          );
        }

        if (
          id.startsWith(
            "bet_med_"
          )
        ) {
          const betId =
            id.replace(
              "bet_med_",
              ""
            );

          const bet =
            db.bets[betId];

          if (!bet) {
            return interaction.reply({
              content:
                "❌ Aposta não encontrada.",
              ephemeral: true
            });
          }

          return pullMediator(
            interaction,
            bet
          );
        }

        if (
          id.startsWith(
            "bet_analysis_"
          )
        ) {
          const betId =
            id.replace(
              "bet_analysis_",
              ""
            );

          const bet =
            db.bets[betId];

          if (!bet) {
            return interaction.reply({
              content:
                "❌ Aposta não encontrada.",
              ephemeral: true
            });
          }

          return requestAnalysis(
            interaction,
            bet
          );
        }

        if (
          id.startsWith(
            "analysis_take_"
          )
        ) {
          const betId =
            id.replace(
              "analysis_take_",
              ""
            );

          const bet =
            db.bets[betId];

          if (!bet) {
            return interaction.reply({
              content:
                "❌ Aposta não encontrada.",
              ephemeral: true
            });
          }

          return takeAnalysis(
            interaction,
            bet
          );
        }
      }

      if (
        interaction.isRoleSelectMenu()
      ) {
        const id =
          interaction.customId;

        if (
          id.startsWith(
            "role_select_"
          )
        ) {
          const roleName =
            id.replace(
              "role_select_",
              ""
            );

          const selected =
            interaction.values[0];

          return configureRole(
            interaction,
            roleName,
            selected
          );
        }
      }

      if (
        interaction.isChannelSelectMenu()
      ) {
        const id =
          interaction.customId;

        if (
          id.startsWith(
            "channel_select_"
          )
        ) {
          const channelName =
            id.replace(
              "channel_select_",
              ""
            );

          const selected =
            interaction.values[0];

          return configureChannel(
            interaction,
            channelName,
            selected
          );
        }

        if (
          id.startsWith(
            "category_select_"
          )
        ) {
          const categoryName =
            id.replace(
              "category_select_",
              ""
            );

          const selected =
            interaction.values[0];

          return configureCategory(
            interaction,
            categoryName,
            selected
          );
        }
      }

      if (
        interaction.isModalSubmit()
      ) {
        if (
          interaction.customId ===
          "pix_modal"
        ) {
          if (
            !isAdmin(
              interaction.member
            )
          ) {
            return interaction.reply({
              content:
                "❌ Você precisa ser administrador.",
              ephemeral: true
            });
          }

          db.config.pix.key =
            interaction.fields.getTextInputValue(
              "pix_key"
            );

          db.config.pix.name =
            interaction.fields.getTextInputValue(
              "pix_name"
            );

          db.config.pix.bank =
            interaction.fields.getTextInputValue(
              "pix_bank"
            );

          saveData();

          return interaction.reply({
            content:
              "✅ Dados do Pix salvos.",
            ephemeral: true
          });
        }

        if (
          interaction.customId ===
          "create_bet_modal"
        ) {
          const amountText =
            interaction.fields.getTextInputValue(
              "amount"
            );

          const mode =
            interaction.fields.getTextInputValue(
              "mode"
            );

          const format =
            interaction.fields.getTextInputValue(
              "format"
            );

          const amount =
            Number(
              amountText
                .replace(",", ".")
                .replace(/[^\d.]/g, "")
            );

          if (
            !Number.isFinite(amount) ||
            amount <= 0
          ) {
            return interaction.reply({
              content:
                "❌ Informe um valor válido.",
              ephemeral: true
            });
          }

          const existing =
            getOpenBetByUser(
              interaction.user.id
            );

          if (existing) {
            return interaction.reply({
              content:
                `❌ Você já possui uma aposta aberta em <#${existing.channelId}>.`,
              ephemeral: true
            });
          }

          const bet =
            await createBetChannel(
              interaction.guild,
              interaction.user,
              {
                amount,
                mode,
                format
              }
            );

          return interaction.reply({
            content:
              `✅ Sua aposta foi criada em <#${bet.channelId}>.`,
            ephemeral: true
          });
        }
      }
    } catch (err) {
      console.error(
        "Erro em interactionCreate:",
        err
      );

      try {
        if (
          interaction.replied ||
          interaction.deferred
        ) {
          await interaction.followUp({
            content:
              "❌ Ocorreu um erro ao executar essa ação.",
            ephemeral: true
          });
        } else {
          await interaction.reply({
            content:
              "❌ Ocorreu um erro ao executar essa ação.",
            ephemeral: true
          });
        }
      } catch {}
    }
  }
);

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "Unhandled Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "Uncaught Exception:",
      error
    );
  }
);

client.login(TOKEN);