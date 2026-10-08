const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = vm.createContext({console: {warn(){}}, window: {}, Date, Intl, document:{getElementById(){return null}}});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../owner-dashboard.js'),'utf8'),ctx);
const now = Date.parse('2026-10-08T20:00:00Z');
const row = (key,id,time,type='app',minutes=2) => ({key,id,session:{type,minutes,createdAt:time}});
const records = [
 row('a','1','2026-10-07T18:00:00Z'), row('a','2','2026-10-07T19:00:00Z'),
 row('a','3','2026-10-08T18:00:00Z','booki'), row('a','3','2026-10-08T18:00:00Z','booki'),
 // UTC dates differ, but these are the same day in Israel.
 row('b','1','2026-10-06T22:00:00Z'), row('b','2','2026-10-07T01:00:00Z'),
 row('book','1','2026-10-08T18:00:00Z','book',99),
 row('old','1','2026-10-01T19:00:00Z'), row('old','2','2026-09-30T18:00:00Z'),
 row('a','future','2026-10-09T00:00:00Z'), row('a','bad','invalid'),
 row('a','expired','2026-09-23T18:00:00Z')
];
const result = JSON.parse(JSON.stringify(ctx._odWeeklyReading(records,now)));
assert.deepEqual(result,[{readers:2,returning:1,sessions:5,minutes:10},{readers:1,returning:1,sessions:2,minutes:4}]);
const values = {};
const set = (k,v) => values[k]=v;
let active=0,maxActive=0;
const calls=[];
const chain = path => ({collection(n){return chain(path+'/'+n)},doc(n){return chain(path+'/'+n)},where(field,op,date){assert.equal(field,'createdAt');assert.equal(op,'>=');assert(!Number.isNaN(Date.parse(date)));return this},async get(){calls.push(path);active++;maxActive=Math.max(maxActive,active);await Promise.resolve();active--;if(path.startsWith('/users'))throw {code:'permission-denied'};return {docs:[]}}});
ctx.window.db=chain('');
(async()=>{
 await ctx._odLoadWeeklyReading([{key:'a',clubId:'c',cardId:'a',createdByTeacher:true},{key:'b',userId:'b',createdByTeacher:false}],set);
 assert(calls.includes('/clubs/c/memberships/a/sessions'));
 assert(calls.includes('/users/b/readingSessions'));
 assert.equal(values['od-week-readers-change'],'אין השוואה מלאה');
 assert.match(values['od-week-coverage'],/נתונים חלקיים/);
 await ctx._odLoadWeeklyReading([{key:'b',userId:'b',createdByTeacher:false}],set);
 assert.equal(values['od-returning-readers'],'—');
 await ctx._odLoadWeeklyReading([],set);
 assert.equal(values['od-returning-readers'],'0');
 assert(!values['od-week-coverage'].includes('נתונים חלקיים'));
 assert(maxActive<=6);
 console.log('PASS: weekly readers, different Israel days, external books excluded, duplicate records, previous period, invalid/future records, both history sources and partial-data reporting');
})();
