/**
 * data-club-types.js — הגדרת סוגי מועדונים
 *
 * כל סוג מועדון מגדיר ברירות מחדל להגדרות.
 * יוצר מועדון יכול לדרוס כל הגדרה.
 * להוספת סוג חדש: הוסף שורה ל-CLUB_TYPE_DEFAULTS.
 */

const CLUB_TYPE_DEFAULTS = {

  school: {
    label:            "בית ספר",
    emoji:            "🏫",
    countAllSessions: true,   // כל קריאה נספרת, גם מחוץ למועדון
    showLeaderboard:  true,
    showMemberList:   true,
    allowSelfJoin:    false,  // רק מנהל מוסיף חברים
    requireApproval:  true,
    defaultGoal: { type: "minutes", target: 1500, period: "year" },
  },

  family: {
    label:            "משפחה",
    emoji:            "🏠",
    countAllSessions: true,
    showLeaderboard:  true,
    showMemberList:   true,
    allowSelfJoin:    false,
    requireApproval:  false,
    defaultGoal: { type: "minutes", target: 300, period: "month" },
  },

  friends: {
    label:            "חברים",
    emoji:            "🤝",
    countAllSessions: true,
    showLeaderboard:  true,
    showMemberList:   true,
    allowSelfJoin:    true,
    requireApproval:  true,
    defaultGoal: { type: "sessions", target: 20, period: "month" },
  },

  library: {
    label:            "ספרייה",
    emoji:            "📚",
    countAllSessions: true,
    showLeaderboard:  false,
    showMemberList:   false,
    allowSelfJoin:    true,
    requireApproval:  false,
    defaultGoal: { type: "books", target: 10, period: "month" },
  },

  camp: {
    label:            "קייטנה / מחנה",
    emoji:            "⛺",
    countAllSessions: false,  // רק קריאה בהקשר הקייטנה נספרת
    showLeaderboard:  true,
    showMemberList:   true,
    allowSelfJoin:    false,
    requireApproval:  true,
    defaultGoal: { type: "minutes", target: 120, period: "week" },
  },

};

function getClubTypeDefaults(type) {
  return CLUB_TYPE_DEFAULTS[type] ?? CLUB_TYPE_DEFAULTS.school;
}

function getAllClubTypes() {
  return Object.entries(CLUB_TYPE_DEFAULTS).map(([id, def]) => ({ id, ...def }));
}
