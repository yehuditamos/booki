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
  { min:    0, name: "קורא מתחיל",  icon: "⭐",   color: "#95A5A6" },
  { min:   50, name: "קורא סקרן",   icon: "⭐⭐",  color: "#27AE60" },
  { min:  100, name: "קורא אלוף",   icon: "🏆",   color: "#2980B9" },
  { min:  200, name: "קורא זהב",    icon: "🥇",   color: "#F39C12" },
  { min:  300, name: "מלך הספרים",  icon: "👑",   color: "#E74C3C" },
  { min:  500, name: "אגדת הקריאה", icon: "🌟",   color: "#8E44AD" },
  { min: 1000, name: "אגדת הקריאה", icon: "🌟✨",  color: "#6C3483" },
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
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
  // נקה Firebase listener כשעוזבים את מסך הכיתה
  if (id !== 'screen-class' && classViewUnsubscribe) {
    classViewUnsubscribe();
    classViewUnsubscribe = null;
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
  // נסה Firebase קודם
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
  // fallback ל-localStorage
  return loadStudentLocal(id);
}

async function saveStudentFull(data) {
  saveStudentLocal(data);                    // מיידי — גיבוי מקומי
  if (Number.isInteger(data.id)) {           // fbSaveStudent הוא Legacy בלבד
    await fbSaveStudent(data);               // ענן — /classes/ collection
  }
}

