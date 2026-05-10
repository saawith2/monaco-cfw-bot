const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');
const http  = require('http');

const BOT_TOKEN    = process.env.BOT_TOKEN;
const GUILD_ID     = process.env.GUILD_ID;
const ROLE_ID      = process.env.ROLE_ID;
const FIREBASE_URL = 'https://monacocfw-default-rtdb.firebaseio.com/cfw_applications.json';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// Keep-alive - يمنع Railway من إيقاف البوت
http.createServer((req, res) => res.end('OK')).listen(process.env.PORT || 3000);

/* ─── Firebase ─── */
function fetchFirebase() {
  return new Promise(resolve => {
    https.get(FIREBASE_URL, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    }).on('error', e => { console.log('Firebase error:', e.message); resolve(null); });
  });
}

/* ─── Get Member ─── */
async function getMember(userId) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    return await guild.members.fetch(userId).catch(() => null);
  } catch { return null; }
}

/* ─── Give Role ─── */
async function giveRole(userId, username) {
  const member = await getMember(userId);
  if (!member) { console.log(`⚠️ ${username} مش في السيرفر`); return; }
  if (member.roles.cache.has(ROLE_ID)) { console.log(`${username} - عنده الرتبة`); return; }
  await member.roles.add(ROLE_ID);
  console.log(`✅ رتبة أُعطيت لـ ${username}`);
}

/* ─── Send DM ─── */
async function sendDM(userId, msg) {
  const member = await getMember(userId);
  if (!member) return;
  try {
    await member.send(msg);
    console.log(`📩 DM أُرسلت لـ ${member.user.username}`);
  } catch(e) { console.log(`⚠️ ما قدر يرسل DM: ${e.message}`); }
}

/* ─── Poll ─── */
const lastStatus = {};
let firstRun = true;

async function poll() {
  const data = await fetchFirebase();
  if (!data || typeof data !== 'object') return;

  const entries = Object.entries(data);

  for (const [key, app] of entries) {
    if (!app?.userId) continue;
    const status = app.status || 'pending';
    const name   = app.globalName || app.username || 'Unknown';

    /* أول تشغيل */
    if (firstRun) {
      lastStatus[key] = status;
      if (status === 'accepted') await giveRole(app.userId, name);
      continue;
    }

    const prev = lastStatus[key];
    lastStatus[key] = status;

    /* طلب جديد */
    if (prev === undefined) {
      console.log(`🆕 طلب جديد (${status}): ${name}`);
      if (status === 'pending') {
        await sendDM(app.userId,
          `👋 **أهلاً ${name}!**\n\n` +
          `📋 **طلبك قيد المراجعة**\n` +
          `تم استلام تقديمك في **MONACO CFW** بنجاح.\n` +
          `سيتم الرد عليك قريباً — تابع السيرفر! ⏳`
        );
      } else if (status === 'accepted') {
        await giveRole(app.userId, name);
        await sendDM(app.userId,
          `🎉 **تم قبول تقديمك الإلكتروني!**\n\n` +
          `مرحباً **${name}** في عائلة **MONACO CFW** 🏆\n\n` +
          `📅 يرجى الذهاب إلى السيرفر ومعرفة **موعد الاختبار الصوتي**.\n\n` +
          `نتمنى لك تجربة رائعة! 🎮`
        );
      }
      continue;
    }

    /* تغيّرت الحالة */
    if (prev === status) continue;
    console.log(`🔄 تغيّر: ${name} — ${prev} → ${status}`);

    if (status === 'accepted') {
      await giveRole(app.userId, name);
      await sendDM(app.userId,
        `🎉 **تم قبول تقديمك الإلكتروني!**\n\n` +
        `مرحباً **${name}** في عائلة **MONACO CFW** 🏆\n\n` +
        `📅 يرجى الذهاب إلى السيرفر ومعرفة **موعد الاختبار الصوتي**.\n\n` +
        `نتمنى لك تجربة رائعة! 🎮`
      );
    } else if (status === 'rejected') {
      await sendDM(app.userId,
        `❌ **تم رفض طلبك**\n\n` +
        `مرحباً **${name}**،\n` +
        `لم يتم قبول تقديمك في **MONACO CFW** هذه المرة.\n\n` +
        `💪 راجع القوانين جيداً وحاول مرة أخرى!`
      );
    }
  }

  if (firstRun) {
    firstRun = false;
    console.log(`✅ جاهز — ${entries.length} طلب موجود، يراقب التغييرات كل 8 ثواني`);
  }
}

/* ─── Start ─── */
client.once('ready', () => {
  console.log(`🤖 ${client.user.tag} — شغّال`);
  poll();
  setInterval(poll, 8000);
});

client.login(BOT_TOKEN).catch(e => console.log('خطأ:', e.message));
