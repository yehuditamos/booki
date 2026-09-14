/** Compact teacher class-card setup. */
(function(){
'use strict';
if(window.BookiClassSlotsCopy20260911)return;
window.BookiClassSlotsCopy20260911=true;
const $=id=>document.getElementById(id);
function patch(){
 const panel=$('booki-topup-panel'),grid=$('club-students-grid');
 if(panel && grid){
  const strong=panel.querySelector(':scope > strong');
  if(strong && strong.textContent!=='כמה ילדים בכיתה?')strong.textContent='כמה ילדים בכיתה?';
  if(panel.nextElementSibling!==grid)grid.parentNode.insertBefore(panel,grid);
 }
}
const style=document.createElement('style');
style.textContent=`
#screen-club-students #add-student-section,
#booki-named-card-explainer,
#booki-topup-panel > p,
#booki-topup-panel > .booki-flow-label,
#booki-topup-panel .booki-clear-open-slots{display:none!important}
#booki-topup-panel{font-family:Arial,sans-serif;margin:16px;padding:18px}
#booki-topup-panel>strong{font-size:1.25rem;margin-bottom:16px}
#booki-topup-panel .booki-topup-row{flex-direction:column}
#booki-topup-count{box-sizing:border-box;width:100%;min-height:52px;font-size:1.4rem}
#booki-topup-action{min-height:52px;font:700 1.1rem Arial,sans-serif}
#booki-topup-status:empty{display:none}
`;
document.head.appendChild(style);
let queued=false;
new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;patch();});}).observe(document.body,{childList:true,subtree:true});
patch();
})();
