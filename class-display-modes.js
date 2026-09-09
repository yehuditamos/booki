/* Booki — class tree display modes v1
   Adds an explicit teacher choice between:
   1) competitive all-time leaderboard
   2) today's readers, non-competitive
   3) tree only
   Kept separate from routing.js so the live pilot can be changed safely.
*/
(function () {
  'use strict';

  const MODE_TODAY = 'todayReaders';
  const MODE_TREE  = 'progressOnly';
  const MODE_BOARD = 'leaderboard';
  const originalSetMode = window.setProgressDisplayMode;

  function isToday(value) {
    if (!value) return false;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return false;
    const n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function setMode(clubId, mode) {
    if (![MODE_BOARD, MODE_TODAY, MODE_TREE].includes(mode)) return;
    if (typeof fbSaveClub === 'function') {
      await fbSaveClub(clubId, { settings: { progressDisplay: mode } });
    } else if (typeof originalSetMode === 'function' && mode !== MODE_TODAY) {
      return originalSetMode(clubId, mode);
    }
    if (typeof showTeacherClassScreen === 'function') await showTeacherClassScreen();
  }
  window.setProgressDisplayMode = setMode;

  function teacherModePicker(clubId, mode) {
    const wrap = document.createElement('div');
    wrap.className = 'booki-display-picker';
    wrap.innerHTML = `
      <div class="bdp-title">👀 מה הילדים יראו ליד העץ הכיתתי?</div>
      <button class="bdp-option ${mode === MODE_BOARD ? 'active' : ''}" data-mode="${MODE_BOARD}">
        <strong>🏆 תחרותי — מי קרא הכי הרבה</strong>
        <span>מציג את הקוראים לפי סך זמן הקריאה, מהגבוה לנמוך.</span>
      </button>
      <button class="bdp-option ${mode === MODE_TODAY ? 'active' : ''}" data-mode="${MODE_TODAY}">
        <strong>📚 קראו היום <em>ללא תחרות</em></strong>
        <span>סביב העץ יופיעו רק הילדים שקראו היום: אייקון, שם ומספר דקות. אין דירוג ואין מקום ראשון.</span>
      </button>
      <button class="bdp-option ${mode === MODE_TREE ? 'active' : ''}" data-mode="${MODE_TREE}">
        <strong>🌳 העץ בלבד</strong>
        <span>הילדים רואים את התקדמות היעד הכיתתי בלבד, בלי שמות ובלי נתוני קריאה אישיים.</span>
      </button>
      <p class="bdp-note">💡 הבחירה משנה רק את מה שהילדים רואים. במסך הניהול שלך נתוני הכיתה נשארים זמינים.</p>`;
    wrap.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => setMode(clubId, btn.dataset.mode)));
    return wrap;
  }

  function enhanceTeacherPicker() {
    if (!window._currentTeacher) return;
    const old = document.querySelector('#class-content .tcd-qa-view');
    if (!old || old.dataset.bookiEnhanced === '1') return;
    const clubId = window.currentClubId || window._activeClubId;
    if (!clubId) return;
    const club = window._currentTeacherClubData || {};
    const mode = club?.settings?.progressDisplay || MODE_BOARD;
    const picker = teacherModePicker(clubId, mode);
    old.dataset.bookiEnhanced = '1';
    old.replaceWith(picker);
  }

  function renderTodayAroundTree(club, memberships) {
    const mode = club?.settings?.progressDisplay || MODE_BOARD;
    if (mode !== MODE_TODAY || window._currentTeacher) return;
    const content = document.getElementById('class-content');
    if (!content) return;

    const active = (memberships || []).filter(m => m.status !== 'left' && isToday(m.cachedStats?.lastReadAt));
    // Do not sort by minutes: the display must never imply ranking.
    active.sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'he'));

    content.querySelectorAll('.leaderboard,.tcd-leaderboard').forEach(el => el.style.display = 'none');
    let host = content.querySelector('.booki-today-readers');
    if (!host) {
      host = document.createElement('section');
      host.className = 'booki-today-readers';
      const tree = content.querySelector('.class-tree-wrap,.tree-wrap,.class-tree,.goal-tree,.club-tree');
      (tree?.parentNode || content).appendChild(host);
    }
    host.innerHTML = `
      <h3>קראו היום:</h3>
      <div class="btr-orbit">
        ${active.length ? active.map((m,i) => `
          <div class="btr-reader btr-pos-${i % 8}">
            <span class="btr-avatar">${escapeHtml(m.emoji || m.avatar || '📚')}</span>
            <span class="btr-name">${escapeHtml(m.name || 'קורא/ת')}</span>
            <strong>${Math.round(m.cachedStats?.todayMinutes ?? m.cachedStats?.minutesToday ?? m.cachedStats?.lastSessionMinutes ?? 0)} דק׳</strong>
          </div>`).join('') : '<p class="btr-empty">עוד לא קראו היום — מי יהיה הראשון? 🌱</p>'}
      </div>`;
  }

  // Patch the student class renderer without replacing the existing implementation.
  const originalRender = window.renderClassContent || window._renderClassContent;
  if (typeof originalRender === 'function') {
    const wrapped = function(club, memberships, ...rest) {
      const result = originalRender.call(this, club, memberships, ...rest);
      queueMicrotask(() => renderTodayAroundTree(club, memberships));
      return result;
    };
    if (window.renderClassContent === originalRender) window.renderClassContent = wrapped;
    if (window._renderClassContent === originalRender) window._renderClassContent = wrapped;
  }

  const style = document.createElement('style');
  style.textContent = `
    .booki-display-picker{direction:rtl;display:grid;gap:8px;width:100%;margin:8px 0 12px}
    .bdp-title{font-weight:900;font-size:16px;color:#24372f;margin-bottom:2px}
    .bdp-option{direction:rtl;text-align:right;border:2px solid #dce9df;background:#fff;border-radius:15px;padding:11px 13px;display:grid;gap:3px;color:#26372f;cursor:pointer;font-family:inherit}
    .bdp-option strong{font-size:14px}.bdp-option span{font-size:12px;line-height:1.45;color:#64736c}.bdp-option em{font-style:normal;background:#e5f7ed;color:#24734a;padding:2px 7px;border-radius:999px;font-size:11px;margin-right:5px}
    .bdp-option.active{border-color:#43a86f;background:#f0fbf4;box-shadow:0 0 0 2px rgba(67,168,111,.10)}
    .bdp-note{font-size:11px;line-height:1.45;color:#66736e;margin:2px 3px 0}
    .booki-today-readers{direction:rtl;text-align:center;margin:10px auto 18px;max-width:620px}.booki-today-readers h3{font-size:22px;margin:4px 0 14px;color:#244b39}
    .btr-orbit{position:relative;min-height:220px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;padding:14px}
    .btr-reader{background:rgba(255,255,255,.94);border:2px solid #bce6ce;border-radius:999px;padding:7px 11px;display:flex;align-items:center;gap:6px;box-shadow:0 5px 18px rgba(37,112,70,.12);animation:btrFloat 3.4s ease-in-out infinite alternate}
    .btr-reader:nth-child(2n){animation-delay:-1.2s}.btr-reader:nth-child(3n){animation-delay:-2.1s}.btr-avatar{font-size:22px}.btr-name{font-weight:800}.btr-reader strong{font-size:12px;color:#2c7950}.btr-empty{color:#6b776f;font-weight:700}
    @keyframes btrFloat{from{transform:translateY(-3px)}to{transform:translateY(5px)}}
    @media (prefers-reduced-motion:reduce){.btr-reader{animation:none}}
  `;
  document.head.appendChild(style);

  const observer = new MutationObserver(() => enhanceTeacherPicker());
  observer.observe(document.body, { childList:true, subtree:true });
  enhanceTeacherPicker();
})();
