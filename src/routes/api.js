const express = require('express');
const https = require('https');
const { storage } = require('../db/storage');
const { telegramAuthMiddleware } = require('../auth/telegramAuth');
const { getBot } = require('../bot/bot');
const { config } = require('../config');

const router = express.Router();

const httpsKeepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000
});

// Apply Telegram Auth & Whitelist to all API endpoints
router.use(telegramAuthMiddleware);

// --- User Profile & Health ---
router.get('/me', async (req, res) => {
  try {
    const tracks = await storage.getAllTracks();
    const playlists = await storage.getAllPlaylists();
    res.json({
      user: req.telegramUser,
      isOwner: true,
      totalTracks: tracks.length,
      totalPlaylists: playlists.length
    });
  } catch (err) {
    console.error('[API /me Error]', err.message);
    res.json({
      user: req.telegramUser,
      isOwner: true,
      totalTracks: 0,
      totalPlaylists: 0
    });
  }
});

// --- Track Routes ---

// List all tracks (supports ?q= query)
router.get('/tracks', async (req, res) => {
  try {
    const query = req.query.q || '';
    const tracks = await storage.getAllTracks(query);
    res.json({ tracks });

    // Background pre-warm links for top tracks to eliminate getFile lookup latency
    const bot = getBot();
    if (bot && Array.isArray(tracks)) {
      tracks.slice(0, 5).forEach((t) => {
        if (t.fileId && !streamLinkCache.has(t.fileId)) {
          bot.telegram
            .getFileLink(t.fileId)
            .then((link) => {
              streamLinkCache.set(t.fileId, link.href);
              setTimeout(() => streamLinkCache.delete(t.fileId), 50 * 60 * 1000);
            })
            .catch(() => {});
        }
      });
    }
  } catch (err) {
    console.error('[API /tracks Error]', err.message);
    res.json({ tracks: [] });
  }
});

// Get single track metadata
router.get('/tracks/:id', async (req, res) => {
  const track = await storage.getTrackById(req.params.id);
  if (!track) {
    return res.status(404).json({ error: 'Track not found' });
  }
  res.json({ track });
});

// --- Synced Lyrics Endpoint (via LRCLIB) ---
router.get('/lyrics', async (req, res) => {
  const { title, artist, duration } = req.query;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const cleanTitle = title.replace(/\(.*?\)|\[.*?\]|\b(320|128|remix|feat|ft)\b/gi, '').trim();
  const cleanArtist = (artist || '').replace(/\(.*?\)|\[.*?\]/gi, '').trim();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const params = new URLSearchParams({
      track_name: cleanTitle,
      artist_name: cleanArtist
    });
    if (duration && parseInt(duration, 10) > 0) {
      params.append('duration', parseInt(duration, 10).toString());
    }

    let lrcRes = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { 'User-Agent': 'TelegramAudioVault/1.0' },
      signal: controller.signal
    });

    let data = null;
    if (lrcRes.ok) {
      data = await lrcRes.json();
    } else {
      const searchRes = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle + ' ' + cleanArtist)}`,
        {
          headers: { 'User-Agent': 'TelegramAudioVault/1.0' },
          signal: controller.signal
        }
      );
      if (searchRes.ok) {
        const searchResults = await searchRes.json();
        if (Array.isArray(searchResults) && searchResults.length > 0) {
          data = searchResults[0];
        }
      }
    }
    clearTimeout(timeout);

    if (data && (data.syncedLyrics || data.plainLyrics)) {
      return res.json({
        syncedLyrics: data.syncedLyrics || null,
        plainLyrics: data.plainLyrics || null,
        trackName: data.trackName || cleanTitle,
        artistName: data.artistName || cleanArtist
      });
    }

    res.json({ syncedLyrics: null, plainLyrics: null });
  } catch (err) {
    console.warn('[Lyrics API Warning]', err.message);
    res.json({ syncedLyrics: null, plainLyrics: null });
  }
});

// --- High-Res Artwork Endpoint (via iTunes Search API) ---
router.get('/artwork', async (req, res) => {
  const { title, artist } = req.query;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const cleanTitle = title.replace(/\(.*?\)|\[.*?\]/gi, '').trim();
  const cleanArtist = (artist || '').replace(/\(.*?\)|\[.*?\]/gi, '').trim();
  const term = `${cleanTitle} ${cleanArtist}`.trim();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const itunesRes = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=1`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (itunesRes.ok) {
      const data = await itunesRes.json();
      if (data.results && data.results.length > 0 && data.results[0].artworkUrl100) {
        const highRes = data.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
        return res.json({ artworkUrl: highRes });
      }
    }
    res.json({ artworkUrl: null });
  } catch (err) {
    console.warn('[Artwork API Warning]', err.message);
    res.json({ artworkUrl: null });
  }
});

