/**
 * booki-character.js — helper יחיד להצגת בוקי בכל מסך (תלמיד/מורה), תמיד עטוף
 * ב-.booki-character-stage (צל+קרקע+תנועת נשימה עדינה, מוגדר ב-
 * assets/booki-background-kit/booki-worlds.css) כדי שלא ייראה כמדבקה תלושה.
 * נתיבי הנכסים תואמים בדיוק ל-manifest.json שסופק בערכת המותג הרשמית.
 */

// מידות אמיתיות (px) של כל נכס אחרי אופטימיזציה — ר' scripts/resize (לא בריפו),
// כדי שקוראים לא יצטרכו לנחש מספרים; ניתן לדרוס דרך opts.width/height.
const BOOKI_DIMS = {
  'core/states/booki-welcome.png':                 [640, 960],
  'core/states/booki-start.png':                   [640, 960],
  'core/states/booki-celebrating.png':              [640, 960],
  'class-goal/booki-goal-reached.png':              [640, 960],
  'shop-voting/booki-winner.png':                   [640, 427],
  'onboarding/booki-opening-club.png':              [640, 960],
  'core/states/booki-reading.png':                  [400, 600],
  'core/states/booki-encouraging.png':              [400, 600],
  'class-goal/booki-progress.png':                  [400, 600],
  'class-goal/booki-message.png':                   [400, 600],
  'class-goal/booki-achievement.png':               [400, 600],
  'shop-voting/booki-shop-open.png':                [400, 600],
  'shop-voting/booki-voting.png':                   [400, 600],
  'shop-voting/booki-vote-saved.png':               [400, 600],
  'shop-voting/booki-gift.png':                     [400, 600],
  'onboarding/booki-personal-card.png':             [400, 600],
  'reading-journey/booki-read-in-app.png':          [400, 600],
  'reading-journey/booki-physical-book-timer.png':  [400, 600],
  'reading-journey/booki-report-minutes.png':       [400, 600],
  'reading-journey/booki-personal-best.png':        [400, 600],
  'system-states/booki-loading.png':                [240, 360],
  'system-states/booki-empty.png':                  [240, 360],
  'system-states/booki-error.png':                  [240, 360],
  'system-states/booki-offline.png':                [240, 360],
  'system-states/booki-waiting.png':                [240, 360],
  'teacher/booki-teacher-helper.png':               [240, 360],
  'teacher/booki-teacher-empty.png':                [240, 360],
  'teacher/booki-teacher-success.png':              [240, 360],
  'onboarding/booki-enter-code.png':                [240, 360],
  'onboarding/booki-choose-reader.png':              [240, 360],
};

/**
 * @param {string} rel   נתיב יחסי תחת assets/booki/ (למשל 'core/states/booki-welcome.png')
 * @param {object} opts  { alt, className, width, height, loading }
 *   - alt: ריק כברירת מחדל בכוונה — בוקי תמיד מלווה טקסט גלוי שכבר אומר את הדרוש,
 *     כך שהאיור עצמו דקורטיבי מבחינת נגישות (ר' תוכנית המותג, סעיף 2).
 *   - loading: 'lazy' כברירת מחדל; יש להעביר 'eager' רק לרגע ה-hero הראשון במסך.
 */
function bookiStageHtml(rel, opts = {}) {
  const { alt = '', className = '', width, height, loading = 'lazy' } = opts;
  const dims = BOOKI_DIMS[rel] || [400, 600];
  const w = width || dims[0];
  const h = height || dims[1];
  // className מתווסף גם ל-div וגם ל-img בכוונה: booki-worlds.css קובע את מידת
  // האיור על .booki-character-stage > img (סלקטור-ילד ממוקד), כך שדריסת-מידה
  // ל"גרסה קטנה" (למשל בבאנר/כותרת בורר) חייבת לפגוע ב-img עצמו, לא רק בעטיפה.
  const cls = className ? ' ' + className : '';
  return (
    '<div class="booki-character-stage' + cls + '">' +
      '<img src="assets/booki/' + rel + '" alt="' + alt + '" width="' + w + '" height="' + h + '" loading="' + loading + '"' + (className ? ' class="' + className + '"' : '') + '>' +
    '</div>'
  );
}

Object.assign(window, { bookiStageHtml, BOOKI_DIMS });
