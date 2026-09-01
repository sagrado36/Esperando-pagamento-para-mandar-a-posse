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
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  ChannelType,
  SlashCommandBuilder,
} = require("discord.js");

require("dotenv").config();

/* =========================================================
   TOKEN
========================================================= */

const TOKEN =
  process.env.DISCORD_TOKEN ||
  process.env.TOKEN;

if (!TOKEN) {
  console.error(
    "❌ DISCORD_TOKEN ou TOKEN não encontrado no .env"
  );

  process.exit(1);
}

/* =========================================================
   CONFIGURAÇÕES DO .ENV
========================================================= */

const ENV = {
  betsCategoryId:
    process.env.BETS_CATEGORY_ID || "",

  queueCategoryId:
    process.env.QUEUE_CATEGORY_ID || "",

  mediatorRoleId:
    process.env.MEDIATOR_ROLE_ID || "",

  adminRoleId:
    process.env.ADMIN_ROLE_ID || "",

  staffRoleId:
    process.env.STAFF_ROLE_ID || "",

  logChannelId:
    process.env.LOG_CHANNEL_ID || "",

  mainChannelId:
    process.env.MAIN_CHANNEL_ID || "",

  prefix:
    process.env.PREFIX || "!",
};

/* =========================================================
   CLIENT
========================================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],

  partials: [
    Partials.Channel,
  ],
});

/* =========================================================
   BANCO EM MEMÓRIA
========================================================= */

const queues = new Map();
const bets = new Map();
const activeMatches = new Map();
const mediatorQueues = new Map();
const guildConfigs = new Map();

/* =========================================================
   FUNÇÕES BÁSICAS
========================================================= */

function createId(prefix) {
  return (
    `${prefix}_` +
    `${Date.now()}_` +
    `${Math.random()
      .toString(36)
      .slice(2, 8)}`
  );
}

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

function parseMoney(value) {
  if (
    typeof value !== "string"
  ) {
    return Number(value) || 0;
  }

  let text = value
    .replace(/\s/g, "")
    .replace(/^R\$/i, "");

  if (text.includes(",")) {
    text = text
      .replace(/\./g, "")
      .replace(",", ".");
  }

  const number = Number(text);

  return Number.isFinite(number)
    ? number
    : 0;
}

/* =========================================================
   CONFIG POR SERVIDOR
========================================================= */

function getGuildConfig(guildId) {
  if (!guildConfigs.has(guildId)) {
    guildConfigs.set(
      guildId,
      {
        fee: 0,

        betAmount: 0,

        pix: "",

        mainChannelId:
          ENV.mainChannelId,

        mainMessageId: "",

        embedColor:
          0x5865f2,

        mediatorRoleId:
          ENV.mediatorRoleId,

        adminRoleId:
          ENV.adminRoleId,

        staffRoleId:
          ENV.staffRoleId,

        betsCategoryId:
          ENV.betsCategoryId,

        queueCategoryId:
          ENV.queueCategoryId,
      }
    );
  }

  return guildConfigs.get(guildId);
}

function saveDatabase() {
  /*
   * Atualmente os dados ficam em memória.
   *
   * Esta função existe para que posteriormente
   * possamos colocar JSON, SQLite ou MongoDB.
   */
}

/* =========================================================
   PERMISSÕES
========================================================= */

function isAdmin(member) {
  if (!member) {
    return false;
  }

  // Dono do servidor também pode configurar
  if (
    member.guild &&
    member.guild.ownerId === member.id
  ) {
    return true;
  }

  // Administrador do Discord
  if (
    member.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  ) {
    return true;
  }

  // Cargo de administrador configurado
  if (
    ENV.adminRoleId &&
    member.roles.cache.has(
      ENV.adminRoleId
    )
  ) {
    return true;
  }

  return false;
}

function isStaff(member) {
  if (!member) {
    return false;
  }

  if (isAdmin(member)) {
    return true;
  }

  if (
    ENV.staffRoleId &&
    member.roles.cache.has(
      ENV.staffRoleId
    )
  ) {
    return true;
  }

  return false;
}

function isMediator(member) {
  if (!member) {
    return false;
  }

  if (isStaff(member)) {
    return true;
  }

  if (
    ENV.mediatorRoleId &&
    member.roles.cache.has(
      ENV.mediatorRoleId
    )
  ) {
    return true;
  }

  return false;
}

/* =========================================================
   RESPOSTA SEGURA PARA INTERAÇÕES
========================================================= */

async function safeReply(
  interaction,
  payload = {}
) {
  try {
    if (
      interaction.replied ||
      interaction.deferred
    ) {
      return await interaction.followUp({
        ephemeral: true,
        ...payload,
      });
    }

    return await interaction.reply({
      ephemeral: true,
      ...payload,
    });

  } catch (error) {
    console.error(
      "❌ Erro ao responder interação:",
      error
    );

    return null;
  }
}

/* =========================================================
   LOG
========================================================= */

async function sendLog(
  guild,
  text
) {
  if (
    !guild ||
    !ENV.logChannelId
  ) {
    return;
  }

  try {
    const channel =
      await guild.channels.fetch(
        ENV.logChannelId
      );

    if (
      channel &&
      channel.isTextBased()
    ) {
      await channel.send({
        content:
          String(text).slice(
            0,
            1900
          ),
      });
    }

  } catch (error) {
    console.error(
      "❌ Erro ao enviar log:",
      error.message
    );
  }
}

/* =========================================================
   BOTÃO VOLTAR
========================================================= */

function mainBackButton() {
  return new ButtonBuilder()
    .setCustomId(
      "main_back"
    )
    .setLabel("Voltar")
    .setEmoji("↩️")
    .setStyle(
      ButtonStyle.Secondary
    );
}

/* =========================================================
   PAINEL PRINCIPAL
========================================================= */

function mainEmbed(guild) {
  const config =
    getGuildConfig(
      guild.id
    );

  return new EmbedBuilder()
    .setTitle(
      "🎯 Sistema de Apostas"
    )
    .setDescription(
      [
        "Utilize os botões abaixo.",
        "",
        "🎮 **Fila**",
        "Entre em uma fila para procurar adversários.",
        "",
        "⚙️ **Configuração**",
        "Configure o sistema.",
        "",
        "🛡️ **Mediador**",
        "Acesse a central de mediação.",
      ].join("\n")
    )
    .setColor(
      config.embedColor ||
      0x5865f2
    );
}

function mainButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            "main_queue"
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
            "main_config"
          )
          .setLabel(
            "Configuração"
          )
          .setEmoji("⚙️")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "main_mediator"
          )
          .setLabel(
            "Mediador"
          )
          .setEmoji("🛡️")
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];
}

/* =========================================================
   PAINEL DE CONFIGURAÇÃO
========================================================= */

