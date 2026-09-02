```javascript
require("dotenv").config();

const fs = require("fs");
const path = require("path");

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
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    SlashCommandBuilder,
    Events
} = require("discord.js");

// ============================================================
// TOKEN
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;

if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN/TOKEN não encontrado no .env");
    process.exit(1);
}

// ============================================================
// BANCO
// ============================================================

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "bot.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function defaultGuildConfig() {
    return {
        mediatorRoleId: "",
        analystRoleId: "",
        adminRoleId: "",

        fee: 0.01,

        embedColor: "#5865F2",
        profilePicture: "",

        mobileChannelId: "",
        emulatorChannelId: "",
        mediatorChannelId: "",
        betsCategoryId: "",

        pixName: "",
        pixKey: "",
        pixQrCode: ""
    };
}

function defaultDB() {
    return {
        guilds: {},
        users: {}
    };
}

let db;

try {
    if (fs.existsSync(DB_FILE)) {
        db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    } else {
        db = defaultDB();
    }
} catch (error) {
    console.error("❌ Erro lendo banco:", error);
    db = defaultDB();
}

if (!db.guilds) db.guilds = {};
if (!db.users) db.users = {};

function saveDB() {
    try {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(db, null, 2)
        );
    } catch (error) {
        console.error("❌ Erro salvando banco:", error);
    }
}

function getGuildRecord(guildId) {
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = {
            config: defaultGuildConfig(),
            mediatorQueue: []
        };
    }

    if (!db.guilds[guildId].config) {
        db.guilds[guildId].config = defaultGuildConfig();
    }

    if (!Array.isArray(db.guilds[guildId].mediatorQueue)) {
        db.guilds[guildId].mediatorQueue = [];
    }

    const cfg = db.guilds[guildId].config;

    // Migração de versões antigas
    if (!cfg.mobileChannelId && cfg.mobileRequestsChannelId) {
        cfg.mobileChannelId = cfg.mobileRequestsChannelId;
    }

    if (!cfg.emulatorChannelId && cfg.emulatorRequestsChannelId) {
        cfg.emulatorChannelId = cfg.emulatorRequestsChannelId;
    }

    if (!cfg.mediatorChannelId && cfg.mediatorQueueChannelId) {
        cfg.mediatorChannelId = cfg.mediatorQueueChannelId;
    }

    if (!cfg.pixQrCode && cfg.pixQrUrl) {
        cfg.pixQrCode = cfg.pixQrUrl;
    }

    return db.guilds[guildId];
}

function getGuildConfig(guildId) {
    return getGuildRecord(guildId).config;
}

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const VALUES = [
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
    100
];

const QUEUE_CAPACITY = 2;

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

// ============================================================
// MEMÓRIA
// ============================================================

const queues = new Map();
const matches = new Map();
const mediatorQueues = new Map();
const roomTimers = new Map();

const guildLockState = new Map();

// ============================================================
// UTILITÁRIOS
// ============================================================

function money(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function parseMoney(value) {
    if (typeof value !== "string") return null;

    let clean = value
        .replace(/R\$/gi, "")
        .replace(/\s/g, "")
        .trim();

    if (!clean) return null;

    if (clean.includes(",")) {
        clean = clean
            .replace(/\./g, "")
            .replace(",", ".");
    }

    const result = Number(clean);

    return Number.isFinite(result)
        ? result
        : null;
}

function getGuildId(value) {
    if (!value) return null;

    if (typeof value === "string") {
        return value;
    }

    return value.guildId || value.id || null;
}

function makeEmbed(guildOrId, title, description = "") {
    const guildId = getGuildId(guildOrId);
    const cfg = guildId
        ? getGuildConfig(guildId)
        : defaultGuildConfig();

    const embed = new EmbedBuilder()
        .setColor(cfg.embedColor || "#5865F2")
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

    if (cfg.profilePicture) {
        embed.setThumbnail(cfg.profilePicture);
    }

    return embed;
}

function footer(embed, text) {
    return embed.setFooter({
        text: text || "Sistema de Filas"
    });
}

function mentionUser(id) {
    return `<@${id}>`;
}

function getUserStats(userId) {
    if (!db.users[userId]) {
        db.users[userId] = {
            wins: 0,
            losses: 0,
            woVictories: 0,
            coins: 0
        };
    }

    return db.users[userId];
}

function addWin(userId) {
    getUserStats(userId).wins++;
    saveDB();
}

function addLoss(userId) {
    getUserStats(userId).losses++;
    saveDB();
}

function addWOWin(userId) {
    getUserStats(userId).woVictories++;
    saveDB();
}

// ============================================================
// PERMISSÕES
// ============================================================

function isAdmin(member) {
    if (!member) return false;

    if (
        member.permissions &&
        member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
        return true;
    }

    const cfg = getGuildConfig(member.guild.id);

    return Boolean(
        cfg.adminRoleId &&
        member.roles &&
        member.roles.cache.has(cfg.adminRoleId)
    );
}

function isMediator(member) {
    if (!member) return false;

    const cfg = getGuildConfig(member.guild.id);

    if (!cfg.mediatorRoleId) {
        return false;
    }

    return member.roles.cache.has(
        cfg.mediatorRoleId
    );
}

// ============================================================
// ADM ONLINE
// ============================================================

function isMemberOnline(member) {
    if (!member) return false;

    // Presença normal
    const status = member.presence?.status;

    if (
        status === "online" ||
        status === "idle" ||
        status === "dnd"
    ) {
        return true;
    }

    return false;
}

function getOnlineAdmins(guild) {
    const result = [];

    for (const member of guild.members.cache.values()) {
        if (!isAdmin(member)) continue;

        if (isMemberOnline(member)) {
            result.push(member);
        }
    }

    return result;
}

function hasOnlineAdmin(guild) {
    return getOnlineAdmins(guild).length > 0;
}

function isQueueLocked(guild) {
    return !hasOnlineAdmin(guild);
}

// ============================================================
// FILAS
// ============================================================

function queueKey(
    guildId,
    format,
    modality,
    value
) {
    return [
        guildId,
        format,
        modality,
        Number(value)
    ].join(":");
}

function getQueue(
    guildId,
    format,
    modality,
    value
) {
    const key = queueKey(
        guildId,
        format,
        modality,
        value
    );

    if (!queues.has(key)) {
        queues.set(key, {
            key,
            guildId,
            format,
            modality,
            value: Number(value),
            players: [],
            gelo: {},
            messageId: null,
            channelId: null
        });
    }

    return queues.get(key);
}

function removePlayerFromAllQueues(
    guildId,
    userId
) {
    const changed = [];

    for (const q of queues.values()) {
        if (q.guildId !== guildId) continue;

        const index = q.players.indexOf(userId);

        if (index !== -1) {
            q.players.splice(index, 1);
            delete q.gelo[userId];

            changed.push(q);
        }
    }

    return changed;
}

function queueProgress(q) {
    return `${q.players.length}/${QUEUE_CAPACITY}`;
}

function queueLockedEmbed(q) {
    const guild = client.guilds.cache.get(q.guildId);

    const embed = makeEmbed(
        q.guildId,
        `🔒 FILA ${q.format}`,
        `**${money(q.value)}** • ${q.modality}`
    );

    embed.addFields({
        name: "🚫 FILA BLOQUEADA",
        value:
            "No momento não há nenhum **Administrador online**.\n\n" +
            "Por segurança, ninguém pode entrar nesta fila enquanto não houver um administrador disponível.",
        inline: false
    });

    if (q.players.length > 0) {
        embed.addFields({
            name: "👥 Jogadores",
            value: q.players
                .map((id, index) =>
                    `**${index + 1}.** ${mentionUser(id)}`
                )
                .join("\n"),
            inline: false
        });
    }

    return footer(
        embed,
        guild
            ? `${guild.name} • Aguardando administrador`
            : "Aguardando administrador"
    );
}

function queueEmbed(q) {
    const guild = client.guilds.cache.get(
        q.guildId
    );

    const locked = guild
        ? isQueueLocked(guild)
        : true;

    if (locked) {
        return queueLockedEmbed(q);
    }

    const embed = makeEmbed(
        q.guildId,
        `🎮 FILA ${q.format}`,
        `💰 **${money(q.value)}**  •  ${q.modality}  •  👥 **${queueProgress(q)}**`
    );

    if (q.format === "1x1") {
        embed.addFields({
            name: "🧊 Escolha o gelo",
            value:
                "🧊 Normal  •  ♾️ Infinito\n" +
                "A partida começa quando 2 jogadores escolherem o mesmo tipo.",
            inline: false
        });
    }

    if (q.players.length === 0) {
        embed.addFields({
            name: "👥 Jogadores",
            value: "A fila está vazia.",
            inline: false
        });
    } else {
        embed.addFields({
            name: "👥 Jogadores",
            value: q.players
                .map((id, index) => {
                    let gelo = "";

                    if (q.format === "1x1") {
                        if (q.gelo[id] === "normal") {
                            gelo = " 🧊";
                        }

                        if (q.gelo[id] === "infinito") {
                            gelo = " ♾️";
                        }
                    }

                    return `**${index + 1}.** ${mentionUser(id)}${gelo}`;
                })
                .join("\n"),
            inline: false
        });
    }

    return footer(
        embed,
        guild
            ? `${guild.name} • Máximo 2 jogadores`
            : "Máximo 2 jogadores"
    );
}

function queueButtons(q) {
    const guild = client.guilds.cache.get(
        q.guildId
    );

    const locked = guild
        ? isQueueLocked(guild)
        : true;

    if (q.format === "1x1") {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `queue_normal:${q.guildId}:${q.format}:${q.modality}:${q.value}`
                )
                .setLabel("Gelo Normal")
                .setEmoji("🧊")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(locked),

            new ButtonBuilder()
                .setCustomId(
                    `queue_infinito:${q.guildId}:${q.format}:${q.modality}:${q.value}`
                )
                .setLabel("Gelo Infinito")
                .setEmoji("♾️")
                .setStyle(ButtonStyle.Success)
                .setDisabled(locked),

            new ButtonBuilder()
                .setCustomId(
                    `queue_leave:${q.guildId}:${q.format}:${q.modality}:${q.value}`
                )
                .setLabel("Sair")
                .setEmoji("🚪")
                .setStyle(ButtonStyle.Danger)
                .setDisabled(false)
        );
    }

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(
                `queue_join:${q.guildId}:${q.format}:${q.modality}:${q.value}`
            )
            .setLabel("Entrar")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success)
            .setDisabled(locked),

        new ButtonBuilder()
            .setCustomId(
                `queue_leave:${q.guildId}:${q.format}:${q.modality}:${q.value}`
            )
            .setLabel("Sair")
            .setEmoji("🚪")
            .setStyle(ButtonStyle.Danger)
    );
}

// ============================================================
// ATUALIZAÇÃO DAS FILAS
// ============================================================

async function refreshQueue(q) {
    const guild = client.guilds.cache.get(
        q.guildId
    );

    if (!guild) return;

    if (!q.channelId || !q.messageId) {
        return;
    }

    const channel = guild.channels.cache.get(
        q.channelId
    );

    if (!channel || !channel.isTextBased()) {
        return;
    }

    try {
        const message =
            await channel.messages.fetch(
                q.messageId
            );

        await message.edit({
            embeds: [queueEmbed(q)],
            components: [queueButtons(q)]
        });
    } catch (error) {
        console.error(
            "❌ Erro atualizando fila:",
            error.message
        );
    }
}

async function refreshAllGuildQueues(
    guildId
) {
    for (const q of queues.values()) {
        if (q.guildId !== guildId) continue;

        await refreshQueue(q);
    }
}

async function refreshGuildLock(
    guild
) {
    const locked = isQueueLocked(guild);

    const previous =
        guildLockState.get(guild.id);

    guildLockState.set(
        guild.id,
        locked
    );

    // Nada mudou
    if (previous === locked) {
        return;
    }

    console.log(
        locked
            ? `🔒 Filas bloqueadas em ${guild.name} — nenhum ADM online.`
            : `🔓 Filas liberadas em ${guild.name} — ADM online.`
    );

    await refreshAllGuildQueues(
        guild.id
    );

    if (locked) {
        await publishMediatorQueue(guild);
    }
}

// ============================================================
// CRIAR FILAS
// ============================================================

async function createQueues(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            content:
                "❌ Você não possui permissão para criar filas.",
            ephemeral: true
        });
    }

    const format =
        interaction.options.getString(
            "formato"
        );

    const modality =
        interaction.options.getString(
            "modalidade"
        );

    const channel =
        interaction.options.getChannel(
            "canal"
        );

    if (
        !channel ||
        channel.type !== ChannelType.GuildText
    ) {
        return interaction.reply({
            content:
                "❌ Escolha um canal de texto válido.",
            ephemeral: true
        });
    }

    // Responde imediatamente.
    await interaction.deferReply({
        ephemeral: true
    });

    let count = 0;

    for (const value of VALUES) {
        const q = getQueue(
            interaction.guild.id,
            format,
            modality,
            value
        );

        q.channelId = channel.id;

        let message = null;

        if (q.messageId) {
            try {
                message =
                    await channel.messages.fetch(
                        q.messageId
                    );
            } catch {
                message = null;
            }
        }

        try {
            if (message) {
                await message.edit({
                    embeds: [queueEmbed(q)],
                    components: [
                        queueButtons(q)
                    ]
                });
            } else {
                message =
                    await channel.send({
                        embeds: [queueEmbed(q)],
                        components: [
                            queueButtons(q)
                        ]
                    });

                q.messageId =
                    message.id;
            }

            count++;
        } catch (error) {
            console.error(
                `❌ Erro fila ${value}:`,
                error.message
            );
        }
    }

    await interaction.editReply(
        `✅ **${count} filas** configuradas!\n\n` +
        `🎯 Formato: **${format}**\n` +
        `🎮 Modalidade: **${modality}**\n` +
        `👥 Cada fila possui **2 vagas**.\n\n` +
        `🔒 O sistema bloqueará automaticamente novas entradas caso não exista um administrador online.`
    );
}

// ============================================================
// ENTRAR / SAIR DA FILA
// ============================================================

async function handleQueueButton(
    interaction
) {
    // MUITO IMPORTANTE:
    // responde imediatamente ao Discord.
    await interaction.deferReply({
        ephemeral: true
    });

    try {
        const parts =
            interaction.customId.split(":");

        const action = parts[0];
        const guildId = parts[1];
        const format = parts[2];
        const modality = parts[3];
        const value = Number(parts[4]);

        if (
            !interaction.guild ||
            guildId !== interaction.guild.id
        ) {
            return interaction.editReply(
                "❌ Esta fila pertence a outro servidor."
            );
        }

        const q = getQueue(
            guildId,
            format,
            modality,
            value
        );

        const userId =
            interaction.user.id;

        // SAIR
        if (action === "queue_leave") {
            const index =
                q.players.indexOf(userId);

            if (index === -1) {
                return interaction.editReply(
                    "❌ Você não está nesta fila."
                );
            }

            q.players.splice(index, 1);
            delete q.gelo[userId];

            await refreshQueue(q);

            return interaction.editReply(
                "🚪 Você saiu da fila."
            );
        }

        // BLOQUEIO POR FALTA DE ADM
        if (
            isQueueLocked(
                interaction.guild
            )
        ) {
            return interaction.editReply(
                "🔒 **Fila bloqueada.**\n\n" +
                "No momento não há nenhum **Administrador online** para acompanhar as apostas.\n\n" +
                "🚫 Ninguém pode entrar nas filas até que um administrador fique online."
            );
        }

        let selectedGelo = null;

        if (action === "queue_normal") {
            selectedGelo = "normal";
        }

        if (action === "queue_infinito") {
            selectedGelo = "infinito";
        }

        if (action === "queue_join") {
            selectedGelo = null;
        }

        // Já está nesta fila
        if (q.players.includes(userId)) {
            if (
                format === "1x1" &&
                selectedGelo
            ) {
                q.gelo[userId] =
                    selectedGelo;

                await refreshQueue(q);

                await tryStartQueue(q);

                return interaction.editReply(
                    selectedGelo === "normal"
                        ? "🧊 Gelo Normal selecionado."
                        : "♾️ Gelo Infinito selecionado."
                );
            }

            return interaction.editReply(
                "⚠️ Você já está nesta fila."
            );
        }

        // Já está em outra fila
        const changed =
            removePlayerFromAllQueues(
                guildId,
                userId
            );

        // Fila cheia
        if (
            q.players.length >=
            QUEUE_CAPACITY
        ) {
            return interaction.editReply(
                "❌ Esta fila já está cheia."
            );
        }

        // 1x1 precisa de gelo
        if (
            format === "1x1" &&
            !selectedGelo
        ) {
            return interaction.editReply(
                "❌ Escolha **Gelo Normal** ou **Gelo Infinito**."
            );
        }

        q.players.push(userId);

        if (format === "1x1") {
            q.gelo[userId] =
                selectedGelo;
        }

        // Atualiza as filas que o jogador
        // saiu e a fila atual.
        for (const oldQueue of changed) {
            await refreshQueue(oldQueue);
        }

        await refreshQueue(q);

        // Tenta formar partida.
        await tryStartQueue(q);

        return interaction.editReply(
            format === "1x1"
                ? selectedGelo === "normal"
                    ? "✅ Você entrou na fila com **🧊 Gelo Normal**."
                    : "✅ Você entrou na fila com **♾️ Gelo Infinito**."
                : "✅ Você entrou na fila."
        );

    } catch (error) {
        console.error(
            "❌ Erro no botão da fila:",
            error
        );

        try {
            if (
                interaction.deferred ||
                interaction.replied
            ) {
                await interaction.editReply(
                    "❌ Ocorreu um erro ao processar sua entrada na fila."
                );
            } else {
                await interaction.reply({
                    content:
                        "❌ Ocorreu um erro ao processar sua entrada na fila.",
                    ephemeral: true
                });
            }
        } catch {}
    }
}

// ============================================================
// INICIAR FILA
// ============================================================

async function tryStartQueue(q) {
    if (
        q.players.length <
        QUEUE_CAPACITY
    ) {
        return;
    }

    const guild =
        client.guilds.cache.get(
            q.guildId
        );

    if (!guild) return;

    if (isQueueLocked(guild)) {
        return;
    }

    let players = [];
    let gelo = null;

    if (q.format === "1x1") {
        const normal =
            q.players.filter(
                id =>
                    q.gelo[id] ===
                    "normal"
            );

        const infinito =
            q.players.filter(
                id =>
                    q.gelo[id] ===
                    "infinito"
            );

        if (normal.length >= 2) {
            players =
                normal.slice(0, 2);

            gelo = "normal";
        } else if (
            infinito.length >= 2
        ) {
            players =
                infinito.slice(0, 2);

            gelo = "infinito";
        } else {
            return;
        }
    } else {
        players =
            q.players.slice(0, 2);
    }

    await createBetFromQueue(
        q,
        players,
        gelo
    );
}

// ============================================================
// MEDIADORES
// ============================================================

function getMediatorQueue(
    guildId
) {
    if (!mediatorQueues.has(guildId)) {
        const saved =
            getGuildRecord(
                guildId
            ).mediatorQueue;

        mediatorQueues.set(
            guildId,
            {
                users: Array.isArray(saved)
                    ? [...saved]
                    : [],
                messageId: null,
                channelId: null
            }
        );
    }

    return mediatorQueues.get(
        guildId
    );
}

function saveMediatorQueue(
    guildId
) {
    const q =
        getMediatorQueue(guildId);

    getGuildRecord(
        guildId
    ).mediatorQueue =
        [...q.users];

    saveDB();
}

function mediatorQueueEmbed(
    guildId
) {
    const guild =
        client.guilds.cache.get(
            guildId
        );

    const locked = guild
        ? isQueueLocked(guild)
        : true;

    const embed = makeEmbed(
        guildId,
        "⚖️ FILA DE MEDIADORES",
        locked
            ? "Não há administrador online no momento."
            : "Fila de atendimento dos mediadores."
    );

    if (locked) {
        embed.addFields({
            name: "🔒 MOTIVO",
            value:
                "As filas de apostas estão bloqueadas porque nenhum administrador está online.\n\n" +
                "Os mediadores podem permanecer nesta fila para organizar o atendimento.",
            inline: false
        });
    }

    if (getMediatorQueue(guildId).users.length === 0) {
        embed.addFields({
            name: "👥 Mediadores",
            value:
                "Nenhum mediador está na fila.",
            inline: false
        });
    } else {
        embed.addFields({
            name: "👥 Ordem de atendimento",
            value:
                getMediatorQueue(guildId)
                    .users
                    .map(
                        (id, index) =>
                            `**${index + 1}.** ${mentionUser(id)}`
                    )
                    .join("\n"),
            inline: false
        });
    }

    return footer(
        embed,
        "Sistema de Mediadores"
    );
}

async function publishMediatorQueue(
    guild
) {
    const cfg =
        getGuildConfig(
            guild.id
        );

    if (!cfg.mediatorChannelId) {
        return;
    }

    const channel =
        guild.channels.cache.get(
            cfg.mediatorChannelId
        );

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        return;
    }

    const q =
        getMediatorQueue(
            guild.id
        );

    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `mediator_join:${guild.id}`
                    )
                    .setLabel("Entrar")
                    .setEmoji("⚖️")
                    .setStyle(
                        ButtonStyle.Success
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `mediator_leave:${guild.id}`
                    )
                    .setLabel("Sair")
                    .setEmoji("🚪")
                    .setStyle(
                        ButtonStyle.Danger
                    )
            );

    try {
        let message = null;

        if (
            q.messageId &&
            q.channelId ===
                channel.id
        ) {
            try {
                message =
                    await channel.messages.fetch(
                        q.messageId
                    );
            } catch {}
        }

        if (message) {
            await message.edit({
                embeds: [
                    mediatorQueueEmbed(
                        guild.id
                    )
                ],
                components: [row]
            });
        } else {
            message =
                await channel.send({
                    embeds: [
                        mediatorQueueEmbed(
                            guild.id
                        )
                    ],
                    components: [row]
                });

            q.messageId =
                message.id;

            q.channelId =
                channel.id;
        }
    } catch (error) {
        console.error(
            "❌ Erro fila mediadores:",
            error.message
        );
    }
}

// ============================================================
// CRIAR APOSTA
// ============================================================

function createMatchId() {
    return (
        Date.now() +
        "-" +
        Math.random()
            .toString(36)
            .slice(2, 8)
    );
}

async function createBetFromQueue(
    q,
    selectedPlayers,
    gelo
) {
    if (
        selectedPlayers.length !== 2
    ) {
        return;
    }

    const guild =
        client.guilds.cache.get(
            q.guildId
        );

    if (!guild) return;

    if (isQueueLocked(guild)) {
        return;
    }

    let mediatorId = null;

    // Emulador usa fila de mediadores.
    if (q.modality === "Emulador") {
        const mq =
            getMediatorQueue(
                q.guildId
            );

        if (mq.users.length === 0) {
            return;
        }

        mediatorId =
            mq.users.shift();

        saveMediatorQueue(
            q.guildId
        );

        await publishMediatorQueue(
            guild
        );
    }

    for (const userId of selectedPlayers) {
        const index =
            q.players.indexOf(
                userId
            );

        if (index !== -1) {
            q.players.splice(
                index,
                1
            );
        }

        delete q.gelo[userId];
    }

    await refreshQueue(q);

    const matchId =
        createMatchId();

    const match = {
        id: matchId,
        guildId: q.guildId,

        format: q.format,
        modality: q.modality,
        value: q.value,

        gelo,

        players: [
            ...selectedPlayers
        ],

        mediatorId,

        status:
            "waiting_confirmation",

        confirmed: [],
        result: null,

        roomId: null,
        password: null,

        channelId: null,

        createdAt: Date.now()
    };

    matches.set(
        matchId,
        match
    );

    try {
        await createPrivateBetChannel(
            guild,
            match
        );
    } catch (error) {
        console.error(
            "❌ Erro criando aposta:",
            error
        );

        for (const userId of selectedPlayers) {
            if (
                !q.players.includes(
                    userId
                )
            ) {
                q.players.push(
                    userId
                );
            }
        }

        matches.delete(matchId);

        if (mediatorId) {
            const mq =
                getMediatorQueue(
                    q.guildId
                );

            if (
                !mq.users.includes(
                    mediatorId
                )
            ) {
                mq.users.unshift(
                    mediatorId
                );
            }

            saveMediatorQueue(
                q.guildId
            );

            await publishMediatorQueue(
                guild
            );
        }

        await refreshQueue(q);
    }
}

// ============================================================
// CANAL PRIVADO
// ============================================================

function getMatchChannelName(
    match
) {
    return `aposta-${match.id.slice(-6)}`;
}

function betEmbed(match) {
    const gelo =
        match.gelo === "normal"
            ? "🧊 Gelo Normal"
            : match.gelo === "infinito"
                ? "♾️ Gelo Infinito"
                : "Não definido";

    const embed = makeEmbed(
        match.guildId,
        "💰 APOSTA",
        "Confirme sua participação para continuar."
    );

    embed.addFields(
        {
            name: "🎯 Partida",
            value:
                `${match.format} • ${match.modality}\n` +
                `${gelo}`,
            inline: true
        },
        {
            name: "💵 Valor",
            value:
                money(match.value),
            inline: true
        },
        {
            name: "👥 Jogadores",
            value:
                match.players
                    .map(
                        mentionUser
                    )
                    .join("\n"),
            inline: false
        },
        {
            name: "📋 Status",
            value:
                match.status ===
                "waiting_confirmation"
                    ? "🟡 Confirmação"
                    : match.status ===
                        "waiting_payment"
                        ? "🟠 Pagamento"
                        : match.status ===
                            "room_ready"
                            ? "🟢 Sala"
                            : match.status ===
                                "finished"
                                ? "🏆 Finalizada"
                                : "🔵 Em andamento",
            inline: false
        }
    );

    if (match.mediatorId) {
        embed.addFields({
            name: "⚖️ Mediador",
            value:
                mentionUser(
                    match.mediatorId
                ),
            inline: true
        });
    }

    return footer(
        embed,
        "Sistema de Apostas"
    );
}

async function createPrivateBetChannel(
    guild,
    match
) {
    const cfg =
        getGuildConfig(
            guild.id
        );

    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [
                PermissionFlagsBits.ViewChannel
            ]
        }
    ];

    for (const playerId of match.players) {
        overwrites.push({
            id: playerId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
            ]
        });
    }

    if (match.mediatorId) {
        overwrites.push({
            id: match.mediatorId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
            ]
        });
    }

    if (cfg.analystRoleId) {
        overwrites.push({
            id: cfg.analystRoleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.ReadMessageHistory
            ]
        });
    }

    const channel =
        await guild.channels.create({
            name:
                getMatchChannelName(
                    match
                ),
            type:
                ChannelType.GuildText,
            parent:
                cfg.betsCategoryId ||
                undefined,
            permissionOverwrites:
                overwrites
        });

    match.channelId =
        channel.id;

    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `bet_confirm:${match.id}`
                    )
                    .setLabel(
                        "Confirmar"
                    )
                    .setEmoji("✅")
                    .setStyle(
                        ButtonStyle.Success
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `bet_cancel:${match.id}`
                    )
                    .setLabel(
                        "Cancelar"
                    )
                    .setEmoji("❌")
                    .setStyle(
                        ButtonStyle.Danger
                    )
            );

    await channel.send({
        content:
            match.players
                .map(
                    mentionUser
                )
                .join(" "),
        embeds: [
            betEmbed(match)
        ],
        components: [row]
    });
}

// ============================================================
// PIX
// ============================================================

function pixEmbed(match) {
    const cfg =
        getGuildConfig(
            match.guildId
        );

    const embed = makeEmbed(
        match.guildId,
        "💳 PAGAMENTO",
        "Realize o pagamento e aguarde a liberação da sala."
    );

    embed.addFields(
        {
            name: "💰 Valor",
            value:
                money(match.value),
            inline: true
        },
        {
            name: "👤 Recebedor",
            value:
                cfg.pixName ||
                "Não configurado",
            inline: true
        },
        {
            name: "🔑 Chave Pix",
            value:
                cfg.pixKey ||
                "Não configurada",
            inline: false
        }
    );

    if (cfg.pixQrCode) {
        embed.setImage(
            cfg.pixQrCode
        );
    }

    return footer(
        embed,
        "Pagamento via Pix"
    );
}

// ============================================================
// CONFIRMAÇÃO
// ============================================================

async function confirmBet(
    interaction,
    match
) {
    if (
        !match.players.includes(
            interaction.user.id
        )
    ) {
        return interaction.reply({
            content:
                "❌ Você não participa desta aposta.",
            ephemeral: true
        });
    }

    if (
        match.status !==
        "waiting_confirmation"
    ) {
        return interaction.reply({
            content:
                "⚠️ Esta etapa já foi concluída.",
            ephemeral: true
        });
    }

    if (
        !match.confirmed.includes(
            interaction.user.id
        )
    ) {
        match.confirmed.push(
            interaction.user.id
        );
    }

    if (
        match.confirmed.length <
        match.players.length
    ) {
        return interaction.reply({
            content:
                `✅ Confirmação registrada. ${match.confirmed.length}/${match.players.length}.`,
            ephemeral: true
        });
    }

    match.status =
        "waiting_payment";

    await interaction.reply({
        content:
            "✅ Todos confirmaram! Aguardando pagamento.",
        ephemeral: true
    });

    if (interaction.channel) {
        await interaction.channel.send({
            embeds: [
                pixEmbed(match)
            ]
        });
    }

    startRoomTimer(match);
}

// ============================================================
// TIMER DA SALA
// ============================================================

function startRoomTimer(match) {
    if (
        roomTimers.has(
            match.id
        )
    ) {
        clearTimeout(
            roomTimers.get(
                match.id
            )
        );
    }

    const delay =
        3 * 60 * 1000 +
        Math.floor(
            Math.random() *
            (2 * 60 * 1000)
        );

    const timer =
        setTimeout(
            async () => {
                try {
                    if (
                        !matches.has(
                            match.id
                        )
                    ) {
                        return;
                    }

                    if (
                        match.status !==
                        "waiting_payment"
                    ) {
                        return;
                    }

                    match.status =
                        "room_ready";

                    const guild =
                        client.guilds.cache.get(
                            match.guildId
                        );

                    if (!guild) return;

                    const channel =
                        guild.channels.cache.get(
                            match.channelId
                        );

                    if (!channel) {
                        return;
                    }

                    const embed =
                        makeEmbed(
                            match.guildId,
                            "🎮 SALA LIBERADA",
                            "O mediador já pode enviar os dados da sala."
                        );

                    await channel.send({
                        embeds: [embed]
                    });
                } catch (error) {
                    console.error(
                        "❌ Erro timer:",
                        error
                    );
                }
            },
            delay
        );

    roomTimers.set(
        match.id,
        timer
    );
}

// ============================================================
// MEDIADOR
// ============================================================

function canManageMatch(
    member,
    match
) {
    if (!isMediator(member)) {
        return false;
    }

    if (
        match.mediatorId &&
        match.mediatorId !==
            member.id
    ) {
        return false;
    }

    return true;
}

// ============================================================
// SALA
// ============================================================

async function sendRoom(
    match,
    roomId,
    password
) {
    const guild =
        client.guilds.cache.get(
            match.guildId
        );

    if (!guild) return;

    const channel =
        guild.channels.cache.get(
            match.channelId
        );

    if (!channel) return;

    match.roomId =
        roomId;

    match.password =
        password;

    match.status =
        "room_ready";

    const embed =
        makeEmbed(
            match.guildId,
            "🎮 SALA DA PARTIDA",
            "Entrem na sala utilizando os dados abaixo."
        );

    embed.addFields(
        {
            name: "🆔 ID DA SALA",
            value:
                `\`${roomId}\``,
            inline: true
        },
        {
            name: "🔐 SENHA",
            value:
                `\`${password}\``,
            inline: true
        },
        {
            name: "🎯 Partida",
            value:
                `${match.format} • ${match.modality}\n` +
                `💰 ${money(match.value)}`,
            inline: false
        }
    );

    await channel.send({
        embeds: [embed]
    });
}

