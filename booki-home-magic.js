/* ═══════════════════════════════════════════════════════════════
   יער הקריאה של בוקי — booki-home-magic.js
   שכבת עיצוב תוססת למסך הבית בלבד: פס התקדמות, כרטיס הישג, הודעה
   קבועה אחת ליד בוקי (נבחרת פעם אחת בכל כניסה למסך — לא מתחלפת
   לבד), קיצורי "חדש על המדף", אנימציית כניסה, ומשוב-לחיצה על
   קונסולת הקריאה.
   קורא נתונים אמיתיים בלבד (currentStudentData, RANKS/getRank/getNextRank
   הקיימים ב-script.js, computeStreakDays הקיים ב-motivation.js,
   STORIES_BEGINNER/STORIES_BOOKWORMS הקיימים ב-content/) —
   לא מוסיף קריאות Firestore, לא נוגע בניווט/onclick הקיימים.
═══════════════════════════════════════════════════════════════ */

function _computeHomeProgress() {
  const data = (typeof currentStudentData !== 'undefined' && currentStudentData) ? currentStudentData : null;
  const history = (data && Array.isArray(data.history)) ? data.history : [];
  const totalMinutes = data ? (data.totalMinutes || 0) : 0;

  // דקות השבוע: 7 הימים האחרונים כולל היום, לפי אותה מוסכמת תאריך he-IL
  // בה משתמש computeStreakDays (h.date בפורמט toLocaleDateString('he-IL')).
  let weeklyMinutes = 0;
  if (history.length) {
    const days = new Set();
    const d = new Date();
    for (let i = 0; i < 7; i++) {
      days.add(d.toLocaleDateString('he-IL'));
      d.setDate(d.getDate() - 1);
    }
    history.forEach(h => { if (h && h.date && days.has(h.date)) weeklyMinutes += (h.minutes || 0); });
  }

  const streak = (typeof computeStreakDays === 'function') ? computeStreakDays(history) : 0;
  const rank   = (typeof getRank === 'function') ? getRank(totalMinutes) : null;
  const next   = (typeof getNextRank === 'function') ? getNextRank(totalMinutes) : null;
  const pct       = next ? Math.max(0, Math.min(100, Math.round((totalMinutes / next.min) * 100))) : 100;
  const remaining = next ? Math.max(0, next.min - totalMinutes) : 0;

  return { hasData: !!data, weeklyMinutes, streak, rank, next, pct, remaining };
}

// בוחר בין גרסה רגילה למנוקדת לפי מצב כפתור הנגשת הניקוד (niqud.js) — לכל
// טקסט דינמי שנבנה כאן (לא עובר דרך מנגנון data-nk, כי מכיל ערכים משתנים).
function _nkPick(plain, nk) {
  return (typeof isNiqudOn === 'function' && isNiqudOn()) ? nk : plain;
}

function _renderHomeProgressPanel() {
  const panel = document.getElementById('home-progress-panel');
  if (!panel) return;
  const p = _computeHomeProgress();
  if (!p.hasData || !p.rank) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  // בהיר: "השבוע" מתאפס כל שבוע, בניגוד ל"עוד X לדרגה" למטה שהוא מצטבר-לתמיד —
  // שני מספרים שונים לגמרי, אז גם המילה מתחלפת כשאין עדיין קריאה השבוע (0 מרגיש
  // כמו כישלון לילד/ה; הזמנה לקרוא מרגישה כמו התחלה).
  const weekEl = document.getElementById('home-progress-week');
  if (weekEl) {
    weekEl.textContent = p.weeklyMinutes > 0
      ? _nkPick(`📚 השבוע קראת: ${p.weeklyMinutes} דקות`, `📚 הַשָּׁבוּעַ קָרָאתָ: ${p.weeklyMinutes} דַּקּוֹת`)
      : _nkPick(`📚 עוד לא קראת השבוע — בואו נתחיל!`, `📚 עוֹד לֹא קָרָאתָ הַשָּׁבוּעַ — בּוֹאוּ נַתְחִיל!`);
  }

  const fillEl = document.getElementById('home-progress-fill');
  if (fillEl) fillEl.style.width = p.pct + '%';

  const rankEl = document.getElementById('home-progress-rank');
  if (rankEl) rankEl.textContent = `${p.rank.icon} ${_nkPick(p.rank.name, p.rank.nameNk || p.rank.name)}`;

  const remainEl = document.getElementById('home-progress-remaining');
  if (remainEl) {
    if (p.next && p.remaining > 0) {
      const nextName = _nkPick(p.next.name, p.next.nameNk || p.next.name);
      // "בסה"כ" מבהיר שזו ספירה מצטברת-לתמיד (כל הקריאה אי-פעם), לא קשורה למספר
      // ה"השבוע" ממש מעל — בלי המילה הזו שני המספרים נראים כאילו סותרים זה את זה.
      remainEl.textContent = _nkPick(`עוד ${p.remaining} ד' בסה"כ ל${p.next.name}`, `עוֹד ${p.remaining} ד' בְּסַךְ הַכֹּל לְ${nextName}`);
      remainEl.style.display = '';
    } else {
      remainEl.style.display = 'none';
    }
  }

  const streakEl = document.getElementById('home-progress-streak');
  if (streakEl) {
    if (p.streak >= 1) {
      streakEl.textContent = _nkPick(`🔥 רצף ${p.streak} ימים`, `🔥 רֶצֶף ${p.streak} יָמִים`);
      streakEl.style.display = '';
    } else {
      streakEl.style.display = 'none';
    }
  }
}

