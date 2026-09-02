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
    PermissionsBitField,
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
// BANCO DE DADOS
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
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
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

    // Migração de configurações antigas
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

    saveDB();

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

const FORMATS = {
    "1x1": 2,
    "2x2": 4,
    "3x3": 6,
    "4x4": 8
};

const MODALITIES = [
    "Mobile",
    "Emulador",
    "Misto"
];

// IMPORTANTE:
// TODA FILA AGORA POSSUI SOMENTE 2 VAGAS.
const QUEUE_CAPACITY = 2;

// ============================================================
// MEMÓRIA
// ============================================================

const queues = new Map();
const matches = new Map();

const mediatorQueues = new Map();

const roomTimers = new Map();

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
        .replace("R$", "")
        .replace(/\s/g, "")
        .trim();

    if (!clean) return null;

    if (clean.includes(",")) {
        clean = clean.replace(/\./g, "").replace(",", ".");
    }

    const number = Number(clean);

    if (!Number.isFinite(number)) return null;

    return number;
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
    const cfg = guildId ? getGuildConfig(guildId) : defaultGuildConfig();

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

function footer(embed, text = "Sistema de Filas") {
    return embed.setFooter({
        text
    });
}

function mentionUser(id) {
    return `<@${id}>`;
}

function isAdmin(member) {
    if (!member) return false;

    if (member.permissions?.has(PermissionFlagsBits.Administrator)) {
        return true;
    }

    const cfg = getGuildConfig(member.guild.id);

    return Boolean(
        cfg.adminRoleId &&
        member.roles.cache.has(cfg.adminRoleId)
    );
}

function isMediator(member) {
    if (!member) return false;

    const cfg = getGuildConfig(member.guild.id);

    if (!cfg.mediatorRoleId) return false;

    return member.roles.cache.has(cfg.mediatorRoleId);
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
    const stats = getUserStats(userId);
    stats.wins++;
    saveDB();
}

function addLoss(userId) {
    const stats = getUserStats(userId);
    stats.losses++;
    saveDB();
}

function addWOWin(userId) {
    const stats = getUserStats(userId);
    stats.woVictories++;
    saveDB();
}

// ============================================================
// FILAS
// ============================================================

function queueKey(guildId, format, modality, value) {
    return `${guildId}:${format}:${modality}:${value}`;
}

function getQueue(guildId, format, modality, value) {
    const key = queueKey(guildId, format, modality, value);

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

function removePlayerFromAllQueues(guildId, userId) {
    for (const q of queues.values()) {
        if (q.guildId !== guildId) continue;

        const index = q.players.indexOf(userId);

        if (index !== -1) {
            q.players.splice(index, 1);
            delete q.gelo[userId];
        }
    }
}

function queueProgress(q) {
    return `${q.players.length}/${QUEUE_CAPACITY}`;
}

function queueEmbed(q) {
    const guild = client.guilds.cache.get(q.guildId);

    const embed = makeEmbed(
        q.guildId,
        `🎮 FILA ${q.format}`,
        `### 💰 ${money(q.value)}\n` +
        `**Modalidade:** ${q.modality}\n` +
        `**Jogadores:** ${queueProgress(q)}`
    );

    if (q.format === "1x1") {
        embed.addFields({
            name: "🧊 Tipo de Gelo",
            value:
                "🧊 **Gelo Normal** — jogadores que escolherem normal\n" +
                "♾️ **Gelo Infinito** — jogadores que escolherem infinito",
            inline: false
        });
    }

    if (q.players.length === 0) {
        embed.addFields({
            name: "👥 Jogadores",
            value: "Ninguém entrou ainda.",
            inline: false
        });
    } else {
        const list = q.players
            .map((id, index) => {
                let gelo = "";

                if (q.format === "1x1") {
                    gelo =
                        q.gelo[id] === "normal"
                            ? " 🧊"
                            : q.gelo[id] === "infinito"
                                ? " ♾️"
                                : "";
                }

                return `**${index + 1}.** ${mentionUser(id)}${gelo}`;
            })
            .join("\n");

        embed.addFields({
            name: "👥 Jogadores na fila",
            value: list,
            inline: false
        });
    }

    embed.addFields({
        name: "📌 Como entrar",
        value:
            q.format === "1x1"
                ? "Escolha o tipo de gelo desejado e aguarde outro jogador escolher o mesmo."
                : "Clique em **Entrar na Fila** para participar.",
        inline: false
    });

    if (guild) {
        footer(
            embed,
            `${guild.name} • Fila com capacidade máxima de 2 jogadores`
        );
    }

    return embed;
}

function queueButtons(q) {
    if (q.format === "1x1") {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `queue_normal:${q.guildId}:${q.format}:${q.modality}:${q.value}`
                )
                .setLabel("Gelo Normal")
                .setEmoji("🧊")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId(
                    `queue_infinito:${q.guildId}:${q.format}:${q.modality}:${q.value}`
                )
                .setLabel("Gelo Infinito")
                .setEmoji("♾️")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId(
                    `queue_leave:${q.guildId}:${q.format}:${q.modality}:${q.value}`
                )
                .setLabel("Sair da Fila")
                .setEmoji("🚪")
                .setStyle(ButtonStyle.Danger)
        );
    }

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(
                `queue_join:${q.guildId}:${q.format}:${q.modality}:${q.value}`
            )
            .setLabel("Entrar na Fila")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(
                `queue_leave:${q.guildId}:${q.format}:${q.modality}:${q.value}`
            )
            .setLabel("Sair da Fila")
            .setEmoji("🚪")
            .setStyle(ButtonStyle.Danger)
    );
}

// ============================================================
// MEDIADORES
// ============================================================

function getMediatorQueue(guildId) {
    if (!mediatorQueues.has(guildId)) {
        const saved = getGuildRecord(guildId).mediatorQueue;

        mediatorQueues.set(guildId, {
            users: Array.isArray(saved) ? [...saved] : [],
            messageId: null,
            channelId: null
        });
    }

    return mediatorQueues.get(guildId);
}

function saveMediatorQueue(guildId) {
    const q = getMediatorQueue(guildId);

    getGuildRecord(guildId).mediatorQueue = [...q.users];

    saveDB();
}

function mediatorQueueEmbed(guildId) {
    const q = getMediatorQueue(guildId);

    const embed = makeEmbed(
        guildId,
        "⚖️ FILA DE MEDIADORES",
        "Sistema de atendimento e distribuição de partidas."
    );

    if (q.users.length === 0) {
        embed.addFields({
            name: "👤 Mediadores disponíveis",
            value: "Nenhum mediador está na fila.",
            inline: false
        });
    } else {
        const list = q.users
            .map((id, index) => {
                return `**${index + 1}.** ${mentionUser(id)}`;
            })
            .join("\n");

        embed.addFields({
            name: "👥 Ordem de atendimento",
            value: list,
            inline: false
        });
    }

    embed.addFields({
        name: "🔄 Funcionamento",
        value:
            "O primeiro mediador da fila recebe prioridade na próxima partida.",
        inline: false
    });

    return footer(
        embed,
        "Sistema de Mediadores • Rodízio automático"
    );
}

