(() => {
  'use strict';

  const TOKEN_URL = 'https://booki-omri-listening-test.vercel.app/api/deepgram-token';
  const RATE = 16000;
  const AHEAD = 7;
  const BEHIND = 2;

  let stream, audio, source, analyser, processor, mute, socket, recognition;
  let meterFrame, keepAliveTimer;
  let running = false;
  let stopping = false;
  let engine = null;
  let words = [];
  let normalized = [];
  let confirmed = new Set();
  let anchor = 0;
  let lastFinal = '';
  let lastFinalAt = 0;

  const el = id => document.getElementById(id);
  const panel = () => el('booki-local-listening');
  const status = () => el('booki-listening-status');
  const text = () => el('reader-text');
  const bars = () => [...document.querySelectorAll('#booki-listening-meter i')];

  function readerName() {
    return String(window.currentStudentData?.name
      || (typeof getActiveReader === 'function' ? getActiveReader()?.name : '')
      || '').trim();
  }
  function isEnabled() { return readerName() === 'עומרי'; }
  function say(value) { if (status()) status().textContent = value; }

  function normalizeHebrew(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0591-\u05C7]/g, '')
      .replace(/["'׳״.,!?;:()\[\]{}־–—/\\]/g, ' ')
      .replace(/[^א-ת\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function key(value) { return normalizeHebrew(value).replace(/[וי]/g, ''); }

  function distance(a, b) {
    if (a === b) return 0;
    const row = Array.from({ length:b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let diagonal = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const above = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1,
          diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
        diagonal = above;
      }
    }
    return row[b.length];
  }

  function wordScore(spoken, expected) {
    const a = normalizeHebrew(spoken);
    const b = normalizeHebrew(expected);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const ak = key(a), bk = key(b);
    if (ak && ak === bk) return .96;
    const prefix = /^[ובכלמשה]/;
    if (a.length > 3 && prefix.test(a) && a.slice(1) === b) return .94;
    if (b.length > 3 && prefix.test(b) && b.slice(1) === a) return .94;
    if (ak.length > 3 && prefix.test(ak) && ak.slice(1) === bk) return .91;
    if (bk.length > 3 && prefix.test(bk) && bk.slice(1) === ak) return .91;
    const longest = Math.max(ak.length, bk.length);
    if (longest < 3) return 0;
    const d = distance(ak, bk);
    const similarity = 1 - d / longest;
    if (longest <= 4) return d <= 1 ? similarity : 0;
    return d <= 2 ? similarity : 0;
  }

  function nextNeeded() {
    for (let i = 0; i < words.length; i++) if (!confirmed.has(i)) return i;
    return words.length;
  }

  function bestTarget(spoken, cursor) {
    const from = Math.max(0, cursor - BEHIND);
    const to = Math.min(words.length - 1, cursor + AHEAD);
    let best = { index:-1, score:0 };
    for (let i = from; i <= to; i++) {
      const score = wordScore(spoken, normalized[i]);
      const betterTie = score === best.score && i >= cursor && best.index < cursor;
      if (score > best.score || betterTie) best = { index:i, score };
    }
    return best;
  }

  function applyTranscript(value) {
    const spoken = normalizeHebrew(value).split(' ').filter(Boolean);
    if (!spoken.length || !words.length) return [];
    let cursor = Math.max(0, anchor - BEHIND);
    const candidates = [];
    for (const token of spoken) {
      const match = bestTarget(token, cursor);
      if (match.index < 0 || match.score < .72) continue;
      candidates.push(match);
      cursor = Math.max(cursor, match.index + 1);
    }
    if (!candidates.length) return [];

    const first = nextNeeded();
    const sequence = candidates.some((item, i) => {
      const next = candidates[i + 1];
      return next && next.index > item.index && next.index - item.index <= 2;
    });
    const added = [];
    let furthest = anchor;
    for (const item of candidates) {
      if (!sequence && item.index > first + 1) continue;
      if (!confirmed.has(item.index)) added.push(item.index);
      confirmed.add(item.index);
      furthest = Math.max(furthest, item.index + 1);
    }
    anchor = Math.max(anchor, furthest);
    refresh();
    if (confirmed.size === words.length) say('שמעתי את כל העמוד!');
    else if (added.length) say('כן, אני איתך');
    return added;
  }

  function render(value) {
    const tokens = String(value || '').match(/\S+|\s+/g) || [];
    words = tokens.filter(token => !/^\s+$/.test(token));
    normalized = words.map(normalizeHebrew);
    confirmed = new Set();
    anchor = 0;
    lastFinal = '';
    lastFinalAt = 0;
    const target = text();
    if (target) {
      let index = 0;
      target.replaceChildren(...tokens.map(token => {
        if (/^\s+$/.test(token)) return document.createTextNode(token);
        const span = document.createElement('span');
        span.className = 'reader-word';
        span.dataset.wordIndex = String(index++);
        span.textContent = token;
        return span;
      }));
    }
    refresh();
  }

  function refresh() {
    const current = nextNeeded();
    [...(text()?.children || [])].forEach((node, index) => {
      node.classList.toggle('is-heard', confirmed.has(index));
      node.classList.toggle('is-listening-now', running && index === current);
    });
  }

  function terms() {
    const seen = new Set();
    const result = [];
    for (const item of normalized) {
      const clean = normalizeHebrew(item);
      if (clean.length < 3 || seen.has(clean)) continue;
      seen.add(clean);
      result.push(clean);
      if (result.length === 60) break;
    }
    return result;
  }

  function listenUrl() {
    const q = new URLSearchParams({
      model:'nova-3', language:'he', encoding:'linear16', sample_rate:String(RATE),
      channels:'1', interim_results:'true', punctuate:'false', smart_format:'false',
      endpointing:'300', utterance_end_ms:'1000', vad_events:'true',
      tag:'booki-omri-reading-test'
    });
    terms().forEach(term => q.append('keyterm', term));
    return `wss://api.deepgram.com/v1/listen?${q}`;
  }

  async function token() {
    const response = await fetch(TOKEN_URL, { cache:'no-store', credentials:'omit' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) throw new Error(body.error || `token_${response.status}`);
    return body.access_token;
  }

  function deepgramMessage(event) {
    let data;
    try { data = JSON.parse(event.data); } catch (_) { return; }
    if (data.type === 'SpeechStarted') return say('אני שומע אותך');
    if (data.type !== 'Results') return;
    const transcript = String(data.channel?.alternatives?.[0]?.transcript || '').trim();
    if (!transcript) return;
    panel()?.classList.add('voice-active');
    window.setTimeout(() => panel()?.classList.remove('voice-active'), 220);
    if (!data.is_final) return say('אני שומע אותך');
    const signature = normalizeHebrew(transcript);
    const now = Date.now();
    if (signature && (signature !== lastFinal || now - lastFinalAt > 2500)) {
      lastFinal = signature;
      lastFinalAt = now;
      applyTranscript(transcript);
    }
  }

  function pcm16(input, inputRate) {
    const ratio = inputRate / RATE;
    const output = new Int16Array(Math.max(1, Math.round(input.length / ratio)));
    let from = 0;
    for (let i = 0; i < output.length; i++) {
      const to = Math.min(input.length, Math.round((i + 1) * ratio));
      let sum = 0, count = 0;
      for (; from < to; from++) { sum += input[from]; count++; }
      const sample = Math.max(-1, Math.min(1, count ? sum / count : 0));
      output[i] = sample < 0 ? sample * 32768 : sample * 32767;
    }
    return output.buffer;
  }

  function meter() {
    if (!running || !analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let energy = 0;
    for (const value of data) { const sample = (value - 128) / 128; energy += sample * sample; }
    const level = Math.min(1, Math.sqrt(energy / data.length) * 14);
    bars().forEach((bar, index) => {
      const shape = 1 - Math.abs(index - 2) * .16;
      bar.style.setProperty('--meter', String(1 + level * 3.5 * shape));
    });
    meterFrame = requestAnimationFrame(meter);
  }

  async function startDeepgram(accessToken) {
    stream = await navigator.mediaDevices.getUserMedia({
      audio:{ channelCount:1, echoCancellation:true, noiseSuppression:true, autoGainControl:true },
      video:false
    });
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('audio_context_unsupported');
    audio = new AudioContext();
    await audio.resume();
    source = audio.createMediaStreamSource(stream);
    analyser = audio.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    processor = audio.createScriptProcessor(4096, 1, 1);
    mute = audio.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(audio.destination);

    socket = new WebSocket(listenUrl(), ['bearer', accessToken]);
    socket.binaryType = 'arraybuffer';
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('deepgram_timeout')), 8000);
      socket.addEventListener('open', () => { window.clearTimeout(timeout); resolve(); }, { once:true });
      socket.addEventListener('error', () => { window.clearTimeout(timeout); reject(new Error('deepgram_socket')); }, { once:true });
    });
    socket.addEventListener('message', deepgramMessage);
    socket.addEventListener('close', () => {
      if (running && !stopping) say('ההאזנה נעצרה, פתחו שוב את העמוד');
    });
    keepAliveTimer = window.setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type:'KeepAlive' }));
    }, 4000);
    processor.onaudioprocess = event => {
      if (!running || socket?.readyState !== WebSocket.OPEN) return;
      const data = pcm16(event.inputBuffer.getChannelData(0), audio.sampleRate);
      if (data.byteLength) socket.send(data);
    };
    engine = 'deepgram';
    meterFrame = requestAnimationFrame(meter);
  }

  function startBrowser() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) throw new Error('speech_recognition_unsupported');
    recognition = new Recognition();
    recognition.lang = 'he-IL';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => say('בוקי מקשיב למילים');
    recognition.onspeechstart = () => say('אני שומע אותך');
    recognition.onresult = event => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = String(result?.[0]?.transcript || '').trim();
        if (transcript && result.isFinal) applyTranscript(transcript);
        else if (transcript) say('אני שומע אותך');
      }
    };
    recognition.onerror = event => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') say('כדי שבוקי ישמע צריך לאשר מיקרופון');
      else if (event.error !== 'no-speech' && event.error !== 'aborted') say('לא הצלחתי לזהות את המילים');
    };
    recognition.onend = () => {
      if (!running || stopping || engine !== 'browser') return;
      try { recognition.start(); } catch (_) {}
    };
    engine = 'browser';
    recognition.start();
  }

  async function start() {
    if (!isEnabled() || running || !words.length) return;
    if (panel()) panel().hidden = false;
    running = true;
    stopping = false;
    refresh();
    say('בוקי מתחבר לאוזניים...');
    try {
      await startDeepgram(await token());
      if (running) say('בוקי מקשיב למילים');
    } catch (error) {
      cleanupDeepgram();
      if (!running) return;
      try { startBrowser(); }
      catch (_) {
        running = false;
        refresh();
        say(error?.name === 'NotAllowedError'
          ? 'כדי שבוקי ישמע צריך לאשר מיקרופון'
          : 'לא הצלחתי לחבר זיהוי מילים');
      }
    }
  }

  function cleanupDeepgram() {
    if (meterFrame) cancelAnimationFrame(meterFrame);
    if (keepAliveTimer) window.clearInterval(keepAliveTimer);
    meterFrame = keepAliveTimer = null;
    if (processor) processor.onaudioprocess = null;
    try { processor?.disconnect(); } catch (_) {}
    try { mute?.disconnect(); } catch (_) {}
    try { analyser?.disconnect(); } catch (_) {}
    try { source?.disconnect(); } catch (_) {}
    stream?.getTracks().forEach(track => track.stop());
    audio?.close().catch(() => {});
    try {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type:'CloseStream' }));
      socket?.close();
    } catch (_) {}
    stream = audio = source = analyser = processor = mute = socket = null;
    bars().forEach(bar => bar.style.setProperty('--meter', '1'));
    panel()?.classList.remove('voice-active');
  }

  function stop(hide = true) {
    stopping = true;
    running = false;
    try { if (recognition) recognition.onend = null; recognition?.abort(); } catch (_) {}
    recognition = null;
    cleanupDeepgram();
    engine = null;
    if (hide && panel()) panel().hidden = true;
    refresh();
    stopping = false;
  }

  window.addEventListener('pagehide', () => stop(true));
  window.BookiLocalListening = {
    isEnabled, render, start, stop,
    _normalizeHebrew:normalizeHebrew,
    _wordScore:wordScore,
    _applyTranscriptForTest:applyTranscript,
    _snapshotForTest:() => ({ words:[...words], confirmed:[...confirmed].sort((a,b) => a-b), anchor, running, engine })
  };
})();
