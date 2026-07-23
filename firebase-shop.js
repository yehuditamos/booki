/**
 * firebase-shop.js — Shop & Gamification Firebase Layer
 *
 * שכבת הנתונים למועדון-חנות (Milestone 2: Rewards בלבד — CRUD למורה).
 * המשכי הסכימה (economy, goalCycles, events, votes, purchases) יתווספו
 * בהדרגה ב-milestones הבאים של אותה תכונה.
 *
 *   clubs/{clubId}/rewards/{rewardId}
 *   {
 *     name:         string,
 *     description:  string,
 *     imageUrl:     string|null,   // קישור לתמונה (אופציונלי) — אין תשתית העלאה כרגע
 *     emoji:        string,        // תצוגה ראשית — תמיד קיים, ברירת מחדל "🎁"
 *     cost:         number,        // מחיר בנקודות
 *     active:       boolean,
 *     displayOrder: number,        // סדר תצוגה — עולה
 *     category:     string|null,   // לא מוצג ב-UI עדיין — מוכן להרחבה עתידית (סינון/קיבוץ)
 *     createdAt, updatedAt, createdBy (teacherUid)
 *   }
 */

// _db()/_now() are already defined globally by firebase-clubs.js (loaded just before
// this file) — reused as-is rather than redeclaring the same helper a third time.

// ─── Rewards ──────────────────────────────────────────────────────────────────

function _rewardsRef(clubId) {
  return _db().collection('clubs').doc(clubId).collection('rewards');
}

/** יוצר פרס חדש. מחזיר את ה-id או null בשגיאה. */
async function fbCreateReward(clubId, reward) {
  if (!_db() || !clubId) return null;
  try {
    const ref = _rewardsRef(clubId).doc();
    const now = _now();
    await ref.set({
      name:         (reward.name || '').trim(),
      description:  (reward.description || '').trim(),
      imageUrl:     reward.imageUrl || null,
      emoji:        reward.emoji || '🎁',
      cost:         Math.max(1, Math.round(Number(reward.cost) || 0)),
      active:       reward.active !== false,
      displayOrder: Number.isFinite(reward.displayOrder) ? reward.displayOrder : Date.now(),
      category:     reward.category || null, // לא נבחר ב-UI עדיין — קיים בסכימה לקראת שימוש עתידי
      createdAt:    now,
      updatedAt:    now,
      createdBy:    reward.createdBy || null,
    });
    return ref.id;
  } catch (e) {
    console.warn('[firebase-shop] fbCreateReward error:', e.message);
    return null;
  }
}

/** מעדכן שדות של פרס קיים (merge). */
async function fbUpdateReward(clubId, rewardId, patch) {
  if (!_db() || !clubId || !rewardId) return false;
  try {
    const clean = { ...patch, updatedAt: _now() };
    if (clean.name  !== undefined) clean.name  = String(clean.name).trim();
    if (clean.cost  !== undefined) clean.cost  = Math.max(1, Math.round(Number(clean.cost) || 0));
    await _rewardsRef(clubId).doc(rewardId).set(clean, { merge: true });
    return true;
  } catch (e) {
    console.warn('[firebase-shop] fbUpdateReward error:', e.message);
    return false;
  }
}

/** מוחק פרס לצמיתות (מורה בלבד — נאכף ב-Rules). */
async function fbDeleteReward(clubId, rewardId) {
  if (!_db() || !clubId || !rewardId) return false;
  try {
    await _rewardsRef(clubId).doc(rewardId).delete();
    return true;
  } catch (e) {
    console.warn('[firebase-shop] fbDeleteReward error:', e.message);
    return false;
  }
}

/** טוען את כל הפרסים של מועדון, ממוינים לפי displayOrder. */
async function fbLoadRewards(clubId, { activeOnly = false } = {}) {
  if (!_db() || !clubId) return [];
  try {
    const snap = await _rewardsRef(clubId).get();
    let rewards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (activeOnly) rewards = rewards.filter(r => r.active !== false);
    rewards.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    return rewards;
  } catch (e) {
    console.warn('[firebase-shop] fbLoadRewards error:', e.message);
    return [];
  }
}

