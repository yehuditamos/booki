(async function () {
  var db = window.db;
  if (!db) return console.error('[diagnose] window.db not found - open the app first');

  var NAME = 'יונתן';
  console.log('[diagnose] searching solo (personal-card) profiles for name ==', NAME);

  var found = [];
  try {
    var snap = await db.collectionGroup('profile').where('name', '==', NAME).get();
    snap.forEach(function (d) {
      // doc path is users/{uid}/profile/main — the uid is the parent-of-parent id
      var uid = d.ref.parent.parent.id;
      found.push({ uid: uid, data: d.data() });
    });
  } catch (e) {
    console.error('[diagnose] collectionGroup query failed — if the message mentions a missing index, ' +
      'click the link Firestore gives you to create it, then re-run this script:', e.message);
    return;
  }

  if (!found.length) {
    console.log('[diagnose] no profile found with name exactly "' + NAME + '". If the stored spelling/nikud ' +
      'differs, edit the NAME variable at the top of this script and re-run.');
    return;
  }

  console.log('[diagnose] found', found.length, 'profile(s) named', NAME);

  for (var i = 0; i < found.length; i++) {
    var uid = found[i].uid;
    var profile = found[i].data;
    console.log('─────────────────────────────────────');
    console.log('uid:                 ', uid);
    console.log('name:                ', profile.name);
    console.log('emoji:               ', profile.emoji);
    console.log('stored totalMinutes: ', profile.totalMinutes, '| points:', profile.points, '| storiesRead:', profile.storiesRead);
    console.log('updatedAt:           ', profile.updatedAt);

    try {
      var sSnap = await db.collection('users').doc(uid).collection('readingSessions').get();
      var totalMin = 0, totalPts = 0, books = 0;
      var sessions = [];
      sSnap.forEach(function (sd) {
        var s = sd.data();
        totalMin += s.minutes || 0;
        totalPts += s.points || 0;
        if (s.type === 'book') books++;
        sessions.push(s);
      });
      sessions.sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
      sessions.forEach(function (s) {
        var label = s.storyTitle || s.bookTitle || '';
        console.log('  session:', s.date, '|', s.type, '|', s.minutes, 'min |', s.points, 'pts', label ? '| ' + label : '');
      });
      console.log('readingSessions sub-collection count:', sSnap.size);
      console.log('sum from readingSessions -> minutes:', totalMin, '| points:', totalPts, '| books:', books);
      if (totalMin !== (profile.totalMinutes || 0)) {
        console.log('⚠️ MISMATCH: sessions total (' + totalMin + ' min) != stored profile.totalMinutes (' +
          (profile.totalMinutes || 0) + ') — this looks like exactly the localStorage-reset bug.');
      } else {
        console.log('✅ stored total matches the sessions sum — no data loss detected for this profile.');
      }
    } catch (e) {
      console.warn('readingSessions read error:', e.message);
    }
  }

  window._yonatanProfiles = found;
  console.log('[diagnose] full data saved to window._yonatanProfiles — tell Claude the uid + numbers you want restored.');
})();
