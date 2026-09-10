/** Pilot home cleanup: intentionally temporary for the first pilot. */
(function(){
  'use strict';
  if(window.BookiPilotHomeClean20260910) return;
  window.BookiPilotHomeClean20260910=true;

  function apply(){
    const personal=document.getElementById('booki-personal-message');
    if(personal){
      personal.style.setProperty('display','none','important');
      personal.setAttribute('aria-hidden','true');
    }

    const stage=document.getElementById('home-console-stage');
    if(stage){
      stage.style.setProperty('pointer-events','none','important');
      stage.tabIndex=-1;
      stage.removeAttribute('role');
      stage.removeAttribute('aria-label');
    }

    ['home-class-goal','home-shelf-card'].forEach(id=>{
      const el=document.getElementById(id);
      if(!el) return;
      el.style.setProperty('display','none','important');
      el.setAttribute('aria-hidden','true');
      el.tabIndex=-1;
    });
  }

  const style=document.createElement('style');
  style.id='booki-pilot-home-clean-style';
  style.textContent=`
    #screen-main .booki-unread-cue,
    #screen-main #home-class-goal,
    #screen-main #home-shelf-card,
    #booki-personal-message{display:none!important}
    #screen-main #home-console-stage{pointer-events:none!important}
  `;
  document.head.appendChild(style);
  apply();

  // CSS handles later dynamic renders. Only re-apply semantic/tab behavior when
  // new nodes are inserted; do not observe style/class mutations and create loops.
  let queued=false;
  new MutationObserver(()=>{
    if(queued) return;
    queued=true;
    queueMicrotask(()=>{queued=false;apply();});
  }).observe(document.body,{subtree:true,childList:true});
})();