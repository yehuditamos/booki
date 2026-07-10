/**
 * student-profile.js — Student Personalization Wizard v3
 *
 * זרימה: showProfileWizard → 8 מסכים (שאלה אחת כל אחד) → מסך כרטיס קורא → ספרייה
 * המלצות: showLibrary → renderForYouSection → buildRecommendations
 */

// ─── Avatar Catalog ───────────────────────────────────────────────────────────

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

const _seen = new Set();
const AVATAR_CATALOG = _RAW_AVATAR_CATALOG.map(cat => ({
  ...cat,
  emojis: cat.emojis.filter(e => _seen.has(e) ? false : (_seen.add(e), true)),
}));
const PROFILE_AVATARS = AVATAR_CATALOG.flatMap(c => c.emojis);
const _AVATAR_INDEX   = new Map(PROFILE_AVATARS.map((e, i) => [e, i]));

// ─── Topic & Character Type Maps ──────────────────────────────────────────────

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

// ─── Step Definitions ─────────────────────────────────────────────────────────

const WIZARD_STEPS = [
  { id: 'name',       color: '#F39C12', icon: '👋', title: 'שלום!',          sub: 'מה שמך?',                            next: '🚀 בוא נתחיל!'  },
  { id: 'avatar',     color: '#9B59B6', icon: '🎨', title: 'הדמות שלי',     sub: '🎨 איזו דמות אני רוצה שתופיע ליד השם שלי?', next: 'בחרתי! ✨'    },
  { id: 'niqqudPref', color: '#27AE60', icon: '📖', title: 'איך אני קורא',   sub: 'איך אתה/את קורא/ת בדרך כלל?',        next: 'ממשיכים! 📖'  },
  { id: 'loveSlider', color: '#E74C3C', icon: '❤️', title: 'אוהב/ת ספרים?', sub: 'כמה אתה/את אוהב/ת לקרוא?',           next: 'ממשיכים! ❤️'  },
  { id: 'goal',       color: '#8E44AD', icon: '🎯', title: 'המטרה שלי',     sub: 'מה המטרה שלך?',                       next: 'סיימתי! 🎉'   },
];

// ─── Wizard State ─────────────────────────────────────────────────────────────

let _wizardUserId         = null;
let _wizardClubId         = null;
let _wizardExisting       = {};
let _wizardAnswers        = {};
let _wizardTakenAvatars   = new Set();
let _wizardFinalProfile   = null;
let _wizardStepIndex      = 0;
let _wizardAvatarCatIndex = -1; // -1 = show categories, ≥0 = show grid for that cat

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function showProfileWizard(userId, clubId, existingProfile) {
  _wizardUserId       = userId;
  _wizardClubId       = clubId;
  _wizardExisting     = existingProfile || {};
  _wizardAnswers      = {
    name:           existingProfile?.name || '',
    favoriteTopics: [],
  };
  _wizardTakenAvatars   = new Set();
  _wizardFinalProfile   = null;
  _wizardStepIndex      = 0;
  _wizardAvatarCatIndex = -1;

  if (typeof setNavVisible === 'function') setNavVisible(false);
  if (typeof showScreen   === 'function') showScreen('screen-profile-wizard');

  // צייר שלב 1 מיד — לא מחכים ל-Firebase
  _renderWizardStep(false);

  // טוען אווטארים תפוסים ברקע — נדרש רק לשלב 2
  if (clubId && typeof fbGetClubAvatars === 'function') {
    fbGetClubAvatars(clubId, userId)
      .then(taken => { _wizardTakenAvatars = new Set(taken); })
      .catch(() => {});
  }
}

// ─── Progress ─────────────────────────────────────────────────────────────────

