const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ButtonBuilder, 
  ActionRowBuilder, 
  ButtonStyle,
  REST,
  Routes
} = require('discord.js');
const https = require('https');
const http  = require('http');

const BOT_TOKEN    = process.env.BOT_TOKEN;
const CLIENT_ID    = process.env.CLIENT_ID;
const GUILD_ID     = process.env.GUILD_ID;
const FIREBASE_URL = 'https://monacocfw-default-rtdb.firebaseio.com/cfw_applications.json';

let ROLE_ID = null;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

// Keep-alive
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
  if (!ROLE_ID) { console.log(`⚠️ لم يتم تعيين الرتبة`); return; }
  const member = await getMember(userId);
  if (!member) { console.log(`⚠️ ${username} مش في السيرفر`); return; }
  if (member.roles.cache.has(ROLE_ID)) { console.log(`${username} - عنده الرتبة`); return; }
  await member.roles.add(ROLE_ID);
  console.log(`✅ رتبة أُعطيت لـ ${username}`);
}

/* ─── Send DM with Buttons ─── */
async function sendDMWithButtons(userId, embed, buttons) {
  const member = await getMember(userId);
  if (!member) return;
  try {
    await member.send({ 
      embeds: [embed],
      components: buttons ? [new ActionRowBuilder().addComponents(buttons)] : []
    });
    console.log(`📩 رسالة أُرسلت لـ ${member.user.username}`);
  } catch(e) { console.log(`⚠️ ما قدر يرسل: ${e.message}`); }
}

/* ─── Send DM Text ─── */
async function sendDM(userId, msg) {
  const member = await getMember(userId);
  if (!member) return;
  try {
    await member.send(msg);
    console.log(`📩 رسالة نصية أُرسلت لـ ${member.user.username}`);
  } catch(e) { console.log(`⚠️ ما قدر يرسل: ${e.message}`); }
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
        const embed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('📋 طلبك قيد المراجعة')
          .setDescription(`تم إرسال طلبك، طلبك قيد المراجعة`)
          .addFields(
            { name: 'الحالة', value: '⏳ قيد الانتظار', inline: false }
          )
          .setTimestamp();
        await sendDMWithButtons(app.userId, embed, null);
      } else if (status === 'accepted') {
        await giveRole(app.userId, name);
        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('🎉 تم قبول تقديمك!')
          .setDescription(`تم قبولك توجه السيرفر لمعرفة مواعيد التفعيل`)
          .addFields(
            { name: 'الحالة', value: '✅ مقبول', inline: false }
          )
          .setTimestamp();
        await sendDMWithButtons(app.userId, embed, null);
      } else if (status === 'rejected') {
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ تم رفض طلبك')
          .setDescription(`حاول مرة أخرى كمان 12 ساعة`)
          .addFields(
            { name: 'الحالة', value: '❌ مرفوض', inline: false }
          )
          .setTimestamp();
        await sendDMWithButtons(app.userId, embed, null);
      }
      continue;
    }

    /* تغيّرت الحالة */
    if (prev === status) continue;
    console.log(`🔄 تغيّر: ${name} — ${prev} → ${status}`);

    if (status === 'accepted') {
      await giveRole(app.userId, name);
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🎉 تم قبول تقديمك!')
        .setDescription(`${name}, تم قبولك توجه السيرفر لمعرفة مواعيد التفعيل`)
        .addFields(
          { name: 'الحالة', value: '✅ مقبول', inline: false }
        )
        .setTimestamp();
      await sendDMWithButtons(app.userId, embed, null);
    } else if (status === 'rejected') {
      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ تم رفض طلبك')
        .setDescription(`حاول مرة أخرى كمان 12 ساعة`)
        .addFields(
          { name: 'الحالة', value: '❌ مرفوض', inline: false }
        )
        .setTimestamp();
      await sendDMWithButtons(app.userId, embed, null);
    }
  }

  if (firstRun) {
    firstRun = false;
    console.log(`✅ جاهز — ${entries.length} طلب موجود، يراقب التغييرات كل 8 ثواني`);
  }
}

/* ─── Slash Commands ─── */
const commands = [
  {
    name: 'set-role',
    description: 'تعيين رتبة القبول',
    options: [
      {
        name: 'role',
        description: 'الرتبة المراد تعيينها',
        type: 8,
        required: true
      }
    ]
  },
  {
    name: 'set-guild',
    description: 'تعيين السيرفر',
    options: [
      {
        name: 'guild_id',
        description: 'معرف السيرفر',
        type: 3,
        required: true
      }
    ]
  }
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  try {
    console.log('جاري تسجيل الأوامر...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('✅ تم تسجيل الأوامر بنجاح');
  } catch (err) {
    console.log('❌ خطأ في تسجيل الأوامر:', err.message);
  }
}

/* ─── Interaction Handler ─── */
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  if (commandName === 'set-role') {
    const roleId = options.getRole('role').id;
    ROLE_ID = roleId;
    
    await interaction.reply({
      content: `✅ تم تعيين الرتبة: <@&${roleId}>`,
      ephemeral: true
    });
    console.log(`✅ رتبة تم تعيينها: ${roleId}`);
  }

  if (commandName === 'set-guild') {
    const guildId = options.getString('guild_id');
    process.env.GUILD_ID = guildId;
    
    await interaction.reply({
      content: `✅ تم تعيين السيرفر: ${guildId}`,
      ephemeral: true
    });
    console.log(`✅ سيرفر تم تعيينه: ${guildId}`);
  }
});

/* ─── Start ─── */
client.once('ready', () => {
  console.log(`🤖 ${client.user.tag} — شغّال`);
  registerCommands();
  poll();
  setInterval(poll, 8000);
});

client.login(BOT_TOKEN).catch(e => console.log('خطأ:', e.message));