async function publishMediatorQueue(guild) {
    const cfg = getGuildConfig(guild.id);

    if (!cfg.mediatorChannelId) return;

    const channel = guild.channels.cache.get(cfg.mediatorChannelId);

    if (!channel || !channel.isTextBased()) return;

    const q = getMediatorQueue(guild.id);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`mediator_join:${guild.id}`)
            .setLabel("Entrar na Fila")
            .setEmoji("⚖️")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`mediator_leave:${guild.id}`)
            .setLabel("Sair da Fila")
            .setEmoji("🚪")
            .setStyle(ButtonStyle.Danger)
    );

    try {
        let message = null;

        if (q.messageId && q.channelId === channel.id) {
            try {
                message = await channel.messages.fetch(q.messageId);
            } catch {}
        }

        if (message) {
            await message.edit({
                embeds: [mediatorQueueEmbed(guild.id)],
                components: [row]
            });
        } else {
            message = await channel.send({
                embeds: [mediatorQueueEmbed(guild.id)],
                components: [row]
            });

            q.messageId = message.id;
            q.channelId = channel.id;
        }
    } catch (error) {
        console.error("❌ Erro publicando fila de mediadores:", error);
    }
}

// ============================================================
// ATUALIZAR FILA
// ============================================================

async function refreshQueue(q) {
    const guild = client.guilds.cache.get(q.guildId);

    if (!guild || !q.channelId || !q.messageId) return;

    const channel = guild.channels.cache.get(q.channelId);

    if (!channel || !channel.isTextBased()) return;

    try {
        const message = await channel.messages.fetch(q.messageId);

        await message.edit({
            embeds: [queueEmbed(q)],
            components: [queueButtons(q)]
        });
    } catch (error) {
        console.error("❌ Erro atualizando fila:", error.message);
    }
}

// ============================================================
// CRIAR APOSTA
// ============================================================

function createMatchId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createBetFromQueue(q, selectedPlayers, gelo = null) {
    if (selectedPlayers.length !== 2) return;

    const guild = client.guilds.cache.get(q.guildId);

    if (!guild) return;

    const cfg = getGuildConfig(q.guildId);

    let mediatorId = null;

    // Emulador utiliza fila de mediadores.
    if (q.modality === "Emulador") {
        const mq = getMediatorQueue(q.guildId);

        if (mq.users.length === 0) {
            for (const userId of selectedPlayers) {
                if (!q.players.includes(userId)) {
                    q.players.push(userId);
                }
            }

            await refreshQueue(q);

            return;
        }

        mediatorId = mq.users.shift();

        saveMediatorQueue(q.guildId);

        await publishMediatorQueue(guild);
    }

    for (const userId of selectedPlayers) {
        const index = q.players.indexOf(userId);

        if (index !== -1) {
            q.players.splice(index, 1);
        }

        delete q.gelo[userId];
    }

    await refreshQueue(q);

    const matchId = createMatchId();

    const match = {
        id: matchId,
        guildId: q.guildId,

        format: q.format,
        modality: q.modality,
        value: q.value,

        gelo,

        players: [...selectedPlayers],

        mediatorId,

        status: "waiting_confirmation",

        confirmed: [],
        result: null,

        roomId: null,
        password: null,

        channelId: null,
        createdAt: Date.now()
    };

    matches.set(matchId, match);

    try {
        await createPrivateBetChannel(guild, match);
    } catch (error) {
        console.error("❌ Erro criando aposta:", error);

        for (const userId of selectedPlayers) {
            if (!q.players.includes(userId)) {
                q.players.push(userId);
            }
        }

        matches.delete(matchId);

        if (mediatorId) {
            const mq = getMediatorQueue(q.guildId);

            if (!mq.users.includes(mediatorId)) {
                mq.users.unshift(mediatorId);
            }

            saveMediatorQueue(q.guildId);
            await publishMediatorQueue(guild);
        }

        await refreshQueue(q);
    }
}

// ============================================================
// CANAL PRIVADO DA APOSTA
// ============================================================

function getMatchChannelName(match) {
    return `aposta-${match.id.slice(-6)}`;
}

function betEmbed(match) {
    const geloText =
        match.gelo === "normal"
            ? "🧊 Gelo Normal"
            : match.gelo === "infinito"
                ? "♾️ Gelo Infinito"
                : "Não definido";

    const embed = makeEmbed(
        match.guildId,
        "💰 APOSTA CRIADA",
        "A partida foi formada. Todos os jogadores devem confirmar a participação."
    );

    embed.addFields(
        {
            name: "🎯 Partida",
            value:
                `**Formato:** ${match.format}\n` +
                `**Modalidade:** ${match.modality}\n` +
                `**Gelo:** ${geloText}`,
            inline: true
        },
        {
            name: "💵 Valor",
            value: money(match.value),
            inline: true
        },
        {
            name: "👥 Jogadores",
            value: match.players
                .map(id => mentionUser(id))
                .join("\n"),
            inline: false
        },
        {
            name: "📋 Status",
            value:
                match.status === "waiting_confirmation"
                    ? "🟡 Aguardando confirmação"
                    : match.status === "waiting_payment"
                        ? "🟠 Aguardando pagamento"
                        : match.status === "room_ready"
                            ? "🟢 Sala disponível"
                            : "🔵 Em andamento",
            inline: false
        }
    );

    if (match.mediatorId) {
        embed.addFields({
            name: "⚖️ Mediador",
            value: mentionUser(match.mediatorId),
            inline: true
        });
    }

    return footer(embed, "Sistema de Apostas");
}

async function createPrivateBetChannel(guild, match) {
    const cfg = getGuildConfig(guild.id);

    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
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

    const channel = await guild.channels.create({
        name: getMatchChannelName(match),
        type: ChannelType.GuildText,
        parent: cfg.betsCategoryId || undefined,
        permissionOverwrites: overwrites
    });

    match.channelId = channel.id;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`bet_confirm:${match.id}`)
            .setLabel("Confirmar Participação")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`bet_cancel:${match.id}`)
            .setLabel("Cancelar Aposta")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
        content: match.players.map(id => mentionUser(id)).join(" "),
        embeds: [betEmbed(match)],
        components: [row]
    });

    if (match.mediatorId) {
        await channel.send({
            content: `⚖️ Mediador responsável: ${mentionUser(match.mediatorId)}`
        });
    }
}

// ============================================================
// PIX
// ============================================================

function pixEmbed(match) {
    const cfg = getGuildConfig(match.guildId);

    const embed = makeEmbed(
        match.guildId,
        "💳 PAGAMENTO",
        "Todos os jogadores devem realizar o pagamento da aposta."
    );

    embed.addFields(
        {
            name: "💰 Valor da aposta",
            value: money(match.value),
            inline: true
        },
        {
            name: "👤 Recebedor",
            value: cfg.pixName || "Não configurado",
            inline: true
        },
        {
            name: "🔑 Chave Pix",
            value: cfg.pixKey || "Não configurada",
            inline: false
        }
    );

    if (cfg.pixQrCode) {
        embed.setImage(cfg.pixQrCode);
    }

    embed.addFields({
        name: "⚠️ Importante",
        value:
            "Após o pagamento, aguarde o mediador liberar a sala.",
        inline: false
    });

    return footer(embed, "Pagamento via Pix");
}

