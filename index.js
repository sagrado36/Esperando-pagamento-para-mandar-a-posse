require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
    Client,
    GatewayIntentBits,
    Partials,
    Events,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    RoleSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    SlashCommandBuilder,
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;

if (!TOKEN) {
    console.error("❌ Token não encontrado. Coloque DISCORD_TOKEN=SEU_TOKEN no .env");
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [
        Partials.Channel,
        Partials.GuildMember,
        Partials.User,
    ],
});

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "bot.json");

const QUEUE_CAPACITY = 2;

const QUEUE_VALUES = [
    0.30,
    0.50,
    0.75,
    1,
    2,
    3,
    5,
    7,
    10,
    20,
    50,
    100,
];

const FORMATS = [
    "1x1",
    "2x2",
    "3x3",
    "4x4",
];

const MODALITIES = [
    "Mobile",
    "Emulador",
    "Misto",
];

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function defaultGuild() {
    return {
        config: {
            mediatorRoleId: null,
            analystRoleId: null,
            adminRoleId: null,

            fee: 0,

            embedColor: "#5865F2",
            profilePicture: null,

            mobileChannelId: null,
            emulatorChannelId: null,
            mediatorChannelId: null,
            betsCategoryId: null,

            pixName: "",
            pixKey: "",
            pixQrCode: "",
        },

        users: {},

        queues: {},

        mediatorQueue: [],
        mediatorIndex: 0,
        mediatorMessageId: null,

        bets: {},
    };
}

function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        const db = {
            guilds: {},
        };

        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(db, null, 2)
        );

        return db;
    }

    try {
        const db = JSON.parse(
            fs.readFileSync(DB_FILE, "utf8")
        );

        if (!db.guilds) {
            db.guilds = {};
        }

        return db;
    } catch (error) {
        console.error(
            "⚠️ O bot.json estava inválido. Criando um novo banco."
        );

        const db = {
            guilds: {},
        };

        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(db, null, 2)
        );

        return db;
    }
}

const db = loadDB();

function saveDB() {
    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(db, null, 2)
    );
}

function getGuildRecord(guildId) {
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = defaultGuild();
    }

    const guildData = db.guilds[guildId];

    if (!guildData.config) {
        guildData.config = defaultGuild().config;
    }

    if (!guildData.users) {
        guildData.users = {};
    }

    if (!guildData.queues) {
        guildData.queues = {};
    }

    if (!guildData.mediatorQueue) {
        guildData.mediatorQueue = [];
    }

    if (!Array.isArray(guildData.mediatorQueue)) {
        guildData.mediatorQueue = [];
    }

    if (typeof guildData.mediatorIndex !== "number") {
        guildData.mediatorIndex = 0;
    }

    if (!guildData.bets) {
        guildData.bets = {};
    }

    /*
     * MIGRAÇÃO DE CONFIGURAÇÕES ANTIGAS
     */

    if (
        !guildData.config.mobileChannelId &&
        guildData.config.mobileRequestsChannelId
    ) {
        guildData.config.mobileChannelId =
            guildData.config.mobileRequestsChannelId;
    }

    if (
        !guildData.config.emulatorChannelId &&
        guildData.config.emulatorRequestsChannelId
    ) {
        guildData.config.emulatorChannelId =
            guildData.config.emulatorRequestsChannelId;
    }

    if (
        !guildData.config.mediatorChannelId &&
        guildData.config.mediatorQueueChannelId
    ) {
        guildData.config.mediatorChannelId =
            guildData.config.mediatorQueueChannelId;
    }

    if (
        !guildData.config.pixQrCode &&
        guildData.config.pixQrUrl
    ) {
        guildData.config.pixQrCode =
            guildData.config.pixQrUrl;
    }

    return guildData;
}

function getGuildConfig(guildId) {
    return getGuildRecord(guildId).config;
}

function getUserStats(guildId, userId) {
    const guildData = getGuildRecord(guildId);

    if (!guildData.users[userId]) {
        guildData.users[userId] = {
            wins: 0,
            losses: 0,
            wo: 0,
            coins: 0,
        };
    }

    return guildData.users[userId];
}

function money(value) {
    return Number(value || 0).toLocaleString(
        "pt-BR",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }
    );
}

function parseMoney(value) {
    let text = String(value || "")
        .trim()
        .replace(/[R$\s]/g, "");

    if (!text) {
        return NaN;
    }

    if (
        text.includes(",") &&
        text.includes(".")
    ) {
        text = text
            .replace(/\./g, "")
            .replace(",", ".");
    } else if (text.includes(",")) {
        text = text.replace(",", ".");
    }

    const number = Number(text);

    return Number.isFinite(number)
        ? number
        : NaN;
}

function safeColor(color) {
    const value = String(color || "").trim();

    if (
        /^#[0-9A-Fa-f]{6}$/.test(value)
    ) {
        return value;
    }

    return "#5865F2";
}

/*
 * ============================================================
 * DETECÇÃO DE TODOS OS CANAIS
 * ============================================================
 */

function getAllGuildChannels(guild) {
    return [
        ...guild.channels.cache.values(),
    ];
}

async function syncGuildChannels(guild) {
    try {
        await guild.channels.fetch();
    } catch (error) {
        console.error(
            `⚠️ Não consegui atualizar os canais de ${guild.name}:`,
            error.message
        );
    }

    return getAllGuildChannels(guild);
}

function channelLabel(channel) {
    return `${channel.name} (${channel.id})`;
}

/*
 * ============================================================
 * PERMISSÕES
 * ============================================================
 */

function isAdmin(member, guildId) {
    if (!member) {
        return false;
    }

    const config = getGuildConfig(guildId);

    if (
        member.permissions &&
        member.permissions.has(
            PermissionFlagsBits.Administrator
        )
    ) {
        return true;
    }

    if (
        config.adminRoleId &&
        member.roles &&
        member.roles.cache &&
        member.roles.cache.has(
            config.adminRoleId
        )
    ) {
        return true;
    }

    return false;
}

function isMediator(member, guildId) {
    if (!member) {
        return false;
    }

    const config = getGuildConfig(guildId);

    if (
        config.mediatorRoleId &&
        member.roles &&
        member.roles.cache &&
        member.roles.cache.has(
            config.mediatorRoleId
        )
    ) {
        return true;
    }

    /*
     * ADM também pode atuar como mediador.
     */

    return isAdmin(member, guildId);
}

/*
 * ============================================================
 * ADM ONLINE
 * ============================================================
 */

function getOnlineAdmins(guild) {
    return guild.members.cache.filter(
        (member) => {
            if (member.user.bot) {
                return false;
            }

            if (!isAdmin(member, guild.id)) {
                return false;
            }

            return (
                member.presence &&
                member.presence.status &&
                member.presence.status !== "offline"
            );
        }
    );
}

function hasOnlineAdmin(guild) {
    return getOnlineAdmins(guild).size > 0;
}

/*
 * ============================================================
 * FILAS
 * ============================================================
 */

function queueKey(
    format,
    modality,
    value
) {
    return (
        `${format}|${modality}|${Number(value).toFixed(2)}`
    );
}

function getQueue(
    guildId,
    format,
    modality,
    value
) {
    const guildData =
        getGuildRecord(guildId);

    const key = queueKey(
        format,
        modality,
        value
    );

    if (!guildData.queues[key]) {
        guildData.queues[key] = {
            format,
            modality,
            value: Number(value),

            players: [],
            gelo: {},

            messageId: null,
            channelId: null,

            busy: false,
        };
    }

    const queue =
        guildData.queues[key];

    if (!Array.isArray(queue.players)) {
        queue.players = [];
    }

    if (!queue.gelo) {
        queue.gelo = {};
    }

    if (typeof queue.busy !== "boolean") {
        queue.busy = false;
    }

    return queue;
}

function formatGelo(gelo) {
    if (gelo === "normal") {
        return "🧊 Gelo Normal";
    }

    if (gelo === "infinito") {
        return "♾️ Gelo Infinito";
    }

    return "Não definido";
}

/*
 * ============================================================
 * EMBED DAS FILAS
 * ============================================================
 */

function queueEmbed(guild, queue) {
    const config =
        getGuildConfig(guild.id);

    const players =
        queue.players.length > 0
            ? queue.players
                  .map(
                      (id, index) =>
                          `${index + 1}. <@${id}>`
                  )
                  .join("\n")
            : "Ninguém na fila.";

    const online =
        hasOnlineAdmin(guild);

    const status =
        !online
            ? "🔒 Bloqueada"
            : queue.players.length >=
              QUEUE_CAPACITY
            ? "🟢 Cheia"
            : "🟡 Aguardando";

    const embed =
        new EmbedBuilder()
            .setColor(
                safeColor(
                    config.embedColor
                )
            )
            .setTitle(
                `🎯 FILA ${queue.format} • ${queue.modality}`
            )
            .setDescription(
                `Entre na fila e aguarde seu adversário.\n\n` +
                `**Status:** ${status}`
            )
            .addFields(
                {
                    name: "💰 Valor",
                    value:
                        `**R$ ${money(queue.value)}**`,
                    inline: true,
                },
                {
                    name: "👥 Formato",
                    value:
                        `**${queue.format}**`,
                    inline: true,
                },
                {
                    name: "🎮 Modalidade",
                    value:
                        `**${queue.modality}**`,
                    inline: true,
                },
                {
                    name: "📊 Capacidade",
                    value:
                        `**${queue.players.length}/${QUEUE_CAPACITY}**`,
                    inline: true,
                },
                {
                    name: "👤 Jogadores",
                    value: players,
                    inline: false,
                }
            );

    if (queue.format === "1x1") {
        const normal =
            queue.players.filter(
                (id) =>
                    queue.gelo[id] ===
                    "normal"
            ).length;

        const infinito =
            queue.players.filter(
                (id) =>
                    queue.gelo[id] ===
                    "infinito"
            ).length;

        embed.addFields({
            name: "🧊 Tipo de Gelo",
            value:
                `🧊 Gelo Normal: **${normal}/2**\n` +
                `♾️ Gelo Infinito: **${infinito}/2**`,
            inline: false,
        });
    }

    embed.addFields({
        name: "📌 Como funciona",
        value:
            queue.format === "1x1"
                ? "Escolha o tipo de gelo desejado. A partida inicia quando **2 jogadores estiverem no mesmo gelo**."
                : "Clique em **Entrar na Fila**. A partida inicia quando houver **2 jogadores**.",
        inline: false,
    });

    if (!online) {
        embed.addFields({
            name: "🔒 Fila bloqueada",
            value:
                "É necessário ter pelo menos **1 ADM online** para liberar novas entradas.",
            inline: false,
        });
    }

    embed
        .setThumbnail(
            config.profilePicture ||
                guild.iconURL({
                    dynamic: true,
                }) ||
                null
        )
        .setFooter({
            text:
                "Sistema de filas • capacidade fixa de 2 jogadores",
        })
        .setTimestamp();

    return embed;
}/*
 * ============================================================
 * BOTÕES DAS FILAS
 * ============================================================
 */

