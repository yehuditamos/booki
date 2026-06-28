/**
 * firebase-clubs.js — Club System Firebase Layer
 *
 * מכסה את שש הישויות:
 *   User             /users/{userId}
 *   UserProfile      /users/{userId}/profile
 *   ReadingSession   /users/{userId}/readingSessions/{sessionId}
 *   Club             /clubs/{clubId}
 *   ClubMembership   /clubs/{clubId}/memberships/{userId}
 *   ClubInvitation   /invitations/{code}
 *
 * עקרונות:
 *   - ReadingSession שייך למשתמש בלבד. אין clubId על הסשן.
 *   - ClubMembership הוא מקור האמת לקשר User ↔ Club.
 *   - לא נוגע ב-firebase.js הקיים ולא ב-/students/ collection.
 */

// ─── עזרים פנימיים ───────────────────────────────────────────────────────────

function _db() {
  return window.db;
}

function _now() {
  return new Date().toISOString();
}

function _today() {
  return new Date().toISOString().slice(0, 10);
}

// ─── User ─────────────────────────────────────────────────────────────────────

/**
 * מבנה User:
 * {
 *   id:              string,    // מזהה ייחודי, קבוע לנצח
 *   name:            string,
 *   emoji:           string,
 *   legacyStudentId: string|null,  // גשר: "s1" → /students/s1 הקיים
 *   authMethod:      "manual"|"pin"|"google"|"magic-link",
 *   createdAt:       string,
 *   updatedAt:       string,
 * }
 * הערה: אין clubIds — ClubMembership הוא מקור האמת היחיד לקשר User ↔ Club.
 */

async function fbSaveUser(user) {
  if (!_db()) return;
  try {
    await _db().collection('users').doc(user.id).set(
      { ...user, updatedAt: _now() },
      { merge: true }
    );
  } catch (e) {
    console.warn('[firebase-clubs] fbSaveUser error:', e);
  }
}

async function fbLoadUser(userId) {
  if (!_db()) return null;
  try {
    const snap = await _db().collection('users').doc(userId).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.warn('[firebase-clubs] fbLoadUser error:', e);
    return null;
  }
}

// ─── UserProfile ──────────────────────────────────────────────────────────────

/**
 * מבנה UserProfile:
 * {
 *   userId:              string,
 *   name:                string|null,
 *   emoji:               string,
 *   ageGroup:            "grade-1"|"grade-2"|...|null,
 *   readingLevel:        "beginner"|"intermediate"|"advanced"|null,
 *   niqqudLevel:         "full"|"partial"|"none"|null,
 *   interests:           string[],   // ["animals","space","folk-tales",...]
 *   onboardingComplete:  boolean,
 *   onboardingCompletedAt: string|null,
 *   updatedAt:           string,
 * }
 */

async function fbSaveUserProfile(userId, profile) {
  if (!_db()) return;
  try {
    await _db().collection('users').doc(userId)
      .collection('profile').doc('main')
      .set({ ...profile, userId, updatedAt: _now() }, { merge: true });
  } catch (e) {
    console.warn('[firebase-clubs] fbSaveUserProfile error:', e);
  }
}

async function fbLoadUserProfile(userId) {
  if (!_db()) return null;
  try {
    const snap = await _db().collection('users').doc(userId)
      .collection('profile').doc('main').get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    console.warn('[firebase-clubs] fbLoadUserProfile error:', e);
    return null;
  }
}

/**
 * טוען פרופיל אם קיים; אחרת יוצר ממידע ברירת מחדל.
 * מאפשר "הכרטיס שלך כבר מחכה לך" — פרופיל pre-created ע"י המנהל.
 */
async function fbGetOrCreateUserProfile(userId, defaults = {}) {
  const existing = await fbLoadUserProfile(userId);
  if (existing) return existing;

  const profile = {
    userId,
    name:                  defaults.name  || null,
    emoji:                 defaults.emoji || '📚',
    ageGroup:              null,
    readingLevel:          null,
    niqqudLevel:           null,
    interests:             [],
    onboardingComplete:    true,
    onboardingCompletedAt: _now(),
  };
  await fbSaveUserProfile(userId, profile);
  return profile;
}

// ─── ReadingSession ───────────────────────────────────────────────────────────