function configEmbed(guild) {
  const config =
    getGuildConfig(
      guild.id
    );

  const color =
    Number(config.embedColor)
      .toString(16)
      .padStart(6, "0");

  return new EmbedBuilder()
    .setTitle(
      "⚙️ CONFIGURAÇÃO"
    )
    .setDescription(
      [
        `🎨 **Cor:** #${color}`,

        `💰 **Valor padrão:** ${
          formatMoney(
            config.betAmount
          )
        }`,

        `💳 **Taxa:** ${
          config.fee
        }%`,

        `🔑 **PIX:** ${
          config.pix
            ? "Configurado"
            : "Não configurado"
        }`,

        `📢 **Canal principal:** ${
          config.mainChannelId
            ? `<#${config.mainChannelId}>`
            : "Não configurado"
        }`,

        `🛡️ **Cargo mediador:** ${
          config.mediatorRoleId
            ? `<@&${config.mediatorRoleId}>`
            : "Não configurado"
        }`,

        `📁 **Categoria das apostas:** ${
          config.betsCategoryId
            ? `<#${config.betsCategoryId}>`
            : "Não configurada"
        }`,
      ].join("\n")
    )
    .setColor(
      config.embedColor ||
      0x5865f2
    );
}

function configButtons() {
  return [

    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            "config_roles"
          )
          .setLabel(
            "Cargos"
          )
          .setEmoji("👥")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "config_bet"
          )
          .setLabel(
            "Apostas"
          )
          .setEmoji("💰")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "config_fee"
          )
          .setLabel(
            "Taxas"
          )
          .setEmoji("💳")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "config_pix"
          )
          .setLabel(
            "PIX"
          )
          .setEmoji("🔑")
          .setStyle(
            ButtonStyle.Primary
          )
      ),

    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            "config_appearance"
          )
          .setLabel(
            "Aparência"
          )
          .setEmoji("🎨")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "config_channel"
          )
          .setLabel(
            "Canal"
          )
          .setEmoji("📢")
          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "main_back"
          )
          .setLabel(
            "Voltar"
          )
          .setEmoji("↩️")
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];
}

/* =========================================================
   COMPONENTES DE CARGOS
========================================================= */

function rolesComponents() {
  return [

    new ActionRowBuilder()
      .addComponents(

        new RoleSelectMenuBuilder()
          .setCustomId(
            "select_role_mediator"
          )
          .setPlaceholder(
            "Selecione o cargo de mediador"
          )
          .setMinValues(1)
          .setMaxValues(1)
      ),

    new ActionRowBuilder()
      .addComponents(
        mainBackButton()
      ),
  ];
}

/* =========================================================
   COMPONENTES DE CANAL
========================================================= */

function channelComponents() {
  return [

    new ActionRowBuilder()
      .addComponents(

        new ChannelSelectMenuBuilder()
          .setCustomId(
            "select_channel_main"
          )
          .setPlaceholder(
            "Selecione o canal principal"
          )
          .setChannelTypes(
            ChannelType.GuildText
          )
          .setMinValues(1)
          .setMaxValues(1)
      ),

    new ActionRowBuilder()
      .addComponents(

        new ChannelSelectMenuBuilder()
          .setCustomId(
            "select_channel_bets"
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

    new ActionRowBuilder()
      .addComponents(
        mainBackButton()
      ),
  ];
}

/* =========================================================
   MODAL DE COR
========================================================= */

function colorModal() {
  return new ModalBuilder()
    .setCustomId(
      "modal_color"
    )
    .setTitle(
      "Alterar cor"
    )
    .addComponents(

      new ActionRowBuilder()
        .addComponents(

          new TextInputBuilder()
            .setCustomId(
              "embed_color"
            )
            .setLabel(
              "Cor hexadecimal"
            )
            .setPlaceholder(
              "#5865F2"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true)
            .setMaxLength(7)
        )
    );
}

/* =========================================================
   MODAL PIX
========================================================= */

function pixModal() {
  return new ModalBuilder()
    .setCustomId(
      "modal_pix"
    )
    .setTitle(
      "Configurar PIX"
    )
    .addComponents(

      new ActionRowBuilder()
        .addComponents(

          new TextInputBuilder()
            .setCustomId(
              "pix_key"
            )
            .setLabel(
              "Chave PIX"
            )
            .setPlaceholder(
              "Digite a chave PIX"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true)
            .setMaxLength(200)
        )
    );
}

/* =========================================================
   MODAL TAXA
========================================================= */

function feeModal() {
  return new ModalBuilder()
    .setCustomId(
      "modal_fee"
    )
    .setTitle(
      "Configurar taxa"
    )
    .addComponents(

      new ActionRowBuilder()
        .addComponents(

          new TextInputBuilder()
            .setCustomId(
              "fee_value"
            )
            .setLabel(
              "Taxa em porcentagem"
            )
            .setPlaceholder(
              "Exemplo: 5"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true)
            .setMaxLength(6)
        )
    );
}

/* =========================================================
   MODAL VALOR DA APOSTA
========================================================= */

function betAmountModal() {
  return new ModalBuilder()
    .setCustomId(
      "modal_bet_amount"
    )
    .setTitle(
      "Valor da aposta"
    )
    .addComponents(

      new ActionRowBuilder()
        .addComponents(

          new TextInputBuilder()
            .setCustomId(
              "bet_amount"
            )
            .setLabel(
              "Valor da aposta"
            )
            .setPlaceholder(
              "Exemplo: 10,00"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true)
            .setMaxLength(20)
        )
    );
}/* =========================================================
   FILAS
========================================================= */

function getQueueKey(
  guildId,
  format,
  mode,
  value
) {
  return [
    guildId,
    format,
    mode,
    value,
  ].join("|");
}

function getQueue(
  guildId,
  format,
  mode,
  value
) {
  const key = getQueueKey(
    guildId,
    format,
    mode,
    value
  );

  if (!queues.has(key)) {
    queues.set(key, []);
  }

  return queues.get(key);
}

/* =========================================================
   LABEL DOS MODOS
========================================================= */

function modeLabel(mode) {
  const labels = {
    mobile: "📱 Mobile",
    emulator: "🖥️ Emulador",
    ambos: "📱 Mobile + 🖥️ Emulador",
    normal: "🎮 Normal",
  };

  return (
    labels[mode] ||
    mode
  );
}

/* =========================================================
   EMBED DA FILA
========================================================= */

function queueEmbed(
  guild,
  format,
  mode,
  value
) {
  const queue = getQueue(
    guild.id,
    format,
    mode,
    value
  );

  const config =
    getGuildConfig(
      guild.id
    );

  return new EmbedBuilder()
    .setTitle(
      `🎮 FILA ${format}`
    )
    .setDescription(
      [
        `**Modo:** ${modeLabel(mode)}`,
        `**Valor:** ${formatMoney(value)}`,
        "",
        `👥 **Jogadores na fila:** ${queue.length}`,
        "",
        queue.length
          ? queue
              .map(
                (id, index) =>
                  `**${index + 1}.** <@${id}>`
              )
              .join("\n")
          : "Nenhum jogador na fila.",
        "",
        "Clique em **Entrar** para participar.",
      ].join("\n")
    )
    .setColor(
      config.embedColor ||
      0x5865f2
    );
}

/* =========================================================
   BOTÕES DA FILA
========================================================= */

function queueButtons(
  format,
  mode,
  value
) {
  const encodedValue =
    String(value);

  return [
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            `queue_join|${format}|${mode}|${encodedValue}`
          )
          .setLabel(
            "Entrar"
          )
          .setEmoji("✅")
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            `queue_leave|${format}|${mode}|${encodedValue}`
          )
          .setLabel(
            "Sair"
          )
          .setEmoji("🚪")
          .setStyle(
            ButtonStyle.Danger
          ),

        new ButtonBuilder()
          .setCustomId(
            `queue_refresh|${format}|${mode}|${encodedValue}`
          )
          .setLabel(
            "Atualizar"
          )
          .setEmoji("🔄")
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];
}

/* =========================================================
   ENTRAR NA FILA
========================================================= */

async function joinQueue(
  interaction,
  format,
  mode,
  value
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Esta interação só pode ser usada em um servidor.",
      }
    );
  }

  const numberValue =
    Number(value);

  if (
    !format ||
    !mode ||
    !Number.isFinite(
      numberValue
    ) ||
    numberValue <= 0
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Dados da fila inválidos.",
      }
    );
  }

  const queue =
    getQueue(
      guild.id,
      format,
      mode,
      numberValue
    );

  const userId =
    interaction.user.id;

  if (
    queue.includes(userId)
  ) {
    return safeReply(
      interaction,
      {
        content:
          "⚠️ Você já está nessa fila.",
      }
    );
  }

  queue.push(userId);

  saveDatabase();

  /*
   * Se houver jogadores suficientes,
   * cria automaticamente uma partida.
   */

  const requiredPlayers =
    getRequiredPlayers(
      format
    );

  if (
    queue.length >=
    requiredPlayers
  ) {
    const players =
      queue.splice(
        0,
        requiredPlayers
      );

    try {
      const bet =
        await createBet(
          guild,
          format,
          mode,
          numberValue,
          players,
          null,
          "normal"
        );

      await interaction.update({
        embeds: [
          queueEmbed(
            guild,
            format,
            mode,
            numberValue
          ),
        ],
        components:
          queueButtons(
            format,
            mode,
            numberValue
          ),
      });

      await sendLog(
        guild,
        `🎮 Nova partida criada: **${bet.id}**\n` +
        `Jogadores: ${players
          .map(
            id =>
              `<@${id}>`
          )
          .join(", ")}`
      );

      return;
    } catch (error) {
      console.error(
        "❌ Erro ao criar partida:",
        error
      );

      /*
       * Devolve os jogadores à fila
       * caso a criação da partida falhe.
       */
      queue.unshift(
        ...players
      );

      return safeReply(
        interaction,
        {
          content:
            "❌ Não foi possível criar a partida.",
        }
      );
    }
  }

  try {
    await interaction.update({
      embeds: [
        queueEmbed(
          guild,
          format,
          mode,
          numberValue
        ),
      ],
      components:
        queueButtons(
          format,
          mode,
          numberValue
        ),
    });
  } catch (error) {
    console.error(
      "❌ Erro ao atualizar fila:",
      error
    );
  }

  /*
   * Se o update já respondeu a interação,
   * não tentamos responder novamente.
   */
}

/* =========================================================
   SAIR DA FILA
========================================================= */

async function leaveQueue(
  interaction,
  format,
  mode,
  value
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Esta interação só pode ser usada em um servidor.",
      }
    );
  }

  const numberValue =
    Number(value);

  const queue =
    getQueue(
      guild.id,
      format,
      mode,
      numberValue
    );

  const index =
    queue.indexOf(
      interaction.user.id
    );

  if (index === -1) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Você não está nessa fila.",
      }
    );
  }

  queue.splice(
    index,
    1
  );

  saveDatabase();

  try {
    await interaction.update({
      embeds: [
        queueEmbed(
          guild,
          format,
          mode,
          numberValue
        ),
      ],
      components:
        queueButtons(
          format,
          mode,
          numberValue
        ),
    });
  } catch (error) {
    console.error(
      "❌ Erro ao atualizar fila:",
      error
    );
  }
}

/* =========================================================
   ATUALIZAR FILA
========================================================= */

async function refreshQueue(
  interaction,
  format,
  mode,
  value
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Servidor não encontrado.",
      }
    );
  }

  const numberValue =
    Number(value);

  try {
    await interaction.update({
      embeds: [
        queueEmbed(
          guild,
          format,
          mode,
          numberValue
        ),
      ],
      components:
        queueButtons(
          format,
          mode,
          numberValue
        ),
    });
  } catch (error) {
    console.error(
      "❌ Erro ao atualizar fila:",
      error
    );
  }
}

/* =========================================================
   QUANTIDADE DE JOGADORES
========================================================= */

function getRequiredPlayers(
  format
) {
  const normalized =
    String(format)
      .toLowerCase();

  if (
    normalized === "1x1"
  ) {
    return 2;
  }

  if (
    normalized === "2x2"
  ) {
    return 4;
  }

  if (
    normalized === "3x3"
  ) {
    return 6;
  }

  if (
    normalized === "4x4"
  ) {
    return 8;
  }

  if (
    normalized === "5x5"
  ) {
    return 10;
  }

  /*
   * Fallback.
   */
  return 2;
}

/* =========================================================
   CRIAR CANAL DA APOSTA
========================================================= */

async function createBetChannel(
  guild,
  bet
) {
  const config =
    getGuildConfig(
      guild.id
    );

  let category = null;

  const categoryId =
    config.betsCategoryId ||
    ENV.betsCategoryId;

  if (categoryId) {
    category =
      guild.channels.cache.get(
        categoryId
      );

    if (
      !category ||
      category.type !==
        ChannelType.GuildCategory
    ) {
      category = null;
    }
  }

  const overwrites = [
    {
      id:
        guild.roles.everyone.id,

      deny: [
        PermissionsBitField.Flags.ViewChannel,
      ],
    },
  ];

  /*
   * Permitir os jogadores.
   */
  for (
    const userId of bet.players
  ) {
    overwrites.push({
      id: userId,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  /*
   * Permitir mediador.
   */
  const mediatorRoleId =
    config.mediatorRoleId ||
    ENV.mediatorRoleId;

  if (mediatorRoleId) {
    overwrites.push({
      id: mediatorRoleId,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  /*
   * Permitir administradores.
   */
  if (config.adminRoleId) {
    overwrites.push({
      id:
        config.adminRoleId,

      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  const channel =
    await guild.channels.create({
      name:
        `aposta-${bet.id.slice(-6)}`,

      type:
        ChannelType.GuildText,

      parent:
        category
          ? category.id
          : undefined,

      permissionOverwrites:
        overwrites,
    });

  return channel;
}

/* =========================================================
   CRIAR APOSTA
========================================================= */

async function createBet(
  guild,
  format,
  mode,
  value,
  players,
  mediatorId = null,
  type = "normal"
) {
  const betId =
    createId("bet");

  const bet = {
    id: betId,

    guildId:
      guild.id,

    channelId:
      null,

    format,

    mode,

    value:
      Number(value),

    type,

    players: [
      ...players,
    ],

    confirmed:
      new Set(),

    mediatorId:
      mediatorId || null,

    winnerId:
      null,

    status:
      "waiting",

    createdAt:
      Date.now(),
  };

  const channel =
    await createBetChannel(
      guild,
      bet
    );

  bet.channelId =
    channel.id;

  bets.set(
    betId,
    bet
  );

  activeMatches.set(
    betId,
    bet
  );

  const embed =
    betEmbed(
      guild,
      bet
    );

  await channel.send({
    content:
      bet.players
        .map(
          id =>
            `<@${id}>`
        )
        .join(" "),

    embeds: [
      embed,
    ],

    components:
      betButtons(
        bet
      ),
  });

  saveDatabase();

  return bet;
}

/* =========================================================
   EMBED DA APOSTA
========================================================= */

function betEmbed(
  guild,
  bet
) {
  const config =
    getGuildConfig(
      guild.id
    );

  const confirmed =
    bet.confirmed instanceof Set
      ? bet.confirmed.size
      : 0;

  const status =
    bet.status ===
    "waiting"
      ? "⏳ Aguardando confirmação"
      : bet.status ===
        "confirmed"
        ? "🟢 Confirmada"
        : bet.status ===
          "finished"
          ? "🏆 Finalizada"
          : "🔴 Cancelada";

  return new EmbedBuilder()
    .setTitle(
      `🎮 APOSTA ${bet.format}`
    )
    .setDescription(
      [
        `**Modalidade:** ${modeLabel(bet.mode)}`,
        `**Valor:** ${formatMoney(bet.value)}`,
        `**Status:** ${status}`,
        "",
        "👥 **Jogadores:**",
        bet.players
          .map(
            id =>
              `<@${id}>`
          )
          .join("\n"),
        "",
        `✅ **Confirmações:** ${confirmed}/${bet.players.length}`,
        "",
        bet.mediatorId
          ? `🛡️ **Mediador:** <@${bet.mediatorId}>`
          : "🛡️ **Mediador:** Não definido",
      ].join("\n")
    )
    .setColor(
      config.embedColor ||
      0x5865f2
    );
}

/* =========================================================
   BOTÕES DA APOSTA
========================================================= */

function betButtons(
  bet
) {
  const buttons = [];

  buttons.push(
    new ButtonBuilder()
      .setCustomId(
        `bet_confirm|${bet.id}`
      )
      .setLabel(
        "Confirmar"
      )
      .setEmoji("✅")
      .setStyle(
        ButtonStyle.Success
      )
  );

  buttons.push(
    new ButtonBuilder()
      .setCustomId(
        `bet_cancel|${bet.id}`
      )
      .setLabel(
        "Cancelar"
      )
      .setEmoji("❌")
      .setStyle(
        ButtonStyle.Danger
      )
  );

  return [
    new ActionRowBuilder()
      .addComponents(
        ...buttons
      ),
  ];
}

/* =========================================================
   CONFIRMAR APOSTA
========================================================= */

async function confirmBet(
  interaction,
  betId
) {
  const bet =
    bets.get(betId);

  if (!bet) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Aposta não encontrada.",
      }
    );
  }

  if (
    bet.status ===
    "finished"
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Essa aposta já foi finalizada.",
      }
    );
  }

  if (
    bet.status ===
    "cancelled"
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Essa aposta foi cancelada.",
      }
    );
  }

  if (
    !bet.players.includes(
      interaction.user.id
    )
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Você não participa dessa aposta.",
      }
    );
  }

  if (
    !(bet.confirmed instanceof Set)
  ) {
    bet.confirmed =
      new Set(
        bet.confirmed || []
      );
  }

  if (
    bet.confirmed.has(
      interaction.user.id
    )
  ) {
    return safeReply(
      interaction,
      {
        content:
          "⚠️ Você já confirmou essa aposta.",
      }
    );
  }

  bet.confirmed.add(
    interaction.user.id
  );

  /*
   * Se todos confirmaram,
   * a aposta fica confirmada.
   */
  if (
    bet.confirmed.size >=
    bet.players.length
  ) {
    bet.status =
      "confirmed";
  }

  saveDatabase();

  try {
    await interaction.update({
      embeds: [
        betEmbed(
          interaction.guild,
          bet
        ),
      ],
      components:
        betButtons(
          bet
        ),
    });
  } catch (error) {
    console.error(
      "❌ Erro ao atualizar aposta:",
      error
    );
  }

  if (
    bet.status ===
    "confirmed"
  ) {
    await sendLog(
      interaction.guild,
      `✅ Aposta **${bet.id}** confirmada por todos os jogadores.`
    );

    try {
      await interaction.channel.send({
        content:
          "🟢 **Todos os jogadores confirmaram a partida!**",
      });
    } catch (error) {
      console.error(
        "❌ Erro ao enviar confirmação:",
        error
      );
    }
  }
}

/* =========================================================
   CANCELAR APOSTA
========================================================= */

async function cancelBet(
  interaction,
  betId
) {
  const bet =
    bets.get(betId);

  if (!bet) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Aposta não encontrada.",
      }
    );
  }

  const allowed =
    bet.players.includes(
      interaction.user.id
    ) ||
    isStaff(
      interaction.member
    ) ||
    (
      bet.mediatorId ===
      interaction.user.id
    );

  if (!allowed) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Você não pode cancelar essa aposta.",
      }
    );
  }

  if (
    bet.status ===
    "finished"
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Essa aposta já foi finalizada.",
      }
    );
  }

  bet.status =
    "cancelled";

  activeMatches.delete(
    betId
  );

  saveDatabase();

  try {
    await interaction.update({
      embeds: [
        betEmbed(
          interaction.guild,
          bet
        ),
      ],
      components: [],
    });
  } catch (error) {
    console.error(
      "❌ Erro ao cancelar aposta:",
      error
    );
  }

  await sendLog(
    interaction.guild,
    `❌ Aposta **${bet.id}** cancelada por <@${interaction.user.id}>.`
  );
}/* =========================================================
   CONFIGURAÇÃO — EMBEDS
========================================================= */

function rolesEmbed(guild) {
  const config =
    getGuildConfig(guild.id);

  return new EmbedBuilder()
    .setTitle("👥 CONFIGURAÇÃO DE CARGOS")
    .setDescription(
      [
        `🛡️ **Mediador:** ${
          config.mediatorRoleId
            ? `<@&${config.mediatorRoleId}>`
            : "Não configurado"
        }`,
        "",
        "Use o menu abaixo para selecionar o cargo de mediador.",
      ].join("\n")
    )
    .setColor(
      config.embedColor || 0x5865f2
    );
}

function channelEmbed(guild) {
  const config =
    getGuildConfig(guild.id);

  return new EmbedBuilder()
    .setTitle("📢 CONFIGURAÇÃO DE CANAIS")
    .setDescription(
      [
        `📢 **Canal principal:** ${
          config.mainChannelId
            ? `<#${config.mainChannelId}>`
            : "Não configurado"
        }`,
        "",
        `📁 **Categoria das apostas:** ${
          config.betsCategoryId
            ? `<#${config.betsCategoryId}>`
            : "Não configurada"
        }`,
        "",
        "Selecione abaixo o canal ou categoria que deseja configurar.",
      ].join("\n")
    )
    .setColor(
      config.embedColor || 0x5865f2
    );
}

function betConfigEmbed(guild) {
  const config =
    getGuildConfig(guild.id);

  return new EmbedBuilder()
    .setTitle("💰 CONFIGURAÇÃO DAS APOSTAS")
    .setDescription(
      [
        `💵 **Valor padrão:** ${
          config.betAmount > 0
            ? formatMoney(config.betAmount)
            : "Não configurado"
        }`,
        "",
        "Clique abaixo para alterar o valor padrão das apostas.",
      ].join("\n")
    )
    .setColor(
      config.embedColor || 0x5865f2
    );
}

function feeConfigEmbed(guild) {
  const config =
    getGuildConfig(guild.id);

  return new EmbedBuilder()
    .setTitle("💳 CONFIGURAÇÃO DA TAXA")
    .setDescription(
      [
        `💸 **Taxa atual:** ${config.fee}%`,
        "",
        "Clique abaixo para alterar a taxa.",
      ].join("\n")
    )
    .setColor(
      config.embedColor || 0x5865f2
    );
}

function pixConfigEmbed(guild) {
  const config =
    getGuildConfig(guild.id);

  return new EmbedBuilder()
    .setTitle("🔑 CONFIGURAÇÃO DO PIX")
    .setDescription(
      [
        `🔑 **Chave PIX:** ${
          config.pix
            ? `\`${config.pix}\``
            : "Não configurada"
        }`,
        "",
        "Clique abaixo para configurar ou alterar a chave PIX.",
      ].join("\n")
    )
    .setColor(
      config.embedColor || 0x5865f2
    );
}

function appearanceEmbed(guild) {
  const config =
    getGuildConfig(guild.id);

  const color =
    Number(config.embedColor || 0x5865f2)
      .toString(16)
      .padStart(6, "0");

  return new EmbedBuilder()
    .setTitle("🎨 APARÊNCIA")
    .setDescription(
      [
        `🎨 **Cor atual:** \`#${color}\``,
        "",
        "Escolha o que deseja alterar.",
      ].join("\n")
    )
    .setColor(
      config.embedColor || 0x5865f2
    );
}

