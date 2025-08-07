const { REST, Routes, SlashCommandBuilder } = require("discord.js");

// อ่านค่าจาก Environment Variables (Replit Secrets)
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// ตรวจสอบค่าที่จำเป็นก่อนเริ่ม
if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.error("❌ ERROR: Missing required Replit Secrets:");
    console.error("  - DISCORD_TOKEN: Bot Token ของคุณ");
    console.error("  - CLIENT_ID: Application ID ของบอท");
    console.error("  - GUILD_ID: Server ID ที่ต้องการติดตั้งคำสั่ง");
    console.error("\n📖 วิธีเพิ่ม Secrets ใน Replit:");
    console.error("  1. คลิกแท็บ 'Secrets' ในแถบด้านซ้าย");
    console.error("  2. คลิก 'New Secret'");
    console.error("  3. เพิ่ม Key และ Value ตามที่ระบุข้างต้น");
    console.error("\n📖 วิธีหา CLIENT_ID:");
    console.error("  1. ไปที่ https://discord.com/developers/applications");
    console.error("  2. เลือกแอพพลิเคชันของคุณ");
    console.error("  3. คัดลอก Application ID");
    process.exit(1);
}

console.log("[REPLIT] 🚀 เริ่มติดตั้งคำสั่งใน Replit Environment");
console.log(`[REPLIT] 🎯 Guild ID: ${GUILD_ID}`);
console.log(`[REPLIT] 🤖 Client ID: ${CLIENT_ID}`);

