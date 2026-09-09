/* Booki basic consent. Staged OFF until dedicated Firestore rules are deployed
 * and the owner explicitly enables config/basicConsent. No local-only approvals.
 * A checkbox is a self-declaration, not verified guardian identity.
 */
(function () {
  'use strict';
  if (window.BookiBasicConsent) return;
  const COPY = window.BookiConsentCopy;
  if (!COPY) throw new Error('Missing versioned consent copy');
  const VERSION = COPY.VERSION;
  const confirmed = new Set(), pending = new Map();
  let configuration = null, configPromise = null, draftTeacher = null;
  let activeModal = null;
  const $ = id => document.getElementById(id);
  const db = () => window.db;
  const user = () => window.firebase?.auth?.().currentUser || null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = (tag, value, cls) => { const el = document.createElement(tag); el.textContent = value; if (cls) el.className = cls; return el; };
  const validEmail = s => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  function deadline(promise, ms = 12000) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('network-timeout')), ms); })]).finally(() => clearTimeout(timer));
  }
  async function ready(force = false) {
    if (!force && configPromise) return configPromise;
    configPromise = (async () => {
      if (!db()) return {enabled:false, unavailable:true};
      try {
        const snap = await deadline(db().collection('config').doc('basicConsent').get({source:'server'}));
        const c = snap.exists ? snap.data() : {};
        configuration = {...c, enabled:c.enabled === true && c.version === VERSION && validEmail(c.contactEmail), rulesAvailable:true};
        return configuration;
      } catch (e) {
        // A missing dedicated rule is NOT permission to save to public profiles.
        configuration = {enabled:false, unavailable:true, reason:e.code || e.message};
        return configuration;
      }
    })();
    return configPromise;
  }
  function reference(context) {
    if (context.kind === 'teacher') return db().collection('bookiTeacherConsents').doc(context.subjectId).collection('bookiConsentReceipts').doc(VERSION);
    if (!context.clubId) return db().collection('bookiPersonalConsents').doc(context.subjectId).collection('bookiConsentReceipts').doc(VERSION);
    return db().collection('bookiGuardianConsents').doc(context.clubId).collection('students').doc(context.subjectId).collection('bookiConsentReceipts').doc(VERSION);
  }
  function validReceipt(data, context) {
    return !!(data && data.version === VERSION && data.kind === context.kind && data.subjectId === context.subjectId && data.clubId === (context.clubId || '') && data.accepted === true && data.status === 'accepted' && data.acceptedAt);
  }
  function fullNotice(context, c) {
    return [COPY.summary[context.kind], ...COPY.privacy.flat(), ...COPY.terms.flat(),
      `מפעילה: ${c.operatorName || 'יהודית עמוס'}`, `לפניות פרטיות: ${c.contactEmail}`,
      context.kind === 'teacher' ? COPY.teacherDeclaration : COPY.guardianDeclaration].join('\n\n');
  }
  async function saveReceipt(context, signerName, relationship) {
    const u = user();
    if (!u || !configuration?.enabled) throw new Error('Consent is not enabled');
    const actorUid = u.uid, ref = reference(context);
    const name = String(signerName || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 100) throw new Error('invalid-signer-name');
    const record = {
      kind:context.kind, subjectId:context.subjectId, subjectName:String(context.subjectName || '').slice(0,120),
      clubId:context.clubId || '', teacherUid:context.teacherUid || (context.kind === 'teacher' ? context.subjectId : ''),
      signerName:name, relationship:context.kind === 'teacher' ? 'teacher' : relationship,
      acceptedByUid:actorUid, accepted:true, status:'accepted', version:VERSION,
      policyVersion:VERSION, termsVersion:VERSION, noticeText:fullNotice(context, configuration),
      verificationMethod:context.kind === 'teacher' ? 'signed_in_teacher_declaration' : 'self_declared_guardian',
      voiceEnabled:false, acceptedAt:window.firebase.firestore.FieldValue.serverTimestamp()
    };
    await deadline(db().runTransaction(async transaction => {
      if (user()?.uid !== actorUid) throw new Error('account-changed');
      const prior = await transaction.get(ref);
      if (prior.exists) {
        if (!validReceipt(prior.data(), context)) throw new Error('consent-requires-review');
        return; // Idempotent: never replace an earlier signature or timestamp.
      }
      transaction.set(ref, record);
    }));
    if (user()?.uid !== actorUid) throw new Error('account-changed');
    return record;
  }
  function addDocuments(target, c) {
    for (const [title, paragraphs] of [['מדיניות פרטיות', COPY.privacy], ['תנאי שימוש', COPY.terms]]) {
      const details = document.createElement('details'); details.className = 'bc-document';
      details.appendChild(text('summary', title));
      for (const [heading, copy] of paragraphs) { details.appendChild(text('h4', heading)); details.appendChild(text('p', copy)); }
      target.appendChild(details);
    }
    const contact = text('p', 'לפניות בנושא פרטיות: ', 'bc-small');
    if (validEmail(c?.contactEmail)) {
      const link = text('a', c.contactEmail); link.href = 'mailto:' + c.contactEmail; contact.appendChild(link);
    } else contact.appendChild(text('span', 'כתובת הפנייה תוגדר לפני הפעלת האישורים.'));
    target.appendChild(contact);
  }
  function modalShell(title) {
    const overlay = document.createElement('div'); overlay.className = 'booki-consent-overlay';
    overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-labelledby','bc-title'); overlay.dir = 'rtl';
    const panel = document.createElement('section'); panel.className = 'bc-panel';
    panel.appendChild(text('div','🌱','bc-icon')); const heading = text('h2', title); heading.id = 'bc-title'; panel.appendChild(heading);
    overlay.appendChild(panel); document.body.appendChild(overlay);
    const focus = document.activeElement;
    const oldScreens = [...document.querySelectorAll('.screen.active')].map(el => [el, el.inert]);
    oldScreens.forEach(([el]) => { el.inert = true; });
    overlay.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...panel.querySelectorAll('button,input,select,a,summary')].filter(el => !el.disabled && el.getClientRects().length);
      if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    });
    return {panel, close(){overlay.remove(); oldScreens.forEach(([el,inert]) => {el.inert=inert;}); if(focus?.isConnected) focus.focus({preventScroll:true}); activeModal=null;}};
  }
  function errorText(error) {
    if (error?.message === 'invalid-signer-name') return 'יש למלא את שם ההורה או האפוטרופוס.';
    if (error?.message === 'consent-requires-review') return 'האישור הקודם בוטל או דורש בירור. פנו למנהלת בוקי דרך כתובת הפרטיות.';
    return 'לא הצלחנו לאמת או לשמור את האישור. הוא לא סומן כמאושר. בדקו חיבור ונסו שוב.';
  }
  function requestConsent(context, c, preview = false) {
    if (activeModal) return Promise.resolve(false);
    return new Promise(resolve => {
      const shell = modalShell(context.kind === 'teacher' ? 'רגע לפני שמקימים מועדון' : 'אישור הורה — פעם אחת ומתחילים');
      activeModal = shell;
      const p = shell.panel;
      if (preview) p.appendChild(text('p','תצוגה מקדימה בלבד — לא נשמר אישור.','bc-preview-label'));
      if (context.kind === 'guardian') p.appendChild(text('p','ילדים, בקשו מהורה או מאפוטרופוס לקרוא ולאשר איתכם.','bc-child-intro'));
      p.appendChild(text('p', context.subjectName || 'כרטיס הקריאה', 'bc-subject'));
      if(context.clubName) p.appendChild(text('p',context.clubName,'bc-small'));
      p.appendChild(text('p', COPY.summary[context.kind], 'bc-summary'));
      p.appendChild(text('p','אפשר לבחור לא לאשר. האישור אינו כולל הקלטת קול, פרסומות או פרסום תמונות.','bc-small'));
      addDocuments(p,c);
      let signer, relation;
      if (context.kind === 'guardian') {
        const label = text('label','שם ההורה או האפוטרופוס'); label.htmlFor = 'bc-signer'; p.appendChild(label);
        signer = document.createElement('input'); signer.id='bc-signer'; signer.type='text'; signer.autocomplete='name'; signer.maxLength=100; signer.className='input-field'; p.appendChild(signer);
        const rLabel=text('label','הקשר לילד או לילדה'); rLabel.htmlFor='bc-relation'; p.appendChild(rLabel);
        relation=document.createElement('select');relation.id='bc-relation';relation.className='input-field';
        for(const [value,labelText] of [['parent','הורה'],['guardian','אפוטרופוס']]){const o=text('option',labelText);o.value=value;relation.appendChild(o);}p.appendChild(relation);
      }
      const label = document.createElement('label'); label.className='bc-agree';
      const checkbox = document.createElement('input'); checkbox.type='checkbox'; checkbox.id='bc-accept';
      label.append(checkbox,text('span',context.kind==='teacher'?COPY.teacherDeclaration:COPY.guardianDeclaration));p.appendChild(label);
      p.appendChild(text('p','האישור נשמר עבור הכרטיס הזה וגרסת המסמכים הזו. לא נבקש אותו בכל כניסה.','bc-small'));
      const status=text('p','','bc-error');status.setAttribute('role','status');p.appendChild(status);
      const accept=text('button',preview?'זו תצוגה מקדימה בלבד':'מאשרים וממשיכים','bc-primary');accept.type='button';accept.disabled=true;p.appendChild(accept);
      const cancel=text('button',preview?'סגירה':'לא עכשיו','bc-cancel');cancel.type='button';p.appendChild(cancel);
      const refresh=()=>{accept.disabled=preview||!checkbox.checked||(signer&&signer.value.trim().length<2);};checkbox.onchange=refresh;if(signer)signer.oninput=refresh;
      cancel.onclick=()=>{shell.close();resolve(false);};
      accept.onclick=async()=>{
        if(accept.disabled||preview)return;accept.disabled=true;cancel.disabled=true;status.textContent='שומרים את האישור…';
        try{await saveReceipt(context,signer?signer.value:(context.subjectName||user()?.displayName||user()?.email),relation?relation.value:'teacher');shell.close();resolve(true);}
        catch(e){status.textContent=errorText(e);cancel.disabled=false;refresh();}
      };
      requestAnimationFrame(()=>{(signer||checkbox).focus({preventScroll:true});});
    });
  }
  async function ensure(context, registrationDraft) {
    const c=await ready();
    if(!c.enabled)return true; // Explicit staged rollout, not a saved consent.
    if(!user()) {
      if(typeof ensureStudentAuth==='function' && context.kind==='guardian')await ensureStudentAuth();
      if(!user())return false;
    }
    const key=user().uid+'|'+reference(context).path;
    if(confirmed.has(key))return true;
    if(pending.has(key))return pending.get(key);
    const operation=(async()=>{
      try{
        const snapshot=await deadline(reference(context).get({source:'server'}));
        if(snapshot.exists){
          if(!validReceipt(snapshot.data(),context))throw new Error('consent-requires-review');
          confirmed.add(key);return true;
        }
        if(registrationDraft){await saveReceipt(context,context.subjectName,'teacher');confirmed.add(key);return true;}
        const accepted=await requestConsent(context,c);
        if(accepted)confirmed.add(key);
        return accepted;
      }catch(e){
        // Read failure is NOT treated as a missing receipt; no duplicate or fake approval.
        const shell=modalShell('לא הצלחנו לבדוק את האישור');activeModal=shell;
        shell.panel.appendChild(text('p',errorText(e),'bc-error'));
        const retry=text('button','ניסיון נוסף','bc-primary');retry.type='button';shell.panel.appendChild(retry);
        const back=text('button','חזרה','bc-cancel');back.type='button';shell.panel.appendChild(back);
        return new Promise(resolve=>{
          retry.onclick=()=>{shell.close();pending.delete(key);resolve(ensure(context,registrationDraft));};
          back.onclick=()=>{shell.close();resolve(false);};
        });
      }
    })();
    pending.set(key,operation);
    try{return await operation;}finally{pending.delete(key);}
  }
  async function requireTeacher(t) {
    const proposed=draftTeacher;draftTeacher=null;
    const c=await ready();if(!c.enabled)return true;
    const u=user();if(!u||u.isAnonymous||t?.uid!==u.uid)return false;
    const info=typeof fbLoadUser==='function'?await fbLoadUser(u.uid):null;
    if(info?.role==='owner')return true; // The owner must be able to configure/review rollout.
    return ensure({kind:'teacher',subjectId:u.uid,subjectName:t.name||u.displayName||u.email,clubId:'',teacherUid:u.uid},proposed?.email===u.email?.toLowerCase());
  }
  async function requireGuardian(id,clubId,profile={}) {
    const c=await ready();if(!c.enabled)return true;
    if(Number.isInteger(id)||profile?._legacyIndex!==undefined||String(id).startsWith('legacy_')) {
      // Legacy cards have no stable authenticated owner. Do not invent parental verification.
      window.alert('כרטיס הקריאה הישן דורש מעבר לכרטיס מועדון לפני אישור הורה. פנו למורה או למנהלת בוקי.');return false;
    }
    const club=clubId&&typeof fbLoadClub==='function'?await fbLoadClub(clubId):null;
    const u=user();
    // A teacher opening a child's card is an admin preview, NEVER a parent signature.
    if(u&&!u.isAnonymous&&window._currentTeacher?.uid===u.uid&&(window._currentTeacher.role==='owner'||club?.teacherUid===u.uid))return true;
    if(!u&&typeof ensureStudentAuth==='function')await ensureStudentAuth();
    if(!user())return false;
    return ensure({kind:'guardian',subjectId:String(id),subjectName:profile?.name||'כרטיס הקריאה',clubId:clubId||'',clubName:club?.name||'',teacherUid:club?.teacherUid||''});
  }
  function addRegistrationNotice() {
    if(!configuration?.enabled)return;
    const form=$('teacher-auth-form');if(!form||!form.querySelector('#ta-name')||form.querySelector('#bc-teacher-registration'))return;
    const submit=form.querySelector('.btn-green');if(!submit)return;
    const box=document.createElement('section');box.id='bc-teacher-registration';box.className='bc-registration';
    box.appendChild(text('p',COPY.summary.teacher));
    addDocuments(box,configuration);
    const label=document.createElement('label');label.className='bc-agree';
    const check=document.createElement('input');check.type='checkbox';check.id='bc-teacher-check';
    label.append(check,text('span',COPY.teacherDeclaration));box.appendChild(label);submit.before(box);
  }
  function wrap(name,handler) {
    const original=window[name];if(typeof original!=='function'||original.__bookiConsent)return;
    const fn=function(...args){return handler.call(this,original,args);};fn.__bookiConsent=true;window[name]=fn;
  }
  function install() {
    wrap('showTeacherDashboard',async function(original,args){const t=args[0]||(typeof getCurrentTeacher==='function'?getCurrentTeacher():null);if(t&&await requireTeacher(t))return original.apply(this,args);});
    wrap('showTeacherAuth',function(original,args){const result=original.apply(this,args);addRegistrationNotice();return result;});
    wrap('submitTeacherAuth',async function(original,args){
      await ready();
      if(configuration?.enabled&&$('ta-name')){
        addRegistrationNotice();
        if(!$('bc-teacher-check')?.checked){if($('ta-error'))$('ta-error').textContent='יש לקרוא ולאשר את תנאי השימוש והפרטיות כדי להקים חשבון.';return false;}
        draftTeacher={email:($('ta-email')?.value||'').trim().toLowerCase()};
      }
      const result=await original.apply(this,args);
      if($('ta-error')?.textContent.trim())draftTeacher=null;
      return result;
    });
    wrap('_enterPersonalHome',async function(original,args){const[id,profile]=args;const club=window.currentClubId||null;if(await requireGuardian(id,club,profile))return original.apply(this,args);});
    wrap('showMiniPersonalization',async function(original,args){if(await requireGuardian(args[0],args[1],{name:args[2]}))return original.apply(this,args);});
    wrap('showProfileWizard',async function(original,args){if(await requireGuardian(args[0],args[1],args[2]||{}))return original.apply(this,args);});
    wrap('selectStudent',async function(original,args){if(await requireGuardian(args[0],window.currentClubId))return original.apply(this,args);});
    wrap('_doJoin',async function(original,args){await ready();if(configuration?.enabled){const id=await ensureStudentAuth();if(!id||!await requireGuardian(id,args[0],{name:args[1]}))return;}return original.apply(this,args);});
    addRegistrationNotice();
    const form=$('teacher-auth-form');if(form&&!form.__bookiConsentObserved){form.__bookiConsentObserved=true;new MutationObserver(addRegistrationNotice).observe(form,{childList:true,subtree:true});}
    if(window.BookiConsentOwner)window.BookiConsentOwner.install();
  }
  const style=document.createElement('style');style.id='booki-basic-consent-style';
  style.textContent=`.booki-consent-overlay{position:fixed;inset:0;z-index:1300;display:flex;align-items:center;justify-content:center;background:#24364480;backdrop-filter:blur(4px);padding:16px;box-sizing:border-box;font-family:Arial,sans-serif}.bc-panel{box-sizing:border-box;width:100%;max-width:480px;max-height:calc(100dvh - 32px);overflow:auto;background:#fffdf7;color:#26354d;border-radius:24px;padding:22px;text-align:right;line-height:1.6;box-shadow:0 16px 70px #182b3e40}.bc-panel h2{margin:0 0 10px;font-size:23px}.bc-icon{text-align:center;font-size:30px}.bc-subject{font-weight:bold;color:#267566;margin:5px 0}.bc-summary,.bc-registration{font-size:14px}.bc-small{font-size:12px;color:#55655f;overflow-wrap:anywhere}.bc-document{background:#f3f7f3;border-radius:10px;padding:9px 12px;margin:8px 0;font-size:13px}.bc-document summary{cursor:pointer;font-weight:bold}.bc-document h4{margin:10px 0 0}.bc-document p{margin:4px 0}.bc-agree{display:flex;align-items:flex-start;gap:9px;margin:16px 0;font-size:14px}.bc-agree input{flex:0 0 20px;width:20px;height:20px;margin:3px 0;accent-color:#278776}.bc-panel input,.bc-panel select{font:inherit}.bc-primary,.bc-cancel{display:block;width:100%;padding:12px;border:0;border-radius:12px;font-family:inherit;cursor:pointer;font-size:16px}.bc-primary{background:#258675;color:white;font-weight:bold}.bc-primary:disabled{background:#dde5e1;color:#60766c;cursor:not-allowed}.bc-cancel{background:transparent;color:#53665d;margin-top:5px}.bc-error{font-size:13px;color:#9e342b;min-height:20px}.bc-preview-label{background:#fff0bd;color:#735520;padding:8px;border-radius:9px;font-size:13px}.bc-registration{padding:12px;border:1px solid #cbded3;border-radius:14px;background:#fff}.bc-registration>p{margin:0}.bc-panel button:focus-visible,.bc-panel input:focus-visible,.bc-panel summary:focus-visible{outline:3px solid #ebbc46;outline-offset:2px}@media(max-width:360px){.bc-panel{padding:16px}.bc-panel h2{font-size:20px}}`;
  document.head.appendChild(style);
  window.BookiBasicConsent={VERSION,ready,reference,validReceipt,requireTeacher,requireGuardian,install,addDocuments,esc,
    configuration:()=>configuration,
    registrationAllowed:()=>!configuration?.enabled||!$('ta-name')||!!$('bc-teacher-check')?.checked,
    preview:kind=>requestConsent({kind:kind==='teacher'?'teacher':'guardian',subjectId:'preview',subjectName:kind==='teacher'?'מורה לדוגמה':'כרטיס לדוגמה',clubId:'',teacherUid:''},configuration||{},true)
  };
  install();
})();
