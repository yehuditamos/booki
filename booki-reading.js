/* ═══════════════════════════════════════════════════════════════
   יער הקריאה של בוקי — booki-reading.js
   "קריאה עם בוקי" — חוויית קריאה שקטה: בוקי שומר על הזמן, שואל
   שאלה קטנה בסוף (לא מבחן, אין נכון/לא נכון), ואז חוגגים יחד.
   שלושה חלקים נפרדים בכוונה — כדי שספרינטים עתידיים (שאלות נוספות,
   שיחה עם AI, הישגים) יגעו רק בחלק 3 מבלי לגעת בטיימר:
     1. מחזור חיים של סשן (start/resume/discard/cancel/טיימר)
     2. גשר השלמה (_finishBookiReading) — משתמש באותן פונקציות
        משותפות ש-finishAppReading/submitBookReading כבר קוראות
     3. שלב אחרי-קריאה (_runPostReadingStep) — היום: שאלת רפלקציה
═══════════════════════════════════════════════════════════════ */

// ─── 1. מחזור חיים של סשן ───────────────────────────────────────────
// שלושה מצבי-תת-מסך בתוך screen-booki-reading, בכוונה נפרדים מהטיימר עצמו:
//   prep (הטיימר עוד לא רץ) -> transition (אנימציה קצרה, ~1.4s) -> running (הטיימר רץ)

let _bookiReadingInterval  = null;
let _bookiTransitionTimer  = null;
let _bookiPendingMinutes   = null;

function _bookiSessionKey() {
  return 'booki_reading_' + currentStudentId;
}

