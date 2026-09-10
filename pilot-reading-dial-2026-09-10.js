/**
 * Booki reading selector v7 — approved generator artwork as the visual layer.
 * The green button + right-hand reel are the actual approved raster crop.
 * HTML/CSS above it is interaction-only, plus minimal state overlays for non-default modes.
 */
(function () {
  'use strict';
  if (window.BookiReadingDial) return;

  const MODES = [
    { id: 'app',     label: 'קריאה בבוקי',   action: 'enterAppStoryReading' },
    { id: 'letters', label: 'קוראים אותיות', action: 'showLettersReading' },
    { id: 'timer',   label: 'ספר עם שעון',   action: 'startBookiReading' },
    { id: 'report',  label: 'דיווח קריאה',   action: 'startBookReading' },
  ];

  const ART_PARTS = [0, 1, 2, 3].map(i =>
    `assets/booki/reading-journey/generated-button-v1.part${String(i).padStart(2, '0')}.b64?v=1`
  );

  // Positions inside the approved 780×410 crop, expressed as percentages.
  const ROW_TOP = [13.2, 34.0, 54.2, 74.3];

  let selected = 0;
  let dragging = false;
  let wasMainActive = false;
  let artLoading = null;

  const $ = id => document.getElementById(id);
  const current = () => MODES[selected];

  function render(announce = false) {
    const shell = $('booki-reading-dial');
    const reel = $('booki-reading-reel-hit');
    const main = $('booki-reading-dial-start');
    const pill = $('booki-reading-mode-overlay');
    const neutralizer = $('booki-reading-default-row-neutralizer');
    const marker = $('booki-reading-row-marker');
    if (!shell || !reel || !main || !pill || !neutralizer || !marker) return;

    const item = current();
    shell.dataset.selected = item.id;
    main.setAttribute('aria-label', `התחל קריאה — ${item.label}`);
    reel.setAttribute('aria-valuenow', String(selected));
    reel.setAttribute('aria-valuetext', item.label);

    // The default state is left completely untouched so the approved generator
    // artwork is rendered literally as generated.
    const isDefault = selected === 0;
    pill.hidden = isDefault;
    neutralizer.hidden = isDefault;
    marker.hidden = isDefault;

    if (!isDefault) {
      pill.textContent = item.label;
      marker.style.top = `${ROW_TOP[selected]}%`;
    }

    if (announce) {
      const live = $('booki-reading-dial-live');
      if (live) live.textContent = `נבחרה ${item.label}`;
    }
  }

  function select(index, announce = true) {
    const next = Math.max(0, Math.min(MODES.length - 1, Number(index) || 0));
    if (next === selected) return;
    selected = next;
    render(announce);
    try { navigator.vibrate?.(8); } catch (_) {}
  }

  function selectFromPointer(event) {
    const reel = $('booki-reading-reel-hit');
    if (!reel) return;
    const rect = reel.getBoundingClientRect();

    // Ignore the decorative arrow caps; map the four visible icon rows only.
    const innerTop = rect.height * 0.115;
    const innerBottom = rect.height * 0.885;
    const usable = innerBottom - innerTop;
    const y = Math.max(0, Math.min(usable - 1, event.clientY - rect.top - innerTop));
    const index = Math.floor((y / usable) * MODES.length);
    select(index);
  }

  function runSelected() {
    const main = $('booki-reading-dial-start');
    if (main?.disabled) return;

    const item = current();
    const action = window[item.action];
    const status = $('booki-reading-dial-status');
    if (typeof action !== 'function') {
      if (status) status.textContent = 'רגע, בוקי עדיין מכין את אפשרות הקריאה הזאת. נסו שוב.';
      console.error('[booki-reading-selector] Missing action:', item.action);
      return;
    }

    if (status) status.textContent = '';
    if (main) main.disabled = true;
    try {
      if (typeof track === 'function') track('reading_mode_started', { mode: item.id });
    } catch (_) {}

    try {
      Promise.resolve(action()).catch(error => {
        console.error('[booki-reading-selector] Reading action failed:', error);
        if (status) status.textContent = 'משהו נתקע. נסו שוב.';
      }).finally(() => {
        setTimeout(() => { if (main) main.disabled = false; }, 450);
      });
    } catch (error) {
      console.error('[booki-reading-selector] Reading action failed:', error);
      if (status) status.textContent = 'משהו נתקע. נסו שוב.';
      if (main) main.disabled = false;
    }
  }

  async function loadApprovedArtwork() {
    if (artLoading) return artLoading;
    artLoading = (async () => {
      const img = $('booki-reading-generator-art');
      const shell = $('booki-reading-dial');
      if (!img || !shell) return;
      try {
        const chunks = await Promise.all(ART_PARTS.map(async path => {
          const response = await fetch(path, { cache: 'force-cache' });
          if (!response.ok) throw new Error(`art chunk ${response.status}: ${path}`);
          return (await response.text()).trim();
        }));
        const b64 = chunks.join('').replace(/\s+/g, '');
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = `data:image/webp;base64,${b64}`;
        });
        shell.classList.add('art-ready');
      } catch (error) {
        console.error('[booki-reading-selector] Approved artwork failed to load:', error);
        shell.classList.add('art-failed');
      }
    })();
    return artLoading;
  }

  function cleanLegacyHome() {
    const hide = selector => {
      const el = document.querySelector(selector);
      if (el) el.style.setProperty('display', 'none', 'important');
    };
    hide('#screen-main .home-speech-bubble');
    hide('#screen-main .home-start-hint');
    hide('#screen-main .console-frame');
    hide('#reading-chooser-overlay');

    // Temporarily retire the personal-message entry point without deleting data.
    hide('#screen-main .booki-unread-cue');
    hide('#booki-personal-message');
    const stage = $('home-console-stage');
    if (stage) {
      stage.style.setProperty('pointer-events', 'none', 'important');
      stage.tabIndex = -1;
      stage.removeAttribute('role');
      stage.removeAttribute('aria-label');
    }

    // Pilot home is intentionally minimal for every child.
    ['home-class-goal', 'home-shelf-card'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.style.setProperty('display', 'none', 'important');
      el.setAttribute('aria-hidden', 'true');
      el.tabIndex = -1;
    });
  }

  function build() {
    const oldStart = $('home-start-reading');
    const wrap = oldStart?.parentElement;
    if (!oldStart || !wrap || $('booki-reading-dial')) return;

    const shell = document.createElement('section');
    shell.id = 'booki-reading-dial';
    shell.className = 'booki-reading-dial';
    shell.setAttribute('aria-label', 'בחירת אופן הקריאה והתחלת קריאה');

    const artShell = document.createElement('div');
    artShell.className = 'booki-reading-generator-shell';

    const img = document.createElement('img');
    img.id = 'booki-reading-generator-art';
    img.className = 'booki-reading-generator-art';
    img.alt = '';
    img.width = 780;
    img.height = 410;
    img.decoding = 'async';
    img.draggable = false;

    // Transparent hit target over the green generated button.
    const main = document.createElement('button');
    main.type = 'button';
    main.id = 'booki-reading-dial-start';
    main.className = 'booki-reading-generator-hit-main';
    main.setAttribute('aria-label', 'התחל קריאה — קריאה בבוקי');
    main.addEventListener('click', runSelected);

    // Transparent hit target over the exact right-hand generated scale.
    const reel = document.createElement('div');
    reel.id = 'booki-reading-reel-hit';
    reel.className = 'booki-reading-generator-hit-reel';
    reel.tabIndex = 0;
    reel.setAttribute('role', 'slider');
    reel.setAttribute('aria-label', 'אופן הקריאה');
    reel.setAttribute('aria-orientation', 'vertical');
    reel.setAttribute('aria-valuemin', '0');
    reel.setAttribute('aria-valuemax', String(MODES.length - 1));
    reel.setAttribute('aria-valuenow', '0');
    reel.setAttribute('aria-valuetext', MODES[0].label);

    // Visible only after leaving the exact default image state.
    const neutralizer = document.createElement('span');
    neutralizer.id = 'booki-reading-default-row-neutralizer';
    neutralizer.className = 'booki-reading-default-row-neutralizer';
    neutralizer.hidden = true;
    neutralizer.setAttribute('aria-hidden', 'true');

    const marker = document.createElement('span');
    marker.id = 'booki-reading-row-marker';
    marker.className = 'booki-reading-row-marker';
    marker.hidden = true;
    marker.setAttribute('aria-hidden', 'true');

    const pill = document.createElement('span');
    pill.id = 'booki-reading-mode-overlay';
    pill.className = 'booki-reading-mode-overlay';
    pill.hidden = true;
    pill.setAttribute('aria-hidden', 'true');

    const fallback = document.createElement('button');
    fallback.type = 'button';
    fallback.className = 'booki-reading-art-fallback';
    fallback.textContent = 'התחל קריאה';
    fallback.addEventListener('click', runSelected);

    artShell.append(img, neutralizer, marker, pill, main, reel, fallback);

    const live = document.createElement('span');
    live.id = 'booki-reading-dial-live';
    live.className = 'booki-reading-dial-sr';
    live.setAttribute('aria-live', 'polite');

    const status = document.createElement('p');
    status.id = 'booki-reading-dial-status';
    status.className = 'booki-reading-dial-status';
    status.setAttribute('role', 'status');

    shell.append(artShell, live, status);
    wrap.insertBefore(shell, oldStart);

    oldStart.style.display = 'none';
    oldStart.setAttribute('aria-hidden', 'true');
    oldStart.tabIndex = -1;

    cleanLegacyHome();

    reel.addEventListener('pointerdown', event => {
      dragging = true;
      reel.setPointerCapture?.(event.pointerId);
      selectFromPointer(event);
      event.preventDefault();
    });
    reel.addEventListener('pointermove', event => {
      if (!dragging) return;
      selectFromPointer(event);
      event.preventDefault();
    });
    const endDrag = event => {
      if (!dragging) return;
      dragging = false;
      selectFromPointer(event);
      try { reel.releasePointerCapture?.(event.pointerId); } catch (_) {}
    };
    reel.addEventListener('pointerup', endDrag);
    reel.addEventListener('pointercancel', () => { dragging = false; });

    reel.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault(); select(Math.min(MODES.length - 1, selected + 1));
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault(); select(Math.max(0, selected - 1));
      } else if (event.key === 'Home') {
        event.preventDefault(); select(0);
      } else if (event.key === 'End') {
        event.preventDefault(); select(MODES.length - 1);
      }
    });

    // Legacy entry point remains one-click and never opens the old four-choice sheet.
    window.openReadingChooser = runSelected;
    render(false);
    loadApprovedArtwork();
  }

  function resetForHome() {
    selected = 0;
    const status = $('booki-reading-dial-status');
    if (status) status.textContent = '';
    cleanLegacyHome();
    render(false);
  }

  function watchHome() {
    const main = $('screen-main');
    if (!main) return;
    wasMainActive = main.classList.contains('active');
    if (wasMainActive) resetForHome();
    new MutationObserver(() => {
      const active = main.classList.contains('active');
      if (active && !wasMainActive) resetForHome();
      if (active) cleanLegacyHome();
      wasMainActive = active;
    }).observe(main, { attributes: true, attributeFilter: ['class'] });
  }

  function installStyle() {
    if ($('booki-reading-dial-style')) return;
    const style = document.createElement('style');
    style.id = 'booki-reading-dial-style';
    style.textContent = `
      #reading-chooser-overlay,
      #booki-personal-message,
      #screen-main .booki-unread-cue,
      #screen-main .home-speech-bubble,
      #screen-main .home-start-hint,
      #screen-main .console-frame,
      #screen-main #home-class-goal,
      #screen-main #home-shelf-card{display:none!important}
      #screen-main #home-console-stage{pointer-events:none!important}

      /* Keep the approved mockup atmosphere behind the literal raster control. */
      #screen-main.booki-world--home{
        background-color:#fff7e2!important;
        background-image:
          radial-gradient(78% 31% at -8% 7%,rgba(210,226,190,.70) 0 52%,transparent 53%),
          radial-gradient(72% 28% at 108% 13%,rgba(210,229,196,.60) 0 53%,transparent 54%),
          radial-gradient(65% 23% at -9% 57%,rgba(250,194,163,.40) 0 51%,transparent 52%),
          radial-gradient(75% 27% at 111% 76%,rgba(228,207,205,.35) 0 52%,transparent 53%),
          linear-gradient(180deg,#fff9e9 0%,#fff3d4 54%,#fff9e8 100%)!important;
      }
      #screen-main .home-ambient{display:none!important}
      #screen-main .home-console-wrap{padding-top:6px!important}
      #screen-main .home-console-stage{margin:0 auto 4px!important}
      #screen-main .home-console-char{width:min(55vw,220px)!important;height:auto!important;filter:drop-shadow(0 14px 15px rgba(117,91,46,.12))}

      .booki-reading-dial{width:min(96vw,560px);margin:0 auto 22px;direction:rtl;font-family:Heebo,Arial,sans-serif;text-align:center}
      .booki-reading-generator-shell{position:relative;width:100%;aspect-ratio:780/410;margin:0 auto;overflow:visible;isolation:isolate}
      .booki-reading-generator-art{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:contain;opacity:0;pointer-events:none;user-select:none;-webkit-user-drag:none;transition:opacity .12s ease;z-index:1}
      .booki-reading-dial.art-ready .booki-reading-generator-art{opacity:1}

      /* The artwork is the button. These two elements are only invisible hit areas. */
      .booki-reading-generator-hit-main{position:absolute;z-index:6;left:1%;top:4%;width:82%;height:91%;border:0;background:transparent;padding:0;margin:0;border-radius:34%/46%;cursor:pointer;-webkit-tap-highlight-color:transparent}
      .booki-reading-generator-hit-main:focus-visible{outline:3px solid #2877b8;outline-offset:3px}
      .booki-reading-generator-hit-main:active{background:rgba(0,90,47,.045)}
      .booki-reading-generator-hit-main:disabled{cursor:wait}

      .booki-reading-generator-hit-reel{position:absolute;z-index:7;right:1.4%;top:2.2%;width:18.4%;height:95.6%;border-radius:44%;background:transparent;touch-action:none;user-select:none;cursor:ns-resize;-webkit-tap-highlight-color:transparent;outline:none}
      .booki-reading-generator-hit-reel:focus-visible{outline:3px solid rgba(40,119,184,.75);outline-offset:2px}

      /* Non-default modes: preserve the generated frame while moving only the selection state. */
      .booki-reading-default-row-neutralizer{position:absolute;z-index:3;right:4.25%;top:13.2%;width:13.8%;height:20.6%;border-radius:17px;background:rgba(255,247,220,.72);box-shadow:inset 0 0 0 1px rgba(180,164,119,.10);pointer-events:none}
      .booki-reading-row-marker{position:absolute;z-index:4;right:4.0%;width:14.3%;height:20.4%;border-radius:17px;background:rgba(144,242,174,.30);box-shadow:inset 0 0 0 2px rgba(78,202,124,.45),0 0 12px rgba(62,193,110,.17);pointer-events:none;transition:top .14s ease}
      .booki-reading-mode-overlay{position:absolute;z-index:5;left:22.1%;bottom:3.8%;width:48.6%;height:19.3%;display:flex;align-items:center;justify-content:center;border-radius:999px;background:rgba(17,126,65,.94);box-shadow:inset 0 1px 0 rgba(255,255,255,.12);color:#baf1c9;font:900 clamp(.88rem,4vw,1.16rem)/1 Heebo,Arial,sans-serif;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 10px;box-sizing:border-box}
      [hidden]{display:none!important}

      .booki-reading-art-fallback{display:none;position:absolute;z-index:2;left:4%;right:17%;top:15%;bottom:15%;border:0;border-radius:58px;background:#27b862;color:#fff;font:900 2rem/1 Heebo,Arial,sans-serif}
      .booki-reading-dial.art-failed .booki-reading-art-fallback{display:block}
      .booki-reading-dial.art-failed .booki-reading-generator-hit-main{display:none}
      .booki-reading-dial-status:empty{display:none}
      .booki-reading-dial-status{margin:4px 0 0;color:#a83f36;font-size:.8rem;font-weight:700}
      .booki-reading-dial-sr{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}

      @media(max-width:370px){
        .booki-reading-dial{width:98vw;margin-inline:-1vw}
        .booki-reading-mode-overlay{font-size:.84rem}
      }
      @media(prefers-reduced-motion:reduce){
        .booki-reading-generator-art,.booki-reading-row-marker{transition:none!important}
      }
    `;
    document.head.appendChild(style);
  }

  function init() {
    installStyle();
    build();
    cleanLegacyHome();
    watchHome();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.BookiReadingDial = { select, runSelected, reset: resetForHome, modes: MODES };
})();