/* ═══════════════════════════════════════════════════════════════
   יער הקריאה של בוקי — niqud.js
   הנגשת ניקוד: כפתור קבוע (מוצג בכל מסך, לא רק במסך אחד) שמחליף טקסט
   שסימנו במפורש עם data-nk="...הגרסה המנוקדת..." בין הגרסה הרגילה
   לגרסה המנוקדת — מכסה טקסט ממשק קבוע שאנחנו כותבים בעצמנו (כותרות/
   כפתורים/הנחיות). לא טקסט שמשתמשים הזינו (שם מועדון/תלמיד), שאין דרך
   אמינה לנקד אוטומטית בלי מנוע חיצוני.
   טקסט סיפורים (content/): ספריות שכתובות עם ניקוד קבוע במקור מוצגות
   מנוקדות כשדלוק, ועם הניקוד מוסר (stripNiqud — פעולה בטוחה וחד-כיוונית)
   כשכבוי — ר' renderReaderPage ב-script.js. ספריות שנכתבו בלי ניקוד
   מלכתחילה (למשל תולעי ספרים) לא מושפעות מהכפתור עד שינוקדו במקור.
   מצב (דלוק/כבוי) נשמר ב-localStorage; מוחל מחדש בכל מסך חדש דרך
   showScreen() (script.js), כך שגם תוכן שנוצר דינמית ומתויג ב-data-nk
   (innerHTML-templates) מקבל את הניקוד בלי לוגיקה נוספת בצד הקורא.
═══════════════════════════════════════════════════════════════ */

const _NIQUD_KEY = 'booki_niqud_on';

// ברירת מחדל: דלוק. קורא מתחיל שנתקל בטקסט לא-מנוקד לא אמור לגלות קודם כפתור
// נסתר כדי לפתור את זה — מי שכבר יודע/ה לקרוא בלי ניקוד יכבה בעצמו/ה פעם אחת,
// וההעדפה נשמרת (localStorage) מאותו רגע והלאה.
function isNiqudOn() {
  try {
    const v = localStorage.getItem(_NIQUD_KEY);
    return v === null ? true : v === '1';
  } catch { return true; }
}

// מסיר סימני ניקוד/טעמים (U+0591–U+05C7) מטקסט מנוקד — פעולה בטוחה וחד-משמעית
// (בניגוד להוספת ניקוד, שדורשת ידע לשוני אמיתי ולא ניתן לעשות אותה אוטומטית
// באמינות). משמש להצגת גרסה לא-מנוקדת של תוכן שכתוב עם ניקוד קבוע בקובץ המקור
// (טקסט סיפורים). Bug fix: באותו טווח יוניקוד יש גם שלושה תווי פיסוק (לא ניקוד!)
// — מקף עברי (־ U+05BE), פסק (׀ U+05C0) וסוף פסוק (׃ U+05C3) — שהיו נמחקים בטעות
// (לדוגמה "רַב־הַחוֹבֵל" הופך ל"רבהחובל" בלי המקף). אלה מוחרגים במפורש.
const _NIQUD_KEEP_PUNCT = new Set(['־', '׀', '׃']);
function stripNiqud(text) {
  return typeof text === 'string'
    ? text.replace(/[֑-ׇ]/g, c => _NIQUD_KEEP_PUNCT.has(c) ? c : '')
    : text;
}

function applyNiqud() {
  const on = isNiqudOn();
  document.querySelectorAll('[data-nk]').forEach(el => {
    if (el.dataset.plain === undefined) el.dataset.plain = el.textContent;
    el.textContent = on ? el.dataset.nk : el.dataset.plain;
  });
  const btn = document.getElementById('btn-niqud-toggle');
  if (btn) btn.classList.toggle('niqud-active', on);
}

function toggleNiqud() {
  const next = !isNiqudOn();
  try { localStorage.setItem(_NIQUD_KEY, next ? '1' : '0'); } catch {}
  applyNiqud();
  // תוכן דינמי (בועת הדיבור/פס ההתקדמות/כרטיס ההישג של מסך הבית) לא עובר
  // דרך data-nk כי מכיל מספרים משתנים — מרענן ידנית כדי שההחלפה תיראה מיד,
  // לא רק בכניסה הבאה למסך. בטוח לקרוא גם כשהפונקציות/המסך לא קיימים.
  if (typeof _renderHomeSpeech === 'function') _renderHomeSpeech();
  if (typeof _renderHomeProgressPanel === 'function') _renderHomeProgressPanel();
  if (typeof _renderHomeAchievementCard === 'function') _renderHomeAchievementCard();
  // עמוד סיפור פתוח כרגע — מרענן מיד כדי שהחלפת הניקוד תיראה בלי לצאת ולהיכנס לעמוד.
  if (typeof renderReaderPage === 'function' && typeof currentStory !== 'undefined' && currentStory) renderReaderPage();
}

document.addEventListener('DOMContentLoaded', applyNiqud);

Object.assign(window, { isNiqudOn, applyNiqud, toggleNiqud });
