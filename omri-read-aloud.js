(() => {
  'use strict';

  const DISPLAY_TEXT = 'בַּבֹּקֶר נֹעַם יָצָא לַגִּנָּה. הוּא רָאָה פַּרְפַּר כָּחֹל עָף מֵעַל הַפְּרָחִים. נֹעַם עָמַד בְּשֶׁקֶט וְחִכָּה שֶׁהַפַּרְפַּר יִתְקָרֵב.';
  const TARGET_SAMPLE_RATE = 16000;

  const card = document.querySelector('.listen-card');
  const textEl = document.getElementById('reading-text');
  const statusEl = document.getElementById('listen-status');
  const errorEl = document.getElementById('listen-error');
  const listenBtn = document.getElementById('listen-button');
  const listenLabel = document.getElementById('listen-button-label');
  const resetBtn = document.getElementById('reset-button');
  const meterBars = [...document.querySelectorAll('#listening-meter i')];

  let mediaStream = null;
  let audioContext = null;
  let analyser = null;
  let processor = null;
  let source = null;
  let silentGain = null;
  let socket = null;
  let meterFrame = null;
  let listening = false;
  const matcher = new window.BookiWordMatcher(DISPLAY_TEXT, { searchAhead:5, searchBehind:2 });

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

  function nextUnconfirmed() {
    return matcher.nextUnconfirmed();
  }

  function refreshWordStates() {
    const current = nextUnconfirmed();
    [...textEl.children].forEach((el, index) => {
      el.classList.toggle('is-confirmed', matcher.confirmed.has(index));
      el.classList.toggle('is-current', listening && index === current);
    });
  }

  function applyTranscript(transcript) {
    matcher.applyTranscript(transcript);
    refreshWordStates();
    if (matcher.complete) completeReading();
  }

  function downsampleToInt16(input, inputRate) {
    const ratio = inputRate / TARGET_SAMPLE_RATE;
    const length = Math.max(1, Math.floor(input.length / ratio));
    const output = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(input.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = start; j < end; j++) sum += input[j];
      const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
      output[i] = sample < 0 ? sample * 32768 : sample * 32767;
    }
    return output.buffer;
  }

  function updateMeter() {
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let energy = 0;
    for (const value of data) { const v = (value - 128) / 128; energy += v * v; }
    const rms = Math.sqrt(energy / data.length);
    const level = Math.min(1, rms * 7.5);
    card.classList.toggle('voice-active', level > .08);
    meterBars.forEach((bar, index) => {
      const shape = 1 - Math.abs(index - 2) * .16;
      bar.style.setProperty('--meter', String(1 + level * 3.6 * shape));
    });
    meterFrame = requestAnimationFrame(updateMeter);
  }

  async function startListening() {
    clearError();
    const baseUrl = String(window.BOOKI_OMRI_SPEECH_WS || '').trim();
    const token = new URLSearchParams(location.search).get('token') || '';
    if (!baseUrl) return showError('שירות ההקשבה עדיין לא הופעל.');
    if (!token) return showError('הקישור הפרטי אינו מלא.');
    if (!navigator.mediaDevices?.getUserMedia) return showError('המכשיר הזה לא מאפשר פתיחת מיקרופון בדפדפן.');

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio:{ channelCount:1, echoCancellation:true, noiseSuppression:true, autoGainControl:true }, video:false });
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
      source = audioContext.createMediaStreamSource(mediaStream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      processor = audioContext.createScriptProcessor(4096, 1, 1);
      silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      source.connect(analyser);
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);

      socket = new WebSocket(`${baseUrl}?token=${encodeURIComponent(token)}`);
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        listening = true;
        card.classList.add('is-listening');
        statusEl.textContent = 'אני שומע אותך';
        listenLabel.textContent = 'סיימתי לקרוא';
        refreshWordStates();
        updateMeter();
      };
      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'transcript') applyTranscript(message.transcript);
          if (message.type === 'error') showError(message.message || 'לא הצלחתי להבין. נסה שוב.');
        } catch (_) {}
      };
      socket.onerror = () => showError('לא הצלחתי להתחבר להקשבה. נסה שוב.');
      socket.onclose = event => {
        if (listening && event.code !== 1000) showError('ההקשבה נעצרה. אפשר לנסות שוב.');
        stopAudioOnly();
      };
      processor.onaudioprocess = event => {
        if (socket?.readyState !== WebSocket.OPEN) return;
        socket.send(downsampleToInt16(event.inputBuffer.getChannelData(0), audioContext.sampleRate));
      };
    } catch (error) {
      stopAudioOnly();
      if (error?.name === 'NotAllowedError') showError('כדי שבוקי ישמע, צריך לאשר גישה למיקרופון.');
      else showError('לא הצלחתי לפתוח את המיקרופון. נסה שוב.');
    }
  }

  function stopAudioOnly() {
    listening = false;
    card.classList.remove('is-listening', 'voice-active');
    if (meterFrame) cancelAnimationFrame(meterFrame);
    meterFrame = null;
    if (processor) processor.onaudioprocess = null;
    try { processor?.disconnect(); } catch (_) {}
    try { analyser?.disconnect(); } catch (_) {}
    try { source?.disconnect(); } catch (_) {}
    try { silentGain?.disconnect(); } catch (_) {}
    mediaStream?.getTracks().forEach(track => track.stop());
    audioContext?.close().catch(() => {});
    mediaStream = audioContext = analyser = processor = source = silentGain = null;
    meterBars.forEach(bar => bar.style.setProperty('--meter', '1'));
    refreshWordStates();
  }

  function stopListening() {
    if (socket?.readyState === WebSocket.OPEN) socket.close(1000, 'reader stopped');
    socket = null;
    stopAudioOnly();
    listenLabel.textContent = 'בוקי, תקשיב לי קורא';
    statusEl.textContent = matcher.confirmed.size ? 'שמעתי אותך קורא!' : 'כשאתה מוכן, לחץ על הכפתור.';
    resetBtn.hidden = matcher.confirmed.size === 0;
  }

  function completeReading() {
    statusEl.textContent = 'שמעתי אותך קורא!';
    resetBtn.hidden = false;
    listenBtn.hidden = true;
    setTimeout(stopListening, 350);
  }

  function resetReading() {
    stopListening();
    matcher.reset();
    listenBtn.hidden = false;
    resetBtn.hidden = true;
    statusEl.textContent = 'כשאתה מוכן, לחץ על הכפתור.';
    refreshWordStates();
  }

  function showError(message) { errorEl.textContent = message; errorEl.hidden = false; statusEl.textContent = 'בוא ננסה שוב'; }
  function clearError() { errorEl.hidden = true; errorEl.textContent = ''; }

  listenBtn.addEventListener('click', () => listening ? stopListening() : startListening());
  resetBtn.addEventListener('click', resetReading);
  window.addEventListener('pagehide', stopListening);
  renderWords();
})();
