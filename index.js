const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');

const BOT_TOKEN    = process.env.BOT_TOKEN;
const GUILD_ID     = process.env.GUILD_ID;
const ROLE_ID      = process.env.ROLE_ID;
const FIREBASE_URL = 'https://monacocfw-default-rtdb.firebaseio.com/cfw_applications.json';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

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

const rolesGiven = new Set();
let firstRun = true;

async function poll() {
  const data = await fetchFirebase();

  if (!data || typeof data !== 'object') {
    console.log('لا توجد بيانات في Firebase');
    return;
  }

  const entries = Object.entries(data);

  if (firstRun) {
    for (const [key, app] of entries) {
      if (app?.status === 'accepted') rolesGiven.add(key);
    }
    firstRun = false;
    console.log(`✅ جاهز — يراقب التغييرات كل 5 ثواني`);
    return;
  }

  for (const [key, app] of entries) {
    if (!app?.userId) continue;
    if (rolesGiven.has(key)) continue;

    if (app.status === 'accepted') {
      rolesGiven.add(key);
      console.log(`🆕 طلب مقبول: ${app.globalName || app.username}`);
      await giveRole(app.userId, app.globalName || app.username);
    }
  }
}

client.once('ready', () => {
  console.log(`🤖 البوت: ${client.user.tag}`);
  poll();
  setInterval(poll, 5000);
});

client.login(BOT_TOKEN).catch(e => console.log('خطأ:', e.message));
