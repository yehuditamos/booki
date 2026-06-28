/**
 * owner-dashboard.js — Owner Analytics Dashboard
 *
 * ארכיטקטורת ביצועים: 5 קריאות Firestore קבועות ללא תלות בסקייל.
 *   1. users WHERE role in ['teacher','owner']
 *   2. clubs (כל המועדונים, כולל teacherName + memberCount מוטמעים)
 *   3. owner-stats/global
 *   4. owner-stats/events
 *   5. owner-stats/stories
 *
 * שאר הרינדור הוא חישוב טהור (pure JS) — ללא קריאות Firestore נוספות.
 */

// ─── Entry Point ─────────────────────────────────────────────────────────────

function showOwnerDashboard(teacher) {
  window._currentTeacher = teacher;
  if (!window.db) {
    alert('Firestore לא מוכן עדיין — נסה שוב בעוד שנייה');
    return;
  }
  if (typeof showScreen !== 'function') return;
  const nameEl = document.getElementById('od-owner-name');
  if (nameEl) nameEl.textContent = teacher?.name || teacher?.email || '';
  if (typeof setNavVisible === 'function') setNavVisible(false);
  showScreen('screen-owner-dashboard');
  _odLoad();
}

// ─── Main Loader — 5 קריאות מקבילות ──────────────────────────────────────────

async function _odLoad() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('od-status', 'טוען...');

  try {
    const db    = window.db;
    const today = _odDay(0);
    const last7 = Array.from({ length: 7 }, (_, i) => _odDay(i));

    // ── 5 קריאות מקבילות — גודל קבוע ללא תלות בסקייל ─────────────────────
    const [teachers, clubs, gSnap, evSnap, stSnap] = await Promise.all([
      typeof fbLoadAllTeachers === 'function' ? fbLoadAllTeachers() : Promise.resolve([]),
      typeof fbLoadAllClubs    === 'function' ? fbLoadAllClubs()    : Promise.resolve([]),
      db.collection('owner-stats').doc('global').get(),
      db.collection('owner-stats').doc('events').get(),
      db.collection('owner-stats').doc('stories').get(),
    ]);

    // ── Render — pure computation, ללא קריאות Firestore נוספות ────────────
    _odRenderTeachers(teachers, clubs);
    _odRenderClubs(clubs);

    // ── Analytics ───────────────────────────────────────────────────────────
    const g  = gSnap.exists  ? gSnap.data()  : {};
    const ev = evSnap.exists ? evSnap.data() : {};
    const st = stSnap.exists ? stSnap.data() : {};

    set('od-dau-today', _fmt(g[`dau_${today}`] ?? 0));
    set('od-wau',       _fmt(last7.reduce((s, d) => s + (g[`dau_${d}`] ?? 0), 0)));
    set('od-new-today',   _fmt(ev[`user_registered_${today}`]    ?? 0));
    set('od-joins-today', _fmt(ev[`join_club_completed_${today}`] ?? 0));
    set('od-opens-today', _fmt(ev[`app_open_${today}`]            ?? 0));
    set('od-total-minutes',  _fmt(Math.round(g.totalMinutes  ?? 0)));
    set('od-total-sessions', _fmt(g.totalSessions ?? 0));
    set('od-sessions-today', _fmt(ev[`reading_completed_${today}`] ?? 0));

    // סיפורים פופולריים
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

    _odLoadErrors();
    set('od-status', 'עודכן ' + new Date().toLocaleTimeString('he-IL'));

  } catch (err) {
    const set2 = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set2('od-status', '❌ ' + err.message);
    console.error('[owner-dashboard]', err);
  }
}

// ─── Teacher List — pure computation ─────────────────────────────────────────

function _odRenderTeachers(teachers, clubs) {
  const set    = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const listEl = document.getElementById('od-teachers-list');

  set('od-total-teachers', String(teachers.length));

  if (!teachers.length) {
    if (listEl) listEl.innerHTML = '<div class="od-empty">אין מורות רשומות</div>';
    return;
  }

  // Group clubs by teacherUid — ממידע שכבר נטען, ללא קריאה נוספת
  const clubsByTeacher = {};
  for (const c of clubs) {
    if (!c.teacherUid) continue;
    (clubsByTeacher[c.teacherUid] ??= []).push(c);
  }

  let totalStudents = 0;
  const rows = teachers.map(t => {
    const tClubs       = clubsByTeacher[t.id] || [];
    const clubCount    = tClubs.length;
    const studentCount = tClubs.reduce((s, c) => s + (c.memberCount ?? 0), 0);
    totalStudents     += studentCount;
    const lastLogin    = (t.lastLoginAt || t.createdAt || '').slice(0, 10);
    const roleLabel    = t.role === 'owner' ? ' 👑' : '';
    return `<div class="od-row">
      <div style="flex:1;min-width:0">
        <span class="od-row-label">${t.name || '—'}${roleLabel}</span>
        <span style="font-size:.8em;color:#888;display:block">${t.email || ''} · כניסה: ${lastLogin}</span>
      </div>
      <span class="od-badge">${clubCount} מועדונים · ${studentCount} תלמידים</span>
    </div>`;
  });

  set('od-total-students', String(totalStudents));
  if (listEl) listEl.innerHTML = rows.join('');
}

// ─── Club List — pure computation ────────────────────────────────────────────

function _odRenderClubs(clubs) {
  const set    = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const listEl = document.getElementById('od-clubs-list');

  set('od-total-clubs', String(clubs.length));

  if (!clubs.length) {
    if (listEl) listEl.innerHTML = '<div class="od-empty">אין מועדונים</div>';
    return;
  }

  const rows = clubs.map(c => {
    const memberCount = c.memberCount ?? '?';
    const teacherName = c.teacherName || c.teacherEmail || c.teacherUid || '—';
    const date        = (c.createdAt || '').slice(0, 10);
    return `<div class="od-row">
      <div style="flex:1;min-width:0">
        <span class="od-row-label">${c.emoji || '📚'} ${c.name || c.id}</span>
        <span style="font-size:.8em;color:#888;display:block">${teacherName} · ${date}</span>
      </div>
      <span class="od-badge">${memberCount} תלמידים</span>
    </div>`;
  });

  if (listEl) listEl.innerHTML = rows.join('');
}

// ─── Error Log ────────────────────────────────────────────────────────────────

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
          const e  = d.data();
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

// ─── Utilities ────────────────────────────────────────────────────────────────

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

// ─── חשיפה גלובלית ───────────────────────────────────────────────────────────

window.showOwnerDashboard = showOwnerDashboard;
window._odLoad            = _odLoad;
