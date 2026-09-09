/* Basic no-voice release: this module has NO microphone, speech, audio socket,
 * recognition engine or token endpoint. Keep the API so reading/timers still work.
 * Previous implementation remains in Git history, not in the running application.
 */
(function () {
  'use strict';
  try { window.BookiLocalListening?.stop?.(); } catch (_) {}
  function hide() {
    const panel = document.getElementById('booki-local-listening');
    if (panel) { panel.hidden = true; panel.style.display = 'none'; }
  }
  window.BookiLocalListening = Object.freeze({
    isEnabled: () => false,
    start: hide,
    stop: hide,
    render: value => { const el = document.getElementById('reader-text'); if (el) el.textContent = String(value || ''); hide(); }
  });
  hide();
  if (window.BookiBasicConsentReady) return;
  const load = src => new Promise((resolve,reject) => {
    const script = document.createElement('script'); script.src = src; script.async = false;
    script.onload = resolve; script.onerror = () => reject(new Error('Booki consent component unavailable'));
    document.head.appendChild(script);
  });
  window.BookiBasicConsentReady = (async () => {
    await load('basic-consent-copy.js?v=1');
    await load('basic-consent.js?v=1');
    await load('basic-consent-owner.js?v=1');
    await window.BookiBasicConsent.ready();
    window.BookiBasicConsent.install();
  })();
  // DOMContentLoaded can occur before dynamic scripts finish. Do not race routing.
  const route = window.routeOnLoad;
  if (typeof route === 'function') window.routeOnLoad = async function (...args) {
    try { await window.BookiBasicConsentReady; }
    catch (_) {
      let panel = document.getElementById('booki-start-error');
      if (!panel) {
        panel = document.createElement('div'); panel.id = 'booki-start-error'; panel.dir = 'rtl';
        panel.style.cssText = 'position:fixed;inset:0;z-index:2000;background:#fffdf7;padding:30px;font:18px Arial;text-align:center';
        const label=document.createElement('p');label.textContent='חלק מהעדכון עדיין לא נטען. בדקו חיבור ונסו לרענן.';
        const button=document.createElement('button');button.type='button';button.textContent='רענון';button.onclick=()=>location.reload();
        panel.append(label,button);document.body.appendChild(panel);
      }
      return;
    }
    return route.apply(this,args);
  };
  // Observe rejections even when this page does not use routeOnLoad.
  window.BookiBasicConsentReady.catch(() => {});
})();
