# ארכיטקטורת בוקי — מסמך ייחוס

> מסמך זה הוא אמת היחידה של הפרויקט.
> כל החלטת ארכיטקטורה מתועדת כאן. לפני כל שינוי מבני — עדכן מסמך זה קודם.

---

## חזון בוקי

בוקי אינה אפליקציית קריאה.
בוקי היא **ספריית הקריאה הדיגיטלית של הילד הישראלי**.

המטרה: לגרום לילדים לבחור לקרוא מרצונם, לחזור לקרוא שוב ושוב
ולהעדיף קריאה על פני זמן מסך.

---

## חוקת בוקי

1. **בוקי קיימת כדי לעודד ילדים לבחור לקרוא.**
2. **כל פיתוח חדש נבחן לפי שאלה אחת:**
   *"האם הוא יגרום לילד לרצות לקרוא עוד 10 דקות?"*
   אם כן — נוסיף. אם לא — הוא כנראה לא חלק מלב בוקי.
3. **כל ספר חדש נכנס דרך מודל הנתונים בלבד** — ללא שינוי קוד.
4. **כל ספר חייב לכלול שאלות להבנת הנקרא וערך חינוכי מרכזי.**
5. **אין להשתמש בתוכן המוגן בזכויות יוצרים.**
6. **כל הסיפורים החדשים יהיו מקוריים או מבוססים על מקורות בנחלת הכלל**
   (תנ"ך, חז"ל, אגדות עם, האחים גרים, אנדרסן, איזופוס וכד׳).

---

## עיקרון הבסיס: Data-Driven לחלוטין

הקוד **אינו מכיר** ספריות, קטגוריות או סיפורים ספציפיים.
הוא יודע רק **איך לרנדר** אותם.

```
data-libraries.js   ← מי הספריות?
data-categories.js  ← מי הקטגוריות?
stories.js          ← מה הסיפורים?

script.js           ← קורא מהנתונים ובונה UI דינמית
```

| פעולה | שינוי נדרש |
|-------|-----------|
| ספרייה חדשה | שורה אחת ב-`data-libraries.js` בלבד |
| קטגוריה חדשה | שורה אחת ב-`data-categories.js` בלבד |
| סיפור חדש | אובייקט אחד ב-`stories.js` בלבד |
| הסתרת ספרייה | `active: false` ב-`data-libraries.js` |
| שינוי סדר תצוגה | עדכון `order` בלבד |

---

## מבנה הקבצים

```
booki/
├── data-libraries.js           ← מרשם הספריות
├── data-categories.js          ← מרשם הקטגוריות
├── stories.js                  ← אגרגטור — מאחד את כל קבצי content/
├── content/
│   ├── stories-familiar.js     ← סיפורים מוכרים    (id 1–49,   slug: familiar-*)
│   ├── stories-original.js     ← סיפורים מקוריים   (id 50–79,  slug: original-*)
│   ├── stories-long.js         ← סיפורים ארוכים    (id 80–99,  slug: long-*)
│   ├── stories-tanakh.js       ← התנ״ך לילדים      (id 101–199, slug: tanakh-*)
│   ├── stories-folk.js         ← סיפורי עם         (id 201–299, slug: folk-*)
│   ├── stories-holidays.js     ← חגי ישראל         (id 301–399)
│   ├── stories-chazal.js       ← סיפורי חז״ל       (id 401–499)
│   ├── stories-science.js      ← מדע               (id 501–599)
│   ├── stories-animals.js      ← סיפורי חיות       (id 601–699)
│   ├── stories-history.js      ← היסטוריה          (id 701–799)
│   ├── stories-adventure.js    ← הרפתקאות          (id 801–899)
│   ├── stories-booki.js        ← סיפורי בוקי       (id 901–999)
│   └── stories-reading.js      ← לומדים לקרוא      (id 1001–1099)
├── firebase.js                 ← שכבת הנתונים הדינמית (Firebase Firestore)
├── script.js                   ← לוגיקת האפליקציה והממשק
├── index.html                  ← מבנה HTML
├── style.css                   ← עיצוב
└── BOOKI_ARCHITECTURE.md       ← מסמך זה
```

### סדר טעינת הסקריפטים ב-index.html

```html
<script src="firebase.js"></script>                  <!-- 1. Firebase -->
<script src="data-libraries.js"></script>            <!-- 2. ספריות -->
<script src="data-categories.js"></script>           <!-- 3. קטגוריות -->
<script src="content/stories-familiar.js"></script>  <!-- 4. תוכן (סדר לא חשוב) -->
<!-- ... שאר קבצי content/ ... -->
<script src="stories.js"></script>                   <!-- 5. אגרגטור -->
<script src="script.js"></script>                    <!-- 6. לוגיקה -->
```

