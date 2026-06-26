/**
 * stories.js — אגרגטור מרכזי
 *
 * קובץ זה אוסף את כל מערכי הסיפורים מתיקיית content/ לרשימה אחת.
 *
 * להוספת ספרייה חדשה: פרוס את המערך שלה בתוך STORIES למטה.
 * אין לערוך סיפורים כאן — ערוך אותם בקובץ content/ המתאים.
 */

const STORIES = [
  ...(Array.isArray(STORIES_FAMILIAR)   ? STORIES_FAMILIAR   : []),
  ...(Array.isArray(STORIES_ORIGINAL)   ? STORIES_ORIGINAL   : []),
  ...(Array.isArray(STORIES_LONG)       ? STORIES_LONG       : []),
  ...(Array.isArray(STORIES_TANAKH)     ? STORIES_TANAKH     : []),
  ...(Array.isArray(STORIES_FOLK)       ? STORIES_FOLK       : []),
  ...(Array.isArray(STORIES_HOLIDAYS)   ? STORIES_HOLIDAYS   : []),
  ...(Array.isArray(STORIES_CHAZAL)     ? STORIES_CHAZAL     : []),
  ...(Array.isArray(STORIES_SCIENCE)    ? STORIES_SCIENCE    : []),
  ...(Array.isArray(STORIES_ANIMALS)    ? STORIES_ANIMALS    : []),
  ...(Array.isArray(STORIES_HISTORY)    ? STORIES_HISTORY    : []),
  ...(Array.isArray(STORIES_ADVENTURE)  ? STORIES_ADVENTURE  : []),
  ...(Array.isArray(STORIES_BOOKI)      ? STORIES_BOOKI      : []),
  ...(Array.isArray(STORIES_READING)    ? STORIES_READING    : []),
];

// ─── פונקציות עזר ────────────────────────────────────────────────────

function getAllStories() {
  return Array.isArray(STORIES) ? [...STORIES] : [];
}

window.getAllStories = getAllStories;

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
