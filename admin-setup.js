/**
 * admin-setup.js — Admin: Club Creation Flow
 *
 * screen-splash → screen-create-type → screen-create-name →
 * screen-create-members → screen-create-review → screen-create-success
 */

let _newClub = { type: null, name: '', emoji: '🌳', members: [] };
let _newClubId = null;
let _clubCode  = '';

// ─── Entry ────────────────────────────────────────────────────────────────────

function showCreateClub() {
  _newClub  = { type: null, name: '', emoji: '🌳', members: [] };
  _newClubId = null;
  _clubCode  = '';
  showScreen('screen-create-type');
}

// ─── Step 1: Type ─────────────────────────────────────────────────────────────

function selectClubType(type) {
  _newClub.type = type;
  const input = document.getElementById('club-name-input');
  if (input) input.value = '';
  document.querySelectorAll('.emoji-opt').forEach((b, i) => {
    b.classList.toggle('selected', i === 0);
  });
  _newClub.emoji = '🌳';
  showScreen('screen-create-name');
}

// ─── Step 2: Name + Emoji ─────────────────────────────────────────────────────

function selectClubEmoji(el) {
  document.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  _newClub.emoji = el.dataset.emoji;
}

function submitClubName() {
  const input = document.getElementById('club-name-input');
  const name = (input?.value || '').trim();
  if (!name) { input?.focus(); return; }
  _newClub.name = name;
  const sel = document.querySelector('.emoji-opt.selected');
  if (sel) _newClub.emoji = sel.dataset.emoji;
  _newClub.members = [];
  goToReview();
}

function setAddMode(mode) {
  const single = document.getElementById('add-single-mode');
  const paste  = document.getElementById('add-paste-mode');
  if (single) single.style.display = mode === 'single' ? '' : 'none';
  if (paste)  paste.style.display  = mode === 'paste'  ? '' : 'none';
  document.querySelectorAll('.add-mode-btn').forEach(b => b.classList.remove('active'));
  const active = document.getElementById(`btn-mode-${mode}`);
  if (active) active.classList.add('active');
}

function addPastedMembers() {
  const text = (document.getElementById('member-paste-input')?.value || '');
  const names = text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !_newClub.members.includes(l));
  _newClub.members.push(...names);
  const pasteInput = document.getElementById('member-paste-input');
  if (pasteInput) pasteInput.value = '';
  setAddMode('single');
  renderMemberList();
  const btn = document.getElementById('btn-go-review');
  if (btn) btn.disabled = _newClub.members.length === 0;
}

// ─── Step 3: Members ──────────────────────────────────────────────────────────

function addMemberOnEnter(e) { if (e.key === 'Enter') addMember(); }

function addMember() {
  const input = document.getElementById('member-name-input');
  const name  = (input?.value || '').trim();
  if (!name || _newClub.members.includes(name)) {
    if (input) input.value = '';
    return;
  }
  _newClub.members.push(name);
  if (input) { input.value = ''; input.focus(); }
  renderMemberList();
  const btn = document.getElementById('btn-go-review');
  if (btn) btn.disabled = false;
}

function removeMember(i) {
  _newClub.members.splice(i, 1);
  renderMemberList();
  const btn = document.getElementById('btn-go-review');
  if (btn) btn.disabled = _newClub.members.length === 0;
}

function renderMemberList() {
  const countEl = document.getElementById('member-count');
  if (countEl) {
    countEl.textContent = _newClub.members.length
      ? `${_newClub.members.length} חברים נוספו`
      : '';
  }
  const listEl = document.getElementById('member-list');
  if (!listEl) return;
  listEl.innerHTML = _newClub.members.map((name, i) => `
    <div class="member-chip">
      <span class="member-chip-name">${name}</span>
      <button class="member-chip-remove" onclick="removeMember(${i})">✕</button>
    </div>`).join('');
}

// ─── Step 4: Review ───────────────────────────────────────────────────────────

function goToReview() {
  const typeLabel = (typeof CLUB_TYPE_DEFAULTS !== 'undefined')
    ? (CLUB_TYPE_DEFAULTS[_newClub.type]?.label ?? _newClub.type)
    : _newClub.type;

  const emojiEl   = document.getElementById('review-club-emoji');
  const nameEl    = document.getElementById('review-club-name');
  const typeEl    = document.getElementById('review-club-type');
  const listEl    = document.getElementById('review-member-list');
  const countEl   = document.getElementById('review-count');
  const createBtn = document.getElementById('btn-create-club');

  if (emojiEl)   emojiEl.textContent = _newClub.emoji;
  if (nameEl)    nameEl.textContent  = _newClub.name;
  if (typeEl)    typeEl.textContent  = typeLabel;
  if (countEl)   countEl.textContent = '';
  if (listEl)    listEl.innerHTML    = '<div style="color:#888;font-size:.9rem;padding:.5rem 0">תלמידים יצטרפו בעצמם דרך קישור או קוד מועדון 📱</div>';
  if (createBtn) { createBtn.disabled = false; createBtn.textContent = 'צור מועדון! 🚀'; }

  showScreen('screen-create-review');
}

