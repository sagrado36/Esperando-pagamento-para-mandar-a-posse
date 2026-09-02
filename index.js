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
    RoleSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require("discord.js");

// ======================================================
// CONFIGURAÇÃO
// ======================================================

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;

if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN/TOKEN não encontrado no .env");
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.Channel,
        Partials.GuildMember,
        Partials.User
    ]
});

// ======================================================
// BANCO DE DADOS
// ======================================================

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "bot.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function defaultDatabase() {
    return {
        guilds: {}
    };
}

function loadDatabase() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            const db = defaultDatabase();
            fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
            return db;
        }

        const content = fs.readFileSync(DATA_FILE, "utf8");

        if (!content.trim()) {
            return defaultDatabase();
        }

        return JSON.parse(content);
    } catch (error) {
        console.error("❌ Erro ao carregar banco:", error);

        return defaultDatabase();
    }
}

let db = loadDatabase();

function saveDatabase() {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(db, null, 2)
        );
    } catch (error) {
        console.error("❌ Erro ao salvar banco:", error);
    }
}

// ======================================================
// CONFIGURAÇÃO PADRÃO DO SERVIDOR
// ======================================================

function defaultGuildRecord() {
    return {
        config: {
            // Até 20 administradores
            adminIds: [],

            mediatorRoleId: null,
            analystRoleId: null,

            // Canais
            mobileChannelId: null,
            emulatorChannelId: null,

            // Categoria onde as apostas serão criadas
            betsCategoryId: null,

            // Canal definido pelo comando /med
            mediatorQueueChannelId: null,

            // Mensagem da fila de mediadores
            mediatorQueueMessageId: null,

            // Pix
            pixName: "",
            pixKey: "",
            pixQrCode: "",

            // Taxa
            fee: 0,

            // Aparência
            embedColor: "#2B2D31",
            profilePicture: ""
        },

        users: {},

        queues: {},

        mediatorQueue: [],

        bets: {},

        nextBetId: 1
    };
}

function getGuildRecord(guildId) {
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = defaultGuildRecord();
        saveDatabase();
    }

    const record = db.guilds[guildId];

    // Migração/segurança
    if (!record.config) {
        record.config = defaultGuildRecord().config;
    }

    if (!Array.isArray(record.config.adminIds)) {
        record.config.adminIds = [];
    }

    if (!Array.isArray(record.mediatorQueue)) {
        record.mediatorQueue = [];
    }

    if (!record.users) {
        record.users = {};
    }

    if (!record.queues) {
        record.queues = {};
    }

    if (!record.bets) {
        record.bets = {};
    }

    if (!record.nextBetId) {
        record.nextBetId = 1;
    }

    return record;
}

function getGuildConfig(guildId) {
    return getGuildRecord(guildId).config;
}

// ======================================================
// MIGRAÇÃO DE CONFIGURAÇÕES ANTIGAS
// ======================================================

function migrateGuild(guildId) {
    const record = getGuildRecord(guildId);
    const config = record.config;

    let changed = false;

    // Antigo sistema de administrador único
    if (
        config.adminRoleId &&
        !config.adminIds.includes(config.adminRoleId)
    ) {
        // Não usamos cargo como ID de administrador.
        // O cargo continua sendo tratado abaixo caso exista.
    }

    // Migração de nomes antigos de canais
    if (
        !config.mobileChannelId &&
        config.mobileRequestsChannelId
    ) {
        config.mobileChannelId =
            config.mobileRequestsChannelId;

        changed = true;
    }

    if (
        !config.emulatorChannelId &&
        config.emulatorRequestsChannelId
    ) {
        config.emulatorChannelId =
            config.emulatorRequestsChannelId;

        changed = true;
    }

    if (
        !config.mediatorQueueChannelId &&
        config.mediatorQueueChannelId
    ) {
        config.mediatorQueueChannelId =
            config.mediatorQueueChannelId;

        changed = true;
    }

    if (
        !config.pixQrCode &&
        config.pixQrUrl
    ) {
        config.pixQrCode = config.pixQrUrl;
        changed = true;
    }

    if (changed) {
        saveDatabase();
    }

    return record;
}

// ======================================================
// VALORES DAS FILAS
// ======================================================

const QUEUE_VALUES = [
    0.30,
    0.50,
    0.75,
    1.00,
    2.00,
    3.00,
    5.00,
    7.00,
    10.00,
    20.00,
    50.00,
    100.00
];

// Visualmente, as filas deverão ficar:
// R$ 0,30 embaixo
// R$ 100,00 em cima.
//
// Por isso a publicação será feita do maior para o menor.

const FORMATS = [
    "1x1",
    "2x2",
    "3x3",
    "4x4"
];

const MODALITIES = [
    "Mobile",
    "Emulador",
    "Misto"
];

// REGRA DEFINITIVA:
// TODA FILA POSSUI SOMENTE 2 JOGADORES.

const QUEUE_CAPACITY = 2;

// ======================================================
// FUNÇÕES DE FORMATAÇÃO
// ======================================================

function formatMoney(value) {
    return Number(value)
        .toFixed(2)
        .replace(".", ",");
}

function money(value) {
    return `R$ ${formatMoney(value)}`;
}

function formatDate(date = new Date()) {
    return `<t:${Math.floor(date.getTime() / 1000)}:f>`;
}

function safeColor(color) {
    if (!color) return "#2B2D31";

    if (/^#[0-9A-F]{6}$/i.test(color)) {
        return color;
    }

    return "#2B2D31";
}

// ======================================================
// ESTATÍSTICAS DOS USUÁRIOS
// ======================================================

function getUserStats(guildId, userId) {
    const record = getGuildRecord(guildId);

    if (!record.users[userId]) {
        record.users[userId] = {
            wins: 0,
            losses: 0,
            wo: 0,
            coins: 0,
            games: 0
        };

        saveDatabase();
    }

    return record.users[userId];
}

function addCoins(guildId, userId, amount) {
    const stats = getUserStats(guildId, userId);

    stats.coins += Number(amount) || 0;

    saveDatabase();
}

function removeCoins(guildId, userId, amount) {
    const stats = getUserStats(guildId, userId);

    stats.coins -= Number(amount) || 0;

    if (stats.coins < 0) {
        stats.coins = 0;
    }

    saveDatabase();
}

function addWin(guildId, userId) {
    const stats = getUserStats(guildId, userId);

    stats.wins++;
    stats.games++;

    saveDatabase();
}

function addLoss(guildId, userId) {
    const stats = getUserStats(guildId, userId);

    stats.losses++;
    stats.games++;

    saveDatabase();
}

function addWO(guildId, userId) {
    const stats = getUserStats(guildId, userId);

    stats.wo++;
    stats.games++;

    saveDatabase();
}

// ======================================================
// PERMISSÕES
// ======================================================

function isAdmin(member) {
    if (!member) return false;

    if (
        member.permissions &&
        member.permissions.has(
            PermissionFlagsBits.Administrator
        )
    ) {
        return true;
    }

    const guildId = member.guild.id;
    const config = getGuildConfig(guildId);

    // Até 20 administradores cadastrados
    if (
        Array.isArray(config.adminIds) &&
        config.adminIds.includes(member.id)
    ) {
        return true;
    }

    return false;
}

function isMediator(member) {
    if (!member) return false;

    // ADM também pode atuar como mediador
    if (isAdmin(member)) {
        return true;
    }

    const config = getGuildConfig(member.guild.id);

    if (
        config.mediatorRoleId &&
        member.roles &&
        member.roles.cache.has(config.mediatorRoleId)
    ) {
        return true;
    }

    return false;
}

function isAnalyst(member) {
    if (!member) return false;

    if (isAdmin(member)) {
        return true;
    }

    const config = getGuildConfig(member.guild.id);

    if (
        config.analystRoleId &&
        member.roles &&
        member.roles.cache.has(config.analystRoleId)
    ) {
        return true;
    }

    return false;
}

// ======================================================
// ADMINISTRADORES — LIMITE DE 20
// ======================================================

function addAdmin(guildId, userId) {
    const config = getGuildConfig(guildId);

    if (!Array.isArray(config.adminIds)) {
        config.adminIds = [];
    }

    if (config.adminIds.includes(userId)) {
        return {
            success: false,
            reason: "already"
        };
    }

    if (config.adminIds.length >= 20) {
        return {
            success: false,
            reason: "limit"
        };
    }

    config.adminIds.push(userId);

    saveDatabase();

    return {
        success: true
    };
}

function removeAdmin(guildId, userId) {
    const config = getGuildConfig(guildId);

    if (!Array.isArray(config.adminIds)) {
        config.adminIds = [];
    }

    const index = config.adminIds.indexOf(userId);

    if (index === -1) {
        return false;
    }

    config.adminIds.splice(index, 1);

    saveDatabase();

    return true;
}

// ======================================================
// ADM ONLINE
// ======================================================

function getOnlineAdmins(guild) {
    const config = getGuildConfig(guild.id);

    const admins = [];

    for (const member of guild.members.cache.values()) {
        if (member.user.bot) continue;

        if (!isAdmin(member)) continue;

        const status =
            member.presence?.status || "offline";

        if (status !== "offline") {
            admins.push(member);
        }
    }

    return admins;
}

function hasOnlineAdmin(guild) {
    return getOnlineAdmins(guild).length > 0;
}

// ======================================================
// CANAIS
// ======================================================

async function getAllGuildChannels(guild) {
    try {
        await guild.channels.fetch();
    } catch (error) {
        console.error(
            `❌ Erro ao buscar canais de ${guild.name}:`,
            error
        );
    }

    return [...guild.channels.cache.values()];
}

async function syncGuildChannels(guild) {
    await getAllGuildChannels(guild);
}

// ======================================================
// CHAVE ÚNICA DA FILA
// ======================================================

function queueKey(format, modality, value) {
    return [
        format,
        modality,
        Number(value).toFixed(2)
    ].join(":");
}

// ======================================================
// OBJETO DA FILA
// ======================================================

function createQueueObject(format, modality, value) {
    return {
        id: queueKey(format, modality, value),

        format,
        modality,
        value: Number(value),

        players: [],

        messageId: null,
        channelId: null,

        createdAt: Date.now(),
        updatedAt: Date.now()
    };
}

// ======================================================
// ENCONTRAR FILA
// ======================================================

function getQueue(
    guildId,
    format,
    modality,
    value
) {
    const record = getGuildRecord(guildId);

    const key = queueKey(
        format,
        modality,
        value
    );

    if (!record.queues[key]) {
        record.queues[key] =
            createQueueObject(
                format,
                modality,
                value
            );

        saveDatabase();
    }

    return record.queues[key];
}

// ======================================================
// LIMPAR FILA
// ======================================================

