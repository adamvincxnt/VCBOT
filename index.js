/*
   ====================================================================================================
   ||  DISCORD VOICE LEADERBOARD BOT - (ENHANCED UI VERSION - FIXED AUTO-SAVE)                   ||
   ||--------------------------------------------------------------------------------------------------||
   ||  เวอร์ชันที่ปรับแต่งให้รองรับหลายเซิร์ฟเวอร์ และทำงานร่วมกับ Replit และ Web Interface            ||
   ||  UI/UX: ปรับปรุงการแสดงผลให้สวยงามและใช้งานง่ายขึ้น + แก้ไข Auto Refresh + Auto-Save ทุก 5 นาที ||
   ====================================================================================================
*/

const {
    Client,
    GatewayIntentBits,
    Collection,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    InteractionResponseType,
    MessageFlags
} = require("discord.js");
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

// --- ⚙️ การตั้งค่าและตรวจสอบค่าจาก Environment Variables ---
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
    console.error("❌ CRITICAL ERROR: DISCORD_TOKEN is not set!");
    console.error("กรุณาเพิ่ม Secrets ใน Replit: DISCORD_TOKEN");
    process.exit(1);
}

console.log("[REPLIT] 🚀 เริ่มต้นบอทใน Replit Environment (Multi-Guild Version)");

// --- 🎨 Color Scheme และ Emojis ---
const COLORS = {
    PRIMARY: '#FFD700',      // สีทองหลัก
    SUCCESS: '#10B981',      // เขียว
    WARNING: '#F59E0B',      // เหลือง
    ERROR: '#EF4444',        // แดง
    GOLD: '#FFD700',         // ทอง
    SILVER: '#C0C0C0',       // เงิน
    BRONZE: '#CD7F32',       // ทองแดง
    GRADIENT: '#FFA500'      // สีทองเข้มสำหรับพิเศษ
};

const EMOJIS = {
    CROWN: '👑',
    MIC: '🎤',
    TROPHY: '🏆',
    STAR: '⭐',
    FIRE: '🔥',
    DIAMOND: '💎',
    ROCKET: '🚀',
    SPARKLES: '✨',
    CHART: '📊',
    TIME: '⏰',
    ONLINE: '🟢',
    OFFLINE: '⚪',
    VOICE_ON: '🔊',
    VOICE_OFF: '🔇',
    ARROW_UP: '📈',
    MEDAL_1: '🥇',
    MEDAL_2: '🥈',
    MEDAL_3: '🥉',
    SAVE: '💾'
};