function mediatorEmbed(guild) {
  const queue =
    mediatorQueues.get(guild.id) || [];

  const config =
    getGuildConfig(guild.id);

  const list =
    queue.length
      ? queue
          .map(
            (id, index) =>
              `**${index + 1}.** <@${id}>`
          )
          .join("\n")
      : "Nenhum mediador na fila.";

  return new EmbedBuilder()
    .setTitle("🛡️ CENTRAL DE MEDIADORES")
    .setDescription(
      [
        `🛡️ **Cargo:** ${
          config.mediatorRoleId
            ? `<@&${config.mediatorRoleId}>`
            : "Não configurado"
        }`,
        "",
        `👥 **Mediadores na fila:** ${queue.length}`,
        "",
        list,
      ].join("\n")
    )
    .setColor(
      config.embedColor || 0x5865f2
    );
}

/* =========================================================
   BOTÕES DE CONFIGURAÇÃO
========================================================= */

function rolesButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(
        mainBackButton()
      ),
  ];
}

function betConfigButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            "config_bet_change"
          )
          .setLabel(
            "Alterar valor"
          )
          .setEmoji("💰")
          .setStyle(
            ButtonStyle.Success
          ),

        mainBackButton()
      ),
  ];
}

function feeConfigButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            "config_fee_change"
          )
          .setLabel(
            "Alterar taxa"
          )
          .setEmoji("💳")
          .setStyle(
            ButtonStyle.Primary
          ),

        mainBackButton()
      ),
  ];
}

function pixConfigButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            "config_pix_change"
          )
          .setLabel(
            "Configurar PIX"
          )
          .setEmoji("🔑")
          .setStyle(
            ButtonStyle.Success
          ),

        mainBackButton()
      ),
  ];
}

function appearanceButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            "appearance_color"
          )
          .setLabel(
            "Alterar cor"
          )
          .setEmoji("🎨")
          .setStyle(
            ButtonStyle.Primary
          ),

        new ButtonBuilder()
          .setCustomId(
            "appearance_avatar"
          )
          .setLabel(
            "Avatar"
          )
          .setEmoji("🖼️")
          .setStyle(
            ButtonStyle.Secondary
          ),

        mainBackButton()
      ),
  ];
}

/* =========================================================
   MENU DE FORMATOS DE FILA
========================================================= */

function formatSelect() {
  return new ActionRowBuilder()
    .addComponents(

      new StringSelectMenuBuilder()
        .setCustomId(
          "queue_format"
        )
        .setPlaceholder(
          "Selecione o formato"
        )
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("1x1")
            .setDescription(
              "2 jogadores"
            )
            .setValue("1x1")
            .setEmoji("👤"),

          new StringSelectMenuOptionBuilder()
            .setLabel("2x2")
            .setDescription(
              "4 jogadores"
            )
            .setValue("2x2")
            .setEmoji("👥"),

          new StringSelectMenuOptionBuilder()
            .setLabel("3x3")
            .setDescription(
              "6 jogadores"
            )
            .setValue("3x3")
            .setEmoji("👥"),

          new StringSelectMenuOptionBuilder()
            .setLabel("4x4")
            .setDescription(
              "8 jogadores"
            )
            .setValue("4x4")
            .setEmoji("👥"),

          new StringSelectMenuOptionBuilder()
            .setLabel("5x5")
            .setDescription(
              "10 jogadores"
            )
            .setValue("5x5")
            .setEmoji("👥")
        )
    );
}

/* =========================================================
   MENU DE MODO
========================================================= */

