(async function () {
  var db = window.db;
  if (!db) return console.error('[fix] window.db not found');

  var CLUB_ID = window.currentClubId;
  if (!CLUB_ID) return console.error('[fix] currentClubId not set');

  var OLD_CARD_ID = 'HHAYY0VmFTZLO3DiYVvtA3vP1xA3';

  // ── STEP 1: read old card ──────────────────────────────────────────────
  console.log('[fix] step 1: reading old card...');
  var oldSnap = await db.collection('clubs').doc(CLUB_ID)
    .collection('memberships').doc(OLD_CARD_ID).get();

  if (!oldSnap.exists) {
    return console.error('[fix] old card not found — aborting');
  }

  var old = oldSnap.data();
  console.log('[fix] old card name:', old.name, '| status:', old.status, '| totalMinutes:', (old.cachedStats || {}).totalMinutes);

  if (old.status === 'left') {
    return console.error('[fix] old card already has status:left — already migrated? aborting');
  }

  // ── STEP 2: generate new card id ───────────────────────────────────────
  var NEW_CARD_ID = 'student_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  console.log('[fix] step 2: new card id will be:', NEW_CARD_ID);

  // ── STEP 3: check new card does not already exist ──────────────────────
  var newSnap = await db.collection('clubs').doc(CLUB_ID)
    .collection('memberships').doc(NEW_CARD_ID).get();

  if (newSnap.exists) {
    return console.error('[fix] new card id collision — aborting (retry)');
  }

  // ── STEP 4: build new card document ───────────────────────────────────
  var oldStats = old.cachedStats || {};
  var now = new Date().toISOString();

  var newCard = {
    userId:           NEW_CARD_ID,
    clubId:           CLUB_ID,
    name:             old.name  || '',
    emoji:            old.emoji || '📚',
    role:             'member',
    status:           'active',
    inviteSource:     'pre-created',
    invitationId:     null,
    createdByTeacher: true,
    personalized:     false,
    claimedByUid:     null,
    permissions: {
      canViewLeaderboard: true,
      canAddMembers:      false,
      canEditClub:        false,
    },
    joinedAt:  old.joinedAt || now,
    leftAt:    null,
    cachedStats: {
      totalMinutes:  oldStats.totalMinutes  || 0,
      totalSessions: oldStats.totalSessions || 0,
      totalPoints:   oldStats.totalPoints   || 0,
      totalBooks:    oldStats.totalBooks    || 0,
      appMinutes:    oldStats.appMinutes    || 0,
      bookMinutes:   oldStats.bookMinutes   || 0,
      lastReadAt:    oldStats.lastReadAt    || null,
    },
    migratedFrom: OLD_CARD_ID,
    updatedAt:    now,
  };

  // ── STEP 5: write new card ─────────────────────────────────────────────
  console.log('[fix] step 5: creating new card...');
  try {
    await db.collection('clubs').doc(CLUB_ID)
      .collection('memberships').doc(NEW_CARD_ID).set(newCard);
    console.log('[fix] new card created:', NEW_CARD_ID);
  } catch (e) {
    return console.error('[fix] FAILED to create new card — aborting before touching old card. error:', e.message);
  }

  // ── STEP 6: mark old card as left ──────────────────────────────────────
  console.log('[fix] step 6: marking old card as left...');
  try {
    await db.collection('clubs').doc(CLUB_ID)
      .collection('memberships').doc(OLD_CARD_ID).set(
        { status: 'left', migratedTo: NEW_CARD_ID, updatedAt: now },
        { merge: true }
      );
    console.log('[fix] old card marked left');
  } catch (e) {
    console.error('[fix] FAILED to mark old card left. New card was already created:', NEW_CARD_ID);
    console.error('[fix] manually mark old card left or delete new card. error:', e.message);
    return;
  }

  // ── STEP 7: verify ────────────────────────────────────────────────────
  console.log('[fix] step 7: verifying...');
  var verifyNew = await db.collection('clubs').doc(CLUB_ID)
    .collection('memberships').doc(NEW_CARD_ID).get();
  var verifyOld = await db.collection('clubs').doc(CLUB_ID)
    .collection('memberships').doc(OLD_CARD_ID).get();

  console.log('');
  console.log('=== VERIFICATION ===');
  console.log('new card exists:         ', verifyNew.exists);
  console.log('new card name:           ', verifyNew.data().name);
  console.log('new card userId:         ', verifyNew.data().userId);
  console.log('new card status:         ', verifyNew.data().status);
  console.log('new card createdByTeacher:', verifyNew.data().createdByTeacher);
  console.log('new card totalMinutes:   ', verifyNew.data().cachedStats.totalMinutes);
  console.log('new card migratedFrom:   ', verifyNew.data().migratedFrom);
  console.log('---');
  console.log('old card status:         ', verifyOld.data().status);
  console.log('old card migratedTo:     ', verifyOld.data().migratedTo);
  console.log('=== DONE ===');
})();
