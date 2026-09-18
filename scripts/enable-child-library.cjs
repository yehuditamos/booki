'use strict';
// Idempotent, narrowly scoped release integration. This script never deploys or writes data.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function replaceOnce(s,oldText,newText){
 if(s.includes(newText))return s;
 if(s.split(oldText).length!==2)throw Error('Release hook changed: '+oldText.slice(0,90));
 return s.replace(oldText,newText);
}
let index=fs.readFileSync(path.join(root,'index.html'),'utf8');
index=replaceOnce(index,'</head>','<link rel="stylesheet" href="child-choice.css?v=20260918-live-topics">\n<link rel="stylesheet" href="child-library.css?v=20260918-live-topics">\n</head>');
index=replaceOnce(index,'</body>','<script src="child-choice.js?v=20260918-live-topics"></script>\n<script src="child-library-topics.js?v=20260918-live-topics"></script>\n<script src="child-library.js?v=20260918-live-topics"></script>\n</body>');
index=index.replace('script.js?v=20260918-library-modes','script.js?v=20260918-live-topics');
let script=fs.readFileSync(path.join(root,'script.js'),'utf8');
script=replaceOnce(script,"  _handleAppReaderScreenChange(id);","  if (window.BookiChildLibrary) window.BookiChildLibrary.onScreenChange(id);\n  _handleAppReaderScreenChange(id);");
for(const [name,action] of [['showLibrary','open'],['showLibraryCategories','folders'],['libraryGoBack','back']]){
 const signature=(name==='showLibrary'?'async ':'')+'function '+name+'() {';
 script=replaceOnce(script,signature,signature+"\n  if (window.BookiChildLibrary?.canUse()) return window.BookiChildLibrary."+action+"();");
}
script=replaceOnce(script,'async function startStory(storyId) {',`async function startStory(storyId, options = {}) {
  const readerKey = () => {
    const r = typeof getActiveReader === 'function' ? getActiveReader() : null;
    const uid = typeof firebase !== 'undefined' ? firebase.auth().currentUser?.uid : null;
    return JSON.stringify([r?.clubId ?? null, r?.userId ?? null, uid ?? null]);
  };
  const expectedReader = readerKey();`);
script=replaceOnce(script,"  _clearPausedAppStory();\n  currentStory = getStoryById(storyId);", "  if (readerKey() !== expectedReader || (typeof options.isCurrent === 'function' && !options.isCurrent())) return false;\n  _clearPausedAppStory();\n  currentStory = getStoryById(storyId);");
fs.writeFileSync(path.join(root,'index.html'),index);fs.writeFileSync(path.join(root,'script.js'),script);
console.log('Child library enabled in the maintained production entry; native reading context guard added.');
