require('dotenv').config();
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
  ChannelSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const TOKEN = process.env.DISCORD_TOKEN;
const DATA_FILE = path.join(__dirname, 'data.json');

if (!TOKEN) {
  console.error('ERRO: coloque DISCORD_TOKEN no .env');
  process.exit(1);
}

/*
========================================================
VALORES DAS FILAS
========================================================
*/
const VALUES = [
  { cents: 30, label: 'R$ 0,30' },
  { cents: 50, label: 'R$ 0,50' },
  { cents: 100, label: 'R$ 1,00' },
  { cents: 200, label: 'R$ 2,00' },
  { cents: 300, label: 'R$ 3,00' },
  { cents: 500, label: 'R$ 5,00' },
  { cents: 700, label: 'R$ 7,00' },
  { cents: 1000, label: 'R$ 10,00' },
  { cents: 2000, label: 'R$ 20,00' },
  { cents: 3000, label: 'R$ 30,00' },
  { cents: 5000, label: 'R$ 50,00' },
  { cents: 10000, label: 'R$ 100,00' }
];

const MODES = {
  mobile: { label: 'Mobile', emoji: '📱' },
  emu: { label: 'Emulador', emoji: '💻' },
  misto: { label: 'Misto', emoji: '📱💻' }
};

const FORMATS = ['1x1', '2x2', '3x3', '4x4'];

/*
========================================================
BANCO DE DADOS
========================================================
*/
function defaultData() {
  return {
    guilds: {},
    users: {},
    matches: {},
    analysis: {},
    counters: {}
  };
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const data = defaultData();
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      return data;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Object.assign(defaultData(), parsed);
  } catch (error) {
    console.error('Erro ao carregar data.json:', error);
    return defaultData();
  }
}

let db = loadData();
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error('Erro ao salvar data.json:', error);
  }
}

/*
========================================================
DADOS DO SERVIDOR
========================================================
*/
function guildData(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      mediatorRoleId: null,
      analystRoleId: null,
      analystChannel1Id: null,
      analystChannel2Id: null,
      mediatorQueueChannelId: null,
      embedColor: '#5865F2',
      botAvatar: null,
      pix: {},
      queueChannels: {},
      queues: {},
      mediatorQueue: [],
      mediatorIndex: 0
    };
  }
  const g = db.guilds[guildId];
  if (!g.pix) g.pix = {};
  if (!g.queueChannels) g.queueChannels = {};
  if (!g.queues) g.queues = {};
  if (!Array.isArray(g.mediatorQueue)) g.mediatorQueue = [];
  if (!Number.isInteger(g.mediatorIndex)) g.mediatorIndex = 0;
  if (!g.embedColor) g.embedColor = '#5865F2';
  return g;
}

/*
========================================================
DADOS DO USUÁRIO
========================================================
*/
function userData(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      wins: 0,
      losses: 0,
      woWins: 0,
      coins: 0,
      normalMatches: 0
    };
  }
  return db.users[userId];
}

/*
========================================================
UTILIDADES
========================================================
*/
function safeColor(value) {
  if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value.trim())) {
    return '#5865F2';
  }
  return value.trim();
}

function money(cents) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function mention(userId) {
  return `<@${userId}>`;
}

function slug(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 55);
}

function isOwner(message) {
  return message.guild && message.guild.ownerId === message.author.id;
}

function hasRole(member, roleId) {
  return Boolean(roleId && member?.roles?.cache?.has(roleId));
}

function isMediator(member, guildId) {
  const g = guildData(guildId);
  return hasRole(member, g.mediatorRoleId);
}

function isAnalyst(member, guildId) {
  const g = guildData(guildId);
  return hasRole(member, g.analystRoleId);
}

/*
========================================================
CHAVES DOS COMPONENTES
========================================================
*/
function queueKey(mode, format, cents, rule = 'normal') {
  return `${mode}|${format}|${cents}|${rule}`;
}

function queueButtonId(action, mode, format, cents, rule = 'normal') {
  return `queue:${action}:${mode}:${format}:${cents}:${rule}`;
}

function matchButtonId(action, matchId, extra = '') {
  return `match:${action}:${matchId}${extra ? `:${extra}` : ''}`;
}

function configId(action, extra = '') {
  return `config:${action}${extra ? `:${extra}` : ''}`;
}

/*
========================================================
FILA DE MEDIADORES
========================================================
*/
function activeMediatorIds(guild) {
  const g = guildData(guild.id);
  if (!g.mediatorRoleId) return [];
  if (!Array.isArray(g.mediatorQueue)) g.mediatorQueue = [];
  return g.mediatorQueue.filter(Boolean);
}

