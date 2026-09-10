/**
 * Booki reading selector v5 — one button, one side reel, one immediate action.
 * The four reading modes keep their existing actions. The home UI is intentionally
 * clean: no question bubble, no helper copy, no intermediate chooser.
 */
(function () {
  'use strict';
  if (window.BookiReadingDial) return;

  const MODES = [
    { id: 'app',     icon: '📚', reelIcon: '📚', label: 'קריאה בבוקי',   action: 'enterAppStoryReading' },
    { id: 'letters', icon: 'אב', reelIcon: 'אב', label: 'קוראים אותיות', action: 'showLettersReading' },
    { id: 'timer',   icon: '⏱️', reelIcon: '⏱️', label: 'ספר עם שעון',   action: 'startBookiReading' },
    { id: 'report',  icon: '📋', reelIcon: '📋', label: 'דיווח קריאה',   action: 'startBookReading' },
  ];

  let selected = 0;
  let dragging = false;
  let wasMainActive = false;

  const $ = id => document.getElementById(id);
  const current = () => MODES[selected];

  function render(announce = false) {
    const shell = $('booki-reading-dial');
    const reel = $('booki-reading-reel');
    const start = $('booki-reading-dial-start');
    const icon = $('booki-reading-main-icon');
    const mode = $('booki-reading-main-mode');
    if (!shell || !reel || !start || !icon || !mode) return;

    const item = current();
    shell.dataset.selected = item.id;
    reel.setAttribute('aria-valuenow', String(selected));
    reel.setAttribute('aria-valuetext', item.label);
    start.setAttribute('aria-label', `התחל קריאה — ${item.label}`);
    icon.textContent = item.icon;
    mode.textContent = item.label;

    reel.querySelectorAll('.booki-reading-reel-slot').forEach((node, index) => {
      const active = index === selected;
      node.classList.toggle('is-selected', active);
      node.setAttribute('aria-selected', String(active));
      node.tabIndex = active ? 0 : -1;
    });

    start.classList.remove('mode-changed');
    requestAnimationFrame(() => start.classList.add('mode-changed'));

    if (announce) {
      const live = $('booki-reading-dial-live');
      if (live) live.textContent = `נבחרה ${item.label}`;
    }
  }

  function select(index, announce = true) {
    const next = Math.max(0, Math.min(MODES.length - 1, Number(index) || 0));
    if (next === selected) {
      render(false);
      return;
    }
    selected = next;
    render(announce);
    try { navigator.vibrate?.(8); } catch (_) {}
  }

  function selectFromPointer(event) {
    const track = $('booki-reading-reel-track');
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height - 1, event.clientY - rect.top));
    const index = Math.floor((y / rect.height) * MODES.length);
    select(index);
  }

  function runSelected() {
    const start = $('booki-reading-dial-start');
    if (start?.disabled) return;

    const item = current();
    const action = window[item.action];
    const status = $('booki-reading-dial-status');
    if (typeof action !== 'function') {
      if (status) status.textContent = 'רגע, בוקי עדיין מכין את אפשרות הקריאה הזאת. נסו שוב.';
      console.error('[booki-reading-selector] Missing action:', item.action);
      return;
    }

    if (status) status.textContent = '';
    if (start) start.disabled = true;
    try {
      if (typeof track === 'function') track('reading_mode_started', { mode: item.id });
    } catch (_) {}

    try {
      Promise.resolve(action()).catch(error => {
        console.error('[booki-reading-selector] Reading action failed:', error);
        if (status) status.textContent = 'משהו נתקע. נסו שוב.';
      }).finally(() => {
        setTimeout(() => { if (start) start.disabled = false; }, 450);
      });
    } catch (error) {
      console.error('[booki-reading-selector] Reading action failed:', error);
      if (status) status.textContent = 'משהו נתקע. נסו שוב.';
      if (start) start.disabled = false;
    }
  }

  function slot(item, index) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `booki-reading-reel-slot booki-reading-reel-slot-${index}`;
    node.dataset.index = String(index);
    node.setAttribute('role', 'option');
    node.setAttribute('aria-label', item.label);
    node.setAttribute('aria-selected', String(index === selected));
    node.innerHTML = `<span aria-hidden="true">${item.reelIcon}</span>`;
    node.addEventListener('pointerdown', event => {
      event.stopPropagation();
      select(index);
    });
    node.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      select(index);
    });
    node.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault(); select(Math.min(MODES.length - 1, selected + 1));
        $('booki-reading-reel')?.querySelector('.is-selected')?.focus();
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault(); select(Math.max(0, selected - 1));
        $('booki-reading-reel')?.querySelector('.is-selected')?.focus();
      }
    });
    return node;
  }

  function cleanLegacyHome() {
    const bubble = document.querySelector('#screen-main .home-speech-bubble');
    if (bubble) {
      bubble.style.display = 'none';
      bubble.setAttribute('aria-hidden', 'true');
    }
    const oldHint = document.querySelector('#screen-main .home-start-hint');
    if (oldHint) oldHint.style.display = 'none';
    const oldConsole = document.querySelector('#screen-main .console-frame');
    if (oldConsole) {
      oldConsole.style.display = 'none';
      oldConsole.setAttribute('aria-hidden', 'true');
    }
    const chooser = $('reading-chooser-overlay');
    if (chooser) {
      chooser.style.display = 'none';
      chooser.setAttribute('aria-hidden', 'true');
    }
  }

  function build() {
    const oldStart = $('home-start-reading');
    const wrap = oldStart?.parentElement;
    if (!oldStart || !wrap || $('booki-reading-dial')) return;

    const shell = document.createElement('section');
    shell.id = 'booki-reading-dial';
    shell.className = 'booki-reading-dial';
    shell.setAttribute('aria-label', 'בחירת אופן הקריאה והתחלת קריאה');

    const machine = document.createElement('div');
    machine.className = 'booki-reading-machine';

    const start = document.createElement('button');
    start.type = 'button';
    start.id = 'booki-reading-dial-start';
    start.className = 'booki-reading-dial-start';
    start.innerHTML = `
      <span id="booki-reading-main-icon" class="booki-reading-main-icon" aria-hidden="true">📚</span>
      <strong class="booki-reading-main-title">התחל קריאה</strong>
      <span id="booki-reading-main-mode" class="booki-reading-main-mode">קריאה בבוקי</span>`;
    start.addEventListener('click', runSelected);

    const reel = document.createElement('div');
    reel.id = 'booki-reading-reel';
    reel.className = 'booki-reading-reel';
    reel.setAttribute('role', 'listbox');
    reel.setAttribute('aria-label', 'אופן הקריאה');
    reel.setAttribute('aria-orientation', 'vertical');
    reel.setAttribute('aria-valuemin', '0');
    reel.setAttribute('aria-valuemax', String(MODES.length - 1));

    const up = document.createElement('span');
    up.className = 'booki-reading-reel-arrow';
    up.setAttribute('aria-hidden', 'true');
    up.textContent = '▲';

    const track = document.createElement('div');
    track.id = 'booki-reading-reel-track';
    track.className = 'booki-reading-reel-track';
    MODES.forEach((item, index) => track.appendChild(slot(item, index)));

    const down = document.createElement('span');
    down.className = 'booki-reading-reel-arrow';
    down.setAttribute('aria-hidden', 'true');
    down.textContent = '▼';

    reel.append(up, track, down);
    machine.append(start, reel);

    const live = document.createElement('span');
    live.id = 'booki-reading-dial-live';
    live.className = 'booki-reading-dial-sr';
    live.setAttribute('aria-live', 'polite');

    const status = document.createElement('p');
    status.id = 'booki-reading-dial-status';
    status.className = 'booki-reading-dial-status';
    status.setAttribute('role', 'status');

    shell.append(machine, live, status);
    wrap.insertBefore(shell, oldStart);

    oldStart.style.display = 'none';
    oldStart.setAttribute('aria-hidden', 'true');
    oldStart.tabIndex = -1;
    cleanLegacyHome();

    // The reel grabs on the first touch and follows the finger vertically.
    reel.addEventListener('pointerdown', event => {
      if (event.target.closest('.booki-reading-reel-slot')) return;
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

    reel.addEventListener('wheel', event => {
      event.preventDefault();
      select(selected + (event.deltaY > 0 ? 1 : -1));
    }, { passive: false });

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

    // Legacy calls now perform the selected action directly — never reopen the old chooser.
    window.openReadingChooser = runSelected;
    render(false);
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
      #reading-chooser-overlay{display:none!important}
      #screen-main .console-frame{display:none!important}
      #screen-main .home-speech-bubble{display:none!important}
      #screen-main .home-start-hint{display:none!important}

      /* Mockup background: warm cream, soft green canopy shapes, peach corners and tiny pastel dots. */
      #screen-main.booki-world--home{
        background-color:#fff7df!important;
        background-image:
          radial-gradient(78% 31% at -8% 7%,rgba(210,226,190,.72) 0 52%,transparent 53%),
          radial-gradient(72% 28% at 108% 13%,rgba(210,229,196,.62) 0 53%,transparent 54%),
          radial-gradient(65% 23% at -9% 57%,rgba(250,194,163,.43) 0 51%,transparent 52%),
          radial-gradient(75% 27% at 111% 76%,rgba(228,207,205,.38) 0 52%,transparent 53%),
          radial-gradient(circle at 8% 72%,rgba(72,192,159,.25) 0 6px,transparent 7px),
          radial-gradient(circle at 95% 64%,rgba(151,129,175,.25) 0 7px,transparent 8px),
          radial-gradient(circle at 77% 87%,rgba(244,196,81,.28) 0 5px,transparent 6px),
          linear-gradient(180deg,#fff9e9 0%,#fff3d4 54%,#fff9e8 100%)!important;
        background-attachment:fixed!important;
      }
      #screen-main .home-ambient{display:none!important}
      #screen-main .home-console-wrap{padding-top:8px!important}
      #screen-main .home-console-stage{margin:0 auto 10px!important;position:relative;z-index:1}
      #screen-main .home-console-char{width:min(55vw,220px)!important;height:auto!important;filter:drop-shadow(0 14px 15px rgba(117,91,46,.12))}
      #screen-main .home-console-stage .booki-character-stage{min-height:auto!important}
      #screen-main .home-console-stage .booki-character-stage::before{opacity:.25!important}

      .booki-reading-dial{
        position:relative;z-index:2;width:min(94vw,560px);margin:2px auto 26px;
        direction:rtl;font-family:Heebo,Arial,sans-serif;text-align:center;
      }
      .booki-reading-machine{
        position:relative;width:100%;height:184px;margin:0 auto;
      }
      .booki-reading-dial-start{
        position:absolute;left:0;right:34px;top:8px;bottom:8px;z-index:1;
        border:0;border-radius:58px 50px 50px 58px;
        background:
          radial-gradient(circle at 26% 22%,rgba(117,243,166,.46),transparent 28%),
          linear-gradient(145deg,#3fd77a 0%,#24b95f 58%,#15934e 100%);
        color:#fff;box-shadow:
          inset 0 -10px 0 rgba(0,89,47,.13),
          inset 0 2px 0 rgba(255,255,255,.28),
          0 16px 32px rgba(26,136,75,.22);
        padding:20px 84px 18px 30px;cursor:pointer;
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;
        transition:transform .13s ease,box-shadow .13s ease,filter .18s ease;
        -webkit-tap-highlight-color:transparent;
      }
      .booki-reading-dial-start::after{
        content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
        background:linear-gradient(115deg,rgba(255,255,255,.18),transparent 35% 70%,rgba(0,92,48,.08));
      }
      .booki-reading-main-icon{position:relative;z-index:1;font-size:2.15rem;line-height:1;min-height:35px;display:grid;place-items:center}
      .booki-reading-main-title{position:relative;z-index:1;font:900 clamp(1.9rem,7.3vw,2.8rem)/1 Heebo,Arial,sans-serif;letter-spacing:-.025em;white-space:nowrap;text-shadow:0 2px 1px rgba(0,91,47,.12)}
      .booki-reading-main-mode{
        position:relative;z-index:1;min-width:min(72%,310px);max-width:82%;padding:8px 18px 9px;
        border-radius:999px;background:rgba(5,120,60,.33);box-shadow:inset 0 1px 0 rgba(255,255,255,.18);
        color:#cffff0;font:900 clamp(.92rem,4.2vw,1.18rem)/1.1 Heebo,Arial,sans-serif;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      }
      .booki-reading-dial-start:active{transform:translateY(3px);box-shadow:inset 0 -6px 0 rgba(0,89,47,.12),0 9px 20px rgba(26,136,75,.18)}
      .booki-reading-dial-start:focus-visible{outline:3px solid #2877b8;outline-offset:4px}
      .booki-reading-dial-start:disabled{opacity:.72;cursor:wait}
      .booki-reading-dial-start.mode-changed .booki-reading-main-icon,
      .booki-reading-dial-start.mode-changed .booki-reading-main-mode{animation:bookiModeFill .22s ease both}

      .booki-reading-reel{
        position:absolute;right:0;top:0;bottom:0;z-index:4;width:78px;
        display:grid;grid-template-rows:18px 1fr 18px;align-items:center;
        padding:7px 6px;border:3px solid rgba(54,171,102,.48);border-radius:42px;
        background:linear-gradient(180deg,rgba(255,249,229,.98),rgba(255,244,213,.98));
        box-shadow:inset 0 0 0 4px rgba(255,255,255,.48),0 10px 26px rgba(75,118,79,.20);
        touch-action:none;user-select:none;-webkit-tap-highlight-color:transparent;
      }
      .booki-reading-reel:focus-within{box-shadow:inset 0 0 0 4px rgba(255,255,255,.48),0 0 0 3px rgba(40,119,184,.28),0 10px 26px rgba(75,118,79,.20)}
      .booki-reading-reel-arrow{font:900 12px/1 Arial,sans-serif;color:#29935d;opacity:.82;pointer-events:none}
      .booki-reading-reel-track{height:100%;display:grid;grid-template-rows:repeat(4,1fr);gap:2px;align-items:stretch}
      .booki-reading-reel-slot{
        appearance:none;-webkit-appearance:none;border:0;background:transparent;margin:0;padding:0;
        border-radius:14px;display:grid;place-items:center;color:#326a54;
        font:900 1.32rem/1 Heebo,Arial,sans-serif;cursor:grab;
        transition:background .16s ease,box-shadow .16s ease,transform .16s ease,filter .16s ease;
        -webkit-tap-highlight-color:transparent;
      }
      .booki-reading-reel-slot span{display:grid;place-items:center;min-width:38px;min-height:30px}
      .booki-reading-reel-slot.is-selected{
        background:linear-gradient(180deg,#dcffe8,#c8f6d7);
        box-shadow:inset 0 0 0 2px rgba(104,211,146,.46),0 3px 8px rgba(49,151,91,.13);
        transform:scale(1.06);filter:saturate(1.08);
      }
      .booki-reading-reel-slot:focus-visible{outline:2px solid #2877b8;outline-offset:1px}

      .booki-reading-dial-status:empty{display:none}
      .booki-reading-dial-status{margin:5px 0 0;color:#a83f36;font-size:.8rem;font-weight:700}
      .booki-reading-dial-sr{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}

      @keyframes bookiModeFill{
        from{opacity:.55;transform:translateY(4px) scale(.98)}
        to{opacity:1;transform:none}
      }

      @media(max-width:370px){
        .booki-reading-dial{width:min(95vw,344px)}
        .booki-reading-machine{height:164px}
        .booki-reading-reel{width:70px;border-radius:37px}
        .booki-reading-dial-start{right:30px;border-radius:50px;padding-right:75px;gap:6px}
        .booki-reading-main-icon{font-size:1.85rem;min-height:30px}
        .booki-reading-main-title{font-size:1.72rem}
        .booki-reading-main-mode{font-size:.9rem;padding:7px 13px 8px}
        .booki-reading-reel-slot{font-size:1.12rem}
      }
      @media(prefers-reduced-motion:reduce){
        .booki-reading-dial-start,.booki-reading-main-icon,.booki-reading-main-mode,.booki-reading-reel-slot{transition:none!important;animation:none!important}
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