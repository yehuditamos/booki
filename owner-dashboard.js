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
    _odRenderSystemClubs().catch(e => console.warn('[owner-dashboard] system clubs:', e));

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

  const LEGACY_ID = 'mitarim-aleph-2025';
  const rows = clubs.map(c => {
    const memberCount  = c.memberCount ?? '?';
    const teacherName  = c.teacherName || c.teacherEmail || c.teacherUid || '—';
    const date         = (c.createdAt || '').slice(0, 10);
    const hiddenBadge  = c.hidden ? ' <span class="od-hidden-badge">מוסתר</span>' : '';
    const actionBtn    = c.hidden
      ? `<button class="od-btn-sm" onclick="_odRestoreClub('${c.id}')">שחזר</button>`
      : `<button class="od-btn-sm" onclick="_odMarkClubHidden('${c.id}')">הסתר</button>`;
    const repairBtn = c.id !== LEGACY_ID
      ? `<button class="od-btn-sm" onclick="showCardRepairTool('${c.id}')">🔧 סרוק</button>`
      : '';
    return `<div class="od-row${c.hidden ? ' od-row--hidden' : ''}">
      <div style="flex:1;min-width:0">
        <span class="od-row-label">${c.emoji || '📚'} ${c.name || c.id}${hiddenBadge}</span>
        <span style="font-size:.8em;color:#888;display:block">${teacherName} · ${date}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span class="od-badge">${memberCount} תלמידים</span>
        ${repairBtn}
        ${actionBtn}
      </div>
    </div>`;
  });

  if (listEl) listEl.innerHTML = rows.join('');
}

// ─── Card Repair Tool — Read-Only Scan + Dry-Run ──────────────────────────────

async function showCardRepairTool(clubId) {
  const section = document.getElementById('od-repair-section');
  const content = document.getElementById('od-repair-content');
  const nameEl  = document.getElementById('od-repair-club-name');
  if (!section || !content) return;

  content.innerHTML = '<div class="od-empty">סורק...</div>';
  section.style.display = '';
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const clubSnap = await window.db.collection('clubs').doc(clubId).get();
    const clubName = clubSnap.exists ? (clubSnap.data().name || clubId) : clubId;
    if (nameEl) nameEl.textContent = clubName;

    const broken = await _scanBrokenCards(clubId);

    if (!broken.length) {
      content.innerHTML = '<div class="od-empty">✅ לא נמצאו כרטיסים שבורים במועדון זה</div>';
      return;
    }

    content.innerHTML =
      '<p style="font-size:.85rem;color:#c0392b;margin:.5rem 0 1rem">נמצאו ' + broken.length + ' כרטיסים שבורים — Dry-Run בלבד, אין כתיבה:</p>' +
      broken.map(function (card, i) { return _buildRepairRow(card, i); }).join('');

  } catch (e) {
    content.innerHTML = '<div class="od-empty">שגיאה: ' + e.message + '</div>';
  }
}

async function _scanBrokenCards(clubId) {
  const db = window.db;

  const teacherUids  = new Set();
  const teacherNames = {};
  const uSnap = await db.collection('users').where('role', 'in', ['teacher', 'owner']).get();
  uSnap.forEach(function (d) {
    teacherUids.add(d.id);
    teacherNames[d.id] = d.data().name || d.data().email || d.id;
  });

  const mSnap  = await db.collection('clubs').doc(clubId).collection('memberships').get();
  const broken = [];

  for (var i = 0; i < mSnap.docs.length; i++) {
    var d = mSnap.docs[i];
    var m = d.data();

    if (m.status === 'left')            continue;
    if (d.id.startsWith('student_'))    continue;

    var flags = [];

    if (m.userId && teacherUids.has(m.userId))
      flags.push('userId is teacher: ' + teacherNames[m.userId]);

    if (m.claimedByUid && teacherUids.has(m.claimedByUid))
      flags.push('claimedByUid is teacher: ' + teacherNames[m.claimedByUid]);

    var profileName = null;
    if (m.userId) {
      try {
        var pSnap = await db.collection('users').doc(m.userId).collection('profile').doc('main').get();
        if (pSnap.exists) {
          profileName = (pSnap.data().name || '').trim();
          var cardName = (m.name || '').trim();
          if (profileName && cardName && profileName !== cardName && teacherUids.has(m.userId))
            flags.push('profile "' + profileName + '" != card "' + cardName + '"');
        }
      } catch (_) {}
    }

    if (flags.length) {
      broken.push({
        cardId:          d.id,
        name:            m.name            || '-',
        userId:          m.userId          || '-',
        claimedByUid:    m.claimedByUid    || null,
        createdByTeacher: m.createdByTeacher || false,
        personalized:    m.personalized    || false,
        emoji:           m.emoji           || '📚',
        joinedAt:        m.joinedAt        || null,
        cachedStats:     m.cachedStats     || {},
        flags:           flags,
        profileName:     profileName,
      });
    }
  }

  return broken;
}

