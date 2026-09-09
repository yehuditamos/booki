/**
 * Teacher/parent pilot UX. Loaded by initial-setup.js after routing.js.
 * Keeps the existing data model, permissions, consent gates and reading flow.
 * Server read failures are never interpreted as an empty club/list.
 */
(function () {
  'use strict';
  if (window.BookiTeacherFlow) return;
  const $ = id => document.getElementById(id);
  const teacher = () => typeof getCurrentTeacher === 'function' ? getCurrentTeacher() : null;
  const active = id => $(id)?.classList.contains('active');
  const clubId = () => typeof _activeClubId !== 'undefined' ? _activeClubId : window.currentClubId;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const cache = new Map(); // In-memory, keyed by authenticated teacher UID; never used for authorization.
  let dashboardRequest = 0, membersRequest = 0, encouragementRequest = 0, screenRevision = 0;
  let cacheUid = null;

  function element(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function button(text, action, className = 'btn-giant btn-outline-green') {
    const el = element('button', text, className);
    el.type = 'button'; el.addEventListener('click', action); return el;
  }
  function withTimeout(promise, ms = 10000) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('booki-read-timeout')), ms);
    })]).finally(() => clearTimeout(timer));
  }
  async function serverGet(ref) {
    if (!ref?.get) throw new Error('booki-database-unavailable');
    const snapshot = await withTimeout(ref.get({ source: 'server' }));
    // A cache-only empty result does not prove that the club has no children.
    if (snapshot.metadata?.fromCache) throw new Error('booki-server-not-confirmed');
    return snapshot;
  }
  function clubsRef() {
    if (!window.db) throw new Error('booki-database-unavailable');
    return window.db.collection('clubs');
  }
  async function membersFor(id) {
    const snap = await serverGet(clubsRef().doc(id).collection('memberships'));
    return snap.docs.map(d => ({ ...d.data(), userId: d.data().userId || d.id })).filter(m => m.status !== 'left');
  }
  function notice(target, text, retry) {
    const box = element('div', undefined, 'booki-flow-notice');
    box.setAttribute('role', 'status');
    box.appendChild(element('p', text));
    if (retry) box.appendChild(button('לנסות שוב', retry));
    target.appendChild(box);
  }
  function stateFor(uid) {
    if (cacheUid !== uid) { cache.clear(); cacheUid = uid; }
    if (!cache.has(uid)) cache.set(uid, { clubs: [], pending: new Map(), role: null });
    return cache.get(uid);
  }

  // Screen revisions prevent late requests repainting a screen after the user leaves it.
  const originalShowScreen = window.showScreen;
  window.showScreen = function (...args) {
    screenRevision++;
    return originalShowScreen.apply(this, args);
  };

  // Seed only after the existing server write has actually succeeded.
  const originalCreateClub = window.fbCreateClub;
  window.fbCreateClub = async function (club) {
    const ok = await originalCreateClub.apply(this, arguments);
    if (ok && teacher()?.uid === club.teacherUid) {
      const state = stateFor(club.teacherUid);
      state.pending.set(club.id, { club: { ...club }, at: Date.now() });
      state.clubs = [club, ...state.clubs.filter(c => c.id !== club.id)];
    }
    return ok;
  };
  const originalDeleteClub = window.fbDeleteClub;
  window.fbDeleteClub = async function (id) {
    const uid = teacher()?.uid;
    const ok = await originalDeleteClub.apply(this, arguments);
    if (ok && uid && cache.has(uid)) {
      const state = cache.get(uid);
      state.pending.delete(id); state.clubs = state.clubs.filter(c => c.id !== id);
    }
    return ok;
  };
  if (typeof onTeacherAuthChange === 'function') onTeacherAuthChange(t => {
    if (!t || (cacheUid && t.uid !== cacheUid)) {
      cache.clear(); cacheUid = t?.uid || null; dashboardRequest++;
      if ($('td-clubs-list')) $('td-clubs-list').replaceChildren();
    }
  });

  function renderClubCards(uid, clubs) {
    const list = $('td-clubs-list'); if (!list || teacher()?.uid !== uid) return;
    list.replaceChildren(); list.setAttribute('aria-busy', 'false');
    if (!clubs.length) {
      const empty = element('div', undefined, 'td-empty');
      empty.append(element('p', 'עדיין לא יצרת מועדון קריאה'), button('🌳 הקמת מועדון ראשון', () => showCreateClub(), 'btn-giant btn-green'));
      list.appendChild(empty); return;
    }
    for (const c of clubs) {
      const card = element('div', undefined, 'teacher-club-card');
      card.tabIndex = 0; card.setAttribute('role', 'button');
      const enter = () => enterTeacherClub(c.id);
      card.addEventListener('click', enter);
      card.addEventListener('keydown', e => { if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); enter(); } });
      const info = element('div', undefined, 'tc-info');
      const meta = element('span', 'טוען מספר תלמידים…', 'tc-meta');
      info.append(element('span', c.name || 'המועדון שלי', 'tc-name'), meta);
      const actions = element('div', undefined, 'tc-actions');
      actions.addEventListener('click', e => e.stopPropagation());
      const remove = button('🗑', () => confirmDeleteClub(c.id, c.name || 'המועדון שלי'), 'btn-tc-delete');
      remove.title = 'מחק מועדון'; remove.setAttribute('aria-label', 'מחיקת ' + (c.name || 'המועדון'));
      actions.appendChild(remove);
      card.append(element('span', c.emoji || '📚', 'tc-emoji'), info, actions);
      list.appendChild(card);
      membersFor(c.id).then(members => {
        if (card.isConnected && teacher()?.uid === uid) meta.textContent = `👥 ${members.length} תלמידים`;
      }).catch(() => { if (card.isConnected) meta.textContent = 'מספר התלמידים לא נטען'; });
    }
  }

  async function refreshClubs(uid) {
    const request = ++dashboardRequest;
    const revision = screenRevision;
    const current = () => request === dashboardRequest && revision === screenRevision && active('screen-teacher-dashboard') && teacher()?.uid === uid;
    const list = $('td-clubs-list'); if (!list || teacher()?.uid !== uid) return;
    const state = stateFor(uid);
    if (state.clubs.length) renderClubCards(uid, state.clubs);
    else { list.replaceChildren(element('p', 'טוען את המועדונים שלך…', 'td-loading')); list.setAttribute('aria-busy', 'true'); }
    try {
      const snap = await serverGet(clubsRef().where('teacherUid', '==', uid));
      if (!current()) return;
      let clubs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      for (const [id, pending] of state.pending) {
        if (clubs.some(c => c.id === id)) state.pending.delete(id);
        else if (Date.now() - pending.at < 60000) clubs.push(pending.club);
        else state.pending.delete(id);
      }
      state.clubs = clubs;
      renderClubCards(uid, clubs);
    } catch (error) {
      if (!current()) return;
      renderClubCards(uid, state.clubs);
      // Remove the true-empty call to action when the server has NOT confirmed emptiness.
      if (!state.clubs.length) list.replaceChildren();
      notice(list, state.clubs.length
        ? 'הצגנו את המועדונים שכבר נטענו. לא הצלחנו לרענן כרגע — אין צורך להקים אותם שוב.'
        : 'לא הצלחנו לטעון את המועדונים כרגע. זו שגיאת טעינה, לא סימן שהמועדונים נמחקו.', () => refreshClubs(uid));
      console.warn('[teacher-flow] dashboard read failed:', error.code || error.message);
    }
  }
  window._renderTeacherClubs = refreshClubs;

  async function showDashboard(t) {
    t = t || teacher();
    if (!t || t.uid !== teacher()?.uid) { showTeacherAuth('login'); return; }
    window._currentTeacher = t;
    const name = $('td-teacher-name'); if (name) name.textContent = t.name || t.email;
    const list = $('td-clubs-list');
    if (list) { list.replaceChildren(element('p', 'טוען את המועדונים שלך…', 'td-loading')); list.setAttribute('aria-busy', 'true'); }
    setNavVisible(false); showScreen('screen-teacher-dashboard');
    const revision = screenRevision;
    const current = () => revision === screenRevision && active('screen-teacher-dashboard') && teacher()?.uid === t.uid;
    try {
      // Preserve the deferred consent gate; this module neither enables nor bypasses it.
      if (window.BookiBasicConsentReady) await withTimeout(window.BookiBasicConsentReady);
      if (window.BookiBasicConsent && !await window.BookiBasicConsent.requireTeacher(t)) return;
      if (!current()) return;
      const state = stateFor(t.uid);
      if (!state.role) {
        const doc = await serverGet(window.db?.collection('users').doc(t.uid));
        state.role = doc.data()?.role || 'teacher';
      }
      if (!current()) return;
      if (state.role === 'owner' && typeof showOwnerDashboard === 'function') {
        showOwnerDashboard({ ...t, role: 'owner' }); return;
      }
      await refreshClubs(t.uid);
    } catch (error) {
      if (!current() || !list) return;
      list.replaceChildren(); list.setAttribute('aria-busy', 'false');
      notice(list, 'לא הצלחנו להשלים את הטעינה. אין צורך להקים את המועדון מחדש.', () => showDashboard(t));
      console.warn('[teacher-flow] dashboard setup failed:', error.code || error.message);
    }
  }
  showDashboard.__bookiConsent = true; // Gate above replaces only the equivalent wrapper.
  window.showTeacherDashboard = showDashboard;
  window._goBackToTeacherDashboard = () => window.showTeacherDashboard();

  function parentInvite(club) {
    return [
      `📚 הורים יקרים, פתחנו לילדים את מועדון הקריאה "${club.name || 'שלנו'}" בבוקי!`,
      'הילדים בוחרים סיפורים, קוראים וצוברים דקות קריאה יחד עם הכיתה 💙',
      'נכנסים לקישור, בוחרים את שם הילד או הילדה ומתחילים. אם עדיין אין שמות, המורה עוד מכינה את הרשימה — חזרו לאותו קישור בהמשך.',
      '', club.joinLink,
      club.joinCode ? 'קוד המועדון: ' + club.joinCode : '',
      '📌 שמרו את ההודעה — זה הקישור הקבוע שלנו לקריאה.'
    ].filter(Boolean).join('\n');
  }
  function successClub() {
    return { name: _newClub.name, joinLink: _buildJoinLink(), joinCode: _clubCode };
  }
  function currentInvite() {
    const club = window._currentTeacherClubData;
    return club?.joinLink ? parentInvite(club) : null;
  }
  window._teacherClubShareText = currentInvite;
  window._teacherClubHomeText = currentInvite;
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
    const field = element('textarea'); field.value = text;
    field.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(field); field.select();
    try { return document.execCommand('copy'); } catch (_) { return false; } finally { field.remove(); }
  }
  window.copyJoinLink = async function () {
    const ok = await copyText(parentInvite(successClub()));
    const el = document.querySelector('[onclick="copyJoinLink()"]');
    if (el) { el.textContent = ok ? '✅ ההודעה והקישור הועתקו' : 'ההעתקה לא הצליחה — נסי לשתף'; }
  };
  window.shareCodesWhatsApp = function () {
    const text = parentInvite(successClub());
    if (navigator.share) navigator.share({ text }).catch(e => {
      if (e.name !== 'AbortError') window.copyJoinLink();
    });
    else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
  };

  function emptyClub(grid, id) {
    grid.replaceChildren();
    const box = element('div', undefined, 'who-reads-empty booki-flow-empty');
    box.setAttribute('role', 'status');
    box.append(element('div', '🌱', 'booki-flow-empty-icon'), element('h3', 'הגעתם למקום הנכון!'),
      element('p', 'המורה עדיין לא הוסיפה את שמות הילדים למועדון, ולכן הרשימה ריקה כרגע.'),
      element('p', 'אחרי שהמורה תוסיף את הילדים, השמות יופיעו כאן. חזרו לאותו קישור, בחרו את השם שלכם והתחילו לקרוא 📚'),
      button('🔄 בדיקה מחדש', () => window.showWhoReads(id)));
    grid.appendChild(box);
    const footer = document.querySelector('#screen-who-reads .who-reads-footer'); if (footer) footer.replaceChildren();
  }
  const originalMemberGrid = window._renderFirebaseMemberGrid;
  window._renderFirebaseMemberGrid = function (grid, members, id) {
    if (grid?.id === 'who-reads-grid' && !members.some(m => m.status !== 'left')) { emptyClub(grid, id); return; }
    return originalMemberGrid.apply(this, arguments);
  };
  const originalSuccess = window._renderSuccessScreen;
  window._renderSuccessScreen = function (...args) {
    originalSuccess.apply(this, args);
    const note = document.querySelector('#success-guide .success-next-notice p');
    if (note) {
      const count = _createdCardsCount;
      note.textContent = count === _newClub.members.length && count > 0
        ? `נפתחו ${count} כרטיסי תלמידים. העתיקי את ההודעה והקישור ושלחי להורים.`
        : `נפתחו ${count} כרטיסי תלמידים. להוספת שמות, חזרי למועדון ובחרי ״לצרף ילדים״ ואז ״צרף תלמידים״. עד להוספת השמות, ההורים יראו שהמועדון עדיין בהכנה.`;
      if (args[0]?.invitationCreated === false) note.append(' קוד ההצטרפות לא נוצר — נסי לשתף שוב מתוך מסך המועדון.');
    }
  };

  const originalWhoReads = window.showWhoReads;
  window.showWhoReads = async function (id) {
    id = id || clubId();
    if (!id || (typeof getBootstrapClubById === 'function' && getBootstrapClubById(id))) return originalWhoReads.apply(this, arguments);
    _activeClubId = id; window.currentClubId = id;
    const request = ++membersRequest;
    const grid = $('who-reads-grid'), title = document.querySelector('.who-reads-title');
    if (!grid) return;
    if (title) title.textContent = 'מועדון הקריאה';
    if ($('who-reads-club-name')) $('who-reads-club-name').textContent = '';
    document.querySelector('#screen-who-reads .who-reads-footer')?.replaceChildren();
    grid.replaceChildren(element('p', 'טוען את שמות הילדים…', 'td-loading'));
    setNavVisible(false); showScreen('screen-who-reads');
    const revision = screenRevision;
    const current = () => request === membersRequest && revision === screenRevision && active('screen-who-reads') && clubId() === id;
    try {
      const [doc, members] = await Promise.all([serverGet(clubsRef().doc(id)), membersFor(id)]);
      if (!current()) return;
      if (!doc.exists) {
        grid.replaceChildren(); notice(grid, 'לא מצאנו את המועדון הזה. בקשו מהמורה לבדוק את הקישור.'); return;
      }
      const club = doc.data();
      if (club.hidden) { _showHiddenClubMessage(); return; }
      if (title) title.textContent = `${club.emoji || '📚'} ${club.name || 'מועדון הקריאה'}`;
      window._renderFirebaseMemberGrid(grid, members, id);
    } catch (error) {
      if (!current()) return;
      grid.replaceChildren(); notice(grid, 'לא הצלחנו לטעון את רשימת הילדים כרגע. בדקו את החיבור ונסו שוב.', () => window.showWhoReads(id));
      console.warn('[teacher-flow] member list read failed:', error.code || error.message);
    }
  };

  window.bookiAddClubStudents = async function () {
    if (!teacher()) { showTeacherAuth('login'); return; }
    const id = clubId();
    await showClubStudents();
    if (!active('screen-club-students') || clubId() !== id) return;
    const form = $('add-student-form'); if (form) form.style.display = '';
    const section = $('add-student-section'); if (section) section.style.display = '';
    $('add-student-name-input')?.focus();
    form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  function lastRead(value) {
    const date = value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : new Date(value);
    if (!value || !Number.isFinite(date.getTime())) return 'טרם קרא/ה';
    return date.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: 'numeric' });
  }
  function renderEncouragement(target, members, id) {
    target.replaceChildren();
    if (!members.length) { notice(target, 'עדיין אין תלמידים במועדון. אפשר להוסיף אותם בכפתור ״צרף תלמידים״ במסך המועדון.'); return; }
    const table = element('table', undefined, 'booki-encouragement-table');
    table.setAttribute('aria-label', 'תלמידים, נתוני קריאה ושליחת עידוד');
    const head = document.createElement('thead'), header = document.createElement('tr');
    ['תלמיד/ה', 'דקות קריאה', 'קריאה אחרונה', 'עידוד'].forEach(label => { const th = element('th', label); th.scope = 'col'; header.appendChild(th); });
    head.appendChild(header); table.appendChild(head);
    const body = document.createElement('tbody');
    [...members].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'he')).forEach(m => {
      const row = document.createElement('tr');
      const name = String(m.name || 'תלמיד/ה');
      const nameCell = element('th', name); nameCell.scope = 'row';
      const minutes = Number(m.cachedStats?.totalMinutes);
      const heart = button('💙', () => openEncouragementModal(id, m.userId, name), 'booki-encouragement-heart');
      heart.title = 'שליחת עידוד ל' + name; heart.setAttribute('aria-label', heart.title);
      const action = document.createElement('td'); action.appendChild(heart);
      row.append(nameCell, element('td', String(Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0)), element('td', lastRead(m.cachedStats?.lastReadAt)), action);
      body.appendChild(row);
    });
    table.appendChild(body); target.appendChild(table);
  }
  window.showTeacherEncouragement = async function () {
    if (!teacher()) { showTeacherAuth('login'); return; }
    const id = clubId(); if (!id) return;
    const request = ++encouragementRequest;
    const uid = teacher().uid;
    const target = $('booki-encouragement-content'); if (!target) return;
    target.replaceChildren(element('p', 'טוען את נתוני הקריאה…', 'td-loading'));
    setNavVisible(false); showScreen('screen-teacher-encouragement');
    const revision = screenRevision;
    const current = () => request === encouragementRequest && revision === screenRevision && active('screen-teacher-encouragement') && clubId() === id && teacher()?.uid === uid;
    try {
      const members = await membersFor(id);
      if (current()) renderEncouragement(target, members, id);
    } catch (error) {
      if (!current()) return;
      target.replaceChildren(); notice(target, 'לא הצלחנו לטעון את נתוני הקריאה. נסי שוב.', () => window.showTeacherEncouragement());
      console.warn('[teacher-flow] encouragement read failed:', error.code || error.message);
    }
  };

  function installUi() {
    const createForm = document.querySelector('#screen-create-members .form-card');
    if (createForm && !$('booki-members-help')) {
      const help = element('div', undefined, 'teacher-step-help booki-members-help'); help.id = 'booki-members-help';
      help.append(element('strong', 'פותחים כרטיס אישי לכל ילד וילדה'),
        element('p', 'הוסיפי שמות אחד־אחד, או הדביקי רשימה — שם אחד בכל שורה. אחרי יצירת המועדון תשלחי להורים קישור, והילדים יבחרו את שמם ויתחילו לקרוא.'),
        element('p', 'אפשר גם לדלג ולהוסיף אחר כך בכפתור ״צרף תלמידים״. עד שתוסיפי שמות, הילדים יראו הודעה שהמועדון עדיין בהכנה.'));
      createForm.prepend(help);
      const indicator = document.querySelector('#screen-create-members .step-indicator'); if (indicator) indicator.textContent = 'שלב 3 מתוך 3 — הוספת תלמידים';
    }
    const misplaced = document.querySelector('#screen-create-name .teacher-step-help');
    if (misplaced) misplaced.textContent = 'בחרי שם וסמל למועדון. בשלב הבא תוכלי להוסיף את שמות הילדים.';
    const actions = [...document.querySelectorAll('#screen-teacher-club .tc-action-choice')];
    const encourage = actions.find(el => el.textContent.includes('לשלוח עידוד'));
    if (encourage) encourage.setAttribute('onclick', 'showTeacherEncouragement()');
    const join = actions.find(el => el.textContent.includes('לצרף ילדים'));
    if (join?.querySelector('small')) join.querySelector('small').textContent = 'להוסיף תלמידים ולשלוח קישור להורים';
    const panel = $('tc-share-panel');
    if (panel && !$('booki-add-students-button')) {
      const add = button('＋ צרף תלמידים', () => window.bookiAddClubStudents(), 'btn-giant btn-green');
      add.id = 'booki-add-students-button'; panel.prepend(add);
      const heading = panel.querySelector('.tc-share-heading');
      if (heading) heading.appendChild(element('p', 'ההודעה להורים כוללת הסבר קצר על מועדון הקריאה, בחירת שם הילד וקישור קבוע לכניסה.', 'booki-parent-share-help'));
    }
    const copy = document.querySelector('[onclick="copyJoinLink()"]'); if (copy) copy.textContent = '📋 העתקת הודעה וקישור להורים';
    if (!$('screen-teacher-encouragement')) {
      const screen = element('section', undefined, 'screen'); screen.id = 'screen-teacher-encouragement'; screen.dir = 'rtl';
      const header = element('div', undefined, 'screen-header sticky-header'), row = element('div', undefined, 'header-row');
      row.append(button('חזרה →', () => showScreen('screen-teacher-club'), 'btn-back'), element('h2', 'לשלוח עידוד 💙'));
      header.appendChild(row);
      const content = element('div', undefined, 'booki-encouragement-content'); content.id = 'booki-encouragement-content';
      screen.append(header, content); document.body.appendChild(screen);
    }
  }
  const css = element('style'); css.id = 'booki-teacher-flow-style';
  css.textContent = `
    .booki-members-help{line-height:1.65;text-align:right}.booki-members-help p{margin:7px 0}.booki-members-help p:last-child{font-size:.9em}
    .booki-parent-share-help{margin:8px 0 0;line-height:1.6;font-size:14px}
    .booki-flow-empty,.booki-flow-notice{grid-column:1/-1;box-sizing:border-box;width:100%;max-width:540px;margin:12px auto;padding:20px;text-align:center;line-height:1.65;overflow-wrap:anywhere}
    .booki-flow-empty{background:#fffdf5;border:1px solid #dae8d8;border-radius:22px}.booki-flow-empty h3{margin:4px 0 10px;color:#286747}.booki-flow-empty p{margin:10px 0}.booki-flow-empty-icon{font-size:34px}
    .booki-flow-notice p{margin:0 0 14px}.booki-flow-notice button{max-width:280px;margin:auto}
    #booki-add-students-button{font-weight:700}.booki-encouragement-content{max-width:760px;margin:auto;padding:14px 12px 90px}
    .booki-encouragement-table{width:100%;border-collapse:collapse;background:#fff;table-layout:fixed;text-align:right;font-family:inherit;font-size:15px}
    .booki-encouragement-table th,.booki-encouragement-table td{padding:12px 8px;border-bottom:1px solid #e5ece6;overflow-wrap:anywhere;vertical-align:middle}
    .booki-encouragement-table thead th{background:#edf6f8;color:#244d65;font-weight:700}.booki-encouragement-table th:first-child{width:32%}.booki-encouragement-table th:last-child{width:52px}
    .booki-encouragement-table tbody th{font-weight:600}.booki-encouragement-heart{min-width:44px;min-height:44px;border:0;border-radius:12px;background:#edf6ff;cursor:pointer;font-size:24px}
    .booki-encouragement-heart:focus-visible{outline:3px solid #2877b8;outline-offset:2px}.booki-encouragement-heart:hover{background:#dceeff}
    @media(max-width:400px){.booki-encouragement-content{padding:10px 8px 90px}.booki-encouragement-table{font-size:13px}.booki-encouragement-table th,.booki-encouragement-table td{padding:10px 4px}.booki-encouragement-table th:last-child{width:46px}.booki-flow-empty{padding:18px 14px}}
  `;
  document.head.appendChild(css);
  window.BookiTeacherFlow = { version: '2026-09-09.1', parentInvite, installUi };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installUi, { once: true });
  else installUi();
  // Dynamic loading can finish after the initial route: update only the screen still visible.
  if (active('screen-teacher-dashboard') && teacher()) window.showTeacherDashboard();
  else if (active('screen-who-reads') && clubId()) window.showWhoReads(clubId());
})();
