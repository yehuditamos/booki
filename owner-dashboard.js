/** Owner dashboard: distinct reader cards in active clubs, rolling time windows.
 * Server snapshots, bounded club membership reads, no analytics event counters.
 * Existing maintenance actions remain under the secondary management section.
 */

// ─── Entry Point ─────────────────────────────────────────────────────────────

function showOwnerDashboard(teacher) {
  window._currentTeacher = teacher;
  if (!window.db) {
    alert('Firestore לא מוכן עדיין — נסה שוב בעוד שנייה');
    return;
  }
  if (typeof showScreen !== 'function') return;
  const nameEl = document.getElementById('od-owner-name');
  if (nameEl) nameEl.textContent = teacher?.name || teacher?.email || '';
  if (typeof setNavVisible === 'function') setNavVisible(false);
  showScreen('screen-owner-dashboard');
  _odLoad();
}

// ─── Main Loader — 5 קריאות מקבילות ──────────────────────────────────────────

let _odSnapshot=null, _odLoadVersion=0, _odPeriod='48h';
const _odIsTest=o=>o?.isTest===true||o?.isDemo===true||o?.demo===true||o?.test===true;
function _odTimestamp(value){
 const ms=value?.toMillis?value.toMillis():value?.toDate?value.toDate().getTime():new Date(value||'').getTime();
 return Number.isFinite(ms)?ms:null;
}
function _odReaderMatches(member,period,now){
 if(member.status==='left'||_odIsTest(member)||['teacher','owner'].includes(member.role))return false;
 if(!member.claimedByUid&&!member.personalized&&/^כרטיס פנוי\s+\d+$/.test(member.name||''))return false;
 const stats=member.cachedStats||{};
 if(!(Number(stats.totalMinutes)>0))return false;
 if(period==='all')return true;
 const last=_odTimestamp(stats.lastReadAt),span=period==='7d'?7*86400000:2*86400000;
 return last!==null&&last<=now&&last>=now-span;
}
async function _odLoad(){
 const version=++_odLoadVersion, status=document.getElementById('od-status');
 if(status)status.textContent='טוענת נתוני קריאה…';
 _odSnapshot=null;
 ['od-reader-count','od-active-clubs','od-teacher-count','od-teacher-started','od-lifetime-minutes'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent='—';});
 document.getElementById('od-clubs-list')?.replaceChildren(_odNode('p','טוענת מועדונים…'));
 try{
  const user=typeof firebase!=='undefined'?firebase.auth().currentUser:null;
  if(!user||user.isAnonymous)throw Error('נדרשת כניסה לחשבון הניהול');
  const uid=user.uid,db=window.db,owner=await db.collection('users').doc(uid).get({source:'server'});
  if(!owner.exists||owner.data().role!=='owner')throw Error('נדרשת כניסה לחשבון הניהול');
  const [ts,cs]=await Promise.all([db.collection('users').get({source:'server'}),db.collection('clubs').get({source:'server'})]);
  const users=ts.docs.map(d=>({...d.data(),id:d.id}));
  const teachers=users.filter(u=>['teacher','owner'].includes(u.role));
  const allClubs=cs.docs.map(d=>({...d.data(),id:d.id})).filter(c=>!_odIsTest(c));
  const clubs=allClubs.filter(c=>!c.hidden);
  const memberships=new Map(),failed=new Set();
  // Bound concurrent reads; no per-child requests and no changes to reading data.
  let next=0;
  await Promise.all(Array.from({length:Math.min(4,allClubs.length)},async()=>{
   while(next<allClubs.length){
    if(version!==_odLoadVersion||firebase.auth().currentUser?.uid!==uid)return;
    const c=allClubs[next++];
    try{const snap=await db.collection('clubs').doc(c.id).collection('memberships').get({source:'server'});memberships.set(c.id,snap.docs.map(d=>({...d.data(),id:d.id})));}
    catch(e){failed.add(c.id);}
   }
  }));
  if(version!==_odLoadVersion||firebase.auth().currentUser?.uid!==uid)return;
  const activeFailed=new Set([...failed].filter(id=>clubs.some(c=>c.id===id)));
  _odSnapshot={teachers,clubs,memberships,failed:activeFailed};_odRenderReading();
  // Lifetime totals are independent of the selected activity window. Read persisted
  // cumulative counters, not the last 150 history items or analytics events.
  _odLoadLifetime({version,uid,users,allClubs,memberships,failed});
  if(status)status.textContent=failed.size?'חלק מהמועדונים לא נטענו — לחצי לרענון':'עודכן '+new Date().toLocaleTimeString('he-IL');
 }catch(e){if(version!==_odLoadVersion)return;if(status)status.textContent='לא ניתן לטעון כרגע. נסי לרענן.';}
}
function _odSavedMinutes(record){
 const n=Number(record?.cachedStats?.totalMinutes??record?.totalMinutes??0);
 return Number.isFinite(n)&&n>0?n:0;
}
function _odLifetimeClubMinutes(members){
 const ids=new Set(members.map(m=>m.id));
 return members.reduce((sum,m)=>{
  // Repaired cards carry the old total forward. Keep departed cards without a
  // successor, but never count both sides of a completed migration.
  if(_odIsTest(m)||['teacher','owner'].includes(m.role)||(m.migratedTo&&ids.has(m.migratedTo)))return sum;
  return sum+_odSavedMinutes(m);
 },0);
}
async function _odLoadLifetime({version,uid,users,allClubs,memberships,failed}){
 const el=document.getElementById('od-lifetime-minutes'),note=document.getElementById('od-lifetime-note');
 const current=()=>version===_odLoadVersion&&firebase.auth().currentUser?.uid===uid;
 if(note)note.textContent='טוענת את הדקות המצטברות מכל התקופות…';
 let minutes=allClubs.reduce((n,c)=>n+_odLifetimeClubMinutes(memberships.get(c.id)||[]),0),incomplete=failed.size>0;
 const jobs=users.filter(u=>!_odIsTest(u)&&!['teacher','owner'].includes(u.role)).map(u=>async()=>{
  const snap=await window.db.collection('users').doc(u.id).collection('profile').doc('main').get({source:'server'});
  if(snap.exists&&!_odIsTest(snap.data()))minutes+=_odSavedMinutes(snap.data());
 });
 try{
  const classes=await window.db.collection('classes').get({source:'server'});
  const ids=new Set(classes.docs.filter(d=>!_odIsTest(d.data())).map(d=>d.id));
  // Old installations may have student documents without a parent class document.
  if(typeof CLASS_ID==='string'&&!classes.docs.some(d=>d.id===CLASS_ID&&_odIsTest(d.data())))ids.add(CLASS_ID);
  for(const id of ids)jobs.push(async()=>{
   const snap=await window.db.collection('classes').doc(id).collection('students').get({source:'server'});
   minutes+=_odLifetimeClubMinutes(snap.docs.map(d=>({...d.data(),id:d.id})));
  });
 }catch(e){incomplete=true;}
 let next=0;
 await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{
  while(next<jobs.length&&current()){try{await jobs[next++]();}catch(e){incomplete=true;}}
 }));
 if(!current())return;
 if(el)el.textContent=incomplete?'—':minutes.toLocaleString('he-IL',{maximumFractionDigits:2});
 if(note)note.textContent=incomplete?'חלק מהנתונים לא נטענו — רענני לקבלת הסך המלא':'סך הדקות השמור מכל התקופות · כולל מועדונים מוסתרים, קריאה אישית והמערכת הישנה';
}
function _odSetPeriod(period){
 if(!['48h','7d','all'].includes(period))return;
 _odPeriod=period;_odRenderReading();
}
function _odContact(parent,teacher){
 const details=_odNode('details',undefined,'od-contact'),summary=_odNode('summary','יצירת קשר');details.append(summary);
 const phone=String(teacher.phone||'').trim(),email=String(teacher.email||'').trim();
 if(phone){const clean=phone.replace(/[^+0-9]/g,'');if(/^\+?\d{7,15}$/.test(clean)){const a=_odNode('a','📞 '+phone);a.href='tel:'+clean;details.append(a);}}
 if(email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){const a=_odNode('a','✉️ '+email);a.href='mailto:'+encodeURIComponent(email);details.append(a);}
 if(details.children.length===1)details.append(_odNode('p','לא נמסרו פרטי קשר'));
 parent.append(details);
}
function _odRenderReading(){
 if(!_odSnapshot)return;
 const {teachers,clubs,memberships,failed}=_odSnapshot,now=Date.now();
 const label=_odPeriod==='48h'?'ב־48 השעות האחרונות':_odPeriod==='7d'?'ב־7 הימים האחרונים':'מאז ההתחלה';
 const set=(id,text)=>{const e=document.getElementById(id);if(e)e.textContent=text;};
 set('od-reader-label','ילדים שקראו '+label);set('od-active-label','מועדונים שבהם קראו '+label);
 document.querySelectorAll('[data-od-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.odPeriod===_odPeriod)));
 const teacherList=teachers.filter(t=>t.role==='teacher'&&!_odIsTest(t));
 set('od-teacher-count',teacherList.length);
 set('od-teacher-started',teacherList.filter(t=>clubs.some(c=>c.teacherUid===t.id)).length+' פתחו מועדון פעיל');
 const counts=new Map();let total=0,active=0;
 for(const c of clubs){const count=(memberships.get(c.id)||[]).filter(m=>_odReaderMatches(m,_odPeriod,now)).length;counts.set(c.id,count);total+=count;if(count)active++;}
 set('od-reader-count',failed.size?'—':total);set('od-active-clubs',failed.size?'—':active);
 set('od-count-note',failed.size?'חסרים נתונים — רענני כדי לקבל ספירה מלאה':'במועדונים הפעילים · כל כרטיס ילד נספר פעם אחת');
 const sorted=clubs.slice().sort((a,b)=>(counts.get(b.id)-counts.get(a.id))||String(a.name||'').localeCompare(String(b.name||''),'he'));
 _odRenderClubs(sorted);
 const list=document.getElementById('od-clubs-list');
 if(!sorted.length&&teacherList.length)list.replaceChildren();
 sorted.forEach((club,i)=>{
  const section=list.children[i],manager=teachers.find(t=>t.id===club.teacherUid)||{name:club.teacherName,email:club.teacherEmail};
  const heading=_odNode('p',failed.has(club.id)?'נתוני הקריאה לא נטענו':`${counts.get(club.id)} ילדים קראו ${label}`,'od-club-reading');section.prepend(heading);
  const contact=_odNode('div',undefined,'od-manager');contact.append(_odNode('strong',manager.name||club.teacherName||'מנהל/ת המועדון'));_odContact(contact,manager);section.append(contact);
 });
 for(const t of teacherList.filter(t=>!clubs.some(c=>c.teacherUid===t.id))){
  const row=_odNode('div',undefined,'od-club-browser');row.append(_odNode('strong',t.name||'מורה ללא שם'),_odNode('p','עדיין אין מועדון פעיל'));_odContact(row,t);list.append(row);
 }
}

// ─── Teacher List — pure computation ─────────────────────────────────────────

function _odRenderTeachers(teachers, clubs) {
  const set    = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const listEl = document.getElementById('od-teachers-list');

  set('od-total-teachers', String(teachers.length));

  if (!teachers.length) {
    if (listEl) listEl.innerHTML = '<div class="od-empty">אין מורות רשומות</div>';
    return;
  }

  // Group clubs by teacherUid — ממידע שכבר נטען, ללא קריאה נוספת
  const clubsByTeacher = {};
  for (const c of clubs) {
    if (!c.teacherUid) continue;
    (clubsByTeacher[c.teacherUid] ??= []).push(c);
  }

  let totalStudents = 0;
  const rows = teachers.map(t => {
    const tClubs       = clubsByTeacher[t.id] || [];
    const clubCount    = tClubs.length;
    const studentCount = tClubs.reduce((s, c) => s + (c.memberCount ?? 0), 0);
    totalStudents     += studentCount;
    const lastLogin    = (t.lastLoginAt || t.createdAt || '').slice(0, 10);
    const roleLabel    = t.role === 'owner' ? ' 👑' : '';
    return `<div class="od-row">
      <div style="flex:1;min-width:0">
        <span class="od-row-label">${t.name || '—'}${roleLabel}</span>
        <span style="font-size:.8em;color:#888;display:block">${t.email || ''} · כניסה: ${lastLogin}</span>
      </div>
      <span class="od-badge">${clubCount} מועדונים · ${studentCount} תלמידים</span>
    </div>`;
  });

  set('od-total-students', String(totalStudents));
  if (listEl) listEl.innerHTML = rows.join('');
}

// ─── Club List — pure computation ────────────────────────────────────────────

function _odBrowseClubs() {
  const list = document.getElementById('od-clubs-list');
  list?.scrollIntoView({behavior:'smooth',block:'start'});
  list?.querySelector('button')?.focus({preventScroll:true});
}
function _odNode(tag, text, cls) {
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=String(text);
  if(cls)el.className=cls;
  return el;
}
function _odReadDate(value) {
  if(!value)return 'עדיין לא קרא/ה';
  const date=value.toDate?value.toDate():new Date(value);
  return Number.isNaN(date.getTime())?'—':date.toLocaleString('he-IL',{dateStyle:'short',timeStyle:'short'});
}
function _odRenderClubs(clubs) {
  const list=document.getElementById('od-clubs-list');
  const total=document.getElementById('od-total-clubs');
  if(total)total.textContent=String(clubs.length);
  if(!list)return;
  list.replaceChildren();
  if(!clubs.length){list.appendChild(_odNode('div','אין מועדונים','od-empty'));return;}
  for(const club of clubs){
    const section=_odNode('div',undefined,'od-club-browser');
    const row=_odNode('div',undefined,'od-row');
    row.style.flexWrap='wrap';
    const label=_odNode('div');label.style.flex='1';label.style.minWidth='150px';
    label.appendChild(_odNode('strong',(club.emoji||'📚')+' '+(club.name||club.id),'od-row-label'));
    label.appendChild(_odNode('div',club.teacherName||club.teacherEmail||'','od-lbl'));
    if(club.hidden)label.appendChild(_odNode('span','מוסתר','od-hidden-badge'));
    const open=_odNode('button','צפייה בתלמידים','od-btn-sm');open.type='button';
    open.style.minHeight='44px';open.setAttribute('aria-expanded','false');
    const panel=_odNode('div');panel.hidden=true;panel.id='od-members-'+encodeURIComponent(club.id);
    open.setAttribute('aria-controls',panel.id);
    let loaded=false,busy=false;
    open.onclick=async()=>{
      panel.hidden=!panel.hidden;open.setAttribute('aria-expanded',String(!panel.hidden));
      open.textContent=panel.hidden?'צפייה בתלמידים':'סגירת התלמידים';
      if(panel.hidden||loaded||busy)return;
      busy=true;panel.textContent='טוען תלמידים…';panel.setAttribute('role','status');
      try {
        const user=typeof firebase!=='undefined'?firebase.auth().currentUser:null;
        if(!user||user.isAnonymous)throw Error('owner-only');
        const uid=user.uid,owner=await window.db.collection('users').doc(uid).get({source:'server'});
        if(!owner.exists||owner.data().role!=='owner')throw Error('owner-only');
        const cached=_odSnapshot?.memberships.get(club.id);
        const snap=cached?{docs:cached.map(m=>({id:m.id,data:()=>m}))}:await window.db.collection('clubs').doc(club.id).collection('memberships').get({source:'server'});
        if(firebase.auth().currentUser?.uid!==uid||!panel.isConnected)return;
        const members=snap.docs.map(d=>({...d.data(),id:d.id})).filter(m=>m.status!=='left');
        const isOpen=m=>!m.claimedByUid&&!m.personalized&&/^כרטיס פנוי\s+\d+$/.test(m.name||'');
        members.sort((a,b)=>Number(_odReaderMatches(b,_odPeriod,Date.now()))-Number(_odReaderMatches(a,_odPeriod,Date.now()))||Number(isOpen(a))-Number(isOpen(b))||String(a.name||'').localeCompare(String(b.name||''),'he',{numeric:true}));
        panel.replaceChildren();panel.removeAttribute('role');
        const free=members.filter(isOpen).length;
        panel.appendChild(_odNode('p',`${members.length-free} ילדים עם שם · ${free} כרטיסים פנויים`));
        if(!members.length)panel.appendChild(_odNode('p','עדיין לא הוספו ילדים למועדון.'));
        for(const m of members){
          const card=_odNode('div',undefined,'od-row');card.style.flexWrap='wrap';
          const identity=_odNode('strong');identity.style.cssText='display:flex;align-items:center;gap:10px;min-width:0';
          const icon=_odNode('span');icon.style.cssText='display:inline-flex;width:44px;height:44px;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;border-radius:12px;font-size:30px';
          _setAvatarEl(icon,m.emoji||m.avatar||'📚');
          const img=icon.querySelector('img');if(img)img.style.cssText='width:100%;height:100%;object-fit:contain';
          identity.append(icon,_odNode('span',m.name||'כרטיס ללא שם'));card.appendChild(identity);
          const details=_odNode('span');details.style.fontSize='.85rem';
          const n=Number(m.cachedStats?.totalMinutes);
          details.textContent=isOpen(m)?'ממתין לבחירת ילד/ה':`${Number.isFinite(n)?Math.max(0,Math.round(n)):0} דקות · ${_odReadDate(m.cachedStats?.lastReadAt)}`;
          card.appendChild(details);panel.appendChild(card);
        }
        loaded=true;
      }catch(error){
        panel.replaceChildren(_odNode('p',error.message==='owner-only'?'הצפייה זמינה מחשבון הניהול של יהודית.':'לא הצלחתי לטעון את התלמידים. נסי שוב.'));
        const retry=_odNode('button','ניסיון נוסף','od-btn-sm');retry.type='button';retry.onclick=()=>{panel.hidden=true;open.onclick();};panel.appendChild(retry);
      }finally{busy=false;}
    };
    row.append(label,open);
    const maintenance=_odNode('details');maintenance.appendChild(_odNode('summary','אפשרויות'));
    const toggle=_odNode('button',club.hidden?'שחזר':'הסתר','od-btn-sm');toggle.type='button';
    toggle.onclick=()=>club.hidden?_odRestoreClub(club.id):_odMarkClubHidden(club.id);maintenance.appendChild(toggle);
    if(club.id!=='mitarim-aleph-2025'){
      const repair=_odNode('button','🔧 סרוק','od-btn-sm');repair.type='button';repair.onclick=()=>showCardRepairTool(club.id);maintenance.appendChild(repair);
    }
    row.appendChild(maintenance);section.append(row,panel);list.appendChild(section);
  }
}

// ─── Card Repair Tool — Scan, Dry-Run, Execute ───────────────────────────────

var _repairCardCache    = {};
var _repairActiveClubId = null;

async function showCardRepairTool(clubId) {
  const section = document.getElementById('od-repair-section');
  const content = document.getElementById('od-repair-content');
  const nameEl  = document.getElementById('od-repair-club-name');
  if (!section || !content) return;

  content.innerHTML = '<div class="od-empty">סורק...</div>';
  section.style.display = '';
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const clubSnap = await window.db.collection('clubs').doc(clubId).get();
    const clubName = clubSnap.exists ? (clubSnap.data().name || clubId) : clubId;
    if (nameEl) nameEl.textContent = clubName;

    _repairActiveClubId = clubId;
    _repairCardCache    = {};

    const broken = await _scanBrokenCards(clubId);

    if (!broken.length) {
      content.innerHTML = '<div class="od-empty">✅ לא נמצאו כרטיסים שבורים במועדון זה</div>';
      return;
    }

    broken.forEach(function (card) { _repairCardCache[card.cardId] = card; });

    content.innerHTML =
      '<p style="font-size:.85rem;color:#c0392b;margin:.5rem 0 1rem">נמצאו ' + broken.length + ' כרטיסים שבורים:</p>' +
      broken.map(function (card, i) { return _buildRepairRow(clubId, card, i); }).join('');

  } catch (e) {
    content.innerHTML = '<div class="od-empty">שגיאה: ' + e.message + '</div>';
  }
}