function modeSelect(format) {
  return new ActionRowBuilder()
    .addComponents(

      new StringSelectMenuBuilder()
        .setCustomId(
          `queue_mode|${format}`
        )
        .setPlaceholder(
          "Selecione o modo"
        )
        .addOptions(

          new StringSelectMenuOptionBuilder()
            .setLabel("Mobile")
            .setDescription(
              "Fila para jogadores mobile"
            )
            .setValue("mobile")
            .setEmoji("📱"),

          new StringSelectMenuOptionBuilder()
            .setLabel("Emulador")
            .setDescription(
              "Fila para jogadores de emulador"
            )
            .setValue("emulator")
            .setEmoji("🖥️"),

          new StringSelectMenuOptionBuilder()
            .setLabel("Mobile + Emulador")
            .setDescription(
              "Permite os dois"
            )
            .setValue("ambos")
            .setEmoji("🎮")
        )
    );
}

/* =========================================================
   MENU DE VALOR
========================================================= */

function valueSelect(
  format,
  mode
) {
  const values = [
    5,
    10,
    15,
    20,
    25,
    30,
    40,
    50,
    75,
    100,
  ];

  return new ActionRowBuilder()
    .addComponents(

      new StringSelectMenuBuilder()
        .setCustomId(
          `queue_value|${format}|${mode}`
        )
        .setPlaceholder(
          "Selecione o valor"
        )
        .addOptions(
          values.map(
            value =>
              new StringSelectMenuOptionBuilder()
                .setLabel(
                  formatMoney(value)
                )
                .setValue(
                  String(value)
                )
                .setEmoji("💰")
          )
        )
    );
}

/* =========================================================
   CONFIGURAÇÃO DO MENU
========================================================= */

function configMenu() {
  return configButtons();
}

/* =========================================================
   ABRIR CONFIGURAÇÃO
========================================================= */

async function openConfig(
  interaction
) {
  if (!interaction.guild) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Este painel só pode ser usado dentro de um servidor.",
      }
    );
  }

  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem acessar a configuração.",
      }
    );
  }

  try {
    if (
      interaction.isButton() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.update({
        embeds: [
          configEmbed(
            interaction.guild
          ),
        ],
        components:
          configButtons(),
      });

      return;
    }

    await safeReply(
      interaction,
      {
        embeds: [
          configEmbed(
            interaction.guild
          ),
        ],
        components:
          configButtons(),
      }
    );

  } catch (error) {
    console.error(
      "❌ Erro ao abrir configuração:",
      error
    );
  }
}

/* =========================================================
   CONFIGURAÇÃO — BOTÕES
========================================================= */

async function handleConfigButton(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Servidor não encontrado.",
      }
    );
  }

  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão para isso.",
      }
    );
  }

  const id =
    interaction.customId;

  try {

    /* -----------------------------------------------------
       VOLTAR
    ----------------------------------------------------- */

    if (
      id === "main_back"
    ) {
      return interaction.update({
        embeds: [
          mainEmbed(guild),
        ],
        components:
          mainButtons(),
      });
    }

    /* -----------------------------------------------------
       CARGOS
    ----------------------------------------------------- */

    if (
      id === "config_roles"
    ) {
      return interaction.update({
        embeds: [
          rolesEmbed(guild),
        ],
        components:
          rolesComponents(),
      });
    }

    /* -----------------------------------------------------
       APOSTAS
    ----------------------------------------------------- */

    if (
      id === "config_bet"
    ) {
      return interaction.update({
        embeds: [
          betConfigEmbed(
            guild
          ),
        ],
        components:
          betConfigButtons(),
      });
    }

    /* -----------------------------------------------------
       TAXA
    ----------------------------------------------------- */

    if (
      id === "config_fee"
    ) {
      return interaction.update({
        embeds: [
          feeConfigEmbed(
            guild
          ),
        ],
        components:
          feeConfigButtons(),
      });
    }

    /* -----------------------------------------------------
       PIX
    ----------------------------------------------------- */

    if (
      id === "config_pix"
    ) {
      return interaction.update({
        embeds: [
          pixConfigEmbed(
            guild
          ),
        ],
        components:
          pixConfigButtons(),
      });
    }

    /* -----------------------------------------------------
       APARÊNCIA
    ----------------------------------------------------- */

    if (
      id === "config_appearance"
    ) {
      return interaction.update({
        embeds: [
          appearanceEmbed(
            guild
          ),
        ],
        components:
          appearanceButtons(),
      });
    }

    /* -----------------------------------------------------
       CANAIS
    ----------------------------------------------------- */

    if (
      id === "config_channel"
    ) {
      return interaction.update({
        embeds: [
          channelEmbed(
            guild
          ),
        ],
        components:
          channelComponents(),
      });
    }

    /* -----------------------------------------------------
       ALTERAR VALOR
    ----------------------------------------------------- */

    if (
      id === "config_bet_change"
    ) {
      return interaction.showModal(
        betAmountModal()
      );
    }

    /* -----------------------------------------------------
       ALTERAR TAXA
    ----------------------------------------------------- */

    if (
      id === "config_fee_change"
    ) {
      return interaction.showModal(
        feeModal()
      );
    }

    /* -----------------------------------------------------
       ALTERAR PIX
    ----------------------------------------------------- */

    if (
      id === "config_pix_change"
    ) {
      return interaction.showModal(
        pixModal()
      );
    }

    /* -----------------------------------------------------
       ALTERAR COR
    ----------------------------------------------------- */

    if (
      id === "appearance_color"
    ) {
      return interaction.showModal(
        colorModal()
      );
    }

    /* -----------------------------------------------------
       AVATAR
    ----------------------------------------------------- */

    if (
      id === "appearance_avatar"
    ) {
      const modal =
        new ModalBuilder()
          .setCustomId(
            "modal_avatar"
          )
          .setTitle(
            "Alterar avatar"
          );

      const input =
        new TextInputBuilder()
          .setCustomId(
            "avatar_url"
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
          .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder()
          .addComponents(
            input
          )
      );

      return interaction.showModal(
        modal
      );
    }

  } catch (error) {
    console.error(
      "❌ Erro no botão de configuração:",
      error
    );

    return safeReply(
      interaction,
      {
        content:
          "❌ Ocorreu um erro ao processar essa configuração.",
      }
    );
  }
}

/* =========================================================
   SELEÇÃO DE CARGO
========================================================= */

async function handleRoleSelect(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem configurar cargos.",
      }
    );
  }

  const id =
    interaction.customId;

  if (
    id !==
    "select_role_mediator"
  ) {
    return;
  }

  const roleId =
    interaction.values?.[0];

  if (!roleId) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Nenhum cargo foi selecionado.",
      }
    );
  }

  const role =
    interaction.guild.roles.cache.get(
      roleId
    );

  if (!role) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Cargo não encontrado.",
      }
    );
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  config.mediatorRoleId =
    role.id;

  saveDatabase();

  await interaction.update({
    embeds: [
      rolesEmbed(
        interaction.guild
      ),
    ],
    components:
      rolesComponents(),
  });

  await sendLog(
    interaction.guild,
    `🛡️ Cargo de mediador alterado para ${role}.`
  );
}

/* =========================================================
   SELEÇÃO DE CANAL
========================================================= */

async function handleChannelSelect(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem configurar canais.",
      }
    );
  }

  const id =
    interaction.customId;

  const channelId =
    interaction.values?.[0];

  if (!channelId) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Nenhum canal foi selecionado.",
      }
    );
  }

  const channel =
    interaction.guild.channels.cache.get(
      channelId
    );

  if (!channel) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Canal não encontrado.",
      }
    );
  }

  const config =
    getGuildConfig(
      interaction.guild.id
    );

  /* -----------------------------------------------------
     CANAL PRINCIPAL
  ----------------------------------------------------- */

  if (
    id ===
    "select_channel_main"
  ) {
    if (
      channel.type !==
      ChannelType.GuildText
    ) {
      return safeReply(
        interaction,
        {
          content:
            "❌ Selecione um canal de texto.",
        }
      );
    }

    config.mainChannelId =
      channel.id;
  }

  /* -----------------------------------------------------
     CATEGORIA DAS APOSTAS
  ----------------------------------------------------- */

  else if (
    id ===
    "select_channel_bets"
  ) {
    if (
      channel.type !==
      ChannelType.GuildCategory
    ) {
      return safeReply(
        interaction,
        {
          content:
            "❌ Selecione uma categoria.",
        }
      );
    }

    config.betsCategoryId =
      channel.id;
  }

  else {
    return;
  }

  saveDatabase();

  await interaction.update({
    embeds: [
      channelEmbed(
        interaction.guild
      ),
    ],
    components:
      channelComponents(),
  });

  await sendLog(
    interaction.guild,
    `📢 Configuração de canal alterada por <@${interaction.user.id}>.`
  );
}