/**
 * מבנה ReadingSession:
 * {
 *   id:       string,
 *   userId:   string,
 *   type:     "app"|"book",
 *
 *   // קריאה באפליקציה:
 *   storyId:    string|null,
 *   storyTitle: string|null,
 *
 *   // קריאה מספר:
 *   bookTitle:     string|null,
 *   bookAuthor:    string|null,
 *   pagesRead:     "1-5"|"6-10"|"11-20"|"21+"|null,
 *   comprehension: { character, plot, liked }|null,
 *
 *   minutes: number,
 *   points:  number,
 *
 *   // אין clubId — קריאה שייכת למשתמש בלבד.
 *   // מועדונים מחליטים האם הקריאה נספרת לפי חוקי המועדון ותקופת החברות.
 *
 *   date:      "YYYY-MM-DD",
 *   createdAt: string,
 * }
 */

/**
 * שומר סשן קריאה — additive לחלוטין, לא מחליף את fbSaveStudent().
 * @returns {Promise<string|null>} מזהה הסשן
 */
async function fbSaveReadingSession(userId, session) {
  if (!_db()) return null;
  try {
    const ref = _db().collection('users').doc(userId).collection('readingSessions').doc();
    const id = ref.id;
    const { clubId: _removed, ...cleanSession } = session; // מוודא שאין clubId
    await ref.set({
      ...cleanSession,
      id,
      userId,
      date:      session.date      ?? _today(),
      createdAt: session.createdAt ?? _now(),
    });
    return id;
  } catch (e) {
    console.warn('[firebase-clubs] fbSaveReadingSession error:', e);
    return null;
  }
}

/**
 * טוען סשני קריאה של משתמש.
 * @param {string} userId
 * @param {object} [opts]
 * @param {string} [opts.fromDate]  "YYYY-MM-DD"
 * @param {string} [opts.toDate]    "YYYY-MM-DD"
 */
async function fbLoadUserSessions(userId, opts = {}) {
  if (!_db()) return [];
  try {
    let query = _db().collection('users').doc(userId).collection('readingSessions');
    if (opts.fromDate) query = query.where('date', '>=', opts.fromDate);
    if (opts.toDate)   query = query.where('date', '<=', opts.toDate);
    const snap = await query.get();
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.warn('[firebase-clubs] fbLoadUserSessions error:', e);
    return [];
  }
}

// ─── Club ─────────────────────────────────────────────────────────────────────

async function fbCreateClub(club) {
  if (!_db()) return false;
  try {
    const ref = _db().collection('clubs').doc(club.id);
    if ((await ref.get()).exists) return false;
    const { memberIds: _omit, ...clubData } = club;
    await ref.set({ ...clubData, createdAt: club.createdAt ?? _now(), updatedAt: _now() });
    return true;
  } catch (e) {
    console.warn('[firebase-clubs] fbCreateClub error:', e);
    return false;
  }
}

async function fbLoadClub(clubId) {
  if (!_db()) return null;
  try {
    const snap = await _db().collection('clubs').doc(clubId).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.warn('[firebase-clubs] fbLoadClub error:', e);
    return null;
  }
}

/**
 * יוצר מסמך משתמש ב-Firestore עם role: 'teacher' בעת הרשמה.
 * { merge: true } — בטוח לקריאה חוזרת.
 */
/** בודק אם קיים owner כלשהו ב-users — ללא hardcode של UID/email. */
async function fbCheckOwnerExists() {
  if (!_db()) return false;
  try {
    const snap = await _db().collection('users').where('role', '==', 'owner').limit(1).get();
    return !snap.empty;
  } catch {
    return false;
  }
}

/**
 * יצירת מסמך מורה ב-Firestore עם role אוטומטי:
 *   הרשמה ראשונה → role:'owner'  (אין צורך בהגדרה ידנית)
 *   הרשמות נוספות → role:'teacher'
 */
/**
 * יוצר מסמך Firestore למורה חדשה — תמיד role:'teacher'.
 * Owner נוצר אך ורק דרך Initial Setup (שורה אחת ב-config/setup).
 */
async function fbCreateTeacherUser(uid, name, email) {
  if (!_db()) return;
  try {
    await _db().collection('users').doc(uid).set({
      name,
      email,
      role:        'teacher',
      status:      'active',
      createdAt:   _now(),
      updatedAt:   _now(),
      lastLoginAt: _now(),
    }, { merge: true });
  } catch (e) {
    console.warn('[firebase-clubs] fbCreateTeacherUser error:', e.message);
  }
}

