/** Pilot home cleanup: intentionally temporary for the first pilot. */
(function(){
  'use strict';
  if(window.BookiPilotHomeClean20260910) return;
  window.BookiPilotHomeClean20260910=true;

  function apply(){
    const cue=document.querySelector('#screen-main .booki-unread-cue');
    if(cue) cue.style.setProperty('display','none','important');
    const personal=document.getElementById('booki-personal-message');
    if(personal){personal.style.setProperty('display','none','important');personal.setAttribute('aria-hidden','true');}
    const stage=document.getElementById('home-console-stage');
    if(stage){stage.style.setProperty('pointer-events','none','important');stage.removeAttribute('role');stage.removeAttribute('tabindex');stage.removeAttribute('aria-label');}
    ['home-class-goal','home-shelf-card'].forEach(id=>{
      const el=document.getElementById(id);
      if(el){el.style.setProperty('display','none','important');el.setAttribute('aria-hidden','true');el.tabIndex=-1;}
    });
  }

  const style=document.createElement('style');
  style.textContent=`
    #screen-main .booki-unread-cue,
    #screen-main #home-class-goal,
    #screen-main #home-shelf-card,
    #booki-personal-message{display:none!important}
    #screen-main #home-console-stage{pointer-events:none!important}
  `;
  document.head.appendChild(style);
  apply();
  new MutationObserver(apply).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class']});
})();