function clearQueue(guildId, queue) {
    const record = getGuildRecord(guildId);

    const key = queue.id;

    if (record.queues[key]) {
        record.queues[key].players = [];
        record.queues[key].messageId = null;
        record.queues[key].channelId = null;
        record.queues[key].updatedAt = Date.now();
    }

    saveDatabase();
}

// ======================================================
// VERIFICAR SE USUÁRIO JÁ ESTÁ EM UMA FILA
// ======================================================

function findPlayerQueue(guildId, userId) {
    const record = getGuildRecord(guildId);

    for (const queue of Object.values(record.queues)) {
        if (
            queue.players &&
            queue.players.some(
                player => player.userId === userId
            )
        ) {
            return queue;
        }
    }

    return null;
}

// ======================================================
// REMOVER USUÁRIO DE TODAS AS FILAS
// ======================================================

function removePlayerFromQueues(
    guildId,
    userId
) {
    const record = getGuildRecord(guildId);

    let removed = false;

    for (const queue of Object.values(record.queues)) {
        if (!Array.isArray(queue.players)) {
            queue.players = [];
        }

        const before = queue.players.length;

        queue.players =
            queue.players.filter(
                player =>
                    player.userId !== userId
            );

        if (
            queue.players.length !== before
        ) {
            queue.updatedAt = Date.now();
            removed = true;
        }
    }

    if (removed) {
        saveDatabase();
    }

    return removed;
}

// ======================================================
// VERIFICAÇÃO DE GELO
// ======================================================

function isOneVsOne(queue) {
    return queue.format === "1x1";
}

function validGelo(gelo) {
    return (
        gelo === "normal" ||
        gelo === "infinito"
    );
}

function geloName(gelo) {
    if (gelo === "normal") {
        return "Gelo Normal";
    }

    if (gelo === "infinito") {
        return "Gelo Infinito";
    }

    return "—";
}

// ======================================================
// STATUS DA FILA
// ======================================================

function queueStatus(queue) {
    if (!queue.players?.length) {
        return "🟢 Aberta";
    }

    if (
        queue.players.length <
        QUEUE_CAPACITY
    ) {
        return "🟡 Aguardando";
    }

    return "🔴 Completa";
}

// ======================================================
// EMBED DA FILA
// ======================================================

function buildQueueEmbed(
    guildId,
    queue
) {
    const config = getGuildConfig(guildId);

    const embed =
        new EmbedBuilder()
            .setColor(
                safeColor(
                    config.embedColor
                )
            )
            .setTitle("🎮 FILA")
            .addFields(
                {
                    name: "📌 Formato",
                    value: queue.format,
                    inline: true
                },
                {
                    name: "📱 Modalidade",
                    value: queue.modality,
                    inline: true
                },
                {
                    name: "💰 Valor",
                    value: money(queue.value),
                    inline: true
                },
                {
                    name: "👥 Jogadores",
                    value:
                        `${queue.players?.length || 0}/${QUEUE_CAPACITY}`,
                    inline: true
                }
            );

    if (
        isOneVsOne(queue) &&
        queue.players?.length
    ) {
        const playersText =
            queue.players
                .map(
                    (player, index) =>
                        `**${index + 1}.** <@${player.userId}>`
                )
                .join("\n");

        embed.addFields({
            name: "👤 Jogadores",
            value: playersText
        });

        const geloTypes =
            queue.players
                .map(
                    player =>
                        geloName(
                            player.gelo
                        )
                )
                .filter(
                    (value, index, array) =>
                        array.indexOf(value) ===
                        index
                )
                .join(" • ");

        if (geloTypes) {
            embed.addFields({
                name: "❄️ Gelo",
                value: geloTypes
            });
        }
    } else if (queue.players?.length) {
        const playersText =
            queue.players
                .map(
                    (player, index) =>
                        `**${index + 1}.** <@${player.userId}>`
                )
                .join("\n");

        embed.addFields({
            name: "👤 Jogadores",
            value: playersText
        });
    }

    return embed;
}// ======================================================
// BOTÕES DAS FILAS
// ======================================================

function buildQueueButtons(queue) {
    const rows = [];

    if (queue.format === "1x1") {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `queue_normal:${queue.id}`
                )
                .setLabel("Gelo Normal")
                .setEmoji("🧊")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(
                    `queue_infinito:${queue.id}`
                )
                .setLabel("Gelo Infinito")
                .setEmoji("♾️")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(
                    `queue_leave:${queue.id}`
                )
                .setLabel("Sair")
                .setEmoji("🚪")
                .setStyle(ButtonStyle.Danger)
        );

        rows.push(row);
    } else {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `queue_join:${queue.id}`
                )
                .setLabel("Entrar")
                .setEmoji("✅")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId(
                    `queue_leave:${queue.id}`
                )
                .setLabel("Sair")
                .setEmoji("🚪")
                .setStyle(ButtonStyle.Danger)
        );

        rows.push(row);
    }

    return rows;
}

// ======================================================
// ATUALIZAR MENSAGEM DA FILA
// ======================================================

async function updateQueueMessage(
    guild,
    queue
) {
    if (!queue.channelId || !queue.messageId) {
        return;
    }

    try {
        const channel =
            await guild.channels.fetch(
                queue.channelId
            );

        if (!channel || !channel.isTextBased()) {
            return;
        }

        const message =
            await channel.messages.fetch(
                queue.messageId
            );

        await message.edit({
            embeds: [
                buildQueueEmbed(
                    guild.id,
                    queue
                )
            ],
            components:
                buildQueueButtons(queue)
        });
    } catch (error) {
        console.error(
            "❌ Erro ao atualizar fila:",
            error
        );
    }
}

// ======================================================
// PUBLICAR UMA FILA
// ======================================================

async function publishQueue(
    guild,
    channel,
    format,
    modality,
    value
) {
    if (!channel) {
        throw new Error(
            "Canal não encontrado."
        );
    }

    if (!channel.isTextBased()) {
        throw new Error(
            "O canal escolhido não permite mensagens."
        );
    }

    const queue =
        getQueue(
            guild.id,
            format,
            modality,
            value
        );

    queue.channelId = channel.id;
    queue.updatedAt = Date.now();

    const embed =
        buildQueueEmbed(
            guild.id,
            queue
        );

    const message =
        await channel.send({
            embeds: [embed],
            components:
                buildQueueButtons(queue)
        });

    queue.messageId = message.id;

    saveDatabase();

    return {
        queue,
        message
    };
}

// ======================================================
// ENTRAR NA FILA
// ======================================================

async function joinQueue(
    interaction,
    queue,
    gelo = null
) {
    const guild =
        interaction.guild;

    if (!guild) {
        return;
    }

    // Precisa existir ADM online
    if (!hasOnlineAdmin(guild)) {
        return interaction.reply({
            content:
                "❌ Não há administrador online.",
            ephemeral: true
        });
    }

    // Verifica se a fila já está cheia
    if (
        queue.players.length >=
        QUEUE_CAPACITY
    ) {
        return interaction.reply({
            content:
                "❌ Esta fila já está cheia.",
            ephemeral: true
        });
    }

    // Verifica se o usuário já está em outra fila
    const existing =
        findPlayerQueue(
            guild.id,
            interaction.user.id
        );

    if (existing) {
        return interaction.reply({
            content:
                "❌ Você já está em uma fila.",
            ephemeral: true
        });
    }

    // 1x1 precisa escolher gelo
    if (
        queue.format === "1x1" &&
        !validGelo(gelo)
    ) {
        return interaction.reply({
            content:
                "❌ Escolha um tipo de gelo.",
            ephemeral: true
        });
    }

    // No 1x1, os dois jogadores precisam
    // estar no mesmo tipo de gelo.
    if (
        queue.format === "1x1" &&
        queue.players.length > 0
    ) {
        const firstPlayer =
            queue.players[0];

        if (
            firstPlayer.gelo !== gelo
        ) {
            return interaction.reply({
                content:
                    `❌ Esta fila está usando **${geloName(firstPlayer.gelo)}**.`,
                ephemeral: true
            });
        }
    }

    queue.players.push({
        userId: interaction.user.id,
        username: interaction.user.username,
        gelo:
            queue.format === "1x1"
                ? gelo
                : null,
        joinedAt: Date.now()
    });

    queue.updatedAt = Date.now();

    saveDatabase();

    await updateQueueMessage(
        guild,
        queue
    );

    await interaction.reply({
        content:
            `✅ Você entrou na fila **${queue.format} • ${queue.modality} • ${money(queue.value)}**.`,
        ephemeral: true
    });

    // Se chegou a 2 jogadores,
    // tenta iniciar a partida.
    if (
        queue.players.length >=
        QUEUE_CAPACITY
    ) {
        await tryStartQueue(
            guild,
            queue
        );
    }
}

// ======================================================
// SAIR DA FILA
// ======================================================

async function leaveQueue(
    interaction,
    queue
) {
    const guild =
        interaction.guild;

    const index =
        queue.players.findIndex(
            player =>
                player.userId ===
                interaction.user.id
        );

    if (index === -1) {
        return interaction.reply({
            content:
                "❌ Você não está nesta fila.",
            ephemeral: true
        });
    }

    queue.players.splice(
        index,
        1
    );

    queue.updatedAt = Date.now();

    saveDatabase();

    await updateQueueMessage(
        guild,
        queue
    );

    await interaction.reply({
        content:
            "✅ Você saiu da fila.",
        ephemeral: true
    });
}

// ======================================================
// FILA DE MEDIADORES
// ======================================================

function mediatorQueueEmbed(
    guild
) {
    const config =
        getGuildConfig(
            guild.id
        );

    const record =
        getGuildRecord(
            guild.id
        );

    const list =
        record.mediatorQueue || [];

    const embed =
        new EmbedBuilder()
            .setColor(
                safeColor(
                    config.embedColor
                )
            )
            .setTitle(
                "👨‍⚖️ FILA DE MEDIADORES"
            );

    if (!list.length) {
        embed.setDescription(
            "Nenhum mediador na fila."
        );
    } else {
        const text =
            list
                .map(
                    (userId, index) =>
                        `**${index + 1}.** <@${userId}>`
                )
                .join("\n");

        embed.setDescription(
            text
        );
    }

    return embed;
}

function mediatorQueueButtons() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    "mediator_join"
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
                    "mediator_leave"
                )
                .setLabel(
                    "Sair da Fila"
                )
                .setEmoji("🚪")
                .setStyle(
                    ButtonStyle.Danger
                )
        )
    ];
}

// ======================================================
// PUBLICAR / ATUALIZAR FILA DE MEDIADORES
// ======================================================