function nextMediator(guild) {
  const g = guildData(guild.id);
  const mediators = activeMediatorIds(guild);
  if (!mediators.length) return null;
  const index = g.mediatorIndex % mediators.length;
  const mediatorId = mediators[index];
  g.mediatorIndex = (index + 1) % mediators.length;
  saveData();
  return mediatorId;
}

/*
========================================================
EMBED DA FILA
========================================================
*/
function queueEmbed(guild, mode, format, cents, rule, players = []) {
  const g = guildData(guild.id);
  const modeData = MODES[mode];
  let ruleText;
  if (format === '1x1') {
    ruleText = rule === 'infinite' ? '♾️ Gelo infinito'
      : rule === 'normal' ? '🧊 Gelo normal'
      : '🎮 Escolha o modo nos botões abaixo';
  } else {
    ruleText = '🎮 Normal';
  }
  const playerText = players.length
    ? players.map((id, i) => `${i + 1}. ${mention(id)}`).join('\n')
    : '🟢 Aguardando jogadores...';

  return new EmbedBuilder()
    .setColor(safeColor(g.embedColor))
    .setTitle(`💎 ${money(cents)} • ${format}`)
    .setDescription(
      `${modeData.emoji} **${modeData.label}**\n\n` +
      `🎯 **Formato:** ${format}\n` +
      `⚙️ **Modo:** ${ruleText}\n` +
      `💰 **Entrada:** ${money(cents)}\n\n` +
      `👥 **JOGADORES**\n${playerText}\n\n` +
      `📊 **Vagas:** ${players.length}/2\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `⚡ **ENTRE NA FILA E AGUARDE O ADVERSÁRIO**\n` +
      `━━━━━━━━━━━━━━━━━━`
    )
    .setFooter({ text: '🎮 Sistema de Apostas' });
}

/*
========================================================
BOTÕES DAS FILAS
========================================================
*/
function queueButtons(mode, format, cents, rule = 'choice') {
  if (format === '1x1') {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(queueButtonId('join', mode, format, cents, 'infinite'))
        .setLabel('Gelo infinito').setEmoji('♾️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(queueButtonId('join', mode, format, cents, 'normal'))
        .setLabel('Gelo normal').setEmoji('🧊').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(queueButtonId('leave', mode, format, cents, 'all'))
        .setLabel('Sair da fila').setEmoji('🚪').setStyle(ButtonStyle.Danger)
    );
  }
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(queueButtonId('join', mode, format, cents, 'normal'))
      .setLabel('Entrar na fila').setEmoji('🎮').setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(queueButtonId('leave', mode, format, cents, 'normal'))
      .setLabel('Sair da fila').setEmoji('🚪').setStyle(ButtonStyle.Danger)
  );
}

/*
========================================================
PAYLOAD DA FILA
========================================================
*/
function queuePayload(guild, mode, format, cents, rule, players) {
  return {
    embeds: [queueEmbed(guild, mode, format, cents, rule, players)],
    components: [queueButtons(mode, format, cents, rule)]
  };
}

/*
========================================================
PARTIDAS
========================================================
*/
function findMatchByChannel(channelId) {
  return Object.values(db.matches).find(m => m.channelId === channelId && !m.finalized);
}

function findActiveMatchForUser(userId) {
  return Object.values(db.matches).find(m => !m.finalized && m.players.includes(userId));
}

function findMatchById(matchId) {
  return db.matches[matchId] || null;
}

function makeMatchId(guildId) {
  const key = `match:${guildId}`;
  db.counters[key] = Number(db.counters[key] || 0) + 1;
  saveData();
  return String(db.counters[key]);
}

/*
========================================================
EMBED DE CONFIRMAÇÃO
========================================================
*/
function matchConfirmEmbed(guild, match) {
  const g = guildData(guild.id);
  return new EmbedBuilder()
    .setColor(safeColor(g.embedColor))
    .setTitle('🎮 Partida iniciada ✅')
    .setDescription(
      `**Partida:** ${match.id}\n` +
      `**Modo:** ${MODES[match.mode].emoji} ${MODES[match.mode].label}\n` +
      `**Formato:** ${match.format}\n` +
      `**Valor:** ${money(match.cents)} por jogador\n\n` +
      `👤 **Jogador 1:** ${mention(match.players[0])}\n` +
      `👤 **Jogador 2:** ${mention(match.players[1])}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `Confirme sua participação. Quando os dois confirmarem,\n` +
      `o Pix do ADM responsável será exibido para pagamento.\n\n` +
      `⚠️ Se alguém cancelar, a aposta será encerrada.`
    )
    .setFooter({ text: '🎮 Sistema de Apostas' });
}

