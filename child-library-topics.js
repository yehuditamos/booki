/* Topic taxonomy for the approved child library; text formats are not reading levels. */
(function(){
 'use strict';
 const plain=s=>String(s||'').normalize('NFC').replace(/[\u0591-\u05BD\u05BF-\u05C2\u05C4-\u05C5\u05C7]/g,'');
 const tags=s=>plain((s.tags||[]).join(' '));
 const topics=[
  {id:'animals',label:'חַיּוֹת וְטֶבַע',icon:'🦊',match:s=>s.libraryId==='animals'||/חיות|טבע|יער|ירקות|חתול/.test(tags(s))||['familiar-fisherman-goldfish','familiar-frog-prince','long-bear-birthday','long-puppy-learns-read'].includes(s.id)},
  {id:'friends',label:'חֲבֵרִים וּמִשְׁפָּחָה',icon:'🏡',match:s=>/חבר|משפחה|שייכות|אח ואחות|אהבת אם|אחים/.test(tags(s))||['one-word','back-to-school'].includes(s.libraryId)||['beginner-i-eat','beginner-letter-alef'].includes(s.id)},
  {id:'imagine',label:'דִּמְיוֹן וְהַרְפַּתְקָאוֹת',icon:'⛵',match:s=>['familiar','adventure','booki'].includes(s.libraryId)||/הרפתקה|תעלומה|מסתורין|פנטזיה|קסם|חלומות/.test(tags(s))},
  {id:'discover',label:'מְגַלִּים דְּבָרִים',icon:'🔭',match:s=>['science','history'].includes(s.libraryId)||/שאלות|חלל|המצאות|יצירה/.test(tags(s))||s.id==='bookworms-fourth-grade-contest'},
  {id:'celebrate',label:'חַגִּים וַחֲגִיגוֹת',icon:'🍎',match:s=>s.libraryId==='holidays'||s.id==='long-bear-birthday'},
  {id:'tanakh',label:'סִפּוּרֵי תַּנַ״ךְ',icon:'📜',match:s=>s.libraryId==='tanakh'},
  {id:'teacher-private',label:'סִפּוּרֵי הַכִּתָּה',icon:'📚',match:s=>s.libraryId==='teacher-private'}
 ];
 window.BookiChildTopics=Object.freeze(topics);
})();
