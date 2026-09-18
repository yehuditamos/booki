const fs=require('node:fs');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection,query,where,updateDoc}=require('firebase/firestore');
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-booki-private',firestore:{host:'127.0.0.1',port:8088,rules:fs.readFileSync(__dirname+'/../../firestore.rules','utf8')}});
 const teacher=env.authenticatedContext('teacher',{firebase:{sign_in_provider:'password'}}).firestore();
 const other=env.authenticatedContext('other',{firebase:{sign_in_provider:'password'}}).firestore();
 const child=env.authenticatedContext('child',{firebase:{sign_in_provider:'anonymous'}}).firestore();
 const stranger=env.authenticatedContext('stranger',{firebase:{sign_in_provider:'anonymous'}}).firestore();
 const guest=env.unauthenticatedContext().firestore();
 const story={teacherUid:'teacher',title:'סיפור',text:'אב בא',status:'published',createdAt:'now',updatedAt:'now'};
 const path='teacherLibraries/teacher/stories/story',access='teacherLibraryAccess/teacher/readers/child';
 try{
  await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await setDoc(doc(db,'clubs/class'),{teacherUid:'teacher',libraryMode:'private'});await setDoc(doc(db,'clubs/class/memberships/card'),{claimedByUid:'child',status:'active'});});
  await assertSucceeds(setDoc(doc(teacher,path),story));
  await assertFails(getDoc(doc(guest,path)));await assertFails(getDoc(doc(other,path)));await assertFails(getDoc(doc(child,path)));
  await assertFails(setDoc(doc(other,path),story));await assertFails(setDoc(doc(child,path),story));
  await assertSucceeds(setDoc(doc(child,access),{clubId:'class',memberId:'card'}));
  await assertSucceeds(getDoc(doc(child,path)));
  await assertFails(setDoc(doc(stranger,'teacherLibraryAccess/teacher/readers/stranger'),{clubId:'class',memberId:'card'}));
  await assertFails(setDoc(doc(child,'teacherLibraryAccess/other/readers/child'),{clubId:'class',memberId:'card'}));
  await assertSucceeds(setDoc(doc(teacher,'teacherLibraries/teacher/stories/draft'),{...story,status:'draft'}));
  await assertFails(getDoc(doc(child,'teacherLibraries/teacher/stories/draft')));
  await assertSucceeds(getDocs(query(collection(child,'teacherLibraries/teacher/stories'),where('status','==','published'))));
  await assertFails(getDocs(collection(child,'teacherLibraries/teacher/stories')));
  await assertFails(setDoc(doc(teacher,path),{...story,title:'<img>'}));
  await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'clubs/class'),{libraryMode:'both'}));
  await assertSucceeds(getDoc(doc(child,path)));
  await assertSucceeds(setDoc(doc(child,access),{clubId:'class',memberId:'card'}));
  await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'clubs/class/memberships/card'),{status:'left'}));
  await assertFails(getDoc(doc(child,path)));
  await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'clubs/class/memberships/card'),{status:'active',claimedByUid:'stranger'}));
  await assertFails(getDoc(doc(child,path)));
  await env.withSecurityRulesDisabled(async c=>{await updateDoc(doc(c.firestore(),'clubs/class/memberships/card'),{claimedByUid:'child'});await updateDoc(doc(c.firestore(),'clubs/class'),{libraryMode:'public'});});
  await assertFails(getDoc(doc(child,path)));await assertFails(setDoc(doc(child,access),{clubId:'class',memberId:'card'}));
  console.log('PASS privacy rules: own teacher CRUD, no unrelated/guest reads, membership grant, no draft reads, scoped queries, departed/reclaimed/public-mode revocation');
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