function extractRoomData(text) {
    const idMatch =
        text.match(
            /(?:id\s*(?:da\s*sala)?\s*[:\-]?\s*)(\d{4,12})/i
        );

    const passwordMatch =
        text.match(
            /(?:senha|pass|password)\s*[:\-]?\s*([A-Za-z0-9]{2,20})/i
        );

    if (
        idMatch &&
        passwordMatch
    ) {
        return {
            roomId:
                idMatch[1],
            password:
                passwordMatch[1]
        };
    }

    const numbers =
        text.match(
            /\b\d{4,12}\b/g
        );

    if (
        numbers &&
        numbers.length >= 2
    ) {
        return {
            roomId:
                numbers[0],
            password:
                numbers[1]
        };
    }

    return null;
}

// ============================================================
// RESULTADO
// ============================================================

function mediatorPanelEmbed(
    match
) {
    const embed =
        makeEmbed(
            match.guildId,
            "⚖️ PAINEL DO MEDIADOR",
            "Gerencie a partida abaixo."
        );

    embed.addFields(
        {
            name: "🎯 Partida",
            value:
                `${match.format} • ${match.modality}\n` +
                `💰 ${money(match.value)}`,
            inline: true
        },
        {
            name: "👥 Jogadores",
            value:
                match.players
                    .map(
                        mentionUser
                    )
                    .join("\n"),
            inline: true
        }
    );

    if (match.result) {
        embed.addFields({
            name:
                "🏆 Resultado",
            value:
                mentionUser(
                    match.result
                        .winnerId
                ),
            inline: false
        });
    }

    return footer(
        embed,
        "Painel do Mediador"
    );
}

