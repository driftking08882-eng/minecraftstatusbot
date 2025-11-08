/**
 * Minecraft Server Status Bot
 * Updated by ChatGPT (mcstatus.io integration)
 *
 * Original: Team BLK
 * GitHub: https://github.com/BLKOFFICIAL
 */

require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, AttachmentBuilder } = require('discord.js');
const config = require('./config.json');
const chalk = require('chalk');
const { createCanvas } = require('canvas');
const { Chart } = require('chart.js/auto');

// node-fetch dynamic import for CommonJS
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Discord client setup
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Maps for managing updates and player history
const statusMessages = new Map();
const updateIntervals = new Map();
const playerHistory = new Map();

// Logging helper
const log = {
    info: (msg) => console.log(chalk.blue('ℹ️ [INFO]'), msg),
    success: (msg) => console.log(chalk.green('✅ [SUCCESS]'), msg),
    error: (msg) => console.log(chalk.red('❌ [ERROR]'), msg),
    warn: (msg) => console.log(chalk.yellow('⚠️ [WARN]'), msg)
};

// Initialize player history
function initializePlayerHistory(serverId) {
    if (!playerHistory.has(serverId)) {
        playerHistory.set(serverId, []);
    }
}

// Update history (hourly)
function updatePlayerHistory(serverId, playerCount, maxHistory = 24) {
    const history = playerHistory.get(serverId) || [];
    const now = Date.now();

    if (history.length === 0 || now - history[history.length - 1].timestamp >= 3600000) {
        history.push({ timestamp: now, count: playerCount });
        if (history.length > maxHistory) history.shift();
    } else {
        history[history.length - 1].count = playerCount;
    }

    playerHistory.set(serverId, history);
}

// Chart generation
async function generatePlayerChart(serverId, color = '#3498db') {
    const history = playerHistory.get(serverId) || [];
    if (history.length < 2) return null;

    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#2F3136';
    ctx.fillRect(0, 0, width, height);

    const labels = history.map(h => {
        const d = new Date(h.timestamp);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    const data = history.map(h => h.count);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Player Count',
                data,
                borderColor: color,
                backgroundColor: color + '33',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 4
            }]
        },
        options: {
            responsive: false,
            animation: false,
            plugins: {
                legend: { labels: { color: '#fff' } },
                title: { display: true, text: 'Player Count History', color: '#fff' }
            },
            scales: {
                x: { ticks: { color: '#fff' }, grid: { color: '#555' } },
                y: { ticks: { color: '#fff' }, grid: { color: '#555' } }
            }
        }
    });

    return canvas.toBuffer('image/png');
}

// Server status checker
async function checkServerStatus(ip, port = 25565) {
    try {
        const res = await fetch(`https://api.mcstatus.io/v2/status/java/${ip}:${port}`);
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const data = await res.json();

        let motdText = "";
        if (Array.isArray(data.motd?.clean)) motdText = data.motd.clean.join(" ");
        else if (typeof data.motd?.clean === "string") motdText = data.motd.clean;

        motdText = motdText.toLowerCase();

        const looksOffline =
            !data.online ||
            motdText.includes("this server is offline") ||
            motdText.includes("get this server more ram") ||
            (data.version?.name_clean && data.version.name_clean.toLowerCase().includes("offline")) ||
            data.players == null;

        if (looksOffline) {
            return { online: false, error: "Server is offline or sleeping (Aternos)" };
        }

        return {
            online: true,
            players: data.players?.online || 0,
            maxPlayers: data.players?.max || 0,
            version: data.version?.name_clean || 'Unknown',
            description: motdText || 'No description',
            ping: data.latency || 0
        };
    } catch (error) {
        log.error(`Failed to check status for ${ip}:${port} - ${error.message}`);
        return { online: false, error: error.message };
    }
}

// Bot ready
client.once('ready', () => {
    log.success(`Logged in as ${client.user.tag}`);
    client.user.setPresence({
        status: config.bot.presence.status,
        activities: config.bot.presence.activities.map(a => ({
            name: a.name,
            type: ActivityType[a.type]
        }))
    });
    initializeStatusUpdates();
});

// Update server status embeds
async function updateServerStatus(server) {
    const channel = await client.channels.fetch(server.channelId).catch(() => null);
    if (!channel) return log.error(`Channel ${server.channelId} not found`);

    const status = await checkServerStatus(server.ip, server.port);
    if (status.online) {
        initializePlayerHistory(server.channelId);
        updatePlayerHistory(server.channelId, status.players, server.display.chart.historyHours);
    }

    const embed = new EmbedBuilder()
        .setTitle(config.embed.title)
        .setColor(status.online ? config.embed.colors.online : config.embed.colors.offline)
        .setTimestamp()
        .setFooter({ text: 'Server Status Bot' });

    embed.addFields(
        { name: '📡 Server', value: `${server.name} (${server.ip}:${server.port})`, inline: true },
        { name: '🔌 Status', value: status.online ? '✅ Online' : '❌ Offline', inline: true }
    );

    if (status.online) {
        embed.addFields(
            { name: '👥 Players', value: `${status.players}/${status.maxPlayers}`, inline: true },
            { name: '🏷️ Version', value: status.version, inline: true },
            { name: '📊 Ping', value: `${status.ping}ms`, inline: true },
            { name: '📝 MOTD', value: status.description }
        );

        if (server.display.showNextUpdate) {
            const next = Math.floor((Date.now() + server.updateInterval) / 1000);
            embed.addFields({ name: '⏱️ Next Update', value: `<t:${next}:R>`, inline: true });
        }
    } else {
        embed.addFields({ name: '❌ Error', value: status.error });
    }

    const files = [];
    if (server.display.type === 'chart' && server.display.chart.enabled && status.online) {
        try {
            const chartBuffer = await generatePlayerChart(server.channelId, server.display.chart.color);
            if (chartBuffer) {
                const attachment = new AttachmentBuilder(chartBuffer, { name: 'player-chart.png' });
                files.push(attachment);
                embed.setImage('attachment://player-chart.png');
            }
        } catch (err) {
            log.error(`Failed to generate player chart: ${err.message}`);
        }
    }

    const existing = statusMessages.get(server.channelId);
    try {
        if (existing) {
            await existing.edit({ embeds: [embed], files });
        } else {
            const msg = await channel.send({ embeds: [embed], files });
            statusMessages.set(server.channelId, msg);
        }
        log.info(`Updated status for ${server.name}`);
    } catch (error) {
        log.error(`Failed to update ${server.name}: ${error.message}`);
    }
}

// Initialize updates
function initializeStatusUpdates() {
    for (const interval of updateIntervals.values()) clearInterval(interval);
    updateIntervals.clear();

    for (const server of config.minecraft.servers) {
        updateServerStatus(server);
        const interval = setInterval(() => updateServerStatus(server), server.updateInterval);
        updateIntervals.set(server.channelId, interval);
        log.info(`Initialized status updates for ${server.name} (${server.ip}:${server.port})`);
    }
}

// Start the bot (secure)
client.login(process.env.TOKEN);
