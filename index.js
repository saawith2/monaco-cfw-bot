const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID  = process.env.GUILD_ID;
const ROLE_ID   = process.env.ROLE_ID;
const FIREBASE  = 'https://monaco1-58d60-default-rtdb.firebaseio.com/cfw_applications.json';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

/* ─── Firebase GET ─── */
function fetchData() {
  return new Promise(resolve => {
    https.get(FIREBASE, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

/* ─── Send DM ─── */
async function sendDM(userId, message) {
  try {
    const guild  = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    await member.send(message);
    console.log(`📩 DM أُرسلت لـ ${member.user.username}`);
  } catch(e) {
    console.log(`⚠️ ما قدر يرسل DM: ${e.message}`);
  }
}

/* ─── Give Role ─── */
async function giveRole(userId, username) {
  try {
    const guild  = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    if (member.roles.cache.has(ROLE_ID)) return;
    await member.roles.add(ROLE_ID);
    console.log(`✅ رتبة: ${username}`);
  } catch(e) {
    console.log(`⚠️ خطأ رتبة: ${e.message}`);
  }
}

/* ─── Track State ─── */
// key → last known status
const knownStatus = {};
let firstRun = true;

async function poll() {
  const data = await fetchData();
  if (!data || typeof data !== 'object') return;

  for (const [key, app] of Object.entries(data)) {
    if (!app?.userId) continue;
    const status = app.status || 'pending';

    if (firstRun) {
      // احفظ الحالات الموجودة بدون معالجة
      knownStatus[key] = status;
      continue;
    }

    const prev = knownStatus[key];

    /* ── طلب جديد لم يُرَ من قبل ── */
    if (prev === undefined) {
      knownStatus[key] = status;
      if (status === 'pending') {
        console.log(`🆕 طلب جديد: ${app.globalName || app.username}`);
        await sendDM(app.userId,
          `👋 **أهلاً ${app.globalName || app.username}!**\n\n` +
          `📋 **طلبك قيد المراجعة**\n` +
          `تم استلام تقديمك في **MONACO CFW** بنجاح.\n` +
          `سيتم الرد عليك قريباً — تابع السيرفر! ⏳`
        );
      }
      continue;
    }

    /* ── تغيّر الحالة ── */
    if (prev !== status) {
      knownStatus[key] = status;

      if (status === 'accepted') {
        console.log(`✅ مقبول: ${app.globalName || app.username}`);
        await giveRole(app.userId, app.globalName || app.username);
        await sendDM(app.userId,
          `🎉 **تم قبول تقديمك الإلكتروني!**\n\n` +
          `مرحباً **${app.globalName || app.username}** في عائلة **MONACO CFW** 🏆\n\n` +
          `📅 يرجى الذهاب إلى السيرفر ومعرفة **موعد الاختبار الصوتي** مع الإدارة.\n\n` +
          `نتمنى لك تجربة رائعة! 🎮`
        );

      } else if (status === 'rejected') {
        console.log(`❌ مرفوض: ${app.globalName || app.username}`);
        await sendDM(app.userId,
          `❌ **تم رفض طلبك**\n\n` +
          `مرحباً **${app.globalName || app.username}**،\n` +
          `لم يتم قبول تقديمك في **MONACO CFW** هذه المرة.\n\n` +
          `💪 راجع القوانين جيداً وحاول مرة أخرى!\n`
        );
      }
    }
  }

  if (firstRun) {
    firstRun = false;
    console.log(`✅ جاهز — ${Object.keys(knownStatus).length} طلب موجود، يراقب التغييرات...`);
  }
}

/* ─── Start ─── */
client.once('ready', () => {
  console.log(`🤖 ${client.user.tag} — شغّال`);
  poll();
  setInterval(poll, 8000);
});

client.login(BOT_TOKEN).catch(e => console.error('خطأ:', e.message));