function queueButtons(queue, guildId) {
    const rows = [];

    if (queue.format === "1x1") {
        rows.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `queue_normal:${guildId}:${queue.format}:${queue.modality}:${queue.value}`
                    )
                    .setLabel("Gelo Normal")
                    .setEmoji("🧊")
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId(
                        `queue_infinito:${guildId}:${queue.format}:${queue.modality}:${queue.value}`
                    )
                    .setLabel("Gelo Infinito")
                    .setEmoji("♾️")
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId(
                        `queue_leave:${guildId}:${queue.format}:${queue.modality}:${queue.value}`
                    )
                    .setLabel("Sair da Fila")
                    .setEmoji("🚪")
                    .setStyle(ButtonStyle.Danger)
            )
        );

        return rows;
    }

    rows.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `queue_join:${guildId}:${queue.format}:${queue.modality}:${queue.value}`
                )
                .setLabel("Entrar na Fila")
                .setEmoji("✅")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId(
                    `queue_leave:${guildId}:${queue.format}:${queue.modality}:${queue.value}`
                )
                .setLabel("Sair da Fila")
                .setEmoji("🚪")
                .setStyle(ButtonStyle.Danger)
        )
    );

    return rows;
}

/*
 * ============================================================
 * LOCALIZAÇÃO DE JOGADOR
 * ============================================================
 */

function findPlayerQueue(
    guildId,
    userId
) {
    const guildData =
        getGuildRecord(guildId);

    for (
        const queue of Object.values(
            guildData.queues
        )
    ) {
        if (
            Array.isArray(queue.players) &&
            queue.players.includes(userId)
        ) {
            return queue;
        }
    }

    return null;
}

function removePlayerFromQueue(
    guildId,
    userId
) {
    const guildData =
        getGuildRecord(guildId);

    let removed = false;

    for (
        const queue of Object.values(
            guildData.queues
        )
    ) {
        if (
            !Array.isArray(queue.players)
        ) {
            continue;
        }

        const index =
            queue.players.indexOf(
                userId
            );

        if (index === -1) {
            continue;
        }

        queue.players.splice(
            index,
            1
        );

        delete queue.gelo[userId];

        removed = true;
    }

    if (removed) {
        saveDB();
    }

    return removed;
}

/*
 * ============================================================
 * ADICIONAR JOGADOR
 * ============================================================
 */

async function addPlayerToQueue(
    interaction,
    queue,
    gelo = null
) {
    const guild =
        interaction.guild;

    const userId =
        interaction.user.id;

    if (!guild) {
        return;
    }

    if (!hasOnlineAdmin(guild)) {
        return interaction.reply({
            content:
                "🔒 **A fila está bloqueada.**\n\n" +
                "É necessário haver pelo menos **1 ADM online** para entrar nas filas.",
            ephemeral: true,
        });
    }

    if (queue.busy) {
        return interaction.reply({
            content:
                "⏳ Essa fila já está iniciando uma partida.",
            ephemeral: true,
        });
    }

    const currentQueue =
        findPlayerQueue(
            guild.id,
            userId
        );

    if (currentQueue) {
        if (
            currentQueue === queue
        ) {
            return interaction.reply({
                content:
                    "⚠️ Você já está nesta fila.",
                ephemeral: true,
            });
        }

        return interaction.reply({
            content:
                "⚠️ Você já está em outra fila. Saia dela antes de entrar em uma nova.",
            ephemeral: true,
        });
    }

    if (
        queue.players.length >=
        QUEUE_CAPACITY
    ) {
        return interaction.reply({
            content:
                "❌ Essa fila já está cheia.",
            ephemeral: true,
        });
    }

    if (
        queue.format === "1x1" &&
        !["normal", "infinito"].includes(
            gelo
        )
    ) {
        return interaction.reply({
            content:
                "❌ Escolha um tipo de gelo.",
            ephemeral: true,
        });
    }

    queue.players.push(userId);

    if (queue.format === "1x1") {
        queue.gelo[userId] = gelo;
    }

    saveDB();

    await updateQueueMessage(
        guild,
        queue
    );

    await interaction.reply({
        content:
            queue.format === "1x1"
                ? `✅ Você entrou na fila com **${formatGelo(gelo)}**.`
                : "✅ Você entrou na fila.",
        ephemeral: true,
    });

    await tryStartQueue(
        guild,
        queue
    );
}

/*
 * ============================================================
 * SAIR DA FILA
 * ============================================================
 */

async function leaveQueue(
    interaction,
    queue
) {
    const guild =
        interaction.guild;

    const userId =
        interaction.user.id;

    const index =
        queue.players.indexOf(
            userId
        );

    if (index === -1) {
        return interaction.reply({
            content:
                "⚠️ Você não está nesta fila.",
            ephemeral: true,
        });
    }

    if (queue.busy) {
        return interaction.reply({
            content:
                "⏳ Essa fila já está iniciando uma partida. Aguarde.",
            ephemeral: true,
        });
    }

    queue.players.splice(
        index,
        1
    );

    delete queue.gelo[userId];

    saveDB();

    await updateQueueMessage(
        guild,
        queue
    );

    return interaction.reply({
        content:
            "🚪 Você saiu da fila.",
        ephemeral: true,
    });
}

/*
 * ============================================================
 * ATUALIZAR MENSAGEM DA FILA
 * ============================================================
 */

async function updateQueueMessage(
    guild,
    queue
) {
    if (
        !queue.channelId ||
        !queue.messageId
    ) {
        return;
    }

    try {
        const channel =
            await guild.channels.fetch(
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
                queueEmbed(
                    guild,
                    queue
                ),
            ],
            components:
                queueButtons(
                    queue,
                    guild.id
                ),
        });
    } catch (error) {
        console.error(
            `⚠️ Erro atualizando fila ${queueKey(
                queue.format,
                queue.modality,
                queue.value
            )}:`,
            error.message
        );
    }
}

/*
 * ============================================================
 * CRIAR TODAS AS FILAS
 * ============================================================
 */

async function createQueuesMessage(
    guild,
    channel
) {
    const guildData =
        getGuildRecord(guild.id);

    const createdMessages = [];

    for (
        const format of FORMATS
    ) {
        for (
            const modality of MODALITIES
        ) {
            for (
                const value of QUEUE_VALUES
            ) {
                const queue =
                    getQueue(
                        guild.id,
                        format,
                        modality,
                        value
                    );

                /*
                 * Cada fila vira uma mensagem separada.
                 */

                try {
                    let message = null;

                    if (
                        queue.messageId &&
                        queue.channelId ===
                            channel.id
                    ) {
                        try {
                            message =
                                await channel.messages.fetch(
                                    queue.messageId
                                );
                        } catch {
                            message = null;
                        }
                    }

                    if (message) {
                        await message.edit({
                            embeds: [
                                queueEmbed(
                                    guild,
                                    queue
                                ),
                            ],
                            components:
                                queueButtons(
                                    queue,
                                    guild.id
                                ),
                        });
                    } else {
                        message =
                            await channel.send({
                                embeds: [
                                    queueEmbed(
                                        guild,
                                        queue
                                    ),
                                ],
                                components:
                                    queueButtons(
                                        queue,
                                        guild.id
                                    ),
                            });

                        queue.messageId =
                            message.id;

                        queue.channelId =
                            channel.id;
                    }

                    createdMessages.push(
                        message.id
                    );
                } catch (error) {
                    console.error(
                        "❌ Erro criando fila:",
                        error.message
                    );
                }
            }
        }
    }

    saveDB();

    return createdMessages;
}

/*
 * ============================================================
 * MEDIADORES
 * ============================================================
 */

function cleanMediatorQueue(
    guild
) {
    const guildData =
        getGuildRecord(guild.id);

    guildData.mediatorQueue =
        guildData.mediatorQueue.filter(
            (userId) => {
                const member =
                    guild.members.cache.get(
                        userId
                    );

                return (
                    member &&
                    !member.user.bot &&
                    isMediator(
                        member,
                        guild.id
                    )
                );
            }
        );

    if (
        guildData.mediatorIndex >=
        guildData.mediatorQueue.length
    ) {
        guildData.mediatorIndex = 0;
    }

    saveDB();
}

function getAvailableMediators(
    guild
) {
    cleanMediatorQueue(
        guild
    );

    const guildData =
        getGuildRecord(guild.id);

    return guildData.mediatorQueue
        .map((userId) =>
            guild.members.cache.get(
                userId
            )
        )
        .filter(Boolean)
        .filter(
            (member) =>
                !member.user.bot &&
                isMediator(
                    member,
                    guild.id
                )
        );
}

function addMediator(
    guild,
    userId
) {
    const guildData =
        getGuildRecord(guild.id);

    if (
        !guildData.mediatorQueue.includes(
            userId
        )
    ) {
        guildData.mediatorQueue.push(
            userId
        );

        saveDB();
    }
}

function removeMediator(
    guild,
    userId
) {
    const guildData =
        getGuildRecord(guild.id);

    const index =
        guildData.mediatorQueue.indexOf(
            userId
        );

    if (index !== -1) {
        guildData.mediatorQueue.splice(
            index,
            1
        );

        if (
            guildData.mediatorIndex >=
            guildData.mediatorQueue.length
        ) {
            guildData.mediatorIndex = 0;
        }

        saveDB();
    }
}

function findAvailableMediator(
    guild
) {
    const guildData =
        getGuildRecord(guild.id);

    cleanMediatorQueue(
        guild
    );

    const mediators =
        getAvailableMediators(
            guild
        );

    if (!mediators.length) {
        return null;
    }

    if (
        guildData.mediatorIndex >=
        mediators.length
    ) {
        guildData.mediatorIndex = 0;
    }

    const mediator =
        mediators[
            guildData.mediatorIndex
        ];

    guildData.mediatorIndex =
        (
            guildData.mediatorIndex + 1
        ) % mediators.length;

    saveDB();

    return mediator;
}

/*
 * ============================================================
 * EMBED DA FILA DE MEDIADORES
 * ============================================================
 */

function mediatorQueueEmbed(
    guild
) {
    const config =
        getGuildConfig(guild.id);

    cleanMediatorQueue(
        guild
    );

    const mediators =
        getAvailableMediators(
            guild
        );

    let list =
        "Nenhum mediador disponível.";

    if (mediators.length) {
        list = mediators
            .map(
                (member, index) =>
                    `**${index + 1}.** ${member}`
            )
            .join("\n");
    }

    return new EmbedBuilder()
        .setColor(
            safeColor(
                config.embedColor
            )
        )
        .setTitle(
            "🛡️ FILA DE MEDIADORES"
        )
        .setDescription(
            "Mediadores disponíveis para receber partidas."
        )
        .addFields(
            {
                name: "👥 Mediadores",
                value: list,
                inline: false,
            },
            {
                name: "🔄 Sistema",
                value:
                    "As partidas de **Emulador** são distribuídas em ordem de rodízio.",
                inline: false,
            },
            {
                name: "📌 Como entrar",
                value:
                    "Use o botão abaixo para entrar ou sair da fila.",
                inline: false,
            }
        )
        .setThumbnail(
            config.profilePicture ||
                guild.iconURL({
                    dynamic: true,
                }) ||
                null
        )
        .setFooter({
            text:
                "Sistema de mediadores",
        })
        .setTimestamp();
}

