const path = require('path');
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch (_) {}

const config = {
  botToken: process.env.BOT_TOKEN || '',
  allowedUserId: process.env.ALLOWED_USER_ID ? String(process.env.ALLOWED_USER_ID).trim() : '',
  port: parseInt(process.env.PORT || '3000', 10),
  webAppUrl: process.env.WEBAPP_URL || `http://localhost:${process.env.PORT || 3000}`,
  nodeEnv: process.env.NODE_ENV || 'development',
  dataDir: path.resolve(__dirname, '../data'),
  publicDir: path.resolve(__dirname, '../public')
};

// Validate critical configurations
function validateConfig() {
  const missing = [];
  if (!config.botToken) missing.push('BOT_TOKEN');
  if (!config.allowedUserId) missing.push('ALLOWED_USER_ID');
  
  if (missing.length > 0) {
    console.warn(`[Config Warning] Missing required environment variables: ${missing.join(', ')}`);
    console.warn('Please copy .env.example to .env and fill in your Telegram Bot credentials.');
  }
}

module.exports = {
  config,
  validateConfig
};
