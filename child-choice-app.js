/* Opt-in full-app pilot. No production entry point, database rules or storage changes. */
(function () {
 'use strict';
 const home=document.getElementById('screen-main');
 const header=home?.querySelector('.home-header'),consoleWrap=home?.querySelector('.home-console-wrap');
 // If a future app release changes these hooks, retain the original UI instead of hiding it.
 if(!header||!consoleWrap||document.getElementById('cc-home')||!window.BookiChoice||
    typeof window.showScreen!=='function'||typeof window.getAllStories!=='function'||typeof window.startStory!=='function')return;
 const originalShow=window.showScreen,originalRecs=window.renderStoryRecommendations;
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const root=node('section');root.id='cc-home';header.after(root);
 const resume=node('button');resume.id='cc-app-resume';resume.type='button';resume.className='cc-secondary';resume.hidden=true;root.before(resume);
 const style=node('style');
 style.textContent='#screen-main .home-console-stage,#screen-main .home-speech-bubble,#screen-main #home-start-reading,#screen-main .home-start-hint,#screen-main #home-shelf-card,#screen-main #booki-story-recommendations{display:none!important}#cc-home{padding-top:0}#screen-choice-library{background:#faf7ec;min-height:100vh}#screen-main .home-console-wrap{padding-top:0}';
 document.head.append(style);
 const activeReader=()=>typeof window.getActiveReader==='function'?window.getActiveReader():null;
 const context=()=>{const r=activeReader();const uid=typeof firebase!=='undefined'?firebase.auth().currentUser?.uid:null;return JSON.stringify([r?.clubId??null,r?.userId??null,uid??null]);};
 let recs=[],recContext=null,generation=0,lastContext=null,loadedContext=null;
 // During a load or an identity switch, no previous/public fallback catalog is exposed.
 const catalog=()=>loadedContext===context()?window.getAllStories():[];
 const recommendations=()=>recContext===context()?recs.map(r=>r.id):[];
 const dismiss=()=>document.querySelectorAll('.cc-dialog').forEach(d=>{if(d.open)d.close();else d.remove();});
 let chooser,library;
 function resetContext(){
  const key=context();if(lastContext===key)return;
  loadedContext=null;recs=[];recContext=null;lastContext=key;dismiss();resume.hidden=true;resume.textContent='';
  chooser?.reset();library?.reset();
 }
 async function open(id){
  const key=context();if(!catalog().some(s=>String(s.id)===String(id)))return false;
  const r=recContext===key?recs.find(r=>String(r.id)===String(id)):null;
  if(r){await r.open();return context()===key&&!!document.getElementById('screen-reader')?.classList.contains('active');}
  const opened=await window.startStory(id);return context()===key?opened:false;
 }
 function message(target,text,retry){
  const p=node('p',text);p.setAttribute('role','status');target.replaceChildren(p);
  if(retry){const b=node('button','ניסיון נוסף');b.type='button';b.className='cc-secondary';b.onclick=retry;target.append(b);}
 }
 async function load(target,ui,screenId,retry){
  resetContext();const key=context(),token=++generation;loadedContext=null;dismiss();resume.hidden=true;
  message(target,'הסיפורים בדרך…');target.setAttribute('aria-busy','true');
  const current=()=>token===generation&&context()===key&&document.getElementById(screenId)?.classList.contains('active');
  try{
   const ready=await window.BookiPrivateLibrary?.refresh();
   if(!current())return;
   if(ready===false)throw Error('catalog-unavailable');
   loadedContext=key;ui.render();if(screenId==='screen-main')renderResume();
  }catch(error){
   if(!current())return;
   loadedContext=null;message(target,'לא הצלחנו לטעון את הספרייה. אפשר לנסות שוב.',retry);
  }finally{if(token===generation)target.removeAttribute('aria-busy');}
 }
 // Reuse the app's existing pause/resume state and timers; never start a new session to resume.
 function renderResume(){
  resume.hidden=true;
  if(typeof window._loadPausedAppStory!=='function'||typeof window.resumePausedAppStory!=='function')return;
  const saved=window._loadPausedAppStory();
  if(!saved||!catalog().some(s=>String(s.id)===String(saved.storyId)))return;
  resume.textContent='ממשיכים בסיפור: '+saved.story.title;resume.hidden=false;resume.disabled=false;
 }
 resume.onclick=async()=>{
  if(resume.disabled)return;
  const key=context(),token=++generation;resume.disabled=true;
  const current=()=>token===generation&&key===context()&&home.classList.contains('active');
  try{
   const ready=await window.BookiPrivateLibrary?.refresh();if(!current())return;
   if(ready===false)throw Error('catalog-unavailable');
   const saved=window._loadPausedAppStory();
   if(!saved||!catalog().some(s=>String(s.id)===String(saved.storyId))||!window.resumePausedAppStory())throw Error('resume-unavailable');
  }catch(error){if(current()){resume.hidden=true;message(root,'לא הצלחנו להמשיך כרגע. ננסה לטעון את הספרייה מחדש.',refreshHome);}}
  finally{resume.disabled=false;}
 };
 const refreshHome=()=>load(root,chooser,'screen-main',refreshHome);
 chooser=BookiChoice.mount(root,{catalog,context,recommendations,open,refresh:refreshHome});
 const extra=node('button','קריאה מספר שיש לי בבית');extra.type='button';extra.className='cc-secondary';
 extra.onclick=()=>{if(typeof window.openReadingChooser==='function')window.openReadingChooser();};consoleWrap.before(extra);
 const screen=node('section');screen.id='screen-choice-library';screen.className='screen';
 const back=node('button','חזרה לבית →');back.type='button';back.className='cc-secondary';back.onclick=()=>window.showScreen('screen-main');
 const list=node('div');screen.append(back,list);document.body.append(screen);
 library=BookiChoice.mount(list,{browse:true,catalog,context,recommendations,open,refresh:()=>window.showLibrary()});
 window.showScreen=function(id){
  ++generation;dismiss();resetContext();resume.hidden=true;root.removeAttribute('aria-busy');list.removeAttribute('aria-busy');
  const result=originalShow.apply(this,arguments);
  if(id==='screen-main')void refreshHome();
  return result;
 };
 window.showLibrary=async function(){
  window.showScreen('screen-choice-library');
  return load(list,library,'screen-choice-library',()=>window.showLibrary());
 };
 if(typeof originalRecs==='function')window.renderStoryRecommendations=function(clubId,userId,messages,seen){
  const result=originalRecs.apply(this,arguments),active=activeReader();
  if(active?.clubId!==clubId||active?.userId!==userId)return result;
  resetContext();
  // Use the existing recommendation handlers, preserving their successful-open/seen behavior.
  const available=window.getAllStories();
  const valid=(messages||[]).filter(m=>m.type==='story-recommendation'&&m.toUserId===userId&&!seen.has(m.id)&&available.some(s=>String(s.id)===String(m.storyId)));
  const buttons=[...document.querySelectorAll('#booki-story-recommendations button')];
  recs=valid.map((m,i)=>({id:m.storyId,open:async()=>{
   const b=buttons[i];if(!b?.isConnected||b.disabled||typeof b.onclick!=='function')return;
   await b.onclick();
   if(!b.isConnected)recs=recs.filter(r=>String(r.id)!==String(m.storyId));
   if(loadedContext===context()){chooser.render();library.render();}
  }}));recContext=context();
  if(loadedContext===context()){chooser.render();library.render();}
  return result;
 };
 if(home.classList.contains('active'))void refreshHome();
})();
