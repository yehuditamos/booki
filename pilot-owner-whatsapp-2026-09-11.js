/**
 * Booki owner dashboard — WhatsApp queue for selected teachers.
 * This module NEVER sends a message by itself. It opens one WhatsApp draft per
 * explicit user click so browsers do not block popups and the owner confirms
 * every send inside WhatsApp.
 */
(function(){
  'use strict';
  if (window.BookiOwnerWhatsApp20260911) return;
  window.BookiOwnerWhatsApp20260911 = true;

  const $ = id => document.getElementById(id);
  const selected = new Set();
  let teachersCache = [];
  let queue = [];
  let queueIndex = 0;
  const QUEUE_KEY = 'booki_owner_whatsapp_queue_v1';

  function escText(value){ return String(value ?? ''); }

  function normalizePhone(raw){
    let digits = String(raw || '').replace(/\D/g,'');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('9720')) digits = '972' + digits.slice(4);
    else if (digits.startsWith('0')) digits = '972' + digits.slice(1);
    return /^\d{8,15}$/.test(digits) ? digits : '';
  }

  function teacherId(t, index){ return String(t?.id || t?.uid || t?.email || ('teacher-'+index)); }
  function displayName(t){ return String(t?.name || t?.email || 'מורה').trim(); }

  function validTeachers(){
    return teachersCache.map((t,index)=>({
      t, index, id:teacherId(t,index), phone:normalizePhone(t?.phone), name:displayName(t)
    }));
  }

  function saveQueue(){
    try { sessionStorage.setItem(QUEUE_KEY, JSON.stringify({queue,queueIndex})); } catch(_) {}
  }
  function restoreQueue(){
    try {
      const raw = sessionStorage.getItem(QUEUE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!Array.isArray(data?.queue)) return;
      queue = data.queue.filter(x => x && x.phone && x.name && typeof x.message === 'string');
      queueIndex = Math.max(0, Math.min(Number(data.queueIndex)||0, queue.length));
    } catch(_) {}
  }
  function clearQueue(){
    queue=[]; queueIndex=0;
    try { sessionStorage.removeItem(QUEUE_KEY); } catch(_) {}
    renderQueueState();
  }

  function ensurePanel(){
    const list = $('od-teachers-list');
    if (!list || $('od-wa-panel')) return;
    const section = list.closest('.od-section');
    if (!section) return;

    const panel = document.createElement('div');
    panel.id = 'od-wa-panel';
    panel.className = 'od-wa-panel';
    panel.innerHTML = `
      <div class="od-wa-head">
        <div><strong>💬 הודעת WhatsApp למורות</strong><span>סמני למי לשלוח, כתבי הודעה, ובוקי יפתח לך כל שיחה מוכנה.</span></div>
        <label class="od-wa-select-all"><input id="od-wa-select-all" type="checkbox"> סמני הכל</label>
      </div>
      <textarea id="od-wa-message" rows="4" placeholder="כתבי כאן את ההודעה…"></textarea>
      <div class="od-wa-template-note">טיפ: אפשר לכתוב <b>{שם}</b> ובוקי יכניס לכל מורה את השם שלה.</div>
      <div class="od-wa-summary" id="od-wa-summary">לא נבחרו מורות</div>
      <button id="od-wa-start" class="od-wa-primary" type="button" disabled>פתחי הודעה ראשונה ב־WhatsApp</button>
      <div id="od-wa-queue" class="od-wa-queue" hidden>
        <div id="od-wa-progress"></div>
        <div class="od-wa-queue-actions">
          <button id="od-wa-next" class="od-wa-primary" type="button">פתחי את הבאה</button>
          <button id="od-wa-reset" class="od-wa-secondary" type="button">סיימתי / אפסי תור</button>
        </div>
      </div>`;

    list.parentNode.insertBefore(panel, list);

    $('od-wa-select-all')?.addEventListener('change', e => {
      const want = !!e.target.checked;
      validTeachers().forEach(x => {
        if (!x.phone) return;
        if (want) selected.add(x.id); else selected.delete(x.id);
      });
      syncCheckboxes();
      renderSummary();
    });
    $('od-wa-message')?.addEventListener('input', renderSummary);
    $('od-wa-start')?.addEventListener('click', startQueue);
    $('od-wa-next')?.addEventListener('click', openNext);
    $('od-wa-reset')?.addEventListener('click', clearQueue);
    restoreQueue();
    renderQueueState();
    renderSummary();
  }

  function decorateRows(){
    const list = $('od-teachers-list');
    if (!list) return;
    const rows = [...list.querySelectorAll(':scope > .od-row')];
    const data = validTeachers();
    rows.forEach((row,index)=>{
      const item = data[index];
      if (!item) return;
      row.dataset.waTeacherId = item.id;
      row.dataset.waPhone = item.phone;
      if (!row.querySelector('.od-wa-pick')) {
        const pick = document.createElement('label');
        pick.className = 'od-wa-pick';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'od-wa-checkbox';
        input.dataset.teacherId = item.id;
        input.disabled = !item.phone;
        input.checked = item.phone && selected.has(item.id);
        input.setAttribute('aria-label', item.phone ? `בחרי את ${item.name} לשליחת WhatsApp` : `${item.name} ללא מספר WhatsApp`);
        input.addEventListener('change',()=>{
          if (input.checked) selected.add(item.id); else selected.delete(item.id);
          renderSummary();
        });
        const mark = document.createElement('span');
        mark.textContent = item.phone ? 'WhatsApp' : 'חסר מספר';
        pick.append(input,mark);
        row.prepend(pick);
      } else {
        const input = row.querySelector('.od-wa-checkbox');
        if (input) {
          input.disabled = !item.phone;
          input.checked = item.phone && selected.has(item.id);
        }
        const mark = row.querySelector('.od-wa-pick span');
        if (mark) mark.textContent = item.phone ? 'WhatsApp' : 'חסר מספר';
      }
    });
    renderSummary();
  }

  function syncCheckboxes(){
    document.querySelectorAll('#od-teachers-list .od-wa-checkbox').forEach(input=>{
      input.checked = !input.disabled && selected.has(String(input.dataset.teacherId));
    });
    const eligible = validTeachers().filter(x=>x.phone);
    const checked = eligible.filter(x=>selected.has(x.id)).length;
    const all = $('od-wa-select-all');
    if (all) {
      all.checked = eligible.length>0 && checked===eligible.length;
      all.indeterminate = checked>0 && checked<eligible.length;
    }
  }

  function renderSummary(){
    ensurePanel();
    const data = validTeachers();
    const ready = data.filter(x=>x.phone);
    const missing = data.filter(x=>!x.phone);
    const chosen = ready.filter(x=>selected.has(x.id));
    const summary = $('od-wa-summary');
    if (summary) {
      summary.textContent = chosen.length
        ? `נבחרו ${chosen.length} מורות · ${missing.length ? `${missing.length} חסרות מספר` : 'לכולן יש מספר'}`
        : `לא נבחרו מורות · ${ready.length} מוכנות לשליחה${missing.length ? ` · ${missing.length} חסרות מספר` : ''}`;
    }
    const message = $('od-wa-message')?.value.trim() || '';
    const start = $('od-wa-start');
    if (start) start.disabled = !chosen.length || !message;
    syncCheckboxes();
  }

  function personalize(message,name){
    return String(message || '').replace(/\{שם\}/g, name);
  }

  function startQueue(){
    const message = $('od-wa-message')?.value.trim() || '';
    if (!message) return;
    queue = validTeachers()
      .filter(x=>x.phone && selected.has(x.id))
      .map(x=>({id:x.id,name:x.name,phone:x.phone,message:personalize(message,x.name)}));
    queueIndex = 0;
    if (!queue.length) return;
    saveQueue();
    renderQueueState();
    openNext();
  }

  function openNext(){
    if (queueIndex >= queue.length) { renderQueueState(); return; }
    const item = queue[queueIndex];
    const url = `https://wa.me/${encodeURIComponent(item.phone)}?text=${encodeURIComponent(item.message)}`;
    queueIndex += 1;
    saveQueue();
    renderQueueState(item.name);
    const opened = window.open(url,'_blank','noopener,noreferrer');
    if (!opened) window.location.href = url;
  }

  function renderQueueState(lastOpened=''){
    const box = $('od-wa-queue');
    const progress = $('od-wa-progress');
    const next = $('od-wa-next');
    if (!box || !progress || !next) return;
    if (!queue.length) { box.hidden = true; return; }
    box.hidden = false;
    if (queueIndex >= queue.length) {
      progress.textContent = `✅ נפתחו ${queue.length} הודעות${lastOpened ? ` · האחרונה: ${lastOpened}` : ''}. השליחה מתבצעת רק אחרי שאת מאשרת בתוך WhatsApp.`;
      next.hidden = true;
      return;
    }
    next.hidden = false;
    const upcoming = queue[queueIndex];
    progress.textContent = `${lastOpened ? `נפתחה הודעה ל־${lastOpened}. ` : ''}${queueIndex} מתוך ${queue.length} נפתחו · הבאה: ${upcoming.name}`;
    next.textContent = queueIndex === 0 ? 'פתחי הודעה ראשונה' : `פתחי את הבאה (${queueIndex+1}/${queue.length})`;
  }

  function mount(teachers){
    teachersCache = Array.isArray(teachers) ? teachers : [];
    ensurePanel();
    decorateRows();
  }

  function install(){
    const original = window._odRenderTeachers;
    if (typeof original === 'function' && !original.__bookiWhatsAppWrapped) {
      const wrapped = function(teachers,clubs){
        const result = original.apply(this,arguments);
        mount(teachers);
        return result;
      };
      wrapped.__bookiWhatsAppWrapped = true;
      window._odRenderTeachers = wrapped;
    }

    if ($('screen-owner-dashboard')?.classList.contains('active') && typeof window.fbLoadAllTeachers === 'function') {
      Promise.resolve(window.fbLoadAllTeachers()).then(mount).catch(()=>{});
    }
  }

  const style = document.createElement('style');
  style.id='booki-owner-whatsapp-style';
  style.textContent=`
    .od-wa-panel{margin:10px 0 16px;padding:14px;border:1px solid #d8eadf;border-radius:18px;background:#f8fcf9;direction:rtl}
    .od-wa-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}.od-wa-head strong{display:block;color:#245b3e;font-size:1.02rem}.od-wa-head span{display:block;color:#65736c;font-size:.82rem;margin-top:2px}
    .od-wa-select-all{display:flex!important;align-items:center;gap:6px;font-weight:800;color:#35624d;white-space:nowrap}
    #od-wa-message{width:100%;box-sizing:border-box;margin-top:12px;padding:12px;border:1.5px solid #bcd8c8;border-radius:13px;background:#fff;font:500 .95rem/1.5 Heebo,Arial,sans-serif;resize:vertical;direction:rtl;text-align:right}
    .od-wa-template-note{font-size:.78rem;color:#6d786f;margin:6px 2px 10px}.od-wa-summary{font-weight:800;color:#385c4c;margin:8px 0}
    .od-wa-primary,.od-wa-secondary{border:0;border-radius:12px;padding:10px 14px;font:800 .9rem Heebo,Arial,sans-serif;cursor:pointer}.od-wa-primary{background:#25D366;color:#fff}.od-wa-primary:disabled{opacity:.45;cursor:not-allowed}.od-wa-secondary{background:#eef3ef;color:#50635a}
    .od-wa-queue{margin-top:10px;padding:10px;border-radius:12px;background:#fff;border:1px solid #dfe9e2;color:#496157;font-size:.85rem}.od-wa-queue-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
    #od-teachers-list .od-wa-pick{display:flex!important;align-items:center;gap:5px;margin-inline-end:8px;min-width:82px;font-size:.72rem;font-weight:800;color:#4f6e60}#od-teachers-list .od-wa-pick input{width:18px;height:18px;accent-color:#25D366}#od-teachers-list .od-wa-pick input:disabled+span{color:#a08a8a}
    @media(max-width:560px){#od-teachers-list .od-row{flex-wrap:wrap}.od-wa-panel{padding:12px}.od-wa-head{flex-direction:column}.od-wa-select-all{align-self:flex-start}}
  `;
  document.head.appendChild(style);

  restoreQueue();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();