// --- 🤖 คลาสหลักของบอท ---
class VoiceChatLeaderboard {
    constructor(io) {
        this.io = io;
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMembers,
            ],
        });

        this.guildsData = new Collection();
        this.dataDir = path.join(__dirname, "data");
        this.isReady = false;
        this.refreshInterval = null;
        this.autoSaveInterval = null; // เพิ่มตัวแปรสำหรับ Auto-save
        this.lastSaveTime = new Date(); // เก็บเวลาที่ save ล่าสุด
        this.pendingSaves = new Set(); // เก็บ guild ที่มีการเปลี่ยนแปลงรอ save

        this.initializeDataDirectory();
        this.loadAllGuildsData();
        this.setupEvents();
    }

    // --- 📁 การจัดการไดเรกทอรีและไฟล์ข้อมูล ---
    initializeDataDirectory() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
            console.log(`[DATA] 📁 สร้างไดเรกทอรีหลัก '${this.dataDir}' เรียบร้อย`);
        }
    }

    loadAllGuildsData() {
        try {
            const guildFolders = fs.readdirSync(this.dataDir, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            for (const guildId of guildFolders) {
                const voiceDataPath = path.join(this.dataDir, guildId, "voicedata.json");
                const configPath = path.join(this.dataDir, guildId, "config.json");

                let voiceData = new Collection();
                let config = { leaderboardChannelId: null, leaderboardMessageId: null };

                if (fs.existsSync(voiceDataPath)) {
                    const data = JSON.parse(fs.readFileSync(voiceDataPath, "utf-8"));
                    voiceData = new Collection(data);
                }
                if (fs.existsSync(configPath)) {
                    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
                }

                this.guildsData.set(guildId, { voiceData, config });
            }
            console.log(`[DATA] 📊 โหลดข้อมูล ${this.guildsData.size} เซิร์ฟเวอร์สำเร็จ`);
        } catch (error) {
            console.error("❌ Error loading guilds data:", error);
        }
    }

    saveGuildData(guildId, force = false) {
        try {
            const guildData = this.guildsData.get(guildId);
            if (!guildData) return;

            const guildDir = path.join(this.dataDir, guildId);
            if (!fs.existsSync(guildDir)) {
                fs.mkdirSync(guildDir, { recursive: true });
            }

            const voiceDataToSave = Array.from(guildData.voiceData.entries());
            fs.writeFileSync(path.join(guildDir, "voicedata.json"), JSON.stringify(voiceDataToSave, null, 2));

            const configToSave = guildData.config;
            fs.writeFileSync(path.join(guildDir, "config.json"), JSON.stringify(configToSave, null, 2));

            if (force) {
                console.log(`[SAVE] ${EMOJIS.SAVE} บันทึกข้อมูลเซิร์ฟเวอร์ ${guildId} สำเร็จ (Force Save)`);
            }
        } catch (error) {
            console.error(`❌ Error saving data for guild ${guildId}:`, error);
        }
    }

    // --- 🔄 ระบบ Auto-save ใหม่ (ทุก 5 นาที) ---
    startAutoSave() {
        console.log(`[AUTO-SAVE] ${EMOJIS.SAVE} เริ่มระบบ Auto-save ทุก 1 นาที`);

        // ล้าง interval เก่า (ถ้ามี)
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }

        // ตั้งค่า Auto-save ทุก 5 นาที (300,000 ms)
        this.autoSaveInterval = setInterval(() => {
            this.performAutoSave();
        }, 1 * 60 * 1000);

        console.log(`[AUTO-SAVE] ✅ ตั้งค่า Auto-save เรียบร้อย (ทุก 1 นาที)`);
    }

    async performAutoSave() {
        if (!this.isReady) {
            console.log(`[AUTO-SAVE] ⏳ บอทยังไม่พร้อม ข้าม auto-save`);
            return;
        }

        const startTime = Date.now();
        let savedCount = 0;
        let activeVoiceUsers = 0;

        console.log(`[AUTO-SAVE] ${EMOJIS.SAVE} เริ่มต้น Auto-save ข้อมูลทุกเซิร์ฟเวอร์...`);

        try {
            // อัปเดตเวลาของผู้ที่กำลังอยู่ใน Voice Channel ก่อน save
            for (const [guildId, guildData] of this.guildsData.entries()) {
                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) continue;

                const now = Date.now();
                let hasChanges = false;

                // อัปเดตเวลาของผู้ใช้ที่กำลังอยู่ใน Voice
                for (const [userId, userData] of guildData.voiceData.entries()) {
                    if (userData.isInVoice && userData.joinTime) {
                        const sessionTime = now - userData.joinTime;
                        userData.totalTime += sessionTime;
                        userData.joinTime = now; // รีเซ็ตเวลาเริ่มต้นใหม่
                        hasChanges = true;
                        activeVoiceUsers++;
                    }
                }

                // บันทึกข้อมูลถ้ามีการเปลี่ยนแปลงหรือถูกเพิ่มใน pendingSaves
                if (hasChanges || this.pendingSaves.has(guildId)) {
                    this.saveGuildData(guildId, true);
                    this.pendingSaves.delete(guildId);
                    savedCount++;

                    // รอเล็กน้อยระหว่างการบันทึกแต่ละเซิร์ฟเวอร์
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            const timeTaken = Date.now() - startTime;
            this.lastSaveTime = new Date();

            console.log(`[AUTO-SAVE] ✅ Auto-save สำเร็จ: ${savedCount} เซิร์ฟเวอร์, ${activeVoiceUsers} คนใน Voice, ใช้เวลา ${timeTaken}ms`);

            // ส่งสถานะการ save ไปยัง Web Interface
            this.io.emit("saveStatus", {
                timestamp: this.lastSaveTime.getTime(),
                savedGuilds: savedCount,
                activeVoiceUsers: activeVoiceUsers,
                timeTaken: timeTaken
            });

        } catch (error) {
            console.error(`[AUTO-SAVE] ❌ เกิดข้อผิดพลาดใน Auto-save:`, error);
        }
    }

    ensureGuildData(guildId) {
        if (!this.guildsData.has(guildId)) {
            this.guildsData.set(guildId, {
                voiceData: new Collection(),
                config: { leaderboardChannelId: null, leaderboardMessageId: null }
            });
        }
        return this.guildsData.get(guildId);
    }

    // --- 🎧 การจัดการ Events (ปรับปรุงแล้ว) ---
    setupEvents() {
        this.client.once("ready", async () => {
            console.log(`[BOT] ✅ เข้าสู่ระบบแล้ว: ${this.client.user?.tag || 'Unknown'}`);
            this.isReady = true;

            // ตั้งค่าข้อมูลเซิร์ฟเวอร์ทั้งหมด
            this.client.guilds.cache.forEach(guild => {
                this.ensureGuildData(guild.id);
                console.log(`[GUILD] 🏠 เตรียมข้อมูลเซิร์ฟเวอร์: ${guild.name} (${guild.id})`);
            });

            // ตั้งค่าสถานะบอท
            if (this.client.user) {
                this.client.user.setPresence({
                    activities: [{ name: `${EMOJIS.MIC} Voice Leaderboards | ${this.client.guilds.cache.size} servers`, type: 3 }],
                    status: 'online',
                });
            }

            // รอ 10 วินาที แล้วเริ่ม auto-refresh และ auto-save
            console.log(`[SYSTEM] ⏳ รอ 10 วินาที เพื่อเริ่มระบบอัตโนมัติ...`);
            setTimeout(() => {
                this.startAutoRefresh();
                this.startAutoSave(); // เริ่ม Auto-save
                this.broadcastToWeb();
            }, 10000);

            console.log(`[BOT] 🎉 พร้อมใช้งานใน ${this.client.guilds.cache.size} เซิร์ฟเวอร์!`);
        });

        // เมื่อมีคนเข้า/ออก Voice Channel (ปรับปรุงแล้ว)
        this.client.on("voiceStateUpdate", (oldState, newState) => {
            if (newState.member?.user.bot) return; // ไม่นับบอท

            const guildId = newState.guild.id;
            const guildData = this.ensureGuildData(guildId);
            const userId = newState.id;
            const now = Date.now();
            const userData = guildData.voiceData.get(userId) || {
                totalTime: 0,
                joinTime: null,
                isInVoice: false,
                username: newState.member.user.username,
                displayName: newState.member.displayName,
                avatarURL: newState.member.user.displayAvatarURL({ size: 64 })
            };

            // เข้า Voice Channel
            if (newState.channelId && newState.channelId !== oldState.channelId) {
                userData.joinTime = now;
                userData.isInVoice = true;
                console.log(`[VOICE] 🔊 ${newState.member.displayName} เข้า Voice Channel ใน ${newState.guild.name}`);

                // เพิ่ม guild ใน pending saves
                this.pendingSaves.add(guildId);
            } 
            // ออก Voice Channel
            else if (oldState.channelId && !newState.channelId) {
                if (userData.joinTime) {
                    const sessionTime = now - userData.joinTime;
                    userData.totalTime += sessionTime;
                    userData.joinTime = null;
                    userData.isInVoice = false;
                    console.log(`[VOICE] 🔇 ${newState.member.displayName} ออก Voice Channel (เวลาครั้งนี้: ${this._formatTime(sessionTime)})`);

                    // เพิ่ม guild ใน pending saves
                    this.pendingSaves.add(guildId);

                    // บันทึกทันทีเมื่อมีคนออกจาก Voice
                    this.saveGuildData(guildId, true);
                    console.log(`[SAVE] ${EMOJIS.SAVE} บันทึกข้อมูลทันทีหลังจากผู้ใช้ออกจาก Voice`);
                }
            }

            // อัปเดตข้อมูลผู้ใช้
            userData.username = newState.member.user.username;
            userData.displayName = newState.member.displayName;
            userData.avatarURL = newState.member.user.displayAvatarURL({ size: 64 });
            guildData.voiceData.set(userId, userData);

            // รีเฟรช leaderboard ทันทีเมื่อมีการเปลี่ยนแปลง Voice State
            setTimeout(() => {
                this.updateDiscordLeaderboard(guildId);
                this.broadcastToWeb();
            }, 1000);
        });

        // จัดการคำสั่งและปุ่ม
        this.client.on("interactionCreate", async (interaction) => {
            if (!interaction.inGuild()) return;

            try {
                if (interaction.isChatInputCommand()) {
                    await this.handleSlashCommand(interaction);
                } else if (interaction.isButton()) {
                    await this.handleButton(interaction);
                }
            } catch (error) {
                console.error("[INTERACTION ERROR]", error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: "❌ เกิดข้อผิดพลาด กรุณาลองใหม่",
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }
            }
        });

        // จัดการเมื่อบอทถูกเพิ่มเข้าเซิร์ฟเวอร์ใหม่
        this.client.on("guildCreate", (guild) => {
            console.log(`[GUILD] ➕ เพิ่มเข้าเซิร์ฟเวอร์ใหม่: ${guild.name} (${guild.id})`);
            this.ensureGuildData(guild.id);
        });

        // จัดการเมื่อบอทถูกลบออกจากเซิร์ฟเวอร์
        this.client.on("guildDelete", (guild) => {
            console.log(`[GUILD] ➖ ถูกลบออกจากเซิร์ฟเวอร์: ${guild.name} (${guild.id})`);
        });
    }

    // --- 🔄 ระบบ Auto-refresh ที่แก้ไขแล้ว ---
    startAutoRefresh() {
        console.log(`[REFRESH] 🔄 เริ่มระบบ Auto-refresh Leaderboard`);

        // ล้าง interval เก่า (ถ้ามี)
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        // รีเฟรช leaderboard ทันที
        this.updateAllDiscordLeaderboards();

        // ตั้งค่า interval ใหม่ (ทุก 3 นาที)
        this.refreshInterval = setInterval(() => {
            if (this.isReady) {
                console.log(`[REFRESH] 🔄 Auto-refresh Leaderboards...`);
                this.updateAllDiscordLeaderboards();
            }
        }, 1 * 60 * 1000); // 3 นาที

        // ตั้งค่า Web broadcast (ทุก 30 วินาที)
        setInterval(() => {
            if (this.isReady) {
                this.broadcastToWeb();
            }
        }, 30 * 1000);

        console.log(`[REFRESH] ✅ ตั้งค่า Auto-refresh เรียบร้อย (ทุก 1 นาที)`);
    }

    // --- 🔄 การอัปเดต Leaderboard ทุกเซิร์ฟเวอร์ ---
    async updateAllDiscordLeaderboards() {
        if (!this.isReady || !this.client?.user) {
            console.log("[REFRESH] ⏳ บอทยังไม่พร้อม ข้าม auto-refresh");
            return;
        }

        console.log(`[REFRESH] 🔄 กำลังอัปเดต Leaderboard ใน ${this.guildsData.size} เซิร์ฟเวอร์...`);
        let updateCount = 0;

        for (const [guildId, guildData] of this.guildsData.entries()) {
            if (guildData.config.leaderboardChannelId) {
                try {
                    const guild = this.client.guilds.cache.get(guildId);
                    if (guild) {
                        await this.updateDiscordLeaderboard(guildId, guildData);
                        updateCount++;
                        // รอเล็กน้อยระหว่างการอัปเดตแต่ละเซิร์ฟเวอร์
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    console.error(`[REFRESH] ❌ ไม่สามารถอัปเดตเซิร์ฟเวอร์ ${guildId}:`, error.message);
                }
            }
        }

        console.log(`[REFRESH] ✅ อัปเดต Leaderboard สำเร็จ ${updateCount} เซิร์ฟเวอร์`);
    }

    // --- 🔄 การอัปเดต Leaderboard เซิร์ฟเวอร์เดียว (แก้ไขแล้ว) ---
    async updateDiscordLeaderboard(guildId, guildData = null) {
        if (!this.isReady) return;

        try {
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) {
                console.log(`[REFRESH] ⚠️ ไม่พบเซิร์ฟเวอร์ ${guildId}`);
                return;
            }

            if (!guildData) {
                guildData = this.guildsData.get(guildId);
            }

            if (!guildData?.config?.leaderboardChannelId) {
                console.log(`[REFRESH] ⚠️ เซิร์ฟเวอร์ ${guild.name} ไม่ได้ตั้งค่า Leaderboard Channel`);
                return;
            }

            const channel = guild.channels.cache.get(guildData.config.leaderboardChannelId);
            if (!channel) {
                console.log(`[REFRESH] ⚠️ ไม่พบ Channel ${guildData.config.leaderboardChannelId} ในเซิร์ฟเวอร์ ${guild.name}`);
                guildData.config.leaderboardChannelId = null;
                guildData.config.leaderboardMessageId = null;
                this.saveGuildData(guildId);
                return;
            }

            // สร้าง Mock Interaction สำหรับระบบ auto-refresh
            const mockInteraction = {
                user: this.client.user,
                guild: guild
            };

            const payload = await this._createLeaderboardPayload(guild, 0, mockInteraction);

            // ลองอัปเดตข้อความเก่า
            if (guildData.config.leaderboardMessageId) {
                try {
                    const message = await channel.messages.fetch(guildData.config.leaderboardMessageId);
                    await message.edit(payload);
                    console.log(`[REFRESH] ✅ อัปเดต Leaderboard ในเซิร์ฟเวอร์ ${guild.name}`);
                    return;
                } catch (error) {
                    console.log(`[REFRESH] ⚠️ ไม่พบข้อความเก่า สร้างข้อความใหม่...`);
                }
            }

            // สร้างข้อความใหม่
            const newMessage = await channel.send(payload);
            guildData.config.leaderboardMessageId = newMessage.id;
            this.saveGuildData(guildId);
            console.log(`[REFRESH] ✅ สร้าง Leaderboard ใหม่ในเซิร์ฟเวอร์ ${guild.name}`);

        } catch (error) {
            console.error(`[REFRESH] ❌ Error updating leaderboard for guild ${guildId}:`, error);

            // ถ้าเป็น error เรื่องสิทธิ์ ให้ล้างการตั้งค่า
            if (error.code === 50001 || error.code === 50013 || error.code === 10003) {
                const guildData = this.guildsData.get(guildId);
                if (guildData) {
                    guildData.config.leaderboardChannelId = null;
                    guildData.config.leaderboardMessageId = null;
                    this.saveGuildData(guildId);
                    console.log(`[REFRESH] 🔄 ล้างการตั้งค่า Leaderboard ของเซิร์ฟเวอร์ ${guildId} เนื่องจากไม่มีสิทธิ์`);
                }
            }
        }
    }

    // --- 💬 การจัดการคำสั่ง ---
    async handleSlashCommand(interaction) {
        if (!this.isReady) {
            const errorEmbed = new EmbedBuilder()
                .setTitle(`${EMOJIS.TIME} ระบบกำลังเริ่มต้น`)
                .setDescription("กรุณารอสักครู่ บอทกำลังเตรียมพร้อม...")
                .setColor(COLORS.WARNING);
            return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }

        const { commandName } = interaction;
        console.log(`[COMMAND] 💬 ${interaction.user.username} ใช้คำสั่ง /${commandName} ในเซิร์ฟเวอร์ ${interaction.guild.name}`);

        switch (commandName) {
            case "leaderboard": await this.showDiscordLeaderboard(interaction, 0); break;
            case "mytime": await this.showUserTime(interaction); break;
            case "setleaderboard": await this.setLeaderboardChannel(interaction); break;
            case "resetleaderboard": await this.resetLeaderboard(interaction); break;
            case "voicestats": await this.showVoiceStats(interaction); break;
            case "top": await this.showTopUsers(interaction); break;
            case "web": await this.showWebInterface(interaction); break;
            case "showallmembers": await this.showAllMembers(interaction); break;
            case "savestatus": await this.showSaveStatus(interaction); break; // เพิ่มคำสั่งใหม่
        }
    }

    async handleButton(interaction) {
        if (!this.isReady) {
            const errorEmbed = new EmbedBuilder()
                .setTitle(`${EMOJIS.TIME} ระบบกำลังเริ่มต้น`)
                .setDescription("กรุณารอสักครู่...")
                .setColor(COLORS.WARNING);
            return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }

        const [action, pageStr] = interaction.customId.split("_");
        if (action !== "lb") return;

        if (pageStr === "refresh") {
            const currentEmbed = interaction.message.embeds[0];
            const footerText = currentEmbed.footer?.text || "";
            const pageMatch = footerText.match(/หน้า (\d+)/);
            const currentPage = pageMatch ? parseInt(pageMatch[1]) - 1 : 0;
            await this.showDiscordLeaderboard(interaction, currentPage, true);
        } else {
            const page = parseInt(pageStr);
            await this.showDiscordLeaderboard(interaction, page, true);
        }
    }

    // --- 📊 คำสั่งแสดงสถานะการ Save ---
    async showSaveStatus(interaction) {
        const embed = new EmbedBuilder()
            .setTitle(`${EMOJIS.SAVE} สถานะการบันทึกข้อมูล`)
            .setDescription(`${EMOJIS.DIAMOND} **ระบบ Auto-Save** ${EMOJIS.SPARKLES}`)
            .setColor(COLORS.SUCCESS)
            .addFields(
                {
                    name: `${EMOJIS.TIME} การบันทึกล่าสุด`,
                    value: `**${this.lastSaveTime.toLocaleString('th-TH')}**`,
                    inline: true
                },
                {
                    name: `${EMOJIS.CHART} ข้อมูลรอบันทึก`,
                    value: `**${this.pendingSaves.size}** เซิร์ฟเวอร์`,
                    inline: true
                },
                {
                    name: `${EMOJIS.ROCKET} รอบถัดไป`,
                    value: `ภายใน **1 นาที**`,
                    inline: true
                }
            )
            .setFooter({
                text: `${EMOJIS.SAVE} Auto-Save ทุก 1 นาที | ${new Date().toLocaleDateString('th-TH')}`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // --- 📊 การสร้างและแสดงผล Leaderboard ---
    async showDiscordLeaderboard(interaction, page, isUpdate = false) {
        if (isUpdate) {
            await interaction.deferUpdate();
        } else {
            await interaction.deferReply();
        }
        const payload = await this._createLeaderboardPayload(interaction.guild, page, interaction);
        await interaction.editReply(payload);
    }

    // ==============================================================================
    // ||               ฟังก์ชันสร้าง LEADERBOARD (Gold Theme + Single Line)         ||
    // ==============================================================================
    async _createLeaderboardPayload(guild, page, interaction) {
        if (!this.isReady || !this.client?.user) {
            const errorEmbed = new EmbedBuilder()
                .setTitle(`${EMOJIS.TIME} ระบบยังไม่พร้อม`)
                .setDescription("กรุณารอสักครู่...")
                .setColor(COLORS.WARNING);
            return { embeds: [errorEmbed], components: [] };
        }

        const sortedUsers = await this._getSortedLeaderboard(guild.id);
        const itemsPerPage = 20;

        const totalPages = Math.ceil(sortedUsers.length / itemsPerPage) || 1;
        page = Math.max(0, Math.min(page, totalPages - 1));
        const pageUsers = sortedUsers.slice(page * itemsPerPage, (page + 1) * itemsPerPage);

        const totalTimeAllUsers = sortedUsers.reduce((sum, user) => sum + user.currentTotal, 0);
        const activeUsers = sortedUsers.filter(user => user.isInVoice).length;

        // สร้าง Main Embed
        const embed = new EmbedBuilder()
            .setTitle(`# ${EMOJIS.TROPHY} Voice Chat Leaderboard ${EMOJIS.SPARKLES}`)
            .setColor(COLORS.GOLD)
            .setThumbnail(guild.iconURL({ size: 256 }))
            .setTimestamp();

        // Header Description แบบสวยงาม
        const headerDescription = [
            `${EMOJIS.DIAMOND} **${guild.name}**`,
            `${EMOJIS.CHART} **เวลารวม:** ${this._formatTime(totalTimeAllUsers)}`,
            `${EMOJIS.ONLINE} **ออนไลน์:** ${activeUsers}/${sortedUsers.length} คน`,
            `${EMOJIS.FIRE} **หน้า ${page + 1}/${totalPages}**`,
            `${EMOJIS.SAVE} **บันทึกล่าสุด:** ${this.lastSaveTime.toLocaleTimeString('th-TH')}`
        ].join('\n');

        embed.setDescription(headerDescription);

        if (pageUsers.length === 0) {
            embed.addFields({
                name: `${EMOJIS.TIME} ยังไม่มีข้อมูล`,
                value: "ไม่พบสมาชิกที่เคยเข้า Voice Chat",
                inline: false
            });
        } else {
            // สร้าง Leaderboard List แบบใหม่ (Single Line + Code Block)
            const leaderboardLines = pageUsers.map((user, index) => {
                const rank = page * itemsPerPage + index + 1;

                let rankDisplay;
                if (rank === 1) rankDisplay = "🥇";
                else if (rank === 2) rankDisplay = "🥈";  
                else if (rank === 3) rankDisplay = "🥉";
                else rankDisplay = `#${rank}`.padEnd(3);

                const statusIcon = user.isInVoice ? EMOJIS.VOICE_ON : EMOJIS.VOICE_OFF;
                const timeFormatted = this._formatTime(user.currentTotal).padStart(15);

                return `${rankDisplay.padEnd(4)} ${statusIcon} ${timeFormatted}`;
            }).join('\n');

            // สร้าง mention list แยกต่างหาก
            const mentionLines = pageUsers.map((user, index) => {
                const rank = page * itemsPerPage + index + 1;
                let rankEmoji = rank <= 3 ? ['🥇', '🥈', '🥉'][rank-1] : `#${rank}`;
                return `${rankEmoji} <@${user.userId}>`;
            }).join('\n');

            embed.addFields(
                {
                    name: `${EMOJIS.TROPHY} อันดับและเวลา`,
                    value: "```md\n" + leaderboardLines + "\n```",
                    inline: true
                },
                {
                    name: `👥 รายชื่อผู้ใช้`,
                    value: mentionLines.substring(0, 1024),
                    inline: true
                }
            );
        }

        // Top Player Highlight
        const topUserWithTime = sortedUsers.find(u => u.currentTotal > 0);
        if (page === 0 && topUserWithTime) {
            embed.setAuthor({
                name: `${EMOJIS.CROWN} ผู้นำปัจจุบัน: ${topUserWithTime.displayName}`,
                iconURL: topUserWithTime.avatarURL
            });
        }

        // Footer สวยงาม
        embed.setFooter({
            text: `${EMOJIS.ROCKET} อัปเดต: ${new Date().toLocaleString('th-TH')} • หน้า ${page + 1}/${totalPages} • Auto-Save: ${this.pendingSaves.size} รอบันทึก`,
            iconURL: interaction.user.displayAvatarURL({ size: 64 })
        });

        // สร้าง Action Buttons แบบสวยงาม
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`lb_${page - 1}`)
                .setLabel("◀️ ก่อนหน้า")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page <= 0),
            new ButtonBuilder()
                .setCustomId("lb_refresh")
                .setLabel(`${EMOJIS.SPARKLES} รีเฟรช`)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`lb_${page + 1}`)
                .setLabel("ถัดไป ▶️")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page >= totalPages - 1),
            new ButtonBuilder()
                .setLabel(`${EMOJIS.ROCKET} Web Interface`)
                .setStyle(ButtonStyle.Link)
                .setURL(process.env.REPL_URL || 'https://replit.com')
        );

        return { embeds: [embed], components: [row] };
    }

    // --- 👤 คำสั่งสำหรับผู้ใช้ ---
    async showUserTime(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const guildData = this.ensureGuildData(guildId);
        const userData = guildData.voiceData.get(userId);

        let totalTime = 0;
        if (userData) {
            totalTime = userData.totalTime;
            if (userData.isInVoice && userData.joinTime) {
                totalTime += Date.now() - userData.joinTime;
            }
        }

        const sortedUsers = await this._getSortedLeaderboard(guildId);
        const userRank = sortedUsers.findIndex(user => user.userId === userId) + 1;
        const totalUsers = sortedUsers.length;
        const percentile = userRank > 0 ? Math.round((1 - (userRank - 1) / totalUsers) * 100) : 0;

        let rankEmoji = EMOJIS.STAR;
        let rankColor = COLORS.PRIMARY;

        if (userRank === 1) {
            rankEmoji = EMOJIS.MEDAL_1;
            rankColor = COLORS.GOLD;
        } else if (userRank === 2) {
            rankEmoji = EMOJIS.MEDAL_2;
            rankColor = COLORS.SILVER;
        } else if (userRank === 3) {
            rankEmoji = EMOJIS.MEDAL_3;
            rankColor = COLORS.BRONZE;
        }

        const embed = new EmbedBuilder()
            .setTitle(`${EMOJIS.TIME} สถิติ Voice Chat ของคุณ`)
            .setDescription(`${EMOJIS.DIAMOND} **${interaction.user.displayName}**`)
            .setColor(rankColor)
            .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
            .addFields(
                {
                    name: `${EMOJIS.TIME} เวลาใช้งานรวม`,
                    value: `**${this._formatTime(totalTime)}**`,
                    inline: true
                },
                {
                    name: `${EMOJIS.TROPHY} อันดับปัจจุบัน`,
                    value: userRank > 0 ? `${rankEmoji} **#${userRank}**` : "ยังไม่มีอันดับ",
                    inline: true
                },
                {
                    name: `${EMOJIS.CHART} เปอร์เซ็นไทล์`,
                    value: `**${percentile}%** (ดีกว่า ${percentile}% ของสมาชิก)`,
                    inline: true
                }
            )
            .setFooter({
                text: `${EMOJIS.SPARKLES} ข้อมูล ณ วันที่ ${new Date().toLocaleDateString('th-TH')} | บันทึกล่าสุด: ${this.lastSaveTime.toLocaleTimeString('th-TH')}`,
                iconURL: interaction.guild.iconURL()
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    async showWebInterface(interaction) {
        const webUrl = process.env.REPL_URL || 'https://your-repl-name.username.replit.dev';
        const embed = new EmbedBuilder()
            .setTitle(`${EMOJIS.ROCKET} Web Interface ${EMOJIS.SPARKLES}`)
            .setDescription(`เข้าชม Leaderboard แบบเรียลไทม์ผ่านเว็บไซต์!`)
            .setColor(COLORS.SUCCESS)
            .addFields(
                {
                    name: `${EMOJIS.DIAMOND} คุณสมบัติ`,
                    value: [
                        `${EMOJIS.CHART} ดูสถิติแบบเรียลไทม์`,
                        `${EMOJIS.MIC} ติดตามการใช้งาน Voice`,
                        `📱 รองรับทุกอุปกรณ์`,
                        `${EMOJIS.FIRE} อัปเดตอัตโนมัติ`,
                        `${EMOJIS.SAVE} บันทึกข้อมูลทุก 1 นาที`
                    ].join('\n'),
                    inline: false
                }
            )
            .setFooter({
                text: `${EMOJIS.TIME} คลิกปุ่มด้านล่างเพื่อเข้าชม`,
                iconURL: this.client.user.displayAvatarURL()
            });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(`${EMOJIS.ROCKET} เปิด Web Interface`)
                .setStyle(ButtonStyle.Link)
                .setURL(webUrl)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }

    async showAllMembers(interaction) {
        if (!this.isReady) {
            return interaction.reply({ content: "⏳ บอทกำลังเริ่มต้นระบบ กรุณารอสักครู่...", flags: MessageFlags.Ephemeral });
        }

        try {
            const guild = interaction.guild;
            const members = await guild.members.fetch();
            const humanMembers = members.filter(member => !member.user.bot);
            const botMembers = members.filter(member => member.user.bot);

            const embed = new EmbedBuilder()
                .setTitle(`${EMOJIS.DIAMOND} รายชื่อสมาชิกทั้งหมด`)
                .setDescription(`**${guild.name}** ${EMOJIS.SPARKLES}`)
                .setColor(COLORS.PRIMARY)
                .setThumbnail(guild.iconURL({ size: 256 }))
                .addFields(
                    {
                        name: `👥 สมาชิกจริง (${humanMembers.size} คน)`,
                        value: humanMembers.size > 0 ? 
                            humanMembers.map(m => `${EMOJIS.STAR} ${m.displayName}`).slice(0, 20).join('\n') + 
                            (humanMembers.size > 20 ? `\n... และอีก ${humanMembers.size - 20} คน` : '') :
                            "ไม่มีสมาชิก",
                        inline: false
                    },
                    {
                        name: `🤖 บอท (${botMembers.size} ตัว)`,
                        value: botMembers.size > 0 ? 
                            botMembers.map(m => `${EMOJIS.ROCKET} ${m.displayName}`).slice(0, 10).join('\n') + 
                            (botMembers.size > 10 ? `\n... และอีก ${botMembers.size - 10} ตัว` : '') :
                            "ไม่มีบอท",
                        inline: false
                    }
                )
                .setFooter({
                    text: `${EMOJIS.CHART} รวมทั้งหมด: ${members.size} สมาชิก • ${new Date().toLocaleDateString('th-TH')}`,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error('Error fetching members:', error);
            const errorEmbed = new EmbedBuilder()
                .setTitle("❌ เกิดข้อผิดพลาด")
                .setDescription("ไม่สามารถดึงรายชื่อสมาชิกได้")
                .setColor(COLORS.ERROR);
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }

    // --- ⚙️ คำสั่งสำหรับแอดมิน ---
    async setLeaderboardChannel(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const errorEmbed = new EmbedBuilder()
                .setTitle("❌ ไม่มีสิทธิ์")
                .setDescription("คุณต้องมีสิทธิ์ **Manage Channels** เพื่อใช้คำสั่งนี้")
                .setColor(COLORS.ERROR);
            return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }

        const guildId = interaction.guild.id;
        const guildData = this.ensureGuildData(guildId);
        guildData.config.leaderboardChannelId = interaction.channelId;
        guildData.config.leaderboardMessageId = null;
        this.saveGuildData(guildId, true);

        const successEmbed = new EmbedBuilder()
            .setTitle(`${EMOJIS.SUCCESS} ตั้งค่าสำเร็จ!`)
            .setDescription(`ตั้งค่า <#${interaction.channelId}> สำหรับ Leaderboard อัตโนมัติแล้ว`)
            .setColor(COLORS.SUCCESS)
            .addFields({
                name: `${EMOJIS.CHART} ข้อมูล`,
                value: [
                    `${EMOJIS.SPARKLES} Leaderboard จะอัปเดตอัตโนมัติทุก 1 นาที`,
                    `${EMOJIS.SAVE} ข้อมูลจะบันทึกอัตโนมัติทุก 1 นาที`
                ].join('\n'),
                inline: false
            });

        await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });

        console.log(`[CONFIG] ⚙️ ตั้งค่า Leaderboard Channel ในเซิร์ฟเวอร์ ${interaction.guild.name}: ${interaction.channelId}`);

        // สร้าง leaderboard ทันที
        setTimeout(() => {
            this.updateDiscordLeaderboard(guildId);
        }, 2000);
    }

    async resetLeaderboard(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            const errorEmbed = new EmbedBuilder()
                .setTitle("❌ ไม่มีสิทธิ์")
                .setDescription("คุณต้องมีสิทธิ์ **Administrator** เพื่อใช้คำสั่งนี้")
                .setColor(COLORS.ERROR);
            return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }

        const guildId = interaction.guild.id;
        const guildData = this.ensureGuildData(guildId);
        const userCount = guildData.voiceData.size;

        guildData.voiceData.clear();
        this.saveGuildData(guildId, true);

        const successEmbed = new EmbedBuilder()
            .setTitle(`${EMOJIS.SUCCESS} รีเซ็ตเรียบร้อย!`)
            .setDescription(`ลบข้อมูลเวลา Voice Chat ของ **${userCount} คน** แล้ว`)
            .setColor(COLORS.WARNING)
            .addFields({
                name: "⚠️ คำเตือน",
                value: "ข้อมูลที่ถูกลบไม่สามารถกู้คืนได้",
                inline: false
            })
            .setFooter({
                text: `รีเซ็ตโดย: ${interaction.user.username} | ${new Date().toLocaleDateString('th-TH')}`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });

        console.log(`[RESET] 🔄 รีเซ็ตข้อมูล Voice Chat ในเซิร์ฟเวอร์ ${interaction.guild.name} (${userCount} คน)`);

        // อัปเดต leaderboard ทันที
        setTimeout(() => {
            this.updateDiscordLeaderboard(guildId);
        }, 1000);
    }

    async showVoiceStats(interaction) {
        const guildId = interaction.guild.id;
        const sortedUsers = await this._getSortedLeaderboard(guildId);
        const usersWithTime = sortedUsers.filter(u => u.currentTotal > 0);

        const totalUsers = sortedUsers.length;
        const activeUsers = sortedUsers.filter(user => user.isInVoice).length;
        const totalTime = usersWithTime.reduce((sum, user) => sum + user.currentTotal, 0);
        const avgTime = usersWithTime.length > 0 ? totalTime / usersWithTime.length : 0;

        // คำนวณสถิติเพิ่มเติม
        const topUser = usersWithTime[0];
        const participationRate = totalUsers > 0 ? Math.round((usersWithTime.length / totalUsers) * 100) : 0;

        const embed = new EmbedBuilder()
            .setTitle(`${EMOJIS.CHART} สถิติ Voice Chat เซิร์ฟเวอร์`)
            .setDescription(`${EMOJIS.DIAMOND} **${interaction.guild.name}** ${EMOJIS.SPARKLES}`)
            .setColor(COLORS.GOLD)
            .setThumbnail(interaction.guild.iconURL({ size: 256 }))
            .addFields(
                {
                    name: `${EMOJIS.DIAMOND} ข้อมูลทั่วไป`,
                    value: [
                        `👥 **สมาชิกทั้งหมด:** ${totalUsers} คน`,
                        `${EMOJIS.VOICE_ON} **กำลังใช้งาน:** ${activeUsers} คน`,
                        `${EMOJIS.CHART} **อัตราการเข้าร่วม:** ${participationRate}%`,
                        `${EMOJIS.TIME} **เวลารวมทั้งหมด:** ${this._formatTime(totalTime)}`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: `${EMOJIS.TROPHY} สถิติการใช้งาน`,
                    value: [
                        `📊 **เฉลี่ยต่อคน:** ${this._formatTime(avgTime)}`,
                        `${EMOJIS.CROWN} **ผู้นำ:** ${topUser ? topUser.displayName : 'ยังไม่มี'}`,
                        `${EMOJIS.FIRE} **เวลาสูงสุด:** ${topUser ? this._formatTime(topUser.currentTotal) : '0 วินาที'}`,
                        `${EMOJIS.STAR} **คนที่เคยเข้า:** ${usersWithTime.length} คน`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: `${EMOJIS.SAVE} สถานะระบบ`,
                    value: [
                        `📅 **บันทึกล่าสุด:** ${this.lastSaveTime.toLocaleString('th-TH')}`,
                        `⏰ **รอบถัดไป:** ภายใน 1 นาที`,
                        `🔄 **ข้อมูลรอบันทึก:** ${this.pendingSaves.size} เซิร์ฟเวอร์`
                    ].join('\n'),
                    inline: false
                }
            )
            .setFooter({
                text: `${EMOJIS.TIME} อัปเดตล่าสุด: ${new Date().toLocaleString('th-TH')}`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        // เพิ่มสีตามสถานการณ์
        if (activeUsers > totalUsers * 0.3) {
            embed.setColor(COLORS.SUCCESS);
        } else if (activeUsers > totalUsers * 0.1) {
            embed.setColor(COLORS.WARNING);
        } else {
            embed.setColor(COLORS.ERROR);
        }

        await interaction.reply({ embeds: [embed] });
    }

    async showTopUsers(interaction) {
        const guildId = interaction.guild.id;
        const limit = interaction.options?.getInteger('limit') || 10;
        const sortedUsers = await this._getSortedLeaderboard(guildId);
        const topUsers = sortedUsers.filter(u => u.currentTotal > 0).slice(0, limit);

        const embed = new EmbedBuilder()
            .setTitle(`${EMOJIS.TROPHY} Top ${limit} Voice Chat Champions`)
            .setDescription(`${EMOJIS.FIRE} **Hall of Fame** ${EMOJIS.SPARKLES}`)
            .setColor(COLORS.GOLD)
            .setThumbnail(interaction.guild.iconURL({ size: 256 }))
            .setTimestamp();

        if (topUsers.length === 0) {
            embed.addFields({
                name: `${EMOJIS.TIME} ยังไม่มีข้อมูล`,
                value: "ยังไม่มีสมาชิกที่เคยใช้งาน Voice Chat",
                inline: false
            });
        } else {
            let description = "";
            for (let i = 0; i < topUsers.length; i++) {
                const user = topUsers[i];
                const rank = i + 1;

                let medalIcon;
                if (rank === 1) {
                    medalIcon = `${EMOJIS.MEDAL_1} ${EMOJIS.CROWN}`;
                } else if (rank === 2) {
                    medalIcon = `${EMOJIS.MEDAL_2} ${EMOJIS.STAR}`;
                } else if (rank === 3) {
                    medalIcon = `${EMOJIS.MEDAL_3} ${EMOJIS.FIRE}`;
                } else if (rank <= 5) {
                    medalIcon = `${EMOJIS.DIAMOND} **#${rank}**`;
                } else {
                    medalIcon = `${EMOJIS.STAR} **#${rank}**`;
                }

                const statusIcon = user.isInVoice ? EMOJIS.VOICE_ON : EMOJIS.VOICE_OFF;
                const timeFormatted = this._formatTime(user.currentTotal);

                description += `${medalIcon} ${statusIcon} **${user.displayName}**\n`;
                description += `${EMOJIS.TIME} ${timeFormatted}\n\n`;
            }

            embed.setDescription(description.substring(0, 2048));
        }

        embed.setFooter({
            text: `${EMOJIS.SPARKLES} คำสั่งโดย: ${interaction.user.username} • ${new Date().toLocaleDateString('th-TH')} • บันทึกล่าสุด: ${this.lastSaveTime.toLocaleTimeString('th-TH')}`,
            iconURL: interaction.user.displayAvatarURL()
        });

        await interaction.reply({ embeds: [embed] });
    }

    // --- 🌐 การส่งข้อมูลไป Web Interface (ปรับปรุงแล้ว) ---
    async broadcastToWeb() {
        if (!this.isReady) return;

        try {
            const allLeaderboards = {};

            for (const [guildId, guildData] of this.guildsData.entries()) {
                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) continue;

                const sortedUsers = await this._getSortedLeaderboard(guildId);

                // ส่งข้อมูลทุกเซิร์ฟเวอร์ที่มีสมาชิก
                if (sortedUsers.length > 0) {
                    allLeaderboards[guildId] = {
                        guildName: guild.name || 'Unknown Guild',
                        guildIcon: guild.iconURL({ size: 64 }) || null,
                        memberCount: guild.memberCount || 0,
                        activeUsers: sortedUsers.filter(u => u.isInVoice).length,
                        totalTime: sortedUsers.reduce((sum, user) => sum + user.currentTotal, 0),
                        users: sortedUsers.map((user, index) => ({
                            rank: index + 1,
                            userId: user.userId,
                            username: user.username,
                            displayName: user.displayName,
                            avatarURL: user.avatarURL,
                            isInVoice: user.isInVoice,
                            currentTotal: user.currentTotal,
                            timeFormatted: this._formatTime(user.currentTotal)
                        }))
                    };
                }
            }

            // ส่งข้อมูลไปยัง Web Interface พร้อมข้อมูล Auto-Save
            this.io.emit("leaderboardUpdate", {
                timestamp: Date.now(),
                botStatus: this.isReady,
                totalGuilds: this.client.guilds.cache.size,
                guilds: allLeaderboards,
                saveStatus: {
                    lastSave: this.lastSaveTime.getTime(),
                    pendingSaves: this.pendingSaves.size,
                    nextSaveIn: 1 * 60 * 1000 // 5 minutes in milliseconds
                }
            });

            console.log(`[WEB] 📡 ส่งข้อมูล ${Object.keys(allLeaderboards).length} เซิร์ฟเวอร์ไปยัง Web Interface (รอบันทึก: ${this.pendingSaves.size})`);

        } catch (error) {
            console.error("[WEB] ❌ เกิดข้อผิดพลาดในการส่งข้อมูลไป Web:", error);
        }
    }

    // --- 🛠️ ฟังก์ชันช่วยเหลือ ---
    async _getSortedLeaderboard(guildId) {
        const guildData = this.ensureGuildData(guildId);
        const now = Date.now();
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return [];

        try {
            const allMembers = await guild.members.fetch();

            const allUsers = [];

            for (const [userId, member] of allMembers) {
                if (member.user.bot) continue;

                const voiceData = guildData.voiceData.get(userId);
                let currentTotal = 0;
                let isInVoice = false;

                if (voiceData) {
                    currentTotal = voiceData.totalTime || 0;
                    isInVoice = voiceData.isInVoice || false;
                    if (isInVoice && voiceData.joinTime) {
                        currentTotal += now - voiceData.joinTime;
                    }
                }

                allUsers.push({
                    userId: userId,
                    username: member.user.username,
                    displayName: member.displayName,
                    avatarURL: member.displayAvatarURL({ size: 64 }),
                    isInVoice: isInVoice,
                    currentTotal: currentTotal
                });
            }

            return allUsers.sort((a, b) => b.currentTotal - a.currentTotal);

        } catch (error) {
            console.error(`Error fetching all members for guild ${guildId}:`, error);
            return [];
        }
    }

    _formatTime(ms) {
        if (!ms || ms < 1000) return "0 วินาที";
        const sec = Math.floor(ms / 1000);
        const min = Math.floor(sec / 60);
        const hrs = Math.floor(min / 60);
 //       const days = Math.floor(hrs / 24);

//        if (days > 0) return `${days} วัน ${hrs % 24} ชั่วโมง`;
        if (hrs > 0) return `${hrs} ชั่วโมง ${min % 60} นาที`;
        if (min > 0) return `${min} นาที ${sec % 60} วินาที`;
        return `${sec % 60} วินาที`;
    }

    // --- 🚀 เริ่มต้นบอท ---
    start() {
        this.client.login(TOKEN);
    }

    // --- 🛑 ระบบปิดการทำงาน (Graceful Shutdown) ---
    shutdown() {
        console.log('\n[SYSTEM] 🛑 กำลังปิดระบบ...');

        // บันทึกข้อมูลทั้งหมดก่อนปิด
        console.log(`[SHUTDOWN] ${EMOJIS.SAVE} บันทึกข้อมูลก่อนปิดระบบ...`);
        for (const [guildId] of this.guildsData.entries()) {
            this.saveGuildData(guildId, true);
        }

        // ล้าง intervals
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            console.log('[SHUTDOWN] 🔄 หยุด Auto-refresh');
        }

        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            console.log(`[SHUTDOWN] ${EMOJIS.SAVE} หยุด Auto-save`);
        }

        // ปิดบอท
        this.client.destroy();
        console.log('[SHUTDOWN] 🤖 ปิดการเชื่อมต่อบอท');

        console.log('[SHUTDOWN] ✅ ปิดระบบเรียบร้อย');
    }
}

// --- 🌐 Web Server & Socket.IO Setup ---
const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Static files
app.use(express.static(path.join(__dirname, 'web')));

// Main route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

// Health check (ปรับปรุงแล้ว)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        botReady: bot.isReady,
        guildsCount: bot.client.guilds.cache.size,
        lastSave: bot.lastSaveTime.toISOString(),
        pendingSaves: bot.pendingSaves.size
    });
});

