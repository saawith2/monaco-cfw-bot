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
let BOT_BANNER = 'https://via.placeholder.com/1920x1080?text=MONACO+CFW'; // رابط الصورة - غيّره

const buttonMap = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ]
});

http.createServer((req, res) => res.end('OK')).listen(process.env.PORT || 3000);

/* ─── Firebase ─── */
function fetchFirebase() {
  return new Promise(resolve => {
    https.get(FIREBASE_URL, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    }).on('error', e => { console.log('🔥 Firebase error:', e.message); resolve(null); });
  });
}

function updateFirebase(path, data) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'monacocfw-default-rtdb.firebaseio.com',
      port: 443,
      path: `/cfw_applications${path}.json`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }
    };

    const req = https.request(options, () => resolve(true));
    req.on('error', () => resolve(false));
    req.write(JSON.stringify(data));
    req.end();
  });
}

/* ─── Members ─── */
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

async function giveRole(userId, username) {
  if (!ROLE_ID) return false;
  const member = await getMember(userId);
  if (!member) return false;
  if (member.roles.cache.has(ROLE_ID)) return true;
  
  try {
    await member.roles.add(ROLE_ID);
    console.log(`✅ رتبة أُعطيت لـ ${username}`);
    return true;
  } catch(e) {
    console.log(`⚠️ خطأ: ${e.message}`);
    return false;
  }
}

/* ─── Send Embed to Log Channel ─── */
async function sendEmbedToLogChannel(app, key) {
  if (!LOG_CHANNEL_ID) return null;
  
  const channel = await getChannel(LOG_CHANNEL_ID);
  if (!channel) return null;

  const embed = new EmbedBuilder()
    .setColor('#FFA500')
    .setTitle('📋 طلب تفعيل جديد')
    .setDescription(`يوجد طلب تفعيل جديد بانتظار المراجعة`)
    .setThumbnail(BOT_BANNER) // صورة صغيرة
    .addFields(
      { name: '👤 الاسم', value: `${app.globalName || app.username || 'Unknown'}`, inline: true },
      { name: '🎮 المعرف', value: `\`${app.userId || 'Unknown'}\``, inline: true },
      { name: '📧 البريد', value: `${app.email || 'غير متوفر'}`, inline: false }
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
    
    buttonMap.set(message.id, { 
      userId: app.userId, 
      username: app.username,
      globalName: app.globalName,
      key: key 
    });
    
    console.log(`📤 Embed أُرسل - ${app.username}`);
    return message.id;
  } catch(e) { 
    console.log(`⚠️ خطأ: ${e.message}`); 
    return null;
  }
}

/* ─── Poll ─── */
const lastStatus = {};
let firstRun = true;

async function poll() {
  const data = await fetchFirebase();
  if (!data || typeof data !== 'object') return;

  for (const [key, app] of Object.entries(data)) {
    if (!app?.userId) continue;
    const status = app.status || 'pending';
    const name = app.globalName || app.username || 'Unknown';

    if (firstRun) {
      lastStatus[key] = status;
      continue;
    }

    const prev = lastStatus[key];
    lastStatus[key] = status;

    if (prev === undefined && status === 'pending') {
      console.log(`🆕 طلب جديد: ${name}`);
      await sendEmbedToLogChannel(app, key);
    }
  }

  if (firstRun) {
    firstRun = false;
    const count = Object.keys(data).length;
    console.log(`✅ جاهز — ${count} طلب موجود`);
  }
}

/* ─── Slash Commands ─── */
const commands = [
  {
    name: 'set-role',
    description: 'تعيين رتبة القبول',
    options: [{
      name: 'role',
      description: 'الرتبة',
      type: 8,
      required: true
    }]
  },
  {
    name: 'set-guild',
    description: 'تعيين السيرفر',
    options: [{
      name: 'guild_id',
      description: 'معرف السيرفر',
      type: 3,
      required: true
    }]
  },
  {
    name: 'set-log-channel',
    description: 'تعيين روم الإدارة',
    options: [{
      name: 'channel',
      description: 'الروم',
      type: 7,
      required: true
    }]
  },
  {
    name: 'نتائج',
    description: 'عرض حالة طلبك (خاص بك فقط)'
  },
  {
    name: 'stats',
    description: 'عرض الإحصائيات'
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
    console.log('❌ خطأ:', err.message);
  }
}

