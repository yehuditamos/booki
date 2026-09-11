/**
 * Booki pilot — class-size slot cards (2026-09-11)
 * Goal: teacher enters only class size; Booki creates that many pre-created cards.
 * Existing clubs/members stay unchanged. Existing clubs can be topped up safely.
 * Open cards are visually distinct; child chooses one, names it, and then owns it.
 */
(function(){
  'use strict';
  if (window.BookiClassSlots20260911) return;
  window.BookiClassSlots20260911 = true;

  const OPEN_PREFIX = 'כרטיס פנוי ';
  const MAX_CLASS_SIZE = 50;
  const PALETTE = [
    ['#FFE3A3','#F6B73C'], ['#D8F5E7','#59C58E'], ['#D9ECFF','#67A9E8'],
    ['#F0E2FF','#A77AE6'], ['#FFDDE6','#F07D9E'], ['#FFE8CF','#F0A45C'],
    ['#DDF4F7','#58B8C7'], ['#E6F0D3','#8FB75A'], ['#FCE1F5','#D47EBE'],
    ['#E6E3FF','#8F82D9'], ['#FFF1B8','#E2B536'], ['#DCEBFF','#729ADF']
  ];

  let newClubClassSize = 0;
  let activeOpenClaim = null;
  const profileCache = new Map();

  const $ = id => document.getElementById(id);
  const norm = value => String(value || '').trim().replace(/\s+/g,' ').toLowerCase();
  const isOpenName = name => String(name || '').startsWith(OPEN_PREFIX);
  const slotNumberFromName = name => {
    const match = String(name || '').match(/כרטיס פנוי\s*(\d+)/);
    return match ? Number(match[1]) : null;
  };
  const slotName = number => OPEN_PREFIX + String(number).padStart(2,'0');
  const colorForSlot = number => PALETTE[Math.max(0,(Number(number)||1)-1) % PALETTE.length];

  async function membershipsFor(clubId){
    if (!window.db || !clubId) return [];
    const snap = await window.db.collection('clubs').doc(clubId).collection('memberships').get();
    return snap.docs.map(d => ({...d.data(), userId:d.data().userId || d.id})).filter(m => m.status !== 'left');
  }

  async function profileForUid(uid){
    if (!uid || !window.db) return null;
    if (profileCache.has(uid)) return profileCache.get(uid);
    try {
      const snap = await window.db.collection('users').doc(uid).collection('profile').doc('main').get();
      const profile = snap.exists ? snap.data() : null;
      profileCache.set(uid, profile);
      return profile;
    } catch (_) { return null; }
  }

  async function effectiveName(member){
    if (!member) return '';
    if (!isOpenName(member.name)) return String(member.name || '').trim();
    if (!member.claimedByUid) return '';
    const profile = await profileForUid(member.claimedByUid);
    return String(profile?.name || '').trim();
  }

  async function effectiveNames(clubId, excludeUserId){
    const members = await membershipsFor(clubId);
    const values = await Promise.all(members
      .filter(m => m.userId !== excludeUserId)
      .map(effectiveName));
    return values.filter(Boolean);
  }

  function nextOpenSlotNumbers(members, amount){
    const used = new Set(members.map(m => slotNumberFromName(m.name)).filter(Number.isFinite));
    const result = [];
    let n = 1;
    while (result.length < amount && n < 500) {
      if (!used.has(n)) result.push(n);
      n++;
    }
    return result;
  }

  async function ensureClassSize(clubId, targetCount, statusEl){
    const target = Math.max(1, Math.min(MAX_CLASS_SIZE, Number(targetCount) || 0));
    if (!clubId || !target) return {ok:false, reason:'invalid'};
    let members;
    try { members = await membershipsFor(clubId); }
    catch (error) { return {ok:false, reason:'load-failed', error}; }
    const missing = Math.max(0, target - members.length);
    if (!missing) return {ok:true, created:0, total:members.length};
    if (typeof fbTeacherAddStudent !== 'function') return {ok:false, reason:'missing-function'};

    const numbers = nextOpenSlotNumbers(members, missing);
    let created = 0;
    for (let i = 0; i < numbers.length; i++) {
      if (statusEl) statusEl.textContent = `פותחת כרטיס ${i+1} מתוך ${numbers.length}…`;
      const result = await fbTeacherAddStudent(clubId, {name:slotName(numbers[i])});
      if (result?.ok) created++;
    }
    return {ok:created === missing, created, total:members.length + created};
  }

  // ─── New-club step: one number only ────────────────────────────────────────
  function renderClassSizeStep(){
    const screen = $('screen-create-members');
    if (!screen || $('booki-class-size-step')) return;

    screen.querySelectorAll('.add-mode-btn,#add-single-mode,#add-paste-mode,#member-count,#member-list').forEach(el => {
      el.style.setProperty('display','none','important');
    });

    const continueBtn = $('btn-go-review');
    if (!continueBtn) return;

    const panel = document.createElement('div');
    panel.id = 'booki-class-size-step';
    panel.className = 'booki-class-size-step';
    panel.innerHTML = `
      <div class="booki-class-size-icon">🎒</div>
      <h3>כמה ילדים יש בכיתה?</h3>
      <p>זה כל מה שצריך. בוקי יכין מראש כרטיס צבעוני לכל ילד.</p>
      <div class="booki-class-size-control">
        <button type="button" class="booki-size-minus" aria-label="הפחיתי ילד">−</button>
        <input id="booki-class-size-input" type="number" inputmode="numeric" min="1" max="${MAX_CLASS_SIZE}" value="${newClubClassSize || 30}" aria-label="מספר הילדים בכיתה">
        <button type="button" class="booki-size-plus" aria-label="הוסיפי ילד">+</button>
      </div>
      <small>אחר כך כל ילד יבחר כרטיס פנוי ויכתוב עליו את השם שלו.</small>`;
    continueBtn.parentNode.insertBefore(panel, continueBtn);

    const input = $('booki-class-size-input');
    const set = value => {
      const n = Math.max(1, Math.min(MAX_CLASS_SIZE, Number(value) || 1));
      input.value = String(n); newClubClassSize = n;
    };
    set(input.value);
    input.addEventListener('input', () => set(input.value));
    panel.querySelector('.booki-size-minus').addEventListener('click', () => set(Number(input.value)-1));
    panel.querySelector('.booki-size-plus').addEventListener('click', () => set(Number(input.value)+1));
    continueBtn.textContent = 'לסיכום ⬅️';
  }

  if (typeof window.submitClubName === 'function') {
    const originalSubmitClubName = window.submitClubName;
    window.submitClubName = function(){
      newClubClassSize = 0;
      const result = originalSubmitClubName.apply(this, arguments);
      requestAnimationFrame(renderClassSizeStep);
      return result;
    };
  }

  if (typeof window.goToReview === 'function') {
    const originalGoToReview = window.goToReview;
    window.goToReview = function(){
      const input = $('booki-class-size-input');
      const count = Math.max(1, Math.min(MAX_CLASS_SIZE, Number(input?.value || newClubClassSize || 30)));
      newClubClassSize = count;
      try {
        if (typeof _newClub !== 'undefined' && _newClub) {
          _newClub.members = Array.from({length:count},(_,i)=>slotName(i+1));
        }
      } catch (_) {}
      const result = originalGoToReview.apply(this, arguments);
      requestAnimationFrame(() => {
        const countEl = $('review-count');
        if (countEl) countEl.textContent = `${count} כרטיסים צבעוניים יחכו לילדים`;
        const list = $('review-member-list');
        if (list) list.innerHTML = `<div class="booki-review-slots"><strong>🎨 ${count} כרטיסים פנויים</strong><span>כל ילד יבחר כרטיס וישיים אותו בעצמו.</span></div>`;
      });
      return result;
    };
  }

  // ─── Existing clubs: top up to class size, never migrate existing cards ─────
  function currentTeacherClubId(){
    try { if (typeof _activeClubId !== 'undefined' && _activeClubId) return _activeClubId; } catch (_) {}
    return window.currentClubId || null;
  }

  async function installTopUpPanel(){
    const screen = $('screen-club-students');
    const section = $('add-student-section');
    if (!screen || !section || $('booki-topup-panel')) return;
    const clubId = currentTeacherClubId();
    if (!clubId || typeof getCurrentTeacher !== 'function' || !getCurrentTeacher()) return;

    let members = [];
    try { members = await membershipsFor(clubId); } catch (_) {}
    const panel = document.createElement('div');
    panel.id = 'booki-topup-panel';
    panel.className = 'booki-topup-panel';
    panel.innerHTML = `
      <strong>🎒 השלימי כרטיסים לכל הכיתה</strong>
      <p>כרגע יש <b>${members.length}</b> כרטיסים. כתבי כמה ילדים יש בכיתה ובוקי יפתח רק את החסרים.</p>
      <div class="booki-topup-row">
        <input id="booki-topup-count" type="number" min="1" max="${MAX_CLASS_SIZE}" inputmode="numeric" value="${Math.max(members.length,30)}" aria-label="מספר הילדים בכיתה">
        <button id="booki-topup-action" type="button">השלימי כרטיסים</button>
      </div>
      <small id="booki-topup-status"></small>`;
    section.parentNode.insertBefore(panel, section);

    $('booki-topup-action').addEventListener('click', async () => {
      const btn = $('booki-topup-action');
      const status = $('booki-topup-status');
      const target = Number($('booki-topup-count')?.value || 0);
      if (!target || target < 1 || target > MAX_CLASS_SIZE) {
        status.textContent = `כתבי מספר בין 1 ל-${MAX_CLASS_SIZE}`; return;
      }
      btn.disabled = true;
      const result = await ensureClassSize(clubId, target, status);
      btn.disabled = false;
      if (!result.ok && result.reason !== undefined) {
        status.textContent = 'לא הצלחתי לפתוח את כל הכרטיסים. נסי שוב.'; return;
      }
      if (result.created === 0) {
        status.textContent = `כבר יש ${result.total} כרטיסים — לא צריך להוסיף.`;
      } else {
        status.textContent = `✅ נפתחו ${result.created} כרטיסים חדשים. עכשיו יש ${result.total} כרטיסים.`;
        if (typeof showClubStudents === 'function') setTimeout(()=>showClubStudents(),650);
      }
    });
  }

  // ─── Open-card look & intro ─────────────────────────────────────────────────
  function decorateOpenCards(grid, memberships, clubId){
    if (!grid || !Array.isArray(memberships)) return;
    const open = memberships.filter(m => m.status !== 'left' && isOpenName(m.name) && !m.claimedByUid);
    if (grid.id === 'who-reads-grid') {
      document.getElementById('booki-open-slots-intro')?.remove();
      if (open.length) {
        const intro = document.createElement('div');
        intro.id = 'booki-open-slots-intro';
        intro.className = 'booki-open-slots-intro';
        intro.innerHTML = `<strong>המורה כבר הכינה לך כרטיס בבוקי 🎉</strong><span>בחר/י כרטיס צבעוני פנוי. אחר כך נכתוב עליו את השם שלך — ומאותו רגע הוא שלך.</span>`;
        grid.parentNode.insertBefore(intro, grid);
      }
    }

    [...grid.children].forEach(child => {
      const text = child.textContent || '';
      const match = text.match(/כרטיס פנוי\s*(\d+)/);
      if (!match) return;
      const number = Number(match[1]);
      const [a,b] = colorForSlot(number);
      child.classList.add('booki-open-slot-card');
      child.style.setProperty('--booki-slot-a',a);
      child.style.setProperty('--booki-slot-b',b);
      child.setAttribute('aria-label',`כרטיס צבעוני פנוי ${number}`);
      if (!child.querySelector('.booki-slot-badge')) {
        const badge = document.createElement('span');
        badge.className = 'booki-slot-badge';
        badge.textContent = `כרטיס ${number}`;
        child.appendChild(badge);
      }
    });
  }

  // Resolve chosen names from each claimant's own profile, without requiring a
  // membership-name write (the currently deployed claim rule does not allow it).
  async function hydrateNames(memberships){
    return Promise.all(memberships.map(async member => {
      if (!isOpenName(member.name) || !member.claimedByUid) return member;
      const name = await effectiveName(member);
      return name ? {...member, name} : member;
    }));
  }

  if (typeof window._renderFirebaseMemberGrid === 'function') {
    const originalRenderMembers = window._renderFirebaseMemberGrid;
    window._renderFirebaseMemberGrid = function(grid, memberships, clubId){
      const initial = memberships.map(m => {
        if (isOpenName(m.name) && !m.claimedByUid) return {...m, emoji:'🎟️'};
        return m;
      });
      const result = originalRenderMembers.call(this, grid, initial, clubId);
      decorateOpenCards(grid, memberships, clubId);
      if (memberships.some(m => isOpenName(m.name) && m.claimedByUid)) {
        hydrateNames(memberships).then(resolved => {
          if (!grid?.isConnected) return;
          originalRenderMembers.call(window, grid, resolved, clubId);
          decorateOpenCards(grid, resolved, clubId);
        }).catch(()=>{});
      }
      return result;
    };
  }

  // ─── Child claims an open card: add name before the existing avatar step ─────
  if (typeof window.showMiniPersonalization === 'function') {
    const originalShowMini = window.showMiniPersonalization;
    window.showMiniPersonalization = function(userId, clubId, name){
      const open = isOpenName(name);
      activeOpenClaim = open ? {userId, clubId, placeholder:name} : null;
      const result = originalShowMini.apply(this, arguments);
      if (!open) return result;
      requestAnimationFrame(() => {
        const title = document.querySelector('.who-reads-title');
        const sub = $('who-reads-club-name');
        const card = document.querySelector('#who-reads-grid .mini-person-card');
        if (title) title.textContent = 'בחרת את הכרטיס שלך! 🎉';
        if (sub) sub.textContent = 'עכשיו נותנים לו שם ובוחרים דמות.';
        if (card && !$('booki-slot-name-wrap')) {
          const block = document.createElement('div');
          block.id = 'booki-slot-name-wrap';
          block.className = 'booki-slot-name-wrap';
          block.innerHTML = `
            <label for="booki-slot-name-input">איך קוראים לך?</label>
            <input id="booki-slot-name-input" type="text" maxlength="50" autocomplete="name" placeholder="השם שלי" />
            <small>אם יש עוד ילד/ה עם אותו שם בכיתה, נבקש גם שם משפחה.</small>`;
          card.insertBefore(block, card.firstChild);
          $('booki-slot-name-input')?.focus();
        }
        const save = $('btn-mini-person-save');
        if (save) save.textContent = 'זה הכרטיס שלי 💙';
      });
      return result;
    };
  }

  function showMiniError(text){
    const err = $('mini-person-error');
    if (!err) return;
    err.textContent = text; err.style.display = '';
  }

  function applyResolvedReaderName(name){
    try {
      const reader = typeof getActiveReader === 'function' ? getActiveReader() : null;
      if (reader && activeOpenClaim && reader.userId === activeOpenClaim.userId && typeof setActiveReader === 'function') {
        setActiveReader({...reader, name});
      }
    } catch (_) {}
    try {
      if (typeof currentStudentData !== 'undefined' && currentStudentData && activeOpenClaim && currentStudentData.id === activeOpenClaim.userId) currentStudentData.name = name;
    } catch (_) {}
    const homeName = $('current-student-name');
    if (homeName) homeName.textContent = name;
  }

  if (typeof window.submitMiniPersonalization === 'function') {
    const originalSubmitMini = window.submitMiniPersonalization;
    window.submitMiniPersonalization = async function(){
      if (!activeOpenClaim) return originalSubmitMini.apply(this, arguments);

      const input = $('booki-slot-name-input');
      const chosenName = String(input?.value || '').trim().replace(/\s+/g,' ');
      if (!chosenName) { showMiniError('כתוב/י את השם שלך כדי שהכרטיס יהיה שלך'); input?.focus(); return; }
      if (isOpenName(chosenName)) { showMiniError('כתבו את השם שלכם 🙂'); input?.focus(); return; }

      let names = [];
      try { names = await effectiveNames(activeOpenClaim.clubId, activeOpenClaim.userId); }
      catch (_) {}
      const parts = chosenName.split(' ').filter(Boolean);
      const first = norm(parts[0]);
      const sameFirst = names.some(name => norm(String(name).split(' ')[0]) === first);
      const sameFull = names.some(name => norm(name) === norm(chosenName));
      if (sameFull) { showMiniError('כבר יש כרטיס בשם הזה. כתבו שם מלא כדי שנדע שזה באמת אתם.'); input?.focus(); return; }
      if (sameFirst && parts.length < 2) {
        showMiniError(`יש כבר ${parts[0]} במועדון 😊 כתוב/י גם שם משפחה`); input?.focus(); return;
      }

      const authUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
      if (!authUser?.uid) { showMiniError('רגע, בוקי עדיין מתחבר. נסו שוב.'); return; }

      try {
        if (typeof fbSaveUserProfile === 'function') {
          await fbSaveUserProfile(authUser.uid, {name:chosenName, source:'class-slot'});
        } else if (window.db) {
          await window.db.collection('users').doc(authUser.uid).collection('profile').doc('main').set({name:chosenName,userId:authUser.uid,source:'class-slot',updatedAt:new Date().toISOString()},{merge:true});
        }
        profileCache.set(authUser.uid,{...(profileCache.get(authUser.uid)||{}),name:chosenName});
      } catch (error) {
        console.warn('[class-slots] name save failed', error);
        showMiniError('לא הצלחתי לשמור את השם. נסו שוב.'); return;
      }

      const claim = {...activeOpenClaim, chosenName};
      const result = await originalSubmitMini.apply(this, arguments);
      activeOpenClaim = claim;
      applyResolvedReaderName(chosenName);
      activeOpenClaim = null;
      return result;
    };
  }

  // A claimed slot still stores its technical placeholder in membership.name.
  // On later devices resolve the child's profile name after existing routing finishes.
  if (typeof window.selectProfile === 'function') {
    const originalSelectProfile = window.selectProfile;
    window.selectProfile = async function(userId, clubIdHint){
      const targetClubId = clubIdHint || (typeof _activeClubId !== 'undefined' ? _activeClubId : null) || window.currentClubId || null;
      let resolvedName = '';
      try {
        if (targetClubId && window.db) {
          const snap = await window.db.collection('clubs').doc(targetClubId).collection('memberships').doc(userId).get();
          if (snap.exists) {
            const member = {...snap.data(),userId};
            if (isOpenName(member.name) && member.claimedByUid) resolvedName = await effectiveName(member);
          }
        }
      } catch (_) {}
      const result = await originalSelectProfile.apply(this, arguments);
      if (resolvedName) applyResolvedReaderName(resolvedName);
      return result;
    };
  }

  // ─── Styling ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.id = 'booki-class-slots-style';
  style.textContent = `
    .booki-class-size-step{margin:14px 0 20px;padding:20px;border-radius:24px;background:#f5fbf7;border:1px solid #d7eee0;text-align:center}
    .booki-class-size-icon{font-size:2.2rem}.booki-class-size-step h3{margin:4px 0 5px;font-size:1.25rem}.booki-class-size-step p{margin:0 auto 16px;color:#607268;max-width:340px}
    .booki-class-size-control{display:flex;align-items:center;justify-content:center;gap:10px;direction:ltr;margin-bottom:10px}
    .booki-class-size-control button{width:48px;height:48px;border:0;border-radius:50%;background:#e4f3e9;color:#1c7b4c;font-size:1.7rem;font-weight:900}
    #booki-class-size-input{width:92px;height:56px;border:2px solid #55bb7e;border-radius:18px;text-align:center;font:900 1.7rem/1 Heebo,Arial,sans-serif;color:#245a3e;background:white}
    .booki-class-size-step small{display:block;color:#718178}
    .booki-review-slots{display:flex;flex-direction:column;gap:5px;padding:18px;border-radius:18px;background:#f5fbf7;text-align:center;color:#315a45}.booki-review-slots strong{font-size:1.1rem}

    .booki-topup-panel{margin:14px 16px 18px;padding:16px;border:1px solid #d8eadf;border-radius:20px;background:#f8fcf9;text-align:right}.booki-topup-panel>strong{display:block;font-size:1.05rem;color:#245b3e}.booki-topup-panel p{margin:5px 0 12px;color:#5f7167}.booki-topup-row{display:flex;gap:8px}.booki-topup-row input{width:88px;border:1.5px solid #65b986;border-radius:12px;padding:9px;text-align:center;font-weight:900}.booki-topup-row button{flex:1;border:0;border-radius:12px;background:#2aa968;color:white;font-weight:900}.booki-topup-panel small{display:block;margin-top:8px;color:#47725b;min-height:1.2em}

    .booki-open-slots-intro{grid-column:1/-1;margin:2px 0 12px;padding:15px 17px;border-radius:20px;background:#fffaf0;border:1px solid #f0dfb6;text-align:center;display:flex;flex-direction:column;gap:5px;color:#4f5f55}.booki-open-slots-intro strong{font-size:1.05rem;color:#315846}
    #who-reads-grid>.booki-open-slot-card,#club-students-grid>.booki-open-slot-card{position:relative!important;background:linear-gradient(145deg,var(--booki-slot-a),var(--booki-slot-b))!important;border:3px solid rgba(255,255,255,.88)!important;box-shadow:0 7px 18px rgba(70,90,80,.14),inset 0 0 0 1px rgba(80,80,80,.05)!important;min-height:116px!important;color:#365247!important;transform:none;overflow:hidden}
    .booki-open-slot-card::after{content:'✦';position:absolute;left:10px;top:8px;color:rgba(255,255,255,.72);font-size:1rem}.booki-open-slot-card:hover{transform:translateY(-2px)!important}.booki-slot-badge{display:block;margin-top:5px;padding:3px 8px;border-radius:999px;background:rgba(255,255,255,.72);font-size:.72rem;font-weight:900;color:#3e5c50}

    .booki-slot-name-wrap{margin:0 0 17px;padding:15px;border-radius:18px;background:#fff9e9;border:1px solid #f0dfb6}.booki-slot-name-wrap label{display:block;font-size:1.08rem;font-weight:900;margin-bottom:8px;color:#425d4f}.booki-slot-name-wrap input{width:100%;box-sizing:border-box;border:2px solid #efbd50;border-radius:14px;padding:12px 14px;font:700 1.05rem/1.3 Heebo,Arial,sans-serif;text-align:center;background:white}.booki-slot-name-wrap small{display:block;margin-top:6px;color:#746c5d;font-size:.78rem}
  `;
  document.head.appendChild(style);

  // Install count UI when navigating back to the step, and top-up UI when teacher opens club students.
  const observer = new MutationObserver(() => {
    if ($('screen-create-members')?.classList.contains('active')) renderClassSizeStep();
    if ($('screen-club-students')?.classList.contains('active')) installTopUpPanel();
  });
  document.querySelectorAll('.screen').forEach(screen => observer.observe(screen,{attributes:true,attributeFilter:['class']}));

  if ($('screen-create-members')?.classList.contains('active')) renderClassSizeStep();
  if ($('screen-club-students')?.classList.contains('active')) installTopUpPanel();

  window.BookiClassSlots = {ensureClassSize,isOpenName,slotName,effectiveName};
})();