(async function () {
  var db      = window.db;
  var CLUB    = 'מיתרים-קרית-כיתה-א-1782828189299';
  var OLD_ID  = 'wDtkRgu7DeO9NlbTg8yQpvPVGGy2';
  var now     = new Date().toISOString();

  var oldSnap = await db.collection('clubs').doc(CLUB).collection('memberships').doc(OLD_ID).get();
  if (!oldSnap.exists) return console.error('[fix] old card not found');
  var old = oldSnap.data();
  if (old.status === 'left') return console.error('[fix] already migrated');

  var newId   = 'student_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  var stats   = old.cachedStats || {};

  var newCard = {
    userId: newId, clubId: CLUB, name: old.name || 'עומר לבהר',
    emoji: old.emoji || '📚', role: 'member', status: 'active',
    inviteSource: 'pre-created', invitationId: null,
    createdByTeacher: true, personalized: false, claimedByUid: null,
    permissions: { canViewLeaderboard: true, canAddMembers: false, canEditClub: false },
    joinedAt: old.joinedAt || now, leftAt: null,
    cachedStats: {
      totalMinutes: stats.totalMinutes || 0, totalSessions: stats.totalSessions || 0,
      totalPoints: stats.totalPoints || 0, totalBooks: stats.totalBooks || 0,
      appMinutes: stats.appMinutes || 0, bookMinutes: stats.bookMinutes || 0,
      lastReadAt: stats.lastReadAt || null,
    },
    migratedFrom: OLD_ID, updatedAt: now,
  };

  await db.collection('clubs').doc(CLUB).collection('memberships').doc(newId).set(newCard);
  console.log('[fix] new card created:', newId);

  await db.collection('clubs').doc(CLUB).collection('memberships').doc(OLD_ID)
    .set({ status: 'left', migratedTo: newId, updatedAt: now }, { merge: true });
  console.log('[fix] old card marked left');
  console.log('[fix] DONE — עומר לבהר: new card =', newId);
})();
