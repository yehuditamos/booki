/**
 * Booki school-pilot child authentication.
 * NEW school-pilot classes only. Does not touch legacy Omri/Mitarim data.
 *
 * UX: first name -> two picture password -> child card.
 * Teacher can view the two pictures from the class dashboard.
 *
 * Security note: the picture pair is NOT stored in the public child card.
 * It lives in teacher-only /schoolPilotSecrets/{clubId}/children/{cardId}.
 * Production must use the accompanying school-pilot Firestore rules before enabling this path.
 */

const BOOKI_PASSWORD_PICTURES = [
  { id:'dino', emoji:'🦖', label:'דינוזאור' }, { id:'rocket', emoji:'🚀', label:'חללית' },
  { id:'rainbow', emoji:'🌈', label:'קשת' }, { id:'tiger', emoji:'🐯', label:'נמר' },
  { id:'frog', emoji:'🐸', label:'צפרדע' }, { id:'ball', emoji:'⚽', label:'כדור' },
  { id:'pizza', emoji:'🍕', label:'פיצה' }, { id:'octopus', emoji:'🐙', label:'תמנון' },
  { id:'tractor', emoji:'🚜', label:'טרקטור' }, { id:'crown', emoji:'👑', label:'כתר' },
  { id:'unicorn', emoji:'🦄', label:'חד-קרן' }, { id:'watermelon', emoji:'🍉', label:'אבטיח' }
];

function _pilotDb(){ return window.db; }
function _pilotNow(){ return new Date().toISOString(); }
function _pictureById(id){ return BOOKI_PASSWORD_PICTURES.find(x=>x.id===id) || null; }
function _picturePairLabel(ids){ return (ids||[]).map(id=>_pictureById(id)?.emoji || '❔').join(' '); }

async function fbPilotCreateClass(club){
  const db=_pilotDb(); if(!db||!club?.id) return false;
  const auth=firebase.auth().currentUser; if(!auth) return false;
  const batch=db.batch();
  const clubRef=db.collection('schoolPilotClubs').doc(club.id);
  const teacherMemberRef=db.collection('clubMembers').doc(club.id).collection('members').doc(auth.uid);
  batch.set(clubRef,{...club,securityModel:'picture-password-v1',teacherUid:auth.uid,createdAt:_pilotNow(),updatedAt:_pilotNow()});
  batch.set(teacherMemberRef,{uid:auth.uid,clubId:club.id,role:'teacher',active:true,createdAt:_pilotNow()});
  await batch.commit(); return true;
}

async function fbPilotTeacherAddStudent(clubId,{name}){
  const db=_pilotDb(); if(!db||!clubId||!name?.trim()) return {ok:false,reason:'missing-data'};
  const clean=name.trim().replace(/\s+/g,' ');
  const cardId='child_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  await db.collection('schoolPilotClubs').doc(clubId).collection('memberships').doc(cardId).set({
    cardId,clubId,firstName:clean,role:'student',active:true,passwordSet:false,claimedByUid:null,createdAt:_pilotNow(),updatedAt:_pilotNow()
  });
  return {ok:true,cardId};
}

async function fbPilotSetPicturePassword(clubId,cardId,pictureIds){
  const db=_pilotDb(); if(!db||!clubId||!cardId||!Array.isArray(pictureIds)||pictureIds.length!==2||pictureIds[0]===pictureIds[1]) return {ok:false};
  const auth=firebase.auth().currentUser; if(!auth) return {ok:false,reason:'auth'};
  const valid=pictureIds.every(id=>!!_pictureById(id)); if(!valid) return {ok:false,reason:'pictures'};
  const secretRef=db.collection('schoolPilotSecrets').doc(clubId).collection('children').doc(cardId);
  const cardRef=db.collection('schoolPilotClubs').doc(clubId).collection('memberships').doc(cardId);
  const memberRef=db.collection('clubMembers').doc(clubId).collection('members').doc(auth.uid);
  const batch=db.batch();
  // Teacher-readable recovery copy. Never expose this collection to child clients in rules.
  batch.set(secretRef,{cardId,clubId,pictureIds,pictureLabel:_picturePairLabel(pictureIds),updatedAt:_pilotNow()},{merge:true});
  batch.set(cardRef,{passwordSet:true,claimedByUid:auth.uid,updatedAt:_pilotNow()},{merge:true});
  batch.set(memberRef,{uid:auth.uid,clubId,role:'student',active:true,cardId,createdAt:_pilotNow()},{merge:true});
  await batch.commit();
  return {ok:true,label:_picturePairLabel(pictureIds)};
}

