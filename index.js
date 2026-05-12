const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ButtonBuilder, 
  ActionRowBuilder, 
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
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
let LOG_CHANNEL_ID = null;

// تخزين مؤقت لـ Buttons (messageId -> userId)
const buttonMap = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Keep-alive
http.createServer((req, res) => res.end('OK')).listen(process.env.PORT || 3000);

/* ─── Firebase Functions ─── */
function fetchFirebase() {
  return new Promise(resolve => {
    https.get(FIREBASE_URL, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    }).on('error', e => { console.log('🔥 Firebase error:', e.message); resolve(null); });
  });
}

// تحديث Firebase
function updateFirebase(path, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'monacocfw-default-rtdb.firebaseio.com',
      port: 443,
      path: `/cfw_applications${path}.json`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }
    };

    const req = https.request(options, (res) => {
      res.on('end', () => resolve(true));
    });

    req.on('error', (e) => {
      console.log('Firebase update error:', e.message);
      resolve(false);
    });

    req.write(JSON.stringify(data));
    req.end();
  });
}

/* ─── Member Functions ─── */
async function getMember(userId) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    return await guild.members.fetch(userId).catch(() => null);
  } catch { return null; }
}

async function getChannel(channelId) {
  try {
    return await client.channels.fetch(channelId).catch(() => null);
  } catch { return null; }
}

/* ─── Give Role ─── */
async function giveRole(userId, username) {
  if (!ROLE_ID) { 
    console.log(`⚠️ لم يتم تعيين الرتبة`); 
    return false; 
  }
  const member = await getMember(userId);
  if (!member) { 
    console.log(`⚠️ ${username} مش في السيرفر`); 
    return false; 
  }
  if (member.roles.cache.has(ROLE_ID)) { 
    console.log(`✅ ${username} - عنده الرتبة بالفعل`); 
    return true; 
  }
  
  try {
    await member.roles.add(ROLE_ID);
    console.log(`✅ رتبة أُعطيت لـ ${username}`);
    return true;
  } catch(e) {
    console.log(`⚠️ خطأ في إعطاء الرتبة: ${e.message}`);
    return false;
  }
}

/* ─── Send to Log Channel ─── */
async function sendEmbedToLogChannel(app, key) {
  if (!LOG_CHANNEL_ID) { 
    console.log(`⚠️ لم يتم تعيين روم السجل`); 
    return null; 
  }
  
  const channel = await getChannel(LOG_CHANNEL_ID);
  if (!channel) { 
    console.log(`⚠️ روم السجل غير موجود`); 
    return null; 
  }

  const embed = new EmbedBuilder()
    .setColor('#FFA500')
    .setTitle('📋 طلب تفعيل جديد')
    .setDescription(`يوجد طلب تفعيل جديد بانتظار المراجعة`)
    .addFields(
      { name: '👤 الاسم', value: app.globalName || app.username || 'Unknown', inline: true },
      { name: '🎮 المعرف', value: app.userId || 'Unknown', inline: true },
      { name: '📝 البريد', value: app.email || 'غير متوفر', inline: false },
      { name: '⏰ الوقت', value: new Date().toLocaleString('ar-SA'), inline: false }
    )
    .setFooter({ text: `معرف الطلب: ${key}` })
    .setTimestamp();

  const acceptButton = new ButtonBuilder()
    .setCustomId(`accept_${key}_${app.userId}`)
    .setLabel('✅ قبول')
    .setStyle(ButtonStyle.Success);

  const rejectButton = new ButtonBuilder()
    .setCustomId(`reject_${key}_${app.userId}`)
    .setLabel('❌ رفض')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(acceptButton, rejectButton);

  try {
    const message = await channel.send({ 
      embeds: [embed],
      components: [row]
    });
    
    // حفظ الربط
    buttonMap.set(message.id, { 
      userId: app.userId, 
      username: app.username,
      key: key 
    });
    
    console.log(`📤 Embed أُرسل لروم السجل - ${app.username}`);
    return message.id;
  } catch(e) { 
    console.log(`⚠️ خطأ في الإرسال: ${e.message}`); 
    return null;
  }
}

