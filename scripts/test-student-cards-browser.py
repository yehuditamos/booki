"""Visual/interaction regression for native student cards. Synthetic data only; no network or DB writes."""
import base64, json, os, pathlib, re
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(os.environ.get('BOOKI_QA_DIR','verification/student-cards'))
OUT.mkdir(parents=True,exist_ok=True)
html=re.sub(r'<script\b[^>]*>.*?</script>','',(ROOT/'index.html').read_text(),flags=re.S|re.I)
for m in list(re.finditer(r'<link[^>]+rel="stylesheet"[^>]*>',html)):
    href=re.search(r'href="([^"]+)"',m[0])
    file=ROOT/href[1].split('?')[0] if href and not href[1].startswith('http') else None
    html=html.replace(m[0],'<style>'+file.read_text()+'</style>' if file and file.exists() else '')
html=re.sub(r'<link[^>]*>','',html)
STUB=r'''(() => {
 const qa=window.qa={teacher:null,calls:[],saved:[],members:[
  {userId:'qa-1',name:'נועה לוי',emoji:'🦊',status:'active',cardNumber:1,claimedByUid:'qa-auth-1'},
  {userId:'qa-2',name:'איתי כהן',emoji:'🚀',status:'active',cardNumber:2,claimedByUid:'qa-auth-2'},
  {userId:'qa-3',name:'מאיה ישראלי',emoji:'🦋',status:'active',cardNumber:3},
  {userId:'qa-4',name:'אדם אור',emoji:'🦁',status:'active',cardNumber:4},
  {userId:'qa-5',name:'תמר רוזן',emoji:'🌻',status:'active',cardNumber:5},
  {userId:'qa-open',name:'כרטיס פנוי 06',status:'active',cardNumber:6},
  {userId:'qa-left',name:'לא להצגה',emoji:'📚',status:'left'}
 ]};
 const store=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear()}});
 window.getCurrentTeacher=()=>qa.teacher;
 window.firebase={auth:()=>({currentUser:qa.teacher?{uid:qa.teacher.uid,isAnonymous:false}:{uid:'qa-device',isAnonymous:true}})};
 window.showScreen=id=>{document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id===id));};
 window.setNavVisible=()=>{};
 window.fbLoadClub=async()=>({name:'כיתת הדגמה',emoji:'📚',studentCount:6});
 window.fbLoadClubMemberships=async()=>structuredClone(qa.members);
 const ref=p=>({collection:n=>ref(p+'/'+n),doc:n=>ref(p+'/'+n),get:async()=>{
  if(p.endsWith('/memberships'))return {docs:qa.members.map(m=>({id:m.userId,data:()=>structuredClone(m)}))};
  if(p==='users/qa-renamed/profile/main')return {exists:true,data:()=>({name:'רוני לביא'})};
  const member=qa.members.find(m=>p.endsWith('/memberships/'+m.userId));
  return {exists:true,data:()=>structuredClone(member||{studentCount:6})};
 },set:()=>{throw Error('Unexpected database write')},update:()=>{throw Error('Unexpected database write')}});
 window.db={collection:n=>ref(n)};
 window.selectProfile=async(id,clubId)=>qa.calls.push({id,clubId});
 window.showCreateClub=()=>showScreen('screen-create-members');
 window._newClub={members:[]};window.goToReview=()=>{qa.review=structuredClone(_newClub.members);};
 window.BookiRosterStore={capacity:()=>6,save:async(id,data,uid)=>{qa.saved.push({id,data,uid});return {total:Number(data.target)};}};
 window.alert=message=>qa.calls.push({alert:message});
})();'''
REPORT=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('BOOKI_CHROME','/usr/bin/chromium'),args=['--no-sandbox'])
    def fresh(width):
        ctx=browser.new_context(viewport={'width':width,'height':900},reduced_motion='reduce')
        p=ctx.new_page(); errors=[]
        p.on('pageerror',lambda e:errors.append(str(e)))
        p.route('**/*',lambda r:r.fulfill(status=200,body=''))
        p.set_content(html)
        p.add_script_tag(content=(ROOT/'routing.js').read_text())
        p.evaluate(STUB)
        p.evaluate("_activeClubId='qa-class';")
        for file in ['pilot-class-slots-2026-09-11.js','pilot-class-slots-hardening-2026-09-11.js','pilot-class-slots-safety-2026-09-11.js','roster-photo.js','teacher-roster.js']:
            p.add_script_tag(content=(ROOT/file).read_text())
        p.evaluate("document.querySelector('.who-reads-title').textContent='📚 כיתת הדגמה';showScreen('screen-who-reads');_renderFirebaseMemberGrid(document.getElementById('who-reads-grid'),qa.members,'qa-class');")
        p.wait_for_timeout(400)
        return ctx,p,errors
    def geometry(p,selector,width):
        results=p.locator(selector).evaluate_all('''nodes=>nodes.filter(n=>!n.hidden).map(n=>{
           const r=n.getBoundingClientRect(),s=getComputedStyle(n),name=n.querySelector('.profile-name');
           const a=n.querySelector('.profile-avatar'),ar=a.getBoundingClientRect(),nr=name.getBoundingClientRect();
           return {left:r.left,right:r.right,width:r.width,height:r.height,bg:s.backgroundColor,bgImage:s.backgroundImage,radius:s.borderRadius,
           name:name.textContent,font:getComputedStyle(name).fontSize,nameLeft:nr.left,nameRight:nr.right,avatarLeft:ar.left,avatarRight:ar.right,
           aColor:getComputedStyle(a).backgroundColor,slot:n.style.getPropertyValue('--booki-slot-a'),after:getComputedStyle(n,'::after').display};
        })''')
        for x in results:
            assert x['left']>=0 and x['right']<=width and x['bg']=='rgb(255, 254, 249)' and x['bgImage']=='none' and x['radius']=='24px',x
            assert x['nameLeft']>=x['left'] and x['nameRight']<=x['right'] and x['avatarRight']<=x['right'],x
            assert x['height']>=160 and float(x['font'][:-2])>=20 and x['after']=='none',x
        return results
    for width in [320,390,768,1280]:
        ctx,p,errors=fresh(width)
        assert p.locator('#who-reads-grid > .profile-card').count()==6
        child=geometry(p,'#who-reads-grid > .profile-card',width)
        p.screenshot(path=str(OUT/f'students-entry-{width}.png'),full_page=True)
        p.locator('#who-reads-search').fill('נועה')
        assert p.locator('#who-reads-grid > .profile-card:visible').count()==1
        p.locator('#who-reads-search').fill('איןשםכזה')
        assert p.locator('#who-reads-grid > .profile-card:visible').count()==0 and p.locator('#who-reads-no-match').is_visible()
        p.locator('#who-reads-search').fill('')
        first=p.locator('#who-reads-grid > .profile-card').first
        first.click();assert p.locator('#reader-confirm-overlay').is_visible() and p.evaluate('qa.calls.length')==0
        assert 'נועה לוי' in p.locator('#reader-confirm-title').inner_text()
        p.screenshot(path=str(OUT/f'identity-confirm-{width}.png'))
        p.locator('.reader-confirm-no').click()
        assert p.evaluate("document.activeElement.dataset.userId")=='qa-1'
        first.focus();p.keyboard.press('Enter');p.locator('#reader-confirm-yes').click()
        p.wait_for_function('qa.calls.length===1')
        assert p.evaluate('qa.calls[0]')=={'id':'qa-1','clubId':'qa-class'}
        # Teacher uses the same cards, but the roster preview must not select a child.
        p.evaluate("qa.teacher={uid:'qa-teacher'};showClubStudents();")
        p.locator('#booki-roster-existing').wait_for();p.wait_for_timeout(400)
        assert p.locator('#club-students-grid').get_attribute('data-roster-managed')=='1'
        teacher=geometry(p,'#club-students-grid > .profile-card',width)
        p.locator('#club-students-grid').scroll_into_view_if_needed()
        p.screenshot(path=str(OUT/f'students-teacher-{width}.png'))
        p.locator('#club-students-grid > .profile-card').first.click()
        assert p.evaluate('qa.calls.length')==1 and not p.locator('#reader-confirm-overlay').is_visible()
        assert p.locator('#club-students-grid > .profile-card').first.get_attribute('onclick') is None
        # Real roster editor submit handlers; persistence boundary is a synthetic recording stub.
        p.locator('#booki-roster-existing input[type=number]').fill('6')
        p.locator('#booki-roster-existing .br-save').click()
        p.wait_for_function('qa.saved.length===1')
        assert p.evaluate('qa.saved[0]')=={'id':'qa-class','data':{'target':6,'names':[]},'uid':'qa-teacher'}
        p.evaluate('showCreateClub()');p.locator('#booki-roster-setup').wait_for()
        p.locator('#booki-roster-setup input[type=number]').fill('3')
        p.locator('#booki-roster-setup .br-name-row input').nth(0).fill('אביגיל')
        p.locator('#booki-roster-setup .br-name-row input').nth(1).fill('יאיר')
        p.wait_for_function("getComputedStyle(document.getElementById('screen-create-members')).opacity==='1'")
        p.screenshot(path=str(OUT/f'students-create-{width}.png'),full_page=True)
        p.locator('#booki-roster-setup .br-save').click()
        assert p.evaluate('qa.review')==['אביגיל','יאיר','כרטיס פנוי 01']
        assert not errors,errors
        REPORT.append({'width':width,'child':child,'teacher':teacher,'checks':['late slot-theme compatibility','names and personal colours','search and hidden cards','identity confirmation/cancel/keyboard/focus','teacher readonly preview','existing roster submit','new-class card plan']})
        ctx.close()
    ctx,p,errors=fresh(320)
    # Late re-render/hydration, empty state, custom drawing, long names and 50-card capacity.
    p.evaluate("qa.members=[{userId:'renamed',name:'כרטיס פנוי 03',claimedByUid:'qa-renamed',status:'active',cardNumber:3}];_renderFirebaseMemberGrid(document.getElementById('who-reads-grid'),qa.members,'qa-class');")
    p.wait_for_function("document.querySelector('#who-reads-grid .profile-name').textContent==='רוני לביא'")
    geometry(p,'#who-reads-grid > .profile-card',320)
    avatar='data:image/png;base64,'+base64.b64encode((ROOT/'assets/booki/core/states/booki-welcome.png').read_bytes()).decode()
    p.evaluate("avatar=>{qa.members=Array.from({length:50},(_,i)=>({userId:'case-'+i,name:i===0?'אלכסנדריה שםמשפחהמאודארוךלבדיקה':('תלמידה לדוגמה '+i),emoji:i===1?avatar:'🦊',status:'active',cardNumber:i+1}));_renderFirebaseMemberGrid(document.getElementById('who-reads-grid'),qa.members,'qa-class');}",avatar)
    p.wait_for_timeout(400);assert p.locator('#who-reads-grid > .profile-card').count()==50
    geometry(p,'#who-reads-grid > .profile-card',320)
    assert p.locator('#who-reads-grid img.profile-avatar').count()==1
    p.evaluate("_renderFirebaseMemberGrid(document.getElementById('who-reads-grid'),[],'qa-class')")
    assert p.locator('#who-reads-grid > .profile-card').count()==0 and p.locator('.who-reads-empty').first.is_visible()
    assert not errors,errors
    REPORT.append({'edgeCases':['50 cards at 320px','long Hebrew names','custom drawing','late claimed-name hydration','empty list'],'status':'passed'})
    ctx.close();browser.close()
(OUT/'report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2))
print('PASS: student cards on 320/390/768/1280px; native picker, late slot themes, identity dialog, teacher roster and creation; synthetic data only.')
