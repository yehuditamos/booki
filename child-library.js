/* Production child library. UI only: native auth, scoped catalog and reading persistence stay authoritative. */
(function(){
 'use strict';
 if(window.BookiChildLibrary||!window.BookiChoice||!window.BookiChildTopics)return;
 const screen=document.getElementById('screen-library');if(!screen)return;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn,cls='cc-secondary')=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;};
 const reader=()=>typeof getActiveReader==='function'?getActiveReader():null;
 const auth=()=>typeof firebase!=='undefined'?firebase.auth().currentUser:null;
 const key=()=>{const r=reader();return JSON.stringify([r?.clubId??null,r?.userId??null,auth()?.uid??null]);};
 const canUse=()=>!!reader()?.userId&&!!auth()?.isAnonymous&&!!window.BookiPrivateLibrary;
 const root=el('div');root.id='booki-child-library';screen.append(root);
 let generation=0,loaded=null,items=[],chooser=null,activeTopic=null,pending=Promise.resolve();
 const topics=window.BookiChildTopics;
 const allTopic={id:'all',label:'כָּל הַסִּפּוּרִים',icon:'📚',match:()=>true};
 const valid=()=>canUse()&&loaded===key()&&screen.classList.contains('active');
 const catalog=()=>valid()?items.filter(s=>activeTopic?.match(s)??true):[];
 const closeChoice=()=>{chooser?.destroy();chooser=null;};
 function clear(){++generation;loaded=null;items=[];activeTopic=null;closeChoice();root.replaceChildren();root.removeAttribute('aria-busy');}
 function status(text,retry){
  root.replaceChildren();const p=el('p',text);p.setAttribute('role','status');root.append(p);
  if(retry)root.append(button('ניסיון נוסף',()=>open()));
  root.append(button('חזרה לבית →',home));
 }
 function home(){if(typeof goReaderHome==='function')goReaderHome();else showScreen('screen-main');}
 function header(back){
  const h=el('header',null,'topbar');h.append(el('span','בּוֹקִי · הַסִּפְרִיָּה שֶׁלִּי','brand'),button(back?'→ לכל הנושאים':'חזרה לבית →',back?folders:home));root.append(h);
 }
 function formatDot(f){
  const d=el('span',f.symbol,'folder-format-dot');d.dataset.format=f.id;d.style.setProperty('--folder-format-color',f.color);d.title=f.label;d.setAttribute('aria-hidden','true');return d;
 }
 function folders(){
  if(!valid())return open();
  closeChoice();activeTopic=null;root.replaceChildren();header(false);
  const hero=el('div',null,'hero'),copy=el('div'),h=el('h1','עַל מָה בָּא לְךָ לִקְרֹא?');h.tabIndex=-1;
  copy.append(h,el('p','בוחרים נושא שמסקרן אותך, ומוצאים סיפור בתוכו.'));
  const mascot=el('img',null,'mascot');mascot.src='assets/booki/core/states/booki-welcome.png';mascot.alt='בוקי מחייך ומנופף';mascot.width=112;mascot.height=130;
  hero.append(copy,mascot);root.append(hero,el('p','הצבעים שעל התיקייה מראים אילו סוגי טקסט יש בפנים.','folder-format-hint'));
  if(!items.length){root.append(el('p','המורה מכינה כאן סיפורים לכיתה. אפשר לחזור בהמשך.'),button('רענון הספרייה',open));return;}
  const grid=el('div',null,'folders');
  const formats=new Map(items.map(s=>[s.id,BookiChoice.profile(s).format.id]));
  for(const t of topics){
   const stories=items.filter(t.match);if(!stories.length)continue;
   const available=BookiChoice.formats.filter(f=>stories.some(s=>formats.get(s.id)===f.id));
   const b=button('',()=>shelf(t.id),'folder');b.dataset.folder=t.id;
   b.setAttribute('aria-label',t.label+' · '+stories.length+' סיפורים. בפנים: '+available.map(f=>f.label).join(', '));
   const art=el('span',t.icon,'folder-art');art.setAttribute('aria-hidden','true');
   const dots=el('span',null,'folder-formats');dots.setAttribute('aria-hidden','true');available.forEach(f=>dots.append(formatDot(f)));
   b.append(art,el('span',t.label,'folder-title'),el('span',stories.length+' סיפורים','folder-count'),dots);grid.append(b);
  }
  root.append(grid);
  const legend=el('details',null,'folder-format-key');legend.append(el('summary','מה אומרים הצבעים?'));const row=el('div',null,'folder-format-legend');
  for(const f of BookiChoice.formats){const item=el('span',null,'folder-format-legend-item');item.append(formatDot(f),el('span',f.label));row.append(item);}legend.append(row);root.append(legend);
  root.append(button('לְכָל הַסִּפּוּרִים ←',()=>shelf('all'),'cc-secondary all-stories'));
  // Keep existing letter practice available only when the class catalog includes public beginner texts.
  if(items.some(s=>['beginner','reading-stages'].includes(s.libraryId))&&typeof showLettersReading==='function')root.append(button('קוֹרְאִים אוֹתִיּוֹת',()=>showLettersReading(),'cc-secondary all-stories'));
  h.focus({preventScroll:true});window.scrollTo(0,0);
 }
 function mixed(){
  const all=catalog(),queues=BookiChoice.formats.map(f=>all.filter(s=>BookiChoice.profile(s).format.id===f.id));
  const out=[];while(queues.some(q=>q.length))for(const q of queues)if(q.length)out.push(q.shift());return out;
 }
 function shelf(id){
  if(!valid())return open();
  closeChoice();activeTopic=topics.find(t=>t.id===id)||allTopic;root.replaceChildren();header(true);
  const heading=el('header',null,'shelf-head'),h=el('h1',activeTopic.icon+' '+activeTopic.label);h.tabIndex=-1;
  heading.append(h,el('p','איזה סיפור מסקרן אותך? לוחצים ומציצים.'));root.append(heading);
  const host=el('div',null,'shelf-view');root.append(host);
  const context=()=>key()+'|'+generation+'|'+activeTopic?.id;
  chooser=BookiChoice.mount(host,{browse:true,catalog:mixed,context,refresh:open,open:async storyId=>{
   const before=context();
   const isCurrent=()=>valid()&&context()===before&&catalog().some(s=>String(s.id)===String(storyId));
   if(!isCurrent())return false;
   // The native start performs another server scope refresh, then checks this guard before recording anything.
   return window.startStory(storyId,{isCurrent});
  }});
  h.focus({preventScroll:true});window.scrollTo(0,0);
 }
 async function load(){
  clear();const token=generation,context=key();screen.classList.add('booki-child-library-active');root.setAttribute('aria-busy','true');status('הסיפורים בדרך…');
  const current=()=>generation===token&&key()===context&&canUse()&&screen.classList.contains('active');
  try{
   const ready=await window.BookiPrivateLibrary.refresh();if(!current())return false;
   if(ready===false)throw Error('catalog-unavailable');
   items=getAllStories().filter(s=>s?.id!=null&&Array.isArray(s.pages)&&BookiChoice.profile(s).format);loaded=context;folders();return true;
  }catch(error){if(current()){items=[];loaded=null;status('לא הצלחנו לטעון את הספרייה. אפשר לנסות שוב.',true);}return false;}
  finally{if(generation===token)root.removeAttribute('aria-busy');}
 }
 function onScreenChange(id){
  if(id==='screen-library'&&canUse()){pending=load();return;}
  clear();screen.classList.remove('booki-child-library-active');
 }
 function open(){showScreen('screen-library');return pending;}
 function back(){if(activeTopic)folders();else home();}
 const refreshVisible=()=>{if(screen.classList.contains('active')&&canUse())pending=load();else if(loaded!==null&&loaded!==key())clear();};
 window.BookiChildLibrary={canUse,open,folders,back,onScreenChange,version:'20260918-live-topics'};
 window.addEventListener('storage',e=>{if(!e.key||['booki_active_reader','booki_device_v1'].includes(e.key))refreshVisible();});
 window.addEventListener('pageshow',e=>{if(e.persisted)refreshVisible();});
 if(typeof firebase!=='undefined')firebase.auth().onAuthStateChanged(()=>{if(loaded!==null&&loaded!==key()){clear();if(screen.classList.contains('active')){if(canUse())pending=load();else home();}}});
 if(screen.classList.contains('active'))onScreenChange('screen-library');
})();
