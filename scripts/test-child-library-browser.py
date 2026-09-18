import re,json,os,pathlib,base64
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(os.environ.get('BOOKI_QA_DIR','verification'));OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'index.html').read_text()
html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S|re.I)
scripts=re.findall(r'<script src="(content/stories[^"?]+\.js)',(ROOT/'index.html').read_text())
STUB=r'''(() => {
 const qa=window.qa={mode:'public',reader:{clubId:'test-class',userId:'test-child'},auth:{uid:'test-auth',isAnonymous:true},callbacks:[],events:[],writes:[],reads:[],seen:[],goals:[],fail:false,delay:0,docs:new Map()};
 window.firebase={auth:()=>({currentUser:qa.auth,onAuthStateChanged:f=>{qa.callbacks.push(f);return ()=>{};}})};
 window.getActiveReader=()=>qa.reader;
 window.goReaderHome=()=>showScreen('screen-main');
 window.track=(event,data)=>qa.events.push({event,data});
 window.stripNiqud=s=>String(s||'').replace(/[\u0591-\u05C7]/g,'');
 window.fbMarkMessagesSeen=async(c,u,ids)=>{qa.seen.push({c,u,ids});return true;};
 window.evaluateGoalProgress=async id=>qa.goals.push(id);
 const clone=v=>JSON.parse(JSON.stringify(v));
 qa.docs.set('clubs/test-class/memberships/test-child',{claimedByUid:'test-auth',createdByTeacher:true,status:'active',cachedStats:{}});
 qa.docs.set('clubs/test-class/economy/wallet',{balance:0,lifetimeEarned:0});
 const snap=p=>({exists:qa.docs.has(p),data:()=>clone(qa.docs.get(p))});
 const ref=p=>({path:p,collection:n=>ref(p+'/'+n),doc:n=>ref(p+'/'+n),where:()=>ref(p),get:async()=>{
  qa.reads.push(p);if(qa.delay)await new Promise(r=>setTimeout(r,qa.delay));if(qa.fail)throw Error('network test');
  if(/^clubs\/[^/]+$/.test(p))return {exists:true,data:()=>({libraryMode:qa.mode,teacherUid:'test-teacher'})};
  if(p==='teacherLibraries/test-teacher/stories')return {docs:[{id:'story-a',data:()=>({title:'סיפור הכיתה לבדיקה',text:'אָב\n\nבָּא',status:'published'})}]};
  return snap(p);
 },set:async v=>{qa.writes.push(p);qa.docs.set(p,clone(v));}});
 window.db={collection:n=>ref(n),runTransaction:async fn=>{
  const writes=[];const result=await fn({get:async r=>snap(r.path),set:(r,v)=>writes.push([r.path,clone(v)]),update:(r,v)=>writes.push([r.path,{...qa.docs.get(r.path),...clone(v)}])});
  if(qa.fail)throw Error('network test');for(const [p,v] of writes){qa.docs.set(p,v);qa.writes.push(p);}return result;
 }};
 window.currentClubId='test-class';window.confirm=()=>true;window.alert=s=>qa.events.push({alert:s});
})();'''
# Offline harness: embed local styles/images; no HTTP requests or account data.
for m in list(re.finditer(r'<link[^>]+rel="stylesheet"[^>]*>',html)):
 href=re.search(r'href="([^"]+)"',m[0])
 f=ROOT/href[1].split('?')[0] if href and not href[1].startswith('http') else None
 html=html.replace(m[0],'<style>'+f.read_text()+'</style>' if f and f.exists() else '')
