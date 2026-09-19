/** Personal teacher recommendations; uses existing teacher-only message writes.
 * Viewing the home page does not consume a recommendation. Only opening its story does.
 */
(function () {
  'use strict';
  const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=fn;return b;};
  const stories=()=>typeof getAllStories==='function'?getAllStories().filter(s=>s.id!=null&&Array.isArray(s.pages)&&s.pages.length):[];
  const plain=s=>String(s||'').normalize('NFC').replace(/[\u0591-\u05C7]/g,'');
  const active=(clubId,userId)=>{const r=typeof getActiveReader==='function'?getActiveReader():null;return r?.clubId===clubId&&r?.userId===userId;};
  let dialog=null;

  window.openStoryRecommendation=function(clubId,userId,name){
    const auth=typeof firebase!=='undefined'?firebase.auth().currentUser:null;
    const teacher=typeof getCurrentTeacher==='function'?getCurrentTeacher():null;
    if(!auth||auth.isAnonymous||teacher?.uid!==auth.uid||!clubId||!userId)return;
    dialog?.close();dialog?.remove();
    const d=node('dialog');dialog=d;d.className='booki-recommend-dialog';d.dir='rtl';
    const title=node('h2',name);title.id='booki-recommend-title';d.setAttribute('aria-labelledby',title.id);
    const close=button('סגירה',()=>d.close()),body=node('div');d.append(close,title,body);document.body.append(d);
    d.addEventListener('close',()=>{d.remove();if(dialog===d)dialog=null;});
    let catalog=null;const choices=()=>catalog||stories();
    const sameTeacher=()=>firebase.auth().currentUser?.uid===auth.uid&&getCurrentTeacher()?.uid===auth.uid;
    const choose=async()=>{
      body.replaceChildren(node('p','טוענת את ספריית הכיתה…'));
      try{catalog=window.BookiPrivateLibrary?await window.BookiPrivateLibrary.forTeacherClub(clubId):stories();}
      catch(e){body.replaceChildren(node('p','לא ניתן לטעון את ספריית הכיתה.'),button('ניסיון נוסף',choose));return;}
      if(!d.isConnected||!sameTeacher())return;
      body.replaceChildren();title.textContent='בחירת סיפור עבור '+name;
      const search=node('input');search.type='search';search.placeholder='חיפוש סיפור';search.setAttribute('aria-label','חיפוש במאגר הסיפורים');
      const list=node('div');list.className='booki-recommend-stories';body.append(search,list);
      const render=()=>{
        list.replaceChildren();const found=choices().filter(s=>plain(s.title+' '+(s.category||'')).includes(plain(search.value.trim())));
        for(const s of found)list.append(button((s.emoji||'📖')+' '+s.title,()=>confirmStory(s)));
        if(!found.length)list.append(node('p',choices().length?'לא נמצאו סיפורים. נסי חיפוש אחר.':'מאגר הסיפורים לא נטען. סגרי ורענני את בוקי.'));
      };search.oninput=render;render();search.focus();
    };
    const confirmStory=story=>{
      title.textContent='שליחת המלצה';body.replaceChildren(node('p','לשלוח את הסיפור ״'+story.title+'״ ל'+name+'?'));
      const status=node('p');status.setAttribute('role','status');
      const ref=window.db.collection('clubs').doc(clubId).collection('messages').doc();
      const back=button('בחירת סיפור אחר',choose);
      const send=button('כן, שלחי ל'+name,async()=>{
        if(send.disabled)return;send.disabled=true;back.disabled=true;close.disabled=true;status.textContent='שולחת…';
        try{
          if(!sameTeacher())throw Error('auth');
          const [club,member]=await Promise.all([
            window.db.collection('clubs').doc(clubId).get({source:'server'}),
            window.db.collection('clubs').doc(clubId).collection('memberships').doc(userId).get({source:'server'})
          ]);
          const m=member.exists?member.data():null;
          if(!sameTeacher()||!club.exists||club.data().teacherUid!==auth.uid||!m||m.status==='left'||
            (String(m.name||'').startsWith('כרטיס פנוי ')&&!m.claimedByUid)||!choices().some(s=>String(s.id)===String(story.id)))throw Error('invalid-target');
          await ref.set({type:'story-recommendation',toUserId:userId,storyId:story.id,storyTitle:story.title,
            text:'קיבלת המלצה לסיפור, זה הזמן לקרוא ✨',createdBy:auth.uid,createdAt:new Date().toISOString()});
          body.replaceChildren(node('p','ההמלצה נשלחה ל'+name+' 💚'),button('סיום',()=>d.close()));
        }catch(e){status.textContent='ההמלצה לא נשלחה. בדקי חיבור ושהילד עדיין במועדון, ונסי שוב.';send.disabled=false;back.disabled=false;}
        finally{close.disabled=false;}
      });body.append(send,back,status);send.focus();
    };
    body.append(button('המליצי על סיפור ושייכי אותו לקריאה לילד',choose));d.showModal();
  };

  window.renderStoryRecommendations=function(clubId,userId,messages,seen){
    const host=document.getElementById('booki-story-recommendations');if(!host||!active(clubId,userId))return;
    host.replaceChildren();
    for(const m of messages.filter(m=>m.type==='story-recommendation'&&m.toUserId===userId&&!seen.has(m.id))){
      const story=stories().find(s=>String(s.id)===String(m.storyId));
      if(!story)continue;
      const b=button('קיבלת המלצה לסיפור, זה הזמן לקרוא ✨\n'+story.title,async()=>{
        if(b.disabled||!active(clubId,userId))return;
        if(typeof startStory!=='function')return;
        b.disabled=true;
        try{
          const opened=await startStory(story.id);
          if(opened===false){b.disabled=false;return;}
          // Never mark other recommendations or encouragements as seen.
          const saved=await fbMarkMessagesSeen(clubId,userId,[m.id]);
          if(saved)b.remove();else b.disabled=false;
        }catch(e){b.disabled=false;}
      });b.className='booki-recommend-home booki-envelope-notice booki-envelope-book';b.textContent='💌';b.setAttribute('aria-label','יש לך סיפור חדש מהמורה: '+story.title+'. לחצו לפתיחה');b.title='סיפור מהמורה';host.append(b);
    }
  };
})();

