(function () {
  'use strict';
  const key = 'booki_install_route_v1';
  const mode = matchMedia('(display-mode: standalone)');
  const standalone = () => mode.matches || navigator.standalone === true;
  const params = new URLSearchParams(location.search);
  // Only the installed launch URL uses this hint. Shared links always win.
  if (params.get('installed') === '1' && !params.has('club') && !params.has('join') && !params.has('teacher')) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      const next = new URL(location.href);
      next.search = '';
      if (saved && saved.kind === 'teacher') next.searchParams.set('teacher', '1');
      else if (saved && saved.club) next.searchParams.set('club', saved.club);
      else if (saved && saved.join) next.searchParams.set('join', saved.join);
      history.replaceState(null, '', next.href);
    } catch (_) {}
  }
  let deferred = null, installed = false, busy = false, card, dialog, opener;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const embedded = /FBAN|FBAV|Instagram|Line\/|WhatsApp/i.test(navigator.userAgent);
  function context() {
    const active = document.querySelector('.screen.active');
    if (!active) return null;
    if (['screen-teacher-dashboard', 'screen-teacher-club'].includes(active.id)) return {kind:'teacher'};
    if (!['screen-who-reads','screen-main','screen-club-dashboard','screen-personal-home','screen-club-welcome','screen-join-entry','screen-join-name','screen-join-welcome'].includes(active.id)) return null;
    const p = new URLSearchParams(location.search);
    const club = p.get('club') || window.currentClubId || (typeof getActiveReader === 'function' && getActiveReader()?.clubId);
    return club ? {kind:'reader',club:String(club)} : p.get('join') ? {kind:'reader',join:p.get('join')} : null;
  }
  function remember() {
    const c = context();
    if (c) { try { localStorage.setItem(key, JSON.stringify(c)); } catch (_) {} }
  }
  function render() {
    if (!card) return;
    const c = context();
    const visible = !!c && !standalone() && !installed;
    card.hidden = !visible;
    if (visible) {
      remember();
      const host = document.querySelector('.screen.active');
      if (card.parentElement !== host) host.appendChild(card);
      const b = card.querySelector('button');
      b.textContent = c.kind === 'teacher' ? '📚 הוסיפי את בוקי למסך הבית' : '📚 מוסיפים את בוקי למסך הבית';
      b.disabled = busy;
    }
    if ((standalone() || installed) && dialog?.open) dialog.close();
  }
  function guide() {
    opener = document.activeElement;
    const list = dialog.querySelector('ol');
    list.replaceChildren();
    const steps = embedded
      ? ['פותחים את תפריט הקישור ובוחרים פתיחה בדפדפן — Safari באייפון או Chrome באנדרואיד.', 'באותו קישור לוחצים שוב על הוספת בוקי למסך הבית.']
      : ios
        ? ['פותחים את תפריט השיתוף ↑ בדפדפן (לעיתים בתוך תפריט ⋯).', 'בוחרים ״הוספה למסך הבית״.', 'מאשרים ״הוספה״. אם מופיעה אפשרות ״פתיחה כיישום אינטרנט״, משאירים אותה פעילה.']
        : ['פותחים את תפריט הדפדפן ⋮ או את סמל ההתקנה בשורת הכתובת.', 'בוחרים ״התקנת אפליקציה״ או ״הוספה למסך הבית״ ומאשרים. אם האפשרות חסרה, פותחים את אותו הקישור ב־Chrome או Edge.'];
    steps.forEach(text => { const li = document.createElement('li'); li.textContent = text; list.appendChild(li); });
    if (!dialog.open) dialog.showModal();
  }
  async function install() {
    remember();
    if (!deferred) { guide(); return; }
    const prompt = deferred; deferred = null; busy = true; render();
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') installed = true;
    } catch (_) { guide(); }
    finally { busy = false; render(); }
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); deferred = event; installed = false; render();
  });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; render(); });
  mode.addEventListener('change', render);
  function init() {
    const style = document.createElement('style');
    style.textContent = '#booki-install-card{margin:20px auto 100px;padding:16px;max-width:480px;text-align:center;font-family:Arial,sans-serif;direction:rtl}#booki-install-card[hidden]{display:none!important}#booki-install-card button,#booki-install-guide button{font:700 17px Arial;padding:14px 20px;border-radius:18px;border:1px solid #b7d8c4;background:#ecf7ef;color:#254d39;cursor:pointer;min-height:48px}#booki-install-card button{width:100%}#booki-install-card p{font-size:14px;color:#526c5c;margin:8px 0}#booki-install-guide{direction:rtl;font:17px/1.7 Arial;color:#254d39;background:#fffdf6;border:0;border-radius:24px;padding:24px;width:min(440px,calc(100vw - 40px));box-sizing:border-box;max-height:85vh;overflow:auto}#booki-install-guide::backdrop{background:#19362680}#booki-install-guide h2{font-size:22px;margin-top:0}#booki-install-guide li{margin:12px 0}#booki-install-guide button:focus-visible,#booki-install-card button:focus-visible{outline:3px solid #2877b8;outline-offset:3px}';
    document.head.appendChild(style);
    card = document.createElement('aside'); card.id = 'booki-install-card'; card.hidden = true;
    card.innerHTML = '<button type="button"></button><p>בוקי במרחק נגיעה, ישר ממסך הבית</p>';
    card.querySelector('button').addEventListener('click', install);
    dialog = document.createElement('dialog'); dialog.id = 'booki-install-guide';
    dialog.setAttribute('aria-labelledby','booki-install-title');
    dialog.innerHTML = '<h2 id="booki-install-title">בוקי על מסך הבית 📚</h2><ol></ol><p>אחרי ההוספה פותחים את האייקון ״בוקי״. ייתכן שתתבקשו להתחבר או לבחור קורא מחדש.</p><button type="button" autofocus>הבנתי</button>';
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => opener?.focus());
    document.body.append(card,dialog);
    // Observe screen activation only; never observe our own rendered subtree.
    document.querySelectorAll('.screen').forEach(screen => new MutationObserver(render).observe(screen,{attributes:true,attributeFilter:['class']}));
    window.addEventListener('pageshow', render);
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();