// API endpoint สำหรับข้อมูล leaderboard
app.get('/api/leaderboard/:guildId?', async (req, res) => {
    try {
        if (!bot.isReady) {
            return res.status(503).json({ error: 'Bot not ready' });
        }

        const { guildId } = req.params;

        if (guildId) {
            // ข้อมูลเซิร์ฟเวอร์เดียว
            const guild = bot.client.guilds.cache.get(guildId);
            if (!guild) {
                return res.status(404).json({ error: 'Guild not found' });
            }

            const sortedUsers = await bot._getSortedLeaderboard(guildId);
            res.json({
                guildId,
                guildName: guild.name,
                users: sortedUsers,
                lastUpdate: new Date().toISOString()
            });
        } else {
            // ข้อมูลทุกเซิร์ฟเวอร์
            const allData = {};
            for (const [gId] of bot.guildsData.entries()) {
                const guild = bot.client.guilds.cache.get(gId);
                if (guild) {
                    const users = await bot._getSortedLeaderboard(gId);
                    allData[gId] = {
                        guildName: guild.name,
                        users: users
                    };
                }
            }
            res.json({
                data: allData,
                lastUpdate: new Date().toISOString(),
                lastSave: bot.lastSaveTime.toISOString()
            });
        }
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Socket.IO Events (ปรับปรุงแล้ว)
io.on("connection", (socket) => {
    console.log(`[WEB] 🌐 ผู้ใช้งานเชื่อมต่อ Web Interface (${socket.id})`);

    // ส่งข้อมูลเริ่มต้นทันที
    if (bot.isReady) {
        bot.broadcastToWeb();

        // ส่งข้อมูลสถานะ Auto-Save
        socket.emit("saveStatus", {
            timestamp: bot.lastSaveTime.getTime(),
            pendingSaves: bot.pendingSaves.size,
            nextSaveIn: 1 * 60 * 1000
        });
    } else {
        // ส่งสถานะว่าบอทยังไม่พร้อม
        socket.emit("botStatus", { 
            isReady: false, 
            message: "บอทกำลังเริ่มต้นระบบ..." 
        });
    }

    // รับ request ข้อมูลจาก client
    socket.on("requestData", () => {
        console.log(`[WEB] 📡 Client ขอข้อมูล (${socket.id})`);
        if (bot.isReady) {
            bot.broadcastToWeb();
        }
    });

    // รับ request ข้อมูลสถานะ Auto-Save
    socket.on("requestSaveStatus", () => {
        console.log(`[WEB] ${EMOJIS.SAVE} Client ขอข้อมูลสถานะการบันทึก (${socket.id})`);
        socket.emit("saveStatus", {
            timestamp: bot.lastSaveTime.getTime(),
            pendingSaves: bot.pendingSaves.size,
            nextSaveIn: 1 * 60 * 1000
        });
    });

    // แจ้งเมื่อผู้ใช้ disconnect
    socket.on("disconnect", () => {
        console.log(`[WEB] 👋 ผู้ใช้งาน disconnect จาก Web Interface (${socket.id})`);
    });
});

// สร้างและเริ่มต้นบอท
const bot = new VoiceChatLeaderboard(io);
bot.start();

// เริ่มต้น Web Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[WEB] 🚀 Web Server กำลังทำงานที่ Port ${PORT}`);
    console.log(`[WEB] 🌐 URL: ${process.env.REPL_URL || `http://localhost:${PORT}`}`);
    console.log(`[SYSTEM] ${EMOJIS.SAVE} Auto-Save: ทุก 1 นาที | Auto-Refresh: ทุก 1 นาที`);
});

// Graceful shutdown (ปรับปรุงแล้ว)
process.on('SIGINT', () => {
    console.log(`\n[SYSTEM] 🛑 ได้รับสัญญาณปิดระบบ...`);
    bot.shutdown();
    server.close(() => {
        console.log('[WEB] 🌐 ปิด Web Server เรียบร้อย');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log(`\n[SYSTEM] 🛑 ได้รับสัญญาณ SIGTERM...`);
    bot.shutdown();
    server.close(() => {
        console.log('[WEB] 🌐 ปิด Web Server เรียบร้อย');
        process.exit(0);
    });
});

// จัดการ unhandled errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('[ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('[ERROR] Uncaught Exception:', error);
    bot.shutdown();
    process.exit(1);
});