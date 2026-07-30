/* ═══════════════════════════════════════════════════════════════
   יער הקריאה של בוקי — script.js
   נתונים: Firebase Firestore (ענן) + localStorage (גיבוי מקומי)
   כל הסיפורים נמצאים ב-stories.js בלבד.
═══════════════════════════════════════════════════════════════ */

// ─── קבועים ─────────────────────────────────────────────────────────

const STUDENT_NAMES = [
  "אדם צור",           "אופיר לוינזון",      "אוריה חורש",
  "איה",               "אלון גושן קוסובסקי",  "אמרי",
  "אלה סרוטה",         "אלכסנדר דוניה",       "אלמה כהן מגורי",
  "אמה חסקל",          "דרור גימון",          "יאיר היידנפלד",
  "יהלי אור לויכטר",   "יערה רוטנברג",        "כרם חייט שיף",
  "מיכה",              "נגה צברי",            "נורי שרשבסקי",
  "נינה אבידן",        "נעמה קלפץ",           "סול בן-ג׳ויה",
  "עומר לבהר",         "עומרי",               "עמית ששון",
  "פלג חסקל",          "קשת בלה הורוויץ",     "שילה",
  "שירה דהן",          "תמר לוי"
];

const STUDENT_EMOJIS = [
  "🦊","🐨","🦁","🐯","🐸","🦋","🐧","🦉","🐬","🐘",
  "🦒","🐙","🦀","🐠","🦕","🦄","🐺","🦅","🦜","🦩",
  "🐦","🦢","🦭","🐳","🦈","🐊","🦏","🐆","🐅"
];

const RANKS = [
  { min:    0, name: "קורא מתחיל",  nameNk: "קוֹרֵא מַתְחִיל",     icon: "⭐",   color: "#95A5A6" },
  { min:   50, name: "קורא סקרן",   nameNk: "קוֹרֵא סַקְרָן",      icon: "⭐⭐",  color: "#27AE60" },
  { min:  100, name: "קורא אלוף",   nameNk: "קוֹרֵא אַלּוּף",      icon: "🏆",   color: "#2980B9" },
  { min:  200, name: "קורא זהב",    nameNk: "קוֹרֵא זָהָב",       icon: "🥇",   color: "#F39C12" },
  { min:  300, name: "מלך הספרים",  nameNk: "מֶלֶךְ הַסְּפָרִים",   icon: "👑",   color: "#E74C3C" },
  { min:  500, name: "אגדת הקריאה", nameNk: "אַגֶּדֶת הַקְּרִיאָה", icon: "🌟",   color: "#8E44AD" },
  { min: 1000, name: "אגדת הקריאה", nameNk: "אַגֶּדֶת הַקְּרִיאָה", icon: "🌟✨",  color: "#6C3483" },
];

const CLASS_GOAL = 1500;

// ─── מצב נוכחי ──────────────────────────────────────────────────────
let currentStudentId     = null;
let currentStudentData   = null;   // נתוני התלמיד הנוכחי בזיכרון
let currentStory         = null;
let currentPageIndex     = 0;
let bookData             = {};
let classViewUnsubscribe = null;   // unsubscribe של listener כיתה

/**
 * Bridge — מאפשר ל-routing.js לאתחל משתמש חדש (לא-Legacy).
 * Legacy משתמש ב-selectStudent(index) ישירות.
 */
window.initCurrentStudent = function(id, data) {
  currentStudentId   = id;
  currentStudentData = data;
};

// ─── ניווט מסכים ────────────────────────────────────────────────────

function showScreen(id) {
  // מסיר את "מגן ההבזק הראשוני" של כניסה מקישור-כיתה (ר' style.css, boot-route-club):
  // הוא נועד רק למנוע פריים אחד עם המסך הלא-נכון לפני שה-JS השתלט על הניתוב —
  // ברגע ש-showScreen נקרא בכלל, ה-JS כבר בשליטה, ואם לא מסירים אותו כאן הוא
  // ממשיך לכפות display:none על כל מסך עתידי (כולל screen-main) לנצח.
  document.documentElement.classList.remove('boot-route-club');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
  if (typeof applyNiqud === 'function') applyNiqud();
  // נקה Firebase listener כשעוזבים את מסך הכיתה
  if (id !== 'screen-class' && classViewUnsubscribe) {
    classViewUnsubscribe();
    classViewUnsubscribe = null;
  }
  // נקה Firebase listener כשעוזבים את מסך החנות (תלמיד)
  if (id !== 'screen-booki-reading' && typeof _bookiReadingInterval !== 'undefined' && _bookiReadingInterval) {
    clearInterval(_bookiReadingInterval);
    _bookiReadingInterval = null;
  }
  if (id !== 'screen-shop' && typeof _shopViewUnsubscribe !== 'undefined' && _shopViewUnsubscribe) {
    _shopViewUnsubscribe();
    _shopViewUnsubscribe = null;
  }
  if (id !== 'screen-shop' && typeof _rewardsViewUnsubscribe !== 'undefined' && _rewardsViewUnsubscribe) {
    _rewardsViewUnsubscribe();
    _rewardsViewUnsubscribe = null;
  }
}

// ─── ניהול תלמידים ──────────────────────────────────────────────────

function defaultStudent(id) {
  return {
    id,
    name:         STUDENT_NAMES[id] || '—',
    totalMinutes: 0,
    appMinutes:   0,
    bookMinutes:  0,
    points:       0,
    storiesRead:  0,
    history:      []
  };
}

// ─── LocalStorage (גיבוי מקומי מהיר) ───────────────────────────────

function loadStudentLocal(id) {
  if (id === null || id === undefined) return defaultStudent(0);
  const raw = localStorage.getItem('booki_s_' + id);
  if (!raw) return defaultStudent(id);
  try { return JSON.parse(raw); } catch { return defaultStudent(id); }
}

function saveStudentLocal(data) {
  if (data.id === null || data.id === undefined) return;
  try {
    localStorage.setItem('booki_s_' + data.id, JSON.stringify(data));
  } catch (e) {
    console.error('[local] saveStudentLocal error:', e);
  }
}

// ─── שמירה וטעינה מאוחדות (Firebase + localStorage) ────────────────

