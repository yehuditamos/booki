/* ═══════════════════════════════════════════════════════════════
   firebase.js — שכבת נתונים Firebase Firestore
   יער הקריאה של מיתרים

   ארכיטקטורה:
     classes/{classId}/students/{studentId}

   הוראות הגדרה:
   1. firebase.google.com ← הפרויקט שלך ← Project Settings
   2. גלול ל־"Your apps" ← "SDK setup and configuration"
   3. העתק את הערכים לתוך FIREBASE_CONFIG למטה
   4. שמור את הקובץ

   להוספת כיתה שנייה בעתיד:
   שנה רק את CLASS_ID בקובץ של הכיתה החדשה.
═══════════════════════════════════════════════════════════════ */

// ─── זהות הכיתה ─────────────────────────────────────────────────────
// שנה ערך זה בכל כיתה/שנה חדשה — שאר הקוד נשאר זהה
const CLASS_ID = "mitarim-aleph-2025";

const CLASS_META = {
  name:         "מיתרים כיתה א׳",
  teacherEmail: "",               // מלא כאן בעתיד
  goal:         1500,
  year:         "2025-2026",
};

console.log('[firebase] loading...');

// ─── מפתחות Firebase — הדבק כאן ─────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAu6366JpHuU36IYUWQq8277PUIevp2R1w",
  authDomain:        "mitarim-reading.firebaseapp.com",
  projectId:         "mitarim-reading",
  storageBucket:     "mitarim-reading.firebasestorage.app",
  messagingSenderId: "907859508808",
  appId:             "1:907859508808:web:198d8fc1d485510c84627d"
};

// ─── אתחול Firebase ──────────────────────────────────────────────────
let _db;
let _firebaseReady = false;

(function initFirebase() {
  console.log('[firebase] initFirebase() called');

  if (FIREBASE_CONFIG.apiKey.startsWith('PASTE_')) {
    console.warn('[firebase] ⚠️  המפתחות לא הוגדרו עדיין.');
    return;
  }
  console.log('[firebase] config OK — projectId:', FIREBASE_CONFIG.projectId);

  if (typeof firebase === 'undefined') {
    console.error('[firebase] ❌ firebase global לא קיים — SDK לא נטען מה-CDN');
    return;
  }
  console.log('[firebase] firebase SDK נמצא — מאתחל...');

  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    console.log('[firebase] initialized');

    _db = firebase.firestore();
    console.log('[firebase] firestore connected');

    _firebaseReady = true;
    console.log('[firebase] class:', CLASS_ID);

    _ensureClassDoc();
  } catch (e) {
    console.error('[firebase] ❌ שגיאת אתחול:', e.message);
  }
})();

function _isReady() {
  return _firebaseReady && !!_db;
}

// ─── נתיבי Firestore ─────────────────────────────────────────────────

// classes/mitarim-aleph-2025/students
function _studentsRef() {
  return _db.collection('classes').doc(CLASS_ID).collection('students');
}

// וידוא שמסמך הכיתה קיים (נוצר פעם אחת)
async function _ensureClassDoc() {
  try {
    const ref  = _db.collection('classes').doc(CLASS_ID);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ ...CLASS_META, createdAt: new Date().toISOString() });
      console.log('[firebase] ✅ מסמך כיתה נוצר:', CLASS_ID);
    }
  } catch (e) {
    console.warn('[firebase] _ensureClassDoc:', e.message);
  }
}

// ─── מזהה תלמיד יציב ────────────────────────────────────────────────
// משתמש ב-"s00"..."s28" — יציב, ממוין, לא ישתנה אם נוסיף תלמיד
// (הindex המספרי נשמר בשדה id בתוך הנתונים)

function _studentDocId(id) {
  return 's' + String(id).padStart(2, '0');   // 0 → "s00", 28 → "s28"
}

// ─── טעינת תלמיד בודד ───────────────────────────────────────────────

async function fbLoadStudent(id) {
  if (!_isReady()) return null;
  try {
    const snap = await _studentsRef().doc(_studentDocId(id)).get();
    return snap.exists ? snap.data() : null;
  } catch (e) {
    console.error('[firebase] fbLoadStudent(' + id + '):', e.message);
    return null;
  }
}

// ─── שמירת תלמיד בודד ───────────────────────────────────────────────