async function publishMediatorQueue(
    guild,
    channel
) {
    const config =
        getGuildConfig(
            guild.id
        );

    if (!channel) {
        throw new Error(
            "Canal não encontrado."
        );
    }

    if (!channel.isTextBased()) {
        throw new Error(
            "Este canal não permite mensagens."
        );
    }

    config.mediatorQueueChannelId =
        channel.id;

    let message = null;

    if (
        config.mediatorQueueMessageId
    ) {
        try {
            message =
                await channel.messages.fetch(
                    config.mediatorQueueMessageId
                );
        } catch {
            message = null;
        }
    }

    const payload = {
        embeds: [
            mediatorQueueEmbed(guild)
        ],
        components:
            mediatorQueueButtons()
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

        config.mediatorQueueMessageId =
            message.id;
    }

    saveDatabase();

    return message;
}

// ======================================================
// ATUALIZAR FILA DE MEDIADORES
// ======================================================

async function updateMediatorQueue(
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

        if (
            !channel ||
            !channel.isTextBased()
        ) {
            return;
        }

        let message = null;

        if (
            config.mediatorQueueMessageId
        ) {
            try {
                message =
                    await channel.messages.fetch(
                        config.mediatorQueueMessageId
                    );
            } catch {
                message = null;
            }
        }

        if (!message) {
            await publishMediatorQueue(
                guild,
                channel
            );

            return;
        }

        await message.edit({
            embeds: [
                mediatorQueueEmbed(
                    guild
                )
            ],
            components:
                mediatorQueueButtons()
        });
    } catch (error) {
        console.error(
            "❌ Erro ao atualizar fila de mediadores:",
            error
        );
    }
}

// ======================================================
// ENTRAR NA FILA DE MEDIADORES
// ======================================================

async function joinMediatorQueue(
    interaction
) {
    const guild =
        interaction.guild;

    if (!isMediator(interaction.member)) {
        return interaction.reply({
            content:
                "❌ Você não é mediador.",
            ephemeral: true
        });
    }

    const record =
        getGuildRecord(
            guild.id
        );

    if (
        record.mediatorQueue.includes(
            interaction.user.id
        )
    ) {
        return interaction.reply({
            content:
                "❌ Você já está na fila.",
            ephemeral: true
        });
    }

    record.mediatorQueue.push(
        interaction.user.id
    );

    saveDatabase();

    await updateMediatorQueue(
        guild
    );

    await interaction.reply({
        content:
            "✅ Você entrou na fila de mediadores.",
        ephemeral: true
    });
}

// ======================================================
// SAIR DA FILA DE MEDIADORES
// ======================================================

async function leaveMediatorQueue(
    interaction
) {
    const guild =
        interaction.guild;

    const record =
        getGuildRecord(
            guild.id
        );

    const index =
        record.mediatorQueue.indexOf(
            interaction.user.id
        );

    if (index === -1) {
        return interaction.reply({
            content:
                "❌ Você não está na fila.",
            ephemeral: true
        });
    }

    record.mediatorQueue.splice(
        index,
        1
    );

    saveDatabase();

    await updateMediatorQueue(
        guild
    );

    await interaction.reply({
        content:
            "✅ Você saiu da fila de mediadores.",
        ephemeral: true
    });
}

// ======================================================
// PEGAR PRÓXIMO MEDIADOR
// ======================================================

function findAvailableMediator(
    guild
) {
    const record =
        getGuildRecord(
            guild.id
        );

    if (
        !record.mediatorQueue.length
    ) {
        return null;
    }

    for (
        let i = 0;
        i < record.mediatorQueue.length;
        i++
    ) {
        const userId =
            record.mediatorQueue[i];

        const member =
            guild.members.cache.get(
                userId
            );

        if (!member) {
            continue;
        }

        if (
            !isMediator(member)
        ) {
            continue;
        }

        const status =
            member.presence?.status ||
            "offline";

        if (status === "offline") {
            continue;
        }

        // Round-robin:
        // remove da frente e coloca no final
        record.mediatorQueue.splice(
            i,
            1
        );

        record.mediatorQueue.push(
            userId
        );

        saveDatabase();

        return member;
    }

    return null;
}

// ======================================================
// CRIAR CANAL PRIVADO DA APOSTA
// ======================================================

async function createBetChannel(
    guild,
    bet
) {
    const config =
        getGuildConfig(
            guild.id
        );

    let parent = null;

    if (
        config.betsCategoryId
    ) {
        const category =
            await guild.channels.fetch(
                config.betsCategoryId
            ).catch(() => null);

        if (
            category &&
            category.type === 4
        ) {
            parent = category.id;
        }
    }

    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [
                PermissionFlagsBits.ViewChannel
            ]
        }
    ];

    for (
        const player of bet.players
    ) {
        overwrites.push({
            id: player.userId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
            ]
        });
    }

    if (bet.mediatorId) {
        overwrites.push({
            id: bet.mediatorId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
            ]
        });
    }

    for (
        const admin of getOnlineAdmins(guild)
    ) {
        overwrites.push({
            id: admin.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
            ]
        });
    }

    const channel =
        await guild.channels.create({
            name:
                `aposta-${bet.id}`,
            type: 0,
            parent,
            permissionOverwrites:
                overwrites
        });

    return channel;
}

// ======================================================
// CRIAR APOSTA A PARTIR DA FILA
// ======================================================

async function createBetFromQueue(
    guild,
    queue
) {
    if (
        queue.players.length !==
        QUEUE_CAPACITY
    ) {
        return null;
    }

    // Segurança para 1x1
    if (queue.format === "1x1") {
        const first =
            queue.players[0]?.gelo;

        const second =
            queue.players[1]?.gelo;

        if (
            !first ||
            !second ||
            first !== second
        ) {
            return null;
        }
    }

    const record =
        getGuildRecord(
            guild.id
        );

    let mediator = null;

    // Emulador usa a fila de mediadores
    if (
        queue.modality === "Emulador"
    ) {
        mediator =
            findAvailableMediator(
                guild
            );

        if (!mediator) {
            return null;
        }
    }

    const betId =
        String(
            record.nextBetId++
        );

    const bet = {
        id: betId,

        guildId: guild.id,

        format: queue.format,
        modality: queue.modality,

        value: Number(
            queue.value
        ),

        gelo:
            queue.format === "1x1"
                ? queue.players[0].gelo
                : null,

        players:
            queue.players.map(
                player => ({
                    userId:
                        player.userId,
                    username:
                        player.username,
                    confirmed: false
                })
            ),

        mediatorId:
            mediator?.id || null,

        channelId: null,

        status:
            "aguardando_pix",

        createdAt:
            Date.now(),

        pixConfirmed: [],

        roomId: null,
        roomPassword: null,

        result: null,

        fee:
            Number(
                getGuildConfig(
                    guild.id
                ).fee || 0
            )
    };

    const channel =
        await createBetChannel(
            guild,
            bet
        );

    bet.channelId =
        channel.id;

    record.bets[bet.id] =
        bet;

    // Limpa a fila
    queue.players = [];
    queue.messageId = null;
    queue.channelId = null;
    queue.updatedAt = Date.now();

    saveDatabase();

    await updateMediatorQueue(
        guild
    );

    return {
        bet,
        channel
    };
}

// ======================================================
// TENTAR INICIAR FILA
// ======================================================

async function tryStartQueue(
    guild,
    queue
) {
    if (
        queue.players.length !==
        QUEUE_CAPACITY
    ) {
        return;
    }

    // Emulador precisa de mediador
    if (
        queue.modality ===
        "Emulador"
    ) {
        const record =
            getGuildRecord(
                guild.id
            );

        const hasMediator =
            record.mediatorQueue.some(
                userId => {
                    const member =
                        guild.members.cache.get(
                            userId
                        );

                    if (!member) {
                        return false;
                    }

                    if (
                        !isMediator(
                            member
                        )
                    ) {
                        return false;
                    }

                    const status =
                        member.presence
                            ?.status ||
                        "offline";

                    return (
                        status !==
                        "offline"
                    );
                }
            );

        if (!hasMediator) {
            return;
        }
    }

    try {
        const result =
            await createBetFromQueue(
                guild,
                queue
            );

        if (!result) {
            return;
        }

        await sendBetEmbed(
            result.channel,
            result.bet
        );

        await sendPix(
            result.channel,
            result.bet
        );
    } catch (error) {
        console.error(
            "❌ Erro ao iniciar partida:",
            error
        );
    }
}

// ======================================================
// EMBED DA APOSTA
// ======================================================

function buildBetEmbed(
    guildId,
    bet
) {
    const config =
        getGuildConfig(
            guildId
        );

    const players =
        bet.players
            .map(
                (player, index) =>
                    `**${index + 1}.** <@${player.userId}>`
            )
            .join("\n");

    const embed =
        new EmbedBuilder()
            .setColor(
                safeColor(
                    config.embedColor
                )
            )
            .setTitle(
                `🎮 APOSTA #${bet.id}`
            )
            .addFields(
                {
                    name: "💰 Valor",
                    value:
                        money(
                            bet.value
                        ),
                    inline: true
                },
                {
                    name: "📌 Formato",
                    value:
                        bet.format,
                    inline: true
                },
                {
                    name: "📱 Modalidade",
                    value:
                        bet.modality,
                    inline: true
                },
                {
                    name: "👥 Jogadores",
                    value:
                        players || "—"
                },
                {
                    name: "📊 Status",
                    value:
                        bet.status
                }
            );

    if (bet.gelo) {
        embed.addFields({
            name: "❄️ Gelo",
            value:
                geloName(
                    bet.gelo
                ),
            inline: true
        });
    }

    if (bet.mediatorId) {
        embed.addFields({
            name: "👨‍⚖️ Mediador",
            value:
                `<@${bet.mediatorId}>`,
            inline: true
        });
    }

    return embed;
}

// ======================================================
// BOTÕES DA APOSTA
// ======================================================

function betButtons(
    bet
) {
    const row =
        new ActionRowBuilder();

    if (
        bet.status ===
        "aguardando_pix"
    ) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `bet_confirm:${bet.id}`
                )
                .setLabel(
                    "Confirmar Pix"
                )
                .setEmoji("💳")
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
        );
    }

    return [row];
}

// ======================================================
// ENVIAR EMBED DA APOSTA
// ======================================================

async function sendBetEmbed(
    channel,
    bet
) {
    await channel.send({
        embeds: [
            buildBetEmbed(
                bet.guildId,
                bet
            )
        ],
        components:
            betButtons(bet)
    });
}// ======================================================
// PIX
// ======================================================

function calculateTotal(bet) {
    return Number(
        bet.value * bet.players.length
    );
}

function calculateFee(bet) {
    const total =
        calculateTotal(bet);

    const feePercent =
        Number(bet.fee || 0);

    return total * (
        feePercent / 100
    );
}

function calculatePrize(bet) {
    const total =
        calculateTotal(bet);

    const fee =
        calculateFee(bet);

    return Math.max(
        0,
        total - fee
    );
}

