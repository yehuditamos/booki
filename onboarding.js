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

// ─── Join Entry ───────────────────────────────────────────────────────────────

function showJoinClub() {
  if (typeof track === 'function') track('join_club_started');
  _renderSeedClubs();
  const input = document.getElementById('join-code-input');
  if (input) input.value = '';
  const err = document.getElementById('join-error-msg');
  if (err) err.textContent = '';
  showScreen('screen-join-entry');
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
  const raw  = (document.getElementById('join-code-input')?.value || '').trim().toUpperCase();
  const err  = document.getElementById('join-error-msg');
  const btn  = document.getElementById('btn-join-code');

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

  if (!inv) {
    if (err) err.textContent = 'הקוד לא נמצא — בדוק/י שוב';
    if (btn) { btn.disabled = false; btn.textContent = 'כניסה'; }
    return;
  }
  if (inv.status !== 'pending') {
    if (err) err.textContent = inv.status === 'claimed' ? 'קוד זה כבר שומש' : 'הקוד אינו בתוקף';
    if (btn) { btn.disabled = false; btn.textContent = 'כניסה'; }
    return;
  }

  // צור userId ייחודי אם לא קיים
  let userId = localStorage.getItem('booki_tmp_uid');
  if (!userId) {
    userId = 'user_' + Math.random().toString(36).slice(2, 11);
    localStorage.setItem('booki_tmp_uid', userId);
  }

  const result = typeof fbClaimInvitation === 'function'
    ? await fbClaimInvitation(raw, userId)
    : { success: false };

  if (!result.success) {
    if (err) err.textContent = 'שגיאה בהתחברות — נסה שוב';
    if (btn) { btn.disabled = false; btn.textContent = 'כניסה'; }
    return;
  }

  // צור פרופיל ראשוני
  if (typeof fbGetOrCreateUserProfile === 'function') {
    await fbGetOrCreateUserProfile(userId, { name: inv.targetName, emoji: '📚' });
  }

  // הוסף מועדון + קורא למכשיר
  if (typeof addDeviceClub === 'function') {
    const club = (typeof fbLoadClub === 'function') ? await fbLoadClub(inv.clubId) : null;
    addDeviceClub({
      clubId: inv.clubId,
      type:   club?.type  ?? 'friends',
      name:   club?.name  ?? inv.clubId,
      emoji:  club?.emoji ?? '📚',
    });
  }
  if (typeof addDeviceMember === 'function') {
    addDeviceMember(inv.clubId, { userId, name: inv.targetName, emoji: '📚' });
  }

  if (btn) { btn.disabled = false; btn.textContent = 'כניסה'; }
  if (typeof track === 'function') track('join_club_completed', { clubId: inv.clubId });

  // כניסה לאונבורדינג
  _ob = { userId, name: inv.targetName, clubId: inv.clubId,
          grade: null, readingLevel: null, niqqudLevel: null, interests: [] };
  _showWelcome(inv.targetName);
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
  }

  // עדכן את הקורא במכשיר (emoji ידעדכן מאוחר יותר)
  if (_ob.clubId && typeof addDeviceMember === 'function') {
    addDeviceMember(_ob.clubId, { userId: _ob.userId, name: _ob.name, emoji: '📚' });
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
