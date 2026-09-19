/* Yonatan live reading companion pilot.
 * Free browser SpeechRecognition only. No Booki audio storage, transcript storage,
 * scoring, reports, analytics, paid speech service or blocking navigation.
 * Enabled only for Yonatan in the Amos family club.
 */
(function () {
 'use strict';
 try { window.BookiLocalListening?.stop?.(); } catch (_) {}

 const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
 const TARGET_NAME='יונתן';
 // Live pilot is deliberately limited by child name. Club IDs changed during the
 // family/club migration, so gating on an old hard-coded club ID hid the control.
 const aliases=new Map([['בבקר','בבוקר'],['נעם','נועם'],['לגנה','לגינה'],['כחל','כחול'],['הכחל','הכחול'],['לאמא','לאימא']]);
 const $=id=>document.getElementById(id);
 const norm=v=>String(v||'').normalize('NFKD').replace(/[\u0591-\u05C7]/g,'').replace(/[^א-ת]/g,'');
 const key=v=>{const n=norm(v);return aliases.get(n)||n;};
 const spoken=v=>String(v||'').replace(/[־–—]/g,' ').split(/\s+/).map(key).filter(Boolean);
 const make=()=>({cursor:0,heard:new Set(),gaps:new Set(),queue:[],anchors:new Set()});
 const clone=t=>({cursor:t.cursor,heard:new Set(t.heard),gaps:new Set(t.gaps),queue:[...t.queue],anchors:new Set(t.anchors||[])});

 let words=[],expected=[],nodes=[],track=make(),preview=new Set(),lineGroups=[],lineOf=[],lastCommitted=-1,pageCelebrated=false,locked=false,rollingAnchors=new Set(),yellowFrom=-1,sessionListeningMs=0,listeningSince=0,sessionVerified=false;
 let running=false,quiet=false,armed=false,session=null,epoch=0,restartTimer=null,previewTimer=null,restartTimes=[],emptyEnds=0;

 function reader(){
  try { return typeof getActiveReader==='function'?getActiveReader():null; } catch (_) { return null; }
 }
 function activeName(){
  const r=reader();
  const header=$('current-student-name')?.textContent?.trim();
  return String(window.currentStudentData?.name||r?.name||header||'').trim();
 }
 function isEnabled(){
  // Temporary live pilot: show the opt-in control to every child reader.
  // The microphone still starts only after the child taps "קריאה בקול", and
  // failure never blocks the story. This removes fragile club/name gating while
  // we validate the real-device experience.
  const r=reader();
  return !!(r?.userId || window.currentStudentData?.name || $('current-student-name')?.textContent?.trim());
 }
 function panel(){return $('booki-local-listening');}
 function status(){return $('booki-listening-status');}
 function say(v){if(status())status().textContent=v;}
 function syncButton(){
  const button=$('booki-reading-aloud-btn');if(!button)return;
  button.hidden=!isEnabled();button.textContent=running?'⏸ הפסקת קריאה בקול':'🎙️ קריאה בקול';
  button.setAttribute('aria-pressed',String(running));
 }
 function setPanel(on){
  syncButton();
  const p=panel();if(!p)return;p.hidden=!on;p.style.display=on?'':'none';
  p.classList?.toggle?.('booki-listening-quiet',quiet);
  const meter=$('booki-listening-meter');if(meter)meter.hidden=true;
 }
 function follow(t,incoming){
  t.queue.push(...incoming);if(t.queue.length>64)t.queue.splice(0,t.queue.length-64);
  const accept=i=>{t.heard.add(i);t.anchors.add(i);t.gaps.delete(i);};
  while(t.queue.length&&t.cursor<expected.length){
   const at=t.cursor;let speechAt=-1,storyAt=-1;
   for(let s=0;s<t.queue.length;s++){
    if(t.queue[s]===expected[at]){speechAt=s;storyAt=at;break;}
    if(s+1>=t.queue.length)continue;
    const limit=Math.min(expected.length-2,at+12);
    for(let j=at+1;j<=limit;j++){
     if(t.queue[s]===expected[j]&&t.queue[s+1]===expected[j+1]){speechAt=s;storyAt=j;break;}
    }
    if(storyAt>=0)break;
   }
   if(storyAt<0)break;
   if(storyAt>at){
    for(let i=at;i<storyAt;i++)if(!t.heard.has(i))t.gaps.add(i);
    accept(storyAt);accept(storyAt+1);t.cursor=storyAt+2;t.queue.splice(0,speechAt+2);
   }else{accept(at);t.cursor=at+1;t.queue.splice(0,speechAt+1);}
  }
  return t;
 }
 function paint(){
  nodes.forEach((n,i)=>{
   const yellow=yellowFrom>=0&&i>=yellowFrom&&!track.heard.has(i);
   n.className='reader-word'+(track.heard.has(i)?' is-heard':'')+(yellow?' is-landing':'')+(preview.has(i)?' is-preview':'');
   delete n.dataset.readingRetry;n.removeAttribute('tabindex');n.removeAttribute('role');n.removeAttribute('aria-label');
  });
  const target=$('reader-text');
  target?.querySelectorAll?.('.reader-space').forEach(n=>{
   const after=Number(n.dataset.afterWord||0),green=track.heard.has(after)&&track.heard.has(after+1),yellow=yellowFrom>=0&&after>=yellowFrom-1&&!green;
   n.className='reader-space'+(green?' is-heard':yellow?' is-landing':'');
  });
 }
 function rebuildVisualLines(){
  lineGroups=[];lineOf=[];
  if(!nodes.length)return;
  let group=[],lastTop=null;
  nodes.forEach((node,i)=>{
   const top=Math.round(node.offsetTop||0);
   if(lastTop!==null&&Math.abs(top-lastTop)>3){lineGroups.push(group);group=[];}
   group.push(i);lineOf[i]=lineGroups.length;lastTop=top;
  });
  if(group.length)lineGroups.push(group);
 }
 function realAnchors(t=track){return t.anchors||new Set();}
 function commitThrough(index){
  if(index<=lastCommitted)return;
  for(let i=lastCommitted+1;i<=Math.min(index,words.length-1);i++)track.heard.add(i);
  lastCommitted=Math.min(index,words.length-1);
 }
 function mergeAnchors(candidate){
  (candidate.anchors||[]).forEach(i=>{track.anchors.add(i);rollingAnchors.add(i);});
  const ordered=[...rollingAnchors].sort((x,y)=>x-y);
  // Two distinct forward text anchors establish location once. After lock,
  // every new forward anchor can move the reading wave immediately.
  if(!locked&&ordered.length>=2&&ordered[ordered.length-1]>ordered[0]){locked=true;sessionVerified=true;}
  return ordered;
 }
 function applyFastProgress(candidate){
  if(!words.length)return;
  const ordered=mergeAnchors(candidate);if(!ordered.length)return;
  const last=ordered[ordered.length-1];
  if(locked)commitThrough(last);
  // V3 landing: only the final or penultimate word is an ending anchor.
  // Unverified remainder is encouragement-yellow, never claimed as read-green.
  const endingStart=Math.max(0,words.length-2);
  const endingAnchor=ordered.find(i=>i>=endingStart);
  if(locked&&endingAnchor!==undefined&&!pageCelebrated){
   pageCelebrated=true;
   yellowFrom=Math.min(words.length-1,endingAnchor+1);
   paint();
   const target=$('reader-text');target?.classList?.add?.('reader-page-success');
   say('יפה! הגעת לסוף העמוד ✨');
   setTimeout(()=>target?.classList?.remove?.('reader-page-success'),800);
  }
 }
 function render(value){
  const target=$('reader-text');if(!target)return;
  syncButton();
  if(typeof document.createElement!=='function'||typeof document.createTextNode!=='function'){target.textContent=String(value||'');return;}
  const raw=String(value||''),parts=raw.match(/\S+|\s+/g)||[];
  words=parts.filter(x=>!/^\s+$/.test(x));expected=words.map(key);track=make();preview.clear();lineGroups=[];lineOf=[];lastCommitted=-1;pageCelebrated=false;locked=false;rollingAnchors.clear();yellowFrom=-1;
  target.textContent='';nodes=[];let i=0;
  parts.forEach(part=>{
   if(/^\s+$/.test(part)){
    // Keep spaces inside the painted reading wave so completed chunks look like
    // one calm continuous strip rather than separate green word boxes.
    const n=document.createElement('span');n.className='reader-space';n.textContent=part;n.dataset.afterWord=String(Math.max(0,i-1));target.append(n);return;
   }
   const n=document.createElement('span');n.className='reader-word';n.dataset.wordIndex=String(i++);n.textContent=part;nodes.push(n);target.append(n);
  });
  paint();
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>rebuildVisualLines());else rebuildVisualLines();
 }
 function clearPreview(){clearTimeout(previewTimer);previewTimer=null;preview.clear();}
 function closeRecognition(){
  epoch++;clearTimeout(restartTimer);restartTimer=null;clearPreview();
  const old=session;session=null;if(old){clearTimeout(old.timer);old.rec.onresult=old.rec.onerror=old.rec.onend=null;old.rec.onstart=()=>{try{old.rec.abort();}catch(_){}};try{old.rec.abort();}catch(_){}}
  track.queue=[];
 }
 function stop(hide=true){if(listeningSince){sessionListeningMs+=Math.max(0,Date.now()-listeningSince);listeningSince=0;}running=false;armed=false;closeRecognition();if(hide)setPanel(false);else syncButton();paint();}
 function fallback(){quiet=true;closeRecognition();say('קוראים בנחת — גם בלי צבעים 💛');setPanel(true);paint();}
 function showPreview(input){
  clearPreview();
  const candidate=follow(clone(track),input);
  // V2: interim speech is allowed to move the UI. It does not become a report or
  // score; it only supplies real text anchors for the current reading session.
  if(candidate.anchors?.size)applyFastProgress(candidate);
  preview=new Set([...candidate.heard].filter(i=>!track.heard.has(i)));paint();
  const id=epoch;previewTimer=setTimeout(()=>{if(id===epoch){preview.clear();paint();}},900);
 }
 function applyFinal(input){
  follow(track,input);
  applyFastProgress(track);
  paint();
 }
 function launch(){
  if(!running||quiet||!isEnabled()||document.hidden)return;
  if(!Recognition||!window.isSecureContext||navigator.onLine===false){fallback();return;}
  let rec;try{rec=new Recognition();}catch(_){fallback();return;}
  const id=++epoch,current={rec,id,timer:null,processed:0,had:false};session=current;
  const valid=()=>running&&session===current&&epoch===id&&isEnabled();
  try{rec.lang='he-IL';rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;}catch(_){fallback();return;}
  rec.onstart=()=>{if(!valid()){try{rec.abort();}catch(_){}return;}clearTimeout(current.timer);say('בוקי מקשיב בשקט. קוראים בקצב שלך 💛');setPanel(true);};
  rec.onresult=e=>{
   if(!valid())return;clearTimeout(current.timer);let interim=[];
   try{
    for(let i=0;i<e.results.length;i++){const result=e.results[i],heard=spoken(result[0]?.transcript||'');if(heard.length){current.had=true;emptyEnds=0;}
     if(result.isFinal){if(i>=current.processed){applyFinal(heard);current.processed=i+1;}}else interim.push(...heard);
    }showPreview(interim);
   }catch(_){fallback();}
  };
  rec.onerror=e=>{if(!valid())return;if(e.error==='no-speech')return;fallback();};
  rec.onend=()=>{
   if(!valid())return;clearTimeout(current.timer);session=null;clearPreview();rec.onstart=rec.onresult=rec.onerror=rec.onend=null;
   if(!current.had)emptyEnds++;const now=Date.now();restartTimes=restartTimes.filter(t=>now-t<60000);
   if(emptyEnds>=2||restartTimes.length>=4){fallback();return;}restartTimes.push(now);const gen=epoch;restartTimer=setTimeout(()=>{if(gen===epoch&&running)launch();},700);
  };
  current.timer=setTimeout(()=>{if(valid())fallback();},15000);
  try{rec.start();}catch(_){fallback();}
 }
 function start(){
  // Rendering a story must never trigger a microphone permission prompt.
  // The child explicitly chooses "קריאה בקול" first.
  if(!isEnabled()){stop(true);return;}
  syncButton();
  if(!armed||running)return;
  running=true;quiet=false;restartTimes=[];emptyEnds=0;setPanel(true);say('קוראים בקצב שלך. הצביעה היא רק ליווי.');launch();
 }
 function requestStart(){
  if(!isEnabled()){stop(true);return;}
  if(running){stop(true);syncButton();return;}
  armed=true;running=true;quiet=false;restartTimes=[];emptyEnds=0;setPanel(true);say('מאשרים מיקרופון ומתחילים לקרוא 💛');launch();syncButton();
 }
 function retry(index){
  if(!isEnabled()||!track.gaps.has(index))return;retryTarget=index;say('אפשר לקרוא את המילה שוב, או פשוט להמשיך.');paint();
 }
 if(typeof document.addEventListener==='function'){
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)stop(false);});
 }
 if(typeof window.addEventListener==='function'){
  window.addEventListener('pagehide',()=>stop(true));
  window.addEventListener('offline',()=>{if(running)fallback();});
 }

 window.BookiLocalListening=Object.freeze({isEnabled,render,start,requestStart,stop,_followForTest:(input,story)=>{expected=story.map(key);const t=make();follow(t,input.map(key));return{cursor:t.cursor,heard:[...t.heard],gaps:[...t.gaps]};}});
 if(!isEnabled())setPanel(false);

 // Preserve the existing basic-consent bootstrap. The reading companion never bypasses it.
 if(!window.BookiBasicConsentReady){
  const load=src=>new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.async=false;script.onload=resolve;script.onerror=()=>reject(new Error('Booki consent component unavailable'));document.head.appendChild(script);});
  window.BookiBasicConsentReady=(async()=>{await load('basic-consent-copy.js?v=2');await load('basic-consent.js?v=2');await load('basic-consent-owner.js?v=2');await window.BookiBasicConsent.ready();window.BookiBasicConsent.install();})();
  const route=window.routeOnLoad;
  if(typeof route==='function')window.routeOnLoad=async function(...args){try{await window.BookiBasicConsentReady;}catch(_){return;}return route.apply(this,args);};
  window.BookiBasicConsentReady.catch(()=>{});
 }
})();