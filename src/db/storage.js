const fs = require('fs');
const path = require('path');
const { config } = require('../config');

// In Vercel serverless environment, the root directory is read-only; /tmp is the only writable directory
const storageDir = process.env.VERCEL ? '/tmp' : config.dataDir;
const DB_FILE = path.join(storageDir, 'vault.json');

// Upstash / Vercel KV environment variables (if configured in Vercel Storage)
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

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
    // Async load from cloud KV if available
    if (KV_URL && KV_TOKEN) {
      this.syncFromKV();
    }
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
        return JSON.parse(content);
      }
    } catch (err) {
      console.error('[Storage Error] Failed to read database:', err.message);
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
      console.error('[Storage Error] Local save error:', err.message);
    }
  }

  // Upstash KV Cloud Synchronization (Optional, if added in Vercel)
  async syncFromKV() {
    if (!KV_URL || !KV_TOKEN) return;
    try {
      const res = await fetch(`${KV_URL}/get/telegram_audio_vault_data`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const json = await res.json();
      if (json && json.result) {
        this.data = typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
        this.saveLocal(this.data);
      }
    } catch (err) {
      console.warn('[KV Error] Could not sync from cloud KV:', err.message);
    }
  }

  async syncToKV() {
    if (!KV_URL || !KV_TOKEN) return;
    try {
      await fetch(`${KV_URL}/set/telegram_audio_vault_data`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        body: JSON.stringify(this.data)
      });
    } catch (err) {
      console.warn('[KV Error] Could not push to cloud KV:', err.message);
    }
  }

  save(dataToSave = this.data) {
    this.saveLocal(dataToSave);
    if (KV_URL && KV_TOKEN) {
      this.syncToKV().catch(() => {});
    }
  }

  // --- Track Methods ---

  getAllTracks(query = '') {
    let tracks = [...this.data.tracks];
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

  getTrackById(id) {
    return this.data.tracks.find((t) => t.id === id) || null;
  }

  getTrackByFileUniqueId(fileUniqueId) {
    return this.data.tracks.find((t) => t.fileUniqueId === fileUniqueId) || null;
  }

  addTrack(metadata) {
    const existing = this.getTrackByFileUniqueId(metadata.fileUniqueId);
    if (existing) {
      existing.fileId = metadata.fileId;
      existing.updatedAt = new Date().toISOString();
      this.save();
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

    this.data.tracks.push(newTrack);
    this.save();
    return newTrack;
  }

  deleteTrack(id) {
    const initialCount = this.data.tracks.length;
    this.data.tracks = this.data.tracks.filter((t) => t.id !== id);

    if (this.data.tracks.length === initialCount) {
      return false;
    }

    this.data.playlists.forEach((pl) => {
      pl.trackIds = pl.trackIds.filter((tid) => tid !== id);
    });

    this.save();
    return true;
  }

  // --- Playlist Methods ---

  getAllPlaylists() {
    return this.data.playlists.map((pl) => ({
      ...pl,
      trackCount: pl.trackIds.length
    }));
  }

  getPlaylistById(id) {
    const pl = this.data.playlists.find((p) => p.id === id);
    if (!pl) return null;

    const tracks = pl.trackIds
      .map((tid) => this.getTrackById(tid))
      .filter(Boolean);

    return {
      ...pl,
      tracks
    };
  }

  createPlaylist(name) {
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

    this.data.playlists.push(newPlaylist);
    this.save();
    return newPlaylist;
  }

  deletePlaylist(id) {
    const pl = this.data.playlists.find((p) => p.id === id);
    if (!pl) return false;
    if (pl.isDefault) {
      throw new Error('Cannot delete default playlist');
    }

    this.data.playlists = this.data.playlists.filter((p) => p.id !== id);
    this.save();
    return true;
  }

  addTrackToPlaylist(playlistId, trackId) {
    const pl = this.data.playlists.find((p) => p.id === playlistId);
    if (!pl) throw new Error('Playlist not found');

    const track = this.getTrackById(trackId);
    if (!track) throw new Error('Track not found');

    if (!pl.trackIds.includes(trackId)) {
      pl.trackIds.push(trackId);
      this.save();
    }
    return pl;
  }

  removeTrackFromPlaylist(playlistId, trackId) {
    const pl = this.data.playlists.find((p) => p.id === playlistId);
    if (!pl) throw new Error('Playlist not found');

    pl.trackIds = pl.trackIds.filter((tid) => tid !== trackId);
    this.save();
    return pl;
  }
}

const storage = new Storage();

module.exports = { storage };
