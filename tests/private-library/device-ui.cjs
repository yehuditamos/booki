'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
const w = dom.window;
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
let request, listener, stopCount = 0, entered = 0, rejectWrite = false, confirmResult = false, writes = [];
const requestRef = { id: 'request-ABC123', set: async value => { if (rejectWrite) throw Error('offline'); request = value; }, onSnapshot: callback => { listener = callback; return () => stopCount++; } };
const cardRef = { get: async () => ({ data: () => ({ name: '<img src=x onerror=alert(1)>', createdByTeacher: true }) }) };
const requestDoc = { id: requestRef.id, ref: requestRef, data: () => request };
w.currentClubId = 'class';
w.firebase = { auth: () => ({ currentUser: { uid: 'new-device' } }) };
w.alert = () => {}; w.confirm = () => confirmResult;
w.selectProfile = async (card, club) => { assert.equal(card, 'card'); assert.equal(club, 'class'); entered++; };
w.db = { collection: name => name === 'deviceAccessRequests'
  ? { doc: () => requestRef, where: () => ({ get: async () => ({ docs: [requestDoc] }) }) }
  : { doc: () => ({ collection: () => ({ doc: () => cardRef }) }) },
  runTransaction: async callback => callback({ get: async ref => ref === requestRef
    ? { data: () => request } : { exists: true, data: () => ({ status: 'active', createdByTeacher: true }) },
    update: (ref, value) => writes.push([ref, value]) }) };
w.eval(fs.readFileSync(__dirname + '/../../device-access.js', 'utf8'));
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  await w.bookiRequestDeviceAccess('class', 'card', '<script>bad</script>');
  assert.equal(w.document.querySelector('script'), null);
  const ask = [...w.document.querySelectorAll('button')].find(b => b.textContent === 'בקשת אישור מהמורה');
  await ask.onclick(); assert.equal(request.requesterUid, 'new-device'); assert.equal(request.status, 'pending');
  assert(w.document.body.textContent.includes('ABC123')); assert.equal(writes.length, 0);
  listener({ data: () => ({ status: 'approved' }) }); await tick(); assert.equal(entered, 1); assert(stopCount > 0);
  await w.bookiReviewDeviceAccess();
  assert.equal(w.document.querySelector('img'), null);
  const approve = [...w.document.querySelectorAll('button')].find(b => b.textContent === 'אישור');
  await approve.onclick(); assert.equal(writes.length, 0);
  confirmResult = true; await approve.onclick(); assert.equal(writes.length, 2);
  assert.equal(writes[0][1].claimedByUid, 'new-device'); assert.equal(writes[1][1].status, 'approved');
  w.document.querySelector('dialog').close(); rejectWrite = true;
  await w.bookiRequestDeviceAccess('class', 'card', 'Child');
  await [...w.document.querySelectorAll('button')].find(b => b.textContent === 'בקשת אישור מהמורה').onclick();
  assert(w.document.body.textContent.includes('הבקשה לא נשלחה')); assert.equal(entered, 1);
  console.log('PASS: device request, approval confirmation, preserved card identity, denied network request, safe rendering.');
  w.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
