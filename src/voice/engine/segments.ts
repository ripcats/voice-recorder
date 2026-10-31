import { encodeOggOpus } from '../../utils/ogg-opus-encoder';
import { FINAL_PEAKS, VOICE_MIME, resampleWaveform } from '../shared';
import type { VoiceResult, VoiceSettings } from '../types';
import type { OpusSegment } from './recorder';

/** Отрезки записи: Opus-пакеты всех отрезков идут одним списком, пауза только останавливает их добавление.
    Файл собирается по запросу (`build`) и кэшируется, пока не добавится новый пакет. */
export function createSegments(settings: VoiceSettings) {
  let packets: Uint8Array[] = []; // все пакеты записи, без пауз
  let meta: EncodedAudioChunkMetadata | null = null; // метаданные кодера (OpusHead) — с первого отрезка
  let elapsed = 0; // длительность записанного на паузе, с
  let startTime = 0; // начало текущего отрезка
  let cache: { count: number; blob: Blob } | null = null;

  /** Длительность записи сейчас: готовые отрезки + идущий. */
  const now = (): number => elapsed + (Date.now() - startTime) / 1000;

  return {
    isEmpty: () => !packets.length,
    elapsed: () => elapsed,
    now,
    markStart: () => void (startTime = Date.now()),
    /** Полный сброс: пакеты, метаданные, время и кэш файла. */
    reset(): void {
      packets = [];
      meta = null;
      elapsed = 0;
      cache = null;
    },
    /** Добавляет пакеты остановленного отрезка. Файл не собирает. */
    append(segment: OpusSegment | null): void {
      if (!segment) return;
      for (const packet of segment.packets) packets.push(packet);
      meta ??= segment.meta;
    },
    /** Собирает всё записанное в один Ogg/Opus-файл; повторный вызов без новых пакетов берёт кэш. */
    async build(samples: number[], duration: number): Promise<VoiceResult> {
      const waveform = resampleWaveform(samples, FINAL_PEAKS);
      if (!packets.length || !meta) return { blob: new Blob([], { type: VOICE_MIME }), duration, waveform };
      if (!cache || cache.count !== packets.length) {
        cache = { count: packets.length, blob: await encodeOggOpus(packets, meta, settings.frameMs / 1000) };
      }
      return { blob: cache.blob, duration, waveform };
    },
    /** Пауза: длительность замирает на достигнутом. */
    commit(duration: number): void {
      elapsed = duration;
    },
  };
}

export type Segments = ReturnType<typeof createSegments>;
