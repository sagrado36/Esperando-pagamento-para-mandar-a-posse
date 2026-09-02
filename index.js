// index.js
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
  SlashCommandBuilder,
  REST,
  Routes,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    "Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID no arquivo .env"
  );
  process.exit(1);
}

const PREFIX = ".";

const DATA_DIR = path.join(
  __dirname,
  "data"
);

const DB_FILE = path.join(
  DATA_DIR,
  "database.json"
);

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true,
  });
}

const DEFAULT_DB = {
  guilds: {},
  users: {},
  queues: {},
  bets: {},
  analyses: {},
};

function cloneDefaultDB() {
  return JSON.parse(
    JSON.stringify(DEFAULT_DB)
  );
}

function loadDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return cloneDefaultDB();
    }

    const raw =
      fs.readFileSync(
        DB_FILE,
        "utf8"
      );

    if (!raw.trim()) {
      return cloneDefaultDB();
    }

    const parsed =
      JSON.parse(raw);

    return {
      ...cloneDefaultDB(),
      ...parsed,
      guilds:
        parsed.guilds || {},
      users:
        parsed.users || {},
      queues:
        parsed.queues || {},
      bets:
        parsed.bets || {},
      analyses:
        parsed.analyses || {},
    };
  } catch (error) {
    console.error(
      "Erro ao carregar database:",
      error
    );

    return cloneDefaultDB();
  }
}

let db = loadDatabase();

function saveDatabase() {
  try {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(
        db,
        null,
        2
      ),
      "utf8"
    );
  } catch (error) {
    console.error(
      "Erro ao salvar database:",
      error
    );
  }
}

const VALUES = [
  30,
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
  10000,
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

const client =
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [
      Partials.Channel,
      Partials.Message,
    ],
  });

const pendingMediators =
  new Map();

const pendingAdmins =
  new Map();

function formatMoney(
  cents
) {
  return `R$ ${(Number(cents) / 100)
    .toFixed(2)
    .replace(".", ",")}`;
}

function modeLabel(
  mode
) {
  if (mode === "mobile") {
    return "📱 Mobile";
  }

  if (mode === "emulador") {
    return "🖥️ Emulador";
  }

  if (mode === "misto") {
    return "🎮 Misto";
  }

  return mode;
}

function getGuildConfig(
  guildId
) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      mediatorRoleId: null,
      analystRoleId: null,

      analysisChannelMobile:
        null,

      analysisChannelEmulator:
        null,

      betsCategoryId:
        null,

      mediatorQueueChannelId:
        null,

      embedColor:
        "#000000",

      botAvatar:
        null,

      admFee:
        1,

      pixAdmins:
        [],

      mediatorQueue:
        [],

      mediatorRotationIndex:
        0,

      queueMessages:
        {},

      mediators:
        [],
    };

    saveDatabase();
  }

  const config =
    db.guilds[guildId];

  if (
    !Array.isArray(
      config.pixAdmins
    )
  ) {
    config.pixAdmins =
      [];
  }

  if (
    !Array.isArray(
      config.mediators
    )
  ) {
    config.mediators =
      [];
  }

  if (
    !Array.isArray(
      config.mediatorQueue
    )
  ) {
    config.mediatorQueue =
      [];
  }

  if (
    !config.queueMessages ||
    typeof config.queueMessages !==
      "object"
  ) {
    config.queueMessages =
      {};
  }

  if (
    typeof config.admFee !==
    "number"
  ) {
    config.admFee =
      1;
  }

  return config;
}

function isAdministrator(
  member
) {
  return Boolean(
    member &&
      member.permissions &&
      member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
  );
}

function isRegisteredMediator(
  member,
  guildId
) {
  if (!member) {
    return false;
  }

  const config =
    getGuildConfig(
      guildId
    );

  return config.mediators.some(
    (item) =>
      String(item.id) ===
      String(member.id)
  );
}

function hasMediatorRole(
  member,
  guildId
) {
  if (!member) {
    return false;
  }

  if (
    isRegisteredMediator(
      member,
      guildId
    )
  ) {
    return true;
  }

  const config =
    getGuildConfig(
      guildId
    );

  if (
    !config.mediatorRoleId
  ) {
    return false;
  }

  return member.roles.cache.has(
    config.mediatorRoleId
  );
}

