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

  const weekEl = document.getElementById('home-progress-week');
  if (weekEl) weekEl.textContent = _nkPick(`📚 השבוע: ${p.weeklyMinutes} דקות`, `📚 הַשָּׁבוּעַ: ${p.weeklyMinutes} דַּקּוֹת`);

  const fillEl = document.getElementById('home-progress-fill');
  if (fillEl) fillEl.style.width = p.pct + '%';

  const rankEl = document.getElementById('home-progress-rank');
  if (rankEl) rankEl.textContent = `${p.rank.icon} ${_nkPick(p.rank.name, p.rank.nameNk || p.rank.name)}`;

  const remainEl = document.getElementById('home-progress-remaining');
  if (remainEl) {
    if (p.next && p.remaining > 0) {
      const nextName = _nkPick(p.next.name, p.next.nameNk || p.next.name);
      remainEl.textContent = _nkPick(`עוד ${p.remaining} ד' ל${p.next.name}`, `עוֹד ${p.remaining} ד' לְ${nextName}`);
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
  el.textContent = _homeSpeechPool()[0];
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
  _playHomeEntranceAnimation();
}

Object.assign(window, { _initHomeMagic });
