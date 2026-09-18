'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const code=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const story=(id='private-a',text='אָב')=>({id,title:id,pages:[{text}],libraryId:'teacher-private'});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function fixture(options={}){
 const dom=new JSDOM('<section id="screen-main" class="screen"><header class="home-header"></header><div class="home-console-wrap"></div><div id="booki-story-recommendations"></div><div id="class-goal">היעד הכיתתי נשמר</div></section><section id="screen-reader" class="screen"></section><section id="screen-teacher" class="screen active"></section>',{runScripts:'outside-only',url:'https://booki.example.test/'});
 const w=dom.window,state={reader:{clubId:'class-a',userId:'child-a'},uid:'anonymous-a',catalog:[story()],refresh:async()=>true,opens:[],seen:[],openResult:true};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.getActiveReader=()=>state.reader;
 w.firebase={auth:()=>({currentUser:{uid:state.uid}})};
 w.getAllStories=()=>state.catalog;
 w.BookiPrivateLibrary={refresh:()=>state.refresh()};
 w.showScreen=id=>{w.document.querySelectorAll('.screen').forEach(n=>n.classList.toggle('active',n.id===id));};
 w.startStory=async id=>{state.opens.push(id);if(state.openResult!==false)w.showScreen('screen-reader');return state.openResult;};
 w.fbMarkMessagesSeen=async(c,u,ids)=>{state.seen.push({c,u,ids:Array.from(ids)});return true;};
 w.openReadingChooser=()=>w.showScreen('screen-reader');
 state.saved=null;state.resumes=0;
 w._loadPausedAppStory=()=>state.saved;
 w.resumePausedAppStory=()=>{state.resumes++;w.showScreen('screen-reader');return true;};
 w.eval(code('child-choice.js'));w.eval(code('story-recommendations.js'));
 if(options.missingHeader)w.document.querySelector('.home-header').remove();
 w.eval(code('child-choice-app.js'));
 const settle=async()=>{await tick();await tick();};
 const enter=async()=>{w.showScreen('screen-main');await settle();};
 return {dom,w,state,settle,enter,close:()=>dom.window.close()};
}