function _buildRepairRow(card, index) {
  var stats     = card.cachedStats || {};
  var flagsHtml = card.flags.map(function (f) {
    return '<span style="display:inline-block;background:#fde8e8;color:#c0392b;border-radius:4px;padding:1px 6px;font-size:.78em;margin:1px">' + f + '</span>';
  }).join(' ');

  var previewId = 'student_' + Date.now().toString(36) + String(index);

  var newCardJson = JSON.stringify({
    userId:           previewId + '  (final ID generated at write time)',
    name:             card.name,
    emoji:            card.emoji,
    createdByTeacher: true,
    personalized:     false,
    claimedByUid:     null,
    status:           'active',
    migratedFrom:     card.cardId,
    cachedStats: {
      totalMinutes:  stats.totalMinutes  || 0,
      totalSessions: stats.totalSessions || 0,
      totalPoints:   stats.totalPoints   || 0,
      totalBooks:    stats.totalBooks    || 0,
      appMinutes:    stats.appMinutes    || 0,
      bookMinutes:   stats.bookMinutes   || 0,
      lastReadAt:    stats.lastReadAt    || null,
    },
  }, null, 2);

  var oldUpdateJson = JSON.stringify({
    status:     'left',
    migratedTo: previewId + '  (same ID as new card)',
    updatedAt:  '(now)',
  }, null, 2);

  return '<div style="border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:12px">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<span style="font-size:1.1em">' + card.emoji + ' ' + card.name + '</span>' +
      '<span style="font-size:.8em;color:#888">card: ' + card.cardId + '</span>' +
    '</div>' +
    '<div style="margin-bottom:6px">' + flagsHtml + '</div>' +
    '<div style="font-size:.8em;color:#666;margin-bottom:8px">' +
      'totalMinutes: <strong>' + (stats.totalMinutes || 0) + '</strong> · ' +
      'totalSessions: <strong>' + (stats.totalSessions || 0) + '</strong>' +
    '</div>' +
    '<details>' +
      '<summary style="cursor:pointer;font-size:.85em;color:#2980b9">Dry-Run — מה ייקרה (Read-Only Preview)</summary>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">' +
        '<div>' +
          '<div style="font-size:.78em;font-weight:bold;color:#27ae60;margin-bottom:4px">NEW card (create)</div>' +
          '<pre style="font-size:.72em;background:#f5f5f5;padding:8px;border-radius:4px;overflow:auto;margin:0">' + newCardJson + '</pre>' +
        '</div>' +
        '<div>' +
          '<div style="font-size:.78em;font-weight:bold;color:#e67e22;margin-bottom:4px">OLD card (update only 3 fields)</div>' +
          '<pre style="font-size:.72em;background:#f5f5f5;padding:8px;border-radius:4px;overflow:auto;margin:0">' + oldUpdateJson + '</pre>' +
        '</div>' +
      '</div>' +
    '</details>' +
  '</div>';
}

async function _odMarkClubHidden(clubId) {
  if (!confirm(`להסתיר את "${clubId}" מהילדים?\nהנתונים נשמרים, אף תלמיד לא ייפגע.`)) return;
  const meta = { hidden: true };
  if (clubId === 'mitarim-aleph-2025') {
    meta.ownerEmail = 'yehudiiit@icloud.com';
    meta.notes      = 'מועדון ישן — ממתין לאיחוד עם החדש';
  }
  try {
    if (typeof fbSetClubMeta === 'function') await fbSetClubMeta(clubId, meta);
    _odLoad();
  } catch (e) { alert('שגיאה: ' + e.message); }
}

async function _odRestoreClub(clubId) {
  if (!confirm(`לשחזר את "${clubId}" כמועדון פעיל?`)) return;
  try {
    if (typeof fbSetClubMeta === 'function') await fbSetClubMeta(clubId, { hidden: false });
    _odLoad();
  } catch (e) { alert('שגיאה: ' + e.message); }
}

// ─── System / Bootstrap Clubs ─────────────────────────────────────────────────