async function selectStudent(id) {
  currentStudentId = id;
  document.getElementById('current-student-name').textContent = STUDENT_NAMES[id];
  document.getElementById('greeting-avatar').textContent      = STUDENT_EMOJIS[id];
  if (typeof setNavVisible === 'function') { setNavVisible(true); setNavTab(''); }
  showScreen('screen-main');
  currentStudentData = await loadStudentFull(id);
  document.getElementById('current-student-name').textContent = currentStudentData.name;
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

function showLibrary() {
  const listEl = document.getElementById('story-list');
  if (listEl) listEl.innerHTML = '<p style="text-align:center;padding:40px;color:var(--muted)">טוען סיפורים...</p>';
  showScreen('screen-library');
  if (typeof renderForYouSection === 'function') renderForYouSection();
  setTimeout(() => filterLibrary('all'), 0);
}

function filterLibrary(filter) {
  try {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const tabMap = {
      all:            'tab-all',
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

  document.getElementById('reader-text').textContent        = page.text;
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

  await saveStudentFull(s);
  // Auth חייבת להיות מוקמת לפני כל כתיבה ל-Firestore
  if (!Number.isInteger(currentStudentId) && typeof ensureStudentAuth === 'function') {
    await ensureStudentAuth();
  }
  if (typeof fbSaveReadingSession === 'function') {
    fbSaveReadingSession(currentStudentId, {
      type: 'app', storyId: currentStory.id, storyTitle: currentStory.title, minutes, points,
    }).catch(() => {});
  }
  if (window.currentClubId && !Number.isInteger(currentStudentId)
      && typeof fbUpdateMembershipStats === 'function') {
    await fbUpdateMembershipStats(window.currentClubId, currentStudentId, { minutes, points, isApp: true });
  }
  if (typeof analyticsReadingSession === 'function') {
    analyticsReadingSession(currentStudentId, window.currentClubId || null, {
      type: 'app', storyId: currentStory.id, storyTitle: currentStory.title, minutes,
    });
  }
  showComplete(minutes, points);
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

  await saveStudentFull(s);
  // Auth חייבת להיות מוקמת לפני כל כתיבה ל-Firestore
  if (!Number.isInteger(currentStudentId) && typeof ensureStudentAuth === 'function') {
    await ensureStudentAuth();
  }
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
  if (typeof analyticsReadingSession === 'function') {
    analyticsReadingSession(currentStudentId, window.currentClubId || null, {
      type: 'book', storyId: null, storyTitle: bookData.title, minutes,
    });
  }
  showComplete(minutes, points);
}

// ─── מסך סיום ───────────────────────────────────────────────────────

function showComplete(minutes, points) {
  document.getElementById('complete-minutes').textContent = minutes;
  document.getElementById('complete-points').textContent  = points;
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
  const histItems = history.slice(0, 10).map(h => {
    const isApp   = h.type === 'app';
    // Firestore sessions: storyTitle (app) / bookTitle (book); legacy: h.title (book)
    const title   = isApp ? (h.storyTitle || '') : (h.bookTitle || h.title || '');
    const dateLbl = h.date    || '';
    const minLbl  = (h.minutes ?? 0) + ' דקות';
    const ptsLbl  = '+' + (h.points ?? 0) + ' נק׳';
    return `
      <div class="history-item">
        <span class="history-icon">${isApp ? '📱' : '📖'}</span>
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

function showClassView() {
  window._classReturnScreen = 'screen-main';
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
  const [club, memberships] = await Promise.all([
    typeof fbLoadClub          === 'function' ? fbLoadClub(clubId)          : Promise.resolve(null),
    typeof fbLoadClubMemberships === 'function' ? fbLoadClubMemberships(clubId) : Promise.resolve([]),
  ]);

  const goalTarget = club?.goal?.target || 1500;
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

  const totalMins     = active.reduce((s, m) => s + m.totalMinutes,  0);
  const totalSessions = active.reduce((s, m) => s + m.totalSessions, 0);
  const leaves        = Math.floor(totalMins / 100);
  const fruits        = Math.floor(totalMins / 500);
  const blooming      = totalMins >= goalTarget;
  const pct           = Math.min(100, Math.round((totalMins / goalTarget) * 100));
  const remaining     = Math.max(0, goalTarget - totalMins);
  const posIcons      = ['🥇', '🥈', '🥉'];
  const rowCls        = ['leader-first', 'leader-second', 'leader-third'];

  contentEl.innerHTML = `
    <div class="class-hero">
      <div class="class-big-tree">🌳</div>
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
      <div class="class-stat"><span>📖</span><strong>${totalSessions}</strong><span>סיפורים</span></div>
      <div class="class-stat"><span>🍃</span><strong>${leaves}</strong><span>עלים</span></div>
      <div class="class-stat"><span>🍎</span><strong>${fruits}</strong><span>פירות</span></div>
      <div class="class-stat"><span>👥</span><strong>${active.length}</strong><span>חברים</span></div>
    </div>
    <div class="goal-section">
      <p>🎯 יעד הכיתה: <strong>${goalTarget}</strong> דקות · <strong>${pct}%</strong> הושלמו
        ${remaining > 0 ? `· עוד <strong>${remaining}</strong> דק׳` : ' · 🎉 הגענו!'}</p>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%;background:linear-gradient(90deg,#27AE60,#8BC34A)"></div>
      </div>
    </div>
    <div class="leaderboard">
      <h3>🏆 10 הקוראים המובילים</h3>
      ${active.slice(0, 10).map((m, i) => `
        <div class="leader-row ${rowCls[i] || ''}">
          <span class="leader-pos">${posIcons[i] || (i + 1)}</span>
          ${_avatarHtml(m.emoji || '📚', 'leader-avatar')}
          <span class="leader-name">${m.name}</span>
          <span class="leader-pts">${m.totalMinutes} דק׳</span>
        </div>`).join('')}
    </div>`;
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
      <div class="class-big-tree">🌳</div>
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
  if (typeof migrateFromLocalStorage === 'function') {
    const migrated = await migrateFromLocalStorage();
    if (migrated > 0) {
      console.log(`[booki] ✅ הועברו ${migrated} תלמידים מ-localStorage ל-Firebase`);
    }
  }

  // ─── תיקון שמות לא עקביים ב-Firebase (אוטומטי) ──────────────
  if (typeof fixAllStudentNames === 'function') {
    await fixAllStudentNames(STUDENT_NAMES);
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