async function _scanBrokenCards(clubId) {
  const db = window.db;

  const teacherUids  = new Set();
  const teacherNames = {};

  // Primary source: club document has teacherUid directly
  const clubSnap = await db.collection('clubs').doc(clubId).get();
  if (clubSnap.exists) {
    var cd = clubSnap.data();
    if (cd.teacherUid) {
      teacherUids.add(cd.teacherUid);
      teacherNames[cd.teacherUid] = cd.teacherName || cd.teacherEmail || cd.teacherUid;
    }
  }

  // Secondary source: users collection (may be empty if role field is absent)
  try {
    const uSnap = await db.collection('users').where('role', 'in', ['teacher', 'owner']).get();
    uSnap.forEach(function (d) {
      teacherUids.add(d.id);
      teacherNames[d.id] = d.data().name || d.data().email || d.id;
    });
  } catch (_) {};

  const mSnap  = await db.collection('clubs').doc(clubId).collection('memberships').get();
  const broken = [];

  console.log('[scan] club:', clubId, '| total memberships:', mSnap.docs.length);
  console.log('[scan] teacherUids:', Array.from(teacherUids));

  for (var i = 0; i < mSnap.docs.length; i++) {
    var d = mSnap.docs[i];
    var m = d.data();

    console.log('[scan] card:', d.id, '| name:', m.name, '| status:', m.status,
      '| createdByTeacher:', m.createdByTeacher, '| student_:', d.id.startsWith('student_'));

    if (m.status === 'left')            continue;
    if (d.id.startsWith('student_'))    continue;

    var flags = [];

    if (m.userId && teacherUids.has(m.userId))
      flags.push('userId is teacher: ' + teacherNames[m.userId]);

    if (m.claimedByUid && teacherUids.has(m.claimedByUid))
      flags.push('claimedByUid is teacher: ' + teacherNames[m.claimedByUid]);

    // Self-joined card: not teacher-created, not already in student_xxx format
    // Vulnerable to UID drift (new device / cleared browser = can't save minutes)
    if (!m.createdByTeacher && !flags.length)
      flags.push('self-joined card — UID-locked (vulnerable to session/device change)');

    console.log('[scan] → flags:', flags);

    var profileName = null;
    if (m.userId) {
      try {
        var pSnap = await db.collection('users').doc(m.userId).collection('profile').doc('main').get();
        if (pSnap.exists) {
          profileName = (pSnap.data().name || '').trim();
          var cardName = (m.name || '').trim();
          if (profileName && cardName && profileName !== cardName && teacherUids.has(m.userId))
            flags.push('profile "' + profileName + '" != card "' + cardName + '"');
        }
      } catch (_) {}
    }

    if (flags.length) {
      broken.push({
        cardId:          d.id,
        name:            m.name            || '-',
        userId:          m.userId          || '-',
        claimedByUid:    m.claimedByUid    || null,
        createdByTeacher: m.createdByTeacher || false,
        personalized:    m.personalized    || false,
        emoji:           m.emoji           || '📚',
        joinedAt:        m.joinedAt        || null,
        cachedStats:     m.cachedStats     || {},
        flags:           flags,
        profileName:     profileName,
      });
    }
  }

  return broken;
}

