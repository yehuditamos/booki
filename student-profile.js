/**
 * student-profile.js — Student Personalization Wizard + "For You" Recommendations
 *
 * זרימה:
 *   _enterPersonalHome → profile.onboardingComplete && !personalizationComplete
 *   → showProfileWizard() → step 1 (avatar) → step 2 (questions)
 *   → _wizardSubmit() → save → completion screen → button → _enterPersonalHome
 *
 * המלצות:
 *   showLibrary() → renderForYouSection() → buildRecommendations()
 */

// ─── Avatar Catalog (14 categories, auto-deduped) ──────────────────────────

const _RAW_AVATAR_CATALOG = [
  { category: '🐾 חיות', emojis: [
    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
    '🦁','🐮','🐷','🐸','🐵','🦒','🐘','🐺','🦔','🦩',
    '🦓','🐆','🦃','🦜','🐿️','🦌','🐈','🐇','🐍','🦥',
    '🦙','🐓','🦢','🦚','🦬','🦘','🐪','🐄','🐕',
  ]},
  { category: '🦕 דינוזאורים', emojis: [
    '🦕','🦖','🐊','🦎','🦣',
  ]},
  { category: '🤖 רובוטים וטכנולוגיה', emojis: [
    '🤖','🕹️','💻','🎮','⚙️','📡','🖥️','🔬','⌨️','📲',
  ]},
  { category: '🧙 קסמים', emojis: [
    '🧙','🪄','🧚','🧜','🧝','🧞','🔮','🎩','💎','🌠',
    '🧿','🎆','🎇',
  ]},
  { category: '🚀 חלל', emojis: [
    '🚀','🛸','🪐','⭐','🌟','💫','☄️','👨‍🚀','🌌','🛰️',
    '🌍','🌕','🔭','🌙',
  ]},
  { category: '🏎️ כלי רכב', emojis: [
    '🏎️','🚂','✈️','🚁','⛵','🛻','🚒','🚑','🚌','🏍️',
    '🚤','🛳️','🛶','🚓','🚐','🛺','🚲','🛴',
  ]},
  { category: '🦸 גיבורים', emojis: [
    '🦸','🦹','👮','🧑‍🚒','🏋️','🤺','🥷','🏆','🎯','🧑‍✈️',
  ]},
  { category: '🍕 אוכל מצחיק', emojis: [
    '🍕','🍔','🌮','🍦','🍭','🍩','🍪','🧁','🍓','🍉',
    '🍣','🌭','🥪','🍿','🎂','🧇','🍜','🍑','🥝',
    '🍰','🧃','🍫','🍬','🥞','🍡',
  ]},
  { category: '🐠 יצורי ים', emojis: [
    '🐙','🦑','🐠','🐟','🦈','🐬','🐳','🦀','🦞','🐡',
    '🦭','🦦','🐚','🦐','🐋','🌊',
  ]},
  { category: '👾 מפלצות חמודות', emojis: [
    '👾','👻','🎃','🧟','👹','👺','🤡','👽','🧌','🎭',
    '😈','🫠',
  ]},
  { category: '🌈 פנטזיה', emojis: [
    '🦄','🌈','🏰','🎠','✨','🪩','🎪','🎡','🎢','🪅',
    '🎨','🎑',
  ]},
  { category: '⭐ שמיים וכוכבים', emojis: [
    '🌠','💥','☀️','🌛','🌤️','❄️','⚡','🌪️',
    '🌅','🌄','🎆','🌈',
  ]},
  { category: '🦋 טבע', emojis: [
    '🌲','🌴','🌵','🏔️','🌻','🍄','🐝','🌺','🌸','🍀',
    '🌿','🌾','🌹','🌷','🦋','🐛','🐞','🌱','🏕️','🌏',
  ]},
  { category: '🐉 דרקונים ואגדות', emojis: [
    '🐉','🐲','🔥','💨','🧊','🪬','⚔️','🛡️','👑','🏹',
  ]},
];

