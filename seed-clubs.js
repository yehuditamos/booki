/**
 * seed-clubs.js — Seed data: מועדונים ראשוניים
 *
 * כיתת מיתרים הקיימת מוגדרת כאן כמועדון school.
 * memberIds מכילים את מזהי התלמידים הקיימים — גשר לתאימות אחורה.
 *
 * fbBootstrapClubs() ב-firebase-clubs.js קורא את הקובץ הזה ויוצר
 * את המסמכים ב-Firebase אם עוד לא קיימים.
 */

const BOOTSTRAP_CLUBS = [

  {
    id:          "mitarim-aleph-2025",
    type:        "school",
    name:        "מיתרים כיתה א׳",
    emoji:       "🌳",
    description: "יַעַר הַקְּרִיאָה שֶׁל מִיתָרִים",
    createdBy:   "admin",

    goal: {
      type:   "minutes",
      target: 1500,
      period: "year",
    },

    settings: {
      countAllSessions: true,
      showLeaderboard:  true,
      showMemberList:   true,
      allowSelfJoin:    false,
      requireApproval:  true,
    },

    active: true,
    hidden: true,   // מוסתר מילדים — ממתין לאיחוד עם המועדון החדש

    // מזהי התלמידים הקיימים — תואם ל-STUDENT_NAMES ב-script.js
    memberIds: [
      "s1","s2","s3","s4","s5","s6","s7","s8","s9","s10",
      "s11","s12","s13","s14","s15","s16","s17","s18","s19","s20",
      "s21","s22","s23","s24","s25","s26","s27","s28","s29",
    ],
  },

];

function getBootstrapClubById(id) {
  return BOOTSTRAP_CLUBS.find(c => c.id === id) ?? null;
}
