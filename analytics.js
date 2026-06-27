/**
 * analytics.js — Event Tracking Infrastructure
 *
 * פונקציה מרכזית: track(eventName, props)
 * לעולם לא זורקת שגיאה — כישלון נבלע בשקט.
 *
 * אירועים:
 *   app_open              — פתיחת האפליקציה
 *   profile_selected      — משתמש בחר פרופיל (כניסה לקריאה)
 *   club_dashboard_viewed — הדשבורד של מועדון נפתח
 *   story_selected        — משתמש לחץ על סיפור
 *   reading_started       — קריאה החלה (כולל סיפורים)
 *   reading_completed     — סשן קריאה הסתיים
 *   join_club_started     — התחלת תהליך הצטרפות
 *   join_club_completed   — הצטרפות למועדון הושלמה
 *   user_registered       — משתמש חדש סיים אונבורדינג
 *   club_created          — מועדון חדש נוצר
 *
 * מבנה Firebase:
 *   /owner-stats/events   — ספירת כל אירוע + ספירה יומית
 *   /owner-stats/global   — מונים: משתמשים, מועדונים, דקות, סשנים, DAU
 *   /owner-stats/stories  — פופולריות לפי סיפור
 *   /owner-stats/errors/log — שגיאות (sub-collection)
 */

// ─── עזרים פנימיים ────────────────────────────────────────────────────────────

function _db()  { return window.db || null; }
function _now() { return new Date().toISOString(); }
function _day() { return _now().slice(0, 10).replace(/-/g, '_'); }

/** Firestore atomic increment — בטוח גם ללא firebase global */
function _inc(n = 1) {
  if (typeof firebase !== 'undefined' && firebase.firestore?.FieldValue) {
    return firebase.firestore.FieldValue.increment(n);
  }
  return n;
}

// ─── Central tracking function ────────────────────────────────────────────────

/**
 * track(eventName, props)
 *
 * fire-and-forget — לעולם לא חוסמת את ה-UI.
 * לעולם לא זורקת — כישלון נבלע בשקט.
 */
async function track(eventName, props = {}) {
  const db = _db();
  if (!db) return;

  const day = _day();

  try {
    // ספירת אירוע (כולל ספירה יומית)
    db.collection('owner-stats').doc('events').set({
      [eventName]:            _inc(1),
      [`${eventName}_${day}`]: _inc(1),
    }, { merge: true }).catch(() => {});

    // אגרגציות נוספות לפי סוג אירוע
    switch (eventName) {

      case 'user_registered':
        db.collection('owner-stats').doc('global').set(
          { totalUsers: _inc(1), updatedAt: _now() },
          { merge: true }
        ).catch(() => {});
        break;

      case 'club_created':
        db.collection('owner-stats').doc('global').set(
          { totalClubs: _inc(1), updatedAt: _now() },
          { merge: true }
        ).catch(() => {});
        break;

      case 'profile_selected':
        // DAU — Daily Active Users
        db.collection('owner-stats').doc('global').set(
          { [`dau_${day}`]: _inc(1), updatedAt: _now() },
          { merge: true }
        ).catch(() => {});
        break;

      case 'reading_completed':
        if (props.minutes > 0) {
          db.collection('owner-stats').doc('global').set({
            totalSessions: _inc(1),
            totalMinutes:  _inc(props.minutes),
            updatedAt:     _now(),
          }, { merge: true }).catch(() => {});

          if (props.storyId) {
            db.collection('owner-stats').doc('stories').set({
              [props.storyId]: {
                title:     props.storyTitle || props.storyId,
                readCount: _inc(1),
                minutes:   _inc(props.minutes),
              }
            }, { merge: true }).catch(() => {});
          }

          // עדכון סטטיסטיקות חברות ב-Firebase (מקור האמת)
          if (props.clubId && props.userId && typeof fbUpdateMembershipStats === 'function') {
            fbUpdateMembershipStats(props.clubId, props.userId, { minutes: props.minutes }).catch(() => {});
          }
        }
        break;
    }
  } catch (e) {
    console.warn('[analytics]', eventName, e.message);
    // Never rethrow — reading flow must not break
  }
}

// ─── Named wrappers (backward compat) ─────────────────────────────────────────
// קוד קיים קורא לפונקציות אלו — הן מעבירות ל-track() בלבד

function analyticsUserRegistered(userId, clubId) {
  return track('user_registered', { userId, clubId });
}

function analyticsUserActive(userId, clubId) {
  return track('profile_selected', { userId, clubId });
}

function analyticsReadingSession(userId, clubId, session) {
  return track('reading_completed', {
    userId, clubId,
    storyId:    session.storyId,
    storyTitle: session.storyTitle,
    minutes:    session.minutes || 0,
    type:       session.type,
  });
}

function analyticsClubCreated(clubId, type) {
  return track('club_created', { clubId, type });
}

// ─── Error logging ────────────────────────────────────────────────────────────

async function analyticsError(context, message, data = {}) {
  const db = _db();
  if (!db) return;
  try {
    db.collection('owner-stats').doc('errors').collection('log').add({
      context,
      message:   String(message).slice(0, 500),
      data,
      userAgent: (navigator.userAgent || '').slice(0, 120),
      timestamp: _now(),
    }).catch(() => {});
  } catch { /* silent */ }
}

// ─── חשיפה גלובלית ────────────────────────────────────────────────────────────

Object.assign(window, {
  track,
  analyticsUserRegistered,
  analyticsUserActive,
  analyticsReadingSession,
  analyticsClubCreated,
  analyticsError,
});
