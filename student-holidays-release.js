/** Booki student tree navigation + holiday shelf release.
 * Presentation only: never changes memberships, goals, reading history or teacher auth.
 * Teacher-entry video is explicitly deferred; no video is loaded or embedded here.
 */
(function () {
  'use strict';
  if (window.BookiStudentHolidays) return;
  const campaign = 'holidays-library-2026-v1';
  const campaignEnd = new Date('2026-10-15T23:59:59+03:00').getTime();
  let promoTimer = null, previousFocus = null, lastReader = null;
  const byId = id => document.getElementById(id);
  const pointed = (plain, nk) => {
    const span = document.createElement('span');
    span.textContent = plain; span.dataset.plain = plain; span.dataset.nk = nk;
    return span;
  };
  const holidayStories = () => typeof getAllStories === 'function'
    ? getAllStories().filter(s => s.libraryId === 'holidays') : [];
  function applyLabels(root) {
    const on = typeof isNiqudOn === 'function' && isNiqudOn();
    root.querySelectorAll('[data-nk]').forEach(el => {
      if (el.dataset.plain === undefined) el.dataset.plain = el.textContent;
      el.textContent = on ? el.dataset.nk : el.dataset.plain;
    });
  }
  function configureLibrary() {
    if (typeof BOOKI_LIBRARY_SHELVES !== 'undefined') {
      const shelf = BOOKI_LIBRARY_SHELVES.find(s => s.id === 'holidays');
      if (shelf) { shelf.title = 'ספריית החגים'; shelf.subtitle = 'סיפורים מתוקים לכל חג בשנה'; }
    }
    if (typeof LIBRARIES !== 'undefined') {
      const library = LIBRARIES.find(s => s.id === 'holidays');
      if (library) { library.active = true; library.label = 'ספריית החגים'; }
    }
    // Retire only the promotion, not the actual stories or their stable IDs.
    if (typeof STORIES_BACK_TO_SCHOOL !== 'undefined') {
      STORIES_BACK_TO_SCHOOL.forEach(story => { story.newUntil = null; });
    }
  }
  function closePromo(restoreFocus = true) {
    clearTimeout(promoTimer); promoTimer = null;
    const overlay = byId('booki-holidays-promo');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove('booki-holidays-promo-open');
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
    previousFocus = null;
  }
  function openHolidayShelf() {
    closePromo(false);
    if (typeof showLibrary === 'function') showLibrary();
    if (typeof openLibraryShelf === 'function') openLibraryShelf('holidays');
  }
  function renderHolidayShortcut() {
    const card = byId('home-shelf-card');
    if (!card) return;
    const count = holidayStories().length;
    card.style.display = count ? '' : 'none';
    card.onclick = openHolidayShelf;
    card.setAttribute('aria-label', 'חדש על המדף — ספריית החגים');
    const label = card.querySelector('.home-shelf-title');
    if (label) label.replaceChildren(pointed('חדש על המדף — ספריית החגים', 'חָדָשׁ עַל הַמַּדָּף — סִפְרִיַּת הַחַגִּים'));
    const countEl = byId('home-shelf-count');
    if (countEl) countEl.replaceChildren(pointed(`${count} סיפורים לחגים`, `${count} סִפּוּרִים לַחַגִּים`));
    window._homeShelfTarget = 'holidays';
    applyLabels(card);
  }
  function ensurePromo() {
    let overlay = byId('booki-holidays-promo');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'booki-holidays-promo'; overlay.hidden = true;
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'booki-holidays-title'); overlay.dir = 'rtl';
    overlay.innerHTML = `<section class="bhp-card">
      <button type="button" class="bhp-close" aria-label="סגירת ההודעה">×</button>
      <div class="bhp-icons" aria-hidden="true">🍎 🍯 🌿</div>
      <p class="bhp-badge"><span data-nk="חָדָשׁ עַל הַמַּדָּף">חדש על המדף</span></p>
      <h2 id="booki-holidays-title"><span data-nk="סִפְרִיַּת הַחַגִּים">ספריית החגים</span></h2>
      <img class="bhp-booki" src="assets/booki/core/states/booki-reading.png" alt="בוקי קורא" width="160" height="160">
      <p class="bhp-copy"><span data-nk="תַּפּוּחִים וּדְבַשׁ, קִשּׁוּטִים לַסֻּכָּה וְעוֹד סִפּוּרִים שֶׁמְּחַכִּים לְךָ!">תפוחים ודבש, קישוטים לסוכה ועוד סיפורים שמחכים לך!</span></p>
      <p id="booki-holidays-count"></p>
      <button type="button" class="bhp-open"><span data-nk="לְסִפְרִיַּת הַחַגִּים">לספריית החגים</span> ←</button>
      <button type="button" class="bhp-later"><span data-nk="אַחַר כָּךְ">אחר כך</span></button>
    </section>`;
    overlay.querySelector('.bhp-close').onclick = () => closePromo();
    overlay.querySelector('.bhp-later').onclick = () => closePromo();
    overlay.querySelector('.bhp-open').onclick = openHolidayShelf;
    overlay.onclick = e => { if (e.target === overlay) closePromo(); };
    overlay.onkeydown = e => {
      if (e.key === 'Escape') { e.preventDefault(); closePromo(); return; }
      if (e.key !== 'Tab') return;
      const buttons = [...overlay.querySelectorAll('button')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.body.appendChild(overlay);
    return overlay;
  }
  function maybeShowHolidayPromo(readerId) {
    const id = readerId ?? (typeof currentStudentId !== 'undefined' ? currentStudentId : null);
    lastReader = id;
    if (id === null || id === undefined || id === '' || Date.now() > campaignEnd) return;
    const key = `booki_campaign_seen:${campaign}:${encodeURIComponent(String(id))}`;
    try { if (localStorage.getItem(key) === '1') return; } catch (_) {}
    clearTimeout(promoTimer);
    promoTimer = setTimeout(() => {
      if (!byId('screen-main')?.classList.contains('active') || window._currentTeacher || !holidayStories().length) return;
      // Do not cover an existing reading/achievement dialog.
      if ([...document.querySelectorAll('[role="dialog"],#shop-celebration-overlay')].some(el =>
        el.id !== 'booki-holidays-promo' && el.id !== 'back-to-school-promo' && el.getClientRects().length)) return;
      const overlay = ensurePromo();
      const n = holidayStories().length;
      byId('booki-holidays-count').replaceChildren(pointed(`${n} סיפורים — קצרים וגם ארוכים`, `${n} סִפּוּרִים — קְצָרִים וְגַם אֲרֻכִּים`));
      applyLabels(overlay);
      previousFocus = document.activeElement;
      overlay.hidden = false;
      document.body.classList.add('booki-holidays-promo-open');
      try { localStorage.setItem(key, '1'); } catch (_) {}
      overlay.querySelector('.bhp-open').focus({preventScroll:true});
    }, 450);
  }
  function addClassStoryComingSoon() {
    if (window._classReturnScreen === 'screen-teacher-club') return;
    const content = byId('class-content');
    if (!content?.querySelector('.class-hero') || content.querySelector('.booki-class-story-soon')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.disabled = true;
    button.className = 'booki-class-story-soon'; button.setAttribute('aria-disabled', 'true');
    button.innerHTML = `<span class="bcs-icon" aria-hidden="true">📖</span><span class="bcs-copy"><strong data-nk="הַסִּפּוּר הַכִּתָּתִי שֶׁלָּנוּ">הסיפור הכיתתי שלנו</strong><small data-nk="נִכְתֹּב וְנִקְרָא סִפּוּר יַחַד">נכתוב ונקרא סיפור יחד</small></span><b data-nk="בְּקָרוֹב">בקרוב</b>`;
    const anchor = content.querySelector('.goal-section') || content.querySelector('.class-hero');
    anchor.insertAdjacentElement('afterend', button);
    applyLabels(button);
  }
  function openStudentTree() {
    closePromo(false);
    if (typeof showClassView === 'function') return showClassView();
  }
  function wireStudentTab() {
    const tab = byId('nav-tab-class');
    if (!tab) return;
    tab.onclick = openStudentTree;
    const label = tab.querySelector('.btab-label');
    if (label) { label.dataset.plain = 'הכיתה שלנו'; label.dataset.nk = 'הַכִּתָּה שֶׁלָּנוּ'; label.textContent = label.dataset.plain; }
    applyLabels(tab);
  }
  const originalNewClass = window._renderNewClubView;
  if (typeof originalNewClass === 'function') {
    window._renderNewClubView = async function (clubId) {
      const result = await originalNewClass.apply(this, arguments);
      if (window.currentClubId === clubId) addClassStoryComingSoon();
      return result;
    };
  }
  const originalLegacyClass = window._renderClassContent;
  if (typeof originalLegacyClass === 'function') {
    window._renderClassContent = function () {
      const result = originalLegacyClass.apply(this, arguments);
      addClassStoryComingSoon(); return result;
    };
  }
  const originalShowScreen = window.showScreen;
  if (typeof originalShowScreen === 'function') {
    window.showScreen = function (id) {
      if (id !== 'screen-main') closePromo(false);
      const result = originalShowScreen.apply(this, arguments);
      if (id === 'screen-main') { renderHolidayShortcut(); maybeShowHolidayPromo(); }
      return result;
    };
  }
  // Reuse the existing entry hook, but never display its old school campaign.
  if (typeof dismissBackToSchoolPromo === 'function') dismissBackToSchoolPromo();
  window.maybeShowBackToSchoolPromo = maybeShowHolidayPromo;
  window._renderHomeShelfShortcuts = renderHolidayShortcut;
  window._openHomeShelf = openHolidayShelf;
  window.showClassLibrary = openStudentTree;
  window.BookiStudentHolidays = {version:1, openHolidayShelf, maybeShowHolidayPromo, closePromo};

  const style = document.createElement('style'); style.id = 'booki-student-holidays-style';
  style.textContent = `
    #back-to-school-promo{display:none!important}
    #booki-holidays-promo[hidden]{display:none!important}
    #booki-holidays-promo{position:fixed;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:rgba(26,43,49,.48);backdrop-filter:blur(4px)}
    body.booki-holidays-promo-open{overflow:hidden}
    #booki-holidays-promo .bhp-card{position:relative;width:min(100%,420px);max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;border-radius:28px;background:#fff9ed;padding:26px 24px 18px;text-align:center;box-shadow:0 20px 70px rgba(20,41,45,.2);border:2px solid #f3deae;color:#233c4b}
    #booki-holidays-promo button{font-family:inherit;cursor:pointer}
    #booki-holidays-promo button:focus-visible{outline:3px solid #7452a1;outline-offset:3px}
    #booki-holidays-promo .bhp-close{position:absolute;top:7px;left:7px;width:44px;height:44px;border:0;background:transparent;font-size:28px;color:#56666c}
    .bhp-icons{font-size:30px;letter-spacing:8px;margin-top:8px}.bhp-badge{display:inline-block;margin:12px 0 4px;background:#f8e3a9;border-radius:999px;padding:5px 15px;font-weight:800;color:#6c511e}
    #booki-holidays-title{font-size:32px;line-height:1.35;margin:8px 0;color:#5d478d}
    .bhp-booki{display:block;margin:0 auto;width:140px;height:140px;object-fit:contain}
    .bhp-copy{font-size:17px;line-height:1.6;margin:8px 0}.bhp-card #booki-holidays-count{font-size:13px;color:#65706b;margin:4px 0 16px}
    .bhp-open{display:block;width:100%;padding:13px 16px;border:0;border-radius:16px;background:#238a79;color:white;font-size:19px;font-weight:800}
    .bhp-later{border:0;background:transparent;color:#62726d;padding:12px 16px;font-size:14px}
    #class-content .booki-class-story-soon{display:flex;align-items:center;gap:10px;box-sizing:border-box;width:100%;padding:14px 16px;margin:14px 0;border:1px solid #d7dcdf;border-radius:16px;background:#eef0f2;color:#616b74;font-family:inherit;text-align:right;direction:rtl;opacity:1;cursor:not-allowed}
    .booki-class-story-soon .bcs-icon{font-size:25px;filter:grayscale(1)}.booki-class-story-soon .bcs-copy{display:grid;gap:4px;flex:1;min-width:0}.booki-class-story-soon strong{font-size:16px}.booki-class-story-soon small{font-size:12px;line-height:1.5}.booki-class-story-soon>b{font-size:12px;background:#dde2e6;padding:5px 9px;border-radius:999px;white-space:nowrap}
    @media(max-width:360px){#booki-holidays-promo .bhp-card{padding:22px 16px 12px}#booki-holidays-title{font-size:28px}.bhp-booki{width:108px;height:108px}.bhp-copy{font-size:15px}.booki-class-story-soon strong{font-size:14px}}
    @media(max-height:620px){.bhp-booki{width:90px;height:90px}.bhp-icons{font-size:22px}#booki-holidays-title{font-size:27px}.bhp-copy{font-size:15px}}
  `;
  document.head.appendChild(style);
  function init() {
    configureLibrary(); wireStudentTab(); renderHolidayShortcut(); addClassStoryComingSoon();
    if (byId('screen-main')?.classList.contains('active')) maybeShowHolidayPromo(lastReader);
  }
  window.addEventListener('booki:holiday-stories-ready', init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