function mediatorQueueButtons(
    guildId
) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `mediator_join:${guildId}`
                )
                .setLabel(
                    "Entrar na Fila"
                )
                .setEmoji("✅")
                .setStyle(
                    ButtonStyle.Success
                ),

            new ButtonBuilder()
                .setCustomId(
                    `mediator_leave:${guildId}`
                )
                .setLabel(
                    "Sair da Fila"
                )
                .setEmoji("🚪")
                .setStyle(
                    ButtonStyle.Danger
                )
        ),
    ];
}

/*
 * ============================================================
 * PUBLICAR / ATUALIZAR FILA DE MEDIADORES
 * ============================================================
 */

async function publishMediatorQueue(
    guild
) {
    const config =
        getGuildConfig(guild.id);

    if (
        !config.mediatorChannelId
    ) {
        return;
    }

    try {
        const channel =
            await guild.channels.fetch(
                config.mediatorChannelId
            );

        if (
            !channel ||
            !channel.isTextBased()
        ) {
            return;
        }

        const guildData =
            getGuildRecord(guild.id);

        let message = null;

        if (
            guildData.mediatorMessageId
        ) {
            try {
                message =
                    await channel.messages.fetch(
                        guildData.mediatorMessageId
                    );
            } catch {
                message = null;
            }
        }

        const payload = {
            embeds: [
                mediatorQueueEmbed(
                    guild
                ),
            ],
            components:
                mediatorQueueButtons(
                    guild.id
                ),
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

            guildData.mediatorMessageId =
                message.id;

            saveDB();
        }
    } catch (error) {
        console.error(
            "❌ Erro publicando fila de mediadores:",
            error.message
        );
    }
}

/*
 * ============================================================
 * GERAR ID DA PARTIDA
 * ============================================================
 */

function generateBetId(
    guildId
) {
    const guildData =
        getGuildRecord(guildId);

    let id;

    do {
        id =
            `BET-${Date.now()
                .toString(36)
                .toUpperCase()}-${Math.floor(
                1000 + Math.random() * 9000
            )}`;
    } while (
        guildData.bets[id]
    );

    return id;
}

/*
 * ============================================================
 * CRIAR APOSTA
 * ============================================================
 */

async function createBetFromQueue(
    guild,
    queue
) {
    if (
        queue.players.length <
        QUEUE_CAPACITY
    ) {
        return null;
    }

    if (queue.busy) {
        return null;
    }

    /*
     * No 1x1, os dois precisam estar
     * no mesmo tipo de gelo.
     */

    if (queue.format === "1x1") {
        const first =
            queue.gelo[
                queue.players[0]
            ];

        const second =
            queue.gelo[
                queue.players[1]
            ];

        if (
            !first ||
            !second ||
            first !== second
        ) {
            return null;
        }
    }

    /*
     * Emulador precisa de mediador.
     */

    let mediator = null;

    if (
        queue.modality ===
        "Emulador"
    ) {
        mediator =
            findAvailableMediator(
                guild
            );

        if (!mediator) {
            return null;
        }
    }

    queue.busy = true;

    const players = [
        ...queue.players,
    ];

    const gelo =
        queue.format === "1x1"
            ? queue.gelo[players[0]]
            : null;

    const betId =
        generateBetId(
            guild.id
        );

    const config =
        getGuildConfig(guild.id);

    let category = null;

    if (
        config.betsCategoryId
    ) {
        const possibleCategory =
            guild.channels.cache.get(
                config.betsCategoryId
            );

        if (
            possibleCategory &&
            possibleCategory.type ===
                ChannelType.GuildCategory
        ) {
            category =
                possibleCategory;
        }
    }

    let channel = null;

    try {
        channel =
            await guild.channels.create(
                {
                    name:
                        `aposta-${betId.toLowerCase()}`,
                    type:
                        ChannelType.GuildText,

                    parent:
                        category?.id ||
                        undefined,

                    topic:
                        `Partida ${betId}`,

                    permissionOverwrites: [
                        {
                            id:
                                guild.roles
                                    .everyone.id,
                            deny: [
                                PermissionFlagsBits.ViewChannel,
                            ],
                        },

                        ...players.map(
                            (userId) => ({
                                id: userId,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.SendMessages,
                                    PermissionFlagsBits.ReadMessageHistory,
                                ],
                            })
                        ),

                        ...(mediator
                            ? [
                                  {
                                      id: mediator.id,
                                      allow: [
                                          PermissionFlagsBits.ViewChannel,
                                          PermissionFlagsBits.SendMessages,
                                          PermissionFlagsBits.ReadMessageHistory,
                                      ],
                                  },
                              ]
                            : []),
                    ],
                }
            );
    } catch (error) {
        queue.busy = false;

        if (
            queue.format === "1x1"
        ) {
            players.forEach(
                (userId) => {
                    queue.gelo[userId] =
                        gelo;
                }
            );
        }

        saveDB();

        console.error(
            "❌ Erro criando canal da aposta:",
            error.message
        );

        return null;
    }

    const bet = {
        id: betId,

        guildId: guild.id,
        channelId: channel.id,

        format: queue.format,
        modality: queue.modality,
        value: Number(
            queue.value
        ),

        gelo,

        players,

        mediatorId:
            mediator?.id || null,

        confirmed: [],

        status:
            "aguardando_confirmacao",

        roomId: null,
        roomPassword: null,

        winnerId: null,
        loserId: null,

        createdAt: Date.now(),
    };

    const guildData =
        getGuildRecord(guild.id);

    guildData.bets[betId] =
        bet;

    /*
     * Retira os jogadores da fila.
     */

    queue.players = [];
    queue.gelo = {};
    queue.busy = false;

    saveDB();

    await updateQueueMessage(
        guild,
        queue
    );

    await sendBetEmbed(
        guild,
        bet
    );

    return bet;
}/*
 * ============================================================
 * EMBED DA APOSTA
 * ============================================================
 */

function betEmbed(guild, bet) {
    const config = getGuildConfig(guild.id);

    const players = bet.players
        .map(
            (id, index) =>
                `**${index + 1}.** <@${id}>`
        )
        .join("\n");

    const confirmed = bet.confirmed
        .map((id) => `<@${id}>`)
        .join(", ") || "Ninguém";

    let statusText = "🟡 Aguardando confirmação";

    if (bet.status === "aguardando_pix") {
        statusText = "💳 Aguardando pagamento";
    }

    if (bet.status === "aguardando_sala") {
        statusText = "🎮 Aguardando sala";
    }

    if (bet.status === "em_partida") {
        statusText = "🔥 Partida em andamento";
    }

    if (bet.status === "finalizada") {
        statusText = "🏆 Partida finalizada";
    }

    if (bet.status === "cancelada") {
        statusText = "❌ Partida cancelada";
    }

    const embed = new EmbedBuilder()
        .setColor(
            safeColor(config.embedColor)
        )
        .setTitle(
            `🎯 APOSTA • ${bet.id}`
        )
        .setDescription(
            "Confira todos os dados da partida abaixo."
        )
        .addFields(
            {
                name: "💰 Valor da aposta",
                value:
                    `**R$ ${money(bet.value)}**`,
                inline: true,
            },
            {
                name: "👥 Formato",
                value:
                    `**${bet.format}**`,
                inline: true,
            },
            {
                name: "🎮 Modalidade",
                value:
                    `**${bet.modality}**`,
                inline: true,
            },
            {
                name: "🧊 Gelo",
                value:
                    bet.gelo
                        ? formatGelo(
                              bet.gelo
                          )
                        : "Não se aplica",
                inline: true,
            },
            {
                name: "👤 Jogadores",
                value: players,
                inline: false,
            },
            {
                name: "✅ Confirmações",
                value:
                    `${confirmed}\n\n` +
                    `**${bet.confirmed.length}/${bet.players.length}** confirmados`,
                inline: false,
            },
            {
                name: "📌 Status",
                value: statusText,
                inline: false,
            }
        );

    if (bet.mediatorId) {
        embed.addFields({
            name: "🛡️ Mediador",
            value:
                `<@${bet.mediatorId}>`,
            inline: false,
        });
    }

    embed
        .setThumbnail(
            config.profilePicture ||
                guild.iconURL({
                    dynamic: true,
                }) ||
                null
        )
        .setFooter({
            text:
                "Sistema de apostas • confirme somente se estiver de acordo",
        })
        .setTimestamp();

    return embed;
}

/*
 * ============================================================
 * BOTÕES DA APOSTA
 * ============================================================
 */

function betButtons(bet) {
    if (
        bet.status === "finalizada" ||
        bet.status === "cancelada"
    ) {
        return [];
    }

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `bet_confirm:${bet.id}`
                )
                .setLabel(
                    "Confirmar Partida"
                )
                .setEmoji("✅")
                .setStyle(
                    ButtonStyle.Success
                ),

            new ButtonBuilder()
                .setCustomId(
                    `bet_cancel:${bet.id}`
                )
                .setLabel(
                    "Cancelar"
                )
                .setEmoji("❌")
                .setStyle(
                    ButtonStyle.Danger
                )
        ),
    ];
}

/*
 * ============================================================
 * ENVIAR EMBED DA APOSTA
 * ============================================================
 */

async function sendBetEmbed(
    guild,
    bet
) {
    try {
        const channel =
            await guild.channels.fetch(
                bet.channelId
            );

        if (
            !channel ||
            !channel.isTextBased()
        ) {
            return;
        }

        const message =
            await channel.send({
                content:
                    bet.players
                        .map(
                            (id) =>
                                `<@${id}>`
                        )
                        .join(" "),

                embeds: [
                    betEmbed(
                        guild,
                        bet
                    ),
                ],

                components:
                    betButtons(bet),
            });

        bet.messageId =
            message.id;

        saveDB();
    } catch (error) {
        console.error(
            "❌ Erro enviando aposta:",
            error.message
        );
    }
}

/*
 * ============================================================
 * ATUALIZAR EMBED DA APOSTA
 * ============================================================
 */

async function updateBetMessage(
    guild,
    bet
) {
    if (
        !bet.channelId ||
        !bet.messageId
    ) {
        return;
    }

    try {
        const channel =
            await guild.channels.fetch(
                bet.channelId
            );

        if (
            !channel ||
            !channel.isTextBased()
        ) {
            return;
        }

        const message =
            await channel.messages.fetch(
                bet.messageId
            );

        await message.edit({
            embeds: [
                betEmbed(
                    guild,
                    bet
                ),
            ],
            components:
                betButtons(bet),
        });
    } catch (error) {
        console.error(
            "⚠️ Não consegui atualizar aposta:",
            error.message
        );
    }
}

/*
 * ============================================================
 * CONFIRMAÇÃO DA PARTIDA
 * ============================================================
 */

async function confirmBet(
    interaction,
    bet
) {
    const userId =
        interaction.user.id;

    if (
        !bet.players.includes(
            userId
        )
    ) {
        return interaction.reply({
            content:
                "❌ Você não participa desta partida.",
            ephemeral: true,
        });
    }

    if (
        bet.status !==
        "aguardando_confirmacao"
    ) {
        return interaction.reply({
            content:
                "⚠️ Esta partida não está mais aguardando confirmação.",
            ephemeral: true,
        });
    }

    if (
        bet.confirmed.includes(
            userId
        )
    ) {
        return interaction.reply({
            content:
                "⚠️ Você já confirmou esta partida.",
            ephemeral: true,
        });
    }

    bet.confirmed.push(
        userId
    );

    saveDB();

    await interaction.reply({
        content:
            "✅ Sua confirmação foi registrada.",
        ephemeral: true,
    });

    const guild =
        interaction.guild;

    await updateBetMessage(
        guild,
        bet
    );

    /*
     * Todos confirmaram.
     */

    if (
        bet.confirmed.length ===
        bet.players.length
    ) {
        await startPixStage(
            guild,
            bet
        );
    }
}

