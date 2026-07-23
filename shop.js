/**
 * shop.js — Shop UI
 *
 * Milestone 2: ניהול הפרסים למורה — מדף חנות ויזואלי, לא טבלת נתונים.
 * Milestone 3: עיון בחנות לתלמיד — קטלוג לצפייה בלבד (browsing).
 *   הצבעה/רכישה/מעקב יעד עדיין לא קיימים (goalCycles/economy/shop-state
 *   מגיעים ב-milestones הבאים) — לכן אין כרגע פס התקדמות אמיתי, רק
 *   הודעת ציפייה כללית. אין לחוות דעת מזויפת על התקדמות שאין לה גיבוי אמיתי.
 */

const REWARD_EMOJIS = [
  '🎁', '🏆', '🎮', '🍕', '🍿', '🎨', '⚽', '🏀', '🎬', '🎧',
  '🧩', '🪁', '🎲', '🖍️', '📚', '🎟️', '🍦', '🍩', '🧸', '⭐',
  '🥇', '🎉', '🕹️', '🎯', '🚲', '🪀', '🖊️', '🎈', '🍭', '🌟',
];

let _rmState = null; // { clubId, rewardId: string|null, emoji, existing }
let _shopViewUnsubscribe = null; // Firebase listener על shop/state כשמסך החנות של התלמיד פתוח

function _escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * onerror handler משותף לתמונת פרס שנכשלה בטעינה — קורא את האמוג׳י מ-data attribute
 * (מוזרם ב-HTML דרך _escHtml) במקום להטמיע אותו כמחרוזת בתוך attribute inline,
 * כדי שערך emoji לא-סטנדרטי (שהגיע מקריאה ישירה ל-API ולא מהבורר הקבוע) לעולם
 * לא ירוץ כ-JS.
 */
