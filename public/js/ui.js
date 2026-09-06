/**
 * UI Controller & DOM Renderer
 * Manages views, modals, drawer transitions, and responsive state
 */

const UI = {
  currentTab: 'tracks', // 'tracks' | 'playlists'
  activePlaylistId: null,
  isExpandedOpen: false,
  downloadedFileIds: new Set(),

  // Initialize UI references and event hooks
  init() {
    this.bindDOM();
    this.bindEvents();
    this.syncDownloadedTracks();
  },

  async syncDownloadedTracks() {
    if (window.AudioCache && window.AudioCache.getAllKeys) {
      try {
        const keys = await window.AudioCache.getAllKeys();
        this.downloadedFileIds = new Set(keys);
      } catch (_) {}
    }
  },

  bindDOM() {
    this.dom = {
      app: document.getElementById('app'),
      tracksTab: document.getElementById('tab-tracks'),
      playlistsTab: document.getElementById('tab-playlists'),
      searchContainer: document.getElementById('search-container'),
      searchInput: document.getElementById('search-input'),
      searchClear: document.getElementById('search-clear'),
      contentView: document.getElementById('content-view'),
      
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
      btnQueue: document.getElementById('btn-queue'),
      btnLike: document.getElementById('btn-like'),
      btnDownloadExpanded: document.getElementById('btn-download-expanded'),
      btnPlayNative: document.getElementById('btn-play-native'),
      btnAddToPl: document.getElementById('btn-add-to-pl'),

      // Modals & Toast
      modalOverlay: document.getElementById('modal-overlay'),
      modalTitle: document.getElementById('modal-title'),
      modalBody: document.getElementById('modal-body'),
      modalActions: document.getElementById('modal-actions'),
      toast: document.getElementById('toast-msg')
    };
  },

  bindEvents() {
    // Tab Switching
    this.dom.tracksTab.addEventListener('click', () => {
      window.TelegramBridge.haptic.selection();
      this.switchTab('tracks');
    });

    this.dom.playlistsTab.addEventListener('click', () => {
      window.TelegramBridge.haptic.selection();
      this.switchTab('playlists');
    });

    // Search
    this.dom.searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      this.dom.searchClear.classList.toggle('visible', val.length > 0);
      window.App.handleSearch(val);
    });

    this.dom.searchClear.addEventListener('click', () => {
      this.dom.searchInput.value = '';
      this.dom.searchClear.classList.remove('visible');
      window.App.handleSearch('');
    });

    // Mini Player Open
    this.dom.miniPlayer.addEventListener('click', (e) => {
      // Don't open sheet if play/next button clicked directly
      if (e.target.closest('#mini-play-btn') || e.target.closest('#mini-next-btn')) {
        return;
      }
      this.openExpandedPlayer();
    });

    // Mini Player Controls
    this.dom.miniPlayBtn.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      window.AudioEngine.togglePlay();
    });

    this.dom.miniNextBtn.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      window.AudioEngine.next();
    });

    // Expanded Player Close
    this.dom.expandedCloseBtn.addEventListener('click', () => {
      this.closeExpandedPlayer();
    });

    // Expanded Player Controls
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
      this.showToast(isShuffle ? 'پخش تصادفی روشن' : 'پخش تصادفی خاموش');
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
      this.showToast(`سرعت پخش: ${rate}x`);
    });

    this.dom.btnAddToPl.addEventListener('click', () => {
      const track = window.AudioEngine.getCurrentTrack();
      if (track) {
        this.openAddToPlaylistModal(track.id);
      }
    });

    if (this.dom.btnLike) {
      this.dom.btnLike.addEventListener('click', () => {
        this.toggleLikeCurrentTrack();
      });
    }

    if (this.dom.btnQueue) {
      this.dom.btnQueue.addEventListener('click', () => {
        this.openQueueModal();
      });
    }

    if (this.dom.btnDownloadExpanded) {
      this.dom.btnDownloadExpanded.addEventListener('click', async () => {
        const track = window.AudioEngine.getCurrentTrack();
        if (!track) return;

        const isDownloaded = this.downloadedFileIds.has(track.fileId);
        if (isDownloaded) {
          this.confirmRemoveDownload(track);
          return;
        }

        this.dom.btnDownloadExpanded.innerHTML = `
          ${Icons.spinner}
          <span>0%</span>
        `;
        window.TelegramBridge.haptic.impact('light');

        const listBtn = document.querySelector(`.download-btn[data-file-id="${track.fileId}"]`);
        if (listBtn) {
          listBtn.innerHTML = `<span style="font-size: 10px; font-weight: 800;">0%</span>`;
          listBtn.classList.add('downloading');
        }

        try {
          await window.AudioCache.downloadTrack(track, (percent) => {
            this.dom.btnDownloadExpanded.innerHTML = `
              ${Icons.spinner}
              <span>${percent}%</span>
            `;
            if (listBtn) {
              listBtn.innerHTML = `<span style="font-size: 10px; font-weight: 800;">${percent}%</span>`;
            }
          });

          this.downloadedFileIds.add(track.fileId);
          window.TelegramBridge.haptic.notification('success');
          this.showToast('✅ با موفقیت در حافظه گوشی ذخیره شد (پخش فوری و آفلاین)');
          this.updateExpandedDownloadBtn();

          if (listBtn) {
            listBtn.innerHTML = Icons.check;
            listBtn.classList.remove('downloading');
            listBtn.classList.add('downloaded');
            listBtn.title = 'ذخیره شده در حافظه گوشی (پخش آفلاین)';
          }
        } catch (err) {
          this.updateExpandedDownloadBtn();
          if (listBtn) {
            listBtn.innerHTML = Icons.download;
            listBtn.classList.remove('downloading');
          }
          window.TelegramBridge.haptic.notification('error');
          this.showToast('❌ ' + (err.message || 'خطا در دانلود'));
        }
      });
    }

    if (this.dom.btnPlayNative) {
      this.dom.btnPlayNative.addEventListener('click', async () => {
        const track = window.AudioEngine.getCurrentTrack();
        if (!track) return;
        window.TelegramBridge.haptic.impact('medium');
        this.showToast('در حال ارسال به چت تلگرام...');
        try {
          await window.ApiClient.playNative(track.id);
          this.showToast('✅ فایل به تلگرام ارسال شد! بدون دانلود پلی کنید.');
        } catch (err) {
          this.showToast('❌ خطا در ارسال: ' + (err.message || 'ناموفق'));
        }
      });
    }

    // Seek Slider
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

    // Close modal on background click
    this.dom.modalOverlay.addEventListener('click', (e) => {
      if (e.target === this.dom.modalOverlay) {
        this.closeModal();
      }
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

  switchTab(tab) {
    this.currentTab = tab;
    this.dom.tracksTab.classList.toggle('active', tab === 'tracks');
    this.dom.playlistsTab.classList.toggle('active', tab === 'playlists');

    if (tab === 'tracks') {
      this.dom.searchContainer.style.display = 'block';
      this.activePlaylistId = null;
      window.App.loadTracks();
    } else {
      this.dom.searchContainer.style.display = 'none';
      window.App.loadPlaylists();
    }
  },

  openExpandedPlayer() {
    this.isExpandedOpen = true;
    this.dom.expandedPlayer.classList.add('open');
    window.TelegramBridge.haptic.impact('medium');

    // Telegram native back button dismisses sheet
    window.TelegramBridge.backButton.show(() => {
      this.closeExpandedPlayer();
    });
  },

  closeExpandedPlayer() {
    this.isExpandedOpen = false;
    this.dom.expandedPlayer.classList.remove('open');
    window.TelegramBridge.haptic.impact('light');

    if (this.activePlaylistId) {
      window.TelegramBridge.backButton.show(() => {
        this.switchTab('playlists');
      });
    } else {
      window.TelegramBridge.backButton.hide();
    }
  },

  onTrackChange(track) {
    if (!track) return;

    // Show Mini Player
    this.dom.miniPlayer.classList.remove('hidden');
    this.dom.miniTitle.textContent = track.title;
    this.dom.miniArtist.textContent = track.performer;

    // Mini Artwork icon (voice vs audio)
    this.dom.miniArtwork.innerHTML = track.type === 'voice' ? Icons.mic : Icons.musicNote;

    // Expanded Player
    this.dom.expandedTitle.textContent = track.title;
    this.dom.expandedArtist.textContent = track.performer;
    this.dom.seekSlider.value = 0;
    this.dom.currentTimeLabel.textContent = '0:00';
    this.dom.totalTimeLabel.textContent = this.formatTime(track.duration || 0);

    // Update highlight in list
    document.querySelectorAll('.track-item').forEach((el) => {
      el.classList.toggle('playing', el.dataset.id === track.id);
    });

    // Update Like button state
    const favPl = (window.App.playlists || []).find((p) => p.id === 'pl_favorites');
    const isLiked = favPl && Array.isArray(favPl.trackIds) && favPl.trackIds.includes(track.id);
    this.updateLikeButton(isLiked);

    // Update Download button state in expanded player
    this.updateExpandedDownloadBtn();
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
      // Mini play button
      this.dom.miniPlayBtn.innerHTML = isPlaying ? Icons.pause : Icons.play;

      // Expanded play button
      this.dom.btnPlay.innerHTML = isPlaying ? Icons.pause : Icons.play;
    }

    // Artwork animation & soundwave
    this.dom.artworkCard.classList.toggle('playing', isPlaying);
  },

  onTimeUpdate(currentTime, duration, progress) {
    this.dom.miniProgress.style.width = `${progress}%`;
    this.dom.seekSlider.value = progress;
    this.dom.currentTimeLabel.textContent = this.formatTime(currentTime);
    if (duration > 0) {
      this.dom.totalTimeLabel.textContent = this.formatTime(duration);
    }
  },

  updateRepeatButton(mode) {
    if (mode === 'off') {
      this.dom.btnRepeat.innerHTML = Icons.repeat;
      this.dom.btnRepeat.classList.remove('active');
      this.showToast('تکرار خاموش');
    } else if (mode === 'all') {
      this.dom.btnRepeat.innerHTML = Icons.repeat;
      this.dom.btnRepeat.classList.add('active');
      this.showToast('تکرار همه ترک‌ها');
    } else if (mode === 'one') {
      this.dom.btnRepeat.innerHTML = Icons.repeatOne;
      this.dom.btnRepeat.classList.add('active');
      this.showToast('تکرار ترک فعلی');
    }
  },

  async toggleLikeTrack(trackId, btnElement = null) {
    if (!trackId) return;
    window.TelegramBridge.haptic.impact('medium');

    let favPl = (window.App.playlists || []).find((p) => p.id === 'pl_favorites' || p.isDefault);
    if (!favPl) {
      favPl = { id: 'pl_favorites', name: 'موردعلاقه‌ها', isDefault: true, trackIds: [] };
      if (!Array.isArray(window.App.playlists)) window.App.playlists = [];
      window.App.playlists.push(favPl);
    }

    if (!Array.isArray(favPl.trackIds)) favPl.trackIds = [];
    const isCurrentlyLiked = favPl.trackIds.includes(trackId);

    if (isCurrentlyLiked) {
      favPl.trackIds = favPl.trackIds.filter((id) => id !== trackId);
      if (btnElement) {
        btnElement.classList.remove('active');
        btnElement.innerHTML = Icons.heartOutline;
        btnElement.title = 'افزودن به موردعلاقه‌ها';
      }
      this.showToast('از موردعلاقه‌ها حذف شد');
      const cur = window.AudioEngine.getCurrentTrack();
      if (cur && cur.id === trackId) {
        this.updateLikeButton(false);
      }
      try {
        await window.ApiClient.removeTrackFromPlaylist(favPl.id, trackId);
      } catch (err) {
        console.error('Like toggle error:', err);
      }
    } else {
      favPl.trackIds.push(trackId);
      if (btnElement) {
        btnElement.classList.add('active');
        btnElement.innerHTML = Icons.heart;
        btnElement.title = 'حذف از موردعلاقه‌ها';
        btnElement.style.animation = 'none';
        btnElement.offsetHeight; // trigger reflow
        btnElement.style.animation = 'appleHeartPop 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.2)';
      }
      this.showToast('به موردعلاقه‌ها اضافه شد ❤️');
      const cur = window.AudioEngine.getCurrentTrack();
      if (cur && cur.id === trackId) {
        this.updateLikeButton(true);
      }
      try {
        await window.ApiClient.addTrackToPlaylist(favPl.id, trackId);
      } catch (err) {
        console.error('Like toggle error:', err);
      }
    }
  },

  async toggleLikeCurrentTrack() {
    const track = window.AudioEngine.getCurrentTrack();
    if (!track) return;
    const listBtn = this.dom.contentView.querySelector(`.fav-btn[data-id="${track.id}"]`);
    await this.toggleLikeTrack(track.id, listBtn);
  },

  updateLikeButton(isLiked) {
    if (!this.dom.btnLike) return;
    this.dom.btnLike.classList.toggle('liked', !!isLiked);
    this.dom.btnLike.innerHTML = isLiked ? Icons.heart : Icons.heartOutline;
  },

  updateExpandedDownloadBtn() {
    if (!this.dom.btnDownloadExpanded) return;
    const currentTrack = window.AudioEngine.getCurrentTrack();
    if (!currentTrack) return;

    const isDownloaded = this.downloadedFileIds.has(currentTrack.fileId);
    if (isDownloaded) {
      this.dom.btnDownloadExpanded.classList.add('downloaded');
      this.dom.btnDownloadExpanded.innerHTML = `
        ${Icons.check}
        <span>دانلود شده</span>
      `;
      this.dom.btnDownloadExpanded.title = 'ذخیره در حافظه گوشی (برای مدیریت کلیک کنید)';
    } else {
      this.dom.btnDownloadExpanded.classList.remove('downloaded');
      this.dom.btnDownloadExpanded.innerHTML = `
        ${Icons.download}
        <span>دانلود آفلاین</span>
      `;
      this.dom.btnDownloadExpanded.title = 'دانلود و ذخیره دائمی در حافظه گوشی';
    }
  },

  confirmRemoveDownload(track) {
    this.openModal(
      'مدیریت حافظه آفلاین',
      `<p style="font-size: 14px; line-height: 1.6; color: var(--text-color); text-align: center;">
        فایل <b>«${this.escapeHTML(track.title)}»</b> در حافظه داخلی گوشی شما ذخیره است.<br/>
        آیا می‌خواهید این فایل را از حافظه آفلاین گوشی پاک کنید؟
      </p>`,
      `
        <button class="btn btn-secondary" id="modal-cancel">انصراف</button>
        <button class="btn btn-danger" id="modal-confirm-delete-dl">حذف فایل آفلاین</button>
      `
    );

    document.getElementById('modal-cancel').addEventListener('click', () => this.closeModal());
    document.getElementById('modal-confirm-delete-dl').addEventListener('click', async () => {
      await window.AudioCache.delete(track.fileId);
      this.downloadedFileIds.delete(track.fileId);
      this.closeModal();
      window.TelegramBridge.haptic.notification('success');
      this.showToast('فایل از حافظه آفلاین گوشی حذف شد.');

      const listBtn = document.querySelector(`.download-btn[data-file-id="${track.fileId}"]`);
      if (listBtn) {
        listBtn.innerHTML = Icons.download;
        listBtn.classList.remove('downloaded');
        listBtn.title = 'دانلود و ذخیره دائمی در گوشی';
      }
      this.updateExpandedDownloadBtn();
    });
  },

  openQueueModal() {
    const queue = window.AudioEngine.queue || [];
    const currentIdx = window.AudioEngine.currentIndex;

    if (queue.length === 0) {
      this.showToast('صف پخش خالی است');
      return;
    }

    let listHtml = '<div class="queue-list" style="max-height: 55vh; overflow-y: auto; padding-top: 4px;">';
    queue.forEach((t, idx) => {
      const isCurrent = idx === currentIdx;
      listHtml += `
        <div class="track-item ${isCurrent ? 'playing' : ''}" onclick="window.AudioEngine.currentIndex = ${idx}; window.AudioEngine.loadCurrentTrack(true); window.UI.closeModal();" style="cursor: pointer; padding: 10px 12px; border-radius: 12px; margin-bottom: 6px; display: flex; align-items: center; gap: 12px; background: ${isCurrent ? 'var(--secondary-bg-color)' : 'transparent'};">
          <div style="font-size: 13px; font-weight: 700; color: ${isCurrent ? 'var(--button-color)' : 'var(--hint-color)'}; width: 22px; text-align: center;">
            ${isCurrent ? '▶' : idx + 1}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 14px; font-weight: 600; color: var(--text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHTML(t.title)}</div>
            <div style="font-size: 12px; color: var(--hint-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHTML(t.performer)}</div>
          </div>
          <div style="font-size: 12px; color: var(--hint-color); font-variant-numeric: tabular-nums;">
            ${this.formatTime(t.duration || 0)}
          </div>
        </div>
      `;
    });
    listHtml += '</div>';

    this.showModal('صف پخش در حال اجرا', listHtml, []);
  },

  // Render Track List
  renderTracks(tracks, isPlaylistView = false) {
    if (!tracks || tracks.length === 0) {
      this.dom.contentView.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${Icons.musicNote}</div>
          <div class="empty-title">صندوقچه صوتی خالی است</div>
          <div class="empty-desc">برای افزودن فایل، کافیست هر آهنگ، پادکست یا وویسی را در چت ربات تلگرام ارسال یا فوروارد کنید.</div>
        </div>
      `;
      return;
    }

    const currentTrack = window.AudioEngine.getCurrentTrack();

    const favPl = (window.App.playlists || []).find((p) => p.id === 'pl_favorites' || p.isDefault);
    const favTrackIds = new Set(favPl && Array.isArray(favPl.trackIds) ? favPl.trackIds : []);

    const html = tracks.map((track, idx) => {
      const isPlayingThis = currentTrack && currentTrack.id === track.id;
      const durationStr = this.formatTime(track.duration);
      const icon = track.type === 'voice' ? Icons.mic : Icons.musicNote;
      const isDownloaded = this.downloadedFileIds.has(track.fileId);
      const dlIcon = isDownloaded ? Icons.check : Icons.download;
      const dlClass = isDownloaded ? 'downloaded' : '';
      const dlTitle = isDownloaded ? 'ذخیره شده در حافظه گوشی (پخش آفلاین)' : 'دانلود و ذخیره دائمی در حافظه گوشی';

      const isLiked = favTrackIds.has(track.id);
      const favClass = isLiked ? 'active' : '';
      const favIcon = isLiked ? Icons.heart : Icons.heartOutline;
      const favTitle = isLiked ? 'حذف از موردعلاقه‌ها' : 'افزودن به موردعلاقه‌ها';

      return `
        <div class="track-item ${isPlayingThis ? 'playing' : ''}" data-id="${track.id}" data-index="${idx}">
          <div class="track-artwork-badge">${icon}</div>
          <div class="track-details">
            <div class="track-name">${this.escapeHTML(track.title)}</div>
            <div class="track-sub">
              <span>${this.escapeHTML(track.performer)}</span>
              <span class="dot-sep">•</span>
              <span>${durationStr}</span>
            </div>
          </div>
          <div class="track-actions">
            <button class="track-action-btn fav-btn ${favClass}" data-id="${track.id}" title="${favTitle}">
              ${favIcon}
            </button>
            <button class="track-action-btn download-btn ${dlClass}" data-id="${track.id}" data-file-id="${track.fileId}" title="${dlTitle}">
              ${dlIcon}
            </button>
            <button class="track-action-btn play-native" data-id="${track.id}" title="ارسال به چت تلگرام (پخش فوری)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
            <button class="track-action-btn delete" data-id="${track.id}" title="حذف فایل">
              ${Icons.trash}
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.dom.contentView.innerHTML = html;

    // Bind item clicks
    this.dom.contentView.querySelectorAll('.track-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.track-actions')) return;
        const index = parseInt(item.dataset.index, 10);
        window.TelegramBridge.haptic.impact('light');
        window.AudioEngine.setQueue(tracks, index, true);
      });
    });

    // Bind Favorite (Heart) Toggle
    this.dom.contentView.querySelectorAll('.fav-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const trackId = btn.dataset.id;
        await this.toggleLikeTrack(trackId, btn);
      });
    });

    // Bind Download to Phone Storage
    this.dom.contentView.querySelectorAll('.download-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const trackId = btn.dataset.id;
        const track = tracks.find((t) => t.id === trackId);
        if (!track) return;

        const isDownloaded = this.downloadedFileIds.has(track.fileId);
        if (isDownloaded) {
          this.confirmRemoveDownload(track);
          return;
        }

        // Start download
        btn.innerHTML = `<span style="font-size: 10px; font-weight: 800;">0%</span>`;
        btn.classList.add('downloading');
        window.TelegramBridge.haptic.impact('light');

        try {
          await window.AudioCache.downloadTrack(track, (percent) => {
            btn.innerHTML = `<span style="font-size: 10px; font-weight: 800;">${percent}%</span>`;
            if (this.dom.btnDownloadExpanded) {
              const cur = window.AudioEngine.getCurrentTrack();
              if (cur && cur.id === track.id) {
                this.dom.btnDownloadExpanded.innerHTML = `
                  ${Icons.spinner}
                  <span>${percent}%</span>
                `;
              }
            }
          });

          this.downloadedFileIds.add(track.fileId);
          btn.innerHTML = Icons.check;
          btn.classList.remove('downloading');
          btn.classList.add('downloaded');
          btn.title = 'ذخیره شده در حافظه گوشی (پخش آفلاین)';
          window.TelegramBridge.haptic.notification('success');
          this.showToast('✅ با موفقیت در حافظه گوشی ذخیره شد (پخش فوری و آفلاین)');
          this.updateExpandedDownloadBtn();
        } catch (err) {
          btn.innerHTML = Icons.download;
          btn.classList.remove('downloading');
          window.TelegramBridge.haptic.notification('error');
          this.showToast('❌ ' + (err.message || 'خطا در دانلود'));
        }
      });
    });

    // Bind Play Native in Telegram
    this.dom.contentView.querySelectorAll('.play-native').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        window.TelegramBridge.haptic.impact('medium');
        this.showToast('در حال ارسال به چت تلگرام...');
        try {
          await window.ApiClient.playNative(btn.dataset.id);
          this.showToast('✅ فایل به تلگرام ارسال شد! بدون دانلود پلی کنید.');
        } catch (err) {
          this.showToast('❌ خطا در ارسال: ' + (err.message || 'ناموفق'));
        }
      });
    });

    // Bind Delete Track
    this.dom.contentView.querySelectorAll('.delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.TelegramBridge.haptic.notification('warning');
        this.confirmDeleteTrack(btn.dataset.id, isPlaylistView);
      });
    });
  },

  // Render Playlists Grid
  renderPlaylists(playlists) {
    const headerHtml = `
      <div class="playlist-header-row">
        <span style="font-weight: 700; font-size: 16px;">پلی‌لیست‌های شخصی</span>
        <button class="chip-btn" id="btn-create-pl">
          ${Icons.plus}
          <span>پلی‌لیست جدید</span>
        </button>
      </div>
    `;

    if (!playlists || playlists.length === 0) {
      this.dom.contentView.innerHTML = `
        ${headerHtml}
        <div class="empty-state">
          <div class="empty-icon">${Icons.playlist}</div>
          <div class="empty-title">پلی‌لیستی وجود ندارد</div>
          <div class="empty-desc">می‌توانید آهنگ‌های دلخواهتان را در پلی‌لیست‌های اختصاصی سازماندهی کنید.</div>
        </div>
      `;
    } else {
      const cards = playlists.map((pl) => `
        <div class="playlist-card" data-id="${pl.id}">
          <div class="playlist-card-icon">${Icons.playlist}</div>
          <div>
            <div class="playlist-card-name">${this.escapeHTML(pl.name)}</div>
            <div class="playlist-card-count">${pl.trackCount} ترَک</div>
          </div>
        </div>
      `).join('');

      this.dom.contentView.innerHTML = `${headerHtml}<div class="playlist-grid">${cards}</div>`;
    }

    // Bind Create Playlist
    document.getElementById('btn-create-pl')?.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      this.openCreatePlaylistModal();
    });

    // Bind Playlist Clicks
    this.dom.contentView.querySelectorAll('.playlist-card').forEach((card) => {
      card.addEventListener('click', () => {
        window.TelegramBridge.haptic.impact('light');
        window.App.loadPlaylistDetails(card.dataset.id);
      });
    });
  },

  // Render Playlist Detail View
  renderPlaylistDetail(playlist) {
    this.activePlaylistId = playlist.id;

    const detailHeader = `
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <button class="icon-btn" id="pl-back-btn">${Icons.chevronDown}</button>
        <div style="flex: 1;">
          <h2 style="font-size: 18px; font-weight: 700;">${this.escapeHTML(playlist.name)}</h2>
          <span style="font-size: 12px; color: var(--hint-color);">${playlist.tracks.length} ترَک</span>
        </div>
        ${!playlist.isDefault ? `
          <button class="icon-btn" id="pl-delete-btn" style="color: var(--destructive-color);" title="حذف پلی‌لیست">
            ${Icons.trash}
          </button>
        ` : ''}
      </div>
    `;

    this.dom.contentView.innerHTML = detailHeader + `<div id="pl-tracks-container"></div>`;

    document.getElementById('pl-back-btn')?.addEventListener('click', () => {
      window.TelegramBridge.haptic.impact('light');
      this.switchTab('playlists');
    });

    document.getElementById('pl-delete-btn')?.addEventListener('click', () => {
      this.confirmDeletePlaylist(playlist.id);
    });

    // Telegram Back button triggers back to playlists
    window.TelegramBridge.backButton.show(() => {
      this.switchTab('playlists');
    });

    // Render tracks inside playlist
    const tracksContainer = document.getElementById('pl-tracks-container');
    if (!playlist.tracks || playlist.tracks.length === 0) {
      tracksContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${Icons.musicNote}</div>
          <div class="empty-title">این پلی‌لیست خالی است</div>
          <div class="empty-desc">از تب «همه فایل‌ها»، روی علامت + کنار ترک‌ها کلیک کنید تا به اینجا اضافه شوند.</div>
        </div>
      `;
    } else {
      const html = playlist.tracks.map((track, idx) => {
        const isDownloaded = this.downloadedFileIds.has(track.fileId);
        const dlIcon = isDownloaded ? Icons.check : Icons.download;
        const dlClass = isDownloaded ? 'downloaded' : '';
        const dlTitle = isDownloaded ? 'ذخیره شده در حافظه گوشی (پخش آفلاین)' : 'دانلود و ذخیره دائمی در حافظه گوشی';

        return `
          <div class="track-item" data-id="${track.id}" data-index="${idx}">
            <div class="track-artwork-badge">${track.type === 'voice' ? Icons.mic : Icons.musicNote}</div>
            <div class="track-details">
              <div class="track-name">${this.escapeHTML(track.title)}</div>
              <div class="track-sub">
                <span>${this.escapeHTML(track.performer)}</span>
                <span>•</span>
                <span>${this.formatTime(track.duration)}</span>
              </div>
            </div>
            <div class="track-actions">
              <button class="track-action-btn download-btn ${dlClass}" data-id="${track.id}" data-file-id="${track.fileId}" title="${dlTitle}">
                ${dlIcon}
              </button>
              <button class="track-action-btn play-native" data-id="${track.id}" title="ارسال به چت تلگرام (پخش فوری در پلیر تلگرام بدون دانلود)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>
              <button class="track-action-btn pl-remove-track" data-track-id="${track.id}" title="حذف از پلی‌لیست">
                ${Icons.close}
              </button>
            </div>
          </div>
        `;
      }).join('');

      tracksContainer.innerHTML = html;

      // Click to play from playlist queue
      tracksContainer.querySelectorAll('.track-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.track-actions')) return;
          const index = parseInt(item.dataset.index, 10);
          window.TelegramBridge.haptic.impact('light');
          window.AudioEngine.setQueue(playlist.tracks, index, true);
        });
      });

      // Bind Download
      tracksContainer.querySelectorAll('.download-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const track = playlist.tracks.find((t) => t.id === btn.dataset.id);
          if (!track) return;
          if (this.downloadedFileIds.has(track.fileId)) {
            this.confirmRemoveDownload(track);
            return;
          }
          btn.innerHTML = `<span style="font-size: 10px; font-weight: 800;">0%</span>`;
          btn.classList.add('downloading');
          window.TelegramBridge.haptic.impact('light');

          try {
            await window.AudioCache.downloadTrack(track, (percent) => {
              btn.innerHTML = `<span style="font-size: 10px; font-weight: 800;">${percent}%</span>`;
              if (this.dom.btnDownloadExpanded) {
                const cur = window.AudioEngine.getCurrentTrack();
                if (cur && cur.id === track.id) {
                  this.dom.btnDownloadExpanded.innerHTML = `
                    ${Icons.spinner}
                    <span>${percent}%</span>
                  `;
                }
              }
            });

            this.downloadedFileIds.add(track.fileId);
            btn.innerHTML = Icons.check;
            btn.classList.remove('downloading');
            btn.classList.add('downloaded');
            window.TelegramBridge.haptic.notification('success');
            this.showToast('✅ با موفقیت در حافظه گوشی ذخیره شد (پخش فوری و آفلاین)');
            this.updateExpandedDownloadBtn();
          } catch (err) {
            btn.innerHTML = Icons.download;
            btn.classList.remove('downloading');
            window.TelegramBridge.haptic.notification('error');
            this.showToast('❌ ' + (err.message || 'خطا در دانلود'));
          }
        });
      });

      // Bind Play Native
      tracksContainer.querySelectorAll('.play-native').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          window.TelegramBridge.haptic.impact('medium');
          this.showToast('در حال ارسال به چت تلگرام...');
          try {
            await window.ApiClient.playNative(btn.dataset.id);
            this.showToast('✅ فایل به تلگرام ارسال شد! بدون دانلود پلی کنید.');
          } catch (err) {
            this.showToast('❌ خطا در ارسال: ' + (err.message || 'ناموفق'));
          }
        });
      });

      // Remove from this playlist
      tracksContainer.querySelectorAll('.pl-remove-track').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          window.TelegramBridge.haptic.impact('light');
          await window.ApiClient.removeTrackFromPlaylist(playlist.id, btn.dataset.trackId);
          window.App.loadPlaylistDetails(playlist.id);
          this.showToast('از پلی‌لیست حذف شد');
        });
      });
    }
  },

  // --- Modal Helpers ---

  openModal(title, bodyHtml, actionsHtml) {
    this.dom.modalTitle.textContent = title;
    this.dom.modalBody.innerHTML = bodyHtml;
    this.dom.modalActions.innerHTML = actionsHtml;
    this.dom.modalOverlay.classList.add('active');
  },

  closeModal() {
    this.dom.modalOverlay.classList.remove('active');
  },

  openCreatePlaylistModal() {
    const body = `
      <input type="text" id="new-pl-name" class="modal-input" placeholder="نام پلی‌لیست (مثلا: تمرکز، ورزش، آرامش)..." autofocus />
    `;
    const actions = `
      <button class="btn-secondary" id="modal-cancel">انصراف</button>
      <button class="btn-primary" id="modal-confirm-create">ایجاد</button>
    `;

    this.openModal('ساخت پلی‌لیست جدید', body, actions);

    const input = document.getElementById('new-pl-name');
    input.focus();

    document.getElementById('modal-cancel').onclick = () => this.closeModal();
    document.getElementById('modal-confirm-create').onclick = async () => {
      const name = input.value.trim();
      if (!name) return;
      try {
        await window.ApiClient.createPlaylist(name);
        this.closeModal();
        this.showToast(`پلی‌لیست «${name}» ساخته شد`);
        window.App.loadPlaylists();
      } catch (err) {
        alert(err.message);
      }
    };
  },

  async openAddToPlaylistModal(trackId) {
    try {
      const playlists = await window.ApiClient.getPlaylists();
      if (playlists.length === 0) {
        this.showToast('ابتدا یک پلی‌لیست ایجاد کنید');
        return;
      }

      const body = `
        <div style="display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto;">
          ${playlists.map((pl) => `
            <button class="playlist-select-item" data-pl-id="${pl.id}" style="text-align: right; padding: 12px; border-radius: 10px; background: var(--secondary-bg-color); color: var(--text-color); font-weight: 500;">
              ${this.escapeHTML(pl.name)} (${pl.trackCount} ترَک)
            </button>
          `).join('')}
        </div>
      `;
      const actions = `<button class="btn-secondary" id="modal-cancel">انصراف</button>`;

      this.openModal('افزودن به پلی‌لیست', body, actions);
      document.getElementById('modal-cancel').onclick = () => this.closeModal();

      document.querySelectorAll('.playlist-select-item').forEach((btn) => {
        btn.onclick = async () => {
          window.TelegramBridge.haptic.impact('light');
          await window.ApiClient.addTrackToPlaylist(btn.dataset.plId, trackId);
          this.closeModal();
          this.showToast('به پلی‌لیست افزوده شد');
        };
      });
    } catch (err) {
      console.error(err);
    }
  },

  confirmDeleteTrack(trackId, isPlaylistView) {
    const isInsidePlaylist = isPlaylistView && window.UI.activePlaylistId;
    const title = isInsidePlaylist ? 'حذف از پلی‌لیست' : 'حذف فایل صوتی';
    const msg = isInsidePlaylist
      ? 'آیا می‌خواهید این فایل از این پلی‌لیست حذف شود؟ (فایل در صندوقچه باقی می‌ماند)'
      : 'آیا از حذف کامل این فایل از صندوقچه صوتی اطمینان دارید؟ این عملیات قابل بازگشت نیست.';
    const confirmBtnText = isInsidePlaylist ? 'حذف از پلی‌لیست' : 'حذف دائمی';

    const body = `<p style="font-size: 14.5px; line-height: 1.55; color: var(--apple-label-secondary);">${msg}</p>`;
    const actions = `
      <button class="btn-secondary" id="modal-cancel">انصراف</button>
      <button class="btn-primary" id="modal-delete-track" style="background: var(--apple-destructive); box-shadow: 0 4px 14px rgba(255, 69, 58, 0.4);">${confirmBtnText}</button>
    `;

    this.openModal(title, body, actions);
    document.getElementById('modal-cancel').onclick = () => this.closeModal();
    document.getElementById('modal-delete-track').onclick = async () => {
      const btn = document.getElementById('modal-delete-track');
      if (btn) btn.disabled = true;

      try {
        if (isInsidePlaylist) {
          await window.ApiClient.removeTrackFromPlaylist(window.UI.activePlaylistId, trackId);
          this.closeModal();
          this.showToast('فایل از پلی‌لیست حذف شد');
        } else {
          // 1. Send API request
          await window.ApiClient.deleteTrack(trackId);

          // 2. Remove from local list
          window.App.tracks = (window.App.tracks || []).filter((t) => t.id !== trackId);

          // 3. Remove from AudioCache if downloaded
          const targetItem = this.dom.contentView.querySelector(`.track-item[data-id="${trackId}"]`);
          const fileId = targetItem?.querySelector('.download-btn')?.dataset?.fileId;
          if (fileId && window.AudioCache) {
            await window.AudioCache.delete(fileId);
            this.downloadedFileIds.delete(fileId);
          }

          // 4. Smooth Apple exit animation
          if (targetItem) {
            targetItem.style.transition = 'all 240ms cubic-bezier(0.32, 0.72, 0, 1)';
            targetItem.style.opacity = '0';
            targetItem.style.transform = 'scale(0.9) translateX(20px)';
            setTimeout(() => targetItem.remove(), 240);
          }

          // 5. If currently playing, stop
          const cur = window.AudioEngine.getCurrentTrack();
          if (cur && cur.id === trackId) {
            window.AudioEngine.stop();
            this.dom.miniPlayer.classList.add('hidden');
          }

          this.closeModal();
          this.showToast('🗑️ فایل با موفقیت حذف شد');
        }

        window.App.refreshCurrentView();
      } catch (err) {
        alert(err.message || 'خطا در حذف فایل');
        if (btn) btn.disabled = false;
      }
    };
  },

  confirmDeletePlaylist(playlistId) {
    const body = `<p style="font-size: 14.5px; line-height: 1.55; color: var(--apple-label-secondary);">آیا از حذف این پلی‌لیست اطمینان دارید؟ (فایل‌های اصلی صوتی حذف نخواهند شد).</p>`;
    const actions = `
      <button class="btn-secondary" id="modal-cancel">انصراف</button>
      <button class="btn-primary" id="modal-delete-pl" style="background: var(--apple-destructive); box-shadow: 0 4px 14px rgba(255, 69, 58, 0.4);">حذف پلی‌لیست</button>
    `;

    this.openModal('حذف پلی‌لیست', body, actions);
    document.getElementById('modal-cancel').onclick = () => this.closeModal();
    document.getElementById('modal-delete-pl').onclick = async () => {
      try {
        await window.ApiClient.deletePlaylist(playlistId);
        this.closeModal();
        this.showToast('پلی‌لیست حذف شد');
        this.switchTab('playlists');
      } catch (err) {
        alert(err.message);
      }
    };
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
    const remainingSecs = s % 60;
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
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
