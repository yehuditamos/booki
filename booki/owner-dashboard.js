/**
 * owner-dashboard.js — Owner Analytics Dashboard
 *
 * גישה:  window.showOwnerDashboard()  מהקונסול בדפדפן
 * נתונים: owner-stats/* ב-Firestore (כותב analytics.js)
 *
 * הדשבורד לא נגיש לילדים — אין כפתור בממשק הרגיל.
 */

// ─── Entry Point ─────────────────────────────────────────────────────────────

function showOwnerDashboard() {
  if (!window.db) {
    alert('Firestore לא מוכן עדיין — נסה שוב בעוד שנייה');
    return;
  }
  if (typeof showScreen !== 'function') return;
  showScreen('screen-owner-dashboard');
  _odLoad();
}

// ─── Main Loader ─────────────────────────────────────────────────────────────

async function _odLoad() {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  set('od-status', 'טוען...');

  const today = _odDay(0);
  const last7  = Array.from({ length: 7 }, (_, i) => _odDay(i));

  try {
    const db = window.db;

    // ── גלובלי ─────────────────────────────────────────────────────
    const [gSnap, evSnap, stSnap] = await Promise.all([
      db.collection('owner-stats').doc('global').get(),
      db.collection('owner-stats').doc('events').get(),
      db.collection('owner-stats').doc('stories').get(),
    ]);

    const g  = gSnap.exists  ? gSnap.data()  : {};
    const ev = evSnap.exists ? evSnap.data() : {};
    const st = stSnap.exists ? stSnap.data() : {};

    // ── משתמשים ────────────────────────────────────────────────────
    set('od-total-users',    _fmt(g.totalUsers    ?? 0));
    set('od-total-clubs',    _fmt(g.totalClubs    ?? 0));
    set('od-dau-today',      _fmt(g[`dau_${today}`] ?? 0));

    const wau = last7.reduce((acc, d) => acc + (g[`dau_${d}`] ?? 0), 0);
    set('od-wau', _fmt(wau));

    set('od-new-today',  _fmt(ev[`user_registered_${today}`]  ?? 0));
    set('od-joins-today',_fmt(ev[`join_club_completed_${today}`] ?? 0));
    set('od-opens-today',_fmt(ev[`app_open_${today}`]          ?? 0));

    // ── קריאה ──────────────────────────────────────────────────────
    set('od-total-minutes',  _fmt(Math.round(g.totalMinutes  ?? 0)));
    set('od-total-sessions', _fmt(g.totalSessions ?? 0));
    set('od-sessions-today', _fmt(ev[`reading_completed_${today}`] ?? 0));

    // ── סיפורים פופולריים ───────────────────────────────────────────
    const topStories = Object.entries(st)
      .filter(([, v]) => v && typeof v === 'object' && (v.readCount ?? 0) > 0)
      .sort((a, b) => (b[1].readCount ?? 0) - (a[1].readCount ?? 0))
      .slice(0, 8);

    const stEl = document.getElementById('od-top-stories');
    if (stEl) {
      stEl.innerHTML = topStories.length
        ? topStories.map(([id, v]) => `
            <div class="od-row">
              <span class="od-row-label">${v.title || _odStoryTitle(id)}</span>
              <span class="od-badge">${_fmt(v.readCount ?? 0)} × · ${_fmt(Math.round(v.minutes ?? 0))} דק׳</span>
            </div>`).join('')
        : '<div class="od-empty">אין קריאות עדיין</div>';
    }

    // ── שגיאות ─────────────────────────────────────────────────────
    _odLoadErrors();

    // ── מועדונים ────────────────────────────────────────────────────
    _odLoadClubs();

    set('od-status', 'עודכן ' + new Date().toLocaleTimeString('he-IL'));

  } catch (err) {
    set('od-status', '❌ ' + err.message);
    console.error('[owner-dashboard]', err);
  }
}

// ─── Errors ──────────────────────────────────────────────────────────────────

async function _odLoadErrors() {
  const el = document.getElementById('od-errors');
  if (!el || !window.db) return;

  try {
    const snap = await window.db
      .collection('owner-stats').doc('errors').collection('log')
      .orderBy('timestamp', 'desc').limit(8).get();

    el.innerHTML = snap.empty
      ? '<div class="od-empty">✅ אין שגיאות</div>'
      : snap.docs.map(d => {
          const e = d.data();
          const ts = (e.timestamp || '').slice(5, 16);
          return `<div class="od-error-row">
            <span class="od-err-ts">${ts}</span>
            <span class="od-err-ctx">[${e.context || '?'}]</span>
            <span class="od-err-msg">${(e.message || '').slice(0, 80)}</span>
          </div>`;
        }).join('');
  } catch (e) {
    el.innerHTML = `<div class="od-empty">שגיאה בטעינת לוג: ${e.message}</div>`;
  }
}

// ─── Clubs ───────────────────────────────────────────────────────────────────

async function _odLoadClubs() {
  const el = document.getElementById('od-clubs-list');
  if (!el || !window.db) return;

  el.innerHTML = '<div class="od-empty">טוען...</div>';

  try {
    const snap = await window.db.collection('clubs')
      .where('active', '==', true).limit(30).get();

    if (snap.empty) { el.innerHTML = '<div class="od-empty">אין מועדונים</div>'; return; }

    const rows = await Promise.all(snap.docs.map(async doc => {
      const c = doc.data();
      let members = '?';
      try {
        const mem = await window.db
          .collection('clubs').doc(doc.id)
          .collection('memberships').where('status', '==', 'active').get();
        members = mem.size;
      } catch { /* silent */ }
      return `<div class="od-row">
        <span class="od-row-label">${c.emoji || '📚'} ${c.name || doc.id}</span>
        <span class="od-badge">${members} חברים</span>
      </div>`;
    }));

    el.innerHTML = rows.join('');
  } catch (e) {
    el.innerHTML = `<div class="od-empty">שגיאה: ${e.message}</div>`;
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function _odDay(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10).replace(/-/g, '_');
}

function _fmt(n) {
  if (typeof n !== 'number') return String(n);
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
}

function _odStoryTitle(storyId) {
  if (typeof getAllStories === 'function') {
    const s = getAllStories().find(x => x.id === storyId);
    if (s?.title) return s.title;
  }
  return storyId;
}

// ─── חשיפה גלובלית ──────────────────────────────────────────────────────────

window.showOwnerDashboard = showOwnerDashboard;
window._odLoad            = _odLoad;  // לרענון ידני מהקונסול