function confirmButtons(match) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(matchButtonId('confirm', match.id))
      .setLabel('Confirmar').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(matchButtonId('cancel', match.id))
      .setLabel('Cancelar').setEmoji('❌').setStyle(ButtonStyle.Danger)
  );
}

/*
========================================================
PIX
========================================================
*/
function pixEmbed(guild, match) {
  const g = guildData(guild.id);
  const pix = g.pix[match.mediatorId];
  return new EmbedBuilder()
    .setColor(safeColor(g.embedColor))
    .setTitle('💳 PAGAMENTO PARA INICIAR')
    .setDescription(
      `Os dois jogadores confirmaram a aposta.\n\n` +
      `👤 **ADM responsável:** ${pix?.name || mention(match.mediatorId)}\n` +
      `💰 **Valor por jogador:** ${money(match.cents)}\n` +
      `💵 **Total da aposta:** ${money(match.cents * 2)}\n\n` +
      `🔑 **Chave Pix:**\n\`${pix?.key || 'Não cadastrada'}\`\n\n` +
      `📷 **QR Code:** ${pix?.qrUrl ? 'enviado abaixo.' : 'não cadastrado.'}\n\n` +
      `📌 Após o pagamento, aguarde o Mediador criar a sala.`
    )
    .setFooter({ text: '🎮 Sistema de Apostas' });
}

async function sendPix(guild, channel, match) {
  const g = guildData(guild.id);
  const pix = g.pix[match.mediatorId];
  if (!pix || !pix.name || !pix.key) {
    await channel.send({ embeds: [
      new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('⚠️ Pix do ADM não cadastrado')
        .setDescription(`Configure em **.config → Pix ADM**.`)
    ]});
    return;
  }
  await channel.send({ embeds: [pixEmbed(guild, match)] });
  if (pix.qrUrl) {
    await channel.send({ content: '📷 **QR Code do Pix:**', files: [pix.qrUrl] })
      .catch(() => channel.send(`📷 **QR Code:** ${pix.qrUrl}`));
  }
}

/*
========================================================
PAINEL DOS MEDIADORES
========================================================
*/
function mediatorPanel(guild) {
  const g = guildData(guild.id);
  const ids = activeMediatorIds(guild);
  const list = ids.length
    ? ids.map((id, i) => `${i + 1}. ${mention(id)}`).join('\n')
    : '🔴 Nenhum mediador está na fila.';
  return new EmbedBuilder()
    .setColor(safeColor(g.embedColor))
    .setTitle('🛡️ FILA DE MEDIADORES')
    .setDescription(
      `Somente membros com o cargo **Mediador** configurado podem entrar.\n\n` +
      `A distribuição das apostas é feita em **loop**, seguindo a ordem da fila.\n\n` +
      `👥 **Mediadores na fila:**\n${list}\n\n📊 **Total:** ${ids.length}`
    )
    .setFooter({ text: '🎮 Sistema de Apostas' });
}

function mediatorPanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('medq:join').setLabel('Entrar na fila').setEmoji('🟢').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('medq:leave').setLabel('Sair da fila').setEmoji('🔴').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('medq:refresh').setLabel('Atualizar').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
  );
}

/*
========================================================
BOTÕES DO MEDIADOR
========================================================
*/
function resultButtons(match) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(matchButtonId('winner', match.id)).setLabel('Escolher vencedor').setEmoji('🏆').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(matchButtonId('wo', match.id)).setLabel('Vitória por W.O.').setEmoji('⚡').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(matchButtonId('finish', match.id)).setLabel('Finalizar aposta').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );
}

function playerSelect(match, action) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(matchButtonId(action, match.id))
      .setPlaceholder('Selecione o jogador')
      .addOptions(match.players.map((id, i) =>
        new StringSelectMenuOptionBuilder().setLabel(`Jogador ${i + 1}`).setDescription(id).setValue(id)
      ))
  );
}

/*
========================================================
CRIAR PARTIDA
========================================================
*/
async function createMatch(guild, queueChannel, mode, format, cents, rule, players) {
  const mediatorId = nextMediator(guild);
  if (!mediatorId) return { error: 'Sem mediadores disponíveis no momento.' };
  const mediator = await guild.members.fetch(mediatorId).catch(() => null);
  if (!mediator) return { error: 'Sem mediadores disponíveis no momento.' };

  const matchId = makeMatchId(guild.id);
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    ...players.map(userId => ({
      id: userId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    })),
    { id: mediator.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] }
  ];

  const privateChannel = await guild.channels.create({
    name: `partida-${matchId}`,
    type: ChannelType.GuildText,
    parent: queueChannel.parentId || undefined,
    permissionOverwrites: overwrites,
    topic: `Partida ${matchId} | ${format} | ${MODES[mode].label} | ${money(cents)}`
  });

  const match = {
    id: matchId, guildId: guild.id, channelId: privateChannel.id, queueChannelId: queueChannel.id,
    mode, format, cents, rule, players, mediatorId, confirmed: [], finalized: false,
    resultType: null, winnerId: null, roomCreated: false, roomId: null, roomPassword: null, createdAt: Date.now()
  };
  db.matches[matchId] = match;
  saveData();

  const mentions = players.map(mention).join(' • ');
  await privateChannel.send({
    content: `${mentions}\n🛡️ **Mediador:** ${mention(mediatorId)}`,
    embeds: [matchConfirmEmbed(guild, match)],
    components: [confirmButtons(match)]
  });
  return { match, channel: privateChannel };
}

