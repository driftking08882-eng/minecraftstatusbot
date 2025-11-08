const { REST, Routes } = require('discord.js');
const config = require('./config.json');

// Define all slash commands
const commands = [
    {
        name: 'status',
        description: 'Show server status (online/offline, players, ping)',
        options: [
            {
                name: 'server',
                description: 'Select which server to check',
                type: 3, // STRING
                required: true,
                choices: config.minecraft.servers.map(server => ({
                    name: server.name,
                    value: server.name
                }))
            }
        ],
    },
    {
        name: 'ip',
        description: 'Show the Minecraft server IP address',
        options: [
            {
                name: 'server',
                description: 'Select which server to show IP for',
                type: 3,
                required: true,
                choices: config.minecraft.servers.map(server => ({
                    name: server.name,
                    value: server.name
                }))
            }
        ],
    },
    {
        name: 'players',
        description: 'List currently online players',
        options: [
            {
                name: 'server',
                description: 'Select which server to list players from',
                type: 3,
                required: true,
                choices: config.minecraft.servers.map(server => ({
                    name: server.name,
                    value: server.name
                }))
            }
        ],
    },
    {
        name: 'version',
        description: 'Show the current Minecraft server version',
        options: [
            {
                name: 'server',
                description: 'Select which server to show version info for',
                type: 3,
                required: true,
                choices: config.minecraft.servers.map(server => ({
                    name: server.name,
                    value: server.name
                }))
            }
        ],
    },
];

const rest = new REST({ version: '10' }).setToken(config.bot.token);

(async () => {
    try {
        console.log('⏳ Started refreshing application (/) commands...');

        // Option 1: Global commands (may take up to 1 hour to appear)
        await rest.put(
            Routes.applicationCommands(config.bot.clientId),
            { body: commands },
        );

        // ✅ Option 2 (faster): Uncomment and use for testing in 1 server
        // await rest.put(
        //     Routes.applicationGuildCommands(config.bot.clientId, 'YOUR_GUILD_ID'),
        //     { body: commands },
        // );

        console.log('✅ Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('❌ Error reloading commands:', error);
    }
})();
