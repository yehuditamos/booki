(async function () {
  var db = window.db;
  if (!db) return console.error('[dry-run] window.db not found');

  var CLUB_ID = window.currentClubId;
  if (!CLUB_ID) return console.error('[dry-run] currentClubId not set');

  var OLD_CARD_ID = 'HHAYY0VmFTZLO3DiYVvtA3vP1xA3';

  // 1. Read old card
  var snap = await db.collection('clubs').doc(CLUB_ID).collection('memberships').doc(OLD_CARD_ID).get();
  if (!snap.exists) return console.error('[dry-run] old card not found:', OLD_CARD_ID);

  var old = snap.data();

  console.log('=== OLD CARD (current state) ===');
  console.log('studentCardId:', OLD_CARD_ID);
  console.log('name:         ', old.name);
  console.log('userId:       ', old.userId);
  console.log('status:       ', old.status);
  console.log('createdByTeacher:', old.createdByTeacher);
  console.log('personalized:    ', old.personalized);
  console.log('claimedByUid:    ', old.claimedByUid);
  console.log('cachedStats:');
  console.log(JSON.stringify(old.cachedStats || {}, null, 4));

  // 2. Generate new card ID (same format as fbTeacherAddStudent)
  var NEW_CARD_ID = 'student_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // 3. Build new card (no write)
  var cachedStats = old.cachedStats || {};
  var newCard = {
    userId:           NEW_CARD_ID,
    clubId:           CLUB_ID,
    name:             old.name  || 'omri',
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
    joinedAt:   old.joinedAt || new Date().toISOString(),
    leftAt:     null,
    cachedStats: {
      totalMinutes:  cachedStats.totalMinutes  || 0,
      totalSessions: cachedStats.totalSessions || 0,
      totalPoints:   cachedStats.totalPoints   || 0,
      totalBooks:    cachedStats.totalBooks     || 0,
      appMinutes:    cachedStats.appMinutes     || 0,
      bookMinutes:   cachedStats.bookMinutes    || 0,
      lastReadAt:    cachedStats.lastReadAt     || null,
    },
    migratedFrom: OLD_CARD_ID,
    updatedAt:    new Date().toISOString(),
  };

  console.log('');
  console.log('=== NEW CARD (would be created) ===');
  console.log('studentCardId (document ID):', NEW_CARD_ID);
  console.log(JSON.stringify(newCard, null, 4));

  // 4. Show what old card would look like after migration
  var oldCardUpdate = {
    status:     'left',
    migratedTo: NEW_CARD_ID,
    updatedAt:  new Date().toISOString(),
  };

  console.log('');
  console.log('=== OLD CARD AFTER MIGRATION (only these fields change) ===');
  console.log('document:', OLD_CARD_ID);
  console.log(JSON.stringify(oldCardUpdate, null, 4));

  console.log('');
  console.log('=== SUMMARY (NO WRITES PERFORMED) ===');
  console.log('old card id:    ', OLD_CARD_ID);
  console.log('new card id:    ', NEW_CARD_ID);
  console.log('totalMinutes:   ', (old.cachedStats || {}).totalMinutes || 0);
  console.log('totalSessions:  ', (old.cachedStats || {}).totalSessions || 0);
  console.log('action pending: create new + mark old left');
})();
