/** Booki teacher workspace: browse the published story catalog without entering
 * a student's reading session. No database writes, reader mutations or timers.
 * Feedback is handed to the existing WhatsApp support channel, never auto-sent.
 */
(function () {
  'use strict';
  if (window.BookiTeacherWorkspace) return;
  const $ = id => document.getElementById(id);
  const ids = { library: 'screen-teacher-booki-library', reader: 'screen-teacher-booki-preview', feedback: 'screen-teacher-feedback' };
  const SUPPORT = 'https://wa.me/972525383871'; // Existing recipient in routing.js/openBugReport.
  const state = { uid: null, back: 'screen-teacher-dashboard', feedbackBack: null, query: '', shelf: '', limit: 24, story: null, page: 0, mode: 'full', revealed: false, draft: '', type: 'הצעת שיפור', context: '' };
  function el(tag, text, cls) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  function btn(text, action, cls = 'tw-button') {
    const node = el('button', text, cls); node.type = 'button'; node.addEventListener('click', action); return node;
  }
  function plain(text) { return String(text || '').normalize('NFC').replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g, ''); }
  function teacher() { return typeof getCurrentTeacher === 'function' ? getCurrentTeacher() : null; }
  function requireTeacher() {
    const t = teacher();
    if (!t) { if (typeof showTeacherAuth === 'function') showTeacherAuth('login'); return null; }
    if (state.uid !== t.uid) {
      state.uid = t.uid; state.draft = ''; state.context = ''; state.story = null;
      state.query = ''; state.shelf = ''; state.limit = 24; state.type = 'הצעת שיפור';
    }
    return t;
  }
  function activate(id, focus = true) {
    setNavVisible(false); showScreen(id);
    if (focus) $(id)?.querySelector('h2')?.focus();
  }
  function header(title, back) {
    const head = el('div', undefined, 'screen-header sticky-header');
    const row = el('div', undefined, 'header-row');
    const h = el('h2', title); h.tabIndex = -1;
    row.append(btn('חזרה →', back, 'btn-back'), h); head.append(row); return head;
  }
  function section(id, title, back) {
    const s = el('section', undefined, 'screen tw-screen'); s.id = id; s.dir = 'rtl';
    s.append(header(title, back));
    const body = el('div', undefined, 'tw-body'); s.append(body); document.body.append(s); return body;
  }
  function rememberBack() {
    const id = document.querySelector('.screen.active')?.id;
    if (id === 'screen-teacher-dashboard' || id === 'screen-teacher-club' || id === 'screen-owner-dashboard') state.back = id;
  }
  function backToManagement() {
    if (!requireTeacher()) return;
    activate($(state.back) ? state.back : 'screen-teacher-dashboard', false);
  }
  function allStories() { return typeof getAllStories === 'function' ? getAllStories().filter(s => Array.isArray(s.pages) && s.pages.length) : []; }
  function shelves() { return typeof BOOKI_LIBRARY_SHELVES !== 'undefined' ? BOOKI_LIBRARY_SHELVES : []; }
  function belongs(story, shelf) {
    return typeof _storyBelongsToShelf === 'function' ? _storyBelongsToShelf(story, shelf) : (shelf.libraries || []).includes(story.libraryId);
  }
  function tip(title, paragraphs) {
    const details = el('details', undefined, 'tw-tip'); details.append(el('summary', title));
    paragraphs.forEach(text => details.append(el('p', text))); return details;
  }
  function openLibrary() {
    if (!requireTeacher()) return;
    rememberBack(); renderLibrary(); activate(ids.library);
  }
  function renderLibrary() {
    const body = $(ids.library).querySelector('.tw-body'); body.replaceChildren();
    body.append(el('p', 'כל הסיפורים שבספרייה של הילדים, לעיון שלך — בלי לבחור תלמיד ובלי לצבור עבורו דקות או נקודות.', 'tw-intro'));
    body.append(tip('מנקודת המבט של הילד: איך זה עובד?', [
      '״אני בוחר סיפור שמעניין אותי וקורא בקצב שלי.״ כאן תוכלי לעבור על התוכן לפני שתמליצי עליו לכיתה.',
      '״אני בוחר עם ניקוד, חצי־חצי או בלי ניקוד; כשקשה לי, אפשר להיעזר בניקוד.״ הבחירה זמינה גם בתצוגה המקדימה שלך.',
      '״בסיום הקריאה אני צובר דקות ונקודות.״ בבוקי הנקודות מבוססות על זמן הקריאה, עם בונוסים לפי תנאי הקריאה — לא על לחיצה להעברת עמוד.',
      '״הקריאה שלי תורמת גם למועדון.״ כאן זו תצוגה מקדימה בלבד: אין שינוי לנתוני הילדים או ליעד הכיתה.'
    ]));
    const tools = el('div', undefined, 'tw-library-tools');
    const searchLabel = el('label', 'חיפוש סיפור'); searchLabel.htmlFor = 'tw-library-search';
    const search = el('input'); search.id = 'tw-library-search'; search.type = 'search'; search.placeholder = 'שם הסיפור, נושא או מילת מפתח'; search.value = state.query;
    search.addEventListener('input', () => { state.query = search.value; state.limit = 24; renderStoryCards(); }); searchLabel.append(search);
    const shelfLabel = el('label', 'מדף בספרייה'); shelfLabel.htmlFor = 'tw-library-shelf';
    const select = el('select'); select.id = 'tw-library-shelf';
    const all = el('option', 'כל הספרייה'); all.value = ''; select.append(all);
    shelves().forEach(shelf => {
      const count = allStories().filter(s => belongs(s, shelf)).length;
      const option = el('option', `${shelf.emoji} ${shelf.title} (${count})`); option.value = shelf.id; select.append(option);
    });
    select.value = state.shelf; select.addEventListener('change', () => { state.shelf = select.value; state.limit = 24; renderStoryCards(); }); shelfLabel.append(select);
    tools.append(searchLabel, shelfLabel); body.append(tools);
    const count = el('p', undefined, 'tw-result-count'); count.id = 'tw-result-count'; count.setAttribute('role', 'status'); body.append(count);
    const grid = el('div', undefined, 'tw-story-grid'); grid.id = 'tw-story-grid'; body.append(grid);
    const more = btn('להציג סיפורים נוספים', () => { state.limit += 24; renderStoryCards(); }); more.id = 'tw-story-more'; body.append(more);
    renderStoryCards();
  }
  function renderStoryCards() {
    const grid = $('tw-story-grid'); if (!grid) return; grid.replaceChildren();
    const stories = allStories(), q = plain(state.query).trim().toLocaleLowerCase('he');
    const shelf = shelves().find(s => s.id === state.shelf);
    const filtered = stories.filter(s => (!shelf || belongs(s, shelf)) && (!q || plain([s.title, s.category, ...(s.tags || [])].join(' ')).toLocaleLowerCase('he').includes(q)));
    $('tw-result-count').textContent = `${filtered.length} סיפורים מתוך ${stories.length} בספרייה`;
    filtered.slice(0, state.limit).forEach(story => {
      const card = btn('', () => openStory(story.id), 'tw-story-card');
      card.append(el('span', story.emoji || '📖', 'tw-story-emoji'), el('strong', story.title || 'סיפור'),
        el('small', `${story.category || ''}${story.category ? ' · ' : ''}${story.pages.length} עמודים`), el('span', 'לעיון בסיפור ←', 'tw-story-link'));
      grid.append(card);
    });
    if (!filtered.length) grid.append(el('p', stories.length ? 'לא נמצאו סיפורים מתאימים. נסי מילה אחרת או בחרי ״כל הספרייה״.' : 'הספרייה לא נטענה. רענני את בוקי ונסי שוב.', 'tw-empty'));
    $('tw-story-more').hidden = state.limit >= filtered.length;
  }
  function openStory(id) {
    if (!requireTeacher()) return;
    const story = allStories().find(s => String(s.id) === String(id)); if (!story) return;
    state.story = story; state.page = 0; state.mode = 'full'; state.revealed = false;
    renderStory(); activate(ids.reader);
  }
  function sentences(text) { return String(text || '').split(/(?<=[.!?׃։])\s+|\n+/).filter(Boolean); }
  function pageText() {
    const source = state.story.pages[state.page].text || '';
    if (state.mode === 'full' || state.revealed) return source;
    if (state.mode === 'none') return plain(source);
    const offset = state.story.pages.slice(0, state.page).reduce((n, p) => n + sentences(p.text).length, 0);
    return sentences(source).map((text, i) => (offset + i) % 2 ? plain(text) : text).join('\n');
  }
  function returnToLibrary() { if (!requireTeacher()) return; renderLibrary(); activate(ids.library); }
  function renderStory() {
    const story = state.story; if (!story) return;
    const screen = $(ids.reader), body = screen.querySelector('.tw-body'); body.replaceChildren(); screen.querySelector('h2').textContent = story.title;
    body.append(el('p', 'תצוגה מקדימה למורה · ללא שמירת קריאה או נקודות', 'tw-preview-label'));
    const controls = el('div', undefined, 'tw-mode-controls'); controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'תצוגת ניקוד');
    [['full', 'עם ניקוד'], ['mixed', 'חצי־חצי'], ['none', 'בלי ניקוד']].forEach(([mode, label]) => {
      const b = btn(label, () => { state.mode = mode; state.revealed = false; renderStory(); $(ids.reader).querySelector(`[data-mode="${mode}"]`)?.focus(); });
      b.dataset.mode = mode; b.setAttribute('aria-pressed', String(mode === state.mode)); controls.append(b);
    }); body.append(controls);
    const p = story.pages[state.page];
    if (p.illustration) { const image = el('div', p.illustration, 'tw-illustration'); image.setAttribute('role', 'img'); image.setAttribute('aria-label', p.illustrationLabel || plain(p.text)); body.append(image); }
    const text = el('div', pageText(), 'tw-story-text'); text.id = 'tw-preview-text'; text.tabIndex = -1; body.append(text);
    if (state.mode !== 'full') { const help = btn(state.revealed ? 'הניקוד מוצג בעמוד הזה' : 'צריך ניקוד לרגע? ✨', () => { state.revealed = true; renderStory(); $('tw-preview-text').focus(); }); help.disabled = state.revealed; body.append(help); }
    const nav = el('div', undefined, 'tw-page-nav');
    const prev = btn('→ הקודם', () => { state.page--; state.revealed = false; renderStory(); $('tw-preview-text').focus(); }); prev.disabled = state.page === 0;
    const count = el('span', `עמוד ${state.page + 1} מתוך ${story.pages.length}`); count.setAttribute('role', 'status');
    const next = state.page < story.pages.length - 1 ? btn('הבא ←', () => { state.page++; state.revealed = false; renderStory(); $('tw-preview-text').focus(); }) : btn('סיום התצוגה', returnToLibrary);
    nav.append(prev, count, next); body.append(nav);
    body.append(tip('מה הילד חווה בעמוד הזה?', [
      'הילד מתקדם בקצב שלו, ויכול לחזור לעמוד קודם או לבקש ניקוד לעזרה. בסיפור שאינו מנוקד במקור, בחירת ״עם ניקוד״ לא מוסיפה ניקוד חדש.',
      'דקות ונקודות נשמרות בסיום הקריאה. עצם הדפדוף בעמודים אינו מעניק נקודות. בתצוגה שלך לא נמדד זמן ולא מופעלת השלמת קריאה של תלמיד.'
    ]));
    body.append(btn('יש לך הצעה לגבי הסיפור הזה? 💬', () => openFeedback(story.title), 'tw-text-button'));
  }
  function openFeedback(context = '') {
    if (!requireTeacher()) return;
    rememberBack(); state.feedbackBack = document.querySelector('.screen.active')?.id || state.back;
    state.context = typeof context === 'string' ? context : '';
    renderFeedback(); activate(ids.feedback); $('tw-feedback-message')?.focus();
  }
  function feedbackBack() { if (!requireTeacher()) return; activate($(state.feedbackBack) ? state.feedbackBack : state.back); }
  function feedbackText() {
    const t = teacher();
    return ['היי יהודית, אשמח לעזור לשפר את בוקי 💙', 'מורה: ' + (t?.name || 'מורה בבוקי'), 'נושא: ' + state.type,
      state.context ? 'סיפור: ' + state.context : '', '', state.draft.trim()].filter((s, i) => s || i === 4).join('\n');
  }
  function validFeedback() {
    const area = $('tw-feedback-message');
    if (!area || !area.value.trim()) { if (area) { area.setCustomValidity('כתבי כאן את ההצעה או הבקשה שלך.'); area.reportValidity(); } return false; }
    state.draft = area.value;
    return area.reportValidity();
  }
  function renderFeedback() {
    const body = $(ids.feedback).querySelector('.tw-body'); body.replaceChildren();
    body.append(el('p', 'הניסיון המקצועי שלך חשוב לנו. מה יעזור לך ולילדים לקרוא יותר בקלות ובהנאה?', 'tw-intro'));
    const form = el('form', undefined, 'tw-feedback-form');
    const label = el('label', 'על מה תרצי לכתוב?'); label.htmlFor = 'tw-feedback-type';
    const select = el('select'); select.id = 'tw-feedback-type'; ['הצעת שיפור', 'בקשה מיוחדת', 'הערה על תוכן'].forEach(value => { const o = el('option', value); o.value = value; select.append(o); }); select.value = state.type; select.onchange = () => { state.type = select.value; }; label.append(select); form.append(label);
    if (state.context) form.append(el('p', 'על הסיפור: ' + state.context, 'tw-preview-label'));
    const messageLabel = el('label', 'ההצעה או הבקשה שלך'); messageLabel.htmlFor = 'tw-feedback-message';
    const area = el('textarea'); area.id = 'tw-feedback-message'; area.rows = 7; area.maxLength = 1200; area.required = true; area.value = state.draft;
    area.placeholder = 'למשל: אשמח לסיפורים בנושא…, שמתי לב שקשה לילדים…, יעזור לי כפתור ש…';
    area.setAttribute('aria-describedby', 'tw-feedback-help');
    area.addEventListener('input', () => { area.setCustomValidity(''); state.draft = area.value; $('tw-feedback-status').textContent = ''; });
    messageLabel.append(area); form.append(messageLabel);
    const help = el('p', 'ההודעה תיפתח ב־WhatsApp ליהודית. השליחה מתבצעת רק שם, לא אוטומטית. אין צורך לכלול שמות או פרטים אישיים של תלמידים.', 'tw-small'); help.id = 'tw-feedback-help'; form.append(help);
    const send = el('button', 'להעביר את המשוב ב־WhatsApp ↗', 'tw-button tw-primary'); send.type = 'submit'; form.append(send);
    const status = el('p', undefined, 'tw-small'); status.id = 'tw-feedback-status'; status.setAttribute('role', 'status'); form.append(status);
    form.addEventListener('submit', event => {
      event.preventDefault(); if (!requireTeacher() || !validFeedback()) return;
      const url = SUPPORT + '?text=' + encodeURIComponent(feedbackText());
      window.open(url, '_blank', 'noopener,noreferrer');
      status.replaceChildren(el('span', 'המשוב מוכן. השלימי את השליחה ב־WhatsApp. לא נפתח? '));
      const link = el('a', 'פתיחת ההודעה'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; status.append(link);
    });
    form.append(btn('העתקת המשוב', async () => {
      if (!requireTeacher() || !validFeedback()) return;
      const uid = teacher().uid;
      try { await navigator.clipboard.writeText(feedbackText()); if (teacher()?.uid === uid) status.textContent = 'המשוב הועתק — אפשר להדביק ולשלוח ליהודית. הוא עדיין לא נשלח.'; }
      catch (_) { if (teacher()?.uid === uid) status.textContent = 'לא הצלחנו להעתיק. אפשר לסמן את הטקסט ולהעתיק ידנית, או להשתמש בכפתור WhatsApp.'; }
    }, 'tw-text-button'));
    body.append(form);
  }
  function action(icon, title, copy, run, primary = false) {
    const b = btn('', run, 'tw-dashboard-action' + (primary ? ' tw-primary' : ''));
    b.append(el('span', icon, 'tw-action-icon'));
    const text = el('span'); text.append(el('strong', title), el('small', copy)); b.append(text, el('span', '←', 'tw-action-arrow')); return b;
  }
  function install() {
    const body = document.querySelector('#screen-teacher-dashboard .td-body'); if (!body || $('tw-dashboard-actions')) return;
    document.querySelector('#screen-teacher-dashboard h2').textContent = 'המרחב שלך בבוקי';
    body.querySelectorAll('.teacher-management-only,.teacher-dashboard-guide,.btn-td-primary').forEach(node => node.remove());
    const actions = el('section', undefined, 'tw-dashboard-actions'); actions.id = 'tw-dashboard-actions'; actions.setAttribute('aria-label', 'פעולות למורה');
    const primary = el('div', undefined, 'tw-action-primary-group'); primary.append(el('p', 'מתחילות כאן', 'tw-eyebrow'), action('🌱', 'הקמת מועדון חדש', 'מוסיפים תלמידים ומזמינים אותם לקרוא יחד', () => showCreateClub(), true));
    const secondary = el('div', undefined, 'tw-action-secondary-group'); secondary.append(el('p', 'לרשותך בכל שלב', 'tw-eyebrow'));
    const pair = el('div', undefined, 'tw-secondary-pair');
    pair.append(action('📚', 'ספריית בוקי', 'להכיר את הסיפורים שהילדים קוראים', openLibrary), action('💬', 'עזרי לנו לשפר את בוקי', 'הצעות מקצועיות ובקשות מיוחדות', () => openFeedback())); secondary.append(pair);
    actions.append(primary, secondary); body.prepend(actions);
    const clubNotice = document.querySelector('#screen-teacher-club .teacher-management-only');
    if (clubNotice) clubNotice.replaceWith(btn('📚 ספריית בוקי — לעיון בתכנים', openLibrary, 'tw-text-button'));
    section(ids.library, 'ספריית בוקי', backToManagement);
    section(ids.reader, 'תצוגה מקדימה', returnToLibrary);
    section(ids.feedback, 'עזרי לנו לשפר את בוקי', feedbackBack);
    if (typeof onTeacherAuthChange === 'function') onTeacherAuthChange(t => {
      if (!t || t.uid !== state.uid) {
        state.uid = null; state.draft = ''; state.story = null; state.context = '';
        $(ids.feedback).querySelector('.tw-body').replaceChildren();
        if (Object.values(ids).some(id => $(id).classList.contains('active'))) showTeacherAuth('login');
      }
    });
  }
  const style = el('style');
  style.textContent = `
    .tw-screen,.tw-dashboard-actions{font-family:Arial,sans-serif;color:#253f35}
    .tw-dashboard-actions{display:grid;grid-template-columns:minmax(220px,.9fr) minmax(0,1.8fr);gap:18px;margin:0 0 28px}
    .tw-eyebrow{margin:0 0 9px;font-size:13px;font-weight:700;color:#546d60}
    .tw-secondary-pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .tw-dashboard-action{display:flex;align-items:center;gap:10px;text-align:right;width:100%;min-height:128px;padding:18px 14px;background:#fff;border:1px solid #cbded3;border-radius:18px;color:#294938;cursor:pointer;font-family:inherit;box-shadow:0 3px 12px #244f3810}
    .tw-dashboard-action strong,.tw-dashboard-action small{display:block}.tw-dashboard-action strong{font-size:18px;line-height:1.4}.tw-dashboard-action small{font-size:13px;line-height:1.6;margin-top:7px;color:#526e5e}
    .tw-action-icon{font-size:28px;flex-shrink:0}.tw-action-arrow{margin-inline-start:auto;flex-shrink:0}
    .tw-primary{background:#26714f!important;color:#fff!important;border-color:#26714f!important}.tw-primary small{color:#f0fff5}
    .tw-dashboard-action:hover,.tw-button:hover{box-shadow:0 3px 16px #244f3830}.tw-dashboard-action:focus-visible,.tw-screen button:focus-visible,.tw-screen a:focus-visible,.tw-screen input:focus-visible,.tw-screen select:focus-visible,.tw-screen textarea:focus-visible,.tw-screen summary:focus-visible{outline:3px solid #2877b8;outline-offset:3px}
    .tw-body{max-width:960px;margin:0 auto;padding:22px 20px 120px;box-sizing:border-box}.tw-screen .header-row{max-width:960px;margin:auto;gap:14px}.tw-screen h2{font-size:22px;line-height:1.4;margin:0;overflow-wrap:anywhere}.tw-intro{font-size:16px;line-height:1.75;margin:0 0 18px}
    .tw-tip{background:#f1f6f1;border:1px solid #d3e1d5;border-radius:14px;margin:16px 0;padding:14px 16px;line-height:1.7;font-size:14px}.tw-tip summary{cursor:pointer;font-weight:700;min-height:28px}.tw-tip p{margin:12px 0 0}
    .tw-library-tools{display:grid;grid-template-columns:1.4fr 1fr;gap:14px;margin:22px 0 12px}.tw-screen label{display:block;font-size:14px;font-weight:700;line-height:1.6}
    .tw-screen input,.tw-screen select,.tw-screen textarea{box-sizing:border-box;display:block;width:100%;min-width:0;background:#fff;color:#253f35;border:1px solid #b8cdbf;border-radius:12px;padding:13px 12px;margin-top:7px;font:16px Arial,sans-serif}.tw-screen textarea{resize:vertical;line-height:1.8}.tw-result-count{font-size:13px;color:#53695d}
    .tw-story-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:20px}.tw-story-card{font-family:inherit;text-align:right;display:flex;flex-direction:column;gap:10px;padding:18px;border:1px solid #d5e1d6;border-radius:18px;background:#fff;color:#253f35;cursor:pointer;min-height:185px}.tw-story-card:hover{border-color:#26714f;background:#fcfff9}.tw-story-card strong{font-size:20px;line-height:1.65;overflow-wrap:anywhere}.tw-story-card small{color:#53695d;line-height:1.5}.tw-story-emoji{font-size:30px}.tw-story-link{font-size:14px;font-weight:700;color:#26614a;margin-top:auto}.tw-empty{grid-column:1/-1;line-height:1.8}
    .tw-button{font:16px Arial,sans-serif;border:1px solid #b8cdbf;border-radius:12px;padding:12px 16px;min-height:46px;background:white;color:#285940;cursor:pointer}.tw-button[hidden]{display:none}.tw-button:disabled{opacity:.5;cursor:default}.tw-text-button{font:15px Arial,sans-serif;color:#275f4a;background:transparent;border:0;text-decoration:underline;text-underline-offset:4px;min-height:46px;padding:10px 4px;cursor:pointer}
    .tw-preview-label{background:#fff3d6;color:#69512c;padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.7}.tw-mode-controls{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}.tw-mode-controls [aria-pressed=true]{background:#26714f;color:white;border-color:#26714f}
    .tw-story-text{white-space:pre-line;font-size:clamp(23px,3vw,29px);line-height:1.95;background:white;border:1px solid #e0e7db;border-radius:20px;padding:28px 24px;min-height:190px;overflow-wrap:anywhere}.tw-illustration{text-align:center;font-size:88px;margin:12px 0}
    .tw-page-nav{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:22px 0}.tw-page-nav span{font-size:14px;text-align:center}.tw-feedback-form{max-width:640px;display:grid;gap:20px}.tw-small{font-size:13px;font-weight:400;line-height:1.8;color:#506258;margin:0}.tw-small a{color:#205c89}
    @media(max-width:760px){.tw-dashboard-actions{grid-template-columns:1fr;gap:20px}.tw-dashboard-action{min-height:114px}.tw-story-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tw-action-primary-group .tw-dashboard-action{min-height:100px}}
    @media(max-width:420px){.tw-secondary-pair{grid-template-columns:1fr}.tw-dashboard-action{min-height:88px}.tw-body{padding:16px 14px 120px}.tw-library-tools{grid-template-columns:1fr}.tw-story-grid{gap:10px}.tw-story-card{padding:12px;min-height:185px}.tw-story-card strong{font-size:18px}.tw-story-text{padding:20px 16px}.tw-page-nav{gap:6px}.tw-page-nav .tw-button{padding:10px;font-size:14px}.tw-screen h2{font-size:20px}}
  `;
  document.head.append(style);
  window.BookiTeacherWorkspace = { version: '20260909.1', openLibrary, openFeedback };
  window.showTeacherBookiLibrary = openLibrary;
  window.showTeacherFeedback = openFeedback;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})();