/**
 * שומר סדר תצוגה חדש בבת אחת (אחרי הזזה למעלה/למטה).
 * @param {string} clubId
 * @param {{id:string, displayOrder:number}[]} orderedList
 */
async function fbReorderRewards(clubId, orderedList) {
  if (!_db() || !clubId || !orderedList?.length) return false;
  try {
    const batch = _db().batch();
    orderedList.forEach(({ id, displayOrder }) => {
      batch.update(_rewardsRef(clubId).doc(id), { displayOrder, updatedAt: _now() });
    });
    await batch.commit();
    return true;
  } catch (e) {
    console.warn('[firebase-shop] fbReorderRewards error:', e.message);
    return false;
  }
}

// ─── Economy (Milestone 4: צד ההרווחה בלבד — ההוצאה מגיעה עם הרכישה ב-milestone 6/7) ──
//
//   clubs/{clubId}/economy/wallet
//   { lifetimeEarned: number,  // עולה בלבד — עם כל נקודה שתלמיד מרוויח
//     lifetimeSpent:  number,  // 0 עד שיש רכישות
//     balance:        number,  // lifetimeEarned - lifetimeSpent
//     updatedAt }

function _economyRef(clubId) {
  return _db().collection('clubs').doc(clubId).collection('economy').doc('wallet');
}

async function fbLoadEconomy(clubId) {
  if (!_db() || !clubId) return null;
  try {
    const snap = await _economyRef(clubId).get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    console.warn('[firebase-shop] fbLoadEconomy error:', e.message);
    return null;
  }
}

/** מוסיף נקודות לארנק המשותף (כל תלמיד מחובר רשאי — תואם ל-cachedStats הקיים), ואז בודק יעד. */
async function fbAwardClubEconomy(clubId, points) {
  if (!_db() || !clubId || !points) return;
  const inc = n => (typeof firebase !== 'undefined' && firebase.firestore?.FieldValue)
    ? firebase.firestore.FieldValue.increment(n) : n;
  try {
    await _economyRef(clubId).set({
      lifetimeEarned: inc(points),
      balance:        inc(points),
      updatedAt:      _now(),
    }, { merge: true });
  } catch (e) {
    console.warn('[firebase-shop] fbAwardClubEconomy error:', e.message);
    return;
  }
  // best-effort — לעולם לא חוסם/שובר את זרימת הקריאה אם זה נכשל
  try { await evaluateGoalProgress(clubId); }
  catch (e) { console.warn('[firebase-shop] evaluateGoalProgress (post-award) error:', e.message); }
}

// ─── Goal Cycles ──────────────────────────────────────────────────────────────
//
//   clubs/{clubId}/goalCycles/{cycleId}
//   { metric:'points', target, startBaseline, startedAt, reachedAt, status:'active'|'completed', eventId }

function _cyclesRef(clubId) {
  return _db().collection('clubs').doc(clubId).collection('goalCycles');
}

async function fbCreateGoalCycle(clubId, { metric = 'points', target, startBaseline = 0 }) {
  if (!_db() || !clubId || !target) return null;
  try {
    const ref = _cyclesRef(clubId).doc();
    await ref.set({
      metric, target: Math.round(target), startBaseline,
      startedAt: _now(), reachedAt: null, status: 'active', eventId: null,
    });
    return ref.id;
  } catch (e) {
    console.warn('[firebase-shop] fbCreateGoalCycle error:', e.message);
    return null;
  }
}

async function fbLoadGoalCycle(clubId, cycleId) {
  if (!_db() || !clubId || !cycleId) return null;
  try {
    const snap = await _cyclesRef(clubId).doc(cycleId).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.warn('[firebase-shop] fbLoadGoalCycle error:', e.message);
    return null;
  }
}

