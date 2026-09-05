/**
 * API Client with Automatic Telegram Authentication
 */

const ApiClient = {
  baseUrl: '/api',

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    const initData = window.TelegramBridge?.getInitData();
    if (initData) {
      headers['X-Telegram-Init-Data'] = initData;
    } else {
      // In dev mode outside Telegram, attach dev bypass header
      headers['X-Dev-Mock-Auth'] = 'owner';
    }

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || `HTTP Error ${response.status}`);
      }

      return data;
    } catch (err) {
      console.error(`[API Error] ${endpoint}:`, err.message);
      throw err;
    }
  },

  // Get current user profile & vault stats
  async getMe() {
    return this.request('/me');
  },

  // Get list of tracks
  async getTracks(query = '') {
    const q = query ? `?q=${encodeURIComponent(query)}` : '';
    const res = await this.request(`/tracks${q}`);
    return res.tracks || [];
  },

  // Delete a track
  async deleteTrack(id) {
    return this.request(`/tracks/${id}`, { method: 'DELETE' });
  },

  // Get all playlists
  async getPlaylists() {
    const res = await this.request('/playlists');
    return res.playlists || [];
  },

  // Get playlist details with tracks
  async getPlaylist(id) {
    const res = await this.request(`/playlists/${id}`);
    return res.playlist || null;
  },

  // Create new playlist
  async createPlaylist(name) {
    const res = await this.request('/playlists', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    return res.playlist;
  },

  // Delete a playlist
  async deletePlaylist(id) {
    return this.request(`/playlists/${id}`, { method: 'DELETE' });
  },

  // Add track to playlist
  async addTrackToPlaylist(playlistId, trackId) {
    return this.request(`/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ trackId })
    });
  },

  // Remove track from playlist
  async removeTrackFromPlaylist(playlistId, trackId) {
    return this.request(`/playlists/${playlistId}/tracks/${trackId}`, {
      method: 'DELETE'
    });
  },

  // Get authenticated stream URL for HTML5 audio
  getStreamUrl(fileId) {
    const initData = window.TelegramBridge?.getInitData();
    if (initData) {
      return `/api/stream/${encodeURIComponent(fileId)}?initData=${encodeURIComponent(initData)}`;
    }
    // Fallback in local dev
    return `/api/stream/${encodeURIComponent(fileId)}`;
  }
};

window.ApiClient = ApiClient;
