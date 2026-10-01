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
 let state={clubId:null,userId:null,mode:'loading',items:[]},version=0,dialog=null;
 const MODE_COPY={
  public:{title:'ספריית בוקי',note:'הילדים רואים את ספריית בוקי הרגילה.'},
  private:{title:'הספרייה הפרטית שלי',note:'הילדים רואים רק את הסיפורים שפרסמת.'},
  both:{title:'בוקי + הספרייה הפרטית',note:'הילדים רואים את ספריית בוקי וגם את הסיפורים שלך.'},
  kosher:{title:'ספרייה כשרה',note:'הילדים רואים רק סיפורי צדיקים שנבחרו לספרייה הכשרה.'},
  'kosher-public':{title:'ספריית בוקי + כשרה',note:'הילדים רואים את ספריית בוקי ואת הספרייה הכשרה.'},
  all:{title:'בוקי + כשרה + פרטית',note:'הילדים רואים את שלוש הספריות.'},
  'kosher-private':{title:'ספרייה כשרה + פרטית',note:'הילדים רואים את סיפורי הצדיקים וגם את הסיפורים שפרסמת.'}
 };
 const kosherStories=stories=>stories.filter(story=>story?.libraryId==='kosher'||story?.tags?.includes?.('כשר'));
 const publicCatalog=()=>typeof STORIES!=='undefined'&&Array.isArray(STORIES)?[...STORIES]:[];
 function visiblePublicByMode(publicStories,mode){
   if(mode==='kosher')return kosherStories(publicStories);
   return publicStories;
 }
 function ensureTeacherLibraryStyles(){
  if(document.getElementById('booki-private-library-status-styles'))return;
  const style=el('style');style.id='booki-private-library-status-styles';style.textContent=`
   .private-library-dialog .pl-intro{margin:0 0 12px;line-height:1.55;color:#365445}
   .private-library-dialog .pl-add{width:100%;margin:4px 0 18px;padding:12px 16px;border-radius:14px}
   .private-library-dialog .pl-section{margin:18px 0 22px}
   .private-library-dialog .pl-section>h3{margin:0 0 10px}
   .private-library-dialog .pl-mode-card{border:2px solid #c6d9cc;background:#f7fbf8;border-radius:18px;padding:15px;margin:10px 0}
   .private-library-dialog .pl-mode-club{font-size:.92rem;font-weight:700;color:#587064;margin:0 0 5px}
   .private-library-dialog .pl-mode-label{font-size:.92rem;margin:0;color:#587064}
   .private-library-dialog .pl-mode-title{display:block;font-size:1.13rem;color:#174f35;margin:4px 0 5px}
   .private-library-dialog .pl-mode-note{margin:0 0 10px;line-height:1.45}
   .private-library-dialog .pl-mode-card[data-mode="public"]{border-color:#e0b96d;background:#fffaf0}
   .private-library-dialog .pl-mode-card[data-mode="both"]{border-color:#83b99c;background:#f1faf5}
   .private-library-dialog .pl-change{background:#eef5f0;border:1px solid #9ebcab;color:#214e39;border-radius:12px;padding:9px 13px}
   .private-library-dialog .pl-mode-picker{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
   .private-library-dialog .pl-mode-picker button{flex:1;min-width:120px;border:1px solid #a9c3b4;background:#fff;color:#214e39;border-radius:12px;padding:9px}
   .private-library-dialog .pl-mode-picker button[aria-pressed="true"]{background:#245f43;color:#fff;border-color:#245f43}
   .private-library-dialog .pl-alert{border:2px solid #e0b96d;background:#fff8e8;border-radius:16px;padding:13px 15px;margin:12px 0;line-height:1.5}
   .private-library-dialog .pl-story{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-top:1px solid #d9e5dd;padding:12px 0}
   .private-library-dialog .pl-story strong{flex:1;min-width:150px}
   .private-library-dialog .pl-story-state{font-size:.9rem;color:#5f7469}
   .private-library-dialog .pl-page-tip{margin:8px 0 12px;padding:12px 14px;border:2px solid #b7cfbf;background:#f2f9f4;border-radius:14px;line-height:1.5;color:#214e39}
   .private-library-dialog .pl-page-tip strong{display:block;margin-bottom:3px}
  `;document.head.append(style);
 }
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
   const mode=c.data().libraryMode||'public';
   // Public/kosher-only modes need no access grant and no private Firestore read.
   // Keep this path deliberately tiny so a kosher catalog cannot fail because of
   // private-library permissions or availability.
   if(['public','kosher','kosher-public'].includes(mode)){state={clubId,userId,authUid:a?.uid,mode,items:[]};return true;}
   if(!['private','both','kosher-private','all'].includes(mode)){state={clubId,userId,authUid:a?.uid,mode:'public',items:[]};return true;}
   const uid=c.data().teacherUid;if(!uid)throw Error('teacher');
   // Private content is optional inside combined modes. Never block the child's
   // whole library because a teacher has no published stories yet or an access
   // grant/rules deployment is temporarily unavailable.
   try{
     // The active reader id is the stable membership/card id. The routing flow
     // already reclaims teacher-created cards to the current anonymous auth UID
     // before entering the child home, so there is no need for a second identity
     // discovery query here.
     let stableMemberId=String(userId||'');
     if(!stableMemberId)throw Error('membership');
     // Verify the active reader id really is the membership document used by
     // security rules. If routing supplied an auth/profile alias, resolve the
     // claimed card once and write the grant with that stable document id.
     let member=await window.db.collection('clubs').doc(clubId).collection('memberships').doc(stableMemberId).get({source:'server'});
     if(!member.exists){
       const claimed=await window.db.collection('clubs').doc(clubId).collection('memberships').where('claimedByUid','==',a.uid).get({source:'server'});
       const active=claimed.docs.find(d=>(d.data()?.status||'active')!=='left');
       if(active){stableMemberId=active.id;member=active;}
     }
     if(!member?.exists&&member?.id==null)throw Error('membership');
     await window.db.collection('teacherLibraryAccess').doc(uid).collection('readers').doc(a.uid).set({clubId,memberId:stableMemberId});
     const items=await published(uid);
     if(request!==version||auth()?.uid!==a.uid)return false;
     state={clubId,userId,authUid:a.uid,mode,items};return true;
   }catch(privateError){
     console.warn('[booki] private catalog unavailable; keeping selected public catalog',privateError?.code||privateError?.message);
     if(request!==version||auth()?.uid!==a.uid)return false;
     // Do not lie about the saved selection by mutating mode to public. Keep the
     // selected mode visible to the child UI; an empty teacher folder is simply
     // omitted until its stories can be read.
     if(['both','kosher-private','all'].includes(mode)){state={clubId,userId,authUid:a?.uid,mode,items:[],privateError:true};return true;}
     if(mode==='private'){state={clubId,userId,authUid:a?.uid,mode:'private',items:[],privateError:true};return true;}
     throw privateError;
   }
  }catch(e){if(request===version)state={clubId,userId,authUid:a?.uid,mode:'error',items:[]};return false;}
 }
 function visible(publicStories){
  if(teacher())return publicStories;
  const r=typeof getActiveReader==='function'?getActiveReader():null;
  if(!r?.clubId)return publicStories;
  if(state.clubId!==r.clubId||state.authUid!==auth()?.uid)return [];
  return state.mode==='public'?publicStories:state.mode==='kosher'?kosherStories(publicStories):state.mode==='kosher-public'?publicStories:state.mode==='private'?state.items:state.mode==='both'?[...publicStories,...state.items]:state.mode==='kosher-private'?[...kosherStories(publicStories),...state.items]:state.mode==='all'?[...publicStories,...state.items]:publicStories;
 }
 async function refresh(){
  const r=typeof getActiveReader==='function'?getActiveReader():null;
  return r?.clubId?prepare(r.clubId,r.userId):true;
 }
 function childState(){
  const r=typeof getActiveReader==='function'?getActiveReader():null;
  // club + auth are the security context. activeReader.userId may legitimately
  // differ from the stable teacher-created card id after reclaim, so it must not
  // suppress a library that was already server-scoped to this authenticated child.
  const valid=!!r?.clubId&&state.clubId===r.clubId&&state.authUid===auth()?.uid;
  return {valid,mode:state.mode,teacherStories:valid?[...state.items]:[],teacherEnabled:valid&&['private','both','kosher-private','all'].includes(state.mode)};
 }
 function privateCategories(){
  const reader=typeof getActiveReader==='function'?getActiveReader():null;
  if(teacher()||!reader?.clubId||state.mode==='public'||(state.mode==='both'&&state.authUid===auth()?.uid&&state.clubId===reader.clubId&&state.userId===reader.userId))return false;
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
  const mode=c.data().libraryMode;
  const all=Array.isArray(STORIES)?[...STORIES]:getAllStories();
  if(mode==='private')return published(a.uid);
  if(mode==='both')return [...all,...await published(a.uid)];
  if(mode==='kosher')return kosherStories(all);
  if(mode==='kosher-private')return [...kosherStories(all),...await published(a.uid)];
  if(mode==='kosher-public')return all;
  if(mode==='all')return [...all,...await published(a.uid)];
  return all;
 }
 function appendPrivateCategory(){
  if(!['both','kosher-private','all'].includes(state.mode)||teacher()||!state.items.length)return;
  const b=btn('📚 סיפורי המורה · '+state.items.length+' סיפורים',()=>{
   $('library-screen-title').textContent='סיפורי המורה';$('library-category-view').style.display='none';$('library-story-view').style.display='';filterLibrary('teacher-private');
  });b.className='library-category-card';$('library-category-grid')?.append(b);
 }
 async function open(){
  const a=teacher();if(!a)return;
  dialog?.close();const d=el('dialog');dialog=d;d.dir='rtl';d.className='private-library-dialog';
  const title=el('h2','הספרייה הפרטית שלי');title.id='private-library-title';d.setAttribute('aria-labelledby',title.id);
  const close=btn('סגירה',()=>d.close()),body=el('div');d.append(close,title,body);document.body.append(d);d.showModal();
  ensureTeacherLibraryStyles();
  let dirty=false,uploadVersion=0,savedNotice='';
  const valid=()=>d.isConnected&&auth()?.uid===a.uid;
  d.addEventListener('cancel',e=>{if(dirty&&!confirm('לסגור בלי לשמור את השינויים?'))e.preventDefault();});
  close.onclick=()=>{if(!dirty||confirm('לסגור בלי לשמור את השינויים?'))d.close();};
  d.addEventListener('close',()=>{uploadVersion++;d.remove();if(dialog===d)dialog=null;});
  const status=el('p');status.setAttribute('role','status');
  async function list(){
   dirty=false;body.replaceChildren(el('p','טוענת את הספרייה…'));
   try{
    // This read is denied until the new privacy rules are deployed. No unsafe fallback.
    await window.db.collection('libraryConfig').doc('availability').get({source:'server'});
    const [ss,cs]=await Promise.all([ref(a.uid).get({source:'server'}),window.db.collection('clubs').where('teacherUid','==',a.uid).get({source:'server'})]);
    if(!valid())return;
    const intro=el('p','כאן מוסיפים ועורכים את הסיפורים שלך. ההצגה לילדים נקבעת במסך בחירת הספריות.');intro.className='pl-intro';
    const add=btn('📝 הוספת סיפור',()=>edit(null));add.className='pl-add';
    body.replaceChildren(intro,add);
    const publishedCount=ss.docs.filter(d=>d.data().status==='published').length;
    if(savedNotice){const notice=el('div',savedNotice);notice.className='pl-alert';body.append(notice);savedNotice='';}
    const stories=el('section');stories.className='pl-section';stories.append(el('h3','📖 הסיפורים שלי'+(ss.docs.length?' ('+ss.docs.length+')':'')));
    if(!ss.docs.length)stories.append(el('p','כאן יופיעו הסיפורים שתעלי בעצמך.'));
    for(const s of ss.docs.sort((x,y)=>String(y.data().updatedAt).localeCompare(String(x.data().updatedAt)))){
     const row=el('article');row.className='pl-story';
     const storyState=el('span',s.data().status==='published'?'פורסם בספרייה שלי':'טיוטה — הילדים לא רואים');storyState.className='pl-story-state';
     row.append(el('strong',s.data().title),storyState,btn('עריכת סיפור',()=>edit(s)));stories.append(row);
    }
    body.append(stories);status.textContent='';body.append(status);
   }catch(e){if(valid())body.replaceChildren(el('p','הספרייה הפרטית עדיין אינה זמינה. נדרשת הפעלת הרשאות הפרטיות במערכת.'),btn('ניסיון נוסף',list));}
  }
  function edit(doc){
   body.replaceChildren();const record=doc?.data()||{},storyRef=doc?.ref||ref(a.uid).doc();
   const heading=el('input');heading.value=record.title||'';heading.maxLength=120;heading.setAttribute('aria-label','שם הסיפור');heading.placeholder='שם הסיפור';
   const text=el('textarea');text.value=record.text||'';text.rows=12;text.maxLength=20000;text.setAttribute('aria-label','טקסט הסיפור');text.placeholder='מדביקים או כותבים כאן את הסיפור.';
   const pageTip=el('div');pageTip.className='pl-page-tip';pageTip.append(el('strong','📄 איך יוצרים עמוד חדש?'),el('span',' משאירים שורה אחת ריקה בין קטע לקטע — וכל קטע יהפוך לעמוד חדש.'));
   heading.oninput=text.oninput=()=>{dirty=true;preview.textContent=text.value;};
   const file=el('input');file.type='file';file.accept='.txt,text/plain';file.multiple=true;file.hidden=true;
   const upload=btn('📄 העלאת קובץ טקסט (TXT)',()=>file.click());upload.className='private-library-upload';
   const info=el('div');info.className='private-library-text-tip';
   const badge=el('strong','מומלץ');badge.className='private-library-recommended';
   const paste=btn('כתיבה או הדבקת טקסט',()=>{text.focus();text.scrollIntoView?.({block:'center',behavior:'smooth'});});
   info.append(badge,paste,el('p','העתיקי מהמסמך והדביקי כאן, או כתבי ישירות. בוקי יטפל בתצוגת הניקוד בזמן הקריאה. אפשר גם להעלות קובץ טקסט (TXT).'));
   const preview=el('pre',text.value);preview.className='private-library-preview';
   const actions=el('div'),draft=btn('שמירת טיוטה',()=>save('draft')),publish=btn('שמירה ופרסום לתלמידים שלי',()=>save('published')),back=btn('חזרה לספרייה',()=>{if(!dirty||confirm('לחזור בלי לשמור?'))list();});
   async function save(statusValue){
    draft.disabled=publish.disabled=true;status.textContent='שומרת…';
    try{const v=validate(heading.value,text.value);if(!valid())return;await storyRef.set({teacherUid:a.uid,...v,status:statusValue,createdAt:record.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});dirty=false;
     if(statusValue==='published'){
      try{const clubs=await window.db.collection('clubs').where('teacherUid','==',a.uid).get({source:'server'});const active=clubs.docs.filter(c=>!c.data().hidden),shown=active.some(c=>['private','both','kosher-private','all'].includes(c.data().libraryMode||'public'));
       savedNotice=shown?'הסיפור פורסם 💛 הוא יוצג במועדונים שבהם סימנת “הסיפורים מהמורה”.':'הסיפור פורסם 💛 כדי להציג אותו לילדים, סמני “הסיפורים מהמורה” במסך בחירת הספריות.';
      }catch(_){savedNotice='הסיפור פורסם 💛 בדקי למטה מה הילדים רואים עכשיו.';}
     }
     if(valid())await list();}
    catch(e){status.textContent=e.message?.startsWith('כתבי')||e.message?.startsWith('הסיפור')?e.message:'לא הצלחתי לשמור. הטקסט נשאר כאן; נסי שוב.';}
    finally{draft.disabled=publish.disabled=false;}
   }
   file.onchange=async()=>{
    const token=++uploadVersion;const files=[...file.files];if(!files.length)return;
    if(files.some(f=>f.size>15*1024*1024)){status.textContent='בחרי קבצים שגודלם עד 15MB כל אחד.';return;}
    upload.disabled=draft.disabled=publish.disabled=back.disabled=true;status.textContent='טוענת את הטקסט…';
    try{let output='';for(const f of files){
      if(!/\.txt$/i.test(f.name))throw Error('אפשר להעלות קובץ TXT בלבד. ממסמך Word אפשר להעתיק ולהדביק את הטקסט.');
      output+=(output?'\n\n':'')+await f.text();
     }
     if(!valid()||token!==uploadVersion)return;
     const combined=(text.value.trim()?text.value.trim()+'\n\n':'')+clean(output).trim();
     if(!output.trim())throw Error('הקובץ ריק. בחרי קובץ טקסט אחר או הדביקי טקסט.');
     if(combined.length>20000)throw Error('הטקסט ארוך מדי. העלי סיפור קצר יותר.');
     text.value=combined;text.dispatchEvent(new Event('input'));status.textContent='הטקסט מוכן לבדיקה. הוא עדיין לא פורסם.';
    }catch(e){if(valid())status.textContent=e.message||'לא הצלחתי לקרוא את הקובץ. נסי שוב או הדביקי את הטקסט.';}
    finally{upload.disabled=draft.disabled=publish.disabled=back.disabled=false;file.value='';}
   };
   actions.append(draft,publish,back);status.textContent='';body.append(upload,file,info,el('label','שם הסיפור'),heading,el('label','תוכן הסיפור'),pageTip,text,el('h3','תצוגה מקדימה'),preview,actions,status);heading.focus();
  }
  await list();
 }
 async function openKosherPreview(){const all=Array.isArray(STORIES)?STORIES:[];const items=kosherStories(all);if(!items.length){alert('הספרייה הכשרה עדיין נטענת. נסי שוב.');return;}if(typeof showScreen==='function'){showScreen('screen-library');setTimeout(()=>{const root=document.getElementById('booki-child-library');if(root&&window.BookiChildLibrary)window.BookiChildLibrary.openKosher?.();else if(typeof filterLibrary==='function')filterLibrary('all');},0);}}
 window.BookiPrivateLibrary={open,openKosherPreview,prepare,visible,refresh,childState,privateCategories,appendPrivateCategory,forTeacherClub,validate,toStory};
})();
