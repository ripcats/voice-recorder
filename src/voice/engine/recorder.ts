import { CAPTURE_WORKLET_URL, OPUS_APPLICATION } from './config';
import type { VoiceSettings } from '../types';

/** Запись через WebCodecs: PCM из Web Audio (AudioWorklet) → AudioEncoder (Opus). Здесь только пакеты и метаданные;
    файл собирает `segments.ts` через mediabunny. Без запасных кодеков: нет WebCodecs или Opus — запись не стартует с ошибкой. */

const TAIL_EMPTY = new Float32Array(0);

/** Результат одного отрезка: Opus-пакеты и метаданные кодера (в них OpusHead). */
export type OpusSegment = { packets: Uint8Array[]; meta: EncodedAudioChunkMetadata };

const loading = new WeakMap<BaseAudioContext, Promise<void>>();

/** Модуль захвата регистрируем один раз на контекст: повторная регистрация того же процессора запрещена. */
export function loadCapture(ctx: BaseAudioContext): Promise<void> {
  let promise = loading.get(ctx);
  if (!promise) {
    promise = ctx.audioWorklet.addModule(CAPTURE_WORKLET_URL).catch((error) => {
      loading.delete(ctx); // попробуем снова при следующей записи
      throw error;
    });
    loading.set(ctx, promise);
  }
  return promise;
}

function opusConfig(sampleRate: number, settings: VoiceSettings): AudioEncoderConfig {
  return {
    codec: 'opus',
    sampleRate,
    numberOfChannels: 1,
    bitrate: settings.bitrate,
    opus: { application: OPUS_APPLICATION, frameDuration: settings.frameMs * 1000 },
  } as AudioEncoderConfig;
}

export class VoiceRecorder {
  private encoder: AudioEncoder | null = null;
  private node: AudioWorkletNode | null = null;
  private packets: Uint8Array[] = [];
  private meta: EncodedAudioChunkMetadata | null = null;
  private sampleRate = 0;
  private frames = 0; // сэмплов отправлено в кодер: из них считается метка времени каждого кадра
  private accepting = false; // принимаем кадры из воркера (после запроса остановки — нет)
  private resolveTail: ((samples: Float32Array) => void) | null = null;
  private closed = false;

  private readonly source: MediaStreamAudioSourceNode;
  private readonly settings: VoiceSettings;

  constructor(source: MediaStreamAudioSourceNode, settings: VoiceSettings) {
    this.source = source;
    this.settings = settings;
  }

  async start(): Promise<void> {
    if (typeof AudioEncoder === 'undefined' || typeof AudioWorkletNode === 'undefined') {
      throw new Error('Браузер не поддерживает WebCodecs, запись недоступна');
    }
    const ctx = this.source.context;
    const config = opusConfig(ctx.sampleRate, this.settings);
    const support = await AudioEncoder.isConfigSupported(config);
    if (!support.supported) {
      throw new Error('Этот браузер не поддерживает кодек Opus в WebCodecs');
    }
    await loadCapture(ctx);
    if (this.closed) {
      return; // запись отменили, пока грузился модуль
    }

    this.sampleRate = ctx.sampleRate;
    this.encoder = new AudioEncoder({
      output: (chunk, metadata) => {
        const packet = new Uint8Array(chunk.byteLength);
        chunk.copyTo(packet);
        this.packets.push(packet);
        if (!this.meta && metadata?.decoderConfig) {
          this.meta = metadata;
        }
      },
      error: (error) => console.warn('[Opus] ошибка кодера', error),
    });
    this.encoder.configure(config);

    this.node = new AudioWorkletNode(ctx, 'pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: 'explicit', // стерео с микрофона сводим в моно
      processorOptions: { frameSamples: Math.round((ctx.sampleRate * this.settings.frameMs) / 1000) },
    });
    this.node.port.onmessage = this.onWorklet;
    this.accepting = true;
    this.source.connect(this.node);
  }

  /** Останавливает захват, кодирует остаток и отдаёт пакеты отрезка (`null` — данных нет). */
  async stop(): Promise<OpusSegment | null> {
    const { encoder, node } = this;
    if (!encoder || !node) {
      return null;
    }
    const tail = await this.drainWorklet();
    this.detach();
    this.encodeSamples(tail);
    try {
      await encoder.flush();
    } catch (error) {
      console.warn('[Opus] не удалось доиграть кодер', error);
    }
    if (!this.packets.length || !this.meta?.decoderConfig?.description) {
      return null; // без описания (OpusHead) mediabunny файл не соберёт
    }
    return { packets: this.packets, meta: this.meta };
  }

  /** Закрывает рекордер; переданный снаружи sourceNode, поток и контекст не трогает. Повторный вызов безопасен. */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.accepting = false;
    this.resolveTail = null;
    this.detach();
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.disconnect();
      this.node.port.close();
    }
    if (this.encoder && this.encoder.state !== 'closed') {
      this.encoder.close();
    }
    this.node = null;
    this.encoder = null;
  }

  private onWorklet = ({ data }: MessageEvent): void => {
    if (data.type === 'frame') {
      if (this.accepting) {
        this.encodeSamples(data.samples);
      }
    } else if (data.type === 'tail') {
      this.accepting = false;
      const resolve = this.resolveTail;
      this.resolveTail = null;
      resolve?.(data.samples);
    }
  };

  /** Просит воркер отдать недобранный кадр. Не ждёт вечно: по таймауту — пустой остаток. */
  private drainWorklet(): Promise<Float32Array> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.accepting = false;
        this.resolveTail = null;
        resolve(TAIL_EMPTY);
      }, this.settings.tailTimeoutMs);
      this.resolveTail = (samples) => {
        window.clearTimeout(timer);
        resolve(samples);
      };
      this.node?.port.postMessage({ type: 'flush' });
    });
  }

  private detach(): void {
    if (!this.node) {
      return;
    }
    try {
      this.source.disconnect(this.node); // только наше подключение: анализатор (meter) остаётся
    } catch {
      /* уже отключено */
    }
  }

  private encodeSamples(samples: Float32Array): void {
    const encoder = this.encoder;
    if (!encoder || encoder.state !== 'configured' || !samples.length) {
      return;
    }
    const audio = new AudioData({
      format: 'f32-planar',
      sampleRate: this.sampleRate,
      numberOfFrames: samples.length,
      numberOfChannels: 1,
      timestamp: Math.round((this.frames / this.sampleRate) * 1e6),
      data: samples,
    });
    this.frames += samples.length;
    encoder.encode(audio);
    audio.close();
  }
}

/** Создаёт рекордер на переданном источнике (поток и контекст принадлежат движку). */
export function createRecorder(sourceNode: MediaStreamAudioSourceNode, settings: VoiceSettings): VoiceRecorder {
  return new VoiceRecorder(sourceNode, settings);
}

/** Останавливает рекордер и отдаёт пакеты отрезка (`null` — данных нет). Завершается всегда: при ошибке отдаёт `null`, а не виснет. */
export function stopRecorder(rec: VoiceRecorder): Promise<OpusSegment | null> {
  return rec.stop().catch((error) => {
    console.warn('[Opus] остановка записи не удалась', error);
    return null;
  });
}

/** Останавливает рекордер без результата (cancel). */
export function discardRecorder(rec: VoiceRecorder): void {
  rec.close();
}

/** Закрывает рекордер; переданный снаружи sourceNode, поток и контекст не трогает. */
export function closeRecorder(rec: VoiceRecorder | null): void {
  rec?.close();
}