async function fbLoadGoalCycles(clubId) {
  if (!_db() || !clubId) return [];
  try {
    const snap = await _cyclesRef(clubId).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  } catch (e) {
    console.warn('[firebase-shop] fbLoadGoalCycles error:', e.message);
    return [];
  }
}

/** מסמן מחזור כהושלם — מותר גם לתלמיד מחובר, אבל ה-Rules מאמתות שהיעד באמת הושג. */
async function fbCompleteGoalCycle(clubId, cycleId, eventId) {
  if (!_db() || !clubId || !cycleId) return false;
  try {
    await _cyclesRef(clubId).doc(cycleId).update({
      status: 'completed', reachedAt: _now(), eventId: eventId || null,
    });
    return true;
  } catch (e) {
    console.warn('[firebase-shop] fbCompleteGoalCycle error:', e.message);
    return false;
  }
}

// ─── Shop State ───────────────────────────────────────────────────────────────
//
//   clubs/{clubId}/shop/state
//   { state, activeCycleId, activeVoteId, activePurchaseId, updatedAt }

function _shopRef(clubId) {
  return _db().collection('clubs').doc(clubId).collection('shop').doc('state');
}

async function fbLoadShopState(clubId) {
  if (!_db() || !clubId) return null;
  try {
    const snap = await _shopRef(clubId).get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    console.warn('[firebase-shop] fbLoadShopState error:', e.message);
    return null;
  }
}

/**
 * האזנה בזמן אמת ל-shop/state (כמו fbWatchClass הקיים) — כך שכל תלמיד שכבר פתוח
 * על מסך החנות רואה את השינוי מיד כשהמורה פותחת/סוגרת הצבעה, בלי לצאת ולהיכנס.
 * מחזירה פונקציית unsubscribe.
 */
function fbWatchShopState(clubId, callback) {
  if (!_db() || !clubId) { callback(null); return () => {}; }
  return _shopRef(clubId).onSnapshot(
    snap => callback(snap.exists ? snap.data() : null),
    e => console.warn('[firebase-shop] fbWatchShopState error:', e.message)
  );
}

/**
 * הפעלה חד-פעמית של החנות למועדון (מורה בלבד).
 * זורעת lifetimeEarned מסכום cachedStats.totalPoints הקיים — קריאה בלבד, לא שינוי היסטוריה —
 * כך שמחזור 1 מתחיל מ-0 התקדמות ולא "מזנק" ליעד מיד עבור כיתות עם היסטוריית קריאה.
 */
async function fbEnableShopForClub(clubId, initialTarget) {
  if (!_db() || !clubId || !initialTarget) return false;
  try {
    const existing = await fbLoadShopState(clubId);
    if (existing) return false; // כבר מופעל — אין דריסה

    const memberships = typeof fbLoadClubMemberships === 'function'
      ? await fbLoadClubMemberships(clubId) : [];
    const seed = memberships.reduce((s, m) => s + (m.cachedStats?.totalPoints || 0), 0);

    const walletSnap = await _economyRef(clubId).get();
    if (!walletSnap.exists) {
      await _economyRef(clubId).set({
        lifetimeEarned: seed, lifetimeSpent: 0, balance: seed, updatedAt: _now(),
      });
    }

    const cycleId = await fbCreateGoalCycle(clubId, { metric: 'points', target: initialTarget, startBaseline: seed });
    if (!cycleId) return false;

    await _shopRef(clubId).set({
      state: 'browsing', activeCycleId: cycleId, activeVoteId: null, activePurchaseId: null, updatedAt: _now(),
    });
    return true;
  } catch (e) {
    console.warn('[firebase-shop] fbEnableShopForClub error:', e.message);
    return false;
  }
}