---

## מודל הנתונים המלא

### 1. ספרייה — Library

```javascript
{
  id:          string,   // מזהה ייחודי, kebab-case. דוגמה: "tanakh"
  label:       string,   // שם תצוגה. דוגמה: "התנ״ך לילדים"
  emoji:       string,   // אייקון. דוגמה: "📖"
  description: string,   // תיאור קצר לתצוגה בממשק
  color:       string,   // צבע HEX ראשי. דוגמה: "#8B4513"
  coverImage:  string|null,  // נתיב לתמונת שער (null אם אין עדיין)
  bannerImage: string|null,  // נתיב לתמונת באנר רחב (null אם אין עדיין)
  idRange:     [number, number],  // טווח IDים שמורים לסיפורי ספרייה זו
  order:       number,   // סדר תצוגה (עולה — קטן = ראשון)
  active:      boolean,  // false = מוסתר עד שמוכן לפרסום
}
```

### 2. קטגוריה — Category

```javascript
{
  id:          string,   // מזהה ייחודי. דוגמה: "tanakh-genesis"
  libraryId:   string,   // מפנה ל-LIBRARIES[].id
  label:       string,   // שם תצוגה. דוגמה: "בראשית"
  emoji:       string,   // אייקון
  description: string,   // תיאור קצר
  coverImage:  string|null,  // נתיב לתמונת שער
  order:       number,   // סדר תצוגה בתוך הספרייה
  active:      boolean,  // false = מוסתרת
}
```

### 3. סיפור — Story

```javascript
{
  // ─── זהות ──────────────────────────────────────────────────
  id:         number,    // מזהה ייחודי (בטווח הספרייה — ראה הקצאת IDים)
  title:      string,    // כותרת מנוקדת. דוגמה: "נֹחַ וְהַתֵּבָה"

  // ─── מיקום בספרייה ─────────────────────────────────────────
  libraryId:  string,    // מפנה ל-LIBRARIES[].id
  categoryId: string,    // מפנה ל-CATEGORIES[].id

  // ─── תצוגה ─────────────────────────────────────────────────
  emoji:      string,    // אייקון
  coverImage: string|null, // נתיב לתמונת שער

  // ─── פרופיל קריאה ──────────────────────────────────────────
  ageMin:           number,  // גיל מינימום (שנים)
  ageMax:           number,  // גיל מקסימום
  readingLevel:     string,  // "א" | "א-ב" | "ב"
  estimatedMinutes: number,  // זמן קריאה משוער בדקות
  difficulty:       number,  // קושי 1 (קל) עד 5 (מאתגר)

  // ─── שלבי ניקוד (אופציונלי — רלוונטי לכל הספריות) ─────────
  niqqudMarks: string[],  // סימני הניקוד המופיעים בסיפור.
  // ערכים: "patach"|"kamatz"|"hirik"|"segol"|"tzere"|
  //        "holam"|"shuruk"|"kubutz"|"shva"|"dagesh"
  // דוגמה: ["patach","kamatz","hirik"]
  // שדה זה מאפשר סינון לפי שלב לימוד הקריאה בכל ספרייה.

  // ─── תוכן עריכתי ───────────────────────────────────────────
  summary:   string,   // תקציר 1–2 משפטים
  coreValue: string,   // ערך אחד: אמונה|אומץ|חברות|משפחה|כבוד|התמדה|נדיבות|אחריות|יושר

  // ─── תגיות ─────────────────────────────────────────────────
  tags:     string[],  // תגיות לחיפוש וסינון. דוגמה: ["מבול","חיות"]
  moodTags: string[],  // אווירה: "מצחיק"|"מרגש"|"מותח"|"לפני השינה"|"לימודי"|"מעורר השראה"

  // ─── כלים פדגוגיים ─────────────────────────────────────────
  challengingWords: [       // מילים מאתגרות
    { word: string, definition: string }
  ],
  comprehensionQuestions: string[],  // שאלות להבנת הנקרא (2–4 שאלות)

  // ─── עמודי הסיפור ──────────────────────────────────────────
  pages: [
    { text: string, readingMinutes: number }
  ],

  // ─── מטא-נתונים ────────────────────────────────────────────
  createdAt: string,   // ISO 8601. דוגמה: "2025-09-01"
  updatedAt: string,   // ISO 8601. עדכן בכל שינוי בתוכן
}
```