function _rewardImgFallback(img) {
  const span = document.createElement('span');
  span.className = 'reward-card-emoji';
  span.textContent = img.dataset.fallbackEmoji || '🎁';
  img.replaceWith(span);
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

function showShopManagement() {
  const clubId = window.currentClubId;
  if (!clubId) return;
  if (typeof setNavVisible === 'function') setNavVisible(false);
  showScreen('screen-shop-teacher');
  _renderShopManagement(clubId);
}

async function _renderShopManagement(clubId) {
  const container = document.getElementById('shop-teacher-content');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:3rem;font-size:2rem">⏳</div>';

  // הגנתי — תופס מקרה שבו היעד נחצה אבל אף אחד לא היה במסך כשזה קרה
  if (typeof evaluateGoalProgress === 'function') {
    try { await evaluateGoalProgress(clubId); } catch (e) { /* best-effort */ }
  }

  const [rewards, shopState] = await Promise.all([
    typeof fbLoadRewards    === 'function' ? fbLoadRewards(clubId)    : Promise.resolve([]),
    typeof fbLoadShopState  === 'function' ? fbLoadShopState(clubId)  : Promise.resolve(null),
  ]);

  let statusHtml;
  let goalsCardHtml = '';

  if (!shopState) {
    statusHtml = _enableShopSetupHtml(clubId);
  } else {
    // Task 5: הכל-במקום-אחד — הכרטיס הזה זקוק לאותם club/cycle/econ בלי קשר למצב החנות,
    // אז הם נטענים פעם אחת כאן, למעלה, ולא בכל ענף בנפרד.
    const [club, cycle, econ] = await Promise.all([
      typeof fbLoadClub === 'function' ? fbLoadClub(clubId) : Promise.resolve(null),
      shopState.activeCycleId && typeof fbLoadGoalCycle === 'function'
        ? fbLoadGoalCycle(clubId, shopState.activeCycleId) : Promise.resolve(null),
      typeof fbLoadEconomy === 'function' ? fbLoadEconomy(clubId) : Promise.resolve(null),
    ]);
    goalsCardHtml = _classroomGoalsCardHtml(clubId, cycle, econ, club?.shopSettings || {});

    if (shopState.state === 'GOAL_REACHED_PENDING_SHOP') {
      statusHtml = _goalReachedTeacherHtml(clubId);
    } else if (shopState.state === 'voting_open') {
      statusHtml = await _votingOpenTeacherHtml(clubId, shopState.activeVoteId);
    } else if (shopState.state === 'voting_closed') {
      statusHtml = await _votingClosedTeacherHtml(clubId, shopState.activeVoteId);
    } else if (shopState.state === 'purchase_complete') {
      statusHtml = await _purchaseCompleteTeacherHtml(clubId, shopState, cycle);
    } else {
      statusHtml = _browsingProgressHtml(cycle, econ);
    }
  }

  _renderRewardGrid(clubId, rewards, goalsCardHtml + statusHtml);
}

function _enableShopSetupHtml(clubId) {
  return `
    <div class="shop-setup-card">
      <div class="shop-setup-icon">🎯</div>
      <h3>הפעילו את היעד הראשון</h3>
      <p>הכיתה תצבור דקות קריאה משותפות. כשהיא תגיע ליעד — בוקי יחגוג, ותיפתח הצבעה על פרס.</p>
      <div class="goals-toggle-group">
        <button class="goals-toggle-btn active" disabled>⏱️ דקות קריאה</button>
        <button class="goals-toggle-btn" disabled title="בקרוב">📄 עמודים</button>
        <button class="goals-toggle-btn" disabled title="בקרוב">📖 מפגשי קריאה</button>
      </div>
      <div class="shop-setup-row">
        <input id="shop-setup-target" type="number" class="input-field" value="300" min="10" step="10" />
        <span>דקות</span>
      </div>
      <button class="btn-giant btn-green" onclick="submitEnableShop('${clubId}')">🎯 הפעילו את החנות</button>
      <p id="shop-setup-error" class="auth-error"></p>
    </div>`;
}

async function submitEnableShop(clubId) {
  const input = document.getElementById('shop-setup-target');
  const errEl = document.getElementById('shop-setup-error');
  const target = Math.round(Number(input?.value) || 0);

  if (errEl) errEl.textContent = '';
  if (target < 10) { if (errEl) errEl.textContent = 'היעד חייב להיות לפחות 10 נקודות'; return; }

  const btn = document.querySelector('.shop-setup-card .btn-green');
  if (btn) { btn.disabled = true; btn.textContent = 'מפעיל...'; }

  const ok = typeof fbEnableShopForClub === 'function' ? await fbEnableShopForClub(clubId, target) : false;
  if (!ok) {
    if (errEl) errEl.textContent = 'שגיאה בהפעלה — נסה/י שוב';
    if (btn) { btn.disabled = false; btn.textContent = '🎯 הפעילו את החנות'; }
    return;
  }
  _renderShopManagement(clubId);
}

function _browsingProgressHtml(cycle, econ) {
  const target   = cycle?.target || 0;
  const progress = Math.max(0, (econ?.lifetimeEarned || 0) - (cycle?.startBaseline || 0));
  const pct      = target ? Math.min(100, Math.round((progress / target) * 100)) : 0;
  return `
    <div class="shop-status-card">
      <h3>🎯 היעד הנוכחי</h3>
      <p class="shop-status-nums">${progress.toLocaleString('he-IL')} <span>מתוך</span> ${target.toLocaleString('he-IL')} דקות</p>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>`;
}

// ─── Classroom Goals (Sprint 9 — Task 1/2/3/5) ────────────────────────────────

function _classroomGoalsCardHtml(clubId, cycle, econ, shopSettings) {
  const target     = cycle?.target || 0;
  const progress   = Math.max(0, (econ?.lifetimeEarned || 0) - (cycle?.startBaseline || 0));
  const openMode      = shopSettings.openMode      || 'manual';
  const afterPurchase = shopSettings.afterPurchase || 'close';
  return `
    <div class="goals-card">
      <h3>🎯 יעדי הכיתה</h3>

      <div class="goals-section">
        <span class="goals-label">סוג יעד</span>
        <div class="goals-toggle-group">
          <button class="goals-toggle-btn active" disabled>⏱️ דקות קריאה</button>
          <button class="goals-toggle-btn" disabled title="בקרוב">📄 עמודים</button>
          <button class="goals-toggle-btn" disabled title="בקרוב">📖 מפגשי קריאה</button>
        </div>
      </div>

      <div class="goals-section">
        <span class="goals-label">יעד נוכחי</span>
        <div class="goals-edit-row">
          <input id="goals-target-input" type="number" class="input-field" value="${target}" min="10" step="10" />
          <span>דקות</span>
          <button type="button" class="btn-small-save" onclick="saveGoalTargetAction('${clubId}','${cycle?.id || ''}')">שמור</button>
        </div>
        <p class="goals-progress-line">${progress.toLocaleString('he-IL')} <span>/</span> ${target.toLocaleString('he-IL')} דקות</p>
        <p id="goals-target-msg" class="goals-target-msg"></p>
      </div>

      <div class="goals-section">
        <span class="goals-label">פתיחת החנות</span>
        <div class="goals-toggle-group">
          <button type="button" class="goals-toggle-btn ${openMode === 'auto' ? 'active' : ''}" onclick="saveShopSettingAction('${clubId}','openMode','auto')">✅ אוטומטית כשמגיעים ליעד</button>
          <button type="button" class="goals-toggle-btn ${openMode === 'manual' ? 'active' : ''}" onclick="saveShopSettingAction('${clubId}','openMode','manual')">🧑‍🏫 המורה פותחת ידנית</button>
        </div>
      </div>

      <div class="goals-section">
        <span class="goals-label">אחרי רכישה</span>
        <div class="goals-toggle-group">
          <button type="button" class="goals-toggle-btn ${afterPurchase === 'close' ? 'active' : ''}" onclick="saveShopSettingAction('${clubId}','afterPurchase','close')">🔒 נסגרת מיד</button>
          <button type="button" class="goals-toggle-btn ${afterPurchase === 'manual' ? 'active' : ''}" onclick="saveShopSettingAction('${clubId}','afterPurchase','manual')">🧑‍🏫 המורה סוגרת ידנית</button>
        </div>
      </div>
    </div>`;
}

async function saveGoalTargetAction(clubId, cycleId) {
  const input = document.getElementById('goals-target-input');
  const msgEl = document.getElementById('goals-target-msg');
  const target = Math.round(Number(input?.value) || 0);
  if (msgEl) msgEl.textContent = '';
  if (!cycleId) { if (msgEl) msgEl.textContent = 'אין מחזור יעד פעיל כרגע.'; return; }
  if (target < 10) { if (msgEl) msgEl.textContent = 'היעד חייב להיות לפחות 10 דקות'; return; }

  const ok = typeof fbUpdateGoalCycleTarget === 'function' ? await fbUpdateGoalCycleTarget(clubId, cycleId, target) : false;
  if (!ok) { if (msgEl) msgEl.textContent = 'שגיאה בשמירה — נסה/י שוב'; return; }
  _renderShopManagement(clubId);
}

async function saveShopSettingAction(clubId, key, value) {
  if (typeof fbSaveClub === 'function') {
    await fbSaveClub(clubId, { shopSettings: { [key]: value } });
  }
  _renderShopManagement(clubId);
}

// ─── Next Goal quick-picks (Sprint 9 — Task 4) — shared between the immediate-purchase
//     flow and the deferred (afterPurchase:'manual') "start next goal" flow ────────────

function _nextGoalPickerHtml(idPrefix, suggestedTarget) {
  const base   = suggestedTarget || 300;
  const plus10 = Math.round((base * 1.1) / 10) * 10;
  return `
    <div class="next-goal-picker" id="${idPrefix}-picker" data-mode="same" data-suggested="${base}" data-plus10="${plus10}">
      <label class="reward-field-label">מה יהיה היעד הבא?</label>
      <div class="next-goal-quick-picks">
        <button type="button" class="quick-pick-btn active" onclick="_selectNextGoalQuickPick('${idPrefix}','same')">🔁 אותו יעד (${base.toLocaleString('he-IL')})</button>
        <button type="button" class="quick-pick-btn" onclick="_selectNextGoalQuickPick('${idPrefix}','plus10')">📈 העלאה ב-10% (${plus10.toLocaleString('he-IL')})</button>
        <button type="button" class="quick-pick-btn" onclick="_selectNextGoalQuickPick('${idPrefix}','custom')">✏️ יעד אחר</button>
      </div>
      <div class="goals-edit-row next-goal-custom-row" style="display:none">
        <input id="${idPrefix}-input" type="number" class="input-field" value="${base}" min="10" step="10" />
        <span>דקות</span>
      </div>
    </div>`;
}

function _selectNextGoalQuickPick(idPrefix, mode) {
  const picker = document.getElementById(idPrefix + '-picker');
  if (!picker) return;
  const buttons = picker.querySelectorAll('.quick-pick-btn');
  buttons.forEach(b => b.classList.remove('active'));
  const idx = mode === 'same' ? 0 : mode === 'plus10' ? 1 : 2;
  if (buttons[idx]) buttons[idx].classList.add('active');
  const customRow = picker.querySelector('.next-goal-custom-row');
  if (customRow) customRow.style.display = mode === 'custom' ? '' : 'none';
  picker.dataset.mode = mode;
}

function _readNextGoalPicker(idPrefix) {
  const picker = document.getElementById(idPrefix + '-picker');
  if (!picker) return null;
  const mode = picker.dataset.mode || 'same';
  if (mode === 'same')   return Number(picker.dataset.suggested);
  if (mode === 'plus10') return Number(picker.dataset.plus10);
  const input = document.getElementById(idPrefix + '-input');
  return Math.round(Number(input?.value) || 0);
}

function _goalReachedTeacherHtml(clubId) {
  return `
    <div class="shop-status-card shop-status-celebrate">
      <div class="shop-status-icon">🎉</div>
      <h3>הכיתה הגיעה ליעד!</h3>
      <p>הגיע הזמן לתת לתלמידים לבחור את הפרס ביחד.</p>
      <button class="btn-giant btn-green" onclick="openVotingAction('${clubId}')">🎁 פתחו הצבעה</button>
      <p id="shop-vote-open-error" class="auth-error"></p>
    </div>`;
}

async function openVotingAction(clubId) {
  const errEl = document.getElementById('shop-vote-open-error');
  const btn = document.querySelector('.shop-status-celebrate .btn-green');
  if (errEl) errEl.textContent = '';
  if (btn) { btn.disabled = true; btn.textContent = 'פותח...'; }

  const voteId = typeof fbOpenShopForVoting === 'function' ? await fbOpenShopForVoting(clubId) : null;
  if (!voteId) {
    if (errEl) errEl.textContent = 'לא ניתן לפתוח הצבעה — ודאו שיש לפחות פרס פעיל אחד בחנות.';
    if (btn) { btn.disabled = false; btn.textContent = '🎁 פתחו הצבעה'; }
    return;
  }
  _renderShopManagement(clubId);
}

async function _votingOpenTeacherHtml(clubId, voteId) {
  const [vote, progress] = await Promise.all([
    typeof fbLoadVote === 'function' ? fbLoadVote(clubId, voteId) : Promise.resolve(null),
    typeof fbLoadVotingProgress === 'function'
      ? fbLoadVotingProgress(clubId, voteId) : Promise.resolve({ votedCount: 0, notVotedCount: 0, totalCount: 0 }),
  ]);
  const roundNote = (vote?.round || 1) > 1
    ? `<p class="shop-status-round">🤝 סיבוב הכרעה — תיקו בסיבוב הקודם</p>` : '';
  return `
    <div class="shop-status-card">
      <div class="shop-status-icon">🗳️</div>
      <h3>ההצבעה פתוחה</h3>
      ${roundNote}
      <p class="shop-status-nums">${progress.votedCount} <span>הצביעו</span> · ${progress.notVotedCount} <span>עוד לא הצביעו</span></p>
      <button class="btn-giant btn-orange" onclick="closeVotingAction('${clubId}','${voteId}')">🔒 סגרו את ההצבעה</button>
      <button type="button" class="shop-refresh-btn" onclick="_renderShopManagement('${clubId}')">🔄 רענון</button>
    </div>`;
}

async function closeVotingAction(clubId, voteId) {
  if (!confirm('לסגור את ההצבעה עכשיו? פעולה זו אינה הפיכה.')) return;
  const btn = document.querySelector('.shop-status-card .btn-orange');
  if (btn) { btn.disabled = true; btn.textContent = 'סוגר...'; }

  const result = typeof fbCloseVoting === 'function' ? await fbCloseVoting(clubId, voteId) : { ok: false };
  if (!result.ok) {
    alert(result.reason === 'no-votes'
      ? 'אף אחד עדיין לא הצביע — חכו שהתלמידים יצביעו לפני שסוגרים.'
      : 'שגיאה בסגירת ההצבעה — נסה/י שוב');
    if (btn) { btn.disabled = false; btn.textContent = '🔒 סגרו את ההצבעה'; }
    return;
  }
  _renderShopManagement(clubId);
}

async function _votingClosedTeacherHtml(clubId, voteId) {
  const vote = typeof fbLoadVote === 'function' ? await fbLoadVote(clubId, voteId) : null;
  const winner = vote?.rewardOptions?.find(o => o.rewardId === vote.winnerRewardId);

  const [shopState, club] = await Promise.all([
    typeof fbLoadShopState === 'function' ? fbLoadShopState(clubId) : Promise.resolve(null),
    typeof fbLoadClub      === 'function' ? fbLoadClub(clubId)      : Promise.resolve(null),
  ]);
  const [econ, oldCycle] = await Promise.all([
    typeof fbLoadEconomy === 'function' ? fbLoadEconomy(clubId) : Promise.resolve(null),
    shopState?.activeCycleId && typeof fbLoadGoalCycle === 'function'
      ? fbLoadGoalCycle(clubId, shopState.activeCycleId) : Promise.resolve(null),
  ]);

  const balance     = econ?.balance || 0;
  const cost        = winner?.cost || 0;
  const remaining   = Math.max(0, balance - cost);
  const insufficient = balance < cost;
  const suggestedTarget = oldCycle?.target || 300;
  // Task 3: במצב afterPurchase:'manual' היעד הבא נבחר מאוחר יותר במסך 'purchase_complete' —
  // הבורר כאן היה מטעה (הערך שלו לא באמת משמש), ולכן לא מוצג כאן במצב הזה.
  const afterPurchase = club?.shopSettings?.afterPurchase || 'close';
  const showPicker = afterPurchase !== 'manual';

  return `
    <div class="shop-status-card shop-status-celebrate">
      <div class="shop-status-icon">🏆</div>
      <h3>נבחר פרס!</h3>
      <div class="shop-winner-chip">${_escHtml(winner?.emoji || '🎁')} ${_escHtml(winner?.name || '')}</div>
      <p class="shop-status-nums">
        יתרה: ${balance.toLocaleString('he-IL')} ·
        עלות: ${cost.toLocaleString('he-IL')} ·
        יישאר: ${remaining.toLocaleString('he-IL')}
      </p>
      ${insufficient ? `<p class="auth-error">אין כרגע מספיק נקודות בארנק הכיתה לרכישת הפרס הזה.</p>` : ''}
      ${showPicker ? _nextGoalPickerHtml('next-goal', suggestedTarget) : `<p class="goals-target-msg">היעד הבא ייבחר אחרי שתסגרו את החנות.</p>`}
      <button class="btn-giant btn-green" ${insufficient ? 'disabled' : ''}
              onclick="confirmPurchaseAction('${clubId}','${voteId}')">🛍️ אשרו רכישה${showPicker ? ' והתחילו יעד חדש' : ''}</button>
      <p id="shop-purchase-error" class="auth-error"></p>
    </div>`;
}

async function confirmPurchaseAction(clubId, voteId) {
  const errEl = document.getElementById('shop-purchase-error');
  const hasPicker = !!document.getElementById('next-goal-picker');
  const target = hasPicker ? _readNextGoalPicker('next-goal') : undefined;

  if (errEl) errEl.textContent = '';
  if (hasPicker && (!target || target < 10)) { if (errEl) errEl.textContent = 'היעד חייב להיות לפחות 10 דקות'; return; }

  const btn = document.querySelector('.shop-status-card .btn-green');
  if (btn) { btn.disabled = true; btn.textContent = 'מבצע רכישה...'; }

  const result = typeof fbConfirmPurchase === 'function' ? await fbConfirmPurchase(clubId, voteId, target) : { ok: false };
  if (!result.ok) {
    if (result.reason === 'already-purchased') {
      // מכשיר/טאב אחר כבר ביצע את הרכישה הזו בדיוק עכשיו — מרעננים להציג את המצב האמיתי
      // במקום להציע לנסות שוב ולהכפיל רכישה.
      _renderShopManagement(clubId);
      return;
    }
    if (errEl) errEl.textContent = 'שגיאה ברכישה — נסה/י שוב';
    if (btn) { btn.disabled = false; btn.textContent = `🛍️ אשרו רכישה${hasPicker ? ' והתחילו יעד חדש' : ''}`; }
    return;
  }
  _renderShopManagement(clubId);
}

/** Task 3 (afterPurchase:'manual'): מסך "הפרס אצלכם" — מחכה שהמורה תבחר מתי לפתוח יעד חדש. */
async function _purchaseCompleteTeacherHtml(clubId, shopState, oldCycle) {
  const purchases = typeof fbLoadPurchases === 'function' ? await fbLoadPurchases(clubId) : [];
  const lastPurchase = purchases.find(p => p.id === shopState.activePurchaseId) || purchases[0] || null;
  const suggestedTarget = oldCycle?.target || 300;

  return `
    <div class="shop-status-card shop-status-celebrate">
      <div class="shop-status-icon">🎁</div>
      <h3>הפרס אצלכם!</h3>
      ${lastPurchase ? `<div class="shop-winner-chip">🏆 ${_escHtml(lastPurchase.rewardTitle || '')}</div>` : ''}
      <p>כשתהיו מוכנים — סגרו את החנות ותתחילו יעד קריאה חדש.</p>
      ${_nextGoalPickerHtml('purchase-next-goal', suggestedTarget)}
      <button class="btn-giant btn-green" onclick="startNextGoalAction('${clubId}')">🔒 סגרו את החנות והתחילו יעד חדש</button>
      <p id="shop-next-goal-error" class="auth-error"></p>
    </div>`;
}

async function startNextGoalAction(clubId) {
  const errEl = document.getElementById('shop-next-goal-error');
  const target = _readNextGoalPicker('purchase-next-goal');
  if (errEl) errEl.textContent = '';
  if (!target || target < 10) { if (errEl) errEl.textContent = 'היעד חייב להיות לפחות 10 דקות'; return; }

  const btn = document.querySelector('.shop-status-card .btn-green');
  if (btn) { btn.disabled = true; btn.textContent = 'פותח יעד חדש...'; }

  const result = typeof fbStartNextGoalCycle === 'function' ? await fbStartNextGoalCycle(clubId, target) : { ok: false };
  if (!result.ok) {
    if (errEl) errEl.textContent = 'שגיאה — נסה/י שוב';
    if (btn) { btn.disabled = false; btn.textContent = '🔒 סגרו את החנות והתחילו יעד חדש'; }
    return;
  }
  _renderShopManagement(clubId);
}

// ─── Reward Grid ──────────────────────────────────────────────────────────────

function _renderRewardGrid(clubId, rewards, statusHtml = '') {
  const container = document.getElementById('shop-teacher-content');
  if (!container) return;

  const emptyBanner = !rewards.length
    ? `<div class="reward-empty-banner">🛍️ החנות שלכם עדיין ריקה — הוסיפו את הפרס הראשון!</div>`
    : '';

  container.innerHTML = statusHtml + emptyBanner +
    `<div class="reward-grid">` +
      rewards.map((r, i) => _rewardCardHtml(clubId, r, i, rewards.length)).join('') +
      `<button class="reward-card reward-card-add" onclick="openRewardEditor('${clubId}', null)">
         <span class="reward-add-icon">➕</span>
         <span class="reward-add-label">הוספת פרס</span>
       </button>` +
    `</div>`;
}

function _rewardCardHtml(clubId, r, index, total) {
  const isActive = r.active !== false;
  const visual = r.imageUrl
    ? `<img src="${_escHtml(r.imageUrl)}" class="reward-card-img" alt=""
         data-fallback-emoji="${_escHtml(r.emoji || '🎁')}" onerror="_rewardImgFallback(this)">`
    : `<span class="reward-card-emoji">${_escHtml(r.emoji || '🎁')}</span>`;

  return `
    <div class="reward-card${isActive ? '' : ' reward-card-inactive'}">
      <button class="reward-active-badge" onclick="toggleRewardActive('${clubId}','${r.id}', ${isActive})">
        ${isActive ? '🟢 פעיל' : '⚪ מוסתר'}
      </button>
      <button class="reward-card-body" onclick="openRewardEditor('${clubId}','${r.id}')">
        <div class="reward-card-visual">${visual}</div>
        <div class="reward-card-name">${_escHtml(r.name)}</div>
        <div class="reward-cost-badge">🪙 ${Number(r.cost || 0).toLocaleString('he-IL')}</div>
      </button>
      <div class="reward-order-controls">
        <button ${index === 0 ? 'disabled' : ''} onclick="moveRewardUp('${clubId}','${r.id}')" title="הזז למעלה">▲</button>
        <button ${index === total - 1 ? 'disabled' : ''} onclick="moveRewardDown('${clubId}','${r.id}')" title="הזז למטה">▼</button>
      </div>
    </div>`;
}

async function toggleRewardActive(clubId, rewardId, currentlyActive) {
  const ok = await fbUpdateReward(clubId, rewardId, { active: !currentlyActive });
  if (ok) _renderShopManagement(clubId);
  else alert('שגיאה — נסה/י שוב');
}

// ─── Reordering (up/down — reliable on touch, no drag library needed) ────────

async function moveRewardUp(clubId, rewardId)   { await _swapRewardOrder(clubId, rewardId, -1); }
async function moveRewardDown(clubId, rewardId) { await _swapRewardOrder(clubId, rewardId, 1); }

async function _swapRewardOrder(clubId, rewardId, dir) {
  const rewards = await fbLoadRewards(clubId);
  const idx     = rewards.findIndex(r => r.id === rewardId);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= rewards.length) return;

  const a = rewards[idx], b = rewards[swapIdx];
  const ok = await fbReorderRewards(clubId, [
    { id: a.id, displayOrder: b.displayOrder },
    { id: b.id, displayOrder: a.displayOrder },
  ]);
  if (ok) _renderShopManagement(clubId);
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────

function openRewardEditor(clubId, rewardId) {
  _rmState = { clubId, rewardId, emoji: '🎁', existing: null };
  document.getElementById('reward-modal')?.remove();

  if (!rewardId) { _buildRewardModal(); return; }

  fbLoadRewards(clubId).then(list => {
    _rmState.existing = list.find(r => r.id === rewardId) || null;
    _rmState.emoji     = _rmState.existing?.emoji || '🎁';
    _buildRewardModal();
  }).catch(() => _buildRewardModal());
}

function _buildRewardModal() {
  const { rewardId, existing, emoji } = _rmState;
  const isNew = !rewardId;

  const overlay = document.createElement('div');
  overlay.id        = 'reward-modal';
  overlay.className = 'av-modal-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeRewardEditor(); });

  overlay.innerHTML = `
    <div class="av-modal-box reward-modal-box" onclick="event.stopPropagation()">
      <button class="av-modal-close" onclick="closeRewardEditor()">✕</button>
      <p class="av-modal-title">${isNew ? '🎁 פרס חדש בחנות' : '✏️ עריכת פרס'}</p>

      <div class="reward-modal-emoji-preview" id="rm-emoji-preview">${_escHtml(emoji)}</div>
      <div class="mini-person-emojis reward-emoji-grid">
        ${REWARD_EMOJIS.map(e =>
          `<button class="mini-emoji-btn${e === emoji ? ' selected' : ''}" onclick="_rmPickEmoji('${e}', this)">${e}</button>`
        ).join('')}
      </div>

      <label class="reward-field-label" for="rm-name">שם הפרס</label>
      <input id="rm-name" class="input-field" maxlength="40"
             placeholder="לדוגמה: 30 דקות משחק חופשי"
             value="${_escHtml(existing?.name || '')}" />

      <label class="reward-field-label" for="rm-desc">תיאור קצר (לא חובה)</label>
      <textarea id="rm-desc" class="input-field textarea-field" maxlength="120"
                placeholder="פרטים נוספים לתלמידים...">${_escHtml(existing?.description || '')}</textarea>

      <label class="reward-field-label">מחיר בנקודות</label>
      <div class="reward-cost-stepper">
        <button type="button" onclick="_rmStepCost(-50)">−</button>
        <input id="rm-cost" type="number" min="1" step="1" class="input-field reward-cost-input"
               value="${existing?.cost ?? 100}" />
        <button type="button" onclick="_rmStepCost(50)">+</button>
      </div>

      <label class="reward-active-row">
        <input id="rm-active" type="checkbox" ${existing?.active === false ? '' : 'checked'} />
        פעיל בחנות (גלוי לתלמידים)
      </label>

      <label class="reward-field-label" for="rm-image">קישור לתמונה (אופציונלי)</label>
      <input id="rm-image" class="input-field" type="url" placeholder="https://..."
             value="${_escHtml(existing?.imageUrl || '')}" />

      <p id="rm-error" class="auth-error"></p>

      <button class="btn-giant btn-green" onclick="saveRewardEditor()">💾 שמירה</button>
      ${!isNew ? `<button class="reward-delete-btn" onclick="deleteRewardEditor()">🗑️ מחיקת הפרס</button>` : ''}
    </div>`;

  document.body.appendChild(overlay);
}

function _rmPickEmoji(emoji, btn) {
  _rmState.emoji = emoji;
  document.querySelectorAll('#reward-modal .mini-emoji-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const preview = document.getElementById('rm-emoji-preview');
  if (preview) preview.textContent = emoji;
}

function _rmStepCost(delta) {
  const input = document.getElementById('rm-cost');
  if (!input) return;
  input.value = Math.max(1, (Number(input.value) || 0) + delta);
}

function closeRewardEditor() {
  document.getElementById('reward-modal')?.remove();
  _rmState = null;
}

async function saveRewardEditor() {
  const { clubId, rewardId, emoji } = _rmState;
  const errEl = document.getElementById('rm-error');
  const name     = (document.getElementById('rm-name')?.value  || '').trim();
  const desc     = (document.getElementById('rm-desc')?.value  || '').trim();
  const cost     = Number(document.getElementById('rm-cost')?.value) || 0;
  const active   = document.getElementById('rm-active')?.checked !== false;
  const imageUrl = (document.getElementById('rm-image')?.value || '').trim();

  if (errEl) errEl.textContent = '';
  if (!name)    { if (errEl) errEl.textContent = 'יש לתת שם לפרס';            return; }
  if (cost < 1) { if (errEl) errEl.textContent = 'המחיר חייב להיות גדול מ-0'; return; }

  const btn = document.querySelector('#reward-modal .btn-green');
  if (btn) { btn.disabled = true; btn.textContent = 'שומר...'; }

  const payload = { name, description: desc, cost, active, emoji, imageUrl: imageUrl || null };

  let ok;
  if (rewardId) {
    ok = await fbUpdateReward(clubId, rewardId, payload);
  } else {
    const rewards = await fbLoadRewards(clubId);
    payload.displayOrder = rewards.length ? Math.max(...rewards.map(r => r.displayOrder ?? 0)) + 1 : 1;
    payload.createdBy    = (typeof getCurrentTeacher === 'function' ? getCurrentTeacher()?.uid : null) || null;
    ok = await fbCreateReward(clubId, payload);
  }

  if (!ok) {
    if (errEl) errEl.textContent = 'שגיאה בשמירה — נסה/י שוב';
    if (btn) { btn.disabled = false; btn.textContent = '💾 שמירה'; }
    return;
  }

  closeRewardEditor();
  _renderShopManagement(clubId);
}

async function deleteRewardEditor() {
  const { clubId, rewardId } = _rmState;
  if (!rewardId) return;
  if (!confirm('למחוק את הפרס הזה לצמיתות?')) return;
  const ok = await fbDeleteReward(clubId, rewardId);
  if (!ok) { alert('שגיאה במחיקה — נסה/י שוב'); return; }
  closeRewardEditor();
  _renderShopManagement(clubId);
}

// ─── Student Shop — Browsing (Milestone 3) ────────────────────────────────────

/**
 * נקודת כניסה לתלמיד — "🎁 חנות הכיתה" במסך הראשי.
 * מאזינה בזמן אמת ל-shop/state כל עוד המסך פתוח, כך שאם המורה פותחת/סוגרת הצבעה
 * או שהיעד מושג בזמן שהתלמיד/ה כבר נמצאים כאן — המסך מתעדכן מיד, בלי לצאת ולהיכנס.
 */
async function showShop() {
  const clubId = window.currentClubId;
  if (!clubId) return;
  if (typeof track === 'function') track('shop_viewed', { clubId });
  showScreen('screen-shop');

  if (_shopViewUnsubscribe) { _shopViewUnsubscribe(); _shopViewUnsubscribe = null; }

  if (typeof fbWatchShopState === 'function') {
    _shopViewUnsubscribe = fbWatchShopState(clubId, () => { _renderStudentShop(clubId); });
  } else {
    await _renderStudentShop(clubId);
  }
}

function _currentReaderUserId() {
  const reader = typeof getActiveReader === 'function' ? getActiveReader() : null;
  return reader?.userId || window.currentStudentData?.id || null;
}

async function _renderStudentShop(clubId) {
  const container = document.getElementById('shop-student-content');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:3rem;font-size:2rem">⏳</div>';

  // הגנתי — תופס מקרה שבו היעד נחצה אבל אף אחד לא היה במסך כשזה קרה
  if (typeof evaluateGoalProgress === 'function') {
    try { await evaluateGoalProgress(clubId); } catch (e) { /* best-effort */ }
  }

  const shopState = typeof fbLoadShopState === 'function' ? await fbLoadShopState(clubId) : null;

  if (shopState?.state === 'voting_open' || shopState?.state === 'voting_closed') {
    await _renderStudentVotingScreen(clubId, shopState);
    return;
  }

  const rewards = typeof fbLoadRewards === 'function' ? await fbLoadRewards(clubId, { activeOnly: true }) : [];
  _renderStudentShopGrid(rewards, shopState);
}

// ─── Student Shop — Voting (Milestone 5) ──────────────────────────────────────

async function _renderStudentVotingScreen(clubId, shopState) {
  const container = document.getElementById('shop-student-content');
  if (!container) return;

  const voteId = shopState.activeVoteId;
  const vote = typeof fbLoadVote === 'function' ? await fbLoadVote(clubId, voteId) : null;
  if (!vote) { container.innerHTML = ''; return; }

  if (vote.status === 'closed') {
    const winner = vote.rewardOptions.find(o => o.rewardId === vote.winnerRewardId);
    container.innerHTML = `
      <div class="shop-booki-moment shop-booki-moment-celebrate">
        <span class="shop-booki-face">🏆</span>
        <p class="shop-booki-bubble">בחרנו!!! 🎉<br>הכיתה בחרה פרס!</p>
      </div>
      <div class="shop-winner-card">
        <div class="shop-winner-emoji">${_escHtml(winner?.emoji || '🎁')}</div>
        <div class="shop-winner-name">${_escHtml(winner?.name || '')}</div>
      </div>`;
    return;
  }

  const userId = _currentReaderUserId();
  const myBallot = userId && typeof fbLoadMyBallot === 'function'
    ? await fbLoadMyBallot(clubId, voteId, userId) : null;

  const isRunoff = (vote.round || 1) > 1;
  const face = isRunoff ? '🤝' : '🗳️';
  const line = isRunoff
    ? 'תיקו! 🤝<br>בואו נכריע ביחד — הצביעו שוב בין השניים האלה!'
    : 'הכיתה הגיעה ליעד! 🎉<br>עכשיו כל אחד/ת בוחר/ת פרס אחד ✨';

  const moment = `
    <div class="shop-booki-moment shop-booki-moment-celebrate">
      <span class="shop-booki-face">${face}</span>
      <p class="shop-booki-bubble">${line}</p>
    </div>`;

  const confirmBanner = myBallot
    ? `<div class="shop-vote-confirmed">✅ ההצבעה שלך נספרה!</div>`
    : '';

  container.innerHTML = moment + confirmBanner +
    `<p id="vote-cast-error" class="auth-error"></p>` +
    `<div class="reward-shelf">` +
      vote.rewardOptions.map(o => _voteRewardCardHtml(clubId, voteId, o, myBallot)).join('') +
    `</div>`;
}

function _voteRewardCardHtml(clubId, voteId, o, myBallot) {
  const isMine = myBallot && myBallot.rewardId === o.rewardId;
  const visual = o.imageUrl
    ? `<img src="${_escHtml(o.imageUrl)}" class="reward-card-img" alt=""
         data-fallback-emoji="${_escHtml(o.emoji || '🎁')}" onerror="_rewardImgFallback(this)">`
    : `<span class="reward-card-emoji">${_escHtml(o.emoji || '🎁')}</span>`;

  const action = myBallot
    ? (isMine ? `<div class="reward-vote-mine">✓ הצבעת/י כאן</div>` : '')
    : `<button class="reward-vote-btn" onclick="castVoteAction('${clubId}','${voteId}','${o.rewardId}')">🗳️ מצביע/ה לפרס הזה</button>`;

  return `
    <div class="reward-card reward-card-browse${isMine ? ' reward-card-voted' : ''}">
      <div class="reward-card-visual">${visual}</div>
      <div class="reward-card-name">${_escHtml(o.name)}</div>
      ${o.description ? `<p class="reward-card-desc">${_escHtml(o.description)}</p>` : ''}
      <div class="reward-cost-badge">🪙 ${Number(o.cost || 0).toLocaleString('he-IL')}</div>
      ${action}
    </div>`;
}

async function castVoteAction(clubId, voteId, rewardId) {
  const userId = _currentReaderUserId();
  if (!userId) return;

  document.querySelectorAll('.reward-vote-btn').forEach(b => { b.disabled = true; b.textContent = '...'; });

  const result = typeof fbCastVote === 'function'
    ? await fbCastVote(clubId, voteId, userId, rewardId)
    : { ok: false, reason: 'error' };

  if (!result.ok) {
    // לא מסתירים כישלון — התלמיד/ה חייבים לדעת שההצבעה לא נשמרה בפועל, לא רק לראות
    // את אותו מסך שוב כאילו הכל תקין.
    document.querySelectorAll('.reward-vote-btn').forEach(b => {
      b.disabled = false; b.textContent = '🗳️ מצביע/ה לפרס הזה';
    });
    const errEl = document.getElementById('vote-cast-error');
    if (errEl) errEl.textContent = 'לא הצלחנו לשמור את ההצבעה שלך — נסה/י שוב.';
    return;
  }

  await _renderStudentShop(clubId);
}

function _renderStudentShopGrid(rewards, shopState) {
  const container = document.getElementById('shop-student-content');
  if (!container) return;

  const goalReached = shopState?.state === 'GOAL_REACHED_PENDING_SHOP';

  // בוקי מספר סיפור קטן — 2-3 שורות קצרות שיוצרות ציפייה, לא הסבר של המנגנון.
  // תמיד בלשון זכר (הוא בן). לעולם לא "עוד לא הגעתם ליעד" — תמיד "עוד קצת ואני...".
  let face, line;
  if (goalReached) {
    face = '🏆';
    line = 'הצלחנו!!! 🎉<br>הגענו ליעד ביחד!<br>עוד ממש מעט אני פותח לכם הצבעה על הפרס!';
  } else if (rewards.length) {
    face = '🤩';
    line = 'החנות כבר מחכה לכם!<br>בוקי מילא את המדפים במתנות מיוחדות ✨<br>עוד קצת קריאה... ואני אפתח לכם אותה!';
  } else {
    face = '👀';
    line = 'ששש...<br>אני עדיין מכין לכם הפתעה 🎁';
  }

  const moment = `
    <div class="shop-booki-moment${goalReached ? ' shop-booki-moment-celebrate' : ''}">
      <span class="shop-booki-face">${face}</span>
      <p class="shop-booki-bubble">${line}</p>
    </div>`;

  const cozyCorner = `<div class="shop-cozy-corner">📚 🕯️ 📖 🕯️ 📚</div>`;

  if (!rewards.length) {
    container.innerHTML = moment + cozyCorner;
    return;
  }

  container.innerHTML = moment +
    `<div class="reward-shelf">` +
      rewards.map(r => _studentRewardCardHtml(r)).join('') +
    `</div>` +
    cozyCorner;
}

function _studentRewardCardHtml(r) {
  const visual = r.imageUrl
    ? `<img src="${_escHtml(r.imageUrl)}" class="reward-card-img" alt=""
         data-fallback-emoji="${_escHtml(r.emoji || '🎁')}" onerror="_rewardImgFallback(this)">`
    : `<span class="reward-card-emoji">${_escHtml(r.emoji || '🎁')}</span>`;

  return `
    <div class="reward-card reward-card-browse">
      <div class="reward-card-visual">${visual}</div>
      <div class="reward-card-name">${_escHtml(r.name)}</div>
      ${r.description ? `<p class="reward-card-desc">${_escHtml(r.description)}</p>` : ''}
      <div class="reward-cost-badge">🪙 ${Number(r.cost || 0).toLocaleString('he-IL')}</div>
    </div>`;
}

// ─── חשיפה גלובלית ───────────────────────────────────────────────────────────

Object.assign(window, {
  showShop,
  showShopManagement,
  openRewardEditor, closeRewardEditor, saveRewardEditor, deleteRewardEditor,
  toggleRewardActive, moveRewardUp, moveRewardDown,
  _rmPickEmoji, _rmStepCost,
  submitEnableShop,
  openVotingAction, closeVotingAction, castVoteAction,
  confirmPurchaseAction,
  saveGoalTargetAction, saveShopSettingAction, _selectNextGoalQuickPick, startNextGoalAction,
  _rewardImgFallback,
});
