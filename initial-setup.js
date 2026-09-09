/**
 * initial-setup.js — Initial System Setup
 *
 * מוצג פעם אחת בלבד כאשר config/setup אינו קיים ב-Firestore.
 * יוצר חשבון Firebase Auth + מסמך Owner + sentinel config/setup.
 * לאחר השלמה: Initial Setup נעול לצמיתות.
 * כל הרשמה עתידית מקבלת role:'teacher' (לעולם לא role:'owner').
 */

function showInitialSetup() {
  if (typeof setNavVisible === 'function') setNavVisible(false);
  ['su-name', 'su-email', 'su-password', 'su-org'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const errEl = document.getElementById('su-error');
  if (errEl) errEl.textContent = '';
  if (typeof showScreen === 'function') showScreen('screen-initial-setup');
}

async function submitInitialSetup() {
  const name     = (document.getElementById('su-name')?.value     || '').trim();
  const email    = (document.getElementById('su-email')?.value    || '').trim();
  const password = (document.getElementById('su-password')?.value || '').trim();
  const orgName  = (document.getElementById('su-org')?.value      || '').trim();
  const errEl    = document.getElementById('su-error');
  const btn      = document.getElementById('btn-submit-setup');

  if (errEl) errEl.textContent = '';

  if (!name || !email || !password) {
    if (errEl) errEl.textContent = 'יש למלא שם, אימייל וסיסמה';
    return;
  }
  if (password.length < 6) {
    if (errEl) errEl.textContent = 'סיסמה חייבת להכיל לפחות 6 תווים';
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'מגדיר מערכת...'; }

  try {
    const auth = firebase.auth();
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const uid  = cred.user.uid;
    await cred.user.updateProfile({ displayName: name });

    const now = new Date().toISOString();
    await firebase.firestore().collection('users').doc(uid).set({
      name,
      email,
      role:        'owner',
      status:      'active',
      orgName:     orgName || '',
      createdAt:   now,
      updatedAt:   now,
      lastLoginAt: now,
    });

    if (typeof fbCreateSetupRecord === 'function') {
      await fbCreateSetupRecord(uid, orgName);
    } else {
      await firebase.firestore().collection('config').doc('setup').set({
        completedAt: now,
        ownerUid:    uid,
        orgName:     orgName || '',
      });
    }

    const teacher = { uid, email, name, role: 'owner' };
    window._currentTeacher = teacher;
    if (typeof showOwnerDashboard === 'function') {
      showOwnerDashboard(teacher);
    }

  } catch (e) {
    const msgs = {
      'auth/email-already-in-use': 'כתובת המייל כבר רשומה — נסה להתחבר',
      'auth/weak-password':        'הסיסמה חייבת להכיל לפחות 6 תווים',
      'auth/invalid-email':        'כתובת המייל אינה תקינה',
    };
    if (errEl) errEl.textContent = msgs[e.code] || ('שגיאה: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'הגדר מערכת'; }
  }
}

window.showInitialSetup   = showInitialSetup;
window.submitInitialSetup = submitInitialSetup;

// הרחבה מבודדת למסכי תצוגת העץ. טעינה דינמית שומרת את index.html ללא שינוי.
(function loadClassDisplayModes() {
  if (document.querySelector('script[data-booki-class-display-modes]')) return;
  const s = document.createElement('script');
  s.src = 'class-display-modes.js?v=1';
  s.async = false;
  s.dataset.bookiClassDisplayModes = '1';
  s.onerror = () => console.warn('[booki] class display modes extension did not load');
  document.head.appendChild(s);
})();

// Pilot teacher/parent flow: scoped UI and reliable dashboard read states.
(function loadTeacherFlow() {
  if (document.querySelector('script[data-booki-teacher-flow]')) return;
  const s = document.createElement('script');
  s.src = 'teacher-flow.js?v=20260909-1';
  s.async = false;
  s.dataset.bookiTeacherFlow = '1';
  s.onerror = () => console.warn('[booki] teacher flow extension did not load');
  document.head.appendChild(s);
})();
