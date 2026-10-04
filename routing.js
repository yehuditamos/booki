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

let _activeClubId            = null;
let _clubSelectMode          = 'device'; // 'device' | 'user'
let _pendingUserId           = null;
let _pendingProfile          = null;
let _pendingHighlightUserId  = null;

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
      userId:           reader.userId,
      clubId:           reader.clubId || _activeClubId || null,
      name:             reader.name   || '',
      emoji:            reader.emoji  || '📚',
      createdByTeacher: reader.createdByTeacher || false,
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

async function routeOnLoad() {
  if (typeof track === 'function') track('app_open');
  setNavVisible(false);

  const routeParams = new URLSearchParams(window.location.search);

  // An explicit management URL must never fall through to a stored/class route.
  // Generated class links contain only club/join; mixed legacy URLs are normalized.
  if (routeParams.get('teacher') === '1') {
    _activeClubId = null;
    window.currentClubId = null;
    goToTeacherArea(true);
    return;
  }
  const clubParam = routeParams.get('club');
  if (clubParam && typeof showJoinClubDirect === 'function') {
    clearActiveReader();
    showJoinClubDirect(clubParam);
    return;
  }
  const joinCode = routeParams.get('join');
  if (joinCode && typeof showJoinClubWithCode === 'function') {
    showJoinClubWithCode(joinCode);
    return;
  }

  // מסך ברוכים הבאים — פעם אחת לכל דפדפן
  if (!localStorage.getItem('booki_welcome_shown')) {
    showScreen('screen-welcome');
    return;
  }

  // קורא שמור — חזרה ישירה למסך הבית
  const reader = getActiveReader();
  if (reader?.userId) {
    _activeClubId        = reader.clubId || null;
    window.currentClubId = reader.clubId || null;

    // Firebase Auth הוא Source of Truth לזהות — לא localStorage.
    // ממתינים לו לפני כניסה, כדי ש-currentStudentId ≡ firebase.auth().currentUser.uid.
    const authUid = typeof ensureStudentAuth === 'function'
      ? await ensureStudentAuth()
      : null;

    // אם המשתמש המחובר הוא מורה (non-anonymous) — אין לדרוס את userId השמור ב-reader.
    // ensureStudentAuth מחזירה UID מורה כשהיא מחוברת, וזה לא UID של תלמיד.
    const _fbUserAfterAuth = (typeof firebase !== 'undefined' && firebase.auth)
      ? firebase.auth().currentUser : null;
    const _authUidIsTeacher = !!(authUid && _fbUserAfterAuth && !_fbUserAfterAuth.isAnonymous);

    // כרטיס שנוצר ע"י מורה — ה-cardId הוא המזהה היציב, לא Firebase Auth UID
    const isPreCreated = reader.createdByTeacher === true;
    const userId = isPreCreated
      ? reader.userId
      : (_authUidIsTeacher ? reader.userId : (authUid || reader.userId));

    if (!isPreCreated && !_authUidIsTeacher && authUid && authUid !== reader.userId) {
      // ה-session שוחזר/נוצר עם UID שונה מהשמור — מסנכרנים את localStorage
      setActiveReader({ ...reader, userId: authUid });
      localStorage.setItem('booki_tmp_uid', authUid);
    }

    _enterPersonalHome(userId, isPreCreated ? { ...reader, personalizationComplete: true } : reader);
    return;
  }

  // אין קורא שמור ואין קישור מועדון — השורש שייך לזרימת המורה החדשה.
  // מסך ה-splash הישן הוצא משימוש ואסור להציגו כ-fallback.
  goToTeacherArea(false);
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
  if (!deviceClubs.length) { goToTeacherArea(); return; }
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
  else routeOnLoad();
}

