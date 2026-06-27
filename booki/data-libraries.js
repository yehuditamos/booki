/**
 * data-libraries.js — מרשם הספריות של בוקי
 *
 * עיקרון: להוסיף ספרייה חדשה = הוסף רשומה אחת כאן. אפס שינויי קוד.
 *
 * שדות:
 *   id          – מזהה ייחודי (kebab-case)
 *   label       – שם תצוגה
 *   emoji       – אייקון
 *   description – תיאור קצר
 *   color       – צבע HEX ראשי לתצוגה
 *   coverImage  – נתיב לתמונת שער (null אם אין)
 *   bannerImage – נתיב לתמונת באנר רחב (null אם אין)
 *   idRange     – [min, max] טווח IDים שמורים לסיפורי ספרייה זו
 *   order       – סדר תצוגה (קטן = ראשון)
 *   active      – false = מוסתר עד שמוכן לפרסום
 *   type        – "standard" (ברירת מחדל) | "reading-stages"
 *                 "reading-stages": ספרייה מדורגת לפי שלבי רכישת הניקוד.
 *                 בספרייה מסוג זה, קטגוריות מכילות שדה niqqudStages[],
 *                 וסיפורים מסוננים לפי שדה niqqudMarks[] שלהם.
 */

const LIBRARIES = [

  // ════════════════════════════════════════════════════════
  //  ספריות פעילות — חדשות
  // ════════════════════════════════════════════════════════

  {
    id:          "tanakh",
    label:       "התנ״ך לילדים",
    emoji:       "📖",
    description: "סיפורי התנ״ך הגדולים בשפה פשוטה וברורה לילדים",
    color:       "#8B4513",
    coverImage:  null,
    bannerImage: null,
    idRange:     [101, 199],
    order:       1,
    active:      true,
  },

  {
    id:          "folk-tales",
    label:       "סיפורי עם מהעולם",
    emoji:       "🌍",
    description: "אגדות ומשלים קלאסיים מתרבויות שונות ברחבי העולם",
    color:       "#2E7D32",
    coverImage:  null,
    bannerImage: null,
    idRange:     [201, 299],
    order:       2,
    active:      true,
  },

  // ════════════════════════════════════════════════════════
  //  ספריות קיימות (מיפוי אחורי לסיפורים id 1–99)
  // ════════════════════════════════════════════════════════

  {
    id:          "familiar",
    label:       "מוכרים",
    emoji:       "⭐",
    description: "סיפורי ילדים קלאסיים שכל ילד מכיר",
    color:       "#F39C12",
    coverImage:  null,
    bannerImage: null,
    idRange:     [1, 49],
    order:       10,
    active:      true,
  },

  {
    id:          "original",
    label:       "מקוריים",
    emoji:       "✍️",
    description: "סיפורים מקוריים שנכתבו במיוחד לבוקי",
    color:       "#8E44AD",
    coverImage:  null,
    bannerImage: null,
    idRange:     [50, 79],
    order:       11,
    active:      true,
  },

  {
    id:          "long",
    label:       "ארוכים",
    emoji:       "📘",
    description: "סיפורים ארוכים לקוראים מתקדמים",
    color:       "#2980B9",
    coverImage:  null,
    bannerImage: null,
    idRange:     [80, 99],
    order:       12,
    active:      true,
  },

  // ════════════════════════════════════════════════════════
  //  ספריות עתידיות — תשתית מוכנה, active: false
  //  לפרסום: שנה ל-active: true והוסף קטגוריות + סיפורים
  // ════════════════════════════════════════════════════════

  {
    id:          "holidays",
    label:       "חגי ישראל",
    emoji:       "🕯️",
    description: "סיפורים לכל חג מחגי ישראל",
    color:       "#1A237E",
    coverImage:  null,
    bannerImage: null,
    idRange:     [301, 399],
    order:       3,
    active:      false,
  },

  {
    id:          "chazal",
    label:       "סיפורי חז״ל",
    emoji:       "🕍",
    description: "אגדות ומשלים מתורת חכמינו",
    color:       "#4A148C",
    coverImage:  null,
    bannerImage: null,
    idRange:     [401, 499],
    order:       4,
    active:      false,
  },

  {
    id:          "science",
    label:       "מדע",
    emoji:       "🚀",
    description: "סיפורי מדע ותגליות לילדים סקרנים",
    color:       "#006064",
    coverImage:  null,
    bannerImage: null,
    idRange:     [501, 599],
    order:       5,
    active:      false,
  },

  {
    id:          "animals",
    label:       "סיפורי חיות",
    emoji:       "🐾",
    description: "סיפורים על בעלי חיים מרחבי הטבע",
    color:       "#1B5E20",
    coverImage:  null,
    bannerImage: null,
    idRange:     [601, 699],
    order:       6,
    active:      false,
  },

  {
    id:          "history",
    label:       "היסטוריה",
    emoji:       "🏰",
    description: "סיפורים היסטוריים על גיבורים ותקופות מרתקות",
    color:       "#BF360C",
    coverImage:  null,
    bannerImage: null,
    idRange:     [701, 799],
    order:       7,
    active:      false,
  },

  {
    id:          "adventure",
    label:       "הרפתקאות",
    emoji:       "🧭",
    description: "סיפורי הרפתקאות ומסעות מרגשים",
    color:       "#E65100",
    coverImage:  null,
    bannerImage: null,
    idRange:     [801, 899],
    order:       8,
    active:      false,
  },

  {
    id:          "booki",
    label:       "סיפורים מקוריים בוקי",
    emoji:       "✨",
    description: "סיפורים חדשים שנכתבו במיוחד לילדי בוקי",
    color:       "#880E4F",
    coverImage:  null,
    bannerImage: null,
    idRange:     [901, 999],
    order:       9,
    active:      false,
  },

  {
    id:          "reading-stages",
    label:       "לומדים לקרוא",
    emoji:       "📚",
    description: "סיפורים המותאמים לשלבי רכישת הניקוד בבית הספר",
    color:       "#00695C",
    coverImage:  null,
    bannerImage: null,
    idRange:     [1001, 1099],
    order:       13,
    active:      false,
    type:        "reading-stages",   // ספרייה מדורגת לפי שלבי ניקוד
  },

];

// ─── פונקציות עזר ────────────────────────────────────────────────────

function getActiveLibraries() {
  return [...LIBRARIES]
    .filter(lib => lib.active)
    .sort((a, b) => a.order - b.order);
}

function getLibraryById(id) {
  return LIBRARIES.find(lib => lib.id === id) ?? null;
}