// ─── Event System — הבסיס הגמיש לכל גיימיפיקציה עתידית ────────────────────────
//
//   clubs/{clubId}/events/{eventId}
//   { type, payload, status:'pending'|'processed', createdAt, processedAt, triggeredBy }
//
// כל אירוע עתידי (אתגר שבועי, אירוע עונתי, פתיחה ידנית ע"י מורה) פשוט קורא ל-emitClubEvent
// עם type משלו ורושם handler ב-SHOP_EVENT_HANDLERS — שום דבר אחר בחנות/הצבעה/רכישה לא משתנה.

function _eventsRef(clubId) {
  return _db().collection('clubs').doc(clubId).collection('events');
}

async function emitClubEvent(clubId, type, payload = {}) {
  if (!_db() || !clubId || !type) return null;
  try {
    const ref = _eventsRef(clubId).doc();
    await ref.set({
      type, payload, status: 'pending', createdAt: _now(), processedAt: null, triggeredBy: 'system',
    });
    return ref.id;
  } catch (e) {
    console.warn('[firebase-shop] emitClubEvent error:', e.message);
    return null;
  }
}

const SHOP_EVENT_HANDLERS = {
  /** היעד הושג — משלימה את המחזור ואז פותחת את מצב "מוכן לחגיגה" בחנות. */
  goal_reached: async (clubId, payload) => {
    if (payload.cycleId) await fbCompleteGoalCycle(clubId, payload.cycleId, payload.eventId);
    // הדגל cycle→completed חייב להצליח קודם — ה-Rule על shop/state מאמתת זאת.
    await _shopRef(clubId).set({ state: 'GOAL_REACHED_PENDING_SHOP', updatedAt: _now() }, { merge: true });
  },
  // future: weekly_challenge_complete, manual_shop_open, seasonal_event, ...
  //         הוספת סוג אירוע עתידי = שורה אחת כאן, שום דבר אחר לא משתנה.
};

/**
 * evaluateGoalProgress(clubId) — נקודת הבדיקה היחידה: האם המחזור הפעיל חצה את היעד?
 * נקראת (א) אחרי כל הענקת נקודות, (ב) כהגנה בכל טעינת מסך חנות/כיתה — בטוחה לקריאה חוזרת.
 */
async function evaluateGoalProgress(clubId) {
  if (!_db() || !clubId) return;
  try {
    const shop = await fbLoadShopState(clubId);
    if (!shop || shop.state !== 'browsing' || !shop.activeCycleId) return;

    const cycle = await fbLoadGoalCycle(clubId, shop.activeCycleId);
    if (!cycle || cycle.status !== 'active') return;

    const econ = await fbLoadEconomy(clubId);
    if (!econ) return;

    const progress = (econ.lifetimeEarned || 0) - (cycle.startBaseline || 0);
    if (progress < cycle.target) return;

    const eventId = await emitClubEvent(clubId, 'goal_reached', {
      cycleId: cycle.id, progress, target: cycle.target,
    });
    if (eventId) await SHOP_EVENT_HANDLERS.goal_reached(clubId, { cycleId: cycle.id, eventId });
  } catch (e) {
    console.warn('[firebase-shop] evaluateGoalProgress error:', e.message);
  }
}

// ─── Votes (Milestone 5) ──────────────────────────────────────────────────────
//
//   clubs/{clubId}/votes/{voteId}
//   { cycleId, round, previousVoteId, runoffVoteId,
//     rewardOptions:[{rewardId,name,description,imageUrl,emoji,cost}],  // תמונת מצב — לא נוגעת אם המורה עורכת פרס אחר-כך
//     status:'open'|'closed', openedAt, closedAt,
//     tally: {rewardId:count}|null,      // null כל עוד ההצבעה פתוחה — זה מה ששומר על הסודיות
//     winnerRewardId: string|null,       // null אם עדיין תיקו לפני הכרעה
//     tiedRewardIds: string[]|null }     // מתמלא רק אם הסיבוב הזה נסגר בתיקו
//
//   clubs/{clubId}/votes/{voteId}/ballots/{userId}
//   { userId, rewardId, votedAt }        // create-only — אין עדכון, אין מחיקה (ר' firestore.rules)