async function _odRenderSystemClubs() {
  const el = document.getElementById('od-system-clubs');
  if (!el || typeof BOOTSTRAP_CLUBS === 'undefined' || !window.db) return;

  const rows = await Promise.all(BOOTSTRAP_CLUBS.map(async c => {
    let fsData = null;
    try {
      const snap = await window.db.collection('clubs').doc(c.id).get();
      if (snap.exists) fsData = snap.data();
    } catch (_) {}

    const isHidden   = fsData?.hidden   ?? c.hidden   ?? false;
    const ownerEmail = fsData?.ownerEmail ?? '—';
    const notes      = fsData?.notes     ?? '';

    const badge = isHidden
      ? '<span class="od-hidden-badge">מוסתר</span>'
      : '<span class="od-badge od-badge--active">פעיל</span>';

    const btn = isHidden
      ? `<button class="od-btn-sm" onclick="_odRestoreClub('${c.id}')">שחזר לפעיל</button>`
      : `<button class="od-btn-sm od-btn-sm--warn" onclick="_odMarkClubHidden('${c.id}')">הסתר / שייך אליי</button>`;

    return `<div class="od-row${isHidden ? ' od-row--hidden' : ''}">
      <div style="flex:1;min-width:0">
        <span class="od-row-label">${c.emoji || '📚'} ${c.name} ${badge}</span>
        <span style="font-size:.75em;color:#888;display:block">ID: ${c.id}${ownerEmail !== '—' ? ' · ' + ownerEmail : ''}</span>
        ${notes ? `<span style="font-size:.75em;color:#aaa;display:block;font-style:italic">${notes}</span>` : ''}
      </div>
      ${btn}
    </div>`;
  }));

  el.innerHTML = rows.join('') || '<div class="od-empty">אין מועדוני מערכת</div>';
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

// ─── Developer Reset ─────────────────────────────────────────────────────────

async function devReset() {
  const msg = [
    '⚠️ Developer Reset',
    '',
    'פעולה זו תמחק:',
    '• כל המועדונים + חברויות',
    '• כל ההזמנות',
    '• owner-stats',
    '',
    'לא נמחק: חשבונות משתמשים, classes/ — Legacy "מיתרים כיתה א\'"',
    '',
    'להמשיך?',
  ].join('\n');

  if (!confirm(msg)) return;

  const btn = document.getElementById('btn-dev-reset');
  if (btn) { btn.disabled = true; btn.textContent = 'מוחק...'; }

  try {
    const result = typeof fbDevReset === 'function'
      ? await fbDevReset()
      : { ok: false, error: 'fbDevReset לא נמצא' };

    if (result.ok) {
      if (typeof window.clearDeviceLocalCache === 'function') {
        window.clearDeviceLocalCache();
      }
      alert('✅ Reset הושלם:\n' + JSON.stringify(result.counts, null, 2));
      _odLoad(); // רענן את הדשבורד — Owner נשאר מחובר
    } else {
      alert('❌ שגיאה: ' + result.error);
      if (btn) { btn.disabled = false; btn.textContent = '🗑️ Developer Reset'; }
    }
  } catch (e) {
    alert('❌ חריגה: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '🗑️ Developer Reset'; }
  }
}

// ─── חשיפה גלובלית ───────────────────────────────────────────────────────────

window.showOwnerDashboard  = showOwnerDashboard;
window._odLoad             = _odLoad;
window.devReset            = devReset;
window.showCardRepairTool  = showCardRepairTool;

/**
 * פונקציית פיתוח חד-פעמית.
 * מעלה את המשתמש המחובר ל-role:'owner' ויוצרת config/setup אם אינו קיים.
 * יש להסיר פונקציה זו מהקוד לאחר ריצה ראשונה.
 *
 * שימוש: הפעל מקונסול הדפדפן בזמן שמורה מחוברת:
 *   promoteCurrentTeacherToOwner()
 */
async function promoteCurrentTeacherToOwner() {
  const user = firebase.auth().currentUser;
  if (!user) {
    console.error('[promoteToOwner] אין משתמש מחובר');
    return;
  }

  const db  = firebase.firestore();
  const uid = user.uid;
  const now = new Date().toISOString();

  // עדכן role ל-'owner'
  await db.collection('users').doc(uid).set({
    role:        'owner',
    updatedAt:   now,
    lastLoginAt: now,
  }, { merge: true });
  console.log('[promoteToOwner] role עודכן ל-owner עבור', uid);

  // צור config/setup אם אינו קיים
  const setupSnap = await db.collection('config').doc('setup').get();
  if (!setupSnap.exists) {
    await db.collection('config').doc('setup').set({
      completedAt: now,
      ownerUid:    uid,
      orgName:     '',
    });
    console.log('[promoteToOwner] config/setup נוצר');
  } else {
    console.log('[promoteToOwner] config/setup כבר קיים — לא שונה');
  }

  console.log('[promoteToOwner] הושלם. רענן את הדף או הפעל showTeacherDashboard()');
}
window.promoteCurrentTeacherToOwner = promoteCurrentTeacherToOwner;