> **הערה: שדה `stats` (reads, likes, completionRate)**
>
> נתונים אלה הם **דינמיים** — הם משתנים בכל פתיחת סיפור.
> הם **אינם** נשמרים ב-`stories.js` (קובץ סטטי).
> הם מנוהלים על-ידי **Firebase Firestore** בנתיב:
> `classes/{classId}/storyStats/{storyId}`
>
> מבנה הרשומה ב-Firebase:
> ```javascript
> { storyId: number, reads: number, likes: number, completionRate: number }
> ```

---

## הקצאת טווחי ID לסיפורים

| טווח | ספרייה | סטטוס |
|------|--------|--------|
| 1–99 | ספריות קיימות (מוכרים / מקוריים / ארוכים) | פעיל |
| 101–199 | התנ״ך לילדים | פעיל |
| 201–299 | סיפורי עם מהעולם | פעיל |
| 301–399 | חגי ישראל | עתידי |
| 401–499 | סיפורי חז״ל | עתידי |
| 501–599 | מדע | עתידי |
| 601–699 | סיפורי חיות | עתידי |
| 701–799 | היסטוריה | עתידי |
| 801–899 | הרפתקאות | עתידי |
| 901–999 | סיפורים מקוריים של בוקי | עתידי |
| 1001–1099 | לומדים לקרוא | עתידי |

---

## מוסכמת מזהי סיפורים (Slug IDs)

מזהי הסיפורים הם מחרוזות קריאות ויציבות בפורמט: `{libraryId}-{שם-תיאורי}`

| ספרייה | דוגמאות |
|--------|---------|
| familiar | `familiar-three-bears`, `familiar-cinderella` |
| original | `original-good-dog`, `original-red-fish` |
| long | `long-bear-birthday`, `long-sea-journey` |
| tanakh | `tanakh-noah`, `tanakh-moses-basket` |
| folk-tales | `folk-red-riding-hood`, `folk-puss-boots` |
| reading-stages | `reading-patach-001`, `reading-hirik-003` |

### שדה legacyId

סיפורים שהיו במערכת לפני המעבר למזהי slug שומרים שדה `legacyId` עם המזהה המספרי הישן.
שדה זה נחוץ לתאימות אחורה עם היסטוריית קריאה ישנה ב-Firebase.

```javascript
{
  id:       "familiar-three-bears",   // מזהה חדש — קבוע לנצח
  legacyId: 1,                        // מזהה ישן — לתאימות אחורה בלבד
  // ...
}
```

`getStoryById(id)` מחפש לפי שני השדות אוטומטית.
סיפורים חדשים (id 101+) אינם זקוקים ל-`legacyId`.

---

## מדריך הוספת תוכן

### הוספת ספרייה חדשה (0 שינויי קוד)

הוסף לתחתית `data-libraries.js`:

```javascript
{
  id:          "my-new-library",
  label:       "שם הספרייה",
  emoji:       "📚",
  description: "תיאור קצר",
  color:       "#123456",
  coverImage:  null,
  bannerImage: null,
  idRange:     [1001, 1099],  // טווח פנוי חדש
  order:       20,
  active:      false,         // שנה ל-true כשמוכן לפרסום
}
```

### הוספת קטגוריה חדשה (0 שינויי קוד)

הוסף ל-`data-categories.js`:

```javascript
{
  id:          "my-new-library-section1",
  libraryId:   "my-new-library",
  label:       "שם הקטגוריה",
  emoji:       "🌟",
  description: "",
  coverImage:  null,
  order:       1,
  active:      true,
}
```

### הוספת סיפור חדש (0 שינויי קוד)

הוסף ל-`stories.js`:

```javascript
{
  id:               1001,
  title:            "כֹּתֶרֶת הַסִּיפּוּר",
  libraryId:        "my-new-library",
  categoryId:       "my-new-library-section1",
  emoji:            "📖",
  coverImage:       null,
  ageMin:           6,
  ageMax:           8,
  readingLevel:     "א",
  estimatedMinutes: 5,
  difficulty:       2,
  summary:          "תקציר קצר של הסיפור.",
  coreValue:        "אומץ",
  tags:             ["תג1", "תג2"],
  moodTags:         ["מרגש"],
  challengingWords: [],
  comprehensionQuestions: [],
  pages:            [
    { text: "...", readingMinutes: 0.5 },
  ],
  createdAt:        "2025-09-01",
  updatedAt:        "2025-09-01",
}
```

---

## לוגיקת UI — Data-Driven

הממשק בונה את עצמו דינמית מהנתונים:

