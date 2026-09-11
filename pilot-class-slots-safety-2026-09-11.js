/**
 * Booki class-slot safety patch — 2026-09-11
 * 1) No preselected class size: teacher must type the number herself.
 * 2) Existing-club top-up is disabled until an explicit valid number is entered.
 * 3) Teacher can safely delete ONLY unused/open slot cards created by the slot system.
 * 4) A slot's chosen color stays with the card after the child names/claims it.
 */
(function(){
  'use strict';
  if (window.BookiClassSlotsSafety20260911) return;
  window.BookiClassSlotsSafety20260911 = true;

  const OPEN_PREFIX = 'כרטיס פנוי ';
  const MAX_CLASS_SIZE = 50;
  const PALETTE = [
    ['#FFE3A3','#F6B73C'], ['#D8F5E7','#59C58E'], ['#D9ECFF','#67A9E8'],
    ['#F0E2FF','#A77AE6'], ['#FFDDE6','#F07D9E'], ['#FFE8CF','#F0A45C'],
    ['#DDF4F7','#58B8C7'], ['#E6F0D3','#8FB75A'], ['#FCE1F5','#D47EBE'],
    ['#E6E3FF','#8F82D9'], ['#FFF1B8','#E2B536'], ['#DCEBFF','#729ADF']
  ];
  const slotByUser = new Map();
  let patchQueued = false;

  const $ = id => document.getElementById(id);
  const isOpenName = name => String(name || '').startsWith(OPEN_PREFIX);
  const slotNumber = name => {
    const match = String(name || '').match(/כרטיס פנוי\s*(\d+)/);
    return match ? Number(match[1]) : null;
  };
  const colors = number => PALETTE[Math.max(0,(Number(number)||1)-1) % PALETTE.length];
  const teacher = () => typeof getCurrentTeacher === 'function' ? getCurrentTeacher() : null;

  function activeClubId(){
    try { if (typeof _activeClubId !== 'undefined' && _activeClubId) return _activeClubId; } catch (_) {}
    return window.currentClubId || null;
  }

  async function membershipsFor(clubId){
    if (!window.db || !clubId) return [];
    const snap = await window.db.collection('clubs').doc(clubId).collection('memberships').get();
    return snap.docs.map(d => ({...d.data(), userId:d.data().userId || d.id})).filter(m => m.status !== 'left');
  }

  function validCount(value){
    const raw = String(value ?? '').trim();
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= MAX_CLASS_SIZE ? n : null;
  }

  // ── New club: blank field, explicit teacher choice only ────────────────────
  function sanitizeNewClubStep(){
    const panel = $('booki-class-size-step');
    const oldInput = $('booki-class-size-input');
    const continueBtn = $('btn-go-review');
    if (!panel || !oldInput || !continueBtn || panel.dataset.safetyReady === '1') return;
    panel.dataset.safetyReady = '1';

    const input = oldInput.cloneNode(true);
    input.value = '';
    input.placeholder = 'למשל 30';
    input.setAttribute('aria-describedby','booki-class-size-safety-note');
    oldInput.replaceWith(input);

    const oldMinus = panel.querySelector('.booki-size-minus');
    const oldPlus  = panel.querySelector('.booki-size-plus');
    const minus = oldMinus?.cloneNode(true);
    const plus  = oldPlus?.cloneNode(true);
    if (oldMinus && minus) oldMinus.replaceWith(minus);
    if (oldPlus  && plus)  oldPlus.replaceWith(plus);

    let note = $('booki-class-size-safety-note');
    if (!note) {
      note = document.createElement('small');
      note.id = 'booki-class-size-safety-note';
      note.className = 'booki-class-size-safety-note';
      note.textContent = 'כתבי את מספר הילדים בעצמך — בוקי לא יבחר מספר במקומך.';
      panel.appendChild(note);
    }

    const sync = () => {
      const count = validCount(input.value);
      continueBtn.disabled = !count;
      continueBtn.textContent = count ? `לסיכום — ${count} כרטיסים ⬅️` : 'כתבי מספר ילדים כדי להמשיך';
    };
    input.addEventListener('input', sync);
    minus?.addEventListener('click', () => {
      const current = validCount(input.value) || 1;
      input.value = String(Math.max(1,current-1)); sync();
    });
    plus?.addEventListener('click', () => {
      const current = validCount(input.value) || 0;
      input.value = String(Math.min(MAX_CLASS_SIZE,current+1)); sync();
    });
    sync();
  }

  // Guard the already-wrapped flow too: even if another module changes the DOM,
  // blank/invalid values can never silently fall back to 30.
  if (typeof window.goToReview === 'function') {
    const previousGoToReview = window.goToReview;
    window.goToReview = function(){
      if ($('screen-create-members')?.classList.contains('active') && $('booki-class-size-step')) {
        const input = $('booki-class-size-input');
        const count = validCount(input?.value);
        if (!count) {
          input?.focus();
          const note = $('booki-class-size-safety-note');
          if (note) note.textContent = `כתבי מספר בין 1 ל-${MAX_CLASS_SIZE} כדי להמשיך.`;
          return;
        }
      }
      return previousGoToReview.apply(this, arguments);
    };
  }

  // ── Existing clubs: explicit top-up + safe cleanup ─────────────────────────
  async function deleteUnusedOpenSlots(clubId, statusEl){
    if (!teacher() || !window.db || !clubId) return {ok:false,reason:'not-authorized'};
    let members;
    try { members = await membershipsFor(clubId); }
    catch (error) { return {ok:false,reason:'load-failed',error}; }

    const removable = members.filter(m =>
      m.createdByTeacher === true &&
      isOpenName(m.name) &&
      !m.claimedByUid &&
      m.personalized !== true
    );
    if (!removable.length) return {ok:true,deleted:0,total:members.length};

    const approved = confirm(`למחוק ${removable.length} כרטיסים פנויים?\n\nכרטיסים שכבר נתפסו על ידי ילדים ושמות קיימים לא יימחקו.`);
    if (!approved) return {ok:false,reason:'cancelled'};

    try {
      const clubRef = window.db.collection('clubs').doc(clubId);
      const batch = window.db.batch();
      removable.forEach(m => batch.delete(clubRef.collection('memberships').doc(m.userId)));
      await batch.commit();
      const remaining = await membershipsFor(clubId);
      await clubRef.set({memberCount:remaining.length,updatedAt:new Date().toISOString()},{merge:true});
      if (statusEl) statusEl.textContent = `✅ נמחקו ${removable.length} כרטיסים פנויים. הילדים הקיימים נשארו בדיוק כמו שהם.`;
      return {ok:true,deleted:removable.length,total:remaining.length};
    } catch (error) {
      console.warn('[class-slots-safety] delete unused slots failed',error);
      return {ok:false,reason:'delete-failed',error};
    }
  }

  function sanitizeTopUpPanel(){
    const panel = $('booki-topup-panel');
    const oldInput = $('booki-topup-count');
    const oldAction = $('booki-topup-action');
    const status = $('booki-topup-status');
    if (!panel || !oldInput || !oldAction || panel.dataset.safetyReady === '1') return;
    panel.dataset.safetyReady = '1';

    const countText = panel.querySelector('p b');
    const existingCount = Number(countText?.textContent || 0) || 0;

    const input = oldInput.cloneNode(true);
    input.value = '';
    input.placeholder = 'מספר הילדים';
    oldInput.replaceWith(input);

    const action = oldAction.cloneNode(true);
    action.disabled = true;
    action.textContent = 'כתבי מספר ילדים';
    oldAction.replaceWith(action);

    const cleanup = document.createElement('button');
    cleanup.type = 'button';
    cleanup.className = 'booki-clear-open-slots';
    cleanup.textContent = 'נפתחו כרטיסים בטעות? נקי כרטיסים פנויים';
    panel.appendChild(cleanup);

    const sync = () => {
      const target = validCount(input.value);
      if (!target) {
        action.disabled = true;
        action.textContent = 'כתבי מספר ילדים';
        if (status) status.textContent = '';
        return;
      }
      const missing = target - existingCount;
      if (missing <= 0) {
        action.disabled = true;
        action.textContent = 'לא צריך להוסיף כרטיסים';
        if (status) status.textContent = `כבר יש ${existingCount} כרטיסים במועדון.`;
        return;
      }
      action.disabled = false;
      action.textContent = `פתחי ${missing} כרטיסים חסרים`;
      if (status) status.textContent = `בסיום יהיו ${target} כרטיסים במועדון.`;
    };
    input.addEventListener('input',sync);

    action.addEventListener('click',async()=>{
      const target = validCount(input.value);
      if (!target || target <= existingCount || !window.BookiClassSlots?.ensureClassSize) return;
      const missing = target-existingCount;
      if (missing >= 5 && !confirm(`לפתוח עכשיו ${missing} כרטיסים פנויים?`)) return;
      action.disabled = true;
      const result = await window.BookiClassSlots.ensureClassSize(activeClubId(),target,status);
      if (!result?.ok) {
        if (status) status.textContent = 'לא הצלחתי לפתוח את כל הכרטיסים. נסי שוב.';
        action.disabled = false;
        return;
      }
      if (status) status.textContent = `✅ נפתחו ${result.created} כרטיסים. עכשיו יש ${result.total}.`;
      setTimeout(()=>{
        panel.remove();
        if (typeof showClubStudents === 'function') showClubStudents();
      },650);
    });

    cleanup.addEventListener('click',async()=>{
      cleanup.disabled = true;
      const result = await deleteUnusedOpenSlots(activeClubId(),status);
      cleanup.disabled = false;
      if (!result?.ok) {
        if (result?.reason !== 'cancelled' && status) status.textContent = 'לא הצלחתי לנקות את הכרטיסים. נסי שוב.';
        return;
      }
      if (result.deleted === 0) {
        if (status) status.textContent = 'אין כרגע כרטיסים פנויים למחיקה.';
        return;
      }
      setTimeout(()=>{
        panel.remove();
        if (typeof showClubStudents === 'function') showClubStudents();
      },700);
    });
    sync();
  }

  // ── Preserve the child's chosen slot color after claim/personalization ──────
  function rememberSlots(memberships){
    (memberships || []).forEach(m => {
      const n = slotNumber(m.name);
      if (Number.isFinite(n)) slotByUser.set(String(m.userId),{number:n,claimed:!!m.claimedByUid});
    });
  }

  function paintKnownSlots(grid){
    if (!grid) return;
    grid.querySelectorAll('.profile-card[data-user-id]').forEach(card => {
      const slot = slotByUser.get(String(card.dataset.userId));
      if (!slot) return;
      const [a,b] = colors(slot.number);
      card.classList.add('booki-slot-color-identity');
      card.style.setProperty('--booki-slot-a',a);
      card.style.setProperty('--booki-slot-b',b);
      if (slot.claimed) card.classList.add('booki-slot-owned-card');
    });
  }

  if (typeof window._renderFirebaseMemberGrid === 'function') {
    const previousRenderGrid = window._renderFirebaseMemberGrid;
    window._renderFirebaseMemberGrid = function(grid,memberships,clubId){
      rememberSlots(memberships);
      const result = previousRenderGrid.apply(this,arguments);
      paintKnownSlots(grid);
      requestAnimationFrame(()=>paintKnownSlots(grid));
      setTimeout(()=>paintKnownSlots(grid),80);
      setTimeout(()=>paintKnownSlots(grid),300);
      return result;
    };
  }

  const style = document.createElement('style');
  style.id = 'booki-class-slots-safety-style';
  style.textContent = `
    .booki-class-size-safety-note{display:block!important;margin-top:8px!important;color:#6a766f!important;font-weight:700}
    #btn-go-review:disabled{opacity:.48!important;cursor:not-allowed!important}
    #booki-topup-action:disabled{opacity:.5!important;cursor:not-allowed!important}
    .booki-clear-open-slots{width:100%;margin-top:12px;padding:10px 12px;border:1px solid #e2c7c7;border-radius:12px;background:#fff8f8;color:#9b4c4c;font-weight:800}
    #who-reads-grid>.booki-slot-color-identity,#club-students-grid>.booki-slot-color-identity{background:linear-gradient(145deg,var(--booki-slot-a),var(--booki-slot-b))!important;border:3px solid rgba(255,255,255,.88)!important;box-shadow:0 7px 18px rgba(70,90,80,.14),inset 0 0 0 1px rgba(80,80,80,.05)!important;color:#365247!important}
    #who-reads-grid>.booki-slot-owned-card,#club-students-grid>.booki-slot-owned-card{box-shadow:0 7px 18px rgba(70,90,80,.14),inset 0 0 0 1px rgba(80,80,80,.05),0 0 0 2px rgba(255,255,255,.72)!important}
  `;
  document.head.appendChild(style);

  function patchVisibleUI(){
    sanitizeNewClubStep();
    sanitizeTopUpPanel();
    paintKnownSlots($('who-reads-grid'));
    paintKnownSlots($('club-students-grid'));
  }

  const observer = new MutationObserver(()=>{
    if (patchQueued) return;
    patchQueued = true;
    queueMicrotask(()=>{patchQueued=false;patchVisibleUI();});
  });
  observer.observe(document.body,{childList:true,subtree:true});
  patchVisibleUI();

  window.BookiClassSlotsSafety = {deleteUnusedOpenSlots,paintKnownSlots};
})();