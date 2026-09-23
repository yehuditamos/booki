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
 * רשימות הסיכום מחושבות מקומית; תלמידי מועדון נטענים רק בעת פתיחתו.
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

function _odBrowseClubs() {
  const list = document.getElementById('od-clubs-list');
  list?.scrollIntoView({behavior:'smooth',block:'start'});
  list?.querySelector('button')?.focus({preventScroll:true});
}
function _odNode(tag, text, cls) {
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=String(text);
  if(cls)el.className=cls;
  return el;
}
function _odReadDate(value) {
  if(!value)return 'עדיין לא קרא/ה';
  const date=value.toDate?value.toDate():new Date(value);
  return Number.isNaN(date.getTime())?'—':date.toLocaleString('he-IL',{dateStyle:'short',timeStyle:'short'});
}
function _odRenderClubs(clubs) {
  const list=document.getElementById('od-clubs-list');
  const total=document.getElementById('od-total-clubs');
  if(total)total.textContent=String(clubs.length);
  if(!list)return;
  list.replaceChildren();
  if(!clubs.length){list.appendChild(_odNode('div','אין מועדונים','od-empty'));return;}
  for(const club of clubs){
    const section=_odNode('div',undefined,'od-club-browser');
    const row=_odNode('div',undefined,'od-row');
    row.style.flexWrap='wrap';
    const label=_odNode('div');label.style.flex='1';label.style.minWidth='150px';
    label.appendChild(_odNode('strong',(club.emoji||'📚')+' '+(club.name||club.id),'od-row-label'));
    label.appendChild(_odNode('div',club.teacherName||club.teacherEmail||'','od-lbl'));
    if(club.hidden)label.appendChild(_odNode('span','מוסתר','od-hidden-badge'));
    const open=_odNode('button','צפייה בתלמידים','od-btn-sm');open.type='button';
    open.style.minHeight='44px';open.setAttribute('aria-expanded','false');
    const panel=_odNode('div');panel.hidden=true;panel.id='od-members-'+encodeURIComponent(club.id);
    open.setAttribute('aria-controls',panel.id);
    let loaded=false,busy=false;
    open.onclick=async()=>{
      panel.hidden=!panel.hidden;open.setAttribute('aria-expanded',String(!panel.hidden));
      open.textContent=panel.hidden?'צפייה בתלמידים':'סגירת התלמידים';
      if(panel.hidden||loaded||busy)return;
      busy=true;panel.textContent='טוען תלמידים…';panel.setAttribute('role','status');
      try {
        const user=typeof firebase!=='undefined'?firebase.auth().currentUser:null;
        if(!user||user.isAnonymous)throw Error('owner-only');
        const uid=user.uid,owner=await window.db.collection('users').doc(uid).get({source:'server'});
        if(!owner.exists||owner.data().role!=='owner')throw Error('owner-only');
        const snap=await window.db.collection('clubs').doc(club.id).collection('memberships').get({source:'server'});
        if(firebase.auth().currentUser?.uid!==uid||!panel.isConnected)return;
        const members=snap.docs.map(d=>({...d.data(),id:d.id})).filter(m=>m.status!=='left');
        const isOpen=m=>!m.claimedByUid&&!m.personalized&&/^כרטיס פנוי\s+\d+$/.test(m.name||'');
        members.sort((a,b)=>Number(isOpen(a))-Number(isOpen(b))||String(a.name||'').localeCompare(String(b.name||''),'he',{numeric:true}));
        panel.replaceChildren();panel.removeAttribute('role');
        const free=members.filter(isOpen).length;
        panel.appendChild(_odNode('p',`${members.length-free} ילדים עם שם · ${free} כרטיסים פנויים`));
        if(!members.length)panel.appendChild(_odNode('p','עדיין לא הוספו ילדים למועדון.'));
        for(const m of members){
          const card=_odNode('div',undefined,'od-row');card.style.flexWrap='wrap';
          card.appendChild(_odNode('strong',(m.emoji||'📚')+' '+(m.name||'כרטיס ללא שם')));
          const details=_odNode('span');details.style.fontSize='.85rem';
          const n=Number(m.cachedStats?.totalMinutes);
          details.textContent=isOpen(m)?'ממתין לבחירת ילד/ה':`${Number.isFinite(n)?Math.max(0,Math.round(n)):0} דקות · ${_odReadDate(m.cachedStats?.lastReadAt)}`;
          card.appendChild(details);panel.appendChild(card);
        }
        loaded=true;
      }catch(error){
        panel.replaceChildren(_odNode('p',error.message==='owner-only'?'הצפייה זמינה מחשבון הניהול של יהודית.':'לא הצלחתי לטעון את התלמידים. נסי שוב.'));
        const retry=_odNode('button','ניסיון נוסף','od-btn-sm');retry.type='button';retry.onclick=()=>{panel.hidden=true;open.onclick();};panel.appendChild(retry);
      }finally{busy=false;}
    };
    row.append(label,open);
    const maintenance=_odNode('details');maintenance.appendChild(_odNode('summary','אפשרויות'));
    const toggle=_odNode('button',club.hidden?'שחזר':'הסתר','od-btn-sm');toggle.type='button';
    toggle.onclick=()=>club.hidden?_odRestoreClub(club.id):_odMarkClubHidden(club.id);maintenance.appendChild(toggle);
    if(club.id!=='mitarim-aleph-2025'){
      const repair=_odNode('button','🔧 סרוק','od-btn-sm');repair.type='button';repair.onclick=()=>showCardRepairTool(club.id);maintenance.appendChild(repair);
    }
    row.appendChild(maintenance);section.append(row,panel);list.appendChild(section);
  }
}

