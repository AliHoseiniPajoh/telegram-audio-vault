const express = require('express');
const path = require('path');
const { config, validateConfig } = require('../src/config');
const { initBot, getBot } = require('../src/bot/bot');
const apiRoutes = require('../src/routes/api');

validateConfig();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security & Caching Headers for Telegram Mini App
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  next();
});

// Initialize Telegraf Bot instance
const bot = initBot();

// --- Vercel Telegram Webhook Handler ---
// IMPORTANT: Do not pass 'res' to bot.handleUpdate so Telegraf uses direct Telegram Bot API calls
app.post('/api/webhook', async (req, res) => {
  if (!bot) {
    console.warn('[Webhook] Bot is not initialized');
    return res.status(200).send('Bot not ready');
  }

  try {
    if (req.body && typeof req.body === 'object') {
      await bot.handleUpdate(req.body);
    }
  } catch (err) {
    console.error('[Webhook Handle Error]', err.message);
  }

  // Always respond 200 OK to Telegram so Telegram does not retry
  if (!res.headersSent) {
    res.status(200).send('OK');
  }
});

app.get('/api/webhook', (req, res) => {
  res.send('✅ Webhook endpoint is active and listening for Telegram POST requests.');
});

// Helper endpoint to register/verify webhook with Telegram Bot API
app.get('/api/setup-webhook', async (req, res) => {
  if (!bot) {
    return res.status(500).send('BOT_TOKEN is not set in environment variables');
  }

  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const currentDomain = `${proto}://${host}`;
    const webhookUrl = `${currentDomain}/api/webhook`;

    await bot.telegram.setWebhook(webhookUrl);
    const info = await bot.telegram.getWebhookInfo();

    res.send(`
      <div style="font-family: sans-serif; padding: 30px; text-align: center; direction: rtl; line-height: 1.8;">
        <h2 style="color: #2ea6ff;">✅ وب‌هوک تلگرام با موفقیت فعال شد!</h2>
        <p><b>آدرس ثبت‌شده:</b> <code style="direction: ltr; display: inline-block;">${webhookUrl}</code></p>
        <p><b>وضعیت اتصال تلگرام:</b> <span style="color: green;">آماده و متصل (pending updates: ${info.pending_update_count})</span></p>
        <div style="margin-top: 20px;">
          <a href="/" style="display: inline-block; padding: 10px 20px; background: #2ea6ff; color: #fff; text-decoration: none; border-radius: 8px;">ورود به مینی‌اپ</a>
        </div>
      </div>
    `);
  } catch (err) {
    res.status(500).send(`❌ خطا در تنظیم وب‌هوک: ${err.message}`);
  }
});

// Mount Main API Routes
app.use('/api', apiRoutes);

// Export for Vercel Serverless
module.exports = app;
