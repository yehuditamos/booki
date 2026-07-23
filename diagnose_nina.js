(async function () {
  var db = window.db;
  if (!db) return console.error('[diagnose] window.db not found - open the app first');

  var CLUB_ID = 'מיתרים-קרית-כיתה-א-1782828189299';
  console.log('[diagnose] club id:', CLUB_ID);

  var teacherUids = new Set();
  var teacherNames = {};
  var uSnap = await db.collection('users').where('role', 'in', ['teacher', 'owner']).get();
  uSnap.forEach(function (d) {
    teacherUids.add(d.id);
    teacherNames[d.id] = d.data().name || d.data().email || d.id;
  });

  var mSnap = await db.collection('clubs').doc(CLUB_ID).collection('memberships').get();
  var found = [];
  mSnap.forEach(function (d) {
    var name = (d.data().name || '').trim();
    if (name.includes('נינה')) found.push({ docId: d.id, data: d.data() });
  });

  if (!found.length) return console.error('[diagnose] נינה not found in this club');

  console.log('[diagnose] found', found.length, 'card(s) for נינה');

  for (var i = 0; i < found.length; i++) {
    var docId = found[i].docId;
    var m = found[i].data;
    console.log('─────────────────────────────────────');
    console.log('cardId:          ', docId);
    console.log('name:            ', m.name);
    console.log('status:          ', m.status);
    console.log('userId:          ', m.userId, teacherUids.has(m.userId) ? '⚠️ MATCHES A TEACHER UID' : '');
    console.log('claimedByUid:    ', m.claimedByUid, (m.claimedByUid && teacherUids.has(m.claimedByUid)) ? '⚠️ MATCHES A TEACHER UID' : '');
    console.log('createdByTeacher:', m.createdByTeacher);
    console.log('personalized:    ', m.personalized);
    console.log('migratedFrom:    ', m.migratedFrom || '-');
    console.log('migratedTo:      ', m.migratedTo   || '-');
    console.log('cachedStats:     ', JSON.stringify(m.cachedStats || {}, null, 2));

    // Sessions actually recorded under this card
    try {
      var sSnap = await db.collection('clubs').doc(CLUB_ID)
        .collection('memberships').doc(docId).collection('sessions').get();
      console.log('sessions sub-collection count:', sSnap.size);
      var totalMin = 0, totalPts = 0, books = 0;
      sSnap.forEach(function (sd) {
        var s = sd.data();
        totalMin += s.minutes || 0;
        totalPts += s.points || 0;
        if (s.type === 'book') books++;
        console.log('  session:', s.date, '|', s.type, '|', s.minutes, 'min |', s.points, 'pts', s.bookTitle ? '| ' + s.bookTitle : '');
      });
      console.log('sum from sessions -> minutes:', totalMin, '| points:', totalPts, '| books:', books);
      if (totalPts !== (m.cachedStats || {}).totalPoints) {
        console.log('⚠️ MISMATCH: sessions total points (' + totalPts + ') != cachedStats.totalPoints (' + (m.cachedStats||{}).totalPoints + ')');
      }
    } catch (e) {
      console.warn('sessions read error:', e.message);
    }

    // Profile check (only meaningful if userId isn't a plain student_ card id)
    if (m.userId) {
      try {
        var pSnap = await db.collection('users').doc(m.userId).collection('profile').doc('main').get();
        console.log('profile doc exists:', pSnap.exists, pSnap.exists ? JSON.stringify(pSnap.data()) : '');
      } catch (e) {
        console.warn('profile read error:', e.message);
      }
    }
  }

  window._ninaCards = found;
  console.log('[diagnose] full card data saved to window._ninaCards');
})();