// ─── Step 5: Create (async) ───────────────────────────────────────────────────

async function createClub() {
  const btn = document.getElementById('btn-create-club');
  if (btn) { btn.disabled = true; btn.textContent = 'יוצר מועדון...'; }

  const slug = _newClub.name
    .replace(/\s+/g, '-')
    .replace(/[^א-תa-zA-Z0-9-]/g, '')
    .slice(0, 20);
  _newClubId = slug + '-' + Date.now();

  const defaults = (typeof getClubTypeDefaults === 'function')
    ? getClubTypeDefaults(_newClub.type) : {};

  const _teacherUid = (typeof getCurrentTeacher === 'function' && getCurrentTeacher()?.uid) || null;
  const club = {
    id:         _newClubId,
    type:       _newClub.type,
    name:       _newClub.name,
    emoji:      _newClub.emoji,
    createdBy:  _teacherUid || 'admin',
    teacherUid: _teacherUid,
    goal:      defaults.defaultGoal ?? { type: 'minutes', target: 1500, period: 'year' },
    settings: {
      countAllSessions: defaults.countAllSessions ?? true,
      showLeaderboard:  defaults.showLeaderboard  ?? true,
      showMemberList:   defaults.showMemberList   ?? true,
      allowSelfJoin:    defaults.allowSelfJoin    ?? false,
      requireApproval:  defaults.requireApproval  ?? true,
    },
    active: true,
  };

  if (typeof fbCreateClub === 'function') await fbCreateClub(club);
  if (typeof analyticsClubCreated === 'function') analyticsClubCreated(_newClubId, _newClub.type);

  // קוד הצטרפות אחיד לכל המועדון (ללא הגבלת שימושים)
  _clubCode = _genCode();
  if (typeof fbCreateInvitation === 'function') {
    await fbCreateInvitation({
      code:         _clubCode,
      clubId:       _newClubId,
      createdBy:    'admin',
      targetName:   null,
      targetUserId: null,
      channel:      'whatsapp',
      link:         _buildJoinLink(),
      maxUses:      null,
      expiresAt:    null,
    });
  }

  // שמור את המועדון במכשיר (המנהל/ת כבר נמצא/ת פה)
  if (typeof addDeviceClub === 'function') {
    addDeviceClub({
      clubId: _newClubId,
      type:   _newClub.type,
      name:   _newClub.name,
      emoji:  _newClub.emoji,
    });
  }

  _renderSuccessScreen();
  showScreen('screen-create-success');
}

function _genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(
    { length: 6 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

function _buildJoinLink() {
  const base = window.location.href.split('?')[0];
  return base + '?club=' + encodeURIComponent(_newClubId);
}

function copyJoinLink() {
  const link = _buildJoinLink();
  const btn  = document.querySelector('[onclick="copyJoinLink()"]');
  const done = () => {
    if (btn) { const orig = btn.textContent; btn.textContent = '✅ הועתק!'; setTimeout(() => btn.textContent = orig, 2000); }
  };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(done);
  } else {
    const ta = document.createElement('textarea');
    ta.value = link; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); done();
  }
}

function _renderSuccessScreen() {
  const nameEl  = document.getElementById('success-club-name');
  const emojiEl = document.getElementById('success-club-emoji');
  const codeEl  = document.getElementById('success-club-code');
  if (nameEl)  nameEl.textContent  = _newClub.name;
  if (emojiEl) emojiEl.textContent = _newClub.emoji;
  if (codeEl)  codeEl.textContent  = _clubCode;
}

function shareCodesWhatsApp() {
  const link = _buildJoinLink();
  const text = [
    `📚 *מועדון הקריאה "${_newClub.name}" מוכן!*`,
    ``,
    `לחצו על הקישור להצטרפות מהירה:`,
    link,
    ``,
    `או פתחו את בוקי והזינו את קוד המועדון: *${_clubCode}*`,
  ].join('\n');
  if (navigator.share) {
    // Web Share API — feature detection; iOS Safari 12.2+ / Android Chrome 61+ / Desktop Chrome 89+.
    // מעביר טקסט מלא דרך מנגנון שיתוף נייטיב — ללא בעיית Universal Links של iOS.
    navigator.share({ text }).catch(() => {});
  } else {
    // Fallback: WhatsApp Web — Desktop ודפדפנים ללא Web Share API.
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  }
}

function goFromSuccessToWhoReads() {
  if (_newClubId && typeof showWhoReads === 'function') {
    showWhoReads(_newClubId);
  } else {
    showScreen('screen-splash');
  }
}