function _updateSplashForRole() {
  const btn = document.getElementById('splash-btn-create');
  if (!btn) return;
  const isTeacher = typeof getCurrentTeacher === 'function' && !!getCurrentTeacher();
  const isStudent = !!getActiveReader();
  btn.style.display = (isStudent && !isTeacher) ? 'none' : '';
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

/** חזרה מ-screen-club-select: לעמוד הסטודנט אם כבר ב-device mode, אחרת ל-who-reads */
function goBackFromClubSelect() {
  if (_clubSelectMode === 'user') {
    showScreen('screen-who-reads');
  } else {
    showScreen('screen-main');
  }
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
      const av = profile.avatar || profile.emoji || '📚';
      readerRow.textContent = `${av} ${profile.name} קורא/ת עכשיו`;
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
  // לפני בחירת ילד אין זהות פעילה, ולכן אין להציג ניווט אישי
  // ("הכרטיס שלי" / "בית") שעלול להפנות לילד שנבחר קודם במכשיר.
  setNavVisible(false);
  showScreen('screen-who-reads');

  if (!effectiveClubId) {
    // אין מועדון מזוהה — לא חוזרים למסך הפתיחה הישן.
    routeOnLoad();
    return;
  }

  const isLegacy = typeof getBootstrapClubById === 'function' && !!getBootstrapClubById(effectiveClubId);

  if (isLegacy) {
    const bootstrapDef = getBootstrapClubById(effectiveClubId);
    if (bootstrapDef?.hidden) { _showHiddenClubMessage(); return; }
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

  if (club?.hidden) { _showHiddenClubMessage(); return; }

  if (h2El) h2El.textContent = (club?.emoji || '📚') + ' ' + (club?.name || '');
  if (grid) _renderFirebaseMemberGrid(grid, memberships, effectiveClubId);
}

/** מועדון מוסתר — מציג הודעה במקום רשימת החברים */
function _showHiddenClubMessage() {
  const h2El   = document.querySelector('.who-reads-title');
  const subEl  = document.getElementById('who-reads-club-name');
  const grid   = document.getElementById('who-reads-grid');
  const footer = document.querySelector('#screen-who-reads .who-reads-footer');
  if (h2El)   h2El.textContent = '⚠️ מועדון לא פעיל';
  if (subEl)  subEl.textContent = '';
  if (grid)   grid.innerHTML   = `<div class="who-reads-hidden">
    <p>המועדון הזה כבר לא פעיל.</p>
    <p>בקשו מהמורה את הקישור החדש.</p>
  </div>`;
  if (footer) footer.innerHTML = '';
}

/** Firebase members — מועדונים חדשים */
function _renderFirebaseMemberGrid(grid, memberships, clubId) {
  // במסך כניסה ממועדון יש פעולה אחת בלבד: בחירת השם.
  const footer = document.querySelector('#screen-who-reads .who-reads-footer');
  if (footer) footer.innerHTML = `
    <label class="who-reads-search-label" for="who-reads-search">🔎 חיפוש השם שלי</label>
    <input id="who-reads-search" class="who-reads-search" type="search"
      placeholder="כתבו כאן את השם" autocomplete="off" inputmode="search"
      oninput="filterWhoReadsNames(this.value)">
    <p id="who-reads-no-match" class="who-reads-not-found" hidden>השם לא נמצא. בקשו מהמורה להוסיף אתכם למועדון.</p>`;

  const active = memberships.filter(m => m.status !== 'left');
  if (!active.length) {
    grid.innerHTML = `<div class="who-reads-empty"><p>עוד אין קוראים במועדון</p></div>`;
    return;
  }
  grid.innerHTML = active.map(m => `
    <button class="profile-card" data-user-id="${_readerEsc(m.userId)}" data-club-id="${_readerEsc(clubId)}" data-reader-name="${_readerEsc(m.name || m.userId)}" onclick="requestReaderIdentity(this)">
      ${_avatarHtml(m.emoji || m.avatar || '📚', 'profile-avatar')}
      <span class="profile-name">${_readerEsc(m.name || m.userId)}</span>
    </button>`).join('');
}

function _readerEsc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let _pendingReaderIdentity = null;
let _readerConfirmReturnFocus = null;

/** מבקש אישור לפני טעינת פרופיל — משמש גם בכניסה הראשונה וגם בהחלפת קורא. */
function requestReaderIdentity(card) {
  if (!card) return;
  const name = String(card.dataset.readerName || '').trim();
  const legacyIndex = card.dataset.legacyIndex;
  _pendingReaderIdentity = legacyIndex !== undefined
    ? { kind: 'legacy', index: Number(legacyIndex) }
    : { kind: 'firebase', userId: card.dataset.userId, clubId: card.dataset.clubId };
  _readerConfirmReturnFocus = card;

  const overlay = document.getElementById('reader-confirm-overlay');
  const title = document.getElementById('reader-confirm-title');
  const avatar = document.getElementById('reader-confirm-avatar');
  if (!overlay || !title || !avatar) return;
  title.textContent = `${name}, זה הכרטיס שלך?`;
  avatar.replaceChildren();
  const sourceAvatar = card.querySelector('.profile-avatar');
  if (sourceAvatar) avatar.appendChild(sourceAvatar.cloneNode(true));
  else avatar.textContent = '📚';
  overlay.style.display = 'flex';
  document.body.classList.add('reader-confirm-open');
  setTimeout(() => document.getElementById('reader-confirm-yes')?.focus(), 0);
}

async function confirmReaderIdentity() {
  const pending = _pendingReaderIdentity;
  if (!pending) return;
  const yes = document.getElementById('reader-confirm-yes');
  if (yes) yes.disabled = true;
  _closeReaderIdentityDialog(false);
  try {
    if (pending.kind === 'legacy') selectLegacyProfile(pending.index);
    else await selectProfile(pending.userId, pending.clubId);
  } finally {
    if (yes) yes.disabled = false;
  }
}

function cancelReaderIdentity() {
  _closeReaderIdentityDialog(true);
}

function _closeReaderIdentityDialog(restoreFocus) {
  const overlay = document.getElementById('reader-confirm-overlay');
  if (overlay) overlay.style.display = 'none';
  document.body.classList.remove('reader-confirm-open');
  _pendingReaderIdentity = null;
  if (restoreFocus && _readerConfirmReturnFocus?.isConnected) _readerConfirmReturnFocus.focus();
  _readerConfirmReturnFocus = null;
}

function filterWhoReadsNames(query) {
  const normalized = String(query || '').trim().toLocaleLowerCase('he');
  const cards = Array.from(document.querySelectorAll('#who-reads-grid .profile-card'));
  let visible = 0;
  cards.forEach(card => {
    const name = String(card.dataset.readerName || card.textContent || '').toLocaleLowerCase('he');
    const match = !normalized || name.includes(normalized);
    card.hidden = !match;
    if (match) visible += 1;
  });
  const noMatch = document.getElementById('who-reads-no-match');
  if (noMatch) noMatch.hidden = !normalized || visible > 0;
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
      <button class="profile-card" data-legacy-index="${i}" data-reader-name="${_readerEsc(name)}" onclick="requestReaderIdentity(this)">
        <span class="profile-avatar">${typeof STUDENT_EMOJIS !== 'undefined' ? STUDENT_EMOJIS[i] : '📚'}</span>
        <span class="profile-name">${_readerEsc(name)}</span>
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

function _bookiPinHash(pin,salt){
  // Client-side verifier: the PIN itself is never stored. This protects normal
  // shared-device entry; it is not a substitute for server authentication.
  let h=2166136261;const v=String(salt||'booki')+':'+String(pin);
  for(let round=0;round<1200;round++)for(let i=0;i<v.length;i++){h^=v.charCodeAt(i)+(round&255);h=Math.imul(h,16777619);}
  return (h>>>0).toString(36);
}
function _bookiAskPin(name){
 return new Promise(resolve=>{
  document.getElementById('booki-pin-gate')?.remove();
  const o=document.createElement('div');o.id='booki-pin-gate';o.style.cssText='position:fixed;inset:0;z-index:2147483000;background:rgba(25,42,34,.55);display:flex;align-items:center;justify-content:center;padding:18px';
  const b=document.createElement('div');b.style.cssText='width:min(360px,100%);background:#fffdf7;border-radius:24px;padding:24px;text-align:center;box-sizing:border-box';
  b.innerHTML='<h2 style="margin:0 0 8px">🔒 הכרטיס של '+String(name||'')+'</h2><p>הקלידו את 4 הספרות</p><input id="booki-pin-entry" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" style="font-size:28px;letter-spacing:12px;text-align:center;width:180px;padding:10px;border:2px solid #bdd2c3;border-radius:14px"><p id="booki-pin-error" style="color:#a33;min-height:20px"></p><button type="button" id="booki-pin-forgot" style="display:block;margin:10px auto;border:0;background:transparent;color:#456b58;text-decoration:underline">שכחתי את הקוד 😕</button>';
  const ok=document.createElement('button');ok.textContent='כניסה';ok.style.cssText='padding:12px 28px;border:0;border-radius:14px;background:#2d7957;color:white;font-weight:800';
  const cancel=document.createElement('button');cancel.textContent='ביטול';cancel.style.cssText='margin-right:8px;padding:12px 20px;border:0;background:transparent';
  b.append(ok,cancel);o.append(b);document.body.append(o);const input=b.querySelector('#booki-pin-entry');const forgot=b.querySelector('#booki-pin-forgot');if(forgot)forgot.onclick=()=>{b.querySelector('#booki-pin-error').textContent='לא נורא 💛 בקשו מהמורה לאפס לכם את הקוד.';};setTimeout(()=>input.focus(),50);
  const done=v=>{o.remove();resolve(v)};ok.onclick=()=>done(input.value);cancel.onclick=()=>done(null);input.onkeydown=e=>{if(e.key==='Enter')ok.click();};
 });
}
function _bookiOfferPin(name){
 return new Promise(resolve=>{
  document.getElementById('booki-pin-offer')?.remove();
  const o=document.createElement('div');o.id='booki-pin-offer';o.style.cssText='position:fixed;inset:0;z-index:2147483000;background:rgba(25,42,34,.55);display:flex;align-items:center;justify-content:center;padding:18px';
  const b=document.createElement('div');b.style.cssText='width:min(380px,100%);background:#fffdf7;border-radius:24px;padding:26px 20px;text-align:center;box-sizing:border-box';
  const h=document.createElement('h2');h.textContent=(name||'')+', זה הכרטיס שלך? 👋';const p=document.createElement('p');p.textContent='אפשר לשמור עליו עם קוד סודי של 4 ספרות 🔒';
  const yes=document.createElement('button');yes.textContent='כן, אני רוצה קוד';yes.style.cssText='display:block;width:100%;padding:13px;border:0;border-radius:14px;background:#2d7957;color:#fff;font-weight:800;margin:16px 0 8px';
  const no=document.createElement('button');no.textContent='להיכנס בלי קוד';no.style.cssText='display:block;width:100%;padding:12px;border:1px solid #cbd9ce;border-radius:14px;background:#fff;color:#315f4b;font-weight:700';
  b.append(h,p,yes,no);o.append(b);document.body.append(o);const done=v=>{o.remove();resolve(v)};yes.onclick=()=>done(true);no.onclick=()=>done(false);
 });
}
async function _bookiCreatePinForCard(clubId,userId){
 const first=prompt('בחרו קוד של 4 ספרות בלבד');if(first===null)return false;if(!/^\d{4}$/.test(first)){alert('הקוד צריך להכיל בדיוק 4 ספרות.');return _bookiCreatePinForCard(clubId,userId);}
 const second=prompt('הקלידו שוב את הקוד');if(second!==first){alert('הקודים לא זהים. נסו שוב.');return _bookiCreatePinForCard(clubId,userId);}
 const salt=String(userId)+'-'+Date.now().toString(36),hash=_bookiPinHash(first,salt);
 try{await window.db.collection('clubs').doc(clubId).collection('memberships').doc(String(userId)).update({pinHash:hash,pinSalt:salt,pinOfferSeen:true,updatedAt:new Date().toISOString()});return true;}catch(e){console.warn('[booki] pin create',e.code||e.message);alert('לא הצלחנו לשמור את הקוד. אפשר להיכנס בלי קוד ולנסות שוב אחר כך.');return false;}
}
async function selectProfile(userId, clubIdHint) {
  const targetClubId = clubIdHint || null;

  // טוען פרופיל + membership במקביל — membership נדרש לזיהוי createdByTeacher
  const [profile, membership] = await Promise.all([
    typeof fbLoadUserProfile   === 'function' ? fbLoadUserProfile(userId)                        : Promise.resolve(null),
    targetClubId && typeof fbLoadClubMembership === 'function'
      ? fbLoadClubMembership(targetClubId, userId) : Promise.resolve(null),
  ]);


  // ── כרטיסי תלמיד שנוצרו ע"י מורה ────────────────────────────────────────
  if (membership?.createdByTeacher) {
    // מורה מחוברת (non-anonymous) — אין לקרוא ensureStudentAuth כי היא מחזירה UID מורה.
    // הפרדה: תלמידים בלבד מקבלים anonymous UID; מורה צופה בכרטיס ישירות.
    const currentUser = (typeof firebase !== 'undefined' && firebase.auth)
      ? firebase.auth().currentUser : null;
    const isTeacherSession = !!(currentUser && !currentUser.isAnonymous);

    if (!isTeacherSession) {
      await (typeof ensureStudentAuth === 'function' ? ensureStudentAuth() : Promise.resolve());
    }

    // Emergency compatibility entry, awaiting matching production rules.
    // Name selection is not identity verification; this is a pilot tradeoff.
    if (!isTeacherSession) {
      const reader = typeof firebase !== 'undefined' && firebase.auth
        ? firebase.auth().currentUser : null;
      if (!reader || reader.uid !== membership.claimedByUid) {
        const entered = reader && typeof fbReclaimCard === 'function'
          ? await fbReclaimCard(targetClubId, userId) : false;
        if (!entered) {
          alert('לא הצלחנו לפתוח את הכרטיס. נסו שוב בעוד רגע.');
          return;
        }
        membership.claimedByUid = reader.uid;
      }
    }

    _activeClubId        = targetClubId;
    window.currentClubId = targetClubId;

    // Personalization follows an acknowledged card binding.
    if (!membership.personalized && !isTeacherSession) {
      showMiniPersonalization(userId, targetClubId, membership.name || userId);
      return;
    }

    _enterPersonalHome(userId, {
      name:                    membership.name  || userId,
      emoji:                   membership.emoji || '📚',
      personalizationComplete: true,
      createdByTeacher:        true,
    });
    return;
  }

  // ── תלמיד רגיל (self-joined: מזהה ה-membership שווה ל-auth.uid מרגע ההצטרפות) ─────
  // Sprint 11 — פער אמיתי שנמצא: הענף הזה, בניגוד לענף "כרטיס שנוצר ע"י מורה" ממש
  // מעליו, מעולם לא קרא ל-ensureStudentAuth() — כך שאם ה-session האנונימי המקורי אבד
  // (איפוס דפדפן/מצב פרטי/IndexedDB שלא שרד), הקוד ממשיך ישר ל-_enterPersonalHome
  // בלי לוודא כלל שיש session תקין. מוסיפים את הבדיקה, ומתעדים אי-התאמה אם עדיין קיימת —
  // תלמיד/ה רגיל/ה, בניגוד לכרטיס שנוצר ע"י מורה, אין להם מנגנון claimedByUid להתאושש
  // דרכו; זו הנקודה המדויקת שבה session שאבד לצמיתות היה נראה תקין עד לכתיבה הראשונה.
  if (profile?.onboardingComplete && targetClubId) {
    if (typeof ensureStudentAuth === 'function') { try { await ensureStudentAuth(); } catch (e) {} }
    const _authUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    if (_authUser && _authUser.uid !== userId) {
      console.error('[SELECT PROFILE IDENTITY MISMATCH]', {
        expected: userId, received: _authUser.uid,
        comparison: `membership/profile userId (${userId}) vs live firebase.auth().currentUser.uid (${_authUser.uid}) after ensureStudentAuth()`,
        sourceOfExpected: 'profile.userId — the self-joined membership doc id, set at original join time',
        sourceOfReceived: 'firebase.auth().currentUser.uid — right after ensureStudentAuth()',
        note: 'self-joined students have no claimedByUid recovery path (unlike teacher-created cards) — a genuinely lost anonymous session cannot be reconciled client-side without a rules change.',
      });
    }
    _activeClubId        = targetClubId;
    window.currentClubId = targetClubId;
    _enterPersonalHome(userId, profile);
    return;
  }

  // פרופיל חסר / לא שלם — שחזר מ-membership (כבר טעון)
  if (membership) {
    _activeClubId        = targetClubId;
    window.currentClubId = targetClubId;
    _enterPersonalHome(userId, { name: membership.name || userId, emoji: membership.emoji || '📚' });
    return;
  }

  // אין נתונים כלל — שלח לאונבורדינג
  if (typeof startOnboarding === 'function') {
    startOnboarding(userId, profile?.name || userId, targetClubId);
  }
}

async function _enterPersonalHome(userId, profile) {
  const libraryEntry = window._privateLibraryHomeRequest = (window._privateLibraryHomeRequest || 0) + 1;
  if (window.BookiPrivateLibrary) await window.BookiPrivateLibrary.prepare(_activeClubId, userId);
  if (libraryEntry !== window._privateLibraryHomeRequest) return;
  // לאחר שהילד בחר את שמו, הקישור מילא את תפקידו. מנקים את פרמטר המועדון
  // כדי שרענון הבא יחזיר לאותו ילד ולא ידרוש בחירה מחדש.
  const entryParams = new URLSearchParams(window.location.search);
  if (entryParams.has('club') && window.history?.replaceState) {
    window.history.replaceState(null, '', window.location.pathname);
  }

  // Legacy Bridge: אם profile._legacyIndex קיים — העבר לנתיב ה-Legacy
  if (profile?._legacyIndex !== undefined) {
    if (typeof selectStudent === 'function') selectStudent(profile._legacyIndex);
    if (typeof analyticsUserActive === 'function') analyticsUserActive(userId, _activeClubId);
    return;
  }

  // Personalization wizard — מוצג לכל מי שלא השלים פרסונליזציה (כולל משתמשים חדשים)
  if (!profile?.personalizationComplete) {
    if (typeof showProfileWizard === 'function') {
      showProfileWizard(userId, _activeClubId || null, profile);
      return;
    }
  }

  // שמור פרסונליזציה גלובלית לשימוש ב-"במיוחד בשבילך"
  window._studentPersonalization = profile?.personalizationComplete ? profile : null;

  if (typeof analyticsUserActive === 'function') analyticsUserActive(userId, _activeClubId);
  setNavVisible(true);
  setNavTab('home');
  _ensureHomeHeroStage();

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
  if (nameEl)  nameEl.textContent = studentData.name || userId;
  if (emojiEl) {
    _setAvatarEl(emojiEl, studentData.emoji || '📚');
    emojiEl.style.cursor = 'pointer';
    emojiEl.title        = 'שנה אווטאר';
    emojiEl.onclick      = changeStudentAvatar;
  }
  setActiveReader({ userId, clubId: _activeClubId, name: studentData.name, emoji: studentData.emoji, createdByTeacher: !!profile?.createdByTeacher });
  if (typeof renderHomeEncouragement === 'function') renderHomeEncouragement();
  if (typeof checkBookiReadingResume === 'function') checkBookiReadingResume();
  if (typeof checkShopCelebration === 'function') checkShopCelebration(_activeClubId);
  if (typeof checkNewMessages === 'function') checkNewMessages(_activeClubId, userId);
  if (typeof checkHomeShopTeaser === 'function') checkHomeShopTeaser(_activeClubId);
  showScreen('screen-main');
  _recordReaderEntry(userId, _activeClubId);
  if (typeof _initHomeMagic === 'function') _initHomeMagic();
  if (typeof maybeShowBackToSchoolPromo === 'function') maybeShowBackToSchoolPromo(userId);
  _updateBugLabel();

  const clubBtn = document.getElementById('btn-switch-club');
  if (clubBtn) clubBtn.style.display = _activeClubId ? '' : 'none';

  const navClassTab = document.getElementById('nav-tab-class');
  if (navClassTab) navClassTab.style.display = _activeClubId ? '' : 'none';

  // "החלף" — אייקון, מוצג רק אם באמת יש קורא אחר במועדון להחליף אליו (memberCount > 1),
  // לא רק כי יש מועדון. נטען באופן לא-חוסם כדי לא לעכב את הצגת מסך הבית.
  const switchHomeBtn = document.getElementById('btn-switch-reader-home');
  if (switchHomeBtn) {
    switchHomeBtn.style.display = 'none';
    if (_activeClubId && typeof fbLoadClub === 'function') {
      fbLoadClub(_activeClubId).then(club => {
        if (club && (club.memberCount || 0) > 1) switchHomeBtn.style.display = '';
      }).catch(() => {});
    }
  }

  const backBar = document.getElementById('main-back-club-students');
  if (backBar) backBar.style.display = window._returnToClubStudents ? '' : 'none';
}

// ─── ניווט גלובלי ─────────────────────────────────────────────────────────────

/** 📖 מי קורא עכשיו? — מסך בחירת קורא למועדון הפעיל */
function goWhoReads() {
  const clubId = _activeClubId
    || (typeof getActiveReader === 'function' ? getActiveReader()?.clubId : null);
  if (!clubId && !hasDeviceClubs()) return;
  showWhoReads(clubId);
}

/** מנקה זהות תלמיד אבל שומר הקשר מועדון — חוזר לרשימת קוראי המועדון */
/** כפתור "⬅️ החלף" בעמוד הבית. מוצג רק כשיש מועדון (יש קוראים אחרים לבחור
 *  מביניהם — ר' הצגה/הסתרה ב-_enterPersonalHome/selectStudent). לקורא אישי
 *  ללא מועדון אין "קורא אחר" להחליף אליו, ולכן במקום logout() גורף (שמוציא
 *  את הקורא כל הדרך למסך הפתיחה) מסתירים את הכפתור לגמרי; אם בכל זאת נקרא
 *  (state ישן מהדפדפן) — לא עושים כלום, לא יוצאים מהמערכת.
 */
function switchReaderHome() {
  const clubId = _activeClubId || (typeof getActiveReader === 'function' ? getActiveReader()?.clubId : null);
  if (clubId) switchReaderInClub();
}

/** מזריק פעם אחת את איור בוקי הרשמי (booki-start, בגודל מוקטן) מעל קונסולת
 *  הקריאה בעמוד הבית — מחובר חזותית אליה (margin שלילי + סלקטור ייעודי),
 *  לא עומד לבד מעל חלל ריק. idempotent, לא נוגע אם כבר הוזרק. */
function _ensureHomeHeroStage() {
  const stageEl = document.getElementById('home-console-stage');
  if (stageEl && !stageEl.innerHTML && typeof bookiStageHtml === 'function') {
    stageEl.innerHTML = bookiStageHtml('core/states/booki-start.png', { className: 'home-console-char', loading: 'eager' });
  }
}

/** טאב "בית" בניווט התחתון — חוזר למסך הבית של הקורא הפעיל, בלי לאבד הקשר. */
function goReaderHome() {
  setNavTab('home');
  showScreen('screen-main');
  if (typeof _initHomeMagic === 'function') _initHomeMagic();
}

async function showClassLibrary() {
  return showClassView();
}

function showTeacherStoryLibrary() {
  showScreen('screen-teacher-club');
}

/** בורר "איך רוצים לקרוא היום?" — נפתח מהכפתור הראשי היחיד במסך הבית.
 *  שלוש האפשרויות מפעילות בדיוק את פעולות הקריאה הקיימות (ללא שינוי לוגיקה). */
let _chooserReturnFocusEl = null;
let _chooserKeydownHandler = null;

function _chooserFocusables(sheetEl) {
  return Array.from(sheetEl.querySelectorAll('button')).filter(el => !el.disabled);
}

function openReadingChooser() {
  const el = document.getElementById('reading-chooser-overlay');
  if (!el) return;
  const stageEl = document.getElementById('chooser-header-stage');
  if (stageEl && !stageEl.innerHTML && typeof bookiStageHtml === 'function') {
    stageEl.innerHTML = bookiStageHtml('core/states/booki-reading.png', { className: 'chooser-header-char' });
  }
  _chooserReturnFocusEl = document.activeElement;
  el.style.display = 'flex';

  const sheetEl = el.querySelector('.chooser-sheet');
  const focusables = _chooserFocusables(sheetEl);
  if (focusables[0]) focusables[0].focus();

  _chooserKeydownHandler = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeReadingChooser(); return; }
    if (e.key !== 'Tab') return;
    const f = _chooserFocusables(sheetEl);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', _chooserKeydownHandler);
}

function closeReadingChooser() {
  const el = document.getElementById('reading-chooser-overlay');
  if (el) el.style.display = 'none';
  if (_chooserKeydownHandler) { document.removeEventListener('keydown', _chooserKeydownHandler); _chooserKeydownHandler = null; }
  if (_chooserReturnFocusEl && typeof _chooserReturnFocusEl.focus === 'function') _chooserReturnFocusEl.focus();
  _chooserReturnFocusEl = null;
}

function switchReaderInClub() {
  const clubId = _activeClubId || getActiveReader()?.clubId;
  if (typeof window.initCurrentStudent === 'function') window.initCurrentStudent(null, null);
  window.currentStudentData   = null;
  window._returnToClubStudents = false;
  clearActiveReader();
  // שומר הקשר מועדון בזיכרון (לא ב-localStorage)
  _activeClubId        = clubId;
  window.currentClubId = clubId;
  setNavVisible(false);
  if (clubId && typeof showWhoReads === 'function') showWhoReads(clubId);
  else routeOnLoad();
}

/** מנקה הקשר מועדון — נקרא מ-logout() ב-script.js */
function clearClubContext() {
  _activeClubId        = null;
  window.currentClubId = null;
}

function dismissWelcome() {
  localStorage.setItem('booki_welcome_shown', '1');
  routeOnLoad();
}

function openBugReport() {
  const authUser  = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
  const isTeacher = authUser && !authUser.isAnonymous;
  const name  = isTeacher
    ? (authUser.displayName || authUser.email || 'מורה')
    : (window.currentStudentData?.name || '');
  const club  = _activeClubId || window.currentClubId || '';
  const msg   = `היי יהודית, מצאתי באג בבוקי:\nשם: ${name}\nמועדון/כיתה: ${club}\nמה ניסיתי לעשות: \nמה קרה בפועל: \nצילום מסך אם יש:`;
  window.open('https://wa.me/972525383871?text=' + encodeURIComponent(msg), '_blank');
}

function _updateBugLabel() {
  const el = document.getElementById('bug-report-label');
  if (!el) return;
  const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
  el.textContent = (user && !user.isAnonymous) ? 'דיווח על באג' : 'משהו לא עובד?';
}

/** החלף קורא */
function switchReader() {
  setNavVisible(false);
  window._returnToClubStudents = false;
  routeOnLoad();
}

function goBackToClubStudents() {
  window._returnToClubStudents = false;
  const backBar = document.getElementById('main-back-club-students');
  if (backBar) backBar.style.display = 'none';
  showClubStudents();
}

function goBackFromJoin() {
  if (_activeClubId) showScreen('screen-who-reads');
  else if (hasDeviceClubs()) showScreen('screen-home');
  else routeOnLoad();
}

function goBackToJoinEntry() {
  showScreen('screen-join-entry');
}

// ─── Solo Card (כרטיס קריאה אישי ללא מועדון) ─────────────────────────────────

// Bug fix: soloId היה עד עכשיו מזהה מקומי-בלבד ('solo_' + timestamp) שלעולם לא
// שווה ל-request.auth.uid האמיתי — כל כתיבה/קריאה ל-Firestore שדורשת isMe(userId)
// (readingSessions, profile) נכשלה בשקט על כל כרטיס אישי שנוצר ככה (ר' firestore.rules
// isMe). התיקון: מזהים לפי auth.uid האמיתי מ-ensureStudentAuth(), בדיוק כמו שהצטרפות
// עצמית למועדון כבר עושה נכון (ר' selectProfile — "self-joined: מזהה ה-membership שווה
// ל-auth.uid"). למשתמשים קיימים עם soloId ישן — מעבירים את הנתונים המקומיים למפתח
// החדש פעם אחת כדי שלא ילכו לאיבוד.
async function openSoloCard() {
  _activeClubId        = null;
  window.currentClubId = null;

  const oldSoloId = localStorage.getItem('booki_solo_uid');
  const authUid   = (typeof ensureStudentAuth === 'function') ? await ensureStudentAuth() : null;
  const soloId    = authUid || oldSoloId || ('solo_' + Date.now());

  if (oldSoloId && oldSoloId !== soloId && typeof loadStudentLocal === 'function' && typeof saveStudentLocal === 'function') {
    const oldData = loadStudentLocal(oldSoloId);
    const newData = loadStudentLocal(soloId);
    if (oldData && (oldData.totalMinutes || 0) > 0 && !(newData && newData.totalMinutes > 0)) {
      saveStudentLocal({ ...oldData, id: soloId });
    }
  }
  localStorage.setItem('booki_solo_uid', soloId);

  const existing = typeof loadStudentLocal === 'function' ? loadStudentLocal(soloId) : {};
  if (existing && existing.personalizationComplete) {
    _enterPersonalHome(soloId, existing);
    return;
  }
  if (typeof showProfileWizard === 'function') {
    showProfileWizard(soloId, null, { name: existing?.name || '' });
  }
}

// ─── Share App ────────────────────────────────────────────────────────────────

function _shareText() {
  const url = window.location.origin + window.location.pathname.replace(/\/+$/, '');
  return 'היי!\nגילית אפליקציה מגניבה לעידוד קריאה אצל ילדים — בוקי 📚\n\nכיצד מצטרפים?\n👩‍🏫 מורה — פתחו מועדון קריאה חינמי\n📚 ילד/ה — פתחו כרטיס קריאה אישי, או בקשו ממורה קישור למועדון\n\n' + url;
}

function shareApp() {
  const text = _shareText();
  const url  = window.location.origin + window.location.pathname.replace(/\/+$/, '');
  if (navigator.share) {
    navigator.share({ title: 'בוקי — יער הקריאה', text, url }).catch(() => {});
    return;
  }
  const waUrl = 'https://wa.me/?text=' + encodeURIComponent(text);
  const overlay = document.createElement('div');
  overlay.id = 'share-app-overlay';
  overlay.className = 'share-overlay';
  overlay.innerHTML =
    '<div class="share-modal">' +
      '<button class="share-modal-close" onclick="document.getElementById(\'share-app-overlay\').remove()">✕</button>' +
      '<div class="share-modal-title">📤 שתפו את בוקי</div>' +
      '<p class="share-modal-text">שתפו עם חברים וחברות ומשפחה!</p>' +
      '<a class="btn-share-wa" href="' + waUrl + '" target="_blank" rel="noopener">💬 שלחו בוואטסאפ</a>' +
      '<button class="btn-share-copy" onclick="_copyShareText()">📋 העתיקו את הטקסט</button>' +
      '<div id="share-copy-ok" class="share-copy-ok" style="display:none">הועתק! ✓</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function _copyShareText() {
  navigator.clipboard.writeText(_shareText()).then(() => {
    const ok = document.getElementById('share-copy-ok');
    if (ok) { ok.style.display = ''; setTimeout(() => { ok.style.display = 'none'; }, 2000); }
  }).catch(() => {});
}

// ─── כלי פיתוח (קונסול) ──────────────────────────────────────────────────────

/** window.resetBookiDevice() — מנקה localStorage וחוזר לזרימת המורה החדשה. */
window.resetBookiDevice = function() {
  clearDeviceLocalCache();
  console.log('[booki] ✅ resetBookiDevice — המכשיר אופס. מחזיר לאזור המורה...');
  goToTeacherArea();
};

/** clearDeviceLocalCache() — מנקה מועדוני בדיקה, שומר Bootstrap/Legacy */
function clearDeviceLocalCache() {
  const data = getDeviceData();
  data.clubs = (data.clubs || []).filter(c =>
    typeof getBootstrapClubById === 'function' && !!getBootstrapClubById(c.clubId)
  );
  _saveDeviceData(data);
  localStorage.removeItem(_ACTIVE_READER_KEY);
  localStorage.removeItem('booki_tmp_uid');
  localStorage.removeItem('booki_migrated_fb_v2');
}
window.clearDeviceLocalCache = clearDeviceLocalCache;

// ─── Bridge: כניסה ישירה למסך ראשי לאחר הצטרפות ──────────────────────────────

window.enterPersonalHomeAfterJoin = function(userId, name, clubId) {
  _activeClubId        = clubId;
  window.currentClubId = clubId;
  _enterPersonalHome(userId, { name, emoji: '📚' });
};

// ─── Mini Personalization — כרטיסי תלמיד שנוצרו ע"י מורה ────────────────────

const _MINI_PERSON_EMOJIS = [
  '🐶','🐱','🦊','🐸','🐯','🦁',
  '🌟','🌈','🌸','🦋','🚀','⭐',
  '🎨','🎵','🍎','🍭','⚽','🎮',
  '🌊','🦄','🐬','🐧','🦉','🐢',
];
let _miniPersonState   = null;
let _miniSelectedEmoji = '📚';
let _miniDrawMode      = false;
// Shared canvas drawing state
let _cvIsDrawing = false, _cvLastX = 0, _cvLastY = 0;
let _cvColor = '#222222', _cvIsEraser = false, _cvActiveId = null;

function showMiniPersonalization(userId, clubId, name) {
  _miniPersonState   = { userId, clubId, name };
  _miniSelectedEmoji = _MINI_PERSON_EMOJIS[0];
  _miniDrawMode      = false;
  _cvIsDrawing       = false;
  _cvActiveId        = null;

  const h2El   = document.querySelector('.who-reads-title');
  const subEl  = document.getElementById('who-reads-club-name');
  const grid   = document.getElementById('who-reads-grid');
  const footer = document.querySelector('#screen-who-reads .who-reads-footer');

  if (h2El)   h2El.textContent  = `שלום, ${name}! 👋`;
  if (subEl)  subEl.textContent = 'בחר/י את האווטאר שלך:';
  if (footer) footer.innerHTML  = '';

  if (grid) grid.innerHTML = `
    <div class="mini-person-card">
      <div class="mini-avatar-tabs">
        <button class="mini-tab active" id="mini-tab-emoji" onclick="_switchMiniTab('emoji')">😊 אמוג׳י</button>
        <button class="mini-tab"        id="mini-tab-draw"  onclick="_switchMiniTab('draw')">✏️ ציור חופשי</button>
      </div>
      <div id="mini-emoji-panel">
        <div class="mini-person-emojis">
          ${_MINI_PERSON_EMOJIS.map(e =>
            `<button class="mini-emoji-btn${e === _miniSelectedEmoji ? ' selected' : ''}"
                     onclick="selectMiniEmoji(this,'${e}')">${e}</button>`
          ).join('')}
        </div>
      </div>
      <div id="mini-draw-panel" style="display:none">
        ${_cvPanelHtml('mini-draw-canvas')}
      </div>
      <p id="mini-person-error" class="auth-error" style="display:none"></p>
      <button id="btn-mini-person-save" class="btn-giant btn-green"
              style="margin:16px auto 0;display:block;max-width:240px"
              onclick="submitMiniPersonalization()">נכנסים לקרוא ⬅️</button>
    </div>`;

  showScreen('screen-who-reads');
}

function selectMiniEmoji(btn, emoji) {
  document.querySelectorAll('.mini-emoji-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  _miniSelectedEmoji = emoji;
}

function _switchMiniTab(tab) {
  _miniDrawMode = tab === 'draw';
  const ep = document.getElementById('mini-emoji-panel');
  const dp = document.getElementById('mini-draw-panel');
  const et = document.getElementById('mini-tab-emoji');
  const dt = document.getElementById('mini-tab-draw');
  if (ep) ep.style.display = tab === 'emoji' ? '' : 'none';
  if (dp) dp.style.display = tab === 'draw'  ? '' : 'none';
  if (et) et.classList.toggle('active', tab === 'emoji');
  if (dt) dt.classList.toggle('active', tab === 'draw');
  if (tab === 'draw') setTimeout(() => _cvAttach('mini-draw-canvas'), 0);
}

// ─── Canvas drawing helpers ────────────────────────────────────────────────────

function _cvPanelHtml(canvasId) {
  const colors = ['#222222','#e74c3c','#e67e22','#f1c40f','#2ecc71','#3498db','#9b59b6','#e91e63'];
  return '<canvas id="' + canvasId + '" width="220" height="220" class="draw-canvas" style="touch-action:none"></canvas>' +
    '<div class="draw-palette">' +
    colors.map(c =>
      '<button class="draw-color-btn" style="background:' + c + '"' +
      ' onclick="_cvPickColor(\'' + c + '\',this)"></button>'
    ).join('') +
    '<button class="draw-color-btn draw-eraser-btn" onclick="_cvPickEraser(this)" title="מחק">⬜</button>' +
    '</div>' +
    '<button class="draw-clear-btn" onclick="_cvClear()">🗑️ נקה</button>';
}

function _cvAttach(canvasId) {
  const cv = document.getElementById(canvasId);
  if (!cv || cv._cvReady) return;
  cv._cvReady  = true;
  _cvActiveId  = canvasId;
  _cvColor     = '#222222';
  _cvIsEraser  = false;
  const ctx    = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);

  function _pos(e) {
    const r = cv.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {
      x: (t.clientX - r.left) * (cv.width  / r.width),
      y: (t.clientY - r.top)  * (cv.height / r.height),
    };
  }
  function _start(e) {
    e.preventDefault();
    _cvIsDrawing = true;
    _cvActiveId  = canvasId;
    const p = _pos(e); _cvLastX = p.x; _cvLastY = p.y;
  }
  function _move(e) {
    if (!_cvIsDrawing) return;
    e.preventDefault();
    const p = _pos(e);
    ctx.strokeStyle = _cvIsEraser ? '#fff' : _cvColor;
    ctx.lineWidth   = _cvIsEraser ? 28 : 8;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(_cvLastX, _cvLastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    _cvLastX = p.x; _cvLastY = p.y;
  }
  function _end() { _cvIsDrawing = false; }
  cv.addEventListener('mousedown',  _start);
  cv.addEventListener('mousemove',  _move);
  cv.addEventListener('mouseup',    _end);
  cv.addEventListener('mouseleave', _end);
  cv.addEventListener('touchstart', _start, { passive: false });
  cv.addEventListener('touchmove',  _move,  { passive: false });
  cv.addEventListener('touchend',   _end,   { passive: false });
}

function _cvPickColor(color, btn) {
  _cvColor = color; _cvIsEraser = false;
  document.querySelectorAll('.draw-color-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}
function _cvPickEraser(btn) {
  _cvIsEraser = true;
  document.querySelectorAll('.draw-color-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}
function _cvClear() {
  const cv = document.getElementById(_cvActiveId);
  if (!cv) return;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);
}
function _cvExport(canvasId) {
  const cv = document.getElementById(canvasId || _cvActiveId);
  return cv ? cv.toDataURL('image/jpeg', 0.5) : null;
}

// ─── Avatar display helpers ────────────────────────────────────────────────────

function _isImgAvatar(av) {
  return typeof av === 'string' && (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(av) || /^https:\/\//i.test(av));
}
function _avatarText(avatar) {
  const s=String(avatar||'');
  return !s || /^(?:data:|https?:|javascript:|blob:)/i.test(s) ? '📚' : s;
}
function _setAvatarEl(el, avatar) {
  if (!el) return;
  el.replaceChildren();
  if (_isImgAvatar(avatar)) {
    const img=document.createElement('img');img.src=avatar;img.className='av-img';img.alt='הציור שלי';
    img.onerror=()=>{el.textContent='📚';};
    el.appendChild(img);
  } else el.textContent=_avatarText(avatar);
}
function _avatarHtml(avatar, cls) {
  const el=document.createElement(_isImgAvatar(avatar)?'img':'span');
  el.className=cls+(_isImgAvatar(avatar)?' av-img':'');
  if(_isImgAvatar(avatar)){el.src=avatar;el.alt='הציור שלי';}else el.textContent=_avatarText(avatar);
  return el.outerHTML;
}

// ─── Change avatar after setup ────────────────────────────────────────────────

function changeStudentAvatar() {
  const reader = typeof getActiveReader === 'function' ? getActiveReader() : null;
  const userId = reader?.userId;
  const clubId = reader?.clubId || window.currentClubId;
  if (!userId || !clubId) return;

  document.getElementById('av-modal')?.remove();
  window._apmCtx = { userId, clubId, drawMode: false, emoji: _MINI_PERSON_EMOJIS[0] };

  const overlay = document.createElement('div');
  overlay.id        = 'av-modal';
  overlay.className = 'av-modal-overlay';
  overlay.addEventListener('click', () => document.getElementById('av-modal')?.remove());
  overlay.innerHTML =
    '<div class="av-modal-box" onclick="event.stopPropagation()">' +
    '<button class="av-modal-close" onclick="document.getElementById(\'av-modal\').remove()">✕</button>' +
    '<p class="av-modal-title">בחר/י אווטאר</p>' +
    '<div class="mini-avatar-tabs">' +
    '<button class="mini-tab active" id="apm-tab-emoji" onclick="_apmTab(\'emoji\')">😊 אמוג׳י</button>' +
    '<button class="mini-tab"        id="apm-tab-draw"  onclick="_apmTab(\'draw\')">✏️ ציור</button>' +
    '</div>' +
    '<div id="apm-emoji-panel"><div class="mini-person-emojis">' +
    _MINI_PERSON_EMOJIS.map(e =>
      '<button class="mini-emoji-btn" onclick="_apmPickEmoji(\'' + e + '\',this)">' + e + '</button>'
    ).join('') +
    '</div></div>' +
    '<div id="apm-draw-panel" style="display:none">' + _cvPanelHtml('apm-canvas') + '</div>' +
    '<button class="btn-giant btn-green" style="margin:16px auto 0;display:block;max-width:180px"' +
    ' onclick="_apmSave()">שמור ✓</button>' +
    '</div>';
  document.body.appendChild(overlay);
}

function _apmTab(tab) {
  const ep = document.getElementById('apm-emoji-panel');
  const dp = document.getElementById('apm-draw-panel');
  const et = document.getElementById('apm-tab-emoji');
  const dt = document.getElementById('apm-tab-draw');
  if (ep) ep.style.display = tab === 'emoji' ? '' : 'none';
  if (dp) dp.style.display = tab === 'draw'  ? '' : 'none';
  if (et) et.classList.toggle('active', tab === 'emoji');
  if (dt) dt.classList.toggle('active', tab === 'draw');
  if (window._apmCtx) window._apmCtx.drawMode = tab === 'draw';
  if (tab === 'draw') setTimeout(() => _cvAttach('apm-canvas'), 0);
}

function _apmPickEmoji(emoji, btn) {
  if (window._apmCtx) window._apmCtx.emoji = emoji;
  document.querySelectorAll('#apm-emoji-panel .mini-emoji-btn').forEach(b => b.classList.remove('selected'));
  if (btn) btn.classList.add('selected');
}

async function _apmSave() {
  const ctx = window._apmCtx;
  if (!ctx) return;
  const avatar = ctx.drawMode ? (_cvExport('apm-canvas') || '📚') : (ctx.emoji || '📚');
  document.getElementById('av-modal')?.remove();
  window._apmCtx = null;

  if (typeof fbUpdateMemberAvatar === 'function') {
    await fbUpdateMemberAvatar(ctx.clubId, ctx.userId, avatar);
  }
  if (window.currentStudentData) window.currentStudentData.emoji = avatar;
  _setAvatarEl(document.getElementById('greeting-avatar'), avatar);
  const cardScreen = document.getElementById('screen-reader-card');
  if (cardScreen && cardScreen.classList.contains('active') && typeof showReaderCard === 'function') {
    showReaderCard();
  }
}

async function submitMiniPersonalization() {
  const state = _miniPersonState;
  if (!state) return;
  const { userId, clubId, name } = state;
  const emoji = _miniDrawMode ? (_cvExport('mini-draw-canvas') || '📚') : (_miniSelectedEmoji || '📚');
  const btn   = document.getElementById('btn-mini-person-save');
  const errEl = document.getElementById('mini-person-error');

  if (btn)   { btn.disabled = true; btn.textContent = 'שומר...'; }
  if (errEl) { errEl.style.display = 'none'; }

  // Ensure anonymous auth is active — session may have expired since selectProfile ran
  if (typeof ensureStudentAuth === 'function') await ensureStudentAuth();

  const authUser = (typeof firebase !== 'undefined' && firebase.auth)
    ? firebase.auth().currentUser : null;
  if (!authUser) {
    if (errEl) { errEl.t…24884 tokens truncated…05b2דוֹן">יש לי קוד מועדון</span>
        </button>
        <button class="splash2-secondary" onclick="openSoloCard()">
          <span class="splash2-secondary-icon">📚</span>
          <span data-nk="כַּרְטִיס קְרִיאָה אִישִׁי">כרטיס קריאה אישי</span>
        </button>
      </div>
    </div>

    <button id="splash-btn-create" class="splash2-teacher-link" onclick="goToTeacherArea()"><span data-nk="מוֹרָה? כְּנִיסָה כָּאן">מורה? כניסה כאן</span></button>
  </div>
</section>

<!-- ══ מסך בית — קיים מועדון ══════════════════════════════════════ -->
<section id="screen-home" class="screen">
  <div class="splash-bg">
    <div class="splash-tree">
      <div class="big-tree">🌳</div>
      <div class="floating-leaves">
        <span class="leaf l1">🍃</span>
        <span class="leaf l2">📚</span>
        <span class="leaf l3">🍃</span>
        <span class="leaf l4">✨</span>
        <span class="leaf l5">🍃</span>
      </div>
    </div>
    <h1 class="splash-title">🌳 יַעַר הַקְּרִיאָה<br><span class="splash-sub">שֶׁל בּוּקִי</span></h1>
    <p class="splash-tagline"><span data-nk="בּוֹחֲרִים מוֹעֲדוֹן, בּוֹחֲרִים קוֹרֵא,">בוחרים מועדון, בוחרים קורא,</span><br><span data-nk="וּמַתְחִילִים לְהַצְמִיחַ עֵץ מִקְּרִיאָה">ומתחילים להצמיח עץ מקריאה</span> 🌱</p>
    <div class="home-actions">
      <button class="btn-home-start" onclick="startReading()"><span data-nk="מַתְחִילִים">מתחילים</span> ⬅️</button>
    </div>
  </div>
</section>

<!-- ══ תפריט ראשי ═════════════════════════════════════════════════ -->
<section id="screen-main" class="screen booki-world booki-world--home">
  <div class="home-ambient" aria-hidden="true">
    <span class="ambient-sparkle as-1"></span>
    <span class="ambient-sparkle as-2"></span>
    <span class="ambient-sparkle as-3"></span>
    <span class="ambient-sparkle as-4"></span>
    <span class="ambient-cloud ac-1"></span>
    <span class="ambient-cloud ac-2"></span>
    <span class="ambient-glow"></span>
  </div>

  <div id="main-back-club-students" class="screen-header sticky-header" style="display:none">
    <div class="header-row">
      <button class="btn-back" onclick="goBackToClubStudents()">חזרה לחברי המועדון →</button>
    </div>
  </div>

  <div class="home-header">
    <div class="home-header-id">
      <span id="greeting-avatar" class="greeting-avatar">📚</span>
      <span class="greeting-name" id="current-student-name">—</span>
    </div>
    <button id="btn-switch-reader-home" class="btn-switch-icon" style="display:none" onclick="switchReaderHome()" title="החלף קורא" aria-label="החלף קורא">🔁</button>
  </div>
  <div id="booki-story-recommendations" aria-label="המלצות לסיפורים מהמורה"></div>
  <div id="booki-message-banner" class="booki-message-banner" style="display:none">
    <div id="booki-message-banner-stage" class="booki-message-banner-stage"></div>
    <p id="booki-message-banner-text" class="booki-message-banner-text"></p>
    <button class="booki-message-banner-close" onclick="dismissMessageBanner()" title="סגירה">✕</button>
  </div>

  <div id="booki-resume-banner" class="booki-resume-banner" style="display:none">
    <div id="booki-resume-banner-stage" class="booki-resume-banner-stage"></div>
    <div class="booki-resume-banner-body">
      <p><span data-nk="נִרְאֶה שֶׁהָיִיתָ בְּאֶמְצַע קְרִיאָה עִם בּוּקִי">נראה שהיית באמצע קריאה עם בוקי</span> 👀</p>
      <div class="booki-resume-actions">
        <button class="btn-resume" onclick="resumeBookiReading()">▶ <span data-nk="לְהַמְשִׁיךְ לִקְרוֹא">להמשיך לקרוא</span></button>
        <button class="btn-discard" onclick="discardBookiReading()">✕ <span data-nk="לֹא הַפַּעַם">לא הפעם</span></button>
      </div>
    </div>
  </div>

  <!-- הודעה חד-פעמית: "הגענו ליעד / החנות נפתחה" — modal חגיגי, לא באנר קבוע.
       מוצג פעם אחת בלבד לכל מחזור-יעד (checkShopCelebration, לוגיקה קיימת ללא שינוי). -->
  <div id="shop-celebration-overlay" class="shop-celebration-overlay" style="display:none" onclick="if(event.target===this) dismissShopCelebration()">
    <div class="shop-celebration-modal">
      <div class="confetti-area" id="home-confetti-area"></div>
      <div id="shop-celebration-stage" class="shop-celebration-stage"></div>
      <h3><span data-nk="מַדְהִים!">מדהים!</span></h3>
      <p><span data-nk="הַכִּתָּה שֶׁלָּכֶם הִגִּיעָה לְיַעַד הַקְּרִיאָה!">הכיתה שלכם הגיעה ליעד הקריאה!</span><br><span data-nk="בּוּקִי פָּתַח אֶת חֲנוּת הַפְּרָסִים!">בוקי פתח את חנות הפרסים!</span></p>
      <p id="shop-celebration-numbers" class="shop-celebration-numbers"></p>
      <button class="btn-giant btn-booki-read" onclick="enterShopFromCelebration()">🛍️ <span data-nk="לְהִכָּנֵס לַחֲנוּת">להיכנס לחנות</span></button>
      <button class="btn-footer-link" onclick="dismissShopCelebration()"><span data-nk="מְאֻחָר יוֹתֵר">מאוחר יותר</span></button>
    </div>
  </div>

  <!-- הודעת השקה חד־פעמית לכל קורא: חוזרים ללימודים -->
  <div id="back-to-school-promo" class="back-to-school-promo" style="display:none"
       role="dialog" aria-modal="true" aria-labelledby="back-to-school-promo-title"
       onclick="if(event.target===this) dismissBackToSchoolPromo()">
    <div class="back-to-school-promo-card">
      <button class="back-to-school-promo-close" onclick="dismissBackToSchoolPromo()" aria-label="סגירה">×</button>
      <div class="school-confetti" aria-hidden="true">
        <span>✏️</span><span>📐</span><span>🖍️</span><span>📓</span><span>✂️</span><span>📝</span>
      </div>
      <div class="school-backpack" aria-hidden="true">🎒</div>
      <p class="school-new-new">חדש! חדש! חדש!</p>
      <h2 id="back-to-school-promo-title">בוקי מחכה לך עם סיפורים חדשים</h2>
      <div class="school-promo-ribbon">חוזרים ללימודים</div>
      <p class="school-promo-copy">שלושה סיפורים חדשים על כיתה, חברים והתחלות חדשות כבר מחכים לך!</p>
      <button id="back-to-school-promo-action" class="school-promo-action" onclick="openBackToSchoolShelf()">🎒 לסיפורי חוזרים ללימודים</button>
      <button class="school-promo-later" onclick="dismissBackToSchoolPromo()">אחר כך</button>
    </div>
  </div>

  <!-- קונסולת הקריאה — בוקי + שלוש פעולות הקריאה כפעולה מיידית, לא בורר-ביניים -->
  <div class="home-console-wrap">
    <div id="home-console-stage" class="home-console-stage" role="button" tabindex="0"
         aria-label="פתיחת הודעה מבוקי"></div>

    <div class="home-speech-bubble">
      <p class="home-encouragement" id="home-encouragement">מוכנים לקרוא יחד עם הכיתה?</p>
      <span class="home-speech-tail" aria-hidden="true"></span>
    </div>

    <button id="home-start-reading" class="home-start-reading" onclick="openReadingChooser()">
      <span class="home-start-play" aria-hidden="true">▶</span>
      <span data-nk="מַתְחִילִים לִקְרֹא">מתחילים לקרוא</span>
    </button>
    <p class="home-start-hint">לחצו כאן ובחרו איך תרצו לקרוא היום</p>

    <button id="home-class-goal" class="home-class-goal" style="display:none" onclick="showClassView()" aria-label="פתיחת העץ והיעד הכיתתי">
      <span class="home-class-goal-tree" aria-hidden="true">🌳</span>
      <span class="home-class-goal-body">
        <span class="home-class-goal-topline">
          <strong>היעד הכיתתי</strong>
          <b id="home-class-goal-numbers"></b>
        </span>
        <span class="home-class-goal-track" aria-hidden="true"><i id="home-class-goal-fill"></i></span>
        <small id="home-class-goal-remaining"></small>
      </span>
      <span class="home-class-goal-arrow" aria-hidden="true">←</span>
    </button>

    <!-- "חדש על המדף" — קיצור אחד, מדף ספרים ויזואלי; מוצג רק אם יש סיפורים חדשים -->
    <button id="home-shelf-card" class="home-shelf-card" style="display:none" onclick="_openHomeShelf()">
      <div class="home-shelf-books" aria-hidden="true">
        <span class="home-shelf-book hsb-1">📕</span>
        <span class="home-shelf-book hsb-2">📗</span>
        <span class="home-shelf-book hsb-3">📘</span>
        <span class="home-shelf-book hsb-4">📙</span>
      </div>
      <div class="home-shelf-plank"></div>
      <div class="home-shelf-label">
        <span class="home-shelf-title">🆕 <span data-nk="חָדָשׁ עַל הַמַּדָּף">חדש על המדף</span></span>
        <span id="home-shelf-count" class="home-shelf-count"></span>
      </div>
    </button>

    <div id="home-progress-panel" class="home-progress-panel" style="display:none">
      <div class="home-progress-row">
        <span id="home-progress-week" class="home-progress-week"></span>
        <span id="home-progress-streak" class="home-progress-streak" style="display:none"></span>
      </div>
      <div class="home-progress-bar-track">
        <div id="home-progress-fill" class="home-progress-fill" style="width:0%"></div>
      </div>
      <div class="home-progress-row home-progress-row-bottom">
        <span id="home-progress-rank" class="home-progress-rank"></span>
        <span id="home-progress-remaining" class="home-progress-remaining"></span>
      </div>
    </div>

    <div class="console-frame">
      <span class="console-corner-sparkle ccs-1" aria-hidden="true">✦</span>
      <span class="console-corner-sparkle ccs-2" aria-hidden="true">✦</span>
      <span class="console-corner-sparkle ccs-3" aria-hidden="true">✦</span>
      <div class="console-surface">
        <span class="console-sparkle console-sparkle-1">✦</span>
        <span class="console-sparkle console-sparkle-2">✦</span>
        <div class="console-item">
          <button class="console-btn console-btn-side console-btn-right" onclick="enterAppStoryReading()">
            <img class="console-btn-icon" src="assets/booki/reading-journey/booki-read-in-app.png" alt="" loading="eager" width="96" height="96">
          </button>
          <span class="console-item-label" data-nk="לִקְרוֹא בְּבוּקִי">לקרוא בבוקי</span>
        </div>
        <div class="console-item console-item-main">
          <button class="console-btn console-btn-clock" onclick="startBookiReading()">
            <img class="console-btn-clock-icon" src="assets/booki/reading-journey/booki-physical-book-timer.png" alt="" loading="eager" width="120" height="120">
          </button>
          <span class="console-item-label" data-nk="הַשָּׁעוֹן שֶׁל בּוּקִי">השעון של בוקי</span>
        </div>
        <div class="console-item">
          <button class="console-btn console-btn-side console-btn-left" onclick="startBookReading()">
            <img class="console-btn-icon" src="assets/booki/reading-journey/booki-report-minutes.png" alt="" loading="eager" width="96" height="96">
          </button>
          <span class="console-item-label" data-nk="כְּבָר קָרָאתִי">כבר קראתי</span>
          <span class="console-item-sublabel" data-nk="לְדַוֵּחַ לְבוּקִי">לדווח לבוקי</span>
        </div>
      </div>
    </div>
  </div>

  <!-- הודעה אישית מבוקי — נפתחת רק בלחיצה על הדמות -->
  <div id="booki-personal-message" class="booki-personal-message" style="display:none"
       role="dialog" aria-modal="true" aria-labelledby="booki-personal-message-title"
       onclick="closeBookiPersonalMessage()">
    <article class="booki-text-message" onclick="closeBookiPersonalMessage()" tabindex="0">
      <div class="booki-text-message-head">
        <span class="booki-text-message-avatar" aria-hidden="true">💜</span>
        <div>
          <strong id="booki-personal-message-title">הודעה מבוקי</strong>
          <small>עכשיו</small>
        </div>
      </div>
      <p id="booki-personal-message-text"></p>
      <footer>באהבה, בוקי 💜</footer>
      <small class="booki-text-message-dismiss">לחצו על ההודעה כדי לחזור</small>
    </article>
  </div>

  <!-- כרטיס חנות קבוע — נקודות/התקדמות ליעד הכיתה, מוצג רק כשיש הקשר מועדון עם יעד/חנות -->
  <button id="home-shop-teaser" class="home-shop-teaser" style="display:none" onclick="showShop()">
    <div id="home-shop-teaser-stage" class="home-shop-teaser-stage"></div>
    <div class="home-shop-teaser-body">
      <div class="home-shop-teaser-row">
        <span class="home-shop-teaser-label">🛍️ <span data-nk="חֲנוּת הַכִּתָּה">חנות הכיתה</span></span>
        <span id="home-shop-teaser-points" class="home-shop-teaser-points"></span>
      </div>
      <div class="home-shop-teaser-bar-track">
        <div id="home-shop-teaser-fill" class="home-shop-teaser-fill" style="width:0%"></div>
      </div>
      <span id="home-shop-teaser-remaining" class="home-shop-teaser-remaining"></span>
    </div>
  </button>

  <div id="home-achievement-card" class="home-achievement-card" style="display:none">
    <span class="home-achievement-icon" aria-hidden="true">🏅</span>
    <p id="home-achievement-text" class="home-achievement-text"></p>
  </div>

  <button class="btn-footer-link" onclick="shareApp()">📤 <span data-nk="שַׁתְּפוּ אֶת בּוּקִי">שתפו את בוקי</span></button>
</section>

<!-- בורר: איך רוצים לקרוא היום — נפתח מהכפתור הראשי, שלוש האפשרויות הקיימות בלבד -->
<div id="reading-chooser-overlay" class="chooser-overlay" style="display:none" onclick="if(event.target===this) closeReadingChooser()" role="dialog" aria-modal="true" aria-labelledby="chooser-title">
  <div class="chooser-sheet">
    <div class="chooser-header">
      <div id="chooser-header-stage" class="chooser-header-stage"></div>
      <p id="chooser-title" class="chooser-title" data-nk="אֵיךְ רוֹצִים לִקְרוֹא הַיּוֹם?">איך רוצים לקרוא היום?</p>
    </div>
    <button class="chooser-option" onclick="closeReadingChooser(); enterAppStoryReading();">
      <img class="chooser-option-thumb" src="assets/booki/reading-journey/booki-read-in-app.png" alt="" loading="lazy" width="38" height="38">
      <span data-nk="לִקְרוֹא סִפּוּר בְּבוּקִי">לקרוא סיפור בבוקי</span>
    </button>
    <button class="chooser-option chooser-option-letters" onclick="closeReadingChooser(); showLettersReading();">
      <span class="chooser-letter-thumb" aria-hidden="true">א</span>
      <span>קוראים אותיות</span>
      <small>למי שרק מתחיל/ה</small>
      <span id="letters-new-badge" class="letters-new-badge" aria-label="חדש">חדש</span>
    </button>
    <button class="chooser-option" onclick="closeReadingChooser(); startBookiReading();">
      <img class="chooser-option-thumb" src="assets/booki/reading-journey/booki-physical-book-timer.png" alt="" loading="lazy" width="38" height="38">
      <span data-nk="לִקְרוֹא סֵפֶר עִם טַיְמֶר">לקרוא ספר עם טיימר</span>
    </button>
    <button class="chooser-option" onclick="closeReadingChooser(); startBookReading();">
      <img class="chooser-option-thumb" src="assets/booki/reading-journey/booki-report-minutes.png" alt="" loading="lazy" width="38" height="38">
      <span data-nk="כְּבָר קָרָאתִי — לְדַוֵּחַ דַּקּוֹת">כבר קראתי — לדווח דקות</span>
    </button>
    <button class="chooser-cancel" onclick="closeReadingChooser()"><span data-nk="בִּיטּוּל">ביטול</span></button>
  </div>
</div>

<!-- ספריית הכיתה — התשתית לבית הסיפורים המשותפים. -->
<section id="screen-class-library" class="screen booki-world booki-world--class">
  <div class="screen-header sticky-header"><div class="header-row">
    <button class="btn-back" onclick="goReaderHome()"><span data-nk="חֲזָרָה">חזרה</span> →</button>
    <h2>ספריית הכיתה</h2>
  </div></div>
  <div class="class-library-body">
    <button id="class-library-goal-card" class="class-library-goal-card" onclick="showClassView()">
      <span class="class-library-goal-tree" aria-hidden="true">🌳</span>
      <span><strong>העץ והיעד הכיתתי</strong><small>רואים כמה קראנו יחד, מצמיחים עלים ופירות</small></span>
      <b>למסך המלא ←</b>
    </button>
    <div class="class-library-hero">
      <img src="assets/booki/core/states/booki-reading.png" alt="בוקי קורא" width="180" height="180">
      <div><h3>הספרים שאנחנו יוצרים יחד</h3>
      <p>הסיפורים שנכתבו בכתב היד של ילדי הכיתה.</p></div>
    </div>
    <div id="active-class-stories" class="active-class-stories"></div>
    <div id="class-story-shelf" class="class-story-shelf" aria-live="polite"></div>
    <div id="class-story-empty" class="class-story-empty"><span aria-hidden="true">📚</span><strong>המדף מחכה לסיפור הראשון שלנו</strong><p>כשהמורה תפתח סיפור כיתתי, הוא יופיע כאן.</p></div>
  </div>
</section>

<!-- ══ ספריית סיפורים ══════════════════════════════════════════════ -->
<section id="screen-library" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button id="library-back-button" class="btn-back" onclick="libraryGoBack()"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2 id="library-screen-title" data-nk="סִפְרִיַּת הַסִּפּוּרִים">ספריית הסיפורים</h2>
    </div>
    <label class="library-search"><span>🔎</span><input id="library-search-input" type="search" placeholder="איזה סיפור בא לך?" oninput="searchLibrary(this.value)"></label>
  </div>
  <div id="library-category-view" class="library-category-view">
    <div class="library-welcome"><strong>איזה סיפור בא לך היום?</strong><span>בוחרים ספרייה ורואים רק את הסיפורים שבה.</span></div>
    <div id="library-category-grid" class="library-category-grid"></div>
  </div>
  <div id="library-story-view" style="display:none">
    <button class="library-all-categories" onclick="showLibraryCategories()">כל הספריות →</button>
  <div id="for-you-section" class="for-you-section" style="display:none">
    <div class="for-you-header">⭐ <span data-nk="בִּמְיֻחָד בִּשְׁבִילְךָ">במיוחד בשבילך</span></div>
    <div id="for-you-list" class="story-list for-you-list"></div>
    <div class="for-you-divider">📚 <span data-nk="כָּל הַסִּפּוּרִים">כל הסיפורים</span></div>
  </div>
  <div id="story-list" class="story-list"></div>
  <button id="library-show-more" class="library-show-more" style="display:none" onclick="showMoreLibraryStories()">הצגת עוד סיפורים</button>
  </div>
</section>

<!-- ══ קוראים אותיות — מתחילים ════════════════════════════════════ -->
<section id="screen-letters-reading" class="screen letters-screen">
  <div class="screen-header sticky-header"><div class="header-row"><button class="btn-back" onclick="showScreen('screen-main')">חזרה →</button><h2>קוראים אותיות</h2></div></div>
  <div class="letters-intro"><span class="letters-booki">🦉</span><div><strong>איזו אות נלמד היום?</strong><p>בחרו אות, ואז לחצו על כל סימן ניקוד כדי לשמוע אותו.</p></div></div>
  <div id="letters-grid" class="letters-grid"></div>
  <div id="letter-practice" class="letter-practice" style="display:none">
    <button class="letter-practice-close" onclick="closeLetterPractice()" aria-label="סגירה">×</button>
    <button id="letter-focus" class="letter-focus" onclick="speakCurrentLetter()" aria-label="השמעת שם האות"></button>
    <h3 id="letter-practice-title"></h3>
    <p class="letter-practice-help">לחצו על כל צורה ושמעו איך קוראים אותה 🔊</p>
    <div id="letter-niqqud-groups" class="letter-niqqud-groups"></div>
  </div>
</section>

<!-- ══ קורא סיפורים ════════════════════════════════════════════════ -->
<section id="screen-reader" class="screen reader-screen">
  <div class="reader-header sticky-header">
    <button class="btn-back" onclick="exitReader()"><span data-nk="יְצִיאָה">יציאה</span> →</button>
    <span id="reader-page-counter" class="page-counter">עמוד 1 מתוך 1</span>
  </div>
  <h2 id="reader-story-title" class="reader-title"></h2>
  <div class="reader-niqud-toolbar">
    <button id="reader-niqud-mode-btn" class="reader-niqud-mode-btn" onclick="openNiqudModeChooser()" aria-haspopup="dialog"></button>
    <button id="reader-niqud-help-btn" class="reader-niqud-help-btn" onclick="revealNiqudForCurrentPage()">✨ צריך ניקוד לרגע?</button>
  </div>
  <button id="reader-pause-btn" class="reader-pause-btn" onclick="pauseAppStory()">⏸️ אני צריך הפסקה</button>
  <button id="booki-reading-aloud-btn" class="booki-reading-aloud-btn" type="button" hidden onclick="window.BookiLocalListening?.requestStart?.()">🎙️ קריאה בקול</button>
  <div id="booki-local-listening" class="booki-local-listening" hidden role="status" aria-live="polite">
    <img class="booki-listening-character" src="assets/booki/core/states/booki-reading.png" alt="בוקי מקשיב" width="72" height="72">
    <span id="booki-listening-status">בוקי מכוון אוזניים...</span>
    <span id="booki-listening-meter" class="booki-listening-meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
  </div>
  <div class="reader-content">
    <div id="reader-illustration" class="reader-illustration" role="img" hidden></div>
    <div id="reader-text" class="reader-text"></div>
  </div>
  <div class="page-dots-wrap">
    <div id="page-dots" class="page-dots"></div>
  </div>
  <div class="reader-nav">
    <button id="btn-prev" class="btn-nav" onclick="prevPage()"><span data-nk="הַקּוֹדֵם">הקודם</span> ➡️</button>
    <button id="btn-next" class="btn-nav btn-nav-primary" onclick="nextPage()">⬅️ <span data-nk="הַבָּא">הבא</span></button>
  </div>
  <div id="finish-reading-div" class="finish-reading hidden">
    <button class="btn-giant btn-green celebrate-btn" onclick="finishAppReading()">🎉 <span data-nk="סִיַּמְתִּי לְהַיּוֹם!">סיימתי להיום!</span></button>
  </div>

  <div id="niqud-mode-dialog" class="niqud-mode-dialog" style="display:none" role="dialog" aria-modal="true" aria-labelledby="niqud-mode-title">
    <div class="niqud-mode-card">
      <h2 id="niqud-mode-title">מסלול הניקוד שלי</h2>
      <p>איך נוח לך לקרוא את הסיפור?</p>
      <div class="niqud-mode-options">
        <button onclick="chooseStoryNiqudMode('full')"><b>אָ</b><small>עם ניקוד</small></button>
        <button onclick="chooseStoryNiqudMode('mixed')"><b><span>אָ</span><span>א</span></b><small>חצי־חצי</small></button>
        <button onclick="chooseStoryNiqudMode('none')"><b>א</b><small>בלי ניקוד</small></button>
      </div>
    </div>
  </div>
</section>

<!-- ══ ספר אמיתי — שלב 1 ══════════════════════════════════════════ -->
<section id="screen-book-step1" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="showScreen('screen-main')"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2>📖 <span data-nk="קָרָאתִי מִסֵּפֶר">קראתי מספר</span></h2>
    </div>
    <div class="step-bar"><div class="step-fill" style="width:33%"></div></div>
    <p class="step-indicator" data-nk="שָׁלָב 1 מִתּוֹךְ 3 — פְּרָטֵי הַסֵּפֶר">שלב 1 מתוך 3 — פרטי הספר</p>
  </div>
  <div class="form-card">
    <label for="book-title"><span data-nk="שֵׁם הַסֵּפֶר">שם הספר</span> <span class="required">*</span></label>
    <input id="book-title" type="text" class="input-field" placeholder="כתוב/י את שם הספר…" />
    <label for="book-author"><span data-nk="שֵׁם הַמְּחַבֵּר/ת">שם המחבר/ת</span> <span class="optional">(לא חובה)</span></label>
    <input id="book-author" type="text" class="input-field" placeholder="כתוב/י את שם המחבר/ת…" />
    <button class="btn-giant btn-orange" onclick="bookStep2()">⬅️ <span data-nk="הֶמְשֵׁךְ">המשך</span></button>
  </div>
</section>

<!-- ══ ספר אמיתי — שלב 2 ══════════════════════════════════════════ -->
<section id="screen-book-step2" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="showScreen('screen-book-step1')"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2>📖 <span data-nk="כַּמָּה עַמּוּדִים קָרָאתָ?">כמה עמודים קראת?</span></h2>
    </div>
    <div class="step-bar"><div class="step-fill" style="width:66%"></div></div>
    <p class="step-indicator" data-nk="שָׁלָב 2 מִתּוֹךְ 3 — כַּמּוּת עַמּוּדִים">שלב 2 מתוך 3 — כמות עמודים</p>
  </div>
  <div class="pages-options">
    <button class="btn-pages" onclick="selectPages(event,'1-5',5)">
      <span class="pages-count">1–5</span>
      <span class="pages-mins" data-nk="כְּ-5 דַּקּוֹת">כ-5 דקות</span>
    </button>
    <button class="btn-pages" onclick="selectPages(event,'6-10',10)">
      <span class="pages-count">6–10</span>
      <span class="pages-mins" data-nk="כְּ-10 דַּקּוֹת">כ-10 דקות</span>
    </button>
    <button class="btn-pages" onclick="selectPages(event,'11-20',15)">
      <span class="pages-count">11–20</span>
      <span class="pages-mins" data-nk="כְּ-15 דַּקּוֹת">כ-15 דקות</span>
    </button>
    <button class="btn-pages" onclick="selectPages(event,'21+',25)">
      <span class="pages-count">21+</span>
      <span class="pages-mins">כ-25 דקות</span>
    </button>
    <div class="book-pages-manual">
      <label for="book-pages-manual">או כמה בדיוק?</label>
      <div><input id="book-pages-manual" type="number" min="1" max="500" inputmode="numeric" placeholder="למשל 37"><button type="button" onclick="selectManualPages()">המשך</button></div>
      <small id="book-pages-estimate">נחשב לך בערך כמה זמן קראת ✨</small>
    </div>
  </div>
</section>

<!-- ══ ספר אמיתי — שלב 3 ══════════════════════════════════════════ -->
<section id="screen-book-step3" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="showScreen('screen-book-step2')"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2>📖 <span data-nk="שְׁאֵלוֹת עַל הַסֵּפֶר">שאלות על הספר</span></h2>
    </div>
    <div class="step-bar"><div class="step-fill" style="width:100%"></div></div>
    <p class="step-indicator" data-nk="שָׁלָב 3 מִתּוֹךְ 3 — הֲבָנַת הַנִּקְרָא">שלב 3 מתוך 3 — הבנת הנקרא</p>
  </div>
  <div class="form-card">
    <div class="book-reading-modes">
      <strong>איך קראת?</strong>
      <label><input id="book-read-aloud" type="checkbox"> 🎙️ קראתי בקול</label>
      <div class="book-niqud-choice" role="group" aria-label="מצב ניקוד">
        <button type="button" data-book-niqud="full" onclick="selectBookNiqud('full')">אָ עם ניקוד</button>
        <button type="button" data-book-niqud="none" onclick="selectBookNiqud('none')">✨ בלי ניקוד</button>
      </div>
    </div>
    <label for="q-character"><span data-nk="מִי הַדְּמוּת הָרָאשִׁית בַּסִּפּוּר?">מי הדמות הראשית בסיפור?</span> <span class="required">*</span></label>
    <input id="q-character" type="text" class="input-field" placeholder="כתוב/י את שם הדמות…" />
    <label for="q-story"><span data-nk="מָה קָרָה בַּסִּפּוּר?">מה קרה בסיפור?</span> <span class="required">*</span></label>
    <textarea id="q-story" class="input-field textarea-field" placeholder="ספר/י מה קרה…"></textarea>
    <label for="q-liked"><span data-nk="מָה הֲכִי אָהַבְתָּ?">מה הכי אהבת?</span> <span class="required">*</span></label>
    <textarea id="q-liked" class="input-field textarea-field" placeholder="מה הכי אהבת בספר?"></textarea>
    <button class="btn-giant btn-orange" onclick="submitBookReading()">🎉 <span data-nk="סִיַּמְתִּי!">סיימתי!</span></button>
  </div>
</section>

<!-- ══ קריאה עם בוקי — מסך טיימר ═══════════════════════════════════ -->
<section id="screen-booki-reading" class="screen booki-reading-screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="cancelBookiReading()"><span data-nk="יְצִיאָה">יציאה</span> →</button>
    </div>
  </div>

  <div class="booki-say-moment">
    <span class="booki-say-face">🦉</span>
    <p id="booki-say-bubble-text" class="booki-say-bubble">הכל מוכן! 📖<br>לחצ/י על השעון כדי להתחיל לקרוא.</p>
  </div>

  <!-- אובייקט אחד: גם כפתור ההתחלה וגם תצוגת הטיימר — לא שני כפתורים נפרדים.
       idle: "התחל" (לחיץ) -> starting: ניצוצות קצרים -> running: מספר הדקות (לא לחיץ) -->
  <button id="booki-timer-btn" class="booki-timer-circle booki-timer-idle" onclick="toggleBookiReadingTimer()">
    <span class="booki-timer-sparkles">
      <span class="timer-sparkle ts-1">✨</span>
      <span class="timer-sparkle ts-2">⭐</span>
      <span class="timer-sparkle ts-3">🌟</span>
      <span class="timer-sparkle ts-4">✨</span>
      <span class="timer-sparkle ts-5">⭐</span>
      <span class="timer-sparkle ts-6">🌟</span>
    </span>
    <span id="booki-timer-icon" class="booki-timer-icon">▶</span>
    <span id="booki-timer-label" class="booki-timer-label">התחל</span>
    <span id="booki-timer-sublabel" class="booki-timer-sublabel"></span>
  </button>
  <p class="booki-timer-help">אפשר לנעול את הטלפון או לעבור לאפליקציה אחרת. כשתסיימו, חזרו לבוקי ולחצו על אותו כפתור. בוקי ישמור עד 90 דקות ברצף.</p>
</section>

<!-- ══ קריאה עם בוקי — רפלקציה קצרה ═══════════════════════════════ -->
<section id="screen-booki-reflection" class="screen booki-reading-screen">
  <div class="booki-say-moment">
    <span class="booki-say-face">📖</span>
    <p class="booki-say-bubble"><span data-nk="סַפֵּר/י לִי...">ספר/י לי...</span><br><span id="booki-reflection-question"></span></p>
  </div>
  <div class="form-card">
    <textarea id="booki-reflection-answer" class="input-field textarea-field" placeholder="אפשר לכתוב כאן..."></textarea>
    <button class="btn-giant btn-orange" onclick="submitBookiReflection()"><span data-nk="לְהַמְשִׁיךְ">להמשיך</span> ⬅️</button>
    <button class="btn-skip" onclick="skipBookiReflection()"><span data-nk="לְדַלֵּג עַל הַשְּׁאֵלָה">לדלג על השאלה</span></button>
  </div>
</section>

<!-- ══ מסך סיום ════════════════════════════════════════════════════ -->
<section id="screen-session-complete" class="screen complete-screen">
  <div class="complete-content">
    <div class="confetti-area" id="confetti-area"></div>
    <div class="complete-star animate-bounce">🌟</div>
    <h1 class="complete-title">כָּל הַכָּבוֹד!</h1>
    <div id="levelup-banner" class="levelup-banner" style="display:none"></div>
    <p class="complete-sub" data-nk="הַיּוֹם קָרָאתָ:">היום קראת:</p>
    <div class="complete-stats">
      <div class="stat-card stat-blue">
        <span class="stat-icon">⏱️</span>
        <span class="stat-number" id="complete-minutes">0</span>
        <span class="stat-label" data-nk="דַּקּוֹת קְרִיאָה">דקות קריאה</span>
      </div>
      <div class="stat-card stat-yellow">
        <span class="stat-icon">⭐</span>
        <span class="stat-number" id="complete-points">0</span>
        <span class="stat-label" data-nk="נְקֻדּוֹת חֲדָשׁוֹת!">נקודות חדשות!</span>
      </div>
    </div>
    <p id="complete-encouragement" class="complete-encouragement"></p>
    <div id="complete-bonus-breakdown" class="complete-bonus-breakdown" style="display:none"></div>
    <p class="complete-tree-msg">🌳 <span data-nk="כָּל דַּקַּת קְרִיאָה עוֹזֶרֶת לָעֵץ שֶׁלְּךָ לִגְדֹּל!">כל דקת קריאה עוזרת לעץ שלך לגדול!</span></p>
    <p class="complete-msg"><span data-nk="הַדַּקּוֹת וְהַנְּקֻדּוֹת נוֹסְפוּ לְכַרְטִיס הַקּוֹרֵא שֶׁלְּךָ!">הדקות והנקודות נוספו לכרטיס הקורא שלך!</span> 📚</p>
    <button class="btn-giant btn-white-on-purple" onclick="showScreen('screen-main')">🏠 <span data-nk="חֲזָרָה לַתַּפְרִיט">חזרה לתפריט</span></button>
  </div>
</section>

<!-- ══ כרטיס קורא ══════════════════════════════════════════════════ -->
<section id="screen-reader-card" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="showScreen('screen-main')"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2>👤 <span data-nk="כַּרְטִיס הַקּוֹרֵא שֶׁלִּי">כרטיס הקורא שלי</span></h2>
      <button id="btn-switch-club" class="btn-switch-reader" style="display:none" onclick="switchReaderInClub()">👥 <span data-nk="קוֹרֵא אַחֵר">קורא אחר</span></button>
    </div>
  </div>
  <div id="reader-card-content" class="reader-card-content"></div>
</section>

<!-- ══ הכיתה שלנו ═════════════════════════════════════════════════ -->
<section id="screen-class" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="_classGoBack()"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2 id="class-screen-title">👨‍👩‍👧‍👦 <span data-nk="הַכִּתָּה שֶׁלָּנוּ">הכיתה שלנו</span></h2>
    </div>
  </div>
  <div id="class-content" class="class-content"></div>
</section>

<!-- ══ חנות הכיתה — תלמיד ═══════════════════════════════════════ -->
<section id="screen-shop" class="screen">
  <div class="confetti-area" id="shop-confetti-area"></div>
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="showScreen('screen-main')"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2 class="shop-wood-sign">🪧 <span data-nk="הַחֲנוּת שֶׁל בּוּקִי">החנות של בוקי</span></h2>
    </div>
  </div>
  <div id="shop-student-content" class="shop-student-content"></div>
</section>

<!-- ══ בחירת מועדון (מועדונים מרובים) ════════════════════════════ -->
<section id="screen-club-select" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="goBackFromClubSelect()"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2 id="club-select-title"><span data-nk="בְּחַר/י מוֹעֲדוֹן">בחר/י מועדון</span></h2>
    </div>
  </div>
  <div id="club-select-list" class="club-select-list"></div>
</section>

<!-- ══ מי קורא עכשיו — Profile Picker ════════════════════════════ -->
<section id="screen-who-reads" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="_goBackFromWhoReads()"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2 class="who-reads-title">📖 מי קורא עכשיו?</h2>
    </div>
    <p id="who-reads-club-name" class="who-reads-club"></p>
  </div>
  <div class="who-reads-footer">
    <button class="btn-join-another" onclick="showJoinClub()">+ <span data-nk="הִתְחַבֵּר/י עִם קוֹד">התחבר/י עם קוד</span></button>
  </div>
  <div id="who-reads-grid" class="who-reads-grid"></div>
</section>

<!-- אישור זהות לפני פתיחת כרטיס קורא — מונע קריאה בטעות על שם ילד אחר -->
<div id="reader-confirm-overlay" class="reader-confirm-overlay" style="display:none"
     role="dialog" aria-modal="true" aria-labelledby="reader-confirm-title"
     onclick="if(event.target===this) cancelReaderIdentity()">
  <div class="reader-confirm-card">
    <div id="reader-confirm-avatar" class="reader-confirm-avatar" aria-hidden="true">📚</div>
    <h2 id="reader-confirm-title">זה הכרטיס שלך?</h2>
    <p>רק כדי שנשמור את הדקות בכרטיס הנכון</p>
    <button id="reader-confirm-yes" class="reader-confirm-yes" onclick="confirmReaderIdentity()">כן, זה אני</button>
    <button class="reader-confirm-no" onclick="cancelReaderIdentity()">אופס, זה לא אני…</button>
  </div>
</div>

<!-- ══ Club Dashboard ════════════════════════════════════════════ -->
<section id="screen-club-dashboard" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="goClubs()"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2 id="club-dash-name"></h2>
    </div>
    <p id="club-dash-reader-row" class="header-sub" style="display:none"></p>
  </div>
  <div class="club-dash-hero">
    <span id="club-dash-emoji" class="club-dash-emoji">📚</span>
    <p id="club-dash-members" class="club-dash-members"></p>
  </div>
  <div class="club-dash-stats">
    <div id="club-dash-minutes" class="club-dash-stat-card"></div>
    <div id="club-dash-stories" class="club-dash-stat-card"></div>
  </div>
  <div class="club-dash-actions">
    <button class="btn-giant btn-green" onclick="enterReadingFromDashboard()">מתחילים לקרוא ⬅️</button>
  </div>
</section>

<!-- ══ Club Students Screen ══════════════════════════════════════ -->
<section id="screen-club-students" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="showScreen('screen-teacher-club')">חזרה למועדון →</button>
      <h2>👨‍🎓 תלמידי המועדון</h2>
    </div>
    <p id="club-students-name" class="who-reads-club"></p>
  </div>
  <div id="club-students-grid" class="who-reads-grid"></div>
  <div id="add-student-section" class="add-student-section" style="display:none">
    <button class="btn-add-student-toggle" onclick="toggleAddStudentForm()">➕ הוסף תלמיד למועדון הזה</button>
    <div id="add-student-form" class="add-student-form" style="display:none">
      <p class="add-student-confirm">מוסיפה ל: <strong id="add-student-club-name"></strong></p>
      <input id="add-student-name-input" type="text" class="input-field"
             placeholder="שם התלמיד/ה" maxlength="40"
             onkeydown="if(event.key==='Enter') submitAddStudent()" />
      <p id="add-student-error" class="auth-error" style="display:none"></p>
      <button id="btn-add-student-save" class="btn-giant btn-green" onclick="submitAddStudent()">שמור תלמיד</button>
    </div>
  </div>
</section>

<!-- ══ Teacher Auth ════════════════════════════════════════════════ -->
<!-- ══ Initial Setup — מוצג פעם אחת בלבד כשאין config/setup ══════════ -->
<section id="screen-initial-setup" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <h2>🚀 הגדרת מערכת ראשונית</h2>
    </div>
    <p class="td-subtitle">מסך זה מופיע פעם אחת בלבד</p>
  </div>
  <div class="auth-container">
    <div class="auth-icon">🔑</div>
    <div class="auth-form">
      <p style="color:#555;font-size:.9rem;text-align:center;margin-bottom:1.2rem">
        הגדר/י את פרטי בעלת המערכת.<br>
        לאחר אישור, ה-Owner Dashboard ייפתח אוטומטית.
      </p>
      <input id="su-name"     type="text"     class="input-field" placeholder="שם מלא" autocomplete="name" />
      <input id="su-email"    type="email"    class="input-field" placeholder="כתובת אימייל" autocomplete="email" />
      <input id="su-password" type="password" class="input-field" placeholder="סיסמה (לפחות 6 תווים)" autocomplete="new-password" />
      <input id="su-org"      type="text"     class="input-field" placeholder="שם הארגון (אופציונלי)" />
      <p id="su-error" class="auth-error"></p>
      <button id="btn-submit-setup" class="btn-giant btn-green" onclick="submitInitialSetup()">הגדר מערכת</button>
    </div>
  </div>
</section>

<!-- ══ Profile Wizard ════════════════════════════════════════════════ -->
<section id="screen-profile-wizard" class="screen wiz-screen">
  <div id="wizard-progress-bar" class="wizard-progress">
    <div class="wizard-progress-track">
      <div id="wizard-progress-fill" class="wizard-progress-fill"></div>
    </div>
    <span id="wizard-progress-label" class="wizard-progress-label">1 מתוך 8</span>
  </div>
  <div id="wizard-content" class="wizard-content"></div>
</section>

<!-- ══ Teacher Auth ══════════════════════════════════════════════════ -->
<section id="screen-teacher-auth" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="showTeacherDashboard()"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2>כניסה למורים</h2>
    </div>
  </div>
  <div class="auth-container">
    <div class="auth-icon">👩‍🏫</div>
    <div class="teacher-auth-intro"><strong>ברוכה הבאה לאזור המורה</strong><span>כאן מקימים מועדון, מוסיפים תלמידים ועוקבים אחרי הקריאה.</span></div>
    <div id="teacher-auth-form" class="auth-form"></div>
  </div>
</section>

<!-- ══ Teacher Dashboard ═══════════════════════════════════════════ -->
<section id="screen-teacher-dashboard" class="screen">
  <button type="button" class="btn-logout teacher-dashboard-exit-fallback" onclick="teacherSignOut()" style="position:fixed;top:max(14px,env(safe-area-inset-top));left:14px;z-index:1200">יציאה מהחשבון</button>
  <div class="screen-header sticky-header">
    <div class="header-row">
      <h2>📚 מועדוני הקריאה שלי</h2>
      <div class="header-actions">
        <button class="btn-share-app" onclick="shareApp()">📤 שתפו</button>
        <button class="btn-logout" onclick="teacherSignOut()">יציאה</button>
      </div>
    </div>
    <p id="td-teacher-name" class="td-subtitle"></p>
  </div>
  <div class="td-body">
    <div class="teacher-management-only"><strong>🔒 אזור ניהול למורה בלבד</strong><span>כאן מנהלים את המועדונים. לקריאה נכנסים דרך „הבית של בוקי” של המועדון.</span></div>
    <div class="teacher-dashboard-guide"><strong>מה עושים עכשיו?</strong><span>1. בוחרים מועדון קיים או מקימים חדש.</span><span>2. מעתיקים את הבית של בוקי ושולחים לכיתה.</span><span>3. חוזרים לכאן כדי לעקוב ולעודד.</span></div>
    <button class="btn-td-primary" onclick="showCreateClub()">＋ הקמת מועדון חדש</button>
    <h3 class="td-section-title">המועדונים שלי</h3>
    <div id="td-clubs-list" class="td-clubs-list"></div>
  </div>
</section>

<!-- ══ Teacher Club Screen ═════════════════════════════════════════ -->
<section id="screen-teacher-club" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="_goBackToTeacherDashboard()"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2 id="tc-club-name">המועדון שלי</h2>
    </div>
  </div>
  <div class="tc-body">
    <div class="teacher-management-only"><strong>🔒 זהו קישור ניהול בלבד</strong><span>רוצים להיכנס לקריאה? פותחים את „הבית של בוקי” שמופיע כאן למטה.</span></div>
    <div class="tc-hero">
      <span id="tc-club-emoji" class="tc-hero-emoji">📚</span>
    </div>
    <section class="tc-assistant-card tc-clear-actions">
      <p id="tc-class-summary" role="status">טוען את הכיתה…</p>
      <button id="tc-next-action" type="button" class="btn-giant btn-green" disabled>טוען…</button>
      <button class="tc-secondary-action" type="button" onclick="showTeacherChildDemo()">איך זה נראה מהצד של הילדים?</button>
      <button class="tc-secondary-action" type="button" onclick="bookiReviewDeviceAccess()">אישור מכשירים לילדים</button>
      <button class="tc-secondary-action" type="button" onclick="showClubStudents()">ילדי המועדון</button>
      <button class="tc-secondary-action" type="button" onclick="showShopManagement()">🎯 יעד וחנות</button>
    </section>
    <div id="tc-share-panel" class="tc-share-panel" style="display:none">
      <div class="tc-share-heading"><strong>🏠 הבית של בוקי לכיתה</strong><span>זה הקישור הקבוע שממנו הילדים נכנסים לקרוא. חשוב לשמור עליו.</span></div>
      <button id="tc-share-button" onclick="shareCurrentTeacherClub()">שיתוף הקישור</button>
      <span id="tc-share-feedback" class="tc-share-feedback" role="status"></span>
    </div>
    <details class="tc-more-management"><summary>אפשרויות נוספות</summary><button onclick="openTeacherClubShare()">קישור הכיתה</button></details>
  </div>
</section>

<section id="screen-teacher-stories" class="screen">
  <div class="screen-header sticky-header"><div class="header-row">
    <button class="btn-back" onclick="showScreen('screen-teacher-club')"><span data-nk="חֲזָרָה">חזרה</span> →</button><h2>סיפורי הכיתה</h2>
  </div></div>
  <div class="teacher-stories-groundwork teacher-stories-live">
    <img src="assets/booki/teacher/booki-teacher-helper.png" alt="בוקי עוזר למורה" width="190" height="190">
    <h3>יוצרים סיפור חדש עם הכיתה</h3>
    <p>בוחרים סיפור שלם. בוקי מחלק אותו אוטומטית בין כל ילדי המועדון, וכל ילד מצלם את החלק שלו בכתב יד.</p>
    <div class="story-create-form">
      <label>שם הספר הכיתתי<input id="class-story-title" maxlength="70" placeholder="למשל: ההרפתקה ביער"></label>
      <strong class="story-source-heading">מאיפה מגיע הסיפור?</strong>
      <input id="class-story-source-mode" type="hidden" value="own">
      <div class="story-source-choices"><button type="button" class="story-source-choice active" data-mode="own" onclick="setClassStorySource('own')">✍️ טקסט שלי</button><button type="button" class="story-source-choice" data-mode="app" onclick="setClassStorySource('app')">📚 סיפור מבוקי</button></div>
      <div id="class-story-own-source"><label>הדביקי כאן את הסיפור המלא<textarea id="class-story-full-text" maxlength="12000" rows="9" placeholder="הדביקי את כל הסיפור מתחילתו ועד סופו…" oninput="updateClassStoryPlan()"></textarea></label></div>
      <div id="class-story-app-source" style="display:none"><label>בחרי סיפור מהספרייה<select id="class-story-app-select" onchange="onClassStoryAppSelected()"></select></label></div>
      <label>הודעה קצרה לילדים — לא חובה<textarea id="class-story-opening" maxlength="240" placeholder="היום נכתוב יחד את הסיפור..."></textarea></label>
      <div id="class-story-member-count" class="story-member-count">סופרת את ילדי המועדון…</div>
      <div id="class-story-plan" class="story-division-plan"></div>
      <button class="btn-giant btn-green" onclick="createClassStory()">חלוקת הסיפור ופתיחתו לילדים</button><p id="class-story-create-msg" role="status"></p>
    </div>
    <h3 class="teacher-story-list-title">הסיפורים שלנו</h3><div id="teacher-class-stories-list"></div>
  </div>
</section>

<section id="screen-student-class-story" class="screen story-workshop-screen"><div class="screen-header sticky-header"><div class="header-row"><button class="btn-back" onclick="showClassLibrary()">חזרה לספרייה →</button><h2 id="student-story-title"></h2></div></div><div class="story-workshop-body"><p id="student-story-opening" class="story-opening"></p><div id="student-story-action"></div></div></section>

<section id="screen-teacher-story-review" class="screen"><div class="screen-header sticky-header"><div class="header-row"><button class="btn-back" onclick="showTeacherStoryLibrary()">חזרה לסיפורים →</button><h2 id="teacher-story-review-title"></h2></div><p id="teacher-story-review-opening" class="header-sub"></p></div><div class="teacher-review-body"><div class="teacher-review-help"><strong>כאן בונים את הספר</strong><span>מאשרים צילומים ברורים, מחזירים צילום לא ברור ומסדרים בעזרת החצים.</span></div><div id="teacher-story-parts"></div><button id="publish-class-story" class="btn-giant btn-green" onclick="publishClassStory()">סיום ופרסום בספריית הכיתה</button></div></section>

<section id="screen-published-class-story" class="screen published-story-screen"><div class="screen-header sticky-header no-print"><div class="header-row"><button id="published-story-back" class="btn-back">חזרה →</button><h2 id="published-story-title"></h2><button id="published-story-print" class="btn-header-icon" onclick="printClassStory()">🖨️</button></div></div><main class="published-story-book"><header><h1 id="published-story-title-print"></h1><p id="published-story-opening"></p></header><div id="published-story-pages"></div></main></section>

<!-- ══ ניהול חנות הכיתה — מורה ═══════════════════════════════════════ -->
<section id="screen-shop-teacher" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="showScreen('screen-teacher-club')"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2>🎯 יעד וחנות</h2>
    </div>
    <p class="header-sub">קוראים יחד, מגיעים ליעד ובוחרים פרס.</p>
  </div>
  <div id="shop-teacher-content" class="shop-teacher-content"></div>
</section>

<!-- ══ הגדרות יעד — מורה ══════════════════════════════════════════ -->
<section id="screen-goal-settings" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="showShopManagement()"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2>🎯 הגדרת יעד</h2>
    </div>
  </div>
  <div id="goal-settings-content" class="goal-settings-content"></div>
</section>

<!-- ══ יצירת מועדון — בחירת סוג ══════════════════════════════════ -->
<section id="screen-create-type" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="goToTeacherArea()"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2>יצירת מועדון</h2>
    </div>
    <p class="step-indicator">שלב 1 מתוך 3 — סוג המועדון</p>
    <div class="step-bar"><div class="step-fill" style="width:33%"></div></div>
  </div>
  <div class="type-cards">
    <button class="type-card" onclick="selectClubType('school')">
      <span class="type-emoji">🏫</span>
      <div>
        <span class="type-label">בית ספר</span>
        <span class="type-sub">לכיתות ומוסדות חינוך</span>
      </div>
    </button>
    <button class="type-card" onclick="selectClubType('family')">
      <span class="type-emoji">🏠</span>
      <div>
        <span class="type-label">משפחה</span>
        <span class="type-sub">לקריאה משפחתית משותפת</span>
      </div>
    </button>
    <button class="type-card" onclick="selectClubType('friends')">
      <span class="type-emoji">🤝</span>
      <div>
        <span class="type-label">חברים</span>
        <span class="type-sub">לקבוצות חברים וחברות</span>
      </div>
    </button>
  </div>
</section>

<!-- ══ יצירת מועדון — שם ואמוג׳י ══════════════════════════════════ -->
<section id="screen-create-name" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="showScreen('screen-create-type')"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2>יצירת מועדון</h2>
    </div>
    <p class="step-indicator">שלב 2 מתוך 3 — שם ואמוג׳י</p>
    <div class="step-bar"><div class="step-fill" style="width:66%"></div></div>
  </div>
  <div class="form-card">
    <p class="teacher-step-help">אפשר להוסיף את כל הכיתה עכשיו, או לדלג ולהוסיף תלמידים אחר כך.</p>
    <label for="club-name-input">שם המועדון <span class="required">*</span></label>
    <input id="club-name-input" type="text" class="input-field" placeholder="לדוגמה: מיתרים כיתה ב׳" />
    <label>סמל המועדון</label>
    <div class="emoji-picker-row">
      <button class="emoji-opt selected" data-emoji="🌳" onclick="selectClubEmoji(this)">🌳</button>
      <button class="emoji-opt" data-emoji="🌊" onclick="selectClubEmoji(this)">🌊</button>
      <button class="emoji-opt" data-emoji="🦋" onclick="selectClubEmoji(this)">🦋</button>
      <button class="emoji-opt" data-emoji="🌈" onclick="selectClubEmoji(this)">🌈</button>
      <button class="emoji-opt" data-emoji="📚" onclick="selectClubEmoji(this)">📚</button>
      <button class="emoji-opt" data-emoji="🎯" onclick="selectClubEmoji(this)">🎯</button>
      <button class="emoji-opt" data-emoji="🌟" onclick="selectClubEmoji(this)">🌟</button>
      <button class="emoji-opt" data-emoji="🏆" onclick="selectClubEmoji(this)">🏆</button>
      <button class="emoji-opt" data-emoji="🌸" onclick="selectClubEmoji(this)">🌸</button>
      <button class="emoji-opt" data-emoji="⚡" onclick="selectClubEmoji(this)">⚡</button>
    </div>
    <button class="btn-giant btn-green" onclick="submitClubName()">המשך ⬅️</button>
  </div>
</section>

<!-- ══ יצירת מועדון — הוספת חברים ════════════════════════════════ -->
<section id="screen-create-members" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="showScreen('screen-create-name')"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2>יצירת מועדון</h2>
    </div>
    <p class="step-indicator">שלב 3 מתוך 3 — הוספת חברים</p>
    <div class="step-bar"><div class="step-fill" style="width:100%"></div></div>
  </div>
  <div class="form-card">
    <div class="add-mode-tabs">
      <button class="add-mode-btn active" id="btn-mode-single" onclick="setAddMode('single')">➕ אחד-אחד</button>
      <button class="add-mode-btn" id="btn-mode-paste" onclick="setAddMode('paste')">📋 הדבק רשימה</button>
    </div>

    <div id="add-single-mode">
      <label for="member-name-input">שם החבר/ה</label>
      <div class="add-member-row">
        <input id="member-name-input" type="text" class="input-field"
               placeholder="כתוב/י שם..." onkeydown="addMemberOnEnter(event)" />
        <button class="btn-add-member" onclick="addMember()">+ הוסף</button>
      </div>
    </div>

    <div id="add-paste-mode" style="display:none">
      <label for="member-paste-input">הדבק שמות — שם אחד בכל שורה</label>
      <textarea id="member-paste-input" class="input-field textarea-field"
                rows="7"
                placeholder="עומרי כהן&#10;יונתן לוי&#10;שירה דהן&#10;נועה ישראלי"></textarea>
      <button class="btn-giant btn-blue" style="margin-top:8px" onclick="addPastedMembers()">📋 הוסף את כולם</button>
    </div>

    <p id="member-count" class="member-count-label"></p>
    <div id="member-list" class="member-list"></div>
    <button id="btn-go-review" class="btn-giant btn-green" onclick="goToReview()">המשך לסיכום ←</button>
  </div>
</section>

<!-- ══ יצירת מועדון — סקירה ════════════════════════════════════════ -->
<section id="screen-create-review" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="showScreen('screen-create-members')"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2>סקירה לפני יצירה</h2>
    </div>
  </div>
  <div class="review-card">
    <div class="review-club-header">
      <span id="review-club-emoji" class="review-club-emoji">🌳</span>
      <div>
        <p id="review-club-name" class="review-club-name">שם המועדון</p>
        <p id="review-club-type" class="review-club-type">סוג</p>
      </div>
    </div>
    <p id="review-count" class="review-count"></p>
    <div id="review-member-list" class="review-member-list"></div>
  </div>
  <div style="padding:0 16px 24px">
    <p id="create-club-error" class="auth-error" style="display:none"></p>
    <button id="btn-create-club" class="btn-giant btn-green" onclick="createClub()">יצירת המועדון</button>
  </div>
</section>

<!-- ══ יצירת מועדון — הצלחה ════════════════════════════════════════ -->
<section id="screen-create-success" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <h2>🎉 המועדון נוצר!</h2>
    </div>
  </div>
  <div class="success-club-header">
    <span id="success-club-emoji" class="success-big-emoji">🌳</span>
    <h3 id="success-club-name">שם המועדון</h3>
  </div>
  <div class="success-code-block">
    <p class="success-code-label">קוד ההצטרפות:</p>
    <div class="success-code-value" id="success-club-code">——</div>
  </div>
  <div class="success-actions">
    <button class="btn-giant btn-outline-green" onclick="copyJoinLink()">📋 העתק קישור</button>
    <button class="btn-giant btn-green" style="margin-top:10px" onclick="shareCodesWhatsApp()">📤 שלח ב-WhatsApp</button>
    <button class="btn-giant btn-outline-green" style="margin-top:10px" onclick="goToTeacherArea()">🏠 חזרה לדשבורד</button>
  </div>
  <div id="success-guide"></div>
</section>

<!-- ══ מעבר ממותג — כניסה מקישור מועדון ═══════════════════════════ -->
<section id="screen-club-welcome" class="screen booki-world booki-world--home">
  <div id="club-welcome-content" class="club-welcome-content">
    <div id="club-welcome-stage"></div>
    <h1 id="club-welcome-title" class="club-welcome-title" data-nk="אֵיזֶה כֵּיף שֶׁבָּאתָ!">איזה כיף שבאת!</h1>
    <!-- club-welcome-text מוחלף ב-JS פעם אחת (onboarding.js) עם שם המועדון האמיתי —
         ה-data-nk כאן חל רק על הרגע הראשון לפני שהמועדון נטען. -->
    <p id="club-welcome-text" class="club-welcome-text" data-nk="בּוּקִי פּוֹתֵחַ לְךָ עַכְשָׁיו אֶת הַמּוֹעֲדוֹן…">בוקי פותח לך עכשיו את המועדון…</p>
    <p id="club-welcome-subline" class="club-welcome-subline" data-nk="עוֹד רֶגַע בּוֹחֲרִים מִי קוֹרֵא">עוד רגע בוחרים מי קורא</p>
    <div id="club-welcome-error" class="club-welcome-error" style="display:none">
      <p data-nk="לֹא הִצְלַחְנוּ לִטְעוֹן אֶת הַמּוֹעֲדוֹן כָּרֶגַע.">לא הצלחנו לטעון את המועדון כרגע.</p>
      <button class="btn-giant btn-booki-read" onclick="retryClubWelcome()">🔄 <span data-nk="לְנַסּוֹת שׁוּב">לנסות שוב</span></button>
    </div>
  </div>
</section>

<!-- ══ הצטרפות למועדון — הזנת קוד ════════════════════════════════ -->
<section id="screen-join-entry" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="goBackFromJoin()"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2><span data-nk="הִתְחַבְּרוּת לְמוֹעֲדוֹן">התחברות למועדון</span></h2>
    </div>
  </div>
  <div class="join-code-section">
    <p class="join-label" data-nk="הַזֵּן/י קוֹד מוֹעֲדוֹן">הזן/י קוד מועדון</p>
    <input id="join-code-input" type="text" class="join-code-input"
           maxlength="6" placeholder="ABC123"
           onkeydown="handleCodeKeydown(event)" autocomplete="off" />
    <p id="join-error-msg" class="join-error"></p>
    <button id="btn-join-code" class="btn-giant btn-blue" onclick="submitJoinCode()"><span data-nk="כְּנִיסָה">כניסה</span> ⬅️</button>
  </div>
  <div class="join-divider" data-nk="— אוֹ —">— או —</div>
  <div class="join-channels">
    <button class="join-channel-btn" disabled>
      <span>📷 <span data-nk="סְרִיקַת QR">סריקת QR</span></span>
      <span class="badge-soon" data-nk="בְּקָרוֹב">בקרוב</span>
    </button>
    <button class="join-channel-btn" disabled>
      <span>💬 <span data-nk="קִישּׁוּר מ-WhatsApp">קישור מ-WhatsApp</span></span>
      <span class="badge-soon" data-nk="בְּקָרוֹב">בקרוב</span>
    </button>
  </div>
  <div class="join-divider" data-nk="— מוֹעֲדוֹנִים קַיָּמִים —">— מועדונים קיימים —</div>
  <div id="existing-clubs-list" class="existing-clubs-list"></div>
</section>

<!-- ══ הצטרפות — הזנת שם ══════════════════════════════════════════ -->
<section id="screen-join-name" class="screen">
  <div class="screen-header sticky-header">
    <div class="header-row">
      <button class="btn-back" onclick="goBackToJoinEntry()"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <h2><span data-nk="בְּרוּכִים הַבָּאִים!">ברוכים הבאים!</span></h2>
    </div>
  </div>
  <div class="join-code-section">
    <p class="join-invite-label">📚 <span data-nk="הֻזְמַנְתֶּם לְהִצְטָרֵף לְמוֹעֲדוֹן:">הוזמנתם להצטרף למועדון:</span></p>
    <div class="join-club-banner">
      <span id="join-club-emoji-display"></span>
      <span id="join-club-name-display"></span>
    </div>
    <p class="join-label" data-nk="הַזִּינוּ אֶת שֵׁם הַיֶּלֶד כְּדֵי לְהִצְטָרֵף:">הזינו את שם הילד כדי להצטרף:</p>
    <input id="join-name-input" type="text" class="join-code-input"
           maxlength="30" placeholder="שם פרטי"
           onkeydown="handleNameKeydown(event)" autocomplete="given-name" />
    <p id="join-name-error" class="join-error"></p>
    <button id="btn-join-name" class="btn-giant btn-blue" onclick="submitJoinName()"><span data-nk="מִצְטָרֵף/ת">מצטרף/ת</span> ⬅️</button>
  </div>
</section>

<!-- ══ הצטרפות — ברוכים הבאים ════════════════════════════════════ -->
<section id="screen-join-welcome" class="screen welcome-full-screen">
  <div class="welcome-content">
    <div class="welcome-icon">🎉</div>
    <h1 class="welcome-title"><span data-nk="הֵיי,">היי,</span> <span id="welcome-name">קורא/ת</span>!</h1>
    <p class="welcome-sub"><span data-nk="הַכַּרְטִיס שֶׁלְּךָ כְּבָר מְחַכֶּה לְךָ">הכרטיס שלך כבר מחכה לך</span> 📖</p>
    <p class="welcome-hint" data-nk="בּוֹא/י נַשְׁלִים אֶת פְּרוֹפִיל הַקְּרִיאָה שֶׁלְּךָ">בוא/י נשלים את פרופיל הקריאה שלך</p>
    <button class="btn-giant btn-white-on-purple" style="margin-top:30px" onclick="startProfile()"><span data-nk="בּוֹאוּ נַתְחִיל!">בואו נתחיל!</span> ⬅️</button>
  </div>
</section>

<!-- ══ אונבורדינג — כיתה ═══════════════════════════════════════════ -->
<section id="screen-onboard-grade" class="screen">
  <div class="onboard-header">
    <div class="ob-back-row">
      <button class="ob-back-btn" onclick="showScreen('screen-join-welcome')"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <p class="onboard-step" data-nk="שָׁלָב 1 מִתּוֹךְ 4">שלב 1 מתוך 4</p>
    </div>
    <div class="onboard-progress"><div class="onboard-fill" style="width:25%"></div></div>
  </div>
  <p class="onboard-question" data-nk="בְּאֵיזוֹ כִּתָּה אַתָּה/אַתְּ?">באיזו כיתה אתה/את?</p>
  <div class="grade-grid">
    <button class="grade-btn" onclick="selectGrade('grade-1',this)">
      <span class="grade-letter">א׳</span><span class="grade-sub" data-nk="כִּתָּה">כיתה</span>
    </button>
    <button class="grade-btn" onclick="selectGrade('grade-2',this)">
      <span class="grade-letter">ב׳</span><span class="grade-sub" data-nk="כִּתָּה">כיתה</span>
    </button>
    <button class="grade-btn" onclick="selectGrade('grade-3',this)">
      <span class="grade-letter">ג׳</span><span class="grade-sub" data-nk="כִּתָּה">כיתה</span>
    </button>
    <button class="grade-btn" onclick="selectGrade('grade-4',this)">
      <span class="grade-letter">ד׳</span><span class="grade-sub" data-nk="כִּתָּה">כיתה</span>
    </button>
    <button class="grade-btn" onclick="selectGrade('grade-5',this)">
      <span class="grade-letter">ה׳</span><span class="grade-sub" data-nk="כִּתָּה">כיתה</span>
    </button>
    <button class="grade-btn" onclick="selectGrade('grade-6',this)">
      <span class="grade-letter">ו׳</span><span class="grade-sub" data-nk="כִּתָּה">כיתה</span>
    </button>
  </div>
</section>

<!-- ══ אונבורדינג — רמת קריאה ════════════════════════════════════ -->
<section id="screen-onboard-reading" class="screen">
  <div class="onboard-header">
    <div class="ob-back-row">
      <button class="ob-back-btn" onclick="showScreen('screen-onboard-grade')"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <p class="onboard-step" data-nk="שָׁלָב 2 מִתּוֹךְ 4">שלב 2 מתוך 4</p>
    </div>
    <div class="onboard-progress"><div class="onboard-fill" style="width:50%"></div></div>
  </div>
  <p class="onboard-question" data-nk="אֵיךְ אַתָּה/אַתְּ קוֹרֵא/ת?">איך אתה/את קורא/ת?</p>
  <div class="level-cards">
    <button class="level-card" onclick="selectReadingLevel('beginner',this)">
      <span class="level-icon">🌱</span>
      <div>
        <span class="level-label" data-nk="עִם עֶזְרָה">עם עזרה</span>
        <span class="level-desc" data-nk="עֲדַיִן לוֹמֵד/ת לִקְרוֹא">עדיין לומד/ת לקרוא</span>
      </div>
    </button>
    <button class="level-card" onclick="selectReadingLevel('intermediate',this)">
      <span class="level-icon">📖</span>
      <div>
        <span class="level-label" data-nk="קוֹרֵא/ת לְבַד">קורא/ת לבד</span>
        <span class="level-desc" data-nk="מִסְתַּדֵּר/ת בְּלִי עֶזְרָה">מסתדר/ת בלי עזרה</span>
      </div>
    </button>
    <button class="level-card" onclick="selectReadingLevel('advanced',this)">
      <span class="level-icon">🚀</span>
      <div>
        <span class="level-label" data-nk="שׁוֹטֵף/שׁוֹטֶפֶת">שוטף/שוטפת</span>
        <span class="level-desc" data-nk="קוֹרֵא/ת הַרְבֵּה וּמַהֵר">קורא/ת הרבה ומהר</span>
      </div>
    </button>
  </div>
</section>

<!-- ══ אונבורדינג — ניקוד ══════════════════════════════════════════ -->
<section id="screen-onboard-niqqud" class="screen">
  <div class="onboard-header">
    <div class="ob-back-row">
      <button class="ob-back-btn" onclick="showScreen('screen-onboard-reading')"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <p class="onboard-step" data-nk="שָׁלָב 3 מִתּוֹךְ 4">שלב 3 מתוך 4</p>
    </div>
    <div class="onboard-progress"><div class="onboard-fill" style="width:75%"></div></div>
  </div>
  <p class="onboard-question" data-nk="מָה עָדִיף לְךָ לִקְרוֹא?">מה עדיף לך לקרוא?</p>
  <!-- דוגמאות הניקוד עצמן (בְּרֵאשִׁית/בְּראשית/בראשית) לא מתויגות בכוונה — הן הבחירה
       עצמה (מלא/חלקי/ללא), לא טקסט ממשק שהוגן-הפעלה/כיבוי כלל-אפליקטיבי צריך לגעת בו -->
  <div class="niqqud-cards">
    <button class="niqqud-card" onclick="selectNiqqudLevel('full',this)">
      <span class="niqqud-example">בְּרֵאשִׁית</span>
      <span class="niqqud-label" data-nk="נִקּוּד מָלֵא">ניקוד מלא</span>
    </button>
    <button class="niqqud-card" onclick="selectNiqqudLevel('partial',this)">
      <span class="niqqud-example">בְּראשית</span>
      <span class="niqqud-label" data-nk="נִקּוּד חֶלְקִי">ניקוד חלקי</span>
    </button>
    <button class="niqqud-card" onclick="selectNiqqudLevel('none',this)">
      <span class="niqqud-example">בראשית</span>
      <span class="niqqud-label" data-nk="לְלֹא נִקּוּד">ללא ניקוד</span>
    </button>
  </div>
</section>

<!-- ══ אונבורדינג — תחומי עניין ══════════════════════════════════ -->
<section id="screen-onboard-interests" class="screen">
  <div class="onboard-header">
    <div class="ob-back-row">
      <button class="ob-back-btn" onclick="showScreen('screen-onboard-niqqud')"><span data-nk="חֲזָרָה">חזרה</span> →</button>
      <p class="onboard-step" data-nk="שָׁלָב 4 מִתּוֹךְ 4">שלב 4 מתוך 4</p>
    </div>
    <div class="onboard-progress"><div class="onboard-fill" style="width:100%"></div></div>
  </div>
  <p class="onboard-question"><span data-nk="מָה אַתָּה/אַתְּ אוֹהֵב/ת לִקְרוֹא?">מה אתה/את אוהב/ת לקרוא?</span> <small data-nk="(עַד 3)">(עד 3)</small></p>
  <div class="interests-grid">
    <button class="interest-card" onclick="toggleInterest('animals',this)">
      <span class="int-emoji">🐾</span><span class="int-label" data-nk="חַיּוֹת">חיות</span>
    </button>
    <button class="interest-card" onclick="toggleInterest('magic',this)">
      <span class="int-emoji">🔮</span><span class="int-label" data-nk="קֶסֶם">קסם</span>
    </button>
    <button class="interest-card" onclick="toggleInterest('royalty',this)">
      <span class="int-emoji">👑</span><span class="int-label" data-nk="נְסִיכוֹת וְגִבּוֹרִים">נסיכות וגיבורים</span>
    </button>
    <button class="interest-card" onclick="toggleInterest('adventure',this)">
      <span class="int-emoji">🌍</span><span class="int-label" data-nk="הַרְפַּתְקָאוֹת">הרפתקאות</span>
    </button>
    <button class="interest-card" onclick="toggleInterest('science',this)">
      <span class="int-emoji">🚀</span><span class="int-label" data-nk="מַדָּע וְחָלָל">מדע וחלל</span>
    </button>
    <button class="interest-card" onclick="toggleInterest('judaism',this)">
      <span class="int-emoji">✡️</span><span class="int-label" data-nk="יַהֲדוּת">יהדות</span>
    </button>
    <button class="interest-card" onclick="toggleInterest('nature',this)">
      <span class="int-emoji">🌳</span><span class="int-label" data-nk="טֶבַע">טבע</span>
    </button>
    <button class="interest-card" onclick="toggleInterest('folk',this)">
      <span class="int-emoji">🌊</span><span class="int-label" data-nk="סִפּוּרֵי עַם">סיפורי עם</span>
    </button>
  </div>
  <div style="padding:16px">
    <button id="btn-interests-next" class="btn-giant btn-green"
            onclick="finishInterests()" disabled><span data-nk="סִיּוּם">סיום</span> ⬅️</button>
  </div>
</section>

<!-- ══ אונבורדינג — סיום ══════════════════════════════════════════ -->
<section id="screen-onboard-complete" class="screen complete-full-screen">
  <div class="complete-new-content">
    <div class="complete-new-star animate-bounce">🌟</div>
    <h1 class="complete-new-title">כָּל הַכָּבוֹד!</h1>
    <p class="complete-new-sub"><span data-nk="בָּרוּךְ/בְּרוּכָה הַבָּא/הַבָּאָה לְבוּקִי,">ברוך/ה הבא/ה לבוקי,</span> <span id="complete-user-name"></span>!</p>
    <p class="complete-new-hint"><span data-nk="הַפְּרוֹפִיל שֶׁלְּךָ מוּכָן">הפרופיל שלך מוכן</span> 📚</p>
    <button class="btn-giant btn-white-on-purple" style="margin-top:28px"
            onclick="goHomeAfterOnboarding()">📖 <span data-nk="קָדִימָה לִקְרוֹא!">קדימה לקרוא!</span></button>
  </div>
</section>

<!-- Firebase SDK v10 (compat) — טוען לפני הקבצים שלנו -->
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
<!-- גרסה מרכזית לCache Busting — עדכן v= בכל פריסה -->
<script src="booki-character.js?v=3"></script>
<script src="niqud.js?v=4"></script>
<script src="firebase.js?v=2"></script>

<!-- Club System — חייבים לטעון לפני firebase-clubs.js -->
<script src="data-club-types.js?v=2"></script>
<script src="seed-clubs.js?v=3"></script>
<script src="firebase-clubs.js?v=20261004-parent-entry"></script>
<!-- Class story feature paused. Existing story data is retained. -->
<script src="firebase-shop.js?v=20260915-consistent-goal"></script>
<script src="firebase-messages.js?v=20260917-recommend"></script>
<script src="story-recommendations.js?v=20260918-library-modes"></script>
<script src="auth.js?v=7"></script>
<script src="analytics.js?v=2"></script>

<!-- נתוני ספרייה — חייבים לטעון לפני הסיפורים -->
<script src="data-libraries.js?v=1"></script>
<script src="data-categories.js?v=1"></script>

<!-- תוכן: קובץ נפרד לכל ספרייה (סדר הטעינה אינו חשוב) -->
<script src="content/stories-familiar.js?v=20260915-teacher-feedback"></script>
<script src="content/stories-original.js?v=20260916-noam"></script>
<script src="content/stories-long.js?v=20260915-editorial"></script>
<script src="content/stories-tanakh.js?v=20260915-editorial"></script>
<script src="content/stories-folk.js?v=1"></script>
<script src="content/stories-holidays.js?v=20260915-editorial"></script>
<script src="content/stories-school.js?v=20260915-editorial"></script>
<script src="content/stories-chazal.js?v=20260923-kosher"></script>
<script src="content/stories-science.js?v=1"></script>
<script src="content/stories-animals.js?v=1"></script>
<script src="content/stories-history.js?v=1"></script>
<script src="content/stories-adventure.js?v=1"></script>
<script src="content/stories-booki.js?v=1"></script>
<script src="content/stories-reading.js?v=1"></script>
<script src="content/stories-beginner.js?v=1"></script>
<script src="content/stories-one-word.js?v=20260913-first"></script>
<script src="content/stories-bookworms.js?v=20260915-editorial"></script>

<!-- אגרגטור + לוגיקה (חייבים לטעון אחרי כל קבצי content/) -->
<script src="stories.js?v=20260918-library-modes"></script>

<!-- Club System UI — routing, admin, onboarding -->
<script src="private-library.js?v=20260927-authoritative-teacher-folder"></script>
<script src="routing.js?v=20261004-parent-entry"></script>
<script src="admin-setup.js?v=20260915-capacity"></script>
<script src="onboarding.js?v=6"></script>

<script src="script.js?v=20261003-unified-child-library"></script>
<script src="booki-local-listening.js?v=5-yonatan"></script>
<script src="motivation.js?v=7"></script>
<script src="booki-home-magic.js?v=11"></script>
<script src="booki-reading.js?v=9"></script>
<script src="shop.js?v=20260916-reward-ideas"></script>
<script src="owner-dashboard.js?v=20261003-verified-reading-pulse"></script>
<script src="initial-setup.js?v=30261002-entry"></script>
<script src="student-profile.js?v=2"></script>

<!-- ══ Owner Dashboard (console only) ══════════════════════════════ -->
<section id="screen-owner-dashboard" class="screen od-screen">
  <div class="od-header">
    <div>
      <h2>📊 Owner Dashboard</h2>
      <p id="od-owner-name" style="font-size:.9rem;color:#888;margin:0"></p>
    </div>
    <span id="od-status" class="od-status"></span>
    <button class="btn-logout" onclick="teacherSignOut()">יציאה</button>
  </div>
  <div class="od-body">

    <div class="od-section">
      <div class="od-section-title">📊 KPI</div>
      <div class="od-grid">
        <div class="od-metric"><span class="od-val" id="od-total-teachers">—</span><span class="od-lbl">מורות</span></div>
        <button type="button" class="od-metric" onclick="_odBrowseClubs()" aria-label="צפייה במועדונים ובתלמידים" style="font:inherit;color:inherit;cursor:pointer"><span class="od-val" id="od-total-clubs">—</span><span class="od-lbl">מועדונים</span></button>
        <button type="button" class="od-metric" onclick="_odBrowseClubs()" aria-label="צפייה במועדונים ובתלמידים" style="font:inherit;color:inherit;cursor:pointer"><span class="od-val" id="od-total-students">—</span><span class="od-lbl">תלמידים</span></button>
        <div class="od-metric"><span class="od-val" id="od-total-minutes">—</span><span class="od-lbl">דקות קריאה</span></div>
      </div>
    </div>

    <div class="od-section">
      <div class="od-section-title">📅 היום</div>
      <div class="od-grid">
        <div class="od-metric"><span class="od-val" id="od-opens-today">—</span><span class="od-lbl">פתיחות</span></div>
        <div class="od-metric"><span class="od-val" id="od-sessions-today">—</span><span class="od-lbl">סשני קריאה</span></div>
        <div class="od-metric"><span class="od-val" id="od-dau-today">—</span><span class="od-lbl">פעילים היום</span></div>
        <div class="od-metric"><span class="od-val" id="od-wau">—</span><span class="od-lbl">פעילים 7 ימים</span></div>
      </div>
    </div>

    <div class="od-section od-reading-pulse">
      <div class="od-section-title">📖 קראו ב־7 הימים האחרונים</div>
      <p class="od-coverage">שמות ואייקונים אמיתיים מכרטיסי הילדים · מסודר לפי הקריאה האחרונה</p>
      <div id="od-active-readers-7d"><div class="od-empty">טוען...</div></div>
    </div>

    <div class="od-section">
      <div class="od-section-title">👩‍🏫 רשימת מורות</div>
      <div id="od-teachers-list"><div class="od-empty">טוען...</div></div>
    </div>

    <div class="od-section">
      <div class="od-section-title">🌳 כל המועדונים</div>
      <div id="od-clubs-list"><div class="od-empty">טוען...</div></div>
    </div>

    <div class="od-section" id="od-repair-section" style="display:none">
      <div class="od-section-title">🔧 תיקון כרטיסים — <span id="od-repair-club-name"></span></div>
      <div id="od-repair-content"><div class="od-empty">סורק...</div></div>
      <button class="od-btn-sm" style="margin-top:1rem" onclick="document.getElementById('od-repair-section').style.display='none'">✕ סגור</button>
    </div>

    <div class="od-section">
      <div class="od-section-title">🗂️ מועדוני מערכת / ישנים</div>
      <p style="font-size:.8rem;color:#888;margin:.3rem 0 .8rem">מועדונים Bootstrap — נתונים נשמרים, אפשר להסתיר או לשייך.</p>
      <div id="od-system-clubs"><div class="od-empty">טוען...</div></div>
    </div>

    <div class="od-section">
      <div class="od-section-title">⭐ סיפורים פופולריים</div>
      <div id="od-top-stories"><div class="od-empty">טוען...</div></div>
    </div>

    <div class="od-section">
      <div class="od-section-title">🚨 שגיאות אחרונות</div>
      <div id="od-errors"><div class="od-empty">טוען...</div></div>
    </div>

    <div style="display:none">
      <span id="od-total-users"></span>
      <span id="od-total-sessions"></span>
      <span id="od-new-today"></span>
      <span id="od-joins-today"></span>
    </div>

    <button class="od-refresh" onclick="_odLoad()">🔄 רענן נתונים</button>

    <div class="od-section od-danger-zone">
      <div class="od-section-title" style="color:#c0392b">⚠️ Danger Zone</div>
      <p style="font-size:.82rem;color:#666;margin:.4rem 0 .9rem">
        מוחק את כל נתוני הבדיקה של Booki.<br>
        <strong>לא נוגע ב-Legacy ("מיתרים כיתה א'")</strong>.
      </p>
      <button id="btn-dev-reset" class="btn-dev-reset" onclick="devReset()">🗑️ Developer Reset</button>
    </div>
  </div>
</section>

<!-- ══ Tab Bar — 2 עוגני ניווט ════════════════════════════════════ -->
<nav id="booki-nav" class="booki-nav" data-tab="" aria-label="ניווט ראשי">
  <button class="booki-tab" data-for="home" onclick="goReaderHome()">
    <span class="btab-icon">🏠</span>
    <span class="btab-label" data-nk="בַּיִת">בית</span>
  </button>
  <button class="booki-tab" data-for="card" onclick="showReaderCard()">
    <span class="btab-icon">👤</span>
    <span class="btab-label" data-nk="הַכַּרְטִיס שֶׁלִּי">הכרטיס שלי</span>
  </button>
  <button id="nav-tab-class" class="booki-tab" data-for="class" onclick="showClassLibrary()" style="display:none">
    <span class="btab-icon">🌳</span>
    <span class="btab-label" data-nk="הַכִּתָּה שֶׁלִּי">הכיתה שלי</span>
  </button>
</nav>

<!-- כפתור דיווח באג — קבוע בכל מסך -->
<button id="btn-bug-report" class="btn-bug-report" onclick="openBugReport()">
  🐞 <span id="bug-report-label">משהו לא עובד?</span>
</button>

<!-- כפתור הנגשת ניקוד — קבוע בכל מסך, מחליף טקסט מתויג (data-nk) בין רגיל למנוקד.
     האייקון הוא שלושה סימני ניקוד עצמם (קמץ/פתח/צירה על א׳) ולא המילה "ניקוד" —
     ברור-מטרה גם למי שעדיין לא קורא שוטף. -->
<button id="btn-niqud-toggle" class="btn-niqud-toggle" onclick="toggleNiqud()" title="הפעלה/כיבוי ניקוד" aria-label="הפעלה/כיבוי ניקוד">
  <span class="niqud-toggle-marks">אָ אַ אֵ</span>
</button>

<!-- קרדיט -->
<div class="app-copyright">© כל הזכויות שמורות ליהודית עמוס</div>

<script src="teacher-child-demo.js?v=20260915-single-tree"></script>
<script src="child-choice.js?v=20260918-live-topics"></script>
<script src="child-library-topics.js?v=20260918-live-topics"></script>
<script src="child-library.js?v=20261002-kosher-folder"></script>
<script src="device-access.js?v=20261001"></script>
</body>
</html>