// Deduplicate: first category wins for any emoji that appears more than once
const _seen = new Set();
const AVATAR_CATALOG = _RAW_AVATAR_CATALOG.map(cat => ({
  ...cat,
  emojis: cat.emojis.filter(e => _seen.has(e) ? false : (_seen.add(e), true)),
}));

const PROFILE_AVATARS = AVATAR_CATALOG.flatMap(c => c.emojis);
const _AVATAR_INDEX   = new Map(PROFILE_AVATARS.map((e, i) => [e, i]));

// ─── Topics → Story Tags ──────────────────────────────────────────────────────

const TOPIC_TAG_MAP = {
  funny:      ['מצחיק', 'הומור', 'צחוק'],
  adventure:  ['הרפתקאה', 'גבורה', 'עוז'],
  animals:    ['חיות', 'טבע'],
  magic:      ['קסם', 'פנטזיה', 'קסמים'],
  space:      ['חלל', 'כוכבים'],
  science:    ['מדע', 'סקרנות', 'גילוי'],
  dinosaurs:  ['דינוזאורים'],
  sports:     ['ספורט', 'מרוץ', 'תחרות'],
  friendship: ['חברות', 'חברים', 'שיתוף'],
  family:     ['משפחה', 'בית', 'חגים'],
  comics:     ['קומיקס', 'הומור', 'מצחיק'],
};

// ─── Character Type → Story Tags ─────────────────────────────────────────────

const CHARACTER_TAG_MAP = {
  animals:     ['חיות', 'טבע'],
  robots:      ['טכנולוגיה', 'מדע', 'עתיד'],
  kids:        ['ילדים', 'חברות', 'משפחה'],
  princesses:  ['נסיכות', 'קסם', 'מלכות'],
  superheroes: ['גבורה', 'עוז', 'הרפתקאה'],
  dinosaurs:   ['דינוזאורים'],
  dragons:     ['דרקון', 'פנטזיה', 'קסם'],
  astronauts:  ['חלל', 'הרפתקאה'],
  wizards:     ['קסם', 'פנטזיה', 'כישוף'],
  monsters:    ['מפלצות', 'מצחיק', 'הומור'],
};

// ─── Wizard State ─────────────────────────────────────────────────────────────

let _wizardUserId       = null;
let _wizardClubId       = null;
let _wizardExisting     = {};
let _wizardAnswers      = {};
let _wizardTakenAvatars = new Set();
let _wizardFinalProfile = null;

// ─── Entry Point ─────────────────────────────────────────────────────────────

async function showProfileWizard(userId, clubId, existingProfile) {
  _wizardUserId       = userId;
  _wizardClubId       = clubId;
  _wizardExisting     = existingProfile || {};
  _wizardAnswers      = { favoriteTopics: [] };
  _wizardTakenAvatars = new Set();
  _wizardFinalProfile = null;

  if (typeof setNavVisible === 'function') setNavVisible(false);
  if (typeof showScreen   === 'function') showScreen('screen-profile-wizard');

  if (clubId && typeof fbGetClubAvatars === 'function') {
    const taken = await fbGetClubAvatars(clubId, userId);
    _wizardTakenAvatars = new Set(taken);
  }

  _renderStep1();
}

// ─── Step 1: Avatar ───────────────────────────────────────────────────────────

function _renderStep1() {
  const container = document.getElementById('wizard-content');
  if (!container) return;

  const titleEl    = document.getElementById('wizard-screen-title');
  const subtitleEl = document.getElementById('wizard-screen-subtitle');
  if (titleEl)    titleEl.textContent    = '👋 קצת עלייך';
  if (subtitleEl) subtitleEl.textContent = 'בחר/י דמות שתייצג אותך במועדון';

  container.innerHTML = `
    <div class="wizard-step">
      <div class="avatar-sections" id="avatar-grid"></div>
      <p id="avatar-taken-msg" class="avatar-taken-msg" style="display:none">
        הדמות הזו כבר תפוסה במועדון — בחר/י אחרת
      </p>
      <div class="wizard-actions">
        <button id="btn-wizard-next" class="btn-giant btn-green wizard-btn"
                onclick="_wizardStep1Next()" disabled>
          המשך ←
        </button>
      </div>
    </div>`;

  _renderAvatarGrid();
}

