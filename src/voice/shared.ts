/** Общее для движков записи (`engine`): формат файла, параметры волны, аудиосессия iOS. */

/** Формат записи — Ogg/Opus (`MediaRecorder` не используется), единообразно на всех устройствах. */
export const VOICE_MIME = 'audio/ogg; codecs=opus';

export const LIVE_PEAKS = 160; // хвост столбиков живой волны (с запасом больше, чем влезает в оверлей: рисуется последние `count`)
export const LIVE_BAR_SAMPLES = 2; // один столбик живой волны = максимум за столько замеров (2 × 50 мс = 100 мс)
export const FINAL_PEAKS = 48; // столбиков в итоговой волне сообщения
export const SAMPLE_MS = 50; // период замера громкости

/** iOS: после прослушивания голосового `useVoicePlayback` ставит аудиосессию `playback` — в ней микрофон не пишет (второе голосовое «ничего не делало»). Перед записью возвращаем `play-and-record`; плеер сам вернёт `playback` на следующем воспроизведении. */
export function preferRecordSession(): void {
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== 'play-and-record') session.type = 'play-and-record'; // лишнее переключение перестраивает аудиомаршрут: меняем, только если тип другой
  } catch {
    /* не поддерживается — не страшно */
  }
}

/** Сжимает замеры до `count` столбиков (максимум в каждой корзине), чтобы волна покрывала всю запись, а не последнюю секунду. */
export function resampleWaveform(values: number[], count: number): number[] {
  if (!values.length) return new Array(count).fill(0.05);
  return Array.from({ length: count }, (_, i) => {
    const from = Math.floor((i / count) * values.length);
    const to = Math.max(from + 1, Math.floor(((i + 1) / count) * values.length));
    return Math.max(0.05, ...values.slice(from, to));
  });
}

/** iOS: `play-and-record` (ставится перед записью) уводит воспроизведение на динамик телефона и отключает Bluetooth/A2DP.
 *  Перед проигрыванием возвращаем `playback`. Меняем, только если тип другой. */
export function preferPlaybackSession(): void {
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== 'playback') session.type = 'playback';
  } catch {
    /* не поддерживается — не страшно */
  }
}
