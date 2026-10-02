'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const routing = fs.readFileSync('routing.js', 'utf8');
const from = routing.indexOf('async function routeOnLoad()');
const to = routing.indexOf('/** חזרה למסך הבית */', from);
assert(from >= 0 && to > from);
const setup = search => {
  const calls = [];
  const context = vm.createContext({ URLSearchParams, console,
    window: { location: { search }, currentClubId: 'previous-class' },
    _activeClubId: 'previous-class', setNavVisible: () => {},
    goToTeacherArea: update => calls.push(['teacher', update]),
    showJoinClubDirect: club => calls.push(['club', club]),
    showJoinClubWithCode: code => calls.push(['join', code]),
    clearActiveReader: () => calls.push(['clear-reader']),
    localStorage: { getItem: () => { throw Error('Explicit links cannot use remembered routes'); } },
  });
  vm.runInContext(routing.slice(from, to), context);
  return { context, calls };
};
(async () => {
  for (const query of ['?teacher=1', '?teacher=1&club=old', '?join=old&teacher=1', '?installed=1&teacher=1&club=old']) {
    const { context, calls } = setup(query);
    await context.routeOnLoad();
    assert.deepEqual(calls, [['teacher', true]]);
    assert.equal(context.window.currentClubId, null);
    assert.equal(context._activeClubId, null);
  }
  for (const [query, expected] of [['?club=class', [['clear-reader'], ['club', 'class']]], ['?join=CODE', [['join', 'CODE']]]]) {
    const { context, calls } = setup(query); await context.routeOnLoad(); assert.deepEqual(calls, expected);
  }
  const source = fs.readFileSync('script.js', 'utf8');
  const start = source.indexOf('    onTeacherAuthChange(teacher => {');
  const end = source.indexOf('    });', start) + '    });'.length;
  assert(start >= 0 && end > start);
  for (const teacher of [null, { uid: 'existing-teacher' }]) {
    for (const query of ['?teacher=1&club=old', '?club=class', '?join=CODE']) {
      const calls = [];
      vm.runInNewContext(source.slice(start, end), { URLSearchParams,
        window: { location: { search: query } }, onTeacherAuthChange: cb => cb(teacher),
        routeOnLoad: () => calls.push('route'), showTeacherDashboard: () => calls.push('dashboard'),
      });
      assert.deepEqual(calls, ['route']);
    }
  }
  assert(fs.readFileSync('teacher.html', 'utf8').includes("location.replace('./index.html?teacher=1&release=20261002-entry')"));
  console.log('PASS: management links ignore old class/reader state; child links remain child entry even with a teacher session; management alias has one canonical destination.');
})().catch(error => { console.error(error); process.exitCode = 1; });