// ─── Card Repair Tool — Scan, Dry-Run, Execute ───────────────────────────────

var _repairCardCache    = {};
var _repairActiveClubId = null;

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

    _repairActiveClubId = clubId;
    _repairCardCache    = {};

    const broken = await _scanBrokenCards(clubId);

    if (!broken.length) {
      content.innerHTML = '<div class="od-empty">✅ לא נמצאו כרטיסים שבורים במועדון זה</div>';
      return;
    }

    broken.forEach(function (card) { _repairCardCache[card.cardId] = card; });

    content.innerHTML =
      '<p style="font-size:.85rem;color:#c0392b;margin:.5rem 0 1rem">נמצאו ' + broken.length + ' כרטיסים שבורים:</p>' +
      broken.map(function (card, i) { return _buildRepairRow(clubId, card, i); }).join('');

  } catch (e) {
    content.innerHTML = '<div class="od-empty">שגיאה: ' + e.message + '</div>';
  }
}

async function _scanBrokenCards(clubId) {
  const db = window.db;

  const teacherUids  = new Set();
  const teacherNames = {};

  // Primary source: club document has teacherUid directly
  const clubSnap = await db.collection('clubs').doc(clubId).get();
  if (clubSnap.exists) {
    var cd = clubSnap.data();
    if (cd.teacherUid) {
      teacherUids.add(cd.teacherUid);
      teacherNames[cd.teacherUid] = cd.teacherName || cd.teacherEmail || cd.teacherUid;
    }
  }

  // Secondary source: users collection (may be empty if role field is absent)
  try {
    const uSnap = await db.collection('users').where('role', 'in', ['teacher', 'owner']).get();
    uSnap.forEach(function (d) {
      teacherUids.add(d.id);
      teacherNames[d.id] = d.data().name || d.data().email || d.id;
    });
  } catch (_) {};

  const mSnap  = await db.collection('clubs').doc(clubId).collection('memberships').get();
  const broken = [];

  console.log('[scan] club:', clubId, '| total memberships:', mSnap.docs.length);
  console.log('[scan] teacherUids:', Array.from(teacherUids));

  for (var i = 0; i < mSnap.docs.length; i++) {
    var d = mSnap.docs[i];
    var m = d.data();

    console.log('[scan] card:', d.id, '| name:', m.name, '| status:', m.status,
      '| createdByTeacher:', m.createdByTeacher, '| student_:', d.id.startsWith('student_'));

    if (m.status === 'left')            continue;
    if (d.id.startsWith('student_'))    continue;

    var flags = [];

    if (m.userId && teacherUids.has(m.userId))
      flags.push('userId is teacher: ' + teacherNames[m.userId]);

    if (m.claimedByUid && teacherUids.has(m.claimedByUid))
      flags.push('claimedByUid is teacher: ' + teacherNames[m.claimedByUid]);

    // Self-joined card: not teacher-created, not already in student_xxx format
    // Vulnerable to UID drift (new device / cleared browser = can't save minutes)
    if (!m.createdByTeacher && !flags.length)
      flags.push('self-joined card — UID-locked (vulnerable to session/device change)');

    console.log('[scan] → flags:', flags);

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

function _buildRepairRow(clubId, card, index) {
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

  var fixBtn =
    '<button class="od-btn-sm" style="margin-top:10px;background:#c0392b;color:#fff"' +
    ' onclick="_executeCardRepair(\'' + clubId + '\',\'' + card.cardId + '\')">🔧 תקן כרטיס זה</button>';

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
      '<summary style="cursor:pointer;font-size:.85em;color:#2980b9">Dry-Run — Preview</summary>' +
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
    fixBtn +
  '</div>';
}

async function _executeCardRepair(clubId, cardId) {
  var card = _repairCardCache[cardId];
  if (!card) { alert('Card data not found — please rescan.'); return; }

  var auth = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
  if (!auth || auth.isAnonymous) { alert('Owner login required.'); return; }

  var confirmed = confirm(
    'תיקון כרטיס: ' + card.emoji + ' ' + card.name + '\n\n' +
    'ייצור כרטיס חדש (student_xxx) עם אותם נתונים.\n' +
    'הכרטיס הישן יסומן status:left בלבד — לא יימחק.\n\n' +
    'להמשיך?'
  );
  if (!confirmed) return;

  var db  = window.db;
  var now = new Date().toISOString();
  var newId = 'student_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  var checkSnap = await db.collection('clubs').doc(clubId).collection('memberships').doc(newId).get();
  if (checkSnap.exists) { alert('ID collision — try again.'); return; }

  var s = card.cachedStats || {};
  var newCard = {
    userId:           newId,
    clubId:           clubId,
    name:             card.name,
    emoji:            card.emoji,
    role:             'member',
    status:           'active',
    inviteSource:     'pre-created',
    invitationId:     null,
    createdByTeacher: true,
    personalized:     false,
    claimedByUid:     null,
    permissions: { canViewLeaderboard: true, canAddMembers: false, canEditClub: false },
    joinedAt:    card.joinedAt || now,
    leftAt:      null,
    cachedStats: {
      totalMinutes:  s.totalMinutes  || 0,
      totalSessions: s.totalSessions || 0,
      totalPoints:   s.totalPoints   || 0,
      totalBooks:    s.totalBooks    || 0,
      appMinutes:    s.appMinutes    || 0,
      bookMinutes:   s.bookMinutes   || 0,
      lastReadAt:    s.lastReadAt    || null,
    },
    migratedFrom: cardId,
    updatedAt:    now,
  };

  try {
    await db.collection('clubs').doc(clubId).collection('memberships').doc(newId).set(newCard);
  } catch (e) {
    alert('שגיאה ביצירת כרטיס חדש — הכרטיס הישן לא נגע.\n' + e.message);
    return;
  }

  try {
    await db.collection('clubs').doc(clubId).collection('memberships').doc(cardId).set(
      { status: 'left', migratedTo: newId, updatedAt: now },
      { merge: true }
    );
  } catch (e) {
    alert('כרטיס חדש נוצר (' + newId + ') אך סימון הישן כ-left נכשל.\n' + e.message);
    return;
  }

  var content = document.getElementById('od-repair-content');
  if (content) {
    content.innerHTML =
      '<div style="color:#27ae60;padding:.5rem;font-weight:bold">✅ ' + card.name + ' תוקן בהצלחה!</div>' +
      '<div style="font-size:.8em;color:#666;padding:.25rem .5rem">כרטיס חדש: ' + newId + ' · הישן סומן left.</div>' +
      '<div style="padding:.5rem;color:#888;font-size:.8em">סורק מחדש...</div>';
  }
  setTimeout(function () { showCardRepairTool(clubId); }, 1500);
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
window._executeCardRepair  = _executeCardRepair;

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