// ============================================================
// CONFIRMAÇÃO
// ============================================================

async function confirmBet(interaction, match) {
    if (!match.players.includes(interaction.user.id)) {
        return interaction.reply({
            content: "❌ Você não participa desta aposta.",
            ephemeral: true
        });
    }

    if (match.status !== "waiting_confirmation") {
        return interaction.reply({
            content: "⚠️ Esta etapa já foi concluída.",
            ephemeral: true
        });
    }

    if (!match.confirmed.includes(interaction.user.id)) {
        match.confirmed.push(interaction.user.id);
    }

    if (match.confirmed.length < match.players.length) {
        await interaction.reply({
            content: `✅ Confirmação registrada. ${match.confirmed.length}/${match.players.length} confirmados.`,
            ephemeral: true
        });

        return;
    }

    match.status = "waiting_payment";

    await interaction.reply({
        content: "✅ Todos confirmaram! Aguardando pagamento.",
        ephemeral: true
    });

    const channel = interaction.channel;

    if (channel) {
        await channel.send({
            embeds: [pixEmbed(match)]
        });
    }

    startRoomTimer(match);
}

// ============================================================
// TIMER DA SALA
// ============================================================

function startRoomTimer(match) {
    if (roomTimers.has(match.id)) {
        clearTimeout(roomTimers.get(match.id));
    }

    // 3 a 5 minutos
    const delay =
        (3 * 60 * 1000) +
        Math.floor(Math.random() * (2 * 60 * 1000));

    const timer = setTimeout(async () => {
        if (!matches.has(match.id)) return;

        if (match.status !== "waiting_payment") return;

        match.status = "room_ready";

        const guild = client.guilds.cache.get(match.guildId);

        if (!guild) return;

        const channel = guild.channels.cache.get(match.channelId);

        if (!channel) return;

        const embed = makeEmbed(
            match.guildId,
            "🎮 SALA LIBERADA",
            "O mediador já pode enviar os dados da sala."
        );

        embed.addFields({
            name: "📌 Próximo passo",
            value:
                "O mediador deve utilizar o comando `.med` para enviar ID e senha da sala.",
            inline: false
        });

        await channel.send({
            embeds: [embed]
        });
    }, delay);

    roomTimers.set(match.id, timer);
}

// ============================================================
// PERMISSÃO DO MEDIADOR
// ============================================================

function canManageMatch(member, match) {
    if (!isMediator(member)) return false;

    if (
        match.mediatorId &&
        match.mediatorId !== member.id
    ) {
        return false;
    }

    return true;
}

// ============================================================
// SALA
// ============================================================

function extractRoomData(text) {
    const normalized = text
        .replace(/senha/gi, "senha")
        .replace(/id da sala/gi, "id")
        .replace(/id/gi, "id");

    const idMatch = normalized.match(
        /(?:id\s*[:\-]?\s*)(\d{4,12})/i
    );

    const passwordMatch = text.match(
        /(?:senha|pass|password)\s*[:\-]?\s*([A-Za-z0-9]{2,20})/i
    );

    if (!idMatch || !passwordMatch) {
        const numbers = text.match(/\b\d{4,12}\b/g);

        if (numbers && numbers.length >= 2) {
            return {
                roomId: numbers[0],
                password: numbers[1]
            };
        }

        return null;
    }

    return {
        roomId: idMatch[1],
        password: passwordMatch[1]
    };
}

async function sendRoom(match, roomId, password) {
    const guild = client.guilds.cache.get(match.guildId);

    if (!guild) return;

    const channel = guild.channels.cache.get(match.channelId);

    if (!channel) return;

    match.roomId = roomId;
    match.password = password;

    match.status = "room_ready";

    const embed = makeEmbed(
        match.guildId,
        "🎮 SALA DA PARTIDA",
        "A sala está pronta. Entrem utilizando os dados abaixo."
    );

    embed.addFields(
        {
            name: "🆔 ID DA SALA",
            value: `\`${roomId}\``,
            inline: true
        },
        {
            name: "🔐 SENHA",
            value: `\`${password}\``,
            inline: true
        },
        {
            name: "🎯 Partida",
            value:
                `**Formato:** ${match.format}\n` +
                `**Modalidade:** ${match.modality}\n` +
                `**Valor:** ${money(match.value)}`,
            inline: false
        }
    );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`copy_room:${match.id}`)
            .setLabel("Copiar Dados")
            .setEmoji("📋")
            .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({
        embeds: [embed],
        components: [row]
    });
}

// ============================================================
// RESULTADO
// ============================================================

function mediatorPanelEmbed(match) {
    const embed = makeEmbed(
        match.guildId,
        "⚖️ PAINEL DO MEDIADOR",
        "Gerencie o resultado desta partida."
    );

    embed.addFields(
        {
            name: "🎯 Partida",
            value:
                `**Formato:** ${match.format}\n` +
                `**Modalidade:** ${match.modality}\n` +
                `**Valor:** ${money(match.value)}`,
            inline: true
        },
        {
            name: "👥 Jogadores",
            value: match.players
                .map(id => mentionUser(id))
                .join("\n"),
            inline: true
        }
    );

    if (match.result) {
        embed.addFields({
            name: "🏆 Resultado registrado",
            value: `Vencedor: ${mentionUser(match.result.winnerId)}`,
            inline: false
        });
    }

    return footer(embed, "Painel do Mediador");
}

function winnerMenu(match) {
    const options = match.players.map((id, index) =>
        new StringSelectMenuOptionBuilder()
            .setLabel(`Jogador ${index + 1}`)
            .setDescription(`Selecionar ${id}`)
            .setValue(id)
    );

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`winner_select:${match.id}`)
            .setPlaceholder("🏆 Selecione o vencedor")
            .addOptions(options)
    );
}

function woMenu(match) {
    const options = match.players.map((id, index) =>
        new StringSelectMenuOptionBuilder()
            .setLabel(`Jogador ${index + 1}`)
            .setDescription(`Vitória por W.O. para ${id}`)
            .setValue(id)
    );

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`wo_select:${match.id}`)
            .setPlaceholder("🚫 Selecione o vencedor por W.O.")
            .addOptions(options)
    );
}

