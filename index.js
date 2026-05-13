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
let ADMIN_USERS = []; // قائمة المسؤولين

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

http.createServer((req, res) => res.end('OK')).listen(process.env.PORT || 3000);

/* ─── Check Admin ─── */
function isAdmin(userId) {
  return ADMIN_USERS.includes(userId);
}

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

/* ─── Get Channel ─── */
async function getChannel(channelId) {
  try {
    return await client.channels.fetch(channelId).catch(() => null);
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

/* ─── Build Questions Embed ─── */
function buildQuestionsEmbed(questions) {
  if (!questions || Object.keys(questions).length === 0) {
    return null;
  }

  let description = '**الأسئلة والإجابات:**\n\n';
  let questionCount = 0;

  for (const [key, question] of Object.entries(questions)) {
    if (question.question && question.answer) {
      questionCount++;
      description += `**${questionCount}. ${question.question}**\n`;
      description += `📝 الجواب: ${question.answer}\n\n`;
    }
  }

  if (questionCount === 0) {
    return null;
  }

  const embed = new EmbedBuilder()
    .setColor('#3498db')
    .setTitle('📚 الأسئلة والإجابات')
    .setDescription(description);

  return embed;
}

/* ─── Send Embed to Log Channel ─── */
async function sendEmbedToLogChannel(app) {
  if (!LOG_CHANNEL_ID) { 
    console.log(`⚠️ لم يتم تعيين روم السجل`); 
    return; 
  }
  
  const channel = await getChannel(LOG_CHANNEL_ID);
  if (!channel) { 
    console.log(`⚠️ روم السجل غير موجود`); 
    return; 
  }

  const mainEmbed = new EmbedBuilder()
    .setColor('#FFA500')
    .setTitle('📋 طلب تفعيل جديد')
    .setDescription(`يوجد طلب تفعيل جديد بانتظار المراجعة`)
    .addFields(
      { name: '👤 الاسم', value: app.globalName || app.username || 'Unknown', inline: true },
      { name: '🎮 المعرف', value: app.userId || 'Unknown', inline: true },
      { name: '📝 البريد الإلكتروني', value: app.email || 'غير متوفر', inline: false },
      { name: '⏰ الوقت', value: new Date().toLocaleString('ar-SA'), inline: false }
    )
    .setTimestamp();

  const embeds = [mainEmbed];
  
  if (app.questions) {
    const questionsEmbed = buildQuestionsEmbed(app.questions);
    if (questionsEmbed) {
      embeds.push(questionsEmbed);
    }
  }

  const acceptButton = new ButtonBuilder()
    .setCustomId(`accept_${app.userId}`)
    .setLabel('✅ قبول')
    .setStyle(ButtonStyle.Success);

  const rejectButton = new ButtonBuilder()
    .setCustomId(`reject_${app.userId}`)
    .setLabel('❌ رفض')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(acceptButton, rejectButton);

  try {
    const message = await channel.send({ 
      embeds: embeds,
      components: [row]
    });
    console.log(`📤 Embed أُرسل لروم السجل - ${app.username}`);
    return message.id;
  } catch(e) { 
    console.log(`⚠️ خطأ في الإرسال: ${e.message}`); 
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
    const name   = app.globalName || app.username || 'Unknown';

    if (firstRun) {
      lastStatus[key] = status;
      if (status === 'accepted') await giveRole(app.userId, name);
      continue;
    }

    const prev = lastStatus[key];
    lastStatus[key] = status;

    if (prev === undefined) {
      console.log(`🆕 طلب جديد (${status}): ${name}`);
      
      if (status === 'pending') {
        await sendEmbedToLogChannel(app);
      }
      continue;
    }

    if (prev === status) continue;
    console.log(`🔄 تغيّر: ${name} — ${prev} → ${status}`);

    if (status === 'accepted') {
      await giveRole(app.userId, name);
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🎉 تم قبول تقديمك!')
        .setDescription(`تم قبولك توجه السيرفر لمعرفة مواعيد التفعيل`)
        .addFields(
          { name: 'الحالة', value: '✅ مقبول', inline: false }
        )
        .setTimestamp();
      
      const member = await getMember(app.userId);
      if (member) {
        try {
          await member.send({ embeds: [embed] });
        } catch(e) {}
      }
    } else if (status === 'rejected') {
      const reason = app.rejectReason || 'لم يتم تحديد سبب';
      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ تم رفض طلبك')
        .setDescription(`حاول مرة أخرى كمان 12 ساعة`)
        .addFields(
          { name: 'السبب', value: reason, inline: false },
          { name: 'الحالة', value: '❌ مرفوض', inline: false }
        )
        .setTimestamp();
      
      const member = await getMember(app.userId);
      if (member) {
        try {
          await member.send({ embeds: [embed] });
        } catch(e) {}
      }
    }
  }

  if (firstRun) {
    firstRun = false;
    console.log(`✅ جاهز — ${entries.length} طلب موجود، يراقب التغييرات كل 8 ثواني`);
  }
}

/* ─── Get Statistics ─── */
async function getStatistics() {
  const data = await fetchFirebase();
  if (!data || typeof data !== 'object') {
    return { pending: 0, accepted: 0, rejected: 0, total: 0 };
  }

  let pending = 0, accepted = 0, rejected = 0;

  for (const app of Object.values(data)) {
    if (!app?.userId) continue;
    const status = app.status || 'pending';
    
    if (status === 'pending') pending++;
    else if (status === 'accepted') accepted++;
    else if (status === 'rejected') rejected++;
  }

  return {
    pending,
    accepted,
    rejected,
    total: pending + accepted + rejected
  };
}

/* ─── Slash Commands ─── */
const commands = [
  {
    name: 'admin',
    description: 'إضافة أو حذف مسؤول',
    options: [
      {
        name: 'action',
        description: 'إضافة أو حذف',
        type: 3,
        required: true,
        choices: [
          { name: 'إضافة', value: 'add' },
          { name: 'حذف', value: 'remove' }
        ]
      },
      {
        name: 'user',
        description: 'المستخدم',
        type: 9,
        required: true
      }
    ]
  },
  {
    name: 'نتائج',
    description: 'عرض إحصائيات الطلبات'
  },
  {
    name: 'set-role',
    description: 'تعيين رتبة القبول (أدمن فقط)',
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
    description: 'تعيين السيرفر (أدمن فقط)',
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
    description: 'تعيين روم السجل (أدمن فقط)',
    options: [
      {
        name: 'channel',
        description: 'الروم المراد تعيينها',
        type: 7,
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
  if (interaction.isCommand()) {
    const { commandName, options, user } = interaction;

    /* ─── Admin Command ─── */
    if (commandName === 'admin') {
      // فقط مالك السيرفر يقدر يضيف admins
      if (interaction.guild.ownerId !== user.id) {
        return await interaction.reply({
          content: '❌ فقط مالك السيرفر يقدر يستخدم هذا الأمر',
          ephemeral: true
        });
      }

      const action = options.getString('action');
      const targetUser = options.getUser('user');
      const targetId = targetUser.id;

      if (action === 'add') {
        if (ADMIN_USERS.includes(targetId)) {
          return await interaction.reply({
            content: `⚠️ ${targetUser.username} بالفعل مسؤول`,
            ephemeral: true
          });
        }
        ADMIN_USERS.push(targetId);
        await interaction.reply({
          content: `✅ تم إضافة ${targetUser.username} كمسؤول`,
          ephemeral: true
        });
        console.log(`✅ مسؤول جديد: ${targetUser.username}`);
      } else if (action === 'remove') {
        const index = ADMIN_USERS.indexOf(targetId);
        if (index === -1) {
          return await interaction.reply({
            content: `⚠️ ${targetUser.username} ليس مسؤول`,
            ephemeral: true
          });
        }
        ADMIN_USERS.splice(index, 1);
        await interaction.reply({
          content: `✅ تم حذف ${targetUser.username} من المسؤولين`,
          ephemeral: true
        });
        console.log(`❌ حذف مسؤول: ${targetUser.username}`);
      }
    }

    /* ─── Results Command ─── */
    if (commandName === 'نتائج') {
      if (!isAdmin(user.id)) {
        return await interaction.reply({
          content: '❌ أنت لا تملك صلاحية استخدام هذا الأمر',
          ephemeral: true
        });
      }

      const stats = await getStatistics();
      
      const embed = new EmbedBuilder()
        .setColor('#5865f2')
        .setTitle('📊 إحصائيات الطلبات')
        .addFields(
          { name: '⏳ قيد الانتظار', value: `${stats.pending}`, inline: true },
          { name: '✅ مقبول', value: `${stats.accepted}`, inline: true },
          { name: '❌ مرفوض', value: `${stats.rejected}`, inline: true },
          { name: '📈 الإجمالي', value: `${stats.total}`, inline: false }
        )
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
      console.log(`📊 عرض الإحصائيات من ${user.username}`);
    }

    /* ─── Set Role ─── */
    if (commandName === 'set-role') {
      if (!isAdmin(user.id)) {
        return await interaction.reply({
          content: '❌ أنت لا تملك صلاحية استخدام هذا الأمر',
          ephemeral: true
        });
      }

      const roleId = options.getRole('role').id;
      ROLE_ID = roleId;
      
      await interaction.reply({
        content: `✅ تم تعيين الرتبة: <@&${roleId}>`,
        ephemeral: true
      });
      console.log(`✅ رتبة تم تعيينها: ${roleId}`);
    }

    /* ─── Set Guild ─── */
    if (commandName === 'set-guild') {
      if (!isAdmin(user.id)) {
        return await interaction.reply({
          content: '❌ أنت لا تملك صلاحية استخدام هذا الأمر',
          ephemeral: true
        });
      }

      const guildId = options.getString('guild_id');
      process.env.GUILD_ID = guildId;
      
      await interaction.reply({
        content: `✅ تم تعيين السيرفر: ${guildId}`,
        ephemeral: true
      });
      console.log(`✅ سيرفر تم تعيينه: ${guildId}`);
    }

    /* ─── Set Log Channel ─── */
    if (commandName === 'set-log-channel') {
      if (!isAdmin(user.id)) {
        return await interaction.reply({
          content: '❌ أنت لا تملك صلاحية استخدام هذا الأمر',
          ephemeral: true
        });
      }

      const channelId = options.getChannel('channel').id;
      LOG_CHANNEL_ID = channelId;
      
      await interaction.reply({
        content: `✅ تم تعيين روم السجل: <#${channelId}>`,
        ephemeral: true
      });
      console.log(`✅ روم السجل تم تعيينها: ${channelId}`);
    }
  }

  /* ─── Button Interactions ─── */
  if (interaction.isButton()) {
    const customId = interaction.customId;
    const userId = customId.split('_')[1];

    if (customId.startsWith('accept_')) {
      console.log(`✅ قبول من ${interaction.user.username} للمستخدم ${userId}`);
      
      await interaction.reply({
        content: `✅ تم قبول الطلب للمستخدم <@${userId}>`,
        ephemeral: true
      });

      const member = await getMember(userId);
      if (ROLE_ID && member) {
        await member.roles.add(ROLE_ID);
        console.log(`✅ رتبة أُعطيت لـ ${member.user.username}`);
      }

      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🎉 تم قبول تقديمك!')
        .setDescription(`تم قبولك من قبل ${interaction.user.username}\nتوجه السيرفر لمعرفة مواعيد التفعيل`)
        .setTimestamp();
      
      if (member) {
        try {
          await member.send({ embeds: [embed] });
        } catch(e) {}
      }

      const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('#00FF00')
        .setTitle('✅ تم القبول')
        .addFields({ name: 'قبلها', value: `<@${interaction.user.id}>`, inline: false });
      
      await interaction.message.edit({ embeds: [newEmbed], components: [] });
    }

    if (customId.startsWith('reject_')) {
      const modal = new ModalBuilder()
        .setCustomId(`reject_modal_${userId}`)
        .setTitle('سبب الرفض');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reject_reason')
        .setLabel('اكتب سبب الرفض')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('مثال: البيانات غير مكتملة')
        .setRequired(true);

      const actionRow = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    }
  }

  /* ─── Modal Submit ─── */
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('reject_modal_')) {
      const userId = interaction.customId.split('_')[2];
      const reason = interaction.fields.getTextInputValue('reject_reason');

      console.log(`❌ رفض من ${interaction.user.username} للمستخدم ${userId} - السبب: ${reason}`);

      await interaction.reply({
        content: `❌ تم رفض الطلب للمستخدم <@${userId}>\n**السبب:** ${reason}`,
        ephemeral: true
      });

      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ تم رفض طلبك')
        .setDescription(`حاول مرة أخرى كمان 12 ساعة`)
        .addFields(
          { name: 'السبب', value: reason, inline: false }
        )
        .setTimestamp();
      
      const member = await getMember(userId);
      if (member) {
        try {
          await member.send({ embeds: [embed] });
        } catch(e) {}
      }

      const originalMessage = await interaction.channel.messages.fetch(
        interaction.message.id
      ).catch(() => null);

      if (originalMessage) {
        const newEmbed = EmbedBuilder.from(originalMessage.embeds[0])
          .setColor('#FF0000')
          .setTitle('❌ تم الرفض')
          .addFields(
            { name: 'رفضها', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'السبب', value: reason, inline: false }
          );
        
        await originalMessage.edit({ embeds: [newEmbed], components: [] });
      }
    }
  }
});

client.once('ready', () => {
  console.log(`🤖 ${client.user.tag} — شغّال`);
  registerCommands();
  poll();
  setInterval(poll, 8000);
});

client.login(BOT_TOKEN).catch(e => console.log('خطأ:', e.message));
