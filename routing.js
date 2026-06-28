/**
 * routing.js — Device State + App Routing + Anchor Nav
 *
 * זרימה:
 *   App opens → routeOnLoad() → showWhoReads() [כל המשתמשים]
 *   → selectProfile(userId) → getClubsForUser → showClubDashboard()
 *   → enterReadingFromDashboard() → screen-main
 *
 * Legacy Bridge:
 *   selectLegacyProfile(index) יוצר פרופיל סינטטי עם _legacyIndex
 *   → showClubDashboard → enterReadingFromDashboard → selectStudent(index)
 *   שאר הקוד אינו מודע לכך שמדובר במשתמש Legacy.
 */

const _DEVICE_KEY        = 'booki_device_v1';
const _ACTIVE_READER_KEY = 'booki_active_reader';

let _activeClubId   = null;
let _clubSelectMode = 'device'; // 'device' | 'user'
let _pendingUserId  = null;
let _pendingProfile = null;

// ─── Active Reader ────────────────────────────────────────────────────────────

function getActiveReader() {
  try {
    const raw = localStorage.getItem(_ACTIVE_READER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setActiveReader(reader) {
  if (!reader?.userId) return;
  try {
    localStorage.setItem(_ACTIVE_READER_KEY, JSON.stringify({
      userId: reader.userId,
      clubId: reader.clubId || _activeClubId || null,
      name:   reader.name   || '',
      emoji:  reader.emoji  || '📚',
    }));
  } catch {}
}

function clearActiveReader() {
  localStorage.removeItem(_ACTIVE_READER_KEY);
}

// ─── Device State ─────────────────────────────────────────────────────────────

function getDeviceData() {
  try {
    return JSON.parse(localStorage.getItem(_DEVICE_KEY) || '{"clubs":[]}');
  } catch { return { clubs: [] }; }
}

function _saveDeviceData(data) {
  localStorage.setItem(_DEVICE_KEY, JSON.stringify(data));
}

function getDeviceClubs() {
  return getDeviceData().clubs || [];
}

function hasDeviceClubs() {
  return getDeviceClubs().length > 0;
}

function addDeviceClub(clubMeta) {
  const data = getDeviceData();
  if (!data.clubs) data.clubs = [];
  if (!data.clubs.find(c => c.clubId === clubMeta.clubId)) {
    data.clubs.push({ ...clubMeta, members: clubMeta.members || [] });
    _saveDeviceData(data);
  }
}

function updateDeviceClubStats(clubId, stats) {
  const data = getDeviceData();
  const club = (data.clubs || []).find(c => c.clubId === clubId);
  if (!club) return;
  club.stats = { ...(club.stats || {}), ...stats };
  _saveDeviceData(data);
}

function removeDeviceClub(clubId) {
  const data = getDeviceData();
  data.clubs = (data.clubs || []).filter(c => c.clubId !== clubId);
  _saveDeviceData(data);
}

function addDeviceMember(clubId, member) {
  const data = getDeviceData();
  const club = (data.clubs || []).find(c => c.clubId === clubId);
  if (!club) return;
  if (!club.members) club.members = [];
  if (!club.members.find(m => m.userId === member.userId)) {
    club.members.push(member);
    _saveDeviceData(data);
  }
}

/** מחזיר את המועדונים של משתמש ספציפי על המכשיר */
function getClubsForUser(userId) {
  return getDeviceClubs().filter(c =>
    (c.members || []).some(m => m.userId === userId)
  );
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────

function setNavVisible(visible) {
  document.body.classList.toggle('nav-visible', visible);
  if (!visible) {
    const nav = document.getElementById('booki-nav');
    if (nav) nav.dataset.tab = '';
  }
}

function setNavTab(tab) {
  const nav = document.getElementById('booki-nav');
  if (nav) nav.dataset.tab = tab;
}

function _updateClubCount() {
  document.body.classList.toggle('single-club', getDeviceClubs().length <= 1);
}

// ─── App Routing ──────────────────────────────────────────────────────────────

function routeOnLoad() {
  if (typeof track === 'function') track('app_open');
  setNavVisible(false);

  // קישור הצטרפות תמיד בעדיפות ראשונה (הורה לחץ על קישור)
  const clubParam = new URLSearchParams(window.location.search).get('club');
  if (clubParam && typeof showJoinClubDirect === 'function') {
    showJoinClubDirect(clubParam);
    return;
  }
  const joinCode = new URLSearchParams(window.location.search).get('join');
  if (joinCode && typeof showJoinClubWithCode === 'function') {
    showJoinClubWithCode(joinCode);
    return;
  }

  // קורא שמור — חזרה ישירה למסך הבית
  const reader = getActiveReader();
  if (reader?.userId) {
    _activeClubId        = reader.clubId || null;
    window.currentClubId = reader.clubId || null;
    _enterPersonalHome(reader.userId, reader);
    return;
  }

  // לא מחובר — מסך פתיחה
  showScreen('screen-splash');
}

/** "מתחילים" — טוען מועדוני תלמיד מ-Firebase (multi-club), Fallback ל-device */
async function startReading() {
  const uid = (typeof firebase !== 'undefined' && firebase.apps?.length)
    ? firebase.auth()?.currentUser?.uid
    : null;
  const effectiveUid = uid || localStorage.getItem('booki_tmp_uid');

  if (effectiveUid && typeof fbLoadMembershipsForUser === 'function') {
    // הצג ספינר מיד
    const titleEl = document.getElementById('club-select-title');
    const listEl  = document.getElementById('club-select-list');
    if (titleEl) titleEl.textContent = '📚 המועדונים שלי';
    if (listEl)  listEl.innerHTML    = '<div style="text-align:center;padding:2rem;font-size:2rem">⏳</div>';
    _clubSelectMode = 'device';
    _pendingUserId  = null;
    _pendingProfile = null;
    setNavTab('clubs');
    showScreen('screen-club-select');

    try {
      const memberships = await fbLoadMembershipsForUser(effectiveUid);
      const clubIds     = [...new Set(memberships.map(m => m.clubId))];
      const clubs = (await Promise.all(
        clubIds.map(async id => {
          const c = typeof fbLoadClub === 'function' ? await fbLoadClub(id) : null;
          return c ? { clubId: c.id, name: c.name, emoji: c.emoji, type: c.type } : null;
        })
      )).filter(Boolean);

      if (clubs.length === 1) { showWhoReads(clubs[0].clubId); return; }
      if (clubs.length > 1)   { _renderClubSelect(clubs);      return; }
    } catch {}
  }

  // Fallback — מועדוני המכשיר
  const deviceClubs = getDeviceClubs();
  if (!deviceClubs.length) { showScreen('screen-splash'); return; }
  const titleEl = document.getElementById('club-select-title');
  if (titleEl) titleEl.textContent = '🌳 מועדונים קיימים';
  _clubSelectMode = 'device';
  _pendingUserId  = null;
  _pendingProfile = null;
  _renderClubSelect(deviceClubs);
  setNavTab('clubs');
  showScreen('screen-club-select');
}

/** חזרה למסך הבית */
function goHome() {
  setNavVisible(false);
  if (hasDeviceClubs()) showScreen('screen-home');
  else showScreen('screen-splash');
}

// ─── Club Select ──────────────────────────────────────────────────────────────

/** 🏘️ המועדונים שלי — תמיד מציג club-select, ללא דילוג */
function goClubs() {
  const clubs = getDeviceClubs();
  if (!clubs.length) return;
  const titleEl = document.getElementById('club-select-title');
  if (titleEl) titleEl.textContent = 'בחר/י מועדון';
  _clubSelectMode = 'device';
  _pendingUserId  = null;
  _pendingProfile = null;
  _renderClubSelect(clubs);
  setNavTab('clubs');
  showScreen('screen-club-select');
}

/** בחירת מועדון לאחר זיהוי משתמש (מועדונים מרובים) */
function _showClubSelectForUser(userId, profile, userClubs) {
  _clubSelectMode = 'user';
  _pendingUserId  = userId;
  _pendingProfile = profile;
  _renderClubSelect(userClubs);
  setNavTab('clubs');
  showScreen('screen-club-select');
}

/** onclick handler לכל כרטיסי המועדון — מנתב לפי הקשר */
function pickClub(clubId) {
  if (_clubSelectMode === 'user') {
    // ילד בחר מועדון מרובה — כנס ישירות לקריאה
    _activeClubId        = clubId;
    window.currentClubId = clubId;
    _enterPersonalHome(_pendingUserId, _pendingProfile);
    return;
  }
  // device mode: מנהל/כניסה ראשית — הצג "הכיתה שלנו" (כרטיסי תלמידים)
  showWhoReads(clubId);
}

function _fmtNum(n) {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
}

function _buildClubCard(c) {
  const isLegacy = typeof getBootstrapClubById === 'function' && !!getBootstrapClubById(c.clubId);
  const legacyCount = isLegacy
    ? (typeof STUDENT_NAMES !== 'undefined' ? STUDENT_NAMES.length : 0)
    : 0;
  const stats = c.stats;

  let metaHtml = '';
  if (isLegacy) {
    if (stats && (stats.totalMinutes > 0 || stats.totalStories > 0)) {
      const parts = [`👥 ${legacyCount} חברים`];
      if (stats.totalMinutes > 0) parts.push(`📚 ${_fmtNum(stats.totalMinutes)} דקות`);
      if (stats.totalStories > 0) parts.push(`📖 ${stats.totalStories} סיפורים`);
      metaHtml = `<span class="csc-meta">${parts.join(' · ')}</span>`;
    } else if (legacyCount > 0) {
      metaHtml = `<span class="csc-meta">👥 ${legacyCount} חברים</span>`;
    }
  } else {
    // מספר חברים אמיתי — נטען async אחרי render
    metaHtml = `<span class="csc-meta" data-count-club="${c.clubId}">👥 ...</span>`;
  }

  return `
    <button class="club-select-card" onclick="pickClub('${c.clubId}')">
      <span class="csc-emoji">${c.emoji || '📚'}</span>
      <div class="csc-info">
        <span class="csc-name">${c.name || c.clubId}</span>
        ${metaHtml}
      </div>
      <span class="csc-arrow">←</span>
    </button>`;
}

function _renderClubSelect(clubs) {
  const list = document.getElementById('club-select-list');
  if (!list) return;
  list.innerHTML = clubs.map(c => _buildClubCard(c)).join('');
  _enrichClubSelectCounts().catch(() => {});
}

async function _enrichClubSelectCounts() {
  const placeholders = document.querySelectorAll('[data-count-club]');
  for (const el of placeholders) {
    const clubId = el.dataset.countClub;
    try {
      const memberships = typeof fbLoadClubMemberships === 'function'
        ? await fbLoadClubMemberships(clubId) : [];
      const active = memberships.filter(m => m.status !== 'left').length;
      if (el.isConnected) el.textContent = `👥 ${active} חברים`;
    } catch {}
  }
}

// ─── Club Dashboard ───────────────────────────────────────────────────────────

async function showClubDashboard(clubId, userId, profile) {
  _activeClubId      = clubId;
  _pendingUserId     = userId;
  _pendingProfile    = profile;
  window.currentClubId = clubId;   // חשיפה לאנליטיקס ב-script.js

  const localClub = getDeviceClubs().find(c => c.clubId === clubId);
  const isLegacy  = typeof getBootstrapClubById === 'function' && !!getBootstrapClubById(clubId);
  const stats     = localClub?.stats || {};

  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('club-dash-emoji',   localClub?.emoji || '📚');
  set('club-dash-name',    localClub?.name  || '');
  set('club-dash-members', '👥 ...');

  const minutesEl = document.getElementById('club-dash-minutes');
  const storiesEl = document.getElementById('club-dash-stories');
  if (minutesEl) minutesEl.textContent = stats.totalMinutes ? `📚 ${_fmtNum(stats.totalMinutes)} דקות קריאה` : '';
  if (storiesEl) storiesEl.textContent = stats.totalStories ? `📖 ${stats.totalStories} סיפורים` : '';

  const readerRow = document.getElementById('club-dash-reader-row');
  if (readerRow) {
    if (profile?.name) {
      readerRow.textContent = `👤 ${profile.name} קורא/ת עכשיו`;
      readerRow.style.display = '';
    } else {
      readerRow.style.display = 'none';
    }
  }

  _updateClubCount();
  setNavVisible(true);
  setNavTab('clubs');
  showScreen('screen-club-dashboard');
  if (typeof track === 'function') track('club_dashboard_viewed', { clubId });

  // טעינת נתונים אמיתיים ברקע — לא חוסמת את פתיחת המסך
  _enrichClubDashboard(clubId).catch(() => {});
}

/** טוען ומציג נתוני מועדון מ-Firebase */
async function _enrichClubDashboard(clubId) {
  const isLegacy = typeof getBootstrapClubById === 'function' && !!getBootstrapClubById(clubId);

  if (isLegacy) {
    await _loadLegacyStats(clubId);
    const club  = getDeviceClubs().find(c => c.clubId === clubId);
    const stats = club?.stats || {};
    const minutesEl = document.getElementById('club-dash-minutes');
    const storiesEl = document.getElementById('club-dash-stories');
    const membersEl = document.getElementById('club-dash-members');
    if (membersEl) membersEl.textContent = `👥 ${typeof STUDENT_NAMES !== 'undefined' ? STUDENT_NAMES.length : 0} חברים`;
    if (minutesEl) minutesEl.textContent = stats.totalMinutes ? `📚 ${_fmtNum(stats.totalMinutes)} דקות קריאה` : '';
    if (storiesEl) storiesEl.textContent = stats.totalStories ? `📖 ${stats.totalStories} סיפורים` : '';
    return;
  }

  // מועדון חדש — Firebase
  const memberships = typeof fbLoadClubMemberships === 'function'
    ? await fbLoadClubMemberships(clubId) : [];
  const totalMins    = memberships.reduce((s, m) => s + (m.cachedStats?.totalMinutes || 0), 0);
  const totalSession = memberships.reduce((s, m) => s + (m.cachedStats?.totalSessions || 0), 0);

  const membersEl = document.getElementById('club-dash-members');
  const minutesEl = document.getElementById('club-dash-minutes');
  const storiesEl = document.getElementById('club-dash-stories');
  if (membersEl) membersEl.textContent = `👥 ${memberships.length} חברים`;
  if (minutesEl) minutesEl.textContent = totalMins    ? `📚 ${_fmtNum(totalMins)} דקות קריאה` : '';
  if (storiesEl) storiesEl.textContent = totalSession ? `📖 ${totalSession} סשנים` : '';

  // עדכן גם שם ואייקון מועדון מ-Firebase אם לא נטענו מהמכשיר
  const club = typeof fbLoadClub === 'function' ? await fbLoadClub(clubId) : null;
  if (club) {
    const emojiEl = document.getElementById('club-dash-emoji');
    const nameEl  = document.getElementById('club-dash-name');
    if (emojiEl) emojiEl.textContent = club.emoji || '📚';
    if (nameEl)  nameEl.textContent  = club.name  || '';
  }
}

/** מאגד סטטיסטיקות Legacy מ-Firebase ושומר ב-cache יומי */
async function _loadLegacyStats(clubId) {
  const club  = getDeviceClubs().find(c => c.clubId === clubId);
  const today = new Date().toISOString().slice(0, 10);
  if (club?.stats?.cachedAt === today) return;   // cache טרי

  if (!window.db) return;
  try {
    const snap = await window.db
      .collection('classes').doc('mitarim-aleph-2025')
      .collection('students').get();

    let totalMinutes = 0, totalStories = 0;
    snap.forEach(doc => {
      const d = doc.data();
      totalMinutes += d.totalMinutes || 0;
      totalStories += d.storiesRead  || 0;
    });

    updateDeviceClubStats(clubId, { totalMinutes, totalStories, cachedAt: today });
  } catch (e) {
    console.warn('[routing] _loadLegacyStats:', e.message);
  }
}

/** כפתור "כניסה לקריאה" בדשבורד */
function enterReadingFromDashboard() {
  if (_pendingUserId && _pendingProfile) {
    _enterPersonalHome(_pendingUserId, _pendingProfile);
  } else {
    // אין משתמש מזוהה — חזור לבחירת קורא עבור המועדון הנוכחי
    showWhoReads(_activeClubId);
  }
}

// ─── Profile Picker ───────────────────────────────────────────────────────────

/**
 * showWhoReads(clubId?)
 * מציג חברי מועדון — Firebase הוא מקור האמת.
 * מציג מסך מיד עם ספינר, טוען מ-Firebase ברקע.
 */
async function showWhoReads(clubId) {
  _activeClubId = clubId || _activeClubId || null;
  let effectiveClubId = _activeClubId;

  // אם אין clubId מפורש — זהה מועדוני המכשיר
  if (!effectiveClubId) {
    const deviceClubs = getDeviceClubs();
    const nonLegacy = deviceClubs.filter(c =>
      !(typeof getBootstrapClubById === 'function' && getBootstrapClubById(c.clubId))
    );
    if (nonLegacy.length >= 1) {
      effectiveClubId = nonLegacy[0].clubId;
      _activeClubId   = effectiveClubId;
    }
  }

  const subEl = document.getElementById('who-reads-club-name');
  const h2El  = document.querySelector('.who-reads-title');
  const grid  = document.getElementById('who-reads-grid');

  // הצג מסך מיד — תוכן יעודכן כשהנתונים יגיעו
  if (h2El)  h2El.textContent  = '📖 מי קורא עכשיו?';
  if (subEl) subEl.textContent = '';
  if (grid)  grid.innerHTML    = '<div style="text-align:center;padding:2rem;font-size:2rem">⏳</div>';
  _updateClubCount();
  setNavVisible(true);
  setNavTab('reader');
  showScreen('screen-who-reads');

  if (!effectiveClubId) {
    _renderAllProfiles();
    return;
  }

  const isLegacy = typeof getBootstrapClubById === 'function' && !!getBootstrapClubById(effectiveClubId);

  if (isLegacy) {
    const club = getDeviceClubs().find(c => c.clubId === effectiveClubId);
    if (h2El) h2El.textContent = (club?.emoji || '🌳') + ' ' + (club?.name || '');
    if (grid) _renderLegacyProfiles(grid);
    return;
  }

  // מועדון חדש — Firebase
  const [club, memberships] = await Promise.all([
    typeof fbLoadClub === 'function' ? fbLoadClub(effectiveClubId) : Promise.resolve(null),
    typeof fbLoadClubMemberships === 'function' ? fbLoadClubMemberships(effectiveClubId) : Promise.resolve([]),
  ]);

  if (h2El) h2El.textContent = (club?.emoji || '📚') + ' ' + (club?.name || '');
  if (grid) _renderFirebaseMemberGrid(grid, memberships, effectiveClubId);
}

/** Firebase members — מועדונים חדשים */
function _renderFirebaseMemberGrid(grid, memberships, clubId) {
  const active = memberships.filter(m => m.status !== 'left');
  if (!active.length) {
    grid.innerHTML = `<div class="who-reads-empty"><p>עוד אין קוראים במועדון</p></div>`;
    return;
  }
  grid.innerHTML = active.map(m => `
    <button class="profile-card" onclick="selectProfile('${m.userId}', '${clubId}')">
      <span class="profile-avatar">${m.emoji || '📚'}</span>
      <span class="profile-name">${m.name || m.userId}</span>
    </button>`).join('');
}

/** Legacy fallback — כל המועדונים מהמכשיר */
function _renderAllProfiles() {
  const grid = document.getElementById('who-reads-grid');
  if (!grid) return;

  const clubs = getDeviceClubs();
  if (!clubs.length) { grid.innerHTML = ''; return; }

  const hasLegacy = clubs.some(c =>
    typeof getBootstrapClubById === 'function' && !!getBootstrapClubById(c.clubId)
  );
  if (hasLegacy) { _renderLegacyProfiles(grid); return; }

  grid.innerHTML = `<div class="who-reads-empty"><p>עוד אין קוראים במועדון</p></div>`;
}

function _renderLegacyProfiles(grid) {
  if (typeof STUDENT_NAMES === 'undefined') { grid.innerHTML = ''; return; }
  grid.innerHTML = STUDENT_NAMES.map((name, i) => {
    const s = (typeof loadStudentLocal === 'function') ? loadStudentLocal(i) : {};
    return `
      <button class="profile-card" onclick="selectLegacyProfile(${i})">
        <span class="profile-avatar">${typeof STUDENT_EMOJIS !== 'undefined' ? STUDENT_EMOJIS[i] : '📚'}</span>
        <span class="profile-name">${name}</span>
        ${s.points > 0 ? `<span class="profile-pts">${s.points}נק׳</span>` : ''}
      </button>`;
  }).join('');
}

/**
 * Legacy Bridge — פרופיל סינטטי מ-index
 * שאר הקוד אינו מודע שמדובר ב-Legacy.
 */
function selectLegacyProfile(index) {
  const name  = typeof STUDENT_NAMES  !== 'undefined' ? STUDENT_NAMES[index]  : String(index);
  const emoji = typeof STUDENT_EMOJIS !== 'undefined' ? STUDENT_EMOJIS[index] : '📚';
  const syntheticProfile = {
    userId:              `legacy_${index}`,
    name,
    emoji,
    onboardingComplete:  true,
    _legacyIndex:        index,   // Bridge marker — פנימי בלבד
  };
  // ישירות לקריאה — ללא דשבורד
  _activeClubId        = 'mitarim-aleph-2025';
  window.currentClubId = 'mitarim-aleph-2025';
  _enterPersonalHome(`legacy_${index}`, syntheticProfile);
}

async function selectProfile(userId, clubIdHint) {
  const profile = typeof fbLoadUserProfile === 'function'
    ? await fbLoadUserProfile(userId) : null;

  const targetClubId = clubIdHint || null;

  // יש פרופיל Firebase תקין — כנס ישירות
  if (profile?.onboardingComplete && targetClubId) {
    _activeClubId        = targetClubId;
    window.currentClubId = targetClubId;
    _enterPersonalHome(userId, profile);
    return;
  }

  // פרופיל חסר / לא שלם — שחזר מ-Firebase membership
  if (targetClubId) {
    const membership = typeof fbLoadClubMembership === 'function'
      ? await fbLoadClubMembership(targetClubId, userId) : null;
    if (membership) {
      _activeClubId        = targetClubId;
      window.currentClubId = targetClubId;
      _enterPersonalHome(userId, { name: membership.name || userId, emoji: membership.emoji || '📚' });
      return;
    }
  }

  // אין נתונים כלל — שלח לאונבורדינג
  if (typeof startOnboarding === 'function') {
    startOnboarding(userId, profile?.name || userId, targetClubId);
  }
}

function _enterPersonalHome(userId, profile) {
  // Legacy Bridge: אם profile._legacyIndex קיים — העבר לנתיב ה-Legacy
  if (profile?._legacyIndex !== undefined) {
    if (typeof selectStudent === 'function') selectStudent(profile._legacyIndex);
    if (typeof analyticsUserActive === 'function') analyticsUserActive(userId, _activeClubId);
    return;
  }

  // Personalization wizard — מוצג אחרי onboarding, פעם אחת בלבד
  if (profile?.onboardingComplete && !profile?.personalizationComplete) {
    if (typeof showProfileWizard === 'function') {
      showProfileWizard(userId, _activeClubId || null, profile);
      return;
    }
  }

  // שמור פרסונליזציה גלובלית לשימוש ב-"במיוחד בשבילך"
  window._studentPersonalization = profile?.personalizationComplete ? profile : null;

  if (typeof analyticsUserActive === 'function') analyticsUserActive(userId, _activeClubId);
  setNavVisible(true);
  setNavTab('');

  // טוען נתוני קריאה צבורים מ-localStorage (סינכרוני, מהיר)
  const saved = typeof loadStudentLocal === 'function' ? loadStudentLocal(userId) : null;
  const studentData = (saved && saved.id === userId && saved.totalMinutes >= 0)
    ? { ...saved, history: Array.isArray(saved.history) ? saved.history : [], name: profile.name || saved.name || userId, emoji: profile.emoji || '📚' }
    : {
        id:           userId,
        name:         profile.name  || userId,
        emoji:        profile.emoji || '📚',
        totalMinutes: 0,
        appMinutes:   0,
        bookMinutes:  0,
        points:       0,
        storiesRead:  0,
        history:      [],
      };

  // Bridge: מאתחל currentStudentId ו-currentStudentData ב-script.js
  if (typeof window.initCurrentStudent === 'function') {
    window.initCurrentStudent(userId, studentData);
  }
  window.currentStudentData = studentData;
  const nameEl  = document.getElementById('current-student-name');
  const emojiEl = document.getElementById('greeting-avatar');
  if (nameEl)  nameEl.textContent  = studentData.name  || userId;
  if (emojiEl) emojiEl.textContent = studentData.emoji || '📚';
  setActiveReader({ userId, clubId: _activeClubId, name: studentData.name, emoji: studentData.emoji });
  showScreen('screen-main');
}

// ─── ניווט גלובלי ─────────────────────────────────────────────────────────────

/** 📖 מי קורא עכשיו? — מסך בחירת קורא למועדון הפעיל */
function goWhoReads() {
  const clubId = _activeClubId
    || (typeof getActiveReader === 'function' ? getActiveReader()?.clubId : null);
  if (!clubId && !hasDeviceClubs()) return;
  showWhoReads(clubId);
}

/** החלף קורא */
function switchReader() {
  setNavVisible(false);
  routeOnLoad();
}

function goBackFromJoin() {
  if (hasDeviceClubs()) routeOnLoad(); else showScreen('screen-splash');
}

// ─── כלי פיתוח (קונסול) ──────────────────────────────────────────────────────

/** window.resetBookiDevice() — מנקה localStorage ומחזיר ל-screen-splash */
window.resetBookiDevice = function() {
  localStorage.removeItem(_DEVICE_KEY);
  localStorage.removeItem(_ACTIVE_READER_KEY);
  localStorage.removeItem('booki_tmp_uid');
  localStorage.removeItem('booki_migrated_fb_v2');
  console.log('[booki] ✅ resetBookiDevice — המכשיר אופס. מחזיר ל-splash...');
  showScreen('screen-splash');
};

// ─── Bridge: כניסה ישירה למסך ראשי לאחר הצטרפות ──────────────────────────────

window.enterPersonalHomeAfterJoin = function(userId, name, clubId) {
  _activeClubId        = clubId;
  window.currentClubId = clubId;
  _enterPersonalHome(userId, { name, emoji: '📚' });
};

// ─── Teacher Dashboard ────────────────────────────────────────────────────────

async function showTeacherDashboard(teacher) {
  const t = teacher || (typeof getCurrentTeacher === 'function' ? getCurrentTeacher() : null);
  if (!t) {
    if (typeof showTeacherAuth === 'function') showTeacherAuth('login');
    else showScreen('screen-teacher-auth');
    return;
  }
  window._currentTeacher = t;

  // טוען role מ-Firestore — owner מנותב לדשבורד שלו
  if (typeof fbLoadUser === 'function') {
    const userDoc = await fbLoadUser(t.uid);
    if (userDoc?.role === 'owner') {
      if (typeof showOwnerDashboard === 'function') showOwnerDashboard({ ...t, role: 'owner' });
      return;
    }
  }

  const nameEl = document.getElementById('td-teacher-name');
  if (nameEl) nameEl.textContent = t.name || t.email;
  setNavVisible(false);
  showScreen('screen-teacher-dashboard');
  _renderTeacherClubs(t.uid);
}

async function _renderTeacherClubs(uid) {
  const list = document.getElementById('td-clubs-list');
  if (!list) return;
  list.innerHTML = '<p class="td-loading">טוען מועדונים...</p>';
  const clubs = (typeof fbLoadTeacherClubs === 'function') ? await fbLoadTeacherClubs(uid) : [];
  if (!clubs.length) {
    list.innerHTML = `
      <div class="td-empty">
        <p>עדיין לא יצרת מועדון קריאה</p>
        <button class="btn-giant btn-green" onclick="showCreateClub()">🌳 צור מועדון ראשון</button>
      </div>`;
    return;
  }
  list.innerHTML = clubs.map(c => `
    <div class="teacher-club-card">
      <span class="tc-emoji">${c.emoji || '📚'}</span>
      <div class="tc-info">
        <span class="tc-name">${c.name || c.id}</span>
        <span class="tc-meta" data-member-count="${c.id}">👥 ...</span>
      </div>
      <div class="tc-actions">
        <button class="btn-small btn-green" onclick="enterTeacherClub('${c.id}')">כנסי ←</button>
        <button class="btn-small" style="background:#dc3545;color:#fff" onclick="confirmDeleteClub('${c.id}','${(c.name || c.id).replace(/'/g, "\\'")}')">מחק</button>
      </div>
    </div>`).join('');

  // מונה חברים אמיתי — Firebase
  clubs.forEach(async c => {
    try {
      const memberships = typeof fbLoadClubMemberships === 'function'
        ? await fbLoadClubMemberships(c.id) : [];
      const active = memberships.filter(m => m.status !== 'left').length;
      const el = list.querySelector(`[data-member-count="${c.id}"]`);
      if (el) el.textContent = `👥 ${active} חברים`;
    } catch {}
  });
}

async function confirmDeleteClub(clubId, clubName) {
  if (!confirm(`למחוק את "${clubName}" ואת כל נתוניו לצמיתות?\nפעולה זו אינה הפיכה.`)) return;
  const t = window._currentTeacher;
  if (!t) return;

  const allBtns = document.querySelectorAll(`[onclick*="confirmDeleteClub('${clubId}'"]`);
  allBtns.forEach(b => { b.disabled = true; b.textContent = 'מוחק...'; });

  const ok = typeof fbDeleteClub === 'function' ? await fbDeleteClub(clubId) : false;
  if (ok) {
    removeDeviceClub(clubId);
    _renderTeacherClubs(t.uid);
  } else {
    alert('שגיאה במחיקה — נסה שוב');
    allBtns.forEach(b => { b.disabled = false; b.textContent = 'מחק'; });
  }
}

function enterTeacherClub(clubId) {
  _activeClubId        = clubId;
  window.currentClubId = clubId;
  if (typeof showWhoReads === 'function') showWhoReads(clubId);
}

function goToTeacherArea() {
  const t = typeof getCurrentTeacher === 'function' ? getCurrentTeacher() : null;
  if (t) showTeacherDashboard(t);
  else if (typeof showTeacherAuth === 'function') showTeacherAuth('login');
  else showScreen('screen-teacher-auth');
}

// ─── חשיפה גלובלית ───────────────────────────────────────────────────────────

Object.assign(window, {
  // Active Reader
  getActiveReader, setActiveReader, clearActiveReader,
  // Device state
  getDeviceClubs, addDeviceClub, removeDeviceClub, addDeviceMember, updateDeviceClubStats,
  hasDeviceClubs, getClubsForUser,
  // Routing
  routeOnLoad, showWhoReads, showClubDashboard, enterReadingFromDashboard,
  // Profile selection
  selectProfile, selectLegacyProfile,
  // Club selection
  goClubs, pickClub,
  // Nav
  setNavVisible, setNavTab, goHome, goWhoReads, switchReader, goBackFromJoin,
  startReading,
  // Teacher
  showTeacherDashboard, enterTeacherClub, goToTeacherArea, confirmDeleteClub,
});