function _buildRepairRow(clubId, card, index) {
  var stats     = card.cachedStats || {};
  var flagsHtml = card.flags.map(function (f) {
    return '<span style="display:inline-block;background:#fde8e8;color:#c0392b;border-radius:4px;padding:1px 6px;font-size:.78em;margin:1px">' + f + '</span>';
  }).join(' ');

  var previewId = 'student_' + Date.now().toString(36) + String(index);

  var newCardJson = JSON.stringify({
    userId:           previewId + '  (final ID generated at write time)',
    name:             card.name,
    emoji:            card.emoji,
    createdByTeacher: true,
    personalized:     false,
    claimedByUid:     null,
    status:           'active',
    migratedFrom:     card.cardId,
    cachedStats: {
      totalMinutes:  stats.totalMinutes  || 0,
      totalSessions: stats.totalSessions || 0,
      totalPoints:   stats.totalPoints   || 0,
      totalBooks:    stats.totalBooks    || 0,
      appMinutes:    stats.appMinutes    || 0,
      bookMinutes:   stats.bookMinutes   || 0,
      lastReadAt:    stats.lastReadAt    || null,
    },
  }, null, 2);

  var oldUpdateJson = JSON.stringify({
    status:     'left',
    migratedTo: previewId + '  (same ID as new card)',
    updatedAt:  '(now)',
  }, null, 2);

  var fixBtn =
    '<button class="od-btn-sm" style="margin-top:10px;background:#c0392b;color:#fff"' +
    ' onclick="_executeCardRepair(\'' + clubId + '\',\'' + card.cardId + '\')">🔧 תקן כרטיס זה</button>';

  return '<div style="border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:12px">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<span style="font-size:1.1em">' + card.emoji + ' ' + card.name + '</span>' +
      '<span style="font-size:.8em;color:#888">card: ' + card.cardId + '</span>' +
    '</div>' +
    '<div style="margin-bottom:6px">' + flagsHtml + '</div>' +
    '<div style="font-size:.8em;color:#666;margin-bottom:8px">' +
      'totalMinutes: <strong>' + (stats.totalMinutes || 0) + '</strong> · ' +
      'totalSessions: <strong>' + (stats.totalSessions || 0) + '</strong>' +
    '</div>' +
    '<details>' +
      '<summary style="cursor:pointer;font-size:.85em;color:#2980b9">Dry-Run — Preview</summary>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">' +
        '<div>' +
          '<div style="font-size:.78em;font-weight:bold;color:#27ae60;margin-bottom:4px">NEW card (create)</div>' +
          '<pre style="font-size:.72em;background:#f5f5f5;padding:8px;border-radius:4px;overflow:auto;margin:0">' + newCardJson + '</pre>' +
        '</div>' +
        '<div>' +
          '<div style="font-size:.78em;font-weight:bold;color:#e67e22;margin-bottom:4px">OLD card (update only 3 fields)</div>' +
          '<pre style="font-size:.72em;background:#f5f5f5;padding:8px;border-radius:4px;overflow:auto;margin:0">' + oldUpdateJson + '</pre>' +
        '</div>' +
      '</div>' +
    '</details>' +
    fixBtn +
  '</div>';
}

