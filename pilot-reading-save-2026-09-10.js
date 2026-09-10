/**
 * pilot-release-2026-09-10.js — runtime hotfix bundle for the teacher pilot.
 * Loaded after the existing app scripts. No Firebase Security Rules changes.
 */
/**
 * reading-save.js — שמירת קריאה אטומית וחסינת לחיצה כפולה.
 *
 * המטרה: מסך הצלחה מוצג רק אחרי ש-Firestore אישר את שמירת הדקות.
 * מזהה השלמה קבוע לכל ניסיון קריאה מונע ספירה כפולה גם אם הלקוח מנסה שוב
 * אחרי תקלה/ניתוק. עבור מועדון: cachedStats + רשומת session + ארנק קיים
 * נכתבים באותה transaction. אם אין ארנק פעיל — הקריאה עדיין נשמרת; החנות
 * תאותחל בנפרד ע"י המורה, בהתאם לכללי ההרשאה הקיימים.
 */
(function () {
  'use strict';
  if (window.BookiReadingSave) return;

  const num = value => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const clone = value => JSON.parse(JSON.stringify(value ?? null));
  const nowIso = () => new Date().toISOString();
  const fail = (code, message = code) => {
    const e = new Error(message); e.code = code; throw e;
  };
  const safeId = value => String(value || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);

  function newId(prefix = 'read') {
    const random = window.crypto?.randomUUID
      ? window.crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    return `${safeId(prefix)}_${random}`.slice(0, 140);
  }

  function validateEntry(entry) {
    if (!entry || !['app', 'book', 'booki'].includes(entry.type)) fail('reading/invalid-type');
    const minutes = Number(entry.minutes);
    const points = Number(entry.points);
    const max = entry.type === 'book' ? 240 : 90;
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > max) fail('reading/invalid-minutes');
    if (!Number.isFinite(points) || points < 0 || points > 10000) fail('reading/invalid-points');
  }

  function normalizedStats(old = {}) {
    return {
      totalMinutes: num(old.totalMinutes),
      totalSessions: num(old.totalSessions),
      totalPoints: num(old.totalPoints ?? old.points),
      totalBooks: num(old.totalBooks),
      appMinutes: num(old.appMinutes),
      bookMinutes: num(old.bookMinutes),
      storiesRead: num(old.storiesRead),
      lastReadAt: old.lastReadAt || null,
      recentCompletionIds: Array.isArray(old.recentCompletionIds) ? old.recentCompletionIds.slice(-49) : [],
    };
  }

  function advanceStats(old, id, entry, delta, completedAt) {
    const stats = normalizedStats(old);
    if (stats.recentCompletionIds.includes(id)) return { stats, duplicate: true };
    stats.totalMinutes += entry.minutes;
    stats.totalSessions += 1;
    stats.totalPoints += entry.points;
    stats.totalBooks += num(delta.books);
    stats.appMinutes += delta.isApp ? entry.minutes : 0;
    stats.bookMinutes += delta.isBook ? entry.minutes : 0;
    stats.storiesRead += entry.type === 'app' ? 1 : 0;
    stats.lastReadAt = completedAt;
    stats.recentCompletionIds = [...stats.recentCompletionIds, id].slice(-50);
    return { stats, duplicate: false };
  }

  function appendHistory(history, entry, id) {
    const list = Array.isArray(history) ? history.slice() : [];
    if (!list.some(item => item?.completionId === id)) list.push({ ...clone(entry), completionId: id });
    return list.slice(-150);
  }

  function studentFromStats(student, stats, entry, id) {
    const next = { ...(clone(student) || {}) };
    next.totalMinutes = stats.totalMinutes;
    next.appMinutes = stats.appMinutes;
    next.bookMinutes = stats.bookMinutes;
    next.points = stats.totalPoints;
    next.storiesRead = stats.storiesRead;
    next.history = appendHistory(next.history, entry, id);
    return next;
  }

  async function ensureAnonymousAuth() {
    if (typeof firebase === 'undefined' || !firebase.auth) fail('reading/auth-unavailable');
    let user = firebase.auth().currentUser;
    if (!user?.isAnonymous && typeof ensureStudentAuth === 'function') {
      await ensureStudentAuth();
      user = firebase.auth().currentUser;
    }
    if (!user?.uid || !user.isAnonymous) fail('reading/student-auth-required');
    return user.uid;
  }

  async function saveLegacy(opts) {
    const base = clone(opts.student) || {};
    const old = normalizedStats({ ...base, totalPoints: base.points });
    const advanced = advanceStats(old, opts.id, opts.entry, opts.delta, opts.completedAt);
    const next = advanced.duplicate ? base : studentFromStats(base, advanced.stats, opts.entry, opts.id);
    if (!advanced.duplicate) {
      if (typeof fbSaveStudent !== 'function') fail('reading/legacy-save-unavailable');
      const ok = await fbSaveStudent(next);
      if (!ok) fail('reading/save-failed');
    }
    if (typeof saveStudentLocal === 'function') saveStudentLocal(next);
    return { student: next, previousMinutes: Math.max(0, advanced.stats.totalMinutes - opts.entry.minutes), alreadySaved: advanced.duplicate };
  }

  async function saveModern(opts) {
    if (!window.db || typeof window.db.runTransaction !== 'function') fail('reading/database-unavailable');
    const authUid = await ensureAnonymousAuth();
    const clubId = opts.clubId || null;
    const userId = String(opts.userId);
    const db = window.db;
    const targetRef = clubId
      ? db.collection('clubs').doc(clubId).collection('memberships').doc(userId)
      : db.collection('users').doc(authUid).collection('profile').doc('main');
    const walletRef = clubId ? db.collection('clubs').doc(clubId).collection('economy').doc('wallet') : null;

    const txResult = await db.runTransaction(async tx => {
      const targetSnap = await tx.get(targetRef);
      if (!targetSnap.exists && clubId) fail('reading/card-not-found');
      const target = targetSnap.exists ? targetSnap.data() : {};

      if (clubId) {
        const owned = userId === authUid || target.claimedByUid === authUid;
        if (!owned || target.status === 'left') fail('reading/card-not-owned');
      } else if (userId !== authUid) {
        fail('reading/profile-not-owned');
      }

      const oldStats = clubId ? normalizedStats(target.cachedStats || {}) : normalizedStats({ ...target, totalPoints: target.points });
      const advanced = advanceStats(oldStats, opts.id, opts.entry, opts.delta, opts.completedAt);
      if (advanced.duplicate) {
        return { stats: advanced.stats, duplicate: true, target };
      }

      let walletSnap = null;
      if (walletRef) walletSnap = await tx.get(walletRef);

      const sessionPayload = {
        ...clone(opts.entry),
        id: opts.id,
        completionId: opts.id,
        userId,
        date: opts.entry.date || (typeof todayStr === 'function' ? todayStr() : opts.completedAt.slice(0, 10)),
        createdAt: opts.completedAt,
      };

      if (clubId && target.createdByTeacher === true) {
        const sessionRef = targetRef.collection('sessions').doc(opts.id);
        tx.set(sessionRef, { ...sessionPayload, clubId, studentCardId: userId, claimedByUid: authUid });
      } else {
        const sessionRef = db.collection('users').doc(authUid).collection('readingSessions').doc(opts.id);
        tx.set(sessionRef, sessionPayload);
      }

      if (clubId) {
        tx.update(targetRef, { cachedStats: advanced.stats, updatedAt: opts.completedAt });
        if (walletSnap?.exists && opts.entry.points > 0) {
          const wallet = walletSnap.data() || {};
          tx.update(walletRef, {
            lifetimeEarned: num(wallet.lifetimeEarned) + opts.entry.points,
            balance: num(wallet.balance) + opts.entry.points,
            updatedAt: opts.completedAt,
          });
        }
      } else {
        const next = studentFromStats({ ...opts.student, ...target, id: authUid }, advanced.stats, opts.entry, opts.id);
        tx.set(targetRef, {
          ...next,
          userId: authUid,
          recentCompletionIds: advanced.stats.recentCompletionIds,
          totalSessions: advanced.stats.totalSessions,
          updatedAt: opts.completedAt,
        }, { merge: true });
      }

      return { stats: advanced.stats, duplicate: false, target };
    });

    const next = studentFromStats(opts.student || { id: opts.userId }, txResult.stats, opts.entry, opts.id);
    if (typeof saveStudentLocal === 'function') saveStudentLocal(next);
    if (clubId && typeof evaluateGoalProgress === 'function') {
      Promise.resolve().then(() => evaluateGoalProgress(clubId)).catch(e => console.warn('[reading-save] goal refresh:', e?.code || e?.message));
    }
    return {
      student: next,
      previousMinutes: Math.max(0, txResult.stats.totalMinutes - (txResult.duplicate ? 0 : opts.entry.minutes)),
      alreadySaved: txResult.duplicate,
    };
  }

  async function commit(options) {
    const opts = {
      ...options,
      id: safeId(options?.id),
      entry: clone(options?.entry) || {},
      delta: clone(options?.delta) || {},
      completedAt: options?.completedAt || nowIso(),
    };
    if (!opts.id || opts.id.length < 8 || opts.userId === null || opts.userId === undefined) fail('reading/invalid-completion');
    validateEntry(opts.entry);
    return Number.isInteger(opts.userId) ? saveLegacy(opts) : saveModern(opts);
  }

  window.BookiReadingSave = { newId, commit };
})();
