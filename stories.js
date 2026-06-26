/**
 * stories.js — אגרגטור מרכזי
 *
 * קובץ זה אוסף את כל מערכי הסיפורים מתיקיית content/ לרשימה אחת.
 *
 * להוספת ספרייה חדשה: פרוס את המערך שלה בתוך STORIES למטה.
 * אין לערוך סיפורים כאן — ערוך אותם בקובץ content/ המתאים.
 */

const STORIES = [
  ...STORIES_FAMILIAR,    // content/stories-familiar.js  — 1–49
  ...STORIES_ORIGINAL,    // content/stories-original.js  — 50–79
  ...STORIES_LONG,        // content/stories-long.js      — 80–99
  ...STORIES_TANAKH,      // content/stories-tanakh.js    — 101–199
  ...STORIES_FOLK,        // content/stories-folk.js      — 201–299
  ...STORIES_HOLIDAYS,    // content/stories-holidays.js  — 301–399
  ...STORIES_CHAZAL,      // content/stories-chazal.js    — 401–499
  ...STORIES_SCIENCE,     // content/stories-science.js   — 501–599
  ...STORIES_ANIMALS,     // content/stories-animals.js   — 601–699
  ...STORIES_HISTORY,     // content/stories-history.js   — 701–799
  ...STORIES_ADVENTURE,   // content/stories-adventure.js — 801–899
  ...STORIES_BOOKI,       // content/stories-booki.js     — 901–999
  ...STORIES_READING,     // content/stories-reading.js   — 1001–1099
];

// ─── פונקציות עזר ────────────────────────────────────────────────────

function getAllStories() {
  return [...STORIES];
}

// מחפש לפי id (string slug) או legacyId (מספר) — תאימות אחורה עם Firebase
function getStoryById(id) {
  return STORIES.find(s => s.id === id || s.legacyId === id) ?? null;
}

function getStoriesByCategory(category) {
  return STORIES.filter(s => s.category === category);
}

function getStoriesByLibrary(libraryId) {
  return STORIES.filter(s => s.libraryId === libraryId);
}

function getStoriesByLibraryAndCategory(libraryId, categoryId) {
  return STORIES.filter(s => s.libraryId === libraryId && s.categoryId === categoryId);
}

function getStoriesByTags(tags = []) {
  if (!tags.length) return [...STORIES];
  return STORIES.filter(s => tags.every(t => s.tags.includes(t)));
}

// ─── ולידציה פנימית (רצה פעם אחת בטעינה) ────────────────────────────
(function validateStories() {
  const issues = [];

  STORIES.forEach(s => {
    if (s.id === undefined || s.id === null || s.id === '')
      issues.push(`סיפור חסר id`);
    if (!s.title)
      issues.push(`סיפור "${s.id}" חסר title`);
    if (!s.category && !s.libraryId)
      issues.push(`סיפור "${s.id}" חסר category ו-libraryId`);
    if (!Array.isArray(s.pages))
      issues.push(`סיפור "${s.id}" — pages אינו מערך`);
    else if (s.pages.length === 0)
      issues.push(`סיפור "${s.id}" — pages ריק`);
    else s.pages.forEach((p, pi) => {
      if (!p.text)           issues.push(`סיפור "${s.id}" עמוד ${pi + 1} חסר text`);
      if (!p.readingMinutes) issues.push(`סיפור "${s.id}" עמוד ${pi + 1} חסר readingMinutes`);
    });
  });

  // כותרות כפולות
  const titles = STORIES.map(s => s.title);
  titles.forEach((t, i) => {
    if (titles.indexOf(t) !== i) issues.push(`כותרת כפולה: "${t}"`);
  });

  // IDs כפולים (string)
  const ids = STORIES.map(s => s.id);
  ids.forEach((id, i) => {
    if (ids.indexOf(id) !== i) issues.push(`id כפול: "${id}"`);
  });

  // legacyIds כפולים (אם קיים)
  const legacyIds = STORIES.filter(s => s.legacyId !== undefined).map(s => s.legacyId);
  legacyIds.forEach((id, i) => {
    if (legacyIds.indexOf(id) !== i) issues.push(`legacyId כפול: ${id}`);
  });

  if (issues.length) {
    console.warn('[stories.js] ⚠️ בעיות שנמצאו:', issues);
  } else {
    console.log(`[stories.js] ✅ ${STORIES.length} סיפורים — כל הבדיקות עברו בהצלחה`);
  }
})();
