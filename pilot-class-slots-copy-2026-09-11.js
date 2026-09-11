/** Booki class-slot UX copy clarification — 2026-09-11 */
(function(){
  'use strict';
  if (window.BookiClassSlotsCopy20260911) return;
  window.BookiClassSlotsCopy20260911 = true;

  const $ = id => document.getElementById(id);
  let queued = false;

  const setText = (el, value) => {
    if (el && el.textContent !== value) el.textContent = value;
  };
  const setHtml = (el, value) => {
    if (el && el.innerHTML !== value) el.innerHTML = value;
  };
  const setAttr = (el, name, value) => {
    if (el && el.getAttribute(name) !== value) el.setAttribute(name, value);
  };

  function ensureInfoBox(section){
    if (!section || document.getElementById('booki-named-card-explainer')) return;
    const box = document.createElement('div');
    box.id = 'booki-named-card-explainer';
    box.className = 'booki-card-flow-explainer booki-card-flow-explainer--named';
    box.innerHTML = `
      <span class="booki-flow-label">👩‍🏫 כרטיס בשם מוכן מראש</span>
      <strong>המורה מכינה את הכרטיס לילד</strong>
      <p>כתבי עכשיו את שם התלמיד/ה. כשהילד ייכנס למועדון, הוא כבר יראה את השם שלו ויידע בדיוק על איזה כרטיס ללחוץ.</p>`;
    section.parentNode?.insertBefore(box, section);
  }

  function clarifyExistingClub(){
    const panel = $('booki-topup-panel');
    if (panel && panel.dataset.copyReady !== '1') {
      panel.dataset.copyReady = '1';
      const strong = panel.querySelector(':scope > strong');
      const p = panel.querySelector(':scope > p');
      setText(strong, '🎨 פתיחת כרטיסים לכל הכיתה');
      setHtml(p, '<b>הילדים מקימים את הכרטיס בעצמם.</b> כתבי כמה ילדים יש בכיתה — בוקי יפתח רק את הכרטיסים החסרים. כל ילד יבחר כרטיס צבעוני פנוי, יכתוב עליו את השם שלו, ומאותו רגע זה הכרטיס שלו.');
      const action = $('booki-topup-action');
      if (action && !action.disabled && /^פתחי/.test(action.textContent || '')) {
        const next = (action.textContent || '').replace('פתחי','פתחי כרטיסים פנויים —');
        setText(action, next);
      }
      const input = $('booki-topup-count');
      if (input) {
        if (input.placeholder !== 'מספר הילדים בכיתה') input.placeholder = 'מספר הילדים בכיתה';
        setAttr(input, 'aria-label', 'כמה ילדים יש בכיתה לפתיחת כרטיסים פנויים');
      }
      if (!panel.querySelector(':scope > .booki-flow-label')) {
        const tag = document.createElement('span');
        tag.className = 'booki-flow-label';
        tag.textContent = 'הילד בוחר ומשיים בעצמו';
        panel.insertBefore(tag,panel.firstChild);
      }
    }

    const section = $('add-student-section');
    if (section) {
      ensureInfoBox(section);
      const toggle = section.querySelector('.btn-add-student-toggle');
      setText(toggle, '👩‍🏫 הכיני כרטיס בשם לתלמיד');
      const input = $('add-student-name-input');
      if (input && input.placeholder !== 'שם שיופיע לילד כשייכנס') {
        input.placeholder = 'שם שיופיע לילד כשייכנס';
      }
      const confirm = section.querySelector('.add-student-confirm');
      if (confirm && !confirm.dataset.copyReady) {
        confirm.dataset.copyReady = '1';
        if (!section.querySelector('.booki-named-card-note')) {
          const note = document.createElement('p');
          note.className = 'booki-named-card-note';
          note.textContent = 'השם שתכתבי כאן יחכה לילד כבר בכניסה למועדון.';
          confirm.insertAdjacentElement('afterend', note);
        }
      }
    }
  }

  function clarifyNewClub(){
    const panel = $('booki-class-size-step');
    if (!panel || panel.dataset.copyReady === '1') return;
    panel.dataset.copyReady = '1';
    const title = panel.querySelector('h3');
    const p = panel.querySelector('p');
    setText(title, '🎨 פתיחת כרטיסים לכל הכיתה');
    setHtml(p, '<b>במסלול הזה הילדים ישיימו את הכרטיסים בעצמם.</b> כתבי רק כמה ילדים יש בכיתה. בוקי יכין לכל ילד כרטיס צבעוני פנוי, וכל ילד יבחר אחד ויכתוב עליו את שמו.');

    if (!document.getElementById('booki-new-club-named-note')) {
      const note = document.createElement('div');
      note.id = 'booki-new-club-named-note';
      note.className = 'booki-new-club-named-note';
      note.innerHTML = '<strong>רוצה שהשם כבר יחכה לילד?</strong><span>אחרי הקמת המועדון אפשר להוסיף תלמידים בשם, אחד־אחד. במקרה הזה הילד ייכנס ויראה את הכרטיס שלו כבר מוכן.</span>';
      panel.appendChild(note);
    }
  }

  function patch(){
    clarifyExistingClub();
    clarifyNewClub();
  }

  const style = document.createElement('style');
  style.id = 'booki-class-slots-copy-style';
  style.textContent = `
    .booki-flow-label{display:inline-flex;align-items:center;width:max-content;max-width:100%;padding:5px 10px;border-radius:999px;background:#edf7f1;color:#347052;font-size:.78rem;font-weight:900;margin-bottom:8px}
    .booki-card-flow-explainer{margin:18px 16px 10px;padding:16px 17px;border-radius:20px;text-align:right}
    .booki-card-flow-explainer--named{background:#f7f5ff;border:1px solid #ded8f2}
    .booki-card-flow-explainer strong{display:block;color:#314f42;font-size:1.05rem;margin-bottom:5px}
    .booki-card-flow-explainer p{margin:0;color:#647068;line-height:1.55}
    .booki-named-card-note{margin:4px 0 10px;color:#6a706c;font-size:.86rem;font-weight:700}
    .booki-new-club-named-note{margin-top:14px;padding:12px 14px;border-radius:16px;background:#f8f6ff;border:1px solid #e2dcf4;display:flex;flex-direction:column;gap:3px;color:#626b65}
    .booki-new-club-named-note strong{color:#4d4963}
    #booki-topup-panel>.booki-flow-label{margin-bottom:6px}
  `;
  document.head.appendChild(style);

  // We only need to react when dynamic UI nodes are inserted. Observing class/style
  // mutations here used to create a self-triggering loop that could freeze startup.
  const observer = new MutationObserver(()=>{
    if (queued) return;
    queued = true;
    requestAnimationFrame(()=>{
      try { patch(); }
      finally { queued = false; }
    });
  });
  observer.observe(document.body,{childList:true,subtree:true});
  patch();
})();