/*
 * ============================================================
 * CANCELAR APOSTA
 * ============================================================
 */

async function cancelBet(
    interaction,
    bet
) {
    const userId =
        interaction.user.id;

    const member =
        interaction.member;

    const allowed =
        bet.players.includes(
            userId
        ) ||
        isMediator(
            member,
            interaction.guild.id
        ) ||
        isAdmin(
            member,
            interaction.guild.id
        );

    if (!allowed) {
        return interaction.reply({
            content:
                "❌ Você não pode cancelar esta partida.",
            ephemeral: true,
        });
    }

    if (
        bet.status ===
            "finalizada" ||
        bet.status ===
            "cancelada"
    ) {
        return interaction.reply({
            content:
                "⚠️ Esta partida já foi encerrada.",
            ephemeral: true,
        });
    }

    bet.status =
        "cancelada";

    saveDB();

    await interaction.reply({
        content:
            "❌ A partida foi cancelada.",
        ephemeral: true,
    });

    await updateBetMessage(
        interaction.guild,
        bet
    );

    try {
        const channel =
            await interaction.guild.channels.fetch(
                bet.channelId
            );

        if (
            channel &&
            channel.isTextBased()
        ) {
            await channel.send(
                "❌ **Partida cancelada.** Este canal poderá ser fechado pela administração."
            );
        }
    } catch {}
}

/*
 * ============================================================
 * PIX
 * ============================================================
 */

async function startPixStage(
    guild,
    bet
) {
    if (
        bet.status !==
        "aguardando_confirmacao"
    ) {
        return;
    }

    bet.status =
        "aguardando_pix";

    saveDB();

    await updateBetMessage(
        guild,
        bet
    );

    await sendPix(
        guild,
        bet
    );
}

async function sendPix(
    guild,
    bet
) {
    const config =
        getGuildConfig(
            guild.id
        );

    try {
        const channel =
            await guild.channels.fetch(
                bet.channelId
            );

        if (
            !channel ||
            !channel.isTextBased()
        ) {
            return;
        }

        const total =
            Number(bet.value) *
            bet.players.length;

        const fee =
            Number(config.fee || 0);

        const feeValue =
            total * (fee / 100);

        const finalValue =
            total + feeValue;

        const embed =
            new EmbedBuilder()
                .setColor(
                    safeColor(
                        config.embedColor
                    )
                )
                .setTitle(
                    "💳 PAGAMENTO VIA PIX"
                )
                .setDescription(
                    "Todos os jogadores confirmaram a partida. Efetue o pagamento conforme as informações abaixo."
                )
                .addFields(
                    {
                        name: "💰 Valor por jogador",
                        value:
                            `**R$ ${money(
                                bet.value
                            )}**`,
                        inline: true,
                    },
                    {
                        name: "👥 Jogadores",
                        value:
                            `**${bet.players.length}**`,
                        inline: true,
                    },
                    {
                        name: "📊 Taxa",
                        value:
                            `**${money(
                                fee
                            )}%**`,
                        inline: true,
                    },
                    {
                        name: "💵 Total",
                        value:
                            `**R$ ${money(
                                finalValue
                            )}**`,
                        inline: false,
                    },
                    {
                        name: "👤 Nome do PIX",
                        value:
                            config.pixName ||
                            "Não configurado",
                        inline: false,
                    },
                    {
                        name: "🔑 Chave PIX",
                        value:
                            config.pixKey ||
                            "Não configurada",
                        inline: false,
                    }
                )
                .setFooter({
                    text:
                        "Após o pagamento, aguarde a liberação da sala.",
                })
                .setTimestamp();

        if (
            config.pixQrCode
        ) {
            embed.setImage(
                config.pixQrCode
            );
        }

        await channel.send({
            embeds: [embed],
        });

        /*
         * Se não houver chave Pix configurada,
         * avisamos a administração.
         */

        if (
            !config.pixKey
        ) {
            await channel.send(
                "⚠️ **ATENÇÃO:** o PIX ainda não foi configurado. Um administrador precisa configurar a chave PIX."
            );
        }

        /*
         * Para partidas que não dependem
         * de mediador específico, o ADM
         * poderá liberar a sala.
         */

        if (
            bet.modality !==
                "Emulador" &&
            !bet.mediatorId
        ) {
            await channel.send({
                content:
                    "🛡️ Um mediador/ADM deverá acompanhar esta partida e liberar a sala.",
            });
        }
    } catch (error) {
        console.error(
            "❌ Erro enviando PIX:",
            error.message
        );
    }
}

/*
 * ============================================================
 * SALA
 * ============================================================
 */

function roomEmbed(
    guild,
    bet,
    minutes
) {
    const config =
        getGuildConfig(
            guild.id
        );

    return new EmbedBuilder()
        .setColor(
            safeColor(
                config.embedColor
            )
        )
        .setTitle(
            "🎮 SALA DA PARTIDA"
        )
        .setDescription(
            `A sala será liberada em aproximadamente **${minutes} minutos**.`
        )
        .addFields(
            {
                name: "🆔 ID da Sala",
                value:
                    bet.roomId
                        ? `\`${bet.roomId}\``
                        : "Aguardando...",
                inline: true,
            },
            {
                name: "🔐 Senha",
                value:
                    bet.roomPassword
                        ? `\`${bet.roomPassword}\``
                        : "Aguardando...",
                inline: true,
            },
            {
                name: "🎯 Formato",
                value:
                    `**${bet.format}**`,
                inline: true,
            },
            {
                name: "🎮 Modalidade",
                value:
                    `**${bet.modality}**`,
                inline: true,
            }
        )
        .setFooter({
            text:
                "Não compartilhe os dados da sala fora desta partida.",
        })
        .setTimestamp();
}

async function sendRoomWaiting(
    guild,
    bet,
    minutes = 4
) {
    try {
        const channel =
            await guild.channels.fetch(
                bet.channelId
            );

        if (
            !channel ||
            !channel.isTextBased()
        ) {
            return;
        }

        bet.status =
            "aguardando_sala";

        saveDB();

        await updateBetMessage(
            guild,
            bet
        );

        await channel.send({
            embeds: [
                roomEmbed(
                    guild,
                    bet,
                    minutes
                ),
            ],
        });
    } catch (error) {
        console.error(
            "❌ Erro enviando espera da sala:",
            error.message
        );
    }
}

/*
 * ============================================================
 * TIMER DA SALA
 * ============================================================
 */

const roomTimers =
    new Map();

function startRoomTimer(
    guild,
    bet
) {
    if (
        roomTimers.has(
            bet.id
        )
    ) {
        return;
    }

    const minutes =
        Math.floor(
            Math.random() * 3
        ) + 3;

    sendRoomWaiting(
        guild,
        bet,
        minutes
    );

    const timeout =
        setTimeout(
            async () => {
                roomTimers.delete(
                    bet.id
                );

                if (
                    bet.status ===
                        "cancelada" ||
                    bet.status ===
                        "finalizada"
                ) {
                    return;
                }

                bet.status =
                    "aguardando_sala";

                saveDB();

                try {
                    const channel =
                        await guild.channels.fetch(
                            bet.channelId
                        );

                    if (
                        channel &&
                        channel.isTextBased()
                    ) {
                        await channel.send(
                            "🎮 **A sala está pronta!** O mediador deve enviar o ID e a senha da sala."
                        );
                    }
                } catch {}
            },
            minutes *
                60 *
                1000
        );

    roomTimers.set(
        bet.id,
        timeout
    );
}

/*
 * ============================================================
 * ENVIAR DADOS DA SALA
 * ============================================================
 */

async function sendRoomData(
    guild,
    bet
) {
    try {
        const channel =
            await guild.channels.fetch(
                bet.channelId
            );

        if (
            !channel ||
            !channel.isTextBased()
        ) {
            return;
        }

        bet.status =
            "em_partida";

        saveDB();

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(
                        safeColor(
                            getGuildConfig(
                                guild.id
                            ).embedColor
                        )
                    )
                    .setTitle(
                        "🎮 DADOS DA SALA"
                    )
                    .setDescription(
                        "A partida está liberada!"
                    )
                    .addFields(
                        {
                            name:
                                "🆔 ID DA SALA",
                            value:
                                bet.roomId
                                    ? `\`${bet.roomId}\``
                                    : "Não informado",
                            inline: false,
                        },
                        {
                            name:
                                "🔐 SENHA DA SALA",
                            value:
                                bet.roomPassword
                                    ? `\`${bet.roomPassword}\``
                                    : "Não informada",
                            inline: false,
                        }
                    )
                    .setFooter({
                        text:
                            "Boa partida! 🎯",
                    })
                    .setTimestamp(),
            ],
        });

        await updateBetMessage(
            guild,
            bet
        );
    } catch (error) {
        console.error(
            "❌ Erro enviando sala:",
            error.message
        );
    }
}

/*
 * ============================================================
 * PARSE ID E SENHA
 * ============================================================
 */

function parseRoomData(
    text
) {
    const value =
        String(text || "")
            .trim();

    let roomId = null;
    let roomPassword = null;

    const idMatch =
        value.match(
            /(?:id|sala|room)\s*[:#-]?\s*(\d{3,})/i
        );

    const passwordMatch =
        value.match(
            /(?:senha|password|pass)\s*[:#-]?\s*([A-Za-z0-9_-]{2,})/i
        );

    if (idMatch) {
        roomId =
            idMatch[1];
    }

    if (passwordMatch) {
        roomPassword =
            passwordMatch[1];
    }

    /*
     * Também aceita:
     * 123456 1234
     */

    if (
        !roomId &&
        !roomPassword
    ) {
        const numbers =
            value.match(
                /\b\d{3,}\b/g
            );

        if (
            numbers &&
            numbers.length >= 2
        ) {
            roomId =
                numbers[0];

            roomPassword =
                numbers[1];
        }
    }

    return {
        roomId,
        roomPassword,
    };
}

/*
 * ============================================================
 * MODAL PARA SALA
 * ============================================================
 */

function roomModal(
    betId
) {
    const modal =
        new ModalBuilder()
            .setCustomId(
                `room_modal:${betId}`
            )
            .setTitle(
                "🎮 Dados da Sala"
            );

    const roomId =
        new TextInputBuilder()
            .setCustomId(
                "room_id"
            )
            .setLabel(
                "ID da Sala"
            )
            .setPlaceholder(
                "Ex: 123456789"
            )
            .setRequired(true)
            .setStyle(
                TextInputStyle.Short
            );

    const password =
        new TextInputBuilder()
            .setCustomId(
                "room_password"
            )
            .setLabel(
                "Senha da Sala"
            )
            .setPlaceholder(
                "Ex: 1234"
            )
            .setRequired(true)
            .setStyle(
                TextInputStyle.Short
            );

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            roomId
        ),
        new ActionRowBuilder().addComponents(
            password
        )
    );

    return modal;
}

