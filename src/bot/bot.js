const { Telegraf, Markup } = require('telegraf');
const { config } = require('../config');
const { storage } = require('../db/storage');

let bot = null;
const verifiedChannelIds = new Set();

/**
 * Returns a guaranteed valid HTTPS WebApp URL for Telegram buttons
 */
function getValidWebAppUrl() {
  let url = config.webAppUrl;
  if (!url || !url.startsWith('https://')) {
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      url = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    } else if (process.env.VERCEL_URL) {
      url = `https://${process.env.VERCEL_URL}`;
    }
  }
  if (url && typeof url === 'string' && url.startsWith('https://')) {
    return url.replace(/\/+$/, '');
  }
  return null;
}

function initBot() {
  if (!config.botToken) {
    console.warn('[Bot] Bot token is not set. Bot will not start until BOT_TOKEN is configured.');
    return null;
  }

  bot = new Telegraf(config.botToken);

  // Security Middleware: Handle both Private Chat and Channel Posts
  bot.use(async (ctx, next) => {
    // 1. Private Chat Interactions
    if (ctx.chat?.type === 'private') {
      const senderId = ctx.from ? String(ctx.from.id).trim() : null;
      const allowedId = config.allowedUserId ? String(config.allowedUserId).trim().replace(/['"]/g, '') : null;

      if (allowedId && senderId !== allowedId) {
        console.warn(`[Bot Security] Blocked user: ${senderId} (Expected: ${allowedId})`);
        try {
          await ctx.reply(`⛔ دسترسی غیرمجاز: این ربات کاملاً شخصی و اختصاصی است.\n\nشناسه تلگرام شما: ${senderId}\nشناسه مجاز در سیستم: ${allowedId}`);
        } catch (_) {}
        return;
      }
      return next();
    }

    // 2. Channel Posts (when bot is added as admin to owner's channel)
    if (ctx.chat?.type === 'channel') {
      const chatId = ctx.chat.id;

      if (verifiedChannelIds.has(chatId)) {
        return next();
      }

      try {
        const admins = await ctx.telegram.getChatAdministrators(chatId);
        const isOwnerAdmin = admins.some((admin) => String(admin.user.id).trim() === String(config.allowedUserId).trim());

        if (isOwnerAdmin) {
          verifiedChannelIds.add(chatId);
          console.log(`[Bot Security] Verified channel "${ctx.chat.title}" for owner.`);
          return next();
        } else {
          console.warn(`[Bot Security] Channel ${chatId} ignored: Owner is not an admin.`);
          return;
        }
      } catch (err) {
        verifiedChannelIds.add(chatId);
        return next();
      }
    }

    return next();
  });

  // /start command: Immediate friendly welcome message with Mini App button
  bot.command('start', async (ctx) => {
    const webAppUrl = getValidWebAppUrl();
    const welcomeText = 
`🎧 سلام! به صندوقچه صوتی شخصی خوش آمدید.

برای افزودن هر فایل یا پیام صوتی، کافیست آن را به این چت بفرستید یا فوروارد کنید تا در کتابخانه شخصی شما ذخیره شود.

همچنین با ارسال این ربات به کانال تلگرامی‌تان و ادمین کردن آن، موزیک‌های کانال نیز خودکار به مینی‌اپ اضافه می‌شوند.`;

    try {
      const buttons = [];
      if (webAppUrl) {
        buttons.push([Markup.button.webApp('🎵 باز کردن صندوقچه صوتی', webAppUrl)]);
      }

      await ctx.reply(welcomeText, buttons.length > 0 ? Markup.inlineKeyboard(buttons) : undefined);
    } catch (err) {
      console.error('[Start Error]', err.message);
      await ctx.reply(welcomeText);
    }
  });

  // Unified Media Processor for Audio, Voice, and Audio-Documents
  async function processIncomingMedia(ctx, message, sourceChannelTitle = null) {
    const media = extractAudioMetadata(message);
    if (!media) return false;

    // Determine target playlist name from source channel or forward headers
    let targetPlaylistName = null;
    if (sourceChannelTitle) {
      targetPlaylistName = sourceChannelTitle;
    } else if (message.forward_from_chat?.title) {
      targetPlaylistName = message.forward_from_chat.title;
    } else if (message.forward_origin?.chat?.title) {
      targetPlaylistName = message.forward_origin.chat.title;
    }

    const track = await storage.addTrack(media, targetPlaylistName);

    console.log(`[Bot Media] Saved "${track.title}" | Playlist: ${targetPlaylistName || 'Favorites'}`);

    // If in private chat, send confirmation response
    if (ctx.chat?.type === 'private') {
      const plName = targetPlaylistName || 'Favorites';
      const webAppUrl = getValidWebAppUrl();
      const replyText = 
`✅ موزیک دریافت شد و به کتابخانه اضافه شد.

🎵 عنوان: ${track.title}
👤 هنرمند: ${track.performer}
📂 پلی‌لیست: ${plName}`;

      try {
        const extra = { disable_notification: true };
        if (webAppUrl) {
          extra.reply_markup = {
            inline_keyboard: [[Markup.button.webApp('▶️ باز کردن در مینی‌اپ', webAppUrl)]]
          };
        }
        await ctx.reply(replyText, extra);
      } catch (err) {
        console.error('[Reply Error]', err.message);
      }
    } else if (ctx.chat?.type === 'channel' && config.allowedUserId) {
      // In channel post, notify owner privately in their bot chat
      try {
        const webAppUrl = getValidWebAppUrl();
        const notifyText = 
`📥 موزیک جدید از کانال دریافت شد و به کتابخانه اضافه شد.

📢 کانال: ${sourceChannelTitle || 'کانال'}
🎵 عنوان: ${track.title}
👤 هنرمند: ${track.performer}`;

        const extra = { disable_notification: true };
        if (webAppUrl) {
          extra.reply_markup = {
            inline_keyboard: [[Markup.button.webApp('▶️ باز کردن در مینی‌اپ', webAppUrl)]]
          };
        }

        await ctx.telegram.sendMessage(
          config.allowedUserId,
          notifyText,
          extra
        );
      } catch (_) {}
    }

    return true;
  }

  // 1. Private Chat: audio, voice, document, or text
  bot.on('message', async (ctx) => {
    if (!ctx.message) return;
    const handled = await processIncomingMedia(ctx, ctx.message);
    if (!handled && ctx.chat?.type === 'private' && !ctx.message.text?.startsWith('/')) {
      const webAppUrl = getValidWebAppUrl();
      const buttons = [];
      if (webAppUrl) {
        buttons.push([Markup.button.webApp('🎵 باز کردن مینی‌اپ', webAppUrl)]);
      }

      await ctx.reply(
        '💡 برای افزودن موزیک به کتابخانه، لطفاً یک فایل صوتی (MP3, M4A, FLAC, ...) یا وویس ارسال یا فوروارد کنید.',
        buttons.length > 0 ? Markup.inlineKeyboard(buttons) : undefined
      );
    }
  });

  // 2. Channel Posts: automatically capture new music posted in the channel
  bot.on('channel_post', async (ctx) => {
    if (!ctx.channelPost) return;
    const channelTitle = ctx.chat?.title || 'کانال تلگرام';
    await processIncomingMedia(ctx, ctx.channelPost, channelTitle);
  });

  return bot;
}

/**
 * Extracts normalized audio metadata from audio, voice, or audio-document messages
 */
function extractAudioMetadata(msg) {
  if (!msg) return null;

  // 1. Native Telegram Audio
  if (msg.audio) {
    const a = msg.audio;
    return {
      fileId: a.file_id,
      fileUniqueId: a.file_unique_id,
      title: a.title || a.file_name || 'فایل صوتی',
      performer: a.performer || 'Unknown Artist',
      duration: a.duration || 0,
      mimeType: a.mime_type || 'audio/mpeg',
      fileSize: a.file_size || 0,
      fileName: a.file_name || 'audio.mp3',
      type: 'audio'
    };
  }

  // 2. Voice Note
  if (msg.voice) {
    const v = msg.voice;
    const dateStr = new Date().toLocaleString('fa-IR');
    return {
      fileId: v.file_id,
      fileUniqueId: v.file_unique_id,
      title: `پیام صوتی (${dateStr})`,
      performer: msg.from?.first_name || 'Voice Note',
      duration: v.duration || 0,
      mimeType: v.mime_type || 'audio/ogg',
      fileSize: v.file_size || 0,
      fileName: `voice_${Date.now()}.ogg`,
      type: 'voice'
    };
  }

  // 3. Document (MP3/M4A/FLAC/WAV sent as file)
  if (msg.document) {
    const d = msg.document;
    const isAudioMime = d.mime_type && d.mime_type.startsWith('audio/');
    const isAudioExt = /\.(mp3|m4a|flac|wav|ogg|aac|opus)$/i.test(d.file_name || '');

    if (isAudioMime || isAudioExt) {
      const cleanTitle = (d.file_name || 'فایل صوتی').replace(/\.[^/.]+$/, '');
      return {
        fileId: d.file_id,
        fileUniqueId: d.file_unique_id,
        title: cleanTitle,
        performer: 'فایل صوتی',
        duration: 0,
        mimeType: d.mime_type || 'audio/mpeg',
        fileSize: d.file_size || 0,
        fileName: d.file_name || 'audio.mp3',
        type: 'audio'
      };
    }
  }

  return null;
}

module.exports = {
  initBot,
  getBot: () => bot
};