function _votesRef(clubId) {
  return _db().collection('clubs').doc(clubId).collection('votes');
}
function _ballotsRef(clubId, voteId) {
  return _votesRef(clubId).doc(voteId).collection('ballots');
}

/**
 * מורה פותחת הצבעה — סיבוב 1, כל הפרסים הפעילים כרגע כאפשרויות.
 * דורשת שהחנות במצב GOAL_REACHED_PENDING_SHOP. מחזירה את מזהה ההצבעה או null.
 */
async function fbOpenShopForVoting(clubId) {
  if (!_db() || !clubId) return null;
  try {
    const shop = await fbLoadShopState(clubId);
    if (!shop || shop.state !== 'GOAL_REACHED_PENDING_SHOP') return null;

    const rewards = typeof fbLoadRewards === 'function' ? await fbLoadRewards(clubId, { activeOnly: true }) : [];
    if (!rewards.length) return null; // אין פרסים פעילים — אין על מה להצביע

    const options = rewards.map(r => ({
      rewardId: r.id, name: r.name, description: r.description || '',
      imageUrl: r.imageUrl || null, emoji: r.emoji || '🎁', cost: r.cost,
    }));

    const ref = _votesRef(clubId).doc();
    await ref.set({
      cycleId: shop.activeCycleId || null,
      round: 1, previousVoteId: null, runoffVoteId: null,
      rewardOptions: options,
      status: 'open', openedAt: _now(), closedAt: null,
      tally: null, winnerRewardId: null, tiedRewardIds: null,
    });

    await _shopRef(clubId).set({ state: 'voting_open', activeVoteId: ref.id, updatedAt: _now() }, { merge: true });
    return ref.id;
  } catch (e) {
    console.warn('[firebase-shop] fbOpenShopForVoting error:', e.message);
    return null;
  }
}

async function fbLoadVote(clubId, voteId) {
  if (!_db() || !clubId || !voteId) return null;
  try {
    const snap = await _votesRef(clubId).doc(voteId).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.warn('[firebase-shop] fbLoadVote error:', e.message);
    return null;
  }
}

/** מצביע/ה — יצירה בלבד. הצבעה שנייה (או כל ניסיון עדכון) נדחית ע"י ה-Rules. */
async function fbCastVote(clubId, voteId, userId, rewardId) {
  if (!_db() || !clubId || !voteId || !userId || !rewardId) return { ok: false, reason: 'missing-data' };
  try {
    await _ballotsRef(clubId, voteId).doc(userId).set({ userId, rewardId, votedAt: _now() });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.code === 'permission-denied' ? 'already-voted' : 'error' };
  }
}

/** קריאת מסמך ספציפי בלבד (לא רשימה) — כך תלמיד לעולם לא יכול "לראות" קולות של אחרים. */
async function fbLoadMyBallot(clubId, voteId, userId) {
  if (!_db() || !clubId || !voteId || !userId) return null;
  try {
    const snap = await _ballotsRef(clubId, voteId).doc(userId).get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    return null;
  }
}

/** מורה בלבד — כל הפתקים של סיבוב, לצורך ספירה. */
async function fbLoadBallots(clubId, voteId) {
  if (!_db() || !clubId || !voteId) return [];
  try {
    const snap = await _ballotsRef(clubId, voteId).get();
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.warn('[firebase-shop] fbLoadBallots error:', e.message);
    return [];
  }
}