/** בדיקה אם Initial Setup הושלם (config/setup קיים). */
async function fbCheckSetupComplete() {
  if (!_db()) return true; // fail-safe — אל תנעל את המערכת בשגיאת Firestore
  try {
    const doc = await _db().collection('config').doc('setup').get();
    return doc.exists;
  } catch {
    return true;
  }
}

/** יוצר sentinel config/setup — נועל את Initial Setup לצמיתות. */
async function fbCreateSetupRecord(uid, orgName) {
  if (!_db()) return false;
  try {
    await _db().collection('config').doc('setup').set({
      completedAt: _now(),
      ownerUid:    uid,
      orgName:     orgName || '',
    });
    return true;
  } catch (e) {
    console.warn('[firebase-clubs] fbCreateSetupRecord:', e.message);
    return false;
  }
}

/**
 * Developer Reset — מוחק את כל נתוני Booki החדש.
 * לא נוגע ב: classes/ (Legacy "מיתרים כיתה א'"), users/, config/setup.
 * חשבונות Firebase Auth נשמרים (לא ניתן למחוק מ-Client SDK).
 * אחרי Reset: Owner נשאר מחובר ויכול להתחיל מחדש.
 */
async function fbDevReset() {
  if (!_db()) return { ok: false, error: 'Firestore not ready' };
  const counts = { clubs: 0, memberships: 0, invitations: 0, stats: 0 };
  try {
    // 1. Clubs + subcollection memberships
    const clubsSnap = await _db().collection('clubs').get();
    for (const doc of clubsSnap.docs) {
      const membSnap = await _db().collection('clubs').doc(doc.id).collection('memberships').get();
      await Promise.all(membSnap.docs.map(d => d.ref.delete()));
      counts.memberships += membSnap.size;
      await doc.ref.delete();
      counts.clubs++;
    }

    // 2. Invitations
    const invSnap = await _db().collection('invitations').get();
    await Promise.all(invSnap.docs.map(d => d.ref.delete()));
    counts.invitations = invSnap.size;

    // 3. owner-stats — דורש allow delete: if isOwner() ב-Rules
    const statsSnap = await _db().collection('owner-stats').get();
    await Promise.all(statsSnap.docs.map(d => d.ref.delete()));
    counts.stats = statsSnap.size;

    return { ok: true, counts };
  } catch (e) {
    return { ok: false, error: e.message, counts };
  }
}

/**
 * עדכון lastLoginAt בכל התחברות.
 * אם המסמך אינו קיים (מורה ישנה לפני תמיכת user-docs) — יוצר מסמך מלא עם role:'teacher'.
 * לא משנה את role קיים — Owner בטוח.
 * @returns {Promise<void>} — await לפני routing כדי שהמסמך יהיה קיים לבדיקת role.
 */
async function fbUpdateTeacherLastLogin(uid, name = '', email = '') {
  if (!_db()) return;
  const now = _now();
  try {
    // update() מעדכן lastLoginAt בלבד, שומר על role קיים
    await _db().collection('users').doc(uid).update({ lastLoginAt: now, updatedAt: now });
  } catch {
    // המסמך לא קיים (מורה ישנה) — יצירת מסמך מלא
    try {
      await _db().collection('users').doc(uid).set({
        name,
        email,
        role:        'teacher',
        status:      'active',
        createdAt:   now,
        updatedAt:   now,
        lastLoginAt: now,
      }, { merge: true });
    } catch (e2) {
      console.warn('[firebase-clubs] fbUpdateTeacherLastLogin create failed:', e2.message);
    }
  }
}


/** טוען את כל המורות (role: teacher|owner) — לשימוש Owner Dashboard בלבד. */
async function fbLoadAllTeachers() {
  if (!_db()) return [];
  try {
    const snap = await _db().collection('users')
      .where('role', 'in', ['teacher', 'owner'])
      .get();
    const teachers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    teachers.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return teachers;
  } catch (e) {
    console.warn('[firebase-clubs] fbLoadAllTeachers:', e.message);
    return [];
  }
}

/** טוען את כל המועדונים — לשימוש Owner Dashboard בלבד. */
async function fbLoadAllClubs() {
  if (!_db()) return [];
  try {
    const snap = await _db().collection('clubs').get();
    const clubs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    clubs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return clubs;
  } catch (e) {
    console.warn('[firebase-clubs] fbLoadAllClubs:', e.message);
    return [];
  }
}

