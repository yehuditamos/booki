/**
 * Booki pilot — manual prepared names consume an existing open class slot.
 * A teacher adding "Dana Cohen" while free coloured cards exist should not create
 * an extra 21st card; one free card becomes Dana's prepared card instead.
 */
(function(){
  'use strict';
  if (window.BookiManualNameSlot20260911) return;
  window.BookiManualNameSlot20260911 = true;

  const OPEN_PREFIX = 'כרטיס פנוי ';
  const PALETTE = [
    ['#FFE3A3','#F6B73C'], ['#D8F5E7','#59C58E'], ['#D9ECFF','#67A9E8'],
    ['#F0E2FF','#A77AE6'], ['#FFDDE6','#F07D9E'], ['#FFE8CF','#F0A45C'],
    ['#DDF4F7','#58B8C7'], ['#E6F0D3','#8FB75A'], ['#FCE1F5','#D47EBE'],
    ['#E6E3FF','#8F82D9'], ['#FFF1B8','#E2B536'], ['#DCEBFF','#729ADF']
  ];
  const repairedClubs = new Set();

  const isOpen = m => String(m?.name || '').startsWith(OPEN_PREFIX)
    && !m?.claimedByUid && m?.personalized !== true;
  const norm = value => String(value || '').trim().replace(/\s+/g,' ').toLowerCase();
  const slotNumber = member => {
    const explicit = Number(member?.slotNumber);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const match = String(member?.name || '').match(/כרטיס פנוי\s*(\d+)/);
    return match ? Number(match[1]) : null;
  };
  const stamp = member => {
    const raw = member?.updatedAt || member?.joinedAt || member?.createdAt || '';
    const n = Date.parse(raw);
    return Number.isFinite(n) ? n : 0;
  };

  async function loadMembers(clubId){
    if (!window.db || !clubId) return [];
    const snap = await window.db.collection('clubs').doc(clubId).collection('memberships').get();
    return snap.docs.map(doc => ({...doc.data(), userId:doc.data().userId || doc.id}))
      .filter(member => member.status !== 'left');
  }

  async function effectiveName(member){
    try {
      if (window.BookiClassSlots?.effectiveName) {
        return String(await window.BookiClassSlots.effectiveName(member) || '').trim();
      }
    } catch (_) {}
    return isOpen(member) ? '' : String(member?.name || '').trim();
  }

  async function syncMemberCount(clubId){
    try {
      const members = await loadMembers(clubId);
      await window.db.collection('clubs').doc(clubId).set({
        memberCount: members.length,
        updatedAt: new Date().toISOString()
      }, {merge:true});
    } catch (error) {
      console.warn('[manual-name-slot] memberCount sync failed', error);
    }
  }

  async function convertSlotToName(clubId, slot, name, sourceCard){
    if (!window.db || !clubId || !slot?.userId || !name) throw new Error('missing-data');
    const clubRef = window.db.collection('clubs').doc(clubId);
    const slotRef = clubRef.collection('memberships').doc(slot.userId);
    const originalSlot = {...slot, userId:slot.userId};
    const number = slotNumber(slot);
    const source = sourceCard ? {...sourceCard} : originalSlot;
    const now = new Date().toISOString();

    const converted = {
      ...source,
      userId: slot.userId,
      clubId,
      name,
      slotNumber: number,
      createdByTeacher: true,
      personalized: false,
      claimedByUid: null,
      status: 'active',
      preparedByTeacher: true,
      convertedFromOpenSlot: true,
      updatedAt: now,
    };
    // Do not carry a foreign document id into the converted card.
    delete converted.id;
    delete converted.docId;

    // Rules currently permit teachers to delete + create a pristine teacher card,
    // but not to rename an existing membership via update. Do the conversion with
    // an explicit rollback so a failed create never destroys the free card.
    await slotRef.delete();
    try {
      await slotRef.set(converted);
    } catch (error) {
      try { await slotRef.set(originalSlot); } catch (_) {}
      throw error;
    }

    if (sourceCard?.userId && sourceCard.userId !== slot.userId) {
      const sourceRef = clubRef.collection('memberships').doc(sourceCard.userId);
      try {
        await sourceRef.delete();
      } catch (error) {
        // Roll back the conversion rather than leave two copies of the same child.
        try { await slotRef.delete(); } catch (_) {}
        try { await slotRef.set(originalSlot); } catch (_) {}
        throw error;
      }
    }

    await syncMemberCount(clubId);
    return {ok:true, userId:slot.userId, convertedSlot:true, slotNumber:number};
  }

  const previousAddStudent = window.fbTeacherAddStudent;
  if (typeof previousAddStudent === 'function') {
    window.fbTeacherAddStudent = async function(clubId, opts){
      const cleanName = String(opts?.name || '').trim().replace(/\s+/g,' ');
      // Slot generation itself still goes through the original Firebase helper.
      if (!cleanName || cleanName.startsWith(OPEN_PREFIX) || !window.db) {
        return previousAddStudent.apply(this, arguments);
      }

      let members;
      try { members = await loadMembers(clubId); }
      catch (_) { return previousAddStudent.apply(this, arguments); }

      const openSlots = members.filter(isOpen).sort((a,b)=>(slotNumber(a)||999)-(slotNumber(b)||999));
      if (!openSlots.length) return previousAddStudent.apply(this, arguments);

      // Duplicate detection includes names stored in claimed slot profiles, not only membership.name.
      let duplicate = null;
      for (const member of members) {
        const display = await effectiveName(member);
        if (display && norm(display) === norm(cleanName)) { duplicate = member; break; }
      }

      if (duplicate) {
        // This also repairs the exact bug seen in the pilot: a manual named card was
        // created next to the 20 slots. Re-entering the same name will merge that
        // unclaimed card into a free coloured slot instead of reporting a duplicate.
        const canMergeDetached = duplicate.createdByTeacher === true
          && !duplicate.claimedByUid
          && duplicate.personalized !== true
          && !isOpen(duplicate)
          && !Number.isFinite(Number(duplicate.slotNumber));
        if (!canMergeDetached) return {ok:false, reason:'duplicate-name'};
        try { return await convertSlotToName(clubId, openSlots[0], cleanName, duplicate); }
        catch (error) {
          console.warn('[manual-name-slot] merge detached prepared card failed', error);
          return {ok:false, reason:error?.code === 'permission-denied' ? 'permission' : 'save-failed'};
        }
      }

      try {
        return await convertSlotToName(clubId, openSlots[0], cleanName, null);
      } catch (error) {
        console.warn('[manual-name-slot] convert open slot failed', error);
        return {ok:false, reason:error?.code === 'permission-denied' ? 'permission' : 'save-failed'};
      }
    };
  }

  // Preserve the slot colour even though its visible name is now the child's name.
  if (typeof window._renderFirebaseMemberGrid === 'function') {
    const previousRender = window._renderFirebaseMemberGrid;
    window._renderFirebaseMemberGrid = function(grid, memberships, clubId){
      const result = previousRender.apply(this, arguments);
      (memberships || []).forEach(member => {
        const n = Number(member?.slotNumber);
        if (!Number.isFinite(n) || n < 1) return;
        const card = [...(grid?.querySelectorAll?.('.profile-card[data-user-id]') || [])]
          .find(el => String(el.dataset.userId) === String(member.userId));
        if (!card) return;
        const [a,b] = PALETTE[(n-1) % PALETTE.length];
        card.classList.add('booki-slot-color-identity','booki-slot-owned-card');
        card.style.setProperty('--booki-slot-a',a);
        card.style.setProperty('--booki-slot-b',b);
      });
      return result;
    };
  }

  // One conservative repair for cards already created before this patch:
  // only an unclaimed named card created AFTER the open slots is considered detached.
  async function repairDetachedCards(clubId){
    if (!clubId || repairedClubs.has(clubId) || !window.db) return false;
    repairedClubs.add(clubId);
    let members;
    try { members = await loadMembers(clubId); } catch (_) { return false; }
    let openSlots = members.filter(isOpen).sort((a,b)=>(slotNumber(a)||999)-(slotNumber(b)||999));
    if (!openSlots.length) return false;
    const newestOpenTime = Math.max(0, ...openSlots.map(stamp));
    if (!newestOpenTime) return false;

    const candidates = members.filter(member => {
      if (member.createdByTeacher !== true || member.claimedByUid || member.personalized === true) return false;
      if (isOpen(member) || Number.isFinite(Number(member.slotNumber))) return false;
      const stats = member.cachedStats || {};
      const hasReading = Number(stats.totalMinutes || 0) > 0 || Number(stats.totalSessions || 0) > 0;
      return !hasReading && stamp(member) > newestOpenTime + 500;
    }).sort((a,b)=>stamp(a)-stamp(b));

    let changed = false;
    for (const candidate of candidates) {
      if (!openSlots.length) break;
      try {
        const slot = openSlots.shift();
        await convertSlotToName(clubId, slot, String(candidate.name || '').trim(), candidate);
        changed = true;
      } catch (error) {
        console.warn('[manual-name-slot] automatic detached-card repair stopped', error);
        break;
      }
    }
    return changed;
  }

  function currentClubId(){
    try { if (typeof _activeClubId !== 'undefined' && _activeClubId) return _activeClubId; } catch (_) {}
    return window.currentClubId || null;
  }

  const observer = new MutationObserver(async () => {
    if (!document.getElementById('screen-club-students')?.classList.contains('active')) return;
    if (typeof getCurrentTeacher !== 'function' || !getCurrentTeacher()) return;
    const clubId = currentClubId();
    const changed = await repairDetachedCards(clubId);
    if (changed && typeof showClubStudents === 'function') setTimeout(()=>showClubStudents(),150);
  });
  document.querySelectorAll('.screen').forEach(screen => observer.observe(screen,{attributes:true,attributeFilter:['class']}));

  if (document.getElementById('screen-club-students')?.classList.contains('active')
      && typeof getCurrentTeacher === 'function' && getCurrentTeacher()) {
    repairDetachedCards(currentClubId()).then(changed => {
      if (changed && typeof showClubStudents === 'function') showClubStudents();
    });
  }

  window.BookiManualNameSlot = { convertSlotToName, repairDetachedCards };
})();