/**
 * onboarding.js — Join Flow + Member Onboarding
 *
 * screen-join-entry → screen-join-welcome → screen-onboard-grade →
 * screen-onboard-reading → screen-onboard-niqqud → screen-onboard-interests →
 * screen-onboard-complete → (back to) screen-who-reads
 */

let _ob = {
  userId: null, name: '', clubId: null,
  grade: null, readingLevel: null, niqqudLevel: null, interests: [],
};
let _pendingInv    = null;  // invitation validated but not yet claimed
let _pendingClubId = null;  // direct join via ?club= link

// ─── Join Entry ───────────────────────────────────────────────────────────────

function showJoinClub() {
  if (typeof track === 'function') track('join_club_started');
  // Pre-authenticate anonymously so auth is ready before name submission
  if (typeof ensureStudentAuth === 'function') ensureStudentAuth().catch(() => {});
  _renderSeedClubs();
  const input = document.getElementById('join-code-input');
  if (input) input.value = '';
  const err = document.getElementById('join-error-msg');
  if (err) err.textContent = '';
  _pendingInv = null;
  showScreen('screen-join-entry');
}

/** נקרא מ-routing.js כש-URL מכיל ?club=CLUB_ID */
function showJoinClubDirect(clubId) {
  _pendingClubId = clubId;
  _pendingInv    = null;
  // מציגים ישירות את רשימת חברי המועדון — הרשימה היא נקודת הכניסה
  if (typeof showWhoReads === 'function') showWhoReads(clubId);
}

/** נקרא מ-routing.js כש-URL מכיל ?join=CODE */
function showJoinClubWithCode(code) {
  showJoinClub();
  const inp = document.getElementById('join-code-input');
  if (inp) inp.value = code.toUpperCase().slice(0, 6);
  setTimeout(submitJoinCode, 80);
}

function _renderSeedClubs() {
  const list = document.getElementById('existing-clubs-list');
  if (!list) return;
  const seeds = (typeof BOOTSTRAP_CLUBS !== 'undefined') ? BOOTSTRAP_CLUBS : [];
  if (!seeds.length) { list.innerHTML = ''; return; }
  list.innerHTML = seeds.map(s => {
    const typeLabel = (typeof CLUB_TYPE_DEFAULTS !== 'undefined')
      ? (CLUB_TYPE_DEFAULTS[s.type]?.label ?? s.type) : s.type;
    return `
      <button class="existing-club-card" onclick="joinSeedClub('${s.id}')">
        <span class="exc-emoji">${s.emoji}</span>
        <div class="exc-info">
          <span class="exc-name">${s.name}</span>
          <span class="exc-type">${typeLabel}</span>
        </div>
        <span class="exc-arrow">←</span>
      </button>`;
  }).join('');
}

function joinSeedClub(clubId) {
  const seed = (typeof getBootstrapClubById === 'function')
    ? getBootstrapClubById(clubId) : null;
  if (seed && typeof addDeviceClub === 'function') {
    addDeviceClub({ clubId: seed.id, type: seed.type, name: seed.name, emoji: seed.emoji });
  }
  if (typeof showWhoReads === 'function') showWhoReads(clubId);
}

// ─── Code Submission ──────────────────────────────────────────────────────────

function handleCodeKeydown(e) { if (e.key === 'Enter') submitJoinCode(); }

async function submitJoinCode() {
  const raw = (document.getElementById('join-code-input')?.value || '').trim().toUpperCase();
  const err = document.getElementById('join-error-msg');
  const btn = document.getElementById('btn-join-code');

  if (err) err.textContent = '';
  if (raw.length < 4) {
    if (err) err.textContent = 'נא להזין קוד בן 6 תווים';
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'בודק...'; }

  if (typeof fbLoadInvitation !== 'function') {
    if (err) err.textContent = 'המערכת לא מוכנה — נסה שוב';
    if (btn) { btn.disabled = false; btn.textContent = 'כניסה'; }
    return;
  }

  const inv = await fbLoadInvitation(raw);
  if (btn) { btn.disabled = false; btn.textContent = 'כניסה'; }

  if (!inv) {
    if (err) err.textContent = 'הקוד לא נמצא — בדוק/י שוב';
    return;
  }
  if (inv.status !== 'pending') {
    if (err) err.textContent = 'הקוד אינו בתוקף';
    return;
  }
  if (inv.maxUses !== null && inv.usedCount >= inv.maxUses) {
    if (err) err.textContent = 'קוד זה כבר שומש';
    return;
  }

  _pendingInv = inv;

  // אם המשתמש כבר חבר במועדון — כנס ישירות (בדיקה ב-Firebase)
  const uid = localStorage.getItem('booki_tmp_uid');
  if (uid) {
    const existing = typeof fbLoadClubMembership === 'function'
      ? await fbLoadClubMembership(inv.clubId, uid) : null;
    if (existing) {
      if (typeof showWhoReads === 'function') showWhoReads(inv.clubId);
      return;
    }
  }

  // קוד אישי (targetName קיים) — כנס מיד
  if (inv.targetName) {
    await _doJoin(inv.clubId, inv.targetName, inv.code);
    return;
  }

  // קוד מועדון — מציגים חברי המועדון (הרשימה היא נקודת הכניסה)
  _pendingClubId = inv.clubId;
  if (typeof showWhoReads === 'function') showWhoReads(inv.clubId);
}

