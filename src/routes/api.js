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
router.get('/me', (req, res) => {
  res.json({
    user: req.telegramUser,
    isOwner: true,
    totalTracks: storage.getAllTracks().length,
    totalPlaylists: storage.getAllPlaylists().length
  });
});

// --- Track Routes ---

// List all tracks (supports ?q= query)
router.get('/tracks', (req, res) => {
  const query = req.query.q || '';
  const tracks = storage.getAllTracks(query);
  res.json({ tracks });
});

// Get single track metadata
router.get('/tracks/:id', (req, res) => {
  const track = storage.getTrackById(req.params.id);
  if (!track) {
    return res.status(404).json({ error: 'Track not found' });
  }
  res.json({ track });
});

// Delete a track
router.delete('/tracks/:id', (req, res) => {
  const success = storage.deleteTrack(req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Track not found' });
  }
  res.json({ success: true, message: 'Track deleted successfully' });
});

// --- Playlist Routes ---

// List all playlists
router.get('/playlists', (req, res) => {
  const playlists = storage.getAllPlaylists();
  res.json({ playlists });
});

// Get single playlist with tracks
router.get('/playlists/:id', (req, res) => {
  const playlist = storage.getPlaylistById(req.params.id);
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found' });
  }
  res.json({ playlist });
});

// Create a new playlist
router.post('/playlists', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Playlist name is required' });
  }

  try {
    const playlist = storage.createPlaylist(name);
    res.status(201).json({ playlist });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a playlist
router.delete('/playlists/:id', (req, res) => {
  try {
    const success = storage.deletePlaylist(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add track to playlist
router.post('/playlists/:id/tracks', (req, res) => {
  const { trackId } = req.body;
  if (!trackId) {
    return res.status(400).json({ error: 'trackId is required' });
  }

  try {
    const updated = storage.addTrackToPlaylist(req.params.id, trackId);
    res.json({ success: true, playlist: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Remove track from playlist
router.delete('/playlists/:id/tracks/:trackId', (req, res) => {
  try {
    const updated = storage.removeTrackFromPlaylist(req.params.id, req.params.trackId);
    res.json({ success: true, playlist: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Audio Streaming Proxy ---
// Streams file from Telegram Bot API securely without exposing bot token
router.get('/stream/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const bot = getBot();

  if (!bot) {
    return res.status(503).json({ error: 'Telegram Bot is not initialized' });
  }

  try {
    // 1. Get direct Telegram file download link
    const fileLink = await bot.telegram.getFileLink(fileId);
    const targetUrl = new URL(fileLink.href);

    // 2. Prepare headers, forwarding client Range header if present
    const headers = {};
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const options = {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || 443,
      path: targetUrl.pathname + targetUrl.search,
      method: 'GET',
      headers
    };

    // 3. Pipe stream to client
    const proxyReq = https.request(options, (proxyRes) => {
      // Forward status code (200 OK or 206 Partial Content)
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'audio/mpeg',
        'Content-Length': proxyRes.headers['content-length'],
        'Content-Range': proxyRes.headers['content-range'],
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600'
      });

      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('[Stream Error] Proxy error:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Failed to stream audio file from Telegram' });
      }
    });

    proxyReq.end();
  } catch (err) {
    console.error('[Stream Error] Could not retrieve file link:', err.message);
    res.status(404).json({ error: 'Audio file not found or expired on Telegram server' });
  }
});

module.exports = router;
