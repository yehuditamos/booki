/**
 * auth.js — Teacher Authentication via Firebase Auth (email + password)
 *
 * Exports (via window):
 *   signUpTeacher, signInTeacher, signOutTeacher,
 *   getCurrentTeacher, onTeacherAuthChange,
 *   showTeacherAuth, submitTeacherAuth, resetTeacherPassword, teacherSignOut
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

  async function resetTeacherPassword() {
    const a = _auth();
    if (!a) throw new Error('Firebase Auth לא מוכן');
    const email = (document.getElementById('ta-email')?.value || '').trim();
    const errEl = document.getElementById('ta-error');
    const statusEl = document.getElementById('ta-status');
    if (errEl) errEl.textContent = '';
    if (statusEl) statusEl.textContent = '';

    if (!email) {
      if (errEl) errEl.textContent = 'כתבי קודם את כתובת האימייל שלך';
      document.getElementById('ta-email')?.focus();
      return;
    }

    try {
      await a.sendPasswordResetEmail(email);
      if (statusEl) statusEl.textContent = 'שלחנו קישור לאיפוס הסיסמה למייל 📩';
    } catch (e) {
      const messages = {
        'auth/invalid-email': 'כתובת האימייל אינה תקינה',
        'auth/too-many-requests': 'נשלחו יותר מדי בקשות. נסי שוב מאוחר יותר',
      };
      if (e.code === 'auth/user-not-found') {
        if (statusEl) statusEl.textContent = 'אם קיים חשבון עם המייל הזה, יישלח אליו קישור 📩';
      } else if (errEl) {
        errEl.textContent = messages[e.code] || 'לא הצלחנו לשלוח כרגע. נסי שוב בעוד רגע';
      }
    }
  }

  function getCurrentTeacher() {
    const a    = _auth();
    const user = a?.currentUser;
    if (!user || user.isAnonymous) return null;  // anonymous ≠ teacher
    return { uid: user.uid, email: user.email, name: user.displayName || user.email.split('@')[0] };
  }

  /**
   * מבטיח שיש auth פעיל לתלמיד — anonymous אם אין.
   * ממתין ל-onAuthStateChanged לפני יצירת session חדש, כדי למנוע פיצול UID.
   * Firebase Auth הוא Source of Truth — לעולם לא סומכים על localStorage לבדו.
   *
   * לעולם לא מחזירה UID של מורה כזהות תלמיד: אם המכשיר מחובר כרגע כמורה
   * (למשל מכשיר משותף שהמורה שכחה להתנתק ממנו), מתחברים אנונימית מחדש —
   * כך שכל פעולת תלמיד תמיד מיוחסת לזהות תלמיד אמיתית, גם במחיר ניתוק סשן
   * המורה במכשיר הזה בלבד (חשבון המורה עצמו אינו נפגע).
   */
  async function ensureStudentAuth() {
    const a = _auth();
    if (!a) return localStorage.getItem('booki_tmp_uid');

    // Session פעיל וכבר אנונימית — החזר מיד
    if (a.currentUser && a.currentUser.isAnonymous) {
      localStorage.setItem('booki_tmp_uid', a.currentUser.uid);
      return a.currentUser.uid;
    }

    // Session פעיל אך זו מורה (non-anonymous) — אסור להחזיר את ה-UID שלה כזהות תלמיד.
    if (a.currentUser && !a.currentUser.isAnonymous) {
      try {
        const cred = await a.signInAnonymously();
        localStorage.setItem('booki_tmp_uid', cred.user.uid);
        return cred.user.uid;
      } catch (e) {
        console.error('[auth] signInAnonymously (teacher handoff) failed:', e.code, e.message);
        return null;
      }
    }

    // Firebase עדיין מאתחל ומשחזר session מ-IndexedDB — מחכים לו.
    // אם נקרא ל-signInAnonymously לפני כן, ייווצר UID חדש שיגרום לפיצול.
    const restored = await new Promise(resolve => {
      const unsub = a.onAuthStateChanged(u => { unsub(); resolve(u); });
      setTimeout(() => { unsub(); resolve(null); }, 5000);
    });

    if (restored) {
      localStorage.setItem('booki_tmp_uid', restored.uid);
      return restored.uid;
    }

    // אין session כלל — תלמיד חדש או session שאבד לצמיתות
    try {
      const cred = await a.signInAnonymously();
      localStorage.setItem('booki_tmp_uid', cred.user.uid);
      return cred.user.uid;
    } catch (e) {
      console.error('[auth] signInAnonymously failed:', e.code, e.message);
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
        <button class="auth-tab${isReg  ? ' active' : ''}" onclick="showTeacherAuth('register')">הקמת חשבון</button>
      </div>
      ${isReg ? `<div class="auth-first-time-heading">✨ פעם ראשונה בבוקי? מכאן מקימים חשבון מורה</div>` : ''}
      ${isReg ? `<input id="ta-name" type="text" class="input-field" placeholder="שם מלא" autocomplete="name" />` : ''}
      <input id="ta-email"    type="email"    class="input-field" placeholder="כתובת אימייל" autocomplete="email" />
      <input id="ta-password" type="password" class="input-field" placeholder="סיסמה (לפחות 6 תווים)" autocomplete="${isReg ? 'new-password' : 'current-password'}" onkeydown="if(event.key==='Enter') submitTeacherAuth()" />
      <label class="auth-show-password"><input type="checkbox" onchange="toggleTeacherPassword(this.checked)" /> הצגת הסיסמה</label>
      ${!isReg ? `<label class="auth-remember"><input id="ta-remember" type="checkbox" checked /> זכור אותי</label>` : ''}
      <p id="ta-error" class="auth-error"></p>
      <p id="ta-status" class="auth-status" role="status"></p>
      <button class="btn-giant btn-green" onclick="submitTeacherAuth()">
        ${isReg ? '✨ הקמת החשבון שלי' : '🔑 כניסה'}
      </button>
      ${!isReg ? `
        <button type="button" class="auth-forgot-link" onclick="resetTeacherPassword()">שכחתי סיסמה</button>
        <button type="button" class="auth-first-account" onclick="showTeacherAuth('register')">
          <span class="auth-new-badge">פעם ראשונה?</span>
          <strong>הקמת חשבון מורה חדש</strong>
          <span>חינם ולוקח פחות מדקה ←</span>
        </button>
      ` : ''}
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
        // await — ודאות שהמסמך קיים/מעודכן לפני שה-routing בודק role
        if (typeof fbUpdateTeacherLastLogin === 'function') {
          await fbUpdateTeacherLastLogin(user.uid, teacher.name, teacher.email);
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

  function toggleTeacherPassword(show) {
    const input = document.getElementById('ta-password');
    if (input) input.type = show ? 'text' : 'password';
  }

  async function teacherSignOut() {
    await signOutTeacher();
    if (window.history?.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }
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
    resetTeacherPassword,
    toggleTeacherPassword,
    teacherSignOut,
    ensureStudentAuth,
  });
})();
