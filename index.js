// index.js
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  REST,
  Routes,
  Events,
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID || process.env.CLIENTID;
const GUILD_ID = process.env.GUILD_ID || process.env.GUILDID;

const DATA_DIR = path.join(__dirname, "data");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

const DEFAULT_CONFIG = {
  guildId: null,

  channels: {
    queueCategory: null,
    betCategory: null,
    logs: null,
    payments: null,
    results: null,
  },

  roles: {
    mediator: null,
    admin: null,
  },

  queueMessages: {},
  queues: {},
  bets: {},
  pixAdmins: {},
  mediators: [],

  settings: {
    prefix: "!",
  },

  feeCents: 0,
  betsEnabled: true,
  botAvatar: null,
};

if (!TOKEN) {
  console.error("❌ TOKEN não configurado.");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("❌ CLIENT_ID não configurado.");
  process.exit(1);
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================
// CLIENT
// ============================================================

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
    Partials.GuildMember,
    Partials.User,
  ],
});

// ============================================================
// ESTADO
// ============================================================

client.queueSetup = {};
client.betSetup = {};
client.mediatorSetup = {};
client.configSetup = {};

// ============================================================
// FUNÇÕES DE CONFIGURAÇÃO
// ============================================================

function cloneDefaultConfig() {
  return JSON.parse(
    JSON.stringify(DEFAULT_CONFIG)
  );
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      const config = cloneDefaultConfig();

      fs.writeFileSync(
        CONFIG_FILE,
        JSON.stringify(config, null, 2)
      );

      return config;
    }

    const raw = fs.readFileSync(
      CONFIG_FILE,
      "utf8"
    );

    const parsed = JSON.parse(raw);

    return {
      ...cloneDefaultConfig(),
      ...parsed,

      channels: {
        ...DEFAULT_CONFIG.channels,
        ...(parsed.channels || {}),
      },

      roles: {
        ...DEFAULT_CONFIG.roles,
        ...(parsed.roles || {}),
      },

      settings: {
        ...DEFAULT_CONFIG.settings,
        ...(parsed.settings || {}),
      },

      queueMessages: {
        ...DEFAULT_CONFIG.queueMessages,
        ...(parsed.queueMessages || {}),
      },

      queues: {
        ...DEFAULT_CONFIG.queues,
        ...(parsed.queues || {}),
      },

      bets: {
        ...DEFAULT_CONFIG.bets,
        ...(parsed.bets || {}),
      },

      pixAdmins: {
        ...DEFAULT_CONFIG.pixAdmins,
        ...(parsed.pixAdmins || {}),
      },

      mediators: Array.isArray(parsed.mediators)
        ? parsed.mediators
        : [],
    };
  } catch (error) {
    console.error(
      "❌ Erro ao carregar configuração:",
      error
    );

    return cloneDefaultConfig();
  }
}

function saveConfig(config) {
  try {
    if (!config) {
      return;
    }

    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify(config, null, 2)
    );
  } catch (error) {
    console.error(
      "❌ Erro ao salvar configuração:",
      error
    );
  }
}

function getGuildConfig(guildId) {
  const config = loadConfig();

  if (!config.guildId && guildId) {
    config.guildId = guildId;
    saveConfig(config);
  }

  return config;
}

// ============================================================
// FORMATAÇÃO
// ============================================================

function formatMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "R$ 0,00";
  }

  return number.toLocaleString(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    }
  );
}

function normalizeValue(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return number;
}

// ============================================================
// VALORES / FORMATOS / MODOS
// ============================================================

const VALUES = [
  1,
  2,
  5,
  10,
  20,
  30,
  40,
  50,
  100,
  200,
  300,
  500,
];

const FORMATS = [
  "1x1",
  "2x2",
  "3x3",
  "4x4",
];

const MODES = [
  "mobile",
  "emulador",
  "misto",
];

function modeLabel(mode) {
  const labels = {
    mobile: "Mobile",
    emulador: "Emulador",
    misto: "Misto",
  };

  return labels[mode] || mode;
}

// ============================================================
// PERMISSÕES
// ============================================================

function isAdministrator(member) {
  if (!member) {
    return false;
  }

  return member.permissions?.has(
    PermissionFlagsBits.Administrator
  );
}

function canManage(interaction) {
  return isAdministrator(
    interaction.member
  );
}

function isMediator(member, guildId) {
  if (!member) {
    return false;
  }

  if (
    member.permissions?.has(
      PermissionFlagsBits.Administrator
    )
  ) {
    return true;
  }

  const config = getGuildConfig(guildId);

  const mediatorRole =
    config.roles?.mediator;

  if (
    mediatorRole &&
    member.roles?.cache?.has(
      mediatorRole
    )
  ) {
    return true;
  }

  return Array.isArray(
    config.mediators
  ) &&
    config.mediators.includes(
      member.id
    );
}

// ============================================================
// RESPOSTAS SEGURAS
// ============================================================

async function sendSafeReply(
  interaction,
  data
) {
  try {
    if (
      interaction.replied ||
      interaction.deferred
    ) {
      return await interaction.followUp(
        data
      );
    }

    return await interaction.reply(
      data
    );
  } catch (error) {
    console.error(
      "Erro ao responder interação:",
      error
    );

    return null;
  }
}

async function editSafeReply(
  interaction,
  data
) {
  try {
    if (
      interaction.deferred ||
      interaction.replied
    ) {
      return await interaction.editReply(
        data
      );
    }

    return await interaction.reply(
      data
    );
  } catch (error) {
    console.error(
      "Erro ao editar resposta:",
      error
    );

    return null;
  }
}

// ============================================================
// EMBEDS
// ============================================================

function createBaseEmbed(
  title,
  description
) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function createEmbed(
  guildId,
  title,
  description
) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: `Servidor: ${guildId}`,
    })
    .setTimestamp();
}

