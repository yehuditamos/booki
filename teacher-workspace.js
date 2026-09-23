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
  const state = { uid: null, back: 'screen-teacher-dashboard', feedbackBack: null, query: '', shelf: '', libraryScope: 'public', limit: 24, story: null, page: 0, mode: 'full', revealed: false, draft: '', type: 'הצעת שיפור', context: '' };
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
    // Teacher preview must never fall through to a child-reading route.
    state.back='screen-teacher-dashboard';activate('screen-teacher-dashboard', false);
  }
  function allStories() { const source=typeof STORIES!=='undefined'&&Array.isArray(STORIES)?STORIES:(typeof getAllStories==='function'?getAllStories():[]);return source.filter(s=>Array.isArray(s.pages)&&s.pages.length).filter(s=>state.libraryScope==='kosher'?(s.libraryId==='kosher'||s.tags?.includes?.('כשר')):s.libraryId!=='teacher-private'); }
  function shelves() { return typeof BOOKI_LIBRARY_SHELVES !== 'undefined' ? BOOKI_LIBRARY_SHELVES : []; }
  function belongs(story, shelf) {
    return typeof _storyBelongsToShelf === 'function' ? _storyBelongsToShelf(story, shelf) : (shelf.libraries || []).includes(story.libraryId);
  }
  function tip(title, paragraphs) {
    const details = el('details', undefined, 'tw-tip'); details.append(el('summary', title));
    paragraphs.forEach(text => details.append(el('p', text))); return details;
  }
  function openLibrary(scope='public') {
    if (!requireTeacher()) return;
    state.back='screen-teacher-dashboard';state.libraryScope=scope;state.query='';state.shelf='';state.limit=24;renderLibrary();activate(ids.library);
  }
  function renderLibrary() {
    const body = $(ids.library).querySelector('.tw-body'); body.replaceChildren();
    body.append(el('p', state.libraryScope==='kosher'?'סיפורי הספרייה הכשרה לעיון שלך — בלי לבחור תלמיד ובלי לצבור דקות או נקודות.':'כל הסיפורים שבספריית בוקי, לעיון שלך — בלי לבחור תלמיד ובלי לצבור עבורו דקות או נקודות.', 'tw-intro'));
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
    const screen = $('screen-teacher-dashboard');
    screen.classList.add('tw-home');
    const heading = screen.querySelector('h2');
    heading.textContent = teacher()?.name ? 'היי, ' + teacher().name : 'טוב לראות אותך';
    body.querySelectorAll('.teacher-management-only,.teacher-dashboard-guide,.btn-td-primary').forEach(node => node.remove());
    const head = screen.querySelector('.screen-header');
    head.prepend(el('p', 'בוקי · המרחב שלך', 'tw-brand-label'));
    const actions = el('section', undefined, 'tw-dashboard-actions'); actions.id = 'tw-dashboard-actions'; actions.setAttribute('aria-label', 'ספריות הסיפורים');
    const sectionTitle = body.querySelector('.td-section-title');
    const clubBar = el('div', undefined, 'tw-club-bar');
    sectionTitle.before(clubBar); clubBar.append(sectionTitle, btn('+ מועדון חדש', () => showCreateClub(), 'tw-new-club'));
    const intro = el('div', undefined, 'tw-library-heading');
    intro.append(el('span', 'מילים שפותחות עולמות', 'tw-eyebrow'), el('h3', 'הסיפורים מתחילים כאן'));
    actions.append(intro);
    const displayBox=el('section',undefined,'tw-display-folders');
    displayBox.append(el('strong','מה יוצג לילדים?'),el('p','סמני את הספריות שתרצי להציג. אפשר לבחור יותר מאחת.'));
    const displayChoices=el('div',undefined,'tw-display-choice-grid');
    const defs=[['public','📚','ספריית בוקי'],['private','✍️','הספרייה הפרטית שלי'],['kosher','✡️','ספרייה כשרה']];
    const selected=new Set(['public']);
    const checks=[];
    defs.forEach(([value,icon,label])=>{
      const lab=el('label',undefined,'tw-display-choice');const input=document.createElement('input');input.type='checkbox';input.value=value;input.checked=value==='public';
      input.onchange=()=>{input.checked?selected.add(value):selected.delete(value);lab.classList.toggle('is-selected',input.checked);};
      lab.classList.toggle('is-selected',input.checked);lab.append(input,el('span',icon,'tw-display-icon'),el('span',label));displayChoices.append(lab);checks.push(input);
    });
    const status=el('p','כרגע רק הספריות המסומנות יוצגו לילדים.','tw-display-status');
    const apply=btn('החל על כל המועדונים',async()=>{
      const a=teacher();if(!a||!selected.size){status.textContent='בחרי לפחות ספרייה אחת.';return;}
      apply.disabled=true;status.textContent='שומרת לכל המועדונים…';
      const key=[...selected].sort().join('+'),map={'public':'public','private':'private','kosher':'kosher','private+public':'both','kosher+private':'kosher-private','kosher+public':'kosher-public','kosher+private+public':'all'};
      const mode=map[key];if(!mode){status.textContent='לא ניתן לשמור את הבחירה.';apply.disabled=false;return;}
      try{const snap=await window.db.collection('clubs').where('teacherUid','==',a.uid).get({source:'server'});await Promise.all(snap.docs.filter(d=>!d.data().hidden).map(d=>d.ref.update({libraryMode:mode})));status.textContent='נשמר ✓ מעכשיו רק הספריות המסומנות יוצגו לילדים בכל המועדונים.';}
      catch(e){status.textContent='לא הצלחנו לשמור. נסי שוב.';}finally{apply.disabled=false;}
    },'tw-apply-display');
    displayBox.append(displayChoices,apply,status);actions.append(displayBox);
    const pair = el('div', undefined, 'tw-library-pair');
    const shelf = (title, copy, run, personal) => {
      const card = btn('', run, 'tw-library-link' + (personal ? ' tw-library-personal' : ''));
      const art = el('span', undefined, 'tw-book-art'); art.setAttribute('aria-hidden','true');
      for(let i=0;i<3;i++) art.append(el('i'));
      const text = el('span', undefined, 'tw-library-copy');
      text.append(el('strong',title),el('small',copy));
      card.append(art,text,el('span','←','tw-library-arrow'));return card;
    };
    pair.append(shelf('סיפורי בוקי','לעיון בסיפורים של בוקי',openLibrary,false),shelf('הספרייה הפרטית שלי','להוסיף ולערוך את הסיפורים שלך',()=>window.BookiPrivateLibrary?.open(),true),shelf('ספרייה כשרה','לעיון בסיפורי הצדיקים',()=>openLibrary('kosher'),false));
    actions.append(pair); body.append(actions);
    const footer = el('footer', undefined, 'tw-home-footer');
    footer.append(btn('יש לך רעיון לבוקי?', () => openFeedback(), 'tw-footer-link'));
    const existingActions=screen.querySelector('.header-actions');
    if(existingActions){footer.append(existingActions);existingActions.querySelector('.btn-share-app').textContent='שיתוף בוקי';}
    body.append(footer);
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
    .tw-display-folders{grid-column:1/-1;background:#f7fbf8;border:1px solid #cbded3;border-radius:20px;padding:16px 18px}.tw-display-folders>strong{font-size:17px}.tw-display-folders>p{margin:5px 0 12px;color:#61746a;font-size:13px}.tw-display-choice-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.tw-display-choice{display:flex;align-items:center;gap:8px;border:2px solid #d7e4da;border-radius:14px;padding:11px;background:#fff;cursor:pointer;font-weight:700}.tw-display-choice.is-selected{border-color:#2d7957;background:#eef8f1}.tw-display-choice input{width:20px;height:20px;accent-color:#2d7957}.tw-display-icon{font-size:20px}.tw-apply-display{margin-top:12px;width:100%;min-height:44px;border:0;border-radius:13px;background:#2d7957;color:#fff;font-weight:800}.tw-display-status{margin:8px 0 0!important;font-size:12px!important;color:#526e5e!important}@media(max-width:620px){.tw-display-choice-grid{grid-template-columns:1fr}.tw-library-pair{grid-template-columns:1fr!important}}
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
  style.textContent += "\n    #screen-teacher-dashboard.tw-home{background:#fcf7eb;font-family:Arial,sans-serif;color:#263f36}\n    .tw-home .screen-header{background:transparent;border:0;padding:30px 24px 16px;position:static;box-shadow:none;max-width:900px;margin:auto;box-sizing:border-box}\n    .tw-home .header-row{display:block}.tw-home .screen-header h2{font:700 clamp(26px,5vw,36px)/1.3 Arial,sans-serif;text-align:right;margin:0;overflow-wrap:anywhere;color:#203e32}\n    .tw-brand-label{font-size:12px;letter-spacing:.04em;color:#526b5d;margin:0 0 12px;font-weight:700}\n    .tw-home #td-teacher-name{display:none}\n    .tw-home .td-body{max-width:900px;margin:auto;padding:10px 24px 110px;box-sizing:border-box}\n    .tw-club-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 0 16px}\n    .tw-home .td-section-title{margin:0;font-size:18px;color:#294536}\n    .tw-new-club{font:700 14px Arial,sans-serif;min-height:44px;padding:10px 16px;border:0;border-radius:999px;background:#28694e;color:#fff;cursor:pointer;white-space:nowrap}\n    .tw-home .td-clubs-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}\n    .tw-home .teacher-club-card{display:flex;align-items:center;gap:14px;background:#fffefb;border:1px solid #e2e7dc;border-radius:18px;padding:18px;margin:0;min-height:96px;box-shadow:0 4px 14px #264e3610;box-sizing:border-box;transition:transform .15s,border-color .15s}\n    .tw-home .teacher-club-card:hover{border-color:#7caa8e;transform:translateY(-2px)}\n    .tw-home .tc-emoji{font-size:32px;flex-shrink:0;max-width:48px}.tw-home .tc-emoji img{width:44px;height:44px;object-fit:contain}\n    .tw-home .tc-info{min-width:0;flex:1}.tw-home .tc-name{display:block;font:700 19px/1.35 Arial,sans-serif;color:#263e34;overflow-wrap:anywhere}\n    .tw-home .tc-meta{display:block;font:14px/1.6 Arial,sans-serif;color:#375e4a;margin-top:6px}\n    .tw-home .tc-actions{flex-shrink:0;margin:0}.tw-home .btn-tc-delete{min-width:44px;min-height:44px;border:0;background:transparent;font-size:17px;opacity:.7}\n    .tw-home .td-empty{grid-column:1/-1;background:#edf3e6;border:1px dashed #abc1aa;border-radius:18px;text-align:center;padding:26px 18px}\n    .tw-home .tw-dashboard-actions{display:block;margin:30px 0 0;padding:22px;background:#efeedd;border:0;border-radius:22px}\n    .tw-library-heading .tw-eyebrow{font-size:12px;color:#58705d;margin:0 0 5px}.tw-library-heading h3{font-size:21px;line-height:1.4;margin:0 0 18px;color:#2f4838}\n    .tw-library-pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}\n    .tw-library-link{position:relative;display:flex;align-items:center;gap:12px;text-align:right;font-family:Arial,sans-serif;color:#294537;border:0;border-radius:15px;padding:18px;background:#fffdf5;cursor:pointer;min-width:0}\n    .tw-library-personal{background:#e1eadb}.tw-library-copy{min-width:0;flex:1}.tw-library-copy strong{display:block;font-size:17px;line-height:1.4}.tw-library-copy small{display:block;font-size:13px;line-height:1.5;margin-top:4px;color:#49634f}\n    .tw-library-arrow{font-size:20px}.tw-book-art{position:relative;display:block;width:42px;height:45px;flex:0 0 42px;transform:rotate(-9deg)}\n    .tw-book-art i{position:absolute;bottom:0;width:12px;height:36px;border-radius:3px 3px 1px 1px;background:#728e69;border-top:5px solid #a7b795;box-shadow:inset 2px 0 #0000000b}\n    .tw-book-art i:nth-child(1){right:0;height:42px;background:#cf9a5e;border-color:#e4ba88}.tw-book-art i:nth-child(2){right:14px}.tw-book-art i:nth-child(3){right:28px;height:30px;background:#668c86;border-color:#aac1ad}\n    .tw-home-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:18px 2px;margin-top:8px}\n    .tw-home-footer .header-actions{display:flex;gap:12px}.tw-footer-link,.tw-home-footer .btn-share-app,.tw-home-footer .btn-logout{font:13px Arial,sans-serif!important;color:#506655!important;min-height:44px;padding:8px 2px!important;border:0!important;background:transparent!important;box-shadow:none!important;cursor:pointer}\n    .tw-home button:focus-visible,.tw-home [role=button]:focus-visible{outline:3px solid #276d50;outline-offset:3px}\n    @media(max-width:600px){.tw-home .screen-header{padding:24px 18px 12px}.tw-home .td-body{padding:6px 16px 110px}.tw-home .td-clubs-list{grid-template-columns:1fr}.tw-home .teacher-club-card{padding:16px;min-height:90px}.tw-home .tw-dashboard-actions{padding:18px;margin-top:26px}.tw-library-pair{grid-template-columns:1fr;gap:9px}.tw-library-link{padding:15px;min-height:82px}.tw-library-heading h3{font-size:20px;margin-bottom:14px}}\n    @media(prefers-reduced-motion:reduce){.tw-home .teacher-club-card{transition:none}}\n";
  document.head.append(style);
  window.BookiTeacherWorkspace = { version: '20260909.1', openLibrary, openFeedback };
  window.showTeacherBookiLibrary = openLibrary;
  window.showTeacherFeedback = openFeedback;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})();

