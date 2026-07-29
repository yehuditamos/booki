/**
 * firebase-messages.js — הודעות מורה לתלמיד/כיתה (מפושט — ר' "תיקונים" הודעות תלמידים)
 *
 * clubs/{clubId}/messages/{messageId}
 *   { type: 'encouragement'|'announcement',   // עידוד אישי (toUserId מוגדר) / הכרזה כיתתית (null)
 *     toUserId: string|null,
 *     text, createdBy (teacherUid), createdAt }
 *
 * "נקרא" נשמר במקום אחר בכוונה: לא על מסמך ההודעה, אלא כמערך seenMessageIds על
 * מסמך ה-membership של התלמיד/ה עצמו/ה — כך ש"נקרא" הוא עובדה על התלמיד/ה
 * ("אילו הודעות כבר ראית"), לא היסטוריה על ההודעה. אין תיבת הודעות, אין מסך
 * הודעות, אין thread/reply — הודעה מוצגת פעם אחת (באנר בעמוד הבית) ולא חוזרת,
 * גם אחרי רענון וגם ממכשיר אחר, כי seenMessageIds נשמר בשרת ולא ב-localStorage.
 */

function _messagesRef(clubId) {
  return _db().collection('clubs').doc(clubId).collection('messages');
}

/** מורה שולחת הודעה — אישית (toUserId מוגדר) או כיתתית (toUserId null). */
async function fbSendMessage(clubId, { type, toUserId = null, text, preset = null }) {
  if (!_db() || !clubId || !type || !text?.trim()) return { ok: false, reason: 'missing-data' };
  try {
    const ref = _messagesRef(clubId).doc();
    await ref.set({
      type, toUserId,
      text: text.trim(),
      createdBy: (typeof getCurrentTeacher === 'function' ? getCurrentTeacher()?.uid : null) || null,
      createdAt: _now(),
    });
    return { ok: true, id: ref.id };
  } catch (e) {
    console.warn('[firebase-messages] fbSendMessage error:', e.code, e.message);
    return { ok: false, reason: 'error' };
  }
}

/** טוען את ההודעות הרלוונטיות לתלמיד/ה: האישיות שלו/ה + כל ההכרזות הכיתתיות. */
async function fbLoadMyMessages(clubId, userId) {
  if (!_db() || !clubId || !userId) return [];
  try {
    const [personalSnap, announceSnap] = await Promise.all([
      _messagesRef(clubId).where('toUserId', '==', userId).get(),
      _messagesRef(clubId).where('toUserId', '==', null).get(),
    ]);
    const all = [
      ...personalSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      ...announceSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    ];
    return all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch (e) {
    console.warn('[firebase-messages] fbLoadMyMessages error:', e.code, e.message);
    return [];
  }
}

/** מסמן הודעות כ"נראו" — נכתב פעם אחת, על מסמך ה-membership של התלמיד/ה עצמו/ה בלבד. */
async function fbMarkMessagesSeen(clubId, userId, messageIds) {
  if (!_db() || !clubId || !userId || !messageIds?.length) return false;
  try {
    const arr = (typeof firebase !== 'undefined' && firebase.firestore?.FieldValue)
      ? firebase.firestore.FieldValue.arrayUnion(...messageIds) : messageIds;
    await _db().collection('clubs').doc(clubId).collection('memberships').doc(userId)
      .set({ seenMessageIds: arr, updatedAt: _now() }, { merge: true });
    return true;
  } catch (e) {
    console.warn('[firebase-messages] fbMarkMessagesSeen error:', e.code, e.message);
    return false;
  }
}

// ─── UI: באנר "יש הודעה" בעמוד הבית — פעם אחת, בלי תיבת הודעות ────────────────

async function checkNewMessages(clubId, userId) {
  const banner = document.getElementById('booki-message-banner');
  const wants = () => { window._homeBannerWants.message = false; if (typeof _reconcileHomeBanners === 'function') _reconcileHomeBanners(); };
  if (!clubId || !userId) { wants(); return; }

  const [messages, membership] = await Promise.all([
    fbLoadMyMessages(clubId, userId),
    typeof fbLoadClubMembership === 'function' ? fbLoadClubMembership(clubId, userId) : Promise.resolve(null),
  ]);

  const seen = new Set(membership?.seenMessageIds || []);
  const unseen = messages.filter(m => !seen.has(m.id));

  if (!unseen.length) { wants(); return; }

  // מוצגת רק ההודעה האחרונה שלא נראתה — אין רשימה, אין היסטוריה. "ראייתה" (הצגתה
  // כאן) מספיקה כדי לסמן אותה (ואת כל השאר הממתינות) כ-seen מיד, בהתאם לדרישה
  // "לאחר שהתלמיד ראה או סגר את ההודעה — היא נעלמת ולא חוזרת".
  const latest = unseen[0];
  const textEl = document.getElementById('booki-message-banner-text');
  if (textEl) textEl.textContent = latest.text || '';
  const stageEl = document.getElementById('booki-message-banner-stage');
  if (stageEl && !stageEl.innerHTML && typeof bookiStageHtml === 'function') {
    stageEl.innerHTML = bookiStageHtml('class-goal/booki-message.png', { className: 'booki-message-banner-char' });
  }
  window._homeBannerWants.message = true;
  if (typeof _reconcileHomeBanners === 'function') _reconcileHomeBanners(); else if (banner) banner.style.display = '';

  fbMarkMessagesSeen(clubId, userId, unseen.map(m => m.id)).catch(() => {});
}

function dismissMessageBanner() {
  window._homeBannerWants.message = false;
  if (typeof _reconcileHomeBanners === 'function') _reconcileHomeBanners();
  else { const banner = document.getElementById('booki-message-banner'); if (banner) banner.style.display = 'none'; }
}

Object.assign(window, {
  fbSendMessage, fbLoadMyMessages, fbMarkMessagesSeen,
  checkNewMessages, dismissMessageBanner,
});