function createCadastroEmbed(
  guildId
) {
  const config =
    getGuildConfig(guildId);

  const pixAdmins =
    Object.values(
      config.pixAdmins || {}
    );

  return new EmbedBuilder()
    .setTitle(
      "📋 CADASTRO"
    )
    .setDescription(
      "Gerencie os administradores/Pix e mediadores."
    )
    .addFields(
      {
        name:
          "💰 ADM/Pix cadastrados",
        value:
          pixAdmins.length
            ? String(
                pixAdmins.length
              )
            : "Nenhum",
        inline: true,
      },
      {
        name:
          "🎯 Mediadores",
        value:
          config.mediators?.length
            ? String(
                config.mediators.length
              )
            : "Nenhum",
        inline: true,
      }
    )
    .setTimestamp();
}

function createQueueSetupEmbed(
  guildId
) {
  return new EmbedBuilder()
    .setTitle(
      "🎮 CONFIGURAÇÃO DE FILA"
    )
    .setDescription(
      "Configure uma nova fila."
    )
    .setFooter({
      text:
        `Servidor: ${guildId}`,
    })
    .setTimestamp();
}

function createConfigEmbed(
  guildId
) {
  const config =
    getGuildConfig(guildId);

  return new EmbedBuilder()
    .setTitle(
      "⚙️ CONFIGURAÇÃO"
    )
    .setDescription(
      "Configure o funcionamento do bot."
    )
    .addFields(
      {
        name:
          "👥 Cargo de administrador",
        value:
          config.roles?.admin
            ? `<@&${config.roles.admin}>`
            : "Não configurado",
      },
      {
        name:
          "🎯 Cargo de mediador",
        value:
          config.roles?.mediator
            ? `<@&${config.roles.mediator}>`
            : "Não configurado",
      }
    )
    .setTimestamp();
}

function createRolesEmbed(
  guildId
) {
  return new EmbedBuilder()
    .setTitle(
      "👥 CARGOS"
    )
    .setDescription(
      "Configure os cargos utilizados pelo bot."
    )
    .addFields(
      {
        name:
          "🎯 Mediador",
        value:
          getGuildConfig(guildId)
            .roles?.mediator
            ? `<@&${
                getGuildConfig(guildId)
                  .roles.mediator
              }>`
            : "Não configurado",
        inline: true,
      },
      {
        name:
          "👑 Administrador",
        value:
          getGuildConfig(guildId)
            .roles?.admin
            ? `<@&${
                getGuildConfig(guildId)
                  .roles.admin
              }>`
            : "Não configurado",
        inline: true,
      }
    )
    .setTimestamp();
}

function createChannelsEmbed(
  guildId
) {
  const config =
    getGuildConfig(guildId);

  return new EmbedBuilder()
    .setTitle(
      "📺 CONFIGURAÇÃO DE CANAIS"
    )
    .setDescription(
      "Configure os canais utilizados pelo bot."
    )
    .addFields(
      {
        name:
          "Fila",
        value:
          config.channels
            ?.queueCategory
            ? `<#${config.channels.queueCategory}>`
            : "Não configurado",
      },
      {
        name:
          "Logs",
        value:
          config.channels
            ?.logs
            ? `<#${config.channels.logs}>`
            : "Não configurado",
      }
    )
    .setTimestamp();
}

function createBetsConfigEmbed(
  guildId
) {
  const config =
    getGuildConfig(guildId);

  return new EmbedBuilder()
    .setTitle(
      "🎲 CONFIGURAÇÃO DE APOSTAS"
    )
    .setDescription(
      "Configure as opções relacionadas às apostas."
    )
    .addFields({
      name:
        "Status",
      value:
        config.betsEnabled
          ? "Ativado"
          : "Desativado",
    })
    .setTimestamp();
}

function createAppearanceEmbed(
  guildId
) {
  const config =
    getGuildConfig(guildId);

  return new EmbedBuilder()
    .setTitle(
      "🎨 APARÊNCIA"
    )
    .setDescription(
      "Configure a aparência das mensagens do bot."
    )
    .addFields({
      name:
        "Avatar",
      value:
        config.botAvatar
          ? "Configurado"
          : "Não configurado",
    })
    .setTimestamp();
}

// ============================================================
// COMPONENTES
// ============================================================

function queueSetupFormatMenu() {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          "queue_setup_format"
        )
        .setPlaceholder(
          "Selecione o formato"
        )
        .addOptions(
          FORMATS.map(
            format => ({
              label: format,
              value: format,
            })
          )
        )
    );
}

function queueSetupModeMenu() {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          "queue_setup_mode"
        )
        .setPlaceholder(
          "Selecione o modo"
        )
        .addOptions(
          MODES.map(
            mode => ({
              label:
                modeLabel(mode),
              value: mode,
            })
          )
        )
    );
}

function queueSetupValueMenu() {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          "queue_setup_value"
        )
        .setPlaceholder(
          "Selecione o valor"
        )
        .addOptions(
          VALUES.map(
            value => ({
              label:
                formatMoney(value),
              value:
                String(value),
            })
          )
        )
    );
}

function queueSetupTypeMenu() {
  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          "queue_setup_type"
        )
        .setPlaceholder(
          "Selecione o tipo da fila"
        )
        .addOptions(
          {
            label:
              "Normal",
            value:
              "normal",
          },
          {
            label:
              "Aposta",
            value:
              "bet",
          }
        )
    );
}

function queueSetupComponents() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "queue_setup_start"
          )
          .setLabel(
            "Criar fila"
          )
          .setEmoji("🎮")
          .setStyle(
            ButtonStyle.Primary
          )
      ),
  ];
}

function cadastroComponents() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "cadastro_pix"
          )
          .setLabel(
            "ADM/Pix"
          )
          .setEmoji("💰")
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            "cadastro_mediator"
          )
          .setLabel(
            "Mediadores"
          )
          .setEmoji("🎯")
          .setStyle(
            ButtonStyle.Primary
          )
      ),
  ];
}

function mediatorConfigComponents() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            "mediator_add"
          )
          .setLabel(
            "Adicionar"
          )
          .setEmoji("➕")
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            "mediator_remove"
          )
          .setLabel(
            "Remover"
          )
          .setEmoji("➖")
          .setStyle(
            ButtonStyle.Danger
          )
      ),
  ];
}

function configButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config_roles"
        )
        .setLabel(
          "Cargos"
        )
        .setEmoji(
          "👥"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_channels"
        )
        .setLabel(
          "Canais"
        )
        .setEmoji(
          "📺"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_general"
        )
        .setLabel(
          "Geral"
        )
        .setEmoji(
          "⚙️"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_bets"
        )
        .setLabel(
          "Apostas"
        )
        .setEmoji(
          "🎲"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_appearance"
        )
        .setLabel(
          "Aparência"
        )
        .setEmoji(
          "🎨"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_fee_set"
        )
        .setLabel(
          "Taxa"
        )
        .setEmoji(
          "💰"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),
  ];
}

function rolesComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "roles_mediator"
        )
        .setLabel(
          "Mediador"
        )
        .setEmoji(
          "🎯"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "roles_admin"
        )
        .setLabel(
          "Administrador"
        )
        .setEmoji(
          "👑"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),
  ];
}

function channelsComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "channel_queue"
        )
        .setLabel(
          "Filas"
        )
        .setEmoji(
          "🎮"
        )
        .setStyle(
          ButtonStyle.Primary
        ),

      new ButtonBuilder()
        .setCustomId(
          "channel_logs"
        )
        .setLabel(
          "Logs"
        )
        .setEmoji(
          "📋"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),
  ];
}

function betsComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "bets_enable"
        )
        .setLabel(
          "Ativar"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "bets_disable"
        )
        .setLabel(
          "Desativar"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    ),
  ];
}

function appearanceComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "appearance_avatar"
        )
        .setLabel(
          "Avatar"
        )
        .setEmoji(
          "🖼️"
        )
        .setStyle(
          ButtonStyle.Primary
        )
    ),
  ];
}

// ============================================================
// FIM DA PARTE 1
// ============================================================function makeQueueKey(
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  return [
    guildId,
    format,
    mode,
    value,
    type,
  ].join("_");
}

