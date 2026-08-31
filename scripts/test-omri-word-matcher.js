'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Matcher = require('../omri-word-matcher.js');

const TEXT = 'בַּבֹּקֶר נֹעַם יָצָא לַגִּנָּה. הוּא רָאָה פַּרְפַּר כָּחֹל עָף מֵעַל הַפְּרָחִים. נֹעַם עָמַד בְּשֶׁקֶט וְחִכָּה שֶׁהַפַּרְפַּר יִתְקָרֵב.';

test('removes niqqud and punctuation while matching', () => {
  const matcher = new Matcher(TEXT);
  matcher.applyTranscript('בבוקר נועם יצא לגינה');
  assert.deepEqual([...matcher.confirmed], [0,1,2,3]);
});

test('repetition does not break progress', () => {
  const matcher = new Matcher(TEXT);
  matcher.applyTranscript('בבוקר בבוקר נועם יצא');
  assert.equal(matcher.confirmed.has(0), true);
  assert.equal(matcher.confirmed.has(2), true);
});

test('a skipped word does not lose synchronization', () => {
  const matcher = new Matcher(TEXT);
  matcher.applyTranscript('בבוקר יצא לגינה הוא ראה');
  assert.equal(matcher.confirmed.has(1), false);
  assert.equal(matcher.confirmed.has(5), true);
});

test('self-correction can confirm a missed word later', () => {
  const matcher = new Matcher(TEXT);
  matcher.applyTranscript('בבוקר יצא לגינה');
  matcher.applyTranscript('נועם');
  assert.equal(matcher.confirmed.has(1), true);
});

test('complete ordered transcript confirms the full text', () => {
  const matcher = new Matcher(TEXT);
  matcher.applyTranscript('בבוקר נועם יצא לגינה הוא ראה פרפר כחול עף מעל הפרחים נועם עמד בשקט וחיכה שהפרפר יתקרב');
  assert.equal(matcher.complete, true);
});

test('strict mode ignores a single background word', () => {
  const matcher = new Matcher(TEXT, { minEvidenceWords:2 });
  matcher.applyTranscript('נועם');
  assert.equal(matcher.confirmed.size, 0);
});

test('strict mode accepts two adjacent words from the reading', () => {
  const matcher = new Matcher(TEXT, { minEvidenceWords:2 });
  matcher.applyTranscript('בבוקר נועם');
  assert.deepEqual([...matcher.confirmed], [0,1]);
});

test('owned mode can finish without jumping back to an ASR miss', () => {
  const matcher = new Matcher('א ב ג ד ה', {
    minEvidenceWords:2,
    finishOnFinalWord:true,
    currentFromAnchor:true,
  });
  matcher.applyTranscript('א ב');
  assert.equal(matcher.nextUnconfirmed(), 2);
  matcher.applyTranscript('ד ה');
  assert.equal(matcher.confirmed.has(2), false);
  assert.equal(matcher.nextUnconfirmed(), 5);
  assert.equal(matcher.complete, true);
});
