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
app.post('/api/webhook', async (req, res) => {
  if (!bot) {
    return res.status(500).json({ error: 'Bot is not initialized' });
  }

  try {
    // Process incoming Telegram update in serverless context
    await bot.handleUpdate(req.body, res);
    if (!res.headersSent) {
      res.status(200).send('OK');
    }
  } catch (err) {
    console.error('[Webhook Error]', err);
    if (!res.headersSent) {
      res.status(500).send('Error');
    }
  }
});

// Helper endpoint to register webhook with Telegram Bot API with 1-click in browser
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
    res.send(`
      <div style="font-family: sans-serif; padding: 30px; text-align: center;">
        <h2 style="color: #2ea6ff;">✅ وب‌هوک تلگرام با موفقیت فعال شد!</h2>
        <p>آدرس وب‌هوک ثبت‌شده: <code>${webhookUrl}</code></p>
        <p>هم‌اکنون ربات در تلگرام آماده دریافت فایل و پیام صوتی است.</p>
        <a href="/" style="display: inline-block; padding: 10px 20px; background: #2ea6ff; color: #fff; text-decoration: none; border-radius: 8px; margin-top: 15px;">ورود به مینی‌اپ</a>
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