/*
========================================================
ATUALIZAR FILA
========================================================
*/
async function updateQueueMessage(guild, state, mode, format, cents, rule) {
  const channel = guild.channels.cache.get(state.channelId);
  if (!channel) return;
  const message = await channel.messages.fetch(state.messageId).catch(() => null);
  if (!message) return;
  await message.edit(queuePayload(guild, mode, format, cents, rule, state.players));
}

/*
========================================================
BOTÕES DAS FILAS
========================================================
*/
async function handleQueueButton(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1], mode = parts[2], format = parts[3], cents = Number(parts[4]), selectedRule = parts[5];

  if (!MODES[mode] || !FORMATS.includes(format) || !Number.isFinite(cents)) {
    return interaction.reply({ content: '⚠️ Fila inválida.', ephemeral: true });
  }
  const g = guildData(interaction.guildId);
  const key = queueKey(mode, format, cents, format === '1x1' ? 'all' : 'normal');
  if (!g.queues[key]) g.queues[key] = { players: [], rule: null, channelId: interaction.channelId, messageId: interaction.message.id };
  const state = g.queues[key];
  state.channelId = interaction.channelId; state.messageId = interaction.message.id;
  if (!Array.isArray(state.players)) state.players = [];

  if (action === 'leave') {
    await interaction.deferUpdate();
    const idx = state.players.indexOf(interaction.user.id);
    if (idx !== -1) state.players.splice(idx, 1);
    if (state.players.length === 0 && format === '1x1') state.rule = null;
    saveData();
    return updateQueueMessage(interaction.guild, state, mode, format, cents, format === '1x1' ? (state.rule || 'choice') : 'normal');
  }

  const mediators = activeMediatorIds(interaction.guild);
  if (!mediators.length) return interaction.reply({ content: '⚠️ **Sem mediadores disponíveis no momento.**', ephemeral: true });
  if (state.players.includes(interaction.user.id)) return interaction.reply({ content: '⚠️ Você já está nesta fila.', ephemeral: true });
  if (findActiveMatchForUser(interaction.user.id)) return interaction.reply({ content: '⚠️ Você já está em uma aposta ativa.', ephemeral: true });
  if (state.players.length >= 2) return interaction.reply({ content: '⚠️ Esta fila já está cheia.', ephemeral: true });

  if (format === '1x1') {
    if (!state.rule) state.rule = selectedRule;
    if (state.rule !== selectedRule) {
      const rn = state.rule === 'infinite' ? 'Gelo infinito' : 'Gelo normal';
      return interaction.reply({ content: `⚠️ Esta fila já foi iniciada em **${rn}**. Entre pelo mesmo botão.`, ephemeral: true });
    }
  }

  state.players.push(interaction.user.id);
  saveData();
  if (state.players.length < 2) {
    return interaction.update(queuePayload(interaction.guild, mode, format, cents, format === '1x1' ? (state.rule || 'choice') : 'normal', state.players));
  }

  const players = [...state.players];
  const matchRule = format === '1x1' ? (state.rule || selectedRule) : 'normal';
  state.players = []; state.rule = null; saveData();

  const result = await createMatch(interaction.guild, interaction.channel, mode, format, cents, matchRule, players);
  if (result.error) {
    state.players = players; state.rule = format === '1x1' ? matchRule : null; saveData();
    return interaction.update(queuePayload(interaction.guild, mode, format, cents, format === '1x1' ? (state.rule || 'choice') : 'normal', state.players));
  }
  return interaction.update(queuePayload(interaction.guild, mode, format, cents, format === '1x1' ? 'choice' : 'normal', []));
}

