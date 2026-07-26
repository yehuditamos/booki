/**
 * firebase-messages.js — Sprint 10 (Parts 6-8) + Sprint 11 (two-way threads)
 *
 * clubs/{clubId}/messages/{messageId}
 *   { threadId:   string,          // מקבץ שיחה; שווה למזהה ההודעה עצמה כשהיא פותחת שרשור חדש
 *     toUserId:   string|null,     // null רק בהכרזה כיתתית המקורית; כל תגובה (גם להכרזה)
 *                                  // ממוענת לתלמיד/ה ספציפי/ת — כך שהיא נשארת פרטית בין
 *                                  // אותו תלמיד/ה למורה, ותלמידים אחרים לעולם לא רואים אותה
 *     senderRole: 'teacher'|'student',
 *     senderId:   string,          // uid של המורה, או ה-userId (card/uid) של התלמיד/ה
 *     type:       'encouragement'|'announcement'|'reply',
 *     text, preset, createdBy, createdAt,
 *     readByStudent: timestamp|null,   // שני דגלי-קריאה נפרדים — "הנמען" תלוי מי כתב/ה
 *     readByTeacher: timestamp|null }  // כל הודעה (readAt הישן עדיין נתמך לקריאה לאחור)
 *
 * עיצוב אחד, "לא-מנופח": שרשור = כל ההודעות עם אותו threadId, ממוינות לפי createdAt.
 * הודעות Sprint 10 ישנות (בלי threadId/senderRole, עם readAt יחיד) ממשיכות לעבוד —
 * חסר threadId נופל חזרה למזהה ההודעה עצמה, וחסר readByStudent/readByTeacher נופל ל-readAt.
 */

function _messagesRef(clubId) {
  return _db().collection('clubs').doc(clubId).collection('messages');
}