function winnerMenu(match) {
    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(
                    `winner_select:${match.id}`
                )
                .setPlaceholder(
                    "🏆 Selecionar vencedor"
                )
                .addOptions(
                    match.players.map(
                        (id, index) =>
                            new StringSelectMenuOptionBuilder()
                                .setLabel(
                                    `Jogador ${index + 1}`
                                )
                                .setDescription(
                                    `Vencedor: ${id}`
                                )
                                .setValue(id)
                    )
                )
        );
}

function woMenu(match) {
    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(
                    `wo_select:${match.id}`
                )
                .setPlaceholder(
                    "🚫 Vitória por W.O."
                )
                .addOptions(
                    match.players.map(
                        (id, index) =>
                            new StringSelectMenuOptionBuilder()
                                .setLabel(
                                    `Jogador ${index + 1}`
                                )
                                .setDescription(
                                    `W.O.: ${id}`
                                )
                                .setValue(id)
                    )
                )
        );
}

async function registerNormalVictory(
    match,
    winnerId
) {
    if (match.result) return;

    match.result = {
        type: "normal",
        winnerId
    };

    match.status =
        "finished";

    addWin(winnerId);

    for (const playerId of match.players) {
        if (
            playerId !==
            winnerId
        ) {
            addLoss(playerId);
        }
    }

    const guild =
        client.guilds.cache.get(
            match.guildId
        );

    if (!guild) return;

    const channel =
        guild.channels.cache.get(
            match.channelId
        );

    if (!channel) return;

    await channel.send({
        embeds: [
            makeEmbed(
                match.guildId,
                "🏆 PARTIDA FINALIZADA",
                `Vencedor: ${mentionUser(winnerId)}`
            )
        ]
    });
}

