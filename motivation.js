/* ═══════════════════════════════════════════════════════════════
   יער הקריאה של בוקי — motivation.js
   מערכת מוטיבציה: התקדמות אישית ושיתוף פעולה כיתתי — לעולם לא השוואה.
   בונה על RANKS/getRank/getNextRank הקיימים ב-script.js.
═══════════════════════════════════════════════════════════════ */

function _dayIndex() {
  return Math.floor(Date.now() / 86400000);
}

// ─── דרגות קריאה אישיות (Task 5) ──────────────────────────────────────

function getReadingLevelInfo(totalMinutes) {
  const mins  = totalMinutes || 0;
  const rank  = getRank(mins);
  const next  = getNextRank(mins);
  const pct   = next ? Math.min(100, Math.round((mins / next.min) * 100)) : 100;
  const badges = RANKS.filter(r => mins >= r.min);
  return { rank, next, pct, badges };
}

/** מחזיר את הדרגה החדשה אם המעבר מ-prevMinutes ל-newMinutes חצה סף דרגה, אחרת null. */
function detectLevelUp(prevMinutes, newMinutes) {
  const before = getRank(prevMinutes || 0);
  const after  = getRank(newMinutes || 0);
  return after.min > before.min ? after : null;
}

function computePersonalBest(history) {
  if (!Array.isArray(history) || !history.length) return 0;
  return history.reduce((best, h) => Math.max(best, h.minutes || 0), 0);
}

/** סופר ימים רצופים (כולל היום) עם רשומת קריאה אחת לפחות, לפי h.date (todayStr() format). */
function computeStreakDays(history) {
  if (!Array.isArray(history) || !history.length) return 0;
  const days = new Set(history.map(h => h.date).filter(Boolean));
  let streak = 0;
  const d = new Date();
  while (days.has(d.toLocaleDateString('he-IL'))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// ─── הודעות מוטיבציה כיתתיות (Task 3C) — התקדמות משותפת בלבד, ללא שמות/דירוג ──

const _CLASS_MOTIVATION_POOL = [
  { cond: ({ totalMins }) => totalMins > 0,
    text: ({ totalMins }) => `יחד קראתם כבר ${totalMins} דקות! 🌳` },
  { cond: ({ totalMins, goalTarget }) => goalTarget > totalMins,
    text: ({ totalMins, goalTarget }) => `עוד ${goalTarget - totalMins} דקות ומגיעים ליעד הכיתה! 🎯` },
  { cond: ({ totalMins, goalTarget }) => goalTarget > 0 && totalMins >= goalTarget,
    text: () => `כל הכבוד! הכיתה הגיעה ליעד המשותף! 🎉` },
  { cond: () => true,
    text: () => `כל דקת קריאה של כל חבר וחברה מקרבת את כל הכיתה קדימה! 🤝` },
];

function pickClassMotivationMessage({ totalMins = 0, goalTarget = 0 } = {}) {
  const ctx = { totalMins, goalTarget };
  const eligible = _CLASS_MOTIVATION_POOL.filter(m => m.cond(ctx));
  const pool = eligible.length ? eligible : _CLASS_MOTIVATION_POOL.slice(-1);
  const pick = pool[_dayIndex() % pool.length];
  return pick.text(ctx);
}

// ─── עידוד אישי — מסך סיום (Task 4, רטרוספקטיבי: "היום/עכשיו קרה") ──────────

const _PERSONAL_ENCOURAGEMENT_POOL = [
  { cond: ({ streakDays })       => streakDays >= 2,
    text: ({ streakDays })       => `🔥 שמרת על רצף של ${streakDays} ימי קריאה!` },
  { cond: ({ vsLastWeekBetter }) => !!vsLastWeekBetter,
    text: () => `📈 קראת יותר מהשבוע שעבר. איזה יופי!` },
  { cond: ({ clubShopActive, shopRemaining }) => clubShopActive && shopRemaining > 0,
    text: () => `🎁 הדקות שהוספת היום קרבו את הכיתה לפתיחת החנות!` },
  { cond: ({ justEarnedPoints }) => justEarnedPoints > 0,
    text: ({ justEarnedPoints }) => `⭐ צברת ${justEarnedPoints} נקודות היום!` },
  { cond: () => true,
    text: () => `🌟 כל הכבוד על הקריאה היום!` },
];

/** בוחר הודעה אחת (לא רשימה) — כדי לא להציף ילד/ה בטקסט. */
function pickPersonalEncouragement(ctx = {}) {
  const match = _PERSONAL_ENCOURAGEMENT_POOL.find(m => m.cond(ctx));
  return (match || _PERSONAL_ENCOURAGEMENT_POOL[_PERSONAL_ENCOURAGEMENT_POOL.length - 1]).text(ctx);
}

// ─── עידוד למסך הבית (Task 4, פרוספקטיבי: "היום/בוא נ..." — לעולם לא על מה שכבר קרה) ──

const _HOME_GREETING_POOL = [
  `📖 היום זה יום מצוין לקרוא עוד קצת!`,
  `🌳 בואו נראה כמה העץ של הכיתה יגדל היום!`,
  `✨ כל עמוד הוא הרפתקה חדשה — מוכנים להתחיל?`,
  `🎈 מוכנים לסיפור הבא?`,
  `🌟 היום היא הזדמנות מצוינת לגלות סיפור חדש!`,
];

function pickHomeGreetingMessage() {
  return _HOME_GREETING_POOL[_dayIndex() % _HOME_GREETING_POOL.length];
}

function renderHomeEncouragement() {
  const el = document.getElementById('home-encouragement');
  if (el) el.textContent = pickHomeGreetingMessage();
}