async function _executeCardRepair(clubId, cardId) {
  var card = _repairCardCache[cardId];
  if (!card) { alert('Card data not found — please rescan.'); return; }

  var auth = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
  if (!auth || auth.isAnonymous) { alert('Owner login required.'); return; }

  var confirmed = confirm(
    'תיקון כרטיס: ' + card.emoji + ' ' + card.name + '\n\n' +
    'ייצור כרטיס חדש (student_xxx) עם אותם נתונים.\n' +
    'הכרטיס הישן יסומן status:left בלבד — לא יימחק.\n\n' +
    'להמשיך?'
  );
  if (!confirmed) return;

  var db  = window.db;
  var now = new Date().toISOString();
  var newId = 'student_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  var checkSnap = await db.collection('clubs').doc(clubId).collection('memberships').doc(newId).get();
  if (checkSnap.exists) { alert('ID collision — try again.'); return; }

  var s = card.cachedStats || {};
  var newCard = {
    userId:           newId,
    clubId:           clubId,
    name:             card.name,
    emoji:            card.emoji,
    role:             'member',
    status:           'active',
    inviteSource:     'pre-created',
    invitationId:     null,
    createdByTeacher: true,
    personalized:     false,
    claimedByUid:     null,
    permissions: { canViewLeaderboard: true, canAddMembers: false, canEditClub: false },
    joinedAt:    card.joinedAt || now,
    leftAt:      null,
    cachedStats: {
      totalMinutes:  s.totalMinutes  || 0,
      totalSessions: s.totalSessions || 0,
      totalPoints:   s.totalPoints   || 0,
      totalBooks:    s.totalBooks    || 0,
      appMinutes:    s.appMinutes    || 0,
      bookMinutes:   s.bookMinutes   || 0,
      lastReadAt:    s.lastReadAt    || null,
    },
    migratedFrom: cardId,
    updatedAt:    now,
  };

  try {
    await db.collection('clubs').doc(clubId).collection('memberships').doc(newId).set(newCard);
  } catch (e) {
    alert('שגיאה ביצירת כרטיס חדש — הכרטיס הישן לא נגע.\n' + e.message);
    return;
  }

  try {
    await db.collection('clubs').doc(clubId).collection('memberships').doc(cardId).set(
      { status: 'left', migratedTo: newId, updatedAt: now },
      { merge: true }
    );
  } catch (e) {
    alert('כרטיס חדש נוצר (' + newId + ') אך סימון הישן כ-left נכשל.\n' + e.message);
    return;
  }

  var content = document.getElementById('od-repair-content');
  if (content) {
    content.innerHTML =
      '<div style="color:#27ae60;padding:.5rem;font-weight:bold">✅ ' + card.name + ' תוקן בהצלחה!</div>' +
      '<div style="font-size:.8em;color:#666;padding:.25rem .5rem">כרטיס חדש: ' + newId + ' · הישן סומן left.</div>' +
      '<div style="padding:.5rem;color:#888;font-size:.8em">סורק מחדש...</div>';
  }
  setTimeout(function () { showCardRepairTool(clubId); }, 1500);
}

