const crypto = require('crypto');
const { config } = require('../config');

/**
 * Validates Telegram Mini App initData according to official Telegram specs:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * @param {string} initData - Raw initData string from window.Telegram.WebApp.initData
 * @param {string} botToken - Telegram Bot Token
 * @param {number} maxAgeSeconds - Maximum allowed age in seconds (default: 86400 / 24 hours)
 * @returns {{ valid: boolean, user?: object, reason?: string }}
 */
function verifyTelegramWebAppData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || typeof initData !== 'string') {
    return { valid: false, reason: 'initData is missing or invalid' };
  }

  try {
    const searchParams = new URLSearchParams(initData);
    const hash = searchParams.get('hash');

    if (!hash) {
      return { valid: false, reason: 'Hash signature missing in initData' };
    }

    // 1. Sort all keys alphabetically except 'hash'
    const keys = [];
    for (const [key] of searchParams.entries()) {
      if (key !== 'hash') {
        keys.push(key);
      }
    }
    keys.sort();

    // 2. Build data_check_string: "key=value\nkey=value..."
    const dataCheckString = keys
      .map((key) => `${key}=${searchParams.get(key)}`)
      .join('\n');

    // 3. Secret key = HMAC_SHA256("WebAppData", botToken)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // 4. Calculate HMAC_SHA256(secretKey, dataCheckString)
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // 5. Constant-time comparison to prevent timing attacks
    const hashBuffer = Buffer.from(hash, 'hex');
    const calculatedBuffer = Buffer.from(calculatedHash, 'hex');

    if (hashBuffer.length !== calculatedBuffer.length || !crypto.timingSafeEqual(hashBuffer, calculatedBuffer)) {
      return { valid: false, reason: 'Cryptographic signature mismatch' };
    }

    // 6. Check auth_date expiration
    const authDate = parseInt(searchParams.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > maxAgeSeconds) {
      return { valid: false, reason: 'initData has expired' };
    }

    // 7. Parse user object
    const userJson = searchParams.get('user');
    let user = null;
    if (userJson) {
      user = JSON.parse(userJson);
    }

    return { valid: true, user, authDate };
  } catch (err) {
    return { valid: false, reason: `Verification exception: ${err.message}` };
  }
}

/**
 * Express Middleware to enforce strict single-user whitelist
 */
function telegramAuthMiddleware(req, res, next) {
  // Allow bypassing in local dev testing ONLY if explicitly configured with mock user
  if (config.nodeEnv === 'development' && req.headers['x-dev-mock-auth'] === 'owner') {
    req.telegramUser = { id: config.allowedUserId, first_name: 'Dev Owner', username: 'dev_owner' };
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

  // Strict User ID whitelist check
  const userId = verification.user ? String(verification.user.id) : null;

  if (!userId || userId !== config.allowedUserId) {
    console.warn(`[Security Alert] Access denied for unauthorized user ID: ${userId}. Allowed: ${config.allowedUserId}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access Denied: This personal audio vault is strictly private.'
    });
  }

  // Attach verified user to request
  req.telegramUser = verification.user;
  next();
}

module.exports = {
  verifyTelegramWebAppData,
  telegramAuthMiddleware
};