async function registerWOVictory(
    match,
    winnerId
) {
    if (match.result) return;

    match.result = {
        type: "wo",
        winnerId
    };

    match.status =
        "finished";

    addWOWin(winnerId);
    addWin(winnerId);

    for (const playerId of match.players) {
        if (
            playerId !==
            winnerId
        ) {
            addLoss(playerId);
        }
    }

    const guild =
        client.guilds.cache.get(
            match.guildId
        );

    if (!guild) return;

    const channel =
        guild.channels.cache.get(
            match.channelId
        );

    if (!channel) return;

    await channel.send({
        embeds: [
            makeEmbed(
                match.guildId,
                "🚫 VITÓRIA POR W.O.",
                `Vencedor: ${mentionUser(winnerId)}`
            )
        ]
    });
}

// ============================================================
// ESTATÍSTICAS
// ============================================================

function statsEmbed(
    guildId,
    userId
) {
    const stats =
        getUserStats(
            userId
        );

    const total =
        Number(stats.wins || 0) +
        Number(stats.losses || 0);

    const percentage =
        total > 0
            ? (
                (stats.wins /
                    total) *
                100
            ).toFixed(1)
            : "0.0";

    const embed =
        makeEmbed(
            guildId,
            "📊 ESTATÍSTICAS",
            `Perfil de ${mentionUser(userId)}`
        );

    embed.addFields(
        {
            name: "🏆 Vitórias",
            value:
                String(
                    stats.wins || 0
                ),
            inline: true
        },
        {
            name: "💀 Derrotas",
            value:
                String(
                    stats.losses || 0
                ),
            inline: true
        },
        {
            name: "📈 Aproveitamento",
            value:
                `${percentage}%`,
            inline: true
        },
        {
            name: "🚫 W.O.",
            value:
                String(
                    stats.woVictories ||
                    0
                ),
            inline: true
        },
        {
            name: "🪙 Moedas",
            value:
                String(
                    stats.coins || 0
                ),
            inline: true
        }
    );

    return footer(
        embed,
        "Estatísticas do jogador"
    );
}

