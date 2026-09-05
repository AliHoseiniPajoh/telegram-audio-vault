const { Telegraf, Markup } = require('telegraf');
const { config } = require('../config');
const { storage } = require('../db/storage');

let bot = null;
const verifiedChannelIds = new Set();

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
      const senderId = ctx.from ? String(ctx.from.id) : null;
      if (!senderId || senderId !== config.allowedUserId) {
        console.warn(`[Bot Security] Unauthorized interaction by user: ${senderId} (@${ctx.from?.username || 'no_user'})`);
        try {
          await ctx.reply('⛔ دسترسی غیرمجاز: این ربات کاملاً شخصی و خصوصی است.');
        } catch (_) {}
        return;
      }
      return next();
    }

    // 2. Channel Posts (when bot is added as admin to owner's channel)
    if (ctx.chat?.type === 'channel') {
      const chatId = ctx.chat.id;

      // Check cache first
      if (verifiedChannelIds.has(chatId)) {
        return next();
      }

      // Verify that the owner is an administrator of this channel
      try {
        const admins = await ctx.telegram.getChatAdministrators(chatId);
        const isOwnerAdmin = admins.some((admin) => String(admin.user.id) === config.allowedUserId);

        if (isOwnerAdmin) {
          verifiedChannelIds.add(chatId);
          console.log(`[Bot Security] Verified channel "${ctx.chat.title}" (${chatId}) for owner.`);
          return next();
        } else {
          console.warn(`[Bot Security] Channel ${chatId} ignored: Owner is not an admin.`);
          return;
        }
      } catch (err) {
        console.warn(`[Bot Security] Could not verify channel admins for ${chatId}:`, err.message);
        // If Telegram restrictions prevent listing admins, accept if bot was added as admin
        verifiedChannelIds.add(chatId);
        return next();
      }
    }

    return next();
  });

  // /start command in private chat
  bot.command('start', async (ctx) => {
    const welcomeText = 
`🎧 *صندوقچه صوتی شخصی شما آماده است!*

برای افزودن ترَک، هر فایل صوتی (MP3, M4A, FLAC) یا پیام صوتی (Voice) را به این چت بفرستید یا فوروارد کنید.

*نکته کانال‌ها:*
اگر این ربات را در کانال خود ادمین کنید، هر موزیکی که در کانال پست شود، به صورت خودکار به مینی‌اپ و پلی‌لیست اختصاصی آن کانال اضافه خواهد شد.`;

    await ctx.replyWithMarkdown(
      welcomeText,
      Markup.inlineKeyboard([
        [Markup.button.webApp('🎵 باز کردن پلیر و کتابخانه', config.webAppUrl)]
      ])
    );
  });

  // Unified Media Processor for Audio, Voice, and Audio-Documents
  async function processIncomingMedia(ctx, message, sourceChannelTitle = null) {
    const media = extractAudioMetadata(message);
    if (!media) return false;

    // Determine target playlist
    let targetPlaylist = null;
    if (sourceChannelTitle) {
      targetPlaylist = storage.getOrCreatePlaylistByName(sourceChannelTitle);
    } else if (message.forward_from_chat?.title) {
      targetPlaylist = storage.getOrCreatePlaylistByName(message.forward_from_chat.title);
    } else if (message.forward_origin?.chat?.title) {
      targetPlaylist = storage.getOrCreatePlaylistByName(message.forward_origin.chat.title);
    }

    const playlistId = targetPlaylist ? targetPlaylist.id : null;
    const track = storage.addTrack(media, playlistId);

    console.log(`[Bot Media] Added "${track.title}" | Playlist: ${targetPlaylist ? targetPlaylist.name : 'Favorites'}`);

    // If in private chat, send confirmation response
    if (ctx.chat?.type === 'private') {
      const plName = targetPlaylist ? targetPlaylist.name : 'Favorites';
      const replyText = 
`✅ <b>موزیک دریافت شد و به کتابخانه اضافه شد.</b>

🎵 <b>عنوان:</b> ${escapeHtml(track.title)}
👤 <b>هنرمند:</b> ${escapeHtml(track.performer)}
📂 <b>پلی‌لیست:</b> ${escapeHtml(plName)}`;

      try {
        await ctx.reply(replyText, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '▶️ باز کردن در مینی‌اپ', web_app: { url: config.webAppUrl } }]
            ]
          }
        });
      } catch (err) {
        console.error('[Bot Reply Error]', err.message);
        // Plain text fallback
        await ctx.reply(`✅ موزیک دریافت شد و به کتابخانه اضافه شد:\n${track.title}`);
      }
    } else if (ctx.chat?.type === 'channel' && config.allowedUserId) {
      // In channel post, notify owner privately in their bot chat
      try {
        await ctx.telegram.sendMessage(
          config.allowedUserId,
          `📥 <b>موزیک جدید از کانال دریافت شد و به کتابخانه اضافه شد.</b>\n\n📢 <b>کانال:</b> ${escapeHtml(sourceChannelTitle || 'کانال')}\n🎵 <b>عنوان:</b> ${escapeHtml(track.title)}\n👤 <b>هنرمند:</b> ${escapeHtml(track.performer)}`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '▶️ باز کردن در مینی‌اپ', web_app: { url: config.webAppUrl } }]
              ]
            }
          }
        );
      } catch (_) {}
    }

    return true;
  }

  // 1. Private Chat: audio, voice, document
  bot.on('message', async (ctx) => {
    if (!ctx.message) return;
    const handled = await processIncomingMedia(ctx, ctx.message);
    if (!handled && ctx.chat?.type === 'private' && !ctx.message.text?.startsWith('/')) {
      await ctx.reply(
        '💡 برای افزودن موزیک به کتابخانه، لطفاً یک فایل صوتی (MP3, M4A, FLAC, ...) یا وویس ارسال یا فوروارد کنید.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎵 باز کردن مینی‌اپ', web_app: { url: config.webAppUrl } }]
            ]
          }
        }
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

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeMarkdown(text = '') {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

module.exports = {
  initBot,
  getBot: () => bot
};
