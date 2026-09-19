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

let _messageCheckVersion = 0;
async function checkNewMessages(clubId, userId) {
  const version = ++_messageCheckVersion;
  document.getElementById('booki-story-recommendations')?.replaceChildren();
  const banner = document.getElementById('booki-message-banner');
  const wants = () => { window._homeBannerWants.message = false; if (typeof _reconcileHomeBanners === 'function') _reconcileHomeBanners(); };
  if (!clubId || !userId) { wants(); return; }

  const [messages, membership] = await Promise.all([
    fbLoadMyMessages(clubId, userId),
    typeof fbLoadClubMembership === 'function' ? fbLoadClubMembership(clubId, userId) : Promise.resolve(null),
  ]);

  if (version !== _messageCheckVersion) return;
  const reader = typeof getActiveReader === 'function' ? getActiveReader() : null;
  if (!reader || reader.clubId !== clubId || reader.userId !== userId) return;
  const seen = new Set(membership?.seenMessageIds || []);
  if (typeof renderStoryRecommendations === 'function') renderStoryRecommendations(clubId, userId, messages, seen);
  const unseen = messages.filter(m => m.type !== 'story-recommendation' && !seen.has(m.id));
  if (!unseen.length) { wants(); return; }
  // New encouragements are rendered as a tactile envelope near Booki, not as
  // the old full-width banner. They are consumed only when the child opens it.
  const latest = unseen[0];
  if (banner) {
    banner.dataset.messageId = latest.id || '';
    banner.classList.add('booki-envelope-notice','booki-envelope-heart');
    banner.setAttribute('role','button'); banner.tabIndex=0;
    banner.setAttribute('aria-label','יש לך עידוד חדש מהמורה. לחצו לפתיחה');
    const textEl=document.getElementById('booki-message-banner-text');
    if(textEl) textEl.textContent='💌';
    const stageEl=document.getElementById('booki-message-banner-stage');
    if(stageEl) stageEl.replaceChildren();
    const close=banner.querySelector('.booki-message-banner-close');if(close)close.style.display='none';
    const open=async()=>{
      if(banner.dataset.opened==='1')return;banner.dataset.opened='1';
      const text=latest.text||'המורה שלחה לך עידוד 💙';
      banner.classList.add('is-open');if(textEl)textEl.textContent=text;
      await fbMarkMessagesSeen(clubId,userId,[latest.id]).catch(()=>false);
      setTimeout(()=>{wants();banner.dataset.opened='';banner.classList.remove('is-open');},2600);
    };
    banner.onclick=open;banner.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
  }
  window._homeBannerWants.message = true;
  if (typeof _reconcileHomeBanners === 'function') _reconcileHomeBanners(); else if (banner) banner.style.display = '';
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
