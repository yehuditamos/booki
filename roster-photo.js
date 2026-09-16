/** Photo-to-roster: local Hebrew OCR, explicit review, no database writes. */
(function(){
'use strict';
let library;
function load(){
 if(window.Tesseract)return Promise.resolve(window.Tesseract);
 if(!library)library=new Promise((resolve,reject)=>{
  const s=document.createElement('script');
  const timer=setTimeout(()=>{s.remove();reject(Error('load'));},30000);
  s.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
  s.onload=()=>{clearTimeout(timer);window.Tesseract?resolve(window.Tesseract):reject(Error('load'));};
  s.onerror=()=>{clearTimeout(timer);s.remove();reject(Error('load'));};
  document.head.append(s);
 }).catch(e=>{library=null;throw e;});
 return library;
}
function lines(text){
 return String(text||'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').split(/\r?\n/)
  .map(s=>s.replace(/^\s*[\d.()\-–—•|:]+\s*/,'').replace(/\s*[\d.()|:]+\s*$/,'').trim().replace(/\s+/g,' '))
  .filter(s=>/[א-תa-zA-Z]/.test(s)).join('\n');
}
function node(tag,text){const n=document.createElement(tag);if(text)n.textContent=text;return n;}
function attach(root,{names,count,onChange,parse}){
 const box=node('div');box.className='br-photo';
 const pick=node('button','📷 צילום או העלאת רשימת שמות');pick.type='button';
 const input=node('input');input.type='file';input.accept='image/*';input.hidden=true;
 const panel=node('section');panel.hidden=true;panel.setAttribute('aria-label','אישור שמות מהצילום');
 const heading=node('h3','בדיקת השמות מהצילום');
 const hint=node('p','בדקי ותקני את השמות לפני האישור. שם אחד בכל שורה.');
 pick.title='צילום ברור של רשימת שמות מודפסת';
 const preview=node('img');preview.alt='צילום רשימת השמות';preview.style.cssText='display:block;max-width:100%;max-height:240px;margin:auto;object-fit:contain';
 const review=node('textarea');review.rows=8;review.maxLength=3000;review.dir='rtl';review.setAttribute('aria-label','שמות מהצילום לעריכה');
 const status=node('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const approve=node('button','אישור השמות');approve.type='button';
 const cancel=node('button','ביטול');cancel.type='button';
 const actions=node('div');actions.style.cssText='display:flex;gap:8px;margin:8px 0';approve.style.cssText='flex:1;background:#26714f;color:white';cancel.style.padding='8px 16px';actions.append(approve,cancel);
 panel.append(heading,preview,hint,review,status,actions);box.append(pick,input,panel);root.append(box);
 let generation=0,worker=null,url=null,timer=null,observer=null;
 function release(){clearTimeout(timer);timer=null;if(worker){worker.terminate().catch(()=>{});worker=null;}if(url){URL.revokeObjectURL(url);url=null;}preview.removeAttribute('src');}
 function close(){generation++;release();panel.hidden=true;review.value='';input.value='';pick.disabled=false;observer?.disconnect();}
 function valid(token){return token===generation && root.isConnected;}
 cancel.onclick=()=>{close();pick.focus();};
 pick.onclick=()=>input.click();
 approve.onclick=()=>{
  try{
   const approved=parse(review.value);
   // Preserve names already typed and reuse the normal roster capacity validation.
   const before=names.value.trim()?parse(names.value):[];
   const merged=[...before];
   const key=s=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('he');
   const seen=new Set(before.map(key));
   approved.forEach(n=>{if(!seen.has(key(n))){merged.push(n);seen.add(key(n));}});
   parse(merged.join('\n'));
   if(!/^\d+$/.test(count.value.trim()) || Number(count.value)<1 || Number(count.value)>50)throw Error('מלאי קודם את מספר הילדים בכיתה');
   if(merged.length>Number(count.value))throw Error('מספר השמות גדול ממספר הילדים בכיתה. תקני את הרשימה או את מספר הילדים.');
   names.value=merged.join('\n');onChange(names.value);close();names.focus();
  }catch(e){status.textContent=e.message;}
 };
 input.onchange=async()=>{
  const file=input.files?.[0];if(!file)return;
  close();const token=++generation;panel.hidden=false;pick.disabled=true;approve.disabled=true;review.disabled=true;status.textContent='קוראת את השמות מהצילום…';
  observer=new MutationObserver(()=>{if(!root.isConnected || root.closest('.screen')?.classList.contains('active')===false)close();});
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  try{
   if(!file.type.startsWith('image/')||file.size>20*1024*1024)throw Error('בחרי תמונה עד 20 מגה־בייט');
   url=URL.createObjectURL(file);preview.src=url;
   // Decode and bound camera resolution before allocating the OCR worker.
   const image=new Image();image.src=url;
   await Promise.race([image.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('לא ניתן לפתוח את התמונה. נסי צילום מסך או תמונת JPG.')),20000);})]);
   clearTimeout(timer);if(!valid(token))return;
   const canvas=document.createElement('canvas'),scale=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight));
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
   const job=(async()=>{
    const lib=await load();if(!valid(token))throw Error('cancel');
    const created=await lib.createWorker('heb',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',logger:m=>{if(valid(token)&&m.status==='recognizing text')status.textContent='קוראת את השמות… '+Math.round(m.progress*100)+'%';}});
    if(!valid(token)){await created.terminate();throw Error('cancel');}worker=created;
    const result=await created.recognize(canvas);return result.data.text;
   })();
   const text=await Promise.race([job,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('הזיהוי נמשך זמן רב. נסי צילום ברור יותר.')),90000);})]);
   if(!valid(token))return;
   review.value=lines(text);review.disabled=false;approve.disabled=false;
   status.textContent=review.value?'השמות מוכנים לבדיקה ולתיקון.':'לא זוהו שמות. אפשר להקליד כאן או לנסות צילום ברור יותר.';
   review.focus();
  }catch(e){
   if(valid(token)){generation++;status.textContent=e.message==='load'?'הזיהוי לא נטען. בדקי את החיבור ונסי שוב.':e.message==='cancel'?'הזיהוי בוטל.':'לא הצלחנו לקרוא את התמונה. נסי תמונה ברורה של רשימה מודפסת, או הזיני שמות ידנית.';review.disabled=false;approve.disabled=false;}
  }finally{if(token===generation||token+1===generation){clearTimeout(timer);if(worker){worker.terminate().catch(()=>{});worker=null;}pick.disabled=false;} }
 };
 return {pending:()=>!panel.hidden};
}
window.BookiRosterPhoto={attach,lines};
})();
