const fs = require('fs');
const path = require('path');
const { config } = require('../config');

// In Vercel serverless environment, /tmp is the only writable directory
const storageDir = process.env.VERCEL ? '/tmp' : config.dataDir;
const DB_FILE = path.join(storageDir, 'vault.json');

/**
 * Safely extracts ONLY HTTPS REST API endpoints for Upstash / Vercel KV.
 * Supports all common Vercel Upstash integration prefixes: STORAGE_REDIS_, STORAGE_REST_, UPSTASH_REDIS_, KV_
 */
function getRestEndpoint() {
  const pairs = [
    { url: process.env.STORAGE_REDIS_REST_URL, token: process.env.STORAGE_REDIS_REST_TOKEN },
    { url: process.env.STORAGE_REST_API_URL, token: process.env.STORAGE_REST_API_TOKEN },
    { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN },
    { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN }
  ];

  for (const pair of pairs) {
    if (
      pair.url &&
      typeof pair.url === 'string' &&
      pair.url.trim().startsWith('https://') &&
      pair.token &&
      typeof pair.token === 'string' &&
      pair.token.trim().length > 0
    ) {
      return {
        url: pair.url.trim().replace(/\/+$/, ''),
        token: pair.token.trim()
      };
    }
  }
  return null;
}

const defaultState = {
  tracks: [],
  playlists: [
    {
      id: 'pl_favorites',
      name: 'Favorites',
      isDefault: true,
      trackIds: [],
      createdAt: new Date().toISOString()
    }
  ],
  version: 1
};

class Storage {
  constructor() {
    this.ensureDataDir();
    this.data = this.loadLocal();
    this.lastSync = 0;
  }

  ensureDataDir() {
    try {
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
    } catch (_) {}
  }

