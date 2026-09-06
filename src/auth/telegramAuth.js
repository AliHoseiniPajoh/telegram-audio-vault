const crypto = require('crypto');
const { config } = require('../config');

/**
 * Validates Telegram WebApp initData cryptographic signature (HMAC-SHA256).
 * Ensures request genuinely originated from Telegram WebApp client.
 */
function verifyTelegramWebAppData(initDataString, botToken, maxAgeSeconds = 86400) {
  if (!initDataString || typeof initDataString !== 'string') {
    return { valid: false, reason: 'Empty or non-string initData provided' };
  }

  if (!botToken || typeof botToken !== 'string') {
    return { valid: false, reason: 'Bot token missing from server environment' };
  }

  try {
    const urlParams = new URLSearchParams(initDataString);
    const hash = urlParams.get('hash');

    if (!hash) {
      return { valid: false, reason: 'Missing hash parameter in initData' };
    }

    urlParams.delete('hash');

    // Build data_check_string with alphabetically sorted key=value pairs
    const pairs = [];
    for (const [key, val] of urlParams.entries()) {
      pairs.push(`${key}=${val}`);
    }
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    // Generate secret_key = HMAC_SHA256("WebAppData", botToken)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Calculate expected hash = HMAC_SHA256(secretKey, dataCheckString)
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return { valid: false, reason: 'Signature mismatch: hash does not match computed value' };
    }

    // Expiry check
    const authDateStr = urlParams.get('auth_date');
    const authDate = parseInt(authDateStr, 10);
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (!authDate || isNaN(authDate)) {
      return { valid: false, reason: 'Missing or malformed auth_date' };
    }

    if (nowSeconds - authDate > maxAgeSeconds) {
      return { valid: false, reason: `Authentication expired. Age: ${nowSeconds - authDate}s > ${maxAgeSeconds}s` };
    }

    let user = null;
    const userJson = urlParams.get('user');
    if (userJson) {
      user = JSON.parse(userJson);
    }

    return { valid: true, user, authDate };
  } catch (err) {
    return { valid: false, reason: `Verification exception: ${err.message}` };
  }
}

/**
 * Express Middleware:
 * Validates Telegram initData cryptographic signature.
 * Open to ALL valid Telegram users (no single-user blocking).
 */
function telegramAuthMiddleware(req, res, next) {
  // Allow bypassing in local dev testing if mock header sent
  if (config.nodeEnv === 'development' && req.headers['x-dev-mock-auth'] === 'owner') {
    req.telegramUser = { id: config.allowedUserId || 12345678, first_name: 'Dev User', username: 'dev_user' };
    req.isOwner = true;
    return next();
  }

  const initData = req.headers['x-telegram-init-data'] || req.query.initData;

  if (!initData) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing Telegram initData credentials'
    });
  }

  const verification = verifyTelegramWebAppData(initData, config.botToken);

  if (!verification.valid) {
    return res.status(403).json({
      error: 'Forbidden',
      message: `Invalid Telegram authentication: ${verification.reason}`
    });
  }

  // Attach verified user to request
  req.telegramUser = verification.user || { id: 0, first_name: 'User' };
  req.isOwner = config.allowedUserId
    ? String(req.telegramUser.id).trim() === String(config.allowedUserId).trim()
    : true;

  next();
}

module.exports = {
  verifyTelegramWebAppData,
  telegramAuthMiddleware
};