async function registerNormalVictory(match, winnerId) {
    if (match.result) return;

    match.result = {
        type: "normal",
        winnerId
    };

    match.status = "finished";

    addWin(winnerId);

    for (const playerId of match.players) {
        if (playerId !== winnerId) {
            addLoss(playerId);
        }
    }

    const guild = client.guilds.cache.get(match.guildId);

    if (!guild) return;

    const channel = guild.channels.cache.get(match.channelId);

    if (!channel) return;

    const embed = makeEmbed(
        match.guildId,
        "🏆 PARTIDA FINALIZADA",
        `O vencedor foi ${mentionUser(winnerId)}`
    );

    embed.addFields(
        {
            name: "🥇 Vencedor",
            value: mentionUser(winnerId),
            inline: true
        },
        {
            name: "💰 Valor",
            value: money(match.value),
            inline: true
        }
    );

    await channel.send({
        embeds: [embed]
    });
}

async function registerWOVictory(match, winnerId) {
    if (match.result) return;

    match.result = {
        type: "wo",
        winnerId
    };

    match.status = "finished";

    addWOWin(winnerId);
    addWin(winnerId);

    for (const playerId of match.players) {
        if (playerId !== winnerId) {
            addLoss(playerId);
        }
    }

    const guild = client.guilds.cache.get(match.guildId);

    if (!guild) return;

    const channel = guild.channels.cache.get(match.channelId);

    if (!channel) return;

    const embed = makeEmbed(
        match.guildId,
        "🚫 VITÓRIA POR W.O.",
        `A vitória por W.O. foi registrada para ${mentionUser(winnerId)}.`
    );

    await channel.send({
        embeds: [embed]
    });
}

// ============================================================
// ESTATÍSTICAS
// ============================================================

function statsEmbed(guildId, userId) {
    const stats = getUserStats(userId);

    const total =
        Number(stats.wins || 0) +
        Number(stats.losses || 0);

    const percentage =
        total > 0
            ? ((stats.wins / total) * 100).toFixed(1)
            : "0.0";

    const embed = makeEmbed(
        guildId,
        "📊 ESTATÍSTICAS",
        `Perfil de ${mentionUser(userId)}`
    );

    embed.addFields(
        {
            name: "🏆 Vitórias",
            value: String(stats.wins || 0),
            inline: true
        },
        {
            name: "💀 Derrotas",
            value: String(stats.losses || 0),
            inline: true
        },
        {
            name: "📈 Aproveitamento",
            value: `${percentage}%`,
            inline: true
        },
        {
            name: "🚫 Vitórias por W.O.",
            value: String(stats.woVictories || 0),
            inline: true
        },
        {
            name: "🪙 Moedas",
            value: String(stats.coins || 0),
            inline: true
        }
    );

    return footer(embed, "Estatísticas do jogador");
}

// ============================================================
// CONFIGURAÇÃO
// ============================================================

function configMainEmbed(guild) {
    const cfg = getGuildConfig(guild.id);

    const embed = makeEmbed(
        guild.id,
        "⚙️ CONFIGURAÇÃO DO BOT",
        "Utilize os menus abaixo para configurar o sistema."
    );

    embed.addFields(
        {
            name: "⚖️ Mediador",
            value: cfg.mediatorRoleId
                ? `<@&${cfg.mediatorRoleId}>`
                : "Não configurado",
            inline: true
        },
        {
            name: "🔎 Analista",
            value: cfg.analystRoleId
                ? `<@&${cfg.analystRoleId}>`
                : "Não configurado",
            inline: true
        },
        {
            name: "👑 Administrador",
            value: cfg.adminRoleId
                ? `<@&${cfg.adminRoleId}>`
                : "Não configurado",
            inline: true
        },
        {
            name: "💸 Taxa",
            value: money(cfg.fee),
            inline: true
        },
        {
            name: "📱 Mobile",
            value: cfg.mobileChannelId
                ? `<#${cfg.mobileChannelId}>`
                : "Não configurado",
            inline: true
        },
        {
            name: "💻 Emulador",
            value: cfg.emulatorChannelId
                ? `<#${cfg.emulatorChannelId}>`
                : "Não configurado",
            inline: true
        },
        {
            name: "⚖️ Mediadores",
            value: cfg.mediatorChannelId
                ? `<#${cfg.mediatorChannelId}>`
                : "Não configurado",
            inline: true
        },
        {
            name: "📁 Categoria das apostas",
            value: cfg.betsCategoryId
                ? `<#${cfg.betsCategoryId}>`
                : "Não configurado",
            inline: true
        }
    );

    return footer(embed, "Painel de Configuração");
}

function configRows(guildId) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`config_roles:${guildId}`)
            .setLabel("Cargos")
            .setEmoji("👑")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`config_channels:${guildId}`)
            .setLabel("Canais")
            .setEmoji("📢")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`config_pix:${guildId}`)
            .setLabel("Pix")
            .setEmoji("💳")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`config_fee:${guildId}`)
            .setLabel("Taxa")
            .setEmoji("💰")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`config_appearance:${guildId}`)
            .setLabel("Aparência")
            .setEmoji("🎨")
            .setStyle(ButtonStyle.Secondary)
    );

    return [row1];
}

// ============================================================
// CONFIGURAÇÃO DE CARGOS
// ============================================================

async function showRoleConfig(interaction) {
    const guildId = interaction.guild.id;

    const embed = makeEmbed(
        guildId,
        "👑 CONFIGURAÇÃO DE CARGOS",
        "Selecione os cargos que serão utilizados pelo sistema."
    );

    const row = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId(`role_mediator:${guildId}`)
            .setPlaceholder("⚖️ Cargo de Mediador")
            .setMinValues(1)
            .setMaxValues(1)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId(`role_analyst:${guildId}`)
            .setPlaceholder("🔎 Cargo de Analista")
            .setMinValues(1)
            .setMaxValues(1)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId(`role_admin:${guildId}`)
            .setPlaceholder("👑 Cargo de Administrador")
            .setMinValues(1)
            .setMaxValues(1)
    );

    await interaction.reply({
        embeds: [embed],
        components: [row, row2, row3],
        ephemeral: true
    });
}

// ============================================================
// CONFIGURAÇÃO DE CANAIS
// ============================================================

async function showChannelConfig(interaction) {
    const guildId = interaction.guild.id;

    const embed = makeEmbed(
        guildId,
        "📢 CONFIGURAÇÃO DE CANAIS",
        "Selecione os canais correspondentes."
    );

    const mobile = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId(`channel_mobile:${guildId}`)
            .setPlaceholder("📱 Canal Mobile")
            .setChannelTypes(ChannelType.GuildText)
    );

    const emulator = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId(`channel_emulator:${guildId}`)
            .setPlaceholder("💻 Canal Emulador")
            .setChannelTypes(ChannelType.GuildText)
    );

    const mediator = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId(`channel_mediator:${guildId}`)
            .setPlaceholder("⚖️ Canal dos Mediadores")
            .setChannelTypes(ChannelType.GuildText)
    );

    const category = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId(`channel_category:${guildId}`)
            .setPlaceholder("📁 Categoria das Apostas")
            .setChannelTypes(ChannelType.GuildCategory)
    );

    await interaction.reply({
        embeds: [embed],
        components: [mobile, emulator, mediator, category],
        ephemeral: true
    });
}

