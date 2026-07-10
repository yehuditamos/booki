(async function () {
  var db  = window.db;
  var now = new Date().toISOString();

  var clubsSnap = await db.collection('clubs').get();
  var found = [];
  for (var ci = 0; ci < clubsSnap.docs.length; ci++) {
    var clubDoc = clubsSnap.docs[ci];
    var mSnap   = await db.collection('clubs').doc(clubDoc.id).collection('memberships').get();
    mSnap.forEach(function (d) {
      var name = (d.data().name || '').trim();
      if (name.includes('שירה') && name.includes('דהן')) {
        found.push({ clubId: clubDoc.id, clubName: clubDoc.data().name, docId: d.id, data: d.data() });
      }
    });
  }

  if (!found.length) return console.error('[fix] שירה דהן not found');

  for (var fi = 0; fi < found.length; fi++) {
    var item = found[fi];
    var m    = item.data;
    console.log('[fix] found:', item.clubName, '| card:', item.docId,
      '| status:', m.status, '| totalMinutes:', (m.cachedStats || {}).totalMinutes);

    if (m.status === 'left') { console.log('[fix] skipping — already left'); continue; }

    var OLD_ID = item.docId;
    var CLUB   = item.clubId;
    var newId  = 'student_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var stats  = m.cachedStats || {};

    var newCard = {
      userId: newId, clubId: CLUB, name: m.name || 'שירה דהן',
      emoji: m.emoji || '📚', role: 'member', status: 'active',
      inviteSource: 'pre-created', invitationId: null,
      createdByTeacher: true, personalized: false, claimedByUid: null,
      permissions: { canViewLeaderboard: true, canAddMembers: false, canEditClub: false },
      joinedAt: m.joinedAt || now, leftAt: null,
      cachedStats: {
        totalMinutes:  stats.totalMinutes  || 0,
        totalSessions: stats.totalSessions || 0,
        totalPoints:   stats.totalPoints   || 0,
        totalBooks:    stats.totalBooks    || 0,
        appMinutes:    stats.appMinutes    || 0,
        bookMinutes:   stats.bookMinutes   || 0,
        lastReadAt:    stats.lastReadAt    || null,
      },
      migratedFrom: OLD_ID, updatedAt: now,
    };

    await db.collection('clubs').doc(CLUB).collection('memberships').doc(newId).set(newCard);
    console.log('[fix] new card:', newId);

    await db.collection('clubs').doc(CLUB).collection('memberships').doc(OLD_ID)
      .set({ status: 'left', migratedTo: newId, updatedAt: now }, { merge: true });
    console.log('[fix] DONE — שירה דהן: new card =', newId);
  }
})();
