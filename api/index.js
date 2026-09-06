const express = require('express');
const path = require('path');
const { config, validateConfig } = require('../src/config');
const { initBot, getBot } = require('../src/bot/bot');
const apiRoutes = require('../src/routes/api');

validateConfig();

const app = express();

// Guard express.json to prevent hanging if Vercel serverless pre-parsed req.body
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    return next();
  }
  express.json()(req, res, next);
});
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
    console.warn('[Webhook] Bot is not initialized');
    return res.status(200).send('Bot not ready');
  }

  try {
    if (req.body && typeof req.body === 'object') {
      // Race against an 8s timeout to guarantee a 200 OK reaches Telegram before Vercel kills the container
      await Promise.race([
        bot.handleUpdate(req.body),
        new Promise((resolve) => setTimeout(resolve, 8000))
      ]);
    }
  } catch (err) {
    console.error('[Webhook Handle Error]', err.message);
  }

  // Always respond 200 OK to Telegram so Telegram never queues or retries
  if (!res.headersSent) {
    res.status(200).send('OK');
  }
});

app.get('/api/webhook', (req, res) => {
  res.send('✅ Webhook endpoint is active and listening for Telegram POST requests.');
});

// Diagnostic & Webhook Registration Dashboard
app.get('/api/setup-webhook', async (req, res) => {
  if (!bot) {
    return res.status(500).send('BOT_TOKEN is not set in environment variables');
  }

  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const currentDomain = `${proto}://${host}`;
    const webhookUrl = `${currentDomain}/api/webhook`;

    // Drop pending stale updates to prevent backlog congestion
    await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: true });
    const info = await bot.telegram.getWebhookInfo();

    const allowedId = config.allowedUserId || 'تنظیم نشده (توصیه: در Vercel ثبت شود)';
    const lastError = info.last_error_message 
      ? `<span style="color: #ff4958;">${info.last_error_message} (${info.last_error_date ? new Date(info.last_error_date * 1000).toLocaleString('fa-IR') : ''})</span>`
      : '<span style="color: #10b981;">بدون خطا</span>';

    res.send(`
      <!DOCTYPE html>
      <html dir="rtl" lang="fa">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>وضعیت وب‌هوک و اتصال بات</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; margin: 0; line-height: 1.6; }
          .card { max-width: 520px; margin: 20px auto; background: #1e293b; border-radius: 16px; padding: 24px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); border: 1px solid #334155; }
          h2 { color: #38bdf8; margin-top: 0; font-size: 20px; text-align: center; }
          .status-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #334155; font-size: 14px; }
          .status-row:last-child { border-bottom: none; }
          .label { color: #94a3b8; }
          .val { font-weight: 600; text-align: left; direction: ltr; }
          .btn { display: block; width: 100%; box-sizing: border-box; text-align: center; padding: 14px; background: #38bdf8; color: #0f172a; font-weight: 700; text-decoration: none; border-radius: 12px; margin-top: 20px; transition: opacity 0.2s; }
          .btn:active { opacity: 0.8; }
          code { background: #0f172a; padding: 2px 6px; border-radius: 6px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>✅ وب‌هوک تلگرام فعال و آماده شد!</h2>
          <div class="status-row">
            <span class="label">آدرس وب‌هوک:</span>
            <span class="val"><code>${webhookUrl}</code></span>
          </div>
          <div class="status-row">
            <span class="label">وضعیت اتصال به تلگرام:</span>
            <span class="val" style="color: #10b981;">متصل (Live)</span>
          </div>
          <div class="status-row">
            <span class="label">پیام‌های معلق (Pending):</span>
            <span class="val">${info.pending_update_count} عدد</span>
          </div>
          <div class="status-row">
            <span class="label">آخرین خطای وب‌هوک:</span>
            <span class="val">${lastError}</span>
          </div>
          <div class="status-row">
            <span class="label">شناسه مجاز مالک (ALLOWED_USER_ID):</span>
            <span class="val"><code>${allowedId}</code></span>
          </div>
          <a href="/" class="btn">🎵 ورود به مینی‌اپ</a>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`❌ خطا در تنظیم وب‌هوک: ${err.message}`);
  }
});

// Mount Main API Routes
app.use('/api', apiRoutes);

// Export for Vercel Serverless
module.exports = app;
