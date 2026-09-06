/**
 * Application Entry Point
 * Orchestrates Telegram bridge, API synchronization, and views
 */

const App = {
  tracks: [],
  playlists: [],
  activeSearch: '',

  async init() {
    // 1. Initialize Telegram WebApp SDK Bridge
    window.TelegramBridge.init();

    // 2. Initialize UI DOM Bindings
    window.UI.init();

    // 3. Verify user authorization with backend
    try {
      const auth = await window.ApiClient.getMe();
      console.log('✅ Authenticated with Audio Vault:', auth);
      
      // Update header user display
      const usernameEl = document.getElementById('header-username');
      const avatarEl = document.getElementById('header-avatar');
      if (auth.user?.first_name) {
        if (usernameEl) usernameEl.textContent = auth.user.first_name;
        if (avatarEl) {
          if (auth.user.photo_url) {
            avatarEl.innerHTML = `<img src="${auth.user.photo_url}" alt="" />`;
          } else {
            avatarEl.textContent = auth.user.first_name.charAt(0).toUpperCase();
          }
        }
      }

      // Initial data fetch: preload playlists and tracks
      try {
        this.playlists = await window.ApiClient.getPlaylists();
      } catch (_) {}
      await this.loadTracks();
    } catch (err) {
      console.error('⛔ Access Denied or Server Error:', err);
      this.renderAccessDenied(err.message);
    }
  },

  async loadTracks(query = '') {
    try {
      if (window.UI?.syncDownloadedTracks) {
        await window.UI.syncDownloadedTracks();
      }
      this.tracks = await window.ApiClient.getTracks(query);
      window.UI.renderTracks(this.tracks);
    } catch (err) {
      console.error('Failed to load tracks:', err);
      window.UI.showToast('Error loading tracks');
    }
  },

  async loadPlaylists() {
    try {
      this.playlists = await window.ApiClient.getPlaylists();
      if (window.UI.currentTab === 'library') {
        window.UI.renderLibraryScreen();
      }
    } catch (err) {
      console.error('Failed to load playlists:', err);
    }
  },

  async loadPlaylistDetails(playlistId) {
    try {
      const playlist = await window.ApiClient.getPlaylist(playlistId);
      if (playlist) {
        window.UI.renderPlaylistDetail(playlist);
      }
    } catch (err) {
      console.error('Failed to load playlist:', err);
      window.UI.showToast('Error loading playlist');
    }
  },

  handleSearch(query) {
    this.activeSearch = query;
    window.UI.handleSearchInput(query);
  },

  refreshCurrentView() {
    if (window.UI.activeSubView === 'playlist-detail' && window.UI.activePlaylistId) {
      this.loadPlaylistDetails(window.UI.activePlaylistId);
    } else if (window.UI.currentTab === 'home') {
      window.UI.renderHomeScreen();
    } else if (window.UI.currentTab === 'library') {
      window.UI.renderLibraryScreen();
    } else {
      window.UI.renderSearchScreen();
    }
  },

  renderAccessDenied(reason = '') {
    const appEl = document.getElementById('app');
    appEl.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; padding: 32px; text-align: center; background: var(--bg-color); color: var(--text-color);">
        <div style="width: 72px; height: 72px; border-radius: 24px; background: rgba(255, 73, 88, 0.12); display: flex; align-items: center; justify-content: center; color: var(--destructive-color); margin-bottom: 20px;">
          ${Icons.shieldLock}
        </div>
        <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 10px;">Telegram Music</h1>
        <p style="font-size: 14px; color: var(--hint-color); line-height: 1.6; max-width: 320px; margin-bottom: 20px;">
          لطفاً این برنامه را از طریق تلگرام با فشردن دکمه منو یا استارت ربات باز کنید تا به آرشیو موسیقی دسترسی داشته باشید.
        </p>
        <div style="font-size: 11px; padding: 6px 12px; border-radius: 8px; background: var(--secondary-bg-color); color: var(--hint-color);">
          ${window.UI.escapeHTML(reason || 'Unauthorized')}
        </div>
      </div>
    `;
  }
};

window.App = App;

// Bootstrap on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});
