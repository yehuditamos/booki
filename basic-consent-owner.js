/* Owner-only consent overview. Staged until dedicated Firebase rules are published. */
(function(){
'use strict';
if(window.BookiConsentOwner)return;
const $=id=>document.getElementById(id), api=()=>window.BookiBasicConsent;
const el=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
let loading=false,receipts=[];
function stamp(v){try{const d=v?.toDate?v.toDate():new Date(v);return Number.isNaN(d.getTime())?'תאריך לא זמין':d.toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'});}catch{return 'תאריך לא זמין';}}
async function isOwner(){const u=window.firebase?.auth?.().currentUser;if(!u||u.isAnonymous||!window.db)return false;const s=await window.db.collection('users').doc(u.uid).get({source:'server'});return s.exists&&s.data().role==='owner';}
function detail(r){const box=el('details',undefined,'bco-receipt');box.appendChild(el('summary',`אושר ב־${stamp(r.acceptedAt)} · ${r.signerName}`));box.appendChild(el('p',`כרטיס: ${r.subjectName||'—'} · גרסת מסמכים: ${r.version}`));box.appendChild(el('p',r.kind==='guardian'?'הצהרת הורה/אפוטרופוס — ללא אימות זהות חיצוני.':'הצהרה מחשבון מורה מחובר.'));box.appendChild(el('pre',r.noticeText||'אין נוסח שמור.'));return box;}
function current(kind,id,club=''){return receipts.find(r=>api().validReceipt(r,{kind,subjectId:String(id),clubId:club}));}
function line(parent,label,r){const row=el('div',undefined,'bco-person');row.appendChild(el('strong',label));row.appendChild(el('span',r?'✓ יש אישור מתועד':'אין אישור מתועד',r?'bco-yes':'bco-pending'));if(r)row.appendChild(detail(r));parent.appendChild(row);}
async function readAll(){const records=[];let cursor=null;for(;;){let q=window.db.collectionGroup('bookiConsentReceipts').orderBy(window.firebase.firestore.FieldPath.documentId()).limit(200);if(cursor)q=q.startAfter(cursor);const s=await q.get({source:'server'});records.push(...s.docs.map(d=>({...d.data(),path:d.ref.path})));if(s.size<200)break;cursor=s.docs.at(-1);}return records;}
function classGroup(c){
 const group=el('details',undefined,'bco-class');group.appendChild(el('summary',c.name||'כיתה'));const body=el('div');body.appendChild(el('p','פתחי את הכיתה לבדיקת האישורים.'));group.appendChild(body);let loaded=false;
 group.addEventListener('toggle',async()=>{if(!group.open||loaded)return;loaded=true;body.replaceChildren(el('p','טוענים אישורים…'));
  try{const snap=await window.db.collection('clubs').doc(c.id).collection('memberships').get({source:'server'});const members=snap.docs.map(d=>({id:d.id,...d.data()})).filter(m=>m.status!=='left');const ids=new Set(members.map(m=>String(m.userId||m.id)));body.replaceChildren();let signed=0;
   for(const m of members.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'he'))){const r=current('guardian',m.userId||m.id,c.id);if(r)signed++;line(body,m.name||'כרטיס ללא שם',r);}
   for(const r of receipts.filter(r=>r.clubId===c.id&&!ids.has(String(r.subjectId))))line(body,(r.subjectName||'כרטיס')+' — לא ברשימה הפעילה',r);
   body.prepend(el('p',`${signed} מתוך ${members.length} כרטיסים פעילים עם אישור לגרסה הנוכחית.`,'bco-count'));
  }catch(e){loaded=false;body.replaceChildren(el('p','נתוני הכיתה לא נטענו. סגרי ופתחי שוב לניסיון נוסף.','bc-error'));}
 });return group;
}
function render(root,teachers,clubs){
 root.replaceChildren();const people=new Map(teachers.map(t=>[t.id||t.uid,t]));const known=new Set(clubs.map(c=>c.id));
 for(const c of clubs)if(c.teacherUid&&!people.has(c.teacherUid))people.set(c.teacherUid,{id:c.teacherUid,name:c.teacherName||c.teacherEmail||'מורה'});
 for(const r of receipts)if(r.kind==='teacher'&&!people.has(r.subjectId))people.set(r.subjectId,{id:r.subjectId,name:r.subjectName||r.signerName});
 const grouped=new Set();
 for(const[uid,t]of [...people].sort((a,b)=>String(a[1].name||'').localeCompare(String(b[1].name||''),'he'))){
  const group=el('details',undefined,'bco-teacher');group.open=true;const record=current('teacher',uid);
  group.appendChild(el('summary',`${t.name||'מורה'} — ${t.role==='owner'?'מנהלת':record?'אישור מורה התקבל':'אין אישור מורה מתועד'}`));if(record)group.appendChild(detail(record));
  const list=clubs.filter(c=>c.teacherUid===uid||(!c.teacherUid&&c.teacherEmail===t.email));
  if(!list.length)group.appendChild(el('p','עדיין אין כיתה משויכת.'));
  for(const c of list){grouped.add(c.id);group.appendChild(classGroup(c));}root.appendChild(group);
 }
 const ungrouped=clubs.filter(c=>!grouped.has(c.id));if(ungrouped.length){const group=el('details',undefined,'bco-teacher');group.appendChild(el('summary','כיתות ללא מורה מזוהה ברשימה'));for(const c of ungrouped)group.appendChild(classGroup(c));root.appendChild(group);}
 const other=receipts.filter(r=>r.kind==='guardian'&&(!r.clubId||!known.has(r.clubId)));if(other.length){const group=el('details',undefined,'bco-teacher');group.appendChild(el('summary','אישורים ללא כיתה פעילה ברשימה'));other.forEach(r=>line(group,r.subjectName||'כרטיס',r));root.appendChild(group);}
 const archive=el('details',undefined,'bco-teacher');archive.appendChild(el('summary',`כל רשומות האישור (${receipts.length})`));receipts.forEach(r=>archive.appendChild(detail(r)));root.appendChild(archive);
}
async function refresh(){
 if(loading)return;loading=true;const status=$('bco-status'),root=$('bco-groups');if(!status||!root){loading=false;return;}status.textContent='בודקים חיבור והרשאות…';root.replaceChildren();
 try{
  if(!await isOwner())throw new Error('owner-required');const c=await api().ready(true);$('bco-setup').hidden=!!c.enabled;
  if(!c.enabled){status.textContent=c.rulesAvailable?'האישורים עדיין לא הופעלו. מסכי המורה וההורה מוכנים לבדיקה.':'האישורים עדיין לא פעילים — יש לפרסם קודם את הרשאות Firebase הייעודיות.';return;}
  const[all,ts,cs]=await Promise.all([readAll(),window.db.collection('users').where('role','in',['teacher','owner']).get({source:'server'}),window.db.collection('clubs').get({source:'server'})]);receipts=all;
  render(root,ts.docs.map(d=>({id:d.id,...d.data()})),cs.docs.map(d=>({id:d.id,...d.data()})));status.textContent=`${receipts.length} רשומות אישור · עודכן ${new Date().toLocaleTimeString('he-IL')}`;
 }catch(e){status.textContent='לא ניתן לקרוא את האישורים. שום ילד או מורה לא סומנו כמאושרים עקב התקלה.';}
 finally{loading=false;}
}
function canonicalNotice(kind,email){const C=window.BookiConsentCopy;return[C.summary[kind],...C.privacy.flat(),...C.terms.flat(),'מפעילה: יהודית עמוס',`לפניות פרטיות: ${email}`,kind==='teacher'?C.teacherDeclaration:C.guardianDeclaration].join('\n\n');}
async function activate(){
 const status=$('bco-status'),email=($('bco-contact-email')?.value||'').trim();
 if(!$('bco-review')?.checked){status.textContent='לפני הפעלה יש לאשר שבדקת את הנוסח ואת ההרשאות.';return;}
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){status.textContent='יש להזין כתובת אימייל תקינה לפניות פרטיות.';return;}
 const button=$('bco-activate');button.disabled=true;
 try{if(!await isOwner())throw new Error('owner-required');
  await window.db.collection('config').doc('basicConsent').set({enabled:true,version:api().VERSION,contactEmail:email,operatorName:'יהודית עמוס',reviewConfirmed:true,updatedAt:window.firebase.firestore.FieldValue.serverTimestamp(),teacherNoticeText:canonicalNotice('teacher',email),guardianNoticeText:canonicalNotice('guardian',email)});
  await api().ready(true);api().install();await refresh();
 }catch(e){status.textContent='לא הופעל. יש לפרסם קודם את הרשאות Firebase. לא נשמרו אישורים במקום לא מוגן.';}
 finally{button.disabled=false;}
}
function mount(){
 const screen=$('screen-owner-dashboard');if(!screen||$('booki-owner-consents'))return;
 const section=el('section',undefined,'bco-section');section.id='booki-owner-consents';section.dir='rtl';section.appendChild(el('h2','אישורי פרטיות — מורות וכיתות'));section.appendChild(el('p','אישור מורה ואישור הורה לכל כרטיס. אישור הורה הוא הצהרה, לא אימות זהות חיצוני.','bc-small'));
 const actions=el('div',undefined,'bco-actions');for(const[label,action]of [['רענון האישורים',refresh],['בדיקת מסך המורה',()=>api().preview('teacher')],['בדיקת מסך ההורה',()=>api().preview('guardian')]]){const b=el('button',label);b.type='button';b.onclick=action;actions.appendChild(b);}section.appendChild(actions);
 const status=el('p','האישורים טרם נטענו.');status.id='bco-status';status.setAttribute('role','status');section.appendChild(status);
 const setup=el('details',undefined,'bco-setup');setup.id='bco-setup';setup.appendChild(el('summary','הגדרה ראשונית — למנהלת בלבד'));
 setup.appendChild(el('p','שמירת האישורים ממתינה לפרסום הרשאות Firebase. עריכת הקוד ב-GitHub אינה מפרסמת את הרשאות מסד הנתונים. אין להעביר אישורים אל users, memberships או owner-stats כפתרון עוקף.'));
 setup.appendChild(el('p','אחרי בדיקת ההרשאות והנוסח, הגדירי כתובת פנייה והפעילי פעם אחת. עד ההפעלה אין איסוף אישורים ואין סימון אוטומטי של משתמשים קיימים.'));
 const label=el('label','אימייל לפניות פרטיות שיוצג למורות ולהורים');label.htmlFor='bco-contact-email';setup.appendChild(label);const email=document.createElement('input');email.type='email';email.id='bco-contact-email';email.className='input-field';email.value=window.firebase?.auth?.().currentUser?.email||'';setup.appendChild(email);
 const checkLabel=el('label',undefined,'bc-agree'),check=document.createElement('input');check.type='checkbox';check.id='bco-review';checkLabel.append(check,el('span','בדקתי את מסכי האישור והמסמכים, אישרתי את כתובת הפנייה לפרסום ווידאתי שהרשאות מסד הנתונים נבדקו ופורסמו.'));setup.appendChild(checkLabel);
 const go=el('button','הפעלת האישורים','bc-primary');go.id='bco-activate';go.type='button';go.onclick=activate;setup.appendChild(go);section.appendChild(setup);
 const groups=el('div');groups.id='bco-groups';section.appendChild(groups);const header=screen.querySelector('.screen-header');if(header)header.after(section);else screen.appendChild(section);
}
function install(){const original=window.showOwnerDashboard;if(typeof original!=='function'||original.__bookiConsentOwner)return;const wrapped=function(...args){const r=original.apply(this,args);mount();refresh();return r;};wrapped.__bookiConsentOwner=true;window.showOwnerDashboard=wrapped;if($('screen-owner-dashboard')?.classList.contains('active')){mount();refresh();}}
const style=document.createElement('style');style.textContent='.bco-section{margin:16px;padding:18px;border:1px solid #cee0d6;border-radius:18px;background:#fffdf7;color:#26354d;font-family:Arial,sans-serif;line-height:1.6}.bco-section h2{font-size:21px;margin:0}.bco-actions{display:flex;flex-wrap:wrap;gap:8px}.bco-actions button{border:1px solid #c3d9ce;border-radius:10px;background:white;padding:9px 12px;font:inherit;cursor:pointer}.bco-teacher,.bco-class,.bco-setup{border:1px solid #dce5df;border-radius:12px;padding:12px;margin:10px 0}.bco-teacher>summary,.bco-class>summary,.bco-setup>summary{font-weight:bold;cursor:pointer}.bco-class{background:#f6faf7}.bco-person{padding:10px 0;border-bottom:1px solid #dce5df;display:grid;gap:3px}.bco-yes{color:#21704a}.bco-pending{color:#8b6518}.bco-receipt{font-size:12px;overflow-wrap:anywhere}.bco-receipt summary{cursor:pointer}.bco-receipt pre{white-space:pre-wrap;font-family:inherit;max-height:250px;overflow:auto;background:white;padding:10px}.bco-count{font-weight:bold}';document.head.appendChild(style);
window.BookiConsentOwner={install,mount,refresh};install();
})();
