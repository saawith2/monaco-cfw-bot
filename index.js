const { Client, GatewayIntentBits } = require('discord.js');
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
    if (!member) {
      console.log(`⚠️ اللاعب ${userId} مش في السيرفر`);
      return;
    }
    if (member.roles.cache.has(ROLE_ID)) {
      console.log(`ℹ️ ${member.user.username} عنده الرتبة مسبقاً`);
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
      console.log(`🆕 طلب جديد! userId: ${app?.userId}`);
      if (!app || !app.userId) {
        console.log('⚠️ الطلب ما فيه userId');
        continue;
      }

      await giveRole(app.userId);
    }

  } catch (err) {
    console.error('❌ خطأ في الفحص:', err.message);
  }
}

/* ══════ START ══════ */
client.once('ready', () => {
  console.log(`✅ البوت شغّال: ${client.user.tag}`);
  // فحص كل 10 ثواني
  checkApplications();
  setInterval(checkApplications, 10000);
});

client.login(BOT_TOKEN);