/*
========================================================
CANCELAMENTO
========================================================
*/
async function cancelMatch(guild, match) {
  if (match.finalized) return;
  match.finalized = true; saveData();
  const channel = guild.channels.cache.get(match.channelId);
  if (!channel) return;
  await channel.send({ embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ Aposta cancelada').setDescription('A aposta foi cancelada. O canal será deletado em **15 segundos**.')] }).catch(() => {});
  setTimeout(() => channel.delete().catch(() => {}), 15000);
}

/*
========================================================
PERFIL
========================================================
*/
function statsEmbed(guild, user) {
  const stats = userData(user.id);
  const total = stats.wins + stats.losses;
  const rate = total > 0 ? ((stats.wins / total) * 100).toFixed(1) : '0.0';
  return new EmbedBuilder()
    .setColor(safeColor(guildData(guild.id).embedColor))
    .setTitle(`📊 PERFIL DE ${user.username}`)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .setDescription(
      `🏆 **Vitórias:** ${stats.wins}\n❌ **Derrotas:** ${stats.losses}\n` +
      `⚡ **Vitórias por W.O.:** ${stats.woWins}\n🪙 **Coins:** ${stats.coins}\n\n` +
      `🎮 **Partidas normais:** ${stats.normalMatches}\n📈 **Aproveitamento:** ${rate}%\n\n🎮 Sistema de Apostas`
    );
}

/*
========================================================
CONFIGURAÇÃO
========================================================
*/
function configMain(guild) {
  const g = guildData(guild.id);
  return new EmbedBuilder()
    .setColor(safeColor(g.embedColor))
    .setTitle('⚙️ • CONFIGURAÇÃO')
    .setDescription(
      `🎨 **Aparência**\nCor: \`${g.embedColor}\`\nFoto do bot: ${g.botAvatar ? 'configurada' : 'padrão'}\n\n` +
      `🛡️ **Cargos**\nMediador: ${g.mediatorRoleId ? `<@&${g.mediatorRoleId}>` : '❌'}\nAnalista: ${g.analystRoleId ? `<@&${g.analystRoleId}>` : '❌'}\n\n` +
      `📊 **Análises**\nCanal 1: ${g.analystChannel1Id ? `<#${g.analystChannel1Id}>` : '❌'}\nCanal 2: ${g.analystChannel2Id ? `<#${g.analystChannel2Id}>` : '❌'}\n\n` +
      `🛡️ **Fila de Mediadores**\n${g.mediatorQueueChannelId ? `<#${g.mediatorQueueChannelId}>` : '❌'}\n\n` +
      `💳 **Pix ADM**\n${Object.keys(g.pix).length} ADM(s) cadastrado(s).`
    )
    .setFooter({ text: 'Sistema de Apostas' });
}

function configButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(configId('roles')).setLabel('Cargos').setEmoji('👥').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(configId('channels')).setLabel('Canais').setEmoji('📁').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(configId('pix')).setLabel('Pix ADM').setEmoji('💳').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(configId('appearance')).setLabel('Cor / Aparência').setEmoji('🎨').setStyle(ButtonStyle.Secondary)
  );
}

function roleMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(configId('rolechoose')).setPlaceholder('Escolha o cargo para configurar')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('Mediador').setValue('mediator').setEmoji('🛡️'),
        new StringSelectMenuOptionBuilder().setLabel('Analista').setValue('analyst').setEmoji('📊')
      )
  );
}

function channelMenu(action, placeholder) {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId(configId(action)).setPlaceholder(placeholder).setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );
}

function pixButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(configId('pixadd')).setLabel('Cadastrar / Editar ADM').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(configId('pixlist')).setLabel('Listar ADMs').setEmoji('📋').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(configId('pixremove')).setLabel('Remover ADM').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
  );
}

function appearanceButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(configId('colormodal')).setLabel('Mudar cor das embeds').setEmoji('🎨').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(configId('avatarmodal')).setLabel('Mudar foto do bot').setEmoji('🖼️').setStyle(ButtonStyle.Secondary)
  );
}

