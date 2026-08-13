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
// אובייקט עגול אחד (#booki-timer-btn) שהוא גם כפתור ההתחלה וגם תצוגת הטיימר —
// לא שני כפתורים נפרדים. שלושה מצבים: idle (לחיץ, "התחל") -> starting (ניצוצות
// קצרים, ~1.2s, לא לחיץ) -> running (מספר הדקות, לא לחיץ).

let _bookiReadingInterval  = null;
let _bookiTransitionTimer  = null;
let _bookiPendingMinutes   = null;

// טיימר הוא זמן קיר, ולכן סשן שנשאר בטעות ב-localStorage במשך ימים היה בעבר
// מזכה באלפי דקות. ארבע שעות הן תקרת בטיחות נדיבה לקריאת ילדים; מעבר לכך
// הסשן נחשב ישן/פגום ולא נשמר כלל (לעולם לא חותכים בשקט ומעניקים 240 דקות).
const _BOOKI_MAX_SESSION_MINUTES = 240;
const _BOOKI_CLOCK_SKEW_MS = 5 * 60 * 1000;

const _BOOKI_PREP_MSG    = 'הכל מוכן! 📖<br>לחצ/י על השעון כדי להתחיל לקרוא.';
const _BOOKI_RUNNING_MSG = 'תיהנה/י מהספר! 📖<br>אני אשמור לך על זמן הקריאה.';

function _bookiSessionKey() {
  return 'booki_reading_' + currentStudentId;
}

function _loadBookiSession() {
  try {
    const raw = localStorage.getItem(_bookiSessionKey());
    const session = raw ? JSON.parse(raw) : null;
    if (!session) return null;
    const startedAt = Number(session.startedAt);
    if (!Number.isFinite(startedAt) || startedAt <= 0 || startedAt > Date.now() + _BOOKI_CLOCK_SKEW_MS) {
      localStorage.removeItem(_bookiSessionKey());
      return null;
    }
    // אל תשאיר באנר "להמשיך לקרוא" לסשן ישן שכבר אסור לשמור.
    if (Date.now() - startedAt > _BOOKI_MAX_SESSION_MINUTES * 60000) {
      localStorage.removeItem(_bookiSessionKey());
      return null;
    }
    return { ...session, startedAt };
  } catch {
    try { localStorage.removeItem(_bookiSessionKey()); } catch {}
    return null;
  }
}

function _getBookiElapsedMinutes(startedAt, now = Date.now()) {
  const start = Number(startedAt);
  const end = Number(now);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0) return null;
  const elapsedMs = end - start;
  if (elapsedMs < -_BOOKI_CLOCK_SKEW_MS) return null;
  const minutes = Math.max(1, Math.floor(Math.max(0, elapsedMs) / 60000));
  return minutes <= _BOOKI_MAX_SESSION_MINUTES ? minutes : null;
}

function _setBookiBubble(html) {
  const bubble = document.getElementById('booki-say-bubble-text');
  if (bubble) bubble.innerHTML = html;
}

/**
 * idle/starting/running — קובע את מראה הכפתור-העגול וכל הטקסט שבתוכו, כולל האייקון
 * (▶ במצב idle -> 🕒 במצב running) והשורה השנייה (מספר הדקות, מוצג רק כשקוראים באמת).
 * running נשאר עם מסגרת ירוקה + רקע ירוק בהיר כל עוד הסשן פעיל; חוזר למראה המקורי
 * ברגע שחוזרים ל-idle (סיום/ביטול קריאה) — ר' startBookiReading/cancelBookiReading.
 */
function _setBookiTimerState(state) {
  const btn = document.getElementById('booki-timer-btn');
  if (btn) {
    btn.classList.remove('booki-timer-idle', 'booki-timer-starting', 'booki-timer-running');
    btn.classList.add('booki-timer-' + state);
  }
  const icon     = document.getElementById('booki-timer-icon');
  const label    = document.getElementById('booki-timer-label');
  const sublabel = document.getElementById('booki-timer-sublabel');
  if (state === 'idle') {
    if (icon)     icon.textContent     = '▶';
    if (label)    label.textContent    = 'להתחיל לקרוא';
    if (sublabel) sublabel.textContent = '';
  } else if (state === 'starting') {
    if (label)    label.textContent    = '';
    if (sublabel) sublabel.textContent = '';
  } else if (state === 'running') {
    if (icon)     icon.textContent     = '🕒';
    if (label)    label.textContent    = '🟢 קוראים כרגע';
    // מספר הדקות עצמו מוזן ע"י _renderBookiElapsed (מתעדכן כל 5 שניות), לא כאן.
  }
}

function _clearBookiReadingLocal() {
  try { localStorage.removeItem(_bookiSessionKey()); } catch {}
  if (_bookiReadingInterval) { clearInterval(_bookiReadingInterval); _bookiReadingInterval = null; }
  if (_bookiTransitionTimer) { clearTimeout(_bookiTransitionTimer); _bookiTransitionTimer = null; }
  window._homeBannerWants.resume = false;
  if (typeof _reconcileHomeBanners === 'function') {
    _reconcileHomeBanners();
  } else {
    const banner = document.getElementById('booki-resume-banner');
    if (banner) banner.style.display = 'none';
  }
}

