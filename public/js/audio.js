/**
 * Audio Engine - Robust HTML5 Audio Manager
 * Supports queue, repeat, shuffle, speed control, and native lockscreen MediaSession
 */

class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.queue = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.isShuffle = false;
    this.repeatMode = 'off'; // 'off' | 'all' | 'one'
    this.playbackRate = 1.0;

    this.listeners = {
      trackChange: [],
      timeUpdate: [],
      stateChange: [],
      error: []
    };

    this.initAudioEvents();
    this.initMediaSession();
  }

  initAudioEvents() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.emit('stateChange', { isPlaying: true });
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

  loadCurrentTrack(autoPlay = true) {
    const track = this.getCurrentTrack();
    if (!track) return;

    const streamUrl = window.ApiClient.getStreamUrl(track.fileId);
    this.audio.src = streamUrl;
    this.audio.playbackRate = this.playbackRate;

    this.updateMediaSessionMetadata(track);
    this.emit('trackChange', track);

    if (autoPlay) {
      this.play();
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
}

window.AudioEngine = new AudioEngine();
