/**
 * Pilot UX rule: never show the global yellow niqud toggle when the child is
 * already inside a reading flow that owns its own niqud mode.
 *
 * Applies to:
 * - app story reader (#screen-reader)
 * - letter-reading practice (#screen-letters-reading)
 * - the story niqud-mode chooser while it is open
 *
 * Outside those contexts the existing global niqud button behaves unchanged.
 */
(function () {
  'use strict';
  if (window.BookiPilotNiqudContext20260910) return;
  window.BookiPilotNiqudContext20260910 = true;

  const BODY_CLASS = 'booki-internal-niqud-active';

  function dialogIsOpen() {
    const dialog = document.getElementById('niqud-mode-dialog');
    if (!dialog) return false;
    const inline = dialog.style.display;
    if (inline === 'none') return false;
    if (inline === 'flex' || inline === 'block' || inline === 'grid') return true;
    try { return getComputedStyle(dialog).display !== 'none'; }
    catch (_) { return false; }
  }

  function internalNiqudIsActive() {
    const active = document.querySelector('.screen.active');
    const id = active?.id || '';
    return id === 'screen-reader'
      || id === 'screen-letters-reading'
      || dialogIsOpen();
  }

  function sync() {
    const hide = internalNiqudIsActive();
    document.body.classList.toggle(BODY_CLASS, hide);

    const toggle = document.getElementById('btn-niqud-toggle');
    if (!toggle) return;
    toggle.setAttribute('aria-hidden', hide ? 'true' : 'false');
    if (hide) toggle.tabIndex = -1;
    else toggle.removeAttribute('tabindex');
  }

  const style = document.createElement('style');
  style.id = 'booki-pilot-niqud-context-style';
  style.textContent = `
    body.${BODY_CLASS} #btn-niqud-toggle {
      display: none !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);

  function init() {
    sync();

    document.querySelectorAll('.screen').forEach(screen => {
      new MutationObserver(sync).observe(screen, {
        attributes: true,
        attributeFilter: ['class']
      });
    });

    const dialog = document.getElementById('niqud-mode-dialog');
    if (dialog) {
      new MutationObserver(sync).observe(dialog, {
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
      });
    }

    // Some reading UI is inserted/updated after the pilot modules load.
    new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });

    window.addEventListener('pageshow', sync);
    window.addEventListener('booki:pilot-release-ready', sync);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();