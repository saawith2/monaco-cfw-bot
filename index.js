const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');

const BOT_TOKEN    = process.env.BOT_TOKEN;
const GUILD_ID     = process.env.GUILD_ID;
const ROLE_ID      = process.env.ROLE_ID;
const FIREBASE_URL = 'https://monaco1-58d60-default-rtdb.firebaseio.com/cfw_applications.json';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// جلب البيانات من Firebase
function fetchFirebase() {
  return new Promise((resolve) => {
    https.get(FIREBASE_URL, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve(null); }
      });
    }).on('error', (e) => {
      console.log('Firebase error:', e.message);
      resolve(null);
    });
  });
}

// إعطاء الرتبة
async function giveRole(userId, username) {
  try {
    const guild  = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);
    if (member.roles.cache.has(ROLE_ID)) {
      console.log(`${username} - عنده الرتبة مسبقاً`);
      return;
    }
    await member.roles.add(ROLE_ID);
    console.log(`✅ رتبة أُعطيت لـ ${username}`);
  } catch (e) {
    console.log(`خطأ مع ${userId}: ${e.message}`);
  }
}

const seen = new Set();
let ready  = false;

async function poll() {
  const data = await fetchFirebase();

  if (!data || typeof data !== 'object') {
    console.log('لا توجد بيانات في Firebase بعد');
    return;
  }

  const entries = Object.entries(data);
  console.log(`Firebase: ${entries.length} طلب`);

  for (const [key, app] of entries) {
    if (!ready) { seen.add(key); continue; }   // أول تشغيل — تجاهل القديمة
    if (seen.has(key)) continue;
    seen.add(key);

    if (!app?.userId) continue;
    console.log(`🆕 طلب جديد: ${app.globalName || app.username}`);
    await giveRole(app.userId, app.globalName || app.username);
  }

  if (!ready) {
    ready = true;
    console.log('✅ جاهز — يراقب الطلبات الجديدة كل 10 ثواني');
  }
}

client.once('ready', () => {
  console.log(`🤖 البوت: ${client.user.tag}`);
  poll();
  setInterval(poll, 10000);
});

client.login(BOT_TOKEN).catch(e => console.log('خطأ في تسجيل الدخول:', e.message));
