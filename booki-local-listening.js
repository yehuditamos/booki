(() => {
  'use strict';

  const ROOM_CALIBRATION_MS = 900;
  const MIN_NEAR_VOICE_RMS = .045;
  const SILENCE_RESET_MS = 650;

  let stream = null;
  let context = null;
  let source = null;
  let analyser = null;
  let frame = null;
  let running = false;
  let startedAt = 0;
  let previousAt = 0;
  let roomFloor = .01;
  let readerPeak = 0;
  let voicedFor = 0;
  let silenceFor = 0;
  let wordIndex = 0;
  let words = [];

  const ui = () => document.getElementById('booki-local-listening');
  const status = () => document.getElementById('booki-listening-status');
  const text = () => document.getElementById('reader-text');
  const bars = () => [...document.querySelectorAll('#booki-listening-meter i')];

  function readerName() {
    return String(window.currentStudentData?.name
      || (typeof getActiveReader === 'function' ? getActiveReader()?.name : '')
      || '').trim();
  }

  function isEnabled() {
    return readerName() === 'עומרי';
  }

  function plainLength(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0591-\u05C7]/g, '').replace(/[^א-ת]/g, '').length;
  }

  function expectedMs(index) {
    const letters = plainLength(words[index]);
    return Math.max(390, Math.min(920, 230 + Math.max(2, letters) * 88));
  }

  function render(displayText) {
    const el = text();
    if (!el) return;
    const tokens = String(displayText || '').match(/\S+|\s+/g) || [];
    words = tokens.filter(token => !/^\s+$/.test(token));
    wordIndex = 0;
    voicedFor = 0;
    silenceFor = 0;
    const nodes = [];
    let index = 0;
    tokens.forEach(token => {
      if (/^\s+$/.test(token)) {
        nodes.push(document.createTextNode(token));
        return;
      }
      const span = document.createElement('span');
      span.className = 'reader-word';
      span.dataset.wordIndex = String(index);
      span.textContent = token;
      nodes.push(span);
      index++;
    });
    el.replaceChildren(...nodes);
    refreshWords();
  }

  function refreshWords() {
    [...(text()?.children || [])].forEach((el, index) => {
      el.classList.toggle('is-heard', index < wordIndex);
      el.classList.toggle('is-listening-now', running && index === wordIndex);
    });
  }

  function confirmWord() {
    if (wordIndex >= words.length) return;
    wordIndex++;
    voicedFor = 0;
    silenceFor = 0;
    refreshWords();
    if (wordIndex >= words.length && status()) status().textContent = 'שמעתי אותך קורא!';
  }

  function tick(now) {
    if (!running || !analyser) return;
    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);
    let energy = 0;
    for (const value of samples) {
      const sample = (value - 128) / 128;
      energy += sample * sample;
    }
    const rms = Math.sqrt(energy / samples.length);
    const elapsed = Math.min(100, previousAt ? now - previousAt : 16);
    previousAt = now;
    const calibrating = now - startedAt < ROOM_CALIBRATION_MS;

    if (calibrating) {
      roomFloor = Math.max(.006, roomFloor * .92 + rms * .08);
      if (status()) status().textContent = 'בוקי מכוון אוזניים...';
    } else {
      const baseThreshold = Math.max(MIN_NEAR_VOICE_RMS, roomFloor * 3.2);
      const learnedThreshold = readerPeak > 0 ? readerPeak * .42 : 0;
      const threshold = Math.max(baseThreshold, learnedThreshold);
      const voiceActive = rms >= threshold;
      ui()?.classList.toggle('voice-active', voiceActive);

      if (voiceActive) {
        readerPeak = Math.max(readerPeak * .997, rms);
        voicedFor += elapsed;
        silenceFor = 0;
        if (status()) status().textContent = 'אני שומע אותך';
      } else {
        roomFloor = roomFloor * .995 + rms * .005;
        if (voicedFor > 0) {
          silenceFor += elapsed;
          if (silenceFor > SILENCE_RESET_MS) {
            voicedFor = 0;
            silenceFor = 0;
          }
        }
      }

      const level = Math.min(1, Math.max(0, (rms - roomFloor) * 11));
      bars().forEach((bar, index) => {
        const shape = 1 - Math.abs(index - 2) * .16;
        bar.style.setProperty('--meter', String(1 + level * 3.5 * shape));
      });
      if (voiceActive && wordIndex < words.length && voicedFor >= expectedMs(wordIndex)) confirmWord();
    }
    frame = requestAnimationFrame(tick);
  }

  async function start() {
    if (!isEnabled() || running) return;
    const panel = ui();
    if (panel) panel.hidden = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      if (status()) status().textContent = 'המכשיר לא מאפשר לבוקי להקשיב';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio:{ channelCount:1, echoCancellation:true, noiseSuppression:true, autoGainControl:true },
        video:false,
      });
      context = new (window.AudioContext || window.webkitAudioContext)();
      await context.resume();
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = .35;
      source.connect(analyser);
      running = true;
      startedAt = performance.now();
      previousAt = 0;
      roomFloor = .01;
      readerPeak = 0;
      voicedFor = 0;
      silenceFor = 0;
      refreshWords();
      frame = requestAnimationFrame(tick);
    } catch (error) {
      stop(false);
      if (panel) panel.hidden = false;
      if (status()) status().textContent = error?.name === 'NotAllowedError'
        ? 'כדי שבוקי ישמע צריך לאשר מיקרופון'
        : 'בוקי לא הצליח לפתוח את המיקרופון';
    }
  }

  function stop(hide = true) {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    try { analyser?.disconnect(); } catch (_) {}
    try { source?.disconnect(); } catch (_) {}
    stream?.getTracks().forEach(track => track.stop());
    context?.close().catch(() => {});
    stream = context = source = analyser = null;
    ui()?.classList.remove('voice-active');
    if (hide && ui()) ui().hidden = true;
    bars().forEach(bar => bar.style.setProperty('--meter', '1'));
    refreshWords();
  }

  window.BookiLocalListening = { isEnabled, render, start, stop };
})();