async function handleConfig(interaction) {
  if (!isOwner(interaction)) return interaction.reply({ content: '❌ Somente o dono do servidor.', ephemeral: true });
  const parts = interaction.customId.split(':');
  const action = parts[1], extra = parts[2];
  const g = guildData(interaction.guildId);

  if (action === 'roles') return interaction.update({ embeds: [configMain(interaction.guild)], components: [roleMenu()] });
  if (action === 'channels') return interaction.update({ embeds: [configMain(interaction.guild)], components: [channelMenu('medchannel','Escolha canal da fila de mediadores'), channelMenu('analyst1','Canal 1'), channelMenu('analyst2','Canal 2')] });
  if (action === 'pix') return interaction.update({ embeds: [configMain(interaction.guild)], components: [pixButtons()] });
  if (action === 'appearance') return interaction.update({ embeds: [configMain(interaction.guild)], components: [appearanceButtons()] });

  if (action === 'rolechoose') {
    const type = interaction.values[0];
    const roles = [...interaction.guild.roles.cache.filter(r => r.id !== interaction.guild.id).sort((a,b)=>b.position-a.position).values()].slice(0,25);
    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(configId('roleset',type)).setPlaceholder('Escolha o cargo').addOptions(roles.map(r=>new StringSelectMenuOptionBuilder().setLabel(r.name.slice(0,100)).setValue(r.id))));
    return interaction.update({ content: `👥 Escolha o cargo de **${type==='mediator'?'Mediador':'Analista'}**.`, embeds:[], components:[row] });
  }

  if (action === 'roleset') {
    const type = extra, roleId = interaction.values[0];
    if (type==='mediator') g.mediatorRoleId = roleId; else g.analystRoleId = roleId;
    saveData();
    return interaction.update({ content: `✅ Cargo de ${type==='mediator'?'Mediador':'Analista'} configurado.`, embeds:[configMain(interaction.guild)], components:[configButtons()] });
  }

  if (['medchannel','analyst1','analyst2'].includes(action)) {
    const cid = interaction.values[0];
    if (action==='medchannel') g.mediatorQueueChannelId=cid;
    if (action==='analyst1') g.analystChannel1Id=cid;
    if (action==='analyst2') g.analystChannel2Id=cid;
    saveData();
    return interaction.update({ content: `✅ Canal configurado: <#${cid}>`, embeds:[configMain(interaction.guild)], components:[configButtons()] });
  }

  if (action === 'pixadd') {
    const modal = new ModalBuilder().setCustomId('modal:pix').setTitle('Cadastrar / Editar ADM');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user').setLabel('ID do ADM').setPlaceholder('Ex.: 1234567890').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nome do Pix / ADM').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Chave Pix').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qr').setLabel('URL do QR Code').setPlaceholder('https://...').setStyle(TextInputStyle.Paragraph).setRequired(false))
    );
    return interaction.showModal(modal);
  }

  if (action === 'pixlist') {
    const entries = Object.entries(g.pix);
    const text = entries.length ? entries.map(([id,p])=>`👤 ${mention(id)} — **${p.name}**\n🔑 \`${p.key}\`\n📷 ${p.qrUrl||'sem QR Code'}`).join('\n\n') : 'Nenhum ADM cadastrado.';
    return interaction.update({ embeds:[new EmbedBuilder().setColor(safeColor(g.embedColor)).setTitle('💳 ADMs / PIX').setDescription(text)], components:[pixButtons()] });
  }

  if (action === 'pixremove') {
    const ids = Object.keys(g.pix);
    if (!ids.length) return interaction.reply({content:'⚠️ Sem ADMs cadastrados.',ephemeral:true});
    return interaction.update({ embeds:[configMain(interaction.guild)], components:[new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(configId('pixremoveuser')).setPlaceholder('Selecione o ADM').setMinValues(1).setMaxValues(1))] });
  }

  if (action === 'pixremoveuser') {
    const id = interaction.values[0]; delete g.pix[id]; saveData();
    return interaction.update({ content:`✅ ADM ${mention(id)} removido.`, embeds:[configMain(interaction.guild)], components:[configButtons()] });
  }

  if (action === 'colormodal') {
    const modal = new ModalBuilder().setCustomId('modal:appearance').setTitle('Cor da Embed');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color').setLabel('Cor HEX').setPlaceholder('#5865F2').setValue(g.embedColor).setStyle(TextInputStyle.Short).setRequired(true)));
    return interaction.showModal(modal);
  }

  if (action === 'avatarmodal') {
    const modal = new ModalBuilder().setCustomId('modal:avatar').setTitle('Foto de perfil do bot');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel('URL da imagem').setPlaceholder('https://...').setStyle(TextInputStyle.Short).setRequired(true)));
    return interaction.showModal(modal);
  }
}

async function handleModal(interaction) {
  if (!isOwner(interaction)) return interaction.reply({content:'❌ Somente o dono.',ephemeral:true});

  if (interaction.customId === 'modal:pix') {
    const userId = interaction.fields.getTextInputValue('user').trim();
    const member = await interaction.guild.members.fetch(userId).catch(()=>null);
    if (!member) return interaction.reply({content:'❌ ID inválido ou usuário não está no servidor.',ephemeral:true});
    const name = interaction.fields.getTextInputValue('name').trim();
    const key = interaction.fields.getTextInputValue('key').trim();
    const qrUrl = interaction.fields.getTextInputValue('qr').trim();
    guildData(interaction.guildId).pix[userId] = {name,key,qrUrl:qrUrl||null};
    saveData();
    return interaction.reply({content:`✅ Pix do ADM ${mention(userId)} cadastrado!`,ephemeral:true});
  }

  if (interaction.customId === 'modal:appearance') {
    const color = interaction.fields.getTextInputValue('color').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return interaction.reply({content:'❌ Cor inválida. Use #5865F2.',ephemeral:true});
    guildData(interaction.guildId).embedColor = color; saveData();
    return interaction.reply({content:`✅ Cor alterada para ${color}.`,ephemeral:true});
  }

  if (interaction.customId === 'modal:avatar') {
    const url = interaction.fields.getTextInputValue('url').trim();
    try { new URL(url); } catch { return interaction.reply({content:'❌ URL inválida.',ephemeral:true}); }
    try { await interaction.client.user.setAvatar(url); } catch { return interaction.reply({content:'❌ Não foi possível alterar a foto.',ephemeral:true}); }
    guildData(interaction.guildId).botAvatar = url; saveData();
    return interaction.reply({content:'✅ Foto alterada com sucesso!',ephemeral:true});
  }
}

