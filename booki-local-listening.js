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
 const TARGET_CLUB='משפחת-עמוס-1783658629348';
 const aliases=new Map([['בבקר','בבוקר'],['נעם','נועם'],['לגנה','לגינה'],['כחל','כחול'],['הכחל','הכחול'],['לאמא','לאימא']]);
 const $=id=>document.getElementById(id);
 const norm=v=>String(v||'').normalize('NFKD').replace(/[\u0591-\u05C7]/g,'').replace(/[^א-ת]/g,'');
 const key=v=>{const n=norm(v);return aliases.get(n)||n;};
 const spoken=v=>String(v||'').replace(/[־–—]/g,' ').split(/\s+/).map(key).filter(Boolean);
 const make=()=>({cursor:0,heard:new Set(),gaps:new Set(),queue:[]});
 const clone=t=>({cursor:t.cursor,heard:new Set(t.heard),gaps:new Set(t.gaps),queue:[...t.queue]});

 let words=[],expected=[],nodes=[],track=make(),preview=new Set(),retryTarget=null;
 let running=false,quiet=false,session=null,epoch=0,restartTimer=null,previewTimer=null,restartTimes=[],emptyEnds=0;

 function reader(){
  try { return typeof getActiveReader==='function'?getActiveReader():null; } catch (_) { return null; }
 }
 function isEnabled(){
  const r=reader(),name=String(window.currentStudentData?.name||r?.name||'').trim();
  return name===TARGET_NAME && String(r?.clubId||window.currentClubId||'')===TARGET_CLUB;
 }
 function panel(){return $('booki-local-listening');}
 function status(){return $('booki-listening-status');}
 function say(v){if(status())status().textContent=v;}
 function setPanel(on){
  const p=panel();if(!p)return;p.hidden=!on;p.style.display=on?'':'none';
  p.classList.toggle('booki-listening-quiet',quiet);
  const meter=$('booki-listening-meter');if(meter)meter.hidden=true;
 }
 function follow(t,incoming){
  t.queue.push(...incoming);if(t.queue.length>64)t.queue.splice(0,t.queue.length-64);
  const accept=i=>{t.heard.add(i);t.gaps.delete(i);};
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
   const gap=track.gaps.has(i),retry=retryTarget===i;
   n.className='reader-word'+(track.heard.has(i)?' is-heard':'')+(preview.has(i)?' is-preview':'')+(gap?' is-gap':'')+(retry?' is-retry':'');
   if(gap){n.dataset.readingRetry='1';n.tabIndex=0;n.setAttribute('role','button');n.setAttribute('aria-label',words[i]+' — אפשר לקרוא שוב, לא חובה');}
   else{delete n.dataset.readingRetry;n.removeAttribute('tabindex');n.removeAttribute('role');n.removeAttribute('aria-label');}
  });
 }
 function render(value){
  const target=$('reader-text');if(!target)return;
  const raw=String(value||''),parts=raw.match(/\S+|\s+/g)||[];
  words=parts.filter(x=>!/^\s+$/.test(x));expected=words.map(key);track=make();preview.clear();retryTarget=null;
  target.textContent='';nodes=[];let i=0;
  parts.forEach(part=>{
   if(/^\s+$/.test(part)){target.append(document.createTextNode(part));return;}
   const n=document.createElement('span');n.className='reader-word';n.dataset.wordIndex=String(i++);n.textContent=part;nodes.push(n);target.append(n);
  });
  paint();
 }
 function clearPreview(){clearTimeout(previewTimer);previewTimer=null;preview.clear();}
 function closeRecognition(){
  epoch++;clearTimeout(restartTimer);restartTimer=null;clearPreview();
  const old=session;session=null;if(old){clearTimeout(old.timer);old.rec.onresult=old.rec.onerror=old.rec.onend=null;old.rec.onstart=()=>{try{old.rec.abort();}catch(_){}};try{old.rec.abort();}catch(_){}}
  track.queue=[];
 }
 function stop(hide=true){running=false;closeRecognition();retryTarget=null;if(hide)setPanel(false);paint();}
 function fallback(){quiet=true;closeRecognition();retryTarget=null;say('קוראים בנחת — גם בלי צבעים 💛');setPanel(true);paint();}
 function showPreview(input){
  clearPreview();const candidate=follow(clone(track),input);preview=new Set([...candidate.heard].filter(i=>!track.heard.has(i)));paint();
  const id=epoch;previewTimer=setTimeout(()=>{if(id===epoch){preview.clear();paint();}},1800);
 }
 function applyFinal(input){
  const before=track.cursor;
  if(retryTarget!==null){const at=input.indexOf(expected[retryTarget]);if(at>=0){track.heard.add(retryTarget);track.gaps.delete(retryTarget);input=[...input];input.splice(at,1);retryTarget=null;}}
  follow(track,input);if(track.cursor>before)retryTarget=null;paint();
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
  if(!isEnabled()){stop(true);return;}
  if(running)return;running=true;quiet=false;restartTimes=[];emptyEnds=0;setPanel(true);say('קוראים בקצב שלך. הצביעה היא רק ליווי.');launch();
 }
 function retry(index){
  if(!isEnabled()||!track.gaps.has(index))return;retryTarget=index;say('אפשר לקרוא את המילה שוב, או פשוט להמשיך.');paint();
 }
 document.addEventListener('click',e=>{const n=e.target.closest?.('.reader-word[data-reading-retry="1"]');if(n)retry(Number(n.dataset.wordIndex));});
 document.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const n=e.target.closest?.('.reader-word[data-reading-retry="1"]');if(n){e.preventDefault();retry(Number(n.dataset.wordIndex));}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)stop(false);});
 window.addEventListener('pagehide',()=>stop(true));
 window.addEventListener('offline',()=>{if(running)fallback();});

 window.BookiLocalListening=Object.freeze({isEnabled,render,start,stop,_followForTest:(input,story)=>{expected=story.map(key);const t=make();follow(t,input.map(key));return{cursor:t.cursor,heard:[...t.heard],gaps:[...t.gaps]};}});
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