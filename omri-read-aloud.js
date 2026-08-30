(() => {
  'use strict';

  const DISPLAY_TEXT = 'בַּבֹּקֶר נֹעַם יָצָא לַגִּנָּה. הוּא רָאָה פַּרְפַּר כָּחֹל עָף מֵעַל הַפְּרָחִים. נֹעַם עָמַד בְּשֶׁקֶט וְחִכָּה שֶׁהַפַּרְפַּר יִתְקָרֵב.';
  const card = document.querySelector('.listen-card');
  const textEl = document.getElementById('reading-text');
  const statusEl = document.getElementById('listen-status');
  const errorEl = document.getElementById('listen-error');
  const listenBtn = document.getElementById('listen-button');
  const listenLabel = document.getElementById('listen-button-label');
  const resetBtn = document.getElementById('reset-button');
  const meterBars = [...document.querySelectorAll('#listening-meter i')];
  const matcher = new window.BookiWordMatcher(DISPLAY_TEXT);

  let mediaStream = null;
  let audioContext = null;
  let analyser = null;
  let source = null;
  let meterFrame = null;
  let listening = false;
  let noiseFloor = .012;
  let voicedFor = 0;
  let silenceFor = 0;
  let previousFrameAt = 0;

  function renderWords() {
    textEl.replaceChildren(...matcher.displayWords.map((word, index) => {
      const span = document.createElement('span');
      span.className = 'reading-word';
      span.dataset.index = String(index);
      span.textContent = word;
      return span;
    }));
    refreshWordStates();
  }

  function refreshWordStates() {
    const current = matcher.nextUnconfirmed();
    [...textEl.children].forEach((el, index) => {
      el.classList.toggle('is-confirmed', matcher.confirmed.has(index));
      el.classList.toggle('is-current', listening && index === current);
    });
  }

  function expectedVoiceTime(index) {
    const letters = matcher.targetWords[index]?.length || 3;
    return Math.max(360, Math.min(900, 210 + letters * 85));
  }

  function confirmCurrentWord() {
    const index = matcher.nextUnconfirmed();
    if (index >= matcher.targetWords.length) return;
    matcher.confirmed.add(index);
    matcher.anchor = index + 1;
    voicedFor = 0;
    silenceFor = 0;
    refreshWordStates();
    if (matcher.complete) completeReading();
  }

  function updateListening(now) {
    if (!analyser || !listening) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let energy = 0;
    for (const value of data) {
      const sample = (value - 128) / 128;
      energy += sample * sample;
    }
    const rms = Math.sqrt(energy / data.length);
    const elapsed = Math.min(100, previousFrameAt ? now - previousFrameAt : 16);
    previousFrameAt = now;

    const threshold = Math.max(.022, noiseFloor * 2.4);
    const voiceActive = rms > threshold;
    if (!voiceActive) noiseFloor = noiseFloor * .985 + rms * .015;
    card.classList.toggle('voice-active', voiceActive);

    const level = Math.min(1, Math.max(0, (rms - noiseFloor) * 10));
    meterBars.forEach((bar, index) => {
      const shape = 1 - Math.abs(index - 2) * .16;
      bar.style.setProperty('--meter', String(1 + level * 3.6 * shape));
    });

    if (voiceActive) {
      voicedFor += elapsed;
      silenceFor = 0;
    } else if (voicedFor > 0) {
      silenceFor += elapsed;
      if (silenceFor > 650) {
        voicedFor = 0;
        silenceFor = 0;
      }
    }

    const current = matcher.nextUnconfirmed();
    if (current < matcher.targetWords.length && voicedFor >= expectedVoiceTime(current)) confirmCurrentWord();
    meterFrame = requestAnimationFrame(updateListening);
  }

  async function startListening() {
    clearError();
    if (!navigator.mediaDevices?.getUserMedia) return showError('המכשיר הזה לא מאפשר לבוקי להקשיב.');
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount:1, echoCancellation:true, noiseSuppression:true, autoGainControl:true },
        video:false
      });
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
      source = audioContext.createMediaStreamSource(mediaStream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = .35;
      source.connect(analyser);
      listening = true;
      voicedFor = 0;
      silenceFor = 0;
      previousFrameAt = 0;
      card.classList.add('is-listening');
      statusEl.textContent = 'אני שומע אותך';
      listenLabel.textContent = 'סיימתי לקרוא';
      refreshWordStates();
      meterFrame = requestAnimationFrame(updateListening);
    } catch (error) {
      stopAudio();
      if (error?.name === 'NotAllowedError') showError('כדי שבוקי ישמע, צריך לאשר גישה למיקרופון.');
      else showError('לא הצלחתי לפתוח את המיקרופון. נסה שוב.');
    }
  }

  function stopAudio() {
    listening = false;
    card.classList.remove('is-listening', 'voice-active');
    if (meterFrame) cancelAnimationFrame(meterFrame);
    meterFrame = null;
    try { analyser?.disconnect(); } catch (_) {}
    try { source?.disconnect(); } catch (_) {}
    mediaStream?.getTracks().forEach(track => track.stop());
    audioContext?.close().catch(() => {});
    mediaStream = audioContext = analyser = source = null;
    meterBars.forEach(bar => bar.style.setProperty('--meter', '1'));
    refreshWordStates();
  }

  function stopListening() {
    stopAudio();
    listenLabel.textContent = 'להמשיך לקרוא';
    statusEl.textContent = matcher.confirmed.size ? 'שמעתי אותך קורא!' : 'מתחילים לקרוא ובוקי כבר מקשיב.';
    resetBtn.hidden = matcher.confirmed.size === 0;
  }

  function completeReading() {
    statusEl.textContent = 'שמעתי אותך קורא!';
    resetBtn.hidden = false;
    listenBtn.hidden = true;
    setTimeout(stopAudio, 350);
  }

  function resetReading() {
    stopAudio();
    matcher.reset();
    listenBtn.hidden = false;
    listenLabel.textContent = 'מתחילים לקרוא';
    resetBtn.hidden = true;
    statusEl.textContent = 'מתחילים לקרוא ובוקי כבר מקשיב.';
    refreshWordStates();
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    statusEl.textContent = 'בוא ננסה שוב';
  }
  function clearError() { errorEl.hidden = true; errorEl.textContent = ''; }

  listenBtn.addEventListener('click', () => listening ? stopListening() : startListening());
  resetBtn.addEventListener('click', resetReading);
  window.addEventListener('pagehide', stopAudio);
  renderWords();
})();
