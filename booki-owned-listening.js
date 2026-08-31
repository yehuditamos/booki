(() => {
  'use strict';

  const DISPLAY_TEXT = 'בַּבֹּקֶר נֹעַם יָצָא לַגִּנָּה. הוּא רָאָה פַּרְפַּר כָּחֹל עָף מֵעַל הַפְּרָחִים. נֹעַם עָמַד בְּשֶׁקֶט וְחִכָּה שֶׁהַפַּרְפַּר יִתְקָרֵב.';
  const TOKEN_ENDPOINT = '/api/deepgram-token';
  const MAX_SESSION_MS = 10 * 60 * 1000;
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
  let sessionTimer = null;
  let listening = false;
  let engineReady = false;
  let voiceActive = false;
  let lastVoiceAt = 0;
  let noiseFloor = .012;
  let finalTranscript = '';
  let interimTranscript = '';

  function consumeAccessCode() {
    const params = new URLSearchParams(location.search);
    const supplied = params.get('code');
    if (supplied) {
      sessionStorage.setItem('booki_omri_test_code', supplied);
      params.delete('code');
      const next = `${location.pathname}${params.toString() ? `?${params}` : ''}${location.hash}`;
      history.replaceState(null, '', next);
    }
    return supplied || sessionStorage.getItem('booki_omri_test_code') || '';
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

  function measureRms() {
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let energy = 0;
    for (const value of data) {
      const sample = (value - 128) / 128;
      energy += sample * sample;
    }
    return Math.sqrt(energy / data.length);
  }

  function updateMeter() {
    if (!listening || !analyser) return;
    const rms = measureRms();
    const threshold = Math.max(.018, noiseFloor * 2.15);
    voiceActive = engineReady && rms > threshold;
    if (voiceActive) lastVoiceAt = performance.now();
    else if (engineReady) noiseFloor = noiseFloor * .992 + Math.min(rms, threshold) * .008;
    card.classList.toggle('voice-active', voiceActive);
    const level = Math.min(1, Math.max(0, (rms - noiseFloor) * 12));
    meterBars.forEach((bar, index) => {
      const shape = 1 - Math.abs(index - 2) * .16;
      bar.style.setProperty('--meter', String(1 + level * 3.7 * shape));
    });
    meterFrame = requestAnimationFrame(updateMeter);
  }

  async function calibrateAmbient() {
    statusEl.textContent = 'רגע, בוקי מכוון את האוזניים...';
    const samples = [];
    const startedAt = performance.now();
    while (performance.now() - startedAt < 900) {
      samples.push(measureRms());
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    samples.sort((a, b) => a - b);
    const quietIndex = Math.max(0, Math.floor(samples.length * .65) - 1);
    noiseFloor = Math.max(.006, Math.min(.045, samples[quietIndex] || .012));
  }

  async function requestListeningToken(accessCode) {
    const response = await fetch(TOKEN_ENDPOINT, {
      method:'POST',
      headers:{ 'X-Booki-Test-Code':accessCode },
      cache:'no-store',
      credentials:'same-origin',
    });
    let payload = {};
    try { payload = await response.json(); } catch (_) {}
    if (response.status === 402 || payload.error === 'free_credit_finished') {
      const error = new Error('free_credit_finished');
      error.code = 'free_credit_finished';
      throw error;
    }
    if (response.status === 403) {
      const error = new Error('private_test_only');
      error.code = 'private_test_only';
      throw error;
    }
    if (!response.ok || !payload.accessToken) throw new Error('token_unavailable');
    return payload.accessToken;
  }

  function deepgramUrl(sampleRate) {
    const params = new URLSearchParams({
      model:'nova-3',
      language:'he',
      encoding:'linear16',
      sample_rate:String(sampleRate),
      channels:'1',
      interim_results:'true',
      endpointing:'280',
      utterance_end_ms:'1000',
      vad_events:'true',
      smart_format:'false',
      punctuate:'false',
      mip_opt_out:'true',
    });
    return `wss://api.deepgram.com/v1/listen?${params}`;
  }

  function waitForOpen(webSocket) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('engine_timeout')), 12_000);
      webSocket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once:true });
      webSocket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('engine_connection')); }, { once:true });
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

  function transcriptFrom(message) {
    const alternative = message?.channel?.alternatives?.[0];
    if (!alternative) return '';
    if (Array.isArray(alternative.words) && alternative.words.length) {
      return alternative.words
        .filter(word => Number(word.confidence ?? 1) >= .52)
        .map(word => String(word.punctuated_word || word.word || '').trim())
        .filter(Boolean)
        .join(' ');
    }
    return String(alternative.transcript || '').trim();
  }

  function applyDeepgramMessage(event) {
    let message;
    try { message = JSON.parse(event.data); } catch (_) { return; }
    if (message.type !== 'Results') return;
    const transcript = transcriptFrom(message);
    if (!transcript) return;
    if (!lastVoiceAt || performance.now() - lastVoiceAt > 2800) return;

    if (message.is_final) {
      finalTranscript = `${finalTranscript} ${transcript}`.trim();
      interimTranscript = '';
    } else {
      interimTranscript = transcript;
    }
    const combined = `${finalTranscript} ${interimTranscript}`.trim();
    const confirmed = matcher.applyTranscript(combined);
    if (confirmed.length) refreshWords();
    if (matcher.complete) completeReading();
  }

  async function startListening() {
    clearError();
    const accessCode = consumeAccessCode();
    if (!accessCode) return showError('קישור הבדיקה הפרטי אינו שלם.');
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
      return showError('המכשיר הזה אינו תומך עדיין במנוע ההאזנה.');
    }

    try {
      statusEl.textContent = 'בוקי מתכונן להקשיב...';
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
      listening = true;
      engineReady = false;
      voiceActive = false;
      lastVoiceAt = 0;
      card.classList.add('is-listening');
      listenLabel.textContent = 'סיימתי לקרוא';
      refreshWords();
      meterFrame = requestAnimationFrame(updateMeter);

      await calibrateAmbient();
      await connectCapture();
      const accessToken = await requestListeningToken(accessCode);
      socket = new WebSocket(deepgramUrl(context.sampleRate), ['token', accessToken]);
      socket.binaryType = 'arraybuffer';
      socket.addEventListener('message', applyDeepgramMessage);
      socket.addEventListener('close', event => {
        if (listening && event.code !== 1000) {
          showError('ההאזנה נעצרה. אם הקרדיט החינמי הסתיים, בוקי לא יחויב.');
        }
      });
      await waitForOpen(socket);
      engineReady = true;
      statusEl.textContent = 'בוקי שומע אותך';
      sessionTimer = setTimeout(() => stopListening(), MAX_SESSION_MS);
    } catch (error) {
      stopAudio();
      if (error?.name === 'NotAllowedError') showError('כדי שבוקי ישמע, צריך לאשר גישה למיקרופון.');
      else if (error?.code === 'free_credit_finished') showError('הקרדיט החינמי של הבדיקה הסתיים. בוקי לא חויב.');
      else if (error?.code === 'private_test_only') showError('קישור הבדיקה הפרטי אינו תקין.');
      else showError('ההאזנה אינה זמינה כרגע. נסי שוב.');
    }
  }

  function stopAudio() {
    listening = false;
    engineReady = false;
    voiceActive = false;
    card.classList.remove('is-listening', 'voice-active');
    if (meterFrame) cancelAnimationFrame(meterFrame);
    if (sessionTimer) clearTimeout(sessionTimer);
    meterFrame = sessionTimer = null;
    try {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type:'CloseStream' }));
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
    finalTranscript = '';
    interimTranscript = '';
    listenBtn.hidden = false;
    listenLabel.textContent = 'בוקי, תקשיב לי קורא';
    resetBtn.hidden = true;
    statusEl.textContent = 'מוכנים לקרוא יחד';
    clearError();
    refreshWords();
  }

  function showError(message) {
    if (listening) stopAudio();
    errorEl.textContent = message;
    errorEl.hidden = false;
    statusEl.textContent = 'בוא ננסה שוב';
  }

  function clearError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  listenBtn.addEventListener('click', () => listening ? stopListening() : startListening());
  resetBtn.addEventListener('click', resetReading);
  window.addEventListener('pagehide', stopAudio);
  consumeAccessCode();
  renderWords();
})();
