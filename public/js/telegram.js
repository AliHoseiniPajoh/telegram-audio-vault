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

      // Synchronize CSS variables if Telegram provides themeParams
      this.syncTheme();
      this.tg.onEvent('themeChanged', () => this.syncTheme());

      // Set header color
      if (this.tg.setHeaderColor && this.tg.themeParams?.bg_color) {
        this.tg.setHeaderColor(this.tg.themeParams.bg_color);
      }
    } else {
      console.warn('[TelegramBridge] Running outside Telegram environment (Dev Mode)');
    }
  },

  syncTheme() {
    if (!this.tg?.themeParams) return;
    const root = document.documentElement;
    const p = this.tg.themeParams;

    if (p.bg_color) root.style.setProperty('--bg-color', p.bg_color);
    if (p.text_color) root.style.setProperty('--text-color', p.text_color);
    if (p.hint_color) root.style.setProperty('--hint-color', p.hint_color);
    if (p.link_color) root.style.setProperty('--link-color', p.link_color);
    if (p.button_color) root.style.setProperty('--button-color', p.button_color);
    if (p.button_text_color) root.style.setProperty('--button-text-color', p.button_text_color);
    if (p.secondary_bg_color) root.style.setProperty('--secondary-bg-color', p.secondary_bg_color);
    if (p.header_bg_color) root.style.setProperty('--header-bg-color', p.header_bg_color);
    if (p.accent_text_color) root.style.setProperty('--accent-text-color', p.accent_text_color);
    if (p.section_bg_color) root.style.setProperty('--section-bg-color', p.section_bg_color);
    if (p.destructive_text_color) root.style.setProperty('--destructive-color', p.destructive_text_color);
  },

  getInitData() {
    // Return Telegram initData or dev mock if running outside
    if (this.tg?.initData) {
      return this.tg.initData;
    }
    return '';
  },

  getUser() {
    return this.tg?.initDataUnsafe?.user || null;
  },

  // Haptic feedback triggers
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

  // Telegram BackButton helper
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