// ======================================================
// EMBED DO PIX
// ======================================================

function buildPixEmbed(
    guildId,
    bet
) {
    const config =
        getGuildConfig(
            guildId
        );

    const total =
        calculateTotal(bet);

    const fee =
        calculateFee(bet);

    const prize =
        calculatePrize(bet);

    const embed =
        new EmbedBuilder()
            .setColor(
                safeColor(
                    config.embedColor
                )
            )
            .setTitle("💳 PAGAMENTO")
            .addFields(
                {
                    name: "💰 Entrada",
                    value:
                        money(
                            bet.value
                        ),
                    inline: true
                },
                {
                    name: "💵 Total",
                    value:
                        money(total),
                    inline: true
                }
            );

    if (fee > 0) {
        embed.addFields({
            name: "📊 Taxa",
            value:
                `${formatMoney(config.fee)}%`
        });
    }

    embed.addFields({
        name: "🏆 Prêmio",
        value:
            money(prize)
    });

    if (config.pixName) {
        embed.addFields({
            name: "👤 Nome",
            value:
                config.pixName
        });
    }

    if (config.pixKey) {
        embed.addFields({
            name: "🔑 Pix",
            value:
                `\`${config.pixKey}\``
        });
    }

    if (config.pixQrCode) {
        embed.setImage(
            config.pixQrCode
        );
    }

    return embed;
}

// ======================================================
// ENVIAR PIX
// ======================================================

async function sendPix(
    channel,
    bet
) {
    await channel.send({
        embeds: [
            buildPixEmbed(
                bet.guildId,
                bet
            )
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `bet_confirm:${bet.id}`
                        )
                        .setLabel(
                            "Confirmar Pix"
                        )
                        .setEmoji("💳")
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
                )
        ]
    });
}

// ======================================================
// CONFIRMAR PAGAMENTO
// ======================================================

async function confirmBetPayment(
    interaction,
    bet
) {
    const player =
        bet.players.find(
            p =>
                p.userId ===
                interaction.user.id
        );

    if (!player) {
        return interaction.reply({
            content:
                "❌ Você não participa desta aposta.",
            ephemeral: true
        });
    }

    if (
        bet.status !==
        "aguardando_pix"
    ) {
        return interaction.reply({
            content:
                "❌ Esta aposta não está aguardando pagamento.",
            ephemeral: true
        });
    }

    if (
        bet.pixConfirmed.includes(
            interaction.user.id
        )
    ) {
        return interaction.reply({
            content:
                "❌ Você já confirmou o Pix.",
            ephemeral: true
        });
    }

    bet.pixConfirmed.push(
        interaction.user.id
    );

    player.confirmed = true;

    saveDatabase();

    await interaction.reply({
        content:
            "✅ Seu pagamento foi confirmado.",
        ephemeral: true
    });

    // Todos confirmaram
    if (
        bet.pixConfirmed.length >=
        bet.players.length
    ) {
        bet.status =
            "aguardando_sala";

        saveDatabase();

        const channel =
            await interaction.guild.channels.fetch(
                bet.channelId
            ).catch(() => null);

        if (channel) {
            await sendRoomWaiting(
                channel,
                bet
            );

            // Inicia automaticamente
            // o temporizador da sala.
            await startRoomTimer(
                interaction.guild,
                bet
            );
        }
    }
}

// ======================================================
// CANCELAR APOSTA
// ======================================================

async function cancelBet(
    interaction,
    bet
) {
    if (!bet) {
        return;
    }

    const allowed =
        bet.players.some(
            p =>
                p.userId ===
                interaction.user.id
        ) ||
        isMediator(
            interaction.member
        ) ||
        isAdmin(
            interaction.member
        );

    if (!allowed) {
        return interaction.reply({
            content:
                "❌ Você não pode cancelar esta aposta.",
            ephemeral: true
        });
    }

    if (
        bet.status ===
        "finalizada"
    ) {
        return interaction.reply({
            content:
                "❌ Esta aposta já foi finalizada.",
            ephemeral: true
        });
    }

    bet.status =
        "cancelada";

    saveDatabase();

    await interaction.reply({
        content:
            "✅ Aposta cancelada.",
        ephemeral: true
    });

    const channel =
        await interaction.guild.channels.fetch(
            bet.channelId
        ).catch(() => null);

    if (channel) {
        await channel.send(
            "❌ **Aposta cancelada.**"
        );
    }
}

// ======================================================
// SALA
// ======================================================

function buildRoomWaitingEmbed(
    guildId,
    bet
) {
    const config =
        getGuildConfig(
            guildId
        );

    return new EmbedBuilder()
        .setColor(
            safeColor(
                config.embedColor
            )
        )
        .setTitle(
            "🎮 SALA"
        )
        .setDescription(
            "⏳ Aguardando a sala..."
        )
        .addFields(
            {
                name: "📌 Formato",
                value:
                    bet.format,
                inline: true
            },
            {
                name: "📱 Modalidade",
                value:
                    bet.modality,
                inline: true
            }
        );
}

async function sendRoomWaiting(
    channel,
    bet
) {
    await channel.send({
        embeds: [
            buildRoomWaitingEmbed(
                bet.guildId,
                bet
            )
        ]
    });
}

// ======================================================
// TEMPORIZADOR DA SALA
// ======================================================

const roomTimers = new Map();

async function startRoomTimer(
    guild,
    bet
) {
    if (!bet) {
        return;
    }

    if (
        roomTimers.has(
            bet.id
        )
    ) {
        return;
    }

    // 3 a 5 minutos
    const minutes =
        Math.floor(
            Math.random() * 3
        ) + 3;

    const delay =
        minutes *
        60 *
        1000;

    const timer =
        setTimeout(
            async () => {
                roomTimers.delete(
                    bet.id
                );

                if (
                    bet.status ===
                    "cancelada"
                ) {
                    return;
                }

                bet.status =
                    "aguardando_sala_dados";

                saveDatabase();

                const channel =
                    await guild.channels.fetch(
                        bet.channelId
                    ).catch(() => null);

                if (!channel) {
                    return;
                }

                await channel.send({
                    content:
                        "🎮 **Sala pronta.**\n\nO mediador deve enviar o ID e a senha."
                });

                if (
                    bet.mediatorId
                ) {
                    await sendMediatorPanel(
                        channel,
                        bet
                    );
                }
            },
            delay
        );

    roomTimers.set(
        bet.id,
        timer
    );
}

// ======================================================
// MODAL DA SALA
// ======================================================

function roomModal(betId) {
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
                "ID da sala"
            )
            .setPlaceholder(
                "Digite o ID"
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(true);

    const password =
        new TextInputBuilder()
            .setCustomId(
                "room_password"
            )
            .setLabel(
                "Senha"
            )
            .setPlaceholder(
                "Digite a senha"
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(true);

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

// ======================================================
// ENVIAR DADOS DA SALA
// ======================================================

async function sendRoomData(
    interaction,
    bet,
    roomId,
    roomPassword
) {
    bet.roomId =
        roomId;

    bet.roomPassword =
        roomPassword;

    bet.status =
        "em_partida";

    saveDatabase();

    const embed =
        new EmbedBuilder()
            .setColor(
                safeColor(
                    getGuildConfig(
                        bet.guildId
                    ).embedColor
                )
            )
            .setTitle(
                "🎮 SALA DA PARTIDA"
            )
            .addFields(
                {
                    name: "🆔 ID",
                    value:
                        `\`${roomId}\``
                },
                {
                    name: "🔑 Senha",
                    value:
                        `\`${roomPassword}\``
                }
            );

    await interaction.reply({
        content:
            "✅ Sala enviada.",
        ephemeral: true
    });

    const channel =
        await interaction.guild.channels.fetch(
            bet.channelId
        ).catch(() => null);

    if (channel) {
        await channel.send({
            embeds: [embed]
        });
    }
}

// ======================================================
// PAINEL DO MEDIADOR
// ======================================================

function mediatorPanelEmbed(
    guildId,
    bet
) {
    const config =
        getGuildConfig(
            guildId
        );

    return new EmbedBuilder()
        .setColor(
            safeColor(
                config.embedColor
            )
        )
        .setTitle(
            `👨‍⚖️ MEDIADOR • APOSTA #${bet.id}`
        )
        .addFields(
            {
                name: "🎮 Partida",
                value:
                    `${bet.format} • ${bet.modality}`,
                inline: true
            },
            {
                name: "💰 Valor",
                value:
                    money(
                        bet.value
                    ),
                inline: true
            },
            {
                name: "👥 Jogadores",
                value:
                    bet.players
                        .map(
                            p =>
                                `<@${p.userId}>`
                        )
                        .join("\n")
            }
        );
}

function mediatorPanelButtons(
    bet
) {
    return [
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `room_open:${bet.id}`
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
                        `result_open:${bet.id}`
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
                        `wo_open:${bet.id}`
                    )
                    .setLabel(
                        "W.O."
                    )
                    .setEmoji("⚠️")
                    .setStyle(
                        ButtonStyle.Danger
                    )
            )
    ];
}

async function sendMediatorPanel(
    channel,
    bet
) {
    await channel.send({
        embeds: [
            mediatorPanelEmbed(
                bet.guildId,
                bet
            )
        ],
        components:
            mediatorPanelButtons(
                bet
            )
    });
}

// ======================================================
// SELECT DE RESULTADO
// ======================================================

function resultSelect(bet) {
    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(
                    `result_select:${bet.id}`
                )
                .setPlaceholder(
                    "Escolha o vencedor"
                )
                .addOptions(
                    bet.players.map(
                        player => ({
                            label:
                                player.username.slice(
                                    0,
                                    100
                                ),
                            value:
                                player.userId,
                            emoji: "🏆"
                        })
                    )
                )
        );
}

function woSelect(bet) {
    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(
                    `wo_select:${bet.id}`
                )
                .setPlaceholder(
                    "Escolha o jogador que perdeu por W.O."
                )
                .addOptions(
                    bet.players.map(
                        player => ({
                            label:
                                player.username.slice(
                                    0,
                                    100
                                ),
                            value:
                                player.userId,
                            emoji: "⚠️"
                        })
                    )
                )
        );
}

// ======================================================
// FINALIZAR RESULTADO
// ======================================================

