/** Emergency boot guard — never let the teacher intro block Booki startup. */
(function(){
  'use strict';
  if (window.BookiBootFailOpen20260911) return;
  window.BookiBootFailOpen20260911 = true;

  function releaseStuckIntro(){
    const overlay = document.getElementById('booki-teacher-intro');
    if (!overlay) return false;

    const loading = overlay.querySelector('.bti-loading');
    const stillLoading = !!loading && loading.style.display !== 'none';
    if (!stillLoading) return false;

    const skip = overlay.querySelector('.bti-skip');
    if (skip) {
      console.warn('[booki] teacher intro exceeded startup budget — continuing into app');
      skip.click();
      return true;
    }

    const wrapped = window.goToTeacherArea;
    const original = wrapped && wrapped.__bookiFirstLoginIntro && wrapped.__original
      ? wrapped.__original
      : null;
    try { localStorage.setItem('booki_teacher_intro_seen_v1','1'); } catch (_) {}
    overlay.remove();
    if (typeof original === 'function') original(false);
    return true;
  }

  // Give the intro a short chance to be ready; then Booki wins over media loading.
  setTimeout(releaseStuckIntro, 1200);
  setTimeout(releaseStuckIntro, 2200);

  // If the wrapper installs after this hotfix module, the timers above still catch it.
  window.addEventListener('pageshow', () => setTimeout(releaseStuckIntro, 1200), { once:true });
})();