async function fbPilotVerifyPicturePassword(clubId,cardId,pictureIds){
  // IMPORTANT: This direct implementation is for isolated testing only.
  // Before production, verification must move to a server-side callable/edge endpoint so a child cannot read teacher-only secrets.
  const db=_pilotDb(); if(!db) return {ok:false};
  const snap=await db.collection('schoolPilotSecrets').doc(clubId).collection('children').doc(cardId).get();
  if(!snap.exists) return {ok:false,reason:'not-set'};
  const expected=snap.data().pictureIds||[];
  const ok=expected.length===2 && expected[0]===pictureIds?.[0] && expected[1]===pictureIds?.[1];
  return {ok};
}

async function fbPilotTeacherLoadPasswords(clubId){
  const db=_pilotDb(); if(!db||!clubId) return [];
  const [cards,secrets]=await Promise.all([
    db.collection('schoolPilotClubs').doc(clubId).collection('memberships').get(),
    db.collection('schoolPilotSecrets').doc(clubId).collection('children').get()
  ]);
  const secretMap=new Map(secrets.docs.map(d=>[d.id,d.data()]));
  return cards.docs.map(d=>{
    const card=d.data(),secret=secretMap.get(d.id);
    return {cardId:d.id,firstName:card.firstName,passwordSet:!!card.passwordSet,pictureIds:secret?.pictureIds||[],pictureLabel:secret?.pictureLabel||''};
  }).sort((a,b)=>(a.firstName||'').localeCompare(b.firstName||'','he'));
}

function renderBookiPicturePasswordPicker(container,onComplete){
  if(!container) return;
  let chosen=[];
  container.innerHTML=`
    <section class="booki-picture-password" dir="rtl">
      <h2>🔑 הסיסמה שלי בבוקי</h2>
      <p><strong>לכל ילד בבוקי יש סיסמה משלו.</strong><br>הסיסמה שלך היא שתי דמויות סודיות שתבחר עכשיו.<br>הן ילוו אותך תמיד בבוקי, ובעזרתן תוכל להיכנס לכרטיס שלך גם ממכשיר אחר.<br><strong>בחר שתי דמויות שאתה אוהב ושתזכור!</strong></p>
      <div class="booki-picture-grid"></div>
      <div class="booki-picture-result">בחר שתי דמויות</div>
      <button class="booki-picture-confirm" disabled>זה המפתח שלי!</button>
    </section>`;
  const grid=container.querySelector('.booki-picture-grid'),result=container.querySelector('.booki-picture-result'),confirm=container.querySelector('.booki-picture-confirm');
  BOOKI_PASSWORD_PICTURES.forEach(pic=>{const b=document.createElement('button');b.type='button';b.className='booki-picture-option';b.dataset.id=pic.id;b.innerHTML=`<span>${pic.emoji}</span><small>${pic.label}</small>`;b.onclick=()=>{if(chosen.includes(pic.id))chosen=chosen.filter(x=>x!==pic.id);else if(chosen.length<2)chosen.push(pic.id);grid.querySelectorAll('button').forEach(x=>x.classList.toggle('selected',chosen.includes(x.dataset.id)));result.innerHTML=chosen.length===2?`<strong>${_picturePairLabel(chosen)}</strong><br>זאת הסיסמה שלך בבוקי!`:'בחר שתי דמויות';confirm.disabled=chosen.length!==2;};grid.appendChild(b)});
  confirm.onclick=()=>chosen.length===2&&onComplete?.([...chosen]);
}

window.BOOKI_PASSWORD_PICTURES=BOOKI_PASSWORD_PICTURES;
window.fbPilotCreateClass=fbPilotCreateClass;
window.fbPilotTeacherAddStudent=fbPilotTeacherAddStudent;
window.fbPilotSetPicturePassword=fbPilotSetPicturePassword;
window.fbPilotVerifyPicturePassword=fbPilotVerifyPicturePassword;
window.fbPilotTeacherLoadPasswords=fbPilotTeacherLoadPasswords;
window.renderBookiPicturePasswordPicker=renderBookiPicturePasswordPicker;
