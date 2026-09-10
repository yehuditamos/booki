/**
 * Booki reading dial — one decision, one action.
 * Replaces: "Start reading" -> chooser -> another click.
 * New flow: choose the reading mode on the dial -> press the center once -> go.
 * All four existing reading modes receive equal visual weight.
 */
(function () {
  'use strict';
  if (window.BookiReadingDial) return;

  const MODES = [
    { id: 'app',     icon: '📚', label: 'קריאה בבוקי',   short: 'סיפור בבוקי',  action: 'enterAppStoryReading' },
    { id: 'letters', icon: 'א',  label: 'קוראים אותיות', short: 'אותיות',       action: 'showLettersReading' },
    { id: 'timer',   icon: '⏱️', label: 'ספר עם שעון',   short: 'עם שעון',      action: 'startBookiReading' },
    { id: 'report',  icon: '✓',  label: 'דיווח קריאה',   short: 'כבר קראתי',    action: 'startBookReading' },
  ];

  let selected = 0;
  let dragging = false;
  let moved = false;
  let suppressClickUntil = 0;
  let wasMainActive = false;

  const $ = id => document.getElementById(id);
  const mode = () => MODES[selected];

  function normalizeAngle(value) {
    value %= 360;
    return value < 0 ? value + 360 : value;
  }

  function angleForPointer(event, wheel) {
    const rect = wheel.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    return normalizeAngle(Math.atan2(dx, -dy) * 180 / Math.PI);
  }

  function nearestIndex(angle) {
    return Math.round(normalizeAngle(angle) / 90) % MODES.length;
  }

  function announceSelection() {
    const live = $('booki-reading-dial-live');
    if (live) live.textContent = `נבחרה ${mode().label}`;
  }

  function renderSelection({ announce = false } = {}) {
    const wheel = $('booki-reading-dial-wheel');
    const needle = $('booki-reading-dial-needle');
    const knob = $('booki-reading-dial-knob');
    const icon = $('booki-reading-dial-icon');
    const name = $('booki-reading-dial-name');
    const action = $('booki-reading-dial-start');
    if (!wheel || !needle || !knob || !icon || !name || !action) return;

    const angle = selected * 90;
    needle.style.transform = `translateX(-50%) rotate(${angle}deg)`;
    knob.style.setProperty('--booki-dial-angle', `${angle}deg`);
    icon.textContent = mode().icon;
    name.textContent = mode().label;
    action.setAttribute('aria-label', `התחל קריאה — ${mode().label}`);
    knob.setAttribute('aria-valuenow', String(selected));
    knob.setAttribute('aria-valuetext', mode().label);

    wheel.querySelectorAll('.booki-reading-dial-mode').forEach((node, index) => {
      const isSelected = index === selected;
      node.classList.toggle('is-selected', isSelected);
      node.setAttribute('aria-checked', String(isSelected));
      node.tabIndex = isSelected ? 0 : -1;
    });

    if (announce) announceSelection();
  }

  function select(index, { announce = true } = {}) {
    const next = ((Number(index) || 0) % MODES.length + MODES.length) % MODES.length;
    if (next === selected) return renderSelection({ announce: false });
    selected = next;
    renderSelection({ announce });
    try { navigator.vibrate?.(8); } catch (_) {}
  }

  function selectFromPointer(event, final = false) {
    const wheel = $('booki-reading-dial-wheel');
    const needle = $('booki-reading-dial-needle');
    if (!wheel || !needle) return;
    const angle = angleForPointer(event, wheel);
    if (!final) {
      needle.style.transition = 'none';
      needle.style.transform = `translateX(-50%) rotate(${angle}deg)`;
      return;
    }
    needle.style.transition = '';
    select(nearestIndex(angle));
  }

  function runSelected() {
    if (Date.now() < suppressClickUntil) return;
    const button = $('booki-reading-dial-start');
    if (button?.disabled) return;
    const current = mode();
    const fn = window[current.action];
    if (typeof fn !== 'function') {
      const status = $('booki-reading-dial-status');
      if (status) status.textContent = 'רגע, בוקי עדיין מכין את אפשרות הקריאה הזאת. נסו שוב.';
      console.error('[booki-reading-dial] Missing action:', current.action);
      return;
    }

    if (button) button.disabled = true;
    const status = $('booki-reading-dial-status');
    if (status) status.textContent = '';
    if (typeof track === 'function') {
      try { track('reading_mode_started', { mode: current.id }); } catch (_) {}
    }

    try {
      const result = fn();
      Promise.resolve(result).catch(error => {
        console.error('[booki-reading-dial] Reading action failed:', error);
        if (status) status.textContent = 'משהו נתקע. נסו שוב.';
      }).finally(() => {
        setTimeout(() => { if (button) button.disabled = false; }, 450);
      });
    } catch (error) {
      console.error('[booki-reading-dial] Reading action failed:', error);
      if (status) status.textContent = 'משהו נתקע. נסו שוב.';
      if (button) button.disabled = false;
    }
  }

  function modeButton(item, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `booki-reading-dial-mode booki-reading-dial-mode-${index}`;
    button.dataset.mode = item.id;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-label', item.label);
    button.innerHTML = `<span class="booki-reading-dial-mode-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span>`;
    button.addEventListener('click', event => {
      event.stopPropagation();
      select(index);
    });
    button.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault(); select(selected + 1); $('booki-reading-dial-wheel')?.querySelector('.is-selected')?.focus();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault(); select(selected - 1); $('booki-reading-dial-wheel')?.querySelector('.is-selected')?.focus();
      }
    });
    return button;
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

    const wheel = document.createElement('div');
    wheel.id = 'booki-reading-dial-wheel';
    wheel.className = 'booki-reading-dial-wheel';
    wheel.setAttribute('role', 'radiogroup');
    wheel.setAttribute('aria-label', 'בחירת אופן הקריאה');

    MODES.forEach((item, index) => wheel.appendChild(modeButton(item, index)));

    const needle = document.createElement('span');
    needle.id = 'booki-reading-dial-needle';
    needle.className = 'booki-reading-dial-needle';
    needle.setAttribute('aria-hidden', 'true');

    const knob = document.createElement('div');
    knob.id = 'booki-reading-dial-knob';
    knob.className = 'booki-reading-dial-knob';
    knob.setAttribute('role', 'slider');
    knob.setAttribute('tabindex', '0');
    knob.setAttribute('aria-label', 'כוונון אופן הקריאה');
    knob.setAttribute('aria-valuemin', '0');
    knob.setAttribute('aria-valuemax', String(MODES.length - 1));
    knob.setAttribute('aria-orientation', 'horizontal');
    knob.innerHTML = '<span class="booki-reading-dial-grip" aria-hidden="true">•••</span>';

    const start = document.createElement('button');
    start.type = 'button';
    start.id = 'booki-reading-dial-start';
    start.className = 'booki-reading-dial-start';
    start.innerHTML = `
      <span id="booki-reading-dial-icon" class="booki-reading-dial-center-icon" aria-hidden="true">📚</span>
      <strong>התחל קריאה</strong>
      <small id="booki-reading-dial-name">קריאה בבוקי</small>`;
    start.addEventListener('click', runSelected);

    knob.appendChild(start);
    wheel.append(needle, knob);

    const hint = document.createElement('p');
    hint.className = 'booki-reading-dial-hint';
    hint.innerHTML = '<strong>סובבו לבחירה</strong><span aria-hidden="true"> • </span>ואז לחצו במרכז ומתחילים';

    const live = document.createElement('span');
    live.id = 'booki-reading-dial-live';
    live.className = 'booki-reading-dial-sr';
    live.setAttribute('aria-live', 'polite');

    const status = document.createElement('p');
    status.id = 'booki-reading-dial-status';
    status.className = 'booki-reading-dial-status';
    status.setAttribute('role', 'status');

    shell.append(title, wheel, hint, live, status);
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

    knob.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); select(selected + 1); }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); select(selected - 1); }
      else if (event.key === 'Home') { event.preventDefault(); select(0); }
      else if (event.key === 'End') { event.preventDefault(); select(MODES.length - 1); }
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); runSelected(); }
    });

    knob.addEventListener('pointerdown', event => {
      if (event.target.closest('#booki-reading-dial-start')) return;
      dragging = true; moved = false;
      knob.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    knob.addEventListener('pointermove', event => {
      if (!dragging) return;
      moved = true;
      selectFromPointer(event, false);
      event.preventDefault();
    });
    const finishDrag = event => {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        selectFromPointer(event, true);
        suppressClickUntil = Date.now() + 350;
      } else {
        renderSelection();
      }
      try { knob.releasePointerCapture?.(event.pointerId); } catch (_) {}
    };
    knob.addEventListener('pointerup', finishDrag);
    knob.addEventListener('pointercancel', finishDrag);

    // The former chooser function must no longer open another decision screen.
    window.openReadingChooser = runSelected;
    renderSelection();
  }

  function resetForHome() {
    selected = 0; // Explicit product decision: every home entry defaults to Booki reading.
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
      .booki-reading-dial{width:min(100%,390px);margin:10px auto 18px;text-align:center;font-family:Heebo,Arial,sans-serif;direction:rtl}
      .booki-reading-dial-title{margin:0 0 8px;color:#28483d;font-size:1rem;font-weight:900}
      .booki-reading-dial-wheel{position:relative;width:min(92vw,340px);aspect-ratio:1;margin:0 auto;isolation:isolate;touch-action:none}
      .booki-reading-dial-wheel::before{content:"";position:absolute;inset:40px;border-radius:50%;background:radial-gradient(circle,#fffdf7 0 48%,#eaf8f0 49% 63%,#d8efe4 64% 65%,transparent 66%);box-shadow:0 12px 30px rgba(36,93,67,.12);z-index:-2}
      .booki-reading-dial-wheel::after{content:"";position:absolute;inset:64px;border-radius:50%;border:2px dashed rgba(54,129,92,.22);z-index:-1}
      .booki-reading-dial-mode{position:absolute;width:92px;min-height:68px;padding:7px 5px;border:2px solid #c8ddd1;border-radius:18px;background:#fff;color:#315247;font:800 13px/1.25 Heebo,Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;box-shadow:0 5px 14px rgba(38,86,64,.08);cursor:pointer;z-index:4;transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}
      .booki-reading-dial-mode-0{top:0;left:50%;transform:translateX(-50%)}
      .booki-reading-dial-mode-1{right:0;top:50%;transform:translateY(-50%)}
      .booki-reading-dial-mode-2{bottom:0;left:50%;transform:translateX(-50%)}
      .booki-reading-dial-mode-3{left:0;top:50%;transform:translateY(-50%)}
      .booki-reading-dial-mode.is-selected{background:#eefaf3;border-color:#2f9d67;box-shadow:0 0 0 4px rgba(47,157,103,.10),0 7px 18px rgba(38,86,64,.12)}
      .booki-reading-dial-mode-icon{font-size:22px;line-height:1}
      .booki-reading-dial-needle{position:absolute;left:50%;top:50%;width:5px;height:82px;border-radius:999px;background:linear-gradient(#2e9b66 0 18%,#8fd3ad 19% 100%);transform-origin:50% 100%;transform:translateX(-50%) rotate(0deg);transition:transform .28s cubic-bezier(.2,.85,.25,1.18);z-index:1;margin-top:-82px;pointer-events:none}
      .booki-reading-dial-needle::before{content:"";position:absolute;top:-4px;left:50%;width:13px;height:13px;border-radius:50%;background:#238657;transform:translateX(-50%);box-shadow:0 0 0 4px #fff}
      .booki-reading-dial-knob{position:absolute;left:50%;top:50%;width:154px;height:154px;transform:translate(-50%,-50%);border-radius:50%;padding:9px;background:linear-gradient(145deg,#e7f5ec,#cbe7d7);box-shadow:inset 0 2px 5px rgba(255,255,255,.9),0 9px 22px rgba(34,89,64,.18);z-index:3;touch-action:none;cursor:grab}
      .booki-reading-dial-knob:active{cursor:grabbing}
      .booki-reading-dial-grip{position:absolute;top:7px;left:50%;transform:translateX(-50%);font-size:12px;letter-spacing:2px;color:#5a826e;z-index:5;pointer-events:none}
      .booki-reading-dial-start{width:100%;height:100%;border:0;border-radius:50%;background:linear-gradient(160deg,#2eb86f,#199052);color:white;box-shadow:inset 0 -7px 0 rgba(0,0,0,.09),inset 0 2px 0 rgba(255,255,255,.25);font-family:Heebo,Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:16px 12px 12px;cursor:pointer}
      .booki-reading-dial-start:active{transform:translateY(2px);box-shadow:inset 0 -4px 0 rgba(0,0,0,.09)}
      .booki-reading-dial-start:disabled{opacity:.72;cursor:wait}
      .booki-reading-dial-center-icon{font-size:29px;line-height:1;margin-bottom:3px}.booki-reading-dial-start strong{font-size:1.16rem;line-height:1.2}.booki-reading-dial-start small{font-size:.78rem;line-height:1.25;font-weight:800;color:#effff5;margin-top:3px}
      .booki-reading-dial-hint{margin:7px 0 0;color:#587166;font-size:.78rem;line-height:1.45}.booki-reading-dial-hint strong{color:#315849}
      .booki-reading-dial-status{min-height:1.25em;margin:5px 0 0;color:#a83f36;font-size:.8rem;font-weight:700}
      .booki-reading-dial-sr{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
      .booki-reading-dial-mode:focus-visible,.booki-reading-dial-knob:focus-visible,.booki-reading-dial-start:focus-visible{outline:3px solid #2877b8;outline-offset:3px}
      @media(max-width:370px){.booki-reading-dial-wheel{width:306px}.booki-reading-dial-mode{width:84px;min-height:64px;font-size:12px}.booki-reading-dial-knob{width:142px;height:142px}.booki-reading-dial-needle{height:74px;margin-top:-74px}}
      @media(prefers-reduced-motion:reduce){.booki-reading-dial-mode,.booki-reading-dial-needle{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    installStyle();
    build();
    watchHome();
  }

  window.BookiReadingDial = {
    version: '2026-09-10.1',
    modes: MODES.map(({ id, label }) => ({ id, label })),
    select: idOrIndex => {
      const index = typeof idOrIndex === 'string' ? MODES.findIndex(item => item.id === idOrIndex) : Number(idOrIndex);
      if (index >= 0) select(index);
    },
    getSelected: () => mode().id,
    start: runSelected,
    reset: resetForHome,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
