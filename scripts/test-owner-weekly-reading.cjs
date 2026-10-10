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
const week = JSON.parse(JSON.stringify(ctx._odDailyWeek(records,{app_open_2026_10_07:11,app_open_il_2026_10_08:7},now)));
assert.equal(week.length,7);
assert.equal(week[0].date,'2026-10-04');assert.equal(week[6].date,'2026-10-10');
assert.equal(week[3].readers,2);assert.equal(week[3].sessions,4);assert.equal(week[3].opens,11);assert(week[3].legacyOpens);
assert.equal(week[4].readers,1);assert.equal(week[4].sessions,1);assert.equal(week[4].opens,7);assert(!week[4].legacyOpens);
assert(week[5].future);assert.equal(week[5].opens,null);
const sunday=ctx._odDailyWeek([],{},Date.parse('2026-10-10T21:30:00Z'));
assert.equal(sunday[0].date,'2026-10-11');assert(sunday[0].today);
const winter=ctx._odDailyWeek([],{},Date.parse('2026-10-31T22:30:00Z'));
assert.equal(winter[0].date,'2026-11-01');
assert.equal(ctx._odActiveTeacherCount([
 {id:'one',role:'teacher',lastLoginAt:'2026-10-07T12:00:00Z'},
 {id:'one',role:'teacher',lastLoginAt:'2026-10-07T12:00:00Z'},
 {id:'owner',role:'owner',lastLoginAt:'2026-10-07T12:00:00Z'},
 {id:'old',role:'teacher',lastLoginAt:'2026-08-01T12:00:00Z'},
 {id:'new',role:'teacher',createdAt:'2026-10-07T12:00:00Z'},
 {id:'future',role:'teacher',lastLoginAt:'2026-12-01T12:00:00Z'}
],now),1);
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
 assert.match(values['od-week-coverage'],/נתונים חלקיים/);
 await ctx._odLoadWeeklyReading([{key:'b',userId:'b',createdByTeacher:false}],set);
 assert.match(values['od-week-coverage'],/נתונים חלקיים/);
 await ctx._odLoadWeeklyReading([],set);
 assert(!values['od-week-coverage'].includes('נתונים חלקיים'));
 assert(!values['od-week-coverage'].includes('נתונים חלקיים'));
 assert(maxActive<=6);
 const writes=[];
 const FixedDate=class extends Date {constructor(...args){super(...(args.length?args:['2026-10-10T22:30:00Z']));}};
 const analytics=vm.createContext({console,Date:FixedDate,Intl,window:{db:{collection:()=>({doc:id=>({set:async data=>{writes.push({id,data});}})})}}});
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../analytics.js'),'utf8'),analytics);
 await analytics.track('app_open');
 assert(writes.some(x=>x.data.app_open_2026_10_10===1));
 assert(writes.some(x=>x.data.app_open_il_2026_10_11===1));
 console.log('PASS: daily unique readers, duplicate records, app/booki vs external books, Israel week and DST boundaries, teacher activity, both history sources, partial data, and local/legacy open tracking');
})();