  loadLocal() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const content = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.tracks)) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('[Storage] Local read error:', err.message);
    }
    this.saveLocal(defaultState);
    return JSON.parse(JSON.stringify(defaultState));
  }

  saveLocal(dataToSave = this.data) {
    try {
      this.ensureDataDir();
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(dataToSave, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('[Storage] Local save error:', err.message);
    }
  }

  // Cloud Sync with Upstash REST API
  async syncFromKV() {
    const kv = getRestEndpoint();
    if (!kv) return;

    // Cache sync for 1.5s to prevent hammering
    const now = Date.now();
    if (now - this.lastSync < 1500) {
      return;
    }
    this.lastSync = now;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(kv.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kv.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['GET', 'telegram_audio_vault_data']),
        signal: controller.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json();
        if (json && json.result !== undefined && json.result !== null) {
          const parsed = typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
          if (parsed && Array.isArray(parsed.tracks)) {
            this.data = parsed;
            this.saveLocal(this.data);
          }
        }
      }
    } catch (err) {
      console.warn('[Storage] Cloud sync skipped (using local):', err.message);
    }
  }

  async syncToKV() {
    const kv = getRestEndpoint();
    if (!kv) return;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);

      await fetch(kv.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kv.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['SET', 'telegram_audio_vault_data', JSON.stringify(this.data)]),
        signal: controller.signal
      });
      clearTimeout(timer);
    } catch (err) {
      console.warn('[Storage] Cloud push skipped:', err.message);
    }
  }

  async save(dataToSave = this.data) {
    this.saveLocal(dataToSave);
    await this.syncToKV();
  }

  // --- Track Methods ---

  async getAllTracks(query = '') {
    await this.syncFromKV();

    let tracks = [...(this.data.tracks || [])];
    if (query && typeof query === 'string') {
      const q = query.toLowerCase().trim();
      tracks = tracks.filter(
        (t) =>
          (t.title && t.title.toLowerCase().includes(q)) ||
          (t.performer && t.performer.toLowerCase().includes(q)) ||
          (t.fileName && t.fileName.toLowerCase().includes(q))
      );
    }
    return tracks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async getTrackById(id) {
    await this.syncFromKV();
    return (this.data.tracks || []).find((t) => t.id === id) || null;
  }

  getTrackByFileUniqueId(fileUniqueId) {
    return (this.data.tracks || []).find((t) => t.fileUniqueId === fileUniqueId) || null;
  }

  getOrCreatePlaylistByName(name) {
    if (!name || typeof name !== 'string') return (this.data.playlists || [])[0] || null;
    const cleanName = name.trim();
    const existing = (this.data.playlists || []).find(
      (p) => p.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (existing) return existing;
    return this.createPlaylist(cleanName);
  }

  async addTrack(metadata, playlistId = null) {
    await this.syncFromKV();

    const existing = this.getTrackByFileUniqueId(metadata.fileUniqueId);
    if (existing) {
      existing.fileId = metadata.fileId;
      existing.updatedAt = new Date().toISOString();
      if (playlistId) {
        const pl = (this.data.playlists || []).find((p) => p.id === playlistId);
        if (pl && !pl.trackIds.includes(existing.id)) {
          pl.trackIds.push(existing.id);
        }
      }
      await this.save();
      return existing;
    }

    const newTrack = {
      id: `trk_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      fileId: metadata.fileId,
      fileUniqueId: metadata.fileUniqueId || null,
      title: metadata.title || metadata.fileName || 'Untitled Audio',
      performer: metadata.performer || 'Unknown Artist',
      duration: parseInt(metadata.duration || 0, 10),
      mimeType: metadata.mimeType || 'audio/mpeg',
      fileSize: metadata.fileSize || 0,
      fileName: metadata.fileName || '',
      type: metadata.type || 'audio',
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(this.data.tracks)) {
      this.data.tracks = [];
    }
    this.data.tracks.push(newTrack);

    if (!Array.isArray(this.data.playlists) || this.data.playlists.length === 0) {
      this.data.playlists = [
        {
          id: 'pl_favorites',
          name: 'Favorites',
          isDefault: true,
          trackIds: [],
          createdAt: new Date().toISOString()
        }
      ];
    }

    if (playlistId) {
      const pl = this.data.playlists.find((p) => p.id === playlistId);
      if (pl && !pl.trackIds.includes(newTrack.id)) {
        pl.trackIds.push(newTrack.id);
      }
    } else {
      const defaultPl = this.data.playlists[0];
      if (defaultPl && !defaultPl.trackIds.includes(newTrack.id)) {
        defaultPl.trackIds.push(newTrack.id);
      }
    }

    await this.save();
    return newTrack;
  }

  async deleteTrack(id) {
    await this.syncFromKV();

    const initialCount = (this.data.tracks || []).length;
    this.data.tracks = (this.data.tracks || []).filter((t) => t.id !== id);

    if (this.data.tracks.length === initialCount) {
      return false;
    }

    (this.data.playlists || []).forEach((pl) => {
      pl.trackIds = (pl.trackIds || []).filter((tid) => tid !== id);
    });

    await this.save();
    return true;
  }

  // --- Playlist Methods ---

  async getAllPlaylists() {
    await this.syncFromKV();
    return (this.data.playlists || []).map((pl) => ({
      ...pl,
      trackCount: (pl.trackIds || []).length
    }));
  }

  async getPlaylistById(id) {
    await this.syncFromKV();
    const pl = (this.data.playlists || []).find((p) => p.id === id);
    if (!pl) return null;

    const tracks = (pl.trackIds || [])
      .map((tid) => (this.data.tracks || []).find((t) => t.id === tid))
      .filter(Boolean);

    return {
      ...pl,
      tracks
    };
  }

  async createPlaylist(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Playlist name is required');
    }

    const newPlaylist = {
      id: `pl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: name.trim(),
      isDefault: false,
      trackIds: [],
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(this.data.playlists)) {
      this.data.playlists = [];
    }
    this.data.playlists.push(newPlaylist);
    await this.save();
    return newPlaylist;
  }

  async deletePlaylist(id) {
    const pl = (this.data.playlists || []).find((p) => p.id === id);
    if (!pl) return false;
    if (pl.isDefault) {
      throw new Error('Cannot delete default playlist');
    }

    this.data.playlists = (this.data.playlists || []).filter((p) => p.id !== id);
    await this.save();
    return true;
  }

  async addTrackToPlaylist(playlistId, trackId) {
    await this.syncFromKV();
    const pl = (this.data.playlists || []).find((p) => p.id === playlistId);
    if (!pl) throw new Error('Playlist not found');

    const track = (this.data.tracks || []).find((t) => t.id === trackId);
    if (!track) throw new Error('Track not found');

    if (!pl.trackIds.includes(trackId)) {
      pl.trackIds.push(trackId);
      await this.save();
    }
    return pl;
  }

  async removeTrackFromPlaylist(playlistId, trackId) {
    await this.syncFromKV();
    const pl = (this.data.playlists || []).find((p) => p.id === playlistId);
    if (!pl) throw new Error('Playlist not found');

    pl.trackIds = (pl.trackIds || []).filter((tid) => tid !== trackId);
    await this.save();
    return pl;
  }
}

const storage = new Storage();

module.exports = { storage };
