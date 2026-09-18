'use strict';
// Move the existing search container in DOM order, not only its visual CSS order.
// Native rendering, input ids, filtering and identity confirmation remain unchanged.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function replaceOnce(text, before, after) {
  if (text.includes(after)) return text;
  if (text.split(before).length !== 2) throw Error('Unexpected source hook: ' + before.slice(0, 90));
  return text.replace(before, after);
}
const indexPath = path.join(root, 'index.html');
let index = fs.readFileSync(indexPath, 'utf8');
const grid = '  <div id="who-reads-grid" class="who-reads-grid"></div>';
const footer = '  <div class="who-reads-footer">\n    <button class="btn-join-another" onclick="showJoinClub()">+ <span data-nk="הִתְחַבֵּר/י עִם קוֹד">התחבר/י עם קוד</span></button>\n  </div>';
index = replaceOnce(index, grid + '\n' + footer, footer + '\n' + grid);
index = replaceOnce(index, 'student-cards.css?v=20260918-folder-style', 'student-cards.css?v=20260918-name-search-top');
const cssPath = path.join(root, 'student-cards.css');
let css = fs.readFileSync(cssPath, 'utf8');
css = replaceOnce(css,
  '  padding: 8px 24px calc(30px + env(safe-area-inset-bottom));\n}',
  '  padding: 18px 24px 4px;\n}\n/* The native search region now precedes the cards in the document. */\n#screen-who-reads .who-reads-footer:empty { display: none; }');
// Keep the existing functional suite and add visible-at-entry + keyboard/DOM order checks.
const testPath = path.join(root, 'scripts/test-student-cards-browser.py');
let test = fs.readFileSync(testPath, 'utf8');
const hook = '    def geometry(p,selector,width):\n';
const check = `        if selector.startswith('#who-reads-grid'):
            search = p.locator('#who-reads-search')
            assert search.count() == 1
            position = search.evaluate('''n=>{
                const r=n.getBoundingClientRect(),grid=document.getElementById('who-reads-grid');
                const first=grid.querySelector('.profile-card'),area=n.closest('.who-reads-footer');
                return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,
                    beforeGrid:!!(n.compareDocumentPosition(grid)&Node.DOCUMENT_POSITION_FOLLOWING),
                    firstTop:first?.getBoundingClientRect().top,areaBottom:area.getBoundingClientRect().bottom,
                    height:innerHeight,viewportWidth:innerWidth};
            }''')
            assert position['beforeGrid'] and 0 <= position['top'] < position['bottom'] <= position['height'], position
            assert 0 <= position['left'] < position['right'] <= position['viewportWidth'], position
            assert position['firstTop'] is None or position['areaBottom'] <= position['firstTop'], position
            assert not search.get_attribute('autofocus'), 'Do not open the phone keyboard on entry'
`;
test = replaceOnce(test, hook, hook + check);
// Mobile test height matches a small phone rather than relying on a tall page.
test = replaceOnce(test, "viewport={'width':width,'height':900}", "viewport={'width':width,'height':667 if width <= 390 else 900}");
fs.writeFileSync(indexPath, index);
fs.writeFileSync(cssPath, css);
fs.writeFileSync(testPath, test);
console.log('Name search moved above the cards; native search/identity behavior unchanged.');
