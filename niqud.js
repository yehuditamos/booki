/* ═══════════════════════════════════════════════════════════════
   יער הקריאה של בוקי — niqud.js
   הנגשת ניקוד: כפתור קבוע (מוצג בכל מסך, לא רק במסך אחד) שמחליף טקסט
   שסימנו במפורש עם data-nk="...הגרסה המנוקדת..." בין הגרסה הרגילה
   לגרסה המנוקדת. סבב ראשון מכסה רק טקסט ממשק קבוע שאנחנו כותבים בעצמנו
   (כותרות/כפתורים/הנחיות) — לא תוכן סיפורים (חלק מהספריות כבר מנוקד
   בפני עצמו בתוך content/) ולא טקסט שמשתמשים הזינו (שם מועדון/תלמיד),
   שאין דרך אמינה לנקד אוטומטית בלי מנוע חיצוני.
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
}

document.addEventListener('DOMContentLoaded', applyNiqud);

Object.assign(window, { isNiqudOn, applyNiqud, toggleNiqud });
