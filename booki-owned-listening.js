(() => {
  'use strict';

  const DISPLAY_TEXT = 'בַּבֹּקֶר נֹעַם יָצָא לַגִּנָּה. הוּא רָאָה פַּרְפַּר כָּחֹל עָף מֵעַל הַפְּרָחִים. נֹעַם עָמַד בְּשֶׁקֶט וְחִכָּה שֶׁהַפַּרְפַּר יִתְקָרֵב.';
  const card = document.querySelector('.owned-card');
  const textEl = document.getElementById('owned-reading-text');
  const statusEl = document.getElementById('owned-status');
  const errorEl = document.getElementById('owned-error');
  const listenBtn = document.getElementById('owned-listen-button');
  const listenLabel = document.getElementById('owned-listen-label');
  const resetBtn = document.getElementById('owned-reset-button');
  const meterBars = [...document.querySelectorAll('#owned-meter i')];
  const matcher = new window.BookiWordMatcher(DISPLAY_TEXT, {
    searchAhead:5,
    searchBehind:2,
    minEvidenceWords:2,
    finishOnFinalWord:true,
    currentFromAnchor:true,
  });

  let stream = null;
  let context = null;
  let source = null;
  let analyser = null;
  let processor = null;
  let silentGain = null;
  let meterFrame = null;
  let socket = null;
  let listening = false;
  let engineReady = false;

  function engineUrl() {
    const configured = document.querySelector('meta[name="booki-owned-engine-url"]')?.content?.trim() || '';
    if (configured) return configured;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return new URLSearchParams(location.search).get('engine') || '';
    }
    return '';
  }

  function consumeAccessCode() {
    const params = new URLSearchParams(location.search);
    const supplied = params.get('code');
    if (supplied) {
      sessionStorage.setItem('booki_owned_engine_code', supplied);
      params.delete('code');
      const next = `${location.pathname}${params.toString() ? `?${params}` : ''}${location.hash}`;
      history.replaceState(null, '', next);
    }
    return supplied || sessionStorage.getItem('booki_owned_engine_code') || '';
  }

  function renderWords() {
    textEl.replaceChildren(...matcher.displayWords.map((word, index) => {
      const span = document.createElement('span');
      span.className = 'owned-word';
      span.dataset.index = String(index);
      span.textContent = word;
      return span;
    }));
    refreshWords();
  }

  function refreshWords() {
    const current = matcher.nextUnconfirmed();
    [...textEl.children].forEach((element, index) => {
      element.classList.toggle('is-confirmed', matcher.confirmed.has(index));
      element.classList.toggle('is-current', listening && index === current);
    });
  }

  function updateMeter() {
    if (!listening || !analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let energy = 0;
    for (const value of data) {
      const sample = (value - 128) / 128;
      energy += sample * sample;
    }
    const rms = Math.sqrt(energy / data.length);
    const level = Math.min(1, Math.max(0, (rms - .012) * 11));
    card.classList.toggle('voice-active', rms > .025);
    meterBars.forEach((bar, index) => {
      const shape = 1 - Math.abs(index - 2) * .16;
      bar.style.setProperty('--meter', String(1 + level * 3.7 * shape));
    });
    meterFrame = requestAnimationFrame(updateMeter);
  }

  function waitForOpen(ws) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('engine_timeout')), 12_000);
      ws.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once:true });
      ws.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('engine_connection')); }, { once:true });
    });
  }

  async function connectCapture() {
    await context.audioWorklet.addModule('booki-pcm-worklet.js?v=1');
    processor = new AudioWorkletNode(context, 'booki-pcm-capture');
    processor.port.onmessage = event => {
      if (engineReady && socket?.readyState === WebSocket.OPEN) socket.send(event.data);
    };
    silentGain = context.createGain();
    silentGain.gain.value = 0;
    source.connect(processor);
    processor.connect(silentGain).connect(context.destination);
  }

  async function startListening() {
    clearError();
    const baseUrl = engineUrl();
    const code = consumeAccessCode();
    if (!baseUrl) return showError('מנוע בוקי עדיין לא הופעל בשרת.');
    if (!code) return showError('קישור הבדיקה הפרטי אינו שלם.');
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
      return showError('המכשיר הזה אינו תומך עדיין במנוע ההאזנה.');
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
      await connectCapture();

      socket = new WebSocket(baseUrl);
      socket.binaryType = 'arraybuffer';
      await waitForOpen(socket);
      socket.send(JSON.stringify({
        type:'start',
        accessCode:code,
        sampleRate:context.sampleRate,
        expectedText:DISPLAY_TEXT,
      }));
      socket.addEventListener('message', handleEngineMessage);
      socket.addEventListener('close', event => {
        if (listening && event.code !== 1000) showError('החיבור למנוע בוקי נותק.');
      });

      listening = true;
      engineReady = false;
      card.classList.add('is-listening');
      statusEl.textContent = 'בוקי מכין את מנוע העברית...';
      listenLabel.textContent = 'סיימתי לקרוא';
      refreshWords();
      meterFrame = requestAnimationFrame(updateMeter);
    } catch (error) {
      stopAudio();
      if (error?.name === 'NotAllowedError') showError('כדי שבוקי ישמע, צריך לאשר גישה למיקרופון.');
      else showError('מנוע בוקי לא הצליח להתחבר. נסי שוב.');
    }
  }

  function handleEngineMessage(event) {
    let message;
    try { message = JSON.parse(event.data); } catch (_) { return; }
    if (message.type === 'preparing') {
      statusEl.textContent = 'בוקי מכין את מנוע העברית...';
      return;
    }
    if (message.type === 'ready') {
      engineReady = true;
      statusEl.textContent = 'אני שומע אותך';
      return;
    }
    if (message.type === 'transcript' && typeof message.text === 'string') {
      const confirmed = matcher.applyTranscript(message.text);
      if (confirmed.length) refreshWords();
      if (matcher.complete) completeReading();
      return;
    }
    if (message.type === 'error') showError('מנוע בוקי אינו זמין כרגע.');
  }

  function stopAudio() {
    listening = false;
    engineReady = false;
    card.classList.remove('is-listening', 'voice-active');
    if (meterFrame) cancelAnimationFrame(meterFrame);
    meterFrame = null;
    try {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type:'stop' }));
      socket?.close(1000);
    } catch (_) {}
    try { processor?.disconnect(); } catch (_) {}
    try { silentGain?.disconnect(); } catch (_) {}
    try { analyser?.disconnect(); } catch (_) {}
    try { source?.disconnect(); } catch (_) {}
    stream?.getTracks().forEach(track => track.stop());
    context?.close().catch(() => {});
    stream = context = source = analyser = processor = silentGain = socket = null;
    meterBars.forEach(bar => bar.style.setProperty('--meter', '1'));
    refreshWords();
  }

  function stopListening() {
    stopAudio();
    listenLabel.textContent = 'להמשיך לקרוא';
    statusEl.textContent = matcher.confirmed.size ? 'שמעתי אותך קורא!' : 'מוכנים לקרוא יחד';
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
    listenLabel.textContent = 'בוקי, תקשיב לי קורא';
    resetBtn.hidden = true;
    statusEl.textContent = 'מוכנים לקרוא יחד';
    clearError();
    refreshWords();
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
  consumeAccessCode();
  renderWords();
})();
