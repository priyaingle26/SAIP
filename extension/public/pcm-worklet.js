// AudioWorklet: converts float32 mic input to PCM16 and posts ~40ms batches.
//
// Shipped as a static extension-origin file (loaded via chrome.runtime.getURL)
// rather than a blob: URL — the extension CSP (`script-src 'self'`) blocks blob
// scripts, which previously forced a silent fallback to the deprecated
// ScriptProcessorNode.
//
// process() fires every 128-sample render quantum (~5ms @ 24kHz). Posting each
// quantum is a "micro-burst" storm OpenAI flags as a cause of 1006 disconnects,
// so we accumulate into ~40ms chunks (960 samples) before posting.
class Pcm16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Int16Array(0);
    this._target = 960; // ~40ms @ 24kHz
  }

  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;

    const incoming = new Int16Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      incoming[i] = Math.max(-32768, Math.min(32767, (ch[i] * 32767) | 0));
    }

    const merged = new Int16Array(this._buf.length + incoming.length);
    merged.set(this._buf, 0);
    merged.set(incoming, this._buf.length);
    this._buf = merged;

    if (this._buf.length >= this._target) {
      this.port.postMessage({ pcm: this._buf.buffer }, [this._buf.buffer]);
      this._buf = new Int16Array(0);
    }
    return true;
  }
}

registerProcessor('pcm16-processor', Pcm16Processor);