async function _odMarkClubHidden(clubId) {
  if (!confirm(`להסתיר את "${clubId}" מהילדים?\nהנתונים נשמרים, אף תלמיד לא ייפגע.`)) return;
  const meta = { hidden: true };
  if (clubId === 'mitarim-aleph-2025') {
    meta.ownerEmail = 'yehudiiit@icloud.com';
    meta.notes      = 'מועדון ישן — ממתין לאיחוד עם החדש';
  }
  try {
    if (typeof fbSetClubMeta === 'function') await fbSetClubMeta(clubId, meta);
    _odLoad();
  } catch (e) { alert('שגיאה: ' + e.message); }
}

async function _odRestoreClub(clubId) {
  if (!confirm(`לשחזר את "${clubId}" כמועדון פעיל?`)) return;
  try {
    if (typeof fbSetClubMeta === 'function') await fbSetClubMeta(clubId, { hidden: false });
    _odLoad();
  } catch (e) { alert('שגיאה: ' + e.message); }
}

// ─── System / Bootstrap Clubs ─────────────────────────────────────────────────

async function _odRenderSystemClubs() {
  const el = document.getElementById('od-system-clubs');
  if (!el || typeof BOOTSTRAP_CLUBS === 'undefined' || !window.db) return;

  const rows = await Promise.all(BOOTSTRAP_CLUBS.map(async c => {
    let fsData = null;
    try {
      const snap = await window.db.collection('clubs').doc(c.id).get();
      if (snap.exists) fsData = snap.data();
    } catch (_) {}

    const isHidden   = fsData?.hidden   ?? c.hidden   ?? false;
    const ownerEmail = fsData?.ownerEmail ?? '—';
    const notes      = fsData?.notes     ?? '';

    const badge = isHidden
      ? '<span class="od-hidden-badge">מוסתר</span>'
      : '<span class="od-badge od-badge--active">פעיל</span>';

    const btn = isHidden
      ? `<button class="od-btn-sm" onclick="_odRestoreClub('${c.id}')">שחזר לפעיל</button>`
      : `<button class="od-btn-sm od-btn-sm--warn" onclick="_odMarkClubHidden('${c.id}')">הסתר / שייך אליי</button>`;

    return `<div class="od-row${isHidden ? ' od-row--hidden' : ''}">
      <div style="flex:1;min-width:0">
        <span class="od-row-label">${c.emoji || '📚'} ${c.name} ${badge}</span>
        <span style="font-size:.75em;color:#888;display:block">ID: ${c.id}${ownerEmail !== '—' ? ' · ' + ownerEmail : ''}</span>
        ${notes ? `<span style="font-size:.75em;color:#aaa;display:block;font-style:italic">${notes}</span>` : ''}
      </div>
      ${btn}
    </div>`;
  }));

  el.innerHTML = rows.join('') || '<div class="od-empty">אין מועדוני מערכת</div>';
}