/* =========================================================
   SELEÇÃO DO FORMATO DA FILA
========================================================= */

async function handleQueueFormat(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem configurar filas.",
      }
    );
  }

  const format =
    interaction.values?.[0];

  if (!format) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Formato inválido.",
      }
    );
  }

  await interaction.update({
    content: null,

    embeds: [
      new EmbedBuilder()
        .setTitle(
          "🎮 CONFIGURAÇÃO DA FILA"
        )
        .setDescription(
          `Formato selecionado: **${format}**\n\nEscolha o modo da fila.`
        )
        .setColor(
          0x5865f2
        ),
    ],

    components: [
      modeSelect(format),
      new ActionRowBuilder()
        .addComponents(
          mainBackButton()
        ),
    ],
  });
}

/* =========================================================
   SELEÇÃO DO MODO
========================================================= */

async function handleQueueMode(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem configurar filas.",
      }
    );
  }

  const parts =
    interaction.customId
      .split("|");

  const format =
    parts[1];

  const mode =
    interaction.values?.[0];

  if (
    !format ||
    !mode
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Dados da fila inválidos.",
      }
    );
  }

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle(
          "💰 VALOR DA FILA"
        )
        .setDescription(
          [
            `**Formato:** ${format}`,
            `**Modo:** ${modeLabel(mode)}`,
            "",
            "Agora selecione o valor.",
          ].join("\n")
        )
        .setColor(
          0x5865f2
        ),
    ],

    components: [
      valueSelect(
        format,
        mode
      ),

      new ActionRowBuilder()
        .addComponents(
          mainBackButton()
        ),
    ],
  });
}

/* =========================================================
   SELEÇÃO DO VALOR DA FILA
========================================================= */

async function handleQueueValue(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem publicar filas.",
      }
    );
  }

  const parts =
    interaction.customId
      .split("|");

  const format =
    parts[1];

  const mode =
    parts[2];

  const value =
    Number(
      interaction.values?.[0]
    );

  if (
    !format ||
    !mode ||
    !Number.isFinite(value)
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Dados inválidos.",
      }
    );
  }

  await publishQueue(
    interaction,
    format,
    mode,
    value
  );
}

/* =========================================================
   PUBLICAR FILA
========================================================= */

async function publishQueue(
  interaction,
  format,
  mode,
  value
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

  let channel =
    interaction.channel;

  if (
    config.mainChannelId
  ) {
    try {
      const selected =
        await guild.channels.fetch(
          config.mainChannelId
        );

      if (
        selected &&
        selected.isTextBased()
      ) {
        channel =
          selected;
      }
    } catch (error) {
      console.error(
        "❌ Erro ao buscar canal principal:",
        error.message
      );
    }
  }

  const queue =
    getQueue(
      guild.id,
      format,
      mode,
      value
    );

  try {
    await channel.send({
      embeds: [
        queueEmbed(
          guild,
          format,
          mode,
          value
        ),
      ],
      components:
        queueButtons(
          format,
          mode,
          value
        ),
    });

    await safeReply(
      interaction,
      {
        content:
          `✅ Fila **${format}** — ${modeLabel(mode)} — ${formatMoney(value)} publicada com sucesso.`,
      }
    );

    saveDatabase();

  } catch (error) {
    console.error(
      "❌ Erro ao publicar fila:",
      error
    );

    await safeReply(
      interaction,
      {
        content:
          "❌ Não foi possível publicar a fila. Verifique as permissões do bot.",
      }
    );
  }
}

/* =========================================================
   FILA DE MEDIADORES
========================================================= */

function getMediatorQueue(
  guildId
) {
  if (
    !mediatorQueues.has(
      guildId
    )
  ) {
    mediatorQueues.set(
      guildId,
      []
    );
  }

  return mediatorQueues.get(
    guildId
  );
}

function mediatorButtons() {
  return [
    new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            "mediator_join"
          )
          .setLabel(
            "Entrar na fila"
          )
          .setEmoji("✅")
          .setStyle(
            ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            "mediator_leave"
          )
          .setLabel(
            "Sair da fila"
          )
          .setEmoji("🚪")
          .setStyle(
            ButtonStyle.Danger
          ),

        new ButtonBuilder()
          .setCustomId(
            "mediator_refresh"
          )
          .setLabel(
            "Atualizar"
          )
          .setEmoji("🔄")
          .setStyle(
            ButtonStyle.Secondary
          )
      ),
  ];
}

async function handleMediatorButton(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Servidor não encontrado.",
      }
    );
  }

  const id =
    interaction.customId;

  const queue =
    getMediatorQueue(
      guild.id
    );

  /* -----------------------------------------------------
     ENTRAR
  ----------------------------------------------------- */

  if (
    id ===
    "mediator_join"
  ) {
    if (
      !isMediator(
        interaction.member
      )
    ) {
      return safeReply(
        interaction,
        {
          content:
            "❌ Você não possui o cargo de mediador.",
        }
      );
    }

    if (
      queue.includes(
        interaction.user.id
      )
    ) {
      return safeReply(
        interaction,
        {
          content:
            "⚠️ Você já está na fila de mediadores.",
        }
      );
    }

    queue.push(
      interaction.user.id
    );

    saveDatabase();

    return interaction.update({
      embeds: [
        mediatorEmbed(
          guild
        ),
      ],
      components:
        mediatorButtons(),
    });
  }

  /* -----------------------------------------------------
     SAIR
  ----------------------------------------------------- */

  if (
    id ===
    "mediator_leave"
  ) {
    const index =
      queue.indexOf(
        interaction.user.id
      );

    if (
      index === -1
    ) {
      return safeReply(
        interaction,
        {
          content:
            "❌ Você não está na fila de mediadores.",
        }
      );
    }

    queue.splice(
      index,
      1
    );

    saveDatabase();

    return interaction.update({
      embeds: [
        mediatorEmbed(
          guild
        ),
      ],
      components:
        mediatorButtons(),
    });
  }

  /* -----------------------------------------------------
     ATUALIZAR
  ----------------------------------------------------- */

  if (
    id ===
    "mediator_refresh"
  ) {
    return interaction.update({
      embeds: [
        mediatorEmbed(
          guild
        ),
      ],
      components:
        mediatorButtons(),
    });
  }
}

/* =========================================================
   ABRIR PAINEL DO MEDIADOR
========================================================= */

async function openMediator(
  interaction
) {
  if (!interaction.guild) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Servidor não encontrado.",
      }
    );
  }

  return interaction.update({
    embeds: [
      mediatorEmbed(
        interaction.guild
      ),
    ],
    components:
      mediatorButtons(),
  });
}

/* =========================================================
   MODAIS
========================================================= */

