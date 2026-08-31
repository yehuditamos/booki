const assert = require('node:assert/strict');

global.window = {};
require('../booki-local-listening.js');

const createDetector = window.BookiLocalListening._createDetector;

function feed(detector, { rms, from, to, step = 20, neededMs = 360 }) {
  const results = [];
  for (let at = from; at < to; at += step) {
    results.push(detector.process(rms, step, at, neededMs));
  }
  return results;
}

{
  const detector = createDetector();
  feed(detector, { rms:.01, from:0, to:900 });
  const startupNoise = feed(detector, { rms:.7, from:900, to:1400 });
  assert.equal(startupNoise.some(state => state.confirmed), false,
    'startup noise must not confirm the first word');
  assert.equal(detector.snapshot().armed, false,
    'the detector must wait for quiet after startup');

  feed(detector, { rms:.01, from:1400, to:1700 });
  assert.equal(detector.snapshot().armed, true, 'quiet should arm listening');

  const reading = feed(detector, { rms:.09, from:1700, to:3300 });
  assert.ok(reading.filter(state => state.confirmed).length >= 3,
    'continuous near speech should keep advancing through words');
}

{
  const detector = createDetector();
  feed(detector, { rms:.01, from:0, to:1200 });
  assert.equal(detector.snapshot().armed, true);
  const quiet = feed(detector, { rms:.02, from:1200, to:2400 });
  assert.equal(quiet.some(state => state.confirmed), false,
    'room noise must never color a word');
}

{
  const detector = createDetector();
  feed(detector, { rms:.01, from:0, to:1200 });
  assert.equal(detector.snapshot().armed, true);
  const softReading = feed(detector, { rms:.028, from:1200, to:2000 });
  assert.ok(softReading.some(state => state.confirmed),
    'a child reading softly should be detected without shouting');
}

console.log('booki local listening detector: all tests passed');
