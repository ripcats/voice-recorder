import { LIVE_BAR_SAMPLES, LIVE_PEAKS, SAMPLE_MS } from '../shared';
import type { VoiceSink } from '../types';
import { ANALYSER_FFT_SIZE, LEVEL_GAIN } from './config';

/** Измеритель громкости: `AnalyserNode`, замер каждые `SAMPLE_MS`, столбики живой волны каждые `LIVE_BAR_SAMPLES` замеров. Сэмплы переживают паузу, сбрасываются через `reset()`. */
export function createMeter(sink: Pick<VoiceSink, 'level' | 'peaks'>) {
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let samples: number[] = [];
  let bars: number[] = []; // столбики живой волны: появляются раз в 100 мс и больше не меняются
  let timer = 0;

  /** Подключает поток к анализатору. `reuse` — поток и узлы с прошлого отрезка остались, пересоздавать не нужно. Возвращает источник для рекордера. */
  function attach(ctx: AudioContext, stream: MediaStream, reuse: boolean): MediaStreamAudioSourceNode {
    if (!reuse || !source || !analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = ANALYSER_FFT_SIZE;
      source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
    }
    return source;
  }

  /** Запускает замеры. `onTick` — каждый период, до замера (движок обновляет длительность). */
  function start(onTick: () => void): void {
    sink.peaks(bars.slice(-LIVE_PEAKS));
    const buffer = new Uint8Array(analyser ? analyser.fftSize : ANALYSER_FFT_SIZE);
    timer = window.setInterval(() => {
      onTick();
      if (!analyser) return;
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (const v of buffer) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / buffer.length); // речь обычно 0.01–0.08
      const levelNow = Math.min(rms * LEVEL_GAIN, 1); // фиксированное усиление: по нему же строятся столбики волны и волны вокруг кнопки отправки
      sink.level(levelNow);
      samples.push(levelNow);
      if (samples.length % LIVE_BAR_SAMPLES === 0) {
        bars.push(Math.max(...samples.slice(-LIVE_BAR_SAMPLES)));
        sink.peaks(bars.slice(-LIVE_PEAKS));
      }
    }, SAMPLE_MS);
  }

  function stop(): void {
    window.clearInterval(timer);
  }

  /** Отключает узлы (поток останавливает вызывающий). */
  function detach(): void {
    source?.disconnect();
    analyser?.disconnect();
    source = null;
    analyser = null;
  }

  /** Новая запись: замеры и столбики с нуля. */
  function reset(): void {
    samples = [];
    bars = [];
  }

  return { attach, start, stop, detach, reset, hasNodes: () => !!source && !!analyser, getSamples: () => samples, clearPeaks: () => sink.peaks([]) };
}

export type Meter = ReturnType<typeof createMeter>;
