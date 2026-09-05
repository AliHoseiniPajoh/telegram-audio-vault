const fs = require('fs');
const path = require('path');
const { config } = require('../config');

const DB_FILE = path.join(config.dataDir, 'vault.json');

// Default initial state
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
    this.data = this.load();
  }

  ensureDataDir() {
    if (!fs.existsSync(config.dataDir)) {
      fs.mkdirSync(config.dataDir, { recursive: true });
    }
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const content = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(content);
      }
    } catch (err) {
      console.error('[Storage Error] Failed to read database, falling back to default:', err.message);
    }
    this.save(defaultState);
    return JSON.parse(JSON.stringify(defaultState));
  }

  save(dataToSave = this.data) {
    try {
      this.ensureDataDir();
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(dataToSave, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('[Storage Error] Failed to save database:', err.message);
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
    // Return newest first
    return tracks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getTrackById(id) {
    return this.data.tracks.find((t) => t.id === id) || null;
  }

  getTrackByFileUniqueId(fileUniqueId) {
    return this.data.tracks.find((t) => t.fileUniqueId === fileUniqueId) || null;
  }

  addTrack(metadata) {
    // Avoid duplicate entries if unique ID matches
    const existing = this.getTrackByFileUniqueId(metadata.fileUniqueId);
    if (existing) {
      // Update file_id if it changed
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
      type: metadata.type || 'audio', // 'audio' | 'voice'
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
      return false; // Not found
    }

    // Also remove track reference from all playlists
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

    // Expand track objects
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
