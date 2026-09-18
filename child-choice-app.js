/* Opt-in full-app pilot, loaded ONLY by child-choice-app-test.html. */
(function(){
 const home=document.getElementById('screen-main');if(!home)return;
 const root=document.createElement('section');root.id='cc-home';home.querySelector('.home-header').after(root);
 const style=document.createElement('style');style.textContent='#screen-main .home-console-stage,#screen-main .home-speech-bubble,#screen-main #home-start-reading,#screen-main .home-start-hint,#screen-main #home-shelf-card,#screen-main #booki-story-recommendations{display:none!important}#cc-home{padding-top:0}#screen-choice-library{background:#faf7ec;min-height:100vh}#screen-main .home-console-wrap{padding-top:0}';document.head.append(style);
 const catalog=()=>getAllStories();const context=()=>JSON.stringify(typeof getActiveReader==='function'?getActiveReader():null);
 let recs=[],recContext=null,request=0,lastContext=null;
 const recommendations=()=>recContext===context()?recs.map(r=>r.id):[];
 async function open(id){
  const r=recContext===context()?recs.find(r=>String(r.id)===String(id)):null;
  if(r){await r.open();return document.getElementById('screen-reader')?.classList.contains('active');}
  return startStory(id);
 }
 const chooser=BookiChoice.mount(root,{catalog,context,recommendations,open,refresh:refreshHome});
 const extra=document.createElement('button');extra.type='button';extra.className='cc-secondary';extra.textContent='קריאה מספר שיש לי בבית';extra.onclick=()=>openReadingChooser();home.querySelector('.home-console-wrap').before(extra);
 async function refreshHome(){
  const version=++request,key=context();if(lastContext!==key){recs=[];recContext=null;chooser.reset();lastContext=key;}
  root.replaceChildren(Object.assign(document.createElement('p'),{textContent:'הסיפורים בדרך…'}));
  await window.BookiPrivateLibrary?.refresh();if(version!==request||context()!==key)return;chooser.render();
 }
 const originalShow=window.showScreen;
 window.showScreen=function(id){const result=originalShow.apply(this,arguments);if(id==='screen-main')refreshHome();return result;};
 const originalRecs=window.renderStoryRecommendations;
 window.renderStoryRecommendations=function(clubId,userId,messages,seen){
  const result=originalRecs.apply(this,arguments),active=typeof getActiveReader==='function'?getActiveReader():null;
  if(active?.clubId!==clubId||active?.userId!==userId)return result;
  const available=catalog(),valid=messages.filter(m=>m.type==='story-recommendation'&&m.toUserId===userId&&!seen.has(m.id)&&available.some(s=>String(s.id)===String(m.storyId)));
  const buttons=[...document.querySelectorAll('#booki-story-recommendations button')];
  recs=valid.map((m,i)=>({id:m.storyId,open:async()=>{await buttons[i]?.onclick();if(!buttons[i]?.isConnected)recs=recs.filter(r=>r.id!==m.storyId);chooser.render();}}));recContext=context();chooser.render();return result;
 };
 const screen=document.createElement('section');screen.id='screen-choice-library';screen.className='screen';
 const back=document.createElement('button');back.type='button';back.className='cc-secondary';back.textContent='חזרה לבית →';back.onclick=()=>showScreen('screen-main');
 const list=document.createElement('div');screen.append(back,list);document.body.append(screen);
 const library=BookiChoice.mount(list,{browse:true,catalog,context,recommendations,open,refresh:()=>window.showLibrary()});
 window.showLibrary=async function(){const key=context(),version=++request;list.replaceChildren();await window.BookiPrivateLibrary?.refresh();if(key!==context()||version!==request)return;library.reset();showScreen('screen-choice-library');};
 if(home.classList.contains('active'))refreshHome();
})();