async function handleMediatorQueue(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const g = guildData(interaction.guildId);

  if (action === 'refresh') return interaction.update({embeds:[mediatorPanel(interaction.guild)], components:[mediatorPanelButtons()]});
  if (!isMediator(interaction.member, interaction.guildId)) return interaction.reply({content:'❌ Você não tem o cargo de Mediador.',ephemeral:true});

  if (action === 'join') {
    if (!g.mediatorQueue.includes(interaction.user.id)) g.mediatorQueue.push(interaction.user.id);
    saveData();
    return interaction.update({embeds:[mediatorPanel(interaction.guild)], components:[mediatorPanelButtons()]});
  }

  if (action === 'leave') {
    const idx = g.mediatorQueue.indexOf(interaction.user.id);
    if (idx !== -1) g.mediatorQueue.splice(idx,1);
    if (!g.mediatorQueue.length) g.mediatorIndex=0;
    else if (g.mediatorIndex >= g.mediatorQueue.length) g.mediatorIndex=0;
    saveData();
    return interaction.update({embeds:[mediatorPanel(interaction.guild)], components:[mediatorPanelButtons()]});
  }
}

async function handleMatchButton(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1], matchId = parts[2];
  const match = findMatchById(matchId);
  if (!match || match.finalized) return interaction.reply({content:'⚠️ Aposta encerrada.',ephemeral:true});

  if (action === 'confirm') {
    if (!match.players.includes(interaction.user.id)) return interaction.reply({content:'❌ Você não participa desta aposta.',ephemeral:true});
    if (!match.confirmed.includes(interaction.user.id)) match.confirmed.push(interaction.user.id);
    saveData();
    await interaction.update({embeds:[matchConfirmEmbed(interaction.guild,match)], components:[confirmButtons(match)]});
    if (match.confirmed.length === 2) {
      await interaction.message.edit({components:[]}).catch(()=>{});
      await sendPix(interaction.guild, interaction.channel, match);
    }
    return;
  }

  if (action === 'cancel') {
    if (!match.players.includes(interaction.user.id) && interaction.user.id !== match.mediatorId) return interaction.reply({content:'❌ Sem permissão para cancelar.',ephemeral:true});
    await interaction.reply({content:'✅ Aposta cancelada.',ephemeral:true});
    return cancelMatch(interaction.guild, match);
  }

  if (action === 'winner') {
    if (interaction.user.id !== match.mediatorId) return interaction.reply({content:'❌ Somente o Mediador pode escolher o vencedor.',ephemeral:true});
    return interaction.reply({content:'🏆 Escolha o vencedor:', components:[playerSelect(match,'winnerselect')], ephemeral:true});
  }

  if (action === 'wo') {
    if (interaction.user.id !== match.mediatorId) return interaction.reply({content:'❌ Somente o Mediador.',ephemeral:true});
    return interaction.reply({content:'⚡ Escolha quem venceu por W.O.:', components:[playerSelect(match,'woselect')], ephemeral:true});
  }

  if (action === 'finish') {
    if (interaction.user.id !== match.mediatorId) return interaction.reply({content:'❌ Somente o Mediador pode finalizar.',ephemeral:true});
    if (!match.resultType) return interaction.reply({content:'⚠️ Registre primeiro o resultado.',ephemeral:true});
    match.finalized=true; saveData();
    await interaction.reply({content:'✅ Aposta finalizada. Canal será deletado em 15s.',ephemeral:true});
    setTimeout(()=>interaction.channel.delete().catch(()=>{}),15000);
    return;
  }

  if (action === 'copyroom') {
    const what = parts[3];
    if (!match.roomCreated) return interaction.reply({content:'⚠️ Sala ainda não criada.',ephemeral:true});
    if (what==='id') return interaction.reply({content:`🆔 ID: \`${match.roomId}\``,ephemeral:true});
    return interaction.reply({content:`🔐 Senha: \`${match.roomPassword}\``,ephemeral:true});
  }
}

