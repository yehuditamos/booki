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

const now = Date.now();
assert.equal(vm.runInContext(`_getBookiElapsedMinutes({activeMs: 7 * 60000, activeSince:null}, ${now})`, context), 7);
assert.equal(vm.runInContext(`_getBookiElapsedMinutes({activeMs: 2 * 60000, activeSince:${now - 5 * 60000}}, ${now})`, context), 7);
assert.equal(vm.runInContext(`_getBookiElapsedMinutes({activeMs: 3558 * 60000, activeSince:null}, ${now})`, context), null);
// זמן קיר שחלף כשהסשן מושהה אינו נספר כלל.
assert.equal(vm.runInContext(`_getBookiElapsedMinutes({startedAt:${now - 60 * 60000}, activeMs: 3 * 60000, activeSince:null}, ${now})`, context), 3);

console.log('reading safety tests: PASS');