async function loadStudentFull(id) {
  if (Number.isInteger(id)) {
    // Legacy — מועדון ישן מבוסס STUDENT_NAMES, מסמך אחד לכל תלמיד תחת /classes/.
    const fbData = await fbLoadStudent(id);
    if (fbData) {
      const canonical = STUDENT_NAMES[id] || fbData.name;
      if (fbData.name !== canonical) {
        fbData.name = canonical;
        fbSaveStudent(fbData);   // תקן שם שגוי ב-Firebase
      }
      saveStudentLocal(fbData);   // שמור גיבוי מקומי
      return fbData;
    }
    return loadStudentLocal(id);
  }
  // Bug fix: כרטיס קריאה אישי (בלי מועדון) — עד עכשיו הסכומים (totalMinutes/points/
  // history) נשמרו רק ב-localStorage, בלי שום גיבוי ענן. ניקוי מטמון/דפדפן אחר/מכשיר
  // אחר איפס אותם ל-0 בלי אזהרה. חברי מועדון לא נפגעו — האמת שלהם היא cachedStats
  // ב-membership (fbUpdateMembershipStats), נתיב נפרד לגמרי מכאן.
  if (!window.currentClubId && typeof fbLoadUserProfile === 'function') {
    const profile = await fbLoadUserProfile(id);
    if (profile && profile.totalMinutes !== undefined) {
      saveStudentLocal(profile);
      return profile;
    }
  }
  return loadStudentLocal(id);
}

async function saveStudentFull(data) {
  saveStudentLocal(data);                    // מיידי — גיבוי מקומי
  if (Number.isInteger(data.id)) {           // fbSaveStudent הוא Legacy בלבד
    await fbSaveStudent(data);               // ענן — /classes/ collection
    return;
  }
  // Bug fix: גיבוי ענן לכרטיס קריאה אישי — משתמשים באותו מסמך פרופיל שכבר קיים
  // (fbSaveUserProfile, /users/{uid}/profile/main) עם merge:true, כך שזה לא דורס
  // שדות זהות (שם/אימוג'י/גיל וכו') שכתובים שם ע"י מסך הפרופיל. חברי מועדון ממשיכים
  // להתעדכן דרך fbUpdateMembershipStats בלבד — לא נוגעים כאן.
  // try/catch מפורש: fbSaveUserProfile זורקת בכשלון (למשל permission-denied/offline) —
  // אסור שזה יפיל את כל זרימת סיום הקריאה (showComplete וכו') אצל הקורא/ת בפועל.
  if (!window.currentClubId && typeof fbSaveUserProfile === 'function') {
    try { await fbSaveUserProfile(data.id, data); }
    catch (e) { console.warn('[booki] saveStudentFull: fbSaveUserProfile failed:', e.message); }
  }
}

// ─── עדיפות באנרי הבית — מוצג באנר אחד בלבד בכל רגע (סדר: חנות > חידוש קריאה > הודעה) ──
window._homeBannerWants = { shop: false, resume: false, message: false };

function _reconcileHomeBanners() {
  const order = [
    ['shop', 'shop-celebration-overlay'],
    ['resume', 'booki-resume-banner'],
    ['message', 'booki-message-banner'],
  ];
  const shownDisplay = { shop: 'flex', resume: '', message: '' };
  const winner = order.find(([key]) => window._homeBannerWants[key]);
  order.forEach(([key, elId]) => {
    const el = document.getElementById(elId);
    if (el) el.style.display = (winner && winner[0] === key) ? shownDisplay[key] : 'none';
  });
  return winner ? winner[0] : null;
}

async function selectStudent(id) {
  currentStudentId = id;
  document.getElementById('current-student-name').textContent = STUDENT_NAMES[id];
  document.getElementById('greeting-avatar').textContent      = STUDENT_EMOJIS[id];
  if (typeof setNavVisible === 'function') { setNavVisible(true); setNavTab('home'); }
  if (typeof _ensureHomeHeroStage === 'function') _ensureHomeHeroStage();
  if (typeof renderHomeEncouragement === 'function') renderHomeEncouragement();
  if (typeof checkBookiReadingResume === 'function') checkBookiReadingResume();
  if (typeof checkShopCelebration === 'function') checkShopCelebration(window.currentClubId);
  if (typeof checkNewMessages === 'function') checkNewMessages(window.currentClubId, id);
  if (typeof checkHomeShopTeaser === 'function') checkHomeShopTeaser(window.currentClubId);
  const navClassTab = document.getElementById('nav-tab-class');
  if (navClassTab) navClassTab.style.display = window.currentClubId ? '' : 'none';
  // מועדון legacy (STUDENT_NAMES) — "קורא אחר" קיים אם יש יותר מתלמיד אחד ברשימה.
  const switchHomeBtn = document.getElementById('btn-switch-reader-home');
  if (switchHomeBtn) {
    const hasOthers = window.currentClubId && Array.isArray(STUDENT_NAMES) && STUDENT_NAMES.length > 1;
    switchHomeBtn.style.display = hasOthers ? '' : 'none';
  }
  showScreen('screen-main');
  currentStudentData = await loadStudentFull(id);
  document.getElementById('current-student-name').textContent = currentStudentData.name;
  if (typeof _initHomeMagic === 'function') _initHomeMagic();
}

function logout() {
  currentStudentId          = null;
  currentStudentData        = null;
  window.currentStudentData = null;
  if (typeof clearActiveReader === 'function') clearActiveReader();
  if (typeof clearClubContext  === 'function') clearClubContext();
  if (typeof routeOnLoad       === 'function') routeOnLoad();
  else showScreen('screen-splash');
}

// ─── ספריית סיפורים ─────────────────────────────────────────────────

function showLibrary(filter = 'all') {
  const listEl = document.getElementById('story-list');
  if (listEl) listEl.innerHTML = '<p style="text-align:center;padding:40px;color:var(--muted)">טוען סיפורים...</p>';
  showScreen('screen-library');
  if (typeof renderForYouSection === 'function') renderForYouSection();
  setTimeout(() => filterLibrary(filter), 0);
}

