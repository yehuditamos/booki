const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('assert/strict');
const w=new JSDOM('<dialog id="parent"></dialog>',{runScripts:'outside-only'}).window;
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new w.Event('close'))};
w.eval(fs.readFileSync(__dirname+'/../../story-photo.js','utf8'));
const parent=w.document.querySelector('dialog');
let revoked=0,draws=[];w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>revoked++;
w.Image=class{constructor(){this.naturalWidth=1000;this.naturalHeight=2000;}set src(v){Promise.resolve().then(()=>this.onload());}};
w.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},fillRect(){},strokeRect(){},drawImage(...args){draws.push(args)}});w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,test';w.HTMLCanvasElement.prototype.setPointerCapture=function(){};w.HTMLCanvasElement.prototype.getBoundingClientRect=function(){return {left:0,top:0,width:this.width,height:this.height}};
(async()=>{
 let promise=w.BookiStoryPhoto.review('אָב 10103WD',parent,30);let d=w.document.querySelector('.story-photo-dialog');assert(d.textContent.includes('אינו ברור'));d.querySelector('textarea').value='אָב בָּא';d.querySelector('button').click();assert.equal(await promise,'אָב בָּא');assert.equal(w.document.querySelector('.story-photo-dialog'),null);
 promise=w.BookiStoryPhoto.review('אב',parent,90);d=w.document.querySelector('.story-photo-dialog');d.querySelectorAll('button')[1].click();assert.equal(await promise,null);
 promise=w.BookiStoryPhoto.review('אב',parent,90);parent.close();assert.equal(await promise,null);assert.equal(w.document.querySelector('.story-photo-dialog'),null);
 promise=w.BookiStoryPhoto.crop({},parent);await new Promise(r=>setTimeout(r,0));d=w.document.querySelector('.story-photo-dialog');const canvas=d.querySelector('canvas');canvas.onpointerdown({clientX:50,clientY:100,pointerId:1});canvas.onpointermove({clientX:300,clientY:700});canvas.onpointerup();d.querySelector('button').click();assert.equal(await promise,'data:image/png;base64,test');assert.equal(revoked,1);const last=draws.at(-1);assert(last[1]>0&&last[2]>0&&last[3]<1000&&last[4]<2000);
 console.log('PASS OCR review: low-quality warning, corrected niqqud retained, explicit approval, cancel and parent-close cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