// ============================================================
// MODAIS
// ============================================================

async function showPixModal(interaction) {
    const cfg = getGuildConfig(interaction.guild.id);

    const modal = new ModalBuilder()
        .setCustomId(`modal_pix:${interaction.guild.id}`)
        .setTitle("💳 Configurar Pix");

    const name = new TextInputBuilder()
        .setCustomId("pix_name")
        .setLabel("Nome do recebedor")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(cfg.pixName || "");

    const key = new TextInputBuilder()
        .setCustomId("pix_key")
        .setLabel("Chave Pix")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(cfg.pixKey || "");

    const qr = new TextInputBuilder()
        .setCustomId("pix_qr")
        .setLabel("URL do QR Code")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(cfg.pixQrCode || "");

    modal.addComponents(
        new ActionRowBuilder().addComponents(name),
        new ActionRowBuilder().addComponents(key),
        new ActionRowBuilder().addComponents(qr)
    );

    await interaction.showModal(modal);
}

async function showFeeModal(interaction) {
    const cfg = getGuildConfig(interaction.guild.id);

    const modal = new ModalBuilder()
        .setCustomId(`modal_fee:${interaction.guild.id}`)
        .setTitle("💰 Configurar Taxa");

    const fee = new TextInputBuilder()
        .setCustomId("fee")
        .setLabel("Taxa")
        .setPlaceholder("Ex: 0,01")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(String(cfg.fee));

    modal.addComponents(
        new ActionRowBuilder().addComponents(fee)
    );

    await interaction.showModal(modal);
}

async function showAppearanceModal(interaction) {
    const cfg = getGuildConfig(interaction.guild.id);

    const modal = new ModalBuilder()
        .setCustomId(`modal_appearance:${interaction.guild.id}`)
        .setTitle("🎨 Aparência");

    const color = new TextInputBuilder()
        .setCustomId("color")
        .setLabel("Cor hexadecimal")
        .setPlaceholder("#5865F2")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(cfg.embedColor || "#5865F2");

    const picture = new TextInputBuilder()
        .setCustomId("picture")
        .setLabel("URL da imagem de perfil")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(cfg.profilePicture || "");

    modal.addComponents(
        new ActionRowBuilder().addComponents(color),
        new ActionRowBuilder().addComponents(picture)
    );

    await interaction.showModal(modal);
}

// ============================================================
// COMANDO /FILA
// ============================================================

async function createQueues(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            content: "❌ Você não possui permissão para criar filas.",
            ephemeral: true
        });
    }

    const format = interaction.options.getString("formato");
    const modality = interaction.options.getString("modalidade");
    const channel = interaction.options.getChannel("canal");

    if (!channel || channel.type !== ChannelType.GuildText) {
        return interaction.reply({
            content: "❌ Escolha um canal de texto válido.",
            ephemeral: true
        });
    }

    const values = [...VALUES].reverse();

    await interaction.reply({
        content: `⏳ Criando/atualizando as filas **${format} • ${modality}**...`,
        ephemeral: true
    });

    let count = 0;

    for (const value of values) {
        const q = getQueue(
            interaction.guild.id,
            format,
            modality,
            value
        );

        q.channelId = channel.id;

        const embed = queueEmbed(q);
        const components = [queueButtons(q)];

        let message = null;

        if (q.messageId && q.channelId === channel.id) {
            try {
                message = await channel.messages.fetch(q.messageId);
            } catch {}
        }

        try {
            if (message) {
                await message.edit({
                    embeds: [embed],
                    components
                });
            } else {
                message = await channel.send({
                    embeds: [embed],
                    components
                });

                q.messageId = message.id;
            }

            count++;
        } catch (error) {
            console.error(
                `❌ Erro criando fila ${value}:`,
                error.message
            );
        }
    }

    await interaction.editReply(
        `✅ **${count} filas** configuradas!\n\n` +
        `🎯 Formato: **${format}**\n` +
        `📱 Modalidade: **${modality}**\n` +
        `👥 Capacidade de cada fila: **2 jogadores**`
    );
}

// ============================================================
// BOTÕES DAS FILAS
// ============================================================

