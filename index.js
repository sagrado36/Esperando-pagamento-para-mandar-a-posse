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

/*
 * VALORES DAS FILAS
 *
 * Os valores ficam armazenados
 * em centavos.
 */
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

/*
 * CLIENT GLOBAL
 *
 * O client precisa ficar fora
 * de qualquer função.
 */
const client = new Client({
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

      pixAdmins: [],

      mediatorQueue: [],

      mediatorRotationIndex:
        0,

      queueMessages: {},
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
    config.pixAdmins = [];
  }

  if (
    !Array.isArray(
      config.mediatorQueue
    )
  ) {
    config.mediatorQueue = [];
  }

  if (
    !Array.isArray(
      config.mediators
    )
  ) {
    config.mediators = [];
  }

  if (!config.embedColor) {
    config.embedColor =
      "#000000";
  }

  if (
    !Number.isFinite(
      Number(config.admFee)
    )
  ) {
    config.admFee = 1;
  }

  if (
    !config.queueMessages ||
    typeof config.queueMessages !==
      "object"
  ) {
    config.queueMessages = {};
  }

  return config;
}

function getUserData(
  userId
) {
  if (!db.users[userId]) {
    db.users[userId] = {
      wins: 0,
      losses: 0,
      coins: 0,
    };

    saveDatabase();
  }

  return db.users[userId];
}

function generateId(
  prefix = "id"
) {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function formatMoney(
  cents
) {
  return `R$ ${(Number(cents) / 100)
    .toFixed(2)
    .replace(".", ",")}`;
}

function normalizeColor(
  color
) {
  if (!color) {
    return "#000000";
  }

  const value =
    String(color).trim();

  if (
    /^#[0-9A-Fa-f]{6}$/.test(
      value
    )
  ) {
    return value;
  }

  if (
    /^[0-9A-Fa-f]{6}$/.test(
      value
    )
  ) {
    return `#${value}`;
  }

  return "#000000";
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

  return new EmbedBuilder()
    .setColor(
      normalizeColor(
        config.embedColor
      )
    )
    .setTitle(title)
    .setDescription(
      description
    )
    .setTimestamp();
}

function createSmallEmbed(
  guildId,
  title,
  description
) {
  return createEmbed(
    guildId,
    title,
    description
  );
}

function isAdministrator(
  member
) {
  return Boolean(
    member &&
      member.permissions &&
      member.permissions.has(
        PermissionsBitField.Flags
          .Administrator
      )
  );
}

function isRegisteredMediator(
  member,
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  return Boolean(
    member?.id &&
      Array.isArray(
        config.mediators
      ) &&
      config.mediators.some(
        (item) =>
          String(
            item?.id || item
          ) ===
          String(
            member.id
          )
      )
  );
}

function hasMediatorRole(
  member,
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  if (
    isRegisteredMediator(
      member,
      guildId
    )
  ) {
    return true;
  }

  if (
    !config.mediatorRoleId
  ) {
    return false;
  }

  return Boolean(
    member?.roles?.cache?.has(
      config.mediatorRoleId
    )
  );
}

function hasAnalystRole(
  member,
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  if (
    !config.analystRoleId
  ) {
    return false;
  }

  return Boolean(
    member?.roles?.cache?.has(
      config.analystRoleId
    )
  );
}

function teamSize(
  format
) {
  const value =
    Number(
      String(format).split("x")[0]
    );

  if (
    !Number.isFinite(value) ||
    value < 1
  ) {
    return 1;
  }

  return value;
}

function requiredPlayers(
  format
) {
  return (
    teamSize(format) * 2
  );
}

/*
 * FILA NORMAL:
 * usada para 2x2, 3x3 e 4x4.
 *
 * FILA 1x1:
 * Normal e Infinito compartilham
 * a mesma fila.
 */
function makeQueueKey(
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  if (
    format === "1x1"
  ) {
    return [
      guildId,
      format,
      mode,
      Number(value),
    ].join("|");
  }

  return [
    guildId,
    format,
    mode,
    Number(value),
    type,
  ].join("|");
}

function getQueue(
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  const key =
    makeQueueKey(
      guildId,
      format,
      mode,
      value,
      type
    );

  if (
    !Array.isArray(
      db.queues[key]
    )
  ) {
    db.queues[key] = [];
  }

  return db.queues[key];
}

/*
 * Guarda a escolha do jogador
 * no 1x1:
 *
 * ice_normal
 * ice_infinite
 */
function getQueueChoiceKey(
  guildId,
  format,
  mode,
  value
) {
  return [
    guildId,
    format,
    mode,
    Number(value),
    "choices",
  ].join("|");
}

function getQueueChoices(
  guildId,
  format,
  mode,
  value
) {
  const key =
    getQueueChoiceKey(
      guildId,
      format,
      mode,
      value
    );

  if (
    !db.queues[key] ||
    typeof db.queues[key] !==
      "object" ||
    Array.isArray(
      db.queues[key]
    )
  ) {
    db.queues[key] = {};
  }

  return db.queues[key];
}

function clearQueueChoices(
  guildId,
  format,
  mode,
  value
) {
  const key =
    getQueueChoiceKey(
      guildId,
      format,
      mode,
      value
    );

  db.queues[key] = {};
}