/*
 * ============================================================
 * PAINEL DO MEDIADOR
 * ============================================================
 */

function mediatorPanel(
    bet
) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `med_room:${bet.id}`
                )
                .setLabel(
                    "Enviar Sala"
                )
                .setEmoji("🎮")
                .setStyle(
                    ButtonStyle.Primary
                ),

            new ButtonBuilder()
                .setCustomId(
                    `med_result:${bet.id}`
                )
                .setLabel(
                    "Resultado"
                )
                .setEmoji("🏆")
                .setStyle(
                    ButtonStyle.Success
                ),

            new ButtonBuilder()
                .setCustomId(
                    `med_wo:${bet.id}`
                )
                .setLabel(
                    "W.O."
                )
                .setEmoji("⚠️")
                .setStyle(
                    ButtonStyle.Danger
                )
        ),
    ];
}

async function sendMediatorPanel(
    guild,
    bet
) {
    try {
        const channel =
            await guild.channels.fetch(
                bet.channelId
            );

        if (
            !channel ||
            !channel.isTextBased()
        ) {
            return;
        }

        await channel.send({
            content:
                bet.mediatorId
                    ? `🛡️ <@${bet.mediatorId}>`
                    : "🛡️ **Mediador/ADM**, gerencie a partida abaixo.",

            embeds: [
                new EmbedBuilder()
                    .setColor(
                        safeColor(
                            getGuildConfig(
                                guild.id
                            ).embedColor
                        )
                    )
                    .setTitle(
                        "🛡️ PAINEL DO MEDIADOR"
                    )
                    .setDescription(
                        "Use os botões abaixo para controlar a partida."
                    )
                    .addFields(
                        {
                            name:
                                "🎯 Partida",
                            value:
                                `\`${bet.id}\``,
                            inline: true,
                        },
                        {
                            name:
                                "👥 Jogadores",
                            value:
                                bet.players
                                    .map(
                                        (id) =>
                                            `<@${id}>`
                                    )
                                    .join(
                                        "\n"
                                    ),
                            inline: true,
                        },
                        {
                            name:
                                "💰 Valor",
                            value:
                                `R$ ${money(
                                    bet.value
                                )}`,
                            inline: true,
                        }
                    ),
            ],

            components:
                mediatorPanel(
                    bet
                ),
        });
    } catch (error) {
        console.error(
            "❌ Erro enviando painel do mediador:",
            error.message
        );
    }
}

/*
 * ============================================================
 * RESULTADO
 * ============================================================
 */

function resultSelect(
    bet
) {
    const options =
        bet.players.map(
            (userId) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        `Vitória de ${userId}`
                    )
                    .setValue(
                        userId
                    )
                    .setDescription(
                        "Registrar este jogador como vencedor"
                    )
        );

    return [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(
                    `result_select:${bet.id}`
                )
                .setPlaceholder(
                    "🏆 Selecione o vencedor"
                )
                .addOptions(
                    options
                )
        ),
    ];
}

function woSelect(
    bet
) {
    const options =
        bet.players.map(
            (userId) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        `W.O. contra ${userId}`
                    )
                    .setValue(
                        userId
                    )
                    .setDescription(
                        "Registrar este jogador como W.O."
                    )
        );

    return [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(
                    `wo_select:${bet.id}`
                )
                .setPlaceholder(
                    "⚠️ Selecione o jogador"
                )
                .addOptions(
                    options
                )
        ),
    ];
}

/*
 * ============================================================
 * FINALIZAR RESULTADO NORMAL
 * ============================================================
 */

async function finalizeResult(
    guild,
    bet,
    winnerId
) {
    if (
        bet.status ===
            "finalizada" ||
        bet.status ===
            "cancelada"
    ) {
        return false;
    }

    if (
        !bet.players.includes(
            winnerId
        )
    ) {
        return false;
    }

    const loserId =
        bet.players.find(
            (id) =>
                id !== winnerId
        );

    if (!loserId) {
        return false;
    }

    bet.winnerId =
        winnerId;

    bet.loserId =
        loserId;

    bet.status =
        "finalizada";

    const winner =
        getUserStats(
            guild.id,
            winnerId
        );

    const loser =
        getUserStats(
            guild.id,
            loserId
        );

    winner.wins += 1;
    loser.losses += 1;

    const total =
        Number(bet.value) *
        bet.players.length;

    const fee =
        Number(
            getGuildConfig(
                guild.id
            ).fee || 0
        );

    const prize =
        total -
        total * (fee / 100);

    winner.coins +=
        Number(prize);

    saveDB();

    await updateBetMessage(
        guild,
        bet
    );

    try {
        const channel =
            await guild.channels.fetch(
                bet.channelId
            );

        if (
            channel &&
            channel.isTextBased()
        ) {
            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            safeColor(
                                getGuildConfig(
                                    guild.id
                                ).embedColor
                            )
                        )
                        .setTitle(
                            "🏆 RESULTADO DA PARTIDA"
                        )
                        .setDescription(
                            `**<@${winnerId}> venceu a partida!**`
                        )
                        .addFields(
                            {
                                name:
                                    "🥇 Vencedor",
                                value:
                                    `<@${winnerId}>`,
                                inline: true,
                            },
                            {
                                name:
                                    "❌ Derrotado",
                                value:
                                    `<@${loserId}>`,
                                inline: true,
                            },
                            {
                                name:
                                    "💰 Prêmio",
                                value:
                                    `R$ ${money(
                                        prize
                                    )}`,
                                inline: true,
                            }
                        )
                        .setFooter({
                            text:
                                "Resultado registrado com sucesso.",
                        })
                        .setTimestamp(),
                ],
            });
        }
    } catch {}

    return true;
}

/*
 * ============================================================
 * FINALIZAR W.O.
 * ============================================================
 */

async function finalizeWO(
    guild,
    bet,
    loserId
) {
    if (
        bet.status ===
            "finalizada" ||
        bet.status ===
            "cancelada"
    ) {
        return false;
    }

    if (
        !bet.players.includes(
            loserId
        )
    ) {
        return false;
    }

    const winnerId =
        bet.players.find(
            (id) =>
                id !== loserId
        );

    if (!winnerId) {
        return false;
    }

    bet.winnerId =
        winnerId;

    bet.loserId =
        loserId;

    bet.status =
        "finalizada";

    const winner =
        getUserStats(
            guild.id,
            winnerId
        );

    const loser =
        getUserStats(
            guild.id,
            loserId
        );

    winner.wins += 1;
    loser.wo += 1;

    const total =
        Number(bet.value) *
        bet.players.length;

    const fee =
        Number(
            getGuildConfig(
                guild.id
            ).fee || 0
        );

    const prize =
        total -
        total * (fee / 100);

    winner.coins +=
        Number(prize);

    saveDB();

    await updateBetMessage(
        guild,
        bet
    );

    try {
        const channel =
            await guild.channels.fetch(
                bet.channelId
            );

        if (
            channel &&
            channel.isTextBased()
        ) {
            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor(
                            safeColor(
                                getGuildConfig(
                                    guild.id
                                ).embedColor
                            )
                        )
                        .setTitle(
                            "⚠️ RESULTADO POR W.O."
                        )
                        .setDescription(
                            `**<@${winnerId}> venceu por W.O.!**`
                        )
                        .addFields(
                            {
                                name:
                                    "🏆 Vencedor",
                                value:
                                    `<@${winnerId}>`,
                                inline: true,
                            },
                            {
                                name:
                                    "⚠️ W.O.",
                                value:
                                    `<@${loserId}>`,
                                inline: true,
                            },
                            {
                                name:
                                    "💰 Prêmio",
                                value:
                                    `R$ ${money(
                                        prize
                                    )}`,
                                inline: true,
                            }
                        )
                        .setFooter({
                            text:
                                "W.O. registrado pelo mediador.",
                        })
                        .setTimestamp(),
                ],
            });
        }
    } catch {}

    return true;
}

/*
 * ============================================================
 * INICIAR FILA
 * ============================================================
 */

async function tryStartQueue(
    guild,
    queue
) {
    if (
        queue.busy ||
        queue.players.length <
            QUEUE_CAPACITY
    ) {
        return;
    }

    /*
     * 1x1 precisa ter o mesmo gelo.
     */

    if (queue.format === "1x1") {
        const gelo1 =
            queue.gelo[
                queue.players[0]
            ];

        const gelo2 =
            queue.gelo[
                queue.players[1]
            ];

        if (
            gelo1 !== gelo2
        ) {
            return;
        }
    }

    /*
     * Emulador precisa de mediador.
     */

    if (
        queue.modality ===
        "Emulador"
    ) {
        const mediator =
            findAvailableMediator(
                guild
            );

        if (!mediator) {
            await updateQueueMessage(
                guild,
                queue
            );

            return;
        }

        /*
         * Voltamos o índice um passo
         * porque createBetFromQueue()
         * fará a seleção novamente.
         */

        const guildData =
            getGuildRecord(
                guild.id
            );

        if (
            guildData.mediatorIndex >
            0
        ) {
            guildData.mediatorIndex -=
                1;
        } else if (
            guildData.mediatorQueue
                .length
        ) {
            guildData.mediatorIndex =
                guildData
                    .mediatorQueue
                    .length - 1;
        }

        saveDB();
    }

    const bet =
        await createBetFromQueue(
            guild,
            queue
        );

    if (!bet) {
        return;
    }

    /*
     * Para Mobile/Misto, o mediador
     * pode ser escolhido depois.
     *
     * Para Emulador, já existe mediador.
     */

    if (
        bet.modality ===
        "Emulador"
    ) {
        await sendMediatorPanel(
            guild,
            bet
        );
    }
}

/*
 * ============================================================
 * ESTATÍSTICAS
 * ============================================================
 */

function statsEmbed(
    guild,
    member
) {
    const stats =
        getUserStats(
            guild.id,
            member.id
        );

    const total =
        stats.wins +
        stats.losses;

    const winRate =
        total > 0
            ? (
                  (stats.wins /
                      total) *
                  100
              ).toFixed(1)
            : "0.0";

    return new EmbedBuilder()
        .setColor(
            safeColor(
                getGuildConfig(
                    guild.id
                ).embedColor
            )
        )
        .setTitle(
            `📊 PERFIL DE ${member.user.username}`
        )
        .setThumbnail(
            member.displayAvatarURL({
                dynamic: true,
                size: 256,
            })
        )
        .addFields(
            {
                name: "🏆 Vitórias",
                value:
                    `**${stats.wins}**`,
                inline: true,
            },
            {
                name: "❌ Derrotas",
                value:
                    `**${stats.losses}**`,
                inline: true,
            },
            {
                name: "📈 Win Rate",
                value:
                    `**${winRate}%**`,
                inline: true,
            },
            {
                name: "⚠️ W.O.",
                value:
                    `**${stats.wo}**`,
                inline: true,
            },
            {
                name: "🪙 Coins",
                value:
                    `**R$ ${money(
                        stats.coins
                    )}**`,
                inline: true,
            },
            {
                name: "🎯 Partidas",
                value:
                    `**${total}**`,
                inline: true,
            }
        )
        .setFooter({
            text:
                "Estatísticas do jogador",
        })
        .setTimestamp();
}

