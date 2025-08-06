const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class VoiceChatLeaderboard {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });

        // เก็บข้อมูลเวลา voice chat ของแต่ละ user
        this.voiceData = new Map(); // userId -> { totalTime, joinTime, isInVoice }
        this.leaderboardChannel = null;
        
        this.setupEvents();
    }

    setupEvents() {
        this.client.once('ready', () => {
            console.log(`✅ Bot เข้าสู่ระบบแล้วในชื่อ ${this.client.user.tag}`);
            this.updateLeaderboardPeriodically();
        });

        // ติดตาม voice state changes
        this.client.on('voiceStateUpdate', (oldState, newState) => {
            this.handleVoiceStateUpdate(oldState, newState);
        });

        // จัดการ slash commands และ button interactions
        this.client.on('interactionCreate', async (interaction) => {
            if (interaction.isCommand()) {
                await this.handleSlashCommand(interaction);
            } else if (interaction.isButton()) {
                await this.handleButtonInteraction(interaction);
            }
        });

        // จัดการคำสั่งแบบ text
        this.client.on('messageCreate', (message) => {
            if (message.author.bot) return;
            this.handleTextCommand(message);
        });
    }

    handleVoiceStateUpdate(oldState, newState) {
        const userId = newState.id;
        const now = Date.now();

        // ถ้าเข้า voice channel
        if (!oldState.channel && newState.channel) {
            if (!this.voiceData.has(userId)) {
                this.voiceData.set(userId, { totalTime: 0, joinTime: now, isInVoice: true });
            } else {
                const userData = this.voiceData.get(userId);
                userData.joinTime = now;
                userData.isInVoice = true;
            }
            console.log(`👤 ${newState.member.displayName} เข้า voice channel`);
        }
        
        // ถ้าออกจาก voice channel
        else if (oldState.channel && !newState.channel) {
            if (this.voiceData.has(userId)) {
                const userData = this.voiceData.get(userId);
                if (userData.isInVoice && userData.joinTime) {
                    const sessionTime = now - userData.joinTime;
                    userData.totalTime += sessionTime;
                    userData.isInVoice = false;
                    userData.joinTime = null;
                    console.log(`👋 ${oldState.member.displayName} ออกจาก voice channel (เวลา: ${this.formatTime(sessionTime)})`);
                }
            }
        }
    }

    async handleSlashCommand(interaction) {
        switch (interaction.commandName) {
            case 'leaderboard':
                await this.showLeaderboard(interaction, 0);
                break;
            case 'setleaderboard':
                await this.setLeaderboardChannel(interaction);
                break;
            case 'mytime':
                await this.showUserTime(interaction);
                break;
            case 'resetleaderboard':
                await this.resetLeaderboard(interaction);
                break;
        }
    }

    async handleButtonInteraction(interaction) {
        const [action, page] = interaction.customId.split('_');
        const pageNum = parseInt(page);

        if (action === 'prev' || action === 'next') {
            await this.showLeaderboard(interaction, pageNum, true);
        }
    }

    async handleTextCommand(message) {
        const prefix = '!';
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        switch (command) {
            case 'leaderboard':
            case 'lb':
                await this.showLeaderboard(message, 0);
                break;
            case 'setleaderboard':
                if (!message.member.permissions.has('MANAGE_CHANNELS')) {
                    return message.reply('❌ คุณไม่มีสิทธิ์ในการตั้งค่า leaderboard channel');
                }
                this.leaderboardChannel = message.channel;
                await message.reply('✅ ตั้งค่า leaderboard channel เรียบร้อยแล้ว');
                break;
            case 'mytime':
                await this.showUserTime(message);
                break;
        }
    }

    async showLeaderboard(interaction, page = 0, isUpdate = false) {
        const itemsPerPage = 10;
        const sortedUsers = this.getSortedLeaderboard();
        const totalPages = Math.ceil(sortedUsers.length / itemsPerPage);
        
        if (page >= totalPages) page = totalPages - 1;
        if (page < 0) page = 0;

        const start = page * itemsPerPage;
        const end = start + itemsPerPage;
        const pageUsers = sortedUsers.slice(start, end);

        const embed = new EmbedBuilder()
            .setTitle('🏆 Voice Chat Leaderboard')
            .setColor(0x00AE86)
            .setTimestamp()
            .setFooter({ text: `หน้า ${page + 1}/${totalPages || 1} • อัพเดทล่าสุด` });

        if (pageUsers.length === 0) {
            embed.setDescription('ยังไม่มีข้อมูล voice chat');
        } else {
            let description = '';
            for (let i = 0; i < pageUsers.length; i++) {
                const rank = start + i + 1;
                const { user, totalTime, isInVoice } = pageUsers[i];
                const member = await interaction.guild?.members.fetch(user).catch(() => null);
                const displayName = member?.displayName || 'Unknown User';
                
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
                const status = isInVoice ? '🔊' : '💤';
                
                description += `${medal} **#${rank}** ${status} **${displayName}**\n`;
                description += `⏱️ ${this.formatTime(totalTime)}\n\n`;
            }
            embed.setDescription(description);
        }

        const row = new ActionRowBuilder();
        
        if (totalPages > 1) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`prev_${page - 1}`)
                    .setLabel('◀️ ก่อนหน้า')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId(`next_${page + 1}`)
                    .setLabel('ถัดไป ▶️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === totalPages - 1)
            );
        }

        const messageOptions = { 
            embeds: [embed], 
            components: row.components.length > 0 ? [row] : [] 
        };

        if (isUpdate) {
            await interaction.update(messageOptions);
        } else if (interaction.isCommand?.()) {
            await interaction.reply(messageOptions);
        } else {
            await interaction.reply(messageOptions);
        }
    }

    async showUserTime(interaction) {
        const userId = interaction.user?.id || interaction.author?.id;
        const userData = this.voiceData.get(userId);
        
        let totalTime = 0;
        let status = 'ไม่ได้อยู่ใน voice channel';
        
        if (userData) {
            totalTime = userData.totalTime;
            if (userData.isInVoice && userData.joinTime) {
                totalTime += Date.now() - userData.joinTime;
                status = '🔊 กำลังอยู่ใน voice channel';
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('⏱️ เวลา Voice Chat ของคุณ')
            .setDescription(`**เวลารวม:** ${this.formatTime(totalTime)}\n**สถานะ:** ${status}`)
            .setColor(0x3498DB)
            .setTimestamp();

        if (interaction.isCommand?.()) {
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [embed] });
        }
    }

    async setLeaderboardChannel(interaction) {
        if (!interaction.member.permissions.has('MANAGE_CHANNELS')) {
            return await interaction.reply({ content: '❌ คุณไม่มีสิทธิ์ในการตั้งค่า leaderboard channel', ephemeral: true });
        }

        this.leaderboardChannel = interaction.channel;
        await interaction.reply('✅ ตั้งค่า leaderboard channel เรียบร้อยแล้ว');
    }

    async resetLeaderboard(interaction) {
        if (!interaction.member.permissions.has('ADMINISTRATOR')) {
            return await interaction.reply({ content: '❌ คุณไม่มีสิทธิ์ในการรีเซ็ต leaderboard', ephemeral: true });
        }

        this.voiceData.clear();
        await interaction.reply('✅ รีเซ็ต leaderboard เรียบร้อยแล้ว');
    }

    getSortedLeaderboard() {
        const users = [];
        const now = Date.now();

        for (const [userId, userData] of this.voiceData.entries()) {
            let totalTime = userData.totalTime;
            
            // รวมเวลาปัจจุบันถ้าอยู่ใน voice channel
            if (userData.isInVoice && userData.joinTime) {
                totalTime += now - userData.joinTime;
            }

            if (totalTime > 0) {
                users.push({
                    user: userId,
                    totalTime: totalTime,
                    isInVoice: userData.isInVoice
                });
            }
        }

        return users.sort((a, b) => b.totalTime - a.totalTime);
    }

    formatTime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    updateLeaderboardPeriodically() {
        setInterval(async () => {
            if (this.leaderboardChannel) {
                try {
                    const messages = await this.leaderboardChannel.messages.fetch({ limit: 1 });
                    const lastMessage = messages.first();
                    
                    if (lastMessage && lastMessage.author.id === this.client.user.id && lastMessage.embeds.length > 0) {
                        // อัพเดท leaderboard ที่มีอยู่แล้ว
                        await this.showLeaderboard({ 
                            guild: this.leaderboardChannel.guild,
                            update: async (options) => await lastMessage.edit(options)
                        }, 0, true);
                    }
                } catch (error) {
                    console.error('Error updating leaderboard:', error);
                }
            }
        }, 60000); // อัพเดททุก 1 นาที
    }

    async start(token) {
        try {
            await this.client.login(token);
        } catch (error) {
            console.error('❌ Error starting bot:', error);
        }
    }
}