async function fbSaveStudent(data) {
  if (data.id === null || data.id === undefined) {
    console.error('[firebase] fbSaveStudent: id חסר — שמירה בוטלה');
    return false;
  }
  if (!_isReady()) {
    console.warn('[firebase] fbSaveStudent: Firebase לא זמין — localStorage בלבד');
    return false;
  }
  try {
    await _studentsRef().doc(_studentDocId(data.id)).set(data);
    console.log(
      '[firebase] ✅', CLASS_ID, '/ ' + _studentDocId(data.id),
      '| נק׳:', data.points, '| דק׳:', data.totalMinutes
    );
    return true;
  } catch (e) {
    console.error('[firebase] fbSaveStudent(' + data.id + '):', e.message);
    return false;
  }
}

// ─── האזנה בזמן אמת לכל תלמידי הכיתה ───────────────────────────────
// מחזיר פונקציית unsubscribe

function fbWatchClass(callback) {
  if (!_isReady()) {
    console.warn('[firebase] fbWatchClass: Firebase לא זמין');
    callback([]);
    return () => {};
  }
  return _studentsRef().onSnapshot(
    snapshot => {
      const students = [];
      snapshot.forEach(doc => students.push(doc.data()));
      callback(students);
    },
    e => console.error('[firebase] fbWatchClass error:', e.message)
  );
}

// ─── מעבר מ-localStorage ל-Firebase (פעם אחת בחיים) ─────────────────

async function migrateFromLocalStorage() {
  const FLAG = 'booki_migrated_fb_v2';   // v2 = מבנה חדש עם classId
  if (localStorage.getItem(FLAG)) return 0;
  if (!_isReady()) {
    console.warn('[firebase] migration: Firebase לא זמין — דילוג');
    return 0;
  }

  let count = 0;
  for (let i = 0; i < 29; i++) {
    const raw = localStorage.getItem('booki_s_' + i);
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      const hasActivity =
        (data.totalMinutes > 0) ||
        (data.points > 0) ||
        (Array.isArray(data.history) && data.history.length > 0);
      if (hasActivity) {
        const ok = await fbSaveStudent(data);
        if (ok) count++;
      }
    } catch (e) {
      console.error('[firebase] migration error student', i, ':', e.message);
    }
  }

  localStorage.setItem(FLAG, '1');
  if (count > 0) {
    console.log('[firebase] ✅ הועברו', count, 'תלמידים →', CLASS_ID);
  }
  return count;
}

// ─── איפוס כל תלמידי הכיתה ───────────────────────────────────────────
// שימוש: הקלד resetAllStudents() בקונסול (F12) לפני השקה
// מאפס נתוני קריאה — שומר id ושם תלמיד

async function resetAllStudents() {
  if (!_isReady()) {
    console.error('[reset] ❌ Firebase לא מחובר — בדוק חיבור');
    return;
  }

  const NAMES = [
    "אדם צור","אופיר לוינזון","אוריה חורש","איה","אלון גושן קוסובסקי",
    "אמרי","אלה סרוטה","אלכסנדר דוניה","אלמה כהן מגורי","אמה חסקל",
    "דרור גימון","יאיר היידנפלד","יהלי אור לויכטר","יערה רוטנברג","כרם חייט שיף",
    "מיכה","נגה צברי","נורי שרשבסקי","נינה אבידן","נעמה קלפץ",
    "סול בן-ג׳ויה","עומר לבהר","עומרי","עמית ששון","פלג חסקל",
    "קשת בלה הורוויץ","שילה","שירה דהן","תמר לוי"
  ];

  console.log('[reset] מתחיל איפוס', NAMES.length, 'תלמידים בכיתה', CLASS_ID, '...');

  const batch = _db.batch();

  for (let i = 0; i < NAMES.length; i++) {
    const ref = _studentsRef().doc(_studentDocId(i));
    batch.set(ref, {
      id:           i,
      name:         NAMES[i],
      totalMinutes: 0,
      appMinutes:   0,
      bookMinutes:  0,
      points:       0,
      storiesRead:  0,
      history:      []
    });
  }

  try {
    await batch.commit();
    console.log('[reset] ✅ Firebase — כל', NAMES.length, 'תלמידים אופסו בהצלחה');
  } catch (e) {
    console.error('[reset] ❌ שגיאת Firebase:', e.message);
    return;
  }

  // איפוס localStorage
  for (let i = 0; i < NAMES.length; i++) {
    localStorage.removeItem('booki_s_' + i);
  }
  localStorage.removeItem('booki_migrated_fb_v2');
  console.log('[reset] ✅ localStorage — אופס');
  console.log('[reset] 🎉 הכיתה', CLASS_ID, 'מוכנה להשקה!');
}

// ─── חשיפה לקונסול ───────────────────────────────────────────────────
window.resetAllStudents  = resetAllStudents;
window.fbLoadStudent     = fbLoadStudent;
window.fbSaveStudent     = fbSaveStudent;
console.log('[firebase] window.resetAllStudents מוכן לשימוש מהקונסול');