// ============================================================
// CONFIGURAÇÃO
// ============================================================

function configMainEmbed(
    guild
) {
    const cfg =
        getGuildConfig(
            guild.id
        );

    const embed =
        makeEmbed(
            guild.id,
            "⚙️ CONFIGURAÇÃO",
            "Configure cargos, canais, Pix, taxa e aparência."
        );

    embed.addFields(
        {
            name: "👑 Cargos",
            value:
                `ADM: ${
                    cfg.adminRoleId
                        ? `<@&${cfg.adminRoleId}>`
                        : "❌"
                }\n` +
                `Mediador: ${
                    cfg.mediatorRoleId
                        ? `<@&${cfg.mediatorRoleId}>`
                        : "❌"
                }\n` +
                `Analista: ${
                    cfg.analystRoleId
                        ? `<@&${cfg.analystRoleId}>`
                        : "❌"
                }`,
            inline: true
        },
        {
            name: "📢 Canais",
            value:
                `Mobile: ${
                    cfg.mobileChannelId
                        ? `<#${cfg.mobileChannelId}>`
                        : "❌"
                }\n` +
                `Emulador: ${
                    cfg.emulatorChannelId
                        ? `<#${cfg.emulatorChannelId}>`
                        : "❌"
                }\n` +
                `Mediadores: ${
                    cfg.mediatorChannelId
                        ? `<#${cfg.mediatorChannelId}>`
                        : "❌"
                }`,
            inline: true
        },
        {
            name: "💰 Financeiro",
            value:
                `Taxa: ${money(cfg.fee)}\n` +
                `Pix: ${
                    cfg.pixKey
                        ? "✅ Configurado"
                        : "❌ Não configurado"
                }`,
            inline: true
        }
    );

    return footer(
        embed,
        "Painel de Configuração"
    );
}

function configRows(guildId) {
    return [
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `config_roles:${guildId}`
                    )
                    .setLabel("Cargos")
                    .setEmoji("👑")
                    .setStyle(
                        ButtonStyle.Primary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `config_channels:${guildId}`
                    )
                    .setLabel("Canais")
                    .setEmoji("📢")
                    .setStyle(
                        ButtonStyle.Primary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `config_pix:${guildId}`
                    )
                    .setLabel("Pix")
                    .setEmoji("💳")
                    .setStyle(
                        ButtonStyle.Success
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `config_fee:${guildId}`
                    )
                    .setLabel("Taxa")
                    .setEmoji("💰")
                    .setStyle(
                        ButtonStyle.Secondary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `config_appearance:${guildId}`
                    )
                    .setLabel("Visual")
                    .setEmoji("🎨")
                    .setStyle(
                        ButtonStyle.Secondary
                    )
            )
    ];
}

// ============================================================
// CONFIGURAÇÃO DE CARGOS
// ============================================================

async function showRoleConfig(
    interaction
) {
    const guildId =
        interaction.guild.id;

    const embed =
        makeEmbed(
            guildId,
            "👑 CARGOS",
            "Selecione cada cargo abaixo."
        );

    const row1 =
        new ActionRowBuilder()
            .addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId(
                        `role_mediator:${guildId}`
                    )
                    .setPlaceholder(
                        "⚖️ Cargo de Mediador"
                    )
                    .setMinValues(1)
                    .setMaxValues(1)
            );

    const row2 =
        new ActionRowBuilder()
            .addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId(
                        `role_analyst:${guildId}`
                    )
                    .setPlaceholder(
                        "🔎 Cargo de Analista"
                    )
                    .setMinValues(1)
                    .setMaxValues(1)
            );

    const row3 =
        new ActionRowBuilder()
            .addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId(
                        `role_admin:${guildId}`
                    )
                    .setPlaceholder(
                        "👑 Cargo de Administrador"
                    )
                    .setMinValues(1)
                    .setMaxValues(1)
            );

    return interaction.reply({
        embeds: [embed],
        components: [
            row1,
            row2,
            row3
        ],
        ephemeral: true
    });
}

// ============================================================
// CONFIGURAÇÃO DE CANAIS
// ============================================================

async function showChannelConfig(
    interaction
) {
    const guildId =
        interaction.guild.id;

    const embed =
        makeEmbed(
            guildId,
            "📢 CANAIS",
            "Selecione os canais utilizados pelo sistema."
        );

    const mobile =
        new ActionRowBuilder()
            .addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId(
                        `channel_mobile:${guildId}`
                    )
                    .setPlaceholder(
                        "📱 Canal Mobile"
                    )
                    .setChannelTypes(
                        ChannelType.GuildText
                    )
            );

    const emulator =
        new ActionRowBuilder()
            .addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId(
                        `channel_emulator:${guildId}`
                    )
                    .setPlaceholder(
                        "💻 Canal Emulador"
                    )
                    .setChannelTypes(
                        ChannelType.GuildText
                    )
            );

    const mediator =
        new ActionRowBuilder()
            .addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId(
                        `channel_mediator:${guildId}`
                    )
                    .setPlaceholder(
                        "⚖️ Canal Mediadores"
                    )
                    .setChannelTypes(
                        ChannelType.GuildText
                    )
            );

    const category =
        new ActionRowBuilder()
            .addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId(
                        `channel_category:${guildId}`
                    )
                    .setPlaceholder(
                        "📁 Categoria das Apostas"
                    )
                    .setChannelTypes(
                        ChannelType.GuildCategory
                    )
            );

    return interaction.reply({
        embeds: [embed],
        components: [
            mobile,
            emulator,
            mediator,
            category
        ],
        ephemeral: true
    });
}

// ============================================================
// MODAIS
// ============================================================

async function showPixModal(
    interaction
) {
    const cfg =
        getGuildConfig(
            interaction.guild.id
        );

    const modal =
        new ModalBuilder()
            .setCustomId(
                `modal_pix:${interaction.guild.id}`
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
                "Nome do recebedor"
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(false)
            .setValue(
                cfg.pixName || ""
            );

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
            .setRequired(false)
            .setValue(
                cfg.pixKey || ""
            );

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
            .setRequired(false)
            .setValue(
                cfg.pixQrCode || ""
            );

    modal.addComponents(
        new ActionRowBuilder()
            .addComponents(name),
        new ActionRowBuilder()
            .addComponents(key),
        new ActionRowBuilder()
            .addComponents(qr)
    );

    return interaction.showModal(
        modal
    );
}

async function showFeeModal(
    interaction
) {
    const cfg =
        getGuildConfig(
            interaction.guild.id
        );

    const modal =
        new ModalBuilder()
            .setCustomId(
                `modal_fee:${interaction.guild.id}`
            )
            .setTitle(
                "💰 Configurar Taxa"
            );

    const fee =
        new TextInputBuilder()
            .setCustomId("fee")
            .setLabel("Taxa")
            .setPlaceholder(
                "Ex: 0,01"
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(true)
            .setValue(
                String(cfg.fee)
            );

    modal.addComponents(
        new ActionRowBuilder()
            .addComponents(fee)
    );

    return interaction.showModal(
        modal
    );
}

async function showAppearanceModal(
    interaction
) {
    const cfg =
        getGuildConfig(
            interaction.guild.id
        );

    const modal =
        new ModalBuilder()
            .setCustomId(
                `modal_appearance:${interaction.guild.id}`
            )
            .setTitle(
                "🎨 Aparência"
            );

    const color =
        new TextInputBuilder()
            .setCustomId("color")
            .setLabel(
                "Cor hexadecimal"
            )
            .setPlaceholder(
                "#5865F2"
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(false)
            .setValue(
                cfg.embedColor ||
                "#5865F2"
            );

    const picture =
        new TextInputBuilder()
            .setCustomId(
                "picture"
            )
            .setLabel(
                "URL da imagem"
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(false)
            .setValue(
                cfg.profilePicture ||
                ""
            );

    modal.addComponents(
        new ActionRowBuilder()
            .addComponents(
                color
            ),
        new ActionRowBuilder()
            .addComponents(
                picture
            )
    );

    return interaction.showModal(
        modal
    );
}

// ============================================================
// BOTÕES DOS MEDIADORES
// ============================================================

async function handleMediatorButton(
    interaction
) {
    await interaction.deferReply({
        ephemeral: true
    });

    try {
        const parts =
            interaction.customId.split(":");

        const action =
            parts[0];

        const guildId =
            parts[1];

        if (
            !interaction.guild ||
            guildId !==
                interaction.guild.id
        ) {
            return interaction.editReply(
                "❌ Servidor inválido."
            );
        }

        if (
            !isMediator(
                interaction.member
            )
        ) {
            return interaction.editReply(
                "❌ Você não possui o cargo de mediador."
            );
        }

        const q =
            getMediatorQueue(
                guildId
            );

        if (
            action ===
            "mediator_join"
        ) {
            if (
                q.users.includes(
                    interaction.user.id
                )
            ) {
                return interaction.editReply(
                    "⚠️ Você já está na fila de mediadores."
                );
            }

            q.users.push(
                interaction.user.id
            );

            saveMediatorQueue(
                guildId
            );

            await publishMediatorQueue(
                interaction.guild
            );

            return interaction.editReply(
                "⚖️ Você entrou na fila de mediadores."
            );
        }

        if (
            action ===
            "mediator_leave"
        ) {
            const index =
                q.users.indexOf(
                    interaction.user.id
                );

            if (index === -1) {
                return interaction.editReply(
                    "❌ Você não está na fila de mediadores."
                );
            }

            q.users.splice(
                index,
                1
            );

            saveMediatorQueue(
                guildId
            );

            await publishMediatorQueue(
                interaction.guild
            );

            return interaction.editReply(
                "🚪 Você saiu da fila de mediadores."
            );
        }
    } catch (error) {
        console.error(
            "❌ Erro mediador:",
            error
        );

        return interaction.editReply(
            "❌ Ocorreu um erro."
        );
    }
}

// ============================================================
// BOTÕES DAS APOSTAS
// ============================================================

async function handleBetButton(
    interaction
) {
    const parts =
        interaction.customId.split(":");

    const action =
        parts[0];

    const matchId =
        parts[1];

    const match =
        matches.get(matchId);

    if (!match) {
        return interaction.reply({
            content:
                "❌ Esta aposta não existe mais.",
            ephemeral: true
        });
    }

    if (
        action ===
        "bet_confirm"
    ) {
        return confirmBet(
            interaction,
            match
        );
    }

    if (
        action ===
        "bet_cancel"
    ) {
        if (
            !match.players.includes(
                interaction.user.id
            )
        ) {
            return interaction.reply({
                content:
                    "❌ Você não participa desta aposta.",
                ephemeral: true
            });
        }

        match.status =
            "cancelled";

        if (
            roomTimers.has(
                match.id
            )
        ) {
            clearTimeout(
                roomTimers.get(
                    match.id
                )
            );

            roomTimers.delete(
                match.id
            );
        }

        await interaction.reply({
            content:
                "❌ A aposta foi cancelada.",
            ephemeral: true
        });

        if (interaction.channel) {
            await interaction.channel.send({
                embeds: [
                    makeEmbed(
                        match.guildId,
                        "❌ APOSTA CANCELADA",
                        `Cancelada por ${mentionUser(interaction.user.id)}.`
                    )
                ]
            });
        }

        return;
    }

    if (
        action ===
        "copy_room"
    ) {
        if (
            !match.roomId ||
            !match.password
        ) {
            return interaction.reply({
                content:
                    "❌ A sala ainda não foi configurada.",
                ephemeral: true
            });
        }

        return interaction.reply({
            content:
                `🆔 ID: \`${match.roomId}\`\n` +
                `🔐 Senha: \`${match.password}\``,
            ephemeral: true
        });
    }
}