async function showStats(
    interaction,
    targetMember
) {
    const member =
        targetMember ||
        interaction.member;

    return interaction.reply({
        embeds: [
            statsEmbed(
                interaction.guild,
                member
            ),
        ],
        ephemeral:
            interaction.isChatInputCommand()
                ? false
                : true,
    });
}

/*
 * ============================================================
 * COMANDO /P
 * ============================================================
 */

async function handleProfileCommand(
    interaction
) {
    let member =
        interaction.member;

    if (
        interaction.isChatInputCommand()
    ) {
        const target =
            interaction.options.getUser(
                "usuario"
            );

        if (target) {
            try {
                member =
                    await interaction.guild.members.fetch(
                        target.id
                    );
            } catch {}
        }
    }

    return showStats(
        interaction,
        member
    );
} /*
  * ============================================================
  * EMBED DE CONFIGURAÇÃO
  * ============================================================
  */

function configEmbed(guild) {
    const config = getGuildConfig(guild.id);

    const role = (id) => id ? `<@&${id}>` : "Não configurado";
    const channel = (id) => id ? `<#${id}>` : "Não configurado";

    return new EmbedBuilder()
        .setColor(safeColor(config.embedColor))
        .setTitle("⚙️ CONFIGURAÇÃO DO BOT")
        .setDescription(
            "Configure cargos, canais, PIX, taxa e aparência do sistema."
        )
        .addFields(
            {
                name: "🛡️ Cargos",
                value:
                    `**Administrador:** ${role(config.adminRoleId)}\n` +
                    `**Mediador:** ${role(config.mediatorRoleId)}\n` +
                    `**Analista:** ${role(config.analystRoleId)}`,
                inline: false,
            },
            {
                name: "📢 Canais",
                value:
                    `**Mobile:** ${channel(config.mobileChannelId)}\n` +
                    `**Emulador:** ${channel(config.emulatorChannelId)}\n` +
                    `**Mediadores:** ${channel(config.mediatorChannelId)}\n` +
                    `**Categoria das apostas:** ${channel(config.betsCategoryId)}`,
                inline: false,
            },
            {
                name: "💳 PIX",
                value:
                    `**Nome:** ${config.pixName || "Não configurado"}\n` +
                    `**Chave:** ${config.pixKey || "Não configurada"}\n` +
                    `**QR Code:** ${config.pixQrCode ? "Configurado" : "Não configurado"}`,
                inline: false,
            },
            {
                name: "💰 Taxa",
                value: `**${money(config.fee)}%**`,
                inline: true,
            },
            {
                name: "🎨 Cor",
                value: `\`${safeColor(config.embedColor)}\``,
                inline: true,
            }
        )
        .setFooter({
            text: "Somente administradores podem alterar estas configurações.",
        })
        .setTimestamp();
}

/*
 * ============================================================
 * BOTÕES DA CONFIGURAÇÃO
 * ============================================================
 */

function configButtons() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("config_roles")
                .setLabel("Cargos")
                .setEmoji("🛡️")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId("config_channels")
                .setLabel("Canais")
                .setEmoji("📢")
                .setStyle(ButtonStyle.Primary)
        ),

        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("config_pix")
                .setLabel("PIX")
                .setEmoji("💳")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId("config_appearance")
                .setLabel("Aparência")
                .setEmoji("🎨")
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId("config_fee")
                .setLabel("Taxa")
                .setEmoji("💰")
                .setStyle(ButtonStyle.Secondary)
        ),
    ];
}

/*
 * ============================================================
 * MENUS DE CARGOS
 * ============================================================
 */

function roleConfigComponents() {
    return [
        new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId("config_admin_role")
                .setPlaceholder("🛡️ Selecione o cargo de ADM")
                .setMinValues(0)
                .setMaxValues(1)
        ),

        new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId("config_mediator_role")
                .setPlaceholder("🛡️ Selecione o cargo de Mediador")
                .setMinValues(0)
                .setMaxValues(1)
        ),

        new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId("config_analyst_role")
                .setPlaceholder("📊 Selecione o cargo de Analista")
                .setMinValues(0)
                .setMaxValues(1)
        ),

        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("config_back")
                .setLabel("Voltar")
                .setEmoji("↩️")
                .setStyle(ButtonStyle.Secondary)
        ),
    ];
}

/*
 * ============================================================
 * MENUS DE CANAIS
 *
 * IMPORTANTE:
 * Não usamos .setChannelTypes().
 * Assim o menu pode mostrar canais de qualquer tipo.
 * ============================================================
 */

function channelConfigComponents() {
    return [
        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId("config_mobile_channel")
                .setPlaceholder("📱 Selecione o canal Mobile")
                .setMinValues(0)
                .setMaxValues(1)
        ),

        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId("config_emulator_channel")
                .setPlaceholder("💻 Selecione o canal Emulador")
                .setMinValues(0)
                .setMaxValues(1)
        ),

        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId("config_mediator_channel")
                .setPlaceholder("🛡️ Selecione o canal de Mediadores")
                .setMinValues(0)
                .setMaxValues(1)
        ),

        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId("config_bets_category")
                .setPlaceholder("📁 Selecione a categoria das apostas")
                .setMinValues(0)
                .setMaxValues(1)
        ),

        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("config_back")
                .setLabel("Voltar")
                .setEmoji("↩️")
                .setStyle(ButtonStyle.Secondary)
        ),
    ];
}

/*
 * ============================================================
 * MODAL PIX
 * ============================================================
 */

function pixModal() {
    const modal = new ModalBuilder()
        .setCustomId("config_pix_modal")
        .setTitle("💳 Configurar PIX");

    const name = new TextInputBuilder()
        .setCustomId("pix_name")
        .setLabel("Nome do PIX")
        .setPlaceholder("Ex: NM Bet")
        .setRequired(false)
        .setStyle(TextInputStyle.Short);

    const key = new TextInputBuilder()
        .setCustomId("pix_key")
        .setLabel("Chave PIX")
        .setPlaceholder("CPF, telefone, e-mail ou chave aleatória")
        .setRequired(false)
        .setStyle(TextInputStyle.Short);

    const qr = new TextInputBuilder()
        .setCustomId("pix_qr")
        .setLabel("URL da imagem do QR Code")
        .setPlaceholder("https://...")
        .setRequired(false)
        .setStyle(TextInputStyle.Short);

    modal.addComponents(
        new ActionRowBuilder().addComponents(name),
        new ActionRowBuilder().addComponents(key),
        new ActionRowBuilder().addComponents(qr)
    );

    return modal;
}

/*
 * ============================================================
 * MODAL TAXA
 * ============================================================
 */

function feeModal(guildId) {
    const config = getGuildConfig(guildId);

    const modal = new ModalBuilder()
        .setCustomId("config_fee_modal")
        .setTitle("💰 Configurar Taxa");

    const input = new TextInputBuilder()
        .setCustomId("fee")
        .setLabel("Taxa em porcentagem")
        .setPlaceholder("Ex: 10")
        .setValue(String(config.fee || 0))
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

    modal.addComponents(
        new ActionRowBuilder().addComponents(input)
    );

    return modal;
}

/*
 * ============================================================
 * MODAL APARÊNCIA
 * ============================================================
 */

function appearanceModal(guildId) {
    const config = getGuildConfig(guildId);

    const modal = new ModalBuilder()
        .setCustomId("config_appearance_modal")
        .setTitle("🎨 Aparência");

    const color = new TextInputBuilder()
        .setCustomId("embed_color")
        .setLabel("Cor do Embed")
        .setPlaceholder("#5865F2")
        .setValue(config.embedColor || "#5865F2")
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

    const picture = new TextInputBuilder()
        .setCustomId("profile_picture")
        .setLabel("URL da imagem do perfil")
        .setPlaceholder("https://...")
        .setValue(config.profilePicture || "")
        .setRequired(false)
        .setStyle(TextInputStyle.Short);

    modal.addComponents(
        new ActionRowBuilder().addComponents(color),
        new ActionRowBuilder().addComponents(picture)
    );

    return modal;
}

/*
 * ============================================================
 * COMANDO /FILA
 * ============================================================
 */

async function handleFilaCommand(interaction) {
    if (!interaction.guild) {
        return interaction.reply({
            content: "❌ Este comando só pode ser usado em um servidor.",
            ephemeral: true,
        });
    }

    if (!isAdmin(interaction.member, interaction.guild.id)) {
        return interaction.reply({
            content: "❌ Você precisa ser administrador para criar as filas.",
            ephemeral: true,
        });
    }

    const channel = interaction.channel;

    if (!channel || !channel.isTextBased()) {
        return interaction.reply({
            content: "❌ Este canal não pode receber as filas.",
            ephemeral: true,
        });
    }

    await interaction.reply({
        content:
            "⏳ Criando/atualizando todas as filas. Isso pode levar alguns segundos.",
        ephemeral: true,
    });

    await createQueuesMessage(
        interaction.guild,
        channel
    );

    await interaction.editReply({
        content:
            "✅ Todas as filas foram criadas/atualizadas neste canal.",
    });
}

/*
 * ============================================================
 * COMANDO /MED
 * ============================================================
 */

async function handleMedCommand(interaction) {
    if (!interaction.guild) {
        return interaction.reply({
            content: "❌ Este comando só pode ser usado em um servidor.",
            ephemeral: true,
        });
    }

    if (!isMediator(
        interaction.member,
        interaction.guild.id
    )) {
        return interaction.reply({
            content: "❌ Você não possui permissão de mediador.",
            ephemeral: true,
        });
    }

    addMediator(
        interaction.guild,
        interaction.user.id
    );

    await publishMediatorQueue(
        interaction.guild
    );

    return interaction.reply({
        content:
            "🛡️ Você entrou na fila de mediadores.",
        ephemeral: true,
    });
}

/*
 * ============================================================
 * COMANDO /CONFIG
 * ============================================================
 */

async function handleConfigCommand(interaction) {
    if (!interaction.guild) {
        return interaction.reply({
            content: "❌ Este comando só pode ser usado em um servidor.",
            ephemeral: true,
        });
    }

    if (!isAdmin(
        interaction.member,
        interaction.guild.id
    )) {
        return interaction.reply({
            content:
                "❌ Apenas administradores podem abrir a configuração.",
            ephemeral: true,
        });
    }

    await syncGuildChannels(
        interaction.guild
    );

    return interaction.reply({
        embeds: [
            configEmbed(
                interaction.guild
            ),
        ],
        components: configButtons(),
        ephemeral: true,
    });
}

/*
 * ============================================================
 * HANDLER DE BOTÕES
 * ============================================================
 */

