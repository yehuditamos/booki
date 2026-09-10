/** Live club reading minutes on teacher dashboard. No writes. */
(function(){
  'use strict';
  if(window.BookiTeacherMinutes20260910) return;
  const unsubs=new Map(); let observer=null,run=0;
  const teacher=()=>typeof getCurrentTeacher==='function'?getCurrentTeacher():null;
  const stop=()=>{for(const fn of unsubs.values()){try{fn()}catch(_){}} unsubs.clear();};
  const membersRef=id=>window.db?.collection('clubs').doc(id).collection('memberships');
  const activeDocs=docs=>(docs||[]).map(d=>typeof d.data==='function'?d.data():d).filter(m=>m?.status!=='left');
  const render=(meta,docs)=>{
    const members=activeDocs(docs);
    const minutes=Math.round(members.reduce((sum,m)=>sum+Number(m?.cachedStats?.totalMinutes||0),0));
    meta.classList.add('tc-live-reading'); meta.setAttribute('aria-live','polite');
    meta.dataset.minutes=String(minutes);
    meta.textContent=`📚 ${minutes.toLocaleString('he-IL')} דקות קריאה · 👥 ${members.length}`;
  };
  async function decorate(){
    const id=++run, t=teacher(), list=document.getElementById('td-clubs-list');
    if(!t?.uid||!list||!window.db) return;
    stop();
    const cards=[...list.querySelectorAll('.teacher-club-card')]; if(!cards.length) return;
    try{
      const snap=await window.db.collection('clubs').where('teacherUid','==',t.uid).get({source:'server'});
      if(id!==run||teacher()?.uid!==t.uid) return;
      const clubs=snap.docs.map(d=>({...d.data(),id:d.id}));
      const used=new Set();
      for(const card of cards){
        const name=card.querySelector('.tc-name')?.textContent||'';
        const club=clubs.find(c=>!used.has(c.id)&&(c.name||'המועדון שלי')===name);
        const meta=card.querySelector('.tc-meta'); if(!club||!meta) continue;
        used.add(club.id); meta.textContent='📚 טוען דקות קריאה…'; meta.classList.add('tc-live-reading'); meta.setAttribute('aria-live','polite');
        const ref=membersRef(club.id); if(!ref) continue;
        try{
          const unsub=ref.onSnapshot(s=>render(meta,s.docs),async()=>{
            try{const s=await ref.get({source:'server'}); if(card.isConnected) render(meta,s.docs);}catch(_){if(card.isConnected)meta.textContent='📚 לא הצלחנו לטעון את הדקות';}
          });
          unsubs.set(club.id,unsub);
        }catch(_){
          try{const s=await ref.get({source:'server'}); if(card.isConnected)render(meta,s.docs);}catch(__){if(card.isConnected)meta.textContent='📚 לא הצלחנו לטעון את הדקות';}
        }
      }
    }catch(e){console.warn('[booki] club minutes:',e?.code||e?.message);}
  }
  function install(){
    const style=document.createElement('style'); style.textContent=`#screen-teacher-dashboard .btn-tc-delete{width:28px!important;height:28px!important;min-width:28px!important;min-height:28px!important;padding:0!important;border-radius:9px!important;font-size:13px!important;line-height:1!important;opacity:.72}#screen-teacher-dashboard .tc-live-reading{display:block;margin-top:5px;font-size:13px;font-weight:700;color:#2c6a53;line-height:1.45}`; document.head.appendChild(style);
    const list=document.getElementById('td-clubs-list');
    if(list&&typeof MutationObserver!=='undefined'){observer=new MutationObserver(()=>setTimeout(decorate,0));observer.observe(list,{childList:true});}
    if(typeof onTeacherAuthChange==='function')onTeacherAuthChange(()=>{stop();setTimeout(decorate,0);});
    setTimeout(decorate,0);
  }
  window.BookiTeacherMinutes20260910={version:'2026-09-10.1',decorate,stop};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
