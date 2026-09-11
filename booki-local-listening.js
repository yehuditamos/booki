/* Booki pilot — no voice, no consent boot gate.
 * Voice and consent are intentionally paused until after the pilot.
 * This module must NEVER delay routeOnLoad or app startup.
 */
(function () {
  'use strict';

  try { window.BookiLocalListening?.stop?.(); } catch (_) {}

  function hide() {
    const panel = document.getElementById('booki-local-listening');
    if (panel) {
      panel.hidden = true;
      panel.style.display = 'none';
    }
  }

  window.BookiLocalListening = Object.freeze({
    isEnabled: () => false,
    start: hide,
    stop: hide,
    render: value => {
      const el = document.getElementById('reader-text');
      if (el) el.textContent = String(value || '');
      hide();
    }
  });

  hide();

  // Compatibility only: code elsewhere may await this promise.
  // It resolves immediately and does not read Firestore or gate routing.
  window.BookiBasicConsentReady = Promise.resolve({ enabled: false, pilotPaused: true });

  // Compatibility API for teacher-flow / old cached modules.
  window.BookiBasicConsent = window.BookiBasicConsent || Object.freeze({
    VERSION: 'pilot-paused',
    ready: async () => ({ enabled: false, pilotPaused: true }),
    install: () => {},
    requireTeacher: async () => true,
    requireGuardian: async () => true,
    validReceipt: () => false,
    preview: () => {},
  });
})();
