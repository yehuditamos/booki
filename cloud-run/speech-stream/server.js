'use strict';

const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const speech = require('@google-cloud/speech');

const PORT = Number(process.env.PORT || 8080);
const PRIVATE_TEST_TOKEN = process.env.PRIVATE_TEST_TOKEN || '';
const ALLOWED_ORIGINS = new Set(String(process.env.ALLOWED_ORIGINS || 'https://yehuditamos.github.io')
  .split(',').map(value => value.trim()).filter(Boolean));
const MAX_CONNECTION_MS = 5 * 60 * 1000;
const MAX_AUDIO_BYTES = 16_000 * 2 * 60 * 5;

if (!PRIVATE_TEST_TOKEN) throw new Error('PRIVATE_TEST_TOKEN is required');

const app = express();
app.disable('x-powered-by');
app.get('/healthz', (_req, res) => res.status(200).json({ ok:true }));
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer:true, maxPayload:128 * 1024 });
const speechClient = new speech.SpeechClient();

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

server.on('upgrade', (request, socket, head) => {
  let url;
  try { url = new URL(request.url, `http://${request.headers.host}`); }
  catch (_) { socket.destroy(); return; }
  const origin = request.headers.origin || '';
  if (url.pathname !== '/listen' || !ALLOWED_ORIGINS.has(origin)
      || !safeEqual(url.searchParams.get('token'), PRIVATE_TEST_TOKEN)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws));
});

wss.on('connection', ws => {
  let audioBytes = 0;
  let closed = false;
  const recognizeStream = speechClient.streamingRecognize({
    config: {
      encoding:'LINEAR16',
      sampleRateHertz:16000,
      languageCode:'he-IL',
      enableAutomaticPunctuation:false,
      model:'latest_long',
    },
    interimResults:true,
    singleUtterance:false,
  });

  const timeout = setTimeout(() => closeAll(1000, 'time limit'), MAX_CONNECTION_MS);

  function closeAll(code, reason) {
    if (closed) return;
    closed = true;
    clearTimeout(timeout);
    try { recognizeStream.end(); } catch (_) {}
    if (ws.readyState === ws.OPEN) ws.close(code, reason);
  }

  recognizeStream.on('data', data => {
    if (closed || ws.readyState !== ws.OPEN) return;
    for (const result of data.results || []) {
      const transcript = result.alternatives?.[0]?.transcript?.trim();
      if (transcript) ws.send(JSON.stringify({ type:'transcript', transcript, final:!!result.isFinal }));
    }
  });
  recognizeStream.on('error', error => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type:'error', message:'ההקשבה נעצרה. נסה שוב.' }));
    // לא רושמים שמע או תמליל. רק קוד שירות לצורך אבחון תפעולי.
    console.error('speech_stream_error', error.code || 'unknown');
    closeAll(1011, 'speech service error');
  });
  ws.on('message', (chunk, isBinary) => {
    if (!isBinary || closed) return;
    audioBytes += chunk.length;
    if (audioBytes > MAX_AUDIO_BYTES) { closeAll(1009, 'audio limit'); return; }
    recognizeStream.write(chunk);
  });
  ws.on('close', () => closeAll(1000, 'client closed'));
  ws.on('error', () => closeAll(1011, 'websocket error'));
});

server.listen(PORT, '0.0.0.0', () => console.log(`booki-speech-stream listening on ${PORT}`));