/** מורה שולחת הודעה חדשה — אישית (toUserId מוגדר) או כיתתית (toUserId null). פותחת שרשור חדש. */
async function fbSendMessage(clubId, { type, toUserId = null, text, preset = null }) {
  if (!_db() || !clubId || !type || !text?.trim()) return { ok: false, reason: 'missing-data' };
  try {
    const ref = _messagesRef(clubId).doc();
    const teacherUid = (typeof getCurrentTeacher === 'function' ? getCurrentTeacher()?.uid : null) || null;
    const now = _now();
    await ref.set({
      threadId: ref.id, toUserId,
      senderRole: 'teacher', senderId: teacherUid,
      type, text: text.trim(), preset,
      createdBy: teacherUid, createdAt: now,
      readByTeacher: now, readByStudent: null,
    });
    return { ok: true, id: ref.id };
  } catch (e) {
    console.warn('[firebase-messages] fbSendMessage error:', e.code, e.message);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Sprint 11 — Parts 7-8: המשך שרשור קיים — מתלמיד/ה למורה או להפך.
 * @param {{threadId:string, toUserId:string, text:string, senderRole:'teacher'|'student', senderId:string}} msg
 */
async function fbReplyToMessage(clubId, { threadId, toUserId, text, senderRole, senderId }) {
  if (!_db() || !clubId || !threadId || !toUserId || !text?.trim() || !senderRole || !senderId) {
    return { ok: false, reason: 'missing-data' };
  }
  try {
    const ref = _messagesRef(clubId).doc();
    const now = _now();
    await ref.set({
      threadId, toUserId,
      senderRole, senderId,
      type: 'reply', text: text.trim(), preset: null,
      createdBy: senderId, createdAt: now,
      readByTeacher: senderRole === 'teacher' ? now : null,
      readByStudent: senderRole === 'student' ? now : null,
    });
    return { ok: true, id: ref.id };
  } catch (e) {
    console.warn('[firebase-messages] fbReplyToMessage error:', e.code, e.message);
    return { ok: false, reason: e.code === 'permission-denied' ? 'permission-denied' : 'error' };
  }
}

/**
 * טוען את ההודעות הרלוונטיות לתלמיד/ה: האישיות שלו/ה (כולל תגובות התלמיד/ה עצמו/ה
 * ותגובות המורה בתוכן) + כל ההכרזות הכיתתיות. אותה פונקציה משרתת גם את המורה כשהיא
 * צופה בשרשור של תלמיד/ה ספציפי/ת (userId) — קריאת מורה למסמכי הודעה מותרת תמיד ב-Rules.
 * שתי שאילתות פשוטות וממוזגות בצד הלקוח — במקום טריק array-contains שמסבך את הכתיבה.
 */
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

/** Sprint 11 — Part 8: כל הודעות המועדון בבת אחת — למורה, לחישוב "יש תגובה חדשה" לפי תלמיד/ה. */
async function fbLoadAllMessages(clubId) {
  if (!_db() || !clubId) return [];
  try {
    const snap = await _messagesRef(clubId).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('[firebase-messages] fbLoadAllMessages error:', e.code, e.message);
    return [];
  }
}

/**
 * מקבץ רשימת הודעות שטוחה (fbLoadMyMessages) לשרשורי-שיחה, ממוינים חדש→ישן.
 * הודעות ישנות בלי threadId מטופלות כשרשור בן-הודעה-אחת (id עצמו).
 */
function _groupMessagesIntoThreads(messages) {
  const byThread = new Map();
  (messages || []).forEach(m => {
    const tid = m.threadId || m.id;
    if (!byThread.has(tid)) byThread.set(tid, []);
    byThread.get(tid).push(m);
  });
  const threads = Array.from(byThread.entries()).map(([threadId, msgs]) => {
    msgs.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    return { threadId, messages: msgs, lastAt: msgs[msgs.length - 1]?.createdAt || '' };
  });
  threads.sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
  return threads;
}

/**
 * מסמן הודעה כנקראה — role קובע איזה דגל מתעדכן (readByStudent/readByTeacher), ברירת
 * מחדל 'student' לתאימות לאחור עם קריאות Sprint 10 הקיימות. עדכון שדה יחיד, מותר רק
 * לצד הרלוונטי (ר' firestore.rules).
 */
async function fbMarkMessageRead(clubId, messageId, role = 'student') {
  if (!_db() || !clubId || !messageId) return false;
  const field = role === 'teacher' ? 'readByTeacher' : 'readByStudent';
  try {
    await _messagesRef(clubId).doc(messageId).update({ [field]: _now() });
    return true;
  } catch (e) {
    console.warn('[firebase-messages] fbMarkMessageRead error:', e.code, e.message);
    return false;
  }
}

// ─── UI: התראת "יש הודעה" בעמוד הבית + מודל תצוגה (Sprint 10) ────────────────
//
// הודעות אישיות (וכל תגובה, לשני הכיוונים) מסומנות "נקרא" בפועל במסד הנתונים
// (readByStudent/readByTeacher — ר' firestore.rules). רק ההכרזה הכיתתית המקורית
// (toUserId==null) משותפת לכל הכיתה בלי שדה "נקרא" אישי — "נצפתה" עבורה מסומנת
// מקומית (localStorage), בדיוק כמו ב-Sprint 10; שום דבר אחר לא נשען על local בלבד.

function _isUnreadForStudent(m, seenAnnouncements) {
  if (m.senderRole === 'student') return false; // ההודעה של התלמיד/ה עצמו/ה — אף פעם לא "לא נקראה"
  if (m.toUserId == null) return !(seenAnnouncements || []).includes(m.id);
  return !(m.readByStudent || m.readAt);
}

async function checkNewMessages(clubId, userId) {
  const indicator = document.getElementById('booki-message-indicator');
  if (!clubId || !userId) {
    if (indicator) indicator.style.display = 'none';
    window._bookiMessages = [];
    if (typeof _renderReaderCardMessageBadge === 'function') _renderReaderCardMessageBadge(0);
    return { messages: [], unreadCount: 0 };
  }

  const messages = await fbLoadMyMessages(clubId, userId);
  let seenAnnouncements = [];
  try { seenAnnouncements = JSON.parse(localStorage.getItem('booki_seen_announcements_' + clubId) || '[]'); } catch {}

  const unread = messages.filter(m => _isUnreadForStudent(m, seenAnnouncements));
  window._bookiMessages = messages; // נשמר לשימוש מיידי במודל, בלי fetch נוסף בפתיחה
  if (indicator) indicator.style.display = unread.length ? '' : 'none';
  if (typeof _renderReaderCardMessageBadge === 'function') _renderReaderCardMessageBadge(unread.length);
  return { messages, unreadCount: unread.length };
}

function openMessagesModal() {
  const messages = window._bookiMessages || [];
  if (!messages.length) return;
  document.getElementById('messages-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'messages-modal';
  overlay.className = 'av-modal-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeMessagesModal(); });

  overlay.innerHTML = `
    <div class="av-modal-box" onclick="event.stopPropagation()">
      <button class="av-modal-close" onclick="closeMessagesModal()">✕</button>
      <p class="av-modal-title">🦉 לבוקי יש הודעה בשבילך!</p>
      <div class="messages-list">
        ${messages.map(m => `
          <div class="message-item">
            <p class="message-from">${m.senderRole === 'student' ? '🧒 את/ה כתבת:' : (m.toUserId ? '💙 המורה כתבה:' : '📢 הודעה לכיתה:')}</p>
            <p class="message-text">"${_escMsgHtml(m.text)}"</p>
          </div>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const clubId = window.currentClubId
    || (typeof getActiveReader === 'function' ? getActiveReader()?.clubId : null);
  if (clubId) {
    messages.filter(m => m.senderRole !== 'student' && m.toUserId && !(m.readByStudent || m.readAt)).forEach(m => {
      if (typeof fbMarkMessageRead === 'function') fbMarkMessageRead(clubId, m.id, 'student');
    });
    try {
      const seen = JSON.parse(localStorage.getItem('booki_seen_announcements_' + clubId) || '[]');
      const merged = Array.from(new Set([...seen, ...messages.filter(m => !m.toUserId).map(m => m.id)]));
      localStorage.setItem('booki_seen_announcements_' + clubId, JSON.stringify(merged));
    } catch {}
  }

  const indicator = document.getElementById('booki-message-indicator');
  if (indicator) indicator.style.display = 'none';
  if (typeof _renderReaderCardMessageBadge === 'function') _renderReaderCardMessageBadge(0);
}

function closeMessagesModal() {
  document.getElementById('messages-modal')?.remove();
}

function _escMsgHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

Object.assign(window, {
  fbSendMessage, fbReplyToMessage, fbLoadMyMessages, fbLoadAllMessages, fbMarkMessageRead,
  _groupMessagesIntoThreads,
  checkNewMessages, openMessagesModal, closeMessagesModal,
});