function _renderAvatarGrid() {
  const container = document.getElementById('avatar-grid');
  if (!container) return;

  container.innerHTML = AVATAR_CATALOG.map(cat => {
    const buttons = cat.emojis.map(emoji => {
      const idx   = _AVATAR_INDEX.get(emoji);
      const taken = _wizardTakenAvatars.has(emoji);
      if (idx === undefined) return '';
      return `<button class="avatar-opt${taken ? ' avatar-taken' : ''}"
                      data-idx="${idx}"
                      onclick="_selectAvatar(${idx})"
                      ${taken ? 'disabled title="תפוס"' : ''}>${emoji}</button>`;
    }).join('');

    return `<div class="avatar-section">
      <div class="avatar-cat-label">${cat.category}</div>
      <div class="avatar-grid">${buttons}</div>
    </div>`;
  }).join('');
}

function _selectAvatar(idx) {
  const emoji    = PROFILE_AVATARS[idx];
  const takenMsg = document.getElementById('avatar-taken-msg');
  const nextBtn  = document.getElementById('btn-wizard-next');

  if (_wizardTakenAvatars.has(emoji)) {
    if (takenMsg) takenMsg.style.display = '';
    return;
  }
  if (takenMsg) takenMsg.style.display = 'none';

  document.querySelectorAll('.avatar-opt.selected').forEach(b => b.classList.remove('selected'));
  const btn = document.querySelector(`.avatar-opt[data-idx="${idx}"]`);
  if (btn) btn.classList.add('selected');

  _wizardAnswers.avatar = emoji;
  if (nextBtn) nextBtn.disabled = false;
}

function _wizardStep1Next() {
  if (!_wizardAnswers.avatar) return;
  _renderStep2();
}

// ─── Step 2: Questions ────────────────────────────────────────────────────────