async function handleModalSubmit(
  interaction
) {
  const guild =
    interaction.guild;

  if (!guild) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Servidor não encontrado.",
      }
    );
  }

  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem alterar essas configurações.",
      }
    );
  }

  const id =
    interaction.customId;

  const config =
    getGuildConfig(
      guild.id
    );

  /* -----------------------------------------------------
     COR
  ----------------------------------------------------- */

  if (
    id ===
    "modal_color"
  ) {
    let color =
      interaction.fields.getTextInputValue(
        "embed_color"
      );

    color =
      color
        .trim()
        .replace(
          /^#/,
          ""
        );

    if (
      !/^[0-9A-Fa-f]{6}$/.test(
        color
      )
    ) {
      return safeReply(
        interaction,
        {
          content:
            "❌ Cor inválida. Use o formato `#5865F2`.",
        }
      );
    }

    config.embedColor =
      parseInt(
        color,
        16
      );

    saveDatabase();

    return safeReply(
      interaction,
      {
        content:
          `✅ Cor alterada para **#${color.toUpperCase()}**.`,
      }
    );
  }

  /* -----------------------------------------------------
     PIX
  ----------------------------------------------------- */

  if (
    id ===
    "modal_pix"
  ) {
    const pix =
      interaction.fields
        .getTextInputValue(
          "pix_key"
        )
        .trim();

    if (!pix) {
      return safeReply(
        interaction,
        {
          content:
            "❌ A chave PIX não pode ficar vazia.",
        }
      );
    }

    config.pix =
      pix;

    saveDatabase();

    return safeReply(
      interaction,
      {
        content:
          "✅ Chave PIX configurada com sucesso.",
      }
    );
  }

  /* -----------------------------------------------------
     TAXA
  ----------------------------------------------------- */

  if (
    id ===
    "modal_fee"
  ) {
    const raw =
      interaction.fields
        .getTextInputValue(
          "fee_value"
        )
        .replace(
          ",",
          "."
        )
        .trim();

    const fee =
      Number(raw);

    if (
      !Number.isFinite(
        fee
      ) ||
      fee < 0 ||
      fee > 100
    ) {
      return safeReply(
        interaction,
        {
          content:
            "❌ Informe uma taxa entre 0 e 100.",
        }
      );
    }

    config.fee =
      fee;

    saveDatabase();

    return safeReply(
      interaction,
      {
        content:
          `✅ Taxa alterada para **${fee}%**.`,
      }
    );
  }

  /* -----------------------------------------------------
     VALOR DA APOSTA
  ----------------------------------------------------- */

  if (
    id ===
    "modal_bet_amount"
  ) {
    const raw =
      interaction.fields
        .getTextInputValue(
          "bet_amount"
        );

    const value =
      parseMoney(raw);

    if (
      !Number.isFinite(
        value
      ) ||
      value <= 0
    ) {
      return safeReply(
        interaction,
        {
          content:
            "❌ Informe um valor válido.",
        }
      );
    }

    config.betAmount =
      value;

    saveDatabase();

    return safeReply(
      interaction,
      {
        content:
          `✅ Valor padrão alterado para **${formatMoney(value)}**.`,
      }
    );
  }

  /* -----------------------------------------------------
     AVATAR
  ----------------------------------------------------- */

  if (
    id ===
    "modal_avatar"
  ) {
    const url =
      interaction.fields
        .getTextInputValue(
          "avatar_url"
        )
        .trim();

    if (
      !/^https?:\/\/.+/i.test(
        url
      )
    ) {
      return safeReply(
        interaction,
        {
          content:
            "❌ Informe uma URL válida.",
        }
      );
    }

    try {
      await client.user.setAvatar(
        url
      );

      return safeReply(
        interaction,
        {
          content:
            "✅ Avatar do bot alterado com sucesso.",
        }
      );

    } catch (error) {
      console.error(
        "❌ Erro ao alterar avatar:",
        error
      );

      return safeReply(
        interaction,
        {
          content:
            "❌ Não foi possível alterar o avatar. Verifique a URL da imagem.",
        }
      );
    }
  }
}/* =========================================================
   MEDIADOR — CONTROLES DA APOSTA
========================================================= */

function mediatorBetButtons(bet) {
  const row = new ActionRowBuilder();

  if (
    bet.status === "confirmed" &&
    !bet.winnerId
  ) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(
          `bet_winner|${bet.id}`
        )
        .setLabel("Definir vencedor")
        .setEmoji("🏆")
        .setStyle(ButtonStyle.Success)
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(
        `bet_cancel|${bet.id}`
      )
      .setLabel("Cancelar aposta")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
  );

  return [row];
}

/* =========================================================
   ATRIBUIR MEDIADOR
========================================================= */

async function assignMediator(
  interaction,
  betId
) {
  const bet =
    bets.get(betId);

  if (!bet) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Aposta não encontrada.",
      }
    );
  }

  if (
    !isMediator(
      interaction.member
    ) &&
    !isAdmin(
      interaction.member
    )
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Você não possui permissão de mediador.",
      }
    );
  }

  if (
    bet.status === "finished" ||
    bet.status === "cancelled"
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Esta aposta já foi encerrada.",
      }
    );
  }

  bet.mediatorId =
    interaction.user.id;

  saveDatabase();

  await interaction.reply({
    content:
      `🛡️ <@${interaction.user.id}> assumiu a mediação desta aposta.`,
  });

  try {
    await interaction.channel.send({
      embeds: [
        betEmbed(
          interaction.guild,
          bet
        ),
      ],
      components:
        mediatorBetButtons(bet),
    });
  } catch (error) {
    console.error(
      "❌ Erro ao enviar controles do mediador:",
      error
    );
  }

  await sendLog(
    interaction.guild,
    `🛡️ Mediador <@${interaction.user.id}> assumiu a aposta \`${bet.id}\`.`
  );
}

/* =========================================================
   FINALIZAR APOSTA
========================================================= */

async function finishBet(
  interaction,
  bet,
  winnerId
) {
  if (!bet) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Aposta não encontrada.",
      }
    );
  }

  if (
    bet.status === "finished"
  ) {
    return safeReply(
      interaction,
      {
        content:
          "⚠️ Esta aposta já foi finalizada.",
      }
    );
  }

  if (
    bet.status === "cancelled"
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Esta aposta foi cancelada.",
      }
    );
  }

  const canFinish =
    isAdmin(
      interaction.member
    ) ||
    isStaff(
      interaction.member
    ) ||
    (
      bet.mediatorId &&
      bet.mediatorId ===
        interaction.user.id
    );

  if (!canFinish) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Apenas o mediador da aposta ou a equipe pode definir o vencedor.",
      }
    );
  }

  if (
    !bet.players.includes(
      winnerId
    )
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Esse usuário não participa da aposta.",
      }
    );
  }

  bet.winnerId =
    winnerId;

  bet.status =
    "finished";

  activeMatches.delete(
    bet.id
  );

  saveDatabase();

  await interaction.update({
    embeds: [
      betEmbed(
        interaction.guild,
        bet
      ),
    ],
    components: [],
  });

  await interaction.channel.send({
    content:
      `🏆 **APOSTA FINALIZADA!**\n\nVencedor: <@${winnerId}>\n💰 Valor: **${formatMoney(bet.value)}**`,
  });

  await sendLog(
    interaction.guild,
    `🏆 Aposta \`${bet.id}\` finalizada. Vencedor: <@${winnerId}>.`
  );
}

/* =========================================================
   MENU PARA ESCOLHER O VENCEDOR
========================================================= */

function winnerSelect(
  bet
) {
  const options =
    bet.players
      .slice(0, 25)
      .map(
        playerId =>
          new StringSelectMenuOptionBuilder()
            .setLabel(
              `Jogador ${playerId.slice(-4)}`
            )
            .setDescription(
              `ID: ${playerId}`
            )
            .setValue(
              playerId
            )
            .setEmoji("🏆")
      );

  return new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(
          `winner_select|${bet.id}`
        )
        .setPlaceholder(
          "Selecione o vencedor"
        )
        .addOptions(
          options
        )
    );
}

/* =========================================================
   ABRIR SELEÇÃO DO VENCEDOR
========================================================= */

async function openWinnerSelector(
  interaction,
  betId
) {
  const bet =
    bets.get(betId);

  if (!bet) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Aposta não encontrada.",
      }
    );
  }

  const allowed =
    isAdmin(
      interaction.member
    ) ||
    isStaff(
      interaction.member
    ) ||
    (
      bet.mediatorId &&
      bet.mediatorId ===
        interaction.user.id
    );

  if (!allowed) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Você não pode definir o vencedor desta aposta.",
      }
    );
  }

  if (
    bet.status !==
    "confirmed"
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ A aposta precisa estar confirmada antes de definir o vencedor.",
      }
    );
  }

  return interaction.reply({
    content:
      "🏆 Selecione o vencedor:",
    components: [
      winnerSelect(bet),
    ],
    ephemeral: true,
  });
}

/* =========================================================
   SELEÇÃO DO VENCEDOR
========================================================= */

async function handleWinnerSelect(
  interaction
) {
  const parts =
    interaction.customId
      .split("|");

  const betId =
    parts[1];

  const winnerId =
    interaction.values?.[0];

  const bet =
    bets.get(betId);

  if (!bet) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Aposta não encontrada.",
      }
    );
  }

  if (!winnerId) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Vencedor inválido.",
      }
    );
  }

  const allowed =
    isAdmin(
      interaction.member
    ) ||
    isStaff(
      interaction.member
    ) ||
    (
      bet.mediatorId &&
      bet.mediatorId ===
        interaction.user.id
    );

  if (!allowed) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Você não tem permissão.",
      }
    );
  }

  if (
    !bet.players.includes(
      winnerId
    )
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ O vencedor precisa ser um dos jogadores.",
      }
    );
  }

  bet.winnerId =
    winnerId;

  bet.status =
    "finished";

  activeMatches.delete(
    bet.id
  );

  saveDatabase();

  await interaction.update({
    content:
      `🏆 Vencedor definido: <@${winnerId}>`,
    components: [],
  });

  try {
    await interaction.channel.send({
      embeds: [
        betEmbed(
          interaction.guild,
          bet
        ),
      ],
    });

    await interaction.channel.send({
      content:
        `🎉 **APOSTA FINALIZADA!**\n🏆 Vencedor: <@${winnerId}>\n💰 Valor da aposta: **${formatMoney(bet.value)}**`,
    });
  } catch (error) {
    console.error(
      "❌ Erro ao anunciar vencedor:",
      error
    );
  }

  await sendLog(
    interaction.guild,
    `🏆 Aposta \`${bet.id}\` finalizada. Vencedor: <@${winnerId}>.`
  );
}

