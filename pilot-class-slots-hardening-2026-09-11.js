/** Booki class-slot hardening: verify claim on server + universal parent invite copy. */
(function(){
  'use strict';
  if (window.BookiClassSlotsHardening20260911) return;
  window.BookiClassSlotsHardening20260911 = true;

  let claimContext = null;
  const $ = id => document.getElementById(id);

  // Capture the exact card being personalized so we can verify ownership after save.
  if (typeof window.showMiniPersonalization === 'function') {
    const innerShowMini = window.showMiniPersonalization;
    window.showMiniPersonalization = function(userId, clubId, name){
      claimContext = String(name || '').startsWith('כרטיס פנוי ')
        ? { userId, clubId }
        : null;
      return innerShowMini.apply(this, arguments);
    };
  }

  if (typeof window.submitMiniPersonalization === 'function') {
    const innerSubmitMini = window.submitMiniPersonalization;
    window.submitMiniPersonalization = async function(){
      const context = claimContext ? {...claimContext} : null;
      const authUid = (typeof firebase !== 'undefined' && firebase.auth)
        ? firebase.auth().currentUser?.uid || null : null;
      const result = await innerSubmitMini.apply(this, arguments);

      if (!context || !authUid || !window.db) return result;
      try {
        // Force a server read when supported; a cached optimistic state is not enough.
        const ref = window.db.collection('clubs').doc(context.clubId)
          .collection('memberships').doc(context.userId);
        let snap;
        try { snap = await ref.get({source:'server'}); }
        catch (_) { snap = await ref.get(); }
        const data = snap.exists ? snap.data() : null;
        const verified = !!data
          && data.personalized === true
          && data.claimedByUid === authUid;
        if (!verified) {
          console.error('[class-slots] claim verification failed', {
            clubId: context.clubId, cardId: context.userId, authUid,
            storedClaim: data?.claimedByUid, personalized: data?.personalized
          });
          const err = $('mini-person-error');
          if (err) {
            err.textContent = 'הכרטיס עוד לא נשמר. נשארים כאן ומנסים שוב.';
            err.style.display = '';
          }
          return result;
        }
        claimContext = null;
      } catch (error) {
        console.warn('[class-slots] claim verification unavailable', error);
        // Network verification failure is not treated as a false claim failure.
      }
      return result;
    };
  }

  function universalInvite(club){
    if (!club?.joinLink) return '';
    return [
      `📚 הורים יקרים, פתחנו לילדים את מועדון הקריאה "${club.name || 'שלנו'}" בבוקי!`,
      'הילדים קוראים וצוברים דקות קריאה יחד עם הכיתה 💙',
      '',
      'מה עושים?',
      '1. נכנסים לקישור.',
      '2. אם השם של הילד/ה כבר מופיע — בוחרים אותו.',
      '3. אם מופיעים כרטיסים צבעוניים פנויים — הילד/ה בוחר/ת כרטיס, כותב/ת עליו את השם, ומאותו רגע זה הכרטיס שלו/ה.',
      '',
      club.joinLink,
      club.joinCode ? `קוד המועדון: ${club.joinCode}` : '',
      '📌 שמרו את ההודעה — זה הקישור הקבוע שלנו לקריאה.'
    ].filter(Boolean).join('\n');
  }

  function currentTeacherClub(){
    return window._currentTeacherClubData || null;
  }

  window._teacherClubShareText = function(){
    return universalInvite(currentTeacherClub());
  };
  window._teacherClubHomeText = window._teacherClubShareText;

  async function copyText(text){
    try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta); ta.select();
    try { return document.execCommand('copy'); }
    catch (_) { return false; }
    finally { ta.remove(); }
  }

  function successClub(){
    try {
      if (typeof _newClub !== 'undefined' && _newClub && typeof _buildJoinLink === 'function') {
        return {
          name: _newClub.name,
          joinLink: _buildJoinLink(),
          joinCode: typeof _clubCode !== 'undefined' ? _clubCode : ''
        };
      }
    } catch (_) {}
    return currentTeacherClub();
  }

  window.copyJoinLink = async function(){
    const text = universalInvite(successClub());
    const ok = text ? await copyText(text) : false;
    const el = document.querySelector('[onclick="copyJoinLink()"]');
    if (el) el.textContent = ok ? '✅ ההודעה והקישור הועתקו' : 'ההעתקה לא הצליחה — נסי לשתף';
  };

  window.shareCodesWhatsApp = function(){
    const text = universalInvite(successClub());
    if (!text) return;
    if (navigator.share) {
      navigator.share({text}).catch(error => {
        if (error?.name !== 'AbortError') window.copyJoinLink();
      });
    } else {
      window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
    }
  };

  window.BookiClassSlotsInvite = { universalInvite };
})();