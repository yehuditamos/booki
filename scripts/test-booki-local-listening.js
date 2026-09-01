const assert = require('node:assert/strict');

const readerText = {
  children: [],
  replaceChildren(...nodes) {
    this.children = nodes.filter(node => node?.nodeType !== 3);
  },
};

function createSpan() {
  return {
    nodeType: 1,
    className: '',
    dataset: {},
    textContent: '',
    classList: { toggle() {} },
  };
}

global.window = {
  addEventListener() {},
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  currentStudentData: { name: 'עומרי' },
};
global.document = {
  getElementById(id) { return id === 'reader-text' ? readerText : null; },
  querySelectorAll() { return []; },
  createTextNode(text) { return { nodeType: 3, textContent: text }; },
  createElement() { return createSpan(); },
};
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};

require('../booki-local-listening.js');

const listener = window.BookiLocalListening;

assert.equal(listener.isEnabled(), true, 'listening should remain limited to Omri');
assert.equal(listener._normalizeHebrew('בַּבֹּקֶר!'), 'בבקר');
assert.ok(listener._wordScore('בבוקר', 'בַּבֹּקֶר') > 0.9,
  'full and defective Hebrew spelling should match');
assert.ok(listener._wordScore('לגינה', 'לַגִּנָּה') > 0.9,
  'niqqud differences should not block a word');

listener.render('בַּבֹּקֶר נֹעַם יָצָא לַגִּנָּה');
assert.deepEqual(listener._snapshotForTest().confirmed, []);
listener._applyTranscriptForTest('בבוקר נועם');
assert.deepEqual(listener._snapshotForTest().confirmed, [0, 1],
  'only words actually recognized from the page should be confirmed');
listener._applyTranscriptForTest('יצא לגינה');
assert.deepEqual(listener._snapshotForTest().confirmed, [0, 1, 2, 3]);

listener.render('חתול רץ מהר');
listener._applyTranscriptForTest('חדשות מזג האוויר');
assert.deepEqual(listener._snapshotForTest().confirmed, [],
  'unrelated room speech must not advance the reading');

console.log('booki word-recognition listener: all tests passed');
