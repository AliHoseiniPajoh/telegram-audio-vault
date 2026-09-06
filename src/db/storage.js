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
      name: 'موردعلاقه‌ها',
      isDefault: true,
      trackIds: [],
      createdAt: new Date().toISOString()
    }
  ],
  deletedTrackIds: [],
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
  async syncFromKV(force = false) {
    const kv = getRestEndpoint();
    if (!kv) return;

    // Cache sync for 1.5s to prevent hammering unless force is true
    const now = Date.now();
    if (!force && now - this.lastSync < 1500) {
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
            // Apply deletedTrackIds tombstones
            const deletedSet = new Set([
              ...(this.data.deletedTrackIds || []),
              ...(parsed.deletedTrackIds || [])
            ]);
            parsed.deletedTrackIds = Array.from(deletedSet);
            parsed.tracks = parsed.tracks.filter(
              (t) => !deletedSet.has(t.id) && !deletedSet.has(t.fileUniqueId)
            );
            if (Array.isArray(parsed.playlists)) {
              parsed.playlists.forEach((pl) => {
                if (pl.id === 'pl_favorites' && pl.name === 'Favorites') {
                  pl.name = 'موردعلاقه‌ها';
                }
                pl.trackIds = (pl.trackIds || []).filter((tid) => !deletedSet.has(tid));
              });
            }
            this.data = parsed;
            this.saveLocal(this.data);
          }
        }
      }
    } catch (err) {
      console.warn('[Storage] Cloud sync skipped (using local):', err.message);
    }
  }

  async syncToKV(mergeWithRemote = false) {
    const kv = getRestEndpoint();
    if (!kv) return;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);

      const deletedSet = new Set(this.data.deletedTrackIds || []);

      if (mergeWithRemote) {
        // Fetch latest remote state to merge on concurrent adds
        const getRes = await fetch(kv.url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${kv.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(['GET', 'telegram_audio_vault_data']),
          signal: controller.signal
        });

        if (getRes.ok) {
          const json = await getRes.json();
          if (json && json.result) {
            const remote = typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
            if (remote && Array.isArray(remote.tracks)) {
              if (Array.isArray(remote.deletedTrackIds)) {
                for (const dId of remote.deletedTrackIds) deletedSet.add(dId);
              }
              this.data.deletedTrackIds = Array.from(deletedSet);

              // Merge remote tracks into local, strictly excluding deleted tracks
              const trackMap = new Map();
              for (const t of remote.tracks) {
                const key = t.fileUniqueId || t.id;
                if (!deletedSet.has(t.id) && !deletedSet.has(t.fileUniqueId)) {
                  trackMap.set(key, t);
                }
              }
              for (const t of this.data.tracks || []) {
                const key = t.fileUniqueId || t.id;
                if (!deletedSet.has(t.id) && !deletedSet.has(t.fileUniqueId)) {
                  trackMap.set(key, t);
                }
              }
              this.data.tracks = Array.from(trackMap.values());

              // Merge remote playlists into local
              const plMap = new Map();
              for (const pl of remote.playlists || []) {
                const key = pl.id === 'pl_favorites' ? 'موردعلاقه‌ها' : pl.name.toLowerCase();
                plMap.set(key, { ...pl, name: pl.id === 'pl_favorites' ? 'موردعلاقه‌ها' : pl.name });
              }
              for (const pl of this.data.playlists || []) {
                const key = pl.id === 'pl_favorites' ? 'موردعلاقه‌ها' : pl.name.toLowerCase();
                if (plMap.has(key)) {
                  const existing = plMap.get(key);
                  const combinedTrackIds = Array.from(
                    new Set([...(existing.trackIds || []), ...(pl.trackIds || [])])
                  ).filter((tid) => !deletedSet.has(tid));
                  plMap.set(key, { ...existing, ...pl, trackIds: combinedTrackIds });
                } else {
                  plMap.set(key, pl);
                }
              }
              this.data.playlists = Array.from(plMap.values());
              this.saveLocal(this.data);
            }
          }
        }
      }

      // Write authoritative data directly to KV
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
      this.lastSync = Date.now();
    } catch (err) {
      console.warn('[Storage] Cloud push skipped:', err.message);
    }
  }

  async save(dataToSave = this.data, mergeWithRemote = false) {
    this.saveLocal(dataToSave);
    await this.syncToKV(mergeWithRemote);
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

  getTrackByFileId(fileId) {
    return (this.data.tracks || []).find((t) => t.fileId === fileId) || null;
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

  async addTrack(metadata, playlistIdOrName = null) {
    await this.syncFromKV(true);

    // Resolve or create playlist dynamically after KV sync
    let targetPlaylist = null;
    if (playlistIdOrName && typeof playlistIdOrName === 'string') {
      const cleanIdent = playlistIdOrName.trim();
      targetPlaylist = (this.data.playlists || []).find(
        (p) => p.id === cleanIdent || p.name.toLowerCase() === cleanIdent.toLowerCase()
      );
      if (!targetPlaylist) {
        targetPlaylist = this.createPlaylist(cleanIdent);
      }
    }

    const existing = this.getTrackByFileUniqueId(metadata.fileUniqueId);
    if (existing) {
      existing.fileId = metadata.fileId;
      existing.updatedAt = new Date().toISOString();
      if (targetPlaylist && !targetPlaylist.trackIds.includes(existing.id)) {
        targetPlaylist.trackIds.push(existing.id);
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
      userId: metadata.userId || null,
      userFirstName: metadata.userFirstName || null,
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
          name: 'موردعلاقه‌ها',
          isDefault: true,
          trackIds: [],
          createdAt: new Date().toISOString()
        }
      ];
    }

    if (targetPlaylist) {
      if (!targetPlaylist.trackIds.includes(newTrack.id)) {
        targetPlaylist.trackIds.push(newTrack.id);
      }
    } else {
      const defaultPl = this.data.playlists.find((p) => p.isDefault) || this.data.playlists[0];
      if (defaultPl && !defaultPl.trackIds.includes(newTrack.id)) {
        defaultPl.trackIds.push(newTrack.id);
      }
    }

    await this.save(this.data, true);
    return newTrack;
  }

  async deleteTrack(id) {
    await this.syncFromKV();

    const trackToDelete = (this.data.tracks || []).find((t) => t.id === id);
    if (!trackToDelete) {
      return false;
    }

    // Record tombstone so sync can never resurrect this track
    if (!Array.isArray(this.data.deletedTrackIds)) {
      this.data.deletedTrackIds = [];
    }
    this.data.deletedTrackIds.push(id);
    if (trackToDelete.fileUniqueId) {
      this.data.deletedTrackIds.push(trackToDelete.fileUniqueId);
    }

    this.data.tracks = (this.data.tracks || []).filter((t) => t.id !== id);

    (this.data.playlists || []).forEach((pl) => {
      pl.trackIds = (pl.trackIds || []).filter((tid) => tid !== id);
    });

    // Authoritative overwrite with mergeWithRemote = false
    await this.save(this.data, false);
    return true;
  }

  // --- Playlist Methods ---

  async getAllPlaylists(userId = null) {
    await this.syncFromKV();
    const uid = userId ? String(userId).trim() : null;

    // Resolve user-specific favorites playlist
    const favPlId = uid ? `pl_fav_${uid}` : 'pl_favorites';
    let userFav = (this.data.playlists || []).find((p) => p.id === favPlId);
    if (!userFav && uid) {
      userFav = {
        id: favPlId,
        name: 'Liked Songs',
        isDefault: true,
        userId: uid,
        trackIds: [],
        createdAt: new Date().toISOString()
      };
      this.data.playlists.push(userFav);
      this.saveLocal();
    }

    const list = (this.data.playlists || []).filter((pl) => {
      // Don't show other users' private favorites
      if (pl.id.startsWith('pl_fav_') && pl.id !== favPlId) return false;
      // Show user's playlists and public/general playlists
      if (!pl.userId || !uid) return true;
      return String(pl.userId).trim() === uid;
    });

    return list.map((pl) => {
      const isFav = pl.id === favPlId || pl.id === 'pl_favorites';
      return {
        ...pl,
        id: isFav ? 'pl_favorites' : pl.id, // Expose as pl_favorites so frontend UI works seamlessly
        realId: pl.id,
        name: isFav ? 'Liked Songs' : pl.name,
        trackCount: (pl.trackIds || []).length
      };
    });
  }

  async getPlaylistById(id, userId = null) {
    await this.syncFromKV();
    const uid = userId ? String(userId).trim() : null;
    const targetId = (id === 'pl_favorites' && uid) ? `pl_fav_${uid}` : id;

    let pl = (this.data.playlists || []).find((p) => p.id === targetId || p.id === id);
    if (!pl && id === 'pl_favorites' && uid) {
      pl = {
        id: `pl_fav_${uid}`,
        name: 'Liked Songs',
        isDefault: true,
        userId: uid,
        trackIds: [],
        createdAt: new Date().toISOString()
      };
      this.data.playlists.push(pl);
      this.saveLocal();
    }
    if (!pl) return null;

    const tracks = (pl.trackIds || [])
      .map((tid) => (this.data.tracks || []).find((t) => t.id === tid))
      .filter(Boolean);

    return {
      ...pl,
      id: 'pl_favorites',
      realId: pl.id,
      name: (pl.id === 'pl_favorites' || pl.id.startsWith('pl_fav_')) ? 'Liked Songs' : pl.name,
      tracks
    };
  }

  async createPlaylist(name, userId = null) {
    if (!name || typeof name !== 'string') {
      throw new Error('Playlist name is required');
    }

    const newPlaylist = {
      id: `pl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: name.trim(),
      isDefault: false,
      userId: userId ? String(userId).trim() : null,
      trackIds: [],
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(this.data.playlists)) {
      this.data.playlists = [];
    }
    this.data.playlists.push(newPlaylist);
    await this.save(this.data, false);
    return newPlaylist;
  }

  async deletePlaylist(id) {
    const pl = (this.data.playlists || []).find((p) => p.id === id);
    if (!pl) return false;
    if (pl.isDefault) {
      throw new Error('Cannot delete default playlist');
    }

    this.data.playlists = (this.data.playlists || []).filter((p) => p.id !== id);
    await this.save(this.data, false);
    return true;
  }

  async addTrackToPlaylist(playlistId, trackId, userId = null) {
    await this.syncFromKV();
    const uid = userId ? String(userId).trim() : null;
    const targetId = (playlistId === 'pl_favorites' && uid) ? `pl_fav_${uid}` : playlistId;
    let pl = (this.data.playlists || []).find((p) => p.id === targetId || p.id === playlistId);
    if (!pl && playlistId === 'pl_favorites' && uid) {
      pl = {
        id: `pl_fav_${uid}`,
        name: 'Liked Songs',
        isDefault: true,
        userId: uid,
        trackIds: [],
        createdAt: new Date().toISOString()
      };
      this.data.playlists.push(pl);
    }
    if (!pl) throw new Error('Playlist not found');

    const track = (this.data.tracks || []).find((t) => t.id === trackId);
    if (!track) throw new Error('Track not found');

    if (!pl.trackIds.includes(trackId)) {
      pl.trackIds.push(trackId);
      await this.save(this.data, false);
    }
    return pl;
  }

  async removeTrackFromPlaylist(playlistId, trackId, userId = null) {
    await this.syncFromKV();
    const uid = userId ? String(userId).trim() : null;
    const targetId = (playlistId === 'pl_favorites' && uid) ? `pl_fav_${uid}` : playlistId;
    const pl = (this.data.playlists || []).find((p) => p.id === targetId || p.id === playlistId);
    if (!pl) throw new Error('Playlist not found');

    pl.trackIds = (pl.trackIds || []).filter((tid) => tid !== trackId);
    await this.save(this.data, false);
    return pl;
  }
}

const storage = new Storage();

module.exports = { storage };
