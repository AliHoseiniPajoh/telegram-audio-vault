const fs = require('fs');
const path = require('path');
const { config } = require('../config');

// In Vercel serverless environment, /tmp is the only writable directory
const storageDir = process.env.VERCEL ? '/tmp' : config.dataDir;
const DB_FILE = path.join(storageDir, 'vault.json');

// Upstash / Vercel KV environment variables (supports all Vercel prefixes: KV_, UPSTASH_, STORAGE_)
const KV_URL = process.env.KV_REST_API_URL || 
               process.env.UPSTASH_REDIS_REST_URL || 
               process.env.STORAGE_REST_API_URL || 
               process.env.STORAGE_URL || '';

const KV_TOKEN = process.env.KV_REST_API_TOKEN || 
                 process.env.UPSTASH_REDIS_REST_TOKEN || 
                 process.env.STORAGE_REST_API_TOKEN || 
                 process.env.STORAGE_TOKEN || '';

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

  // Standard Upstash Redis / Vercel KV REST Integration
  async syncFromKV() {
    if (!KV_URL || !KV_TOKEN) return;
    try {
      const res = await fetch(KV_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['GET', 'telegram_audio_vault_data'])
      });
      const json = await res.json();
      if (json && json.result) {
        this.data = typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
        this.saveLocal(this.data);
      }
    } catch (err) {
      console.warn('[KV Error] Sync from cloud KV error:', err.message);
    }
  }

  async syncToKV() {
    if (!KV_URL || !KV_TOKEN) return;
    try {
      await fetch(KV_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['SET', 'telegram_audio_vault_data', JSON.stringify(this.data)])
      });
    } catch (err) {
      console.warn('[KV Error] Push to cloud KV error:', err.message);
    }
  }

  async save(dataToSave = this.data) {
    this.saveLocal(dataToSave);
    if (KV_URL && KV_TOKEN) {
      await this.syncToKV();
    }
  }

  // --- Track Methods ---

  async getAllTracks(query = '') {
    if (KV_URL && KV_TOKEN) {
      await this.syncFromKV();
    }
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

  async getTrackById(id) {
    if (KV_URL && KV_TOKEN) {
      await this.syncFromKV();
    }
    return this.data.tracks.find((t) => t.id === id) || null;
  }

  getTrackByFileUniqueId(fileUniqueId) {
    return this.data.tracks.find((t) => t.fileUniqueId === fileUniqueId) || null;
  }

  getOrCreatePlaylistByName(name) {
    if (!name || typeof name !== 'string') return this.data.playlists[0] || null;
    const cleanName = name.trim();
    const existing = this.data.playlists.find(
      (p) => p.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (existing) return existing;
    return this.createPlaylist(cleanName);
  }

  async addTrack(metadata, playlistId = null) {
    if (KV_URL && KV_TOKEN) {
      await this.syncFromKV();
    }

    const existing = this.getTrackByFileUniqueId(metadata.fileUniqueId);
    if (existing) {
      existing.fileId = metadata.fileId;
      existing.updatedAt = new Date().toISOString();
      if (playlistId) {
        const pl = this.data.playlists.find((p) => p.id === playlistId);
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

    this.data.tracks.push(newTrack);

    // Auto-add to target playlist OR default Favorites playlist
    if (playlistId) {
      const pl = this.data.playlists.find((p) => p.id === playlistId);
      if (pl && !pl.trackIds.includes(newTrack.id)) {
        pl.trackIds.push(newTrack.id);
      }
    } else if (this.data.playlists.length > 0) {
      const defaultPl = this.data.playlists[0];
      if (!defaultPl.trackIds.includes(newTrack.id)) {
        defaultPl.trackIds.push(newTrack.id);
      }
    }

    await this.save();
    return newTrack;
  }

  async deleteTrack(id) {
    if (KV_URL && KV_TOKEN) {
      await this.syncFromKV();
    }

    const initialCount = this.data.tracks.length;
    this.data.tracks = this.data.tracks.filter((t) => t.id !== id);

    if (this.data.tracks.length === initialCount) {
      return false;
    }

    this.data.playlists.forEach((pl) => {
      pl.trackIds = pl.trackIds.filter((tid) => tid !== id);
    });

    await this.save();
    return true;
  }

  // --- Playlist Methods ---

  async getAllPlaylists() {
    if (KV_URL && KV_TOKEN) {
      await this.syncFromKV();
    }
    return this.data.playlists.map((pl) => ({
      ...pl,
      trackCount: pl.trackIds.length
    }));
  }

  async getPlaylistById(id) {
    if (KV_URL && KV_TOKEN) {
      await this.syncFromKV();
    }
    const pl = this.data.playlists.find((p) => p.id === id);
    if (!pl) return null;

    const tracks = pl.trackIds
      .map((tid) => this.data.tracks.find((t) => t.id === tid))
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

    this.data.playlists.push(newPlaylist);
    await this.save();
    return newPlaylist;
  }

  async deletePlaylist(id) {
    const pl = this.data.playlists.find((p) => p.id === id);
    if (!pl) return false;
    if (pl.isDefault) {
      throw new Error('Cannot delete default playlist');
    }

    this.data.playlists = this.data.playlists.filter((p) => p.id !== id);
    await this.save();
    return true;
  }

  async addTrackToPlaylist(playlistId, trackId) {
    if (KV_URL && KV_TOKEN) {
      await this.syncFromKV();
    }
    const pl = this.data.playlists.find((p) => p.id === playlistId);
    if (!pl) throw new Error('Playlist not found');

    const track = this.data.tracks.find((t) => t.id === trackId);
    if (!track) throw new Error('Track not found');

    if (!pl.trackIds.includes(trackId)) {
      pl.trackIds.push(trackId);
      await this.save();
    }
    return pl;
  }

  async removeTrackFromPlaylist(playlistId, trackId) {
    if (KV_URL && KV_TOKEN) {
      await this.syncFromKV();
    }
    const pl = this.data.playlists.find((p) => p.id === playlistId);
    if (!pl) throw new Error('Playlist not found');

    pl.trackIds = pl.trackIds.filter((tid) => tid !== trackId);
    await this.save();
    return pl;
  }
}

const storage = new Storage();

module.exports = { storage };
