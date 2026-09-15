/** Teacher-only child experience preview. Reads class data; never enters a reader session. */
(function(){
'use strict';
if(window.BookiChildDemo)return;
const ID='screen-teacher-child-demo';
let state=null,request=0;
const $=id=>document.getElementById(id);
const teacher=()=>typeof getCurrentTeacher==='function'?getCurrentTeacher():null;
const clubId=()=>typeof _activeClubId!=='undefined'?_activeClubId:window.currentClubId;
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function button(text,fn,cls='bcd-button'){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;}
function current(){return state && teacher()?.uid===state.uid && clubId()===state.id && $(ID)?.classList.contains('active');}
function back(){request++;state=null;setNavVisible(false);if(teacher())showScreen('screen-teacher-club');else showTeacherAuth('login');}
function image(src,alt){const n=el('img');n.src=src;n.alt=alt;return n;}
function install(){
 if($(ID))return;
 const screen=el('section',undefined,'screen booki-world booki-world--home');screen.id=ID;screen.dir='rtl';
 const banner=el('header',undefined,'bcd-banner');
 banner.append(button('חזרה למורה →',back,'btn-back'),el('strong','ככה נראה המועדון של הכיתה מבפנים'),el('small','הדגמה בלבד · הקריאה כאן לא נרשמת'));
 const body=el('div',undefined,'bcd-body');body.id='bcd-body';
 screen.append(banner,body);document.body.appendChild(screen);
}
function navigation(){
 const nav=el('nav',undefined,'bcd-nav');nav.setAttribute('aria-label','ניווט בהדגמה');
 nav.append(button('🏠 בית',()=>renderHome()),button('🌳 הכיתה שלנו',()=>renderTree()));
 return nav;
}
function body(){if(!current())return null;request++;const b=$('bcd-body');b.replaceChildren();return b;}
function heading(b){b.append(el('p',state.club?.name||'הכיתה שלי','bcd-class-name'));}
function renderHome(){
 const b=body();if(!b)return;heading(b);
 const greeting=el('div',undefined,'home-header');greeting.append(el('span','📚 קורא/ת לדוגמה','greeting-name'));b.append(greeting);
 const hero=el('div',undefined,'bcd-hero');hero.append(image('assets/booki/core/states/booki-reading.png','בוקי'));b.append(hero);
 b.append(button('📚 התחלת קריאה',renderLibrary,'bcd-primary'));
 b.append(button('🌳 העץ הכיתתי',renderTree,'bcd-button'),navigation());
}
function stories(){return typeof getAllStories==='function'?getAllStories().filter(s=>Array.isArray(s.pages)&&s.pages.length):[];}
function renderLibrary(){
 const b=body();if(!b)return;heading(b);b.append(el('h2','מה נקרא היום?'));
 const input=el('input');input.type='search';input.placeholder='חיפוש סיפור';input.setAttribute('aria-label','חיפוש סיפור בהדגמה');b.append(input);
 const list=el('div',undefined,'bcd-stories');b.append(list);
 const draw=()=>{
  list.replaceChildren();const q=input.value.trim();
  const available=stories().filter(s=>String(s.title||'').includes(q)).slice(0,24);
  if(!available.length)list.append(el('p','לא נמצאו סיפורים'));
  available.forEach(s=>list.append(button((s.emoji||'📖')+' '+s.title,()=>{state.story=s;state.page=0;renderStory();})));
 };
 input.oninput=draw;draw();b.append(navigation());
}
function renderStory(){
 const b=body();if(!b || !state.story)return;
 b.append(el('h2',state.story.title));
 const page=state.story.pages[state.page];b.append(el('p',page.text||'','bcd-story-text'));
 const controls=el('div',undefined,'bcd-page-controls');
 const previous=button('→ הקודם',()=>{state.page--;renderStory();});previous.disabled=state.page===0;
 const next=button(state.page===state.story.pages.length-1?'סיום הסיפור':'הבא ←',()=>{
  if(state.page<state.story.pages.length-1){state.page++;renderStory();}
  else{const done=body();if(!done)return;done.append(image('assets/booki/core/states/booki-reading.png','בוקי'),el('h2','כל הכבוד! קראתם סיפור שלם 🎉'),button('לסיפור נוסף',renderLibrary,'bcd-primary'),navigation());}
 });
 controls.append(previous,el('span',(state.page+1)+' / '+state.story.pages.length),next);b.append(controls,navigation());
}
async function read(ref){const snap=await ref.get({source:'server'});if(snap.metadata?.fromCache)throw Error('unconfirmed');return snap;}
async function renderTree(){
 const b=body();if(!b)return;heading(b);b.append(el('p','טוען את העץ הכיתתי…'));const token=++request;
 try{
  const ref=window.db.collection('clubs').doc(state.id);
  const [clubSnap,members,shop]=await Promise.all([read(ref),read(ref.collection('memberships')),read(ref.collection('shop').doc('state'))]);
  if(!current() || token!==request)return;
  const club=clubSnap.data()||state.club;
  const active=members.docs.map(d=>d.data()).filter(m=>m.status!=='left');
  let target=Number(club.goal?.target)||1500;
  let progress=active.reduce((sum,m)=>sum+(Number(m.cachedStats?.totalMinutes)||0),0);
  if(shop.data()?.activeCycleId){
   const [cycle,economy]=await Promise.all([read(ref.collection('goalCycles').doc(shop.data().activeCycleId)),read(ref.collection('economy').doc('wallet'))]);
   if(!current() || token!==request)return;
   if(cycle.exists){target=Number(cycle.data().target)||target;progress=Math.max(0,Number(economy.data()?.balance)||0);}
  }
  b.replaceChildren();heading(b);
  b.append(el('div','🌳','bcd-tree'),el('h2','העץ של הכיתה שלנו'));
  const track=el('progress');track.max=target;track.value=Math.max(0,progress);track.setAttribute('aria-label','התקדמות ליעד הכיתתי');
  b.append(el('p',Math.round(progress)+' מתוך '+target+' דקות'),track);
  if(club.settings?.progressDisplay!=='progressOnly'){
   const list=el('div',undefined,'bcd-leaderboard');list.append(el('h3','קוראים יחד'));
   active.filter(m=>!String(m.name||'').startsWith('כרטיס פנוי ')||m.claimedByUid).sort((a,c)=>(c.cachedStats?.totalMinutes||0)-(a.cachedStats?.totalMinutes||0)).forEach(m=>list.append(el('p',(m.name?.startsWith('כרטיס פנוי ')?'קורא/ת מהכיתה':m.name)+' · '+Math.round(Number(m.cachedStats?.totalMinutes)||0)+' דקות')));
   b.append(list);
  }
  b.append(navigation());
 }catch(_){if(!current()||token!==request)return;b.replaceChildren(el('p','העץ לא נטען כרגע'),button('לנסות שוב',renderTree),navigation());}
}
window.showTeacherChildDemo=async function(){
 const t=teacher(),id=clubId();if(!t||!id)return;
 install();state={uid:t.uid,id,club:null,story:null,page:0};const token=++request;
 setNavVisible(false);showScreen(ID);$('bcd-body').replaceChildren(el('p','טוען את ההדגמה…'));
 try{
  const snap=await read(window.db.collection('clubs').doc(id));
  if(!current()||token!==request)return;
  if(!snap.exists || snap.data().teacherUid!==t.uid)throw Error('not-owned');
  state.club=snap.data();renderHome();
 }catch(_){if(current()&&token===request)$('bcd-body').replaceChildren(el('p','לא הצלחנו לטעון את ההדגמה'),button('לנסות שוב',window.showTeacherChildDemo));}
};
const style=el('style');style.textContent=`
#${ID}{font-family:Arial,sans-serif}
.bcd-banner{position:sticky;top:0;z-index:30;background:#fff3c6;border-bottom:1px solid #e6d896;display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 16px;text-align:center}
.bcd-banner .btn-back{align-self:flex-start}.bcd-banner small{color:#586553}
.bcd-body{max-width:650px;margin:auto;padding:16px 20px 100px;text-align:center}
.bcd-class-name{color:#326048;font-weight:bold}.bcd-hero img{width:220px;max-width:70%;height:250px;object-fit:contain}
.bcd-body>img{width:180px}.bcd-button,.bcd-primary{font:700 18px Arial,sans-serif;min-height:48px;padding:14px 18px;border:1px solid #b9d5c2;border-radius:16px;color:#28523a;background:#fff;cursor:pointer}
.bcd-primary{display:block;width:100%;background:linear-gradient(120deg,#69d777,#1eaa53);color:white;font-size:30px;padding:26px;margin:16px 0}
.bcd-nav{display:flex;justify-content:center;gap:12px;margin-top:24px}.bcd-nav button{flex:1}
.bcd-stories{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0}.bcd-stories button{min-height:95px}
.bcd-body input{box-sizing:border-box;width:100%;font:18px Arial,sans-serif;padding:12px;border:1px solid #b9d5c2;border-radius:12px}
.bcd-story-text{white-space:pre-line;font-size:32px;line-height:1.9;padding:24px 16px;background:#fffdf6;border-radius:20px}
.bcd-page-controls{display:flex;align-items:center;justify-content:space-between;gap:8px}.bcd-page-controls button:disabled{opacity:.4}
.bcd-tree{font-size:140px}.bcd-body progress{width:100%;height:24px;accent-color:#37ac61}
.bcd-leaderboard{background:#fff;padding:16px;border-radius:20px;margin-top:20px}
`;document.head.appendChild(style);
window.BookiChildDemo={version:'20260915'};
})();
