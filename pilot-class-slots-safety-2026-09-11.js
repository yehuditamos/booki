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

  // ── Preserve the child's chosen slot color after claim/personalization ──────
  function rememberSlots(memberships){
    (memberships || []).forEach(m => {
      const stable = [...String(m.userId||'')].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,0);
      const n = Number(m.cardNumber) || slotNumber(m.name) || (stable % PALETTE.length)+1;
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
    .booki-slot-badge{display:none!important}
    #who-reads-grid>.booki-slot-owned-card,#club-students-grid>.booki-slot-owned-card{box-shadow:0 7px 18px rgba(70,90,80,.14),inset 0 0 0 1px rgba(80,80,80,.05),0 0 0 2px rgba(255,255,255,.72)!important}
  `;
  document.head.appendChild(style);

  function patchVisibleUI(){
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

  window.BookiClassSlotsSafety = {paintKnownSlots};
})();