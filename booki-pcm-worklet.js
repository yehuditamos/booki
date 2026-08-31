class BookiPcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pending = [];
    this.pendingLength = 0;
    this.chunkSamples = Math.max(2048, Math.round(sampleRate * 0.18));
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel?.length) return true;
    const copy = new Float32Array(channel);
    this.pending.push(copy);
    this.pendingLength += copy.length;
    if (this.pendingLength < this.chunkSamples) return true;

    const pcm = new Int16Array(this.pendingLength);
    let offset = 0;
    for (const block of this.pending) {
      for (let index = 0; index < block.length; index++) {
        const sample = Math.max(-1, Math.min(1, block[index]));
        pcm[offset++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
    }
    this.pending = [];
    this.pendingLength = 0;
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}

registerProcessor('booki-pcm-capture', BookiPcmCapture);