async function _showNameEntry(inv) {
  const emojiEl = document.getElementById('join-club-emoji-display');
  const nameEl  = document.getElementById('join-club-name-display');
  if (emojiEl) emojiEl.textContent = '';
  if (nameEl)  nameEl.textContent  = inv.clubId;

  // מקומי (מהיר)
  if (typeof getDeviceClubs === 'function') {
    const local = getDeviceClubs().find(c => c.clubId === inv.clubId);
    if (local) {
      if (emojiEl) emojiEl.textContent = local.emoji ?? '';
      if (nameEl)  nameEl.textContent  = local.name  ?? inv.clubId;
    }
  }

  // Firebase (זהה לזרימת הקישור)
  if (typeof fbLoadClub === 'function') {
    const club = await fbLoadClub(inv.clubId);
    if (club) {
      if (emojiEl) emojiEl.textContent = club.emoji ?? emojiEl.textContent;
      if (nameEl)  nameEl.textContent  = club.name  ?? nameEl.textContent;
    }
  }

  const input = document.getElementById('join-name-input');
  if (input) { input.value = ''; input.focus(); }
  const nameErr = document.getElementById('join-name-error');
  if (nameErr) nameErr.textContent = '';
  showScreen('screen-join-name');
}

function handleNameKeydown(e) { if (e.key === 'Enter') submitJoinName(); }

async function submitJoinName() {
  const name    = (document.getElementById('join-name-input')?.value || '').trim();
  const nameErr = document.getElementById('join-name-error');
  const btn     = document.getElementById('btn-join-name');

  if (nameErr) nameErr.textContent = '';
  if (!name || name.length < 2) {
    if (nameErr) nameErr.textContent = 'נא להזין שם (לפחות 2 תווים)';
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'מצטרף/ת...'; }
  if (_pendingInv) {
    await _doJoin(_pendingInv.clubId, name, _pendingInv.code);
  } else if (_pendingClubId) {
    await _doJoin(_pendingClubId, name);
  }
  if (btn) { btn.disabled = false; btn.textContent = 'מצטרף/ת ⬅️'; }
}

async function _doJoin(clubId, name, invitationCode = null) {
  // שלב 1: אימות — חובה לפני הכל
  const userId = (typeof ensureStudentAuth === 'function')
    ? await ensureStudentAuth()
    : (localStorage.getItem('booki_tmp_uid') || ('user_' + Math.random().toString(36).slice(2, 11)));
  const errEl = document.getElementById('join-name-error') || document.getElementById('join-error-msg');
  if (!userId) {
    console.error('[_doJoin] ensureStudentAuth returned null — Anonymous Auth may be disabled');
    if (errEl) errEl.textContent = 'שגיאה בהתחברות — אנא בדוק/י חיבור לאינטרנט';
    return;
  }

  // Verify Firebase Auth state matches the returned userId
  const authUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
  if (!authUser || authUser.uid !== userId) {
    console.error('[_doJoin] Auth mismatch:', { authUid: authUser?.uid, userId });
    if (errEl) errEl.textContent = 'שגיאה באימות — אנא רענן/י את הדף ונסה/י שוב';
    return;
  }

  localStorage.setItem('booki_tmp_uid', userId);

  // שלב 2: תביעת / יצירת חברות — חובה לפני מעבר
  if (invitationCode) {
    const result = typeof fbClaimInvitation === 'function'
      ? await fbClaimInvitation(invitationCode, userId)
      : { success: false };
    if (!result.success) {
      const reason = result.reason;
      if (errEl) errEl.textContent = reason === 'membership-error'
        ? 'שגיאת הרשאות — ייתכן שהאימות האנונימי אינו מופעל ב-Firebase'
        : 'שגיאה בהתחברות — נסה/י שוב';
      return;
    }
  } else {
    if (typeof fbAddClubMembership === 'function') {
      await fbAddClubMembership(clubId, {
        userId, role: 'member', status: 'active', inviteSource: 'link', invitationId: null,
      });
    }
  }

  // שלב 3: מעבר מיידי לאשף — לא מחכים לפעולות שאינן קריטיות
  _ob = { userId, name, clubId, grade: null, readingLevel: null, niqqudLevel: null, interests: [] };
  if (typeof track === 'function') track('join_club_completed', { clubId });

  if (typeof window.enterPersonalHomeAfterJoin === 'function') {
    window.enterPersonalHomeAfterJoin(userId, name, clubId);
  } else {
    _showWelcome(name);
  }

  // שלב 4: פעולות רקע — לא חוסמות את המסך
  // (האשף שומר פרופיל מלא בסיומו — fbGetOrCreateUserProfile מיותר כאן)
  if (typeof fbSetMemberName === 'function') {
    fbSetMemberName(clubId, userId, name, '📚').catch(() => {});
  }
  if (typeof fbLoadClub === 'function') {
    fbLoadClub(clubId).then(club => {
      if (typeof addDeviceClub === 'function') {
        addDeviceClub({ clubId, type: club?.type ?? 'friends', name: club?.name ?? clubId, emoji: club?.emoji ?? '📚' });
      }
    }).catch(() => {});
  }
}

