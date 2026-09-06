/**
 * UI Controller & Screen View Manager
 * Fully implements the 14-screen Telegram Music Design Architecture
 */

const UI = {
  // Current Navigation State
  currentTab: 'home', // 'home' | 'search' | 'library'
  activeSubView: null, // null | 'playlist-detail' | 'downloads' | 'telegram' | 'settings'
  activePlayerPanel: 'panel-now-playing', // 'panel-now-playing' | 'panel-queue' | 'panel-lyrics'
  activePlaylistId: null,
  isExpandedOpen: false,

  // Offline / Storage Cache state
  downloadedFileIds: new Set(),
  cachedStorageBytes: 0,

  // Search state
  searchFilter: 'all', // 'all' | 'songs' | 'artists' | 'playlists'
  recentSearches: [],

  // Synced Lyrics state
  currentLyrics: null,
  activeLyricIndex: -1,

  // Sleep Timer state
  sleepTimerTimeout: null,
  sleepFadeTimeout: null,
  sleepTimerInterval: null,
  sleepTimerEndTime: null,
  sleepTimerMode: null,

  // Initialize UI references and event hooks
  init() {
    this.loadRecentSearches();
    this.bindDOM();
    this.bindEvents();
    this.syncDownloadedTracks();
  },

  loadRecentSearches() {
    try {
      this.recentSearches = JSON.parse(localStorage.getItem('vault_recent_searches') || '[]');
      if (!Array.isArray(this.recentSearches)) this.recentSearches = [];
    } catch (_) {
      this.recentSearches = [];
    }
  },

  saveRecentSearches() {
    try {
      localStorage.setItem('vault_recent_searches', JSON.stringify(this.recentSearches.slice(0, 15)));
    } catch (_) {}
  },

  async syncDownloadedTracks() {
    if (window.AudioCache && window.AudioCache.getAllKeys) {
      try {
        const keys = await window.AudioCache.getAllKeys();
        this.downloadedFileIds = new Set(keys);
        this.updateStorageStats();
      } catch (_) {}
    }
  },

  async updateStorageStats() {
    if (!window.AudioCache) return;
    try {
      let totalBytes = 0;
      const allTracks = window.App.tracks || [];
      for (const t of allTracks) {
        if (this.downloadedFileIds.has(t.fileId) && t.fileSize) {
          totalBytes += t.fileSize;
        }
      }
      this.cachedStorageBytes = totalBytes;
      const mb = (totalBytes / (1024 * 1024)).toFixed(1);
      const str = totalBytes > 0 ? `${mb} MB in phone storage` : '0 MB (No offline tracks)';

      const dlStorageText = document.getElementById('downloads-storage-text');
      if (dlStorageText) dlStorageText.textContent = str;

      const settingsCacheText = document.getElementById('settings-cache-size');
      if (settingsCacheText) settingsCacheText.textContent = str;

      const qcDlCount = document.getElementById('qc-downloads-count');
      if (qcDlCount) qcDlCount.textContent = `${this.downloadedFileIds.size} offline`;

      const libDlBadge = document.getElementById('lib-dl-badge');
      if (libDlBadge) libDlBadge.textContent = String(this.downloadedFileIds.size);
    } catch (_) {}
  },

  bindDOM() {
    this.dom = {
      app: document.getElementById('app'),

      // App Header
      appHeader: document.getElementById('app-header'),
      headerAvatar: document.getElementById('header-avatar'),
      headerGreeting: document.getElementById('header-greeting'),
      headerUsername: document.getElementById('header-username'),
      btnHeaderSettings: document.getElementById('btn-header-settings'),

      // Screen Views
      viewHome: document.getElementById('view-home'),
      viewSearch: document.getElementById('view-search'),
      viewLibrary: document.getElementById('view-library'),
      viewPlaylistDetail: document.getElementById('view-playlist-detail'),
      viewDownloads: document.getElementById('view-downloads'),
      viewTelegram: document.getElementById('view-telegram'),
      viewSettings: document.getElementById('view-settings'),

      // Bottom Navigation Tabs
      navTabHome: document.getElementById('nav-tab-home'),
      navTabSearch: document.getElementById('nav-tab-search'),
      navTabLibrary: document.getElementById('nav-tab-library'),

      // Search screen elements
      searchInput: document.getElementById('search-input'),
      searchClear: document.getElementById('search-clear'),
      searchFilterPills: document.getElementById('search-filter-pills'),
      searchExploreSection: document.getElementById('search-explore-section'),
      recentSearchesList: document.getElementById('recent-searches-list'),
      btnClearRecentSearches: document.getElementById('btn-clear-recent-searches'),
      searchResultsContainer: document.getElementById('search-results-container'),
      srcSavedMessages: document.getElementById('src-saved-messages'),
      srcChannels: document.getElementById('src-channels'),

      // Mini Player
      miniPlayer: document.getElementById('mini-player'),
      miniTitle: document.getElementById('mini-title'),
      miniArtist: document.getElementById('mini-artist'),
      miniPlayBtn: document.getElementById('mini-play-btn'),
      miniNextBtn: document.getElementById('mini-next-btn'),
      miniProgress: document.getElementById('mini-progress'),
      miniArtwork: document.getElementById('mini-artwork'),

      // Expanded Player
      expandedPlayer: document.getElementById('expanded-player'),
      expandedCloseBtn: document.getElementById('expanded-close-btn'),
      expandedNavPill: document.getElementById('expanded-nav-pill'),
      ambientGlow: document.getElementById('ambient-glow'),

      // Player Panels & Switcher
      panelNowPlaying: document.getElementById('panel-now-playing'),
      panelQueue: document.getElementById('panel-queue'),
      panelLyrics: document.getElementById('panel-lyrics'),
      pillSwitchPlaying: document.getElementById('pill-switch-playing'),
      pillSwitchQueue: document.getElementById('pill-switch-queue'),
      pillSwitchLyrics: document.getElementById('pill-switch-lyrics'),

      // Controls inside Panel 1
      artworkWrapper: document.getElementById('artwork-wrapper'),
      artworkCard: document.getElementById('artwork-card'),
      expandedTitle: document.getElementById('expanded-title'),
      expandedArtist: document.getElementById('expanded-artist'),
      seekSlider: document.getElementById('seek-slider'),
      currentTimeLabel: document.getElementById('current-time'),
      totalTimeLabel: document.getElementById('total-time'),
      btnShuffle: document.getElementById('btn-shuffle'),
      btnPrev: document.getElementById('btn-prev'),
      btnPlay: document.getElementById('btn-play'),
      btnNext: document.getElementById('btn-next'),
      btnRepeat: document.getElementById('btn-repeat'),
      btnSpeed: document.getElementById('btn-speed'),
      btnLike: document.getElementById('btn-like'),
      btnDownloadExpanded: document.getElementById('btn-download-expanded'),
      btnPlayNative: document.getElementById('btn-play-native'),
      btnAddToPl: document.getElementById('btn-add-to-pl'),

      // Lyrics elements (Panel 3)
      lyricsScroller: document.getElementById('lyrics-scroller'),
      lyricsList: document.getElementById('lyrics-list'),

      // Queue elements (Panel 2)
      queueNowCard: document.getElementById('queue-now-card'),
      panelQueueList: document.getElementById('panel-queue-list'),
      btnClearQueue: document.getElementById('btn-clear-queue'),

      // Sleep Timer
      btnSleep: document.getElementById('btn-sleep'),
      btnSleepText: document.getElementById('btn-sleep-text'),

      // Modals
      modalAddToPlaylist: document.getElementById('modal-add-to-playlist'),
      btnCloseAddPlModal: document.getElementById('btn-close-add-pl-modal'),
      addPlList: document.getElementById('add-pl-list'),
      addPlSearchInput: document.getElementById('add-pl-search-input'),
      btnAddPlConfirm: document.getElementById('btn-add-pl-confirm'),

      modalOverlay: document.getElementById('modal-overlay'),
      modalTitle: document.getElementById('modal-title'),
      modalBody: document.getElementById('modal-body'),
      modalActions: document.getElementById('modal-actions'),
      toast: document.getElementById('toast-msg')
    };
  },

  bindEvents() {
    // 1. Bottom Navigation Tabs
    this.dom.navTabHome.addEventListener('click', () => {
      window.TelegramBridge.haptic.selection();
      this.switchTab('home');
    });

    this.dom.navTabSearch.addEventListener('click', () => {
      window.TelegramBridge.haptic.selection();
      this.switchTab('search');
    });

    this.dom.navTabLibrary.addEventListener('click', () => {
      window.TelegramBridge.haptic.selection();
      this.switchTab('library');
    });

    // Header Settings Button
    this.dom.btnHeaderSettings.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      this.openSettingsView();
    });

    // Sub-view Back Buttons
    document.getElementById('btn-back-playlist')?.addEventListener('click', () => this.closeSubView());
    document.getElementById('btn-back-downloads')?.addEventListener('click', () => this.closeSubView());
    document.getElementById('btn-back-telegram')?.addEventListener('click', () => this.closeSubView());
    document.getElementById('btn-back-settings')?.addEventListener('click', () => this.closeSubView());

    // 2. Home Screen Quick Access Cards
    document.getElementById('qc-liked')?.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      this.openLikedSongsPlaylist();
    });

    document.getElementById('qc-downloads')?.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      this.openDownloadsView();
    });

    document.getElementById('qc-telegram')?.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      this.openFromTelegramView();
    });

    document.getElementById('qc-recently-added')?.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      this.openPlaylistDetail({
        id: 'smart_new',
        name: '✨ Recently Added',
        isDefault: true,
        tracks: this.getRecentlyAddedTracks()
      });
    });

    // Home Play All Hero Button
    document.getElementById('home-hero-play-btn')?.addEventListener('click', () => {
      const tracks = window.App.tracks || [];
      if (tracks.length > 0) {
        window.TelegramBridge.haptic.impact('medium');
        window.AudioEngine.setQueue(tracks, 0, true);
        this.showToast('▶ Playing all vault tracks');
      }
    });

    // 3. Search Screen Events
    this.dom.searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      this.dom.searchClear.classList.toggle('visible', val.length > 0);
      this.handleSearchInput(val);
    });

    this.dom.searchClear.addEventListener('click', () => {
      this.dom.searchInput.value = '';
      this.dom.searchClear.classList.remove('visible');
      this.handleSearchInput('');
    });

    // Filter Pills
    this.dom.searchFilterPills.querySelectorAll('.pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.dom.searchFilterPills.querySelectorAll('.pill-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.searchFilter = btn.dataset.filter || 'all';
        window.TelegramBridge.haptic.selection();
        this.handleSearchInput(this.dom.searchInput.value);
      });
    });

    // Clear Recent Searches
    this.dom.btnClearRecentSearches.addEventListener('click', () => {
      this.recentSearches = [];
      this.saveRecentSearches();
      this.renderRecentSearches();
      this.showToast('Recent searches cleared');
    });

    // Telegram Sources in Search
    this.dom.srcSavedMessages.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      this.openFromTelegramView('saved');
    });

    this.dom.srcChannels.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      this.openFromTelegramView('channel');
    });

    // 4. Library Screen
    document.getElementById('card-liked-hero')?.addEventListener('click', (e) => {
      if (e.target.closest('#btn-play-liked-hero')) return;
      window.TelegramBridge.haptic.impact('light');
      this.openLikedSongsPlaylist();
    });

    document.getElementById('btn-play-liked-hero')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.TelegramBridge.haptic.impact('medium');
      this.playLikedSongs();
    });

    document.getElementById('lib-link-downloads')?.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      this.openDownloadsView();
    });

    document.getElementById('lib-link-telegram')?.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      this.openFromTelegramView();
    });

    document.getElementById('btn-library-create-pl')?.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      this.openCreatePlaylistModal();
    });

    // 5. Downloads View Shuffle Button
    document.getElementById('btn-downloads-shuffle')?.addEventListener('click', () => {
      const allTracks = window.App.tracks || [];
      const dlTracks = allTracks.filter((t) => this.downloadedFileIds.has(t.fileId));
      if (dlTracks.length === 0) {
        this.showToast('No downloaded tracks yet');
        return;
      }
      window.TelegramBridge.haptic.impact('medium');
      window.AudioEngine.isShuffle = true;
      if (this.dom.btnShuffle) this.dom.btnShuffle.classList.add('active');
      window.AudioEngine.setQueue(dlTracks, Math.floor(Math.random() * dlTracks.length), true);
      this.showToast('🔀 Shuffling offline tracks');
    });

    // Clear Cache in Settings
    document.getElementById('btn-clear-cache')?.addEventListener('click', () => {
      this.confirmClearCache();
    });

    // Sleep timer click in settings
    document.getElementById('setting-sleep-timer-btn')?.addEventListener('click', () => {
      this.openSleepTimerModal();
    });

    // 6. Mini Player Open
    this.dom.miniPlayer.addEventListener('click', (e) => {
      if (e.target.closest('#mini-play-btn') || e.target.closest('#mini-next-btn')) return;
      this.openExpandedPlayer();
    });

    this.dom.miniPlayBtn.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      window.AudioEngine.togglePlay();
    });

    this.dom.miniNextBtn.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      window.AudioEngine.next();
    });

    // 7. Expanded Player Controls
    this.dom.expandedCloseBtn.addEventListener('click', () => this.closeExpandedPlayer());

    this.dom.btnPlay.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('medium');
      window.AudioEngine.togglePlay();
    });

    this.dom.btnPrev.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      window.AudioEngine.prev();
    });

    this.dom.btnNext.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      window.AudioEngine.next();
    });

    this.dom.btnShuffle.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      const isShuffle = window.AudioEngine.toggleShuffle();
      this.dom.btnShuffle.classList.toggle('active', isShuffle);
      this.showToast(isShuffle ? 'Shuffle ON' : 'Shuffle OFF');
    });

    this.dom.btnRepeat.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      const mode = window.AudioEngine.toggleRepeat();
      this.updateRepeatButton(mode);
    });

    this.dom.btnSpeed.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      const rate = window.AudioEngine.cyclePlaybackRate();
      this.dom.btnSpeed.textContent = `${rate}x`;
      this.showToast(`Speed: ${rate}x`);
    });

    this.dom.btnLike.addEventListener('click', () => {
      this.toggleLikeCurrentTrack();
    });

    this.dom.btnAddToPl.addEventListener('click', () => {
      const cur = window.AudioEngine.getCurrentTrack();
      if (cur) this.openAddToPlaylistModal(cur.id);
    });

    this.dom.btnDownloadExpanded.addEventListener('click', () => {
      this.handleDownloadExpandedClick();
    });

    this.dom.btnPlayNative.addEventListener('click', async () => {
      const cur = window.AudioEngine.getCurrentTrack();
      if (!cur) return;
      window.TelegramBridge.haptic.impact('medium');
      this.showToast('Sending audio to Telegram chat...');
      try {
        await window.ApiClient.playNative(cur.id);
        this.showToast('✅ Sent to Telegram! Play directly in chat.');
      } catch (err) {
        this.showToast('❌ ' + (err.message || 'Failed'));
      }
    });

    this.dom.btnSleep.addEventListener('click', () => {
      this.openSleepTimerModal();
    });

    // 8. Expanded Player Switcher Pills (NOW PLAYING | UP NEXT | LYRICS)
    this.dom.pillSwitchPlaying.addEventListener('click', () => {
      this.switchPlayerPanel('panel-now-playing');
    });

    this.dom.pillSwitchQueue.addEventListener('click', () => {
      this.switchPlayerPanel('panel-queue');
    });

    this.dom.pillSwitchLyrics.addEventListener('click', () => {
      this.switchPlayerPanel('panel-lyrics');
    });

    // Clear queue button
    this.dom.btnClearQueue.addEventListener('click', () => {
      const cur = window.AudioEngine.getCurrentTrack();
      if (cur) {
        window.AudioEngine.setQueue([cur], 0, false);
        this.renderQueuePanel();
        this.showToast('Queue cleared');
      }
    });

    // 9. Seeker
    let isSeeking = false;
    this.dom.seekSlider.addEventListener('input', (e) => {
      isSeeking = true;
      const percent = parseFloat(e.target.value);
      if (window.AudioEngine.audio.duration) {
        const time = (percent / 100) * window.AudioEngine.audio.duration;
        this.dom.currentTimeLabel.textContent = this.formatTime(time);
      }
    });

    this.dom.seekSlider.addEventListener('change', (e) => {
      const percent = parseFloat(e.target.value);
      window.AudioEngine.seek(percent);
      isSeeking = false;
    });

    // Modal Background Clicks
    this.dom.modalOverlay.addEventListener('click', (e) => {
      if (e.target === this.dom.modalOverlay) this.closeModal();
    });

    this.dom.modalAddToPlaylist.addEventListener('click', (e) => {
      if (e.target === this.dom.modalAddToPlaylist) this.closeAddToPlaylistModal();
    });

    this.dom.btnCloseAddPlModal.addEventListener('click', () => {
      this.closeAddToPlaylistModal();
    });

    // Bind AudioEngine Events
    window.AudioEngine.on('trackChange', (track) => this.onTrackChange(track));
    window.AudioEngine.on('stateChange', ({ isPlaying }) => this.onStateChange(isPlaying));
    window.AudioEngine.on('buffering', ({ isBuffering }) => this.onBuffering(isBuffering));
    window.AudioEngine.on('timeUpdate', ({ currentTime, duration, progress }) => {
      if (!isSeeking) {
        this.onTimeUpdate(currentTime, duration, progress);
      }
    });
  },

  // =========================================================================
  // NAVIGATION & TAB SWITCHING
  // =========================================================================

  switchTab(tab) {
    this.closeSubView(false);
    this.currentTab = tab;

    this.dom.viewHome.classList.toggle('active', tab === 'home');
    this.dom.viewSearch.classList.toggle('active', tab === 'search');
    this.dom.viewLibrary.classList.toggle('active', tab === 'library');

    this.dom.navTabHome.classList.toggle('active', tab === 'home');
    this.dom.navTabSearch.classList.toggle('active', tab === 'search');
    this.dom.navTabLibrary.classList.toggle('active', tab === 'library');

    if (tab === 'home') {
      this.renderHomeScreen();
    } else if (tab === 'search') {
      this.renderSearchScreen();
    } else if (tab === 'library') {
      this.renderLibraryScreen();
    }

    if (!this.isExpandedOpen) {
      window.TelegramBridge.backButton.hide();
    }
  },

  openSubView(viewName) {
    this.activeSubView = viewName;
    document.querySelectorAll('.screen-view.sub-view').forEach((el) => el.classList.remove('active'));

    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.classList.add('active');
    }

    window.TelegramBridge.backButton.show(() => {
      this.closeSubView();
    });
  },

  closeSubView(updateTgBack = true) {
    this.activeSubView = null;
    this.activePlaylistId = null;
    document.querySelectorAll('.screen-view.sub-view').forEach((el) => el.classList.remove('active'));

    if (updateTgBack && !this.isExpandedOpen) {
      window.TelegramBridge.backButton.hide();
    }
  },

  // =========================================================================
  // EXPANDED PLAYER & PANEL SWITCHER (NOW PLAYING | UP NEXT | LYRICS)
  // =========================================================================

  openExpandedPlayer() {
    this.isExpandedOpen = true;
    this.dom.expandedPlayer.classList.add('open');
    window.TelegramBridge.haptic.impact('medium');

    window.TelegramBridge.backButton.show(() => {
      this.closeExpandedPlayer();
    });
  },

  closeExpandedPlayer() {
    this.isExpandedOpen = false;
    this.dom.expandedPlayer.classList.remove('open');
    window.TelegramBridge.haptic.impact('light');

    if (this.activeSubView) {
      window.TelegramBridge.backButton.show(() => {
        this.closeSubView();
      });
    } else {
      window.TelegramBridge.backButton.hide();
    }
  },

  switchPlayerPanel(panelId) {
    this.activePlayerPanel = panelId;
    window.TelegramBridge.haptic.selection();

    this.dom.panelNowPlaying.classList.toggle('active', panelId === 'panel-now-playing');
    this.dom.panelQueue.classList.toggle('active', panelId === 'panel-queue');
    this.dom.panelLyrics.classList.toggle('active', panelId === 'panel-lyrics');

    this.dom.pillSwitchPlaying.classList.toggle('active', panelId === 'panel-now-playing');
    this.dom.pillSwitchQueue.classList.toggle('active', panelId === 'panel-queue');
    this.dom.pillSwitchLyrics.classList.toggle('active', panelId === 'panel-lyrics');

    if (panelId === 'panel-queue') {
      this.renderQueuePanel();
    } else if (panelId === 'panel-lyrics') {
      const cur = window.AudioEngine.getCurrentTrack();
      if (cur) this.fetchAndRenderLyrics(cur);
    }
  },

  renderQueuePanel() {
    const queue = window.AudioEngine.queue || [];
    const curIdx = window.AudioEngine.currentIndex;
    const curTrack = window.AudioEngine.getCurrentTrack();

    if (curTrack) {
      this.dom.queueNowCard.innerHTML = `
        <div class="queue-now-thumb">
          ${curTrack.type === 'voice' ? Icons.mic : Icons.musicNote}
        </div>
        <div class="queue-now-info">
          <div class="queue-now-title">${this.escapeHTML(curTrack.title)}</div>
          <div class="queue-now-artist">${this.escapeHTML(curTrack.performer)}</div>
        </div>
        <div class="soundwave" style="height: 24px;">
          <div class="soundwave-bar" style="width: 3px; height: 12px;"></div>
          <div class="soundwave-bar" style="width: 3px; height: 18px;"></div>
          <div class="soundwave-bar" style="width: 3px; height: 14px;"></div>
        </div>
      `;
    } else {
      this.dom.queueNowCard.innerHTML = '<span style="color: var(--hint-color); font-size: 13px;">Nothing playing</span>';
    }

    const upNextTracks = queue.slice(curIdx + 1);
    if (upNextTracks.length === 0) {
      this.dom.panelQueueList.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--apple-label-secondary); font-size: 13.5px;">
          End of queue. Choose more songs to keep playing!
        </div>
      `;
      return;
    }

    this.dom.panelQueueList.innerHTML = upNextTracks.map((t, i) => {
      const absoluteIdx = curIdx + 1 + i;
      return `
        <div class="queue-track-item" data-index="${absoluteIdx}">
          <span class="queue-track-index">${i + 1}</span>
          <div class="queue-track-meta">
            <div class="queue-track-title">${this.escapeHTML(t.title)}</div>
            <div class="queue-track-artist">${this.escapeHTML(t.performer)}</div>
          </div>
          <span class="queue-track-duration">${this.formatTime(t.duration || 0)}</span>
        </div>
      `;
    }).join('');

    this.dom.panelQueueList.querySelectorAll('.queue-track-item').forEach((item) => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.index, 10);
        window.TelegramBridge.haptic.impact('light');
        window.AudioEngine.currentIndex = idx;
        window.AudioEngine.loadCurrentTrack(true);
        this.switchPlayerPanel('panel-now-playing');
      });
    });
  },

  // =========================================================================
  // SCREEN RENDERERS
  // =========================================================================

  renderHomeScreen() {
    const tracks = window.App.tracks || [];

    // 1. Recently Played Carousel
    const recents = this.getRecentlyPlayedTracks();
    const displayRecents = recents.length > 0 ? recents.slice(0, 10) : tracks.slice(0, 8);
    const countEl = document.getElementById('home-recently-count');
    if (countEl) countEl.textContent = `${displayRecents.length} tracks`;

    const carouselEl = document.getElementById('home-recently-carousel');
    if (carouselEl) {
      if (displayRecents.length === 0) {
        carouselEl.innerHTML = `
          <div style="color: var(--apple-label-secondary); font-size: 13px; padding: 20px 0;">
            No songs played yet. Forward audio files to the Telegram bot!
          </div>
        `;
      } else {
        carouselEl.innerHTML = displayRecents.map((t, idx) => `
          <div class="recently-card" data-id="${t.id}" data-index="${idx}">
            <div class="recently-artwork" id="recent-art-${t.id}">
              ${t.type === 'voice' ? Icons.mic : Icons.musicNote}
            </div>
            <div class="recently-title">${this.escapeHTML(t.title)}</div>
            <div class="recently-artist">${this.escapeHTML(t.performer)}</div>
          </div>
        `).join('');

        carouselEl.querySelectorAll('.recently-card').forEach((card) => {
          card.addEventListener('click', () => {
            const trackId = card.dataset.id;
            const t = tracks.find((x) => x.id === trackId);
            if (t) {
              window.TelegramBridge.haptic.impact('light');
              window.AudioEngine.setQueue([t, ...tracks.filter((x) => x.id !== trackId)], 0, true);
            }
          });
        });

        // Load covers async
        displayRecents.forEach((t) => {
          if (t.type !== 'voice') {
            window.ApiClient.getArtwork(t.title, t.performer).then((res) => {
              if (res && res.artworkUrl) {
                const el = document.getElementById(`recent-art-${t.id}`);
                if (el) el.innerHTML = `<img src="${res.artworkUrl}" alt="" />`;
              }
            }).catch(() => {});
          }
        });
      }
    }

    // 2. Quick Access Counts
    const favPl = (window.App.playlists || []).find((p) => p.id === 'pl_favorites');
    const likedCount = favPl && Array.isArray(favPl.trackIds) ? favPl.trackIds.length : 0;
    const qcLiked = document.getElementById('qc-liked-count');
    if (qcLiked) qcLiked.textContent = `${likedCount} songs`;

    const qcRecent = document.getElementById('qc-recent-count');
    if (qcRecent) qcRecent.textContent = `${tracks.length} vault tracks`;

    this.updateStorageStats();

    // 3. Made for You / Mood Playlists
    const moodGrid = document.getElementById('home-mood-grid');
    if (moodGrid) {
      moodGrid.innerHTML = `
        <div class="mood-card" id="mood-flow" style="background: linear-gradient(135deg, rgba(10, 132, 255, 0.35) 0%, rgba(42, 171, 238, 0.2) 100%), #1c1c1e;">
          <span class="mood-card-title">Focus & Flow</span>
          <span class="mood-card-sub">Pure concentration</span>
        </div>
        <div class="mood-card" id="mood-chill" style="background: linear-gradient(135deg, rgba(191, 90, 242, 0.35) 0%, rgba(255, 59, 92, 0.2) 100%), #1c1c1e;">
          <span class="mood-card-title">Night Chill</span>
          <span class="mood-card-sub">Late night vibes</span>
        </div>
        <div class="mood-card" id="mood-top" style="background: linear-gradient(135deg, rgba(255, 159, 10, 0.35) 0%, rgba(255, 55, 95, 0.2) 100%), #1c1c1e;">
          <span class="mood-card-title">🔥 Most Played</span>
          <span class="mood-card-sub">${this.getMostPlayedTracks().length} top hits</span>
        </div>
        <div class="mood-card" id="mood-daily" style="background: linear-gradient(135deg, rgba(48, 209, 88, 0.35) 0%, rgba(100, 210, 255, 0.2) 100%), #1c1c1e;">
          <span class="mood-card-title">Daily Mix</span>
          <span class="mood-card-sub">Smart curated vault</span>
        </div>
      `;

      document.getElementById('mood-top')?.addEventListener('click', () => {
        this.openPlaylistDetail({
          id: 'smart_most',
          name: '🔥 Most Played',
          isDefault: true,
          tracks: this.getMostPlayedTracks()
        });
      });

      const playMood = () => {
        if (tracks.length > 0) {
          window.TelegramBridge.haptic.impact('medium');
          window.AudioEngine.setQueue(tracks, Math.floor(Math.random() * tracks.length), true);
        }
      };

      document.getElementById('mood-flow')?.addEventListener('click', playMood);
      document.getElementById('mood-chill')?.addEventListener('click', playMood);
      document.getElementById('mood-daily')?.addEventListener('click', playMood);
    }
  },

  renderSearchScreen() {
    this.renderRecentSearches();
    this.handleSearchInput(this.dom.searchInput.value);
  },

  renderRecentSearches() {
    if (!this.dom.recentSearchesList) return;
    if (this.recentSearches.length === 0) {
      this.dom.recentSearchesList.innerHTML = '<span style="color: var(--apple-label-secondary); font-size: 13px;">No recent searches</span>';
      return;
    }

    this.dom.recentSearchesList.innerHTML = this.recentSearches.map((s) => `
      <div class="recent-tag" data-query="${this.escapeHTML(s)}">${this.escapeHTML(s)}</div>
    `).join('');

    this.dom.recentSearchesList.querySelectorAll('.recent-tag').forEach((tag) => {
      tag.addEventListener('click', () => {
        const q = tag.dataset.query;
        this.dom.searchInput.value = q;
        this.dom.searchClear.classList.add('visible');
        this.handleSearchInput(q);
      });
    });
  },

  handleSearchInput(query = '') {
    const q = (query || '').trim().toLowerCase();
    const tracks = window.App.tracks || [];

    if (!q) {
      this.dom.searchExploreSection.style.display = 'block';
      this.dom.searchResultsContainer.innerHTML = '';
      return;
    }

    this.dom.searchExploreSection.style.display = 'none';

    // Save recent search on enter/query
    if (q.length >= 2 && !this.recentSearches.includes(q)) {
      this.recentSearches = [q, ...this.recentSearches.filter((x) => x !== q)].slice(0, 10);
      this.saveRecentSearches();
    }

    // Filter tracks
    let filtered = tracks.filter((t) => {
      const title = (t.title || '').toLowerCase();
      const performer = (t.performer || '').toLowerCase();
      if (this.searchFilter === 'songs') return title.includes(q);
      if (this.searchFilter === 'artists') return performer.includes(q);
      return title.includes(q) || performer.includes(q);
    });

    if (filtered.length === 0) {
      this.dom.searchResultsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${Icons.search}</div>
          <div class="empty-title">No results found</div>
          <div class="empty-desc">We couldn't find any match for "${this.escapeHTML(q)}".</div>
        </div>
      `;
      return;
    }

    this.renderTrackListToContainer(filtered, this.dom.searchResultsContainer);
  },

  renderLibraryScreen() {
    const playlists = window.App.playlists || [];
    const favPl = playlists.find((p) => p.id === 'pl_favorites');
    const likedCount = favPl && Array.isArray(favPl.trackIds) ? favPl.trackIds.length : 0;

    const countEl = document.getElementById('lib-liked-count');
    if (countEl) countEl.textContent = `${likedCount} songs`;

    const container = document.getElementById('library-playlists-list');
    if (!container) return;

    // Filter out internal favorites playlist from custom playlists list
    const userPlaylists = playlists.filter((p) => p.id !== 'pl_favorites');

    let html = '';

    // Smart playlists row
    const smartPlaylists = [
      { id: 'smart_recent', name: '🕒 Recently Played', count: this.getRecentlyPlayedTracks().length },
      { id: 'smart_most', name: '🔥 Most Played', count: this.getMostPlayedTracks().length },
      { id: 'smart_new', name: '✨ Recently Added', count: this.getRecentlyAddedTracks().length }
    ];

    smartPlaylists.forEach((sp) => {
      html += `
        <div class="playlist-item-card" data-id="${sp.id}">
          <div class="playlist-item-artwork">
            ${Icons.playlist}
          </div>
          <div class="playlist-item-meta">
            <div class="playlist-item-name">${this.escapeHTML(sp.name)}</div>
            <div class="playlist-item-count">${sp.count} songs</div>
          </div>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--hint-color);"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </div>
      `;
    });

    // User custom playlists
    userPlaylists.forEach((pl) => {
      html += `
        <div class="playlist-item-card" data-id="${pl.id}">
          <div class="playlist-item-artwork" style="background: rgba(10, 132, 255, 0.15); color: var(--tg-blue);">
            ${Icons.playlist}
          </div>
          <div class="playlist-item-meta">
            <div class="playlist-item-name">${this.escapeHTML(pl.name)}</div>
            <div class="playlist-item-count">${pl.trackCount || 0} songs</div>
          </div>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--hint-color);"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </div>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.playlist-item-card').forEach((card) => {
      card.addEventListener('click', () => {
        const plId = card.dataset.id;
        window.TelegramBridge.haptic.impact('light');
        if (plId === 'smart_recent') {
          this.openPlaylistDetail({
            id: 'smart_recent',
            name: '🕒 Recently Played',
            isDefault: true,
            tracks: this.getRecentlyPlayedTracks()
          });
        } else if (plId === 'smart_most') {
          this.openPlaylistDetail({
            id: 'smart_most',
            name: '🔥 Most Played',
            isDefault: true,
            tracks: this.getMostPlayedTracks()
          });
        } else if (plId === 'smart_new') {
          this.openPlaylistDetail({
            id: 'smart_new',
            name: '✨ Recently Added',
            isDefault: true,
            tracks: this.getRecentlyAddedTracks()
          });
        } else {
          window.App.loadPlaylistDetails(plId);
        }
      });
    });
  },

  // =========================================================================
  // SUB-VIEWS: PLAYLIST DETAIL, DOWNLOADS, TELEGRAM, SETTINGS
  // =========================================================================

  openLikedSongsPlaylist() {
    const favPl = (window.App.playlists || []).find((p) => p.id === 'pl_favorites');
    const favTrackIds = new Set(favPl && Array.isArray(favPl.trackIds) ? favPl.trackIds : []);
    const tracks = (window.App.tracks || []).filter((t) => favTrackIds.has(t.id));

    this.openPlaylistDetail({
      id: 'pl_favorites',
      name: 'Liked Songs',
      isDefault: true,
      tracks: tracks
    });
  },

  playLikedSongs() {
    const favPl = (window.App.playlists || []).find((p) => p.id === 'pl_favorites');
    const favTrackIds = new Set(favPl && Array.isArray(favPl.trackIds) ? favPl.trackIds : []);
    const tracks = (window.App.tracks || []).filter((t) => favTrackIds.has(t.id));
    if (tracks.length > 0) {
      window.AudioEngine.setQueue(tracks, 0, true);
      this.showToast('▶ Playing Liked Songs');
    } else {
      this.showToast('No liked songs yet');
    }
  },

  renderPlaylistDetail(playlist) {
    this.openPlaylistDetail(playlist);
  },

  openPlaylistDetail(playlist) {
    this.activePlaylistId = playlist.id;
    this.openSubView('playlist-detail');

    const tracks = playlist.tracks || [];
    const isSmart = String(playlist.id).startsWith('smart_');
    const isFavorites = playlist.id === 'pl_favorites';

    const titleEl = document.getElementById('pl-detail-title');
    if (titleEl) titleEl.textContent = playlist.name;

    const navTitleEl = document.getElementById('pl-detail-nav-title');
    if (navTitleEl) navTitleEl.textContent = playlist.name;

    const subEl = document.getElementById('pl-detail-sub');
    if (subEl) {
      const totalSecs = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
      const totalMins = Math.round(totalSecs / 60);
      subEl.textContent = `${tracks.length} songs • ${totalMins} min`;
    }

    const deleteBtn = document.getElementById('btn-pl-delete');
    if (deleteBtn) {
      if (!isSmart && !isFavorites && !playlist.isDefault) {
        deleteBtn.style.display = 'flex';
        deleteBtn.onclick = () => this.confirmDeletePlaylist(playlist.id);
      } else {
        deleteBtn.style.display = 'none';
      }
    }

    // Play All FAB
    const playAllBtn = document.getElementById('btn-pl-play-all');
    if (playAllBtn) {
      playAllBtn.onclick = () => {
        if (tracks.length > 0) {
          window.TelegramBridge.haptic.impact('medium');
          window.AudioEngine.setQueue(tracks, 0, true);
        }
      };
    }

    // Add songs to playlist button
    const addSongsBtn = document.getElementById('btn-pl-add-songs');
    if (addSongsBtn) {
      if (!isSmart && !isFavorites) {
        addSongsBtn.style.display = 'flex';
        addSongsBtn.onclick = () => this.openAddTracksToPlaylistModal(playlist.id);
      } else {
        addSongsBtn.style.display = 'none';
      }
    }

    // Render tracks
    const tracksContainer = document.getElementById('pl-detail-tracks');
    if (tracksContainer) {
      if (tracks.length === 0) {
        tracksContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">${Icons.musicNote}</div>
            <div class="empty-title">This playlist is empty</div>
            <div class="empty-desc">Tap "Add" or use the heart icon on any song.</div>
          </div>
        `;
      } else {
        this.renderTrackListToContainer(tracks, tracksContainer, true, playlist.id);
      }
    }
  },

  openDownloadsView() {
    this.openSubView('downloads');
    this.updateStorageStats();

    const allTracks = window.App.tracks || [];
    const dlTracks = allTracks.filter((t) => this.downloadedFileIds.has(t.fileId));

    const container = document.getElementById('downloads-tracks-list');
    if (!container) return;

    if (dlTracks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${Icons.download}</div>
          <div class="empty-title">No offline tracks</div>
          <div class="empty-desc">Tap the download icon on any song to save it permanently to phone storage for zero-lag offline playback.</div>
        </div>
      `;
      return;
    }

    this.renderTrackListToContainer(dlTracks, container);
  },

  openFromTelegramView(source = 'all') {
    this.openSubView('telegram');
    const tracks = window.App.tracks || [];

    const totalCountEl = document.getElementById('tg-total-count');
    if (totalCountEl) totalCountEl.textContent = String(tracks.length);

    const container = document.getElementById('telegram-tracks-list');
    if (!container) return;

    if (tracks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${Icons.telegram}</div>
          <div class="empty-title">No Telegram audios yet</div>
          <div class="empty-desc">Forward music files, voice messages, or YouTube/Spotify links to your Telegram bot.</div>
        </div>
      `;
      return;
    }

    this.renderTrackListToContainer(tracks, container);
  },

  openSettingsView() {
    this.openSubView('settings');
    this.updateStorageStats();

    // Fill user info
    try {
      const user = window.TelegramBridge.user;
      const avatarEl = document.getElementById('settings-avatar');
      const nameEl = document.getElementById('settings-name');
      const handleEl = document.getElementById('settings-handle');

      if (user) {
        if (nameEl) nameEl.textContent = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Telegram User';
        if (handleEl) handleEl.textContent = user.username ? `@${user.username}` : `ID: ${user.id}`;
        if (avatarEl && user.photo_url) {
          avatarEl.innerHTML = `<img src="${user.photo_url}" alt="" />`;
        } else if (avatarEl && user.first_name) {
          avatarEl.textContent = user.first_name.charAt(0).toUpperCase();
        }
      }
    } catch (_) {}
  },

  // =========================================================================
  // UNIVERSAL TRACK LIST RENDERER
  // =========================================================================

  renderTracks(tracks) {
    // If on home, render home
    if (this.currentTab === 'home') {
      this.renderHomeScreen();
    } else if (this.currentTab === 'library') {
      this.renderLibraryScreen();
    } else if (this.currentTab === 'search') {
      this.renderSearchScreen();
    }
  },

  renderTrackListToContainer(tracks, container, isInsidePlaylist = false, playlistId = null) {
    const cur = window.AudioEngine.getCurrentTrack();
    const favPl = (window.App.playlists || []).find((p) => p.id === 'pl_favorites');
    const favTrackIds = new Set(favPl && Array.isArray(favPl.trackIds) ? favPl.trackIds : []);

    container.innerHTML = tracks.map((track, idx) => {
      const isPlayingThis = cur && cur.id === track.id;
      const isDownloaded = this.downloadedFileIds.has(track.fileId);
      const isLiked = favTrackIds.has(track.id);
      const isLargeFile = track.fileSize && track.fileSize > 20 * 1024 * 1024;
      const sizeBadge = isLargeFile ? '<span class="badge-large-file">>20MB</span>' : '';

      return `
        <div class="track-item ${isPlayingThis ? 'playing' : ''}" data-id="${track.id}" data-index="${idx}">
          <div class="track-artwork-badge">
            ${track.type === 'voice' ? Icons.mic : Icons.musicNote}
          </div>
          <div class="track-details">
            <div class="track-name">${this.escapeHTML(track.title)}</div>
            <div class="track-sub">
              <span>${this.escapeHTML(track.performer)}</span>
              <span class="dot-sep">•</span>
              <span>${this.formatTime(track.duration)}</span>
              ${sizeBadge}
            </div>
          </div>
          <div class="track-actions">
            <button class="track-action-btn fav-btn ${isLiked ? 'active' : ''}" data-id="${track.id}" title="Like">
              ${isLiked ? Icons.heart : Icons.heartOutline}
            </button>
            <button class="track-action-btn download-btn ${isDownloaded ? 'downloaded' : ''}" data-id="${track.id}" data-file-id="${track.fileId}" title="Download">
              ${isDownloaded ? Icons.check : Icons.download}
            </button>
            <button class="track-action-btn play-native" data-id="${track.id}" title="Play in Telegram">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
            ${isInsidePlaylist ? `
              <button class="track-action-btn pl-remove" data-id="${track.id}" title="Remove from playlist">
                ${Icons.close}
              </button>
            ` : `
              <button class="track-action-btn delete" data-id="${track.id}" title="Delete file">
                ${Icons.trash}
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');

    // Item click to play
    container.querySelectorAll('.track-item').forEach((item) => {
      item.addEventListener('click', async (e) => {
        if (e.target.closest('.track-actions')) return;
        const index = parseInt(item.dataset.index, 10);
        const clickedTrack = tracks[index];

        if (clickedTrack && clickedTrack.fileSize > 20 * 1024 * 1024) {
          window.TelegramBridge.haptic.impact('medium');
          this.showToast('⚡ File >20MB; playing directly via Telegram Cloud.');
          try {
            await window.ApiClient.playNative(clickedTrack.id);
          } catch (_) {}
          return;
        }

        window.TelegramBridge.haptic.impact('light');
        window.AudioEngine.setQueue(tracks, index, true);
      });
    });

    // Fav button
    container.querySelectorAll('.fav-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.toggleLikeTrack(btn.dataset.id, btn);
      });
    });

    // Download button
    container.querySelectorAll('.download-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const t = tracks.find((x) => x.id === btn.dataset.id);
        if (t) this.handleTrackDownload(t, btn);
      });
    });

    // Play native
    container.querySelectorAll('.play-native').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        window.TelegramBridge.haptic.impact('medium');
        this.showToast('Sending audio to Telegram chat...');
        try {
          await window.ApiClient.playNative(btn.dataset.id);
          this.showToast('✅ Sent to Telegram!');
        } catch (err) {
          this.showToast('❌ ' + (err.message || 'Failed'));
        }
      });
    });

    // Delete track
    container.querySelectorAll('.delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.confirmDeleteTrack(btn.dataset.id, false);
      });
    });

    // Remove from playlist
    if (isInsidePlaylist && playlistId) {
      container.querySelectorAll('.pl-remove').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          window.TelegramBridge.haptic.impact('light');
          await window.ApiClient.removeTrackFromPlaylist(playlistId, btn.dataset.id);
          window.App.loadPlaylistDetails(playlistId);
          this.showToast('Removed from playlist');
        });
      });
    }
  },

  // =========================================================================
  // DOWNLOAD & CACHE HANDLING
  // =========================================================================

  async handleTrackDownload(track, btn) {
    if (this.downloadedFileIds.has(track.fileId)) {
      this.confirmRemoveDownload(track);
      return;
    }

    btn.innerHTML = '<span style="font-size: 10px; font-weight: 800;">0%</span>';
    btn.classList.add('downloading');
    window.TelegramBridge.haptic.impact('light');

    try {
      await window.AudioCache.downloadTrack(track, (percent) => {
        btn.innerHTML = `<span style="font-size: 10px; font-weight: 800;">${percent}%</span>`;
        if (this.dom.btnDownloadExpanded) {
          const cur = window.AudioEngine.getCurrentTrack();
          if (cur && cur.id === track.id) {
            this.dom.btnDownloadExpanded.innerHTML = `${Icons.spinner} <span>${percent}%</span>`;
          }
        }
      });

      this.downloadedFileIds.add(track.fileId);
      btn.innerHTML = Icons.check;
      btn.classList.remove('downloading');
      btn.classList.add('downloaded');
      window.TelegramBridge.haptic.notification('success');
      this.showToast('✅ Saved to phone storage for offline playback');
      this.updateExpandedDownloadBtn();
      this.updateStorageStats();
    } catch (err) {
      btn.innerHTML = Icons.download;
      btn.classList.remove('downloading');
      window.TelegramBridge.haptic.notification('error');
      this.showToast('❌ ' + (err.message || 'Download error'));
    }
  },

  handleDownloadExpandedClick() {
    const cur = window.AudioEngine.getCurrentTrack();
    if (!cur) return;
    const listBtn = document.querySelector(`.download-btn[data-id="${cur.id}"]`);
    this.handleTrackDownload(cur, listBtn || this.dom.btnDownloadExpanded);
  },

  confirmRemoveDownload(track) {
    this.openModal(
      'Remove from Storage',
      '<p style="font-size: 14.5px; color: var(--apple-label-secondary); line-height: 1.5;">Delete offline copy from phone storage? (The file remains safe in your Telegram vault).</p>',
      `
        <button class="btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn-primary" id="modal-confirm-rm" style="background: var(--apple-destructive);">Delete Offline</button>
      `
    );

    document.getElementById('modal-cancel').onclick = () => this.closeModal();
    document.getElementById('modal-confirm-rm').onclick = async () => {
      try {
        if (window.AudioCache) {
          await window.AudioCache.delete(track.fileId);
        }
        this.downloadedFileIds.delete(track.fileId);
        this.closeModal();
        this.showToast('Offline copy deleted');
        this.updateExpandedDownloadBtn();
        this.updateStorageStats();
        if (this.activeSubView === 'downloads') {
          this.openDownloadsView();
        } else {
          this.renderTracks(window.App.tracks);
        }
      } catch (err) {
        this.closeModal();
        this.showToast('❌ Failed to delete');
      }
    };
  },

  confirmClearCache() {
    this.openModal(
      'Clear Storage Cache',
      '<p style="font-size: 14.5px; color: var(--apple-label-secondary); line-height: 1.5;">This will remove all downloaded music files from your phone memory. Your Telegram cloud files remain untouched.</p>',
      `
        <button class="btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn-primary" id="modal-clear-all" style="background: var(--apple-destructive);">Clear All</button>
      `
    );

    document.getElementById('modal-cancel').onclick = () => this.closeModal();
    document.getElementById('modal-clear-all').onclick = async () => {
      try {
        if (window.AudioCache && window.AudioCache.clear) {
          await window.AudioCache.clear();
        }
        this.downloadedFileIds.clear();
        this.closeModal();
        this.showToast('Storage cache cleared');
        this.updateStorageStats();
        if (this.activeSubView === 'downloads') this.openDownloadsView();
      } catch (err) {
        this.closeModal();
        this.showToast('❌ ' + err.message);
      }
    };
  },

  // =========================================================================
  // FAVORITES (LIKED SONGS) TOGGLE
  // =========================================================================

  async toggleLikeCurrentTrack() {
    const cur = window.AudioEngine.getCurrentTrack();
    if (cur) await this.toggleLikeTrack(cur.id, this.dom.btnLike);
  },

  async toggleLikeTrack(trackId, btn) {
    try {
      window.TelegramBridge.haptic.impact('light');
      let favPl = (window.App.playlists || []).find((p) => p.id === 'pl_favorites');

      if (!favPl) {
        favPl = await window.ApiClient.createPlaylist('Liked Songs');
      }

      const ids = new Set(Array.isArray(favPl.trackIds) ? favPl.trackIds : []);
      const isCurrentlyLiked = ids.has(trackId);

      if (isCurrentlyLiked) {
        await window.ApiClient.removeTrackFromPlaylist(favPl.id, trackId);
        ids.delete(trackId);
        this.showToast('Removed from Liked Songs');
      } else {
        await window.ApiClient.addTrackToPlaylist(favPl.id, trackId);
        ids.add(trackId);
        this.showToast('❤️ Added to Liked Songs');
      }

      favPl.trackIds = Array.from(ids);
      favPl.trackCount = ids.size;

      // Update UI button
      const newLikedState = !isCurrentlyLiked;
      if (btn) {
        btn.classList.toggle('active', newLikedState);
        btn.innerHTML = newLikedState ? Icons.heart : Icons.heartOutline;
      }

      // Update like button in expanded player if it matches
      const cur = window.AudioEngine.getCurrentTrack();
      if (cur && cur.id === trackId) {
        this.updateLikeButton(newLikedState);
      }

      // Update counters
      const qcLiked = document.getElementById('qc-liked-count');
      if (qcLiked) qcLiked.textContent = `${ids.size} songs`;
      const libLiked = document.getElementById('lib-liked-count');
      if (libLiked) libLiked.textContent = `${ids.size} songs`;
    } catch (err) {
      this.showToast('❌ ' + (err.message || 'Error updating favorites'));
    }
  },

  updateLikeButton(isLiked) {
    if (!this.dom.btnLike) return;
    this.dom.btnLike.classList.toggle('active', isLiked);
    this.dom.btnLike.innerHTML = isLiked ? Icons.heart : Icons.heartOutline;
  },

  updateExpandedDownloadBtn() {
    if (!this.dom.btnDownloadExpanded) return;
    const cur = window.AudioEngine.getCurrentTrack();
    if (!cur) return;
    const isDl = this.downloadedFileIds.has(cur.fileId);
    this.dom.btnDownloadExpanded.classList.toggle('active', isDl);
    this.dom.btnDownloadExpanded.innerHTML = `
      ${isDl ? Icons.check : Icons.download}
      <span>${isDl ? 'Downloaded' : 'Download'}</span>
    `;
  },

  updateRepeatButton(mode) {
    if (!this.dom.btnRepeat) return;
    if (mode === 'one') {
      this.dom.btnRepeat.innerHTML = Icons.repeatOne;
      this.dom.btnRepeat.classList.add('active');
    } else if (mode === 'all') {
      this.dom.btnRepeat.innerHTML = Icons.repeat;
      this.dom.btnRepeat.classList.add('active');
    } else {
      this.dom.btnRepeat.innerHTML = Icons.repeat;
      this.dom.btnRepeat.classList.remove('active');
    }
  },

  // =========================================================================
  // AUDIO ENGINE LISTENERS & GLOW
  // =========================================================================

  onTrackChange(track) {
    if (!track) return;
    this.recordTrackPlay(track);

    // Mini Player
    this.dom.miniPlayer.classList.remove('hidden');
    this.dom.miniTitle.textContent = track.title;
    this.dom.miniArtist.textContent = track.performer;

    // Artwork & Glow
    this.loadArtworkAndAmbience(track);

    // Expanded Player
    this.dom.expandedTitle.textContent = track.title;
    this.dom.expandedArtist.textContent = track.performer;
    this.dom.seekSlider.value = 0;
    this.dom.currentTimeLabel.textContent = '0:00';
    this.dom.totalTimeLabel.textContent = this.formatTime(track.duration || 0);

    // Highlight playing track in lists
    document.querySelectorAll('.track-item').forEach((el) => {
      el.classList.toggle('playing', el.dataset.id === track.id);
    });

    // Like state
    const favPl = (window.App.playlists || []).find((p) => p.id === 'pl_favorites');
    const isLiked = favPl && Array.isArray(favPl.trackIds) && favPl.trackIds.includes(track.id);
    this.updateLikeButton(isLiked);

    this.updateExpandedDownloadBtn();

    // Lyrics
    if (this.activePlayerPanel === 'panel-lyrics') {
      this.fetchAndRenderLyrics(track);
    } else {
      this.currentLyrics = null;
      this.activeLyricIndex = -1;
    }

    // Update Queue card
    if (this.activePlayerPanel === 'panel-queue') {
      this.renderQueuePanel();
    }
  },

  onBuffering(isBuffering) {
    if (isBuffering) {
      this.dom.miniPlayBtn.innerHTML = Icons.spinner;
      this.dom.btnPlay.innerHTML = Icons.spinner;
    } else {
      const isPlaying = window.AudioEngine.isPlaying;
      this.dom.miniPlayBtn.innerHTML = isPlaying ? Icons.pause : Icons.play;
      this.dom.btnPlay.innerHTML = isPlaying ? Icons.pause : Icons.play;
    }
  },

  onStateChange(isPlaying) {
    if (!window.AudioEngine.isBuffering) {
      this.dom.miniPlayBtn.innerHTML = isPlaying ? Icons.pause : Icons.play;
      this.dom.btnPlay.innerHTML = isPlaying ? Icons.pause : Icons.play;
    }
    this.dom.artworkCard.classList.toggle('playing', isPlaying);
  },

  onTimeUpdate(currentTime, duration, progress) {
    this.dom.miniProgress.style.width = `${progress}%`;
    this.dom.seekSlider.value = progress;
    this.dom.currentTimeLabel.textContent = this.formatTime(currentTime);
    if (duration > 0) {
      this.dom.totalTimeLabel.textContent = this.formatTime(duration);
    }
    if (this.activePlayerPanel === 'panel-lyrics') {
      this.syncLyricsTime(currentTime);
    }
  },

  // =========================================================================
  // DYNAMIC ARTWORK & AMBIENT GLOW EXTRACTION
  // =========================================================================

  getTrackVibrantColors(text) {
    let hash = 0;
    const str = text || 'music';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const palettes = [
      ['rgba(10, 132, 255, 0.45)', 'rgba(42, 171, 238, 0.25)'], // Telegram Blue
      ['rgba(191, 90, 242, 0.45)', 'rgba(255, 59, 92, 0.25)'],  // Purple & Pink
      ['rgba(48, 209, 88, 0.45)', 'rgba(100, 210, 255, 0.25)'],  // Green & Teal
      ['rgba(255, 159, 10, 0.45)', 'rgba(255, 55, 95, 0.25)'],   // Orange & Coral
      ['rgba(0, 199, 190, 0.45)', 'rgba(10, 132, 255, 0.25)']    // Cyan & Blue
    ];
    return palettes[Math.abs(hash) % palettes.length];
  },

  async loadArtworkAndAmbience(track) {
    if (!track) return;
    const [col1, col2] = this.getTrackVibrantColors((track.title || '') + (track.performer || ''));
    if (this.dom.ambientGlow) {
      this.dom.ambientGlow.style.background = `radial-gradient(circle at center, ${col1} 0%, ${col2} 55%, transparent 75%)`;
    }

    if (track.type === 'voice') {
      this.dom.artworkCard.innerHTML = `
        <div class="soundwave">
          <div class="soundwave-bar"></div>
          <div class="soundwave-bar"></div>
          <div class="soundwave-bar"></div>
          <div class="soundwave-bar"></div>
          <div class="soundwave-bar"></div>
        </div>
      `;
      this.dom.miniArtwork.innerHTML = Icons.mic;
      return;
    }

    try {
      const artData = await window.ApiClient.getArtwork(track.title, track.performer);
      if (artData && artData.artworkUrl) {
        const url = artData.artworkUrl;
        this.dom.artworkCard.innerHTML = `<img src="${url}" alt="" />`;
        this.dom.miniArtwork.innerHTML = `<img src="${url}" alt="" />`;

        // Refine ambient glow
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 16;
            canvas.height = 16;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 16, 16);
            const imgData = ctx.getImageData(0, 0, 16, 16).data;
            let r = 0, g = 0, b = 0, count = 0;
            for (let i = 0; i < imgData.length; i += 4) {
              const br = (imgData[i] + imgData[i + 1] + imgData[i + 2]) / 3;
              if (br > 25 && br < 235) {
                r += imgData[i];
                g += imgData[i + 1];
                b += imgData[i + 2];
                count++;
              }
            }
            if (count > 0 && this.dom.ambientGlow) {
              r = Math.round(r / count);
              g = Math.round(g / count);
              b = Math.round(b / count);
              this.dom.ambientGlow.style.background = `radial-gradient(circle at center, rgba(${r}, ${g}, ${b}, 0.55) 0%, transparent 75%)`;
            }
          } catch (_) {}
        };
        img.src = url;
      } else {
        this.dom.artworkCard.innerHTML = `
          <div class="soundwave">
            <div class="soundwave-bar"></div>
            <div class="soundwave-bar"></div>
            <div class="soundwave-bar"></div>
            <div class="soundwave-bar"></div>
            <div class="soundwave-bar"></div>
          </div>
        `;
        this.dom.miniArtwork.innerHTML = Icons.musicNote;
      }
    } catch (_) {
      this.dom.artworkCard.innerHTML = `
        <div class="soundwave">
          <div class="soundwave-bar"></div>
          <div class="soundwave-bar"></div>
          <div class="soundwave-bar"></div>
          <div class="soundwave-bar"></div>
          <div class="soundwave-bar"></div>
        </div>
      `;
      this.dom.miniArtwork.innerHTML = Icons.musicNote;
    }
  },

  // =========================================================================
  // SYNCED LYRICS (Apple Music Style)
  // =========================================================================

  parseLRC(lrcText) {
    if (!lrcText || typeof lrcText !== 'string') return null;
    const lines = lrcText.split(/\r?\n/);
    const parsed = [];
    const timeReg = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const matches = [...line.matchAll(timeReg)];
      if (matches.length > 0) {
        const text = line.replace(timeReg, '').trim();
        if (text) {
          for (const m of matches) {
            const mins = parseInt(m[1], 10);
            const secs = parseInt(m[2], 10);
            const millis = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0;
            parsed.push({ time: mins * 60 + secs + millis / 1000, text });
          }
        }
      }
    }
    if (parsed.length === 0) return null;
    return parsed.sort((a, b) => a.time - b.time);
  },

  async fetchAndRenderLyrics(track) {
    if (!track) return;
    this.dom.lyricsList.innerHTML = `
      <div class="lyric-empty">
        <div style="margin-bottom: 12px;">${Icons.spinner}</div>
        <div>Loading lyrics...</div>
      </div>
    `;

    try {
      const data = await window.ApiClient.getLyrics(track.title, track.performer);
      if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
        this.dom.lyricsList.innerHTML = '<div class="lyric-empty">Lyrics not available for this song.</div>';
        this.currentLyrics = null;
        return;
      }

      if (data.syncedLyrics) {
        const parsed = this.parseLRC(data.syncedLyrics);
        if (parsed && parsed.length > 0) {
          this.currentLyrics = parsed;
          this.activeLyricIndex = -1;
          this.dom.lyricsList.innerHTML = parsed.map((item, idx) => `
            <div class="lyric-line" data-index="${idx}" data-time="${item.time}">
              ${this.escapeHTML(item.text)}
            </div>
          `).join('');

          this.dom.lyricsList.querySelectorAll('.lyric-line').forEach((el) => {
            el.addEventListener('click', () => {
              const time = parseFloat(el.dataset.time);
              window.TelegramBridge.haptic.impact('light');
              window.AudioEngine.seekToTime(time);
            });
          });

          this.syncLyricsTime(window.AudioEngine.audio.currentTime || 0);
          return;
        }
      }

      if (data.plainLyrics) {
        this.currentLyrics = null;
        const plainLines = data.plainLyrics.split(/\r?\n/).filter((l) => l.trim().length > 0);
        this.dom.lyricsList.innerHTML = plainLines.map((l) => `
          <div class="lyric-line" style="color: #ffffff; opacity: 0.85; cursor: default;">
            ${this.escapeHTML(l)}
          </div>
        `).join('');
      }
    } catch (_) {
      this.dom.lyricsList.innerHTML = '<div class="lyric-empty">Lyrics not found.</div>';
      this.currentLyrics = null;
    }
  },

  syncLyricsTime(currentTime) {
    if (!this.currentLyrics || this.currentLyrics.length === 0) return;
    let targetIdx = -1;
    for (let i = 0; i < this.currentLyrics.length; i++) {
      if (this.currentLyrics[i].time <= currentTime + 0.25) {
        targetIdx = i;
      } else {
        break;
      }
    }

    if (targetIdx !== this.activeLyricIndex) {
      this.activeLyricIndex = targetIdx;
      const allLines = this.dom.lyricsList.querySelectorAll('.lyric-line');
      allLines.forEach((el, idx) => {
        el.classList.toggle('active', idx === targetIdx);
      });
      if (targetIdx >= 0 && allLines[targetIdx]) {
        allLines[targetIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  },

  // =========================================================================
  // SMART SLEEP TIMER
  // =========================================================================

  openSleepTimerModal() {
    const isRunning = !!this.sleepTimerEndTime || this.sleepTimerMode === 'end_of_track';
    const body = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button class="timer-opt-btn" data-minutes="15">⏱️ 15 Minutes</button>
        <button class="timer-opt-btn" data-minutes="30">⏱️ 30 Minutes</button>
        <button class="timer-opt-btn" data-minutes="45">⏱️ 45 Minutes</button>
        <button class="timer-opt-btn" data-minutes="60">⏱️ 60 Minutes (1 Hour)</button>
        <button class="timer-opt-btn" data-mode="end_of_track">🎵 End of Current Track</button>
        ${isRunning ? '<button class="timer-opt-btn" data-cancel="true" style="color: var(--apple-destructive); margin-top: 4px;">Turn Off Timer</button>' : ''}
      </div>
    `;

    this.openModal('Sleep Timer', body, '<button class="btn-secondary" id="modal-cancel">Cancel</button>');
    document.getElementById('modal-cancel').onclick = () => this.closeModal();

    document.querySelectorAll('.timer-opt-btn').forEach((btn) => {
      btn.onclick = () => {
        window.TelegramBridge.haptic.impact('medium');
        if (btn.dataset.cancel) {
          this.cancelSleepTimer();
          this.showToast('Sleep timer turned off');
        } else if (btn.dataset.mode === 'end_of_track') {
          this.startSleepTimerEndOfTrack();
        } else if (btn.dataset.minutes) {
          this.startSleepTimerMinutes(parseInt(btn.dataset.minutes, 10));
        }
        this.closeModal();
      };
    });
  },

  startSleepTimerMinutes(minutes) {
    this.cancelSleepTimer();
    const durationMs = minutes * 60 * 1000;
    this.sleepTimerEndTime = Date.now() + durationMs;
    this.sleepTimerMode = 'time';

    if (this.dom.btnSleep) this.dom.btnSleep.classList.add('timer-active');
    this.showToast(`🌙 Sleep timer set for ${minutes} minutes`);
    this.updateSleepTimerBadge();

    this.sleepTimerInterval = setInterval(() => this.updateSleepTimerBadge(), 1000);

    const fadeStartMs = Math.max(0, durationMs - 25000);
    this.sleepFadeTimeout = setTimeout(() => {
      window.AudioEngine.fadeVolume(0, 24000);
    }, fadeStartMs);

    this.sleepTimerTimeout = setTimeout(() => {
      this.triggerSleepTimerEnd();
    }, durationMs);
  },

  startSleepTimerEndOfTrack() {
    this.cancelSleepTimer();
    this.sleepTimerMode = 'end_of_track';
    if (this.dom.btnSleep) this.dom.btnSleep.classList.add('timer-active');
    if (this.dom.btnSleepText) this.dom.btnSleepText.textContent = 'End Track';
    this.showToast('🌙 Playback will stop at the end of this track');
  },

  updateSleepTimerBadge() {
    if (!this.sleepTimerEndTime || this.sleepTimerMode !== 'time') return;
    const remainingMs = this.sleepTimerEndTime - Date.now();
    if (remainingMs <= 0) {
      this.triggerSleepTimerEnd();
      return;
    }
    const remSecs = Math.ceil(remainingMs / 1000);
    const m = Math.floor(remSecs / 60);
    const s = remSecs % 60;
    const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;
    if (this.dom.btnSleepText) this.dom.btnSleepText.textContent = timeStr;
    const settingSleepSub = document.getElementById('setting-sleep-sub');
    if (settingSleepSub) settingSleepSub.textContent = `${timeStr} remaining`;
  },

  triggerSleepTimerEnd() {
    this.cancelSleepTimer();
    window.AudioEngine.stop();
    window.AudioEngine.setVolume(1.0);
    this.showToast('🌙 Sleep timer finished. Playback stopped.');
    window.TelegramBridge.haptic.notification('success');
  },

  cancelSleepTimer() {
    if (this.sleepTimerTimeout) clearTimeout(this.sleepTimerTimeout);
    if (this.sleepFadeTimeout) clearTimeout(this.sleepFadeTimeout);
    if (this.sleepTimerInterval) clearInterval(this.sleepTimerInterval);
    this.sleepTimerTimeout = null;
    this.sleepFadeTimeout = null;
    this.sleepTimerInterval = null;
    this.sleepTimerEndTime = null;
    this.sleepTimerMode = null;

    if (this.dom.btnSleep) this.dom.btnSleep.classList.remove('timer-active');
    if (this.dom.btnSleepText) this.dom.btnSleepText.textContent = 'Sleep';
    const settingSleepSub = document.getElementById('setting-sleep-sub');
    if (settingSleepSub) settingSleepSub.textContent = 'Off';
  },

  // =========================================================================
  // SCREEN 09: ADD TO PLAYLIST MODAL SHEET
  // =========================================================================

  async openAddToPlaylistModal(trackId) {
    const track = (window.App.tracks || []).find((t) => t.id === trackId);
    if (!track) return;

    const thumb = document.getElementById('add-pl-track-thumb');
    if (thumb) thumb.innerHTML = track.type === 'voice' ? Icons.mic : Icons.musicNote;
    const title = document.getElementById('add-pl-track-title');
    if (title) title.textContent = track.title;
    const artist = document.getElementById('add-pl-track-artist');
    if (artist) artist.textContent = track.performer;

    const playlists = (window.App.playlists || []).filter((p) => p.id !== 'pl_favorites');
    if (playlists.length === 0) {
      this.showToast('Please create a playlist first in Library');
      this.openCreatePlaylistModal();
      return;
    }

    const renderList = (filterText = '') => {
      const q = filterText.toLowerCase();
      const matched = playlists.filter((p) => (p.name || '').toLowerCase().includes(q));
      this.dom.addPlList.innerHTML = matched.map((pl) => {
        const hasTrack = Array.isArray(pl.trackIds) && pl.trackIds.includes(trackId);
        return `
          <div class="sheet-pl-item ${hasTrack ? 'selected' : ''}" data-id="${pl.id}">
            <div>
              <div class="sheet-pl-item-title">${this.escapeHTML(pl.name)}</div>
              <div class="sheet-pl-item-sub">${pl.trackCount || 0} songs</div>
            </div>
            ${hasTrack ? Icons.check : Icons.plus}
          </div>
        `;
      }).join('');

      this.dom.addPlList.querySelectorAll('.sheet-pl-item').forEach((item) => {
        item.onclick = async () => {
          const plId = item.dataset.id;
          const pl = playlists.find((p) => p.id === plId);
          if (!pl) return;
          window.TelegramBridge.haptic.impact('light');

          const hasTrack = Array.isArray(pl.trackIds) && pl.trackIds.includes(trackId);
          if (hasTrack) {
            await window.ApiClient.removeTrackFromPlaylist(plId, trackId);
            pl.trackIds = pl.trackIds.filter((id) => id !== trackId);
            pl.trackCount = Math.max(0, (pl.trackCount || 1) - 1);
            this.showToast(`Removed from ${pl.name}`);
          } else {
            await window.ApiClient.addTrackToPlaylist(plId, trackId);
            if (!pl.trackIds) pl.trackIds = [];
            pl.trackIds.push(trackId);
            pl.trackCount = (pl.trackCount || 0) + 1;
            this.showToast(`Added to ${pl.name}`);
          }
          renderList(this.dom.addPlSearchInput.value);
        };
      });
    };

    renderList('');

    this.dom.addPlSearchInput.oninput = (e) => {
      renderList(e.target.value);
    };

    this.dom.btnAddPlConfirm.onclick = () => {
      this.closeAddToPlaylistModal();
    };

    this.dom.modalAddToPlaylist.classList.add('active');
  },

  closeAddToPlaylistModal() {
    this.dom.modalAddToPlaylist.classList.remove('active');
  },

  openCreatePlaylistModal() {
    this.openModal(
      'New Playlist',
      '<input type="text" id="new-pl-name" class="modal-input" placeholder="Playlist Name (e.g. Focus, Chill, Cardio)..." autofocus />',
      `
        <button class="btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn-primary" id="modal-confirm-create">Create</button>
      `
    );

    const input = document.getElementById('new-pl-name');
    input?.focus();

    document.getElementById('modal-cancel').onclick = () => this.closeModal();
    document.getElementById('modal-confirm-create').onclick = async () => {
      const name = (input.value || '').trim();
      if (!name) return;
      try {
        await window.ApiClient.createPlaylist(name);
        this.closeModal();
        this.showToast(`Playlist "${name}" created`);
        await window.App.loadPlaylists();
        if (this.currentTab === 'library') this.renderLibraryScreen();
      } catch (err) {
        alert(err.message);
      }
    };
  },

  confirmDeleteTrack(trackId, isPlaylistView) {
    const isInsidePlaylist = isPlaylistView && window.UI.activePlaylistId;
    const title = isInsidePlaylist ? 'Remove from Playlist' : 'Delete Audio File';
    const msg = isInsidePlaylist
      ? 'Remove this file from the playlist? (File stays in vault).'
      : 'Delete this audio file completely from Telegram Audio Vault?';

    this.openModal(
      title,
      `<p style="font-size: 14.5px; line-height: 1.5; color: var(--apple-label-secondary);">${msg}</p>`,
      `
        <button class="btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn-primary" id="modal-delete-track" style="background: var(--apple-destructive);">${isInsidePlaylist ? 'Remove' : 'Delete'}</button>
      `
    );

    document.getElementById('modal-cancel').onclick = () => this.closeModal();
    document.getElementById('modal-delete-track').onclick = async () => {
      try {
        if (isInsidePlaylist) {
          await window.ApiClient.removeTrackFromPlaylist(window.UI.activePlaylistId, trackId);
          this.closeModal();
          this.showToast('Removed from playlist');
          window.App.loadPlaylistDetails(window.UI.activePlaylistId);
        } else {
          await window.ApiClient.deleteTrack(trackId);
          window.App.tracks = (window.App.tracks || []).filter((t) => t.id !== trackId);

          const cur = window.AudioEngine.getCurrentTrack();
          if (cur && cur.id === trackId) {
            window.AudioEngine.stop();
            this.dom.miniPlayer.classList.add('hidden');
          }

          this.closeModal();
          this.showToast('🗑️ File deleted');
          this.renderTracks(window.App.tracks);
        }
      } catch (err) {
        alert(err.message || 'Failed to delete');
      }
    };
  },

  confirmDeletePlaylist(playlistId) {
    this.openModal(
      'Delete Playlist',
      '<p style="font-size: 14.5px; color: var(--apple-label-secondary); line-height: 1.5;">Are you sure you want to delete this playlist? Your original audio files will remain safe in your vault.</p>',
      `
        <button class="btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn-primary" id="modal-delete-pl" style="background: var(--apple-destructive);">Delete Playlist</button>
      `
    );

    document.getElementById('modal-cancel').onclick = () => this.closeModal();
    document.getElementById('modal-delete-pl').onclick = async () => {
      try {
        await window.ApiClient.deletePlaylist(playlistId);
        this.closeModal();
        this.showToast('Playlist deleted');
        this.closeSubView();
        await window.App.loadPlaylists();
        this.renderLibraryScreen();
      } catch (err) {
        alert(err.message);
      }
    };
  },

  // =========================================================================
  // UTILITY HELPERS
  // =========================================================================

  openModal(title, bodyHtml, actionsHtml) {
    this.dom.modalTitle.textContent = title;
    this.dom.modalBody.innerHTML = bodyHtml;
    this.dom.modalActions.innerHTML = actionsHtml;
    this.dom.modalOverlay.classList.add('active');
  },

  closeModal() {
    this.dom.modalOverlay.classList.remove('active');
  },

  showToast(message) {
    this.dom.toast.textContent = message;
    this.dom.toast.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.dom.toast.classList.remove('show');
    }, 2200);
  },

  formatTime(sec = 0) {
    const s = Math.floor(sec);
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  },

  recordTrackPlay(track) {
    if (!track || !track.id) return;
    try {
      let recents = JSON.parse(localStorage.getItem('vault_recently_played') || '[]');
      recents = [track.id, ...recents.filter((id) => id !== track.id)].slice(0, 40);
      localStorage.setItem('vault_recently_played', JSON.stringify(recents));

      const counts = JSON.parse(localStorage.getItem('vault_play_counts') || '{}');
      counts[track.id] = (counts[track.id] || 0) + 1;
      localStorage.setItem('vault_play_counts', JSON.stringify(counts));
    } catch (_) {}
  },

  getRecentlyPlayedTracks() {
    try {
      const parsed = JSON.parse(localStorage.getItem('vault_recently_played') || '[]');
      const ids = Array.isArray(parsed) ? parsed : [];
      const allTracks = window.App.tracks || [];
      const trackMap = new Map(allTracks.map((t) => [t.id, t]));
      return ids.map((id) => trackMap.get(id)).filter(Boolean);
    } catch (_) {
      return [];
    }
  },

  getMostPlayedTracks() {
    try {
      const parsed = JSON.parse(localStorage.getItem('vault_play_counts') || '{}');
      const counts = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
      const allTracks = window.App.tracks || [];
      return allTracks
        .filter((t) => counts[t.id] > 0)
        .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
    } catch (_) {
      return [];
    }
  },

  getRecentlyAddedTracks() {
    const allTracks = [...(window.App.tracks || [])];
    return allTracks.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  },

  escapeHTML(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

window.UI = UI;
