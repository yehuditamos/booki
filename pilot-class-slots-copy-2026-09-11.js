/** Compact teacher class-card setup. */
(function(){
'use strict';
if(window.BookiClassSlotsCopy20260911)return;
window.BookiClassSlotsCopy20260911=true;
const $=id=>document.getElementById(id);
function patch(){
 const panel=$('booki-topup-panel'),grid=$('club-students-grid');
 if(panel && grid){
  const strong=panel.querySelector(':scope > strong');
  if(strong && strong.textContent!=='כמה ילדים בכיתה?')strong.textContent='כמה ילדים בכיתה?';
  if(!panel.closest('#booki-count-options') && panel.nextElementSibling!==grid)grid.parentNode.insertBefore(panel,grid);
 }
}
const style=document.createElement('style');
style.textContent=`
#screen-club-students #add-student-section,
#booki-named-card-explainer,
#booki-topup-panel > p,
#booki-topup-panel > .booki-flow-label,
#booki-topup-panel .booki-clear-open-slots{display:none!important}
#booki-topup-panel{font-family:Arial,sans-serif;margin:16px;padding:18px}
#booki-topup-panel>strong{font-size:1.25rem;margin-bottom:16px}
#booki-topup-panel .booki-topup-row{flex-direction:column}
#booki-topup-count{box-sizing:border-box;width:100%;min-height:52px;font-size:1.4rem}
#booki-topup-action{min-height:52px;font:700 1.1rem Arial,sans-serif}
#booki-topup-status:empty{display:none}
`;
document.head.appendChild(style);
let queued=false;
new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;patch();});}).observe(document.body,{childList:true,subtree:true});
patch();
})();

/** Named student cards use the existing authorized creation flow. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('he');
const currentClub=()=>typeof _activeClubId!=='undefined'?_activeClubId:window.currentClubId;
function install(){
 const grid=$('club-students-grid'),panel=$('booki-topup-panel');
 if(!grid || !panel)return;
 const id=panel.dataset.clubId;
 const old=$('booki-names-form');
 if(old?.dataset.clubId===id)return;
 old?.remove();$('booki-count-options')?.remove();
 const form=document.createElement('form');
 form.id='booki-names-form';form.dataset.clubId=id;
 form.innerHTML='<label for="booki-class-names">שמות הילדים</label><textarea id="booki-class-names" rows="6" maxlength="3000" placeholder="שם אחד בכל שורה"></textarea><button type="submit">שמירת שמות הילדים</button><p role="status"></p>';
 grid.parentNode.insertBefore(form,grid);
 const options=document.createElement('details');options.id='booki-count-options';
 const summary=document.createElement('summary');summary.textContent='כרטיסים ללא שם';
 options.appendChild(summary);form.insertAdjacentElement('afterend',options);options.appendChild(panel);
 let saving=false;
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(saving)return;
  const input=form.querySelector('textarea'),status=form.querySelector('p'),btn=form.querySelector('button');
  const names=input.value.split(/\r?\n/).map(n=>n.trim().replace(/\s+/g,' ')).filter(Boolean);
  if(!names.length || names.length>50 || names.some(n=>n.length>50 || n.startsWith('כרטיס פנוי ')) || new Set(names.map(norm)).size!==names.length){
   status.textContent='עד 50 שמות, שם אחד בכל שורה. לשמות זהים הוסיפו שם משפחה.';return;
  }
  const uid=typeof getCurrentTeacher==='function'?getCurrentTeacher()?.uid:null;
  const current=()=>form.isConnected && currentClub()===id && getCurrentTeacher()?.uid===uid;
  if(!uid || !current())return;
  saving=true;input.disabled=true;btn.disabled=true;status.textContent='שומרת…';
  const pending=[...names];let added=0,skipped=0;
  try{
   const ref=window.db.collection('clubs').doc(id);
   const club=await ref.get({source:'server'});
   if(!current() || club.data()?.teacherUid!==uid)throw Error('permission');
   const snap=await ref.collection('memberships').get({source:'server'});
   if(snap.metadata?.fromCache)throw Error('offline');
   const members=snap.docs.map(d=>d.data()).filter(m=>m.status!=='left');
   const existing=await Promise.all(members.map(async m=>{
    const resolved=window.BookiClassSlots?.effectiveName ? await window.BookiClassSlots.effectiveName(m) : m.name;
    return norm(resolved||m.name);
   }));
   const known=new Set(existing);
   for(const name of names){
    if(!current())throw Error('changed');
    if(known.has(norm(name))){skipped++;pending.shift();continue;}
    const result=await fbTeacherAddStudent(id,{name});
    if(!result?.ok && result?.reason!=='duplicate-name')throw Error('save');
    if(result?.ok)added++;else skipped++;
    known.add(norm(name));pending.shift();
   }
   if(!current())return;
   input.value='';status.textContent=added ? 'נשמרו '+added+' שמות. הם מופיעים בקישור הכיתה.' : 'כל השמות כבר קיימים בכיתה.';
   if(skipped && added)status.textContent+=' '+skipped+' שמות כבר היו ברשימה.';
   await showClubStudents();
  }catch(_){
   if(current()){input.value=pending.join('\n');status.textContent='השמירה לא הושלמה. השמות שנותרו בשדה עדיין לא נוספו — נסו שוב.';}
  }finally{saving=false;if(form.isConnected){input.disabled=false;btn.disabled=false;}}
 });
}
const style=document.createElement('style');
style.textContent=`
#booki-names-form{margin:16px;padding:20px;border:1px solid #d8eadf;border-radius:20px;background:#f8fcf9;font:16px Arial,sans-serif}
#booki-names-form label{display:block;font-size:22px;font-weight:700;margin-bottom:12px}
#booki-names-form textarea,#booki-setup-names{box-sizing:border-box;width:100%;font:18px/1.6 Arial,sans-serif;border:1px solid #aac9b7;border-radius:12px;background:white;padding:12px;resize:vertical;margin-bottom:12px}
#booki-names-form button{width:100%;min-height:50px;font:700 18px Arial,sans-serif;background:#26714f;color:white;border:0;border-radius:12px}
#booki-names-form button:disabled{opacity:.5}
#booki-names-form p:empty{display:none}
#booki-count-options{margin:0 16px 20px;font:16px Arial,sans-serif}
#booki-count-options summary{padding:12px;cursor:pointer}
#screen-create-members #booki-setup-names-error:not(:empty){display:block!important;color:#9a3333}
.booki-names-later{display:block;margin:12px auto;padding:10px;background:none;border:0;text-decoration:underline;font:16px Arial,sans-serif;color:#38614a}
`;
document.head.appendChild(style);
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;install();});}).observe(document.body,{childList:true,subtree:true});install();
})();