/* ─── Send DM ─── */
async function sendDM(userId, content) {
  const member = await getMember(userId);
  if (!member) return false;
  try {
    if (typeof content === 'string') {
      await member.send(content);
    } else {
      await member.send({ embeds: [content] });
    }
    return true;
  } catch(e) { 
    console.log(`⚠️ ما قدر يرسل: ${e.message}`); 
    return false;
  }
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
    const name = app.globalName || app.username || 'Unknown';

    if (firstRun) {
      lastStatus[key] = status;
      continue;
    }

    const prev = lastStatus[key];
    lastStatus[key] = status;

    /* طلب جديد */
    if (prev === undefined) {
      console.log(`🆕 طلب جديد (${status}): ${name}`);
      if (status === 'pending') {
        await sendEmbedToLogChannel(app, key);
      }
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
  },
  {
    name: 'set-log-channel',
    description: 'تعيين روم السجل (حيث يتم إرسال الطلبات)',
    options: [
      {
        name: 'channel',
        description: 'الروم المراد تعيينها',
        type: 7,
        required: true
      }
    ]
  },
  {
    name: 'stats',
    description: 'عرض إحصائيات الطلبات'
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
  try {
    /* Slash Commands */
    if (interaction.isCommand()) {
      const { commandName, options } = interaction;

      if (commandName === 'set-role') {
        const roleId = options.getRole('role').id;
        ROLE_ID = roleId;
        
        await interaction.reply({
          content: `✅ تم تعيين الرتبة: <@&${roleId}>`,
          ephemeral: true
        });
        console.log(`✅ رتبة: ${roleId}`);
      }

      if (commandName === 'set-guild') {
        const guildId = options.getString('guild_id');
        process.env.GUILD_ID = guildId;
        
        await interaction.reply({
          content: `✅ تم تعيين السيرفر: ${guildId}`,
          ephemeral: true
        });
      }

      if (commandName === 'set-log-channel') {
        const channelId = options.getChannel('channel').id;
        LOG_CHANNEL_ID = channelId;
        
        await interaction.reply({
          content: `✅ تم تعيين روم السجل: <#${channelId}>`,
          ephemeral: true
        });
        console.log(`✅ روم السجل: ${channelId}`);
      }

      if (commandName === 'stats') {
        const data = await fetchFirebase();
        if (!data) {
          await interaction.reply({
            content: '❌ خطأ في الاتصال بـ Firebase',
            ephemeral: true
          });
          return;
        }

        const entries = Object.values(data);
        const pending = entries.filter(e => e.status === 'pending').length;
        const accepted = entries.filter(e => e.status === 'accepted').length;
        const rejected = entries.filter(e => e.status === 'rejected').length;

        const statsEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('📊 إحصائيات الطلبات')
          .addFields(
            { name: '⏳ قيد الانتظار', value: `${pending}`, inline: true },
            { name: '✅ مقبول', value: `${accepted}`, inline: true },
            { name: '❌ مرفوض', value: `${rejected}`, inline: true },
            { name: '📈 الإجمالي', value: `${entries.length}`, inline: false }
          )
          .setTimestamp();

        await interaction.reply({
          embeds: [statsEmbed],
          ephemeral: true
        });
      }
    }

    /* Button Interactions */
    if (interaction.isButton()) {
      const customId = interaction.customId;
      const [action, key, userId] = customId.split('_');

      if (action === 'accept') {
        console.log(`✅ قبول من ${interaction.user.username} للمستخدم ${userId}`);
        
        // إعطاء الرتبة
        const member = await getMember(userId);
        if (ROLE_ID && member) {
          const roleGiven = await giveRole(userId, member.user.username);
          
          if (roleGiven) {
            // تحديث Firebase
            await updateFirebase(`/${key}`, { 
              status: 'accepted',
              acceptedBy: interaction.user.id,
              acceptedAt: new Date().toISOString()
            });

            // رسالة التأكيد للموظف
            await interaction.reply({
              content: `✅ تم قبول الطلب للمستخدم <@${userId}> وإعطاؤه الرتبة`,
              ephemeral: true
            });

            // رسالة للعضو
            const acceptEmbed = new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('🎉 تم قبول تقديمك!')
              .setDescription(`تم قبولك من قبل ${interaction.user.username}\nتوجه السيرفر لمعرفة مواعيد التفعيل`)
              .setTimestamp();
            
            await sendDM(userId, acceptEmbed);

            // تحديث الـ Embed الأصلي
            const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
              .setColor('#00FF00')
              .setTitle('✅ تم القبول')
              .addFields({ name: 'قبلها', value: `<@${interaction.user.id}>`, inline: false });
            
            await interaction.message.edit({ embeds: [newEmbed], components: [] });
          } else {
            await interaction.reply({
              content: `⚠️ خطأ في إعطاء الرتبة. تأكد من أن رتبة البوت أعلى`,
              ephemeral: true
            });
          }
        }
      }

      if (action === 'reject') {
        const modal = new ModalBuilder()
          .setCustomId(`reject_modal_${key}_${userId}`)
          .setTitle('سبب الرفض');

        const reasonInput = new TextInputBuilder()
          .setCustomId('reject_reason')
          .setLabel('اكتب سبب الرفض')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('مثال: البيانات غير مكتملة')
          .setRequired(true)
          .setMaxLength(500);

        const actionRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
      }
    }

    /* Modal Submit */
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('reject_modal_')) {
        const [_, key, userId] = interaction.customId.split('_');
        const reason = interaction.fields.getTextInputValue('reject_reason');

        console.log(`❌ رفض من ${interaction.user.username} - السبب: ${reason}`);

        // تحديث Firebase
        await updateFirebase(`/${key}`, { 
          status: 'rejected',
          rejectedBy: interaction.user.id,
          rejectReason: reason,
          rejectedAt: new Date().toISOString()
        });

        await interaction.reply({
          content: `❌ تم رفض الطلب للمستخدم <@${userId}>\n**السبب:** ${reason}`,
          ephemeral: true
        });

        // رسالة للعضو
        const rejectEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ تم رفض طلبك')
          .setDescription(`حاول مرة أخرى كمان 12 ساعة`)
          .addFields(
            { name: 'السبب', value: reason, inline: false }
          )
          .setTimestamp();
        
        await sendDM(userId, rejectEmbed);

        // تحديث الـ Embed الأصلي
        const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor('#FF0000')
          .setTitle('❌ تم الرفض')
          .addFields(
            { name: 'رفضها', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'السبب', value: reason, inline: false }
          );
        
        await interaction.message.edit({ embeds: [newEmbed], components: [] });
      }
    }
  } catch(e) {
    console.log(`❌ خطأ في معالجة interaction: ${e.message}`);
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