async function finalizeResult(
    interaction,
    bet,
    winnerId
) {
    if (
        !isMediator(
            interaction.member
        ) &&
        !isAdmin(
            interaction.member
        )
    ) {
        return interaction.reply({
            content:
                "❌ Você não pode registrar o resultado.",
            ephemeral: true
        });
    }

    if (
        bet.status ===
        "finalizada"
    ) {
        return interaction.reply({
            content:
                "❌ Esta aposta já foi finalizada.",
            ephemeral: true
        });
    }

    const loser =
        bet.players.find(
            player =>
                player.userId !==
                winnerId
        );

    if (!loser) {
        return interaction.reply({
            content:
                "❌ Jogador inválido.",
            ephemeral: true
        });
    }

    bet.result = {
        type: "normal",
        winnerId,
        loserId:
            loser.userId,
        mediatorId:
            interaction.user.id,
        finishedAt:
            Date.now()
    };

    bet.status =
        "finalizada";

    const prize =
        calculatePrize(bet);

    // Atualiza estatísticas
    addWin(
        bet.guildId,
        winnerId
    );

    addLoss(
        bet.guildId,
        loser.userId
    );

    // Entrega o prêmio ao vencedor
    addCoins(
        bet.guildId,
        winnerId,
        prize
    );

    saveDatabase();

    await interaction.reply({
        content:
            `🏆 Resultado registrado. Vencedor: <@${winnerId}>`,
        ephemeral: false
    });

    const channel =
        await interaction.guild.channels.fetch(
            bet.channelId
        ).catch(() => null);

    if (channel) {
        await channel.send(
            `🏆 **Partida finalizada!**\n\nVencedor: <@${winnerId}>\nPrêmio: **${money(prize)}**`
        );
    }
}

// ======================================================
// FINALIZAR W.O.
// ======================================================

async function finalizeWO(
    interaction,
    bet,
    loserId
) {
    if (
        !isMediator(
            interaction.member
        ) &&
        !isAdmin(
            interaction.member
        )
    ) {
        return interaction.reply({
            content:
                "❌ Você não pode registrar W.O.",
            ephemeral: true
        });
    }

    if (
        bet.status ===
        "finalizada"
    ) {
        return interaction.reply({
            content:
                "❌ Esta aposta já foi finalizada.",
            ephemeral: true
        });
    }

    const loser =
        bet.players.find(
            player =>
                player.userId ===
                loserId
        );

    const winner =
        bet.players.find(
            player =>
                player.userId !==
                loserId
        );

    if (!loser || !winner) {
        return interaction.reply({
            content:
                "❌ Jogador inválido.",
            ephemeral: true
        });
    }

    bet.result = {
        type: "wo",
        winnerId:
            winner.userId,
        loserId:
            loser.userId,
        mediatorId:
            interaction.user.id,
        finishedAt:
            Date.now()
    };

    bet.status =
        "finalizada";

    const prize =
        calculatePrize(bet);

    addWin(
        bet.guildId,
        winner.userId
    );

    addWO(
        bet.guildId,
        loser.userId
    );

    addCoins(
        bet.guildId,
        winner.userId,
        prize
    );

    saveDatabase();

    await interaction.reply({
        content:
            `⚠️ W.O. registrado. Vencedor: <@${winner.userId}>`,
        ephemeral: false
    });

    const channel =
        await interaction.guild.channels.fetch(
            bet.channelId
        ).catch(() => null);

    if (channel) {
        await channel.send(
            `⚠️ **W.O. registrado!**\n\nVencedor: <@${winner.userId}>\nW.O.: <@${loser.userId}>\nPrêmio: **${money(prize)}**`
        );
    }
}

// ======================================================
// PERFIL / ESTATÍSTICAS
// ======================================================

async function showStats(
    interaction,
    user
) {
    const target =
        user ||
        interaction.user;

    const stats =
        getUserStats(
            interaction.guild.id,
            target.id
        );

    const games =
        Number(stats.games || 0);

    const wins =
        Number(stats.wins || 0);

    const losses =
        Number(stats.losses || 0);

    const wo =
        Number(stats.wo || 0);

    const winRate =
        games > 0
            ? (
                wins / games
            ) * 100
            : 0;

    const config =
        getGuildConfig(
            interaction.guild.id
        );

    const embed =
        new EmbedBuilder()
            .setColor(
                safeColor(
                    config.embedColor
                )
            )
            .setTitle(
                `👤 PERFIL • ${target.username}`
            )
            .setThumbnail(
                target.displayAvatarURL({
                    size: 256
                })
            )
            .addFields(
                {
                    name: "🏆 Vitórias",
                    value:
                        String(wins),
                    inline: true
                },
                {
                    name: "❌ Derrotas",
                    value:
                        String(losses),
                    inline: true
                },
                {
                    name: "📈 Win Rate",
                    value:
                        `${winRate.toFixed(1)}%`,
                    inline: true
                },
                {
                    name: "⚠️ W.O.",
                    value:
                        String(wo),
                    inline: true
                },
                {
                    name: "💰 Moedas",
                    value:
                        money(
                            stats.coins || 0
                        ),
                    inline: true
                }
            );

    if (
        interaction.isChatInputCommand()
    ) {
        return interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }

    return interaction.channel.send({
        embeds: [embed]
    });
}

// ======================================================
// PARSER DE DADOS DA SALA
// ======================================================

function parseRoomText(text) {
    if (!text) {
        return {
            id: null,
            password: null
        };
    }

    const lines =
        text
            .split("\n")
            .map(
                line =>
                    line.trim()
            )
            .filter(Boolean);

    let id = null;
    let password = null;

    for (const line of lines) {
        const lower =
            line.toLowerCase();

        if (
            lower.includes("id") &&
            lower.includes(":")
        ) {
            id =
                line
                    .split(":")
                    .slice(1)
                    .join(":")
                    .trim();
        }

        if (
            (
                lower.includes("senha") ||
                lower.includes("password")
            ) &&
            lower.includes(":")
        ) {
            password =
                line
                    .split(":")
                    .slice(1)
                    .join(":")
                    .trim();
        }
    }

    return {
        id,
        password
    };
}// ======================================================
// CONFIGURAÇÃO — EMBED
// ======================================================

function buildConfigEmbed(guild) {
    const config =
        getGuildConfig(guild.id);

    const admins =
        Array.isArray(config.adminIds)
            ? config.adminIds
            : [];

    const adminText =
        admins.length
            ? admins
                .map(
                    (id, index) =>
                        `${index + 1}. <@${id}>`
                )
                .join("\n")
            : "Nenhum";

    return new EmbedBuilder()
        .setColor(
            safeColor(
                config.embedColor
            )
        )
        .setTitle("⚙️ CONFIGURAÇÃO")
        .addFields(
            {
                name: "👑 Administradores",
                value:
                    `${admins.length}/20\n${adminText}`,
                inline: false
            },
            {
                name: "👨‍⚖️ Mediador",
                value:
                    config.mediatorRoleId
                        ? `<@&${config.mediatorRoleId}>`
                        : "Não configurado",
                inline: true
            },
            {
                name: "🔎 Analista",
                value:
                    config.analystRoleId
                        ? `<@&${config.analystRoleId}>`
                        : "Não configurado",
                inline: true
            },
            {
                name: "📱 Mobile",
                value:
                    config.mobileChannelId
                        ? `<#${config.mobileChannelId}>`
                        : "Não configurado",
                inline: true
            },
            {
                name: "💻 Emulador",
                value:
                    config.emulatorChannelId
                        ? `<#${config.emulatorChannelId}>`
                        : "Não configurado",
                inline: true
            },
            {
                name: "💰 Apostas",
                value:
                    config.betsCategoryId
                        ? `<#${config.betsCategoryId}>`
                        : "Não configurado",
                inline: true
            },
            {
                name: "💳 Pix",
                value:
                    config.pixKey
                        ? "Configurado"
                        : "Não configurado",
                inline: true
            },
            {
                name: "📊 Taxa",
                value:
                    `${Number(config.fee || 0)}%`,
                inline: true
            }
        );
}

// ======================================================
// BOTÕES DO CONFIG
// ======================================================

function configButtons() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    "config_admin_add"
                )
                .setLabel(
                    "Adicionar ADM"
                )
                .setEmoji("👑")
                .setStyle(
                    ButtonStyle.Primary
                ),

            new ButtonBuilder()
                .setCustomId(
                    "config_admin_remove"
                )
                .setLabel(
                    "Remover ADM"
                )
                .setEmoji("🗑️")
                .setStyle(
                    ButtonStyle.Danger
                ),

            new ButtonBuilder()
                .setCustomId(
                    "config_roles"
                )
                .setLabel(
                    "Cargos"
                )
                .setEmoji("🎭")
                .setStyle(
                    ButtonStyle.Secondary
                )
        ),

        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    "config_channels"
                )
                .setLabel(
                    "Canais"
                )
                .setEmoji("📢")
                .setStyle(
                    ButtonStyle.Secondary
                ),

            new ButtonBuilder()
                .setCustomId(
                    "config_pix"
                )
                .setLabel(
                    "Pix"
                )
                .setEmoji("💳")
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
                .setEmoji("💰")
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
                .setEmoji("🎨")
                .setStyle(
                    ButtonStyle.Secondary
                )
        )
    ];
}

// ======================================================
// SELECT DE CARGOS
// ======================================================

function roleSelects() {
    return [
        new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId(
                    "config_mediator_role"
                )
                .setPlaceholder(
                    "Cargo de Mediador"
                )
                .setMinValues(1)
                .setMaxValues(1)
        ),

        new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId(
                    "config_analyst_role"
                )
                .setPlaceholder(
                    "Cargo de Analista"
                )
                .setMinValues(1)
                .setMaxValues(1)
        )
    ];
}

// ======================================================
// SELECT DE CANAIS
// ======================================================
// IMPORTANTE:
// NÃO usamos setChannelTypes().
// Assim o menu permite selecionar canais de
// diferentes tipos.
//
// A categoria de apostas será validada separadamente.

function channelSelects() {
    return [
        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId(
                    "config_mobile_channel"
                )
                .setPlaceholder(
                    "Canal Mobile"
                )
                .setMinValues(1)
                .setMaxValues(1)
        ),

        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId(
                    "config_emulator_channel"
                )
                .setPlaceholder(
                    "Canal Emulador"
                )
                .setMinValues(1)
                .setMaxValues(1)
        ),

        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId(
                    "config_bets_category"
                )
                .setPlaceholder(
                    "Categoria das Apostas"
                )
                .setMinValues(1)
                .setMaxValues(1)
        )
    ];
}

// ======================================================
// MODAL PIX
// ======================================================

function pixModal() {
    const modal =
        new ModalBuilder()
            .setCustomId(
                "config_pix_modal"
            )
            .setTitle(
                "💳 Configurar Pix"
            );

    const name =
        new TextInputBuilder()
            .setCustomId(
                "pix_name"
            )
            .setLabel(
                "Nome do Pix"
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(false);

    const key =
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
            .setRequired(false);

    const qr =
        new TextInputBuilder()
            .setCustomId(
                "pix_qr"
            )
            .setLabel(
                "URL do QR Code"
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            name
        ),
        new ActionRowBuilder().addComponents(
            key
        ),
        new ActionRowBuilder().addComponents(
            qr
        )
    );

    return modal;
}

