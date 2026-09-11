/* Booki pilot compatibility stub — consent flow is paused until after the pilot.
 * Keep this exact file URL alive for older cached loaders, but never block startup.
 */
(function(){
  'use strict';
  if (window.BookiBasicConsent?.pilotPaused) return;
  const api = Object.freeze({
    VERSION: 'pilot-paused',
    pilotPaused: true,
    ready: async () => ({ enabled:false, pilotPaused:true, rulesAvailable:false }),
    install: () => {},
    requireTeacher: async () => true,
    requireGuardian: async () => true,
    validReceipt: () => false,
    preview: () => {},
  });
  window.BookiBasicConsent = api;
  window.BookiBasicConsentReady = Promise.resolve({ enabled:false, pilotPaused:true });
})();
