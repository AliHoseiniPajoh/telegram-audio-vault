const express = require('express');
const path = require('path');
const { config, validateConfig } = require('./src/config');
const { initBot } = require('./src/bot/bot');
const apiRoutes = require('./src/routes/api');

// Validate critical configurations
validateConfig();

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security & Caching Headers for Telegram Mini App
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'ALLOWALL'); // Allow Telegram WebView to embed
  next();
});

// Serve frontend static assets
app.use(express.static(config.publicDir));

// API Routes
app.use('/api', apiRoutes);

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(config.publicDir, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start HTTP Server
const server = app.listen(config.port, () => {
  console.log(`====================================================`);
  console.log(`🎧 Telegram Audio Vault (Private TMA Server) Running`);
  console.log(`📡 Local Port: ${config.port}`);
  console.log(`🌐 Mini App URL: ${config.webAppUrl}`);
  console.log(`🔒 Allowed Owner ID: ${config.allowedUserId || '(NOT SET YET)'}`);
  console.log(`====================================================`);
});

// Initialize Telegram Bot
const bot = initBot();
if (bot) {
  bot.launch()
    .then(() => {
      console.log('🤖 Telegram Bot polling started successfully.');
    })
    .catch((err) => {
      console.error('❌ Failed to launch Telegram Bot:', err.message);
    });
}

// Graceful Shutdown
function handleShutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  if (bot) {
    bot.stop(signal);
  }
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
}

process.once('SIGINT', () => handleShutdown('SIGINT'));
process.once('SIGTERM', () => handleShutdown('SIGTERM'));