// สร้างคำสั่งต่างๆ ด้วย SlashCommandBuilder
const commands = [
    new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("📊 แสดงตารางอันดับเวลาการใช้งาน Voice Chat")
        .setDefaultMemberPermissions("0") // ต้องมี Administrator
        .toJSON(),

    new SlashCommandBuilder()
        .setName("mytime")
        .setDescription("⏱️ ดูเวลาการใช้งาน Voice Chat ของตัวเอง")
        .toJSON(),

    new SlashCommandBuilder()
    .setName("showallmembers")
    .setDescription("👥 แสดงรายชื่อสมาชิกทั้งหมดในเซิร์ฟเวอร์")
    .toJSON(),

    new SlashCommandBuilder()
    .setName("savestatus")
    .setDescription("💾 ขอข้อมูลสถานะการบันทึก")
    .setDefaultMemberPermissions("0") // ต้องมี Administrator
    .toJSON(),
    
    new SlashCommandBuilder()
        .setName("setleaderboard")
        .setDescription("⚙️ ตั้งค่าห้องนี้สำหรับอัปเดต Leaderboard อัตโนมัติ")
        .setDefaultMemberPermissions("0") // ต้องมี Administrator
        .toJSON(),

    new SlashCommandBuilder()
        .setName("resetleaderboard")
        .setDescription("🗑️ ล้างข้อมูลเวลาการใช้งาน Voice Chat ทั้งหมด (Admin เท่านั้น)")
        .setDefaultMemberPermissions("0") // ต้องมี Administrator
        .toJSON(),

    new SlashCommandBuilder()
        .setName("voicestats")
        .setDescription("📈 ดูสถิติรวมของเซิร์ฟเวอร์")
        .setDefaultMemberPermissions("0") // ต้องมี Administrator
        .toJSON(),

    new SlashCommandBuilder()
        .setName("top")
        .setDescription("🏆 ดูผู้ที่ใช้เวลามากที่สุด")
        .addIntegerOption(option =>
            option.setName("limit")
                .setDescription("จำนวนผู้ที่ต้องการดู (1-25)")
                .setMinValue(1)
                .setMaxValue(25)
                .setRequired(false)
        )
        .toJSON(),

    new SlashCommandBuilder()
        .setName("web")
        .setDescription("🌐 รับลิงค์ Web Interface สำหรับดู Leaderboard แบบเรียลไทม์")
        .toJSON()
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

// ฟังก์ชันติดตั้งคำสั่ง
async function deployCommands() {
    try {
        console.log(`[DEPLOY] 🚀 เริ่มติดตั้ง ${commands.length} คำสั่งสำหรับเซิร์ฟเวอร์ ${GUILD_ID}`);
        console.log("[DEPLOY] 📝 คำสั่งที่จะติดตั้ง:");
        
        commands.forEach((cmd, index) => {
            console.log(`  ${index + 1}. /${cmd.name} - ${cmd.description}`);
        });

        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );

        console.log(`\n[DEPLOY] ✅ ติดตั้งคำสั่งสำเร็จ ${data.length} คำสั่ง!`);
        console.log("[DEPLOY] 🎉 สามารถใช้งานคำสั่งใน Discord ได้แล้ว");
        
        console.log("\n📋 คำสั่งที่พร้อมใช้งาน:");
        console.log("  • /leaderboard - ดูตารางอันดับ");
        console.log("  • /mytime - ดูเวลาของตัวเอง");
        console.log("  • /top - ดูท็อปผู้ใช้");
        console.log("  • /voicestats - ดูสถิติเซิร์ฟเวอร์");
        console.log("  • /web - รับลิงค์ Web Interface");
        console.log("  • /setleaderboard - ตั้งค่าอัปเดตอัตโนมัติ (Admin)");
        console.log("  • /resetleaderboard - รีเซ็ตข้อมูล (Admin)");

        console.log(`\n🌐 Web Interface URL: ${process.env.REPL_URL || 'https://your-repl-name.username.replit.dev'}`);
        console.log("💡 เพิ่มคำสั่ง /web เพื่อให้ผู้ใช้ได้รับลิงค์ Web Interface อย่างง่ายดาย");

    } catch (error) {
        console.error("[DEPLOY] ❌ เกิดข้อผิดพลาดในการติดตั้งคำสั่ง:");
        
        if (error.code === 50001) {
            console.error("❌ บอทไม่มีสิทธิ์เข้าถึงเซิร์ฟเวอร์");
            console.error("💡 แก้ไข: เชิญบอทเข้าเซิร์ฟเวอร์ด้วย scope 'bot' และ 'applications.commands'");
            console.error(`🔗 ลิงค์เชิญบอท: https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=2048&scope=bot%20applications.commands`);
        } else if (error.code === 0 || error.status === 401) {
            console.error("❌ TOKEN หรือ CLIENT_ID ไม่ถูกต้อง");
            console.error("💡 แก้ไข: ตรวจสอบ DISCORD_TOKEN และ CLIENT_ID ใน Replit Secrets");
            console.error("📖 วิธีหา TOKEN: https://discord.com/developers/applications -> Bot -> Token");
        } else {
            console.error("รายละเอียดข้อผิดพลาด:", error);
        }
        
        console.log("\n🔗 ลิงค์ที่มีประโยชน์:");
        console.log(`• เชิญบอท: https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=3148800&scope=bot%20applications.commands`);
        console.log("• Developer Portal: https://discord.com/developers/applications");
        console.log("• Replit Docs: https://docs.replit.com/");
        process.exit(1);
    }
}

// ฟังก์ชันลบคำสั่งทั้งหมด (สำหรับ debug)
async function clearCommands() {
    try {
        console.log("[CLEAR] 🗑️ กำลังลบคำสั่งเก่าทั้งหมด...");
        
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: [] }
        );
        
        console.log("[CLEAR] ✅ ลบคำสั่งเก่าเรียบร้อย");
    } catch (error) {
        console.error("[CLEAR] ❌ เกิดข้อผิดพลาดในการลบคำสั่ง:", error);
    }
}