function _updateProgress() {
  const total   = WIZARD_STEPS.length;
  const current = _wizardStepIndex + 1;
  const pct     = Math.round((current / total) * 100);
  const fill    = document.getElementById('wizard-progress-fill');
  const label   = document.getElementById('wizard-progress-label');
  if (fill)  fill.style.width  = pct + '%';
  if (label) label.textContent = `${current} מתוך ${total}`;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function _wizardNext() {
  const step  = WIZARD_STEPS[_wizardStepIndex];
  const errEl = document.getElementById('wiz-error');
  if (errEl) errEl.textContent = '';

  if (!_isStepValid(step.id)) {
    if (errEl) errEl.textContent = _stepErrMsg(step.id);
    return;
  }

  if (_wizardStepIndex < WIZARD_STEPS.length - 1) {
    _wizardStepIndex++;
    _renderWizardStep(false);
  } else {
    _wizardSubmit();
  }
}

function _wizardBack() {
  // Avatar sub-navigation: from emoji grid → back to category list
  if (WIZARD_STEPS[_wizardStepIndex]?.id === 'avatar' && _wizardAvatarCatIndex >= 0) {
    _wizardAvatarCatIndex = -1;
    const bodyEl = document.getElementById('wiz-step-body');
    if (bodyEl) bodyEl.innerHTML = _bodyAvatar();
    return;
  }
  if (_wizardStepIndex > 0) {
    _wizardStepIndex--;
    _renderWizardStep(true);
  }
}

function _wizardExit() {
  if (_wizardClubId && typeof showWhoReads === 'function') {
    showWhoReads(_wizardClubId);
  } else if (typeof goHome === 'function') {
    goHome();
  } else {
    showScreen('screen-splash');
  }
}

function _isStepValid(id) {
  switch (id) {
    case 'name':       return (_wizardAnswers.name || '').trim().length > 0;
    case 'avatar':     return !!_wizardAnswers.avatar;
    case 'niqqudPref': return !!_wizardAnswers.niqqudPref;
    case 'loveSlider': return true;
    case 'goal':       return !!_wizardAnswers.goal;
    default: return true;
  }
}

function _stepErrMsg(id) {
  return ({
    name:       'כתוב/י את שמך כדי להמשיך',
    avatar:     'בחר/י דמות כדי להמשיך',
    niqqudPref: 'בחר/י איך אתה/את קורא/ת',
    loveSlider: '',
    goal:       'בחר/י מטרה',
  })[id] || '';
}

// ─── Step Renderer ────────────────────────────────────────────────────────────

function _renderWizardStep(goingBack) {
  _updateProgress();
  const container = document.getElementById('wizard-content');
  if (!container) return;

  const step      = WIZARD_STEPS[_wizardStepIndex];
  const backFn    = _wizardStepIndex === 0 ? '_wizardExit()' : '_wizardBack()';

  // ניקוי תשובת השלב — כל כניסה מתחילה נקייה (חריג: שם נשמר לפרה-פיל)
  if (step.id !== 'name') delete _wizardAnswers[step.id];

  // איפוס sub-navigation של avatar כשיוצאים מהשלב
  if (step.id !== 'avatar') _wizardAvatarCatIndex = -1;

  // כותרת דינמית לשלב השם — מותאמת אישית אם שם כבר קיים
  const existingName = (_wizardAnswers.name || '').trim();
  let displayTitle = step.title;
  let displaySub   = step.sub;
  if (step.id === 'name' && existingName) {
    displayTitle = `👋 היי ${existingName}!`;
    displaySub   = `יש עוד <strong>${existingName}</strong> בכיתה? אפשר להוסיף שם משפחה:`;
  }

  // Slide animation
  container.classList.remove('wiz-anim-next', 'wiz-anim-back');
  void container.offsetWidth;
  container.classList.add(goingBack ? 'wiz-anim-back' : 'wiz-anim-next');

  // כפתור "הבא": מופעל מיד לשם (אם קיים) ו-slider; מושבת לשאר עד בחירה
  let btnEnabled = false;
  if (step.id === 'name') {
    btnEnabled = existingName.length > 0;
  } else if (step.id === 'loveSlider') {
    btnEnabled = true;
    if (!_wizardAnswers.loveSlider) _wizardAnswers.loveSlider = 5;
  }

  container.innerHTML = `
    <div class="wiz-step">
      <div class="wiz-top-row">
        <button class="wiz-back-btn" onclick="${backFn}">חזרה →</button>
      </div>
      <div class="wiz-hero">
        <div class="wiz-step-icon" style="color:${step.color}">${step.icon}</div>
        <h2 class="wiz-step-title">${displayTitle}</h2>
        <p class="wiz-step-sub">${displaySub}</p>
      </div>
      <div class="wiz-body" id="wiz-step-body">
        ${_buildStepBody(step.id)}
      </div>
      <div class="wiz-footer">
        <p id="wiz-error" class="wiz-error"></p>
        <button id="wiz-next-btn" class="wiz-next-btn"
                style="--wiz-btn-color:${step.color}"
                onclick="_wizardNext()"
                ${btnEnabled ? '' : 'disabled'}>
          ${step.next}
        </button>
      </div>
    </div>`;

  // Post-render hooks
  if (step.id === 'name') {
    const input = document.getElementById('wiz-name-input');
    if (input) {
      input.addEventListener('input', e => {
        _wizardAnswers.name = e.target.value;
        const btn = document.getElementById('wiz-next-btn');
        if (btn) btn.disabled = e.target.value.trim().length === 0;
      });
      if (!existingName) setTimeout(() => input.focus(), 80);
    }
  }
}

// ─── Step Body Builders ───────────────────────────────────────────────────────

function _buildStepBody(id) {
  switch (id) {
    case 'name':       return _bodyName();
    case 'avatar':     return _bodyAvatar();
    case 'niqqudPref': return _bodyNiqqud();
    case 'loveSlider': return _bodyLoveSlider();
    case 'goal':       return _bodyGoal();
    default: return '';
  }
}

function _bodyName() {
  const val      = _wizardAnswers.name || '';
  const existing = val.trim();
  if (existing) {
    return `
      <input id="wiz-name-input" class="wiz-name-input" type="text"
             placeholder="${existing}" value="${val}" maxlength="40"
             autocomplete="off" autocorrect="off" spellcheck="false" />
      <p class="wiz-hint-text">אם אין עוד ${existing} בכיתה — לחץ/י ישירות על 🚀 בוא נתחיל!</p>`;
  }
  return `<input id="wiz-name-input" class="wiz-name-input" type="text"
                  placeholder="שם פרטי" value="" maxlength="40"
                  autocomplete="given-name" autocorrect="off" spellcheck="false" />`;
}

function _bodyAvatar() {
  // שלב א — רשימת קטגוריות גדולות
  return `<div class="avatar-cat-grid">` +
    AVATAR_CATALOG.map((cat, i) => {
      const repr = cat.emojis.find(e => !_wizardTakenAvatars.has(e)) || cat.emojis[0];
      return `<button class="avatar-cat-btn" onclick="_selectAvatarCat(${i})">
        <span class="avatar-cat-emoji">${repr}</span>
        <span class="avatar-cat-name">${cat.category}</span>
      </button>`;
    }).join('') +
  `</div>`;
}

function _bodyAvatarGrid(catIndex) {
  // שלב ב — גריד אמוג׳ים גדולים מהקטגוריה שנבחרה
  const cat  = AVATAR_CATALOG[catIndex];
  const btns = cat.emojis.map(emoji => {
    const idx   = _AVATAR_INDEX.get(emoji);
    const taken = _wizardTakenAvatars.has(emoji);
    const sel   = _wizardAnswers.avatar === emoji;
    if (idx === undefined) return '';
    return `<button class="avatar-opt-lg${taken ? ' avatar-taken' : ''}${sel ? ' selected' : ''}"
                    data-idx="${idx}" onclick="_selectAvatar(${idx})"
                    ${taken ? 'disabled title="תפוס"' : ''}>${emoji}</button>`;
  }).join('');
  return `<p class="avatar-cat-title">${cat.category}</p>
          <div class="avatar-grid-lg">${btns}</div>`;
}

function _bodyNiqqud() {
  return [
    { v: 'full',    e: 'בְּרֵאשִׁית', l: 'עם ניקוד מלא'   },
    { v: 'partial', e: 'בְּראשית',    l: 'גם וגם'          },
    { v: 'none',    e: 'בראשית',     l: 'ללא ניקוד'       },
  ].map(o => `
    <button class="wiz-card-opt wiz-niqqud-opt${_wizardAnswers.niqqudPref === o.v ? ' selected' : ''}"
            onclick="_pickSingle(this,'niqqudPref','${o.v}')">
      <span class="wiz-niqqud-example">${o.e}</span>
      <span class="wiz-card-label">${o.l}</span>
    </button>`).join('');
}

function _bodyLoveSlider() {
  const val = _wizardAnswers.loveSlider || 5;
  return `<div class="wiz-slider-wrap">
    <div class="wiz-slider-emoji-row">
      <span class="wiz-slider-emoji-end">😕<br><small>בכלל לא</small></span>
      <span class="wiz-slider-emoji-end">🤩<br><small>מאוד!</small></span>
    </div>
    <input id="wiz-love-slider" type="range" min="1" max="10" step="1"
           value="${val}" class="wiz-slider"
           oninput="_updateLoveSlider(this.value)" />
    <div class="wiz-slider-value-display">
      <span id="wiz-love-value" class="wiz-slider-value">${val}</span>
      <span class="wiz-slider-scale">/ 10</span>
    </div>
  </div>`;
}

function _bodyGoal() {
  return [
    { v: 'more',    e: '📈', l: 'לקרוא יותר'          },
    { v: 'improve', e: '✨', l: 'להשתפר בקריאה'       },
    { v: 'stars',   e: '⭐', l: 'לצבור כוכבים'        },
    { v: 'long',    e: '📚', l: 'לקרוא ספרים ארוכים'  },
  ].map(o => _cardBtn(o, 'goal')).join('');
}

function _cardBtn(o, field) {
  const sel = String(_wizardAnswers[field]) === String(o.v);
  return `<button class="wiz-card-opt${sel ? ' selected' : ''}"
                  onclick="_pickSingle(this,'${field}',${typeof o.v === 'number' ? o.v : `'${o.v}'`})">
    <span class="wiz-card-emoji">${o.e}</span>
    <span class="wiz-card-label">${o.l}</span>
  </button>`;
}

// ─── Interaction Handlers ─────────────────────────────────────────────────────

function _pickSingle(btn, field, rawValue) {
  const value = isNaN(Number(rawValue)) ? rawValue : Number(rawValue);
  _wizardAnswers[field] = value;

  document.querySelectorAll('.wiz-card-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  const nextBtn = document.getElementById('wiz-next-btn');
  if (nextBtn) nextBtn.disabled = false;
  // אין מעבר אוטומטי — הילד לוחץ על "המשך" בעצמו
}

function _selectAvatar(idx) {
  const emoji = PROFILE_AVATARS[idx];
  if (_wizardTakenAvatars.has(emoji)) return;

  document.querySelectorAll('.avatar-opt.selected').forEach(b => b.classList.remove('selected'));
  const btn = document.querySelector(`.avatar-opt[data-idx="${idx}"]`);
  if (btn) btn.classList.add('selected');

  _wizardAnswers.avatar = emoji;

  const nextBtn = document.getElementById('wiz-next-btn');
  if (nextBtn) {
    nextBtn.disabled    = false;
    nextBtn.textContent = `${emoji} בחרתי!`;
  }
}

function _selectAvatarCat(catIndex) {
  _wizardAvatarCatIndex = catIndex;
  const bodyEl = document.getElementById('wiz-step-body');
  if (bodyEl) bodyEl.innerHTML = _bodyAvatarGrid(catIndex);
}

function _updateLoveSlider(val) {
  _wizardAnswers.loveSlider = Number(val);
  const valEl  = document.getElementById('wiz-love-value');
  if (valEl) valEl.textContent = val;
  const nextBtn = document.getElementById('wiz-next-btn');
  if (nextBtn) nextBtn.disabled = false;
}

// ─── Submit ───────────────────────────────────────────────────────────────────

async function _wizardSubmit() {
  const errEl = document.getElementById('wiz-error');
  if (errEl) errEl.textContent = '';

  const name = (_wizardAnswers.name || '').trim();
  if (!name) { if (errEl) errEl.textContent = 'שם חסר'; return; }

  const btn = document.getElementById('wiz-next-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'שומר...'; }

  console.log('[wizard] מתחיל שמירת פרופיל:', { userId: _wizardUserId, name });

  // Auth חייבת להיות מוקמת לפני כל כתיבה ל-Firestore
  if (typeof ensureStudentAuth === 'function') {
    try {
      await ensureStudentAuth();
      const authUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
      console.log('[wizard] auth:', authUser ? `uid=${authUser.uid}` : 'לא מחובר');
    } catch (e) {
      console.warn('[wizard] ensureStudentAuth נכשל:', e.message);
    }
  }

  const now = new Date().toISOString();
  const profileData = {
    name,
    avatar:                  _wizardAnswers.avatar,
    emoji:                   _wizardAnswers.avatar,
    niqqudPref:              _wizardAnswers.niqqudPref || null,
    niqqudLevel:             _wizardAnswers.niqqudPref || null, // alias for onboarding compat
    loveOfReading:           _wizardAnswers.loveSlider ?? 5,
    goal:                    _wizardAnswers.goal,
    favoriteTopics:          [],  // kept for backward compat with buildRecommendations
    onboardingComplete:      true,
    personalizationComplete: true,
    updatedAt:               now,
  };
  if (!_wizardExisting?.createdAt) profileData.createdAt = now;

  // timeout של 9 שניות — מגן מפני תקיעה ב-Firestore על רשת איטית
  const _save = (p, ms = 9000) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('החיבור איטי — נסה/י שוב')), ms)),
  ]);

  const _restoreBtn = () => {
    if (btn) { btn.disabled = false; btn.textContent = WIZARD_STEPS[WIZARD_STEPS.length - 1].next; }
  };

  const _isSolo = typeof _wizardUserId === 'string' && _wizardUserId.startsWith('solo_');

  try {
    if (_isSolo) {
      // Solo mode — localStorage only, no Firestore
      if (typeof saveStudentLocal === 'function') {
        saveStudentLocal({ id: _wizardUserId, ...profileData });
      }
    } else {
      if (typeof fbSaveUserProfile === 'function') {
        console.log('[wizard] שומר פרופיל ב-Firestore...');
        await _save(fbSaveUserProfile(_wizardUserId, profileData));
        console.log('[wizard] פרופיל נשמר בהצלחה');
      }
      if (_wizardClubId && typeof fbUpdateMemberAvatar === 'function') {
        await _save(fbUpdateMemberAvatar(_wizardClubId, _wizardUserId, _wizardAnswers.avatar), 5000);
      }
    }
    console.log('[wizard] שמירה הושלמה — מעבר למסך הבא');
  } catch (e) {
    console.error('[wizard] שגיאה בשמירה:', e.message);
    if (errEl) errEl.textContent = e.message || 'שגיאה בשמירה — נסה/י שוב';
    _restoreBtn();
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

const _TOPIC_LABELS = {
  funny:'😂 מצחיק', adventure:'⚔️ הרפתקאות', animals:'🐾 חיות',
  magic:'🪄 קסמים', space:'🚀 חלל', science:'🔬 מדע',
  dinosaurs:'🦕 דינוזאורים', sports:'⚽ ספורט',
  friendship:'🤝 חברות', family:'🏠 משפחה', comics:'💬 קומיקס',
};

function _showWizardComplete() {
  const container = document.getElementById('wizard-content');
  if (!container) return;

  const fill  = document.getElementById('wizard-progress-fill');
  const label = document.getElementById('wizard-progress-label');
  if (fill)  { fill.style.width = '100%'; fill.style.background = 'linear-gradient(90deg,#F39C12,#E74C3C)'; }
  if (label) label.textContent = '🎉 הכל מוכן!';

  const avatar  = _wizardAnswers.avatar || '⭐';
  const name    = (_wizardAnswers.name || '').trim();
  const grade   = _wizardAnswers.grade ? `כיתה ${_wizardAnswers.grade}'` : '';
  const topicTags = (_wizardAnswers.favoriteTopics || [])
    .map(t => _TOPIC_LABELS[t]).filter(Boolean)
    .map(l => `<span class="wiz-topic-tag">${l}</span>`)
    .join('');

  container.classList.remove('wiz-anim-next', 'wiz-anim-back');
  void container.offsetWidth;
  container.classList.add('wiz-anim-next');

  container.innerHTML = `
    <div class="wiz-complete">
      <div class="wiz-complete-burst">🎉 ✨ 🎊</div>
      <h2 class="wiz-complete-title">כרטיס הקורא שלך מוכן!</h2>
      <div class="wiz-reader-card">
        <div class="wiz-card-avatar">${avatar}</div>
        <div class="wiz-card-name">${name}</div>
        ${grade ? `<div class="wiz-card-grade">${grade}</div>` : ''}
        ${topicTags ? `<div class="wiz-card-topics">${topicTags}</div>` : ''}
      </div>
      <p class="wiz-complete-text">
        הכנתי במיוחד בשבילך סיפורים שמתאימים בדיוק לך ✨
      </p>
      <button class="wiz-next-btn wiz-start-btn" onclick="_enterPersonalHomeFromWizard()">
        בואו נתחיל לקרוא! ✨
      </button>
    </div>`;
}

function _enterPersonalHomeFromWizard() {
  if (typeof _enterPersonalHome === 'function' && _wizardFinalProfile) {
    _enterPersonalHome(_wizardUserId, _wizardFinalProfile);
  }
}

// ─── Recommendation Engine ────────────────────────────────────────────────────

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
      const diff = Math.abs(storyMins - targetMins);
      if (diff <= 2) score += 2; else if (diff <= 5) score += 1;
      return { ...s, _score: score, _mins: Math.ceil(storyMins) };
    })
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, maxResults);
}