// מוצג רק כשיש הישג אמיתי להראות (רצף ≥3 או דרגה מעל הראשונה) — בלי "רובריקה"
// גנרית כשעדיין אין כלום להציג (הוחלט: עדיף להסתיר לגמרי מאשר למלא עם פילר).
function _renderHomeAchievementCard() {
  const card = document.getElementById('home-achievement-card');
  const textEl = document.getElementById('home-achievement-text');
  if (!card || !textEl) return;
  const p = _computeHomeProgress();

  let msg = null;
  if (p.streak >= 3) {
    msg = _nkPick(`🔥 ${p.streak} ימים ברצף — התמדה מדהימה!`, `🔥 ${p.streak} יָמִים בְּרֶצֶף — הַתְמָדָה מַדְהִימָה!`);
  } else if (p.rank && p.rank.min > 0) {
    const rankName = _nkPick(p.rank.name, p.rank.nameNk || p.rank.name);
    msg = _nkPick(`${p.rank.icon} הגעת לדרגת "${p.rank.name}"!`, `${p.rank.icon} הִגַּעְתָּ לְדַרְגַּת "${rankName}"!`);
  }

  if (!p.hasData || !msg) { card.style.display = 'none'; return; }
  textEl.textContent = msg;
  card.style.display = '';
}

// ─── הודעה קבועה אחת ליד בוקי — נבחרת פעם אחת בכל כניסה למסך הבית (לא
//     מתחלפת לבד — "בכל פתיחת מסך הודעה אחת בלבד"), לפי סדר עדיפות:
//     קרוב לדרגה הבאה > רצף ≥2 ימים > ברכה כללית. עוטפת/דורסת את הטקסט
//     שמציב renderHomeEncouragement הקיים (לא נוגעת במאגר שלו) ───

function _homeSpeechPool() {
  const p = _computeHomeProgress();
  const pool = [];
  if (p.next && p.remaining > 0 && p.remaining <= 20) {
    const nextName = _nkPick(p.next.name, p.next.nameNk || p.next.name);
    pool.push(_nkPick(`${p.rank.icon} עוד ${p.remaining} דקות ואת/ה ב"${p.next.name}"!`, `${p.rank.icon} עוֹד ${p.remaining} דַּקּוֹת וְאַתָּה/אַתְּ בְּ"${nextName}"!`));
  }
  if (p.streak >= 2) pool.push(_nkPick(`🔥 שמרת על רצף של ${p.streak} ימים — כל הכבוד!`, `🔥 שָׁמַרְתָּ עַל רֶצֶף שֶׁל ${p.streak} יָמִים — כָּל הַכָּבוֹד!`));
  if (typeof pickHomeGreetingMessage === 'function') pool.push(pickHomeGreetingMessage());
  pool.push(_nkPick(`📖 מחכה לסיפור הבא שלנו!`, `📖 מְחַכֶּה לַסִּפּוּר הַבָּא שֶׁלָּנוּ!`));
  return pool.length ? pool : [_nkPick(`📖 היום זה יום מצוין לקרוא עוד קצת!`, `📖 הַיּוֹם זֶה יוֹם מְצֻיָּן לִקְרוֹא עוֹד קְצָת!`)];
}

function _renderHomeSpeech() {
  const el = document.getElementById('home-encouragement');
  if (!el) return;
  el.textContent = typeof getPersonalHomeQuestion === 'function'
    ? getPersonalHomeQuestion()
    : 'מוכנים לקרוא יחד עם הכיתה?';
}

// ─── "חדש על המדף" — קיצור אחד, מדף-ספרים ויזואלי, לשתי הספריות שנוספו
//     אחרונות ביחד (מקומי בלבד — STORIES_BEGINNER/STORIES_BOOKWORMS
//     גלובליים קיימים, בלי Firestore) ───