```javascript
// בניית ניווט ספריות — הקוד לא יודע מה הספריות
LIBRARIES
  .filter(lib => lib.active)
  .sort((a, b) => a.order - b.order)
  .forEach(lib => renderLibraryTab(lib));

// בניית טאבי קטגוריות לפי ספרייה נבחרת
CATEGORIES
  .filter(cat => cat.libraryId === selectedLibraryId && cat.active)
  .sort((a, b) => a.order - b.order)
  .forEach(cat => renderCategoryTab(cat));

// הצגת סיפורים לפי ספרייה + קטגוריה
STORIES
  .filter(s => s.libraryId === selectedLibraryId && s.categoryId === selectedCategoryId)
  .forEach(s => renderStoryCard(s));
```

---

## עקרונות טכניים

| עיקרון | תיאור |
|--------|-------|
| **Static-first** | נתוני תוכן (ספריות, סיפורים) הם קבצי JS סטטיים — אין שרת לתוכן |
| **Firebase לדינמי** | נתוני תלמידים, קריאה, סטטיסטיקות — Firebase Firestore בלבד |
| **אין hardcode** | אין שמות ספריות/קטגוריות מוגדרים בקוד הלוגי |
| **ניקוד מלא** | כל טקסטי הסיפורים מנוקדים |
| **RTL-first** | כל הממשק מימין לשמאל |
| **Progressive disclosure** | ספריות עם `active: false` מוכנות בתשתית אך לא מוצגות |
| **ID ranges** | כל ספרייה שומרת טווח ID ייחודי — מונע התנגשויות |

---

## ספריות הפרויקט

### ספריות פעילות

| ספרייה | ID | טווח | סוג |
|--------|-----|------|-----|
| מוכרים (קיים) | familiar | 1–49 | standard |
| מקוריים (קיים) | original | 50–79 | standard |
| ארוכים (קיים) | long | 80–99 | standard |
| התנ״ך לילדים | tanakh | 101–199 | standard |
| סיפורי עם מהעולם | folk-tales | 201–299 | standard |

### ספריות עתידיות (תשתית מוכנה)

| ספרייה | ID | טווח | סוג |
|--------|-----|------|-----|
| חגי ישראל | holidays | 301–399 | standard |
| סיפורי חז״ל | chazal | 401–499 | standard |
| מדע | science | 501–599 | standard |
| סיפורי חיות | animals | 601–699 | standard |
| היסטוריה | history | 701–799 | standard |
| הרפתקאות | adventure | 801–899 | standard |
| סיפורים מקוריים בוקי | booki | 901–999 | standard |
| לומדים לקרוא | reading-stages | 1001–1099 | reading-stages |

---

## ספרייה מסוג reading-stages — לומדים לקרוא

ספרייה זו שונה מכל האחרות: הקטגוריות שלה הן **שלבי רכישת הניקוד** בבית הספר,
ולא נושאים תוכניים.

### מבנה קטגוריה מסוג reading-stages

```javascript
{
  id:           "rs-patach-kamatz",
  libraryId:    "reading-stages",
  label:        "פתח וקמץ",
  niqqudStages: ["patach", "kamatz"],  // סימני הניקוד המותרים בשלב זה
  // ... שאר השדות הרגילים
}
```

### ערכי niqqudMarks האפשריים

| ערך | שם | שלב |
|-----|----|-----|
| `patach` | פַּתַח | 1 |
| `kamatz` | קָמַץ | 1 |
| `hirik` | חִירִיק | 2 |
| `segol` | סֶגוֹל | 3 |
| `tzere` | צֵירֵי | 3 |
| `holam` | חוֹלָם | 4 |
| `shuruk` | שׁוּרוּק | 5 |
| `kubutz` | קֻבּוּץ | 5 |
| `shva` | שְׁוָא | 6 |
| `dagesh` | דָּגֵשׁ | 7 |

### שימוש: סינון סיפורים לפי שלב

```javascript
// מציאת כל הסיפורים שמתאימים לשלב "פתח וקמץ"
const stage = getCategoryById("rs-patach-kamatz"); // niqqudStages: ["patach","kamatz"]
const suitable = STORIES.filter(s =>
  s.niqqudMarks &&
  s.niqqudMarks.every(mark => stage.niqqudStages.includes(mark))
);
```

> **הערה:** שדה `niqqudMarks` אינו חובה בסיפורים סטנדרטיים.
> הוא מומלץ לכל הסיפורים כדי לאפשר סינון גם מחוץ לספרייה "לומדים לקרוא".

---

*גרסה: 1.0 — נוצר ב-2026-06-25*
