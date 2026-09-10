/**
 * Booki reading dial — one choice, one action.
 * The four reading modes are equal stations on one rotary selector.
 * The only primary action button is the center: "התחל קריאה".
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
  let moved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let lastPreview = 0;
  let suppressClickUntil = 0;
  let wasMainActive = false;

  const $ = id => document.getElementById(id);
  const currentMode = () => MODES[selected];

  function normalizeAngle(value) {
    value %= 360;
    return value < 0 ? value + 360 : value;
  }

  function angleForPointer(event, wheel) {
    const rect = wheel.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return normalizeAngle(Math.atan2(event.clientX - cx, -(event.clientY - cy)) * 180 / Math.PI);
  }

  function nearestIndex(angle) {
    return Math.round(normalizeAngle(angle) / 90) % MODES.length;
  }

  function updateReadout(index, announce = false) {
    const item = MODES[index];
    const icon = $('booki-reading-dial-readout-icon');
    const name = $('booki-reading-dial-readout-name');
    const live = $('booki-reading-dial-live');
    if (icon) icon.textContent = item.icon;
    if (name) name.textContent = item.label;
    if (announce && live) live.textContent = `נבחרה ${item.label}`;
  }

  function updateStations(index) {
    $('booki-reading-dial-wheel')?.querySelectorAll('.booki-reading-dial-station').forEach((node, i) => {
      const active = i === index;
      node.classList.toggle('is-selected', active);
      node.setAttribute('aria-checked', String(active));
      node.tabIndex = active ? 0 : -1;
    });
  }

  function renderSelection({ announce = false } = {}) {
    const control = $('booki-reading-dial-control');
    const rotor = $('booki-reading-dial-rotor');
    const start = $('booki-reading-dial-start');
    if (!control || !rotor || !start) return;

    const angle = selected * 90;
    rotor.style.transform = `rotate(${angle}deg)`;
    control.setAttribute('aria-valuenow', String(selected));
    control.setAttribute('aria-valuetext', currentMode().label);
    start.setAttribute('aria-label', `התחל קריאה — ${currentMode().label}`);
    updateReadout(selected, announce);
    updateStations(selected);
    lastPreview = selected;
  }

  function previewAngle(angle) {
    const rotor = $('booki-reading-dial-rotor');
    if (rotor) {
      rotor.style.transition = 'none';
      rotor.style.transform = `rotate(${angle}deg)`;
    }
    const index = nearestIndex(angle);
    if (index !== lastPreview) {
      lastPreview = index;
      updateReadout(index, false);
      updateStations(index);
      try { navigator.vibrate?.(7); } catch (_) {}
    }
  }

  function select(index, { announce = true } = {}) {
    selected = ((Number(index) || 0) % MODES.length + MODES.length) % MODES.length;
    const rotor = $('booki-reading-dial-rotor');
    if (rotor) rotor.style.transition = '';
    renderSelection({ announce });
  }

  function finishAtAngle(angle) {
    select(nearestIndex(angle), { announce: true });
  }

  function runSelected() {
    if (Date.now() < suppressClickUntil) return;
    const start = $('booki-reading-dial-start');
    if (start?.disabled) return;

    const item = currentMode();
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
      const result = action();
      Promise.resolve(result).catch(error => {
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
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `booki-reading-dial-station booki-reading-dial-station-${index}`;
    node.dataset.mode = item.id;
    node.setAttribute('role', 'radio');
    node.setAttribute('aria-label', item.label);
    node.innerHTML = `<span class="booki-reading-dial-station-icon" aria-hidden="true">${item.icon}</span><span class="booki-reading-dial-station-label">${item.label}</span>`;
    node.addEventListener('click', event => {
      event.stopPropagation();
      select(index);
    });
    node.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault(); select(selected + 1); $('booki-reading-dial-wheel')?.querySelector('.is-selected')?.focus();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault(); select(selected - 1); $('booki-reading-dial-wheel')?.querySelector('.is-selected')?.focus();
      }
    });
    return node;
  }

  function build() {
    const oldStart = $('home-start-reading');
    const wrap = oldStart?.parentElement;
    if (!oldStart || !wrap || $('booki-reading-dial')) return;

    const shell = document.createElement('section');
    shell.id = 'booki-reading-dial';
    shell.className = 'booki-reading-dial';
    shell.setAttribute('aria-labelledby', 'booki-reading-dial-title');

    const title = document.createElement('p');
    title.id = 'booki-reading-dial-title';
    title.className = 'booki-reading-dial-title';
    title.textContent = 'איך בא לך לקרוא היום?';

    // Passive readout: intentionally a DIV, not a button, with no button-like chrome.
    const readout = document.createElement('div');
    readout.id = 'booki-reading-dial-readout';
    readout.className = 'booki-reading-dial-readout';
    readout.setAttribute('aria-hidden', 'true');
    readout.innerHTML = `
      <span class="booki-reading-dial-readout-caption">נבחר עכשיו</span>
      <span class="booki-reading-dial-readout-value">
        <span id="booki-reading-dial-readout-icon" aria-hidden="true">📚</span>
        <strong id="booki-reading-dial-readout-name">קריאה בבוקי</strong>
      </span>`;

    const wheel = document.createElement('div');
    wheel.id = 'booki-reading-dial-wheel';
    wheel.className = 'booki-reading-dial-wheel';
    wheel.setAttribute('role', 'radiogroup');
    wheel.setAttribute('aria-label', 'בחירת אופן הקריאה');
    MODES.forEach((item, index) => wheel.appendChild(station(item, index)));

    const control = document.createElement('div');
    control.id = 'booki-reading-dial-control';
    control.className = 'booki-reading-dial-control';
    control.setAttribute('role', 'slider');
    control.setAttribute('tabindex', '0');
    control.setAttribute('aria-label', 'סיבוב לבחירת אופן הקריאה');
    control.setAttribute('aria-valuemin', '0');
    control.setAttribute('aria-valuemax', String(MODES.length - 1));
    control.setAttribute('aria-valuenow', '0');
    control.setAttribute('aria-valuetext', MODES[0].label);

    const rotor = document.createElement('div');
    rotor.id = 'booki-reading-dial-rotor';
    rotor.className = 'booki-reading-dial-rotor';
    rotor.setAttribute('aria-hidden', 'true');
    rotor.innerHTML = '<span class="booki-reading-dial-handle"></span><span class="booki-reading-dial-pointer"></span>';

    const start = document.createElement('button');
    start.type = 'button';
    start.id = 'booki-reading-dial-start';
    start.className = 'booki-reading-dial-start';
    start.innerHTML = '<span class="booki-reading-dial-start-icon" aria-hidden="true">▶</span><strong>התחל קריאה</strong>';
    start.addEventListener('click', runSelected);

    control.append(rotor, start);
    wheel.appendChild(control);

    const hint = document.createElement('p');
    hint.className = 'booki-reading-dial-hint';
    hint.innerHTML = '<strong>מסובבים לבחירה</strong><span aria-hidden="true"> · </span>לוחצים במרכז ומתחילים';

    const live = document.createElement('span');
    live.id = 'booki-reading-dial-live';
    live.className = 'booki-reading-dial-sr';
    live.setAttribute('aria-live', 'polite');

    const status = document.createElement('p');
    status.id = 'booki-reading-dial-status';
    status.className = 'booki-reading-dial-status';
    status.setAttribute('role', 'status');

    shell.append(title, readout, wheel, hint, live, status);
    wrap.insertBefore(shell, oldStart);

    oldStart.style.display = 'none';
    oldStart.setAttribute('aria-hidden', 'true');
    oldStart.tabIndex = -1;
    const oldHint = wrap.querySelector('.home-start-hint');
    if (oldHint) oldHint.style.display = 'none';
    const oldConsole = wrap.querySelector('.console-frame');
    if (oldConsole) { oldConsole.style.display = 'none'; oldConsole.setAttribute('aria-hidden', 'true'); }
    const chooser = $('reading-chooser-overlay');
    if (chooser) { chooser.style.display = 'none'; chooser.setAttribute('aria-hidden', 'true'); }

    control.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); select(selected + 1); }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); select(selected - 1); }
      else if (event.key === 'Home') { event.preventDefault(); select(0); }
      else if (event.key === 'End') { event.preventDefault(); select(MODES.length - 1); }
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); runSelected(); }
    });

    control.addEventListener('pointerdown', event => {
      dragging = true;
      moved = false;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
    });

    control.addEventListener('pointermove', event => {
      if (!dragging) return;
      const distance = Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY);
      if (!moved && distance < 8) return;
      moved = true;
      control.setPointerCapture?.(event.pointerId);
      previewAngle(angleForPointer(event, wheel));
      event.preventDefault();
    });

    const finishDrag = event => {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        finishAtAngle(angleForPointer(event, wheel));
        suppressClickUntil = Date.now() + 360;
      } else {
        renderSelection();
      }
      try { control.releasePointerCapture?.(event.pointerId); } catch (_) {}
    };
    control.addEventListener('pointerup', finishDrag);
    control.addEventListener('pointercancel', finishDrag);

    // The former chooser no longer opens another decision screen.
    window.openReadingChooser = runSelected;
    renderSelection();
  }

  function resetForHome() {
    selected = 0;
    const status = $('booki-reading-dial-status');
    if (status) status.textContent = '';
    renderSelection({ announce: false });
  }

  function watchHome() {
    const main = $('screen-main');
    if (!main) return;
    wasMainActive = main.classList.contains('active');
    if (wasMainActive) resetForHome();
    const observer = new MutationObserver(() => {
      const active = main.classList.contains('active');
      if (active && !wasMainActive) resetForHome();
      wasMainActive = active;
    });
    observer.observe(main, { attributes: true, attributeFilter: ['class'] });
  }

  function installStyle() {
    if ($('booki-reading-dial-style')) return;
    const style = document.createElement('style');
    style.id = 'booki-reading-dial-style';
    style.textContent = `
      #screen-main .console-frame{display:none!important}
      #reading-chooser-overlay{display:none!important}
      .booki-reading-dial{width:min(100%,390px);margin:8px auto 18px;text-align:center;font-family:Heebo,Arial,sans-serif;direction:rtl;color:#294b3e}
      .booki-reading-dial-title{margin:0 0 2px;font-size:1.02rem;font-weight:900;color:#28483d}

      /* Passive information only — deliberately no border, background, shadow or pointer affordance. */
      .booki-reading-dial-readout{display:flex;align-items:center;justify-content:center;gap:7px;min-height:43px;margin:0 auto 1px;padding:0;color:#4f6e60;pointer-events:none;user-select:none;cursor:default}
      .booki-reading-dial-readout-caption{font-size:.72rem;font-weight:700;opacity:.72}
      .booki-reading-dial-readout-value{display:inline-flex;align-items:center;gap:5px;font-size:.98rem;line-height:1.25;color:#236a49}
      .booki-reading-dial-readout-value strong{font-weight:900}

      .booki-reading-dial-wheel{position:relative;width:min(90vw,326px);aspect-ratio:1;margin:0 auto;isolation:isolate;touch-action:none}
      .booki-reading-dial-wheel::before{content:"";position:absolute;inset:48px;border-radius:50%;border:2px solid rgba(79,151,113,.26);background:rgba(232,247,238,.42);box-shadow:inset 0 0 0 12px rgba(255,255,255,.35);z-index:-2}
      .booki-reading-dial-wheel::after{content:"";position:absolute;inset:66px;border-radius:50%;border:1px dashed rgba(65,135,101,.30);z-index:-1}

      /* These are stations on one dial, not four CTA cards: no box, fill, shadow or card outline. */
      .booki-reading-dial-station{position:absolute;width:88px;min-height:56px;padding:3px;border:0;background:transparent;box-shadow:none;color:#47685a;font:800 12.5px/1.18 Heebo,Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;z-index:5;transition:color .18s ease,transform .18s ease,opacity .18s ease}
      .booki-reading-dial-station-0{top:0;left:50%;transform:translateX(-50%)}
      .booki-reading-dial-station-1{right:-1px;top:50%;transform:translateY(-50%)}
      .booki-reading-dial-station-2{bottom:0;left:50%;transform:translateX(-50%)}
      .booki-reading-dial-station-3{left:-1px;top:50%;transform:translateY(-50%)}
      .booki-reading-dial-station-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;font-size:20px;line-height:1;background:rgba(255,255,255,.78);border:1px solid rgba(92,153,124,.20);transition:background .18s ease,transform .18s ease,border-color .18s ease}
      .booki-reading-dial-station-label{max-width:88px}
      .booki-reading-dial-station.is-selected{color:#176c46}
      .booki-reading-dial-station.is-selected .booki-reading-dial-station-icon{background:#e1f6e9;border-color:#47a879;transform:scale(1.12)}
      .booki-reading-dial-station-0.is-selected{transform:translateX(-50%) scale(1.04)}
      .booki-reading-dial-station-1.is-selected{transform:translateY(-50%) scale(1.04)}
      .booki-reading-dial-station-2.is-selected{transform:translateX(-50%) scale(1.04)}
      .booki-reading-dial-station-3.is-selected{transform:translateY(-50%) scale(1.04)}

      .booki-reading-dial-control{position:absolute;left:50%;top:50%;width:176px;height:176px;transform:translate(-50%,-50%);border-radius:50%;z-index:4;touch-action:none;cursor:grab}
      .booki-reading-dial-control:active{cursor:grabbing}
      .booki-reading-dial-rotor{position:absolute;inset:0;border-radius:50%;border:4px solid #b9dfca;background:linear-gradient(145deg,rgba(255,255,255,.86),rgba(219,241,228,.88));box-shadow:inset 0 2px 5px rgba(255,255,255,.95),0 7px 18px rgba(38,86,64,.12);transition:transform .30s cubic-bezier(.2,.85,.25,1.15);pointer-events:none}
      .booki-reading-dial-handle{position:absolute;top:7px;left:50%;width:28px;height:12px;transform:translateX(-50%);border-radius:999px;background:#278e5d;box-shadow:0 2px 6px rgba(32,108,72,.22)}
      .booki-reading-dial-pointer{position:absolute;top:-13px;left:50%;width:0;height:0;transform:translateX(-50%);border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:12px solid #278e5d}

      /* The center is the ONE real action button. */
      .booki-reading-dial-start{position:absolute;left:50%;top:50%;width:132px;height:132px;transform:translate(-50%,-50%);border:0;border-radius:50%;background:linear-gradient(160deg,#31b970,#188f50);color:#fff;box-shadow:inset 0 -7px 0 rgba(0,0,0,.08),0 8px 18px rgba(34,112,74,.22);font-family:Heebo,Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:15px;cursor:pointer;z-index:3}
      .booki-reading-dial-start strong{font-size:1.2rem;line-height:1.15;font-weight:900}
      .booki-reading-dial-start-icon{font-size:1.15rem;line-height:1;direction:ltr}
      .booki-reading-dial-start:active{transform:translate(-50%,-48%);box-shadow:inset 0 -4px 0 rgba(0,0,0,.08),0 5px 12px rgba(34,112,74,.18)}
      .booki-reading-dial-start:disabled{opacity:.72;cursor:wait}

      .booki-reading-dial-hint{margin:5px 0 0;color:#667c72;font-size:.76rem;line-height:1.45}.booki-reading-dial-hint strong{color:#315849}
      .booki-reading-dial-status{min-height:1.25em;margin:4px 0 0;color:#a83f36;font-size:.8rem;font-weight:700}
      .booki-reading-dial-sr{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
      .booki-reading-dial-station:focus-visible,.booki-reading-dial-control:focus-visible,.booki-reading-dial-start:focus-visible{outline:3px solid #2877b8;outline-offset:3px}

      @media(max-width:370px){
        .booki-reading-dial-wheel{width:304px}
        .booki-reading-dial-station{width:78px;font-size:11.7px}
        .booki-reading-dial-station-label{max-width:78px}
        .booki-reading-dial-control{width:164px;height:164px}
        .booki-reading-dial-start{width:124px;height:124px}
      }
      @media(prefers-reduced-motion:reduce){.booki-reading-dial-station,.booki-reading-dial-station-icon,.booki-reading-dial-rotor{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    installStyle();
    build();
    watchHome();
  }

  window.BookiReadingDial = {
    version: '2026-09-10.3',
    modes: MODES.map(({ id, label }) => ({ id, label })),
    select: idOrIndex => {
      const index = typeof idOrIndex === 'string' ? MODES.findIndex(item => item.id === idOrIndex) : Number(idOrIndex);
      if (index >= 0) select(index);
    },
    getSelected: () => currentMode().id,
    start: runSelected,
    reset: resetForHome,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