/**
 * טוען את כל memberships של תלמיד (collection group query).
 * דורש אינדקס Firestore ב-memberships.userId — יופיע כשגיאה עם קישור לקליק אחד.
 */
async function fbLoadMembershipsForUser(userId) {
  if (!_db()) return [];
  try {
    const snap = await _db().collectionGroup('memberships')
      .where('userId', '==', userId)
      .get();
    return snap.docs.map(d => d.data()).filter(m => m.status !== 'left');
  } catch (e) {
    console.warn('[firebase-clubs] fbLoadMembershipsForUser:', e.message);
    return [];
  }
}

async function fbLoadTeacherClubs(teacherUid) {
  if (!_db()) return [];
  try {
    const snap = await _db().collection('clubs').where('teacherUid', '==', teacherUid).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[firebase-clubs] fbLoadTeacherClubs:', e.message);
    return [];
  }
}

/**
 * מוחק מועדון לחלוטין: memberships → invitations → club.
 * מבוצע על ידי המורה שיצרה את המועדון בלבד (נאכף ב-Firestore Rules).
 */
async function fbDeleteClub(clubId) {
  if (!_db()) return false;
  try {
    const membSnap = await _db().collection('clubs').doc(clubId).collection('memberships').get();
    await Promise.all(membSnap.docs.map(d => d.ref.delete()));

    const invSnap = await _db().collection('invitations').where('clubId', '==', clubId).get();
    await Promise.all(invSnap.docs.map(d => d.ref.delete()));

    await _db().collection('clubs').doc(clubId).delete();
    return true;
  } catch (e) {
    console.warn('[firebase-clubs] fbDeleteClub error:', e.message);
    return false;
  }
}

async function fbSaveClub(clubId, data) {
  if (!_db()) return;
  try {
    await _db().collection('clubs').doc(clubId).set(
      { ...data, updatedAt: _now() },
      { merge: true }
    );
  } catch (e) {
    console.warn('[firebase-clubs] fbSaveClub error:', e);
  }
}

// ─── ClubMembership ───────────────────────────────────────────────────────────

/**
 * מבנה ClubMembership:
 * {
 *   userId:       string,
 *   clubId:       string,
 *   role:         "owner"|"admin"|"member",
 *   status:       "active"|"pending"|"suspended"|"left",
 *   inviteSource: "pre-created"|"code"|"link"|"qr"|"whatsapp"|"sms",
 *   invitationId: string|null,
 *   permissions:  { canViewLeaderboard, canAddMembers, canEditClub },
 *   joinedAt:     string,
 *   leftAt:       string|null,
 *   cachedStats:  { totalMinutes, totalSessions, totalPoints, totalBooks, lastReadAt },
 *   updatedAt:    string,
 * }
 */

async function fbAddClubMembership(clubId, member) {
  if (!_db()) return false;
  try {
    const ref = _db().collection('clubs').doc(clubId).collection('memberships').doc(member.userId);
    if ((await ref.get()).exists) return false;
    await ref.set({
      userId:       member.userId,
      clubId,
      role:         member.role         ?? 'member',
      status:       member.status       ?? 'active',
      inviteSource: member.inviteSource ?? 'pre-created',
      invitationId: member.invitationId ?? null,
      permissions: {
        canViewLeaderboard: true,
        canAddMembers:      false,
        canEditClub:        false,
        ...(member.permissions ?? {}),
      },
      joinedAt: member.joinedAt ?? _now(),
      leftAt:   null,
      cachedStats: {
        totalMinutes:  0,
        totalSessions: 0,
        totalPoints:   0,
        totalBooks:    0,
        lastReadAt:    null,
      },
      updatedAt: _now(),
    });
    // Denormalize: מעדכן memberCount במסמך המועדון — בלי לחסום את הפעולה
    const _inc = (typeof firebase !== 'undefined' && firebase.firestore?.FieldValue)
      ? firebase.firestore.FieldValue.increment(1) : 1;
    _db().collection('clubs').doc(clubId)
      .update({ memberCount: _inc })
      .catch(() => {});
    return true;
  } catch (e) {
    console.warn('[firebase-clubs] fbAddClubMembership error:', e);
    return false;
  }
}

