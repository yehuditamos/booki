const assert = require('node:assert/strict');
const reader = {textContent:''}, panel = {hidden:false,style:{}};
let microphoneRequests = 0;
global.window = {BookiBasicConsentReady:Promise.resolve(),currentStudentData:{name:'עומרי'}};
global.document = {getElementById:id=>id==='reader-text'?reader:id==='booki-local-listening'?panel:null};
Object.defineProperty(global,'navigator',{value:{mediaDevices:{getUserMedia(){microphoneRequests++;throw Error('Microphone must remain disabled');}}},configurable:true});
require('../booki-local-listening.js');
const listener=window.BookiLocalListening;
assert.equal(listener.isEnabled(),true); // opt-in control is available to active child readers
listener.start();listener.render('בַּבֹּקֶר נֹעַם יָצָא');listener.stop();
assert.equal(reader.textContent,'בַּבֹּקֶר נֹעַם יָצָא');
assert.equal(panel.hidden,true);assert.equal(panel.style.display,'none');
assert.equal(microphoneRequests,0);
console.log('Opt-in reading release: no microphone before explicit tap, reading text preserved: PASS');