function filterLibrary(filter) {
  try {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const tabMap = {
      all:            'tab-all',
      'צעדים ראשונים': 'tab-beginner',
      'תולעי ספרים':  'tab-bookworms',
      'מוכרים':       'tab-familiar',
      'מקוריים':      'tab-original',
      'ארוכים':       'tab-long',
      'תנ״ך לילדים':  'tab-tanakh',
      'ערכים וחברות': 'tab-values',
      'טבע וסקרנות':  'tab-nature',
      'משפחה וחגים':  'tab-family',
    };
    const tabEl = document.getElementById(tabMap[filter]);
    if (tabEl) tabEl.classList.add('active');

    const allStories = typeof getAllStories === 'function' ? getAllStories() : [];
    const stories = (filter === 'all')
      ? allStories
      : allStories.filter(s => (s.category || '') === filter);

    const s       = currentStudentData || defaultStudent(currentStudentId || 0);
    const histArr = Array.isArray(s.history) ? s.history : [];
    const readIds = new Set(
      histArr.filter(h => h && h.type === 'app').map(h => h.storyId)
    );

    const listEl = document.getElementById('story-list');
    if (!listEl) return;

    listEl.innerHTML = stories.map(story => {
      const done      = readIds.has(story.id) || (story.legacyId !== undefined && readIds.has(story.legacyId));
      const pages     = Array.isArray(story.pages) ? story.pages : [];
      const totalMins = pages.reduce((acc, p) => acc + (p && p.readingMinutes ? p.readingMinutes : 0.5), 0);
      return `
        <button class="story-card" onclick="startStory('${story.id}')">
          <div class="story-card-left">
            <span class="story-emoji">${story.emoji || '📖'}</span>
            <div class="story-info">
              <span class="story-title">${story.title || ''}</span>
              <span class="story-meta">${story.category || ''} · ${pages.length} עמודים · כ-${Math.round(totalMins)} דק׳${story.lengthLabel ? ' · ' + story.lengthLabel : ''}</span>
            </div>
          </div>
          ${done ? '<span class="read-badge">✓ נקרא</span>' : '<span class="new-badge">קרא →</span>'}
        </button>`;
    }).join('');

  } catch (err) {
    const listEl = document.getElementById('story-list');
    if (listEl) listEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px">לא ניתן לטעון את הספרייה כעת.</p>';
  }
}

// ─── קורא הסיפורים ──────────────────────────────────────────────────

function startStory(storyId) {
  currentStory = getStoryById(storyId);
  if (!currentStory) return;
  currentPageIndex = 0;
  if (typeof track === 'function') {
    track('story_selected',  { storyId, storyTitle: currentStory.title });
    track('reading_started', { storyId, storyTitle: currentStory.title });
  }
  document.getElementById('reader-story-title').textContent = currentStory.title;
  showScreen('screen-reader');
  renderReaderPage();
}

function renderReaderPage() {
  const page  = currentStory.pages[currentPageIndex];
  const total = currentStory.pages.length;

  // Bug fix (product ask): כפתור הניקוד עד עכשיו לא נגע בטקסט סיפורים בכלל (רק בממשק
  // הקבוע) — עכשיו הוא שולט גם כאן: מסיר ניקוד כשכבוי (בטוח לעשות תמיד), ומשאיר
  // כמו שכתוב במקור כשדלוק. ספריות שלא כתובות עם ניקוד מלכתחילה נשארות ללא שינוי.
  const showNiqud = typeof isNiqudOn !== 'function' || isNiqudOn();
  document.getElementById('reader-text').textContent =
    showNiqud || typeof stripNiqud !== 'function' ? page.text : stripNiqud(page.text);
  document.getElementById('reader-page-counter').textContent =
    `עמוד ${currentPageIndex + 1} מתוך ${total}`;

  document.getElementById('page-dots').innerHTML =
    currentStory.pages.map((_, i) =>
      `<span class="dot ${i === currentPageIndex ? 'dot-active' : ''}"></span>`
    ).join('');

  const isFirst = currentPageIndex === 0;
  const isLast  = currentPageIndex === total - 1;
  document.getElementById('btn-prev').style.visibility = isFirst ? 'hidden' : 'visible';
  document.getElementById('btn-next').style.visibility = isLast  ? 'hidden' : 'visible';

  const finishDiv = document.getElementById('finish-reading-div');
  isLast ? finishDiv.classList.remove('hidden') : finishDiv.classList.add('hidden');
}

function nextPage() {
  if (currentPageIndex < currentStory.pages.length - 1) {
    currentPageIndex++;
    renderReaderPage();
  }
}

function prevPage() {
  if (currentPageIndex > 0) {
    currentPageIndex--;
    renderReaderPage();
  }
}

function exitReader() {
  if (confirm('לצאת מהסיפור? ההתקדמות לא תישמר.')) {
    filterLibrary('all');
    showScreen('screen-library');
  }
}

async function finishAppReading() {
  if (currentStudentId === null || currentStudentId === undefined) {
    console.error('[booki] finishAppReading: currentStudentId is null — aborting');
    return;
  }

  const minutes = Math.max(1, Math.round(
    currentStory.pages.reduce((sum, p) => sum + (p.readingMinutes || 0.5), 0)
  ));
  const points = minutes * 1;

  const s = currentStudentData || loadStudentLocal(currentStudentId);
  if (!Array.isArray(s.history)) s.history = [];
  const prevMinutes = s.totalMinutes;
  s.totalMinutes += minutes;
  s.appMinutes   += minutes;
  s.points       += points;
  s.storiesRead  += 1;
  s.history.push({
    type:       'app',
    storyId:    currentStory.id,
    storyTitle: currentStory.title,
    minutes,
    points,
    date: todayStr()
  });
  currentStudentData = s;

  // Bug fix: Auth חייבת להיות מוקמת *לפני* saveStudentFull — אחרת fbSaveUserProfile/
  // fbSaveReadingSession נכתבים תחת auth.uid שלא נוצר עדיין (או שונה מ-currentStudentId),
  // ו-isMe() ב-firestore.rules דוחה את הכתיבה בשקט.
  if (!Number.isInteger(currentStudentId) && typeof ensureStudentAuth === 'function') {
    await ensureStudentAuth();
  }
  await saveStudentFull(s);
  if (typeof fbSaveReadingSession === 'function') {
    fbSaveReadingSession(currentStudentId, {
      type: 'app', storyId: currentStory.id, storyTitle: currentStory.title, minutes, points,
    }).catch(() => {});
  }
  if (window.currentClubId && !Number.isInteger(currentStudentId)
      && typeof fbUpdateMembershipStats === 'function') {
    await fbUpdateMembershipStats(window.currentClubId, currentStudentId, { minutes, points, isApp: true });
  }
  if (window.currentClubId && !Number.isInteger(currentStudentId)
      && typeof fbAwardClubEconomy === 'function') {
    await fbAwardClubEconomy(window.currentClubId, points);
  }
  if (typeof analyticsReadingSession === 'function') {
    analyticsReadingSession(currentStudentId, window.currentClubId || null, {
      type: 'app', storyId: currentStory.id, storyTitle: currentStory.title, minutes,
    });
  }
  const levelUp    = typeof detectLevelUp === 'function' ? detectLevelUp(prevMinutes, s.totalMinutes) : null;
  const streakDays = typeof computeStreakDays === 'function' ? computeStreakDays(s.history) : 0;
  showComplete(minutes, points, { levelUp, streakDays });
}

// ─── קריאה מספר אמיתי ───────────────────────────────────────────────