async function handleButton(
    interaction
) {
    const id =
        interaction.customId;

    if (id.startsWith("queue_normal:")) {
        const parts = id.split(":");

        const guildId = parts[1];
        const format = parts[2];
        const modality = parts[3];
        const value = Number(parts[4]);

        if (
            interaction.guild.id !==
            guildId
        ) {
            return;
        }

        const queue = getQueue(
            guildId,
            format,
            modality,
            value
        );

        return addPlayerToQueue(
            interaction,
            queue,
            "normal"
        );
    }

    if (id.startsWith("queue_infinito:")) {
        const parts = id.split(":");

        const guildId = parts[1];
        const format = parts[2];
        const modality = parts[3];
        const value = Number(parts[4]);

        if (
            interaction.guild.id !==
            guildId
        ) {
            return;
        }

        const queue = getQueue(
            guildId,
            format,
            modality,
            value
        );

        return addPlayerToQueue(
            interaction,
            queue,
            "infinito"
        );
    }

    if (id.startsWith("queue_join:")) {
        const parts = id.split(":");

        const guildId = parts[1];
        const format = parts[2];
        const modality = parts[3];
        const value = Number(parts[4]);

        if (
            interaction.guild.id !==
            guildId
        ) {
            return;
        }

        const queue = getQueue(
            guildId,
            format,
            modality,
            value
        );

        return addPlayerToQueue(
            interaction,
            queue
        );
    }

    if (id.startsWith("queue_leave:")) {
        const parts = id.split(":");

        const guildId = parts[1];
        const format = parts[2];
        const modality = parts[3];
        const value = Number(parts[4]);

        if (
            interaction.guild.id !==
            guildId
        ) {
            return;
        }

        const queue = getQueue(
            guildId,
            format,
            modality,
            value
        );

        return leaveQueue(
            interaction,
            queue
        );
    }

    /*
     * ========================================================
     * FILA DE MEDIADORES
     * ========================================================
     */

    if (id.startsWith("mediator_join:")) {
        const guildId =
            id.split(":")[1];

        if (
            interaction.guild.id !==
            guildId
        ) {
            return;
        }

        if (!isMediator(
            interaction.member,
            guildId
        )) {
            return interaction.reply({
                content:
                    "❌ Você não possui o cargo de mediador.",
                ephemeral: true,
            });
        }

        addMediator(
            interaction.guild,
            interaction.user.id
        );

        await publishMediatorQueue(
            interaction.guild
        );

        return interaction.reply({
            content:
                "✅ Você entrou na fila de mediadores.",
            ephemeral: true,
        });
    }

    if (id.startsWith("mediator_leave:")) {
        const guildId =
            id.split(":")[1];

        if (
            interaction.guild.id !==
            guildId
        ) {
            return;
        }

        removeMediator(
            interaction.guild,
            interaction.user.id
        );

        await publishMediatorQueue(
            interaction.guild
        );

        return interaction.reply({
            content:
                "🚪 Você saiu da fila de mediadores.",
            ephemeral: true,
        });
    }

    /*
     * ========================================================
     * APOSTA
     * ========================================================
     */

    if (id.startsWith("bet_confirm:")) {
        const betId =
            id.split(":")[1];

        const bet =
            getGuildRecord(
                interaction.guild.id
            ).bets[betId];

        if (!bet) {
            return interaction.reply({
                content:
                    "❌ Partida não encontrada.",
                ephemeral: true,
            });
        }

        return confirmBet(
            interaction,
            bet
        );
    }

    if (id.startsWith("bet_cancel:")) {
        const betId =
            id.split(":")[1];

        const bet =
            getGuildRecord(
                interaction.guild.id
            ).bets[betId];

        if (!bet) {
            return interaction.reply({
                content:
                    "❌ Partida não encontrada.",
                ephemeral: true,
            });
        }

        return cancelBet(
            interaction,
            bet
        );
    }

    /*
     * ========================================================
     * MEDIADOR — ENVIAR SALA
     * ========================================================
     */

    if (id.startsWith("med_room:")) {
        const betId =
            id.split(":")[1];

        const bet =
            getGuildRecord(
                interaction.guild.id
            ).bets[betId];

        if (!bet) {
            return interaction.reply({
                content:
                    "❌ Partida não encontrada.",
                ephemeral: true,
            });
        }

        if (!isMediator(
            interaction.member,
            interaction.guild.id
        )) {
            return interaction.reply({
                content:
                    "❌ Você não pode administrar esta partida.",
                ephemeral: true,
            });
        }

        return interaction.showModal(
            roomModal(bet.id)
        );
    }

    /*
     * ========================================================
     * MEDIADOR — RESULTADO
     * ========================================================
     */

    if (id.startsWith("med_result:")) {
        const betId =
            id.split(":")[1];

        const bet =
            getGuildRecord(
                interaction.guild.id
            ).bets[betId];

        if (!bet) {
            return interaction.reply({
                content:
                    "❌ Partida não encontrada.",
                ephemeral: true,
            });
        }

        if (!isMediator(
            interaction.member,
            interaction.guild.id
        )) {
            return interaction.reply({
                content:
                    "❌ Você não pode administrar esta partida.",
                ephemeral: true,
            });
        }

        return interaction.reply({
            content:
                "🏆 Selecione o jogador vencedor:",
            components:
                resultSelect(bet),
            ephemeral: true,
        });
    }

    /*
     * ========================================================
     * MEDIADOR — W.O.
     * ========================================================
     */

    if (id.startsWith("med_wo:")) {
        const betId =
            id.split(":")[1];

        const bet =
            getGuildRecord(
                interaction.guild.id
            ).bets[betId];

        if (!bet) {
            return interaction.reply({
                content:
                    "❌ Partida não encontrada.",
                ephemeral: true,
            });
        }

        if (!isMediator(
            interaction.member,
            interaction.guild.id
        )) {
            return interaction.reply({
                content:
                    "❌ Você não pode administrar esta partida.",
                ephemeral: true,
            });
        }

        return interaction.reply({
            content:
                "⚠️ Selecione o jogador que perdeu por W.O.:",
            components:
                woSelect(bet),
            ephemeral: true,
        });
    }

    /*
     * ========================================================
     * CONFIGURAÇÃO
     * ========================================================
     */

    if (id === "config_roles") {
        if (!isAdmin(
            interaction.member,
            interaction.guild.id
        )) {
            return interaction.reply({
                content:
                    "❌ Apenas administradores.",
                ephemeral: true,
            });
        }

        return interaction.update({
            content:
                "🛡️ **Configuração de Cargos**",
            embeds: [],
            components:
                roleConfigComponents(),
        });
    }

    if (id === "config_channels") {
        if (!isAdmin(
            interaction.member,
            interaction.guild.id
        )) {
            return interaction.reply({
                content:
                    "❌ Apenas administradores.",
                ephemeral: true,
            });
        }

        await syncGuildChannels(
            interaction.guild
        );

        return interaction.update({
            content:
                "📢 **Configuração de Canais**\n\n" +
                "Os menus abaixo aceitam canais independentemente do tipo. " +
                "Para a categoria das apostas, selecione obrigatoriamente uma categoria.",
            embeds: [],
            components:
                channelConfigComponents(),
        });
    }

    if (id === "config_pix") {
        return interaction.showModal(
            pixModal()
        );
    }

    if (id === "config_fee") {
        return interaction.showModal(
            feeModal(
                interaction.guild.id
            )
        );
    }

    if (id === "config_appearance") {
        return interaction.showModal(
            appearanceModal(
                interaction.guild.id
            )
        );
    }

    if (id === "config_back") {
        return interaction.update({
            content: "",
            embeds: [
                configEmbed(
                    interaction.guild
                ),
            ],
            components:
                configButtons(),
        });
    }
}

/*
 * ============================================================
 * HANDLER DE SELECT MENUS
 * ============================================================
 */

async function handleSelectMenu(
    interaction
) {
    const id =
        interaction.customId;

    /*
     * ========================================================
     * RESULTADO
     * ========================================================
     */

    if (id.startsWith("result_select:")) {
        const betId =
            id.split(":")[1];

        const winnerId =
            interaction.values[0];

        const bet =
            getGuildRecord(
                interaction.guild.id
            ).bets[betId];

        if (!bet) {
            return interaction.update({
                content:
                    "❌ Partida não encontrada.",
                components: [],
            });
        }

        if (!isMediator(
            interaction.member,
            interaction.guild.id
        )) {
            return interaction.update({
                content:
                    "❌ Você não possui permissão.",
                components: [],
            });
        }

        const success =
            await finalizeResult(
                interaction.guild,
                bet,
                winnerId
            );

        return interaction.update({
            content:
                success
                    ? "🏆 Resultado registrado com sucesso."
                    : "❌ Não foi possível registrar o resultado.",
            components: [],
        });
    }

    /*
     * ========================================================
     * W.O.
     * ========================================================
     */

    if (id.startsWith("wo_select:")) {
        const betId =
            id.split(":")[1];

        const loserId =
            interaction.values[0];

        const bet =
            getGuildRecord(
                interaction.guild.id
            ).bets[betId];

        if (!bet) {
            return interaction.update({
                content:
                    "❌ Partida não encontrada.",
                components: [],
            });
        }

        if (!isMediator(
            interaction.member,
            interaction.guild.id
        )) {
            return interaction.update({
                content:
                    "❌ Você não possui permissão.",
                components: [],
            });
        }

        const success =
            await finalizeWO(
                interaction.guild,
                bet,
                loserId
            );

        return interaction.update({
            content:
                success
                    ? "⚠️ W.O. registrado com sucesso."
                    : "❌ Não foi possível registrar o W.O.",
            components: [],
        });
    }

    /*
     * ========================================================
     * CONFIGURAÇÃO — CARGOS
     * ========================================================
     */

    if (id === "config_admin_role") {
        const guildData =
            getGuildRecord(
                interaction.guild.id
            );

        guildData.config.adminRoleId =
            interaction.values[0] ||
            null;

        saveDB();

        return interaction.reply({
            content:
                "✅ Cargo de administrador atualizado.",
            ephemeral: true,
        });
    }

    if (id === "config_mediator_role") {
        const guildData =
            getGuildRecord(
                interaction.guild.id
            );

        guildData.config.mediatorRoleId =
            interaction.values[0] ||
            null;

        saveDB();

        await publishMediatorQueue(
            interaction.guild
        );

        return interaction.reply({
            content:
                "✅ Cargo de mediador atualizado.",
            ephemeral: true,
        });
    }

    if (id === "config_analyst_role") {
        const guildData =
            getGuildRecord(
                interaction.guild.id
            );

        guildData.config.analystRoleId =
            interaction.values[0] ||
            null;

        saveDB();

        return interaction.reply({
            content:
                "✅ Cargo de analista atualizado.",
            ephemeral: true,
        });
    }

    /*
     * ========================================================
     * CONFIGURAÇÃO — CANAIS
     * ========================================================
     */

    if (
        id ===
        "config_mobile_channel"
    ) {
        const guildData =
            getGuildRecord(
                interaction.guild.id
            );

        guildData.config.mobileChannelId =
            interaction.values[0] ||
            null;

        saveDB();

        return interaction.reply({
            content:
                "✅ Canal Mobile atualizado.",
            ephemeral: true,
        });
    }

    if (
        id ===
        "config_emulator_channel"
    ) {
        const guildData =
            getGuildRecord(
                interaction.guild.id
            );

        guildData.config.emulatorChannelId =
            interaction.values[0] ||
            null;

        saveDB();

        return interaction.reply({
            content:
                "✅ Canal Emulador atualizado.",
            ephemeral: true,
        });
    }

    if (
        id ===
        "config_mediator_channel"
    ) {
        const guildData =
            getGuildRecord(
                interaction.guild.id
            );

        guildData.config.mediatorChannelId =
            interaction.values[0] ||
            null;

        saveDB();

        await publishMediatorQueue(
            interaction.guild
        );

        return interaction.reply({
            content:
                "✅ Canal de mediadores atualizado.",
            ephemeral: true,
        });
    }

    if (
        id ===
        "config_bets_category"
    ) {
        const channelId =
            interaction.values[0];

        const channel =
            interaction.guild.channels.cache.get(
                channelId
            );

        /*
         * Aqui existe uma exceção:
         * a categoria de apostas PRECISA
         * ser uma categoria para o Discord
         * conseguir colocar os canais dentro dela.
         */

        if (
            !channel ||
            channel.type !==
                ChannelType.GuildCategory
        ) {
            return interaction.reply({
                content:
                    "❌ O canal selecionado não é uma categoria. Escolha uma **categoria** para as apostas.",
                ephemeral: true,
            });
        }

        const guildData =
            getGuildRecord(
                interaction.guild.id
            );

        guildData.config.betsCategoryId =
            channelId;

        saveDB();

        return interaction.reply({
            content:
                "✅ Categoria das apostas atualizada.",
            ephemeral: true,
        });
    }
}