async function fbLoadClubMembership(clubId, userId) {
  if (!_db()) return null;
  try {
    const snap = await _db().collection('clubs').doc(clubId).collection('memberships').doc(userId).get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    console.warn('[firebase-clubs] fbLoadClubMembership error:', e);
    return null;
  }
}

async function fbLoadClubMemberships(clubId) {
  if (!_db()) return [];
  try {
    const snap = await _db().collection('clubs').doc(clubId).collection('memberships').get();
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.warn('[firebase-clubs] fbLoadClubMemberships error:', e);
    return [];
  }
}

async function fbUpdateMembershipStats(clubId, userId, delta) {
  if (!_db()) return;
  const inc = n => (typeof firebase !== 'undefined' && firebase.firestore?.FieldValue)
    ? firebase.firestore.FieldValue.increment(n) : n;
  try {
    await _db().collection('clubs').doc(clubId).collection('memberships').doc(userId).set({
      cachedStats: {
        totalMinutes:  inc(delta.minutes  || 0),
        totalSessions: inc(1),
        totalPoints:   inc(delta.minutes  || 0),
        lastReadAt:    _now(),
      },
      updatedAt: _now(),
    }, { merge: true });
  } catch (e) {
    console.warn('[firebase-clubs] fbUpdateMembershipStats error:', e);
  }
}

async function fbSetMemberName(clubId, userId, name, emoji) {
  if (!_db() || !userId) return;
  try {
    await _db().collection('clubs').doc(clubId).collection('memberships').doc(userId).set(
      { name: name || null, emoji: emoji || '📚', updatedAt: _now() },
      { merge: true }
    );
  } catch (e) {
    console.warn('[firebase-clubs] fbSetMemberName error:', e);
  }
}

// ─── ClubInvitation ───────────────────────────────────────────────────────────

/**
 * מבנה ClubInvitation:
 * {
 *   code:         string,   // document ID = קוד ← מאפשר lookup ב-O(1)
 *   clubId:       string,
 *   createdBy:    userId,
 *   targetName:   string,   // שם שהמנהל הזין לפני שהמשתמש קיים
 *   targetUserId: string|null,  // מתמלא כשהמשתמש תובע את ההזמנה
 *   channel:      "pre-created"|"code"|"link"|"qr"|"whatsapp"|"sms",
 *   link:         string|null,
 *   maxUses:      number|null,  // null = ללא הגבלה
 *   usedCount:    number,
 *   status:       "pending"|"claimed"|"expired"|"cancelled",
 *   expiresAt:    string|null,
 *   claimedAt:    string|null,
 *   claimedBy:    string|null,
 *   createdAt:    string,
 * }
 */

async function fbCreateInvitation(invitation) {
  if (!_db()) return false;
  try {
    const ref = _db().collection('invitations').doc(invitation.code);
    if ((await ref.get()).exists) return false;
    await ref.set({
      ...invitation,
      usedCount:   0,
      status:      'pending',
      claimedAt:   null,
      claimedBy:   null,
      createdAt:   _now(),
    });
    return true;
  } catch (e) {
    console.warn('[firebase-clubs] fbCreateInvitation error:', e);
    return false;
  }
}

