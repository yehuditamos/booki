(async function () {
  var db = window.db;
  if (!db) {
    return console.error('[audit] window.db not found - open the app first');
  }

  var CLUB_ID = window.currentClubId;
  if (!CLUB_ID) {
    return console.error('[audit] currentClubId not set. Run: window.currentClubId = "your-club-id"');
  }

  console.log('[audit] club id:', CLUB_ID);

  var teacherUids = new Set();
  var teacherNames = {};

  var uSnap = await db.collection('users').where('role', 'in', ['teacher', 'owner']).get();
  uSnap.forEach(function (d) {
    teacherUids.add(d.id);
    teacherNames[d.id] = d.data().name || d.data().email || d.id;
  });

  console.log('[audit] teachers found:', teacherUids.size);
  teacherUids.forEach(function (uid) {
    console.log('  -', teacherNames[uid], '|', uid);
  });

  var mSnap = await db.collection('clubs').doc(CLUB_ID).collection('memberships').get();
  console.log('[audit] total membership cards:', mSnap.size);

  var rows = [];

  for (var i = 0; i < mSnap.docs.length; i++) {
    var d = mSnap.docs[i];
    var m = d.data();
    var flags = [];

    if (m.userId && teacherUids.has(m.userId)) {
      flags.push('RED: userId is teacher (' + teacherNames[m.userId] + ')');
    }

    if (m.claimedByUid && teacherUids.has(m.claimedByUid)) {
      flags.push('ORANGE: claimedByUid is teacher (' + teacherNames[m.claimedByUid] + ')');
    }

    if (!m.userId) {
      flags.push('RED: userId is missing');
    } else {
      try {
        var pSnap = await db.collection('users').doc(m.userId).collection('profile').doc('main').get();
        if (!pSnap.exists) {
          flags.push('GRAY: no profile document');
        } else {
          var profileName = (pSnap.data().name || '').trim();
          var cardName = (m.name || '').trim();
          if (profileName && cardName && profileName !== cardName) {
            flags.push('YELLOW: profile name "' + profileName + '" differs from card name "' + cardName + '"');
          }
        }
      } catch (e) {
        flags.push('WARN: profile fetch error: ' + e.message);
      }
    }

    rows.push({
      studentCardId:    d.id,
      name:             m.name             || '-',
      userId:           m.userId           || '-',
      claimedByUid:     m.claimedByUid     || '-',
      createdByTeacher: m.createdByTeacher || false,
      personalized:     m.personalized     || false,
      flags:            flags.length > 0 ? flags.join(' | ') : 'OK',
    });
  }

  console.table(rows);

  window._auditRows = rows;

  var problems = rows.filter(function (r) { return r.flags !== 'OK'; });
  console.log('[audit] problems:', problems.length, '| ok:', rows.length - problems.length);
  console.log('[audit] full results saved to window._auditRows');
})();
