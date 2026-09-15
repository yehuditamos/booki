/**
 * One roster editor for initial setup and existing clubs.
 * Three input modes share one draft and one submit action.
 * Existing members are only added to, never renamed, deleted or claimed here.
 */
(function(){
'use strict';
if(window.BookiRoster)return;
const MAX=50;
const $=id=>document.getElementById(id);
const teacher=()=>typeof getCurrentTeacher==='function'?getCurrentTeacher():null;
const clubId=()=>typeof _activeClubId!=='undefined'?_activeClubId:window.currentClubId;
const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('he');
const open=s=>String(s||'').startsWith('כרטיס פנוי ');
const slot=n=>'כרטיס פנוי '+String(n).padStart(2,'0');
const draft=()=>({mode:'list',text:'',single:'',count:'',busy:false});
let setup=draft(),existing=null,setupUI=null,editUI=null,revision=0;
function parse(text){
 const names=String(text||'').split(/\r?\n/).map(s=>s.trim().replace(/\s+/g,' ')).filter(Boolean);
 if(!names.length)throw Error('כתבו לפחות שם אחד');
 if(names.length>MAX || names.some(n=>n.length>50||open(n)))throw Error('עד 50 שמות, ועד 50 תווים לשם');
 if(new Set(names.map(norm)).size!==names.length)throw Error('יש שמות זהים ברשימה. הוסיפו שם משפחה');
 return names;
}
function count(value){
 if(!/^\d+$/.test(String(value).trim()) || Number(value)<1 || Number(value)>MAX)throw Error('בחרו מספר ילדים בין 1 ל־50');
 return Number(value);
}
function plan(d,members=[]){
 if(d.mode!=='open')return parse(d.text+(d.single.trim()?'\n'+d.single:''));
 const target=count(d.count);
 if(target<members.length)throw Error('כבר קיימים '+members.length+' כרטיסים. המספר לא מקטין את הרשימה');
 const used=new Set(members.map(m=>m.name).filter(open));
 const names=[];let n=1;
 while(names.length<target-members.length){const name=slot(n++);if(!used.has(name))names.push(name);}
 return names;
}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function button(text,fn,cls){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;}
function editor(root,d,onSave,isNew){
 root.replaceChildren();root.classList.add('booki-roster');
 const heading=el('h3','ילדי המועדון');
 const tabs=el('div',undefined,'br-modes');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','איך להוסיף ילדים');
 const controls=el('div',undefined,'br-fields'),status=el('p',undefined,'br-status');status.setAttribute('role','status');
 const submit=el('button',isNew?'המשך לסיכום':'שמירת הילדים','br-save');submit.type='submit';
 root.append(heading,tabs,controls,status,submit);
 const repaint=()=>{
  tabs.replaceChildren();controls.replaceChildren();
  for(const [mode,label] of [['list','רשימת שמות'],['single','אחד־אחד'],['open','ללא שמות']]){
   const tab=button(label,()=>{if(d.busy)return;d.mode=mode;status.textContent='';repaint();},'br-mode');tab.setAttribute('aria-pressed',String(d.mode===mode));tabs.append(tab);
  }
  if(d.mode==='list'){
   const label=el('label','שם אחד בכל שורה');
   const input=el('textarea');input.rows=6;input.maxLength=3000;input.placeholder='אפשר להדביק כאן רשימה';input.value=d.text;
   input.oninput=()=>{d.text=input.value;};label.append(input);controls.append(label);
  }else if(d.mode==='single'){
   const label=el('label','שם הילד או הילדה');
   const input=el('input');input.maxLength=50;input.value=d.single;input.oninput=()=>{d.single=input.value;};
   const add=()=>{
    if(!d.single.trim())return;
    try{const names=parse(d.text+'\n'+d.single);d.text=names.join('\n');d.single='';status.textContent='';repaint();controls.querySelector('input')?.focus();}
    catch(e){status.textContent=e.message;}
   };
   input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();add();}};
   const row=el('div',undefined,'br-single');row.append(input,button('הוספה לרשימה',add));label.append(row);controls.append(label);
   const list=el('div',undefined,'br-draft');
   d.text.split('\n').filter(Boolean).forEach((name,i)=>{
    const chip=el('div',undefined,'br-chip');const remove=button('×',()=>{const names=d.text.split('\n');names.splice(i,1);d.text=names.join('\n');repaint();});remove.setAttribute('aria-label','הסרת '+name+' מהרשימה שטרם נשמרה');chip.append(el('span',name),remove);list.append(chip);
   });controls.append(list);
  }else{
   const label=el('label',isNew?'כמה ילדים בכיתה?':'כמה כרטיסים יהיו במועדון בסך הכול?');
   const input=el('input');input.type='number';input.inputMode='numeric';input.min='1';input.max=String(MAX);input.value=d.count;input.placeholder='מספר הילדים';input.oninput=()=>{d.count=input.value;};label.append(input);controls.append(label);
   if(!isNew)controls.append(el('small','נוסיף רק את הכרטיסים החסרים.'));
  }
 };
 const lock=busy=>{d.busy=busy;root.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=busy);submit.textContent=busy?'שומרת…':isNew?'המשך לסיכום':'שמירת הילדים';};
 root.onsubmit=async e=>{
  e.preventDefault();if(d.busy)return;
  try{
   // A name typed in one-at-a-time mode is part of the same draft.
   if(d.mode!=='open' && d.single.trim()){d.text=parse(d.text+'\n'+d.single).join('\n');d.single='';}
   lock(true);status.textContent='';await onSave(d,status);
  }catch(e){status.textContent=e.message||'השמירה לא הושלמה. נסו שוב.';}
  finally{lock(false);}
 };
 repaint();
 return {repaint,status};
}
const originalReview=window.goToReview;
function mountSetup(){
 const screen=$('screen-create-members');if(!screen)return;
 const old=screen.querySelector('.form-card');
 if(!old)return;
 if(!setupUI || !setupUI.root.isConnected){
  const form=el('form',undefined,'form-card');form.id='booki-roster-setup';old.replaceWith(form);
  const ui=editor(form,setup,async d=>{
   _newClub.members=plan(d);
   originalReview();
  },true);
  const later=button('הוספת ילדים מאוחר יותר',()=>{if(setup.busy)return;_newClub.members=[];originalReview();},'br-later');
  form.append(later);setupUI={root:form,...ui};
 }
}
const originalCreate=window.showCreateClub;
window.showCreateClub=function(){
 setup=draft();if(setupUI?.root){const blank=el('div',undefined,'form-card');setupUI.root.replaceWith(blank);}setupUI=null;
 return originalCreate.apply(this,arguments);
};
window.goToReview=function(){mountSetup();setupUI?.root.requestSubmit();};
async function members(id){
 const snap=await window.db.collection('clubs').doc(id).collection('memberships').get({source:'server'});
 if(snap.metadata?.fromCache)throw Error('לא ניתן לאמת את רשימת הילדים כרגע');
 return snap.docs.map(d=>({...d.data(),userId:d.id})).filter(m=>m.status!=='left');
}
async function saveExisting(d,status,id,uid){
 if(!window.BookiRosterStore)throw Error('העדכון עדיין נטען. נסו שוב');
 const isCurrent=()=>clubId()===id && teacher()?.uid===uid && editUI?.root.isConnected;
 if(!isCurrent())return;
 status.textContent='שומרת את הכרטיסים…';
 let result;
 try{
  result=await window.BookiRosterStore.save(id,d.mode==='open'?{target:count(d.count)}:{names:parse(d.text)},uid);
 }catch(e){
  if(e.code==='permission-denied')throw Error('שמירת השמות בכרטיסים הקיימים עדיין דורשת השלמת עדכון המערכת. לא נוספו כרטיסים.');
  throw e;
 }
 if(!isCurrent())return;
 d.text='';d.single='';d.count=String(result.total);editUI.repaint();
 await window.showClubStudents();
 if(isCurrent())editUI.status.textContent='נשמר · '+result.total+' כרטיסים במועדון';
}