// ======================================================
// MODAL TAXA
// ======================================================

function feeModal() {
    const modal =
        new ModalBuilder()
            .setCustomId(
                "config_fee_modal"
            )
            .setTitle(
                "💰 Configurar Taxa"
            );

    const fee =
        new TextInputBuilder()
            .setCustomId(
                "fee_value"
            )
            .setLabel(
                "Taxa em porcentagem"
            )
            .setPlaceholder(
                "Ex: 10"
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            fee
        )
    );

    return modal;
}

// ======================================================
// MODAL APARÊNCIA
// ======================================================

function appearanceModal() {
    const modal =
        new ModalBuilder()
            .setCustomId(
                "config_appearance_modal"
            )
            .setTitle(
                "🎨 Aparência"
            );

    const color =
        new TextInputBuilder()
            .setCustomId(
                "embed_color"
            )
            .setLabel(
                "Cor da Embed"
            )
            .setPlaceholder(
                "#2B2D31"
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(false);

    const avatar =
        new TextInputBuilder()
            .setCustomId(
                "profile_picture"
            )
            .setLabel(
                "URL da foto de perfil"
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            color
        ),
        new ActionRowBuilder().addComponents(
            avatar
        )
    );

    return modal;
}

// ======================================================
// MODAL ADICIONAR ADM
// ======================================================

function addAdminModal() {
    const modal =
        new ModalBuilder()
            .setCustomId(
                "admin_add_modal"
            )
            .setTitle(
                "👑 Adicionar ADM"
            );

    const user =
        new TextInputBuilder()
            .setCustomId(
                "admin_user"
            )
            .setLabel(
                "ID do usuário"
            )
            .setPlaceholder(
                "Ex: 123456789012345678"
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            user
        )
    );

    return modal;
}

// ======================================================
// MODAL REMOVER ADM
// ======================================================

function removeAdminModal() {
    const modal =
        new ModalBuilder()
            .setCustomId(
                "admin_remove_modal"
            )
            .setTitle(
                "🗑️ Remover ADM"
            );

    const user =
        new TextInputBuilder()
            .setCustomId(
                "admin_user"
            )
            .setLabel(
                "ID do usuário"
            )
            .setPlaceholder(
                "ID do ADM"
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            user
        )
    );

    return modal;
}

// ======================================================
// COMANDO /FILA
// ======================================================

function filaFormatSelect() {
    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(
                    "fila_format"
                )
                .setPlaceholder(
                    "🎮 Escolha o formato"
                )
                .addOptions(
                    FORMATS.map(
                        format => ({
                            label: format,
                            value: format,
                            emoji: "🎮"
                        })
                    )
                )
        );
}

function filaModalitySelect(
    format
) {
    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(
                    `fila_modality:${format}`
                )
                .setPlaceholder(
                    "📱 Escolha a modalidade"
                )
                .addOptions(
                    MODALITIES.map(
                        modality => ({
                            label:
                                modality,
                            value:
                                modality,
                            emoji:
                                modality ===
                                "Mobile"
                                    ? "📱"
                                    : modality ===
                                        "Emulador"
                                        ? "💻"
                                        : "🎮"
                        })
                    )
                )
        );
}

function filaValueSelect(
    format,
    modality
) {
    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(
                    `fila_value:${format}:${modality}`
                )
                .setPlaceholder(
                    "💰 Escolha o valor"
                )
                .addOptions(
                    QUEUE_VALUES.map(
                        value => ({
                            label:
                                money(value),
                            value:
                                Number(value)
                                    .toFixed(2),
                            emoji: "💰"
                        })
                    )
                )
        );
}

// ======================================================
// SELECT DE CANAL DA FILA
// ======================================================
// O canal será escolhido pelo usuário durante
// o fluxo do /fila.
//
// Não usamos setChannelTypes(), portanto o menu
// não fica limitado a um único tipo.

function filaChannelSelect(
    format,
    modality,
    value
) {
    return new ActionRowBuilder()
        .addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId(
                    `fila_channel:${format}:${modality}:${value}`
                )
                .setPlaceholder(
                    "📢 Escolha o canal"
                )
                .setMinValues(1)
                .setMaxValues(1)
        );
}

// ======================================================
// /FILA — PUBLICAR UMA ÚNICA FILA
// ======================================================

async function handleFilaCommand(
    interaction
) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            content:
                "❌ Apenas administradores podem publicar filas.",
            ephemeral: true
        });
    }

    await interaction.reply({
        content:
            "🎮 Escolha o formato:",
        components: [
            filaFormatSelect()
        ],
        ephemeral: true
    });
}

// ======================================================
// /MED
// ======================================================

async function handleMedCommand(
    interaction
) {
    if (
        !isMediator(
            interaction.member
        ) &&
        !isAdmin(
            interaction.member
        )
    ) {
        return interaction.reply({
            content:
                "❌ Você não tem permissão para usar este comando.",
            ephemeral: true
        });
    }

    const channel =
        interaction.channel;

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        return interaction.reply({
            content:
                "❌ Este canal não pode receber a fila.",
            ephemeral: true
        });
    }

    const config =
        getGuildConfig(
            interaction.guild.id
        );

    // O canal onde /med foi usado
    // vira o canal da fila de mediadores.
    config.mediatorQueueChannelId =
        channel.id;

    config.mediatorQueueMessageId =
        null;

    saveDatabase();

    await publishMediatorQueue(
        interaction.guild,
        channel
    );

    await interaction.reply({
        content:
            "✅ Fila de mediadores publicada neste canal.",
        ephemeral: true
    });
}

// ======================================================
// /CONFIG
// ======================================================

async function handleConfigCommand(
    interaction
) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            content:
                "❌ Apenas administradores podem usar o /config.",
            ephemeral: true
        });
    }

    await interaction.reply({
        embeds: [
            buildConfigEmbed(
                interaction.guild
            )
        ],
        components:
            configButtons(),
        ephemeral: true
    });
}

// ======================================================
// DEFINIÇÃO DOS SLASH COMMANDS
// ======================================================

const commands = [
    new SlashCommandBuilder()
        .setName("fila")
        .setDescription(
            "Publica uma fila"
        ),

    new SlashCommandBuilder()
        .setName("med")
        .setDescription(
            "Publica a fila de mediadores neste canal"
        ),

    new SlashCommandBuilder()
        .setName("config")
        .setDescription(
            "Configura o bot"
        ),

    new SlashCommandBuilder()
        .setName("p")
        .setDescription(
            "Mostra o perfil"
        )
        .addUserOption(
            option =>
                option
                    .setName("usuario")
                    .setDescription(
                        "Usuário"
                    )
                    .setRequired(false)
        )
].map(
    command =>
        command.toJSON()
);

// ======================================================
// REGISTRAR COMANDOS
// ======================================================

async function registerGuildCommands(
    guild
) {
    try {
        await guild.commands.set(
            commands
        );

        console.log(
            `✅ Comandos registrados em ${guild.name}`
        );
    } catch (error) {
        console.error(
            `❌ Erro ao registrar comandos em ${guild.name}:`,
            error
        );
    }
}

// ======================================================
// EVENTO READY
// ======================================================

client.once(
    Events.ClientReady,
    async readyClient => {
        console.log(
            `✅ Bot conectado como ${readyClient.user.tag}`
        );

        for (
            const guild of readyClient.guilds.cache.values()
        ) {
            migrateGuild(
                guild.id
            );

            await syncGuildChannels(
                guild
            );

            await registerGuildCommands(
                guild
            );
        }

        console.log(
            "🚀 Bot pronto."
        );
    }
);

// ======================================================
// NOVO SERVIDOR
// ======================================================

client.on(
    Events.GuildCreate,
    async guild => {
        getGuildRecord(
            guild.id
        );

        migrateGuild(
            guild.id
        );

        await syncGuildChannels(
            guild
        );

        await registerGuildCommands(
            guild
        );

        console.log(
            `✅ Servidor adicionado: ${guild.name}`
        );
    }
);

// ======================================================
// NOVO CANAL
// ======================================================

client.on(
    Events.ChannelCreate,
    async channel => {
        if (!channel.guild) {
            return;
        }

        await syncGuildChannels(
            channel.guild
        );
    }
);

// ======================================================
// PRESENÇA
// ======================================================

client.on(
    Events.PresenceUpdate,
    async (
        oldPresence,
        newPresence
    ) => {
        const guild =
            newPresence.guild ||
            oldPresence?.guild;

        if (!guild) {
            return;
        }

        // Mantém o painel dos mediadores atualizado
        await updateMediatorQueue(
            guild
        );
    }
);

// ======================================================
// INTERAÇÕES
// ======================================================

