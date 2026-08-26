/**
 * content/stories-one-word.js — סיפור של מילה אחת
 *
 * בכל עמוד מופיעה מילה מנוקדת אחת בלבד ואיור תואם.
 * מיועד לקוראים בתחילת הדרך, עם רצף פשוט שמרגיש כמו סיפור.
 */

const STORIES_ONE_WORD = [
  {
    id:        "one-word-ball",
    libraryId: "one-word",
    category:  "סיפור של מילה אחת",
    title:     "הַכַּדּוּר",
    emoji:     "⚽",
    tags:      ["מילה אחת", "כדורגל", "פעולות", "🌱 קורא ראשון"],
    pages: [
      { text: "כַּדּוּר", illustration: "⚽", illustrationLabel: "כדור", scene: "sky", readingMinutes: 0.2 },
      { text: "יֶלֶד", illustration: "🧒", illustrationLabel: "ילד", scene: "sun", readingMinutes: 0.2 },
      { text: "רָץ", illustration: "🏃", illustrationLabel: "ילד רץ", scene: "grass", readingMinutes: 0.2 },
      { text: "בּוֹעֵט", illustration: "🦵", illustrationLabel: "רגל בועטת בכדור", scene: "grass", readingMinutes: 0.2 },
      { text: "עָף", illustration: "💨", illustrationLabel: "כדור עף באוויר", scene: "sky", readingMinutes: 0.2 },
      { text: "שַׁעַר", illustration: "🥅", illustrationLabel: "שער כדורגל", scene: "celebration", readingMinutes: 0.2 },
    ],
  },

  {
    id:        "one-word-garden",
    libraryId: "one-word",
    category:  "סיפור של מילה אחת",
    title:     "הַגִּנָּה",
    emoji:     "🌻",
    tags:      ["מילה אחת", "טבע", "גינה", "🌱 קורא ראשון"],
    pages: [
      { text: "שֶׁמֶשׁ", illustration: "☀️", illustrationLabel: "שמש", scene: "sun", readingMinutes: 0.2 },
      { text: "גֶּשֶׁם", illustration: "🌧️", illustrationLabel: "ענן וגשם", scene: "rain", readingMinutes: 0.2 },
      { text: "זֶרַע", illustration: "🌰", illustrationLabel: "זרע באדמה", scene: "earth", readingMinutes: 0.2 },
      { text: "נָבַט", illustration: "🌱", illustrationLabel: "נבט צעיר", scene: "grass", readingMinutes: 0.2 },
      { text: "פֶּרַח", illustration: "🌻", illustrationLabel: "פרח", scene: "garden", readingMinutes: 0.2 },
      { text: "פַּרְפַּר", illustration: "🦋", illustrationLabel: "פרפר ליד הפרח", scene: "garden", readingMinutes: 0.2 },
    ],
  },

  {
    id:        "one-word-my-day",
    libraryId: "one-word",
    category:  "סיפור של מילה אחת",
    title:     "הַיּוֹם שֶׁלִּי",
    emoji:     "🌞",
    tags:      ["מילה אחת", "שגרה", "בית ספר", "🌱 קורא ראשון"],
    pages: [
      { text: "בֹּקֶר", illustration: "🌅", illustrationLabel: "בוקר ושמש זורחת", scene: "sun", readingMinutes: 0.2 },
      { text: "מִתְלַבֵּשׁ", illustration: "👕", illustrationLabel: "חולצה ללבישה", scene: "home", readingMinutes: 0.2 },
      { text: "אוֹכֵל", illustration: "🥣", illustrationLabel: "קערת ארוחת בוקר", scene: "home", readingMinutes: 0.2 },
      { text: "הוֹלֵךְ", illustration: "🚶", illustrationLabel: "ילד הולך", scene: "sky", readingMinutes: 0.2 },
      { text: "לוֹמֵד", illustration: "✏️", illustrationLabel: "עיפרון ומחברת", scene: "school", readingMinutes: 0.2 },
      { text: "יָשֵׁן", illustration: "😴", illustrationLabel: "ילד ישן בלילה", scene: "night", readingMinutes: 0.2 },
    ],
  },
];