function queueKey(
  format,
  mode,
  value,
  type = "normal"
) {
  if (
    format === "1x1"
  ) {
    return `1x1_${mode}_${value}`;
  }

  return `${format}_${mode}_${value}_${type}`;
}

function ensureQueue(
  format,
  mode,
  value,
  type = "normal"
) {
  const key =
    queueKey(
      format,
      mode,
      value,
      type
    );

  if (!db.queues[key]) {
    db.queues[key] = {
      format,
      mode,
      value,
      type,
      players: [],
      choices: {},
      createdAt:
        Date.now(),
    };
  }

  if (
    !Array.isArray(
      db.queues[key].players
    )
  ) {
    db.queues[key].players =
      [];
  }

  if (
    !db.queues[key].choices ||
    typeof db.queues[key].choices !==
      "object"
  ) {
    db.queues[key].choices =
      {};
  }

  return db.queues[key];
}

function createEmbed(
  guildId,
  title,
  description
) {
  const config =
    getGuildConfig(
      guildId
    );

  const embed =
    new EmbedBuilder()
      .setTitle(title)
      .setDescription(
        description || ""
      )
      .setColor(
        config.embedColor ||
          "#000000"
      );

  if (
    config.botAvatar
  ) {
    embed.setThumbnail(
      config.botAvatar
    );
  }

  return embed;
}

function backButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        "config_back"
      )
      .setLabel(
        "Voltar"
      )
      .setStyle(
        ButtonStyle.Secondary
      )
  );
}