client.on(
    Events.InteractionCreate,
    async interaction => {
        try {
            // ==================================================
            // SLASH COMMANDS
            // ==================================================

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
                    "med"
                ) {
                    return handleMedCommand(
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
                    "p"
                ) {
                    const user =
                        interaction.options.getUser(
                            "usuario"
                        ) ||
                        interaction.user;

                    return showStats(
                        interaction,
                        user
                    );
                }
            }

            // ==================================================
            // BOTÕES
            // ==================================================

            if (
                interaction.isButton()
            ) {
                const customId =
                    interaction.customId;

                // ------------------------------
                // FILA NORMAL 1X1
                // ------------------------------

                if (
                    customId.startsWith(
                        "queue_normal:"
                    )
                ) {
                    const key =
                        customId.split(
                            ":"
                        )[1];

                    const record =
                        getGuildRecord(
                            interaction.guild.id
                        );

                    const queue =
                        Object.values(
                            record.queues
                        ).find(
                            q =>
                                q.id === key
                        );

                    if (!queue) {
                        return interaction.reply({
                            content:
                                "❌ Fila não encontrada.",
                            ephemeral: true
                        });
                    }

                    return joinQueue(
                        interaction,
                        queue,
                        "normal"
                    );
                }

                // ------------------------------
                // FILA INFINITO 1X1
                // ------------------------------

                if (
                    customId.startsWith(
                        "queue_infinito:"
                    )
                ) {
                    const key =
                        customId.split(
                            ":"
                        )[1];

                    const record =
                        getGuildRecord(
                            interaction.guild.id
                        );

                    const queue =
                        Object.values(
                            record.queues
                        ).find(
                            q =>
                                q.id === key
                        );

                    if (!queue) {
                        return interaction.reply({
                            content:
                                "❌ Fila não encontrada.",
                            ephemeral: true
                        });
                    }

                    return joinQueue(
                        interaction,
                        queue,
                        "infinito"
                    );
                }

                // ------------------------------
                // ENTRAR FILA NORMAL
                // ------------------------------

                if (
                    customId.startsWith(
                        "queue_join:"
                    )
                ) {
                    const key =
                        customId.split(
                            ":"
                        )[1];

                    const record =
                        getGuildRecord(
                            interaction.guild.id
                        );

                    const queue =
                        Object.values(
                            record.queues
                        ).find(
                            q =>
                                q.id === key
                        );

                    if (!queue) {
                        return interaction.reply({
                            content:
                                "❌ Fila não encontrada.",
                            ephemeral: true
                        });
                    }

                    return joinQueue(
                        interaction,
                        queue
                    );
                }

                // ------------------------------
                // SAIR FILA
                // ------------------------------

                if (
                    customId.startsWith(
                        "queue_leave:"
                    )
                ) {
                    const key =
                        customId.split(
                            ":"
                        )[1];

                    const record =
                        getGuildRecord(
                            interaction.guild.id
                        );

                    const queue =
                        Object.values(
                            record.queues
                        ).find(
                            q =>
                                q.id === key
                        );

                    if (!queue) {
                        return interaction.reply({
                            content:
                                "❌ Fila não encontrada.",
                            ephemeral: true
                        });
                    }

                    return leaveQueue(
                        interaction,
                        queue
                    );
                }

                // ------------------------------
                // MEDIADOR ENTRAR
                // ------------------------------

                if (
                    customId ===
                    "mediator_join"
                ) {
                    return joinMediatorQueue(
                        interaction
                    );
                }

                // ------------------------------
                // MEDIADOR SAIR
                // ------------------------------

                if (
                    customId ===
                    "mediator_leave"
                ) {
                    return leaveMediatorQueue(
                        interaction
                    );
                }

                // ------------------------------
                // CONFIRMAR PIX
                // ------------------------------

                if (
                    customId.startsWith(
                        "bet_confirm:"
                    )
                ) {
                    const betId =
                        customId.split(
                            ":"
                        )[1];

                    const record =
                        getGuildRecord(
                            interaction.guild.id
                        );

                    const bet =
                        record.bets[
                            betId
                        ];

                    if (!bet) {
                        return interaction.reply({
                            content:
                                "❌ Aposta não encontrada.",
                            ephemeral: true
                        });
                    }

                    return confirmBetPayment(
                        interaction,
                        bet
                    );
                }

                // ------------------------------
                // CANCELAR APOSTA
                // ------------------------------

                if (
                    customId.startsWith(
                        "bet_cancel:"
                    )
                ) {
                    const betId =
                        customId.split(
                            ":"
                        )[1];

                    const record =
                        getGuildRecord(
                            interaction.guild.id
                        );

                    const bet =
                        record.bets[
                            betId
                        ];

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

                // ------------------------------
                // CONFIG — ADICIONAR ADM
                // ------------------------------

                if (
                    customId ===
                    "config_admin_add"
                ) {
                    if (
                        !isAdmin(
                            interaction.member
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Sem permissão.",
                            ephemeral: true
                        });
                    }

                    return interaction.showModal(
                        addAdminModal()
                    );
                }

                // ------------------------------
                // CONFIG — REMOVER ADM
                // ------------------------------

                if (
                    customId ===
                    "config_admin_remove"
                ) {
                    if (
                        !isAdmin(
                            interaction.member
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Sem permissão.",
                            ephemeral: true
                        });
                    }

                    return interaction.showModal(
                        removeAdminModal()
                    );
                }

                // ------------------------------
                // CONFIG — CARGOS
                // ------------------------------

                if (
                    customId ===
                    "config_roles"
                ) {
                    return interaction.reply({
                        content:
                            "🎭 Selecione os cargos:",
                        components:
                            roleSelects(),
                        ephemeral: true
                    });
                }

                // ------------------------------
                // CONFIG — CANAIS
                // ------------------------------

                if (
                    customId ===
                    "config_channels"
                ) {
                    return interaction.reply({
                        content:
                            "📢 Selecione os canais:",
                        components:
                            channelSelects(),
                        ephemeral: true
                    });
                }

                // ------------------------------
                // CONFIG — PIX
                // ------------------------------

                if (
                    customId ===
                    "config_pix"
                ) {
                    return interaction.showModal(
                        pixModal()
                    );
                }

                // ------------------------------
                // CONFIG — TAXA
                // ------------------------------

                if (
                    customId ===
                    "config_fee"
                ) {
                    return interaction.showModal(
                        feeModal()
                    );
                }

                // ------------------------------
                // CONFIG — APARÊNCIA
                // ------------------------------

                if (
                    customId ===
                    "config_appearance"
                ) {
                    return interaction.showModal(
                        appearanceModal()
                    );
                }

                // ------------------------------
                // ABRIR SALA
                // ------------------------------

                if (
                    customId.startsWith(
                        "room_open:"
                    )
                ) {
                    const betId =
                        customId.split(
                            ":"
                        )[1];

                    const record =
                        getGuildRecord(
                            interaction.guild.id
                        );

                    const bet =
                        record.bets[
                            betId
                        ];

                    if (!bet) {
                        return interaction.reply({
                            content:
                                "❌ Aposta não encontrada.",
                            ephemeral: true
                        });
                    }

                    if (
                        !isMediator(
                            interaction.member
                        ) &&
                        !isAdmin(
                            interaction.member
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Você não pode gerenciar esta partida.",
                            ephemeral: true
                        });
                    }

                    return interaction.showModal(
                        roomModal(
                            bet.id
                        )
                    );
                }

                // ------------------------------
                // ABRIR RESULTADO
                // ------------------------------

                if (
                    customId.startsWith(
                        "result_open:"
                    )
                ) {
                    const betId =
                        customId.split(
                            ":"
                        )[1];

                    const record =
                        getGuildRecord(
                            interaction.guild.id
                        );

                    const bet =
                        record.bets[
                            betId
                        ];

                    if (!bet) {
                        return interaction.reply({
                            content:
                                "❌ Aposta não encontrada.",
                            ephemeral: true
                        });
                    }

                    if (
                        !isMediator(
                            interaction.member
                        ) &&
                        !isAdmin(
                            interaction.member
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Sem permissão.",
                            ephemeral: true
                        });
                    }

                    return interaction.reply({
                        content:
                            "🏆 Escolha o vencedor:",
                        components: [
                            resultSelect(
                                bet
                            )
                        ],
                        ephemeral: true
                    });
                }

                // ------------------------------
                // ABRIR W.O.
                // ------------------------------

                if (
                    customId.startsWith(
                        "wo_open:"
                    )
                ) {
                    const betId =
                        customId.split(
                            ":"
                        )[1];

                    const record =
                        getGuildRecord(
                            interaction.guild.id
                        );

                    const bet =
                        record.bets[
                            betId
                        ];

                    if (!bet) {
                        return interaction.reply({
                            content:
                                "❌ Aposta não encontrada.",
                            ephemeral: true
                        });
                    }

                    if (
                        !isMediator(
                            interaction.member
                        ) &&
                        !isAdmin(
                            interaction.member
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Sem permissão.",
                            ephemeral: true
                        });
                    }

                    return interaction.reply({
                        content:
                            "⚠️ Escolha quem perdeu por W.O.:",
                        components: [
                            woSelect(
                                bet
                            )
                        ],
                        ephemeral: true
                    });
                }
            }

            // ==================================================
            // SELECT MENUS
            // ==================================================

            if (
                interaction.isStringSelectMenu()
            ) {
                const customId =
                    interaction.customId;

                // ------------------------------
                // ESCOLHER FORMATO
                // ------------------------------

                if (
                    customId ===
                    "fila_format"
                ) {
                    const format =
                        interaction.values[0];

                    return interaction.update({
                        content:
                            `🎮 Formato: **${format}**\n\n📱 Escolha a modalidade:`,
                        components: [
                            filaModalitySelect(
                                format
                            )
                        ]
                    });
                }

                // ------------------------------
                // ESCOLHER MODALIDADE
                // ------------------------------

                if (
                    customId.startsWith(
                        "fila_modality:"
                    )
                ) {
                    const format =
                        customId.split(
                            ":"
                        )[1];

                    const modality =
                        interaction.values[0];

                    return interaction.update({
                        content:
                            `🎮 Formato: **${format}**\n📱 Modalidade: **${modality}**\n\n💰 Escolha o valor:`,
                        components: [
                            filaValueSelect(
                                format,
                                modality
                            )
                        ]
                    });
                }

                // ------------------------------
                // ESCOLHER VALOR
                // ------------------------------

                if (
                    customId.startsWith(
                        "fila_value:"
                    )
                ) {
                    const parts =
                        customId.split(
                            ":"
                        );

                    const format =
                        parts[1];

                    const modality =
                        parts[2];

                    const value =
                        interaction.values[0];

                    return interaction.update({
                        content:
                            `🎮 Formato: **${format}**\n📱 Modalidade: **${modality}**\n💰 Valor: **${money(value)}**\n\n📢 Escolha o canal:`,
                        components: [
                            filaChannelSelect(
                                format,
                                modality,
                                value
                            )
                        ]
                    });
                }

                // ------------------------------
                // RESULTADO
                // ------------------------------

                if (
                    customId.startsWith(
                        "result_select:"
                    )
                ) {
                    const betId =
                        customId.split(
                            ":"
                        )[1];

                    const record =
                        getGuildRecord(
                            interaction.guild.id
                        );

                    const bet =
                        record.bets[
                            betId
                        ];

                    if (!bet) {
                        return interaction.reply({
                            content:
                                "❌ Aposta não encontrada.",
                            ephemeral: true
                        });
                    }

                    const winnerId =
                        interaction.values[0];

                    return finalizeResult(
                        interaction,
                        bet,
                        winnerId
                    );
                }

                // ------------------------------
                // W.O.
                // ------------------------------

                if (
                    customId.startsWith(
                        "wo_select:"
                    )
                ) {
                    const betId =
                        customId.split(
                            ":"
                        )[1];

                    const record =
                        getGuildRecord(
                            interaction.guild.id
                        );

                    const bet =
                        record.bets[
                            betId
                        ];

                    if (!bet) {
                        return interaction.reply({
                            content:
                                "❌ Aposta não encontrada.",
                            ephemeral: true
                        });
                    }

                    const loserId =
                        interaction.values[0];

                    return finalizeWO(
                        interaction,
                        bet,
                        loserId
                    );
                }
            }

            // ==================================================
            // SELECT DE CARGO
            // ==================================================

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
                            "❌ Sem permissão.",
                        ephemeral: true
                    });
                }

                const roleId =
                    interaction.values[0];

                const config =
                    getGuildConfig(
                        interaction.guild.id
                    );

                if (
                    interaction.customId ===
                    "config_mediator_role"
                ) {
                    config.mediatorRoleId =
                        roleId;

                    saveDatabase();

                    return interaction.update({
                        content:
                            "✅ Cargo de mediador atualizado.",
                        components: []
                    });
                }

                if (
                    interaction.customId ===
                    "config_analyst_role"
                ) {
                    config.analystRoleId =
                        roleId;

                    saveDatabase();

                    return interaction.update({
                        content:
                            "✅ Cargo de analista atualizado.",
                        components: []
                    });
                }
            }

            // ==================================================
            // SELECT DE CANAL
            // ==================================================

            if (
                interaction.isChannelSelectMenu()
            ) {
                if (
                    !isAdmin(
                        interaction.member
                    )
                ) {
                    return interaction.reply({
                        content:
                            "❌ Sem permissão.",
                        ephemeral: true
                    });
                }

                const channelId =
                    interaction.values[0];

                const config =
                    getGuildConfig(
                        interaction.guild.id
                    );

                // ------------------------------
                // CONFIG MOBILE
                // ------------------------------

                if (
                    interaction.customId ===
                    "config_mobile_channel"
                ) {
                    config.mobileChannelId =
                        channelId;

                    saveDatabase();

                    return interaction.update({
                        content:
                            "✅ Canal Mobile atualizado.",
                        components: []
                    });
                }

                // ------------------------------
                // CONFIG EMULADOR
                // ------------------------------

                if (
                    interaction.customId ===
                    "config_emulator_channel"
                ) {
                    config.emulatorChannelId =
                        channelId;

                    saveDatabase();

                    return interaction.update({
                        content:
                            "✅ Canal Emulador atualizado.",
                        components: []
                    });
                }

                // ------------------------------
                // CONFIG CATEGORIA
                // ------------------------------

                if (
                    interaction.customId ===
                    "config_bets_category"
                ) {
                    const channel =
                        await interaction.guild.channels.fetch(
                            channelId
                        ).catch(
                            () => null
                        );

                    if (
                        !channel ||
                        channel.type !== 4
                    ) {
                        return interaction.update({
                            content:
                                "❌ O canal escolhido precisa ser uma categoria.",
                            components:
                                channelSelects()
                        });
                    }

                    config.betsCategoryId =
                        channelId;

                    saveDatabase();

                    return interaction.update({
                        content:
                            "✅ Categoria das apostas atualizada.",
                        components: []
                    });
                }

                // ==================================================
                // /FILA — ESCOLHER CANAL
                // ==================================================

                if (
                    interaction.customId.startsWith(
                        "fila_channel:"
                    )
                ) {
                    const parts =
                        interaction.customId.split(
                            ":"
                        );

                    const format =
                        parts[1];

                    const modality =
                        parts[2];

                    const value =
                        parts[3];

                    const channel =
                        await interaction.guild.channels.fetch(
                            channelId
                        ).catch(
                            () => null
                        );

                    if (
                        !channel ||
                        !channel.isTextBased()
                    ) {
                        return interaction.update({
                            content:
                                "❌ Esse canal não pode receber mensagens.",
                            components: [
                                filaChannelSelect(
                                    format,
                                    modality,
                                    value
                                )
                            ]
                        });
                    }

                    try {
                        await publishQueue(
                            interaction.guild,
                            channel,
                            format,
                            modality,
                            Number(value)
                        );

                        return interaction.update({
                            content:
                                `✅ Fila publicada em <#${channel.id}>.`,
                            components: []
                        });
                    } catch (error) {
                        console.error(
                            "❌ Erro ao publicar fila:",
                            error
                        );

                        return interaction.update({
                            content:
                                "❌ Não foi possível publicar a fila.",
                            components: []
                        });
                    }
                }
            }

            // ==================================================
            // MODAIS
            // ==================================================

            if (
                interaction.isModalSubmit()
            ) {
                const customId =
                    interaction.customId;

                // ------------------------------
                // ADICIONAR ADM
                // ------------------------------

                if (
                    customId ===
                    "admin_add_modal"
                ) {
                    if (
                        !isAdmin(
                            interaction.member
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Sem permissão.",
                            ephemeral: true
                        });
                    }

                    const userId =
                        interaction.fields
                            .getTextInputValue(
                                "admin_user"
                            )
                            .trim();

                    if (
                        !/^\d{17,20}$/.test(
                            userId
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ ID de usuário inválido.",
                            ephemeral: true
                        });
                    }

                    const result =
                        addAdmin(
                            interaction.guild.id,
                            userId
                        );

                    if (
                        !result.success
                    ) {
                        if (
                            result.reason ===
                            "limit"
                        ) {
                            return interaction.reply({
                                content:
                                    "❌ O limite de 20 administradores já foi atingido.",
                                ephemeral: true
                            });
                        }

                        if (
                            result.reason ===
                            "already"
                        ) {
                            return interaction.reply({
                                content:
                                    "❌ Esse usuário já é administrador.",
                                ephemeral: true
                            });
                        }
                    }

                    return interaction.reply({
                        content:
                            `✅ <@${userId}> foi adicionado como administrador.`,
                        ephemeral: true
                    });
                }

                // ------------------------------
                // REMOVER ADM
                // ------------------------------

                if (
                    customId ===
                    "admin_remove_modal"
                ) {
                    if (
                        !isAdmin(
                            interaction.member
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Sem permissão.",
                            ephemeral: true
                        });
                    }

                    const userId =
                        interaction.fields
                            .getTextInputValue(
                                "admin_user"
                            )
                            .trim();

                    const removed =
                        removeAdmin(
                            interaction.guild.id,
                            userId
                        );

                    if (!removed) {
                        return interaction.reply({
                            content:
                                "❌ Esse usuário não está na lista de administradores.",
                            ephemeral: true
                        });
                    }

                    return interaction.reply({
                        content:
                            `✅ <@${userId}> foi removido dos administradores.`,
                        ephemeral: true
                    });
                }

                // ------------------------------
                // PIX
                // ------------------------------

                if (
                    customId ===
                    "config_pix_modal"
                ) {
                    if (
                        !isAdmin(
                            interaction.member
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Sem permissão.",
                            ephemeral: true
                        });
                    }

                    const config =
                        getGuildConfig(
                            interaction.guild.id
                        );

                    config.pixName =
                        interaction.fields
                            .getTextInputValue(
                                "pix_name"
                            )
                            .trim();

                    config.pixKey =
                        interaction.fields
                            .getTextInputValue(
                                "pix_key"
                            )
                            .trim();

                    config.pixQrCode =
                        interaction.fields
                            .getTextInputValue(
                                "pix_qr"
                            )
                            .trim();

                    saveDatabase();

                    return interaction.reply({
                        content:
                            "✅ Pix atualizado.",
                        ephemeral: true
                    });
                }

                // ------------------------------
                // TAXA
                // ------------------------------

                if (
                    customId ===
                    "config_fee_modal"
                ) {
                    if (
                        !isAdmin(
                            interaction.member
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Sem permissão.",
                            ephemeral: true
                        });
                    }

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
                        return interaction.reply({
                            content:
                                "❌ A taxa precisa estar entre 0 e 100%.",
                            ephemeral: true
                        });
                    }

                    const config =
                        getGuildConfig(
                            interaction.guild.id
                        );

                    config.fee =
                        fee;

                    saveDatabase();

                    return interaction.reply({
                        content:
                            `✅ Taxa definida em ${fee}%.`,
                        ephemeral: true
                    });
                }

                // ------------------------------
                // APARÊNCIA
                // ------------------------------

                if (
                    customId ===
                    "config_appearance_modal"
                ) {
                    if (
                        !isAdmin(
                            interaction.member
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Sem permissão.",
                            ephemeral: true
                        });
                    }

                    const config =
                        getGuildConfig(
                            interaction.guild.id
                        );

                    const color =
                        interaction.fields
                            .getTextInputValue(
                                "embed_color"
                            )
                            .trim();

                    const avatar =
                        interaction.fields
                            .getTextInputValue(
                                "profile_picture"
                            )
                            .trim();

                    if (
                        color &&
                        !/^#[0-9A-F]{6}$/i.test(
                            color
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Cor inválida. Use o formato #RRGGBB.",
                            ephemeral: true
                        });
                    }

                    if (color) {
                        config.embedColor =
                            color;
                    }

                    if (avatar) {
                        config.profilePicture =
                            avatar;
                    }

                    saveDatabase();

                    return interaction.reply({
                        content:
                            "✅ Aparência atualizada.",
                        ephemeral: true
                    });
                }

                // ------------------------------
                // SALA
                // ------------------------------

                if (
                    customId.startsWith(
                        "room_modal:"
                    )
                ) {
                    const betId =
                        customId.split(
                            ":"
                        )[1];

                    const record =
                        getGuildRecord(
                            interaction.guild.id
                        );

                    const bet =
                        record.bets[
                            betId
                        ];

                    if (!bet) {
                        return interaction.reply({
                            content:
                                "❌ Aposta não encontrada.",
                            ephemeral: true
                        });
                    }

                    if (
                        !isMediator(
                            interaction.member
                        ) &&
                        !isAdmin(
                            interaction.member
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Sem permissão.",
                            ephemeral: true
                        });
                    }

                    const roomId =
                        interaction.fields
                            .getTextInputValue(
                                "room_id"
                            )
                            .trim();

                    const password =
                        interaction.fields
                            .getTextInputValue(
                                "room_password"
                            )
                            .trim();

                    return sendRoomData(
                        interaction,
                        bet,
                        roomId,
                        password
                    );
                }
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
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content:
                            "❌ Ocorreu um erro ao processar esta ação.",
                        ephemeral: true
                    });
                }
            } catch {}
        }
    }
);

