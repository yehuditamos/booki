(async function () {
  var db = window.db;
  if (!db) return console.error('[check] window.db not found');

  var CLUB_ID = window.currentClubId;
  if (!CLUB_ID) return console.error('[check] currentClubId not set');

  var CARD_ID = 'HHAYY0VmFTZLO3DiYVvtA3vP1xA3';

  var snap = await db.collection('clubs').doc(CLUB_ID).collection('memberships').doc(CARD_ID).get();

  if (!snap.exists) {
    return console.error('[check] document not found:', CARD_ID);
  }

  var m = snap.data();

  console.log('[check] name:        ', m.name);
  console.log('[check] userId:      ', m.userId);
  console.log('[check] status:      ', m.status);
  console.log('[check] personalized:', m.personalized);
  console.log('[check] claimedByUid:', m.claimedByUid);
  console.log('[check] cachedStats: ', JSON.stringify(m.cachedStats, null, 2));
})();
