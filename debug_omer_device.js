(async function () {
  var CARD_ID  = 'wDtkRgu7DeO9NlbTg8yQpvPVGGy2';
  var CLUB_ID  = 'מיתרים-קרית-כיתה-א-1782828189299';

  var db   = window.db;
  var auth = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth() : null;

  console.log('=== AUTH STATE ===');
  var user = auth ? auth.currentUser : null;
  console.log('currentUser uid:    ', user ? user.uid : 'NOT SIGNED IN');
  console.log('isAnonymous:        ', user ? user.isAnonymous : 'N/A');
  console.log('uid matches card:   ', user ? (user.uid === CARD_ID) : false);

  console.log('');
  console.log('=== APP STATE ===');
  console.log('window.currentClubId: ', window.currentClubId);
  console.log('currentStudentId:     ', typeof currentStudentId !== 'undefined' ? currentStudentId : '(not accessible)');
  console.log('clubId matches:       ', window.currentClubId === CLUB_ID);

  if (!db) { console.error('window.db not found'); return; }

  console.log('');
  console.log('=== CARD IN FIRESTORE ===');
  var snap = await db.collection('clubs').doc(CLUB_ID).collection('memberships').doc(CARD_ID).get();
  if (!snap.exists) { console.error('card not found'); return; }
  var m = snap.data();
  console.log('clubId field on card: ', m.clubId);
  console.log('userId field on card: ', m.userId);
  console.log('status:               ', m.status);
  console.log('cachedStats:          ', JSON.stringify(m.cachedStats || {}));

  console.log('');
  console.log('=== WRITE TEST (1 minute) ===');
  if (!user) { console.error('BLOCKED: not signed in at all'); return; }
  if (user.uid !== CARD_ID) {
    console.error('BLOCKED: auth UID (' + user.uid + ') != card ID (' + CARD_ID + ')');
    console.error('This is why minutes are not saving — the student is on a different session/device.');
    return;
  }
  if (!window.currentClubId) {
    console.error('BLOCKED: window.currentClubId is not set — club context missing');
    return;
  }

  try {
    await db.collection('clubs').doc(CLUB_ID).collection('memberships').doc(CARD_ID).set({
      cachedStats: {
        totalMinutes:  firebase.firestore.FieldValue.increment(0),
        totalSessions: firebase.firestore.FieldValue.increment(0),
        totalPoints:   firebase.firestore.FieldValue.increment(0),
        totalBooks:    firebase.firestore.FieldValue.increment(0),
        appMinutes:    firebase.firestore.FieldValue.increment(0),
        bookMinutes:   firebase.firestore.FieldValue.increment(0),
        lastReadAt:    null,
      },
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    console.log('WRITE TEST: SUCCESS — rules allow this write');
  } catch (e) {
    console.error('WRITE TEST FAILED:', e.code, e.message);
  }
})();