function registerQueueMessage(
  channel,
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  const queueId =
    `${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

  const embed =
    new EmbedBuilder()
      .setTitle(
        "🎮 FILA DISPONÍVEL"
      )
      .setDescription(
        [
          `**Formato:** ${format}`,
          `**Modo:** ${modeLabel(mode)}`,
          `**Valor:** ${formatMoney(value)}`,
          `**Tipo:** ${
            type === "bet"
              ? "Aposta"
              : "Normal"
          }`,
        ].join("\n")
      )
      .setTimestamp();

  const components = [
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `queue_join_${queueId}`
          )
          .setLabel(
            "Entrar na fila"
          )
          .setEmoji("🎮")
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            `queue_leave_${queueId}`
          )
          .setLabel(
            "Sair da fila"
          )
          .setEmoji("🚪")
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];

  return channel
    .send({
      embeds: [embed],
      components,
    })
    .then(message => ({
      queueId,
      message,
    }));
}

// ============================================================
// FILA - ENTRAR
// ============================================================

async function handleQueueJoin(
  interaction
) {
  const queueId =
    interaction.customId.replace(
      "queue_join_",
      ""
    );

  if (!interaction.guild) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta ação só pode ser usada em um servidor.",
        ephemeral: true,
      }
    );
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  config.queues =
    config.queues || {};

  const queue =
    config.queues[queueId];

  if (!queue) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa fila não existe mais.",
        ephemeral: true,
      }
    );
  }

  queue.players =
    Array.isArray(
      queue.players
    )
      ? queue.players
      : [];

  if (
    queue.players.includes(
      interaction.user.id
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você já está nessa fila.",
        ephemeral: true,
      }
    );
  }

  queue.players.push(
    interaction.user.id
  );

  saveConfig(config);

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Você entrou na fila.",
      ephemeral: true,
    }
  );
}

// ============================================================
// FILA - SAIR
// ============================================================

async function handleQueueLeave(
  interaction
) {
  const queueId =
    interaction.customId.replace(
      "queue_leave_",
      ""
    );

  if (!interaction.guild) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta ação só pode ser usada em um servidor.",
        ephemeral: true,
      }
    );
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  const queue =
    config.queues?.[
      queueId
    ];

  if (!queue) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa fila não existe mais.",
        ephemeral: true,
      }
    );
  }

  queue.players =
    Array.isArray(
      queue.players
    )
      ? queue.players
      : [];

  queue.players =
    queue.players.filter(
      id =>
        id !==
        interaction.user.id
    );

  saveConfig(config);

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Você saiu da fila.",
      ephemeral: true,
    }
  );
}

// ============================================================
// APOSTA - PRONTO
// ============================================================

async function handleBetReady(
  interaction
) {
  const betId =
    interaction.customId.replace(
      "bet_ready_",
      ""
    );

  if (!interaction.guild) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta ação só pode ser usada em um servidor.",
        ephemeral: true,
      }
    );
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  const bet =
    config.bets?.[
      betId
    ];

  if (!bet) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Aposta não encontrada.",
        ephemeral: true,
      }
    );
  }

  bet.ready =
    Array.isArray(
      bet.ready
    )
      ? bet.ready
      : [];

  if (
    !bet.ready.includes(
      interaction.user.id
    )
  ) {
    bet.ready.push(
      interaction.user.id
    );
  }

  saveConfig(config);

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Você foi marcado como pronto.",
      ephemeral: true,
    }
  );
}

// ============================================================
// APOSTA - CANCELAR
// ============================================================

async function handleBetCancel(
  interaction
) {
  const betId =
    interaction.customId.replace(
      "bet_cancel_",
      ""
    );

  if (!interaction.guild) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Esta ação só pode ser usada em um servidor.",
        ephemeral: true,
      }
    );
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  if (config.bets?.[betId]) {
    delete config.bets[
      betId
    ];

    saveConfig(config);
  }

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Aposta cancelada.",
      ephemeral: true,
    }
  );
}

// ============================================================
// CONFIGURAÇÃO DE FILA
// ============================================================

function createQueueSetupState(
  interaction
) {
  interaction.client.queueSetup =
    interaction.client.queueSetup ||
    {};

  interaction.client.queueSetup[
    interaction.user.id
  ] =
    {
      guildId:
        interaction.guildId,
      format: null,
      mode: null,
      value: null,
      type: "normal",
      createdAt:
        Date.now(),
    };

  return interaction.client
    .queueSetup[
      interaction.user.id
    ];
}

async function handleFilaCommand(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para usar este comando.",
        ephemeral: true,
      }
    );
  }

  createQueueSetupState(
    interaction
  );

  return sendSafeReply(
    interaction,
    {
      content:
        "🎮 **Configuração da fila**\n\nSelecione o formato:",
      components: [
        queueSetupFormatMenu(),
      ],
      ephemeral: true,
    }
  );
}

function channelSelectComponents() {
  return [
    new ActionRowBuilder()
      .addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(
            "queue_setup_channel"
          )
          .setPlaceholder(
            "Selecione o canal"
          )
          .addChannelTypes(
            ChannelType.GuildText
          )
          .setMinValues(1)
          .setMaxValues(1)
      ),
  ];
}

function createCustomQueueModal() {
  return new ModalBuilder()
    .setCustomId(
      "queue_custom_modal"
    )
    .setTitle(
      "Criar fila personalizada"
    )
    .addComponents(
      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "queue_format"
            )
            .setLabel(
              "Formato"
            )
            .setPlaceholder(
              "1x1, 2x2, 3x3 ou 4x4"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true)
        ),

      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "queue_mode"
            )
            .setLabel(
              "Modalidade"
            )
            .setPlaceholder(
              "mobile, emulador ou misto"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true)
        ),

      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "queue_value"
            )
            .setLabel(
              "Valor"
            )
            .setPlaceholder(
              "Ex.: 50"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true)
        )
    );
}

// ============================================================
// MODAL DE TAXA
// ============================================================

function createFeeModal() {
  return new ModalBuilder()
    .setCustomId(
      "fee_modal"
    )
    .setTitle(
      "Configurar taxa do ADM"
    )
    .addComponents(
      new ActionRowBuilder()
        .addComponents(
          new TextInputBuilder()
            .setCustomId(
              "fee_cents"
            )
            .setLabel(
              "Taxa em centavos"
            )
            .setPlaceholder(
              "1 = R$0,01 | 100 = R$1,00"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(6)
        )
    );
}

// ============================================================
// MEDIADORES
// ============================================================

function mediatorPanelEmbed(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  const mediators =
    Array.isArray(
      config.mediators
    )
      ? config.mediators
      : [];

  return new EmbedBuilder()
    .setTitle(
      "🎯 PAINEL DE MEDIADOR"
    )
    .setDescription(
      "Gerencie os mediadores cadastrados."
    )
    .addFields({
      name:
        "Mediadores cadastrados",
      value:
        mediators.length
          ? mediators
              .map(
                id =>
                  `<@${id}>`
              )
              .join("\n")
          : "Nenhum",
    })
    .setTimestamp();
}

async function handleMediatorCommand(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para usar este comando.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        mediatorPanelEmbed(
          interaction.guild.id
        ),
      ],
      components:
        mediatorConfigComponents(),
      ephemeral: true,
    }
  );
}

async function handleMediatorAdd(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem utilizar esta função.",
        ephemeral: true,
      }
    );
  }

  const modal =
    new ModalBuilder()
      .setCustomId(
        "mediator_add_modal"
      )
      .setTitle(
        "Adicionar mediador"
      )
      .addComponents(
        new ActionRowBuilder()
          .addComponents(
            new TextInputBuilder()
              .setCustomId(
                "mediator_id"
              )
              .setLabel(
                "ID do usuário"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true)
              .setMinLength(17)
              .setMaxLength(20)
          )
      );

  return interaction.showModal(
    modal
  );
}

async function handleMediatorRemove(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem utilizar esta função.",
        ephemeral: true,
      }
    );
  }

  const modal =
    new ModalBuilder()
      .setCustomId(
        "mediator_remove_modal"
      )
      .setTitle(
        "Remover mediador"
      )
      .addComponents(
        new ActionRowBuilder()
          .addComponents(
            new TextInputBuilder()
              .setCustomId(
                "mediator_id"
              )
              .setLabel(
                "ID do usuário"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true)
              .setMinLength(17)
              .setMaxLength(20)
          )
      );

  return interaction.showModal(
    modal
  );
}

// ============================================================
// CADASTRO PIX
// ============================================================

async function handleCadastroPix(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem utilizar esta função.",
        ephemeral: true,
      }
    );
  }

  const modal =
    new ModalBuilder()
      .setCustomId(
        "cadastro_pix_modal"
      )
      .setTitle(
        "Cadastrar ADM/Pix"
      )
      .addComponents(
        new ActionRowBuilder()
          .addComponents(
            new TextInputBuilder()
              .setCustomId(
                "pix_user_id"
              )
              .setLabel(
                "ID do ADM"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true)
              .setMinLength(17)
              .setMaxLength(20)
          ),

        new ActionRowBuilder()
          .addComponents(
            new TextInputBuilder()
              .setCustomId(
                "pix_key"
              )
              .setLabel(
                "Chave Pix"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true)
              .setMaxLength(200)
          )
      );

  return interaction.showModal(
    modal
  );
}

// ============================================================
// CADASTRO MEDIADOR
// ============================================================

async function handleCadastroMediator(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem utilizar esta função.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        mediatorPanelEmbed(
          interaction.guild.id
        ),
      ],
      components:
        mediatorConfigComponents(),
      ephemeral: true,
    }
  );
}

// ============================================================
// CONFIGURAÇÃO DE CARGOS
// ============================================================

function rolesConfigEmbed(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  return new EmbedBuilder()
    .setTitle(
      "👥 CONFIGURAÇÃO DE CARGOS"
    )
    .setDescription(
      "Configure os cargos utilizados pelo bot."
    )
    .addFields(
      {
        name:
          "🎯 Mediador",
        value:
          config.roles?.mediator
            ? `<@&${config.roles.mediator}>`
            : "Não configurado",
        inline: true,
      },
      {
        name:
          "👑 Administrador",
        value:
          config.roles?.admin
            ? `<@&${config.roles.admin}>`
            : "Não configurado",
        inline: true,
      }
    )
    .setTimestamp();
}

async function handleConfigRoles(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para usar esta configuração.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        rolesConfigEmbed(
          interaction.guild.id
        ),
      ],
      components:
        rolesComponents(),
      ephemeral: true,
    }
  );
}

// ============================================================
// CONFIGURAÇÃO DE CANAIS
// ============================================================

async function handleConfigChannels(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para usar esta configuração.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        createChannelsEmbed(
          interaction.guild.id
        ),
      ],
      components:
        channelsComponents(),
      ephemeral: true,
    }
  );
}

// ============================================================
// CONFIGURAÇÃO DE APOSTAS
// ============================================================

async function handleConfigBets(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para usar esta configuração.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        createBetsConfigEmbed(
          interaction.guild.id
        ),
      ],
      components:
        betsComponents(),
      ephemeral: true,
    }
  );
}

// ============================================================
// CONFIGURAÇÃO DE APARÊNCIA
// ============================================================

async function handleConfigAppearance(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para usar esta configuração.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        createAppearanceEmbed(
          interaction.guild.id
        ),
      ],
      components:
        appearanceComponents(),
      ephemeral: true,
    }
  );
}

// ============================================================
// CONFIGURAÇÃO GERAL
// ============================================================

async function handleConfigGeneral(
  interaction
) {
  if (!canManage(interaction)) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para usar esta configuração.",
        ephemeral: true,
      }
    );
  }

  return sendSafeReply(
    interaction,
    {
      embeds: [
        createConfigEmbed(
          interaction.guild.id
        ),
      ],
      components:
        configButtons(),
      ephemeral: true,
    }
  );
}

// ============================================================
// RESET
// ============================================================

async function handleConfigReset(
  interaction
) {
  if (!isAdministrator(
    interaction.member
  )) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem utilizar esta função.",
        ephemeral: true,
      }
    );
  }

  saveConfig({
    ...cloneDefaultConfig(),
    guildId:
      interaction.guild.id,
  });

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Configuração resetada.",
      ephemeral: true,
    }
  );
}

// ============================================================
// FIM DA PARTE 2
// ============================================================// ============================================================
// PARTE 3
// ============================================================

function configButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_roles")
        .setLabel("Cargos")
        .setEmoji("👥")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_channels")
        .setLabel("Canais")
        .setEmoji("📺")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("config_general")
        .setLabel("Geral")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_bets")
        .setLabel("Apostas")
        .setEmoji("🎲")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_appearance")
        .setLabel("Aparência")
        .setEmoji("🎨")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("config_fee_set")
        .setLabel("Taxa")
        .setEmoji("💰")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function mediatorConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mediator_add")
        .setLabel("Adicionar")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("mediator_remove")
        .setLabel("Remover")
        .setEmoji("➖")
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function cadastroComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("cadastro_pix")
        .setLabel("ADM/Pix")
        .setEmoji("💰")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("cadastro_mediator")
        .setLabel("Mediadores")
        .setEmoji("🎯")
        .setStyle(ButtonStyle.Primary)
    ),
  ];
}

function feeComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("config_fee_set")
        .setLabel("Configurar taxa")
        .setEmoji("💰")
        .setStyle(ButtonStyle.Primary)
    ),
  ];
}

// ============================================================
// EMBEDS DE CONFIGURAÇÃO
// ============================================================

function createConfigEmbed(guildId) {
  const config =
    getGuildConfig(guildId);

  return new EmbedBuilder()
    .setTitle("⚙️ CONFIGURAÇÃO")
    .setDescription(
      "Configure o funcionamento do bot."
    )
    .addFields(
      {
        name: "👥 Cargo de administrador",
        value:
          config.roles?.admin
            ? `<@&${config.roles.admin}>`
            : "Não configurado",
      },
      {
        name: "🎯 Cargo de mediador",
        value:
          config.roles?.mediator
            ? `<@&${config.roles.mediator}>`
            : "Não configurado",
      }
    )
    .setTimestamp();
}

function createRolesEmbed(guildId) {
  return rolesConfigEmbed(guildId);
}

function rolesComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("roles_mediator")
        .setLabel("Mediador")
        .setEmoji("🎯")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("roles_admin")
        .setLabel("Administrador")
        .setEmoji("👑")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function createChannelsEmbed(guildId) {
  const config =
    getGuildConfig(guildId);

  return new EmbedBuilder()
    .setTitle("📺 CONFIGURAÇÃO DE CANAIS")
    .setDescription(
      "Configure os canais utilizados pelo bot."
    )
    .addFields(
      {
        name: "Fila",
        value:
          config.channels?.queueCategory
            ? `<#${config.channels.queueCategory}>`
            : "Não configurado",
      },
      {
        name: "Logs",
        value:
          config.channels?.logs
            ? `<#${config.channels.logs}>`
            : "Não configurado",
      },
      {
        name: "Pagamentos",
        value:
          config.channels?.payments
            ? `<#${config.channels.payments}>`
            : "Não configurado",
      },
      {
        name: "Resultados",
        value:
          config.channels?.results
            ? `<#${config.channels.results}>`
            : "Não configurado",
      }
    )
    .setTimestamp();
}

function channelsComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("channel_queue")
        .setLabel("Filas")
        .setEmoji("🎮")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("channel_logs")
        .setLabel("Logs")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function createBetsConfigEmbed(guildId) {
  const config =
    getGuildConfig(guildId);

  return new EmbedBuilder()
    .setTitle("🎲 CONFIGURAÇÃO DE APOSTAS")
    .setDescription(
      "Configure as opções relacionadas às apostas."
    )
    .addFields({
      name: "Status",
      value:
        config.betsEnabled
          ? "Ativado"
          : "Desativado",
    })
    .setTimestamp();
}

function betsComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("bets_enable")
        .setLabel("Ativar")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("bets_disable")
        .setLabel("Desativar")
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function createAppearanceEmbed(guildId) {
  const config =
    getGuildConfig(guildId);

  return new EmbedBuilder()
    .setTitle("🎨 APARÊNCIA")
    .setDescription(
      "Configure a aparência das mensagens do bot."
    )
    .addFields({
      name: "Avatar",
      value:
        config.botAvatar
          ? "Configurado"
          : "Não configurado",
    })
    .setTimestamp();
}

function appearanceComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("appearance_avatar")
        .setLabel("Avatar")
        .setEmoji("🖼️")
        .setStyle(ButtonStyle.Primary)
    ),
  ];
}

