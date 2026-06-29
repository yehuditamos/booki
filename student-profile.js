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
  { id: 'name',                  color: '#F39C12', icon: '👋', title: 'שלום!',          sub: 'מה שמך?',                                next: 'זה אני! 😊'   },
  { id: 'avatar',                color: '#9B59B6', icon: '🌟', title: 'הדמות שלי',     sub: 'בחר/י דמות שתייצג אותך',                next: 'בחרתי! ✨'    },
  { id: 'grade',                 color: '#3498DB', icon: '📚', title: 'הכיתה שלי',     sub: 'באיזו כיתה אתה/את?',                    next: 'ממשיכים! 📚'  },
  { id: 'readingLevel',          color: '#27AE60', icon: '💪', title: 'הרגשה שלי',     sub: 'איך אתה מרגיש עם קריאה?',               next: 'ממשיכים! 💪'  },
  { id: 'favoriteTopics',        color: '#E74C3C', icon: '❤️', title: 'מה אני אוהב',  sub: 'מה אתה הכי אוהב לקרוא?',                next: 'ממשיכים! ❤️'  },
  { id: 'favoriteCharacterType', color: '#E67E22', icon: '🦸', title: 'דמות אהובה',    sub: 'איזה סוג דמות אתה הכי אוהב?',            next: 'ממשיכים! 🦸'  },
  { id: 'preferredReadingTime',  color: '#1ABC9C', icon: '⏱️', title: 'זמן קריאה',     sub: 'כמה זמן אתה אוהב לקרוא?',               next: 'ממשיכים! ⏱️' },
  { id: 'goal',                  color: '#8E44AD', icon: '🎯', title: 'המטרה שלי',     sub: 'מה המטרה שלך?',                         next: 'סיימתי! 🎉'   },
];

// ─── Wizard State ─────────────────────────────────────────────────────────────

let _wizardUserId       = null;
let _wizardClubId       = null;
let _wizardExisting     = {};
let _wizardAnswers      = {};
let _wizardTakenAvatars = new Set();
let _wizardFinalProfile = null;
let _wizardStepIndex    = 0;

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function showProfileWizard(userId, clubId, existingProfile) {
  _wizardUserId       = userId;
  _wizardClubId       = clubId;
  _wizardExisting     = existingProfile || {};
  _wizardAnswers      = {
    name:           existingProfile?.name || '',
    favoriteTopics: [],
  };
  _wizardTakenAvatars = new Set();
  _wizardFinalProfile = null;
  _wizardStepIndex    = 0;

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
  if (_wizardStepIndex > 0) {
    _wizardStepIndex--;
    _renderWizardStep(true);
  }
}

function _isStepValid(id) {
  switch (id) {
    case 'name':                  return (_wizardAnswers.name || '').trim().length > 0;
    case 'avatar':                return !!_wizardAnswers.avatar;
    case 'grade':                 return !!_wizardAnswers.grade;
    case 'readingLevel':          return !!_wizardAnswers.readingLevel;
    case 'favoriteTopics':        return (_wizardAnswers.favoriteTopics?.length > 0);
    case 'favoriteCharacterType': return !!_wizardAnswers.favoriteCharacterType;
    case 'preferredReadingTime':  return !!_wizardAnswers.preferredReadingTime;
    case 'goal':                  return !!_wizardAnswers.goal;
    default: return true;
  }
}

function _stepErrMsg(id) {
  return ({
    name:                  'כתוב/י את שמך כדי להמשיך',
    avatar:                'בחר/י דמות כדי להמשיך',
    grade:                 'בחר/י את הכיתה שלך',
    readingLevel:          'ספר/י לנו איך אתה מרגיש',
    favoriteTopics:        'בחר/י לפחות תחום אחד',
    favoriteCharacterType: 'בחר/י סוג דמות',
    preferredReadingTime:  'בחר/י זמן קריאה',
    goal:                  'בחר/י מטרה',
  })[id] || '';
}

// ─── Step Renderer ────────────────────────────────────────────────────────────

