(async function () {
  var db = window.db;
  if (!db) return console.error('[audit] window.db not found');

  console.log('[audit] searching all clubs for omer lavhar...');

  var clubsSnap = await db.collection('clubs').get();
  var found = [];

  for (var ci = 0; ci < clubsSnap.docs.length; ci++) {
    var clubDoc = clubsSnap.docs[ci];
    var clubId   = clubDoc.id;
    var clubName = (clubDoc.data().name || clubId);

    var mSnap = await db.collection('clubs').doc(clubId).collection('memberships').get();
    mSnap.forEach(function (d) {
      var m = d.data();
      var name = (m.name || '').trim();
      if (name.includes('עומר') || name.includes('לבהר')) {
        found.push({ clubId: clubId, clubName: clubName, docId: d.id, data: m });
      }
    });
  }

  if (!found.length) {
    console.warn('[audit] no card found for omer lavhar in any club');
    return;
  }

  found.forEach(function (item) {
    var m = item.data;
    console.log('');
    console.log('=== CARD FOUND ===');
    console.log('club:             ', item.clubName, '(', item.clubId, ')');
    console.log('docId:            ', item.docId);
    console.log('name:             ', m.name);
    console.log('userId (field):   ', m.userId);
    console.log('status:           ', m.status);
    console.log('createdByTeacher: ', m.createdByTeacher);
    console.log('personalized:     ', m.personalized);
    console.log('claimedByUid:     ', m.claimedByUid);
    console.log('cachedStats:      ', JSON.stringify(m.cachedStats || {}, null, 2));
    console.log('docId == userId:  ', item.docId === m.userId);
  });
})();