// ─── Error Log ────────────────────────────────────────────────────────────────

async function _odLoadErrors() {
  const el = document.getElementById('od-errors');
  if (!el || !window.db) return;
  try {
    const snap = await window.db
      .collection('owner-stats').doc('errors').collection('log')
      .orderBy('timestamp', 'desc').limit(8).get();
    el.innerHTML = snap.empty
      ? '<div class="od-empty">✅ אין שגיאות</div>'
      : snap.docs.map(d => {
          const e  = d.data();
          const ts = (e.timestamp || '').slice(5, 16);
          return `<div class="od-error-row">
            <span class="od-err-ts">${ts}</span>
            <span class="od-err-ctx">[${e.context || '?'}]</span>
            <span class="od-err-msg">${(e.message || '').slice(0, 80)}</span>
          </div>`;
        }).join('');
  } catch (e) {
    el.innerHTML = `<div class="od-empty">שגיאה בטעינת לוג: ${e.message}</div>`;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function _odDay(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10).replace(/-/g, '_');
}

function _fmt(n) {
  if (typeof n !== 'number') return String(n);
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
}

function _odStoryTitle(storyId) {
  if (typeof getAllStories === 'function') {
    const s = getAllStories().find(x => x.id === storyId);
    if (s?.title) return s.title;
  }
  return storyId;
}

// ─── Developer Reset ─────────────────────────────────────────────────────────

async function devReset() {
  const msg = [
    '⚠️ Developer Reset',
    '',
    'פעולה זו תמחק:',
    '• כל המועדונים + חברויות',
    '• כל ההזמנות',
    '• owner-stats',
    '',
    'לא נמחק: חשבונות משתמשים, classes/ — Legacy "מיתרים כיתה א\'"',
    '',
    'להמשיך?',
  ].join('\n');

  if (!confirm(msg)) return;

  const btn = document.getElementById('btn-dev-reset');
  if (btn) { btn.disabled = true; btn.textContent = 'מוחק...'; }

  try {
    const result = typeof fbDevReset === 'function'
      ? await fbDevReset()
      : { ok: false, error: 'fbDevReset לא נמצא' };

    if (result.ok) {
      if (typeof window.clearDeviceLocalCache === 'function') {
        window.clearDeviceLocalCache();
      }
      alert('✅ Reset הושלם:\n' + JSON.stringify(result.counts, null, 2));
      _odLoad(); // רענן את הדשבורד — Owner נשאר מחובר
    } else {
      alert('❌ שגיאה: ' + result.error);
      if (btn) { btn.disabled = false; btn.textContent = '🗑️ Developer Reset'; }
    }
  } catch (e) {
    alert('❌ חריגה: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '🗑️ Developer Reset'; }
  }
}

// ─── חשיפה גלובלית ───────────────────────────────────────────────────────────

window.showOwnerDashboard  = showOwnerDashboard;
window._odLoad             = _odLoad;
window.devReset            = devReset;
window.showCardRepairTool  = showCardRepairTool;
window._executeCardRepair  = _executeCardRepair;

/**
 * פונקציית פיתוח חד-פעמית.
 * מעלה את המשתמש המחובר ל-role:'owner' ויוצרת config/setup אם אינו קיים.
 * יש להסיר פונקציה זו מהקוד לאחר ריצה ראשונה.
 *
 * שימוש: הפעל מקונסול הדפדפן בזמן שמורה מחוברת:
 *   promoteCurrentTeacherToOwner()
 */
async function promoteCurrentTeacherToOwner() {
  const user = firebase.auth().currentUser;
  if (!user) {
    console.error('[promoteToOwner] אין משתמש מחובר');
    return;
  }

  const db  = firebase.firestore();
  const uid = user.uid;
  const now = new Date().toISOString();

  // עדכן role ל-'owner'
  await db.collection('users').doc(uid).set({
    role:        'owner',
    updatedAt:   now,
    lastLoginAt: now,
  }, { merge: true });
  console.log('[promoteToOwner] role עודכן ל-owner עבור', uid);

  // צור config/setup אם אינו קיים
  const setupSnap = await db.collection('config').doc('setup').get();
  if (!setupSnap.exists) {
    await db.collection('config').doc('setup').set({
      completedAt: now,
      ownerUid:    uid,
      orgName:     '',
    });
    console.log('[promoteToOwner] config/setup נוצר');
  } else {
    console.log('[promoteToOwner] config/setup כבר קיים — לא שונה');
  }

  console.log('[promoteToOwner] הושלם. רענן את הדף או הפעל showTeacherDashboard()');
}
window.promoteCurrentTeacherToOwner = promoteCurrentTeacherToOwner;


