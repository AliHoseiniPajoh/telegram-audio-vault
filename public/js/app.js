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
      
      // Update header badge with user name or lock icon
      const userBadge = document.getElementById('user-badge');
      if (userBadge && auth.user?.first_name) {
        userBadge.textContent = auth.user.first_name;
      }

      // Initial data fetch
      await this.loadTracks();
    } catch (err) {
      console.error('⛔ Access Denied or Server Error:', err);
      this.renderAccessDenied(err.message);
    }
  },

  async loadTracks(query = '') {
    try {
      this.tracks = await window.ApiClient.getTracks(query);
      window.UI.renderTracks(this.tracks);
    } catch (err) {
      console.error('Failed to load tracks:', err);
      window.UI.showToast('خطا در دریافت لیست ترک‌ها');
    }
  },

  async loadPlaylists() {
    try {
      this.playlists = await window.ApiClient.getPlaylists();
      window.UI.renderPlaylists(this.playlists);
    } catch (err) {
      console.error('Failed to load playlists:', err);
      window.UI.showToast('خطا در دریافت پلی‌لیست‌ها');
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
      window.UI.showToast('خطا در دریافت جزئیات پلی‌لیست');
    }
  },

  handleSearch(query) {
    this.activeSearch = query;
    this.loadTracks(query);
  },

  refreshCurrentView() {
    if (window.UI.currentTab === 'tracks') {
      this.loadTracks(this.activeSearch);
    } else if (window.UI.activePlaylistId) {
      this.loadPlaylistDetails(window.UI.activePlaylistId);
    } else {
      this.loadPlaylists();
    }
  },

  renderAccessDenied(reason = '') {
    const appEl = document.getElementById('app');
    appEl.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; padding: 32px; text-align: center; background: var(--bg-color); color: var(--text-color);">
        <div style="width: 72px; height: 72px; border-radius: 24px; background: rgba(255, 73, 88, 0.12); display: flex; align-items: center; justify-content: center; color: var(--destructive-color); margin-bottom: 20px;">
          ${Icons.shieldLock}
        </div>
        <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 10px;">دسترسی کاملاً خصوصی</h1>
        <p style="font-size: 14px; color: var(--hint-color); line-height: 1.6; max-width: 300px; margin-bottom: 20px;">
          این صندوقچه صوتی منحصراً برای کاربر مالک پیکربندی شده است و هیچ‌گونه دسترسی عمومی ندارد.
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
