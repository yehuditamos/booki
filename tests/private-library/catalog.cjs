const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const w=new JSDOM('<div id="library-category-grid"></div>',{runScripts:'outside-only'}).window;
let user={uid:'child',isAnonymous:true},reader={clubId:'c1',userId:'card'},mode='private',reject=false,grants=[],docs=[{id:'s1',data:()=>({title:'אב',text:'אָב בָּא.\n\nבוקר טוב',status:'published'})}];
w.firebase={auth:()=>({currentUser:user})};w.getActiveReader=()=>reader;
w.db={collection: name=>({doc: uid=>({
 get:async()=>{if(reject)throw Error('offline');return {exists:true,data:()=>({teacherUid:'t1',libraryMode:mode})}},
 collection:sub=>({doc:id=>({set:async data=>{grants.push({uid,id,data})}}),where:()=>({get:async()=>({docs})})})
})})};
w.eval(fs.readFileSync(__dirname+'/../../private-library.js','utf8'));const lib=w.BookiPrivateLibrary;
(async()=>{
 const publicStories=[{id:'public'}];assert.equal(lib.visible(publicStories).length,0);
 assert(await lib.prepare('c1','card'));assert.equal(grants[0].uid,'t1');assert.equal(grants[0].id,'child');assert.equal(lib.visible(publicStories)[0].id,'private_t1_s1');assert.equal(lib.visible(publicStories)[0].pages.length,2);
 assert.throws(()=>lib.validate('<script>','text'));assert.throws(()=>lib.validate('title',''));assert.equal(lib.validate('אב','אָב').text,'אָב');
 reader={clubId:'c2',userId:'card2'};assert.equal(lib.visible(publicStories).length,0);
 reject=true;assert.equal(await lib.prepare('c2','card2'),false);assert.equal(lib.visible(publicStories).length,0);
 reject=false;mode='public';assert(await lib.prepare('c2','card2'));assert.equal(lib.visible(publicStories)[0].id,'public');
 user={uid:'teacher',isAnonymous:false};assert.equal(lib.visible(publicStories)[0].id,'public');
 user={uid:'child',isAnonymous:true};reader={clubId:null};assert.equal(lib.privateCategories(),false);
 console.log('PASS private catalog, account ownership, switch isolation, offline fail-closed, public/standalone compatibility, plain text validation, niqqud preservation, pagination');
})().catch(e=>{console.error(e);process.exitCode=1});
