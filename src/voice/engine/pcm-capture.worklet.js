/* AudioWorklet: собирает моно-кадры фиксированной длины (20 мс) и отдаёт их в основной поток, где их кодирует AudioEncoder (`recorder.ts`). */
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.frameSamples = options.processorOptions.frameSamples;
    this.frame = new Float32Array(this.frameSamples);
    this.filled = 0;
    // запрос на остаток (при остановке): отдаём недобранный кадр и больше не копим
    this.port.onmessage = () => {
      const tail = this.frame.slice(0, this.filled);
      this.filled = 0;
      this.port.postMessage({ type: 'tail', samples: tail }, [tail.buffer]);
    };
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    let offset = 0;
    while (offset < channel.length) {
      const count = Math.min(this.frameSamples - this.filled, channel.length - offset);
      this.frame.set(channel.subarray(offset, offset + count), this.filled);
      this.filled += count;
      offset += count;
      if (this.filled === this.frameSamples) {
        const samples = this.frame.slice();
        this.filled = 0;
        this.port.postMessage({ type: 'frame', samples }, [samples.buffer]);
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCapture);