// ============================================================
// INTERAÇÕES - SELECT MENUS
// ============================================================

async function handleStringSelect(
  interaction
) {
  const id =
    interaction.customId;

  const value =
    interaction.values?.[0];

  if (!value) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Nenhuma opção foi selecionada.",
        ephemeral: true,
      }
    );
  }

  if (
    id === "queue_setup_format"
  ) {
    if (!FORMATS.includes(value)) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Formato inválido.",
          ephemeral: true,
        }
      );
    }

    interaction.client.queueSetup =
      interaction.client.queueSetup ||
      {};

    interaction.client.queueSetup[
      interaction.user.id
    ] =
      interaction.client.queueSetup[
        interaction.user.id
      ] || {
        guildId:
          interaction.guildId,
        format: null,
        mode: null,
        value: null,
        type: "normal",
        createdAt: Date.now(),
      };

    interaction.client.queueSetup[
      interaction.user.id
    ].format = value;

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Formato selecionado: **${value}**.`,
        ephemeral: true,
      }
    );
  }

  if (
    id === "queue_setup_mode"
  ) {
    if (!MODES.includes(value)) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Modalidade inválida.",
          ephemeral: true,
        }
      );
    }

    interaction.client.queueSetup =
      interaction.client.queueSetup ||
      {};

    interaction.client.queueSetup[
      interaction.user.id
    ] =
      interaction.client.queueSetup[
        interaction.user.id
      ] || {
        guildId:
          interaction.guildId,
        format: null,
        mode: null,
        value: null,
        type: "normal",
        createdAt: Date.now(),
      };

    interaction.client.queueSetup[
      interaction.user.id
    ].mode = value;

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Modalidade selecionada: **${modeLabel(
            value
          )}**.`,
        ephemeral: true,
      }
    );
  }

  if (
    id === "queue_setup_value"
  ) {
    const selectedValue =
      Number(value);

    if (
      !Number.isFinite(
        selectedValue
      ) ||
      !VALUES.includes(
        selectedValue
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ O valor selecionado não é válido.",
          ephemeral: true,
        }
      );
    }

    interaction.client.queueSetup =
      interaction.client.queueSetup ||
      {};

    interaction.client.queueSetup[
      interaction.user.id
    ] =
      interaction.client.queueSetup[
        interaction.user.id
      ] || {
        guildId:
          interaction.guildId,
        format: null,
        mode: null,
        value: null,
        type: "normal",
        createdAt: Date.now(),
      };

    interaction.client.queueSetup[
      interaction.user.id
    ].value =
      selectedValue;

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Valor selecionado: **${formatMoney(
            selectedValue
          )}**.`,
        ephemeral: true,
      }
    );
  }

  if (
    id === "queue_setup_type"
  ) {
    if (
      !["normal", "bet"].includes(
        value
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Tipo de fila inválido.",
          ephemeral: true,
        }
      );
    }

    interaction.client.queueSetup =
      interaction.client.queueSetup ||
      {};

    interaction.client.queueSetup[
      interaction.user.id
    ] =
      interaction.client.queueSetup[
        interaction.user.id
      ] || {
        guildId:
          interaction.guildId,
        format: null,
        mode: null,
        value: null,
        type: "normal",
        createdAt: Date.now(),
      };

    interaction.client.queueSetup[
      interaction.user.id
    ].type = value;

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Tipo selecionado: **${
            value === "bet"
              ? "Aposta"
              : "Normal"
          }**.`,
        ephemeral: true,
      }
    );
  }

  return null;
}

// ============================================================
// SELECT DE CANAL
// ============================================================

async function handleQueueSetupChannel(
  interaction
) {
  const channelId =
    interaction.values?.[0];

  if (!channelId) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Canal inválido.",
        ephemeral: true,
      }
    );
  }

  const setup =
    interaction.client.queueSetup?.[
      interaction.user.id
    ];

  if (
    !setup?.format ||
    !setup?.mode ||
    !Number.isFinite(
      Number(setup.value)
    ) ||
    !VALUES.includes(
      Number(setup.value)
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Primeiro selecione formato, modalidade e valor.",
        ephemeral: true,
      }
    );
  }

  try {
    const targetChannel =
      interaction.guild.channels.cache.get(
        channelId
      );

    if (
      !targetChannel ||
      !targetChannel.isTextBased() ||
      targetChannel.type !==
        ChannelType.GuildText
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ O canal selecionado é inválido.",
          ephemeral: true,
        }
      );
    }

    const result =
      await registerQueueMessage(
        targetChannel,
        interaction.guild.id,
        setup.format,
        setup.mode,
        Number(setup.value),
        setup.type || "normal"
      );

    const config =
      getGuildConfig(
        interaction.guild.id
      );

    config.queues =
      config.queues || {};

    config.queues[
      result.queueId
    ] = {
      id:
        result.queueId,
      guildId:
        interaction.guild.id,
      channelId,
      messageId:
        result.message.id,
      format:
        setup.format,
      mode:
        setup.mode,
      value:
        Number(setup.value),
      type:
        setup.type || "normal",
      players: [],
      createdAt:
        Date.now(),
    };

    saveConfig(config);

    delete interaction.client.queueSetup[
      interaction.user.id
    ];

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Fila **${setup.format} ${modeLabel(
            setup.mode
          )} — ${formatMoney(
            setup.value
          )}** publicada em <#${channelId}>.`,
        ephemeral: true,
      }
    );
  } catch (error) {
    console.error(
      "Erro ao publicar fila:",
      error
    );

    return sendSafeReply(
      interaction,
      {
        content:
          `❌ ${error.message}`,
        ephemeral: true,
      }
    );
  }
}

