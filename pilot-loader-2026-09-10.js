/** Ordered loader for Booki pilot release 2026-09-10. */
(function(){
  'use strict';
  if(window.BookiPilotLoader20260910) return;
  const files=[
    'pilot-reading-save-2026-09-10.js?v=1',
    'pilot-reading-overrides-2026-09-10.js?v=1',
    'pilot-niqud-exact-2026-09-10.js?v=1',
    'pilot-niqud-defective-2026-09-10.js?v=1',
    'pilot-niqud-logic-2026-09-10.js?v=1',
    'pilot-editorial-01-2026-09-10.js?v=1',
    'pilot-editorial-02-2026-09-10.js?v=1',
    'pilot-editorial-03-2026-09-10.js?v=1',
    'pilot-editorial-04-2026-09-10.js?v=1',
    'pilot-editorial-apply-2026-09-10.js?v=1',
    'pilot-teacher-minutes-2026-09-10.js?v=1',
    'pilot-reading-dial-2026-09-10.js?v=8',
    'pilot-home-clean-2026-09-10.js?v=2',
    'pilot-niqud-context-2026-09-10.js?v=1',
    'pilot-class-slots-2026-09-11.js?v=1',
    'pilot-class-slots-hardening-2026-09-11.js?v=1'
  ];
  let i=0;
  function next(){
    if(i>=files.length){window.BookiPilotLoader20260910.ready=true;window.dispatchEvent(new Event('booki:pilot-release-ready'));return;}
    const src=files[i++],s=document.createElement('script');
    s.src=src;s.async=false;s.dataset.bookiPilotModule=src.split('?')[0];
    s.onload=next;s.onerror=()=>console.error('[booki] pilot module failed:',src);
    document.head.appendChild(s);
  }
  window.BookiPilotLoader20260910={version:'2026-09-11.2',ready:false};
  next();
})();