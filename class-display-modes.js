/* One student display: the class tree and today's reader names. Rendered in script.js. */
(function(){
  const style=document.createElement('style');
  style.textContent=`.booki-student-mode{text-align:center;margin:16px auto}.booki-student-mode h3{color:#244b39}.orbit{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding:12px}.orbit>span{background:#fff;border:1.5px solid #bce6ce;border-radius:999px;padding:8px 14px}`;
  document.head.appendChild(style);
})();

// Load optional teacher contact support for the pilot without touching the main app shell.
(function(){if(document.querySelector('script[data-booki-teacher-contact]'))return;const s=document.createElement('script');s.src='teacher-contact.js?v=1';s.async=false;s.dataset.bookiTeacherContact='1';document.head.appendChild(s);})();

// Ordered, isolated student release. No teacher-entry video is loaded here.
(function(){
  if(document.querySelector('script[data-booki-student-holidays]'))return;
  for(const src of ['content/stories-holidays-autumn-2026.js?v=20260915-editorial','student-holidays-release.js?v=20260915-no-class-story']){
    const script=document.createElement('script');script.src=src;script.async=false;
    script.dataset.bookiStudentHolidays='1';
    script.onerror=()=>console.warn('[booki] holiday release file unavailable:',src);
    document.head.appendChild(script);
  }
})();


