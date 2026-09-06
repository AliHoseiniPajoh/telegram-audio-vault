/**
 * Audio Cache - Native IndexedDB Device Storage
 * Stores full audio blobs locally on the user's phone for 0ms instantaneous offline playback
 */
const AudioCache = {
  dbPromise: null,
  getDb() {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        if (!('indexedDB' in window)) return resolve(null);
        try {
          const req = indexedDB.open('AudioVaultStorage', 1);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('audio_files')) {
              db.createObjectStore('audio_files');
            }
          };
          req.onsuccess = (e) => resolve(e.target.result);
          req.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
    }
    return this.dbPromise;
  },

  async get(fileId) {
    try {
      const db = await this.getDb();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction('audio_files', 'readonly');
        const store = tx.objectStore('audio_files');
        const req = store.get(fileId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (_) {
      return null;
    }
  },

  async put(fileId, blob) {
    try {
      const db = await this.getDb();
      if (!db || !blob) return false;
      return new Promise((resolve) => {
        const tx = db.transaction('audio_files', 'readwrite');
        const store = tx.objectStore('audio_files');
        store.put(blob, fileId);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) {
      return false;
    }
  },

  async delete(fileId) {
    try {
      const db = await this.getDb();
      if (!db) return false;
      return new Promise((resolve) => {
        const tx = db.transaction('audio_files', 'readwrite');
        const store = tx.objectStore('audio_files');
        store.delete(fileId);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (_) {
      return false;
    }
  },

  async getAllKeys() {
    try {
      const db = await this.getDb();
      if (!db) return [];
      return new Promise((resolve) => {
        const tx = db.transaction('audio_files', 'readonly');
        const store = tx.objectStore('audio_files');
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch (_) {
      return [];
    }
  },

  async requestPersistence() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        const isPersisted = await navigator.storage.persist();
        console.log('[AudioCache] Persistent storage granted:', isPersisted);
        return isPersisted;
      } catch (_) {
        return false;
      }
    }
    return false;
  },

  async downloadTrack(track, onProgress) {
    if (!track || !track.fileId) throw new Error('فایل نامعتبر است');
    const streamUrl = window.ApiClient.getStreamUrl(track.fileId);

    const res = await fetch(streamUrl);
    if (!res.ok) {
      let errMsg = `خطای دریافت (${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson.message) errMsg = errJson.message;
        else if (errJson.error) errMsg = errJson.error;
      } catch (_) {}
      throw new Error(errMsg);
    }

    const contentLength = res.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : (track.fileSize || 0);

    if (!res.body || !res.body.getReader) {
      const blob = await res.blob();
      if (!blob || blob.size < 1000) throw new Error('فایل صوتی نامعتبر دریافت شد');
      await this.put(track.fileId, blob);
      this.requestPersistence().catch(() => {});
      if (typeof onProgress === 'function') onProgress(100);
      return blob;
    }

    const reader = res.body.getReader();
    let receivedLength = 0;
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedLength += value.length;
      if (total > 0 && typeof onProgress === 'function') {
        const percent = Math.min(Math.round((receivedLength / total) * 100), 99);
        onProgress(percent, receivedLength, total);
      }
    }

    const mimeType = track.mimeType || 'audio/mpeg';
    const blob = new Blob(chunks, { type: mimeType });
    if (!blob || blob.size < 1000) throw new Error('فایل صوتی ناقص دانلود شد');

    await this.put(track.fileId, blob);
    this.requestPersistence().catch(() => {});
    if (typeof onProgress === 'function') onProgress(100);
    return blob;
  }
};

window.AudioCache = AudioCache;

class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.queue = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.isBuffering = false;
    this.isShuffle = false;
    this.repeatMode = 'off'; // 'off' | 'all' | 'one'
    this.playbackRate = 1.0;
    this.currentBlobUrl = null;
    this.isPreloadedNext = false;

    this.listeners = {
      trackChange: [],
      timeUpdate: [],
      stateChange: [],
      buffering: [],
      error: []
    };

    this.initAudioEvents();
    this.initMediaSession();
  }

  initAudioEvents() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.isBuffering = false;
      this.emit('stateChange', { isPlaying: true });
      this.emit('buffering', { isBuffering: false });
    });

    this.audio.addEventListener('playing', () => {
      this.isPlaying = true;
      this.isBuffering = false;
      this.emit('stateChange', { isPlaying: true });
      this.emit('buffering', { isBuffering: false });
    });

    this.audio.addEventListener('waiting', () => {
      this.isBuffering = true;
      this.emit('buffering', { isBuffering: true });
    });

    this.audio.addEventListener('canplay', () => {
      this.isBuffering = false;
      this.emit('buffering', { isBuffering: false });
    });

    this.audio.addEventListener('loadstart', () => {
      this.isBuffering = true;
      this.emit('buffering', { isBuffering: true });
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.emit('stateChange', { isPlaying: false });
    });

    this.audio.addEventListener('timeupdate', () => {
      const currentTime = this.audio.currentTime || 0;
      const duration = this.audio.duration || 0;
      const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

      this.emit('timeUpdate', {
        currentTime,
        duration,
        progress
      });

      if ('mediaSession' in navigator && duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: Math.max(duration, 0),
            playbackRate: this.playbackRate,
            position: Math.max(currentTime, 0)
          });
        } catch (_) {}
      }
    });

    this.audio.addEventListener('ended', () => {
      this.handleTrackEnded();
    });

    this.audio.addEventListener('error', (e) => {
      console.error('[Audio Error]', e);
      this.isBuffering = false;
      this.emit('buffering', { isBuffering: false });
      this.emit('error', { message: 'خطا در پخش فایل صوتی' });
    });
  }

  initMediaSession() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => this.play());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        this.seekToTime(details.seekTime);
      }
    });
  }

  updateMediaSessionMetadata(track) {
    if (!('mediaSession' in navigator) || !track) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Unknown Title',
      artist: track.performer || 'Private Vault',
      album: 'Audio Vault'
    });
  }

  // Event Subscription
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((cb) => cb(data));
    }
  }

  // Load a queue and start at specific index
  setQueue(tracks, startIndex = 0, autoPlay = true) {
    this.queue = tracks || [];
    this.currentIndex = Math.max(0, Math.min(startIndex, this.queue.length - 1));

    if (this.queue.length > 0) {
      this.loadCurrentTrack(autoPlay);
    }
  }

  getCurrentTrack() {
    if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
      return this.queue[this.currentIndex];
    }
    return null;
  }

  async loadCurrentTrack(autoPlay = true) {
    const track = this.getCurrentTrack();
    if (!track) return;

    // Revoke previous blob URL to prevent memory leaks
    if (this.currentBlobUrl) {
      try {
        URL.revokeObjectURL(this.currentBlobUrl);
      } catch (_) {}
      this.currentBlobUrl = null;
    }

    this.updateMediaSessionMetadata(track);
    this.emit('trackChange', track);
    this.isBuffering = true;
    this.emit('buffering', { isBuffering: true });

    const streamUrl = window.ApiClient.getStreamUrl(track.fileId);

    // 1. Check if audio is already cached in local device storage (IndexedDB)
    const cachedBlob = await AudioCache.get(track.fileId);

    if (cachedBlob) {
      console.log('[AudioCache] Playing instantly from local device storage:', track.title);
      this.currentBlobUrl = URL.createObjectURL(cachedBlob);
      this.audio.src = this.currentBlobUrl;
      this.audio.playbackRate = this.playbackRate;
      this.isBuffering = false;
      this.emit('buffering', { isBuffering: false });

      if (autoPlay) {
        this.play();
      }
    } else {
      // 2. Direct streaming: Dedicate 100% of bandwidth to the audio player for immediate playback
      this.audio.src = streamUrl;
      this.audio.playbackRate = this.playbackRate;

      if (autoPlay) {
        this.play();
      }
    }
  }

  play() {
    if (!this.audio.src) {
      if (this.queue.length > 0 && this.currentIndex === -1) {
        this.currentIndex = 0;
        this.loadCurrentTrack(true);
      }
      return;
    }

    this.audio.play().catch((err) => {
      console.warn('[AudioEngine] Play prevented:', err.message);
    });
  }

  pause() {
    this.audio.pause();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  next() {
    if (this.queue.length === 0) return;

    if (this.repeatMode === 'one') {
      this.seekToTime(0);
      this.play();
      return;
    }

    if (this.isShuffle && this.queue.length > 1) {
      let nextIndex = this.currentIndex;
      while (nextIndex === this.currentIndex) {
        nextIndex = Math.floor(Math.random() * this.queue.length);
      }
      this.currentIndex = nextIndex;
    } else {
      if (this.currentIndex < this.queue.length - 1) {
        this.currentIndex++;
      } else if (this.repeatMode === 'all') {
        this.currentIndex = 0;
      } else {
        // End of playlist
        this.pause();
        return;
      }
    }

    this.loadCurrentTrack(true);
  }

  prev() {
    if (this.queue.length === 0) return;

    // If played more than 3 seconds, restart current track
    if (this.audio.currentTime > 3) {
      this.seekToTime(0);
      return;
    }

    if (this.currentIndex > 0) {
      this.currentIndex--;
    } else if (this.repeatMode === 'all') {
      this.currentIndex = this.queue.length - 1;
    } else {
      this.seekToTime(0);
      return;
    }

    this.loadCurrentTrack(true);
  }

  handleTrackEnded() {
    if (this.repeatMode === 'one') {
      this.seekToTime(0);
      this.play();
    } else {
      this.next();
    }
  }

  seek(percent) {
    if (this.audio.duration) {
      const targetTime = (percent / 100) * this.audio.duration;
      this.seekToTime(targetTime);
    }
  }

  seekToTime(seconds) {
    if (Number.isFinite(seconds)) {
      this.audio.currentTime = seconds;
    }
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    return this.isShuffle;
  }

  toggleRepeat() {
    if (this.repeatMode === 'off') {
      this.repeatMode = 'all';
    } else if (this.repeatMode === 'all') {
      this.repeatMode = 'one';
    } else {
      this.repeatMode = 'off';
    }
    return this.repeatMode;
  }

  cyclePlaybackRate() {
    const rates = [1.0, 1.25, 1.5, 2.0, 0.75];
    const nextIdx = (rates.indexOf(this.playbackRate) + 1) % rates.length;
    this.playbackRate = rates[nextIdx];
    this.audio.playbackRate = this.playbackRate;
    return this.playbackRate;
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.isPlaying = false;
    this.emit('stateChange', { isPlaying: false });
  }

  fadeVolume(targetVolume, durationMs = 15000) {
    if (!this.audio) return;
    const startVolume = this.audio.volume;
    const steps = 25;
    const stepTime = durationMs / steps;
    const volumeStep = (targetVolume - startVolume) / steps;
    let currentStep = 0;

    if (this.fadeInterval) clearInterval(this.fadeInterval);
    this.fadeInterval = setInterval(() => {
      currentStep++;
      const nextVol = Math.max(0, Math.min(1, startVolume + volumeStep * currentStep));
      this.audio.volume = nextVol;
      if (currentStep >= steps) {
        clearInterval(this.fadeInterval);
        this.fadeInterval = null;
        this.audio.volume = targetVolume;
      }
    }, stepTime);
  }

  setVolume(vol) {
    if (this.fadeInterval) clearInterval(this.fadeInterval);
    this.audio.volume = Math.max(0, Math.min(1, vol));
  }

  checkPreloadNext(currentTime, duration) {
    if (this.isPreloadedNext || !duration || duration <= 0) return;
    if (currentTime >= duration - 10) {
      this.preloadNextTrack();
    }
  }

  async preloadNextTrack() {
    if (this.queue.length === 0 || this.currentIndex >= this.queue.length - 1) return;
    const nextTrack = this.queue[this.currentIndex + 1];
    if (!nextTrack) return;
    this.isPreloadedNext = true;

    try {
      const cached = await AudioCache.get(nextTrack.fileId);
      if (!cached && window.AudioCache?.downloadTrack) {
        console.log('[AudioEngine] Gapless prebuffering next track:', nextTrack.title);
      }
    } catch (_) {}
  }
}

window.AudioEngine = new AudioEngine();
