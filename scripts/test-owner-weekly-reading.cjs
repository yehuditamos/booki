const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx=vm.createContext({console,window:{},Date,Intl,document:{getElementById(){return null}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../owner-dashboard.js'),'utf8'),ctx);
const now=Date.parse('2026-10-10T17:00:00Z');
const events={reading_completed_2026_10_04:120,reading_completed_2026_10_10:45,app_open_2026_10_04:300,app_open_2026_10_10:90,app_open_il_2026_10_10:2};
const days=JSON.parse(JSON.stringify(ctx._odDailyActivity(events,now)));
assert.equal(days.length,7);assert.equal(days[0].date,'2026-10-04');assert.equal(days[6].date,'2026-10-10');
assert.equal(days[0].sessions,120);assert.equal(days[0].opens,300);assert.equal(days[6].sessions,45);assert.equal(days[6].opens,90);
assert.equal(days[1].sessions,0);assert(days[6].today);
const mid=ctx._odDailyActivity(events,Date.parse('2026-10-07T12:00:00Z'));
assert(mid[4].future);assert.equal(mid[4].sessions,null);assert.equal(mid[4].opens,null);
const sunday=ctx._odDailyActivity({},Date.parse('2026-10-11T00:00:00Z'));
assert.equal(sunday[0].date,'2026-10-11');assert(sunday[0].today);
// All teachers and all clubs count, including inactive teachers and hidden clubs.
const totals=ctx._odSystemTotals([{id:'new',lastLoginAt:'2026-10-10'},{id:'old',lastLoginAt:'2025-01-01'}],[{memberCount:4},{memberCount:9,hidden:true},{memberCount:0}]);
assert.equal(totals.teachers,2);assert.equal(totals.students,13);
const records={
 current:[{id:'a',data:()=>({name:'A',userId:'a',cachedStats:{totalMinutes:20,lastReadAt:new Date().toISOString()}})},{id:'left',data:()=>({name:'L',status:'left',cachedStats:{totalMinutes:5}})},{id:'empty',data:()=>({name:'כרטיס פנוי 1',cachedStats:{totalMinutes:500}})}],
 hidden:[{id:'b',data:()=>({name:'B',cachedStats:{totalMinutes:40,lastReadAt:new Date().toISOString()}})}],
 other:[{id:'a',data:()=>({name:'A',userId:'a',cachedStats:{totalMinutes:20}})}]
};
ctx.window.db={collection:()=>({doc:id=>({collection:()=>({get:async()=>({docs:records[id]})})})})};
(async()=>{
 const values={};await ctx._odLoadVerifiedReadingPulse([{id:'current'},{id:'hidden',hidden:true},{id:'other'}],(k,v)=>values[k]=v,events);
 assert.equal(values['od-total-minutes'],'65');assert.equal(values['od-wau'],'1');assert(!('od-total-students' in values));
 console.log('PASS: global daily session/open counters, Sunday-Saturday boundaries, future days, all teachers/students, and lifetime minutes including hidden/left cards without duplicate totals');
})().catch(e=>{console.error(e);process.exitCode=1});