function configMainEmbed(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  return createEmbed(
    guild.id,
    "⚙️ CONFIGURAÇÃO DO BOT",
    [
      "Configure todos os sistemas do bot por este painel.",
      "",
      `🛡️ Mediador: ${
        config.mediatorRoleId
          ? `<@&${config.mediatorRoleId}>`
          : "Não configurado"
      }`,
      `🔎 Analista: ${
        config.analystRoleId
          ? `<@&${config.analystRoleId}>`
          : "Não configurado"
      }`,
      `📱 Canal .ssmob: ${
        config.analysisChannelMobile
          ? `<#${config.analysisChannelMobile}>`
          : "Não configurado"
      }`,
      `🖥️ Canal .ssemu: ${
        config.analysisChannelEmulator
          ? `<#${config.analysisChannelEmulator}>`
          : "Não configurado"
      }`,
      `🎲 Categoria das apostas: ${
        config.betsCategoryId
          ? `<#${config.betsCategoryId}>`
          : "Não configurada"
      }`,
      `👥 Fila de mediadores: ${
        config.mediatorQueueChannelId
          ? `<#${config.mediatorQueueChannelId}>`
          : "Não configurada"
      }`,
      `🛡️ Mediadores cadastrados: ${
        config.mediators.length
      }`,
      `👤 ADMs cadastrados: ${
        config.pixAdmins.length
      }`,
      `💰 Taxa do ADM: ${
        formatMoney(
          config.admFee
        )
      }`,
    ].join("\n")
  );
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
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_admins"
        )
        .setLabel(
          "ADMs"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_channels"
        )
        .setLabel(
          "Canais"
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
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config_mediators"
        )
        .setLabel(
          "Mediadores"
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
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_fee"
        )
        .setLabel(
          "Taxa"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "config_queue"
        )
        .setLabel(
          "Filas"
        )
        .setStyle(
          ButtonStyle.Primary
        )
    ),
  ];
}

function roleConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(
          "select_mediator_role"
        )
        .setPlaceholder(
          "Selecione o cargo Mediador"
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(
          "select_analyst_role"
        )
        .setPlaceholder(
          "Selecione o cargo Analista"
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
          "select_channel_mobile"
        )
        .setPlaceholder(
          "Selecione o Canal 1 — .ssmob"
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
          "select_channel_emulator"
        )
        .setPlaceholder(
          "Selecione o Canal 2 — .ssemu"
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
          "select_bets_category"
        )
        .setPlaceholder(
          "Selecione a categoria das apostas"
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
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "select_mediator_channel"
        )
        .setPlaceholder(
          "Selecione o canal da fila de mediadores"
        )
        .setChannelTypes(
          ChannelType.GuildText
        )
        .setMinValues(1)
        .setMaxValues(1)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "mediator_add"
        )
        .setLabel(
          "Adicionar Mediador"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "mediator_list"
        )
        .setLabel(
          "Ver Mediadores"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "publish_mediator_queue"
        )
        .setLabel(
          "Publicar Fila"
        )
        .setStyle(
          ButtonStyle.Primary
        )
    ),

    backButton(),
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
          "Foto do bot"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "appearance_color"
        )
        .setLabel(
          "Cor da embed"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    backButton(),
  ];
}

function feeComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config_fee_modal"
        )
        .setLabel(
          "Configurar Taxa"
        )
        .setStyle(
          ButtonStyle.Primary
        )
    ),

    backButton(),
  ];
}

function adminComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "admin_add"
        )
        .setLabel(
          "Cadastrar ADM"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "admin_list"
        )
        .setLabel(
          "Ver ADMs"
        )
        .setStyle(
          ButtonStyle.Secondary
        )
    ),

    backButton(),
  ];
}

function createAdminIdModal() {
  return new ModalBuilder()
    .setCustomId(
      "admin_id_modal"
    )
    .setTitle(
      "Cadastrar ADM — 1/2"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "admin_user_id"
          )
          .setLabel(
            "ID do usuário Discord"
          )
          .setPlaceholder(
            "Ex.: 123456789012345678"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(
            true
          )
          .setMinLength(
            17
          )
          .setMaxLength(
            20
          )
      )
    );
}

function createAdminPixModal() {
  return new ModalBuilder()
    .setCustomId(
      "admin_pix_modal"
    )
    .setTitle(
      "Cadastrar ADM — 2/2"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "admin_name"
          )
          .setLabel(
            "Nome do ADM"
          )
          .setPlaceholder(
            "Nome para identificação"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(
            true
          )
          .setMaxLength(
            100
          )
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "admin_pix_key"
          )
          .setLabel(
            "Chave Pix"
          )
          .setPlaceholder(
            "CPF, CNPJ, e-mail, telefone ou chave aleatória"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(
            true
          )
          .setMaxLength(
            200
          )
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "admin_pix_qr"
          )
          .setLabel(
            "URL do QR Code Pix (opcional)"
          )
          .setPlaceholder(
            "Cole a URL da imagem do QR Code"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(
            false
          )
          .setMaxLength(
            1000
          )
      )
    );
}

function createFeeModal() {
  return new ModalBuilder()
    .setCustomId(
      "fee_modal"
    )
    .setTitle(
      "Configurar Taxa do ADM"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "adm_fee"
          )
          .setLabel(
            "Taxa em centavos"
          )
          .setPlaceholder(
            "Ex.: 1 = R$ 0,01 | 100 = R$ 1,00"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(
            true
          )
          .setMinLength(
            1
          )
          .setMaxLength(
            6
          )
      )
    );
}function createAvatarModal() {
  return new ModalBuilder()
    .setCustomId(
      "appearance_avatar_modal"
    )
    .setTitle(
      "Alterar foto do bot"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "bot_avatar"
          )
          .setLabel(
            "URL da imagem"
          )
          .setPlaceholder(
            "https://..."
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(
            true
          )
          .setMaxLength(
            1000
          )
      )
    );
}

function createColorModal() {
  return new ModalBuilder()
    .setCustomId(
      "appearance_color_modal"
    )
    .setTitle(
      "Alterar cor da embed"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "embed_color"
          )
          .setLabel(
            "Cor hexadecimal"
          )
          .setPlaceholder(
            "#000000"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(
            true
          )
          .setMinLength(
            4
          )
          .setMaxLength(
            7
          )
      )
    );
}

async function sendSafeReply(
  interaction,
  payload
) {
  try {
    if (
      interaction.replied ||
      interaction.deferred
    ) {
      return await interaction.followUp(
        payload
      );
    }

    return await interaction.reply(
      payload
    );
  } catch (error) {
    console.error(
      "Erro ao responder interaction:",
      error
    );
  }
}

async function refreshMediatorQueueMessage(
  guild
) {
  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !config.mediatorQueueChannelId
  ) {
    return;
  }

  const channel =
    await guild.channels
      .fetch(
        config.mediatorQueueChannelId
      )
      .catch(
        () => null
      );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    return;
  }

  const embed =
    mediatorQueueEmbed(
      guild
    );

  const components =
    mediatorQueueButtons();

  let message = null;

  if (
    config.mediatorQueueMessageId
  ) {
    message =
      await channel.messages
        .fetch(
          config.mediatorQueueMessageId
        )
        .catch(
          () => null
        );
  }

  if (message) {
    await message
      .edit({
        embeds: [
          embed,
        ],
        components,
      })
      .catch(
        () => null
      );

    return;
  }

  message =
    await channel.send({
      embeds: [
        embed,
      ],
      components,
    });

  config.mediatorQueueMessageId =
    message.id;

  saveDatabase();
}

async function registerQueueMessage(
  guild,
  key,
  message
) {
  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !config.queueMessages ||
    typeof config.queueMessages !==
      "object"
  ) {
    config.queueMessages =
      {};
  }

  config.queueMessages[key] =
    message.id;

  saveDatabase();
}

async function publishQueues(
  guild,
  format,
  mode,
  selectedChannelId = null
) {
  const config =
    getGuildConfig(
      guild.id
    );

  let channelId =
    selectedChannelId;

  if (
    !channelId
  ) {
    if (
      mode ===
      "mobile"
    ) {
      channelId =
        config.analysisChannelMobile;
    } else if (
      mode ===
      "emulador"
    ) {
      channelId =
        config.analysisChannelEmulator;
    } else if (
      mode ===
      "misto"
    ) {
      channelId =
        config.analysisChannelMobile ||
        config.analysisChannelEmulator;
    }
  }

  if (
    !channelId
  ) {
    throw new Error(
      "Canal das filas não configurado."
    );
  }

  const channel =
    await guild.channels
      .fetch(
        channelId
      )
      .catch(
        () => null
      );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      "Canal das filas inválido."
    );
  }

  const values = [
    ...VALUES,
  ].sort(
    (a, b) =>
      b - a
  );

  for (
    const value of values
  ) {
    if (
      format ===
      "1x1"
    ) {
      const key =
        makeQueueKey(
          format,
          mode,
          value,
          "normal"
        );

      const queue =
        getQueue(
          format,
          mode,
          value,
          "normal"
        );

      const embed =
        queueEmbed(
          guild,
          queue
        );

      const components =
        queueButtons(
          format,
          mode,
          value
        );

      let message =
        null;

      if (
        config.queueMessages &&
        config.queueMessages[key]
      ) {
        message =
          await channel.messages
            .fetch(
              config.queueMessages[key]
            )
            .catch(
              () => null
            );
      }

      if (message) {
        await message
          .edit({
            embeds: [
              embed,
            ],
            components,
          })
          .catch(
            () => null
          );
      } else {
        message =
          await channel.send({
            embeds: [
              embed,
            ],
            components,
          });

        await registerQueueMessage(
          guild,
          key,
          message
        );
      }

      continue;
    }

    const key =
      makeQueueKey(
        format,
        mode,
        value,
        "normal"
      );

    const queue =
      getQueue(
        format,
        mode,
        value,
        "normal"
      );

    const embed =
      queueEmbed(
        guild,
        queue
      );

    const components =
      queueButtons(
        format,
        mode,
        value
      );

    let message =
      null;

    if (
      config.queueMessages &&
      config.queueMessages[key]
    ) {
      message =
        await channel.messages
          .fetch(
            config.queueMessages[key]
          )
          .catch(
            () => null
          );
    }

    if (message) {
      await message
        .edit({
          embeds: [
            embed,
          ],
          components,
        })
        .catch(
          () => null
        );
    } else {
      message =
        await channel.send({
          embeds: [
            embed,
          ],
          components,
        });

      await registerQueueMessage(
        guild,
        key,
        message
      );
    }
  }

  saveDatabase();
}

async function joinQueue(
  interaction,
  format,
  mode,
  value,
  type = "normal"
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa ação só pode ser usada dentro de um servidor.",
        ephemeral: true,
      }
    );
  }

  const queue =
    getQueue(
      format,
      mode,
      value,
      type
    );

  const userId =
    interaction.user.id;

  if (
    queue.players.includes(
      userId
    )
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Você já está nessa fila.",
        ephemeral: true,
      }
    );
  }

  const maxPlayers =
    requiredPlayers(
      format
    );

  if (
    queue.players.length >=
    maxPlayers
  ) {
    return handleQueueFull(
      interaction,
      format,
      mode,
      value,
      type
    );
  }

  queue.players.push(
    userId
  );

  db.users[userId] =
    db.users[userId] ||
    {
      id: userId,
      username:
        interaction.user.username,
    };

  db.users[userId].username =
    interaction.user.username;

  saveDatabase();

  await refreshQueueMessage(
    guild,
    format,
    mode,
    value,
    type
  );

  return sendSafeReply(
    interaction,
    {
      content:
        `✅ Você entrou na fila de ${formatMoney(
          value
        )}.`,
      ephemeral: true,
    }
  );
}

async function leaveQueue(
  interaction,
  format,
  mode,
  value,
  type = "normal"
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return sendSafeReply(
      interaction,
      {
        content:
          "❌ Essa ação só pode ser usada dentro de um servidor.",
        ephemeral: true,
      }
    );
  }

  const queue =
    getQueue(
      format,
      mode,
      value,
      type
    );

  const index =
    queue.players.indexOf(
      interaction.user.id
    );

  if (
    index === -1
  ) {
    return sendSafeReply(
      interaction,
      {
        content:
          "⚠️ Você não está nessa fila.",
        ephemeral: true,
      }
    );
  }

  queue.players.splice(
    index,
    1
  );

  saveDatabase();

  await refreshQueueMessage(
    guild,
    format,
    mode,
    value,
    type
  );

  return sendSafeReply(
    interaction,
    {
      content:
        "✅ Você saiu da fila.",
      ephemeral: true,
    }
  );
}  if (
    id === "avatar_modal"
  ) {
    const avatarUrl =
      interaction.fields.getTextInputValue(
        "avatar_url"
      );

    config.botAvatar =
      avatarUrl;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Foto do bot salva com sucesso.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    id === "color_modal"
  ) {
    const color =
      interaction.fields.getTextInputValue(
        "embed_color"
      );

    if (
      !/^#?[0-9A-Fa-f]{6}$/.test(
        color.trim()
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Cor inválida. Use, por exemplo, `#5865F2`.",
          ephemeral: true,
        }
      );

      return;
    }

    config.embedColor =
      normalizeColor(
        color
      );

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          `✅ Cor alterada para ${config.embedColor}.`,
        ephemeral: true,
      }
    );

    return;
  }
}

