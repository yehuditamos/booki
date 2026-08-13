#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({
  console,
  Date,
  Number,
  Math,
  Set,
  window: { addEventListener: () => {} },
  document: { visibilityState: 'visible', addEventListener: () => {}, getElementById: () => null },
  currentStudentId: 'test-user',
  defaultStudent: id => ({ id, totalMinutes: 0, appMinutes: 0, bookMinutes: 0, points: 0, storiesRead: 0, history: [] }),
  localStorage: { getItem: () => null, removeItem: () => {} },
});

function section(file, start, end) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.notEqual(from, -1, `missing start marker in ${file}`);
  assert.notEqual(to, -1, `missing end marker in ${file}`);
  return source.slice(from, to);
}

vm.runInContext(section('script.js', 'const _readingCompletionLocks', '/**\n * Bridge'), context);
vm.runInContext(section('booki-reading.js', 'const _BOOKI_MAX_SESSION_MINUTES', 'function _setBookiBubble'), context);

assert.equal(vm.runInContext('_safeReadingNumber("12")', context), 12);
assert.equal(vm.runInContext('_safeReadingNumber("bad", 5)', context), 5);
assert.equal(vm.runInContext('_safeReadingNumber(-1, 7)', context), 7);

vm.runInContext('var normalized = _normalizeStudentReadingStats({ totalMinutes:"35", appMinutes:null, points:"8", history:null })', context);
assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(normalized)', context)), {
  totalMinutes: 35,
  appMinutes: 0,
  bookMinutes: 0,
  points: 8,
  storiesRead: 0,
  history: [],
});

assert.equal(vm.runInContext('_beginReadingCompletion("same")', context), true);
assert.equal(vm.runInContext('_beginReadingCompletion("same")', context), false);
vm.runInContext('_endReadingCompletion("same")', context);
assert.equal(vm.runInContext('_beginReadingCompletion("same")', context), true);

// סיפור באפליקציה: זמן אמיתי פעיל, מינימום דקה ותקרה קשיחה.
assert.equal(vm.runInContext('_getAppStoryElapsedMinutes({activeMs:10 * 60000,activeSince:null})', context), 10);
assert.equal(vm.runInContext('_getAppStoryElapsedMinutes({activeMs:20 * 1000,activeSince:null})', context), 1);
assert.equal(vm.runInContext('_getAppStoryElapsedMinutes({activeMs:3558 * 60000,activeSince:null})', context), 90);
vm.runInContext('_appStoryTimer={storyId:"x",activeMs:60000,activeSince:1000}; _setAppStoryTimerRunning(false,121000)', context);
assert.equal(vm.runInContext('_appStoryTimer.activeMs', context), 180000);
assert.equal(vm.runInContext('_appStoryTimer.activeSince', context), null);

const now = Date.now();
assert.equal(vm.runInContext(`_getBookiElapsedMinutes({startedAt:${now - 7 * 60000}}, ${now})`, context), 7);
// נעילה/רקע משתמשים בזמן הקיר, אבל התקרה הקשיחה לעולם לא מאפשרת אלפי דקות.
assert.equal(vm.runInContext(`_getBookiElapsedMinutes({startedAt:${now - 120 * 60000}}, ${now})`, context), 90);
assert.equal(vm.runInContext(`_getBookiElapsedMinutes({startedAt:${now - 3558 * 60000}}, ${now})`, context), 90);
assert.equal(vm.runInContext(`_getBookiElapsedMinutes({startedAt:"bad"}, ${now})`, context), null);

console.log('reading safety tests: PASS');