function modeLabel(mode) {
  if (
    mode === "mobile"
  ) {
    return "📱 Mobile";
  }

  if (
    mode === "emulador" ||
    mode === "emulator"
  ) {
    return "🖥️ Emulador";
  }

  if (
    mode === "misto" ||
    mode === "mixed"
  ) {
    return "🔀 Misto";
  }

  return String(mode);
}

function queueEmbed(
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  const queue =
    getQueue(
      guildId,
      format,
      mode,
      value,
      type
    );

  const choices =
    format === "1x1"
      ? getQueueChoices(
          guildId,
          format,
          mode,
          value
        )
      : {};

  const players =
    queue.length > 0
      ? queue
          .map(
            (id, index) => {
              let extra = "";

              if (
                format === "1x1" &&
                choices[id]
              ) {
                extra =
                  choices[id] ===
                  "ice_infinite"
                    ? " ♾️"
                    : " 🧊";
              }

              return `**${index + 1}.** <@${id}>${extra}`;
            }
          )
          .join("\n")
      : "Nenhum jogador na fila.";

  const title =
    `🎰 FILA ${format}`;

  return createEmbed(
    guildId,
    title,
    `📌 **Modalidade:** ${modeLabel(
      mode
    )}\n` +
      `💰 **Valor:** ${formatMoney(
        value
      )}\n\n` +
      `👥 **Jogadores:** ${queue.length}/${requiredPlayers(
        format
      )}\n\n` +
      players
  );
}

/*
 * 1x1:
 * UMA mensagem por valor.
 *
 * Botões:
 * 🧊 Gelo Normal
 * ♾️ Gelo Infinito
 * 🚪 Sair da fila
 */
function queueButtons(
  format,
  mode,
  value,
  type = "normal"
) {
  if (
    format === "1x1"
  ) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `queue_join|${format}|${mode}|${value}|ice_normal`
          )
          .setLabel(
            "🧊 Gelo Normal"
          )
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            `queue_join|${format}|${mode}|${value}|ice_infinite`
          )
          .setLabel(
            "♾️ Gelo Infinito"
          )
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            `queue_leave|${format}|${mode}|${value}`
          )
          .setLabel(
            "🚪 Sair da fila"
          )
          .setStyle(
            ButtonStyle.Danger
          )
      ),
    ];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `queue_join|${format}|${mode}|${value}|normal`
        )
        .setLabel(
          "➕ Entrar na fila"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          `queue_leave|${format}|${mode}|${value}|normal`
        )
        .setLabel(
          "🚪 Sair da fila"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    ),
  ];
}

function queueAlreadyContains(
  queue,
  userId
) {
  return queue.includes(
    userId
  );
}

function mediatorQueueEmbed(
  guildId
) {
  const config =
    getGuildConfig(
      guildId
    );

  const queue =
    Array.isArray(
      config.mediatorQueue
    )
      ? config.mediatorQueue
      : [];

  const mentions =
    queue.length > 0
      ? queue
          .map(
            (id, index) =>
              `${index + 1}. <@${id}>`
          )
          .join("\n")
      : "Nenhum mediador na fila.";

  return createSmallEmbed(
    guildId,
    "🛡️ FILA DE MEDIADORES",
    `Entre na fila para receber apostas de forma rotativa.\n\n` +
      `**Mediadores na fila:**\n${mentions}`
  );
}

function mediatorQueueButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "mediator_queue_join"
        )
        .setLabel(
          "Entrar na fila"
        )
        .setStyle(
          ButtonStyle.Success
        ),

      new ButtonBuilder()
        .setCustomId(
          "mediator_queue_leave"
        )
        .setLabel(
          "Sair da fila"
        )
        .setStyle(
          ButtonStyle.Danger
        )
    ),
  ];
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
    `Configure todos os sistemas do bot por este painel.\n\n` +

      `🎭 **Mediador:** ${
        config.mediatorRoleId
          ? `<@&${config.mediatorRoleId}>`
          : "Não configurado"
      }\n` +

      `🔎 **Analista:** ${
        config.analystRoleId
          ? `<@&${config.analystRoleId}>`
          : "Não configurado"
      }\n` +

      `📢 **Canal .ssmob:** ${
        config.analysisChannelMobile
          ? `<#${config.analysisChannelMobile}>`
          : "Não configurado"
      }\n` +

      `🖥️ **Canal .ssemu:** ${
        config.analysisChannelEmulator
          ? `<#${config.analysisChannelEmulator}>`
          : "Não configurado"
      }\n` +

      `🎲 **Categoria das apostas:** ${
        config.betsCategoryId
          ? `<#${config.betsCategoryId}>`
          : "Não configurada"
      }\n` +

      `🛡️ **Fila de mediadores:** ${
        config.mediatorQueueChannelId
          ? `<#${config.mediatorQueueChannelId}>`
          : "Não configurada"
      }\n` +

      `👥 **Mediadores cadastrados:** ${config.mediators.length}/20\n` +

      `💸 **Taxa do ADM:** ${formatMoney(
        config.admFee
      )}`
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

function roleConfigComponents(
  guildId
) {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(
          "select_mediator_role"
        )
        .setPlaceholder(
          "Selecionar cargo de Mediador"
        )
    ),

    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(
          "select_analyst_role"
        )
        .setPlaceholder(
          "Selecionar cargo de Analista"
        )
    ),

    backButton(),
  ];
}

function channelConfigComponents(
  guildId
) {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "select_analysis_mobile"
        )
        .setPlaceholder(
          "Canal .ssmob"
        )
        .setChannelTypes(
          ChannelType.GuildText
        )
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "select_analysis_emulator"
        )
        .setPlaceholder(
          "Canal .ssemu"
        )
        .setChannelTypes(
          ChannelType.GuildText
        )
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "select_bets_category"
        )
        .setPlaceholder(
          "Categoria das apostas"
        )
        .setChannelTypes(
          ChannelType.GuildCategory
        )
    ),

    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(
          "select_mediator_queue_channel"
        )
        .setPlaceholder(
          "Canal da fila de mediadores"
        )
        .setChannelTypes(
          ChannelType.GuildText
        )
    ),

    backButton(),
  ];
}

function betConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "config_bet_info"
        )
        .setLabel(
          "Informações"
        )
        .setStyle(
          ButtonStyle.Primary
        )
    ),

    backButton(),
  ];
}

function mediatorConfigComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          "mediator_add"
        )
        .setLabel(
          "Cadastrar Mediador"
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
          "Foto do Bot"
        )
        .setStyle(
          ButtonStyle.Secondary
        ),

      new ButtonBuilder()
        .setCustomId(
          "appearance_color"
        )
        .setLabel(
          "Cor"
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
      "Cadastrar ADM"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "admin_id"
          )
          .setLabel(
            "ID do Discord do ADM"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setPlaceholder(
            "Ex: 123456789012345678"
          )
          .setRequired(
            true
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
      "Dados Pix do ADM"
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
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(
            true
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
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(
            true
          )
      ),

      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "admin_pix_qr"
          )
          .setLabel(
            "URL do QR Code (opcional)"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(
            false
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
      "Configurar Taxa"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "fee_value"
          )
          .setLabel(
            "Taxa em centavos"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setPlaceholder(
            "1 = R$ 0,01 | 100 = R$ 1,00"
          )
          .setRequired(
            true
          )
      )
    );
}

function createAvatarModal() {
  return new ModalBuilder()
    .setCustomId(
      "appearance_avatar_modal"
    )
    .setTitle(
      "Foto do Bot"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "avatar_url"
          )
          .setLabel(
            "URL da imagem"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setPlaceholder(
            "https://..."
          )
          .setRequired(
            true
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
      "Cor do Bot"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "embed_color"
          )
          .setLabel(
            "Cor HEX"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setPlaceholder(
            "#5865F2"
          )
          .setRequired(
            true
          )
      )
    );
}

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

  try {
    const channel =
      await guild.channels.fetch(
        config.mediatorQueueChannelId
      );

    if (!channel) {
      return;
    }

    if (
      config.mediatorQueueMessageId
    ) {
      try {
        const message =
          await channel.messages.fetch(
            config.mediatorQueueMessageId
          );

        await message.edit({
          embeds: [
            mediatorQueueEmbed(
              guild.id
            ),
          ],
          components:
            mediatorQueueButtons(),
        });

        return;
      } catch {}
    }

    const message =
      await channel.send({
        embeds: [
          mediatorQueueEmbed(
            guild.id
          ),
        ],
        components:
          mediatorQueueButtons(),
      });

    config.mediatorQueueMessageId =
      message.id;

    saveDatabase();
  } catch (error) {
    console.error(
      "Erro ao atualizar fila de mediadores:",
      error
    );
  }
}

async function registerQueueMessage(
  guild,
  channel,
  format,
  mode,
  value,
  type = "normal"
) {
  const config =
    getGuildConfig(
      guild.id
    );

  const embed =
    queueEmbed(
      guild.id,
      format,
      mode,
      value,
      type
    );

  const components =
    queueButtons(
      format,
      mode,
      value,
      type
    );

  const message =
    await channel.send({
      embeds: [embed],
      components,
    });

  const key =
    makeQueueKey(
      guild.id,
      format,
      mode,
      value,
      type
    );

  config.queueMessages[key] =
    message.id;

  saveDatabase();

  return message;
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

  let channel;

  if (
    selectedChannelId
  ) {
    channel =
      await guild.channels.fetch(
        selectedChannelId
      );
  }

  if (!channel) {
    channel =
      await guild.channels.fetch(
        config.mediatorQueueChannelId
      );
  }

  if (!channel) {
    throw new Error(
      "Canal não encontrado."
    );
  }

  const sortedValues =
    [...VALUES].sort(
      (a, b) => b - a
    );

  const created = [];

  for (
    const value of sortedValues
  ) {
    const message =
      await registerQueueMessage(
        guild,
        channel,
        format,
        mode,
        value,
        "normal"
      );

    created.push(
      message.id
    );
  }

  return created;
}function roleConfigComponents() {
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
        .setCustomId("mediator_add")
        .setLabel("Adicionar Mediador")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("mediator_list")
        .setLabel("Ver Mediadores")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("publish_mediator_queue")
        .setLabel("Publicar Fila")
        .setStyle(ButtonStyle.Primary)
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
        .setCustomId("config_fee_modal")
        .setLabel("Configurar Taxa")
        .setStyle(ButtonStyle.Primary)
    ),

    backButton(),
  ];
}

function adminComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("admin_add")
        .setLabel("Cadastrar ADM")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("admin_list")
        .setLabel("Ver ADMs")
        .setStyle(ButtonStyle.Secondary)
    ),

    backButton(),
  ];
}

function createAdminIdModal() {
  return new ModalBuilder()
    .setCustomId("admin_id_modal")
    .setTitle("Cadastrar ADM — 1/2")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_user_id")
          .setLabel("ID do usuário Discord")
          .setPlaceholder("Ex.: 123456789012345678")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(17)
          .setMaxLength(20)
      )
    );
}

function createAdminPixModal() {
  return new ModalBuilder()
    .setCustomId("admin_pix_modal")
    .setTitle("Cadastrar ADM — 2/2")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_name")
          .setLabel("Nome do ADM")
          .setPlaceholder("Nome para identificação")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_pix_key")
          .setLabel("Chave Pix")
          .setPlaceholder("CPF, CNPJ, e-mail, telefone ou chave aleatória")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("admin_pix_qr")
          .setLabel("URL do QR Code Pix (opcional)")
          .setPlaceholder("Cole a URL da imagem do QR Code")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(1000)
      )
    );
}

function createFeeModal() {
  return new ModalBuilder()
    .setCustomId("fee_modal")
    .setTitle("Configurar Taxa do ADM")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("adm_fee")
          .setLabel("Taxa em centavos")
          .setPlaceholder("Ex.: 1 = R$ 0,01 | 100 = R$ 1,00")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(6)
      )
    );
}

function createAvatarModal() {
  return new ModalBuilder()
    .setCustomId(
      "avatar_modal"
    )
    .setTitle(
      "Foto do bot"
    )
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(
            "avatar_url"
          )
          .setLabel(
            "URL da imagem"
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
      "color_modal"
    )
    .setTitle(
      "Cor das embeds"
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
      "Erro ao responder interação:",
      error
    );
  }
}

async function refreshQueueMessage(
  message
) {
  try {
    if (!message) {
      return;
    }

    const row =
      message.components?.find(
        (component) =>
          component.type === 1
      );

    if (!row) {
      return;
    }

    const button =
      row.components?.find(
        (component) =>
          typeof component.customId ===
            "string" &&
          component.customId.startsWith(
            "queue_join|"
          )
      );

    if (!button) {
      return;
    }

    const parts =
      button.customId.split("|");

    const format =
      parts[1];

    const mode =
      parts[2];

    const value =
      Number(parts[3]);

    const type =
      parts[4] || "normal";

    if (
      !format ||
      !mode ||
      !Number.isFinite(value)
    ) {
      return;
    }

    await message.edit({
      embeds: [
        queueEmbed(
          message.guild.id,
          format,
          mode,
          value,
          type
        ),
      ],
      components:
        queueButtons(
          format,
          mode,
          value,
          type
        ),
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar mensagem da fila:",
      error
    );
  }
}

async function refreshMediatorQueueMessage(
  guildId
) {
  try {
    const config =
      getGuildConfig(
        guildId
      );

    if (
      !config.mediatorQueueChannelId
    ) {
      return;
    }

    const channel =
      await client.channels.fetch(
        config.mediatorQueueChannelId
      );

    if (!channel) {
      return;
    }

    const messages =
      await channel.messages.fetch({
        limit: 100,
      });

    const queueMessage =
      messages.find(
        (message) =>
          message.author?.id ===
            client.user?.id &&
          message.components?.some(
            (row) =>
              row.components?.some(
                (component) =>
                  component.customId ===
                    "mediator_queue_join"
              )
          )
      );

    if (!queueMessage) {
      return;
    }

    await queueMessage.edit({
      embeds: [
        mediatorQueueEmbed(
          guildId
        ),
      ],
      components:
        mediatorQueueButtons(),
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar fila de mediadores:",
      error
    );
  }
}

async function registerQueueMessage(
  channel,
  guildId,
  format,
  mode,
  value,
  type = "normal"
) {
  if (!channel) {
    return null;
  }

  try {
    const message =
      await channel.send({
        embeds: [
          queueEmbed(
            guildId,
            format,
            mode,
            value,
            type
          ),
        ],
        components:
          queueButtons(
            format,
            mode,
            value,
            type
          ),
      });

    const config =
      getGuildConfig(
        guildId
      );

    const key =
      makeQueueKey(
        guildId,
        format,
        mode,
        value,
        type
      );

    config.queueMessages[
      key
    ] = message.id;

    saveDatabase();

    return message;
  } catch (error) {
    console.error(
      "Erro ao registrar mensagem da fila:",
      error
    );

    return null;
  }
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

  if (!channelId && mode === "mobile") {
    channelId =
      config.analysisChannelMobile;
  } else if (!channelId && mode === "emulador") {
    channelId =
      config.analysisChannelEmulator;
  } else if (!channelId && mode === "misto") {
    channelId =
      config.analysisChannelMobile ||
      config.analysisChannelEmulator;
  }

  if (!channelId) {
    throw new Error(
      `Canal não configurado para a modalidade ${mode}.`
    );
  }

  const channel =
    await guild.channels.fetch(
      channelId
    );

  if (!channel) {
    throw new Error(
      "Não foi possível encontrar o canal configurado."
    );
  }

  /*
   * Discord coloca a mensagem
   * mais nova embaixo.
   *
   * Portanto enviamos do maior
   * valor para o menor:
   *
   * 100
   * 50
   * 20
   * ...
   * 0,30
   *
   * Assim, visualmente:
   *
   * MAIOR
   * ↓
   * MENOR
   */
  const orderedValues =
    [...VALUES].sort(
      (a, b) => b - a
    );

  const createdMessages = [];

  for (
    const value of orderedValues
  ) {
    const message =
      await registerQueueMessage(
        channel,
        guild.id,
        format,
        mode,
        value,
        "normal"
      );

    if (message) {
      createdMessages.push(
        message
      );
    }
  }

  return createdMessages;
}          `🎮 Fila completa! A aposta foi criada: <#${bet.channelId}>`,
        ephemeral: true,
      }
    );
  } catch (error) {
    console.error(
      "Erro ao criar aposta:",
      error
    );

    db.queues[
      makeQueueKey(
        guild.id,
        format,
        mode,
        value,
        type
      )
    ] = queue;

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Não foi possível criar a partida. Os jogadores continuam na fila.",
        ephemeral: true,
      }
    );

    await refreshQueueMessage(
      interaction.message
    );
  }
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
    return;
  }

  const userId =
    interaction.user.id;

  const queue =
    getQueue(
      guild.id,
      format,
      mode,
      value,
      type
    );

  const index =
    queue.indexOf(
      userId
    );

  if (index === -1) {
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Você não está nessa fila.",
        ephemeral: true,
      }
    );

    return;
  }

  queue.splice(
    index,
    1
  );

  if (
    format === "1x1"
  ) {
    const choices =
      getQueueChoices(
        guild.id,
        format,
        mode,
        value
      );

    delete choices[
      userId
    ];
  }

  saveDatabase();

  await sendSafeReply(
    interaction,
    {
      content:
        "🚪 Você saiu da fila.",
      ephemeral: true,
    }
  );

  await refreshQueueMessage(
    interaction.message
  );
}