test('Only scoped stories render; class goal and normal teacher screen remain intact',async()=>{
 const f=fixture();try{await f.enter();assert.equal(f.w.document.querySelectorAll('#cc-home .cc-card').length,1);assert(f.w.document.querySelector('#cc-home').textContent.includes('private-a'));assert.equal(f.state.opens.length,0);assert.equal(f.state.seen.length,0);assert.equal(f.w.document.querySelector('#class-goal').textContent,'היעד הכיתתי נשמר');f.w.showScreen('screen-teacher');assert(f.w.document.querySelector('#screen-teacher').classList.contains('active'));}finally{f.close();}
});
test('Library refresh returning false shows an actionable retry, not public fallback',async()=>{
 const f=fixture();try{f.state.refresh=async()=>false;await f.enter();const root=f.w.document.querySelector('#cc-home');assert(root.textContent.includes('ניסיון נוסף'));assert.equal(root.querySelectorAll('.cc-card').length,0);assert(!root.textContent.includes('private-a'));f.state.refresh=async()=>true;root.querySelector('button').click();await f.settle();assert.equal(root.querySelectorAll('.cc-card').length,1);assert(!root.hasAttribute('aria-busy'));}finally{f.close();}
});
test('Thrown network errors are caught and recoverable',async()=>{
 const f=fixture();try{f.state.refresh=async()=>{throw Error('offline');};await f.enter();assert(f.w.document.querySelector('#cc-home').textContent.includes('ניסיון נוסף'));await f.w.showLibrary();assert(f.w.document.querySelector('#screen-choice-library').textContent.includes('ניסיון נוסף'));assert.equal(f.state.opens.length,0);}finally{f.close();}
});
test('Late library load never navigates over the screen the user chose',async()=>{
 const f=fixture();try{await f.enter();const d=deferred();f.state.refresh=()=>d.promise;const pending=f.w.showLibrary();assert(f.w.document.querySelector('#screen-choice-library').classList.contains('active'));f.w.showScreen('screen-teacher');d.resolve(true);await pending;assert(f.w.document.querySelector('#screen-teacher').classList.contains('active'));assert(!f.w.document.querySelector('#screen-choice-library').classList.contains('active'));}finally{f.close();}
});
test('Reader switch clears old cards and preview; out-of-order responses are ignored',async()=>{
 const f=fixture();try{await f.enter();f.w.document.querySelector('#cc-home .cc-card').click();assert(f.w.document.querySelector('dialog'));const old=deferred();f.state.refresh=()=>old.promise;f.w.showScreen('screen-main');f.state.reader={clubId:'class-b',userId:'child-b'};f.state.uid='anonymous-b';f.state.catalog=[story('private-b','בָּא')];f.state.refresh=async()=>true;await f.enter();old.resolve(true);await f.settle();const root=f.w.document.querySelector('#cc-home');assert(!f.w.document.querySelector('dialog'));assert(!root.textContent.includes('private-a'));assert(root.textContent.includes('private-b'));assert.equal(f.state.opens.length,0);}finally{f.close();}
});
test('Library load hides the previous catalog immediately until refreshed',async()=>{
 const f=fixture();try{await f.enter();const d=deferred();f.state.refresh=()=>d.promise;const p=f.w.showLibrary();assert.equal(f.w.document.querySelectorAll('#screen-choice-library .cc-card').length,0);d.resolve(true);await p;assert(f.w.document.querySelectorAll('#screen-choice-library .cc-card').length>0);}finally{f.close();}
});
test('Teacher recommendation preview is not consumed; successful start consumes only its message',async()=>{
 const f=fixture();try{await f.enter();f.w.renderStoryRecommendations('class-a','child-a',[{id:'recommend-1',type:'story-recommendation',toUserId:'child-a',storyId:'private-a'},{id:'unavailable',type:'story-recommendation',toUserId:'child-a',storyId:'not-in-this-library'}],new Set());assert.equal(f.w.document.querySelectorAll('#cc-home .cc-recommend').length,1);f.w.document.querySelector('#cc-home .cc-card').click();assert.equal(f.state.seen.length,0);assert.equal(f.state.opens.length,0);await f.w.document.querySelector('dialog .cc-primary').onclick();assert.deepEqual(f.state.opens,['private-a']);assert.deepEqual(f.state.seen,[{c:'class-a',u:'child-a',ids:['recommend-1']}]);assert(f.w.document.querySelector('#screen-reader').classList.contains('active'));assert(!f.w.document.querySelector('dialog'));}finally{f.close();}
});
test('Failed recommended start does not mark a message as seen and allows retry',async()=>{
 const f=fixture();try{await f.enter();f.state.openResult=false;f.w.renderStoryRecommendations('class-a','child-a',[{id:'r1',type:'story-recommendation',toUserId:'child-a',storyId:'private-a'}],new Set());f.w.document.querySelector('#cc-home .cc-card').click();await f.w.document.querySelector('dialog .cc-primary').onclick();assert.equal(f.state.seen.length,0);assert(f.w.document.querySelector('dialog'));assert(!f.w.document.querySelector('dialog .cc-primary').disabled);}finally{f.close();}
});
test('A stale recommendation callback cannot update another child',async()=>{
 const f=fixture();try{await f.enter();f.state.reader={clubId:'class-b',userId:'child-b'};f.state.catalog=[story('private-b')];await f.enter();f.w.renderStoryRecommendations('class-a','child-a',[{id:'r1',type:'story-recommendation',toUserId:'child-a',storyId:'private-a'}],new Set());assert.equal(f.w.document.querySelectorAll('#cc-home .cc-recommend').length,0);assert(!f.w.document.querySelector('#cc-home').textContent.includes('private-a'));}finally{f.close();}
});
test('Changed app markup leaves legacy UI intact instead of partially mounting',()=>{
 const f=fixture({missingHeader:true});try{assert(!f.w.document.querySelector('#cc-home'));assert(!f.w.document.querySelector('#screen-choice-library'));assert.equal(f.w.document.head.querySelectorAll('style').length,0);}finally{f.close();}
});

test('Compact resume reuses the existing session and does not start a new story',async()=>{
 const f=fixture();try{f.state.saved={storyId:'private-a',story:f.state.catalog[0],pageIndex:2};await f.enter();const b=f.w.document.querySelector('#cc-app-resume');assert(!b.hidden);await b.onclick();assert.equal(f.state.resumes,1);assert.equal(f.state.opens.length,0);assert(f.w.document.querySelector('#screen-reader').classList.contains('active'));}finally{f.close();}
});
test('Resume is hidden when the paused story is outside the current library',async()=>{
 const f=fixture();try{f.state.saved={storyId:'other-class',story:story('other-class'),pageIndex:0};await f.enter();assert(f.w.document.querySelector('#cc-app-resume').hidden);assert.equal(f.state.resumes,0);}finally{f.close();}
});
test('A pending resume cannot follow the child into another screen or identity',async()=>{
 const f=fixture();try{f.state.saved={storyId:'private-a',story:f.state.catalog[0],pageIndex:2};await f.enter();const d=deferred();f.state.refresh=()=>d.promise;const pending=f.w.document.querySelector('#cc-app-resume').onclick();f.w.showScreen('screen-teacher');d.resolve(true);await pending;assert.equal(f.state.resumes,0);assert(f.w.document.querySelector('#screen-teacher').classList.contains('active'));}finally{f.close();}
});
