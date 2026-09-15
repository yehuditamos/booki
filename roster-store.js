/** Atomic roster capacity and assignment. Only unused anonymous cards may be archived. */
(function(){
'use strict';
const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('he');
const number=m=>Number(m.cardNumber)||Number(String(m.name||'').match(/^כרטיס פנוי\s+(\d+)$/)?.[1])||0;
const unused=m=>m.createdByTeacher===true && /^כרטיס פנוי\s+\d+$/.test(m.name||'') && !m.claimedByUid && m.personalized!==true && !Object.values(m.cachedStats||{}).some(v=>typeof v==='number' && v!==0) && !m.cachedStats?.lastReadAt;
function capacity(club,rows){
 if(Number.isInteger(club.rosterCapacity))return club.rosterCapacity;
 const slots=rows.map(number).filter(Boolean);
 return slots.length?Math.max(...slots,rows.filter(m=>!unused(m)).length):rows.length;
}
function plan(club,rows,names,requested){
 let limit=requested===undefined?capacity(club,rows):requested;
 if(!rows.length && requested===undefined && !limit)limit=names.length;
 if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('מספר הילדים חייב להיות בין 1 ל־50');
 const known=new Set(rows.flatMap(m=>[norm(m.name),norm(m.effectiveName)]).filter(Boolean));
 const fresh=names.filter(n=>!known.has(norm(n)));
 const spare=rows.filter(unused).sort((a,b)=>number(a)-number(b)||a.userId.localeCompare(b.userId));
 const fixed=rows.length-spare.length;
 if(fixed>limit || fresh.length>limit-fixed)throw Error('אין מספיק כרטיסים פנויים. עדכנו תחילה את מספר הילדים בכיתה');
 const excess=Math.max(0,rows.length-limit);
 const archive=excess?spare.slice(-excess):[];
 const available=spare.slice(0,spare.length-excess);
 const rename=[],create=[];
 fresh.forEach((name,i)=>{
  if(i<available.length)rename.push({member:available[i],name,cardNumber:number(available[i])});
  else create.push({name});
 });
 const finalCount=rows.length-archive.length+create.length;
 const usedNumbers=new Set(rows.map(number).filter(Boolean));
 let n=1;
 while(finalCount+create.filter(x=>x.open).length<limit){
  while(usedNumbers.has(n))n++;
  create.push({name:'כרטיס פנוי '+String(n).padStart(2,'0'),cardNumber:n,open:true});usedNumbers.add(n++);
 }
 return {limit,archive,rename,create,skipped:names.length-fresh.length};
}
async function save(id,{names=[],target},uid){
 const db=window.db,ref=db.collection('clubs').doc(id);
 const snapshot=await ref.collection('memberships').get({source:'server'});
 if(snapshot.metadata?.fromCache)throw Error('הרשימה לא נטענה מהשרת. נסו שוב');
 const docs=snapshot.docs;
 const resolved=new Map();
 for(const d of docs){
  const m=d.data();
  if(m.claimedByUid && window.BookiClassSlots?.effectiveName)resolved.set(d.id,await window.BookiClassSlots.effectiveName(m));
 }
 return db.runTransaction(async tx=>{
  const clubSnap=await tx.get(ref);
  if(!clubSnap.exists || clubSnap.data().teacherUid!==uid || getCurrentTeacher()?.uid!==uid)throw Error('אין הרשאה לעדכן את המועדון');
  const current=[];
  for(const d of docs){
   const snap=await tx.get(d.ref);
   if(snap.exists && snap.data().status!=='left')current.push({...snap.data(),userId:d.id,effectiveName:resolved.get(d.id)});
  }
  // A roster count mismatch means another tab created cards since the query.
  const club=clubSnap.data();
  if(club.rosterRevision && Number(club.memberCount)!==current.length)throw Error('הרשימה השתנתה. רעננו ונסו שוב');
  const result=plan(club,current,names,target),now=new Date().toISOString();
  result.archive.forEach(m=>tx.update(ref.collection('memberships').doc(m.userId),{status:'left',updatedAt:now}));
  result.rename.forEach(r=>tx.update(ref.collection('memberships').doc(r.member.userId),{name:r.name,cardNumber:r.cardNumber,updatedAt:now}));
  result.create.forEach(r=>{
   const card=ref.collection('memberships').doc();
   tx.set(card,{userId:card.id,clubId:id,name:r.name,cardNumber:r.cardNumber||0,emoji:'📚',role:'member',status:'active',createdByTeacher:true,personalized:false,claimedByUid:null,inviteSource:'pre-created',invitationId:null,permissions:{canViewLeaderboard:true,canAddMembers:false,canEditClub:false},joinedAt:now,leftAt:null,cachedStats:{totalMinutes:0,totalSessions:0,totalPoints:0,totalBooks:0,appMinutes:0,bookMinutes:0,lastReadAt:null},updatedAt:now});
  });
  tx.update(ref,{rosterCapacity:result.limit,memberCount:result.limit,rosterRevision:(Number(club.rosterRevision)||0)+1,updatedAt:now});
  return {total:result.limit,named:result.rename.length+result.create.filter(x=>!x.open).length,archived:result.archive.length,skipped:result.skipped};
 });
}
window.BookiRosterStore={plan,capacity,unused,save};
})();