function startBookReading() {
  document.getElementById('book-title').value  = '';
  document.getElementById('book-author').value = '';
  bookData = {};
  document.querySelectorAll('.btn-pages').forEach(b => b.classList.remove('selected'));
  showScreen('screen-book-step1');
}

function bookStep2() {
  const title = document.getElementById('book-title').value.trim();
  if (!title) { alert('יש לכתוב את שם הספר'); return; }
  bookData.title  = title;
  bookData.author = document.getElementById('book-author').value.trim();
  document.querySelectorAll('.btn-pages').forEach(b => b.classList.remove('selected'));
  showScreen('screen-book-step2');
}

function selectPages(evt, range, minutes) {
  bookData.pages   = range;
  bookData.minutes = minutes;
  document.querySelectorAll('.btn-pages').forEach(b => b.classList.remove('selected'));
  evt.currentTarget.classList.add('selected');
  setTimeout(() => {
    document.getElementById('q-character').value = '';
    document.getElementById('q-story').value     = '';
    document.getElementById('q-liked').value     = '';
    showScreen('screen-book-step3');
  }, 280);
}

async function submitBookReading() {
  if (currentStudentId === null || currentStudentId === undefined) {
    console.error('[booki] submitBookReading: currentStudentId is null — aborting');
    return;
  }

  const char  = document.getElementById('q-character').value.trim();
  const story = document.getElementById('q-story').value.trim();
  const liked = document.getElementById('q-liked').value.trim();
  if (!char || !story || !liked) { alert('יש למלא את כל השדות'); return; }

  const minutes = bookData.minutes || 5;
  const points  = minutes * 1;

  const s = currentStudentData || loadStudentLocal(currentStudentId);
  const prevMinutes = s.totalMinutes;
  s.totalMinutes += minutes;
  s.bookMinutes  += minutes;
  s.points       += points;
  s.history.push({
    type:   'book',
    title:  bookData.title,
    author: bookData.author || '',
    pages:  bookData.pages,
    minutes,
    points,
    date: todayStr()
  });
  currentStudentData = s;

  // Bug fix: ר' finishAppReading — auth חייבת להיות מוקמת לפני saveStudentFull, לא אחריה.
  if (!Number.isInteger(currentStudentId) && typeof ensureStudentAuth === 'function') {
    await ensureStudentAuth();
  }
  await saveStudentFull(s);
  if (typeof fbSaveReadingSession === 'function') {
    fbSaveReadingSession(currentStudentId, {
      type: 'book', bookTitle: bookData.title, bookAuthor: bookData.author || null,
      pagesRead: bookData.pages || null, minutes, points,
    }).catch(() => {});
  }
  if (window.currentClubId && !Number.isInteger(currentStudentId)
      && typeof fbUpdateMembershipStats === 'function') {
    await fbUpdateMembershipStats(window.currentClubId, currentStudentId, { minutes, points, books: 1, isBook: true });
  }
  if (window.currentClubId && !Number.isInteger(currentStudentId)
      && typeof fbAwardClubEconomy === 'function') {
    await fbAwardClubEconomy(window.currentClubId, points);
  }
  if (typeof analyticsReadingSession === 'function') {
    analyticsReadingSession(currentStudentId, window.currentClubId || null, {
      type: 'book', storyId: null, storyTitle: bookData.title, minutes,
    });
  }
  const levelUp    = typeof detectLevelUp === 'function' ? detectLevelUp(prevMinutes, s.totalMinutes) : null;
  const streakDays = typeof computeStreakDays === 'function' ? computeStreakDays(s.history) : 0;
  showComplete(minutes, points, { levelUp, streakDays });
}

// ─── מסך סיום ───────────────────────────────────────────────────────

function showComplete(minutes, points, opts = {}) {
  document.getElementById('complete-minutes').textContent = minutes;
  document.getElementById('complete-points').textContent  = points;

  const banner = document.getElementById('levelup-banner');
  if (banner) {
    if (opts.levelUp) {
      banner.style.display = '';
      banner.innerHTML = `<span class="levelup-icon">${opts.levelUp.icon}</span> עלית לדרגה: <strong style="color:${opts.levelUp.color}">${opts.levelUp.name}</strong>`;
    } else {
      banner.style.display = 'none';
      banner.innerHTML = '';
    }
  }

  const encEl = document.getElementById('complete-encouragement');
  if (encEl) {
    encEl.textContent = typeof pickPersonalEncouragement === 'function'
      ? pickPersonalEncouragement({
          justEarnedPoints: points,
          streakDays: opts.streakDays || 0,
          vsLastWeekBetter: false,
          clubShopActive: false,
          shopRemaining: 0,
        })
      : '';
  }

  launchConfetti();
  showScreen('screen-session-complete');
}

function launchConfetti() {
  const area   = document.getElementById('confetti-area');
  area.innerHTML = '';
  const colors = ['#F1C40F','#E74C3C','#3498DB','#2ECC71','#9B59B6','#F39C12','#1ABC9C'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.className  = 'confetti-piece';
    el.style.cssText = `
      left:${Math.random()*100}%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      width:${6+Math.random()*8}px;
      height:${6+Math.random()*8}px;
      border-radius:${Math.random()>0.5?'50%':'2px'};
      animation-duration:${1.5+Math.random()*2}s;
      animation-delay:${Math.random()*0.8}s;
    `;
    area.appendChild(el);
  }
}

// ─── כרטיס קורא ─────────────────────────────────────────────────────

async function showReaderCard() {
  const s = currentStudentData || loadStudentLocal(currentStudentId || 0);
  if (typeof setNavTab === 'function') setNavTab('card');
  showScreen('screen-reader-card');

  // Legacy path (numeric id) — data already in memory/localStorage, render immediately
  if (typeof s.id === 'number') {
    _renderReaderCardContent({ ...s, history: [...(s.history || [])].reverse() });
    return;
  }

  // New-student path — Firestore is the single source of truth for cross-device sync
  const contentEl = document.getElementById('reader-card-content');
  if (contentEl) contentEl.innerHTML = '<div style="text-align:center;padding:3rem;font-size:2rem">⏳</div>';

  const userId = s.id;
  const clubId = window.currentClubId
    || (typeof getActiveReader === 'function' ? getActiveReader()?.clubId : null);

  const [membership, sessions] = await Promise.all([
    (clubId && typeof fbLoadClubMembership === 'function')
      ? fbLoadClubMembership(clubId, userId)
      : Promise.resolve(null),
    (typeof fbLoadUserSessions === 'function')
      ? fbLoadUserSessions(userId)
      : Promise.resolve([]),
  ]);

  const cs      = membership?.cachedStats || {};
  const sorted  = (sessions || []).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const appMins = sorted.filter(r => r.type === 'app').reduce((t, r) => t + (r.minutes || 0), 0);
  const bkMins  = sorted.filter(r => r.type !== 'app').reduce((t, r) => t + (r.minutes || 0), 0);

  const enriched = {
    ...s,
    // cachedStats הוא aggregate — sessions הם מקור מדויק; aggregate הוא fallback אם sessions ריקות
    totalMinutes: cs.totalMinutes || (appMins + bkMins),
    appMinutes:   appMins  || cs.appMinutes  || 0,
    bookMinutes:  bkMins   || cs.bookMinutes || 0,
    points:       cs.totalPoints  || (appMins + bkMins),
    history:      sorted,
  };

  // Refresh localStorage cache so next visit on this device is instant
  window.currentStudentData = { ...window.currentStudentData, ...enriched };
  if (typeof saveStudentLocal === 'function') {
    saveStudentLocal({ ...enriched, history: sorted.slice(0, 50) });
  }

  _renderReaderCardContent(enriched);
}