async function handleQueueButton(interaction) {
    const parts = interaction.customId.split(":");

    const action = parts[0];
    const guildId = parts[1];
    const format = parts[2];
    const modality = parts[3];
    const value = Number(parts[4]);

    if (guildId !== interaction.guild.id) {
        return interaction.reply({
            content: "❌ Esta fila pertence a outro servidor.",
            ephemeral: true
        });
    }

    const q = getQueue(
        guildId,
        format,
        modality,
        value
    );

    const userId = interaction.user.id;

    if (action === "queue_leave") {
        const index = q.players.indexOf(userId);

        if (index === -1) {
            return interaction.reply({
                content: "❌ Você não está nesta fila.",
                ephemeral: true
            });
        }

        q.players.splice(index, 1);
        delete q.gelo[userId];

        await refreshQueue(q);

        return interaction.reply({
            content: "🚪 Você saiu da fila.",
            ephemeral: true
        });
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

    // Já está na fila
    if (q.players.includes(userId)) {
        if (format === "1x1" && selectedGelo) {
            q.gelo[userId] = selectedGelo;

            await refreshQueue(q);

            await interaction.reply({
                content:
                    selectedGelo === "normal"
                        ? "🧊 Você escolheu **Gelo Normal**."
                        : "♾️ Você escolheu **Gelo Infinito**.",
                ephemeral: true
            });

            await tryStartQueue(q);

            return;
        }

        return interaction.reply({
            content: "⚠️ Você já está nesta fila.",
            ephemeral: true
        });
    }

    // Fila cheia
    if (q.players.length >= QUEUE_CAPACITY) {
        return interaction.reply({
            content: "❌ Esta fila já está cheia.",
            ephemeral: true
        });
    }

    // 1x1 exige gelo
    if (format === "1x1" && !selectedGelo) {
        return interaction.reply({
            content: "❌ Escolha Gelo Normal ou Gelo Infinito.",
            ephemeral: true
        });
    }

    // Impede usuário de estar em várias filas
    removePlayerFromAllQueues(guildId, userId);

    q.players.push(userId);

    if (format === "1x1") {
        q.gelo[userId] = selectedGelo;
    }

    await refreshAllGuildQueues(guildId);

    await interaction.reply({
        content:
            format === "1x1"
                ? `✅ Você entrou na fila com **${
                    selectedGelo === "normal"
                        ? "🧊 Gelo Normal"
                        : "♾️ Gelo Infinito"
                }**.`
                : "✅ Você entrou na fila.",
        ephemeral: true
    });

    await tryStartQueue(q);
}

async function tryStartQueue(q) {
    if (q.players.length < 2) return;

    let players = [];

    let gelo = null;

    if (q.format === "1x1") {
        const normal = q.players.filter(
            id => q.gelo[id] === "normal"
        );

        const infinito = q.players.filter(
            id => q.gelo[id] === "infinito"
        );

        if (normal.length >= 2) {
            players = normal.slice(0, 2);
            gelo = "normal";
        } else if (infinito.length >= 2) {
            players = infinito.slice(0, 2);
            gelo = "infinito";
        } else {
            return;
        }
    } else {
        players = q.players.slice(0, 2);
    }

    await createBetFromQueue(
        q,
        players,
        gelo
    );
}

async function refreshAllGuildQueues(guildId) {
    for (const q of queues.values()) {
        if (q.guildId === guildId) {
            await refreshQueue(q);
        }
    }
}

// ============================================================
// BOTÃO DO MEDIADOR
// ============================================================

async function handleMediatorButton(interaction) {
    const parts = interaction.customId.split(":");

    const action = parts[0];
    const guildId = parts[1];

    if (guildId !== interaction.guild.id) return;

    if (!isMediator(interaction.member)) {
        return interaction.reply({
            content: "❌ Você não é mediador.",
            ephemeral: true
        });
    }

    const q = getMediatorQueue(guildId);

    if (action === "mediator_join") {
        if (q.users.includes(interaction.user.id)) {
            return interaction.reply({
                content: "⚠️ Você já está na fila de mediadores.",
                ephemeral: true
            });
        }

        q.users.push(interaction.user.id);

        saveMediatorQueue(guildId);
        await publishMediatorQueue(interaction.guild);

        return interaction.reply({
            content: "⚖️ Você entrou na fila de mediadores.",
            ephemeral: true
        });
    }

    if (action === "mediator_leave") {
        const index = q.users.indexOf(interaction.user.id);

        if (index === -1) {
            return interaction.reply({
                content: "❌ Você não está na fila.",
                ephemeral: true
            });
        }

        q.users.splice(index, 1);

        saveMediatorQueue(guildId);
        await publishMediatorQueue(interaction.guild);

        return interaction.reply({
            content: "🚪 Você saiu da fila de mediadores.",
            ephemeral: true
        });
    }
}

// ============================================================
// BOTÕES DAS APOSTAS
// ============================================================

async function handleBetButton(interaction) {
    const parts = interaction.customId.split(":");

    const action = parts[0];
    const matchId = parts[1];

    const match = matches.get(matchId);

    if (!match) {
        return interaction.reply({
            content: "❌ Esta aposta não existe mais.",
            ephemeral: true
        });
    }

    if (action === "bet_confirm") {
        return confirmBet(interaction, match);
    }

    if (action === "bet_cancel") {
        if (!match.players.includes(interaction.user.id)) {
            return interaction.reply({
                content: "❌ Você não participa desta aposta.",
                ephemeral: true
            });
        }

        match.status = "cancelled";

        if (roomTimers.has(match.id)) {
            clearTimeout(roomTimers.get(match.id));
            roomTimers.delete(match.id);
        }

        await interaction.reply({
            content: "❌ A aposta foi cancelada.",
            ephemeral: true
        });

        const channel = interaction.channel;

        if (channel) {
            await channel.send({
                embeds: [
                    makeEmbed(
                        match.guildId,
                        "❌ APOSTA CANCELADA",
                        `A aposta foi cancelada por ${mentionUser(interaction.user.id)}.`
                    )
                ]
            });
        }
    }

    if (action === "copy_room") {
        if (!match.roomId || !match.password) {
            return interaction.reply({
                content: "❌ A sala ainda não foi configurada.",
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
// .MED
// ============================================================

async function sendMediatorPanel(message) {
    if (!isMediator(message.member)) {
        return message.reply("❌ Você não é mediador.");
    }

    const activeMatch = [...matches.values()]
        .find(match =>
            match.channelId === message.channel.id &&
            match.status !== "finished" &&
            match.status !== "cancelled"
        );

    if (!activeMatch) {
        return message.reply(
            "❌ Não encontrei uma partida ativa neste canal."
        );
    }

    if (!canManageMatch(message.member, activeMatch)) {
        return message.reply(
            "❌ Esta partida está atribuída a outro mediador."
        );
    }

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`med_room:${activeMatch.id}`)
            .setLabel("Enviar Sala")
            .setEmoji("🎮")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`med_finish:${activeMatch.id}`)
            .setLabel("Finalizar")
            .setEmoji("🏆")
            .setStyle(ButtonStyle.Success)
    );

    await message.channel.send({
        embeds: [mediatorPanelEmbed(activeMatch)],
        components: [row1, winnerMenu(activeMatch), woMenu(activeMatch)]
    });
}

// ============================================================
// BOTÃO MEDIADOR
// ============================================================

async function handleMediatorPanelButton(interaction) {
    const parts = interaction.customId.split(":");

    const action = parts[0];
    const matchId = parts[1];

    const match = matches.get(matchId);

    if (!match) {
        return interaction.reply({
            content: "❌ Partida não encontrada.",
            ephemeral: true
        });
    }

    if (!canManageMatch(interaction.member, match)) {
        return interaction.reply({
            content: "❌ Você não pode administrar esta partida.",
            ephemeral: true
        });
    }

    if (action === "med_room") {
        const modal = new ModalBuilder()
            .setCustomId(`modal_room:${match.id}`)
            .setTitle("🎮 Dados da Sala");

        const id = new TextInputBuilder()
            .setCustomId("room_id")
            .setLabel("ID da Sala")
            .setPlaceholder("Ex: 123456789")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const password = new TextInputBuilder()
            .setCustomId("room_password")
            .setLabel("Senha da Sala")
            .setPlaceholder("Ex: 1234")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(id),
            new ActionRowBuilder().addComponents(password)
        );

        return interaction.showModal(modal);
    }

    if (action === "med_finish") {
        if (!match.result) {
            return interaction.reply({
                content: "❌ Registre o vencedor primeiro.",
                ephemeral: true
            });
        }

        return interaction.reply({
            content: "🏆 A partida já possui resultado registrado.",
            ephemeral: true
        });
    }
}

// ============================================================
// SELECTS
// ============================================================

async function handleSelect(interaction) {
    const parts = interaction.customId.split(":");

    const type = parts[0];

    if (type === "winner_select") {
        const match = matches.get(parts[1]);

        if (!match) {
            return interaction.reply({
                content: "❌ Partida não encontrada.",
                ephemeral: true
            });
        }

        if (!canManageMatch(interaction.member, match)) {
            return interaction.reply({
                content: "❌ Você não pode administrar esta partida.",
                ephemeral: true
            });
        }

        const winnerId = interaction.values[0];

        await registerNormalVictory(match, winnerId);

        return interaction.reply({
            embeds: [
                makeEmbed(
                    match.guildId,
                    "🏆 VENCEDOR REGISTRADO",
                    `${mentionUser(winnerId)} venceu a partida.`
                )
            ]
        });
    }

    if (type === "wo_select") {
        const match = matches.get(parts[1]);

        if (!match) {
            return interaction.reply({
                content: "❌ Partida não encontrada.",
                ephemeral: true
            });
        }

        if (!canManageMatch(interaction.member, match)) {
            return interaction.reply({
                content: "❌ Você não pode administrar esta partida.",
                ephemeral: true
            });
        }

        const winnerId = interaction.values[0];

        await registerWOVictory(match, winnerId);

        return interaction.reply({
            embeds: [
                makeEmbed(
                    match.guildId,
                    "🚫 W.O. REGISTRADO",
                    `${mentionUser(winnerId)} venceu por W.O.`
                )
            ]
        });
    }

    // Configuração
    if (type.startsWith("role_")) {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: "❌ Sem permissão.",
                ephemeral: true
            });
        }

        const roleId = interaction.values[0];
        const cfg = getGuildConfig(interaction.guild.id);

        if (type === "role_mediator") {
            cfg.mediatorRoleId = roleId;
        }

        if (type === "role_analyst") {
            cfg.analystRoleId = roleId;
        }

        if (type === "role_admin") {
            cfg.adminRoleId = roleId;
        }

        saveDB();

        return interaction.reply({
            content: "✅ Cargo atualizado.",
            ephemeral: true
        });
    }

    if (type.startsWith("channel_")) {
        if (!isAdmin(interaction.member)) {
            return interaction.reply({
                content: "❌ Sem permissão.",
                ephemeral: true
            });
        }

        const channelId = interaction.values[0];
        const cfg = getGuildConfig(interaction.guild.id);

        if (type === "channel_mobile") {
            cfg.mobileChannelId = channelId;
        }

        if (type === "channel_emulator") {
            cfg.emulatorChannelId = channelId;
        }

        if (type === "channel_mediator") {
            cfg.mediatorChannelId = channelId;
        }

        if (type === "channel_category") {
            cfg.betsCategoryId = channelId;
        }

        saveDB();

        await publishMediatorQueue(interaction.guild);

        return interaction.reply({
            content: "✅ Canal atualizado.",
            ephemeral: true
        });
    }
}