function _renderWizardStep(goingBack) {
  _updateProgress();
  const container = document.getElementById('wizard-content');
  if (!container) return;

  const step    = WIZARD_STEPS[_wizardStepIndex];
  const hasBack = _wizardStepIndex > 0;

  // ניקוי תשובת השלב — כל כניסה מתחילה נקייה (חריג: שם נשמר לפרה-פיל)
  if (step.id === 'favoriteTopics') {
    _wizardAnswers.favoriteTopics = [];
  } else if (step.id !== 'name') {
    delete _wizardAnswers[step.id];
  }

  // Slide animation
  container.classList.remove('wiz-anim-next', 'wiz-anim-back');
  void container.offsetWidth;
  container.classList.add(goingBack ? 'wiz-anim-back' : 'wiz-anim-next');

  // שלב השם: הכפתור מופעל אם יש שם קיים; שאר השלבים — מושבת עד בחירה
  const nameReady = step.id === 'name' && (_wizardAnswers.name || '').trim().length > 0;

  container.innerHTML = `
    <div class="wiz-step">
      <div class="wiz-top-row">
        ${hasBack ? `<button class="wiz-back-btn" onclick="_wizardBack()">← חזרה</button>` : '<div></div>'}
      </div>
      <div class="wiz-hero">
        <div class="wiz-step-icon" style="color:${step.color}">${step.icon}</div>
        <h2 class="wiz-step-title">${step.title}</h2>
        <p class="wiz-step-sub">${step.sub}</p>
      </div>
      <div class="wiz-body">
        ${_buildStepBody(step.id)}
      </div>
      <div class="wiz-footer">
        <p id="wiz-error" class="wiz-error"></p>
        <button id="wiz-next-btn" class="wiz-next-btn"
                style="--wiz-btn-color:${step.color}"
                onclick="_wizardNext()"
                ${nameReady ? '' : 'disabled'}>
          ${step.next}
        </button>
      </div>
    </div>`;

  // Post-render: שלב השם
  if (step.id === 'name') {
    const input = document.getElementById('wiz-name-input');
    if (input) {
      input.addEventListener('input', e => {
        _wizardAnswers.name = e.target.value;
        const btn = document.getElementById('wiz-next-btn');
        if (btn) btn.disabled = e.target.value.trim().length === 0;
      });
      setTimeout(() => input.focus(), 80);
    }
  }
}

// ─── Step Body Builders ───────────────────────────────────────────────────────

function _buildStepBody(id) {
  switch (id) {
    case 'name':                  return _bodyName();
    case 'avatar':                return _bodyAvatar();
    case 'grade':                 return _bodyGrade();
    case 'readingLevel':          return _bodyReadingLevel();
    case 'favoriteTopics':        return _bodyTopics();
    case 'favoriteCharacterType': return _bodyCharType();
    case 'preferredReadingTime':  return _bodyReadingTime();
    case 'goal':                  return _bodyGoal();
    default: return '';
  }
}

function _bodyName() {
  const val = _wizardAnswers.name || '';
  return `<input id="wiz-name-input" class="wiz-name-input" type="text"
                  placeholder="שם פרטי" value="${val}" maxlength="30"
                  autocomplete="off" autocorrect="off" spellcheck="false" />`;
}

function _bodyAvatar() {
  const sections = AVATAR_CATALOG.map(cat => {
    const btns = cat.emojis.map(emoji => {
      const idx   = _AVATAR_INDEX.get(emoji);
      const taken = _wizardTakenAvatars.has(emoji);
      const sel   = _wizardAnswers.avatar === emoji;
      if (idx === undefined) return '';
      return `<button class="avatar-opt${taken ? ' avatar-taken' : ''}${sel ? ' selected' : ''}"
                      data-idx="${idx}" onclick="_selectAvatar(${idx})"
                      ${taken ? 'disabled title="תפוס"' : ''}>${emoji}</button>`;
    }).join('');
    return `<div class="avatar-section">
      <div class="avatar-cat-label">${cat.category}</div>
      <div class="avatar-grid">${btns}</div>
    </div>`;
  }).join('');
  return `<div class="avatar-sections">${sections}</div>`;
}

function _bodyGrade() {
  return `<div class="wiz-grade-row">
    ${['א','ב','ג'].map(g => `
      <button class="wiz-grade-btn${_wizardAnswers.grade === g ? ' selected' : ''}"
              onclick="_pickSingle(this,'grade','${g}')">
        ${g}'
      </button>`).join('')}
  </div>`;
}

function _bodyReadingLevel() {
  return [
    { v: 'easy',     e: '😊', l: 'אני קורא/ת בקלות'  },
    { v: 'ok',       e: '🙂', l: 'אני מסתדר/ת'        },
    { v: 'hard',     e: '😅', l: 'לפעמים קשה לי'      },
    { v: 'beginner', e: '❤️', l: 'אני רק מתחיל/ה'    },
  ].map(o => _cardBtn(o, 'readingLevel')).join('');
}

