const {
  Client, GatewayIntentBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  InteractionType
} = require('discord.js');
const https = require('https');

const BOT_TOKEN  = process.env.BOT_TOKEN;
const GUILD_ID   = process.env.GUILD_ID;
const ROLE_ID    = process.env.ROLE_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const FIREBASE   = 'https://monacocfw-default-rtdb.firebaseio.com';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

/* ── Firebase GET ── */
function fbGet(path) {
  return new Promise(resolve => {
    https.get(`${FIREBASE}/${path}.json`, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

/* ── Firebase PATCH ── */
function fbPatch(path, data) {
  return new Promise(resolve => {
    const body = JSON.stringify(data);
    const url  = new URL(`${FIREBASE}/${path}.json`);
    const req  = https.request({
      hostname: url.hostname, path: url.pathname, method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { res.resume(); res.on('end', resolve); });
    req.on('error', resolve);
    req.write(body); req.end();
  });
}

/* ── Send DM ── */
async function sendDM(userId, message) {
  try {
    const guild  = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId).catch(()=>null);
    if (!member) return;
    await member.send(message);
    console.log(`📩 DM أُرسلت لـ ${member.user.username}`);
  } catch(e) {
    console.log(`⚠️ ما قدر يرسل DM لـ ${userId}: ${e.message}`);
  }
}

/* ── Send Embed with Buttons ── */
async function sendEmbed(key, app) {
  try {
    const guild   = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(CHANNEL_ID);
    const av      = app.userId && app.avatar
      ? `https://cdn.discordapp.com/avatars/${app.userId}/${app.avatar}.png?size=128`
      : 'https://cdn.discordapp.com/embed/avatars/0.png';
    const a = app.answers || {};

    const embed = new EmbedBuilder()
      .setTitle('🎮 طلب تفعيل جديد — MONACO CFW')
      .setColor(0xf0c040)
      .setThumbnail(av)
      .addFields(
        { name:'👤 المتقدم',          value:`${app.globalName||app.username||'Unknown'}\n\`${app.userId||'—'}\``, inline:true },
        { name:'📛 الاسم في الرول',   value: a['الاسم الكامل في الرول']||'—',                                    inline:true },
        { name:'🎂 العمر',             value: a['العمر الحقيقي']||'—',                                            inline:true },
        { name:'🧠 Metagaming',        value:(a['تعريف Metagaming']||'—').slice(0,1000),                          inline:false },
        { name:'💀 New Life Rule',     value:(a['New Life Rule']||'—').slice(0,1000),                              inline:false },
        { name:'🎭 الشخصية وقصتها',   value:(a['شخصية الرول وقصتها']||'—').slice(0,1000),                        inline:false },
        { name:'🏆 خبرة سابقة',        value:(a['خبرة سابقة']||'—').slice(0,500),                                 inline:false },
        { name:'📜 القوانين',           value:(a['قوانين السيرفر']||'—').slice(0,1000),                            inline:false },
        { name:'💬 سبب الانضمام',      value:(a['سبب الانضمام']||'—').slice(0,500),                               inline:false },
        { name:'🔖 الحالة',            value:'🟡 قيد المراجعة',                                                    inline:true }
      )
      .setFooter({ text:'MONACO CFW • نظام التفعيل' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept_${key}`).setLabel('✅ قبول').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject_${key}`).setLabel('❌ رفض').setStyle(ButtonStyle.Danger)
    );

    const msg = await channel.send({ embeds:[embed], components:[row] });
    await fbPatch(`cfw_applications/${key}`, { messageId: msg.id });
    console.log(`📨 إمبد أُرسل لـ ${app.globalName||app.username}`);

    // رسالة خاصة: قيد المراجعة
    await sendDM(app.userId,
      `👋 **أهلاً ${app.globalName||app.username}!**\n\n` +
      `📋 **طلبك قيد المراجعة**\n` +
      `تم استلام تقديمك الإلكتروني في **MONACO CFW** بنجاح، وهو الآن قيد المراجعة من قِبل الإدارة.\n\n` +
      `⏳ سيتم الرد عليك قريباً — تأكد من تفعيل الإشعارات في السيرفر.`
    );
  } catch(e) {
    console.error('❌ خطأ في إرسال الإمبد:', e.message);
  }
}

/* ── Button Interaction ── */
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  const [action, key] = interaction.customId.split('_');
  if (!key || (action !== 'accept' && action !== 'reject')) return;

  const isAdmin = interaction.member.permissions.has('ManageRoles') ||
                  interaction.member.permissions.has('Administrator');
  if (!isAdmin) {
    return interaction.reply({ content:'⛔ ليس لديك صلاحية.', ephemeral:true });
  }

  await interaction.deferUpdate();

  const app = await fbGet(`cfw_applications/${key}`);
  if (!app) return;
  if (app.status !== 'pending') {
    return interaction.followUp({ content:'⚠️ تمت مراجعة هذا الطلب مسبقاً.', ephemeral:true });
  }

  const accepted = action === 'accept';

  // تحديث Firebase
  await fbPatch(`cfw_applications/${key}`, { status: accepted ? 'accepted' : 'rejected' });
  const stats   = await fbGet('cfw_stats');
  await fbPatch('cfw_stats', {
    pending:  Math.max(0, (stats?.pending||1) - 1),
    [accepted ? 'accepted' : 'rejected']: (stats?.[accepted?'accepted':'rejected']||0) + 1
  });

  // إعطاء الرتبة
  if (accepted && app.userId) {
    try {
      const guild  = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(app.userId).catch(()=>null);
      if (member) { await member.roles.add(ROLE_ID); console.log(`✅ رتبة: ${app.globalName||app.username}`); }
    } catch(e) { console.error('خطأ رتبة:', e.message); }
  }

  // رسالة خاصة للمتقدم
  if (app.userId) {
    if (accepted) {
      await sendDM(app.userId,
        `🎉 **تم قبول تقديمك الإلكتروني!**\n\n` +
        `مرحباً **${app.globalName||app.username}** في عائلة **MONACO CFW** 🏆\n\n` +
        `📅 يرجى الذهاب إلى السيرفر ومعرفة **موعد الاختبار الصوتي** مع أحد أفراد الإدارة.\n\n` +
        `نتمنى لك تجربة رول بلاي رائعة! 🎮`
      );
    } else {
      await sendDM(app.userId,
        `❌ **تم رفض طلبك**\n\n` +
        `مرحباً **${app.globalName||app.username}**،\n` +
        `للأسف لم يتم قبول تقديمك في **MONACO CFW** هذه المرة.\n\n` +
        `💪 لا تستسلم! راجع **قوانين السيرفر** جيداً وحاول مرة أخرى.\n\n` +
        `نحن ننتظرك! 🙌`
      );
    }
  }

  // تحديث الإمبد
  const av = app.userId && app.avatar
    ? `https://cdn.discordapp.com/avatars/${app.userId}/${app.avatar}.png?size=128`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';

  const updEmbed = new EmbedBuilder()
    .setTitle(accepted ? '✅ تم قبول الطلب — MONACO CFW' : '❌ تم رفض الطلب — MONACO CFW')
    .setColor(accepted ? 0x4ade80 : 0xf87171)
    .setThumbnail(av)
    .addFields(
      { name:'👤 المتقدم',        value:`${app.globalName||app.username||'Unknown'}\n\`${app.userId||'—'}\``, inline:true },
      { name:'📛 الاسم في الرول', value:(app.answers?.['الاسم الكامل في الرول']||'—'),                        inline:true },
      { name:'🎂 العمر',           value:(app.answers?.['العمر الحقيقي']||'—'),                                inline:true },
      { name:'🔖 النتيجة',         value: accepted ? '🟢 مقبول' : '🔴 مرفوض',                                 inline:true },
      { name:'👮 القرار من',        value:`${interaction.user.globalName||interaction.user.username}`,          inline:true }
    )
    .setFooter({ text:'MONACO CFW • نظام التفعيل' })
    .setTimestamp();

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('d1').setLabel('✅ قبول').setStyle(ButtonStyle.Success).setDisabled(true),
    new ButtonBuilder().setCustomId('d2').setLabel('❌ رفض').setStyle(ButtonStyle.Danger).setDisabled(true)
  );

  await interaction.editReply({ embeds:[updEmbed], components:[disabledRow] });
  console.log(`${accepted?'✅ قُبل':'❌ رُفض'}: ${app.globalName||app.username} — بواسطة ${interaction.user.username}`);
});

/* ── Polling ── */
const seen = new Set();
let ready  = false;

async function poll() {
  const data = await fbGet('cfw_applications');
  if (!data || typeof data !== 'object') { console.log('Firebase: لا توجد بيانات'); return; }
  const entries = Object.entries(data);
  for (const [key, app] of entries) {
    if (!ready) { seen.add(key); continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    if (!app?.userId) continue;
    console.log(`🆕 طلب: ${app.globalName||app.username}`);
    await sendEmbed(key, app);
  }
  if (!ready) { ready = true; console.log(`✅ جاهز — ${entries.length} طلب قديم، يراقب الجديدة...`); }
}

client.once('ready', () => {
  console.log(`🤖 ${client.user.tag}`);
  poll();
  setInterval(poll, 10000);
});

client.login(BOT_TOKEN).catch(e => console.error('خطأ:', e.message));
