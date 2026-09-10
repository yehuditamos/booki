/**
 * Booki reading dial v4 — one question, one selector, one action.
 * Four equal reading modes sit on one ring. Only the center is a CTA button.
 */
(function () {
  'use strict';
  if (window.BookiReadingDial) return;

  const MODES = [
    { id: 'app',     icon: '📚', label: 'קריאה בבוקי',   action: 'enterAppStoryReading' },
    { id: 'letters', icon: 'א',  label: 'קוראים אותיות', action: 'showLettersReading' },
    { id: 'timer',   icon: '⏱️', label: 'ספר עם שעון',   action: 'startBookiReading' },
    { id: 'report',  icon: '✓',  label: 'דיווח קריאה',   action: 'startBookReading' },
  ];

  let selected = 0;
  let dragging = false;
  let wasMainActive = false;

  const $ = id => document.getElementById(id);
  const current = () => MODES[selected];

  function normalizeAngle(value) {
    value %= 360;
    return value < 0 ? value + 360 : value;
  }

  function pointerAngle(event, wheel) {
    const rect = wheel.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return normalizeAngle(Math.atan2(event.clientX - cx, -(event.clientY - cy)) * 180 / Math.PI);
  }

  function nearestIndex(angle) {
    return Math.round(normalizeAngle(angle) / 90) % MODES.length;
  }

  function render(announce = false) {
    const wheel = $('booki-reading-dial-wheel');
    const start = $('booki-reading-dial-start');
    if (!wheel || !start) return;

    wheel.dataset.selected = current().id;
    wheel.setAttribute('aria-valuenow', String(selected));
    wheel.setAttribute('aria-valuetext', current().label);
    start.setAttribute('aria-label', `התחל קריאה — ${current().label}`);

    wheel.querySelectorAll('.booki-reading-dial-station').forEach((node, index) => {
      node.classList.toggle('is-selected', index === selected);
    });

    if (announce) {
      const live = $('booki-reading-dial-live');
      if (live) live.textContent = `נבחרה ${current().label}`;
    }
  }

  function select(index, announce = true) {
    const next = ((Number(index) || 0) % MODES.length + MODES.length) % MODES.length;
    if (next === selected) {
      render(false);
      return;
    }
    selected = next;
    render(announce);
    try { navigator.vibrate?.(8); } catch (_) {}
  }

  function selectFromPointer(event) {
    const wheel = $('booki-reading-dial-wheel');
    if (!wheel) return;
    select(nearestIndex(pointerAngle(event, wheel)));
  }

  function runSelected() {
    const start = $('booki-reading-dial-start');
    if (start?.disabled) return;

    const item = current();
    const action = window[item.action];
    const status = $('booki-reading-dial-status');
    if (typeof action !== 'function') {
      if (status) status.textContent = 'רגע, בוקי עדיין מכין את אפשרות הקריאה הזאת. נסו שוב.';
      console.error('[booki-reading-dial] Missing action:', item.action);
      return;
    }

    if (status) status.textContent = '';
    if (start) start.disabled = true;
    try {
      if (typeof track === 'function') track('reading_mode_started', { mode: item.id });
    } catch (_) {}

    try {
      Promise.resolve(action()).catch(error => {
        console.error('[booki-reading-dial] Reading action failed:', error);
        if (status) status.textContent = 'משהו נתקע. נסו שוב.';
      }).finally(() => {
        setTimeout(() => { if (start) start.disabled = false; }, 450);
      });
    } catch (error) {
      console.error('[booki-reading-dial] Reading action failed:', error);
      if (status) status.textContent = 'משהו נתקע. נסו שוב.';
      if (start) start.disabled = false;
    }
  }

  function station(item, index) {
    const node = document.createElement('div');
    node.className = `booki-reading-dial-station booki-reading-dial-station-${index}`;
    node.dataset.mode = item.id;
    node.setAttribute('aria-hidden', 'true');
    node.innerHTML = `<span class="booki-reading-dial-station-icon">${item.icon}</span><span class="booki-reading-dial-station-label">${item.label}</span>`;
    return node;
  }

  function applyQuestion() {
    const encouragement = $('home-encouragement');
    if (encouragement) encouragement.textContent = 'איך נקרא היום?';
  }

  function build() {
    const oldStart = $('home-start-reading');
    const wrap = oldStart?.parentElement;
    if (!oldStart || !wrap || $('booki-reading-dial')) return;

    const shell = document.createElement('section');
    shell.id = 'booki-reading-dial';
    shell.className = 'booki-reading-dial';
    shell.setAttribute('aria-label', 'בחירת אופן הקריאה');

    const wheel = document.createElement('div');
    wheel.id = 'booki-reading-dial-wheel';
    wheel.className = 'booki-reading-dial-wheel';
    wheel.setAttribute('role', 'slider');
    wheel.tabIndex = 0;
    wheel.setAttribute('aria-label', 'אופן הקריאה');
    wheel.setAttribute('aria-valuemin', '0');
    wheel.setAttribute('aria-valuemax', String(MODES.length - 1));

    MODES.forEach((item, index) => wheel.appendChild(station(item, index)));

    const start = document.createElement('button');
    start.type = 'button';
    start.id = 'booki-reading-dial-start';
    start.className = 'booki-reading-dial-start';
    start.innerHTML = '<span class="booki-reading-dial-start-icon" aria-hidden="true">▶</span><strong>התחל קריאה</strong>';
    start.addEventListener('pointerdown', event => event.stopPropagation());
    start.addEventListener('click', event => {
      event.stopPropagation();
      runSelected();
    });
    wheel.appendChild(start);

    const live = document.createElement('span');
    live.id = 'booki-reading-dial-live';
    live.className = 'booki-reading-dial-sr';
    live.setAttribute('aria-live', 'polite');

    const status = document.createElement('p');
    status.id = 'booki-reading-dial-status';
    status.className = 'booki-reading-dial-status';
    status.setAttribute('role', 'status');

    shell.append(wheel, live, status);
    wrap.insertBefore(shell, oldStart);

    oldStart.style.display = 'none';
    oldStart.setAttribute('aria-hidden', 'true');
    oldStart.tabIndex = -1;

    const oldHint = wrap.querySelector('.home-start-hint');
    if (oldHint) oldHint.style.display = 'none';
    const oldConsole = wrap.querySelector('.console-frame');
    if (oldConsole) {
      oldConsole.style.display = 'none';
      oldConsole.setAttribute('aria-hidden', 'true');
    }
    const chooser = $('reading-chooser-overlay');
    if (chooser) {
      chooser.style.display = 'none';
      chooser.setAttribute('aria-hidden', 'true');
    }

    // The whole dial surface (except the center CTA) grabs on the first touch.
    // There is no movement threshold: the first pointer-down already snaps to a mode.
    wheel.addEventListener('pointerdown', event => {
      if (event.target.closest('#booki-reading-dial-start')) return;
      dragging = true;
      wheel.setPointerCapture?.(event.pointerId);
      selectFromPointer(event);
      event.preventDefault();
    });

    wheel.addEventListener('pointermove', event => {
      if (!dragging) return;
      selectFromPointer(event);
      event.preventDefault();
    });

    const endDrag = event => {
      if (!dragging) return;
      dragging = false;
      selectFromPointer(event);
      try { wheel.releasePointerCapture?.(event.pointerId); } catch (_) {}
    };
    wheel.addEventListener('pointerup', endDrag);
    wheel.addEventListener('pointercancel', () => { dragging = false; });

    wheel.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault(); select(selected + 1);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault(); select(selected - 1);
      } else if (event.key === 'Home') {
        event.preventDefault(); select(0);
      } else if (event.key === 'End') {
        event.preventDefault(); select(MODES.length - 1);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); runSelected();
      }
    });

    // Legacy calls perform the selected action directly — never open the old chooser.
    window.openReadingChooser = runSelected;
    render(false);
  }

  function resetForHome() {
    selected = 0;
    const status = $('booki-reading-dial-status');
    if (status) status.textContent = '';
    applyQuestion();
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
      wasMainActive = active;
    }).observe(main, { attributes: true, attributeFilter: ['class'] });
  }

  function installStyle() {
    if ($('booki-reading-dial-style')) return;
    const style = document.createElement('style');
    style.id = 'booki-reading-dial-style';
    style.textContent = `
      #screen-main .console-frame{display:none!important}
      #reading-chooser-overlay{display:none!important}
      .booki-reading-dial{width:min(100%,370px);margin:0 auto 8px;text-align:center;font-family:Heebo,Arial,sans-serif;direction:rtl}
      .booki-reading-dial-wheel{position:relative;width:min(84vw,310px);aspect-ratio:1;margin:0 auto;touch-action:none;user-select:none;cursor:grab;outline:none}
      .booki-reading-dial-wheel:active{cursor:grabbing}
      .booki-reading-dial-wheel::before{content:"";position:absolute;inset:45px;border-radius:50%;border:2px solid rgba(63,143,101,.24);box-shadow:inset 0 0 0 12px rgba(230,247,237,.38);pointer-events:none}
      .booki-reading-dial-wheel::after{content:"";position:absolute;inset:64px;border-radius:50%;border:1px dashed rgba(63,143,101,.22);pointer-events:none}

      .booki-reading-dial-station{position:absolute;width:88px;min-height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;color:#4d6b5e;font:800 12.5px/1.15 Heebo,Arial,sans-serif;pointer-events:none;transition:transform .16s ease,color .16s ease}
      .booki-reading-dial-station-0{top:0;left:50%;transform:translateX(-50%)}
      .booki-reading-dial-station-1{right:-2px;top:50%;transform:translateY(-50%)}
      .booki-reading-dial-station-2{bottom:0;left:50%;transform:translateX(-50%)}
      .booki-reading-dial-station-3{left:-2px;top:50%;transform:translateY(-50%)}
      .booki-reading-dial-station-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;font-size:21px;line-height:1;background:transparent;transition:transform .16s ease,box-shadow .16s ease,background .16s ease}
      .booki-reading-dial-station-label{max-width:88px;transition:transform .16s ease,color .16s ease}
      .booki-reading-dial-station.is-selected{color:#116d45}
      .booki-reading-dial-station.is-selected .booki-reading-dial-station-icon{background:#f4fff7;box-shadow:0 0 0 5px rgba(53,181,113,.30),0 0 24px rgba(28,176,94,.42);transform:scale(1.16)}
      .booki-reading-dial-station.is-selected .booki-reading-dial-station-label{transform:scale(1.06);color:#126d46}
      .booki-reading-dial-station-0.is-selected{transform:translateX(-50%) scale(1.03)}
      .booki-reading-dial-station-1.is-selected{transform:translateY(-50%) scale(1.03)}
      .booki-reading-dial-station-2.is-selected{transform:translateX(-50%) scale(1.03)}
      .booki-reading-dial-station-3.is-selected{transform:translateY(-50%) scale(1.03)}

      .booki-reading-dial-start{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:142px;height:142px;border:0;border-radius:50%;background:linear-gradient(160deg,#2eb86f,#199052);color:#fff;box-shadow:inset 0 -7px 0 rgba(0,0,0,.09),0 9px 23px rgba(24,126,74,.20);font:900 1.2rem/1.2 Heebo,Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;cursor:pointer;z-index:3}
      .booki-reading-dial-start-icon{font-size:1.45rem;line-height:1}
      .booki-reading-dial-start:active{transform:translate(-50%,calc(-50% + 2px));box-shadow:inset 0 -4px 0 rgba(0,0,0,.09),0 6px 18px rgba(24,126,74,.18)}
      .booki-reading-dial-start:disabled{opacity:.72;cursor:wait}
      .booki-reading-dial-wheel:focus-visible{outline:3px solid #2877b8;outline-offset:4px;border-radius:50%}
      .booki-reading-dial-start:focus-visible{outline:3px solid #2877b8;outline-offset:3px}
      .booki-reading-dial-status:empty{display:none}
      .booki-reading-dial-status{margin:5px 0 0;color:#a83f36;font-size:.8rem;font-weight:700}
      .booki-reading-dial-sr{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
      @media(max-width:370px){.booki-reading-dial-wheel{width:288px}.booki-reading-dial-station{width:80px;font-size:12px}.booki-reading-dial-start{width:132px;height:132px}.booki-reading-dial-station-icon{width:35px;height:35px}}
      @media(prefers-reduced-motion:reduce){.booki-reading-dial-station,.booki-reading-dial-station-icon,.booki-reading-dial-station-label{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    installStyle();
    build();
    applyQuestion();
    watchHome();
  }

  // Unify the two old home prompts into the single product question chosen for the pilot.
  window.getPersonalHomeQuestion = () => 'איך נקרא היום?';
  window.renderHomeEncouragement = applyQuestion;

  window.BookiReadingDial = {
    version: '2026-09-10.4',
    modes: MODES.map(({ id, label }) => ({ id, label })),
    select: idOrIndex => {
      const index = typeof idOrIndex === 'string' ? MODES.findIndex(item => item.id === idOrIndex) : Number(idOrIndex);
      if (index >= 0) select(index);
    },
    getSelected: () => current().id,
    start: runSelected,
    reset: resetForHome,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