/*
 * ============================================================
 * HANDLER DE MODAIS
 * ============================================================
 */

async function handleModal(
    interaction
) {
    const id =
        interaction.customId;

    /*
     * ========================================================
     * DADOS DA SALA
     * ========================================================
     */

    if (
        id.startsWith(
            "room_modal:"
        )
    ) {
        const betId =
            id.split(":")[1];

        const bet =
            getGuildRecord(
                interaction.guild.id
            ).bets[betId];

        if (!bet) {
            return interaction.reply({
                content:
                    "❌ Partida não encontrada.",
                ephemeral: true,
            });
        }

        if (!isMediator(
            interaction.member,
            interaction.guild.id
        )) {
            return interaction.reply({
                content:
                    "❌ Você não possui permissão para enviar a sala.",
                ephemeral: true,
            });
        }

        const roomId =
            interaction.fields.getTextInputValue(
                "room_id"
            );

        const password =
            interaction.fields.getTextInputValue(
                "room_password"
            );

        bet.roomId =
            roomId.trim();

        bet.roomPassword =
            password.trim();

        bet.status =
            "em_partida";

        saveDB();

        await interaction.reply({
            content:
                "✅ Dados da sala registrados e enviados aos jogadores.",
            ephemeral: true,
        });

        await sendRoomData(
            interaction.guild,
            bet
        );

        return;
    }

    /*
     * ========================================================
     * PIX
     * ========================================================
     */

    if (
        id ===
        "config_pix_modal"
    ) {
        if (!isAdmin(
            interaction.member,
            interaction.guild.id
        )) {
            return interaction.reply({
                content:
                    "❌ Apenas administradores.",
                ephemeral: true,
            });
        }

        const guildData =
            getGuildRecord(
                interaction.guild.id
            );

        guildData.config.pixName =
            interaction.fields.getTextInputValue(
                "pix_name"
            ).trim();

        guildData.config.pixKey =
            interaction.fields.getTextInputValue(
                "pix_key"
            ).trim();

        guildData.config.pixQrCode =
            interaction.fields.getTextInputValue(
                "pix_qr"
            ).trim();

        saveDB();

        return interaction.reply({
            content:
                "✅ Configurações do PIX salvas.",
            ephemeral: true,
        });
    }

    /*
     * ========================================================
     * TAXA
     * ========================================================
     */

    if (
        id ===
        "config_fee_modal"
    ) {
        if (!isAdmin(
            interaction.member,
            interaction.guild.id
        )) {
            return interaction.reply({
                content:
                    "❌ Apenas administradores.",
                ephemeral: true,
            });
        }

        const value =
            parseMoney(
                interaction.fields.getTextInputValue(
                    "fee"
                )
            );

        if (
            !Number.isFinite(value) ||
            value < 0 ||
            value > 100
        ) {
            return interaction.reply({
                content:
                    "❌ Informe uma taxa entre 0 e 100.",
                ephemeral: true,
            });
        }

        const guildData =
            getGuildRecord(
                interaction.guild.id
            );

        guildData.config.fee =
            value;

        saveDB();

        return interaction.reply({
            content:
                `✅ Taxa definida para **${money(value)}%**.`,
            ephemeral: true,
        });
    }

    /*
     * ========================================================
     * APARÊNCIA
     * ========================================================
     */

    if (
        id ===
        "config_appearance_modal"
    ) {
        if (!isAdmin(
            interaction.member,
            interaction.guild.id
        )) {
            return interaction.reply({
                content:
                    "❌ Apenas administradores.",
                ephemeral: true,
            });
        }

        const color =
            interaction.fields.getTextInputValue(
                "embed_color"
            ).trim();

        const picture =
            interaction.fields.getTextInputValue(
                "profile_picture"
            ).trim();

        if (
            !/^#[0-9A-Fa-f]{6}$/.test(
                color
            )
        ) {
            return interaction.reply({
                content:
                    "❌ A cor precisa estar no formato `#5865F2`.",
                ephemeral: true,
            });
        }

        const guildData =
            getGuildRecord(
                interaction.guild.id
            );

        guildData.config.embedColor =
            color;

        guildData.config.profilePicture =
            picture || null;

        saveDB();

        return interaction.reply({
            content:
                "✅ Aparência atualizada.",
            ephemeral: true,
        });
    }
}

/*
 * ============================================================
 * SLASH COMMANDS
 * ============================================================
 */

function getCommands() {
    return [
        new SlashCommandBuilder()
            .setName("fila")
            .setDescription(
                "Cria ou atualiza todas as filas"
            ),

        new SlashCommandBuilder()
            .setName("config")
            .setDescription(
                "Abre a configuração do bot"
            ),

        new SlashCommandBuilder()
            .setName("med")
            .setDescription(
                "Entra na fila de mediadores"
            ),

        new SlashCommandBuilder()
            .setName("p")
            .setDescription(
                "Mostra o perfil e as estatísticas"
            )
            .addUserOption(
                (option) =>
                    option
                        .setName("usuario")
                        .setDescription(
                            "Usuário que deseja consultar"
                        )
                        .setRequired(false)
            ),
    ].map(
        (command) =>
            command.toJSON()
    );
}

/*
 * ============================================================
 * REGISTRAR COMANDOS
 * ============================================================
 */

async function registerGuildCommands(
    guild
) {
    try {
        await guild.commands.set(
            getCommands()
        );

        console.log(
            `✅ Comandos registrados em: ${guild.name}`
        );
    } catch (error) {
        console.error(
            `❌ Erro registrando comandos em ${guild.name}:`,
            error.message
        );
    }
}

/*
 * ============================================================
 * EVENTO READY
 * ============================================================
 */

client.once(
    Events.ClientReady,
    async (readyClient) => {
        console.log(
            `✅ Bot conectado como ${readyClient.user.tag}`
        );

        console.log(
            `🆔 ID: ${readyClient.user.id}`
        );

        for (
            const guild of readyClient.guilds.cache.values()
        ) {
            await syncGuildChannels(
                guild
            );

            await registerGuildCommands(
                guild
            );

            await publishMediatorQueue(
                guild
            );

            console.log(
                `📁 Servidor: ${guild.name}`
            );

            console.log(
                `📢 Canais encontrados: ${guild.channels.cache.size}`
            );

            for (
                const channel of guild.channels.cache.values()
            ) {
                console.log(
                    `   • ${channel.name} | ${channel.id} | tipo ${channel.type}`
                );
            }
        }

        console.log(
            "🚀 Sistema iniciado com sucesso."
        );
    }
);

/*
 * ============================================================
 * NOVO SERVIDOR
 * ============================================================
 */

client.on(
    Events.GuildCreate,
    async (guild) => {
        getGuildRecord(
            guild.id
        );

        saveDB();

        await syncGuildChannels(
            guild
        );

        await registerGuildCommands(
            guild
        );

        await publishMediatorQueue(
            guild
        );

        console.log(
            `➕ Entrei no servidor: ${guild.name}`
        );
    }
);

/*
 * ============================================================
 * NOVO CANAL
 * ============================================================
 */

client.on(
    Events.ChannelCreate,
    async (channel) => {
        if (!channel.guild) {
            return;
        }

        console.log(
            `📢 Novo canal detectado: ${channel.name} | ${channel.id} | tipo ${channel.type}`
        );
    }
);

/*
 * ============================================================
 * ATUALIZAÇÃO DE PRESENÇA
 * ============================================================
 */

client.on(
    Events.PresenceUpdate,
    async () => {
        for (
            const guild of client.guilds.cache.values()
        ) {
            await publishMediatorQueue(
                guild
            );
        }
    }
);

/*
 * ============================================================
 * INTERACTIONS
 * ============================================================
 */

client.on(
    Events.InteractionCreate,
    async (interaction) => {
        try {
            if (
                interaction.isChatInputCommand()
            ) {
                if (
                    interaction.commandName ===
                    "fila"
                ) {
                    return handleFilaCommand(
                        interaction
                    );
                }

                if (
                    interaction.commandName ===
                    "config"
                ) {
                    return handleConfigCommand(
                        interaction
                    );
                }

                if (
                    interaction.commandName ===
                    "med"
                ) {
                    return handleMedCommand(
                        interaction
                    );
                }

                if (
                    interaction.commandName ===
                    "p"
                ) {
                    return handleProfileCommand(
                        interaction
                    );
                }

                return;
            }

            if (
                interaction.isButton()
            ) {
                return handleButton(
                    interaction
                );
            }

            if (
                interaction.isStringSelectMenu() ||
                interaction.isRoleSelectMenu() ||
                interaction.isChannelSelectMenu()
            ) {
                return handleSelectMenu(
                    interaction
                );
            }

            if (
                interaction.isModalSubmit()
            ) {
                return handleModal(
                    interaction
                );
            }
        } catch (error) {
            console.error(
                "❌ Erro na interação:",
                error
            );

            try {
                if (
                    interaction.replied ||
                    interaction.deferred
                ) {
                    await interaction.followUp({
                        content:
                            "❌ Ocorreu um erro ao processar esta ação.",
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content:
                            "❌ Ocorreu um erro ao processar esta ação.",
                        ephemeral: true,
                    });
                }
            } catch {}
        }
    }
);

/*
 * ============================================================
 * COMANDOS POR MENSAGEM
 * ============================================================
 */

client.on(
    Events.MessageCreate,
    async (message) => {
        if (
            message.author.bot ||
            !message.guild
        ) {
            return;
        }

        const content =
            message.content
                .trim()
                .toLowerCase();

        if (content === ".med") {
            if (
                !isMediator(
                    message.member,
                    message.guild.id
                )
            ) {
                return message.reply(
                    "❌ Você não possui permissão de mediador."
                );
            }

            addMediator(
                message.guild,
                message.author.id
            );

            await publishMediatorQueue(
                message.guild
            );

            return message.reply(
                "🛡️ Você entrou na fila de mediadores."
            );
        }

        if (content === ".p") {
            return message.reply({
                embeds: [
                    statsEmbed(
                        message.guild,
                        message.member
                    ),
                ],
            });
        }
    }
);

/*
 * ============================================================
 * LOGIN
 * ============================================================
 */

client.login(TOKEN).catch(
    (error) => {
        console.error(
            "❌ Não foi possível conectar o bot:",
            error
        );
    }
);
