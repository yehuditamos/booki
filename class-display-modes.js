/* Booki — class display modes v2: teacher preview + student class view */
(function(){
'use strict';
const BOARD='leaderboard', TODAY='todayReaders', TREE='progressOnly';
let selectedMode=BOARD;
const originalSet=window.setProgressDisplayMode;
const originalTeacherRender=window._renderTeacherClassContent;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sameDay=v=>{if(!v)return false;const d=new Date(v),n=new Date();return !isNaN(d)&&d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate()};
const avatar=m=>esc(m?.emoji||m?.avatar||'📚');
const total=m=>Math.round(m?.cachedStats?.totalMinutes||0);
const todayMins=m=>Math.round(m?.cachedStats?.todayMinutes??m?.cachedStats?.minutesToday??m?.cachedStats?.lastSessionMinutes??0);

function modePreview(mode,members){
 const active=(members||[]).filter(m=>m.status!=='left');
 if(mode===TREE)return `<div class="bdp-demo bdp-tree-demo"><div class="bdp-demo-tree">🌳</div><strong>רק העץ והיעד הכיתתי</strong><span>בלי שמות ובלי נתוני ילדים</span></div>`;
 if(mode===TODAY){const list=active.filter(m=>sameDay(m.cachedStats?.lastReadAt)).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'he'));return `<div class="bdp-demo bdp-today-demo"><h4>קראו היום:</h4><div class="bdp-floaters">${list.length?list.map(m=>`<span>${avatar(m)} <b>${esc(m.name||'קורא/ת')}</b> · ${todayMins(m)} דק׳</span>`).join(''):'<i>עוד לא קראו היום 🌱</i>'}</div><div class="bdp-demo-tree">🌳</div></div>`;}
 const sorted=[...active].sort((a,b)=>total(b)-total(a));return `<div class="bdp-demo bdp-board-demo"><h4>🏆 מי קרא הכי הרבה</h4>${sorted.slice(0,5).map((m,i)=>`<div><b>${i+1}.</b> ${avatar(m)} ${esc(m.name||'קורא/ת')} <strong>${total(m)} דק׳</strong></div>`).join('')||'<i>אין עדיין נתוני קריאה</i>'}</div>`;
}

function picker(clubId,mode,members){
 const el=document.createElement('div');el.className='booki-display-picker';
 el.innerHTML=`<div class="bdp-title">👀 מה הילדים יראו ליד העץ הכיתתי?</div>
 <button class="bdp-option ${mode===BOARD?'active':''}" data-mode="${BOARD}"><strong>🏆 תחרותי — מי קרא הכי הרבה</strong><span>דירוג לפי סך זמן הקריאה עד היום.</span></button>
 <div class="bdp-preview ${mode===BOARD?'open':''}" data-preview="${BOARD}">${modePreview(BOARD,members)}</div>
 <button class="bdp-option ${mode===TODAY?'active':''}" data-mode="${TODAY}"><strong>📚 קראו היום <em>ללא תחרות</em></strong><span>רק מי שקרא היום, עם אייקון, שם ודקות. ללא דירוג.</span></button>
 <div class="bdp-preview ${mode===TODAY?'open':''}" data-preview="${TODAY}">${modePreview(TODAY,members)}</div>
 <button class="bdp-option ${mode===TREE?'active':''}" data-mode="${TREE}"><strong>🌳 העץ בלבד</strong><span>היעד הכיתתי בלבד, בלי שמות ובלי נתוני ילדים.</span></button>
 <div class="bdp-preview ${mode===TREE?'open':''}" data-preview="${TREE}">${modePreview(TREE,members)}</div>
 <p class="bdp-note">💡 מה שמופיע מתחת לבחירה הוא בדיוק סוג המידע שיוצג לילדים. נתוני הניהול שלך לא נעלמים.</p>`;
 el.querySelectorAll('.bdp-option').forEach(btn=>btn.onclick=async()=>{
   const m=btn.dataset.mode; selectedMode=m;
   el.querySelectorAll('.bdp-option').forEach(b=>b.classList.toggle('active',b===btn));
   el.querySelectorAll('.bdp-preview').forEach(p=>p.classList.toggle('open',p.dataset.preview===m));
   btn.disabled=true;
   try{await saveMode(clubId,m);}
   finally{btn.disabled=false;}
 });
 return el;
}

async function saveMode(clubId,mode){
 if(![BOARD,TODAY,TREE].includes(mode))return;
 if(typeof fbSaveClub==='function'){
   const current=typeof fbLoadClub==='function'?await fbLoadClub(clubId):null;
   const settings={...(current?.settings||{}),progressDisplay:mode};
   await fbSaveClub(clubId,{settings});
 }else if(typeof originalSet==='function'&&mode!==TODAY){await originalSet(clubId,mode);}
 if(window._currentTeacherClubData){window._currentTeacherClubData={...window._currentTeacherClubData,settings:{...(window._currentTeacherClubData.settings||{}),progressDisplay:mode}};}
}
window.setProgressDisplayMode=saveMode;

function enhanceTeacher(club,members,clubId){
 const old=document.querySelector('#class-content .tcd-qa-view');if(!old)return;
 const mode=club?.settings?.progressDisplay||selectedMode||BOARD;selectedMode=mode;
 old.replaceWith(picker(clubId,mode,members));
}