function _loadBookiSession() {
  try {
    const raw = localStorage.getItem(_bookiSessionKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function _showBookiSubview(name) {
  const views = { prep: 'booki-prep-view', transition: 'booki-transition-view', running: 'booki-running-view' };
  for (const key of Object.keys(views)) {
    const el = document.getElementById(views[key]);
    if (el) el.style.display = key === name ? '' : 'none';
  }
}

function _clearBookiReadingLocal() {
  try { localStorage.removeItem(_bookiSessionKey()); } catch {}
  if (_bookiReadingInterval) { clearInterval(_bookiReadingInterval); _bookiReadingInterval = null; }
  if (_bookiTransitionTimer) { clearTimeout(_bookiTransitionTimer); _bookiTransitionTimer = null; }
  const banner = document.getElementById('booki-resume-banner');
  if (banner) banner.style.display = 'none';
}

/** נקרא בכניסה למסך הבית (אותה נקודת-חיבור שבה Sprint 7 קורא ל-renderHomeEncouragement). */
function checkBookiReadingResume() {
  const banner = document.getElementById('booki-resume-banner');
  if (!banner) return;
  const session = _loadBookiSession();
  banner.style.display = session?.startedAt ? '' : 'none';
}

function _minutesLabel(n) {
  return n === 1 ? '1 דקה' : n + ' דקות';
}

function _renderBookiElapsed(startedAt) {
  const update = () => {
    const mins = Math.max(0, Math.floor((Date.now() - startedAt) / 60000));
    const el = document.getElementById('booki-elapsed-minutes');
    if (el) el.textContent = _minutesLabel(mins);
  };
  update();
  if (_bookiReadingInterval) clearInterval(_bookiReadingInterval);
  _bookiReadingInterval = setInterval(update, 5000);
}

/** מהכרטיס בעמוד הבית — תמיד מציג את מסך ההכנה קודם; הטיימר לא רץ עדיין. */
function startBookiReading() {
  if (currentStudentId === null || currentStudentId === undefined) return;
  const session = _loadBookiSession();
  if (session?.startedAt) {
    // סשן כבר רץ (למשל חזרה למסך בלי לעבור דרך ביטול) — אין טעם להראות שוב את ההכנה.
    _renderBookiElapsed(session.startedAt);
    _showBookiSubview('running');
  } else {
    _showBookiSubview('prep');
  }
  showScreen('screen-booki-reading');
}

/** נלחץ רק בלחיצה על "להתחיל לקרוא" במסך ההכנה — כאן, ורק כאן, הטיימר באמת מתחיל. */
function beginBookiReadingTimer() {
  const startedAt = Date.now();
  try { localStorage.setItem(_bookiSessionKey(), JSON.stringify({ startedAt })); } catch {}
  _showBookiSubview('transition');
  if (_bookiTransitionTimer) clearTimeout(_bookiTransitionTimer);
  _bookiTransitionTimer = setTimeout(() => {
    _bookiTransitionTimer = null;
    _renderBookiElapsed(startedAt);
    _showBookiSubview('running');
  }, 1400);
}

/** מהודעת "להמשיך לקרוא" — סשן כבר קיים, ממשיכים ישר לתצוגת הטיימר הרץ, בלי הכנה ובלי אנימציה. */
function resumeBookiReading() {
  const session = _loadBookiSession();
  if (!session?.startedAt) return;
  _renderBookiElapsed(session.startedAt);
  _showBookiSubview('running');
  showScreen('screen-booki-reading');
}

function discardBookiReading() {
  _clearBookiReadingLocal();
}

function cancelBookiReading() {
  // אם הטיימר עוד לא התחיל (עדיין במסך ההכנה) — אין זמן קריאה לאבד, ואין צורך לאשר.
  const session = _loadBookiSession();
  if (session?.startedAt && !confirm('לצאת מהקריאה? הזמן לא יישמר.')) return;
  _clearBookiReadingLocal();
  showScreen('screen-main');
}

function finishBookiReadingSession() {
  const session = _loadBookiSession();
  const startedAt = session?.startedAt || Date.now();
  _bookiPendingMinutes = Math.max(1, Math.floor((Date.now() - startedAt) / 60000));
  if (_bookiReadingInterval) { clearInterval(_bookiReadingInterval); _bookiReadingInterval = null; }
  _runPostReadingStep(_bookiPendingMinutes);
}

// ─── 3. שלב אחרי-קריאה — היום: שאלת רפלקציה קצרה (לא מבחן, אין ניקוד) ──────

const BOOKI_REFLECTION_QUESTIONS = [
  'מי הייתה אחת הדמויות בסיפור שקראת?',
  'מה קרה בסיפור שאהבת היום?',
  'איפה הסיפור קרה?',
];

/** נקודת ההרחבה היחידה לספרינטים עתידיים (שיחה עם AI וכו') — הטיימר לא צריך להשתנות. */
function _runPostReadingStep(minutes) {
  const q = BOOKI_REFLECTION_QUESTIONS[(typeof _dayIndex === 'function' ? _dayIndex() : 0) % BOOKI_REFLECTION_QUESTIONS.length];
  const qEl = document.getElementById('booki-reflection-question');
  if (qEl) qEl.textContent = q;
  const inputEl = document.getElementById('booki-reflection-answer');
  if (inputEl) inputEl.value = '';
  showScreen('screen-booki-reflection');
}

function submitBookiReflection() {
  const inputEl = document.getElementById('booki-reflection-answer');
  const answer = inputEl ? inputEl.value.trim() : '';
  _finishBookiReading(_bookiPendingMinutes, { reflection: answer || null });
}

function skipBookiReflection() {
  _finishBookiReading(_bookiPendingMinutes, { reflection: null });
}

// ─── 2. גשר השלמה — אותן פונקציות משותפות ש-finishAppReading/submitBookReading קוראות ──

async function _finishBookiReading(minutes, extra = {}) {
  if (currentStudentId === null || currentStudentId === undefined) return;
  const points = minutes * 1;

  const s = currentStudentData || loadStudentLocal(currentStudentId);
  if (!Array.isArray(s.history)) s.history = [];
  const prevMinutes = s.totalMinutes;
  s.totalMinutes += minutes;
  s.appMinutes   += minutes;
  s.points       += points;
  s.history.push({
    type: 'booki',
    minutes, points,
    reflection: extra.reflection ?? null,
    date: todayStr(),
  });
  currentStudentData = s;

  await saveStudentFull(s);
  if (!Number.isInteger(currentStudentId) && typeof ensureStudentAuth === 'function') {
    await ensureStudentAuth();
  }
  if (typeof fbSaveReadingSession === 'function') {
    fbSaveReadingSession(currentStudentId, {
      type: 'booki', minutes, points, reflection: extra.reflection ?? null,
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
      type: 'booki', storyId: null, storyTitle: null, minutes,
    });
  }

  _clearBookiReadingLocal();

  const levelUp    = typeof detectLevelUp === 'function' ? detectLevelUp(prevMinutes, s.totalMinutes) : null;
  const streakDays = typeof computeStreakDays === 'function' ? computeStreakDays(s.history) : 0;
  showComplete(minutes, points, { levelUp, streakDays });
}