// ฟังก์ชันติดตั้งคำสั่งแบบ Global (ทุกเซิร์ฟเวอร์)
async function deployGlobalCommands() {
    try {
        console.log(`[GLOBAL] 🌐 เริ่มติดตั้งคำสั่งแบบ Global สำหรับทุกเซิร์ฟเวอร์...`);
        console.log("[GLOBAL] ⚠️  คำเตือน: คำสั่ง Global จะใช้เวลา 1 ชั่วโมงในการอัปเดต!");
        
        const data = await rest.put(
            Routes.applicationCommands(CLIENT_ID), // <--- แก้ไขเป็นบรรทัดนี้
            { body: commands }
        );

        console.log(`[GLOBAL] ✅ ติดตั้งคำสั่ง Global สำเร็จ ${data.length} คำสั่ง!`);
        console.log("[GLOBAL] ⏰ รอ 1 ชั่วโมงเพื่อให้คำสั่งปรากฏในทุกเซิร์ฟเวอร์");
        
    } catch (error) {
        console.error("[GLOBAL] ❌ เกิดข้อผิดพลาดในการติดตั้งคำสั่ง Global:", error);
    }
}

// ฟังก์ชันแสดงคำสั่งที่มีอยู่
async function listCommands() {
    try {
        console.log("[LIST] 📋 กำลังดึงรายการคำสั่งที่มีอยู่...");
        
        const guildCommands = await rest.get(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
        );
        
        console.log(`[LIST] 🏠 คำสั่งในเซิร์ฟเวอร์ (${guildCommands.length} คำสั่ง):`);
        guildCommands.forEach((cmd, index) => {
            console.log(`  ${index + 1}. /${cmd.name} - ${cmd.description}`);
        });
        
        const globalCommands = await rest.get(
            Routes.applicationCommands(CLIENT_ID)
        );
        
        console.log(`\n[LIST] 🌐 คำสั่ง Global (${globalCommands.length} คำสั่ง):`);
        globalCommands.forEach((cmd, index) => {
            console.log(`  ${index + 1}. /${cmd.name} - ${cmd.description}`);
        });
        
    } catch (error) {
        console.error("[LIST] ❌ เกิดข้อผิดพลาดในการดึงรายการคำสั่ง:", error);
    }
}

// ตรวจสอบ argument
const args = process.argv.slice(2);

console.log("\n💡 การใช้งาน:");
console.log("  node deploy-commands.js        - ติดตั้งคำสั่งในเซิร์ฟเวอร์");
console.log("  node deploy-commands.js --clear - ลบคำสั่งทั้งหมด");
console.log("  node deploy-commands.js --global - ติดตั้งคำสั่งแบบ Global");
console.log("  node deploy-commands.js --list  - แสดงคำสั่งที่มีอยู่");

if (args.includes("--clear") || args.includes("-c")) {
    clearCommands().then(() => {
        console.log("\n[INFO] หากต้องการติดตั้งคำสั่งใหม่ รันอีกครั้งโดยไม่ใส่ --clear");
    });
} else if (args.includes("--global") || args.includes("-g")) {
    deployGlobalCommands();
} else if (args.includes("--list") || args.includes("-l")) {
    listCommands();
} else {
    deployCommands();
}

// ข้อมูลเพิ่มเติมสำหรับ Replit
console.log("\n📚 ข้อมูลเพิ่มเติมสำหรับ Replit:");
console.log("  • Secrets: แท็บ 'Secrets' สำหรับ Environment Variables");
console.log("  • Console: แท็บ 'Console' สำหรับดู log");
console.log("  • Webview: แท็บ 'Webview' สำหรับดู Web Interface");
console.log("  • Files: แท็บ 'Files' สำหรับจัดการไฟล์");
console.log("\n🚀 หลังจากติดตั้งคำสั่งแล้ว ให้รัน 'node index.js' เพื่อเริ่มบอท");

// เพิ่มคำสั่ง /web ในรายการ
const webCommand = new SlashCommandBuilder()
    .setName("web")
    .setDescription("🌐 รับลิงค์ Web Interface สำหรับดู Leaderboard แบบเรียลไทม์")
    .toJSON();

// ตรวจสอบว่ามีคำสั่ง /web หรือยัง
const hasWebCommand = commands.some(cmd => cmd.name === 'web');
if (!hasWebCommand) {
    commands.push(webCommand);
}