async function fbLoadInvitation(code) {
  if (!_db()) return null;
  try {
    const snap = await _db().collection('invitations').doc(code).get();
    return snap.exists ? { code: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.warn('[firebase-clubs] fbLoadInvitation error:', e);
    return null;
  }
}

/**
 * תביעת הזמנה ע"י משתמש.
 * מעדכן את ה-invitation ומוסיף ClubMembership.
 */
async function fbClaimInvitation(code, userId) {
  if (!_db()) return { success: false, reason: 'no-db' };
  try {
    const inv = await fbLoadInvitation(code);
    if (!inv)                           return { success: false, reason: 'not-found' };
    if (inv.status !== 'pending')       return { success: false, reason: inv.status };
    if (inv.maxUses !== null && inv.usedCount >= inv.maxUses)
                                        return { success: false, reason: 'max-uses' };
    if (inv.expiresAt && _now() > inv.expiresAt)
                                        return { success: false, reason: 'expired' };

    const isUnlimited = inv.maxUses === null;
    await _db().collection('invitations').doc(code).set({
      usedCount: inv.usedCount + 1,
      claimedAt: _now(),
      claimedBy: userId,
      ...(isUnlimited
        ? {}  // קוד מועדון — נשאר 'pending' לשימושים נוספים
        : { targetUserId: userId, status: 'claimed' }),
    }, { merge: true });

    await fbAddClubMembership(inv.clubId, {
      userId,
      role:         'member',
      status:       'active',
      inviteSource: inv.channel,
      invitationId: code,
    });

    return { success: true, clubId: inv.clubId };
  } catch (e) {
    console.warn('[firebase-clubs] fbClaimInvitation error:', e);
    return { success: false, reason: 'error' };
  }
}

// ─── חישוב סטטיסטיקות ────────────────────────────────────────────────────────

/**
 * מחשב סטטיסטיקות של חבר ביחס למועדון.
 *
 * כשמועדון עם countAllSessions: false (כגון camp) —
 * נספרות רק הסשנים שנפלו בתוך תקופת החברות (joinedAt → leftAt).
 * כך ReadingSession נשאר עצמאי ללא תלות ב-clubId.
 *
 * @param {string}  userId
 * @param {object}  club        — אובייקט Club
 * @param {object}  membership  — אובייקט ClubMembership
 */
async function computeMemberStats(userId, club, membership) {
  let opts = {};

  if (!club.settings.countAllSessions) {
    // סנן לפי תקופת החברות בלבד
    opts.fromDate = membership.joinedAt
      ? membership.joinedAt.slice(0, 10)
      : undefined;
    opts.toDate = membership.leftAt
      ? membership.leftAt.slice(0, 10)
      : undefined;
  }

  const sessions = await fbLoadUserSessions(userId, opts);

  let totalMinutes  = 0;
  let totalSessions = sessions.length;
  let totalPoints   = 0;
  let totalBooks    = 0;
  let lastReadAt    = null;

  for (const s of sessions) {
    totalMinutes += s.minutes ?? 0;
    totalPoints  += s.points  ?? 0;
    if (s.type === 'book') totalBooks++;
    if (!lastReadAt || s.createdAt > lastReadAt) lastReadAt = s.createdAt;
  }

  return { totalMinutes, totalSessions, totalPoints, totalBooks, lastReadAt };
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

/**
 * fbBootstrapClubs()
 *
 * יוצר את מועדוני BOOTSTRAP_CLUBS ב-Firebase.
 * בטוח לקרוא מספר פעמים — כל פונקציה בודקת "כבר קיים?".
 */
async function fbBootstrapClubs() {
  if (!_db() || typeof BOOTSTRAP_CLUBS === 'undefined') return;

  for (const clubDef of BOOTSTRAP_CLUBS) {
    const created = await fbCreateClub(clubDef);
    if (created) console.log(`[firebase-clubs] ✅ מועדון נוצר: ${clubDef.id}`);

    if (Array.isArray(clubDef.memberIds)) {
      for (const userId of clubDef.memberIds) {
        await fbAddClubMembership(clubDef.id, {
          userId,
          role:         'member',
          inviteSource: 'pre-created',
        });
      }
    }
  }
}

// ─── חשיפה גלובלית ───────────────────────────────────────────────────────────

Object.assign(window, {
  // User
  fbSaveUser,
  fbLoadUser,
  // UserProfile
  fbSaveUserProfile,
  fbLoadUserProfile,
  fbGetOrCreateUserProfile,
  // ReadingSession
  fbSaveReadingSession,
  fbLoadUserSessions,
  // Club
  fbCreateClub,
  fbLoadClub,
  fbLoadTeacherClubs,
  fbSaveClub,
  fbDeleteClub,
  // Owner / Multi-club
  fbCheckOwnerExists,
  fbCreateTeacherUser,
  fbUpdateTeacherLastLogin,
  fbLoadAllTeachers,
  fbLoadAllClubs,
  fbLoadMembershipsForUser,
  // Initial Setup + Dev Reset
  fbCheckSetupComplete,
  fbCreateSetupRecord,
  fbDevReset,
  // ClubMembership
  fbAddClubMembership,
  fbLoadClubMembership,
  fbLoadClubMemberships,
  fbUpdateMembershipStats,
  fbSetMemberName,
  // ClubInvitation
  fbCreateInvitation,
  fbLoadInvitation,
  fbClaimInvitation,
  // Utils
  computeMemberStats,
  fbBootstrapClubs,
});
