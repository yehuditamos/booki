/* Booki pilot — optional teacher phone + owner contact visibility.
   Registration copy uses reviewed niqqud; typed values are never modified. */
(function(){
  'use strict';

  function addPhoneField(){
    const form=document.getElementById('teacher-auth-form');
    if(!form||!document.getElementById('ta-name')||document.getElementById('ta-phone')) return;
    const email=document.getElementById('ta-email');
    if(!email) return;
    const wrap=document.createElement('div');
    wrap.className='teacher-phone-field';
    wrap.innerHTML='<input id="ta-phone" type="tel" inputmode="tel" class="input-field" placeholder="מספר טלפון" autocomplete="tel" aria-label="מספר טלפון" aria-describedby="teacher-phone-help"><div id="teacher-phone-help" class="teacher-phone-help">לא חובה — רק אם תרצי שניצור איתך קשר כדי לוודא שהכול הולך לך חלק 💚</div>';
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
  style.textContent=`
    #teacher-auth-form .teacher-phone-field{
      margin:0;box-sizing:border-box;width:100%;min-width:0;
      border:2px solid var(--border,#dce9df);border-radius:12px;
      background:#fff;overflow:hidden;direction:rtl;
      transition:border-color .2s;
    }
    #teacher-auth-form .teacher-phone-field:focus-within{
      border-color:var(--blue2,#3498db);
    }
    #teacher-auth-form .teacher-phone-field .input-field{
      display:block;width:100%;box-sizing:border-box;margin:0;
      border:0;border-radius:0;box-shadow:none;background:transparent;
      padding:14px 16px 6px;text-align:right;
    }
    #teacher-auth-form .teacher-phone-field .input-field:not(:placeholder-shown){
      direction:ltr;text-align:left;
    }
    #teacher-auth-form .teacher-phone-help{
      font-size:12px;color:#526259;margin:0;padding:0 16px 12px;
      line-height:1.6;text-align:right;overflow-wrap:break-word;
    }
    .od-teacher-phone{font-size:.82em;color:#547064;display:block;margin-top:3px}
    .od-teacher-phone a{color:#28764d;font-weight:800;text-decoration:none}
  `;
  document.head.appendChild(style);

  // Exact, hand-authored UI strings only. Never process input values or names.
  const authCopy=new Map([
    ['כניסה למורים','כְּנִיסָה לְמוֹרִים'],
    ['ברוכה הבאה לאזור המורה','בְּרוּכָה הַבָּאָה לְאֵזוֹר הַמּוֹרָה'],
    ['כאן מקימים מועדון, מוסיפים תלמידים ועוקבים אחרי הקריאה.','כָּאן מְקִימִים מוֹעֲדוֹן, מוֹסִיפִים תַּלְמִידִים וְעוֹקְבִים אַחֲרֵי הַקְּרִיאָה.'],
    ['הצטרפות לפיילוט בוקי','הִצְטָרְפוּת לְפַיְלוֹט בּוּקִי'],
    ['יצירת חשבון מורה חדש','יְצִירַת חֶשְׁבּוֹן מוֹרָה חָדָשׁ'],
    ['כניסה לחשבון קיים','כְּנִיסָה לְחֶשְׁבּוֹן קַיָּם'],
    ['פיילוט חינמי מוגבל ל־20 מורות. ממלאים שלושה פרטים ומיד פותחים כיתה.','פַּיְלוֹט חִנָּמִי מֻגְבָּל ל־20 מוֹרוֹת. מְמַלְּאִים שְׁלוֹשָׁה פְּרָטִים וּמִיָּד פּוֹתְחִים כִּתָּה.'],
    ['ממלאים שלושה פרטים ומיד מתחילים להקים את המועדון.','מְמַלְּאִים שְׁלוֹשָׁה פְּרָטִים וּמִיָּד מַתְחִילִים לְהָקִים אֶת הַמּוֹעֲדוֹן.'],
    ['הכניסי את האימייל והסיסמה שאיתם נרשמת.','הַכְנִיסִי אֶת הָאִימֵייל וְהַסִּסְמָה שֶׁאִתָּם נִרְשַׁמְתְּ.'],
    ['כבר יש לי חשבון','כְּבָר יֵשׁ לִי חֶשְׁבּוֹן'],
    ['זו הפעם הראשונה שלי','זוֹ הַפַּעַם הָרִאשׁוֹנָה שֶׁלִּי'],
    ['✨ פעם ראשונה בבוקי? מכאן מקימים חשבון מורה','✨ פַּעַם רִאשׁוֹנָה בְּבוּקִי? מִכָּאן מְקִימִים חֶשְׁבּוֹן מוֹרָה'],
    ['שם מלא','שֵׁם מָלֵא'],
    ['מספר טלפון','מִסְפַּר טֶלֶפוֹן'],
    ['לא חובה — רק אם תרצי שניצור איתך קשר כדי לוודא שהכול הולך לך חלק 💚','לֹא חוֹבָה — רַק אִם תִּרְצִי שֶׁנִּיצוֹר אִתָּךְ קֶשֶׁר כְּדֵי לְוַדֵּא שֶׁהַכֹּל הוֹלֵךְ לָךְ חָלָק 💚'],
    ['כתובת אימייל','כְּתֹבֶת אִימֵייל'],
    ['סיסמה (לפחות 6 תווים)','סִסְמָה (לְפָחוֹת 6 תָּוִים)'],
    ['הצגת הסיסמה','הַצָּגַת הַסִּסְמָה'],
    ['זכור אותי','זְכֹר אוֹתִי'],
    ['✨ הקמת החשבון שלי','✨ הֲקָמַת הַחֶשְׁבּוֹן שֶׁלִּי'],
    ['🔑 כניסה','🔑 כְּנִיסָה'],
    ['שכחתי סיסמה','שָׁכַחְתִּי סִסְמָה'],
    ['פעם ראשונה?','פַּעַם רִאשׁוֹנָה?'],
    ['הקמת חשבון מורה חדש','הֲקָמַת חֶשְׁבּוֹן מוֹרָה חָדָשׁ'],
    ['חינם ולוקח פחות מדקה ←','חִנָּם וְלוֹקֵחַ פָּחוֹת מִדַּקָּה ←'],
    ['כתבי קודם את כתובת האימייל שלך','כִּתְבִי קֹדֶם אֶת כְּתֹבֶת הָאִימֵייל שֶׁלָּךְ'],
    ['שלחנו קישור לאיפוס הסיסמה למייל 📩','שָׁלַחְנוּ קִישּׁוּר לְאִפּוּס הַסִּסְמָה לַמֵּייל 📩'],
    ['כתובת האימייל אינה תקינה','כְּתֹבֶת הָאִימֵייל אֵינָהּ תַּקִּינָה'],
    ['נשלחו יותר מדי בקשות. נסי שוב מאוחר יותר','נִשְׁלְחוּ יוֹתֵר מִדַּי בַּקָּשׁוֹת. נַסִּי שׁוּב מְאֻחָר יוֹתֵר'],
    ['אם קיים חשבון עם המייל הזה, יישלח אליו קישור 📩','אִם קַיָּם חֶשְׁבּוֹן עִם הַמֵּייל הַזֶּה, יִשָּׁלַח אֵלָיו קִישּׁוּר 📩'],
    ['לא הצלחנו לשלוח כרגע. נסי שוב בעוד רגע','לֹא הִצְלַחְנוּ לִשְׁלֹחַ כָּרֶגַע. נַסִּי שׁוּב בְּעוֹד רֶגַע'],
    ['יש למלא אימייל וסיסמה','יֵשׁ לְמַלֵּא אִימֵייל וְסִסְמָה'],
    ['לא נמצא חשבון עם כתובת זו','לֹא נִמְצָא חֶשְׁבּוֹן עִם כְּתֹבֶת זוֹ'],
    ['סיסמה שגויה','סִסְמָה שְׁגוּיָה'],
    ['אימייל או סיסמה שגויים','אִימֵייל אוֹ סִסְמָה שְׁגוּיִים'],
    ['כתובת האימייל כבר רשומה','כְּתֹבֶת הָאִימֵייל כְּבָר רְשׁוּמָה'],
    ['הסיסמה חייבת להכיל לפחות 6 תווים','הַסִּסְמָה חַיֶּבֶת לְהָכִיל לְפָחוֹת 6 תָּוִים'],
    ['יותר מדי ניסיונות — נסה שוב מאוחר יותר','יוֹתֵר מִדַּי נִסְיוֹנוֹת — נַסֵּה שׁוּב מְאֻחָר יוֹתֵר'],
    ['משהו לא עובד?','מַשֶּׁהוּ לֹא עוֹבֵד?'],
    ['© כל הזכויות שמורות ליהודית עמוס','© כָּל הַזְּכֻיּוֹת שְׁמוּרוֹת לִיהוּדִית עָמוֹס'],
    ['הפעלה/כיבוי ניקוד','הַפְעָלָה/כִּבּוּי נִקּוּד']
  ]);
  const attrPlain=new WeakMap();
  let authObserver=null;

  function niqqudOn(){
    return typeof window.isNiqudOn==='function' ? window.isNiqudOn() : true;
  }

  function markCopy(root,on){
    if(!root) return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      const parent=node.parentElement;
      if(!parent||parent.closest('[data-nk],script,style,input,textarea,select,[contenteditable]')) return;
      const plain=node.nodeValue;
      const key=plain.trim();
      if(!authCopy.has(key)) return;
      // Never put data-nk on a label containing a checkbox: applyNiqud uses
      // textContent and would otherwise delete the checkbox and its listener.
      const dynamic=!!parent.closest('#ta-error,#ta-status');
      const target=!dynamic&&parent.children.length===0
        ? parent : document.createElement('span');
      const pointed=plain.replace(key,authCopy.get(key));
      target.dataset.plain=plain;
      target.dataset.nk=pointed;
      if(target!==parent) node.replaceWith(target);
      target.textContent=on?pointed:plain;
    });
  }

  function pointAttribute(el,attr,on){
    if(!el.hasAttribute(attr)) return;
    const current=el.getAttribute(attr);
    let saved=attrPlain.get(el);
    if(!saved){saved={};attrPlain.set(el,saved);}
    if(!saved[attr]&&authCopy.has(current)) saved[attr]=current;
    const plain=saved[attr];
    if(!plain) return;
    const next=on?authCopy.get(plain):plain;
    if(current!==next) el.setAttribute(attr,next);
  }

  function syncTeacherAuth(){
    const screen=document.getElementById('screen-teacher-auth');
    if(!screen) return;
    // Scope observation to this screen and ignore our own DOM changes.
    if(authObserver) authObserver.disconnect();
    try{
      addPhoneField();
      const on=niqqudOn();
      markCopy(screen,on);
      markCopy(document.getElementById('bug-report-label'),on);
      markCopy(document.querySelector('.app-copyright'),on);
      screen.querySelectorAll('[data-nk]').forEach(el=>{
        const next=on?el.dataset.nk:el.dataset.plain;
        if(next!==undefined&&el.textContent!==next) el.textContent=next;
      });
      screen.querySelectorAll('input[placeholder]').forEach(el=>pointAttribute(el,'placeholder',on));
      screen.querySelectorAll('[aria-label]').forEach(el=>pointAttribute(el,'aria-label',on));
      const toggle=document.getElementById('btn-niqud-toggle');
      if(toggle){
        pointAttribute(toggle,'title',on);
        pointAttribute(toggle,'aria-label',on);
      }
    } finally {
      if(authObserver) authObserver.observe(screen,{childList:true,subtree:true,characterData:true});
    }
  }

  // The existing yellow button and saved preference remain the source of truth.
  window.applyTeacherAuthNiqud=syncTeacherAuth;
  function initRegistrationCopy(){
    if(authObserver||!document.getElementById('screen-teacher-auth')) return;
    authObserver=new MutationObserver(syncTeacherAuth);
    syncTeacherAuth();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initRegistrationCopy,{once:true});
  else initRegistrationCopy();

  let tries=0;
  const timer=setInterval(()=>{
    addPhoneField();
    const a=installAuthWrapper(),o=installOwnerWrapper();
    if(++tries>200||(a&&o)) clearInterval(timer);
  },100);
})();