function _renderReaderCardContent(s) {
  const mins = s.totalMinutes || 0;
  const pts  = s.points       || 0;
  const rank = getRank(mins);
  const next = getNextRank(mins);
  const pct  = next ? Math.min(100, Math.round((mins / next.min) * 100)) : 100;

  const progressSection = next
    ? `<div class="progress-card">
         <p>עוד <strong>${next.min - mins}</strong> דקות לדרגה הבאה:
            <span style="color:${next.color}">${next.icon} ${next.name}</span></p>
         <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
       </div>`
    : `<div class="max-rank">🌟 הגעת לדרגה הגבוהה ביותר! 🌟</div>`;

  const history = Array.isArray(s.history) ? s.history : [];

  const badges = typeof getReadingLevelInfo === 'function' ? getReadingLevelInfo(mins).badges : [rank];
  const badgesSection = badges.length
    ? `<div class="badges-row">
         ${badges.map(b => `<span class="badge-chip" style="border-color:${b.color};color:${b.color}" title="${b.name}">${b.icon}</span>`).join('')}
       </div>`
    : '';
  // "שיא אישי" (computePersonalBest, motivation.js) הוסתר מתצוגת התלמיד לפי החלטה —
  // המדד הקיים ("קריאה רצופה הכי ארוכה") לא ברור/רלוונטי מספיק לילדים ועלול לעודד
  // דיווח זמן ארוך במקום קריאה איכותית. הפונקציה ונתוני ההיסטוריה לא נמחקו —
  // מסומן כאפשרות עתידית להגדרה מחדש של המדד.
  const histItems = history.slice(0, 10).map(h => {
    const isApp   = h.type === 'app';
    const isBooki = h.type === 'booki';
    // Firestore sessions: storyTitle (app) / bookTitle (book); legacy: h.title (book); booki: none
    const title   = isApp ? (h.storyTitle || '') : (h.bookTitle || h.title || '');
    const dateLbl = h.date    || '';
    const minLbl  = (h.minutes ?? 0) + ' דקות';
    const ptsLbl  = '+' + (h.points ?? 0) + ' נק׳';
    const icon    = isApp ? '📱' : isBooki ? '🦉' : '📖';
    return `
      <div class="history-item">
        <span class="history-icon">${icon}</span>
        <div>
          ${title ? `<span class="history-title">${title}</span>` : ''}
          <span class="history-meta">${[dateLbl, minLbl, ptsLbl].filter(Boolean).join(' · ')}</span>
        </div>
      </div>`;
  }).join('');

  // s.emoji is set for new students; STUDENT_EMOJIS[s.id] for legacy (numeric index)
  const avatar    = s.emoji || (typeof STUDENT_EMOJIS !== 'undefined' ? STUDENT_EMOJIS[s.id] : '') || '📚';
  const isImgAv   = typeof avatar === 'string' && avatar.startsWith('data:');
  const avatarTag = isImgAv
    ? `<img src="${avatar}" class="card-avatar av-img" alt="">`
    : `<div class="card-avatar">${avatar}</div>`;
  const changeBtn = window.currentClubId
    ? `<button class="btn-change-avatar" onclick="changeStudentAvatar()">✏️ שנה אווטאר</button>`
    : '';

  document.getElementById('reader-card-content').innerHTML = `
    <div class="card-hero">
      <div class="card-avatar-wrap">${avatarTag}${changeBtn}</div>
      <div class="card-name">${s.name || ''}</div>
      <div class="card-rank" style="color:${rank.color}">${rank.icon} ${rank.name}</div>
    </div>
    ${badgesSection}
    <div class="stats-grid">
      <div class="stat-box">
        <span class="stat-icon-big">⏱️</span>
        <span class="stat-num">${mins}</span>
        <span class="stat-lbl">דקות סה״כ</span>
      </div>
      <div class="stat-box stat-box-highlight">
        <span class="stat-icon-big">⭐</span>
        <span class="stat-num">${pts}</span>
        <span class="stat-lbl">נקודות</span>
      </div>
      <div class="stat-box">
        <span class="stat-icon-big">📱</span>
        <span class="stat-num">${s.appMinutes || 0}</span>
        <span class="stat-lbl">דק׳ באפליקציה</span>
      </div>
      <div class="stat-box">
        <span class="stat-icon-big">📚</span>
        <span class="stat-num">${s.bookMinutes || 0}</span>
        <span class="stat-lbl">דק׳ מספרים</span>
      </div>
    </div>
    ${progressSection}
    ${history.length > 0
      ? `<div class="history-section">
           <h3>היסטוריית קריאה</h3>
           <div class="history-list">${histItems}</div>
         </div>`
      : `<div class="no-history-wrap">
           <button class="btn-rc-read" onclick="showLibrary()">📱 לקריאה באפליקציה</button>
           <p class="no-history">עדיין לא קראת — התחל/י עכשיו!</p>
         </div>`}
  `;
}

// ─── הכיתה שלנו — Firebase real-time ────────────────────────────────

/** בוקי ליד העץ במסך הכיתה — תנוחה לפי מצב היעד (חוגג כשהעץ פרח, אחרת מעודד). */
function _classHeroBookiHtml(blooming) {
  if (typeof bookiStageHtml !== 'function') return '';
  const img = blooming ? 'class-goal/booki-achievement.png' : 'class-goal/booki-progress.png';
  return bookiStageHtml(img, { className: 'class-hero-booki-char', loading: 'eager' });
}

