/* Owner consent overview. Reads private receipts only after a server-side owner check.
 * No approval is inferred from local storage or from class participation.
 */
(function () {
  'use strict';
  if (window.BookiConsentOwner) return;
  const $ = id => document.getElementById(id);
  const el = (tag,value,cls) => {const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
  const api = () => window.BookiBasicConsent;
  let loading=false, receipts=[];
  function stamp(value) {try{const d=value?.toDate?value.toDate():new Date(value);return Number.isNaN(d.getTime())?'תאריך לא זמין':d.toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'});}catch{return 'תאריך לא זמין';}}
  async function isOwner() {
    const u=window.firebase?.auth?.().currentUser;if(!u||u.isAnonymous||!window.db)return false;
    const s=await window.db.collection('users').doc(u.uid).get({source:'server'});
    return s.exists&&s.data().role==='owner';
  }
  function detailsForReceipt(receipt) {
    const box=el('details',undefined,'bco-receipt');
    box.appendChild(el('summary',`אושר ב־${stamp(receipt.acceptedAt)} · ${receipt.signerName}`));
    box.appendChild(el('p',`גרסת מסמכים: ${receipt.version}`));
    box.appendChild(el('p',receipt.kind==='guardian'?'אישור הורה/אפוטרופוס בהצהרה — ללא אימות זהות חיצוני.':'אישור בהצהרה מחשבון מורה מחובר.'));
    box.appendChild(el('pre',receipt.noticeText||'אין נוסח שמור.'));
    return box;
  }
  function addRecordLine(parent,label,record) {
    const row=el('div',undefined,'bco-person');
    row.appendChild(el('strong',label));
    row.appendChild(el('span',record?'✓ יש אישור מתועד':'אין אישור מתועד',record?'bco-yes':'bco-pending'));
    if(record)row.appendChild(detailsForReceipt(record));
    parent.appendChild(row);
  }
  function currentRecord(kind,subjectId,clubId='') {
    return receipts.find(r=>api().validReceipt(r,{kind,subjectId:String(subjectId),clubId}));
  }
  async function readAllReceipts() {
    const result=[];let cursor=null;
    for(;;){
      let query=window.db.collectionGroup('bookiConsentReceipts').orderBy(window.firebase.firestore.FieldPath.documentId()).limit(200);
      if(cursor)query=query.startAfter(cursor);
      const page=await query.get({source:'server'});
      result.push(...page.docs.map(d=>({...d.data(),path:d.ref.path})));
      if(page.size<200)break;
      cursor=page.docs[page.docs.length-1];
    }
    return result;
  }
  function renderGroups(root,teachers,clubs) {
    root.replaceChildren();
    const names=new Map(teachers.map(t=>[t.id||t.uid,t]));
    for(const c of clubs)if(c.teacherUid&&!names.has(c.teacherUid))names.set(c.teacherUid,{id:c.teacherUid,name:c.teacherName||c.teacherEmail||'מורה'});
    for(const r of receipts)if(r.kind==='teacher'&&!names.has(r.subjectId))names.set(r.subjectId,{id:r.subjectId,name:r.subjectName||r.signerName});
    const knownClassIds=new Set(clubs.map(c=>c.id));
    const used=new Set();
    for(const [uid,t] of [...names].sort((a,b)=>String(a[1].name||'').localeCompare(String(b[1].name||''),'he'))){
      if(t.role==='owner')continue;
      const group=el('details',undefined,'bco-teacher');group.open=true;
      const record=currentRecord('teacher',uid);
      group.appendChild(el('summary',`${t.name||'מורה'} — ${record?'אישור מורה התקבל':'אין אישור מורה מתועד'}`));
      if(record){group.appendChild(detailsForReceipt(record));used.add(record.path);}
      const classList=clubs.filter(c=>c.teacherUid===uid||(!c.teacherUid&&c.teacherEmail===t.email));
      if(!classList.length)group.appendChild(el('p','עדיין אין כיתה משויכת.'));
      for(const c of classList){
        const section=el('details',undefined,'bco-class');section.appendChild(el('summary',c.name||'כיתה'));
        const content=el('div');content.appendChild(el('p','פתחי את הכיתה כדי לבדוק מי אישר.'));section.appendChild(content);
        let loaded=false;
        section.addEventListener('toggle',async()=>{
          if(!section.open||loaded)return;loaded=true;content.replaceChildren(el('p','טוענים אישורים…'));
          try{
            const snap=await window.db.collection('clubs').doc(c.id).collection('memberships').get({source:'server'});
            const members=snap.docs.map(d=>({id:d.id,...d.data()})).filter(m=>m.status!=='left');
            const ids=new Set(members.map(m=>String(m.userId||m.id)));
            content.replaceChildren();let signed=0;
            for(const m of members.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'he'))){
              const r=currentRecord('guardian',m.userId||m.id,c.id);if(r)signed++;
              addRecordLine(content,m.name||'כרטיס ללא שם',r);
            }
            const extra=receipts.filter(r=>r.clubId===c.id&&!ids.has(String(r.subjectId)));
            for(const r of extra)addRecordLine(content,(r.subjectName||'כרטיס')+' — לא ברשימה הפעילה',r);
            content.prepend(el('p',`${signed} מתוך ${members.length} כרטיסים פעילים עם אישור לגרסה הנוכחית.`, 'bco-count'));
            if(!members.length&&!extra.length)content.appendChild(el('p','אין עדיין כרטיסים או אישורים בכיתה הזו.'));
          }catch(e){loaded=false;content.replaceChildren(el('p','לא ניתן לקרוא כרגע את נתוני הכיתה. סגרי ופתחי שוב לניסיון נוסף.','bc-error'));}
        });
        group.appendChild(section);
      }
      root.appendChild(group);
    }
    const unassigned=receipts.filter(r=>r.kind==='guardian'&&(!r.clubId||!knownClassIds.has(r.clubId)));
    if(unassigned.length){const group=el('details',undefined,'bco-teacher');group.appendChild(el('summary','אישורים ללא כיתה פעילה ברשימה'));unassigned.forEach(r=>addRecordLine(group,r.subjectName||'כרטיס',r));root.appendChild(group);}
    // Keep all versions accessible; the grouped status above always uses the current version.
    const archive=el('details',undefined,'bco-teacher');archive.appendChild(el('summary',`כל רשומות האישור (${receipts.length})`));
    for(const r of receipts)archive.appendChild(detailsForReceipt(r));root.appendChild(archive);
    if(!teachers.length&&!clubs.length&&!receipts.length)root.prepend(el('p','עדיין אין מורות, כיתות או אישורים להצגה.'));
  }
  async function refresh() {
    if(loading)return;loading=true;
    const status=$('bco-status'),groups=$('bco-groups');if(!status||!groups){loading=false;return;}
    status.textContent='בודקים חיבור והרשאות…';groups.replaceChildren();
    try{
      if(!await isOwner())throw new Error('owner-required');
      const c=await api().ready(true);
      $('bco-setup').hidden=!!c.enabled;
      if(!c.enabled){
        status.textContent=c.rulesAvailable?'האישורים עדיין לא הופעלו. תצוגות המורה וההורה מוכנות לבדיקה.':'האישורים עדיין לא פעילים — יש לפרסם קודם את הרשאות Firebase הייעודיות.';
        return;
      }
      const [all,teacherSnap,clubSnap]=await Promise.all([readAllReceipts(),window.db.collection('users').where('role','in',['teacher','owner']).get({source:'server'}),window.db.collection('clubs').get({source:'server'})]);
      receipts=all;
      renderGroups(groups,teacherSnap.docs.map(d=>({id:d.id,...d.data()})),clubSnap.docs.map(d=>({id:d.id,...d.data()})));
      status.textContent=`${receipts.length} רשומות אישור · עודכן ${new Date().toLocaleTimeString('he-IL')}`;
    }catch(e){status.textContent='לא ניתן לקרוא את האישורים. שום ילד או מורה לא סומנו כמאושרים עקב התקלה.';}
    finally{loading=false;}
  }
  async function activate() {
    const status=$('bco-status');
    if(!$('bco-review')?.checked){status.textContent='לפני הפעלה יש לאשר שבדקת את הנוסח ואת ההרשאות.';return;}
    const email=($('bco-contact-email')?.value||'').trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){status.textContent='יש להזין כתובת אימייל תקינה לפניות פרטיות.';return;}
    const button=$('bco-activate');button.disabled=true;
    try{
      if(!await isOwner())throw new Error('owner-required');
      await window.db.collection('config').doc('basicConsent').set({enabled:true,version:api().VERSION,contactEmail:email,operatorName:'יהודית עמוס',reviewConfirmed:true,updatedAt:window.firebase.firestore.FieldValue.serverTimestamp()});
      await api().ready(true);api().addRegistrationNotice?.();await refresh();
    }catch(e){status.textContent='לא הופעל. יש לפרסם קודם את הרשאות Firebase. לא נשמרו חתימות במקום לא מוגן.';}
    finally{button.disabled=false;}
  }
  function mount() {
    const screen=$('screen-owner-dashboard');if(!screen||$('booki-owner-consents'))return;
    const section=el('section',undefined,'bco-section');section.id='booki-owner-consents';section.dir='rtl';
    section.appendChild(el('h2','אישורי פרטיות — מורות וכיתות'));
    section.appendChild(el('p','אישור מורה ואישור הורה לכל כרטיס. אישור הורה הוא הצהרה, לא אימות זהות חיצוני.','bc-small'));
    const actions=el('div',undefined,'bco-actions');
    for(const [label,action] of [['רענון האישורים',refresh],['בדיקת מסך המורה',()=>api().preview('teacher')],['בדיקת מסך ההורה',()=>api().preview('guardian')]]){const button=el('button',label);button.type='button';button.onclick=action;actions.appendChild(button);}section.appendChild(actions);
    const status=el('p','האישורים טרם נטענו.');status.id='bco-status';status.setAttribute('role','status');section.appendChild(status);
    const setup=el('details',undefined,'bco-setup');setup.id='bco-setup';setup.appendChild(el('summary','הגדרה ראשונית — למנהלת בלבד'));
    setup.appendChild(el('p','שמירת האישורים ממתינה לפרסום הרשאות Firebase. עריכת הקוד ב-GitHub אינה מפרסמת את הרשאות מסד הנתונים. אין להעביר אישורים אל users, memberships או owner-stats כפתרון עוקף.'));
    setup.appendChild(el('p','אחרי בדיקת ההרשאות והנוסח, הגדירי כתובת פנייה והפעילי פעם אחת. עד ההפעלה אין איסוף אישורים ואין סימון אוטומטי של משתמשים קיימים.'));
    const label=el('label','אימייל לפניות פרטיות שיוצג למורות ולהורים');label.htmlFor='bco-contact-email';setup.appendChild(label);
    const email=document.createElement('input');email.type='email';email.id='bco-contact-email';email.className='input-field';email.value=window.firebase?.auth?.().currentUser?.email||'';setup.appendChild(email);
    const checkLabel=el('label',undefined,'bc-agree');const check=document.createElement('input');check.type='checkbox';check.id='bco-review';checkLabel.append(check,el('span','בדקתי את מסכי האישור והמסמכים, אישרתי את כתובת הפנייה לפרסום ווידאתי שהרשאות מסד הנתונים נבדקו ופורסמו.'));setup.appendChild(checkLabel);
    const activateButton=el('button','הפעלת האישורים','bc-primary');activateButton.id='bco-activate';activateButton.type='button';activateButton.onclick=activate;setup.appendChild(activateButton);section.appendChild(setup);
    const groups=el('div');groups.id='bco-groups';section.appendChild(groups);
    const header=screen.querySelector('.screen-header');if(header)header.after(section);else screen.appendChild(section);
  }
  function install() {
    const original=window.showOwnerDashboard;
    if(typeof original!=='function'||original.__bookiConsentOwner)return;
    const wrapped=function(...args){const r=original.apply(this,args);mount();refresh();return r;};wrapped.__bookiConsentOwner=true;window.showOwnerDashboard=wrapped;
    if($('screen-owner-dashboard')?.classList.contains('active')){mount();refresh();}
  }
  const style=document.createElement('style');style.textContent='.bco-section{margin:16px;padding:18px;border:1px solid #cee0d6;border-radius:18px;background:#fffdf7;color:#26354d;font-family:Arial,sans-serif;line-height:1.6}.bco-section h2{font-size:21px;margin:0}.bco-actions{display:flex;flex-wrap:wrap;gap:8px}.bco-actions button{border:1px solid #c3d9ce;border-radius:10px;background:white;padding:9px 12px;font:inherit;cursor:pointer}.bco-teacher,.bco-class,.bco-setup{border:1px solid #dce5df;border-radius:12px;padding:12px;margin:10px 0}.bco-teacher>summary,.bco-class>summary,.bco-setup>summary{font-weight:bold;cursor:pointer}.bco-class{background:#f6faf7}.bco-person{padding:10px 0;border-bottom:1px solid #dce5df;display:grid;gap:3px}.bco-yes{color:#21704a}.bco-pending{color:#8b6518}.bco-receipt{font-size:12px;overflow-wrap:anywhere}.bco-receipt summary{cursor:pointer}.bco-receipt pre{white-space:pre-wrap;font-family:inherit;max-height:250px;overflow:auto;background:white;padding:10px}.bco-count{font-weight:bold}';document.head.appendChild(style);
  window.BookiConsentOwner={install,mount,refresh};install();
})();