// ============================================================
// PAINEL DO MEDIADOR
// ============================================================

async function handleMediatorPanelButton(
    interaction
) {
    const parts =
        interaction.customId.split(":");

    const action =
        parts[0];

    const match =
        matches.get(
            parts[1]
        );

    if (!match) {
        return interaction.reply({
            content:
                "❌ Partida não encontrada.",
            ephemeral: true
        });
    }

    if (
        !canManageMatch(
            interaction.member,
            match
        )
    ) {
        return interaction.reply({
            content:
                "❌ Você não pode administrar esta partida.",
            ephemeral: true
        });
    }

    if (
        action ===
        "med_room"
    ) {
        const modal =
            new ModalBuilder()
                .setCustomId(
                    `modal_room:${match.id}`
                )
                .setTitle(
                    "🎮 Dados da Sala"
                );

        const id =
            new TextInputBuilder()
                .setCustomId(
                    "room_id"
                )
                .setLabel(
                    "ID da Sala"
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
                    "Senha da Sala"
                )
                .setStyle(
                    TextInputStyle.Short
                )
                .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder()
                .addComponents(id),
            new ActionRowBuilder()
                .addComponents(
                    password
                )
        );

        return interaction.showModal(
            modal
        );
    }

    if (
        action ===
        "med_finish"
    ) {
        return interaction.reply({
            content:
                match.result
                    ? "🏆 Resultado já registrado."
                    : "❌ Selecione o vencedor primeiro.",
            ephemeral: true
        });
    }
}

// ============================================================
// SELECTS
// ============================================================

async function handleSelect(
    interaction
) {
    const parts =
        interaction.customId.split(":");

    const type =
        parts[0];

    // Vencedor
    if (
        type ===
        "winner_select"
    ) {
        const match =
            matches.get(
                parts[1]
            );

        if (!match) {
            return interaction.reply({
                content:
                    "❌ Partida não encontrada.",
                ephemeral: true
            });
        }

        if (
            !canManageMatch(
                interaction.member,
                match
            )
        ) {
            return interaction.reply({
                content:
                    "❌ Você não pode administrar esta partida.",
                ephemeral: true
            });
        }

        await registerNormalVictory(
            match,
            interaction.values[0]
        );

        return interaction.reply({
            content:
                "🏆 Vencedor registrado.",
            ephemeral: true
        });
    }

    // W.O.
    if (
        type ===
        "wo_select"
    ) {
        const match =
            matches.get(
                parts[1]
            );

        if (!match) {
            return interaction.reply({
                content:
                    "❌ Partida não encontrada.",
                ephemeral: true
            });
        }

        if (
            !canManageMatch(
                interaction.member,
                match
            )
        ) {
            return interaction.reply({
                content:
                    "❌ Você não pode administrar esta partida.",
                ephemeral: true
            });
        }

        await registerWOVictory(
            match,
            interaction.values[0]
        );

        return interaction.reply({
            content:
                "🚫 W.O. registrado.",
            ephemeral: true
        });
    }

    // Cargos
    if (
        type.startsWith(
            "role_"
        )
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

        const cfg =
            getGuildConfig(
                interaction.guild.id
            );

        const roleId =
            interaction.values[0];

        if (
            type ===
            "role_mediator"
        ) {
            cfg.mediatorRoleId =
                roleId;
        }

        if (
            type ===
            "role_analyst"
        ) {
            cfg.analystRoleId =
                roleId;
        }

        if (
            type ===
            "role_admin"
        ) {
            cfg.adminRoleId =
                roleId;
        }

        saveDB();

        return interaction.reply({
            content:
                "✅ Cargo atualizado.",
            ephemeral: true
        });
    }

    // Canais
    if (
        type.startsWith(
            "channel_"
        )
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

        const cfg =
            getGuildConfig(
                interaction.guild.id
            );

        const channelId =
            interaction.values[0];

        if (
            type ===
            "channel_mobile"
        ) {
            cfg.mobileChannelId =
                channelId;
        }

        if (
            type ===
            "channel_emulator"
        ) {
            cfg.emulatorChannelId =
                channelId;
        }

        if (
            type ===
            "channel_mediator"
        ) {
            cfg.mediatorChannelId =
                channelId;
        }

        if (
            type ===
            "channel_category"
        ) {
            cfg.betsCategoryId =
                channelId;
        }

        saveDB();

        await publishMediatorQueue(
            interaction.guild
        );

        return interaction.reply({
            content:
                "✅ Canal atualizado.",
            ephemeral: true
        });
    }
}