// נקודות עוגן (אחוזי left/top) לפיזור עלים/פירות/פרחים על צמרת העץ עצמו — אין כאן
// נכס איור אמיתי, רק אימוג'י ה-🌳 הקיים; זה קירוב ויזואלי (לא מדויק פר-פלטפורמה),
// לא הדמיה בוטנית. ר' _treeDecorHtml.
const _TREE_LEAF_SPOTS   = [[50,10],[35,15],[65,15],[25,22],[75,22],[45,8],[55,8],[20,30],[80,30],[40,25],[60,25],[30,35],[70,35],[50,32],[15,18],[85,18],[38,40],[62,40],[48,20],[52,45]];
const _TREE_FRUIT_SPOTS  = [[40,28],[60,28],[30,38],[70,38],[50,42],[45,18],[55,18],[25,45],[75,45],[50,15]];
const _TREE_BLOSSOM_SPOTS = [[35,20],[65,20],[50,12],[25,35],[75,35],[45,40],[55,40],[50,30]];

function _treeDecorHtml(spots, count, emoji, cssClass) {
  return spots.slice(0, count)
    .map(([left, top]) => `<span class="tree-deco ${cssClass}" style="left:${left}%;top:${top}%">${emoji}</span>`)
    .join('');
}

function showClassView() {
  window._classReturnScreen = 'screen-main';
  if (typeof setNavTab === 'function') setNavTab('class');
  showScreen('screen-class');
  const contentEl = document.getElementById('class-content');
  if (contentEl) contentEl.innerHTML = '<div style="text-align:center;padding:3rem;font-size:2rem">⏳</div>';

  if (classViewUnsubscribe) {
    classViewUnsubscribe();
    classViewUnsubscribe = null;
  }

  const clubId  = window.currentClubId;

  // אין הקשר מועדון — לא מציגים נתוני כיתה ישנה
  if (!clubId) {
    showScreen('screen-main');
    return;
  }

  const isLegacy = typeof getBootstrapClubById === 'function' && !!getBootstrapClubById(clubId);

  if (isLegacy) {
    // מועדון מקורי — נתונים בזמן אמת מ-Firebase
    classViewUnsubscribe = fbWatchClass(fbStudents => {
      _renderClassContent(fbStudents);
    });
  } else {
    // מועדון חדש — נתוני חברים מ-Firebase
    _renderNewClubView(clubId);
  }
}