async function handleResultSelect(interaction) {
  const parts = interaction.customId.split(':');
  const action = parts[1], matchId = parts[2];
  const match = findMatchById(matchId);
  if (!match || match.finalized) return interaction.reply({content:'⚠️ Aposta encerrada.',ephemeral:true});
  if (interaction.user.id !== match.mediatorId) return interaction.reply({content:'❌ Somente o Mediador.',ephemeral:true});

  const winnerId = interaction.values[0];
  if (action === 'winnerselect') {
    const loserId = match.players.find(id=>id!==winnerId);
    const winner = userData(winnerId), loser = userData(loserId);
    winner.wins++; winner.coins++; winner.normalMatches++;
    loser.losses++; loser.normalMatches++;
    match.resultType='normal'; match.winnerId=winnerId; saveData();
    return interaction.update({content:`🏆 Vencedor: ${mention(winnerId)}\n\n🪙 +1 Coin\n🏆 +1 Vitória\n❌ +1 Derrota para o perdedor.`, components:[]});
  }

  if (action === 'woselect') {
    userData(winnerId).woWins++;
    match.resultType='wo'; match.winnerId=winnerId; saveData();
    return interaction.update({content:`⚡ Vitória por W.O.: ${mention(winnerId)}\n\nℹ️ Apenas estatística de W.O. registrada.`, components:[]});
  }
}

async function detectRoom(message) {
  if (!message.guild || message.author.bot) return;
  const match = findMatchByChannel(message.channel.id);
  if (!match || match.finalized) return;
  if (message.author.id !== match.mediatorId) return;
  const text = message.content;
  const idMatch = text.match(/(?:ID(?:\s+DA\s+SALA)?|SALA)\s*[:#-]?\s*([A-Za-z0-9_-]{3,})/i);
  const passMatch = text.match(/(?:SENHA|PASS(?:WORD)?)\s*[:#-]?\s*([A-Za-z0-9_-]{2,})/i);
  if (!idMatch || !passMatch) return;
  match.roomId=idMatch[1]; match.roomPassword=passMatch[1]; match.roomCreated=true; saveData();
  await message.channel.setName(`pagar-${slug(money(match.cents*2))}`).catch(()=>{});
  const embed = new EmbedBuilder().setColor(safeColor(guildData(message.guild.id).embedColor)).setTitle('🤍 SALA CRIADA')
    .setDescription(`⏱️ **A sala será iniciada em 3 a 5 minutos**\n\n🆔 **ID da Sala**\n${match.roomId}\n\n🔐 **Senha**\n${match.roomPassword}`);
  const copyBtns = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(matchButtonId('copyroom',match.id,'id')).setLabel('Copiar ID').setEmoji('🆔').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(matchButtonId('copyroom',match.id,'pass')).setLabel('Copiar Senha').setEmoji('🔐').setStyle(ButtonStyle.Secondary)
  );
  await message.channel.send({embeds:[embed], components:[copyBtns, resultButtons(match)]});
}

/*
========================================================
COMANDOS DE PONTO (.) — TOTALMENTE REATIVADOS
========================================================
*/
async function handleDotCommand(message) {
  if (!message.content.startsWith('.')) return;
  const args = message.content.slice(1).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();
  if (!cmd) return;

  // .config
  if (cmd === 'config') {
    if (!isOwner(message)) return message.reply('❌ Somente o dono do servidor.');
    return message.reply({embeds:[configMain(message.guild)], components:[configButtons()]});
  }

  // .fila
  if (cmd === 'fila') {
    if (!isOwner(message)) return message.reply('❌ Somente o dono pode publicar filas.');
    const formato = args[0]?.toLowerCase();
    const modalidade = args[1]?.toLowerCase();
    const canal = message.mentions.channels.first();

    if (!formato || !FORMATS.includes(formato)) {
      return message.reply(`❌ Informe o formato: ${FORMATS.join(', ')}.\nExemplo: \`.fila 1x1 mobile #filas\``);
    }
    if (!modalidade || !MODES[modalidade]) {
      return message.reply(`❌ Modalidade inválida: mobile, emu, misto.\nExemplo: \`.fila 1x1 mobile #filas\``);
    }
    if (!canal) {
      return message.reply('❌ Mencione o canal.\nExemplo: `.fila 1x1 mobile #filas`');
    }

    if (formato === '1x1') {
      for (const v of VALUES) {
        const msg = await canal.send(queuePayload(message.guild, modalidade, formato, v.cents, 'choice', []));
        guildData(message.guild.id).queues[queueKey(modalidade, formato, v.cents, 'all')] = {
          players:[], rule:null, channelId:canal.id, messageId:msg.id
        };
      }