// ============================================================
// MODAIS
// ============================================================

async function handleModal(interaction) {
    if (!isAdmin(interaction.member)) {
        return interaction.reply({
            content: "❌ Você não possui permissão.",
            ephemeral: true
        });
    }

    const type = interaction.customId.split(":")[0];

    const cfg = getGuildConfig(interaction.guild.id);

    if (type === "modal_pix") {
        cfg.pixName =
            interaction.fields.getTextInputValue("pix_name");

        cfg.pixKey =
            interaction.fields.getTextInputValue("pix_key");

        cfg.pixQrCode =
            interaction.fields.getTextInputValue("pix_qr");

        saveDB();

        return interaction.reply({
            content: "✅ Pix atualizado.",
            ephemeral: true
        });
    }

    if (type === "modal_fee") {
        const value = parseMoney(
            interaction.fields.getTextInputValue("fee")
        );

        if (value === null || value < 0) {
            return interaction.reply({
                content: "❌ Valor inválido.",
                ephemeral: true
            });
        }

        cfg.fee = value;

        saveDB();

        return interaction.reply({
            content: `✅ Taxa definida para ${money(value)}.`,
            ephemeral: true
        });
    }

    if (type === "modal_appearance") {
        const color =
            interaction.fields.getTextInputValue("color");

        const picture =
            interaction.fields.getTextInputValue("picture");

        if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
            return interaction.reply({
                content: "❌ Cor inválida. Use, por exemplo, `#5865F2`.",
                ephemeral: true
            });
        }

        cfg.embedColor = color || "#5865F2";
        cfg.profilePicture = picture || "";

        saveDB();

        try {
            if (picture) {
                await client.user.setAvatar(picture);
            }
        } catch (error) {
            console.error("⚠️ Não foi possível alterar avatar:", error.message);
        }

        return interaction.reply({
            content: "✅ Aparência atualizada.",
            ephemeral: true
        });
    }

    if (type === "modal_room") {
        const matchId = interaction.customId.split(":")[1];

        const match = matches.get(matchId);

        if (!match) {
            return interaction.reply({
                content: "❌ Partida não encontrada.",
                ephemeral: true
            });
        }

        if (!canManageMatch(interaction.member, match)) {
            return interaction.reply({
                content: "❌ Você não pode administrar esta partida.",
                ephemeral: true
            });
        }

        const roomId =
            interaction.fields.getTextInputValue("room_id");

        const password =
            interaction.fields.getTextInputValue("room_password");

        await sendRoom(
            match,
            roomId,
            password
        );

        return interaction.reply({
            content: "🎮 Sala enviada para os jogadores.",
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
        .setDescription("Criar filas de apostas")
        .addStringOption(option =>
            option
                .setName("formato")
                .setDescription("Formato da partida")
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
                .setName("modalidade")
                .setDescription("Modalidade")
                .setRequired(true)
                .addChoices(
                    { name: "📱 Mobile", value: "Mobile" },
                    { name: "💻 Emulador", value: "Emulador" },
                    { name: "🎮 Misto", value: "Misto" }
                )
        )
        .addChannelOption(option =>
            option
                .setName("canal")
                .setDescription("Canal onde as filas serão criadas")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("config")
        .setDescription("Abrir painel de configuração"),

    new SlashCommandBuilder()
        .setName("p")
        .setDescription("Ver estatísticas de um jogador")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Jogador")
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("med")
        .setDescription("Abrir painel do mediador")
];

// ============================================================
// REGISTRAR COMANDOS
// ============================================================

async function registerCommands(guild) {
    try {
        await guild.commands.set(
            commands.map(command => command.toJSON())
        );

        console.log(
            `✅ Comandos registrados em: ${guild.name}`
        );
    } catch (error) {
        console.error(
            `❌ Erro registrando comandos em ${guild.name}:`,
            error
        );
    }
}

// ============================================================
// REFRESH DE CANAIS
// ============================================================

function getServerChannels(guild) {
    const all = guild.channels.cache;

    return {
        all,
        text: all.filter(
            channel => channel.type === ChannelType.GuildText
        ),
        categories: all.filter(
            channel => channel.type === ChannelType.GuildCategory
        )
    };
}

function refreshGuildChannels(guild) {
    const channels = getServerChannels(guild);

    console.log(
        `📢 ${guild.name}: ${channels.text.size} canais de texto encontrados.`
    );

    console.log(
        `📁 ${guild.name}: ${channels.categories.size} categorias encontradas.`
    );

    return channels;
}

// ============================================================
// READY
// ============================================================

client.once(Events.ClientReady, async readyClient => {
    console.log("========================================");
    console.log(`✅ BOT ONLINE: ${readyClient.user.tag}`);
    console.log(`🆔 ID: ${readyClient.user.id}`);
    console.log("========================================");

    for (const guild of readyClient.guilds.cache.values()) {
        try {
            getGuildRecord(guild.id);

            refreshGuildChannels(guild);

            await registerCommands(guild);

            await publishMediatorQueue(guild);
        } catch (error) {
            console.error(
                `❌ Erro inicializando ${guild.name}:`,
                error
            );
        }
    }

    console.log("🚀 Inicialização concluída.");
});

// ============================================================
// NOVO SERVIDOR
// ============================================================

client.on(Events.GuildCreate, async guild => {
    console.log(`➕ Bot entrou em: ${guild.name}`);

    getGuildRecord(guild.id);

    refreshGuildChannels(guild);

    await registerCommands(guild);

    await publishMediatorQueue(guild);
});

// ============================================================
// INTERAÇÕES
// ============================================================

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === "fila") {
                return createQueues(interaction);
            }

            if (interaction.commandName === "config") {
                if (!isAdmin(interaction.member)) {
                    return interaction.reply({
                        content: "❌ Você não possui permissão.",
                        ephemeral: true
                    });
                }

                return interaction.reply({
                    embeds: [
                        configMainEmbed(interaction.guild)
                    ],
                    components: configRows(interaction.guild.id),
                    ephemeral: true
                });
            }

            if (interaction.commandName === "p") {
                const user =
                    interaction.options.getUser("usuario") ||
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

            if (interaction.commandName === "med") {
                if (!isMediator(interaction.member)) {
                    return interaction.reply({
                        content: "❌ Você não é mediador.",
                        ephemeral: true
                    });
                }

                const activeMatch =
                    [...matches.values()].find(match =>
                        match.channelId === interaction.channel.id &&
                        match.status !== "finished" &&
                        match.status !== "cancelled"
                    );

                if (!activeMatch) {
                    return interaction.reply({
                        content:
                            "❌ Não existe uma partida ativa neste canal.",
                        ephemeral: true
                    });
                }

                if (
                    !canManageMatch(
                        interaction.member,
                        activeMatch
                    )
                ) {
                    return interaction.reply({
                        content:
                            "❌ Esta partida está atribuída a outro mediador.",
                        ephemeral: true
                    });
                }

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `med_room:${activeMatch.id}`
                        )
                        .setLabel("Enviar Sala")
                        .setEmoji("🎮")
                        .setStyle(ButtonStyle.Primary),

                    new ButtonBuilder()
                        .setCustomId(
                            `med_finish:${activeMatch.id}`
                        )
                        .setLabel("Finalizar")
                        .setEmoji("🏆")
                        .setStyle(ButtonStyle.Success)
                );

                return interaction.reply({
                    embeds: [
                        mediatorPanelEmbed(activeMatch)
                    ],
                    components: [
                        row,
                        winnerMenu(activeMatch),
                        woMenu(activeMatch)
                    ]
                });
            }
        }

        if (interaction.isButton()) {
            const id = interaction.customId;

            if (
                id.startsWith("queue_normal:") ||
                id.startsWith("queue_infinito:") ||
                id.startsWith("queue_join:") ||
                id.startsWith("queue_leave:")
            ) {
                return handleQueueButton(interaction);
            }

            if (
                id.startsWith("mediator_join:") ||
                id.startsWith("mediator_leave:")
            ) {
                return handleMediatorButton(interaction);
            }

            if (
                id.startsWith("bet_confirm:") ||
                id.startsWith("bet_cancel:") ||
                id.startsWith("copy_room:")
            ) {
                return handleBetButton(interaction);
            }

            if (
                id.startsWith("med_room:") ||
                id.startsWith("med_finish:")
            ) {
                return handleMediatorPanelButton(interaction);
            }

            if (id.startsWith("config_roles:")) {
                if (!isAdmin(interaction.member)) {
                    return interaction.reply({
                        content: "❌ Sem permissão.",
                        ephemeral: true
                    });
                }

                return showRoleConfig(interaction);
            }

            if (id.startsWith("config_channels:")) {
                if (!isAdmin(interaction.member)) {
                    return interaction.reply({
                        content: "❌ Sem permissão.",
                        ephemeral: true
                    });
                }

                return showChannelConfig(interaction);
            }

            if (id.startsWith("config_pix:")) {
                if (!isAdmin(interaction.member)) {
                    return interaction.reply({
                        content: "❌ Sem permissão.",
                        ephemeral: true
                    });
                }

                return showPixModal(interaction);
            }

            if (id.startsWith("config_fee:")) {
                if (!isAdmin(interaction.member)) {
                    return interaction.reply({
                        content: "❌ Sem permissão.",
                        ephemeral: true
                    });
                }

                return showFeeModal(interaction);
            }

            if (id.startsWith("config_appearance:")) {
                if (!isAdmin(interaction.member)) {
                    return interaction.reply({
                        content: "❌ Sem permissão.",
                        ephemeral: true
                    });
                }

                return showAppearanceModal(interaction);
            }
        }

        if (
            interaction.isStringSelectMenu() ||
            interaction.isRoleSelectMenu() ||
            interaction.isChannelSelectMenu()
        ) {
            return handleSelect(interaction);
        }

        if (interaction.isModalSubmit()) {
            return handleModal(interaction);
        }

    } catch (error) {
        console.error("❌ ERRO NA INTERAÇÃO:", error);

        try {
            if (interaction.replied || interaction.deferred) {
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
});

// ============================================================
// MENSAGENS
// ============================================================

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    const content = message.content.trim();

    try {
        // ====================================================
        // .SSMOB
        // ====================================================

        if (content.toLowerCase() === ".ssmob") {
            if (!isAdmin(message.member)) {
                return message.reply("❌ Você não possui permissão.");
            }

            const cfg = getGuildConfig(message.guild.id);

            if (!cfg.mobileChannelId) {
                return message.reply(
                    "❌ O canal Mobile ainda não foi configurado."
                );
            }

            return message.reply(
                `📱 Canal Mobile configurado: <#${cfg.mobileChannelId}>`
            );
        }

        // ====================================================
        // .SSEMU
        // ====================================================

        if (content.toLowerCase() === ".ssemu") {
            if (!isAdmin(message.member)) {
                return message.reply("❌ Você não possui permissão.");
            }

            const cfg = getGuildConfig(message.guild.id);

            if (!cfg.emulatorChannelId) {
                return message.reply(
                    "❌ O canal Emulador ainda não foi configurado."
                );
            }

            return message.reply(
                `💻 Canal Emulador configurado: <#${cfg.emulatorChannelId}>`
            );
        }

        // ====================================================
        // .MED
        // ====================================================

        if (content.toLowerCase() === ".med") {
            return sendMediatorPanel(message);
        }

        // ====================================================
        // .P
        // ====================================================

        if (content.toLowerCase() === ".p") {
            return message.reply({
                embeds: [
                    statsEmbed(
                        message.guild.id,
                        message.author.id
                    )
                ]
            });
        }

        // ====================================================
        // DADOS DA SALA ENVIADOS PELO MEDIADOR
        // ====================================================

        const match = [...matches.values()].find(
            match =>
                match.channelId === message.channel.id &&
                match.status === "room_ready" &&
                !match.roomId
        );

        if (
            match &&
            isMediator(message.member) &&
            canManageMatch(message.member, match)
        ) {
            const room = extractRoomData(message.content);

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
});

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN).catch(error => {
    console.error("❌ Não foi possível conectar o bot:");
    console.error(error);
});
