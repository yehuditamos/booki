'use strict';
// Synthetic data only: no Firebase connection or production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(process.env.BOOKI_READING_SAVE_SOURCE ||
  path.join(__dirname, '..', 'pilot-reading-save-2026-09-10.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const key = 'clubs/qa/memberships/card', wallet = 'clubs/qa/economy/wallet';
const error = code => Object.assign(new Error(code), { code });

function fixture() {
  const data = new Map([
    [key, { userId: 'card', clubId: 'qa', createdByTeacher: true, role: 'member',
      status: 'active', claimedByUid: 'phone', emoji: '🦁', personalized: true,
      cachedStats: { totalMinutes: 23, totalPoints: 36, totalSessions: 6 } }],
    [wallet, { balance: 100, lifetimeEarned: 120, lifetimeSpent: 20 }],
  ]);
  let selected = { userId: 'card', clubId: 'qa', createdByTeacher: true };
  const state = { reclaims: 0, transactions: 0, locals: 0, logs: [], fail: null, race: false };
  const snapshot = p => ({ exists: data.has(p), metadata: { fromCache: false },
    data: () => copy(data.get(p)) });
  const ref = p => ({ path: p, collection: n => ref(p + '/' + n), doc: n => ref(p + '/' + n),
    get: async opts => { assert.equal(opts.source, 'server'); return snapshot(p); } });
  const db = { collection: n => ref(n), runTransaction: async fn => {
    state.transactions++;
    const writes = [];
    const result = await fn({
      get: async r => {
        if (r.path.includes('/sessions/') && data.get(key).claimedByUid !== 'desktop')
          throw error('permission-denied');
        const snap = snapshot(r.path);
        // Copy now, as a Firestore snapshot does, before the competing device enters.
        const value = snap.exists ? snap.data() : null;
        if (r.path === key && state.race) {
          state.race = false; data.get(key).claimedByUid = 'phone';
        }
        return { ...snap, data: () => copy(value) };
      },
      set: (r, value) => writes.push([r.path, copy(value)]),
      update: (r, value) => writes.push([r.path, { ...copy(data.get(r.path)), ...copy(value) }]),
    });
    if (state.fail === 'offline') throw error('unavailable');
    for (const [p, value] of writes) data.set(p, value);
    if (state.fail === 'lost-ack') { state.fail = null; throw error('unavailable'); }
    return result;
  } };
  const context = vm.createContext({ window: { db, currentClubId: 'qa' }, console,
    currentStudentId: 'card', firebase: { auth: () => ({ currentUser: { uid: 'desktop', isAnonymous: true } }) },
    getActiveReader: () => selected,
    fbReclaimCard: async (clubId, cardId) => {
      assert.equal(clubId, 'qa'); assert.equal(cardId, 'card'); state.reclaims++;
      const card = data.get(key);
      if (!card?.createdByTeacher || card.status !== 'active' || card.role !== 'member') return false;
      data.set(key, { ...card, claimedByUid: 'desktop', updatedAt: 'binding-refresh' });
      return true;
    },
    saveStudentLocal: () => state.locals++,
    analyticsError: (...args) => state.logs.push(args),
  });
  vm.runInContext(source, context);
  const input = { id: 'qa_device_completion_1', userId: 'card', clubId: 'qa', student: { id: 'card' },
    entry: { type: 'app', minutes: 2, points: 3 }, delta: { isApp: true } };
  return { data, state, context, input, select: reader => { selected = reader; },
    save: changes => context.window.BookiReadingSave.commit({ ...input, ...changes }) };
}

(async () => {
  const f = fixture();
  // Phone enters the card while the desktop reading stays open.
  const result = await f.save();
  assert.equal(result.student.totalMinutes, 25); assert.equal(result.student.points, 39);
  assert.equal(f.state.reclaims, 1); assert.equal(f.state.transactions, 2);
  assert.equal(f.data.get(key).emoji, '🦁'); assert.equal(f.data.get(key).personalized, true);
  assert.equal(f.data.get(key).cachedStats.totalSessions, 7);
  assert.equal(f.data.get(wallet).balance, 103); assert.equal(f.data.get(wallet).lifetimeSpent, 20);
  assert.equal(f.data.get(key + '/sessions/' + f.input.id).claimedByUid, 'desktop');
  assert.equal((await f.save()).alreadySaved, true);
  assert.equal(f.data.get(wallet).balance, 103); assert.equal(f.data.get(key).cachedStats.totalMinutes, 25);

  const race = fixture(); race.data.get(key).claimedByUid = 'desktop'; race.state.race = true;
  await race.save(); assert.equal(race.state.reclaims, 1);
  assert.equal(race.data.get(key).cachedStats.totalMinutes, 25);

  for (const type of ['book', 'booki']) {
    const other = fixture(); other.data.delete(wallet);
    await other.save({ entry: { type, minutes: 2, points: 3 },
      delta: type === 'book' ? { isBook: true, books: 1 } : { isApp: true } });
    assert.equal(other.data.get(key).cachedStats.totalMinutes, 25);
    assert.equal(other.data.get(key).cachedStats.totalPoints, 39);
    assert(!other.data.has(wallet));
  }

  const lost = fixture(); lost.data.get(key).claimedByUid = 'desktop'; lost.state.fail = 'lost-ack';
  await assert.rejects(lost.save(), e => e.code === 'unavailable');
  assert.equal(lost.state.locals, 0);
  lost.data.get(key).claimedByUid = 'phone';
  assert.equal((await lost.save()).alreadySaved, true);
  assert.equal(lost.data.get(key).cachedStats.totalMinutes, 25);
  assert.equal(lost.data.get(wallet).balance, 103);
  assert.equal(lost.data.get(key + '/sessions/' + lost.input.id).claimedByUid, 'desktop');

  for (const setup of [
    f => { f.context.currentStudentId = 'different-card'; },
    f => f.select({ userId: 'different-card', clubId: 'qa', createdByTeacher: true }),
    f => { f.context.window.currentClubId = 'different-club'; },
    f => { f.data.get(key).status = 'left'; },
    f => { f.data.get(key).createdByTeacher = false; },
    f => { f.data.get(key).role = 'owner'; },
    f => { f.data.delete(key); },
  ]) {
    const blocked = fixture(); setup(blocked);
    await assert.rejects(blocked.save()); assert.equal(blocked.state.reclaims, 0);
    assert.equal(blocked.data.get(wallet).balance, 100);
    assert(!blocked.data.has(key + '/sessions/' + blocked.input.id));
  }
  const offline = fixture(); offline.data.get(key).claimedByUid = 'desktop'; offline.state.fail = 'offline';
  await assert.rejects(offline.save(), e => e.code === 'unavailable');
  assert.equal(offline.state.reclaims, 0); assert.equal(offline.data.get(key).cachedStats.totalMinutes, 23);
  assert.equal(offline.state.logs[0][0], 'reading-save');
  assert.equal(offline.state.logs[0][1], 'unavailable');
  assert.deepEqual(JSON.parse(JSON.stringify(offline.state.logs[0][2])), { clubId: 'qa', cardId: 'card', type: 'app' });

  // Repair is bounded; another takeover during the retry is surfaced as failure.
  const repeated = fixture();
  repeated.context.fbReclaimCard = async () => { repeated.state.reclaims++; return true; };
  await assert.rejects(repeated.save(), e => e.code === 'reading/card-not-owned');
  assert.equal(repeated.state.reclaims, 1); assert.equal(repeated.state.transactions, 2);
  assert.equal(repeated.data.get(key).cachedStats.totalMinutes, 23);
  console.log('PASS: cross-device save, permission race, lost acknowledgement, exact-once stats/wallet, selected-card guards, offline failure and bounded retry.');
})().catch(e => { console.error(e); process.exitCode = 1; });
