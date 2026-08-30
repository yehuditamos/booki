(() => {
  'use strict';

  const ROOM_CALIBRATION_MS = 900;
  const QUIET_TO_ARM_MS = 260;
  const MIN_NEAR_VOICE_RMS = .045;
  const SILENCE_RESET_MS = 1200;
  const WORD_COOLDOWN_MS = 110;

  let stream = null;
  let context = null;
  let source = null;
  let analyser = null;
  let frame = null;
  let running = false;
  let startedAt = 0;
  let previousAt = 0;
  let roomFloor = .01;
  let detector = null;
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
    return Math.max(300, Math.min(720, 170 + Math.max(2, letters) * 65));
  }

  function createDetector() {
    let floor = .01;
    let armed = false;
    let quietFor = 0;
    let voicedFor = 0;
    let silenceFor = 0;
    let cooldownFor = 0;

    return {
      process(rms, elapsed, sinceStart, neededMs) {
        const calibrating = sinceStart < ROOM_CALIBRATION_MS;
        if (calibrating) {
          // קפיצה חדה של פתיחת המיקרופון אינה רעש חדר ואסור ללמוד ממנה.
          if (rms < MIN_NEAR_VOICE_RMS) floor = Math.max(.006, floor * .9 + rms * .1);
          return { calibrating:true, armed:false, voiceActive:false, confirmed:false, floor };
        }

        const threshold = Math.max(MIN_NEAR_VOICE_RMS, floor * 3.2);
        const voiceActive = rms >= threshold;

        // לא מאשרים אף מילה עד שהיה רגע שקט אחרי פתיחת המיקרופון.
        // כך רעש ההפעלה או דיבור שכבר התחיל בזמן הכיול לא צובעים את המילה הראשונה.
        if (!armed) {
          if (voiceActive) quietFor = 0;
          else quietFor += elapsed;
          if (quietFor >= QUIET_TO_ARM_MS) armed = true;
          return { calibrating:false, armed, voiceActive:false, confirmed:false, floor };
        }

        if (!voiceActive) floor = Math.max(.006, floor * .995 + rms * .005);

        if (cooldownFor > 0) {
          cooldownFor = Math.max(0, cooldownFor - elapsed);
          return { calibrating:false, armed:true, voiceActive, confirmed:false, floor };
        }

        if (voiceActive) {
          voicedFor += elapsed;
          silenceFor = 0;
          if (voicedFor >= neededMs) {
            voicedFor = 0;
            silenceFor = 0;
            cooldownFor = WORD_COOLDOWN_MS;
            return { calibrating:false, armed:true, voiceActive:true, confirmed:true, floor };
          }
        } else if (voicedFor > 0) {
          silenceFor += elapsed;
          if (silenceFor >= SILENCE_RESET_MS) {
            voicedFor = 0;
            silenceFor = 0;
          }
        }

        return { calibrating:false, armed:true, voiceActive, confirmed:false, floor };
      },
      resetProgress() {
        voicedFor = 0;
        silenceFor = 0;
        cooldownFor = 0;
      },
      snapshot() { return { floor, armed, quietFor, voicedFor, silenceFor, cooldownFor }; },
    };
  }

  function render(displayText) {
    const el = text();
    if (!el) return;
    const tokens = String(displayText || '').match(/\S+|\s+/g) || [];
    words = tokens.filter(token => !/^\s+$/.test(token));
    wordIndex = 0;
    detector?.resetProgress();
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
    const state = detector.process(rms, elapsed, now - startedAt, expectedMs(wordIndex));
    roomFloor = state.floor;

    if (state.calibrating) {
      if (status()) status().textContent = 'בוקי מכוון אוזניים...';
    } else if (!state.armed) {
      ui()?.classList.remove('voice-active');
      if (status()) status().textContent = 'רגע של שקט, ואז מתחילים';
    } else {
      ui()?.classList.toggle('voice-active', state.voiceActive);
      if (state.voiceActive) {
        if (status()) status().textContent = 'אני שומע אותך';
      } else if (status() && wordIndex < words.length) {
        status().textContent = 'בוקי שומע אותך';
      }

      const level = Math.min(1, Math.max(0, (rms - roomFloor) * 11));
      bars().forEach((bar, index) => {
        const shape = 1 - Math.abs(index - 2) * .16;
        bar.style.setProperty('--meter', String(1 + level * 3.5 * shape));
      });
      if (state.confirmed && wordIndex < words.length) confirmWord();
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
      detector = createDetector();
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
    detector = null;
    ui()?.classList.remove('voice-active');
    if (hide && ui()) ui().hidden = true;
    bars().forEach(bar => bar.style.setProperty('--meter', '1'));
    refreshWords();
  }

  window.BookiLocalListening = { isEnabled, render, start, stop, _createDetector:createDetector };
})();