html=re.sub(r'<link[^>]*>','',html)
report=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('BOOKI_CHROME','/usr/bin/chromium'),args=['--no-sandbox'])
 def fresh(width=390):
  ctx=browser.new_context(viewport={'width':width,'height':900},reduced_motion='reduce')
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('**/*',lambda r:r.fulfill(status=200,body=''));page.set_content(html);page.evaluate('''() => { const store=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear()}}); }''');page.evaluate(STUB)
  for f in scripts+['stories.js','private-library.js','script.js','story-recommendations.js','pilot-reading-save-2026-09-10.js','pilot-reading-overrides-2026-09-10.js','child-choice.js','child-library-topics.js','child-library.js']:
   page.add_script_tag(content=(ROOT/f).read_text())
  page.evaluate("initCurrentStudent('test-child',{id:'test-child',name:'קורא בדיקה',history:[]});showScreen('screen-main');")
  page.evaluate('(uri)=>{window.__qaMascot=uri;}', 'data:image/png;base64,'+base64.b64encode((ROOT/'assets/booki/core/states/booki-welcome.png').read_bytes()).decode())
  return ctx,page,errors
 for width in [320,390,1280]:
  ctx,p,errs=fresh(width);p.evaluate('showLibrary()');p.locator('#booki-child-library .folder').first.wait_for()
  assert p.locator('#booki-child-library .folder').count()==6
  bounds=p.locator('#booki-child-library .folder').evaluate_all("ns=>ns.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,tab:getComputedStyle(n,'::before').display,radius:getComputedStyle(n).borderRadius,dots:[...n.querySelectorAll('.folder-format-dot')].map(d=>({bg:getComputedStyle(d).backgroundColor,w:d.getBoundingClientRect().width}))}})")
  assert all(x['left']>=0 and x['right']<=width and x['tab']=='none' and x['radius']=='24px' and x['dots'] for x in bounds),bounds
  p.evaluate("document.querySelector('.mascot').src=window.__qaMascot");p.screenshot(path=str(OUT/f'live-library-{width}.png'),full_page=True)
  p.locator('[data-folder="friends"]').click();assert p.locator('.shelf-view .cc-browse .cc-card').count()>0
  p.locator('.shelf-view .cc-browse .cc-card').first.click();assert p.locator('dialog.cc-dialog').is_visible()
  assert p.evaluate('qa.events.length')==0
  p.locator('dialog .cc-primary').click();p.wait_for_function("document.getElementById('screen-reader').classList.contains('active')")
  assert p.locator('#reader-text').inner_text().strip()
  p.evaluate("chooseStoryNiqudMode('full');nextPage();pauseAppStory();")
  assert p.evaluate("_loadPausedAppStory().pageIndex") == 1
  p.evaluate('enterAppStoryReading()');assert p.evaluate('currentPageIndex')==1
  # Real native completion + atomic transaction code, against isolated in-memory test DB only.
  p.evaluate('finishAppReading()')
  stats=p.evaluate("qa.docs.get('clubs/test-class/memberships/test-child').cachedStats")
  assert stats['totalMinutes']>=1 and stats['totalPoints']>=1
  assert p.evaluate("qa.docs.get('clubs/test-class/economy/wallet').balance")==stats['totalPoints']
  assert p.evaluate("qa.goals.includes('test-class')")
  assert not errs,errs
  report.append({'width':width,'public_ui':'passed','preview_no_reading':'passed','native_start_pause_resume_completion_wallet_goal':'passed','bounds':bounds});ctx.close()
 ctx,p,errs=fresh()
 for mode,n in [('private',1),('both',7),('public',6)]:
  p.evaluate('(mode)=>{qa.mode=mode;}',mode);p.evaluate('showLibrary()')
  assert p.locator('#booki-child-library .folder').count()==n,(mode,p.locator('#booki-child-library').inner_text())
  private=p.locator('[data-folder="teacher-private"]')
  if mode!='public':
   private.click();assert p.locator('.shelf-view .cc-browse .cc-card').count()==1
   assert 'סיפור הכיתה לבדיקה' in p.locator('.shelf-view').inner_text()
  elif mode=='public':assert private.count()==0
 report.append({'actual_private_library_module':'public/private/both passed'})
 # Broken refresh must fail closed, retry recovers without stale private text.
 p.evaluate("qa.fail=true;showLibrary()");assert 'ניסיון נוסף' in p.locator('#booki-child-library').inner_text();assert p.locator('#booki-child-library .folder').count()==0
 p.evaluate('qa.fail=false');p.locator('#booki-child-library button',has_text='ניסיון נוסף').click();p.locator('.folder').first.wait_for()
 # A late catalog reply cannot pull the reader back from another screen.
 p.evaluate("qa.delay=150;showLibrary();showScreen('screen-main');");p.wait_for_timeout(200)
 assert p.evaluate("document.getElementById('screen-main').classList.contains('active')")
 # A late start after the child leaves a preview is cancelled, without analytics or reading writes.
 p.evaluate('qa.delay=0;showLibrary()');p.locator('[data-folder="friends"]').click();p.locator('.cc-browse .cc-card').first.click()
 p.evaluate("qa.delay=150;qa.events=[];document.querySelector('dialog .cc-primary').click();showScreen('screen-main');");p.wait_for_timeout(250)
 assert p.evaluate('qa.events.length')==0 and p.evaluate("document.getElementById('screen-main').classList.contains('active')")
 # Identity change in flight cancels both catalog and reading openings.
 p.evaluate("qa.delay=150;showLibrary();qa.reader={clubId:'other-class',userId:'other-child'};");p.wait_for_timeout(250)
 assert p.locator('#booki-child-library .folder').count()==0
 p.evaluate("qa.delay=0;qa.reader={clubId:'test-class',userId:'test-child'};qa.auth={uid:'teacher',isAnonymous:false};showScreen('screen-teacher-dashboard');")
 assert not p.evaluate('BookiChildLibrary.canUse()') and p.locator('#booki-child-library').inner_text()==''
 report.append({'network_retry_navigation_identity_teacher':'passed'})
 assert not errs,errs
 ctx.close();browser.close()
(OUT/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('PASS: native app DOM + reading functions, public/private/both, start/pause/resume/save/wallet/goal, cancelled loads, 320/390/1280px')
