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
    const result = originalShowScreen.apply(this, args);
    if (args[0] === 'screen-teacher-club') queueMicrotask(renderClubNextAction);
    return result;
  };


  async function renderClubNextAction() {
    const id = clubId(), uid = teacher()?.uid, revision = screenRevision;
    const action = $('tc-next-action'), summary = $('tc-class-summary');
    if (!id || !uid || !action || !summary || !active('screen-teacher-club')) return;
    action.disabled = true; action.textContent = 'טוען…'; action.onclick = null;
    summary.textContent = 'טוען את הכיתה…';
    const current = () => active('screen-teacher-club') && screenRevision === revision && clubId() === id && teacher()?.uid === uid;
    try {
      const members = await membersFor(id);
      if (!current()) return;
      const minutes = members.reduce((sum,m) => sum + Math.max(0,Number(m.cachedStats?.totalMinutes)||0),0);
      summary.textContent = members.length ? members.length + ' כרטיסים · ' + Math.round(minutes).toLocaleString('he-IL') + ' דקות קריאה' : 'הכיתה מוכנה לצירוף ילדים';
      action.textContent = members.length ? '📊 קריאה ועידוד' : 'לצרף ילדים';
      action.onclick = members.length ? () => window.showTeacherEncouragement() : () => showClubStudents();
      action.disabled = false;
    } catch (_) {
      if (!current()) return;
      summary.textContent = 'לא הצלחנו לטעון את הכיתה';
      action.textContent = 'לנסות שוב'; action.onclick = renderClubNextAction; action.disabled = false;
    }
  }

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
    const heading = document.querySelector('#screen-teacher-dashboard h2'); if (heading) heading.textContent = t.name ? 'היי, ' + t.name : 'טוב לראות אותך';
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
        : `נפתחו ${count} כרטיסי תלמידים. להוספת שמות, בחרי ״ילדי המועדון״ במועדון.`;
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
  function _teacherStoryTitle(session){
    if(session.storyTitle)return session.storyTitle;
    if(session.bookTitle)return session.bookTitle;
    const all=typeof getAllStories==='function'?getAllStories():[];
    return all.find(x=>String(x.id)===String(session.storyId))?.title||'סיפור';
  }
  async function _teacherMemberSessions(clubId,member){
    try{
      const cardId=member.id||member.userId;
      if(!cardId)return [];
      const snap=await window.db.collection('clubs').doc(clubId).collection('memberships').doc(cardId).collection('sessions').orderBy('createdAt','desc').limit(30).get({source:'server'});
      return snap.docs.map(d=>({id:d.id,...d.data()}));
    }catch(e){console.warn('[teacher-flow] sessions:',e.code||e.message);return [];}
  }
  function _openTeacherStoryText(storyId){
    const story=(typeof getAllStories==='function'?getAllStories():[]).find(x=>String(x.id)===String(storyId));
    if(!story)return;
    document.getElementById('booki-teacher-story-text')?.remove();
    const overlay=element('div',undefined,'booki-teacher-story-overlay');overlay.id='booki-teacher-story-text';
    const box=element('article',undefined,'booki-teacher-story-box');
    box.append(button('✕',()=>overlay.remove(),'booki-teacher-story-close'),element('h3',story.title||'הסיפור'));
    (story.pages||[]).forEach((p,i)=>box.append(element('p',(p.text||'').trim())));
    overlay.append(box);overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};document.body.append(overlay);
  }
  async function _toggleTeacherReadingDetail(card,clubId,member){
    let box=card.querySelector('.booki-student-sessions');
    if(box){box.remove();return;}
    box=element('div',undefined,'booki-student-sessions');box.append(element('p','טוען סיפורים…','td-loading'));card.append(box);
    const sessions=await _teacherMemberSessions(clubId,member);if(!box.isConnected)return;box.replaceChildren();
    const reads=sessions.filter(x=>['app','book','booki'].includes(x.type));
    if(!reads.length){box.append(element('p','עדיין אין פירוט סיפורים שנשמר לקריאות של הילד/ה.'));return;}
    reads.forEach(x=>{const row=element('div',undefined,'booki-session-row');const title=_teacherStoryTitle(x);const b=button(title,()=>x.storyId?_openTeacherStoryText(x.storyId):null,'booki-session-story');if(!x.storyId)b.disabled=true;row.append(b,element('span',Math.round(Number(x.minutes)||0)+' דק׳'));box.append(row);});
  }
  async function _teacherEncouragementStatus(clubId,member){
    try{
      const cardId=member.id||member.userId;if(!cardId)return null;
      const snap=await window.db.collection('clubs').doc(clubId).collection('messages').where('toUserId','==',cardId).get({source:'server'});
      const msgs=snap.docs.map(d=>({id:d.id,...d.data()})).filter(m=>m.type==='encouragement').sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
      if(!msgs.length)return null;
      const latest=msgs[0],seen=new Set(member.seenMessageIds||[]);
      return {seen:seen.has(latest.id),text:latest.text};
    }catch(e){return null;}
  }
  function renderEncouragement(target, members, id) {
    target.replaceChildren();
    if (!members.length) {
      notice(target, 'עדיין אין כרטיסים בכיתה.');
      target.appendChild(button('קישור הכיתה', () => { showScreen('screen-teacher-club'); openTeacherClubShare(); }));
      return;
    }
    const sum = key => members.reduce((n,m)=>n+Math.max(0,Number(m.cachedStats?.[key])||0),0);
    const total=sum('totalMinutes'), aloud=sum('readAloudMinutes'), noNiq=sum('noNiqudMinutes'), full=sum('fullNiqudMinutes');
    const hero=element('section',undefined,'booki-reading-hero');
    hero.append(element('h3','תמונת מצב כיתתית'));
    const metrics=element('div',undefined,'booki-reading-metrics');
    [['📚',total,'דקות קריאה'],['🎙️',aloud,'דקות בקול'],['✨',noNiq,'דקות בלי ניקוד']].forEach(([icon,value,label])=>{
      const card=element('div',undefined,'booki-reading-metric');card.append(element('b',icon+' '+Math.round(value).toLocaleString('he-IL')),element('span',label));metrics.append(card);
    });
    hero.append(metrics,element('p','הפירוט של ניקוד וקריאה בקול נאסף מקריאות שנשמרו בגרסה החדשה.','booki-reading-note'));
    target.append(hero,element('h3','הילדים','booki-reading-list-title'));
    const list=element('div',undefined,'booki-reading-students');
    [...members].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'he',{numeric:true})).forEach(m=>{
      const name=String(m.name||'תלמיד/ה'),empty=name.startsWith('כרטיס פנוי ')&&!m.claimedByUid,st=m.cachedStats||{};
      const card=element('article',undefined,'booki-reading-student');
      const top=element('div',undefined,'booki-reading-student-top');
      top.append(element('strong',name),element('span',Math.round(Number(st.totalMinutes)||0)+' דקות'));
      const detail=element('div',undefined,'booki-reading-breakdown');
      detail.append(element('span','🎙️ '+Math.round(Number(st.readAloudMinutes)||0)+' בקול'),element('span','אָ '+Math.round(Number(st.fullNiqudMinutes)||0)+' עם ניקוד'),element('span','✨ '+Math.round(Number(st.noNiqudMinutes)||0)+' בלי ניקוד'));
      const last=element('small','קריאה אחרונה: '+lastRead(st.lastReadAt));
      const storyToggle=button('📚 אילו סיפורים?',()=>_toggleTeacherReadingDetail(card,id,m),'booki-reading-stories-toggle');
      card.append(top,detail,last,storyToggle);
      if(!empty){
        const encouragementState=element('small','בודק אם העידוד נקרא…','booki-encouragement-state');card.append(encouragementState);
        _teacherEncouragementStatus(id,m).then(st=>{if(!encouragementState.isConnected)return;encouragementState.textContent=!st?'עדיין לא נשלח עידוד':st.seen?'✓ העידוד האחרון נקרא':'💌 העידוד האחרון עדיין לא נקרא';encouragementState.dataset.seen=st?.seen?'1':'0';});
        const actions=element('div',undefined,'booki-reading-actions');
        actions.append(button('💙 עידוד',()=>openEncouragementModal(id,m.id||m.userId,name),'booki-reading-action'),button('📖 שליחת סיפור',()=>openStoryRecommendation(id,m.id||m.userId,name),'booki-reading-action'));
        card.append(actions);
      }
      list.append(card);
    });
    target.append(list);
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
      const rawMembers = await membersFor(id);
      const members = await Promise.all(rawMembers.map(async m => {
        if (!String(m.name || '').startsWith('כרטיס פנוי ') || !m.claimedByUid) return m;
        const name = window.BookiClassSlots?.effectiveName ? await window.BookiClassSlots.effectiveName(m) : '';
        return {...m, name: name || m.name};
      }));
      if (current()) renderEncouragement(target, members, id);
    } catch (error) {
      if (!current()) return;
      target.replaceChildren(); notice(target, 'לא הצלחנו לטעון את נתוני הקריאה. נסי שוב.', () => window.showTeacherEncouragement());
      console.warn('[teacher-flow] encouragement read failed:', error.code || error.message);
    }
  };

  function installUi() {
    const misplaced = document.querySelector('#screen-create-name .teacher-step-help');
    if (misplaced) misplaced.textContent = 'בחרי שם וסמל למועדון. בשלב הבא מוסיפים ילדים.';
    const actions = [...document.querySelectorAll('#screen-teacher-club .tc-action-choice')];
    const encourage = actions.find(el => el.textContent.includes('לשלוח עידוד'));
    if (encourage) encourage.setAttribute('onclick', 'showTeacherEncouragement()');
    const join = actions.find(el => el.textContent.includes('לצרף ילדים'));
    if (join?.querySelector('small')) join.querySelector('small').textContent = 'להוסיף תלמידים ולשלוח קישור להורים';
    const copy = document.querySelector('[onclick="copyJoinLink()"]'); if (copy) copy.textContent = '📋 העתקת הודעה וקישור להורים';
    if (!$('screen-teacher-encouragement')) {
      const screen = element('section', undefined, 'screen'); screen.id = 'screen-teacher-encouragement'; screen.dir = 'rtl';
      const header = element('div', undefined, 'screen-header sticky-header'), row = element('div', undefined, 'header-row');
      row.append(button('חזרה →', () => showScreen('screen-teacher-club'), 'btn-back'), element('h2', 'קריאה ועידוד'));
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
    .booki-reading-hero{background:#fffdf7;border:1px solid #dce7dc;border-radius:24px;padding:18px;margin:4px 0 22px}.booki-reading-hero h3,.booki-reading-list-title{margin:0 0 14px;color:#285b46}.booki-reading-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.booki-reading-metric{background:#f1f7f1;border-radius:16px;padding:13px 8px;text-align:center;display:flex;flex-direction:column;gap:4px}.booki-reading-metric b{font-size:20px}.booki-reading-metric span{font-size:12px;color:#536b5d}.booki-reading-note{font-size:12px;color:#6a786f;margin:12px 0 0}.booki-reading-students{display:grid;gap:12px}.booki-reading-student{background:#fff;border:1px solid #dce7dc;border-radius:20px;padding:15px}.booki-reading-student-top{display:flex;justify-content:space-between;gap:10px;align-items:center}.booki-reading-student-top strong{font-size:17px;color:#244f3e}.booki-reading-student-top span{font-weight:700;color:#315f4b}.booki-reading-breakdown{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.booki-reading-breakdown span{background:#f4f7f2;border-radius:999px;padding:6px 9px;font-size:12px}.booki-reading-student small{color:#68766d}.booki-reading-actions{display:flex;gap:8px;margin-top:12px}.booki-reading-action{flex:1;min-height:42px;border:1px solid #c8d9ca;border-radius:13px;background:#f8fbf7;color:#285b46;font-weight:700}
        .booki-encouragement-table{width:100%;border-collapse:collapse;background:#fff;table-layout:fixed;text-align:right;font-family:inherit;font-size:15px}
    .booki-encouragement-table th,.booki-encouragement-table td{padding:12px 8px;border-bottom:1px solid #e5ece6;overflow-wrap:anywhere;vertical-align:middle}
    .booki-encouragement-table thead th{background:#edf6f8;color:#244d65;font-weight:700}.booki-encouragement-table th:first-child{width:32%}.booki-encouragement-table th:last-child{width:52px}
    .booki-encouragement-table tbody th{font-weight:600}.booki-encouragement-heart{min-width:44px;min-height:44px;border:0;border-radius:12px;background:#edf6ff;cursor:pointer;font-size:24px}
    .booki-encouragement-heart:focus-visible{outline:3px solid #2877b8;outline-offset:2px}.booki-encouragement-heart:hover{background:#dceeff}
    @media(max-width:400px){.booki-reading-metrics{grid-template-columns:1fr 1fr}.booki-reading-metric:first-child{grid-column:1/-1}.booki-reading-actions{flex-direction:column}.booki-encouragement-content{padding:10px 8px 90px}.booki-encouragement-table{font-size:13px}.booki-encouragement-table th,.booki-encouragement-table td{padding:10px 4px}.booki-encouragement-table th:last-child{width:46px}.booki-flow-empty{padding:18px 14px}}
  `;
  document.head.appendChild(css);
  window.BookiTeacherFlow = { version: '2026-09-09.1', parentInvite, installUi };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installUi, { once: true });
  else installUi();
  if (active('screen-teacher-club')) renderClubNextAction();
  // Dynamic loading can finish after the initial route: update only the screen still visible.
  if (active('screen-teacher-dashboard') && teacher()) window.showTeacherDashboard();
  else if (active('screen-who-reads') && clubId()) window.showWhoReads(clubId());
})();