// Delete a track
router.delete('/tracks/:id', async (req, res) => {
  const success = await storage.deleteTrack(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Track not found' });
  }
  res.json({ success: true, message: 'Track deleted successfully' });
});

// --- Playlist Routes ---

// List all playlists
router.get('/playlists', async (req, res) => {
  const playlists = await storage.getAllPlaylists();
  res.json({ playlists });
});

// Get single playlist with tracks
router.get('/playlists/:id', async (req, res) => {
  const playlist = await storage.getPlaylistById(req.params.id);
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found' });
  }
  res.json({ playlist });
});

// Create a new playlist
router.post('/playlists', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Playlist name is required' });
  }

  try {
    const playlist = await storage.createPlaylist(name);
    res.status(201).json({ playlist });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a playlist
router.delete('/playlists/:id', async (req, res) => {
  try {
    const success = await storage.deletePlaylist(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add track to playlist
router.post('/playlists/:id/tracks', async (req, res) => {
  const { trackId } = req.body;
  if (!trackId) {
    return res.status(400).json({ error: 'trackId is required' });
  }

  try {
    const updated = await storage.addTrackToPlaylist(req.params.id, trackId);
    res.json({ success: true, playlist: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Remove track from playlist
router.delete('/playlists/:id/tracks/:trackId', async (req, res) => {
  try {
    const updated = await storage.removeTrackFromPlaylist(req.params.id, req.params.trackId);
    res.json({ success: true, playlist: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// In-memory cache for direct CDN links to eliminate Telegram API lookup latency
const streamLinkCache = new Map();

function streamAudioFromUrl(targetUrlStr, reqHeaders, res, maxRedirects = 3, onStatus = null) {
  if (maxRedirects <= 0) {
    if (!res.headersSent) res.status(502).json({ error: 'Too many redirects from Telegram' });
    return;
  }

  try {
    const targetUrl = new URL(targetUrlStr);
    const headers = {};
    if (reqHeaders.range) {
      headers['Range'] = reqHeaders.range;
    }

    const proxyReq = https.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || 443,
        path: targetUrl.pathname + targetUrl.search,
        method: 'GET',
        headers,
        agent: httpsKeepAliveAgent
      },
      (proxyRes) => {
        // Follow redirect internally if any
        if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
          return streamAudioFromUrl(proxyRes.headers.location, reqHeaders, res, maxRedirects - 1, onStatus);
        }

        // Notify caller if Telegram returned an error status (e.g. 404 expired link)
        if (onStatus && proxyRes.statusCode >= 400) {
          return onStatus(proxyRes.statusCode);
        }

        // If upstream handled Range (206) or client didn't request Range
        if (proxyRes.statusCode === 206 || !reqHeaders.range) {
          const resHeaders = {
            'Content-Type': proxyRes.headers['content-type'] || 'audio/mpeg',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable'
          };
          if (proxyRes.headers['content-length']) {
            resHeaders['Content-Length'] = proxyRes.headers['content-length'];
          }
          if (proxyRes.headers['content-range']) {
            resHeaders['Content-Range'] = proxyRes.headers['content-range'];
          }

          res.writeHead(proxyRes.statusCode, resHeaders);
          return proxyRes.pipe(res);
        }

        // Upstream returned 200, but client requested a byte range (e.g. bytes=0-1 or bytes=0-)
        const totalLength = parseInt(proxyRes.headers['content-length'], 10);
        const match = reqHeaders.range.match(/bytes=(\d+)-(\d*)/);
        if (match && !isNaN(totalLength)) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : totalLength - 1;
          const chunkSize = end - start + 1;

          res.writeHead(206, {
            'Content-Type': proxyRes.headers['content-type'] || 'audio/mpeg',
            'Content-Range': `bytes ${start}-${end}/${totalLength}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable'
          });

          if (start === 0 && end === totalLength - 1) {
            return proxyRes.pipe(res);
          }

          let bytesPassed = 0;
          proxyRes.on('data', (chunk) => {
            const prevBytes = bytesPassed;
            bytesPassed += chunk.length;
            if (bytesPassed <= start) return;

            let chunkStart = 0;
            if (prevBytes < start) {
              chunkStart = start - prevBytes;
            }
            let chunkEnd = chunk.length;
            if (bytesPassed > end + 1) {
              chunkEnd = chunk.length - (bytesPassed - (end + 1));
            }
            if (chunkStart < chunkEnd) {
              res.write(chunk.slice(chunkStart, chunkEnd));
            }
            if (bytesPassed >= end + 1) {
              proxyReq.destroy();
              res.end();
            }
          });

          proxyRes.on('end', () => {
            if (!res.writableEnded) res.end();
          });
          return;
        }

        // Fallback for any other case (always send Content-Length for progress calculation)
        const fallbackHeaders = {
          'Content-Type': proxyRes.headers['content-type'] || 'audio/mpeg',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable'
        };
        if (proxyRes.headers['content-length']) {
          fallbackHeaders['Content-Length'] = proxyRes.headers['content-length'];
        }
        res.writeHead(200, fallbackHeaders);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      console.error('[Stream Proxy Error]', err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Failed to stream audio file' });
      }
    });

    proxyReq.end();
  } catch (err) {
    console.error('[Stream URL Error]', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Invalid audio stream URL' });
    }
  }
}

// --- Audio Streaming Proxy ---
// Streams file from Telegram Bot API via Vercel server proxy to bypass Iranian ISP blocking of api.telegram.org
router.get('/stream/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const bot = getBot();

  if (!bot) {
    return res.status(503).json({ error: 'Telegram Bot is not initialized' });
  }

  // Pre-check if track is known and exceeds Telegram's 20MB bot limit
  const track = storage.getTrackByFileId(fileId);
  if (track && track.fileSize > 20 * 1024 * 1024) {
    return res.status(413).json({
      error: 'File Too Large',
      message: 'حجم این فایل بیشتر از ۲۰ مگابایت است (محدودیت وب تلگرام). لطفاً از دکمه «پخش در تلگرام» استفاده کنید.'
    });
  }

  try {
    let href = streamLinkCache.get(fileId);
    let fromCache = !!href;

    if (!href) {
      const fileLink = await bot.telegram.getFileLink(fileId);
      href = fileLink.href;
      streamLinkCache.set(fileId, href);
      setTimeout(() => streamLinkCache.delete(fileId), 50 * 60 * 1000);
    }

    streamAudioFromUrl(href, req.headers, res, 3, async (statusCode) => {
      // If Telegram returned an error status (like 404 expired link) and we used cache, retry with fresh link!
      if (fromCache) {
        console.warn(`[Stream] Cached link for ${fileId} failed (${statusCode}), retrying fresh link...`);
        streamLinkCache.delete(fileId);
        try {
          const freshLink = await bot.telegram.getFileLink(fileId);
          streamLinkCache.set(fileId, freshLink.href);
          setTimeout(() => streamLinkCache.delete(fileId), 50 * 60 * 1000);
          return streamAudioFromUrl(freshLink.href, req.headers, res, 3);
        } catch (freshErr) {
          console.error('[Stream Fresh Retry Failed]', freshErr.message);
        }
      }

      if (!res.headersSent) {
        res.status(statusCode).json({ error: 'Audio file stream error', status: statusCode });
      }
    });
  } catch (err) {
    console.error('[Stream Error]', err.message);
    streamLinkCache.delete(fileId);
    if (!res.headersSent) {
      if (err.message && (err.message.includes('file is too big') || err.message.includes('400'))) {
        return res.status(413).json({
          error: 'File Too Large',
          message: 'حجم این فایل بیشتر از ۲۰ مگابایت است (محدودیت دانلود وب تلگرام). لطفاً از دکمه «پخش در تلگرام» استفاده کنید.'
        });
      }
      res.status(404).json({
        error: 'Audio file not found or expired on Telegram server',
        message: 'فایل در سرور تلگرام یافت نشد یا منقضی شده است. می‌توانید از دکمه «پخش در تلگرام» استفاده کنید.',
        details: err.message
      });
    }
  }
});

// --- Instant Native Telegram Playback ---
// Sends the audio message directly to the owner's Telegram chat so it plays instantly from local cache with 0 downloads!
router.post('/tracks/:id/play-native', async (req, res) => {
  const { id } = req.params;
  const bot = getBot();

  if (!bot) {
    return res.status(503).json({ error: 'Telegram Bot is not initialized' });
  }

  try {
    const track = await storage.getTrackById(id);
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    const targetChatId = req.telegramUser?.id || config.allowedUserId;
    if (!targetChatId) {
      return res.status(400).json({ error: 'User ID unknown' });
    }

    await bot.telegram.sendAudio(targetChatId, track.fileId, {
      caption: `🎵 ${track.title} - ${track.performer}\n(پخش در پلیر اصلی تلگرام)`
    });

    res.json({ success: true, message: 'فایل صوتی به چت تلگرام شما ارسال شد.' });
  } catch (err) {
    console.error('[Play Native Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