/* ─── Interaction Handler ─── */
client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isCommand()) {
      const { commandName, options, user } = interaction;

      if (commandName === 'set-role') {
        const roleId = options.getRole('role').id;
        ROLE_ID = roleId;
        await interaction.reply({
          content: `✅ تم تعيين الرتبة: <@&${roleId}>`,
          ephemeral: true
        });
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
      }

      if (commandName === 'نتائج') {
        const data = await fetchFirebase();
        let found = false;
        let status = 'غير موجود';

        if (data) {
          for (const [key, app] of Object.entries(data)) {
            if (app.userId === user.id) {
              status = app.status;
              found = true;
              break;
            }
          }
        }

        let embed;
        if (status === 'pending') {
          embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⏳ حالة طلبك')
            .setDescription('طلبك قيد المراجعة، يرجى الانتظار')
            .setThumbnail(BOT_BANNER);
        } else if (status === 'accepted') {
          embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ تم قبول طلبك!')
            .setDescription('تم قبول تقديمك\nتوجه السيرفر لمعرفة مواعيد التفعيل')
            .setThumbnail(BOT_BANNER);
        } else if (status === 'rejected') {
          embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ تم رفض طلبك')
            .setDescription('حاول مرة أخرى كمان 12 ساعة')
            .setThumbnail(BOT_BANNER);
        } else {
          embed = new EmbedBuilder()
            .setColor('#808080')
            .setTitle('❓ لا توجد نتائج')
            .setDescription('لم نجد طلب لك في النظام')
            .setThumbnail(BOT_BANNER);
        }

        await interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
      }

      if (commandName === 'stats') {
        const data = await fetchFirebase();
        if (!data) {
          await interaction.reply({
            content: '❌ خطأ في الاتصال',
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
          .setThumbnail(BOT_BANNER)
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

    if (interaction.isButton()) {
      const customId = interaction.customId;
      const [action, key, userId] = customId.split('_');

      if (action === 'accept') {
        const member = await getMember(userId);
        if (ROLE_ID && member) {
          const roleGiven = await giveRole(userId, member.user.username);
          
          if (roleGiven) {
            await updateFirebase(`/${key}`, { 
              status: 'accepted',
              acceptedBy: interaction.user.id,
              acceptedAt: new Date().toISOString()
            });

            // رسالة تأكيد للموظف
            const confirmEmbed = new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('✅ تم القبول بنجاح')
              .setDescription(`تم قبول <@${userId}> وإعطاؤه الرتبة`)
              .setThumbnail(BOT_BANNER);

            await interaction.reply({
              embeds: [confirmEmbed],
              ephemeral: true
            });

            // رسالة للعضو في الخاصة
            const acceptEmbed = new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('🎉 تم قبول تقديمك!')
              .setDescription(`مرحباً <@${userId}>!\n\nتم قبول طلبك من قبل ${interaction.user}\nتوجه السيرفر لمعرفة مواعيد التفعيل`)
              .setThumbnail(BOT_BANNER)
              .setTimestamp();
            
            try {
              await member.send({ embeds: [acceptEmbed] });
            } catch(e) {}

            // تحديث الـ Embed في الروم
            const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
              .setColor('#00FF00')
              .setTitle('✅ تم القبول')
              .addFields({ name: '✅ قبلها', value: `<@${interaction.user.id}>`, inline: false });
            
            await interaction.message.edit({ embeds: [newEmbed], components: [] });
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
          .setPlaceholder('مثال: البيانات غير صحيحة')
          .setRequired(true)
          .setMaxLength(500);

        const actionRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('reject_modal_')) {
        const [_, key, userId] = interaction.customId.split('_');
        const reason = interaction.fields.getTextInputValue('reject_reason');

        await updateFirebase(`/${key}`, { 
          status: 'rejected',
          rejectedBy: interaction.user.id,
          rejectReason: reason,
          rejectedAt: new Date().toISOString()
        });

        // رسالة تأكيد للموظف
        const confirmEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ تم الرفض بنجاح')
          .setDescription(`تم رفض <@${userId}>\n**السبب:** ${reason}`)
          .setThumbnail(BOT_BANNER);

        await interaction.reply({
          embeds: [confirmEmbed],
          ephemeral: true
        });

        // رسالة للعضو في الخاصة
        const rejectEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ تم رفض طلبك')
          .setDescription(`عزيزي <@${userId}>!\n\nلم نتمكن من قبول طلبك هذه المرة\nحاول مرة أخرى كمان 12 ساعة`)
          .addFields({
            name: '📝 السبب',
            value: reason,
            inline: false
          })
          .setThumbnail(BOT_BANNER)
          .setTimestamp();
        
        const member = await getMember(userId);
        if (member) {
          try {
            await member.send({ embeds: [rejectEmbed] });
          } catch(e) {}
        }

        // تحديث الـ Embed في الروم
        const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor('#FF0000')
          .setTitle('❌ تم الرفض')
          .addFields(
            { name: '❌ رفضها', value: `<@${interaction.user.id}>`, inline: false },
            { name: '📝 السبب', value: reason, inline: false }
          );
        
        await interaction.message.edit({ embeds: [newEmbed], components: [] });
      }
    }
  } catch(e) {
    console.log(`❌ خطأ: ${e.message}`);
  }
});

client.once('ready', () => {
  console.log(`🤖 ${client.user.tag} — شغّال`);
  registerCommands();
  poll();
  setInterval(poll, 8000);
});

client.login(BOT_TOKEN).catch(e => console.log('خطأ:', e.message));
