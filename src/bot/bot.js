const { Telegraf, Markup } = require('telegraf');
const { config } = require('../config');
const { storage } = require('../db/storage');

let bot = null;

function initBot() {
  if (!config.botToken) {
    console.warn('[Bot] Bot token is not set. Bot will not start until BOT_TOKEN is configured in .env');
    return null;
  }

  bot = new Telegraf(config.botToken);

  // Security Middleware: Strictly enforce single allowed user ID
  bot.use(async (ctx, next) => {
    const senderId = ctx.from ? String(ctx.from.id) : null;

    if (!senderId || senderId !== config.allowedUserId) {
      console.warn(`[Bot Security] Unauthorized interaction attempt by user ID: ${senderId} (@${ctx.from?.username || 'no_user'})`);
      try {
        await ctx.reply('⛔ دسترسی غیرمجاز: این ربات کاملاً شخصی و خصوصی است.');
      } catch (_) {}
      return; // Stop processing
    }

    return next();
  });

  // /start command
  bot.command('start', async (ctx) => {
    const welcomeText = 
`🎧 *صندوقچه صوتی شخصی شما آماده است!*

برای افزودن ترَک، هر فایل صوتی (MP3, M4A, FLAC) یا پیام صوتی (Voice) را به این چت بفرستید یا فوروارد کنید.

جهت پخش و مدیریت پلی‌لیست‌ها، روی دکمه زیر کلیک کنید:`;

    await ctx.replyWithMarkdown(
      welcomeText,
      Markup.inlineKeyboard([
        [Markup.button.webApp('🎵 باز کردن پلیر و کتابخانه', config.webAppUrl)]
      ])
    );
  });

  // Handle incoming audio files
  bot.on('audio', async (ctx) => {
    try {
      const audio = ctx.message.audio;
      const track = storage.addTrack({
        fileId: audio.file_id,
        fileUniqueId: audio.file_unique_id,
        title: audio.title || audio.file_name || 'فایل صوتی',
        performer: audio.performer || 'Unknown Artist',
        duration: audio.duration || 0,
        mimeType: audio.mime_type || 'audio/mpeg',
        fileSize: audio.file_size || 0,
        fileName: audio.file_name || 'audio.mp3',
        type: 'audio'
      });

      console.log(`[Bot] Audio added: "${track.title}" (${track.duration}s)`);

      await ctx.reply(
        `✅ ترک صوتی به کتابخانه شخصی اضافه شد:\n🎵 *${escapeMarkdown(track.title)}*\n👤 ${escapeMarkdown(track.performer)}`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '▶️ پخش در مینی‌اپ', web_app: { url: config.webAppUrl } }]
            ]
          }
        }
      );
    } catch (err) {
      console.error('[Bot Error] Failed to process audio:', err);
      await ctx.reply('❌ خطا در ذخیره فایل صوتی.');
    }
  });

  // Handle incoming voice messages
  bot.on('voice', async (ctx) => {
    try {
      const voice = ctx.message.voice;
      const dateStr = new Date().toLocaleString('fa-IR');
      const track = storage.addTrack({
        fileId: voice.file_id,
        fileUniqueId: voice.file_unique_id,
        title: `پیام صوتی (${dateStr})`,
        performer: ctx.from.first_name || 'Voice Note',
        duration: voice.duration || 0,
        mimeType: voice.mime_type || 'audio/ogg',
        fileSize: voice.file_size || 0,
        fileName: `voice_${Date.now()}.ogg`,
        type: 'voice'
      });

      console.log(`[Bot] Voice message added: ID ${track.id} (${track.duration}s)`);

      await ctx.reply(
        `🎙 پیام صوتی به کتابخانه شخصی اضافه شد.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '▶️ باز کردن پلیر', web_app: { url: config.webAppUrl } }]
            ]
          }
        }
      );
    } catch (err) {
      console.error('[Bot Error] Failed to process voice:', err);
      await ctx.reply('❌ خطا در ذخیره پیام صوتی.');
    }
  });

  return bot;
}

function escapeMarkdown(text = '') {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

module.exports = {
  initBot,
  getBot: () => bot
};