/* =========================================================
   COMANDO /PAINEL
========================================================= */

async function commandPanel(
  interaction
) {
  if (!interaction.guild) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Este comando só pode ser usado em um servidor.",
      }
    );
  }

  return interaction.reply({
    embeds: [
      mainEmbed(
        interaction.guild
      ),
    ],
    components:
      mainButtons(),
  });
}

/* =========================================================
   COMANDO /CONFIG
========================================================= */

async function commandConfig(
  interaction
) {
  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem usar este comando.",
      }
    );
  }

  return interaction.reply({
    embeds: [
      configEmbed(
        interaction.guild
      ),
    ],
    components:
      configButtons(),
    ephemeral: true,
  });
}

/* =========================================================
   COMANDO /MEDIADOR
========================================================= */

async function commandMediator(
  interaction
) {
  return interaction.reply({
    embeds: [
      mediatorEmbed(
        interaction.guild
      ),
    ],
    components:
      mediatorButtons(),
    ephemeral: true,
  });
}

/* =========================================================
   COMANDO /FILA
========================================================= */

async function commandQueue(
  interaction
) {
  if (!interaction.guild) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Este comando só pode ser usado em um servidor.",
      }
    );
  }

  if (
    !isAdmin(
      interaction.member
    )
  ) {
    return safeReply(
      interaction,
      {
        content:
          "❌ Apenas administradores podem publicar filas.",
      }
    );
  }

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(
          "🎮 CRIAR FILA"
        )
        .setDescription(
          "Selecione o formato da fila."
        )
        .setColor(
          0x5865f2
        ),
    ],
    components: [
      formatSelect(),
      new ActionRowBuilder()
        .addComponents(
          mainBackButton()
        ),
    ],
    ephemeral: true,
  });
}

/* =========================================================
   REGISTRO DOS SLASH COMMANDS
========================================================= */

const slashCommands = [
  new SlashCommandBuilder()
    .setName("painel")
    .setDescription(
      "Abre o painel principal do bot"
    ),

  new SlashCommandBuilder()
    .setName("fila")
    .setDescription(
      "Cria uma nova fila"
    ),

  new SlashCommandBuilder()
    .setName("config")
    .setDescription(
      "Abre a configuração do bot"
    ),

  new SlashCommandBuilder()
    .setName("mediador")
    .setDescription(
      "Abre o painel de mediadores"
    ),
].map(
  command =>
    command.toJSON()
);

/* =========================================================
   REGISTRO DOS COMANDOS
========================================================= */

client.once(
  "ready",
  async () => {
    console.log(
      `✅ Bot conectado como ${client.user.tag}`
    );

    try {
      const guildId =
        process.env.GUILD_ID;

      if (guildId) {
        const guild =
          await client.guilds.fetch(
            guildId
          );

        await guild.commands.set(
          slashCommands
        );

        console.log(
          "✅ Comandos registrados no servidor de teste."
        );
      } else {
        await client.application.commands.set(
          slashCommands
        );

        console.log(
          "✅ Comandos globais registrados."
        );
      }

    } catch (error) {
      console.error(
        "❌ Erro ao registrar comandos:",
        error
      );
    }
  }
);

/* =========================================================
   ÚNICO INTERACTION CREATE
========================================================= */

client.on(
  "interactionCreate",
  async interaction => {

    try {

      /* ===================================================
         SLASH COMMANDS
      =================================================== */

      if (
        interaction.isChatInputCommand()
      ) {

        if (
          interaction.commandName ===
          "painel"
        ) {
          return commandPanel(
            interaction
          );
        }

        if (
          interaction.commandName ===
          "fila"
        ) {
          return commandQueue(
            interaction
          );
        }

        if (
          interaction.commandName ===
          "config"
        ) {
          return commandConfig(
            interaction
          );
        }

        if (
          interaction.commandName ===
          "mediador"
        ) {
          return commandMediator(
            interaction
          );
        }

        return;
      }

      /* ===================================================
         MODAIS
      =================================================== */

      if (
        interaction.isModalSubmit()
      ) {
        return handleModalSubmit(
          interaction
        );
      }

      /* ===================================================
         ROLE SELECT
      =================================================== */

      if (
        interaction.isRoleSelectMenu()
      ) {
        return handleRoleSelect(
          interaction
        );
      }

      /* ===================================================
         CHANNEL SELECT
      =================================================== */

      if (
        interaction.isChannelSelectMenu()
      ) {
        return handleChannelSelect(
          interaction
        );
      }

      /* ===================================================
         STRING SELECT
      =================================================== */

      if (
        interaction.isStringSelectMenu()
      ) {

        const id =
          interaction.customId;

        if (
          id ===
          "queue_format"
        ) {
          return handleQueueFormat(
            interaction
          );
        }

        if (
          id.startsWith(
            "queue_mode|"
          )
        ) {
          return handleQueueMode(
            interaction
          );
        }

        if (
          id.startsWith(
            "queue_value|"
          )
        ) {
          return handleQueueValue(
            interaction
          );
        }

        if (
          id.startsWith(
            "winner_select|"
          )
        ) {
          return handleWinnerSelect(
            interaction
          );
        }

        return;
      }

      /* ===================================================
         BOTÕES
      =================================================== */

      if (
        interaction.isButton()
      ) {

        const id =
          interaction.customId;

        /* -----------------------------------------------
           CONFIGURAÇÃO
        ----------------------------------------------- */

        if (
          id.startsWith(
            "config_"
          ) ||
          id.startsWith(
            "appearance_"
          ) ||
          id === "main_back"
        ) {
          return handleConfigButton(
            interaction
          );
        }

        /* -----------------------------------------------
           MEDIADOR
        ----------------------------------------------- */

        if (
          id ===
            "mediator_join" ||
          id ===
            "mediator_leave" ||
          id ===
            "mediator_refresh"
        ) {
          return handleMediatorButton(
            interaction
          );
        }

        /* -----------------------------------------------
           FILA
        ----------------------------------------------- */

        if (
          id.startsWith(
            "queue_join|"
          )
        ) {
          const parts =
            id.split("|");

          return joinQueue(
            interaction,
            parts[1],
            parts[2],
            Number(parts[3])
          );
        }

        if (
          id.startsWith(
            "queue_leave|"
          )
        ) {
          const parts =
            id.split("|");

          return leaveQueue(
            interaction,
            parts[1],
            parts[2],
            Number(parts[3])
          );
        }

        if (
          id.startsWith(
            "queue_refresh|"
          )
        ) {
          const parts =
            id.split("|");

          return refreshQueue(
            interaction,
            parts[1],
            parts[2],
            Number(parts[3])
          );
        }

        /* -----------------------------------------------
           APOSTA
        ----------------------------------------------- */

        if (
          id.startsWith(
            "bet_confirm|"
          )
        ) {
          const betId =
            id.split("|")[1];

          return confirmBet(
            interaction,
            betId
          );
        }

        if (
          id.startsWith(
            "bet_cancel|"
          )
        ) {
          const betId =
            id.split("|")[1];

          return cancelBet(
            interaction,
            betId
          );
        }

        if (
          id.startsWith(
            "bet_winner|"
          )
        ) {
          const betId =
            id.split("|")[1];

          return openWinnerSelector(
            interaction,
            betId
          );
        }

        return;
      }

    } catch (error) {

      console.error(
        "❌ ERRO NA INTERAÇÃO:",
        error
      );

      try {
        await safeReply(
          interaction,
          {
            content:
              "❌ Ocorreu um erro ao processar esta interação. Tente novamente.",
          }
        );
      } catch (_) {
        // interação já respondida ou expirada
      }
    }
  }
);

/* =========================================================
   LOGIN
========================================================= */

if (!TOKEN) {
  console.error(
    "❌ TOKEN não encontrado no arquivo .env."
  );
  process.exit(1);
}

client.login(
  TOKEN
);
