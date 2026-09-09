/* Booki pilot — optional teacher phone + owner contact visibility */
(function(){
  'use strict';

  function addPhoneField(){
    const form=document.getElementById('teacher-auth-form');
    if(!form||!document.getElementById('ta-name')||document.getElementById('ta-phone')) return;
    const email=document.getElementById('ta-email');
    if(!email) return;
    const wrap=document.createElement('div');
    wrap.className='teacher-phone-field';
    wrap.innerHTML='<input id="ta-phone" type="tel" inputmode="tel" class="input-field" placeholder="מספר טלפון" autocomplete="tel"><div class="teacher-phone-help">לא חובה — רק אם תרצי שניצור איתך קשר כדי לוודא שהכול הולך לך חלק 💚</div>';
    email.parentNode.insertBefore(wrap,email);
  }

  function installAuthWrapper(){
    const original=window.submitTeacherAuth;
    if(typeof original!=='function'||original.__bookiPhoneWrapped) return false;
    async function wrapped(){
      const phone=(document.getElementById('ta-phone')?.value||'').trim();
      const hadPhoneField=!!document.getElementById('ta-phone');
      await original.apply(this,arguments);
      if(hadPhoneField&&phone&&window.firebase?.auth){
        const u=window.firebase.auth().currentUser;
        if(u&&!u.isAnonymous&&window.db){
          try{await window.db.collection('users').doc(u.uid).set({phone:phone,phoneProvidedVoluntarily:true,phoneUpdatedAt:new Date().toISOString()},{merge:true});}
          catch(e){console.warn('[booki] optional teacher phone save failed',e);}
        }
      }
    }
    wrapped.__bookiPhoneWrapped=true;
    window.submitTeacherAuth=wrapped;
    return true;
  }

  function safe(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function phoneHref(v){return String(v||'').replace(/[^+0-9]/g,'');}

  function installOwnerWrapper(){
    const original=window._odRenderTeachers;
    if(typeof original!=='function'||original.__bookiPhoneWrapped) return false;
    function wrapped(teachers,clubs){
      original.apply(this,arguments);
      const list=document.getElementById('od-teachers-list');
      if(!list) return;
      const rows=[...list.querySelectorAll('.od-row')];
      (teachers||[]).forEach((t,i)=>{
        const row=rows[i]; if(!row) return;
        const info=row.querySelector('div'); if(!info||info.querySelector('.od-teacher-phone')) return;
        const p=document.createElement('span');
        p.className='od-teacher-phone';
        if(t.phone){
          const href=phoneHref(t.phone);
          p.innerHTML='📱 <a href="tel:'+safe(href)+'">'+safe(t.phone)+'</a>';
        }else p.textContent='📱 לא הוזן טלפון';
        info.appendChild(p);
      });
    }
    wrapped.__bookiPhoneWrapped=true;
    window._odRenderTeachers=wrapped;
    return true;
  }

  const style=document.createElement('style');
  style.textContent='.teacher-phone-field{margin:0}.teacher-phone-help{font-size:.78rem;color:#68766f;margin:-5px 4px 9px;line-height:1.35;text-align:right}.od-teacher-phone{font-size:.82em;color:#547064;display:block;margin-top:3px}.od-teacher-phone a{color:#28764d;font-weight:800;text-decoration:none}';
  document.head.appendChild(style);

  let tries=0;
  const timer=setInterval(()=>{
    addPhoneField();
    const a=installAuthWrapper(),o=installOwnerWrapper();
    if(++tries>200||(a&&o)) clearInterval(timer);
  },100);
  new MutationObserver(addPhoneField).observe(document.body,{childList:true,subtree:true});
})();