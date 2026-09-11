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

// Teacher catalog preview and professional feedback. No student/database writes.
(function loadTeacherWorkspace() {
  if (document.querySelector('script[data-booki-teacher-workspace]')) return;
  const s = document.createElement('script');
  s.src = 'teacher-workspace.js?v=20260909-1';
  s.async = false;
  s.dataset.bookiTeacherWorkspace = '1';
  s.onerror = () => console.warn('[booki] teacher workspace did not load');
  document.head.appendChild(s);
})();

// Pilot release 2026-09-10 — ordered hotfix modules; no Firebase Rules changes.
(function loadPilotRelease20260910() {
  if (document.querySelector('script[data-booki-pilot-loader-20260910]')) return;
  const s = document.createElement('script');
  s.src = 'pilot-loader-2026-09-10.js?v=4';
  s.async = false;
  s.dataset.bookiPilotLoader20260910 = '1';
  s.onerror = () => console.warn('[booki] pilot release loader did not load');
  document.head.appendChild(s);
})();

// ══ Teacher intro — once, immediately before the first teacher login ═══════════
// The video is intentionally stored as small base64 text chunks because GitHub's
// text-content API is used for this pilot release. The browser reassembles it into
// a local Blob; no external video host is required at runtime.
(function installTeacherFirstLoginIntro() {
  const SEEN_KEY = 'booki_teacher_intro_seen_v1';
  const CHUNKS = [0, 1, 2, 3].map(i =>
    `assets/teacher-onboarding/teacher-intro-mini.part${String(i).padStart(2, '0')}.b64?v=1`
  );

  if (typeof window.goToTeacherArea !== 'function') return;
  if (window.goToTeacherArea.__bookiFirstLoginIntro) return;

  const originalGoToTeacherArea = window.goToTeacherArea;
  let opening = false;

  function hasSeenIntro() {
    try { return localStorage.getItem(SEEN_KEY) === '1'; }
    catch { return false; }
  }

  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
  }

  function ensureStyle() {
    if (document.getElementById('booki-teacher-intro-style')) return;
    const style = document.createElement('style');
    style.id = 'booki-teacher-intro-style';
    style.textContent = `
      #booki-teacher-intro {
        position:fixed; inset:0; z-index:2147483000; display:flex;
        align-items:center; justify-content:center; padding:18px;
        background:linear-gradient(155deg,#effcf7 0%,#fff9ed 48%,#f5efff 100%);
        font-family:Heebo,Arial,sans-serif; direction:rtl; box-sizing:border-box;
      }
      #booki-teacher-intro * { box-sizing:border-box; }
      .bti-card {
        position:relative; width:min(430px,100%); max-height:calc(100vh - 28px);
        padding:14px; border-radius:30px; background:rgba(255,255,255,.96);
        box-shadow:0 22px 70px rgba(46,75,66,.17); overflow:auto;
        border:1px solid rgba(82,205,168,.19);
      }
      .bti-eyebrow { margin:4px 0 10px; text-align:center; font-weight:800; color:#315d55; font-size:14px; }
      .bti-video-wrap { position:relative; border-radius:22px; overflow:hidden; background:#edf7f2; aspect-ratio:144/256; max-height:68vh; margin:auto; }
      .bti-video { display:block; width:100%; height:100%; object-fit:contain; background:#edf7f2; }
      .bti-loading { position:absolute; inset:0; display:grid; place-items:center; color:#397166; font-size:15px; font-weight:700; background:#f4fbf7; }
      .bti-play {
        display:none; position:absolute; inset:auto 50% 22px auto; transform:translateX(50%);
        border:0; border-radius:999px; padding:12px 22px; font:800 16px Heebo,Arial,sans-serif;
        color:#fff; background:#36bea2; box-shadow:0 7px 22px rgba(54,190,162,.28); cursor:pointer;
      }
      .bti-skip {
        position:absolute; top:18px; left:18px; z-index:3; border:0; border-radius:999px;
        padding:7px 12px; background:rgba(255,255,255,.9); color:#5b6e68;
        font:700 13px Heebo,Arial,sans-serif; cursor:pointer; box-shadow:0 3px 12px rgba(0,0,0,.08);
      }
      .bti-stamp {
        display:none; min-height:420px; padding:36px 24px 28px; align-items:center;
        justify-content:center; flex-direction:column; text-align:center;
        animation:btiFade .28s ease both;
      }
      .bti-stamp-ring {
        width:190px; height:190px; border:5px solid #73dcc7; border-radius:50%;
        display:flex; align-items:center; justify-content:center; flex-direction:column;
        background:#fff; box-shadow:0 0 0 10px rgba(115,220,199,.14),0 16px 45px rgba(61,176,153,.16);
        transform:rotate(-3deg); animation:btiStamp .48s cubic-bezier(.2,1.4,.45,1) both;
      }
      .bti-stamp-book { font-size:38px; line-height:1; margin-bottom:4px; }
      .bti-stamp-name { font-size:35px; line-height:1.1; font-weight:900; color:#304b48; }
      .bti-stamp-sub { font-size:15px; font-weight:700; color:#6d7c78; }
      .bti-stamp h2 { margin:28px 0 5px; font-size:27px; color:#304b48; }
      .bti-stamp p { margin:0; color:#71817c; font-size:16px; }
      @keyframes btiStamp { from{opacity:0;transform:scale(.65) rotate(-9deg)} to{opacity:1;transform:scale(1) rotate(-3deg)} }
      @keyframes btiFade { from{opacity:0} to{opacity:1} }
      @media (max-height:680px) {
        .bti-video-wrap { max-height:58vh; }
        .bti-stamp { min-height:330px; padding-top:22px; }
        .bti-stamp-ring { width:150px; height:150px; }
      }
    `;
    document.head.appendChild(style);
  }

  async function buildVideoBlobUrl() {
    const texts = await Promise.all(CHUNKS.map(async path => {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`teacher intro chunk failed: ${res.status}`);
      return (await res.text()).trim();
    }));
    const b64 = texts.join('').replace(/\s+/g, '');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
  }

  function showIntro(updateUrl) {
    if (opening) return;
    opening = true;
    ensureStyle();
    if (typeof setNavVisible === 'function') setNavVisible(false);

    if (updateUrl && window.history?.replaceState) {
      const url = new URL(window.location.href);
      url.search = '';
      url.searchParams.set('teacher', '1');
      url.hash = '';
      window.history.replaceState(null, '', url.toString());
    }

    const overlay = document.createElement('div');
    overlay.id = 'booki-teacher-intro';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="bti-card">
        <button class="bti-skip" type="button">דלגי ←</button>
        <p class="bti-eyebrow">📚 רגע לפני שמתחילות — הכירי את בוקי</p>
        <div class="bti-video-wrap">
          <div class="bti-loading">פותחים את הסרטון…</div>
          <video class="bti-video" muted playsinline webkit-playsinline preload="auto"></video>
          <button class="bti-play" type="button">▶ לצפייה</button>
        </div>
        <div class="bti-stamp" aria-live="polite">
          <div class="bti-stamp-ring">
            <div class="bti-stamp-book">📚</div>
            <div class="bti-stamp-name">בוקי</div>
            <div class="bti-stamp-sub">יַעַר הַקְּרִיאָה</div>
          </div>
          <h2>הקריאה צומחת יחד 🌱</h2>
          <p>ועכשיו — פותחות מועדון לכיתה.</p>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const video = overlay.querySelector('.bti-video');
    const loading = overlay.querySelector('.bti-loading');
    const playBtn = overlay.querySelector('.bti-play');
    const videoWrap = overlay.querySelector('.bti-video-wrap');
    const stamp = overlay.querySelector('.bti-stamp');
    const skip = overlay.querySelector('.bti-skip');
    let blobUrl = null;
    let finishing = false;

    const complete = () => {
      if (finishing) return;
      finishing = true;
      markSeen();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      overlay.remove();
      opening = false;
      originalGoToTeacherArea(updateUrl);
    };

    const showStamp = () => {
      if (finishing) return;
      video.pause();
      videoWrap.style.display = 'none';
      stamp.style.display = 'flex';
      skip.style.display = 'none';
      setTimeout(complete, 1450);
    };

    skip.addEventListener('click', complete);
    video.addEventListener('ended', showStamp, { once: true });
    video.addEventListener('error', showStamp, { once: true });
    playBtn.addEventListener('click', () => {
      playBtn.style.display = 'none';
      video.play().catch(() => { playBtn.style.display = 'block'; });
    });

    buildVideoBlobUrl().then(url => {
      if (!overlay.isConnected) { URL.revokeObjectURL(url); return; }
      blobUrl = url;
      video.src = url;
      loading.style.display = 'none';
      const p = video.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => { playBtn.style.display = 'block'; });
      }
    }).catch(error => {
      console.warn('[booki] teacher intro could not load:', error);
      loading.textContent = 'ברוכה הבאה לבוקי 💚';
      setTimeout(showStamp, 350);
    });
  }

  function wrappedGoToTeacherArea(updateUrl = true) {
    if (hasSeenIntro()) return originalGoToTeacherArea(updateUrl);
    showIntro(updateUrl);
  }
  wrappedGoToTeacherArea.__bookiFirstLoginIntro = true;
  wrappedGoToTeacherArea.__original = originalGoToTeacherArea;
  window.goToTeacherArea = wrappedGoToTeacherArea;

  // QA helper: run in console to see the intro again on this device.
  window.resetTeacherIntroOnboarding = function() {
    try { localStorage.removeItem(SEEN_KEY); } catch {}
    return true;
  };
})();
