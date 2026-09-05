const express = require('express');
const https = require('https');
const { storage } = require('../db/storage');
const { telegramAuthMiddleware } = require('../auth/telegramAuth');
const { getBot } = require('../bot/bot');
const { config } = require('../config');

const router = express.Router();

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

function streamAudioFromUrl(targetUrlStr, reqHeaders, res, maxRedirects = 3) {
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
        headers
      },
      (proxyRes) => {
        // Follow redirect internally if any
        if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
          return streamAudioFromUrl(proxyRes.headers.location, reqHeaders, res, maxRedirects - 1);
        }

        const resHeaders = {
          'Content-Type': proxyRes.headers['content-type'] || 'audio/mpeg',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable'
        };
        if (proxyRes.headers['content-length']) {
          resHeaders['Content-Length'] = proxyRes.headers['content-length'];
        }
        if (proxyRes.headers['content-range']) {
          resHeaders['Content-Range'] = proxyRes.headers['content-range'];
        }

        res.writeHead(proxyRes.statusCode, resHeaders);
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

  try {
    let href = streamLinkCache.get(fileId);
    if (!href) {
      const fileLink = await bot.telegram.getFileLink(fileId);
      href = fileLink.href;
      streamLinkCache.set(fileId, href);
      setTimeout(() => streamLinkCache.delete(fileId), 50 * 60 * 1000);
    }

    streamAudioFromUrl(href, req.headers, res);
  } catch (err) {
    console.error('[Stream Error]', err.message);
    if (!res.headersSent) {
      res.status(404).json({ error: 'Audio file not found or expired on Telegram server' });
    }
  }
});

module.exports = router;