/** נקרא בכניסה למסך הבית (אותה נקודת-חיבור שבה Sprint 7 קורא ל-renderHomeEncouragement). */
function checkBookiReadingResume() {
  const session = _loadBookiSession();
  window._homeBannerWants.resume = !!session?.startedAt;
  const stageEl = document.getElementById('booki-resume-banner-stage');
  if (stageEl && !stageEl.innerHTML && typeof bookiStageHtml === 'function') {
    stageEl.innerHTML = bookiStageHtml('core/states/booki-reading.png', { className: 'booki-resume-banner-char' });
  }
  if (typeof _reconcileHomeBanners === 'function') {
    _reconcileHomeBanners();
  } else {
    const banner = document.getElementById('booki-resume-banner');
    if (banner) banner.style.display = session?.startedAt ? '' : 'none';
  }
}

function _minutesLabel(n) {
  return n === 1 ? '1 דקה' : n + ' דקות';
}

function _renderBookiElapsed(startedAt) {
  const update = () => {
    const mins = _getBookiElapsedMinutes(startedAt);
    const el = document.getElementById('booki-timer-sublabel');
    if (el) el.textContent = mins === null ? 'הטיימר פג — התחילו מחדש' : _minutesLabel(mins);
  };
  update();
  if (_bookiReadingInterval) clearInterval(_bookiReadingInterval);
  _bookiReadingInterval = setInterval(update, 5000);
}

/** מהכרטיס בעמוד הבית — מציג את הכפתור-העגול במצב הנכון לפי מצב הסשן. */
function startBookiReading() {
  if (currentStudentId === null || currentStudentId === undefined) return;
  const session = _loadBookiSession();
  if (session?.startedAt) {
    // סשן כבר רץ (למשל חזרה למסך בלי לעבור דרך ביטול) — ממשיכים ישר, בלי "התחל" מחדש.
    _setBookiTimerState('running');
    _renderBookiElapsed(session.startedAt);
    _setBookiBubble(_BOOKI_RUNNING_MSG);
  } else {
    _setBookiTimerState('idle');
    _setBookiBubble(_BOOKI_PREP_MSG);
  }
  showScreen('screen-booki-reading');
}

/** נלחץ על הכפתור-העגול עצמו במצב idle — כאן, ורק כאן, הטיימר באמת מתחיל. */
function beginBookiReadingTimer() {
  const btn = document.getElementById('booki-timer-btn');
  if (btn && !btn.classList.contains('booki-timer-idle')) return; // כבר בתהליך/רץ — התעלם מלחיצות נוספות

  const startedAt = Date.now();
  const sessionId = 'booki_' + startedAt.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  try { localStorage.setItem(_bookiSessionKey(), JSON.stringify({ startedAt, sessionId })); } catch {}
  _setBookiTimerState('starting');
  _setBookiBubble(_BOOKI_RUNNING_MSG);

  if (_bookiTransitionTimer) clearTimeout(_bookiTransitionTimer);
  _bookiTransitionTimer = setTimeout(() => {
    _bookiTransitionTimer = null;
    _setBookiTimerState('running');
    _renderBookiElapsed(startedAt);
  }, 1200);
}

/** מהודעת "להמשיך לקרוא" — סשן כבר קיים, ממשיכים ישר למצב running, בלי אנימציית ההתחלה. */
function resumeBookiReading() {
  const session = _loadBookiSession();
  if (!session?.startedAt) return;
  _setBookiTimerState('running');
  _renderBookiElapsed(session.startedAt);
  _setBookiBubble(_BOOKI_RUNNING_MSG);
  showScreen('screen-booki-reading');
}

function discardBookiReading() {
  _clearBookiReadingLocal();
}

function cancelBookiReading() {
  // אם הטיימר עוד לא התחיל (מצב idle) — אין זמן קריאה לאבד, ואין צורך לאשר.
  const session = _loadBookiSession();
  if (session?.startedAt && !confirm('לצאת מהקריאה? הזמן לא יישמר.')) return;
  _clearBookiReadingLocal();
  showScreen('screen-main');
}

function finishBookiReadingSession() {
  const session = _loadBookiSession();
  if (!session?.startedAt) {
    alert('כדי לשמור דקות, צריך להתחיל קודם את הטיימר.');
    return;
  }
  _bookiPendingMinutes = _getBookiElapsedMinutes(session.startedAt);
  if (_bookiPendingMinutes === null) {
    _clearBookiReadingLocal();
    _setBookiTimerState('idle');
    alert('הטיימר נשאר פתוח זמן רב מדי ולכן לא שמרנו דקות שגויות. התחילו קריאה חדשה.');
    showScreen('screen-main');
    return;
  }
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
  const safeMinutes = _safeReadingNumber(minutes, 0);
  if (safeMinutes < 1 || safeMinutes > _BOOKI_MAX_SESSION_MINUTES) {
    console.error('[booki] invalid timer minutes blocked:', minutes);
    _clearBookiReadingLocal();
    alert('זמן הקריאה לא היה תקין ולכן לא נשמרו דקות.');
    showScreen('screen-main');
    return;
  }
  const session = _loadBookiSession();
  const completionKey = 'booki:' + (session?.sessionId || session?.startedAt || currentStudentId);
  if (!_beginReadingCompletion(completionKey)) return;
  _bookiPendingMinutes = null;

  try {
  minutes = safeMinutes;
  const points = minutes * 1;

  const s = _normalizeStudentReadingStats(currentStudentData || loadStudentLocal(currentStudentId));
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

  // Bug fix: ר' finishAppReading ב-script.js — auth חייבת להיות מוקמת לפני saveStudentFull.
  if (!Number.isInteger(currentStudentId) && typeof ensureStudentAuth === 'function') {
    await ensureStudentAuth();
  }
  await saveStudentFull(s);
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
  } catch (e) {
    console.error('[booki] _finishBookiReading failed:', e);
    alert('לא הצלחנו לשמור את הקריאה. נסו שוב בעוד רגע.');
  } finally {
    _endReadingCompletion(completionKey);
  }
}
