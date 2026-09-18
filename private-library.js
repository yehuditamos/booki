/** Account-scoped teacher libraries. Private content is not explicitly persisted by this module
 * or added to the public catalog. Firestore rules enforce reader access. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const btn=(text,fn)=>{const n=el('button',text);n.type='button';n.onclick=fn;return n;};
 const auth=()=>typeof firebase!=='undefined'?firebase.auth().currentUser:null;
 const teacher=()=>{const a=auth();return a&&!a.isAnonymous?a:null;};
 const ref=uid=>window.db.collection('teacherLibraries').doc(uid).collection('stories');
 let state={clubId:null,userId:null,mode:'loading',items:[]},version=0,dialog=null,ocrPromise;
 const clean=s=>String(s||'').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'');
 function validate(title,text){
  title=clean(title).trim();text=clean(text).trim();
  if(!title||title.length>120||/[<>]/.test(title))throw Error('כתבי כותרת עד 120 תווים, ללא סימני < או >.');
  if(!text||text.length>20000)throw Error('הסיפור צריך להכיל טקסט, עד 20,000 תווים.');
  return {title,text};
 }
 function toStory(doc,uid){
  const data=doc.data(),v=validate(data.title,data.text),parts=[];
  for(const paragraph of v.text.split(/\n\s*\n/)){
   let part='';for(const word of paragraph.split(/\s+/)){if(part.length+word.length>600&&part){parts.push(part);part='';}part+=(part?' ':'')+word;}if(part)parts.push(part);
  }
  return {id:'private_'+uid+'_'+doc.id,title:v.title,emoji:'📖',category:'הספרייה של הכיתה',libraryId:'teacher-private',tags:[],
   pages:parts.map(text=>({text,readingMinutes:Math.max(.5,text.split(/\s+/).length/60)})),privateTeacherUid:uid};
 }
 async function published(uid){
  const snap=await ref(uid).where('status','==','published').get({source:'server'});
  return snap.docs.map(d=>toStory(d,uid));
 }
 async function prepare(clubId,userId){
  const a=auth(),request=++version;if(!a||!a.isAnonymous||!clubId){state={clubId,userId,authUid:a?.uid,mode:'public',items:[]};return true;}
  state={clubId,userId,authUid:a?.uid,mode:'loading',items:[]};
  try{
   const c=await window.db.collection('clubs').doc(clubId).get({source:'server'});
   if(request!==version||auth()?.uid!==a.uid)return false;
   if(!c.exists)throw Error('club');
   if(c.data().libraryMode!=='private'){state={clubId,userId,authUid:a?.uid,mode:'public',items:[]};return true;}
   const uid=c.data().teacherUid;if(!uid)throw Error('teacher');
   await window.db.collection('teacherLibraryAccess').doc(uid).collection('readers').doc(a.uid).set({clubId,memberId:userId});
   const items=await published(uid);
   if(request!==version||auth()?.uid!==a.uid)return false;
   state={clubId,userId,authUid:a?.uid,mode:'private',items};return true;
  }catch(e){if(request===version)state={clubId,userId,authUid:a?.uid,mode:'error',items:[]};return false;}
 }
 function visible(publicStories){
  if(teacher())return publicStories;
  const r=typeof getActiveReader==='function'?getActiveReader():null;
  if(!r?.clubId)return publicStories;
  if(state.clubId!==r.clubId||state.userId!==r.userId||state.authUid!==auth()?.uid)return [];
  return state.mode==='public'?publicStories:state.mode==='private'?state.items:[];
 }
 async function refresh(){
  const r=typeof getActiveReader==='function'?getActiveReader():null;
  return r?.clubId?prepare(r.clubId,r.userId):true;
 }
 function privateCategories(){
  const reader=typeof getActiveReader==='function'?getActiveReader():null;
  if(teacher()||!reader?.clubId||state.mode==='public')return false;
  const grid=$('library-category-grid');if(!grid)return false;grid.replaceChildren();
  if(state.mode==='error'||state.mode==='loading'||state.authUid!==auth()?.uid||state.clubId!==reader.clubId||state.userId!==reader.userId){
   grid.append(el('p','לא ניתן לטעון את ספריית הכיתה כרגע.'),btn('ניסיון נוסף',async()=>{await refresh();showLibraryCategories();}));
  }else if(!state.items.length)grid.append(el('p','המורה מכינה כאן סיפורים לכיתה. בקרוב נוכל לקרוא יחד!'));
  else {const b=btn('📚 הספרייה של הכיתה · '+state.items.length+' סיפורים',()=>{
   $('library-screen-title').textContent='הספרייה של הכיתה';$('library-category-view').style.display='none';$('library-story-view').style.display='';filterLibrary('all');
  });b.className='library-category-card';grid.append(b);}
  return true;
 }
 async function forTeacherClub(clubId){
  const a=teacher();if(!a)throw Error('teacher');const c=await window.db.collection('clubs').doc(clubId).get({source:'server'});
  if(!c.exists||c.data().teacherUid!==a.uid)throw Error('club');
  return c.data().libraryMode==='private'?published(a.uid):getAllStories();
 }
 function loadOCR(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(!ocrPromise)ocrPromise=new Promise((resolve,reject)=>{
   const s=el('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
   const timer=setTimeout(()=>reject(Error('טעינת זיהוי הטקסט ארכה מדי. נסי שוב.')),30000);
   s.onload=()=>{clearTimeout(timer);window.Tesseract?resolve(window.Tesseract):reject(Error('לא ניתן לטעון זיהוי טקסט.'));};s.onerror=()=>{clearTimeout(timer);reject(Error('לא ניתן לטעון זיהוי טקסט.'));};document.head.append(s);
  }).catch(e=>{ocrPromise=null;throw e;});return ocrPromise;
 }
 async function open(){
  const a=teacher();if(!a)return;
  dialog?.close();const d=el('dialog');dialog=d;d.dir='rtl';d.className='private-library-dialog';
  const title=el('h2','הספרייה הפרטית שלי');title.id='private-library-title';d.setAttribute('aria-labelledby',title.id);
  const close=btn('סגירה',()=>d.close()),body=el('div');d.append(close,title,body);document.body.append(d);d.showModal();
  let dirty=false,worker=null,uploadVersion=0;
  const valid=()=>d.isConnected&&auth()?.uid===a.uid;
  d.addEventListener('cancel',e=>{if(dirty&&!confirm('לסגור בלי לשמור את השינויים?'))e.preventDefault();});
  close.onclick=()=>{if(!dirty||confirm('לסגור בלי לשמור את השינויים?'))d.close();};
  d.addEventListener('close',()=>{uploadVersion++;worker?.terminate().catch(()=>{});d.remove();if(dialog===d)dialog=null;});
  const status=el('p');status.setAttribute('role','status');
  async function list(){
   dirty=false;body.replaceChildren(el('p','טוענת את הספרייה…'));
   try{
    // This read is denied until the new privacy rules are deployed. No unsafe fallback.
    await window.db.collection('libraryConfig').doc('availability').get({source:'server'});
    const [ss,cs]=await Promise.all([ref(a.uid).get({source:'server'}),window.db.collection('clubs').where('teacherUid','==',a.uid).get({source:'server'})]);
    if(!valid())return;body.replaceChildren(el('p','הסיפורים שייכים לחשבון שלך וזמינים רק לתלמידים במועדונים שלך שבחרת עבורם ספרייה פרטית.'),btn('📷 הוספת סיפור מצילום, קובץ או טקסט',()=>edit(null)));
    const publishedCount=ss.docs.filter(d=>d.data().status==='published').length;
    const clubs=el('section');clubs.append(el('h3','איזו ספרייה הילדים יראו?'));
    if(!cs.docs.length)clubs.append(el('p','אפשר להכין סיפורים עכשיו ולבחור ספרייה לאחר פתיחת מועדון.'));
    for(const c of cs.docs.filter(c=>!c.data().hidden)){
     const row=el('label',c.data().name||'מועדון');const select=el('select');select.setAttribute('aria-label','הספרייה של '+(c.data().name||'המועדון'));
     for(const [value,text] of [['public','ספריית בוקי הציבורית'],['private','הספרייה הפרטית שלי']]){const o=el('option',text);o.value=value;select.append(o);}select.value=c.data().libraryMode||'public';
     select.onchange=async()=>{const old=select.dataset.savedMode||c.data().libraryMode||'public',mode=select.value;
      if(mode==='private'&&!publishedCount){select.value=old;status.textContent='פרסמי קודם לפחות סיפור אחד בספרייה הפרטית.';return;}
      select.disabled=true;try{if(!valid())return;await c.ref.update({libraryMode:mode});select.dataset.savedMode=mode;status.textContent='הבחירה נשמרה. תופיע בפתיחה הבאה של הספרייה אצל הילדים.';}catch(e){select.value=old;status.textContent='הבחירה לא נשמרה. נסי שוב.';}finally{select.disabled=false;}
     };row.append(select);clubs.append(row);
    }body.append(clubs,el('h3','הסיפורים שלי'));
    if(!ss.docs.length)body.append(el('p','כאן תופיע הספרייה שלך. מתחילים מסיפור אחד.'));
    for(const s of ss.docs.sort((x,y)=>String(y.data().updatedAt).localeCompare(String(x.data().updatedAt)))){
     const row=el('article');row.append(el('strong',s.data().title),el('span',s.data().status==='published'?' · מוצג לתלמידים':' · טיוטה'),btn('עריכה וניקוד',()=>edit(s)));body.append(row);
    }status.textContent='';body.append(status);
   }catch(e){if(valid())body.replaceChildren(el('p','הספרייה הפרטית עדיין אינה זמינה. נדרשת הפעלת הרשאות הפרטיות במערכת.'),btn('ניסיון נוסף',list));}
  }
  function edit(doc){
   body.replaceChildren();const record=doc?.data()||{},storyRef=doc?.ref||ref(a.uid).doc();
   const heading=el('input');heading.value=record.title||'';heading.maxLength=120;heading.setAttribute('aria-label','שם הסיפור');heading.placeholder='שם הסיפור';
   const text=el('textarea');text.value=record.text||'';text.rows=12;text.maxLength=20000;text.setAttribute('aria-label','טקסט הסיפור לעריכה ולניקוד');text.placeholder='מדביקים או כותבים כאן את הסיפור. שורה ריקה מפרידה בין עמודים.';
   heading.oninput=text.oninput=()=>{dirty=true;preview.textContent=text.value;};
   const file=el('input');file.type='file';file.accept='image/*,.txt,text/plain';file.multiple=true;file.hidden=true;
   const upload=btn('📷 צילום או העלאת סיפור',()=>file.click());upload.className='private-library-upload';
   const info=el('p','תמונה או קובץ טקסט (TXT). אפשר גם להדביק טקסט מנוקד. לאחר הזיהוי בדקי ותקני את הטקסט.');
   const palette=el('div');palette.className='private-library-niqud';palette.append(el('p','ניקוד: מקמי את הסמן אחרי אות ולחצי על הסימן.'));
   let selected=text;
   for(const input of [heading,text])input.onfocus=()=>{selected=input;};
   for(const [label,mark] of [['קמץ','ָ'],['פתח','ַ'],['צירה','ֵ'],['סגול','ֶ'],['חיריק','ִ'],['חולם','ֹ'],['קובוץ','ֻ'],['שורוק / דגש','ּ'],['שווא','ְ'],['שׁ','ׁ'],['שׂ','ׂ'],['חטף פתח','ֲ'],['חטף סגול','ֱ'],['חטף קמץ','ֳ']]){
    const b=btn('א'+mark,()=>{const input=selected;input.setRangeText(mark,input.selectionStart,input.selectionEnd,'end');input.focus();input.dispatchEvent(new Event('input'));});b.title=label;b.setAttribute('aria-label',label);b.onmousedown=e=>e.preventDefault();palette.append(b);
   }
   palette.append(btn('הסרת ניקוד מהבחירה',()=>{const i=selected,start=i.selectionStart,end=i.selectionEnd;if(start===end){status.textContent='סמני תחילה את המילה שתרצי להסיר ממנה ניקוד.';return;}i.setRangeText(i.value.slice(start,end).replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g,''),start,end,'end');i.dispatchEvent(new Event('input'));}));
   const preview=el('pre',text.value);preview.className='private-library-preview';
   const actions=el('div'),draft=btn('שמירת טיוטה',()=>save('draft')),publish=btn('שמירה ופרסום לתלמידים שלי',()=>save('published')),back=btn('חזרה לספרייה',()=>{if(!dirty||confirm('לחזור בלי לשמור?'))list();});
   async function save(statusValue){
    draft.disabled=publish.disabled=true;status.textContent='שומרת…';
    try{const v=validate(heading.value,text.value);if(!valid())return;await storyRef.set({teacherUid:a.uid,...v,status:statusValue,createdAt:record.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});dirty=false;if(valid())await list();}
    catch(e){status.textContent=e.message?.startsWith('כתבי')||e.message?.startsWith('הסיפור')?e.message:'לא הצלחתי לשמור. הטקסט נשאר כאן; נסי שוב.';}
    finally{draft.disabled=publish.disabled=false;}
   }
   file.onchange=async()=>{
    const token=++uploadVersion;const files=[...file.files];if(!files.length)return;
    if(files.some(f=>f.size>15*1024*1024)){status.textContent='בחרי קבצים שגודלם עד 15MB כל אחד.';return;}
    upload.disabled=draft.disabled=publish.disabled=true;status.textContent='מזהה את הטקסט…';
    try{let output='';for(const f of files){
      if(f.type==='text/plain'||/\.txt$/i.test(f.name))output+=(output?'\n\n':'')+await f.text();
      else if(f.type.startsWith('image/')){
       const T=await loadOCR();if(!valid()||token!==uploadVersion)return;
       worker=await T.createWorker('heb+eng',1,{logger:()=>{}});
       try{const result=await worker.recognize(f);output+=(output?'\n\n':'')+result.data.text;}finally{await worker.terminate();worker=null;}
      }else throw Error('בחרי תמונה או קובץ TXT.');
     }
     if(!valid()||token!==uploadVersion)return;
     const combined=(text.value.trim()?text.value.trim()+'\n\n':'')+clean(output).trim();
     if(!output.trim())throw Error('לא זוהה טקסט. נסי צילום חד יותר או הדביקי טקסט.');
     if(combined.length>20000)throw Error('הטקסט ארוך מדי. העלי סיפור קצר יותר.');
     text.value=combined;text.dispatchEvent(new Event('input'));status.textContent='הטקסט מוכן לבדיקה ולניקוד. הוא עדיין לא פורסם.';
    }catch(e){if(valid())status.textContent=e.message||'לא הצלחתי לזהות טקסט. נסי שוב או הדביקי אותו.';}
    finally{upload.disabled=draft.disabled=publish.disabled=false;file.value='';}
   };
   actions.append(draft,publish,back);status.textContent='';body.append(upload,file,info,el('label','שם הסיפור'),heading,el('label','תוכן הסיפור'),text,palette,el('h3','תצוגה מקדימה'),preview,actions,status);heading.focus();
  }
  await list();
 }
 window.BookiPrivateLibrary={open,prepare,visible,refresh,privateCategories,forTeacherClub,validate,toStory};
})();
