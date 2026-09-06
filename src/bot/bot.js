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
        try {
          await ctx.reply(replyText);
        } catch (_) {}
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

  // Helper to extract & download music from external links (YouTube, SoundCloud, Spotify)
  async function handleExternalMusicLink(ctx, text) {
    if (!text || typeof text !== 'string') return false;
    const urlMatch = text.match(/https?:\/\/[^\s]+/i);
    if (!urlMatch) return false;
    const url = urlMatch[0];

    const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(url);
    const isSoundCloud = /soundcloud\.com/i.test(url);
    const isSpotify = /open\.spotify\.com\/(?:track|album|playlist)/i.test(url);

    if (!isYouTube && !isSoundCloud && !isSpotify) {
      return false;
    }

    const platformName = isYouTube ? 'یوتیوب (YouTube)' : isSoundCloud ? 'ساندکلاد (SoundCloud)' : 'اسپاتیفای (Spotify)';
    const statusMsg = await ctx.reply(`🔍 در حال دریافت مشخصات اثر از ${platformName}... لطفاً چند لحظه صبر کنید.`);

    try {
      let trackTitle = 'موزیک آنلاین';
      let trackArtist = platformName;
      let trackCover = null;

      // 1. Spotify Link Handling
      if (isSpotify) {
        try {
          const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          if (oembedRes.ok) {
            const spData = await oembedRes.json();
            if (spData.title) trackTitle = spData.title;
            if (spData.thumbnail_url) trackCover = spData.thumbnail_url;
          }
        } catch (_) {}

        try {
          const pageRes = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          if (pageRes.ok) {
            const html = await pageRes.text();
            const descMatch = html.match(/property="og:description"\s+content="([^"]+)"/i);
            if (descMatch) {
              const parts = descMatch[1].split('·').map((s) => s.trim());
              if (parts.length > 0 && parts[0]) {
                trackArtist = parts[0];
              }
            }
            if (!trackTitle) {
              const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/i);
              if (ogTitle) trackTitle = ogTitle[1];
            }
          }
        } catch (_) {}

        try {
          await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
        } catch (_) {}

        const captionLines = [
          `🎧 *موزیک اسپاتیفای شناسایی شد!*\n`,
          `🎵 *عنوان:* ${trackTitle}`,
          `👤 *هنرمند:* ${trackArtist}\n`,
          `🔒 *توضیح فنی اسپاتیفای:* تمام فایل‌های صوتی اسپاتیفای دارای رمزنگاری انحصاری DRM (Widevine) هستند و امکان استخراج مستقیم لینک خام MP3 در وب بدون سرور اختصاصی وجود ندارد.\n`,
          `⚡️ *روش فوق‌سریع برای افزودن به صندوقچه:*`,
          `۱. دکمه زیر را لمس کرده و لینک را در ربات تلگرام اسپاتیفای ارسال کنید.`,
          `۲. فایل صوتی دریافت‌شده را برای همین بات *فوروارد (Forward)* کنید تا فوراً با کاور، متن و پلیر مینی‌اپ ذخیره شود!`
        ];

        const inlineButtons = [
          [
            {
              text: '📥 دانلود با @MusicsHuntersbot',
              url: 'https://t.me/MusicsHuntersbot'
            }
          ],
          [
            {
              text: '📥 دانلود با @SpotifySaveBot',
              url: 'https://t.me/SpotifySaveBot'
            }
          ],
          [
            {
              text: '🌐 باز کردن در اپلیکیشن اسپاتیفای',
              url: url
            }
          ]
        ];

        if (trackCover) {
          await ctx.replyWithPhoto(
            { url: trackCover },
            {
              caption: captionLines.join('\n'),
              parse_mode: 'Markdown',
              reply_markup: { inline_keyboard: inlineButtons }
            }
          );
        } else {
          await ctx.reply(captionLines.join('\n'), {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: inlineButtons }
          });
        }

        return true;
      }

      // 2. YouTube & SoundCloud metadata resolution
      if (isYouTube) {
        try {
          const ytRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
          if (ytRes.ok) {
            const ytData = await ytRes.json();
            if (ytData.title) trackTitle = ytData.title;
            if (ytData.author_name) trackArtist = ytData.author_name;
            if (ytData.thumbnail_url) trackCover = ytData.thumbnail_url;
          }
        } catch (_) {}
      } else if (isSoundCloud) {
        try {
          const scRes = await fetch(`https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`);
          if (scRes.ok) {
            const scData = await scRes.json();
            if (scData.title) trackTitle = scData.title;
            if (scData.author_name) trackArtist = scData.author_name;
            if (scData.thumbnail_url) trackCover = scData.thumbnail_url;
          }
        } catch (_) {}
      }

      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id);
      } catch (_) {}

      const captionLines = [
        `🎬 *اطلاعات فایل ${platformName}:*\n`,
        `🎵 *عنوان:* ${trackTitle}`,
        `👤 *هنرمند:* ${trackArtist}\n`,
        `💡 برای ذخیره پایدار در صندوقچه مینی‌اپ، کافیست فایل صوتی را از @MusicsHuntersbot یا کانال‌های موزیک به این چت *فوروارد (Forward)* نمایید.`
      ];

      const ytButtons = [
        [
          {
            text: '📥 دانلود با @MusicsHuntersbot',
            url: 'https://t.me/MusicsHuntersbot'
          }
        ],
        [
          {
            text: '🔍 جستجو در بات موزیک (@vkmusic_bot)',
            url: 'https://t.me/vkmusic_bot'
          }
        ],
        [
          {
            text: `🌐 باز کردن در ${platformName}`,
            url: url
          }
        ]
      ];

      if (trackCover) {
        await ctx.replyWithPhoto(
          { url: trackCover },
          {
            caption: captionLines.join('\n'),
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: ytButtons }
          }
        );
      } else {
        await ctx.reply(captionLines.join('\n'), {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: ytButtons }
        });
      }

      return true;
    } catch (err) {
      console.error('[External Link Error]', err.message);
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          undefined,
          `⚠️ خطا در پردازش لینک: ${err.message}\n💡 لطفاً فایل موزیک را مستقیماً یا به صورت فوروارد ارسال فرمایید.`
        );
      } catch (_) {}
      return true;
    }
  }

  // 1. Private Chat: audio, voice, document, external links, or text
  bot.on('message', async (ctx) => {
    if (!ctx.message) return;
    const handled = await processIncomingMedia(ctx, ctx.message);
    if (handled) return;

    if (ctx.chat?.type === 'private' && ctx.message.text && !ctx.message.text.startsWith('/')) {
      const linkHandled = await handleExternalMusicLink(ctx, ctx.message.text);
      if (linkHandled) return;

      const webAppUrl = getValidWebAppUrl();
      const buttons = [];
      if (webAppUrl) {
        buttons.push([Markup.button.webApp('🎵 باز کردن صندوقچه صوتی', webAppUrl)]);
      }
      buttons.push([Markup.button.url('📥 جستجو و دانلود در @MusicsHuntersbot', 'https://t.me/MusicsHuntersbot')]);

      await ctx.reply(
        '💡 برای افزودن موزیک به کتابخانه:\n\n۱. فایل صوتی یا وویس را مستقیماً بفرستید یا از ربات @MusicsHuntersbot فوروارد (Forward) کنید.\n۲. یا لینک آهنگ در اسپاتیفای، یوتیوب یا ساندکلاد را ارسال کنید.',
        Markup.inlineKeyboard(buttons)
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