async function _renderNewClubView(clubId) {
  const contentEl = document.getElementById('class-content');
  if (!contentEl) return;

  // Single source of truth: same queries the teacher's class dashboard uses
  const [club, memberships, shopState] = await Promise.all([
    typeof fbLoadClub            === 'function' ? fbLoadClub(clubId)            : Promise.resolve(null),
    typeof fbLoadClubMemberships === 'function' ? fbLoadClubMemberships(clubId) : Promise.resolve([]),
    typeof fbLoadShopState       === 'function' ? fbLoadShopState(clubId)       : Promise.resolve(null),
  ]);

  // Sprint 9: פעם ש-Shop מופעל, ה"יעד הכיתתי" האמיתי הוא ה-goalCycle הפעיל (אותו מקור
  // בדיוק שמסך המורה משתמש בו) — לא club.goal הישן, שאין לו יותר עורך משלו ועלול
  // להישאר תקוע/לא מעודכן. כשאין Shop, ההתנהגות זהה ב-1:1 להיום (club.goal + totalMins).
  let goalTarget = club?.goal?.target || 1500;
  let cycleProgress = null;
  if (shopState?.activeCycleId) {
    const [cycle, econ] = await Promise.all([
      typeof fbLoadGoalCycle === 'function' ? fbLoadGoalCycle(clubId, shopState.activeCycleId) : Promise.resolve(null),
      typeof fbLoadEconomy   === 'function' ? fbLoadEconomy(clubId)   : Promise.resolve(null),
    ]);
    if (cycle) {
      goalTarget = cycle.target || goalTarget;
      // Fix (goal/points unification): progress == economy.balance — אותו מספר בדיוק
      // שהמורה רואה בדשבורד/בהגדרות היעד/בחנות. totalMins (העץ, למטה) נשאר נפרד בכוונה —
      // זה מד "סה"כ קריאה אי-פעם" שלעולם לא מתאפס, לא מד המרחק ליעד הנוכחי.
      cycleProgress = Math.max(0, econ?.balance || 0);
    }
  }

  const active = memberships
    .filter(m => m.status !== 'left')
    .map(m => ({
      name:          m.name  || m.userId || '—',
      emoji:         m.emoji || '📚',
      totalMinutes:  m.cachedStats?.totalMinutes  || 0,
      totalPoints:   m.cachedStats?.totalPoints   || 0,
      totalSessions: m.cachedStats?.totalSessions || 0,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  if (!active.length) {
    contentEl.innerHTML = '<div style="text-align:center;padding:2rem;color:#888">אין חברים רשומים עדיין 📚</div>';
    return;
  }

  const totalSessions = active.reduce((s, m) => s + m.totalSessions, 0);
  // Bug fix (product ask): מספר אחד בלבד לעץ, מתואם תמיד עם מה שיש לממש בחנות — לא
  // שני מספרים נפרדים (סה"כ-דקות-אי-פעם מול יתרת-נקודות) שנראים כמו טעות. goalProgress
  // כבר נופל חזרה ל-totalMins-כמו-פעם כשאין Shop פעיל (ר' למטה), אז זה לא משנה כלום
  // לכיתות בלי חנות.
  const goalProgress  = cycleProgress !== null ? cycleProgress : active.reduce((s, m) => s + m.totalMinutes, 0);
  const leaves         = Math.floor(goalProgress / 100);
  const fruits         = Math.floor(goalProgress / 500);
  const blooming      = goalProgress >= goalTarget;
  const pct           = Math.min(100, Math.round((goalProgress / goalTarget) * 100));
  const remaining     = Math.max(0, goalTarget - goalProgress);
  // כש-Shop פעיל, goalProgress הוא יתרת נקודות (econ.balance), לא ספירת דקות גולמית —
  // מתייגים לפי המקור האמיתי כדי שהיחידה המוצגת תמיד תהיה נכונה (לא "דקות" סתם).
  const isPointsGoal  = cycleProgress !== null;
  const goalUnitFull  = isPointsGoal ? 'נקודות' : 'דקות';
  const goalUnitShort = isPointsGoal ? 'נק׳'    : 'דק׳';
  // הפער בין "הגענו ליעד" לבין שהמורה בפועל פותחת הצבעה/מאשרת רכישה: המצב הישן
  // (activeCycleId) נשאר פעיל כל אותו זמן, אז pct/remaining נשארים קפואים ב-100%/0
  // גם אם הכיתה ממשיכה לקרוא. extraSinceGoal מראה שהקריאה הנוספת כן נספרת ותעבור
  // ליעד הבא (ר' _startNextGoalCycleTx ב-firebase-shop.js) — במקום שקט מוחלט.
  const extraSinceGoal = (isPointsGoal && blooming) ? Math.max(0, goalProgress - goalTarget) : 0;
  const posIcons      = ['🥇', '🥈', '🥉'];
  const rowCls        = ['leader-first', 'leader-second', 'leader-third'];

  // Bug fix (product ask): "יחד אנחנו קוראים" הוסר — היה עוד רובריקה עם עוד מספר,
  // מיותר עכשיו שהעץ עצמו כבר מציג מספר אחד מתואם. כיתות במצב progressOnly (המורה
  // כיבתה במפורש את הלוח המוביל התחרותי) לא מקבלות שום תחליף באותו מקום — זה עדיין
  // ההעדפה שלהן, רק בלי הרובריקה שהוסרה.
  const progressDisplay = club?.settings?.progressDisplay || 'leaderboard';
  const progressBlock = progressDisplay === 'progressOnly'
    ? ''
    : `<div class="leaderboard">
      <h3>🏆 10 הקוראים המובילים</h3>
      ${active.slice(0, 10).map((m, i) => `
        <div class="leader-row ${rowCls[i] || ''}">
          <span class="leader-pos">${posIcons[i] || (i + 1)}</span>
          ${_avatarHtml(m.emoji || '📚', 'leader-avatar')}
          <span class="leader-name">${m.name}</span>
          <span class="leader-pts">${m.totalMinutes} דק׳</span>
        </div>`).join('')}
    </div>`;

  // כרטיס קריאה-לפעולה ליד העץ, לפי מצב החנות המדויק — לא רק כפתור גנרי:
  //  - GOAL_REACHED_PENDING_SHOP: הגיעו ליעד אבל אין עדיין הצבעה פתוחה (המורה טרם
  //    פתחה אותה) — חוגגים ומזכירים שהקריאה הנוספת כן נספרת, בלי לחשוף את היעד הבא.
  //  - voting_open: יש הצבעה פעילה על פרס — קריאה-לפעולה מפורשת עם מספר הנקודות בפועל.
  let shopNudgeBlock = '';
  if (shopState?.state === 'GOAL_REACHED_PENDING_SHOP') {
    const extraLine = extraSinceGoal > 0 ? ` — כבר ${extraSinceGoal} נק' מוכנות ליעד הבא` : '';
    shopNudgeBlock = `<div class="class-shop-nudge">
      <p>🎉 הגענו! ואתם ממשיכים לקרוא${extraLine} 🎁</p>
    </div>`;
  } else if (shopState?.state === 'voting_open') {
    shopNudgeBlock = `<div class="class-shop-nudge">
      <p>🛍️ יש לכם <strong>${goalProgress}</strong> נק' לממש בחנות!</p>
      <button class="btn-giant btn-booki-read class-shop-entry" onclick="showShop()">כנסו עכשיו להצביע! 🗳️</button>
    </div>`;
  }

  const leafHtml     = _treeDecorHtml(_TREE_LEAF_SPOTS,    Math.min(leaves, 20), '🍃', 'tree-deco-leaf');
  const fruitHtml    = _treeDecorHtml(_TREE_FRUIT_SPOTS,   Math.min(fruits, 10), '🍎', 'tree-deco-fruit');
  const blossomHtml  = blooming ? _treeDecorHtml(_TREE_BLOSSOM_SPOTS, _TREE_BLOSSOM_SPOTS.length, '🌸', 'tree-deco-blossom') : '';

  contentEl.innerHTML = `
    <div class="class-hero">
      <div class="class-hero-row">
        <div class="class-tree-visual">
          <div class="class-big-tree">🌳</div>
          <div class="tree-decor-layer">${leafHtml}${fruitHtml}${blossomHtml}</div>
        </div>
        <div class="class-hero-booki-stage">${_classHeroBookiHtml(blooming)}</div>
      </div>
      ${blooming ? '<div class="tree-bloom">🌸 העץ פרח! 🌸</div>' : ''}
      <span class="total-num">${goalProgress}</span>
      <span class="total-lbl">${goalUnitFull} קריאה כיתתיות!</span>
      <div class="class-tree-legend">
        <span>🍃 כל 100 ${goalUnitShort} = עלה</span>
        <span>🍎 כל 500 ${goalUnitShort} = פרי</span>
      </div>
    </div>
    <div class="class-stats-row">
      <div class="class-stat"><span>📖</span><strong>${totalSessions}</strong><span>סיפורים</span></div>
      <div class="class-stat"><span>🍃</span><strong>${leaves}</strong><span>עלים</span></div>
      <div class="class-stat"><span>🍎</span><strong>${fruits}</strong><span>פירות</span></div>
      <div class="class-stat"><span>👥</span><strong>${active.length}</strong><span>חברים</span></div>
    </div>
    <div class="goal-section">
      <p>🎯 יעד הכיתה: <strong>${goalTarget}</strong> ${goalUnitFull} · <strong>${pct}%</strong> הושלמו
        ${remaining > 0 ? `· עוד <strong>${remaining}</strong> ${goalUnitShort}` : ' · 🎉 הגענו!'}</p>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%;background:linear-gradient(90deg,#27AE60,#8BC34A)"></div>
      </div>
    </div>
    ${shopNudgeBlock}
    ${progressBlock}`;
}

function _renderClassContent(fbStudents) {
  // בנה מפה מלאה: id → נתונים (Firebase ראשי, localStorage גיבוי)
  const byId = {};
  fbStudents.forEach(s => {
    if (s && s.id !== undefined && s.id !== null) {
      s.name = STUDENT_NAMES[s.id] || s.name;
      byId[s.id] = s;
    }
  });
  // השלם תלמידים שעדיין אין ב-Firebase
  for (let i = 0; i < STUDENT_NAMES.length; i++) {
    if (!byId[i]) byId[i] = loadStudentLocal(i);
  }

  const students  = Object.values(byId);
  const totalMins = students.reduce((a, s) => a + (s.totalMinutes || 0), 0);
  const appMins   = students.reduce((a, s) => a + (s.appMinutes   || 0), 0);
  const bookMins  = students.reduce((a, s) => a + (s.bookMinutes  || 0), 0);
  const leaves    = Math.floor(totalMins / 100);
  const fruits    = Math.floor(totalMins / 500);
  const blooming  = totalMins >= CLASS_GOAL;
  const pct       = Math.min(100, Math.round((totalMins / CLASS_GOAL) * 100));

  const sorted   = [...students].sort((a, b) => (b.points||0) - (a.points||0)).slice(0, 10);
  const posIcons = ['🥇','🥈','🥉'];
  const rowCls   = ['leader-first','leader-second','leader-third'];

  document.getElementById('class-content').innerHTML = `
    <div class="class-hero">
      <div class="class-hero-row">
        <div class="class-big-tree">🌳</div>
        <div class="class-hero-booki-stage">${_classHeroBookiHtml(blooming)}</div>
      </div>
      <div class="tree-leaves">${'🍃'.repeat(Math.min(leaves, 20))}</div>
      <div class="tree-fruits">${'🍎'.repeat(Math.min(fruits, 10))}</div>
      ${blooming ? '<div class="tree-bloom">🌸🌸🌸 העץ פרח! 🌸🌸🌸</div>' : ''}
      <span class="total-num">${totalMins}</span>
      <span class="total-lbl">דקות קריאה כיתתיות!</span>
      <div class="class-tree-legend">
        <span>🍃 כל 100 דק׳ = עלה</span>
        <span>🍎 כל 500 דק׳ = פרי</span>
      </div>
    </div>
    <div class="class-stats-row">
      <div class="class-stat"><span>📱</span><strong>${appMins}</strong><span>באפליקציה</span></div>
      <div class="class-stat"><span>📚</span><strong>${bookMins}</strong><span>מספרים</span></div>
      <div class="class-stat"><span>🍃</span><strong>${leaves}</strong><span>עלים</span></div>
      <div class="class-stat"><span>🍎</span><strong>${fruits}</strong><span>פירות</span></div>
    </div>
    <div class="goal-section">
      <p>יעד הכיתה: ${CLASS_GOAL} דקות · ${pct}% הושלמו</p>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%;background:linear-gradient(90deg,#27AE60,#8BC34A)"></div>
      </div>
    </div>
    <div class="leaderboard">
      <h3>🏆 10 הקוראים המובילים</h3>
      ${sorted.map((s, i) => {
        const r = getRank(s.totalMinutes || 0);
        return `
          <div class="leader-row ${rowCls[i] || ''}">
            <span class="leader-pos">${posIcons[i] || (i + 1)}</span>
            ${_avatarHtml(STUDENT_EMOJIS[s.id] || '📚', 'leader-avatar')}
            <span class="leader-name">${s.name}</span>
            <span class="leader-rank">${r.icon}</span>
            <span class="leader-pts">${s.points || 0} נק׳</span>
          </div>`;
      }).join('')}
    </div>
  `;
}

// ─── דרגות ──────────────────────────────────────────────────────────

function getRank(minutes) {
  let rank = RANKS[0];
  for (const r of RANKS) { if (minutes >= r.min) rank = r; }
  return rank;
}

function getNextRank(minutes) {
  for (const r of RANKS) { if (minutes < r.min) return r; }
  return null;
}

// ─── עזר ────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toLocaleDateString('he-IL');
}

// ─── אתחול ──────────────────────────────────────════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  // ─── בדיקת localStorage ──────────────────────────────────────
  try {
    localStorage.setItem('_booki_test_', '1');
    const ok = localStorage.getItem('_booki_test_') === '1';
    localStorage.removeItem('_booki_test_');
    console.log(ok ? '[booki] ✅ localStorage: זמין' : '[booki] ❌ localStorage: כתיבה נכשלה');
  } catch (e) {
    console.error('[booki] ❌ localStorage: לא זמין!', e);
  }

  // ─── בדיקות קונסול ───────────────────────────────────────────
  const storiesLoaded = (typeof getAllStories === 'function') ? getAllStories().length : 0;
  const filesOk       = (typeof getAllStories === 'function') &&
                        (typeof getStoryById  === 'function') &&
                        (typeof STORIES       !== 'undefined');
  const fbOk          = (typeof fbLoadStudent  === 'function') &&
                        (typeof fbSaveStudent  === 'function') &&
                        (typeof fbWatchClass   === 'function');

  console.log('╔══════════════════════════════════════════╗');
  console.log('║   יער הקריאה של בוקי — בדיקת טעינה   ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  📚 סיפורים:  ${String(storiesLoaded).padEnd(27)}║`);
  console.log(`║  👤 תלמידים:  ${String(STUDENT_NAMES.length).padEnd(27)}║`);
  console.log(`║  🔥 Firebase: ${String(fbOk ? '✅ firebase.js נטען' : '❌ חסר firebase.js').padEnd(27)}║`);
  console.log('╚══════════════════════════════════════════╝');

  if (!filesOk) {
    console.error('[booki] ❌ stories.js לא נטען — בדוק שהקובץ קיים לפני script.js');
  }
  if (!fbOk) {
    console.error('[booki] ❌ firebase.js לא נטען — בדוק את סדר הסקריפטים ב-index.html');
  }

  // ─── מעבר מ-localStorage ל-Firebase (פעם אחת) ───────────────
  // שתי הפעולות האלה הן ניקוי/תחזוקה ברקע (best-effort) — כשלון ברשת/הרשאות
  // כאן לא אמור לחסום את כל האתחול. בלי try/catch, שגיאה כאן הייתה עוצרת
  // את כל ה-DOMContentLoaded handler ומונעת מ-routeOnLoad() לרוץ בכלל,
  // ומשאירה את המסך תקוע על splash — בלי קשר לקישור/למועדון שנכנסים אליו.
  try {
    if (typeof migrateFromLocalStorage === 'function') {
      const migrated = await migrateFromLocalStorage();
      if (migrated > 0) {
        console.log(`[booki] ✅ הועברו ${migrated} תלמידים מ-localStorage ל-Firebase`);
      }
    }
  } catch (e) {
    console.error('[booki] migrateFromLocalStorage נכשל (לא חוסם את האתחול):', e);
  }

  // ─── תיקון שמות לא עקביים ב-Firebase (אוטומטי) ──────────────
  try {
    if (typeof fixAllStudentNames === 'function') {
      await fixAllStudentNames(STUDENT_NAMES);
    }
  } catch (e) {
    console.error('[booki] fixAllStudentNames נכשל (לא חוסם את האתחול):', e);
  }

  // ניתוב ראשוני: בדוק אם מורה מחוברת לפני ניתוב רגיל
  if (typeof onTeacherAuthChange === 'function') {
    onTeacherAuthChange(teacher => {
      if (teacher) {
        if (typeof showTeacherDashboard === 'function') showTeacherDashboard(teacher);
      } else {
        if (typeof routeOnLoad === 'function') routeOnLoad();
        else showScreen('screen-splash');
      }
    });
  } else {
    if (typeof routeOnLoad === 'function') routeOnLoad();
    else showScreen('screen-splash');
  }
});