// ─── Onboarding Entry Point ───────────────────────────────────────────────────

function startOnboarding(userId, name, clubId) {
  _ob = { userId, name: name || userId, clubId: clubId || _ob.clubId,
          grade: null, readingLevel: null, niqqudLevel: null, interests: [] };
  _showWelcome(name);
}

function _showWelcome(name) {
  const el = document.getElementById('welcome-name');
  if (el) el.textContent = name;
  showScreen('screen-join-welcome');
}

// ─── Onboarding Steps ─────────────────────────────────────────────────────────

function startProfile() { showScreen('screen-onboard-grade'); }

function selectGrade(grade, el) {
  _ob.grade = grade;
  document.querySelectorAll('.grade-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  setTimeout(() => showScreen('screen-onboard-reading'), 320);
}

function selectReadingLevel(level, el) {
  _ob.readingLevel = level;
  document.querySelectorAll('.level-card').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  setTimeout(() => showScreen('screen-onboard-niqqud'), 320);
}

function selectNiqqudLevel(level, el) {
  _ob.niqqudLevel = level;
  document.querySelectorAll('.niqqud-card').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  setTimeout(() => showScreen('screen-onboard-interests'), 320);
}

function toggleInterest(interest, el) {
  const idx = _ob.interests.indexOf(interest);
  if (idx > -1) {
    _ob.interests.splice(idx, 1);
    el.classList.remove('selected');
  } else {
    if (_ob.interests.length >= 3) return;
    _ob.interests.push(interest);
    el.classList.add('selected');
  }
  const btn = document.getElementById('btn-interests-next');
  if (btn) btn.disabled = _ob.interests.length === 0;
}

async function finishInterests() {
  if (!_ob.interests.length) return;

  if (typeof fbSaveUserProfile === 'function') {
    try {
      await fbSaveUserProfile(_ob.userId, {
        name:                  _ob.name,
        emoji:                 '📚',
        ageGroup:              _ob.grade,
        readingLevel:          _ob.readingLevel,
        niqqudLevel:           _ob.niqqudLevel,
        interests:             [..._ob.interests],
        onboardingComplete:    true,
        onboardingCompletedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[onboarding] finishInterests: save failed:', e.message);
    }
  }

  // עדכן שם ב-Firebase membership
  if (_ob.clubId && _ob.userId && typeof fbSetMemberName === 'function') {
    fbSetMemberName(_ob.clubId, _ob.userId, _ob.name, '📚').catch(() => {});
  }

  if (typeof analyticsUserRegistered === 'function') {
    analyticsUserRegistered(_ob.userId, _ob.clubId);
  }
  const el = document.getElementById('complete-user-name');
  if (el) el.textContent = _ob.name;
  showScreen('screen-onboard-complete');
}

function goHomeAfterOnboarding() {
  if (_ob.clubId && typeof showWhoReads === 'function') {
    showWhoReads(_ob.clubId);
  } else if (typeof routeOnLoad === 'function') {
    routeOnLoad();
  }
}

// חשיפה גלובלית
if (typeof window !== 'undefined') {
  window.showJoinClub         = showJoinClub;
  window.showJoinClubWithCode = showJoinClubWithCode;
  window.showJoinClubDirect   = showJoinClubDirect;
  window.submitJoinName       = submitJoinName;
  window.handleNameKeydown    = handleNameKeydown;
  window.submitJoinCode       = submitJoinCode;
  window.handleCodeKeydown    = handleCodeKeydown;
  window.joinSeedClub         = joinSeedClub;
  window.startOnboarding      = startOnboarding;
  window.goHomeAfterOnboarding = goHomeAfterOnboarding;
  window.toggleInterest       = toggleInterest;
  window.finishInterests      = finishInterests;
  window.selectGrade          = selectGrade;
  window.selectReadingLevel   = selectReadingLevel;
  window.selectNiqqudLevel    = selectNiqqudLevel;
  window.startProfile         = startProfile;
}
