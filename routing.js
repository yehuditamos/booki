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

    // כרטיס שנוצר ע"י מורה — ה-cardId הוא המזהה היציב, לא Firebase Auth UID
    const isPreCreated = reader.createdByTeacher === true;
    const userId = isPreCreated ? reader.userId : (authUid || reader.userId);

    if (!isPreCreated && authUid && authUid !== reader.userId) {
      // ה-session שוחזר/נוצר עם UID שונה מהשמור — מסנכרנים את localStorage
      setActiveReader({ ...reader, userId: authUid });
      localStorage.setItem('booki_tmp_uid', authUid);
    }

    _enterPersonalHome(userId, isPreCreated ? { ...reader, personalizationComplete: true } : reader);
    return;
  }

  // לא מחובר — מסך פתיחה
  _updateSplashForRole();
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
  else { _updateSplashForRole(); showScreen('screen-splash'); }
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
  setNavVisible(true);
  setNavTab('reader');
  showScreen('screen-who-reads');

  if (!effectiveClubId) {
    // אין מועדון מזוהה — חזרה למסך הכניסה במקום הצגת כל הרשימה הישנה
    showScreen('screen-splash');
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
  // עדכון הפוטר: לא "כנס עם קוד" אלא "לא מצאת שם?"
  const footer = document.querySelector('#screen-who-reads .who-reads-footer');
  if (footer) footer.innerHTML = `<p class="who-reads-not-found">לא מצאת את השם שלך? 📩 בקש/י מהמורה להוסיף אותך למועדון.</p>`;

  const active = memberships.filter(m => m.status !== 'left');
  if (!active.length) {
    grid.innerHTML = `<div class="who-reads-empty"><p>עוד אין קוראים במועדון</p></div>`;
    return;
  }
  grid.innerHTML = active.map(m => `
    <button class="profile-card" data-user-id="${m.userId}" onclick="selectProfile('${m.userId}', '${clubId}')">
      <span class="profile-avatar">${m.emoji || m.avatar || '📚'}</span>
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
  const targetClubId = clubIdHint || null;

  // טוען פרופיל + membership במקביל — membership נדרש לזיהוי createdByTeacher
  const [profile, membership] = await Promise.all([
    typeof fbLoadUserProfile   === 'function' ? fbLoadUserProfile(userId)                        : Promise.resolve(null),
    targetClubId && typeof fbLoadClubMembership === 'function'
      ? fbLoadClubMembership(targetClubId, userId) : Promise.resolve(null),
  ]);

  // ── כרטיסי תלמיד שנוצרו ע"י מורה ────────────────────────────────────────
  if (membership?.createdByTeacher) {
    await (typeof ensureStudentAuth === 'function' ? ensureStudentAuth() : Promise.resolve());
    const authUser = (typeof firebase !== 'undefined' && firebase.auth)
      ? firebase.auth().currentUser : null;

    // כרטיס כבר נתבע ע"י מישהו אחר
    if (membership.claimedByUid && membership.claimedByUid !== authUser?.uid) {
      _showCardClaimedError();
      return;
    }

    _activeClubId        = targetClubId;
    window.currentClubId = targetClubId;

    if (!membership.personalized) {
      showMiniPersonalization(userId, targetClubId, membership.name || userId);
      return;
    }

    // כבר personalized — כנס ישירות
    _enterPersonalHome(userId, {
      name:                    membership.name  || userId,
      emoji:                   membership.emoji || '📚',
      personalizationComplete: true,
      createdByTeacher:        true,
    });
    return;
  }

  // ── תלמיד רגיל ───────────────────────────────────────────────────────────
  if (profile?.onboardingComplete && targetClubId) {
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

function _enterPersonalHome(userId, profile) {
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
  setActiveReader({ userId, clubId: _activeClubId, name: studentData.name, emoji: studentData.emoji, createdByTeacher: !!profile?.createdByTeacher });
  showScreen('screen-main');
  _updateBugLabel();

  const clubBtn = document.getElementById('btn-switch-club');
  if (clubBtn) clubBtn.style.display = _activeClubId ? '' : 'none';

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
  else { _updateSplashForRole(); showScreen('screen-splash'); }
}

function goBackToJoinEntry() {
  showScreen('screen-join-entry');
}

// ─── כלי פיתוח (קונסול) ──────────────────────────────────────────────────────

/** window.resetBookiDevice() — מנקה localStorage ומחזיר ל-screen-splash */
window.resetBookiDevice = function() {
  clearDeviceLocalCache();
  console.log('[booki] ✅ resetBookiDevice — המכשיר אופס. מחזיר ל-splash...');
  showScreen('screen-splash');
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

const _MINI_PERSON_EMOJIS = ['📚','🌟','⭐','🎨','🌈','🦋','🐬','🦁','🌸','🚀','🎵','🍎'];
let _miniPersonState   = null;
let _miniSelectedEmoji = '📚';

function showMiniPersonalization(userId, clubId, name) {
  _miniPersonState   = { userId, clubId, name };
  _miniSelectedEmoji = '📚';

  const h2El   = document.querySelector('.who-reads-title');
  const subEl  = document.getElementById('who-reads-club-name');
  const grid   = document.getElementById('who-reads-grid');
  const footer = document.querySelector('#screen-who-reads .who-reads-footer');

  if (h2El)   h2El.textContent  = `שלום, ${name}! 👋`;
  if (subEl)  subEl.textContent = 'בחר/י אמוג׳י שמייצג אותך:';
  if (footer) footer.innerHTML  = '';

  if (grid) grid.innerHTML = `
    <div class="mini-person-card">
      <div class="mini-person-emojis">
        ${_MINI_PERSON_EMOJIS.map(e =>
          `<button class="mini-emoji-btn${e === '📚' ? ' selected' : ''}"
                   data-emoji="${e}"
                   onclick="selectMiniEmoji(this,'${e}')">${e}</button>`
        ).join('')}
      </div>
      <p id="mini-person-error" class="auth-error" style="display:none"></p>
      <button id="btn-mini-person-save" class="btn-giant btn-green"
              style="margin:24px auto 0;display:block;max-width:240px"
              onclick="submitMiniPersonalization()">נכנסים לקרוא ⬅️</button>
    </div>`;

  showScreen('screen-who-reads');
}

function selectMiniEmoji(btn, emoji) {
  document.querySelectorAll('.mini-emoji-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  _miniSelectedEmoji = emoji;
}

async function submitMiniPersonalization() {
  const state = _miniPersonState;
  if (!state) return;
  const { userId, clubId, name } = state;
  const emoji = _miniSelectedEmoji || '📚';
  const btn   = document.getElementById('btn-mini-person-save');
  const errEl = document.getElementById('mini-person-error');

  if (btn)   { btn.disabled = true; btn.textContent = 'שומר...'; }
  if (errEl) { errEl.style.display = 'none'; }

  const authUser = (typeof firebase !== 'undefined' && firebase.auth)
    ? firebase.auth().currentUser : null;
  if (!authUser) {
    if (errEl) { errEl.textContent = 'שגיאת חיבור — נסה/י שוב'; errEl.style.display = ''; }
    if (btn)   { btn.disabled = false; btn.textContent = 'נכנסים לקרוא ⬅️'; }
    return;
  }

  try {
    const now = new Date().toISOString();
    await window.db.collection('clubs').doc(clubId)
      .collection('memberships').doc(userId)
      .set({
        claimedByUid: authUser.uid,
        personalized: true,
        emoji,
        firstLoginAt: now,
        updatedAt:    now,
      }, { merge: true });

    _miniPersonState = null;
    _enterPersonalHome(userId, { name, emoji, personalizationComplete: true, createdByTeacher: true });

  } catch (e) {
    console.error('[mini-person] submitMiniPersonalization error:', e);
    const msg = e.code === 'permission-denied'
      ? 'הכרטיס נתבע ע"י מישהו אחר — פנה/י למורה'
      : 'שגיאה — נסה/י שוב';
    if (errEl) { errEl.textContent = msg; errEl.style.display = ''; }
    if (btn)   { btn.disabled = false; btn.textContent = 'נכנסים לקרוא ⬅️'; }
  }
}

function _showCardClaimedError() {
  const h2El   = document.querySelector('.who-reads-title');
  const subEl  = document.getElementById('who-reads-club-name');
  const grid   = document.getElementById('who-reads-grid');
  const footer = document.querySelector('#screen-who-reads .who-reads-footer');
  if (h2El)   h2El.textContent = '⚠️';
  if (subEl)  subEl.textContent = '';
  if (footer) footer.innerHTML = '';
  if (grid)   grid.innerHTML   = `<div class="who-reads-hidden">
    <p>הכרטיס הזה שייך למישהו אחר.</p>
    <p>פנה/י למורה לסיוע.</p>
  </div>`;
  showScreen('screen-who-reads');
}

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
    <div class="teacher-club-card" role="button" tabindex="0"
         onclick="enterTeacherClub('${c.id}')"
         onkeydown="if(event.key==='Enter')enterTeacherClub('${c.id}')">
      <span class="tc-emoji">${c.emoji || '📚'}</span>
      <div class="tc-info">
        <span class="tc-name">${c.name || c.id}</span>
        <span class="tc-meta" data-member-count="${c.id}">👥 ...</span>
      </div>
      <div class="tc-actions" onclick="event.stopPropagation()">
        <button class="btn-tc-delete" title="מחק מועדון"
                onclick="confirmDeleteClub('${c.id}','${(c.name || c.id).replace(/'/g, "\\'")}')">🗑</button>
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
  _updateBugLabel();
  _showTeacherClub(clubId);
}

async function _showTeacherClub(clubId) {
  showScreen('screen-teacher-club');
  const nameEl  = document.getElementById('tc-club-name');
  const emojiEl = document.getElementById('tc-club-emoji');
  if (nameEl)  nameEl.textContent  = '...';
  if (emojiEl) emojiEl.textContent = '';
  const club = typeof fbLoadClub === 'function' ? await fbLoadClub(clubId) : null;
  if (nameEl)  nameEl.textContent  = club?.name  || clubId;
  if (emojiEl) emojiEl.textContent = club?.emoji || '📚';
}

function enterReadingSession() {
  if (_activeClubId && typeof showWhoReads === 'function') showWhoReads(_activeClubId);
}

// ─── Teacher Class Screen ─────────────────────────────────────────────────────

function _classGoBack() {
  showScreen(window._classReturnScreen || 'screen-main');
}

function _goBackToTeacherDashboard() {
  showScreen('screen-teacher-dashboard');
}

function _goBackFromWhoReads() {
  if (window._currentTeacher) showScreen('screen-teacher-club');
  else goClubs();
}

async function showTeacherClassScreen() {
  const clubId = _activeClubId;
  if (!clubId) return;

  window._classReturnScreen = 'screen-teacher-club';
  const titleEl = document.getElementById('class-screen-title');
  if (titleEl) titleEl.textContent = '👨‍👩‍👧‍👦 הכיתה שלנו';

  const contentEl = document.getElementById('class-content');
  if (contentEl) contentEl.innerHTML = '<p class="class-loading">טוען נתוני כיתה...</p>';
  showScreen('screen-class');

  const [club, memberships] = await Promise.all([
    typeof fbLoadClub === 'function'            ? fbLoadClub(clubId)            : Promise.resolve(null),
    typeof fbLoadClubMemberships === 'function' ? fbLoadClubMemberships(clubId) : Promise.resolve([]),
  ]);

  _renderTeacherClassContent(club, memberships, clubId);
}

function _renderTeacherClassContent(club, memberships, clubId) {
  const content = document.getElementById('class-content');
  if (!content) return;

  const goalTarget = club?.goal?.target || 1500;
  const now        = new Date();
  const active     = memberships.filter(m => m.status !== 'left');
  const sorted     = [...active].sort((a, b) =>
    (b.cachedStats?.totalMinutes || 0) - (a.cachedStats?.totalMinutes || 0));
  const totalMins  = active.reduce((s, m) => s + (m.cachedStats?.totalMinutes || 0), 0);
  const pct        = Math.min(100, Math.round((totalMins / goalTarget) * 100));

  const readersThisWeek = active.filter(m => {
    const lastAt = m.cachedStats?.lastReadAt;
    return lastAt && (now - new Date(lastAt)) / 864e5 <= 7;
  }).length;

  const posIcons = ['🥇', '🥈', '🥉'];

  const membersHtml = sorted.length
    ? sorted.map((m, i) => {
        const avatar  = m.emoji || m.avatar || '📚';
        const name    = m.name  || m.userId || '—';
        const mins    = Math.round(m.cachedStats?.totalMinutes || 0);
        const lastAt  = m.cachedStats?.lastReadAt;
        let dot = '⚪', lastStr = 'טרם קרא/ה';
        if (lastAt) {
          const days = Math.floor((now - new Date(lastAt)) / 864e5);
          dot = days <= 7 ? '🟢' : days <= 30 ? '🟡' : '🔴';
          lastStr = days === 0 ? 'היום'
            : days === 1   ? 'אתמול'
            : days <= 7    ? `לפני ${days} ימים`
            : days <= 30   ? `לפני ${Math.floor(days / 7)} שבועות`
            : `לפני ${Math.floor(days / 30)} חודשים`;
        }
        const podium = ['tcd-gold','tcd-silver','tcd-bronze'][i] || '';
        const safeName = name.replace(/'/g, "\\'");
        return `
          <div class="tcd-member-row ${podium}">
            <span class="tcd-m-pos">${posIcons[i] || (i + 1)}</span>
            <span class="tcd-m-avatar">${avatar}</span>
            <div class="tcd-m-info">
              <span class="tcd-m-name">${name}</span>
              <span class="tcd-m-last">${dot} ${lastStr}</span>
            </div>
            <div class="tcd-m-stat">
              <strong class="tcd-m-mins">${mins}</strong>
              <span class="tcd-m-lbl">דק'</span>
            </div>
            <button class="tcd-m-delete" onclick="removeClubMember('${clubId}','${m.userId}','${safeName}')" title="הסר מהמועדון">🗑️</button>
          </div>`;
      }).join('')
    : '<p class="class-empty">אין חברים פעילים במועדון 📚</p>';

  content.innerHTML = `
    <div class="tcd-stats-row">
      <div class="tcd-stat-card">
        <span class="tcd-stat-icon">👥</span>
        <strong class="tcd-stat-num">${active.length}</strong>
        <span class="tcd-stat-lbl">חברים</span>
      </div>
      <div class="tcd-stat-card">
        <span class="tcd-stat-icon">⏱️</span>
        <strong class="tcd-stat-num">${Math.round(totalMins)}</strong>
        <span class="tcd-stat-lbl">דקות קריאה</span>
      </div>
      <div class="tcd-stat-card">
        <span class="tcd-stat-icon">🟢</span>
        <strong class="tcd-stat-num">${readersThisWeek}</strong>
        <span class="tcd-stat-lbl">קראו השבוע</span>
      </div>
    </div>
    <div class="tcd-goal-card">
      <div class="tcd-goal-header">
        <span class="tcd-goal-label">🎯 יעד הכיתה</span>
        <button class="btn-edit-goal" onclick="editClubGoal('${clubId}',${goalTarget})">✏️ ערוך</button>
      </div>
      <div class="tcd-goal-nums">
        <span class="tcd-goal-done">${Math.round(totalMins)}</span>
        <span class="tcd-goal-sep"> / </span>
        <span class="tcd-goal-target">${goalTarget} דק'</span>
      </div>
      <div class="tcd-progress-track">
        <div class="tcd-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="tcd-goal-pct">${pct}% הושלמו</div>
    </div>
    <div class="tcd-leaderboard">
      <h3 class="tcd-lb-title">🏆 טבלת הקוראים</h3>
      ${membersHtml}
    </div>`;
}

async function showClubStudents() {
  const clubId = _activeClubId;
  if (!clubId) return;

  window._returnToClubStudents = true;

  const grid  = document.getElementById('club-students-grid');
  const subEl = document.getElementById('club-students-name');

  if (grid)  grid.innerHTML = '<div style="text-align:center;padding:2rem;font-size:2rem">⏳</div>';
  if (subEl) subEl.textContent = '';
  showScreen('screen-club-students');

  const [club, memberships] = await Promise.all([
    typeof fbLoadClub            === 'function' ? fbLoadClub(clubId)            : Promise.resolve(null),
    typeof fbLoadClubMemberships === 'function' ? fbLoadClubMemberships(clubId) : Promise.resolve([]),
  ]);

  if (subEl && club?.name) subEl.textContent = club.name;

  const active = memberships.filter(m => m.status !== 'left');

  if (!active.length) {
    if (grid) grid.innerHTML = '<div class="who-reads-empty"><p>עדיין אין תלמידים במועדון זה.</p></div>';
  } else {
    if (grid) _renderFirebaseMemberGrid(grid, active, clubId);
  }

  // כפתור הוספת תלמיד — גלוי למורה בלבד
  const addSection = document.getElementById('add-student-section');
  const clubNameEl = document.getElementById('add-student-club-name');
  const addForm    = document.getElementById('add-student-form');
  const isTeacher  = !!window._currentTeacher;
  if (addSection) addSection.style.display = isTeacher ? '' : 'none';
  if (clubNameEl) clubNameEl.textContent   = club?.name || clubId;
  if (addForm)    addForm.style.display    = 'none';

  // מדגיש כרטיס שנוסף זה עתה
  if (_pendingHighlightUserId && grid) {
    const newCard = grid.querySelector(`[data-user-id="${_pendingHighlightUserId}"]`);
    if (newCard) {
      newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      newCard.classList.add('card-new-highlight');
      setTimeout(() => newCard.classList.remove('card-new-highlight'), 2500);
    }
    _pendingHighlightUserId = null;
  }
}

// ─── Teacher: הוספת תלמיד חסר ────────────────────────────────────────────────

function toggleAddStudentForm() {
  const form = document.getElementById('add-student-form');
  if (!form) return;
  const isOpen = form.style.display !== 'none';
  form.style.display = isOpen ? 'none' : '';
  if (!isOpen) {
    const nameInput = document.getElementById('add-student-name-input');
    if (nameInput) { nameInput.value = ''; nameInput.focus(); }
    const errEl = document.getElementById('add-student-error');
    if (errEl)  errEl.style.display = 'none';
  }
}

async function submitAddStudent() {
  const clubId    = _activeClubId;
  const nameInput = document.getElementById('add-student-name-input');
  const btn       = document.getElementById('btn-add-student-save');
  const errEl     = document.getElementById('add-student-error');
  const name      = (nameInput?.value || '').trim();

  if (errEl) errEl.style.display = 'none';

  if (!name) {
    if (errEl) { errEl.textContent = 'נא להזין שם תלמיד/ה'; errEl.style.display = ''; }
    return;
  }
  if (!clubId) {
    if (errEl) { errEl.textContent = 'שגיאה: אין מועדון פעיל'; errEl.style.display = ''; }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'שומר...'; }

  const result = typeof fbTeacherAddStudent === 'function'
    ? await fbTeacherAddStudent(clubId, { name })
    : { ok: false, reason: 'no-function' };

  if (btn) { btn.disabled = false; btn.textContent = 'שמור תלמיד'; }

  if (!result.ok) {
    let msg = 'שגיאה — נסה/י שוב';
    if (result.reason === 'duplicate-name') msg = `תלמיד/ה בשם "${name}" כבר קיים/ת במועדון`;
    if (result.reason === 'permission')     msg = 'אין הרשאה — ודאי שאת מחוברת כמורה';
    if (errEl) { errEl.textContent = msg; errEl.style.display = ''; }
    return;
  }

  // הצלחה — סגור פורם, רענן רשימה עם הדגשת הכרטיס החדש
  if (nameInput) nameInput.value = '';
  const form = document.getElementById('add-student-form');
  if (form) form.style.display = 'none';
  _pendingHighlightUserId = result.userId;
  showClubStudents();
}

async function removeClubMember(clubId, userId, name) {
  if (!confirm(`להסיר את ${name} מהמועדון?\nהפעולה אינה הפיכה.`)) return;
  if (typeof fbRemoveClubMember !== 'function') return;
  const ok = await fbRemoveClubMember(clubId, userId);
  if (!ok) { alert('שגיאה בהסרה — נסה/י שוב'); return; }
  showTeacherClassScreen();
}

async function editClubGoal(clubId, currentTarget) {
  const raw = prompt(`יעד קריאה חדש (דקות):\nנוכחי: ${currentTarget}`, currentTarget);
  if (!raw || isNaN(Number(raw)) || Number(raw) <= 0) return;
  const target = Math.round(Number(raw));
  if (typeof fbSaveClub === 'function') {
    await fbSaveClub(clubId, { goal: { type: 'minutes', target, period: 'year' } });
  }
  showTeacherClassScreen();
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
  routeOnLoad, dismissWelcome, openBugReport,
  showWhoReads, showClubDashboard, enterReadingFromDashboard,
  // Profile selection
  selectProfile, selectLegacyProfile,
  // Club selection
  goClubs, pickClub,
  // Nav
  setNavVisible, setNavTab, goHome, goWhoReads, switchReader, switchReaderInClub, clearClubContext,
  goBackFromJoin, goBackToJoinEntry, goBackFromClubSelect,
  startReading,
  // Teacher
  showTeacherDashboard, enterTeacherClub, goToTeacherArea, confirmDeleteClub,
  showClubStudents, goBackToClubStudents,
  enterReadingSession, showTeacherClassScreen, editClubGoal, removeClubMember,
  toggleAddStudentForm, submitAddStudent,
  _classGoBack, _goBackToTeacherDashboard, _goBackFromWhoReads,
  _updateSplashForRole,
  // Mini personalization (כרטיסי pre_)
  showMiniPersonalization, selectMiniEmoji, submitMiniPersonalization,
});
