/**
 * content/stories-beginner.js — צעדים ראשונים
 * libraryId: "beginner"  |  קהל יעד: גן חובה / כיתה א׳ — קוראים מתחילים
 *
 * עקרונות כתיבה לקטגוריה זו:
 *   - 2–4 מילים פשוטות מאוד בכל עמוד.
 *   - חזרות רבות על אותן מילים, ניקוד מלא ומדויק בכל מילה.
 *   - משפטים קצרים מאוד, בלי משפטי משנה מורכבים.
 *   - readingMinutes נמוך משמעותית מהספרייה הרגילה (טקסט מועט לעמוד).
 */

const STORIES_BEGINNER = [

  {
    id:        "beginner-mom-dad",
    libraryId: "beginner",
    category:  "צעדים ראשונים",
    title:     "אִמָּא וְאַבָּא",
    emoji:     "👨‍👩‍👦",
    tags:      ["משפחה", "התחלה", "🌱 קורא ראשון"],
    pages: [
      { text: "זֶה אַבָּא.", readingMinutes: 0.2 },
      { text: "זֹאת אִמָּא.", readingMinutes: 0.2 },
      { text: "אֲנִי אוֹהֵב אֶת אַבָּא.", readingMinutes: 0.2 },
      { text: "אֲנִי אוֹהֵב אֶת אִמָּא.", readingMinutes: 0.2 },
      { text: "אִמָּא אוֹהֶבֶת אוֹתִי.", readingMinutes: 0.2 },
      { text: "אַבָּא אוֹהֵב אוֹתִי.", readingMinutes: 0.2 },
      { text: "כֻּלָּנוּ אוֹהֲבִים בְּיַחַד!", readingMinutes: 0.2 },
    ],
  },

  {
    id:        "beginner-my-cat",
    libraryId: "beginner",
    category:  "צעדים ראשונים",
    title:     "הֶחָתוּל שֶׁלִּי",
    emoji:     "🐱",
    tags:      ["חיות", "בית", "🌱 קורא ראשון"],
    pages: [
      { text: "יֵשׁ לִי חָתוּל.", readingMinutes: 0.2 },
      { text: "הֶחָתוּל שָׁחֹר וְלָבָן.", readingMinutes: 0.2 },
      { text: "הֶחָתוּל אוֹהֵב לִישֹׁן.", readingMinutes: 0.2 },
      { text: "הֶחָתוּל אוֹהֵב לְשַׂחֵק.", readingMinutes: 0.2 },
      { text: "הֶחָתוּל שׁוֹתֶה חָלָב.", readingMinutes: 0.2 },
      { text: "אֲנִי אוֹהֵב אוֹתוֹ.", readingMinutes: 0.2 },
      { text: "הוּא הֶחָתוּל שֶׁלִּי!", readingMinutes: 0.2 },
    ],
  },

  {
    id:        "beginner-i-eat",
    libraryId: "beginner",
    category:  "צעדים ראשונים",
    title:     "אֲנִי אוֹכֵל",
    emoji:     "🍎",
    tags:      ["אוכל", "יום יום", "🌱 קורא ראשון"],
    pages: [
      { text: "אִמָּא, אֲנִי רָעֵב!", readingMinutes: 0.2 },
      { text: "הִנֵּה לֶחֶם חַם.", readingMinutes: 0.2 },
      { text: "אֲנִי אוֹכֵל לֶחֶם.", readingMinutes: 0.2 },
      { text: "אֲנִי אוֹכֵל גְּבִינָה.", readingMinutes: 0.2 },
      { text: "אֲנִי אוֹכֵל תַּפּוּחַ יָרֹק.", readingMinutes: 0.2 },
      { text: "אֲנִי שׁוֹתֶה מַיִם קָרִים.", readingMinutes: 0.2 },
      { text: "תּוֹדָה, אִמָּא! הָיָה טָעִים.", readingMinutes: 0.2 },
    ],
  },

  {
    id:        "beginner-at-gan",
    libraryId: "beginner",
    category:  "צעדים ראשונים",
    title:     "בַּגַּן",
    emoji:     "🧸",
    tags:      ["גן", "חברים", "🌱 קורא ראשון"],
    pages: [
      { text: "אֲנִי הוֹלֵךְ לַגַּן.", readingMinutes: 0.2 },
      { text: "בַּגַּן יֵשׁ חֲבֵרִים.", readingMinutes: 0.2 },
      { text: "אֲנִי מְשַׂחֵק בַּכַּדּוּר.", readingMinutes: 0.2 },
      { text: "אֲנִי מְשַׂחֵק בַּחוֹל.", readingMinutes: 0.2 },
      { text: "אֲנַחְנוּ שָׁרִים יַחַד.", readingMinutes: 0.2 },
      { text: "בַּגַּן כֵּיף גָּדוֹל!", readingMinutes: 0.2 },
    ],
  },

  {
    id:        "beginner-good-night",
    libraryId: "beginner",
    category:  "צעדים ראשונים",
    title:     "לַיְלָה טוֹב",
    emoji:     "🌙",
    tags:      ["שינה", "משפחה", "🌱 קורא ראשון"],
    pages: [
      { text: "הַשֶּׁמֶשׁ הוֹלֶכֶת לִישֹׁן.", readingMinutes: 0.2 },
      { text: "אֲנִי רוֹחֵץ יָדַיִם.", readingMinutes: 0.2 },
      { text: "אֲנִי לוֹבֵשׁ כְּתֹנֶת לַיְלָה.", readingMinutes: 0.2 },
      { text: "אִמָּא מְסַפֶּרֶת סִפּוּר.", readingMinutes: 0.2 },
      { text: "אַבָּא שָׁר שִׁיר עֶרֶשׂ.", readingMinutes: 0.2 },
      { text: "אֲנִי מְחַבֵּק דֹּב.", readingMinutes: 0.2 },
      { text: "לַיְלָה טוֹב, כֻּלָּם!", readingMinutes: 0.2 },
    ],
  },

  {
    id:        "beginner-letter-alef",
    libraryId: "beginner",
    category:  "צעדים ראשונים",
    title:     "א׳ כְּמוֹ אִמָּא",
    emoji:     "🔤",
    tags:      ["אותיות", "לומדים לקרוא", "🌱 קורא ראשון"],
    pages: [
      { text: "זֹאת הָאוֹת א׳.", readingMinutes: 0.2 },
      { text: "א׳ בְּמִלָּה: אִמָּא.", readingMinutes: 0.2 },
      { text: "א׳ בְּמִלָּה: אַבָּא.", readingMinutes: 0.2 },
      { text: "א׳ בְּמִלָּה: אֲנִי.", readingMinutes: 0.2 },
      { text: "כֻּלָּנוּ אוֹהֲבִים אֶת א׳!", readingMinutes: 0.2 },
    ],
  },

];