function mountExisting(){
 const screen=$('screen-club-students'),grid=$('club-students-grid'),id=clubId(),uid=teacher()?.uid;
 if(!screen||!grid||!id||!uid)return;
 if(existing?.id!==id||existing?.uid!==uid){existing={id,uid,d:draft()};editUI?.root.remove();editUI=null;}
 if(!editUI?.root.isConnected){
  const form=el('form');form.id='booki-roster-existing';grid.before(form);
  const ui=editor(form,existing.d,(d,status)=>saveExisting(d,status,id,uid),false);editUI={root:form,...ui};
 }
 if(!grid.dataset.rosterManaged){
  grid.dataset.rosterManaged='1';
  grid.addEventListener('click',e=>{if(e.target.closest('.profile-card')){e.preventDefault();e.stopImmediatePropagation();}},true);
 }
 grid.querySelectorAll('.profile-card').forEach(card=>{card.removeAttribute('onclick');card.removeAttribute('role');card.tabIndex=-1;});
 if(!editUI.summary){
  const summary=el('p',undefined,'br-capacity-summary');editUI.root.querySelector('h3').after(summary);editUI.summary=summary;
 }
 const ui=editUI;
 Promise.all([window.db.collection('clubs').doc(id).get({source:'server'}),members(id)]).then(([club,rows])=>{
  if(editUI!==ui || clubId()!==id || teacher()?.uid!==uid)return;
  const limit=window.BookiRosterStore.capacity(club.data()||{},rows);
  ui.summary.textContent=limit+' ילדים בכיתה · '+rows.length+' כרטיסים';
  if(!existing.d.count)existing.d.count=String(limit||'');
  ui.repair?.remove();ui.repair=null;
  if(rows.length>limit && limit>0){
   const repair=button('איחוד ל־'+limit+' כרטיסים',()=>{if(existing.d.busy)return;existing.d.mode='open';existing.d.count=String(limit);ui.repaint();ui.root.requestSubmit();});
   ui.summary.after(repair);ui.repair=repair;
  }
 }).catch(()=>{if(editUI===ui)ui.summary.textContent='מספר הכרטיסים לא נטען';});
 const old=$('add-student-section');if(old)old.hidden=true;
 const title=screen.querySelector('h2');if(title)title.textContent='ילדי המועדון';
}
const originalStudents=window.showClubStudents;
window.showClubStudents=async function(){const token=++revision;await originalStudents.apply(this,arguments);if(token===revision)mountExisting();};
function mountVisible(){
 if($('screen-create-members')?.classList.contains('active'))mountSetup();
 if($('screen-club-students')?.classList.contains('active'))mountExisting();
}
const observer=new MutationObserver(mountVisible);
document.querySelectorAll('.screen').forEach(s=>observer.observe(s,{attributes:true,attributeFilter:['class']}));
const style=el('style');style.textContent=`
.booki-roster{box-sizing:border-box;margin:16px;padding:20px;border:1px solid #d7e4d9;border-radius:20px;background:#fffdf6;font:16px Arial,sans-serif;text-align:right}
.booki-roster h3{margin:0 0 16px;font-size:23px}
.br-modes{display:flex;gap:8px;margin-bottom:20px}.br-modes button{flex:1;min-width:0;padding:12px 4px}
.booki-roster button{font:700 16px Arial,sans-serif;border:1px solid #b9d1c0;border-radius:12px;min-height:46px;background:white;color:#2b543b;cursor:pointer}
.br-mode[aria-pressed=true]{background:#e0f2e5;border:2px solid #28724c}
.br-fields label{display:block;font-weight:700}.br-fields textarea,.br-fields input{box-sizing:border-box;width:100%;font:18px/1.6 Arial,sans-serif;padding:12px;border:1px solid #b9d1c0;border-radius:12px;margin:8px 0;background:white;color:#253f35}
.br-fields textarea{resize:vertical}.br-single{display:flex;align-items:center;gap:8px}.br-single input{flex:1;min-width:0}.br-single button{padding:8px}
.br-draft{display:flex;flex-wrap:wrap;gap:8px}.br-chip{display:flex;gap:12px;align-items:center;background:#eef6ee;border-radius:12px;padding:4px 12px}.br-chip button{border:0;background:none}
.booki-roster .br-save{display:block;width:100%;background:#26714f;color:white;margin-top:16px;padding:14px;font-size:18px}
.booki-roster .br-later{display:block;border:0;background:none;text-decoration:underline;margin:10px auto 0}
.br-status:empty{display:none}.br-status{line-height:1.6}.booki-roster button:disabled{opacity:.5;cursor:default}
#screen-club-students #add-student-section{display:none!important}
`;document.head.appendChild(style);
window.BookiRoster={parse,plan,version:'20260915-unified'};
mountVisible();
})();
