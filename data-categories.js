/**
 * data-categories.js — מרשם הקטגוריות של בוקי
 *
 * עיקרון: להוסיף קטגוריה חדשה = הוסף רשומה אחת כאן. אפס שינויי קוד.
 *
 * שדות:
 *   id           – מזהה ייחודי (kebab-case). מוסכמה: "{libraryId}-{name}"
 *   libraryId    – מפנה ל-LIBRARIES[].id
 *   label        – שם תצוגה
 *   emoji        – אייקון
 *   description  – תיאור קצר
 *   coverImage   – נתיב לתמונת שער (null אם אין)
 *   order        – סדר תצוגה בתוך הספרייה (קטן = ראשון)
 *   active       – false = מוסתרת
 *
 * שדה ייחודי לספריית "לומדים לקרוא":
 *   niqqudStages – string[] — סימני הניקוד הנלמדים בשלב זה.
 *                  סיפורים מסוננים לפי niqqudMarks שלהם.
 *                  ערכים אפשריים: "patach"|"kamatz"|"hirik"|"segol"|"tzere"|
 *                                 "holam"|"shuruk"|"kubutz"|"shva"|"dagesh"
 */

const CATEGORIES = [

  // ════════════════════════════════════════════════════════
  //  📖 התנ״ך לילדים (libraryId: "tanakh")
  // ════════════════════════════════════════════════════════

  {
    id:          "tanakh-genesis",
    libraryId:   "tanakh",
    label:       "בראשית",
    emoji:       "🌱",
    description: "סיפורי הבריאה, האבות והאמהות",
    coverImage:  null,
    order:       1,
    active:      true,
  },

  {
    id:          "tanakh-exodus",
    libraryId:   "tanakh",
    label:       "שמות",
    emoji:       "🌊",
    description: "משה, יציאת מצרים ומתן תורה",
    coverImage:  null,
    order:       2,
    active:      true,
  },

  {
    id:          "tanakh-judges",
    libraryId:   "tanakh",
    label:       "יהושע ושופטים",
    emoji:       "⚔️",
    description: "כניסה לארץ ישראל וסיפורי הגיבורים",
    coverImage:  null,
    order:       3,
    active:      true,
  },

  {
    id:          "tanakh-kings",
    libraryId:   "tanakh",
    label:       "שמואל ומלכים",
    emoji:       "👑",
    description: "שאול, דוד, שלמה ומלכי ישראל",
    coverImage:  null,
    order:       4,
    active:      true,
  },

  {
    id:          "tanakh-prophets",
    libraryId:   "tanakh",
    label:       "נביאים ומגילות",
    emoji:       "📜",
    description: "אליהו, יונה, רות, אסתר ועוד",
    coverImage:  null,
    order:       5,
    active:      true,
  },

  // ════════════════════════════════════════════════════════
  //  🌍 סיפורי עם מהעולם (libraryId: "folk-tales")
  // ════════════════════════════════════════════════════════

  {
    id:          "folk-europe",
    libraryId:   "folk-tales",
    label:       "אגדות אירופה",
    emoji:       "🏰",
    description: "אחים גרים, אנדרסן ואגדות קלאסיות מאירופה",
    coverImage:  null,
    order:       1,
    active:      true,
  },

  {
    id:          "folk-fables",
    libraryId:   "folk-tales",
    label:       "משלים",
    emoji:       "🦊",
    description: "משלי איזופוס ומשלים מהעולם עם לקח לחיים",
    coverImage:  null,
    order:       2,
    active:      true,
  },

  {
    id:          "folk-princess",
    libraryId:   "folk-tales",
    label:       "סיפורי נסיכות",
    emoji:       "👸",
    description: "נסיכות, נסיכים וממלכות קסומות",
    coverImage:  null,
    order:       3,
    active:      true,
  },

  {
    id:          "folk-magic",
    libraryId:   "folk-tales",
    label:       "סיפורי קסם",
    emoji:       "🪄",
    description: "קסמים, פיות ועולמות פנטסיה",
    coverImage:  null,
    order:       4,
    active:      true,
  },

  {
    id:          "folk-animals",
    libraryId:   "folk-tales",
    label:       "סיפורי חיות",
    emoji:       "🐾",
    description: "חיות חכמות שמלמדות אותנו על החיים",
    coverImage:  null,
    order:       5,
    active:      true,
  },

  {
    id:          "folk-world",
    libraryId:   "folk-tales",
    label:       "סיפורי עמים",
    emoji:       "🌐",
    description: "אגדות מיפן, הודו, אפריקה ועמים נוספים",
    coverImage:  null,
    order:       6,
    active:      true,
  },

  // ════════════════════════════════════════════════════════
  //  📚 לומדים לקרוא (libraryId: "reading-stages")
  //  שלבים לפי רכישת סימני הניקוד
  //  active: false — עתידי
  // ════════════════════════════════════════════════════════

  {
    id:            "rs-patach-kamatz",
    libraryId:     "reading-stages",
    label:         "פתח וקמץ",
    emoji:         "א",
    description:   "סיפורים עם פתח וקמץ בלבד — שלב ראשון",
    coverImage:    null,
    order:         1,
    active:        false,
    niqqudStages:  ["patach", "kamatz"],
  },

  {
    id:            "rs-hirik",
    libraryId:     "reading-stages",
    label:         "חיריק",
    emoji:         "א",
    description:   "סיפורים עם פתח, קמץ וחיריק",
    coverImage:    null,
    order:         2,
    active:        false,
    niqqudStages:  ["patach", "kamatz", "hirik"],
  },

  {
    id:            "rs-segol-tzere",
    libraryId:     "reading-stages",
    label:         "סגול וצירה",
    emoji:         "א",
    description:   "סיפורים עם פתח, קמץ, חיריק, סגול וצירה",
    coverImage:    null,
    order:         3,
    active:        false,
    niqqudStages:  ["patach", "kamatz", "hirik", "segol", "tzere"],
  },

  {
    id:            "rs-holam",
    libraryId:     "reading-stages",
    label:         "חולם",
    emoji:         "א",
    description:   "הוספת החולם",
    coverImage:    null,
    order:         4,
    active:        false,
    niqqudStages:  ["patach", "kamatz", "hirik", "segol", "tzere", "holam"],
  },

  {
    id:            "rs-shuruk-kubutz",
    libraryId:     "reading-stages",
    label:         "שורוק וקובוץ",
    emoji:         "א",
    description:   "הוספת שורוק וקובוץ",
    coverImage:    null,
    order:         5,
    active:        false,
    niqqudStages:  ["patach", "kamatz", "hirik", "segol", "tzere", "holam", "shuruk", "kubutz"],
  },

  {
    id:            "rs-shva",
    libraryId:     "reading-stages",
    label:         "שווא",
    emoji:         "א",
    description:   "הוספת השווא",
    coverImage:    null,
    order:         6,
    active:        false,
    niqqudStages:  ["patach", "kamatz", "hirik", "segol", "tzere", "holam", "shuruk", "kubutz", "shva"],
  },

  {
    id:            "rs-all",
    libraryId:     "reading-stages",
    label:         "כל סימני הניקוד",
    emoji:         "א",
    description:   "סיפורים עם כל סימני הניקוד — קורא עצמאי",
    coverImage:    null,
    order:         7,
    active:        false,
    niqqudStages:  ["patach", "kamatz", "hirik", "segol", "tzere", "holam", "shuruk", "kubutz", "shva", "dagesh"],
  },

  // ════════════════════════════════════════════════════════
  //  ספריות עתידיות נוספות — קטגוריות יתווספו כאן
  //  holidays / chazal / science / animals / history / adventure / booki
  // ════════════════════════════════════════════════════════

];

// ─── פונקציות עזר ────────────────────────────────────────────────────

function getCategoriesForLibrary(libraryId) {
  return CATEGORIES
    .filter(cat => cat.libraryId === libraryId && cat.active)
    .sort((a, b) => a.order - b.order);
}

function getCategoryById(id) {
  return CATEGORIES.find(cat => cat.id === id) ?? null;
}
