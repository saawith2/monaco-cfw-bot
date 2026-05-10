const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');

const BOT_TOKEN    = process.env.BOT_TOKEN;
const GUILD_ID     = process.env.GUILD_ID;
const ROLE_ID      = process.env.ROLE_ID;
const FIREBASE_URL = 'https://monaco1-58d60-default-rtdb.firebaseio.com/cfw_applications.json';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

function fetchFirebase() {
  return new Promise(resolve => {
    https.get(FIREBASE_URL, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    }).on('error', e => { console.log('Firebase error:', e.message); resolve(null); });
  });
}

async function giveRole(userId, username) {
  try {
    const guild  = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) { console.log(`⚠️ ${username} مش في السيرفر`); return; }
    if (member.roles.cache.has(ROLE_ID)) { console.log(`${username} - عنده الرتبة`); return; }
    await member.roles.add(ROLE_ID);
    console.log(`✅ رتبة أُعطيت لـ ${username}`);
  } catch(e) {
    console.log(`خطأ: ${e.message}`);
  }
}

// نخزن آخر حالة لكل طلب
const lastStatus = {};
let firstRun = true;

async function poll() {
  const data = await fetchFirebase();
  if (!data || typeof data !== 'object') return;

  const entries = Object.entries(data);

  for (const [key, app] of entries) {
    const status = app.status || 'pending';

    if (firstRun) {
      // أول تشغيل: احفظ الحالات الحالية بدون معالجة
      lastStatus[key] = status;
      continue;
    }

    const prev = lastStatus[key];
    lastStatus[key] = status;

    // طلب جديد لم يُرَ
    if (prev === undefined) {
      console.log(`🆕 طلب جديد (${status}): ${app.globalName || app.username}`);
      if (status === 'accepted') {
        await giveRole(app.userId, app.globalName || app.username);
      }
      continue;
    }

    // تغيّرت الحالة إلى accepted
    if (prev !== 'accepted' && status === 'accepted') {
      console.log(`🎉 تم قبول: ${app.globalName || app.username}`);
      await giveRole(app.userId, app.globalName || app.username);
    }
  }

  if (firstRun) {
    firstRun = false;
    console.log(`✅ جاهز — ${entries.length} طلب موجود، يراقب التغييرات كل 8 ثواني`);
  }
}

client.once('ready', () => {
  console.log(`🤖 ${client.user.tag} — شغّال`);
  poll();
  setInterval(poll, 8000);
});

client.login(BOT_TOKEN).catch(e => console.log('خطأ:', e.message));