function _renderStep2() {
  const container = document.getElementById('wizard-content');
  if (!container) return;

  const subtitleEl = document.getElementById('wizard-screen-subtitle');
  if (subtitleEl) subtitleEl.textContent = 'כך נוכל להמליץ לך סיפורים מושלמים';

  container.innerHTML = `
    <div class="wizard-step wizard-step-q">

      <div class="wizard-q">
        <div class="wizard-q-label">באיזו כיתה אני?</div>
        <div class="wizard-opts-row">
          ${['א','ב','ג'].map(g =>
            `<button class="wizard-opt" data-group="grade" data-val="${g}"
                     onclick="_pickOpt(this,'grade')">${g}'</button>`
          ).join('')}
        </div>
      </div>

      <div class="wizard-q">
        <div class="wizard-q-label">איך אני מרגיש/ה עם קריאה?</div>
        <div class="wizard-opts-col">
          ${[
            {v:'easy',     l:'😊 אני קורא/ת בקלות'},
            {v:'ok',       l:'🙂 אני מסתדר/ת'},
            {v:'hard',     l:'😅 לפעמים קשה לי'},
            {v:'beginner', l:'❤️ אני רק מתחיל/ה'},
          ].map(o =>
            `<button class="wizard-opt" data-group="readingLevel" data-val="${o.v}"
                     onclick="_pickOpt(this,'readingLevel')">${o.l}</button>`
          ).join('')}
        </div>
      </div>

      <div class="wizard-q">
        <div class="wizard-q-label">מה אני הכי אוהב לקרוא? <span class="wizard-multi-hint">(אפשר כמה)</span></div>
        <div class="wizard-opts-wrap">
          ${[
            {v:'funny',      l:'😂 מצחיק'},
            {v:'adventure',  l:'⚔️ הרפתקאות'},
            {v:'animals',    l:'🐾 חיות'},
            {v:'magic',      l:'🪄 קסמים'},
            {v:'space',      l:'🚀 חלל'},
            {v:'science',    l:'🔬 מדע'},
            {v:'dinosaurs',  l:'🦕 דינוזאורים'},
            {v:'sports',     l:'⚽ ספורט'},
            {v:'friendship', l:'🤝 חברות'},
            {v:'family',     l:'🏠 משפחה'},
            {v:'comics',     l:'💬 קומיקס'},
          ].map(o =>
            `<button class="wizard-opt wizard-opt-multi" data-val="${o.v}"
                     onclick="_toggleTopic(this)">${o.l}</button>`
          ).join('')}
        </div>
      </div>

      <div class="wizard-q">
        <div class="wizard-q-label">איזה סוג דמות אני הכי אוהב?</div>
        <div class="wizard-opts-wrap">
          ${[
            {v:'animals',     l:'🐶 חיות'},
            {v:'robots',      l:'🤖 רובוטים'},
            {v:'kids',        l:'🧒 ילדים'},
            {v:'princesses',  l:'👸 נסיכות'},
            {v:'superheroes', l:'🦸 גיבורי על'},
            {v:'dinosaurs',   l:'🦖 דינוזאורים'},
            {v:'dragons',     l:'🐉 דרקונים'},
            {v:'astronauts',  l:'🚀 אסטרונאוטים'},
            {v:'wizards',     l:'🧙 קוסמים'},
            {v:'monsters',    l:'👾 מפלצות מצחיקות'},
          ].map(o =>
            `<button class="wizard-opt wizard-opt-multi" data-group="favoriteCharacterType" data-val="${o.v}"
                     onclick="_pickOpt(this,'favoriteCharacterType')">${o.l}</button>`
          ).join('')}
        </div>
      </div>

      <div class="wizard-q">
        <div class="wizard-q-label">כמה זמן אני אוהב לקרוא?</div>
        <div class="wizard-opts-row">
          ${[
            {v:5,  l:"5 דק'"},
            {v:10, l:"10 דק'"},
            {v:15, l:"15 דק'"},
            {v:20, l:"20+ דק'"},
          ].map(o =>
            `<button class="wizard-opt" data-group="preferredReadingTime" data-val="${o.v}"
                     onclick="_pickOpt(this,'preferredReadingTime')">${o.l}</button>`
          ).join('')}
        </div>
      </div>

      <div class="wizard-q">
        <div class="wizard-q-label">מה המטרה שלי?</div>
        <div class="wizard-opts-col">
          ${[
            {v:'daily',   l:'📅 לקרוא כל יום'},
            {v:'improve', l:'📈 להשתפר בקריאה'},
            {v:'long',    l:'📚 לקרוא ספרים ארוכים'},
            {v:'stars',   l:'⭐ לצבור כוכבים'},
            {v:'compete', l:'🏆 לנצח בטבלת המובילים'},
          ].map(o =>
            `<button class="wizard-opt" data-group="goal" data-val="${o.v}"
                     onclick="_pickOpt(this,'goal')">${o.l}</button>`
          ).join('')}
        </div>
      </div>

      <p id="wizard-error" class="auth-error"></p>
      <div class="wizard-actions">
        <button class="btn-giant btn-green wizard-btn" onclick="_wizardSubmit()">סיום ✓</button>
      </div>
    </div>`;

  _wizardAnswers.favoriteTopics = [];
}

function _pickOpt(btn, group) {
  document.querySelectorAll(`.wizard-opt[data-group="${group}"]`)
    .forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const val = btn.dataset.val;
  _wizardAnswers[group] = isNaN(Number(val)) ? val : Number(val);
}

function _toggleTopic(btn) {
  btn.classList.toggle('selected');
  if (!Array.isArray(_wizardAnswers.favoriteTopics)) _wizardAnswers.favoriteTopics = [];
  const val = btn.dataset.val;
  if (btn.classList.contains('selected')) {
    if (!_wizardAnswers.favoriteTopics.includes(val)) _wizardAnswers.favoriteTopics.push(val);
  } else {
    _wizardAnswers.favoriteTopics = _wizardAnswers.favoriteTopics.filter(t => t !== val);
  }
}

async function _wizardSubmit() {
  const errEl = document.getElementById('wizard-error');
  if (errEl) errEl.textContent = '';

  if (!_wizardAnswers.grade) {
    if (errEl) errEl.textContent = 'יש לבחור כיתה'; return;
  }
  if (!_wizardAnswers.readingLevel) {
    if (errEl) errEl.textContent = 'יש לבחור רמת קריאה'; return;
  }
  if (!(Number(_wizardAnswers.preferredReadingTime) > 0)) {
    if (errEl) errEl.textContent = "יש לבחור זמן קריאה"; return;
  }
  if (!_wizardAnswers.goal) {
    if (errEl) errEl.textContent = 'יש לבחור מטרה'; return;
  }
  if (!_wizardAnswers.favoriteTopics?.length) {
    if (errEl) errEl.textContent = 'יש לבחור לפחות תחום עניין אחד'; return;
  }

  const submitBtn = document.querySelector('#wizard-content .wizard-btn:last-child');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'שומר...'; }

  const now = new Date().toISOString();
  const profileData = {
    avatar:                   _wizardAnswers.avatar,
    grade:                    _wizardAnswers.grade,
    readingLevel:             _wizardAnswers.readingLevel,
    favoriteTopics:           _wizardAnswers.favoriteTopics,
    favoriteCharacterType:    _wizardAnswers.favoriteCharacterType || null,
    preferredReadingTime:     Number(_wizardAnswers.preferredReadingTime),
    goal:                     _wizardAnswers.goal,
    personalizationComplete:  true,
    updatedAt:                now,
  };
  if (!_wizardExisting?.createdAt) profileData.createdAt = now;

  try {
    if (typeof fbSaveUserProfile === 'function') {
      await fbSaveUserProfile(_wizardUserId, profileData);
    }
    if (_wizardClubId && typeof fbUpdateMemberAvatar === 'function') {
      await fbUpdateMemberAvatar(_wizardClubId, _wizardUserId, _wizardAnswers.avatar);
    }
  } catch (e) {
    if (errEl) errEl.textContent = 'שגיאה בשמירה: ' + e.message;
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'סיום ✓'; }
    return;
  }

  _wizardFinalProfile = {
    ..._wizardExisting,
    ...profileData,
    emoji: _wizardAnswers.avatar,
  };
  window._studentPersonalization = _wizardFinalProfile;

  _showWizardComplete();
}

// ─── Completion Screen ────────────────────────────────────────────────────────

function _showWizardComplete() {
  const container = document.getElementById('wizard-content');
  if (!container) return;

  const titleEl    = document.getElementById('wizard-screen-title');
  const subtitleEl = document.getElementById('wizard-screen-subtitle');
  if (titleEl)    titleEl.textContent    = '';
  if (subtitleEl) subtitleEl.textContent = '';

  const avatar = _wizardAnswers.avatar || '⭐';

  container.innerHTML = `
    <div class="wizard-complete">
      <div class="wizard-complete-avatar">${avatar}</div>
      <h2 class="wizard-complete-title">🎉 איזה כיף להכיר אותך!</h2>
      <p class="wizard-complete-text">
        הכנתי במיוחד בשבילך סיפורים שמתאימים בדיוק לך.<br>
        מוכן/ה לקרוא?
      </p>
      <button class="btn-giant btn-green wizard-btn" onclick="_enterPersonalHomeFromWizard()">
        ✨ לסיפורים שלי
      </button>
    </div>`;
}

function _enterPersonalHomeFromWizard() {
  if (typeof _enterPersonalHome === 'function' && _wizardFinalProfile) {
    _enterPersonalHome(_wizardUserId, _wizardFinalProfile);
  }
}

// ─── Recommendation Engine ────────────────────────────────────────────────────

/**
 * מחזיר עד maxResults סיפורים מותאמים אישית לפרופיל.
 * פונקציה טהורה — ללא קריאות Firestore.
 *
 * ציון:
 *   +3 לכל התאמת תג לנושא מועדף
 *   +2 לכל התאמת תג לסוג דמות מועדף
 *   +2 אם זמן הקריאה קרוב תוך 2 דקות, +1 תוך 5 דקות
 */
function buildRecommendations(profile, allStories, readIds, maxResults = 6) {
  if (!profile?.personalizationComplete || !Array.isArray(allStories)) return [];

  const topicTags = new Set(
    (profile.favoriteTopics || []).flatMap(t => TOPIC_TAG_MAP[t] || [])
  );
  const charTags = new Set(
    CHARACTER_TAG_MAP[profile.favoriteCharacterType] || []
  );
  const targetMins = profile.preferredReadingTime || 10;

  return allStories
    .filter(s => !readIds.has(s.id) && !readIds.has(s.legacyId))
    .map(s => {
      const storyMins = (s.pages || []).reduce((sum, p) => sum + (p.readingMinutes || 0.5), 0);
      const storyTags = new Set(s.tags || []);

      let score = 0;
      for (const tag of topicTags) { if (storyTags.has(tag)) score += 3; }
      for (const tag of charTags)  { if (storyTags.has(tag)) score += 2; }
      const timeDiff = Math.abs(storyMins - targetMins);
      if (timeDiff <= 2)      score += 2;
      else if (timeDiff <= 5) score += 1;

      return { ...s, _score: score, _mins: Math.ceil(storyMins) };
    })
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, maxResults);
}

/** מרנדר את section "במיוחד בשבילך" בראש הספרייה. */
function renderForYouSection() {
  const section = document.getElementById('for-you-section');
  const listEl  = document.getElementById('for-you-list');
  if (!section || !listEl) return;

  const profile = window._studentPersonalization;
  if (!profile?.personalizationComplete) {
    section.style.display = 'none';
    return;
  }

  const studentData = window.currentStudentData;
  const histArr     = Array.isArray(studentData?.history) ? studentData.history : [];
  const readIds     = new Set(
    histArr.filter(h => h?.type === 'app').flatMap(h => [h.storyId, h.legacyId]).filter(Boolean)
  );

  const allStories  = typeof getAllStories === 'function' ? getAllStories() : [];
  const recommended = buildRecommendations(profile, allStories, readIds);

  if (!recommended.length) {
    section.style.display = 'none';
    return;
  }

  listEl.innerHTML = recommended.map(s =>
    `<button class="story-card for-you-card" onclick="startStory('${s.id}')">
      <div class="story-card-left">
        <span class="story-emoji">${s.emoji || '📖'}</span>
        <div class="story-info">
          <span class="story-title">${s.title || ''}</span>
          <span class="story-meta">${s.category || ''} · ${s._mins} דק'</span>
        </div>
      </div>
      <span class="new-badge">קרא →</span>
    </button>`
  ).join('');

  section.style.display = '';
}

// ─── חשיפה גלובלית ───────────────────────────────────────────────────────────

window.showProfileWizard           = showProfileWizard;
window._selectAvatar               = _selectAvatar;
window._wizardStep1Next            = _wizardStep1Next;
window._pickOpt                    = _pickOpt;
window._toggleTopic                = _toggleTopic;
window._wizardSubmit               = _wizardSubmit;
window._enterPersonalHomeFromWizard = _enterPersonalHomeFromWizard;
window.buildRecommendations        = buildRecommendations;
window.renderForYouSection         = renderForYouSection;
