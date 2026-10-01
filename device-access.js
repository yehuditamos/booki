'use strict';
// A teacher confirms a child's new device. The existing card and reading history
// stay in place; only its authorized Firebase UID changes.
(function () {
  function panel(title) {
    const dialog = document.createElement('dialog');
    dialog.dir = 'rtl';
    dialog.style.cssText = 'max-width:460px;width:90%;border:0;border-radius:20px;padding:24px';
    const heading = document.createElement('h2'); heading.textContent = title;
    const body = document.createElement('div'); body.setAttribute('role', 'status');
    const close = document.createElement('button'); close.textContent = 'סגירה';
    close.onclick = () => dialog.close();
    dialog.append(heading, body, close); document.body.append(dialog); dialog.showModal();
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    return { dialog, body };
  }
  window.bookiRequestDeviceAccess = async function (clubId, cardId, name) {
    const uid = firebase.auth().currentUser?.uid;
    if (!uid || !window.db) throw new Error('אין חיבור לחשבון');
    const { dialog, body } = panel('אישור המכשיר שלך');
    body.textContent = 'כדי להיכנס לכרטיס של ' + name + ', המורה צריכה לאשר את המכשיר הזה. הקריאה שכבר נשמרה נשארת בכרטיס.';
    const button = document.createElement('button'); button.textContent = 'בקשת אישור מהמורה'; body.append(button);
    button.onclick = async () => {
      button.disabled = true;
      // A unique request lets a previously rejected device ask again. There is
      // deliberately no direct write to the child's membership from this device.
      const ref = window.db.collection('deviceAccessRequests').doc();
      try {
        await ref.set({ requesterUid: uid, clubId, cardId: String(cardId), status: 'pending', createdAt: new Date().toISOString() });
        body.textContent = 'הבקשה נשלחה. הציגו למורה את מזהה הבקשה: ' + ref.id.slice(-6) + '. השאירו את החלון פתוח.';
        const stop = ref.onSnapshot(snapshot => {
          const request = snapshot.data();
          if (request?.status === 'approved') {
            stop(); dialog.close();
            selectProfile(cardId, clubId).catch(() => alert('האישור נשמר. נסו להיכנס שוב לכרטיס.'));
          } else if (request?.status === 'rejected') {
            stop(); body.textContent = 'המורה לא אישרה את הבקשה. פנו אליה כדי לחבר את הכרטיס הנכון.';
          }
        }, () => { body.textContent = 'החיבור התנתק. האישור יישמר; נסו להיכנס שוב לכרטיס.'; });
        dialog.addEventListener('close', stop, { once: true });
      } catch (error) {
        body.textContent = 'הבקשה לא נשלחה. בדקו את החיבור ונסו שוב.';
        console.warn('[device-access] request failed', error.code);
      }
    };
  };
  window.bookiReviewDeviceAccess = async function () {
    const clubId = window.currentClubId;
    const uid = firebase.auth().currentUser?.uid;
    if (!clubId || !uid || !window.db) return;
    const { body } = panel('אישור מכשירים לילדים'); body.textContent = 'טוען בקשות…';
    try {
      // A single equality query avoids requiring a new composite production index.
      const snapshot = await window.db.collection('deviceAccessRequests').where('clubId', '==', clubId).get();
      body.textContent = '';
      const pending = snapshot.docs.filter(doc => doc.data().status === 'pending');
      if (!pending.length) body.textContent = 'אין בקשות ממתינות.';
      for (const requestDoc of pending) {
        const request = requestDoc.data();
        const cardRef = window.db.collection('clubs').doc(clubId).collection('memberships').doc(request.cardId);
        const card = await cardRef.get();
        const name = card.data()?.name || request.cardId;
        const row = document.createElement('p');
        const label = document.createElement('span'); label.textContent = name + ' — בקשה ' + requestDoc.id.slice(-6) + ' — ' + request.createdAt + ' ';
        const approve = document.createElement('button'); approve.textContent = 'אישור';
        const reject = document.createElement('button'); reject.textContent = 'דחייה';
        async function review(accepted) {
          if (accepted && !confirm('ודאו עם ' + name + ' שמזהה הבקשה המוצג במכשיר הוא ' + requestDoc.id.slice(-6) + '. אישור יחבר את המכשיר החדש וינתק את הקודם מהכרטיס. לאשר?')) return;
          approve.disabled = reject.disabled = true;
          try {
            await window.db.runTransaction(async tx => {
              const current = await tx.get(requestDoc.ref);
              const membership = await tx.get(cardRef);
              if (current.data()?.status !== 'pending') throw new Error('הבקשה כבר טופלה');
              if (!membership.exists || membership.data().status === 'left' || !membership.data().createdByTeacher) throw new Error('הכרטיס אינו פעיל');
              const now = new Date().toISOString();
              if (accepted) tx.update(cardRef, { claimedByUid: request.requesterUid, updatedAt: now });
              tx.update(requestDoc.ref, { status: accepted ? 'approved' : 'rejected', reviewedAt: now, reviewedBy: uid });
            });
            row.textContent = name + (accepted ? ' — המכשיר אושר.' : ' — הבקשה נדחתה.');
          } catch (error) {
            approve.disabled = reject.disabled = false;
            alert('הפעולה לא הושלמה. רעננו את הבקשות ונסו שוב.');
            console.warn('[device-access] review failed', error.code || error.message);
          }
        }
        approve.onclick = () => review(true); reject.onclick = () => review(false);
        row.append(label, approve, reject); body.append(row);
      }
    } catch (error) {
      body.textContent = 'לא הצלחנו לטעון בקשות. ודאו שאתם מחוברים כמורה של הכיתה.';
      console.warn('[device-access] list failed', error.code);
    }
  };
}());