/** מונה כמה חברי מועדון פעילים כבר הצביעו — בלי לחשוף למי הצביעו. */
async function fbLoadVotingProgress(clubId, voteId) {
  const [memberships, ballots] = await Promise.all([
    typeof fbLoadClubMemberships === 'function' ? fbLoadClubMemberships(clubId) : Promise.resolve([]),
    fbLoadBallots(clubId, voteId),
  ]);
  const totalCount = memberships.filter(m => m.status !== 'left').length;
  const votedCount = ballots.length;
  return { votedCount, totalCount, notVotedCount: Math.max(0, totalCount - votedCount) };
}

function _tallyVotes(ballots, rewardOptions) {
  const counts = {};
  rewardOptions.forEach(o => { counts[o.rewardId] = 0; });
  ballots.forEach(b => { if (counts[b.rewardId] !== undefined) counts[b.rewardId]++; });
  const max = Math.max(0, ...Object.values(counts));
  const leaders = Object.keys(counts).filter(id => counts[id] === max && max > 0);
  return {
    counts, max, leaders,
    isTie: leaders.length > 1,
    winnerRewardId: leaders.length === 1 ? leaders[0] : null,
  };
}

/**
 * מורה סוגרת הצבעה: סופרת קולות, קובעת מנצח/ת או תיקו.
 * תיקו → יוצרת סיבוב הכרעה (runoff) עם המועמדים המעורבים בלבד; המצב נשאר voting_open.
 * ניצחון ברור → סוגרת סופית, שומרת מנצח/ת, עוברת ל-voting_closed. כאן מסתיים Milestone 5.
 */
async function fbCloseVoting(clubId, voteId) {
  if (!_db() || !clubId || !voteId) return { ok: false };
  try {
    const vote = await fbLoadVote(clubId, voteId);
    if (!vote || vote.status !== 'open') return { ok: false, reason: 'not-open' };

    const ballots = await fbLoadBallots(clubId, voteId);
    // בלי אף קול — אין "מנצח" וגם לא תיקו אמיתי. סגירה במצב הזה הייתה יוצרת הצבעה
    // סגורה עם winnerRewardId ריק שאי אפשר להתאושש ממנו (מסך רכישה שבור לצמיתות).
    if (!ballots.length) return { ok: false, reason: 'no-votes' };

    const result  = _tallyVotes(ballots, vote.rewardOptions);

    if (result.isTie) {
      await _votesRef(clubId).doc(voteId).update({
        status: 'closed', closedAt: _now(), tally: result.counts,
        winnerRewardId: null, tiedRewardIds: result.leaders,
      });

      const tiedOptions = vote.rewardOptions.filter(o => result.leaders.includes(o.rewardId));
      const runoffRef = _votesRef(clubId).doc();
      await runoffRef.set({
        cycleId: vote.cycleId, round: (vote.round || 1) + 1, previousVoteId: voteId, runoffVoteId: null,
        rewardOptions: tiedOptions,
        status: 'open', openedAt: _now(), closedAt: null,
        tally: null, winnerRewardId: null, tiedRewardIds: null,
      });
      await _votesRef(clubId).doc(voteId).update({ runoffVoteId: runoffRef.id });
      await _shopRef(clubId).set({ state: 'voting_open', activeVoteId: runoffRef.id, updatedAt: _now() }, { merge: true });
      return { ok: true, tie: true, runoffVoteId: runoffRef.id };
    }

    await _votesRef(clubId).doc(voteId).update({
      status: 'closed', closedAt: _now(), tally: result.counts,
      winnerRewardId: result.winnerRewardId, tiedRewardIds: null,
    });
    await _shopRef(clubId).set({ state: 'voting_closed', updatedAt: _now() }, { merge: true });
    return { ok: true, tie: false, winnerRewardId: result.winnerRewardId };
  } catch (e) {
    console.warn('[firebase-shop] fbCloseVoting error:', e.message);
    return { ok: false, reason: 'error' };
  }
}