async function handleMediatorQueueButton(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return;
  }

  const member =
    interaction.member;

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    !hasMediatorRole(
      member,
      guild.id
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não possui o cargo de Mediador.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    interaction.customId ===
    "mediator_queue_join"
  ) {
    if (
      config.mediatorQueue.includes(
        interaction.user.id
      )
    ) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Você já está na fila de mediadores.",
          ephemeral: true,
        }
      );

      return;
    }

    config.mediatorQueue.push(
      interaction.user.id
    );

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          "✅ Você entrou na fila de mediadores.",
        ephemeral: true,
      }
    );

    await interaction.message.edit({
      embeds: [
        mediatorQueueEmbed(
          guild.id
        ),
      ],
      components:
        mediatorQueueButtons(),
    });

    return;
  }

  if (
    interaction.customId ===
    "mediator_queue_leave"
  ) {
    const index =
      config.mediatorQueue.indexOf(
        interaction.user.id
      );

    if (index === -1) {
      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Você não está na fila de mediadores.",
          ephemeral: true,
        }
      );

      return;
    }

    config.mediatorQueue.splice(
      index,
      1
    );

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          "🚪 Você saiu da fila de mediadores.",
        ephemeral: true,
      }
    );

    await interaction.message.edit({
      embeds: [
        mediatorQueueEmbed(
          guild.id
        ),
      ],
      components:
        mediatorQueueButtons(),
    });

    return;
  }
}

