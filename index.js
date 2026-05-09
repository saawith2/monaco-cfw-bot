const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const https = require('https');

/* ══════ CONFIG ══════ */
const BOT_TOKEN    = process.env.BOT_TOKEN;
const GUILD_ID     = process.env.GUILD_ID;
const ROLE_ID      = process.env.ROLE_ID;
const FIREBASE_URL = 'https://monaco1-58d60-default-rtdb.firebaseio.com';

/* ══════ DISCORD CLIENT ══════ */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

/* ══════ HTTP HELPER ══════ */
function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      });
    }).on('error', reject);
  });
}

/* ══════ GIVE ROLE ══════ */
async function giveRole(userId) {
  try {
    const guild  = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId).catch(() => null);

    // ← DEBUG: شوف إيه اللي جاي من Firebase وإيه الـ Discord user
    console.log(`🔎 userId من Firebase: "${userId}" | username: ${member?.user?.username ?? 'مش لاقيه'} | tag: ${member?.user?.tag ?? 'N/A'}`);

    if (!member) {
      console.log(`⚠️ اللاعب ${userId} مش في السيرفر — تأكد إن الـ userId في Firebase هو Discord ID صح`);
      return;
    }
    if (member.roles.cache.has(ROLE_ID)) {
      console.log(`ℹ️ ${member.user.username} عنده الرتبة مسبقاً — الـ ROLE_ID: ${ROLE_ID}`);
      return;
    }
    await member.roles.add(ROLE_ID);
    console.log(`✅ تم إعطاء الرتبة لـ ${member.user.username}`);
  } catch (err) {
    console.error('❌ خطأ في إعطاء الرتبة:', err.message);
  }
}

/* ══════ POLLING ══════ */
let lastKeys = new Set();
let firstRun = true;

async function checkApplications() {
  try {
    console.log('🔍 يفحص Firebase...');
    const data = await get(`${FIREBASE_URL}/cfw_applications.json`);

    if (!data) {
      console.log('⚠️ Firebase رجع null — تأكد من Database Rules');
      return;
    }

    const keys = Object.keys(data);
    console.log(`📊 عدد الطلبات الكلي: ${keys.length}`);

    if (firstRun) {
      keys.forEach(k => lastKeys.add(k));
      firstRun = false;
      console.log(`📋 ${keys.length} طلب موجود مسبقاً — يستمع للجديدة...`);
      return;
    }

    for (const key of keys) {
      if (lastKeys.has(key)) continue;
      lastKeys.add(key);

      const app = data[key];

      // ← DEBUG: شوف كل بيانات الطلب الجديد
      console.log(`🆕 طلب جديد! key: ${key}`);
      console.log(`📦 بيانات الطلب:`, JSON.stringify(app, null, 2));

      if (!app || !app.userId) {
        console.log('⚠️ الطلب ما فيه userId — تأكد من اسم الـ field في Firebase');
        continue;
      }

      await giveRole(app.userId);
    }

  } catch (err) {
    console.error('❌ خطأ في الفحص:', err.message);
  }
}

/* ══════ SLASH COMMANDS ══════ */
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('owner')
      .setDescription('صانع البوت')
      .toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      { body: commands }
    );
    console.log('✅ تم تسجيل الأوامر بنجاح');
  } catch (err) {
    console.error('❌ خطأ في تسجيل الأوامر:', err.message);
  }
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'owner') {
    await interaction.reply({
      content: '👑 صانع البوت العم كافح <@1266569651664457738>',
      allowedMentions: { users: ['1266569651664457738'] }
    });
  }
});

/* ══════ START ══════ */
client.once('ready', async () => {
  console.log(`✅ البوت شغّال: ${client.user.tag}`);
  console.log(`🔧 GUILD_ID: ${GUILD_ID}`);
  console.log(`🔧 ROLE_ID: ${ROLE_ID}`);
  await registerCommands();
  // فحص كل 10 ثواني
  checkApplications();
  setInterval(checkApplications, 10000);
});

client.login(BOT_TOKEN);