function _renderHomeShelfShortcuts() {
  const card = document.getElementById('home-shelf-card');
  const countEl = document.getElementById('home-shelf-count');
  if (!card) return;

  const beginner  = (typeof STORIES_BEGINNER  !== 'undefined' && Array.isArray(STORIES_BEGINNER))  ? STORIES_BEGINNER  : [];
  const bookworms = (typeof STORIES_BOOKWORMS !== 'undefined' && Array.isArray(STORIES_BOOKWORMS)) ? STORIES_BOOKWORMS : [];
  const total = beginner.length + bookworms.length;

  if (!total) { card.style.display = 'none'; return; }

  card.style.display = '';
  if (countEl) countEl.textContent = `${total} סיפורים חדשים`;

  // אם רק לספרייה אחת מהשתיים יש בפועל סיפורים — פותחים ישר אליה, לא ל"הכל".
  window._homeShelfTarget = beginner.length && bookworms.length ? null
    : beginner.length ? 'צעדים ראשונים'
    : 'תולעי ספרים';
}

function _openHomeShelf() {
  if (typeof showLibrary !== 'function') return;
  showLibrary(window._homeShelfTarget || 'all');
}

// ─── "בוקי, איך אני מתקדם?" — משוב אישי מנתוני קריאה אמיתיים בלבד ───

let _bookiProgressTask = { shelf:null };
let _bookiProgressOpening = false;

function _buildBookiProgressFeedback() {
  const data = (typeof currentStudentData !== 'undefined' && currentStudentData) || {};
  const history = Array.isArray(data.history) ? data.history : [];
  const name = typeof getHomeReaderName === 'function' ? getHomeReaderName() : '';
  const hello = name ? `${name}, ` : '';
  const appStories = history.filter(item => item && item.type === 'app');
  const noNiqudStories = appStories.filter(item => item.niqudMode === 'none' && (item.noNiqudWords || 0) > 0);
  const mixedStories = appStories.filter(item => item.niqudMode === 'mixed' && (item.noNiqudWords || 0) > 0);
  const uniqueAppStories = new Set(appStories.map(item => item.storyId).filter(Boolean)).size;
  const uniqueNoNiqudStories = new Set(noNiqudStories.map(item => item.storyId).filter(Boolean)).size;
  const noNiqudWords = appStories.reduce((sum, item) => sum + (Number(item.noNiqudWords) || 0), 0);
  const streak = typeof computeStreakDays === 'function' ? computeStreakDays(history) : 0;

  if (noNiqudStories.length) {
    _bookiProgressTask = { shelf:'advanced' };
    return `${hello}כבר השלמת ${uniqueNoNiqudStories} ${uniqueNoNiqudStories === 1 ? 'סיפור' : 'סיפורים'} במסלול בלי ניקוד וקראת ${noNiqudWords} מילים בלי ניקוד. זאת התקדמות אמיצה! המשימה שלי אליך: לבחור עוד סיפור ולנסות בו עמוד אחד בלי ניקוד.`;
  }
  if (mixedStories.length) {
    _bookiProgressTask = { shelf:null };
    return `${hello}כבר ניסית לקרוא משפטים בלי ניקוד במסלול חצי־חצי. ידעת גם מתי להיעזר בי — וככה קוראים לומדים! המשימה שלי אליך: לנסות היום עמוד אחד במסלול בלי ניקוד.`;
  }
  if (appStories.length) {
    _bookiProgressTask = { shelf:null };
    return `${hello}סיימת ${uniqueAppStories} ${uniqueAppStories === 1 ? 'סיפור' : 'סיפורים'} בבוקי${streak >= 2 ? ` ושמרת על רצף של ${streak} ימים` : ''}. אני רואה את ההתמדה שלך! המשימה שלי אליך: לבחור סיפור ולנסות אותו במסלול חצי־חצי.`;
  }
  if ((data.totalMinutes || 0) > 0) {
    _bookiProgressTask = { shelf:'starter' };
    return `${hello}כבר צברת ${data.totalMinutes} דקות קריאה. בכל פעם שחוזרים לקרוא, המוח מתחזק! המשימה שלי אליך: לבחור היום סיפור אחד ולסיים אותו.`;
  }
  _bookiProgressTask = { shelf:'starter' };
  return `${hello}אני עדיין לומד להכיר אותך. עצם הכניסה שלך לבוקי מספרת לי שיש כאן רצון להתקדם. המשימה הראשונה שלנו: לבחור סיפור אחד ולקרוא יחד.`;
}