// Wrap the actual teacher renderer: this gives the picker the SAME club/membership data the table uses.
if(typeof originalTeacherRender==='function'){
 window._renderTeacherClassContent=function(club,members,clubId,shopState){
   const r=originalTeacherRender.call(this,club,members,clubId,shopState);
   queueMicrotask(()=>enhanceTeacher(club,members,clubId));
   return r;
 };
}

function renderStudentMode(club,members){
 const content=document.getElementById('class-content');if(!content||window._currentTeacher)return;
 const mode=club?.settings?.progressDisplay||BOARD;
 const active=(members||[]).filter(m=>m.status!=='left');
 const lb=content.querySelector('.tcd-leaderboard,.leaderboard');
 content.querySelector('.booki-student-mode')?.remove();
 if(mode===BOARD){if(lb)lb.style.display='';return;}
 if(lb)lb.style.display='none';
 const host=document.createElement('section');host.className='booki-student-mode';
 if(mode===TREE){host.innerHTML='<div class="bsm-tree-only"><span>🌳</span></div>';}
 else{
   const list=active.filter(m=>sameDay(m.cachedStats?.lastReadAt)).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'he'));
   host.innerHTML=`<h3>קראו היום:</h3><div class="bsm-orbit">${list.length?list.map(m=>`<span class="bsm-reader">${avatar(m)} <b>${esc(m.name||'קורא/ת')}</b> <strong>${todayMins(m)} דק׳</strong></span>`).join(''):'<p>עוד לא קראו היום 🌱</p>'}<div class="bsm-tree">🌳</div></div>`;
 }
 content.prepend(host);
}

// Student class view is rendered in script.js. Observe the finished screen and load fresh club data,
// so the saved teacher choice is applied even though the original renderer knows only 2 modes.
let studentTimer=0;
const obs=new MutationObserver(()=>{
 clearTimeout(studentTimer);studentTimer=setTimeout(async()=>{
   if(window._currentTeacher)return;
   const screen=document.getElementById('screen-class');
   if(!screen?.classList.contains('active'))return;
   const clubId=window.currentClubId;
   if(!clubId||typeof fbLoadClub!=='function'||typeof fbLoadClubMemberships!=='function')return;
   try{const [c,m]=await Promise.all([fbLoadClub(clubId),fbLoadClubMemberships(clubId)]);renderStudentMode(c,m);}catch(e){console.warn('[booki] display mode render',e);}
 },60);
});
obs.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});

const style=document.createElement('style');style.textContent=`
.booki-display-picker{direction:rtl;display:grid;gap:8px;width:100%;margin:8px 0 12px}.bdp-title{font-weight:900;font-size:16px;color:#24372f}.bdp-option{direction:rtl;text-align:right;border:2px solid #dce9df;background:#fff;border-radius:15px;padding:11px 13px;display:grid;gap:3px;color:#26372f;cursor:pointer;font-family:inherit}.bdp-option strong{font-size:14px}.bdp-option span{font-size:12px;line-height:1.45;color:#64736c}.bdp-option em{font-style:normal;background:#e5f7ed;color:#24734a;padding:2px 7px;border-radius:999px;font-size:11px;margin-right:5px}.bdp-option.active{border-color:#43a86f;background:#f0fbf4;box-shadow:0 0 0 2px rgba(67,168,111,.1)}.bdp-preview{display:none;margin:-3px 8px 5px;padding:12px;background:#f8fcf9;border:1px dashed #b9d9c5;border-radius:14px}.bdp-preview.open{display:block}.bdp-note{font-size:11px;line-height:1.45;color:#66736e;margin:2px 3px}.bdp-demo{text-align:center}.bdp-demo h4{margin:0 0 8px}.bdp-board-demo div{display:flex;justify-content:space-between;padding:5px 8px;border-bottom:1px solid #e7eee9}.bdp-demo-tree{font-size:58px;line-height:1.1}.bdp-tree-demo{display:grid;gap:4px}.bdp-tree-demo span{font-size:11px;color:#68756e}.bdp-floaters{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}.bdp-floaters span,.bsm-reader{background:#fff;border:1.5px solid #bce6ce;border-radius:999px;padding:6px 9px;box-shadow:0 4px 12px rgba(37,112,70,.1)}.booki-student-mode{direction:rtl;text-align:center;margin:8px auto 18px;max-width:650px}.booki-student-mode h3{font-size:22px;color:#244b39}.bsm-orbit{min-height:250px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center;position:relative;padding:15px}.bsm-reader{display:flex;gap:5px;align-items:center;animation:bsmFloat 3s ease-in-out infinite alternate}.bsm-reader:nth-child(2n){animation-delay:-1s}.bsm-reader strong{font-size:12px;color:#28764d}.bsm-tree{font-size:80px;width:100%}.bsm-tree-only span{font-size:90px}@keyframes bsmFloat{from{transform:translateY(-3px)}to{transform:translateY(5px)}}@media(prefers-reduced-motion:reduce){.bsm-reader{animation:none}}
`;document.head.appendChild(style);
})();