async function handleButton(
  interaction
) {
  const id =
    interaction.customId;

  if (
    id.startsWith(
      "queue_join|"
    )
  ) {
    const parts =
      id.split("|");

    const format =
      parts[1];

    const mode =
      parts[2];

    const value =
      Number(parts[3]);

    const type =
      parts[4] ||
      "normal";

    await handleQueueButton(
      interaction,
      format,
      mode,
      value,
      type
    );

    return;
  }

  if (
    id.startsWith(
      "queue_leave|"
    )
  ) {
    const parts =
      id.split("|");

    const format =
      parts[1];

    const mode =
      parts[2];

    const value =
      Number(parts[3]);

    const type =
      parts[4] ||
      "normal";

    await leaveQueue(
      interaction,
      format,
      mode,
      value,
      type
    );

    return;
  }

  if (
    id.startsWith(
      "queue_full|"
    )
  ) {
    await handleQueueFull(
      interaction
    );

    return;
  }

  if (
    id.startsWith(
      "mediator_queue_"
    )
  ) {
    await handleMediatorQueueButton(
      interaction
    );

    return;
  }

  if (
    id.startsWith(
      "config_"
    ) ||
    id.startsWith(
      "admin_"
    ) ||
    id.startsWith(
      "mediator_"
    ) ||
    id.startsWith(
      "appearance_"
    )
  ) {
    await handleConfigButton(
      interaction
    );

    return;
  }

  if (
    id.startsWith(
      "bet_confirm|"
    )
  ) {
    await handleBetConfirm(
      interaction
    );

    return;
  }

  if (
    id.startsWith(
      "bet_cancel|"
    )
  ) {
    await handleBetCancel(
      interaction
    );

    return;
  }

  if (
    id ===
    "fila_back"
  ) {
    await commandFila(
      interaction
    );

    return;
  }
}