// ======================================================
// COMANDOS POR MENSAGEM
// ======================================================

client.on(
    Events.MessageCreate,
    async message => {
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

        // ------------------------------
        // .med
        // ------------------------------

        if (
            content === ".med"
        ) {
            if (
                !isMediator(
                    message.member
                ) &&
                !isAdmin(
                    message.member
                )
            ) {
                return message.reply(
                    "❌ Você não tem permissão."
                );
            }

            const config =
                getGuildConfig(
                    message.guild.id
                );

            config.mediatorQueueChannelId =
                message.channel.id;

            config.mediatorQueueMessageId =
                null;

            saveDatabase();

            await publishMediatorQueue(
                message.guild,
                message.channel
            );

            return message.reply(
                "✅ Fila de mediadores publicada neste canal."
            );
        }

        // ------------------------------
        // .p
        // ------------------------------

        if (
            content === ".p"
        ) {
            return showStats(
                {
                    guild:
                        message.guild,
                    user:
                        message.author,
                    channel:
                        message.channel,
                    isChatInputCommand:
                        () => false
                },
                message.author
            );
        }
    }
);

// ======================================================
// LOGIN
// ======================================================

client.login(TOKEN)
    .then(() => {
        console.log(
            "🔄 Conectando ao Discord..."
        );
    })
    .catch(error => {
        console.error(
            "❌ Erro ao conectar ao Discord:",
            error
        );
    });
