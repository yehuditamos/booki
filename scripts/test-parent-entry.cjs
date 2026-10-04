'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('firebase-clubs.js','utf8');
let user={uid:'home-reader',isAnonymous:true},member,writes=[],fail=false;
const ref={collection(){return this},doc(){return this}};
const db={collection:()=>ref,runTransaction:async fn=>{if(fail)throw {code:'permission-denied'};return fn({get:async()=>({exists:!!member,data:()=>member}),update:(_,v)=>writes.push(v)})}};
const context=vm.createContext({window:{db},firebase:{auth:()=>({currentUser:user})},console});vm.runInContext(source,context);
(async()=>{
 for(const personalized of [false,true]){
  member={createdByTeacher:true,status:'active',role:'member',personalized,claimedByUid:'school-reader',cachedStats:{totalMinutes:45}};writes=[];
  assert.equal(await context.fbReclaimCard('class','card'),true);
  assert.deepEqual(Object.keys(writes[0]).sort(),['claimedByUid','updatedAt']);assert.equal(writes[0].claimedByUid,'home-reader');assert.equal(member.cachedStats.totalMinutes,45);
 }
 for(const overrides of [{status:'left'},{status:'suspended'},{role:'owner'},{createdByTeacher:false}]){
  member={createdByTeacher:true,status:'active',role:'member',...overrides};writes=[];assert.equal(await context.fbReclaimCard('class','card'),false);assert.equal(writes.length,0);
 }
 member=null;assert.equal(await context.fbReclaimCard('class','card'),false);
 user.isAnonymous=false;assert.equal(await context.fbReclaimCard('class','card'),false);user.isAnonymous=true;
 fail=true;assert.equal(await context.fbReclaimCard('class','card'),false);
 console.log('PASS: first/home device binding; existing minutes preserved; archived/suspended/nonstudent/missing cards denied; teacher identity denied; server denial propagated.');
})().catch(e=>{console.error(e);process.exitCode=1});
