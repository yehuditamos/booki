/**
 * Emergency compatibility stub — 2026-09-11.
 *
 * IMPORTANT:
 * Older cached pilot loaders may still request this exact URL.
 * Keep the file present so those loaders receive HTTP 200, but execute NO
 * membership conversion, NO Firestore repair, NO observers and NO routing hooks.
 *
 * The manual-name → open-slot conversion feature is intentionally disabled
 * until it is rebuilt and QA'd in isolation.
 */
(function(){
  'use strict';
  window.BookiManualNameSlot20260911 = true;
  window.BookiManualNameSlot = {
    disabled: true,
    reason: 'emergency-rollback-2026-09-11'
  };
})();