const pendingMediators = new Map();
const pendingAdmins = new Map();

function mediatorIdModal() {
  return new ModalBuilder()
    .setCustomId("cfg_med_id")
    .setTitle("Adicionar Mediador")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("mediator_user_id")
          .setLabel("ID do usuário Discord")
          .setPlaceholder("Ex.: 123456789012345678")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(17)
          .setMaxLength(20)
      )
    );
}

function mediatorDataModal() {
  return new ModalBuilder()
    .setCustomId("cfg_med_data")
    .setTitle("Dados do Mediador")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("mediator_name")
          .setLabel("Nome do mediador")
          .setPlaceholder("Nome para identificação")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      )
    );
}

async function handleConfigButton(
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
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem usar esta configuração.",
        ephemeral: true,
      }
    );

    return;
  }

  const id =
    interaction.customId;

  if (
    id === "config_back"
  ) {
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
    id === "config_roles"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🎭 CONFIGURAÇÃO DE CARGOS",
          "Selecione os cargos abaixo."
        ),
      ],
      components:
        roleConfigComponents(),
    });

    return;
  }

  if (
    id === "config_channels"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "📢 CONFIGURAÇÃO DE CANAIS",
          "Selecione os canais utilizados pelo bot."
        ),
      ],
      components:
        channelConfigComponents(),
    });

    return;
  }

  if (
    id === "config_bets"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🎲 CONFIGURAÇÃO DAS APOSTAS",
          "Selecione a categoria onde as salas de aposta serão criadas."
        ),
      ],
      components:
        betConfigComponents(),
    });

    return;
  }

  if (
    id === "config_mediators"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🛡️ CONFIGURAÇÃO DE MEDIADORES",
          "Selecione o canal onde a fila de mediadores será publicada."
        ),
      ],
      components:
        mediatorConfigComponents(),
    });

    return;
  }

  if (
    id === "config_appearance"
  ) {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🎨 APARÊNCIA",
          "Escolha o que deseja configurar."
        ),
      ],
      components:
        appearanceComponents(),
    });

    return;
  }

  if (
    id === "config_fee"
  ) {
    await interaction.showModal(createFeeModal());
    return;
  }

  if (id === "config_admins") {
    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "👤 CADASTRO DE ADMs",
          "Cadastre o ADM em duas etapas:\n\n1️⃣ Primeiro informe o **ID do usuário Discord**.\n2️⃣ Depois informe os **dados Pix** desse ADM."
        ),
      ],
      components: adminComponents(),
    });
    return;
  }

  if (
    id === "config_queue"
  ) {
    const config =
      getGuildConfig(
        guild.id
      );

    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🎰 CONFIGURAÇÃO DAS FILAS",
          `Os valores disponíveis são:\n\n${VALUES
            .slice()
            .sort(
              (a, b) =>
                b - a
            )
            .map(
              (value) =>
                `💰 ${formatMoney(
                  value
                )}`
            )
            .join("\n")}\n\n` +
          `📱 Mobile: ${
              config.analysisChannelMobile
                ? `<#${config.analysisChannelMobile}>`
                : "não configurado"
            }\n` +
          `🖥️ Emulador: ${
              config.analysisChannelEmulator
                ? `<#${config.analysisChannelEmulator}>`
                : "não configurado"
            }`
        ),
      ],
      components: [
        backButton(),
      ],
    });

    return;
  }

  if (
    id === "appearance_avatar"
  ) {
    await interaction.showModal(
      createAvatarModal()
    );

    return;
  }

  if (
    id === "appearance_color"
  ) {
    await interaction.showModal(
      createColorModal()
    );

    return;
  }

  if (id === "admin_add") {
    await interaction.showModal(createAdminIdModal());
    return;
  }

  if (id === "admin_list") {
    const config = getGuildConfig(guild.id);
    const list = config.pixAdmins.length
      ? config.pixAdmins.map((item, index) =>
          `**${index + 1}.** <@${item.id}> — ${item.name || "Sem nome"} — Pix: \`${item.key || "Não informado"}\``
        ).join("\n")
      : "Nenhum ADM cadastrado.";

    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "👤 ADMs CADASTRADOS",
          list
        ),
      ],
      components: [backButton()],
    });
    return;
  }

  if (id === "mediator_add") {
    await interaction.showModal(mediatorIdModal());
    return;
  }

  if (id === "mediator_list") {
    const list = config.mediators.length
      ? config.mediators.map((item, index) =>
          `**${index + 1}.** <@${item.id}> — ${item.name || "Sem nome"}`
        ).join("\n")
      : "Nenhum mediador cadastrado.";

    await interaction.update({
      embeds: [
        createEmbed(
          guild.id,
          "🛡️ MEDIADORES CADASTRADOS",
          list
        ),
      ],
      components: [backButton()],
    });
    return;
  }

  if (
    id ===
    "publish_mediator_queue"
  ) {
    const config =
      getGuildConfig(
        guild.id
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
      await guild.channels.fetch(
        config.mediatorQueueChannelId
      );

    const message =
      await channel.send({
        embeds: [
          mediatorQueueEmbed(
            guild.id
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

    return;
  }
}

async function handleRoleSelect(
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

  if (interaction.customId.startsWith("fila_channel|")) {
    const [, format, mode] = interaction.customId.split("|");
    const channelId = interaction.values[0];

    try {
      const channel = await guild.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        throw new Error("O canal selecionado não é um canal de texto válido.");
      }

      await publishQueues(guild, format, mode, channelId);
      await sendSafeReply(interaction, {
        content: `✅ As 12 filas de **${format} / ${modeLabel(mode)}** foram publicadas em <#${channelId}>.`,
        ephemeral: true,
      });
    } catch (error) {
      console.error("Erro ao publicar filas pelo /fila:", error);
      await sendSafeReply(interaction, {
        content: `❌ Não foi possível publicar as filas: ${error.message || "erro desconhecido"}.`,
        ephemeral: true,
      });
    }
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
    "select_bets_category"
  ) {
    config.betsCategoryId =
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

async function handleStringSelect(
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

  const id =
    interaction.customId;

  if (
    id === "select_adm_fee"
  ) {
    const config =
      getGuildConfig(
        guild.id
      );

    config.admFee =
      Number(
        interaction.values[0]
      );

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
}

async function handleModalSubmit(
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
    await sendSafeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem usar esta configuração.",
        ephemeral: true,
      }
    );

    return;
  }

  const id =
    interaction.customId;

  const config =
    getGuildConfig(
      guild.id
    );

  if (id === "admin_id_modal") {
    const rawId = interaction.fields
      .getTextInputValue("admin_user_id")
      .trim()
      .replace(/[<@!>]/g, "");

    if (!/^\d{17,20}$/.test(rawId)) {
      await sendSafeReply(interaction, {
        content: "❌ ID de usuário inválido. Envie apenas o ID numérico do Discord.",
        ephemeral: true,
      });
      return;
    }

    if (config.pixAdmins.some((item) => String(item.id) === rawId)) {
      await sendSafeReply(interaction, {
        content: "❌ Este usuário já está cadastrado como ADM.",
        ephemeral: true,
      });
      return;
    }

    const member = await guild.members.fetch(rawId).catch(() => null);
    if (!member) {
      await sendSafeReply(interaction, {
        content: "❌ Não encontrei esse usuário neste servidor. Verifique o ID.",
        ephemeral: true,
      });
      return;
    }

    pendingAdmins.set(`${guild.id}:${interaction.user.id}`, rawId);
    await interaction.showModal(createAdminPixModal());
    return;
  }

  if (id === "admin_pix_modal") {
    const pendingKey = `${guild.id}:${interaction.user.id}`;
    const userId = pendingAdmins.get(pendingKey);
    pendingAdmins.delete(pendingKey);

    if (!userId) {
      await sendSafeReply(interaction, {
        content: "❌ O cadastro expirou. Clique em **Cadastrar ADM** novamente.",
        ephemeral: true,
      });
      return;
    }

    if (config.pixAdmins.some((item) => String(item.id) === String(userId))) {
      await sendSafeReply(interaction, {
        content: "❌ Este usuário já está cadastrado como ADM.",
        ephemeral: true,
      });
      return;
    }

    const name = interaction.fields.getTextInputValue("admin_name").trim();
    const key = interaction.fields.getTextInputValue("admin_pix_key").trim();
    const qr = interaction.fields.getTextInputValue("admin_pix_qr").trim();

    config.pixAdmins.push({
      id: userId,
      name,
      key,
      qr,
      addedBy: interaction.user.id,
      addedAt: Date.now(),
    });

    saveDatabase();

    await sendSafeReply(interaction, {
      content: `✅ ADM <@${userId}> cadastrado com sucesso com os dados Pix.`,
      ephemeral: true,
    });
    return;
  }

  if (id === "fee_modal") {
    const rawFee = interaction.fields.getTextInputValue("adm_fee").trim().replace(",", ".");
    const fee = Number(rawFee);

    if (!Number.isInteger(fee) || fee < 0 || fee > 100000) {
      await sendSafeReply(interaction, {
        content: "❌ Taxa inválida. Informe um número inteiro em centavos. Ex.: `1` = R$ 0,01.",
        ephemeral: true,
      });
      return;
    }

    config.admFee = fee;
    saveDatabase();

    await sendSafeReply(interaction, {
      content: `✅ Taxa do ADM configurada para **${formatMoney(fee)}**.`,
      ephemeral: true,
    });
    return;
  }

  if (id === "cfg_med_id") {
    const rawId = interaction.fields
      .getTextInputValue("mediator_user_id")
      .trim()
      .replace(/[<@!>]/g, "");

    if (!/^\d{17,20}$/.test(rawId)) {
      await sendSafeReply(interaction, {
        content: "❌ ID de usuário inválido. Envie apenas o ID numérico do Discord.",
        ephemeral: true,
      });
      return;
    }

    if (config.mediators.some((item) => String(item.id) === rawId)) {
      await sendSafeReply(interaction, {
        content: "❌ Este usuário já está cadastrado como mediador.",
        ephemeral: true,
      });
      return;
    }

    if (config.mediators.length >= 20) {
      await sendSafeReply(interaction, {
        content: "❌ Limite de 20 mediadores atingido.",
        ephemeral: true,
      });
      return;
    }

    const member = await guild.members.fetch(rawId).catch(() => null);
    if (!member) {
      await sendSafeReply(interaction, {
        content: "❌ Não encontrei esse usuário neste servidor. Verifique o ID.",
        ephemeral: true,
      });
      return;
    }

    pendingMediators.set(`${guild.id}:${interaction.user.id}`, rawId);
    await interaction.showModal(mediatorDataModal());
    return;
  }

  if (id === "cfg_med_data") {
    const pendingKey = `${guild.id}:${interaction.user.id}`;
    const userId = pendingMediators.get(pendingKey);
    pendingMediators.delete(pendingKey);

    if (!userId) {
      await sendSafeReply(interaction, {
        content: "❌ O cadastro expirou. Clique em **Adicionar Mediador** novamente.",
        ephemeral: true,
      });
      return;
    }

    if (config.mediators.some((item) => String(item.id) === String(userId))) {
      await sendSafeReply(interaction, {
        content: "❌ Este usuário já está cadastrado como mediador.",
        ephemeral: true,
      });
      return;
    }

    if (config.mediators.length >= 20) {
      await sendSafeReply(interaction, {
        content: "❌ Limite de 20 mediadores atingido.",
        ephemeral: true,
      });
      return;
    }

    const name = interaction.fields
      .getTextInputValue("mediator_name")
      .trim();

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      await sendSafeReply(interaction, {
        content: "❌ O usuário não está mais neste servidor.",
        ephemeral: true,
      });
      return;
    }

    config.mediators.push({
      id: userId,
      name: name || member.displayName,
      addedBy: interaction.user.id,
      addedAt: Date.now(),
    });

    saveDatabase();

    await sendSafeReply(interaction, {
      content: `✅ Mediador <@${userId}> cadastrado com sucesso.`,
      ephemeral: true,
    });
    return;
  }

  if (
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

  const config =
    getGuildConfig(
      guild.id
    );

  if (
    interaction.customId ===
    "mediator_queue_join"
  ) {
    const userId =
      interaction.user.id;

    const already =
      config.mediatorQueue.includes(
        userId
      );

    if (already) {
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
      userId
    );

    saveDatabase();

    await sendSafeReply(
      interaction,
      {
        content:
          "🛡️ Você entrou na fila de mediadores.",
        ephemeral: true,
      }
    );

    await refreshMediatorQueueMessage(
      guild.id
    );

    return;
  }

  if (
    interaction.customId ===
    "mediator_queue_leave"
  ) {
    const userId =
      interaction.user.id;

    const index =
      config.mediatorQueue.indexOf(
        userId
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

    await refreshMediatorQueueMessage(
      guild.id
    );

    return;
  }
}  if (
    id ===
    "select_channel_mobile" ||
    id ===
    "select_channel_emulator" ||
    id ===
    "select_bets_category" ||
    id ===
    "select_mediator_channel" ||
    id.startsWith("fila_channel|")
  ) {
    await handleChannelSelect(
      interaction
    );

    return;
  }

  await handleStringSelect(
    interaction
  );
}

client.once(
  "ready",
  async () => {
    console.log(
      `🤖 Bot conectado como ${client.user.tag}`
    );

    for (
      const guild of client.guilds.cache.values()
    ) {
      try {
        await guild.commands.set([
          new SlashCommandBuilder()
            .setName("fila")
            .setDescription(
              "Cria as 12 filas de apostas"
            )
            .addStringOption(
              (option) =>
                option
                  .setName("formato")
                  .setDescription(
                    "Formato da partida"
                  )
                  .setRequired(true)
                  .addChoices(
                    {
                      name: "1x1",
                      value: "1x1",
                    },
                    {
                      name: "2x2",
                      value: "2x2",
                    },
                    {
                      name: "3x3",
                      value: "3x3",
                    },
                    {
                      name: "4x4",
                      value: "4x4",
                    }
                  )
            )
            .addStringOption(
              (option) =>
                option
                  .setName("modalidade")
                  .setDescription(
                    "Modalidade da partida"
                  )
                  .setRequired(true)
                  .addChoices(
                    {
                      name: "Mobile",
                      value: "mobile",
                    },
                    {
                      name: "Emulador",
                      value: "emulador",
                    },
                    {
                      name: "Misto",
                      value: "misto",
                    }
                  )
            ),
        ]);

        console.log(
          `✅ Comando /fila registrado em ${guild.name}`
        );
      } catch (error) {
        console.error(
          `Erro ao registrar comandos em ${guild.name}:`,
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

          const format =
            interaction.options.getString(
              "formato"
            );

          const mode =
            interaction.options.getString(
              "modalidade"
            );

          const row =
            new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId(
                  `fila_channel|${format}|${mode}`
                )
                .setPlaceholder(
                  "Selecione o canal onde as filas serão publicadas"
                )
                .setChannelTypes(
                  ChannelType.GuildText,
                  ChannelType.GuildAnnouncement
                )
                .setMinValues(1)
                .setMaxValues(1)
            );

          await sendSafeReply(
            interaction,
            {
              content:
                `🎮 **Formato:** ${format}\n` +
                `🎯 **Modalidade:** ${modeLabel(
                  mode
                )}\n\n` +
                `📢 Selecione o canal onde as **12 filas** serão publicadas:`,
              components: [
                row,
              ],
              ephemeral: true,
            }
          );

          return;
        }
      }

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
    } catch (error) {
      console.error(
        "Erro em interactionCreate:",
        error
      );

      try {
        await sendSafeReply(
          interaction,
          {
            content:
              "❌ Ocorreu um erro ao processar esta ação.",
            ephemeral: true,
          }
        );
      } catch {}
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

      if (
        !message.guild
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
  (reason) => {
    console.error(
      "Unhandled Rejection:",
      reason
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

client.login(
  TOKEN
).catch(
  (error) => {
    console.error(
      "Erro ao conectar o bot:",
      error
    );
  }
);      components: [row],
    });

    return;
  }

  if (command === "config") {
    if (!isAdministrator(message.member)) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    await message.reply({
      embeds: [
        configMainEmbed(guild),
      ],
      components:
        configButtons(),
    });

    return;
  }

  if (command === "filaadm") {
    if (!isAdministrator(message.member)) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    await publishMediatorQueue(guild);

    return;
  }

  if (command === "ssmob") {
    if (!isAdministrator(message.member)) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    try {
      await publishQueues(
        guild,
        "1x1",
        "mobile"
      );

      await message.reply(
        "✅ Filas Mobile publicadas."
      );
    } catch (error) {
      console.error(error);

      await message.reply(
        "❌ Não foi possível publicar as filas Mobile."
      );
    }

    return;
  }

  if (command === "ssemu") {
    if (!isAdministrator(message.member)) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    try {
      await publishQueues(
        guild,
        "1x1",
        "emulador"
      );

      await message.reply(
        "✅ Filas Emulador publicadas."
      );
    } catch (error) {
      console.error(error);

      await message.reply(
        "❌ Não foi possível publicar as filas Emulador."
      );
    }

    return;
  }

  if (command === "limparfila") {
    if (!isAdministrator(message.member)) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    const keys = Object.keys(
      db.queues || {}
    );

    for (const key of keys) {
      delete db.queues[key];
    }

    saveDatabase();

    await message.reply(
      "✅ Todas as filas foram limpas."
    );

    return;
  }

  if (command === "limparapostas") {
    if (!isAdministrator(message.member)) {
      return message.reply(
        "❌ Apenas administradores podem usar este comando."
      );
    }

    const bets = Object.values(
      db.bets || {}
    );

    for (const bet of bets) {
      try {
        const channel =
          await guild.channels.fetch(
            bet.channelId
          );

        if (channel) {
          await channel.delete().catch(() => {});
        }
      } catch {}

      delete db.bets[bet.id];
    }

    saveDatabase();

    await message.reply(
      "✅ Todas as apostas foram limpas."
    );

    return;
  }

  if (command === "ping") {
    await message.reply(
      `🏓 Pong! ${client.ws.ping}ms`
    );

    return;
  }

  if (command === "ajuda") {
    await message.reply({
      embeds: [
        createEmbed(
          guild.id,
          "📚 COMANDOS",
          `**${PREFIX}fila** — Criar filas\n` +
            `**${PREFIX}config** — Configurações\n` +
            `**${PREFIX}filaadm** — Publicar fila de mediadores\n` +
            `**${PREFIX}limparfila** — Limpar filas\n` +
            `**${PREFIX}limparapostas** — Limpar apostas\n` +
            `**${PREFIX}ping** — Ver ping do bot`
        ),
      ],
    });

    return;
  }
}

async function publishMediatorQueue(
  guild
) {
  const config = getGuildConfig(guild.id);

  if (!config.mediatorQueueChannelId) {
    throw new Error(
      "Canal da fila de mediadores não configurado."
    );
  }

  const channel = await guild.channels.fetch(
    config.mediatorQueueChannelId
  );

  if (!channel) {
    throw new Error(
      "Canal da fila de mediadores não encontrado."
    );
  }

  const message = await channel.send({
    embeds: [mediatorQueueEmbed(guild.id)],
    components: mediatorQueueButtons(),
  });

  config.mediatorQueueMessageId = message.id;
  saveDatabase();

  return message;
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