async function handleSelectMenu(
  interaction
) {
  if (
    interaction.isRoleSelectMenu()
  ) {
    await handleRoleSelect(
      interaction
    );

    return;
  }

  if (
    interaction.isStringSelectMenu()
  ) {
    await handleStringSelect(
      interaction
    );

    return;
  }

  if (
    interaction.isChannelSelectMenu()
  ) {
    await handleChannelSelect(
      interaction
    );

    return;
  }
}

function slashCommands() {
  return [
    new SlashCommandBuilder()
      .setName("fila")
      .setDescription(
        "Publica as filas de apostas"
      ),

    new SlashCommandBuilder()
      .setName("med")
      .setDescription(
        "Publica a fila de mediadores"
      ),

    new SlashCommandBuilder()
      .setName("config")
      .setDescription(
        "Abre a configuração do bot"
      ),
  ].map(
    (command) =>
      command.toJSON()
  );
}

async function commandFila(
  interaction
) {
  if (
    !interaction.guild
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Use este comando dentro de um servidor.",
        ephemeral: true,
      }
    );

    return;
  }

  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem publicar filas.",
        ephemeral: true,
      }
    );

    return;
  }

  const formatMenu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "fila_format"
      )
      .setPlaceholder(
        "Selecione o formato"
      )
      .addOptions(
        FORMATS.map(
          (format) => ({
            label:
              format,
            value:
              format,
            description:
              `Fila ${format}`,
          })
        )
      );

  await sendSafeReply(
    interaction,
    {
      embeds: [
        createEmbed(
          interaction.guild.id,
          "🎮 PUBLICAR FILAS",
          "Primeiro selecione o **Formato**.\n\nDepois você escolherá a **Modalidade** e, por último, o **Canal**."
        ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          formatMenu
        ),
      ],
    }
  );
}

async function commandMed(
  interaction
) {
  if (
    !interaction.guild
  ) {
    return;
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  if (
    !config.mediatorQueueChannelId
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Configure primeiro o canal da fila de mediadores.",
        ephemeral: true,
      }
    );

    return;
  }

  const channel =
    await interaction.guild.channels.fetch(
      config.mediatorQueueChannelId
    ).catch(
      () => null
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ O canal da fila de mediadores é inválido.",
        ephemeral: true,
      }
    );

    return;
  }

  await channel.send({
    embeds: [
      mediatorQueueEmbed(
        interaction.guild.id
      ),
    ],
    components:
      mediatorQueueButtons(),
  });

  await sendSafeReply(
    interaction,
    {
      content:
        `✅ Fila de mediadores publicada em <#${channel.id}>.`,
      ephemeral: true,
    }
  );
}