function _bodyTopics() {
  const sel = new Set(_wizardAnswers.favoriteTopics || []);
  const chips = [
    { v: 'funny',      l: '😂 מצחיק'      },
    { v: 'adventure',  l: '⚔️ הרפתקאות'   },
    { v: 'animals',    l: '🐾 חיות'        },
    { v: 'magic',      l: '🪄 קסמים'       },
    { v: 'space',      l: '🚀 חלל'         },
    { v: 'science',    l: '🔬 מדע'         },
    { v: 'dinosaurs',  l: '🦕 דינוזאורים'  },
    { v: 'sports',     l: '⚽ ספורט'       },
    { v: 'friendship', l: '🤝 חברות'       },
    { v: 'family',     l: '🏠 משפחה'       },
    { v: 'comics',     l: '💬 קומיקס'      },
  ].map(o => `<button class="wiz-chip${sel.has(o.v) ? ' selected' : ''}"
                       onclick="_toggleTopic(this,'${o.v}')">${o.l}</button>`).join('');
  return `<div class="wiz-chips-wrap">${chips}</div>
          <p class="wiz-hint-text">אפשר לבחור כמה שרוצים</p>`;
}

function _bodyCharType() {
  return [
    { v: 'animals',     e: '🐶', l: 'חיות'              },
    { v: 'robots',      e: '🤖', l: 'רובוטים'           },
    { v: 'kids',        e: '🧒', l: 'ילדים'             },
    { v: 'princesses',  e: '👸', l: 'נסיכות'            },
    { v: 'superheroes', e: '🦸', l: 'גיבורי על'         },
    { v: 'dinosaurs',   e: '🦖', l: 'דינוזאורים'        },
    { v: 'dragons',     e: '🐉', l: 'דרקונים'           },
    { v: 'astronauts',  e: '🚀', l: 'אסטרונאוטים'       },
    { v: 'wizards',     e: '🧙', l: 'קוסמים'            },
    { v: 'monsters',    e: '👾', l: 'מפלצות מצחיקות'    },
  ].map(o => _cardBtn(o, 'favoriteCharacterType')).join('');
}

function _bodyReadingTime() {
  return [
    { v: 5,  e: '⚡', l: "5 דקות"   },
    { v: 10, e: '📖', l: "10 דקות"  },
    { v: 15, e: '📚', l: "15 דקות"  },
    { v: 20, e: '🌟', l: "20+ דקות" },
  ].map(o => _cardBtn(o, 'preferredReadingTime')).join('');
}

function _bodyGoal() {
  return [
    { v: 'daily',   e: '📅', l: 'לקרוא כל יום'        },
    { v: 'improve', e: '📈', l: 'להשתפר בקריאה'       },
    { v: 'long',    e: '📚', l: 'לקרוא ספרים ארוכים'  },
    { v: 'stars',   e: '⭐', l: 'לצבור כוכבים'        },
    { v: 'compete', e: '🏆', l: 'לנצח בטבלת המובילים' },
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

  document.querySelectorAll('.wiz-card-opt, .wiz-grade-btn').forEach(b => b.classList.remove('selected'));
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

function _toggleTopic(btn, value) {
  btn.classList.toggle('selected');
  if (!Array.isArray(_wizardAnswers.favoriteTopics)) _wizardAnswers.favoriteTopics = [];
  if (btn.classList.contains('selected')) {
    if (!_wizardAnswers.favoriteTopics.includes(value)) _wizardAnswers.favoriteTopics.push(value);
  } else {
    _wizardAnswers.favoriteTopics = _wizardAnswers.favoriteTopics.filter(t => t !== value);
  }
  const nextBtn = document.getElementById('wiz-next-btn');
  if (nextBtn) nextBtn.disabled = _wizardAnswers.favoriteTopics.length === 0;
}

// ─── Submit ───────────────────────────────────────────────────────────────────

async function _wizardSubmit() {
  const errEl = document.getElementById('wiz-error');
  if (errEl) errEl.textContent = '';

  const name = (_wizardAnswers.name || '').trim();
  if (!name) { if (errEl) errEl.textContent = 'שם חסר'; return; }

  const btn = document.getElementById('wiz-next-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'שומר...'; }

  const now = new Date().toISOString();
  const profileData = {
    name,
    avatar:                  _wizardAnswers.avatar,
    grade:                   _wizardAnswers.grade,
    readingLevel:            _wizardAnswers.readingLevel,
    favoriteTopics:          _wizardAnswers.favoriteTopics || [],
    favoriteCharacterType:   _wizardAnswers.favoriteCharacterType || null,
    preferredReadingTime:    Number(_wizardAnswers.preferredReadingTime),
    goal:                    _wizardAnswers.goal,
    onboardingComplete:      true,
    personalizationComplete: true,
    updatedAt:               now,
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
    if (btn) {
      btn.disabled    = false;
      btn.textContent = WIZARD_STEPS[WIZARD_STEPS.length - 1].next;
    }
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
window._pickSingle                  = _pickSingle;
window._toggleTopic                 = _toggleTopic;
window._enterPersonalHomeFromWizard = _enterPersonalHomeFromWizard;
window.buildRecommendations         = buildRecommendations;
window.renderForYouSection          = renderForYouSection;
