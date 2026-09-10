/** Booki pilot reading completion overrides, 2026-09-10. */
// Reading completion overrides — same behavior covered by scripts/test-reading-save.js.
function _startAppStoryTimer(storyId, now = Date.now()) {
  const completionId = window.BookiReadingSave?.newId('app') || ('app_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 10));
  _appStoryTimer = { storyId:String(storyId), activeMs:0, activeSince:null, completionId };
  _setAppStoryTimerRunning(_isAppStoryActivelyVisible(), now);
}

async function finishAppReading() {
  if (currentStudentId === null || currentStudentId === undefined) {
    console.error('[booki] finishAppReading: currentStudentId is null — aborting');
    return;
  }
  if (!currentStory || !Array.isArray(currentStory.pages) || currentStory.pages.length === 0) {
    alert('הסיפור הנוכחי לא נטען כמו שצריך. חזרו לספרייה ונסו שוב.');
    return;
  }
  if (!window.BookiReadingSave) {
    console.error('[booki] reading-save.js is not loaded');
    alert('שמירת הקריאה עדיין נטענת. נסו שוב בעוד רגע.');
    return;
  }

  _syncAppStoryTimer();
  if (_appStoryTimer) _appStoryTimer.activeSince = null;
  const completionId = _appStoryTimer?.completionId || BookiReadingSave.newId('app');
  const completionKey = 'app:' + completionId;
  if (!_beginReadingCompletion(completionKey)) return;

  try {
    const minutes = _getAppStoryElapsedMinutes(_appStoryTimer);
    const current = _normalizeStudentReadingStats(currentStudentData || loadStudentLocal(currentStudentId));
    const niqud = _storyNiqudSummary(current.history || []);
    const basePoints = minutes;
    const points = basePoints + niqud.lengthBonus + niqud.courageBonus + niqud.milestoneBonus;
    const entry = {
      type: 'app', storyId: currentStory.id, storyTitle: currentStory.title,
      minutes, points, basePoints,
      niqudMode: niqud.mode, qualifiedPages: niqud.qualifiedPages,
      noNiqudWords: niqud.noNiqudWords, niqudHelpPages: niqud.helpPages,
      lengthBonus: niqud.lengthBonus, courageBonus: niqud.courageBonus,
      milestoneBonus: niqud.milestoneBonus, date: todayStr(),
    };
    const result = await BookiReadingSave.commit({
      id: completionId,
      userId: currentStudentId,
      clubId: window.currentClubId || null,
      student: current,
      entry,
      delta: { isApp: true },
    });
    currentStudentData = result.student;

    if (typeof analyticsReadingSession === 'function' && !result.alreadySaved) {
      analyticsReadingSession(currentStudentId, window.currentClubId || null, {
        type: 'app', storyId: currentStory.id, storyTitle: currentStory.title, minutes,
      });
    }
    const levelUp = typeof detectLevelUp === 'function'
      ? detectLevelUp(result.previousMinutes, result.student.totalMinutes) : null;
    const streakDays = typeof computeStreakDays === 'function' ? computeStreakDays(result.student.history) : 0;
    _stopAppStoryTimer();
    _clearPausedAppStory();
    _storyNiqudSession = null;
    showComplete(minutes, points, { levelUp, streakDays, niqudBonus: { ...niqud, basePoints } });
  } catch (e) {
    console.error('[booki] finishAppReading failed:', e);
    alert('לא הצלחנו לשמור את הקריאה. הדקות לא אבדו — נסו שוב בעוד רגע.');
  } finally {
    _endReadingCompletion(completionKey);
  }
}

function startBookReading() {
  document.getElementById('book-title').value  = '';
  document.getElementById('book-author').value = '';
  bookData = { completionId: window.BookiReadingSave?.newId('book') || ('book_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)) };
  document.querySelectorAll('.btn-pages').forEach(b => b.classList.remove('selected'));
  showScreen('screen-book-step1');
}

async function submitBookReading() {
  if (currentStudentId === null || currentStudentId === undefined) {
    console.error('[booki] submitBookReading: currentStudentId is null — aborting');
    return;
  }
  if (!window.BookiReadingSave) {
    alert('שמירת הקריאה עדיין נטענת. נסו שוב בעוד רגע.');
    return;
  }

  const char  = document.getElementById('q-character').value.trim();
  const story = document.getElementById('q-story').value.trim();
  const liked = document.getElementById('q-liked').value.trim();
  if (!char || !story || !liked) { alert('יש למלא את כל השדות'); return; }

  const completionId = bookData.completionId || (bookData.completionId = BookiReadingSave.newId('book'));
  const completionKey = 'book:' + completionId;
  if (!_beginReadingCompletion(completionKey)) return;

  try {
    const minutes = _safeReadingNumber(bookData.minutes, 5);
    if (minutes < 1 || minutes > 240) throw new Error('מספר דקות לא תקין: ' + minutes);
    const points = minutes;
    const current = _normalizeStudentReadingStats(currentStudentData || loadStudentLocal(currentStudentId));
    const entry = {
      type: 'book', title: bookData.title, author: bookData.author || '',
      pages: bookData.pages, minutes, points,
      comprehension: { character: char, plot: story, liked },
      date: todayStr(),
    };
    const result = await BookiReadingSave.commit({
      id: completionId,
      userId: currentStudentId,
      clubId: window.currentClubId || null,
      student: current,
      entry,
      delta: { books: 1, isBook: true },
    });
    currentStudentData = result.student;

    if (typeof analyticsReadingSession === 'function' && !result.alreadySaved) {
      analyticsReadingSession(currentStudentId, window.currentClubId || null, {
        type: 'book', storyId: null, storyTitle: bookData.title, minutes,
      });
    }
    const levelUp = typeof detectLevelUp === 'function'
      ? detectLevelUp(result.previousMinutes, result.student.totalMinutes) : null;
    const streakDays = typeof computeStreakDays === 'function' ? computeStreakDays(result.student.history) : 0;
    showComplete(minutes, points, { levelUp, streakDays });
  } catch (e) {
    console.error('[booki] submitBookReading failed:', e);
    alert('לא הצלחנו לשמור את הקריאה. הדקות לא אבדו — נסו שוב בעוד רגע.');
  } finally {
    _endReadingCompletion(completionKey);
  }
}

async function _finishBookiReading(minutes, extra = {}) {
  if (currentStudentId === null || currentStudentId === undefined) return;
  if (!window.BookiReadingSave) {
    alert('שמירת הקריאה עדיין נטענת. נסו שוב בעוד רגע.');
    return;
  }
  const safeMinutes = _safeReadingNumber(minutes, 0);
  if (safeMinutes < 1 || safeMinutes > _BOOKI_MAX_SESSION_MINUTES) {
    console.error('[booki] invalid timer minutes blocked:', minutes);
    _clearBookiReadingLocal();
    alert('זמן הקריאה לא היה תקין ולכן לא נשמרו דקות.');
    showScreen('screen-main');
    return;
  }
  const session = _loadBookiSession();
  if (!session?.sessionId) {
    alert('לא מצאנו את סשן הקריאה. התחילו קריאה חדשה כדי שלא נשמור דקות שגויות.');
    return;
  }
  const completionId = String(session.sessionId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 140);
  const completionKey = 'booki:' + completionId;
  if (!_beginReadingCompletion(completionKey)) return;
  _bookiPendingMinutes = null;

  try {
    minutes = safeMinutes;
    const points = minutes;
    const current = _normalizeStudentReadingStats(currentStudentData || loadStudentLocal(currentStudentId));
    const entry = {
      type: 'booki', minutes, points,
      reflection: extra.reflection ?? null,
      date: todayStr(),
    };
    const result = await BookiReadingSave.commit({
      id: completionId,
      userId: currentStudentId,
      clubId: window.currentClubId || null,
      student: current,
      entry,
      delta: { isApp: true },
    });
    currentStudentData = result.student;

    if (typeof analyticsReadingSession === 'function' && !result.alreadySaved) {
      analyticsReadingSession(currentStudentId, window.currentClubId || null, {
        type: 'booki', storyId: null, storyTitle: null, minutes,
      });
    }

    _clearBookiReadingLocal();
    const levelUp = typeof detectLevelUp === 'function'
      ? detectLevelUp(result.previousMinutes, result.student.totalMinutes) : null;
    const streakDays = typeof computeStreakDays === 'function' ? computeStreakDays(result.student.history) : 0;
    showComplete(minutes, points, { levelUp, streakDays });
  } catch (e) {
    console.error('[booki] _finishBookiReading failed:', e);
    alert('לא הצלחנו לשמור את הקריאה. הדקות נשארו שמורות בטיימר — נסו שוב בעוד רגע.');
  } finally {
    _endReadingCompletion(completionKey);
  }
}