async function commandConfig(
  interaction
) {
  if (
    !interaction.guild
  ) {
    return;
  }

  if (
    !isAdministrator(
      interaction.member
    )
  ) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem abrir a configuração.",
        ephemeral: true,
      }
    );

    return;
  }

  await sendSafeReply(
    interaction,
    {
      embeds: [
        configMainEmbed(
          interaction.guild
        ),
      ],
      components:
        configButtons(),
      ephemeral: true,
    }
  );
}

async function handleCommand(
  message
) {
  if (
    message.author.bot
  ) {
    return;
  }

  if (
    !message.guild
  ) {
    return;
  }

  if (
    !message.content.startsWith(
      PREFIX
    )
  ) {
    return;
  }

  const args =
    message.content
      .slice(
        PREFIX.length
      )
      .trim()
      .split(
        /\s+/
      );

  const command =
    args
      .shift()
      ?.toLowerCase();

  if (!command) {
    return;
  }

  if (
    command ===
    "ssmob"
  ) {
    await createAnalysisRequest(
      message,
      "mobile"
    );

    return;
  }

  if (
    command ===
    "ssemu"
  ) {
    await createAnalysisRequest(
      message,
      "emulador"
    );

    return;
  }

  if (
    command ===
    "fila"
  ) {
    return;
  }

  if (
    command ===
    "med"
  ) {
    return;
  }
}  return message;
}


client.once(
  "ready",
  async () => {
    console.log(
      `✅ Bot conectado como ${client.user.tag}`
    );

    console.log(
      `📡 Servindo ${client.guilds.cache.size} servidor(es).`
    );

    for (
      const guild of client.guilds.cache.values()
    ) {
      try {
        await guild.commands.set([
          new SlashCommandBuilder()
            .setName("fila")
            .setDescription(
              "Cria as filas de apostas"
            )
            .toJSON(),
        ]);
      } catch (error) {
        console.error(
          `Erro ao registrar comandos em ${guild.id}:`,
          error
        );
      }
    }
  }
);

client.on(
  "interactionCreate",
  async (interaction) => {
    try {
      if (
        interaction.isButton()
      ) {
        await handleButton(
          interaction
        );

        return;
      }

      if (
        interaction.isStringSelectMenu()
      ) {
        await handleSelectMenu(
          interaction
        );

        return;
      }

      if (
        interaction.isRoleSelectMenu()
      ) {
        await handleRoleSelect(
          interaction
        );

        return;
      }

      if (
        interaction.isChannelSelectMenu()
      ) {
        await handleChannelSelect(
          interaction
        );

        return;
      }

      if (
        interaction.isModalSubmit()
      ) {
        await handleModalSubmit(
          interaction
        );

        return;
      }

      if (
        interaction.isChatInputCommand()
      ) {
        if (
          interaction.commandName ===
          "fila"
        ) {
          if (
            !isAdministrator(
              interaction.member
            )
          ) {
            await sendSafeReply(
              interaction,
              {
                content:
                  "❌ Apenas administradores podem criar filas.",
                ephemeral: true,
              }
            );

            return;
          }

          const row =
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(
                  "fila_format"
                )
                .setPlaceholder(
                  "Selecione o formato"
                )
                .addOptions(
                  FORMATS.map(
                    (format) => ({
                      label:
                        format,
                      value:
                        format,
                    })
                  )
                )
            );

          await sendSafeReply(
            interaction,
            {
              content:
                "🎮 **Configuração da fila**\n\n" +
                "Selecione o formato:",
              components: [
                row,
              ],
              ephemeral: true,
            }
          );

          return;
        }
      }
    } catch (error) {
      console.error(
        "Erro em interactionCreate:",
        error
      );

      await sendSafeReply(
        interaction,
        {
          content:
            "❌ Ocorreu um erro ao processar esta interação.",
          ephemeral: true,
        }
      );
    }
  }
);

client.on(
  "messageCreate",
  async (message) => {
    try {
      if (
        message.author.bot
      ) {
        return;
      }

      await handleCommand(
        message
      );
    } catch (error) {
      console.error(
        "Erro em messageCreate:",
        error
      );
    }
  }
);

process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "Unhandled Promise Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "Uncaught Exception:",
      error
    );
  }
);

client.login(TOKEN).catch(
  (error) => {
    console.error(
      "Erro ao fazer login:",
      error
    );
  }
);