// ============================================================
// MODAIS
// ============================================================

async function handleModal(
    interaction
) {
    const type =
        interaction.customId.split(":")[0];

    // Sala é tratada separadamente
    if (
        type ===
        "modal_room"
    ) {
        const match =
            matches.get(
                interaction.customId.split(":")[1]
            );

        if (!match) {
            return interaction.reply({
                content:
                    "❌ Partida não encontrada.",
                ephemeral: true
            });
        }

        if (
            !canManageMatch(
                interaction.member,
                match
            )
        ) {
            return interaction.reply({
                content:
                    "❌ Você não pode administrar esta partida.",
                ephemeral: true
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

        await sendRoom(
            match,
            roomId,
            password
        );

        return interaction.reply({
            content:
                "🎮 Sala enviada.",
            ephemeral: true
        });
    }

    if (
        !isAdmin(
            interaction.member
        )
    ) {
        return interaction.reply({
            content:
                "❌ Você não possui permissão.",
            ephemeral: true
        });
    }

    const cfg =
        getGuildConfig(
            interaction.guild.id
        );

    if (
        type ===
        "modal_pix"
    ) {
        cfg.pixName =
            interaction.fields.getTextInputValue(
                "pix_name"
            );

        cfg.pixKey =
            interaction.fields.getTextInputValue(
                "pix_key"
            );

        cfg.pixQrCode =
            interaction.fields.getTextInputValue(
                "pix_qr"
            );

        saveDB();

        return interaction.reply({
            content:
                "✅ Pix atualizado.",
            ephemeral: true
        });
    }

    if (
        type ===
        "modal_fee"
    ) {
        const value =
            parseMoney(
                interaction.fields.getTextInputValue(
                    "fee"
                )
            );

        if (
            value === null ||
            value < 0
        ) {
            return interaction.reply({
                content:
                    "❌ Valor inválido.",
                ephemeral: true
            });
        }

        cfg.fee =
            value;

        saveDB();

        return interaction.reply({
            content:
                `✅ Taxa definida para ${money(value)}.`,
            ephemeral: true
        });
    }

    if (
        type ===
        "modal_appearance"
    ) {
        const color =
            interaction.fields.getTextInputValue(
                "color"
            );

        const picture =
            interaction.fields.getTextInputValue(
                "picture"
            );

        if (
            color &&
            !/^#[0-9A-Fa-f]{6}$/.test(
                color
            )
        ) {
            return interaction.reply({
                content:
                    "❌ Cor inválida. Exemplo: `#5865F2`.",
                ephemeral: true
            });
        }

        cfg.embedColor =
            color ||
            "#5865F2";

        cfg.profilePicture =
            picture || "";

        saveDB();

        return interaction.reply({
            content:
                "✅ Aparência atualizada.",
            ephemeral: true
        });
    }
}

// ============================================================
// COMANDOS
// ============================================================

const commands = [
    new SlashCommandBuilder()
        .setName("fila")
        .setDescription(
            "Criar filas de apostas"
        )
        .addStringOption(
            option =>
                option
                    .setName(
                        "formato"
                    )
                    .setDescription(
                        "Formato"
                    )
                    .setRequired(
                        true
                    )
                    .addChoices(
                        {
                            name: "1x1",
                            value: "1x1"
                        },
                        {
                            name: "2x2",
                            value: "2x2"
                        },
                        {
                            name: "3x3",
                            value: "3x3"
                        },
                        {
                            name: "4x4",
                            value: "4x4"
                        }
                    )
        )
        .addStringOption(
            option =>
                option
                    .setName(
                        "modalidade"
                    )
                    .setDescription(
                        "Modalidade"
                    )
                    .setRequired(
                        true
                    )
                    .addChoices(
                        {
                            name:
                                "📱 Mobile",
                            value:
                                "Mobile"
                        },
                        {
                            name:
                                "💻 Emulador",
                            value:
                                "Emulador"
                        },
                        {
                            name:
                                "🎮 Misto",
                            value:
                                "Misto"
                        }
                    )
        )
        .addChannelOption(
            option =>
                option
                    .setName(
                        "canal"
                    )
                    .setDescription(
                        "Canal das filas"
                    )
                    .addChannelTypes(
                        ChannelType.GuildText
                    )
                    .setRequired(
                        true
                    )
        ),

    new SlashCommandBuilder()
        .setName("config")
        .setDescription(
            "Abrir configuração"
        ),

    new SlashCommandBuilder()
        .setName("p")
        .setDescription(
            "Ver estatísticas"
        )
        .addUserOption(
            option =>
                option
                    .setName(
                        "usuario"
                    )
                    .setDescription(
                        "Jogador"
                    )
                    .setRequired(
                        false
                    )
        ),

    new SlashCommandBuilder()
        .setName("med")
        .setDescription(
            "Abrir painel do mediador"
        )
];

// ============================================================
// REGISTRO
// ============================================================

async function registerCommands(
    guild
) {
    try {
        await guild.commands.set(
            commands.map(
                command =>
                    command.toJSON()
            )
        );

        console.log(
            `✅ Comandos registrados: ${guild.name}`
        );
    } catch (error) {
        console.error(
            `❌ Erro comandos ${guild.name}:`,
            error.message
        );
    }
}

// ============================================================
// INTERAÇÕES
// ============================================================

client.on(
    Events.InteractionCreate,
    async interaction => {
        try {
            // ================================
            // SLASH
            // ================================

            if (
                interaction.isChatInputCommand()
            ) {
                if (
                    interaction.commandName ===
                    "fila"
                ) {
                    return createQueues(
                        interaction
                    );
                }

                if (
                    interaction.commandName ===
                    "config"
                ) {
                    if (
                        !isAdmin(
                            interaction.member
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Você não possui permissão.",
                            ephemeral: true
                        });
                    }

                    return interaction.reply({
                        embeds: [
                            configMainEmbed(
                                interaction.guild
                            )
                        ],
                        components:
                            configRows(
                                interaction.guild.id
                            ),
                        ephemeral: true
                    });
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

                    return interaction.reply({
                        embeds: [
                            statsEmbed(
                                interaction.guild.id,
                                user.id
                            )
                        ]
                    });
                }

                if (
                    interaction.commandName ===
                    "med"
                ) {
                    if (
                        !isMediator(
                            interaction.member
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Você não é mediador.",
                            ephemeral: true
                        });
                    }

                    const match =
                        [...matches.values()]
                            .find(
                                m =>
                                    m.channelId ===
                                        interaction.channel.id &&
                                    m.status !==
                                        "finished" &&
                                    m.status !==
                                        "cancelled"
                            );

                    if (!match) {
                        return interaction.reply({
                            content:
                                "❌ Não existe uma partida ativa neste canal.",
                            ephemeral: true
                        });
                    }

                    if (
                        !canManageMatch(
                            interaction.member,
                            match
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Esta partida está atribuída a outro mediador.",
                            ephemeral: true
                        });
                    }

                    const row =
                        new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(
                                        `med_room:${match.id}`
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
                                        `med_finish:${match.id}`
                                    )
                                    .setLabel(
                                        "Finalizar"
                                    )
                                    .setEmoji("🏆")
                                    .setStyle(
                                        ButtonStyle.Success
                                    )
                            );

                    return interaction.reply({
                        embeds: [
                            mediatorPanelEmbed(
                                match
                            )
                        ],
                        components: [
                            row,
                            winnerMenu(
                                match
                            ),
                            woMenu(
                                match
                            )
                        ]
                    });
                }
            }

            // ================================
            // BOTÕES
            // ================================

            if (
                interaction.isButton()
            ) {
                const id =
                    interaction.customId;

                if (
                    id.startsWith(
                        "queue_normal:"
                    ) ||
                    id.startsWith(
                        "queue_infinito:"
                    ) ||
                    id.startsWith(
                        "queue_join:"
                    ) ||
                    id.startsWith(
                        "queue_leave:"
                    )
                ) {
                    return handleQueueButton(
                        interaction
                    );
                }

                if (
                    id.startsWith(
                        "mediator_join:"
                    ) ||
                    id.startsWith(
                        "mediator_leave:"
                    )
                ) {
                    return handleMediatorButton(
                        interaction
                    );
                }

                if (
                    id.startsWith(
                        "bet_confirm:"
                    ) ||
                    id.startsWith(
                        "bet_cancel:"
                    ) ||
                    id.startsWith(
                        "copy_room:"
                    )
                ) {
                    return handleBetButton(
                        interaction
                    );
                }

                if (
                    id.startsWith(
                        "med_room:"
                    ) ||
                    id.startsWith(
                        "med_finish:"
                    )
                ) {
                    return handleMediatorPanelButton(
                        interaction
                    );
                }

                if (
                    id.startsWith(
                        "config_roles:"
                    )
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

                    return showRoleConfig(
                        interaction
                    );
                }

                if (
                    id.startsWith(
                        "config_channels:"
                    )
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

                    return showChannelConfig(
                        interaction
                    );
                }

                if (
                    id.startsWith(
                        "config_pix:"
                    )
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

                    return showPixModal(
                        interaction
                    );
                }

                if (
                    id.startsWith(
                        "config_fee:"
                    )
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

                    return showFeeModal(
                        interaction
                    );
                }

                if (
                    id.startsWith(
                        "config_appearance:"
                    )
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

                    return showAppearanceModal(
                        interaction
                    );
                }
            }

            // ================================
            // SELECTS
            // ================================

            if (
                interaction.isStringSelectMenu() ||
                interaction.isRoleSelectMenu() ||
                interaction.isChannelSelectMenu()
            ) {
                return handleSelect(
                    interaction
                );
            }

            // ================================
            // MODAIS
            // ================================

            if (
                interaction.isModalSubmit()
            ) {
                return handleModal(
                    interaction
                );
            }

        } catch (error) {
            console.error(
                "❌ ERRO NA INTERAÇÃO:",
                error
            );

            try {
                if (
                    interaction.deferred ||
                    interaction.replied
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

// ============================================================
// PRESENÇA / ADM ONLINE
// ============================================================

client.on(
    Events.PresenceUpdate,
    async (_, newPresence) => {
        try {
            const guild =
                newPresence.guild;

            if (!guild) return;

            await refreshGuildLock(
                guild
            );
        } catch (error) {
            console.error(
                "❌ Erro atualizando status das filas:",
                error.message
            );
        }
    }
);

// ============================================================
// MEMBROS ENTRANDO/SAINDO
// ============================================================

client.on(
    Events.GuildMemberAdd,
    async member => {
        try {
            await refreshGuildLock(
                member.guild
            );
        } catch {}
    }
);

client.on(
    Events.GuildMemberRemove,
    async member => {
        try {
            await refreshGuildLock(
                member.guild
            );
        } catch {}
    }
);

// ============================================================
// MENSAGENS
// ============================================================

client.on(
    Events.MessageCreate,
    async message => {
        if (message.author.bot) {
            return;
        }

        if (!message.guild) {
            return;
        }

        const content =
            message.content.trim();

        try {
            if (
                content.toLowerCase() ===
                ".ssmob"
            ) {
                if (
                    !isAdmin(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Você não possui permissão."
                    );
                }

                const cfg =
                    getGuildConfig(
                        message.guild.id
                    );

                return message.reply(
                    cfg.mobileChannelId
                        ? `📱 Canal Mobile: <#${cfg.mobileChannelId}>`
                        : "❌ Canal Mobile não configurado."
                );
            }

            if (
                content.toLowerCase() ===
                ".ssemu"
            ) {
                if (
                    !isAdmin(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Você não possui permissão."
                    );
                }

                const cfg =
                    getGuildConfig(
                        message.guild.id
                    );

                return message.reply(
                    cfg.emulatorChannelId
                        ? `💻 Canal Emulador: <#${cfg.emulatorChannelId}>`
                        : "❌ Canal Emulador não configurado."
                );
            }

            if (
                content.toLowerCase() ===
                ".med"
            ) {
                // Mantém o comando antigo.
                if (
                    !isMediator(
                        message.member
                    )
                ) {
                    return message.reply(
                        "❌ Você não é mediador."
                    );
                }

                const match =
                    [...matches.values()]
                        .find(
                            m =>
                                m.channelId ===
                                    message.channel.id &&
                                m.status !==
                                    "finished" &&
                                m.status !==
                                    "cancelled"
                        );

                if (!match) {
                    return message.reply(
                        "❌ Não encontrei uma partida ativa neste canal."
                    );
                }

                if (
                    !canManageMatch(
                        message.member,
                        match
                    )
                ) {
                    return message.reply(
                        "❌ Esta partida está atribuída a outro mediador."
                    );
                }

                return message.channel.send({
                    embeds: [
                        mediatorPanelEmbed(
                            match
                        )
                    ],
                    components: [
                        new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(
                                        `med_room:${match.id}`
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
                                        `med_finish:${match.id}`
                                    )
                                    .setLabel(
                                        "Finalizar"
                                    )
                                    .setEmoji("🏆")
                                    .setStyle(
                                        ButtonStyle.Success
                                    )
                            ),
                        winnerMenu(match),
                        woMenu(match)
                    ]
                });
            }

            if (
                content.toLowerCase() ===
                ".p"
            ) {
                return message.reply({
                    embeds: [
                        statsEmbed(
                            message.guild.id,
                            message.author.id
                        )
                    ]
                });
            }

            // Dados da sala enviados pelo mediador
            const match =
                [...matches.values()]
                    .find(
                        m =>
                            m.channelId ===
                                message.channel.id &&
                            m.status ===
                                "room_ready" &&
                            !m.roomId
                    );

            if (
                match &&
                isMediator(
                    message.member
                ) &&
                canManageMatch(
                    message.member,
                    match
                )
            ) {
                const room =
                    extractRoomData(
                        message.content
                    );

                if (room) {
                    await sendRoom(
                        match,
                        room.roomId,
                        room.password
                    );

                    return;
                }
            }

        } catch (error) {
            console.error(
                "❌ Erro MessageCreate:",
                error
            );
        }
    }
);

// ============================================================
// READY
// ============================================================

client.once(
    Events.ClientReady,
    async readyClient => {
        console.log(
            "========================================"
        );

        console.log(
            `✅ BOT ONLINE: ${readyClient.user.tag}`
        );

        console.log(
            `🆔 ID: ${readyClient.user.id}`
        );

        console.log(
            "========================================"
        );

        for (
            const guild of
            readyClient.guilds.cache.values()
        ) {
            try {
                getGuildRecord(
                    guild.id
                );

                await registerCommands(
                    guild
                );

                // Estado inicial das filas
                guildLockState.set(
                    guild.id,
                    isQueueLocked(
                        guild
                    )
                );

                // Só publica a fila de
                // mediadores quando não
                // houver ADM online.
                if (
                    isQueueLocked(
                        guild
                    )
                ) {
                    await publishMediatorQueue(
                        guild
                    );

                    console.log(
                        `🔒 ${guild.name}: nenhum ADM online. Filas bloqueadas.`
                    );
                } else {
                    console.log(
                        `🔓 ${guild.name}: ADM online. Filas liberadas.`
                    );
                }
            } catch (error) {
                console.error(
                    `❌ Erro inicializando ${guild.name}:`,
                    error
                );
            }
        }

        console.log(
            "🚀 Inicialização concluída."
        );
    }
);

// ============================================================
// NOVO SERVIDOR
// ============================================================

client.on(
    Events.GuildCreate,
    async guild => {
        try {
            console.log(
                `➕ Bot entrou em: ${guild.name}`
            );

            getGuildRecord(
                guild.id
            );

            await registerCommands(
                guild
            );

            guildLockState.set(
                guild.id,
                isQueueLocked(
                    guild
                )
            );

            if (
                isQueueLocked(
                    guild
                )
            ) {
                await publishMediatorQueue(
                    guild
                );
            }
        } catch (error) {
            console.error(
                "❌ Erro GuildCreate:",
                error
            );
        }
    }
);

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN)
    .then(() => {
        console.log(
            "🔄 Conectando ao Discord..."
        );
    })
    .catch(error => {
        console.error(
            "❌ Não foi possível conectar o bot:"
        );

        console.error(error);
    });
```