function _launchBookiProgressSparkles(areaId = 'booki-progress-sparkles') {
  const area = document.getElementById(areaId);
  if (!area) return;
  area.innerHTML = '';
  for (let i = 0; i < 28; i++) {
    const sparkle = document.createElement('i');
    sparkle.textContent = i % 3 === 0 ? '⭐' : '✨';
    sparkle.style.setProperty('--x', `${(Math.random() * 280 - 140).toFixed(0)}px`);
    sparkle.style.setProperty('--y', `${(Math.random() * 250 - 125).toFixed(0)}px`);
    sparkle.style.animationDelay = `${(Math.random() * .35).toFixed(2)}s`;
    area.appendChild(sparkle);
  }
}

function openBookiProgressDialog() {
  const dialog = document.getElementById('booki-progress-dialog');
  const message = document.getElementById('booki-progress-message');
  if (!dialog || !message) return;
  const text = _buildBookiProgressFeedback();
  message.textContent = text;
  dialog.style.display = 'flex';
  document.body.classList.add('booki-progress-open');
  document.getElementById('booki-progress-task')?.focus();
}

function celebrateBookiAndShowProgress() {
  if (_bookiProgressOpening) return;
  const stage = document.getElementById('home-console-stage');
  if (!stage) return;
  _bookiProgressOpening = true;
  stage.classList.remove('booki-progress-celebrate');
  void stage.offsetWidth;
  stage.classList.add('booki-progress-celebrate');
  _launchBookiProgressSparkles('home-booki-click-confetti');
  setTimeout(() => {
    stage.classList.remove('booki-progress-celebrate');
    _bookiProgressOpening = false;
    openBookiProgressDialog();
  }, 650);
}

function closeBookiProgressDialog() {
  const dialog = document.getElementById('booki-progress-dialog');
  if (dialog) dialog.style.display = 'none';
  document.body.classList.remove('booki-progress-open');
}

function acceptBookiProgressTask() {
  closeBookiProgressDialog();
  if (typeof showLibrary !== 'function') return;
  showLibrary();
  if (_bookiProgressTask.shelf && typeof openLibraryShelf === 'function') openLibraryShelf(_bookiProgressTask.shelf);
}

function _wireBookiProgressCharacter() {
  const stage = document.getElementById('home-console-stage');
  if (!stage || stage.dataset.progressWired === '1') return;
  stage.dataset.progressWired = '1';
  stage.classList.add('home-booki-progress-trigger');
  if (!document.getElementById('home-booki-click-confetti')) {
    const confetti = document.createElement('div');
    confetti.id = 'home-booki-click-confetti';
    confetti.className = 'home-booki-click-confetti';
    confetti.setAttribute('aria-hidden', 'true');
    stage.appendChild(confetti);
  }
  stage.addEventListener('click', celebrateBookiAndShowProgress);
  stage.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      celebrateBookiAndShowProgress();
    }
  });
}

// ─── אנימציית כניסה — בוקי/כפתורים/פס-התקדמות/טקסטים, עד 900ms, פעם בכל כניסה למסך ───

function _playHomeEntranceAnimation() {
  const screen = document.getElementById('screen-main');
  if (!screen) return;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return; // התוכן כבר גלוי במלואו בלי כוריאוגרפיה — אין צורך "לתקן" כלום
  screen.classList.remove('home-enter-play');
  void screen.offsetWidth; // reflow — כדי שהוספה חוזרת של המחלקה תפעיל את האנימציה מחדש
  screen.classList.add('home-enter-play');
}

// ─── משוב לחיצה על קונסולת הקריאה — האזנה גלובלית אחת, נוספת (לא מחליפה) על
//     onclick הניווט הקיים; רק מוסיפה/מסירה class חזותי, לא נוגעת בניתוב ───

(function _wireConsolePressFx() {
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest && e.target.closest('.console-btn');
    if (!btn) return;
    const screen = document.getElementById('screen-main');
    if (!screen || !screen.contains(btn)) return;
    const frame = btn.closest('.console-frame');
    btn.classList.add('btn-fx-press');
    if (frame) frame.classList.add('console-fx-pulse');
    setTimeout(() => {
      btn.classList.remove('btn-fx-press');
      if (frame) frame.classList.remove('console-fx-pulse');
    }, 380);
  }, { passive: true });
})();

// ─── נקודת כניסה יחידה — נקראת מ-_enterPersonalHome/selectStudent/goReaderHome ───

function _initHomeMagic() {
  _renderHomeProgressPanel();
  _renderHomeAchievementCard();
  _renderHomeSpeech();
  _renderHomeShelfShortcuts();
  _wireBookiProgressCharacter();
  _playHomeEntranceAnimation();
}

Object.assign(window, { _initHomeMagic, openBookiProgressDialog, closeBookiProgressDialog, acceptBookiProgressTask });