// ─── Purchases (Milestone 6) ───────────────────────────────────────────────────
//
//   clubs/{clubId}/purchases/{purchaseId}
//   { cycleId, cycleNumber, voteId, rewardId, rewardTitle, cost,
//     balanceBefore, balanceAfter, purchasedBy (teacherUid), purchasedAt }
//
// זרימה: מחזור פעיל → הצבעה נסגרת עם מנצח/ת → מורה מאשרת רכישה →
//   (1) ניכוי מהארנק  (2) שמירת רשומת רכישה  (3) פתיחת מחזור יעד הבא
//   (startBaseline מה-lifetimeEarned הנוכחי — לא מושפע מהוצאה, כך שהיתרה תמיד עוברת הלאה)
//   (4) איפוס מצב החנות ל-'browsing' — נעולה שוב עד ליעד הבא.

function _purchasesRef(clubId) {
  return _db().collection('clubs').doc(clubId).collection('purchases');
}

async function fbLoadPurchases(clubId) {
  if (!_db() || !clubId) return [];
  try {
    const snap = await _purchasesRef(clubId).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.purchasedAt || '').localeCompare(a.purchasedAt || ''));
  } catch (e) {
    console.warn('[firebase-shop] fbLoadPurchases error:', e.message);
    return [];
  }
}

/**
 * מורה מאשרת רכישה של הפרס שנבחר בהצבעה. מבצעת ברצף: ניכוי מהארנק, שמירת רשומת
 * רכישה, פתיחת מחזור היעד הבא (אותו יעד כברירת מחדל, אלא אם המורה שינתה אותו כרגע),
 * ואיפוס מצב החנות. לעולם לא מאפשרת רכישה שהיתרה לא מכסה.
 * @param {string} clubId
 * @param {string} voteId  ההצבעה הסגורה שממנה מגיע המנצח/ת
 * @param {number} [nextGoalTarget]  יעד חדש לסבב הבא — ברירת מחדל: אותו יעד כמו הקודם
 */
