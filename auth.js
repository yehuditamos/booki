/**
 * auth.js — Teacher Authentication via Firebase Auth (email + password)
 *
 * Exports (via window):
 *   signUpTeacher, signInTeacher, signOutTeacher,
 *   getCurrentTeacher, onTeacherAuthChange,
 *   showTeacherAuth, submitTeacherAuth, teacherSignOut
 */

(function () {
  function _auth() {
    return (typeof firebase !== 'undefined' && firebase.apps.length)
      ? firebase.auth()
      : null;
  }

  // ─── Auth API ─────────────────────────────────────────────────────────────────

  async function signUpTeacher(email, password, displayName) {
    const a = _auth();
    if (!a) throw new Error('Firebase Auth לא מוכן');
    const cred = await a.createUserWithEmailAndPassword(email, password);
    if (displayName) await cred.user.updateProfile({ displayName });
    return cred.user;
  }

  async function signInTeacher(email, password, remember) {
    const a = _auth();
    if (!a) throw new Error('Firebase Auth לא מוכן');
    const persistence = (remember !== false)
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION;
    await a.setPersistence(persistence);
    return (await a.signInWithEmailAndPassword(email, password)).user;
  }

  async function signOutTeacher() {
    const a = _auth();
    if (a) await a.signOut();
  }

  function getCurrentTeacher() {
    const a    = _auth();
    const user = a?.currentUser;
    if (!user || user.isAnonymous) return null;  // anonymous ≠ teacher
    return { uid: user.uid, email: user.email, name: user.displayName || user.email.split('@')[0] };
  }

  /**
   * מבטיח שיש auth פעיל לתלמיד — anonymous אם אין.
   * מחזיר uid. לעולם לא זורק — Fallback ל-localStorage.
   */
  async function ensureStudentAuth() {
    const a = _auth();
    if (!a) return localStorage.getItem('booki_tmp_uid');

    const current = a.currentUser;
    if (current) {
      localStorage.setItem('booki_tmp_uid', current.uid);
      return current.uid;
    }

    try {
      const cred = await a.signInAnonymously();
      localStorage.setItem('booki_tmp_uid', cred.user.uid);
      return cred.user.uid;
    } catch (e) {
      console.warn('[auth] signInAnonymously failed:', e.message);
      return localStorage.getItem('booki_tmp_uid');
    }
  }

  function onTeacherAuthChange(cb) {
    const a = _auth();
    if (!a) { setTimeout(() => cb(null), 0); return () => {}; }
    return a.onAuthStateChanged(u => {
      if (!u || u.isAnonymous) { cb(null); return; }
      cb({ uid: u.uid, email: u.email, name: u.displayName || u.email.split('@')[0] });
    });
  }

  // ─── Teacher Auth Screen ──────────────────────────────────────────────────────

  let _authMode = 'login';

  function showTeacherAuth(mode) {
    _authMode = mode || 'login';
    _renderAuthForm();
    if (typeof showScreen === 'function') showScreen('screen-teacher-auth');
  }

  function _renderAuthForm() {
    const form = document.getElementById('teacher-auth-form');
    if (!form) return;
    const isReg = _authMode === 'register';
    form.innerHTML = `
      <div class="auth-tabs">
        <button class="auth-tab${!isReg ? ' active' : ''}" onclick="showTeacherAuth('login')">כניסה</button>
        <button class="auth-tab${isReg  ? ' active' : ''}" onclick="showTeacherAuth('register')">הרשמה</button>
      </div>
      ${isReg ? `<input id="ta-name" type="text" class="input-field" placeholder="שם מלא" autocomplete="name" />` : ''}
      <input id="ta-email"    type="email"    class="input-field" placeholder="כתובת אימייל" autocomplete="email" />
      <input id="ta-password" type="password" class="input-field" placeholder="סיסמה (לפחות 6 תווים)" autocomplete="${isReg ? 'new-password' : 'current-password'}" />
      ${!isReg ? `<label class="auth-remember"><input id="ta-remember" type="checkbox" checked /> זכור אותי</label>` : ''}
      <p id="ta-error" class="auth-error"></p>
      <button class="btn-giant btn-green" onclick="submitTeacherAuth()">
        ${isReg ? '📝 הרשמה' : '🔑 כניסה'}
      </button>
    `;
  }

  async function submitTeacherAuth() {
    const errEl = document.getElementById('ta-error');
    const btn   = document.querySelector('#teacher-auth-form .btn-green');
    if (errEl) errEl.textContent = '';
    if (btn) btn.disabled = true;

    const email    = (document.getElementById('ta-email')?.value    || '').trim();
    const password = (document.getElementById('ta-password')?.value || '').trim();
    const name     = (document.getElementById('ta-name')?.value     || '').trim();
    const remember = document.getElementById('ta-remember')?.checked !== false;

    if (!email || !password) {
      if (errEl) errEl.textContent = 'יש למלא אימייל וסיסמה';
      if (btn) btn.disabled = false;
      return;
    }

    const MSGS = {
      'auth/user-not-found':       'לא נמצא חשבון עם כתובת זו',
      'auth/wrong-password':       'סיסמה שגויה',
      'auth/invalid-credential':   'אימייל או סיסמה שגויים',
      'auth/email-already-in-use': 'כתובת האימייל כבר רשומה',
      'auth/weak-password':        'הסיסמה חייבת להכיל לפחות 6 תווים',
      'auth/invalid-email':        'כתובת האימייל אינה תקינה',
      'auth/too-many-requests':    'יותר מדי ניסיונות — נסה שוב מאוחר יותר',
    };

    try {
      let teacher;
      if (_authMode === 'register') {
        const user = await signUpTeacher(email, password, name || email.split('@')[0]);
        teacher = { uid: user.uid, email: user.email, name: user.displayName || name || email.split('@')[0] };
        // יצירת מסמך משתמש ב-Firestore — role: 'teacher' ברירת מחדל
        if (typeof fbCreateTeacherUser === 'function') {
          await fbCreateTeacherUser(user.uid, teacher.name, teacher.email);
        }
      } else {
        const user = await signInTeacher(email, password, remember);
        teacher = { uid: user.uid, email: user.email, name: user.displayName || email.split('@')[0] };
        // עדכון lastLoginAt — fire and forget, לא חוסם את הניתוב
        if (typeof fbUpdateTeacherLastLogin === 'function') {
          fbUpdateTeacherLastLogin(user.uid).catch(() => {});
        }
      }
      // showTeacherDashboard טוענת role מ-Firestore ומנתבת ל-owner אם נדרש
      if (typeof showTeacherDashboard === 'function') showTeacherDashboard(teacher);
    } catch (e) {
      console.error('[auth] error.code:', e.code, '| error.message:', e.message);
      if (errEl) errEl.textContent = MSGS[e.code] || `שגיאה (${e.code || 'unknown'}) — בדוק Console`;
      if (btn) btn.disabled = false;
    }
  }

  async function teacherSignOut() {
    await signOutTeacher();
    if (typeof showScreen === 'function') showScreen('screen-splash');
  }

  // ─── Global exports ───────────────────────────────────────────────────────────
  Object.assign(window, {
    signUpTeacher,
    signInTeacher,
    signOutTeacher,
    getCurrentTeacher,
    onTeacherAuthChange,
    showTeacherAuth,
    submitTeacherAuth,
    teacherSignOut,
    ensureStudentAuth,
  });
})();