async function handleChannelSelect(
  interaction
) {
  return handleQueueSetupChannel(
    interaction
  );
}

// ============================================================
// MODAIS
// ============================================================

async function handleModal(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id === "fee_modal"
  ) {
    const cents =
      Number(
        interaction.fields.getTextInputValue(
          "fee_cents"
        )
      );

    if (
      !Number.isFinite(cents) ||
      cents < 0
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Valor de taxa inválido.",
          ephemeral: true,
        }
      );
    }

    const config =
      getGuildConfig(
        interaction.guild.id
      );

    config.feeCents =
      Math.floor(cents);

    saveConfig(config);

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ Taxa configurada para **${formatMoney(
            cents / 100
          )}**.`,
        ephemeral: true,
      }
    );
  }

  if (
    id === "queue_custom_modal"
  ) {
    const format =
      interaction.fields
        .getTextInputValue(
          "queue_format"
        )
        .trim()
        .toLowerCase();

    const mode =
      interaction.fields
        .getTextInputValue(
          "queue_mode"
        )
        .trim()
        .toLowerCase();

    const value =
      Number(
        interaction.fields
          .getTextInputValue(
            "queue_value"
          )
      );

    if (!FORMATS.includes(format)) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Formato inválido. Use 1x1, 2x2, 3x3 ou 4x4.",
          ephemeral: true,
        }
      );
    }

    if (!MODES.includes(mode)) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Modalidade inválida. Use mobile, emulador ou misto.",
          ephemeral: true,
        }
      );
    }

    if (
      !Number.isFinite(value) ||
      !VALUES.includes(value)
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Valor inválido.",
          ephemeral: true,
        }
      );
    }

    interaction.client.queueSetup =
      interaction.client.queueSetup ||
      {};

    interaction.client.queueSetup[
      interaction.user.id
    ] = {
      guildId:
        interaction.guildId,
      format,
      mode,
      value,
      type: "normal",
      createdAt:
        Date.now(),
    };

    return sendSafeReply(
      interaction,
      {
        content:
          `🎮 Fila configurada: **${format} ${modeLabel(
            mode
          )} — ${formatMoney(
            value
          )}**\n\nAgora selecione o canal:`,
        components:
          channelSelectComponents(),
        ephemeral: true,
      }
    );
  }

  if (
    id === "mediator_add_modal"
  ) {
    const userId =
      interaction.fields
        .getTextInputValue(
          "mediator_id"
        )
        .trim();

    if (!/^\d{17,20}$/.test(userId)) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ ID de usuário inválido.",
          ephemeral: true,
        }
      );
    }

    const config =
      getGuildConfig(
        interaction.guild.id
      );

    config.mediators =
      Array.isArray(
        config.mediators
      )
        ? config.mediators
        : [];

    if (
      config.mediators.includes(
        userId
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Este usuário já está cadastrado como mediador.",
          ephemeral: true,
        }
      );
    }

    config.mediators.push(
      userId
    );

    saveConfig(config);

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ <@${userId}> foi cadastrado como mediador.`,
        ephemeral: true,
      }
    );
  }

  if (
    id === "mediator_remove_modal"
  ) {
    const userId =
      interaction.fields
        .getTextInputValue(
          "mediator_id"
        )
        .trim();

    const config =
      getGuildConfig(
        interaction.guild.id
      );

    config.mediators =
      Array.isArray(
        config.mediators
      )
        ? config.mediators
        : [];

    if (
      !config.mediators.includes(
        userId
      )
    ) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ Este usuário não está cadastrado como mediador.",
          ephemeral: true,
        }
      );
    }

    config.mediators =
      config.mediators.filter(
        id =>
          id !== userId
      );

    saveConfig(config);

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ <@${userId}> foi removido dos mediadores.`,
        ephemeral: true,
      }
    );
  }

  if (
    id === "cadastro_pix_modal"
  ) {
    const userId =
      interaction.fields
        .getTextInputValue(
          "pix_user_id"
        )
        .trim();

    const pixKey =
      interaction.fields
        .getTextInputValue(
          "pix_key"
        )
        .trim();

    if (!/^\d{17,20}$/.test(userId)) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ ID de usuário inválido.",
          ephemeral: true,
        }
      );
    }

    if (!pixKey) {
      return sendSafeReply(
        interaction,
        {
          content:
            "❌ A chave Pix não pode ficar vazia.",
          ephemeral: true,
        }
      );
    }

    const config =
      getGuildConfig(
        interaction.guild.id
      );

    config.pixAdmins =
      config.pixAdmins || {};

    config.pixAdmins[
      userId
    ] = {
      userId,
      pixKey,
      createdAt:
        Date.now(),
    };

    saveConfig(config);

    return sendSafeReply(
      interaction,
      {
        content:
          `✅ ADM/Pix <@${userId}> cadastrado com sucesso.`,
        ephemeral: true,
      }
    );
  }

  return null;
}

// ============================================================
// BOTÕES
// ============================================================

async function handleButton(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id === "cadastro_pix"
  ) {
    return handleCadastroPix(
      interaction
    );
  }

  if (
    id === "cadastro_mediator"
  ) {
    return handleCadastroMediator(
      interaction
    );
  }

  if (
    id === "mediator_add"
  ) {
    return handleMediatorAdd(
      interaction
    );
  }

  if (
    id === "mediator_remove"
  ) {
    return handleMediatorRemove(
      interaction
    );
  }

  if (
    id === "config_roles"
  ) {
    return handleConfigRoles(
      interaction
    );
  }

  if (
    id === "config_channels"
  ) {
    return handleConfigChannels(
      interaction
    );
  }

  if (
    id === "config_general"
  ) {
    return handleConfigGeneral(
      interaction
    );
  }

  if (
    id === "config_reset"
  ) {
    return handleConfigReset(
      interaction
    );
  }

  if (
    id === "config_queue"
  ) {
    return handleConfigQueue(
      interaction
    );
  }

  if (
    id === "config_bets"
  ) {
    return handleConfigBets(
      interaction
    );
  }

  if (
    id === "config_appearance"
  ) {
    return handleConfigAppearance(
      interaction
    );
  }

  if (
    id === "config_fee_set"
  ) {
    return interaction.showModal(
      createFeeModal()
    );
  }

  if (
    id === "queue_setup_start"
  ) {
    return interaction.showModal(
      createCustomQueueModal()
    );
  }

  if (
    id.startsWith("queue_join_")
  ) {
    return handleQueueJoin(
      interaction
    );
  }

  if (
    id.startsWith("queue_leave_")
  ) {
    return handleQueueLeave(
      interaction
    );
  }

  if (
    id.startsWith("bet_ready_")
  ) {
    return handleBetReady(
      interaction
    );
  }

  if (
    id.startsWith("bet_cancel_")
  ) {
    return handleBetCancel(
      interaction
    );
  }

  return null;
}

// ============================================================
// EVENTO DE INTERAÇÕES
// ============================================================

client.on(
  Events.InteractionCreate,
  async interaction => {
    try {
      if (
        interaction.isChatInputCommand()
      ) {
        return await handleSlashCommand(
          interaction
        );
      }

      if (
        interaction.isButton()
      ) {
        return await handleButton(
          interaction
        );
      }

      if (
        interaction.isStringSelectMenu()
      ) {
        return await handleStringSelect(
          interaction
        );
      }

      if (
        interaction.isChannelSelectMenu()
      ) {
        return await handleChannelSelect(
          interaction
        );
      }

      if (
        interaction.isModalSubmit()
      ) {
        return await handleModal(
          interaction
        );
      }
    } catch (error) {
      console.error(
        "❌ Erro ao processar interação:",
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
  }
);

// ============================================================
// MENSAGENS
// ============================================================

client.on(
  Events.MessageCreate,
  async message => {
    try {
      if (
        message.author.bot ||
        !message.guild
      ) {
        return;
      }

      const config =
        getGuildConfig(
          message.guild.id
        );

      const prefix =
        config.settings?.prefix ||
        "!";

      if (
        !message.content.startsWith(
          prefix
        )
      ) {
        return;
      }

      const args =
        message.content
          .slice(prefix.length)
          .trim()
          .split(/\s+/);

      const command =
        args
          .shift()
          ?.toLowerCase();

      if (!command) {
        return;
      }

      if (
        !isAdministrator(
          message.member
        )
      ) {
        return message.reply(
          "❌ Apenas administradores podem utilizar este comando."
        );
      }

      if (
        command === "cadastro"
      ) {
        return message.reply({
          embeds: [
            createCadastroEmbed(
              message.guild.id
            ),
          ],
          components:
            cadastroComponents(),
        });
      }

      if (
        command === "config"
      ) {
        return message.reply({
          embeds: [
            createConfigEmbed(
              message.guild.id
            ),
          ],
          components:
            configButtons(),
        });
      }

      if (
        command === "fila"
      ) {
        createQueueSetupState(
          {
            client,
            user: message.author,
            guildId:
              message.guild.id,
          }
        );

        return message.reply({
          content:
            "🎮 **Configuração da fila**\n\nSelecione o formato:",
          components: [
            queueSetupFormatMenu(),
          ],
        });
      }

      if (
        command === "med"
      ) {
        return message.reply({
          embeds: [
            mediatorPanelEmbed(
              message.guild.id
            ),
          ],
          components:
            mediatorConfigComponents(),
        });
      }
    } catch (error) {
      console.error(
        "Erro ao processar mensagem:",
        error
      );
    }
  }
);

// ============================================================
// COMANDOS SLASH
// ============================================================

const slashCommands = [
  new SlashCommandBuilder()
    .setName("cadastro")
    .setDescription(
      "Gerencia ADM/Pix e mediadores."
    ),

  new SlashCommandBuilder()
    .setName("fila")
    .setDescription(
      "Cria uma nova fila."
    ),

  new SlashCommandBuilder()
    .setName("config")
    .setDescription(
      "Abre a configuração do bot."
    ),

  new SlashCommandBuilder()
    .setName("med")
    .setDescription(
      "Abre o painel de mediadores."
    ),
];

async function registerSlashCommands() {
  if (!CLIENT_ID) {
    console.error(
      "❌ CLIENT_ID não configurado."
    );
    return;
  }

  try {
    const rest =
      new REST({
        version: "10",
      }).setToken(
        TOKEN
      );

    const body =
      slashCommands.map(
        command =>
          command.toJSON()
      );

    if (GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(
          CLIENT_ID,
          GUILD_ID
        ),
        {
          body,
        }
      );

      console.log(
        "✅ Comandos slash registrados no servidor."
      );
    } else {
      await rest.put(
        Routes.applicationCommands(
          CLIENT_ID
        ),
        {
          body,
        }
      );

      console.log(
        "✅ Comandos slash registrados globalmente."
      );
    }
  } catch (error) {
    console.error(
      "❌ Erro ao registrar comandos slash:",
      error
    );
  }
}

// ============================================================
// READY
// ============================================================

client.once(
  Events.ClientReady,
  async readyClient => {
    try {
      console.log(
        `✅ ${readyClient.user.tag} está online.`
      );

      readyClient.user.setPresence({
        activities: [
          {
            name:
              "Gerenciando filas 🎮",
          },
        ],
        status: "online",
      });

      const config =
        loadConfig();

      if (GUILD_ID) {
        config.guildId =
          GUILD_ID;
      }

      saveConfig(config);

      await registerSlashCommands();
    } catch (error) {
      console.error(
        "❌ Erro no evento ready:",
        error
      );
    }
  }
);

// ============================================================
// ERROS DO PROCESSO
// ============================================================

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "Unhandled Promise Rejection:",
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

// ============================================================
// LOGIN
// ============================================================

client
  .login(TOKEN)
  .then(() => {
    console.log(
      "🔐 Login realizado com sucesso."
    );
  })
  .catch(error => {
    console.error(
      "❌ Erro ao fazer login:",
      error
    );

    process.exit(1);
  });