function renderForYouSection() {
  const section = document.getElementById('for-you-section');
  const listEl  = document.getElementById('for-you-list');
  if (!section || !listEl) return;

  const profile = window._studentPersonalization;
  if (!profile?.personalizationComplete) { section.style.display = 'none'; return; }

  const studentData = window.currentStudentData;
  const histArr     = Array.isArray(studentData?.history) ? studentData.history : [];
  const readIds     = new Set(
    histArr.filter(h => h?.type === 'app').flatMap(h => [h.storyId, h.legacyId]).filter(Boolean)
  );

  const recommended = buildRecommendations(
    profile,
    typeof getAllStories === 'function' ? getAllStories() : [],
    readIds
  );

  if (!recommended.length) { section.style.display = 'none'; return; }

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

// ─── Global Exports ───────────────────────────────────────────────────────────

window.showProfileWizard            = showProfileWizard;
window._selectAvatar                = _selectAvatar;
window._wizardNext                  = _wizardNext;
window._wizardBack                  = _wizardBack;
window._wizardExit                  = _wizardExit;
window._pickSingle                  = _pickSingle;
window._selectAvatarCat             = _selectAvatarCat;
window._updateLoveSlider            = _updateLoveSlider;
window._enterPersonalHomeFromWizard = _enterPersonalHomeFromWizard;
window.buildRecommendations         = buildRecommendations;
window.renderForYouSection          = renderForYouSection;