async function fbConfirmPurchase(clubId, voteId, nextGoalTarget) {
  if (!_db() || !clubId || !voteId) return { ok: false, reason: 'missing-data' };
  try {
    const vote = await fbLoadVote(clubId, voteId);
    if (!vote || vote.status !== 'closed' || !vote.winnerRewardId) return { ok: false, reason: 'no-winner' };
    const winner = (vote.rewardOptions || []).find(o => o.rewardId === vote.winnerRewardId);
    if (!winner) return { ok: false, reason: 'reward-missing' };
    const cost = winner.cost || 0;

    // "מספר מחזור" קריא לאדם — נגזר מהסדר הכרונולוגי (קריאה זולה, לא קריטית לעסקה,
    // ולכן נעשית מחוץ ל-transaction).
    const shopPreCheck = await fbLoadShopState(clubId);
    if (!shopPreCheck || shopPreCheck.state !== 'voting_closed') return { ok: false, reason: 'wrong-state' };
    const allCycles = await fbLoadGoalCycles(clubId);
    const ascending = [...allCycles].sort((a, b) => (a.startedAt || '').localeCompare(b.startedAt || ''));
    const cycleNumber = ascending.findIndex(c => c.id === shopPreCheck.activeCycleId) + 1;

    const economyRef = _economyRef(clubId);
    const shopRef    = _shopRef(clubId);

    let outcome;
    await _db().runTransaction(async tx => {
      // כל הקריאות חייבות לקרות לפני כל כתיבה בתוך transaction.
      const [shopSnap, econSnap] = await Promise.all([tx.get(shopRef), tx.get(economyRef)]);
      const shop = shopSnap.exists ? shopSnap.data() : null;
      const econ = econSnap.exists ? econSnap.data() : null;

      // ה-CAS האמיתי נגד הפעלה כפולה (לחיצה כפולה / שני טאבים): אם ניסיון מקביל
      // כבר ביצע את הרכישה הזו (המצב כבר לא voting_closed, או activeVoteId כבר
      // לא מצביע לכאן) — נעצרים כאן בלי לכתוב שום דבר בפעם השנייה.
      if (!shop || shop.state !== 'voting_closed' || shop.activeVoteId !== voteId) {
        outcome = { ok: false, reason: 'already-purchased' };
        return;
      }
      if (!econ) { outcome = { ok: false, reason: 'no-wallet' }; return; }
      if ((econ.balance || 0) < cost) { outcome = { ok: false, reason: 'insufficient-balance' }; return; }

      const cycleRef  = _cyclesRef(clubId).doc(shop.activeCycleId);
      const cycleSnap = await tx.get(cycleRef);
      if (!cycleSnap.exists) { outcome = { ok: false, reason: 'no-cycle' }; return; }
      const oldCycle = cycleSnap.data();

      const balanceBefore = econ.balance || 0;
      const balanceAfter  = balanceBefore - cost;
      const now = _now();

      // (1) ניכוי מהארנק — lifetimeEarned לעולם לא נוגעים בו כאן, רק balance/lifetimeSpent
      tx.set(economyRef, {
        lifetimeSpent: (econ.lifetimeSpent || 0) + cost,
        balance: balanceAfter,
        updatedAt: now,
      }, { merge: true });

      // (2) רשומת רכישה
      const purchaseRef = _purchasesRef(clubId).doc();
      tx.set(purchaseRef, {
        cycleId: shop.activeCycleId, cycleNumber: cycleNumber || null, voteId,
        rewardId: winner.rewardId, rewardTitle: winner.name, cost,
        balanceBefore, balanceAfter,
        purchasedBy: (typeof getCurrentTeacher === 'function' ? getCurrentTeacher()?.uid : null) || null,
        purchasedAt: now,
      });

      // (3) מחזור יעד הבא — startBaseline מה-lifetimeEarned הנוכחי (לא מושפע מהוצאה),
      //     כך שההתקדמות מתאפסת אבל היתרה הנצברת ממשיכה בלי הפרעה.
      const target = (Number.isFinite(nextGoalTarget) && nextGoalTarget > 0) ? Math.round(nextGoalTarget) : oldCycle.target;
      const nextCycleRef = _cyclesRef(clubId).doc();
      tx.set(nextCycleRef, {
        metric: oldCycle.metric || 'points', target, startBaseline: econ.lifetimeEarned || 0,
        startedAt: now, reachedAt: null, status: 'active', eventId: null,
      });

      // (4) איפוס מצב החנות — נעולה שוב, מחכה ליעד הבא
      tx.set(shopRef, {
        state: 'browsing', activeCycleId: nextCycleRef.id, activeVoteId: null,
        activePurchaseId: purchaseRef.id, updatedAt: now,
      }, { merge: true });

      outcome = { ok: true, purchaseId: purchaseRef.id, nextCycleId: nextCycleRef.id, balanceAfter };
    });

    return outcome;
  } catch (e) {
    console.warn('[firebase-shop] fbConfirmPurchase error:', e.message);
    return { ok: false, reason: 'error' };
  }
}

// ─── חשיפה גלובלית ───────────────────────────────────────────────────────────

Object.assign(window, {
  fbCreateReward,
  fbUpdateReward,
  fbDeleteReward,
  fbLoadRewards,
  fbReorderRewards,
  // Economy
  fbLoadEconomy,
  fbAwardClubEconomy,
  // Goal Cycles
  fbCreateGoalCycle,
  fbLoadGoalCycle,
  fbLoadGoalCycles,
  fbCompleteGoalCycle,
  // Shop State
  fbLoadShopState,
  fbWatchShopState,
  fbEnableShopForClub,
  // Event System
  emitClubEvent,
  evaluateGoalProgress,
  // Votes
  fbOpenShopForVoting,
  fbLoadVote,
  fbCastVote,
  fbLoadMyBallot,
  fbLoadBallots,
  fbLoadVotingProgress,
  fbCloseVoting,
  // Purchases
  fbLoadPurchases,
  fbConfirmPurchase,
});
