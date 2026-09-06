/**
 * Telegram WebApp Integration Bridge
 * Manages theme synchronization, haptic feedback, back button, and authentication data.
 */

const TelegramBridge = {
  tg: window.Telegram?.WebApp || null,

  init() {
    if (this.tg) {
      this.tg.ready();
      this.tg.expand();
      if (typeof this.tg.disableVerticalSwipes === 'function') {
        try {
          this.tg.disableVerticalSwipes();
        } catch (_) {}
      }

      // Synchronize CSS variables and theme classes
      this.syncTheme();
      this.tg.onEvent('themeChanged', () => this.syncTheme());
    } else {
      // Dev / Browser mode fallback
      this.syncTheme();
    }
  },

  syncTheme() {
    const root = document.documentElement;
    const body = document.body;
    let isLight = false;

    if (this.tg) {
      if (this.tg.colorScheme === 'light') {
        isLight = true;
      } else if (this.tg.themeParams?.bg_color) {
        const hex = this.tg.themeParams.bg_color.replace('#', '');
        if (hex.length === 6) {
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          isLight = lum > 130;
        }
      }
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      isLight = true;
    }

    root.setAttribute('data-theme', isLight ? 'light' : 'dark');
    if (body) {
      body.classList.toggle('light-theme', isLight);
      body.classList.toggle('dark-theme', !isLight);
    }

    // Pass custom Telegram themeParams if provided
    if (this.tg?.themeParams) {
      const p = this.tg.themeParams;
      if (p.bg_color) root.style.setProperty('--bg-color', p.bg_color);
      if (p.text_color) root.style.setProperty('--text-color', p.text_color);
      if (p.hint_color) root.style.setProperty('--hint-color', p.hint_color);
      if (p.link_color) root.style.setProperty('--link-color', p.link_color);
      if (p.button_color) root.style.setProperty('--button-color', p.button_color);
      if (p.button_text_color) root.style.setProperty('--button-text-color', p.button_text_color);
      if (p.secondary_bg_color) root.style.setProperty('--secondary-bg-color', p.secondary_bg_color);
      if (p.header_bg_color) root.style.setProperty('--header-bg-color', p.header_bg_color);
    }

    if (this.tg?.setHeaderColor) {
      this.tg.setHeaderColor(isLight ? '#f2f2f7' : '#000000');
    }
    if (this.tg?.setBackgroundColor) {
      this.tg.setBackgroundColor(isLight ? '#f2f2f7' : '#000000');
    }
  },

  getInitData() {
    if (this.tg?.initData) {
      return this.tg.initData;
    }
    return '';
  },

  getUser() {
    return this.tg?.initDataUnsafe?.user || null;
  },

  haptic: {
    impact(style = 'light') {
      try {
        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
      } catch (_) {}
    },
    notification(type = 'success') {
      try {
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
      } catch (_) {}
    },
    selection() {
      try {
        window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
      } catch (_) {}
    }
  },

  backButton: {
    show(callback) {
      const btn = window.Telegram?.WebApp?.BackButton;
      if (btn) {
        btn.show();
        btn.onClick(callback);
      }
    },
    hide(callback) {
      const btn = window.Telegram?.WebApp?.BackButton;
      if (btn) {
        if (callback) btn.offClick(callback);
        btn.hide();
      }
    }
  }
};

window.TelegramBridge = TelegramBridge;
