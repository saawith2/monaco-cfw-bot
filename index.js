const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, onChildAdded, update } = require('firebase/database');

/* ══════════════════════════════════
   CONFIG — عدّل هنا
══════════════════════════════════ */
const BOT_TOKEN  = process.env.BOT_TOKEN;   // من Railway Variables
const GUILD_ID   = process.env.GUILD_ID;    // ID السيرفر
const ROLE_ID    = process.env.ROLE_ID;     // ID رتبة "متقدم"

const firebaseConfig = {
  apiKey:            "AIzaSyAGddF4CRhrQ1rW2LXwY6FyHww6iHdqyYg",
  authDomain:        "monaco1-58d60.firebaseapp.com",
  databaseURL:       "https://monaco1-58d60-default-rtdb.firebaseio.com",
  projectId:         "monaco1-58d60",
  storageBucket:     "monaco1-58d60.firebasestorage.app",
  messagingSenderId: "117043233568",
  appId:             "1:117043233568:web:97d17d887270d724d38d45"
};

/* ══════════════════════════════════
   INIT
══════════════════════════════════ */
const fbApp = initializeApp(firebaseConfig);
const db    = getDatabase(fbApp);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ]
});

/* ══════════════════════════════════
   BOT READY
══════════════════════════════════ */
client.once('ready', () => {
  console.log(`✅ البوت شغّال: ${client.user.tag}`);
  listenForApplications();
});

/* ══════════════════════════════════
   LISTEN FOR NEW APPLICATIONS
══════════════════════════════════ */
// نخزن المفاتيح الموجودة مسبقاً عشان ما نعالج القديمة
const processedKeys = new Set();
let initialized = false;

function listenForApplications() {
  const appsRef = ref(db, 'cfw_applications');

  onChildAdded(appsRef, async (snapshot) => {
    const key = snapshot.key;

    // تجاهل الطلبات الموجودة قبل تشغيل البوت
    if (!initialized) {
      processedKeys.add(key);
      return;
    }

    // تجاهل المعالجة المكررة
    if (processedKeys.has(key)) return;
    processedKeys.add(key);

    const app = snapshot.val();
    if (!app || !app.userId) return;

    console.log(`📋 طلب جديد من: ${app.globalName || app.username}`);

    try {
      const guild  = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(app.userId).catch(() => null);

      if (member) {
        // إعطاء الرتبة
        await member.roles.add(ROLE_ID);
        console.log(`✅ تم إعطاء الرتبة لـ ${app.globalName || app.username}`);
      } else {
        console.log(`⚠️ اللاعب ${app.userId} مش موجود في السيرفر`);
      }

    } catch (err) {
      console.error('❌ خطأ:', err.message);
    }
  });

  // بعد ثانية نبدأ نعالج الطلبات الجديدة فقط
  setTimeout(() => {
    initialized = true;
    console.log('👂 البوت يستمع للطلبات الجديدة...');
  }, 1000);
}

/* ══════════════════════════════════
   LOGIN
══════════════════════════════════ */
client.login(BOT_TOKEN);