// การใช้งานสำหรับ Replit
const bot = new VoiceChatLeaderboard();

// เริ่ม bot (ใช้ environment variable จาก Replit)
const token = process.env.DISCORD_TOKEN;
if (token) {
    bot.start(token);
    console.log('🚀 กำลังเริ่ม bot บน Replit...');
} else {
    console.error('❌ กรุณาใส่ DISCORD_TOKEN ใน Environment Variables ของ Replit');
}

// Keep alive server สำหรับ Replit
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send(`
        <h1>🤖 Discord Voice Leaderboard Bot</h1>
        <p>Status: ${bot.client.isReady() ? '✅ Online' : '❌ Offline'}</p>
        <p>Servers: ${bot.client.guilds.cache.size}</p>
        <p>Users being tracked: ${bot.voiceData.size}</p>
    `);
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        botReady: bot.client.isReady()
    });
});

app.listen(port, () => {
    console.log(`🌐 Web server running on port ${port}`);
});

// Export สำหรับการใช้งานในไฟล์อื่น
module.exports = VoiceChatLeaderboard;

/* 
🚀 วิธีการติดตั้งและใช้งานบน Replit:

1. สร้าง Repl ใหม่:
- เลือก Node.js template
- Copy โค้ดนี้ไปใส่ใน index.js

2. สร้างไฟล์ package.json:
{
  "name": "discord-voice-leaderboard",
  "version": "1.0.0",
  "description": "Discord bot for voice chat leaderboard",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "discord.js": "^14.14.1",
    "express": "^4.18.2"
  }
}

3. ตั้งค่า Environment Variables ใน Replit:
- ไปที่ Secrets tab (🔒)
- เพิ่ม key: DISCORD_TOKEN
- เพิ่ม value: token ของ bot

4. สร้าง Discord Bot:
- ไปที่ https://discord.com/developers/applications
- สร้าง New Application
- ไปที่ Bot tab และสร้าง bot
- Copy token มาใส่ใน Secrets

5. เชิญ bot เข้า server:
- ไปที่ OAuth2 > URL Generator
- เลือก Scopes: bot, applications.commands
- เลือก Bot Permissions: 
  ✅ Send Messages
  ✅ Use Slash Commands  
  ✅ Read Message History
  ✅ Connect
  ✅ View Channels
  ✅ Embed Links
- Copy URL และเชิญ bot

6. รัน bot:
- กด Run button ใน Replit
- Bot จะเริ่มทำงานและแสดงสถานะที่ web interface

📱 การใช้งาน:
- เข้า https://your-repl-name.your-username.repl.co เพื่อดูสถานะ bot
- Bot จะทำงานตลอดเวลาบน Replit (ถ้าเป็น Replit Core/Teams)

⚠️ สำคัญ:
- Replit ฟรีจะ sleep หลังไม่มีการใช้งาน ควรใช้ UptimeRobot หรือ service ping
- หรือ upgrade เป็น Replit Core เพื่อให้รันตลอดเวลา

📝 คำสั่งที่ใช้ได้:

Text Commands:
- !leaderboard หรือ !lb - แสดง leaderboard
- !setleaderboard - ตั้งค่า channel สำหรับ auto-update
- !mytime - ดูเวลาของตัวเอง

Slash Commands (ต้อง register ก่อน):
- /leaderboard - แสดง leaderboard
- /setleaderboard - ตั้งค่า channel
- /mytime - ดูเวลาของตัวเอง
- /resetleaderboard - รีเซ็ตข้อมูล (Admin เท่านั้น)

✨ Features:
- ✅ ติดตามเวลา voice chat แบบ real-time
- ✅ Leaderboard แบบแบ่งหน้า (pagination)
- ✅ อัพเดทอัตโนมัติทุกนาที
- ✅ แสดงสถานะว่าอยู่ใน voice หรือไม่
- ✅ สนับสนุนทั้ง text commands และ slash commands
- ✅ Button navigation สำหรับเลื่อนดู leaderboard
- ✅ ระบบ permission สำหรับคำสั่งต่างๆ
- ✅ Web dashboard สำหรับดูสถานะ bot
- ✅ Keep alive system สำหรับ Replit
*/